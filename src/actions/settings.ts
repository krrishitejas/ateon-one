'use server';

import { prisma } from '@/lib/prisma';
import { requireRole, logAudit } from '@/lib/auth';

/** Roles permitted to change org-wide settings. */
const SETTINGS_ADMIN_ROLES = ['ceo', 'admin', 'cto'];

export async function getSetting(key: string, defaultValue: string = 'false') {
  try {
    const setting = await prisma.setting.findUnique({ where: { key } });
    if (!setting) return defaultValue;
    return setting.value;
  } catch (err) {
    console.error(`getSetting(${key}) failed:`, err);
    return defaultValue;
  }
}

export async function getSettings(keys: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const key of keys) out[key] = await getSetting(key, '');
  return out;
}

export async function setSetting(key: string, value: string) {
  try {
    // Authorise against the signed session, not a client-readable cookie.
    const user = await requireRole(SETTINGS_ADMIN_ROLES);

    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
    await logAudit(user, 'settings.update', 'Setting', key, `${key}=${value}`);
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Failed to save setting' };
  }
}
