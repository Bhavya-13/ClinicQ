import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ClinicLayout } from './clinic';
import Home from './pages/Home.jsx';
import Register from './pages/Register.jsx';
import Token from './pages/Token.jsx';
import Admin from './pages/Admin.jsx';
import DisplayBoard from './pages/DisplayBoard.jsx';
import Owner from './pages/Owner.jsx';

// Old staff/token links (before multi-clinic) belong to the demo clinic
const LEGACY_CLINIC = 'demo';

function LegacyTokenRedirect() {
  const { accessToken } = useParams();
  return <Navigate to={`/c/${LEGACY_CLINIC}/token/${accessToken}`} replace />;
}

function NotFound() {
  return (
    <div style={{ minHeight: '100vh', background: '#f0f4f8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', boxSizing: 'border-box', fontFamily: "'Segoe UI',sans-serif", textAlign: 'center' }}>
      <div>
        <p style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '4px', color: '#bbb', textTransform: 'uppercase', margin: '0 0 18px' }}>
          Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 8px' }}>Page not found</h1>
        <p style={{ fontSize: '14px', color: '#8a94a3', margin: '0 0 20px' }}>Search for your clinic, or scan its QR code again.</p>
        <a href="/" style={{ background: '#1e3a5f', color: 'white', borderRadius: '12px', padding: '12px 24px', fontWeight: '700', textDecoration: 'none' }}>
          Find a clinic
        </a>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Homepage — patients search for their clinic */}
        <Route path="/" element={<Home />} />
        <Route path="/register" element={<Navigate to="/" replace />} />

        {/* Old staff / token links → demo clinic */}
        <Route path="/admin" element={<Navigate to={`/c/${LEGACY_CLINIC}/admin`} replace />} />
        <Route path="/display" element={<Navigate to={`/c/${LEGACY_CLINIC}/display`} replace />} />
        <Route path="/token/:accessToken" element={<LegacyTokenRedirect />} />

        {/* Per-clinic pages */}
        <Route path="/c/:slug" element={<ClinicLayout />}>
          <Route index element={<Navigate to="register" replace />} />
          <Route path="register" element={<Register />} />
          <Route path="token/:accessToken" element={<Token />} />
          <Route path="admin" element={<Admin />} />
          <Route path="display" element={<DisplayBoard />} />
        </Route>

        {/* Owner (you) */}
        <Route path="/owner" element={<Owner />} />

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}