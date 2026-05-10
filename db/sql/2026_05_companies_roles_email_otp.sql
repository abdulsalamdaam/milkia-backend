-- ════════════════════════════════════════════════════════════════════
-- Migration: companies + roles + email_otp_tokens, plus FKs on users
-- and owners. Idempotent — safe to run on every boot.
--
-- Order of operations matters here because each step depends on the
-- columns/indexes the previous one creates:
--   1. New tables (companies, roles, email_otp_tokens)
--   2. FK columns on users + owners
--   3. Dedupe legacy rows (uses users.role_id from step 2)
--   4. Partial unique indexes on roles (uses deduped data)
--   5. Seed system roles (uses partial unique indexes)
--   6. Backfill companies + role assignments
-- ════════════════════════════════════════════════════════════════════

-- 1. Tables ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
  id                serial PRIMARY KEY,
  name              text NOT NULL,
  commercial_reg    text,
  vat_number        text,
  tax_number        text,
  official_email    text,
  company_phone     text,
  website           text,
  city              text,
  region            text,
  district          text,
  street            text,
  building_number   text,
  postal_code       text,
  additional_number text,
  address           text,
  logo_key          text,
  bio               text,
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS companies_vat_idx ON companies (vat_number);

CREATE TABLE IF NOT EXISTS roles (
  id           serial PRIMARY KEY,
  key          text NOT NULL,
  label_ar     text NOT NULL,
  label_en     text NOT NULL,
  permissions  jsonb NOT NULL,
  is_system    boolean NOT NULL DEFAULT false,
  company_id   integer REFERENCES companies(id) ON DELETE CASCADE,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_otp_tokens (
  id           serial PRIMARY KEY,
  email        text NOT NULL,
  code_hash    text NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  expires_at   timestamptz NOT NULL,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS email_otp_tokens_email_idx ON email_otp_tokens (email, expires_at);

-- 2. FK columns on users + owners ────────────────────────────────────

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS role_id    integer REFERENCES roles(id)     ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_company_id_idx ON users (company_id);
CREATE INDEX IF NOT EXISTS users_role_id_idx    ON users (role_id);

ALTER TABLE owners
  ADD COLUMN IF NOT EXISTS company_id integer REFERENCES companies(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS owners_company_id_idx ON owners (company_id);

-- 3. Dedupe + partial unique indexes on roles ───────────────────────
-- Postgres treats NULL as distinct in a regular unique constraint, so the
-- earlier `(key, company_id)` index allowed the four system rows to be
-- re-inserted on every boot. Drop it, dedupe what slipped through, then
-- create the correct partial indexes.

DROP INDEX IF EXISTS roles_key_company_uniq;

WITH ranked AS (
  SELECT id, key,
         row_number() OVER (PARTITION BY key, (company_id IS NULL) ORDER BY id ASC) AS rn,
         min(id) OVER (PARTITION BY key, (company_id IS NULL)) AS keep_id
    FROM roles
   WHERE company_id IS NULL
)
UPDATE users u
   SET role_id = r.keep_id
  FROM ranked r
 WHERE u.role_id = r.id AND r.rn > 1;
DELETE FROM roles
 WHERE id IN (
   SELECT id FROM (
     SELECT id, row_number() OVER (PARTITION BY key, (company_id IS NULL) ORDER BY id ASC) AS rn
       FROM roles WHERE company_id IS NULL
   ) s WHERE s.rn > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS roles_system_key_uniq  ON roles (key)             WHERE company_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS roles_company_key_uniq ON roles (key, company_id) WHERE company_id IS NOT NULL;

-- 4. Seed system roles ────────────────────────────────────────────────
-- Permission lists are placeholders here; the EnsureSchema bootstrap
-- refreshes them at runtime from common/permissions.ts so adding a new
-- permission to the catalog doesn't require editing this file.

INSERT INTO roles (key, label_ar, label_en, permissions, is_system, company_id)
VALUES
  ('super_admin', 'مدير النظام', 'Super Admin',     '[]'::jsonb, true, NULL),
  ('admin',       'مشرف',         'Admin',           '[]'::jsonb, true, NULL),
  ('user',        'مالك / مدير',  'Owner / Manager', '[]'::jsonb, true, NULL),
  ('demo',        'تجريبي',       'Demo',            '[]'::jsonb, true, NULL)
ON CONFLICT (key) WHERE company_id IS NULL DO NOTHING;

-- 5. Backfill companies from legacy user fields ─────────────────────
-- One company per top-level user (ownerUserId IS NULL). Employees inherit
-- the same company_id from their owning user via the second statement.

INSERT INTO companies (name, commercial_reg, vat_number, official_email, company_phone, website, city, address, logo_key)
SELECT
  COALESCE(NULLIF(u.company, ''), u.name)        AS name,
  u.commercial_reg, u.vat_number, u.official_email, u.company_phone,
  u.website, u.city, u.address, u.logo_url
FROM users u
WHERE u.deleted_at IS NULL
  AND u.owner_user_id IS NULL
  AND u.company_id IS NULL
  AND u.role IN ('user', 'admin', 'super_admin', 'demo')
  AND (u.company IS NOT NULL OR u.commercial_reg IS NOT NULL OR u.vat_number IS NOT NULL);

-- Link top-level users to the company we just created.
UPDATE users u
SET company_id = c.id
FROM companies c
WHERE u.company_id IS NULL
  AND u.owner_user_id IS NULL
  AND c.deleted_at IS NULL
  AND COALESCE(NULLIF(u.company, ''), u.name) = c.name
  AND COALESCE(u.commercial_reg, '') = COALESCE(c.commercial_reg, '')
  AND COALESCE(u.vat_number, '')     = COALESCE(c.vat_number, '');

-- Inherit company_id for employees (rows where owner_user_id is set).
UPDATE users e
SET company_id = parent.company_id
FROM users parent
WHERE e.company_id IS NULL
  AND e.owner_user_id = parent.id
  AND parent.company_id IS NOT NULL;

-- 6. Link users to roles via legacy `role` enum ─────────────────────

UPDATE users u
SET role_id = r.id
FROM roles r
WHERE u.role_id IS NULL
  AND r.is_system = true
  AND r.company_id IS NULL
  AND r.key = u.role::text;
