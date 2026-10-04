const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const QRCode = require('qrcode');
const db = require('./db');
const auth = require('./auth');
const schedule = require('./schedule');

process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

if (!process.env.ADMIN_SESSION_SECRET) {
  console.error('❌ ADMIN_SESSION_SECRET must be set in server/.env');
  process.exit(1);
}
if (!process.env.OWNER_SECRET) {
  console.warn('⚠️  OWNER_SECRET is not set — the owner routes are disabled.');
}

const app = express();
const server = http.createServer(app);

// Only our own frontend may call this backend
const FRONTEND_ORIGIN = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');

const io = new Server(server, { cors: { origin: FRONTEND_ORIGIN } });

app.set('trust proxy', 1); // correct client IPs behind Render's proxy
app.use(cors({
  origin(origin, callback) {
    callback(null, !origin || origin === FRONTEND_ORIGIN);
  },
}));
app.use(express.json());

// Queue data changes constantly — never let browsers or proxies reuse an old answer
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const PORT = process.env.PORT || 3001;

// Old links (/api/..., /register) belong to this clinic
const DEFAULT_CLINIC_SLUG = 'demo';
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PIN_PATTERN = /^\d{6,12}$/;

const clinicLoginLimiter = auth.createLoginLimiter();
const ownerLoginLimiter = auth.createLoginLimiter();

// Live updates go to one clinic's "room" only
const roomFor = (clinicId) => `clinic:${clinicId}`;

async function broadcast(clinic) {
  const [queue, skipped, avg] = await Promise.all([
    db.getFullQueueDisplay(clinic),
    db.getRecentlySkipped(clinic),
    db.getAvgMinutesPerPerson(clinic.id),
  ]);
  const room = io.to(roomFor(clinic.id));
  room.emit('full-queue-updated', queue);
  room.emit('skipped-list-updated', skipped);
  room.emit('avg-updated', avg);
}

// Adds "what is the clinic doing right now" to a clinic object for the owner page
function withSchedule(clinic) {
  if (!clinic) return clinic;
  return { ...clinic, schedule: schedule.publicStatus(schedule.getStatus(clinic.sessions)) };
}

// ── Clinic listing details (shown on the public homepage) ──
const LISTING_FIELDS = {
  doctorName: { column: 'doctor_name', label: 'Doctor name', max: 80 },
  specialty:  { column: 'specialty',   label: 'Specialty',   max: 60 },
  area:       { column: 'area',        label: 'Area',        max: 60 },
  city:       { column: 'city',        label: 'City',        max: 40 },
  address:    { column: 'address',     label: 'Address',     max: 200 },
  timings:    { column: 'timings',     label: 'Timings',     max: 120 },
};

// Reads optional listing fields from a request body. Empty text clears a field.
function readListingFields(body) {
  const fields = {};
  for (const [key, { column, label, max }] of Object.entries(LISTING_FIELDS)) {
    if (body[key] === undefined) continue;
    const value = String(body[key] ?? '').trim();
    if (value.length > max) return { error: `${label} is too long (max ${max} characters)` };
    fields[column] = value || null;
  }
  if (body.isListed !== undefined) fields.is_listed = body.isListed === true;
  return { fields };
}

// ── Owner routes (you) — must be registered before the old /api mount ──
const ownerRouter = express.Router();

function requireOwner(req, res, next) {
  if (!process.env.OWNER_SECRET) {
    return res.status(503).json({ error: 'Owner access is not configured' });
  }
  if (!auth.verifyOwnerToken(req.headers['x-owner-token'])) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

ownerRouter.post('/login', (req, res) => {
  if (!process.env.OWNER_SECRET) {
    return res.status(503).json({ success: false, error: 'Owner access is not configured' });
  }
  const key = `owner:${req.ip}`;
  const minsLocked = ownerLoginLimiter.minutesLocked(key);
  if (minsLocked) {
    return res.status(429).json({ success: false, error: `Too many wrong attempts. Try again in ${minsLocked} min.` });
  }

  if (auth.ownerSecretMatches(req.body?.secret)) {
    ownerLoginLimiter.reset(key);
    return res.json({ success: true, token: auth.createOwnerToken() });
  }

  ownerLoginLimiter.fail(key);
  res.status(401).json({ success: false, error: 'Incorrect password' });
});

ownerRouter.get('/clinics', requireOwner, async (req, res) => {
  try {
    const clinics = await db.listClinics();
    res.json({ clinics: clinics.map(withSchedule) });
  } catch (err) {
    console.error('❌ GET /api/owner/clinics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

ownerRouter.post('/clinics', requireOwner, async (req, res) => {
  try {
    const body = req.body || {};
    const slug = String(body.slug || '').trim().toLowerCase();
    const name = String(body.name || '').trim();
    const pin = String(body.pin || '');
    const dayResetHour = body.dayResetHour === undefined ? 16 : Number(body.dayResetHour);

    if (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 40)
      return res.status(400).json({ error: 'Link name must be 3–40 lowercase letters, numbers or single hyphens (e.g. dr-sharma)' });
    if (!name || name.length > 80)
      return res.status(400).json({ error: 'Clinic name is required (max 80 characters)' });
    if (!PIN_PATTERN.test(pin))
      return res.status(400).json({ error: 'PIN must be 6–12 digits' });
    if (!Number.isInteger(dayResetHour) || dayResetHour < 0 || dayResetHour > 23)
      return res.status(400).json({ error: 'Reset hour must be a whole number from 0 to 23' });

    const listing = readListingFields(body);
    if (listing.error) return res.status(400).json({ error: listing.error });

    let sessionRows = [];
    if (body.sessions !== undefined) {
      const result = schedule.normalizeSessions(body.sessions);
      if (result.error) return res.status(400).json({ error: result.error });
      sessionRows = result.sessions;
    }

    const created = await db.createClinic({
      slug,
      name,
      pinHash: auth.hashPin(pin),
      dayResetHour,
      listing: listing.fields,
    });
    if (sessionRows.length > 0) await db.setSessions(created.id, sessionRows);

    const clinic = await db.getClinicForOwner(created.id);
    res.status(201).json({ clinic: withSchedule(clinic) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That link name is already taken' });
    console.error('❌ POST /api/owner/clinics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

ownerRouter.patch('/clinics/:id', requireOwner, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const updates = {};
    const body = req.body || {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (!name || name.length > 80)
        return res.status(400).json({ error: 'Clinic name is required (max 80 characters)' });
      updates.name = name;
    }
    if (body.pin !== undefined) {
      if (!PIN_PATTERN.test(String(body.pin)))
        return res.status(400).json({ error: 'PIN must be 6–12 digits' });
      updates.pin_hash = auth.hashPin(String(body.pin)); // also logs out that clinic's staff
    }
    if (body.dayResetHour !== undefined) {
      const hour = Number(body.dayResetHour);
      if (!Number.isInteger(hour) || hour < 0 || hour > 23)
        return res.status(400).json({ error: 'Reset hour must be a whole number from 0 to 23' });
      updates.day_reset_hour = hour;
    }
    if (body.isActive !== undefined) {
      updates.is_active = body.isActive === true;
    }

    const listing = readListingFields(body);
    if (listing.error) return res.status(400).json({ error: listing.error });
    Object.assign(updates, listing.fields);

    let sessionRows = null;
    if (body.sessions !== undefined) {
      const result = schedule.normalizeSessions(body.sessions);
      if (result.error) return res.status(400).json({ error: result.error });
      sessionRows = result.sessions;
    }

    if (Object.keys(updates).length === 0 && sessionRows === null) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const existing = await db.getClinicForOwner(id);
    if (!existing) return res.status(404).json({ error: 'Clinic not found' });

    if (Object.keys(updates).length > 0) await db.updateClinic(id, updates);
    if (sessionRows !== null) await db.setSessions(id, sessionRows);

    const clinic = await db.getClinicForOwner(id);

    // Let that clinic's open pages refresh their info (name, on/off, sessions)
    const visibleChange =
      updates.name !== undefined ||
      updates.is_active !== undefined ||
      updates.day_reset_hour !== undefined ||
      sessionRows !== null;
    if (visibleChange) {
      io.to(roomFor(id)).emit('clinic-updated');
      if (sessionRows !== null) {
        const full = await db.getClinicById(id);
        if (full) await broadcast(full);
      }
    }
    // Turned off: also cut its live connections
    if (updates.is_active === false) {
      io.in(roomFor(id)).disconnectSockets(true);
    }

    res.json({ clinic: withSchedule(clinic) });
  } catch (err) {
    console.error('❌ PATCH /api/owner/clinics/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.use('/api/owner', ownerRouter);

// ── Public clinic search (homepage) — only active clinics that chose to be listed ──
app.get('/api/public/clinics', async (req, res) => {
  try {
    const clinics = await db.listListedClinics();
    res.json({
      clinics: clinics.map(({ sessions, ...rest }) => ({
        ...rest,
        schedule: schedule.publicStatus(schedule.getStatus(sessions)),
      })),
    });
  } catch (err) {
    console.error('❌ GET /api/public/clinics error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Clinic routes — /api/c/<slug>/... (new) and /api/... (old links = demo) ──
const clinicRouter = express.Router({ mergeParams: true });

clinicRouter.use(async (req, res, next) => {
  try {
    const slug = String(req.params.slug || DEFAULT_CLINIC_SLUG).toLowerCase();
    const clinic = await db.getClinicBySlug(slug);
    if (!clinic) {
      return res.status(404).json({ error: 'Clinic not found' });
    }
    if (!clinic.is_active) {
      // 410 Gone: the clinic exists but has been turned off by the owner
      return res.status(410).json({
        error: 'This clinic is no longer accepting online tokens',
        inactive: true,
        name: clinic.name,
      });
    }
    req.clinic = clinic;
    req.schedule = schedule.getStatus(clinic.sessions); // is booking open right now?
    req.isLegacyRoute = !req.params.slug;
    next();
  } catch (err) {
    console.error('❌ Clinic lookup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

function requireClinicAdmin(req, res, next) {
  if (!auth.verifyClinicToken(req.headers['x-admin-token'], req.clinic)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Public clinic info (name, pause state and booking state for page headers)
clinicRouter.get('/info', (req, res) => {
  const c = req.clinic;
  res.json({
    slug: c.slug,
    name: c.name,
    isPaused: c.is_paused,
    dayResetHour: c.day_reset_hour,
    schedule: schedule.publicStatus(req.schedule),
  });
});

// ── Staff login ─────────────────────────────────────────────────────
clinicRouter.post('/admin/login', (req, res) => {
  const key = `${req.ip}:${req.clinic.id}`;
  const minsLocked = clinicLoginLimiter.minutesLocked(key);
  if (minsLocked) {
    return res.status(429).json({ success: false, error: `Too many wrong attempts. Try again in ${minsLocked} min.` });
  }

  const pin = req.body?.pin;
  if (typeof pin === 'string' && auth.verifyPin(pin, req.clinic.pin_hash)) {
    clinicLoginLimiter.reset(key);
    return res.json({ success: true, token: auth.createClinicToken(req.clinic) });
  }

  clinicLoginLimiter.fail(key);
  res.status(401).json({ success: false, error: 'Incorrect PIN' });
});

clinicRouter.get('/admin/verify', requireClinicAdmin, (req, res) => {
  res.json({ valid: true });
});

// ── QR code ─────────────────────────────────────────────────────────
clinicRouter.get('/qrcode', async (req, res) => {
  try {
    const frontendUrl = FRONTEND_ORIGIN;
    const url = req.isLegacyRoute
      ? `${frontendUrl}/register`
      : `${frontendUrl}/c/${req.clinic.slug}/register`;
    const qrCode = await QRCode.toDataURL(url, { width: 300 });
    res.json({ qrCode, url });
  } catch (err) {
    console.error('❌ qrcode error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ── Register ────────────────────────────────────────────────────────
clinicRouter.post('/register', async (req, res) => {
  try {
    if (req.clinic.is_paused) {
      return res.status(403).json({ error: 'Registration is currently paused. Please check back shortly.' });
    }
    if (!req.schedule.bookingOpen) {
      return res.status(403).json({
        error: req.schedule.message || 'Booking is closed right now.',
        bookingClosed: true,
      });
    }

    const { names, numPatients } = req.body || {};
    if (!names || !Array.isArray(names) || names.length === 0)
      return res.status(400).json({ error: 'Name is required' });
    const name = typeof names[0] === 'string' ? names[0].trim() : '';
    if (!name) return res.status(400).json({ error: 'Please enter your name' });
    if (name.length > 60) return res.status(400).json({ error: 'Name is too long' });
    const n = parseInt(numPatients);
    if (!n || n < 1 || n > 10)
      return res.status(400).json({ error: 'Invalid number of patients' });

    // 1. Accidental double-tap: the same person just registered — give back the same token
    const existing = await db.findActivePatientByName(req.clinic, name, n);
    if (existing) {
      return res.json({ success: true, patient: existing, existing: true, rejoined: false });
    }

    // 2. Skipped recently and registering again — treat it as a rejoin
    const recentlySkipped = await db.findRecentlySkippedByName(req.clinic, name, n);
    if (recentlySkipped) {
      const patient = await db.rejoinSkippedPatient(req.clinic, recentlySkipped);
      if (patient) {
        // The old token page (if still open) switches to "no longer active"
        io.to(roomFor(req.clinic.id)).emit('patient-replaced', { patientId: recentlySkipped.id });
        await broadcast(req.clinic);
        return res.json({ success: true, patient, existing: false, rejoined: true });
      }
    }

    // 3. Brand-new registration
    const patient = await db.registerPatient(req.clinic, [name], n);
    await broadcast(req.clinic);
    res.json({ success: true, patient, existing: false, rejoined: false });
  } catch (err) {
    if (err.code === 'NO_ACTIVE_SESSION') {
      return res.status(403).json({ error: req.schedule.message || 'Booking is closed right now.', bookingClosed: true });
    }
    console.error('❌ register error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Queue (public) ──────────────────────────────────────────────────
clinicRouter.get('/queue/full', async (req, res) => {
  try {
    const [queue, skipped, avgMinsPerPerson] = await Promise.all([
      db.getFullQueueDisplay(req.clinic),
      db.getRecentlySkipped(req.clinic),
      db.getAvgMinutesPerPerson(req.clinic.id),
    ]);
    res.json({ queue, skipped, avgMinsPerPerson });
  } catch (err) {
    console.error('❌ queue/full error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

clinicRouter.get('/queue/paused', (req, res) => {
  res.json({ paused: req.clinic.is_paused });
});

// ── Patient (by private link) ───────────────────────────────────────
clinicRouter.get('/patient/:accessToken', async (req, res) => {
  try {
    const patient = await db.getPatientByAccessToken(req.clinic.id, req.params.accessToken);
    if (!patient) return res.status(404).json({ error: 'Not found' });

    // Still waiting (or skipped) in a queue that is no longer the live one?
    // Then their session has ended and the token no longer counts.
    let queueEnded = false;
    if (['waiting', 'called', 'skipped'].includes(patient.status)) {
      const queue = await db.getTodayQueue(req.clinic);
      queueEnded = !queue || queue.id !== patient.queue_id;
    }

    res.json({ ...patient, queueEnded });
  } catch (err) {
    console.error('❌ patient error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

clinicRouter.post('/checkin/:accessToken', async (req, res) => {
  try {
    const result = await db.confirmCheckin(req.clinic.id, req.params.accessToken);
    if (!result.success) return res.status(400).json(result);
    io.to(roomFor(req.clinic.id)).emit('checkin-confirmed', { patientId: result.patientId });
    await broadcast(req.clinic);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ checkin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Patient cancels their own token — everyone behind them moves up
clinicRouter.post('/cancel/:accessToken', async (req, res) => {
  try {
    const result = await db.cancelPatientToken(req.clinic.id, req.params.accessToken);
    if (!result.success) return res.status(400).json(result);

    io.to(roomFor(req.clinic.id)).emit('patient-cancelled', result.patient);
    await broadcast(req.clinic);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ cancel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Skipped patient rejoins (end of queue), or a leftover patient joins the new session's queue
clinicRouter.post('/rejoin/:accessToken', async (req, res) => {
  try {
    if (req.clinic.is_paused) {
      return res.status(403).json({ error: 'Registration is currently paused. Please check back shortly.' });
    }
    if (!req.schedule.bookingOpen) {
      return res.status(403).json({ error: req.schedule.message || 'Booking is closed right now.', bookingClosed: true });
    }

    const patient = await db.rejoinQueue(req.clinic, req.params.accessToken);
    if (!patient) {
      return res.status(400).json({
        error: 'This token can no longer rejoin. If you registered again, please use your new token.',
      });
    }
    await broadcast(req.clinic);
    res.json({ success: true, patient });
  } catch (err) {
    console.error('❌ rejoin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Staff actions ───────────────────────────────────────────────────
clinicRouter.post('/admin/action', requireClinicAdmin, async (req, res) => {
  try {
    const clinic = req.clinic;
    const currentQueue = await db.getFullQueueDisplay(clinic);
    const calledPatient = currentQueue.find(p => p.status === 'called');

    if (calledPatient) {
      await db.markDone(clinic.id, calledPatient.id);
    }

    const next = await db.callNext(clinic);
    await broadcast(clinic);

    if (next) {
      io.to(roomFor(clinic.id)).emit('patient-called', next);
      return res.json({ success: true, markedDone: calledPatient || null, called: next });
    }

    if (calledPatient) {
      return res.json({ success: true, markedDone: calledPatient, called: null, message: 'Queue is empty' });
    }

    return res.json({ success: false, message: 'Queue is empty' });
  } catch (err) {
    console.error('❌ admin/action error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

clinicRouter.post('/admin/skip', requireClinicAdmin, async (req, res) => {
  try {
    const clinic = req.clinic;
    const currentQueue = await db.getFullQueueDisplay(clinic);
    const calledPatient = currentQueue.find(p => p.status === 'called');

    if (!calledPatient) {
      return res.json({ success: false, message: 'No patient is currently called' });
    }

    const skipped = await db.forceSkip(clinic.id, calledPatient.id);
    if (!skipped) {
      return res.json({ success: false, message: 'No patient is currently called' });
    }

    io.to(roomFor(clinic.id)).emit('patient-skipped', skipped);
    io.to(roomFor(clinic.id)).emit('auto-skip-occurred', skipped);
    await broadcast(clinic);

    res.json({ success: true, skipped });
  } catch (err) {
    console.error('❌ admin/skip error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

clinicRouter.post('/admin/checkin', requireClinicAdmin, async (req, res) => {
  try {
    const clinic = req.clinic;
    const currentQueue = await db.getFullQueueDisplay(clinic);
    const calledPatient = currentQueue.find(p => p.status === 'called');

    if (!calledPatient) {
      return res.json({ success: false, message: 'No patient is currently called' });
    }

    const result = await db.confirmCheckinById(clinic.id, calledPatient.id);
    if (!result.success) {
      return res.json({ success: false, message: result.reason });
    }

    io.to(roomFor(clinic.id)).emit('checkin-confirmed', { patientId: calledPatient.id });
    await broadcast(clinic);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ admin/checkin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Staff add a patient who has no phone. Works while paused and after booking closes,
// as long as a session is running. The patient goes to the end of the queue.
clinicRouter.post('/admin/walkin', requireClinicAdmin, async (req, res) => {
  try {
    const rawName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (rawName.length > 60) return res.status(400).json({ success: false, message: 'Name is too long' });

    const n = parseInt(req.body?.numPatients);
    if (!n || n < 1 || n > 10) {
      return res.status(400).json({ success: false, message: 'Number of people must be 1 to 10' });
    }

    const patient = await db.registerPatient(req.clinic, [rawName || 'Walk-in'], n);
    await broadcast(req.clinic);

    // Staff only need the number — the patient's private link is never returned here
    res.status(201).json({
      success: true,
      patient: { token_number: patient.token_number, names: patient.names, num_patients: patient.num_patients },
    });
  } catch (err) {
    if (err.code === 'NO_ACTIVE_SESSION') {
      return res.status(409).json({
        success: false,
        message: `No session is running, so a walk-in can't be added. ${req.schedule.message}`.trim(),
      });
    }
    console.error('❌ admin/walkin error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

clinicRouter.post('/admin/pause', requireClinicAdmin, async (req, res) => {
  try {
    const paused = req.body?.paused === true;
    await db.setQueuePausedStatus(req.clinic.id, paused);
    io.to(roomFor(req.clinic.id)).emit('queue-paused-updated', paused);
    res.json({ success: true, paused });
  } catch (err) {
    console.error('❌ admin/pause error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

clinicRouter.post('/admin/done/:id', requireClinicAdmin, async (req, res) => {
  try {
    await db.markDone(req.clinic.id, parseInt(req.params.id));
    await broadcast(req.clinic);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ admin/done error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.use('/api/c/:slug', clinicRouter);
app.use('/api', clinicRouter); // old links → demo clinic

// ── Auto-skip sweeper — survives restarts, covers every clinic ──
const SWEEP_INTERVAL_MS = 5000;
let sweeping = false;

setInterval(async () => {
  if (sweeping) return;
  sweeping = true;
  try {
    const skipped = await db.sweepExpiredCheckins();
    const affectedClinicIds = new Set();

    for (const patient of skipped) {
      io.to(roomFor(patient.clinic_id)).emit('patient-skipped', patient);
      io.to(roomFor(patient.clinic_id)).emit('auto-skip-occurred', patient);
      affectedClinicIds.add(patient.clinic_id);
    }

    for (const clinicId of affectedClinicIds) {
      const clinic = await db.getClinicById(clinicId);
      if (clinic) await broadcast(clinic);
    }
  } catch (err) {
    console.error('❌ Auto-skip sweep error:', err);
  } finally {
    sweeping = false;
  }
}, SWEEP_INTERVAL_MS);

// ── Session watcher — tells open pages when a session starts, or booking opens/closes ──
const SCHEDULE_CHECK_MS = 15000;
const lastScheduleKey = new Map(); // clinic id → what it looked like last check
let checkingSchedules = false;

setInterval(async () => {
  if (checkingSchedules) return;
  checkingSchedules = true;
  try {
    const clinics = await db.listActiveClinics();
    const seen = new Set();

    for (const clinic of clinics) {
      seen.add(clinic.id);
      const status = schedule.getStatus(clinic.sessions);
      const key = `${status.key}|${status.bookingOpen ? 'open' : 'closed'}`;
      const previous = lastScheduleKey.get(clinic.id);
      lastScheduleKey.set(clinic.id, key);

      // First time we see a clinic we only remember it; later changes are announced
      if (previous !== undefined && previous !== key) {
        io.to(roomFor(clinic.id)).emit('clinic-updated');
        await broadcast(clinic);
      }
    }

    for (const id of lastScheduleKey.keys()) {
      if (!seen.has(id)) lastScheduleKey.delete(id);
    }
  } catch (err) {
    console.error('❌ Schedule check error:', err);
  } finally {
    checkingSchedules = false;
  }
}, SCHEDULE_CHECK_MS);

// ── Sockets — each connection joins its clinic's room ──────
io.on('connection', async (socket) => {
  try {
    const slug = String(socket.handshake.query?.clinic || DEFAULT_CLINIC_SLUG).toLowerCase();
    const clinic = await db.getClinicBySlug(slug);
    if (!clinic || !clinic.is_active) {
      socket.disconnect(true);
      return;
    }

    socket.join(roomFor(clinic.id));

    const [queue, skipped, avg] = await Promise.all([
      db.getFullQueueDisplay(clinic),
      db.getRecentlySkipped(clinic),
      db.getAvgMinutesPerPerson(clinic.id),
    ]);
    socket.emit('full-queue-updated', queue);
    socket.emit('skipped-list-updated', skipped);
    socket.emit('avg-updated', avg);
    socket.emit('queue-paused-updated', clinic.is_paused);
  } catch (err) {
    console.error('❌ Error sending initial data to client:', err);
  }
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});