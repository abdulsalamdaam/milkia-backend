import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Inject, Module, NotFoundException, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { count, desc, eq, sql } from "drizzle-orm";
import { usersTable, propertiesTable, unitsTable, contractsTable, paymentsTable, loginLogsTable, tenantsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../../common/guards/roles.guard";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import { seedDemoData } from "./demo-seed";
import { ALL_PERMISSIONS, ROLE_PRESETS } from "../../common/permissions";

@ApiTags("admin")
@ApiBearerAuth("user-jwt")
@Controller("admin")
@UseGuards(JwtAuthGuard, SuperAdminGuard)
class AdminController {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  @Get("stats")
  async stats() {
    const allUsers = await this.db.select().from(usersTable);
    const companies = allUsers.filter(u => u.role === "user" || u.role === "demo");
    const [totalProps] = await this.db.select({ count: count() }).from(propertiesTable);
    const [totalUnits] = await this.db.select({ count: count() }).from(unitsTable);
    const [totalContracts] = await this.db.select({ count: count() }).from(contractsTable);
    const contracts = await this.db.select().from(contractsTable);
    const activeContracts = contracts.filter(c => c.status === "active").length;
    const monthlyRecurring = contracts.filter(c => c.status === "active").reduce((s, c) => s + parseFloat(c.monthlyRent), 0);

    const payments = await this.db.select().from(paymentsTable);
    const now = new Date();
    const num = (s: string | null) => parseFloat(s || "0") || 0;
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const monthlyData = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const monthName = d.toLocaleDateString("ar-SA", { month: "short" });
      const revenue = payments.filter(p => p.status === "paid" && p.paidDate && p.paidDate.startsWith(key)).reduce((s, p) => s + num(p.amount), 0);
      return { month: monthName, revenue };
    });

    // monthlyRevenue is now actual collected money this month (sum of paid
    // payments whose paidDate falls in the current month). The previous value
    // (sum of active contracts' monthlyRent) is exposed as `monthlyRecurring`.
    const monthlyRevenue = payments
      .filter(p => p.status === "paid" && p.paidDate && p.paidDate.startsWith(currentKey))
      .reduce((s, p) => s + num(p.amount), 0);

    const collectedTotal = payments
      .filter(p => p.status === "paid")
      .reduce((s, p) => s + num(p.amount), 0);

    const pendingDue = payments
      .filter(p => p.status === "pending" || p.status === "overdue")
      .reduce((s, p) => s + num(p.amount), 0);

    return {
      totalCompanies: companies.length,
      activeCompanies: companies.filter(u => u.isActive).length,
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter(u => u.isActive).length,
      totalProperties: totalProps?.count ?? 0,
      totalUnits: totalUnits?.count ?? 0,
      totalContracts: totalContracts?.count ?? 0,
      activeContracts,
      monthlyRevenue,
      monthlyRecurring,
      collectedTotal,
      pendingDue,
      monthlyData,
    };
  }

  @Get("companies")
  async companies() {
    const allUsers = await this.db.select().from(usersTable);
    const companies = allUsers.filter(u => u.role === "user" || u.role === "demo");
    return Promise.all(companies.map(async (user) => {
      const [propCount] = await this.db.select({ count: count() }).from(propertiesTable).where(eq(propertiesTable.userId, user.id));
      const [unitCount] = await this.db.select({ count: count() }).from(unitsTable)
        .innerJoin(propertiesTable, eq(unitsTable.propertyId, propertiesTable.id))
        .where(eq(propertiesTable.userId, user.id));
      const [contractCount] = await this.db.select({ count: count() }).from(contractsTable).where(eq(contractsTable.userId, user.id));
      return {
        id: user.id,
        name: user.company || user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive,
        phone: user.phone,
        plan: user.role === "demo" ? "تجريبي" : "مجاني",
        propertiesCount: Number(propCount?.count ?? 0),
        unitsCount: Number(unitCount?.count ?? 0),
        contractsCount: Number(contractCount?.count ?? 0),
        createdAt: user.createdAt,
      };
    }));
  }

  @Patch("companies/:id")
  async updateCompany(@CurrentUser() admin: AuthUser, @Param("id") id: string, @Body() body: any) {
    const uid = parseInt(id, 10);
    if (uid === admin.id) throw new BadRequestException("لا يمكن تعديل حسابك الخاص");
    const updateData: Record<string, unknown> = {};
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    const [user] = await this.db.update(usersTable).set(updateData).where(eq(usersTable.id, uid)).returning();
    if (!user) throw new NotFoundException("Not found");
    return { success: true, id: user.id, isActive: user.isActive };
  }

  @Delete("companies/:id")
  async deleteCompany(@CurrentUser() admin: AuthUser, @Param("id") id: string) {
    const uid = parseInt(id, 10);
    if (uid === admin.id) throw new BadRequestException("لا يمكن حذف حسابك الخاص");
    const [user] = await this.db.delete(usersTable).where(eq(usersTable.id, uid)).returning();
    if (!user) throw new NotFoundException("Not found");
    return { success: true };
  }

  /**
   * "Admin Users" = Milkia internal team (super_admin + admin only).
   * Customer landlords (role='user' or 'demo') live under /admin/companies.
   * This separation keeps the company team panel decoupled from customer data.
   */
  @Get("users")
  async users() {
    const allUsers = await this.db.select().from(usersTable).orderBy(usersTable.createdAt);
    const teamOnly = allUsers.filter(u => u.role === "super_admin" || u.role === "admin");
    return Promise.all(teamOnly.map(async (user) => {
      const [propCount] = await this.db.select({ count: count() }).from(propertiesTable).where(eq(propertiesTable.userId, user.id));
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        phone: user.phone,
        company: user.company,
        propertiesCount: Number(propCount?.count ?? 0),
        loginCount: user.loginCount ?? 0,
        lastLoginAt: user.lastLoginAt,
        failedLoginAttempts: user.failedLoginAttempts ?? 0,
        createdAt: user.createdAt,
      };
    }));
  }

  @Get("login-history")
  async loginHistory(@Query("limit") limitQ?: string, @Query("status") statusQ?: string) {
    const limit = Math.min(parseInt(limitQ || "100", 10), 500);
    const logs = await this.db
      .select({
        id: loginLogsTable.id,
        userId: loginLogsTable.userId,
        email: loginLogsTable.email,
        status: loginLogsTable.status,
        ip: loginLogsTable.ip,
        device: loginLogsTable.device,
        createdAt: loginLogsTable.createdAt,
        userName: usersTable.name,
      })
      .from(loginLogsTable)
      .leftJoin(usersTable, eq(loginLogsTable.userId, usersTable.id))
      .orderBy(desc(loginLogsTable.createdAt))
      .limit(limit);
    return statusQ ? logs.filter(l => l.status === statusQ) : logs;
  }

  @Patch("users/:userId/unlock")
  async unlock(@Param("userId") userId: string) {
    const id = parseInt(userId, 10);
    const [user] = await this.db.update(usersTable).set({ failedLoginAttempts: 0 }).where(eq(usersTable.id, id)).returning();
    if (!user) throw new NotFoundException("Not found");
    return { success: true, id: user.id };
  }

  @Patch("users/:userId/force-logout")
  async forceLogout(@Param("userId") userId: string) {
    const id = parseInt(userId, 10);
    const [user] = await this.db.update(usersTable)
      .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1` })
      .where(eq(usersTable.id, id))
      .returning();
    if (!user) throw new NotFoundException("Not found");
    return { success: true, id: user.id, tokenVersion: user.tokenVersion };
  }

  @Patch("tenants/:tenantId/force-logout")
  async forceLogoutTenant(@Param("tenantId") tenantId: string) {
    const id = parseInt(tenantId, 10);
    const [tenant] = await this.db.update(tenantsTable)
      .set({ tokenVersion: sql`${tenantsTable.tokenVersion} + 1` })
      .where(eq(tenantsTable.id, id))
      .returning();
    if (!tenant) throw new NotFoundException("Not found");
    return { success: true, id: tenant.id, tokenVersion: tenant.tokenVersion };
  }

  /**
   * Send a test push notification to a tenant via Expo Push API.
   * Body: { title?: string, body?: string, data?: object }
   */
  @Post("tenants/:tenantId/push-test")
  async pushTest(@Param("tenantId") tenantId: string, @Body() body: { title?: string; body?: string; data?: Record<string, unknown> }) {
    const id = parseInt(tenantId, 10);
    const [tenant] = await this.db.select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      fcmToken: tenantsTable.fcmToken,
      fcmPlatform: tenantsTable.fcmPlatform,
    }).from(tenantsTable).where(eq(tenantsTable.id, id));

    if (!tenant) throw new NotFoundException("Tenant not found");
    if (!tenant.fcmToken) throw new BadRequestException("لا يوجد رمز إشعارات لهذا المستأجر. يجب أن يسجّل دخوله على التطبيق أولاً ويوافق على الإشعارات.");

    const payload = [{
      to: tenant.fcmToken,
      sound: "default",
      title: body.title || "ملكية",
      body: body.body || `مرحباً ${tenant.name}، هذه رسالة تجريبية.`,
      data: body.data || { type: "test" },
    }];

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", "accept": "application/json", "accept-encoding": "gzip, deflate" },
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => ({}));

    return {
      success: res.ok,
      tenant: { id: tenant.id, name: tenant.name, platform: tenant.fcmPlatform },
      expo: json,
    };
  }

  @Patch("users/:userId")
  async updateUser(@CurrentUser() admin: AuthUser, @Param("userId") userId: string, @Body() body: any) {
    const id = parseInt(userId, 10);
    if (id === admin.id) throw new BadRequestException("لا يمكن تعديل حسابك الخاص");
    const updateData: Record<string, unknown> = {};
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.role !== undefined) updateData.role = body.role;
    if (body.roleLabel !== undefined) updateData.roleLabel = body.roleLabel;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.permissions !== undefined) {
      updateData.permissions = body.permissions === null ? null : (Array.isArray(body.permissions) ? body.permissions : null);
    }
    const [user] = await this.db.update(usersTable).set(updateData).where(eq(usersTable.id, id)).returning();
    if (!user) throw new NotFoundException("Not found");
    return { id: user.id, isActive: user.isActive, role: user.role, roleLabel: user.roleLabel, permissions: user.permissions };
  }

  @Get("permissions/catalog")
  permissionsCatalog() {
    return { catalog: ALL_PERMISSIONS, presets: ROLE_PRESETS };
  }

  @Delete("users/:userId")
  async deleteUser(@CurrentUser() admin: AuthUser, @Param("userId") userId: string) {
    const id = parseInt(userId, 10);
    if (id === admin.id) throw new BadRequestException("لا يمكن حذف حسابك الخاص");
    const [user] = await this.db.delete(usersTable).where(eq(usersTable.id, id)).returning();
    if (!user) throw new NotFoundException("Not found");
    return { success: true };
  }

  @Get("registrations")
  async registrations(@Query("status") statusQ?: string) {
    const status = statusQ || "all";
    let users = await this.db.select().from(usersTable).orderBy(usersTable.createdAt);
    users = users.filter(u => u.role === "user");
    if (status !== "all") users = users.filter(u => u.accountStatus === status);
    return users.map(u => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      company: u.company,
      role: u.role,
      accountStatus: u.accountStatus,
      isActive: u.isActive,
      createdAt: u.createdAt,
    }));
  }

  @Get("registrations/pending-count")
  async pendingCount() {
    const users = await this.db.select().from(usersTable);
    const c = users.filter(u => u.role === "user" && u.accountStatus === "pending").length;
    return { count: c };
  }

  @Patch("registrations/:id/approve")
  async approve(@Param("id") id: string) {
    const uid = parseInt(id, 10);
    const [user] = await this.db.update(usersTable)
      .set({ accountStatus: "active", isActive: true })
      .where(eq(usersTable.id, uid))
      .returning();
    if (!user) throw new NotFoundException("User not found");
    return { success: true, id: user.id, accountStatus: user.accountStatus };
  }

  @Patch("registrations/:id/reject")
  async reject(@Param("id") id: string) {
    const uid = parseInt(id, 10);
    const [user] = await this.db.update(usersTable)
      .set({ accountStatus: "rejected", isActive: false })
      .where(eq(usersTable.id, uid))
      .returning();
    if (!user) throw new NotFoundException("User not found");
    return { success: true, id: user.id, accountStatus: user.accountStatus };
  }

  @Post("demo/reset")
  async demoReset() {
    const [demoUser] = await this.db.select().from(usersTable).where(eq(usersTable.email, "demo@platform.com"));
    if (!demoUser) throw new NotFoundException("Demo user not found");
    const demoUserId = demoUser.id;
    await this.db.delete(paymentsTable).where(eq(paymentsTable.userId, demoUserId));
    await this.db.delete(contractsTable).where(eq(contractsTable.userId, demoUserId));
    await this.db.delete(unitsTable).where(
      sql`${unitsTable.propertyId} IN (SELECT id FROM properties WHERE user_id = ${demoUserId})`
    );
    await this.db.delete(propertiesTable).where(eq(propertiesTable.userId, demoUserId));
    await seedDemoData(this.db, demoUserId);
    return { success: true, message: "تم إعادة ضبط بيانات الحساب التجريبي" };
  }
}

@Module({ controllers: [AdminController] })
export class AdminModule {}
