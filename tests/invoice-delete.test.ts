import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { register, authenticate } from "../lib/auth";
import { saveRecord, allRows, generateInvoices, deleteInvoices, pay } from "../lib/service";
import { today } from "../lib/domain";

test("hapus tagihan satu atau banyak hanya bila belum pernah dibayar", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const ctx = await authenticate(await register({
      name: "Owner Hapus", email: "hapus@example.test", username: "ownertagihan",
      password: "Password123!", business: "Bimbel Tagihan",
    }, db), db);
    assert.ok(ctx);
    const owner = ctx.user;
    const program = await saveRecord(db, owner, "programs", {
      name: "IPA", subject: "IPA", level: "SD", fee: 100000, honor: 10000,
    });
    const teacher = await saveRecord(db, owner, "teachers", {
      name: "Pengajar", phone: "081234567890",
    });
    const kelas = await saveRecord(db, owner, "classes", {
      name: "Kelas Sore", programId: program.id, teacherId: teacher.id,
      mode: "Kelompok", capacity: 5, location: "Ruang 1",
      days: "Senin", time: "15:00", endTime: "16:00",
    });
    for (let i = 1; i <= 3; i++) {
      const student = await saveRecord(db, owner, "students", {
        name: "Siswa " + i, guardian: "Wali " + i,
        phone: "081234567890", status: "Aktif",
      });
      await saveRecord(db, owner, "enrollments", {
        studentId: student.id, classId: kelas.id,
        startDate: today(), status: "Aktif",
      });
    }
    const month = today().slice(0, 7);
    assert.equal(await generateInvoices(db, owner, month), 3);
    const invoices = (await allRows(db, owner)).filter((r) => r.kind === "invoices");
    const [first, second, paidInvoice] = invoices;
    await pay(db, owner, {
      invoiceId: paidInvoice.id, amount: 10000, method: "Tunai",
      date: today(), requestId: crypto.randomUUID(),
    });
    await assert.rejects(
      () => deleteInvoices(db, owner, [first.id, paidInvoice.id]), /riwayat pembayaran/,
    );
    assert.equal((await allRows(db, owner)).filter((r) => r.kind === "invoices").length, 3);
    await assert.rejects(
      () => deleteInvoices(db, { ...owner, role: "teacher" }, [first.id]), /Akses/,
    );
    const other = await authenticate(await register({
      name: "Pemilik Lain", email: "lainhapus@example.test",
      username: "ownerlainhapus", password: "Password123!", business: "Bimbel Lain",
    }, db), db);
    assert.ok(other);
    await assert.rejects(
      () => deleteInvoices(db, other.user, [first.id]), /tidak ditemukan/,
    );
    assert.equal(await deleteInvoices(db, owner, [first.id, second.id]), 2);
    assert.equal((await allRows(db, owner)).filter((r) => r.kind === "invoices").length, 1);
    assert.equal(await generateInvoices(db, owner, month), 2);
    const after = await allRows(db, owner);
    assert.equal(after.filter((r) => r.kind === "invoices").length, 3);
    assert.ok(after.some((r) => r.id === paidInvoice.id));
    assert.equal(after.filter((r) => r.kind === "payments").length, 1);
    assert.ok(!after.some((r) => r.id === first.id || r.id === second.id));
    await assert.rejects(
      () => deleteInvoices(db, owner, [paidInvoice.id]), /riwayat pembayaran/,
    );
  } finally {
    await pg.close();
  }
});
