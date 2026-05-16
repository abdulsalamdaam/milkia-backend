ALTER TABLE "contracts" ADD COLUMN "vat_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "escalation_rate" numeric(5, 2) DEFAULT '0' NOT NULL;