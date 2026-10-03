import {
  randomBytes,
  createHash,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { eq, and, gt, sql } from "drizzle-orm";
import { accounts, sessions, tenants } from "../db/schema";
import { database } from "./db";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function verifyPassword(password: string, hash: string) {
  try {
    const [salt, key] = hash.split(":");
    const a = Buffer.from(key, "hex"),
      b = scryptSync(password, salt, 64);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
export function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function credentials(input: any) {
  const name = String(input.name || "").trim(),
    email = String(input.email || "")
      .trim()
      .toLowerCase(),
    username = String(input.username || "")
      .trim()
      .toLowerCase(),
    password = String(input.password || "");
  if (
    !name ||
    name.length > 100 ||
    !/^\S+@\S+\.\S+$/.test(email) ||
    email.length > 200 ||
    !/^[a-z0-9_.-]{3,40}$/.test(username) ||
    password.length < 8 ||
    password.length > 128
  )
    throw new Error(
      "Isi nama, email, username (3–40 karakter), dan password minimal 8 karakter.",
    );
  return { name, email, username, password: hashPassword(password) };
}
export async function register(input: any, db: any = database()) {
  const c = credentials(input);
  const business = String(input.business || "").trim();
  if (!business || business.length > 150)
    throw new Error("Nama bimbel wajib diisi.");
  return db.transaction(async (tx: any) => {
    const [tenant] = await tx
      .insert(tenants)
      .values({
        name: business,
        settings: {
          dueDay: 10,
          zone: "Asia/Jakarta",
          phone: "",
          bank: "",
          address: "",
          waTemplate:
            "Yth. {wali}, SPP {siswa} bulan {bulan} tersisa {jumlah}. Jatuh tempo {tempo}. Pembayaran: {rekening}. Terima kasih.",
        },
      })
      .returning();
    const [user] = await tx
      .insert(accounts)
      .values({ ...c, tenantId: tenant.id, role: "owner" })
      .returning();
    return issueSession(tx, user.id);
  });
}
async function issueSession(db: any, accountId: string) {
  const token = randomBytes(32).toString("hex");
  await db
    .insert(sessions)
    .values({
      hash: tokenHash(token),
      accountId,
      expiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000),
    });
  return token;
}
export async function login(input: any, db: any = database()) {
  const identifier = String(input.identifier || "")
      .trim()
      .toLowerCase(),
    password = String(input.password || "");
  if (password.length > 128 || identifier.length > 200)
    throw new Error("Email/username atau password salah.");
  const [u] = await db
    .select()
    .from(accounts)
    .where(
      sql`${accounts.email}=${identifier} OR ${accounts.username}=${identifier}`,
    );
  if (!u) {
    verifyPassword(password, "dummy:0000");
    throw new Error("Email/username atau password salah.");
  }
  if (!u.active) throw new Error("Akun dinonaktifkan. Hubungi pemilik.");
  if (u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now())
    throw new Error("Akun terkunci 15 menit karena percobaan masuk berulang.");
  if (!verifyPassword(password, u.password)) {
    await db
      .update(accounts)
      .set({
        failures: sql`CASE WHEN ${accounts.lockedUntil} IS NOT NULL AND ${accounts.lockedUntil} < now() THEN 1 ELSE ${accounts.failures}+1 END`,
        lockedUntil: sql`CASE WHEN ${accounts.failures}+1>=5 AND (${accounts.lockedUntil} IS NULL OR ${accounts.lockedUntil}>now()) THEN now()+interval '15 minutes' ELSE NULL END`,
      })
      .where(eq(accounts.id, u.id));
    throw new Error("Email/username atau password salah.");
  }
  await db
    .update(accounts)
    .set({ failures: 0, lockedUntil: null })
    .where(eq(accounts.id, u.id));
  return issueSession(db, u.id);
}
export async function authenticate(token: string, db: any = database()) {
  if (!token) return null;
  const [r] = await db
    .select({ user: accounts, tenant: tenants })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .innerJoin(tenants, eq(tenants.id, accounts.tenantId))
    .where(
      and(
        eq(sessions.hash, tokenHash(token)),
        gt(sessions.expiresAt, new Date()),
        eq(accounts.active, true),
      ),
    );
  if (!r) return null;
  const { password: _, failures: __, lockedUntil: ___, ...user } = r.user;
  return { user, tenant: r.tenant };
}
export async function logout(token: string, db: any = database()) {
  await db.delete(sessions).where(eq(sessions.hash, tokenHash(token)));
}
