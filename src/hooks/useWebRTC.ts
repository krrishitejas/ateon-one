'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from '@/context/SocketContext';
import { getIceServers, type IceServer } from '@/actions/rtc';

export type Peer = {
  socketId: string;
  userId: string;
  name: string;
  stream: MediaStream | null;
  /** RTCPeerConnection state, surfaced so the UI can show "connecting…". */
  status: RTCPeerConnectionState;
};

type Options = {
  /** `chat:<groupId>` */
  roomId: string | null;
  video?: boolean;
  audio?: boolean;
};

/**
 * Mesh WebRTC: every participant holds a direct connection to every other.
 *
 * Mesh is simple and needs no media server, but each peer uploads its stream
 * once per participant — practical up to roughly 4 people. Beyond that an SFU
 * would be required.
 */
export function useWebRTC({ roomId, video = true, audio = true }: Options) {
  const { socket, connected, on, emit } = useSocket();

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [peers, setPeers] = useState<Record<string, Peer>>({});
  const [inCall, setInCall] = useState(false);
  const [micOn, setMicOn] = useState(audio);
  const [camOn, setCamOn] = useState(video);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasTurn, setHasTurn] = useState<boolean | null>(null);

  const connections = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const iceRef = useRef<IceServer[] | null>(null);
  // ICE can arrive before the remote description is set; queue until ready.
  const pendingIce = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  const updatePeer = useCallback((socketId: string, patch: Partial<Peer>) => {
    setPeers((prev) => {
      const existing = prev[socketId];
      if (!existing) return prev;
      return { ...prev, [socketId]: { ...existing, ...patch } };
    });
  }, []);

  const closePeer = useCallback((socketId: string) => {
    const pc = connections.current.get(socketId);
    if (pc) {
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
      connections.current.delete(socketId);
    }
    pendingIce.current.delete(socketId);
    setPeers((prev) => {
      const next = { ...prev };
      delete next[socketId];
      return next;
    });
  }, []);

  /** Build (or fetch) the connection to one peer and wire its handlers. */
  const createConnection = useCallback(
    (socketId: string) => {
      const existing = connections.current.get(socketId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: iceRef.current ?? [] });
      connections.current.set(socketId, pc);

      for (const track of localStreamRef.current?.getTracks() ?? []) {
        pc.addTrack(track, localStreamRef.current!);
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          emit('rtc:ice', { to: socketId, candidate: event.candidate.toJSON() });
        }
      };

      pc.ontrack = (event) => {
        updatePeer(socketId, { stream: event.streams[0] ?? null });
      };

      pc.onconnectionstatechange = () => {
        updatePeer(socketId, { status: pc.connectionState });
        if (pc.connectionState === 'failed') {
          // Almost always a NAT/firewall problem with no TURN relay available.
          setError(
            iceRef.current?.some((s) => String(s.urls).includes('turn'))
              ? 'Connection failed. The other participant may have lost network.'
              : 'Could not connect — a TURN server is required for this network. Ask your admin to configure TURN_URL.'
          );
        }
      };

      return pc;
    },
    [emit, updatePeer]
  );

  const flushIce = useCallback(async (socketId: string, pc: RTCPeerConnection) => {
    const queued = pendingIce.current.get(socketId);
    if (!queued) return;
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.error('addIceCandidate failed', e);
      }
    }
    pendingIce.current.delete(socketId);
  }, []);

  /** Acquire camera/mic and join the signalling room. */
  const join = useCallback(async () => {
    if (!roomId || !connected) {
      setError('Realtime connection unavailable — cannot start a call.');
      return;
    }
    setError(null);

    try {
      const { iceServers, hasTurn: turn } = await getIceServers();
      iceRef.current = iceServers;
      setHasTurn(turn);
    } catch {
      iceRef.current = [{ urls: 'stun:stun.l.google.com:19302' }];
      setHasTurn(false);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video, audio });
      localStreamRef.current = stream;
      setLocalStream(stream);
      setMicOn(audio);
      setCamOn(video);
    } catch (e: any) {
      setError(
        e?.name === 'NotAllowedError'
          ? 'Camera and microphone access was denied.'
          : 'Could not access your camera or microphone.'
      );
      return;
    }

    setInCall(true);
    emit('rtc:join', roomId);
  }, [roomId, connected, video, audio, emit]);

  const leave = useCallback(() => {
    if (roomId) emit('rtc:leave', roomId);
    for (const socketId of Array.from(connections.current.keys())) closePeer(socketId);
    for (const track of localStreamRef.current?.getTracks() ?? []) track.stop();
    localStreamRef.current = null;
    setLocalStream(null);
    setPeers({});
    setInCall(false);
    setSharingScreen(false);
    setError(null);
  }, [roomId, emit, closePeer]);

  // ── Signalling ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!inCall || !socket) return;

    const offs: Array<() => void> = [];

    // Existing occupants: we initiate to each.
    offs.push(
      on('rtc:peers', async ({ peers: list }: { peers: Array<{ socketId: string; userId: string; name: string }> }) => {
        for (const p of list) {
          setPeers((prev) => ({
            ...prev,
            [p.socketId]: { ...p, stream: null, status: 'new' },
          }));
          const pc = createConnection(p.socketId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          emit('rtc:offer', { to: p.socketId, sdp: offer });
        }
      })
    );

    // Someone new arrived — they will send us an offer, so just register them.
    offs.push(
      on('rtc:peer-joined', ({ socketId, userId, name }: any) => {
        setPeers((prev) => ({
          ...prev,
          [socketId]: { socketId, userId, name, stream: null, status: 'new' },
        }));
      })
    );

    offs.push(
      on('rtc:offer', async ({ from, sdp, fromUser }: any) => {
        setPeers((prev) => ({
          ...prev,
          [from]: prev[from] ?? {
            socketId: from,
            userId: fromUser?.id ?? '',
            name: fromUser?.name ?? 'Participant',
            stream: null,
            status: 'new',
          },
        }));

        const pc = createConnection(from);
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushIce(from, pc);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        emit('rtc:answer', { to: from, sdp: answer });
      })
    );

    offs.push(
      on('rtc:answer', async ({ from, sdp }: any) => {
        const pc = connections.current.get(from);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        await flushIce(from, pc);
      })
    );

    offs.push(
      on('rtc:ice', async ({ from, candidate }: any) => {
        const pc = connections.current.get(from);
        if (!pc || !candidate) return;
        // Queue candidates that arrive before the remote description.
        if (!pc.remoteDescription) {
          const queue = pendingIce.current.get(from) ?? [];
          queue.push(candidate);
          pendingIce.current.set(from, queue);
          return;
        }
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('addIceCandidate failed', e);
        }
      })
    );

    offs.push(on('rtc:peer-left', ({ socketId }: any) => closePeer(socketId)));
    offs.push(on('rtc:error', ({ message }: any) => setError(message)));

    return () => { for (const off of offs) off(); };
  }, [inCall, socket, on, emit, createConnection, closePeer, flushIce]);

  // Tear the call down if the component unmounts or the socket drops.
  useEffect(() => {
    if (inCall && !connected) {
      setError('Lost connection to the server. Call ended.');
      leave();
    }
  }, [connected, inCall, leave]);

  useEffect(() => () => { leave(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Controls ──────────────────────────────────────────────────────────────

  const toggleMic = useCallback(() => {
    const tracks = localStreamRef.current?.getAudioTracks() ?? [];
    const next = !micOn;
    for (const t of tracks) t.enabled = next;
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const tracks = localStreamRef.current?.getVideoTracks() ?? [];
    const next = !camOn;
    for (const t of tracks) t.enabled = next;
    setCamOn(next);
  }, [camOn]);

  /** Swap the outbound video track for a screen capture, and back again. */
  const toggleScreenShare = useCallback(async () => {
    if (!localStreamRef.current) return;

    const replaceVideoTrack = (track: MediaStreamTrack) => {
      for (const pc of connections.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
        sender?.replaceTrack(track);
      }
    };

    if (sharingScreen) {
      try {
        const cam = await navigator.mediaDevices.getUserMedia({ video: true });
        const track = cam.getVideoTracks()[0];
        const old = localStreamRef.current.getVideoTracks()[0];
        if (old) { localStreamRef.current.removeTrack(old); old.stop(); }
        localStreamRef.current.addTrack(track);
        replaceVideoTrack(track);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setSharingScreen(false);
      } catch {
        setError('Could not switch back to the camera.');
      }
      return;
    }

    try {
      const display = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = display.getVideoTracks()[0];
      const old = localStreamRef.current.getVideoTracks()[0];
      if (old) { localStreamRef.current.removeTrack(old); old.stop(); }
      localStreamRef.current.addTrack(track);
      replaceVideoTrack(track);
      setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      setSharingScreen(true);

      // Browser "Stop sharing" button ends the track directly.
      track.onended = () => { toggleScreenShare(); };
    } catch {
      // User cancelled the picker — not an error worth surfacing.
    }
  }, [sharingScreen]);

  return {
    join, leave,
    inCall, localStream,
    peers: Object.values(peers),
    micOn, camOn, sharingScreen,
    toggleMic, toggleCam, toggleScreenShare,
    error, hasTurn,
    canCall: connected,
  };
}
