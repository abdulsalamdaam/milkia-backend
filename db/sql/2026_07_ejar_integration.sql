-- Ejar (NHC / Takamolat) integration.
--   1. mark contracts imported from Ejar (nullable — manual contracts stay NULL)
--   2. persist every Ejar API request/response for the admin/debug view
-- Additive + idempotent: runs on every boot via PASSIVE_MIGRATIONS.

ALTER TABLE "contracts" ADD COLUMN IF NOT EXISTS "ejar_source" text;

CREATE TABLE IF NOT EXISTS "ejar_api_logs" (
  "id"              serial PRIMARY KEY,
  "user_id"         integer,
  "env"             text        NOT NULL DEFAULT 'uat',
  "endpoint"        text        NOT NULL,
  "method"          text        NOT NULL,
  "url"             text        NOT NULL,
  "params"          jsonb,
  "request_headers" jsonb,
  "status"          integer,
  "ejar_status"     integer,
  "transaction_id"  text,
  "duration_ms"     integer     NOT NULL DEFAULT 0,
  "attempts"        integer     NOT NULL DEFAULT 1,
  "response_body"   jsonb,
  "body_truncated"  boolean     NOT NULL DEFAULT false,
  "error"           text,
  "created_at"      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "ejar_api_logs_created_idx"  ON "ejar_api_logs" ("created_at");
CREATE INDEX IF NOT EXISTS "ejar_api_logs_endpoint_idx" ON "ejar_api_logs" ("endpoint");
CREATE INDEX IF NOT EXISTS "ejar_api_logs_user_idx"     ON "ejar_api_logs" ("user_id");
