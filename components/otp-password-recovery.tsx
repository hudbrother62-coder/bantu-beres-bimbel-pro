"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, ShieldCheck } from "lucide-react";

type Stage = "email" | "code" | "password";
async function post(path: string, payload: Record<string, unknown>) {
  const response = await fetch("/api/auth/" + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Permintaan gagal. Silakan coba lagi.");
  return body.result || body;
}
export default function OtpPasswordRecovery({ initialEmail = "", emailAvailable = true }: { initialEmail?: string; emailAvailable?: boolean }) {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState(initialEmail.trim().toLowerCase());
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendAfter, setResendAfter] = useState(0);
  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("bimbel-recovery-request") || "null");
      if (stored && typeof stored.email === "string" && Date.now() - stored.savedAt < 24 * 60 * 60_000) {
        setEmail(stored.email);
        setStage("code");
        setNotice("Permintaan sebelumnya tetap tercatat. Jika masih dalam antrean, email akan dikirim otomatis. Kode yang masih berlaku tidak diganti.");
      }
    } catch { /* Penyimpanan lokal opsional. */ }
  }, []);
  useEffect(() => {
    if (resendAfter === 0) return;
    const timeout = setTimeout(() => setResendAfter(value => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timeout);
  }, [resendAfter]);

  async function execute(callback: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try { await callback(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function requestOtp() {
    await execute(async () => {
      const response = await post("request-otp", { email: email.trim().toLowerCase() });
      try { localStorage.setItem("bimbel-recovery-request", JSON.stringify({ email: email.trim().toLowerCase(), savedAt: Date.now() })); } catch { /* optional */ }
      setStage("code");
      setCode("");
      setResendAfter(60);
      const estimate = response.estimatedSendAt ? new Date(response.estimatedSendAt) : null;
      const when = estimate && !Number.isNaN(estimate.getTime())
        ? " Perkiraan pemeriksaan antrean: " + new Intl.DateTimeFormat("id-ID", {
            timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit"
          }).format(estimate) + " WIB."
        : "";
      setNotice("Jika email terdaftar, OTP akan dikirim otomatis saat giliran tersedia." +
        when + " Permintaan dan kode yang masih berlaku tidak diganti. Periksa email secara berkala.");
    });
  }
  async function verifyOtp() {
    await execute(async () => {
      const result = await post("verify-otp", { email: email.trim().toLowerCase(), code });
      if (!result.ticket) throw new Error("Kode belum berhasil diverifikasi. Coba lagi.");
      setTicket(result.ticket);
      setStage("password");
      setNotice("Kode OTP benar. Silakan buat password baru.");
    });
  }
  async function savePassword() {
    await execute(async () => {
      if (password !== confirmation) throw new Error("Konfirmasi password tidak sama.");
      await post("confirm-reset", { token: ticket, password, confirmation });
      try { localStorage.removeItem("bimbel-recovery-request"); } catch { /* optional */ }
      setNotice("Password berhasil diganti. Anda sedang masuk...");
      window.location.replace("/");
    });
  }
  return (
    <div>
      {emailAvailable ? (
        <div className="notice" style={{ marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <ShieldCheck size={20} aria-hidden="true" />
          <span>OTP akan dikirim otomatis ke email terdaftar. Kode berlaku 10 menit sejak pengiriman diterima penyedia, sekali pakai.</span>
        </div>
      ) : (
        <div role="alert" className="alert" style={{ marginBottom: 18 }}>
          Pemulihan melalui email belum tersedia. Hubungi layanan customer Bimbel Pro melalui chat resmi untuk mendapatkan tautan reset password sekali pakai. Jangan kirim password lama atau kode OTP.
        </div>
      )}
      {error && <div role="alert" className="alert">{error}</div>}
      {notice && <div role="status" className="notice" style={{ marginBottom: 15 }}>
        <CheckCircle2 size={18} aria-hidden="true" /> {notice}
      </div>}
      {stage === "email" && (
        <form onSubmit={(e) => { e.preventDefault(); void requestOtp(); }}>
          <label>Email yang terdaftar di Bimbel Pro
            <input type="email" autoComplete="email" autoFocus required maxLength={200}
              placeholder="nama@gmail.com" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button type="submit" className="primary full" disabled={busy || !emailAvailable}>
            <Mail size={18} /> {busy ? "Mengirim..." : "Kirim kode OTP"}
          </button>
        </form>
      )}
      {stage === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); void verifyOtp(); }}>
          <p>Kode akan dikirim ke <strong>{email.trim().toLowerCase()}</strong>. Jika mengantre, kamu boleh menutup halaman.</p>
          <label>Kode OTP 6 digit
            <input type="text" autoComplete="one-time-code" inputMode="numeric"
              pattern="[0-9]{6}" maxLength={6} required autoFocus
              placeholder="000000" value={code}
              style={{ letterSpacing: "0.3em", textAlign: "center", fontWeight: 700 }}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} />
          </label>
          <button type="submit" className="primary full" disabled={busy || code.length !== 6}>
            <KeyRound size={18} /> {busy ? "Memverifikasi..." : "Verifikasi kode"}
          </button>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
            <button type="button" className="link" disabled={busy}
              onClick={() => { setStage("email"); setError(""); setNotice(""); }}>
              <ArrowLeft size={15} /> Ubah email
            </button>
            <button type="button" className="link" disabled={busy || resendAfter > 0}
              onClick={() => { void requestOtp(); }}>
              {resendAfter > 0 ? `Kirim ulang dalam ${resendAfter} dtk` : "Kirim ulang OTP"}
            </button>
          </div>
        </form>
      )}
      {stage === "password" && (
        <form onSubmit={(e) => { e.preventDefault(); void savePassword(); }}>
          <p>Email terverifikasi: <strong>{email.trim().toLowerCase()}</strong></p>
          <label>Password baru (minimal 8 karakter)
            <input type="password" autoComplete="new-password" required minLength={8} maxLength={128}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>Konfirmasi password baru
            <input type="password" autoComplete="new-password" required minLength={8} maxLength={128}
              value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
          </label>
          <button type="submit" className="primary full" disabled={busy}>
            <CheckCircle2 size={18} /> {busy ? "Menyimpan..." : "Simpan password dan masuk"}
          </button>
        </form>
      )}
    </div>
  );
}
