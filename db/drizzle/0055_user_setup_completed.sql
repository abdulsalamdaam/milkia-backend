-- Persist completion of the first-run getting-started checklist on the user,
-- replacing a client-side localStorage flag.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "setup_completed_at" timestamp with time zone;
