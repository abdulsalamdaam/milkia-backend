-- The property_usage lookup rows were seeded with mismatched Arabic
-- labels (e.g. key "individuals" carried label "تجاري"), so picking
-- "تجاري" in the dropdown actually stored "individuals". Correct them.
UPDATE "lookups" SET "label_ar" = 'سكن عائلات',  "label_en" = 'Family Residential'
  WHERE "category" = 'property_usage' AND "company_id" IS NULL AND "key" = 'families';
--> statement-breakpoint
UPDATE "lookups" SET "label_ar" = 'سكن أفراد',   "label_en" = 'Individual Residential'
  WHERE "category" = 'property_usage' AND "company_id" IS NULL AND "key" = 'individuals';
--> statement-breakpoint
UPDATE "lookups" SET "label_ar" = 'تجاري',       "label_en" = 'Commercial'
  WHERE "category" = 'property_usage' AND "company_id" IS NULL AND "key" = 'commercial';
--> statement-breakpoint
UPDATE "lookups" SET "label_ar" = 'سكني - تجاري', "label_en" = 'Residential - Commercial'
  WHERE "category" = 'property_usage' AND "company_id" IS NULL AND "key" = 'mixed';
--> statement-breakpoint
UPDATE "lookups" SET "label_ar" = 'السكن الجماعي', "label_en" = 'Communal Housing'
  WHERE "category" = 'property_usage' AND "company_id" IS NULL AND "key" = 'communal';
