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
      navigate(`/token/${data.patient.access_token}`, { state: { existing: data.existing } });
    } catch (err) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f0f4f8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: "'Segoe UI',sans-serif",
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* Subtle decorative background accents */}
      <div style={{
        position: 'absolute', top: '-120px', right: '-120px',
        width: '320px', height: '320px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(45,106,159,0.08) 0%, transparent 70%)',
      }} />
      <div style={{
        position: 'absolute', bottom: '-140px', left: '-140px',
        width: '360px', height: '360px', borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(30,58,95,0.06) 0%, transparent 70%)',
      }} />

      {/* Top brand mark */}
      <div style={{ marginBottom: '28px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <span style={{ fontSize: '13px', fontWeight: '800', letterSpacing: '4px', textTransform: 'uppercase', color: '#bbb' }}>
          Clinic<span style={{ color: '#2d6a9f' }}>Q</span>
        </span>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '28px',
        padding: '44px 36px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 20px 50px rgba(30,58,95,0.12), 0 2px 8px rgba(30,58,95,0.06)',
        position: 'relative',
        zIndex: 1,
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '76px', height: '76px',
            background: 'linear-gradient(150deg,#1e3a5f 0%,#2d6a9f 100%)',
            borderRadius: '22px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 18px',
            fontSize: '34px',
            boxShadow: '0 10px 24px rgba(30,58,95,0.28)',
          }}>
            🏥
          </div>
          <h1 style={{ fontSize: '25px', fontWeight: '800', color: '#1a1a2e', margin: '0 0 6px', letterSpacing: '-0.3px' }}>
            Join the Queue
          </h1>
          <p style={{ color: '#9aa5b1', fontSize: '13.5px', margin: 0 }}>
            Get your token in seconds — no app needed
          </p>
        </div>

        <form onSubmit={handleSubmit}>

          {/* Name field */}
          <div style={{ marginBottom: '22px' }}>
            <label style={{
              display: 'block', fontSize: '11.5px', fontWeight: '700', color: '#5a6472',
              marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px',
            }}>
              Your Name
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Priya Sharma"
                required
                style={{
                  width: '100%',
                  border: '2px solid #eef1f5',
                  background: '#fbfcfe',
                  borderRadius: '14px',
                  padding: '15px 16px',
                  fontSize: '15.5px',
                  color: '#1a1a2e',
                  outline: 'none',
                  boxSizing: 'border-box',
                  transition: 'border-color 0.2s, background 0.2s',
                }}
                onFocus={e => { e.target.style.borderColor = '#2d6a9f'; e.target.style.background = '#ffffff'; }}
                onBlur={e => { e.target.style.borderColor = '#eef1f5'; e.target.style.background = '#fbfcfe'; }}
              />
            </div>
          </div>

          {/* People stepper */}
          <div style={{ marginBottom: '26px' }}>
            <label style={{
              display: 'block', fontSize: '11.5px', fontWeight: '700', color: '#5a6472',
              marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '1px',
            }}>
              Number of People
            </label>
            <p style={{ fontSize: '12.5px', color: '#a8b1bd', marginBottom: '14px', marginTop: '2px' }}>
              Include yourself and anyone with you
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'linear-gradient(150deg,#f7f9fc,#f0f4f8)',
              borderRadius: '18px', padding: '10px',
              border: '1px solid #eef1f5',
            }}>
              <button type="button" onClick={() => handleNumChange(numPatients - 1)}
                style={{
                  width: '54px', height: '54px', borderRadius: '14px', border: 'none',
                  background: 'white', boxShadow: '0 3px 10px rgba(30,58,95,0.1)',
                  fontSize: '24px', fontWeight: '700', color: '#2d6a9f', cursor: 'pointer',
                  transition: 'transform 0.15s',
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                −
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '44px', fontWeight: '900', color: '#1e3a5f', lineHeight: 1 }}>
                  {numPatients}
                </div>
                <div style={{ fontSize: '12px', color: '#a8b1bd', marginTop: '3px', fontWeight: '600' }}>
                  {numPatients === 1 ? 'person' : 'people'}
                </div>
              </div>
              <button type="button" onClick={() => handleNumChange(numPatients + 1)}
                style={{
                  width: '54px', height: '54px', borderRadius: '14px', border: 'none',
                  background: 'white', boxShadow: '0 3px 10px rgba(30,58,95,0.1)',
                  fontSize: '24px', fontWeight: '700', color: '#2d6a9f', cursor: 'pointer',
                  transition: 'transform 0.15s',
                }}
                onMouseDown={e => e.currentTarget.style.transform = 'scale(0.94)'}
                onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
              >
                +
              </button>
            </div>
          </div>

          {/* Live summary chip */}
          {name.trim() && (
            <div style={{
              background: 'linear-gradient(135deg,#f0f7ff,#e8f2ff)',
              border: '1.5px solid #d3e6f7',
              borderRadius: '14px',
              padding: '14px 18px',
              marginBottom: '20px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}>
              <span style={{ fontSize: '18px' }}>👤</span>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#2d6a9f', lineHeight: 1.4 }}>
                Registering <strong>{name.trim()}</strong>
                {numPatients > 1 && <span> + {numPatients - 1} other{numPatients > 2 ? 's' : ''}</span>}
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{
              background: '#fff0f0', border: '1.5px solid #ffcccc', borderRadius: '14px',
              padding: '13px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px',
            }}>
              <span style={{ fontSize: '16px' }}>⚠️</span>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#cc0000' }}>{error}</p>
            </div>
          )}

          {/* Submit */}
          <button type="submit" disabled={loading}
            style={{
              width: '100%',
              background: loading ? '#c3c9d1' : 'linear-gradient(135deg,#1e3a5f,#2d6a9f)',
              color: 'white',
              border: 'none',
              borderRadius: '16px',
              padding: '17px',
              fontSize: '16px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: loading ? 'none' : '0 10px 28px rgba(30,58,95,0.32)',
              letterSpacing: '0.3px',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
            onMouseDown={e => { if (!loading) e.currentTarget.style.transform = 'scale(0.98)'; }}
            onMouseUp={e => { if (!loading) e.currentTarget.style.transform = 'scale(1)'; }}
          >
            {loading ? 'Registering...' : 'Get My Token →'}
          </button>
        </form>

        {/* Footer trust line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '26px' }}>
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#c3e9d8' }} />
          <p style={{ fontSize: '11.5px', color: '#c3cbd4', margin: 0, letterSpacing: '0.3px' }}>
            No login required · Track your position live
          </p>
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: '#e2e6eb', marginTop: '18px', marginBottom: 0, letterSpacing: '2px', fontWeight: '700' }}>
          CLINIC<span style={{ color: '#2d6a9f' }}>Q</span>
        </p>
      </div>
    </div>
  );
}