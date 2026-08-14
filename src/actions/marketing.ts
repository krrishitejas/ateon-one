'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';

// ─── Campaigns ───

export async function listCampaigns() {
  await requireSession();
  return prisma.marketingCampaign.findMany({
    include: { spends: { orderBy: { date: 'asc' } } },
    orderBy: { startDate: 'desc' },
  });
}

export async function createCampaign(input: {
  name: string;
  channel: string;
  objective?: string;
  budget?: number;
  startDate?: string;
  endDate?: string;
}) {
  const user = await requireRole();
  const campaign = await prisma.marketingCampaign.create({
    data: {
      name: input.name,
      channel: input.channel,
      objective: input.objective ?? null,
      budget: input.budget ?? 0,
      startDate: input.startDate ? new Date(input.startDate) : new Date(),
      endDate: input.endDate ? new Date(input.endDate) : null,
      ownerId: user.id,
    },
  });
  await logAudit(user, 'marketing.campaign.create', 'MarketingCampaign', campaign.id, campaign.name);
  return campaign;
}

export async function updateCampaign(
  id: string,
  data: Partial<{ name: string; channel: string; objective: string; status: string; budget: number; endDate: string }>
) {
  const user = await requireRole();
  const campaign = await prisma.marketingCampaign.update({
    where: { id },
    data: { ...data, endDate: data.endDate ? new Date(data.endDate) : undefined },
  });
  await logAudit(user, 'marketing.campaign.update', 'MarketingCampaign', id);
  return campaign;
}

export async function deleteCampaign(id: string) {
  const user = await requireRole();
  await prisma.marketingCampaign.delete({ where: { id } });
  await logAudit(user, 'marketing.campaign.delete', 'MarketingCampaign', id);
  return { success: true };
}

// ─── Spend entries ───

export async function addSpendEntry(
  campaignId: string,
  input: { date?: string; amount: number; description?: string; impressions?: number; clicks?: number; conversions?: number }
) {
  const user = await requireSession();
  const spend = await prisma.marketingSpend.create({
    data: {
      campaignId,
      date: input.date ? new Date(input.date) : new Date(),
      amount: input.amount,
      description: input.description ?? null,
      impressions: input.impressions ?? 0,
      clicks: input.clicks ?? 0,
      conversions: input.conversions ?? 0,
    },
  });
  await logAudit(user, 'marketing.spend.create', 'MarketingSpend', spend.id, `₹${input.amount}`);
  return spend;
}

export async function deleteSpendEntry(id: string) {
  const user = await requireRole();
  await prisma.marketingSpend.delete({ where: { id } });
  await logAudit(user, 'marketing.spend.delete', 'MarketingSpend', id);
  return { success: true };
}

// ─── Summary ───

/** Totals per channel + overall CTR/conversion figures for the marketing overview. */
export async function getMarketingSummary() {
  await requireSession();
  const campaigns = await prisma.marketingCampaign.findMany({ include: { spends: true } });
  const byChannel: Record<string, { budget: number; spent: number; clicks: number; impressions: number; conversions: number }> = {};
  for (const c of campaigns) {
    const bucket = (byChannel[c.channel] ??= { budget: 0, spent: 0, clicks: 0, impressions: 0, conversions: 0 });
    bucket.budget += c.budget;
    for (const s of c.spends) {
      bucket.spent += s.amount;
      bucket.clicks += s.clicks;
      bucket.impressions += s.impressions;
      bucket.conversions += s.conversions;
    }
  }
  const totalSpent = Object.values(byChannel).reduce((a: number, b: any) => a + b.spent, 0);
  const totalBudget = Object.values(byChannel).reduce((a: number, b: any) => a + b.budget, 0);
  return { byChannel, totalSpent, totalBudget, campaignCount: campaigns.length };
}
