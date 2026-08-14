'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';
import { getMyEmployee } from '@/lib/scope';
import { emitToOrg } from '@/lib/realtime';

const APPROVER_ROLES = ['ceo', 'admin', 'cfo', 'coo', 'chro', 'hr', 'legal', 'manager'];

/**
 * Who signs off on what, in order. A step is only reachable once every step
 * before it is approved — so a budget request goes manager -> CFO -> CEO
 * rather than any one approver settling it alone.
 *
 * Amount thresholds let small requests skip senior sign-off entirely.
 */
const APPROVAL_CHAINS: Record<string, Array<{ role: string; minAmount?: number }>> = {
  expense:     [{ role: 'manager' }, { role: 'cfo', minAmount: 50000 }, { role: 'ceo', minAmount: 500000 }],
  budget:      [{ role: 'cfo' }, { role: 'ceo', minAmount: 1000000 }],
  procurement: [{ role: 'manager' }, { role: 'cfo', minAmount: 100000 }, { role: 'ceo', minAmount: 1000000 }],
  leave:       [{ role: 'manager' }, { role: 'chro', minAmount: undefined }],
  other:       [{ role: 'manager' }],
};

/** Roles that can act on a step, beyond the exact role named. */
function canActOnStep(stepRole: string, userRole: string): boolean {
  if (userRole === stepRole) return true;
  // CEO and admin can unblock any step so a chain never deadlocks on an
  // unfilled role.
  return userRole === 'ceo' || userRole === 'admin';
}

/** Build the chain for a request, dropping steps below their amount threshold. */
function buildChain(type: string, amount?: number | null) {
  const chain = APPROVAL_CHAINS[type] ?? APPROVAL_CHAINS.other;
  return chain.filter((s) => s.minAmount === undefined || (amount ?? 0) >= s.minAmount);
}
const APPROVAL_TYPES = ['expense', 'leave', 'procurement', 'budget', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export async function listApprovals(status?: 'pending' | 'approved' | 'rejected') {
  const user = await requireSession();

  const canApprove = APPROVER_ROLES.includes(user.role);
  const where: any = {};
  if (status) where.status = status;
  // Requesters only ever see their own submissions.
  if (!canApprove) where.requestedBy = user.name;

  const approvals = await prisma.approval.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: { steps: true },
    orderBy: { createdAt: 'desc' },
  });

  // Mark which requests this user can actually action right now.
  return approvals.map((a: any) => {
    const steps = a.steps ?? [];
    const active = steps.find((s: any) => s.status === 'pending');
    return {
      ...a,
      steps,
      activeStep: active ?? null,
      canActNow:
        a.status === 'pending' &&
        a.requestedBy !== user.name &&
        (!active || canActOnStep(active.role, user.role)),
    };
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

  // Materialise the sign-off chain. First step is live, the rest wait.
  const chain = buildChain(input.type, input.amount);
  for (let i = 0; i < chain.length; i++) {
    await prisma.approvalStep.create({
      data: {
        approvalId: approval.id,
        sequence: i,
        role: chain[i].role,
        status: i === 0 ? 'pending' : 'waiting',
      },
    });
  }
  await prisma.approval.update({
    where: { id: approval.id },
    data: { currentStep: chain[0]?.role ?? null },
  });

  await logAudit(user, 'approval.create', 'Approval', approval.id, title);
  emitToOrg('approvals:changed', { id: approval.id, status: 'pending' });
  emitToOrg('notifications:refresh', { reason: 'approval.created' });
  return approval;
}

export async function setApprovalStatus(id: string, status: 'approved' | 'rejected', comment?: string) {
  const user = await requireRole(APPROVER_ROLES);

  const existing = await prisma.approval.findUnique({ where: { id } });
  if (!existing) throw new Error('Approval not found');
  if (existing.status !== 'pending') {
    throw new Error(`This request was already ${existing.status}`);
  }
  if (existing.requestedBy === user.name) {
    throw new Error('You cannot decide your own request');
  }

  const steps = await prisma.approvalStep.findMany({
    where: { approvalId: id },
    orderBy: { sequence: 'asc' },
  });

  // No chain (legacy row) — decide it outright.
  if (steps.length === 0) {
    const approval = await prisma.approval.update({
      where: { id },
      data: { status, decidedBy: user.name, decidedAt: new Date() },
    });
    await logAudit(user, `approval.${status}`, 'Approval', id, existing.title);
    emitToOrg('approvals:changed', { id, status });
    emitToOrg('notifications:refresh', { reason: 'approval.decided' });
    return approval;
  }

  const active = steps.find((s: any) => s.status === 'pending');
  if (!active) throw new Error('This request has no step awaiting a decision');
  if (!canActOnStep(active.role, user.role)) {
    throw new Error(`This step is awaiting ${active.role.toUpperCase()} sign-off`);
  }

  await prisma.approvalStep.update({
    where: { id: active.id },
    data: { status, decidedBy: user.name, decidedAt: new Date(), comment: comment ?? null },
  });

  // A rejection at any step ends the whole request.
  if (status === 'rejected') {
    const approval = await prisma.approval.update({
      where: { id },
      data: { status: 'rejected', decidedBy: user.name, decidedAt: new Date(), currentStep: null },
    });
    await logAudit(user, 'approval.rejected', 'Approval', id, `${existing.title} @ ${active.role}`);
    emitToOrg('approvals:changed', { id, status: 'rejected' });
    emitToOrg('notifications:refresh', { reason: 'approval.decided' });
    return approval;
  }

  // Otherwise advance to the next step, or finish.
  const next = steps.find((s: any) => s.sequence > active.sequence && s.status === 'waiting');
  if (next) {
    await prisma.approvalStep.update({ where: { id: next.id }, data: { status: 'pending' } });
    const approval = await prisma.approval.update({
      where: { id },
      data: { currentStep: next.role },
    });
    await logAudit(user, 'approval.step.approved', 'Approval', id, `${existing.title} @ ${active.role}`);
    emitToOrg('approvals:changed', { id, status: 'pending' });
    emitToOrg('notifications:refresh', { reason: 'approval.step' });
    return approval;
  }

  const approval = await prisma.approval.update({
    where: { id },
    data: { status: 'approved', decidedBy: user.name, decidedAt: new Date(), currentStep: null },
  });
  await logAudit(user, 'approval.approved', 'Approval', id, existing.title);
  emitToOrg('approvals:changed', { id, status: 'approved' });
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
