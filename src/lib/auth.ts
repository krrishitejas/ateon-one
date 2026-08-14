import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export const SESSION_COOKIE = 'ateon_session';

/** Roles with elevated (admin-level) access across modules. */
export const ADMIN_ROLES = ['ceo', 'cfo', 'coo', 'cto', 'chro', 'legal', 'admin'];

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  designation: string;
  avatar: string;
};

/**
 * Resolve the current user from the `ateon_session` cookie + Session table.
 * Returns null when unauthenticated / expired.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;

  const { id, name, email, role, department, designation, avatar } = session.user;
  return { id, name, email, role, department, designation, avatar };
}

/** Like getSessionUser but throws for use in mutating server actions. */
export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

export function isAdmin(role: string): boolean {
  return ADMIN_ROLES.includes(role);
}

/** Require one of the given roles (or any admin role when roles omitted). */
export async function requireRole(roles?: string[]): Promise<SessionUser> {
  const user = await requireSession();
  const allowed = roles && roles.length > 0 ? roles : ADMIN_ROLES;
  if (!allowed.includes(user.role)) throw new Error('Forbidden: insufficient role');
  return user;
}

/** Fire-and-forget audit trail entry. Never throws. */
export async function logAudit(
  actor: SessionUser | null,
  action: string,
  entity: string,
  entityId?: string,
  details?: string
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actor?.id ?? null,
        actorName: actor?.name ?? 'system',
        action,
        entity,
        entityId: entityId ?? null,
        details: details ?? null,
      },
    });
  } catch (e) {
    console.error('audit log failed', e);
  }
}
