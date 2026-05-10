import { Controller, Get, Inject, Module, UseGuards } from "@nestjs/common";
import { eq, count } from "drizzle-orm";
import { propertiesTable, unitsTable, contractsTable, paymentsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";

@Controller("dashboard")
@UseGuards(JwtAuthGuard)
class DashboardController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get("summary")
  async summary(@CurrentUser() user: AuthUser) {
    const userId = user.id;
    const [propCount] = await this.db.select({ count: count() }).from(propertiesTable).where(eq(propertiesTable.userId, userId));
    const userProps = await this.db.select({ id: propertiesTable.id }).from(propertiesTable).where(eq(propertiesTable.userId, userId));
    const propIds = userProps.map(p => p.id);

    let unitCount = 0;
    let activeContractsCount = 0;
    let monthlyRevenue = 0;     // money actually COLLECTED this month
    let collectedTotal = 0;     // money collected lifetime
    let monthlyRecurring = 0;   // active rent commitment / month
    let pendingDue = 0;         // unpaid (pending + overdue) outstanding amount
    let overduePaymentsCount = 0;
    let rentedUnitsCount = 0;
    let availableUnitsCount = 0;
    let maintenanceUnitsCount = 0;

    if (propIds.length > 0) {
      for (const propId of propIds) {
        const propUnits = await this.db.select().from(unitsTable).where(eq(unitsTable.propertyId, propId));
        unitCount += propUnits.length;
        rentedUnitsCount += propUnits.filter(u => u.status === "rented").length;
        availableUnitsCount += propUnits.filter(u => u.status === "available").length;
        maintenanceUnitsCount += propUnits.filter(u => u.status === "maintenance").length;
      }

      const contracts = await this.db.select().from(contractsTable).where(eq(contractsTable.userId, userId));
      activeContractsCount = contracts.filter(c => c.status === "active").length;
      monthlyRecurring = contracts
        .filter(c => c.status === "active")
        .reduce((s, c) => s + parseFloat(c.monthlyRent), 0);

      const payments = await this.db.select().from(paymentsTable).where(eq(paymentsTable.userId, userId));
      overduePaymentsCount = payments.filter(p => p.status === "overdue").length;

      const now = new Date();
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const num = (s: string | null) => parseFloat(s || "0") || 0;

      collectedTotal = payments
        .filter(p => p.status === "paid")
        .reduce((s, p) => s + num(p.amount), 0);

      monthlyRevenue = payments
        .filter(p => p.status === "paid" && p.paidDate && p.paidDate.startsWith(currentKey))
        .reduce((s, p) => s + num(p.amount), 0);

      pendingDue = payments
        .filter(p => p.status === "pending" || p.status === "overdue")
        .reduce((s, p) => s + num(p.amount), 0);
    }

    const occupancyRate = unitCount > 0 ? Math.round((rentedUnitsCount / unitCount) * 100) : 0;

    return {
      propertiesCount: propCount?.count ?? 0,
      unitsCount: unitCount,
      activeContractsCount,
      // monthlyRevenue is now actual collected this month (was: contract rent commitment).
      monthlyRevenue,
      monthlyRecurring,
      collectedTotal,
      pendingDue,
      overduePaymentsCount,
      occupancyRate,
      rentedUnitsCount,
      availableUnitsCount,
      maintenanceUnitsCount,
    };
  }
}

@Module({ controllers: [DashboardController] })
export class DashboardModule {}
