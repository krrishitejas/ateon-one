'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { getVisibleEmployeeIds } from '@/lib/scope';

export type SearchHit = {
  label: string;
  description: string;
  route: string;
  kind: 'employee' | 'project' | 'lead' | 'account' | 'opportunity' | 'ticket' | 'vendor';
};

const LIMIT_PER_KIND = 5;

/**
 * Cross-module search, run server-side so we don't ship every table to the
 * browser. Results respect the caller's employee scope.
 */
export async function globalSearch(query: string): Promise<SearchHit[]> {
  const user = await requireSession();
  const q = query?.trim().toLowerCase();
  if (!q || q.length < 2) return [];

  const matches = (...fields: (string | null | undefined)[]) =>
    fields.some((f) => f && String(f).toLowerCase().includes(q));

  const visible = await getVisibleEmployeeIds(user);

  const [employees, projects, leads, accounts, opportunities, tickets, vendors] = await Promise.all([
    prisma.employee.findMany({
      where: visible === null ? undefined : { id: { in: visible.length > 0 ? visible : ['__none__'] } },
      include: { department: true },
    }),
    prisma.project.findMany({}),
    prisma.lead.findMany({}),
    prisma.account.findMany({}),
    prisma.opportunity.findMany({}),
    prisma.serviceTicket.findMany({}),
    prisma.vendor.findMany({}),
  ]);

  const hits: SearchHit[] = [];

  for (const e of employees.filter((e: any) => matches(e.name, e.designation, e.email)).slice(0, LIMIT_PER_KIND)) {
    hits.push({
      label: e.name,
      description: `${e.designation}${(e as any).department?.name ? ` — ${(e as any).department.name}` : ''}`,
      route: '/hrms',
      kind: 'employee',
    });
  }

  for (const p of projects.filter((p: any) => matches(p.name, p.description)).slice(0, LIMIT_PER_KIND)) {
    hits.push({ label: p.name, description: `Project — ${p.status}`, route: '/projects', kind: 'project' });
  }

  for (const l of leads.filter((l: any) => matches(l.name, l.company, l.email)).slice(0, LIMIT_PER_KIND)) {
    hits.push({ label: l.name, description: `Lead — ${l.company ?? 'no company'}`, route: '/crm', kind: 'lead' });
  }

  for (const a of accounts.filter((a: any) => matches(a.name, a.industry)).slice(0, LIMIT_PER_KIND)) {
    hits.push({ label: a.name, description: `Account — ${a.industry ?? a.type}`, route: '/crm', kind: 'account' });
  }

  for (const o of opportunities.filter((o: any) => matches(o.name, o.description)).slice(0, LIMIT_PER_KIND)) {
    hits.push({ label: o.name, description: `Deal — ${o.stage}`, route: '/crm', kind: 'opportunity' });
  }

  for (const t of tickets.filter((t: any) => matches(t.subject, t.description)).slice(0, LIMIT_PER_KIND)) {
    hits.push({ label: t.subject, description: `Ticket — ${t.category} · ${t.status}`, route: '/service-desk', kind: 'ticket' });
  }

  for (const v of vendors.filter((v: any) => matches(v.name, v.category, v.email)).slice(0, LIMIT_PER_KIND)) {
    hits.push({ label: v.name, description: `Vendor — ${v.category}`, route: '/procurement', kind: 'vendor' });
  }

  return hits;
}
