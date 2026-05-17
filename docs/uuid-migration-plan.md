# Plan — migrate primary keys from `serial` (int) to UUID

Status: **planned, not started.** This is a high-risk, breaking migration of
a live production database. It must be executed as its own project with a
staging dry-run and a downtime window — never incrementally on prod.

## Why this is not a quick change

Every table uses `serial` integer PKs, and every foreign key references them.
Switching to UUID means re-keying **every table and every FK at once**, then
shipping API + web + mobile in lockstep (all of them currently send/receive
numeric ids). A partial rollout breaks referential integrity.

## Is it even needed?

Integer PKs are production-grade. The security argument for UUIDs (non-guessable
ids) only matters **without** authorization — and this API already scopes every
query by ownership (`scopeId(user)`), so guessing an id returns `403/404`, not
another tenant's data. If the only goal is non-enumerable ids in URLs, a cheaper
and safer option is a **separate random public token column** (e.g.
`public_id text` with a 22-char nanoid) kept alongside the int PK — no re-keying.

Recommendation: keep integer PKs unless there is a concrete external requirement.
If UUIDs are still wanted, proceed with the phased plan below.

## Phased plan (if proceeding)

**Phase 0 — prep**
- Full `pg_dump` backup. Provision a staging DB restored from the prod dump.
- Add `pgcrypto` (`gen_random_uuid()`) — already available on PG 13+.

**Phase 1 — additive (no downtime)**
- For every table: add `uuid_id uuid NOT NULL DEFAULT gen_random_uuid()` and a
  unique index.
- For every FK column `x_id int`: add `x_uuid uuid`, backfill via a join to the
  parent's `uuid_id`.

**Phase 2 — swap (downtime window)**
- Stop writes (maintenance mode).
- For each table: drop FK constraints → drop old int PK / FK columns → rename
  `uuid_id`→`id`, `x_uuid`→`x_id` → re-add PK + FK constraints.
- Run on staging first; capture exact timing.

**Phase 3 — application**
- API: Drizzle schema `serial` → `uuid("id").defaultRandom()`; every
  `integer(...).references()` → `uuid(...)`. `parseInt` of route params →
  treat ids as strings. ~every module touched.
- Web: every `id: number` → `string`; query keys, route params, payloads.
- Mobile: same — `TenantContract.id` etc. become strings.

**Phase 4 — deploy** API + web + mobile together, end the downtime window.

## Rollback
Phase 1 is reversible (drop the added columns). Once Phase 2 runs, rollback =
restore from the Phase 0 dump. There is no in-place rollback after the swap —
hence the staging dry-run is mandatory.

## Estimate
A multi-day effort: ~1 day staging dry-run + timing, ~1–2 days application code
across three repos, plus a scheduled downtime window for the swap.
