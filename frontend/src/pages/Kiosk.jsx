import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check, Clock, DoorOpen, KeyRound, LogOut, Mic, MicOff, Search, ShieldCheck, Sparkles, UserRound,
} from 'lucide-react';
import Camera from '../components/Camera.jsx';
import { Field, Modal, Spinner, useToast } from '../components/ui.jsx';
import { getKioskKey, kioskApi, setKioskKey } from '../lib/api.js';
import { createLiveness } from '../lib/face.js';
import { microphoneAvailable, startSession } from '../lib/recorder.js';
import { chat, speak, transcribe } from '../lib/voice.js';

const STEPS = {
  scan: 'Yuzingizni kamera o‘rtasiga tuting',
  blink: 'Iltimos, bir marta ko‘zingizni yuming',
  confirm: 'Yuzingizni tasdiqlang',
  done: 'Davomat belgilandi',
};

export default function Kiosk() {
  const toast = useToast();
  const [boot, setBoot] = useState(null);
  const [groupId, setGroupId] = useState('');
  const [clock, setClock] = useState(new Date());
  const [face, setFace] = useState(null);
  const [mode, setMode] = useState('scan');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null);
  const [livenessOk, setLivenessOk] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [profile, setProfile] = useState(null);
  const [showKey, setShowKey] = useState(!getKioskKey());
  const [keyInput, setKeyInput] = useState('');
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [voiceText, setVoiceText] = useState('');
  const [thinking, setThinking] = useState(false);

  const faceRef = useRef(null);
  const liveness = useRef(createLiveness());
  const cooldownRef = useRef(0);
  const pendingRef = useRef(null);
  const modeRef = useRef('scan');
  const groupRef = useRef('');
  const sessionRef = useRef(null);
  const tokenRef = useRef('');

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    groupRef.current = groupId;
  }, [groupId]);

  /* ── kiosk kaliti (?kiosk=...) ── */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('kiosk');
    if (fromUrl) {
      setKioskKey(fromUrl);
      setShowKey(false);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  /* ── yuklash ── */
  const load = useCallback(async () => {
    try {
      const data = await kioskApi('/api/kiosk/bootstrap');
      setBoot(data);
      const open = data.groups.find((group) => group.window_open);
      if (open && !groupRef.current) {
        setGroupId(open.id);
        sessionRef.current = open.session;
      }
    } catch (error) {
      if (error.status === 401) setShowKey(true);
      else toast.push(error.message, 'bad');
    }
  }, [toast]);

  useEffect(() => {
    load();
    const timer = setInterval(() => setClock(new Date()), 1000);
    const refresh = setInterval(load, 60000);
    return () => {
      clearInterval(timer);
      clearInterval(refresh);
    };
  }, [load]);

  const currentGroup = useMemo(
    () => (boot?.groups || []).find((group) => group.id === groupId) || null,
    [boot, groupId]
  );

  useEffect(() => {
    sessionRef.current = currentGroup?.session || null;
  }, [currentGroup]);

  /* ── yuz kadrlari ── */
  const onFace = useCallback((detected) => {
    faceRef.current = detected;
    setFace(detected);
    if (detected) {
      const live = liveness.current.feed(detected.landmarks);
      if (live.passed) setLivenessOk(true);
    }
  }, []);

  const checkin = useCallback(
    async (token, student, confidence) => {
      try {
        const data = await kioskApi('/api/kiosk/checkin', {
          method: 'POST',
          body: {
            token,
            liveness: true,
            groupId: groupRef.current || null,
            confidence,
          },
        });
        tokenRef.current = token;
        setResult({ ...data, student, token });
        setMode('done');
        cooldownRef.current = Date.now() + 7000;
        const late = data.late ? 'Kechikish qayd etildi. ' : '';
        const reward = data.reward ? ` +${data.reward} coin!` : '';
        speak(`${student.first_name || student.full_name}, ${late}xush kelibsiz!${reward}`).catch(() => {});
        toast.push(`${student.full_name} — ${data.status}`, 'ok');
      } catch (error) {
        setResult({ error: error.message, student });
        setMode('done');
        cooldownRef.current = Date.now() + 5000;
        speak(error.message).catch(() => {});
      }
    },
    [toast]
  );

  /* ── avtomatik identifikatsiya ── */
  useEffect(() => {
    const timer = setInterval(async () => {
      if (busy || showKey || thinking) return;
      if (Date.now() < cooldownRef.current) return;
      const detected = faceRef.current;

      // Tanlangan o'quvchini tasdiqlash
      if (modeRef.current === 'confirm' && pendingRef.current) {
        if (!detected) return;
        setBusy(true);
        try {
          const res = await kioskApi('/api/kiosk/verify', {
            method: 'POST',
            body: { studentId: pendingRef.current.id, descriptor: detected.descriptor },
          });
          if (res.ok) {
            setPending(null);
            if (sessionRef.current?.status === 'open') {
              await checkin(res.token, { ...pendingRef.current, ...res.student }, 1);
            } else {
              tokenRef.current = res.token;
              setResult({ student: { ...pendingRef.current, ...res.student }, closed: true, token: res.token });
              setMode('done');
              cooldownRef.current = Date.now() + 5000;
              speak(`${pendingRef.current.first_name || pendingRef.current.full_name}, balansingiz ${res.student.coins} coin.`).catch(() => {});
            }
          } else {
            toast.push(res.error || 'Yuz mos kelmadi', 'bad');
            setMode('scan');
            setPending(null);
            cooldownRef.current = Date.now() + 2500;
          }
        } catch (error) {
          toast.push(error.message, 'bad');
        } finally {
          setBusy(false);
        }
        return;
      }

      if (modeRef.current !== 'scan' || !detected) return;
      if (detected.score < 0.6) return;
      if (boot?.require_liveness && !livenessOk) return;

      setBusy(true);
      try {
        const res = await kioskApi('/api/kiosk/identify', {
          method: 'POST',
          body: { descriptor: detected.descriptor, groupId: groupRef.current || null },
        });
        if (res.matched) {
          cooldownRef.current = Date.now() + 8000;
          if (res.window_open) {
            await checkin(res.token, res.student, res.confidence);
          } else {
            setResult({ student: res.student, closed: true, session: res.session });
            setMode('done');
            speak(`${res.student.first_name}, bugun davomat oynasi yopilgan.`).catch(() => {});
          }
        }
      } catch (error) {
        /* jim */
      } finally {
        setBusy(false);
      }
    }, 1300);
    return () => clearInterval(timer);
  }, [busy, showKey, thinking, boot, livenessOk, checkin, toast]);

  const reset = () => {
    setMode('scan');
    setResult(null);
    setPending(null);
    setProfile(null);
    liveness.current.reset();
    setLivenessOk(false);
    tokenRef.current = '';
    cooldownRef.current = 0;
  };

  /* ── qidiruv ── */
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return undefined;
    }
    const timer = setTimeout(async () => {
      try {
        const data = await kioskApi('/api/kiosk/search', {
          method: 'POST',
          body: { q: query, groupId: groupId || null },
        });
        setResults(data.results || []);
      } catch (error) {
        setResults([]);
      }
    }, 320);
    return () => clearTimeout(timer);
  }, [query, groupId]);

  const selectStudent = (student) => {
    if (!student.has_face) {
      toast.push('Bu o‘quvchining yuzi hali ro‘yxatga olinmagan', 'bad');
      return;
    }
    liveness.current.reset();
    setLivenessOk(false);
    setPending(student);
    pendingRef.current = student;
    setMode('confirm');
    setResults([]);
    setQuery('');
    speak(`${student.first_name || student.full_name}, yuzingizni ko‘rsating.`).catch(() => {});
  };

  /* ── ovoz ── */
  const startVoice = async () => {
    if (!microphoneAvailable()) {
      toast.push('Mikrofon topilmadi', 'bad');
      return;
    }
    setListening(true);
    setVoiceText('');
    try {
      const session = await startSession({ onLevel: setLevel });
      const result = await session.stop();
      setListening(false);
      if (!result.hasSpeech) {
        toast.push('Ovoz eshitilmadi — qayta urinib ko‘ring');
        return;
      }
      setThinking(true);
      const text = await transcribe(result.blob);
      setVoiceText(text);
      if (!text) {
        setThinking(false);
        return;
      }
      const answer = await chat([{ role: 'user', content: text }], groupId);
      if (answer.reply) speak(answer.reply).catch(() => {});
      const candidates = answer.proposal?.candidates || [];
      if (candidates.length === 1) {
        selectStudent({ ...candidates[0], has_face: true });
      } else if (candidates.length > 1) {
        setResults(candidates.map((item) => ({ ...item, has_face: true })));
        setQuery('');
      }
    } catch (error) {
      setListening(false);
      toast.push(error.message || 'Ovoz ishlamadi', 'bad');
    } finally {
      setThinking(false);
    }
  };

  const openProfile = async () => {
    if (!result?.student) return;
    const token = result.token || tokenRef.current;
    if (!token) return;
    try {
      const data = await kioskApi(`/api/kiosk/profile/${result.student.id}?token=${token}`);
      setProfile({ ...data, token });
    } catch (error) {
      toast.push(error.message, 'bad');
    }
  };

  const hint = mode === 'confirm'
    ? STEPS.confirm
    : boot?.require_liveness && !livenessOk && mode === 'scan'
      ? STEPS.blink
      : STEPS.scan;

  return (
    <div className="kiosk">
      <header className="kiosk-head">
        <div className="brand">
          <div className="brand-sun" />
          <div>
            <b>{boot?.school_name || 'Shams Academy'}</b>
            <span>Davomat · Face ID</span>
          </div>
        </div>
        <div className="row wrap" style={{ gap: 10 }}>
          <select
            className="input"
            style={{ width: 'auto', padding: '8px 12px', fontWeight: 700 }}
            value={groupId}
            onChange={(event) => {
              setGroupId(event.target.value);
              reset();
            }}
          >
            <option value="">Barcha guruhlar</option>
            {(boot?.groups || []).map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} {group.window_open ? '· ochiq' : ''}
              </option>
            ))}
          </select>
          <span className="time-chip mono">
            {clock.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <Link to="/login" className="btn btn-sm" title="Xodimlar uchun">
            <KeyRound size={14} /> Kirish
          </Link>
        </div>
      </header>

      <div className="kiosk-body">
        <div style={{ position: 'relative' }}>
          <Camera onFace={onFace} hint={hint} paused={showKey} />
          <div className="row" style={{ marginTop: 12, gap: 10, flexWrap: 'wrap' }}>
            <span className={`badge ${livenessOk ? 'badge-ok' : 'badge-warn'}`}>
              <ShieldCheck size={13} /> {livenessOk ? 'Jonli yuz tasdiqlandi' : 'Jonlilik tekshirilmoqda'}
            </span>
            {face && <span className="badge badge-info">Yuz aniqlandi · {Math.round(face.score * 100)}%</span>}
            {!face && <span className="badge">Yuz kutilmoqda</span>}
            {currentGroup?.session && (
              <span className={`badge ${currentGroup.window_open ? 'badge-ok' : 'badge-bad'}`}>
                <Clock size={13} />
                {currentGroup.window_open
                  ? `Davomat ochiq · ${String(currentGroup.session.closes_at).slice(11, 16)} gacha`
                  : 'Davomat yopilgan'}
              </span>
            )}
          </div>
        </div>

        <div className="kiosk-panel">
          {mode === 'done' && result ? (
            <div className="greet-card">
              <div className="row-between">
                <span className="tiny">Natija</span>
                <button className="btn btn-ghost btn-sm" onClick={reset}>
                  <LogOut size={14} /> Yopish
                </button>
              </div>
              <div className="greet-name" style={{ marginTop: 8 }}>
                {result.student?.first_name || result.student?.full_name}
              </div>
              <p className="muted small" style={{ marginTop: 4 }}>
                {result.student?.full_name}
                {result.group ? ` · ${result.group}` : ''}
              </p>

              {result.error ? (
                <div className="badge badge-bad" style={{ marginTop: 14 }}>{result.error}</div>
              ) : result.closed ? (
                <div className="badge badge-warn" style={{ marginTop: 14 }}>
                  Davomat oynasi yopilgan — ustozga murojaat qiling
                </div>
              ) : (
                <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
                  <span className={`badge ${result.status === 'keldi' ? 'badge-ok' : 'badge-warn'}`}>
                    <Check size={13} /> {result.status}
                  </span>
                  <span className="badge badge-info">
                    <Clock size={13} /> {String(result.at || '').slice(11, 16)}
                  </span>
                  {result.reward > 0 && <span className="coin-pill">+{result.reward}</span>}
                </div>
              )}

              <div className="row-between" style={{ marginTop: 18 }}>
                <div>
                  <span className="tiny">Coin balansi</span>
                  <div className="coin-pill" style={{ marginTop: 6 }}>
                    <span className="coin-dot" /> {result.student?.coins ?? 0}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <button className="btn btn-sm" onClick={openProfile}>Profil</button>
                  <button className="btn btn-sm" onClick={() => speak(
                    `${result.student.first_name || ''}, sizning balansingiz ${result.student.coins || 0} coin.`
                  ).catch(() => {})}>
                    <Sparkles size={14} /> Eshitish
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="greet-card">
              <span className="tiny">{currentGroup ? currentGroup.name : 'Xush kelibsiz'}</span>
              <h2 className="greet-name" style={{ marginTop: 6 }}>
                Assalomu alaykum!
              </h2>
              <p className="muted small" style={{ marginTop: 6 }}>
                Yuzingizni ko‘rsating — davomat avtomatik belgilanadi. Yoki ismingizni yozib toping.
              </p>

              <div className="search-box" style={{ marginTop: 16 }}>
                <input
                  className="input"
                  placeholder="Ism yoki familiya…"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button className="btn btn-primary" onClick={startVoice} disabled={listening || thinking}>
                  {listening ? <MicOff size={16} className="pulse" /> : <Mic size={16} />}
                </button>
              </div>

              {(listening || thinking || voiceText) && (
                <div className="small muted" style={{ marginTop: 8 }}>
                  {listening && `Tinglayapman… ${'▮'.repeat(Math.min(12, Math.round(level * 90)))}`}
                  {thinking && <Spinner label="O‘ylayapman…" />}
                  {!listening && !thinking && voiceText && `“${voiceText}”`}
                </div>
              )}

              {results.length > 0 && (
                <div className="results" style={{ marginTop: 12 }}>
                  {results.map((item) => (
                    <button key={item.id} className="result" onClick={() => selectStudent(item)}>
                      <span className="row" style={{ gap: 8 }}>
                        <UserRound size={16} />
                        <span>
                          <b style={{ fontSize: 14 }}>{item.full_name}</b>
                          <span className="tiny" style={{ display: 'block' }}>{item.groups?.join(', ')}</span>
                        </span>
                      </span>
                      <span className="badge">{item.has_face ? 'Face ID' : 'yuzsiz'}</span>
                    </button>
                  ))}
                </div>
              )}

              {pending && (
                <div className="badge badge-warn" style={{ marginTop: 12 }}>
                  {pending.full_name} — yuzni tasdiqlash kutilmoqda
                </div>
              )}

              <div className="row" style={{ marginTop: 18, gap: 8 }}>
                <button className="btn btn-sm" onClick={() => setShowKey(true)}>
                  <KeyRound size={14} /> Kiosk kaliti
                </button>
                <Link className="btn btn-sm" to="/login">
                  <DoorOpen size={14} /> Xodim paneli
                </Link>
              </div>
            </div>
          )}

          {(boot?.groups || []).length > 0 && mode !== 'done' && (
            <div className="card card-tight">
              <div className="row-between">
                <span className="tiny">Bugungi guruhlar</span>
                <span className="tiny">{boot?.date}</span>
              </div>
              <div className="grid" style={{ gap: 8, marginTop: 10 }}>
                {(boot?.groups || []).map((group) => (
                  <button
                    key={group.id}
                    className="result"
                    style={{ borderColor: group.id === groupId ? 'var(--amber)' : undefined }}
                    onClick={() => {
                      setGroupId(group.id);
                      reset();
                    }}
                  >
                    <span>
                      <b style={{ fontSize: 13.5 }}>{group.name}</b>
                      <span className="tiny" style={{ display: 'block' }}>
                        {group.members} bola · {group.start_time}
                      </span>
                    </span>
                    <span className={`badge ${group.window_open ? 'badge-ok' : 'badge'}`}>
                      {group.window_open ? 'ochiq' : group.session ? group.session.status : 'dars yo‘q'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showKey && (
        <Modal
          title="Kiosk kaliti"
          onClose={() => boot && setShowKey(false)}
          footer={(
            <>
              <button className="btn" onClick={() => setShowKey(false)}>Bekor qilish</button>
              <button
                className="btn btn-primary"
                onClick={async () => {
                  setKioskKey(keyInput.trim());
                  setShowKey(false);
                  await load();
                }}
              >
                Saqlash
              </button>
            </>
          )}
        >
          <p className="small muted">
            Admin panelda «Sozlamalar → Kiosk kaliti» bo‘limidan nusxa oling. Kalit faqat shu
            qurilmada saqlanadi va bola ma’lumotlariga ruxsatsiz kirishni to‘sadi.
          </p>
          <Field label="Kalit">
            <input className="input" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} />
          </Field>
          <p className="tiny">Havola orqali ham ochish mumkin: /kiosk?kiosk=KALIT</p>
        </Modal>
      )}

      {profile && (
        <Modal title={profile.student?.full_name || 'Profil'} onClose={() => setProfile(null)}>
          <div className="row-between">
            <span className="tiny">Coin balansi</span>
            <span className="coin-pill"><span className="coin-dot" /> {profile.student?.coins ?? 0}</span>
          </div>
          {(profile.history || []).slice(0, 6).map((row) => (
            <div key={row.id} className="row-between small" style={{ borderBottom: '1px solid #f1ead9', paddingBottom: 6 }}>
              <span className="muted">{row.reason}</span>
              <span className="mono" style={{ color: row.coin_delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                {row.coin_delta > 0 ? '+' : ''}{row.coin_delta}
              </span>
            </div>
          ))}
          {(profile.history || []).length === 0 && <p className="small muted">Hali coin tarixi yo‘q.</p>}
        </Modal>
      )}
    </div>
  );
}
