'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';
import { getMyEmployee } from '@/lib/scope';
import { emitToOrg } from '@/lib/realtime';

const APPROVER_ROLES = ['ceo', 'admin', 'cfo', 'coo', 'chro', 'hr', 'legal', 'manager'];
const APPROVAL_TYPES = ['expense', 'leave', 'procurement', 'budget', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export async function listApprovals(status?: 'pending' | 'approved' | 'rejected') {
  const user = await requireSession();

  const canApprove = APPROVER_ROLES.includes(user.role);
  const where: any = {};
  if (status) where.status = status;
  // Requesters only ever see their own submissions.
  if (!canApprove) where.requestedBy = user.name;

  return prisma.approval.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { createdAt: 'desc' },
  });
}

export async function createApproval(input: {
  title: string;
  type: string;
  amount?: number;
  priority?: string;
}) {
  const user = await requireSession();

  const title = input.title?.trim();
  if (!title) throw new Error('Title is required');
  if (!APPROVAL_TYPES.includes(input.type)) throw new Error('Invalid approval type');
  if (input.amount !== undefined && (!Number.isFinite(input.amount) || input.amount < 0)) {
    throw new Error('Amount must be a positive number');
  }

  const approval = await prisma.approval.create({
    data: {
      title,
      type: input.type,
      requestedBy: user.name,
      amount: input.amount ?? null,
      priority: input.priority && PRIORITIES.includes(input.priority) ? input.priority : 'medium',
      status: 'pending',
    },
  });

  await logAudit(user, 'approval.create', 'Approval', approval.id, title);
  emitToOrg('approvals:changed', { id: approval.id, status: 'pending' });
  emitToOrg('notifications:refresh', { reason: 'approval.created' });
  return approval;
}

export async function setApprovalStatus(id: string, status: 'approved' | 'rejected') {
  const user = await requireRole(APPROVER_ROLES);

  const existing = await prisma.approval.findUnique({ where: { id } });
  if (!existing) throw new Error('Approval not found');
  if (existing.status !== 'pending') {
    throw new Error(`This request was already ${existing.status}`);
  }
  // Nobody signs off their own request.
  if (existing.requestedBy === user.name) {
    throw new Error('You cannot decide your own request');
  }

  const approval = await prisma.approval.update({
    where: { id },
    data: { status, decidedBy: user.name, decidedAt: new Date() },
  });

  await logAudit(user, `approval.${status}`, 'Approval', id, existing.title);
  emitToOrg('approvals:changed', { id, status });
  emitToOrg('notifications:refresh', { reason: 'approval.decided' });
  return approval;
}

/** Counts for the dashboard / badge. */
export async function getApprovalSummary() {
  const user = await requireSession();
  const canApprove = APPROVER_ROLES.includes(user.role);

  const base: any = canApprove ? {} : { requestedBy: user.name };
  const [pending, approved, rejected] = await Promise.all([
    prisma.approval.count({ where: { ...base, status: 'pending' } }),
    prisma.approval.count({ where: { ...base, status: 'approved' } }),
    prisma.approval.count({ where: { ...base, status: 'rejected' } }),
  ]);

  return { pending, approved, rejected, canApprove };
}
