import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Inject, Module, NotFoundException, Param, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, MinLength } from "class-validator";
import { Throttle } from "@nestjs/throttler";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { contractsTable, contractUnitsTable, paymentsTable, unitsTable, propertiesTable, maintenanceRequestsTable, tenantsTable } from "@oqudk/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { TenantAuthGuard, type TenantPayload } from "../../common/guards/tenant-auth.guard";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";

class FcmTokenDto {
  @IsString()
  token!: string;

  @IsOptional()
  @IsIn(["ios", "android", "web"])
  platform?: "ios" | "android" | "web";
}

class CreateMaintenanceDto {
  @IsInt()
  contractId!: number;

  @IsString()
  @MinLength(3)
  description!: string;

  @IsOptional()
  @IsIn(["low", "medium", "high"])
  priority?: "low" | "medium" | "high";
}

class DeleteAccountDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

@ApiTags("tenant-portal")
@ApiBearerAuth("tenant-jwt")
@Controller("tenant/me")
@UseGuards(TenantAuthGuard)
export class TenantPortalController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  /* ── Profile ── */
  @Get()
  async profile(@CurrentTenant() tenant: TenantPayload) {
    const [t] = await this.db.select().from(tenantsTable).where(eq(tenantsTable.id, tenant.id));
    if (!t) throw new NotFoundException("Tenant not found");
    return {
      id: t.id,
      name: t.name,
      type: t.type,
      phone: t.phone,
      email: t.email,
      nationality: t.nationality,
      address: t.address,
      lastLoginAt: t.lastLoginAt,
      createdAt: t.createdAt,
    };
  }

  /* ── Contracts (matched by phone) ── */
  @Get("contracts")
  async contracts(@CurrentTenant() tenant: TenantPayload) {
    const [t] = await this.db.select().from(tenantsTable).where(eq(tenantsTable.id, tenant.id));
    if (!t || !t.phone) return [];
    const rows = await this.db
      .select({
        id: contractsTable.id,
        contractNumber: contractsTable.contractNumber,
        startDate: contractsTable.startDate,
        endDate: contractsTable.endDate,
        monthlyRent: contractsTable.monthlyRent,
        paymentFrequency: contractsTable.paymentFrequency,
        depositAmount: contractsTable.depositAmount,
        status: contractsTable.status,
        notes: contractsTable.notes,
        landlordName: contractsTable.landlordName,
        landlordPhone: contractsTable.landlordPhone,
        landlordEmail: contractsTable.landlordEmail,
        signingDate: contractsTable.signingDate,
        agencyFee: contractsTable.agencyFee,
        additionalFees: contractsTable.additionalFees,
      })
      .from(contractsTable)
      .where(eq(contractsTable.tenantPhone, t.phone))
      .orderBy(desc(contractsTable.createdAt));

    // A contract can span many units — fetch them via contract_units and
    // attach a `units` array, plus a primary unit/property surface so
    // older single-unit clients keep rendering.
    const unitsByContract = new Map<number, any[]>();
    if (rows.length > 0) {
      const unitRows = await this.db
        .select({
          contractId: contractUnitsTable.contractId,
          unitId: unitsTable.id,
          unitNumber: unitsTable.unitNumber,
          propertyId: propertiesTable.id,
          propertyName: propertiesTable.name,
          propertyCity: propertiesTable.city,
          propertyDistrict: propertiesTable.district,
          propertyType: propertiesTable.type,
        })
        .from(contractUnitsTable)
        .innerJoin(unitsTable, eq(unitsTable.id, contractUnitsTable.unitId))
        .leftJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
        .where(inArray(contractUnitsTable.contractId, rows.map((r) => r.id)))
        .orderBy(contractUnitsTable.id);
      for (const u of unitRows) {
        const list = unitsByContract.get(u.contractId) ?? [];
        list.push(u);
        unitsByContract.set(u.contractId, list);
      }
    }
    return rows.map((row) => {
      const units = unitsByContract.get(row.id) ?? [];
      const first: any = units[0] ?? null;
      return {
        ...row,
        units,
        unitId: first?.unitId ?? null,
        unitNumber: first?.unitNumber ?? null,
        propertyId: first?.propertyId ?? null,
        propertyName: first?.propertyName ?? null,
        propertyCity: first?.propertyCity ?? null,
        propertyDistrict: first?.propertyDistrict ?? null,
        propertyType: first?.propertyType ?? null,
      };
    });
  }

  /* ── Payments schedule across all tenant's contracts ── */
  @Get("payments")
  async payments(@CurrentTenant() tenant: TenantPayload) {
    const [t] = await this.db.select().from(tenantsTable).where(eq(tenantsTable.id, tenant.id));
    if (!t || !t.phone) return [];
    return this.db
      .select({
        id: paymentsTable.id,
        contractId: paymentsTable.contractId,
        contractNumber: contractsTable.contractNumber,
        amount: paymentsTable.amount,
        dueDate: paymentsTable.dueDate,
        paidDate: paymentsTable.paidDate,
        status: paymentsTable.status,
        receiptNumber: paymentsTable.receiptNumber,
        description: paymentsTable.description,
      })
      .from(paymentsTable)
      .innerJoin(contractsTable, eq(paymentsTable.contractId, contractsTable.id))
      .where(eq(contractsTable.tenantPhone, t.phone))
      .orderBy(paymentsTable.dueDate);
  }

  /* ── Maintenance: list own tickets ── */
  @Get("maintenance")
  async listMaintenance(@CurrentTenant() tenant: TenantPayload) {
    return this.db
      .select()
      .from(maintenanceRequestsTable)
      .where(eq(maintenanceRequestsTable.tenantId, tenant.id))
      .orderBy(desc(maintenanceRequestsTable.createdAt));
  }

  /* ── Maintenance: raise a ticket ── */
  @Post("maintenance")
  @Throttle({ default: { limit: 10, ttl: 3600_000 } })
  async createMaintenance(@CurrentTenant() tenant: TenantPayload, @Body() body: CreateMaintenanceDto) {
    if (!body.contractId || !body.description?.trim()) {
      throw new BadRequestException("رقم العقد ووصف المشكلة مطلوبان");
    }

    const [t] = await this.db.select().from(tenantsTable).where(eq(tenantsTable.id, tenant.id));
    if (!t || !t.phone) throw new BadRequestException("رقم الجوال غير مسجّل");

    const [contract] = await this.db
      .select({ id: contractsTable.id, userId: contractsTable.userId })
      .from(contractsTable)
      .where(and(eq(contractsTable.id, body.contractId), eq(contractsTable.tenantPhone, t.phone)));

    if (!contract) throw new NotFoundException("العقد غير موجود");

    // The contract may span several units — label the ticket with the
    // property name plus every unit number it covers.
    const unitRows = await this.db
      .select({ unitNumber: unitsTable.unitNumber, propertyName: propertiesTable.name })
      .from(contractUnitsTable)
      .innerJoin(unitsTable, eq(unitsTable.id, contractUnitsTable.unitId))
      .leftJoin(propertiesTable, eq(propertiesTable.id, unitsTable.propertyId))
      .where(eq(contractUnitsTable.contractId, contract.id))
      .orderBy(contractUnitsTable.id);
    const unitNumbers = unitRows.map((u) => u.unitNumber).filter(Boolean).join("، ");
    const propertyName = unitRows[0]?.propertyName ?? null;
    const unitLabel = propertyName && unitNumbers
      ? `${propertyName} — ${unitNumbers}`
      : (unitNumbers || `Unit (contract ${contract.id})`);

    const [row] = await this.db.insert(maintenanceRequestsTable).values({
      userId: contract.userId,
      tenantId: tenant.id,
      contractId: contract.id,
      unitLabel,
      description: body.description.trim(),
      priority: body.priority || "medium",
      status: "open",
    }).returning();

    return row;
  }

  /* ── Save FCM token (push notifications) ── */
  @Post("fcm-token")
  @HttpCode(200)
  async saveFcmToken(@CurrentTenant() tenant: TenantPayload, @Body() body: FcmTokenDto) {
    if (!body.token?.trim()) throw new BadRequestException("token required");
    await this.db.update(tenantsTable)
      .set({ fcmToken: body.token.trim(), fcmPlatform: body.platform ?? null })
      .where(eq(tenantsTable.id, tenant.id));
    return { success: true };
  }

  @Delete("fcm-token")
  @HttpCode(200)
  async clearFcmToken(@CurrentTenant() tenant: TenantPayload) {
    await this.db.update(tenantsTable)
      .set({ fcmToken: null, fcmPlatform: null })
      .where(eq(tenantsTable.id, tenant.id));
    return { success: true };
  }

  /* ── Soft delete account ── */
  @Delete()
  @HttpCode(200)
  async deleteAccount(@CurrentTenant() tenant: TenantPayload, @Body() body: DeleteAccountDto) {
    const noteSuffix = body.reason ? `\nسبب الحذف: ${body.reason}` : "";
    await this.db.update(tenantsTable)
      .set({
        deletedAt: new Date(),
        status: "inactive",
        fcmToken: null,
        fcmPlatform: null,
        tokenVersion: sql`${tenantsTable.tokenVersion} + 1`,
        notes: sql`COALESCE(${tenantsTable.notes}, '') || ${"\n[deleted at " + new Date().toISOString() + "]" + noteSuffix}`,
      })
      .where(eq(tenantsTable.id, tenant.id));
    return { success: true, message: "تم حذف الحساب. تواصل مع الدعم لاسترداده خلال 30 يوم." };
  }
}

@Module({ controllers: [TenantPortalController] })
export class TenantPortalModule {}
