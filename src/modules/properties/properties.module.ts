import {
  Body, Controller, Delete, Get, Inject, Module, NotFoundException, Param,
  Patch, Post, Query, BadRequestException, ConflictException, UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull, notInArray, sql, or, ilike, count, asc, desc } from "drizzle-orm";
import { deedsTable, propertiesTable, unitsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { PermissionsGuard, RequirePermissions } from "../../common/permissions.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { listQuerySchema } from "../../common/pagination";

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
  async list(@CurrentUser() user: AuthUser, @Query() rawQuery: any) {
    // Backwards compat: legacy callers send no query params and expect a
    // bare Property[]. When `page` or `pageSize` is present (or `search`),
    // we switch to the paginated shape { data, page, pageSize, total }.
    const usePaginated = rawQuery && (rawQuery.page != null || rawQuery.pageSize != null || rawQuery.search != null);
    const q = listQuerySchema.parse(rawQuery ?? {});
    const owner = scopeId(user);

    const baseWhere = and(eq(propertiesTable.userId, owner), isNull(propertiesTable.deletedAt));
    const where = q.search
      ? and(baseWhere, or(
          ilike(propertiesTable.name, `%${q.search}%`),
          ilike(propertiesTable.city, `%${q.search}%`),
          ilike(propertiesTable.district, `%${q.search}%`),
          ilike(propertiesTable.deedNumber, `%${q.search}%`),
          ilike(deedsTable.deedNumber, `%${q.search}%`),
        ))
      : baseWhere;

    // Total respects the same WHERE so pagination headers are correct.
    const totalP = usePaginated
      ? this.db
          .select({ total: count() })
          .from(propertiesTable)
          .leftJoin(deedsTable, and(eq(propertiesTable.deedId, deedsTable.id), isNull(deedsTable.deletedAt)))
          .where(where)
      : Promise.resolve([{ total: 0 }]);

    const sortFn = q.order === "asc" ? asc : desc;
    let rowsQuery = this.db
      .select({
        property: propertiesTable,
        deedNumber: deedsTable.deedNumber,
        deedType: deedsTable.deedType,
      })
      .from(propertiesTable)
      .leftJoin(deedsTable, and(eq(propertiesTable.deedId, deedsTable.id), isNull(deedsTable.deletedAt)))
      .where(where)
      .orderBy(sortFn(propertiesTable.createdAt))
      .$dynamic();
    if (usePaginated) {
      rowsQuery = rowsQuery.limit(q.pageSize).offset((q.page - 1) * q.pageSize);
    }

    const [rows, totalRow] = await Promise.all([rowsQuery, totalP]);

    const data = await Promise.all(rows.map(async ({ property: prop, deedNumber, deedType }) => {
      const units = await this.db.select({ status: unitsTable.status }).from(unitsTable)
        .where(and(eq(unitsTable.propertyId, prop.id), isNull(unitsTable.deletedAt)));
      const totalUnits = prop.totalUnits || units.length || 0;
      const rentedUnits = units.filter(u => u.status === "rented").length;
      const occupancyRate = totalUnits > 0 ? Math.round((rentedUnits / totalUnits) * 100) : 0;
      const effectiveDeedNumber = deedNumber ?? prop.deedNumber ?? null;
      return { ...prop, occupancyRate, rentedUnits, linkedDeedNumber: deedNumber, linkedDeedType: deedType, effectiveDeedNumber };
    }));

    if (!usePaginated) return data; // legacy shape
    return { data, page: q.page, pageSize: q.pageSize, total: Number(totalRow[0]?.total ?? 0) };
  }

  /**
   * Deeds the user can still attach to a NEW property (i.e. not already
   * linked to one). Powers the dropdown on the property add wizard.
   * If `currentDeedId` is provided, include it in the result so the edit
   * wizard can show the property's existing deed even though it's linked.
   */
  @Get("available-deeds")
  @RequirePermissions(PERMISSIONS.PROPERTIES_VIEW)
  async availableDeeds(@CurrentUser() user: AuthUser) {
    const owner = scopeId(user);
    // Sub-query of deed_ids already in use by a non-deleted property.
    const linkedDeedIds = this.db
      .select({ id: propertiesTable.deedId })
      .from(propertiesTable)
      .where(and(
        eq(propertiesTable.userId, owner),
        isNull(propertiesTable.deletedAt),
        sql`${propertiesTable.deedId} IS NOT NULL`,
      ));

    return this.db.select({
      id: deedsTable.id,
      deedNumber: deedsTable.deedNumber,
      deedType: deedsTable.deedType,
    })
    .from(deedsTable)
    .where(and(
      eq(deedsTable.userId, owner),
      isNull(deedsTable.deletedAt),
      // Either not linked anywhere yet …
      sql`${deedsTable.id} NOT IN ${linkedDeedIds}`,
    ))
    .orderBy(deedsTable.createdAt);
  }

  @Post()
  @RequirePermissions(PERMISSIONS.PROPERTIES_WRITE)
  async create(@CurrentUser() user: AuthUser, @Body() body: any) {
    const { name, type, city } = body;
    if (!name || !type || !city) {
      throw new BadRequestException("الاسم والنوع والمدينة مطلوبة · Name, type, and city are required");
    }

    const owner = scopeId(user);
    const deedId = body.deedId == null ? null : (typeof body.deedId === "number" ? body.deedId : parseInt(String(body.deedId), 10));

    // Validate the deed belongs to this scope and isn't already linked to
    // another property (1:1 enforcement at the API layer for nice errors;
    // the DB unique index is the ultimate safety net).
    if (deedId != null) {
      const [deed] = await this.db.select({ id: deedsTable.id })
        .from(deedsTable)
        .where(and(eq(deedsTable.id, deedId), eq(deedsTable.userId, owner), isNull(deedsTable.deletedAt)));
      if (!deed) throw new BadRequestException("الصك المختار غير موجود · Selected deed not found");

      const [clash] = await this.db.select({ id: propertiesTable.id })
        .from(propertiesTable)
        .where(and(eq(propertiesTable.deedId, deedId), isNull(propertiesTable.deletedAt)));
      if (clash) throw new ConflictException("الصك مرتبط بعقار آخر · This deed is already linked to another property");
    }

    const [prop] = await this.db.insert(propertiesTable).values({
      userId: owner,
      name,
      type,
      city,
      district: body.district ?? null,
      street: body.street ?? null,
      deedNumber: body.deedNumber ?? null,
      deedId,
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

    // Surface the linked deed inline so the detail page can render the
    // clickable Deed chip without a separate round-trip.
    let deed: { id: number; deedNumber: string; deedType: string } | null = null;
    if (prop.deedId) {
      const [d] = await this.db.select({
        id: deedsTable.id,
        deedNumber: deedsTable.deedNumber,
        deedType: deedsTable.deedType,
      }).from(deedsTable)
        .where(and(eq(deedsTable.id, prop.deedId), isNull(deedsTable.deletedAt)));
      deed = d ?? null;
    }
    return { ...prop, deed };
  }

  @Patch(":propertyId")
  @RequirePermissions(PERMISSIONS.PROPERTIES_WRITE)
  async update(@CurrentUser() user: AuthUser, @Param("propertyId") propertyId: string, @Body() body: any) {
    const id = parseInt(propertyId, 10);
    const owner = scopeId(user);
    const updateData: Record<string, unknown> = {};
    const fields = ["name", "type", "status", "city", "district", "street", "deedNumber", "totalUnits", "floors", "elevators", "parkings", "yearBuilt", "buildingType", "usageType", "region", "postalCode", "buildingNumber", "additionalNumber", "amenitiesData", "notes"];
    for (const field of fields) if (body[field] !== undefined) updateData[field] = body[field];
    if (body.ownerId !== undefined) {
      updateData["ownerId"] = body.ownerId === null ? null : (typeof body.ownerId === "number" ? body.ownerId : parseInt(String(body.ownerId), 10));
    }
    // Handle deedId change: re-validate ownership + 1:1 freshness.
    if (body.deedId !== undefined) {
      const nextDeedId = body.deedId === null ? null : (typeof body.deedId === "number" ? body.deedId : parseInt(String(body.deedId), 10));
      if (nextDeedId != null) {
        const [deed] = await this.db.select({ id: deedsTable.id })
          .from(deedsTable)
          .where(and(eq(deedsTable.id, nextDeedId), eq(deedsTable.userId, owner), isNull(deedsTable.deletedAt)));
        if (!deed) throw new BadRequestException("الصك المختار غير موجود · Selected deed not found");
        // Allow re-linking the deed already pointing to THIS property; block
        // re-linking a deed already attached to ANOTHER property.
        const [clash] = await this.db.select({ id: propertiesTable.id })
          .from(propertiesTable)
          .where(and(eq(propertiesTable.deedId, nextDeedId), isNull(propertiesTable.deletedAt)));
        if (clash && clash.id !== id) {
          throw new ConflictException("الصك مرتبط بعقار آخر · This deed is already linked to another property");
        }
      }
      updateData["deedId"] = nextDeedId;
    }
    const [prop] = await this.db.update(propertiesTable)
      .set(updateData as any)
      .where(and(eq(propertiesTable.id, id), eq(propertiesTable.userId, owner), isNull(propertiesTable.deletedAt)))
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
