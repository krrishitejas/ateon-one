'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass, textareaClass } from '@/components/ui/Modal';
import { listTickets, createTicket, updateTicket, getTicketSummary } from '@/actions/serviceDesk';
import { listUsers } from '@/actions/auth';
import {
  Plus, Search, LifeBuoy, Clock, AlertTriangle, CheckCircle2,
  ArrowUpCircle, ArrowDownCircle, MinusCircle, Flame, Pencil, AlertCircle,
} from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.03 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const priorityIcons: Record<string, React.ReactNode> = {
  critical: <Flame size={14} className="text-red-500" />,
  high: <ArrowUpCircle size={14} className="text-orange-500" />,
  medium: <MinusCircle size={14} className="text-amber-500" />,
  low: <ArrowDownCircle size={14} className="text-gray-400" />,
};

const CATEGORIES = ['it', 'hr', 'facilities', 'finance', 'general'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'in-progress', 'resolved', 'closed'];

export default function ServiceDeskPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: tickets = [], mutate } = useSWR('tickets', () => listTickets(), { refreshInterval: 20000 });
  const { data: summary, mutate: mutateSummary } = useSWR('ticket_summary', getTicketSummary);
  const { data: users = [] } = useSWR('users', listUsers);

  const isAgent = summary?.isAgent ?? false;

  const filtered = tickets.filter((t: any) => {
    const haystack = `${t.subject} ${t.description}`.toLowerCase();
    const matchSearch = haystack.includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || t.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || t.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ subject: '', description: '', category: 'it', priority: 'medium' });
    setError('');
    setShowModal(true);
  };

  const openEdit = (ticket: any) => {
    setEditing(ticket);
    setForm({ ...ticket });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      if (editing) {
        await updateTicket(editing.id, {
          status: form.status,
          priority: isAgent ? form.priority : undefined,
          assignedTo: isAgent ? (form.assignedTo || null) : undefined,
        });
      } else {
        await createTicket({
          subject: form.subject,
          description: form.description,
          category: form.category,
          priority: form.priority,
        });
      }
      await Promise.all([mutate(), mutateSummary()]);
      setShowModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save ticket');
    } finally { setSaving(false); }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Service Desk</h1>
          <p className="text-gray-500 text-sm mt-1">
            {isAgent ? 'Support tickets across the organisation' : 'Tickets you have raised'}
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>New Ticket</Button>
      </div>

      {error && !showModal && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Open', value: summary.open, color: '#FFB84D', icon: <LifeBuoy size={16} /> },
            { label: 'In Progress', value: summary.inProgress, color: '#45B7D1', icon: <Clock size={16} /> },
            { label: 'Resolved', value: summary.resolved, color: '#00D4AA', icon: <CheckCircle2 size={16} /> },
            { label: 'Closed', value: summary.closed, color: '#94A3B8', icon: <CheckCircle2 size={16} /> },
          ].map(s => (
            <Card key={s.label} padding="sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                  <span style={{ color: s.color }}>{s.icon}</span>
                </div>
                <div>
                  <p className="text-lg font-bold">{s.value}</p>
                  <p className="text-xs text-gray-500">{s.label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-gray-400 transition-all"
          />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer focus:outline-none focus:border-gray-400">
          <option value="all">All Statuses</option>
          {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm cursor-pointer focus:outline-none focus:border-gray-400">
          <option value="all">All Priorities</option>
          {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {/* Tickets */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <Card className="text-center py-12">
            <LifeBuoy size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-900">
              {tickets.length === 0 ? 'No tickets yet' : 'No tickets match your filters'}
            </p>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              {tickets.length === 0 ? 'Raise a ticket and the right team picks it up.' : 'Try widening your search.'}
            </p>
            {tickets.length === 0 && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>Raise a ticket</Button>}
          </Card>
        )}

        {filtered.map((ticket: any) => (
          <motion.div key={ticket.id} variants={item}>
            <Card variant="default" hover>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <LifeBuoy size={18} className="text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold truncate">{ticket.subject}</h3>
                    <span className="flex items-center gap-1 text-xs">
                      {priorityIcons[ticket.priority]}
                      {ticket.priority}
                    </span>
                    <Badge
                      variant={
                        ticket.status === 'resolved' ? 'success'
                        : ticket.status === 'closed' ? 'default'
                        : ticket.status === 'in-progress' ? 'info'
                        : 'warning'
                      }
                      size="sm"
                    >
                      {ticket.status}
                    </Badge>
                    <Badge variant="default" size="sm">{ticket.category}</Badge>
                    {ticket.slaBreached && (
                      <Badge variant="danger" size="sm">
                        <AlertTriangle size={10} /> SLA breached
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{ticket.description}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Avatar name={ticket.reportedBy} size="sm" />
                      <span>{ticket.reportedBy}</span>
                    </div>
                    <span>•</span>
                    <span>{new Date(ticket.createdAt).toLocaleDateString('en-IN')}</span>
                    {ticket.assignedTo && (
                      <>
                        <span>•</span>
                        <span>Assigned to {ticket.assignedTo}</span>
                      </>
                    )}
                    {ticket.slaDeadline && !['resolved', 'closed'].includes(ticket.status) && (
                      <>
                        <span>•</span>
                        <span className={ticket.slaBreached ? 'text-red-600' : ''}>
                          Due {new Date(ticket.slaDeadline).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button onClick={() => openEdit(ticket)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer flex-shrink-0" title="Update">
                  <Pencil size={14} />
                </button>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setError(''); }}
        title={editing ? 'Update Ticket' : 'New Ticket'}
        description={editing ? 'Change status, priority or assignment.' : 'Describe the issue and we will route it.'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || (!editing && (!form.subject?.trim() || !form.description?.trim()))}>
              {saving ? 'Saving…' : editing ? 'Update' : 'Raise Ticket'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {!editing ? (
            <>
              <FormField label="Subject" required>
                <input className={inputClass} value={form.subject || ''} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Short summary" />
              </FormField>
              <FormField label="Description" required>
                <textarea className={textareaClass} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What's happening?" />
              </FormField>
              <div className="grid grid-cols-2 gap-4">
                <FormField label="Category">
                  <select className={selectClass} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </FormField>
                <FormField label="Priority">
                  <select className={selectClass} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </FormField>
              </div>
              <p className="text-xs text-gray-500">
                An SLA deadline is set automatically from the priority — 4h for critical, up to 72h for low.
              </p>
            </>
          ) : (
            <>
              <div className="p-3 bg-gray-50 rounded-xl">
                <p className="text-sm font-medium text-gray-900">{editing.subject}</p>
                <p className="text-xs text-gray-500 mt-1">{editing.description}</p>
              </div>
              <FormField label="Status">
                <select className={selectClass} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  {(isAgent ? STATUSES : ['closed']).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </FormField>
              {isAgent && (
                <div className="grid grid-cols-2 gap-4">
                  <FormField label="Priority">
                    <select className={selectClass} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  </FormField>
                  <FormField label="Assign to">
                    <select className={selectClass} value={form.assignedTo || ''} onChange={e => setForm({ ...form, assignedTo: e.target.value })}>
                      <option value="">— Unassigned —</option>
                      {users.map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
                    </select>
                  </FormField>
                </div>
              )}
              {!isAgent && (
                <p className="text-xs text-gray-500">You can close your own ticket. Only support agents can reassign or reprioritise.</p>
              )}
            </>
          )}
        </div>
      </Modal>
    </motion.div>
  );
}
