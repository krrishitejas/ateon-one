import { prisma } from '@/lib/prisma';
import type { SessionUser } from '@/lib/auth';

/** Roles that legitimately see every employee in the org. */
export const ORG_WIDE_VIEW_ROLES = ['ceo', 'admin', 'coo', 'chro', 'hr'];

/** Roles allowed to see compensation figures. */
export const SALARY_VIEW_ROLES = ['ceo', 'admin', 'chro', 'hr', 'cfo'];

export function canViewWholeOrg(role: string): boolean {
  return ORG_WIDE_VIEW_ROLES.includes(role);
}

export function canViewSalary(role: string): boolean {
  return SALARY_VIEW_ROLES.includes(role);
}

/**
 * Employee ids the given user is allowed to see.
 *
 * Returns `null` for org-wide roles, meaning "no restriction" — callers should
 * treat null as "skip the filter" rather than "empty set".
 *
 * Managers get their own reporting subtree; everyone else gets just themselves.
 */
export async function getVisibleEmployeeIds(user: SessionUser): Promise<string[] | null> {
  if (canViewWholeOrg(user.role)) return null;

  const me = await prisma.employee.findUnique({ where: { email: user.email } });
  if (!me) return [];

  const all = await prisma.employee.findMany({});
  const childrenOf = new Map<string, string[]>();
  for (const e of all) {
    if (!e.managerId) continue;
    const list = childrenOf.get(e.managerId) ?? [];
    list.push(e.id);
    childrenOf.set(e.managerId, list);
  }

  // Walk the subtree rooted at this employee. `seen` doubles as a cycle guard so
  // a bad reporting line can't spin here.
  const scope: string[] = [];
  const seen = new Set<string>();
  const queue = [me.id];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue;
    seen.add(current);
    scope.push(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }
  return scope;
}

/** Throws unless `user` may see `employeeId`. */
export async function assertCanViewEmployee(user: SessionUser, employeeId: string): Promise<void> {
  const visible = await getVisibleEmployeeIds(user);
  if (visible === null) return;
  if (!visible.includes(employeeId)) {
    throw new Error('Forbidden: that employee is outside your team');
  }
}

/** The caller's own Employee row, or null if they don't have one. */
export async function getMyEmployee(user: SessionUser) {
  return prisma.employee.findUnique({ where: { email: user.email } });
}

/** Remove fields the viewer isn't entitled to see. */
export function redactEmployee<T extends { salary?: number | null }>(employee: T, viewerRole: string): T {
  if (canViewSalary(viewerRole)) return employee;
  return { ...employee, salary: null };
}
