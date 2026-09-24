const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const { Server } = require('socket.io');
const cors = require('cors');
const QRCode = require('qrcode');
const db = require('./db');

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

// ── Required secrets — refuse to start without them ────────
const ADMIN_PIN = process.env.ADMIN_PIN;
const SESSION_SECRET = process.env.ADMIN_SESSION_SECRET;

if (!ADMIN_PIN || !SESSION_SECRET) {
  console.error('❌ ADMIN_PIN and ADMIN_SESSION_SECRET must be set in server/.env');
  process.exit(1);
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.set('trust proxy', 1); // correct client IPs when hosted behind a proxy (Render)
app.use(cors());
app.use(express.json());

const PORT = 3001;

// ── Admin authentication ───────────────────────────────────
const SESSION_HOURS = 12;
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 5;
const loginAttempts = new Map(); // ip -> { count, lockedUntil }

// Signature depends on the PIN too, so changing the PIN logs out all sessions
function sign(payload) {
  return crypto
    .createHmac('sha256', `${SESSION_SECRET}:${ADMIN_PIN}`)
    .update(payload)
    .digest('hex');
}

function createAdminToken() {
  const expiresAt = String(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  return `${expiresAt}.${sign(expiresAt)}`;
}

function verifyAdminToken(token) {
  if (typeof token !== 'string') return false;
  const [expiresAt, signature] = token.split('.');
  if (!expiresAt || !signature) return false;

  const given = Buffer.from(signature, 'hex');
  const expected = Buffer.from(sign(expiresAt), 'hex');
  if (given.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(given, expected)) return false;

  return Number(expiresAt) > Date.now();
}

// Constant-time PIN comparison (prevents timing attacks)
function pinMatches(input) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(String(ADMIN_PIN)).digest();
  return crypto.timingSafeEqual(a, b);
}

function requireAdmin(req, res, next) {
  if (!verifyAdminToken(req.headers['x-admin-token'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const ip = req.ip;
  const record = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };

  if (record.lockedUntil > Date.now()) {
    const minsLeft = Math.ceil((record.lockedUntil - Date.now()) / 60000);
    return res.status(429).json({
      success: false,
      error: `Too many wrong attempts. Try again in ${minsLeft} min.`,
    });
  }

  const { pin } = req.body || {};
  if (typeof pin === 'string' && pinMatches(pin)) {
    loginAttempts.delete(ip);
    return res.json({ success: true, token: createAdminToken() });
  }

  record.count += 1;
  if (record.count >= MAX_LOGIN_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCKOUT_MINUTES * 60 * 1000;
    record.count = 0;
  }
  loginAttempts.set(ip, record);

  res.status(401).json({ success: false, error: 'Incorrect PIN' });
});

// Lets the Admin page check whether its saved token is still valid
app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ valid: true });
});

async function broadcast() {
  io.emit('full-queue-updated', await db.getFullQueueDisplay());
  io.emit('skipped-list-updated', await db.getRecentlySkipped());
  io.emit('avg-updated', await db.getAvgMinutesPerPerson());
}

// ── QR Code ────────────────────────────────────────────────
app.get('/api/qrcode', async (req, res) => {
  try {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    const url = `${frontendUrl}/register`;
    const qrCode = await QRCode.toDataURL(url, { width: 300 });
    res.json({ qrCode, url });
  } catch (err) {
    console.error('❌ /api/qrcode error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ── Register ───────────────────────────────────────────────
app.post('/api/register', async (req, res) => {
  try {
    const isPaused = await db.getQueuePausedStatus();
    if (isPaused) {
      return res.status(403).json({ error: 'Registration is currently paused. Please check back shortly.' });
    }

    const { names, numPatients } = req.body;
    if (!names || !Array.isArray(names) || names.length === 0)
      return res.status(400).json({ error: 'Name is required' });
    if (!names[0] || names[0].trim() === '')
      return res.status(400).json({ error: 'Please enter your name' });
    const n = parseInt(numPatients);
    if (!n || n < 1)
      return res.status(400).json({ error: 'Invalid number of patients' });

    const existing = await db.findActivePatientByName(names[0].trim(), n);
    if (existing) {
      return res.json({ success: true, patient: existing, existing: true });
    }

    const patient = await db.registerPatient([names[0].trim()], n);
    await broadcast();
    res.json({ success: true, patient, existing: false });
  } catch (err) {
    console.error('❌ /api/register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Full queue ─────────────────────────────────────────────
app.get('/api/queue/full', async (req, res) => {
  try {
    res.json({
      queue: await db.getFullQueueDisplay(),
      skipped: await db.getRecentlySkipped(),
      avgMinsPerPerson: await db.getAvgMinutesPerPerson(),
    });
  } catch (err) {
    console.error('❌ /api/queue/full error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Single patient — looked up by unguessable access token ──
app.get('/api/patient/:accessToken', async (req, res) => {
  try {
    const patient = await db.getPatientByAccessToken(req.params.accessToken);
    if (!patient) return res.status(404).json({ error: 'Not found' });
    res.json(patient);
  } catch (err) {
    console.error('❌ /api/patient/:accessToken error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Check-in — by access token ──────────────────────────────
app.post('/api/checkin/:accessToken', async (req, res) => {
  try {
    const result = await db.confirmCheckin(req.params.accessToken);
    if (!result.success) return res.status(400).json(result);
    io.emit('checkin-confirmed', { patientId: result.patientId });
    await broadcast();
    res.json({ success: true });
  } catch (err) {
    console.error('❌ /api/checkin/:accessToken error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Rejoin — by access token ─────────────────────────────────
app.post('/api/rejoin/:accessToken', async (req, res) => {
  try {
    const patient = await db.rejoinQueue(req.params.accessToken);
    if (!patient) return res.status(400).json({ error: 'Cannot rejoin' });
    await broadcast();
    res.json({ success: true, patient });
  } catch (err) {
    console.error('❌ /api/rejoin/:accessToken error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Single action endpoint — Done & Call Next ───────────────
let skipTimer = null;

app.post('/api/admin/action', requireAdmin, async (req, res) => {
  try {
    if (skipTimer) clearTimeout(skipTimer);

    const currentQueue = await db.getFullQueueDisplay();
    const calledPatient = currentQueue.find(p => p.status === 'called');

    if (calledPatient) {
      await db.markDone(calledPatient.id);
    }

    const next = await db.callNext();
    await broadcast();

    if (next) {
      io.emit('patient-called', next);

      skipTimer = setTimeout(async () => {
        try {
          const wasSkipped = await db.skipIfExpired(next.id);
          if (wasSkipped) {
            io.emit('patient-skipped', { ...next, skip_reason: 'no_show' });
            io.emit('auto-skip-occurred', { ...next, skip_reason: 'no_show' });
            await broadcast();
          }
        } catch (err) {
          console.error('❌ skipTimer error:', err);
        }
      }, db.GRACE_PERIOD_SECONDS * 1000);

      return res.json({
        success: true,
        markedDone: calledPatient || null,
        called: next,
      });
    }

    if (calledPatient) {
      return res.json({
        success: true,
        markedDone: calledPatient,
        called: null,
        message: 'Queue is empty',
      });
    }

    return res.json({
      success: false,
      message: 'Queue is empty',
    });
  } catch (err) {
    console.error('❌ /api/admin/action error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Manual skip ────────────────────────────────────────────
app.post('/api/admin/skip', requireAdmin, async (req, res) => {
  try {
    if (skipTimer) clearTimeout(skipTimer);

    const currentQueue = await db.getFullQueueDisplay();
    const calledPatient = currentQueue.find(p => p.status === 'called');

    if (!calledPatient) {
      return res.json({ success: false, message: 'No patient is currently called' });
    }

    await db.forceSkip(calledPatient.id);
    io.emit('patient-skipped', { ...calledPatient, skip_reason: 'manual' });
    io.emit('auto-skip-occurred', { ...calledPatient, skip_reason: 'manual' });
    await broadcast();

    res.json({ success: true, skipped: calledPatient });
  } catch (err) {
    console.error('❌ /api/admin/skip error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Manual check-in ────────────────────────────────────────
app.post('/api/admin/checkin', requireAdmin, async (req, res) => {
  try {
    const currentQueue = await db.getFullQueueDisplay();
    const calledPatient = currentQueue.find(p => p.status === 'called');

    if (!calledPatient) {
      return res.json({ success: false, message: 'No patient is currently called' });
    }

    const result = await db.confirmCheckinById(calledPatient.id);
    if (!result.success) {
      return res.json({ success: false, message: result.reason });
    }

    io.emit('checkin-confirmed', { patientId: calledPatient.id });
    await broadcast();

    res.json({ success: true });
  } catch (err) {
    console.error('❌ /api/admin/checkin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Pause/Resume registrations ──────────────────────────────
app.post('/api/admin/pause', requireAdmin, async (req, res) => {
  try {
    const paused = req.body?.paused === true;
    await db.setQueuePausedStatus(paused);
    io.emit('queue-paused-updated', paused);
    res.json({ success: true, paused });
  } catch (err) {
    console.error('❌ /api/admin/pause error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/queue/paused', async (req, res) => {
  try {
    const isPaused = await db.getQueuePausedStatus();
    res.json({ paused: isPaused });
  } catch (err) {
    console.error('❌ /api/queue/paused error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Admin done ─────────────────────────────────────────────
app.post('/api/admin/done/:id', requireAdmin, async (req, res) => {
  try {
    await db.markDone(parseInt(req.params.id));
    await broadcast();
    res.json({ success: true });
  } catch (err) {
    console.error('❌ /api/admin/done/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Socket ─────────────────────────────────────────────────
io.on('connection', async (socket) => {
  console.log('Client connected:', socket.id);
  try {
    socket.emit('full-queue-updated', await db.getFullQueueDisplay());
    socket.emit('skipped-list-updated', await db.getRecentlySkipped());
    socket.emit('avg-updated', await db.getAvgMinutesPerPerson());
    socket.emit('queue-paused-updated', await db.getQueuePausedStatus());
  } catch (err) {
    console.error('❌ Error sending initial data to client:', err);
  }
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});