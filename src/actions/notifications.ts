'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { getMyEmployee } from '@/lib/scope';

export type NotificationDTO = {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning';
  time: string;
  href: string;
};

const APPROVER_ROLES = ['ceo', 'admin', 'cfo', 'coo', 'chro', 'hr', 'legal', 'manager'];
const AGENT_ROLES = ['ceo', 'admin', 'coo', 'cto', 'chro', 'hr', 'manager'];

function relativeTime(date: Date | string): string {
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Live notification feed derived from real pending work rather than a stored
 * table — so it can never drift out of sync with what's actually outstanding.
 * Each entry links to the thing that needs attention.
 */
export async function getMyNotifications(): Promise<NotificationDTO[]> {
  const user = await requireSession();
  const notifications: NotificationDTO[] = [];

  const canApprove = APPROVER_ROLES.includes(user.role);
  const isAgent = AGENT_ROLES.includes(user.role);

  const [approvals, leaves, tickets, myTasks] = await Promise.all([
    canApprove
      ? prisma.approval.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 10 })
      : Promise.resolve([]),
    canApprove
      ? prisma.leaveRequest.findMany({ where: { status: 'pending' }, orderBy: { createdAt: 'desc' }, take: 10 })
      : Promise.resolve([]),
    isAgent
      ? prisma.serviceTicket.findMany({ where: { status: 'open' }, orderBy: { createdAt: 'desc' }, take: 10 })
      : Promise.resolve([]),
    prisma.task.findMany({ where: { assigneeId: user.id, status: { not: 'done' } }, orderBy: { dueDate: 'asc' }, take: 10 }),
  ]);

  for (const a of approvals) {
    // Your own requests aren't yours to action.
    if (a.requestedBy === user.name) continue;
    notifications.push({
      id: `approval-${a.id}`,
      title: 'Approval pending',
      message: `${a.requestedBy} requested "${a.title}"`,
      type: 'warning',
      time: relativeTime(a.createdAt),
      href: '/approvals',
    });
  }

  const employeeNames = new Map<string, string>();
  if (leaves.length > 0) {
    const employees = await prisma.employee.findMany({});
    for (const e of employees) employeeNames.set(e.id, e.name);
  }
  for (const l of leaves) {
    notifications.push({
      id: `leave-${l.id}`,
      title: 'Leave request',
      message: `${employeeNames.get(l.employeeId) ?? 'An employee'} requested ${l.days} day(s) ${l.type} leave`,
      type: 'info',
      time: relativeTime(l.createdAt),
      href: '/hrms',
    });
  }

  const now = Date.now();
  for (const t of tickets) {
    const breached = t.slaDeadline && new Date(t.slaDeadline).getTime() < now;
    notifications.push({
      id: `ticket-${t.id}`,
      title: breached ? 'Ticket SLA breached' : 'Open ticket',
      message: t.subject,
      type: breached ? 'warning' : 'info',
      time: relativeTime(t.createdAt),
      href: '/service-desk',
    });
  }

  for (const task of myTasks) {
    const due = new Date(task.dueDate).getTime();
    if (Number.isNaN(due) || due > now) continue; // only surface overdue work
    notifications.push({
      id: `task-${task.id}`,
      title: 'Task overdue',
      message: task.title,
      type: 'warning',
      time: relativeTime(task.dueDate),
      href: '/workspace',
    });
  }

  return notifications.slice(0, 25);
}
