-- Phase 3 prep: a parent reference on lookups so cities cascade from
-- their region. Additive + idempotent.
ALTER TABLE "lookups" ADD COLUMN IF NOT EXISTS "parent_key" text;
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'riyadh' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('riyadh', 'al_kharj', 'al_majmaah', 'ad_dawadimi', 'az_zulfi', 'al_quwayiyah', 'wadi_al_dawasir', 'al_aflaj', 'shaqra', 'dharma', 'al_hariq', 'marat');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'makkah' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('jeddah', 'makkah', 'ta_if', 'rabigh', 'al_qunfudhah', 'al_layth', 'khulayyis', 'al_jumum', 'bahra');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'eastern' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('dammam', 'al_khobar', 'al_ahsa', 'al_jubail', 'al_qatif', 'hafar_al_batin', 'dhahran', 'al_khafji', 'buqayq', 'ras_tanura', 'an_nuayriyah');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'madinah' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('madinah', 'yanbu', 'alula', 'al_wajh', 'badr', 'al_mahd', 'khaybar');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'asir' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('abha', 'khamis_mushait', 'bisha', 'an_namas', 'muhayil_asir', 'sarat_abidah', 'rijal_alma', 'al_majardah');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'tabuk' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('tabuk', 'duba', 'haql', 'umluj', 'tayma', 'al_bad');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'qassim' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('buraydah', 'unayzah', 'ar_rass', 'al_bukayriyah', 'al_mudhnib', 'ash_shmasiyah', 'uyun_al_jawaa');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'hail' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('ha_il', 'baqa', 'al_ghazalah', 'ash_shannan', 'al_hayt');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'jazan' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('jizan', 'sabya', 'abu_arish', 'ad_darb', 'samtah', 'baysh', 'damad', 'ar_rayth', 'farasan');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'najran' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('najran', 'sharorah', 'habuna', 'badr_al_janoub', 'yadamah');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'bahah' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('al_bahah', 'baljurashi', 'al_mandiq', 'al_aqiq', 'qilwah', 'al_mikhwah');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'northern_borders' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('arar', 'rafha', 'turaif', 'al_uwayqilah');
--> statement-breakpoint
UPDATE "lookups" SET "parent_key" = 'jawf' WHERE "category" = 'city' AND "company_id" IS NULL AND "key" IN ('sakaka', 'al_qurayyat', 'dawmat_al_jandal');
--> statement-breakpoint
-- Clean up: migration 0020 also matched the nationality list, seeding
-- ~25 non-city rows under category=city. Real cities now have a
-- parent_key; the stray rows do not — remove them.
DELETE FROM "lookups" WHERE "category" = 'city' AND "company_id" IS NULL AND "parent_key" IS NULL;
