'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import useSWR from 'swr';
import { getMyNotifications } from '@/actions/notifications';
import { globalSearch } from '@/actions/search';
import { useSocket, useSocketEvent } from '@/context/SocketContext';
import { getRoleConfig } from '@/data/roles';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import { MapPin, Bell, Search, ChevronDown, Settings, LogOut, FolderKanban, Users, IndianRupee, Scale, FileText, Briefcase, LayoutDashboard, MessageSquare, Target, FileBarChart, LifeBuoy, CalendarDays, ClipboardList } from 'lucide-react';

interface SearchResult {
  label: string;
  description: string;
  route: string;
  icon: React.ReactNode;
}

export default function TopBar({ trackingLocation }: { trackingLocation?: string }) {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { connected } = useSocket();
  const { data: notifications = [], mutate: mutateNotifications } = useSWR(
    'my_notifications', getMyNotifications,
    // Push keeps this fresh; the interval is a fallback when sockets are down.
    { refreshInterval: connected ? 0 : 60000 }
  );

  // Anything that changes someone's pending work re-pulls the feed.
  useSocketEvent('notifications:refresh', () => { mutateNotifications(); });
  useSocketEvent('task:assigned', () => { mutateNotifications(); });
  // Dismissals are per-session: the feed is derived from live pending work, so
  // an item disappears for good once the underlying thing is actioned.
  const [dismissed, setDismissed] = useState<string[]>([]);

  // Debounce the query so typing doesn't fire a search per keystroke.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const { data: recordHits = [] } = useSWR(
    debouncedQuery.length >= 2 ? ['global_search', debouncedQuery] : null,
    () => globalSearch(debouncedQuery),
    { keepPreviousData: true }
  );

  // Close search dropdown on outside click.
  // Must stay above the `!user` guard below — every hook has to run on every
  // render, or React throws once auth hydrates from null to a signed-in user.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!user) return null;

  const roleConfig = getRoleConfig(user.role);
  const visibleNotifications = notifications.filter(n => !dismissed.includes(n.id));
  const unreadCount = visibleNotifications.length;

  // Global search across modules
  const searchableItems: SearchResult[] = [
    // Pages
    { label: 'Dashboard', description: 'Executive overview & KPIs', route: '/dashboard', icon: <LayoutDashboard size={14} /> },
    { label: 'Projects', description: 'Project management & tracking', route: '/projects', icon: <FolderKanban size={14} /> },
    { label: 'HRMS', description: 'Employee directory & management', route: '/hrms', icon: <Users size={14} /> },
    { label: 'Finance', description: 'Budgets, expenses & revenue', route: '/finance', icon: <IndianRupee size={14} /> },
    { label: 'Legal', description: 'Contracts & compliance', route: '/legal', icon: <Scale size={14} /> },
    { label: 'Payroll', description: 'Salary & payslips', route: '/payroll', icon: <FileText size={14} /> },
    { label: 'Procurement', description: 'Vendors & purchase requests', route: '/procurement', icon: <Briefcase size={14} /> },
    { label: 'Chat', description: 'Team messaging', route: '/chat', icon: <MessageSquare size={14} /> },
    { label: 'CRM', description: 'Leads, accounts & sales pipeline', route: '/crm', icon: <Target size={14} /> },
    { label: 'Reports', description: 'Analytics & business intelligence', route: '/reports', icon: <FileBarChart size={14} /> },
    { label: 'Service Desk', description: 'Internal support & ticketing', route: '/service-desk', icon: <LifeBuoy size={14} /> },
    { label: 'Calendar', description: 'Events, meetings & scheduling', route: '/calendar', icon: <CalendarDays size={14} /> },
    { label: 'Audit Trail', description: 'Activity log & compliance', route: '/audit', icon: <ClipboardList size={14} /> },
    { label: 'Settings', description: 'Profile, security & preferences', route: '/settings', icon: <Settings size={14} /> },
  ];

  const staticPages = searchableItems;

  const q = searchQuery.trim();
  const pageResults = q.length >= 2
    ? staticPages.filter(item =>
        item.label.toLowerCase().includes(q.toLowerCase()) ||
        item.description.toLowerCase().includes(q.toLowerCase())
      )
    : [];
  const results = [...pageResults, ...recordHits.map(h => ({
    label: h.label, description: h.description, route: h.route,
    icon: <Search size={14} />,
  }))].slice(0, 8);

  const navigateTo = (route: string) => {
    router.push(route);
    setSearchQuery('');
    setShowSearchResults(false);
    setShowProfile(false);
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0 z-20">
      {/* Search */}
      <div className="flex-1 max-w-md" ref={searchRef}>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search anything..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowSearchResults(true); }}
            onFocus={() => setShowSearchResults(true)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-full text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-all"
          />
          <AnimatePresence>
            {showSearchResults && results.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50"
              >
                <div className="px-4 py-2 border-b border-gray-100">
                  <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">{results.length} result{results.length !== 1 ? 's' : ''}</p>
                </div>
                {results.map((result, i) => (
                  <button
                    key={`${result.route}-${result.label}-${i}`}
                    onClick={() => navigateTo(result.route)}
                    className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-gray-50 transition-colors cursor-pointer text-left"
                  >
                    <span className="text-gray-400 flex-shrink-0">{result.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{result.label}</p>
                      <p className="text-[10px] text-gray-500 truncate">{result.description}</p>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-3">
        {/* Live Location Tracking */}
        {trackingLocation && (
          <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full border border-green-100 mr-2">
            <MapPin size={12} className="animate-pulse" />
            <span className="text-[11px] font-medium tracking-wide truncate max-w-[120px]">{trackingLocation}</span>
          </div>
        )}

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <Bell size={18} className="text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {showNotifs && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  <button onClick={() => setDismissed(notifications.map(n => n.id))} className="text-xs text-gray-500 hover:text-gray-900 cursor-pointer">Mark all read</button>
                </div>
                <div className="max-h-80 overflow-y-auto">
                  {visibleNotifications.slice(0, 8).map(notif => (
                    <div
                      key={notif.id}
                      onClick={() => { setDismissed(d => [...d, notif.id]); router.push(notif.href); setShowNotifs(false); }}
                      className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer bg-blue-50/50"
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                          notif.type === 'success' ? 'bg-emerald-500' :
                          notif.type === 'warning' ? 'bg-amber-500' : 'bg-blue-500'
                        }`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">{notif.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{notif.time}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {visibleNotifications.length === 0 && (
                    <div className="py-6 text-center text-gray-400 text-sm">Nothing needs your attention</div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2.5 px-3 py-1.5 rounded-full hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <Avatar name={user.name} size="sm" />
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-gray-900 leading-tight">{user.name}</p>
              <p className="text-[10px] text-gray-500">{roleConfig.label}</p>
            </div>
            <ChevronDown size={14} className="text-gray-400" />
          </button>

          <AnimatePresence>
            {showProfile && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden z-50"
              >
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-gray-900">{user.name}</p>
                  <p className="text-xs text-gray-500">{user.email}</p>
                </div>
                <div className="p-1">
                  <button onClick={() => navigateTo('/settings')} className="flex items-center gap-2 px-3 py-2 w-full rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer">
                    <Settings size={16} /> Settings
                  </button>
                  <button
                    onClick={logout}
                    className="flex items-center gap-2 px-3 py-2 w-full rounded-xl text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    <LogOut size={16} /> Logout
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}
