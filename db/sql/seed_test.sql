-- ════════════════════════════════════════════════════════════════════
-- Test data seed: 3 users + 3 companies + 3 owners, each with 1
-- property / 1 unit / 1 tenant / 1 contract.
--
-- Idempotent — re-running this is safe. Rows are tagged `is_demo = true`
-- where supported so they're easy to find later:
--
--     DELETE FROM contracts  WHERE is_demo = true;
--     DELETE FROM units      WHERE is_demo = true;
--     DELETE FROM properties WHERE is_demo = true;
--     DELETE FROM tenants    WHERE is_demo = 'true';   -- (text column)
--     DELETE FROM owners     WHERE is_demo = 'true';   -- (text column)
--     DELETE FROM companies  WHERE name LIKE '%Test Co%';
--     DELETE FROM users      WHERE email LIKE '%@seed.test';
--
-- The bcrypt hash on the user rows is a placeholder ($2a$10$...).
-- Login is via email-OTP, so the password is never used; but the column
-- is NOT NULL so we have to put *something* there.
-- ════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Companies ────────────────────────────────────────────────────────
INSERT INTO companies (name, commercial_reg, vat_number, official_email, company_phone, website, city, address, bio)
SELECT * FROM (VALUES
  ('Al-Rashid Properties Test Co', '1010111111', '300011111100003', 'info@alrashid-test.sa', '+966500000001', 'https://alrashid.test', 'Riyadh',  'الرياض - حي العليا', 'شركة عقارية متخصصة في إدارة العقارات السكنية'),
  ('Al-Hassan Real Estate Test Co','1010222222', '300022222200003', 'info@alhassan-test.sa','+966500000002', 'https://alhassan.test','Jeddah',  'جدة - حي الزهراء',  'شركة عقارية رائدة في المنطقة الغربية'),
  ('Tech Tower Investment Test Co','1010333333', '300033333300003', 'info@techtower-test.sa','+966500000003','https://techtower.test','Dammam','الدمام - حي الفيصلية','شركة استثمار في العقارات التجارية والمكتبية')
) AS v(name, commercial_reg, vat_number, official_email, company_phone, website, city, address, bio)
WHERE NOT EXISTS (SELECT 1 FROM companies c WHERE c.name = v.name);

-- 2. Users (linked to companies via the `user` system role) ──────────
WITH role_user AS (
  SELECT id FROM roles WHERE key = 'user' AND company_id IS NULL LIMIT 1
)
INSERT INTO users (email, password_hash, name, role, is_active, account_status, phone, company_id, role_id)
SELECT v.email,
       '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', -- placeholder; OTP login
       v.name, 'user'::user_role, true, 'active', v.phone,
       (SELECT c.id FROM companies c WHERE c.name = v.company_name LIMIT 1),
       (SELECT id FROM role_user)
FROM (VALUES
  ('ahmed@seed.test',  'أحمد الراشد',    '+966501111111', 'Al-Rashid Properties Test Co'),
  ('fatima@seed.test', 'فاطمة الحسن',    '+966502222222', 'Al-Hassan Real Estate Test Co'),
  ('khalid@seed.test', 'خالد الدوسري',   '+966503333333', 'Tech Tower Investment Test Co')
) AS v(email, name, phone, company_name)
ON CONFLICT (email) DO UPDATE
  SET company_id = EXCLUDED.company_id,
      role_id    = EXCLUDED.role_id,
      is_active  = true,
      account_status = 'active';

-- 3. Owners (linked to the same companies + their owning user) ──────
INSERT INTO owners (user_id, company_id, name, type, status, id_number, phone, email, iban, management_fee_percent, is_demo)
SELECT
  u.id, u.company_id,
  v.owner_name, v.owner_type::owner_type, v.owner_status::owner_status,
  v.id_number, v.phone, v.owner_email, v.iban, v.fee_pct, 'true'
FROM (VALUES
  ('ahmed@seed.test',  'مكتب الراشد لإدارة العقارات', 'company',    'active', '7700111111', '+966551111111', 'office@alrashid-test.sa', 'SA0380000000111111111111', 5.00),
  ('fatima@seed.test', 'فاطمة الحسن',                'individual', 'active', '1010222222', '+966552222222', 'fatima.owner@seed.test',  'SA0380000000222222222222', 4.50),
  ('khalid@seed.test', 'مجموعة برج التقنية',         'company',    'active', '7700333333', '+966553333333', 'khalid.group@seed.test',  'SA0380000000333333333333', 6.00)
) AS v(user_email, owner_name, owner_type, owner_status, id_number, phone, owner_email, iban, fee_pct)
JOIN users u ON u.email = v.user_email
WHERE NOT EXISTS (
  SELECT 1 FROM owners o WHERE o.user_id = u.id AND o.name = v.owner_name
);

-- 4. Tenants (one per company, scoped via user_id) ──────────────────
INSERT INTO tenants (user_id, name, type, status, national_id, phone, email, nationality, address, is_demo)
SELECT
  u.id,
  v.tenant_name, v.tenant_type::tenant_type, 'active'::tenant_status,
  v.national_id, v.phone, v.email, v.nationality, v.address, 'true'
FROM (VALUES
  ('ahmed@seed.test',  'محمد بن عبدالله السعود', 'individual', '1011223344', '+966561111111', 'mohammed.tenant@seed.test', 'سعودي', 'الرياض - حي النزهة'),
  ('fatima@seed.test', 'سارة الحربي',            'individual', '1099887766', '+966562222222', 'sara.tenant@seed.test',     'سعودية','جدة - حي السلامة'),
  ('khalid@seed.test', 'شركة الحلول التقنية',    'company',    '7011223344', '+966563333333', 'tech-solutions@seed.test',  'سعودية','الدمام - حي الواحة')
) AS v(user_email, tenant_name, tenant_type, national_id, phone, email, nationality, address)
JOIN users u ON u.email = v.user_email
WHERE NOT EXISTS (
  SELECT 1 FROM tenants t WHERE t.user_id = u.id AND t.email = v.email
);

-- 5. Properties (one per user, marked is_demo) ──────────────────────
INSERT INTO properties (user_id, name, type, status, city, district, street, total_units, floors, building_type, region, building_number, is_demo, owner_id)
SELECT
  u.id,
  v.name, v.ptype::property_type, 'active'::property_status,
  v.city, v.district, v.street, 1, v.floors, v.btype, v.region, v.bnum, true,
  (SELECT o.id FROM owners o WHERE o.user_id = u.id LIMIT 1)
FROM (VALUES
  ('ahmed@seed.test',  'برج الراشد السكني',  'residential',       'الرياض', 'حي العليا',  'شارع الملك فهد',     12, 'سكني',  'منطقة الرياض', '1234'),
  ('fatima@seed.test', 'مجمع الحسن للفلل',   'villa',             'جدة',    'حي الزهراء', 'شارع التحلية',       3,  'سكني',  'منطقة مكة',     '5678'),
  ('khalid@seed.test', 'برج التقنية المكتبي','commercial',        'الدمام', 'حي الفيصلية','شارع الأمير محمد',   20, 'تجاري', 'المنطقة الشرقية','9012')
) AS v(user_email, name, ptype, city, district, street, floors, btype, region, bnum)
JOIN users u ON u.email = v.user_email
WHERE NOT EXISTS (
  SELECT 1 FROM properties p WHERE p.user_id = u.id AND p.name = v.name
);

-- 6. Units (one per property) ───────────────────────────────────────
INSERT INTO units (property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, parking_spaces, rent_price, is_demo)
SELECT
  p.id,
  v.unit_number, v.utype::unit_type, 'rented'::unit_status,
  v.floor, v.area, v.bedrooms, v.bathrooms, v.living_rooms, v.parking, v.rent, true
FROM (VALUES
  ('برج الراشد السكني',   'A-101', 'apartment', 5, 120.50, 3, 2, 1, 1, 5500.00),
  ('مجمع الحسن للفلل',    'V-1',   'villa',     1, 350.00, 5, 4, 2, 2, 12000.00),
  ('برج التقنية المكتبي', 'C-301', 'office',    3, 75.00,  0, 1, 0, 1, 4500.00)
) AS v(property_name, unit_number, utype, floor, area, bedrooms, bathrooms, living_rooms, parking, rent)
JOIN properties p ON p.name = v.property_name
WHERE NOT EXISTS (
  SELECT 1 FROM units u WHERE u.property_id = p.id AND u.unit_number = v.unit_number
);

-- 7. Contracts (one per user, linking the unit + tenant) ────────────
INSERT INTO contracts (user_id, unit_id, contract_number, tenant_type, tenant_name, tenant_id_number, tenant_phone, tenant_email, tenant_nationality, signing_date, signing_place, start_date, end_date, monthly_rent, payment_frequency, deposit_amount, status, is_demo, landlord_name, landlord_id_number)
SELECT
  u.id, un.id,
  v.contract_number, v.tenant_type, v.tenant_name, v.tenant_id, v.tenant_phone, v.tenant_email, v.tenant_nat,
  v.sign_date::date, v.sign_place,
  v.start_date::date, v.end_date::date,
  v.monthly_rent, v.freq::payment_frequency, v.deposit,
  'active'::contract_status, true,
  v.landlord_name, v.landlord_id
FROM (VALUES
  ('ahmed@seed.test',  'A-101', 'C-2026-0001', 'individual', 'محمد بن عبدالله السعود', '1011223344', '+966561111111', 'mohammed.tenant@seed.test', 'سعودي',  '2026-01-01', 'الرياض', '2026-01-15', '2027-01-14', 5500.00,  'monthly', 11000.00, 'أحمد الراشد', '1010111111'),
  ('fatima@seed.test', 'V-1',   'C-2026-0002', 'individual', 'سارة الحربي',            '1099887766', '+966562222222', 'sara.tenant@seed.test',     'سعودية', '2026-02-01', 'جدة',    '2026-02-15', '2027-02-14', 12000.00, 'quarterly', 24000.00, 'فاطمة الحسن', '1010222222'),
  ('khalid@seed.test', 'C-301', 'C-2026-0003', 'company',    'شركة الحلول التقنية',    '7011223344', '+966563333333', 'tech-solutions@seed.test',  'سعودية', '2026-03-01', 'الدمام', '2026-03-15', '2028-03-14', 4500.00,  'annual',    9000.00,  'خالد الدوسري', '1010333333')
) AS v(user_email, unit_number, contract_number, tenant_type, tenant_name, tenant_id, tenant_phone, tenant_email, tenant_nat, sign_date, sign_place, start_date, end_date, monthly_rent, freq, deposit, landlord_name, landlord_id)
JOIN users u ON u.email = v.user_email
JOIN properties p ON p.user_id = u.id
JOIN units un ON un.property_id = p.id AND un.unit_number = v.unit_number
ON CONFLICT (contract_number) DO NOTHING;

COMMIT;

-- ── Sanity check ───────────────────────────────────────────────────
-- Run these afterwards to confirm everything is wired:
--
-- SELECT u.email, u.name, c.name AS company, r.label_en AS role,
--        (SELECT count(*) FROM owners     o WHERE o.user_id = u.id) AS owners,
--        (SELECT count(*) FROM properties p WHERE p.user_id = u.id) AS properties,
--        (SELECT count(*) FROM units      un JOIN properties p ON un.property_id = p.id WHERE p.user_id = u.id) AS units,
--        (SELECT count(*) FROM tenants    t WHERE t.user_id = u.id) AS tenants,
--        (SELECT count(*) FROM contracts  ct WHERE ct.user_id = u.id) AS contracts
-- FROM users u
-- LEFT JOIN companies c ON u.company_id = c.id
-- LEFT JOIN roles r     ON u.role_id    = r.id
-- WHERE u.email LIKE '%@seed.test'
-- ORDER BY u.id;
