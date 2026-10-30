import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Analog clock time picker. Shows "9:00 AM"; tapping opens a clock card:
// pick the hour, then the minute. value / onChange use "HH:MM" (24-hour).

const DAY_MIN = 24 * 60;
const pad2 = (n) => String(n).padStart(2, '0');

function toMinutes(time) {
  const [h, m] = String(time || '').split(':').map(Number);
  return Number.isInteger(h) && Number.isInteger(m) ? h * 60 + m : null;
}

function formatMinutes(min) {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  const h = Math.floor(m / 60);
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad2(m % 60)} ${h < 12 ? 'AM' : 'PM'}`;
}

const DIAL_SIZE = 240;
const DIAL_C = DIAL_SIZE / 2;
const DIAL_R = 92;

function polar(deg, radius) {
  const rad = (deg * Math.PI) / 180;
  return { x: DIAL_C + radius * Math.sin(rad), y: DIAL_C - radius * Math.cos(rad) };
}

const INPUT_STYLE = {
  width: '100%', border: '2px solid #eef1f5', background: '#fbfcfe', borderRadius: '12px',
  padding: '12px 14px', fontSize: '16px', color: '#1a1a2e', outline: 'none', boxSizing: 'border-box',
};

const PRIMARY_STYLE = {
  background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', color: 'white', border: 'none',
  borderRadius: '12px', padding: '12px 20px', fontSize: '14px', fontWeight: '700', cursor: 'pointer',
};

function segmentStyle(active, disabled) {
  return {
    fontSize: '44px', fontWeight: '900', lineHeight: 1, padding: '10px 12px', borderRadius: '14px', border: 'none',
    background: active ? '#dbeafe' : '#f0f4f8',
    color: active ? '#1e3a5f' : '#8a94a3',
    cursor: disabled ? 'default' : 'pointer',
    fontVariantNumeric: 'tabular-nums',
  };
}

export default function TimePicker({ value, onChange, hourOnly = false }) {
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
  const offNumber = mode === 'minute' && minute % 5 !== 0;

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-haspopup="dialog"
        aria-expanded={open}
        style={{
          ...INPUT_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
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
              style={{ ...PRIMARY_STYLE, width: '100%', marginTop: '16px', padding: '13px', fontSize: '15px' }}
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
