'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import Modal, { FormField, inputClass, selectClass, textareaClass } from '@/components/ui/Modal';
import useSWR from 'swr';
import { getStatusColor, formatINR } from '@/data/mockData';
import {
  listLeads, upsertLead, deleteLead,
  listAccounts, listOpportunities, upsertOpportunity,
} from '@/actions/crm';
import {
  Search, Plus, Filter, Target, Building2, Users, TrendingUp, ArrowRight,
  Mail, Phone, Globe, MapPin, IndianRupee, Calendar, Star, Zap,
  CircleDot, Pencil, Trash2,
} from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.03 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

type CRMTab = 'leads' | 'accounts' | 'opportunities' | 'pipeline';

/** Must match LEAD_STATUSES in src/actions/crm.ts. */
const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

const stageOrder = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'] as const;
const stageLabels: Record<string, string> = { prospecting: 'Prospecting', qualification: 'Qualification', proposal: 'Proposal', negotiation: 'Negotiation', 'closed-won': 'Closed Won', 'closed-lost': 'Closed Lost' };
const stageColors: Record<string, string> = { prospecting: '#94A3B8', qualification: '#45B7D1', proposal: '#FFB84D', negotiation: '#FF8C42', 'closed-won': '#00D4AA', 'closed-lost': '#FF6B6B' };

export default function CRMPage() {
  const { data: leads = [], mutate: mutateLeads } = useSWR('crm_leads', () => listLeads());
  const { data: accounts = [], mutate: mutateAccounts } = useSWR('crm_accounts', () => listAccounts());
  const { data: opportunities = [], mutate: mutateOpps } = useSWR('crm_opportunities', () => listOpportunities());

  const [tab, setTab] = useState<CRMTab>('leads');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Lead CRUD
  const [showLeadModal, setShowLeadModal] = useState(false);
  const [editingLead, setEditingLead] = useState<any>(null);
  const [leadForm, setLeadForm] = useState<any>({});

  // Account detail
  const [selectedAccount, setSelectedAccount] = useState<any>(null);

  // Opportunity CRUD
  const [showOppModal, setShowOppModal] = useState(false);
  const [oppForm, setOppForm] = useState<any>({});

  const openCreateLead = () => {
    setLeadForm({ name: '', email: '', phone: '', company: '', source: 'website', status: 'new', score: 50, assignedTo: 'E008', createdDate: new Date().toISOString().split('T')[0], lastActivity: new Date().toISOString().split('T')[0], notes: '', industry: '', estimatedValue: 0 });
    setEditingLead(null);
    setShowLeadModal(true);
  };

  const openEditLead = (lead: any) => {
    setLeadForm({ ...lead });
    setEditingLead(lead);
    setError('');
    setShowLeadModal(true);
  };

  const handleSaveLead = async () => {
    if (!leadForm.name?.trim()) return;
    setSaving(true); setError('');
    try {
      await upsertLead({ ...leadForm, id: editingLead?.id });
      await mutateLeads();
      setShowLeadModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save lead');
    } finally { setSaving(false); }
  };

  const handleDeleteLead = async (id: string) => {
    setError('');
    try {
      await deleteLead(id);
      await mutateLeads();
      setShowLeadModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete lead');
    }
  };

  const openCreateOpp = () => {
    setOppForm({ name: '', accountId: accounts[0]?.id ?? '', stage: 'prospecting', amount: 0, probability: 10, closeDate: '', type: 'new-business', source: '', nextStep: '', description: '' });
    setError('');
    setShowOppModal(true);
  };

  const handleSaveOpp = async () => {
    if (!oppForm.name?.trim()) return;
    setSaving(true); setError('');
    try {
      await upsertOpportunity({ ...oppForm, accountId: oppForm.accountId || undefined });
      await Promise.all([mutateOpps(), mutateAccounts()]);
      setShowOppModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save opportunity');
    } finally { setSaving(false); }
  };

  // Pipeline stats
  const openOpps = opportunities.filter((o: any) => !['closed-won', 'closed-lost'].includes(o.stage));
  const totalPipeline = openOpps.reduce((a: number, o: any) => a + o.amount, 0);
  const weightedPipeline = openOpps.reduce((a: number, o: any) => a + (o.amount * o.probability / 100), 0);
  const wonDeals = opportunities.filter((o: any) => o.stage === 'closed-won');
  const wonTotal = wonDeals.reduce((a: number, o: any) => a + o.amount, 0);

  const tabs: { id: CRMTab; label: string; icon: React.ReactNode }[] = [
    { id: 'leads', label: 'Leads', icon: <Zap size={14} /> },
    { id: 'accounts', label: 'Accounts', icon: <Building2 size={14} /> },
    { id: 'opportunities', label: 'Opportunities', icon: <Target size={14} /> },
    { id: 'pipeline', label: 'Pipeline', icon: <TrendingUp size={14} /> },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">CRM</h1>
          <p className="text-gray-500 text-sm mt-1">Sales pipeline & relationship management</p>
        </div>
        {tab === 'leads' && <Button icon={<Plus size={16} />} onClick={openCreateLead}>New Lead</Button>}
        {tab === 'opportunities' && <Button icon={<Plus size={16} />} onClick={openCreateOpp}>New Opportunity</Button>}
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <CircleDot size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${tab === t.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-600'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ─── LEADS TAB ─── */}
      {tab === 'leads' && (
        <motion.div variants={item} className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {LEAD_STATUSES.map(s => (
              <Card key={s} padding="sm">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: getStatusColor(s) }} />
                  <div>
                    <p className="text-lg font-bold">{leads.filter((l: any) => l.status === s).length}</p>
                    <p className="text-xs text-gray-500 capitalize">{s}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input type="text" placeholder="Search leads..." value={search} onChange={e => setSearch(e.target.value)} className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-gray-400 transition-all" />
          </div>

          {/* Lead Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {leads.length === 0 && (
              <Card className="text-center py-12">
                <Zap size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-900">No leads yet</p>
                <p className="text-sm text-gray-500 mt-1 mb-4">Add your first lead to start building the pipeline.</p>
                <Button size="sm" icon={<Plus size={14} />} onClick={openCreateLead}>New Lead</Button>
              </Card>
            )}
            {leads.filter((l: any) => {
              const q = search.toLowerCase();
              return `${l.name ?? ''} ${l.company ?? ''}`.toLowerCase().includes(q);
            }).map((lead: any) => (
              <motion.div key={lead.id} variants={item}>
                <Card variant="default" hover className="relative overflow-hidden cursor-pointer" onClick={() => openEditLead(lead as any)}>
                  <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: getStatusColor(lead.status) }} />
                  <div className="flex items-start justify-between pt-2">
                    <div className="flex items-center gap-3">
                      <Avatar name={lead.name} size="md" />
                      <div>
                        <h3 className="text-sm font-semibold">{lead.name}</h3>
                        <p className="text-xs text-gray-500">{lead.company}</p>
                      </div>
                    </div>
                    <Badge variant={lead.status === 'qualified' ? 'success' : lead.status === 'converted' ? 'info' : lead.status === 'unqualified' ? 'danger' : 'warning'} size="sm">{lead.status}</Badge>
                  </div>
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">Lead Score</span>
                      <span className={`text-xs font-bold ${lead.score >= 70 ? 'text-emerald-600' : lead.score >= 40 ? 'text-amber-600' : 'text-red-500'}`}>{lead.score}/100</span>
                    </div>
                    <ProgressBar value={lead.score} size="sm" color={lead.score >= 70 ? 'bg-emerald-500' : lead.score >= 40 ? 'bg-amber-500' : 'bg-red-500'} />
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                    <span className="text-[10px] text-gray-500 capitalize flex items-center gap-1"><CircleDot size={10} />{lead.source}</span>
                    <span className="text-xs font-medium text-gray-700">{formatINR(lead.estimatedValue)}</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ─── ACCOUNTS TAB ─── */}
      {tab === 'accounts' && (
        <motion.div variants={item} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Total Accounts', count: accounts.length, color: '#7C5CFC' },
              { label: 'Customers', count: accounts.filter((a: any) => a.type === 'customer').length, color: '#00D4AA' },
              { label: 'Partners', count: accounts.filter((a: any) => a.type === 'partner').length, color: '#45B7D1' },
              { label: 'Total Revenue', count: formatINR(accounts.reduce((a: number, acc: any) => a + acc.revenue, 0)), color: '#FF8C42' },
            ].map(s => (
              <Card key={s.label} padding="sm">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
                  <div>
                    <p className="text-lg font-bold">{s.count}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          <div className="space-y-3">
            {accounts.length === 0 && (
              <Card className="text-center py-12 md:col-span-2 lg:col-span-3">
                <Building2 size={32} className="mx-auto text-gray-300 mb-3" />
                <p className="text-sm font-medium text-gray-900">No accounts yet</p>
                <p className="text-sm text-gray-500 mt-1">Accounts appear here once you add customers or prospects.</p>
              </Card>
            )}
            {accounts.map((acc: any) => (
              <Card key={acc.id} variant="default" hover className="cursor-pointer" onClick={() => setSelectedAccount(acc)}>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Building2 size={22} className="text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{acc.name}</h3>
                      <Badge variant={acc.type === 'customer' ? 'success' : acc.type === 'partner' ? 'info' : acc.type === 'prospect' ? 'warning' : 'default'} size="sm">{acc.type}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{acc.industry} • {acc.address}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono font-medium">{formatINR(acc.revenue)}</p>
                    <p className="text-xs text-gray-500">{acc.employees.toLocaleString()} employees</p>
                  </div>
                  <Badge variant={acc.status === 'active' ? 'success' : acc.status === 'churned' ? 'danger' : 'default'} size="sm">{acc.status}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* ─── OPPORTUNITIES TAB ─── */}
      {tab === 'opportunities' && (
        <motion.div variants={item} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card padding="sm"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center"><Target size={16} className="text-purple-600" /></div><div><p className="text-lg font-bold">{formatINR(totalPipeline)}</p><p className="text-xs text-gray-500">Total Pipeline</p></div></div></Card>
            <Card padding="sm"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><TrendingUp size={16} className="text-blue-600" /></div><div><p className="text-lg font-bold">{formatINR(weightedPipeline)}</p><p className="text-xs text-gray-500">Weighted Pipeline</p></div></div></Card>
            <Card padding="sm"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center"><Star size={16} className="text-emerald-600" /></div><div><p className="text-lg font-bold">{wonDeals.length}</p><p className="text-xs text-gray-500">Deals Won</p></div></div></Card>
            <Card padding="sm"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center"><IndianRupee size={16} className="text-amber-600" /></div><div><p className="text-lg font-bold">{formatINR(wonTotal)}</p><p className="text-xs text-gray-500">Revenue Won</p></div></div></Card>
          </div>

          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">All Opportunities</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Deal</th>
                    <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Account</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Stage</th>
                    <th className="text-right text-xs font-medium text-gray-500 py-3 px-3">Amount</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Probability</th>
                    <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Close Date</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunities.map((opp: any) => (
                    <tr key={opp.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3">
                        <p className="text-sm font-medium">{opp.name}</p>
                        <p className="text-xs text-gray-500 capitalize">{opp.type.replace('-', ' ')}</p>
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">{opp.accountName}</td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium" style={{ background: `${stageColors[opp.stage]}20`, color: stageColors[opp.stage] }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: stageColors[opp.stage] }} />
                          {stageLabels[opp.stage]}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-sm text-right font-mono">{formatINR(opp.amount)}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-sm font-bold ${opp.probability >= 70 ? 'text-emerald-600' : opp.probability >= 40 ? 'text-amber-600' : 'text-gray-500'}`}>{opp.probability}%</span>
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">{opp.closeDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ─── PIPELINE TAB ─── */}
      {tab === 'pipeline' && (
        <motion.div variants={item} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {stageOrder.map(stage => {
              const stageOpps = opportunities.filter((o: any) => o.stage === stage);
              const stageTotal = stageOpps.reduce((a: number, o: any) => a + o.amount, 0);
              return (
                <Card key={stage} padding="sm">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: stageColors[stage] }} />
                    <span className="text-xs font-semibold text-gray-700">{stageLabels[stage]}</span>
                  </div>
                  <p className="text-lg font-bold">{stageOpps.length}</p>
                  <p className="text-xs text-gray-500 font-mono">{formatINR(stageTotal)}</p>
                </Card>
              );
            })}
          </div>

          {/* Kanban-style pipeline */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {stageOrder.filter(s => !['closed-won', 'closed-lost'].includes(s)).map(stage => {
              const stageOpps = opportunities.filter((o: any) => o.stage === stage);
              return (
                <div key={stage}>
                  <div className="flex items-center gap-2 mb-3 px-1">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: stageColors[stage] }} />
                    <span className="text-xs font-semibold text-gray-700">{stageLabels[stage]}</span>
                    <span className="text-xs text-gray-400 ml-auto">{stageOpps.length}</span>
                  </div>
                  <div className="space-y-2">
                    {stageOpps.map((opp: any) => (
                      <Card key={opp.id} variant="default" hover className="relative overflow-hidden">
                        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: stageColors[stage] }} />
                        <div className="pt-1.5">
                          <h4 className="text-sm font-medium">{opp.name}</h4>
                          <p className="text-xs text-gray-500 mt-0.5">{opp.accountName}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs font-mono font-medium">{formatINR(opp.amount)}</span>
                            <span className={`text-[10px] font-bold ${opp.probability >= 50 ? 'text-emerald-600' : 'text-amber-600'}`}>{opp.probability}%</span>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">{opp.nextStep}</p>
                        </div>
                      </Card>
                    ))}
                    {stageOpps.length === 0 && (
                      <div className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center text-xs text-gray-400">No deals</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Lead Create/Edit Modal */}
      <Modal isOpen={showLeadModal} onClose={() => setShowLeadModal(false)} title={editingLead ? 'Edit Lead' : 'New Lead'} description={editingLead ? 'Update lead details' : 'Add a new lead to the pipeline'} size="lg" footer={<><Button variant="secondary" onClick={() => setShowLeadModal(false)}>Cancel</Button>{editingLead && <Button variant="danger" onClick={() => handleDeleteLead(editingLead.id)}>Delete</Button>}<Button onClick={handleSaveLead} disabled={!leadForm.name?.trim() || saving}>{saving ? 'Saving…' : editingLead ? 'Update' : 'Add Lead'}</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Full Name" required><input className={inputClass} value={leadForm.name || ''} onChange={e => setLeadForm({ ...leadForm, name: e.target.value })} placeholder="Lead name" /></FormField>
          <FormField label="Company"><input className={inputClass} value={leadForm.company || ''} onChange={e => setLeadForm({ ...leadForm, company: e.target.value })} placeholder="Company name" /></FormField>
          <FormField label="Email"><input type="email" className={inputClass} value={leadForm.email || ''} onChange={e => setLeadForm({ ...leadForm, email: e.target.value })} placeholder="email@company.com" /></FormField>
          <FormField label="Phone"><input className={inputClass} value={leadForm.phone || ''} onChange={e => setLeadForm({ ...leadForm, phone: e.target.value })} placeholder="+91 XXXXX XXXXX" /></FormField>
          <FormField label="Industry"><input className={inputClass} value={leadForm.industry || ''} onChange={e => setLeadForm({ ...leadForm, industry: e.target.value })} placeholder="e.g. IT Services" /></FormField>
          <FormField label="Source"><select className={selectClass} value={leadForm.source || 'website'} onChange={e => setLeadForm({ ...leadForm, source: e.target.value })}>{['website', 'referral', 'linkedin', 'cold-call', 'event', 'partner'].map(s => <option key={s} value={s}>{s}</option>)}</select></FormField>
          <FormField label="Status"><select className={selectClass} value={leadForm.status || 'new'} onChange={e => setLeadForm({ ...leadForm, status: e.target.value })}>{['new', 'contacted', 'qualified', 'unqualified', 'converted'].map(s => <option key={s} value={s}>{s}</option>)}</select></FormField>
          <FormField label="Score (0-100)"><input type="number" className={inputClass} min={0} max={100} value={leadForm.score || ''} onChange={e => setLeadForm({ ...leadForm, score: Number(e.target.value) })} placeholder="50" /></FormField>
          <FormField label="Estimated Value (₹)"><input type="number" className={inputClass} value={leadForm.estimatedValue || ''} onChange={e => setLeadForm({ ...leadForm, estimatedValue: Number(e.target.value) })} placeholder="0" /></FormField>
        </div>
        <FormField label="Notes"><textarea className={textareaClass} rows={3} value={leadForm.notes || ''} onChange={e => setLeadForm({ ...leadForm, notes: e.target.value })} placeholder="Additional notes..." /></FormField>
      </Modal>

      {/* Opportunity Create Modal */}
      <Modal isOpen={showOppModal} onClose={() => setShowOppModal(false)} title="New Opportunity" description="Add a new deal to the pipeline" size="lg" footer={<><Button variant="secondary" onClick={() => setShowOppModal(false)}>Cancel</Button><Button onClick={handleSaveOpp}>Create Opportunity</Button></>}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Deal Name" required><input className={inputClass} value={oppForm.name || ''} onChange={e => setOppForm({ ...oppForm, name: e.target.value })} placeholder="Deal name" /></FormField>
          <FormField label="Account"><select className={selectClass} value={oppForm.accountId || ''} onChange={e => { const acc = accounts.find((a: any) => a.id === e.target.value); setOppForm({ ...oppForm, accountId: e.target.value, accountName: acc?.name || '' }); }}>{accounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></FormField>
          <FormField label="Amount (₹)"><input type="number" className={inputClass} value={oppForm.amount || ''} onChange={e => setOppForm({ ...oppForm, amount: Number(e.target.value) })} /></FormField>
          <FormField label="Probability (%)"><input type="number" className={inputClass} min={0} max={100} value={oppForm.probability || ''} onChange={e => setOppForm({ ...oppForm, probability: Number(e.target.value) })} /></FormField>
          <FormField label="Stage"><select className={selectClass} value={oppForm.stage || 'prospecting'} onChange={e => setOppForm({ ...oppForm, stage: e.target.value })}>{stageOrder.map(s => <option key={s} value={s}>{stageLabels[s]}</option>)}</select></FormField>
          <FormField label="Close Date"><input type="date" className={inputClass} value={oppForm.closeDate || ''} onChange={e => setOppForm({ ...oppForm, closeDate: e.target.value })} /></FormField>
        </div>
        <FormField label="Next Step"><input className={inputClass} value={oppForm.nextStep || ''} onChange={e => setOppForm({ ...oppForm, nextStep: e.target.value })} placeholder="Next action..." /></FormField>
        <FormField label="Description"><textarea className={textareaClass} rows={3} value={oppForm.description || ''} onChange={e => setOppForm({ ...oppForm, description: e.target.value })} /></FormField>
      </Modal>

      {/* Account Detail Modal */}
      <Modal isOpen={!!selectedAccount} onClose={() => setSelectedAccount(null)} title={selectedAccount?.name || ''} description={selectedAccount?.industry} size="md" footer={<Button variant="secondary" onClick={() => setSelectedAccount(null)}>Close</Button>}>
        {selectedAccount && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Globe size={14} />, label: 'Website', value: selectedAccount.website },
                { icon: <Mail size={14} />, label: 'Email', value: selectedAccount.email },
                { icon: <Phone size={14} />, label: 'Phone', value: selectedAccount.phone },
                { icon: <MapPin size={14} />, label: 'Address', value: selectedAccount.address },
                { icon: <Users size={14} />, label: 'Employees', value: selectedAccount.employees.toLocaleString() },
                { icon: <IndianRupee size={14} />, label: 'Revenue', value: formatINR(selectedAccount.revenue) },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="text-gray-400">{f.icon}</span>
                  <div><p className="text-[10px] text-gray-500 uppercase tracking-wide">{f.label}</p><p className="text-sm text-gray-900">{f.value}</p></div>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Related Opportunities</h4>
              <div className="space-y-2">
                {opportunities.filter((o: any) => o.accountId === selectedAccount.id).map((opp: any) => (
                  <div key={opp.id} className="flex items-center justify-between p-2 rounded-lg bg-gray-50">
                    <div>
                      <p className="text-sm font-medium">{opp.name}</p>
                      <p className="text-xs text-gray-500">{stageLabels[opp.stage]}</p>
                    </div>
                    <span className="text-sm font-mono">{formatINR(opp.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </motion.div>
  );
}
