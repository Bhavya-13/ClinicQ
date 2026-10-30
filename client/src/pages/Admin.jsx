import { useEffect, useState } from 'react';
import { useClinic } from '../clinic';

// ── Look and feel ────────────────────────────────────────────────────
const C = {
  navy: '#1e3a5f', blue: '#2d6a9f', ink: '#1a2433', mute: '#8a94a3', soft: '#a8b1bd',
  line: '#e6ebf2', green: '#27ae60', red: '#e74c3c', amber: '#c47f0a',
};

const ADMIN_CSS = `
  .cqa-page { min-height: 100vh; background: #f0f4f8; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a2433; padding: 24px; box-sizing: border-box; }
  .cqa-page * { box-sizing: border-box; }
  .cqa-wrap { max-width: 1200px; margin: 0 auto; }
  .cqa-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 18px; }
  .cqa-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .cqa-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .cqa-main { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(0, 1fr); gap: 20px; align-items: start; }
  .cqa-col { display: flex; flex-direction: column; gap: 20px; min-width: 0; }
  .cqa-serving { display: flex; align-items: center; gap: 18px; margin-bottom: 16px; }
  .cqa-walkrow { display: flex; gap: 10px; flex-wrap: wrap; }
  .cqa-scroll { max-height: 440px; overflow-y: auto; padding-right: 2px; }
  .cqa-btn:active:not(:disabled) { transform: scale(0.98); }
  @media (max-width: 900px) {
    .cqa-page { padding: 14px 12px 28px; }
    .cqa-main { display: flex; flex-direction: column; gap: 14px; }
    .cqa-col { display: contents; }
    .cqa-now { order: 1; }
    .cqa-walkin { order: 2; }
    .cqa-waiting { order: 3; }
    .cqa-tokens { order: 4; }
    .cqa-skipped { order: 5; }
    .cqa-qr { order: 6; }
    .cqa-actions { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); }
    .cqa-actions > * { width: 100%; padding-left: 8px !important; padding-right: 8px !important; }
    .cqa-serving { flex-direction: column; text-align: center; gap: 12px; }
    .cqa-scroll { max-height: 420px; }
    .cqa-h1 { font-size: 22px !important; }
  }
`;

// Always refreshes, so edits show up straight away while you are developing
function useAdminStyles() {
  useEffect(() => {
    const id = 'clinicq-admin-styles';
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    style.innerHTML = ADMIN_CSS;
  }, []);
}

const cardStyle = {
  background: 'white', borderRadius: '18px', padding: '20px', border: `1px solid ${C.line}`,
  boxShadow: '0 2px 12px rgba(30,58,95,0.06)', minWidth: 0,
};

function Card({ title, subtitle, right, className, children, style }) {
  return (
    <section className={className} style={{ ...cardStyle, ...style }}>
      {(title || right) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: subtitle ? '4px' : '14px' }}>
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: C.navy }}>{title}</h2>
          {right}
        </div>
      )}
      {subtitle && <p style={{ margin: '0 0 14px', fontSize: '12.5px', color: C.soft, lineHeight: 1.45 }}>{subtitle}</p>}
      {children}
    </section>
  );
}

const CHIP_TONES = {
  blue: { bg: '#dbeafe', fg: C.navy },
  navy: { bg: C.navy, fg: 'white' },
  green: { bg: '#e8f8f5', fg: '#00875f' },
  red: { bg: '#ffe0e0', fg: C.red },
  amber: { bg: '#fff3e0', fg: C.amber },
  grey: { bg: '#f1f3f6', fg: '#6b7684' },
};

function Chip({ tone = 'blue', children, style }) {
  const t = CHIP_TONES[tone] || CHIP_TONES.blue;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '5px 12px', borderRadius: '999px',
      fontSize: '12.5px', fontWeight: 700, background: t.bg, color: t.fg, lineHeight: 1.3, ...style,
    }}>
      {children}
    </span>
  );
}

function btn(kind, disabled = false) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px', minHeight: '44px',
    padding: '10px 16px', borderRadius: '12px', fontSize: '14px', fontWeight: 700, fontFamily: 'inherit',
    border: '2px solid transparent', textDecoration: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'transform 0.1s, box-shadow 0.15s',
  };
  const kinds = {
    primary: { background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', color: 'white', boxShadow: '0 6px 16px rgba(30,58,95,0.25)' },
    success: { background: 'linear-gradient(135deg,#27ae60,#2ecc71)', color: 'white', boxShadow: '0 6px 16px rgba(39,174,96,0.3)' },
    outline: { background: 'white', color: C.blue, borderColor: '#dbeafe' },
    danger: { background: 'white', color: C.red, borderColor: '#ffd5d5' },
    okOutline: { background: 'white', color: C.green, borderColor: '#cdeedb' },
    ghost: { background: '#f4f6fa', color: '#556070', borderColor: C.line },
    warn: { background: '#fff3e0', color: C.amber, borderColor: '#f5d38a' },
    disabled: { background: '#eef1f5', color: '#aab3bf' },
  };
  return { ...base, ...kinds[disabled && kind === 'primary' ? 'disabled' : kind], opacity: disabled && kind !== 'primary' ? 0.65 : 1 };
}

const inputStyle = {
  border: `2px solid ${C.line}`, background: '#fbfcfe', borderRadius: '12px', padding: '11px 14px',
  fontSize: '16px', color: C.ink, outline: 'none', minHeight: '46px', fontFamily: 'inherit',
};

function Notice({ tone = 'amber', children, onClose }) {
  const looks = {
    amber: { bg: '#fff8ec', border: '#f5d38a', fg: '#9a6400' },
    blue: { bg: '#f0f7ff', border: '#cce0f5', fg: C.blue },
  };
  const l = looks[tone];
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px',
      background: l.bg, border: `1.5px solid ${l.border}`, borderRadius: '14px', padding: '12px 16px', marginBottom: '14px',
    }}>
      <p style={{ margin: 0, color: l.fg, fontWeight: 600, fontSize: '14px', lineHeight: 1.5 }}>{children}</p>
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Dismiss"
          style={{ background: 'none', border: 'none', color: l.fg, fontSize: '16px', fontWeight: 700, cursor: 'pointer', padding: 0, lineHeight: 1 }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function formatNames(names) {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true });
}

// "Coming by 5:30 PM" for a waiting patient who said when they can reach the clinic
function ArrivalChip({ patient, now }) {
  if (!patient.arrival_by) return null;
  const at = new Date(patient.arrival_by);
  if (isNaN(at.getTime())) return null;

  const time = at
    .toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
  const passed = at.getTime() <= now;

  return (
    <Chip tone={passed ? 'green' : 'amber'} style={{ marginTop: '6px', padding: '3px 10px', fontSize: '12px' }}>
      {passed ? `Said they'd be here by ${time}` : `Coming by ${time}`}
    </Chip>
  );
}

// The token number as a bold tile
function TokenTile({ number, tone = 'light', rejoined = false }) {
  const looks = {
    navy: { bg: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', fg: 'white' },
    red: { bg: '#ffe3e3', fg: C.red },
    light: { bg: '#eaf0f7', fg: C.navy },
  };
  const l = looks[tone] || looks.light;
  return (
    <div style={{
      minWidth: '54px', height: '54px', padding: '0 10px', borderRadius: '14px', background: l.bg, color: l.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: '19px',
      flexShrink: 0, fontVariantNumeric: 'tabular-nums',
    }}>
      #{number}
      {rejoined && <span style={{ fontSize: '11px', marginLeft: '3px', opacity: 0.85 }}>R</span>}
    </div>
  );
}

function QueueRow({ p, index, now }) {
  const first = index === 0;
  const rejoined = p.checkin_status === 'rejoined';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '11px 12px', borderRadius: '14px',
      background: first ? '#f0f7ff' : rejoined ? '#fff8f0' : '#fafbfd',
      border: `1.5px solid ${first ? C.blue : rejoined ? '#f0c9a0' : C.line}`,
    }}>
      <TokenTile number={p.token_number} tone={first ? 'navy' : 'light'} rejoined={rejoined} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: C.ink, wordBreak: 'break-word' }}>{formatNames(p.names)}</p>
        <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: C.mute }}>
          {p.num_patients === 1 ? '1 person' : `Group of ${p.num_patients}`} · joined {formatTime(p.created_at)}
          {rejoined && <span style={{ color: '#e67e22' }}> · back after skip</span>}
        </p>
        <ArrivalChip patient={p} now={now} />
      </div>
      {first && <Chip tone="navy">Next</Chip>}
    </div>
  );
}

export default function Admin() {
  useAdminStyles();

  const { slug, clinic, api, socket } = useClinic();
  // Separate login per clinic, even in the same browser
  const storageKey = `cq_admin_token:${slug}`;

  const [fullQueue, setFullQueue] = useState([]);
  const [skippedList, setSkippedList] = useState([]);
  const [qrCode, setQrCode] = useState('');
  const [calledPatient, setCalledPatient] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(clinic.isPaused);
  const [pauseLoading, setPauseLoading] = useState(false);

  // Online token limit (only shown when the clinic uses one)
  const [capacity, setCapacity] = useState(null);
  const [limitInput, setLimitInput] = useState('');
  const [limitSaving, setLimitSaving] = useState(false);

  // Ticks so "Coming by 5:30 PM" turns green once that time has passed
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  // Walk-in form (people count is typed as text so the box can be emptied while typing)
  const [walkName, setWalkName] = useState('');
  const [walkCount, setWalkCount] = useState('1');
  const [walkLoading, setWalkLoading] = useState(false);
  const [walkResult, setWalkResult] = useState({ type: '', text: '' });

  // ── Staff auth ──────────────────────────────────────────────────────
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [pinError, setPinError] = useState('');

  useEffect(() => {
    const token = sessionStorage.getItem(storageKey);
    if (!token) {
      setCheckingAuth(false);
      return;
    }
    fetch(`${api}/admin/verify`, { headers: { 'x-admin-token': token } })
      .then(r => {
        if (r.ok) setAuthed(true);
        else sessionStorage.removeItem(storageKey);
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false));
  }, [api, storageKey]);

  const lockDashboard = (reason = '') => {
    sessionStorage.removeItem(storageKey);
    setAuthed(false);
    setPin('');
    setPinError(reason);
  };

  // Every staff request goes through this — returns null if the session is invalid
  const adminFetch = async (path, options = {}) => {
    const res = await fetch(`${api}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        'x-admin-token': sessionStorage.getItem(storageKey) || '',
      },
    });
    if (res.status === 401) {
      lockDashboard('Session expired. Please enter the PIN again.');
      return null;
    }
    return res;
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinError('');
    try {
      const res = await fetch(`${api}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem(storageKey, data.token);
        setPin('');
        setAuthed(true);
      } else {
        setPinError(data.error || 'Incorrect PIN');
      }
    } catch {
      setPinError('Could not reach server');
    }
  };

  // ── Initial data ────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${api}/qrcode`)
      .then(r => r.json())
      .then(d => setQrCode(d.qrCode))
      .catch(() => {});

    fetch(`${api}/queue/full`)
      .then(r => r.json())
      .then(data => {
        setFullQueue(data.queue || []);
        setSkippedList(data.skipped || []);
        setCalledPatient((data.queue || []).find(p => p.status === 'called') || null);
      })
      .catch(() => {});

    fetch(`${api}/queue/paused`)
      .then(r => r.json())
      .then(d => setIsPaused(d.paused))
      .catch(() => {});
  }, [api]);

  // ── Live updates for this clinic ────────────────────────────────────
  useEffect(() => {
    const onQueue = (queue) => {
      setFullQueue(queue);
      setCalledPatient(queue.find(p => p.status === 'called') || null);
    };
    const onCalled = (called) => setCalledPatient(called);
    const onAutoSkip = (p) => {
      const reasonText = p.skip_reason === 'manual' ? 'manually skipped by staff' : 'auto-skipped — no-show';
      setMessage(`Token #${p.token_number} (${formatNames(p.names)}) was ${reasonText}.`);
      setCalledPatient(null);
    };
    const onCancelled = (p) => {
      setMessage(`Token #${p.token_number} (${formatNames(p.names)}) was cancelled by the patient.`);
    };

    socket.on('full-queue-updated', onQueue);
    socket.on('skipped-list-updated', setSkippedList);
    socket.on('patient-called', onCalled);
    socket.on('auto-skip-occurred', onAutoSkip);
    socket.on('patient-cancelled', onCancelled);
    socket.on('queue-paused-updated', setIsPaused);

    return () => {
      socket.off('full-queue-updated', onQueue);
      socket.off('skipped-list-updated', setSkippedList);
      socket.off('patient-called', onCalled);
      socket.off('auto-skip-occurred', onAutoSkip);
      socket.off('patient-cancelled', onCancelled);
      socket.off('queue-paused-updated', setIsPaused);
    };
  }, [socket]);

  // How many online spots are used (updates live)
  useEffect(() => {
    const load = () => {
      fetch(`${api}/capacity`, { cache: 'no-store' })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (!data) return;
          setCapacity(data);
          setLimitInput(prev => (prev === '' ? String(data.limit ?? '') : prev));
        })
        .catch(() => {});
    };
    load();
    socket.on('full-queue-updated', load);
    socket.on('capacity-updated', load);
    return () => {
      socket.off('full-queue-updated', load);
      socket.off('capacity-updated', load);
    };
  }, [api, socket]);

  // Change today's online limit (null = back to the usual limit)
  const saveLimit = async (limit) => {
    if (limitSaving) return;
    setLimitSaving(true);
    setMessage('');
    try {
      const res = await adminFetch('/admin/limit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit }),
      });
      if (!res) return;
      const data = await res.json();
      if (data.success) {
        setCapacity(data.capacity);
        setLimitInput(String(data.capacity.limit ?? ''));
      } else {
        setMessage(data.message || 'Could not change the limit.');
      }
    } catch (err) {
      setMessage('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLimitSaving(false);
    }
  };

  // ── Actions ─────────────────────────────────────────────────────────
  const runAction = async (path, showMessageAlways) => {
    if (loading) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await adminFetch(path, { method: 'POST' });
      if (!res) return;
      const data = await res.json();
      if (data.message && (showMessageAlways || !data.success)) setMessage(data.message);
    } catch (err) {
      setMessage('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = () => runAction('/admin/action', true);
  const handleSkip = () => runAction('/admin/skip', false);
  const handleManualCheckin = () => runAction('/admin/checkin', false);

  const handleTogglePause = async () => {
    if (pauseLoading) return;
    setPauseLoading(true);
    try {
      const res = await adminFetch('/admin/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: !isPaused }),
      });
      if (!res) return;
      const data = await res.json();
      if (data.success) setIsPaused(data.paused);
    } catch (err) {
      console.error(err);
    } finally {
      setPauseLoading(false);
    }
  };

  // Only digits, at most 2 characters
  const handleWalkCountChange = (e) => {
    setWalkCount(e.target.value.replace(/\D/g, '').slice(0, 2));
  };

  // Add a patient who has no phone
  const handleWalkIn = async (e) => {
    e.preventDefault();
    if (walkLoading) return;

    const count = walkCount === '' ? 1 : parseInt(walkCount, 10);
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      setWalkResult({ type: 'error', text: 'Number of people must be from 1 to 10.' });
      return;
    }

    setWalkLoading(true);
    setWalkResult({ type: '', text: '' });
    try {
      const res = await adminFetch('/admin/walkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: walkName, numPatients: count }),
      });
      if (!res) return;
      const data = await res.json();
      if (data.success) {
        setWalkResult({
          type: 'ok',
          text: `Token #${data.patient.token_number} added for ${formatNames(data.patient.names)}. Give them this number.`,
        });
        setWalkName('');
        setWalkCount('1');
      } else {
        setWalkResult({ type: 'error', text: data.message || data.error || 'Could not add the patient.' });
      }
    } catch (err) {
      setWalkResult({ type: 'error', text: 'Something went wrong. Please try again.' });
      console.error(err);
    } finally {
      setWalkLoading(false);
    }
  };

  // ── Derived state ───────────────────────────────────────────────────
  const waitingQueue = fullQueue.filter(p => p.status === 'waiting');
  const waitingPeople = waitingQueue.reduce((sum, p) => sum + p.num_patients, 0);
  const queueEmpty = waitingQueue.length === 0 && !calledPatient;
  const mainDisabled = loading || queueEmpty;
  const schedule = clinic.schedule;

  const buttonLabel = () => {
    if (loading) return 'Please wait...';
    if (queueEmpty) return 'Queue is empty';
    if (calledPatient) return 'Done & call next  →';
    return 'Call next patient  →';
  };

  // ── Waiting for the saved login ─────────────────────────────────────
  if (checkingAuth) {
    return (
      <div className="cqa-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: C.soft }}>Checking access...</p>
      </div>
    );
  }

  // ── PIN screen ──────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div className="cqa-page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form
          onSubmit={handlePinSubmit}
          style={{ ...cardStyle, width: '100%', maxWidth: '340px', padding: '32px 28px', textAlign: 'center', boxShadow: '0 12px 36px rgba(30,58,95,0.12)' }}
        >
          <p style={{ margin: '0 0 18px', fontSize: '12px', fontWeight: 800, letterSpacing: '4px', color: '#bbb', textTransform: 'uppercase' }}>
            Clinic<span style={{ color: C.blue }}>Q</span> · Staff
          </p>
          <div style={{
            width: '58px', height: '58px', margin: '0 auto 14px', borderRadius: '16px', fontSize: '26px',
            background: 'linear-gradient(150deg,#1e3a5f,#2d6a9f)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 20px rgba(30,58,95,0.25)',
          }}>
            🔒
          </div>
          <p style={{ margin: '0 0 4px', fontSize: '18px', fontWeight: 800, color: C.navy }}>{clinic.name}</p>
          <p style={{ margin: '0 0 20px', fontSize: '13px', color: C.mute }}>Enter the staff PIN to continue</p>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="PIN"
            autoFocus
            style={{ ...inputStyle, width: '100%', textAlign: 'center', fontSize: '20px', letterSpacing: '6px', marginBottom: '12px' }}
          />
          {pinError && <p style={{ margin: '0 0 12px', color: C.red, fontSize: '13px', lineHeight: 1.45 }}>{pinError}</p>}
          <button type="submit" className="cqa-btn" style={{ ...btn('primary'), width: '100%' }}>Unlock</button>
        </form>
      </div>
    );
  }

  const confirmed = calledPatient?.checkin_status === 'confirmed';

  // ── Dashboard ───────────────────────────────────────────────────────
  return (
    <div className="cqa-page">
      <div className="cqa-wrap">

        {/* ── Header ── */}
        <header className="cqa-top">
          <div style={{ minWidth: 0 }}>
            <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 800, letterSpacing: '3px', color: '#b3bcc7', textTransform: 'uppercase' }}>
              Clinic<span style={{ color: C.blue }}>Q</span> · Staff
            </p>
            <h1 className="cqa-h1" style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: C.navy, letterSpacing: '-0.3px' }}>
              {clinic.name}
            </h1>
            <div className="cqa-chips">
              {schedule?.mode === 'sessions' && schedule.sessionLabel && (
                <Chip tone="grey">🕒 {schedule.sessionLabel}</Chip>
              )}
              <Chip tone="blue">{waitingQueue.length} waiting · {waitingPeople} {waitingPeople === 1 ? 'person' : 'people'}</Chip>
              {skippedList.length > 0 && <Chip tone="red">{skippedList.length} skipped</Chip>}
              {isPaused && <Chip tone="amber">Registrations paused</Chip>}
            </div>
          </div>

          <div className="cqa-actions">
            <button
              className="cqa-btn"
              onClick={handleTogglePause}
              disabled={pauseLoading}
              style={btn(isPaused ? 'warn' : 'ghost', pauseLoading)}
            >
              {isPaused ? '▶ Resume' : '⏸ Pause'}
            </button>
            <a className="cqa-btn" href={`/c/${slug}/display`} target="_blank" rel="noreferrer" style={btn('outline')}>
              📺 Display
            </a>
            <button className="cqa-btn" onClick={() => lockDashboard()} style={btn('ghost')}>
              🔒 Lock
            </button>
          </div>
        </header>

        {/* ── Notices ── */}
        {isPaused && (
          <Notice tone="amber">
            ⏸ Online registrations are paused. Patients cannot join by themselves — you can still add walk-in patients.
          </Notice>
        )}

        {!isPaused && schedule?.mode === 'sessions' && !schedule.bookingOpen && (
          <Notice tone="blue">
            🕒 Online booking is closed. {schedule.message} You can keep serving the queue and add walk-ins.
          </Notice>
        )}

        {message && <Notice tone="amber" onClose={() => setMessage('')}>{message}</Notice>}

        <div className="cqa-main">

          {/* ════════ Left column: serve patients ════════ */}
          <div className="cqa-col">

            {/* ── Now serving ── */}
            <Card
              className="cqa-now"
              title="Now serving"
              right={calledPatient && (
                <Chip tone={confirmed ? 'green' : 'amber'}>
                  {confirmed ? '✓ Patient is inside' : '⏳ Waiting for patient to arrive'}
                </Chip>
              )}
            >
              {calledPatient ? (
                <div className="cqa-serving">
                  <div style={{
                    minWidth: '116px', padding: '14px 18px', borderRadius: '18px', textAlign: 'center',
                    background: 'linear-gradient(150deg,#1e3a5f,#2d6a9f)', color: 'white',
                    boxShadow: '0 10px 24px rgba(30,58,95,0.25)', fontSize: '50px', fontWeight: 900, lineHeight: 1,
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    #{calledPatient.token_number}
                    {calledPatient.checkin_status === 'rejoined' && (
                      <span style={{ fontSize: '22px', marginLeft: '4px', opacity: 0.8 }}>R</span>
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontSize: '22px', fontWeight: 800, color: C.ink, wordBreak: 'break-word' }}>
                      {formatNames(calledPatient.names)}
                    </p>
                    <p style={{ margin: '0 0 8px', fontSize: '13.5px', color: C.mute }}>
                      {calledPatient.num_patients === 1 ? '1 person' : `Group of ${calledPatient.num_patients}`}
                    </p>
                    <p style={{ margin: 0, fontSize: '12.5px', color: C.soft, lineHeight: 1.45 }}>
                      {confirmed
                        ? 'Tap the button below when the patient leaves.'
                        : "The patient taps \"I'm Here\" on their phone when they arrive."}
                    </p>
                  </div>
                </div>
              ) : (
                <div style={{
                  textAlign: 'center', padding: '22px 12px', marginBottom: '16px', borderRadius: '14px',
                  background: '#f7f9fc', border: `1.5px dashed ${C.line}`,
                }}>
                  <div style={{ fontSize: '30px', marginBottom: '6px', opacity: 0.45 }}>🩺</div>
                  <p style={{ margin: 0, fontSize: '14px', color: C.mute, fontWeight: 600 }}>
                    {queueEmpty ? 'No patients in the queue' : 'Ready for the next patient'}
                  </p>
                </div>
              )}

              <button
                className="cqa-btn"
                onClick={handleAction}
                disabled={mainDisabled}
                style={{
                  ...btn(calledPatient ? 'success' : 'primary', mainDisabled),
                  width: '100%', minHeight: '56px', fontSize: '16px', fontWeight: 800,
                  ...(mainDisabled ? { background: '#eef1f5', color: '#aab3bf', boxShadow: 'none' } : {}),
                }}
              >
                {buttonLabel()}
              </button>

              {calledPatient && (
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {!confirmed && (
                    <button
                      className="cqa-btn"
                      onClick={handleManualCheckin}
                      disabled={loading}
                      style={{ ...btn('okOutline', loading), flex: '1 1 160px' }}
                    >
                      ✓ Confirm check-in
                    </button>
                  )}
                  <button
                    className="cqa-btn"
                    onClick={handleSkip}
                    disabled={loading}
                    style={{ ...btn('danger', loading), flex: '1 1 160px' }}
                  >
                    Skip this patient
                  </button>
                </div>
              )}

              {waitingQueue.length > 0 && (
                <div style={{
                  marginTop: '14px', padding: '10px 14px', borderRadius: '12px', background: '#f7f9fc',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px',
                }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: C.soft, textTransform: 'uppercase', letterSpacing: '1px' }}>
                    Next up
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: C.navy, textAlign: 'right' }}>
                    #{waitingQueue[0].token_number} — {formatNames(waitingQueue[0].names)}
                    <br />
                    <ArrivalChip patient={waitingQueue[0]} now={now} />
                  </span>
                </div>
              )}
            </Card>

            {/* ── Waiting queue ── */}
            <Card
              className="cqa-waiting"
              title="Waiting queue"
              right={<Chip tone="blue">{waitingQueue.length} {waitingQueue.length === 1 ? 'token' : 'tokens'} · {waitingPeople} {waitingPeople === 1 ? 'person' : 'people'}</Chip>}
            >
              {waitingQueue.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#c3cad3', padding: '22px 0 12px', margin: 0, fontSize: '14px' }}>
                  Queue is empty
                </p>
              ) : (
                <div className="cqa-scroll" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {waitingQueue.map((p, i) => <QueueRow key={p.id} p={p} index={i} now={now} />)}
                </div>
              )}
            </Card>
          </div>

          {/* ════════ Right column: manage ════════ */}
          <div className="cqa-col">

            {/* ── Walk-in ── */}
            <Card
              className="cqa-walkin"
              title="Add walk-in patient"
              subtitle="For patients without a phone. Works even while registrations are paused. They go to the end of the queue."
            >
              <form onSubmit={handleWalkIn}>
                <div className="cqa-walkrow">
                  <input
                    style={{ ...inputStyle, flex: '1 1 160px', minWidth: 0 }}
                    value={walkName}
                    maxLength={60}
                    onChange={e => setWalkName(e.target.value)}
                    placeholder="Name (optional)"
                    autoComplete="off"
                  />
                  <input
                    style={{ ...inputStyle, flex: '0 0 84px', width: '84px', textAlign: 'center', fontWeight: 700 }}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={walkCount}
                    onChange={handleWalkCountChange}
                    onFocus={e => e.target.select()}
                    placeholder="1"
                    aria-label="Number of people (1 to 10)"
                    autoComplete="off"
                  />
                  <button
                    type="submit"
                    className="cqa-btn"
                    disabled={walkLoading}
                    style={{ ...btn('primary', walkLoading), flex: '1 1 110px' }}
                  >
                    {walkLoading ? 'Adding...' : 'Add'}
                  </button>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: '11.5px', color: '#b5bdc8' }}>Number of people: 1 to 10</p>

                {walkResult.text && (
                  <p style={{
                    margin: '12px 0 0', fontSize: '14px', fontWeight: 600, lineHeight: 1.45,
                    color: walkResult.type === 'ok' ? '#00875f' : '#cc0000',
                  }}>
                    {walkResult.text}
                  </p>
                )}
              </form>
            </Card>

            {/* ── Online token limit (only shown when the clinic uses one) ── */}
            {capacity && capacity.limit !== null && (
              <Card
                className="cqa-tokens"
                title={`Online tokens${capacity.sessionName ? ` · ${capacity.sessionName}` : ''}`}
                right={<Chip tone={capacity.limitReached ? 'red' : 'blue'}>{capacity.onlinePeople} / {capacity.limit} people</Chip>}
              >
                <div style={{ height: '10px', borderRadius: '10px', background: '#eef1f5', overflow: 'hidden', marginBottom: '10px' }}>
                  <div style={{
                    height: '100%', borderRadius: '10px', transition: 'width 0.3s',
                    width: `${Math.min(100, Math.round((capacity.onlinePeople / capacity.limit) * 100))}%`,
                    background: capacity.limitReached ? C.red : 'linear-gradient(135deg,#1e3a5f,#2d6a9f)',
                  }} />
                </div>

                <p style={{ margin: '0 0 14px', fontSize: '13px', color: C.mute, lineHeight: 1.5 }}>
                  {capacity.limitReached
                    ? 'Online tokens are full — patients can no longer register online.'
                    : `${capacity.spotsLeft} online spot${capacity.spotsLeft === 1 ? '' : 's'} left.`}
                  {' '}Walk-ins don't count towards the limit.
                </p>

                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <button className="cqa-btn" onClick={() => saveLimit(capacity.limit + 5)} disabled={limitSaving} style={btn('outline', limitSaving)}>
                    +5
                  </button>
                  <button className="cqa-btn" onClick={() => saveLimit(capacity.limit + 10)} disabled={limitSaving} style={btn('outline', limitSaving)}>
                    +10
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={limitInput}
                    onChange={e => setLimitInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    aria-label="Online token limit for today"
                    style={{ ...inputStyle, width: '84px', textAlign: 'center', fontWeight: 700, padding: '9px 10px' }}
                  />
                  <button className="cqa-btn" onClick={() => saveLimit(Number(limitInput))} disabled={limitSaving} style={btn('primary', limitSaving)}>
                    {limitSaving ? 'Saving...' : 'Set limit'}
                  </button>
                </div>

                {capacity.overridden && (
                  <button
                    onClick={() => saveLimit(null)}
                    disabled={limitSaving}
                    style={{ marginTop: '12px', background: 'none', border: 'none', color: C.mute, fontSize: '13px', fontWeight: 600, textDecoration: 'underline', cursor: 'pointer', padding: '4px 0' }}
                  >
                    Back to the usual limit ({capacity.defaultLimit})
                  </button>
                )}
              </Card>
            )}

            {/* ── Skipped ── */}
            {skippedList.length > 0 && (
              <Card
                className="cqa-skipped"
                title="Skipped (no-shows)"
                subtitle="They can rejoin from their own token page. They go to the end of the queue."
                right={<Chip tone="red">{skippedList.length}</Chip>}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {skippedList.map(p => (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', borderRadius: '14px',
                      background: '#fff7f7', border: '1.5px solid #ffdede',
                    }}>
                      <TokenTile number={p.token_number} tone="red" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: '14.5px', fontWeight: 700, color: '#555', wordBreak: 'break-word' }}>{formatNames(p.names)}</p>
                        <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: C.mute }}>
                          {p.num_patients === 1 ? '1 person' : `Group of ${p.num_patients}`}
                        </p>
                      </div>
                      <Chip tone="red">No-show</Chip>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* ── QR code ── */}
            <Card className="cqa-qr" title="Scan to join the queue" style={{ textAlign: 'center' }}>
              {qrCode ? (
                <img
                  src={qrCode}
                  alt="QR code to join the queue"
                  style={{ width: '170px', height: '170px', maxWidth: '100%', borderRadius: '12px', border: `1px solid ${C.line}` }}
                />
              ) : (
                <div style={{ width: '170px', height: '170px', maxWidth: '100%', background: '#f0f4f8', borderRadius: '12px', margin: '0 auto' }} />
              )}
              <p style={{ margin: '12px 0 0', fontSize: '12.5px', color: C.soft }}>Display this at the clinic entrance</p>
            </Card>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#c3cad3', marginTop: '28px', letterSpacing: '3px', fontWeight: 700 }}>
          CLINIC<span style={{ color: C.blue }}>Q</span>
        </p>
      </div>
    </div>
  );
}