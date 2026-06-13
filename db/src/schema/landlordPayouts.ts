import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";

/**
 * A transfer (payout) of the net due from the managing account to a landlord.
 * Drives the "landlord transfers" report (transferred vs not) and reduces the
 * outstanding dues in the "landlord dues" report.
 */
export const landlordPayoutsTable = pgTable("landlord_payouts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  ownerId: integer("owner_id").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  transferDate: text("transfer_date"),
  // bank_transfer | cash | cheque | other
  method: text("method"),
  reference: text("reference"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LandlordPayout = typeof landlordPayoutsTable.$inferSelect;
