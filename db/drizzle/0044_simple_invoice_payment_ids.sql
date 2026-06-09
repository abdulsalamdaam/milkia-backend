-- An invoice can cover several same-day installments — store all their ids.
ALTER TABLE "simple_invoices" ADD COLUMN IF NOT EXISTS "payment_ids" jsonb;
