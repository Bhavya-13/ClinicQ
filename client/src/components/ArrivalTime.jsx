import { useEffect, useState } from 'react';
import TimePicker from './TimePicker';

const pad2 = (n) => String(n).padStart(2, '0');

// The IST clock time ("HH:MM") that is `minutes` from now, rounded up to 5 minutes
function istClockPlus(minutes) {
  const d = new Date(Date.now() + (minutes + 330) * 60 * 1000);
  let total = d.getUTCHours() * 60 + d.getUTCMinutes();
  total = (Math.ceil(total / 5) * 5) % 1440;
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
}

function formatClock(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d
    .toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true })
    .toUpperCase();
}

const QUICK = [
  { label: 'In 15 min', minutes: 15 },
  { label: 'In 30 min', minutes: 30 },
  { label: 'In 1 hr', minutes: 60 },
];

const CARD = {
  background: 'white', borderRadius: '20px', padding: '20px', marginBottom: '16px',
  boxShadow: '0 4px 20px rgba(0,0,0,0.07)', boxSizing: 'border-box',
};

function pillStyle(selected, saving) {
  return {
    padding: '10px 16px', borderRadius: '999px', fontSize: '14px', fontWeight: '700', minHeight: '44px',
    cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
    border: selected ? '2px solid #1e3a5f' : '2px solid #dbeafe',
    background: selected ? 'linear-gradient(135deg,#1e3a5f,#2d6a9f)' : 'white',
    color: selected ? 'white' : '#2d6a9f',
  };
}

const LINK_BUTTON = {
  background: 'none', border: 'none', color: '#2d6a9f', fontSize: '13.5px', fontWeight: '700',
  textDecoration: 'underline', cursor: 'pointer', padding: '8px 4px',
};

// "When can you reach the clinic?" — information for the clinic only.
// It never changes the patient's place in the queue.
//   arrivalBy   – ISO time the patient gave (or null)
//   waitMinutes – estimated minutes until this patient's turn (0 = next, null = unknown)
//   onChange    – called with the new arrival time (or null) after a successful save
export default function ArrivalTime({ api, accessToken, arrivalBy, waitMinutes, onChange }) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickedTime, setPickedTime] = useState(() => istClockPlus(30));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  // Keeps "in about 25 min" and the warning fresh
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const save = async (body) => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`${api}/arrival/${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not save. Please try again.');
        return;
      }
      onChange(data.arrival_by);
      setEditing(false);
      setPicking(false);
    } catch {
      setError('Could not reach the clinic. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const arrivalMs = arrivalBy ? new Date(arrivalBy).getTime() : null;
  const hasTime = arrivalMs !== null && !isNaN(arrivalMs);
  const minsToArrival = hasTime ? Math.ceil((arrivalMs - now) / 60000) : null;
  const passed = hasTime && minsToArrival <= 0;
  const turnBeforeArrival =
    hasTime && !passed && waitMinutes !== null && waitMinutes !== undefined && waitMinutes < minsToArrival;
  const clock = hasTime ? formatClock(arrivalBy) : '';
  const showChooser = !hasTime || editing;

  return (
    <div style={CARD}>
      {showChooser ? (
        <>
          <p style={{ margin: '0 0 4px', fontSize: '16px', fontWeight: '700', color: '#1e3a5f' }}>
            🕒 When can you reach the clinic?
          </p>
          <p style={{ margin: '0 0 14px', fontSize: '13px', color: '#8a94a3', lineHeight: 1.5 }}>
            Optional. The clinic sees this next to your token. Your place in the queue doesn't change.
          </p>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {QUICK.map(q => (
              <button
                type="button"
                key={q.minutes}
                disabled={saving}
                onClick={() => save({ minutes: q.minutes })}
                style={pillStyle(false, saving)}
              >
                {q.label}
              </button>
            ))}
            <button
              type="button"
              disabled={saving}
              onClick={() => setPicking(p => !p)}
              style={pillStyle(picking, saving)}
            >
              Pick a time
            </button>
          </div>

          {picking && (
            <div style={{ marginTop: '14px' }}>
              <TimePicker value={pickedTime} onChange={setPickedTime} />
              <button
                type="button"
                disabled={saving}
                onClick={() => save({ time: pickedTime })}
                style={{
                  width: '100%', marginTop: '10px', background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', color: 'white',
                  border: 'none', borderRadius: '12px', padding: '13px', fontSize: '15px', fontWeight: '700',
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, minHeight: '46px',
                }}
              >
                {saving ? 'Saving...' : 'Save this time'}
              </button>
            </div>
          )}

          {error && (
            <p style={{ margin: '12px 0 0', fontSize: '13px', fontWeight: '600', color: '#cc0000', lineHeight: 1.45 }}>
              {error}
            </p>
          )}

          {hasTime && (
            <button type="button" style={{ ...LINK_BUTTON, marginTop: '6px' }} onClick={() => { setEditing(false); setPicking(false); setError(''); }}>
              Cancel
            </button>
          )}
        </>
      ) : (
        <>
          <div style={{ background: passed ? '#f5f8fc' : '#e8f8f5', borderRadius: '14px', padding: '14px 16px', textAlign: 'center' }}>
            <p style={{ margin: '0 0 2px', fontSize: '11px', fontWeight: '700', color: '#8a94a3', letterSpacing: '1px', textTransform: 'uppercase' }}>
              You told the clinic
            </p>
            <p style={{ margin: 0, fontSize: '18px', fontWeight: '800', color: passed ? '#5a6472' : '#00875f' }}>
              {passed ? `You'd be here by ${clock}` : `You'll reach the clinic by ${clock}`}
            </p>
            {!passed && minsToArrival > 0 && (
              <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#6b7684' }}>in about {minsToArrival} min</p>
            )}
          </div>

          {turnBeforeArrival && (
            <div style={{ background: '#fff8e6', border: '1.5px solid #f5d38a', borderRadius: '14px', padding: '12px 14px', marginTop: '12px' }}>
              <p style={{ margin: 0, fontSize: '13.5px', fontWeight: '600', color: '#8a5a00', lineHeight: 1.5 }}>
                {waitMinutes === 0 ? "You're next in line" : `Your turn may come in about ${waitMinutes} min`}, before the {clock} you gave.
                {' '}If you're not at the clinic when you're called, you'll be skipped. Try to arrive earlier, or update your time.
              </p>
            </div>
          )}

          {passed && (
            <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#6b7684', lineHeight: 1.5, textAlign: 'center' }}>
              Still on your way? Update your time so the clinic knows.
            </p>
          )}

          {error && (
            <p style={{ margin: '12px 0 0', fontSize: '13px', fontWeight: '600', color: '#cc0000', lineHeight: 1.45 }}>
              {error}
            </p>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', marginTop: '8px' }}>
            <button type="button" style={LINK_BUTTON} onClick={() => { setEditing(true); setError(''); }}>
              Change time
            </button>
            <button type="button" style={{ ...LINK_BUTTON, color: '#8a94a3' }} disabled={saving} onClick={() => save({ clear: true })}>
              Remove
            </button>
          </div>
        </>
      )}
    </div>
  );
}
