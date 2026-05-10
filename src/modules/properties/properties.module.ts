import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull } from "drizzle-orm";
import { propertiesTable, unitsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";

/** When the caller is an employee, list their owner's data. Top-level users see their own. */
function scopeId(user: AuthUser): number {
  return user.ownerUserId ?? user.id;
}

@ApiTags("properties")
@ApiBearerAuth("user-jwt")
@Controller("properties")
@UseGuards(JwtAuthGuard, PermissionsGuard)
class PropertiesController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get()
  @RequirePermissions(PERMISSIONS.PROPERTIES_VIEW)
  async list(@CurrentUser() user: AuthUser) {
    const props = await this.db.select().from(propertiesTable)
      .where(and(eq(propertiesTable.userId, scopeId(user)), isNull(propertiesTable.deletedAt)))
      .orderBy(propertiesTable.createdAt);

    return Promise.all(props.map(async (prop) => {
      const units = await this.db.select({ status: unitsTable.status }).from(unitsTable)
        .where(and(eq(unitsTable.propertyId, prop.id), isNull(unitsTable.deletedAt)));
      const totalUnits = prop.totalUnits || units.length || 0;
      const rentedUnits = units.filter(u => u.status === "rented").length;
      const occupancyRate = totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0;
      return { ...prop, occupancyRate, rentedUnits };
    }));
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROPERTIES_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    const { name, type, city } = body;
    if (!name || !type || !city) throw new BadRequestException("الاسم والنوع والمدينة مطلوبة");

    const [prop] = await this.db.insert(propertiesTable).values({
      userId: scopeId(user),
      name,
      type,
      city,
      district: body.district ?? null,
      street: body.street ?? null,
      deedNumber: body.deedNumber ?? null,
      totalUnits: body.totalUnits ?? 0,
      floors: body.floors ? parseInt(body.floors) : null,
      elevators: body.elevators ? parseInt(body.elevators) : null,
      parkings: body.parkings ? parseInt(body.parkings) : null,
      yearBuilt: body.yearBuilt ? parseInt(body.yearBuilt) : null,
      buildingType: body.buildingType ?? null,
      usageType: body.usageType ?? null,
      region: body.region ?? null,
      postalCode: body.postalCode ?? null,
      buildingNumber: body.buildingNumber ?? null,
      additionalNumber: body.additionalNumber ?? null,
      amenitiesData: body.amenitiesData ?? null,
      notes: body.notes ?? null,
      isDemo: false,
    }).returning();

    return { ...prop, occupancyRate: 0, rentedUnits: 0 };
  }

  @Get(":propertyId")
  @RequirePermissions(PERMISSIONS.PROPERTIES_VIEW)
  async getOne(@CurrentUser() user: AuthUser, @Param("propertyId") propertyId: string) {
    const id = parseInt(propertyId, 10);
    const [prop] = await this.db.select().from(propertiesTable)
      .where(and(eq(propertiesTable.id, id), eq(propertiesTable.userId, scopeId(user)), isNull(propertiesTable.deletedAt)));
    if (!prop) throw new NotFoundException("Property not found");
    return prop;
  }

  @Patch(":propertyId")
  @RequirePermissions(PERMISSIONS.PROPERTIES_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("propertyId") propertyId: string, @Body() body: any) {
    const id = parseInt(propertyId, 10);
    const updateData: Record<string, unknown> = {};
    const fields = ["name", "type", "status", "city", "district", "street", "deedNumber", "totalUnits", "floors", "elevators", "parkings", "yearBuilt", "buildingType", "usageType", "region", "postalCode", "buildingNumber", "additionalNumber", "amenitiesData", "notes"];
    for (const field of fields) if (body[field] !== undefined) updateData[field] = body[field];
    if (body.ownerId !== undefined) {
      updateData["ownerId"] = body.ownerId === null ? null : (typeof body.ownerId === "number" ? body.ownerId : parseInt(String(body.ownerId), 10));
    }
    const [prop] = await this.db.update(propertiesTable)
      .set(updateData as any)
      .where(and(eq(propertiesTable.id, id), eq(propertiesTable.userId, scopeId(user)), isNull(propertiesTable.deletedAt)))
      .returning();
    if (!prop) throw new NotFoundException("Property not found");
    return prop;
  }

  @Delete(":propertyId")
  @RequirePermissions(PERMISSIONS.PROPERTIES_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("propertyId") propertyId: string) {
    const id = parseInt(propertyId, 10);
    // Soft delete: mark deleted_at instead of removing the row.
    const now = new Date();
    const [prop] = await this.db.update(propertiesTable)
      .set({ deletedAt: now } as any)
      .where(and(eq(propertiesTable.id, id), eq(propertiesTable.userId, scopeId(user)), isNull(propertiesTable.deletedAt)))
      .returning();
    if (!prop) throw new NotFoundException("Property not found");
    // Cascade: also soft-delete units belonging to this property.
    await this.db.update(unitsTable)
      .set({ deletedAt: now } as any)
      .where(and(eq(unitsTable.propertyId, id), isNull(unitsTable.deletedAt)));
    return { success: true, message: "تم الحذف بنجاح" };
  }
}

@Module({ controllers: [PropertiesController] })
export class PropertiesModule {}
