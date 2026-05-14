import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull } from "drizzle-orm";
import { ownersTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";

const FIELDS = [
  "name", "type", "status", "idNumber", "phone", "email", "iban",
  "managementFeePercent", "taxNumber", "address",
  "postalCode", "additionalNumber", "buildingNumber", "notes",
  // Representative (وكيل) fields — added in Phase 4 of the asset-tree redesign.
  "isRepresentative", "representativeDocUrl",
  "originalOwnerName", "originalOwnerIdNumber", "originalOwnerPhone", "originalOwnerEmail",
  // Structured national address (العنوان الوطني). The legacy free-text `address`
  // column is still updatable above for backwards compat.
  "nationalAddressCity", "nationalAddressDistrict", "nationalAddressStreet",
] as const;

@ApiTags("owners")
@ApiBearerAuth("user-jwt")
@Controller("owners")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class OwnersController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get()
  @RequirePermissions(PERMISSIONS.OWNERS_VIEW)
  list(@CurrentUser() user: AuthUser) {
    return this.db.select().from(ownersTable).where(and(eq(ownersTable.userId, scopeId(user)), isNull(ownersTable.deletedAt))).orderBy(ownersTable.createdAt);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.OWNERS_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    if (!body.name) throw new BadRequestException("الاسم مطلوب");
    const [owner] = await this.db.insert(ownersTable).values({
      userId: scopeId(user),
      name: body.name,
      type: body.type || "individual",
      idNumber: body.idNumber ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      iban: body.iban ?? null,
      managementFeePercent: body.managementFeePercent ? String(body.managementFeePercent) : null,
      taxNumber: body.taxNumber ?? null,
      address: body.address ?? null,
      postalCode: body.postalCode ?? null,
      additionalNumber: body.additionalNumber ?? null,
      buildingNumber: body.buildingNumber ?? null,
      notes: body.notes ?? null,
      // Representative + national-address columns (Phase 4). All nullable
      // except isRepresentative, which defaults to false.
      isRepresentative: Boolean(body.isRepresentative ?? false),
      representativeDocUrl: body.representativeDocUrl ?? null,
      originalOwnerName: body.originalOwnerName ?? null,
      originalOwnerIdNumber: body.originalOwnerIdNumber ?? null,
      originalOwnerPhone: body.originalOwnerPhone ?? null,
      originalOwnerEmail: body.originalOwnerEmail ?? null,
      nationalAddressCity: body.nationalAddressCity ?? null,
      nationalAddressDistrict: body.nationalAddressDistrict ?? null,
      nationalAddressStreet: body.nationalAddressStreet ?? null,
      isDemo: "false",
    }).returning();
    return owner;
  }

  @Patch(":ownerId")
  @RequirePermissions(PERMISSIONS.OWNERS_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("ownerId") ownerId: string, @Body() body: any) {
    const id = parseInt(ownerId, 10);
    const updateData: Record<string, unknown> = {};
    for (const f of FIELDS) if (body[f] !== undefined) updateData[f] = body[f];
    const [owner] = await this.db.update(ownersTable).set(updateData)
      .where(and(eq(ownersTable.id, id), eq(ownersTable.userId, scopeId(user)), isNull(ownersTable.deletedAt)))
      .returning();
    if (!owner) throw new NotFoundException("Owner not found");
    return owner;
  }

  @Delete(":ownerId")
  @RequirePermissions(PERMISSIONS.OWNERS_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("ownerId") ownerId: string) {
    const id = parseInt(ownerId, 10);
    await this.db.update(ownersTable).set({ deletedAt: new Date() } as any)
      .where(and(eq(ownersTable.id, id), eq(ownersTable.userId, scopeId(user)), isNull(ownersTable.deletedAt)));
    return { success: true };
  }
}

@Module({ controllers: [OwnersController] })
export class OwnersModule {}
