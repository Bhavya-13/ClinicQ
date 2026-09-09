require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const QRCode = require('qrcode');
const db = require('./db');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const PORT = 3001;

// ── Simple admin PIN gate ─────────────────────────────────
// TODO: replace with real staff accounts when multi-clinic auth is built
const ADMIN_PIN = process.env.ADMIN_PIN || '0000'; // change this!

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token !== 'admin-session') {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_PIN) {
    return res.json({ success: true, token: 'admin-session' }); // placeholder token
  }
  res.status(401).json({ success: false, error: 'Incorrect PIN' });
});

function broadcast() {
  io.emit('full-queue-updated', db.getFullQueueDisplay());
  io.emit('skipped-list-updated', db.getRecentlySkipped());
  io.emit('avg-updated', db.getAvgMinutesPerPerson());
}

// ── QR Code — auto detects IP from request ────────────────────────
app.get('/api/qrcode', async (req, res) => {
  try {
    // req.headers.host gives us the actual host:port the request came from
    // e.g. "192.168.1.11:3001" or "localhost:3001"
    const host = req.headers.host.replace(':3001', ':5173');
    const url = `http://${host}/register`;
    const qrCode = await QRCode.toDataURL(url, { width: 300 });
    res.json({ qrCode, url });
  } catch {
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

// ── Register ───────────────────────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { names, numPatients } = req.body;
  if (!names || !Array.isArray(names) || names.length === 0)
    return res.status(400).json({ error: 'Name is required' });
  if (!names[0] || names[0].trim() === '')
    return res.status(400).json({ error: 'Please enter your name' });
  const n = parseInt(numPatients);
  if (!n || n < 1)
    return res.status(400).json({ error: 'Invalid number of patients' });

  // Check for an existing active token under the same name today
  const existing = db.findActivePatientByName(names[0].trim(),n);
  if (existing) {
    return res.json({ success: true, patient: existing, existing: true });
  }

  const patient = db.registerPatient([names[0].trim()], n);
  broadcast();
  res.json({ success: true, patient, existing: false });
});

// ── Full queue ───────────────────────────────────────────────────────
app.get('/api/queue/full', (req, res) => {
  res.json({
    queue: db.getFullQueueDisplay(),
    skipped: db.getRecentlySkipped(),
    avgMinsPerPerson: db.getAvgMinutesPerPerson(),
  });
});

// ── Single patient ───────────────────────────────────────────────────
app.get('/api/patient/:id', (req, res) => {
  const patient = db.getPatient(parseInt(req.params.id));
  if (!patient) return res.status(404).json({ error: 'Not found' });
  res.json(patient);
});

// ── Check-in ───────────────────────────────────────────────────────
app.post('/api/checkin/:id', (req, res) => {
  const result = db.confirmCheckin(parseInt(req.params.id));
  if (!result.success) return res.status(400).json(result);
  io.emit('checkin-confirmed', { patientId: parseInt(req.params.id) });
  broadcast();
  res.json({ success: true });
});

// ── Rejoin ───────────────────────────────────────────────────────
app.post('/api/rejoin/:id', (req, res) => {
  const patient = db.rejoinQueue(parseInt(req.params.id));
  if (!patient) return res.status(400).json({ error: 'Cannot rejoin' });
  broadcast();
  res.json({ success: true, patient });
});

// ── Single action endpoint ───────────────────────────────────────────
let skipTimer = null;

app.post('/api/admin/action', requireAdmin, (req, res) => {
  if (skipTimer) clearTimeout(skipTimer);

  const currentQueue = db.getFullQueueDisplay();
  console.log('Queue state:', currentQueue.map(p => `#${p.token_number} [${p.status}]`).join(', '));

  const calledPatient = currentQueue.find(p => p.status === 'called');
  console.log('Currently called:', calledPatient ? `#${calledPatient.token_number}` : 'none');

  if (calledPatient) {
    db.markDone(calledPatient.id);
    console.log(`Marked #${calledPatient.token_number} as done`);
  }

  const next = db.callNext();
  console.log('Next called:', next ? `#${next.token_number}` : 'none — queue empty');

  broadcast();

  if (next) {
    io.emit('patient-called', next);

    skipTimer = setTimeout(() => {
      const wasSkipped = db.skipIfExpired(next.id);
      if (wasSkipped) {
        io.emit('patient-skipped', next);
        io.emit('auto-skip-occurred', next);
        broadcast();
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
});

// ── Admin done (kept for safety) ───────────────────────────────────
app.post('/api/admin/done/:id', requireAdmin, (req, res) => {
  db.markDone(parseInt(req.params.id));
  broadcast();
  res.json({ success: true });
});

// ── Socket ───────────────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('full-queue-updated', db.getFullQueueDisplay());
  socket.emit('skipped-list-updated', db.getRecentlySkipped());
  socket.emit('avg-updated', db.getAvgMinutesPerPerson());
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});