-- Deposit (الوديعة) gains a status + due date. `prepaid_rent` is an
-- amount paid up-front against the contract's rent — counted as already
-- paid in the rent totals.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "deposit_status" text;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "deposit_due_date" date;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "prepaid_rent" numeric(14, 2) DEFAULT '0' NOT NULL;
