const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Wiping all dummy data to set dashboard metrics to zero...');
  
  // Wiping transactions and tasks
  await prisma.attendance.deleteMany({});
  await prisma.leaveRequest.deleteMany({});
  await prisma.payslip.deleteMany({});
  await prisma.payrollRun.deleteMany({});
  await prisma.budget.deleteMany({});
  await prisma.expense.deleteMany({});
  await prisma.invoice.deleteMany({});
  
  // Wiping marketing and projects
  await prisma.marketingSpend.deleteMany({});
  await prisma.marketingCampaign.deleteMany({});
  await prisma.task.deleteMany({});
  await prisma.project.deleteMany({});
  
  // Wiping CRM and ops
  await prisma.contact.deleteMany({});
  await prisma.lead.deleteMany({});
  await prisma.approval.deleteMany({});
  await prisma.serviceTicket.deleteMany({});
  await prisma.calendarEvent.deleteMany({});
  await prisma.document.deleteMany({});
  await prisma.auditLog.deleteMany({});
  
  // Wiping employees and departments
  await prisma.employee.deleteMany({});
  await prisma.department.deleteMany({});
  
  // Note: Users and Sessions are NOT deleted so the CEO can stay logged in.
  // Settings are not deleted.
  
  console.log('Successfully wiped all dummy data.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
