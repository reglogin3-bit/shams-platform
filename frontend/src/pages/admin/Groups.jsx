import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Plus, Settings2, UserPlus, X } from 'lucide-react';
import { Empty, Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';

const DAYS = ['Du', 'Se', 'Cho', 'Pay', 'Ju', 'Sha', 'Ya'];

export default function Groups() {
  const toast = useToast();
  const [groups, setGroups] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [members, setMembers] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/admin/groups');
      setGroups(data.groups || []);
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  }, [toast]);

  useEffect(() => {
    load();
    api('/api/admin/teachers').then((data) => setTeachers(data.teachers || [])).catch(() => {});
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Guruhlar</h1>
          <p>Jadval davomat oynasini belgilaydi: dars vaqti + 3 soat.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({})}>
          <Plus size={16} /> Yangi guruh
        </button>
      </div>

      {groups.length === 0 && <div className="card"><Empty>Guruh yo‘q. Birinchi guruhni qo‘shing.</Empty></div>}

      <div className="grid grid-2">
        {groups.map((group) => (
          <div key={group.id} className="card">
            <div className="row-between">
              <div>
                <h3 style={{ fontSize: 18 }}>{group.name}</h3>
                <p className="tiny">
                  {group.teacher_name || 'ustoz biriktirilmagan'} · {group.room || 'xona yo‘q'}
                </p>
              </div>
              <span className={`badge ${group.is_active ? 'badge-ok' : ''}`}>
                {group.is_active ? 'faol' : 'arxiv'}
              </span>
            </div>

            <div className="row wrap" style={{ marginTop: 12, gap: 6 }}>
              {(group.weekdays || '').split(',').filter(Boolean).map((day) => (
                <span key={day} className="badge">{DAYS[Number(day)] || day}</span>
              ))}
              <span className="badge badge-info"><CalendarDays size={12} /> {group.start_time}</span>
              <span className="badge">{group.duration_min} daq.</span>
              <span className="badge">{group.members} bola</span>
            </div>

            <div className="row" style={{ marginTop: 14, gap: 8 }}>
              <button className="btn btn-sm" onClick={() => setEditing(group)}>
                <Settings2 size={14} /> Tahrirlash
              </button>
              <button className="btn btn-sm" onClick={() => setMembers(group)}>
                <UserPlus size={14} /> A’zolar
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <GroupForm
          group={editing}
          teachers={teachers}
          onClose={() => setEditing(null)}
          onDone={load}
        />
      )}
      {members && <Members group={members} onClose={() => setMembers(null)} onDone={load} />}
    </>
  );
}

function GroupForm({ group, teachers, onClose, onDone }) {
  const toast = useToast();
  const isNew = !group.id;
  const [form, setForm] = useState({
    name: group.name || '',
    teacher_id: group.teacher_id || '',
    weekdays: group.weekdays || '0,2,4',
    start_time: group.start_time || '09:00',
    duration_min: group.duration_min || 90,
    room: group.room || '',
    is_active: group.is_active !== 0,
  });
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const toggleDay = (index) => {
    const list = form.weekdays.split(',').filter(Boolean).map(Number);
    const next = list.includes(index) ? list.filter((day) => day !== index) : [...list, index];
    setForm((prev) => ({ ...prev, weekdays: next.sort().join(',') }));
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        ...form,
        teacher_id: form.teacher_id ? Number(form.teacher_id) : null,
        duration_min: Number(form.duration_min),
      };
      if (isNew) await api('/api/admin/groups', { method: 'POST', body: payload });
      else await api(`/api/admin/groups/${group.id}`, { method: 'PATCH', body: payload });
      toast.push('Saqlandi', 'ok');
      onDone();
      onClose();
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const selectedDays = form.weekdays.split(',').filter(Boolean).map(Number);

  return (
    <Modal
      title={isNew ? 'Yangi guruh' : `Tahrirlash — ${group.name}`}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || !form.name}>Saqlash</button>
        </>
      )}
    >
      <Field label="Nomi">
        <input className="input" value={form.name} onChange={set('name')} placeholder="1-guruh" />
      </Field>
      <div className="grid grid-2">
        <Field label="Ustoz">
          <select className="input" value={form.teacher_id} onChange={set('teacher_id')}>
            <option value="">—</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>{teacher.full_name}</option>
            ))}
          </select>
        </Field>
        <Field label="Xona">
          <input className="input" value={form.room} onChange={set('room')} />
        </Field>
      </div>
      <Field label="Dars kunlari">
        <div className="row wrap" style={{ gap: 6 }}>
          {DAYS.map((day, index) => (
            <button
              key={day}
              className={`btn btn-sm ${selectedDays.includes(index) ? 'btn-primary' : ''}`}
              onClick={() => toggleDay(index)}
              type="button"
            >
              {day}
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-2">
        <Field label="Boshlanish vaqti">
          <input className="input" type="time" value={form.start_time} onChange={set('start_time')} />
        </Field>
        <Field label="Davomiyligi (daqiqa)">
          <input className="input" type="number" min={30} step={15} value={form.duration_min} onChange={set('duration_min')} />
        </Field>
      </div>
      <label className="check">
        <input type="checkbox" checked={form.is_active} onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))} />
        <span>Faol guruh</span>
      </label>
      <p className="tiny">Davomat oynasi: boshlanishdan 15 daqiqa oldin ochiladi va 3 soatdan keyin yopiladi.</p>
    </Modal>
  );
}

function Members({ group, onClose, onDone }) {
  const toast = useToast();
  const [roster, setRoster] = useState([]);
  const [all, setAll] = useState([]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    const [sessions, students] = await Promise.all([
      api(`/api/admin/sessions?date=${new Date().toISOString().slice(0, 10)}`).catch(() => ({ sessions: [] })),
      api('/api/admin/students').catch(() => ({ students: [] })),
    ]);
    const data = await api(`/api/admin/groups`).catch(() => ({ groups: [] }));
    const current = (data.groups || []).find((item) => item.id === group.id);
    const ids = new Set();
    // a'zolarni alohida endpoint orqali olamiz
    const memberRows = (students.students || []).filter((student) =>
      (student.groups || []).some((item) => item.id === group.id));
    memberRows.forEach((row) => ids.add(row.id));
    setRoster(memberRows);
    setAll(students.students || []);
    return { current, sessions };
  }, [group.id]);

  useEffect(() => {
    load().catch(() => {});
  }, [load]);

  const add = async (student) => {
    try {
      await api(`/api/admin/groups/${group.id}/members`, { method: 'POST', body: { user_id: student.id } });
      setRoster((prev) => [...prev, student]);
      toast.push(`${student.full_name} qo‘shildi`, 'ok');
      onDone();
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  };

  const remove = async (student) => {
    try {
      await api(`/api/admin/groups/${group.id}/members/${student.id}`, { method: 'DELETE' });
      setRoster((prev) => prev.filter((item) => item.id !== student.id));
      onDone();
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  };

  const candidates = all
    .filter((student) => !roster.some((item) => item.id === student.id))
    .filter((student) => !query || student.full_name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  return (
    <Modal title={`A’zolar — ${group.name}`} onClose={onClose} width={560}>
      <div className="row-between">
        <span className="tiny">Guruhda {roster.length} bola</span>
      </div>
      <div className="grid" style={{ gap: 6 }}>
        {roster.map((student) => (
          <div key={student.id} className="result" style={{ cursor: 'default' }}>
            <span>{student.full_name}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => remove(student)}><X size={14} /></button>
          </div>
        ))}
        {roster.length === 0 && <Empty>Hali a’zo yo‘q.</Empty>}
      </div>

      <Field label="O‘quvchi qo‘shish">
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ism bo‘yicha qidirish" />
      </Field>
      <div className="grid" style={{ gap: 6 }}>
        {candidates.map((student) => (
          <button key={student.id} className="result" onClick={() => add(student)}>
            <span>{student.full_name}</span>
            <span className="badge badge-ok">qo‘shish</span>
          </button>
        ))}
        {candidates.length === 0 && <p className="tiny">Nomzod topilmadi.</p>}
      </div>
    </Modal>
  );
}
