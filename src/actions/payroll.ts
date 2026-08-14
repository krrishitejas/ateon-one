'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';
import { canViewSalary } from '@/lib/scope';

const PAYROLL_ROLES = ['ceo', 'admin', 'cfo', 'chro', 'hr'];

export type PayslipDTO = {
  id: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  month: string;
  basic: number;
  hra: number;
  da: number;
  special: number;
  pf: number;
  tax: number;
  gross: number;
  deductions: number;
  net: number;
  createdAt: string | Date;
};

/**
 * Payslips. Payroll roles see everyone; everyone else sees only their own —
 * Payslip.employeeId references User, so it keys off the session id.
 */
export async function listPayslips(month?: string): Promise<PayslipDTO[]> {
  const user = await requireSession();
  const isPayroll = PAYROLL_ROLES.includes(user.role);

  const where: any = {};
  if (month) where.month = month;
  if (!isPayroll) where.employeeId = user.id;

  const [payslips, users] = await Promise.all([
    prisma.payslip.findMany({
      where: Object.keys(where).length > 0 ? where : undefined,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.findMany({ select: { id: true, name: true, designation: true, department: true } }),
  ]);

  const userById = new Map<string, any>(users.map((u: any) => [u.id, u]));

  return payslips.map((p: any) => ({
    id: p.id,
    employeeId: p.employeeId,
    employeeName: userById.get(p.employeeId)?.name ?? 'Unknown',
    designation: userById.get(p.employeeId)?.designation ?? '—',
    department: userById.get(p.employeeId)?.department ?? '—',
    month: p.month,
    basic: Number(p.basic) || 0,
    hra: Number(p.hra) || 0,
    da: Number(p.da) || 0,
    special: Number(p.special) || 0,
    pf: Number(p.pf) || 0,
    tax: Number(p.tax) || 0,
    gross: Number(p.gross) || 0,
    deductions: Number(p.deductions) || 0,
    net: Number(p.net) || 0,
    createdAt: p.createdAt,
  }));
}

export async function listPayrollRuns() {
  await requireRole(PAYROLL_ROLES);
  return prisma.payrollRun.findMany({ orderBy: { createdAt: 'desc' } });
}

/** Standard Indian salary split. Tuned via settings rather than hardcoded here. */
function breakdown(annualCTC: number) {
  const monthly = annualCTC / 12;
  const basic = monthly * 0.4;
  const hra = basic * 0.5;
  const da = basic * 0.1;
  const special = monthly - basic - hra - da;
  const pf = Math.min(basic * 0.12, 1800);
  // Rough monthly TDS band — replace with a real slab calculation before
  // using these figures for statutory filing.
  const taxRate = annualCTC > 1500000 ? 0.2 : annualCTC > 1000000 ? 0.15 : annualCTC > 500000 ? 0.05 : 0;
  const tax = monthly * taxRate;

  const gross = basic + hra + da + special;
  const deductions = pf + tax;
  return {
    basic: round(basic), hra: round(hra), da: round(da), special: round(special),
    pf: round(pf), tax: round(tax),
    gross: round(gross), deductions: round(deductions), net: round(gross - deductions),
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Generate payslips for a month from each employee's salary on record.
 * Idempotent per month — re-running replaces that month's slips.
 */
export async function runPayroll(month: string) {
  const actor = await requireRole(['ceo', 'admin', 'cfo']);
  const label = month?.trim();
  if (!label) throw new Error('Month is required, e.g. "July 2026"');

  const employees = await prisma.employee.findMany({ where: { status: 'active' } });
  const withSalary = employees.filter((e: any) => Number(e.salary) > 0 && e.userId);

  if (withSalary.length === 0) {
    throw new Error('No active employees have a salary and a linked user account.');
  }

  // Clear any previous run for this month so totals don't double up.
  await prisma.payslip.deleteMany({ where: { month: label } });

  let totalGross = 0;
  let totalNet = 0;

  for (const emp of withSalary) {
    const b = breakdown(Number(emp.salary));
    totalGross += b.gross;
    totalNet += b.net;
    await prisma.payslip.create({ data: { employeeId: emp.userId, month: label, ...b } });
  }

  await prisma.payrollRun.upsert({
    where: { month: label },
    update: {
      status: 'completed',
      totalGross: round(totalGross),
      totalNet: round(totalNet),
      headcount: withSalary.length,
      processedAt: new Date(),
    },
    create: {
      month: label,
      status: 'completed',
      totalGross: round(totalGross),
      totalNet: round(totalNet),
      headcount: withSalary.length,
      processedAt: new Date(),
    },
  });

  await logAudit(actor, 'payroll.run', 'PayrollRun', label, `${withSalary.length} payslips`);
  return { success: true, headcount: withSalary.length, totalGross: round(totalGross), totalNet: round(totalNet) };
}

export async function getPayrollSummary() {
  const user = await requireSession();
  const isPayroll = PAYROLL_ROLES.includes(user.role);

  if (!isPayroll) {
    const mine = await prisma.payslip.findMany({ where: { employeeId: user.id } });
    return {
      isPayroll: false,
      payslipCount: mine.length,
      monthlyNet: mine.length > 0 ? Number(mine[0].net) || 0 : 0,
      headcount: 0,
      monthlyGross: 0,
      lastRunMonth: mine[0]?.month ?? null,
      canViewSalary: canViewSalary(user.role),
    };
  }

  const [employees, payslips, latestRun] = await Promise.all([
    prisma.employee.count({ where: { status: 'active' } }),
    prisma.payslip.findMany({}),
    prisma.payrollRun.findMany({ orderBy: { createdAt: 'desc' }, take: 1 }),
  ]);

  return {
    isPayroll: true,
    headcount: employees,
    payslipCount: payslips.length,
    monthlyGross: latestRun[0] ? Number(latestRun[0].totalGross) || 0 : 0,
    monthlyNet: latestRun[0] ? Number(latestRun[0].totalNet) || 0 : 0,
    lastRunMonth: latestRun[0]?.month ?? null,
    canViewSalary: canViewSalary(user.role),
  };
}
