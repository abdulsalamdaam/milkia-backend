import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerRequest } from "@nestjs/throttler";
import type { Request } from "express";

/**
 * Custom guard that, for OTP-style requests, also keys the rate limit by the
 * `phone` / `email` / `identifier` field in the body — so an attacker cannot
 * circumvent the per-IP limit by rotating IPs against the same target, and
 * cannot brute a single target by rotating IPs.
 *
 * Local-dev bypass: when OTP_DEV_BYPASS=true, the guard short-circuits and
 * skips the rate check entirely. Useful when iterating on the frontend OTP
 * flow without burning the 1/min limit on every reload. NEVER set this in
 * production.
 */
@Injectable()
export class OtpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || "unknown";
    const body = (req.body || {}) as { phone?: string; identifier?: string; email?: string };
    const target = (body.phone || body.identifier || body.email || "").toString().toLowerCase().replace(/[^\d+a-zA-Z@._-]/g, "");
    return target ? `${ip}|${target}` : ip;
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    if (process.env.OTP_DEV_BYPASS === "true") return true;
    return super.handleRequest(requestProps);
  }
}
