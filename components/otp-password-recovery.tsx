"use client";
import { useState } from "react";
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
export default function OtpPasswordRecovery() {
  const [stage, setStage] = useState<Stage>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

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
      await post("request-otp", { email: email.trim().toLowerCase() });
      setStage("code");
      setCode("");
      setNotice("Jika email terdaftar, kode OTP 6 digit telah dikirim. Periksa kotak masuk dan spam.");
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
      setNotice("Password berhasil diganti. Anda sedang masuk...");
      window.location.replace("/");
    });
  }
  return (
    <div>
      <div className="notice" style={{ marginBottom: 18, display: "flex", alignItems: "flex-start", gap: 10 }}>
        <ShieldCheck size={20} aria-hidden="true" />
        <span>Kode OTP dikirim ke email terdaftar. Berlaku 10 menit dan hanya bisa digunakan satu kali.</span>
      </div>
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
          <button type="submit" className="primary full" disabled={busy}>
            <Mail size={18} /> {busy ? "Mengirim..." : "Kirim kode OTP"}
          </button>
        </form>
      )}
      {stage === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); void verifyOtp(); }}>
          <p>Kode dikirim ke <strong>{email.trim().toLowerCase()}</strong>.</p>
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
            <button type="button" className="link" disabled={busy}
              onClick={() => { void requestOtp(); }}>Kirim ulang OTP</button>
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
