import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SERVER from '../config';

const REFRESH_MS = 60000; // statuses like "Booking opens at 3 PM" stay fresh
const ACTIVE_TOKEN_KEY = 'cq_active_token'; // saved by the token page

// Optional: set VITE_CONTACT_EMAIL (in Vercel) to show a "Talk to us" button for clinics
const CONTACT_EMAIL = import.meta.env.VITE_CONTACT_EMAIL || '';

const HOME_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap');

  html { scroll-behavior: smooth; }
  .cqh-page { min-height: 100vh; background: #f0f4f8; color: #1a2433; overflow-x: hidden;
    font-family: 'Plus Jakarta Sans', 'Segoe UI', system-ui, -apple-system, sans-serif; }
  .cqh-page * { box-sizing: border-box; }
  .cqh-page a { -webkit-tap-highlight-color: transparent; }

  /* ── Hero ── */
  .cqh-hero { position: relative; overflow: hidden; color: white; border-radius: 0 0 44px 44px;
    background: radial-gradient(1200px 600px at 85% -10%, #3b82c4 0%, transparent 60%),
                radial-gradient(900px 500px at -10% 110%, #0f9b8e55 0%, transparent 60%),
                linear-gradient(160deg, #0f2540 0%, #16304f 45%, #1e3a5f 100%); }
  .cqh-dots { position: absolute; inset: 0; opacity: .5; pointer-events: none;
    background-image: radial-gradient(rgba(255,255,255,.14) 1px, transparent 1px); background-size: 26px 26px;
    -webkit-mask-image: linear-gradient(180deg, #000 0%, transparent 85%); mask-image: linear-gradient(180deg, #000 0%, transparent 85%); }
  .cqh-glow { position: absolute; border-radius: 50%; pointer-events: none; animation: cqh-drift 12s ease-in-out infinite; }
  .cqh-glow.a { width: 380px; height: 380px; top: -140px; left: -90px; background: radial-gradient(circle, rgba(95,176,255,.5), transparent 70%); }
  .cqh-glow.b { width: 420px; height: 420px; bottom: -200px; right: 10%; background: radial-gradient(circle, rgba(122,214,196,.35), transparent 70%); animation-delay: -5s; }
  .cqh-nav { position: relative; z-index: 3; max-width: 1120px; margin: 0 auto; padding: 22px 20px 0; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .cqh-logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 19px; letter-spacing: -.2px; color: white; text-decoration: none; }
  .cqh-logo-mark { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800;
    background: linear-gradient(135deg, #5fb0ff, #7ad6c4); color: #0f2540; box-shadow: 0 8px 20px rgba(95,176,255,.35); }
  .cqh-navlinks { display: flex; align-items: center; gap: 22px; }
  .cqh-navlink { color: rgba(255,255,255,.8); font-weight: 600; font-size: 14px; text-decoration: none; }
  .cqh-navlink:hover { color: white; }
  .cqh-navbtn { background: rgba(255,255,255,.12); border: 1.5px solid rgba(255,255,255,.28); color: white; border-radius: 12px; padding: 9px 16px; font-weight: 700; font-size: 14px; text-decoration: none; }
  .cqh-hero-grid { position: relative; z-index: 2; max-width: 1120px; margin: 0 auto; padding: 44px 20px 96px;
    display: grid; grid-template-columns: 1.1fr .9fr; gap: 40px; align-items: center; }
  .cqh-pill { display: inline-flex; align-items: center; gap: 9px; padding: 7px 14px; border-radius: 999px; font-size: 13px; font-weight: 700;
    background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.22); margin-bottom: 20px; }
  .cqh-h1 { margin: 0 0 16px; font-size: 66px; line-height: 1.02; letter-spacing: -2.2px; font-weight: 800; }
  .cqh-word { display: inline-block; min-height: 1.1em; animation: cqh-word .55s cubic-bezier(.2,.8,.2,1) both;
    background: linear-gradient(90deg, #9be7ff, #b8ffe0); -webkit-background-clip: text; background-clip: text; color: transparent; }
  .cqh-lead { margin: 0 0 26px; max-width: 480px; font-size: 18px; line-height: 1.55; color: rgba(255,255,255,.82); font-weight: 500; }
  .cqh-searchbox { display: flex; align-items: center; gap: 10px; background: white; border-radius: 20px; padding: 7px 8px 7px 18px; max-width: 540px;
    box-shadow: 0 24px 60px rgba(0,0,0,.35), 0 0 0 5px rgba(255,255,255,.12); }
  .cqh-searchbox input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: 16px; padding: 13px 4px; color: #1a2433; font-family: inherit; font-weight: 600; }
  .cqh-searchbox input::placeholder { color: #9aa5b1; font-weight: 500; }
  .cqh-go { border: none; border-radius: 14px; padding: 13px 22px; font-weight: 800; font-size: 15px; cursor: pointer; color: white; font-family: inherit;
    background: linear-gradient(135deg, #1e3a5f, #2d6a9f); }
  .cqh-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; max-width: 560px; }
  .cqh-chip { padding: 8px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; cursor: pointer; font-family: inherit; transition: all .15s ease;
    background: rgba(255,255,255,.1); border: 1.5px solid rgba(255,255,255,.25); color: rgba(255,255,255,.92); }
  .cqh-chip:hover { background: rgba(255,255,255,.2); transform: translateY(-1px); }
  .cqh-chip.on { background: white; color: #1e3a5f; border-color: white; box-shadow: 0 6px 18px rgba(0,0,0,.2); }
  .cqh-trust { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 24px; font-size: 13px; font-weight: 600; color: rgba(255,255,255,.75); }

  /* ── Phone mockup ── */
  .cqh-visual { position: relative; display: flex; justify-content: center; }
  .cqh-phone { position: relative; width: 262px; height: 520px; border-radius: 44px; padding: 10px; background: #0b1524; animation: cqh-bob 6s ease-in-out infinite;
    box-shadow: 0 50px 90px rgba(0,0,0,.5), inset 0 0 0 2px #26364f; }
  .cqh-notch { position: absolute; top: 15px; left: 50%; transform: translateX(-50%); width: 86px; height: 22px; border-radius: 14px; background: #0b1524; z-index: 2; }
  .cqh-screen { width: 100%; height: 100%; border-radius: 34px; background: #f0f4f8; overflow: hidden; padding: 46px 14px 14px; display: flex; flex-direction: column; gap: 12px; color: #1a2433; }
  .cqh-ticket { background: white; border-radius: 18px; padding: 14px; text-align: center; border: 2px dashed #e3eaf3; }
  .cqh-count { display: block; font-size: 52px; font-weight: 800; line-height: 1; color: #1e3a5f; animation: cqh-pop .5s ease both; }
  .cqh-fl { position: absolute; background: white; color: #1e3a5f; border-radius: 14px; padding: 9px 13px; font-size: 12.5px; font-weight: 700; white-space: nowrap;
    box-shadow: 0 16px 34px rgba(0,0,0,.3); animation: cqh-bob 5s ease-in-out infinite; }
  .cqh-fl.f1 { left: -4px; top: 74px; }
  .cqh-fl.f2 { right: -4px; bottom: 120px; animation-delay: -2s; }
  .cqh-fl.f3 { left: 6px; bottom: 34px; animation-delay: -3.5s; }

  /* ── Sections ── */
  .cqh-section { max-width: 1120px; margin: 0 auto; padding: 56px 20px 0; }
  .cqh-h2 { margin: 0 0 8px; font-size: 34px; font-weight: 800; letter-spacing: -1px; color: #12263f; }
  .cqh-sub { margin: 0 0 22px; font-size: 16px; color: #6b7684; font-weight: 500; max-width: 560px; line-height: 1.55; }
  .cqh-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
  .cqh-card { background: white; border-radius: 24px; padding: 20px; border: 1px solid #e8eef5; box-shadow: 0 4px 18px rgba(30,58,95,.07); display: flex; flex-direction: column;
    transition: transform .2s ease, box-shadow .2s ease; }
  .cqh-card:hover { transform: translateY(-4px); box-shadow: 0 18px 40px rgba(30,58,95,.15); }
  .cqh-cta { display: flex; align-items: center; justify-content: center; gap: 8px; margin-top: auto; border-radius: 14px; padding: 13px 18px; font-size: 15px; font-weight: 800; text-decoration: none;
    transition: transform .15s ease, box-shadow .15s ease; }
  .cqh-cta .arrow { transition: transform .15s ease; }
  .cqh-cta:hover .arrow { transform: translateX(4px); }
  .cqh-skel { background: linear-gradient(90deg, #edf1f6 25%, #f7f9fc 37%, #edf1f6 63%); background-size: 800px 100%; animation: cqh-shimmer 1.4s infinite linear; border-radius: 12px; }
  .cqh-live { width: 9px; height: 9px; border-radius: 50%; background: #00b894; display: inline-block; flex-shrink: 0; animation: cqh-pulse 1.8s infinite; }

  .cqh-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
  .cqh-step { position: relative; background: white; border-radius: 24px; padding: 26px 22px 24px; border: 1px solid #e8eef5; overflow: hidden; }
  .cqh-step-num { position: absolute; right: 14px; top: 2px; font-size: 76px; font-weight: 800; letter-spacing: -3px; color: #eef3f9; line-height: 1; }
  .cqh-step-icon { position: relative; width: 52px; height: 52px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 25px; margin-bottom: 16px;
    background: linear-gradient(135deg, #e6f0fb, #e5f8f3); }

  .cqh-forclinics { position: relative; overflow: hidden; border-radius: 30px; padding: 40px 36px; color: white;
    background: radial-gradient(700px 300px at 100% 0%, #3b82c455 0%, transparent 60%), linear-gradient(150deg, #0f2540, #1e3a5f); }
  .cqh-bullets { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px 18px; margin: 22px 0 0; padding: 0; list-style: none; max-width: 640px; }
  .cqh-bullets li { font-size: 14.5px; font-weight: 600; color: rgba(255,255,255,.88); display: flex; gap: 10px; align-items: flex-start; line-height: 1.4; }

  .cqh-rise { animation: cqh-rise .6s cubic-bezier(.2,.8,.2,1) both; }

  @keyframes cqh-drift { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(24px, 26px); } }
  @keyframes cqh-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  @keyframes cqh-word { from { opacity: 0; transform: translateY(22px); } to { opacity: 1; transform: none; } }
  @keyframes cqh-rise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
  @keyframes cqh-pop { 0% { transform: scale(.55); opacity: 0; } 60% { transform: scale(1.14); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes cqh-pulse { 0% { box-shadow: 0 0 0 0 rgba(0,184,148,.55); } 70% { box-shadow: 0 0 0 9px rgba(0,184,148,0); } 100% { box-shadow: 0 0 0 0 rgba(0,184,148,0); } }
  @keyframes cqh-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes cqh-ring { 0%, 100% { box-shadow: 0 10px 28px rgba(255,140,0,.35); } 50% { box-shadow: 0 10px 44px rgba(255,140,0,.75); } }

  @media (max-width: 900px) {
    .cqh-hero { border-radius: 0 0 32px 32px; }
    .cqh-hero-grid { grid-template-columns: 1fr; gap: 34px; padding: 30px 18px 70px; }
    .cqh-h1 { font-size: 46px; letter-spacing: -1.5px; }
    .cqh-lead { font-size: 16px; }
    .cqh-navlinks .cqh-navlink { display: none; }
    .cqh-steps { grid-template-columns: 1fr; }
    .cqh-bullets { grid-template-columns: 1fr; }
    .cqh-forclinics { padding: 30px 22px; }
    .cqh-h2 { font-size: 28px; }
  }
  @media (max-width: 480px) {
    .cqh-grid { grid-template-columns: 1fr; }
    .cqh-go { padding: 13px 16px; }
    .cqh-fl.f1 { left: -10px; }
    .cqh-fl.f2 { right: -10px; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cqh-page * { animation: none !important; transition: none !important; }
    html { scroll-behavior: auto; }
  }
`;

// Always refreshes, so edits show up straight away while you are developing
function useHomeStyles() {
  useEffect(() => {
    const id = 'clinicq-home-styles';
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement('style');
      style.id = id;
      document.head.appendChild(style);
    }
    style.innerHTML = HOME_CSS;
  }, []);
}

// ── Little helpers ───────────────────────────────────────────────────
const PALETTE = [
  'linear-gradient(135deg,#1e3a5f,#2d6a9f)',
  'linear-gradient(135deg,#0f9b8e,#38d9a9)',
  'linear-gradient(135deg,#7b4bd6,#a78bfa)',
  'linear-gradient(135deg,#e67e22,#f6ad55)',
  'linear-gradient(135deg,#d6336c,#f783ac)',
  'linear-gradient(135deg,#2b8a3e,#69db7c)',
];

function avatarLook(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function initials(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] || '') + (words[1]?.[0] || '')).toUpperCase() || 'C';
}

// A friendly icon for common specialties (falls back to initials)
function specialtyIcon(specialty) {
  const s = String(specialty || '').toLowerCase();
  if (!s) return '';
  if (/dent|teeth|oral/.test(s)) return '🦷';
  if (/child|pedia|paedia|kid/.test(s)) return '🧒';
  if (/skin|derma|hair|cosmet/.test(s)) return '✨';
  if (/eye|ophth|vision/.test(s)) return '👁️';
  if (/heart|cardio/.test(s)) return '❤️';
  if (/ortho|bone|joint|physio/.test(s)) return '🦴';
  if (/\bent\b|ear|nose|throat/.test(s)) return '👂';
  if (/gyn|women|maternity|obst/.test(s)) return '🌸';
  if (/psych|mental|counsel/.test(s)) return '🧠';
  if (/general|physician|family|medicine|gp/.test(s)) return '🩺';
  return '';
}

function searchableText(clinic) {
  return [clinic.name, clinic.doctor_name, clinic.specialty, clinic.area, clinic.city, clinic.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// Taking tokens right now?
function isOpenNow(clinic) {
  return !clinic.is_paused && (!clinic.schedule || clinic.schedule.bookingOpen !== false);
}

// ── Pieces ───────────────────────────────────────────────────────────
const WORDS = ['the waiting room', 'the long queue', 'the crowd', 'the wait'];

function RotatingWord() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setI(x => (x + 1) % WORDS.length), 2600);
    return () => clearInterval(timer);
  }, []);
  return <span key={i} className="cqh-word">{WORDS[i]}</span>;
}

// A pretend patient phone that counts down by itself — shows the product at a glance
function PhoneMock() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep(s => (s + 1) % 4), 2300);
    return () => clearInterval(timer);
  }, []);

  const ahead = [3, 2, 1, 0][step];
  const called = step === 3;

  return (
    <div className="cqh-visual">
      <div className="cqh-phone" aria-hidden="true">
        <div className="cqh-notch" />
        <div className="cqh-screen">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10.5px', fontWeight: 800 }}>
            <span style={{ letterSpacing: '2px', color: '#b3bcc7' }}>CLINIC<span style={{ color: '#2d6a9f' }}>Q</span></span>
            <span style={{ color: '#8a94a3', fontWeight: 600 }}>Sharma Clinic</span>
          </div>

          <div className="cqh-ticket">
            <p style={{ margin: '0 0 2px', fontSize: '9.5px', fontWeight: 800, letterSpacing: '2px', color: '#b3bcc7' }}>TOKEN NUMBER</p>
            <p style={{ margin: '0 0 6px', fontSize: '58px', fontWeight: 800, lineHeight: 1, color: '#1e3a5f' }}>12</p>
            <span style={{
              display: 'inline-block', fontSize: '11px', fontWeight: 800, padding: '3px 12px', borderRadius: '999px',
              background: called ? '#fff8e1' : '#f0f7ff', color: called ? '#f39c12' : '#2d6a9f',
            }}>
              {called ? 'Called' : 'Waiting'}
            </span>
          </div>

          {called ? (
            <div style={{
              borderRadius: '18px', padding: '16px 12px', textAlign: 'center', color: 'white', animation: 'cqh-pop .5s ease both',
              background: 'linear-gradient(135deg,#ff8c00,#ffa500)', boxShadow: '0 10px 24px rgba(255,140,0,.4)',
            }}>
              <div style={{ fontSize: '24px', marginBottom: '2px' }}>🔔</div>
              <p style={{ margin: '0 0 8px', fontSize: '16px', fontWeight: 800 }}>It's your turn!</p>
              <div style={{ background: 'white', color: '#ff8c00', borderRadius: '11px', padding: '9px', fontSize: '13px', fontWeight: 800 }}>
                I'm Here ✓
              </div>
            </div>
          ) : (
            <div style={{ background: '#e8f1fb', borderRadius: '18px', padding: '14px 12px', textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: '10.5px', color: '#6b7684', fontWeight: 600 }}>People ahead of you</p>
              <span key={ahead} className="cqh-count">{ahead}</span>
              <p style={{ margin: '6px 0 0', fontSize: '10.5px', color: '#8a94a3', fontWeight: 600 }}>~{ahead * 5} min wait</p>
            </div>
          )}

          <div style={{ background: 'white', borderRadius: '14px', padding: '9px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', fontWeight: 700 }}>
            <span style={{ color: '#6b7684' }}>Live queue</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#00875f' }}>
              <span className="cqh-live" style={{ width: '7px', height: '7px' }} /> updating
            </span>
          </div>
        </div>
      </div>

      <div className="cqh-fl f1">✓ No app needed</div>
      <div className="cqh-fl f2">⏱ ~{Math.max(ahead * 5, 0)} min wait</div>
      <div className="cqh-fl f3">📍 Arrive when it's near</div>
    </div>
  );
}

// Small status line: is booking open, and if not, why and when
function StatusChip({ clinic }) {
  const s = clinic.schedule;
  let look;
  let text;
  let live = false;

  if (clinic.is_paused) {
    look = { bg: '#fff3e0', fg: '#c47f0a', dot: '#f39c12' };
    text = 'Registrations paused';
  } else if (!s || s.mode !== 'sessions') {
    look = { bg: '#e8f8f5', fg: '#00875f', dot: '#00b894' };
    text = 'Taking tokens now';
    live = true;
  } else if (s.bookingOpen) {
    look = { bg: '#e8f8f5', fg: '#00875f', dot: '#00b894' };
    text = `${s.sessionName ? `${s.sessionName} · ` : ''}${s.shortMessage}`;
    live = true;
  } else if (s.reason === 'closed_day') {
    look = { bg: '#f1f3f6', fg: '#6b7684', dot: '#a8b1bd' };
    text = s.shortMessage;
  } else {
    look = { bg: '#fff3e0', fg: '#c47f0a', dot: '#f39c12' };
    text = s.shortMessage;
  }

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '6px 12px', borderRadius: '999px',
      background: look.bg, color: look.fg, fontSize: '12.5px', fontWeight: 700, lineHeight: 1.3,
    }}>
      {live
        ? <span className="cqh-live" />
        : <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: look.dot, flexShrink: 0 }} />}
      {text}
    </span>
  );
}

function ClinicCard({ clinic, index }) {
  const doctorLine = [clinic.doctor_name, clinic.specialty].filter(Boolean).join(' · ');
  const placeLine = [clinic.area, clinic.city].filter(Boolean).join(', ');
  const unavailable = clinic.is_paused || (clinic.schedule && clinic.schedule.bookingOpen === false);
  const icon = specialtyIcon(clinic.specialty);

  return (
    <div className="cqh-card cqh-rise" style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}>
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', marginBottom: '14px' }}>
        <div style={{
          width: '60px', height: '60px', borderRadius: '18px', background: avatarLook(clinic.name), color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: icon ? '28px' : '20px',
          flexShrink: 0, boxShadow: '0 10px 20px rgba(30,58,95,0.2)',
        }}>
          {icon || initials(clinic.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 3px', fontSize: '18px', fontWeight: 800, color: '#12263f', letterSpacing: '-0.3px', wordBreak: 'break-word' }}>
            {clinic.name}
          </h3>
          {doctorLine && <p style={{ margin: 0, fontSize: '14px', color: '#2d6a9f', fontWeight: 700 }}>{doctorLine}</p>}
        </div>
      </div>

      <div style={{ marginBottom: '14px' }}>
        <StatusChip clinic={clinic} />
      </div>

      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {placeLine && <p style={{ margin: 0, fontSize: '13.5px', color: '#5a6472', fontWeight: 600 }}>📍 {placeLine}</p>}
        {clinic.address && <p style={{ margin: 0, fontSize: '12.5px', color: '#a8b1bd', paddingLeft: '22px' }}>{clinic.address}</p>}
        {clinic.timings && <p style={{ margin: 0, fontSize: '13.5px', color: '#5a6472', fontWeight: 600 }}>🕒 {clinic.timings}</p>}
      </div>

      <Link
        className="cqh-cta"
        to={`/c/${clinic.slug}/register`}
        style={unavailable ? {
          background: 'white', color: '#2d6a9f', border: '2px solid #dbeafe',
        } : {
          background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', color: 'white', border: '2px solid transparent',
          boxShadow: '0 10px 22px rgba(30,58,95,0.28)',
        }}
      >
        {unavailable ? 'View details' : 'Get my token'} <span className="arrow">→</span>
      </Link>
    </div>
  );
}

function SkeletonCards() {
  return (
    <div className="cqh-grid">
      {[0, 1, 2].map(i => (
        <div key={i} className="cqh-card">
          <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
            <div className="cqh-skel" style={{ width: '60px', height: '60px', borderRadius: '18px' }} />
            <div style={{ flex: 1 }}>
              <div className="cqh-skel" style={{ height: '16px', width: '60%', marginBottom: '10px' }} />
              <div className="cqh-skel" style={{ height: '12px', width: '45%' }} />
            </div>
          </div>
          <div className="cqh-skel" style={{ height: '26px', width: '55%', marginBottom: '14px' }} />
          <div className="cqh-skel" style={{ height: '12px', width: '80%', marginBottom: '8px' }} />
          <div className="cqh-skel" style={{ height: '46px', marginTop: '14px' }} />
        </div>
      ))}
    </div>
  );
}

// Slim bar at the very top for returning patients
function MyTokenBar({ info }) {
  const called = info.status === 'called';
  return (
    <Link
      to={`/c/${info.slug}/token/${info.accessToken}`}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap',
        padding: '11px 16px', textDecoration: 'none', color: 'white', fontSize: '14px', fontWeight: 700,
        background: called ? 'linear-gradient(90deg,#ff8c00,#ffa500)' : 'linear-gradient(90deg,#16304f,#2d6a9f)',
        animation: called ? 'cqh-ring 1.6s ease-in-out infinite' : 'none',
      }}
    >
      <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: '10px', padding: '3px 10px', fontWeight: 800 }}>#{info.tokenNumber}</span>
      <span>
        {called ? "It's your turn" : 'Your active token'} · {info.clinicName || 'your clinic'}
      </span>
      <span style={{ background: 'white', color: called ? '#e67e00' : '#1e3a5f', borderRadius: '999px', padding: '4px 14px', fontSize: '13px', fontWeight: 800 }}>
        {called ? 'Check in →' : 'View →'}
      </span>
    </Link>
  );
}

const STEPS = [
  { icon: '🔍', title: 'Find your clinic', text: 'Search by clinic, doctor, specialty or area, and see at a glance who is taking tokens.' },
  { icon: '🎟️', title: 'Get your token', text: 'Join the queue from home in a few seconds. No app to install, no account to make.' },
  { icon: '🔔', title: 'Arrive on time', text: 'Watch your turn move up live and head over when it is close. Skip the waiting room.' },
];

const CLINIC_POINTS = [
  'A live queue board for your waiting area',
  'One simple staff screen to call, skip and add walk-ins',
  'Morning and evening sessions with their own token numbers',
  'Online token limits and a closing-time warning',
];

export default function Home() {
  useHomeStyles();

  const [clinics, setClinics] = useState([]);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // 'all' | 'open' | a specialty name
  const [reloadKey, setReloadKey] = useState(0);
  const [myToken, setMyToken] = useState(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    fetch(`${SERVER}/api/public/clinics`, { cache: 'no-store', signal: controller.signal })
      .then(res => {
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then(data => {
        setClinics(data.clinics || []);
        setStatus('ready');
      })
      .catch(err => {
        if (err.name !== 'AbortError') setStatus('error');
      });
    return () => controller.abort();
  }, [reloadKey]);

  // Quietly refresh every minute so "booking opens at…" never goes stale
  useEffect(() => {
    if (status !== 'ready') return undefined;
    const controller = new AbortController();
    const timer = setInterval(() => {
      fetch(`${SERVER}/api/public/clinics`, { cache: 'no-store', signal: controller.signal })
        .then(res => (res.ok ? res.json() : null))
        .then(data => { if (data?.clinics) setClinics(data.clinics); })
        .catch(() => {});
    }, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [status]);

  // Does this device have a token that is still active? (saved by the token page)
  useEffect(() => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(ACTIVE_TOKEN_KEY) || 'null');
    } catch {
      saved = null;
    }
    if (!saved?.slug || !saved?.accessToken) return undefined;

    const controller = new AbortController();
    const check = () => {
      fetch(`${SERVER}/api/c/${encodeURIComponent(saved.slug)}/patient/${saved.accessToken}`, { cache: 'no-store', signal: controller.signal })
        .then(res => (res.ok ? res.json() : null))
        .then(patient => {
          const live = patient && !patient.queueEnded && (patient.status === 'waiting' || patient.status === 'called');
          if (live) {
            setMyToken({ ...saved, tokenNumber: patient.token_number, status: patient.status });
          } else {
            setMyToken(null);
            try { localStorage.removeItem(ACTIVE_TOKEN_KEY); } catch { /* ignore */ }
          }
        })
        .catch(() => {});
    };
    check();
    const timer = setInterval(check, REFRESH_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, []);

  const specialties = useMemo(() => {
    const counts = new Map();
    clinics.forEach(c => {
      const s = (c.specialty || '').trim();
      if (s) counts.set(s, (counts.get(s) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name);
  }, [clinics]);

  const openCount = useMemo(() => clinics.filter(isOpenNow).length, [clinics]);

  // Every word typed must appear somewhere in the clinic's details
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return clinics.filter(clinic => {
      if (filter === 'open' && !isOpenNow(clinic)) return false;
      if (filter !== 'all' && filter !== 'open' && (clinic.specialty || '').trim() !== filter) return false;
      if (words.length === 0) return true;
      const text = searchableText(clinic);
      return words.every(word => text.includes(word));
    });
  }, [clinics, query, filter]);

  const goToClinics = () => {
    document.getElementById('clinics')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const message = (title, text, extra = null) => (
    <div className="cqh-rise" style={{ background: 'white', borderRadius: '24px', padding: '36px 24px', textAlign: 'center', border: '1px solid #e8eef5' }}>
      <p style={{ margin: '0 0 6px', fontSize: '17px', fontWeight: 800, color: '#12263f' }}>{title}</p>
      <p style={{ margin: '0 auto', maxWidth: '440px', fontSize: '14px', color: '#8a94a3', lineHeight: 1.55 }}>{text}</p>
      {extra}
    </div>
  );

  const heroChip = (key, label) => (
    <button
      key={key}
      type="button"
      className={`cqh-chip ${filter === key ? 'on' : ''}`}
      onClick={() => { setFilter(key); goToClinics(); }}
      aria-pressed={filter === key}
    >
      {label}
    </button>
  );

  return (
    <div className="cqh-page">

      {myToken && <MyTokenBar info={myToken} />}

      {/* ── Hero ── */}
      <header className="cqh-hero">
        <div className="cqh-dots" />
        <div className="cqh-glow a" />
        <div className="cqh-glow b" />

        <nav className="cqh-nav">
          <a href="#top" className="cqh-logo">
            <span className="cqh-logo-mark">Q</span>
            ClinicQ
          </a>
          <div className="cqh-navlinks">
            <a href="#how" className="cqh-navlink">How it works</a>
            <a href="#for-clinics" className="cqh-navlink">For clinics</a>
            <a href="#clinics" className="cqh-navbtn">Find a clinic</a>
          </div>
        </nav>

        <div className="cqh-hero-grid" id="top">
          <div>
            <div className="cqh-pill cqh-rise">
              <span className="cqh-live" />
              {status === 'ready' && clinics.length > 0
                ? `${openCount} clinic${openCount === 1 ? '' : 's'} taking tokens now`
                : 'Live queues for local clinics'}
            </div>

            <h1 className="cqh-h1 cqh-rise" style={{ animationDelay: '80ms' }}>
              Skip<br /><RotatingWord />
            </h1>

            <p className="cqh-lead cqh-rise" style={{ animationDelay: '160ms' }}>
              Get your token from home, watch your turn move up live, and arrive when it's nearly time. No app, no login, no crowded room.
            </p>

            <div className="cqh-searchbox cqh-rise" style={{ animationDelay: '240ms' }}>
              <span style={{ fontSize: '19px', opacity: 0.55 }}>🔍</span>
              <input
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') goToClinics(); }}
                placeholder="Search clinic, doctor, specialty or area"
                aria-label="Search clinics"
              />
              <button type="button" className="cqh-go" onClick={goToClinics}>Search</button>
            </div>

            {status === 'ready' && clinics.length > 0 && (
              <div className="cqh-chips cqh-rise" style={{ animationDelay: '300ms' }}>
                {heroChip('open', '● Open now')}
                {specialties.map(s => heroChip(s, s))}
              </div>
            )}

            <div className="cqh-trust cqh-rise" style={{ animationDelay: '360ms' }}>
              <span>✓ No app to install</span>
              <span>✓ No login</span>
              <span>✓ Live position</span>
            </div>
          </div>

          <PhoneMock />
        </div>
      </header>

      {/* ── Clinics ── */}
      <section className="cqh-section" id="clinics">
        <h2 className="cqh-h2">Find your clinic</h2>
        <p className="cqh-sub">
          {status === 'ready' && clinics.length > 0
            ? `${clinics.length} clinic${clinics.length === 1 ? '' : 's'} on ClinicQ${openCount > 0 ? `, ${openCount} taking tokens right now.` : '.'}`
            : 'Pick your clinic, get a token, and track your turn live.'}
        </p>

        {status === 'ready' && clinics.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '18px' }}>
            {[['all', 'All'], ['open', '● Open now'], ...specialties.map(s => [s, s])].map(([key, label]) => {
              const on = filter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFilter(key)}
                  aria-pressed={on}
                  style={{
                    padding: '8px 15px', borderRadius: '999px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    border: on ? '2px solid #1e3a5f' : '2px solid #e3e9f1',
                    background: on ? 'linear-gradient(135deg,#1e3a5f,#2d6a9f)' : 'white',
                    color: on ? 'white' : '#5a6472',
                    boxShadow: on ? '0 6px 16px rgba(30,58,95,0.22)' : 'none',
                  }}
                >
                  {label}
                </button>
              );
            })}
            {query.trim() && (
              <button
                type="button"
                onClick={() => setQuery('')}
                style={{ padding: '8px 15px', borderRadius: '999px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', border: '2px dashed #cdd6e2', background: 'transparent', color: '#6b7684' }}
              >
                ✕ "{query.trim()}"
              </button>
            )}
          </div>
        )}

        {status === 'loading' && <SkeletonCards />}

        {status === 'error' && message(
          'Could not load clinics',
          'Please check your internet connection and try again.',
          <button
            onClick={() => setReloadKey(k => k + 1)}
            style={{ marginTop: '16px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '12px', padding: '11px 24px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Try again
          </button>
        )}

        {status === 'ready' && clinics.length === 0 && message(
          'No clinics are listed yet',
          'Ask your clinic for their ClinicQ link, or scan the QR code at the clinic.'
        )}

        {status === 'ready' && clinics.length > 0 && results.length === 0 && message(
          query.trim() ? `No clinics match "${query.trim()}"` : 'No clinics match this filter',
          "Check the spelling or try the doctor's name or area. You can also ask your clinic for their ClinicQ link, or scan the QR code at the clinic.",
          <button
            onClick={() => { setQuery(''); setFilter('all'); }}
            style={{ marginTop: '16px', background: 'white', color: '#2d6a9f', border: '2px solid #dbeafe', borderRadius: '12px', padding: '10px 22px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Clear search and filters
          </button>
        )}

        {status === 'ready' && results.length > 0 && (
          <div className="cqh-grid">
            {results.map((clinic, i) => <ClinicCard key={clinic.slug} clinic={clinic} index={i} />)}
          </div>
        )}
      </section>

      {/* ── How it works ── */}
      <section className="cqh-section" id="how">
        <h2 className="cqh-h2">How it works</h2>
        <p className="cqh-sub">Three steps. Under a minute. Nothing to download.</p>
        <div className="cqh-steps">
          {STEPS.map((step, i) => (
            <div key={step.title} className="cqh-step">
              <span className="cqh-step-num">0{i + 1}</span>
              <div className="cqh-step-icon">{step.icon}</div>
              <h3 style={{ margin: '0 0 6px', fontSize: '18px', fontWeight: 800, color: '#12263f', letterSpacing: '-0.3px' }}>{step.title}</h3>
              <p style={{ margin: 0, fontSize: '14.5px', color: '#6b7684', lineHeight: 1.6, fontWeight: 500 }}>{step.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── For clinics ── */}
      <section className="cqh-section" id="for-clinics">
        <div className="cqh-forclinics">
          <p style={{ margin: '0 0 8px', fontSize: '12px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#8fd0ff' }}>For clinics</p>
          <h2 style={{ margin: '0 0 10px', fontSize: '32px', fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.15, maxWidth: '560px' }}>
            Give your patients a smarter waiting room
          </h2>
          <p style={{ margin: 0, maxWidth: '560px', fontSize: '16px', lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
            ClinicQ replaces the crowded bench with a live queue on every patient's phone. Simple enough for a single-doctor clinic.
          </p>
          <ul className="cqh-bullets">
            {CLINIC_POINTS.map(point => (
              <li key={point}><span style={{ color: '#7ad6c4', fontWeight: 800 }}>✓</span>{point}</li>
            ))}
          </ul>
          {CONTACT_EMAIL && (
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('ClinicQ for my clinic')}`}
              style={{
                display: 'inline-block', marginTop: '26px', background: 'white', color: '#1e3a5f', borderRadius: '14px',
                padding: '13px 24px', fontWeight: 800, fontSize: '15px', textDecoration: 'none', boxShadow: '0 12px 28px rgba(0,0,0,0.25)',
              }}
            >
              Talk to us →
            </a>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ textAlign: 'center', padding: '48px 20px 40px' }}>
        <div className="cqh-logo" style={{ justifyContent: 'center', color: '#12263f', marginBottom: '8px' }}>
          <span className="cqh-logo-mark" style={{ width: '30px', height: '30px', fontSize: '15px' }}>Q</span>
          ClinicQ
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: '#a8b1bd' }}>No app or login needed · Track your position live</p>
      </footer>
    </div>
  );
}