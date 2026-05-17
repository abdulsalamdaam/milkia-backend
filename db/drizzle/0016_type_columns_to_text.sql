-- Property & unit "type" move off Postgres enums to plain text so the
-- options can be driven by the central `lookups` table (and an "Other"
-- free-text value). Existing rows keep their values verbatim.
ALTER TABLE "units" ALTER COLUMN "type" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "units" ALTER COLUMN "type" SET DATA TYPE text USING "type"::text;
--> statement-breakpoint
ALTER TABLE "units" ALTER COLUMN "type" SET DEFAULT 'apartment';
--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "type" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "type" SET DATA TYPE text USING "type"::text;
--> statement-breakpoint
ALTER TABLE "properties" ALTER COLUMN "type" SET DEFAULT 'residential';
--> statement-breakpoint
DROP TYPE IF EXISTS "unit_type";
--> statement-breakpoint
DROP TYPE IF EXISTS "property_type";
