const fs = require('fs');

const path = './src/data/mockData.ts';
let content = fs.readFileSync(path, 'utf8');

const regexes = [
  /export const employees: Employee\[\] = \[[\s\S]*?\];/g,
  /export const projects: Project\[\] = \[[\s\S]*?\];/g,
  /export const tasks: Task\[\] = \[[\s\S]*?\];/g,
  /export const budgets: Budget\[\] = \[[\s\S]*?\];/g,
  /export const expenses: Expense\[\] = \[[\s\S]*?\];/g,
  /export const payslips: Payslip\[\] = \[[\s\S]*?\];/g,
  /export const vendors: Vendor\[\] = \[[\s\S]*?\];/g,
  /export const contracts: Contract\[\] = \[[\s\S]*?\];/g,
  /export const leaveRequests: LeaveRequest\[\] = \[[\s\S]*?\];/g,
  /export const chatChannels: ChatChannel\[\] = \[[\s\S]*?\];/g,
  /export const chatMessages: ChatMessage\[\] = \[[\s\S]*?\];/g,
  /export const approvalItems: ApprovalItem\[\] = \[[\s\S]*?\];/g,
  /export const notifications: Notification\[\] = \[[\s\S]*?\];/g,
  /export const revenueData = \[[\s\S]*?\];/g,
  /export const departmentHeadcount = \[[\s\S]*?\];/g,
  /export const attendanceData = \[[\s\S]*?\];/g,
  /export const leads: Lead\[\] = \[[\s\S]*?\];/g,
  /export const accounts: Account\[\] = \[[\s\S]*?\];/g,
  /export const opportunities: Opportunity\[\] = \[[\s\S]*?\];/g,
  /export const tickets: Ticket\[\] = \[[\s\S]*?\];/g,
  /export const calendarEvents: CalendarEvent\[\] = \[[\s\S]*?\];/g,
  /export const auditEntries: AuditEntry\[\] = \[[\s\S]*?\];/g,
];

let replaced = content;
replaced = replaced.replace(/export const employees: Employee\[\] = \[[\s\S]*?\];/, 'export const employees: Employee[] = [];');
replaced = replaced.replace(/export const projects: Project\[\] = \[[\s\S]*?\];/, 'export const projects: Project[] = [];');
replaced = replaced.replace(/export const tasks: Task\[\] = \[[\s\S]*?\];/, 'export const tasks: Task[] = [];');
replaced = replaced.replace(/export const budgets: Budget\[\] = \[[\s\S]*?\];/, 'export const budgets: Budget[] = [];');
replaced = replaced.replace(/export const expenses: Expense\[\] = \[[\s\S]*?\];/, 'export const expenses: Expense[] = [];');
replaced = replaced.replace(/export const payslips: Payslip\[\] = \[[\s\S]*?\];/, 'export const payslips: Payslip[] = [];');
replaced = replaced.replace(/export const vendors: Vendor\[\] = \[[\s\S]*?\];/, 'export const vendors: Vendor[] = [];');
replaced = replaced.replace(/export const contracts: Contract\[\] = \[[\s\S]*?\];/, 'export const contracts: Contract[] = [];');
replaced = replaced.replace(/export const leaveRequests: LeaveRequest\[\] = \[[\s\S]*?\];/, 'export const leaveRequests: LeaveRequest[] = [];');
replaced = replaced.replace(/export const chatChannels: ChatChannel\[\] = \[[\s\S]*?\];/, 'export const chatChannels: ChatChannel[] = [];');
replaced = replaced.replace(/export const chatMessages: ChatMessage\[\] = \[[\s\S]*?\];/, 'export const chatMessages: ChatMessage[] = [];');
replaced = replaced.replace(/export const approvalItems: ApprovalItem\[\] = \[[\s\S]*?\];/, 'export const approvalItems: ApprovalItem[] = [];');
replaced = replaced.replace(/export const notifications: Notification\[\] = \[[\s\S]*?\];/, 'export const notifications: Notification[] = [];');
replaced = replaced.replace(/export const revenueData = \[[\s\S]*?\];/, 'export const revenueData: any[] = [];');
replaced = replaced.replace(/export const departmentHeadcount = \[[\s\S]*?\];/, 'export const departmentHeadcount: any[] = [];');
replaced = replaced.replace(/export const attendanceData = \[[\s\S]*?\];/, 'export const attendanceData: any[] = [];');
replaced = replaced.replace(/export const leads: Lead\[\] = \[[\s\S]*?\];/, 'export const leads: Lead[] = [];');
replaced = replaced.replace(/export const accounts: Account\[\] = \[[\s\S]*?\];/, 'export const accounts: Account[] = [];');
replaced = replaced.replace(/export const opportunities: Opportunity\[\] = \[[\s\S]*?\];/, 'export const opportunities: Opportunity[] = [];');
replaced = replaced.replace(/export const tickets: Ticket\[\] = \[[\s\S]*?\];/, 'export const tickets: Ticket[] = [];');
replaced = replaced.replace(/export const calendarEvents: CalendarEvent\[\] = \[[\s\S]*?\];/, 'export const calendarEvents: CalendarEvent[] = [];');
replaced = replaced.replace(/export const auditEntries: AuditEntry\[\] = \[[\s\S]*?\];/, 'export const auditEntries: AuditEntry[] = [];');

fs.writeFileSync(path, replaced);
console.log('Mock data arrays cleared.');
