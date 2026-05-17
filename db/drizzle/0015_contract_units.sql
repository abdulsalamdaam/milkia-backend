CREATE TABLE IF NOT EXISTS "contract_units" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_units" ADD CONSTRAINT "contract_units_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "contracts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "contract_units" ADD CONSTRAINT "contract_units_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "contract_units_contract_unit_uniq" ON "contract_units" ("contract_id","unit_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_units_contract_idx" ON "contract_units" ("contract_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "contract_units_unit_idx" ON "contract_units" ("unit_id");
--> statement-breakpoint
INSERT INTO "contract_units" ("contract_id", "unit_id")
SELECT "id", "unit_id" FROM "contracts" WHERE "unit_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "contracts" DROP COLUMN IF EXISTS "unit_id";
