import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Camera, Coins, Plus, ScanFace, Search, Trash2 } from 'lucide-react';
import CameraView from '../../components/Camera.jsx';
import { Empty, Field, Modal, Spinner, useToast } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';

export default function Students() {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [groups, setGroups] = useState([]);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [faceTarget, setFaceTarget] = useState(null);
  const [coinTarget, setCoinTarget] = useState(null);
  const [historyTarget, setHistoryTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (groupFilter) params.set('group', groupFilter);
      const data = await api(`/api/admin/students?${params.toString()}`);
      setRows(data.students || []);
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setLoading(false);
    }
  }, [query, groupFilter, toast]);

  useEffect(() => {
    const timer = setTimeout(load, 260);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    api('/api/admin/groups').then((data) => setGroups(data.groups || [])).catch(() => {});
  }, []);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>O‘quvchilar</h1>
          <p>Face ID ro‘yxatga olish, guruhlar, coinlar va ma’lumotni o‘chirish.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
          <Plus size={16} /> Yangi o‘quvchi
        </button>
      </div>

      <div className="card card-tight" style={{ marginBottom: 14 }}>
        <div className="row wrap">
          <div className="row" style={{ gap: 8, flex: 1, minWidth: 220 }}>
            <Search size={16} className="muted" />
            <input
              className="input"
              placeholder="Ism bo‘yicha qidirish…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select className="input" style={{ width: 'auto' }} value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)}>
            <option value="">Barcha guruhlar</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>{group.name}</option>
            ))}
          </select>
          <span className="badge">{rows.length} ta</span>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 24 }}><Spinner label="Yuklanmoqda…" /></div>
        ) : rows.length === 0 ? (
          <Empty>O‘quvchi topilmadi. «Yangi o‘quvchi» tugmasidan boshlang.</Empty>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>O‘quvchi</th>
                <th>Guruh</th>
                <th>Coin</th>
                <th>Face ID</th>
                <th style={{ textAlign: 'right' }}>Amallar</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: '50%', overflow: 'hidden', background: '#f1ebdd',
                        display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0,
                      }}>
                        {row.has_photo
                          ? <img src={`/api/admin/students/${row.id}/photo`} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (row.first_name || row.full_name).slice(0, 1)}
                      </div>
                      <div>
                        <b style={{ fontSize: 14 }}>{row.full_name}</b>
                        <div className="tiny">{row.parent_phone || 'ota-ona tel. yo‘q'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="small">{row.group_names || '—'}</td>
                  <td><span className="coin-pill" style={{ fontSize: 12 }}><span className="coin-dot" /> {row.coins}</span></td>
                  <td>
                    {row.has_face
                      ? <span className="badge badge-ok">{row.face_count} namuna</span>
                      : <span className="badge badge-warn">yo‘q</span>}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                      <button className="btn btn-sm" onClick={() => setFaceTarget(row)}>
                        <ScanFace size={14} /> Yuz
                      </button>
                      <button className="btn btn-sm" onClick={() => setCoinTarget(row)}>
                        <Coins size={14} />
                      </button>
                      <button className="btn btn-sm" onClick={() => setHistoryTarget(row)}>Tarix</button>
                      <button className="btn btn-sm btn-danger" onClick={() => setDeleteTarget(row)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {addOpen && <AddStudent groups={groups} onClose={() => setAddOpen(false)} onDone={load} />}
      {faceTarget && <FaceEnroll student={faceTarget} onClose={() => setFaceTarget(null)} onDone={load} />}
      {coinTarget && <GiveCoins student={coinTarget} onClose={() => setCoinTarget(null)} onDone={load} />}
      {historyTarget && <History student={historyTarget} onClose={() => setHistoryTarget(null)} />}
      {deleteTarget && (
        <DeleteStudent student={deleteTarget} onClose={() => setDeleteTarget(null)} onDone={load} />
      )}
    </>
  );
}

/* ── yangi o'quvchi ─────────────────────────────────────────── */

function AddStudent({ groups, onClose, onDone }) {
  const toast = useToast();
  const [form, setForm] = useState({
    full_name: '', birth_date: '', parent_name: '', parent_phone: '', group_id: groups[0]?.id || '',
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      const data = await api('/api/admin/students', { method: 'POST', body: { ...form, consent } });
      toast.push(`${data.student.full_name} qo‘shildi — endi yuzni ro‘yxatga oling`, 'ok');
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
      title="Yangi o‘quvchi"
      onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !consent || form.full_name.split(' ').length < 2}>
            Saqlash
          </button>
        </>
      )}
    >
      <Field label="Ism va familiya">
        <input className="input" value={form.full_name} onChange={set('full_name')} placeholder="Aziza Karimova" />
      </Field>
      <div className="grid grid-2">
        <Field label="Tug‘ilgan sana">
          <input className="input" type="date" value={form.birth_date} onChange={set('birth_date')} />
        </Field>
        <Field label="Guruh">
          <select className="input" value={form.group_id} onChange={set('group_id')}>
            <option value="">Guruhsiz</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-2">
        <Field label="Ota-ona ismi">
          <input className="input" value={form.parent_name} onChange={set('parent_name')} />
        </Field>
        <Field label="Ota-ona telefoni">
          <input className="input" value={form.parent_phone} onChange={set('parent_phone')} placeholder="+998 90 123 45 67" />
        </Field>
      </div>

      <label className="check" style={{ background: '#fff8e9', padding: 12, borderRadius: 12, border: '1px solid #f0d19a' }}>
        <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
        <span>
          <b>Ota-ona (vasiy) roziligi olindi.</b> Yuz biometriyasi faqat davomat uchun ishlatiladi,
          uchinchi shaxslarga berilmaydi va o‘quvchi o‘chirilganda butunlay yo‘q qilinadi.
        </span>
      </label>
    </Modal>
  );
}

/* ── yuzni ro'yxatga olish ──────────────────────────────────── */

function FaceEnroll({ student, onClose, onDone }) {
  const toast = useToast();
  const videoRef = useRef(null);
  const faceRef = useRef(null);
  const [samples, setSamples] = useState([]);
  const [status, setStatus] = useState('Kamerani yoqing va yuzni oval ichiga tuting.');
  const [busy, setBusy] = useState(false);

  const onFace = useCallback((face) => {
    faceRef.current = face;
  }, []);

  const capture = () => {
    const face = faceRef.current;
    if (!face) {
      setStatus('Yuz topilmadi — yorug‘likni yaxshilang.');
      return;
    }
    if (face.score < 0.62) {
      setStatus('Sifat past — kameraga yaqinroq keling.');
      return;
    }
    if (face.box.width < 120) {
      setStatus('Yuz kichik — bir qadam yaqinlashing.');
      return;
    }
    setSamples((prev) => [...prev.slice(0, 5), face.descriptor]);
    setStatus(`Namuna ${Math.min(samples.length + 1, 6)} olindi. Boshni biroz burib yana oling.`);
  };

  const save = async () => {
    if (samples.length < 3) {
      toast.push('Kamida 3 ta namuna kerak', 'bad');
      return;
    }
    setBusy(true);
    try {
      let photo = '';
      const video = videoRef.current;
      if (video && video.videoWidth) {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = Math.round((video.videoHeight / video.videoWidth) * 320);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        photo = canvas.toDataURL('image/jpeg', 0.72);
      }
      const data = await api(`/api/admin/students/${student.id}/face`, {
        method: 'POST',
        body: { descriptors: samples, photo },
      });
      toast.push(`Saqlandi: ${data.samples} namuna (tarqoqlik ${data.spread})`, 'ok');
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
      title={`Face ID — ${student.full_name}`}
      onClose={onClose}
      width={620}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          <button className="btn" onClick={capture}><Camera size={15} /> Namuna olish</button>
          <button className="btn btn-primary" onClick={save} disabled={busy || samples.length < 3}>
            Saqlash ({samples.length}/3)
          </button>
        </>
      )}
    >
      <CameraView videoRef={videoRef} onFace={onFace} hint="Yuzni oval ichida tuting" />
      <p className="small muted">{status}</p>
      <div className="row" style={{ gap: 6 }}>
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className={`badge ${index < samples.length ? 'badge-ok' : ''}`}
            style={{ flex: 1, justifyContent: 'center' }}
          >
            {index < samples.length ? '✓' : index + 1}
          </span>
        ))}
      </div>
      <p className="tiny">
        Maslahat: 3–5 namuna, har birida boshni ozgina buring. Ko‘zoynak va niqob yuzni tanib
        bo‘lmaydigan qiladi.
      </p>
    </Modal>
  );
}

/* ── coin berish ────────────────────────────────────────────── */

function GiveCoins({ student, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState(2);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      const data = await api(`/api/admin/students/${student.id}/coins`, {
        method: 'POST',
        body: { amount, reason },
      });
      toast.push(`+${data.granted} coin · balans ${data.balance}`, 'ok');
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
      title={`Coin berish — ${student.full_name}`}
      onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          <button className="btn btn-primary" onClick={send} disabled={busy}>Berish</button>
        </>
      )}
    >
      <div className="row wrap">
        {[1, 2, 3, 5, 10].map((value) => (
          <button key={value} className={`btn btn-sm ${amount === value ? 'btn-primary' : ''}`} onClick={() => setAmount(value)}>
            +{value}
          </button>
        ))}
      </div>
      <Field label="Miqdor">
        <input className="input" type="number" min={1} value={amount} onChange={(event) => setAmount(Number(event.target.value))} />
      </Field>
      <Field label="Sabab" hint="Kunlik limit va cooldown serverda tekshiriladi.">
        <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Faol ishtirok" />
      </Field>
      <p className="small muted">Joriy balans: {student.coins} coin</p>
    </Modal>
  );
}

/* ── tarix ──────────────────────────────────────────────────── */

function History({ student, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    api(`/api/admin/students/${student.id}/history`).then(setData).catch(() => setData({ error: true }));
  }, [student.id]);

  return (
    <Modal title={`Tarix — ${student.full_name}`} onClose={onClose} width={680}>
      {!data && <Spinner />}
      {data?.error && <Empty>Yuklanmadi.</Empty>}
      {data && !data.error && (
        <>
          <div className="row-between">
            <span className="tiny">Davr: {data.coins.term_start} — {data.coins.term_end}</span>
            <span className="coin-pill"><span className="coin-dot" /> {data.coins.balance}</span>
          </div>
          <h4 style={{ fontSize: 14 }}>Coin harakati</h4>
          {(data.wallet || []).slice(0, 12).map((row) => (
            <div key={row.id} className="row-between small" style={{ borderBottom: '1px solid #f1ead9', paddingBottom: 5 }}>
              <span>{row.reason} <span className="tiny">{row.created_at.slice(5, 16)}</span></span>
              <b className="mono" style={{ color: row.coin_delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                {row.coin_delta > 0 ? '+' : ''}{row.coin_delta}
              </b>
            </div>
          ))}
          {(data.wallet || []).length === 0 && <p className="small muted">Coin tarixi yo‘q.</p>}

          <h4 style={{ fontSize: 14, marginTop: 8 }}>Davomat</h4>
          {(data.attendance || []).slice(0, 14).map((row, index) => (
            <div key={`${row.date}-${index}`} className="row-between small" style={{ borderBottom: '1px solid #f1ead9', paddingBottom: 5 }}>
              <span>{row.date} · {row.group_name}</span>
              <span className="badge">{row.status}</span>
            </div>
          ))}
          {(data.attendance || []).length === 0 && <p className="small muted">Davomat yozuvi yo‘q.</p>}
        </>
      )}
    </Modal>
  );
}

/* ── o'chirish ──────────────────────────────────────────────── */

function DeleteStudent({ student, onClose, onDone }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/admin/students/${student.id}`, { method: 'DELETE' });
      toast.push('Barcha ma’lumot o‘chirildi', 'ok');
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
      title="Ma’lumotni o‘chirish"
      onClose={onClose}
      footer={(
        <>
          <button className="btn" onClick={onClose}>Bekor</button>
          <button className="btn btn-danger" onClick={remove} disabled={busy || text !== 'O‘CHIRISH'}>
            Butunlay o‘chirish
          </button>
        </>
      )}
    >
      <div className="row" style={{ gap: 8, background: 'var(--red-soft)', padding: 12, borderRadius: 12 }}>
        <AlertTriangle size={18} color="var(--red)" />
        <p className="small">
          <b>{student.full_name}</b> ning yuz ma’lumoti, rasmi, davomati va coin tarixi butunlay
          o‘chadi. Bu amalni qaytarib bo‘lmaydi.
        </p>
      </div>
      <Field label="Tasdiqlash uchun «O‘CHIRISH» so‘zini yozing">
        <input className="input" value={text} onChange={(event) => setText(event.target.value)} />
      </Field>
    </Modal>
  );
}
