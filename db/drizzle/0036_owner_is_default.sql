-- Default landlord: at most one per account; new properties auto-link to it.
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "is_default" boolean NOT NULL DEFAULT false;

-- Enforce a single active default per account (soft-deleted rows excluded so a
-- deleted default never blocks promoting a replacement).
CREATE UNIQUE INDEX IF NOT EXISTS "owners_one_default_per_user"
  ON "owners" ("user_id")
  WHERE "is_default" = true AND "deleted_at" IS NULL;
