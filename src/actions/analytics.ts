'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';

export async function getAnalyticsData() {
  await requireSession();

  // 1. Employee stats
  const employeeCount = await prisma.employee.count({ where: { status: 'active' } });
  
  // 2. Project stats
  const activeProjects = await prisma.project.count({ where: { status: { in: ['on-track', 'at-risk', 'delayed'] } } });
  const allProjects = await prisma.project.findMany({ select: { status: true } });

  const projectStatusData = [
    { name: 'On Track', value: allProjects.filter((p: { status: string }) => p.status === 'on-track').length, color: '#00D4AA' },
    { name: 'At Risk', value: allProjects.filter((p: { status: string }) => p.status === 'at-risk').length, color: '#FFB84D' },
    { name: 'Delayed', value: allProjects.filter((p: { status: string }) => p.status === 'delayed').length, color: '#FF6B6B' },
    { name: 'Completed', value: allProjects.filter((p: { status: string }) => p.status === 'completed').length, color: '#7C5CFC' },
  ];

  // 3. Finance (if zero, render zero)
  const invoices = await prisma.invoice.findMany({ select: { amount: true, status: true, issueDate: true } });
  const budgets = await prisma.budget.findMany({ select: { allocated: true, spent: true } });
  
  const annualRevenue = invoices.filter((i: { status: string }) => i.status === 'paid').reduce((acc: number, curr: { amount: number }) => acc + curr.amount, 0);
  const annualSpent = budgets.reduce((acc: number, curr: { spent: number }) => acc + curr.spent, 0);
  
  const profitMargin = annualRevenue > 0 ? (((annualRevenue - annualSpent) / annualRevenue) * 100).toFixed(1) : 0;

  // 4. Department Headcount
  const departments = await prisma.department.findMany({
    include: { _count: { select: { employees: true } } }
  });
  
  const departmentHeadcount = departments.map((d: { name: string, _count: { employees: number } }, i: number) => ({
    name: d.name,
    count: d._count.employees,
    color: ['#00D4AA', '#7C5CFC', '#45B7D1', '#FFB84D'][i % 4]
  }));

  const currentYear = new Date().getFullYear();
  const revenueData = Array.from({ length: 12 }, (_, i) => {
    const monthDate = new Date(currentYear, i, 1);
    const monthStr = monthDate.toLocaleString('default', { month: 'short' });
    
    const monthInvoices = invoices.filter((inv: { status: string, issueDate: Date, amount: number }) => {
      const invDate = new Date(inv.issueDate);
      return invDate.getMonth() === i && invDate.getFullYear() === currentYear && inv.status === 'paid';
    });
    const revenue = monthInvoices.reduce((sum: number, inv: { amount: number }) => sum + inv.amount, 0);
    
    return { month: monthStr, revenue, profit: revenue * 0.8 }; // Mock profit margin for now
  });

  return {
    kpis: {
      annualRevenue,
      profitMargin,
      teamSize: employeeCount,
      activeProjects,
      retentionRate: employeeCount > 0 ? 100 : 0, // Mock metric but grounded in 0 if no employees
      npsScore: 0 // Default to zero as requested
    },
    projectStatusData,
    departmentHeadcount,
    quarterlyData: [
      { quarter: 'Q1', revenue: 0, profit: 0, employees: 0 },
      { quarter: 'Q2', revenue: 0, profit: 0, employees: 0 },
      { quarter: 'Q3', revenue: 0, profit: 0, employees: 0 },
      { quarter: 'Q4 (Proj)', revenue: 0, profit: 0, employees: 0 },
    ],
    revenueData,
    performanceData: [
      { metric: 'Revenue Growth', score: 0 },
      { metric: 'Customer Satisfaction', score: 0 },
      { metric: 'Employee Retention', score: employeeCount > 0 ? 100 : 0 },
      { metric: 'Project Delivery', score: 0 },
      { metric: 'Innovation Index', score: 0 },
      { metric: 'Operational Efficiency', score: 0 },
    ],
    attendanceData: [
      { day: 'Mon', present: 0, leave: 0, absent: 0 },
      { day: 'Tue', present: 0, leave: 0, absent: 0 },
      { day: 'Wed', present: 0, leave: 0, absent: 0 },
      { day: 'Thu', present: 0, leave: 0, absent: 0 },
      { day: 'Fri', present: 0, leave: 0, absent: 0 },
    ]
  };
}
