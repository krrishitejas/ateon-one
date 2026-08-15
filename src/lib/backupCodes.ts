import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

/** How many codes are issued per batch. */
export const BACKUP_CODE_COUNT = 10;

/**
 * Crockford-style alphabet: no O/0, I/1, L or U. Codes get read off paper and
 * typed by hand, so ambiguous glyphs cause real support tickets.
 */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/** e.g. `7K3M-QP9X` */
function generateCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) out += '-';
    out += ALPHABET[randomInt(ALPHABET.length)];
  }
  return out;
}

/** Normalise user input: strip spaces/dashes, uppercase. */
export function normaliseCode(input: string): string {
  return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function canonical(code: string): string {
  const clean = normaliseCode(code);
  return clean.length === 8 ? `${clean.slice(0, 4)}-${clean.slice(4)}` : clean;
}

/**
 * Replace a user's codes with a fresh batch.
 * Returns the plaintext codes — the ONLY time they are ever available.
 */
export async function regenerateBackupCodes(userId: string): Promise<string[]> {
  await prisma.backupCode.deleteMany({ where: { userId } });

  const codes: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = generateCode();
    codes.push(code);
    // Hashed like a password — a database leak must not yield usable codes.
    const codeHash = await bcrypt.hash(canonical(code), 10);
    await prisma.backupCode.create({ data: { userId, codeHash } });
  }
  return codes;
}

/**
 * Consume a backup code. Returns true only if it matched an unused code, which
 * is then marked used so it cannot be replayed.
 */
export async function consumeBackupCode(userId: string, input: string): Promise<boolean> {
  const candidate = canonical(input);
  if (normaliseCode(input).length !== 8) return false;

  const rows = await prisma.backupCode.findMany({ where: { userId } });
  for (const row of rows) {
    if (row.usedAt) continue;
    if (await bcrypt.compare(candidate, row.codeHash)) {
      await prisma.backupCode.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return true;
    }
  }
  return false;
}

/** How many codes remain unused. */
export async function countUnusedBackupCodes(userId: string): Promise<number> {
  const rows = await prisma.backupCode.findMany({ where: { userId } });
  return rows.filter((r: any) => !r.usedAt).length;
}
