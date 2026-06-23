-- Re-seed the system property_usage lookup options (category "property_usage",
-- company_id = NULL) with the corrected labels from migration 0027. The base
-- rows have no INSERT migration in the repo (they predate the lookups refactor),
-- so this restores them after a full data wipe. Idempotent.
INSERT INTO "lookups" ("category", "key", "label_ar", "label_en", "sort_order", "company_id")
SELECT v.category, v.key, v.label_ar, v.label_en, v.sort_order, NULL
FROM (VALUES
  ('property_usage', 'families',    'سكن عائلات',   'Family Residential',      1),
  ('property_usage', 'individuals', 'سكن أفراد',    'Individual Residential',  2),
  ('property_usage', 'commercial',  'تجاري',        'Commercial',              3),
  ('property_usage', 'mixed',       'سكني - تجاري', 'Residential - Commercial', 4),
  ('property_usage', 'communal',    'السكن الجماعي', 'Communal Housing',        5)
) AS v(category, key, label_ar, label_en, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "lookups" l
  WHERE l.category = v.category AND l.key = v.key AND l.company_id IS NULL
);
