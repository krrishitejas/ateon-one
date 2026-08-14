'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';

type SocketContextValue = {
  socket: Socket | null;
  connected: boolean;
  /** User ids currently online. */
  onlineUsers: string[];
  isOnline: (userId: string) => boolean;
  /** Subscribe to a server event; returns an unsubscribe function. */
  on: (event: string, handler: (payload: any) => void) => () => void;
  emit: (event: string, payload?: unknown) => void;
};

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  connected: false,
  onlineUsers: [],
  isOnline: () => false,
  on: () => () => {},
  emit: () => {},
});

export function SocketProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);

  useEffect(() => {
    if (!isAuthenticated) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      setOnlineUsers([]);
      return;
    }

    // The session cookie is httpOnly, so it rides along automatically —
    // the server validates it during the handshake.
    const socket = io({
      path: '/api/socket',
      // Must mirror the server: the host strips a trailing slash on this path.
      addTrailingSlash: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });
    socketRef.current = socket;

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', (err) => {
      // Unauthorised means the session expired — stop retrying in that case.
      if (err?.message === 'unauthorized') socket.disconnect();
      setConnected(false);
    });

    socket.on('presence:list', (ids: string[]) => setOnlineUsers(ids ?? []));
    socket.on('presence:online', ({ userId }: { userId: string }) =>
      setOnlineUsers((prev) => (prev.includes(userId) ? prev : [...prev, userId]))
    );
    socket.on('presence:offline', ({ userId }: { userId: string }) =>
      setOnlineUsers((prev) => prev.filter((id) => id !== userId))
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated]);

  const on = useCallback((event: string, handler: (payload: any) => void) => {
    const socket = socketRef.current;
    if (!socket) return () => {};
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, []);

  const emit = useCallback((event: string, payload?: unknown) => {
    socketRef.current?.emit(event, payload);
  }, []);

  const isOnline = useCallback((userId: string) => onlineUsers.includes(userId), [onlineUsers]);

  return (
    <SocketContext.Provider
      value={{ socket: socketRef.current, connected, onlineUsers, isOnline, on, emit }}
    >
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

/**
 * Subscribe to a socket event for the lifetime of a component.
 * The handler is kept in a ref so callers don't need to memoise it.
 */
export function useSocketEvent(event: string, handler: (payload: any) => void) {
  const { on, connected } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!connected) return;
    return on(event, (payload) => handlerRef.current(payload));
  }, [event, on, connected]);
}
