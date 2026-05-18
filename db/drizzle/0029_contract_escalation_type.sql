-- Rent escalation can now be a fixed amount, not only a percentage.
-- `escalation_type`: 'percent' | 'amount'. `escalation_rate` carries
-- whichever value — widened so it can hold a SAR amount, not just 0-999.99.
ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "escalation_type" text DEFAULT 'percent' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ALTER COLUMN "escalation_rate" TYPE numeric(12, 2);--> statement-breakpoint
-- Monthly rent kept at higher precision so annual = monthly * 12 is exact
-- (e.g. 1,000,000 / 12 stored as 83333.333333, not a lossy 83333.33 that
-- multiplies back to 999,999.96).
ALTER TABLE "contracts" ALTER COLUMN "monthly_rent" TYPE numeric(14, 6);
