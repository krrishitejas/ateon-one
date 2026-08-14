'use client';

import React from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import useSWR from 'swr';
import { getAnalyticsData } from '@/actions/analytics';
import { BarChart3, TrendingUp, Users, Activity, Target, Zap, Loader2 } from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, RadarChart,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts';

function formatINR(value: number) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

export default function AnalyticsPage() {
  const { data, isLoading } = useSWR('analytics_page', getAnalyticsData, { refreshInterval: 5000 });

  if (isLoading || !data) {
    return (
      <div className="flex h-[calc(100vh-7rem)] items-center justify-center">
        <Loader2 className="animate-spin text-brand-500 mb-4" size={32} />
      </div>
    );
  }

  const {
    kpis,
    projectStatusData,
    departmentHeadcount,
    quarterlyData,
    revenueData,
    performanceData,
    attendanceData
  } = data;
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Enterprise Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">Company-wide insights, metrics, and forecasting</p>
        </div>
        <Badge variant="success" dot>Live Data</Badge>
      </div>

      {/* KPI Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Annual Revenue', value: formatINR(kpis.annualRevenue), change: '0%', color: '#00D4AA' },
          { label: 'Profit Margin', value: `${kpis.profitMargin}%`, change: '0%', color: '#7C5CFC' },
          { label: 'Team Size', value: kpis.teamSize, change: '0%', color: '#45B7D1' },
          { label: 'Active Projects', value: kpis.activeProjects, change: '0%', color: '#FFB84D' },
          { label: 'Retention Rate', value: `${kpis.retentionRate}%`, change: '0%', color: '#FF8C42' },
          { label: 'NPS Score', value: kpis.npsScore, change: '0', color: '#4ECDC4' },
        ].map(kpi => (
          <motion.div key={kpi.label} variants={item}>
            <Card variant="default" padding="sm">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">{kpi.label}</p>
              <p className="text-xl font-bold mt-1" style={{ color: kpi.color }}>{kpi.value}</p>
              <p className="text-[10px] text-emerald-600 mt-0.5">{kpi.change} YoY</p>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div variants={item} className="lg:col-span-2">
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Quarterly Performance</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={quarterlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="quarter" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 10000000).toFixed(1)}Cr`} />
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12 }} formatter={(value) => [formatINR(Number(value))]} />
                <Legend />
                <Bar dataKey="revenue" fill="#7C5CFC" radius={[6, 6, 0, 0]} name="Revenue" />
                <Bar dataKey="profit" fill="#00D4AA" radius={[6, 6, 0, 0]} name="Profit" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card variant="default" className="h-full">
            <h3 className="text-sm font-semibold mb-4">Project Status Distribution</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={projectStatusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={4} stroke="none">
                  {projectStatusData.map((entry: { color: string }, i: number) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12 }} />
                <Legend iconType="circle" iconSize={8} formatter={(value) => <span className="text-xs text-gray-600">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={item}>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Monthly Revenue Trend</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={revenueData}>
                <defs>
                  <linearGradient id="analyticsRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#7C5CFC" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#7C5CFC" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 1000000).toFixed(0)}M`} />
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12 }} formatter={(value) => [formatINR(Number(value))]} />
                <Area type="monotone" dataKey="revenue" stroke="#7C5CFC" fill="url(#analyticsRevenue)" strokeWidth={2} />
                <Area type="monotone" dataKey="profit" stroke="#00D4AA" fill="none" strokeWidth={2} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Organization Performance Radar</h3>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={performanceData} outerRadius={90}>
                <PolarGrid stroke="#E5E7EB" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#9CA3AF', fontSize: 10 }} />
                <PolarRadiusAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} domain={[0, 100]} />
                <Radar name="Score" dataKey="score" stroke="#7C5CFC" fill="#7C5CFC" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>

      {/* Department Headcount & Attendance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={item}>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Department Headcount</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={departmentHeadcount} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={80} />
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12 }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {departmentHeadcount.map((entry: { color: string }, i: number) => <Cell key={i} fill={entry.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Weekly Attendance Pattern</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={attendanceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="day" tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12 }} />
                <Legend />
                <Bar dataKey="present" stackId="a" fill="#00D4AA" name="Present" radius={[0, 0, 0, 0]} />
                <Bar dataKey="leave" stackId="a" fill="#FFB84D" name="Leave" radius={[0, 0, 0, 0]} />
                <Bar dataKey="absent" stackId="a" fill="#FF6B6B" name="Absent" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
