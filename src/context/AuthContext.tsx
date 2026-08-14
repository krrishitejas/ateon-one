'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getMe, login as serverLogin, logout as serverLogout } from '@/actions/auth';

interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  designation: string;
  avatar: string;
  twoFactorEnabled?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string, otpCode?: string) => Promise<{ success?: boolean; requireOtp?: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  const refreshAuth = async () => {
    try {
      const me = await getMe();
      setUser(me);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const login = async (email: string, password: string, otpCode?: string) => {
    const res = await serverLogin(email, password, otpCode);
    if (res.success) {
      await refreshAuth();
      return { success: true };
    }
    if (res.requireOtp) {
      return { requireOtp: true };
    }
    return { error: res.error };
  };

  const logout = async () => {
    await serverLogout();
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout, refreshAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
