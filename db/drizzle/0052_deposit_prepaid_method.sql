-- Payment method captured when the deposit / advance rent was collected.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "deposit_method" text;
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "prepaid_method" text;
