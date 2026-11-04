import { test } from "node:test";
import assert from "node:assert/strict";
import {
  invoiceBalance,
  cashReport,
  validateData,
  canAccess,
  normalizePhone,
  today,
  selectableReferences,
} from "../lib/domain";
test("cicilan dan dispensasi dipisahkan dari kas", () => {
  assert.deepEqual(
    invoiceBalance(300000, [
      { amount: 100000, method: "Tunai" },
      { amount: 200000, method: "Dispensasi" },
    ]),
    { paid: 300000, cash: 100000, balance: 0, status: "Lunas" },
  );
});
test("pembatalan pembayaran tidak dihitung", () =>
  assert.equal(
    invoiceBalance(300000, [
      { amount: 300000, method: "Transfer", voided: true },
    ]).balance,
    300000,
  ));
test("laba memakai tanggal penerimaan dan honor sekali", () =>
  assert.deepEqual(
    cashReport(
      [
        { date: "2026-10-02", amount: 500000, method: "Tunai" },
        { date: "2026-09-30", amount: 900000, method: "Tunai" },
      ],
      [{ date: "2026-10-02", honor: 100000 }],
      [{ date: "2026-10-02", amount: 50000 }],
      "2026-10",
    ),
    { income: 500000, honor: 100000, expenses: 50000, profit: 350000 },
  ));
test("role admin ditolak untuk honor/pengeluaran", () => {
  assert.equal(canAccess("admin", "expenses"), false);
  assert.equal(canAccess("teacher", "payments"), false);
  assert.equal(canAccess("teacher", "sessions"), true);
});
test("nominal negatif dan field wajib ditolak", () => {
  assert.throws(() =>
    validateData("programs", { name: "A", fee: -1, honor: 1 }),
  );
  assert.throws(() => validateData("students", { name: "" }));
});
test("nomor lokal menjadi format WA", () =>
  assert.equal(normalizePhone("0812-3456-7890"), "6281234567890"));
test("tanggal hari ini sesuai Jakarta", () =>
  assert.equal(today(new Date("2026-10-02T18:00:00Z")), "2026-10-03"));
test("pilihan referensi hanya menampilkan kelas aktif dan terurut", () => {
  const rows = [
    { id: "old", kind: "classes", archived: true, data: { name: "Arsip" }, version: 1 },
    { id: "b", kind: "classes", archived: false, data: { name: "Zeta" }, version: 1 },
    { id: "a", kind: "classes", archived: false, data: { name: "Alfa" }, version: 1 },
    { id: "s", kind: "students", archived: false, data: { name: "Rani" }, version: 1 },
  ];
  assert.deepEqual(selectableReferences(rows, "classes").map((r) => r.id), ["a", "b"]);
  assert.deepEqual(selectableReferences(rows, "teachers"), []);
});
