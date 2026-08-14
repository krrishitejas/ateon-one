'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { listAuditEntries } from '@/actions/audit';
import {
  Download, Search, ClipboardList, Plus, Pencil, Trash2,
  CheckCircle2, XCircle, LogIn, FileOutput, Clock, Activity,
  Shield,
} from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.03 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const actionIcons: Record<string, React.ReactNode> = {
  created: <Plus size={14} className="text-emerald-500" />,
  updated: <Pencil size={14} className="text-blue-500" />,
  deleted: <Trash2 size={14} className="text-red-500" />,
  approved: <CheckCircle2 size={14} className="text-emerald-500" />,
  rejected: <XCircle size={14} className="text-red-500" />,
  'logged-in': <LogIn size={14} className="text-purple-500" />,
  exported: <FileOutput size={14} className="text-amber-500" />,
  other: <Activity size={14} className="text-gray-400" />,
};

const actionColors: Record<string, string> = {
  created: '#00D4AA',
  updated: '#45B7D1',
  deleted: '#FF6B6B',
  approved: '#00D4AA',
  rejected: '#FF6B6B',
  'logged-in': '#7C5CFC',
  exported: '#FFB84D',
  other: '#94A3B8',
};

/**
 * Server actions are logged as dotted paths — `hrms.employee.create`,
 * `user.login`. Split that into a module and a normalised verb so the timeline
 * can colour and icon them.
 */
function normalise(action: string): { module: string; verb: string } {
  const parts = String(action).split('.');
  const module = parts.length > 1 ? parts[0] : 'system';
  const last = (parts[parts.length - 1] ?? '').toLowerCase();

  const verb =
    last.startsWith('creat') ? 'created'
    : last.startsWith('updat') || last === 'set' || last === 'assign' || last === 'upsert' ? 'updated'
    : last.startsWith('delet') || last === 'exit' || last === 'remove' ? 'deleted'
    : last.startsWith('approv') ? 'approved'
    : last.startsWith('reject') ? 'rejected'
    : last.startsWith('login') || last === 'signin' ? 'logged-in'
    : last.startsWith('export') ? 'exported'
    : 'other';

  return { module, verb };
}

export default function AuditPage() {
  const { data: entries = [], isLoading, error } = useSWR('audit_entries', () => listAuditEntries({ limit: 300 }), {
    refreshInterval: 15000,
  });

  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  const rows = useMemo(
    () => entries.map(e => ({ ...e, ...normalise(e.action) })),
    [entries]
  );

  const modules = useMemo(() => [...new Set(rows.map(r => r.module))].sort(), [rows]);
  const actions = useMemo(() => [...new Set(rows.map(r => r.verb))].sort(), [rows]);

  const filtered = rows.filter(entry => {
    const haystack = `${entry.details ?? ''} ${entry.actorName ?? ''} ${entry.entity ?? ''} ${entry.action}`.toLowerCase();
    const matchSearch = haystack.includes(search.toLowerCase());
    const matchModule = moduleFilter === 'all' || entry.module === moduleFilter;
    const matchAction = actionFilter === 'all' || entry.verb === actionFilter;
    return matchSearch && matchModule && matchAction;
  });

  const exportCSV = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = 'Timestamp,User,Action,Module,Entity,EntityId,Details,IP\n' +
      filtered.map(e => [
        e.createdAt, e.actorName, e.action, e.module, e.entity, e.entityId, e.details, e.ipAddress,
      ].map(esc).join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit_trail_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (ts: string | Date) => {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  if (error) {
    return (
      <Card className="text-center py-12">
        <Shield size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-900">Audit trail unavailable</p>
        <p className="text-sm text-gray-500 mt-1">
          You may not have permission to view the audit log.
        </p>
      </Card>
    );
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Audit Trail</h1>
          <p className="text-gray-500 text-sm mt-1">Complete activity log for compliance &amp; security</p>
        </div>
        <Button icon={<Download size={16} />} variant="secondary" onClick={exportCSV} disabled={filtered.length === 0}>
          Export Audit Log
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Actions', count: rows.length, color: '#7C5CFC', icon: <ClipboardList size={16} /> },
          { label: 'Creates', count: rows.filter(a => a.verb === 'created').length, color: '#00D4AA', icon: <Plus size={16} /> },
          { label: 'Updates', count: rows.filter(a => a.verb === 'updated').length, color: '#45B7D1', icon: <Pencil size={16} /> },
          { label: 'Logins', count: rows.filter(a => a.verb === 'logged-in').length, color: '#FF8C42', icon: <LogIn size={16} /> },
        ].map(s => (
          <Card key={s.label} padding="sm">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                <span style={{ color: s.color }}>{s.icon}</span>
              </div>
              <div>
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search audit log..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-gray-400 transition-all"
          />
        </div>
        <select value={moduleFilter} onChange={e => setModuleFilter(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 cursor-pointer">
          <option value="all">All Modules</option>
          {modules.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select value={actionFilter} onChange={e => setActionFilter(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 cursor-pointer">
          <option value="all">All Actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {/* Compliance Notice */}
      <Card padding="sm" variant="default">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <Shield size={16} className="text-emerald-600" />
          </div>
          <div>
            <p className="text-xs font-medium text-gray-700">Activity logging</p>
            <p className="text-[10px] text-gray-500">
              System actions are recorded with timestamp, user identity and affected record.
            </p>
          </div>
        </div>
      </Card>

      {/* Audit Timeline */}
      <Card variant="default">
        <h3 className="text-sm font-semibold mb-4">Activity Timeline</h3>
        <div className="space-y-0">
          {filtered.map((entry, idx) => (
            <motion.div key={entry.id} variants={item} className="relative">
              {idx < filtered.length - 1 && (
                <div className="absolute left-5 top-10 w-0.5 h-full -translate-x-1/2" style={{ background: '#E5E7EB' }} />
              )}
              <div className="flex items-start gap-4 py-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 z-10" style={{ background: `${actionColors[entry.verb]}15` }}>
                  {actionIcons[entry.verb]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{entry.actorName}</span>
                    <Badge
                      variant={
                        entry.verb === 'created' || entry.verb === 'approved' ? 'success'
                        : entry.verb === 'deleted' || entry.verb === 'rejected' ? 'danger'
                        : entry.verb === 'logged-in' ? 'info'
                        : 'default'
                      }
                      size="sm"
                    >
                      {entry.verb}
                    </Badge>
                    <Badge variant="default" size="sm">{entry.module}</Badge>
                  </div>
                  {entry.details && <p className="text-xs text-gray-600 mt-0.5">{entry.details}</p>}
                  <div className="flex items-center gap-4 mt-1 flex-wrap">
                    <span className="text-[10px] text-gray-400 flex items-center gap-1">
                      <Clock size={10} />{formatTimestamp(entry.createdAt)}
                    </span>
                    {entry.ipAddress && <span className="text-[10px] text-gray-400 font-mono">IP: {entry.ipAddress}</span>}
                    {entry.entity && (
                      <span className="text-[10px] text-gray-400">
                        {entry.entity}{entry.entityId ? ` #${entry.entityId}` : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
          {isLoading && filtered.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">Loading audit trail…</div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-8">
              <ClipboardList size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500">
                {rows.length === 0 ? 'No activity recorded yet.' : 'No entries match your filters.'}
              </p>
            </div>
          )}
        </div>
      </Card>
    </motion.div>
  );
}
