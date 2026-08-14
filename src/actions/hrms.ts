'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';
import {
  getVisibleEmployeeIds, assertCanViewEmployee, getMyEmployee, redactEmployee,
} from '@/lib/scope';
import { emitToOrg, emitToUser } from '@/lib/realtime';

// ─── Employees ───

export async function listEmployees() {
  const user = await requireSession();
  const visible = await getVisibleEmployeeIds(user);

  const employees = await prisma.employee.findMany({
    where: visible === null ? undefined : { id: { in: visible.length > 0 ? visible : ['__none__'] } },
    include: { department: true },
    orderBy: { name: 'asc' },
  });

  // Salary is only for the roles that need it, whoever is in scope.
  return employees.map((e: any) => redactEmployee(e, user.role));
}

export async function createEmployee(input: {
  name: string;
  email: string;
  designation: string;
  departmentId?: string;
  phone?: string;
  location?: string;
  salary?: number;
  joinDate?: string;
}) {
  const user = await requireRole(['ceo', 'coo', 'chro', 'admin']);
  
  if (user.role === 'chro') {
    const { getSetting } = await import('@/actions/settings');
    const hrCreationEnabled = await getSetting('hr_account_creation_enabled', 'true');
    if (hrCreationEnabled === 'false') {
      throw new Error('Account creation is temporarily disabled by executive administration.');
    }
  }

  const employee = await prisma.employee.create({
    data: {
      name: input.name,
      email: input.email,
      designation: input.designation,
      departmentId: input.departmentId ?? null,
      phone: input.phone ?? null,
      location: input.location ?? null,
      salary: input.salary ?? null,
      joinDate: input.joinDate ? new Date(input.joinDate) : new Date(),
    },
  });
  await logAudit(user, 'hrms.employee.create', 'Employee', employee.id, employee.name);
  return employee;
}

export async function updateEmployee(
  id: string,
  data: Partial<{ name: string; email: string; designation: string; departmentId: string; phone: string; location: string; salary: number; status: string }>
) {
  const user = await requireRole(['ceo', 'coo', 'chro', 'admin']);
  const employee = await prisma.employee.update({ where: { id }, data });
  await logAudit(user, 'hrms.employee.update', 'Employee', id);
  return employee;
}

export async function deleteEmployee(id: string) {
  const user = await requireRole(['ceo', 'chro', 'admin']);
  // Soft-exit rather than hard delete to preserve history
  await prisma.employee.update({ where: { id }, data: { status: 'exited' } });
  await logAudit(user, 'hrms.employee.exit', 'Employee', id);
  return { success: true };
}

/**
 * The signed-in user's own Employee record, resolved by email rather than by
 * guessing at a name match.
 */
export async function getMyProfile() {
  const user = await requireSession();
  const employee = await prisma.employee.findUnique({
    where: { email: user.email },
    include: { department: true },
  });

  return {
    id: employee?.id ?? null,
    name: employee?.name ?? user.name,
    email: employee?.email ?? user.email,
    phone: employee?.phone ?? null,
    designation: employee?.designation ?? user.designation,
    department: (employee as any)?.department?.name ?? user.department,
    location: employee?.location ?? null,
    joinDate: employee?.joinDate ?? null,
    avatar: employee?.avatar || user.avatar,
    hasEmployeeRecord: !!employee,
  };
}

/**
 * Create Employee records for any User that lacks one, and link existing
 * Employees back to their User by email.
 *
 * A User is a login; an Employee is the HR record that attendance, leave and
 * payroll hang off. Accounts created through the invite flow only ever get a
 * User, so without this they can't clock in, don't appear on the roster, and
 * have no leave balance.
 */
export async function syncUsersToEmployees() {
  const actor = await requireRole(['ceo', 'admin', 'coo', 'chro', 'hr']);

  const [users, employees] = await Promise.all([
    prisma.user.findMany({}),
    prisma.employee.findMany({}),
  ]);

  const employeeByEmail = new Map<string, any>(
    employees.map((e: any) => [String(e.email).toLowerCase(), e])
  );

  let created = 0;
  let linked = 0;

  for (const user of users) {
    const email = String(user.email).toLowerCase();
    const existing = employeeByEmail.get(email);

    if (existing) {
      // Present but not linked — attendance resolves by email, payroll by userId.
      if (!existing.userId) {
        await prisma.employee.update({ where: { id: existing.id }, data: { userId: user.id } });
        linked++;
      }
      continue;
    }

    await prisma.employee.create({
      data: {
        name: user.name,
        email: user.email,
        designation: user.designation || user.role?.toUpperCase() || 'Employee',
        phone: user.phone ?? null,
        userId: user.id,
        status: 'active',
      },
    });
    created++;
  }

  await logAudit(actor, 'hrms.employee.sync', 'Employee', undefined, `created ${created}, linked ${linked}`);
  return { created, linked, total: users.length };
}

// ─── Departments ───

export async function listDepartments() {
  await requireSession();
  return prisma.department.findMany({
    include: { _count: { select: { employees: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function upsertDepartment(name: string, head?: string) {
  const user = await requireRole(['ceo', 'coo', 'chro', 'admin']);
  const dept = await prisma.department.upsert({
    where: { name },
    update: { head: head ?? undefined },
    create: { name, head: head ?? null },
  });
  await logAudit(user, 'hrms.department.upsert', 'Department', dept.id, name);
  return dept;
}

// ─── Attendance ───

export async function getAttendance(employeeId: string, fromISO: string, toISO: string) {
  const user = await requireSession();
  // Without this, any employee could read anyone else's attendance by id.
  await assertCanViewEmployee(user, employeeId);

  return prisma.attendance.findMany({
    where: { employeeId, date: { gte: new Date(fromISO), lte: new Date(toISO) } },
    orderBy: { date: 'asc' },
  });
}

/**
 * Manually record attendance for someone. This is an administrative override —
 * employees clock themselves in via `toggleAttendance`, which is always scoped
 * to the caller.
 */
export async function recordAttendance(input: {
  employeeId: string;
  date: string; // yyyy-mm-dd
  status: string;
  checkIn?: string;
  checkOut?: string;
}) {
  const user = await requireRole(['ceo', 'admin', 'coo', 'chro', 'hr', 'manager']);
  await assertCanViewEmployee(user, input.employeeId);
  await logAudit(user, 'hrms.attendance.override', 'Attendance', input.employeeId, input.date);

  const date = new Date(input.date);
  return prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date } },
    update: { status: input.status, checkIn: input.checkIn ?? null, checkOut: input.checkOut ?? null },
    create: { employeeId: input.employeeId, date, status: input.status, checkIn: input.checkIn ?? null, checkOut: input.checkOut ?? null },
  });
}

// ─── Leave ───

export async function listLeaveRequests(status?: string) {
  const user = await requireSession();
  const visible = await getVisibleEmployeeIds(user);

  const where: any = {};
  if (status) where.status = status;
  if (visible !== null) {
    where.employeeId = { in: visible.length > 0 ? visible : ['__none__'] };
  }

  return prisma.leaveRequest.findMany({
    where,
    include: { employee: { select: { id: true, name: true, designation: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function submitLeaveRequest(input: {
  employeeId?: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
}) {
  const user = await requireSession();

  // Always file against the caller's own record. Admins may file on behalf of
  // someone in their scope; nobody else can name an arbitrary employeeId.
  const me = await getMyEmployee(user);
  let employeeId = me?.id;

  if (input.employeeId && input.employeeId !== me?.id) {
    await requireRole(['ceo', 'admin', 'coo', 'chro', 'hr']);
    await assertCanViewEmployee(user, input.employeeId);
    employeeId = input.employeeId;
  }
  if (!employeeId) throw new Error('No employee record linked to your account');

  const leave = await prisma.leaveRequest.create({
    data: {
      employeeId,
      type: input.type,
      startDate: new Date(input.startDate),
      endDate: new Date(input.endDate),
      days: input.days,
      reason: input.reason,
    },
  });
  await logAudit(user, 'hrms.leave.submit', 'LeaveRequest', leave.id);
  emitToOrg('notifications:refresh', { reason: 'leave.submitted' });
  return leave;
}

export async function setLeaveStatus(id: string, status: 'approved' | 'rejected') {
  const user = await requireRole(['ceo', 'coo', 'chro', 'hr', 'manager', 'admin']);

  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) throw new Error('Leave request not found');

  // A manager may only decide leave for people in their own reporting line.
  await assertCanViewEmployee(user, existing.employeeId);

  const me = await getMyEmployee(user);
  if (me && me.id === existing.employeeId) {
    throw new Error('You cannot approve your own leave request');
  }

  const leave = await prisma.leaveRequest.update({
    where: { id },
    data: { status, approverId: user.id, decidedAt: new Date() },
  });
  await logAudit(user, `hrms.leave.${status}`, 'LeaveRequest', id);

  // Tell the requester directly, and refresh everyone's pending queue.
  const requester = await prisma.employee.findUnique({ where: { id: existing.employeeId } });
  if (requester?.userId) {
    emitToUser(requester.userId, 'leave:decided', { id, status });
  }
  emitToOrg('notifications:refresh', { reason: 'leave.decided' });
  return leave;
}

/** Default annual entitlement per leave type. Overridable per-org via Settings. */
export const DEFAULT_LEAVE_ENTITLEMENTS: Record<string, number> = {
  casual: 12,
  sick: 8,
  earned: 15,
  'comp-off': 0,
  unpaid: 0,
};

const LEAVE_TYPE_LABELS: Record<string, string> = {
  casual: 'Casual',
  sick: 'Sick',
  earned: 'Earned',
  'comp-off': 'Comp-off',
  unpaid: 'Unpaid',
};

async function getLeaveEntitlements(): Promise<Record<string, number>> {
  const { getSetting } = await import('@/actions/settings');
  const raw = await getSetting('leave_entitlements', '');
  if (!raw) return DEFAULT_LEAVE_ENTITLEMENTS;
  try {
    return { ...DEFAULT_LEAVE_ENTITLEMENTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_LEAVE_ENTITLEMENTS;
  }
}

export async function getLeaveBalances() {
  const user = await requireSession();
  const entitlements = await getLeaveEntitlements();

  const build = (usedByType: Record<string, number>) =>
    Object.entries(entitlements)
      .filter(([, total]) => total > 0)
      .map(([type, total]) => ({
        type: LEAVE_TYPE_LABELS[type] ?? type,
        used: usedByType[type] ?? 0,
        total,
        remaining: Math.max(0, total - (usedByType[type] ?? 0)),
      }));

  const employee = await prisma.employee.findUnique({ where: { email: user.email } });
  if (!employee) return build({});

  // Only count leave taken in the current calendar year, and sum the `days`
  // on each request — a 5-day holiday is 5 days used, not 1.
  const yearStart = new Date(new Date().getFullYear(), 0, 1);
  const approved = await prisma.leaveRequest.findMany({
    where: { employeeId: employee.id, status: 'approved' },
  });

  const usedByType: Record<string, number> = {};
  for (const leave of approved) {
    if (new Date(leave.startDate) < yearStart) continue;
    const type = String(leave.type).toLowerCase();
    usedByType[type] = (usedByType[type] ?? 0) + (Number(leave.days) || 0);
  }

  return build(usedByType);
}

export async function getAttendanceStatus() {
  const user = await requireSession();
  
  let employee = await prisma.employee.findUnique({ where: { email: user.email } });
  if (!employee) return { clockedIn: false, onBreak: false, elapsedSeconds: 0, breakSeconds: 0 };
  
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}T00:00:00.000Z`;
  const today = new Date(todayStr);
  
  const attendance = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: today }
  });
  
  if (!attendance) return { clockedIn: false, onBreak: false, elapsedSeconds: 0, breakSeconds: 0 };
  
  let elapsedSeconds = 0;
  if (attendance.checkIn && !attendance.checkOut) {
    const checkInDate = new Date(attendance.checkIn);
    if (!isNaN(checkInDate.getTime())) {
      elapsedSeconds = Math.floor((Date.now() - checkInDate.getTime()) / 1000);
    } else {
      // It's a seeded time string like "09:30"
      const parts = attendance.checkIn.split(':');
      if (parts.length === 2) {
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seededDate = new Date();
        seededDate.setHours(hours, minutes, 0, 0);
        elapsedSeconds = Math.floor((Date.now() - seededDate.getTime()) / 1000);
      }
    }
  }

  let currentBreakSeconds = attendance.breakSeconds || 0;
  let onBreak = false;
  if (attendance.onBreakSince) {
    onBreak = true;
    const breakSinceDate = new Date(attendance.onBreakSince);
    if (!isNaN(breakSinceDate.getTime())) {
      currentBreakSeconds += Math.floor((Date.now() - breakSinceDate.getTime()) / 1000);
    }
  }

  elapsedSeconds = Math.max(0, elapsedSeconds - currentBreakSeconds);

  return {
    clockedIn: !!attendance.checkIn && !attendance.checkOut,
    checkInTime: attendance.checkIn,
    onBreak,
    elapsedSeconds,
    breakSeconds: currentBreakSeconds
  };
}

export async function toggleAttendance(action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end') {
  const user = await requireSession();
  
  let employee = await prisma.employee.findUnique({ where: { email: user.email } });
  
  if (!employee) {
    // Auto-create employee record for attendance tracking if it doesn't exist
    employee = await prisma.employee.create({
      data: {
        name: user.name,
        email: user.email,
        designation: user.designation || 'EMPLOYEE',
        userId: user.id
      }
    });
  }
  
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}T00:00:00.000Z`;
  const today = new Date(todayStr);
  
  const existing = await prisma.attendance.findFirst({
    where: { employeeId: employee.id, date: today }
  });
  
  if (action === 'clock_in') {
    if (!existing) {
      await prisma.attendance.create({
        data: {
          employeeId: employee.id,
          date: today,
          checkIn: new Date().toISOString(),
          status: 'present'
        }
      });
    }
  } else if (action === 'clock_out' && existing) {
    let breakSeconds = existing.breakSeconds || 0;
    if (existing.onBreakSince) {
      const breakSinceDate = new Date(existing.onBreakSince);
      if (!isNaN(breakSinceDate.getTime())) {
        breakSeconds += Math.floor((Date.now() - breakSinceDate.getTime()) / 1000);
      }
    }
    await prisma.attendance.update({
      where: { id: existing.id },
      data: { 
        checkOut: new Date().toISOString(),
        onBreakSince: null,
        breakSeconds
      }
    });
  } else if (action === 'break_start' && existing) {
    if (!existing.onBreakSince) {
      await prisma.attendance.update({
        where: { id: existing.id },
        data: { onBreakSince: new Date().toISOString() }
      });
    }
  } else if (action === 'break_end' && existing) {
    if (existing.onBreakSince) {
      let additionalBreakSeconds = 0;
      const breakSinceDate = new Date(existing.onBreakSince);
      if (!isNaN(breakSinceDate.getTime())) {
        additionalBreakSeconds = Math.floor((Date.now() - breakSinceDate.getTime()) / 1000);
      }
      await prisma.attendance.update({
        where: { id: existing.id },
        data: { 
          onBreakSince: null,
          breakSeconds: (existing.breakSeconds || 0) + additionalBreakSeconds 
        }
      });
    }
  }
  
  // Live attendance board for the CEO/manager views.
  emitToOrg('attendance:update', { employeeId: employee.id, name: employee.name, action });
  return { success: true };
}

export async function getAttendanceHistory(startDateStr: string, endDateStr: string) {
  const user = await requireSession();
  let employee = await prisma.employee.findUnique({ where: { email: user.email } });
  if (!employee) return [];

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);

  const records = await prisma.attendance.findMany({
    where: {
      employeeId: employee.id,
      date: {
        gte: startDate,
        lte: endDate
      }
    },
    orderBy: { date: 'asc' }
  });

  return records.map((r: any) => {
    let elapsedSeconds = 0;
    if (r.checkIn) {
      const checkInDate = new Date(r.checkIn);
      const endCalcDate = r.checkOut ? new Date(r.checkOut) : new Date();
      if (!isNaN(checkInDate.getTime()) && !isNaN(endCalcDate.getTime())) {
         elapsedSeconds = Math.floor((endCalcDate.getTime() - checkInDate.getTime()) / 1000);
      }
    }
    
    // Add current break if on break and no checkout
    let currentBreakSeconds = r.breakSeconds || 0;
    if (r.onBreakSince && !r.checkOut) {
      const breakSinceDate = new Date(r.onBreakSince);
      if (!isNaN(breakSinceDate.getTime())) {
        currentBreakSeconds += Math.floor((Date.now() - breakSinceDate.getTime()) / 1000);
      }
    }
    
    elapsedSeconds = Math.max(0, elapsedSeconds - currentBreakSeconds);

    return {
      date: r.date.toISOString(),
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      elapsedSeconds,
      breakSeconds: currentBreakSeconds,
      status: r.status
    };
  });
}
