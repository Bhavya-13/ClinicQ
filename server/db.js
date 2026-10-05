const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const schedule = require('./schedule');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GRACE_PERIOD_SECONDS = 60;

// Clinic days are calculated in IST regardless of the server's timezone.
// IST = UTC+5:30 with no daylight saving, so a fixed offset is safe.
const CLINIC_UTC_OFFSET_MINUTES = 330;

// Used for the closing-time estimate until a clinic has real averages
const FALLBACK_MINS_PER_PERSON = 6;

// Everything that may be shown publicly about a patient.
// access_token is deliberately NOT included — it's the patient's private key.
const PUBLIC_PATIENT_FIELDS =
  'id, clinic_id, queue_id, names, num_patients, token_number, status, checkin_status, skip_reason, called_at, checkin_deadline, done_at, created_at';

const SESSION_FIELDS =
  'id, slot, name, start_time, end_time, booking_opens_before_min, booking_closes_before_end_min, closed_days, closing_warning, max_online_people';

const CLINIC_ADMIN_FIELDS =
  'id, slug, name, doctor_name, specialty, area, city, address, timings, is_listed, day_reset_hour, is_active, is_paused, created_at';

// What anyone may see about a listed clinic on the public homepage
const CLINIC_LISTING_FIELDS =
  'slug, name, doctor_name, specialty, area, city, address, timings, is_paused';

// A clinic together with its sessions, in one request
const WITH_SESSIONS = `*, sessions:clinic_sessions(${SESSION_FIELDS})`;
const ADMIN_WITH_SESSIONS = `${CLINIC_ADMIN_FIELDS}, sessions:clinic_sessions(${SESSION_FIELDS})`;
const LISTING_WITH_SESSIONS = `${CLINIC_LISTING_FIELDS}, sessions:clinic_sessions(${SESSION_FIELDS})`;

function newAccessToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Sessions come back in any order — keep them in slot order
function tidy(clinic) {
  if (clinic && Array.isArray(clinic.sessions)) {
    clinic.sessions.sort((a, b) => a.slot - b.slot);
  }
  return clinic;
}

// The patient being served is always first; everyone else by token number
function sortForQueue(list) {
  return [...list].sort((a, b) => {
    const calledA = a.status === 'called' ? 0 : 1;
    const calledB = b.status === 'called' ? 0 : 1;
    return calledA - calledB || a.token_number - b.token_number;
  });
}

// ── Clinics ────────────────────────────────────────────────────────

async function getClinicBySlug(slug) {
  const { data, error } = await supabase
    .from('clinics')
    .select(WITH_SESSIONS)
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return tidy(data);
}

async function getClinicById(id) {
  const { data, error } = await supabase
    .from('clinics')
    .select(WITH_SESSIONS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return tidy(data);
}

// Owner view of one clinic (no PIN hash)
async function getClinicForOwner(id) {
  const { data, error } = await supabase
    .from('clinics')
    .select(ADMIN_WITH_SESSIONS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return tidy(data);
}

async function listClinics() {
  const { data, error } = await supabase
    .from('clinics')
    .select(ADMIN_WITH_SESSIONS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(tidy);
}

// Active clinics that chose to appear in public search
async function listListedClinics() {
  const { data, error } = await supabase
    .from('clinics')
    .select(LISTING_WITH_SESSIONS)
    .eq('is_active', true)
    .eq('is_listed', true)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data.map(tidy);
}

// Used by the background schedule check
async function listActiveClinics() {
  const { data, error } = await supabase
    .from('clinics')
    .select(WITH_SESSIONS)
    .eq('is_active', true);
  if (error) throw error;
  return data.map(tidy);
}

async function createClinic({ slug, name, pinHash, dayResetHour, listing = {} }) {
  const { data, error } = await supabase
    .from('clinics')
    .insert({ slug, name, pin_hash: pinHash, day_reset_hour: dayResetHour, ...listing })
    .select(CLINIC_ADMIN_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

async function updateClinic(id, updates) {
  const { data, error } = await supabase
    .from('clinics')
    .update(updates)
    .eq('id', id)
    .select(CLINIC_ADMIN_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Replaces a clinic's sessions with exactly this list (0, 1 or 2 rows, already validated)
async function setSessions(clinicId, rows) {
  if (rows.length > 0) {
    const { error } = await supabase
      .from('clinic_sessions')
      .upsert(rows.map(r => ({ ...r, clinic_id: clinicId })), { onConflict: 'clinic_id,slot' });
    if (error) throw error;
  }

  let del = supabase.from('clinic_sessions').delete().eq('clinic_id', clinicId);
  if (rows.length > 0) {
    del = del.not('slot', 'in', `(${rows.map(r => r.slot).join(',')})`);
  }
  const { error: deleteError } = await del;
  if (deleteError) throw deleteError;
}

async function setQueuePausedStatus(clinicId, isPaused) {
  const { error } = await supabase
    .from('clinics')
    .update({ is_paused: isPaused })
    .eq('id', clinicId);
  if (error) throw error;
}

// ── Queues ─────────────────────────────────────────────────────────

// Old "day with a reset hour" key — only used by clinics with no sessions
function getClinicDateKey(dayResetHour) {
  const nowInClinicTime = new Date(Date.now() + CLINIC_UTC_OFFSET_MINUTES * 60 * 1000);
  if (nowInClinicTime.getUTCHours() < dayResetHour) {
    nowInClinicTime.setUTCDate(nowInClinicTime.getUTCDate() - 1);
  }
  return nowInClinicTime.toISOString().split('T')[0];
}

// Deletes this clinic's old queues (and their patients). Other clinics are untouched.
// applyFilter picks which of this clinic's queues count as "old".
async function cleanupQueues(clinicId, applyFilter) {
  const { data: oldQueues, error } = await applyFilter(
    supabase.from('queues').select('id').eq('clinic_id', clinicId)
  );
  if (error) throw error;
  if (!oldQueues || oldQueues.length === 0) return;

  const oldQueueIds = oldQueues.map(q => q.id);

  const { error: deletePatientsError } = await supabase
    .from('patients')
    .delete()
    .in('queue_id', oldQueueIds);
  if (deletePatientsError) throw deletePatientsError;

  const { error: deleteQueuesError } = await supabase
    .from('queues')
    .delete()
    .in('id', oldQueueIds);
  if (deleteQueuesError) throw deleteQueuesError;

  console.log(`🧹 Clinic ${clinicId}: cleaned up ${oldQueueIds.length} old queue(s)`);
}

async function findQueue(clinicId, dateKey, sessionId) {
  let query = supabase
    .from('queues')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('date', dateKey);
  query = sessionId ? query.eq('session_id', sessionId) : query.is('session_id', null);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

async function createQueue(clinic, dateKey, sessionId, cleanupFilter) {
  await cleanupQueues(clinic.id, cleanupFilter);

  const { data, error } = await supabase
    .from('queues')
    .insert({ clinic_id: clinic.id, date: dateKey, session_id: sessionId, current_number: 0 })
    .select()
    .single();

  if (error) {
    // Another request created this queue a moment earlier — use that one
    if (error.code === '23505') {
      const existing = await findQueue(clinic.id, dateKey, sessionId);
      if (existing) return existing;
    }
    throw error;
  }
  return data;
}

// Works out which queue is live right now for this clinic.
//   - Clinics with sessions: the queue of the running session. Its token numbers
//     start from 1 each time a session's booking opens (a new queue is created).
//   - Clinics without sessions: one queue per day, reset at day_reset_hour (old way).
// create=false only looks; it never creates anything.
async function getQueueContext(clinic, { create = false } = {}) {
  const status = schedule.getStatus(clinic.sessions);

  if (status.mode === 'always') {
    const dateKey = getClinicDateKey(clinic.day_reset_hour);
    let queue = await findQueue(clinic.id, dateKey, null);
    if (!queue && create) {
      queue = await createQueue(clinic, dateKey, null, q => q.neq('date', dateKey));
    }
    return { queue, status };
  }

  if (!status.active) return { queue: null, status };

  const { dateKey, sessionId } = status.active;
  let queue = await findQueue(clinic.id, dateKey, sessionId);
  if (!queue && create) {
    // Keep yesterday and today so leftover patients can still see their token page
    const cutoff = schedule.addDaysToKey(schedule.istDateKey(Date.now()), -1);
    queue = await createQueue(clinic, dateKey, sessionId, q => q.lt('date', cutoff));
  }
  return { queue, status };
}

async function getTodayQueue(clinic, options) {
  return (await getQueueContext(clinic, options)).queue;
}

// Atomic in the database, so two simultaneous registrations never get the same number
async function takeNextTokenNumber(queueId) {
  const { data, error } = await supabase.rpc('next_token_number', { p_queue_id: queueId });
  if (error) throw error;
  return data;
}

// ── Capacity: online limit + closing-time estimate ─────────────────

// Everything the register flow needs to know about how full the live queue is.
async function getCapacity(clinic) {
  const { queue, status } = await getQueueContext(clinic);

  const session = status.active
    ? (clinic.sessions || []).find(s => s.id === status.active.sessionId) || null
    : null;

  let onlinePeople = 0; // people with online tokens (cancelled / replaced ones give their spot back)
  let peopleAhead = 0;  // everyone still waiting or being served, online or walk-in

  if (queue) {
    const { data, error } = await supabase
      .from('patients')
      .select('num_patients, status, checkin_status, source')
      .eq('queue_id', queue.id);
    if (error) throw error;

    for (const p of data) {
      const gone = p.status === 'done' && (p.checkin_status === 'cancelled' || p.checkin_status === 'replaced');
      if (p.source === 'online' && !gone) onlinePeople += p.num_patients;
      if (p.status === 'waiting' || p.status === 'called') peopleAhead += p.num_patients;
    }
  }

  const defaultLimit = session?.max_online_people ?? null;
  // A staff override only means something while the owner still has a limit switched on
  const overridden = defaultLimit !== null && queue?.limit_override != null;
  const limit = defaultLimit === null ? null : (overridden ? queue.limit_override : defaultLimit);
  
  // Closing-time estimate: will a new patient probably not be seen before the session ends?
  const avg = (await getAvgMinutesPerPerson(clinic.id)) ?? FALLBACK_MINS_PER_PERSON;
  const waitMin = peopleAhead * avg;
  const minutesLeft = status.active ? (status.active.endMs - Date.now()) / 60000 : null;
  const closingWarning = !!session && session.closing_warning !== false;
  const likelyNotSeen = closingWarning && minutesLeft !== null && waitMin >= minutesLeft;

  return {
    mode: status.mode,
    sessionName: session?.name ?? status.active?.name ?? null,
    limit,
    defaultLimit,
    overridden,
    onlinePeople,
    spotsLeft: limit === null ? null : Math.max(0, limit - onlinePeople),
    limitReached: limit !== null && onlinePeople >= limit,
    peopleAhead,
    waitMin,
    minutesLeft,
    endMs: status.active ? status.active.endMs : null,
    closingWarning,
    likelyNotSeen,
  };
}

// Throws DAILY_LIMIT if adding this many online people would go over today's limit
async function assertRoomForOnline(clinic, people) {
  const cap = await getCapacity(clinic);
  if (cap.limit !== null && cap.onlinePeople + people > cap.limit) {
    const err = new Error('Online token limit reached');
    err.code = 'DAILY_LIMIT';
    err.capacity = cap;
    err.people = people;
    throw err;
  }
  return cap;
}

// Staff change today's limit (null = go back to the usual one)
async function setQueueLimit(clinic, limit) {
  const queue = await getTodayQueue(clinic, { create: true });
  if (!queue) {
    const err = new Error('No session is running');
    err.code = 'NO_ACTIVE_SESSION';
    throw err;
  }
  const { error } = await supabase
    .from('queues')
    .update({ limit_override: limit })
    .eq('id', queue.id);
  if (error) throw error;
}

// ── Patients ───────────────────────────────────────────────────────

async function registerPatient(clinic, names, numPatients, { source = 'online' } = {}) {
  const queue = await getTodayQueue(clinic, { create: true });
  if (!queue) {
    const err = new Error('No session is running');
    err.code = 'NO_ACTIVE_SESSION';
    throw err;
  }
  const tokenNumber = await takeNextTokenNumber(queue.id);

  const { data, error } = await supabase
    .from('patients')
    .insert({
      clinic_id: clinic.id,
      queue_id: queue.id,
      names,
      num_patients: numPatients,
      token_number: tokenNumber,
      access_token: newAccessToken(),
      source,
    })
    .select('*') // includes access_token — only ever sent to the patient who registered
    .single();

  if (error) throw error;
  return data;
}

async function getFullQueueDisplay(clinic) {
  const queue = await getTodayQueue(clinic);
  if (!queue) return [];

  const { data, error } = await supabase
    .from('patients')
    .select(PUBLIC_PATIENT_FIELDS)
    .eq('queue_id', queue.id)
    .neq('status', 'done')
    .order('token_number', { ascending: true });
  if (error) throw error;
  return sortForQueue(data);
}

async function getRecentlySkipped(clinic) {
  const queue = await getTodayQueue(clinic);
  if (!queue) return [];

  const { data, error } = await supabase
    .from('patients')
    .select(PUBLIC_PATIENT_FIELDS)
    .eq('queue_id', queue.id)
    .eq('status', 'skipped')
    .order('token_number', { ascending: false })
    .limit(5);
  if (error) throw error;
  return data;
}

// The patient's own record, found by their private link. Scoped to the clinic.
async function getPatientByAccessToken(clinicId, accessToken) {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', clinicId)
    .eq('access_token', accessToken)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getAvgMinutesPerPerson(clinicId) {
  const { data, error } = await supabase
    .from('clinics')
    .select('avg_total_minutes, avg_total_people')
    .eq('id', clinicId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.avg_total_people <= 0) return null;
  return Math.round((data.avg_total_minutes / data.avg_total_people) * 10) / 10;
}

async function callNext(clinic) {
  const queue = await getTodayQueue(clinic);
  if (!queue) return null;

  const { data: waiting, error } = await supabase
    .from('patients')
    .select('id')
    .eq('queue_id', queue.id)
    .eq('status', 'waiting')
    .order('token_number', { ascending: true })
    .limit(1);
  if (error) throw error;
  if (!waiting || waiting.length === 0) return null;

  const now = new Date();
  const deadline = new Date(now.getTime() + GRACE_PERIOD_SECONDS * 1000);

  const { data: updated, error: updateError } = await supabase
    .from('patients')
    .update({
      status: 'called',
      called_at: now.toISOString(),
      checkin_deadline: deadline.toISOString(),
      checkin_status: 'pending',
    })
    .eq('id', waiting[0].id)
    .eq('status', 'waiting')
    .select(PUBLIC_PATIENT_FIELDS)
    .maybeSingle();

  if (updateError) throw updateError;
  return updated;
}

async function checkInPatient(patient) {
  if (!patient) return { success: false, reason: 'Not found' };
  if (patient.status !== 'called') return { success: false, reason: 'Not currently called' };
  if (new Date() > new Date(patient.checkin_deadline))
    return { success: false, reason: 'Grace period expired' };

  const { data, error } = await supabase
    .from('patients')
    .update({ checkin_status: 'confirmed' })
    .eq('id', patient.id)
    .eq('status', 'called')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, reason: 'Not currently called' };

  return { success: true, patientId: patient.id };
}

async function confirmCheckin(clinicId, accessToken) {
  return checkInPatient(await getPatientByAccessToken(clinicId, accessToken));
}

async function confirmCheckinById(clinicId, patientId) {
  const { data: patient, error } = await supabase
    .from('patients')
    .select(PUBLIC_PATIENT_FIELDS)
    .eq('clinic_id', clinicId)
    .eq('id', patientId)
    .maybeSingle();
  if (error) throw error;
  return checkInPatient(patient);
}

// Staff skip. Returns the skipped patient (public fields), or null.
async function forceSkip(clinicId, patientId) {
  const { data, error } = await supabase
    .from('patients')
    .update({
      status: 'skipped',
      checkin_status: 'skipped',
      skip_reason: 'manual',
      skipped_at: new Date().toISOString(),
    })
    .eq('clinic_id', clinicId)
    .eq('id', patientId)
    .eq('status', 'called')
    .select(PUBLIC_PATIENT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Auto-skip every called patient (in any clinic) whose check-in time has run out.
// One atomic update, so it's safe even if two servers run it at once.
async function sweepExpiredCheckins() {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('patients')
    .update({ status: 'skipped', checkin_status: 'skipped', skip_reason: 'no_show', skipped_at: now })
    .eq('status', 'called')
    .eq('checkin_status', 'pending')
    .lt('checkin_deadline', now)
    .select(PUBLIC_PATIENT_FIELDS);
  if (error) throw error;
  return data || [];
}

// A patient cancels their own token (waiting, or called but not yet checked in).
// Everyone behind them moves up. Not counted in the wait-time average.
async function cancelPatientToken(clinicId, accessToken) {
  const patient = await getPatientByAccessToken(clinicId, accessToken);
  if (!patient) return { success: false, reason: 'Token not found' };
  if (!['waiting', 'called'].includes(patient.status)) {
    return { success: false, reason: 'This token is no longer active' };
  }

  const { data, error } = await supabase
    .from('patients')
    .update({ status: 'done', checkin_status: 'cancelled' })
    .eq('id', patient.id)
    .in('status', ['waiting', 'called'])
    .select(PUBLIC_PATIENT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { success: false, reason: 'This token is no longer active' };

  return { success: true, patient: data };
}

// Closes an old entry and puts the same people at the END of the live queue
// with a new token number. Returns the new patient (with access_token), or null.
async function moveToCurrentQueue(clinic, oldPatient, { asRejoined, fromStatuses }) {
  const queue = await getTodayQueue(clinic, { create: true });
  if (!queue) return null;

  // Claim the old entry first, so two requests at once can't create two new tokens
  const { data: claimed, error: claimError } = await supabase
    .from('patients')
    .update({ status: 'done', checkin_status: 'replaced' })
    .eq('id', oldPatient.id)
    .in('status', fromStatuses)
    .select('id')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return null;

  const tokenNumber = await takeNextTokenNumber(queue.id);

  const row = {
    clinic_id: clinic.id,
    queue_id: queue.id,
    names: oldPatient.names,
    num_patients: oldPatient.num_patients,
    token_number: tokenNumber,
    status: 'waiting',
    access_token: newAccessToken(),
  };
  if (asRejoined) row.checkin_status = 'rejoined'; // shows the "R" badge

  const { data: newPatient, error: insertError } = await supabase
    .from('patients')
    .insert(row)
    .select('*')
    .single();
  if (insertError) throw insertError;
  return newPatient;
}

// Skipped in the live queue → back at the end, marked R
function rejoinSkippedPatient(clinic, oldPatient) {
  return moveToCurrentQueue(clinic, oldPatient, { asRejoined: true, fromStatuses: ['skipped'] });
}

// The "Rejoin" / "Join the new queue" button on a patient's own token page
async function rejoinQueue(clinic, accessToken) {
  const old = await getPatientByAccessToken(clinic.id, accessToken);
  if (!old) return null;

  const queue = await getTodayQueue(clinic);
  const inLiveQueue = !!queue && old.queue_id === queue.id;

  // Skipped in the live queue: swaps the old token for a new one, so it never counts against the limit
  if (old.status === 'skipped' && inLiveQueue) {
    return moveToCurrentQueue(clinic, old, { asRejoined: true, fromStatuses: ['skipped'] });
  }

  // Left over from a session that has ended: joins the new queue like anyone else,
  // so it does count towards the new session's online limit
  if (!inLiveQueue && ['waiting', 'called', 'skipped'].includes(old.status)) {
    await assertRoomForOnline(clinic, old.num_patients);
    return moveToCurrentQueue(clinic, old, { asRejoined: false, fromStatuses: ['waiting', 'called', 'skipped'] });
  }

  return null;
}

const RECENT_SKIP_MINUTES = 30;

// Someone skipped in the last 30 minutes with the same name and group size.
// Used so that registering again counts as a rejoin instead of a brand-new entry.
async function findRecentlySkippedByName(clinic, name, numPatients) {
  const queue = await getTodayQueue(clinic);
  if (!queue) return null;

  const normalized = name.trim().toLowerCase();
  const since = new Date(Date.now() - RECENT_SKIP_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('queue_id', queue.id)
    .eq('status', 'skipped')
    .gte('skipped_at', since)
    .order('skipped_at', { ascending: false });
  if (error) throw error;

  return data.find(p =>
    p.names?.[0]?.trim().toLowerCase() === normalized &&
    p.num_patients === numPatients
  ) || null;
}

async function markDone(clinicId, patientId) {
  const { data: patient, error } = await supabase
    .from('patients')
    .select(PUBLIC_PATIENT_FIELDS)
    .eq('clinic_id', clinicId)
    .eq('id', patientId)
    .maybeSingle();
  if (error) throw error;
  if (!patient || patient.status === 'done') return;

  const now = new Date();
  const { error: updateError } = await supabase
    .from('patients')
    .update({ status: 'done', done_at: now.toISOString() })
    .eq('id', patientId);
  if (updateError) throw updateError;

  if (!patient.called_at) return;

  const mins = (now - new Date(patient.called_at)) / 1000 / 60;
  const minsPerPerson = mins / patient.num_patients;

  // Sanity check per person, not on the raw group total
  if (minsPerPerson < 0.5 || minsPerPerson > 60) return;

  const { data: stats, error: statsError } = await supabase
    .from('clinics')
    .select('avg_total_minutes, avg_total_people')
    .eq('id', clinicId)
    .single();
  if (statsError) throw statsError;

  const { error: avgError } = await supabase
    .from('clinics')
    .update({
      avg_total_minutes: stats.avg_total_minutes + mins,
      avg_total_people: stats.avg_total_people + patient.num_patients,
    })
    .eq('id', clinicId);
  if (avgError) throw avgError;
}

async function findActivePatientByName(clinic, name, numPatients) {
  const queue = await getTodayQueue(clinic);
  if (!queue) return null;

  const normalized = name.trim().toLowerCase();
  const windowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('queue_id', queue.id)
    .in('status', ['waiting', 'called'])
    .not('access_token', 'is', null)
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false });
  if (error) throw error;

  return data.find(p =>
    p.names?.[0]?.trim().toLowerCase() === normalized &&
    p.num_patients === numPatients
  ) || null;
}

module.exports = {
  GRACE_PERIOD_SECONDS,
  getClinicBySlug,
  getClinicById,
  getClinicForOwner,
  listClinics,
  listListedClinics,
  listActiveClinics,
  createClinic,
  updateClinic,
  setSessions,
  setQueuePausedStatus,
  getQueueContext,
  getTodayQueue,
  getCapacity,
  assertRoomForOnline,
  setQueueLimit,
  registerPatient,
  getFullQueueDisplay,
  getRecentlySkipped,
  getPatientByAccessToken,
  getAvgMinutesPerPerson,
  callNext,
  confirmCheckin,
  confirmCheckinById,
  forceSkip,
  sweepExpiredCheckins,
  cancelPatientToken,
  rejoinQueue,
  rejoinSkippedPatient,
  findRecentlySkippedByName,
  markDone,
  findActivePatientByName,
};