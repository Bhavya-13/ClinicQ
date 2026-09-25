import { useEffect, useState } from 'react';
import SERVER from '../config';

const TOKEN_KEY = 'cq_owner_token';
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PIN_PATTERN = /^\d{6,12}$/;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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

function formatHour(h) {
  const suffix = h < 12 ? 'AM' : 'PM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:00 ${suffix}`;
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

function CreateClinicForm({ ownerFetch, onCreated }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [hour, setHour] = useState(16);
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

    setSaving(true);
    try {
      const res = await ownerFetch('/clinics', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), slug, pin, dayResetHour: Number(hour), ...listing }),
      });
      if (!res) return;
      const data = await res.json();
      if (!res.ok) return setError(data.error || 'Could not create the clinic.');

      onCreated(data.clinic);
      setName(''); setSlug(''); setSlugTouched(false);
      setPin(''); setPinConfirm(''); setHour(16);
      setListing(EMPTY_LISTING);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} style={S.card}>
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
        <div>
          <label style={S.label}>Token numbers reset at</label>
          <select style={S.input} value={hour} onChange={e => setHour(Number(e.target.value))}>
            {HOURS.map(h => <option key={h} value={h}>{formatHour(h)} (IST)</option>)}
          </select>
          <p style={S.hint}>Pick a time when the clinic is closed.</p>
        </div>
      </div>

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

  const startEditing = () => {
    setName(clinic.name);
    setHour(clinic.day_reset_hour);
    setNewPin('');
    setIsActive(clinic.is_active);
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

    const updates = {};
    if (name.trim() !== clinic.name) updates.name = name.trim();
    if (Number(hour) !== clinic.day_reset_hour) updates.dayResetHour = Number(hour);
    if (isActive !== clinic.is_active) updates.isActive = isActive;
    if (newPin) {
      if (!PIN_PATTERN.test(newPin)) return setError('New PIN must be 6–12 digits.');
      updates.pin = newPin;
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
    <div style={{ ...S.card, opacity: clinic.is_active ? 1 : 0.7 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: '18px', fontWeight: '800', color: '#1e3a5f', margin: '0 0 4px' }}>{clinic.name}</h3>
          {doctorLine && <p style={{ fontSize: '13.5px', color: '#2d6a9f', fontWeight: '600', margin: '0 0 2px' }}>{doctorLine}</p>}
          {placeLine && <p style={{ fontSize: '13px', color: '#6b7684', margin: '0 0 2px' }}>📍 {placeLine}</p>}
          <p style={{ fontSize: '13px', color: '#8a94a3', margin: 0 }}>
            /c/{clinic.slug} · resets at {formatHour(clinic.day_reset_hour)}
            {clinic.is_paused && ' · registrations paused'}
          </p>
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
            <div>
              <label style={S.label}>Token numbers reset at</label>
              <select style={S.input} value={hour} onChange={e => setHour(Number(e.target.value))}>
                {HOURS.map(h => <option key={h} value={h}>{formatHour(h)} (IST)</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>New staff PIN (optional)</label>
              <input style={S.input} type="password" inputMode="numeric" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="Leave blank to keep" />
              <p style={S.hint}>Changing it logs out this clinic's staff.</p>
            </div>
          </div>

          <ListingFields values={listing} onChange={setListing} />

          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: '#444', marginBottom: '14px', cursor: 'pointer' }}>
            <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
            Clinic is active (unticking turns off all its links and hides it from search)
          </label>

          {error && <p style={S.error}>{error}</p>}

          <div style={{ display: 'flex', gap: '10px' }}>
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
      <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={handleLogin} style={{ ...S.card, width: '100%', maxWidth: '360px', textAlign: 'center', marginBottom: 0 }}>
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
    <div style={S.page}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '3px', color: '#bbb', textTransform: 'uppercase', margin: '0 0 4px' }}>
              Clinic<span style={{ color: '#2d6a9f' }}>Q</span> · Owner
            </p>
            <h1 style={{ fontSize: '26px', fontWeight: '900', color: '#1e3a5f', margin: 0 }}>Clinics</h1>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <a href="/" target="_blank" rel="noreferrer" style={{ ...S.secondary, textDecoration: 'none' }}>View homepage ↗</a>
            <button style={S.secondary} onClick={() => logout()}>🔒 Log out</button>
          </div>
        </div>

        {notice && (
          <div style={{ background: '#f0f7ff', border: '1.5px solid #cce0f5', borderRadius: '14px', padding: '14px 18px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
            <p style={{ margin: 0, color: '#2d6a9f', fontWeight: '600', fontSize: '14px' }}>{notice}</p>
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