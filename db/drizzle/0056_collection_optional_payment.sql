-- Allow a collection to exist without a linked installment, so invoices that
-- aren't backed by an installment (commission invoices, free invoices) can have
-- a real collection recorded against them (by invoice_id). Without this a
-- collected commission invoice stayed at collected = 0 while showing "paid".
ALTER TABLE "payment_collections" ALTER COLUMN "payment_id" DROP NOT NULL;
