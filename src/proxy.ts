import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { ROLES, getRoleConfig } from '@/data/roles';

const secret = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || 'dev-secret-key-ateon-one-2024-local'
);

/**
 * Role gating: a signed-in user may only visit modules listed for their role
 * in ROLES (same source of truth the Sidebar uses). Unknown segments
 * (e.g. deep links, api routes) are left to server-side checks.
 */
function isModuleAllowed(pathname: string, role: string, claimed?: unknown): boolean {
  const segment = pathname.split('/')[1];
  if (!segment) return true;

  // Prefer the module list minted into the token at login — it reflects custom,
  // DB-defined roles. Fall back to the built-in table for older tokens.
  const modules =
    Array.isArray(claimed) && claimed.every((m) => typeof m === 'string')
      ? (claimed as string[])
      : getRoleConfig(role).modules;

  // Only gate paths that correspond to a known module for at least one role
  const isKnownModule = Object.values(ROLES).some((r) => r.modules.includes(segment));
  if (!isKnownModule) return true;
  return modules.includes(segment);
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('ateon_session')?.value;
  const { pathname } = request.nextUrl;

  // Public paths
  if (
    pathname === '/' ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    pathname === '/logo.png'
  ) {
    // If logged in, don't let them sit on login page
    if (token && pathname === '/') {
      try {
        await jwtVerify(token, secret);
        return NextResponse.redirect(new URL('/dashboard', request.url));
      } catch (e) {
        // Token invalid, let them stay on login
      }
    }
    return NextResponse.next();
  }

  // Protected paths
  if (!token) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    const { payload } = await jwtVerify(token, secret);
    const role = typeof payload.role === 'string' ? payload.role : 'employee';
    // Admin vs employee module gating
    if (!isModuleAllowed(pathname, role, payload.modules)) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
    return NextResponse.next();
  } catch (error) {
    // Invalid token, clear it and redirect to login
    const response = NextResponse.redirect(new URL('/', request.url));
    response.cookies.delete('ateon_session');
    return response;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth).*)'],
};
