import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Empty, Field, Stat, useToast } from '../../components/ui.jsx';
import { api, todayISO } from '../../lib/api.js';

export default function CoinsPage() {
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [overview, setOverview] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api('/api/admin/settings'), api('/api/admin/overview')])
      .then(([settings, stats]) => {
        const s = settings.settings;
        setForm({
          coin_present: s.coin_present ?? '2',
          coin_late: s.coin_late ?? '1',
          daily_limit_student: s.daily_limit_student ?? '12',
          teacher_daily_limit: s.teacher_daily_limit ?? '30',
          teacher_max_award: s.teacher_max_award ?? '5',
          award_cooldown_min: s.award_cooldown_min ?? '2',
          term_name: s.term_name || '',
          term_start: s.term_start || '',
          term_end: s.term_end || '',
        });
        setOverview(stats);
      })
      .catch((error) => toast.push(error.message, 'bad'));
  }, [toast]);

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/admin/settings', { method: 'PATCH', body: form });
      toast.push('Coin qoidalari saqlandi', 'ok');
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <Empty>Yuklanmoqda…</Empty>;

  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Coin qoidalari</h1>
          <p>Davomat uchun avtomatik coin, kunlik limitlar va hisob davri (termin).</p>
        </div>
        <div className="row">
          <a className="btn btn-sm" href={`/api/admin/export?type=coins&from=${todayISO()}&to=${todayISO()}`}>
            Bugungi CSV
          </a>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            <Save size={15} /> Saqlash
          </button>
        </div>
      </div>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        <Stat label="Jami berilgan" value={overview?.coins?.issued ?? 0} />
        <Stat label="Sarflangan" value={overview?.coins?.spent ?? 0} />
        <Stat label="Muomaladagi qoldiq" value={overview?.coins?.balance ?? 0} />
      </div>

      <div className="grid grid-2">
        <div className="card">
          <h3 style={{ fontSize: 16 }}>Avtomatik coin</h3>
          <p className="tiny" style={{ marginBottom: 10 }}>Face ID bilan davomat belgilanganda avtomatik qo‘shiladi.</p>
          <div className="grid grid-2">
            <Field label="Keldi (coin)">
              <input className="input" type="number" min={0} value={form.coin_present} onChange={set('coin_present')} />
            </Field>
            <Field label="Kechikdi (coin)">
              <input className="input" type="number" min={0} value={form.coin_late} onChange={set('coin_late')} />
            </Field>
          </div>
          <Field label="O‘quvchi kunlik limiti" hint="Bitta bola bir kunda ko‘pi bilan shu qadar coin oladi.">
            <input className="input" type="number" min={1} value={form.daily_limit_student} onChange={set('daily_limit_student')} />
          </Field>
        </div>

        <div className="card">
          <h3 style={{ fontSize: 16 }}>Ustoz limitlari</h3>
          <p className="tiny" style={{ marginBottom: 10 }}>Ustozlar qo‘shimcha token bera oladi, lekin limit doirasida.</p>
          <Field label="Bitta berishda maksimal">
            <input className="input" type="number" min={1} value={form.teacher_max_award} onChange={set('teacher_max_award')} />
          </Field>
          <Field label="Ustozning kunlik limiti">
            <input className="input" type="number" min={1} value={form.teacher_daily_limit} onChange={set('teacher_daily_limit')} />
          </Field>
          <Field label="Qayta berish oralig‘i (daqiqa)" hint="Tasodifiy ikki marta bosishdan himoya.">
            <input className="input" type="number" min={0} value={form.award_cooldown_min} onChange={set('award_cooldown_min')} />
          </Field>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 16 }}>Hisob davri (termin)</h3>
        <p className="tiny" style={{ marginBottom: 10 }}>
          Reyting va «termin» hisoboti shu oraliqda yig‘iladi. Bo‘sh qoldirilsa — joriy oy.
        </p>
        <div className="grid grid-3">
          <Field label="Nomi">
            <input className="input" value={form.term_name} onChange={set('term_name')} placeholder="1-chorak" />
          </Field>
          <Field label="Boshlanish">
            <input className="input" type="date" value={form.term_start} onChange={set('term_start')} />
          </Field>
          <Field label="Tugash">
            <input className="input" type="date" value={form.term_end} onChange={set('term_end')} />
          </Field>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 16 }}>Reyting (termin bo‘yicha)</h3>
        <table className="tbl" style={{ marginTop: 10 }}>
          <thead>
            <tr><th>#</th><th>O‘quvchi</th><th style={{ textAlign: 'right' }}>Yig‘ilgan coin</th></tr>
          </thead>
          <tbody>
            {(overview?.leaderboard || []).map((row, index) => (
              <tr key={row.id}>
                <td className="mono">{index + 1}</td>
                <td>{row.full_name}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{row.earned}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {(overview?.leaderboard || []).length === 0 && <Empty>Hali ma’lumot yo‘q.</Empty>}
      </div>
    </>
  );
}
