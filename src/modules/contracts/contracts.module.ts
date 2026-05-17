import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull, or, ilike, count, asc, desc, inArray } from "drizzle-orm";
import { contractsTable, contractUnitsTable, unitsTable, propertiesTable, paymentsTable } from "@oqudk/database";
import { listQuerySchema } from "../../common/pagination";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";
import { buildInstallments, type FeeEntry } from "./installments";

const CONTRACT_FIELDS = [
  "tenantType", "tenantName", "tenantIdNumber", "tenantPhone", "tenantNationality", "tenantEmail",
  "tenantTaxNumber", "tenantAddress", "tenantPostalCode", "tenantAdditionalNumber", "tenantBuildingNumber",
  "repName", "repIdNumber", "companyUnified", "companyOrgType",
  "signingDate", "signingPlace",
  "startDate", "endDate", "monthlyRent", "paymentFrequency", "depositAmount",
  "vatEnabled", "escalationRate",
  "agencyFee", "firstPaymentAmount", "additionalFees",
  "landlordName", "landlordNationality", "landlordIdNumber", "landlordPhone", "landlordEmail",
  "landlordTaxNumber", "landlordAddress", "landlordPostalCode", "landlordAdditionalNumber", "landlordBuildingNumber",
  "status", "notes", "isDraft",
] as const;

@ApiTags("contracts")
@ApiBearerAuth("user-jwt")
@Controller("contracts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class ContractsController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  /**
   * Load the units of a set of contracts via the `contract_units` join
   * table, grouped by contract id. Each entry carries the unit row plus
   * its property's display fields — done as a separate query so a
   * multi-unit contract never multiplies the contract rows themselves.
   */
  private async unitsByContract(contractIds: number[]) {
    const map = new Map<number, any[]>();
    if (contractIds.length === 0) return map;
    const rows = await this.db
      .select({
        contractId: contractUnitsTable.contractId,
        unit: unitsTable,
        propertyName: propertiesTable.name,
        propertyType: propertiesTable.type,
        propertyBuildingType: propertiesTable.buildingType,
        propertyUsageType: propertiesTable.usageType,
        propertyFloors: propertiesTable.floors,
        propertyElevators: propertiesTable.elevators,
        propertyParkings: propertiesTable.parkings,
        propertyCity: propertiesTable.city,
        propertyDistrict: propertiesTable.district,
        propertyTotalUnits: propertiesTable.totalUnits,
      })
      .from(contractUnitsTable)
      .innerJoin(unitsTable, eq(unitsTable.id, contractUnitsTable.unitId))
      .leftJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
      .where(inArray(contractUnitsTable.contractId, contractIds))
      .orderBy(asc(contractUnitsTable.id));
    for (const r of rows) {
      const list = map.get(r.contractId) ?? [];
      list.push({
        ...r.unit,
        propertyName: r.propertyName,
        propertyType: r.propertyType,
        propertyBuildingType: r.propertyBuildingType,
        propertyUsageType: r.propertyUsageType,
        propertyFloors: r.propertyFloors,
        propertyElevators: r.propertyElevators,
        propertyParkings: r.propertyParkings,
        propertyCity: r.propertyCity,
        propertyDistrict: r.propertyDistrict,
        propertyTotalUnits: r.propertyTotalUnits,
      });
      map.set(r.contractId, list);
    }
    return map;
  }

  /**
   * Attach `units` to each contract, plus a primary unit/property surface
   * (`unitNumber`, `propertyId`, `propertyName`, …) taken from the first
   * unit — keeps the list/detail UIs working without an N-way join.
   */
  private withUnits<T extends { id: number }>(rows: T[], unitsByContract: Map<number, any[]>) {
    return rows.map((row) => {
      const units = unitsByContract.get(row.id) ?? [];
      const first: any = units[0] ?? null;
      return {
        ...row,
        units,
        unitId: first?.id ?? null,
        unitNumber: first?.unitNumber ?? null,
        propertyId: first?.propertyId ?? null,
        propertyName: first?.propertyName ?? null,
        propertyType: first?.propertyType ?? null,
        propertyBuildingType: first?.propertyBuildingType ?? null,
        propertyUsageType: first?.propertyUsageType ?? null,
        propertyFloors: first?.propertyFloors ?? null,
        propertyElevators: first?.propertyElevators ?? null,
        propertyParkings: first?.propertyParkings ?? null,
        propertyCity: first?.propertyCity ?? null,
        propertyDistrict: first?.propertyDistrict ?? null,
        propertyTotalUnits: first?.propertyTotalUnits ?? null,
      };
    });
  }

  @Get()
  @RequirePermissions(PERMISSIONS.CONTRACTS_VIEW)
  async list(@CurrentUser() user: AuthUser, @Query() rawQuery: any) {
    const usePaginated = rawQuery && (rawQuery.page != null || rawQuery.pageSize != null || rawQuery.search != null);
    const q = listQuerySchema.parse(rawQuery ?? {});
    const baseWhere = and(eq(contractsTable.userId, scopeId(user)), isNull(contractsTable.deletedAt));
    const where = q.search ? and(baseWhere, or(
      ilike(contractsTable.contractNumber, `%${q.search}%`),
      ilike(contractsTable.tenantName, `%${q.search}%`),
      ilike(contractsTable.tenantIdNumber, `%${q.search}%`),
      ilike(contractsTable.tenantPhone, `%${q.search}%`),
    )) : baseWhere;

    let rowsQ = this.db
      .select({
        id: contractsTable.id,
        contractNumber: contractsTable.contractNumber,
        tenantType: contractsTable.tenantType,
        tenantName: contractsTable.tenantName,
        tenantIdNumber: contractsTable.tenantIdNumber,
        tenantPhone: contractsTable.tenantPhone,
        tenantNationality: contractsTable.tenantNationality,
        tenantEmail: contractsTable.tenantEmail,
        tenantTaxNumber: contractsTable.tenantTaxNumber,
        tenantAddress: contractsTable.tenantAddress,
        tenantPostalCode: contractsTable.tenantPostalCode,
        tenantAdditionalNumber: contractsTable.tenantAdditionalNumber,
        tenantBuildingNumber: contractsTable.tenantBuildingNumber,
        repName: contractsTable.repName,
        repIdNumber: contractsTable.repIdNumber,
        companyUnified: contractsTable.companyUnified,
        companyOrgType: contractsTable.companyOrgType,
        signingDate: contractsTable.signingDate,
        signingPlace: contractsTable.signingPlace,
        startDate: contractsTable.startDate,
        endDate: contractsTable.endDate,
        monthlyRent: contractsTable.monthlyRent,
        paymentFrequency: contractsTable.paymentFrequency,
        depositAmount: contractsTable.depositAmount,
        vatEnabled: contractsTable.vatEnabled,
        escalationRate: contractsTable.escalationRate,
        agencyFee: contractsTable.agencyFee,
        firstPaymentAmount: contractsTable.firstPaymentAmount,
        additionalFees: contractsTable.additionalFees,
        landlordName: contractsTable.landlordName,
        landlordNationality: contractsTable.landlordNationality,
        landlordIdNumber: contractsTable.landlordIdNumber,
        landlordPhone: contractsTable.landlordPhone,
        landlordEmail: contractsTable.landlordEmail,
        landlordTaxNumber: contractsTable.landlordTaxNumber,
        landlordAddress: contractsTable.landlordAddress,
        landlordPostalCode: contractsTable.landlordPostalCode,
        landlordAdditionalNumber: contractsTable.landlordAdditionalNumber,
        landlordBuildingNumber: contractsTable.landlordBuildingNumber,
        status: contractsTable.status,
        notes: contractsTable.notes,
        isDraft: contractsTable.isDraft,
        createdAt: contractsTable.createdAt,
      })
      .from(contractsTable)
      .where(where)
      .orderBy((q.order === "asc" ? asc : desc)(contractsTable.createdAt))
      .$dynamic();
    if (usePaginated) rowsQ = rowsQ.limit(q.pageSize).offset((q.page - 1) * q.pageSize);

    const [rows, totalRow] = await Promise.all([
      rowsQ,
      usePaginated ? this.db.select({ total: count() }).from(contractsTable).where(where) : Promise.resolve([{ total: 0 }]),
    ]);
    const data = this.withUnits(rows, await this.unitsByContract(rows.map((r) => r.id)));
    if (!usePaginated) return data;
    return { data, page: q.page, pageSize: q.pageSize, total: Number(totalRow[0]?.total ?? 0) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTRACTS_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    const isDraft = Boolean(body.isDraft ?? false);
    // A contract spans one or more units (`unitIds`). The legacy single
    // `unitId` is still accepted so older callers keep working.
    const unitIds: number[] = (Array.isArray(body.unitIds) && body.unitIds.length > 0
      ? body.unitIds
      : (body.unitId != null ? [body.unitId] : []))
      .map((n: any) => Number(n))
      .filter((n: number) => Number.isFinite(n) && n > 0);
    if (unitIds.length === 0 || (!isDraft && (!body.tenantName || !body.startDate || !body.endDate || !body.monthlyRent))) {
      throw new BadRequestException(isDraft ? "اختر وحدة واحدة على الأقل لحفظ المسودة" : "البيانات الأساسية مطلوبة");
    }
    // Draft contracts may be incomplete — fall back so NOT NULL columns hold.
    const today = new Date().toISOString().slice(0, 10);
    const tenantName = body.tenantName || (isDraft ? "—" : body.tenantName);
    const startDate = body.startDate || (isDraft ? today : body.startDate);
    const endDate = body.endDate || (isDraft ? today : body.endDate);
    const monthlyRent = body.monthlyRent || (isDraft ? "0" : body.monthlyRent);

    const freq = body.paymentFrequency || "monthly";
    const ownerId = scopeId(user);
    const contractNumber = `EQ-${Date.now()}-${ownerId}`;

    const additionalFees: FeeEntry[] | null = body.additionalFees && Array.isArray(body.additionalFees) && body.additionalFees.length > 0 ? body.additionalFees : null;

    const [contract] = await this.db.insert(contractsTable).values({
      userId: ownerId,
      contractNumber,
      tenantType: body.tenantType ?? null,
      tenantName,
      tenantIdNumber: body.tenantIdNumber ?? null,
      tenantPhone: body.tenantPhone ?? null,
      tenantNationality: body.tenantNationality ?? null,
      tenantEmail: body.tenantEmail ?? null,
      tenantTaxNumber: body.tenantTaxNumber ?? null,
      tenantAddress: body.tenantAddress ?? null,
      tenantPostalCode: body.tenantPostalCode ?? null,
      tenantAdditionalNumber: body.tenantAdditionalNumber ?? null,
      tenantBuildingNumber: body.tenantBuildingNumber ?? null,
      repName: body.repName ?? null,
      repIdNumber: body.repIdNumber ?? null,
      companyUnified: body.companyUnified ?? null,
      companyOrgType: body.companyOrgType ?? null,
      signingDate: body.signingDate ?? null,
      signingPlace: body.signingPlace ?? null,
      startDate,
      endDate,
      monthlyRent: String(monthlyRent),
      paymentFrequency: freq,
      depositAmount: body.depositAmount ? String(body.depositAmount) : null,
      vatEnabled: Boolean(body.vatEnabled ?? false),
      escalationRate: body.escalationRate != null ? String(body.escalationRate) : "0",
      agencyFee: body.agencyFee ? String(body.agencyFee) : null,
      firstPaymentAmount: body.firstPaymentAmount ? String(body.firstPaymentAmount) : null,
      additionalFees,
      landlordName: body.landlordName ?? null,
      landlordNationality: body.landlordNationality ?? null,
      landlordIdNumber: body.landlordIdNumber ?? null,
      landlordPhone: body.landlordPhone ?? null,
      landlordEmail: body.landlordEmail ?? null,
      landlordTaxNumber: body.landlordTaxNumber ?? null,
      landlordAddress: body.landlordAddress ?? null,
      landlordPostalCode: body.landlordPostalCode ?? null,
      landlordAdditionalNumber: body.landlordAdditionalNumber ?? null,
      landlordBuildingNumber: body.landlordBuildingNumber ?? null,
      status: body.isDraft ? "pending" : "active",
      notes: body.notes ?? null,
      isDraft: Boolean(body.isDraft ?? false),
      isDemo: false,
    }).returning();

    // Link every unit to the new contract.
    await this.db.insert(contractUnitsTable).values(
      unitIds.map((unitId) => ({ contractId: contract!.id, unitId })),
    );

    // A draft contract doesn't occupy its units and generates no
    // installments until it is finalised.
    if (isDraft) {
      return { ...contract, unitIds, installmentsCreated: 0 };
    }

    await this.db.update(unitsTable).set({ status: "rented" }).where(inArray(unitsTable.id, unitIds));

    const rows = buildInstallments(
      contract!.id, ownerId, startDate, endDate, String(monthlyRent), freq, additionalFees,
      Boolean(body.vatEnabled ?? false), Number(body.escalationRate) || 0,
    );
    if (rows.length > 0) await this.db.insert(paymentsTable).values(rows);

    return { ...contract, unitIds, installmentsCreated: rows.length };
  }

  @Post(":contractId/generate-installments")
  @RequirePermissions(PERMISSIONS.CONTRACTS_WRITE)
  async generateInstallments(@CurrentUser() user: AuthUser, @Param("contractId") contractId: string, @Body() body: any) {
    const id = parseInt(contractId, 10);
    const ownerId = scopeId(user);
    const [contract] = await this.db.select().from(contractsTable)
      .where(and(eq(contractsTable.id, id), eq(contractsTable.userId, ownerId), isNull(contractsTable.deletedAt)));
    if (!contract) throw new NotFoundException("Contract not found");

    // Soft-delete pending installments before regenerating.
    await this.db.update(paymentsTable).set({ deletedAt: new Date() } as any).where(
      and(
        eq(paymentsTable.contractId, id),
        eq(paymentsTable.userId, ownerId),
        eq(paymentsTable.status, "pending"),
        isNull(paymentsTable.deletedAt),
      )
    );

    const freq = (body?.paymentFrequency as string) || contract.paymentFrequency || "monthly";
    const rows = buildInstallments(
      contract.id, ownerId,
      contract.startDate, contract.endDate,
      contract.monthlyRent, freq,
      (contract.additionalFees as FeeEntry[] | null) ?? null,
      Boolean(contract.vatEnabled), Number(contract.escalationRate) || 0,
    );
    if (rows.length > 0) await this.db.insert(paymentsTable).values(rows);
    return { success: true, installmentsCreated: rows.length };
  }

  @Patch(":contractId")
  @RequirePermissions(PERMISSIONS.CONTRACTS_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("contractId") contractId: string, @Body() body: any) {
    const id = parseInt(contractId, 10);
    const updateData: Record<string, unknown> = {};
    for (const f of CONTRACT_FIELDS) if (body[f] !== undefined) updateData[f] = body[f];

    const [contract] = await this.db.update(contractsTable)
      .set(updateData)
      .where(and(eq(contractsTable.id, id), eq(contractsTable.userId, scopeId(user)), isNull(contractsTable.deletedAt)))
      .returning();
    if (!contract) throw new NotFoundException("Contract not found");

    // A status change cascades to every unit the contract covers.
    const newStatus = body.status as string | undefined;
    if (newStatus === "terminated" || newStatus === "expired" || newStatus === "active") {
      const unitIds = (await this.db.select({ unitId: contractUnitsTable.unitId })
        .from(contractUnitsTable).where(eq(contractUnitsTable.contractId, id))).map((r) => r.unitId);
      if (unitIds.length > 0) {
        const unitStatus = newStatus === "active" ? "rented" : "available";
        await this.db.update(unitsTable).set({ status: unitStatus }).where(inArray(unitsTable.id, unitIds));
      }
    }
    return contract;
  }

  @Delete(":contractId")
  @RequirePermissions(PERMISSIONS.CONTRACTS_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("contractId") contractId: string) {
    const id = parseInt(contractId, 10);
    const now = new Date();
    const [contract] = await this.db.update(contractsTable)
      .set({ deletedAt: now } as any)
      .where(and(eq(contractsTable.id, id), eq(contractsTable.userId, scopeId(user)), isNull(contractsTable.deletedAt)))
      .returning();
    if (!contract) throw new NotFoundException("Contract not found");
    // Free every unit, and soft-delete the contract's payment installments.
    // The contract_units links cascade-delete only on a hard delete, so a
    // soft-deleted contract keeps them — fine, they are filtered out via
    // the contract's own deletedAt.
    const unitIds = (await this.db.select({ unitId: contractUnitsTable.unitId })
      .from(contractUnitsTable).where(eq(contractUnitsTable.contractId, id))).map((r) => r.unitId);
    if (unitIds.length > 0) {
      await this.db.update(unitsTable).set({ status: "available" }).where(inArray(unitsTable.id, unitIds));
    }
    await this.db.update(paymentsTable).set({ deletedAt: now } as any)
      .where(and(eq(paymentsTable.contractId, id), isNull(paymentsTable.deletedAt)));
    return { success: true, message: "تم الحذف بنجاح" };
  }
}

@Module({ controllers: [ContractsController] })
export class ContractsModule {}
