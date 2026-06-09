-- First-login setup-wizard completion timestamp.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "onboarded_at" timestamp with time zone;
-- Existing accounts are already set up — mark them onboarded so they skip the
-- wizard.
UPDATE "users" SET "onboarded_at" = now() WHERE "onboarded_at" IS NULL;
