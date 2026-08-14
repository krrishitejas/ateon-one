'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import { formatINR } from '@/data/mockData';
import { getCommandCentre, type RosterEntry } from '@/actions/command';
import { setLeaveStatus } from '@/actions/hrms';
import { setApprovalStatus } from '@/actions/approvals';
import { useSocket, useSocketEvent } from '@/context/SocketContext';
import {
  Activity, Users, Coffee, Plane, LogOut as LogOutIcon, UserX, Clock,
  CheckCircle2, XCircle, AlertTriangle, MapPin, Building2, ShieldAlert, Wifi, WifiOff,
} from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

const STATE_META: Record<string, { label: string; color: string; badge: 'success' | 'warning' | 'info' | 'default' | 'danger' }> = {
  working: { label: 'Working', color: '#00D4AA', badge: 'success' },
  break: { label: 'On break', color: '#FFB84D', badge: 'warning' },
  leave: { label: 'On leave', color: '#7C5CFC', badge: 'info' },
  out: { label: 'Checked out', color: '#94A3B8', badge: 'default' },
  absent: { label: 'Not in', color: '#CBD5E1', badge: 'default' },
};

function duration(seconds: number): string {
  if (!seconds || seconds < 0) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function CommandCentrePage() {
  const { connected, isOnline } = useSocket();
  const [filter, setFilter] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const { data, mutate, isLoading, error: loadError } = useSWR('command_centre', getCommandCentre, {
    // Live events drive refreshes; poll slowly only when the socket is down.
    refreshInterval: connected ? 60000 : 15000,
  });

  // Someone clocked in/out or took a break.
  useSocketEvent('attendance:update', () => { mutate(); });
  useSocketEvent('approvals:changed', () => { mutate(); });
  useSocketEvent('notifications:refresh', () => { mutate(); });

  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setError('');
    try {
      await fn();
      await mutate();
    } catch (e: any) {
      setError(e?.message ?? 'Action failed');
    } finally { setBusy(null); }
  };

  if (loadError) {
    return (
      <Card className="text-center py-16">
        <ShieldAlert size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-900">Command centre unavailable</p>
        <p className="text-sm text-gray-500 mt-1">This view is limited to leadership roles.</p>
      </Card>
    );
  }

  const roster = data?.roster ?? [];
  const shown = filter === 'all' ? roster : roster.filter((r: RosterEntry) => r.state === filter);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Command Centre</h1>
          <p className="text-gray-500 text-sm mt-1">
            {data?.scope === 'team' ? 'Live view of your team' : 'Live view across the organisation'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-white">
          {connected ? <Wifi size={13} className="text-emerald-600" /> : <WifiOff size={13} className="text-gray-400" />}
          <span className={`text-xs ${connected ? 'text-emerald-600' : 'text-gray-400'}`}>
            {connected ? 'Live' : 'Reconnecting…'}
          </span>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Attendance rollup */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { key: 'all', label: 'Headcount', value: data?.attendance.headcount ?? 0, icon: <Users size={16} />, color: '#0F172A' },
          { key: 'working', label: 'Working', value: data?.attendance.working ?? 0, icon: <Activity size={16} />, color: '#00D4AA' },
          { key: 'break', label: 'On break', value: data?.attendance.onBreak ?? 0, icon: <Coffee size={16} />, color: '#FFB84D' },
          { key: 'leave', label: 'On leave', value: data?.attendance.onLeave ?? 0, icon: <Plane size={16} />, color: '#7C5CFC' },
          { key: 'out', label: 'Checked out', value: data?.attendance.checkedOut ?? 0, icon: <LogOutIcon size={16} />, color: '#94A3B8' },
          { key: 'absent', label: 'Not in', value: data?.attendance.absent ?? 0, icon: <UserX size={16} />, color: '#CBD5E1' },
        ].map(s => (
          <motion.div key={s.key} variants={item}>
            <Card
              padding="sm"
              hover
              onClick={() => setFilter(s.key)}
              className={filter === s.key ? 'ring-2 ring-gray-900' : ''}
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${s.color}18` }}>
                  <span style={{ color: s.color }}>{s.icon}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-lg font-bold leading-tight">{s.value}</p>
                  <p className="text-xs text-gray-500 truncate">{s.label}</p>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live roster */}
        <motion.div variants={item} className="lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold">Live Roster</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Total worked today: {duration(data?.attendance.totalWorkedSeconds ?? 0)}
                </p>
              </div>
              {filter !== 'all' && (
                <Button size="sm" variant="ghost" onClick={() => setFilter('all')}>Clear filter</Button>
              )}
            </div>

            {isLoading && roster.length === 0 && (
              <p className="text-sm text-gray-500 py-6 text-center">Loading roster…</p>
            )}

            {!isLoading && roster.length === 0 && (
              <div className="text-center py-10">
                <Users size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">No employees yet. Add people in HRMS.</p>
              </div>
            )}

            {shown.length === 0 && roster.length > 0 && (
              <p className="text-sm text-gray-500 py-6 text-center">Nobody in this state right now.</p>
            )}

            <div className="divide-y divide-gray-100">
              {shown.map((r: RosterEntry) => {
                const meta = STATE_META[r.state] ?? STATE_META.absent;
                return (
                  <div key={r.employeeId} className="flex items-center gap-3 py-3">
                    <div className="relative flex-shrink-0">
                      <Avatar name={r.name} size="sm" />
                      {/* Green dot = actually connected to the app right now. */}
                      {r.userId && isOnline(r.userId) && (
                        <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{r.name}</p>
                        <Badge size="sm" variant={meta.badge}>{meta.label}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 truncate">
                        {r.designation}{r.department ? ` · ${r.department}` : ''}
                      </p>
                    </div>
                    {r.location && (
                      <span className="hidden md:flex items-center gap-1 text-[11px] text-gray-400 flex-shrink-0">
                        <MapPin size={11} />{r.location}
                      </span>
                    )}
                    <div className="text-right flex-shrink-0 w-20">
                      <p className="text-sm font-mono">{duration(r.workedSeconds)}</p>
                      {r.breakSeconds > 0 && (
                        <p className="text-[10px] text-gray-400">{duration(r.breakSeconds)} break</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </motion.div>

        {/* Queues */}
        <motion.div variants={item} className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold mb-3">Awaiting your decision</h3>

            {(data?.queues.pendingApprovals.length ?? 0) === 0 && (data?.queues.pendingLeave.length ?? 0) === 0 && (
              <div className="text-center py-6">
                <CheckCircle2 size={24} className="mx-auto text-emerald-500 mb-2" />
                <p className="text-sm text-gray-500">Nothing pending. All clear.</p>
              </div>
            )}

            {data?.queues.pendingApprovals.map((a: any) => (
              <div key={a.id} className="py-2.5 border-b border-gray-100 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{a.title}</p>
                    <p className="text-xs text-gray-500">
                      {a.requestedBy}
                      {a.amount != null ? ` · ${formatINR(a.amount)}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      disabled={busy === a.id}
                      onClick={() => act(a.id, () => setApprovalStatus(a.id, 'approved'))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 cursor-pointer disabled:opacity-40"
                      title="Approve"
                    >
                      <CheckCircle2 size={15} />
                    </button>
                    <button
                      disabled={busy === a.id}
                      onClick={() => act(a.id, () => setApprovalStatus(a.id, 'rejected'))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-40"
                      title="Reject"
                    >
                      <XCircle size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {data?.queues.pendingLeave.map((l: any) => (
              <div key={l.id} className="py-2.5 border-b border-gray-100 last:border-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {l.employeeName} · {l.days}d {l.type}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{l.reason}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      disabled={busy === l.id}
                      onClick={() => act(l.id, () => setLeaveStatus(l.id, 'approved'))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 cursor-pointer disabled:opacity-40"
                      title="Approve leave"
                    >
                      <CheckCircle2 size={15} />
                    </button>
                    <button
                      disabled={busy === l.id}
                      onClick={() => act(l.id, () => setLeaveStatus(l.id, 'rejected'))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 cursor-pointer disabled:opacity-40"
                      title="Reject leave"
                    >
                      <XCircle size={15} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold mb-3">Operations</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Open tickets</span>
                <span className="font-medium">{data?.queues.openTickets ?? 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500 flex items-center gap-1">
                  {(data?.queues.slaBreached ?? 0) > 0 && <AlertTriangle size={12} className="text-red-500" />}
                  SLA breached
                </span>
                <span className={`font-medium ${(data?.queues.slaBreached ?? 0) > 0 ? 'text-red-600' : ''}`}>
                  {data?.queues.slaBreached ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                <span className="text-gray-500">Active projects</span>
                <span className="font-medium">{data?.projects.active ?? 0} / {data?.projects.total ?? 0}</span>
              </div>
              <div className="flex items-center gap-2 pt-1">
                {[
                  { label: 'green', n: data?.projects.green ?? 0, c: '#00D4AA' },
                  { label: 'amber', n: data?.projects.amber ?? 0, c: '#FFB84D' },
                  { label: 'red', n: data?.projects.red ?? 0, c: '#FF6B6B' },
                ].map(h => (
                  <span key={h.label} className="flex items-center gap-1 text-xs text-gray-500">
                    <span className="w-2 h-2 rounded-full" style={{ background: h.c }} />
                    {h.n}
                  </span>
                ))}
              </div>
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Building2 size={14} className="text-gray-400" /> Departments
            </h3>
            {(data?.departments.length ?? 0) === 0 && (
              <p className="text-sm text-gray-500">No departments defined yet.</p>
            )}
            <div className="space-y-2">
              {data?.departments.map((d: any) => (
                <div key={d.name}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="text-gray-700 truncate">{d.name}</span>
                    <span className="text-gray-500 flex-shrink-0">{d.working}/{d.total} in</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all"
                      style={{ width: `${d.total > 0 ? (d.working / d.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
