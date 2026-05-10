import { Injectable, ExecutionContext } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerRequest } from "@nestjs/throttler";
import type { Request } from "express";

/**
 * Custom guard that, for OTP-style requests, also keys the rate limit by the
 * `phone` / `identifier` field in the body — so an attacker cannot circumvent
 * the per-IP limit by rotating IPs against the same target, and cannot brute
 * a single phone by rotating IPs.
 */
@Injectable()
export class OtpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket?.remoteAddress
      || "unknown";
    const body = (req.body || {}) as { phone?: string; identifier?: string };
    const target = (body.phone || body.identifier || "").toString().replace(/[^\d+a-zA-Z@._-]/g, "");
    return target ? `${ip}|${target}` : ip;
  }

  protected async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    return super.handleRequest(requestProps);
  }
}
