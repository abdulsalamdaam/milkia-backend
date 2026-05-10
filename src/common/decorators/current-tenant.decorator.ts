import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { TenantPayload } from "../guards/tenant-auth.guard";

export const CurrentTenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantPayload => {
    const req = ctx.switchToHttp().getRequest<Request & { tenant?: TenantPayload }>();
    return req.tenant!;
  },
);
