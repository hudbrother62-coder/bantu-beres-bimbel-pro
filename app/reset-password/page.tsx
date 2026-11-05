"use client";
import { useEffect, useState, type FormEvent } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";

export default function SupportPasswordResetPage() {
  const [ticket, setTicket] = useState("");
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Fragment tokens never enter the HTTP request or the referrer header.
    const candidate = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    if (/^[a-f0-9]{64}$/.test(candidate)) setTicket(candidate);
    window.history.replaceState(null, "", "/reset-password");
    setReady(true);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !ticket) return;
    if (password !== confirmation) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/confirm-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: ticket, password, confirmation }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Pemulihan password gagal.");
      setTicket("");
      window.location.replace("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <main className="auth-main" style={{ minHeight: "100vh", width: "100%" }}>
        <div className="auth-card">
          <div className="mobile-brand"><strong>Bantu Beres · Bimbel Pro</strong></div>
          <h2><KeyRound size={23} aria-hidden="true" /> Buat password baru</h2>
          <p>Tautan pemulihan ini rahasia, sekali pakai, dan memiliki batas waktu.</p>
          {!ready ? (
            <div className="notice">Memeriksa tautan pemulihan…</div>
          ) : !ticket ? (
            <div role="alert" className="alert">
              Tautan pemulihan tidak valid. Minta tautan baru melalui layanan customer resmi.
            </div>
          ) : (
            <>
              <div className="notice" style={{ marginBottom: 16 }}>
                <ShieldCheck size={18} aria-hidden="true" /> Jangan bagikan tautan atau password kepada siapa pun.
              </div>
              {error && <div role="alert" className="alert">{error}</div>}
              <form onSubmit={submit}>
                <label>Password baru (minimal 8 karakter)
                  <input autoFocus type="password" autoComplete="new-password"
                    minLength={8} maxLength={128} required value={password}
                    onChange={event => setPassword(event.target.value)} />
                </label>
                <label>Ulangi password baru
                  <input type="password" autoComplete="new-password"
                    minLength={8} maxLength={128} required value={confirmation}
                    onChange={event => setConfirmation(event.target.value)} />
                </label>
                <button type="submit" className="primary full"
                  disabled={busy || password.length < 8 || password !== confirmation}>
                  {busy ? "Menyimpan…" : "Simpan password dan masuk"}
                </button>
              </form>
            </>
          )}
          <p className="auth-switch"><a href="/">Kembali ke halaman login</a></p>
        </div>
      </main>
    </div>
  );
}
