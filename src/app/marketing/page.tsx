'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass } from '@/components/ui/Modal';
import { formatINR, getStatusColor } from '@/data/mockData';
import {
  listCampaigns, createCampaign, updateCampaign, deleteCampaign,
  addSpendEntry, getMarketingSummary,
} from '@/actions/marketing';
import {
  Megaphone, IndianRupee, MousePointerClick, TrendingUp, Plus,
  Play, Pause, CheckCircle2, Trash2, Wallet,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

type DbCampaign = Awaited<ReturnType<typeof listCampaigns>>[number];
type Summary = Awaited<ReturnType<typeof getMarketingSummary>>;

const CHANNELS = ['Social', 'Search', 'Email', 'Display', 'Events', 'Content'];

export default function MarketingPage() {
  const [campaigns, setCampaigns] = useState<DbCampaign[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dbError, setDbError] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [spendFor, setSpendFor] = useState<DbCampaign | null>(null);
  const [form, setForm] = useState({ name: '', channel: 'Social', objective: '', budget: '', startDate: '', endDate: '' });
  const [spendForm, setSpendForm] = useState({ amount: '', description: '', impressions: '', clicks: '', conversions: '' });

  const refresh = useCallback(() => {
    Promise.all([listCampaigns(), getMarketingSummary()])
      .then(([cs, s]) => { setCampaigns(cs); setSummary(s); setDbError(false); })
      .catch(() => setDbError(true));
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createCampaign({
      name: form.name.trim(),
      channel: form.channel,
      objective: form.objective || undefined,
      budget: Number(form.budget) || 0,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
    }).then(() => { setShowCreate(false); setForm({ name: '', channel: 'Social', objective: '', budget: '', startDate: '', endDate: '' }); refresh(); }).catch(() => setDbError(true));
  };

  const handleAddSpend = () => {
    if (!spendFor || !Number(spendForm.amount)) return;
    addSpendEntry(spendFor.id, {
      amount: Number(spendForm.amount),
      description: spendForm.description || undefined,
      impressions: Number(spendForm.impressions) || 0,
      clicks: Number(spendForm.clicks) || 0,
      conversions: Number(spendForm.conversions) || 0,
    }).then(() => { setSpendFor(null); setSpendForm({ amount: '', description: '', impressions: '', clicks: '', conversions: '' }); refresh(); }).catch(() => setDbError(true));
  };

  const setStatus = (id: string, status: string) =>
    updateCampaign(id, { status }).then(refresh).catch(() => setDbError(true));

  const spentOf = (c: DbCampaign) => c.spends.reduce((a: number, s: any) => a + s.amount, 0);

  const channelData = summary
    ? Object.entries(summary.byChannel).map(([channel, v]) => ({ channel, budget: v.budget, spent: v.spent }))
    : [];
  const totalClicks = summary ? Object.values(summary.byChannel).reduce((a, b) => a + b.clicks, 0) : 0;
  const totalImpressions = summary ? Object.values(summary.byChannel).reduce((a, b) => a + b.impressions, 0) : 0;
  const ctr = totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : '0.00';

  const kpis = [
    { label: 'Total Budget', value: formatINR(summary?.totalBudget ?? 0), icon: <Wallet size={18} />, color: '#3B82F6' },
    { label: 'Total Spent', value: formatINR(summary?.totalSpent ?? 0), icon: <IndianRupee size={18} />, color: '#10B981' },
    { label: 'Campaigns', value: String(summary?.campaignCount ?? campaigns.length), icon: <Megaphone size={18} />, color: '#F59E0B' },
    { label: 'Overall CTR', value: `${ctr}%`, icon: <MousePointerClick size={18} />, color: '#8B5CF6' },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Marketing</h1>
          <p className="text-sm text-gray-500">Campaigns, spend tracking and channel performance</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus size={16} /> New Campaign</Button>
      </motion.div>

      {dbError && (
        <motion.div variants={item} className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Could not reach the database. Start it with <code className="font-mono">docker compose up -d db</code> and reload.
        </motion.div>
      )}

      <motion.div variants={item} className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${k.color}1A`, color: k.color }}>{k.icon}</div>
              <div>
                <p className="text-xs text-gray-500">{k.label}</p>
                <p className="text-lg font-semibold text-gray-900">{k.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </motion.div>

      {channelData.length > 0 && (
        <motion.div variants={item}>
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2"><TrendingUp size={16} /> Budget vs Spend by Channel</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={channelData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="channel" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v) => formatINR(Number(v ?? 0))} />
                  <Legend />
                  <Bar dataKey="budget" name="Budget" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="spent" name="Spent" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </motion.div>
      )}

      <motion.div variants={item}>
        <Card className="p-0 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Campaigns</h2>
          </div>
          {campaigns.length === 0 ? (
            <p className="px-5 py-8 text-sm text-gray-400 text-center">No campaigns yet. Create one to get started.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-5 py-3 font-medium">Campaign</th>
                    <th className="px-5 py-3 font-medium">Channel</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium text-right">Budget</th>
                    <th className="px-5 py-3 font-medium text-right">Spent</th>
                    <th className="px-5 py-3 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-5 py-3">
                        <p className="font-medium text-gray-900">{c.name}</p>
                        {c.objective && <p className="text-xs text-gray-500">{c.objective}</p>}
                      </td>
                      <td className="px-5 py-3 text-gray-600">{c.channel}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusColor(c.status)}`}>{c.status}</span>
                      </td>
                      <td className="px-5 py-3 text-right text-gray-900">{formatINR(c.budget)}</td>
                      <td className="px-5 py-3 text-right text-gray-900">{formatINR(spentOf(c))}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setSpendFor(c)} className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-600 hover:bg-blue-50 cursor-pointer" title="Log spend"><IndianRupee size={14} /></button>
                          {c.status !== 'active' && <button onClick={() => setStatus(c.id, 'active')} className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 cursor-pointer" title="Activate"><Play size={14} /></button>}
                          {c.status === 'active' && <button onClick={() => setStatus(c.id, 'paused')} className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-600 hover:bg-amber-50 cursor-pointer" title="Pause"><Pause size={14} /></button>}
                          {c.status !== 'completed' && <button onClick={() => setStatus(c.id, 'completed')} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 cursor-pointer" title="Mark completed"><CheckCircle2 size={14} /></button>}
                          <button onClick={() => deleteCampaign(c.id).then(refresh).catch(() => setDbError(true))} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 cursor-pointer" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </motion.div>

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Campaign">
        <div className="space-y-4">
          <FormField label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Diwali Mega Sale" /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Channel">
              <select className={selectClass} value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
                {CHANNELS.map((ch) => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            </FormField>
            <FormField label="Budget (₹)"><input type="number" className={inputClass} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></FormField>
          </div>
          <FormField label="Objective"><input className={inputClass} value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Awareness / Leads / Conversions" /></FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start date"><input type="date" className={inputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></FormField>
            <FormField label="End date"><input type="date" className={inputClass} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate}>Create</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!spendFor} onClose={() => setSpendFor(null)} title={spendFor ? `Log spend — ${spendFor.name}` : 'Log spend'}>
        <div className="space-y-4">
          <FormField label="Amount (₹)"><input type="number" className={inputClass} value={spendForm.amount} onChange={(e) => setSpendForm({ ...spendForm, amount: e.target.value })} /></FormField>
          <FormField label="Description"><input className={inputClass} value={spendForm.description} onChange={(e) => setSpendForm({ ...spendForm, description: e.target.value })} placeholder="Instagram ads — week 2" /></FormField>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Impressions"><input type="number" className={inputClass} value={spendForm.impressions} onChange={(e) => setSpendForm({ ...spendForm, impressions: e.target.value })} /></FormField>
            <FormField label="Clicks"><input type="number" className={inputClass} value={spendForm.clicks} onChange={(e) => setSpendForm({ ...spendForm, clicks: e.target.value })} /></FormField>
            <FormField label="Conversions"><input type="number" className={inputClass} value={spendForm.conversions} onChange={(e) => setSpendForm({ ...spendForm, conversions: e.target.value })} /></FormField>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setSpendFor(null)}>Cancel</Button>
            <Button onClick={handleAddSpend}>Add spend</Button>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
