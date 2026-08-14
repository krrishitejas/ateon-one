'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass } from '@/components/ui/Modal';
import { formatINR } from '@/data/mockData';
import { listApprovals, createApproval, setApprovalStatus, getApprovalSummary } from '@/actions/approvals';
import { CheckCircle2, XCircle, Plus, CheckSquare, AlertCircle } from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const typeIcons: Record<string, string> = {
  leave: '🏖️',
  budget: '💰',
  procurement: '📦',
  expense: '💳',
  other: '📋',
};

const APPROVAL_TYPES = ['expense', 'leave', 'procurement', 'budget', 'other'];

export default function ApprovalsPage() {
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ title: '', type: 'expense', amount: 0, priority: 'medium' });

  const { data: approvals = [], mutate } = useSWR('approvals', () => listApprovals(), { refreshInterval: 20000 });
  const { data: summary, mutate: mutateSummary } = useSWR('approvals_summary', getApprovalSummary);

  const filtered = filter === 'all' ? approvals : approvals.filter((a: any) => a.status === filter);
  const countOf = (s: string) => approvals.filter((a: any) => a.status === s).length;

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setError('');
    try {
      await setApprovalStatus(id, status);
      await Promise.all([mutate(), mutateSummary()]);
    } catch (e: any) {
      setError(e?.message ?? 'Could not update this request');
    }
  };

  const submit = async () => {
    setSaving(true); setError('');
    try {
      await createApproval({
        title: form.title,
        type: form.type,
        amount: form.amount > 0 ? Number(form.amount) : undefined,
        priority: form.priority,
      });
      await Promise.all([mutate(), mutateSummary()]);
      setShowModal(false);
      setForm({ title: '', type: 'expense', amount: 0, priority: 'medium' });
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit request');
    } finally { setSaving(false); }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Approval Center</h1>
          <p className="text-gray-500 text-sm mt-1">
            {summary?.canApprove
              ? `${countOf('pending')} pending approvals requiring your action`
              : 'Your submitted requests'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {countOf('pending') > 0 && <Badge variant="warning" size="md" dot>{countOf('pending')} Pending</Badge>}
          <Button icon={<Plus size={16} />} onClick={() => setShowModal(true)}>New Request</Button>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer capitalize ${filter === f ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-600'}`}
          >
            {f} ({f === 'all' ? approvals.length : countOf(f)})
          </button>
        ))}
      </div>

      {/* Approval Items */}
      <div className="space-y-4">
        {filtered.length === 0 && (
          <Card className="text-center py-12">
            <CheckSquare size={32} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-900">
              {approvals.length === 0 ? 'No approval requests yet' : `Nothing ${filter}`}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {approvals.length === 0
                ? 'Raise a request and it appears here for sign-off.'
                : 'Try a different filter.'}
            </p>
          </Card>
        )}

        {filtered.map((approval: any) => (
          <motion.div key={approval.id} variants={item}>
            <Card variant="default" hover className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center text-2xl flex-shrink-0">
                  {typeIcons[approval.type] ?? typeIcons.other}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-semibold">{approval.title}</h3>
                    <Badge variant={approval.status === 'pending' ? 'warning' : approval.status === 'approved' ? 'success' : 'danger'} size="sm">
                      {approval.status}
                    </Badge>
                    <Badge variant="default" size="sm">{approval.type}</Badge>
                    {approval.priority && approval.priority !== 'medium' && (
                      <Badge variant={approval.priority === 'critical' || approval.priority === 'high' ? 'danger' : 'default'} size="sm">
                        {approval.priority}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 flex-wrap">
                    <div className="flex items-center gap-1.5">
                      <Avatar name={approval.requestedBy} size="sm" />
                      <span>{approval.requestedBy}</span>
                    </div>
                    <span>•</span>
                    <span>{new Date(approval.createdAt).toLocaleDateString('en-IN')}</span>
                    {approval.amount != null && (
                      <>
                        <span>•</span>
                        <span className="font-mono font-medium text-gray-600">{formatINR(Number(approval.amount))}</span>
                      </>
                    )}
                  </div>
                  {approval.status !== 'pending' && approval.decidedBy && (
                    <p className="text-xs text-gray-500 mt-2">
                      {approval.status === 'approved' ? 'Approved' : 'Rejected'} by {approval.decidedBy}
                      {approval.decidedAt ? ` on ${new Date(approval.decidedAt).toLocaleDateString('en-IN')}` : ''}
                    </p>
                  )}
                </div>
              </div>

              {approval.status === 'pending' && summary?.canApprove && (
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="success" size="sm" icon={<CheckCircle2 size={14} />} onClick={() => decide(approval.id, 'approved')}>Approve</Button>
                  <Button variant="danger" size="sm" icon={<XCircle size={14} />} onClick={() => decide(approval.id, 'rejected')}>Reject</Button>
                </div>
              )}
            </Card>
          </motion.div>
        ))}
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setError(''); }}
        title="New Approval Request"
        description="Submit something for sign-off."
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
            <Button onClick={submit} disabled={!form.title.trim() || saving}>
              {saving ? 'Submitting…' : 'Submit'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Title" required>
            <input className={inputClass} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What needs approving?" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">
              <select className={selectClass} value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {APPROVAL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Priority">
              <select className={selectClass} value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value })}>
                {['low', 'medium', 'high', 'critical'].map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Amount (₹), if applicable">
            <input type="number" min={0} className={inputClass} value={form.amount || ''} onChange={e => setForm({ ...form, amount: Number(e.target.value) })} placeholder="0" />
          </FormField>
        </div>
      </Modal>
    </motion.div>
  );
}
