-- Per-year rental rates. A contract can override the rent for specific
-- contract years (year 1, 2, 3, …); years without a row fall back to the
-- contract's base monthlyRent (with escalation).
CREATE TABLE IF NOT EXISTS "contract_rent_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"year" integer NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_rent_terms" ADD CONSTRAINT "contract_rent_terms_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_rent_terms_contract_idx" ON "contract_rent_terms" ("contract_id");
