-- Collection evidence attached when an invoice is confirmed.
ALTER TABLE "simple_invoices" ADD COLUMN IF NOT EXISTS "attachment_key" text;
