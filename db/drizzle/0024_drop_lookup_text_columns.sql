-- Phase 6 of the lookups-FK refactor: drop the legacy text columns now
-- that the *_lookup_id foreign keys are the source of truth. Staging —
-- no live users; the FK columns were backfilled in 0023.
ALTER TABLE "properties" DROP COLUMN IF EXISTS "type";
--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN IF EXISTS "usage_type";
--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN IF EXISTS "region";
--> statement-breakpoint
ALTER TABLE "properties" DROP COLUMN IF EXISTS "city";
--> statement-breakpoint
ALTER TABLE "units" DROP COLUMN IF EXISTS "type";
--> statement-breakpoint
ALTER TABLE "units" DROP COLUMN IF EXISTS "unit_direction";
--> statement-breakpoint
ALTER TABLE "units" DROP COLUMN IF EXISTS "finishing";
--> statement-breakpoint
ALTER TABLE "owners" DROP COLUMN IF EXISTS "nationality";
