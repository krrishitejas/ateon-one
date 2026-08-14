'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import { useAuth } from '@/context/AuthContext';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import ProgressBar from '@/components/ui/ProgressBar';
import Button from '@/components/ui/Button';
import { getAnalyticsData } from '@/actions/analytics';
import { getDashboardStats } from '@/actions/dashboard';
import {
  TrendingUp, TrendingDown, Users, FolderKanban, IndianRupee,
  Clock, CheckCircle2, ArrowUpRight, Activity,
  CalendarDays, Target, ShieldCheck, Server, GitBranch, Zap, Loader2
} from 'lucide-react';

function formatINR(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function getStatusColor(status: string) {
  switch (status) {
    case 'on-track': return '#00D4AA';
    case 'at-risk': return '#FFB84D';
    case 'delayed': return '#FF6B6B';
    case 'completed': return '#7C5CFC';
    default: return '#9CA3AF';
  }
}
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const tooltipStyle = { background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' };

function KPICard({ title, value, change, changeType, icon, color }: {
  title: string; value: string; change: string; changeType: 'up' | 'down';
  icon: React.ReactNode; color: string;
}) {
  return (
    <motion.div variants={item}>
      <Card hover>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
            <div className="flex items-center gap-1 mt-2">
              {changeType === 'up' ? <TrendingUp size={14} className="text-emerald-600" /> : <TrendingDown size={14} className="text-red-500" />}
              <span className={`text-xs font-medium ${changeType === 'up' ? 'text-emerald-600' : 'text-red-500'}`}>{change}</span>
              <span className="text-xs text-gray-400">vs last month</span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
            <span style={{ color }}>{icon}</span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function CEODashboard() {
  const router = useRouter();
  const { data: analytics, isLoading: isA } = useSWR('analytics_ceo', getAnalyticsData, { refreshInterval: 5000 });
  const { data: stats, isLoading: isS } = useSWR('stats_ceo', getDashboardStats, { refreshInterval: 5000 });

  if (isA || isS || !analytics || !stats) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-500" /></div>;
  }

  const { kpis, departmentHeadcount, revenueData, projectStatusData } = analytics;
  const { pendingApprovals } = stats;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Executive Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Company-wide performance at a glance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Revenue" value={formatINR(kpis.annualRevenue)} change="+0%" changeType="up" icon={<IndianRupee size={20} />} color="#059669" />
        <KPICard title="Active Projects" value={String(kpis.activeProjects)} change="+0" changeType="up" icon={<FolderKanban size={20} />} color="#7C3AED" />
        <KPICard title="Team Size" value={String(kpis.teamSize)} change="+0" changeType="up" icon={<Users size={20} />} color="#2563EB" />
        <KPICard title="Budget Utilization" value={`0%`} change="-0%" changeType="down" icon={<Target size={20} />} color="#D97706" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={item} className="lg:col-span-2">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">Revenue & Expenses</h3>
                <p className="text-xs text-gray-500">Monthly trend</p>
              </div>
              <Badge variant="success" dot>Live</Badge>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000000).toFixed(0)}M`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatINR(Number(value))]} />
                <Area type="monotone" dataKey="revenue" stroke="#059669" fill="#059669" fillOpacity={0.15} strokeWidth={2} />
                <Area type="monotone" dataKey="expenses" stroke="#DC2626" fill="#DC2626" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card className="h-full">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Department Headcount</h3>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={departmentHeadcount} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="count" paddingAngle={3} stroke="none">
                  {departmentHeadcount.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={item}>
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">Pending Approvals</h3>
              <button onClick={() => router.push('/approvals')} className="text-xs text-gray-500 hover:text-gray-900 cursor-pointer">View All →</button>
            </div>
            <div className="space-y-3">
              {pendingApprovals === 0 && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  <CheckCircle2 size={20} className="mx-auto mb-2 text-emerald-500" />
                  All caught up!
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

function CFODashboard() {
  const { data: analytics, isLoading } = useSWR('analytics_cfo', getAnalyticsData, { refreshInterval: 5000 });

  if (isLoading || !analytics) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-500" /></div>;
  }

  const { kpis, revenueData } = analytics;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financial Overview</h1>
        <p className="text-gray-500 text-sm mt-1">Budget, expenses, and cash flow</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Budget" value={formatINR(kpis.annualRevenue)} change="+0%" changeType="up" icon={<IndianRupee size={20} />} color="#059669" />
        <KPICard title="Total Spent" value={formatINR(0)} change="+0%" changeType="up" icon={<Activity size={20} />} color="#DC2626" />
        <KPICard title="Monthly Payroll" value={formatINR(0)} change="+0%" changeType="up" icon={<Users size={20} />} color="#2563EB" />
        <KPICard title="Pending Approvals" value={"0"} change="-0" changeType="down" icon={<Clock size={20} />} color="#D97706" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={item}>
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Profit Trend</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000000).toFixed(1)}M`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatINR(Number(value))]} />
                <Area type="monotone" dataKey="profit" stroke="#D97706" fill="#D97706" fillOpacity={0.15} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

function CTODashboard() {
  const { data: analytics, isLoading } = useSWR('analytics_cto', getAnalyticsData, { refreshInterval: 5000 });

  if (isLoading || !analytics) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-500" /></div>;
  }

  const { kpis } = analytics;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Technology Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Infrastructure, engineering metrics, and security</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Engineering Team" value={String(kpis.teamSize)} change="+0" changeType="up" icon={<Users size={20} />} color="#7C3AED" />
        <KPICard title="Active Tasks" value={"0"} change="-0" changeType="down" icon={<Zap size={20} />} color="#2563EB" />
        <KPICard title="System Uptime" value="100%" change="+0%" changeType="up" icon={<Server size={20} />} color="#059669" />
        <KPICard title="Security Score" value="A+" change="stable" changeType="up" icon={<ShieldCheck size={20} />} color="#D97706" />
      </div>
    </motion.div>
  );
}

function CHRODashboard() {
  const { data: analytics, isLoading } = useSWR('analytics_chro', getAnalyticsData, { refreshInterval: 5000 });

  if (isLoading || !analytics) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-brand-500" /></div>;
  }

  const { kpis, attendanceData } = analytics;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HR Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">People, recruitment, and workforce analytics</p>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Total Employees" value={String(kpis.teamSize)} change="+0" changeType="up" icon={<Users size={20} />} color="#DC2626" />
        <KPICard title="Active Today" value={String(kpis.teamSize)} change="100%" changeType="up" icon={<CheckCircle2 size={20} />} color="#059669" />
        <KPICard title="On Leave" value="0" change="" changeType="down" icon={<CalendarDays size={20} />} color="#D97706" />
        <KPICard title="Pending Leaves" value="0" change="-0" changeType="down" icon={<Clock size={20} />} color="#2563EB" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={item}>
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Weekly Attendance</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="day" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="present" fill="#059669" radius={[4, 4, 0, 0]} name="Present" />
                <Bar dataKey="absent" fill="#DC2626" radius={[4, 4, 0, 0]} name="Absent" />
                <Bar dataKey="leave" fill="#D97706" radius={[4, 4, 0, 0]} name="Leave" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}

function GenericDashboard({ name }: { role: string; name: string }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);

  useEffect(() => {
    import('@/actions/data').then(a => {
      a.getMyTasks().then(setTasks);
      a.getMyPayslips().then(setPayslips);
    });
  }, []);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welcome back, {name.split(' ')[0]}</h1>
        <p className="text-gray-500 text-sm mt-1">Here&apos;s your overview for today</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="My Tasks" value={String(tasks.length)} change="Real-time sync" changeType="up" icon={<CheckCircle2 size={20} />} color="#7C3AED" />
        <KPICard title="Hours Today" value="0h 0m" change="+0h" changeType="up" icon={<Clock size={20} />} color="#059669" />
        <KPICard title="Payslips Available" value={String(payslips.length)} change="New" changeType="up" icon={<IndianRupee size={20} />} color="#D97706" />
        <KPICard title="Messages" value="0" change="0 new" changeType="up" icon={<Activity size={20} />} color="#2563EB" />
      </div>
    </motion.div>
  );
}

export default function DashboardPage() {
  const { user, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) router.push('/');
  }, [isAuthenticated, router]);

  if (!user) return null;

  switch (user.role) {
    case 'ceo': return <CEODashboard />;
    case 'cfo': return <CFODashboard />;
    case 'cto': return <CTODashboard />;
    case 'chro': return <CHRODashboard />;
    default: return <GenericDashboard role={user.role} name={user.name} />;
  }
}
