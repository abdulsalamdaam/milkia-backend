import { Logger } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pool } from "@oqudk/database";

const log = new Logger("DBBootstrap");

/**
 * Run-on-boot schema + data initializer. Two-phase, both idempotent:
 *
 *   1. ensureSchema() — if the `users` table is missing, run db/init.sql
 *      to create all tables, enums, FKs, indexes.
 *   2. ensureData()   — if users-table is empty AND db/data.sql exists,
 *      load it (one-shot data seed for fresh deploys).
 *
 * Both run inside a transaction; failures rollback.
 *
 * Designed for fresh-cluster deploys (Coolify/Docker). For schema changes
 * after initial creation, regenerate `db/init.sql` and apply manually —
 * this does NOT run a real schema diff/migration.
 */
function findSqlFile(name: string): string | null {
  const candidates = [
    // Compiled image: dist/src/database/bootstrap.js → ../../../db/<name>
    join(__dirname, "..", "..", "..", "db", name),
    // Dev runtime: src/database/bootstrap.ts → ../../db/<name>
    join(__dirname, "..", "..", "db", name),
    // Subdirectory variant for ad-hoc migrations under db/sql/<name>.
    join(__dirname, "..", "..", "..", "db", "sql", name),
    join(__dirname, "..", "..", "db", "sql", name),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Idempotent migrations that should run on every boot. New additive changes
 * (CREATE TABLE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, INSERT ... ON CONFLICT
 * DO NOTHING) go here. Destructive migrations (DROP COLUMN, etc.) should be
 * handled out of band.
 */
const PASSIVE_MIGRATIONS = [
  "2026_05_companies_roles_email_otp.sql",
  "2026_05_drop_legacy_user_columns.sql",
];

async function runSqlFile(client: any, label: string, file: string) {
  const sql = readFileSync(file, "utf8");
  log.log(`Running ${label}: ${file} (${sql.length} chars)`);
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("COMMIT");
    log.log(`${label} applied ✓`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    // Phase 1: schema
    const schemaCheck = await client.query<{ exists: boolean }>(
      `select exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'users'
       ) as exists`,
    );
    if (schemaCheck.rows[0]?.exists) {
      log.log("Schema already initialized — skipping init.sql");
    } else {
      const initFile = findSqlFile("init.sql");
      if (!initFile) {
        log.warn("init.sql not found — schema NOT created. API will fail on first query.");
        return;
      }
      await runSqlFile(client, "init.sql", initFile);
    }

    // Phase 1.5: passive migrations — additive, idempotent, run every boot.
    for (const file of PASSIVE_MIGRATIONS) {
      const path = findSqlFile(file);
      if (!path) {
        log.warn(`migration ${file} not found — skipped`);
        continue;
      }
      try {
        await runSqlFile(client, `migration ${file}`, path);
      } catch (err: any) {
        log.error(`migration ${file} failed: ${err?.message || err}`);
        throw err;
      }
    }

    // Phase 1.6: refresh system role permissions on every boot. Keeps the
    // roles table in sync with code-side ROLE_PRESETS + EMPLOYEE_PRESETS
    // without requiring a hand-written migration each time we add a
    // permission. Upserts (insert if missing, update if present) so a new
    // preset added in code shows up in the DB on next boot.
    try {
      const { ROLE_PRESETS, ALL_PERMISSIONS, EMPLOYEE_PRESETS } = await import("../common/permissions");
      const presets: Array<{ key: string; perms: readonly string[]; labelAr: string; labelEn: string }> = [
        { key: "super_admin", perms: ALL_PERMISSIONS, labelAr: "مدير النظام", labelEn: "Super Admin" },
        { key: "admin",       perms: ROLE_PRESETS.admin, labelAr: "مشرف",         labelEn: "Admin" },
        { key: "user",        perms: ROLE_PRESETS.user,  labelAr: "مالك / مدير",  labelEn: "Owner / Manager" },
        { key: "demo",        perms: ROLE_PRESETS.demo,  labelAr: "تجريبي",       labelEn: "Demo" },
      ];
      // Employee presets become first-class system roles: each one is a
      // distinct row keyed by its preset id (e.g. "accountant"). Linking
      // an employee to it via users.role_id is now the only way to grant
      // them a custom permission set.
      for (const [key, def] of Object.entries(EMPLOYEE_PRESETS)) {
        presets.push({ key, perms: def.permissions, labelAr: def.labelAr, labelEn: def.labelEn });
      }
      for (const r of presets) {
        await client.query(
          `insert into roles (key, label_ar, label_en, permissions, is_system, company_id)
                 values ($1, $3, $4, $2::jsonb, true, null)
           on conflict (key) where company_id is null do update set
             permissions = excluded.permissions,
             label_ar    = excluded.label_ar,
             label_en    = excluded.label_en,
             is_system   = true,
             updated_at  = now()`,
          [r.key, JSON.stringify(r.perms), r.labelAr, r.labelEn],
        );
      }
      log.log("System role presets refreshed ✓");
    } catch (err: any) {
      log.warn(`role refresh skipped: ${err?.message || err}`);
    }

    // Phase 2: seed data (only if users-table is empty and data.sql exists)
    const userCount = await client.query<{ count: string }>(
      `select count(*)::text as count from public.users`,
    );
    if (parseInt(userCount.rows[0]?.count ?? "0", 10) > 0) {
      log.log("Users table not empty — skipping data.sql");
      return;
    }
    const dataFile = findSqlFile("data.sql");
    if (!dataFile) {
      log.log("No data.sql to seed — DB is empty (this is fine for a green-field deploy).");
      return;
    }
    await runSqlFile(client, "data.sql", dataFile);
  } finally {
    client.release();
  }
}
