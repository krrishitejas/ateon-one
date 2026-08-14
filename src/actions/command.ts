'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { getVisibleEmployeeIds, canViewSalary } from '@/lib/scope';

/** Roles that get the org-wide command centre. Managers get their subtree. */
const COMMAND_ROLES = ['ceo', 'admin', 'coo', 'cto', 'chro', 'cfo', 'hr', 'manager'];

export type RosterEntry = {
  employeeId: string;
  userId: string | null;
  name: string;
  designation: string;
  department: string | null;
  avatar: string;
  /** 'working' | 'break' | 'leave' | 'out' | 'absent' */
  state: string;
  checkIn: string | null;
  checkOut: string | null;
  workedSeconds: number;
  breakSeconds: number;
  location: string | null;
  lat: number | null;
  lng: number | null;
};

/** Local YYYY-MM-DD rendered as UTC midnight, matching how attendance is stored. */
function todayKey(): Date {
  const now = new Date();
  return new Date(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00:00.000Z`
  );
}

function elapsed(record: any): { worked: number; onBreak: number } {
  if (!record?.checkIn) return { worked: 0, onBreak: 0 };

  let start = new Date(record.checkIn).getTime();
  if (Number.isNaN(start)) {
    // Seeded values can be a bare "09:30" clock time.
    const [h, m] = String(record.checkIn).split(':').map(Number);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      start = d.getTime();
    } else {
      return { worked: 0, onBreak: 0 };
    }
  }

  const end = record.checkOut ? new Date(record.checkOut).getTime() : Date.now();
  let breakSeconds = Number(record.breakSeconds) || 0;
  if (record.onBreakSince && !record.checkOut) {
    const since = new Date(record.onBreakSince).getTime();
    if (!Number.isNaN(since)) breakSeconds += Math.floor((Date.now() - since) / 1000);
  }

  const gross = Math.max(0, Math.floor(((Number.isNaN(end) ? Date.now() : end) - start) / 1000));
  return { worked: Math.max(0, gross - breakSeconds), onBreak: breakSeconds };
}

/**
 * One live snapshot for the command centre — attendance roster, queues awaiting
 * a decision, and rollups. Scoped: org-wide for executives, reporting subtree
 * for managers.
 */
export async function getCommandCentre() {
  const user = await requireSession();
  if (!COMMAND_ROLES.includes(user.role)) {
    throw new Error('Forbidden: the command centre is for leadership roles');
  }

  const visible = await getVisibleEmployeeIds(user);
  const scoped = <T extends { employeeId?: string; id?: string }>(rows: T[], key: 'employeeId' | 'id') =>
    visible === null ? rows : rows.filter((r) => visible.includes(String(r[key])));

  const today = todayKey();

  const [employees, attendance, leaves, approvals, tickets, projects] = await Promise.all([
    prisma.employee.findMany({
      where: visible === null
        ? { status: { not: 'exited' } }
        : { id: { in: visible.length > 0 ? visible : ['__none__'] } },
      include: { department: true },
      orderBy: { name: 'asc' },
    }),
    prisma.attendance.findMany({ where: { date: today } }),
    prisma.leaveRequest.findMany({
      where: { status: 'pending' },
      include: { employee: { select: { id: true, name: true, designation: true } } },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.approval.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' } }),
    prisma.serviceTicket.findMany({ where: { status: { in: ['open', 'in-progress'] } } }),
    prisma.project.findMany({}),
  ]);

  const attendanceBy = new Map<string, any>();
  for (const a of attendance) attendanceBy.set(a.employeeId, a);

  // Anyone on approved leave covering today shouldn't read as "absent".
  const approvedLeaves = await prisma.leaveRequest.findMany({ where: { status: 'approved' } });
  const onLeaveToday = new Set<string>();
  const now = Date.now();
  for (const l of approvedLeaves) {
    const start = new Date(l.startDate).getTime();
    const end = new Date(l.endDate).getTime();
    if (start <= now && now <= end + 86_400_000) onLeaveToday.add(l.employeeId);
  }

  const roster: RosterEntry[] = employees.map((e: any) => {
    const record = attendanceBy.get(e.id);
    const { worked, onBreak } = elapsed(record);

    let state: string;
    if (onLeaveToday.has(e.id)) state = 'leave';
    else if (!record?.checkIn) state = 'absent';
    else if (record.checkOut) state = 'out';
    else if (record.onBreakSince) state = 'break';
    else state = 'working';

    return {
      employeeId: e.id,
      userId: e.userId ?? null,
      name: e.name,
      designation: e.designation,
      department: e.department?.name ?? null,
      avatar: e.avatar,
      state,
      checkIn: record?.checkIn ?? null,
      checkOut: record?.checkOut ?? null,
      workedSeconds: worked,
      breakSeconds: onBreak,
      location: e.currentLocName ?? null,
      lat: e.currentLat ?? null,
      lng: e.currentLng ?? null,
    };
  });

  const countState = (s: string) => roster.filter((r) => r.state === s).length;

  // Department rollup: headcount and how many are working right now.
  const byDept = new Map<string, { total: number; working: number }>();
  for (const r of roster) {
    const key = r.department ?? 'Unassigned';
    const entry = byDept.get(key) ?? { total: 0, working: 0 };
    entry.total += 1;
    if (r.state === 'working' || r.state === 'break') entry.working += 1;
    byDept.set(key, entry);
  }

  const slaBreached = tickets.filter(
    (t: any) => t.slaDeadline && new Date(t.slaDeadline).getTime() < now
  ).length;

  return {
    scope: visible === null ? 'organisation' : 'team',
    canViewSalary: canViewSalary(user.role),

    attendance: {
      headcount: roster.length,
      working: countState('working'),
      onBreak: countState('break'),
      onLeave: countState('leave'),
      checkedOut: countState('out'),
      absent: countState('absent'),
      totalWorkedSeconds: roster.reduce((s, r) => s + r.workedSeconds, 0),
    },

    roster,

    queues: {
      pendingLeave: scoped(leaves as any[], 'employeeId').map((l: any) => ({
        id: l.id,
        employeeName: l.employee?.name ?? 'Unknown',
        type: l.type,
        days: Number(l.days) || 0,
        startDate: l.startDate,
        reason: l.reason,
      })),
      pendingApprovals: approvals.map((a: any) => ({
        id: a.id,
        title: a.title,
        type: a.type,
        requestedBy: a.requestedBy,
        amount: a.amount == null ? null : Number(a.amount),
        priority: a.priority,
        createdAt: a.createdAt,
      })),
      openTickets: tickets.length,
      slaBreached,
    },

    departments: Array.from(byDept.entries())
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.total - a.total),

    projects: {
      total: projects.length,
      active: projects.filter((p: any) => p.status === 'active').length,
      green: projects.filter((p: any) => p.health === 'green').length,
      amber: projects.filter((p: any) => p.health === 'amber').length,
      red: projects.filter((p: any) => p.health === 'red').length,
    },
  };
}
