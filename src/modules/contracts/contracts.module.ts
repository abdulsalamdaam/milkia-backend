import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull, or, ilike, count, asc, desc } from "drizzle-orm";
import { contractsTable, unitsTable, propertiesTable, paymentsTable } from "@milkia/database";
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
  "agencyFee", "firstPaymentAmount", "additionalFees",
  "landlordName", "landlordNationality", "landlordIdNumber", "landlordPhone", "landlordEmail",
  "landlordTaxNumber", "landlordAddress", "landlordPostalCode", "landlordAdditionalNumber", "landlordBuildingNumber",
  "status", "notes",
] as const;

@ApiTags("contracts")
@ApiBearerAuth("user-jwt")
@Controller("contracts")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class ContractsController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

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
        unitId: contractsTable.unitId,
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
        createdAt: contractsTable.createdAt,
        unitNumber: unitsTable.unitNumber,
        propertyName: propertiesTable.name,
        propertyId: propertiesTable.id,
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
      .from(contractsTable)
      .leftJoin(unitsTable, eq(contractsTable.unitId, unitsTable.id))
      .leftJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(where)
      .orderBy((q.order === "asc" ? asc : desc)(contractsTable.createdAt))
      .$dynamic();
    if (usePaginated) rowsQ = rowsQ.limit(q.pageSize).offset((q.page - 1) * q.pageSize);

    const [rows, totalRow] = await Promise.all([
      rowsQ,
      usePaginated ? this.db.select({ total: count() }).from(contractsTable).where(where) : Promise.resolve([{ total: 0 }]),
    ]);
    if (!usePaginated) return rows;
    return { data: rows, page: q.page, pageSize: q.pageSize, total: Number(totalRow[0]?.total ?? 0) };
  }

  @Post()
  @RequirePermissions(PERMISSIONS.CONTRACTS_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    const { unitId, tenantName, startDate, endDate, monthlyRent } = body;
    if (!unitId || !tenantName || !startDate || !endDate || !monthlyRent) {
      throw new BadRequestException("البيانات الأساسية مطلوبة");
    }

    const freq = body.paymentFrequency || "monthly";
    const ownerId = scopeId(user);
    const contractNumber = `EQ-${Date.now()}-${ownerId}`;

    const additionalFees: FeeEntry[] | null = body.additionalFees && Array.isArray(body.additionalFees) && body.additionalFees.length > 0 ? body.additionalFees : null;

    const [contract] = await this.db.insert(contractsTable).values({
      userId: ownerId,
      unitId,
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
      status: "active",
      notes: body.notes ?? null,
      isDemo: false,
    }).returning();

    await this.db.update(unitsTable).set({ status: "rented" }).where(eq(unitsTable.id, unitId));

    const rows = buildInstallments(contract!.id, ownerId, startDate, endDate, String(monthlyRent), freq, additionalFees);
    if (rows.length > 0) await this.db.insert(paymentsTable).values(rows);

    return { ...contract, installmentsCreated: rows.length };
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

    const newStatus = body.status as string | undefined;
    if (newStatus === "terminated" || newStatus === "expired") {
      await this.db.update(unitsTable).set({ status: "available" }).where(eq(unitsTable.id, contract.unitId));
    } else if (newStatus === "active") {
      await this.db.update(unitsTable).set({ status: "rented" }).where(eq(unitsTable.id, contract.unitId));
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
    // Free the unit, and soft-delete the contract's payment installments too.
    await this.db.update(unitsTable).set({ status: "available" }).where(eq(unitsTable.id, contract.unitId));
    await this.db.update(paymentsTable).set({ deletedAt: now } as any)
      .where(and(eq(paymentsTable.contractId, id), isNull(paymentsTable.deletedAt)));
    return { success: true, message: "تم الحذف بنجاح" };
  }
}

@Module({ controllers: [ContractsController] })
export class ContractsModule {}
