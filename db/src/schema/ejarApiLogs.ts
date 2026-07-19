import { pgTable, serial, integer, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

/**
 * Request/response log for the Ejar (NHC) integration. One row per Ejar API
 * call (including retries collapsed into `attempts`). The client secret is
 * redacted in `requestHeaders` at write time; `responseBody` is truncated
 * past ~60k chars. Powers the admin/debug view and one-click re-run.
 *
 * Created by the passive migration db/sql/2026_07_ejar_integration.sql.
 */
export const ejarApiLogsTable = pgTable("ejar_api_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  env: text("env").notNull().default("uat"),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull(),
  url: text("url").notNull(),
  params: jsonb("params").$type<Record<string, string>>(),
  requestHeaders: jsonb("request_headers").$type<Record<string, string>>(),
  status: integer("status"),
  ejarStatus: integer("ejar_status"),
  transactionId: text("transaction_id"),
  durationMs: integer("duration_ms").notNull().default(0),
  attempts: integer("attempts").notNull().default(1),
  responseBody: jsonb("response_body"),
  bodyTruncated: boolean("body_truncated").notNull().default(false),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
