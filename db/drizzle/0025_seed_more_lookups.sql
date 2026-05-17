-- Seed the remaining dropdown categories (unit_category, supplier_category)
-- so every list-style dropdown is lookup-driven. Idempotent.
INSERT INTO "lookups" ("category", "key", "label_ar", "label_en", "sort_order", "company_id")
SELECT v.category, v.key, v.label_ar, v.label_en, v.sort_order, NULL
FROM (VALUES
  ('unit_category', 'residential', 'سكني',  'Residential', 1),
  ('unit_category', 'commercial',  'تجاري', 'Commercial',  2),
  ('unit_category', 'offices',     'مكاتب', 'Offices',     3),
  ('unit_category', 'warehouse',   'مستودع','Warehouse',   4),
  ('supplier_category', 'cleaning',    'نظافة وتعقيم',  'Cleaning & Sanitization', 1),
  ('supplier_category', 'maintenance', 'صيانة وإصلاح',  'Maintenance & Repair',    2),
  ('supplier_category', 'security',    'أمن وحراسة',    'Security & Guard',        3),
  ('supplier_category', 'landscaping', 'تنسيق حدائق',   'Landscaping',             4),
  ('supplier_category', 'electrical',  'كهرباء وإضاءة', 'Electrical & Lighting',   5),
  ('supplier_category', 'plumbing',    'سباكة وصرف',    'Plumbing & Drainage',     6),
  ('supplier_category', 'painting',    'دهانات وديكور', 'Paint & Decor',           7),
  ('supplier_category', 'elevator',    'مصاعد',         'Elevators',               8)
) AS v(category, key, label_ar, label_en, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "lookups" l WHERE l.category = v.category AND l.key = v.key AND l.company_id IS NULL
);
