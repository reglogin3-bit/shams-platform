import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bot, Camera, Coins, Users } from 'lucide-react';
import { api } from '../../lib/api.js';
import { Empty, Stat, StatusBadge } from '../../components/ui.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/api/admin/overview').then(setData).catch(() => setData({ error: true }));
  }, []);

  if (!data) return <Empty>Yuklanmoqda…</Empty>;
  if (data.error) return <Empty>Ma’lumot olinmadi. Sahifani yangilang.</Empty>;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Umumiy holat</h1>
          <p>{new Date().toLocaleDateString('uz-UZ', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <div className="row wrap">
          <Link className="btn btn-sm" to="/kiosk" target="_blank">
            <Camera size={15} /> Kioskni ochish
          </Link>
          <Link className="btn btn-primary btn-sm" to="/admin/oquvchilar">
            <Users size={15} /> O‘quvchi qo‘shish
          </Link>
        </div>
      </div>

      <div className="grid grid-4">
        <Stat label="Faol o‘quvchilar" value={data.students} />
        <Stat label="Guruhlar" value={data.groups} />
        <Stat label="Bugun keldi" value={data.today_present} tone="var(--green)" />
        <Stat label="Kechikdi" value={data.today_late} tone="var(--amber-deep)" />
      </div>

      {(data.without_face > 0 || !data.ai_enabled) && (
        <div className="grid grid-2" style={{ marginTop: 14 }}>
          {data.without_face > 0 && (
            <div className="card card-tight" style={{ background: '#fff8e9', borderColor: '#f0d19a' }}>
              <div className="row" style={{ gap: 8 }}>
                <AlertTriangle size={16} color="var(--amber-deep)" />
                <b className="small">{data.without_face} o‘quvchida Face ID yo‘q</b>
              </div>
              <p className="small muted" style={{ marginTop: 4 }}>
                Ular kioskda faqat qidiruv orqali topiladi. «O‘quvchilar» bo‘limida yuzni ro‘yxatga oling.
              </p>
            </div>
          )}
          {!data.ai_enabled && (
            <div className="card card-tight">
              <div className="row" style={{ gap: 8 }}>
                <Bot size={16} />
                <b className="small">Ovozli yordamchi o‘chirilgan</b>
              </div>
              <p className="small muted" style={{ marginTop: 4 }}>
                Serverga <span className="mono">OPENAI_API_KEY</span> qo‘shilsa, Quyoshvoy gapira boshlaydi.
                Hozir brauzer ovozi ishlatiladi.
              </p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="row-between">
            <h3 style={{ fontSize: 16 }}>Bugungi darslar</h3>
            <span className="tiny">Davomat oynasi: dars + 3 soat</span>
          </div>
          {data.sessions.length === 0 && <Empty>Bugun jadvalda dars yo‘q.</Empty>}
          <div className="grid" style={{ gap: 8, marginTop: 12 }}>
            {data.sessions.map((session) => (
              <div key={session.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid #f1ead9' }}>
                <div>
                  <b style={{ fontSize: 14 }}>{session.group_name}</b>
                  <div className="tiny">
                    {String(session.starts_at).slice(11, 16)}–{String(session.closes_at).slice(11, 16)}
                  </div>
                </div>
                <div className="row" style={{ gap: 10 }}>
                  <span className="mono small">{session.present}/{session.total}</span>
                  <StatusBadge status={session.status} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="row-between">
            <h3 style={{ fontSize: 16 }}>Coinlar</h3>
            <Link className="btn btn-ghost btn-sm" to="/admin/coinlar">
              Boshqarish <ArrowRight size={14} />
            </Link>
          </div>
          <div className="grid grid-3" style={{ marginTop: 10 }}>
            <Stat label="Berilgan" value={data.coins.issued} />
            <Stat label="Sarflangan" value={data.coins.spent} />
            <Stat label="Qoldiq" value={data.coins.balance} />
          </div>
          <p className="tiny" style={{ marginTop: 12 }}>
            Hisob davri: {data.term.start} — {data.term.end}
          </p>
          <div className="grid" style={{ gap: 6, marginTop: 10 }}>
            {data.leaderboard.map((row, index) => (
              <div key={row.id} className="row-between small">
                <span><b className="mono">{index + 1}.</b> {row.full_name}</span>
                <span className="coin-pill" style={{ fontSize: 12 }}><span className="coin-dot" /> {row.earned}</span>
              </div>
            ))}
            {data.leaderboard.length === 0 && <p className="small muted">Hali coin berilmagan.</p>}
          </div>
        </div>
      </div>

      <div className="card card-tight" style={{ marginTop: 16 }}>
        <div className="row" style={{ gap: 8 }}>
          <Coins size={15} color="var(--amber-deep)" />
          <span className="small">
            <b>Eslatma:</b> coinlar «Coin qoidalari» bo‘limida belgilangan kunlik limit va termin
            asosida beriladi. Ustozlar faqat o‘z guruhi o‘quvchilariga token bera oladi.
          </span>
        </div>
      </div>
    </>
  );
}
