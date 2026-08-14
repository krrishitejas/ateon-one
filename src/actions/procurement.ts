'use server';

import { prisma } from '@/lib/prisma';
import { requireSession, requireRole, logAudit } from '@/lib/auth';

const PROCUREMENT_ADMIN = ['ceo', 'admin', 'cfo', 'coo'];
const VENDOR_STATUSES = ['active', 'inactive', 'blacklisted'];
const URGENCIES = ['low', 'medium', 'high', 'critical'];

// ─────────────────────────── Vendors ───────────────────────────

export type VendorDTO = {
  id: string;
  name: string;
  category: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  rating: number;
  totalOrders: number;
  status: string;
  notes: string | null;
};

export async function listVendors(status?: string): Promise<VendorDTO[]> {
  await requireSession();
  const vendors = await prisma.vendor.findMany({
    where: status && VENDOR_STATUSES.includes(status) ? { status } : undefined,
    orderBy: { name: 'asc' },
  });
  return vendors.map((v: any) => ({
    id: v.id,
    name: v.name,
    category: v.category,
    contact: v.contact,
    email: v.email,
    phone: v.phone,
    rating: Number(v.rating) || 0,
    totalOrders: Number(v.totalOrders) || 0,
    status: v.status,
    notes: v.notes,
  }));
}

export async function upsertVendor(input: {
  id?: string;
  name: string;
  category?: string;
  contact?: string;
  email?: string;
  phone?: string;
  rating?: number;
  status?: string;
  notes?: string;
}) {
  const user = await requireRole(PROCUREMENT_ADMIN);

  const name = input.name?.trim();
  if (!name) throw new Error('Vendor name is required');
  if (input.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email)) {
    throw new Error('Enter a valid email address');
  }
  if (input.rating !== undefined && (input.rating < 0 || input.rating > 5)) {
    throw new Error('Rating must be between 0 and 5');
  }

  const data = {
    name,
    category: input.category?.trim() || 'general',
    contact: input.contact?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
    rating: input.rating ?? 0,
    status: input.status && VENDOR_STATUSES.includes(input.status) ? input.status : 'active',
    notes: input.notes?.trim() || null,
  };

  const vendor = input.id
    ? await prisma.vendor.update({ where: { id: input.id }, data })
    : await prisma.vendor.create({ data });

  await logAudit(user, input.id ? 'procurement.vendor.update' : 'procurement.vendor.create', 'Vendor', vendor.id, name);
  return vendor;
}

export async function deleteVendor(id: string) {
  const user = await requireRole(PROCUREMENT_ADMIN);

  const open = await prisma.purchaseRequest.count({ where: { vendorId: id, status: 'pending' } });
  if (open > 0) throw new Error(`${open} pending request(s) reference this vendor`);

  await prisma.vendor.delete({ where: { id } });
  await logAudit(user, 'procurement.vendor.delete', 'Vendor', id);
  return { success: true };
}

// ─────────────────────────── Purchase requests ───────────────────────────

export async function listPurchaseRequests(status?: string) {
  const user = await requireSession();
  const canSeeAll = PROCUREMENT_ADMIN.includes(user.role) || user.role === 'manager';

  const where: any = {};
  if (status) where.status = status;
  if (!canSeeAll) where.requestedBy = user.name;

  return prisma.purchaseRequest.findMany({
    where: Object.keys(where).length > 0 ? where : undefined,
    include: { vendor: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function createPurchaseRequest(input: {
  title: string;
  description?: string;
  amount: number;
  urgency?: string;
  vendorId?: string;
}) {
  const user = await requireSession();

  const title = input.title?.trim();
  if (!title) throw new Error('Title is required');
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    throw new Error('Amount must be greater than zero');
  }

  const pr = await prisma.purchaseRequest.create({
    data: {
      title,
      description: input.description?.trim() || null,
      amount: input.amount,
      urgency: input.urgency && URGENCIES.includes(input.urgency) ? input.urgency : 'medium',
      status: 'pending',
      vendorId: input.vendorId || null,
      requesterId: user.id,
      requestedBy: user.name,
    },
  });

  await logAudit(user, 'procurement.request.create', 'PurchaseRequest', pr.id, title);
  return pr;
}

export async function setPurchaseRequestStatus(id: string, status: 'approved' | 'rejected') {
  const user = await requireRole(PROCUREMENT_ADMIN);

  const existing = await prisma.purchaseRequest.findUnique({ where: { id } });
  if (!existing) throw new Error('Purchase request not found');
  if (existing.status !== 'pending') throw new Error(`Already ${existing.status}`);
  if (existing.requestedBy === user.name) throw new Error('You cannot decide your own request');

  const pr = await prisma.purchaseRequest.update({
    where: { id },
    data: { status, decidedBy: user.name, decidedAt: new Date() },
  });

  // Approving a request counts as an order against that vendor.
  if (status === 'approved' && existing.vendorId) {
    const vendor = await prisma.vendor.findUnique({ where: { id: existing.vendorId } });
    if (vendor) {
      await prisma.vendor.update({
        where: { id: existing.vendorId },
        data: { totalOrders: (Number(vendor.totalOrders) || 0) + 1 },
      });
    }
  }

  await logAudit(user, `procurement.request.${status}`, 'PurchaseRequest', id, existing.title);
  return pr;
}

// ─────────────────────────── Inventory ───────────────────────────

export async function listInventory() {
  await requireSession();
  const items = await prisma.inventoryItem.findMany({ orderBy: { name: 'asc' } });
  return items.map((i: any) => ({
    ...i,
    quantity: Number(i.quantity) || 0,
    reorderLevel: Number(i.reorderLevel) || 0,
    unitCost: Number(i.unitCost) || 0,
    needsReorder: (Number(i.quantity) || 0) <= (Number(i.reorderLevel) || 0),
  }));
}

export async function upsertInventoryItem(input: {
  id?: string;
  name: string;
  sku?: string;
  category?: string;
  quantity?: number;
  reorderLevel?: number;
  unitCost?: number;
  location?: string;
}) {
  const user = await requireRole(PROCUREMENT_ADMIN);

  const name = input.name?.trim();
  if (!name) throw new Error('Item name is required');
  if (input.quantity !== undefined && input.quantity < 0) throw new Error('Quantity cannot be negative');
  if (input.unitCost !== undefined && input.unitCost < 0) throw new Error('Unit cost cannot be negative');

  const data = {
    name,
    sku: input.sku?.trim() || null,
    category: input.category?.trim() || 'general',
    quantity: input.quantity ?? 0,
    reorderLevel: input.reorderLevel ?? 0,
    unitCost: input.unitCost ?? 0,
    location: input.location?.trim() || null,
  };

  const item = input.id
    ? await prisma.inventoryItem.update({ where: { id: input.id }, data })
    : await prisma.inventoryItem.create({ data });

  await logAudit(user, input.id ? 'procurement.inventory.update' : 'procurement.inventory.create', 'InventoryItem', item.id, name);
  return item;
}

export async function deleteInventoryItem(id: string) {
  const user = await requireRole(PROCUREMENT_ADMIN);
  await prisma.inventoryItem.delete({ where: { id } });
  await logAudit(user, 'procurement.inventory.delete', 'InventoryItem', id);
  return { success: true };
}

export async function getProcurementSummary() {
  await requireSession();
  const [pending, vendors, items] = await Promise.all([
    prisma.purchaseRequest.count({ where: { status: 'pending' } }),
    prisma.vendor.count({ where: { status: 'active' } }),
    prisma.inventoryItem.findMany({}),
  ]);

  const lowStock = items.filter(
    (i: any) => (Number(i.quantity) || 0) <= (Number(i.reorderLevel) || 0)
  ).length;
  const stockValue = items.reduce(
    (sum: number, i: any) => sum + (Number(i.quantity) || 0) * (Number(i.unitCost) || 0),
    0
  );

  return { pendingRequests: pending, activeVendors: vendors, lowStock, stockValue };
}
