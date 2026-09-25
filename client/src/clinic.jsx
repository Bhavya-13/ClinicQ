import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import SERVER from './config';

const ClinicContext = createContext(null);

const INACTIVE_RECHECK_MS = 30000;

// One live connection per clinic, reused across pages.
// If the server cut it (clinic was turned off), reconnect when needed again.
const sockets = new Map();
function getClinicSocket(slug) {
  let socket = sockets.get(slug);
  if (!socket) {
    socket = io(SERVER, { query: { clinic: slug } });
    sockets.set(slug, socket);
  } else if (!socket.active) {
    socket.connect();
  }
  return socket;
}

function CenteredMessage({ icon, title, text, note, showRetry }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px', boxSizing: 'border-box',
      fontFamily: "'Segoe UI',sans-serif", textAlign: 'center',
    }}>
      <div style={{
        maxWidth: '400px', width: '100%', background: 'white', borderRadius: '24px',
        padding: '36px 28px', boxShadow: '0 20px 50px rgba(30,58,95,0.10)', boxSizing: 'border-box',
      }}>
        <p style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '4px', color: '#bbb', textTransform: 'uppercase', margin: '0 0 20px' }}>
          Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
        </p>
        {icon && (
          <div style={{
            width: '64px', height: '64px', borderRadius: '18px', background: '#f0f4f8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px', fontSize: '28px',
          }}>
            {icon}
          </div>
        )}
        {title && (
          <h1 style={{ fontSize: '21px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 10px' }}>{title}</h1>
        )}
        <p style={{ fontSize: '14px', color: '#6b7684', margin: 0, lineHeight: 1.6 }}>{text}</p>
        {note && (
          <p style={{ fontSize: '12.5px', color: '#a8b1bd', margin: '16px 0 0', fontStyle: 'italic' }}>{note}</p>
        )}
        {showRetry && (
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '22px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 24px', fontWeight: '700', cursor: 'pointer' }}
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

// Wraps every /c/:slug/... page
export function ClinicLayout() {
  const { slug } = useParams();
  const [state, setState] = useState({ status: 'loading', clinic: null, name: '' });

  // Fetches the clinic's current info. Always asks the server for a fresh answer.
  const loadClinic = useCallback(async (signal) => {
    try {
      const res = await fetch(`${SERVER}/api/c/${encodeURIComponent(slug)}/info`, {
        cache: 'no-store',
        signal,
      });

      if (res.status === 404) {
        return setState({ status: 'notFound', clinic: null, name: '' });
      }
      if (res.status === 410) {
        const body = await res.json().catch(() => ({}));
        return setState({ status: 'inactive', clinic: null, name: body.name || '' });
      }
      if (!res.ok) throw new Error('Server error');

      const info = await res.json();
      setState({ status: 'ready', clinic: info, name: info.name });
    } catch (err) {
      if (err.name === 'AbortError') return;
      // If a background re-check fails, keep showing the page we already have
      setState(prev => (prev.status === 'ready' ? prev : { status: 'error', clinic: null, name: '' }));
    }
  }, [slug]);

  // First load (and whenever the link changes)
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading', clinic: null, name: '' });
    loadClinic(controller.signal);
    return () => controller.abort();
  }, [loadClinic]);

  // While the clinic is turned off, check back every 30 seconds
  useEffect(() => {
    if (state.status !== 'inactive') return;
    const controller = new AbortController();
    const timer = setInterval(() => loadClinic(controller.signal), INACTIVE_RECHECK_MS);
    return () => {
      clearInterval(timer);
      controller.abort();
    };
  }, [state.status, loadClinic]);

  // While active, refresh instantly when the owner changes the clinic
  const readySlug = state.status === 'ready' ? state.clinic.slug : null;
  useEffect(() => {
    if (!readySlug) return;
    const socket = getClinicSocket(readySlug);
    const onClinicUpdated = () => loadClinic();
    socket.on('clinic-updated', onClinicUpdated);
    return () => socket.off('clinic-updated', onClinicUpdated);
  }, [readySlug, loadClinic]);

  if (state.status === 'loading') {
    return <CenteredMessage text="Connecting to the clinic… The first load can take up to a minute." />;
  }

  if (state.status === 'notFound') {
    return (
      <CenteredMessage
        icon="🔍"
        title="Clinic not found"
        text="We couldn't find a clinic at this link. Please check the link, or scan the clinic's QR code again."
      />
    );
  }

  if (state.status === 'inactive') {
    return (
      <CenteredMessage
        icon="🏥"
        title="Online queue unavailable"
        text={`${state.name || 'This clinic'} is no longer accepting online tokens through ClinicQ. For appointments and waiting times, please contact the clinic directly.`}
        note="We apologise for any inconvenience."
      />
    );
  }

  if (state.status === 'error') {
    return (
      <CenteredMessage
        icon="📶"
        title="Could not reach ClinicQ"
        text="Please check your internet connection and try again."
        showRetry
      />
    );
  }

  const clinic = state.clinic;
  const value = {
    slug: clinic.slug,
    clinic,
    api: `${SERVER}/api/c/${clinic.slug}`,
    socket: getClinicSocket(clinic.slug),
  };

  return (
    <ClinicContext.Provider value={value}>
      <Outlet />
    </ClinicContext.Provider>
  );
}

export function useClinic() {
  return useContext(ClinicContext);
}