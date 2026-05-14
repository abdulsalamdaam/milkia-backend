import { defineConfig } from "drizzle-kit";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env and fill it in.");
}

const url = process.env.DATABASE_URL;
const wantsSsl = /sslmode=(require|verify-ca|verify-full)/i.test(url);

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  // drizzle-kit 0.31 mis-resolves absolute `out` paths (prepends "./"),
  // so we keep this relative to the cwd. Run drizzle-kit from /db.
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: wantsSsl ? { rejectUnauthorized: false } : undefined,
  },
});
