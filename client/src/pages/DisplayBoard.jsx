import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://`${window.location.hostname}:3001');

function formatNames(names) {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

export default function DisplayBoard() {
  const [fullQueue, setFullQueue] = useState([]);
  const [skippedList, setSkippedList] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    fetch('http://`${window.location.hostname}:3001/api/queue/full')
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

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f1b2d 0%, #1e3a5f 50%, #0f1b2d 100%)', fontFamily: "'Segoe UI', sans-serif", padding: '32px', color: 'white' }}>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '36px' }}>
        <div>
          <p style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '4px', color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', margin: '0 0 4px' }}>
            Clinic<span style={{ color: 'rgba(116,185,255,0.5)' }}>Q</span>
          </p>
          <h1 style={{ fontSize: '34px', fontWeight: '900', margin: '0 0 4px', letterSpacing: '-0.5px' }}>City Clinic</h1>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', margin: 0 }}>Live Queue Status</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: '34px', fontWeight: '800', color: '#74b9ff', margin: '0 0 2px', fontVariantNumeric: 'tabular-nums' }}>
            {currentTime.toLocaleTimeString()}
          </p>
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '13px', margin: 0 }}>
            {currentTime.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 0.8fr', gap: '24px' }}>

        {/* NOW SERVING */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.3)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>Now Serving</p>

          {calledPatient ? (
            <div style={{ background: 'linear-gradient(135deg, #00b894, #00cec9)', borderRadius: '24px', padding: '36px 24px', textAlign: 'center', boxShadow: '0 20px 60px rgba(0,184,148,0.35)' }}>
              <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '12px', margin: '0 0 8px', letterSpacing: '2px', textTransform: 'uppercase' }}>Token</p>
              <div style={{ fontSize: '120px', fontWeight: '900', lineHeight: 1, color: 'white' }}>
                {calledPatient.token_number}
                {calledPatient.checkin_status === 'rejoined' && <span style={{ fontSize: '48px', color: 'rgba(255,255,255,0.6)' }}>R</span>}
              </div>
              <p style={{ fontSize: '24px', fontWeight: '700', color: 'white', margin: '12px 0 4px' }}>{formatNames(calledPatient.names)}</p>
              {calledPatient.num_patients > 1 && (
                <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '14px', margin: '0 0 16px' }}>Group of {calledPatient.num_patients}</p>
              )}
              <div style={{
                display: 'inline-block', padding: '8px 20px', borderRadius: '20px', fontSize: '13px', fontWeight: '700',
                background: calledPatient.checkin_status === 'confirmed' ? 'rgba(255,255,255,0.25)' : 'rgba(255,200,0,0.3)',
                color: 'white',
              }}>
                {calledPatient.checkin_status === 'confirmed' ? '✓ Checked In' : '⏳ Waiting for check-in...'}
              </div>
            </div>
          ) : (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '24px', padding: '60px 24px', textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '16px', margin: 0 }}>No patient called yet</p>
            </div>
          )}

          {nextPatient && (
            <div style={{ marginTop: '16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '20px', textAlign: 'center' }}>
              <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 8px' }}>Up Next</p>
              <p style={{ fontSize: '40px', fontWeight: '900', color: '#fdcb6e', margin: '0 0 4px' }}>
                #{nextPatient.token_number}
                {nextPatient.checkin_status === 'rejoined' && <span style={{ fontSize: '20px', color: '#e67e22' }}>R</span>}
              </p>
              <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: '16px', margin: 0 }}>{formatNames(nextPatient.names)}</p>
              {nextPatient.num_patients > 1 && (
                <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: '12px', margin: '4px 0 0' }}>Group of {nextPatient.num_patients}</p>
              )}
            </div>
          )}
        </div>

        {/* WAITING LIST */}
        <div>
          <p style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.3)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>
            Waiting ({waitingPatients.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {waitingPatients.length === 0 && (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '32px', textAlign: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '14px', margin: 0 }}>No one waiting</p>
              </div>
            )}
            {waitingPatients.slice(0, 9).map((p, i) => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '14px',
                background: i === 0 ? 'rgba(253,203,110,0.12)' : p.checkin_status === 'rejoined' ? 'rgba(230,126,34,0.12)' : 'rgba(255,255,255,0.05)',
                border: `1px solid ${i === 0 ? 'rgba(253,203,110,0.35)' : p.checkin_status === 'rejoined' ? 'rgba(230,126,34,0.35)' : 'rgba(255,255,255,0.07)'}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '18px', color: i === 0 ? '#fdcb6e' : 'rgba(255,255,255,0.5)' }}>
                    #{p.token_number}{p.checkin_status === 'rejoined' && <span style={{ color: '#e67e22', fontSize: '12px' }}>R</span>}
                  </span>
                  <div>
                    <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: 'rgba(255,255,255,0.8)' }}>{formatNames(p.names)}</p>
                    {p.num_patients > 1 && <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}>Group of {p.num_patients}</p>}
                  </div>
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px',
                  background: p.checkin_status === 'rejoined' ? 'rgba(230,126,34,0.25)' : i === 0 ? 'rgba(253,203,110,0.25)' : 'rgba(255,255,255,0.07)',
                  color: p.checkin_status === 'rejoined' ? '#e67e22' : i === 0 ? '#fdcb6e' : 'rgba(255,255,255,0.35)',
                }}>
                  {p.checkin_status === 'rejoined' ? 'Rejoined' : i === 0 ? 'Next' : 'Waiting'}
                </span>
              </div>
            ))}
            {waitingPatients.length > 9 && (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: '13px', margin: '4px 0 0' }}>
                +{waitingPatients.length - 9} more in queue
              </p>
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          <div>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.3)', letterSpacing: '3px', textTransform: 'uppercase', marginBottom: '12px' }}>Skipped</p>
            {skippedList.length === 0 ? (
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '20px', textAlign: 'center' }}>
                <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '13px', margin: 0 }}>None so far</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {skippedList.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', background: 'rgba(231,76,60,0.12)', border: '1px solid rgba(231,76,60,0.25)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: '800', color: '#e74c3c', fontSize: '16px' }}>#{p.token_number}</span>
                      <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{formatNames(p.names)}</span>
                    </div>
                    <span style={{ fontSize: '10px', fontWeight: '700', background: 'rgba(231,76,60,0.25)', color: '#e74c3c', padding: '3px 8px', borderRadius: '20px' }}>No-show</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {hasRejoined && (
            <div style={{ background: 'rgba(230,126,34,0.12)', border: '1px solid rgba(230,126,34,0.25)', borderRadius: '14px', padding: '16px' }}>
              <p style={{ color: '#e67e22', fontWeight: '700', fontSize: '13px', margin: '0 0 6px' }}>About R (Rejoined)</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '12px', margin: 0, lineHeight: 1.6 }}>
                Patients marked <strong style={{ color: '#e67e22' }}>R</strong> were called but did not check in. They rejoined at the end and are <strong>not skipping</strong> the line.
              </p>
            </div>
          )}

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '16px' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: 'rgba(255,255,255,0.3)', letterSpacing: '2px', textTransform: 'uppercase', margin: '0 0 12px' }}>Legend</p>
            {[
              { color: '#00b894', label: 'Currently being served' },
              { color: '#fdcb6e', label: 'Next in line' },
              { color: '#e67e22', label: 'Rejoined after skip' },
              { color: '#e74c3c', label: 'No-show / Skipped' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: color, flexShrink: 0 }} />
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.5)' }}>{label}</span>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
            <p style={{ color: 'rgba(255,255,255,0.2)', fontSize: '12px', margin: '0 0 10px', lineHeight: 1.5 }}>
              Scan the QR code at the entrance to join the queue
            </p>
            <p style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '3px', color: 'rgba(255,255,255,0.15)', margin: 0 }}>
              CLINIC<span style={{ color: 'rgba(116,185,255,0.35)' }}>Q</span>
            </p>
          </div>

        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: '11px', fontWeight: '800', letterSpacing: '4px', color: 'rgba(255,255,255,0.08)', marginTop: '40px', marginBottom: 0 }}>
        CLINIC<span style={{ color: 'rgba(116,185,255,0.15)' }}>Q</span>
      </p>

    </div>
  );
}
