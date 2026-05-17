import { pgTable, serial, integer, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { contractsTable } from "./contracts";
import { unitsTable } from "./units";

/**
 * contract_units — join table letting a single contract span many units.
 *
 * Replaces the old single `contracts.unit_id` FK (dropped in migration
 * 0015). Rent stays on the contract as one combined figure covering all
 * its units, so this table carries only the link itself.
 */
export const contractUnitsTable = pgTable("contract_units", {
  id: serial("id").primaryKey(),
  contractId: integer("contract_id").notNull().references(() => contractsTable.id, { onDelete: "cascade" }),
  unitId: integer("unit_id").notNull().references(() => unitsTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  contractUnitUniq: uniqueIndex("contract_units_contract_unit_uniq").on(t.contractId, t.unitId),
  contractIdx: index("contract_units_contract_idx").on(t.contractId),
  unitIdx: index("contract_units_unit_idx").on(t.unitId),
}));

export type ContractUnit = typeof contractUnitsTable.$inferSelect;
