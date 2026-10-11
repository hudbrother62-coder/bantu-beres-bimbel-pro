import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { register, authenticate, login } from "../lib/auth";
import { requestPasswordOtp, verifyPasswordOtp, confirmPasswordReset } from "../lib/password-reset";

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
