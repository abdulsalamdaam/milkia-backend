-- Seed the system (company_id = NULL) lookup options for property & unit
-- types so the LookupTypeSelect dropdowns are populated out of the box.
-- Idempotent: each row is inserted only if it isn't already present.
INSERT INTO "lookups" ("category", "key", "label_ar", "label_en", "sort_order", "company_id")
SELECT v.category, v.key, v.label_ar, v.label_en, v.sort_order, NULL
FROM (VALUES
  ('property_type', 'residential',        'سكني',                              'Residential',                      1),
  ('property_type', 'commercial',         'تجاري',                             'Commercial',                       2),
  ('property_type', 'mixed',              'مختلط',                             'Mixed',                            3),
  ('property_type', 'land',               'أرض',                               'Land',                             4),
  ('property_type', 'villa',              'فيلا',                              'Villa',                            5),
  ('property_type', 'apartment_building', 'عمارة',                             'Apartment Building',               6),
  ('property_type', 'tower',              'برج',                               'Tower',                            7),
  ('property_type', 'plaza',              'مجمع تجاري مفتوح (بلازا)',          'Open Commercial Complex (Plaza)',  8),
  ('property_type', 'mall',               'مجمع تجاري مغلق (مول)',             'Closed Commercial Complex (Mall)', 9),
  ('property_type', 'chalet',             'استراحة',                           'Rest House',                       10),
  ('property_type', 'other',              'أخرى',                              'Other',                            11),
  ('unit_type', 'apartment',          'شقة',                          'Apartment',                        1),
  ('unit_type', 'villa',              'فيلا',                         'Villa',                            2),
  ('unit_type', 'studio',             'شقة صغيرة (استوديو)',          'Small Apartment (Studio)',         3),
  ('unit_type', 'duplex',             'شقة ثلاثية الدور (دوبلكس)',    'Three-Floor Apartment (Duplex)',   4),
  ('unit_type', 'building',           'عمارة',                        'Apartment Building',               5),
  ('unit_type', 'tower',              'برج',                          'Tower',                            6),
  ('unit_type', 'annex',              'شقة ملحق',                     'Annex Apartment',                  7),
  ('unit_type', 'apartmentWithAnnex', 'شقة وملحق علوي',               'Apartment with Upper Annex',       8),
  ('unit_type', 'floorWithAnnex',     'دور وملحق علوي',               'Floor with Upper Annex',           9),
  ('unit_type', 'rooftopVilla',       'فيلا سطح',                     'Rooftop Villa',                    10),
  ('unit_type', 'driverRoom',         'غرفة سائق',                    'Driver Room',                      11),
  ('unit_type', 'chalet',             'استراحة',                      'Rest House',                       12),
  ('unit_type', 'sharedRoom',         'غرفة بمساحة مشتركة',           'Shared Space Room',                13),
  ('unit_type', 'hotelRoom',          'غرفة فندقية',                  'Hotel Room',                       14),
  ('unit_type', 'traditionalHouse',   'بيت شعبي',                     'Traditional House',                15),
  ('unit_type', 'twoFloorApartment',  'شقة دورين',                    'Two-Floor Apartment',              16),
  ('unit_type', 'plaza',              'مجمع تجاري مفتوح (بلازا)',     'Open Commercial Complex (Plaza)',  17),
  ('unit_type', 'mall',               'مجمع تجاري مغلق (مول)',        'Closed Commercial Complex (Mall)', 18),
  ('unit_type', 'floor',              'دور',                          'Floor',                            19),
  ('unit_type', 'kiosk',              'كشك',                          'Kiosk',                            20),
  ('unit_type', 'shop',               'محل',                          'Shop',                             21),
  ('unit_type', 'workshop',           'ورشة',                         'Workshop',                         22),
  ('unit_type', 'land',               'أرض',                          'Land',                             23),
  ('unit_type', 'leasedLand',         'أرض مسؤرة',                    'Leased Land',                      24),
  ('unit_type', 'station',            'محطة',                         'Station',                          25),
  ('unit_type', 'office',             'مكتب',                         'Office',                           26),
  ('unit_type', 'warehouse',          'مستودع',                       'Warehouse',                        27),
  ('unit_type', 'showroom',           'معرض',                         'Showroom',                         28),
  ('unit_type', 'atm',                'صراف',                         'ATM',                              29),
  ('unit_type', 'cinema',             'سينما',                        'Cinema',                           30),
  ('unit_type', 'powerStation',       'محطة كهرباء',                  'Power Station',                    31),
  ('unit_type', 'telecomTower',       'برج اتصالات',                  'Telecom Tower',                    32),
  ('unit_type', 'hotel',              'فندق',                         'Hotel',                            33),
  ('unit_type', 'parkingLot',         'مواقف سيارات',                 'Car Park',                         34)
) AS v(category, key, label_ar, label_en, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM "lookups" l
  WHERE l.category = v.category AND l.key = v.key AND l.company_id IS NULL
);
