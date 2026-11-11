import { eq, and, sql, desc } from "drizzle-orm";
import { records, audit, accounts, tenants, sessions } from "../db/schema";
import {
  Data,
  Row,
  Role,
  canAccess,
  definitions,
  validateData,
  today,
  invoiceBalance,
  cashReport,
} from "./domain";
import { credentials } from "./auth";
export type User = {
  id: string;
  tenantId: string;
  name: string;
  role: Role;
  teacherId: string | null;
};
function guard(user: User, kind: string) {
  if (!canAccess(user.role, kind)) throw new Error("Akses ditolak.");
}
const condition = (u: User) => eq(records.tenantId, u.tenantId);
export async function allRows(db: any, u: User): Promise<Row[]> {
  return await db
    .select()
    .from(records)
    .where(condition(u))
    .orderBy(desc(records.createdAt));
}
function usable(rows: Row[], id: string, kind: string) {
  const r = rows.find((r) => r.id === id && r.kind === kind && !r.archived);
  if (!r) throw new Error("Data terkait tidak ditemukan atau sudah diarsip.");
  return r;
}
function teacherClasses(rows: Row[], u: User) {
  return rows
    .filter((r) => r.kind === "classes" && r.data.teacherId === u.teacherId)
    .map((r) => r.id);
}
export function visibleRows(rows: Row[], u: User) {
  if (u.role !== "teacher")
    return rows.filter((r) => canAccess(u.role, r.kind));
  const cs = teacherClasses(rows, u),
    st = rows
      .filter((r) => r.kind === "enrollments" && cs.includes(r.data.classId))
      .map((r) => r.data.studentId),
    ps = rows.filter((r) => cs.includes(r.id)).map((r) => r.data.programId);
  return rows.filter((r) =>
    r.kind === "sessions"
      ? r.data.teacherId === u.teacherId
      : r.kind === "teachers"
        ? r.id === u.teacherId
        : r.kind === "classes"
          ? cs.includes(r.id)
          : r.kind === "students"
            ? st.includes(r.id)
            : r.kind === "programs"
              ? ps.includes(r.id)
              : ["sessions", "enrollments", "progress", "agendas"].includes(
                  r.kind,
                ) && cs.includes(r.data.classId),
  );
}
async function log(tx: any, u: User, action: string, details: Data) {
  await tx
    .insert(audit)
    .values({ tenantId: u.tenantId, actorId: u.id, action, details });
}
async function lock(tx: any, u: User) {
  await tx
    .select()
    .from(tenants)
    .where(eq(tenants.id, u.tenantId))
    .for("update");
}
function referencesRecord(value: unknown, id: string): boolean {
  if (Array.isArray(value)) return value.some((item) => referencesRecord(item, id));
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, child]) =>
    (key.endsWith("Id") && child === id) ||
    (typeof child === "object" && referencesRecord(child, id))
  );
}
function checkReferences(
  kind: string,
  data: Data,
  rows: Row[],
  u: User,
  id?: string,
) {
  for (const f of definitions[kind].fields)
    if (f.ref && data[f.key]) usable(rows, data[f.key], f.ref);
  if (u.role === "teacher") {
    if (
      !["progress", "agendas"].includes(kind) ||
      !teacherClasses(rows, u).includes(data.classId)
    )
      throw new Error("Hanya dapat mengubah data kelas Anda.");
  }
  if (kind === "enrollments") {
    const c = usable(rows, data.classId, "classes"),
      p = usable(rows, c.data.programId, "programs");
    if (Number(data.discount) > Number(p.data.fee))
      throw new Error("Diskon melebihi SPP program.");
    const others = rows.filter(
      (r) =>
        r.kind === kind &&
        !r.archived &&
        r.id !== id &&
        r.data.status === "Aktif",
    );
    if (
      data.status === "Aktif" &&
      others.some(
        (r) =>
          r.data.studentId === data.studentId &&
          r.data.classId === data.classId,
      )
    )
      throw new Error("Siswa sudah aktif di kelas ini.");
    if (
      data.status === "Aktif" &&
      others.filter((r) => r.data.classId === data.classId).length >=
        Number(c.data.capacity)
    )
      throw new Error("Kapasitas kelas sudah penuh.");
  }
  if (
    kind === "progress" &&
    !rows.some(
      (r) =>
        r.kind === "enrollments" &&
        !r.archived &&
        r.data.classId === data.classId &&
        r.data.studentId === data.studentId,
    )
  )
    throw new Error("Siswa tidak terdaftar di kelas ini.");
  if (
    kind === "classes" &&
    id &&
    Number(data.capacity) <
      rows.filter(
        (r) =>
          r.kind === "enrollments" &&
          !r.archived &&
          r.data.classId === id &&
          r.data.status === "Aktif",
      ).length
  )
    throw new Error("Kapasitas lebih kecil dari siswa terdaftar.");
}
export async function saveRecord(
  db: any,
  u: User,
  kind: string,
  input: Data,
  id?: string,
  version?: number,
) {
  guard(u, kind);
  if (u.role === "admin" && ["programs", "teachers"].includes(kind))
    throw new Error("Hanya pemilik dapat mengubah program dan pengajar.");
  const data = validateData(kind, input);
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u);
    checkReferences(kind, data, rows, u, id);
    let result;
    if (id) {
      const old = usable(rows, id, kind);
      if (old.version !== version)
        throw new Error("Data sudah berubah. Muat ulang sebelum menyimpan.");
      if (
        kind === "enrollments" &&
        rows.some((r) => r.kind === "invoices" && r.data.enrollmentId === id) &&
        (old.data.studentId !== data.studentId ||
          old.data.classId !== data.classId)
      )
        throw new Error(
          "Pendaftaran sudah punya tagihan. Buat pendaftaran baru untuk pindah kelas.",
        );
      [result] = await tx
        .update(records)
        .set({ data, version: sql`${records.version}+1` })
        .where(and(condition(u), eq(records.id, id)))
        .returning();
    } else {
      [result] = await tx
        .insert(records)
        .values({ tenantId: u.tenantId, kind, data })
        .returning();
    }
    await log(tx, u, id ? "edit" : "create", { kind, id: result.id });
    return result;
  });
}
export async function bulkImport(
  db: any,
  u: User,
  kind: string,
  inputs: Data[],
) {
  guard(u, kind);
  if (u.role === "admin" && ["programs", "teachers"].includes(kind))
    throw new Error("Hanya pemilik dapat impor program dan pengajar.");
  if (u.role === "teacher") throw new Error("Impor hanya pemilik/admin.");
  if (!inputs.length || inputs.length > 500)
    throw new Error("Impor maksimal 500 baris per berkas.");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u);
    for (let i = 0; i < inputs.length; i++) {
      try {
        const d = validateData(kind, inputs[i]);
        checkReferences(kind, d, rows, u);
        if (
          rows.some(
            (r) =>
              r.kind === kind &&
              !r.archived &&
              JSON.stringify(r.data) === JSON.stringify(d),
          )
        )
          throw new Error("Baris duplikat.");
        const [r] = await tx
          .insert(records)
          .values({ tenantId: u.tenantId, kind, data: d })
          .returning();
        rows.push(r);
      } catch (e) {
        throw new Error(`Baris ${i + 2}: ${(e as Error).message}`);
      }
    }
    await log(tx, u, "import", { kind, count: inputs.length });
    return inputs.length;
  });
}
export async function archive(db: any, u: User, ids: string[], action: string) {
  if (u.role === "teacher") throw new Error("Akses ditolak.");
  if (
    !Array.isArray(ids) || !ids.length || ids.length > 500 ||
    ids.some((id) => typeof id !== "string") ||
    new Set(ids).size !== ids.length ||
    !["archive", "restore", "delete"].includes(action)
  )
    throw new Error("Pilihan tidak valid.");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u);
    for (const id of ids) {
      const r = rows.find((r) => r.id === id);
      if (!r || !definitions[r.kind])
        throw new Error(
          "Hanya data induk dan catatan operasional dapat diarsip.",
        );
      guard(u, r.kind);
      if (u.role === "admin" && ["programs", "teachers"].includes(r.kind))
        throw new Error("Hanya pemilik dapat menghapus program dan pengajar.");
      const related = rows.filter(
        (x) => x.id !== id && referencesRecord(x.data, id),
      );
      if (action === "delete") {
        if (
          !r.archived ||
          related.length ||
          (await tx
            .select()
            .from(accounts)
            .where(eq(accounts.teacherId, id))
            .then((a: any[]) => a.length))
        )
          throw new Error(
            "Data masih digunakan. Arsipkan agar riwayat tetap aman.",
          );
        await tx.delete(records).where(and(condition(u), eq(records.id, id)));
      } else {
        if (action === "restore")
          checkReferences(r.kind, r.data, rows, u, r.id);
        if (
          action === "archive" &&
          related.some(
            (x) => !x.archived && ["classes", "enrollments"].includes(x.kind),
          )
        )
          throw new Error(
            "Arsipkan kelas/pendaftaran yang memakai data ini terlebih dahulu.",
          );
        await tx
          .update(records)
          .set({
            archived: action === "archive",
            version: sql`${records.version}+1`,
          })
          .where(and(condition(u), eq(records.id, id)));
      }
    }
    await log(tx, u, action, { ids });
  });
}
export async function saveAttendance(db: any, u: User, input: Data) {
  guard(u, "sessions");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u),
      c = usable(rows, input.classId, "classes");
    if (u.role === "teacher" && c.data.teacherId !== u.teacherId)
      throw new Error("Akses kelas ditolak.");
    const date = String(input.date || "");
    const now = today();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      date > now ||
      Number.isNaN(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new Error("Tanggal presensi tidak valid atau masih di masa depan.");
    if (
      u.role === "teacher" &&
      Date.parse(now) - Date.parse(date) > 7 * 86400000
    )
      throw new Error("Pengajar hanya dapat mencatat 7 hari ke belakang.");
    const enrolled = rows
      .filter(
        (r) =>
          r.kind === "enrollments" &&
          !r.archived &&
          r.data.classId === c.id &&
          r.data.startDate <= date &&
          (!r.data.endDate || r.data.endDate >= date) &&
          r.data.status === "Aktif",
      )
      .map((r) => r.data.studentId);
    const pupils = [...new Set(enrolled)].filter((id) =>
      rows.some((r) => r.id === id && !r.archived && r.data.status === "Aktif"),
    );
    if (!pupils.length) throw new Error("Belum ada siswa aktif di kelas ini.");
    const attendance: Data[] = [];
    for (const id of pupils) {
      const status = input.attendance?.find(
        (a: Data) => a.studentId === id,
      )?.status;
      if (!["Hadir", "Izin", "Sakit", "Alpa"].includes(status))
        throw new Error("Isi presensi semua siswa aktif.");
      attendance.push({ studentId: id, status });
    }
    const key = `${c.id}:${date}`,
      old = rows.find(
        (r) =>
          r.kind === "sessions" &&
          r.data.classId === c.id &&
          r.data.date === date,
      );
    const teacher = usable(rows, c.data.teacherId, "teachers"),
      program = usable(rows, c.data.programId, "programs");
    const data = {
      classId: c.id,
      teacherId: c.data.teacherId,
      date,
      material: String(input.material || "").slice(0, 4000),
      attendance,
      honor:
        old?.data.honor ??
        Number(
          teacher.data.honor !== "" ? teacher.data.honor : program.data.honor,
        ),
      cancelled: false,
    };
    let r;
    if (old) {
      [r] = await tx
        .update(records)
        .set({ data, version: sql`${records.version}+1` })
        .where(eq(records.id, old.id))
        .returning();
    } else {
      [r] = await tx
        .insert(records)
        .values({
          tenantId: u.tenantId,
          kind: "sessions",
          uniqueKey: key,
          data,
        })
        .returning();
    }
    await log(tx, u, "attendance", { id: r.id });
    return r;
  });
}
export async function generateInvoices(db: any, u: User, month: string) {
  guard(u, "invoices");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Bulan tidak valid.");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u);
    let count = 0;
    for (const e of rows.filter(
      (r) =>
        r.kind === "enrollments" &&
        !r.archived &&
        r.data.status === "Aktif" &&
        r.data.startDate.slice(0, 7) <= month &&
        (!r.data.endDate || r.data.endDate.slice(0, 7) >= month),
    )) {
      const st = rows.find(
          (r) =>
            r.id === e.data.studentId &&
            !r.archived &&
            r.data.status === "Aktif",
        ),
        c = rows.find((r) => r.id === e.data.classId && !r.archived);
      if (!st || !c) continue;
      const p = usable(rows, c.data.programId, "programs");
      const amount = Math.max(
        0,
        Number(p.data.fee) - Number(e.data.discount || 0),
      );
      if (
        rows.some(
          (r) =>
            r.kind === "invoices" &&
            r.data.enrollmentId === e.id &&
            r.data.month === month,
        )
      )
        continue;
      await tx
        .insert(records)
        .values({
          tenantId: u.tenantId,
          kind: "invoices",
          uniqueKey: `${e.id}:${month}`,
          data: {
            enrollmentId: e.id,
            studentId: st.id,
            classId: c.id,
            month,
            amount,
            studentName: st.data.name,
            className: c.data.name,
          },
        });
      count++;
    }
    await log(tx, u, "generate-invoices", { month, count });
    return count;
  });
}
/**
 * Delete unpaid invoices inside one tenant-locked transaction.
 * Even voided payments prevent removal to preserve the financial trail.
 */
export async function deleteInvoices(db: any, u: User, ids: string[]) {
  guard(u, "invoices");
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > 500 ||
    ids.some((id) => typeof id !== "string") ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Pilih 1 sampai 500 tagihan yang valid.");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u);
    // Validate every item before deleting any: batch deletion is all or nothing.
    for (const id of ids) {
      const invoice = rows.find(
        (r) => r.id === id && r.kind === "invoices" && !r.archived,
      );
      if (!invoice)
        throw new Error("Tagihan tidak ditemukan. Muat ulang data terlebih dahulu.");
      const related = rows.some(
        (r) => r.id !== id && referencesRecord(r.data, id),
      );
      if (related)
        throw new Error(
          "Tagihan " +
            String(invoice.data.studentName || "") +
            " sudah memiliki riwayat pembayaran atau data terkait. Tagihan ini tidak dapat dihapus.",
        );
    }
    for (const id of ids) {
      await tx
        .delete(records)
        .where(
          and(condition(u), eq(records.id, id), eq(records.kind, "invoices")),
        );
    }
    await log(tx, u, "delete-invoices", { ids, count: ids.length });
    return ids.length;
  });
}

export async function editInvoice(db: any, u: User, input: Data) {
  guard(u, "invoices");
  const amount = Number(input.amount);
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > 1000000000)
    throw new Error("Nominal tagihan harus Rp0–Rp1.000.000.000.");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u);
    const inv = rows.find((r) => r.id === input.id && r.kind === "invoices" && !r.archived);
    if (!inv) throw new Error("Tagihan tidak ditemukan.");
    if (inv.version !== input.version) throw new Error("Data sudah berubah. Muat ulang dahulu.");
    const paid = invoiceBalance(Number(inv.data.amount),
      rows.filter((r) => r.kind === "payments" && r.data.invoiceId === inv.id).map((r) => r.data)
    ).paid;
    if (amount < paid) throw new Error("Nominal tagihan tidak boleh kurang dari total pembayaran.");
    const [updated] = await tx.update(records).set({
      data: { ...inv.data, amount }, version: sql`${records.version}+1`,
    }).where(and(condition(u), eq(records.id, inv.id))).returning();
    await log(tx, u, "edit-invoice", { id: inv.id, before: inv.data.amount, after: amount });
    return updated;
  });
}

export async function editPayment(db: any, u: User, input: Data) {
  if (u.role !== "owner") throw new Error("Akses ditolak. Hanya pemilik dapat mengedit pembayaran.");
  const amount = Number(input.amount), date = String(input.date || ""),
    method = String(input.method || "");
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000000)
    throw new Error("Nominal pembayaran tidak valid.");
  if (!["Tunai", "Transfer", "QRIS", "Dispensasi"].includes(method))
    throw new Error("Metode pembayaran tidak valid.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today() ||
    Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)
    throw new Error("Tanggal pembayaran tidak valid.");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u);
    const payment = rows.find((r) => r.id === input.id && r.kind === "payments" && !r.archived);
    if (!payment) throw new Error("Pembayaran tidak ditemukan.");
    if (payment.version !== input.version) throw new Error("Data sudah berubah. Muat ulang dahulu.");
    if (payment.data.voided) throw new Error("Pembayaran yang dibatalkan tidak dapat diedit.");
    const inv = rows.find((r) => r.id === payment.data.invoiceId && r.kind === "invoices" && !r.archived);
    if (!inv) throw new Error("Tagihan tidak ditemukan.");
    const otherPaid = rows.filter((r) => r.kind === "payments" && r.id !== payment.id &&
      r.data.invoiceId === inv.id && !r.data.voided
    ).reduce((a, r) => a + Number(r.data.amount), 0);
    if (otherPaid + amount > Number(inv.data.amount))
      throw new Error("Total pembayaran setelah koreksi melebihi tagihan.");
    const updatedData = { ...payment.data, amount, date, method,
      notes: String(input.notes || "").slice(0, 2000) };
    const [updated] = await tx.update(records).set({
      data: updatedData, version: sql`${records.version}+1`,
    }).where(and(condition(u), eq(records.id, payment.id))).returning();
    await log(tx, u, "edit-payment", { id: payment.id,
      before: { amount: payment.data.amount, date: payment.data.date, method: payment.data.method },
      after: { amount, date, method } });
    return updated;
  });
}

export async function pay(db: any, u: User, input: Data) {
  guard(u, "payments");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u),
      inv = usable(rows, input.invoiceId, "invoices");
    const existing = rows
        .filter((r) => r.kind === "payments" && r.data.invoiceId === inv.id)
        .map((r) => r.data),
      balance = invoiceBalance(inv.data.amount, existing).balance;
    const amount = Number(input.amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount > balance)
      throw new Error(
        "Jumlah harus lebih dari nol dan tidak melebihi sisa tagihan.",
      );
    if (!["Tunai", "Transfer", "QRIS", "Dispensasi"].includes(input.method))
      throw new Error("Metode pembayaran tidak valid.");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.date) ||
      input.date > today() ||
      new Date(input.date).toISOString().slice(0, 10) !== input.date
    )
      throw new Error("Tanggal pembayaran tidak valid.");
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(String(input.requestId)))
      throw new Error("ID pembayaran tidak valid.");
    if (
      rows.some(
        (r) => r.kind === "payments" && r.data.requestId === input.requestId,
      )
    )
      throw new Error("Pembayaran ini sudah tercatat.");
    const data = {
      invoiceId: inv.id,
      studentId: inv.data.studentId,
      month: inv.data.month,
      amount,
      method: input.method,
      date: input.date,
      receipt: `BB-${input.date.replaceAll("-", "")}-${input.requestId.slice(0, 8).toUpperCase()}`,
      requestId: input.requestId,
      notes: String(input.notes || "").slice(0, 2000),
      voided: false,
    };
    const [r] = await tx
      .insert(records)
      .values({
        tenantId: u.tenantId,
        kind: "payments",
        uniqueKey: input.requestId,
        data,
      })
      .returning();
    await log(tx, u, "payment", { id: r.id, amount });
    return r;
  });
}
/**
 * Owner-approved reconciliation of a historical session honor.
 * Attendance retains its original snapshot unless this explicit, audited action is used.
 */
export async function reconcileHonor(db: any, u: User, input: Data) {
  if (u.role !== "owner") throw new Error("Akses ditolak. Hanya pemilik dapat mengoreksi honor.");
  const reason = String(input.reason || "").trim();
  if (reason.length < 8 || reason.length > 500)
    throw new Error("Isi alasan koreksi honor (8–500 karakter).");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u);
    const session = usable(rows, String(input.id || ""), "sessions");
    if (session.data.cancelled)
      throw new Error("Sesi yang dibatalkan tidak dapat dikoreksi.");
    if (Number(input.version) !== session.version)
      throw new Error("Data sudah berubah. Muat ulang dahulu.");
    const classroom = usable(rows, session.data.classId, "classes");
    const teacher = usable(rows, session.data.teacherId, "teachers");
    const program = usable(rows, classroom.data.programId, "programs");
    const teacherRate = teacher.data.honor;
    const newHonor = Number(
      teacherRate !== "" && teacherRate !== null && teacherRate !== undefined
        ? teacherRate
        : program.data.honor,
    );
    if (!Number.isSafeInteger(newHonor) || newHonor < 0)
      throw new Error("Tarif honor pada program/pengajar tidak valid.");
    const previousHonor = Number(session.data.honor);
    if (previousHonor === newHonor)
      throw new Error("Honor sesi sudah sesuai tarif saat ini.");
    const [updated] = await tx
      .update(records)
      .set({
        data: {
          ...session.data,
          honor: newHonor,
          honorCorrectedAt: new Date().toISOString(),
          honorCorrectionReason: reason,
        },
        version: sql`${records.version}+1`,
      })
      .where(and(
        condition(u),
        eq(records.id, session.id),
        eq(records.version, session.version),
      ))
      .returning();
    if (!updated) throw new Error("Data sudah berubah. Muat ulang dahulu.");
    await log(tx, u, "honor-correction", {
      id: session.id,
      classId: classroom.id,
      programId: program.id,
      teacherId: teacher.id,
      previousHonor,
      newHonor,
      reason,
    });
    return updated;
  });
}

export async function voidRecord(db: any, u: User, id: string, reason: string) {
  if (u.role !== "owner")
    throw new Error("Hanya pemilik dapat membatalkan transaksi.");
  if (reason.trim().length < 5)
    throw new Error("Alasan pembatalan minimal 5 karakter.");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const rows = await allRows(tx, u),
      r = rows.find((r) => r.id === id);
    if (!r || !["payments", "sessions"].includes(r.kind))
      throw new Error("Transaksi tidak ditemukan.");
    await tx
      .update(records)
      .set({
        data: {
          ...r.data,
          [r.kind === "payments" ? "voided" : "cancelled"]: true,
          reason: reason.slice(0, 2000),
        },
        version: sql`${records.version}+1`,
      })
      .where(and(condition(u), eq(records.id, id)));
    await log(tx, u, "void", { id, reason });
  });
}
export async function snapshot(db: any, u: User, month: string) {
  const rows = await allRows(db, u);
  const visible = visibleRows(rows, u).map((r) => {
    if (u.role !== "admin") return r;
    const { honor, ...data } = r.data;
    return { ...r, data };
  });
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.id, u.tenantId));
  const result: any = { user: u, tenant, rows: visible };
  if (u.role === "owner") {
    result.report = cashReport(
      rows.filter((r) => r.kind === "payments").map((r) => r.data),
      rows.filter((r) => r.kind === "sessions").map((r) => r.data),
      rows
        .filter((r) => r.kind === "expenses" && !r.archived)
        .map((r) => r.data),
      month,
    );
    result.accounts = await db
      .select({
        id: accounts.id,
        name: accounts.name,
        email: accounts.email,
        username: accounts.username,
        role: accounts.role,
        teacherId: accounts.teacherId,
        active: accounts.active,
      })
      .from(accounts)
      .where(eq(accounts.tenantId, u.tenantId));
    result.audit = await db
      .select()
      .from(audit)
      .where(eq(audit.tenantId, u.tenantId))
      .orderBy(desc(audit.createdAt))
      .limit(100);
  }
  return result;
}
export async function saveSettings(db: any, u: User, input: Data) {
  guard(u, "settings");
  const dueDay = Number(input.dueDay);
  if (
    !input.name ||
    !Number.isInteger(dueDay) ||
    dueDay < 1 ||
    dueDay > 28 ||
    !["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"].includes(input.zone)
  )
    throw new Error(
      "Nama lembaga, zona waktu, dan jatuh tempo (1–28) wajib valid.",
    );
  const settings = {
    dueDay,
    zone: input.zone,
    address: String(input.address || "").slice(0, 1000),
    phone: String(input.phone || "").slice(0, 30),
    bank: String(input.bank || "").slice(0, 500),
    waTemplate: String(input.waTemplate || "").slice(0, 4000),
  };
  await db
    .update(tenants)
    .set({ name: String(input.name).slice(0, 150), settings })
    .where(eq(tenants.id, u.tenantId));
}
export async function saveAccount(db: any, u: User, input: Data) {
  guard(u, "accounts");
  if (input.id && input.edit === true) {
    const name = String(input.name || "").trim();
    const email = String(input.email || "").trim().toLowerCase();
    const username = String(input.username || "").trim().toLowerCase();
    const role = String(input.role || "");
    if (!name || name.length > 100 ||
      !/^\S+@\S+\.\S+$/.test(email) || email.length > 200 ||
      !/^[a-z0-9_.-]{3,40}$/.test(username) ||
      !["admin", "teacher"].includes(role))
      throw new Error("Nama, email, username, atau peran tidak valid.");
    return db.transaction(async (tx: any) => {
      await lock(tx, u);
      const [old] = await tx.select().from(accounts).where(
        and(eq(accounts.id, input.id), eq(accounts.tenantId, u.tenantId)),
      );
      if (!old || old.role === "owner" || old.id === u.id)
        throw new Error("Akun tidak tersedia untuk diedit.");
      if (role === "teacher") usable(await allRows(tx, u), input.teacherId, "teachers");
      await tx.update(accounts).set({
        name, email, username, role,
        teacherId: role === "teacher" ? input.teacherId : null,
      }).where(and(eq(accounts.id, old.id), eq(accounts.tenantId, u.tenantId)));
      await tx.delete(sessions).where(eq(sessions.accountId, old.id));
      await log(tx, u, "account-edit", { id: old.id, role, email, username });
    });
  }
  if (input.id) {
    if (input.id === u.id)
      throw new Error("Tidak dapat menonaktifkan akun sendiri.");
    return db.transaction(async (tx: any) => {
      await tx
        .update(accounts)
        .set({ active: input.active === true })
        .where(
          and(eq(accounts.id, input.id), eq(accounts.tenantId, u.tenantId)),
        );
      await tx.delete(sessions).where(eq(sessions.accountId, input.id));
      await log(tx, u, "account-status", {
        id: input.id,
        active: input.active,
      });
    });
  }
  const c = credentials(input);
  if (!["admin", "teacher"].includes(input.role))
    throw new Error("Peran tidak valid.");
  if (input.role === "teacher")
    usable(await allRows(db, u), input.teacherId, "teachers");
  await db
    .insert(accounts)
    .values({
      ...c,
      tenantId: u.tenantId,
      role: input.role,
      teacherId: input.role === "teacher" ? input.teacherId : null,
    });
  await log(db, u, "account-create", { email: c.email, role: input.role });
}

export async function deleteAccount(db: any, u: User, id: string) {
  if (u.role !== "owner") throw new Error("Akses ditolak.");
  if (!id || id === u.id) throw new Error("Tidak dapat menghapus akun sendiri.");
  return db.transaction(async (tx: any) => {
    await lock(tx, u);
    const [account] = await tx.select().from(accounts).where(
      and(eq(accounts.id, id), eq(accounts.tenantId, u.tenantId)),
    );
    if (!account || account.role === "owner")
      throw new Error("Hanya akun tim pada lembaga ini yang dapat dihapus.");
    await tx.delete(sessions).where(eq(sessions.accountId, id));
    await tx.delete(accounts).where(and(eq(accounts.id, id), eq(accounts.tenantId, u.tenantId)));
    await log(tx, u, "account-delete", {
      id, email: account.email, username: account.username, role: account.role,
    });
    return true;
  });
}
