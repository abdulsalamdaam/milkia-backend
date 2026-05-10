-- ════════════════════════════════════════════════════════════════════
-- Migration: drop legacy columns from `users`.
--
-- These were marked @deprecated by the companies+roles migration. Code is
-- now reading exclusively from the new tables (verified by typecheck), so
-- the columns are safe to drop.
--
-- Idempotent. Each DROP COLUMN IF EXISTS is a no-op if the column was
-- already removed.
--
-- The `user_role` enum type is dropped at the end too — it was only
-- referenced by `users.role`, which is gone.
-- ════════════════════════════════════════════════════════════════════

ALTER TABLE users
  DROP COLUMN IF EXISTS role,
  DROP COLUMN IF EXISTS role_label,
  DROP COLUMN IF EXISTS permissions,
  DROP COLUMN IF EXISTS company,
  DROP COLUMN IF EXISTS commercial_reg,
  DROP COLUMN IF EXISTS vat_number,
  DROP COLUMN IF EXISTS official_email,
  DROP COLUMN IF EXISTS company_phone,
  DROP COLUMN IF EXISTS website,
  DROP COLUMN IF EXISTS city,
  DROP COLUMN IF EXISTS address,
  DROP COLUMN IF EXISTS logo_url;

DROP TYPE IF EXISTS user_role;
