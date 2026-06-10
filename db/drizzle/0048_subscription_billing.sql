-- Subscription billing: lifecycle status, billing cycle, desired plan (from
-- the landing), and a subscription_payments table for Moyasar invoices.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "subscription_status" text NOT NULL DEFAULT 'pending_payment';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "billing_cycle" text NOT NULL DEFAULT 'monthly';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "desired_package_plan" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "desired_billing_cycle" text;

-- Existing accounts are already operating — treat them as active so the new
-- gating never locks anyone out retroactively.
UPDATE "users" SET "subscription_status" = 'active' WHERE "onboarded_at" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "subscription_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "plan" text NOT NULL,
  "billing_cycle" text NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text NOT NULL DEFAULT 'SAR',
  "status" text NOT NULL DEFAULT 'pending',
  "moyasar_invoice_id" text,
  "moyasar_payment_id" text,
  "payment_url" text,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "subscription_payments_user_idx" ON "subscription_payments" ("user_id");
CREATE INDEX IF NOT EXISTS "subscription_payments_invoice_idx" ON "subscription_payments" ("moyasar_invoice_id");
