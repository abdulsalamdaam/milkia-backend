import { pgTable, serial, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { contractsTable } from "./contracts";

/**
 * Per-year rental rates. Each row overrides the rent for one contract
 * year (`year` is 1-based: 1, 2, 3, …). Contract years with no row fall
 * back to the contract's base `monthlyRent` (with escalation applied).
 */
export const contractRentTermsTable = pgTable("contract_rent_terms", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "cascade" }),
  year: integer("year").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byContract: index("contract_rent_terms_contract_idx").on(t.contractId),
}));

export const insertContractRentTermSchema = createInsertSchema(contractRentTermsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertContractRentTerm = z.infer<typeof insertContractRentTermSchema>;
export type ContractRentTerm = typeof contractRentTermsTable.$inferSelect;
