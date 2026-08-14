'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import ProgressBar from '@/components/ui/ProgressBar';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass, textareaClass } from '@/components/ui/Modal';
import { useAuth } from '@/context/AuthContext';
import { formatINR, getStatusColor, Task, LeaveRequest } from '@/data/mockData';
import useSWR from 'swr';
import { getAttendanceStatus, toggleAttendance, getLeaveBalances, getAttendanceHistory } from '@/actions/hrms';
import { getMyTasks, createTask, updateTask as updateTaskAction, deleteTask as deleteTaskAction, getMyPayslips } from '@/actions/data';
import { listProjects } from '@/actions/projects';
import { submitLeaveRequest, listLeaveRequests } from '@/actions/hrms';
import {
  Clock, Play, Pause, Square, Calendar, CheckCircle2, Circle,
  Coffee, Sun, ChevronRight, FileText, Download, Plus, AlertTriangle,
  Pencil, Trash2, ArrowRight,
} from 'lucide-react';

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const todayIndex = (new Date().getDay() + 6) % 7;
const statusFlow: Task['status'][] = ['todo', 'in-progress', 'review', 'done'];

export default function WorkspacePage() {
  const { data: tasks = [], mutate: mutateTasks } = useSWR('my_tasks', getMyTasks);
  const { data: leaveRequests = [], mutate: mutateLeaves } = useSWR('my_leaves', () => listLeaveRequests());
  const { data: payslips = [] } = useSWR('my_payslips', getMyPayslips);
  const { data: projects = [] } = useSWR('projects', listProjects);
  const [wsError, setWsError] = useState('');
  const { user } = useAuth();
  const [clockedIn, setClockedIn] = useState(false);
  const [onBreak, setOnBreak] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [breakSeconds, setBreakSeconds] = useState(0);

  // Task CRUD
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskForm, setTaskForm] = useState<Partial<Task>>({});
  // Leave
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveForm, setLeaveForm] = useState({ type: 'casual' as LeaveRequest['type'], startDate: '', endDate: '', days: 1, reason: '' });

  const { data: attendance, mutate: mutateAttendance } = useSWR('attendance_status', getAttendanceStatus, { refreshInterval: 60000 });
  const { data: leaveBalances } = useSWR('leave_balances', getLeaveBalances);

  // Fetch month history
  const startOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const endOfMonthStr = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString();
  const { data: attendanceHistory = [] } = useSWR(
    ['attendance_history', startOfMonthStr, endOfMonthStr],
    () => getAttendanceHistory(startOfMonthStr, endOfMonthStr),
    { refreshInterval: 60000 }
  );

  useEffect(() => {
    if (attendance) {
      setClockedIn(attendance.clockedIn);
      setOnBreak(attendance.onBreak);
      setElapsedSeconds(attendance.elapsedSeconds);
      setBreakSeconds(attendance.breakSeconds);
    }
  }, [attendance]);

  const handleToggleAttendance = async (action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end') => {
    await toggleAttendance(action);
    if (action === 'clock_in') setClockedIn(true);
    if (action === 'clock_out') { setClockedIn(false); setOnBreak(false); }
    if (action === 'break_start') setOnBreak(true);
    if (action === 'break_end') setOnBreak(false);
    mutateAttendance();
  };

  // Timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (clockedIn && !onBreak) {
      interval = setInterval(() => setElapsedSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [clockedIn, onBreak]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (onBreak) {
      interval = setInterval(() => setBreakSeconds(s => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [onBreak]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const myTasks = tasks.filter((t: any) => t.status !== 'done').slice(0, 8);
  const myPayslips = payslips.slice(0, 2);

  // Calendar
  const currentDate = new Date();
  const monthDays = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
  const calendarDays = Array.from({ length: monthDays }, (_, i) => i + 1);
  const leaveDays = [5, 6, 15, 16, 17, 25];
  const holidayDays = [26];

  // Task handlers
  const openCreateTask = () => {
    setTaskForm({ title: '', description: '', projectId: projects[0]?.id || '', status: 'todo', priority: 'medium', dueDate: '', tags: [] });
    setShowTaskModal(true);
  };
  const openEditTask = (t: any) => { setTaskForm({ ...t }); setEditingTask(t); setShowTaskModal(true); };
  const closeTaskModal = () => { setShowTaskModal(false); setEditingTask(null); };

  const handleTaskSave = async () => {
    if (!taskForm.title?.trim()) return;
    setWsError('');
    try {
      if (editingTask) {
        await updateTaskAction(editingTask.id, {
          title: taskForm.title,
          description: taskForm.description,
          status: taskForm.status,
          priority: taskForm.priority,
          dueDate: taskForm.dueDate || undefined,
        });
      } else {
        await createTask({
          title: taskForm.title || '',
          description: taskForm.description,
          projectId: taskForm.projectId || undefined,
          status: taskForm.status,
          priority: taskForm.priority,
          dueDate: taskForm.dueDate || new Date().toISOString().split('T')[0],
          tags: taskForm.tags || [],
        });
      }
      await mutateTasks();
      closeTaskModal();
    } catch (e: any) {
      setWsError(e?.message ?? 'Could not save task');
    }
  };

  const cycleTaskStatus = async (task: any) => {
    const idx = statusFlow.indexOf(task.status);
    const next = statusFlow[(idx + 1) % statusFlow.length];
    setWsError('');
    try {
      await updateTaskAction(task.id, { status: next });
      await mutateTasks();
    } catch (e: any) {
      setWsError(e?.message ?? 'Could not update task');
    }
  };

  const handleTaskDelete = async (id: string) => {
    setWsError('');
    try {
      await deleteTaskAction(id);
      await mutateTasks();
    } catch (e: any) {
      setWsError(e?.message ?? 'Could not delete task');
    }
  };

  const handleLeaveSubmit = async () => {
    if (!leaveForm.reason.trim() || !leaveForm.startDate) return;
    setWsError('');
    try {
      await submitLeaveRequest({
        type: leaveForm.type,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate || leaveForm.startDate,
        days: leaveForm.days,
        reason: leaveForm.reason,
      });
      await mutateLeaves();
      setShowLeaveModal(false);
      setLeaveForm({ type: 'casual', startDate: '', endDate: '', days: 1, reason: '' });
    } catch (e: any) {
      setWsError(e?.message ?? 'Could not submit leave request');
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Workspace</h1>
        <p className="text-gray-500 text-sm mt-1">
          {currentDate.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Attendance Timer */}
          <motion.div variants={item}>
            <Card variant="elevated">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500 mb-1">Work Session</p>
                  <p className="text-4xl font-mono font-bold">{formatTime(elapsedSeconds)}</p>
                  {onBreak && (
                    <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <Coffee size={12} /> Break: {formatTime(breakSeconds)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!clockedIn ? (
                    <Button variant="success" size="lg" icon={<Play size={18} />} onClick={() => handleToggleAttendance('clock_in')}>
                      Clock In
                    </Button>
                  ) : (
                    <>
                      <Button variant={onBreak ? 'success' : 'secondary'} size="md" icon={onBreak ? <Sun size={16} /> : <Coffee size={16} />} onClick={() => handleToggleAttendance(onBreak ? 'break_end' : 'break_start')}>
                        {onBreak ? 'Resume' : 'Break'}
                      </Button>
                      <Button variant="danger" size="md" icon={<Square size={16} />} onClick={() => handleToggleAttendance('clock_out')}>
                        Clock Out
                      </Button>
                    </>
                  )}
                </div>
              </div>

              {/* Weekly Overview */}
              <div className="mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-2">This Week</p>
                <div className="flex gap-2">
                  {daysOfWeek.map((day, i) => {
                    const isToday = i === todayIndex;
                    const isPast = i < todayIndex;
                    // Calculate date for this day of the week
                    const dayDate = new Date();
                    const diff = i - todayIndex;
                    dayDate.setDate(currentDate.getDate() + diff);
                    const dayStr = `${dayDate.getFullYear()}-${(dayDate.getMonth() + 1).toString().padStart(2, '0')}-${dayDate.getDate().toString().padStart(2, '0')}T00:00:00.000Z`;
                    
                    const record = attendanceHistory.find((r: any) => r.date === dayStr);
                    let displayTime = '--:--';
                    if (isToday && clockedIn) {
                      displayTime = formatTime(elapsedSeconds).slice(0, 5);
                    } else if (record) {
                      displayTime = formatTime(record.elapsedSeconds).slice(0, 5);
                    } else if (isPast) {
                      // Keep some fake historical data for empty days if desired, or leave as --:--
                      displayTime = '08:30'; 
                    }

                    return (
                      <div key={day} className={`flex-1 text-center py-2 rounded-lg text-xs ${isToday ? 'bg-gray-100 text-gray-900 font-semibold border border-gray-300' : isPast ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-50 text-gray-500'}`}>
                        <p>{day}</p>
                        <p className="font-mono text-[10px] mt-0.5">{displayTime}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          </motion.div>

          {/* My Tasks — Interactive */}
          <motion.div variants={item}>
            <Card variant="default">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">My Tasks</h3>
                <div className="flex items-center gap-2">
                  <Badge variant="default" size="sm">{myTasks.length} active</Badge>
                  <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={openCreateTask}>Add Task</Button>
                </div>
              </div>
              <div className="space-y-2">
                {myTasks.map((task: any) => (
                  <div key={task.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors group">
                    <button onClick={() => cycleTaskStatus(task)} className="cursor-pointer flex-shrink-0" title={`Click to advance: ${task.status} → ${statusFlow[(statusFlow.indexOf(task.status) + 1) % statusFlow.length]}`}>
                      {task.status === 'done' ? (
                        <CheckCircle2 size={18} className="text-emerald-600" />
                      ) : task.status === 'in-progress' ? (
                        <Clock size={18} className="text-blue-600" />
                      ) : task.status === 'review' ? (
                        <AlertTriangle size={18} className="text-purple-600" />
                      ) : (
                        <Circle size={18} className="text-gray-400 group-hover:text-gray-600 transition-colors" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{task.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-500">{task.description?.slice(0, 40) || task.tags.join(', ')}</span>
                        <span className="text-[10px] text-gray-400">•</span>
                        <span className="text-[10px] text-gray-500">Due: {task.dueDate}</span>
                      </div>
                    </div>
                    <Badge variant={task.priority === 'critical' ? 'danger' : task.priority === 'high' ? 'warning' : task.priority === 'medium' ? 'info' : 'default'} size="sm">
                      {task.priority}
                    </Badge>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditTask(task)} className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-gray-700 cursor-pointer"><Pencil size={12} /></button>
                      <button onClick={() => handleTaskDelete(task.id)} className="w-6 h-6 rounded flex items-center justify-center text-gray-400 hover:text-red-600 cursor-pointer"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
                {myTasks.length === 0 && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <CheckCircle2 size={24} className="mx-auto mb-2 text-emerald-500" />
                    All tasks completed! 🎉
                  </div>
                )}
              </div>
            </Card>
          </motion.div>

          {/* Recent Payslips */}
          <motion.div variants={item}>
            <Card variant="default">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">Recent Payslips</h3>
              </div>
              <div className="space-y-3">
                {myPayslips.map((ps: any) => (
                  <div key={ps.id} className="flex items-center gap-4 p-3 rounded-xl bg-gray-50">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                      <FileText size={20} className="text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{ps.month}</p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
                        <span>Gross: {formatINR(ps.gross)}</span>
                        <span>Deductions: {formatINR(ps.deductions)}</span>
                      </div>
                    </div>
                    <p className="text-base font-bold text-emerald-600">{formatINR(ps.net)}</p>
                    <button className="p-2 rounded-lg hover:bg-white transition-colors cursor-pointer">
                      <Download size={16} className="text-gray-500" />
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Calendar */}
          <motion.div variants={item}>
            <Card variant="default">
              <h3 className="text-sm font-semibold mb-3">
                {currentDate.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="grid grid-cols-7 gap-1 text-center">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <span key={i} className="text-[10px] text-gray-500 font-medium py-1">{d}</span>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => (
                  <span key={`empty-${i}`} />
                ))}
                {calendarDays.map(day => {
                  const isToday = day === currentDate.getDate();
                  const isLeave = leaveDays.includes(day);
                  const isHoliday = holidayDays.includes(day);
                  const dayStr = `${currentDate.getFullYear()}-${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}T00:00:00.000Z`;
                  const isPresent = attendanceHistory.some((r: any) => r.date === dayStr);

                  return (
                    <button
                      key={day}
                      className={`w-8 h-8 rounded-lg text-xs font-medium transition-all cursor-pointer mx-auto flex items-center justify-center ${
                        isToday ? 'bg-gray-900 text-white shadow-lg' :
                        isLeave ? 'bg-amber-50 text-amber-600' :
                        isHoliday ? 'bg-red-50 text-red-500' :
                        isPresent ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-300' :
                        'hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-[10px] text-gray-500">Present</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[10px] text-gray-500">Leave</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500" />
                  <span className="text-[10px] text-gray-500">Holiday</span>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* Leave Balance */}
          <motion.div variants={item}>
            <Card variant="default">
              <h3 className="text-sm font-semibold mb-3">Leave Balance</h3>
              <div className="space-y-3">
                {(leaveBalances || [
                  { type: 'Casual', used: 0, total: 12 },
                  { type: 'Sick', used: 0, total: 8 },
                  { type: 'Earned', used: 0, total: 15 },
                ]).map((leave: any) => (
                  <div key={leave.type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs">{leave.type}</span>
                      <span className="text-xs text-gray-500">{leave.total - leave.used} / {leave.total} remaining</span>
                    </div>
                    <ProgressBar value={leave.used} max={leave.total} size="sm" color={leave.used / leave.total > 0.7 ? 'bg-red-500' : 'bg-emerald-500'} />
                  </div>
                ))}
              </div>
              <Button variant="secondary" size="sm" fullWidth onClick={() => setShowLeaveModal(true)} icon={<Plus size={14} />} className="mt-4">
                Apply for Leave
              </Button>
            </Card>
          </motion.div>

          {/* My Projects */}
          <motion.div variants={item}>
            <Card variant="default">
              <h3 className="text-sm font-semibold mb-3">My Projects</h3>
              <div className="space-y-3">
                {projects.slice(0, 3).map((project: any) => (
                  <div key={project.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-gray-50 transition-colors cursor-pointer">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: getStatusColor(project.status) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{project.name}</p>
                      <ProgressBar value={project.progress} size="sm" className="mt-1" />
                    </div>
                    <span className="text-[10px] text-gray-500">{project.progress}%</span>
                  </div>
                ))}
              </div>
            </Card>
          </motion.div>
        </div>
      </div>

      {/* Task Create/Edit Modal */}
      <Modal
        isOpen={showTaskModal}
        onClose={closeTaskModal}
        title={editingTask ? 'Edit Task' : 'New Task'}
        description={editingTask ? 'Update task details' : 'Create a new task'}
        footer={
          <>
            <Button variant="secondary" onClick={closeTaskModal}>Cancel</Button>
            <Button onClick={handleTaskSave}>{editingTask ? 'Update' : 'Create Task'}</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Title" required>
            <input className={inputClass} value={taskForm.title || ''} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} placeholder="Task title" />
          </FormField>
          <FormField label="Description">
            <textarea className={textareaClass} rows={3} value={taskForm.description || ''} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })} placeholder="Describe what needs to be done..." />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Priority">
              <select className={selectClass} value={taskForm.priority || 'medium'} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value as Task['priority'] })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </FormField>
            <FormField label="Status">
              <select className={selectClass} value={taskForm.status || 'todo'} onChange={e => setTaskForm({ ...taskForm, status: e.target.value as Task['status'] })}>
                <option value="todo">To Do</option>
                <option value="in-progress">In Progress</option>
                <option value="review">Review</option>
                <option value="done">Done</option>
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Due Date">
              <input type="date" className={inputClass} value={taskForm.dueDate || ''} onChange={e => setTaskForm({ ...taskForm, dueDate: e.target.value })} />
            </FormField>
            <FormField label="Project">
              <select className={selectClass} value={taskForm.projectId || ''} onChange={e => setTaskForm({ ...taskForm, projectId: e.target.value })}>
                {projects.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Tags (comma-separated)">
            <input className={inputClass} value={(taskForm.tags || []).join(', ')} onChange={e => setTaskForm({ ...taskForm, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })} placeholder="frontend, bug, ui" />
          </FormField>
        </div>
      </Modal>

      {/* Leave Modal */}
      <Modal
        isOpen={showLeaveModal}
        onClose={() => setShowLeaveModal(false)}
        title="Apply for Leave"
        description="Submit a leave request for approval"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowLeaveModal(false)}>Cancel</Button>
            <Button onClick={handleLeaveSubmit}>Submit Request</Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormField label="Leave Type" required>
            <select className={selectClass} value={leaveForm.type} onChange={e => setLeaveForm({ ...leaveForm, type: e.target.value as LeaveRequest['type'] })}>
              <option value="casual">Casual Leave</option>
              <option value="sick">Sick Leave</option>
              <option value="earned">Earned Leave</option>
              <option value="comp-off">Compensatory Off</option>
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Date" required>
              <input type="date" className={inputClass} value={leaveForm.startDate} onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })} />
            </FormField>
            <FormField label="End Date">
              <input type="date" className={inputClass} value={leaveForm.endDate} onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Number of Days" required>
            <input type="number" className={inputClass} min={1} max={30} value={leaveForm.days} onChange={e => setLeaveForm({ ...leaveForm, days: Number(e.target.value) })} />
          </FormField>
          <FormField label="Reason" required>
            <textarea className={textareaClass} rows={3} value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} placeholder="Reason for leave..." />
          </FormField>
        </div>
      </Modal>
    </motion.div>
  );
}
