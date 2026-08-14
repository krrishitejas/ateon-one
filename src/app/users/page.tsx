'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { Users, Mail, Building2, UserPlus, Check, X, ShieldAlert } from 'lucide-react';
import useSWR from 'swr';
import { generateInviteEmail, getUserMetrics } from '@/actions/auth';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.1 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

export default function UsersPage() {
  const { user, isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'employee',
    department: 'Engineering'
  });

  const { data: metrics } = useSWR('user_metrics', getUserMetrics, { refreshInterval: 5000 });

  if (!isAuthenticated || !user) return null;

  // Allow CEO, CTO, CHRO, and HR to see this page properly
  const isAdmin = ['ceo', 'admin', 'cto', 'chro', 'hr'].includes(user.role);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <ShieldAlert size={48} className="text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-gray-900">Access Denied</h2>
        <p className="text-gray-500 mt-2">You do not have permission to view this page.</p>
      </div>
    );
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      const res = await generateInviteEmail(formData.email, formData.role, formData.name, formData.phone);
      if (res.success) {
        setSuccessMsg(`Successfully sent invitation to ${formData.email}`);
        setFormData({ name: '', email: '', phone: '', role: 'employee', department: 'Engineering' });
      } else {
        setErrorMsg(res.error || 'Failed to generate invite');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
        <p className="text-gray-500 text-sm mt-1">Invite and manage platform users</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div variants={item} className="md:col-span-1 space-y-4">
          <Card padding="sm">
            <div className="p-4 bg-gray-50 rounded-xl mb-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <Users size={16} className="text-indigo-600" />
                Active Users
              </h3>
              <p className="text-2xl font-bold text-gray-900">{metrics?.usersCount || 0}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-xl">
              <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <Building2 size={16} className="text-emerald-600" />
                Departments
              </h3>
              <p className="text-2xl font-bold text-gray-900">{metrics?.deptsCount || 0}</p>
            </div>
          </Card>
        </motion.div>

        <motion.div variants={item} className="md:col-span-2">
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
              <UserPlus size={20} className="text-gray-400" />
              Invite New User
            </h2>
            
            {successMsg && (
              <div className="mb-6 p-4 bg-emerald-50 text-emerald-700 rounded-xl flex items-start gap-3 border border-emerald-100">
                <Check size={20} className="mt-0.5 flex-shrink-0" />
                <p className="text-sm">{successMsg}</p>
              </div>
            )}

            {errorMsg && (
              <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-xl flex items-start gap-3 border border-red-100">
                <X size={20} className="mt-0.5 flex-shrink-0" />
                <p className="text-sm">{errorMsg}</p>
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Full Name</label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    placeholder="e.g. John Doe"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Email Address</label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">Contact Number (Optional)</label>
                <input
                  type="tel"
                  className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                  placeholder="+91 98765 43210"
                  value={formData.phone}
                  onChange={e => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Role</label>
                  <select
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    value={formData.role}
                    onChange={e => setFormData({ ...formData, role: e.target.value })}
                  >
                    <option value="employee">Employee</option>
                    <option value="hr">HR</option>
                    <option value="chro">CHRO</option>
                    <option value="cfo">CFO</option>
                    <option value="cto">CTO</option>
                    <option value="legal">Legal</option>
                    <option value="manager">Manager</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700">Department</label>
                  <select
                    className="w-full px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all outline-none"
                    value={formData.department}
                    onChange={e => setFormData({ ...formData, department: e.target.value })}
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Design">Design</option>
                    <option value="Marketing">Marketing</option>
                    <option value="HR">Human Resources</option>
                    <option value="Finance">Finance</option>
                    <option value="Legal">Legal</option>
                    <option value="Executive">Executive</option>
                  </select>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <Button type="submit" disabled={loading} icon={<Mail size={16} />}>
                  {loading ? 'Sending Invite...' : 'Send Invitation'}
                </Button>
              </div>
            </form>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
