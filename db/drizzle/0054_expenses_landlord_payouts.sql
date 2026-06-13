-- Expenses (other operating costs deducted from the landlord's net) and
-- landlord payouts (transfers of the net due to the landlord) — feed the
-- accounting reports.
CREATE TABLE IF NOT EXISTS "expenses" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "property_id" integer,
  "owner_id" integer,
  "category" text,
  "amount" numeric(12, 2) NOT NULL,
  "expense_date" text,
  "notes" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "landlord_payouts" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "owner_id" integer NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "transfer_date" text,
  "method" text,
  "reference" text,
  "notes" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "expenses_user_idx" ON "expenses" ("user_id");
CREATE INDEX IF NOT EXISTS "landlord_payouts_user_idx" ON "landlord_payouts" ("user_id");
