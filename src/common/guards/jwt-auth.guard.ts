import { Injectable, CanActivate, ExecutionContext, Inject, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { JwtService } from "@nestjs/jwt";
import { and, eq, isNull } from "drizzle-orm";
import { rolesTable, usersTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";

/**
 * `role` is the role *key* string (e.g. "super_admin", "admin", "user",
 * "demo", "accountant") sourced from the joined `roles` row. The four
 * system role keys still appear here, but custom company-scoped roles can
 * use any string key — RolesGuard / SuperAdminGuard / AdminGuard only
 * recognize the system tier keys.
 *
 * `permissions` is sourced from `roles.permissions` at request time so a
 * permission change to a role takes effect on the next request, no
 * re-login required.
 */
export type AuthUser = {
  id: number;
  email: string;
  role: string;
  kind?: "user";
  tv?: number;
  permissions?: string[] | null;
  ownerUserId?: number | null;
  companyId?: number | null;
  roleId?: number | null;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    @Inject(DRIZZLE) private readonly db: Drizzle,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw new UnauthorizedException("Unauthorized");
    const token = header.slice(7);
    let decoded: AuthUser;
    try {
      decoded = this.jwt.verify<AuthUser>(token);
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
    if (decoded.kind && decoded.kind !== "user") throw new UnauthorizedException("Invalid token kind");

    // Single round-trip: user row + linked role row. Role key + permissions
    // come exclusively from the roles table — there is no longer a per-user
    // permission override.
    const [row] = await this.db
      .select({
        id: usersTable.id,
        tokenVersion: usersTable.tokenVersion,
        isActive: usersTable.isActive,
        ownerUserId: usersTable.ownerUserId,
        companyId: usersTable.companyId,
        roleId: usersTable.roleId,
        roleKey: rolesTable.key,
        rolePermissions: rolesTable.permissions,
      })
      .from(usersTable)
      .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
      .where(and(eq(usersTable.id, decoded.id), isNull(usersTable.deletedAt)));
    if (!row) throw new UnauthorizedException("User not found");
    if (!row.isActive) throw new UnauthorizedException("Account disabled");
    if ((decoded.tv ?? 0) !== (row.tokenVersion ?? 0)) {
      throw new UnauthorizedException("Session revoked. Please log in again.");
    }
    req.user = {
      ...decoded,
      role: row.roleKey ?? "user",
      permissions: row.rolePermissions ?? [],
      ownerUserId: row.ownerUserId ?? null,
      companyId: row.companyId ?? null,
      roleId: row.roleId ?? null,
    };
    return true;
  }
}
