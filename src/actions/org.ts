'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';

const ORG_ADMIN_ROLES = ['ceo', 'admin', 'coo', 'chro'];

export type OrgNode = {
  id: string;
  name: string;
  email: string;
  designation: string;
  avatar: string;
  status: string;
  departmentId: string | null;
  departmentName: string | null;
  managerId: string | null;
  reports: OrgNode[];
};

// ─────────────────────────── Departments ───────────────────────────

export type DepartmentNode = {
  id: string;
  name: string;
  parentId: string | null;
  headEmployeeId: string | null;
  headName: string | null;
  employeeCount: number;
  children: DepartmentNode[];
};

export async function listDepartmentTree(): Promise<DepartmentNode[]> {
  await requireSession();

  const [departments, employees] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: 'asc' } }),
    prisma.employee.findMany({ where: { status: 'active' } }),
  ]);

  const headNames = new Map<string, string>(employees.map((e: any) => [e.id, e.name]));
  const counts = new Map<string, number>();
  for (const e of employees) {
    if (e.departmentId) counts.set(e.departmentId, (counts.get(e.departmentId) ?? 0) + 1);
  }

  const nodes = new Map<string, DepartmentNode>();
  for (const d of departments) {
    nodes.set(d.id, {
      id: d.id,
      name: d.name,
      parentId: d.parentId ?? null,
      headEmployeeId: d.headEmployeeId ?? null,
      headName: d.headEmployeeId ? headNames.get(d.headEmployeeId) ?? null : (d.head ?? null),
      employeeCount: counts.get(d.id) ?? 0,
      children: [],
    });
  }

  // Build the tree, treating a missing/self parent as a root so a bad row can
  // never drop a department out of the UI entirely.
  const roots: DepartmentNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId && node.parentId !== node.id ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function upsertDepartment(input: {
  id?: string;
  name: string;
  parentId?: string | null;
  headEmployeeId?: string | null;
}) {
  const actor = await requireRole(ORG_ADMIN_ROLES);
  const name = input.name.trim();
  if (!name) throw new Error('Department name is required');

  let parentId = input.parentId || null;
  if (input.id && parentId) {
    if (parentId === input.id) throw new Error('A department cannot be its own parent');
    if (await createsDepartmentCycle(input.id, parentId)) {
      throw new Error('That parent would create a circular department structure');
    }
  }

  const data = {
    name,
    parentId,
    headEmployeeId: input.headEmployeeId || null,
  };

  let dept;
  if (input.id) {
    dept = await prisma.department.update({ where: { id: input.id }, data });
  } else {
    const existing = await prisma.department.findUnique({ where: { name } });
    if (existing) throw new Error(`A department named "${name}" already exists`);
    dept = await prisma.department.create({ data });
  }

  await logAudit(actor, input.id ? 'org.department.update' : 'org.department.create', 'Department', dept.id, name);
  return dept;
}

async function createsDepartmentCycle(id: string, proposedParentId: string): Promise<boolean> {
  const all = await prisma.department.findMany({});
  const parentOf = new Map<string, string | null>(all.map((d: any) => [d.id, d.parentId ?? null]));

  let cursor: string | null = proposedParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === id) return true;
    if (seen.has(cursor)) break; // pre-existing cycle; don't spin
    seen.add(cursor);
    cursor = parentOf.get(cursor) ?? null;
  }
  return false;
}

export async function deleteDepartment(id: string) {
  const actor = await requireRole(ORG_ADMIN_ROLES);

  const children = await prisma.department.count({ where: { parentId: id } });
  if (children > 0) throw new Error('Move or remove its sub-departments first');

  const staff = await prisma.employee.count({ where: { departmentId: id } });
  if (staff > 0) throw new Error(`${staff} employee(s) are still in this department. Reassign them first.`);

  await prisma.department.delete({ where: { id } });
  await logAudit(actor, 'org.department.delete', 'Department', id);
  return { success: true };
}

// ─────────────────────────── Reporting lines ───────────────────────────

export async function setManager(employeeId: string, managerId: string | null) {
  const actor = await requireRole(ORG_ADMIN_ROLES);

  if (managerId) {
    if (managerId === employeeId) throw new Error('An employee cannot report to themselves');
    if (await createsReportingCycle(employeeId, managerId)) {
      throw new Error('That reporting line would create a loop');
    }
  }

  await prisma.employee.update({ where: { id: employeeId }, data: { managerId } });
  await logAudit(actor, 'org.manager.set', 'Employee', employeeId, managerId ?? 'cleared');
  return { success: true };
}

async function createsReportingCycle(employeeId: string, proposedManagerId: string): Promise<boolean> {
  const all = await prisma.employee.findMany({});
  const managerOf = new Map<string, string | null>(all.map((e: any) => [e.id, e.managerId ?? null]));

  let cursor: string | null = proposedManagerId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === employeeId) return true;
    if (seen.has(cursor)) break;
    seen.add(cursor);
    cursor = managerOf.get(cursor) ?? null;
  }
  return false;
}

/** Full reporting tree. Employees with no (or a dangling) manager become roots. */
export async function getOrgChart(): Promise<OrgNode[]> {
  await requireSession();

  const employees = await prisma.employee.findMany({
    where: { status: 'active' },
    include: { department: true },
    orderBy: { name: 'asc' },
  });

  const nodes = new Map<string, OrgNode>();
  for (const e of employees) {
    nodes.set(e.id, {
      id: e.id,
      name: e.name,
      email: e.email,
      designation: e.designation,
      avatar: e.avatar,
      status: e.status,
      departmentId: e.departmentId ?? null,
      departmentName: e.department?.name ?? null,
      managerId: e.managerId ?? null,
      reports: [],
    });
  }

  const roots: OrgNode[] = [];
  for (const node of nodes.values()) {
    const manager = node.managerId && node.managerId !== node.id ? nodes.get(node.managerId) : undefined;
    if (manager) manager.reports.push(node);
    else roots.push(node);
  }
  return roots;
}

/**
 * Every employee id at or below `employeeId` in the reporting tree.
 * This is the scoping primitive: managers see their own subtree, nobody else's.
 */
export async function getReportingScope(employeeId: string): Promise<string[]> {
  const all = await prisma.employee.findMany({});
  const childrenOf = new Map<string, string[]>();
  for (const e of all) {
    if (!e.managerId) continue;
    const list = childrenOf.get(e.managerId) ?? [];
    list.push(e.id);
    childrenOf.set(e.managerId, list);
  }

  const scope: string[] = [];
  const seen = new Set<string>();
  const queue = [employeeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (seen.has(current)) continue; // cycle guard
    seen.add(current);
    scope.push(current);
    queue.push(...(childrenOf.get(current) ?? []));
  }
  return scope;
}

/** The signed-in user's direct reports plus everyone beneath them. */
export async function getMyTeam(): Promise<OrgNode[]> {
  const user = await requireSession();
  const me = await prisma.employee.findUnique({ where: { email: user.email } });
  if (!me) return [];

  const chart = await getOrgChart();
  const find = (nodes: OrgNode[]): OrgNode | null => {
    for (const n of nodes) {
      if (n.id === me.id) return n;
      const hit = find(n.reports);
      if (hit) return hit;
    }
    return null;
  };
  return find(chart)?.reports ?? [];
}
