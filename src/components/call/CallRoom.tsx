'use client';

import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Avatar from '@/components/ui/Avatar';
import { useWebRTC, type Peer } from '@/hooks/useWebRTC';
import {
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff,
  MonitorUp, MonitorX, AlertTriangle, X, Loader2,
} from 'lucide-react';

/** A single <video> bound to a MediaStream. */
function VideoTile({
  stream, name, muted = false, label, mirror = false, connecting = false,
}: {
  stream: MediaStream | null;
  name: string;
  muted?: boolean;
  label?: string;
  mirror?: boolean;
  connecting?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  const hasVideo = !!stream && stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  return (
    <div className="relative bg-gray-900 rounded-2xl overflow-hidden aspect-video flex items-center justify-center">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${hasVideo ? '' : 'opacity-0'} ${mirror ? 'scale-x-[-1]' : ''}`}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <Avatar name={name} size="lg" />
          {connecting && (
            <span className="flex items-center gap-1.5 text-xs text-gray-300">
              <Loader2 size={12} className="animate-spin" /> Connecting…
            </span>
          )}
        </div>
      )}
      <div className="absolute bottom-2 left-2 px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm">
        <span className="text-xs text-white font-medium">{label ?? name}</span>
      </div>
    </div>
  );
}

export default function CallRoom({
  roomId,
  title,
  open,
  video = true,
  onClose,
}: {
  roomId: string | null;
  title: string;
  open: boolean;
  /** false starts an audio-only call. */
  video?: boolean;
  onClose: () => void;
}) {
  const {
    join, leave, inCall, localStream, peers,
    micOn, camOn, sharingScreen,
    toggleMic, toggleCam, toggleScreenShare,
    error, hasTurn, canCall,
  } = useWebRTC({ roomId, video });

  // Start the call when the dialog opens; hang up when it closes.
  useEffect(() => {
    if (open && !inCall) join();
    if (!open && inCall) leave();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const hangUp = () => { leave(); onClose(); };

  if (!open) return null;

  // Local tile plus one per remote peer.
  const tileCount = peers.length + 1;
  const gridCols = tileCount <= 1 ? 'grid-cols-1' : tileCount <= 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-gray-950/95 backdrop-blur-sm flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 flex-shrink-0">
          <div>
            <h2 className="text-white font-semibold">{title}</h2>
            <p className="text-xs text-gray-400">
              {tileCount} {tileCount === 1 ? 'participant' : 'participants'}
              {sharingScreen ? ' · sharing your screen' : ''}
            </p>
          </div>
          <button
            onClick={hangUp}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Warnings */}
        <div className="px-6 space-y-2 flex-shrink-0">
          {!canCall && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              <span>
                Realtime is unavailable, so calls can&apos;t connect. The server must be started
                with <code className="font-mono">server.js</code>.
              </span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
              <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {hasTurn === false && inCall && peers.length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-gray-300 text-xs">
              <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
              <span>
                No TURN server configured. Calls work on most home and office networks, but may
                fail behind strict corporate firewalls.
              </span>
            </div>
          )}
        </div>

        {/* Video grid */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className={`grid ${gridCols} gap-4 max-w-6xl mx-auto`}>
            <VideoTile
              stream={localStream}
              name="You"
              label={`You${micOn ? '' : ' (muted)'}`}
              muted
              mirror={!sharingScreen}
            />
            {peers.map((p: Peer) => (
              <VideoTile
                key={p.socketId}
                stream={p.stream}
                name={p.name}
                connecting={p.status !== 'connected'}
              />
            ))}
          </div>

          {peers.length === 0 && inCall && (
            <p className="text-center text-gray-400 text-sm mt-8">
              Waiting for others to join…
            </p>
          )}
        </div>

        {/* Controls */}
        <div className="flex items-center justify-center gap-3 py-6 flex-shrink-0">
          <button
            onClick={toggleMic}
            disabled={!inCall}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 ${
              micOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white hover:bg-red-600'
            }`}
            title={micOn ? 'Mute' : 'Unmute'}
          >
            {micOn ? <Mic size={18} /> : <MicOff size={18} />}
          </button>

          <button
            onClick={toggleCam}
            disabled={!inCall}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 ${
              camOn ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-red-500 text-white hover:bg-red-600'
            }`}
            title={camOn ? 'Turn camera off' : 'Turn camera on'}
          >
            {camOn ? <VideoIcon size={18} /> : <VideoOff size={18} />}
          </button>

          <button
            onClick={toggleScreenShare}
            disabled={!inCall}
            className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 ${
              sharingScreen ? 'bg-blue-500 text-white hover:bg-blue-600' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
            title={sharingScreen ? 'Stop sharing' : 'Share screen'}
          >
            {sharingScreen ? <MonitorX size={18} /> : <MonitorUp size={18} />}
          </button>

          <button
            onClick={hangUp}
            className="px-6 h-12 rounded-full bg-red-600 text-white hover:bg-red-700 flex items-center gap-2 transition-colors cursor-pointer"
            title="Leave call"
          >
            <PhoneOff size={18} />
            <span className="text-sm font-medium">Leave</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
