-- Subscription window (set by the admin when assigning a plan).
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_started_at" timestamp with time zone;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_ends_at" timestamp with time zone;
