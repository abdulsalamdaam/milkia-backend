-- Email verification for users/employees.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" boolean NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified_at" timestamptz;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verify_token_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verify_expires_at" timestamptz;

-- Existing accounts are already trusted/active — treat them as verified so the
-- new login gate doesn't lock anyone out.
UPDATE "users" SET "email_verified" = true WHERE "email_verified" = false;
