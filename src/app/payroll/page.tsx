'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass } from '@/components/ui/Modal';
import { formatINR, Payslip } from '@/data/mockData';
import useSWR from 'swr';
import { listPayslips, getPayrollSummary, runPayroll } from '@/actions/payroll';
import { listEmployees } from '@/actions/hrms';
import { CreditCard, Download, Calendar, Users, IndianRupee, TrendingUp, Plus, FileText, Eye, Printer } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

export default function PayrollPage() {
  const { data: payslips = [], mutate: mutatePayslips } = useSWR('payslips', () => listPayslips());
  const { data: employees = [], mutate: mutateEmployees } = useSWR('employees', listEmployees);
  const { data: summary, mutate: mutateSummary } = useSWR('payroll_summary', getPayrollSummary);

  const [runError, setRunError] = useState('');
  const [running, setRunning] = useState(false);

  const activeEmployees = employees.filter((e: any) => e.status === 'active');
  // salary is redacted to null for roles without compensation access.
  const salaryOf = (e: any) => Number(e.salary) || 0;
  const annualTotal = activeEmployees.reduce((a: number, e: any) => a + salaryOf(e), 0);
  const totalPayroll = annualTotal / 12;
  const avgCTC = activeEmployees.length > 0 ? annualTotal / activeEmployees.length : 0;

  // Modals
  const [selectedPayslip, setSelectedPayslip] = useState<any>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [runMonth, setRunMonth] = useState(new Date().toISOString().slice(0, 7));

  const payrollBreakdown = [
    { component: 'Basic', amount: totalPayroll * 0.5 },
    { component: 'HRA', amount: totalPayroll * 0.25 },
    { component: 'DA', amount: totalPayroll * 0.1 },
    { component: 'Special', amount: totalPayroll * 0.15 },
  ];

  const deptNameOf = (e: any) => e.department?.name ?? 'Unassigned';
  const departmentPayroll = [...new Set(activeEmployees.map(deptNameOf))].map(dept => {
    const deptEmps = activeEmployees.filter((e: any) => deptNameOf(e) === dept);
    return {
      department: dept,
      amount: deptEmps.reduce((a: number, e: any) => a + salaryOf(e), 0) / 12,
      headcount: deptEmps.length,
    };
  }).sort((a, b) => b.amount - a.amount);

  const handleRunPayroll = async () => {
    setRunning(true); setRunError('');
    try {
      const label = new Date(runMonth + '-01').toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      await runPayroll(label);
      await Promise.all([mutatePayslips(), mutateSummary(), mutateEmployees()]);
      setShowRunModal(false);
    } catch (e: any) {
      setRunError(e?.message ?? 'Payroll run failed');
    } finally { setRunning(false); }
  };

  const downloadPayslip = (ps: any) => {
    const emp = ps;
    const content = `
ATEON Labs PRIVATE LIMITED
PAYSLIP — ${ps.month}
─────────────────────────────────
Employee: ${emp?.employeeName || 'N/A'}
Designation: ${emp?.designation || 'N/A'}
Department: ${emp?.department || 'N/A'}
─────────────────────────────────
Gross Salary:    ${formatINR(ps.gross)}
Deductions:      ${formatINR(ps.deductions)}
─────────────────────────────────
NET PAY:         ${formatINR(ps.net)}
─────────────────────────────────
Generated on: ${new Date().toLocaleDateString('en-IN')}
© 2026 ATEON Labs. All rights reserved.
    `.trim();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payslip-${emp?.employeeName?.replace(/\s+/g, '-').toLowerCase()}-${ps.month.replace(/\s+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Payroll</h1>
          <p className="text-gray-500 text-sm mt-1">Salary management and payslip generation</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="info" dot>{summary?.lastRunMonth ?? 'No payroll run yet'}</Badge>
          <Button icon={<Plus size={16} />} onClick={() => setShowRunModal(true)}>Run Payroll</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Monthly Payroll', value: formatINR(Math.round(totalPayroll)), icon: <IndianRupee size={20} />, color: '#00D4AA' },
          { title: 'Active Employees', value: String(activeEmployees.length), icon: <Users size={20} />, color: '#7C5CFC' },
          { title: 'Payslips Generated', value: String(payslips.length), icon: <CreditCard size={20} />, color: '#45B7D1' },
          { title: 'Avg. CTC', value: formatINR(Math.round(avgCTC)), icon: <TrendingUp size={20} />, color: '#FFB84D' },
        ].map(kpi => (
          <motion.div key={kpi.title} variants={item}>
            <Card variant="default" hover>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-gray-500">{kpi.title}</p>
                  <p className="text-xl font-bold mt-1">{kpi.value}</p>
                </div>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${kpi.color}15`, border: `1px solid ${kpi.color}30` }}>
                  <span style={{ color: kpi.color }}>{kpi.icon}</span>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <motion.div variants={item}>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Payroll by Department</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={departmentPayroll} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v / 100000).toFixed(0)}L`} />
                <YAxis type="category" dataKey="department" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} width={90} />
                <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E5E7EB', borderRadius: 12 }} formatter={(value) => [formatINR(Math.round(Number(value)))]} />
                <Bar dataKey="amount" fill="#7C5CFC" radius={[0, 6, 6, 0]} name="Monthly Cost" />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </motion.div>

        <motion.div variants={item}>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Salary Components Breakdown</h3>
            <div className="space-y-4">
              {payrollBreakdown.map(comp => (
                <div key={comp.component}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">{comp.component}</span>
                    <span className="text-sm font-mono">{formatINR(Math.round(comp.amount))}</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-gray-700 to-gray-900 rounded-full" style={{ width: `${(comp.amount / totalPayroll) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Recent Payslips — with View and Download */}
      <motion.div variants={item}>
        <Card variant="default">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold">Recent Payslips</h3>
            <Badge variant="default" size="sm">{payslips.length} records</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Employee</th>
                  <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Month</th>
                  <th className="text-right text-xs font-medium text-gray-500 py-3 px-3">Gross</th>
                  <th className="text-right text-xs font-medium text-gray-500 py-3 px-3">Deductions</th>
                  <th className="text-right text-xs font-medium text-gray-500 py-3 px-3">Net Pay</th>
                  <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payslips.map((ps: any) => {
                  const emp = ps;
                  return (
                    <tr key={ps.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={emp?.employeeName || ''} size="sm" />
                          <div>
                            <p className="text-sm font-medium">{emp?.employeeName}</p>
                            <p className="text-xs text-gray-500">{emp?.designation}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">{ps.month}</td>
                      <td className="py-3 px-3 text-sm text-right font-mono">{formatINR(ps.gross)}</td>
                      <td className="py-3 px-3 text-sm text-right font-mono text-red-500">{formatINR(ps.deductions)}</td>
                      <td className="py-3 px-3 text-sm text-right font-mono font-semibold text-emerald-600">{formatINR(ps.net)}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => setSelectedPayslip(ps)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer" title="View"><Eye size={14} /></button>
                          <button onClick={() => downloadPayslip(ps)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer" title="Download"><Download size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </motion.div>

      {/* View Payslip Modal */}
      <Modal
        isOpen={!!selectedPayslip}
        onClose={() => setSelectedPayslip(null)}
        title="Payslip Details"
        description={selectedPayslip?.month || ''}
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedPayslip(null)}>Close</Button>
            <Button icon={<Download size={14} />} onClick={() => { if (selectedPayslip) downloadPayslip(selectedPayslip); }}>Download</Button>
          </>
        }
      >
        {selectedPayslip && (() => {
          const emp = selectedPayslip;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                <Avatar name={emp?.employeeName || ''} size="lg" />
                <div>
                  <p className="font-semibold text-gray-900">{emp?.employeeName}</p>
                  <p className="text-sm text-gray-500">{emp?.designation} — {emp?.department}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-gray-50">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Period</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{selectedPayslip.month}</p>
                </div>
                <div className="p-3 rounded-xl bg-gray-50">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Employee ID</p>
                  <p className="text-sm font-medium text-gray-900 mt-0.5">{selectedPayslip.employeeId}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Gross Salary</span>
                  <span className="text-sm font-mono font-medium">{formatINR(selectedPayslip.gross)}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">Basic (50%)</span>
                  <span className="text-sm font-mono">{formatINR(Math.round(selectedPayslip.gross * 0.5))}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-600">HRA (25%)</span>
                  <span className="text-sm font-mono">{formatINR(Math.round(selectedPayslip.gross * 0.25))}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-red-600">Deductions</span>
                  <span className="text-sm font-mono text-red-600">-{formatINR(selectedPayslip.deductions)}</span>
                </div>
                <div className="flex items-center justify-between py-3 bg-emerald-50 rounded-xl px-4 mt-2">
                  <span className="text-sm font-semibold text-emerald-700">Net Pay</span>
                  <span className="text-lg font-bold font-mono text-emerald-700">{formatINR(selectedPayslip.net)}</span>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Run Payroll Modal */}
      <Modal
        isOpen={showRunModal}
        onClose={() => setShowRunModal(false)}
        title="Run Payroll"
        description="Generate payslips for all active employees"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowRunModal(false)}>Cancel</Button>
            <Button onClick={handleRunPayroll} disabled={running || activeEmployees.length === 0}>
              {running ? 'Generating…' : `Generate ${activeEmployees.length} Payslips`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {runError && (
            <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">{runError}</div>
          )}
          <FormField label="Payroll Period" required>
            <input type="month" className={inputClass} value={runMonth} onChange={e => setRunMonth(e.target.value)} />
          </FormField>
          <p className="text-xs text-gray-500">
            Re-running a month replaces that month&apos;s payslips rather than adding duplicates.
            Only active employees with a salary and a linked user account are included.
          </p>
          <div className="p-4 rounded-xl bg-gray-50">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Active Employees</p>
                <p className="text-lg font-bold">{activeEmployees.length}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Estimated Total</p>
                <p className="text-lg font-bold">{formatINR(Math.round(totalPayroll))}</p>
              </div>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-xl border border-amber-100">
            <FileText size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-800">Payslips will be generated for all {activeEmployees.length} active employees based on their current salary configuration.</p>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
