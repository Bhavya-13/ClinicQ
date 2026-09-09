const Database = require('better-sqlite3');
const db = new Database('./queue.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS queues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    current_number INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    queue_id INTEGER,
    names TEXT NOT NULL,
    num_patients INTEGER NOT NULL,
    token_number INTEGER NOT NULL,
    checkin_status TEXT DEFAULT 'pending',
    called_at TEXT DEFAULT NULL,
    checkin_deadline TEXT DEFAULT NULL,
    done_at TEXT DEFAULT NULL,
    status TEXT DEFAULT 'waiting',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(queue_id) REFERENCES queues(id)
  );

  CREATE TABLE IF NOT EXISTS avg_stats (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    total_minutes REAL DEFAULT 0,
    total_people INTEGER DEFAULT 0
  );
`);

try { db.exec(`ALTER TABLE patients ADD COLUMN done_at TEXT DEFAULT NULL`); } catch {}

// Make sure avg_stats always has exactly one row
const avgRow = db.prepare('SELECT * FROM avg_stats WHERE id = 1').get();
if (!avgRow) {
  db.prepare('INSERT INTO avg_stats (id, total_minutes, total_people) VALUES (1, 0, 0)').run();
}

const GRACE_PERIOD_SECONDS = 120;

function parseNames(patient) {
  if (!patient) return null;
  try { return { ...patient, names: JSON.parse(patient.names) }; }
  catch { return { ...patient, names: [patient.names] }; }
}

// Clinic day resets at 4 PM
function getTodayQueue() {
  const now = new Date();
  const clinicDay = new Date(now);
  if (now.getHours() < 16) {
    clinicDay.setDate(clinicDay.getDate() - 1);
  }
  const dateKey = clinicDay.toISOString().split('T')[0];
  let queue = db.prepare('SELECT * FROM queues WHERE date = ?').get(dateKey);
  if (!queue) {
    const result = db.prepare('INSERT INTO queues (date) VALUES (?)').run(dateKey);
    queue = db.prepare('SELECT * FROM queues WHERE id = ?').get(result.lastInsertRowid);
  }
  return queue;
}

function registerPatient(names, numPatients) {
  const queue = getTodayQueue();
  const nextToken = queue.current_number + 1;
  db.prepare('UPDATE queues SET current_number = ? WHERE id = ?').run(nextToken, queue.id);
  const result = db.prepare(
    `INSERT INTO patients (queue_id, names, num_patients, token_number, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(queue.id, JSON.stringify(names), numPatients, nextToken, new Date().toISOString());
  return parseNames(db.prepare('SELECT * FROM patients WHERE id = ?').get(result.lastInsertRowid));
}

function getFullQueueDisplay() {
  const queue = getTodayQueue();
  return db.prepare(
    `SELECT * FROM patients
     WHERE queue_id = ? AND status NOT IN ('done')
     ORDER BY token_number ASC`
  ).all(queue.id).map(parseNames);
}

function getRecentlySkipped() {
  const queue = getTodayQueue();
  return db.prepare(
    `SELECT * FROM patients
     WHERE queue_id = ? AND status = 'skipped'
     ORDER BY token_number DESC LIMIT 5`
  ).all(queue.id).map(parseNames);
}

function getPatient(id) {
  return parseNames(db.prepare('SELECT * FROM patients WHERE id = ?').get(id));
}

// Read avg from persistent avg_stats table
// Returns null only if no patients have ever been seen
function getAvgMinutesPerPerson() {
  const row = db.prepare('SELECT * FROM avg_stats WHERE id = 1').get();
  if (!row || row.total_people === 0) return null;
  return Math.round((row.total_minutes / row.total_people) * 10) / 10;
}

function callNext() {
  const queue = getTodayQueue();
  const next = db.prepare(
    `SELECT * FROM patients
     WHERE queue_id = ? AND status = 'waiting'
     ORDER BY token_number ASC LIMIT 1`
  ).get(queue.id);
  if (!next) return null;
  const now = new Date();
  const deadline = new Date(now.getTime() + GRACE_PERIOD_SECONDS * 1000);
  db.prepare(
    `UPDATE patients
     SET status = 'called', called_at = ?, checkin_deadline = ?, checkin_status = 'pending'
     WHERE id = ?`
  ).run(now.toISOString(), deadline.toISOString(), next.id);
  return parseNames(db.prepare('SELECT * FROM patients WHERE id = ?').get(next.id));
}

function confirmCheckin(patientId) {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient || patient.status !== 'called')
    return { success: false, reason: 'Not currently called' };
  if (new Date() > new Date(patient.checkin_deadline))
    return { success: false, reason: 'Grace period expired' };
  db.prepare(`UPDATE patients SET checkin_status = 'confirmed' WHERE id = ?`).run(patientId);
  return { success: true };
}

function skipIfExpired(patientId) {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient || patient.status !== 'called') return false;
  if (patient.checkin_status === 'confirmed') return false;
  if (new Date() <= new Date(patient.checkin_deadline)) return false;
  db.prepare(
    `UPDATE patients SET status = 'skipped', checkin_status = 'skipped' WHERE id = ?`
  ).run(patientId);
  return true;
}

function rejoinQueue(patientId) {
  const queue = getTodayQueue();
  const oldPatient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!oldPatient || oldPatient.status !== 'skipped') return null;

  db.prepare(`UPDATE patients SET status = 'done' WHERE id = ?`).run(patientId);

  const nextToken = queue.current_number + 1;
  db.prepare('UPDATE queues SET current_number = ? WHERE id = ?').run(nextToken, queue.id);

  const result = db.prepare(
    `INSERT INTO patients (queue_id, names, num_patients, token_number, checkin_status, status, created_at)
     VALUES (?, ?, ?, ?, 'rejoined', 'waiting', ?)`
  ).run(queue.id, oldPatient.names, oldPatient.num_patients, nextToken, new Date().toISOString());

  return parseNames(db.prepare('SELECT * FROM patients WHERE id = ?').get(result.lastInsertRowid));
}

// Mark done — updates persistent running average
function markDone(patientId) {
  const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(patientId);
  if (!patient) return;

  const now = new Date();

  // Update patient record
  db.prepare(`UPDATE patients SET status = 'done', done_at = ? WHERE id = ?`)
    .run(now.toISOString(), patientId);

  // Only update avg if patient was actually called (has called_at)
  if (!patient.called_at) return;

  const mins = (now - new Date(patient.called_at + (patient.called_at.includes('Z') ? '' : 'Z'))) / 1000 / 60;

  // Ignore unrealistic values — less than 30 seconds or more than 60 mins
  if (mins < 0.5 || mins > 60) return;

  // Update running total in avg_stats
  db.prepare(
    `UPDATE avg_stats
     SET total_minutes = total_minutes + ?,
         total_people  = total_people  + ?
     WHERE id = 1`
  ).run(mins, patient.num_patients);
}

module.exports = {
  getTodayQueue,
  registerPatient,
  getFullQueueDisplay,
  getRecentlySkipped,
  getPatient,
  getAvgMinutesPerPerson,
  callNext,
  confirmCheckin,
  skipIfExpired,
  rejoinQueue,
  markDone,
  GRACE_PERIOD_SECONDS,
};