export type Role = "owner" | "admin" | "teacher";
export type Data = Record<string, any>;
export type Row = {
  id: string;
  kind: string;
  data: Data;
  archived: boolean;
  version: number;
  createdAt?: string;
};
export type Field = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  options?: string[];
  ref?: string;
  min?: number;
  max?: number;
};
export const definitions: Record<
  string,
  { title: string; singular: string; fields: Field[] }
> = {
  programs: {
    title: "Program belajar",
    singular: "program",
    fields: [
      { key: "name", label: "Nama program", required: true },
      { key: "subject", label: "Mata pelajaran", required: true },
      {
        key: "level",
        label: "Jenjang",
        options: ["PAUD", "SD", "SMP", "SMA", "Umum"],
      },
      {
        key: "fee",
        label: "SPP bulanan (Rp)",
        type: "number",
        min: 0,
        required: true,
      },
      {
        key: "honor",
        label: "Honor per sesi (Rp)",
        type: "number",
        min: 0,
        required: true,
      },
      { key: "description", label: "Deskripsi", type: "textarea" },
    ],
  },
  teachers: {
    title: "Pengajar",
    singular: "pengajar",
    fields: [
      { key: "name", label: "Nama lengkap", required: true },
      { key: "phone", label: "WhatsApp", type: "tel", required: true },
      { key: "email", label: "Email", type: "email" },
      { key: "specialty", label: "Keahlian / mata pelajaran" },
      {
        key: "honor",
        label: "Honor khusus per sesi (kosong = tarif program)",
        type: "number",
        min: 0,
      },
      { key: "bank", label: "Bank & rekening" },
      { key: "address", label: "Alamat", type: "textarea" },
    ],
  },
  classes: {
    title: "Kelas & les privat",
    singular: "kelas",
    fields: [
      { key: "name", label: "Nama kelas", required: true },
      { key: "programId", label: "Program", ref: "programs", required: true },
      { key: "teacherId", label: "Pengajar", ref: "teachers", required: true },
      {
        key: "mode",
        label: "Jenis",
        options: ["Kelompok", "Privat", "Online"],
      },
      {
        key: "capacity",
        label: "Kapasitas siswa",
        type: "number",
        min: 1,
        required: true,
      },
      { key: "location", label: "Lokasi / tautan pertemuan", required: true },
      { key: "days", label: "Hari (pisahkan koma)", required: true },
      { key: "time", label: "Jam mulai", type: "time", required: true },
      { key: "endTime", label: "Jam selesai", type: "time", required: true },
    ],
  },
  students: {
    title: "Siswa & wali",
    singular: "siswa",
    fields: [
      { key: "name", label: "Nama siswa", required: true },
      {
        key: "gender",
        label: "Jenis kelamin",
        options: ["Laki-laki", "Perempuan"],
      },
      { key: "birthDate", label: "Tanggal lahir", type: "date" },
      { key: "school", label: "Sekolah asal" },
      { key: "grade", label: "Kelas / jenjang" },
      { key: "guardian", label: "Nama wali", required: true },
      { key: "phone", label: "WhatsApp wali", type: "tel", required: true },
      { key: "address", label: "Alamat", type: "textarea" },
      {
        key: "status",
        label: "Status",
        options: ["Aktif", "Cuti", "Berhenti"],
      },
      { key: "notes", label: "Catatan kebutuhan belajar", type: "textarea" },
    ],
  },
  enrollments: {
    title: "Pendaftaran kelas",
    singular: "pendaftaran",
    fields: [
      { key: "studentId", label: "Siswa", ref: "students", required: true },
      { key: "classId", label: "Kelas", ref: "classes", required: true },
      {
        key: "startDate",
        label: "Tanggal mulai",
        type: "date",
        required: true,
      },
      { key: "endDate", label: "Tanggal berhenti", type: "date" },
      { key: "discount", label: "Diskon bulanan (Rp)", type: "number", min: 0 },
      {
        key: "status",
        label: "Status",
        options: ["Aktif", "Cuti", "Berhenti"],
      },
    ],
  },
  expenses: {
    title: "Pengeluaran",
    singular: "pengeluaran",
    fields: [
      { key: "name", label: "Uraian", required: true },
      { key: "date", label: "Tanggal", type: "date", required: true },
      {
        key: "category",
        label: "Kategori",
        options: [
          "Sewa",
          "Listrik",
          "Modul",
          "Iklan",
          "Operasional",
          "Lainnya",
        ],
      },
      {
        key: "amount",
        label: "Jumlah (Rp)",
        type: "number",
        min: 1,
        required: true,
      },
      {
        key: "method",
        label: "Metode",
        options: ["Tunai", "Transfer", "QRIS"],
      },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  agendas: {
    title: "Agenda",
    singular: "agenda",
    fields: [
      { key: "name", label: "Judul agenda", required: true },
      { key: "date", label: "Tanggal", type: "date", required: true },
      { key: "time", label: "Jam mulai", type: "time", required: true },
      { key: "endTime", label: "Jam selesai", type: "time" },
      { key: "classId", label: "Kelas (opsional)", ref: "classes" },
      { key: "location", label: "Lokasi" },
      { key: "notes", label: "Catatan", type: "textarea" },
    ],
  },
  progress: {
    title: "Perkembangan belajar",
    singular: "catatan belajar",
    fields: [
      { key: "studentId", label: "Siswa", ref: "students", required: true },
      { key: "classId", label: "Kelas", ref: "classes", required: true },
      { key: "date", label: "Tanggal", type: "date", required: true },
      { key: "name", label: "Materi / evaluasi", required: true },
      {
        key: "score",
        label: "Nilai (0–100)",
        type: "number",
        min: 0,
        max: 100,
      },
      {
        key: "notes",
        label: "Capaian & tindak lanjut",
        type: "textarea",
        required: true,
      },
    ],
  },
};
export function canAccess(role: Role, kind: string) {
  return (
    role === "owner" ||
    (role === "admin" &&
      ![
        "expenses",
        "honors",
        "reports",
        "accounts",
        "audit",
        "settings",
      ].includes(kind)) ||
    (role === "teacher" &&
      [
        "classes",
        "students",
        "enrollments",
        "programs",
        "teachers",
        "sessions",
        "progress",
        "agendas",
      ].includes(kind))
  );
}
export function today(date = new Date(), zone = "Asia/Jakarta") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function normalizePhone(s: string) {
  let p = String(s).replace(/[^0-9]/g, "");
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (p.startsWith("8")) p = "62" + p;
  return p;
}
export function money(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}
export function invoiceBalance(total: number, payments: Data[]) {
  const valid = payments.filter((p) => !p.voided);
  const paid = valid.reduce((s, p) => s + Number(p.amount || 0), 0);
  const cash = valid
    .filter((p) => p.method !== "Dispensasi")
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  return {
    paid,
    cash,
    balance: Math.max(0, total - paid),
    status: paid >= total ? "Lunas" : paid > 0 ? "Kurang" : "Belum",
  };
}
export function cashReport(
  payments: Data[],
  sessions: Data[],
  expenses: Data[],
  month: string,
) {
  const income = payments
    .filter(
      (p) => !p.voided && p.method !== "Dispensasi" && p.date.startsWith(month),
    )
    .reduce((s, p) => s + Number(p.amount), 0);
  const honor = sessions
    .filter((s) => !s.cancelled && s.date.startsWith(month))
    .reduce((a, s) => a + Number(s.honor), 0);
  const out = expenses
    .filter((e) => e.date.startsWith(month))
    .reduce((a, e) => a + Number(e.amount), 0);
  return { income, honor, expenses: out, profit: income - honor - out };
}
export function validateData(kind: string, input: Data) {
  const def = definitions[kind];
  if (!def) throw new Error("Jenis data tidak tersedia.");
  const out: Data = {};
  for (const f of def.fields) {
    let v = input[f.key];
    if (typeof v === "string") v = v.trim();
    if (f.required && (v === "" || v === undefined || v === null))
      throw new Error(`${f.label} wajib diisi.`);
    if (v === "" || v === undefined || v === null) {
      out[f.key] = "";
      continue;
    }
    if (f.type === "number") {
      v = Number(v);
      if (
        !Number.isFinite(v) ||
        !Number.isInteger(v) ||
        v < (f.min ?? 0) ||
        v > (f.max ?? 1000000000)
      )
        throw new Error(`${f.label} tidak valid.`);
    } else {
      v = String(v);
      if (v.length > 4000) throw new Error(`${f.label} terlalu panjang.`);
      if (
        f.type === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(v) ||
          Number.isNaN(Date.parse(v)) ||
          new Date(v).toISOString().slice(0, 10) !== v)
      )
        throw new Error(`${f.label} tidak valid.`);
      if (f.type === "time" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v))
        throw new Error(`${f.label} tidak valid.`);
      if (
        f.options &&
        !f.options.includes(v) &&
        !["category", "level"].includes(f.key)
      )
        throw new Error(`${f.label} tidak valid.`);
      if (f.type === "tel" && !/^\d{9,15}$/.test(normalizePhone(v)))
        throw new Error(`${f.label} tidak valid.`);
    }
    out[f.key] = v;
  }
  if (out.endDate && out.endDate < out.startDate)
    throw new Error("Tanggal berhenti harus setelah tanggal mulai.");
  if (out.endTime && out.endTime <= out.time)
    throw new Error("Jam selesai harus setelah jam mulai.");
  if (kind === "classes") {
    const days = String(out.days)
      .split(",")
      .map((d) => d.trim());
    if (
      days.some(
        (d) =>
          ![
            "Senin",
            "Selasa",
            "Rabu",
            "Kamis",
            "Jumat",
            "Sabtu",
            "Minggu",
          ].includes(d),
      )
    )
      throw new Error(
        "Hari harus Senin, Selasa, Rabu, Kamis, Jumat, Sabtu atau Minggu.",
      );
    out.days = days.join(", ");
  }
  return out;
}
