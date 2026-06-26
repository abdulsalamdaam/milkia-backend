-- Add utility fee types (water / electricity / gas) + an explicit "other" to
-- the contract additional-fee dropdown (category fee_type, system scope).
-- Users can still add their own via LookupTypeSelect; these are sensible
-- defaults. Additive + idempotent.
INSERT INTO "lookups" ("category", "key", "label_ar", "label_en", "sort_order", "company_id")
SELECT v.category, v.key, v.label_ar, v.label_en, v.sort_order, NULL
FROM (VALUES
  ('fee_type', 'water',       'المياه',    'Water',       6),
  ('fee_type', 'electricity', 'الكهرباء',  'Electricity', 7),
  ('fee_type', 'gas',         'الغاز',     'Gas',         8),
  ('fee_type', 'other',       'أخرى',      'Other',       99)
) AS v(category, key, label_ar, label_en, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "lookups" l
  WHERE l.category = v.category AND l.key = v.key AND l.company_id IS NULL
);
