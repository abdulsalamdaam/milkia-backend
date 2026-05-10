CREATE TYPE "public"."user_role" AS ENUM('super_admin', 'admin', 'user', 'demo');--> statement-breakpoint
CREATE TYPE "public"."property_status" AS ENUM('active', 'inactive', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."property_type" AS ENUM('residential', 'commercial', 'mixed', 'land', 'villa', 'apartment_building', 'tower', 'plaza', 'mall', 'chalet', 'other');--> statement-breakpoint
CREATE TYPE "public"."unit_status" AS ENUM('available', 'rented', 'maintenance', 'reserved');--> statement-breakpoint
CREATE TYPE "public"."unit_type" AS ENUM('apartment', 'villa', 'office', 'shop', 'warehouse', 'studio');--> statement-breakpoint
CREATE TYPE "public"."contract_status" AS ENUM('active', 'expired', 'terminated', 'pending');--> statement-breakpoint
CREATE TYPE "public"."payment_frequency" AS ENUM('monthly', 'quarterly', 'semi_annual', 'annual');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('paid', 'pending', 'overdue', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."maintenance_priority" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."maintenance_status" AS ENUM('open', 'in_progress', 'pending_approval', 'completed');--> statement-breakpoint
CREATE TYPE "public"."sender_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."owner_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."owner_type" AS ENUM('individual', 'company');--> statement-breakpoint
CREATE TYPE "public"."tenant_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."tenant_type" AS ENUM('individual', 'company');--> statement-breakpoint
CREATE TYPE "public"."contact_submission_status" AS ENUM('new', 'read', 'in_progress', 'resolved', 'spam');--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"account_status" text DEFAULT 'active' NOT NULL,
	"phone" text,
	"company" text,
	"login_count" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"token_version" integer DEFAULT 0 NOT NULL,
	"permissions" jsonb,
	"role_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "login_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"ip" text,
	"device" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "property_type" DEFAULT 'residential' NOT NULL,
	"status" "property_status" DEFAULT 'active' NOT NULL,
	"city" text NOT NULL,
	"district" text,
	"street" text,
	"deed_number" text,
	"total_units" integer DEFAULT 0 NOT NULL,
	"floors" integer,
	"elevators" integer,
	"parkings" integer,
	"year_built" integer,
	"building_type" text,
	"usage_type" text,
	"region" text,
	"postal_code" text,
	"building_number" text,
	"additional_number" text,
	"owner_id" integer,
	"amenities_data" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "units" (
	"id" serial PRIMARY KEY NOT NULL,
	"property_id" integer NOT NULL,
	"unit_number" text NOT NULL,
	"type" "unit_type" DEFAULT 'apartment' NOT NULL,
	"status" "unit_status" DEFAULT 'available' NOT NULL,
	"floor" integer,
	"area" numeric(10, 2),
	"bedrooms" integer,
	"bathrooms" integer,
	"living_rooms" integer,
	"halls" integer,
	"parking_spaces" integer,
	"rent_price" numeric(12, 2),
	"electricity_meter" text,
	"water_meter" text,
	"gas_meter" text,
	"ac_units" integer,
	"ac_type" text,
	"parking_type" text,
	"furnishing" text,
	"kitchen_type" text,
	"fiber" text,
	"amenities" text,
	"unit_direction" text,
	"year_built" text,
	"finishing" text,
	"facade_length" numeric(10, 2),
	"unit_length" numeric(10, 2),
	"unit_width" numeric(10, 2),
	"unit_height" numeric(10, 2),
	"has_mezzanine" boolean,
	"is_demo" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"unit_id" integer NOT NULL,
	"contract_number" text NOT NULL,
	"tenant_type" text,
	"tenant_name" text NOT NULL,
	"tenant_id_number" text,
	"tenant_phone" text,
	"tenant_nationality" text,
	"tenant_email" text,
	"tenant_tax_number" text,
	"tenant_address" text,
	"tenant_postal_code" text,
	"tenant_additional_number" text,
	"tenant_building_number" text,
	"signing_date" date,
	"signing_place" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"monthly_rent" numeric(12, 2) NOT NULL,
	"payment_frequency" "payment_frequency" DEFAULT 'monthly' NOT NULL,
	"deposit_amount" numeric(12, 2),
	"rep_name" text,
	"rep_id_number" text,
	"company_unified" text,
	"company_org_type" text,
	"landlord_name" text,
	"landlord_nationality" text,
	"landlord_id_number" text,
	"landlord_phone" text,
	"landlord_email" text,
	"landlord_tax_number" text,
	"landlord_address" text,
	"landlord_postal_code" text,
	"landlord_additional_number" text,
	"landlord_building_number" text,
	"agency_fee" numeric(12, 2),
	"first_payment_amount" numeric(12, 2),
	"additional_fees" jsonb,
	"status" "contract_status" DEFAULT 'active' NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"contract_id" integer NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"due_date" date NOT NULL,
	"paid_date" date,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"receipt_number" text,
	"description" text,
	"notes" text,
	"is_demo" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tenant_id" integer,
	"contract_id" integer,
	"unit_label" text NOT NULL,
	"description" text NOT NULL,
	"priority" "maintenance_priority" DEFAULT 'medium' NOT NULL,
	"status" "maintenance_status" DEFAULT 'open' NOT NULL,
	"supplier" text,
	"estimated_cost" numeric(12, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"ticket_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_role" "sender_role" NOT NULL,
	"message" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owners" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "owner_type" DEFAULT 'individual' NOT NULL,
	"id_number" text,
	"phone" text,
	"email" text,
	"iban" text,
	"management_fee_percent" numeric(5, 2),
	"tax_number" text,
	"address" text,
	"postal_code" text,
	"additional_number" text,
	"building_number" text,
	"status" "owner_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"is_demo" text DEFAULT 'false',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"type" "tenant_type" DEFAULT 'individual' NOT NULL,
	"national_id" text,
	"phone" text,
	"email" text,
	"tax_number" text,
	"address" text,
	"postal_code" text,
	"additional_number" text,
	"building_number" text,
	"nationality" text,
	"status" "tenant_status" DEFAULT 'active' NOT NULL,
	"notes" text,
	"is_demo" text DEFAULT 'false',
	"token_version" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"fcm_token" text,
	"fcm_platform" text,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "facilities" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"property_name" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'خدمي' NOT NULL,
	"status" text DEFAULT 'يعمل' NOT NULL,
	"last_maintenance" text,
	"next_maintenance" text,
	"monthly_opex" numeric(12, 2) DEFAULT '0',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"name" text NOT NULL,
	"target_units" text,
	"channel" text DEFAULT '' NOT NULL,
	"budget" numeric(12, 2) DEFAULT '0',
	"leads" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'نشطة' NOT NULL,
	"start_date" text,
	"end_date" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"phone" text,
	"description" text NOT NULL,
	"source" text DEFAULT 'landing-contact',
	"status" "contact_submission_status" DEFAULT 'new' NOT NULL,
	"response_notes" text,
	"resolved_by_id" integer,
	"resolved_at" timestamp with time zone,
	"ip" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_logs" ADD CONSTRAINT "login_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_id_owners_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."owners"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_property_id_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."properties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;