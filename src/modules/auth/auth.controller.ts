import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import { TenantAuthGuard } from "../../common/guards/tenant-auth.guard";
import { OtpThrottlerGuard } from "../../common/throttler";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CurrentTenant } from "../../common/decorators/current-tenant.decorator";
import type { AuthUser } from "../../common/guards/jwt-auth.guard";
import type { TenantPayload } from "../../common/guards/tenant-auth.guard";
import {
  LoginDto,
  RegisterDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  TenantOtpStartDto,
  TenantOtpVerifyDto,
  EmailOtpRequestDto,
  EmailOtpVerifyDto,
} from "./auth.dto";

function clientCtx(req: Request) {
  const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
    || req.socket?.remoteAddress
    || "unknown";
  const ua = req.headers["user-agent"] as string | undefined;
  return { ip, ua };
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /* ── User: password login (DISABLED, kept for re-enable) ──────── */
  // Hits AuthService.login which currently throws — the route stays mounted
  // so a frontend that hasn't migrated yet receives a clear 400 instead of
  // a silent 404. To re-enable: uncomment the body in AuthService.login.
  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseGuards(OtpThrottlerGuard)
  login(@Body() body: LoginDto, @Req() req: Request) {
    return this.auth.login(body, clientCtx(req));
  }

  /* ── User: email-OTP login (current primary) ──────────────────── */
  // Send a 6-digit code to the user's email. 1/min and 5/hour per (IP+email).
  @Post("email-otp/request")
  @HttpCode(200)
  @Throttle({
    short: { limit: 1, ttl: 60_000 },
    long:  { limit: 5, ttl: 3600_000 },
  })
  @UseGuards(OtpThrottlerGuard)
  emailOtpRequest(@Body() body: EmailOtpRequestDto, @Req() req: Request) {
    return this.auth.requestEmailOtp(body, clientCtx(req));
  }

  // Verify the code and issue a JWT. 5 attempts per 5 min per (IP+email).
  @Post("email-otp/verify")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @UseGuards(OtpThrottlerGuard)
  emailOtpVerify(@Body() body: EmailOtpVerifyDto, @Req() req: Request) {
    return this.auth.verifyEmailOtp(body, clientCtx(req));
  }

  // Registration is cheap but still rate-limited per IP.
  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 3600_000 } })
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Get("me")
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.id);
  }

  /** Effective permission keys for the logged-in user. */
  @Get("me/permissions")
  @UseGuards(JwtAuthGuard)
  myPermissions(@CurrentUser() user: AuthUser) {
    return this.auth.permissionsForUser(user.id);
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: AuthUser) {
    return this.auth.logoutUser(user.id);
  }

  /* ── User: forgot/reset password (OTP-based) ── */
  // OTP-send endpoints: 1 per minute and 5 per hour per (IP + identifier).
  @Post("forgot-password")
  @HttpCode(200)
  @Throttle({
    short: { limit: 1, ttl: 60_000 },
    long:  { limit: 5, ttl: 3600_000 },
  })
  @UseGuards(OtpThrottlerGuard)
  forgotPassword(@Body() body: ForgotPasswordDto) {
    return this.auth.forgotPassword(body);
  }

  // OTP-check: 5 attempts per 5 min per (IP + identifier) — brute-force shield.
  @Post("reset-password")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @UseGuards(OtpThrottlerGuard)
  resetPassword(@Body() body: ResetPasswordDto) {
    return this.auth.resetPassword(body);
  }

  /* ── Tenant: phone OTP login ── */
  // OTP-send (Twilio cost) — 1 per minute and 5 per hour per (IP + phone).
  @Post("tenant/request-otp")
  @HttpCode(200)
  @Throttle({
    short: { limit: 1, ttl: 60_000 },
    long:  { limit: 5, ttl: 3600_000 },
  })
  @UseGuards(OtpThrottlerGuard)
  tenantRequestOtp(@Body() body: TenantOtpStartDto) {
    return this.auth.tenantRequestOtp(body);
  }

  // OTP-check — 5 attempts per 5 min per (IP + phone).
  @Post("tenant/verify-otp")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  @UseGuards(OtpThrottlerGuard)
  tenantVerifyOtp(@Body() body: TenantOtpVerifyDto, @Req() req: Request) {
    return this.auth.tenantVerifyOtp(body, clientCtx(req));
  }

  @Get("tenant/me")
  @UseGuards(TenantAuthGuard)
  tenantMe(@CurrentTenant() tenant: TenantPayload) {
    return this.auth.tenantMe(tenant.id);
  }

  @Post("tenant/logout")
  @HttpCode(200)
  @UseGuards(TenantAuthGuard)
  tenantLogout(@CurrentTenant() tenant: TenantPayload) {
    return this.auth.tenantLogout(tenant.id);
  }
}
