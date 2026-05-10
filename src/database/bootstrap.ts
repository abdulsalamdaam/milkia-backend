import { Logger } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pool } from "@milkia/database";

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
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

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
