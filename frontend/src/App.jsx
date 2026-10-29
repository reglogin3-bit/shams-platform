import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ToastProvider } from './components/ui.jsx';
import Kiosk from './pages/Kiosk.jsx';
import Login from './pages/Login.jsx';
import Admin from './pages/Admin.jsx';
import Teacher from './pages/Teacher.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Navigate to="/kiosk" replace />} />
        <Route path="/kiosk" element={<Kiosk />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/*" element={<Admin />} />
        <Route path="/teacher" element={<Teacher />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </ToastProvider>
  );
}
