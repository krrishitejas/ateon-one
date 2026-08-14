'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import Modal, { FormField, inputClass, selectClass, textareaClass } from '@/components/ui/Modal';
import { formatINR, Expense, Budget } from '@/data/mockData';
import useSWR from 'swr';
import { getReportData } from '@/actions/reports';
import { getFinanceOverview, listBudgets, upsertBudget, listExpenses, submitExpense, setExpenseStatus } from '@/actions/finance';
import { IndianRupee, TrendingUp, CreditCard, PiggyBank, ArrowUpRight, ArrowDownRight, Plus, Check, X, Pencil } from 'lucide-react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

type DbBudget = Awaited<ReturnType<typeof listBudgets>>[number];
type DbExpense = Awaited<ReturnType<typeof listExpenses>>[number];

// Map a Prisma Budget row (one department+category per row) onto the mock Budget shape the UI renders.
function mapDbBudget(b: DbBudget): Budget {
  return {
    id: b.id,
    department: b.department,
    allocated: b.allocated,
    spent: b.spent,
    quarter: b.fiscalYear,
    categories: [{ name: b.category, amount: b.allocated, spent: b.spent }],
  };
}

// Map a Prisma Expense row onto the mock Expense shape the UI renders.
function mapDbExpense(e: DbExpense): Expense {
  return {
    id: e.id,
    title: e.description,
    amount: e.amount,
    category: e.category,
    requestedBy: e.submittedBy ?? '',
    status: e.status === 'approved' || e.status === 'reimbursed' ? 'approved' : e.status === 'rejected' ? 'rejected' : 'pending',
    date: new Date(e.date).toISOString().split('T')[0],
    description: e.vendor ?? '',
  };
}

export default function FinancePage() {
  const { data: overview = null } = useSWR('finance_overview', getFinanceOverview);
  const { data: dbBudgets = null, mutate: mutateBudgets } = useSWR('finance_budgets', () => listBudgets());
  const { data: dbExpenses = null, mutate: mutateExpenses } = useSWR('finance_expenses', () => listExpenses());
  const { data: report } = useSWR('report_data', getReportData);

  const budgets = dbBudgets ?? [];
  const expenses = dbExpenses ?? [];
  const revenueData = report?.revenueData ?? [];
  const [saveError, setSaveError] = React.useState('');

  const budgetRows: Budget[] = dbBudgets ? dbBudgets.map(mapDbBudget) : budgets;
  const expenseRows: Expense[] = dbExpenses ? dbExpenses.map(mapDbExpense) : expenses;

  const totalAllocated = overview ? overview.allocated : budgets.reduce((a: number, b: any) => a + b.allocated, 0);
  const totalSpent = overview ? overview.spent : budgets.reduce((a: number, b: any) => a + b.spent, 0);
  const totalPending = expenseRows.filter(e => e.status === 'pending').reduce((a, e) => a + e.amount, 0);
  // TODO(workstream-B): no server action yet — mock data (monthly revenue-vs-expenses trend series)
  const latestRevenue = revenueData[revenueData.length - 1];
  const kpiRevenue = overview ? overview.collected : latestRevenue.revenue;

  // Expense CRUD
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [expForm, setExpForm] = useState<Partial<Expense>>({});

  // Budget edit state
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [budgetAlloc, setBudgetAlloc] = useState(0);

  const openCreate = () => {
    setExpForm({ title: '', amount: 0, category: 'Travel', date: new Date().toISOString().split('T')[0], description: '', requestedBy: 'E008' });
    setShowExpenseModal(true);
  };
  const openEdit = (exp: Expense) => { setExpForm({ ...exp }); setEditingExpense(exp); setShowExpenseModal(true); };
  const closeModal = () => { setShowExpenseModal(false); setEditingExpense(null); };

  const handleSave = async () => {
    if (!expForm.title?.trim() || !expForm.amount) return;
    setSaveError('');
    try {
      // Only creation is supported server-side; status changes go through
      // handleExpenseStatus, which is the approval path.
      if (!editingExpense) {
        await submitExpense({
          description: expForm.title || '',
          category: expForm.category || 'Travel',
          amount: Number(expForm.amount) || 0,
          date: expForm.date || new Date().toISOString().split('T')[0],
        });
        await mutateExpenses();
      }
      closeModal();
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not save expense');
    }
  };

  const handleExpenseStatus = async (id: string, status: 'approved' | 'rejected') => {
    setSaveError('');
    try {
      await setExpenseStatus(id, status);
      await mutateExpenses();
    } catch (e: any) {
      setSaveError(e?.message ?? 'Could not update expense');
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Finance & Budget</h1>
          <p className="text-gray-500 text-sm mt-1">Financial overview, budgets, and expense management</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>New Expense</Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Total Revenue (Jul)', value: formatINR(kpiRevenue), icon: <IndianRupee size={20} />, color: '#059669', change: '+5.6%', up: true },
          { title: 'Total Budget', value: formatINR(totalAllocated), icon: <PiggyBank size={20} />, color: '#7C3AED', change: 'Q2 FY25', up: true },
          { title: 'Total Spent', value: formatINR(totalSpent), icon: <CreditCard size={20} />, color: '#DC2626', change: `${totalAllocated ? Math.round((totalSpent / totalAllocated) * 100) : 0}% utilized`, up: false },
          { title: 'Pending Approvals', value: formatINR(totalPending), icon: <TrendingUp size={20} />, color: '#D97706', change: `${expenseRows.filter(e => e.status === 'pending').length} requests`, up: false },
        ].map(kpi => (
          <motion.div key={kpi.title} variants={item}>
            <Card variant="default" hover>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500">{kpi.title}</p>
                  <p className="text-xl font-bold mt-1">{kpi.value}</p>
                  <div className="flex items-center gap-1 mt-2">
                    {kpi.up ? <ArrowUpRight size={14} className="text-emerald-600" /> : <ArrowDownRight size={14} className="text-amber-600" />}
                    <span className="text-xs text-gray-500">{kpi.change}</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${kpi.color}15`, border: `1px solid ${kpi.color}30` }}>
                  <span style={{ color: kpi.color }}>{kpi.icon}</span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={item}>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Revenue vs Expenses Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="finRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#059669" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="finExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#DC2626" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#DC2626" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000000).toFixed(0)}M`} />
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12 }} formatter={(value) => [formatINR(Number(value))]} />
                <Legend />
                <Area type="monotone" dataKey="revenue" stroke="#059669" fill="url(#finRevenue)" strokeWidth={2} name="Revenue" />
                <Area type="monotone" dataKey="expenses" stroke="#DC2626" fill="url(#finExpenses)" strokeWidth={2} name="Expenses" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Department Budget vs Spent</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={budgetRows} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000000).toFixed(0)}M`} />
                <YAxis type="category" dataKey="department" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12 }} formatter={(value) => [formatINR(Number(value))]} />
                <Legend />
                <Bar dataKey="allocated" fill="rgba(124,92,252,0.3)" radius={[0, 4, 4, 0]} name="Allocated" />
                <Bar dataKey="spent" fill="#7C5CFC" radius={[0, 4, 4, 0]} name="Spent" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* Budget Breakdown */}
      <motion.div variants={item}>
        <Card variant="default">
          <h3 className="text-sm font-semibold mb-4">Budget Breakdown by Department</h3>
          <div className="space-y-6">
            {budgetRows.map(budget => {
              const utilization = budget.allocated ? Math.round((budget.spent / budget.allocated) * 100) : 0;
              return (
                <div key={budget.id}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium">{budget.department}</span>
                      <span className="text-xs text-gray-500 ml-2">({budget.quarter})</span>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <span className="text-sm font-mono">{formatINR(budget.spent)}</span>
                        <span className="text-xs text-gray-500"> / {formatINR(budget.allocated)}</span>
                      </div>
                      <button
                        onClick={() => { setEditingBudget(budget); setBudgetAlloc(budget.allocated); }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer" title="Edit Budget"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </div>
                  <ProgressBar value={utilization} size="md" color={utilization > 80 ? 'bg-red-500' : utilization > 60 ? 'bg-amber-500' : 'bg-emerald-500'} />
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    {budget.categories.map(cat => (
                      <div key={cat.name} className="bg-gray-50 rounded-lg p-2">
                        <p className="text-[10px] text-gray-500">{cat.name}</p>
                        <p className="text-xs font-medium mt-0.5">{formatINR(cat.spent)}</p>
                        <ProgressBar value={cat.amount ? Math.round((cat.spent / cat.amount) * 100) : 0} size="sm" className="mt-1" />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </motion.div>

      {/* Expense Requests Table — with Actions */}
      <motion.div variants={item}>
        <Card variant="default">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Expense Requests</h3>
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={openCreate}>Add Expense</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Title</th>
                  <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Category</th>
                  <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Date</th>
                  <th className="text-right text-xs font-medium text-gray-500 py-3 px-3">Amount</th>
                  <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Status</th>
                  <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {expenseRows.map(exp => (
                  <tr key={exp.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-3">
                      <p className="text-sm font-medium">{exp.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{exp.description}</p>
                    </td>
                    <td className="py-3 px-3 text-sm text-gray-600">{exp.category}</td>
                    <td className="py-3 px-3 text-sm text-gray-600">{exp.date}</td>
                    <td className="py-3 px-3 text-sm text-right font-mono">{formatINR(exp.amount)}</td>
                    <td className="py-3 px-3 text-center">
                      <Badge variant={exp.status === 'approved' ? 'success' : exp.status === 'pending' ? 'warning' : 'danger'} size="sm">{exp.status}</Badge>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1">
                        {exp.status === 'pending' && (
                          <>
                            <button onClick={() => handleExpenseStatus(exp.id, 'approved')} className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 transition-colors cursor-pointer" title="Approve">
                              <Check size={14} />
                            </button>
                            <button onClick={() => handleExpenseStatus(exp.id, 'rejected')} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 transition-colors cursor-pointer" title="Reject">
                              <X size={14} />
                            </button>
                          </>
                        )}
                        <button onClick={() => openEdit(exp)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer" title="Edit">
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* Expense Create/Edit Modal */}
      <Modal
        isOpen={showExpenseModal}
        onClose={closeModal}
        title={editingExpense ? 'Edit Expense' : 'New Expense Request'}
        description={editingExpense ? 'Update expense details' : 'Submit a new expense for approval'}
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>Cancel</Button>
            <Button onClick={handleSave}>{editingExpense ? 'Update' : 'Submit Expense'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Title" required>
            <input className={inputClass} value={expForm.title || ''} onChange={e => setExpForm({ ...expForm, title: e.target.value })} placeholder="Expense title" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Amount (₹)" required>
              <input type="number" className={inputClass} value={expForm.amount || ''} onChange={e => setExpForm({ ...expForm, amount: Number(e.target.value) })} placeholder="0" />
            </FormField>
            <FormField label="Category">
              <select className={selectClass} value={expForm.category || 'Travel'} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
                {['Travel', 'Equipment', 'Software', 'Office Supplies', 'Marketing', 'Training', 'Miscellaneous'].map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </FormField>
          </div>
          <FormField label="Date">
            <input type="date" className={inputClass} value={expForm.date || ''} onChange={e => setExpForm({ ...expForm, date: e.target.value })} />
          </FormField>
          <FormField label="Description">
            <textarea className={textareaClass} rows={3} value={expForm.description || ''} onChange={e => setExpForm({ ...expForm, description: e.target.value })} placeholder="Describe the expense..." />
          </FormField>
        </div>
      </Modal>

      {/* Budget Edit Modal */}
      <Modal
        isOpen={!!editingBudget}
        onClose={() => setEditingBudget(null)}
        title={`Edit Budget — ${editingBudget?.department || ''}`}
        description={`Adjust allocated budget for ${editingBudget?.quarter || ''}`}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditingBudget(null)}>Cancel</Button>
            <Button onClick={async () => {
              if (!editingBudget) return;
              setSaveError('');
              try {
                const row = dbBudgets?.find((b: any) => b.id === editingBudget.id);
                if (row) {
                  await upsertBudget({
                    id: row.id, department: row.department, category: row.category,
                    fiscalYear: row.fiscalYear, allocated: budgetAlloc,
                    spent: row.spent, status: row.status,
                  });
                  await mutateBudgets();
                }
                setEditingBudget(null);
              } catch (e: any) {
                setSaveError(e?.message ?? 'Could not save budget');
              }
            }}>Save Budget</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Department">
            <input className={inputClass} value={editingBudget?.department || ''} disabled />
          </FormField>
          <FormField label="Quarter">
            <input className={inputClass} value={editingBudget?.quarter || ''} disabled />
          </FormField>
          <FormField label="Current Spent">
            <input className={inputClass} value={editingBudget ? formatINR(editingBudget.spent) : ''} disabled />
          </FormField>
          <FormField label="Allocated Budget (₹)" required>
            <input type="number" className={inputClass} value={budgetAlloc || ''} onChange={e => setBudgetAlloc(Number(e.target.value))} placeholder="0" />
          </FormField>
          {editingBudget && budgetAlloc > 0 && (
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-500">Utilization Preview</p>
              <p className="text-sm font-bold mt-1">{Math.round((editingBudget.spent / budgetAlloc) * 100)}%</p>
              <ProgressBar value={Math.round((editingBudget.spent / budgetAlloc) * 100)} size="sm" className="mt-1" />
            </div>
          )}
        </div>
      </Modal>
    </motion.div>
  );
}
