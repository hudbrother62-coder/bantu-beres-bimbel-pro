import { createPublicKey, verify } from "node:crypto";

export type VerifiedGoogleIdentity = { email: string; sub: string };

function invalidGoogleLogin(): never {
  throw new Error("Verifikasi Google gagal. Silakan masuk kembali dengan Google.");
}

export async function verifyGoogleIdToken(credential: string): Promise<VerifiedGoogleIdentity> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("Login Google belum dikonfigurasi. Hubungi admin Bimbel Pro.");
  if (typeof credential !== "string" || credential.length > 8192)
    return invalidGoogleLogin();
  const parts = credential.split(".");
  if (parts.length !== 3) return invalidGoogleLogin();

  let header: Record<string, any>, payload: Record<string, any>;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return invalidGoogleLogin();
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    typeof payload.aud !== "string" ||
    payload.aud !== clientId ||
    !["accounts.google.com", "https://accounts.google.com"].includes(payload.iss) ||
    !Number.isFinite(payload.exp) || payload.exp <= now ||
    !Number.isFinite(payload.iat) || payload.iat > now + 60 || now - payload.iat > 300 ||
    payload.email_verified !== true ||
    typeof payload.email !== "string" ||
    typeof payload.sub !== "string" || !payload.sub
  ) return invalidGoogleLogin();

  // A verified Gmail or Google Workspace address is authoritative at Google.
  // Consumer Google accounts using third-party mail can lose email ownership.
  const email = payload.email.trim().toLowerCase();
  const googleHosted = email.endsWith("@gmail.com") || email.endsWith("@googlemail.com");
  const workspaceHosted = typeof payload.hd === "string" &&
    email.endsWith("@" + payload.hd.toLowerCase());
  if (!googleHosted && !workspaceHosted) {
    throw new Error("Pemulihan Google mendukung Gmail dan Google Workspace. Hubungi admin untuk alamat email lainnya.");
  }

  let keys: any[];
  try {
    const response = await fetch("https://www.googleapis.com/oauth2/v3/certs", {
      signal: AbortSignal.timeout(7000),
      cache: "no-store",
    });
    if (!response.ok) return invalidGoogleLogin();
    const jwks = await response.json();
    keys = jwks.keys || [];
  } catch {
    throw new Error("Tidak dapat menghubungi Google saat ini. Silakan coba lagi.");
  }
  const matchingKey = keys.find((key: any) =>
    key.kty === "RSA" && key.kid === header.kid &&
    (key.use === "sig" || key.use === undefined) &&
    (key.alg === "RS256" || key.alg === undefined)
  );
  if (!matchingKey) return invalidGoogleLogin();
  try {
    const publicKey = createPublicKey({ key: matchingKey, format: "jwk" });
    const ok = verify(
      "RSA-SHA256",
      Buffer.from(parts[0] + "." + parts[1]),
      publicKey,
      Buffer.from(parts[2], "base64url"),
    );
    if (!ok) return invalidGoogleLogin();
  } catch {
    return invalidGoogleLogin();
  }
  return { email, sub: payload.sub };
}
