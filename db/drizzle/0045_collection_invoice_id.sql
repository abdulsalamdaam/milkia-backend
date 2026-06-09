-- Link a collection back to the invoice it was recorded for.
ALTER TABLE "payment_collections" ADD COLUMN IF NOT EXISTS "invoice_id" integer;
