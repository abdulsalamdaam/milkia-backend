-- Payment method captured when an invoice is confirmed (collection step).
ALTER TABLE "simple_invoices" ADD COLUMN IF NOT EXISTS "payment_method" text;
