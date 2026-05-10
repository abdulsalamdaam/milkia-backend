import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { effectivePermissions, ROLE_PRESETS, type Permission } from "./permissions";

const PERMISSIONS_META = "milkia:required-permissions";

/**
 * Mark a controller or handler as requiring one or more permission keys.
 * Use alongside JwtAuthGuard. Example:
 *
 *   @UseGuards(JwtAuthGuard, PermissionsGuard)
 *   @RequirePermissions("properties.write")
 *   @Post()
 *   create(...) { ... }
 *
 * super_admin and admin always pass — they have ALL_PERMISSIONS via ROLE_PRESETS.
 */
export const RequirePermissions = (...perms: Permission[]) =>
  SetMetadata(PERMISSIONS_META, perms);

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMISSIONS_META, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<{ user?: { id: number; role?: string; permissions?: string[] | null } }>();
    const user = req.user;
    if (!user) throw new ForbiddenException("Authentication required");

    const role = (user.role ?? "user") as keyof typeof ROLE_PRESETS;
    const granted = effectivePermissions(role, user.permissions ?? null);
    const missing = required.filter((p) => !granted.includes(p));
    if (missing.length) {
      throw new ForbiddenException(`Missing permissions: ${missing.join(", ")}`);
    }
    return true;
  }
}
