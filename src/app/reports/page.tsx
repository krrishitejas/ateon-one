'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatINR } from '@/data/mockData';
import useSWR from 'swr';
import { listOpportunities, listLeads } from '@/actions/crm';
import { listEmployees } from '@/actions/hrms';
import { listExpenses } from '@/actions/finance';
import { listProjects } from '@/actions/projects';
import { getReportData } from '@/actions/reports';
import { FileBarChart, Download, Filter, BarChart3, PieChart, TrendingUp, Users, IndianRupee, Target, FolderKanban } from 'lucide-react';
import { BarChart, Bar, PieChart as RPieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

type ReportType = 'revenue' | 'pipeline' | 'headcount' | 'expenses' | 'projects' | 'leads';

const COLORS = ['#7C5CFC', '#00D4AA', '#FF8C42', '#45B7D1', '#FF6B6B', '#FFB84D', '#94A3B8', '#4ECDC4'];

export default function ReportsPage() {
  const { data: opportunities = [] } = useSWR('crm_opportunities', () => listOpportunities());
  const { data: employees = [] } = useSWR('employees', listEmployees);
  const { data: leads = [] } = useSWR('crm_leads', () => listLeads());
  const { data: projects = [] } = useSWR('projects', listProjects);
  const { data: report } = useSWR('report_data', getReportData);
  // Expenses are finance-gated; a non-finance user simply gets an empty series.
  const { data: expenses = [] } = useSWR('finance_expenses', () => listExpenses().catch(() => []));
  const revenueData = report?.revenueData ?? [];
  const [activeReport, setActiveReport] = useState<ReportType>('revenue');

  const reports: { id: ReportType; label: string; icon: React.ReactNode; description: string }[] = [
    { id: 'revenue', label: 'Revenue Trend', icon: <TrendingUp size={18} />, description: 'Monthly revenue vs expenses trend' },
    { id: 'pipeline', label: 'Sales Pipeline', icon: <Target size={18} />, description: 'Pipeline by stage & probability' },
    { id: 'headcount', label: 'Headcount', icon: <Users size={18} />, description: 'Department-wise employee distribution' },
    { id: 'expenses', label: 'Expense Analysis', icon: <IndianRupee size={18} />, description: 'Expense breakdown by category' },
    { id: 'projects', label: 'Project Status', icon: <FolderKanban size={18} />, description: 'Project health & timeline' },
    { id: 'leads', label: 'Lead Funnel', icon: <BarChart3 size={18} />, description: 'Lead conversion funnel' },
  ];

  // Pipeline data
  const pipelineData = useMemo(() => {
    const stages = ['prospecting', 'qualification', 'proposal', 'negotiation', 'closed-won', 'closed-lost'];
    return stages.map(stage => ({
      stage: stage.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      deals: opportunities.filter((o: any) => o.stage === stage).length,
      value: opportunities.filter((o: any) => o.stage === stage).reduce((a: number, o: any) => a + Number(o.amount), 0),
      weighted: opportunities.filter((o: any) => o.stage === stage).reduce((a: number, o: any) => a + (Number(o.amount) * Number(o.probability) / 100), 0),
    }));
  }, [opportunities]);

  // Headcount data
  const headcountData = useMemo(() => {
    const depts = [...new Set(employees.map((e: any) => e.department?.name ?? 'Unassigned'))];
    return depts.map(dept => ({
      department: dept,
      count: employees.filter((e: any) => (e.department?.name ?? 'Unassigned') === dept).length,
      active: employees.filter((e: any) => (e.department?.name ?? 'Unassigned') === dept && e.status === 'active').length,
    }));
  }, [employees]);

  // Expense data
  const expenseData = useMemo(() => {
    const cats = [...new Set(expenses.map((e: any) => e.category))];
    return cats.map(cat => ({
      name: cat,
      value: expenses.filter((e: any) => e.category === cat).reduce((a: number, e: any) => a + Number(e.amount), 0),
    }));
  }, [expenses]);

  // Lead funnel
  const leadFunnelData = useMemo(() => {
    const statuses: Array<{ status: string; label: string }> = [
      { status: 'new', label: 'New' },
      { status: 'contacted', label: 'Contacted' },
      { status: 'qualified', label: 'Qualified' },
      { status: 'proposal', label: 'Proposal' },
      { status: 'won', label: 'Won' },
    ];
    return statuses.map(s => ({
      name: s.label,
      count: leads.filter((l: any) => l.status === s.status).length,
      value: leads.filter((l: any) => l.status === s.status).reduce((a: number, l: any) => a + Number(l.estimatedValue), 0),
    }));
  }, [leads]);

  // Project status data
  const projectData = useMemo(() => {
    const statuses = ['planned', 'active', 'on-hold', 'completed'];
    return statuses.map(s => ({
      name: s.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()),
      value: projects.filter((p: any) => p.status === s).length,
    }));
  }, [projects]);

  const exportCSV = () => {
    let csv = '';
    let filename = '';

    if (activeReport === 'revenue') {
      csv = 'Month,Revenue,Expenses\n' + revenueData.map(r => `${r.month},${r.revenue},${r.expenses}`).join('\n');
      filename = 'revenue_report.csv';
    } else if (activeReport === 'pipeline') {
      csv = 'Stage,Deals,Value,Weighted\n' + pipelineData.map(p => `${p.stage},${p.deals},${p.value},${p.weighted}`).join('\n');
      filename = 'pipeline_report.csv';
    } else if (activeReport === 'headcount') {
      csv = 'Department,Total,Active\n' + headcountData.map(h => `${h.department},${h.count},${h.active}`).join('\n');
      filename = 'headcount_report.csv';
    } else if (activeReport === 'expenses') {
      csv = 'Category,Amount\n' + expenseData.map(e => `${e.name},${e.value}`).join('\n');
      filename = 'expense_report.csv';
    } else if (activeReport === 'leads') {
      csv = 'Status,Count,EstimatedValue\n' + leadFunnelData.map(l => `${l.name},${l.count},${l.value}`).join('\n');
      filename = 'leads_report.csv';
    } else {
      csv = 'Status,Count\n' + projectData.map(p => `${p.name},${p.value}`).join('\n');
      filename = 'projects_report.csv';
    }

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-gray-500 text-sm mt-1">Analytics & business intelligence</p>
        </div>
        <Button icon={<Download size={16} />} variant="secondary" onClick={exportCSV}>Export CSV</Button>
      </div>

      {/* Report Selector */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {reports.map(r => (
          <motion.div key={r.id} variants={item}>
            <Card variant={activeReport === r.id ? 'default' : 'default'} hover className={`cursor-pointer transition-all ${activeReport === r.id ? 'ring-2 ring-gray-900 ring-offset-2' : ''}`} onClick={() => setActiveReport(r.id)}>
              <div className="flex flex-col items-center text-center gap-2 py-2">
                <span className={activeReport === r.id ? 'text-gray-900' : 'text-gray-400'}>{r.icon}</span>
                <span className={`text-xs font-medium ${activeReport === r.id ? 'text-gray-900' : 'text-gray-500'}`}>{r.label}</span>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Report Content */}
      <motion.div key={activeReport} variants={item}>
        <Card variant="default">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-sm font-semibold">{reports.find(r => r.id === activeReport)?.label}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{reports.find(r => r.id === activeReport)?.description}</p>
            </div>
            <Badge variant="default" size="sm">Live Data</Badge>
          </div>

          {activeReport === 'revenue' && (
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000000).toFixed(0)}M`} />
                <Tooltip contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12 }} formatter={(value) => [formatINR(Number(value))]} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#00D4AA" strokeWidth={2.5} dot={{ r: 4 }} name="Revenue" />
                <Line type="monotone" dataKey="expenses" stroke="#FF6B6B" strokeWidth={2.5} dot={{ r: 4 }} name="Expenses" />
              </LineChart>
            </ResponsiveContainer>
          )}

          {activeReport === 'pipeline' && (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={pipelineData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="stage" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000000).toFixed(0)}M`} />
                <Tooltip contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12 }} formatter={(value) => [formatINR(Number(value))]} />
                <Legend />
                <Bar dataKey="value" fill="rgba(124,92,252,0.3)" radius={[4, 4, 0, 0]} name="Total Value" />
                <Bar dataKey="weighted" fill="#7C5CFC" radius={[4, 4, 0, 0]} name="Weighted Value" />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeReport === 'headcount' && (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={headcountData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="department" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
                <Tooltip contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12 }} />
                <Legend />
                <Bar dataKey="count" fill="rgba(69,183,209,0.3)" radius={[0, 4, 4, 0]} name="Total" />
                <Bar dataKey="active" fill="#45B7D1" radius={[0, 4, 4, 0]} name="Active" />
              </BarChart>
            </ResponsiveContainer>
          )}

          {activeReport === 'expenses' && (
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={400}>
                <RPieChart>
                  <Pie data={expenseData} cx="50%" cy="50%" innerRadius={80} outerRadius={160} paddingAngle={4} dataKey="value" nameKey="name" label={((props: {name?: string; percent?: number}) => `${props.name ?? ''} (${(((props.percent) ?? 0) * 100).toFixed(0)}%)`) as never}>
                    {expenseData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12 }} formatter={(value) => [formatINR(Number(value))]} />
                </RPieChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeReport === 'projects' && (
            <div className="flex items-center justify-center">
              <ResponsiveContainer width="100%" height={400}>
                <RPieChart>
                  <Pie data={projectData} cx="50%" cy="50%" outerRadius={160} paddingAngle={4} dataKey="value" nameKey="name" label={({ name, value }) => `${name}: ${value}`}>
                    {projectData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12 }} />
                  <Legend />
                </RPieChart>
              </ResponsiveContainer>
            </div>
          )}

          {activeReport === 'leads' && (
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={leadFunnelData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000000).toFixed(1)}M`} />
                <Tooltip contentStyle={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: 12 }} />
                <Legend />
                <Bar yAxisId="left" dataKey="count" fill="#7C5CFC" radius={[4, 4, 0, 0]} name="Count" />
                <Bar yAxisId="right" dataKey="value" fill="rgba(0,212,170,0.5)" radius={[4, 4, 0, 0]} name="Est. Value" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </motion.div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card padding="sm">
          <p className="text-xs text-gray-500">Total Revenue (YTD)</p>
          <p className="text-lg font-bold mt-1">{formatINR(revenueData.reduce((a, r) => a + r.revenue, 0))}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-500">Active Pipeline</p>
          <p className="text-lg font-bold mt-1">{formatINR(opportunities.filter((o: any) => !['closed-won', 'closed-lost'].includes(o.stage)).reduce((a: number, o: any) => a + Number(o.amount), 0))}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-500">Total Employees</p>
          <p className="text-lg font-bold mt-1">{employees.length}</p>
        </Card>
        <Card padding="sm">
          <p className="text-xs text-gray-500">Active Leads</p>
          <p className="text-lg font-bold mt-1">{leads.filter((l: any) => !['won', 'lost'].includes(l.status)).length}</p>
        </Card>
      </div>
    </motion.div>
  );
}
