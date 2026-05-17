import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { eq, and, asc, isNotNull, isNull } from "drizzle-orm";
import { rolesTable, usersTable, type User } from "@oqudk/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";

type Public = Omit<User, "passwordHash">;

function strip(u: User): Public {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

/**
 * Team management.
 *
 * The legacy approach stored a copy of the role permissions on each user
 * row (`users.permissions`). Now every user is linked to a `roles` row by
 * `role_id` and the role row is the source of truth for permissions +
 * label. To grant an employee a different permission set, point them at a
 * different role.
 *
 * The five built-in employee presets (general / accountant / propertyManager
 * / collector / assistant) are seeded as system roles by the boot migration
 * — `rolePresets()` reads them straight from the DB so adding a new preset
 * is a one-line SQL change.
 */
@Injectable()
export class TeamService {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  /** Block employees from inviting other employees. Only landlords/admins can. */
  private assertCanManageTeam(actor: User) {
    if (actor.ownerUserId) {
      throw new ForbiddenException("Employees cannot manage team members");
    }
  }

  private async resolveRoleId(presetKey: string | undefined | null, fallbackKey = "user"): Promise<number | null> {
    const key = presetKey?.trim() || fallbackKey;
    const [r] = await this.db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(and(eq(rolesTable.key, key), isNull(rolesTable.companyId)))
      .limit(1);
    return r?.id ?? null;
  }

  async listEmployees(actorId: number) {
    const [actor] = await this.db.select().from(usersTable).where(eq(usersTable.id, actorId));
    if (!actor) throw new NotFoundException("Actor not found");
    this.assertCanManageTeam(actor);

    // Join the role so the UI gets the live role key, label and the
    // effective permission list (permissions live on the role row).
    return this.db
      .select({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        phone: usersTable.phone,
        isActive: usersTable.isActive,
        accountStatus: usersTable.accountStatus,
        ownerUserId: usersTable.ownerUserId,
        roleId: usersTable.roleId,
        lastLoginAt: usersTable.lastLoginAt,
        createdAt: usersTable.createdAt,
        role: rolesTable.key,
        roleLabel: rolesTable.labelAr,
        permissions: rolesTable.permissions,
      })
      .from(usersTable)
      .leftJoin(rolesTable, eq(usersTable.roleId, rolesTable.id))
      .where(and(
        eq(usersTable.ownerUserId, actorId),
        isNotNull(usersTable.ownerUserId),
        isNull(usersTable.deletedAt),
      ));
  }

  async createEmployee(
    actorId: number,
    input: { name: string; email: string; phone?: string; password: string; preset?: string },
  ): Promise<Public> {
    const [actor] = await this.db.select().from(usersTable).where(eq(usersTable.id, actorId));
    if (!actor) throw new NotFoundException("Actor not found");
    this.assertCanManageTeam(actor);

    const email = input.email.trim().toLowerCase();
    if (!email || !input.password || input.password.length < 6) {
      throw new BadRequestException("Email and a password of at least 6 characters are required");
    }
    const existing = await this.db.select().from(usersTable).where(and(eq(usersTable.email, email), isNull(usersTable.deletedAt)));
    if (existing.length) throw new ConflictException("A user with this email already exists");

    const roleId = await this.resolveRoleId(input.preset);
    if (!roleId) throw new BadRequestException(`Unknown role preset: ${input.preset}`);

    const passwordHash = await bcrypt.hash(input.password, 10);
    const [created] = await this.db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        name: input.name.trim() || email.split("@")[0]!,
        isActive: true,
        accountStatus: "active",
        phone: input.phone?.trim() || null,
        ownerUserId: actorId,
        // Inherit the owning user's company so employees see the same data scope.
        companyId: actor.companyId ?? null,
        roleId,
      })
      .returning();
    return strip(created!);
  }

  async updateEmployee(
    actorId: number,
    employeeId: number,
    patch: { name?: string; phone?: string; preset?: string; isActive?: boolean },
  ): Promise<Public> {
    const [actor] = await this.db.select().from(usersTable).where(eq(usersTable.id, actorId));
    if (!actor) throw new NotFoundException("Actor not found");
    this.assertCanManageTeam(actor);

    const [emp] = await this.db.select().from(usersTable).where(eq(usersTable.id, employeeId));
    if (!emp || emp.ownerUserId !== actorId) throw new NotFoundException("Employee not found");

    const updates: Partial<typeof usersTable.$inferInsert> = {};
    if (patch.name !== undefined) updates.name = patch.name;
    if (patch.phone !== undefined) updates.phone = patch.phone || null;
    if (patch.isActive !== undefined) updates.isActive = patch.isActive;
    if (patch.preset !== undefined) {
      const roleId = await this.resolveRoleId(patch.preset);
      if (!roleId) throw new BadRequestException(`Unknown role preset: ${patch.preset}`);
      updates.roleId = roleId;
    }

    const [updated] = await this.db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, employeeId))
      .returning();
    return strip(updated!);
  }

  /**
   * Set an employee's exact permission list. Permissions live on `roles`,
   * so this maintains a dedicated company-scoped role per employee
   * (`emp_custom_<id>`) and points the employee at it — letting an owner
   * grant or remove individual permissions without touching the shared
   * preset roles.
   */
  async updateEmployeePermissions(actorId: number, employeeId: number, permissions: string[]): Promise<Public> {
    const [actor] = await this.db.select().from(usersTable).where(eq(usersTable.id, actorId));
    if (!actor) throw new NotFoundException("Actor not found");
    this.assertCanManageTeam(actor);

    const [emp] = await this.db.select().from(usersTable).where(eq(usersTable.id, employeeId));
    if (!emp || emp.ownerUserId !== actorId) throw new NotFoundException("Employee not found");

    const clean = Array.from(new Set((permissions || []).filter((p) => typeof p === "string" && p.trim())));
    const key = `emp_custom_${employeeId}`;
    const companyId = actor.companyId ?? null;

    const [existingRole] = await this.db
      .select()
      .from(rolesTable)
      .where(and(
        eq(rolesTable.key, key),
        companyId == null ? isNull(rolesTable.companyId) : eq(rolesTable.companyId, companyId),
      ))
      .limit(1);

    let roleId: number;
    if (existingRole) {
      await this.db.update(rolesTable).set({ permissions: clean }).where(eq(rolesTable.id, existingRole.id));
      roleId = existingRole.id;
    } else {
      const [created] = await this.db
        .insert(rolesTable)
        .values({ key, labelAr: "صلاحيات مخصصة", labelEn: "Custom permissions", permissions: clean, isSystem: false, companyId })
        .returning();
      roleId = created!.id;
    }

    const [updated] = await this.db.update(usersTable).set({ roleId }).where(eq(usersTable.id, employeeId)).returning();
    return strip(updated!);
  }

  async resetEmployeePassword(actorId: number, employeeId: number, newPassword: string): Promise<{ ok: true }> {
    if (!newPassword || newPassword.length < 6) {
      throw new BadRequestException("Password must be at least 6 characters");
    }
    const [actor] = await this.db.select().from(usersTable).where(eq(usersTable.id, actorId));
    if (!actor) throw new NotFoundException("Actor not found");
    this.assertCanManageTeam(actor);

    const [emp] = await this.db.select().from(usersTable).where(eq(usersTable.id, employeeId));
    if (!emp || emp.ownerUserId !== actorId) throw new NotFoundException("Employee not found");

    const passwordHash = await bcrypt.hash(newPassword, 10);
    // Bumping tokenVersion invalidates any active session — the employee will
    // be forced to log in again with the new password.
    await this.db
      .update(usersTable)
      .set({ passwordHash, tokenVersion: (emp.tokenVersion ?? 0) + 1, failedLoginAttempts: 0 })
      .where(eq(usersTable.id, employeeId));
    return { ok: true };
  }

  async deleteEmployee(actorId: number, employeeId: number): Promise<{ ok: true }> {
    const [actor] = await this.db.select().from(usersTable).where(eq(usersTable.id, actorId));
    if (!actor) throw new NotFoundException("Actor not found");
    this.assertCanManageTeam(actor);

    const [emp] = await this.db.select().from(usersTable).where(and(eq(usersTable.id, employeeId), isNull(usersTable.deletedAt)));
    if (!emp || emp.ownerUserId !== actorId) throw new NotFoundException("Employee not found");

    // Soft delete and bump tokenVersion to invalidate any active session.
    await this.db.update(usersTable)
      .set({ deletedAt: new Date(), isActive: false, tokenVersion: (emp.tokenVersion ?? 0) + 1 })
      .where(eq(usersTable.id, employeeId));
    return { ok: true };
  }

  /** Returns the seeded employee-preset roles for the team UI dropdown. */
  async rolePresets() {
    const employeePresetKeys = ["general", "accountant", "propertyManager", "collector", "assistant"];
    const rows = await this.db
      .select({
        id: rolesTable.key,
        labelAr: rolesTable.labelAr,
        labelEn: rolesTable.labelEn,
        permissions: rolesTable.permissions,
      })
      .from(rolesTable)
      .where(and(isNull(rolesTable.companyId)))
      .orderBy(asc(rolesTable.id));
    return rows.filter((r) => employeePresetKeys.includes(r.id));
  }
}
