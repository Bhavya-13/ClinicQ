const crypto = require('crypto');

const SESSION_HOURS = 12;

// ── PIN hashing (scrypt) ───────────────────────────────────
// Stored format: scrypt:<salt>:<hash>
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

function verifyPin(pin, stored) {
  if (typeof pin !== 'string' || typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  if (expected.length === 0) return false;
  const actual = crypto.scryptSync(pin, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ── Signed session tokens ──────────────────────────────────
function sign(key, payload) {
  return crypto.createHmac('sha256', key).update(payload).digest('hex');
}

function hexEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === 32 && y.length === 32 && crypto.timingSafeEqual(x, y);
}

function expiry() {
  return String(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
}

// Clinic staff session. The key includes the clinic's PIN hash,
// so changing a clinic's PIN logs out all of that clinic's sessions.
function clinicKey(clinic) {
  return `${process.env.ADMIN_SESSION_SECRET}:clinic:${clinic.pin_hash}`;
}

function createClinicToken(clinic) {
  const payload = `${clinic.id}.${expiry()}`;
  return `${payload}.${sign(clinicKey(clinic), payload)}`;
}

function verifyClinicToken(token, clinic) {
  if (typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  const [clinicId, expiresAt, signature] = parts;

  if (Number(clinicId) !== clinic.id) return false; // token for a different clinic
  if (!(Number(expiresAt) > Date.now())) return false;
  return hexEqual(signature, sign(clinicKey(clinic), `${clinicId}.${expiresAt}`));
}

// Owner session (you). Changing OWNER_SECRET logs out owner sessions.
function ownerKey() {
  return `${process.env.ADMIN_SESSION_SECRET}:owner:${process.env.OWNER_SECRET}`;
}

function ownerSecretMatches(input) {
  const expected = process.env.OWNER_SECRET;
  if (!expected || typeof input !== 'string') return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function createOwnerToken() {
  const payload = `owner.${expiry()}`;
  return `${payload}.${sign(ownerKey(), payload)}`;
}

function verifyOwnerToken(token) {
  if (!process.env.OWNER_SECRET || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'owner') return false;
  const [, expiresAt, signature] = parts;

  if (!(Number(expiresAt) > Date.now())) return false;
  return hexEqual(signature, sign(ownerKey(), `owner.${expiresAt}`));
}

// ── Wrong-password lockout ─────────────────────────────────
function createLoginLimiter({ maxAttempts = 5, lockoutMinutes = 5 } = {}) {
  const attempts = new Map(); // key -> { count, lockedUntil }

  return {
    minutesLocked(key) {
      const record = attempts.get(key);
      if (record && record.lockedUntil > Date.now()) {
        return Math.ceil((record.lockedUntil - Date.now()) / 60000);
      }
      return 0;
    },
    fail(key) {
      const record = attempts.get(key) || { count: 0, lockedUntil: 0 };
      record.count += 1;
      if (record.count >= maxAttempts) {
        record.lockedUntil = Date.now() + lockoutMinutes * 60 * 1000;
        record.count = 0;
      }
      attempts.set(key, record);
    },
    reset(key) {
      attempts.delete(key);
    },
  };
}

module.exports = {
  hashPin,
  verifyPin,
  createClinicToken,
  verifyClinicToken,
  ownerSecretMatches,
  createOwnerToken,
  verifyOwnerToken,
  createLoginLimiter,
};