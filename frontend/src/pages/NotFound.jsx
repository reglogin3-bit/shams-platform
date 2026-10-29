import React from 'react';
import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="login-wrap">
      <div className="card" style={{ textAlign: 'center', width: 'min(420px, 100%)' }}>
        <h2 style={{ fontSize: 42 }}>404</h2>
        <p className="muted small">Bu sahifa topilmadi.</p>
        <Link className="btn btn-primary" to="/kiosk" style={{ marginTop: 16 }}>
          Kioskga qaytish
        </Link>
      </div>
    </div>
  );
}
