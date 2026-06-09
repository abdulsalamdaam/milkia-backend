-- Plain (non-ZATCA) invoices + credit/debit notes with a draft→confirm flow.
DO $$ BEGIN
  CREATE TYPE "simple_invoice_type" AS ENUM ('invoice', 'credit', 'debit');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "simple_invoice_status" AS ENUM ('draft', 'confirmed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "simple_invoices" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "number" text NOT NULL,
  "type" "simple_invoice_type" DEFAULT 'invoice' NOT NULL,
  "status" "simple_invoice_status" DEFAULT 'draft' NOT NULL,
  "contract_id" integer,
  "payment_id" integer,
  "tenant_id" integer,
  "tenant_name" text,
  "items" jsonb,
  "subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
  "total" numeric(14, 2) DEFAULT '0' NOT NULL,
  "issue_date" date,
  "due_date" date,
  "confirmed_at" timestamp with time zone,
  "paid_date" date,
  "receipt_number" text,
  "billing_reference" text,
  "notes" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "simple_invoices_user_idx" ON "simple_invoices" ("user_id");
CREATE INDEX IF NOT EXISTS "simple_invoices_type_status_idx" ON "simple_invoices" ("type", "status");
CREATE INDEX IF NOT EXISTS "simple_invoices_payment_idx" ON "simple_invoices" ("payment_id");
