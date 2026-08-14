'use server';

import { prisma } from '@/lib/prisma';
import { requireSession } from '@/lib/auth';
import { emitToGroup, emitToUsers } from '@/lib/realtime';

/**
 * NOTE ON QUERY STYLE
 *
 * The runtime is the hand-written mysql2 shim in src/lib/prisma.ts, not Prisma.
 * It supports flat `where` clauses and single-level `include` only — it has no
 * nested writes (`members: { create: [...] }`), no relation filters
 * (`members: { some: ... }`) and no composite-key lookups
 * (`where: { groupId_userId: ... }`). Those all fail silently or match nothing,
 * which is what left every chat group with zero members. Everything below is
 * written as explicit flat queries for that reason.
 */

type MemberRow = { id: string; groupId: string; userId: string; lastRead?: Date };

async function getMembership(groupId: string, userId: string): Promise<MemberRow | null> {
  const rows = await prisma.chatMember.findMany({ where: { groupId, userId } });
  return rows[0] ?? null;
}

/** Groups the user belongs to, with members, member names and a last message. */
export async function listGroups() {
  const user = await requireSession();

  const myMemberships = await prisma.chatMember.findMany({ where: { userId: user.id } });
  const groupIds = myMemberships.map((m: any) => m.groupId);
  if (groupIds.length === 0) return [];

  const [allGroups, allMembers, users] = await Promise.all([
    prisma.chatGroup.findMany({ where: { id: { in: groupIds } }, orderBy: { updatedAt: 'desc' } }),
    prisma.chatMember.findMany({ where: { groupId: { in: groupIds } } }),
    prisma.user.findMany({ select: { id: true, name: true, email: true } }),
  ]);

  const userById = new Map<string, any>(users.map((u: any) => [u.id, u]));

  const membersByGroup = new Map<string, any[]>();
  for (const m of allMembers) {
    const list = membersByGroup.get(m.groupId) ?? [];
    list.push({ ...m, user: userById.get(m.userId) ?? null });
    membersByGroup.set(m.groupId, list);
  }

  // Last message per group, fetched per group because the shim has no
  // "distinct on" or window functions.
  const groups = [];
  for (const g of allGroups) {
    const recent = await prisma.chatMessage.findMany({
      where: { groupId: g.id },
      orderBy: { timestamp: 'desc' },
      take: 1,
    });
    groups.push({
      ...g,
      members: membersByGroup.get(g.id) ?? [],
      messages: recent,
    });
  }

  return groups;
}

export async function getMessages(groupId: string) {
  const user = await requireSession();

  const member = await getMembership(groupId, user.id);
  if (!member) throw new Error('Not a member of this group');

  const [messages, users] = await Promise.all([
    prisma.chatMessage.findMany({ where: { groupId }, orderBy: { timestamp: 'asc' } }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);

  const userById = new Map<string, any>(users.map((u: any) => [u.id, u]));
  return messages.map((m: any) => ({ ...m, sender: userById.get(m.senderId) ?? null }));
}

export async function sendMessage(groupId: string, content: string, fileUrl?: string, fileType?: string) {
  const user = await requireSession();

  const member = await getMembership(groupId, user.id);
  if (!member) throw new Error('Not a member of this group');

  if (!content?.trim() && !fileUrl) throw new Error('Message cannot be empty');

  const message = await prisma.chatMessage.create({
    data: {
      groupId,
      senderId: user.id,
      content: content ?? '',
      fileUrl: fileUrl ?? null,
      fileType: fileType ?? null,
    },
  });

  await prisma.chatGroup.update({ where: { id: groupId }, data: { updatedAt: new Date() } });

  const payload = {
    ...message,
    sender: { id: user.id, name: user.name, avatar: user.avatar },
  };

  emitToGroup(groupId, 'chat:message', payload);

  const members = await prisma.chatMember.findMany({ where: { groupId } });
  emitToUsers(
    members.map((m: any) => m.userId).filter((id: string) => id !== user.id),
    'chat:inbox',
    { groupId, preview: fileUrl ? 'Sent a file' : content, senderName: user.name }
  );

  return payload;
}

/** Add members one row at a time — the shim cannot do nested creates. */
async function addMembers(groupId: string, userIds: string[]) {
  for (const userId of new Set(userIds)) {
    const existing = await getMembership(groupId, userId);
    if (existing) continue;
    await prisma.chatMember.create({ data: { groupId, userId } });
  }
}

export async function createGroup(name: string, userIds: string[]) {
  const user = await requireSession();

  const trimmed = name?.trim();
  if (!trimmed) throw new Error('Group name is required');

  // Only real users can be added.
  const users = await prisma.user.findMany({ select: { id: true } });
  const valid = new Set(users.map((u: any) => u.id));
  const members = Array.from(new Set([...userIds, user.id])).filter((id) => valid.has(id));
  if (members.length < 2) throw new Error('Pick at least one other person');

  const group = await prisma.chatGroup.create({ data: { name: trimmed, type: 'team' } });
  await addMembers(group.id, members);

  // Let the new members see it appear without a refresh.
  emitToUsers(members.filter((id) => id !== user.id), 'chat:inbox', { groupId: group.id });

  return group;
}

export async function createDirectMessage(targetUserId: string) {
  const user = await requireSession();

  if (user.id === targetUserId) throw new Error('Cannot create a direct message with yourself');

  const target = await prisma.user.findUnique({ where: { id: targetUserId } });
  if (!target) throw new Error('That user no longer exists');

  // Reuse an existing 1:1 conversation. Done by intersecting membership rows
  // because the shim has no relation filters.
  const [mine, theirs] = await Promise.all([
    prisma.chatMember.findMany({ where: { userId: user.id } }),
    prisma.chatMember.findMany({ where: { userId: targetUserId } }),
  ]);
  const theirGroups = new Set(theirs.map((m: any) => m.groupId));
  const shared = mine.map((m: any) => m.groupId).filter((id: string) => theirGroups.has(id));

  for (const groupId of shared) {
    const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
    if (group?.type !== 'direct') continue;
    // Must be exactly the two of them.
    const members = await prisma.chatMember.findMany({ where: { groupId } });
    if (members.length === 2) return group;
  }

  const group = await prisma.chatGroup.create({ data: { name: 'Direct Message', type: 'direct' } });
  await addMembers(group.id, [user.id, targetUserId]);

  emitToUsers([targetUserId], 'chat:inbox', { groupId: group.id });

  return group;
}

/** Add people to an existing group. Members only. */
export async function addGroupMembers(groupId: string, userIds: string[]) {
  const user = await requireSession();

  const member = await getMembership(groupId, user.id);
  if (!member) throw new Error('Not a member of this group');

  const group = await prisma.chatGroup.findUnique({ where: { id: groupId } });
  if (group?.type === 'direct') throw new Error('Cannot add people to a direct message');

  const users = await prisma.user.findMany({ select: { id: true } });
  const valid = new Set(users.map((u: any) => u.id));
  const toAdd = userIds.filter((id) => valid.has(id));

  await addMembers(groupId, toAdd);
  emitToUsers(toAdd, 'chat:inbox', { groupId });
  return { success: true, added: toAdd.length };
}
