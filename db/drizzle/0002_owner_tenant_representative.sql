ALTER TABLE "owners" ADD COLUMN "is_representative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "representative_doc_url" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "original_owner_name" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "original_owner_id_number" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "original_owner_phone" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "original_owner_email" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "national_address_city" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "national_address_district" text;--> statement-breakpoint
ALTER TABLE "owners" ADD COLUMN "national_address_street" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "iban" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "employer" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "monthly_income" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "national_address_city" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "national_address_district" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "national_address_street" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "is_representative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "representative_doc_url" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "original_tenant_name" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "original_tenant_id_number" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "original_tenant_phone" text;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "original_tenant_email" text;
