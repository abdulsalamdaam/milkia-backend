import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

let _pool: pg.Pool | null = null;
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * Build a connection config that works for both local Postgres (no SSL) and
 * managed clouds like DigitalOcean (which require SSL with their CA-signed
 * certificate). When the URL carries `sslmode=require`/`verify-ca`, we enable
 * SSL but allow the self-signed CA chain — `rejectUnauthorized: false` is the
 * standard pattern for DO/Heroku managed Postgres.
 */
function buildPool(): pg.Pool {
  const url = process.env.DATABASE_URL!;
  const lower = url.toLowerCase();
  const wantsSsl = lower.includes("sslmode=require")
    || lower.includes("sslmode=verify-ca")
    || lower.includes("sslmode=verify-full");

  // Strip sslmode from the URL before handing it to pg. Newer
  // pg-connection-string treats `sslmode=require` as `verify-full`,
  // which fails on DO/Heroku managed Postgres because their certs are
  // signed by an internal CA. We want to keep SSL on but skip strict
  // CA verification — easiest way is to remove sslmode from the URL
  // and set ssl: { rejectUnauthorized: false } ourselves.
  const sanitizedUrl = url.replace(/[?&]sslmode=[^&]*/i, (m) =>
    m.startsWith("?") ? "?" : "",
  ).replace(/\?&/, "?").replace(/\?$/, "");

  const safe = sanitizedUrl.replace(/:[^@]*@/, ":***@");
  console.log(`[db] Connecting pool to ${safe} (ssl=${wantsSsl})`);

  const pool = new Pool({
    connectionString: sanitizedUrl,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  });

  pool.on("error", (err) => {
    console.error("[db] Pool error:", err);
  });

  return pool;
}

export function getPool(): pg.Pool {
  if (_pool) return _pool;
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env and fill it in.");
  }
  _pool = buildPool();
  return _pool;
}

export function getDb() {
  if (_db) return _db;
  _db = drizzle(getPool(), { schema });
  return _db;
}

export const pool = new Proxy({} as pg.Pool, {
  get: (_t, p) => Reflect.get(getPool(), p),
}) as unknown as pg.Pool;

export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get: (_t, p) => Reflect.get(getDb() as object, p),
}) as ReturnType<typeof drizzle<typeof schema>>;

export * from "./schema";
export { schema };
