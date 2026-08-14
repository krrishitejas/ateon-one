'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Button from '@/components/ui/Button';
import ProgressBar from '@/components/ui/ProgressBar';
import Modal, { FormField, inputClass, selectClass } from '@/components/ui/Modal';
import { getStatusColor, Employee, LeaveRequest, formatINR } from '@/data/mockData';
import {
  listEmployees, createEmployee, deleteEmployee as deleteEmployeeAction,
  listDepartments, listLeaveRequests, setLeaveStatus,
} from '@/actions/hrms';
import {
  Search, Plus, Filter, Mail, Phone, MapPin, Building2, Calendar, IndianRupee, X, Pencil,
  Users, Clock, Award, UserMinus, UserPlus, CheckCircle2, XCircle, TrendingUp,
  Briefcase, GraduationCap,
} from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.03 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

type HRMSTab = 'directory' | 'attendance' | 'leave' | 'performance' | 'recruitment';

// Static attendance data
const attendanceRecords: any[] = [];

// Performance data
const performanceData: any[] = [];

// Recruitment pipeline
const recruitmentPipeline: any[] = [];

export default function HRMSPage() {
  const [hrmsError, setHrmsError] = useState('');
  const { data: dbEmployees, mutate: refreshEmployees } = useSWR<Employee[]>('hrms_employees', async () => {
    const rows = await listEmployees();
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      avatar: '',
      role: 'employee',
      department: r.department?.name ?? '—',
      designation: r.designation,
      joinDate: r.joinDate ? new Date(r.joinDate).toISOString().split('T')[0] : '',
      salary: r.salary ?? 0,
      status: (['active', 'on-leave', 'probation', 'exited'].includes(r.status) ? r.status : 'active') as Employee['status'],
      phone: r.phone ?? '',
      location: r.location ?? '',
    }));
  }, { refreshInterval: 5000 });

  const { data: dbLeaves, mutate: refreshLeaves } = useSWR<LeaveRequest[]>('hrms_leaves', async () => {
    const rows = await listLeaveRequests();
    return rows.map((r: any) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeName: r.employee?.name ?? 'Unknown',
      type: (r.type as LeaveRequest['type']) || 'casual',
      startDate: new Date(r.startDate).toISOString().split('T')[0],
      endDate: new Date(r.endDate).toISOString().split('T')[0],
      days: r.days,
      reason: r.reason ?? '',
      status: (r.status as LeaveRequest['status']) || 'pending',
    }));
  }, { refreshInterval: 5000 });

  const employees = dbEmployees ?? [];
  const leaveRequests = dbLeaves ?? [];
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [empForm, setEmpForm] = useState<Partial<Employee>>({});
  const [tab, setTab] = useState<HRMSTab>('directory');

  const deptNameOf = (e: any) => e.department?.name ?? e.department ?? 'Unassigned';
  const departments = [...new Set(employees.map(deptNameOf))];
  const filtered = employees.filter((e: Employee) => {
    const matchSearch = e.name.toLowerCase().includes(search.toLowerCase()) || e.designation.toLowerCase().includes(search.toLowerCase());
    const matchDept = deptFilter === 'all' || e.department === deptFilter;
    return matchSearch && matchDept;
  });

  const openAdd = () => {
    setEmpForm({ name: '', email: '', role: 'employee', department: 'Engineering', designation: '', joinDate: new Date().toISOString().split('T')[0], salary: 0, status: 'active', phone: '', location: 'Mumbai HQ', avatar: '' });
    setShowAddModal(true);
  };

  const handleAdd = async () => {
    if (!empForm.name?.trim() || !empForm.email?.trim()) return;
    setHrmsError('');
    try {
      await createEmployee({
        name: empForm.name || '',
        email: empForm.email || '',
        designation: empForm.designation || '',
        phone: empForm.phone || '',
        location: empForm.location || undefined,
        salary: Number(empForm.salary) || undefined,
        joinDate: empForm.joinDate || undefined,
      });
      await refreshEmployees();
      setShowAddModal(false);
    } catch (e: any) {
      // Surface the failure instead of faking a saved employee.
      setHrmsError(e?.message ?? 'Could not create employee');
    }
  };

  const tabs: { id: HRMSTab; label: string; icon: React.ReactNode }[] = [
    { id: 'directory', label: 'Directory', icon: <Users size={14} /> },
    { id: 'attendance', label: 'Attendance', icon: <Clock size={14} /> },
    { id: 'leave', label: 'Leave', icon: <Calendar size={14} /> },
    { id: 'performance', label: 'Performance', icon: <Award size={14} /> },
    { id: 'recruitment', label: 'Recruitment', icon: <Briefcase size={14} /> },
  ];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">HRMS</h1>
          <p className="text-gray-500 text-sm mt-1">{employees.length} employees across {departments.length} departments</p>
        </div>
        {tab === 'directory' && <Button icon={<Plus size={16} />} onClick={openAdd}>Add Employee</Button>}
      </div>

      {hrmsError && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">{hrmsError}</div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${tab === t.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-600'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── DIRECTORY TAB ─── */}
      {tab === 'directory' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-sm">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text" placeholder="Search employees..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2 text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-gray-400 transition-all"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-gray-500" />
              <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-gray-400 cursor-pointer">
                <option value="all">All Departments</option>
                {departments.map((d: any) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Active', count: employees.filter((e: Employee) => e.status === 'active').length, color: '#059669' },
              { label: 'On Leave', count: employees.filter((e: Employee) => e.status === 'on-leave').length, color: '#D97706' },
              { label: 'Probation', count: employees.filter((e: Employee) => e.status === 'probation').length, color: '#2563EB' },
              { label: 'Exited', count: employees.filter((e: Employee) => e.status === 'exited').length, color: '#DC2626' },
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

          {/* Employee Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((emp: Employee) => (
              <motion.div key={emp.id} variants={item}>
                <Card variant="default" hover className="relative overflow-hidden cursor-pointer" onClick={() => setSelectedEmp(emp)}>
                  <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: getStatusColor(emp.status) }} />
                  <div className="flex items-start gap-4 pt-2">
                    <Avatar name={emp.name} size="lg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold truncate">{emp.name}</h3>
                        <Badge variant={emp.status === 'active' ? 'success' : emp.status === 'on-leave' ? 'warning' : emp.status === 'probation' ? 'info' : 'danger'} size="sm">{emp.status}</Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">{emp.designation}</p>
                      <div className="mt-3 space-y-1.5">
                        <div className="flex items-center gap-2 text-xs text-gray-600"><Building2 size={12} className="text-gray-500" /><span>{emp.department}</span></div>
                        <div className="flex items-center gap-2 text-xs text-gray-600"><Mail size={12} className="text-gray-500" /><span className="truncate">{emp.email}</span></div>
                        <div className="flex items-center gap-2 text-xs text-gray-600"><MapPin size={12} className="text-gray-500" /><span>{emp.location}</span></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                    <span className="text-[10px] text-gray-500">ID: {emp.id}</span>
                    <span className="text-[10px] text-gray-500">Joined: {emp.joinDate}</span>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </>
      )}

      {/* ─── ATTENDANCE TAB ─── */}
      {tab === 'attendance' && (
        <motion.div variants={item}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: 'Present', count: attendanceRecords.filter(a => a.status === 'present').length, color: '#059669', icon: <CheckCircle2 size={16} /> },
              { label: 'Absent', count: attendanceRecords.filter(a => a.status === 'absent').length, color: '#DC2626', icon: <XCircle size={16} /> },
              { label: 'Late', count: attendanceRecords.filter(a => a.status === 'late').length, color: '#D97706', icon: <Clock size={16} /> },
              { label: 'On Leave', count: attendanceRecords.filter(a => a.status === 'on-leave').length, color: '#2563EB', icon: <Calendar size={16} /> },
            ].map(s => (
              <Card key={s.label} padding="sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${s.color}15` }}>
                    <span style={{ color: s.color }}>{s.icon}</span>
                  </div>
                  <div>
                    <p className="text-lg font-bold">{s.count}</p>
                    <p className="text-xs text-gray-500">{s.label}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Today&apos;s Attendance — {new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Employee</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Clock In</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Clock Out</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Hours</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceRecords.map(rec => (
                    <tr key={rec.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={rec.name} size="sm" />
                          <span className="text-sm font-medium">{rec.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm text-center font-mono">{rec.clockIn}</td>
                      <td className="py-3 px-3 text-sm text-center font-mono">{rec.clockOut}</td>
                      <td className="py-3 px-3 text-sm text-center font-mono font-medium">{rec.hours}</td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant={rec.status === 'present' ? 'success' : rec.status === 'absent' ? 'danger' : rec.status === 'late' ? 'warning' : 'info'} size="sm">{rec.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ─── LEAVE TAB ─── */}
      {tab === 'leave' && (
        <motion.div variants={item} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Pending', count: leaveRequests.filter((l: LeaveRequest) => l.status === 'pending').length, color: '#D97706' },
              { label: 'Approved', count: leaveRequests.filter((l: LeaveRequest) => l.status === 'approved').length, color: '#059669' },
              { label: 'Rejected', count: leaveRequests.filter((l: LeaveRequest) => l.status === 'rejected').length, color: '#DC2626' },
              { label: 'Total Requests', count: leaveRequests.length, color: '#2563EB' },
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
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Leave Requests</h3>
            <div className="space-y-3">
              {leaveRequests.map((lr: LeaveRequest) => (
                <div key={lr.id} className="flex items-center gap-4 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                  <Avatar name={lr.employeeName} size="sm" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-medium">{lr.employeeName}</h4>
                      <Badge variant={lr.status === 'approved' ? 'success' : lr.status === 'rejected' ? 'danger' : 'warning'} size="sm">{lr.status}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 capitalize">{lr.type} leave • {lr.startDate} → {lr.endDate} • {lr.days} day{lr.days > 1 ? 's' : ''}</p>
                    {lr.reason && <p className="text-xs text-gray-400 mt-0.5">{lr.reason}</p>}
                  </div>
                  {lr.status === 'pending' && (
                    <div className="flex gap-1">
                      <button onClick={() => setLeaveStatus(lr.id, 'approved').then(() => refreshLeaves()).catch(() => {})} className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 cursor-pointer" title="Approve"><CheckCircle2 size={14} /></button>
                      <button onClick={() => setLeaveStatus(lr.id, 'rejected').then(() => refreshLeaves()).catch(() => {})} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 cursor-pointer" title="Reject"><XCircle size={14} /></button>
                    </div>
                  )}
                </div>
              ))}
              {leaveRequests.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">No leave requests found.</p>
              )}
            </div>
          </Card>
        </motion.div>
      )}

      {/* ─── PERFORMANCE TAB ─── */}
      {tab === 'performance' && (
        <motion.div variants={item} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center"><TrendingUp size={16} className="text-emerald-600" /></div>
                <div>
                  <p className="text-lg font-bold">{(performanceData.reduce((a, p) => a + p.rating, 0) / performanceData.length).toFixed(1)}</p>
                  <p className="text-xs text-gray-500">Avg. Rating</p>
                </div>
              </div>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center"><Award size={16} className="text-blue-600" /></div>
                <div>
                  <p className="text-lg font-bold">{performanceData.reduce((a, p) => a + p.goalsCompleted, 0)}/{performanceData.reduce((a, p) => a + p.goals, 0)}</p>
                  <p className="text-xs text-gray-500">Goals Completed</p>
                </div>
              </div>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center"><GraduationCap size={16} className="text-purple-600" /></div>
                <div>
                  <p className="text-lg font-bold">{Math.round((performanceData.reduce((a, p) => a + p.goalsCompleted, 0) / performanceData.reduce((a, p) => a + p.goals, 0)) * 100)}%</p>
                  <p className="text-xs text-gray-500">Goal Achievement</p>
                </div>
              </div>
            </Card>
          </div>
          <Card variant="default">
            <h3 className="text-sm font-semibold mb-4">Employee Performance Ratings</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Employee</th>
                    <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Department</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Rating</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Goals</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Progress</th>
                    <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Trend</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceData.map(pd => (
                    <tr key={pd.name} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <Avatar name={pd.name} size="sm" />
                          <span className="text-sm font-medium">{pd.name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-sm text-gray-600">{pd.department}</td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-sm font-bold ${pd.rating >= 4.5 ? 'text-emerald-600' : pd.rating >= 4.0 ? 'text-blue-600' : 'text-amber-600'}`}>{pd.rating}</span>
                      </td>
                      <td className="py-3 px-3 text-sm text-center">{pd.goalsCompleted}/{pd.goals}</td>
                      <td className="py-3 px-3">
                        <ProgressBar value={Math.round((pd.goalsCompleted / pd.goals) * 100)} size="sm" />
                      </td>
                      <td className="py-3 px-3 text-center">
                        <Badge variant={pd.trend === 'up' ? 'success' : pd.trend === 'down' ? 'danger' : 'default'} size="sm">{pd.trend === 'up' ? '↑ Up' : pd.trend === 'down' ? '↓ Down' : '→ Stable'}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </motion.div>
      )}

      {/* ─── RECRUITMENT TAB ─── */}
      {tab === 'recruitment' && (
        <motion.div variants={item} className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Open Positions', count: recruitmentPipeline.length, color: '#7C5CFC' },
              { label: 'Total Applicants', count: recruitmentPipeline.reduce((a, r) => a + r.applicants, 0), color: '#2563EB' },
              { label: 'Shortlisted', count: recruitmentPipeline.reduce((a, r) => a + r.shortlisted, 0), color: '#059669' },
              { label: 'Offer Stage', count: recruitmentPipeline.filter(r => r.stage === 'offer').length, color: '#D97706' },
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
            {recruitmentPipeline.map(pos => (
              <Card key={pos.id} variant="default" hover>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <Briefcase size={20} className="text-purple-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{pos.position}</h3>
                      <Badge variant={pos.priority === 'high' ? 'danger' : pos.priority === 'medium' ? 'warning' : 'default'} size="sm">{pos.priority}</Badge>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{pos.department} • Posted {pos.postedDate}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{pos.applicants} applicants</p>
                    <p className="text-xs text-gray-500">{pos.shortlisted} shortlisted</p>
                  </div>
                  <Badge variant={pos.stage === 'offer' ? 'success' : pos.stage === 'interview' ? 'info' : 'warning'} size="sm">{pos.stage}</Badge>
                </div>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {/* Employee Detail Modal */}
      <Modal
        isOpen={!!selectedEmp}
        onClose={() => setSelectedEmp(null)}
        title={selectedEmp?.name || ''}
        description={selectedEmp?.designation}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSelectedEmp(null)}>Close</Button>
            <Button variant="danger" size="sm" onClick={() => { if (selectedEmp) { const id = selectedEmp.id; deleteEmployeeAction(id).then(() => refreshEmployees()).catch((e: any) => setHrmsError(e?.message ?? 'Could not remove employee')); setSelectedEmp(null); } }}>Remove</Button>
          </>
        }
      >
        {selectedEmp && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
              <Avatar name={selectedEmp.name} size="lg" />
              <div>
                <h3 className="font-semibold text-gray-900">{selectedEmp.name}</h3>
                <p className="text-sm text-gray-500">{selectedEmp.designation}</p>
                <Badge variant={selectedEmp.status === 'active' ? 'success' : 'warning'} size="sm">{selectedEmp.status}</Badge>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: <Mail size={14} />, label: 'Email', value: selectedEmp.email },
                { icon: <Phone size={14} />, label: 'Phone', value: selectedEmp.phone },
                { icon: <Building2 size={14} />, label: 'Department', value: selectedEmp.department },
                { icon: <MapPin size={14} />, label: 'Location', value: selectedEmp.location },
                { icon: <Calendar size={14} />, label: 'Join Date', value: selectedEmp.joinDate },
                { icon: <IndianRupee size={14} />, label: 'Salary (Annual)', value: formatINR(selectedEmp.salary) },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                  <span className="text-gray-400">{f.icon}</span>
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">{f.label}</p>
                    <p className="text-sm text-gray-900">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      {/* Add Employee Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Employee"
        description="Add a new employee to the directory"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add Employee</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Full Name" required>
            <input className={inputClass} value={empForm.name || ''} onChange={e => setEmpForm({ ...empForm, name: e.target.value })} placeholder="Full name" />
          </FormField>
          <FormField label="Email" required>
            <input type="email" className={inputClass} value={empForm.email || ''} onChange={e => setEmpForm({ ...empForm, email: e.target.value })} placeholder="name@ateonlabs.com" />
          </FormField>
          <FormField label="Designation">
            <input className={inputClass} value={empForm.designation || ''} onChange={e => setEmpForm({ ...empForm, designation: e.target.value })} placeholder="e.g. Software Engineer" />
          </FormField>
          <FormField label="Department">
            <select className={selectClass} value={empForm.department || 'Engineering'} onChange={e => setEmpForm({ ...empForm, department: e.target.value })}>
              {['Engineering', 'Design', 'Marketing', 'Operations', 'Finance', 'HR', 'Legal', 'Executive'].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Phone">
            <input className={inputClass} value={empForm.phone || ''} onChange={e => setEmpForm({ ...empForm, phone: e.target.value })} placeholder="+91 XXXXX XXXXX" />
          </FormField>
          <FormField label="Location">
            <select className={selectClass} value={empForm.location || 'Mumbai HQ'} onChange={e => setEmpForm({ ...empForm, location: e.target.value })}>
              {['Mumbai HQ', 'Bangalore', 'Chennai', 'Delhi', 'Hyderabad'].map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Salary (Annual ₹)">
            <input type="number" className={inputClass} value={empForm.salary || ''} onChange={e => setEmpForm({ ...empForm, salary: Number(e.target.value) })} placeholder="0" />
          </FormField>
          <FormField label="Join Date">
            <input type="date" className={inputClass} value={empForm.joinDate || ''} onChange={e => setEmpForm({ ...empForm, joinDate: e.target.value })} />
          </FormField>
        </div>
      </Modal>
    </motion.div>
  );
}
