import React, { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, UserCog } from 'lucide-react';
import { Empty, Field, Modal, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';

export default function Teachers() {
  const toast = useToast();
  const [teachers, setTeachers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [limits, setLimits] = useState({ max_award: 5, daily: 30 });
  const [form, setForm] = useState(null);
  const [passwordFor, setPasswordFor] = useState(null);

  const load = useCallback(async () => {
    try {
      const [data, groupData] = await Promise.all([api('/api/admin/teachers'), api('/api/admin/groups')]);
      setTeachers(data.teachers || []);
      setLimits(data.limits || { max_award: 5, daily: 30 });
      setGroups(groupData.groups || []);
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Ustozlar</h1>
          <p>
            Har bir ustoz faqat o‘z guruhiga token bera oladi: bir martada {limits.max_award} ta,
            kuniga {limits.daily} ta.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm({})}>
          <Plus size={16} /> Ustoz qo‘shish
        </button>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table className="tbl">
          <thead>
            <tr>
              <th>Ustoz</th>
              <th>Login</th>
              <th>Guruhlari</th>
              <th>Bugun bergan</th>
              <th style={{ textAlign: 'right' }}>Amallar</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((teacher) => (
              <tr key={teacher.id}>
                <td><b style={{ fontSize: 14 }}>{teacher.full_name}</b></td>
                <td className="mono small">{teacher.username}</td>
                <td className="small">{teacher.groups.join(', ') || '—'}</td>
                <td className="mono small">{teacher.given_today}</td>
                <td>
                  <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button className="btn btn-sm" onClick={() => setForm(teacher)}>
                      <UserCog size={14} /> Tahrir
                    </button>
                    <button className="btn btn-sm" onClick={() => setPasswordFor(teacher)}>
                      <KeyRound size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {teachers.length === 0 && <Empty>Ustoz qo‘shilmagan.</Empty>}
      </div>

      {form && (
        <TeacherForm
          teacher={form}
          groups={groups}
          onClose={() => setForm(null)}
          onDone={load}
        />
      )}
      {passwordFor && <PasswordForm teacher={passwordFor} onClose={() => setPasswordFor(null)} />}
    </>
  );
}

function TeacherForm({ teacher, groups, onClose, onDone }) {
  const toast = useToast();
  const isNew = !teacher.id;
  const [form, setForm] = useState({
    full_name: teacher.full_name || '',
    username: teacher.username || '',
    password: '',
    groups: groups.filter((group) => teacher.groups?.includes(group.name)).map((group) => group.id),
    is_active: teacher.is_active !== false,
  });
  const [busy, setBusy] = useState(false);

  const toggleGroup = (id) => {
    setForm((prev) => ({
      ...prev,
      groups: prev.groups.includes(id) ? prev.groups.filter((item) => item !== id) : [...prev.groups, id],
    }));
  };

  const save = async () => {
    setBusy(true);
    try {
      if (isNew) {
        await api('/api/admin/teachers', { method: 'POST', body: form });
        toast.push('Ustoz qo‘shildi', 'ok');
      } else {
        await api(`/api/admin/teachers/${teacher.id}`, {
          method: 'PATCH',
          body: { groups: form.groups, is_active: form.is_active, ...(form.password ? { password: form.password } : {}) },
        });
        toast.push('Yangilandi', 'ok');
      }
      onDone();
      onClose();
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={isNew ? 'Yangi ustoz' : `Tahrirlash — ${teacher.full_name}`}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>Saqlash</button>
        </>
      )}
    >
      <Field label="To‘liq ism">
        <input
          className="input"
          value={form.full_name}
          onChange={(event) => setForm((prev) => ({ ...prev, full_name: event.target.value }))}
          disabled={!isNew}
        />
      </Field>
      <div className="grid grid-2">
        <Field label="Login">
          <input
            className="input"
            value={form.username}
            onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
            disabled={!isNew}
          />
        </Field>
        <Field label={isNew ? 'Parol (min 8)' : 'Yangi parol (ixtiyoriy)'}>
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
          />
        </Field>
      </div>
      <Field label="Guruhlar">
        <div className="row wrap" style={{ gap: 6 }}>
          {groups.map((group) => (
            <button
              key={group.id}
              type="button"
              className={`btn btn-sm ${form.groups.includes(group.id) ? 'btn-primary' : ''}`}
              onClick={() => toggleGroup(group.id)}
            >
              {group.name}
            </button>
          ))}
        </div>
      </Field>
      {!isNew && (
        <label className="check">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
          />
          <span>Faol ( kirishga ruxsat )</span>
        </label>
      )}
    </Modal>
  );
}

function PasswordForm({ teacher, onClose }) {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/teachers/${teacher.id}`, { method: 'PATCH', body: { password } });
      toast.push('Parol yangilandi — eski sessiyalar yopildi', 'ok');
      onClose();
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Parol — ${teacher.full_name}`}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || password.length < 8}>Saqlash</button>
        </>
      )}
    >
      <Field label="Yangi parol">
        <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      </Field>
    </Modal>
  );
}
