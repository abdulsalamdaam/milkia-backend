ALTER TABLE "deeds" ADD COLUMN "owner_national_id" text;--> statement-breakpoint
ALTER TABLE "deeds" ADD COLUMN "issue_date_hijri" text;--> statement-breakpoint
ALTER TABLE "deeds" ADD COLUMN "copy_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deeds" ADD COLUMN "registry_number" text;