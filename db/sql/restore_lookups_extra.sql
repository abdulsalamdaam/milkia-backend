-- Restore system lookup options (company_id = NULL) for categories that had no
-- INSERT migration in the repo (their rows predate the lookups refactor / were
-- added manually) and were lost in the full data wipe. Idempotent.
--
--   unit_direction  — unit facing (keys match UnitDetailsDrawer + AddUnitPage)
--   unit_finishing  — finishing level (keys match the finishing* locale labels)
--   fee_type        — contract additional-fee types (sensible defaults; the
--                     LookupTypeSelect lets users add more on the fly)
INSERT INTO "lookups" ("category", "key", "label_ar", "label_en", "sort_order", "company_id")
SELECT v.category, v.key, v.label_ar, v.label_en, v.sort_order, NULL
FROM (VALUES
  ('unit_direction', 'north',     'شمال',      'North',       1),
  ('unit_direction', 'south',     'جنوب',      'South',       2),
  ('unit_direction', 'east',      'شرق',       'East',        3),
  ('unit_direction', 'west',      'غرب',       'West',        4),
  ('unit_direction', 'northeast', 'شمال شرق',  'North-East',  5),
  ('unit_direction', 'northwest', 'شمال غرب',  'North-West',  6),
  ('unit_direction', 'southeast', 'جنوب شرق',  'South-East',  7),
  ('unit_direction', 'southwest', 'جنوب غرب',  'South-West',  8),

  ('unit_finishing', 'shell',      'عظم',        'Shell',      1),
  ('unit_finishing', 'incomplete', 'غير مكتمل',  'Incomplete', 2),
  ('unit_finishing', 'complete',   'مكتمل',      'Complete',   3),

  ('fee_type', 'maintenance',    'صيانة',        'Maintenance',    1),
  ('fee_type', 'services',       'خدمات',        'Services',       2),
  ('fee_type', 'insurance',      'تأمين',        'Insurance',      3),
  ('fee_type', 'cleaning',       'نظافة',        'Cleaning',       4),
  ('fee_type', 'administrative', 'رسوم إدارية',  'Administrative', 5)
) AS v(category, key, label_ar, label_en, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "lookups" l
  WHERE l.category = v.category AND l.key = v.key AND l.company_id IS NULL
);
