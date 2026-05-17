-- Subscription package per account. Existing accounts default to "broker"
-- so no one is locked out; the platform admin downgrades as appropriate.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "package_plan" text DEFAULT 'broker' NOT NULL;
