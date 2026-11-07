import { randomBytes, randomInt, createCipheriv, createDecipheriv } from "node:crypto";
import { connectionPool } from "./db";
import { hashPassword } from "./auth";

type Job = {
  id: string; account_id: string; email: string; code_ciphertext: string | null;
  idempotency_key: string | null; otp_id: string | null; attempts: number;
};
const ACK = { ok: true, message: "Jika email terdaftar, OTP akan dikirim atau diantrikan otomatis." };
const limit = () => Math.max(1, Math.min(100, Number(process.env.OTP_QUEUE_HOURLY_LIMIT || 20) || 20));
function key() {
  const hex = process.env.OTP_QUEUE_ENCRYPTION_KEY || "";
  if (!/^[a-f0-9]{64}$/i.test(hex)) throw new Error("Enkripsi antrean belum dikonfigurasi.");
  return Buffer.from(hex, "hex");
}
export function queueReady() {
  return /^[a-f0-9]{64}$/i.test(process.env.OTP_QUEUE_ENCRYPTION_KEY || "") &&
    Boolean(process.env.RESEND_API_KEY && process.env.PASSWORD_RESET_FROM);
}
export function encryptOtp(code: string, secret: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret, iv);
  const data = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, data, cipher.getAuthTag()].map(x => x.toString("base64url")).join(".");
}
export function decryptOtp(payload: string, secret: Buffer) {
  const pieces = payload.split(".");
  if (pieces.length !== 3) throw new Error("OTP tersimpan tidak valid.");
  const cipher = createDecipheriv("aes-256-gcm", secret, Buffer.from(pieces[0], "base64url"));
  cipher.setAuthTag(Buffer.from(pieces[2], "base64url"));
  return cipher.update(Buffer.from(pieces[1], "base64url"), undefined, "utf8") + cipher.final("utf8");
}
export function retrySeconds(tries: number, retryAfter?: string | null) {
  const delay = Number(retryAfter);
  return retryAfter && Number.isFinite(delay) && delay > 0
    ? Math.min(3600, Math.max(60, Math.ceil(delay)))
    : Math.min(3600, 60 * (2 ** Math.min(6, Math.max(0, tries - 1))));
}
export function transientHttp(status: number) {
  return status === 429 || status === 408 || status >= 500 || status === 409;
}
export async function requestQueuedOtp(email: string) {
  if (!queueReady()) throw new Error("Pengiriman OTP belum dikonfigurasi.");
  const client = await connectionPool().connect();
  let eligible = false;
  try {
    await client.query("BEGIN");
    const accounts = await client.query<{ id: string }>(
      "SELECT id FROM accounts WHERE email=$1 AND active=true LIMIT 1", [email]
    );
    const account = accounts.rows[0];
    if (account) {
      const old = await client.query<{ status: string; expires_at: Date | null; created_at: Date }>(
        "SELECT status,expires_at,created_at FROM password_reset_queue WHERE account_id=$1 FOR UPDATE",
        [account.id]
      );
      const prev = old.rows[0];
      const alive = prev && (prev.status === "queued" || prev.status === "sending" ||
        (prev.status === "sent" && prev.expires_at && prev.expires_at.getTime() > Date.now()));
      if (alive) eligible = true;
      else if (!prev || Date.now() - prev.created_at.getTime() >= 60_000) {
        const count = await client.query<{ n: string }>(
          "SELECT count(*)::text AS n FROM password_reset_otps WHERE account_id=$1 AND created_at>now()-interval '1 hour'",
          [account.id]
        );
        if (Number(count.rows[0]?.n || 0) < 5) {
          await client.query(
            "INSERT INTO password_reset_queue (account_id,status) VALUES ($1,'queued') " +
            "ON CONFLICT (account_id) DO UPDATE SET status='queued',created_at=now(),next_attempt_at=now(), " +
            "code_ciphertext=NULL,idempotency_key=NULL,otp_id=NULL,attempts=0,sent_at=NULL,expires_at=NULL, " +
            "locked_until=NULL,provider_id=NULL,last_error=NULL",
            [account.id]
          );
          eligible = true;
        }
      }
    }
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
  if (eligible) await drainOtpQueue(1).catch(() => undefined);
  return ACK;
}
async function claim(): Promise<Job | null> {
  const client = await connectionPool().connect();
  try {
    await client.query("BEGIN");
    // Global xact lock serializes hourly send reservation across workers/instances.
    await client.query("SELECT pg_advisory_xact_lock(372149,6)");
    const picked = await client.query<Job>(
      "SELECT q.id,q.account_id,a.email,q.code_ciphertext,q.idempotency_key,q.otp_id,q.attempts " +
      "FROM password_reset_queue q JOIN accounts a ON a.id=q.account_id AND a.active=true " +
      "WHERE q.status IN ('queued','sending') AND q.next_attempt_at<=now() " +
      "AND (q.locked_until IS NULL OR q.locked_until<now()) " +
      "ORDER BY q.created_at FOR UPDATE OF q SKIP LOCKED LIMIT 1"
    );
    const job = picked.rows[0];
    if (!job) { await client.query("COMMIT"); return null; }
    await client.query(
      "INSERT INTO password_reset_send_windows(bucket,used) VALUES(date_trunc('hour',now()),0) ON CONFLICT DO NOTHING"
    );
    const window = await client.query<{ used: number }>(
      "SELECT used FROM password_reset_send_windows WHERE bucket=date_trunc('hour',now()) FOR UPDATE"
    );
    if (Number(window.rows[0].used) >= limit()) {
      await client.query(
        "UPDATE password_reset_queue SET next_attempt_at=date_trunc('hour',now()) + interval '1 hour 5 seconds' WHERE id=$1",
        [job.id]
      );
      await client.query("COMMIT");
      return null;
    }
    await client.query("UPDATE password_reset_send_windows SET used=used+1 WHERE bucket=date_trunc('hour',now())");
    let ciphertext = job.code_ciphertext, otpId = job.otp_id, idem = job.idempotency_key;
    if (!ciphertext || !otpId || !idem) {
      const code = randomInt(0, 1000000).toString().padStart(6, "0");
      ciphertext = encryptOtp(code, key());
      const otp = await client.query<{ id: string }>(
        "INSERT INTO password_reset_otps (account_id,code_hash,expires_at) " +
        "VALUES($1,$2,now()+interval '10 minutes') RETURNING id", [job.account_id, hashPassword(code)]
      );
      otpId = otp.rows[0].id;
      idem = "bimbel-otp-" + job.id + "-" + randomBytes(8).toString("hex");
    }
    await client.query(
      "UPDATE password_reset_queue SET status='sending',locked_until=now()+interval '2 minutes', " +
      "attempts=attempts+1,code_ciphertext=$2,otp_id=$3,idempotency_key=$4 WHERE id=$1",
      [job.id,ciphertext,otpId,idem]
    );
    await client.query("COMMIT");
    return { ...job, code_ciphertext: ciphertext, otp_id: otpId, idempotency_key: idem, attempts: job.attempts + 1 };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
  finally { client.release(); }
}
async function send(job: Job) {
  let retryable = true, retryAfter: string | null = null;
  try {
    const code = decryptOtp(job.code_ciphertext!, key());
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.RESEND_API_KEY,
        "Content-Type": "application/json", "Idempotency-Key": job.idempotency_key! },
      body: JSON.stringify({
        from: process.env.PASSWORD_RESET_FROM, to: [job.email],
        subject: "Kode pemulihan password Bantu Beres Bimbel Pro",
        text: "Kode OTP Bimbel Pro: " + code +
          "\n\nKode berlaku 10 menit setelah permintaan email diterima pengirim. Hanya satu kali pakai."
      }),
      signal: AbortSignal.timeout(12000)
    });
    retryAfter = res.headers.get("retry-after");
    if (!res.ok) {
      retryable = transientHttp(res.status);
      throw new Error("Resend HTTP " + res.status);
    }
    const result = await res.json().catch(() => null);
    if (typeof result?.id !== "string" || !result.id) throw new Error("Email ID missing");
    const db = await connectionPool().connect();
    try {
      await db.query("BEGIN");
      await db.query(
        "UPDATE password_reset_queue SET status='sent',sent_at=now(),expires_at=now()+interval '10 minutes', " +
        "code_ciphertext=NULL,locked_until=NULL,last_error=NULL,provider_id=$2 WHERE id=$1",
        [job.id,result.id]
      );
      await db.query("UPDATE password_reset_otps SET expires_at=now()+interval '10 minutes' WHERE id=$1", [job.otp_id]);
      await db.query("COMMIT");
    } catch (e) { await db.query("ROLLBACK").catch(() => undefined); throw e; }
    finally { db.release(); }
    return true;
  } catch (error) {
    const shouldRetry = retryable && job.attempts < 8;
    await connectionPool().query(
      "UPDATE password_reset_queue SET status=$2, " +
      "next_attempt_at=now()+($3::int * interval '1 second'),locked_until=NULL,last_error=$4, " +
      "code_ciphertext=CASE WHEN $2='failed' THEN NULL ELSE code_ciphertext END " +
      "WHERE id=$1 AND status='sending'",
      [job.id,shouldRetry?"queued":"failed",retrySeconds(job.attempts,retryAfter),
        retryable?"temporary_failure":"configuration_or_sender_rejected"]
    );
    return false;
  }
}
export async function drainOtpQueue(batch=4) {
  if (!queueReady()) return { configured: false, processed: 0, accepted: 0 };
  let processed=0, accepted=0;
  for(let i=0;i<Math.max(1,Math.min(10,batch));i++){
    const job=await claim();
    if(!job) break;
    processed++;
    if(await send(job)) accepted++;
  }
  return { configured:true, processed, accepted };
}
