import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, LogIn } from 'lucide-react';
import { Field, useToast } from '../components/ui.jsx';
import { api } from '../lib/api.js';

export default function Login() {
  const navigate = useNavigate();
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/auth/me')
      .then((data) => {
        if (data.user) navigate(data.user.role === 'superadmin' ? '/admin' : '/teacher', { replace: true });
      })
      .catch(() => {});
  }, [navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { username, password } });
      toast.push(`Xush kelibsiz, ${data.user.full_name}`, 'ok');
      navigate(data.user.role === 'superadmin' ? '/admin' : '/teacher', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="card login-card" onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
        <div className="brand" style={{ marginBottom: 6 }}>
          <div className="brand-sun" style={{ width: 38, height: 38 }} />
          <div>
            <b>Shams Academy</b>
            <span>Xodimlar paneli</span>
          </div>
        </div>

        <Field label="Login">
          <input
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            autoFocus
          />
        </Field>
        <Field label="Parol">
          <input
            className="input"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
          />
        </Field>

        {error && <div className="badge badge-bad">{error}</div>}

        <button className="btn btn-primary btn-lg btn-block" disabled={busy || !username || !password}>
          <LogIn size={17} /> {busy ? 'Kirish…' : 'Kirish'}
        </button>

        <Link to="/kiosk" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }}>
          <ArrowLeft size={14} /> Kiosk rejimiga qaytish
        </Link>
        <p className="tiny">
          Bola uchun login kerak emas — yuz bilan kiradi. Bu panel faqat ustoz va admin uchun.
        </p>
      </form>
    </div>
  );
}
