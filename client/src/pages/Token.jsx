import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { io } from 'socket.io-client';
import SERVER from '../config';

const socket = io(SERVER);

function formatNames(names) {
  if (!names || names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} & ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} & ${names[names.length - 1]}`;
}

function formatCountdown(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatRegisteredAt(dateStr) {
  if (!dateStr) return { date: '', time: '' };

  // SQLite datetime('now') stores UTC but without 'Z' suffix
  // Add Z to tell JS it's UTC
  const utcStr = dateStr.includes('Z') ? dateStr : dateStr + 'Z';
  const d = new Date(utcStr);

  const date = d.toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });

  const time = d.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kolkata'
  });

  return { date, time };
}

function TopBar() {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
      <span style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '3px', color: '#bbb', textTransform: 'uppercase' }}>
        Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
      </span>
      <span style={{ fontSize: '11px', color: '#ddd', letterSpacing: '1px' }}>Your Token</span>
    </div>
  );
}

export default function Token() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isExisting = location.state?.existing;

  const [patient, setPatient] = useState(null);
  const [fullQueue, setFullQueue] = useState([]);
  const [skippedList, setSkippedList] = useState([]);
  const [avgMins, setAvgMins] = useState(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(null);
  const [checkedIn, setCheckedIn] = useState(false);
  const [wasSkipped, setWasSkipped] = useState(false);
  const [rejoining, setRejoining] = useState(false);

  const fetchPatient = useCallback(() => {
    fetch(`${SERVER}/api/patient/${id}`)
      .then(r => r.json())
      .then(data => { setPatient(data); setLoading(false); });
  }, [id]);

  useEffect(() => {
    setPatient(null);
    setLoading(true);
    setCountdown(null);
    setCheckedIn(false);
    setWasSkipped(false);
    setRejoining(false);

    fetchPatient();
    fetch(`${SERVER}/api/queue/full`)
      .then(r => r.json())
      .then(data => {
        setFullQueue(data.queue);
        setSkippedList(data.skipped);
        setAvgMins(data.avgMinsPerPerson);
      });
  }, [id, fetchPatient]);

  useEffect(() => {
    if (!patient?.checkin_deadline || patient.status !== 'called' || checkedIn) return;
    const deadline = new Date(patient.checkin_deadline).getTime();
    const tick = setInterval(() => {
      const remaining = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setCountdown(remaining);
      if (remaining === 0) clearInterval(tick);
    }, 1000);
    return () => clearInterval(tick);
  }, [patient, checkedIn]);

  useEffect(() => {
    socket.on('full-queue-updated', setFullQueue);
    socket.on('skipped-list-updated', setSkippedList);
    socket.on('avg-updated', setAvgMins);
    socket.on('patient-called', (called) => {
      if (called.id === parseInt(id)) {
        setPatient(prev => ({ ...prev, ...called }));
        const deadline = new Date(called.checkin_deadline).getTime();
        setCountdown(Math.max(0, Math.floor((deadline - Date.now()) / 1000)));
  }
});
    socket.on('patient-skipped', (skipped) => {
      if (skipped.id === parseInt(id)) {
        setPatient(prev => ({ ...prev, status: 'skipped' }));
        setWasSkipped(true);
      }
    });
    socket.on('checkin-confirmed', ({ patientId }) => {
      if (patientId === parseInt(id)) setCheckedIn(true);
    });
    return () => {
      socket.off('full-queue-updated');
      socket.off('skipped-list-updated');
      socket.off('avg-updated');
      socket.off('patient-called');
      socket.off('patient-skipped');
      socket.off('checkin-confirmed');
    };
  }, [id]);

  const handleCheckin = async () => {
    const res = await fetch(`${SERVER}/api/checkin/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) setCheckedIn(true);
  };

  const handleRejoin = async () => {
    setRejoining(true);
    const res = await fetch(`${SERVER}/api/rejoin/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      navigate(`/token/${data.patient.id}`);
    } else {
      setRejoining(false);
    }
  };

  const activeQueue = fullQueue.filter(p => p.status === 'waiting' || p.status === 'called');
  const myIndex = activeQueue.findIndex(p => p.id === parseInt(id));

  const peopleAhead = activeQueue
    .slice(0, myIndex)
    .reduce((sum, p) => sum + p.num_patients, 0);

  const estimatedMins = avgMins !== null && myIndex > 0
    ? Math.round(peopleAhead * avgMins)
    : null;

  const formatEstimate = (mins) => {
    if (mins < 1) return 'Less than a minute';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `~${m} min`;
  };

  const isSkipped = (patient?.status === 'skipped' || wasSkipped) && !rejoining;
  const isRejoined = patient?.checkin_status === 'rejoined';
  const isCalled = patient?.status === 'called';
  const isWaiting = patient?.status === 'waiting';
  const isDone = patient?.status === 'done';

  const registeredAt = formatRegisteredAt(patient?.created_at);

  const S = {
    page: { minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Segoe UI',sans-serif", padding: '16px' },
    card: { background: 'white', borderRadius: '20px', padding: '24px', marginBottom: '16px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' },
  };

  if (loading) return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#bbb' }}>Loading your token...</p>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={{ maxWidth: '420px', margin: '0 auto' }}>

        <TopBar />

        {/* Welcome back banner */}
        {isExisting && (
          <div style={{ background: 'linear-gradient(135deg,#0984e3,#74b9ff)', borderRadius: '16px', padding: '14px 18px', marginBottom: '16px', textAlign: 'center' }}>
            <p style={{ color: 'white', fontWeight: '700', fontSize: '14px', margin: 0 }}>
              Welcome back! You already have an active token today.
            </p>
          </div>
        )}

        {/* Called alert */}
        {isCalled && !checkedIn && (
          <div style={{ background: 'linear-gradient(135deg,#ff8c00,#ffa500)', borderRadius: '20px', padding: '24px', marginBottom: '16px', textAlign: 'center', boxShadow: '0 8px 24px rgba(255,140,0,0.4)' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>🔔</div>
            <p style={{ color: 'white', fontWeight: '800', fontSize: '20px', margin: '0 0 6px' }}>It's your turn!</p>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: '0 0 16px' }}>
              Confirm you are present or your token will be skipped
            </p>
            <div style={{ fontSize: '52px', fontWeight: '900', color: 'white', marginBottom: '16px', fontVariantNumeric: 'tabular-nums' }}>
              {countdown !== null ? formatCountdown(countdown) : '--:--'}
            </div>
            <button onClick={handleCheckin}
              style={{ width: '100%', background: 'white', color: '#ff8c00', border: 'none', borderRadius: '12px', padding: '16px', fontSize: '16px', fontWeight: '800', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
              I'm Here ✓
            </button>
          </div>
        )}

        {/* Checked in */}
        {isCalled && checkedIn && (
          <div style={{ background: 'linear-gradient(135deg,#00b894,#00cec9)', borderRadius: '20px', padding: '20px', marginBottom: '16px', textAlign: 'center', boxShadow: '0 8px 24px rgba(0,184,148,0.35)' }}>
            <div style={{ fontSize: '28px', marginBottom: '6px' }}>✅</div>
            <p style={{ color: 'white', fontWeight: '700', fontSize: '16px', margin: 0 }}>Checked in! Please proceed to the counter.</p>
          </div>
        )}

        {/* Skipped */}
        {isSkipped && (
          <div style={{ background: 'linear-gradient(135deg,#d63031,#e17055)', borderRadius: '20px', padding: '24px', marginBottom: '16px', textAlign: 'center', boxShadow: '0 8px 24px rgba(214,48,49,0.35)' }}>
            <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏰</div>
            <p style={{ color: 'white', fontWeight: '800', fontSize: '18px', margin: '0 0 6px' }}>You were skipped</p>
            <p style={{ color: 'rgba(255,255,255,0.85)', fontSize: '13px', margin: '0 0 16px' }}>
              You did not check in within the time limit.
            </p>
            <button onClick={handleRejoin} disabled={rejoining}
              style={{ width: '100%', background: 'white', color: '#d63031', border: 'none', borderRadius: '12px', padding: '14px', fontSize: '15px', fontWeight: '800', cursor: rejoining ? 'not-allowed' : 'pointer', opacity: rejoining ? 0.7 : 1 }}>
              {rejoining ? 'Rejoining...' : 'Rejoin Queue →'}
            </button>
          </div>
        )}

        {/* ── TOKEN CARD ── */}
        <div style={{
          background: 'white',
          borderRadius: '20px',
          padding: '24px',
          marginBottom: '16px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.07)',
          // Subtle dotted border to make it feel like a ticket
          border: '2px dashed #e8eef5',
        }}>

          {/* Top label */}
          <p style={{ textAlign: 'center', fontSize: '11px', fontWeight: '700', color: '#bbb', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '4px' }}>
            Token Number
          </p>

          {/* Big token number */}
          <div style={{ fontSize: '96px', fontWeight: '900', color: '#1e3a5f', lineHeight: 1, textAlign: 'center' }}>
            {patient?.token_number}
          </div>

          {/* ── TIMESTAMP — subtle, part of the ticket ── */}
          {registeredAt.date && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '6px',
              marginBottom: '4px',
            }}>
              {/* Left line */}
              <div style={{ flex: 1, height: '1px', background: '#f0f0f0' }} />
              <div style={{ textAlign: 'center' }}>
                <span style={{
                  fontSize: '11px',
                  color: '#c8d6e5',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                }}>
                  {registeredAt.date}
                </span>
                <span style={{
                  fontSize: '11px',
                  color: '#c8d6e5',
                  fontWeight: '600',
                  margin: '0 6px',
                }}>
                  ·
                </span>
                <span style={{
                  fontSize: '11px',
                  color: '#c8d6e5',
                  fontWeight: '600',
                  letterSpacing: '0.5px',
                }}>
                  {registeredAt.time}
                </span>
              </div>
              {/* Right line */}
              <div style={{ flex: 1, height: '1px', background: '#f0f0f0' }} />
            </div>
          )}

          {/* Status badge */}
          <div style={{ textAlign: 'center', marginTop: '10px' }}>
            {isRejoined && (
              <span style={{ background: '#fff3e0', color: '#e67e22', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' }}>
                Rejoined at end of queue
              </span>
            )}
            {isSkipped && (
              <span style={{ background: '#fff0f0', color: '#e74c3c', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' }}>
                Skipped
              </span>
            )}
            {isCalled && !checkedIn && (
              <span style={{ background: '#fff8e1', color: '#f39c12', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' }}>
                Called
              </span>
            )}
            {isCalled && checkedIn && (
              <span style={{ background: '#e8f8f5', color: '#00b894', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' }}>
                Checked In
              </span>
            )}
            {isWaiting && !isRejoined && (
              <span style={{ background: '#f0f7ff', color: '#2d6a9f', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' }}>
                Waiting
              </span>
            )}
            {isDone && (
              <span style={{ background: '#f0fff4', color: '#27ae60', fontSize: '12px', fontWeight: '700', padding: '4px 12px', borderRadius: '20px' }}>
                Done
              </span>
            )}
          </div>

          {/* Divider — ticket tear line */}
          <div style={{
            margin: '16px -24px',
            borderTop: '2px dashed #f0f4f8',
            position: 'relative',
          }}>
            <div style={{ position: 'absolute', left: '-10px', top: '-10px', width: '20px', height: '20px', background: '#f0f4f8', borderRadius: '50%' }} />
            <div style={{ position: 'absolute', right: '-10px', top: '-10px', width: '20px', height: '20px', background: '#f0f4f8', borderRadius: '50%' }} />
          </div>

          {/* Name section */}
          <div style={{ background: '#f7f9fc', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
            <p style={{ fontSize: '11px', color: '#bbb', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '4px' }}>
              {patient?.num_patients === 1 ? 'Patient' : 'Registered By'}
            </p>
            <p style={{ fontSize: '18px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 4px' }}>
              {formatNames(patient?.names)}
            </p>
            {patient?.num_patients > 1 && (
              <p style={{ fontSize: '12px', color: '#bbb', margin: 0 }}>Group of {patient.num_patients} people</p>
            )}
          </div>

          {/* Waiting info */}
          {isWaiting && (
            <div style={{ marginTop: '16px' }}>
              <div style={{ textAlign: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: '#f0f7ff', borderRadius: '14px', padding: '16px 32px' }}>
                  <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px' }}>People ahead of you</p>
                  <p style={{ fontSize: '40px', fontWeight: '900', color: '#1e3a5f', margin: '0 0 4px' }}>{peopleAhead}</p>
                  <p style={{ fontSize: '11px', color: '#bbb', margin: 0 }}>Updates in real-time</p>
                </div>
              </div>

              {estimatedMins !== null && (
                <div style={{ background: '#fffbf0', border: '1.5px solid #fdebd0', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#e67e22', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 6px' }}>
                    Estimated Wait
                  </p>
                  <p style={{ fontSize: '32px', fontWeight: '900', color: '#e67e22', margin: '0 0 6px' }}>
                    {formatEstimate(estimatedMins)}
                  </p>
                  <p style={{ fontSize: '11px', color: '#bbb', margin: 0 }}>
                    Based on {avgMins} min/person avg · Just an estimate, may vary
                  </p>
                </div>
              )}

              {avgMins === null && myIndex > 0 && (
                <div style={{ background: '#f9f9f9', border: '1px solid #eee', borderRadius: '14px', padding: '12px 16px', textAlign: 'center' }}>
                  <p style={{ fontSize: '12px', color: '#bbb', margin: 0 }}>
                    Wait estimate will appear once a few patients have been seen
                  </p>
                </div>
              )}
            </div>
          )}

          {isDone && (
            <div style={{ marginTop: '16px', background: '#f0fff4', borderRadius: '14px', padding: '16px', textAlign: 'center' }}>
              <p style={{ color: '#27ae60', fontWeight: '700', margin: 0 }}>Visit complete. Thank you!</p>
            </div>
          )}

          {/* ClinicQ brand at bottom of ticket */}
          <p style={{ textAlign: 'center', fontSize: '11px', color: '#ddd', marginTop: '20px', marginBottom: 0, letterSpacing: '2px', fontWeight: '700' }}>
            CLINIC<span style={{ color: '#2d6a9f' }}>Q</span>
          </p>
        </div>

        {/* Live Queue */}
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e3a5f', margin: 0 }}>Live Queue</h2>
            <span style={{ background: '#f0f4f8', color: '#888', fontSize: '12px', fontWeight: '600', padding: '4px 10px', borderRadius: '20px' }}>
              {activeQueue.length} waiting
            </span>
          </div>

          {activeQueue.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#bbb', fontSize: '14px', padding: '16px 0' }}>Queue is empty</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '320px', overflowY: 'auto' }}>
              {activeQueue.map((entry) => {
                const isMe = entry.id === parseInt(id);
                const entryRejoined = entry.checkin_status === 'rejoined';
                const entryCalled = entry.status === 'called';
                const entryIndex = activeQueue.findIndex(e => e.id === entry.id);
                const peopleBeforeEntry = activeQueue
                  .slice(0, entryIndex)
                  .reduce((sum, p) => sum + p.num_patients, 0);
                const entryEstimate = avgMins !== null && entryIndex > 0
                  ? Math.round(peopleBeforeEntry * avgMins)
                  : null;

                return (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', borderRadius: '12px',
                    background: isMe ? '#f0f7ff' : entryCalled ? '#fffbf0' : entryRejoined ? '#fff8f0' : '#f9f9f9',
                    border: `2px solid ${isMe ? '#2d6a9f' : entryCalled ? '#f39c12' : entryRejoined ? '#e67e22' : '#efefef'}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '16px', color: isMe ? '#1e3a5f' : '#bbb' }}>
                        #{entry.token_number}{entryRejoined && <span style={{ color: '#e67e22', fontSize: '11px' }}>R</span>}
                      </span>
                      <div>
                        <p style={{ margin: 0, fontSize: '14px', fontWeight: isMe ? '700' : '500', color: isMe ? '#1e3a5f' : '#444' }}>
                          {isMe ? 'You' : formatNames(entry.names)}
                        </p>
                        <p style={{ margin: 0, fontSize: '11px', color: '#bbb' }}>
                          {entry.num_patients > 1 ? `Group of ${entry.num_patients}` : '1 person'}
                          {entryEstimate !== null && !entryCalled && (
                            <span style={{ color: '#e67e22', marginLeft: '6px' }}>· ~{entryEstimate} min wait</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <span style={{
                      fontSize: '11px', fontWeight: '700', padding: '4px 10px', borderRadius: '20px',
                      background: entryCalled ? '#fef3cd' : entryRejoined ? '#fde8d0' : isMe ? '#dbeafe' : '#f0f0f0',
                      color: entryCalled ? '#d68910' : entryRejoined ? '#e67e22' : isMe ? '#1e3a5f' : '#bbb',
                    }}>
                      {entryCalled ? 'Called' : entryRejoined ? 'Rejoined' : isMe ? 'You' : 'Waiting'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {activeQueue.some(e => e.checkin_status === 'rejoined') && (
            <div style={{ marginTop: '12px', background: '#fff8f0', border: '1px solid #fde8d0', borderRadius: '10px', padding: '10px 14px' }}>
              <p style={{ margin: 0, fontSize: '12px', color: '#e67e22' }}>
                <strong>R</strong> = This person was skipped earlier and rejoined at the end. They are not skipping the line.
              </p>
            </div>
          )}
        </div>

        {/* Skipped list */}
        {skippedList.length > 0 && (
          <div style={S.card}>
            <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1e3a5f', margin: '0 0 16px' }}>Recently Skipped</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {skippedList.map(entry => (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '12px', background: '#fff5f5', border: '1.5px solid #ffd5d5' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: '800', fontSize: '15px', color: '#e74c3c' }}>#{entry.token_number}</span>
                    <span style={{ fontSize: '14px', color: '#666' }}>{formatNames(entry.names)}</span>
                  </div>
                  <span style={{ fontSize: '11px', fontWeight: '700', background: '#ffd5d5', color: '#e74c3c', padding: '4px 10px', borderRadius: '20px' }}>No-show</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}