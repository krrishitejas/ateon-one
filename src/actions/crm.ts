'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';

const CRM_ADMIN = ['ceo', 'admin', 'cfo', 'coo', 'manager'];

const ACCOUNT_TYPES = ['prospect', 'customer', 'partner', 'vendor'];
const ACCOUNT_STATUSES = ['active', 'inactive', 'churned'];
const STAGES = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];
const OPP_TYPES = ['new-business', 'existing-business', 'renewal'];
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

// ─────────────────────────── Accounts ───────────────────────────

export async function listAccounts(status?: string) {
  await requireSession();
  const accounts = await prisma.account.findMany({
    where: status && ACCOUNT_STATUSES.includes(status) ? { status } : undefined,
    orderBy: { name: 'asc' },
  });
  return accounts.map((a: any) => ({
    ...a,
    revenue: Number(a.revenue) || 0,
    employeeCount: Number(a.employeeCount) || 0,
  }));
}

export async function upsertAccount(input: {
  id?: string;
  name: string;
  industry?: string;
  type?: string;
  website?: string;
  revenue?: number;
  employeeCount?: number;
  phone?: string;
  email?: string;
  address?: string;
  status?: string;
}) {
  const user = await requireRole(CRM_ADMIN);

  const name = input.name?.trim();
  if (!name) throw new Error('Account name is required');
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new Error('Enter a valid email address');
  }
  if (input.revenue !== undefined && input.revenue < 0) throw new Error('Revenue cannot be negative');

  const data = {
    name,
    industry: input.industry?.trim() || null,
    type: input.type && ACCOUNT_TYPES.includes(input.type) ? input.type : 'prospect',
    website: input.website?.trim() || null,
    revenue: input.revenue ?? 0,
    employeeCount: input.employeeCount ?? 0,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    status: input.status && ACCOUNT_STATUSES.includes(input.status) ? input.status : 'active',
    lastActivity: new Date(),
    ownerId: input.id ? undefined : user.id,
  };

  const account = input.id
    ? await prisma.account.update({ where: { id: input.id }, data })
    : await prisma.account.create({ data });

  await logAudit(user, input.id ? 'crm.account.update' : 'crm.account.create', 'Account', account.id, name);
  return account;
}

export async function deleteAccount(id: string) {
  const user = await requireRole(CRM_ADMIN);

  const open = await prisma.opportunity.count({ where: { accountId: id } });
  if (open > 0) throw new Error(`${open} opportunity(ies) are linked to this account`);

  await prisma.account.delete({ where: { id } });
  await logAudit(user, 'crm.account.delete', 'Account', id);
  return { success: true };
}

// ─────────────────────────── Opportunities ───────────────────────────

export async function listOpportunities(stage?: string) {
  await requireSession();
  const opportunities = await prisma.opportunity.findMany({
    where: stage && STAGES.includes(stage) ? { stage } : undefined,
    include: { account: true },
    orderBy: { createdAt: 'desc' },
  });
  return opportunities.map((o: any) => ({
    ...o,
    amount: Number(o.amount) || 0,
    probability: Number(o.probability) || 0,
    accountName: o.account?.name ?? null,
  }));
}

export async function upsertOpportunity(input: {
  id?: string;
  name: string;
  accountId?: string;
  stage?: string;
  amount?: number;
  probability?: number;
  closeDate?: string;
  type?: string;
  source?: string;
  nextStep?: string;
  description?: string;
}) {
  const user = await requireRole(CRM_ADMIN);

  const name = input.name?.trim();
  if (!name) throw new Error('Opportunity name is required');
  if (input.amount !== undefined && input.amount < 0) throw new Error('Amount cannot be negative');
  if (input.probability !== undefined && (input.probability < 0 || input.probability > 100)) {
    throw new Error('Probability must be between 0 and 100');
  }

  let closeDate: Date | null = null;
  if (input.closeDate) {
    closeDate = new Date(input.closeDate);
    if (Number.isNaN(closeDate.getTime())) throw new Error('Invalid close date');
  }

  const stage = input.stage && STAGES.includes(input.stage) ? input.stage : 'prospecting';

  const data = {
    name,
    accountId: input.accountId || null,
    stage,
    amount: input.amount ?? 0,
    // Closed stages pin probability to their real value.
    probability:
      stage === 'closed-won' ? 100
      : stage === 'closed-lost' ? 0
      : input.probability ?? 0,
    closeDate,
    type: input.type && OPP_TYPES.includes(input.type) ? input.type : 'new-business',
    source: input.source?.trim() || null,
    nextStep: input.nextStep?.trim() || null,
    description: input.description?.trim() || null,
    ownerId: input.id ? undefined : user.id,
  };

  const opp = input.id
    ? await prisma.opportunity.update({ where: { id: input.id }, data })
    : await prisma.opportunity.create({ data });

  // Touch the parent account so "last activity" stays meaningful.
  if (data.accountId) {
    await prisma.account.update({ where: { id: data.accountId }, data: { lastActivity: new Date() } }).catch(() => {});
  }

  await logAudit(user, input.id ? 'crm.opportunity.update' : 'crm.opportunity.create', 'Opportunity', opp.id, name);
  return opp;
}

export async function deleteOpportunity(id: string) {
  const user = await requireRole(CRM_ADMIN);
  await prisma.opportunity.delete({ where: { id } });
  await logAudit(user, 'crm.opportunity.delete', 'Opportunity', id);
  return { success: true };
}

// ─────────────────────────── Leads ───────────────────────────

export async function listLeads(status?: string) {
  await requireSession();
  const leads = await prisma.lead.findMany({
    where: status && LEAD_STATUSES.includes(status) ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });
  return leads.map((l: any) => ({
    ...l,
    estimatedValue: Number(l.estimatedValue) || 0,
    score: Number(l.score) || 0,
  }));
}

export async function upsertLead(input: {
  id?: string;
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  source?: string;
  status?: string;
  estimatedValue?: number;
  score?: number;
  industry?: string;
  notes?: string;
}) {
  const user = await requireSession();

  const name = input.name?.trim();
  if (!name) throw new Error('Lead name is required');
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new Error('Enter a valid email address');
  }
  if (input.score !== undefined && (input.score < 0 || input.score > 100)) {
    throw new Error('Score must be between 0 and 100');
  }

  const data = {
    name,
    company: input.company?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    source: input.source?.trim() || null,
    status: input.status && LEAD_STATUSES.includes(input.status) ? input.status : 'new',
    estimatedValue: input.estimatedValue ?? 0,
    score: input.score ?? 50,
    industry: input.industry?.trim() || null,
    notes: input.notes?.trim() || null,
    lastActivity: new Date(),
    ownerId: input.id ? undefined : user.id,
  };

  const lead = input.id
    ? await prisma.lead.update({ where: { id: input.id }, data })
    : await prisma.lead.create({ data });

  await logAudit(user, input.id ? 'crm.lead.update' : 'crm.lead.create', 'Lead', lead.id, name);
  return lead;
}

export async function deleteLead(id: string) {
  const user = await requireRole(CRM_ADMIN);
  await prisma.lead.delete({ where: { id } });
  await logAudit(user, 'crm.lead.delete', 'Lead', id);
  return { success: true };
}

/** Pipeline totals for the CRM dashboard. */
export async function getCrmSummary() {
  await requireSession();
  const [opportunities, accounts, leads] = await Promise.all([
    prisma.opportunity.findMany({}),
    prisma.account.count({ where: { status: 'active' } }),
    prisma.lead.count({}),
  ]);

  const openOpps = opportunities.filter((o: any) => !String(o.stage).startsWith('closed'));
  const pipelineValue = openOpps.reduce((s: number, o: any) => s + (Number(o.amount) || 0), 0);
  const weightedValue = openOpps.reduce(
    (s: number, o: any) => s + (Number(o.amount) || 0) * ((Number(o.probability) || 0) / 100),
    0
  );
  const won = opportunities.filter((o: any) => o.stage === 'closed-won');
  const lost = opportunities.filter((o: any) => o.stage === 'closed-lost');
  const decided = won.length + lost.length;

  return {
    pipelineValue,
    weightedValue,
    openCount: openOpps.length,
    wonValue: won.reduce((s: number, o: any) => s + (Number(o.amount) || 0), 0),
    winRate: decided > 0 ? Math.round((won.length / decided) * 100) : 0,
    activeAccounts: accounts,
    totalLeads: leads,
    byStage: STAGES.map(stage => ({
      stage,
      count: opportunities.filter((o: any) => o.stage === stage).length,
      value: opportunities
        .filter((o: any) => o.stage === stage)
        .reduce((s: number, o: any) => s + (Number(o.amount) || 0), 0),
    })),
  };
}
