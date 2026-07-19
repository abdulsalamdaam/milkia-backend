import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { ejarApiLogsTable } from "@oqudk/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import type { EjarLogRecordInput } from "./ejar.types";

const MAX_BODY_CHARS = 60_000;

/** Truncate a response body so a multi-MB payload doesn't bloat the log. */
export function truncateBody(body: unknown): { value: unknown; truncated: boolean } {
  try {
    const json = JSON.stringify(body);
    if (json && json.length > MAX_BODY_CHARS) {
      return { value: json.slice(0, MAX_BODY_CHARS) + `…[truncated ${json.length - MAX_BODY_CHARS} chars]`, truncated: true };
    }
  } catch {
    /* non-serialisable */
  }
  return { value: body, truncated: false };
}

export interface EjarLogFilter {
  endpoint?: string;
  status?: "ok" | "error" | number;
  userId?: number | null;
  limit?: number;
}

@Injectable()
export class EjarLogService {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  /** Persist one call; returns the stored row (with id + createdAt). */
  async insert(rec: EjarLogRecordInput) {
    const [row] = await this.db
      .insert(ejarApiLogsTable)
      .values({
        userId: rec.userId,
        env: rec.env,
        endpoint: rec.endpoint,
        method: rec.method,
        url: rec.url,
        params: rec.params,
        requestHeaders: rec.requestHeaders,
        status: rec.status,
        ejarStatus: rec.ejarStatus,
        transactionId: rec.transactionId,
        durationMs: rec.durationMs,
        attempts: rec.attempts,
        responseBody: rec.responseBody as never,
        bodyTruncated: rec.bodyTruncated,
        error: rec.error,
      })
      .returning();
    return this.shape(row);
  }

  async list(filter: EjarLogFilter = {}) {
    const conds = [];
    if (filter.endpoint) conds.push(eq(ejarApiLogsTable.endpoint, filter.endpoint));
    if (filter.userId != null) conds.push(eq(ejarApiLogsTable.userId, filter.userId));
    if (filter.status === "ok") conds.push(and(gte(ejarApiLogsTable.status, 200), lt(ejarApiLogsTable.status, 300)));
    else if (filter.status === "error") conds.push(sql`(${ejarApiLogsTable.status} IS NULL OR ${ejarApiLogsTable.status} >= 400)`);
    else if (typeof filter.status === "number") conds.push(eq(ejarApiLogsTable.status, filter.status));

    const rows = await this.db
      .select()
      .from(ejarApiLogsTable)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(desc(ejarApiLogsTable.id))
      .limit(Math.min(filter.limit ?? 300, 1000));
    return rows.map((r) => this.shape(r));
  }

  async get(id: number) {
    const [row] = await this.db.select().from(ejarApiLogsTable).where(eq(ejarApiLogsTable.id, id)).limit(1);
    return row ? this.shape(row) : null;
  }

  /** Present a row to the client with a stable `ts` alias for `createdAt`. */
  private shape(row: typeof ejarApiLogsTable.$inferSelect) {
    return { ...row, ts: row.createdAt?.toISOString?.() ?? String(row.createdAt) };
  }
}
