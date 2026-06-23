import { Controller, Get, Inject, Module, NotFoundException, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull, inArray, desc } from "drizzle-orm";
import {
  usersTable, ownersTable, propertiesTable, unitsTable, contractsTable, contractUnitsTable,
  paymentsTable, paymentCollectionsTable, tenantsTable,
} from "@oqudk/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { scopeId } from "../../common/scope";

/**
 * Landlord mobile API — READ ONLY. Mirrors the tenant-portal shape but for a
 * landlord (a USER account, user-JWT). Every endpoint returns a flat, mobile-
 * friendly aggregate scoped by scopeId(user) (so employees see their owner's
 * data). No writes — landlords only view their portfolio in the app.
 */
@ApiTags("landlord-mobile")
@ApiBearerAuth("user-jwt")
@Controller("landlord/me")
@UseGuards(JwtAuthGuard)
class LandlordMobileController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  private num(s: string | null | undefined) { return parseFloat(s || "0") || 0; }

  /** Logged-in landlord profile + how many landlords/properties they hold. */
  @Get("profile")
  async profile(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    const [u] = await this.db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, createdAt: usersTable.createdAt })
      .from(usersTable).where(eq(usersTable.id, uid));
    const owners = await this.db.select({ id: ownersTable.id }).from(ownersTable)
      .where(and(eq(ownersTable.userId, uid), isNull(ownersTable.deletedAt)));
    return { ...u, landlordsCount: owners.length, isEmployee: user.ownerUserId != null };
  }

  /** KPI summary for the landlord home screen. */
  @Get("summary")
  async summary(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    const props = await this.db.select({ id: propertiesTable.id }).from(propertiesTable)
      .where(and(eq(propertiesTable.userId, uid), isNull(propertiesTable.deletedAt)));
    const propIds = props.map((p) => p.id);

    let unitsCount = 0, rentedUnits = 0, availableUnits = 0, maintenanceUnits = 0;
    if (propIds.length) {
      const units = await this.db.select({ status: unitsTable.status }).from(unitsTable)
        .where(and(inArray(unitsTable.propertyId, propIds), isNull(unitsTable.deletedAt)));
      unitsCount = units.length;
      rentedUnits = units.filter((u) => u.status === "rented").length;
      availableUnits = units.filter((u) => u.status === "available").length;
      maintenanceUnits = units.filter((u) => u.status === "maintenance").length;
    }

    const contracts = await this.db.select({ status: contractsTable.status, monthlyRent: contractsTable.monthlyRent })
      .from(contractsTable).where(and(eq(contractsTable.userId, uid), isNull(contractsTable.deletedAt)));
    const activeContractsCount = contracts.filter((c) => c.status === "active").length;
    const monthlyRecurring = contracts.filter((c) => c.status === "active").reduce((s, c) => s + this.num(c.monthlyRent), 0);

    const payments = await this.db.select({ status: paymentsTable.status, amount: paymentsTable.amount, paidDate: paymentsTable.paidDate })
      .from(paymentsTable).where(and(eq(paymentsTable.userId, uid), isNull(paymentsTable.deletedAt)));
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const collectedTotal = payments.filter((p) => p.status === "paid").reduce((s, p) => s + this.num(p.amount), 0);
    const monthlyRevenue = payments.filter((p) => p.status === "paid" && p.paidDate?.startsWith(monthKey)).reduce((s, p) => s + this.num(p.amount), 0);
    const pendingDue = payments.filter((p) => p.status === "pending" || p.status === "overdue").reduce((s, p) => s + this.num(p.amount), 0);
    const overduePaymentsCount = payments.filter((p) => p.status === "overdue").length;

    const [tenantsRow] = await this.db.select({ id: tenantsTable.id }).from(tenantsTable)
      .where(and(eq(tenantsTable.userId, uid), isNull(tenantsTable.deletedAt)));
    const tenantsCount = (await this.db.select({ id: tenantsTable.id }).from(tenantsTable)
      .where(and(eq(tenantsTable.userId, uid), isNull(tenantsTable.deletedAt)))).length;
    void tenantsRow;

    return {
      propertiesCount: propIds.length, unitsCount, rentedUnits, availableUnits, maintenanceUnits,
      activeContractsCount, tenantsCount,
      monthlyRecurring, collectedTotal, monthlyRevenue, pendingDue, overduePaymentsCount,
      occupancyRate: unitsCount > 0 ? Math.round((rentedUnits / unitsCount) * 100) : 0,
    };
  }

  /** Properties with occupancy. */
  @Get("properties")
  async properties(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    const props = await this.db.select().from(propertiesTable)
      .where(and(eq(propertiesTable.userId, uid), isNull(propertiesTable.deletedAt)))
      .orderBy(desc(propertiesTable.createdAt));
    const propIds = props.map((p) => p.id);
    const units = propIds.length
      ? await this.db.select({ id: unitsTable.id, propertyId: unitsTable.propertyId, status: unitsTable.status })
          .from(unitsTable).where(and(inArray(unitsTable.propertyId, propIds), isNull(unitsTable.deletedAt)))
      : [];
    return props.map((p) => {
      const us = units.filter((u) => u.propertyId === p.id);
      const rented = us.filter((u) => u.status === "rented").length;
      return {
        id: p.id, name: p.name, status: (p as any).status ?? null,
        unitsCount: us.length, rentedUnits: rented,
        occupancyRate: us.length ? Math.round((rented / us.length) * 100) : 0,
      };
    });
  }

  /** Units across the portfolio (with the current tenant, if any). */
  @Get("units")
  async units(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    const rows = await this.db
      .select({ id: unitsTable.id, unitNumber: unitsTable.unitNumber, status: unitsTable.status, propertyName: propertiesTable.name })
      .from(unitsTable)
      .innerJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
      .where(and(eq(propertiesTable.userId, uid), isNull(unitsTable.deletedAt), isNull(propertiesTable.deletedAt)))
      .orderBy(desc(unitsTable.createdAt));
    return rows;
  }

  /** Active + past contracts, each with its property + units + tenant. */
  @Get("contracts")
  async contracts(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    const contracts = await this.db.select().from(contractsTable)
      .where(and(eq(contractsTable.userId, uid), isNull(contractsTable.deletedAt)))
      .orderBy(desc(contractsTable.createdAt));
    const ids = contracts.map((c) => c.id);
    const cu = ids.length
      ? await this.db.select({ contractId: contractUnitsTable.contractId, unitNumber: unitsTable.unitNumber, propertyName: propertiesTable.name })
          .from(contractUnitsTable)
          .innerJoin(unitsTable, eq(unitsTable.id, contractUnitsTable.unitId))
          .innerJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
          .where(inArray(contractUnitsTable.contractId, ids))
      : [];
    const byContract = new Map<number, { property: string | null; units: string[] }>();
    for (const r of cu) {
      const e = byContract.get(r.contractId) ?? { property: r.propertyName, units: [] };
      if (r.unitNumber) e.units.push(r.unitNumber);
      e.property = e.property ?? r.propertyName;
      byContract.set(r.contractId, e);
    }
    return contracts.map((c) => ({
      id: c.id, contractNumber: c.contractNumber, status: c.status,
      tenantName: c.tenantName, tenantPhone: c.tenantPhone,
      monthlyRent: this.num(c.monthlyRent), paymentFrequency: c.paymentFrequency,
      startDate: c.startDate, endDate: c.endDate,
      depositAmount: c.depositAmount ? this.num(c.depositAmount) : 0,
      property: byContract.get(c.id)?.property ?? null,
      units: byContract.get(c.id)?.units ?? [],
      landlordName: c.landlordName ?? null,
    }));
  }

  /** Tenants in the portfolio. */
  @Get("tenants")
  async tenants(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    return this.db.select({ id: tenantsTable.id, name: tenantsTable.name, phone: tenantsTable.phone, email: tenantsTable.email, type: tenantsTable.type, status: tenantsTable.status })
      .from(tenantsTable).where(and(eq(tenantsTable.userId, uid), isNull(tenantsTable.deletedAt)))
      .orderBy(desc(tenantsTable.createdAt));
  }

  /** The landlords (owners) held by this account. */
  @Get("owners")
  async owners(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    return this.db.select({ id: ownersTable.id, name: ownersTable.name, phone: ownersTable.phone, email: ownersTable.email, type: ownersTable.type, status: ownersTable.status, taxNumber: ownersTable.taxNumber, iban: ownersTable.iban })
      .from(ownersTable).where(and(eq(ownersTable.userId, uid), isNull(ownersTable.deletedAt)))
      .orderBy(desc(ownersTable.createdAt));
  }

  /** Payment schedule across the portfolio + a small summary. */
  @Get("payments")
  async payments(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    const rows = await this.db
      .select({
        id: paymentsTable.id, amount: paymentsTable.amount, dueDate: paymentsTable.dueDate,
        paidDate: paymentsTable.paidDate, status: paymentsTable.status,
        receiptNumber: paymentsTable.receiptNumber, description: paymentsTable.description,
        contractId: paymentsTable.contractId,
        contractNumber: contractsTable.contractNumber, tenantName: contractsTable.tenantName,
      })
      .from(paymentsTable)
      .leftJoin(contractsTable, eq(contractsTable.id, paymentsTable.contractId))
      .where(and(eq(paymentsTable.userId, uid), isNull(paymentsTable.deletedAt)))
      .orderBy(desc(paymentsTable.dueDate));

    // Collected amount per payment (for partial-payment display).
    const ids = rows.map((r) => r.id);
    const coll = ids.length
      ? await this.db.select({ paymentId: paymentCollectionsTable.paymentId, amount: paymentCollectionsTable.amount })
          .from(paymentCollectionsTable).where(inArray(paymentCollectionsTable.paymentId, ids))
      : [];
    const collMap = new Map<number, number>();
    for (const c of coll) if (c.paymentId != null) collMap.set(c.paymentId, (collMap.get(c.paymentId) ?? 0) + this.num(c.amount));

    const data = rows.map((r) => ({
      id: r.id, amount: this.num(r.amount), dueDate: r.dueDate, paidDate: r.paidDate,
      status: r.status, receiptNumber: r.receiptNumber, description: r.description,
      contractNumber: r.contractNumber, tenantName: r.tenantName,
      collectedAmount: Math.round((collMap.get(r.id) ?? 0) * 100) / 100,
    }));
    const summary = {
      paid: data.filter((d) => d.status === "paid").reduce((s, d) => s + d.amount, 0),
      pending: data.filter((d) => d.status === "pending").reduce((s, d) => s + d.amount, 0),
      overdue: data.filter((d) => d.status === "overdue").reduce((s, d) => s + d.amount, 0),
      overdueCount: data.filter((d) => d.status === "overdue").length,
    };
    return { data, summary };
  }

  /** Collections (money actually received). */
  @Get("collections")
  async collections(@CurrentUser() user: AuthUser) {
    const uid = scopeId(user);
    return this.db
      .select({
        id: paymentCollectionsTable.id, amount: paymentCollectionsTable.amount,
        collectedDate: paymentCollectionsTable.collectedDate, method: paymentCollectionsTable.method,
        receiptNumber: paymentCollectionsTable.receiptNumber,
        contractNumber: contractsTable.contractNumber, tenantName: contractsTable.tenantName,
      })
      .from(paymentCollectionsTable)
      .leftJoin(paymentsTable, eq(paymentsTable.id, paymentCollectionsTable.paymentId))
      .leftJoin(contractsTable, eq(contractsTable.id, paymentsTable.contractId))
      .where(eq(paymentCollectionsTable.userId, uid))
      .orderBy(desc(paymentCollectionsTable.collectedDate))
      .limit(200);
  }

  /** One property's FULL detail + its units + active contracts. */
  @Get("properties/:id")
  async property(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const uid = scopeId(user);
    const pid = parseInt(id, 10);
    const [p] = await this.db.select().from(propertiesTable)
      .where(and(eq(propertiesTable.id, pid), eq(propertiesTable.userId, uid), isNull(propertiesTable.deletedAt)));
    if (!p) throw new NotFoundException("Property not found");
    const units = await this.db.select().from(unitsTable)
      .where(and(eq(unitsTable.propertyId, pid), isNull(unitsTable.deletedAt))).orderBy(unitsTable.unitNumber);
    const unitIds = units.map((u) => u.id);
    const contracts = unitIds.length
      ? await this.db.selectDistinct({
          id: contractsTable.id, contractNumber: contractsTable.contractNumber, status: contractsTable.status,
          tenantName: contractsTable.tenantName, monthlyRent: contractsTable.monthlyRent,
          startDate: contractsTable.startDate, endDate: contractsTable.endDate,
        })
        .from(contractUnitsTable).innerJoin(contractsTable, eq(contractsTable.id, contractUnitsTable.contractId))
        .where(and(inArray(contractUnitsTable.unitId, unitIds), isNull(contractsTable.deletedAt)))
      : [];
    return {
      ...p,
      rentedUnits: units.filter((u) => u.status === "rented").length,
      availableUnits: units.filter((u) => u.status === "available").length,
      units: units.map((u) => ({ ...u, rentPrice: u.rentPrice ? this.num(u.rentPrice) : null, area: u.area ? this.num(u.area) : null })),
      contracts: contracts.map((c) => ({ ...c, monthlyRent: this.num(c.monthlyRent) })),
    };
  }

  /** One unit's FULL detail + its current active contract/tenant. */
  @Get("units/:id")
  async unit(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const uid = scopeId(user);
    const unitId = parseInt(id, 10);
    const [row] = await this.db
      .select({ unit: unitsTable, propertyName: propertiesTable.name, propertyId: propertiesTable.id })
      .from(unitsTable).innerJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
      .where(and(eq(unitsTable.id, unitId), eq(propertiesTable.userId, uid), isNull(unitsTable.deletedAt)));
    if (!row) throw new NotFoundException("Unit not found");
    const [cu] = await this.db
      .select({ id: contractsTable.id, contractNumber: contractsTable.contractNumber, status: contractsTable.status,
        tenantName: contractsTable.tenantName, tenantPhone: contractsTable.tenantPhone,
        monthlyRent: contractsTable.monthlyRent, startDate: contractsTable.startDate, endDate: contractsTable.endDate })
      .from(contractUnitsTable).innerJoin(contractsTable, eq(contractsTable.id, contractUnitsTable.contractId))
      .where(and(eq(contractUnitsTable.unitId, unitId), eq(contractsTable.status, "active"), isNull(contractsTable.deletedAt)))
      .limit(1);
    const u = row.unit;
    return {
      ...u,
      rentPrice: u.rentPrice ? this.num(u.rentPrice) : null, area: u.area ? this.num(u.area) : null,
      property: row.propertyName, propertyId: row.propertyId,
      currentContract: cu ? { ...cu, monthlyRent: this.num(cu.monthlyRent) } : null,
    };
  }

  /** One contract's full detail (read-only). */
  @Get("contracts/:id")
  async contract(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const uid = scopeId(user);
    const cid = parseInt(id, 10);
    const [c] = await this.db.select().from(contractsTable)
      .where(and(eq(contractsTable.id, cid), eq(contractsTable.userId, uid), isNull(contractsTable.deletedAt)));
    if (!c) throw new NotFoundException("Contract not found");
    const cu = await this.db.select({ unitNumber: unitsTable.unitNumber, propertyName: propertiesTable.name })
      .from(contractUnitsTable)
      .innerJoin(unitsTable, eq(unitsTable.id, contractUnitsTable.unitId))
      .innerJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
      .where(eq(contractUnitsTable.contractId, cid));
    const pays = await this.db.select({ id: paymentsTable.id, amount: paymentsTable.amount, dueDate: paymentsTable.dueDate, paidDate: paymentsTable.paidDate, status: paymentsTable.status })
      .from(paymentsTable).where(and(eq(paymentsTable.contractId, cid), isNull(paymentsTable.deletedAt)))
      .orderBy(paymentsTable.dueDate);
    return {
      id: c.id, contractNumber: c.contractNumber, status: c.status,
      tenantName: c.tenantName, tenantPhone: c.tenantPhone, tenantEmail: c.tenantEmail,
      landlordName: c.landlordName, landlordPhone: c.landlordPhone,
      monthlyRent: this.num(c.monthlyRent), paymentFrequency: c.paymentFrequency,
      startDate: c.startDate, endDate: c.endDate,
      depositAmount: c.depositAmount ? this.num(c.depositAmount) : 0,
      property: cu[0]?.propertyName ?? null, units: cu.map((r) => r.unitNumber).filter(Boolean),
      additionalFees: (c.additionalFees as any) ?? [],
      payments: pays.map((p) => ({ id: p.id, amount: this.num(p.amount), dueDate: p.dueDate, paidDate: p.paidDate, status: p.status })),
    };
  }
}

@Module({ controllers: [LandlordMobileController] })
export class MobileLandlordModule {}
