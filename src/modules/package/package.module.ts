import { Controller, Get, Inject, Module, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { eq } from "drizzle-orm";
import { usersTable } from "@oqudk/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { scopeId } from "../../common/scope";
import { resolvePackage } from "../../common/packages";
import { packageUsage } from "../../common/quota";

/** The caller's subscription package — its limits and current usage. */
@ApiTags("package")
@ApiBearerAuth("user-jwt")
@Controller("me")
@UseGuards(JwtAuthGuard)
class PackageController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get("package")
  async myPackage(@CurrentUser() user: AuthUser) {
    const ownerId = scopeId(user);
    const [owner] = await this.db
      .select({ packagePlan: usersTable.packagePlan })
      .from(usersTable)
      .where(eq(usersTable.id, ownerId));
    const plan = resolvePackage(owner?.packagePlan);
    const usage = await packageUsage(this.db, ownerId);
    return { plan, usage };
  }
}

@Module({ controllers: [PackageController] })
export class PackageModule {}
