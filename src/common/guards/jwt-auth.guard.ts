import { Injectable, CanActivate, ExecutionContext, Inject, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { JwtService } from "@nestjs/jwt";
import { and, eq, isNull } from "drizzle-orm";
import { usersTable } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";

export type AuthUser = {
  id: number;
  email: string;
  role: "super_admin" | "admin" | "user" | "demo";
  kind?: "user";
  tv?: number;
  /** Populated by JwtAuthGuard from the DB at request time, NOT from the token. */
  permissions?: string[] | null;
  ownerUserId?: number | null;
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

    const [user] = await this.db
      .select({
        id: usersTable.id,
        tokenVersion: usersTable.tokenVersion,
        isActive: usersTable.isActive,
        permissions: usersTable.permissions,
        ownerUserId: usersTable.ownerUserId,
        role: usersTable.role,
      })
      .from(usersTable)
      .where(and(eq(usersTable.id, decoded.id), isNull(usersTable.deletedAt)));
    if (!user) throw new UnauthorizedException("User not found");
    if (!user.isActive) throw new UnauthorizedException("Account disabled");
    if ((decoded.tv ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException("Session revoked. Please log in again.");
    }
    // Attach freshly loaded permissions + role + owner-scope to req.user so
    // downstream guards (PermissionsGuard) and controllers can use them.
    req.user = {
      ...decoded,
      role: user.role as AuthUser["role"],
      permissions: user.permissions ?? null,
      ownerUserId: user.ownerUserId ?? null,
    };
    return true;
  }
}
