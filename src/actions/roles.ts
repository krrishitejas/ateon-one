'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';
import { ROLES, MODULE_LABELS, DEFAULT_RANKS, type RoleConfig } from '@/data/roles';

/** Roles allowed to reshape the org's role model. */
const ROLE_ADMIN_ROLES = ['ceo', 'admin'];

/** Roles that ship with the product and can't be deleted (they can be edited). */
const SYSTEM_ROLE_KEYS = Object.keys(ROLES);

export type StoredRole = RoleConfig & {
  rank: number;
  isSystem: boolean;
};

function rowToRole(row: any): StoredRole {
  let modules: string[] = [];
  try {
    const parsed = JSON.parse(row.modules);
    if (Array.isArray(parsed)) modules = parsed.filter((m) => typeof m === 'string');
  } catch {
    modules = [];
  }
  return {
    id: row.key,
    label: row.label,
    description: row.description ?? '',
    color: row.color ?? '#94A3B8',
    modules,
    rank: Number(row.rank ?? 100),
    isSystem: Boolean(row.isSystem),
  };
}

/**
 * Copy the built-in roles into the database the first time we're asked for them.
 * After that the DB is authoritative and the static table is only a fallback.
 */
async function seedRolesIfEmpty() {
  const count = await prisma.role.count({});
  if (count > 0) return;

  for (const [key, cfg] of Object.entries(ROLES)) {
    await prisma.role.create({
      data: {
        key,
        label: cfg.label,
        description: cfg.description,
        color: cfg.color,
        modules: JSON.stringify(cfg.modules),
        rank: DEFAULT_RANKS[key] ?? 100,
        isSystem: true,
      },
    });
  }
}

export async function listRoles(): Promise<StoredRole[]> {
  await requireSession();
  try {
    await seedRolesIfEmpty();
    const rows = await prisma.role.findMany({ orderBy: { rank: 'asc' } });
    if (rows.length > 0) return rows.map(rowToRole);
  } catch (e) {
    console.error('listRoles failed, falling back to built-in roles:', e);
  }
  // Fallback keeps the app navigable even if the Role table is unavailable.
  return Object.entries(ROLES).map(([key, cfg]) => ({
    ...cfg,
    id: key,
    rank: DEFAULT_RANKS[key] ?? 100,
    isSystem: true,
  }));
}

/**
 * Modules the signed-in user may see, resolved live from the DB so role edits
 * apply on next navigation rather than next login.
 */
export async function getMyModules(): Promise<string[]> {
  const user = await requireSession();
  try {
    const row = await prisma.role.findUnique({ where: { key: user.role } });
    if (row?.modules) {
      const parsed = JSON.parse(row.modules);
      if (Array.isArray(parsed)) return parsed.filter((m: unknown) => typeof m === 'string');
    }
  } catch (e) {
    console.error('getMyModules failed:', e);
  }
  return ROLES[user.role as keyof typeof ROLES]?.modules ?? ROLES.employee.modules;
}

/** Every module the UI knows how to render, for building the permission matrix. */
export async function listModules() {
  await requireSession();
  return Object.entries(MODULE_LABELS).map(([id, label]) => ({ id, label }));
}

export async function upsertRole(input: {
  key: string;
  label: string;
  description?: string;
  color?: string;
  modules: string[];
  rank?: number;
}) {
  const actor = await requireRole(ROLE_ADMIN_ROLES);

  const key = input.key.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
  if (!key) throw new Error('Role key is required');
  if (!input.label.trim()) throw new Error('Role label is required');

  // Only accept module ids the UI can actually route to.
  const validModules = input.modules.filter((m) => m in MODULE_LABELS);

  const existing = await prisma.role.findUnique({ where: { key } });
  const data = {
    label: input.label.trim(),
    description: input.description?.trim() ?? '',
    color: input.color ?? '#94A3B8',
    modules: JSON.stringify(validModules),
    rank: input.rank ?? DEFAULT_RANKS[key] ?? 100,
  };

  if (existing) {
    await prisma.role.update({ where: { key }, data });
  } else {
    await prisma.role.create({ data: { key, ...data, isSystem: false } });
  }

  await logAudit(actor, existing ? 'role.update' : 'role.create', 'Role', key, input.label);
  return { success: true, key };
}

export async function deleteRole(key: string) {
  const actor = await requireRole(ROLE_ADMIN_ROLES);

  if (SYSTEM_ROLE_KEYS.includes(key)) {
    throw new Error('Built-in roles cannot be deleted. Edit its module access instead.');
  }

  // Don't strand users on a role that no longer exists.
  const holders = await prisma.user.count({ where: { role: key } });
  if (holders > 0) {
    throw new Error(`${holders} user(s) still have this role. Reassign them first.`);
  }

  await prisma.role.delete({ where: { key } });
  await logAudit(actor, 'role.delete', 'Role', key);
  return { success: true };
}

/** Assign a role to a user. Cannot be used to grant a role senior to your own. */
export async function assignUserRole(userId: string, roleKey: string) {
  const actor = await requireRole(ROLE_ADMIN_ROLES);

  const roles = await listRoles();
  const target = roles.find((r) => r.id === roleKey);
  if (!target) throw new Error('Unknown role');

  const actorRole = roles.find((r) => r.id === actor.role);
  if (actorRole && target.rank < actorRole.rank) {
    throw new Error('You cannot assign a role more senior than your own.');
  }

  await prisma.user.update({ where: { id: userId }, data: { role: roleKey } });
  await logAudit(actor, 'role.assign', 'User', userId, roleKey);
  return { success: true };
}
