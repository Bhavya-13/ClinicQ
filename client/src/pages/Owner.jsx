import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import SERVER from '../config';

const TOKEN_KEY = 'cq_owner_token';
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PIN_PATTERN = /^\d{6,12}$/;

// Listing fields: form key → database column, label, max length, placeholder
const LISTING_INPUTS = [
  { key: 'doctorName', column: 'doctor_name', label: 'Doctor name', max: 80, placeholder: 'e.g. Dr. Anil Sharma' },
  { key: 'specialty', column: 'specialty', label: 'Specialty', max: 60, placeholder: 'e.g. General Physician' },
  { key: 'area', column: 'area', label: 'Area', max: 60, placeholder: 'e.g. Dharampeth' },
  { key: 'city', column: 'city', label: 'City', max: 40, placeholder: 'e.g. Nagpur' },
  { key: 'address', column: 'address', label: 'Address', max: 200, placeholder: 'Street, landmark' },
  { key: 'timings', column: 'timings', label: 'Timings', max: 120, placeholder: 'e.g. Mon–Sat, 10 AM–1 PM & 6–9 PM' },
];

const EMPTY_LISTING = { doctorName: '', specialty: '', area: '', city: '', address: '', timings: '', isListed: false };

function listingFromClinic(clinic) {
  const values = { isListed: clinic.is_listed === true };
  LISTING_INPUTS.forEach(({ key, column }) => { values[key] = clinic[column] || ''; });
  return values;
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

const pad2 = (n) => String(n).padStart(2, '0');

function formatHour(h) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:00 ${suffix}`;
}

// ── Mobile-friendly spacing for this page ──────────────────────────
function useOwnerStyles() {
  useEffect(() => {
    const id = 'clinicq-owner-styles';
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.innerHTML = `
      @media (max-width: 600px) {
        .cq-owner-page { padding: 12px !important; }
        .cq-owner-card { padding: 16px !important; border-radius: 16px !important; }
        .cq-owner-session { padding: 14px !important; }
        .cq-owner-page input, .cq-owner-page textarea { font-size: 16px !important; }
        .cq-owner-title { font-size: 22px !important; }
        .cq-owner-actions { width: 100%; }
        .cq-owner-actions > * { flex: 1 1 auto; text-align: center; box-sizing: border-box; }
        .cq-owner-form-actions > button { flex: 1 1 auto; }
      }
    `;
    document.head.appendChild(style);
  }, []);
}

// ── Sessions helpers ───────────────────────────────────────────────
const DAY_MIN = 24 * 60;
const WEEK_DAYS = [
  { n: 1, label: 'Mon' }, { n: 2, label: 'Tue' }, { n: 3, label: 'Wed' }, { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' }, { n: 6, label: 'Sat' }, { n: 0, label: 'Sun' },
];

// The two quick choices for "booking opens / closes" (anything else is a custom time)
const OPEN_QUICK = [60, 120];   // minutes before the session starts
const CLOSE_QUICK = [30, 60];   // minutes before the session ends
const OPEN_MAX = 720;           // up to 12 hours before the start
const CLOSE_MAX = 240;          // up to 4 hours before the end

const DEFAULT_NEW_SESSIONS = [
  { name: 'Morning', startTime: '09:00', endTime: '13:00' },
  { name: 'Evening', startTime: '17:00', endTime: '21:00' },
];

function newSession(existing) {
  const used = existing.map(s => s.name);
  const base = DEFAULT_NEW_SESSIONS.find(d => !used.includes(d.name)) || DEFAULT_NEW_SESSIONS[1];
  return { ...base, opensBeforeMin: 120, closesBeforeMin: 30, closedDays: [], closingWarning: true, maxOnlinePeople: null };
}

// 30 → "30 min", 120 → "2 hr"
function leadShort(m) {
  if (m < 60) return `${m} min`;
  return `${+(m / 60).toFixed(2)} hr`;
}

function toMinutes(time) {
  const [h, m] = String(time || '').split(':').map(Number);
  return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
}

function minutesToHHMM(min) {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

function formatMinutes(min) {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(m / 60);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad2(m % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}

function formatTime(time) {
  const m = toMinutes(time);
  return m === null ? '' : formatMinutes(m);
}

function sessionsFromClinic(clinic) {
  return (clinic.sessions || [])
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map(s => ({
      name: s.name,
      startTime: String(s.start_time).slice(0, 5),
      endTime: String(s.end_time).slice(0, 5),
      opensBeforeMin: s.booking_opens_before_min,
      closesBeforeMin: s.booking_closes_before_end_min,
      closedDays: (s.closed_days || []).map(Number),
      closingWarning: s.closing_warning !== false,
      maxOnlinePeople: s.max_online_people ?? null,
    }));
}

function sessionsPayload(list) {
  return list.map(s => ({
    name: s.name.trim(),
    startTime: s.startTime,
    endTime: s.endTime,
    opensBeforeMin: Number(s.opensBeforeMin),
    closesBeforeMin: Number(s.closesBeforeMin),
    closedDays: [...s.closedDays].map(Number).sort((a, b) => a - b),
    closingWarning: s.closingWarning !== false,
    maxOnlinePeople: s.maxOnlinePeople === null || s.maxOnlinePeople === undefined ? null : Number(s.maxOnlinePeople),
  }));
}

// Quick checks before saving (the server checks overlaps between sessions)
function validateSessionsClient(sessions) {
  for (const s of sessions) {
    if (!s.name.trim()) return 'Each session needs a name.';
    const name = s.name.trim();
    const start = toMinutes(s.startTime);
    const end = toMinutes(s.endTime);
    if (start === null || end === null) return `${name}: set a start and end time.`;
    if (start === end) return `${name}: the start and end time can't be the same.`;
    if (s.opensBeforeMin > OPEN_MAX)
      return `${name}: booking must open before the session starts — at most 12 hours earlier.`;
    if (s.closesBeforeMin > CLOSE_MAX)
      return `${name}: booking must close before the session ends — at most 4 hours earlier.`;
    if (s.maxOnlinePeople !== null && s.maxOnlinePeople !== undefined) {
      const limit = Number(s.maxOnlinePeople);
      if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
        return `${name}: the online token limit must be a whole number from 1 to 1000.`;
    }
  }
  return '';
}

function sessionSummary(clinic) {
  if (!clinic.sessions || clinic.sessions.length === 0) {
    return `open all day · resets at ${formatHour(clinic.day_reset_hour)}`;
  }
  return clinic.sessions
    .map(s => `${s.name} ${formatTime(s.start_time)}–${formatTime(s.end_time)}`)
    .join(' · ');
}

const S = {
  page: { minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Segoe UI',sans-serif", padding: '24px', boxSizing: 'border-box' },
  card: { background: 'white', borderRadius: '20px', padding: '24px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', boxSizing: 'border-box', marginBottom: '20px' },
  label: { display: 'block', fontSize: '11.5px', fontWeight: '700', color: '#5a6472', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' },
  input: { width: '100%', border: '2px solid #eef1f5', background: '#fbfcfe', borderRadius: '12px', padding: '12px 14px', fontSize: '15px', color: '#1a1a2e', outline: 'none', boxSizing: 'border-box' },
  primary: { background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 20px', fontSize: '14px', fontWeight: '700', cursor: 'pointer' },
  secondary: { background: 'white', color: '#2d6a9f', border: '2px solid #dbeafe', borderRadius: '12px', padding: '8px 14px', fontSize: '13px', fontWeight: '700', cursor: 'pointer' },
  error: { color: '#cc0000', fontSize: '13px', margin: '0 0 12px' },
  hint: { fontSize: '12px', color: '#a8b1bd', margin: '6px 0 0' },
  sectionTitle: { fontSize: '13px', fontWeight: '800', color: '#1e3a5f', margin: '6px 0 12px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '14px' },
};

// A compact tappable pill (selected = dark blue)
function pillStyle(selected) {
  return {
    padding: '9px 15px', borderRadius: '999px', fontSize: '13.5px', fontWeight: '700', cursor: 'pointer',
    border: selected ? '2px solid #1e3a5f' : '2px solid #e3e9f1',
    background: selected ? 'linear-gradient(135deg,#1e3a5f,#2d6a9f)' : 'white',
    color: selected ? 'white' : '#5a6472',
    boxShadow: selected ? '0 4px 12px rgba(30,58,95,0.25)' : 'none',
    transition: 'all 0.15s',
  };
}

// ── Analog clock time picker ───────────────────────────────────────
// Shows "9:00 AM". Tapping opens a clock card: pick the hour, then the minute.
// value / onChange use "HH:MM" (24-hour).
const DIAL_SIZE = 240;
const DIAL_C = DIAL_SIZE / 2;
const DIAL_R = 92;

function polar(deg, radius) {
  const rad = (deg * Math.PI) / 180;
  return { x: DIAL_C + radius * Math.sin(rad), y: DIAL_C - radius * Math.cos(rad) };
}

function segmentStyle(active, disabled) {
  return {
    fontSize: '44px', fontWeight: '900', lineHeight: 1, padding: '10px 12px', borderRadius: '14px', border: 'none',
    background: active ? '#dbeafe' : '#f0f4f8',
    color: active ? '#1e3a5f' : '#8a94a3',
    cursor: disabled ? 'default' : 'pointer',
    fontVariantNumeric: 'tabular-nums',
  };
}

function TimePicker({ value, onChange, hourOnly = false }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState('hour'); // 'hour' → 'minute'
  const dialRef = useRef(null);
  const dragging = useRef(false);

  // Esc closes; the page behind doesn't scroll while the card is open
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const total = toMinutes(value);
  const hour24 = total === null ? 9 : Math.floor(total / 60);
  const minute = total === null ? 0 : total % 60;
  const isPM = hour24 >= 12;
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;

  const commit = (h12, min, pm) => {
    onChange(`${pad2((h12 % 12) + (pm ? 12 : 0))}:${pad2(hourOnly ? 0 : min)}`);
  };

  const openPicker = () => { setMode('hour'); setOpen(true); };

  // Turn a finger/mouse position on the dial into an hour or minute
  const applyPointer = (e) => {
    const rect = dialRef.current.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    let deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    const step = Math.round(deg / 30) % 12; // 0..11, one step per number on the dial

    if (mode === 'hour') commit(step === 0 ? 12 : step, minute, isPM);
    else commit(hour12, step * 5, isPM);
  };

  const onPointerDown = (e) => {
    e.preventDefault();
    dragging.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    applyPointer(e);
  };
  const onPointerMove = (e) => { if (dragging.current) applyPointer(e); };
  const endPointer = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (mode === 'hour' && !hourOnly) setMode('minute'); // hour chosen → now the minute
  };

  const items = mode === 'hour'
    ? Array.from({ length: 12 }, (_, i) => ({ label: String(i + 1), deg: (i + 1) * 30, selected: i + 1 === hour12 }))
    : Array.from({ length: 12 }, (_, i) => ({ label: pad2(i * 5), deg: i * 30, selected: i * 5 === minute }));
  const handDeg = mode === 'hour' ? (hour12 % 12) * 30 : minute * 6;
  const hand = polar(handDeg, DIAL_R);
  const offNumber = mode === 'minute' && minute % 5 !== 0; // e.g. 9:07 saved earlier

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          ...S.input, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          textAlign: 'left', cursor: 'pointer', fontWeight: '700',
          borderColor: open ? '#2d6a9f' : '#eef1f5',
          background: open ? 'white' : '#fbfcfe',
        }}
      >
        <span>{total === null ? 'Select time' : formatMinutes(total)}</span>
        <span aria-hidden="true" style={{ fontSize: '15px', opacity: 0.7 }}>🕒</span>
      </button>

      {open && createPortal(
        <div
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,30,50,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', boxSizing: 'border-box',
          }}
        >
          <div
            role="dialog"
            aria-label="Select time"
            style={{
              width: '100%', maxWidth: '320px', maxHeight: '100%', overflowY: 'auto', boxSizing: 'border-box',
              background: 'white', borderRadius: '24px', padding: '20px',
              boxShadow: '0 24px 60px rgba(15,30,50,0.4)', fontFamily: "'Segoe UI',sans-serif",
            }}
          >
            {/* Big time: tap the hour or the minute to switch */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '14px', marginBottom: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button type="button" onClick={() => setMode('hour')} style={segmentStyle(mode === 'hour', false)}>
                  {pad2(hour12)}
                </button>
                <span style={{ fontSize: '40px', fontWeight: '900', color: '#1e3a5f' }}>:</span>
                <button
                  type="button"
                  disabled={hourOnly}
                  onClick={() => setMode('minute')}
                  style={segmentStyle(mode === 'minute', hourOnly)}
                >
                  {pad2(hourOnly ? 0 : minute)}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {['AM', 'PM'].map(label => {
                  const selected = (label === 'PM') === isPM;
                  return (
                    <button
                      type="button"
                      key={label}
                      onClick={() => commit(hour12, minute, label === 'PM')}
                      style={{
                        padding: '9px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: '800', cursor: 'pointer',
                        border: selected ? '2px solid #1e3a5f' : '2px solid #e3e9f1',
                        background: selected ? '#1e3a5f' : 'white',
                        color: selected ? 'white' : '#8a94a3',
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <p style={{ textAlign: 'center', fontSize: '12px', fontWeight: '700', color: '#a8b1bd', letterSpacing: '1.5px', textTransform: 'uppercase', margin: '10px 0 8px' }}>
              {mode === 'hour' ? 'Select hour' : 'Select minute'}
            </p>

            {/* The clock: tap or drag */}
            <svg
              ref={dialRef}
              viewBox={`0 0 ${DIAL_SIZE} ${DIAL_SIZE}`}
              width="100%"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endPointer}
              onPointerCancel={endPointer}
              style={{ display: 'block', maxWidth: '260px', margin: '0 auto', touchAction: 'none', userSelect: 'none', cursor: 'pointer' }}
            >
              <circle cx={DIAL_C} cy={DIAL_C} r={116} fill="#f0f4f8" />
              <line x1={DIAL_C} y1={DIAL_C} x2={hand.x} y2={hand.y} stroke="#2d6a9f" strokeWidth="2.5" />
              <circle cx={DIAL_C} cy={DIAL_C} r="4.5" fill="#2d6a9f" />
              <circle cx={hand.x} cy={hand.y} r="20" fill="#1e3a5f" />
              {offNumber && <circle cx={hand.x} cy={hand.y} r="3.5" fill="white" />}
              {items.map(item => {
                const p = polar(item.deg, DIAL_R);
                return (
                  <text
                    key={item.label}
                    x={p.x}
                    y={p.y}
                    dy="0.35em"
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="700"
                    fill={item.selected ? 'white' : '#3d4a5c'}
                    style={{ pointerEvents: 'none' }}
                  >
                    {item.label}
                  </text>
                );
              })}
            </svg>

            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ ...S.primary, width: '100%', marginTop: '16px', padding: '13px', fontSize: '15px' }}
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// "Booking opens / closes": two quick pills, or a custom clock time.
//   anchorMin – minutes-of-day of the session start (or end)
//   value     – how many minutes before the anchor
//   custom    – true when the owner chose "Custom time"
function LeadTimePicker({ value, quick, anchorMin, max, noun, caption, custom, onChange }) {
  const isCustom = custom ?? !quick.includes(value);
  const outOfRange = value > max;

  // Any time can be picked while moving around the clock; out-of-range is flagged, not blocked
  const pickTime = (time) => {
    const chosen = toMinutes(time);
    const offset = (((anchorMin - chosen) % DAY_MIN) + DAY_MIN) % DAY_MIN;
    onChange(offset, true);
  };

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {quick.map(q => (
          <button
            type="button"
            key={q}
            onClick={() => onChange(q, false)}
            aria-pressed={!isCustom && value === q}
            style={pillStyle(!isCustom && value === q)}
          >
            {leadShort(q)}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(value, true)}
          aria-pressed={isCustom}
          style={pillStyle(isCustom)}
        >
          Custom
        </button>
      </div>
      <p style={S.hint}>{caption}</p>

      {isCustom && (
        <div style={{ marginTop: '10px' }}>
          {anchorMin === null ? (
            <p style={S.hint}>Set the {noun} time first.</p>
          ) : (
            <TimePicker value={minutesToHHMM(anchorMin - value)} onChange={pickTime} />
          )}
        </div>
      )}

      {outOfRange && (
        <p style={{ margin: '8px 0 0', fontSize: '12.5px', fontWeight: '600', color: '#c0392b', lineHeight: 1.4 }}>
          Pick a time before the session {noun === 'start' ? 'starts' : 'ends'} — at most {max / 60} hours earlier.
        </p>
      )}
    </div>
  );
}

// Shared "public listing" inputs used by both the create and edit forms
function ListingFields({ values, onChange }) {
  return (
    <>
      <p style={S.sectionTitle}>Public listing (shown on the ClinicQ homepage)</p>
      <div style={S.grid}>
        {LISTING_INPUTS.map(({ key, label, max, placeholder }) => (
          <div key={key}>
            <label style={S.label}>{label}</label>
            <input
              style={S.input}
              value={values[key]}
              maxLength={max}
              placeholder={placeholder}
              onChange={e => onChange({ ...values, [key]: e.target.value })}
            />
          </div>
        ))}
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#444', marginBottom: '14px', cursor: 'pointer' }}>
        <input type="checkbox" checked={values.isListed} onChange={e => onChange({ ...values, isListed: e.target.checked })} />
        Show in public search (only tick this if the clinic agreed)
      </label>
    </>
  );
}

// Up to 2 sessions: when the clinic sees patients and when booking is open
function SessionsEditor({ sessions, onChange }) {
  const update = (i, patch) => onChange(sessions.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i) => onChange(sessions.filter((_, idx) => idx !== i));
  const add = () => onChange([...sessions, newSession(sessions)]);
  const toggleDay = (i, day) => {
    const current = sessions[i].closedDays;
    update(i, { closedDays: current.includes(day) ? current.filter(d => d !== day) : [...current, day] });
  };

  return (
    <>
      <p style={S.sectionTitle}>Sessions (when the clinic sees patients)</p>

      {sessions.length === 0 && (
        <p style={{ ...S.hint, margin: '0 0 12px' }}>
          No sessions set: the clinic stays open all day, with no booking times.
        </p>
      )}

      {sessions.map((s, i) => {
        const startMin = toMinutes(s.startTime);
        const endMin = toMinutes(s.endTime);
        const showPreview =
          startMin !== null && endMin !== null && startMin !== endMin &&
          s.opensBeforeMin <= OPEN_MAX && s.closesBeforeMin <= CLOSE_MAX;
        return (
          <div key={i} className="cq-owner-session" style={{ background: '#f7f9fc', border: '1px solid #eef1f5', borderRadius: '16px', padding: '18px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <span style={{ fontSize: '14px', fontWeight: '800', color: '#1e3a5f' }}>Session {i + 1}</span>
              <button type="button" style={{ ...S.secondary, color: '#cc0000', borderColor: '#ffd5d5', padding: '5px 12px', fontSize: '12px' }} onClick={() => remove(i)}>
                Remove
              </button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={S.label}>Session name</label>
              <input style={S.input} value={s.name} maxLength={30} onChange={e => update(i, { name: e.target.value })} placeholder="e.g. Morning" />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={S.label}>Starts</label>
                <TimePicker value={s.startTime} onChange={(v) => update(i, { startTime: v })} />
              </div>
              <div>
                <label style={S.label}>Ends</label>
                <TimePicker value={s.endTime} onChange={(v) => update(i, { endTime: v })} />
              </div>
            </div>
            <p style={{ ...S.hint, margin: '8px 0 18px' }}>An end time earlier than the start time means the session runs past midnight.</p>

            {/* Opens and closes, side by side (stacked on small phones) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '18px', marginBottom: '18px' }}>
              <div>
                <label style={S.label}>Booking opens</label>
                <LeadTimePicker
                  value={s.opensBeforeMin}
                  quick={OPEN_QUICK}
                  anchorMin={startMin}
                  max={OPEN_MAX}
                  noun="start"
                  caption="before the session starts"
                  custom={s.opensCustom}
                  onChange={(minutes, custom) => update(i, { opensBeforeMin: minutes, opensCustom: custom })}
                />
              </div>
              <div>
                <label style={S.label}>Booking closes</label>
                <LeadTimePicker
                  value={s.closesBeforeMin}
                  quick={CLOSE_QUICK}
                  anchorMin={endMin}
                  max={CLOSE_MAX}
                  noun="end"
                  caption="before the session ends"
                  custom={s.closesCustom}
                  onChange={(minutes, custom) => update(i, { closesBeforeMin: minutes, closesCustom: custom })}
                />
              </div>
            </div>

            <label style={S.label}>Closed on</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {WEEK_DAYS.map(({ n, label }) => {
                const closed = s.closedDays.includes(n);
                return (
                  <button
                    type="button"
                    key={n}
                    onClick={() => toggleDay(i, n)}
                    aria-pressed={closed}
                    style={{
                      padding: '9px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: '700', cursor: 'pointer',
                      border: closed ? '2px solid #f5b5b5' : '2px solid #e3e9f1',
                      background: closed ? '#fff0f0' : 'white',
                      color: closed ? '#cc0000' : '#5a6472',
                      transition: 'all 0.15s',
                    }}
                  >
                    {label}{closed ? ' ✕' : ''}
                  </button>
                );
              })}
            </div>
            <p style={S.hint}>Tap a day to mark this session closed on that day.</p>
            {/* Closing-time warning and optional online limit */}
            <div style={{ marginTop: '18px', borderTop: '1px solid #e8eef5', paddingTop: '16px' }}>
              <label style={S.label}>Busy-day settings</label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer', marginBottom: '14px' }}>
                <input
                  type="checkbox"
                  checked={s.closingWarning !== false}
                  onChange={e => update(i, { closingWarning: e.target.checked })}
                  style={{ marginTop: '3px' }}
                />
                <span style={{ fontSize: '14px', color: '#3d4a5c', lineHeight: 1.45 }}>
                  <strong>Closing-time warning.</strong> Warn patients who probably won't be seen before the session ends, and let them choose whether to register anyway.
                </span>
              </label>

              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={s.maxOnlinePeople !== null && s.maxOnlinePeople !== undefined}
                  onChange={e => update(i, { maxOnlinePeople: e.target.checked ? 30 : null })}
                  style={{ marginTop: '3px' }}
                />
                <span style={{ fontSize: '14px', color: '#3d4a5c', lineHeight: 1.45 }}>
                  <strong>Limit online tokens.</strong> Stop online registration after this many people. Walk-ins added by staff don't count, and staff can raise the limit on the day.
                </span>
              </label>

              {s.maxOnlinePeople !== null && s.maxOnlinePeople !== undefined && (
                <div style={{ marginTop: '12px', maxWidth: '200px' }}>
                  <label style={S.label}>Max people (online)</label>
                  <input
                    style={S.input}
                    type="text"
                    inputMode="numeric"
                    value={s.maxOnlinePeople}
                    onChange={e => update(i, { maxOnlinePeople: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    placeholder="e.g. 30"
                  />
                </div>
              )}
            </div>

            {showPreview && (
              <div style={{ background: '#eaf3fc', border: '1px solid #d3e6f7', borderRadius: '12px', padding: '10px 14px', marginTop: '16px' }}>
                <p style={{ fontSize: '12.5px', color: '#2d6a9f', fontWeight: '600', margin: 0, lineHeight: 1.5 }}>
                  Booking opens <strong>{formatMinutes(startMin - s.opensBeforeMin)}</strong> · closes <strong>{formatMinutes(endMin - s.closesBeforeMin)}</strong> · session ends <strong>{formatMinutes(endMin)}</strong>{endMin < startMin ? ' (next day)' : ''}
                </p>
              </div>
            )}
          </div>
        );
      })}

      {sessions.length < 2 && (
        <button type="button" style={{ ...S.secondary, marginBottom: '8px' }} onClick={add}>
          + Add {sessions.length === 0 ? 'a session' : 'a second session'}
        </button>
      )}
      <p style={{ ...S.hint, marginBottom: '16px' }}>
        Token numbers start again from 1 when each session's booking opens. A session's queue stays open until the next session's booking opens.
      </p>
    </>
  );
}

// Used when a clinic has no sessions: the hour its token numbers reset
function ResetHourField({ hour, onChange }) {
  return (
    <div>
      <label style={S.label}>Token numbers reset at</label>
      <TimePicker hourOnly value={`${pad2(hour)}:00`} onChange={(v) => onChange(parseInt(v.slice(0, 2), 10))} />
      <p style={S.hint}>IST. Only used when no sessions are set below.</p>
    </div>
  );
}

function CreateClinicForm({ ownerFetch, onCreated }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [hour, setHour] = useState(16);
  const [sessions, setSessions] = useState([]);
  const [listing, setListing] = useState(EMPTY_LISTING);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleName = (value) => {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Clinic name is required.');
    if (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 40)
      return setError('Link name must be 3–40 lowercase letters, numbers or hyphens (e.g. dr-sharma).');
    if (!PIN_PATTERN.test(pin)) return setError('PIN must be 6–12 digits.');
    if (pin !== pinConfirm) return setError('The two PINs do not match.');

    const sessionProblem = validateSessionsClient(sessions);
    if (sessionProblem) return setError(sessionProblem);

    setSaving(true);
    try {
      const res = await ownerFetch('/clinics', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(), slug, pin, dayResetHour: Number(hour),
          sessions: sessionsPayload(sessions), ...listing,
        }),
      });
      if (!res) return;
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Could not create the clinic.');

      onCreated(data.clinic);
      setName(''); setSlug(''); setSlugTouched(false);
      setPin(''); setPinConfirm(''); setHour(16);
      setSessions([]);
      setListing(EMPTY_LISTING);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="cq-owner-card" style={S.card}>
      <h2 style={{ fontSize: '17px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 18px' }}>Add a clinic</h2>

      <p style={S.sectionTitle}>Clinic setup</p>
      <div style={S.grid}>
        <div>
          <label style={S.label}>Clinic name</label>
          <input style={S.input} value={name} maxLength={80} onChange={e => handleName(e.target.value)} placeholder="e.g. Sharma Clinic" />
        </div>
        <div>
          <label style={S.label}>Link name</label>
          <input
            style={S.input}
            value={slug}
            maxLength={40}
            onChange={e => { setSlugTouched(true); setSlug(e.target.value.toLowerCase()); }}
            placeholder="e.g. dr-sharma"
          />
          <p style={S.hint}>{window.location.origin}/c/{slug || 'your-link'}/register</p>
        </div>
        <div>
          <label style={S.label}>Staff PIN (6–12 digits)</label>
          <input style={S.input} type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value)} />
        </div>
        <div>
          <label style={S.label}>Confirm PIN</label>
          <input style={S.input} type="password" inputMode="numeric" value={pinConfirm} onChange={e => setPinConfirm(e.target.value)} />
        </div>
        {sessions.length === 0 && <ResetHourField hour={hour} onChange={setHour} />}
      </div>

      <SessionsEditor sessions={sessions} onChange={setSessions} />

      <ListingFields values={listing} onChange={setListing} />

      {error && <p style={S.error}>{error}</p>}

      <button type="submit" disabled={saving} style={{ ...S.primary, opacity: saving ? 0.7 : 1 }}>
        {saving ? 'Creating...' : 'Create clinic'}
      </button>
    </form>
  );
}

function ClinicCard({ clinic, ownerFetch, onUpdated }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(clinic.name);
  const [hour, setHour] = useState(clinic.day_reset_hour);
  const [newPin, setNewPin] = useState('');
  const [isActive, setIsActive] = useState(clinic.is_active);
  const [sessions, setSessions] = useState(() => sessionsFromClinic(clinic));
  const [listing, setListing] = useState(() => listingFromClinic(clinic));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');

  const base = `${window.location.origin}/c/${clinic.slug}`;
  const links = [
    { label: 'Patients', url: `${base}/register` },
    { label: 'Staff', url: `${base}/admin` },
    { label: 'Display', url: `${base}/display` },
  ];

  const doctorLine = [clinic.doctor_name, clinic.specialty].filter(Boolean).join(' · ');
  const placeLine = [clinic.area, clinic.city].filter(Boolean).join(', ');
  const hasSessions = clinic.sessions && clinic.sessions.length > 0;

  const startEditing = () => {
    setName(clinic.name);
    setHour(clinic.day_reset_hour);
    setNewPin('');
    setIsActive(clinic.is_active);
    setSessions(sessionsFromClinic(clinic));
    setListing(listingFromClinic(clinic));
    setError('');
    setEditing(true);
  };

  const copy = (label, url) => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(''), 1500);
    });
  };

  const save = async () => {
    setError('');
    if (!name.trim()) return setError('Clinic name is required.');

    const sessionProblem = validateSessionsClient(sessions);
    if (sessionProblem) return setError(sessionProblem);

    const updates = {};
    if (name.trim() !== clinic.name) updates.name = name.trim();
    if (Number(hour) !== clinic.day_reset_hour) updates.dayResetHour = Number(hour);
    if (isActive !== clinic.is_active) updates.isActive = isActive;
    if (newPin) {
      if (!PIN_PATTERN.test(newPin)) return setError('New PIN must be 6–12 digits.');
      updates.pin = newPin;
    }

    // Only send sessions if they actually changed
    const newSessions = sessionsPayload(sessions);
    if (JSON.stringify(newSessions) !== JSON.stringify(sessionsPayload(sessionsFromClinic(clinic)))) {
      updates.sessions = newSessions;
    }

    // Only send listing fields that actually changed
    LISTING_INPUTS.forEach(({ key, column }) => {
      if (listing[key].trim() !== (clinic[column] || '')) updates[key] = listing[key].trim();
    });
    if (listing.isListed !== clinic.is_listed) updates.isListed = listing.isListed;

    if (Object.keys(updates).length === 0) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await ownerFetch(`/clinics/${clinic.id}`, { method: 'PATCH', body: JSON.stringify(updates) });
      if (!res) return;
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Could not save.');

      onUpdated(
        data.clinic,
        updates.pin
          ? `${data.clinic.name}: PIN changed. Its staff must log in again with the new PIN.`
          : `${data.clinic.name}: saved.`
      );
      setEditing(false);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  const badge = (text, bg, color) => (
    <span style={{ fontSize: '12px', fontWeight: '700', padding: '5px 12px', borderRadius: '20px', background: bg, color }}>{text}</span>
  );

  return (
    <div className="cq-owner-card" style={{ ...S.card, opacity: clinic.is_active ? 1 : 0.7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 4px' }}>{clinic.name}</h3>
          {doctorLine && <p style={{ fontSize: '13.5px', color: '#2d6a9f', fontWeight: '600', margin: '0 0 2px' }}>{doctorLine}</p>}
          {placeLine && <p style={{ fontSize: '13px', color: '#6b7684', margin: '0 0 2px' }}>📍 {placeLine}</p>}
          <p style={{ fontSize: '13px', color: '#8a94a3', margin: 0 }}>
            /c/{clinic.slug} · {sessionSummary(clinic)}
            {clinic.is_paused && ' · registrations paused'}
          </p>
          {hasSessions && clinic.schedule && (
            <p style={{ fontSize: '13px', color: '#2d6a9f', fontWeight: '600', margin: '4px 0 0' }}>
              Right now: {clinic.schedule.sessionName ? `${clinic.schedule.sessionName} — ` : ''}{clinic.schedule.shortMessage}
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {clinic.is_active ? badge('Active', '#e8f8f5', '#00a37a') : badge('Turned off', '#f0f0f0', '#888')}
          {clinic.is_listed ? badge('Listed in search', '#e8f2ff', '#2d6a9f') : badge('Not listed', '#f7f7f7', '#999')}
          {!editing && <button style={S.secondary} onClick={startEditing}>Edit</button>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {links.map(({ label, url }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f7f9fc', borderRadius: '10px', padding: '8px 12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#5a6472', width: '62px' }}>{label}</span>
            <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: '13px', color: '#2d6a9f', wordBreak: 'break-all', flex: '1 1 200px' }}>{url}</a>
            <button style={{ ...S.secondary, padding: '4px 10px', fontSize: '12px' }} onClick={() => copy(label, url)}>
              {copied === label ? 'Copied!' : 'Copy'}
            </button>
          </div>
        ))}
      </div>

      {editing && (
        <div style={{ marginTop: '18px', borderTop: '1px solid #eef1f5', paddingTop: '18px' }}>
          <p style={S.sectionTitle}>Clinic setup</p>
          <div style={S.grid}>
            <div>
              <label style={S.label}>Clinic name</label>
              <input style={S.input} value={name} maxLength={80} onChange={e => setName(e.target.value)} />
            </div>
            {sessions.length === 0 && <ResetHourField hour={hour} onChange={setHour} />}
            <div>
              <label style={S.label}>New staff PIN (optional)</label>
              <input style={S.input} type="password" inputMode="numeric" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Leave blank to keep" />
              <p style={S.hint}>Changing it logs out this clinic's staff.</p>
            </div>
          </div>

          <SessionsEditor sessions={sessions} onChange={setSessions} />

          <ListingFields values={listing} onChange={setListing} />

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#444', marginBottom: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Clinic is active (unticking turns off all its links and hides it from search)
          </label>

          {error && <p style={S.error}>{error}</p>}

          <div className="cq-owner-form-actions" style={{ display: 'flex', gap: '10px' }}>
            <button style={{ ...S.primary, opacity: saving ? 0.7 : 1 }} disabled={saving} onClick={save}>
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <button style={S.secondary} onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Owner() {
  useOwnerStyles();

  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) || '');
  const [secret, setSecret] = useState('');
  const [loginError, setLoginError] = useState('');
  const [clinics, setClinics] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [notice, setNotice] = useState('');

  const logout = (reason = '') => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken('');
    setClinics([]);
    setLoginError(reason);
  };

  const ownerFetch = async (path, options = {}) => {
    const res = await fetch(`${SERVER}/api/owner${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
        'x-owner-token': sessionStorage.getItem(TOKEN_KEY) || '',
      },
    });
    if (res.status === 401) {
      logout('Session expired. Please log in again.');
      return null;
    }
    return res;
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoadingList(true);

    ownerFetch('/clinics')
      .then(async (res) => {
        if (!res || cancelled) return;
        const data = await res.json();
        if (res.ok) setClinics(data.clinics);
        else setNotice(data.error || 'Could not load clinics.');
      })
      .catch(() => { if (!cancelled) setNotice('Could not reach the server.'); })
      .finally(() => { if (!cancelled) setLoadingList(false); });

    return () => { cancelled = true; };
  }, [token]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${SERVER}/api/owner/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret }),
      });
      const data = await res.json();
      if (data.success) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        setSecret('');
        setToken(data.token);
      } else {
        setLoginError(data.error || 'Incorrect password');
      }
    } catch {
      setLoginError('Could not reach the server.');
    }
  };

  if (!token) {
    return (
      <div className="cq-owner-page" style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} className="cq-owner-card" style={{ ...S.card, width: '100%', maxWidth: '360px', textAlign: 'center', marginBottom: 0 }}>
          <p style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '3px', color: '#bbb', margin: '0 0 6px' }}>CLINICQ</p>
          <p style={{ fontSize: '17px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 18px' }}>Owner access</p>
          <input
            type="password"
            value={secret}
            onChange={e => setSecret(e.target.value)}
            placeholder="Owner password"
            autoFocus
            style={{ ...S.input, textAlign: 'center', marginBottom: '12px' }}
          />
          {loginError && <p style={S.error}>{loginError}</p>}
          <button type="submit" style={{ ...S.primary, width: '100%' }}>Log in</button>
        </form>
      </div>
    );
  }

  return (
    <div className="cq-owner-page" style={S.page}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '3px', color: '#bbb', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Clinic<span style={{ color: '#2d6a9f' }}>Q</span> · Owner
            </p>
            <h1 className="cq-owner-title" style={{ fontSize: '26px', fontWeight: '900', color: '#1e3a5f', margin: 0 }}>Clinics</h1>
          </div>
          <div className="cq-owner-actions" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <a href="/" target="_blank" rel="noreferrer" style={{ ...S.secondary, textDecoration: 'none' }}>View homepage ↗</a>
            <button style={S.secondary} onClick={() => logout()}>🔒 Log out</button>
          </div>
        </div>

        {notice && (
          <div style={{ background: '#f0f7ff', border: '1.5px solid #cce0f5', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <p style={{ margin: 0, color: '#2d6a9f', fontWeight: '600', fontSize: '14px', lineHeight: 1.45 }}>{notice}</p>
            <button onClick={() => setNotice('')} style={{ background: 'none', border: 'none', color: '#2d6a9f', cursor: 'pointer', fontWeight: '700' }}>✕</button>
          </div>
        )}

        <CreateClinicForm
          ownerFetch={ownerFetch}
          onCreated={(clinic) => {
            setClinics(prev => [...prev, clinic]);
            setNotice(`"${clinic.name}" created. Share its staff PIN with the clinic privately — it can't be viewed again.`);
          }}
        />

        <h2 style={{ fontSize: '15px', fontWeight: '800', color: '#5a6472', margin: '8px 0 14px', textTransform: 'uppercase', letterSpacing: '1px' }}>
          {loadingList ? 'Loading clinics...' : `${clinics.length} clinic${clinics.length === 1 ? '' : 's'}`}
        </h2>

        {clinics.map(clinic => (
          <ClinicCard
            key={clinic.id}
            clinic={clinic}
            ownerFetch={ownerFetch}
            onUpdated={(updated, msg) => {
              setClinics(prev => prev.map(c => (c.id === updated.id ? updated : c)));
              setNotice(msg);
            }}
          />
        ))}
      </div>
    </div>
  );
}