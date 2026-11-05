/**
 * Operator-only reset for accounts verified through an existing support channel.
 * Run in a trusted admin environment. Never expose this command as a public API.
 */
import { createHash, randomBytes } from "node:crypto";
import { Pool } from "pg";

async function main() {
  try { process.loadEnvFile?.(".env.local"); } catch { /* Hosted environments inject variables. */ }
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) {
    throw new Error("Gunakan: npm run support:reset -- alamat-email-terdaftar");
  }
  const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL_UNPOOLED / DATABASE_URL harus diisi.");
  if (!process.env.APP_URL) throw new Error("APP_URL harus berisi domain aplikasi resmi.");
  const base = new URL(process.env.APP_URL);
  if (base.protocol !== "https:" && base.hostname !== "localhost") {
    throw new Error("APP_URL harus menggunakan HTTPS, kecuali pengembangan localhost.");
  }
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 10000 });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const account = await client.query<{ id: string; active: boolean }>(
      "SELECT id, active FROM accounts WHERE lower(email) = $1 LIMIT 1 FOR UPDATE",
      [email],
    );
    if (!account.rows[0]) throw new Error("Akun tidak ditemukan pada branch database ini.");
    if (!account.rows[0].active) throw new Error("Akun nonaktif. Jangan terbitkan tautan reset.");
    const token = randomBytes(32).toString("hex");
    const hash = createHash("sha256").update(token).digest("hex");
    await client.query("DELETE FROM password_reset_tokens WHERE account_id = $1", [account.rows[0].id]);
    await client.query(
      "INSERT INTO password_reset_tokens (hash, account_id, created_at, expires_at) VALUES ($1, $2, now(), now() + interval '60 minutes')",
      [hash, account.rows[0].id],
    );
    await client.query("COMMIT");
    const link = new URL("/reset-password", base);
    link.hash = "token=" + token;
    console.log("Tautan reset rahasia (berlaku 60 menit, sekali pakai):");
    console.log(link.toString());
    console.log("Kirim HANYA lewat percakapan privat kepada customer yang sudah diverifikasi.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error("Gagal membuat tautan:", (error as Error).message);
  process.exitCode = 1;
});
