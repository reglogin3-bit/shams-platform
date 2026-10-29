import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, RotateCcw } from 'lucide-react';
import { Empty, Spinner, StatusBadge, useToast } from '../../components/ui.jsx';
import { api, todayISO } from '../../lib/api.js';

const STATUSES = [
  ['keldi', 'Keldi'],
  ['kechikdi', 'Kechikdi'],
  ['sababli', 'Sababli'],
  ['kelmadi', 'Kelmadi'],
];

export default function Attendance() {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/api/admin/sessions?date=${date}`);
      setSessions(data.sessions || []);
      setActive((prev) => (data.sessions || []).find((item) => item.id === prev?.id) || data.sessions?.[0] || null);
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setLoading(false);
    }
  }, [date, toast]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadRows = useCallback(async () => {
    if (!active) {
      setRows([]);
      return;
    }
    try {
      const data = await api(`/api/admin/sessions/${active.id}/attendance`);
      setRows(data.rows || []);
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  }, [active, toast]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const mark = async (userId, status) => {
    try {
      await api('/api/admin/attendance/manual', {
        method: 'POST',
        body: { sessionId: active.id, userId, status },
      });
      setRows((prev) => prev.map((row) => (row.id === userId ? { ...row, status, method: 'manual' } : row)));
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  };

  const reopen = async () => {
    try {
      await api(`/api/admin/sessions/${active.id}/reopen`, { method: 'POST' });
      toast.push('Oyna 30 daqiqaga qayta ochildi', 'ok');
      loadSessions();
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Davomat</h1>
          <p>Sessiya holati, qo‘lda belgilash va hisobotga eksport.</p>
        </div>
        <div className="row">
          <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} style={{ width: 'auto' }} />
          <a className="btn btn-sm" href={`/api/admin/export?type=attendance&from=${date}&to=${date}`}>
            CSV yuklab olish
          </a>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '300px minmax(0,1fr)', alignItems: 'start' }}>
        <div className="card card-tight">
          <div className="row-between">
            <span className="tiny">Sessiyalar</span>
            {loading && <Spinner />}
          </div>
          <div className="grid" style={{ gap: 6, marginTop: 10 }}>
            {sessions.map((session) => (
              <button
                key={session.id}
                className="result"
                style={{ borderColor: active?.id === session.id ? 'var(--amber)' : undefined }}
                onClick={() => setActive(session)}
              >
                <span>
                  <b style={{ fontSize: 13.5 }}>{session.group_name}</b>
                  <span className="tiny" style={{ display: 'block' }}>
                    {String(session.starts_at).slice(11, 16)}–{String(session.closes_at).slice(11, 16)} · {session.present}/{session.total}
                  </span>
                </span>
                <StatusBadge status={session.status} />
              </button>
            ))}
            {sessions.length === 0 && <Empty>Bu sanada sessiya yo‘q.</Empty>}
          </div>
        </div>

        <div className="card">
          {!active ? (
            <Empty>Guruhni tanlang.</Empty>
          ) : (
            <>
              <div className="row-between">
                <div>
                  <h3 style={{ fontSize: 17 }}>{active.group_name}</h3>
                  <p className="tiny">
                    <CalendarClock size={12} /> {active.date} · {String(active.starts_at).slice(11, 16)} – {String(active.closes_at).slice(11, 16)}
                  </p>
                </div>
                <div className="row">
                  <StatusBadge status={active.status} />
                  <button className="btn btn-sm" onClick={reopen}>
                    <RotateCcw size={14} /> Qayta ochish
                  </button>
                </div>
              </div>

              <table className="tbl" style={{ marginTop: 14 }}>
                <thead>
                  <tr>
                    <th>O‘quvchi</th>
                    <th>Kirgan</th>
                    <th>Chiqqan</th>
                    <th>Holat</th>
                    <th style={{ textAlign: 'right' }}>Belgilash</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id}>
                      <td><b style={{ fontSize: 14 }}>{row.full_name}</b></td>
                      <td className="mono small">{row.check_in ? row.check_in.slice(11, 16) : '—'}</td>
                      <td className="mono small">{row.check_out ? row.check_out.slice(11, 16) : '—'}</td>
                      <td><StatusBadge status={row.status || 'kelmadi'} /></td>
                      <td>
                        <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                          {STATUSES.map(([value, label]) => (
                            <button
                              key={value}
                              className={`btn btn-sm ${row.status === value ? 'btn-ink' : ''}`}
                              onClick={() => mark(row.id, value)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length === 0 && <Empty>Bu guruhda o‘quvchi yo‘q.</Empty>}
            </>
          )}
        </div>
      </div>
    </>
  );
}
