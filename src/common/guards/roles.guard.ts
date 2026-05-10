import { CanActivate, ExecutionContext, ForbiddenException, Injectable, mixin, Type } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "./jwt-auth.guard";

export function RolesGuard(...allowed: Array<AuthUser["role"]>): Type<CanActivate> {
  @Injectable()
  class MixinRoles implements CanActivate {
    canActivate(ctx: ExecutionContext): boolean {
      const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
      if (!req.user) throw new ForbiddenException("Forbidden");
      if (!allowed.includes(req.user.role)) throw new ForbiddenException("Forbidden");
      return true;
    }
  }
  return mixin(MixinRoles);
}

export const AdminGuard = RolesGuard("admin", "super_admin");
export const SuperAdminGuard = RolesGuard("super_admin");
