const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const QRCode = require('qrcode');
const db = require('./db');

// ── Global safety net — prints real errors instead of crashing silently ──
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Rejection:', reason);
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const PORT = 3001;

// ── Simple admin PIN gate ─────────────────────────────────
const ADMIN_PIN = process.env.ADMIN_PIN || '0000';

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
    return res.json({ success: true, token: 'admin-session' });
  }
  res.status(401).json({ success: false, error: 'Incorrect PIN' });
});

async function broadcast() {
  io.emit('full-queue-updated', await db.getFullQueueDisplay());
  io.emit('skipped-list-updated', await db.getRecentlySkipped());
  io.emit('avg-updated', await db.getAvgMinutesPerPerson());
}

// ── QR Code ────────────────────────────────────────────────
app.get('/api/qrcode', async (req, res) => {
  try {
    const host = req.headers.host.replace(':3001', ':5173');
    const url = `http://${host}/register`;
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

// ── Single patient ─────────────────────────────────────────
app.get('/api/patient/:id', async (req, res) => {
  try {
    const patient = await db.getPatient(parseInt(req.params.id));
    if (!patient) return res.status(404).json({ error: 'Not found' });
    res.json(patient);
  } catch (err) {
    console.error('❌ /api/patient/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Check-in ───────────────────────────────────────────────
app.post('/api/checkin/:id', async (req, res) => {
  try {
    const result = await db.confirmCheckin(parseInt(req.params.id));
    if (!result.success) return res.status(400).json(result);
    io.emit('checkin-confirmed', { patientId: parseInt(req.params.id) });
    await broadcast();
    res.json({ success: true });
  } catch (err) {
    console.error('❌ /api/checkin/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Rejoin ─────────────────────────────────────────────────
app.post('/api/rejoin/:id', async (req, res) => {
  try {
    const patient = await db.rejoinQueue(parseInt(req.params.id));
    if (!patient) return res.status(400).json({ error: 'Cannot rejoin' });
    await broadcast();
    res.json({ success: true, patient });
  } catch (err) {
    console.error('❌ /api/rejoin/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Single action endpoint ────────────────────────────────
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
            io.emit('patient-skipped', next);
            io.emit('auto-skip-occurred', next);
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