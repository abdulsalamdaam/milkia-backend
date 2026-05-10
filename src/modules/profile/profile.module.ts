import { Body, Controller, Get, Inject, Module, NotFoundException, Patch, BadRequestException, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import { usersTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";

const PROFILE_FIELDS = {
  id: usersTable.id,
  name: usersTable.name,
  email: usersTable.email,
  phone: usersTable.phone,
  company: usersTable.company,
  role: usersTable.role,
  roleLabel: usersTable.roleLabel,
  commercialReg: usersTable.commercialReg,
  vatNumber: usersTable.vatNumber,
  officialEmail: usersTable.officialEmail,
  companyPhone: usersTable.companyPhone,
  website: usersTable.website,
  city: usersTable.city,
  address: usersTable.address,
  logoUrl: usersTable.logoUrl,
  createdAt: usersTable.createdAt,
} as const;

const EDITABLE_FIELDS = [
  "name", "phone", "company",
  "commercialReg", "vatNumber", "officialEmail", "companyPhone",
  "website", "city", "address", "logoUrl",
] as const;

@ApiTags("profile")
@ApiBearerAuth("user-jwt")
@Controller("profile")
@UseGuards(JwtAuthGuard)
class ProfileController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const [u] = await this.db.select(PROFILE_FIELDS).from(usersTable).where(eq(usersTable.id, user.id));
    if (!u) throw new NotFoundException("المستخدم غير موجود");
    return u;
  }

  @Patch()
  async update(@CurrentUser() user: AuthUser, @Body() body: Record<string, unknown>) {
    const updateData: Record<string, unknown> = {};
    for (const k of EDITABLE_FIELDS) {
      if (body[k] !== undefined) {
        // Empty string normalises to null so the column clears properly.
        updateData[k] = body[k] === "" ? null : body[k];
      }
    }
    if (Object.keys(updateData).length === 0) throw new BadRequestException("لا توجد بيانات للتحديث");
    const [u] = await this.db.update(usersTable).set(updateData).where(eq(usersTable.id, user.id)).returning(PROFILE_FIELDS);
    return u;
  }
}

@Module({ controllers: [ProfileController] })
export class ProfileModule {}
