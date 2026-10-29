import React, { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import {
  BadgeCheck, CalendarCheck, Coins, GraduationCap, LayoutDashboard, LogOut, Settings, Users, UsersRound,
} from 'lucide-react';
import { api } from '../lib/api.js';
import { Spinner, useToast } from '../components/ui.jsx';
import Dashboard from './admin/Dashboard.jsx';
import Students from './admin/Students.jsx';
import Groups from './admin/Groups.jsx';
import Attendance from './admin/Attendance.jsx';
import CoinsPage from './admin/CoinsPage.jsx';
import Teachers from './admin/Teachers.jsx';
import SettingsPage from './admin/SettingsPage.jsx';

const TABS = [
  { to: '/admin', label: 'Umumiy', icon: LayoutDashboard, end: true },
  { to: '/admin/oquvchilar', label: 'O‘quvchilar', icon: Users },
  { to: '/admin/guruhlar', label: 'Guruhlar', icon: UsersRound },
  { to: '/admin/davomat', label: 'Davomat', icon: CalendarCheck },
  { to: '/admin/coinlar', label: 'Coin qoidalari', icon: Coins },
  { to: '/admin/ustozlar', label: 'Ustozlar', icon: GraduationCap },
  { to: '/admin/sozlamalar', label: 'Sozlamalar', icon: Settings },
];

export default function Admin() {
  const navigate = useNavigate();
  const toast = useToast();
  const [me, setMe] = useState(undefined);
  const [meta, setMeta] = useState(null);

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => {
        if (!data.user) {
          navigate('/login', { replace: true });
          return;
        }
        if (data.user.role !== 'superadmin') {
          navigate('/teacher', { replace: true });
          return;
        }
        setMe(data.user);
        if (data.settings) setMeta(data.settings);
      })
      .catch(() => navigate('/login', { replace: true }));
    api('/api/meta').then(setMeta).catch(() => {});
  }, [navigate]);

  if (me === undefined) {
    return (
      <div className="login-wrap">
        <Spinner label="Yuklanmoqda…" />
      </div>
    );
  }

  const logout = async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    toast.push('Chiqdingiz');
    navigate('/login', { replace: true });
  };

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand" style={{ padding: '4px 8px 14px' }}>
          <div className="brand-sun" style={{ width: 34, height: 34 }} />
          <div>
            <b style={{ fontSize: 16 }}>Shams</b>
            <span>Superadmin</span>
          </div>
        </div>

        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
          >
            <tab.icon size={17} /> {tab.label}
          </NavLink>
        ))}

        <div className="side-foot">
          <div className="row" style={{ gap: 8 }}>
            <BadgeCheck size={15} />
            <span>{me.full_name}</span>
          </div>
          <button className="side-link" onClick={logout} style={{ padding: '6px 0' }}>
            <LogOut size={15} /> Chiqish
          </button>
        </div>
      </aside>

      <main className="main">
        {meta?.default_password && (
          <div className="card card-tight" style={{ marginBottom: 16, borderColor: '#f0d19a', background: '#fff8e9' }}>
            <b className="small">Diqqat:</b>{' '}
            <span className="small">
              Standart admin paroli ishlatilmoqda. «Sozlamalar → Parolni o‘zgartirish» bo‘limidan
              darhol yangilang.
            </span>
          </div>
        )}

        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="oquvchilar" element={<Students />} />
          <Route path="guruhlar" element={<Groups />} />
          <Route path="davomat" element={<Attendance />} />
          <Route path="coinlar" element={<CoinsPage />} />
          <Route path="ustozlar" element={<Teachers />} />
          <Route path="sozlamalar" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </main>
    </div>
  );
}
