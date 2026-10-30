import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SERVER from '../config';

const REFRESH_MS = 60000; // statuses like "Booking opens at 3 PM" stay fresh
const ACTIVE_TOKEN_KEY = 'cq_active_token'; // saved by the token page

const HOME_CSS = `
  .cqh-page { min-height: 100vh; background: #f0f4f8; font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #1a2433; overflow-x: hidden; }
  .cqh-page * { box-sizing: border-box; }
  .cqh-hero { position: relative; overflow: hidden; padding: 56px 16px 104px; text-align: center; color: white;
    background: linear-gradient(160deg, #16304f 0%, #1e3a5f 42%, #2d6a9f 100%); }
  .cqh-blob { position: absolute; border-radius: 50%; animation: cqh-float 9s ease-in-out infinite; pointer-events: none; }
  .cqh-blob.a { width: 300px; height: 300px; top: -100px; left: -80px; opacity: .45; background: radial-gradient(circle, #5fb0ff 0%, transparent 70%); }
  .cqh-blob.b { width: 360px; height: 360px; bottom: -150px; right: -100px; opacity: .4; background: radial-gradient(circle, #7ad6c4 0%, transparent 70%); animation-delay: -4s; }
  .cqh-blob.c { width: 170px; height: 170px; top: 38%; left: 62%; opacity: .3; background: radial-gradient(circle, #ffffff 0%, transparent 70%); animation-delay: -2s; }
  .cqh-inner { position: relative; z-index: 1; max-width: 640px; margin: 0 auto; }
  .cqh-body { position: relative; z-index: 2; max-width: 680px; margin: -66px auto 0; padding: 0 16px 48px; }
  .cqh-rise { animation: cqh-rise .55s ease both; }
  .cqh-live { width: 9px; height: 9px; border-radius: 50%; background: #00b894; display: inline-block; flex-shrink: 0; animation: cqh-pulse 1.8s infinite; }
  .cqh-card { transition: transform .18s ease, box-shadow .18s ease; }
  .cqh-card:hover { transform: translateY(-3px); box-shadow: 0 14px 34px rgba(30,58,95,.15) !important; }
  .cqh-cta { transition: transform .15s ease; }
  .cqh-cta:hover { transform: translateX(3px); }
  .cqh-chip-btn { transition: all .15s ease; }
  .cqh-chip-btn:hover { transform: translateY(-1px); }
  .cqh-skel { background: linear-gradient(90deg, #edf1f6 25%, #f7f9fc 37%, #edf1f6 63%); background-size: 800px 100%; animation: cqh-shimmer 1.4s infinite linear; border-radius: 12px; }
  .cqh-ring { animation: cqh-ring 1.6s ease-in-out infinite; }
  .cqh-steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  @keyframes cqh-float { 0%, 100% { transform: translate(0, 0); } 50% { transform: translate(14px, 20px); } }
  @keyframes cqh-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
  @keyframes cqh-pulse { 0% { box-shadow: 0 0 0 0 rgba(0,184,148,.55); } 70% { box-shadow: 0 0 0 9px rgba(0,184,148,0); } 100% { box-shadow: 0 0 0 0 rgba(0,184,148,0); } }
  @keyframes cqh-shimmer { 0% { background-position: -400px 0; } 100% { background-position: 400px 0; } }
  @keyframes cqh-ring { 0%, 100% { box-shadow: 0 10px 28px rgba(255,140,0,.35); } 50% { box-shadow: 0 10px 42px rgba(255,140,0,.7); } }
  @media (max-width: 640px) {
    .cqh-hero { padding: 44px 16px 96px; }
    .cqh-h1 { font-size: 32px !important; }
    .cqh-steps { grid-template-columns: 1fr; }
  }
  @media (prefers-reduced-motion: reduce) {
    .cqh-page * { animation: none !important; transition: none !important; }
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

function greeting() {
  const hour = Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' })) % 24;
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
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

  return (
    <div
      className="cqh-card cqh-rise"
      style={{
        animationDelay: `${Math.min(index, 8) * 70}ms`, background: 'white', borderRadius: '20px',
        padding: '18px 20px', border: '1px solid #eaeff5', boxShadow: '0 4px 18px rgba(30,58,95,0.07)',
      }}
    >
      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
        <div style={{
          width: '52px', height: '52px', borderRadius: '16px', background: avatarLook(clinic.name), color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '18px',
          flexShrink: 0, boxShadow: '0 6px 14px rgba(30,58,95,0.18)',
        }}>
          {initials(clinic.name)}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 style={{ margin: '0 0 3px', fontSize: '17px', fontWeight: 800, color: '#1e3a5f', wordBreak: 'break-word' }}>{clinic.name}</h3>
          {doctorLine && <p style={{ margin: '0 0 5px', fontSize: '14px', color: '#2d6a9f', fontWeight: 600 }}>{doctorLine}</p>}
          {placeLine && <p style={{ margin: '0 0 2px', fontSize: '13px', color: '#6b7684' }}>📍 {placeLine}</p>}
          {clinic.address && <p style={{ margin: '0 0 2px', fontSize: '12.5px', color: '#a8b1bd' }}>{clinic.address}</p>}
          {clinic.timings && <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6b7684' }}>🕒 {clinic.timings}</p>}
        </div>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #f0f3f8',
      }}>
        <StatusChip clinic={clinic} />
        <Link
          className="cqh-cta"
          to={`/c/${clinic.slug}/register`}
          style={unavailable ? {
            background: 'white', color: '#2d6a9f', textDecoration: 'none', border: '2px solid #dbeafe',
            borderRadius: '14px', padding: '10px 18px', fontSize: '14px', fontWeight: 700, whiteSpace: 'nowrap',
          } : {
            background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', color: 'white', textDecoration: 'none',
            borderRadius: '14px', padding: '11px 20px', fontSize: '14px', fontWeight: 700,
            boxShadow: '0 6px 18px rgba(30,58,95,0.25)', whiteSpace: 'nowrap',
          }}
        >
          {unavailable ? 'View details →' : 'Get token →'}
        </Link>
      </div>
    </div>
  );
}

// "You have an active token" — shown to returning patients
function MyTokenCard({ info }) {
  const called = info.status === 'called';
  return (
    <Link
      to={`/c/${info.slug}/token/${info.accessToken}`}
      className={`cqh-rise ${called ? 'cqh-ring' : ''}`}
      style={{
        display: 'flex', alignItems: 'center', gap: '16px', textDecoration: 'none', color: 'white',
        borderRadius: '20px', padding: '16px 18px', marginBottom: '14px',
        background: called ? 'linear-gradient(135deg,#ff8c00,#ffa500)' : 'linear-gradient(135deg,#1e3a5f,#2d6a9f)',
        boxShadow: called ? '0 10px 28px rgba(255,140,0,0.4)' : '0 10px 28px rgba(30,58,95,0.3)',
      }}
    >
      <div style={{
        minWidth: '66px', height: '66px', borderRadius: '18px', background: 'rgba(255,255,255,0.18)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '28px', fontWeight: 900,
        fontVariantNumeric: 'tabular-nums', padding: '0 10px',
      }}>
        #{info.tokenNumber}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: '0 0 2px', fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', opacity: 0.8 }}>
          {called ? "It's your turn!" : 'Your active token'}
        </p>
        <p style={{ margin: 0, fontSize: '17px', fontWeight: 800, wordBreak: 'break-word' }}>{info.clinicName || 'Your clinic'}</p>
        <p style={{ margin: '2px 0 0', fontSize: '13px', opacity: 0.85 }}>
          {called ? 'Tap to check in' : 'Tap to see your place in the queue'}
        </p>
      </div>
      <span style={{ fontSize: '22px', fontWeight: 700 }}>→</span>
    </Link>
  );
}

function SkeletonCards() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ background: 'white', borderRadius: '20px', padding: '18px 20px', border: '1px solid #eaeff5' }}>
          <div style={{ display: 'flex', gap: '14px' }}>
            <div className="cqh-skel" style={{ width: '52px', height: '52px', borderRadius: '16px' }} />
            <div style={{ flex: 1 }}>
              <div className="cqh-skel" style={{ height: '16px', width: '55%', marginBottom: '10px' }} />
              <div className="cqh-skel" style={{ height: '12px', width: '40%', marginBottom: '8px' }} />
              <div className="cqh-skel" style={{ height: '12px', width: '70%' }} />
            </div>
          </div>
          <div className="cqh-skel" style={{ height: '36px', marginTop: '16px' }} />
        </div>
      ))}
    </div>
  );
}

const STEPS = [
  { icon: '🔍', title: 'Find your clinic', text: 'Search by clinic, doctor, specialty or area.' },
  { icon: '🎟️', title: 'Get your token', text: 'Join the queue from home in a few seconds.' },
  { icon: '🔔', title: 'Arrive on time', text: 'Watch your turn live and head over when it is close.' },
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
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);
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

  const message = (title, text, extra = null) => (
    <div className="cqh-rise" style={{ background: 'white', borderRadius: '20px', padding: '32px 24px', textAlign: 'center', boxShadow: '0 4px 20px rgba(30,58,95,0.06)' }}>
      <p style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 800, color: '#1e3a5f' }}>{title}</p>
      <p style={{ margin: 0, fontSize: '13.5px', color: '#8a94a3', lineHeight: 1.55 }}>{text}</p>
      {extra}
    </div>
  );

  const filterChip = (key, label) => {
    const selected = filter === key;
    return (
      <button
        key={key}
        type="button"
        className="cqh-chip-btn"
        onClick={() => setFilter(key)}
        aria-pressed={selected}
        style={{
          padding: '8px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          border: selected ? '2px solid #1e3a5f' : '2px solid #e3e9f1',
          background: selected ? 'linear-gradient(135deg,#1e3a5f,#2d6a9f)' : 'white',
          color: selected ? 'white' : '#5a6472',
          boxShadow: selected ? '0 4px 12px rgba(30,58,95,0.22)' : 'none',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="cqh-page">

      {/* ── Hero ── */}
      <div className="cqh-hero">
        <div className="cqh-blob a" />
        <div className="cqh-blob b" />
        <div className="cqh-blob c" />
        <div className="cqh-inner">
          <p className="cqh-rise" style={{ margin: '0 0 22px', fontSize: '13px', fontWeight: 800, letterSpacing: '4px', textTransform: 'uppercase', opacity: 0.85 }}>
            Clinic<span style={{ color: '#8fd0ff' }}>Q</span>
          </p>
          <p className="cqh-rise" style={{ margin: '0 0 10px', fontSize: '15px', fontWeight: 600, opacity: 0.9, animationDelay: '60ms' }}>
            {greeting()} 👋
          </p>
          <h1 className="cqh-h1 cqh-rise" style={{ margin: '0 0 12px', fontSize: '42px', fontWeight: 900, letterSpacing: '-1px', lineHeight: 1.1, animationDelay: '120ms' }}>
            Skip the{' '}
            <span style={{ background: 'linear-gradient(90deg,#9be7ff,#b8ffe0)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
              waiting room
            </span>
          </h1>
          <p className="cqh-rise" style={{ margin: '0 auto', maxWidth: '460px', fontSize: '16px', lineHeight: 1.55, opacity: 0.9, animationDelay: '180ms' }}>
            Find your clinic, get your token from home, and arrive when it's nearly your turn.
          </p>
          <div className="cqh-rise" style={{ display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', marginTop: '22px', animationDelay: '240ms' }}>
            {['No app to install', 'No login', 'Live position'].map(t => (
              <span key={t} style={{ padding: '6px 14px', borderRadius: '999px', background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.22)', fontSize: '12.5px', fontWeight: 600 }}>
                ✓ {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="cqh-body">

        {/* ── Returning patient ── */}
        {myToken && <MyTokenCard info={myToken} />}

        {/* ── Search ── */}
        <div className="cqh-rise" style={{ background: 'white', borderRadius: '22px', padding: '16px', boxShadow: '0 14px 40px rgba(30,58,95,0.16)', marginBottom: '18px', animationDelay: '300ms' }}>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', opacity: 0.5 }}>🔍</span>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by clinic, doctor, specialty or area"
              aria-label="Search clinics"
              style={{
                width: '100%', border: '2px solid #e3e9f1', background: '#fbfcfe', borderRadius: '16px',
                padding: '15px 16px 15px 46px', fontSize: '16px', color: '#1a2433', outline: 'none', fontFamily: 'inherit',
              }}
              onFocus={e => { e.target.style.borderColor = '#2d6a9f'; e.target.style.background = 'white'; }}
              onBlur={e => { e.target.style.borderColor = '#e3e9f1'; e.target.style.background = '#fbfcfe'; }}
            />
          </div>

          {status === 'ready' && clinics.length > 0 && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
              {filterChip('all', 'All')}
              {filterChip('open', '● Open now')}
              {specialties.map(s => filterChip(s, s))}
            </div>
          )}
        </div>

        {status === 'ready' && clinics.length > 0 && (
          <p style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '0 0 12px 4px', fontSize: '12.5px', fontWeight: 700, color: '#8a94a3' }}>
            {openCount > 0 && <span className="cqh-live" />}
            {results.length === clinics.length
              ? `${clinics.length} clinic${clinics.length === 1 ? '' : 's'} · ${openCount} open now`
              : `${results.length} of ${clinics.length} clinic${clinics.length === 1 ? '' : 's'}`}
          </p>
        )}

        {/* ── Results ── */}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {results.map((clinic, i) => <ClinicCard key={clinic.slug} clinic={clinic} index={i} />)}
          </div>
        )}

        {/* ── How it works ── */}
        <div style={{ marginTop: '44px' }}>
          <p style={{ margin: '0 0 14px', textAlign: 'center', fontSize: '12px', fontWeight: 800, letterSpacing: '3px', textTransform: 'uppercase', color: '#a8b1bd' }}>
            How it works
          </p>
          <div className="cqh-steps">
            {STEPS.map((step, i) => (
              <div
                key={step.title}
                className="cqh-rise"
                style={{ background: 'white', borderRadius: '18px', padding: '18px 16px', textAlign: 'center', border: '1px solid #eaeff5', animationDelay: `${i * 90}ms` }}
              >
                <div style={{ width: '46px', height: '46px', margin: '0 auto 10px', borderRadius: '14px', background: '#eef4fb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px' }}>
                  {step.icon}
                </div>
                <p style={{ margin: '0 0 4px', fontSize: '14.5px', fontWeight: 800, color: '#1e3a5f' }}>{i + 1}. {step.title}</p>
                <p style={{ margin: 0, fontSize: '13px', color: '#8a94a3', lineHeight: 1.5 }}>{step.text}</p>
              </div>
            ))}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '40px' }}>
          <p style={{ margin: '0 0 6px', fontSize: '11px', fontWeight: 800, letterSpacing: '4px', color: '#c3cad3' }}>
            CLINIC<span style={{ color: '#2d6a9f' }}>Q</span>
          </p>
          <p style={{ margin: 0, fontSize: '12px', color: '#b3bcc7' }}>No app or login needed · Track your position live</p>
        </div>
      </div>
    </div>
  );
}