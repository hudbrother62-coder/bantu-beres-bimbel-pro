import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "../db/schema";
import { register, authenticate, login } from "../lib/auth";
import {
  saveRecord, saveAccount, allRows, archive, generateInvoices,
  editInvoice, pay, editPayment, deleteAccount,
} from "../lib/service";
import { today } from "../lib/domain";

test("manajemen Bimbel Pro: edit tagihan/pembayaran, arsip aman, edit dan hapus akun", async () => {
  const pg = new PGlite();
  try {
    const db = drizzle(pg, { schema });
    await migrate(db, { migrationsFolder: "./db/migrations" });
    const owner = (await authenticate(await register({
      name: "Pemilik", email: "editowner@example.test", username: "editowner",
      password: "Password123!", business: "Bimbel QA Edit",
    }, db), db))!.user;
    const prog = await saveRecord(db, owner, "programs", {
      name: "Math", subject: "Math", level: "SD", fee: 200000, honor: 15000,
    });
    const tutor = await saveRecord(db, owner, "teachers", {
      name: "Pengajar QA", phone: "081234567890",
    });
    const cls = await saveRecord(db, owner, "classes", {
      name: "Kelas A", programId: prog.id, teacherId: tutor.id,
      mode: "Kelompok", capacity: 4, location: "Ruang QA",
      days: "Senin", time: "13:00", endTime: "14:00",
    });
    const pupil = await saveRecord(db, owner, "students", {
      name: "Murid QA", guardian: "Wali", phone: "081234567890", status: "Aktif",
    });
    await saveRecord(db, owner, "enrollments", {
      studentId: pupil.id, classId: cls.id, startDate: today(), status: "Aktif",
    });
    const month = today().slice(0, 7);
    assert.equal(await generateInvoices(db, owner, month), 1);
    let invoice = (await allRows(db, owner)).find((r) => r.kind === "invoices")!;
    const corrected = await editInvoice(db, owner, {
      id: invoice.id, version: invoice.version, amount: 150000,
    });
    assert.equal(corrected.data.amount, 150000);
    await assert.rejects(() => editInvoice(db, owner, {
      id: invoice.id, version: invoice.version, amount: 120000,
    }), /berubah/);
    invoice = corrected;
    const payment = await pay(db, owner, {
      invoiceId: invoice.id, amount: 50000, method: "Tunai",
      date: today(), requestId: crypto.randomUUID(),
    });
    await assert.rejects(() => editInvoice(db, owner, {
      id: invoice.id, version: invoice.version, amount: 49999,
    }), /kurang dari total pembayaran/);
    assert.equal((await editInvoice(db, owner, {
      id: invoice.id, version: invoice.version, amount: 175000,
    })).data.amount, 175000);
    const edited = await editPayment(db, owner, {
      id: payment.id, version: payment.version, amount: 75000,
      method: "Transfer", date: today(), notes: "Koreksi kas",
    });
    assert.equal(edited.data.amount, 75000);
    assert.equal(edited.data.method, "Transfer");
    assert.equal(edited.data.receipt, payment.data.receipt);
    await assert.rejects(() => editPayment(db, owner, {
      id: payment.id, version: edited.version, amount: 180000,
      method: "Transfer", date: today(),
    }), /melebihi tagihan/);
    await assert.rejects(() => archive(db, owner, [pupil.id], "archive"), /terlebih dahulu/);
    await saveAccount(db, owner, {
      name: "Admin QA", email: "staffedit@example.test", username: "staffedit",
      password: "Password123!", role: "admin",
    });
    const admin = (await authenticate(await login({
      identifier: "staffedit", password: "Password123!",
    }, db), db))!.user;
    await assert.rejects(() => archive(db, admin, [prog.id], "archive"), /Hanya pemilik/);
    await assert.rejects(() => editPayment(db, admin, {
      id: edited.id, version: edited.version, amount: 10,
      method: "Tunai", date: today(),
    }), /Hanya pemilik/);
    await saveAccount(db, owner, {
      id: admin.id, edit: true, name: "Admin Diedit",
      email: "staffedit@example.test", username: "staffbaru", role: "admin",
    });
    const all = await db.select().from(schema.accounts);
    assert.equal(all.find((r) => r.id === admin.id)?.name, "Admin Diedit");
    const activeSession = await authenticate(await login({
      identifier: "staffbaru", password: "Password123!",
    }, db), db);
    assert.ok(activeSession);
    await assert.rejects(() => deleteAccount(db, owner, owner.id), /sendiri/);
    await deleteAccount(db, owner, admin.id);
    assert.equal((await db.select().from(schema.accounts)).some((a) => a.id === admin.id), false);
    assert.equal(await authenticate((await login({
      identifier: "editowner", password: "Password123!",
    }, db)), db) !== null, true);
  } finally {
    await pg.close();
  }
});
