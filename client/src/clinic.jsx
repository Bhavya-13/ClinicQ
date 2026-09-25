import { createContext, useContext, useEffect, useState } from 'react';
import { Outlet, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import SERVER from './config';

const ClinicContext = createContext(null);

// One live connection per clinic, reused across pages
const sockets = new Map();
function getClinicSocket(slug) {
  if (!sockets.has(slug)) {
    sockets.set(slug, io(SERVER, { query: { clinic: slug } }));
  }
  return sockets.get(slug);
}

function CenteredMessage({ title, text, showRetry }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '24px', boxSizing: 'border-box',
      fontFamily: "'Segoe UI',sans-serif", textAlign: 'center',
    }}>
      <div style={{ maxWidth: '360px' }}>
        <p style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '4px', color: '#bbb', textTransform: 'uppercase', margin: '0 0 18px' }}>
          Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
        </p>
        {title && <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 8px' }}>{title}</h1>}
        <p style={{ fontSize: '14px', color: '#8a94a3', margin: 0, lineHeight: 1.5 }}>{text}</p>
        {showRetry && (
          <button
            onClick={() => window.location.reload()}
            style={{ marginTop: '20px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: '12px', padding: '12px 24px', fontWeight: '700', cursor: 'pointer' }}
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
  const [state, setState] = useState({ status: 'loading', clinic: null });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading', clinic: null });

    fetch(`${SERVER}/api/c/${encodeURIComponent(slug)}/info`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setState({ status: 'notFound', clinic: null });
        if (!res.ok) throw new Error('Server error');
        const info = await res.json();
        if (!cancelled) setState({ status: 'ready', clinic: info });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'error', clinic: null });
      });

    return () => { cancelled = true; };
  }, [slug]);

  if (state.status === 'loading') {
    return <CenteredMessage text="Connecting to the clinic… The first load can take up to a minute." />;
  }
  if (state.status === 'notFound') {
    return <CenteredMessage title="Clinic not found" text="Please check the link, or scan the clinic's QR code again." />;
  }
  if (state.status === 'error') {
    return <CenteredMessage title="Could not reach ClinicQ" text="Please check your internet connection and try again." showRetry />;
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