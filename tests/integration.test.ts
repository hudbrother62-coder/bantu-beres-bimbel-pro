import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { register, authenticate, login } from "../lib/auth";
import {
  saveRecord,
  allRows,
  saveAttendance,
  generateInvoices,
  pay,
  snapshot,
  archive,
  saveAccount,
  voidRecord,
  bulkImport,
} from "../lib/service";
import { today } from "../lib/domain";
test("alur bimbel dengan PostgreSQL: CRUD, presensi, billing, isolasi dan role", async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  await migrate(db, { migrationsFolder: "./db/migrations" });
  await migrate(db, { migrationsFolder: "./db/migrations" });
  const token = await register(
    {
      name: "Pemilik QA",
      email: "owner@example.test",
      username: "ownerqa",
      password: "Password123!",
      business: "Bimbel QA",
    },
    db,
  );
  const ctx = await authenticate(token, db);
  assert.ok(ctx);
  const u = ctx.user;
  const p = await saveRecord(db, u, "programs", {
    name: "Matematika",
    subject: "Matematika",
    level: "SD",
    fee: 300000,
    honor: 50000,
  });
  const t = await saveRecord(db, u, "teachers", {
    name: "Pengajar QA",
    phone: "081234567890",
    honor: "",
    email: "",
  });
  const c = await saveRecord(db, u, "classes", {
    name: "SD 5",
    programId: p.id,
    teacherId: t.id,
    mode: "Kelompok",
    capacity: 3,
    location: "Ruang A",
    days: "Sabtu",
    time: "10:00",
    endTime: "11:00",
  });
  const s = await saveRecord(db, u, "students", {
    name: "Siswa QA",
    guardian: "Wali QA",
    phone: "081234567890",
    status: "Aktif",
  });
  await saveRecord(db, u, "enrollments", {
    studentId: s.id,
    classId: c.id,
    startDate: today(),
    discount: 50000,
    status: "Aktif",
  });
  await assert.rejects(
    () =>
      saveRecord(db, u, "enrollments", {
        studentId: s.id,
        classId: c.id,
        startDate: today(),
        status: "Aktif",
      }),
    /sudah aktif/,
  );
  let ses = await saveAttendance(db, u, {
    classId: c.id,
    date: today(),
    attendance: [{ studentId: s.id, status: "Hadir" }],
    material: "Pecahan",
  });
  assert.equal(ses.data.honor, 50000);
  await saveRecord(
    db,
    u,
    "programs",
    { ...p.data, honor: 100000 },
    p.id,
    p.version,
  );
  ses = await saveAttendance(db, u, {
    classId: c.id,
    date: today(),
    attendance: [{ studentId: s.id, status: "Izin" }],
    material: "Pecahan",
  });
  assert.equal(ses.data.honor, 50000);
  assert.equal(
    (await allRows(db, u)).filter((r) => r.kind === "sessions").length,
    1,
  );
  const month = today().slice(0, 7);
  assert.equal(await generateInvoices(db, u, month), 1);
  assert.equal(await generateInvoices(db, u, month), 0);
  const inv = (await allRows(db, u)).find((r) => r.kind === "invoices")!;
  assert.equal(inv.data.amount, 250000);
  const payment = await pay(db, u, {
    invoiceId: inv.id,
    amount: 100000,
    method: "Tunai",
    date: today(),
    requestId: crypto.randomUUID(),
  });
  await assert.rejects(
    () =>
      pay(db, u, {
        invoiceId: inv.id,
        amount: 200000,
        method: "Transfer",
        date: today(),
        requestId: crypto.randomUUID(),
      }),
    /sisa tagihan/,
  );
  await pay(db, u, {
    invoiceId: inv.id,
    amount: 150000,
    method: "Dispensasi",
    date: today(),
    requestId: crypto.randomUUID(),
  });
  let ss = await snapshot(db, u, month);
  assert.equal(ss.report.income, 100000);
  assert.equal(ss.report.honor, 50000);
  assert.equal(ss.report.profit, 50000);
  await voidRecord(db, u, payment.id, "Salah pembayaran");
  ss = await snapshot(db, u, month);
  assert.equal(ss.report.income, 0);
  await assert.rejects(
    () => archive(db, u, [s.id], "archive"),
    /terlebih dahulu/,
  );
  await saveAccount(db, u, {
    name: "Guru QA",
    email: "guru@example.test",
    username: "guruqa",
    password: "Password123!",
    role: "teacher",
    teacherId: t.id,
  });
  const guru = await authenticate(
    await login({ identifier: "guruqa", password: "Password123!" }, db),
    db,
  );
  assert.ok(guru);
  await assert.rejects(
    () => pay(db, guru.user, { invoiceId: inv.id }),
    /Akses/,
  );
  const gs = await snapshot(db, guru.user, month);
  assert.ok(
    gs.rows.every(
      (r: any) => !["payments", "invoices", "expenses"].includes(r.kind),
    ),
  );
  assert.equal(gs.accounts, undefined);
  await saveAccount(db, u, {
    name: "Admin QA",
    email: "admin@example.test",
    username: "adminqa",
    password: "Password123!",
    role: "admin",
  });
  const admin = await authenticate(
    await login({ identifier: "adminqa", password: "Password123!" }, db),
    db,
  );
  assert.ok(admin);
  const adm = await snapshot(db, admin.user, month);
  assert.ok(adm.rows.every((r: any) => r.data.honor === undefined));
  const second = await authenticate(
    await register(
      {
        name: "Owner 2",
        email: "two@example.test",
        username: "ownertwo",
        password: "Password123!",
        business: "Other",
      },
      db,
    ),
    db,
  );
  assert.ok(second);
  assert.equal((await allRows(db, second.user)).length, 0);
  await assert.rejects(
    () => saveAttendance(db, second.user, { classId: c.id, date: today() }),
    /tidak ditemukan/,
  );
  const count = (await allRows(db, u)).length;
  await assert.rejects(
    () =>
      bulkImport(db, u, "students", [
        {
          name: "Import 1",
          guardian: "Wali",
          phone: "081234567890",
          status: "Aktif",
        },
        { name: "", guardian: "Wali", phone: "081234567890" },
      ]),
    /Baris 3/,
  );
  assert.equal((await allRows(db, u)).length, count);
  for (let i = 0; i < 5; i++)
    await assert.rejects(
      () => login({ identifier: "guruqa", password: "salah" }, db),
      /salah/,
    );
  await assert.rejects(
    () => login({ identifier: "guruqa", password: "Password123!" }, db),
    /terkunci/,
  );
  const loginToken = await login(
    { identifier: "ownerqa", password: "Password123!" },
    db,
  );
  assert.ok(await authenticate(loginToken, db));
  if (process.env.BIMBEL_UI_FIXTURE)
    writeFileSync(
      process.env.BIMBEL_UI_FIXTURE,
      JSON.stringify(await snapshot(db, u, month)),
    );
  await pg.close();
});

test("pendaftaran akun pemilik baru: tersimpan, login ulang, dashboard awal, dan duplikasi aman", async () => {
  const pg = new PGlite();
  const db = drizzle(pg, { schema });
  try {
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const form = {
      name: "Pemilik Baru",
      business: "Bimbel Mandiri",
      email: "  OWNER.BARU@EXAMPLE.TEST ",
      username: " OwnerBaru ",
      password: "PasswordPanjang123!",
    };
    const token = await register(form, db);
    const context = await authenticate(token, db);
    assert.ok(context, "sesi pertama pendaftaran harus aktif");
    assert.equal(context.user.email, "owner.baru@example.test");
    assert.equal(context.user.username, "ownerbaru");
    assert.equal(context.user.role, "owner");
    assert.equal(context.tenant.name, "Bimbel Mandiri");
    const firstPage = await snapshot(db, context.user, today().slice(0, 7));
    assert.equal(firstPage.rows.length, 0, "dashboard bimbel baru harus dapat diakses");
    assert.equal(firstPage.accounts.length, 1);
    const loginByEmail = await login({ identifier: "OWNER.BARU@EXAMPLE.TEST", password: form.password }, db);
    const loginByUsername = await login({ identifier: "ownerbaru", password: form.password }, db);
    assert.equal((await authenticate(loginByEmail, db))?.user.id, context.user.id);
    assert.equal((await authenticate(loginByUsername, db))?.user.id, context.user.id);
    await assert.rejects(() => register(form, db), /unique|duplicate|already exists|23505/i);
    await assert.rejects(() => register({ ...form, email: "different@example.test" }, db), /unique|duplicate|already exists|23505/i);
    const { count: tenantCount } = (await db.select({ count: sql<number>`count(*)::int` }).from(schema.tenants))[0];
    const { count: accountCount } = (await db.select({ count: sql<number>`count(*)::int` }).from(schema.accounts))[0];
    assert.equal(Number(tenantCount), 1, "duplikasi tidak boleh meninggalkan lembaga kosong");
    assert.equal(Number(accountCount), 1, "duplikasi tidak boleh membuat akun baru");
  } finally {
    await pg.close();
  }
});
