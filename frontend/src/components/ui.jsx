import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';

const ToastContext = createContext({ push: () => {} });

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);

  const push = useCallback((message, tone = 'default') => {
    const id = Math.random().toString(36).slice(2);
    setItems((list) => [...list, { id, message, tone }]);
    setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-wrap">
        {items.map((item) => (
          <div key={item.id} className={`toast ${item.tone === 'ok' ? 'ok' : item.tone === 'bad' ? 'bad' : ''}`}>
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

export function Modal({ title, children, onClose, footer, width }) {
  useEffect(() => {
    const handler = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="modal-back" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" style={width ? { width } : undefined} role="dialog" aria-modal="true">
        <div className="modal-head">
          <h3 style={{ fontSize: 17 }}>{title}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Yopish">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <em className="tiny" style={{ fontStyle: 'normal', textTransform: 'none', letterSpacing: 0 }}>{hint}</em>}
    </label>
  );
}

export function Stat({ label, value, tone }) {
  return (
    <div className="stat">
      <b style={tone ? { color: tone } : undefined}>{value}</b>
      <span>{label}</span>
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    keldi: ['badge-ok', 'Keldi'],
    kechikdi: ['badge-warn', 'Kechikdi'],
    kelmadi: ['badge-bad', 'Kelmadi'],
    sababli: ['badge-info', 'Sababli'],
    open: ['badge-ok', 'Ochiq'],
    closed: ['badge-bad', 'Yopilgan'],
    scheduled: ['badge-info', 'Kutilmoqda'],
  };
  const [cls, label] = map[status] || ['badge', status || '—'];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function Empty({ children }) {
  return <div className="empty">{children}</div>;
}

export function Spinner({ label }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <span className="spin" />
      {label && <span className="small muted">{label}</span>}
    </span>
  );
}
