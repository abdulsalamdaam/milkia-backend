-- Short / display name for owners (landlords) and tenants.
ALTER TABLE "owners"  ADD COLUMN IF NOT EXISTS "short_name" text;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "short_name" text;
