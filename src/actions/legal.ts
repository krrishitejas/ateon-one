'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';

const LEGAL_ROLES = ['ceo', 'admin', 'legal', 'cfo', 'coo'];

const TYPES = ['nda', 'service', 'employment', 'vendor', 'license'];
const STATUSES = ['draft', 'review', 'active', 'expired', 'terminated'];

export type ContractDTO = {
  id: string;
  title: string;
  type: string;
  party: string;
  startDate: string | Date;
  endDate: string | Date | null;
  status: string;
  value: number | null;
  currency: string;
  signatories: string[];
  renewalNotice: number;
  notes: string | null;
  /** Days until expiry; negative once expired, null when open-ended. */
  daysToExpiry: number | null;
  needsRenewal: boolean;
};

function parseSignatories(raw: any): string[] {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter((x: unknown) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function shape(c: any): ContractDTO {
  const end = c.endDate ? new Date(c.endDate) : null;
  const daysToExpiry = end
    ? Math.ceil((end.getTime() - Date.now()) / 86_400_000)
    : null;

  return {
    id: c.id,
    title: c.title,
    type: c.type,
    party: c.party,
    startDate: c.startDate,
    endDate: c.endDate,
    status: c.status,
    value: c.value == null ? null : Number(c.value),
    currency: c.currency,
    signatories: parseSignatories(c.signatories),
    renewalNotice: Number(c.renewalNotice) || 30,
    notes: c.notes,
    daysToExpiry,
    needsRenewal:
      daysToExpiry !== null &&
      daysToExpiry >= 0 &&
      daysToExpiry <= (Number(c.renewalNotice) || 30) &&
      !['terminated', 'expired'].includes(c.status),
  };
}

export async function listContracts(status?: string): Promise<ContractDTO[]> {
  await requireRole(LEGAL_ROLES);

  const contracts = await prisma.contract.findMany({
    where: status && STATUSES.includes(status) ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
  });

  return contracts.map(shape) as ContractDTO[];
}

export async function upsertContract(input: {
  id?: string;
  title: string;
  type?: string;
  party: string;
  startDate: string;
  endDate?: string;
  status?: string;
  value?: number;
  signatories?: string[];
  renewalNotice?: number;
  notes?: string;
}) {
  const user = await requireRole(LEGAL_ROLES);

  const title = input.title?.trim();
  const party = input.party?.trim();
  if (!title) throw new Error('Title is required');
  if (!party) throw new Error('Counterparty is required');

  const startDate = new Date(input.startDate);
  if (Number.isNaN(startDate.getTime())) throw new Error('A valid start date is required');

  let endDate: Date | null = null;
  if (input.endDate) {
    endDate = new Date(input.endDate);
    if (Number.isNaN(endDate.getTime())) throw new Error('Invalid end date');
    if (endDate < startDate) throw new Error('End date cannot be before the start date');
  }

  if (input.value !== undefined && input.value < 0) throw new Error('Value cannot be negative');

  const data = {
    title,
    party,
    type: input.type && TYPES.includes(input.type) ? input.type : 'service',
    startDate,
    endDate,
    status: input.status && STATUSES.includes(input.status) ? input.status : 'draft',
    value: input.value ?? null,
    signatories: JSON.stringify(input.signatories ?? []),
    renewalNotice: input.renewalNotice ?? 30,
    notes: input.notes?.trim() || null,
    ownerId: input.id ? undefined : user.id,
  };

  const contract = input.id
    ? await prisma.contract.update({ where: { id: input.id }, data })
    : await prisma.contract.create({ data });

  await logAudit(user, input.id ? 'legal.contract.update' : 'legal.contract.create', 'Contract', contract.id, title);
  return shape(contract);
}

export async function deleteContract(id: string) {
  const user = await requireRole(['ceo', 'admin', 'legal']);
  await prisma.contract.delete({ where: { id } });
  await logAudit(user, 'legal.contract.delete', 'Contract', id);
  return { success: true };
}

/**
 * Expire contracts whose end date has passed. Safe to call repeatedly — it only
 * touches rows that are currently 'active' or 'review'.
 */
export async function expireLapsedContracts() {
  const user = await requireRole(LEGAL_ROLES);
  const contracts = await prisma.contract.findMany({ where: { status: 'active' } });

  let expired = 0;
  for (const c of contracts) {
    if (!c.endDate) continue;
    if (new Date(c.endDate).getTime() >= Date.now()) continue;
    await prisma.contract.update({ where: { id: c.id }, data: { status: 'expired' } });
    expired++;
  }

  if (expired > 0) await logAudit(user, 'legal.contract.expire', 'Contract', undefined, `${expired} expired`);
  return { expired };
}

export async function getLegalSummary() {
  await requireRole(LEGAL_ROLES);
  const contracts: ContractDTO[] = (await prisma.contract.findMany({})).map(shape);

  return {
    total: contracts.length,
    active: contracts.filter((c) => c.status === 'active').length,
    inReview: contracts.filter((c) => c.status === 'review').length,
    expiringSoon: contracts.filter((c) => c.needsRenewal).length,
    expired: contracts.filter((c) => c.status === 'expired').length,
    totalValue: contracts
      .filter((c) => c.status === 'active')
      .reduce((sum: number, c: ContractDTO) => sum + (c.value ?? 0), 0),
    renewals: contracts
      .filter((c) => c.needsRenewal)
      .sort((a, b) => (a.daysToExpiry ?? 0) - (b.daysToExpiry ?? 0))
      .slice(0, 5),
  };
}
