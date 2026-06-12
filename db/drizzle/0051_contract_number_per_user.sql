-- Contract numbers are now per-account sequential (EQ-000001…). Drop the
-- global-unique on contract_number and make uniqueness composite per account.
ALTER TABLE "contracts" DROP CONSTRAINT IF EXISTS "contracts_contract_number_unique";
DROP INDEX IF EXISTS "contracts_contract_number_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "contracts_user_contract_number_uq"
  ON "contracts" ("user_id", "contract_number")
  WHERE "deleted_at" IS NULL;
