import { sql } from "drizzle-orm";

/**
 * Next per-account receipt-voucher (سند قبض) number: RV-000001, RV-000002, …
 *
 * Computed as MAX(sequence)+1 across BOTH the invoices table (receipt vouchers
 * stamped on a doc) AND the payment_collections table (RVs stamped on a
 * collection, e.g. the advance-rent voucher). Counting both prevents an RV that
 * lives only on a collection from colliding with an RV later stamped on a doc,
 * and stays unique even after a row is deleted. Pass a transaction handle to
 * generate inside a locked transaction.
 */
export async function nextReceiptVoucherNumber(db: any, userId: number): Promise<string> {
  const res: any = await db.execute(sql`
    select coalesce(max(seq), 0) as m from (
      select cast(substring(receipt_number from '[0-9]+$') as integer) as seq
        from simple_invoices where user_id = ${userId} and receipt_number like 'RV-%'
      union all
      select cast(substring(receipt_number from '[0-9]+$') as integer) as seq
        from payment_collections where user_id = ${userId} and receipt_number like 'RV-%'
    ) t
  `);
  const rows = Array.isArray(res) ? res : (res?.rows ?? []);
  const max = Number(rows?.[0]?.m ?? 0);
  return `RV-${String(max + 1).padStart(6, "0")}`;
}
