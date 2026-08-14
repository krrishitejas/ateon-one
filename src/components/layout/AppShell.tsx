'use client';

import React from 'react';
import { useAuth } from '@/context/AuthContext';
import { SocketProvider } from '@/context/SocketContext';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import { useTracking } from '@/hooks/useTracking';
import { MapPin, ShieldAlert } from 'lucide-react';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, logout } = useAuth();
  const { location, error, permissionsGranted, hasPrompted } = useTracking();

  // Hard location gate is opt-in. Set NEXT_PUBLIC_ENFORCE_LOCATION=true to block
  // sign-in when a user denies location; otherwise they continue without it.
  const enforceLocation = process.env.NEXT_PUBLIC_ENFORCE_LOCATION === 'true';

  if (enforceLocation && isAuthenticated && hasPrompted && !permissionsGranted) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-primary p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-2xl text-center border border-red-100">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <ShieldAlert size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Location Required</h2>
          <p className="text-sm text-gray-600 mb-6">
            Your organisation requires location access for attendance tracking.
            Please allow location in your browser settings to continue.
          </p>
          {error && <p className="text-xs text-red-500 bg-red-50 p-3 rounded-xl mb-6">{error}</p>}
          <button 
            onClick={() => window.location.reload()} 
            className="w-full py-3 bg-gray-900 text-white rounded-xl font-medium mb-3 cursor-pointer"
          >
            Retry Permissions
          </button>
          <button 
            onClick={logout} 
            className="w-full py-3 bg-gray-100 text-gray-600 rounded-xl font-medium cursor-pointer"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <SocketProvider>
      {!isAuthenticated ? (
        children
      ) : (
        <div className="flex h-screen overflow-hidden" style={{ background: 'var(--color-surface-bg)' }}>
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <TopBar trackingLocation={location} />
            <main className="flex-1 overflow-y-auto">
              <div className="p-6">
                {children}
              </div>
            </main>
          </div>
        </div>
      )}
    </SocketProvider>
  );
}
