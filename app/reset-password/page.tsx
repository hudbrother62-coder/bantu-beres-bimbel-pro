"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, LockKeyhole } from "lucide-react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("token") || "";
    setToken(value);
  }, []);

  async function reset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password !== confirmation) {
      setError("Konfirmasi password tidak sama.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/confirm-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal mengganti password.");
      setDone(true);
      window.history.replaceState(null, "", "/reset-password");
      window.location.replace("/");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page" style={{ display: "flex", minHeight: "100vh" }}>
      <main className="auth-main" style={{ width: "100%", minHeight: "100vh", flex: 1 }}>
        <div className="auth-card">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <LockKeyhole size={28} aria-hidden />
            <strong>Bantu Beres Bimbel Pro</strong>
          </div>
          <h2>Atur password baru</h2>
          <p>Masukkan password baru dan konfirmasikan. Setelah berhasil, Anda otomatis masuk ke bimbel Anda.</p>
          {!token && !done && (
            <div className="alert" role="alert">
              Tautan pemulihan tidak valid. Silakan kembali ke login untuk meminta tautan baru.
            </div>
          )}
          {error && <div className="alert" role="alert">{error}</div>}
          {done ? (
            <div className="notice" role="status"><CheckCircle2 size={18} /> Password berhasil diganti. Membuka akun...</div>
          ) : (
            <form onSubmit={reset}>
              <label>Password baru (minimal 8 karakter)
                <input required type="password" autoComplete="new-password"
                  minLength={8} maxLength={128} value={password}
                  onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label>Konfirmasi password baru
                <input required type="password" autoComplete="new-password"
                  minLength={8} maxLength={128} value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)} />
              </label>
              <button className="primary full" type="submit" disabled={busy || !token}>
                {busy ? "Menyimpan..." : "Ganti password dan masuk"}
              </button>
            </form>
          )}
          <p className="auth-switch">
            <Link href="/" className="link"><ArrowLeft size={16} /> Kembali ke login</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
