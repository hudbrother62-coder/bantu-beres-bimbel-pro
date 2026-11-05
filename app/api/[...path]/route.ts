import { NextRequest, NextResponse } from "next/server";
import { checkDatabase, database } from "../../../lib/db";
import { authenticate, login, logout, register } from "../../../lib/auth";
import * as svc from "../../../lib/service";
import { requestPasswordOtp, verifyPasswordOtp, confirmPasswordReset } from "../../../lib/password-reset";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  let token = req.cookies.get("bb_session")?.value || "";
  try {
    if (req.method !== "GET") {
      const origin = req.headers.get("origin");
      // Check the origin against the hostname actually serving this request.
      // APP_URL can point to the canonical domain while Vercel serves valid aliases.
      // Requiring both to match would reject sign-in and password recovery on aliases.
      const expected = req.nextUrl.origin;
      if (!origin || origin !== expected)
        return NextResponse.json(
          { error: "Asal permintaan ditolak. Periksa APP_URL." },
          { status: 403 },
        );
    }
    if (path === "health") {
      const passwordResetAvailable = Boolean(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM);
      if (!process.env.DATABASE_URL)
        return NextResponse.json(
          { configured: false, connected: false, migrated: false, tables: [], passwordResetAvailable },
          { status: 503 },
        );
      try {
        const status = await checkDatabase();
        return NextResponse.json({ configured: true, ...status, passwordResetAvailable });
      } catch {
        return NextResponse.json(
          {
            configured: true,
            connected: false,
            migrated: false,
            tables: [],
            passwordResetAvailable,
            error: "Koneksi database Neon gagal.",
          },
          { status: 503 },
        );
      }
    }
    if (!process.env.DATABASE_URL)
      return NextResponse.json(
        {
          error:
            "Database belum terhubung. Isi DATABASE_URL dan jalankan migrasi terlebih dahulu.",
        },
        { status: 503 },
      );
    const db = database();
    const input = req.method === "GET" ? {} : await req.json();
    if (req.method === "POST" && (path === "auth/register" || path === "auth/login")) {
      token = path.endsWith("register")
        ? await register(input, db)
        : await login(input, db);
      const res = NextResponse.json({ ok: true });
      res.cookies.set("bb_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 21600,
      });
      return res;
    }
    if (req.method === "POST" && path === "auth/request-otp") {
      await requestPasswordOtp(input, db);
      return NextResponse.json({ ok: true, message: "Jika email terdaftar, kode OTP akan dikirim." }, { headers: { "Cache-Control": "no-store" } });
    }
    if (req.method === "POST" && path === "auth/verify-otp") {
      const result = await verifyPasswordOtp(input, db);
      return NextResponse.json({ ok: true, result }, { headers: { "Cache-Control": "no-store" } });
    }
    if (req.method === "POST" && path === "auth/confirm-reset") {
      token = await confirmPasswordReset(input, db);
      const res = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
      res.cookies.set("bb_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 21600,
      });
      return res;
    }
    const context = await authenticate(token, db);
    if (!context)
      return NextResponse.json(
        { error: "Silakan masuk kembali." },
        { status: 401 },
      );
    const u = context.user as svc.User;
    if (req.method === "POST" && path === "auth/logout") {
      await logout(token, db);
      const res = NextResponse.json({ ok: true });
      res.cookies.delete("bb_session");
      return res;
    }
    let result: any;
    if (req.method === "GET" && path === "state")
      result = await svc.snapshot(
        db,
        u,
        req.nextUrl.searchParams.get("month") ||
          new Date().toISOString().slice(0, 7),
      );
    else if (req.method === "POST" && path === "records")
      result = await svc.saveRecord(
        db,
        u,
        input.kind,
        input.data,
        input.id,
        input.version,
      );
    else if (req.method === "POST" && path === "import")
      result = await svc.bulkImport(db, u, input.kind, input.rows);
    else if (req.method === "POST" && path === "archive")
      result = await svc.archive(db, u, input.ids, input.action);
    else if (req.method === "POST" && path === "attendance")
      result = await svc.saveAttendance(db, u, input);
    else if (req.method === "POST" && path === "invoices")
      result = await svc.generateInvoices(db, u, input.month);
    else if (req.method === "POST" && path === "pay")
      result = await svc.pay(db, u, input);
    else if (req.method === "POST" && path === "void")
      result = await svc.voidRecord(
        db,
        u,
        input.id,
        String(input.reason || ""),
      );
    else if (req.method === "POST" && path === "settings")
      result = await svc.saveSettings(db, u, input);
    else if (req.method === "POST" && path === "accounts")
      result = await svc.saveAccount(db, u, input);
    else
      return NextResponse.json(
        { error: "Halaman tidak ditemukan." },
        { status: 404 },
      );
    if (u.role === "admin")
      result = JSON.parse(
        JSON.stringify(result ?? null, (k, v) =>
          k === "honor" ? undefined : v,
        ),
      );
    return NextResponse.json(
      { ok: true, result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e: any) {
    // Drizzle wraps PostgreSQL errors in a query error; the PG code/constraint
    // are often stored on its cause. Never send SQL text or parameters to clients.
    const known = e instanceof Error ? e.message : "Permintaan tidak berhasil.";
    const dbError = e?.cause && typeof e.cause === "object" ? e.cause : e;
    const code = String(dbError?.code || e?.code || "");
    const constraint = String(dbError?.constraint || e?.constraint || "");
    const duplicate = code === "23505";
    const status = duplicate ? 409 : known === "DATABASE_NOT_CONFIGURED" ? 503 :
      known.includes("Akses") ? 403 : code || known.startsWith("Failed query:") ? 500 : 400;
    const message = duplicate
      ? constraint.includes("accounts_email")
        ? "Email sudah terdaftar. Silakan masuk atau gunakan Lupa Password."
        : constraint.includes("accounts_username")
          ? "Username sudah digunakan. Coba username lain."
          : "Email atau username sudah terdaftar. Silakan masuk atau gunakan data lain."
      : code || known.startsWith("Failed query:")
        ? "Database sedang mengalami kendala. Silakan coba lagi atau hubungi admin."
        : known === "DATABASE_NOT_CONFIGURED"
          ? "Database belum terhubung."
          : known;
    return NextResponse.json({ error: message }, { status });
  }
}
export const GET = handler;
export const POST = handler;
