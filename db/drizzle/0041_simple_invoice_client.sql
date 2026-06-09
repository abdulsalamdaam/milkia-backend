-- Extra client contact details (phone / email / address / VAT no.) on a doc.
ALTER TABLE "simple_invoices" ADD COLUMN IF NOT EXISTS "client" jsonb;
