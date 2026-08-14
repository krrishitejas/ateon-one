'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, logAudit } from '@/lib/auth';

export async function listProjects() {
  await requireSession();
  return prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
  });
}

export async function createProject(input: {
  name: string;
  description?: string;
  status?: string;
  progress?: number;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  attachments?: any;
}) {
  const user = await requireSession();


  const project = await prisma.project.create({
    data: {
      name: input.name,
      description: input.description,
      status: input.status || 'active',
      progress: input.progress || 0,
      startDate: input.startDate ? new Date(input.startDate) : new Date(),
      endDate: input.endDate ? new Date(input.endDate) : null,
      ownerId: input.ownerId,
      attachments: input.attachments ? input.attachments : undefined,
    },
  });

  await logAudit(user, 'project.create', 'Project', project.id);
  return project;
}

export async function updateProject(id: string, input: {
  name?: string;
  description?: string;
  status?: string;
  progress?: number;
  startDate?: string;
  endDate?: string;
  ownerId?: string;
  attachments?: any;
}) {
  const user = await requireSession();
  
  const project = await prisma.project.update({
    where: { id },
    data: {
      ...input,
      startDate: input.startDate ? new Date(input.startDate) : undefined,
      endDate: input.endDate ? new Date(input.endDate) : undefined,
    },
  });

  await logAudit(user, 'project.update', 'Project', project.id);
  return project;
}

export async function deleteProject(id: string) {
  const user = await requireSession();
  
  await prisma.project.delete({ where: { id } });
  
  await logAudit(user, 'project.delete', 'Project', id);
  return true;
}
