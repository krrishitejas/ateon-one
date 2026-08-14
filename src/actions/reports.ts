'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { getVisibleEmployeeIds, canViewSalary } from '@/lib/scope';

const FINANCE_VIEW_ROLES = ['ceo', 'admin', 'cfo', 'coo'];

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Group rows by a key and count them. */
function countBy<T>(rows: T[], keyOf: (row: T) => string): [string, number][] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries());
}

/** Group rows by a key and sum a numeric field. */
function sumBy<T>(rows: T[], keyOf: (row: T) => string, valueOf: (row: T) => number): [string, number][] {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = keyOf(row);
    map.set(key, (map.get(key) ?? 0) + valueOf(row));
  }
  return Array.from(map.entries());
}

/**
 * Aggregates behind the Reports module. Everything is derived from live tables —
 * there is no stored "revenue series", so it's built from paid invoices.
 */
export async function getReportData() {
  const user = await requireSession();
  const canSeeFinance = FINANCE_VIEW_ROLES.includes(user.role);
  const visible = await getVisibleEmployeeIds(user);

  const [employees, projects, expenses, invoices, leads, opportunities, departments] = await Promise.all([
    prisma.employee.findMany({
      where: visible === null ? { status: { not: 'exited' } } : { id: { in: visible.length > 0 ? visible : ['__none__'] } },
      include: { department: true },
    }),
    prisma.project.findMany({}),
    canSeeFinance ? prisma.expense.findMany({}) : Promise.resolve([]),
    canSeeFinance ? prisma.invoice.findMany({}) : Promise.resolve([]),
    prisma.lead.findMany({}),
    prisma.opportunity.findMany({}),
    prisma.department.findMany({}),
  ]);

  // ── Revenue series: paid invoices bucketed by month, current year ──
  const year = new Date().getFullYear();
  const revenueByMonth = new Array(12).fill(0);
  const expenseByMonth = new Array(12).fill(0);

  for (const inv of invoices) {
    if (inv.status !== 'paid' || !inv.paidAt) continue;
    const d = new Date(inv.paidAt);
    if (d.getFullYear() !== year) continue;
    revenueByMonth[d.getMonth()] += Number(inv.amount) || 0;
  }
  for (const exp of expenses) {
    if (!['approved', 'reimbursed'].includes(exp.status)) continue;
    const d = new Date(exp.date);
    if (d.getFullYear() !== year) continue;
    expenseByMonth[d.getMonth()] += Number(exp.amount) || 0;
  }

  const revenueData = MONTH_LABELS.map((month, i) => ({
    month,
    revenue: Math.round(revenueByMonth[i]),
    expenses: Math.round(expenseByMonth[i]),
    profit: Math.round(revenueByMonth[i] - expenseByMonth[i]),
  }));

  // ── Headcount by department ──
  const headcountByDept = new Map<string, number>();
  for (const e of employees) {
    const name = (e as any).department?.name ?? 'Unassigned';
    headcountByDept.set(name, (headcountByDept.get(name) ?? 0) + 1);
  }

  // ── Pipeline ──
  const openOpps = opportunities.filter((o: any) => !String(o.stage).startsWith('closed'));
  const wonOpps = opportunities.filter((o: any) => o.stage === 'closed-won');

  return {
    canSeeFinance,
    canSeeSalary: canViewSalary(user.role),

    headline: {
      headcount: employees.length,
      activeProjects: projects.filter((p: any) => p.status === 'active').length,
      totalProjects: projects.length,
      departments: departments.length,
      totalRevenue: Math.round(revenueByMonth.reduce((a, b) => a + b, 0)),
      totalExpenses: Math.round(expenseByMonth.reduce((a, b) => a + b, 0)),
      pipelineValue: Math.round(openOpps.reduce((s: number, o: any) => s + (Number(o.amount) || 0), 0)),
      wonValue: Math.round(wonOpps.reduce((s: number, o: any) => s + (Number(o.amount) || 0), 0)),
      totalLeads: leads.length,
    },

    revenueData,

    departmentHeadcount: Array.from(headcountByDept.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),

    projectHealth: ['green', 'amber', 'red'].map(health => ({
      health,
      count: projects.filter((p: any) => p.health === health).length,
    })),

    leadsBySource: countBy(leads, (l: any) => l.source || 'unknown')
      .map(([source, count]) => ({ source, count })),

    expensesByCategory: canSeeFinance
      ? sumBy(expenses, (e: any) => e.category, (e: any) => Number(e.amount) || 0)
          .map(([category, amount]) => ({ category, amount: Math.round(amount) }))
      : [],
  };
}
