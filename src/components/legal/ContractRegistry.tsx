'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass, textareaClass } from '@/components/ui/Modal';
import { formatINR } from '@/data/mockData';
import {
  listContracts, upsertContract, deleteContract, getLegalSummary,
  expireLapsedContracts, type ContractDTO,
} from '@/actions/legal';
import {
  Scale, Plus, Pencil, Trash2, AlertTriangle, CalendarClock, ShieldAlert, RefreshCw,
} from 'lucide-react';

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } };

const TYPES = ['nda', 'service', 'employment', 'vendor', 'license'];
const STATUSES = ['draft', 'review', 'active', 'expired', 'terminated'];

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  active: 'success',
  review: 'warning',
  draft: 'default',
  expired: 'danger',
  terminated: 'default',
};

export default function ContractRegistry() {
  const { data: contracts = [], mutate, isLoading, error: loadError } =
    useSWR('legal_contracts', () => listContracts());
  const { data: summary, mutate: mutateSummary } = useSWR('legal_summary', getLegalSummary);

  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<ContractDTO | null>(null);
  const [form, setForm] = useState<any>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState('all');

  if (loadError) {
    return (
      <Card className="text-center py-12">
        <ShieldAlert size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm font-medium text-gray-900">Contracts unavailable</p>
        <p className="text-sm text-gray-500 mt-1">This register is limited to legal and executive roles.</p>
      </Card>
    );
  }

  const shown = filter === 'all' ? contracts : contracts.filter(c => c.status === filter);

  const openCreate = () => {
    setEditing(null);
    setForm({
      title: '', party: '', type: 'service', status: 'draft',
      startDate: new Date().toISOString().split('T')[0],
      endDate: '', value: 0, renewalNotice: 30, notes: '', signatories: '',
    });
    setError('');
    setShowModal(true);
  };

  const openEdit = (c: ContractDTO) => {
    setEditing(c);
    setForm({
      ...c,
      startDate: c.startDate ? new Date(c.startDate).toISOString().split('T')[0] : '',
      endDate: c.endDate ? new Date(c.endDate).toISOString().split('T')[0] : '',
      value: c.value ?? 0,
      signatories: c.signatories.join(', '),
    });
    setError('');
    setShowModal(true);
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      await upsertContract({
        id: editing?.id,
        title: form.title,
        party: form.party,
        type: form.type,
        status: form.status,
        startDate: form.startDate,
        endDate: form.endDate || undefined,
        value: Number(form.value) || 0,
        renewalNotice: Number(form.renewalNotice) || 30,
        notes: form.notes,
        signatories: String(form.signatories || '')
          .split(',').map((s: string) => s.trim()).filter(Boolean),
      });
      await Promise.all([mutate(), mutateSummary()]);
      setShowModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save contract');
    } finally { setSaving(false); }
  };

  const remove = async (c: ContractDTO) => {
    if (!confirm(`Delete "${c.title}"?`)) return;
    try {
      await deleteContract(c.id);
      await Promise.all([mutate(), mutateSummary()]);
    } catch (e: any) { setError(e?.message ?? 'Could not delete'); }
  };

  const runExpiry = async () => {
    setError('');
    try {
      const r = await expireLapsedContracts();
      await Promise.all([mutate(), mutateSummary()]);
      if (r.expired === 0) setError('');
    } catch (e: any) { setError(e?.message ?? 'Could not run expiry'); }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertTriangle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Active', value: summary.active, color: '#00D4AA' },
            { label: 'In review', value: summary.inReview, color: '#FFB84D' },
            { label: 'Expiring soon', value: summary.expiringSoon, color: '#FF6B6B' },
            { label: 'Expired', value: summary.expired, color: '#94A3B8' },
            { label: 'Active value', value: formatINR(summary.totalValue), color: '#7C5CFC' },
          ].map(s => (
            <Card key={s.label} padding="sm">
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Renewal alerts */}
      {summary && summary.renewals.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/40">
          <div className="flex items-start gap-3">
            <CalendarClock size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-amber-900">Renewals due</p>
              <div className="mt-2 space-y-1">
                {summary.renewals.map((r: any) => (
                  <p key={r.id} className="text-xs text-amber-800">
                    <span className="font-medium">{r.title}</span> — {r.party} ·{' '}
                    {r.daysToExpiry === 0 ? 'expires today' : `${r.daysToExpiry} day(s) left`}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
          {['all', ...STATUSES].map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                filter === s ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={runExpiry}>
            Run expiry check
          </Button>
          <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>New Contract</Button>
        </div>
      </div>

      {isLoading && contracts.length === 0 && (
        <Card><p className="text-sm text-gray-500">Loading contracts…</p></Card>
      )}

      {!isLoading && shown.length === 0 && (
        <Card className="text-center py-12">
          <Scale size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-900">
            {contracts.length === 0 ? 'No contracts recorded' : `Nothing ${filter}`}
          </p>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            {contracts.length === 0
              ? 'Track agreements, values and renewal dates in one place.'
              : 'Try a different filter.'}
          </p>
          {contracts.length === 0 && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>Add the first contract</Button>}
        </Card>
      )}

      <div className="space-y-3">
        {shown.map(c => (
          <motion.div key={c.id} variants={item} initial="hidden" animate="show">
            <Card hover>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Scale size={18} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold truncate">{c.title}</h3>
                    <Badge size="sm" variant={statusVariant[c.status] ?? 'default'}>{c.status}</Badge>
                    <Badge size="sm" variant="default">{c.type}</Badge>
                    {c.needsRenewal && (
                      <Badge size="sm" variant="warning">
                        <AlertTriangle size={10} /> renewal due
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {c.party}
                    {' · '}
                    {new Date(c.startDate).toLocaleDateString('en-IN')}
                    {c.endDate ? ` → ${new Date(c.endDate).toLocaleDateString('en-IN')}` : ' → open-ended'}
                    {c.daysToExpiry !== null && c.daysToExpiry < 0 ? ' · lapsed' : ''}
                  </p>
                  {c.signatories.length > 0 && (
                    <p className="text-[11px] text-gray-400 mt-1">Signed by {c.signatories.join(', ')}</p>
                  )}
                </div>
                {c.value != null && c.value > 0 && (
                  <span className="text-sm font-mono font-medium flex-shrink-0">{formatINR(c.value)}</span>
                )}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => openEdit(c)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(c)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setError(''); }}
        title={editing ? 'Edit Contract' : 'New Contract'}
        description="Record the agreement, its value and when it needs renewing."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={save} disabled={!form.title?.trim() || !form.party?.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">{error}</div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Title" required>
              <input className={inputClass} value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="e.g. Master Services Agreement" />
            </FormField>
            <FormField label="Counterparty" required>
              <input className={inputClass} value={form.party || ''} onChange={e => setForm({ ...form, party: e.target.value })} placeholder="Company or person" />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Type">
              <select className={selectClass} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Status">
              <select className={selectClass} value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {STATUSES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Value (₹)">
              <input type="number" min={0} className={inputClass} value={form.value ?? 0} onChange={e => setForm({ ...form, value: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Start date" required>
              <input type="date" className={inputClass} value={form.startDate || ''} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </FormField>
            <FormField label="End date">
              <input type="date" className={inputClass} value={form.endDate || ''} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </FormField>
            <FormField label="Renewal notice (days)">
              <input type="number" min={0} className={inputClass} value={form.renewalNotice ?? 30} onChange={e => setForm({ ...form, renewalNotice: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Signatories">
            <input className={inputClass} value={form.signatories || ''} onChange={e => setForm({ ...form, signatories: e.target.value })} placeholder="Comma separated names" />
          </FormField>
          <FormField label="Notes">
            <textarea className={textareaClass} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Key terms, obligations, anything to remember" />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
