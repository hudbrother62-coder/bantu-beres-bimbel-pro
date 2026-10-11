CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "hash" text PRIMARY KEY NOT NULL,
  "account_id" uuid NOT NULL REFERENCES "public"."accounts"("id") ON DELETE cascade,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reset_account_created" ON "password_reset_tokens" ("account_id", "created_at");
