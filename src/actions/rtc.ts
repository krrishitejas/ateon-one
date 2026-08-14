'use server';

import { requireSession } from '@/lib/auth';

export type IceServer = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

/**
 * ICE servers for peer connections.
 *
 * STUN alone only works when both peers can be reached directly. Behind
 * symmetric NAT or a corporate firewall the connection will fail without a
 * TURN relay — set TURN_URL / TURN_USERNAME / TURN_CREDENTIAL to enable one.
 *
 * Served through an authenticated action rather than NEXT_PUBLIC_* so TURN
 * credentials aren't baked into the client bundle for anyone to lift.
 */
export async function getIceServers(): Promise<{ iceServers: IceServer[]; hasTurn: boolean }> {
  await requireSession();

  const iceServers: IceServer[] = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  ];

  const turnUrl = process.env.TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls: turnUrl.split(',').map((u) => u.trim()).filter(Boolean),
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }

  return { iceServers, hasTurn: Boolean(turnUrl) };
}
