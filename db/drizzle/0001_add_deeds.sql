CREATE TYPE "public"."deed_type" AS ENUM('electronic', 'paper');--> statement-breakpoint
CREATE TABLE "deeds" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"deed_number" text NOT NULL,
	"deed_type" "deed_type" DEFAULT 'electronic' NOT NULL,
	"document_url" text,
	"document_name" text,
	"owner_id" integer,
	"issue_date" timestamp with time zone,
	"issuing_authority" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "properties" ADD COLUMN "deed_id" integer;--> statement-breakpoint
ALTER TABLE "deeds" ADD CONSTRAINT "deeds_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deeds" ADD CONSTRAINT "deeds_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_deed_id_deeds_id_fk" FOREIGN KEY ("deed_id") REFERENCES "public"."deeds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "deeds_user_deednumber_uniq" ON "deeds" USING btree ("user_id","deed_number");--> statement-breakpoint
CREATE UNIQUE INDEX "properties_deed_id_uniq" ON "properties" USING btree ("deed_id");
