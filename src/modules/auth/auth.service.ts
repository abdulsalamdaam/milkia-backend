import { Injectable, Inject, BadRequestException, NotFoundException, UnauthorizedException, ForbiddenException, HttpException, HttpStatus } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { eq, sql, and, isNull } from "drizzle-orm";
import { usersTable, loginLogsTable, tenantsTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import type { TenantPayload } from "../../common/guards/tenant-auth.guard";
import { TwilioVerifyService } from "../twilio/twilio-verify.service";
import { EmailService } from "../email/email.service";
import { effectivePermissions, ROLE_PRESETS, ALL_PERMISSIONS } from "../../common/permissions";

const MAX_FAILED = 5;

@Injectable()
export class AuthService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Drizzle,
    private readonly jwt: JwtService,
    private readonly twilio: TwilioVerifyService,
    private readonly email: EmailService,
  ) {}

  private device(ua: string | undefined): string {
    if (!ua) return "Desktop";
    if (/mobile|android|iphone|ipad/i.test(ua)) return "Mobile";
    if (/tablet/i.test(ua)) return "Tablet";
    return "Desktop";
  }

  private async recordLogin(userId: number | null, email: string, status: "success" | "failed", ip: string, ua?: string) {
    await this.db.insert(loginLogsTable).values({
      userId,
      email,
      status,
      ip,
      device: this.device(ua),
    });
  }

  /* ── User token ── */
  signUserToken(payload: { id: number; email: string; role: AuthUser["role"]; tokenVersion: number }): string {
    return this.jwt.sign(
      { id: payload.id, email: payload.email, role: payload.role, kind: "user", tv: payload.tokenVersion },
    );
  }

  /* ── Tenant token ── */
  signTenantToken(payload: { id: number; phone: string; tokenVersion: number }): string {
    const claims: TenantPayload = { id: payload.id, phone: payload.phone, kind: "tenant", tv: payload.tokenVersion };
    return this.jwt.sign(claims);
  }

  /* ── User: email/password login ── */
  async login(input: { email: string; password: string }, ctx: { ip: string; ua?: string }) {
    const { email, password } = input;
    if (!email || !password) throw new BadRequestException("Email and password required");

    let user;
    try {
      [user] = await this.db.select().from(usersTable).where(and(eq(usersTable.email, email.toLowerCase()), isNull(usersTable.deletedAt)));
    } catch (err: any) {
      console.error("[auth.login] DB query failed:", {
        message: err?.message,
        code: err?.code,
        cause: err?.cause?.message ?? err?.cause,
        detail: err?.detail,
        stack: err?.stack?.split("\n").slice(0, 5).join("\n"),
      });
      throw err;
    }
    if (!user) {
      await this.recordLogin(null, email.toLowerCase(), "failed", ctx.ip, ctx.ua);
      throw new UnauthorizedException("بريد إلكتروني أو كلمة مرور غير صحيحة");
    }

    const adminRoles = ["super_admin", "admin"];
    if (!adminRoles.includes(user.role)) {
      if (user.accountStatus === "pending") {
        throw new ForbiddenException({ error: "حسابك قيد المراجعة، يرجى انتظار موافقة المشرف", code: "PENDING" });
      }
      if (user.accountStatus === "rejected") {
        throw new ForbiddenException({ error: "تم رفض طلب تسجيلك. تواصل مع الدعم للمزيد من المعلومات", code: "REJECTED" });
      }
    }

    if (!user.isActive) throw new UnauthorizedException("الحساب غير مفعّل. تواصل مع الدعم");

    if (user.failedLoginAttempts >= MAX_FAILED) {
      await this.recordLogin(user.id, user.email, "failed", ctx.ip, ctx.ua);
      throw new HttpException(
        { error: `تم تجاوز الحد المسموح به من محاولات الدخول الفاشلة (${MAX_FAILED}). الحساب مقفل مؤقتاً. تواصل مع المشرف.`, code: "LOCKED" },
        423 as HttpStatus,
      );
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      const newFailed = user.failedLoginAttempts + 1;
      await this.db.update(usersTable).set({ failedLoginAttempts: newFailed }).where(eq(usersTable.id, user.id));
      await this.recordLogin(user.id, user.email, "failed", ctx.ip, ctx.ua);
      const remaining = MAX_FAILED - newFailed;
      if (remaining > 0) {
        throw new UnauthorizedException(`بريد إلكتروني أو كلمة مرور غير صحيحة. تبقى ${remaining} محاولة قبل قفل الحساب.`);
      }
      throw new HttpException(
        { error: "تم تجاوز الحد المسموح به من المحاولات. الحساب مقفل مؤقتاً. تواصل مع المشرف.", code: "LOCKED" },
        423 as HttpStatus,
      );
    }

    await this.db.update(usersTable)
      .set({
        loginCount: sql`${usersTable.loginCount} + 1`,
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
      })
      .where(eq(usersTable.id, user.id));

    await this.recordLogin(user.id, user.email, "success", ctx.ip, ctx.ua);

    const token = this.signUserToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 });
    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        accountStatus: user.accountStatus,
        phone: user.phone,
        company: user.company,
        loginCount: (user.loginCount ?? 0) + 1,
        lastLoginAt: new Date(),
        createdAt: user.createdAt,
      },
    };
  }

  /* ── User: register ── */
  async register(input: { email: string; password: string; name: string; phone?: string; company?: string }) {
    const { email, password, name, phone, company } = input;
    if (!email || !password || !name) throw new BadRequestException("الاسم والبريد الإلكتروني وكلمة المرور مطلوبة");

    const existing = await this.db.select().from(usersTable).where(and(eq(usersTable.email, email.toLowerCase()), isNull(usersTable.deletedAt)));
    if (existing.length > 0) throw new BadRequestException("البريد الإلكتروني مسجّل مسبقاً");

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await this.db.insert(usersTable).values({
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: "user",
      isActive: false,
      accountStatus: "pending",
      phone: phone ?? null,
      company: company ?? null,
    }).returning();

    void this.email.sendWelcome(user!.email, user!.name);

    return {
      pending: true,
      message: "تم استلام طلب التسجيل بنجاح. سيتم مراجعة حسابك من قِبَل المشرف وإشعارك بالقبول.",
      user: { id: user!.id, email: user!.email, name: user!.name, accountStatus: user!.accountStatus },
    };
  }

  async permissionsForUser(userId: number) {
    const [user] = await this.db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) throw new UnauthorizedException("User not found");
    const perms = effectivePermissions(user.role as keyof typeof ROLE_PRESETS, user.permissions);
    return {
      role: user.role,
      roleLabel: user.roleLabel,
      permissions: perms,
      catalog: ALL_PERMISSIONS,
      presets: ROLE_PRESETS,
    };
  }

  /* ── User: profile ── */
  async me(userId: number) {
    const [user] = await this.db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (!user) throw new UnauthorizedException("User not found");
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      accountStatus: user.accountStatus,
      phone: user.phone,
      company: user.company,
      loginCount: user.loginCount,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }

  /* ── User: logout (revokes all current sessions for this user) ── */
  async logoutUser(userId: number) {
    await this.db.update(usersTable)
      .set({ tokenVersion: sql`${usersTable.tokenVersion} + 1` })
      .where(eq(usersTable.id, userId));
    return { success: true, message: "تم تسجيل الخروج. تم إنهاء جميع الجلسات." };
  }

  /* ── User: forgot/reset password via Twilio Verify OTP ── */
  async forgotPassword(input: { identifier: string; channel?: "sms" | "email" | "call" | "whatsapp" }) {
    const id = input.identifier.trim();
    if (!id) throw new BadRequestException("البريد الإلكتروني أو رقم الجوال مطلوب");

    const isEmail = id.includes("@");
    const channel = input.channel || (isEmail ? "email" : "sms");

    const [user] = isEmail
      ? await this.db.select().from(usersTable).where(and(eq(usersTable.email, id.toLowerCase()), isNull(usersTable.deletedAt)))
      : await this.db.select().from(usersTable).where(and(eq(usersTable.phone, id), isNull(usersTable.deletedAt)));

    // Always respond the same way to avoid leaking which accounts exist.
    if (!user) {
      return { success: true, message: "إذا كان الحساب مسجّلاً، فقد أرسلنا لك رمز التحقق." };
    }

    const target = isEmail ? user.email : (user.phone || id);
    await this.twilio.start(target, channel);
    return { success: true, message: "تم إرسال رمز التحقق. أدخله لإكمال إعادة تعيين كلمة المرور." };
  }

  async resetPassword(input: { identifier: string; code: string; newPassword: string; channel?: "sms" | "email" | "call" | "whatsapp" }) {
    const { identifier, code, newPassword } = input;
    if (!identifier || !code || !newPassword) throw new BadRequestException("جميع الحقول مطلوبة");
    if (newPassword.length < 6) throw new BadRequestException("كلمة المرور قصيرة جداً");

    const isEmail = identifier.includes("@");
    const channel = input.channel || (isEmail ? "email" : "sms");

    const [user] = isEmail
      ? await this.db.select().from(usersTable).where(and(eq(usersTable.email, identifier.toLowerCase()), isNull(usersTable.deletedAt)))
      : await this.db.select().from(usersTable).where(and(eq(usersTable.phone, identifier), isNull(usersTable.deletedAt)));
    if (!user) throw new BadRequestException("بيانات غير صحيحة");

    const target = isEmail ? user.email : (user.phone || identifier);
    const ok = await this.twilio.check(target, code, channel);
    if (!ok) throw new BadRequestException("رمز التحقق غير صحيح أو منتهي الصلاحية");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.db.update(usersTable)
      .set({
        passwordHash,
        failedLoginAttempts: 0,
        tokenVersion: sql`${usersTable.tokenVersion} + 1`,
      })
      .where(eq(usersTable.id, user.id));

    return { success: true, message: "تم إعادة تعيين كلمة المرور بنجاح. سجّل الدخول مجدداً." };
  }

  /* ── Tenant: phone OTP login ── */
  async tenantRequestOtp(input: { phone: string; channel?: "sms" | "call" | "whatsapp" }) {
    const raw = (input.phone || "").trim();
    if (!raw) throw new BadRequestException("رقم الجوال مطلوب");
    const phone = this.twilio.normalizePhone(raw);
    const [tenant] = await this.db.select().from(tenantsTable).where(eq(tenantsTable.phone, phone));
    if (!tenant || tenant.status !== "active") {
      // Don't disclose whether the tenant exists; respond generic.
      return { success: true, message: "إذا كان الرقم مسجّلاً، فقد أرسلنا رمز التحقق." };
    }
    await this.twilio.start(phone, input.channel || "sms");
    return { success: true, message: "تم إرسال رمز التحقق إلى جوالك." };
  }

  async tenantVerifyOtp(input: { phone: string; code: string; channel?: "sms" | "call" | "whatsapp" }, ctx: { ip: string; ua?: string }) {
    const raw = (input.phone || "").trim();
    const code = (input.code || "").trim();
    if (!raw || !code) throw new BadRequestException("رقم الجوال والرمز مطلوبان");
    const phone = this.twilio.normalizePhone(raw);

    const [tenant] = await this.db.select().from(tenantsTable).where(eq(tenantsTable.phone, phone));
    if (!tenant || tenant.status !== "active") {
      await this.recordLogin(null, phone, "failed", ctx.ip, ctx.ua);
      throw new UnauthorizedException("بيانات غير صحيحة");
    }

    const ok = await this.twilio.check(phone, code, input.channel || "sms");
    if (!ok) {
      await this.recordLogin(null, phone, "failed", ctx.ip, ctx.ua);
      throw new UnauthorizedException("رمز التحقق غير صحيح");
    }

    await this.db.update(tenantsTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(tenantsTable.id, tenant.id));

    await this.recordLogin(null, phone, "success", ctx.ip, ctx.ua);

    const token = this.signTenantToken({ id: tenant.id, phone: tenant.phone || phone, tokenVersion: tenant.tokenVersion ?? 0 });
    return {
      token,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        phone: tenant.phone,
        email: tenant.email,
        type: tenant.type,
        status: tenant.status,
        nationality: tenant.nationality,
      },
    };
  }

  async tenantMe(tenantId: number) {
    const [tenant] = await this.db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
    if (!tenant) throw new NotFoundException("Tenant not found");
    return {
      id: tenant.id,
      name: tenant.name,
      phone: tenant.phone,
      email: tenant.email,
      type: tenant.type,
      status: tenant.status,
      nationality: tenant.nationality,
      address: tenant.address,
      lastLoginAt: tenant.lastLoginAt,
    };
  }

  async tenantLogout(tenantId: number) {
    await this.db.update(tenantsTable)
      .set({ tokenVersion: sql`${tenantsTable.tokenVersion} + 1` })
      .where(eq(tenantsTable.id, tenantId));
    return { success: true, message: "تم تسجيل الخروج." };
  }
}
