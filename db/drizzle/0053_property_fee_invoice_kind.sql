-- Management/commission fee % on properties + a "kind" marker on invoices so
-- a rent invoice can spawn a commission invoice (فاتورة عمولة) for the landlord.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "management_fee_percent" numeric(5, 2);
ALTER TABLE "simple_invoices" ADD COLUMN IF NOT EXISTS "kind" text;
