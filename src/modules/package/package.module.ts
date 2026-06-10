import { Body, Controller, Get, Inject, Module, Post, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { and, eq, isNull } from "drizzle-orm";
import { usersTable, ownersTable, companiesTable, tenantsTable } from "@oqudk/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { scopeId } from "../../common/scope";
import { resolvePackage, packageMode } from "../../common/packages";
import { packageUsage } from "../../common/quota";

/** The caller's subscription package — its limits, mode and current usage. */
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
      .select({
        packagePlan: usersTable.packagePlan, userType: usersTable.userType, onboardedAt: usersTable.onboardedAt,
        subscriptionStartedAt: usersTable.subscriptionStartedAt, subscriptionEndsAt: usersTable.subscriptionEndsAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, ownerId));
    const plan = resolvePackage(owner?.packagePlan);
    const usage = await packageUsage(this.db, ownerId);
    const endsAt = owner?.subscriptionEndsAt ?? null;
    const daysRemaining = endsAt ? Math.ceil((new Date(endsAt).getTime() - Date.now()) / 86_400_000) : null;
    return {
      plan,
      mode: plan.mode,
      usage,
      userType: owner?.userType ?? "individual",
      onboarded: owner?.onboardedAt != null,
      subscriptionStartedAt: owner?.subscriptionStartedAt ?? null,
      subscriptionEndsAt: endsAt,
      daysRemaining,
      expired: daysRemaining != null && daysRemaining < 0,
    };
  }

  /**
   * Complete the first-login setup wizard. Behaviour depends on the package
   * mode: a landlord account captures its type (individual/company), and we
   * create the default landlord record (individual) or company profile +
   * logo (company); a tenant account just stores its own details. Always
   * stamps `onboardedAt` so the wizard doesn't show again.
   */
  @Post("onboarding")
  async completeOnboarding(@CurrentUser() user: AuthUser, @Body() body: any) {
    const ownerId = scopeId(user);
    const [owner] = await this.db.select().from(usersTable).where(eq(usersTable.id, ownerId));
    const mode = packageMode(owner?.packagePlan);

    const userPatch: any = { onboardedAt: new Date() };
    if (body?.name) userPatch.name = String(body.name).trim();
    if (body?.phone) userPatch.phone = String(body.phone).trim();

    if (mode === "landlord") {
      const userType = body?.userType === "company" ? "company" : "individual";
      userPatch.userType = userType;

      if (userType === "company" && body?.company) {
        const c = body.company;
        const values: any = {
          name: (c.name || owner?.name || "").trim() || "—",
          vatNumber: c.vatNumber ?? null,
          commercialReg: c.commercialReg ?? null,
          officialEmail: c.officialEmail ?? null,
          companyPhone: c.companyPhone ?? userPatch.phone ?? null,
          city: c.city ?? null,
          address: c.address ?? null,
          logoKey: c.logoKey ?? null,
        };
        // The user references its company via users.companyId.
        if (owner?.companyId) {
          await this.db.update(companiesTable).set(values).where(eq(companiesTable.id, owner.companyId));
          userPatch.companyId = owner.companyId;
        } else {
          const [created] = await this.db.insert(companiesTable).values(values as any).returning({ id: companiesTable.id });
          userPatch.companyId = created!.id;
        }
      } else if (userType === "individual" && body?.landlord) {
        // Create the default landlord (owner) record for the individual.
        const l = body.landlord;
        const [existing] = await this.db.select({ id: ownersTable.id }).from(ownersTable)
          .where(and(eq(ownersTable.userId, ownerId), isNull(ownersTable.deletedAt)));
        if (!existing) {
          await this.db.insert(ownersTable).values({
            userId: ownerId,
            name: (l.name || owner?.name || "").trim() || "—",
            idNumber: l.idNumber ?? null,
            phone: l.phone ?? userPatch.phone ?? null,
            email: l.email ?? null,
            iban: l.iban ?? null,
            taxNumber: l.taxNumber ?? null,
          } as any);
        }
      }
    } else {
      // Tenant package — onboarding IS adding the account holder as a tenant.
      const tn = body?.tenant ?? {};
      const [existing] = await this.db.select({ id: tenantsTable.id }).from(tenantsTable)
        .where(and(eq(tenantsTable.userId, ownerId), isNull(tenantsTable.deletedAt)));
      const values: any = {
        name: (tn.name || body?.name || owner?.name || "").trim() || "—",
        type: tn.type === "company" ? "company" : "individual",
        nationalId: tn.nationalId ?? null,
        phone: tn.phone ?? userPatch.phone ?? owner?.phone ?? null,
        email: tn.email ?? null,
        taxNumber: tn.taxNumber ?? null,
        nationality: tn.nationality ?? null,
        address: tn.address ?? null,
        postalCode: tn.postalCode ?? null,
        status: "active",
      };
      if (existing) {
        await this.db.update(tenantsTable).set(values).where(eq(tenantsTable.id, existing.id));
      } else {
        await this.db.insert(tenantsTable).values({ userId: ownerId, ...values } as any);
      }
    }

    await this.db.update(usersTable).set(userPatch).where(eq(usersTable.id, ownerId));
    return { success: true, onboarded: true };
  }
}

@Module({ controllers: [PackageController] })
export class PackageModule {}
