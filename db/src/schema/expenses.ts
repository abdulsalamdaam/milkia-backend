import { pgTable, text, serial, timestamp, numeric, integer } from "drizzle-orm/pg-core";

/**
 * Operating expenses recorded against a property/landlord (other than the
 * managing company's commission and maintenance). Feeds the landlord account
 * statement ("other expenses") and is deducted from the net due to the landlord.
 */
export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  // Optional links — an expense can be tied to a property and/or a landlord.
  propertyId: integer("property_id"),
  ownerId: integer("owner_id"),
  category: text("category"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  expenseDate: text("expense_date"),
  notes: text("notes"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type Expense = typeof expensesTable.$inferSelect;
