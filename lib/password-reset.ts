import { randomBytes } from "node:crypto";
import { and, eq, gt, desc } from "drizzle-orm";
import { accounts, passwordResetTokens, sessions } from "../db/schema";
import { database } from "./db";
import { hashPassword, issueSession, tokenHash } from "./auth";

type EmailSender = (address: string, url: string) => Promise<void>;

async function sendResetEmail(address: string, url: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PASSWORD_RESET_FROM;
  if (!apiKey || !from) throw new Error("Email pemulihan belum dikonfigurasi. Hubungi admin Bimbel Pro.");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [address],
      subject: "Pulihkan password - Bantu Beres Bimbel Pro",
      text: "Kami menerima permintaan untuk mengganti password Bimbel Pro.\n\nBuka tautan ini untuk menetapkan password baru:\n" + url + "\n\nTautan hanya berlaku selama 15 menit dan bisa digunakan satu kali. Jika Anda tidak meminta perubahan, abaikan email ini.",
    }),
  });
  if (!res.ok) throw new Error("Gagal mengirim email pemulihan.");
}

export async function requestPasswordReset(
  input: any,
  db: any = database(),
  baseUrl: string = process.env.APP_URL || "",
  sender?: EmailSender,
) {
  const email = String(input?.email || "").trim().toLowerCase();
  if (email.length > 200 || !/^\S+@\S+\.\S+$/.test(email))
    throw new Error("Masukkan alamat email yang valid.");
  // Do not indicate whether an email exists.
  if (!sender && (!process.env.RESEND_API_KEY || !process.env.PASSWORD_RESET_FROM))
    throw new Error("Email pemulihan belum dikonfigurasi. Hubungi admin Bimbel Pro.");
  const [account] = await db.select({ id: accounts.id, active: accounts.active })
    .from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account?.active) return { ok: true };

  const now = Date.now();
  const recent = await db.select({ createdAt: passwordResetTokens.createdAt })
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.accountId, account.id), gt(passwordResetTokens.createdAt, new Date(now - 60 * 60 * 1000))))
    .orderBy(desc(passwordResetTokens.createdAt)).limit(5);
  if (recent.length >= 5 || recent.some((r: any) => now - new Date(r.createdAt).getTime() < 2 * 60 * 1000))
    return { ok: true };

  const rawToken = randomBytes(32).toString("hex");
  const hash = tokenHash(rawToken);
  const link = new URL("/reset-password", baseUrl);
  link.searchParams.set("token", rawToken);
  await db.insert(passwordResetTokens).values({
    hash, accountId: account.id,
    createdAt: new Date(now),
    expiresAt: new Date(now + 15 * 60 * 1000),
  });
  try {
    await (sender || sendResetEmail)(email, link.toString());
  } catch {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.hash, hash));
    throw new Error("Email pemulihan gagal dikirim. Coba lagi atau hubungi admin.");
  }
  return { ok: true };
}

export async function confirmPasswordReset(input: any, db: any = database()) {
  const token = String(input?.token || "");
  const password = String(input?.password || "");
  const confirmation = String(input?.confirmation || "");
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new Error("Tautan pemulihan tidak valid. Silakan minta tautan baru.");
  if (password.length < 8 || password.length > 128)
    throw new Error("Password baru harus 8–128 karakter.");
  if (password !== confirmation)
    throw new Error("Konfirmasi password tidak sama.");
  return db.transaction(async (tx: any) => {
    const [used] = await tx.delete(passwordResetTokens)
      .where(and(eq(passwordResetTokens.hash, tokenHash(token)), gt(passwordResetTokens.expiresAt, new Date())))
      .returning({ accountId: passwordResetTokens.accountId });
    if (!used) throw new Error("Tautan sudah digunakan atau kedaluwarsa. Minta tautan baru.");
    const [account] = await tx.select({ id: accounts.id, active: accounts.active })
      .from(accounts).where(eq(accounts.id, used.accountId)).limit(1);
    if (!account?.active) throw new Error("Akun dinonaktifkan. Hubungi pemilik.");
    await tx.update(accounts)
      .set({ password: hashPassword(password), failures: 0, lockedUntil: null })
      .where(eq(accounts.id, account.id));
    await tx.delete(sessions).where(eq(sessions.accountId, account.id));
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.accountId, account.id));
    return issueSession(tx, account.id);
  });
}
