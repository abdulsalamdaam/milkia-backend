-- Phase 3 of the lookups-FK refactor: add nullable foreign-key columns
-- referencing lookups(id) and backfill them from the existing text
-- columns. Additive + idempotent — the legacy text columns stay in
-- place and the app keeps running off them until Phases 4-6.
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "type_lookup_id" integer REFERENCES "lookups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "usage_lookup_id" integer REFERENCES "lookups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "region_lookup_id" integer REFERENCES "lookups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "city_lookup_id" integer REFERENCES "lookups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "type_lookup_id" integer REFERENCES "lookups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "direction_lookup_id" integer REFERENCES "lookups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "finishing_lookup_id" integer REFERENCES "lookups"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN IF NOT EXISTS "nationality_lookup_id" integer REFERENCES "lookups"("id") ON DELETE SET NULL;
--> statement-breakpoint
-- Backfill — match the stored text against the system lookup rows.
-- Property/unit type/usage/direction/finishing store the lookup key;
-- region/city/nationality store the Arabic label.
UPDATE "properties" p SET "type_lookup_id" = l.id
  FROM "lookups" l WHERE l.category = 'property_type' AND l.company_id IS NULL AND l.key = p.type;
--> statement-breakpoint
UPDATE "properties" p SET "usage_lookup_id" = l.id
  FROM "lookups" l WHERE l.category = 'property_usage' AND l.company_id IS NULL AND l.key = p.usage_type;
--> statement-breakpoint
UPDATE "properties" p SET "region_lookup_id" = l.id
  FROM "lookups" l WHERE l.category = 'region' AND l.company_id IS NULL AND l.label_ar = p.region;
--> statement-breakpoint
UPDATE "properties" p SET "city_lookup_id" = l.id
  FROM "lookups" l WHERE l.category = 'city' AND l.company_id IS NULL AND l.label_ar = p.city;
--> statement-breakpoint
UPDATE "units" u SET "type_lookup_id" = l.id
  FROM "lookups" l WHERE l.category = 'unit_type' AND l.company_id IS NULL AND l.key = u.type;
--> statement-breakpoint
UPDATE "units" u SET "direction_lookup_id" = l.id
  FROM "lookups" l WHERE l.category = 'unit_direction' AND l.company_id IS NULL AND l.key = u.unit_direction;
--> statement-breakpoint
UPDATE "units" u SET "finishing_lookup_id" = l.id
  FROM "lookups" l WHERE l.category = 'unit_finishing' AND l.company_id IS NULL AND l.key = u.finishing;
--> statement-breakpoint
UPDATE "owners" o SET "nationality_lookup_id" = l.id
  FROM "lookups" l WHERE l.category = 'nationality' AND l.company_id IS NULL AND l.label_ar = o.nationality;
