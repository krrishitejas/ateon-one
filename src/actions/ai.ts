'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { getDashboardStats } from '@/actions/dashboard';
import { getFinanceOverview } from '@/actions/finance';
import { listEmployees } from '@/actions/hrms';

export async function askAIAssistant(query: string) {
  const user = await requireSession();
  const lowerQuery = query.toLowerCase();

  // Basic NLP Regex patterns
  if (lowerQuery.includes('how many employees') || lowerQuery.includes('total employees')) {
    const count = await prisma.employee.count({ where: { status: 'active' } });
    return `We currently have ${count} active employees in the organization.`;
  }

  if (lowerQuery.includes('ceo') || lowerQuery.includes('chief executive')) {
    const ceo = await prisma.employee.findFirst({ where: { designation: { contains: 'CEO' } } });
    if (ceo) return `The CEO is ${ceo.name}. You can reach them at ${ceo.email}.`;
    return 'I could not find the CEO in our records.';
  }

  if (lowerQuery.includes('my location') || lowerQuery.includes('where am i')) {
    const me = await prisma.employee.findUnique({ where: { email: user.email } });
    if (me?.location) return `Your registered location is ${me.location}.`;
    return 'Your location is currently unknown.';
  }

  if (lowerQuery.includes('finance') || lowerQuery.includes('budget') || lowerQuery.includes('revenue')) {
    if (user.role !== 'ceo' && user.role !== 'cfo') {
      return 'I cannot disclose financial data to your current role. This information is restricted to the CEO and CFO.';
    }
    const finance = await getFinanceOverview();
    return `Our current total expenses are ${finance.spent}, with revenue collected at ${finance.collected}. Allocated budget is ${finance.allocated}.`;
  }

  if (lowerQuery.includes('departments') || lowerQuery.includes('teams')) {
    const depts = await prisma.department.findMany();
    if (depts.length === 0) return 'There are no departments registered yet.';
    return `We have ${depts.length} departments: ${depts.map((d: any) => d.name).join(', ')}.`;
  }

  if (lowerQuery.includes('dashboard') || lowerQuery.includes('overview') || lowerQuery.includes('stats')) {
    const stats = await getDashboardStats();
    if (!stats) return 'Dashboard stats are not available.';
    return `Here is a quick overview:
- Active Projects: ${stats.activeProjects}
- Total Employees: ${stats.employeeCount}
- Open Tickets: ${stats.openTickets}
- Pending Approvals: ${stats.pendingApprovals}`;
  }
  
  if (lowerQuery.includes('project') || lowerQuery.includes('active projects')) {
    const stats = await getDashboardStats();
    if (!stats) return 'Project stats are not available.';
    return `We currently have ${stats.activeProjects} active projects running across the organization.`;
  }

  if (lowerQuery.includes('my task') || lowerQuery.includes('what are my task') || lowerQuery.includes('open task')) {
    const employee = await prisma.employee.findUnique({ where: { email: user.email } });
    if (!employee) return 'You are not linked to an employee profile, so you have no assigned tasks.';
    const tasks = await prisma.task.findMany({ where: { assigneeId: employee.id, status: { not: 'done' } } });
    if (tasks.length === 0) return 'You have no open tasks right now. Great job!';
    return `You have ${tasks.length} open task(s):\n${tasks.map((t: any) => `- ${t.title} (${t.status})`).join('\n')}`;
  }

  if (lowerQuery.includes('leave balance') || lowerQuery.includes('my leave') || lowerQuery.includes('time off')) {
    const employee = await prisma.employee.findUnique({ where: { email: user.email } });
    if (!employee) return 'You are not linked to an employee profile, so leave balances cannot be fetched.';
    const leaves = await prisma.leaveRequest.findMany({ where: { employeeId: employee.id, status: 'approved' } });
    const usedCasual = leaves.filter((l: any) => l.type === 'casual').length;
    const usedSick = leaves.filter((l: any) => l.type === 'sick').length;
    const usedEarned = leaves.filter((l: any) => l.type === 'earned').length;
    return `Here is your current leave balance:\n- Casual: ${12 - usedCasual} remaining (out of 12)\n- Sick: ${8 - usedSick} remaining (out of 8)\n- Earned: ${15 - usedEarned} remaining (out of 15)`;
  }

  if (lowerQuery.includes('payslip') || lowerQuery.includes('my salary') || lowerQuery.includes('payroll')) {
    const employee = await prisma.employee.findUnique({ where: { email: user.email } });
    if (!employee) return 'You are not linked to an employee profile.';
    const payslips = await prisma.payslip.findMany({ where: { employeeId: employee.id }, orderBy: { period: 'desc' }, take: 3 });
    if (payslips.length === 0) return 'You have no recent payslips generated.';
    return `Your most recent payslips:\n${payslips.map((p: any) => `- ${p.period}: ${p.netPay} (${p.status})`).join('\n')}`;
  }

  if (lowerQuery.includes('ticket') || lowerQuery.includes('support') || lowerQuery.includes('issue')) {
    const tickets = await prisma.serviceTicket.findMany({ where: { status: { not: 'closed' } } });
    if (tickets.length === 0) return 'There are no open support tickets right now.';
    return `There are currently ${tickets.length} open support tickets across the organization.`;
  }

  // Fallback
  return "I am the ATEON Internal AI. I can only answer questions based on the data currently stored in our platform. Try asking me about 'my tasks', 'leave balance', 'payslips', 'total employees', 'finance overview', 'active projects', or 'departments'.";
}
