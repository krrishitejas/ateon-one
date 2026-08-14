'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, logAudit } from '@/lib/auth';

const EVENT_TYPES = ['meeting', 'review', 'deadline', 'town-hall', 'holiday'];

export type CalendarEventInput = {
  title: string;
  type?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  /** User ids invited to this event. */
  attendees?: string[];
  meetingUrl?: string;
};

function parseAttendees(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((a) => typeof a === 'string');
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed.filter((a: unknown) => typeof a === 'string') : [];
  } catch {
    return [];
  }
}

function shape(event: any) {
  return {
    id: event.id,
    title: event.title,
    type: event.type,
    date: event.date,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    attendees: parseAttendees(event.attendees),
    createdById: event.createdById,
  };
}

/**
 * Events in a date range. Everyone sees org-wide events (holidays, town halls);
 * meetings are visible to their creator and attendees.
 */
export async function listCalendarEvents(fromISO?: string, toISO?: string) {
  const user = await requireSession();

  const where: any = {};
  if (fromISO || toISO) {
    where.date = {};
    if (fromISO) where.date.gte = new Date(fromISO);
    if (toISO) where.date.lte = new Date(toISO);
  }

  const events = await prisma.calendarEvent.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    orderBy: { date: 'asc' },
  });

  const ORG_WIDE = ['holiday', 'town-hall'];
  return events
    .map(shape)
    .filter(
      (e: ReturnType<typeof shape>) =>
        ORG_WIDE.includes(e.type) ||
        e.createdById === user.id ||
        e.attendees.includes(user.id) ||
        e.attendees.length === 0
    );
}

export async function createCalendarEvent(input: CalendarEventInput) {
  const user = await requireSession();

  const title = input.title?.trim();
  if (!title) throw new Error('Title is required');
  if (!input.date) throw new Error('Date is required');

  const date = new Date(input.date);
  if (Number.isNaN(date.getTime())) throw new Error('Invalid date');

  if (input.startTime && input.endTime && input.endTime < input.startTime) {
    throw new Error('End time cannot be before start time');
  }

  const type = input.type && EVENT_TYPES.includes(input.type) ? input.type : 'meeting';

  const event = await prisma.calendarEvent.create({
    data: {
      title,
      type,
      date,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      location: input.location ?? null,
      attendees: JSON.stringify(input.attendees ?? []),
      createdById: user.id,
    },
  });

  await logAudit(user, 'calendar.event.create', 'CalendarEvent', event.id, title);
  return shape(event);
}

export async function updateCalendarEvent(id: string, input: Partial<CalendarEventInput>) {
  const user = await requireSession();

  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) throw new Error('Event not found');
  await assertCanManage(existing, user.id, user.role);

  const data: any = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.type !== undefined && EVENT_TYPES.includes(input.type)) data.type = input.type;
  if (input.date !== undefined) {
    const date = new Date(input.date);
    if (Number.isNaN(date.getTime())) throw new Error('Invalid date');
    data.date = date;
  }
  if (input.startTime !== undefined) data.startTime = input.startTime || null;
  if (input.endTime !== undefined) data.endTime = input.endTime || null;
  if (input.location !== undefined) data.location = input.location || null;
  if (input.attendees !== undefined) data.attendees = JSON.stringify(input.attendees);

  const event = await prisma.calendarEvent.update({ where: { id }, data });
  await logAudit(user, 'calendar.event.update', 'CalendarEvent', id);
  return shape(event);
}

export async function deleteCalendarEvent(id: string) {
  const user = await requireSession();

  const existing = await prisma.calendarEvent.findUnique({ where: { id } });
  if (!existing) throw new Error('Event not found');
  await assertCanManage(existing, user.id, user.role);

  await prisma.calendarEvent.delete({ where: { id } });
  await logAudit(user, 'calendar.event.delete', 'CalendarEvent', id);
  return { success: true };
}

/** Only the organiser (or an executive) may change or cancel an event. */
async function assertCanManage(event: any, userId: string, role: string) {
  const ADMIN = ['ceo', 'admin', 'coo', 'chro'];
  if (event.createdById === userId) return;
  if (ADMIN.includes(role)) return;
  throw new Error('Only the organiser can change this event');
}
