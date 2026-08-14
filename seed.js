/* ATEON One — database seed.
 *
 * Founder credentials come from env (never commit real values):
 *   SEED_ADMIN_EMAIL    (default: founder@ateon.local)
 *   SEED_ADMIN_PASSWORD (default: ChangeMe@123 — change immediately after first login)
 *
 * Run: node seed.js  (requires DATABASE_URL and a reachable MySQL + `prisma db push` done)
 */
const bcrypt = require('bcryptjs');
const { prisma } = require('./src/lib/prisma');

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'founder@ateon.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe@123';
const ADMIN_NAME = process.env.SEED_ADMIN_NAME || 'Rishi Tejas K R';

const day = (offset) => new Date(Date.now() + offset * 24 * 60 * 60 * 1000);

async function main() {
  // ── Founder / CEO user ──
  let founder = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!founder) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    founder = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: ADMIN_NAME,
        role: 'ceo',
        department: 'Executive',
        designation: 'Founder & CEO',
        avatar: '',
      },
    });
    console.log(`✔ Founder user created (${ADMIN_EMAIL})`);
  } else {
    console.log('• Founder user already exists — skipping');
  }

  // Idempotency guard for the rest of the sample data
  const seeded = await prisma.setting.findUnique({ where: { key: 'seed.sample-data' } });
  if (seeded) {
    console.log('• Sample data already seeded — nothing to do');
    return;
  }

  // ── Departments ──
  const deptNames = ['Engineering', 'Research', 'Finance', 'People & Culture', 'Marketing', 'Operations'];
  const departments = {};
  for (const name of deptNames) {
    departments[name] = await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`✔ ${deptNames.length} departments`);

  // ── Employees ──
  const employeesData = [
    { name: ADMIN_NAME, email: ADMIN_EMAIL, designation: 'Founder & CEO', dept: 'Operations', location: 'Bengaluru', salary: 250000, userId: founder.id },
    { name: 'Ananya Sharma', email: 'ananya.sharma@ateon.local', designation: 'Senior ML Engineer', dept: 'Engineering', location: 'Bengaluru', salary: 180000 },
    { name: 'Vikram Rao', email: 'vikram.rao@ateon.local', designation: 'Research Scientist', dept: 'Research', location: 'Bengaluru', salary: 170000 },
    { name: 'Priya Nair', email: 'priya.nair@ateon.local', designation: 'Finance Analyst', dept: 'Finance', location: 'Bengaluru', salary: 95000 },
    { name: 'Arjun Mehta', email: 'arjun.mehta@ateon.local', designation: 'Growth Marketer', dept: 'Marketing', location: 'Remote', salary: 110000 },
    { name: 'Sneha Iyer', email: 'sneha.iyer@ateon.local', designation: 'HR Generalist', dept: 'People & Culture', location: 'Bengaluru', salary: 85000 },
  ];
  const employees = [];
  for (const e of employeesData) {
    employees.push(
      await prisma.employee.upsert({
        where: { email: e.email },
        update: {},
        create: {
          name: e.name,
          email: e.email,
          designation: e.designation,
          departmentId: departments[e.dept].id,
          location: e.location,
          salary: e.salary,
          status: 'active',
          joinDate: day(-200),
          userId: e.userId ?? null,
        },
      })
    );
  }
  console.log(`✔ ${employees.length} employees`);

  // ── Attendance (last 5 weekdays for each employee) ──
  for (const emp of employees) {
    for (let i = 1; i <= 5; i++) {
      const d = day(-i);
      if (d.getDay() === 0 || d.getDay() === 6) continue;
      await prisma.attendance.upsert({
        where: { employeeId_date: { employeeId: emp.id, date: d } },
        update: {},
        create: { employeeId: emp.id, date: d, status: 'present', checkIn: '09:30', checkOut: '18:30' },
      });
    }
  }
  console.log('✔ Attendance');

  // ── Leave requests ──
  await prisma.leaveRequest.createMany({
    data: [
      { employeeId: employees[1].id, type: 'casual', startDate: day(7), endDate: day(8), days: 2, reason: 'Family function', status: 'pending' },
      { employeeId: employees[3].id, type: 'sick', startDate: day(-3), endDate: day(-2), days: 2, reason: 'Fever', status: 'approved' },
    ],
  });

  // ── Payroll ──
  await prisma.payrollRun.upsert({
    where: { month: 'June 2026' },
    update: {},
    create: { month: 'June 2026', status: 'completed', totalGross: 890000, totalNet: 712000, headcount: employees.length, processedAt: day(-14) },
  });
  await prisma.payslip.createMany({
    data: ['June 2026', 'May 2026'].map((month) => ({
      employeeId: founder.id,
      month,
      basic: 150000, hra: 50000, da: 20000, special: 30000,
      pf: 15000, tax: 45000, gross: 250000, deductions: 60000, net: 190000,
    })),
  });
  console.log('✔ Payroll');

  // ── Finance ──
  await prisma.budget.createMany({
    data: [
      { department: 'Engineering', category: 'Cloud & Infra', fiscalYear: 'FY26-27', allocated: 2400000, spent: 640000, status: 'on-track' },
      { department: 'Research', category: 'Compute / GPU', fiscalYear: 'FY26-27', allocated: 3600000, spent: 1500000, status: 'on-track' },
      { department: 'Marketing', category: 'Campaigns', fiscalYear: 'FY26-27', allocated: 1200000, spent: 480000, status: 'at-risk' },
      { department: 'Operations', category: 'Office & Admin', fiscalYear: 'FY26-27', allocated: 800000, spent: 210000, status: 'on-track' },
    ],
  });
  await prisma.expense.createMany({
    data: [
      { description: 'AWS invoice — June', category: 'Cloud & Infra', amount: 182000, vendor: 'AWS', status: 'approved', submittedBy: 'Priya Nair' },
      { description: 'GPU cluster rental', category: 'Compute / GPU', amount: 260000, vendor: 'E2E Networks', status: 'approved', submittedBy: 'Vikram Rao' },
      { description: 'Conference travel — Ananya', category: 'Travel', amount: 42000, status: 'pending', submittedBy: 'Ananya Sharma' },
    ],
  });
  await prisma.invoice.createMany({
    data: [
      { number: 'ATN-2026-001', clientName: 'Meridian Systems', amount: 950000, dueDate: day(15), status: 'sent' },
      { number: 'ATN-2026-002', clientName: 'Helios Labs', amount: 480000, dueDate: day(-5), status: 'overdue' },
      { number: 'ATN-2026-003', clientName: 'Northwind Analytics', amount: 1250000, dueDate: day(-30), paidAt: day(-25), status: 'paid' },
    ],
  });
  console.log('✔ Finance');

  // ── Marketing ──
  const campaign = await prisma.marketingCampaign.create({
    data: {
      name: 'AGMS Launch — Search',
      channel: 'search',
      objective: 'Pipeline for AGMS pilot programme',
      status: 'active',
      budget: 600000,
      startDate: day(-30),
      spends: {
        create: [
          { date: day(-21), amount: 45000, description: 'Google Ads — week 1', impressions: 120000, clicks: 3400, conversions: 41 },
          { date: day(-14), amount: 52000, description: 'Google Ads — week 2', impressions: 141000, clicks: 3900, conversions: 55 },
          { date: day(-7), amount: 48000, description: 'Google Ads — week 3', impressions: 133000, clicks: 3600, conversions: 49 },
        ],
      },
    },
  });
  await prisma.marketingCampaign.create({
    data: {
      name: 'Founder Content Series',
      channel: 'content',
      objective: 'Brand awareness',
      status: 'planned',
      budget: 150000,
      startDate: day(10),
    },
  });
  console.log(`✔ Marketing (campaign ${campaign.name})`);

  // ── Projects & Tasks ──
  const project = await prisma.project.create({
    data: {
      name: 'ATEON One Platform',
      description: 'Internal operations platform — HRMS, finance, CRM, marketing.',
      status: 'active',
      health: 'green',
      progress: 55,
      startDate: day(-60),
    },
  });
  await prisma.task.createMany({
    data: [
      { title: 'Review Q3 financials', description: 'Analyze Q3 budget vs actuals; approval needed by Friday.', status: 'todo', priority: 'high', projectId: project.id, assigneeId: founder.id, dueDate: day(3) },
      { title: 'Finalize hiring plan', description: 'Approve Q4 headcount for Engineering.', status: 'in-progress', priority: 'critical', projectId: project.id, assigneeId: founder.id, dueDate: day(5) },
      { title: 'Sign off AGMS launch campaign', description: 'Review creatives and budget split before week 4 spend.', status: 'todo', priority: 'medium', projectId: project.id, assigneeId: founder.id, dueDate: day(2) },
    ],
  });
  console.log('✔ Project + tasks');

  // ── CRM ──
  const lead = await prisma.lead.create({
    data: {
      name: 'Meridian Systems — AGMS pilot',
      company: 'Meridian Systems',
      email: 'procurement@meridian.example',
      source: 'website',
      status: 'qualified',
      estimatedValue: 2400000,
      contacts: { create: [{ name: 'Kavitha Menon', title: 'VP Engineering', email: 'kavitha@meridian.example' }] },
    },
  });
  await prisma.lead.createMany({
    data: [
      { name: 'Helios Labs — research licence', company: 'Helios Labs', status: 'proposal', estimatedValue: 900000, source: 'referral' },
      { name: 'Northwind Analytics — renewal', company: 'Northwind Analytics', status: 'won', estimatedValue: 1250000, source: 'outbound' },
    ],
  });
  console.log(`✔ CRM (lead ${lead.company})`);

  // ── Approvals / Tickets / Calendar / Docs ──
  await prisma.approval.createMany({
    data: [
      { title: 'GPU cluster expansion — ₹2.6L', type: 'procurement', requestedBy: 'Vikram Rao', amount: 260000, priority: 'high', status: 'pending', currentStep: 'CEO sign-off' },
      { title: 'Casual leave — Ananya Sharma', type: 'leave', requestedBy: 'Ananya Sharma', priority: 'low', status: 'pending', currentStep: 'CHRO review' },
    ],
  });
  await prisma.serviceTicket.createMany({
    data: [
      { subject: 'VPN access for new laptop', description: 'Need VPN profile provisioned for replacement laptop.', category: 'it', priority: 'medium', status: 'open', reportedBy: 'Arjun Mehta', slaDeadline: day(2) },
      { subject: 'Payslip discrepancy — May', description: 'HRA component looks incorrect in May payslip.', category: 'hr', priority: 'high', status: 'in-progress', reportedBy: 'Priya Nair', assignedTo: 'Sneha Iyer', slaDeadline: day(1) },
    ],
  });
  await prisma.calendarEvent.createMany({
    data: [
      { title: 'Weekly leadership sync', type: 'meeting', date: day(1), startTime: '10:00', endTime: '11:00', location: 'Boardroom / Meet' },
      { title: 'AGMS campaign review', type: 'review', date: day(2), startTime: '15:00', endTime: '16:00' },
      { title: 'Q3 board deadline', type: 'deadline', date: day(12) },
    ],
  });
  await prisma.document.createMany({
    data: [
      { name: 'Employee Handbook v2', category: 'hr', url: '/docs/employee-handbook-v2.pdf' },
      { name: 'FY26-27 Budget Plan', category: 'finance', url: '/docs/fy26-27-budget.xlsx' },
    ],
  });
  await prisma.setting.upsert({
    where: { key: 'seed.sample-data' },
    update: { value: new Date().toISOString() },
    create: { key: 'seed.sample-data', value: new Date().toISOString() },
  });
  console.log('✔ Approvals, tickets, calendar, documents');
  console.log('\nSeed complete. Login:', ADMIN_EMAIL, '/ (SEED_ADMIN_PASSWORD env or default)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
