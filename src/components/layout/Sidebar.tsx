'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { getMyModules } from '@/actions/roles';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { getRoleConfig } from '@/data/roles';
import {
  LayoutDashboard, Users, FolderKanban, IndianRupee, CreditCard,
  ShoppingCart, CheckSquare, MessageCircle, Scale, BarChart3,
  Sparkles, Briefcase, Settings, ChevronLeft, ChevronRight, LogOut,
  Target, FileBarChart, LifeBuoy, CalendarDays, ClipboardList, Megaphone, Building2, Radar,
} from 'lucide-react';

const moduleIcons: Record<string, React.ReactNode> = {
  dashboard: <LayoutDashboard size={18} />,
  organization: <Building2 size={18} />,
  command: <Radar size={18} />,
  users: <Users size={18} />,
  hrms: <Users size={18} />,
  projects: <FolderKanban size={18} />,
  finance: <IndianRupee size={18} />,
  payroll: <CreditCard size={18} />,
  procurement: <ShoppingCart size={18} />,
  approvals: <CheckSquare size={18} />,
  chat: <MessageCircle size={18} />,
  legal: <Scale size={18} />,
  analytics: <BarChart3 size={18} />,
  ai: <Sparkles size={18} />,
  workspace: <Briefcase size={18} />,
  settings: <Settings size={18} />,
  crm: <Target size={18} />,
  marketing: <Megaphone size={18} />,
  reports: <FileBarChart size={18} />,
  'service-desk': <LifeBuoy size={18} />,
  calendar: <CalendarDays size={18} />,
  audit: <ClipboardList size={18} />,
};

const moduleLabels: Record<string, string> = {
  dashboard: 'Dashboard',
  command: 'Command Centre',
  organization: 'Organisation',
  users: 'Users',
  hrms: 'HRMS',
  projects: 'Projects',
  finance: 'Finance',
  payroll: 'Payroll',
  procurement: 'Procurement',
  approvals: 'Approvals',
  chat: 'Chat',
  legal: 'Legal',
  analytics: 'Analytics',
  ai: 'AI Assistant',
  workspace: 'My Workspace',
  settings: 'Settings',
  crm: 'CRM',
  marketing: 'Marketing',
  reports: 'Reports',
  'service-desk': 'Service Desk',
  calendar: 'Calendar',
  audit: 'Audit Trail',
};

const modulePaths: Record<string, string> = {
  dashboard: '/dashboard',
  organization: '/organization',
  command: '/command',
  users: '/users',
  hrms: '/hrms',
  projects: '/projects',
  finance: '/finance',
  payroll: '/payroll',
  procurement: '/procurement',
  approvals: '/approvals',
  chat: '/chat',
  legal: '/legal',
  analytics: '/analytics',
  ai: '/ai',
  workspace: '/workspace',
  settings: '/settings',
  crm: '/crm',
  marketing: '/marketing',
  reports: '/reports',
  'service-desk': '/service-desk',
  calendar: '/calendar',
  audit: '/audit',
};

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const { user, logout } = useAuth();

  // Live module list for this user's (possibly custom) role. The built-in table
  // seeds the first paint so navigation never flashes empty.
  const { data: modules } = useSWR(
    user ? `my_modules_${user.role}` : null,
    getMyModules,
    { fallbackData: getRoleConfig(user?.role).modules, revalidateOnFocus: false }
  );

  if (!user) return null;

  const allowedModules = (modules ?? []).filter(m => modulePaths[m]);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 320 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="h-screen flex flex-col bg-white border-r border-gray-200 relative z-30 flex-shrink-0"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-24 border-b border-gray-100 flex-shrink-0">
        <AnimatePresence>
          {!collapsed ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center"
            >
              <div className="w-full h-full flex items-center justify-start py-2">
                <Image src="/logo.png" alt="ATEON Labs" width={400} height={100} style={{ objectFit: 'contain', width: '100%', height: '100%', maxHeight: '80px' }} priority />
              </div>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-9 h-9 bg-gray-900 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
            >
              A
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 overflow-y-auto space-y-0.5">
        {allowedModules.map((moduleId: string) => {
          const path = modulePaths[moduleId];
          const isActive = pathname === path || (pathname?.startsWith(path + '/') && path !== '/dashboard');
          const icon = moduleIcons[moduleId];
          const label = moduleLabels[moduleId];

          return (
            <Link key={moduleId} href={path}>
              <motion.div
                whileHover={{ x: 2 }}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer transition-all duration-200 group relative ${
                  isActive
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <span className="flex-shrink-0">{icon}</span>
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-sm font-medium truncate"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-gray-100 p-2 flex-shrink-0">
        <button
          onClick={logout}
          className="flex items-center gap-3 px-3 py-2 rounded-xl cursor-pointer text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 w-full"
        >
          <LogOut size={18} />
          <AnimatePresence>
            {!collapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm font-medium"
              >
                Logout
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Collapse */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-700 cursor-pointer transition-colors z-50 shadow-sm"
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
      </button>
    </motion.aside>
  );
}
