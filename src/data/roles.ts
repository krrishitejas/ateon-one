export type UserRole = 'ceo' | 'admin' | 'cfo' | 'coo' | 'cto' | 'chro' | 'hr' | 'legal' | 'manager' | 'employee';

/** Fallback when a user carries a role with no config (e.g. a custom role from the DB). */
export const FALLBACK_ROLE: UserRole = 'employee';

/** Safe lookup — never returns undefined, so callers can't crash on an unknown role. */
export function getRoleConfig(role: string | undefined | null): RoleConfig {
  return ROLES[role as UserRole] ?? ROLES[FALLBACK_ROLE];
}

export interface RoleConfig {
  /** Role key. A plain string because roles are user-definable at runtime. */
  id: string;
  label: string;
  description: string;
  color: string;
  modules: string[];
}

export const ROLES: Record<UserRole, RoleConfig> = {
  ceo: {
    id: 'ceo',
    label: 'CEO',
    description: 'Chief Executive Officer',
    color: '#FFD700',
    modules: ['dashboard', 'command', 'organization', 'users', 'crm', 'marketing', 'hrms', 'projects', 'finance', 'payroll', 'procurement', 'approvals', 'chat', 'legal', 'analytics', 'reports', 'service-desk', 'calendar', 'audit', 'ai', 'workspace', 'settings'],
  },
  admin: {
    id: 'admin',
    label: 'Admin',
    description: 'System Administrator',
    color: '#94A3B8',
    modules: ['dashboard', 'command', 'organization', 'users', 'crm', 'marketing', 'hrms', 'projects', 'finance', 'payroll', 'procurement', 'approvals', 'chat', 'legal', 'analytics', 'reports', 'service-desk', 'calendar', 'audit', 'ai', 'workspace', 'settings'],
  },
  hr: {
    id: 'hr',
    label: 'HR',
    description: 'Human Resources Professional',
    color: '#F4A261',
    modules: ['dashboard', 'users', 'crm', 'projects', 'procurement', 'hrms', 'payroll', 'approvals', 'chat', 'reports', 'service-desk', 'calendar', 'workspace', 'settings'],
  },
  cfo: {
    id: 'cfo',
    label: 'CFO',
    description: 'Chief Financial Officer',
    color: '#00D4AA',
    modules: ['dashboard', 'command', 'crm', 'marketing', 'finance', 'payroll', 'procurement', 'approvals', 'chat', 'analytics', 'reports', 'calendar', 'audit', 'ai', 'workspace', 'settings'],
  },
  coo: {
    id: 'coo',
    label: 'COO',
    description: 'Chief Operating Officer',
    color: '#FF6B6B',
    modules: ['dashboard', 'command', 'organization', 'crm', 'hrms', 'projects', 'procurement', 'approvals', 'chat', 'analytics', 'reports', 'service-desk', 'calendar', 'ai', 'workspace', 'settings'],
  },
  cto: {
    id: 'cto',
    label: 'CTO',
    description: 'Chief Technology Officer',
    color: '#7C5CFC',
    modules: ['dashboard', 'command', 'users', 'projects', 'approvals', 'chat', 'analytics', 'reports', 'service-desk', 'calendar', 'ai', 'workspace', 'settings'],
  },
  chro: {
    id: 'chro',
    label: 'CHRO',
    description: 'Chief Human Resources Officer',
    color: '#FF8C42',
    modules: ['dashboard', 'command', 'organization', 'users', 'hrms', 'payroll', 'approvals', 'chat', 'analytics', 'reports', 'service-desk', 'calendar', 'ai', 'workspace', 'settings'],
  },
  legal: {
    id: 'legal',
    label: 'Legal',
    description: 'Legal Counsel',
    color: '#4ECDC4',
    modules: ['dashboard', 'legal', 'approvals', 'chat', 'audit', 'service-desk', 'calendar', 'workspace', 'settings'],
  },
  manager: {
    id: 'manager',
    label: 'Manager',
    description: 'Department Manager',
    color: '#45B7D1',
    modules: ['dashboard', 'command', 'crm', 'hrms', 'projects', 'approvals', 'chat', 'reports', 'service-desk', 'calendar', 'workspace', 'settings'],
  },
  employee: {
    id: 'employee',
    label: 'Employee',
    description: 'Team Member',
    color: '#96CEB4',
    modules: ['dashboard', 'projects', 'chat', 'service-desk', 'calendar', 'workspace', 'settings'],
  },
};

/**
 * Relative seniority. Lower is more senior. Used to order the org chart and to
 * stop anyone granting a role above their own level.
 */
export const DEFAULT_RANKS: Record<string, number> = {
  ceo: 0, admin: 5, cfo: 10, coo: 10, cto: 10, chro: 10,
  legal: 20, hr: 30, manager: 40, employee: 100,
};

export function rankOf(role: string): number {
  return DEFAULT_RANKS[role] ?? 100;
}

export const MODULE_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  organization: 'Organisation',
  command: 'Command Centre',
  crm: 'CRM',
  marketing: 'Marketing',
  hrms: 'HRMS',
  projects: 'Projects',
  finance: 'Finance',
  payroll: 'Payroll',
  procurement: 'Procurement',
  approvals: 'Approvals',
  chat: 'Chat',
  legal: 'Legal',
  analytics: 'Analytics',
  reports: 'Reports',
  'service-desk': 'Service Desk',
  calendar: 'Calendar',
  audit: 'Audit Trail',
  ai: 'AI Assistant',
  workspace: 'My Workspace',
  settings: 'Settings',
};
