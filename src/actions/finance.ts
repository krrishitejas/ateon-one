'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';

const FINANCE_ROLES = ['ceo', 'cfo'];

// ─── Budgets ───

export async function listBudgets(fiscalYear?: string) {
  await requireRole(FINANCE_ROLES);
  return prisma.budget.findMany({
    where: fiscalYear ? { fiscalYear } : undefined,
    orderBy: [{ department: 'asc' }, { category: 'asc' }],
  });
}

export async function upsertBudget(input: {
  id?: string;
  department: string;
  category: string;
  fiscalYear: string;
  allocated: number;
  spent?: number;
  status?: string;
}) {
  const user = await requireRole(FINANCE_ROLES);
  const data = {
    department: input.department,
    category: input.category,
    fiscalYear: input.fiscalYear,
    allocated: input.allocated,
    spent: input.spent ?? 0,
    status: input.status ?? 'on-track',
  };
  const budget = input.id
    ? await prisma.budget.update({ where: { id: input.id }, data })
    : await prisma.budget.create({ data });
  await logAudit(user, 'finance.budget.upsert', 'Budget', budget.id, `${input.department}/${input.category}`);
  return budget;
}

// ─── Expenses ───

export async function listExpenses(status?: string) {
  await requireRole(FINANCE_ROLES);
  return prisma.expense.findMany({
    where: status ? { status } : undefined,
    orderBy: { date: 'desc' },
  });
}

export async function submitExpense(input: {
  description: string;
  category: string;
  amount: number;
  vendor?: string;
  date?: string;
  receiptUrl?: string;
}) {
  const user = await requireSession();
  const expense = await prisma.expense.create({
    data: {
      description: input.description,
      category: input.category,
      amount: input.amount,
      vendor: input.vendor ?? null,
      date: input.date ? new Date(input.date) : new Date(),
      receiptUrl: input.receiptUrl ?? null,
      submittedById: user.id,
      submittedBy: user.name,
    },
  });
  await logAudit(user, 'finance.expense.submit', 'Expense', expense.id, `₹${input.amount}`);
  return expense;
}

export async function setExpenseStatus(id: string, status: 'approved' | 'rejected' | 'reimbursed') {
  const user = await requireRole(FINANCE_ROLES);
  const expense = await prisma.expense.update({ where: { id }, data: { status } });
  await logAudit(user, `finance.expense.${status}`, 'Expense', id);
  return expense;
}

// ─── Invoices ───

export async function listInvoices(status?: string) {
  await requireRole(FINANCE_ROLES);
  return prisma.invoice.findMany({
    where: status ? { status } : undefined,
    orderBy: { issueDate: 'desc' },
  });
}

export async function createInvoice(input: {
  number: string;
  clientName: string;
  amount: number;
  dueDate: string;
  currency?: string;
  notes?: string;
}) {
  const user = await requireRole(FINANCE_ROLES);
  const invoice = await prisma.invoice.create({
    data: {
      number: input.number,
      clientName: input.clientName,
      amount: input.amount,
      dueDate: new Date(input.dueDate),
      currency: input.currency ?? 'INR',
      notes: input.notes ?? null,
      status: 'draft',
    },
  });
  await logAudit(user, 'finance.invoice.create', 'Invoice', invoice.id, invoice.number);
  return invoice;
}

export async function setInvoiceStatus(id: string, status: 'draft' | 'sent' | 'paid' | 'overdue' | 'void') {
  const user = await requireRole(FINANCE_ROLES);
  const invoice = await prisma.invoice.update({
    where: { id },
    data: { status, paidAt: status === 'paid' ? new Date() : null },
  });
  await logAudit(user, `finance.invoice.${status}`, 'Invoice', id);
  return invoice;
}

// ─── Overview ───

export async function getFinanceOverview() {
  await requireRole(FINANCE_ROLES);
  const [budgets, expenseAgg, invoices] = await Promise.all([
    prisma.budget.findMany(),
    prisma.expense.aggregate({ _sum: { amount: true }, where: { status: { in: ['approved', 'reimbursed'] } } }),
    prisma.invoice.findMany({ select: { amount: true, status: true } }),
  ]);
  const allocated = budgets.reduce((a: number, b: any) => a + b.allocated, 0);
  const spent = budgets.reduce((a: number, b: any) => a + b.spent, 0);
  const receivable = invoices.filter((i: any) => i.status === 'sent' || i.status === 'overdue').reduce((a: number, i: any) => a + i.amount, 0);
  const collected = invoices.filter((i: any) => i.status === 'paid').reduce((a: number, i: any) => a + i.amount, 0);
  return { allocated, spent, approvedExpenses: expenseAgg._sum.amount ?? 0, receivable, collected };
}
