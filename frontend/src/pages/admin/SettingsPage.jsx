import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCopy, Database, KeyRound, RefreshCw, Save, ShieldCheck, Upload } from 'lucide-react';
import { Empty, Field, useToast } from '../../components/ui.jsx';
import { api, todayISO } from '../../lib/api.js';

const TABS = [
  ['davomat', 'Davomat oynasi'],
  ['yuz', 'Face ID'],
  ['ovoz', 'Ovozli AI'],
  ['kiosk', 'Kiosk'],
  ['sheets', 'Google Sheets'],
  ['zaxira', 'Zaxira va audit'],
];

export default function SettingsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('davomat');
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api('/api/admin/settings');
      setSettings(data.settings);
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  if (!settings) return <Empty>Yuklanmoqda…</Empty>;

  const set = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? (event.target.checked ? '1' : '0') : event.target.value;
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const save = async (keys) => {
    setBusy(true);
    try {
      const body = {};
      keys.forEach((key) => {
        body[key] = settings[key];
      });
      await api('/api/admin/settings', { method: 'PATCH', body });
      toast.push('Saqlandi', 'ok');
      load();
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Sozlamalar</h1>
          <p>Tizim xavfsizligi, oynalar, ovoz va zaxira nusxalar.</p>
        </div>
      </div>

      <div className="row wrap" style={{ gap: 6, marginBottom: 16 }}>
        {TABS.map(([id, label]) => (
          <button key={id} className={`btn btn-sm ${tab === id ? 'btn-ink' : ''}`} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'davomat' && (
        <div className="card">
          <h3 style={{ fontSize: 16 }}>Davomat oynasi</h3>
          <p className="tiny" style={{ marginBottom: 12 }}>
            Dars boshlanishidan oldin necha daqiqa ochiladi va necha soatdan keyin yopiladi.
          </p>
          <div className="grid grid-3">
            <Field label="Oldin ochish (daqiqa)">
              <input className="input" type="number" value={settings.open_before_min} onChange={set('open_before_min')} />
            </Field>
            <Field label="Oyna davomiyligi (soat)" hint="Siz so‘ragan 3 soat.">
              <input className="input" type="number" value={settings.window_hours} onChange={set('window_hours')} />
            </Field>
            <Field label="Kechikish chegarasi (daqiqa)">
              <input className="input" type="number" value={settings.late_after_min} onChange={set('late_after_min')} />
            </Field>
          </div>
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={settings.checkout_enabled === '1'} onChange={set('checkout_enabled')} />
            <span>Chiqish vaqtini ham qayd etish</span>
          </label>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => save(['open_before_min', 'window_hours', 'late_after_min', 'checkout_enabled'])} disabled={busy}>
              <Save size={15} /> Saqlash
            </button>
          </div>
        </div>
      )}

      {tab === 'yuz' && (
        <div className="card">
          <h3 style={{ fontSize: 16 }}>Face ID chegaralari</h3>
          <p className="tiny" style={{ marginBottom: 12 }}>
            Masofa qanchalik kichik bo‘lsa, tekshiruv shunchalik qattiq. 0.45 — tavsiya etilgan.
          </p>
          <div className="grid grid-3">
            <Field label="Maksimal masofa" hint="0.40 qattiq · 0.50 yumshoq">
              <input className="input" type="number" step="0.01" value={settings.face_threshold} onChange={set('face_threshold')} />
            </Field>
            <Field label="Ikkinchi nomzod farqi" hint="Chalkashishni oldini oladi.">
              <input className="input" type="number" step="0.01" value={settings.face_margin} onChange={set('face_margin')} />
            </Field>
            <Field label="Minimal namunalar">
              <input className="input" type="number" value={settings.face_min_samples} onChange={set('face_min_samples')} />
            </Field>
          </div>
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={settings.require_liveness === '1'} onChange={set('require_liveness')} />
            <span>Jonlilik tekshiruvi (miltillash) majburiy — rasm bilan aldashni qiyinlashtiradi</span>
          </label>
          <div className="row" style={{ marginTop: 14 }}>
            <button className="btn btn-primary" onClick={() => save(['face_threshold', 'face_margin', 'face_min_samples', 'require_liveness'])} disabled={busy}>
              <Save size={15} /> Saqlash
            </button>
          </div>
        </div>
      )}

      {tab === 'ovoz' && (
        <div className="card">
          <h3 style={{ fontSize: 16 }}>Quyoshvoy — ovozli yordamchi</h3>
          <div className={`badge ${settings.ai_key_set ? 'badge-ok' : 'badge-warn'}`} style={{ marginTop: 8 }}>
            {settings.ai_key_set ? 'OpenAI kaliti ulangan' : 'OPENAI_API_KEY sozlanmagan — brauzer ovozi ishlatiladi'}
          </div>
          <p className="tiny" style={{ margin: '10px 0 12px' }}>
            Kalit serverdagi muhit o‘zgaruvchisida saqlanadi va brauzerga hech qachon chiqmaydi.
          </p>
          <div className="grid grid-2">
            <Field label="Ovoz">
              <select className="input" value={settings.ai_voice} onChange={set('ai_voice')}>
                <option value="alloy">alloy — neytral</option>
                <option value="nova">nova — iliq, ayol</option>
                <option value="shimmer">shimmer — yumshoq</option>
                <option value="onyx">onyx — chuqur, erkak</option>
              </select>
            </Field>
            <Field label="Model">
              <input className="input" value={settings.ai_model} onChange={set('ai_model')} />
            </Field>
          </div>
          <Field label="Salomlashuv matni">
            <textarea className="input" value={settings.ai_greeting} onChange={set('ai_greeting')} />
          </Field>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => save(['ai_voice', 'ai_model', 'ai_greeting'])} disabled={busy}>
              <Save size={15} /> Saqlash
            </button>
          </div>
        </div>
      )}

      {tab === 'kiosk' && <KioskSettings settings={settings} setSettings={setSettings} />}

      {tab === 'sheets' && <SheetsSettings settings={settings} setSettings={setSettings} save={save} busy={busy} />}

      {tab === 'zaxira' && <BackupSettings />}

      <PasswordChange />
    </>
  );
}

function KioskSettings({ settings, setSettings }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const link = `${window.location.origin}/kiosk?kiosk=${encodeURIComponent(settings.kiosk_key || '')}`;

  const copy = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.push('Nusxalandi', 'ok');
    } catch (error) {
      toast.push('Nusxalash ishlamadi — qo‘lda belgilang', 'bad');
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const data = await api('/api/admin/kiosk-key', { method: 'POST' });
      setSettings((prev) => ({ ...prev, kiosk_key: data.kiosk_key }));
      toast.push('Yangi kalit yaratildi — barcha qurilmalarda qayta kiriting', 'ok');
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: 16 }}>Kiosk qurilmasi</h3>
      <p className="tiny" style={{ marginBottom: 12 }}>
        Kiosk rejimida login yo‘q — qurilma maxsus kalit bilan ishlaydi. Kalitni faqat shu qurilmaga
        kiriting.
      </p>
      <Field label="Kiosk kaliti">
        <div className="row">
          <input className="input mono" readOnly value={settings.kiosk_key || ''} />
          <button className="btn" onClick={() => copy(settings.kiosk_key || '')}><ClipboardCopy size={15} /></button>
        </div>
      </Field>
      <Field label="To‘g‘ridan-to‘g‘ri havola">
        <div className="row">
          <input className="input mono" readOnly value={link} />
          <button className="btn" onClick={() => copy(link)}><ClipboardCopy size={15} /></button>
        </div>
      </Field>
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn btn-danger" onClick={rotate} disabled={busy}>
          <RefreshCw size={15} /> Kalitni yangilash
        </button>
        <a className="btn" href="/kiosk" target="_blank" rel="noreferrer">Kioskni ochish</a>
      </div>
      <p className="tiny" style={{ marginTop: 10 }}>
        Telefon bilan sinash uchun: kompyuteringiz bilan bir Wi-Fi’da <span className="mono">http://IP:8000</span> manzilini oching.
        Kamera brauzerda faqat HTTPS yoki localhost’da ishlaydi — internetga chiqarganda HTTPS avtomatik bo‘ladi.
      </p>
    </div>
  );
}

function SheetsSettings({ settings, setSettings, save, busy }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO());
  const [syncing, setSyncing] = useState(false);

  const sync = async () => {
    setSyncing(true);
    try {
      const data = await api('/api/admin/sheets/sync', { method: 'POST', body: { date } });
      toast.push(data.ok ? `Yuborildi: ${data.attendance.sent} davomat, ${data.coins.sent} coin` : 'Yuborilmadi — webhookni tekshiring', data.ok ? 'ok' : 'bad');
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="card">
      <h3 style={{ fontSize: 16 }}>Google Sheets ko‘zgusi</h3>
      <p className="tiny" style={{ marginBottom: 12 }}>
        Sheets — hisobot uchun qulay, lekin baza emas. Bu yerga faqat davomat va coin jadvali
        yuboriladi; biometrik ma’lumot va telefon raqamlari hech qachon chiqmaydi.
      </p>
      <Field label="Apps Script Web App URL">
        <input className="input mono" value={settings.sheets_webhook || ''} onChange={setSettings('sheets_webhook')} placeholder="https://script.google.com/macros/s/.../exec" />
      </Field>
      <Field label="Maxfiy token (ixtiyoriy)">
        <input className="input mono" value={settings.sheets_token || ''} onChange={setSettings('sheets_token')} />
      </Field>
      <label className="check" style={{ marginTop: 8 }}>
        <input type="checkbox" checked={settings.sheets_enabled === '1'} onChange={setSettings('sheets_enabled')} />
        <span>Kunlik avtomatik yuborish yoqilgan</span>
      </label>
      <div className="row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={() => save(['sheets_webhook', 'sheets_token', 'sheets_enabled'])} disabled={busy}>
          <Save size={15} /> Saqlash
        </button>
        <input className="input" type="date" style={{ width: 'auto' }} value={date} onChange={(event) => setDate(event.target.value)} />
        <button className="btn" onClick={sync} disabled={syncing}>
          <Upload size={15} /> {syncing ? 'Yuborilmoqda…' : 'Shu sanani yuborish'}
        </button>
      </div>
    </div>
  );
}

function BackupSettings() {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [audit, setAudit] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [backups, log] = await Promise.all([api('/api/admin/backups'), api('/api/admin/audit')]);
      setItems(backups.backups || []);
      setAudit(log.rows || []);
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      await api('/api/admin/backups', { method: 'POST' });
      toast.push('Nusxa yaratildi', 'ok');
      load();
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="card">
        <div className="row-between">
          <h3 style={{ fontSize: 16 }}><Database size={16} /> Zaxira nusxalar</h3>
          <button className="btn btn-sm btn-primary" onClick={create} disabled={busy}>
            <RefreshCw size={14} /> Hozir nusxalash
          </button>
        </div>
        <p className="tiny" style={{ marginBottom: 10 }}>
          Har kuni avtomatik nusxa olinadi va 30 kun saqlanadi. Faylni yuklab olib, tashqi diskka
          ham qo‘yish tavsiya etiladi.
        </p>
        <table className="tbl">
          <thead><tr><th>Fayl</th><th>Hajm</th><th>Sana</th><th /></tr></thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.file}>
                <td className="mono small">{item.file}</td>
                <td className="small">{(item.size / 1024).toFixed(0)} KB</td>
                <td className="small">{item.at}</td>
                <td style={{ textAlign: 'right' }}>
                  <a className="btn btn-sm" href={`/api/admin/backups/${item.file}`}>Yuklab olish</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && <Empty>Hali nusxa yo‘q.</Empty>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 16 }}><ShieldCheck size={16} /> Audit jurnali</h3>
        <p className="tiny" style={{ marginBottom: 10 }}>
          Kim, qachon, qaysi amalni bajargani. Biometrik o‘chirish va coin berish shu yerda qayd etiladi.
        </p>
        <table className="tbl">
          <thead><tr><th>Vaqt</th><th>Kim</th><th>Amal</th><th>Obyekt</th></tr></thead>
          <tbody>
            {audit.slice(0, 40).map((row) => (
              <tr key={row.id}>
                <td className="mono small">{row.created_at.slice(5, 16)}</td>
                <td className="small">{row.actor_name || row.actor_role || 'tizim'}</td>
                <td className="small">{row.action}</td>
                <td className="mono small">{row.target}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PasswordChange() {
  const toast = useToast();
  const [old, setOld] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api('/api/auth/password', { method: 'POST', body: { old, new: next } });
      toast.push('Parol o‘zgartirildi', 'ok');
      setOld('');
      setNext('');
    } catch (error) {
      toast.push(error.message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <h3 style={{ fontSize: 16 }}><KeyRound size={16} /> Parolni o‘zgartirish</h3>
      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <Field label="Eski parol">
          <input className="input" type="password" value={old} onChange={(event) => setOld(event.target.value)} />
        </Field>
        <Field label="Yangi parol (min 8)">
          <input className="input" type="password" value={next} onChange={(event) => setNext(event.target.value)} />
        </Field>
      </div>
      <button className="btn btn-ink" style={{ marginTop: 12 }} onClick={submit} disabled={busy || next.length < 8}>
        Yangilash
      </button>
    </div>
  );
}
