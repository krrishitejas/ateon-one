import { NextResponse } from 'next/server';
import { isRealtimeEnabled } from '@/lib/realtime';
import { getSessionUser } from '@/lib/auth';

/**
 * Ops diagnostic: reports whether Server Actions can reach the Socket.IO
 * instance owned by server.js. `false` means the app is running under
 * `next start` (or the standalone server) and every push silently no-ops.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  return NextResponse.json({
    realtime: isRealtimeEnabled(),
    note: isRealtimeEnabled()
      ? 'Server Actions can push to connected clients.'
      : 'Realtime unavailable — start the app with `node server.js`, not `next start`.',
  });
}
