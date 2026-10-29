import React, { useEffect, useRef, useState } from 'react';
import { CameraOff, RefreshCw } from 'lucide-react';
import { detectFace, loadModels } from '../lib/face.js';

/**
 * Kamera + yuz aniqlash. `onFace(face|null)` har ~230 ms da chaqiriladi.
 * Telefon brauzerida ham ishlaydi (facingMode: user/environment).
 */
export default function Camera({
  onFace,
  paused = false,
  hint = '',
  facing = 'user',
  mirrored = true,
  className = '',
  videoRef: externalRef,
}) {
  const internalRef = useRef(null);
  const videoRef = externalRef || internalRef;
  const streamRef = useRef(null);
  const loopRef = useRef(0);
  const pausedRef = useRef(paused);
  const [state, setState] = useState('loading');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [hit, setHit] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    setError('');

    async function start() {
      try {
        await loadModels();
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setState('ready');
      } catch (err) {
        if (cancelled) return;
        setState('error');
        const name = err?.name || '';
        if (name === 'NotAllowedError') {
          setError('Kameraga ruxsat berilmagan. Brauzer sozlamalarida ruxsat bering.');
        } else if (name === 'NotFoundError') {
          setError('Kamera topilmadi. Qurilmani ulang yoki boshqa brauzerda oching.');
        } else if (name === 'NotReadableError') {
          setError('Kamera boshqa dasturda band. Uni yoping va qayta urinib ko‘ring.');
        } else {
          setError(err?.message || 'Kamera ishga tushmadi.');
        }
      }
    }
    start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(loopRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [facing, attempt]);

  useEffect(() => {
    let stopped = false;
    let last = 0;

    const tick = async (time) => {
      if (stopped) return;
      loopRef.current = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (!video || video.readyState < 2 || pausedRef.current) return;
      if (time - last < 230) return;
      last = time;
      try {
        const face = await detectFace(video);
        if (stopped) return;
        setHit(Boolean(face));
        if (onFace) onFace(face);
      } catch (err) {
        if (!window.__faceLogged) {
          window.__faceLogged = true;
          console.error('face-detect:', err?.message || err);
        }
      }
    };

    if (state === 'ready') loopRef.current = requestAnimationFrame(tick);
    return () => {
      stopped = true;
      cancelAnimationFrame(loopRef.current);
    };
  }, [state, onFace]);

  return (
    <div className={`cam-shell ${mirrored ? 'mirror' : ''} ${className}`}>
      <video ref={videoRef} playsInline muted autoPlay />
      <div className="cam-overlay">
        <div className={`cam-oval ${hit ? 'hit' : 'miss'}`} />
        {hint && <div className="cam-hint">{hint}</div>}
      </div>
      {state === 'loading' && (
        <div className="cam-off">
          <div>
            <span className="spin" />
            <div style={{ marginTop: 10 }}>Kamera va model yuklanmoqda…</div>
          </div>
        </div>
      )}
      {state === 'error' && (
        <div className="cam-off">
          <div>
            <CameraOff size={34} style={{ opacity: 0.7 }} />
            <div style={{ marginTop: 10, maxWidth: 320 }}>{error}</div>
            <button className="btn btn-sm" style={{ marginTop: 14 }} onClick={() => setAttempt((n) => n + 1)}>
              <RefreshCw size={14} /> Qayta urinish
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
