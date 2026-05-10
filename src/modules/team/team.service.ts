import {
  Inject,
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import { eq, and, isNotNull, isNull } from "drizzle-orm";
import { usersTable, type User } from "@milkia/database";
import { DRIZZLE, type Drizzle } from "../../database/database.module";
import { EMPLOYEE_PRESETS, type Permission } from "../../common/permissions";

type Public = Omit<User, "passwordHash">;

function strip(u: User): Public {
  const { passwordHash: _ph, ...rest } = u;
  return rest;
}

@Injectable()
export class TeamService {
  constructor(@Inject(DRIZZLE) private readonly db: Drizzle) {}

  /** Block employees from inviting other employees. Only landlords/admins can. */
  private assertCanManageTeam(actor: User) {
    if (actor.ownerUserId) {
      throw new ForbiddenException("Employees cannot manage team members");
    }
  }

  async listEmployees(actorId: number): Promise<Public[]> {
    const [actor] = await this.db.select().from(usersTable).where(eq(usersTable.id, actorId));
    if (!actor) throw new NotFoundException("Actor not found");
    this.assertCanManageTeam(actor);

    const rows = await this.db
      .select()
      .from(usersTable)
      .where(and(
        eq(usersTable.ownerUserId, actorId),
        isNotNull(usersTable.ownerUserId),
        isNull(usersTable.deletedAt),
      ));
    return rows.map(strip);
  }

  async createEmployee(
    actorId: number,
    input: { name: string; email: string; phone?: string; password: string; preset?: string; permissions?: string[]; roleLabel?: string },
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

    let permissions: Permission[] | null = null;
    let roleLabel = input.roleLabel ?? null;
    if (input.preset && EMPLOYEE_PRESETS[input.preset]) {
      const preset = EMPLOYEE_PRESETS[input.preset];
      permissions = preset.permissions;
      if (!roleLabel) roleLabel = preset.labelAr;
    }
    if (input.permissions && Array.isArray(input.permissions)) {
      permissions = input.permissions as Permission[];
    }

    const passwordHash = await bcrypt.hash(input.password, 10);
    const [created] = await this.db
      .insert(usersTable)
      .values({
        email,
        passwordHash,
        name: input.name.trim() || email.split("@")[0]!,
        role: "user",
        isActive: true,
        accountStatus: "active",
        phone: input.phone?.trim() || null,
        ownerUserId: actorId,
        permissions,
        roleLabel,
      })
      .returning();
    return strip(created!);
  }

  async updateEmployee(
    actorId: number,
    employeeId: number,
    patch: { name?: string; phone?: string; preset?: string; permissions?: string[]; roleLabel?: string; isActive?: boolean },
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
    if (patch.roleLabel !== undefined) updates.roleLabel = patch.roleLabel || null;
    if (patch.preset && EMPLOYEE_PRESETS[patch.preset]) {
      const preset = EMPLOYEE_PRESETS[patch.preset];
      updates.permissions = preset.permissions;
      if (patch.roleLabel === undefined) updates.roleLabel = preset.labelAr;
    }
    if (patch.permissions !== undefined) updates.permissions = patch.permissions as Permission[];

    const [updated] = await this.db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, employeeId))
      .returning();
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

  rolePresets() {
    return Object.entries(EMPLOYEE_PRESETS).map(([id, def]) => ({
      id,
      labelAr: def.labelAr,
      labelEn: def.labelEn,
      permissions: def.permissions,
    }));
  }
}
