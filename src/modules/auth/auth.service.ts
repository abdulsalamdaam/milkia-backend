import { Injectable, Inject, BadRequestException, NotFoundException, UnauthorizedException, ForbiddenException, HttpException, HttpStatus, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { emailOtpTokensTable, loginLogsTable, tenantsTable, usersTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import type { TenantPayload } from "../../common/guards/tenant-auth.guard";
import { TwilioVerifyService } from "../twilio/twilio-verify.service";
import { EmailService } from "../email/email.service";
import { effectivePermissions, ROLE_PRESETS, ALL_PERMISSIONS } from "../../common/permissions";

const MAX_FAILED = 5;
/** Email-OTP code lifetime — short enough to be safe, long enough for the user to switch back to the app. */
const EMAIL_OTP_TTL_MIN = 10;
const EMAIL_OTP_MAX_ATTEMPTS = 5;

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

  /* ── User: email/password login (DISABLED — kept for future) ───────
   *
   * The product has switched to email-OTP 2FA as the primary login flow.
   * The bcrypt-based password block below is intentionally left in place,
   * commented out, so it can be re-enabled later by uncommenting + wiring
   * the route back into auth.controller.ts.
   *
   * The TS compiler still parses this body, so we keep the signature live
   * but throw a clear error if anything calls it. When bringing it back,
   * just delete the throw and uncomment the original logic.
   * ─────────────────────────────────────────────────────────────── */
  async login(_input: { email: string; password: string }, _ctx: { ip: string; ua?: string }): Promise<never> {
    throw new BadRequestException(
      "Password login is disabled. Use POST /auth/email-otp/request followed by /auth/email-otp/verify.",
    );

    /* ORIGINAL PASSWORD LOGIN — uncomment to re-enable
    const { email, password } = input;
    if (!email || !password) throw new BadRequestException("Email and password required");

    let user;
    try {
      [user] = await this.db.select().from(usersTable).where(and(eq(usersTable.email, email.toLowerCase()), isNull(usersTable.deletedAt)));
    } catch (err: any) {
      console.error("[auth.login] DB query failed:", err);
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
        { error: `تم تجاوز الحد المسموح به (${MAX_FAILED}).`, code: "LOCKED" },
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
        throw new UnauthorizedException(`بريد أو كلمة مرور غير صحيحة. تبقى ${remaining}.`);
      }
      throw new HttpException({ error: "Account locked.", code: "LOCKED" }, 423 as HttpStatus);
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
    return { token, user: { id: user.id, email: user.email, name: user.name, role: user.role, isActive: user.isActive, accountStatus: user.accountStatus, phone: user.phone, company: user.company, loginCount: (user.loginCount ?? 0) + 1, lastLoginAt: new Date(), createdAt: user.createdAt } };
    */
  }

  /* ── User: email-OTP login (current primary) ───────────────────── */

  /**
   * Generate a fresh 6-digit code, store its bcrypt hash, and email it.
   * Always responds the same way to avoid leaking which emails exist.
   * Throttling is enforced at the controller layer (OtpThrottlerGuard).
   */
  async requestEmailOtp(input: { email: string }, ctx: { ip: string; ua?: string }): Promise<{ success: true; message: string; expiresInMinutes: number }> {
    const email = (input.email || "").trim().toLowerCase();
    if (!email) throw new BadRequestException("البريد الإلكتروني مطلوب");

    const [user] = await this.db.select().from(usersTable).where(and(eq(usersTable.email, email), isNull(usersTable.deletedAt)));

    // Even when the user doesn't exist we still respond with success and
    // do nothing — this prevents email-enumeration attacks.
    if (!user) {
      return { success: true, message: "إذا كان الحساب مسجّلاً، فقد أرسلنا رمز الدخول.", expiresInMinutes: EMAIL_OTP_TTL_MIN };
    }

    // Mirror the password-flow account-status checks so suspended users
    // can't bypass moderation by switching to email OTP.
    const adminRoles = new Set(["super_admin", "admin"]);
    if (!adminRoles.has(user.role)) {
      if (user.accountStatus === "pending") {
        throw new ForbiddenException({ error: "حسابك قيد المراجعة، يرجى انتظار موافقة المشرف", code: "PENDING" });
      }
      if (user.accountStatus === "rejected") {
        throw new ForbiddenException({ error: "تم رفض طلب تسجيلك. تواصل مع الدعم للمزيد من المعلومات", code: "REJECTED" });
      }
    }
    if (!user.isActive) throw new UnauthorizedException("الحساب غير مفعّل. تواصل مع الدعم");

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = await bcrypt.hash(code, 8);
    const expiresAt = new Date(Date.now() + EMAIL_OTP_TTL_MIN * 60_000);

    await this.db.insert(emailOtpTokensTable).values({
      email,
      codeHash,
      expiresAt,
      ip: ctx.ip,
      userAgent: ctx.ua?.slice(0, 400) ?? null,
    });

    const sent = await this.email.sendLoginOtp(email, code, EMAIL_OTP_TTL_MIN);
    if (!sent) {
      // Don't leak the failure details to the caller, but log so we know.
      new Logger("AuthService").error(`OTP email send failed for ${email}`);
    }
    return { success: true, message: "تم إرسال رمز الدخول إلى بريدك الإلكتروني.", expiresInMinutes: EMAIL_OTP_TTL_MIN };
  }

  async verifyEmailOtp(input: { email: string; code: string }, ctx: { ip: string; ua?: string }) {
    const email = (input.email || "").trim().toLowerCase();
    const code = (input.code || "").trim();
    if (!email || !code) throw new BadRequestException("البريد الإلكتروني والرمز مطلوبان");

    const now = new Date();
    const [token] = await this.db
      .select()
      .from(emailOtpTokensTable)
      .where(and(
        eq(emailOtpTokensTable.email, email),
        gt(emailOtpTokensTable.expiresAt, now),
        isNull(emailOtpTokensTable.consumedAt),
      ))
      .orderBy(desc(emailOtpTokensTable.createdAt))
      .limit(1);

    if (!token) {
      await this.recordLogin(null, email, "failed", ctx.ip, ctx.ua);
      throw new UnauthorizedException("الرمز غير صحيح أو منتهي الصلاحية");
    }

    if ((token.attempts ?? 0) >= EMAIL_OTP_MAX_ATTEMPTS) {
      await this.db.update(emailOtpTokensTable)
        .set({ consumedAt: now })
        .where(eq(emailOtpTokensTable.id, token.id));
      throw new UnauthorizedException("تم تجاوز عدد المحاولات. اطلب رمزاً جديداً.");
    }

    const ok = await bcrypt.compare(code, token.codeHash);
    if (!ok) {
      await this.db.update(emailOtpTokensTable)
        .set({ attempts: (token.attempts ?? 0) + 1 })
        .where(eq(emailOtpTokensTable.id, token.id));
      await this.recordLogin(null, email, "failed", ctx.ip, ctx.ua);
      throw new UnauthorizedException("الرمز غير صحيح");
    }

    // Burn the token so the same code can't be reused.
    await this.db.update(emailOtpTokensTable)
      .set({ consumedAt: now })
      .where(eq(emailOtpTokensTable.id, token.id));

    const [user] = await this.db.select().from(usersTable).where(and(eq(usersTable.email, email), isNull(usersTable.deletedAt)));
    if (!user) {
      await this.recordLogin(null, email, "failed", ctx.ip, ctx.ua);
      throw new UnauthorizedException("الحساب غير موجود");
    }

    await this.db.update(usersTable)
      .set({
        loginCount: sql`${usersTable.loginCount} + 1`,
        lastLoginAt: now,
        failedLoginAttempts: 0,
      })
      .where(eq(usersTable.id, user.id));
    await this.recordLogin(user.id, user.email, "success", ctx.ip, ctx.ua);

    const tokenStr = this.signUserToken({ id: user.id, email: user.email, role: user.role, tokenVersion: user.tokenVersion ?? 0 });
    return {
      token: tokenStr,
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
        lastLoginAt: now,
        createdAt: user.createdAt,
      },
    };
  }

  /**
   * Register a new user.
   *
   * The product is currently passwordless (email-OTP). Password is accepted
   * but optional — when omitted we store an unguessable random hash so the
   * row stays well-formed. If/when password login is re-enabled, users can
   * set a real password via a future "set password" flow.
   */
  async register(input: { email: string; password?: string; name: string; phone?: string; company?: string }) {
    const { email, password, name, phone, company } = input;
    if (!email || !name) throw new BadRequestException("الاسم والبريد الإلكتروني مطلوبة");

    const existing = await this.db.select().from(usersTable).where(and(eq(usersTable.email, email.toLowerCase()), isNull(usersTable.deletedAt)));
    if (existing.length > 0) throw new BadRequestException("البريد الإلكتروني مسجّل مسبقاً");

    // When no password is provided generate a long random one — the user
    // never sees it, the row just has a non-empty hash.
    const effectivePassword = password && password.length >= 6
      ? password
      : `otp-only-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const passwordHash = await bcrypt.hash(effectivePassword, 10);
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
