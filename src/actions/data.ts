'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, logAudit } from '@/lib/auth';
import { emitToUser } from '@/lib/realtime';

export async function getMyTasks() {
  const user = await requireSession();
  return prisma.task.findMany({
    where: { assigneeId: user.id, status: { not: 'done' } },
    orderBy: { dueDate: 'asc' },
  });
}

export async function updateTaskStatus(taskId: string, status: string) {
  const user = await requireSession();

  const ALLOWED = ['todo', 'in-progress', 'review', 'done'];
  if (!ALLOWED.includes(status)) throw new Error('Invalid task status');

  // You may only move your own tasks. Reassignment/other people's tasks go
  // through the projects module, which has its own checks.
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error('Task not found');
  if (task.assigneeId !== user.id) {
    throw new Error('Forbidden: that task is not assigned to you');
  }

  await prisma.task.update({ where: { id: taskId }, data: { status } });
  return { success: true };
}

const TASK_STATUSES = ['todo', 'in-progress', 'review', 'done'];
const TASK_PRIORITIES = ['low', 'medium', 'high', 'critical'];

/** Roles allowed to assign work to other people. */
const ASSIGNER_ROLES = ['ceo', 'admin', 'coo', 'cto', 'chro', 'manager'];

export async function createTask(input: {
  title: string;
  description?: string;
  assigneeId?: string;
  projectId?: string;
  status?: string;
  priority?: string;
  dueDate: string;
  tags?: string[];
}) {
  const user = await requireSession();

  const title = input.title?.trim();
  if (!title) throw new Error('Title is required');

  const dueDate = new Date(input.dueDate);
  if (Number.isNaN(dueDate.getTime())) throw new Error('A valid due date is required');

  // Assigning to someone else requires an assigner role.
  let assigneeId = user.id;
  if (input.assigneeId && input.assigneeId !== user.id) {
    if (!ASSIGNER_ROLES.includes(user.role)) {
      throw new Error('You can only create tasks for yourself');
    }
    assigneeId = input.assigneeId;
  }

  const task = await prisma.task.create({
    data: {
      title,
      description: input.description?.trim() || '',
      assigneeId,
      projectId: input.projectId || null,
      status: input.status && TASK_STATUSES.includes(input.status) ? input.status : 'todo',
      priority: input.priority && TASK_PRIORITIES.includes(input.priority) ? input.priority : 'medium',
      dueDate,
      tags: JSON.stringify(input.tags ?? []),
    },
  });

  await logAudit(user, 'task.create', 'Task', task.id, title);
  // Let the assignee know immediately when work lands on them.
  if (assigneeId !== user.id) {
    emitToUser(assigneeId, 'task:assigned', { id: task.id, title, dueDate: task.dueDate });
    emitToUser(assigneeId, 'notifications:refresh', { reason: 'task.assigned' });
  }
  return task;
}

export async function updateTask(
  id: string,
  input: { title?: string; description?: string; status?: string; priority?: string; dueDate?: string; assigneeId?: string }
) {
  const user = await requireSession();

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new Error('Task not found');

  const canManage = task.assigneeId === user.id || ASSIGNER_ROLES.includes(user.role);
  if (!canManage) throw new Error('Forbidden: that task is not yours');

  const data: any = {};
  if (input.title !== undefined) data.title = input.title.trim();
  if (input.description !== undefined) data.description = input.description.trim();
  if (input.status && TASK_STATUSES.includes(input.status)) data.status = input.status;
  if (input.priority && TASK_PRIORITIES.includes(input.priority)) data.priority = input.priority;
  if (input.dueDate) {
    const d = new Date(input.dueDate);
    if (Number.isNaN(d.getTime())) throw new Error('Invalid due date');
    data.dueDate = d;
  }
  if (input.assigneeId && input.assigneeId !== task.assigneeId) {
    if (!ASSIGNER_ROLES.includes(user.role)) throw new Error('You cannot reassign tasks');
    data.assigneeId = input.assigneeId;
  }

  if (Object.keys(data).length === 0) throw new Error('Nothing to update');
  return prisma.task.update({ where: { id }, data });
}

export async function deleteTask(id: string) {
  const user = await requireSession();

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) throw new Error('Task not found');
  if (task.assigneeId !== user.id && !ASSIGNER_ROLES.includes(user.role)) {
    throw new Error('Forbidden: that task is not yours');
  }

  await prisma.task.delete({ where: { id } });
  await logAudit(user, 'task.delete', 'Task', id);
  return { success: true };
}

export async function getMyPayslips() {
  const user = await requireSession();
  return prisma.payslip.findMany({
    where: { employeeId: user.id },
    orderBy: { createdAt: 'desc' },
  });
}
