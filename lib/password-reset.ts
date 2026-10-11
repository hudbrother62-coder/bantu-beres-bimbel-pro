import { randomBytes, randomInt } from "node:crypto";
import { and, eq, gt, isNull, lt, desc, sql } from "drizzle-orm";
import { accounts, passwordResetOtps, passwordResetTokens, sessions } from "../db/schema";
import { database } from "./db";
import { hashPassword, verifyPassword, issueSession, tokenHash } from "./auth";

type OtpSender = (address: string, code: string) => Promise<void>;

function validEmail(input: any) {
  const email = String(input?.email || "").trim().toLowerCase();
  if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Masukkan email yang valid.");
  return email;
}

async function sendOtpEmail(address: string, code: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;
  if (!apiKey || !from)
    throw new Error("Pengiriman OTP belum dikonfigurasi. Hubungi pengelola Bimbel Pro.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [address],
      subject: "Kode pemulihan password Bantu Beres Bimbel Pro",
      text: "Kode OTP Bimbel Pro Anda: " + code +
        "\n\nKode berlaku 10 menit dan hanya dapat digunakan satu kali. Jangan bagikan kepada siapa pun. Jika Anda tidak meminta kode, abaikan email ini.",
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!response.ok) throw new Error("Email OTP gagal dikirim. Periksa konfigurasi pengirim.");
}

export async function requestPasswordOtp(input: any, db: any = database(), sender?: OtpSender) {
  const email = validEmail(input);
  if (!sender && (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM))
    throw new Error("Pengiriman OTP belum dikonfigurasi. Hubungi pengelola Bimbel Pro.");

  const [account] = await db.select({ id: accounts.id, active: accounts.active })
    .from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account?.active) return { ok: true };

  const now = Date.now();
  const recent = await db.select({ createdAt: passwordResetOtps.createdAt })
    .from(passwordResetOtps)
    .where(and(
      eq(passwordResetOtps.accountId, account.id),
      gt(passwordResetOtps.createdAt, new Date(now - 60 * 60 * 1000)),
    ))
    .orderBy(desc(passwordResetOtps.createdAt)).limit(5);
  if (recent.length >= 5 || recent.some((r: { createdAt: Date }) =>
    now - new Date(r.createdAt).getTime() < 60_000)) {
    return { ok: true };
  }

  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const [created] = await db.insert(passwordResetOtps).values({
    accountId: account.id,
    codeHash: hashPassword(code),
    createdAt: new Date(now),
    expiresAt: new Date(now + 10 * 60_000),
  }).returning({ id: passwordResetOtps.id });
  try {
    await (sender || sendOtpEmail)(email, code);
  } catch {
    await db.delete(passwordResetOtps).where(eq(passwordResetOtps.id, created.id));
    throw new Error("Kode OTP belum dapat dikirim. Periksa pengaturan email atau coba lagi.");
  }
  return { ok: true };
}

export async function verifyPasswordOtp(input: any, db: any = database()) {
  const email = validEmail(input);
  const code = String(input?.code || "").trim();
  if (!/^\d{6}$/.test(code)) throw new Error("Masukkan kode OTP 6 digit.");
  const [account] = await db.select({ id: accounts.id, active: accounts.active })
    .from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account?.active) throw new Error("Kode salah atau kedaluwarsa. Minta kode baru.");

  const result = await db.transaction(async (tx: any) => {
    const [latest] = await tx.select({ id: passwordResetOtps.id })
      .from(passwordResetOtps)
      .where(and(
        eq(passwordResetOtps.accountId, account.id),
        isNull(passwordResetOtps.usedAt),
        gt(passwordResetOtps.expiresAt, new Date()),
      ))
      .orderBy(desc(passwordResetOtps.createdAt)).limit(1);
    if (!latest) return { error: "Kode salah atau kedaluwarsa. Minta kode baru." };

    // Row lock and persistent failed-attempt count prevent brute-force.
    const [otp] = await tx.update(passwordResetOtps)
      .set({ attempts: sql.raw("attempts + 1") })
      .where(and(
        eq(passwordResetOtps.id, latest.id),
        eq(passwordResetOtps.accountId, account.id),
        isNull(passwordResetOtps.usedAt),
        gt(passwordResetOtps.expiresAt, new Date()),
        lt(passwordResetOtps.attempts, 5),
      ))
      .returning({ codeHash: passwordResetOtps.codeHash });
    if (!otp) return { error: "Terlalu banyak percobaan atau kode kedaluwarsa. Minta kode baru." };
    if (!verifyPassword(code, otp.codeHash)) return { error: "Kode OTP salah. Periksa email Anda." };

    await tx.update(passwordResetOtps).set({ usedAt: new Date() }).where(eq(passwordResetOtps.id, latest.id));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.accountId, account.id));
    const ticket = randomBytes(32).toString("hex");
    await tx.insert(passwordResetTokens).values({
      hash: tokenHash(ticket),
      accountId: account.id,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    return { ticket };
  });
  if ("error" in result) throw new Error(result.error);
  return result;
}

export async function confirmPasswordReset(input: any, db: any = database()) {
  const token = String(input?.token || "");
  const password = String(input?.password || "");
  const confirmation = String(input?.confirmation || "");
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Verifikasi OTP sudah tidak berlaku. Silakan minta kode baru.");
  if (password.length < 8 || password.length > 128)
    throw new Error("Password baru harus 8–128 karakter.");
  if (password !== confirmation)
    throw new Error("Konfirmasi password tidak sama.");
  return db.transaction(async (tx: any) => {
    const [used] = await tx.delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.hash, tokenHash(token)), gt(passwordResetTokens.expiresAt, new Date())))
      .returning({ accountId: passwordResetTokens.accountId });
    if (!used) throw new Error("Verifikasi sudah digunakan atau kedaluwarsa. Minta kode OTP baru.");
    const [account] = await tx.select({ id: accounts.id, active: accounts.active })
      .from(accounts).where(eq(accounts.id, used.accountId)).limit(1);
    if (!account?.active) throw new Error("Akun dinonaktifkan. Hubungi pengelola bimbel.");
    await tx.update(accounts)
      .set({ password: hashPassword(password), failures: 0, lockedUntil: null })
      .where(eq(accounts.id, account.id));
    await tx.delete(sessions).where(eq(sessions.accountId, account.id));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.accountId, account.id));
    return issueSession(tx, account.id);
  });
}
