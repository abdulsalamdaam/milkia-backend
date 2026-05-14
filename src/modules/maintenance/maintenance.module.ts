import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, desc, eq, isNull } from "drizzle-orm";
import { maintenanceRequestsTable, contractsTable, unitsTable, propertiesTable, tenantsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";
import { EmailService } from "../email/email.service";

const FIELDS = ["unitLabel", "description", "priority", "status", "supplier", "estimatedCost", "tenantId", "contractId"] as const;

@ApiTags("maintenance")
@ApiBearerAuth("user-jwt")
@Controller("maintenance")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class MaintenanceController {
  constructor(
    @Inject(DRIZZLE) private readonly db: Drizzle,
    private readonly email: EmailService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.MAINTENANCE_VIEW)
  async list(@CurrentUser() user: AuthUser) {
    // Return tickets owned by the landlord, joined with tenant and unit info
    // for richer display in the dashboard.
    const rows = await this.db
      .select({
        id: maintenanceRequestsTable.id,
        userId: maintenanceRequestsTable.userId,
        tenantId: maintenanceRequestsTable.tenantId,
        contractId: maintenanceRequestsTable.contractId,
        unitLabel: maintenanceRequestsTable.unitLabel,
        description: maintenanceRequestsTable.description,
        priority: maintenanceRequestsTable.priority,
        status: maintenanceRequestsTable.status,
        supplier: maintenanceRequestsTable.supplier,
        estimatedCost: maintenanceRequestsTable.estimatedCost,
        createdAt: maintenanceRequestsTable.createdAt,
        updatedAt: maintenanceRequestsTable.updatedAt,
        tenantName: tenantsTable.name,
        tenantPhone: tenantsTable.phone,
        contractNumber: contractsTable.contractNumber,
        unitNumber: unitsTable.unitNumber,
        propertyName: propertiesTable.name,
      })
      .from(maintenanceRequestsTable)
      .leftJoin(tenantsTable, eq(maintenanceRequestsTable.tenantId, tenantsTable.id))
      .leftJoin(contractsTable, eq(maintenanceRequestsTable.contractId, contractsTable.id))
      .leftJoin(unitsTable, eq(contractsTable.unitId, unitsTable.id))
      .leftJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
      .where(and(eq(maintenanceRequestsTable.userId, scopeId(user)), isNull(maintenanceRequestsTable.deletedAt)))
      .orderBy(desc(maintenanceRequestsTable.createdAt));
    return rows;
  }

  /**
   * Landlord creates a ticket. Either:
   *  • free-form `unitLabel` + `description` (legacy), OR
   *  • `tenantId` and/or `contractId` for proper linking. When `contractId` is
   *    supplied we auto-derive the unit label.
   */
  @Post()
  @RequirePermissions(PERMISSIONS.MAINTENANCE_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    if (!body.description) throw new BadRequestException("الوصف مطلوب");

    let unitLabel: string | null = body.unitLabel ?? null;
    let tenantId: number | null = body.tenantId ? Number(body.tenantId) : null;
    let contractId: number | null = body.contractId ? Number(body.contractId) : null;
    const ownerId = scopeId(user);

    if (contractId) {
      const [contract] = await this.db
        .select({
          id: contractsTable.id,
          userId: contractsTable.userId,
          tenantPhone: contractsTable.tenantPhone,
          unitNumber: unitsTable.unitNumber,
          propertyName: propertiesTable.name,
        })
        .from(contractsTable)
        .leftJoin(unitsTable, eq(contractsTable.unitId, unitsTable.id))
        .leftJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
        .where(and(eq(contractsTable.id, contractId), eq(contractsTable.userId, ownerId)));

      if (!contract) throw new NotFoundException("العقد غير موجود");

      if (!unitLabel) {
        unitLabel = contract.propertyName && contract.unitNumber
          ? `${contract.propertyName} — ${contract.unitNumber}`
          : (contract.unitNumber || `Unit (contract ${contract.id})`);
      }

      if (!tenantId && contract.tenantPhone) {
        const [t] = await this.db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.phone, contract.tenantPhone));
        if (t) tenantId = t.id;
      }
    }

    if (!unitLabel) throw new BadRequestException("الوحدة مطلوبة");

    const [row] = await this.db.insert(maintenanceRequestsTable).values({
      userId: ownerId,
      tenantId,
      contractId,
      unitLabel,
      description: body.description,
      priority: body.priority || "medium",
      status: body.status || "open",
      supplier: body.supplier ?? null,
      estimatedCost: body.estimatedCost ? String(body.estimatedCost) : null,
    }).returning();

    void this.notifyOnCreate(row!);

    return row;
  }

  /**
   * Fan out two emails after a ticket is created:
   *   - admin/landlord notification (always, to ADMIN_NOTIFY_EMAIL)
   *   - tenant acknowledgment ("we received your request") — only when the
   *     linked tenant has an email on file
   * Both are best-effort; one failing must not block the other.
   */
  private async notifyOnCreate(row: typeof maintenanceRequestsTable.$inferSelect) {
    try {
      let tenantName: string | null = null;
      let tenantPhone: string | null = null;
      let tenantEmail: string | null = null;
      let propertyName: string | null = null;
      if (row.tenantId) {
        const [t] = await this.db
          .select({ name: tenantsTable.name, phone: tenantsTable.phone, email: tenantsTable.email })
          .from(tenantsTable)
          .where(eq(tenantsTable.id, row.tenantId));
        tenantName = t?.name ?? null;
        tenantPhone = t?.phone ?? null;
        tenantEmail = t?.email ?? null;
      }
      if (row.contractId) {
        const [p] = await this.db
          .select({ propertyName: propertiesTable.name })
          .from(contractsTable)
          .leftJoin(unitsTable, eq(contractsTable.unitId, unitsTable.id))
          .leftJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
          .where(eq(contractsTable.id, row.contractId));
        propertyName = p?.propertyName ?? null;
      }
      const payload = {
        id: row.id,
        unitLabel: row.unitLabel,
        description: row.description,
        priority: row.priority,
        status: row.status,
        tenantName,
        tenantPhone,
        propertyName,
      };
      await Promise.allSettled([
        this.email.sendMaintenanceCreated(payload),
        tenantEmail ? this.email.sendMaintenanceAcknowledgment(tenantEmail, payload) : Promise.resolve(false),
      ]);
    } catch (err) {
      console.error("[maintenance] notifyOnCreate failed:", err);
    }
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: any) {
    const rid = parseInt(id, 10);
    // Capture the prior status so we can detect a transition and only email
    // the tenant when the status actually changed (not on cosmetic edits
    // like description/supplier).
    const [previous] = await this.db
      .select({ status: maintenanceRequestsTable.status, tenantId: maintenanceRequestsTable.tenantId })
      .from(maintenanceRequestsTable)
      .where(and(eq(maintenanceRequestsTable.id, rid), eq(maintenanceRequestsTable.userId, scopeId(user)), isNull(maintenanceRequestsTable.deletedAt)));

    const updateData: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) updateData[f] = body[f];
    const [row] = await this.db.update(maintenanceRequestsTable).set(updateData)
      .where(and(eq(maintenanceRequestsTable.id, rid), eq(maintenanceRequestsTable.userId, scopeId(user)), isNull(maintenanceRequestsTable.deletedAt)))
      .returning();
    if (!row) throw new NotFoundException("الطلب غير موجود");

    if (previous && previous.status !== row.status) {
      void this.notifyTenantOfStatusChange(row, previous.status ?? null);
    }
    return row;
  }

  private async notifyTenantOfStatusChange(row: typeof maintenanceRequestsTable.$inferSelect, previousStatus: string | null) {
    try {
      if (!row.tenantId) return;
      const [tenant] = await this.db
        .select({ name: tenantsTable.name, email: tenantsTable.email })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, row.tenantId));
      if (!tenant?.email) return;
      await this.email.sendMaintenanceStatusChanged(tenant.email, {
        id: row.id,
        unitLabel: row.unitLabel,
        description: row.description,
        priority: row.priority,
        status: row.status,
        tenantName: tenant.name,
        previousStatus,
      });
    } catch (err) {
      console.error("[maintenance] notifyTenantOfStatusChange failed:", err);
    }
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.MAINTENANCE_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const rid = parseInt(id, 10);
    await this.db.update(maintenanceRequestsTable).set({ deletedAt: new Date() } as any)
      .where(and(eq(maintenanceRequestsTable.id, rid), eq(maintenanceRequestsTable.userId, scopeId(user)), isNull(maintenanceRequestsTable.deletedAt)));
    return { ok: true };
  }
}

@Module({ controllers: [MaintenanceController] })
export class MaintenanceModule {}
