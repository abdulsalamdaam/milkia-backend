import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull } from "drizzle-orm";
import { tenantsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";

const FIELDS = ["name", "type", "status", "nationalId", "phone", "email", "taxNumber", "address", "postalCode", "additionalNumber", "buildingNumber", "nationality", "notes"] as const;

@ApiTags("tenants")
@ApiBearerAuth("user-jwt")
@Controller("tenants")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class TenantsController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TENANTS_VIEW)
  list(@CurrentUser() user: AuthUser, @Query("type") type?: string) {
    const conditions = [eq(tenantsTable.userId, scopeId(user)), isNull(tenantsTable.deletedAt)];
    if (type === "individual" || type === "company") conditions.push(eq(tenantsTable.type, type));
    return this.db.select().from(tenantsTable).where(and(...conditions)).orderBy(tenantsTable.createdAt);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.TENANTS_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    if (!body.name) throw new BadRequestException("الاسم مطلوب");
    const [tenant] = await this.db.insert(tenantsTable).values({
      userId: scopeId(user),
      name: body.name,
      type: body.type || "individual",
      nationalId: body.nationalId ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      taxNumber: body.taxNumber ?? null,
      address: body.address ?? null,
      postalCode: body.postalCode ?? null,
      additionalNumber: body.additionalNumber ?? null,
      buildingNumber: body.buildingNumber ?? null,
      nationality: body.nationality ?? null,
      notes: body.notes ?? null,
      isDemo: "false",
    }).returning();
    return tenant;
  }

  @Patch(":id")
  @RequirePermissions(PERMISSIONS.TENANTS_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() body: any) {
    const tid = parseInt(id, 10);
    const updateData: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) updateData[f] = body[f];
    const [tenant] = await this.db.update(tenantsTable).set(updateData)
      .where(and(eq(tenantsTable.id, tid), eq(tenantsTable.userId, scopeId(user)), isNull(tenantsTable.deletedAt))).returning();
    if (!tenant) throw new NotFoundException("غير موجود");
    return tenant;
  }

  @Delete(":id")
  @RequirePermissions(PERMISSIONS.TENANTS_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    const tid = parseInt(id, 10);
    await this.db.update(tenantsTable).set({ deletedAt: new Date() } as any)
      .where(and(eq(tenantsTable.id, tid), eq(tenantsTable.userId, scopeId(user)), isNull(tenantsTable.deletedAt)));
    return { success: true };
  }
}

@Module({ controllers: [TenantsController] })
export class TenantsModule {}
