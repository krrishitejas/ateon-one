'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import useSWR from 'swr';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass, textareaClass } from '@/components/ui/Modal';
import { formatINR } from '@/data/mockData';
import { useAuth } from '@/context/AuthContext';
import {
  listVendors, upsertVendor, deleteVendor,
  listPurchaseRequests, createPurchaseRequest, setPurchaseRequestStatus,
  listInventory, upsertInventoryItem, deleteInventoryItem,
  getProcurementSummary, type VendorDTO,
} from '@/actions/procurement';
import {
  ShoppingCart, Plus, Star, Package, Truck, ExternalLink, Pencil,
  Check, X, AlertCircle, Trash2, AlertTriangle,
} from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const PROCUREMENT_ADMIN = ['ceo', 'admin', 'cfo', 'coo'];
const VENDOR_CATEGORIES = ['Technology', 'Furniture', 'Office Supplies', 'Logistics', 'Consulting', 'Maintenance', 'general'];

export default function ProcurementPage() {
  const { user } = useAuth();
  const canAdmin = PROCUREMENT_ADMIN.includes(user?.role ?? '');
  const [tab, setTab] = useState<'requests' | 'vendors' | 'inventory'>('requests');
  const [error, setError] = useState('');

  const { data: vendors = [], mutate: mutateVendors } = useSWR('procurement_vendors', () => listVendors());
  const { data: requests = [], mutate: mutateRequests } = useSWR('procurement_requests', () => listPurchaseRequests());
  const { data: inventory = [], mutate: mutateInventory } = useSWR('procurement_inventory', listInventory);
  const { data: summary, mutate: mutateSummary } = useSWR('procurement_summary', getProcurementSummary);

  // ── Vendor modal ──
  const [showVendorModal, setShowVendorModal] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorDTO | null>(null);
  const [vendorForm, setVendorForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  const openAddVendor = () => {
    setEditingVendor(null);
    setVendorForm({ name: '', category: 'Technology', contact: '', email: '', phone: '', rating: 4, status: 'active' });
    setShowVendorModal(true);
  };
  const openEditVendor = (v: VendorDTO) => { setEditingVendor(v); setVendorForm({ ...v }); setShowVendorModal(true); };
  const closeVendorModal = () => { setShowVendorModal(false); setEditingVendor(null); setError(''); };

  const handleVendorSave = async () => {
    setSaving(true); setError('');
    try {
      await upsertVendor({ ...vendorForm, id: editingVendor?.id });
      await Promise.all([mutateVendors(), mutateSummary()]);
      closeVendorModal();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save vendor');
    } finally { setSaving(false); }
  };

  const handleVendorDelete = async (v: VendorDTO) => {
    if (!confirm(`Remove vendor "${v.name}"?`)) return;
    try {
      await deleteVendor(v.id);
      await Promise.all([mutateVendors(), mutateSummary()]);
    } catch (e: any) { setError(e?.message ?? 'Could not delete vendor'); }
  };

  // ── Purchase request modal ──
  const [showPRModal, setShowPRModal] = useState(false);
  const [prForm, setPRForm] = useState({ title: '', description: '', amount: 0, urgency: 'medium', vendorId: '' });

  const handlePRSubmit = async () => {
    setSaving(true); setError('');
    try {
      await createPurchaseRequest({
        title: prForm.title,
        description: prForm.description || undefined,
        amount: Number(prForm.amount),
        urgency: prForm.urgency,
        vendorId: prForm.vendorId || undefined,
      });
      await Promise.all([mutateRequests(), mutateSummary()]);
      setShowPRModal(false);
      setPRForm({ title: '', description: '', amount: 0, urgency: 'medium', vendorId: '' });
    } catch (e: any) {
      setError(e?.message ?? 'Could not submit request');
    } finally { setSaving(false); }
  };

  const decide = async (id: string, status: 'approved' | 'rejected') => {
    setError('');
    try {
      await setPurchaseRequestStatus(id, status);
      await Promise.all([mutateRequests(), mutateVendors(), mutateSummary()]);
    } catch (e: any) { setError(e?.message ?? 'Could not update request'); }
  };

  // ── Inventory modal ──
  const [showInvModal, setShowInvModal] = useState(false);
  const [editingInv, setEditingInv] = useState<any>(null);
  const [invForm, setInvForm] = useState<any>({});

  const openAddInv = () => {
    setEditingInv(null);
    setInvForm({ name: '', sku: '', category: 'general', quantity: 0, reorderLevel: 0, unitCost: 0, location: '' });
    setShowInvModal(true);
  };
  const openEditInv = (i: any) => { setEditingInv(i); setInvForm({ ...i }); setShowInvModal(true); };

  const handleInvSave = async () => {
    setSaving(true); setError('');
    try {
      await upsertInventoryItem({ ...invForm, id: editingInv?.id });
      await Promise.all([mutateInventory(), mutateSummary()]);
      setShowInvModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not save item');
    } finally { setSaving(false); }
  };

  const handleInvDelete = async (i: any) => {
    if (!confirm(`Remove "${i.name}" from inventory?`)) return;
    try {
      await deleteInventoryItem(i.id);
      await Promise.all([mutateInventory(), mutateSummary()]);
    } catch (e: any) { setError(e?.message ?? 'Could not delete item'); }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Procurement</h1>
          <p className="text-gray-500 text-sm mt-1">Purchase requests, vendor management, and inventory</p>
        </div>
        <div className="flex gap-2">
          {tab === 'requests' && <Button icon={<Plus size={16} />} onClick={() => setShowPRModal(true)}>New Request</Button>}
          {tab === 'vendors' && canAdmin && <Button icon={<Plus size={16} />} onClick={openAddVendor}>Add Vendor</Button>}
          {tab === 'inventory' && canAdmin && <Button icon={<Plus size={16} />} onClick={openAddInv}>Add Item</Button>}
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Pending Requests', value: summary.pendingRequests, color: '#FFB84D' },
            { label: 'Active Vendors', value: summary.activeVendors, color: '#00D4AA' },
            { label: 'Low Stock Items', value: summary.lowStock, color: '#FF6B6B' },
            { label: 'Stock Value', value: formatINR(summary.stockValue), color: '#7C5CFC' },
          ].map(s => (
            <Card key={s.label} padding="sm">
              <p className="text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-gray-500">{s.label}</p>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit">
        {[
          { id: 'requests' as const, label: 'Purchase Requests', icon: <ShoppingCart size={14} /> },
          { id: 'vendors' as const, label: 'Vendors', icon: <Truck size={14} /> },
          { id: 'inventory' as const, label: 'Inventory', icon: <Package size={14} /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer ${tab === t.id ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-600'}`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Purchase Requests */}
      {tab === 'requests' && (
        <motion.div variants={item} className="space-y-3">
          {requests.length === 0 && (
            <Card className="text-center py-12">
              <ShoppingCart size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">No purchase requests yet</p>
              <p className="text-sm text-gray-500 mt-1">Raise one and it goes to procurement for approval.</p>
            </Card>
          )}
          {requests.map((pr: any) => (
            <Card key={pr.id} variant="default" hover>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart size={20} className="text-purple-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate">{pr.title}</h3>
                    <Badge variant={pr.urgency === 'critical' ? 'danger' : pr.urgency === 'high' ? 'warning' : pr.urgency === 'medium' ? 'info' : 'default'} size="sm">
                      {pr.urgency}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {pr.requestedBy}
                    {pr.vendor?.name ? ` • ${pr.vendor.name}` : ''}
                    {' • '}
                    {new Date(pr.createdAt).toLocaleDateString('en-IN')}
                  </p>
                </div>
                <span className="text-sm font-mono font-medium">{formatINR(Number(pr.amount) || 0)}</span>
                <Badge variant={pr.status === 'approved' ? 'success' : pr.status === 'rejected' ? 'danger' : 'warning'} size="sm">{pr.status}</Badge>
                {pr.status === 'pending' && canAdmin && (
                  <div className="flex gap-1">
                    <button onClick={() => decide(pr.id, 'approved')} className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-600 hover:bg-emerald-50 cursor-pointer" title="Approve"><Check size={14} /></button>
                    <button onClick={() => decide(pr.id, 'rejected')} className="w-7 h-7 rounded-lg flex items-center justify-center text-red-600 hover:bg-red-50 cursor-pointer" title="Reject"><X size={14} /></button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </motion.div>
      )}

      {/* Vendors */}
      {tab === 'vendors' && (
        <>
          {vendors.length === 0 ? (
            <Card className="text-center py-12">
              <Truck size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">No vendors yet</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">Register the suppliers you buy from.</p>
              {canAdmin && <Button size="sm" icon={<Plus size={14} />} onClick={openAddVendor}>Add the first vendor</Button>}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {vendors.map(vendor => (
                <motion.div key={vendor.id} variants={item}>
                  <Card variant="default" hover>
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold truncate">{vendor.name}</h3>
                          <p className="text-xs text-gray-500">{vendor.category}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {canAdmin && (
                            <>
                              <button onClick={() => openEditVendor(vendor)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
                                <Pencil size={14} />
                              </button>
                              <button onClick={() => handleVendorDelete(vendor)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                          <Badge variant={vendor.status === 'active' ? 'success' : vendor.status === 'inactive' ? 'default' : 'danger'} size="sm">{vendor.status}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map(star => (
                          <Star key={star} size={14} className={star <= Math.floor(vendor.rating) ? 'text-amber-500 fill-amber-400' : 'text-gray-300'} />
                        ))}
                        <span className="text-xs text-gray-500 ml-1">{vendor.rating}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>{vendor.contact || '—'}</span>
                        <span>{vendor.totalOrders} orders</span>
                      </div>
                      {vendor.email && (
                        <a href={`mailto:${vendor.email}`} className="flex items-center gap-1 text-xs text-gray-900 hover:text-gray-700 transition-colors">
                          {vendor.email} <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Inventory */}
      {tab === 'inventory' && (
        <motion.div variants={item}>
          {inventory.length === 0 ? (
            <Card className="text-center py-12">
              <Package size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-900">Inventory is empty</p>
              <p className="text-sm text-gray-500 mt-1 mb-4">Track assets and stock levels with reorder alerts.</p>
              {canAdmin && <Button size="sm" icon={<Plus size={14} />} onClick={openAddInv}>Add the first item</Button>}
            </Card>
          ) : (
            <Card variant="default">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Item</th>
                      <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">SKU</th>
                      <th className="text-left text-xs font-medium text-gray-500 py-3 px-3">Category</th>
                      <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Qty</th>
                      <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Reorder at</th>
                      <th className="text-right text-xs font-medium text-gray-500 py-3 px-3">Value</th>
                      <th className="text-center text-xs font-medium text-gray-500 py-3 px-3">Status</th>
                      {canAdmin && <th className="w-20" />}
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((inv: any) => (
                      <tr key={inv.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <Package size={16} className="text-gray-500" />
                            <span className="text-sm font-medium">{inv.name}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-xs font-mono text-gray-500">{inv.sku || '—'}</td>
                        <td className="py-3 px-3 text-sm text-gray-600">{inv.category}</td>
                        <td className="py-3 px-3 text-sm text-center">{inv.quantity}</td>
                        <td className="py-3 px-3 text-sm text-center text-gray-500">{inv.reorderLevel}</td>
                        <td className="py-3 px-3 text-sm text-right font-mono">{formatINR(inv.quantity * inv.unitCost)}</td>
                        <td className="py-3 px-3 text-center">
                          <Badge variant={inv.needsReorder ? 'warning' : 'success'} size="sm">
                            {inv.needsReorder ? 'reorder' : 'in stock'}
                          </Badge>
                        </td>
                        {canAdmin && (
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => openEditInv(inv)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 cursor-pointer">
                                <Pencil size={13} />
                              </button>
                              <button onClick={() => handleInvDelete(inv)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 cursor-pointer">
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {inventory.some((i: any) => i.needsReorder) && (
                <div className="flex items-center gap-2 mt-4 p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-800 text-xs">
                  <AlertTriangle size={14} className="flex-shrink-0" />
                  <span>{inventory.filter((i: any) => i.needsReorder).length} item(s) at or below reorder level.</span>
                </div>
              )}
            </Card>
          )}
        </motion.div>
      )}

      {/* Vendor modal */}
      <Modal
        isOpen={showVendorModal}
        onClose={closeVendorModal}
        title={editingVendor ? 'Edit Vendor' : 'Add Vendor'}
        description={editingVendor ? 'Update vendor information' : 'Register a new vendor'}
        footer={
          <>
            <Button variant="secondary" onClick={closeVendorModal}>Cancel</Button>
            <Button onClick={handleVendorSave} disabled={!vendorForm.name?.trim() || saving}>
              {saving ? 'Saving…' : editingVendor ? 'Update' : 'Add Vendor'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Vendor Name" required>
            <input className={inputClass} value={vendorForm.name || ''} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="Company name" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <select className={selectClass} value={vendorForm.category || 'Technology'} onChange={e => setVendorForm({ ...vendorForm, category: e.target.value })}>
                {VENDOR_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Rating (0–5)">
              <input type="number" className={inputClass} min={0} max={5} step={0.1} value={vendorForm.rating ?? 4} onChange={e => setVendorForm({ ...vendorForm, rating: Number(e.target.value) })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Contact Person">
              <input className={inputClass} value={vendorForm.contact || ''} onChange={e => setVendorForm({ ...vendorForm, contact: e.target.value })} placeholder="Contact name" />
            </FormField>
            <FormField label="Phone">
              <input className={inputClass} value={vendorForm.phone || ''} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} placeholder="+91…" />
            </FormField>
          </div>
          <FormField label="Email">
            <input type="email" className={inputClass} value={vendorForm.email || ''} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} placeholder="vendor@company.com" />
          </FormField>
          {editingVendor && (
            <FormField label="Status">
              <select className={selectClass} value={vendorForm.status || 'active'} onChange={e => setVendorForm({ ...vendorForm, status: e.target.value })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="blacklisted">Blacklisted</option>
              </select>
            </FormField>
          )}
        </div>
      </Modal>

      {/* Purchase request modal */}
      <Modal
        isOpen={showPRModal}
        onClose={() => { setShowPRModal(false); setError(''); }}
        title="New Purchase Request"
        description="Submit a new procurement request"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowPRModal(false)}>Cancel</Button>
            <Button onClick={handlePRSubmit} disabled={!prForm.title.trim() || Number(prForm.amount) <= 0 || saving}>
              {saving ? 'Submitting…' : 'Submit Request'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Title" required>
            <input className={inputClass} value={prForm.title} onChange={e => setPRForm({ ...prForm, title: e.target.value })} placeholder="What do you need?" />
          </FormField>
          <FormField label="Details">
            <textarea className={textareaClass} value={prForm.description} onChange={e => setPRForm({ ...prForm, description: e.target.value })} placeholder="Why is this needed?" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Estimated Amount (₹)" required>
              <input type="number" min={0} className={inputClass} value={prForm.amount || ''} onChange={e => setPRForm({ ...prForm, amount: Number(e.target.value) })} placeholder="0" />
            </FormField>
            <FormField label="Urgency">
              <select className={selectClass} value={prForm.urgency} onChange={e => setPRForm({ ...prForm, urgency: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </FormField>
          </div>
          <FormField label="Preferred Vendor">
            <select className={selectClass} value={prForm.vendorId} onChange={e => setPRForm({ ...prForm, vendorId: e.target.value })}>
              <option value="">— None —</option>
              {vendors.filter(v => v.status === 'active').map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </FormField>
        </div>
      </Modal>

      {/* Inventory modal */}
      <Modal
        isOpen={showInvModal}
        onClose={() => { setShowInvModal(false); setError(''); }}
        title={editingInv ? 'Edit Item' : 'Add Inventory Item'}
        description="Track stock levels and get reorder alerts"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowInvModal(false)}>Cancel</Button>
            <Button onClick={handleInvSave} disabled={!invForm.name?.trim() || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Item Name" required>
              <input className={inputClass} value={invForm.name || ''} onChange={e => setInvForm({ ...invForm, name: e.target.value })} placeholder="e.g. MacBook Pro 14" />
            </FormField>
            <FormField label="SKU">
              <input className={inputClass} value={invForm.sku || ''} onChange={e => setInvForm({ ...invForm, sku: e.target.value })} placeholder="Optional, unique" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Category">
              <input className={inputClass} value={invForm.category || ''} onChange={e => setInvForm({ ...invForm, category: e.target.value })} placeholder="general" />
            </FormField>
            <FormField label="Location">
              <input className={inputClass} value={invForm.location || ''} onChange={e => setInvForm({ ...invForm, location: e.target.value })} placeholder="e.g. Bengaluru HQ" />
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField label="Quantity">
              <input type="number" min={0} className={inputClass} value={invForm.quantity ?? 0} onChange={e => setInvForm({ ...invForm, quantity: Number(e.target.value) })} />
            </FormField>
            <FormField label="Reorder at">
              <input type="number" min={0} className={inputClass} value={invForm.reorderLevel ?? 0} onChange={e => setInvForm({ ...invForm, reorderLevel: Number(e.target.value) })} />
            </FormField>
            <FormField label="Unit Cost (₹)">
              <input type="number" min={0} className={inputClass} value={invForm.unitCost ?? 0} onChange={e => setInvForm({ ...invForm, unitCost: Number(e.target.value) })} />
            </FormField>
          </div>
        </div>
      </Modal>
    </motion.div>
  );
}
