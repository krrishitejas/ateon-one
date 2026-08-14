'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { getVisibleEmployeeIds } from '@/lib/scope';

/**
 * Persist the signed-in user's current location onto their Employee record.
 *
 * Only ever writes the *caller's* own row — the employee is resolved from the
 * session, never from a client-supplied id.
 */
export async function updateMyLocation(input: {
  lat: number;
  lng: number;
  locName?: string;
}) {
  const user = await requireSession();

  if (!Number.isFinite(input.lat) || !Number.isFinite(input.lng)) {
    return { success: false, error: 'Invalid coordinates' };
  }
  if (Math.abs(input.lat) > 90 || Math.abs(input.lng) > 180) {
    return { success: false, error: 'Coordinates out of range' };
  }

  const employee = await prisma.employee.findUnique({ where: { email: user.email } });
  if (!employee) return { success: false, error: 'No employee record' };

  await prisma.employee.update({
    where: { id: employee.id },
    data: {
      currentLat: input.lat,
      currentLng: input.lng,
      currentLocName: input.locName ?? null,
    },
  });

  return { success: true };
}

/**
 * Live location + presence for every active employee. Used by the CEO/manager
 * monitoring views.
 */
export async function listTeamLocations() {
  const user = await requireSession();
  const visible = await getVisibleEmployeeIds(user);

  const employees = await prisma.employee.findMany({
    where: visible === null
      ? { status: 'active' }
      : { status: 'active', id: { in: visible.length > 0 ? visible : ['__none__'] } },
    include: { department: true },
    orderBy: { name: 'asc' },
  });

  return employees.map((e: any) => ({
    id: e.id,
    name: e.name,
    designation: e.designation,
    department: e.department?.name ?? null,
    avatar: e.avatar,
    lat: e.currentLat,
    lng: e.currentLng,
    locationName: e.currentLocName,
    updatedAt: e.updatedAt,
  }));
}
