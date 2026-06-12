-- Optional reference to the official Ejar (إيجار) platform contract number.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "ejar_contract_number" text;
