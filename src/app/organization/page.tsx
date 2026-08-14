'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import Modal, { FormField, inputClass } from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import {
  listDepartmentTree, upsertDepartment, deleteDepartment,
  getOrgChart, setManager, type DepartmentNode, type OrgNode,
} from '@/actions/org';
import { listRoles, listModules, upsertRole, deleteRole, type StoredRole } from '@/actions/roles';
import { listEmployees, syncUsersToEmployees } from '@/actions/hrms';
import {
  Building2, Users, ShieldCheck, Plus, Pencil, Trash2, ChevronRight,
  ChevronDown, AlertCircle, Check,
} from 'lucide-react';

type Tab = 'departments' | 'roles' | 'reporting';

const ORG_ADMIN_ROLES = ['ceo', 'admin', 'coo', 'chro'];

export default function OrganizationPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('departments');

  const canEdit = ORG_ADMIN_ROLES.includes(user?.role ?? '');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'departments', label: 'Departments', icon: <Building2 size={15} /> },
    { id: 'roles', label: 'Roles & Access', icon: <ShieldCheck size={15} /> },
    { id: 'reporting', label: 'Reporting Lines', icon: <Users size={15} /> },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Organisation</h1>
        <p className="text-sm text-gray-500 mt-1">
          Build your company structure — departments, who reports to whom, and what each role can see.
        </p>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors cursor-pointer ${
              tab === t.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-sm">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>You have read-only access to the organisation structure.</span>
        </div>
      )}

      {tab === 'departments' && <DepartmentsTab canEdit={canEdit} />}
      {tab === 'roles' && <RolesTab canEdit={canEdit} />}
      {tab === 'reporting' && <ReportingTab canEdit={canEdit} />}
    </div>
  );
}

// ─────────────────────────── Departments ───────────────────────────

function DepartmentsTab({ canEdit }: { canEdit: boolean }) {
  const { data: tree = [], mutate, isLoading } = useSWR('org_departments', listDepartmentTree);
  const { data: employees = [] } = useSWR('employees', listEmployees);

  const [editing, setEditing] = useState<DepartmentNode | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [headEmployeeId, setHeadEmployeeId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const flatten = (nodes: DepartmentNode[], depth = 0): { node: DepartmentNode; depth: number }[] =>
    nodes.flatMap(n => [{ node: n, depth }, ...flatten(n.children, depth + 1)]);
  const flat = flatten(tree);

  const openCreate = () => {
    setEditing(null); setCreating(true);
    setName(''); setParentId(''); setHeadEmployeeId(''); setError('');
  };

  const openEdit = (node: DepartmentNode) => {
    setCreating(false); setEditing(node);
    setName(node.name);
    setParentId(node.parentId ?? '');
    setHeadEmployeeId(node.headEmployeeId ?? '');
    setError('');
  };

  const close = () => { setEditing(null); setCreating(false); setError(''); };

  const save = async () => {
    setSaving(true); setError('');
    try {
      await upsertDepartment({
        id: editing?.id,
        name,
        parentId: parentId || null,
        headEmployeeId: headEmployeeId || null,
      });
      await mutate();
      close();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save department');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (node: DepartmentNode) => {
    if (!confirm(`Delete the "${node.name}" department?`)) return;
    try {
      await deleteDepartment(node.id);
      await mutate();
    } catch (e: any) {
      alert(e?.message ?? 'Could not delete department');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          {flat.length} department{flat.length === 1 ? '' : 's'}
        </p>
        {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>New Department</Button>}
      </div>

      {isLoading ? (
        <Card><p className="text-sm text-gray-500">Loading…</p></Card>
      ) : flat.length === 0 ? (
        <Card className="text-center py-12">
          <Building2 size={32} className="mx-auto text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-900">No departments yet</p>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            Departments are the top-level blocks. Add Engineering, Sales, HR — then nest teams inside them.
          </p>
          {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>Create the first one</Button>}
        </Card>
      ) : (
        <Card padding="sm">
          <div className="divide-y divide-gray-100">
            {flat.map(({ node, depth }) => (
              <div key={node.id} className="flex items-center gap-3 py-3 px-2 group">
                <div style={{ width: depth * 20 }} className="flex-shrink-0" />
                {depth > 0 && <ChevronRight size={14} className="text-gray-300 flex-shrink-0" />}
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Building2 size={15} className="text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{node.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {node.headName ? `Head: ${node.headName}` : 'No head assigned'}
                  </p>
                </div>
                <Badge size="sm" variant={node.employeeCount > 0 ? 'info' : 'default'}>
                  {node.employeeCount} {node.employeeCount === 1 ? 'person' : 'people'}
                </Badge>
                {canEdit && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openEdit(node)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer" title="Edit">
                      <Pencil size={14} />
                    </button>
                    <button onClick={() => remove(node)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 cursor-pointer" title="Delete">
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal
        isOpen={creating || !!editing}
        onClose={close}
        title={editing ? 'Edit Department' : 'New Department'}
        description="Nest a department inside another to build your hierarchy."
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={save} disabled={!name.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <FormField label="Name" required>
            <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Engineering" />
          </FormField>
          <FormField label="Parent department">
            <select className={inputClass} value={parentId} onChange={e => setParentId(e.target.value)}>
              <option value="">— None (top level) —</option>
              {flat.filter(f => f.node.id !== editing?.id).map(({ node, depth }) => (
                <option key={node.id} value={node.id}>{' '.repeat(depth * 2)}{node.name}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Department head">
            <select className={inputClass} value={headEmployeeId} onChange={e => setHeadEmployeeId(e.target.value)}>
              <option value="">— Unassigned —</option>
              {employees.map((e: any) => (
                <option key={e.id} value={e.id}>{e.name} — {e.designation}</option>
              ))}
            </select>
          </FormField>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────── Roles & access ───────────────────────────

function RolesTab({ canEdit }: { canEdit: boolean }) {
  const { data: roles = [], mutate, isLoading } = useSWR('org_roles', listRoles);
  const { data: modules = [] } = useSWR('org_modules', listModules);

  const [editing, setEditing] = useState<StoredRole | null>(null);
  const [creating, setCreating] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreate = () => {
    setEditing(null); setCreating(true);
    setKey(''); setLabel(''); setDescription(''); setSelected(['dashboard', 'workspace', 'settings']); setError('');
  };

  const openEdit = (role: StoredRole) => {
    setCreating(false); setEditing(role);
    setKey(role.id); setLabel(role.label); setDescription(role.description);
    setSelected(role.modules); setError('');
  };

  const close = () => { setEditing(null); setCreating(false); setError(''); };

  const toggle = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      await upsertRole({ key: editing?.id ?? key, label, description, modules: selected });
      await mutate();
      close();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save role');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: StoredRole) => {
    if (!confirm(`Delete the "${role.label}" role?`)) return;
    try {
      await deleteRole(role.id);
      await mutate();
    } catch (e: any) {
      alert(e?.message ?? 'Could not delete role');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">
          Tick which modules each role can open. Changes apply on their next page load.
        </p>
        {canEdit && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>New Role</Button>}
      </div>

      {isLoading ? (
        <Card><p className="text-sm text-gray-500">Loading…</p></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map(role => (
            <motion.div key={role.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="h-full">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: role.color }} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{role.label}</p>
                      <p className="text-xs text-gray-500 truncate">{role.description}</p>
                    </div>
                  </div>
                  {role.isSystem && <Badge size="sm">Built-in</Badge>}
                </div>

                <div className="flex flex-wrap gap-1 mt-3">
                  {role.modules.length === 0 && <span className="text-xs text-gray-400">No modules</span>}
                  {role.modules.slice(0, 6).map(m => (
                    <span key={m} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded-md text-[10px]">{m}</span>
                  ))}
                  {role.modules.length > 6 && (
                    <span className="px-2 py-0.5 text-gray-400 text-[10px]">+{role.modules.length - 6} more</span>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 mt-4">
                    <Button size="sm" variant="secondary" icon={<Pencil size={13} />} onClick={() => openEdit(role)}>
                      Edit access
                    </Button>
                    {!role.isSystem && (
                      <Button size="sm" variant="ghost" icon={<Trash2 size={13} />} onClick={() => remove(role)}>
                        Delete
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      <Modal
        isOpen={creating || !!editing}
        onClose={close}
        title={editing ? `Edit “${editing.label}”` : 'New Role'}
        description="Pick exactly which parts of the platform this role can reach."
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={close}>Cancel</Button>
            <Button onClick={save} disabled={!label.trim() || (!editing && !key.trim()) || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
              <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Display name" required>
              <input className={inputClass} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Design Lead" />
            </FormField>
            <FormField label="Key" required>
              <input
                className={inputClass}
                value={editing?.id ?? key}
                disabled={!!editing}
                onChange={e => setKey(e.target.value)}
                placeholder="design-lead"
              />
            </FormField>
          </div>
          <FormField label="Description">
            <input className={inputClass} value={description} onChange={e => setDescription(e.target.value)} placeholder="What this role is for" />
          </FormField>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Module access</p>
              <span className="text-xs text-gray-500">{selected.length} selected</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 max-h-72 overflow-y-auto p-1">
              {modules.map(m => {
                const on = selected.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggle(m.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm text-left transition-colors cursor-pointer ${
                      on ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <span className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 ${on ? 'bg-white/20' : 'border border-gray-300'}`}>
                      {on && <Check size={11} />}
                    </span>
                    <span className="truncate">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────── Reporting lines ───────────────────────────

function ReportingTab({ canEdit }: { canEdit: boolean }) {
  const { data: chart = [], mutate, isLoading } = useSWR('org_chart', getOrgChart);
  const { data: employees = [], mutate: mutateEmployees } = useSWR('employees', listEmployees);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string>('');

  const runSync = async () => {
    setSyncing(true); setError(''); setSyncResult('');
    try {
      const r = await syncUsersToEmployees();
      await Promise.all([mutate(), mutateEmployees()]);
      setSyncResult(
        r.created === 0 && r.linked === 0
          ? 'Everyone already has an employee record.'
          : `Created ${r.created} employee record(s), linked ${r.linked} existing one(s).`
      );
    } catch (e: any) {
      setError(e?.message ?? 'Sync failed');
    } finally { setSyncing(false); }
  };

  const change = async (employeeId: string, managerId: string) => {
    setError('');
    try {
      await setManager(employeeId, managerId || null);
      await mutate();
    } catch (e: any) {
      setError(e?.message ?? 'Could not update reporting line');
    }
  };

  const unassigned = employees.filter((e: any) => !e.managerId);

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {canEdit && (
        <Card>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">Employee records</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Accounts created by invite only get a login. This creates the matching HR record
                so they can clock in, take leave and appear on the roster.
              </p>
              {syncResult && <p className="text-xs text-emerald-600 mt-2">{syncResult}</p>}
            </div>
            <Button size="sm" variant="secondary" onClick={runSync} disabled={syncing}>
              {syncing ? 'Syncing…' : 'Sync users → employees'}
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <p className="text-sm font-medium text-gray-900 mb-1">Org chart</p>
        <p className="text-xs text-gray-500 mb-4">
          People with no manager sit at the top. Loops are rejected automatically.
        </p>
        {isLoading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : chart.length === 0 ? (
          <div className="text-center py-8">
            <Users size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">No employees yet. Add people in HRMS first.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {chart.map(node => <OrgBranch key={node.id} node={node} depth={0} />)}
          </div>
        )}
      </Card>

      {canEdit && (
        <Card>
          <p className="text-sm font-medium text-gray-900 mb-3">Set who reports to whom</p>
          <div className="divide-y divide-gray-100">
            {employees.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 py-2.5">
                <Avatar name={e.name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{e.name}</p>
                  <p className="text-xs text-gray-500 truncate">{e.designation}</p>
                </div>
                <select
                  className={`${inputClass} max-w-[220px]`}
                  value={e.managerId ?? ''}
                  onChange={ev => change(e.id, ev.target.value)}
                >
                  <option value="">— No manager —</option>
                  {employees.filter((m: any) => m.id !== e.id).map((m: any) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            ))}
            {employees.length === 0 && (
              <p className="text-sm text-gray-500 py-4">No employees yet.</p>
            )}
          </div>
          {unassigned.length > 0 && employees.length > 0 && (
            <p className="text-xs text-gray-500 mt-3">
              {unassigned.length} person(s) have no manager set.
            </p>
          )}
        </Card>
      )}
    </div>
  );
}

function OrgBranch({ node, depth }: { node: OrgNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const hasReports = node.reports.length > 0;

  return (
    <div>
      <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: depth * 22 }}>
        {hasReports ? (
          <button onClick={() => setOpen(o => !o)} className="p-0.5 text-gray-400 hover:text-gray-700 cursor-pointer">
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-[22px] flex-shrink-0" />
        )}
        <Avatar name={node.name} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{node.name}</p>
          <p className="text-xs text-gray-500 truncate">
            {node.designation}{node.departmentName ? ` · ${node.departmentName}` : ''}
          </p>
        </div>
        {hasReports && (
          <Badge size="sm" variant="info">{node.reports.length}</Badge>
        )}
      </div>
      {open && node.reports.map(child => (
        <OrgBranch key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
