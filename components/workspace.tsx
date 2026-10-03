"use client";
import { useCallback, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Wallet,
  Receipt,
  ChartNoAxesCombined,
  Settings,
  HelpCircle,
  LogOut,
  Menu,
  Sun,
  Moon,
  Plus,
  Search,
  Download,
  Upload,
  Archive,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Check,
  MessageCircle,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  X,
  History,
  FileText,
} from "lucide-react";
import {
  definitions,
  Data,
  Row,
  Field,
  money,
  today,
  invoiceBalance,
  normalizePhone,
  canAccess,
} from "../lib/domain";
import { downloadExcel, readExcel, templateFor } from "../lib/excel";
import Modal from "./modal";
const navigation = [
  ["dashboard", "Ringkasan", LayoutDashboard],
  ["students", "Siswa & wali", Users],
  ["teachers", "Pengajar", GraduationCap],
  ["programs", "Program belajar", BookOpen],
  ["classes", "Kelas & les privat", BookOpen],
  ["enrollments", "Pendaftaran kelas", Users],
  ["calendar", "Jadwal & agenda", CalendarDays],
  ["attendance", "Presensi", ClipboardCheck],
  ["progress", "Perkembangan belajar", ChartNoAxesCombined],
  ["invoices", "Tagihan SPP", Wallet],
  ["payments", "Pembayaran", Receipt],
  ["honors", "Honor pengajar", Wallet],
  ["expenses", "Pengeluaran", Receipt],
  ["reports", "Laporan", ChartNoAxesCombined],
  ["accounts", "Akses tim", ShieldCheck],
  ["audit", "Riwayat aktivitas", History],
  ["settings", "Pengaturan", Settings],
  ["guide", "Panduan", HelpCircle],
] as const;
async function api(path: string, data?: Data) {
  const r = await fetch("/api/" + path, {
    method: data ? "POST" : "GET",
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || "Permintaan gagal.");
  return j.result ?? j;
}
function Badge({ value }: { value: string }) {
  return (
    <span
      className={
        "badge " +
        (["Aktif", "Lunas", "Hadir"].includes(value)
          ? "good"
          : ["Kurang", "Cuti", "Izin"].includes(value)
            ? "warn"
            : ["Belum", "Alpa", "Berhenti", "Dibatalkan"].includes(value)
              ? "bad"
              : "")
      }
    >
      {value}
    </span>
  );
}
function Empty({
  title = "Belum ada data",
  text = "Tambahkan data pertama untuk mulai mengelola bimbel.",
  onAdd,
}: {
  title?: string;
  text?: string;
  onAdd?: () => void;
}) {
  return (
    <div className="empty">
      <BookOpen size={32} />
      <h3>{title}</h3>
      <p>{text}</p>
      {onAdd && (
        <button className="primary" onClick={onAdd}>
          <Plus size={16} /> Tambah data
        </button>
      )}
    </div>
  );
}
function Brand() {
  return (
    <div className="brand">
      <div className="logo">
        <img src="/logo.png" alt="Bantu Beres" />
      </div>
      <div>
        <strong>Bantu Beres</strong>
        <span>BIMBEL PRO</span>
      </div>
    </div>
  );
}
function FormFields({
  fields,
  values,
  setValues,
  rows,
}: {
  fields: Field[];
  values: Data;
  setValues: (d: Data) => void;
  rows: Row[];
}) {
  return (
    <div className="form-grid">
      {fields.map((f) => (
        <label className={f.type === "textarea" ? "wide" : ""} key={f.key}>
          {f.label}
          {f.required && <b className="required"> *</b>}
          {f.ref ? (
            <select
              required={f.required}
              value={values[f.key] || ""}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            >
              <option value="">Pilih {f.label.toLowerCase()}</option>
              {rows
                .filter((r) => r.kind === f.ref && !r.archived)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.data.name || r.id}
                  </option>
                ))}
            </select>
          ) : f.type === "textarea" ? (
            <textarea
              required={f.required}
              value={values[f.key] ?? ""}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            />
          ) : f.options && !["category", "level"].includes(f.key) ? (
            <select
              required={f.required}
              value={values[f.key] || f.options[0]}
              onChange={(e) =>
                setValues({ ...values, [f.key]: e.target.value })
              }
            >
              {f.options.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </select>
          ) : (
            <>
              <input
                list={f.options ? "list-" + f.key : undefined}
                required={f.required}
                type={f.type || "text"}
                min={f.min}
                max={f.max}
                maxLength={f.type === "number" ? undefined : 4000}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [f.key]: e.target.value })
                }
              />
              {f.options && (
                <datalist id={"list-" + f.key}>
                  {f.options.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              )}
            </>
          )}
        </label>
      ))}
    </div>
  );
}
export default function Workspace() {
  const [state, setState] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [configured, setConfigured] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [month, setMonth] = useState(today().slice(0, 7)),
    [page, setPage] = useState("dashboard"),
    [dark, setDark] = useState(false),
    [menu, setMenu] = useState(false),
    [busy, setBusy] = useState(false),
    [authMode, setAuthMode] = useState("login"),
    [auth, setAuth] = useState<Data>({}),
    [search, setSearch] = useState(""),
    [archived, setArchived] = useState(false),
    [filter, setFilter] = useState(""),
    [selection, setSelection] = useState<string[]>([]),
    [form, setForm] = useState<any>(null),
    [values, setValues] = useState<Data>({}),
    [confirmation, setConfirmation] = useState<any>(null),
    [importRows, setImportRows] = useState<Data[] | null>(null),
    [date, setDate] = useState(today()),
    [selectedClass, setSelectedClass] = useState(""),
    [presensi, setPresensi] = useState<Data[]>([]),
    [material, setMaterial] = useState(""),
    [payment, setPayment] = useState<Row | null>(null),
    [receipt, setReceipt] = useState<Row | null>(null),
    [reason, setReason] = useState(""),
    [settings, setSettings] = useState<Data>({});
  const refresh = useCallback(async () => {
    try {
      const s = await api("state?month=" + month);
      setState(s);
      setSettings({ name: s.tenant.name, ...s.tenant.settings });
      setError("");
    } catch (e) {
      const m = (e as Error).message;
      if (m === "Silakan masuk kembali.") setState(null);
      else setError(m);
    } finally {
      setLoading(false);
    }
  }, [month]);
  useEffect(() => {
    api("health")
      .then((h) => {
        setConfigured(h.configured);
        if (h.configured) refresh();
        else setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
    const pref = localStorage.getItem("bb-theme") === "dark";
    setDark(pref);
  }, [refresh]);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("bb-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(t);
    }
  }, [toast]);
  const rows: Row[] = state?.rows || [],
    active = rows.filter((r) => !r.archived),
    user = state?.user;
  const named = (id: string) =>
    rows.find((r) => r.id === id)?.data.name ||
    rows.find((r) => r.id === id)?.data.studentName ||
    "—";
  const kindRows = (k: string) => active.filter((r) => r.kind === k);
  function go(p: string) {
    setPage(p);
    setMenu(false);
    setSearch("");
    setFilter("");
    setSelection([]);
    setArchived(false);
  }
  async function run(
    fn: () => Promise<any>,
    message = "Data berhasil disimpan.",
  ) {
    setBusy(true);
    setError("");
    try {
      const result = await fn();
      await refresh();
      setToast(message);
      return result;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setBusy(false);
    }
  }
  function add(kind: string, row?: Row) {
    const def = definitions[kind];
    setValues(
      row
        ? { ...row.data }
        : Object.fromEntries(
            def.fields.map((f) => [
              f.key,
              f.options?.[0] ??
                (f.type === "date"
                  ? today()
                  : f.type === "number" && f.min === 0
                    ? 0
                    : ""),
            ]),
          ),
    );
    setForm({ kind, row });
    setError("");
  }
  const showValue = (f: Field, data: Data) =>
    f.ref
      ? named(data[f.key])
      : f.type === "number" &&
          ["amount", "fee", "honor", "discount"].includes(f.key)
        ? money(Number(data[f.key]))
        : String(data[f.key] ?? "—");
  const invs = kindRows("invoices").map((r) => ({
    ...r,
    summary: invoiceBalance(
      r.data.amount,
      kindRows("payments")
        .filter((p) => p.data.invoiceId === r.id)
        .map((p) => p.data),
    ),
  }));
  const visibleNav = navigation.filter(
    ([id]) =>
      ["dashboard", "calendar", "attendance", "guide"].includes(id) ||
      (id === "honors" && user?.role === "teacher") ||
      canAccess(user?.role, id),
  );
  const onImport = async (file: File) => {
    try {
      setImportRows(await readExcel(file));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  function wa(studentId: string, text: string) {
    const s = rows.find((r) => r.id === studentId);
    if (!s?.data.phone) {
      setError("Nomor WhatsApp wali belum diisi.");
      return;
    }
    window.open(
      "https://wa.me/" +
        normalizePhone(s.data.phone) +
        "?text=" +
        encodeURIComponent(text),
      "_blank",
      "noopener,noreferrer",
    );
  }
  function reminder(inv: any) {
    const s = rows.find((r) => r.id === inv.data.studentId)?.data || {};
    const t = state.tenant.settings;
    let msg =
      t.waTemplate ||
      "Yth. {wali}, SPP {siswa} bulan {bulan} tersisa {jumlah}. Jatuh tempo {tempo}. Pembayaran: {rekening}.";
    const replacements: Data = {
      wali: s.guardian,
      siswa: s.name,
      bulan: inv.data.month,
      jumlah: money(inv.summary.balance),
      tempo: inv.data.month + "-" + String(t.dueDay || 10).padStart(2, "0"),
      rekening: t.bank || "hubungi admin",
    };
    for (const [k, v] of Object.entries(replacements))
      msg = msg.replaceAll("{" + k + "}", String(v || ""));
    wa(inv.data.studentId, msg);
  }
  useEffect(() => {
    if (!selectedClass) return;
    const old = rows.find(
      (r) =>
        r.kind === "sessions" &&
        r.data.classId === selectedClass &&
        r.data.date === date,
    );
    const students = [
      ...new Set(
        rows
          .filter(
            (r) =>
              r.kind === "enrollments" &&
              !r.archived &&
              r.data.classId === selectedClass &&
              r.data.status === "Aktif" &&
              r.data.startDate <= date &&
              (!r.data.endDate || r.data.endDate >= date),
          )
          .map((r) => r.data.studentId),
      ),
    ].filter((id) =>
      rows.some((s) => s.id === id && !s.archived && s.data.status === "Aktif"),
    );
    setPresensi(
      students.map((id) => ({
        studentId: id,
        status:
          old?.data.attendance.find((a: Data) => a.studentId === id)?.status ||
          "Hadir",
      })),
    );
    setMaterial(old?.data.material || "");
  }, [state, selectedClass, date]);
  if (loading)
    return (
      <div className="loading">
        <Brand />
        <div className="spinner" />
        <p>Menyiapkan ruang belajar…</p>
      </div>
    );
  if (!state)
    return (
      <div className="auth-page">
        <aside className="auth-story">
          <Brand />
          <div>
            <span className="eyebrow">RUANG KERJA BIMBEL ANDA</span>
            <h1>
              Belajar berjalan.
              <br />
              Administrasi beres.
            </h1>
            <p>Siswa, jadwal, presensi, dan keuangan dalam satu tempat.</p>
            <div className="story-list">
              {[
                "Jadwal kelas mudah dipantau",
                "SPP dan cicilan tercatat rapi",
                "Honor terhitung dari sesi mengajar",
              ].map((t) => (
                <div key={t}>
                  <Check size={18} />
                  {t}
                </div>
              ))}
            </div>
          </div>
          <small>Bantu Beres Bimbel Pro</small>
        </aside>
        <main className="auth-main">
          <button
            className="theme icon"
            onClick={() => setDark(!dark)}
            aria-label="Ubah tema"
          >
            {dark ? <Sun /> : <Moon />}
          </button>
          <div className="auth-card">
            <div className="mobile-brand">
              <Brand />
            </div>
            <h2>
              {authMode === "login"
                ? "Selamat datang kembali"
                : "Mulai kelola bimbel Anda"}
            </h2>
            <p>
              {authMode === "login"
                ? "Masuk ke ruang kerja bimbel Anda."
                : "Buat akun pemilik dan lembaga baru."}
            </p>
            {!configured && (
              <div className="notice">
                <strong>Database belum terhubung</strong>
                <p>
                  Aplikasi siap disambungkan ke project Neon baru. Isi
                  DATABASE_URL dan jalankan migrasi sesuai panduan repository
                  sebelum mendaftar.
                </p>
              </div>
            )}
            {error && (
              <div role="alert" className="alert">
                {error}
              </div>
            )}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                try {
                  await api(
                    "auth/" + (authMode === "login" ? "login" : "register"),
                    auth,
                  );
                  await refresh();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {authMode === "register" && (
                <FormFields
                  fields={[
                    { key: "business", label: "Nama bimbel", required: true },
                    { key: "name", label: "Nama pemilik", required: true },
                    {
                      key: "email",
                      label: "Email",
                      type: "email",
                      required: true,
                    },
                    { key: "username", label: "Username", required: true },
                  ]}
                  values={auth}
                  setValues={setAuth}
                  rows={[]}
                />
              )}
              <label>
                {authMode === "login" ? "Email atau username" : ""}
                {authMode === "login" && (
                  <input
                    autoComplete="username"
                    required
                    value={auth.identifier || ""}
                    onChange={(e) =>
                      setAuth({ ...auth, identifier: e.target.value })
                    }
                  />
                )}
              </label>
              <label>
                {authMode === "login"
                  ? "Password"
                  : "Password (minimal 8 karakter)"}
                <input
                  type="password"
                  autoComplete={
                    authMode === "login" ? "current-password" : "new-password"
                  }
                  minLength={authMode === "register" ? 8 : undefined}
                  required
                  value={auth.password || ""}
                  onChange={(e) =>
                    setAuth({ ...auth, password: e.target.value })
                  }
                />
              </label>
              <button className="primary full" disabled={busy || !configured}>
                {busy
                  ? "Memproses…"
                  : authMode === "login"
                    ? "Masuk"
                    : "Daftar bimbel"}
              </button>
            </form>
            <p className="auth-switch">
              {authMode === "login"
                ? "Belum memiliki akun?"
                : "Sudah memiliki akun?"}{" "}
              <button
                className="link"
                onClick={() => {
                  setAuthMode(authMode === "login" ? "register" : "login");
                  setAuth({});
                  setError("");
                }}
              >
                {authMode === "login" ? "Daftar bimbel" : "Masuk"}
              </button>
            </p>
            <small>
              Pengajar dan admin menggunakan akun yang dibuat pemilik.
            </small>
          </div>
        </main>
      </div>
    );
  const sourceDef = definitions[page],
    def =
      sourceDef && user.role === "admin"
        ? {
            ...sourceDef,
            fields: sourceDef.fields.filter((f) => f.key !== "honor"),
          }
        : sourceDef,
    canWrite =
      user.role === "owner" ||
      (user.role === "admin" && !["programs", "teachers"].includes(page)) ||
      (user.role === "teacher" && page === "progress"),
    tableRows = def
      ? rows.filter(
          (r) =>
            r.kind === page &&
            r.archived === archived &&
            (!filter ||
              r.data.status === filter ||
              r.data.classId === filter) &&
            Object.values(r.data)
              .map((v) => named(String(v)) + " " + String(v))
              .join(" ")
              .toLowerCase()
              .includes(search.toLowerCase()),
        )
      : [];
  const title = navigation.find((n) => n[0] === page)?.[1] || "Ringkasan";
  const classToday = kindRows("classes").filter((c) =>
    String(c.data.days)
      .split(",")
      .map((s: string) => s.trim())
      .includes(
        new Intl.DateTimeFormat("id-ID", {
          weekday: "long",
          timeZone: state.tenant.settings.zone || "Asia/Jakarta",
        }).format(new Date()),
      ),
  );
  const stats = state.report;
  return (
    <div className="app-shell">
      {menu && (
        <button
          className="scrim"
          aria-label="Tutup navigasi"
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <Brand />
        <div className="business">
          <span className="business-icon">
            <GraduationCap size={20} />
          </span>
          <div>
            <strong>{state.tenant.name}</strong>
            <small>
              {user.role === "owner"
                ? "Pemilik"
                : user.role === "admin"
                  ? "Admin"
                  : "Pengajar"}
            </small>
          </div>
        </div>
        <nav>
          {visibleNav.map(([id, label, Icon], i) => (
            <div key={id}>
              {[1, 6, 9, 14].includes(i) && (
                <span className="nav-label">
                  {i === 1
                    ? "DATA BIMBEL"
                    : i === 6
                      ? "KEGIATAN BELAJAR"
                      : i === 9
                        ? "KEUANGAN"
                        : "LEMBAGA"}
                </span>
              )}
              <button
                className={page === id ? "active" : ""}
                onClick={() => go(id)}
              >
                <Icon size={19} />
                {label}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user.name.charAt(0)}</div>
          <div>
            <strong>{user.name}</strong>
            <small>
              {user.role === "owner"
                ? "Pemilik bimbel"
                : user.role === "teacher"
                  ? "Pengajar"
                  : "Admin operasional"}
            </small>
          </div>
          <button
            className="icon"
            aria-label="Keluar"
            onClick={() => setConfirmation({ logout: true })}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <div>
            <button
              className="icon mobile-menu"
              aria-label="Buka navigasi"
              onClick={() => setMenu(!menu)}
            >
              <Menu />
            </button>
            <span>
              Bimbel Pro <span className="divider">/</span>{" "}
              <strong>{title}</strong>
            </span>
          </div>
          <div className="top-actions">
            <button
              className="icon"
              aria-label="Muat ulang"
              onClick={() => refresh()}
            >
              <RefreshCw size={18} />
            </button>
            <button
              className="icon"
              aria-label="Ubah tema"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun size={19} /> : <Moon size={19} />}
            </button>
            <span className="avatar small">{user.name.charAt(0)}</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "dashboard"
                  ? "AKTIVITAS BIMBEL"
                  : state.tenant.name.toUpperCase()}
              </span>
              <h1>
                {page === "dashboard"
                  ? "Selamat datang, " + user.name.split(" ")[0]
                  : title}
              </h1>
              <p>
                {page === "dashboard"
                  ? "Pantau kegiatan belajar dan administrasi hari ini."
                  : def
                    ? "Kelola " +
                      def.title.toLowerCase() +
                      " dengan data yang terhubung."
                    : page === "invoices"
                      ? "Tagihan bulanan, cicilan, dan pengingat wali siswa."
                      : page === "attendance"
                        ? "Catat kehadiran setelah kelas selesai."
                        : ""}
              </p>
            </div>
            {[
              "dashboard",
              "invoices",
              "payments",
              "honors",
              "reports",
              "calendar",
            ].includes(page) && (
              <label className="month-picker">
                Periode
                <input
                  type="month"
                  value={month}
                  onChange={(e) => { if (e.target.value) setMonth(e.target.value); }}
                  required
                />
              </label>
            )}
            {def &&
              !(
                user.role === "admin" && ["programs", "teachers"].includes(page)
              ) &&
              user.role !== "teacher" && (
                <button className="primary" onClick={() => add(page)}>
                  <Plus size={18} />
                  Tambah {def.singular}
                </button>
              )}
          </div>
          {error && (
            <div role="alert" className="alert dismissible">
              {error}
              <button
                className="icon"
                aria-label="Tutup pesan"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "dashboard" && (
            <>
              <div className="stat-grid">
                <Stat
                  title="Siswa aktif"
                  value={String(
                    kindRows("students").filter(
                      (r) => r.data.status === "Aktif",
                    ).length,
                  )}
                  icon={<Users />}
                  note="Terdaftar di bimbel"
                />
                <Stat
                  title={
                    user.role === "teacher"
                      ? "Sesi mengajar"
                      : "Pemasukan bulan ini"
                  }
                  value={
                    user.role === "teacher"
                      ? String(
                          kindRows("sessions").filter(
                            (r) =>
                              r.data.date.startsWith(month) &&
                              !r.data.cancelled,
                          ).length,
                        )
                      : money(
                          kindRows("payments")
                            .filter(
                              (r) =>
                                r.data.date.startsWith(month) &&
                                !r.data.voided &&
                                r.data.method !== "Dispensasi",
                            )
                            .reduce((a, r) => a + Number(r.data.amount), 0),
                        )
                  }
                  icon={<Wallet />}
                  note={
                    user.role === "teacher"
                      ? "Sesi selesai"
                      : "Kas diterima pada periode ini"
                  }
                />
                <Stat
                  title={
                    user.role === "teacher"
                      ? "Perkiraan honor"
                      : "SPP belum terbayar"
                  }
                  value={
                    user.role === "teacher"
                      ? money(
                          kindRows("sessions")
                            .filter(
                              (r) =>
                                r.data.date.startsWith(month) &&
                                !r.data.cancelled,
                            )
                            .reduce((a, r) => a + Number(r.data.honor), 0),
                        )
                      : money(
                          invs
                            .filter((r) => r.data.month <= month)
                            .reduce((a, r) => a + r.summary.balance, 0),
                        )
                  }
                  icon={<Receipt />}
                  note={
                    user.role === "teacher"
                      ? "Dari presensi tercatat"
                      : "Sisa tagihan sampai periode ini"
                  }
                />
                <Stat
                  title={stats ? "Laba bulan ini" : "Kelas aktif"}
                  value={
                    stats
                      ? money(stats.profit)
                      : String(kindRows("classes").length)
                  }
                  icon={<ChartNoAxesCombined />}
                  note={
                    stats ? "Pemasukan − honor − biaya" : "Kelas dan les privat"
                  }
                />
              </div>
              <div className="two-columns">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Jadwal hari ini</h2>
                      <p>
                        {new Intl.DateTimeFormat("id-ID", {
                          dateStyle: "full",
                        }).format(new Date())}
                      </p>
                    </div>
                    <button className="link" onClick={() => go("calendar")}>
                      Lihat kalender
                    </button>
                  </div>
                  {classToday.length ? (
                    classToday.map((c) => (
                      <div className="schedule-row" key={c.id}>
                        <div className="time-block">
                          {c.data.time}
                          <small>{c.data.endTime}</small>
                        </div>
                        <div className="grow">
                          <strong>{c.data.name}</strong>
                          <small>
                            {named(c.data.teacherId)} · {c.data.location}
                          </small>
                        </div>
                        <button
                          className="soft"
                          onClick={() => {
                            go("attendance");
                            setSelectedClass(c.id);
                            setDate(today());
                          }}
                        >
                          {kindRows("sessions").some(
                            (r) =>
                              r.data.classId === c.id &&
                              r.data.date === today() &&
                              !r.data.cancelled,
                          )
                            ? "Tercatat"
                            : "Presensi"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <Empty
                      title="Tidak ada kelas hari ini"
                      text="Jadwal mengikuti hari yang diatur pada data kelas."
                    />
                  )}
                </section>
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Langkah cepat</h2>
                  </div>
                  <div className="quick-actions">
                    {(user.role === "teacher"
                      ? [
                          ["attendance", "Catat presensi", ClipboardCheck],
                          [
                            "progress",
                            "Catatan perkembangan",
                            ChartNoAxesCombined,
                          ],
                          ["honors", "Riwayat honor", Wallet],
                        ]
                      : [
                          ["students", "Daftarkan siswa", Users],
                          ["invoices", "Catat pembayaran", Receipt],
                          ["attendance", "Catat presensi", ClipboardCheck],
                        ]
                    ).map(([p, t, I]: any) => (
                      <button key={p} onClick={() => go(p)}>
                        <I size={20} />
                        <span>{t}</span>
                        <ArrowUpRight size={16} />
                      </button>
                    ))}
                  </div>
                  <div className="onboarding">
                    <strong>Mulai dengan data yang rapi</strong>
                    <p>
                      Program → pengajar → kelas → siswa → pendaftaran. Setelah
                      itu, jadwal dan tagihan siap dikelola.
                    </p>
                    <button className="link" onClick={() => go("guide")}>
                      Buka panduan
                    </button>
                  </div>
                </section>
              </div>
              {user.role !== "teacher" && (
                <section className="panel">
                  <div className="panel-heading">
                    <h2>Tagihan perlu ditindaklanjuti</h2>
                    <button className="link" onClick={() => go("invoices")}>
                      Semua tagihan
                    </button>
                  </div>
                  {invs.filter(
                    (r) => r.summary.balance > 0 && r.data.month <= month,
                  ).length ? (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Siswa</th>
                            <th>Periode</th>
                            <th>Sisa tagihan</th>
                            <th>Status</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {invs
                            .filter(
                              (r) =>
                                r.summary.balance > 0 && r.data.month <= month,
                            )
                            .sort(
                              (a, b) => b.summary.balance - a.summary.balance,
                            )
                            .slice(0, 5)
                            .map((r) => (
                              <tr key={r.id}>
                                <td>
                                  <strong>{r.data.studentName}</strong>
                                  <small>{r.data.className}</small>
                                </td>
                                <td>{r.data.month}</td>
                                <td>{money(r.summary.balance)}</td>
                                <td>
                                  <Badge value={r.summary.status} />
                                </td>
                                <td>
                                  <button
                                    className="soft"
                                    onClick={() => reminder(r)}
                                  >
                                    <MessageCircle size={16} />
                                    Ingatkan
                                  </button>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <Empty
                      title="Tidak ada tunggakan tercatat"
                      text="Buat tagihan bulanan di menu Tagihan SPP setelah pendaftaran selesai."
                    />
                  )}
                </section>
              )}
            </>
          )}
          {def && (
            <section className="panel">
              <div className="toolbar">
                <div className="search">
                  <Search size={18} />
                  <input
                    aria-label="Cari data"
                    placeholder={"Cari " + def.singular + "…"}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  aria-label="Filter status atau kelas"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="">
                    Semua{" "}
                    {def.fields.some((f) => f.key === "status")
                      ? "status"
                      : "kelas"}
                  </option>
                  {def.fields.some((f) => f.key === "status")
                    ? ["Aktif", "Cuti", "Berhenti"].map((s) => (
                        <option key={s}>{s}</option>
                      ))
                    : kindRows("classes").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.data.name}
                        </option>
                      ))}
                </select>
                <button
                  className="soft"
                  onClick={() => {
                    setArchived(!archived);
                    setSelection([]);
                  }}
                >
                  <Archive size={16} />
                  {archived ? "Data aktif" : "Arsip"}
                </button>
                <button
                  className="soft"
                  onClick={() =>
                    templateFor(page, rows).catch((e) => setError(e.message))
                  }
                >
                  <Download size={16} />
                  Template Excel
                </button>
                {user.role !== "teacher" && canWrite && (
                  <label className="button soft">
                    <Upload size={16} />
                    Impor Excel
                    <input
                      hidden
                      type="file"
                      accept=".xlsx"
                      onChange={(e) => {
                        if (e.target.files?.[0]) onImport(e.target.files[0]);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <button
                  className="soft"
                  onClick={() =>
                    downloadExcel(
                      page,
                      tableRows.map((r) => ({ id: r.id, ...r.data })),
                    ).catch((e) => setError(e.message))
                  }
                >
                  <Download size={16} />
                  Ekspor
                </button>
              </div>
              {selection.length > 0 && (
                <div className="selection-bar">
                  <strong>{selection.length} dipilih</strong>
                  <button
                    onClick={() =>
                      setConfirmation({
                        ids: selection,
                        action: archived ? "restore" : "archive",
                      })
                    }
                  >
                    {archived ? "Pulihkan" : "Arsipkan"}
                  </button>
                  {archived && (
                    <button
                      onClick={() =>
                        setConfirmation({ ids: selection, action: "delete" })
                      }
                    >
                      Hapus permanen
                    </button>
                  )}
                  <button onClick={() => setSelection([])}>Batal pilih</button>
                </div>
              )}
              {tableRows.length ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {user.role !== "teacher" && (
                          <th>
                            <input
                              type="checkbox"
                              aria-label="Pilih semua"
                              checked={selection.length === tableRows.length}
                              onChange={(e) =>
                                setSelection(
                                  e.target.checked
                                    ? tableRows.map((r) => r.id)
                                    : [],
                                )
                              }
                            />
                          </th>
                        )}
                        {def.fields
                          .filter((f) => f.type !== "textarea")
                          .slice(0, 6)
                          .map((f) => (
                            <th key={f.key}>{f.label}</th>
                          ))}
                        <th>Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows.map((r) => (
                        <tr key={r.id}>
                          {user.role !== "teacher" && (
                            <td>
                              <input
                                type="checkbox"
                                aria-label={
                                  "Pilih " +
                                  (r.data.name || named(r.data.studentId))
                                }
                                checked={selection.includes(r.id)}
                                onChange={(e) =>
                                  setSelection(
                                    e.target.checked
                                      ? [...selection, r.id]
                                      : selection.filter((id) => id !== r.id),
                                  )
                                }
                              />
                            </td>
                          )}
                          {def.fields
                            .filter((f) => f.type !== "textarea")
                            .slice(0, 6)
                            .map((f) => (
                              <td key={f.key}>
                                {f.key === "status" ? (
                                  <Badge value={r.data[f.key]} />
                                ) : (
                                  showValue(f, r.data)
                                )}
                              </td>
                            ))}
                          <td>
                            <div className="row-actions">
                              {!archived && canWrite && (
                                <button
                                  className="icon"
                                  aria-label="Edit"
                                  onClick={() => add(page, r)}
                                >
                                  <Pencil size={16} />
                                </button>
                              )}
                              {user.role !== "teacher" && (
                                <button
                                  className="icon"
                                  aria-label={
                                    archived ? "Pulihkan" : "Arsipkan"
                                  }
                                  onClick={() =>
                                    setConfirmation({
                                      ids: [r.id],
                                      action: archived ? "restore" : "archive",
                                    })
                                  }
                                >
                                  <Archive size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title={
                    archived
                      ? "Arsip kosong"
                      : search || filter
                        ? "Data tidak ditemukan"
                        : "Belum ada " + def.singular
                  }
                  text={
                    search || filter
                      ? "Coba ubah pencarian atau filter."
                      : "Tambahkan data atau impor menggunakan template Excel."
                  }
                  onAdd={
                    !archived && canWrite && user.role !== "teacher"
                      ? () => add(page)
                      : undefined
                  }
                />
              )}
              <div className="table-foot">
                {tableRows.length} data{" "}
                {archived ? "diarsipkan" : "ditampilkan"}
              </div>
            </section>
          )}
          {page === "calendar" && (
            <div className="two-columns calendar-layout">
              <section className="panel calendar-panel">
                <div className="panel-heading">
                  <h2>
                    {new Intl.DateTimeFormat("id-ID", {
                      month: "long",
                      year: "numeric",
                    }).format(new Date(month + "-01T12:00:00"))}
                  </h2>
                  <div className="row-actions">
                    <button
                      className="icon"
                      aria-label="Bulan sebelumnya"
                      onClick={() => {
                        const d = new Date(month + "-01T12:00:00");
                        d.setMonth(d.getMonth() - 1);
                        setMonth(
                          d.getFullYear() +
                            "-" +
                            String(d.getMonth() + 1).padStart(2, "0"),
                        );
                      }}
                    >
                      <ChevronLeft />
                    </button>
                    <button
                      className="icon"
                      aria-label="Bulan berikutnya"
                      onClick={() => {
                        const d = new Date(month + "-01T12:00:00");
                        d.setMonth(d.getMonth() + 1);
                        setMonth(
                          d.getFullYear() +
                            "-" +
                            String(d.getMonth() + 1).padStart(2, "0"),
                        );
                      }}
                    >
                      <ChevronRight />
                    </button>
                  </div>
                </div>
                <div className="calendar-grid">
                  {["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"].map(
                    (d) => (
                      <span className="weekday" key={d}>
                        {d}
                      </span>
                    ),
                  )}
                  {Array.from(
                    { length: new Date(month + "-01T12:00:00").getDay() },
                    (_, i) => (
                      <span key={"blank" + i} />
                    ),
                  )}
                  {Array.from(
                    {
                      length: new Date(
                        Number(month.slice(0, 4)),
                        Number(month.slice(5)),
                        0,
                      ).getDate(),
                    },
                    (_, i) => {
                      const d = month + "-" + String(i + 1).padStart(2, "0"),
                        day = new Intl.DateTimeFormat("id-ID", {
                          weekday: "long",
                        }).format(new Date(d + "T12:00:00"));
                      const has =
                        kindRows("agendas").some((a) => a.data.date === d) ||
                        kindRows("classes").some((c) =>
                          String(c.data.days)
                            .split(",")
                            .map((x: string) => x.trim())
                            .includes(day),
                        );
                      return (
                        <button
                          key={d}
                          className={
                            (date === d ? "selected " : "") +
                            (d === today() ? "today" : "")
                          }
                          onClick={() => setDate(d)}
                        >
                          {i + 1}
                          {has && <i />}
                        </button>
                      );
                    },
                  )}
                </div>
                <div className="legend">
                  <i />
                  Ada jadwal kelas atau agenda
                </div>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>{date}</h2>
                  <button
                    className="soft"
                    onClick={() => {
                      add("agendas");
                      setValues((v) => ({ ...v, date }));
                    }}
                  >
                    <Plus size={16} />
                    Agenda
                  </button>
                </div>
                {kindRows("classes")
                  .filter((c) =>
                    String(c.data.days)
                      .split(",")
                      .map((x: string) => x.trim())
                      .includes(
                        new Intl.DateTimeFormat("id-ID", {
                          weekday: "long",
                        }).format(new Date(date + "T12:00:00")),
                      ),
                  )
                  .map((c) => (
                    <div className="schedule-row" key={c.id}>
                      <div className="time-block">{c.data.time}</div>
                      <div className="grow">
                        <strong>{c.data.name}</strong>
                        <small>
                          {named(c.data.teacherId)} · {c.data.location}
                        </small>
                      </div>
                    </div>
                  ))}
                {kindRows("agendas")
                  .filter((a) => a.data.date === date)
                  .map((a) => (
                    <div className="schedule-row" key={a.id}>
                      <div className="time-block">{a.data.time}</div>
                      <div className="grow">
                        <strong>{a.data.name}</strong>
                        <small>{a.data.notes}</small>
                      </div>
                      <button
                        className="icon"
                        aria-label="Edit agenda"
                        onClick={() => add("agendas", a)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon"
                        aria-label="Arsip agenda"
                        onClick={() =>
                          setConfirmation({ ids: [a.id], action: "archive" })
                        }
                      >
                        <Archive size={16} />
                      </button>
                    </div>
                  ))}
                <div className="panel-heading">
                  <h3>Rekap agenda {month}</h3>
                  <button
                    className="link"
                    onClick={() =>
                      downloadExcel(
                        "agenda-" + month,
                        kindRows("agendas")
                          .filter((a) => a.data.date.startsWith(month))
                          .map((a) => a.data),
                      )
                    }
                  >
                    Excel
                  </button>
                </div>
                {kindRows("agendas")
                  .filter((a) => a.data.date.startsWith(month))
                  .map((a) => (
                    <button
                      className="agenda-summary"
                      key={a.id}
                      onClick={() => setDate(a.data.date)}
                    >
                      <small>{a.data.date}</small>
                      <strong>{a.data.name}</strong>
                    </button>
                  ))}
                <button className="link" onClick={() => go("agendas")}>
                  Kelola semua agenda & impor
                </button>
              </section>
            </div>
          )}
          {page === "attendance" && (
            <>
              <section className="panel">
                <div className="toolbar">
                  <label>
                    Tanggal
                    <input
                      type="date"
                      value={date}
                      max={today()}
                      onChange={(e) => setDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Kelas
                    <select
                      value={selectedClass}
                      onChange={(e) => setSelectedClass(e.target.value)}
                    >
                      <option value="">Pilih kelas</option>
                      {kindRows("classes").map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.data.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    className="soft"
                    onClick={() =>
                      downloadExcel(
                        "rekap-presensi-" + month,
                        kindRows("sessions")
                          .filter((r) => r.data.date.startsWith(month))
                          .flatMap((r) =>
                            r.data.attendance.map((a: Data) => ({
                              tanggal: r.data.date,
                              kelas: named(r.data.classId),
                              siswa: named(a.studentId),
                              status: a.status,
                              materi: r.data.material,
                            })),
                          ),
                      )
                    }
                  >
                    <Download size={16} />
                    Rekap Excel
                  </button>
                </div>
                {selectedClass && presensi.length ? (
                  <>
                    <div className="attendance-list">
                      {presensi.map((a) => (
                        <div key={a.studentId}>
                          <div className="avatar">
                            {named(a.studentId).charAt(0)}
                          </div>
                          <strong>{named(a.studentId)}</strong>
                          <select
                            aria-label={"Status " + named(a.studentId)}
                            value={a.status}
                            onChange={(e) =>
                              setPresensi(
                                presensi.map((p) =>
                                  p.studentId === a.studentId
                                    ? { ...p, status: e.target.value }
                                    : p,
                                ),
                              )
                            }
                          >
                            {["Hadir", "Izin", "Sakit", "Alpa"].map((s) => (
                              <option key={s}>{s}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <label className="material">
                      Materi & catatan pertemuan
                      <textarea
                        value={material}
                        onChange={(e) => setMaterial(e.target.value)}
                      />
                    </label>
                    <div className="form-footer">
                      <span>
                        {presensi.filter((a) => a.status === "Hadir").length}{" "}
                        hadir dari {presensi.length} siswa
                      </span>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          run(
                            () =>
                              api("attendance", {
                                classId: selectedClass,
                                date,
                                attendance: presensi,
                                material,
                              }),
                            "Presensi tersimpan. Honor sesi diperbarui.",
                          ).catch(() => {})
                        }
                      >
                        <Check size={18} />
                        {busy ? "Menyimpan…" : "Simpan presensi"}
                      </button>
                    </div>
                  </>
                ) : (
                  <Empty
                    title={
                      selectedClass
                        ? "Belum ada siswa aktif"
                        : "Pilih kelas untuk mencatat presensi"
                    }
                    text="Pastikan siswa sudah didaftarkan ke kelas dan tanggal mulai sesuai."
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Riwayat sesi</h2>
                </div>
                {kindRows("sessions")
                  .filter((s) => s.data.date.startsWith(month))
                  .map((s) => (
                    <div className="schedule-row" key={s.id}>
                      <div className="grow">
                        <strong>
                          {named(s.data.classId)} · {s.data.date}
                        </strong>
                        <small>
                          {s.data.material || "Tanpa catatan materi"}
                        </small>
                      </div>
                      <Badge
                        value={s.data.cancelled ? "Dibatalkan" : "Tercatat"}
                      />
                      <button
                        className="link"
                        onClick={() => {
                          setSelectedClass(s.data.classId);
                          setDate(s.data.date);
                        }}
                      >
                        Buka
                      </button>
                      {user.role === "owner" && !s.data.cancelled && (
                        <button
                          className="link danger"
                          onClick={() => {
                            setReason("");
                            setConfirmation({ voidId: s.id });
                          }}
                        >
                          Batalkan sesi
                        </button>
                      )}
                    </div>
                  ))}
              </section>
            </>
          )}
          {page === "invoices" && (
            <>
              <div className="stat-grid three">
                <Stat
                  title="Total tagihan"
                  value={money(
                    invs
                      .filter((r) => r.data.month === month)
                      .reduce((a, r) => a + Number(r.data.amount), 0),
                  )}
                  icon={<Wallet />}
                />
                <Stat
                  title="Terbayar & dispensasi"
                  value={money(
                    invs
                      .filter((r) => r.data.month === month)
                      .reduce((a, r) => a + r.summary.paid, 0),
                  )}
                  icon={<Check />}
                />
                <Stat
                  title="Sisa tagihan"
                  value={money(
                    invs
                      .filter((r) => r.data.month === month)
                      .reduce((a, r) => a + r.summary.balance, 0),
                  )}
                  icon={<Receipt />}
                />
              </div>
              <section className="panel">
                <div className="toolbar">
                  <div className="search">
                    <Search size={18} />
                    <input
                      placeholder="Cari siswa…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  >
                    <option value="">Semua status</option>
                    {["Belum", "Kurang", "Lunas"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() =>
                      run(
                        () => api("invoices", { month }),
                        "Tagihan bulan " +
                          month +
                          " dibuat. Tagihan lama tetap aman.",
                      ).catch(() => {})
                    }
                  >
                    <Plus size={16} />
                    Buat tagihan {month}
                  </button>
                  <button
                    className="soft"
                    onClick={() =>
                      downloadExcel(
                        "tagihan-" + month,
                        invs
                          .filter((r) => r.data.month === month)
                          .map((r) => ({
                            siswa: r.data.studentName,
                            kelas: r.data.className,
                            bulan: r.data.month,
                            tagihan: r.data.amount,
                            ...r.summary,
                          })),
                      )
                    }
                  >
                    <Download size={16} />
                    Excel
                  </button>
                </div>
                {invs.filter((r) => r.data.month === month).length ? (
                  <div className="table-wrap">
                    <table>
                      <thead>
                        <tr>
                          <th>Siswa / kelas</th>
                          <th>Tagihan</th>
                          <th>Terbayar</th>
                          <th>Sisa</th>
                          <th>Status</th>
                          <th>Tindakan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {invs
                          .filter(
                            (r) =>
                              r.data.month === month &&
                              r.data.studentName
                                .toLowerCase()
                                .includes(search.toLowerCase()) &&
                              (!filter || r.summary.status === filter),
                          )
                          .map((r) => (
                            <tr key={r.id}>
                              <td>
                                <strong>{r.data.studentName}</strong>
                                <small>{r.data.className}</small>
                              </td>
                              <td>{money(r.data.amount)}</td>
                              <td>{money(r.summary.paid)}</td>
                              <td>{money(r.summary.balance)}</td>
                              <td>
                                <Badge value={r.summary.status} />
                              </td>
                              <td>
                                <div className="row-actions">
                                  {r.summary.balance > 0 && (
                                    <>
                                      <button
                                        className="soft"
                                        onClick={() => {
                                          setPayment(r);
                                          setValues({
                                            amount: r.summary.balance,
                                            date: today(),
                                            method: "Tunai",
                                            notes: "",
                                            requestId: crypto.randomUUID(),
                                          });
                                          setError("");
                                        }}
                                      >
                                        Bayar
                                      </button>
                                      <button
                                        className="icon"
                                        aria-label="Ingatkan via WA"
                                        onClick={() => reminder(r)}
                                      >
                                        <MessageCircle size={18} />
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <Empty
                    title="Tagihan bulan ini belum dibuat"
                    text="Selesaikan pendaftaran kelas, lalu ketuk Buat tagihan."
                  />
                )}
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Kartu SPP {month.slice(0, 4)}</h2>
                  <button
                    className="soft"
                    onClick={() =>
                      downloadExcel(
                        "kartu-spp-" + month.slice(0, 4),
                        kindRows("students").map((s) => ({
                          siswa: s.data.name,
                          ...Object.fromEntries(
                            Array.from({ length: 12 }, (_, i) => {
                              const m =
                                  month.slice(0, 4) +
                                  "-" +
                                  String(i + 1).padStart(2, "0"),
                                is = invs.filter(
                                  (r) =>
                                    r.data.studentId === s.id &&
                                    r.data.month === m,
                                );
                              return [
                                m,
                                !is.length
                                  ? "—"
                                  : is.every(
                                        (r) => r.summary.status === "Lunas",
                                      )
                                    ? "Lunas"
                                    : is.some((r) => r.summary.paid > 0)
                                      ? "Kurang"
                                      : "Belum",
                              ];
                            }),
                          ),
                        })),
                      )
                    }
                  >
                    <Download size={16} />
                    Excel
                  </button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Siswa</th>
                        {Array.from({ length: 12 }, (_, i) => (
                          <th key={i}>
                            {new Intl.DateTimeFormat("id-ID", {
                              month: "short",
                            }).format(new Date(2026, i, 1))}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {kindRows("students").map((s) => (
                        <tr key={s.id}>
                          <td>{s.data.name}</td>
                          {Array.from({ length: 12 }, (_, i) => {
                            const m =
                                month.slice(0, 4) +
                                "-" +
                                String(i + 1).padStart(2, "0"),
                              is = invs.filter(
                                (r) =>
                                  r.data.studentId === s.id &&
                                  r.data.month === m,
                              );
                            const status = !is.length
                              ? "—"
                              : is.every((r) => r.summary.status === "Lunas")
                                ? "Lunas"
                                : is.some((r) => r.summary.paid > 0)
                                  ? "Kurang"
                                  : "Belum";
                            return (
                              <td key={m}>
                                <Badge value={status} />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {page === "payments" && (
            <section className="panel">
              <div className="toolbar">
                <div className="search">
                  <Search size={18} />
                  <input
                    placeholder="Cari kuitansi / siswa…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <button className="primary" onClick={() => go("invoices")}>
                  <Plus size={16} />
                  Catat pembayaran
                </button>
                <button
                  className="soft"
                  onClick={() =>
                    downloadExcel(
                      "pembayaran-" + month,
                      kindRows("payments")
                        .filter((r) => r.data.date.startsWith(month))
                        .map((r) => ({
                          ...r.data,
                          siswa: named(r.data.studentId),
                        })),
                    )
                  }
                >
                  <Download size={16} />
                  Excel
                </button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Kuitansi</th>
                      <th>Siswa</th>
                      <th>Tanggal diterima</th>
                      <th>Bulan SPP</th>
                      <th>Nominal</th>
                      <th>Metode</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kindRows("payments")
                      .filter(
                        (r) =>
                          r.data.date.startsWith(month) &&
                          (r.data.receipt + " " + named(r.data.studentId))
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((r) => (
                        <tr key={r.id}>
                          <td>
                            {r.data.receipt}
                            {r.data.voided && <Badge value="Dibatalkan" />}
                          </td>
                          <td>{named(r.data.studentId)}</td>
                          <td>{r.data.date}</td>
                          <td>{r.data.month}</td>
                          <td>{money(r.data.amount)}</td>
                          <td>{r.data.method}</td>
                          <td>
                            <div className="row-actions">
                              <button
                                className="link"
                                onClick={() => setReceipt(r)}
                              >
                                Kuitansi
                              </button>
                              {user.role === "owner" && !r.data.voided && (
                                <button
                                  className="link danger"
                                  onClick={() => {
                                    setReason("");
                                    setConfirmation({ voidId: r.id });
                                  }}
                                >
                                  Batalkan
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!kindRows("payments").some((r) =>
                r.data.date.startsWith(month),
              ) && (
                <Empty
                  title="Belum ada pembayaran"
                  text="Catat pembayaran melalui tagihan SPP agar terhubung dengan siswa dan bulan tagihan."
                />
              )}
            </section>
          )}
          {page === "honors" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Rekap honor {month}</h2>
                  <p>
                    Tarif disimpan saat sesi dicatat. Sesi dibatalkan tidak
                    dihitung.
                  </p>
                </div>
                <button
                  className="soft"
                  onClick={() =>
                    downloadExcel(
                      "honor-" + month,
                      kindRows("teachers").map((t) => {
                        const ss = kindRows("sessions").filter(
                          (s) =>
                            s.data.teacherId === t.id &&
                            s.data.date.startsWith(month) &&
                            !s.data.cancelled,
                        );
                        return {
                          pengajar: t.data.name,
                          sesi: ss.length,
                          honor: ss.reduce(
                            (a, s) => a + Number(s.data.honor),
                            0,
                          ),
                        };
                      }),
                    )
                  }
                >
                  <Download size={16} />
                  Excel
                </button>
              </div>
              {kindRows("teachers").map((t) => {
                const ss = kindRows("sessions").filter(
                    (s) =>
                      s.data.teacherId === t.id &&
                      s.data.date.startsWith(month) &&
                      !s.data.cancelled,
                  ),
                  total = ss.reduce((a, s) => a + Number(s.data.honor), 0);
                return (
                  <div className="honor-card" key={t.id}>
                    <div className="avatar">{t.data.name.charAt(0)}</div>
                    <div className="grow">
                      <strong>{t.data.name}</strong>
                      <small>
                        {ss.length} sesi mengajar ·{" "}
                        {t.data.bank || "Rekening belum diisi"}
                      </small>
                      <details>
                        <summary>Rincian sesi</summary>
                        {ss.map((s) => (
                          <p key={s.id}>
                            {s.data.date} · {named(s.data.classId)} ·{" "}
                            {money(s.data.honor)}
                          </p>
                        ))}
                      </details>
                    </div>
                    <strong>{money(total)}</strong>
                    <button
                      className="soft"
                      onClick={() =>
                        window.open(
                          "https://wa.me/" +
                            normalizePhone(t.data.phone) +
                            "?text=" +
                            encodeURIComponent(
                              `Slip honor ${state.tenant.name}\n${t.data.name} — ${month}\n${ss.map((s) => s.data.date + " " + named(s.data.classId) + " " + money(s.data.honor)).join("\n")}\nTotal ${ss.length} sesi: ${money(total)}`,
                            ),
                          "_blank",
                          "noopener,noreferrer",
                        )
                      }
                    >
                      <MessageCircle size={16} />
                      Slip WA
                    </button>
                  </div>
                );
              })}
              {!kindRows("teachers").length && (
                <Empty title="Belum ada pengajar" />
              )}
              <div className="notice">
                Honor ini adalah kewajiban berdasarkan sesi mengajar, bukan
                bukti honor sudah dibayarkan.
              </div>
            </section>
          )}
          {page === "reports" && stats && (
            <>
              <div className="report-banner">
                <div>
                  <span className="eyebrow">LAPORAN BULANAN</span>
                  <h2>{state.tenant.name}</h2>
                  <p>{month} · Basis kas diterima, honor berdasarkan sesi</p>
                </div>
                <div className="row-actions">
                  <button
                    className="soft"
                    onClick={() =>
                      downloadExcel("laporan-" + month, [
                        { bulan: month, lembaga: state.tenant.name, ...stats },
                      ])
                    }
                  >
                    <Download size={16} />
                    Excel
                  </button>
                  <button className="soft" onClick={() => window.print()}>
                    <FileText size={16} />
                    Cetak / PDF
                  </button>
                </div>
              </div>
              <div className="stat-grid">
                <Stat
                  title="Pemasukan kas"
                  value={money(stats.income)}
                  icon={<Wallet />}
                />
                <Stat
                  title="Honor pengajar"
                  value={money(stats.honor)}
                  icon={<GraduationCap />}
                />
                <Stat
                  title="Pengeluaran"
                  value={money(stats.expenses)}
                  icon={<Receipt />}
                />
                <Stat
                  title="Laba bersih"
                  value={money(stats.profit)}
                  icon={<ChartNoAxesCombined />}
                />
              </div>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Rincian laporan</h2>
                </div>
                <div className="report-lines">
                  {[
                    ["SPP / kas diterima", stats.income],
                    ["Kewajiban honor sesi", -stats.honor],
                    ["Biaya operasional", -stats.expenses],
                    ["Laba bersih", stats.profit],
                  ].map(([label, n]) => (
                    <div key={label}>
                      <span>{label}</span>
                      <strong>{money(Number(n))}</strong>
                    </div>
                  ))}
                </div>
                <p className="muted">
                  Dispensasi tidak termasuk pemasukan. Pembayaran di muka masuk
                  laporan pada tanggal diterima. Honor tidak dicatat lagi
                  sebagai pengeluaran.
                </p>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Rekap kehadiran siswa</h2>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Siswa</th>
                        <th>Hadir</th>
                        <th>Izin</th>
                        <th>Sakit</th>
                        <th>Alpa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {kindRows("students").map((s) => (
                        <tr key={s.id}>
                          <td>{s.data.name}</td>
                          {["Hadir", "Izin", "Sakit", "Alpa"].map((status) => (
                            <td key={status}>
                              {kindRows("sessions")
                                .filter(
                                  (r) =>
                                    r.data.date.startsWith(month) &&
                                    !r.data.cancelled,
                                )
                                .reduce(
                                  (a, r) =>
                                    a +
                                    r.data.attendance.filter(
                                      (x: Data) =>
                                        x.studentId === s.id &&
                                        x.status === status,
                                    ).length,
                                  0,
                                )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </>
          )}
          {page === "settings" && (
            <section className="panel settings-panel">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(() => api("settings", settings)).catch(() => {});
                }}
              >
                <FormFields
                  fields={[
                    { key: "name", label: "Nama lembaga", required: true },
                    { key: "phone", label: "WhatsApp admin", type: "tel" },
                    {
                      key: "address",
                      label: "Alamat lembaga",
                      type: "textarea",
                    },
                    { key: "bank", label: "Informasi rekening / QRIS" },
                    {
                      key: "dueDay",
                      label: "Jatuh tempo SPP (tanggal 1–28)",
                      type: "number",
                      min: 1,
                      max: 28,
                      required: true,
                    },
                    {
                      key: "zone",
                      label: "Zona waktu",
                      options: [
                        "Asia/Jakarta",
                        "Asia/Makassar",
                        "Asia/Jayapura",
                      ],
                      required: true,
                    },
                    {
                      key: "waTemplate",
                      label: "Template pengingat WhatsApp",
                      type: "textarea",
                    },
                  ]}
                  values={settings}
                  setValues={setSettings}
                  rows={rows}
                />
                <p className="muted">
                  Variabel pesan:{" "}
                  {"{wali}, {siswa}, {bulan}, {jumlah}, {tempo}, {rekening}"}.
                </p>
                <div className="form-footer">
                  <button className="primary" disabled={busy}>
                    {busy ? "Menyimpan…" : "Simpan pengaturan"}
                  </button>
                </div>
              </form>
            </section>
          )}
          {page === "accounts" && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Akun tim</h2>
                  <p>
                    Admin mengelola operasional. Pengajar hanya melihat kelas
                    dan honor sendiri.
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => {
                    setForm({ kind: "accounts" });
                    setValues({ role: "admin" });
                  }}
                >
                  <Plus size={16} />
                  Buat akun
                </button>
              </div>
              {state.accounts?.map((a: any) => (
                <div className="honor-card" key={a.id}>
                  <span className="avatar">{a.name.charAt(0)}</span>
                  <div className="grow">
                    <strong>{a.name}</strong>
                    <small>
                      {a.email} · @{a.username} · {a.role}
                    </small>
                  </div>
                  <Badge value={a.active ? "Aktif" : "Nonaktif"} />
                  {a.id !== user.id && (
                    <button
                      className="soft"
                      disabled={busy}
                      onClick={() =>
                        run(
                          () =>
                            api("accounts", { id: a.id, active: !a.active }),
                          "Status akun diperbarui.",
                        ).catch(() => {})
                      }
                    >
                      {a.active ? "Nonaktifkan" : "Aktifkan"}
                    </button>
                  )}
                </div>
              ))}
            </section>
          )}
          {page === "audit" && (
            <section className="panel">
              <div className="panel-heading">
                <h2>100 aktivitas terbaru</h2>
              </div>
              {state.audit?.map((a: any) => (
                <div className="schedule-row" key={a.id}>
                  <History size={18} />
                  <div className="grow">
                    <strong>{a.action}</strong>
                    <small>{JSON.stringify(a.details)}</small>
                  </div>
                  <small>{new Date(a.createdAt).toLocaleString("id-ID")}</small>
                </div>
              ))}
            </section>
          )}
          {page === "guide" && (
            <section className="panel guide">
              <h2>Mulai dalam 6 langkah</h2>
              {[
                [
                  "Atur identitas bimbel",
                  "Isi nama, alamat, kontak, rekening, dan tanggal jatuh tempo di Pengaturan.",
                ],
                [
                  "Siapkan program dan pengajar",
                  "Tentukan SPP bulanan dan honor per sesi. Tarif khusus pengajar dapat mengganti tarif program.",
                ],
                [
                  "Buat kelas dan daftarkan siswa",
                  "Tentukan pengajar, jadwal, lokasi, kapasitas. Tambahkan siswa dan wali, lalu hubungkan melalui Pendaftaran kelas.",
                ],
                [
                  "Catat presensi setelah mengajar",
                  "Pilih tanggal dan kelas, ubah Hadir/Izin/Sakit/Alpa, isi materi. Menyimpan ulang tanggal yang sama memperbarui sesi.",
                ],
                [
                  "Buat tagihan dan terima pembayaran",
                  "Pilih bulan, buat tagihan. Catat pembayaran penuh, cicilan, atau dispensasi. Buka kuitansi untuk cetak atau WhatsApp.",
                ],
                [
                  "Periksa rekap akhir bulan",
                  "Lihat honor pengajar, kehadiran, pemasukan, biaya operasional dan laba bersih. Ekspor Excel atau cetak PDF.",
                ],
              ].map(([t, d], i) => (
                <div className="guide-step" key={t}>
                  <span>{i + 1}</span>
                  <div>
                    <h3>{t}</h3>
                    <p>{d}</p>
                  </div>
                </div>
              ))}
              <h3>Impor, arsip, dan keamanan</h3>
              <p>
                Unduh template Excel dari setiap daftar. Isi sheet Data memakai
                nama kolom asli; untuk kolom berelasi gunakan ID yang tersedia
                di Panduan. Unggah dan periksa preview sebelum menyimpan.
                Maksimal 500 baris dan 5 MB.
              </p>
              <p>
                Data penting diarsipkan dahulu. Data yang masih dipakai riwayat
                tidak dapat dihapus permanen. Pembayaran yang salah dibatalkan
                oleh pemilik dengan alasan, kemudian dicatat ulang.
              </p>
              <p>
                Pengajar dapat mencatat presensi maksimal 7 hari ke belakang.
                Password minimal 8 karakter, sesi 6 jam, 5 kali salah masuk
                mengunci akun 15 menit. Pemilik dapat menonaktifkan akun tim.
              </p>
              <p>
                WhatsApp dibuka dengan pesan siap kirim. Tekan Kirim sendiri di
                WhatsApp. Aplikasi tidak menandai pesan otomatis sudah terkirim.
              </p>
              <h3>Cuti dan tarif</h3>
              <p>
                Ubah status pendaftaran menjadi Cuti agar tagihan berikutnya
                tidak dibuat. Tagihan yang sudah terbit tetap tersimpan; gunakan
                dispensasi bila dibebaskan. Perubahan SPP berlaku untuk tagihan
                baru, perubahan honor berlaku untuk sesi baru.
              </p>
            </section>
          )}
        </main>
        <footer className="app-footer">
          Bantu Beres Bimbel Pro <span>Ruang kerja {state.tenant.name}</span>
        </footer>
      </div>
      <nav className="bottom-nav">
        {[
          ["dashboard", "Beranda", LayoutDashboard],
          ["calendar", "Jadwal", CalendarDays],
          ["attendance", "Presensi", ClipboardCheck],
          ...(user.role === "teacher"
            ? [["honors", "Honor", Wallet]]
            : [["invoices", "SPP", Wallet]]),
        ].map(([p, t, I]: any) => (
          <button
            key={p}
            className={page === p ? "active" : ""}
            onClick={() => go(p)}
          >
            <I size={20} />
            <span>{t}</span>
          </button>
        ))}
        <button onClick={() => setMenu(true)}>
          <Menu size={20} />
          <span>Menu</span>
        </button>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
      {form && (
        <Modal
          title={
            form.kind === "accounts"
              ? "Buat akun tim"
              : (form.row ? "Edit " : "Tambah ") +
                (definitions[form.kind]?.singular || "data")
          }
          onClose={() => {
            if (!busy) setForm(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await run(() =>
                  api(
                    form.kind === "accounts" ? "accounts" : "records",
                    form.kind === "accounts"
                      ? values
                      : {
                          kind: form.kind,
                          data: values,
                          id: form.row?.id,
                          version: form.row?.version,
                        },
                  ),
                );
                setForm(null);
              } catch {}
            }}
          >
            {error && <div className="alert">{error}</div>}
            <FormFields
              fields={
                form.kind === "accounts"
                  ? [
                      { key: "name", label: "Nama lengkap", required: true },
                      {
                        key: "email",
                        label: "Email",
                        type: "email",
                        required: true,
                      },
                      { key: "username", label: "Username", required: true },
                      {
                        key: "password",
                        label: "Password (minimal 8 karakter)",
                        type: "password",
                        required: true,
                      },
                      {
                        key: "role",
                        label: "Peran",
                        options: ["admin", "teacher"],
                        required: true,
                      },
                      ...(values.role === "teacher"
                        ? [
                            {
                              key: "teacherId",
                              label: "Pengajar",
                              ref: "teachers",
                              required: true,
                            },
                          ]
                        : []),
                    ]
                  : definitions[form.kind].fields
              }
              values={values}
              setValues={setValues}
              rows={rows}
            />
            <div className="form-footer">
              <button
                type="button"
                className="soft"
                disabled={busy}
                onClick={() => setForm(null)}
              >
                Batal
              </button>
              <button className="primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {payment && (
        <Modal
          title="Catat pembayaran"
          onClose={() => {
            if (!busy) setPayment(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const r = await run(
                  () => api("pay", { ...values, invoiceId: payment.id }),
                  "Pembayaran tercatat.",
                );
                setPayment(null);
                setReceipt(r);
              } catch {}
            }}
          >
            <div className="payment-summary">
              <strong>{payment.data.studentName}</strong>
              <span>
                {payment.data.className} · SPP {payment.data.month}
              </span>
              <h2>
                {money(
                  invs.find((r) => r.id === payment.id)?.summary.balance || 0,
                )}
              </h2>
              <small>Sisa tagihan</small>
            </div>
            {error && <div className="alert">{error}</div>}
            <FormFields
              fields={[
                {
                  key: "amount",
                  label: "Nominal pembayaran",
                  type: "number",
                  min: 1,
                  max: invs.find((r) => r.id === payment.id)?.summary.balance,
                  required: true,
                },
                {
                  key: "date",
                  label: "Tanggal diterima",
                  type: "date",
                  required: true,
                },
                {
                  key: "method",
                  label: "Metode",
                  options: ["Tunai", "Transfer", "QRIS", "Dispensasi"],
                  required: true,
                },
                { key: "notes", label: "Catatan", type: "textarea" },
              ]}
              values={values}
              setValues={setValues}
              rows={rows}
            />
            {values.method === "Dispensasi" && (
              <div className="notice">
                Dispensasi mengurangi tagihan dan tidak menambah kas.
              </div>
            )}
            <div className="form-footer">
              <button className="primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan pembayaran"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {receipt && (
        <Modal title="Kuitansi pembayaran" onClose={() => setReceipt(null)}>
          <div className="receipt print-target">
            <Brand />
            <h2>{state.tenant.name}</h2>
            <p>{state.tenant.settings.address}</p>
            <hr />
            <strong>{receipt.data.receipt}</strong>
            {receipt.data.voided && <Badge value="Dibatalkan" />}
            <dl>
              {[
                ["Diterima dari", named(receipt.data.studentId)],
                ["Untuk", "SPP " + receipt.data.month],
                ["Tanggal", receipt.data.date],
                ["Metode", receipt.data.method],
                ["Jumlah", money(receipt.data.amount)],
              ].map(([t, v]) => (
                <div key={t}>
                  <dt>{t}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <p>{receipt.data.notes}</p>
            <small>Dicatat oleh {state.tenant.name}</small>
          </div>
          <div className="form-footer">
            <button className="soft" onClick={() => window.print()}>
              Cetak / PDF
            </button>
            <button
              className="primary"
              disabled={receipt.data.voided}
              onClick={() =>
                wa(
                  receipt.data.studentId,
                  `Kuitansi ${state.tenant.name}\n${receipt.data.receipt}\n${named(receipt.data.studentId)}\nSPP ${receipt.data.month}: ${money(receipt.data.amount)}\n${receipt.data.method} — ${receipt.data.date}\nTerima kasih.`,
                )
              }
            >
              <MessageCircle size={16} />
              Kuitansi WA
            </button>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title={
            confirmation.logout
              ? "Keluar dari akun?"
              : confirmation.voidId
                ? "Batalkan transaksi?"
                : confirmation.action === "delete"
                  ? "Hapus data permanen?"
                  : confirmation.action === "restore"
                    ? "Pulihkan data?"
                    : "Arsipkan data?"
          }
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <p>
            {confirmation.logout
              ? "Anda dapat masuk kembali kapan saja."
              : confirmation.voidId
                ? "Transaksi tetap tersimpan dalam riwayat. Perhitungan akan diperbarui."
                : confirmation.action === "delete"
                  ? "Data yang dihapus permanen tidak dapat dipulihkan. Data yang masih digunakan akan ditolak."
                  : confirmation.action === "restore"
                    ? "Data akan kembali ke daftar aktif."
                    : "Data disimpan di arsip agar riwayat tetap tersedia."}
          </p>
          {confirmation.voidId && (
            <label>
              Alasan pembatalan
              <textarea
                required
                minLength={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          )}
          {error && <div className="alert">{error}</div>}
          <div className="form-footer">
            <button
              className="soft"
              disabled={busy}
              onClick={() => setConfirmation(null)}
            >
              Batal
            </button>
            <button
              className={
                confirmation.action === "delete" || confirmation.voidId
                  ? "danger-button"
                  : "primary"
              }
              disabled={
                busy || (confirmation.voidId && reason.trim().length < 5)
              }
              onClick={async () => {
                try {
                  if (confirmation.logout) {
                    await api("auth/logout", {});
                    setState(null);
                  } else
                    await run(
                      () =>
                        api(
                          confirmation.voidId ? "void" : "archive",
                          confirmation.voidId
                            ? { id: confirmation.voidId, reason }
                            : {
                                ids: confirmation.ids,
                                action: confirmation.action,
                              },
                        ),
                      "Data diperbarui.",
                    );
                  setSelection([]);
                  setConfirmation(null);
                } catch {}
              }}
            >
              {busy ? "Memproses…" : "Ya, lanjutkan"}
            </button>
          </div>
        </Modal>
      )}
      {importRows && (
        <Modal
          title={"Periksa impor " + (def?.title || "data")}
          onClose={() => {
            if (!busy) setImportRows(null);
          }}
        >
          <p>
            {importRows.length} baris akan ditambahkan. Data lama tidak ditimpa.
            Seluruh impor dibatalkan jika ada baris tidak valid.
          </p>
          {error && <div className="alert">{error}</div>}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {Object.keys(importRows[0] || {}).map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {importRows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    {Object.values(r).map((v, j) => (
                      <td key={j}>{String(v)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <small>Preview maksimal 10 baris.</small>
          <div className="form-footer">
            <button className="soft" onClick={() => setImportRows(null)}>
              Batal
            </button>
            <button
              className="primary"
              disabled={busy || !importRows.length}
              onClick={async () => {
                try {
                  await run(
                    () => api("import", { kind: page, rows: importRows }),
                    "Impor berhasil.",
                  );
                  setImportRows(null);
                } catch {}
              }}
            >
              {busy ? "Mengimpor…" : "Simpan " + importRows.length + " baris"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  title,
  value,
  icon,
  note,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="stat-card">
      <div className="stat-top">
        <span>{title}</span>
        <div className="stat-icon">{icon}</div>
      </div>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
