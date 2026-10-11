"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LockKeyhole, ShieldCheck } from "lucide-react";

type GoogleResponse = { credential?: string };
type GoogleIdentity = {
  accounts: { id: {
    initialize: (config: Record<string, unknown>) => void;
    renderButton: (element: HTMLElement, config: Record<string, unknown>) => void;
  }};
};
declare global {
  interface Window { google?: GoogleIdentity }
}

type Config = { configured: boolean; clientId: string };
export default function GooglePasswordRecovery() {
  const googleButton = useRef<HTMLDivElement>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [resetToken, setResetToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    fetch("/api/auth/google-config", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Gagal menyiapkan login Google.");
        return (await response.json()) as Config;
      })
      .then((data) => { if (mounted) setConfig(data); })
      .catch((e) => { if (mounted) setError((e as Error).message); });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!config?.configured || !config.clientId || resetToken) return;
    let disposed = false;

    async function handleCredential(reply: GoogleResponse) {
      if (!reply.credential) {
        setError("Google tidak mengirimkan identitas akun. Coba lagi.");
        return;
      }
      setBusy(true);
      setError("");
      try {
        const response = await fetch("/api/auth/google-reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: reply.credential }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal memverifikasi akun Google.");
        if (!disposed) {
          setEmail(data.result.email);
          setResetToken(data.result.resetToken);
        }
      } catch (e) {
        if (!disposed) setError((e as Error).message);
      } finally {
        if (!disposed) setBusy(false);
      }
    }

    function drawButton() {
      if (disposed || !window.google?.accounts.id || !googleButton.current) return;
      window.google.accounts.id.initialize({
        client_id: config!.clientId,
        callback: (reply: GoogleResponse) => { void handleCredential(reply); },
        auto_select: false,
        cancel_on_tap_outside: true,
      });
      googleButton.current.replaceChildren();
      window.google.accounts.id.renderButton(googleButton.current, {
        type: "standard", theme: "outline", size: "large",
        text: "continue_with", shape: "rectangular", width: 310,
      });
      setReady(true);
    }

    const source = "https://accounts.google.com/gsi/client";
    const existing = document.querySelector<HTMLScriptElement>('script[data-bb-google="1"]');
    if (window.google?.accounts.id) {
      drawButton();
    } else if (existing) {
      existing.addEventListener("load", drawButton);
    } else {
      const script = document.createElement("script");
      script.dataset.bbGoogle = "1";
      script.src = source;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", drawButton);
      script.addEventListener("error", () => {
        if (!disposed) setError("Tombol Google gagal dimuat. Periksa koneksi internet.");
      });
      document.head.appendChild(script);
    }
    return () => {
      disposed = true;
      existing?.removeEventListener("load", drawButton);
    };
  }, [config, resetToken]);

  async function confirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
        body: JSON.stringify({ token: resetToken, password, confirmation }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Password gagal disimpan.");
      window.location.replace("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <div className="alert" role="alert">{error}</div>}
      {!resetToken ? (
        <>
          <div className="notice" style={{ marginBottom: 20 }}>
            <ShieldCheck size={20} aria-hidden="true" />
            Gunakan akun Google dengan email yang sama seperti akun Bimbel Pro Anda.
            Tidak perlu kode OTP atau tautan email.
          </div>
          {config === null ? (
            <p>Menyiapkan pemulihan Google...</p>
          ) : !config.configured ? (
            <div className="alert" role="alert">
              Login Google belum diaktifkan oleh pengelola Bimbel Pro.
              Hubungi admin untuk mengaktifkan pemulihan password.
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", minHeight: 55, marginBottom: 20 }}>
              <div ref={googleButton} />
              {!ready && !error && <small>Memuat tombol Google...</small>}
            </div>
          )}
          {busy && <p role="status">Memeriksa akun Google...</p>}
        </>
      ) : (
        <>
          <div className="notice" role="status">
            <CheckCircle2 size={20} aria-hidden="true" /> Akun terverifikasi: <strong>{email}</strong>
          </div>
          <form onSubmit={confirm}>
            <label>Password baru
              <input required type="password" autoComplete="new-password"
                minLength={8} maxLength={128} value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minimal 8 karakter" />
            </label>
            <label>Konfirmasi password baru
              <input required type="password" autoComplete="new-password"
                minLength={8} maxLength={128} value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)} />
            </label>
            <button className="primary full" disabled={busy}>
              <LockKeyhole size={17} aria-hidden="true" />
              {busy ? "Menyimpan..." : "Ganti password & langsung masuk"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
