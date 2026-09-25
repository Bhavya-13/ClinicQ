import { useEffect, useState } from 'react';
import { useClinic } from '../clinic';

function formatNames(names) {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export default function Admin() {
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

    socket.on('full-queue-updated', onQueue);
    socket.on('skipped-list-updated', setSkippedList);
    socket.on('patient-called', onCalled);
    socket.on('auto-skip-occurred', onAutoSkip);
    socket.on('queue-paused-updated', setIsPaused);

    return () => {
      socket.off('full-queue-updated', onQueue);
      socket.off('skipped-list-updated', setSkippedList);
      socket.off('patient-called', onCalled);
      socket.off('auto-skip-occurred', onAutoSkip);
      socket.off('queue-paused-updated', setIsPaused);
    };
  }, [socket]);

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

  // ── Derived state ───────────────────────────────────────────────────
  const waitingQueue = fullQueue.filter(p => p.status === 'waiting');
  const queueEmpty = waitingQueue.length === 0 && !calledPatient;

  const buttonLabel = () => {
    if (loading) return 'Please wait...';
    if (queueEmpty) return 'Queue is Empty';
    if (calledPatient) return 'Done & Call Next →';
    return 'Call Next Patient →';
  };

  const buttonBg = () => {
    if (loading || queueEmpty) return '#eee';
    if (calledPatient) return 'linear-gradient(135deg,#27ae60,#2ecc71)';
    return 'linear-gradient(135deg,#1e3a5f,#2d6a9f)';
  };

  const buttonShadow = () => {
    if (loading || queueEmpty) return 'none';
    if (calledPatient) return '0 4px 14px rgba(39,174,96,0.35)';
    return '0 4px 14px rgba(30,58,95,0.3)';
  };

  const S = {
    page: { minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Segoe UI',sans-serif", padding: '24px', boxSizing: 'border-box' },
    card: { background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', boxSizing: 'border-box' },
    pill: { padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '700' },
  };

  if (checkingAuth) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI',sans-serif" }}>
        <p style={{ color: '#bbb' }}>Checking access...</p>
      </div>
    );
  }

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI',sans-serif", padding: '16px', boxSizing: 'border-box' }}>
        <form onSubmit={handlePinSubmit} style={{ background: 'white', borderRadius: '20px', padding: '32px', width: '100%', maxWidth: '320px', boxShadow: '0 8px 30px rgba(0,0,0,0.1)', textAlign: 'center', boxSizing: 'border-box' }}>
          <p style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '3px', color: '#bbb', margin: '0 0 6px' }}>STAFF ACCESS</p>
          <p style={{ fontSize: '16px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 18px' }}>{clinic.name}</p>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="Enter PIN"
            style={{ width: '100%', border: '2px solid #e8e8e8', borderRadius: '10px', padding: '12px', fontSize: '16px', textAlign: 'center', marginBottom: '12px', boxSizing: 'border-box' }}
            autoFocus
          />
          {pinError && <p style={{ color: '#e74c3c', fontSize: '13px', marginBottom: '12px' }}>{pinError}</p>}
          <button type="submit" style={{ width: '100%', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '10px', padding: '12px', fontWeight: '700', cursor: 'pointer' }}>
            Unlock
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="cq-admin-page" style={S.page}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* ── Header ── */}
        <div className="cq-admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '3px', color: '#bbb', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Clinic<span style={{ color: '#2d6a9f' }}>Q</span> · Staff
            </p>
            <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#1e3a5f', margin: 0 }}>{clinic.name}</h1>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ ...S.pill, background: '#dbeafe', color: '#1e3a5f' }}>
              {waitingQueue.length} Waiting
            </span>
            {skippedList.length > 0 && (
              <span style={{ ...S.pill, background: '#ffd5d5', color: '#e74c3c' }}>
                {skippedList.length} Skipped
              </span>
            )}
            <button
              onClick={handleTogglePause}
              disabled={pauseLoading}
              style={{
                ...S.pill,
                background: isPaused ? '#fef3cd' : '#f0f4f8',
                color: isPaused ? '#d68910' : '#555',
                border: `2px solid ${isPaused ? '#f39c12' : '#e0e0e0'}`,
                cursor: pauseLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {isPaused ? '▶ Resume Registrations' : '⏸ Pause Registrations'}
            </button>
            <a
              href={`/c/${slug}/display`}
              target="_blank"
              rel="noreferrer"
              style={{ ...S.pill, background: 'white', color: '#2d6a9f', border: '2px solid #dbeafe', textDecoration: 'none' }}
            >
              📺 Display
            </a>
            <button
              onClick={() => lockDashboard()}
              style={{ ...S.pill, background: 'white', color: '#888', border: '2px solid #e0e0e0', cursor: 'pointer' }}
            >
              🔒 Lock
            </button>
          </div>
        </div>

        {isPaused && (
          <div style={{ background: '#fff3e0', border: '1.5px solid #f39c12', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px' }}>
            <p style={{ margin: 0, color: '#d68910', fontWeight: '700', fontSize: '14px' }}>⏸ Registrations are currently paused. Patients cannot join the queue.</p>
          </div>
        )}

        {message && (
          <div style={{ background: '#fffbf0', border: '1.5px solid #f39c12', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px' }}>
            <p style={{ margin: 0, color: '#d68910', fontWeight: '600', fontSize: '14px' }}>{message}</p>
          </div>
        )}

        <div className="cq-admin-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

          {/* ── QR Code ── */}
          <div style={{ ...S.card, textAlign: 'center' }}>
            <p style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '3px', color: '#ddd', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
            </p>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 16px' }}>Scan to Join Queue</h2>
            {qrCode
              ? <img src={qrCode} alt="QR code to join the queue" style={{ width: '180px', height: '180px', borderRadius: '12px', maxWidth: '100%' }} />
              : <div style={{ width: '180px', height: '180px', background: '#f0f4f8', borderRadius: '12px', margin: '0 auto', maxWidth: '100%' }} />
            }
            <p style={{ fontSize: '12px', color: '#bbb', marginTop: '12px', marginBottom: 0 }}>
              Display at clinic entrance
            </p>
          </div>

          {/* ── Current Patient + Buttons ── */}
          <div style={S.card}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 16px' }}>
              {calledPatient ? 'Now Serving' : 'No Patient Called'}
            </h2>

            {calledPatient ? (
              <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                <div style={{ fontSize: '72px', fontWeight: '900', color: '#27ae60', lineHeight: 1, marginBottom: '8px' }}>
                  #{calledPatient.token_number}
                  {calledPatient.checkin_status === 'rejoined' && (
                    <span style={{ fontSize: '32px', color: '#e67e22' }}>R</span>
                  )}
                </div>
                <p style={{ fontSize: '20px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 4px' }}>
                  {formatNames(calledPatient.names)}
                </p>
                <p style={{ fontSize: '13px', color: '#bbb', margin: '0 0 12px' }}>
                  Group of {calledPatient.num_patients}
                </p>
                <div style={{
                  display: 'inline-block', padding: '8px 18px', borderRadius: '20px', marginBottom: '6px',
                  background: calledPatient.checkin_status === 'confirmed' ? '#d5f5e3' : '#fef3cd',
                  color: calledPatient.checkin_status === 'confirmed' ? '#27ae60' : '#d68910',
                  fontSize: '13px', fontWeight: '700',
                }}>
                  {calledPatient.checkin_status === 'confirmed' ? '✓ Patient is inside' : '⏳ Waiting for patient to arrive...'}
                </div>
                <p style={{ fontSize: '12px', color: '#bbb', margin: '4px 0 0' }}>
                  {calledPatient.checkin_status === 'confirmed'
                    ? 'Click the button below when patient leaves'
                    : "Patient will tap \"I'm Here\" when they arrive"}
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#ccc', fontSize: '14px', marginBottom: '16px' }}>
                {queueEmpty ? 'No patients in queue' : 'Press the button to call the next patient'}
              </div>
            )}

            <button
              onClick={handleAction}
              disabled={loading || queueEmpty}
              style={{
                width: '100%', background: buttonBg(), color: loading || queueEmpty ? '#bbb' : 'white',
                border: 'none', borderRadius: '14px', padding: '16px', fontSize: '16px', fontWeight: '800',
                cursor: loading || queueEmpty ? 'not-allowed' : 'pointer', boxShadow: buttonShadow(),
                transition: 'all 0.2s', letterSpacing: '0.3px',
              }}
            >
              {buttonLabel()}
            </button>

            {calledPatient && (
              <div style={{ display: 'flex', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
                {calledPatient.checkin_status !== 'confirmed' && (
                  <button
                    onClick={handleManualCheckin}
                    disabled={loading}
                    style={{ flex: '1 1 140px', background: 'white', color: '#27ae60', border: '2px solid #d5f5e3', borderRadius: '14px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer' }}
                  >
                    Confirm Check-In Manually
                  </button>
                )}
                <button
                  onClick={handleSkip}
                  disabled={loading}
                  style={{ flex: '1 1 140px', background: 'white', color: '#e74c3c', border: '2px solid #ffd5d5', borderRadius: '14px', padding: '12px', fontSize: '14px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer' }}
                >
                  Skip This Patient
                </button>
              </div>
            )}

            {waitingQueue.length > 0 && (
              <div style={{ marginTop: '12px', background: '#f7f9fc', borderRadius: '12px', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ fontSize: '12px', color: '#aaa' }}>Next up</span>
                <span style={{ fontSize: '13px', fontWeight: '700', color: '#1e3a5f' }}>
                  #{waitingQueue[0].token_number} — {formatNames(waitingQueue[0].names)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Waiting Queue ── */}
        <div style={{ ...S.card, marginBottom: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 16px' }}>Waiting Queue</h2>
          {waitingQueue.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#ccc', padding: '24px 0', fontSize: '14px' }}>Queue is empty</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {waitingQueue.map((p, i) => (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px', borderRadius: '14px', flexWrap: 'wrap', gap: '10px',
                  background: i === 0 ? '#f0f7ff' : p.checkin_status === 'rejoined' ? '#fff8f0' : '#f9f9f9',
                  border: `2px solid ${i === 0 ? '#2d6a9f' : p.checkin_status === 'rejoined' ? '#e67e22' : '#efefef'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: '900', color: i === 0 ? '#1e3a5f' : '#ccc' }}>
                      #{p.token_number}
                      {p.checkin_status === 'rejoined' && <span style={{ color: '#e67e22', fontSize: '14px' }}>R</span>}
                    </span>
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: '600', color: '#333', fontSize: '15px' }}>{formatNames(p.names)}</p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#bbb' }}>
                        Group of {p.num_patients} · {new Date(p.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}
                        {p.checkin_status === 'rejoined' && <span style={{ color: '#e67e22', marginLeft: '6px' }}>· Rejoined</span>}
                      </p>
                    </div>
                  </div>
                  {i === 0 && (
                    <span style={{ background: '#1e3a5f', color: 'white', fontSize: '12px', fontWeight: '700', padding: '6px 14px', borderRadius: '20px' }}>Next</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Skipped ── */}
        {skippedList.length > 0 && (
          <div style={S.card}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 16px' }}>Skipped (No-shows)</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {skippedList.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', padding: '14px 18px', borderRadius: '14px', background: '#fff5f5', border: '1.5px solid #ffd5d5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: '900', color: '#e74c3c' }}>#{p.token_number}</span>
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: '600', color: '#555', fontSize: '14px' }}>{formatNames(p.names)}</p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#bbb' }}>Group of {p.num_patients}</p>
                    </div>
                  </div>
                  <span style={{ background: '#ffd5d5', color: '#e74c3c', fontSize: '12px', fontWeight: '700', padding: '6px 14px', borderRadius: '20px' }}>No-show</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#ccc', marginTop: '32px', letterSpacing: '3px', fontWeight: '700' }}>
          CLINIC<span style={{ color: '#2d6a9f' }}>Q</span>
        </p>

      </div>
    </div>
  );
}