-- Unit facility-count breakdown.
-- Adds units.amenities_data (JSON string) so the unit add/edit forms can
-- persist every selected facility — including each AC type and rooms that have
-- no dedicated column (maid's room, kitchen, storage, backyard, elevator) —
-- instead of collapsing them into the single ac_units total. Mirrors the
-- existing properties.amenities_data column. Additive + idempotent.
ALTER TABLE units ADD COLUMN IF NOT EXISTS amenities_data text;
