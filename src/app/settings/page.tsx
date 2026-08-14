'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import { getSetting, setSetting } from '@/actions/settings';
import { getMyProfile } from '@/actions/hrms';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { useTracking } from '@/hooks/useTracking';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Avatar from '@/components/ui/Avatar';
import Badge from '@/components/ui/Badge';
import {
  User, Shield, Bell, Palette, Database, Info,
  Mail, Phone, MapPin, Building2, Save, RotateCcw,
  Download, Trash2, Check,
} from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

type SettingsTab = 'profile' | 'security' | 'notifications' | 'appearance' | 'data' | 'about' | 'company';

const tabs: { id: SettingsTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
  { id: 'profile', label: 'Profile', icon: <User size={16} /> },
  { id: 'security', label: 'Security', icon: <Shield size={16} /> },
  { id: 'notifications', label: 'Notifications', icon: <Bell size={16} /> },
  { id: 'appearance', label: 'Appearance', icon: <Palette size={16} /> },
  { id: 'company', label: 'Company', icon: <Building2 size={16} />, adminOnly: true },
  { id: 'data', label: 'Data', icon: <Database size={16} /> },
  { id: 'about', label: 'About', icon: <Info size={16} /> },
];

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-5.5 rounded-full transition-colors cursor-pointer ${checked ? 'bg-gray-900' : 'bg-gray-300'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-4.5 h-4.5 bg-white rounded-full transition-transform shadow-sm ${checked ? 'translate-x-[18px]' : ''}`} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { user, isAuthenticated, refreshAuth } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [saved, setSaved] = useState(false);
  const { location: trackingLocation } = useTracking();

  // Preferences state
  const [emailNotifs, setEmailNotifs] = useState(true);
  const [pushNotifs, setPushNotifs] = useState(true);
  const [leaveNotifs, setLeaveNotifs] = useState(true);
  const [approvalNotifs, setApprovalNotifs] = useState(true);
  const [chatNotifs, setChatNotifs] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [animations, setAnimations] = useState(true);
  const [hrCreationEnabled, setHrCreationEnabled] = useState(true);

  useEffect(() => {
    getSetting('hr_account_creation_enabled', 'true').then(val => setHrCreationEnabled(val === 'true'));
  }, []);

  const handleHrToggle = async (val: boolean) => {
    setHrCreationEnabled(val);
    await setSetting('hr_account_creation_enabled', val ? 'true' : 'false');
  };

  useEffect(() => {
    if (!isAuthenticated) router.push('/');
  }, [isAuthenticated, router]);

  // Must sit above the `!user` guard — every hook has to run on every render.
  const { data: emp } = useSWR('my_profile', getMyProfile);

  if (!user) return null;

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Manage your account and preferences</p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar Tabs */}
        <motion.div variants={item} className="w-48 flex-shrink-0">
          <Card padding="sm">
            <nav className="space-y-0.5">
              {tabs.filter(tab => !tab.adminOnly || ['ceo', 'admin', 'cto'].includes(user.role)).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                    activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </nav>
          </Card>
        </motion.div>

        {/* Content */}
        <div className="flex-1 space-y-4">
          {activeTab === 'profile' && (
            <motion.div variants={item}>
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-6">Profile Information</h3>
                <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
                  <Avatar name={user.name} size="lg" />
                  <div>
                    <p className="font-semibold text-gray-900">{user.name}</p>
                    <p className="text-sm text-gray-500">{emp?.designation || user.role.toUpperCase()}</p>
                    <Badge variant="success" size="sm">Active</Badge>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { icon: <Mail size={14} />, label: 'Email', value: emp?.email || `${user.name.toLowerCase().replace(' ', '.')}@ateonlabs.com` },
                    { icon: <Phone size={14} />, label: 'Phone', value: emp?.phone || '+91 96869 69199' },
                    { icon: <MapPin size={14} />, label: 'Location', value: trackingLocation || 'Detecting...' },
                    { icon: <Building2 size={14} />, label: 'Department', value: emp?.department || 'Executive' },
                  ].map(field => (
                    <div key={field.label} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                      <span className="text-gray-400">{field.icon}</span>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wide">{field.label}</p>
                        <p className="text-sm text-gray-900">{field.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex justify-end">
                  <Button icon={saved ? <Check size={16} /> : <Save size={16} />} onClick={handleSave}>
                    {saved ? 'Saved!' : 'Save Changes'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'security' && (
            <motion.div variants={item}>
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-6">Security Settings</h3>
                <div className="space-y-4">
                  {(user.role === 'ceo' || user.role === 'cto') && (
                    <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Admin Control: HR Account Creation</p>
                          <p className="text-xs text-gray-500 mt-0.5">Allow CHRO to create new employee accounts</p>
                        </div>
                        <Toggle checked={hrCreationEnabled} onChange={handleHrToggle} label="" />
                      </div>
                    </div>
                  )}
                  <div className="p-4 rounded-xl bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Password</p>
                        <p className="text-xs text-gray-500 mt-0.5">Protect your account with a strong password</p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => {
                        const cur = prompt('Enter current password:');
                        if (!cur) return;
                        const next = prompt('Enter new password:');
                        if (!next) return;
                        import('@/actions/auth').then(a => a.changePassword(cur, next).then(res => {
                          if (res.success) alert('Password updated successfully!');
                          else alert(res.error);
                        }));
                      }}>Change Password</Button>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
                        <p className="text-xs text-gray-500 mt-0.5">Email-based OTP verification</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={user?.twoFactorEnabled ? 'success' : 'default'} size="sm">
                          {user?.twoFactorEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                        <Button variant="outline" size="sm" onClick={() => {
                          import('@/actions/auth').then(a => a.toggle2FA(!user?.twoFactorEnabled).then(res => {
                            if (res.success) refreshAuth();
                          }));
                        }}>Toggle</Button>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 rounded-xl bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900">Active Sessions</p>
                        <p className="text-xs text-gray-500 mt-0.5">Manage devices logged into this account</p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-red-600" onClick={() => {
                        if(confirm('Are you sure you want to revoke all other sessions?')) {
                          import('@/actions/auth').then(a => a.revokeAllSessions().then(() => alert('Sessions revoked')));
                        }
                      }}>Revoke All</Button>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'notifications' && (
            <motion.div variants={item}>
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Notification Preferences</h3>
                <div className="divide-y divide-gray-100">
                  <Toggle checked={emailNotifs} onChange={setEmailNotifs} label="Email Notifications" />
                  <Toggle checked={pushNotifs} onChange={setPushNotifs} label="Push Notifications" />
                  <Toggle checked={leaveNotifs} onChange={setLeaveNotifs} label="Leave Request Alerts" />
                  <Toggle checked={approvalNotifs} onChange={setApprovalNotifs} label="Approval Notifications" />
                  <Toggle checked={chatNotifs} onChange={setChatNotifs} label="Chat Messages" />
                </div>
                <div className="mt-4 flex justify-end">
                  <Button icon={saved ? <Check size={16} /> : <Save size={16} />} onClick={handleSave}>
                    {saved ? 'Saved!' : 'Save Preferences'}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'company' && (
            <motion.div variants={item}>
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Company Administration</h3>
                <div className="divide-y divide-gray-100">
                  <Toggle 
                    checked={hrCreationEnabled} 
                    onChange={handleHrToggle} 
                    label="Allow HR (CHRO) to Invite Users" 
                  />
                  <div className="py-3">
                    <p className="text-xs text-gray-500">
                      When enabled, users with the CHRO role can invite new employees to the platform. 
                      When disabled, only the CEO and CTO can invite users.
                    </p>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'appearance' && (
            <motion.div variants={item}>
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Display Preferences</h3>
                <div className="divide-y divide-gray-100">
                  <Toggle checked={compactMode} onChange={setCompactMode} label="Compact Mode" />
                  <Toggle checked={animations} onChange={setAnimations} label="Enable Animations" />
                </div>
                <div className="mt-6">
                  <p className="text-sm font-medium text-gray-700 mb-3">Theme</p>
                  <div className="flex gap-3">
                    {(['light', 'dark', 'system'] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all cursor-pointer capitalize ${
                          theme === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'data' && (
            <motion.div variants={item}>
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Data Management</h3>
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-gray-50 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">Export My Data</p>
                      <p className="text-xs text-gray-500 mt-0.5">Download your own profile record as JSON</p>
                    </div>
                    <Button variant="outline" size="sm" icon={<Download size={14} />}
                      onClick={() => {
                        const blob = new Blob([JSON.stringify(emp ?? {}, null, 2)], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url; a.download = 'my-ateon-profile.json'; a.click();
                        URL.revokeObjectURL(url);
                      }}
                    >Export</Button>
                  </div>
                  <div className="p-4 rounded-xl bg-red-50 border border-red-100 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-red-900">Clear Local Storage</p>
                      <p className="text-xs text-red-600 mt-0.5">Remove all cached data from this browser</p>
                    </div>
                    <Button variant="danger" size="sm" icon={<Trash2 size={14} />}
                      onClick={() => { if (confirm('Clear all local storage?')) { localStorage.clear(); location.reload(); } }}
                    >Clear</Button>
                  </div>
                </div>
              </Card>
            </motion.div>
          )}

          {activeTab === 'about' && (
            <motion.div variants={item}>
              <Card>
                <h3 className="text-sm font-semibold text-gray-900 mb-4">About ATEON One</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Application', value: 'ATEON One — Enterprise Operating System' },
                    { label: 'Version', value: '1.0.0' },
                    { label: 'Build', value: `${new Date().toISOString().split('T')[0]}-production` },
                    { label: 'Framework', value: 'Next.js 16 + React 19' },
                    { label: 'Organization', value: 'ATEON Labs PRIVATE LIMITED' },
                    { label: 'Support', value: 'space@ateonlabs.com' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center justify-between py-2 border-b border-gray-50">
                      <span className="text-sm text-gray-500">{row.label}</span>
                      <span className="text-sm font-medium text-gray-900">{row.value}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-6">© 2026 ATEON Labs. All rights reserved.</p>
              </Card>
            </motion.div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
