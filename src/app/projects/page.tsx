'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Avatar from '@/components/ui/Avatar';
import ProgressBar from '@/components/ui/ProgressBar';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass, textareaClass } from '@/components/ui/Modal';
import { formatINR, getStatusColor, Project } from '@/data/mockData';
import { listProjects, createProject, updateProject, deleteProject } from '@/actions/projects';
import { listUsers } from '@/actions/auth';
import useSWR from 'swr';
import { Plus, Calendar, LayoutGrid, List, Clock, Users, Pencil, Trash2, X, UploadCloud, Paperclip } from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const emptyProject = (): Partial<Project> => ({
  name: '', description: '', status: 'on-track', progress: 0,
  startDate: new Date().toISOString().split('T')[0],
  endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
  budget: 0, spent: 0, lead: '', team: [], department: 'Engineering',
  milestones: [],
});

export default function ProjectsPage() {
  const { data: dbProjects = [], mutate: mutateProjects } = useSWR('projects', listProjects, { refreshInterval: 5000 });
  const { data: dbEmployees = [] } = useSWR('users', listUsers, { refreshInterval: 60000 });
  
  // Transform DB projects to match UI interface
  const projects = dbProjects.map((p: any) => ({
    id: p.id,
    name: p.name,
    description: p.description || '',
    status: (['on-track', 'at-risk', 'delayed', 'completed', 'active'].includes(p.status) ? p.status : 'on-track') as Project['status'],
    progress: p.progress,
    startDate: new Date(p.startDate).toISOString().split('T')[0],
    endDate: p.endDate ? new Date(p.endDate).toISOString().split('T')[0] : '',
    budget: 0, // Mocked for now, not in schema
    spent: 0, // Mocked for now
    lead: p.ownerId || '',
    team: [], // Mocked for now
    department: 'Engineering', // Mocked for now
    milestones: [], // Mocked for now
    attachments: p.attachments || [],
  }));

  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [showCreate, setShowCreate] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [form, setForm] = useState<any>(emptyProject());
  const [isSaving, setIsSaving] = useState(false);

  const openCreate = () => { setForm(emptyProject()); setShowCreate(true); };
  const openEdit = (p: any) => { setForm({ ...p, ownerId: p.lead }); setEditingProject(p); };
  const closeModal = () => { setShowCreate(false); setEditingProject(null); setForm(emptyProject()); };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      alert('Only PDF files are allowed.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result;
      const currentAttachments = form.attachments || [];
      setForm({ ...form, attachments: [...currentAttachments, { name: file.name, url: base64, type: file.type }] });
    };
    reader.readAsDataURL(file);
  };

  const removeAttachment = (index: number) => {
    const newAttachments = [...(form.attachments || [])];
    newAttachments.splice(index, 1);
    setForm({ ...form, attachments: newAttachments });
  };

  const handleSave = async () => {
    if (!form.name?.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        status: form.status,
        progress: Number(form.progress) || 0,
        startDate: form.startDate,
        endDate: form.endDate,
        ownerId: form.lead,
        attachments: form.attachments,
      };

      if (editingProject) {
        await updateProject(editingProject.id, payload);
      } else {
        await createProject(payload);
      }
      await mutateProjects();
      closeModal();
    } catch (e) {
      console.error(e);
      alert('Failed to save project');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteProject(id);
      await mutateProjects();
      setDeleteConfirm(null);
    } catch (e) {
      alert('Failed to delete project');
    }
  };

  const isModalOpen = showCreate || !!editingProject;

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-gray-500 text-sm mt-1">{projects.length} projects • {projects.filter((p: any) => p.status !== 'completed').length} active</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5">
            <button onClick={() => setView('grid')} className={`p-1.5 rounded-md transition-all cursor-pointer ${view === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-600'}`}>
              <LayoutGrid size={16} />
            </button>
            <button onClick={() => setView('list')} className={`p-1.5 rounded-md transition-all cursor-pointer ${view === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-500 hover:text-gray-600'}`}>
              <List size={16} />
            </button>
          </div>
          <Button icon={<Plus size={16} />} onClick={openCreate}>New Project</Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'On Track', count: projects.filter((p: any) => p.status === 'on-track').length, color: '#059669' },
          { label: 'At Risk', count: projects.filter((p: any) => p.status === 'at-risk').length, color: '#D97706' },
          { label: 'Delayed', count: projects.filter((p: any) => p.status === 'delayed').length, color: '#DC2626' },
          { label: 'Completed', count: projects.filter((p: any) => p.status === 'completed').length, color: '#7C3AED' },
        ].map(stat => (
          <Card key={stat.label} variant="default" padding="sm">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ background: stat.color }} />
              <div>
                <p className="text-lg font-bold">{stat.count}</p>
                <p className="text-xs text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Project Cards */}
      <div className={view === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-4' : 'space-y-3'}>
        {projects.map((project: any) => {
          const lead = dbEmployees.find((e: any) => e.id === project.lead);
          const budgetPercent = project.budget > 0 ? Math.round((project.spent / project.budget) * 100) : 0;

          return (
            <motion.div key={project.id} variants={item}>
              <Card variant="default" hover className="relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: getStatusColor(project.status) }} />

                <div className="space-y-4 pt-1">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold truncate">{project.name}</h3>
                        <Badge variant={project.status === 'on-track' ? 'success' : project.status === 'at-risk' ? 'warning' : project.status === 'delayed' ? 'danger' : 'purple'} size="sm">
                          {project.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1 line-clamp-2">{project.description}</p>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      <button onClick={() => openEdit(project)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setDeleteConfirm(project.id)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-500">Progress</span>
                      <span className="text-xs font-medium">{project.progress}%</span>
                    </div>
                    <ProgressBar value={project.progress} size="md" />
                  </div>

                  {/* Meta */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-gray-500" />
                      <span className="text-xs text-gray-600">{project.startDate} → {project.endDate || 'Ongoing'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Paperclip size={14} className="text-gray-500" />
                      <span className="text-xs text-gray-600">{project.attachments?.length || 0} Files</span>
                    </div>
                  </div>

                  {/* Team */}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2">
                      <Users size={14} className="text-gray-500" />
                      <div className="flex -space-x-2">
                        {lead && <Avatar name={lead.name} size="sm" />}
                      </div>
                    </div>
                    <span className="text-[10px] text-gray-500">{project.department}</span>
                  </div>
                  
                  {project.attachments && project.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                      {project.attachments.map((file: any, i: number) => (
                        <a key={i} href={file.url} download={file.name} className="flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-md hover:bg-blue-100">
                          <Paperclip size={12} />
                          <span className="truncate max-w-[120px]">{file.name}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Create / Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingProject ? 'Edit Project' : 'New Project'}
        description={editingProject ? 'Update project details' : 'Create a new project'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isSaving}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? 'Saving...' : (editingProject ? 'Update' : 'Create Project')}</Button>
          </>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Project Name" required className="md:col-span-2">
            <input className={inputClass} value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Enter project name" />
          </FormField>
          <FormField label="Description" className="md:col-span-2">
            <textarea className={textareaClass} rows={3} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Brief project description" />
          </FormField>
          <FormField label="Status">
            <select className={selectClass} value={form.status || 'on-track'} onChange={e => setForm({ ...form, status: e.target.value })}>
              <option value="active">Active</option>
              <option value="on-track">On Track</option>
              <option value="at-risk">At Risk</option>
              <option value="delayed">Delayed</option>
              <option value="completed">Completed</option>
            </select>
          </FormField>
          <FormField label="Progress (%)">
            <input type="number" className={inputClass} min={0} max={100} value={form.progress || 0} onChange={e => setForm({ ...form, progress: Number(e.target.value) })} />
          </FormField>
          <FormField label="Start Date">
            <input type="date" className={inputClass} value={form.startDate || ''} onChange={e => setForm({ ...form, startDate: e.target.value })} />
          </FormField>
          <FormField label="End Date">
            <input type="date" className={inputClass} value={form.endDate || ''} onChange={e => setForm({ ...form, endDate: e.target.value })} />
          </FormField>
          <FormField label="Project Lead">
            <select className={selectClass} value={form.lead || ''} onChange={e => setForm({ ...form, lead: e.target.value })}>
              <option value="">Select lead</option>
              {dbEmployees.map((emp: any) => (
                <option key={emp.id} value={emp.id}>{emp.name} — {emp.designation}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Project Files (PDF Only)" className="md:col-span-2">
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 flex flex-col items-center justify-center bg-gray-50">
              <UploadCloud size={24} className="text-gray-400 mb-2" />
              <label className="cursor-pointer text-sm font-medium text-blue-600 hover:text-blue-700">
                <span>Upload PDF</span>
                <input type="file" className="hidden" accept="application/pdf" onChange={handleFileUpload} />
              </label>
              <p className="text-xs text-gray-500 mt-1">Maximum file size 5MB</p>
            </div>
            
            {form.attachments && form.attachments.length > 0 && (
              <div className="mt-3 space-y-2">
                {form.attachments.map((file: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-gray-50 border border-gray-100 rounded-lg">
                    <div className="flex items-center gap-2 overflow-hidden">
                      <Paperclip size={14} className="text-gray-400 flex-shrink-0" />
                      <span className="text-sm font-medium text-gray-700 truncate">{file.name}</span>
                    </div>
                    <button onClick={() => removeAttachment(i)} className="text-gray-400 hover:text-red-500 cursor-pointer">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormField>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title="Delete Project"
        description="This action cannot be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete Permanently</Button>
          </>
        }
      >
        <p className="text-sm text-gray-600">
          Are you sure you want to completely delete this project?
        </p>
      </Modal>
    </motion.div>
  );
}
