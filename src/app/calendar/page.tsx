'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import Modal, { FormField, inputClass, selectClass, textareaClass } from '@/components/ui/Modal';
import useSWR from 'swr';
import { listCalendarEvents, createCalendarEvent, deleteCalendarEvent } from '@/actions/calendar';
import { listUsers } from '@/actions/auth';
import { Plus, ChevronLeft, ChevronRight, Clock, MapPin, Users, CalendarDays, Trash2, AlertCircle } from 'lucide-react';

/** Normalise a Date or ISO string to the local `YYYY-MM-DD` the grid keys on. */
function toDateKey(value: string | Date): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const container = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } };

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EVENT_COLORS: Record<string, string> = { meeting: '#45B7D1', deadline: '#FF6B6B', 'town-hall': '#7C5CFC', review: '#FF8C42', 'one-on-one': '#00D4AA', holiday: '#FFB84D' };

export default function CalendarPage() {
  const { data: rawEvents = [], mutate } = useSWR('calendar_events', () => listCalendarEvents(), {
    refreshInterval: 30000,
  });
  const { data: employees = [] } = useSWR('users', listUsers);

  // Attach the local date key and a colour once, so render stays cheap.
  const calendarEvents = useMemo(
    () => rawEvents.map((e: any) => ({
      ...e,
      dateKey: toDateKey(e.date),
      color: EVENT_COLORS[e.type] ?? '#45B7D1',
    })),
    [rawEvents]
  );

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState<any>({});

  const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  // Build calendar grid
  const calendarGrid = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();
    const cells: { day: number; isCurrentMonth: boolean; dateStr: string }[] = [];

    // Previous month
    for (let i = firstDay - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const m = currentMonth === 0 ? 12 : currentMonth;
      const y = currentMonth === 0 ? currentYear - 1 : currentYear;
      cells.push({ day: d, isCurrentMonth: false, dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, isCurrentMonth: true, dateStr: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    // Next month fill
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const m = currentMonth === 11 ? 1 : currentMonth + 2;
      const y = currentMonth === 11 ? currentYear + 1 : currentYear;
      cells.push({ day: d, isCurrentMonth: false, dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` });
    }
    return cells;
  }, [currentMonth, currentYear]);

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const getEventsForDate = (dateStr: string) => calendarEvents.filter((e: any) => e.dateKey === dateStr);

  const selectedDateEvents = selectedDate ? getEventsForDate(selectedDate) : [];

  const openCreate = () => {
    setForm({ title: '', type: 'meeting', date: selectedDate || todayStr, startTime: '10:00', endTime: '11:00', location: '', attendees: [] });
    setError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.title?.trim()) return;
    setSaving(true); setError('');
    try {
      await createCalendarEvent({
        title: form.title!,
        type: form.type,
        date: form.date!,
        startTime: form.startTime || undefined,
        endTime: form.endTime || undefined,
        location: form.location || undefined,
        attendees: form.attendees ?? [],
      });
      await mutate();
      setShowModal(false);
    } catch (e: any) {
      setError(e?.message ?? 'Could not create event');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    setError('');
    try {
      await deleteCalendarEvent(id);
      await mutate();
    } catch (e: any) {
      setError(e?.message ?? 'Could not delete event');
    }
  };

  const getEmpName = (id: string) => employees.find((e: any) => e.id === id)?.name || id;

  // Stats
  const monthEvents = calendarEvents.filter((e: any) => {
    const d = new Date(e.date);
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Calendar</h1>
          <p className="text-gray-500 text-sm mt-1">Events, meetings & scheduling</p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>New Event</Button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-700 text-sm">
          <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Month Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Meetings', count: monthEvents.filter((e: any) => e.type === 'meeting').length, color: '#45B7D1' },
          { label: 'Deadlines', count: monthEvents.filter((e: any) => e.type === 'deadline').length, color: '#FF6B6B' },
          { label: 'Reviews', count: monthEvents.filter((e: any) => e.type === 'review').length, color: '#FF8C42' },
          { label: 'Total Events', count: monthEvents.length, color: '#7C5CFC' },
        ].map(s => (
          <Card key={s.label} padding="sm">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full" style={{ background: s.color }} />
              <div>
                <p className="text-lg font-bold">{s.count}</p>
                <p className="text-xs text-gray-500">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2">
          <Card variant="default">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <button onClick={prevMonth} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"><ChevronLeft size={16} /></button>
              <h3 className="text-sm font-semibold">{MONTHS[currentMonth]} {currentYear}</h3>
              <button onClick={nextMonth} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors cursor-pointer"><ChevronRight size={16} /></button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {DAYS.map(d => (
                <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7 gap-0.5">
              {calendarGrid.map((cell, i) => {
                const events = getEventsForDate(cell.dateStr);
                const isToday = cell.dateStr === todayStr;
                const isSelected = cell.dateStr === selectedDate;
                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDate(cell.dateStr)}
                    className={`relative h-16 rounded-lg p-1 text-left transition-all cursor-pointer ${
                      !cell.isCurrentMonth ? 'text-gray-300' :
                      isSelected ? 'bg-gray-900 text-white' :
                      isToday ? 'bg-purple-50 text-gray-900 ring-1 ring-purple-300' :
                      'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <span className={`text-xs font-medium ${isToday && !isSelected ? 'text-purple-600' : ''}`}>{cell.day}</span>
                    {events.length > 0 && (
                      <div className="flex gap-0.5 mt-0.5 flex-wrap">
                        {events.slice(0, 3).map((ev: any) => (
                          <div key={ev.id} className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: isSelected ? '#FFF' : ev.color }} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Day Detail */}
        <div>
          <Card variant="default">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">
                {selectedDate ? new Date(selectedDate + 'T00:00').toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' }) : 'Select a date'}
              </h3>
              {selectedDate && (
                <button onClick={openCreate} className="w-6 h-6 rounded-full bg-gray-900 text-white flex items-center justify-center cursor-pointer hover:bg-gray-700 transition-colors">
                  <Plus size={12} />
                </button>
              )}
            </div>
            {selectedDateEvents.length > 0 ? (
              <div className="space-y-3">
                {selectedDateEvents.map((event: any) => (
                  <div key={event.id} className="relative p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                    <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ background: event.color }} />
                    <div className="ml-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-medium">{event.title}</h4>
                        <button onClick={() => handleDelete(event.id)} className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-red-500 cursor-pointer"><Trash2 size={12} /></button>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={10} />{event.startTime} – {event.endTime}</span>
                        {event.location && <span className="text-xs text-gray-500 flex items-center gap-1"><MapPin size={10} />{event.location}</span>}
                      </div>
                      {event.attendees.length > 0 && (
                        <div className="flex items-center gap-1 mt-2">
                          <Users size={10} className="text-gray-400" />
                          <span className="text-[10px] text-gray-400">{event.attendees.map((a: any) => getEmpName(a)).join(', ')}</span>
                        </div>
                      )}
                      <Badge variant={event.type === 'deadline' ? 'danger' : event.type === 'holiday' ? 'warning' : 'default'} size="sm">{event.type}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 text-sm">
                {selectedDate ? 'No events on this day' : 'Click a date to see events'}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Event Create Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Event" description="Add an event to the calendar" size="md" footer={<><Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button><Button onClick={handleSave} disabled={!form.title?.trim() || saving}>{saving ? 'Creating…' : 'Create Event'}</Button></>}>
        <div className="space-y-4">
          <FormField label="Event Title" required>
            <input className={inputClass} value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Event name" />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Type">
              <select className={selectClass} value={form.type || 'meeting'} onChange={e => setForm({ ...form, type: e.target.value })}>
                {['meeting', 'deadline', 'town-hall', 'review', 'one-on-one', 'holiday'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </FormField>
            <FormField label="Date">
              <input type="date" className={inputClass} value={form.date || ''} onChange={e => setForm({ ...form, date: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Time">
              <input type="time" className={inputClass} value={form.startTime || ''} onChange={e => setForm({ ...form, startTime: e.target.value })} />
            </FormField>
            <FormField label="End Time">
              <input type="time" className={inputClass} value={form.endTime || ''} onChange={e => setForm({ ...form, endTime: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Location">
            <input className={inputClass} value={form.location || ''} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Room / Virtual link" />
          </FormField>
          <FormField label="Description">
            <textarea className={textareaClass} rows={2} value={form.description || ''} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description..." />
          </FormField>
        </div>
      </Modal>
    </motion.div>
  );
}
