'use server';

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';

/** Roles permitted to read the audit trail. */
const AUDIT_ROLES = ['ceo', 'admin', 'cfo', 'legal'];

export type AuditFilter = {
  entity?: string;
  actorId?: string;
  search?: string;
  limit?: number;
};

export type AuditEntryDTO = {
  id: string;
  actorId: string | null;
  actorName: string;
  action: string;
  entity: string;
  entityId: string | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string | Date;
};

export async function listAuditEntries(filter: AuditFilter = {}): Promise<AuditEntryDTO[]> {
  await requireRole(AUDIT_ROLES);

  const where: any = {};
  if (filter.entity) where.entity = filter.entity;
  if (filter.actorId) where.actorId = filter.actorId;

  const entries = await prisma.auditLog.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { createdAt: 'desc' },
    take: Math.min(filter.limit ?? 200, 500),
  });

  // The shim has no full-text support, so narrow in memory.
  const search = filter.search?.trim().toLowerCase();
  const rows = search
    ? entries.filter((e: any) =>
        [e.actorName, e.action, e.entity, e.details]
          .filter(Boolean)
          .some((v: string) => String(v).toLowerCase().includes(search))
      )
    : entries;

  return rows.map((e: any) => ({
    id: e.id,
    actorId: e.actorId,
    actorName: e.actorName,
    action: e.action,
    entity: e.entity,
    entityId: e.entityId,
    details: e.details,
    ipAddress: e.ipAddress,
    createdAt: e.createdAt,
  }));
}

/** Distinct entity names present in the log, for the filter dropdown. */
export async function listAuditEntities(): Promise<string[]> {
  await requireRole(AUDIT_ROLES);
  const entries = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 500 });
  const entities: string[] = entries
    .map((e: any) => String(e.entity ?? ''))
    .filter((e: string) => e.length > 0);
  return Array.from(new Set<string>(entities)).sort();
}
