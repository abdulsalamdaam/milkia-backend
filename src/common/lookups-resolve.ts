/**
 * Resolve a stored text value (a lookup key OR an Arabic label) to its
 * lookup row id, so create/update endpoints can keep the `*_lookup_id`
 * foreign keys authoritative regardless of what the client sends.
 */
import { and, eq, isNull, or } from "drizzle-orm";
import { lookupsTable } from "@oqudk/database";
import type { Drizzle } from "../database/database.module";

export async function resolveLookupId(
  db: Drizzle,
  category: string,
  value: unknown,
): Promise<number | null> {
  if (value == null || value === "") return null;
  const v = String(value);
  const [row] = await db
    .select({ id: lookupsTable.id })
    .from(lookupsTable)
    .where(and(
      eq(lookupsTable.category, category),
      isNull(lookupsTable.companyId),
      or(eq(lookupsTable.key, v), eq(lookupsTable.labelAr, v)),
    ))
    .limit(1);
  return row?.id ?? null;
}
