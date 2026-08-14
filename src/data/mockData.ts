// Shared domain types and formatting helpers.
// All seed arrays were removed once every module moved onto real tables.

export interface Employee {
  id: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
  department: string;
  designation: string;
  joinDate: string;
  salary: number;
  status: 'active' | 'on-leave' | 'probation' | 'exited';
  manager?: string;
  phone: string;
  location: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'on-track' | 'at-risk' | 'delayed' | 'completed';
  progress: number;
  startDate: string;
  endDate: string;
  budget: number;
  spent: number;
  lead: string;
  team: string[];
  department: string;
  milestones: Milestone[];
}

export interface Milestone {
  id: string;
  name: string;
  dueDate: string;
  status: 'completed' | 'in-progress' | 'upcoming';
}

export interface Task {
  id: string;
  title: string;
  description: string;
  projectId: string;
  assignee: string;
  status: 'todo' | 'in-progress' | 'review' | 'done';
  priority: 'critical' | 'high' | 'medium' | 'low';
  dueDate: string;
  tags: string[];
}

export interface Budget {
  id: string;
  department: string;
  allocated: number;
  spent: number;
  quarter: string;
  categories: { name: string; amount: number; spent: number }[];
}

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  date: string;
  description: string;
}

export interface Payslip {
  id: string;
  employeeId: string;
  month: string;
  basic: number;
  hra: number;
  da: number;
  special: number;
  pf: number;
  tax: number;
  gross: number;
  deductions: number;
  net: number;
}

export interface Vendor {
  id: string;
  name: string;
  category: string;
  contact: string;
  email: string;
  rating: number;
  totalOrders: number;
  status: 'active' | 'inactive' | 'blacklisted';
}

export interface Contract {
  id: string;
  title: string;
  type: 'nda' | 'service' | 'employment' | 'vendor' | 'license';
  party: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'expired' | 'draft' | 'review';
  value?: number;
  signatories?: string[];
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  type: 'casual' | 'sick' | 'earned' | 'comp-off';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: string;
  read: boolean;
  channelId: string;
}

export interface ChatChannel {
  id: string;
  name: string;
  type: 'direct' | 'group' | 'department';
  members: string[];
  lastMessage?: string;
  lastMessageTime?: string;
  unread: number;
  avatar?: string;
}

export interface ApprovalItem {
  id: string;
  type: 'leave' | 'budget' | 'procurement' | 'hiring' | 'expense' | 'policy';
  title: string;
  requestedBy: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  amount?: number;
  description: string;
  currentStep: number;
  steps: { role: string; status: 'approved' | 'pending' | 'rejected' | 'waiting' }[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  time: string;
  read: boolean;
}

// ─── CRM INTERFACES ───

export interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  source: 'website' | 'referral' | 'linkedin' | 'cold-call' | 'event' | 'partner';
  status: 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted';
  score: number; // 0-100
  assignedTo: string;
  createdDate: string;
  lastActivity: string;
  notes: string;
  industry: string;
  estimatedValue: number;
}

export interface Account {
  id: string;
  name: string;
  industry: string;
  type: 'prospect' | 'customer' | 'partner' | 'vendor';
  website: string;
  revenue: number;
  employees: number;
  phone: string;
  email: string;
  address: string;
  owner: string;
  status: 'active' | 'inactive' | 'churned';
  createdDate: string;
  lastActivity: string;
}

export interface Opportunity {
  id: string;
  name: string;
  accountId: string;
  accountName: string;
  stage: 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed-won' | 'closed-lost';
  amount: number;
  probability: number;
  closeDate: string;
  owner: string;
  type: 'new-business' | 'existing-business' | 'renewal';
  source: string;
  createdDate: string;
  nextStep: string;
  description: string;
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  category: 'IT' | 'Facilities' | 'HR' | 'Finance' | 'Security' | 'General';
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'open' | 'in-progress' | 'resolved' | 'closed';
  reportedBy: string;
  assignedTo: string;
  createdDate: string;
  updatedDate: string;
  slaDeadline: string;
  resolution?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  type: 'meeting' | 'deadline' | 'town-hall' | 'review' | 'one-on-one' | 'holiday';
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  attendees: string[];
  createdBy: string;
  color: string;
}

export interface AuditEntry {
  id: string;
  action: 'created' | 'updated' | 'deleted' | 'approved' | 'rejected' | 'logged-in' | 'exported';
  module: string;
  entity: string;
  entityId: string;
  user: string;
  timestamp: string;
  details: string;
  ipAddress: string;
}

// ─── HELPER FUNCTIONS ───

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase();
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    'on-track': '#00D4AA',
    'at-risk': '#FFB84D',
    'delayed': '#FF6B6B',
    'completed': '#7C5CFC',
    'active': '#00D4AA',
    'inactive': '#94A3B8',
    'blacklisted': '#FF6B6B',
    'pending': '#FFB84D',
    'approved': '#00D4AA',
    'rejected': '#FF6B6B',
    'draft': '#94A3B8',
    'review': '#45B7D1',
    'expired': '#FF6B6B',
    'todo': '#94A3B8',
    'in-progress': '#45B7D1',
    'done': '#00D4AA',
    'on-leave': '#FFB84D',
    'probation': '#FF8C42',
    'exited': '#FF6B6B',
    // CRM statuses
    'new': '#45B7D1',
    'contacted': '#FFB84D',
    'qualified': '#00D4AA',
    'unqualified': '#FF6B6B',
    'converted': '#7C5CFC',
    'prospect': '#45B7D1',
    'customer': '#00D4AA',
    'partner': '#7C5CFC',
    'churned': '#FF6B6B',
    'prospecting': '#94A3B8',
    'qualification': '#45B7D1',
    'proposal': '#FFB84D',
    'negotiation': '#FF8C42',
    'closed-won': '#00D4AA',
    'closed-lost': '#FF6B6B',
    // Service Desk
    'open': '#45B7D1',
    'resolved': '#00D4AA',
    'closed': '#94A3B8',
    'critical': '#FF6B6B',
    'high': '#FF8C42',
    'medium': '#FFB84D',
    'low': '#94A3B8',
  };
  return colors[status] || '#94A3B8';
}

// ─── CRM SEED DATA ───




// ─── SERVICE DESK SEED DATA ───


// ─── CALENDAR SEED DATA ───


// ─── AUDIT TRAIL SEED DATA ───


