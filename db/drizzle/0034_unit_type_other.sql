-- Free-text "Other" unit type stored on the row, not in the shared lookups
-- table (so a custom type never leaks into other users' dropdowns).
ALTER TABLE "units" ADD COLUMN IF NOT EXISTS "type_other" text;
