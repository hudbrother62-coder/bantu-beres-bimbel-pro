import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { register, authenticate, login } from "../lib/auth";
import { requestPasswordReset, confirmPasswordReset, startGooglePasswordReset } from "../lib/password-reset";

test("pemulihan password memakai tautan sekali pakai dan menonaktifkan sesi lama", async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const oldSession = await register({
      name: "Pemilik", email: "owner@demo.test",
      username: "pemilik", password: "OldPassword123!", business: "Bimbel",
    }, db);
    let resetUrl = "";
    const sender = async (_to: string, link: string) => { resetUrl = link; };
    await requestPasswordReset({ email: "unknown@demo.test" }, db, "https://bimbel.example.test", sender);
    assert.equal(resetUrl, "");
    await requestPasswordReset({ email: "OWNER@demo.test" }, db, "https://bimbel.example.test", sender);
    const token = new URL(resetUrl).searchParams.get("token")!;
    assert.ok(token);
    assert.equal(new URL(resetUrl).pathname, "/reset-password");
    await assert.rejects(
      () => confirmPasswordReset({ token, password: "NewPassword123!", confirmation: "incorrect" }, db),
      /Konfirmasi/,
    );
    const newSession = await confirmPasswordReset({
      token, password: "NewPassword123!", confirmation: "NewPassword123!",
    }, db);
    assert.ok(await authenticate(newSession, db));
    assert.equal(await authenticate(oldSession, db), null);
    await assert.rejects(() => confirmPasswordReset({
      token, password: "NewPassword123!", confirmation: "NewPassword123!",
    }, db), /digunakan|kedaluwarsa/);
    await assert.rejects(() => login({ identifier: "pemilik", password: "OldPassword123!" }, db), /salah/);
    assert.ok(await login({ identifier: "pemilik", password: "NewPassword123!" }, db));
  } finally {
    await pg.close();
  }
});


test("Google verified identity enables recovery without email delivery", async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const former = await register({
      name: "Google Owner", email: "owner.google@gmail.com",
      username: "googleowner", password: "EarlierPassword123",
      business: "Bimbel QA Google",
    }, db);
    const verifiedGoogle = async () => ({
      email: "owner.google@gmail.com", sub: "google-subject-123",
    });
    const { email, resetToken } = await startGooglePasswordReset(
      { credential: "fake-for-unit-test-only" }, db, verifiedGoogle,
    );
    assert.equal(email, "owner.google@gmail.com");
    assert.match(resetToken, /^[a-f0-9]{64}$/);
    const fresh = await confirmPasswordReset({
      token: resetToken,
      password: "NewStrongGooglePassword123",
      confirmation: "NewStrongGooglePassword123",
    }, db);
    assert.ok(await authenticate(fresh, db));
    assert.equal(await authenticate(former, db), null);
    await assert.rejects(
      () => confirmPasswordReset({
        token: resetToken, password: "nextstrongPassword123", confirmation: "nextstrongPassword123",
      }, db),
      /digunakan|kedaluwarsa/,
    );
    await assert.rejects(
      () => startGooglePasswordReset({ credential: "x" }, db, async () => ({
        email: "different.account@gmail.com", sub: "wrong-account",
      })),
      /belum terdaftar/,
    );
  } finally {
    await pg.close();
  }
});
