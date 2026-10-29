import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Coins, LogOut, Search, Users } from 'lucide-react';
import { Empty, Spinner, StatusBadge, useToast } from '../components/ui.jsx';
import { api } from '../lib/api.js';

export default function Teacher() {
  const navigate = useNavigate();
  const toast = useToast();
  const [me, setMe] = useState(undefined);
  const [data, setData] = useState(null);
  const [group, setGroup] = useState('');
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState('');
  const [session, setSession] = useState(null);
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    api('/api/auth/me')
      .then((res) => {
        if (!res.user) return navigate('/login', { replace: true });
        if (res.user.role !== 'teacher') return navigate('/admin', { replace: true });
        setMe(res.user);
        return null;
      })
      .catch(() => navigate('/login', { replace: true }));
  }, [navigate]);

  const load = useCallback(async () => {
    try {
      const overview = await api('/api/teacher/overview');
      setData(overview);
      const first = overview.groups[0];
      if (first && !group) {
        setGroup(first.id);
        setSession(first.session);
      }
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  }, [group, toast]);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  useEffect(() => {
    if (!group) return;
    const params = new URLSearchParams({ group });
    if (query) params.set('q', query);
    api(`/api/teacher/students?${params.toString()}`)
      .then((res) => setStudents(res.students || []))
      .catch(() => setStudents([]));
    const current = data?.groups.find((item) => item.id === group);
    setSession(current?.session || null);
  }, [group, query, data]);

  useEffect(() => {
    if (!session) {
      setRows([]);
      return;
    }
    api(`/api/teacher/session/${session.id}`)
      .then((res) => setRows(res.rows || []))
      .catch(() => setRows([]));
  }, [session]);

  const give = async (student, amount) => {
    setBusyId(student.id);
    try {
      const res = await api('/api/teacher/coins', {
        method: 'POST',
        body: { studentId: student.id, amount, reason: 'Ustoz tokeni' },
      });
      toast.push(`${student.full_name}: +${res.granted} coin`, 'ok');
      setStudents((prev) => prev.map((item) => (item.id === student.id ? { ...item, coins: res.balance } : item)));
      load();
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusyId(null);
    }
  };

  const mark = async (userId, status) => {
    if (!session) return;
    try {
      await api('/api/admin/attendance/manual', {
        method: 'POST',
        body: { sessionId: session.id, userId, status },
      });
      setRows((prev) => prev.map((row) => (row.id === userId ? { ...row, status } : row)));
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  };

  if (me === undefined || !data) {
    return <div className="login-wrap"><Spinner label="Yuklanmoqda…" /></div>;
  }

  const used = data.given_today || 0;
  const left = Math.max(0, (data.daily_limit || 0) - used);

  return (
    <div className="shell" style={{ gridTemplateColumns: '1fr' }}>
      <main className="main">
        <div className="page-head">
          <div>
            <h1>Ustoz paneli</h1>
            <p>{me.full_name} · bugun berilgan token: {used} / {data.daily_limit} (qoldi {left})</p>
          </div>
          <div className="row">
            <a className="btn btn-sm" href="/kiosk" target="_blank" rel="noreferrer">Kiosk</a>
            <button
              className="btn btn-sm"
              onClick={async () => {
                await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
                navigate('/login', { replace: true });
              }}
            >
              <LogOut size={14} /> Chiqish
            </button>
          </div>
        </div>

        <div className="row wrap" style={{ gap: 6, marginBottom: 14 }}>
          {data.groups.map((item) => (
            <button key={item.id} className={`btn btn-sm ${group === item.id ? 'btn-ink' : ''}`} onClick={() => setGroup(item.id)}>
              {item.name}
              <span className="badge" style={{ marginLeft: 6 }}>{item.present}/{item.members}</span>
            </button>
          ))}
          {data.groups.length === 0 && <span className="badge badge-warn">Sizga guruh biriktirilmagan</span>}
        </div>

        <div className="grid" style={{ gridTemplateColumns: 'minmax(0,1.1fr) minmax(0,0.9fr)', alignItems: 'start' }}>
          <div className="card">
            <div className="row-between">
              <h3 style={{ fontSize: 16 }}><Users size={16} /> O‘quvchilar</h3>
              <div className="row" style={{ gap: 6 }}>
                <Search size={15} className="muted" />
                <input className="input" style={{ width: 170 }} placeholder="Qidirish" value={query} onChange={(event) => setQuery(event.target.value)} />
              </div>
            </div>

            <div className="grid" style={{ gap: 6, marginTop: 12 }}>
              {students.map((student) => (
                <div key={student.id} className="result" style={{ cursor: 'default' }}>
                  <div>
                    <b style={{ fontSize: 14 }}>{student.full_name}</b>
                    <div className="tiny">{student.coins} coin</div>
                  </div>
                  <div className="row" style={{ gap: 4 }}>
                    {[1, 2, 3].map((amount) => (
                      <button
                        key={amount}
                        className="btn btn-sm"
                        disabled={busyId === student.id || left <= 0}
                        onClick={() => give(student, amount)}
                      >
                        +{amount}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {students.length === 0 && <Empty>O‘quvchi yo‘q.</Empty>}
            </div>
          </div>

          <div className="card">
            <div className="row-between">
              <h3 style={{ fontSize: 16 }}>Bugungi davomat</h3>
              {session ? <StatusBadge status={session.status} /> : <span className="badge">dars yo‘q</span>}
            </div>
            {session && (
              <p className="tiny" style={{ marginTop: 4 }}>
                {String(session.starts_at).slice(11, 16)} – {String(session.closes_at).slice(11, 16)}
              </p>
            )}
            <div className="grid" style={{ gap: 6, marginTop: 12, maxHeight: 460, overflow: 'auto' }}>
              {rows.map((row) => (
                <div key={row.id} className="row-between" style={{ borderBottom: '1px solid #f1ead9', paddingBottom: 6 }}>
                  <div>
                    <b style={{ fontSize: 13.5 }}>{row.full_name}</b>
                    <div className="tiny">{row.check_in ? row.check_in.slice(11, 16) : 'belgilanmagan'}</div>
                  </div>
                  <div className="row" style={{ gap: 3 }}>
                    <button className={`btn btn-sm ${row.status === 'keldi' ? 'btn-ink' : ''}`} onClick={() => mark(row.id, 'keldi')}>K</button>
                    <button className={`btn btn-sm ${row.status === 'kechikdi' ? 'btn-ink' : ''}`} onClick={() => mark(row.id, 'kechikdi')}>Ke</button>
                    <button className={`btn btn-sm ${row.status === 'kelmadi' ? 'btn-ink' : ''}`} onClick={() => mark(row.id, 'kelmadi')}>Yo</button>
                  </div>
                </div>
              ))}
              {rows.length === 0 && <Empty>Sessiya topilmadi.</Empty>}
            </div>
          </div>
        </div>

        <div className="card card-tight" style={{ marginTop: 14 }}>
          <div className="row" style={{ gap: 8 }}>
            <Coins size={15} color="var(--amber-deep)" />
            <span className="small">
              Har bir berish {data.max_award} coindan oshmaydi. Kunlik limit {data.daily_limit} coin.
              Barcha amallar audit jurnalida qayd etiladi.
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
