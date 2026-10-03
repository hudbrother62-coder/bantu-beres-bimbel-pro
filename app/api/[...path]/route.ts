import { NextRequest, NextResponse } from "next/server";
import { checkDatabase, database } from "../../../lib/db";
import { authenticate, login, logout, register } from "../../../lib/auth";
import * as svc from "../../../lib/service";
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
      const expected = process.env.APP_URL
        ? new URL(process.env.APP_URL).origin
        : req.nextUrl.origin;
      if (!origin || origin !== expected)
        return NextResponse.json(
          { error: "Asal permintaan ditolak. Periksa APP_URL." },
          { status: 403 },
        );
    }
    if (path === "health") {
      if (!process.env.DATABASE_URL)
        return NextResponse.json(
          { configured: false, connected: false, migrated: false, tables: [] },
          { status: 503 },
        );
      try {
        const status = await checkDatabase();
        return NextResponse.json({ configured: true, ...status });
      } catch {
        return NextResponse.json(
          {
            configured: true,
            connected: false,
            migrated: false,
            tables: [],
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
    const known = String(e.message);
    const status =
      known === "DATABASE_NOT_CONFIGURED"
        ? 503
        : known.includes("Akses")
          ? 403
          : 400;
    return NextResponse.json(
      {
        error:
          e.code === "23505"
            ? "Email, username, atau data ini sudah terdaftar."
            : e.code
              ? "Database tidak dapat memproses permintaan. Periksa koneksi dan migrasi."
              : known === "DATABASE_NOT_CONFIGURED"
                ? "Database belum terhubung."
                : known,
      },
      { status },
    );
  }
}
export const GET = handler;
export const POST = handler;
