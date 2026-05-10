/**
 * Simple connectivity check — verifies the configured DATABASE_URL is reachable.
 * Run with: pnpm db:ping
 */
import { db } from "./index";
import { sql } from "drizzle-orm";

async function main() {
  console.log("→ Pinging Postgres at:", maskUrl(process.env.DATABASE_URL || ""));
  try {
    const start = Date.now();
    const res: any = await db.execute(sql`SELECT version() AS version, current_database() AS db, current_user AS user, now() AS now`);
    const ms = Date.now() - start;
    const row = (res?.rows ?? res)[0];
    console.log("✓ Connected in", ms, "ms");
    console.log("  user :", row.user);
    console.log("  db   :", row.db);
    console.log("  ver  :", String(row.version).split(",")[0]);
    console.log("  now  :", row.now);
    process.exit(0);
  } catch (e: any) {
    console.error("✗ Connection failed:", e.message || e);
    if (e.code) console.error("  code:", e.code);
    process.exit(1);
  }
}

function maskUrl(u: string): string {
  try {
    const url = new URL(u);
    return `${url.protocol}//${url.username ? "***" : ""}${url.username && url.password ? ":***" : ""}@${url.hostname}:${url.port || "5432"}${url.pathname}${url.search}`;
  } catch {
    return "<invalid>";
  }
}

main();
