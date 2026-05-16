CREATE TABLE IF NOT EXISTS "lookups" (
  "id" serial PRIMARY KEY NOT NULL,
  "category" text NOT NULL,
  "key" text NOT NULL,
  "label_ar" text NOT NULL,
  "label_en" text NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "company_id" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "lookups_category_key_company_uniq" ON "lookups" ("category","key","company_id");
