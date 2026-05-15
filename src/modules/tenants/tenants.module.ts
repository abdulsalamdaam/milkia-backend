import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull, or, ilike, count, asc, desc } from "drizzle-orm";
import { tenantsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";
import { listQuerySchema } from "../../common/pagination";

const FIELDS = [
  "name", "type", "status", "nationalId", "phone", "email", "taxNumber",
  "address", "postalCode", "additionalNumber", "buildingNumber", "nationality", "notes",
  // Phase 4 additions: financial info, structured national address,
  // representative (وكيل) fields.
  "iban", "employer", "monthlyIncome",
  "nationalAddressCity", "nationalAddressDistrict", "nationalAddressStreet",
  "isRepresentative", "representativeDocUrl",
  "originalTenantName", "originalTenantIdNumber", "originalTenantPhone", "originalTenantEmail",
] as const;

@ApiTags("tenants")
@ApiBearerAuth("user-jwt")
@Controller("tenants")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class TenantsController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get()
  @RequirePermissions(PERMISSIONS.TENANTS_VIEW)
  async list(@CurrentUser() user: AuthUser, @Query() rawQuery: any) {
    const usePaginated = rawQuery && (rawQuery.page != null || rawQuery.pageSize != null || rawQuery.search != null);
    const q = listQuerySchema.parse(rawQuery ?? {});
    const owner = scopeId(user);
    const type: string | undefined = rawQuery?.type;

    const baseCond = [eq(tenantsTable.userId, owner), isNull(tenantsTable.deletedAt)];
    if (type === "individual" || type === "company") baseCond.push(eq(tenantsTable.type, type));
    const searchCond = q.search ? [or(
      ilike(tenantsTable.name, `%${q.search}%`),
      ilike(tenantsTable.nationalId, `%${q.search}%`),
      ilike(tenantsTable.phone, `%${q.search}%`),
      ilike(tenantsTable.email, `%${q.search}%`),
    )] : [];
    const where = and(...baseCond, ...searchCond);

    const sortFn = q.order === "asc" ? asc : desc;
    let rowsQ = this.db.select().from(tenantsTable).where(where).orderBy(sortFn(tenantsTable.createdAt)).$dynamic();
    if (usePaginated) rowsQ = rowsQ.limit(q.pageSize).offset((q.page - 1) * q.pageSize);

    const [rows, totalRow] = await Promise.all([
      rowsQ,
      usePaginated
        ? this.db.select({ total: count() }).from(tenantsTable).where(where)
        : Promise.resolve([{ total: 0 }]),
    ]);
    if (!usePaginated) return rows;
    return { data: rows, page: q.page, pageSize: q.pageSize, total: Number(totalRow[0]?.total ?? 0) };
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
      // Phase 4 additions:
      iban: body.iban ?? null,
      employer: body.employer ?? null,
      monthlyIncome: body.monthlyIncome != null && body.monthlyIncome !== "" ? String(body.monthlyIncome) : null,
      nationalAddressCity: body.nationalAddressCity ?? null,
      nationalAddressDistrict: body.nationalAddressDistrict ?? null,
      nationalAddressStreet: body.nationalAddressStreet ?? null,
      isRepresentative: Boolean(body.isRepresentative ?? false),
      representativeDocUrl: body.representativeDocUrl ?? null,
      originalTenantName: body.originalTenantName ?? null,
      originalTenantIdNumber: body.originalTenantIdNumber ?? null,
      originalTenantPhone: body.originalTenantPhone ?? null,
      originalTenantEmail: body.originalTenantEmail ?? null,
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
