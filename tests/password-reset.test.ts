import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { register, authenticate, login } from "../lib/auth";
import { requestPasswordOtp, verifyPasswordOtp, confirmPasswordReset, sendOtpEmail } from "../lib/password-reset";

test("OTP email -> password baru -> login langsung dan sesi lama tidak berlaku", async () => {
  const pg = new PGlite(), db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const previous = await register({
      name: "Pemilik", email: "owner@demo.test", username: "pemilik",
      password: "OldPassword123!", business: "Bimbel",
    }, db);
    let delivered = "", otp = "", sent = 0;
    const sender = async (to: string, code: string) => { delivered=to; otp=code; sent++; };
    await requestPasswordOtp({ email: "unknown@demo.test" }, db, sender);
    assert.equal(sent, 0);
    await requestPasswordOtp({ email: "OWNER@DEMO.TEST" }, db, sender);
    assert.equal(sent, 1);
    assert.equal(delivered, "owner@demo.test");
    assert.match(otp, /^\d{6}$/);
    await requestPasswordOtp({ email: "owner@demo.test" }, db, sender);
    assert.equal(sent, 1);
    const wrong = otp === "000000" ? "111111" : "000000";
    await assert.rejects(() => verifyPasswordOtp({ email: "owner@demo.test", code: wrong }, db), /salah/);
    const result = await verifyPasswordOtp({ email: "owner@demo.test", code: otp }, db);
    assert.match(result.ticket, /^[a-f0-9]{64}$/);
    await assert.rejects(() => verifyPasswordOtp({ email: "owner@demo.test", code: otp }, db), /salah|kedaluwarsa/);
    await assert.rejects(() => confirmPasswordReset({ token: result.ticket, password: "NewPassword123!", confirmation: "wrong" }, db), /Konfirmasi/);
    const current = await confirmPasswordReset({ token: result.ticket, password: "NewPassword123!", confirmation: "NewPassword123!" }, db);
    assert.ok(await authenticate(current, db));
    assert.equal(await authenticate(previous, db), null);
    await assert.rejects(() => confirmPasswordReset({ token: result.ticket, password: "NewPassword123!", confirmation: "NewPassword123!" }, db), /digunakan|kedaluwarsa/);
    await assert.rejects(() => login({ identifier: "pemilik", password: "OldPassword123!" }, db), /salah/);
    assert.ok(await login({ identifier: "pemilik", password: "NewPassword123!" }, db));
  } finally { await pg.close(); }
});

test("OTP salah lima kali diblokir", async () => {
  const pg = new PGlite(), db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    await register({ name: "Pemilik", email: "qa@example.test", username: "qaowner", password: "OldPassword123!", business: "Bimbel QA" }, db);
    let code = "";
    await requestPasswordOtp({ email: "qa@example.test" }, db, async (_to, otp) => { code = otp; });
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 5; i++) await assert.rejects(() => verifyPasswordOtp({ email: "qa@example.test", code: wrong }, db), /salah/);
    await assert.rejects(() => verifyPasswordOtp({ email: "qa@example.test", code }, db), /Terlalu banyak/);
  } finally { await pg.close(); }
});

test("tautan admin sekali pakai memulihkan akun tanpa pengiriman OTP", async () => {
  const { randomBytes } = await import("node:crypto");
  const { eq } = await import("drizzle-orm");
  const { tokenHash } = await import("../lib/auth");
  const pg = new PGlite(), db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const oldSession = await register({
      name: "Pemilik", email: "support-qa@example.test",
      username: "supportqa", password: "OldPassword123!", business: "Bimbel Uji",
    }, db);
    const [account] = await db.select({ id: schema.accounts.id })
      .from(schema.accounts).where(eq(schema.accounts.email, "support-qa@example.test"));
    const oneTimeToken = randomBytes(32).toString("hex");
    await db.insert(schema.passwordResetTokens).values({
      accountId: account.id, hash: tokenHash(oneTimeToken),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const newSession = await confirmPasswordReset({
      token: oneTimeToken, password: "NewPassword123!", confirmation: "NewPassword123!",
    }, db);
    assert.ok(await authenticate(newSession, db));
    assert.equal(await authenticate(oldSession, db), null);
    await assert.rejects(() => confirmPasswordReset({
      token: oneTimeToken, password: "SomePassword123!", confirmation: "SomePassword123!",
    }, db), /digunakan|kedaluwarsa/);
    await assert.rejects(() => login({
      identifier: "supportqa", password: "OldPassword123!",
    }, db), /salah/);
    assert.ok(await login({ identifier: "supportqa", password: "NewPassword123!" }, db));
  } finally { await pg.close(); }
});

test("Resend menerima OTP dengan idempotency key yang tetap saat retry", async () => {
  const priorKey = process.env.RESEND_API_KEY;
  const priorFrom = process.env.PASSWORD_RESET_FROM;
  const priorFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re-test-local-only";
  process.env.PASSWORD_RESET_FROM = "Bimbel Pro <otp@example.test>";
  const calls: Array<{ key: string; body: string }> = [];
  globalThis.fetch = async (_url, options) => {
    const headers = options?.headers as Record<string, string>;
    calls.push({ key: headers["Idempotency-Key"], body: String(options?.body) });
    return calls.length === 1
      ? new Response(JSON.stringify({ message: "temporarily unavailable" }), { status: 503 })
      : new Response(JSON.stringify({ id: "email-accepted-by-resend" }), { status: 200 });
  };
  try {
    await sendOtpEmail("owner@example.test", "123456");
    assert.equal(calls.length, 2);
    assert.ok(calls[0].key.startsWith("bimbel-otp-"));
    assert.equal(calls[0].key, calls[1].key, "retry tidak boleh mengirim dua email berbeda");
    assert.equal(calls[0].body, calls[1].body);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorKey;
    if (priorFrom === undefined) delete process.env.PASSWORD_RESET_FROM;
    else process.env.PASSWORD_RESET_FROM = priorFrom;
  }
});

test("Resend menolak konfigurasi salah tanpa retry atau klaim OTP terkirim", async () => {
  const priorKey = process.env.RESEND_API_KEY;
  const priorFrom = process.env.PASSWORD_RESET_FROM;
  const priorFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = "re-test-local-only";
  process.env.PASSWORD_RESET_FROM = "Bimbel Pro <otp@example.test>";
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(JSON.stringify({ name: "validation_error" }), { status: 403 });
  };
  try {
    await assert.rejects(() => sendOtpEmail("owner@example.test", "123456"), /ditolak penyedia email/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = priorKey;
    if (priorFrom === undefined) delete process.env.PASSWORD_RESET_FROM;
    else process.env.PASSWORD_RESET_FROM = priorFrom;
  }
});
