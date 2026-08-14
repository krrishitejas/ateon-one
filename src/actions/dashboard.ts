'use server';

import { prisma } from '@/lib/prisma';
import { getSessionUser } from '@/lib/auth';

/** Aggregated stats for the dashboard landing page (DB-backed, replaces mockData). */
export async function getDashboardStats() {
  const user = await getSessionUser();
  if (!user) return null;

  const isFinanceUser = user.role === 'ceo' || user.role === 'cfo';
  // The audit trail names who did what; keep it to the roles that own the
  // Audit module rather than surfacing it on everyone's dashboard.
  const canViewAudit = ['ceo', 'admin', 'cfo', 'legal'].includes(user.role);

  const [
    employeeCount,
    activeProjects,
    openTasks,
    pendingApprovals,
    openTickets,
    invoiceAgg,
    overdueInvoices,
    expenseAgg,
    marketingSpendAgg,
    departments,
    upcomingEvents,
    recentAudit,
  ] = await Promise.all([
    prisma.employee.count({ where: { status: { not: 'exited' } } }),
    prisma.project.count({ where: { status: 'active' } }),
    prisma.task.count({ where: { status: { not: 'done' } } }),
    prisma.approval.count({ where: { status: 'pending' } }),
    prisma.serviceTicket.count({ where: { status: { in: ['open', 'in-progress'] } } }),
    isFinanceUser ? prisma.invoice.aggregate({ _sum: { amount: true }, where: { status: 'paid' } }) : Promise.resolve({ _sum: { amount: null } }),
    isFinanceUser ? prisma.invoice.count({ where: { status: 'overdue' } }) : Promise.resolve(0),
    isFinanceUser ? prisma.expense.aggregate({ _sum: { amount: true }, where: { status: { in: ['approved', 'reimbursed'] } } }) : Promise.resolve({ _sum: { amount: null } }),
    isFinanceUser ? prisma.marketingSpend.aggregate({ _sum: { amount: true } }) : Promise.resolve({ _sum: { amount: null } }),
    prisma.department.findMany({ include: { _count: { select: { employees: true } } } }),
    prisma.calendarEvent.findMany({
      where: { date: { gte: new Date() } },
      orderBy: { date: 'asc' },
      take: 5,
    }),
    canViewAudit
      ? prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 8 })
      : Promise.resolve([]),
  ]);

  return {
    employeeCount,
    activeProjects,
    openTasks,
    pendingApprovals,
    openTickets,
    revenueCollected: invoiceAgg._sum.amount ?? 0,
    overdueInvoices,
    totalExpenses: expenseAgg._sum.amount ?? 0,
    marketingSpend: marketingSpendAgg._sum.amount ?? 0,
    departmentHeadcount: departments.map((d: any) => ({ name: d.name, count: d._count.employees })),
    upcomingEvents,
    recentAudit,
  };
}
