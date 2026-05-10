import { Logger } from "@nestjs/common";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pool } from "@milkia/database";

const log = new Logger("DBBootstrap");

/**
 * Run-on-boot schema initializer. Idempotent: if the `users` table already
 * exists we skip. Otherwise we execute db/init.sql to create everything
 * (tables, enums, FKs, indexes) in a single transaction.
 *
 * Designed for fresh-cluster deploys (Coolify/Docker). For schema changes
 * after initial creation, regenerate `db/init.sql` from the latest schema
 * and apply manually — this script does NOT run any kind of diff/migration.
 */
export async function ensureSchema(): Promise<void> {
  const client = await pool.connect();
  try {
    const { rows } = await client.query<{ exists: boolean }>(
      `select exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'users'
       ) as exists`,
    );
    if (rows[0]?.exists) {
      log.log("Schema already initialized — skipping init.sql");
      return;
    }

    const candidates = [
      // Compiled image: dist/src/database/bootstrap.js → ../../../db/init.sql
      join(__dirname, "..", "..", "..", "db", "init.sql"),
      // Dev runtime: src/database/bootstrap.ts → ../../db/init.sql
      join(__dirname, "..", "..", "db", "init.sql"),
    ];
    const sqlPath = candidates.find((p) => existsSync(p));
    if (!sqlPath) {
      log.warn(
        `init.sql not found (looked in ${candidates.join(", ")}). Skipping. ` +
          `If this is a fresh DB, every query will fail until the schema is created.`,
      );
      return;
    }

    const sql = readFileSync(sqlPath, "utf8");
    log.log(`No schema yet — running ${sqlPath} (${sql.length} chars)`);

    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("COMMIT");
      log.log("Schema created ✓");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    }
  } finally {
    client.release();
  }
}
