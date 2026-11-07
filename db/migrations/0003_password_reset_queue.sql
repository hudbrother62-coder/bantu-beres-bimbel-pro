CREATE TABLE IF NOT EXISTS password_reset_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL UNIQUE REFERENCES accounts(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','failed','completed')),
  code_ciphertext text, idempotency_key text,
  otp_id uuid REFERENCES password_reset_otps(id) ON DELETE SET NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz, sent_at timestamptz, expires_at timestamptz,
  provider_id text, last_error text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS otp_queue_due ON password_reset_queue(status,next_attempt_at);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS password_reset_send_windows (
  bucket timestamptz PRIMARY KEY,
  used integer NOT NULL DEFAULT 0
);
