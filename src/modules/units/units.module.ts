import { Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param, Patch, Post, BadRequestException, UseGuards } from "@nestjs/common";
import { and, eq, isNull } from "drizzle-orm";
import { unitsTable, propertiesTable, contractsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { scopeId } from "../../common/scope";

const UNIT_FIELDS = ["unitNumber", "type", "status", "floor", "area", "bedrooms", "bathrooms", "livingRooms", "halls", "parkingSpaces", "rentPrice", "electricityMeter", "waterMeter", "gasMeter", "acUnits", "acType", "parkingType", "furnishing", "kitchenType", "fiber", "amenities", "unitDirection", "yearBuilt", "finishing", "facadeLength", "unitLength", "unitWidth", "unitHeight", "hasMezzanine", "notes"] as const;

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
class UnitsController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get("units")
  @RequirePermissions(PERMISSIONS.UNITS_VIEW)
  async listAll(@CurrentUser() user: AuthUser) {
    return this.db
      .select({
        id: unitsTable.id,
        propertyId: unitsTable.propertyId,
        propertyName: propertiesTable.name,
        unitNumber: unitsTable.unitNumber,
        type: unitsTable.type,
        status: unitsTable.status,
        floor: unitsTable.floor,
        area: unitsTable.area,
        bedrooms: unitsTable.bedrooms,
        bathrooms: unitsTable.bathrooms,
        livingRooms: unitsTable.livingRooms,
        halls: unitsTable.halls,
        parkingSpaces: unitsTable.parkingSpaces,
        rentPrice: unitsTable.rentPrice,
        electricityMeter: unitsTable.electricityMeter,
        waterMeter: unitsTable.waterMeter,
        gasMeter: unitsTable.gasMeter,
        acUnits: unitsTable.acUnits,
        acType: unitsTable.acType,
        parkingType: unitsTable.parkingType,
        furnishing: unitsTable.furnishing,
        kitchenType: unitsTable.kitchenType,
        fiber: unitsTable.fiber,
        amenities: unitsTable.amenities,
        unitDirection: unitsTable.unitDirection,
        yearBuilt: unitsTable.yearBuilt,
        finishing: unitsTable.finishing,
        facadeLength: unitsTable.facadeLength,
        unitLength: unitsTable.unitLength,
        unitWidth: unitsTable.unitWidth,
        unitHeight: unitsTable.unitHeight,
        hasMezzanine: unitsTable.hasMezzanine,
        notes: unitsTable.notes,
        createdAt: unitsTable.createdAt,
        tenantName: contractsTable.tenantName,
        tenantPhone: contractsTable.tenantPhone,
      })
      .from(unitsTable)
      .innerJoin(propertiesTable, and(
        eq(unitsTable.propertyId, propertiesTable.id),
        eq(propertiesTable.userId, scopeId(user)),
        isNull(propertiesTable.deletedAt),
      ))
      .leftJoin(contractsTable, and(
        eq(contractsTable.unitId, unitsTable.id),
        eq(contractsTable.status, "active"),
        isNull(contractsTable.deletedAt),
      ))
      .where(isNull(unitsTable.deletedAt))
      .orderBy(unitsTable.createdAt);
  }

  @Get("properties/:propertyId/units")
  @RequirePermissions(PERMISSIONS.UNITS_VIEW)
  async listByProperty(@CurrentUser() user: AuthUser, @Param("propertyId") propertyId: string) {
    const id = parseInt(propertyId, 10);
    const [prop] = await this.db.select().from(propertiesTable)
      .where(and(eq(propertiesTable.id, id), eq(propertiesTable.userId, scopeId(user)), isNull(propertiesTable.deletedAt)));
    if (!prop) throw new NotFoundException("Property not found");
    return this.db.select().from(unitsTable)
      .where(and(eq(unitsTable.propertyId, id), isNull(unitsTable.deletedAt)))
      .orderBy(unitsTable.createdAt);
  }

  @Post("properties/:propertyId/units")
  @RequirePermissions(PERMISSIONS.UNITS_WRITE)
  async create(@CurrentUser() user: AuthUser, @Param("propertyId") propertyId: string, @Body() body: any) {
    const id = parseInt(propertyId, 10);
    const [prop] = await this.db.select().from(propertiesTable)
      .where(and(eq(propertiesTable.id, id), eq(propertiesTable.userId, scopeId(user)), isNull(propertiesTable.deletedAt)));
    if (!prop) throw new NotFoundException("Property not found");

    if (!body.unitNumber || !body.type) throw new BadRequestException("رقم الوحدة والنوع مطلوبان");

    const values: Record<string, unknown> = { propertyId: id, isDemo: false };
    for (const f of UNIT_FIELDS) values[f] = body[f] ?? null;
    values.unitNumber = body.unitNumber;
    values.type = body.type;
    // status is NOT NULL — fall back to the schema default if the loop above
    // set it to null because body.status was undefined.
    if (values.status == null) values.status = "available";

    const [unit] = await this.db.insert(unitsTable).values(values as any).returning();
    return unit;
  }

  @Patch("units/:unitId")
  @RequirePermissions(PERMISSIONS.UNITS_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("unitId") unitId: string, @Body() body: any) {
    const id = parseInt(unitId, 10);
    // Verify the unit belongs to a property owned by this user/owner before allowing edits.
    const [unit0] = await this.db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .innerJoin(propertiesTable, and(eq(unitsTable.propertyId, propertiesTable.id), eq(propertiesTable.userId, scopeId(user)), isNull(propertiesTable.deletedAt)))
      .where(and(eq(unitsTable.id, id), isNull(unitsTable.deletedAt)));
    if (!unit0) throw new NotFoundException("Unit not found");
    const updateData: Record<string, unknown> = {};
    for (const f of UNIT_FIELDS) if (body[f] !== undefined) updateData[f] = body[f];
    const [unit] = await this.db.update(unitsTable).set(updateData).where(eq(unitsTable.id, id)).returning();
    return unit;
  }

  @Delete("units/:unitId")
  @RequirePermissions(PERMISSIONS.UNITS_DELETE)
  async remove(@CurrentUser() user: AuthUser, @Param("unitId") unitId: string) {
    const id = parseInt(unitId, 10);
    const [unit0] = await this.db
      .select({ id: unitsTable.id })
      .from(unitsTable)
      .innerJoin(propertiesTable, and(eq(unitsTable.propertyId, propertiesTable.id), eq(propertiesTable.userId, scopeId(user)), isNull(propertiesTable.deletedAt)))
      .where(and(eq(unitsTable.id, id), isNull(unitsTable.deletedAt)));
    if (!unit0) throw new NotFoundException("Unit not found");
    await this.db.update(unitsTable).set({ deletedAt: new Date() } as any).where(eq(unitsTable.id, id));
    return { success: true, message: "تم الحذف بنجاح" };
  }
}

@Module({ controllers: [UnitsController] })
export class UnitsModule {}
