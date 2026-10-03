const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GRACE_PERIOD_SECONDS = 60;

// Clinic days are calculated in IST regardless of the server's timezone.
// IST = UTC+5:30 with no daylight saving, so a fixed offset is safe.
const CLINIC_UTC_OFFSET_MINUTES = 330;

// Everything that may be shown publicly about a patient.
// access_token is deliberately NOT included — it's the patient's private key.
const PUBLIC_PATIENT_FIELDS =
  'id, clinic_id, queue_id, names, num_patients, token_number, status, checkin_status, skip_reason, called_at, checkin_deadline, done_at, created_at, queue_order';

const CLINIC_ADMIN_FIELDS =
  'id, slug, name, doctor_name, specialty, area, city, address, timings, is_listed, day_reset_hour, is_active, is_paused, created_at';

// What anyone may see about a listed clinic on the public homepage
const CLINIC_LISTING_FIELDS =
  'slug, name, doctor_name, specialty, area, city, address, timings, is_paused';

function newAccessToken() {
  return crypto.randomBytes(16).toString('hex');
}

// ── Queue order ───────────────────────────────────────────
// Normally the order is the token number. A recalled patient gets a negative
// queue_order (earlier recalls = smaller number), so they come before everyone
// else who is waiting, while keeping their original token number.
const RECALL_ORDER_BASE = 4000000000;

function queuePosition(p) {
  return p.queue_order !== null && p.queue_order !== undefined ? Number(p.queue_order) : p.token_number;
}

// The patient being served is always first; everyone else follows queue order
function sortForQueue(list) {
  return [...list].sort((a, b) => {
    const calledA = a.status === 'called' ? 0 : 1;
    const calledB = b.status === 'called' ? 0 : 1;
    return calledA - calledB || queuePosition(a) - queuePosition(b) || a.token_number - b.token_number;
  });
}

// ── Clinics ───────────────────────────────────────────────

async function getClinicBySlug(slug) {
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getClinicById(id) {
  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listClinics() {
  const { data, error } = await supabase
    .from('clinics')
    .select(CLINIC_ADMIN_FIELDS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

// Active clinics that chose to appear in public search
async function listListedClinics() {
  const { data, error } = await supabase
    .from('clinics')
    .select(CLINIC_LISTING_FIELDS)
    .eq('is_active', true)
    .eq('is_listed', true)
    .order('name', { ascending: true })
    .limit(500);
  if (error) throw error;
  return data;
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

async function setQueuePausedStatus(clinicId, isPaused) {
  const { error } = await supabase
    .from('clinics')
    .update({ is_paused: isPaused })
    .eq('id', clinicId);
  if (error) throw error;
}

// ── Clinic day + daily queue ──────────────────────────────

function getClinicDateKey(dayResetHour) {
  const nowInClinicTime = new Date(Date.now() + CLINIC_UTC_OFFSET_MINUTES * 60 * 1000);
  if (nowInClinicTime.getUTCHours() < dayResetHour) {
    nowInClinicTime.setUTCDate(nowInClinicTime.getUTCDate() - 1);
  }
  return nowInClinicTime.toISOString().split('T')[0];
}

// Deletes this clinic's patients/queues from previous days. Other clinics are untouched.
async function cleanupOldPatientData(clinicId, todayKey) {
  const { data: oldQueues, error } = await supabase
    .from('queues')
    .select('id')
    .eq('clinic_id', clinicId)
    .neq('date', todayKey);

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

  console.log(`🧹 Clinic ${clinicId}: cleaned up ${oldQueueIds.length} previous day(s)`);
}

async function getTodayQueue(clinic) {
  const dateKey = getClinicDateKey(clinic.day_reset_hour);

  const { data: queue, error } = await supabase
    .from('queues')
    .select('*')
    .eq('clinic_id', clinic.id)
    .eq('date', dateKey)
    .maybeSingle();
  if (error) throw error;
  if (queue) return queue;

  await cleanupOldPatientData(clinic.id, dateKey);

  const { data: newQueue, error: insertError } = await supabase
    .from('queues')
    .insert({ clinic_id: clinic.id, date: dateKey, current_number: 0 })
    .select()
    .single();

  if (insertError) {
    // Another request created today's queue a moment earlier — use that one
    if (insertError.code === '23505') {
      const { data: existing, error: refetchError } = await supabase
        .from('queues')
        .select('*')
        .eq('clinic_id', clinic.id)
        .eq('date', dateKey)
        .single();
      if (refetchError) throw refetchError;
      return existing;
    }
    throw insertError;
  }

  return newQueue;
}

// Atomic in the database, so two simultaneous registrations never get the same number
async function takeNextTokenNumber(queueId) {
  const { data, error } = await supabase.rpc('next_token_number', { p_queue_id: queueId });
  if (error) throw error;
  return data;
}

// ── Patients ──────────────────────────────────────────────

async function registerPatient(clinic, names, numPatients) {
  const queue = await getTodayQueue(clinic);
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
    })
    .select('*') // includes access_token — only ever sent to the patient who registered
    .single();

  if (error) throw error;
  return data;
}

async function getFullQueueDisplay(clinic) {
  const queue = await getTodayQueue(clinic);
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
  const { data: waiting, error } = await supabase
    .from('patients')
    .select('id, token_number, queue_order')
    .eq('queue_id', queue.id)
    .eq('status', 'waiting');
  if (error) throw error;
  if (!waiting || waiting.length === 0) return null;

  // Recalled patients come first, then token order
  const next = sortForQueue(waiting)[0];

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
    .eq('id', next.id)
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

// Staff bring a skipped patient back as next in line. They keep their token number.
// Returns the patient (public fields), or null if they are no longer in the skipped list.
async function recallSkippedPatient(clinic, patientId) {
  const queue = await getTodayQueue(clinic);
  const { data, error } = await supabase
    .from('patients')
    .update({
      status: 'waiting',
      checkin_status: 'rejoined',
      skip_reason: null,
      skipped_at: null,
      called_at: null,
      checkin_deadline: null,
      // Negative = before every normal token. Earlier recalls get a smaller number,
      // so if several people are recalled, the first recalled goes first.
      queue_order: Math.floor(Date.now() / 1000) - RECALL_ORDER_BASE,
    })
    .eq('clinic_id', clinic.id)
    .eq('queue_id', queue.id)
    .eq('id', patientId)
    .eq('status', 'skipped')
    .select(PUBLIC_PATIENT_FIELDS)
    .maybeSingle();
  if (error) throw error;
  return data;
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

// Closes a skipped entry and puts the same person at the end of today's queue.
// Returns the new patient (with access_token), or null if the entry was already closed.
async function rejoinSkippedPatient(clinic, oldPatient) {
  // Claim the old entry first, so two rejoins at once can't create two new tokens
  const { data: claimed, error: claimError } = await supabase
    .from('patients')
    .update({ status: 'done', checkin_status: 'replaced' })
    .eq('id', oldPatient.id)
    .eq('status', 'skipped')
    .select('id')
    .maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return null;

  const queue = await getTodayQueue(clinic);
  const tokenNumber = await takeNextTokenNumber(queue.id);

  const { data: newPatient, error: insertError } = await supabase
    .from('patients')
    .insert({
      clinic_id: clinic.id,
      queue_id: queue.id,
      names: oldPatient.names,
      num_patients: oldPatient.num_patients,
      token_number: tokenNumber,
      checkin_status: 'rejoined',
      status: 'waiting',
      access_token: newAccessToken(),
    })
    .select('*')
    .single();

  if (insertError) throw insertError;
  return newPatient;
}

// "Rejoin Queue" button on the patient's own token page
async function rejoinQueue(clinic, accessToken) {
  const oldPatient = await getPatientByAccessToken(clinic.id, accessToken);
  if (!oldPatient || oldPatient.status !== 'skipped') return null;
  return rejoinSkippedPatient(clinic, oldPatient);
}

const RECENT_SKIP_MINUTES = 30;

// Someone skipped in the last 30 minutes with the same name and group size.
// Used so that registering again counts as a rejoin instead of a brand-new entry.
async function findRecentlySkippedByName(clinic, name, numPatients) {
  const queue = await getTodayQueue(clinic);
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
  listClinics,
  listListedClinics,
  createClinic,
  updateClinic,
  setQueuePausedStatus,
  getTodayQueue,
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
  recallSkippedPatient,
  cancelPatientToken,
  rejoinQueue,
  rejoinSkippedPatient,
  findRecentlySkippedByName,
  markDone,
  findActivePatientByName,
};