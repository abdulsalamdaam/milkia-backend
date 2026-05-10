--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Homebrew)
-- Dumped by pg_dump version 16.13 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET search_path TO public;
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: campaigns; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: owners; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users (id, email, password_hash, name, role, is_active, account_status, phone, company, login_count, last_login_at, failed_login_attempts, created_at, updated_at, token_version, permissions, role_label, deleted_at, owner_user_id, commercial_reg, vat_number, official_email, company_phone, website, city, address, logo_url) VALUES (2, 'demo@platform.com', '$2b$10$mpGpdF09iR0hYbAQrnIu8.EP4sn8FxnfvFANvGTcYxZ6d4X.Ymk0W', 'مستخدم تجريبي', 'demo', true, 'active', NULL, NULL, 0, NULL, 0, '2026-04-30 18:57:35.637399-07', '2026-04-30 18:57:35.637399-07', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, email, password_hash, name, role, is_active, account_status, phone, company, login_count, last_login_at, failed_login_attempts, created_at, updated_at, token_version, permissions, role_label, deleted_at, owner_user_id, commercial_reg, vat_number, official_email, company_phone, website, city, address, logo_url) VALUES (1, 'admin@platform.com', '$2b$10$xTyWg3iUQ988FRYrdpSF2uMK1c5ViwqqhdV9fyecKswxdEnedT/Le', 'مدير المنصة', 'super_admin', true, 'active', NULL, NULL, 1, '2026-04-30 19:04:17.758-07', 0, '2026-04-30 18:57:35.585504-07', '2026-04-30 19:04:17.759-07', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, email, password_hash, name, role, is_active, account_status, phone, company, login_count, last_login_at, failed_login_attempts, created_at, updated_at, token_version, permissions, role_label, deleted_at, owner_user_id, commercial_reg, vat_number, official_email, company_phone, website, city, address, logo_url) VALUES (4, 'admin@milkia.sa', '$2b$10$Vqf3ilyMa1aIM5CY9Sy4IeNtGn/kEXctCIi6eXluRnJ1fS1xoaIbu', 'مدير النظام', 'super_admin', true, 'active', NULL, NULL, 8, '2026-05-01 12:56:32.535-07', 0, '2026-04-30 19:10:22.081053-07', '2026-05-01 12:56:32.535-07', 1, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);
INSERT INTO public.users (id, email, password_hash, name, role, is_active, account_status, phone, company, login_count, last_login_at, failed_login_attempts, created_at, updated_at, token_version, permissions, role_label, deleted_at, owner_user_id, commercial_reg, vat_number, official_email, company_phone, website, city, address, logo_url) VALUES (3, 'owner@milkia.sa', '$2b$10$KwvEZVXyifCk7GC2Xb.mAeDkmmrrSa0zDXqHUs2EskHRHUsYtaOme', 'المالك الرئيسي', 'super_admin', true, 'active', NULL, NULL, 4, '2026-05-01 12:04:36.578-07', 2, '2026-04-30 19:10:22.029149-07', '2026-05-09 17:24:57.019-07', 0, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: properties; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.properties (id, user_id, name, type, status, city, district, street, deed_number, total_units, floors, elevators, parkings, year_built, building_type, usage_type, region, postal_code, building_number, additional_number, owner_id, amenities_data, notes, is_demo, created_at, updated_at, deleted_at) VALUES (1, 2, 'مجمع الياسمين السكني', 'residential', 'active', 'الرياض', 'حي الياسمين', 'شارع الورود', '1234567890', 12, 4, 2, 10, NULL, 'عمارة سكنية', 'سكني', NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, '2026-04-30 18:57:35.639351-07', '2026-04-30 18:57:35.639351-07', NULL);
INSERT INTO public.properties (id, user_id, name, type, status, city, district, street, deed_number, total_units, floors, elevators, parkings, year_built, building_type, usage_type, region, postal_code, building_number, additional_number, owner_id, amenities_data, notes, is_demo, created_at, updated_at, deleted_at) VALUES (2, 2, 'برج الأعمال التجاري', 'commercial', 'active', 'جدة', 'حي الشاطئ', 'شارع الكورنيش', '0987654321', 8, 8, 3, 20, NULL, 'برج تجاري', 'تجاري', NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, '2026-04-30 18:57:35.64154-07', '2026-04-30 18:57:35.64154-07', NULL);
INSERT INTO public.properties (id, user_id, name, type, status, city, district, street, deed_number, total_units, floors, elevators, parkings, year_built, building_type, usage_type, region, postal_code, building_number, additional_number, owner_id, amenities_data, notes, is_demo, created_at, updated_at, deleted_at) VALUES (3, 2, 'فيلا النخيل السكنية', 'villa', 'active', 'الرياض', 'حي النخيل', NULL, NULL, 1, 2, 0, 4, NULL, 'فيلا مستقلة', 'سكني', NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, '2026-04-30 18:57:35.642228-07', '2026-04-30 18:57:35.642228-07', NULL);
INSERT INTO public.properties (id, user_id, name, type, status, city, district, street, deed_number, total_units, floors, elevators, parkings, year_built, building_type, usage_type, region, postal_code, building_number, additional_number, owner_id, amenities_data, notes, is_demo, created_at, updated_at, deleted_at) VALUES (4, 4, 'برج', 'tower', 'active', 'الرياض', 'حي العليا ', 'شارع الملك فهد ', NULL, 1, 10, NULL, NULL, 2020, NULL, 'individuals', 'منطقة الرياض', '1293', '122', '221', NULL, '{"selected":[],"counts":{},"inCompound":false,"compoundName":""}', NULL, false, '2026-04-30 19:12:23.797872-07', '2026-04-30 19:12:23.797872-07', NULL);
INSERT INTO public.properties (id, user_id, name, type, status, city, district, street, deed_number, total_units, floors, elevators, parkings, year_built, building_type, usage_type, region, postal_code, building_number, additional_number, owner_id, amenities_data, notes, is_demo, created_at, updated_at, deleted_at) VALUES (5, 3, 'برج ملكية الياسمين', 'apartment_building', 'active', 'الرياض', 'حي الياسمين', 'شارع الورود', '4501234567', 1, 6, 1, 4, 2022, 'برج سكني', 'سكني', NULL, NULL, NULL, NULL, NULL, NULL, NULL, false, '2026-05-01 10:42:47.74515-07', '2026-05-01 10:42:47.74515-07', NULL);


--
-- Data for Name: units; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (1, 1, '101', 'apartment', 'rented', 1, 120.00, 3, 2, NULL, NULL, NULL, 2500.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.643212-07', '2026-04-30 18:57:35.643212-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (2, 1, '102', 'apartment', 'rented', 1, 90.00, 2, 1, NULL, NULL, NULL, 1800.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.643212-07', '2026-04-30 18:57:35.643212-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (3, 1, '201', 'apartment', 'available', 2, 120.00, 3, 2, NULL, NULL, NULL, 2600.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.643212-07', '2026-04-30 18:57:35.643212-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (4, 1, '202', 'apartment', 'rented', 2, 150.00, 4, 3, NULL, NULL, NULL, 3200.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.643212-07', '2026-04-30 18:57:35.643212-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (5, 1, '301', 'apartment', 'maintenance', 3, 90.00, 2, 1, NULL, NULL, NULL, 1900.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.643212-07', '2026-04-30 18:57:35.643212-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (6, 2, 'A01', 'office', 'rented', 1, 80.00, NULL, NULL, NULL, NULL, NULL, 3500.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.646162-07', '2026-04-30 18:57:35.646162-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (7, 2, 'B01', 'shop', 'available', 1, 60.00, NULL, NULL, NULL, NULL, NULL, 2800.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.646162-07', '2026-04-30 18:57:35.646162-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (8, 2, 'C01', 'office', 'rented', 2, 100.00, NULL, NULL, NULL, NULL, NULL, 4200.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.646162-07', '2026-04-30 18:57:35.646162-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (9, 3, 'V01', 'villa', 'rented', NULL, 350.00, 5, 4, NULL, NULL, NULL, 8000.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, NULL, '2026-04-30 18:57:35.647403-07', '2026-04-30 18:57:35.647403-07', NULL);
INSERT INTO public.units (id, property_id, unit_number, type, status, floor, area, bedrooms, bathrooms, living_rooms, halls, parking_spaces, rent_price, electricity_meter, water_meter, gas_meter, ac_units, ac_type, parking_type, furnishing, kitchen_type, fiber, amenities, unit_direction, year_built, finishing, facade_length, unit_length, unit_width, unit_height, has_mezzanine, is_demo, notes, created_at, updated_at, deleted_at) VALUES (15, 5, 'A-302', 'apartment', 'rented', 3, 145.50, 3, 2, 1, NULL, 1, 4500.00, NULL, NULL, NULL, NULL, 'مركزي', NULL, 'مفروشة جزئياً', NULL, NULL, NULL, NULL, NULL, 'لوكس', NULL, NULL, NULL, NULL, NULL, false, 'وحدة تجريبية لربط حساب المستأجر', '2026-05-01 10:42:47.74515-07', '2026-05-01 10:42:47.74515-07', NULL);


--
-- Data for Name: contracts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.contracts (id, user_id, unit_id, contract_number, tenant_type, tenant_name, tenant_id_number, tenant_phone, tenant_nationality, tenant_email, tenant_tax_number, tenant_address, tenant_postal_code, tenant_additional_number, tenant_building_number, signing_date, signing_place, start_date, end_date, monthly_rent, payment_frequency, deposit_amount, rep_name, rep_id_number, company_unified, company_org_type, landlord_name, landlord_nationality, landlord_id_number, landlord_phone, landlord_email, landlord_tax_number, landlord_address, landlord_postal_code, landlord_additional_number, landlord_building_number, agency_fee, first_payment_amount, additional_fees, status, is_demo, notes, created_at, updated_at, deleted_at) VALUES (1, 2, 1, 'EQ-2024-100', NULL, 'أحمد محمد العتيبي', '1234567890', '0501234567', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-01', '2026-12-31', 2500.00, 'monthly', 5000.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active', true, NULL, '2026-04-30 18:57:35.648682-07', '2026-04-30 18:57:35.648682-07', NULL);
INSERT INTO public.contracts (id, user_id, unit_id, contract_number, tenant_type, tenant_name, tenant_id_number, tenant_phone, tenant_nationality, tenant_email, tenant_tax_number, tenant_address, tenant_postal_code, tenant_additional_number, tenant_building_number, signing_date, signing_place, start_date, end_date, monthly_rent, payment_frequency, deposit_amount, rep_name, rep_id_number, company_unified, company_org_type, landlord_name, landlord_nationality, landlord_id_number, landlord_phone, landlord_email, landlord_tax_number, landlord_address, landlord_postal_code, landlord_additional_number, landlord_building_number, agency_fee, first_payment_amount, additional_fees, status, is_demo, notes, created_at, updated_at, deleted_at) VALUES (2, 2, 2, 'EQ-2024-101', NULL, 'خالد عبدالله السالم', '1098765432', '0557654321', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-01', '2026-12-31', 1800.00, 'monthly', 3600.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active', true, NULL, '2026-04-30 18:57:35.648682-07', '2026-04-30 18:57:35.648682-07', NULL);
INSERT INTO public.contracts (id, user_id, unit_id, contract_number, tenant_type, tenant_name, tenant_id_number, tenant_phone, tenant_nationality, tenant_email, tenant_tax_number, tenant_address, tenant_postal_code, tenant_additional_number, tenant_building_number, signing_date, signing_place, start_date, end_date, monthly_rent, payment_frequency, deposit_amount, rep_name, rep_id_number, company_unified, company_org_type, landlord_name, landlord_nationality, landlord_id_number, landlord_phone, landlord_email, landlord_tax_number, landlord_address, landlord_postal_code, landlord_additional_number, landlord_building_number, agency_fee, first_payment_amount, additional_fees, status, is_demo, notes, created_at, updated_at, deleted_at) VALUES (3, 2, 4, 'EQ-2024-102', NULL, 'فيصل سعود الحربي', '1122334455', '0543219876', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-01', '2026-12-31', 3200.00, 'monthly', 6400.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active', true, NULL, '2026-04-30 18:57:35.648682-07', '2026-04-30 18:57:35.648682-07', NULL);
INSERT INTO public.contracts (id, user_id, unit_id, contract_number, tenant_type, tenant_name, tenant_id_number, tenant_phone, tenant_nationality, tenant_email, tenant_tax_number, tenant_address, tenant_postal_code, tenant_additional_number, tenant_building_number, signing_date, signing_place, start_date, end_date, monthly_rent, payment_frequency, deposit_amount, rep_name, rep_id_number, company_unified, company_org_type, landlord_name, landlord_nationality, landlord_id_number, landlord_phone, landlord_email, landlord_tax_number, landlord_address, landlord_postal_code, landlord_additional_number, landlord_building_number, agency_fee, first_payment_amount, additional_fees, status, is_demo, notes, created_at, updated_at, deleted_at) VALUES (4, 2, 6, 'EQ-2024-103', NULL, 'شركة الأفق للاستشارات', '7001234567', '0112345678', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-01', '2026-12-31', 3500.00, 'monthly', 7000.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active', true, NULL, '2026-04-30 18:57:35.648682-07', '2026-04-30 18:57:35.648682-07', NULL);
INSERT INTO public.contracts (id, user_id, unit_id, contract_number, tenant_type, tenant_name, tenant_id_number, tenant_phone, tenant_nationality, tenant_email, tenant_tax_number, tenant_address, tenant_postal_code, tenant_additional_number, tenant_building_number, signing_date, signing_place, start_date, end_date, monthly_rent, payment_frequency, deposit_amount, rep_name, rep_id_number, company_unified, company_org_type, landlord_name, landlord_nationality, landlord_id_number, landlord_phone, landlord_email, landlord_tax_number, landlord_address, landlord_postal_code, landlord_additional_number, landlord_building_number, agency_fee, first_payment_amount, additional_fees, status, is_demo, notes, created_at, updated_at, deleted_at) VALUES (5, 2, 8, 'EQ-2024-104', NULL, 'مكتب النجوم للمحاماة', '7009876543', '0126543210', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-01', '2026-12-31', 4200.00, 'monthly', 8400.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active', true, NULL, '2026-04-30 18:57:35.648682-07', '2026-04-30 18:57:35.648682-07', NULL);
INSERT INTO public.contracts (id, user_id, unit_id, contract_number, tenant_type, tenant_name, tenant_id_number, tenant_phone, tenant_nationality, tenant_email, tenant_tax_number, tenant_address, tenant_postal_code, tenant_additional_number, tenant_building_number, signing_date, signing_place, start_date, end_date, monthly_rent, payment_frequency, deposit_amount, rep_name, rep_id_number, company_unified, company_org_type, landlord_name, landlord_nationality, landlord_id_number, landlord_phone, landlord_email, landlord_tax_number, landlord_address, landlord_postal_code, landlord_additional_number, landlord_building_number, agency_fee, first_payment_amount, additional_fees, status, is_demo, notes, created_at, updated_at, deleted_at) VALUES (6, 2, 9, 'EQ-2024-105', NULL, 'سلطان ناصر القحطاني', '1556677889', '0509988776', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-01-01', '2026-12-31', 8000.00, 'monthly', 16000.00, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'active', true, NULL, '2026-04-30 18:57:35.648682-07', '2026-04-30 18:57:35.648682-07', NULL);
INSERT INTO public.contracts (id, user_id, unit_id, contract_number, tenant_type, tenant_name, tenant_id_number, tenant_phone, tenant_nationality, tenant_email, tenant_tax_number, tenant_address, tenant_postal_code, tenant_additional_number, tenant_building_number, signing_date, signing_place, start_date, end_date, monthly_rent, payment_frequency, deposit_amount, rep_name, rep_id_number, company_unified, company_org_type, landlord_name, landlord_nationality, landlord_id_number, landlord_phone, landlord_email, landlord_tax_number, landlord_address, landlord_postal_code, landlord_additional_number, landlord_building_number, agency_fee, first_payment_amount, additional_fees, status, is_demo, notes, created_at, updated_at, deleted_at) VALUES (7, 3, 15, 'MK-1777657368-1', 'individual', 'عبدالسلام (المستأجر)', '1066007100', '+966502907100', 'سعودي', 'abdulsalam@daam.sa', NULL, NULL, NULL, NULL, NULL, '2026-04-25', 'الرياض', '2026-05-01', '2027-04-30', 4500.00, 'monthly', 9000.00, NULL, NULL, NULL, NULL, 'مالك ملكية', NULL, NULL, '+966500000001', 'owner@milkia.sa', NULL, NULL, NULL, NULL, NULL, 500.00, NULL, NULL, 'active', false, 'عقد تجريبي مرتبط بحساب الجوال للتطبيق', '2026-05-01 10:42:47.74515-07', '2026-05-01 10:42:47.74515-07', NULL);


--
-- Data for Name: facilities; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: maintenance_requests; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.maintenance_requests (id, user_id, unit_label, description, priority, status, supplier, estimated_cost, created_at, updated_at, tenant_id, contract_id, deleted_at) VALUES (1, 3, 'برج ملكية الياسمين — A-302', 'Test', 'medium', 'pending_approval', NULL, NULL, '2026-05-01 11:39:01.054892-07', '2026-05-01 11:46:04.108-07', 1, 7, NULL);


--
-- Data for Name: payments; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (1, 2, 1, 2500.00, '2026-04-01', NULL, 'pending', NULL, NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (2, 2, 1, 2500.00, '2026-03-01', '2026-03-01', 'paid', 'REC-2024100', NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (3, 2, 2, 1800.00, '2026-04-01', NULL, 'pending', NULL, NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (4, 2, 2, 1800.00, '2026-03-01', '2026-03-01', 'paid', 'REC-2024101', NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (5, 2, 3, 3200.00, '2026-04-01', NULL, 'pending', NULL, NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (6, 2, 3, 3200.00, '2026-03-01', '2026-03-01', 'paid', 'REC-2024102', NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (7, 2, 4, 3500.00, '2026-04-01', NULL, 'pending', NULL, NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (8, 2, 4, 3500.00, '2026-03-01', '2026-03-01', 'paid', 'REC-2024103', NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (9, 2, 5, 4200.00, '2026-04-01', NULL, 'overdue', NULL, NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (10, 2, 5, 4200.00, '2026-03-01', '2026-03-01', 'paid', 'REC-2024104', NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (11, 2, 6, 8000.00, '2026-04-01', NULL, 'overdue', NULL, NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (12, 2, 6, 8000.00, '2026-03-01', '2026-03-01', 'paid', 'REC-2024105', NULL, NULL, true, '2026-04-30 18:57:35.652584-07', '2026-04-30 18:57:35.652584-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (13, 3, 7, 4500.00, '2026-05-01', '2026-05-01', 'paid', 'REC-MK-7-001', NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (14, 3, 7, 4500.00, '2026-06-01', NULL, 'overdue', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (17, 3, 7, 4500.00, '2026-09-01', NULL, 'pending', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (18, 3, 7, 4500.00, '2026-10-01', NULL, 'pending', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (19, 3, 7, 4500.00, '2026-11-01', NULL, 'pending', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (20, 3, 7, 4500.00, '2026-12-01', NULL, 'pending', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (21, 3, 7, 4500.00, '2027-01-01', NULL, 'pending', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (22, 3, 7, 4500.00, '2027-02-01', NULL, 'pending', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (23, 3, 7, 4500.00, '2027-03-01', NULL, 'pending', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (24, 3, 7, 4500.00, '2027-04-01', NULL, 'pending', NULL, 'القسط الأخير', NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 10:42:58.110143-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (15, 3, 7, 4500.00, '2026-07-01', '2026-05-01', 'paid', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 11:36:45.528-07', NULL);
INSERT INTO public.payments (id, user_id, contract_id, amount, due_date, paid_date, status, receipt_number, description, notes, is_demo, created_at, updated_at, deleted_at) VALUES (16, 3, 7, 4500.00, '2026-08-01', '2026-05-01', 'paid', NULL, NULL, NULL, false, '2026-05-01 10:42:58.110143-07', '2026-05-01 12:10:09.443-07', NULL);


--
-- Data for Name: tenants; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tenants (id, user_id, name, type, national_id, phone, email, tax_number, address, postal_code, additional_number, building_number, nationality, status, notes, is_demo, created_at, updated_at, token_version, last_login_at, fcm_token, fcm_platform, deleted_at) VALUES (2, 4, 'abdullah saasds', 'individual', '1099192', '502907100', 'asa@t.com', '1212', 'منطقة الباحة، الباحة، 21211221', '12122112', '121212', '12112', 'سعودي', 'active', NULL, 'false', '2026-05-01 09:39:40.710066-07', '2026-05-01 09:39:40.710066-07', 0, NULL, NULL, NULL, NULL);
INSERT INTO public.tenants (id, user_id, name, type, national_id, phone, email, tax_number, address, postal_code, additional_number, building_number, nationality, status, notes, is_demo, created_at, updated_at, token_version, last_login_at, fcm_token, fcm_platform, deleted_at) VALUES (1, 1, 'عبدالسلام (تجريبي)', 'individual', NULL, '+966502907100', NULL, NULL, NULL, NULL, NULL, NULL, 'سعودي', 'active', NULL, 'false', '2026-05-01 09:24:52.302893-07', '2026-05-01 10:39:26.15-07', 0, '2026-05-01 10:39:26.149-07', NULL, NULL, NULL);


--
-- Name: campaigns_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.campaigns_id_seq', 1, false);


--
-- Name: contact_submissions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.contact_submissions_id_seq', 2, true);


--
-- Name: contracts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.contracts_id_seq', 7, true);


--
-- Name: facilities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.facilities_id_seq', 1, false);


--
-- Name: login_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.login_logs_id_seq', 26, true);


--
-- Name: maintenance_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.maintenance_requests_id_seq', 1, true);


--
-- Name: owners_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.owners_id_seq', 1, false);


--
-- Name: payments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.payments_id_seq', 24, true);


--
-- Name: properties_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.properties_id_seq', 5, true);


--
-- Name: support_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.support_messages_id_seq', 1, false);


--
-- Name: support_tickets_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.support_tickets_id_seq', 1, false);


--
-- Name: tenants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.tenants_id_seq', 2, true);


--
-- Name: units_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.units_id_seq', 15, true);


--
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_id_seq', 4, true);


--
-- PostgreSQL database dump complete
--


