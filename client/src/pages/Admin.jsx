import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import SERVER from '../config';

const socket = io(SERVER);

function formatNames(names) {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export default function Admin() {
  const [fullQueue, setFullQueue] = useState([]);
  const [skippedList, setSkippedList] = useState([]);
  const [qrCode, setQrCode] = useState('');
  const [calledPatient, setCalledPatient] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // ── Admin PIN auth ──────────────────────────────────────────────────
  const [pin, setPin] = useState('');
  const [authed, setAuthed] = useState(() => sessionStorage.getItem('cq_admin_token') === 'admin-session');
  const [pinError, setPinError] = useState('');

  const handlePinSubmit = async (e) => {
    e.preventDefault();
    setPinError('');
    try {
      const res = await fetch(`${SERVER}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem('cq_admin_token', data.token);
        setAuthed(true);
      } else {
        setPinError('Incorrect PIN');
      }
    } catch {
      setPinError('Could not reach server');
    }
  };

  // ── Initial data fetch ──────────────────────────────────────────────
  useEffect(() => {
    fetch(`${SERVER}/api/qrcode`)
      .then(r => r.json())
      .then(d => setQrCode(d.qrCode));

    fetch(`${SERVER}/api/queue/full`)
      .then(r => r.json())
      .then(data => {
        setFullQueue(data.queue);
        setSkippedList(data.skipped);
        const called = data.queue.find(p => p.status === 'called');
        if (called) setCalledPatient(called);
      });
  }, []);

  // ── Socket listeners ─────────────────────────────────────────────────
  useEffect(() => {
    socket.on('full-queue-updated', (queue) => {
      setFullQueue(queue);
      const called = queue.find(p => p.status === 'called');
      setCalledPatient(called || null);
    });

    socket.on('skipped-list-updated', setSkippedList);

    socket.on('patient-called', (called) => {
      setCalledPatient(called);
    });

    socket.on('auto-skip-occurred', (p) => {
      setMessage(`Token #${p.token_number} (${formatNames(p.names)}) was auto-skipped — no-show.`);
      setCalledPatient(null);
    });

    return () => {
      socket.off('full-queue-updated');
      socket.off('skipped-list-updated');
      socket.off('patient-called');
      socket.off('auto-skip-occurred');
    };
  }, []);

  // ── Single button handler ────────────────────────────────────────────
  const handleAction = async () => {
    if (loading) return;
    setLoading(true);
    setMessage('');
    try {
      const res = await fetch(`${SERVER}/api/admin/action`, {
        method: 'POST',
        headers: { 'x-admin-token': sessionStorage.getItem('cq_admin_token') },
      });
      const data = await res.json();
      if (data.message) setMessage(data.message);
    } catch (err) {
      setMessage('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── Derived state ─────────────────────────────────────────────────────
  const waitingQueue = fullQueue.filter(p => p.status === 'waiting');
  const queueEmpty = waitingQueue.length === 0 && !calledPatient;

  // ── Button label ──────────────────────────────────────────────────────
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
    page: { minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Segoe UI',sans-serif", padding: '24px' },
    card: { background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' },
  };

  // ── PIN gate screen ───────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Segoe UI',sans-serif" }}>
        <form onSubmit={handlePinSubmit} style={{ background: 'white', borderRadius: '20px', padding: '32px', width: '300px', boxShadow: '0 8px 30px rgba(0,0,0,0.1)', textAlign: 'center' }}>
          <p style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '3px', color: '#bbb', marginBottom: '16px' }}>STAFF ACCESS</p>
          <input
            type="password"
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
    <div style={S.page}>
      <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '3px', color: '#bbb', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
            </p>
            <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#1e3a5f', margin: 0 }}>Admin Dashboard</h1>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <span style={{ background: '#dbeafe', color: '#1e3a5f', padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '700' }}>
              {waitingQueue.length} Waiting
            </span>
            {skippedList.length > 0 && (
              <span style={{ background: '#ffd5d5', color: '#e74c3c', padding: '8px 16px', borderRadius: '20px', fontSize: '14px', fontWeight: '700' }}>
                {skippedList.length} Skipped
              </span>
            )}
          </div>
        </div>

        {/* ── Notification ── */}
        {message && (
          <div style={{ background: '#fffbf0', border: '1.5px solid #f39c12', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px' }}>
            <p style={{ margin: 0, color: '#d68910', fontWeight: '600', fontSize: '14px' }}>{message}</p>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>

          {/* ── QR Code ── */}
          <div style={{ ...S.card, textAlign: 'center' }}>
            <p style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '3px', color: '#ddd', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
            </p>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 16px' }}>Scan to Join Queue</h2>
            {qrCode
              ? <img src={qrCode} alt="QR" style={{ width: '180px', height: '180px', borderRadius: '12px' }} />
              : <div style={{ width: '180px', height: '180px', background: '#f0f4f8', borderRadius: '12px', margin: '0 auto' }} />
            }
            <p style={{ fontSize: '12px', color: '#bbb', marginTop: '12px', marginBottom: 0 }}>
              Display at clinic entrance
            </p>
          </div>

          {/* ── Current Patient + Button ── */}
          <div style={S.card}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 16px' }}>
              {calledPatient ? 'Now Serving' : 'No Patient Called'}
            </h2>

            {/* Current patient info */}
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
                  {calledPatient.checkin_status === 'confirmed'
                    ? '✓ Patient is inside'
                    : '⏳ Waiting for patient to arrive...'}
                </div>
                <p style={{ fontSize: '12px', color: '#bbb', margin: '4px 0 0' }}>
                  {calledPatient.checkin_status === 'confirmed'
                    ? 'Click the button below when patient leaves'
                    : "Patient will tap \"I'm Here\" when they arrive"}
                </p>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px 0', color: '#ccc', fontSize: '14px', marginBottom: '16px' }}>
                {queueEmpty
                  ? 'No patients in queue'
                  : 'Press the button to call the next patient'}
              </div>
            )}

            {/* ── THE SINGLE BUTTON ── */}
            <button
              onClick={handleAction}
              disabled={loading || queueEmpty}
              style={{
                width: '100%',
                background: buttonBg(),
                color: loading || queueEmpty ? '#bbb' : 'white',
                border: 'none',
                borderRadius: '14px',
                padding: '16px',
                fontSize: '16px',
                fontWeight: '800',
                cursor: loading || queueEmpty ? 'not-allowed' : 'pointer',
                boxShadow: buttonShadow(),
                transition: 'all 0.2s',
                letterSpacing: '0.3px',
              }}
            >
              {buttonLabel()}
            </button>

            {/* Next up preview */}
            {waitingQueue.length > 0 && (
              <div style={{
                marginTop: '12px', background: '#f7f9fc', borderRadius: '12px',
                padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
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
                  padding: '14px 18px', borderRadius: '14px',
                  background: i === 0 ? '#f0f7ff' : p.checkin_status === 'rejoined' ? '#fff8f0' : '#f9f9f9',
                  border: `2px solid ${i === 0 ? '#2d6a9f' : p.checkin_status === 'rejoined' ? '#e67e22' : '#efefef'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '22px', fontWeight: '900', color: i === 0 ? '#1e3a5f' : '#ccc' }}>
                      #{p.token_number}
                      {p.checkin_status === 'rejoined' && (
                        <span style={{ color: '#e67e22', fontSize: '14px' }}>R</span>
                      )}
                    </span>
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: '600', color: '#333', fontSize: '15px' }}>
                        {formatNames(p.names)}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#bbb' }}>
                        Group of {p.num_patients} · {new Date(p.created_at + (p.created_at.includes('Z') ? '' : 'Z')).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}
                        {p.checkin_status === 'rejoined' && (
                          <span style={{ color: '#e67e22', marginLeft: '6px' }}>· Rejoined</span>
                        )}
                      </p>
                    </div>
                  </div>
                  {i === 0 && (
                    <span style={{ background: '#1e3a5f', color: 'white', fontSize: '12px', fontWeight: '700', padding: '6px 14px', borderRadius: '20px' }}>
                      Next
                    </span>
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
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 18px', borderRadius: '14px',
                  background: '#fff5f5', border: '1.5px solid #ffd5d5',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: '20px', fontWeight: '900', color: '#e74c3c' }}>
                      #{p.token_number}
                    </span>
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: '600', color: '#555', fontSize: '14px' }}>
                        {formatNames(p.names)}
                      </p>
                      <p style={{ margin: 0, fontSize: '12px', color: '#bbb' }}>
                        Group of {p.num_patients}
                      </p>
                    </div>
                  </div>
                  <span style={{ background: '#ffd5d5', color: '#e74c3c', fontSize: '12px', fontWeight: '700', padding: '6px 14px', borderRadius: '20px' }}>
                    No-show
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Footer ── */}
        <p style={{ textAlign: 'center', fontSize: '11px', color: '#ccc', marginTop: '32px', letterSpacing: '3px', fontWeight: '700' }}>
          CLINIC<span style={{ color: '#2d6a9f' }}>Q</span>
        </p>

      </div>
    </div>
  );
}