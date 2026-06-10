-- Per-installment VAT flag. Rent rows follow the contract's vat flag; fee rows
-- follow their own. Lets invoices/schedules show VAT per line instead of
-- applying it to everything.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "vat_enabled" boolean NOT NULL DEFAULT false;

-- Backfill rent installments (no description) from the contract's vat flag.
UPDATE "payments" p
SET "vat_enabled" = c."vat_enabled"
FROM "contracts" c
WHERE p."contract_id" = c."id" AND p."description" IS NULL;

-- Backfill fee installments: VAT on only when a matching additional fee on the
-- contract has vat = true (matched by name).
UPDATE "payments" p
SET "vat_enabled" = true
FROM "contracts" c
WHERE p."contract_id" = c."id"
  AND p."description" IS NOT NULL
  AND c."additional_fees" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(c."additional_fees"::jsonb) AS f
    WHERE (f->>'name') = p."description" AND (f->>'vat')::boolean = true
  );
