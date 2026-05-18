-- Partial / multiple collections against an installment.
-- `partially_paid`: a payment with collections that don't yet cover its
-- amount in full. `payment_collections` holds one row per collection step.
ALTER TYPE "payment_status" ADD VALUE IF NOT EXISTS 'partially_paid';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payment_collections" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"collected_date" date NOT NULL,
	"method" text,
	"receipt_number" text,
	"attachment_key" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_collections" ADD CONSTRAINT "payment_collections_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payment_collections" ADD CONSTRAINT "payment_collections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payment_collections_payment_idx" ON "payment_collections" ("payment_id");
