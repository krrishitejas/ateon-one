'use server';

import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import nodemailer from 'nodemailer';
import { prisma } from '@/lib/prisma';
import { randomBytes } from 'crypto';
import { getRoleConfig, ROLES, rankOf } from '@/data/roles';
import { requireSession, logAudit } from '@/lib/auth';
import {
  regenerateBackupCodes, consumeBackupCode, countUnusedBackupCodes,
  normaliseCode, BACKUP_CODE_COUNT,
} from '@/lib/backupCodes';
const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET || 'dev-secret-key-ateon-one-2024-local');

/** Module list for a role, preferring the DB-defined role over the built-in one. */
async function getModulesForRole(roleKey: string): Promise<string[]> {
  try {
    const row = await prisma.role.findUnique({ where: { key: roleKey } });
    if (row?.modules) {
      const parsed = JSON.parse(row.modules);
      if (Array.isArray(parsed)) return parsed.filter((m: unknown) => typeof m === 'string');
    }
  } catch {
    // Role table not ready yet — fall through to the built-in set.
  }
  return getRoleConfig(roleKey).modules;
}

/**
 * Mail transport, built per-call so a missing SMTP_HOST is reported clearly
 * instead of nodemailer silently defaulting to localhost (which surfaces as a
 * baffling `ECONNREFUSED ::1:465`).
 */
function getTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;
  if (!host || !user || !pass) {
    throw new Error(
      'Email is not configured on this server. Set SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASSWORD.'
    );
  }
  const port = Number(process.env.SMTP_PORT) || 465;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export async function login(email: string, password: string, otpCode?: string) {
  try {
    const userPromise = prisma.user.findUnique({ where: { email } });
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Database connection timed out (Hostinger Firewall Blocking MySQL)')), 6000));
    
    const user = await Promise.race([userPromise, timeoutPromise]) as any;

    if (!user) return { error: 'Invalid credentials' };

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return { error: 'Invalid credentials' };

    // OTP Check if enabled
    if (user.twoFactorEnabled) {
      if (!otpCode) {
        // Send OTP
        const generatedOtp = Math.floor(100000 + Math.random() * 900000).toString();
        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorSecret: generatedOtp }
        });
        
        try {
          await getTransporter().sendMail({
            from: `"ATEON One Security" <${process.env.SMTP_USER}>`,
            to: user.email,
            subject: 'Your ATEON One Verification Code',
            text: `Your login code is: ${generatedOtp}. Do not share this with anyone.`,
          });
        } catch (mailErr: any) {
          // Without this the user is locked out with an opaque SMTP error and
          // no way to complete 2FA.
          return { error: `Could not send your verification code: ${mailErr.message}` };
        }

        return { requireOtp: true };
      } else {
        // A backup code is accepted in place of the emailed OTP, so a mail
        // outage can't lock someone out permanently.
        const looksLikeBackupCode = normaliseCode(otpCode).length === 8;
        let verified = user.twoFactorSecret === otpCode;
        let usedBackupCode = false;

        if (!verified && looksLikeBackupCode) {
          verified = await consumeBackupCode(user.id, otpCode);
          usedBackupCode = verified;
        }

        if (!verified) return { error: 'Invalid verification code' };

        await prisma.user.update({
          where: { id: user.id },
          data: { twoFactorSecret: null }
        });

        if (usedBackupCode) {
          const remaining = await countUnusedBackupCodes(user.id);
          await logAudit(
            { id: user.id, name: user.name, email: user.email, role: user.role, department: user.department, designation: user.designation, avatar: user.avatar },
            'auth.backup_code.used', 'User', user.id, `${remaining} remaining`
          );
        }
      }
    }

    // Create session
    const alg = 'HS256';
    // Carry the role's module list in the token so middleware can gate custom
    // roles without a DB round-trip. Absent claim => middleware falls back to
    // the built-in role table. Role edits take effect on the user's next login.
    const modules = await getModulesForRole(user.role);
    const jwt = await new SignJWT({ id: user.id, email: user.email, role: user.role, modules })
      .setProtectedHeader({ alg })
      .setIssuedAt()
      .setExpirationTime('24h')
      .sign(secret);

    await prisma.session.create({
      data: {
        userId: user.id,
        token: jwt,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      }
    });

    const cookieStore = await cookies();
    cookieStore.set('ateon_session', jwt, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60,
    });

    return { success: true, user: { id: user.id, name: user.name, role: user.role, email: user.email } };
  } catch (err: any) {
    return { error: err.message };
  }
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ateon_session')?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { token } });
  }
  cookieStore.delete('ateon_session');
  return { success: true };
}

export async function revokeAllSessions() {
  const user = await requireSession();
  const cookieStore = await cookies();
  const token = cookieStore.get('ateon_session')?.value;

  await prisma.session.deleteMany(
    token ? { userId: user.id, NOT: { token } } : { userId: user.id }
  );
  return { success: true };
}

export async function changePassword(current: string, newPass: string) {
  const sessionUser = await requireSession();
  if (!newPass || newPass.length < 8) {
    return { error: 'New password must be at least 8 characters' };
  }

  const dbUser = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!dbUser) return { error: 'Unauthorized' };

  const valid = await bcrypt.compare(current, dbUser.passwordHash);
  if (!valid) return { error: 'Current password incorrect' };

  const hash = await bcrypt.hash(newPass, 10);
  await prisma.user.update({
    where: { id: dbUser.id },
    data: { passwordHash: hash }
  });

  // A password change should invalidate everything except the current session.
  const cookieStore = await cookies();
  const token = cookieStore.get('ateon_session')?.value;
  await prisma.session.deleteMany(
    token ? { userId: dbUser.id, NOT: { token } } : { userId: dbUser.id }
  );

  return { success: true };
}

/**
 * Turn 2FA on or off. Enabling issues a fresh batch of backup codes and
 * returns them once — they are hashed at rest and can never be shown again.
 */
export async function toggle2FA(enabled: boolean) {
  const user = await requireSession();
  await prisma.user.update({
    where: { id: user.id },
    data: { twoFactorEnabled: enabled }
  });

  if (!enabled) {
    // Codes are meaningless without 2FA, and leaving them behind would let a
    // future re-enable silently inherit stale ones.
    await prisma.backupCode.deleteMany({ where: { userId: user.id } });
    await logAudit(user, 'auth.2fa.disabled', 'User', user.id);
    return { success: true, codes: null as string[] | null };
  }

  const codes = await regenerateBackupCodes(user.id);
  await logAudit(user, 'auth.2fa.enabled', 'User', user.id, `${codes.length} backup codes issued`);
  return { success: true, codes };
}

/** Issue a new batch, invalidating any previous codes. Shown once. */
export async function regenerate2FABackupCodes() {
  const user = await requireSession();

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser?.twoFactorEnabled) {
    throw new Error('Enable two-factor authentication first');
  }

  const codes = await regenerateBackupCodes(user.id);
  await logAudit(user, 'auth.backup_codes.regenerated', 'User', user.id, `${codes.length} issued`);
  return codes;
}

/** How many codes the signed-in user has left. Never returns the codes. */
export async function getBackupCodeStatus() {
  const user = await requireSession();
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const remaining = await countUnusedBackupCodes(user.id);
  return {
    twoFactorEnabled: Boolean(dbUser?.twoFactorEnabled),
    remaining,
    total: BACKUP_CODE_COUNT,
  };
}

export async function generateInviteEmail(email: string, role: string, name: string, phone: string = '') {
  let actor;
  try {
    actor = await requireSession();
  } catch {
    return { error: 'Unauthorized' };
  }

  if (!['ceo', 'admin', 'cto', 'chro', 'legal'].includes(actor.role)) {
    return { error: 'Insufficient permissions' };
  }

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: 'Enter a valid email address' };
  }

  // The requested role must exist, and must not outrank the inviter — without
  // this a CTO could invite themselves a second account as CEO.
  const knownRole = await prisma.role.findUnique({ where: { key: role } }).catch(() => null);
  if (!knownRole && !(role in ROLES)) {
    return { error: 'Unknown role' };
  }
  if (rankOf(role) < rankOf(actor.role)) {
    return { error: 'You cannot invite someone at a more senior role than your own' };
  }

  // Enforce the sliding toggle for HR to create accounts
  if (actor.role === 'chro') {
    const hrEnabled = await prisma.setting.findUnique({ where: { key: 'hr_account_creation_enabled' } });
    if (hrEnabled && hrEnabled.value === 'false') {
      return { error: 'HR account creation is currently disabled by administrators' };
    }
  }

  // Verify mail is usable BEFORE creating the account. Otherwise a send
  // failure leaves an account whose temporary password nobody knows, and the
  // retry fails with "Email already exists".
  let transporter;
  try {
    transporter = getTransporter();
  } catch (e: any) {
    return { error: e.message };
  }

  // Temporary password. Math.random() is not a CSPRNG — this credential is
  // emailed to a real person, so it comes from crypto.
  const tempPass = randomBytes(12).toString('base64url');
  const hash = await bcrypt.hash(tempPass, 10);

  let createdUserId: string | null = null;
  try {
    const created = await prisma.user.create({
      data: {
        email,
        name,
        role,
        phone,
        passwordHash: hash,
        department: 'General',
        designation: role.toUpperCase(),
        avatar: '',
      }
    });
    createdUserId = created?.id ?? null;

    await transporter.sendMail({
      from: `"ATEON HR" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Welcome to ATEON One',
      text: `Hello ${name},\n\nYou have been invited to ATEON One as a ${role.toUpperCase()}.\nYour temporary password is: ${tempPass}\n\nPlease log in and change your password immediately.`,
    });

    await logAudit(actor, 'user.invite', 'User', createdUserId ?? email, role);
    return { success: true };
  } catch (err: any) {
    if (err.code === 'P2002' || /duplicate/i.test(err.message ?? '')) {
      return { error: 'Email already exists' };
    }
    // Undo the account so the invite can be retried cleanly.
    if (createdUserId) {
      try {
        await prisma.user.delete({ where: { id: createdUserId } });
      } catch (cleanupErr) {
        console.error('invite rollback failed', cleanupErr);
      }
    }
    return { error: `Failed to send invite: ${err.message}` };
  }
}

export async function getMe() {
  const cookieStore = await cookies();
  const token = cookieStore.get('ateon_session')?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: {
      select: {
        id: true, name: true, email: true, role: true, department: true, designation: true, avatar: true, twoFactorEnabled: true
      }
    } }
  });
  if (!session) return null;
  // Expired tokens must not authenticate.
  if (new Date(session.expiresAt) < new Date()) return null;
  return session.user;
}

export async function getUserMetrics() {
  await requireSession();
  const [usersCount, deptsCount] = await Promise.all([
    prisma.user.count(),
    prisma.department.count()
  ]);

  return { usersCount, deptsCount };
}

/**
 * Directory of colleagues. Requires a session — these are real names, emails
 * and roles, and this action is reachable as an HTTP endpoint.
 */
export async function listUsers() {
  await requireSession();
  return prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, department: true, designation: true },
    orderBy: { name: 'asc' }
  });
}
