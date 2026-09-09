import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import SERVER from '../config';

const socket = io(SERVER);

function formatNames(names) {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

// Injects keyframes once into the document head
function useGlobalStyles() {
  useEffect(() => {
    const id = 'clinicq-display-board-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
      @keyframes cq-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(45,106,159,0.35), 0 20px 50px rgba(30,58,95,0.25); }
        70%  { box-shadow: 0 0 0 18px rgba(45,106,159,0), 0 20px 50px rgba(30,58,95,0.25); }
        100% { box-shadow: 0 0 0 0 rgba(45,106,159,0), 0 20px 50px rgba(30,58,95,0.25); }
      }
      @keyframes cq-pop {
        0%   { transform: scale(0.95); opacity: 0.6; }
        60%  { transform: scale(1.015); opacity: 1; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes cq-slide-in {
        0%   { transform: translateX(-14px); opacity: 0; }
        100% { transform: translateX(0); opacity: 1; }
      }
      .cq-now-serving { animation: cq-pulse 2.2s ease-out infinite, cq-pop 0.5s ease-out; }
      .cq-row-enter { animation: cq-slide-in 0.35s ease-out; }
    `;
    document.head.appendChild(style);
  }, []);
}

export default function DisplayBoard() {
  useGlobalStyles();

  const [fullQueue, setFullQueue] = useState([]);
  const [skippedList, setSkippedList] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const prevCalledId = useRef(null);
  const [justCalled, setJustCalled] = useState(false);

  useEffect(() => {
    fetch(`${SERVER}/api/queue/full`)
      .then(r => r.json())
      .then(data => { setFullQueue(data.queue); setSkippedList(data.skipped); });

    socket.on('full-queue-updated', setFullQueue);
    socket.on('skipped-list-updated', setSkippedList);
    const clock = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      socket.off('full-queue-updated');
      socket.off('skipped-list-updated');
      clearInterval(clock);
    };
  }, []);

  const calledPatient = fullQueue.find(p => p.status === 'called');
  const waitingPatients = fullQueue.filter(p => p.status === 'waiting');
  const nextPatient = waitingPatients[0];
  const hasRejoined = fullQueue.some(p => p.checkin_status === 'rejoined');

  // Trigger a brief "just called" pulse whenever the served token changes
  useEffect(() => {
    if (calledPatient && calledPatient.id !== prevCalledId.current) {
      prevCalledId.current = calledPatient.id;
      setJustCalled(true);
      const t = setTimeout(() => setJustCalled(false), 3000);
      return () => clearTimeout(t);
    }
    if (!calledPatient) prevCalledId.current = null;
  }, [calledPatient]);

  // Grace-period progress bar (visual only — server is source of truth for actual skip)
  const [graceRemainingPct, setGraceRemainingPct] = useState(100);
  useEffect(() => {
    if (!calledPatient?.checkin_deadline || calledPatient.checkin_status === 'confirmed') {
      setGraceRemainingPct(100);
      return;
    }
    const deadline = new Date(calledPatient.checkin_deadline).getTime();
    const called = calledPatient.called_at ? new Date(calledPatient.called_at + (calledPatient.called_at.includes('Z') ? '' : 'Z')).getTime() : Date.now();
    const total = Math.max(1, deadline - called);
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now());
      setGraceRemainingPct(Math.round((remaining / total) * 100));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [calledPatient]);

  const S = {
    page: { minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Segoe UI', sans-serif", padding: '32px 40px', boxSizing: 'border-box' },
    card: { background: 'white', borderRadius: '20px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' },
  };

  return (
    <div style={S.page}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '28px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '4px', color: '#ddd', textTransform: 'uppercase', margin: '0 0 6px' }}>
            Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
          </p>
          <h1 style={{ fontSize: '36px', fontWeight: '900', color: '#1e3a5f', margin: '0 0 4px', letterSpacing: '-0.5px' }}>City Clinic</h1>
          <p style={{ color: '#aaa', fontSize: '14px', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00b894', display: 'inline-block' }} />
            Live Queue Status
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '42px', fontWeight: '800', color: '#2d6a9f', margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
            {currentTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}
          </p>
          <p style={{ color: '#bbb', fontSize: '14px', margin: 0 }}>
            {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 0.85fr', gap: '24px' }}>

        {/* ── NOW SERVING ── */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#bbb', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>
            Now Serving
          </p>

          {calledPatient ? (
            <div
              className={justCalled ? 'cq-now-serving' : ''}
              style={{
                background: 'linear-gradient(150deg, #1e3a5f 0%, #2d6a9f 100%)',
                borderRadius: '24px',
                padding: '40px 28px',
                textAlign: 'center',
                boxShadow: '0 20px 50px rgba(30,58,95,0.35)',
              }}
            >
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px', margin: '0 0 8px', letterSpacing: '3px', textTransform: 'uppercase', fontWeight: '700' }}>
                Token
              </p>
              <div style={{ fontSize: '130px', fontWeight: '900', lineHeight: 1, color: 'white' }}>
                {calledPatient.token_number}
                {calledPatient.checkin_status === 'rejoined' && (
                  <span style={{ fontSize: '52px', color: 'rgba(255,255,255,0.55)', verticalAlign: 'super' }}>R</span>
                )}
              </div>
              <p style={{ fontSize: '26px', fontWeight: '700', color: 'white', margin: '14px 0 4px' }}>
                {formatNames(calledPatient.names)}
              </p>
              {calledPatient.num_patients > 1 && (
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '14px', margin: '0 0 18px' }}>
                  Group of {calledPatient.num_patients}
                </p>
              )}

              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '8px 20px', borderRadius: '20px', fontSize: '13px', fontWeight: '700',
                background: calledPatient.checkin_status === 'confirmed' ? 'rgba(255,255,255,0.22)' : 'rgba(255,205,50,0.28)',
                color: 'white', marginBottom: '16px',
              }}>
                {calledPatient.checkin_status === 'confirmed' ? '✓ Checked In' : '⏳ Waiting for check-in'}
              </div>

              {/* Grace-period progress bar (only while awaiting check-in) */}
              {calledPatient.checkin_status !== 'confirmed' && (
                <div style={{ width: '100%', height: '8px', borderRadius: '10px', background: 'rgba(255,255,255,0.2)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${graceRemainingPct}%`,
                    background: graceRemainingPct < 25 ? '#ff8a8a' : 'rgba(255,255,255,0.85)',
                    borderRadius: '10px',
                    transition: 'width 0.5s linear, background 0.3s ease',
                  }} />
                </div>
              )}
            </div>
          ) : (
            <div style={{ ...S.card, padding: '64px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '38px', marginBottom: '10px', opacity: 0.25 }}>🩺</div>
              <p style={{ color: '#ccc', fontSize: '17px', margin: 0 }}>No patient called yet</p>
            </div>
          )}

          {nextPatient && (
            <div style={{ marginTop: '16px', ...S.card, padding: '20px', textAlign: 'center' }}>
              <p style={{ color: '#aaa', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px', fontWeight: '700' }}>
                Up Next
              </p>
              <p style={{ fontSize: '40px', fontWeight: '900', color: '#e67e22', margin: '0 0 4px' }}>
                #{nextPatient.token_number}
                {nextPatient.checkin_status === 'rejoined' && <span style={{ fontSize: '20px', color: '#e67e22' }}>R</span>}
              </p>
              <p style={{ color: '#444', fontSize: '17px', margin: 0, fontWeight: '600' }}>
                {formatNames(nextPatient.names)}
              </p>
              {nextPatient.num_patients > 1 && (
                <p style={{ color: '#bbb', fontSize: '12px', margin: '6px 0 0' }}>
                  Group of {nextPatient.num_patients}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── WAITING LIST ── */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#bbb', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>
            Waiting ({waitingPatients.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {waitingPatients.length === 0 && (
              <div style={{ ...S.card, padding: '36px', textAlign: 'center' }}>
                <p style={{ color: '#ccc', fontSize: '14px', margin: 0 }}>No one waiting 🎉</p>
              </div>
            )}
            {waitingPatients.slice(0, 8).map((p, i) => (
              <div
                key={p.id}
                className="cq-row-enter"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 18px', borderRadius: '14px',
                  background: i === 0 ? '#f0f7ff' : p.checkin_status === 'rejoined' ? '#fff8f0' : '#f9f9f9',
                  border: `2px solid ${i === 0 ? '#2d6a9f' : p.checkin_status === 'rejoined' ? '#e67e22' : '#efefef'}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '19px', color: i === 0 ? '#1e3a5f' : '#ccc' }}>
                    #{p.token_number}{p.checkin_status === 'rejoined' && <span style={{ color: '#e67e22', fontSize: '13px' }}>R</span>}
                  </span>
                  <div>
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#333' }}>{formatNames(p.names)}</p>
                    {p.num_patients > 1 && <p style={{ margin: 0, fontSize: '12px', color: '#bbb' }}>Group of {p.num_patients}</p>}
                  </div>
                </div>
                <span style={{
                  fontSize: '12px', fontWeight: '700', padding: '5px 12px', borderRadius: '20px',
                  background: p.checkin_status === 'rejoined' ? '#fde8d0' : i === 0 ? '#dbeafe' : '#f0f0f0',
                  color: p.checkin_status === 'rejoined' ? '#e67e22' : i === 0 ? '#1e3a5f' : '#bbb',
                }}>
                  {p.checkin_status === 'rejoined' ? 'Rejoined' : i === 0 ? 'Next' : 'Waiting'}
                </span>
              </div>
            ))}
            {waitingPatients.length > 8 && (
              <p style={{ textAlign: 'center', color: '#bbb', fontSize: '13px', margin: '4px 0 0' }}>
                +{waitingPatients.length - 8} more in queue
              </p>
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#bbb', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>
              Skipped
            </p>
            {skippedList.length === 0 ? (
              <div style={{ ...S.card, padding: '20px', textAlign: 'center' }}>
                <p style={{ color: '#ccc', fontSize: '13px', margin: 0 }}>None so far</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {skippedList.map(p => (
                  <div key={p.id} className="cq-row-enter" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', background: '#fff5f5', border: '1.5px solid #ffd5d5' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: '800', color: '#e74c3c', fontSize: '16px' }}>#{p.token_number}</span>
                      <span style={{ fontSize: '13px', color: '#666' }}>{formatNames(p.names)}</span>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: '700', background: '#ffd5d5', color: '#e74c3c', padding: '4px 10px', borderRadius: '20px' }}>No-show</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasRejoined && (
            <div style={{ background: '#fff8f0', border: '1.5px solid #fde8d0', borderRadius: '16px', padding: '16px' }}>
              <p style={{ color: '#e67e22', fontWeight: '700', fontSize: '13px', margin: '0 0 6px' }}>About R (Rejoined)</p>
              <p style={{ color: '#999', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>
                Patients marked <strong style={{ color: '#e67e22' }}>R</strong> were called but did not check in. They rejoined at the end and are <strong>not skipping</strong> the line.
              </p>
            </div>
          )}

          <div style={{ ...S.card, padding: '18px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#bbb', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 14px' }}>
              Legend
            </p>
            {[
              { color: '#00b894', label: 'Currently being served' },
              { color: '#e67e22', label: 'Next in line' },
              { color: '#e67e22', label: 'Rejoined after skip' },
              { color: '#e74c3c', label: 'No-show / Skipped' },
            ].map(({ color, label }, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '9px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: '#888' }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={{ ...S.card, padding: '18px', textAlign: 'center' }}>
            <p style={{ color: '#bbb', fontSize: '12px', margin: '0 0 10px', lineHeight: 1.5 }}>
              Scan the QR code at the entrance to join the queue
            </p>
            <p style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '3px', color: '#ddd', margin: 0 }}>
              CLINIC<span style={{ color: '#2d6a9f' }}>Q</span>
            </p>
          </div>

        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: '11px', fontWeight: '800', letterSpacing: '4px', color: '#ddd', marginTop: '36px', marginBottom: 0 }}>
        CLINIC<span style={{ color: '#2d6a9f' }}>Q</span>
      </p>

    </div>
  );
}