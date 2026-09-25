import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import SERVER from '../config';

function searchableText(clinic) {
  return [clinic.name, clinic.doctor_name, clinic.specialty, clinic.area, clinic.city, clinic.address]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function ClinicCard({ clinic }) {
  const doctorLine = [clinic.doctor_name, clinic.specialty].filter(Boolean).join(' · ');
  const placeLine = [clinic.area, clinic.city].filter(Boolean).join(', ');

  return (
    <div style={{
      background: 'white', borderRadius: '20px', padding: '20px 22px',
      boxShadow: '0 4px 20px rgba(30,58,95,0.07)', border: '1px solid #eef1f5',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '16px', flexWrap: 'wrap',
    }}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
          <h3 style={{ fontSize: '17px', fontWeight: '800', color: '#1e3a5f', margin: 0 }}>{clinic.name}</h3>
          {clinic.is_paused && (
            <span style={{ fontSize: '11px', fontWeight: '700', padding: '3px 10px', borderRadius: '20px', background: '#fff3e0', color: '#d68910' }}>
              Registrations paused
            </span>
          )}
        </div>
        {doctorLine && <p style={{ fontSize: '14px', color: '#2d6a9f', fontWeight: '600', margin: '0 0 6px' }}>{doctorLine}</p>}
        {placeLine && <p style={{ fontSize: '13px', color: '#6b7684', margin: '0 0 2px' }}>📍 {placeLine}</p>}
        {clinic.address && <p style={{ fontSize: '12.5px', color: '#a8b1bd', margin: '0 0 2px' }}>{clinic.address}</p>}
        {clinic.timings && <p style={{ fontSize: '13px', color: '#6b7684', margin: '4px 0 0' }}>🕒 {clinic.timings}</p>}
      </div>
      <Link
        to={`/c/${clinic.slug}/register`}
        style={{
          background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', color: 'white', textDecoration: 'none',
          borderRadius: '14px', padding: '12px 20px', fontSize: '14px', fontWeight: '700',
          boxShadow: '0 6px 18px rgba(30,58,95,0.25)', whiteSpace: 'nowrap',
        }}
      >
        Get token →
      </Link>
    </div>
  );
}

export default function Home() {
  const [clinics, setClinics] = useState([]);
  const [status, setStatus] = useState('loading');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

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

  // Every word typed must appear somewhere in the clinic's details
  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return clinics;
    return clinics.filter(clinic => {
      const text = searchableText(clinic);
      return words.every(word => text.includes(word));
    });
  }, [clinics, query]);

  const message = (title, text, extra = null) => (
    <div style={{ background: 'white', borderRadius: '20px', padding: '32px 24px', textAlign: 'center', boxShadow: '0 4px 20px rgba(30,58,95,0.06)' }}>
      <p style={{ fontSize: '16px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 6px' }}>{title}</p>
      <p style={{ fontSize: '13.5px', color: '#8a94a3', margin: 0, lineHeight: 1.55 }}>{text}</p>
      {extra}
    </div>
  );

  return (
    <div style={{
      minHeight: '100vh', background: '#f0f4f8', fontFamily: "'Segoe UI',sans-serif",
      padding: '40px 16px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: '-140px', right: '-140px', width: '360px', height: '360px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45,106,159,0.09) 0%, transparent 70%)',
      }} />

      <div style={{ maxWidth: '640px', margin: '0 auto', position: 'relative', zIndex: 1 }}>

        {/* ── Hero ── */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <p style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '4px', color: '#bbb', textTransform: 'uppercase', margin: '0 0 22px' }}>
            Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
          </p>
          <h1 style={{ fontSize: '32px', fontWeight: '900', color: '#1e3a5f', margin: '0 0 10px', letterSpacing: '-0.5px' }}>
            Skip the waiting room
          </h1>
          <p style={{ fontSize: '15px', color: '#6b7684', margin: '0 auto', maxWidth: '440px', lineHeight: 1.55 }}>
            Find your clinic, get your token from home, and arrive when it's nearly your turn.
          </p>
        </div>

        {/* ── Search ── */}
        <div style={{ position: 'relative', marginBottom: '24px' }}>
          <span style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px', opacity: 0.5 }}>🔍</span>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search by clinic, doctor, specialty or area"
            aria-label="Search clinics"
            style={{
              width: '100%', boxSizing: 'border-box', border: '2px solid #e3e9f1', background: 'white',
              borderRadius: '18px', padding: '17px 18px 17px 50px', fontSize: '16px', color: '#1a1a2e',
              outline: 'none', boxShadow: '0 8px 24px rgba(30,58,95,0.08)',
            }}
            onFocus={e => { e.target.style.borderColor = '#2d6a9f'; }}
            onBlur={e => { e.target.style.borderColor = '#e3e9f1'; }}
          />
        </div>

        {/* ── Results ── */}
        {status === 'loading' && message('Loading clinics…', 'The first load can take up to a minute.')}

        {status === 'error' && message(
          'Could not load clinics',
          'Please check your internet connection and try again.',
          <button
            onClick={() => setReloadKey(k => k + 1)}
            style={{ marginTop: '16px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '12px', padding: '10px 22px', fontWeight: '700', cursor: 'pointer' }}
          >
            Try again
          </button>
        )}

        {status === 'ready' && clinics.length === 0 && message(
          'No clinics are listed yet',
          "Ask your clinic for their ClinicQ link, or scan the QR code at the clinic."
        )}

        {status === 'ready' && clinics.length > 0 && results.length === 0 && message(
          `No clinics match "${query.trim()}"`,
          "Check the spelling or try the doctor's name or area. You can also ask your clinic for their ClinicQ link, or scan the QR code at the clinic."
        )}

        {status === 'ready' && results.length > 0 && (
          <>
            <p style={{ fontSize: '12px', fontWeight: '700', color: '#a8b1bd', letterSpacing: '1px', textTransform: 'uppercase', margin: '0 0 12px 4px' }}>
              {query.trim() ? `${results.length} matching clinic${results.length === 1 ? '' : 's'}` : `${results.length} clinic${results.length === 1 ? '' : 's'}`}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {results.map(clinic => <ClinicCard key={clinic.slug} clinic={clinic} />)}
            </div>
          </>
        )}

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '36px' }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#c3e9d8' }} />
          <p style={{ fontSize: '12px', color: '#b3bcc7', margin: 0 }}>No app or login needed · Track your position live</p>
        </div>
      </div>
    </div>
  );
}