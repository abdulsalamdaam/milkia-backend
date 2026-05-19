-- Deed "type" moves off the Postgres enum to plain text so the user can
-- pick "Other" and type a custom type name. Existing rows keep their
-- values verbatim ("electronic" / "paper").
ALTER TABLE "deeds" ALTER COLUMN "deed_type" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "deeds" ALTER COLUMN "deed_type" SET DATA TYPE text USING "deed_type"::text;
--> statement-breakpoint
ALTER TABLE "deeds" ALTER COLUMN "deed_type" SET DEFAULT 'electronic';
--> statement-breakpoint
DROP TYPE IF EXISTS "deed_type";
