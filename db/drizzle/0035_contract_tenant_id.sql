-- Real FK link from a contract to its registered tenant (one tenant → many
-- contracts). Replaces the previous name/phone/ID text-matching guesswork.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "tenant_id" integer;

DO $$ BEGIN
  ALTER TABLE "contracts"
    ADD CONSTRAINT "contracts_tenant_id_tenants_id_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- One-time backfill of existing contracts, scoped to the same landlord and
-- prioritised: national ID first, then phone. Name is intentionally NOT used —
-- it's the loose match that produced false links in the first place. Each step
-- only fills rows still unmatched, so the stronger (ID) match always wins.

-- 1) by national ID (unique identifier — safest)
UPDATE "contracts" c SET "tenant_id" = t."id"
FROM "tenants" t
WHERE c."tenant_id" IS NULL
  AND t."user_id" = c."user_id"
  AND t."deleted_at" IS NULL
  AND c."tenant_id_number" IS NOT NULL AND btrim(c."tenant_id_number") <> ''
  AND btrim(c."tenant_id_number") = btrim(t."national_id");

-- 2) by phone (only rows still unmatched)
UPDATE "contracts" c SET "tenant_id" = t."id"
FROM "tenants" t
WHERE c."tenant_id" IS NULL
  AND t."user_id" = c."user_id"
  AND t."deleted_at" IS NULL
  AND c."tenant_phone" IS NOT NULL AND btrim(c."tenant_phone") <> ''
  AND btrim(c."tenant_phone") = btrim(t."phone");
