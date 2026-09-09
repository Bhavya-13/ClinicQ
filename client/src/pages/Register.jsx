import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import SERVER from '../config';

export default function Register() {
  const [numPatients, setNumPatients] = useState(1);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleNumChange = (val) => {
    const n = Math.max(1, Math.min(10, parseInt(val) || 1));
    setNumPatients(n);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Please enter your name.'); return; }
    setLoading(true);
    try {
      const res = await fetch(`${SERVER}/api/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: [name.trim()], numPatients }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate(`/token/${data.patient.id}`, { state: { existing: data.existing } });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#1e3a5f 0%,#2d6a9f 50%,#1e3a5f 100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px', fontFamily: "'Segoe UI',sans-serif" }}>

      <div style={{ marginBottom: '24px', textAlign: 'center' }}>
        <span style={{ fontSize: '15px', fontWeight: '800', letterSpacing: '3px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>
          Clinic<span style={{ color: 'rgba(116,185,255,0.5)' }}>Q</span>
        </span>
      </div>

      <div style={{ background: 'white', borderRadius: '24px', padding: '40px', width: '100%', maxWidth: '420px', boxShadow: '0 25px 60px rgba(0,0,0,0.3)' }}>

        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '72px', height: '72px', background: 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', borderRadius: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '32px' }}>
            🏥
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: '#1a1a2e', margin: '0 0 4px' }}>Join the Queue</h1>
          <p style={{ color: '#aaa', fontSize: '13px', margin: 0 }}>Enter your details to get a token</p>
        </div>

        <form onSubmit={handleSubmit}>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Your Name
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Enter your full name"
              required
              style={{ width: '100%', border: '2px solid #e8e8e8', borderRadius: '12px', padding: '14px 16px', fontSize: '15px', color: '#1a1a2e', outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s' }}
              onFocus={e => e.target.style.borderColor = '#2d6a9f'}
              onBlur={e => e.target.style.borderColor = '#e8e8e8'}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: '700', color: '#555', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Number of People
            </label>
            <p style={{ fontSize: '12px', color: '#bbb', marginBottom: '12px' }}>Include yourself and anyone with you</p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f7f9fc', borderRadius: '16px', padding: '8px' }}>
              <button type="button" onClick={() => handleNumChange(numPatients - 1)}
                style={{ width: '52px', height: '52px', borderRadius: '12px', border: 'none', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '24px', fontWeight: '700', color: '#2d6a9f', cursor: 'pointer' }}>
                −
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '42px', fontWeight: '900', color: '#1e3a5f', lineHeight: 1 }}>{numPatients}</div>
                <div style={{ fontSize: '12px', color: '#bbb', marginTop: '2px' }}>{numPatients === 1 ? 'person' : 'people'}</div>
              </div>
              <button type="button" onClick={() => handleNumChange(numPatients + 1)}
                style={{ width: '52px', height: '52px', borderRadius: '12px', border: 'none', background: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', fontSize: '24px', fontWeight: '700', color: '#2d6a9f', cursor: 'pointer' }}>
                +
              </button>
            </div>
          </div>

          {name.trim() && (
            <div style={{ background: '#f0f7ff', border: '1.5px solid #cce0f5', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#2d6a9f' }}>
                Registering <strong>{name.trim()}</strong>
                {numPatients > 1 && <span> + {numPatients - 1} other{numPatients > 2 ? 's' : ''}</span>}
              </p>
            </div>
          )}

          {error && (
            <div style={{ background: '#fff0f0', border: '1.5px solid #ffcccc', borderRadius: '12px', padding: '12px 16px', marginBottom: '20px' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#cc0000' }}>{error}</p>
            </div>
          )}

          <button type="submit" disabled={loading}
            style={{ width: '100%', background: loading ? '#aaa' : 'linear-gradient(135deg,#1e3a5f,#2d6a9f)', color: 'white', border: 'none', borderRadius: '14px', padding: '16px', fontSize: '16px', fontWeight: '700', cursor: loading ? 'not-allowed' : 'pointer', boxShadow: '0 8px 24px rgba(30,58,95,0.35)', letterSpacing: '0.3px' }}>
            {loading ? 'Registering...' : 'Get My Token →'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#ddd', marginTop: '24px', marginBottom: 0, letterSpacing: '2px', fontWeight: '700' }}>
          CLINIC<span style={{ color: '#2d6a9f' }}>Q</span>
        </p>
      </div>
    </div>
  );
}