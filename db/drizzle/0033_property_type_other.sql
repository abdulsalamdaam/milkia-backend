-- Free-text "Other" property type stored on the row, not in the shared
-- lookups table (so a custom type never leaks into other users' dropdowns).
ALTER TABLE "properties" ADD COLUMN IF NOT EXISTS "type_other" text;
