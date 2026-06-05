-- Custom payment schedule for contracts.
-- 1) Allow 'custom' as a payment_frequency enum value.
--    ADD VALUE IF NOT EXISTS is idempotent and must run outside a txn block.
ALTER TYPE "payment_frequency" ADD VALUE IF NOT EXISTS 'custom';

-- 2) Store the hand-built schedule (array of { dueDate, amount }) as JSON.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "custom_schedule" jsonb;
