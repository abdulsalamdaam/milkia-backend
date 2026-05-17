# Plan — categorical columns → foreign keys into `lookups`

Goal: every categorical/"type" field is backed by the central `lookups`
table and referenced by a real foreign key, so the option lists are
consistent and extensible across backend + web + mobile.

Status: **Phase 1 done** (city options seeded — migration `0020`). Phases 2+
below change column types on the production DB and break API response
shapes, so they are staged like the UUID migration.

## Important: "enum" vs this

A Postgres `enum` is a fixed, compile-time set — it cannot hold company-added
or "Other" values. The requirement "users can add their own types" and "enum"
are mutually exclusive. The correct structured-**and**-extensible model is a
foreign key into `lookups` (validation from the FK, extensibility from new
lookup rows). So these columns become `*_lookup_id integer REFERENCES lookups(id)`
— **not** enums. Genuinely fixed sets (contract status, payment frequency,
deed type, unit status, account status) intentionally stay as pgEnums.

## Columns in scope

| Table | Column (today) | Lookup category |
|-------|----------------|-----------------|
| properties | `type` (text) | `property_type` |
| properties | `usage_type` (text) | `property_usage` |
| properties | `building_type` (text) | `building_type` *(new)* |
| properties | `city` (text) | `city` ✅ seeded |
| properties | `region` (text) | `region` *(new)* |
| units | `type` (text) | `unit_type` |
| units | `unit_direction` (text) | `unit_direction` |
| units | `finishing` (text) | `unit_finishing` |
| units | `ac_type`, `parking_type`, `furnishing`, `kitchen_type` (text) | new categories |
| owners | `nationality` (text) | `nationality` *(new)* |
| contracts | `additional_fees[].type` (jsonb) | `fee_type` (already) |

## Per-column migration recipe (one transaction each)

1. `ALTER TABLE t ADD COLUMN x_lookup_id integer REFERENCES lookups(id)`.
2. Backfill: `UPDATE t SET x_lookup_id = l.id FROM lookups l
   WHERE l.category = '<cat>' AND l.key = t.x AND l.company_id IS NULL`.
3. Rows whose text value matches no lookup key → create the lookup row first
   (or leave NULL and report).
4. Keep the old text column for one release (dual-write) → drop it once API +
   web + mobile read the id.

## Application changes (per column)

- **API**: create/update accept `xLookupId` (or a key, resolved server-side);
  list/detail return `xLookupId` **and** a joined `xLabel` for display.
- **Web**: `LookupSelect`/`LookupTypeSelect` store the lookup **id** instead of
  the key; existing values backfilled.
- **Mobile**: same — read `xLabel` for display, send `xLookupId`.

## Phases

- **Phase 1 — done.** `city` options seeded into `lookups` (migration `0020`).
- **Phase 2.** Seed the missing categories (`region`, `building_type`,
  `nationality`, ac/parking/kitchen/furnishing) — additive, safe.
- **Phase 3.** Per table, add `*_lookup_id` columns + backfill (additive).
- **Phase 4.** API dual-reads (id preferred, text fallback); ship.
- **Phase 5.** Web + mobile switch to ids; ship together.
- **Phase 6.** Drop the legacy text columns.

Phases 2–3 are safe/additive. Phases 4–6 change contracts and must ship
API → web/mobile in order, with the text column kept until step 6.
