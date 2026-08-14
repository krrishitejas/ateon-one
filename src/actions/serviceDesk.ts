'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';
import { emitToOrg } from '@/lib/realtime';

const AGENT_ROLES = ['ceo', 'admin', 'coo', 'cto', 'chro', 'hr', 'manager'];
const CATEGORIES = ['it', 'hr', 'facilities', 'finance', 'general'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in-progress', 'resolved', 'closed'];

/** Hours until SLA breach, by priority. */
const SLA_HOURS: Record<string, number> = { critical: 4, high: 8, medium: 24, low: 72 };

export async function listTickets(status?: string) {
  const user = await requireSession();
  const isAgent = AGENT_ROLES.includes(user.role);

  const where: any = {};
  if (status && STATUSES.includes(status)) where.status = status;
  // Requesters see only the tickets they raised.
  if (!isAgent) where.reportedBy = user.name;

  const tickets = await prisma.serviceTicket.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { createdAt: 'desc' },
  });

  const now = Date.now();
  return tickets.map((t: any) => ({
    ...t,
    slaBreached:
      !!t.slaDeadline && !['resolved', 'closed'].includes(t.status) && new Date(t.slaDeadline).getTime() < now,
  }));
}

export async function createTicket(input: {
  subject: string;
  description: string;
  category?: string;
  priority?: string;
}) {
  const user = await requireSession();

  const subject = input.subject?.trim();
  if (!subject) throw new Error('Subject is required');
  if (!input.description?.trim()) throw new Error('Description is required');

  const priority = input.priority && PRIORITIES.includes(input.priority) ? input.priority : 'medium';
  const category = input.category && CATEGORIES.includes(input.category) ? input.category : 'general';

  const ticket = await prisma.serviceTicket.create({
    data: {
      subject,
      description: input.description.trim(),
      category,
      priority,
      status: 'open',
      reportedBy: user.name,
      slaDeadline: new Date(Date.now() + (SLA_HOURS[priority] ?? 24) * 60 * 60 * 1000),
    },
  });

  await logAudit(user, 'ticket.create', 'ServiceTicket', ticket.id, subject);
  emitToOrg('tickets:changed', { id: ticket.id });
  emitToOrg('notifications:refresh', { reason: 'ticket.created' });
  return ticket;
}

export async function updateTicket(
  id: string,
  input: { status?: string; priority?: string; assignedTo?: string | null }
) {
  const user = await requireSession();

  const existing = await prisma.serviceTicket.findUnique({ where: { id } });
  if (!existing) throw new Error('Ticket not found');

  const isAgent = AGENT_ROLES.includes(user.role);
  const isReporter = existing.reportedBy === user.name;

  // Reporters may close their own ticket; everything else is agent-only.
  if (!isAgent) {
    if (!isReporter) throw new Error('Forbidden: that ticket is not yours');
    if (input.priority !== undefined || input.assignedTo !== undefined) {
      throw new Error('Only support agents can reassign or reprioritise a ticket');
    }
    if (input.status && !['closed'].includes(input.status)) {
      throw new Error('You can only close your own ticket');
    }
  }

  const data: any = {};
  if (input.status && STATUSES.includes(input.status)) data.status = input.status;
  if (input.priority && PRIORITIES.includes(input.priority)) data.priority = input.priority;
  if (input.assignedTo !== undefined) data.assignedTo = input.assignedTo || null;

  if (Object.keys(data).length === 0) throw new Error('Nothing to update');

  const ticket = await prisma.serviceTicket.update({ where: { id }, data });
  await logAudit(user, 'ticket.update', 'ServiceTicket', id, JSON.stringify(data));
  return ticket;
}

export async function getTicketSummary() {
  const user = await requireSession();
  const isAgent = AGENT_ROLES.includes(user.role);
  const base: any = isAgent ? {} : { reportedBy: user.name };

  const [open, inProgress, resolved, closed] = await Promise.all([
    prisma.serviceTicket.count({ where: { ...base, status: 'open' } }),
    prisma.serviceTicket.count({ where: { ...base, status: 'in-progress' } }),
    prisma.serviceTicket.count({ where: { ...base, status: 'resolved' } }),
    prisma.serviceTicket.count({ where: { ...base, status: 'closed' } }),
  ]);

  return { open, inProgress, resolved, closed, isAgent };
}
