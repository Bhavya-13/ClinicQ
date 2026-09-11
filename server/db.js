const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GRACE_PERIOD_SECONDS = 120;

function parseNames(patient) {
  if (!patient) return null;
  return patient;
}

// Clinic day resets at 4 PM
function getClinicDateKey() {
  const now = new Date();
  const clinicDay = new Date(now);
  if (now.getHours() < 16) {
    clinicDay.setDate(clinicDay.getDate() - 1);
  }
  return clinicDay.toISOString().split('T')[0];
}

// Deletes all patient rows (and their queue rows) from previous clinic days.
// avg_stats is a separate table with no foreign key here — completely untouched.
async function cleanupOldPatientData() {
  const today = getClinicDateKey();

  const { data: oldQueues, error } = await supabase
    .from('queues')
    .select('id')
    .neq('date', today);

  if (error) throw error;
  if (!oldQueues || oldQueues.length === 0) {
    console.log('🧹 Cleanup check: no old queues found');
    return;
  }

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

  console.log(`🧹 Cleaned up patient data from ${oldQueueIds.length} previous day(s)`);
}

async function getTodayQueue() {
  const dateKey = getClinicDateKey();

  let { data: queue, error } = await supabase
    .from('queues')
    .select('*')
    .eq('date', dateKey)
    .maybeSingle();

  if (error) throw error;

  if (!queue) {
    console.log('🆕 New day detected — running cleanup...');
    await cleanupOldPatientData();

    const { data: newQueue, error: insertError } = await supabase
      .from('queues')
      .insert({ date: dateKey, current_number: 0 })
      .select()
      .single();
    if (insertError) throw insertError;
    queue = newQueue;
  }

  return queue;
}

async function registerPatient(names, numPatients) {
  const queue = await getTodayQueue();
  const nextToken = queue.current_number + 1;

  await supabase
    .from('queues')
    .update({ current_number: nextToken })
    .eq('id', queue.id);

  const accessToken = crypto.randomBytes(16).toString('hex');

  const { data, error } = await supabase
    .from('patients')
    .insert({
      queue_id: queue.id,
      names: names,
      num_patients: numPatients,
      token_number: nextToken,
      access_token: accessToken,
    })
    .select()
    .single();

  if (error) throw error;
  return parseNames(data);
}

async function getFullQueueDisplay() {
  const queue = await getTodayQueue();
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('queue_id', queue.id)
    .not('status', 'eq', 'done')
    .order('token_number', { ascending: true });

  if (error) throw error;
  return data.map(parseNames);
}

async function getRecentlySkipped() {
  const queue = await getTodayQueue();
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('queue_id', queue.id)
    .eq('status', 'skipped')
    .order('token_number', { ascending: false })
    .limit(5);

  if (error) throw error;
  return data.map(parseNames);
}

// Internal lookup by numeric id — used only server-side (e.g. admin actions, socket events)
async function getPatient(id) {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return parseNames(data);
}

// Public-facing lookup — this is what patients use via their unguessable access token
async function getPatientByAccessToken(accessToken) {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('access_token', accessToken)
    .maybeSingle();

  if (error) throw error;
  return parseNames(data);
}

async function getAvgMinutesPerPerson() {
  const { data, error } = await supabase
    .from('avg_stats')
    .select('*')
    .eq('id', 1)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.total_people === 0) return null;
  return Math.round((data.total_minutes / data.total_people) * 10) / 10;
}

async function callNext() {
  const queue = await getTodayQueue();
  const { data: next, error } = await supabase
    .from('patients')
    .select('*')
    .eq('queue_id', queue.id)
    .eq('status', 'waiting')
    .order('token_number', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!next) return null;

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
    .select()
    .single();

  if (updateError) throw updateError;
  return parseNames(updated);
}

async function confirmCheckin(accessToken) {
  const patient = await getPatientByAccessToken(accessToken);

  if (!patient) return { success: false, reason: 'Not found' };
  if (patient.status !== 'called')
    return { success: false, reason: 'Not currently called' };
  if (new Date() > new Date(patient.checkin_deadline))
    return { success: false, reason: 'Grace period expired' };

  await supabase
    .from('patients')
    .update({ checkin_status: 'confirmed' })
    .eq('id', patient.id);

  return { success: true, patientId: patient.id };
}

async function skipIfExpired(patientId) {
  const { data: patient, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  if (error) throw error;
  if (!patient || patient.status !== 'called') return false;
  if (patient.checkin_status === 'confirmed') return false;
  if (new Date() <= new Date(patient.checkin_deadline)) return false;

  await supabase
    .from('patients')
    .update({ status: 'skipped', checkin_status: 'skipped' })
    .eq('id', patientId);

  return true;
}

async function rejoinQueue(accessToken) {
  const queue = await getTodayQueue();
  const oldPatient = await getPatientByAccessToken(accessToken);

  if (!oldPatient || oldPatient.status !== 'skipped') return null;

  await supabase
    .from('patients')
    .update({ status: 'done' })
    .eq('id', oldPatient.id);

  const nextToken = queue.current_number + 1;
  await supabase
    .from('queues')
    .update({ current_number: nextToken })
    .eq('id', queue.id);

  const newAccessToken = crypto.randomBytes(16).toString('hex');

  const { data: newPatient, error: insertError } = await supabase
    .from('patients')
    .insert({
      queue_id: queue.id,
      names: oldPatient.names,
      num_patients: oldPatient.num_patients,
      token_number: nextToken,
      checkin_status: 'rejoined',
      status: 'waiting',
      access_token: newAccessToken,
    })
    .select()
    .single();

  if (insertError) throw insertError;
  return parseNames(newPatient);
}

async function markDone(patientId) {
  const { data: patient, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .maybeSingle();

  if (error) throw error;
  if (!patient) return;

  const now = new Date();

  await supabase
    .from('patients')
    .update({ status: 'done', done_at: now.toISOString() })
    .eq('id', patientId);

  if (!patient.called_at) return;

  const mins = (now - new Date(patient.called_at)) / 1000 / 60;

  if (mins < 0.5 || mins > 60) return;

  const { data: statsRow } = await supabase
    .from('avg_stats')
    .select('*')
    .eq('id', 1)
    .single();

  await supabase
    .from('avg_stats')
    .update({
      total_minutes: statsRow.total_minutes + mins,
      total_people: statsRow.total_people + patient.num_patients,
    })
    .eq('id', 1);
}

async function findActivePatientByName(name, numPatients) {
  const queue = await getTodayQueue();
  const normalized = name.trim().toLowerCase();
  const windowStart = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('queue_id', queue.id)
    .in('status', ['waiting', 'called'])
    .gte('created_at', windowStart)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const candidates = data.map(parseNames);
  return candidates.find(p =>
    p.names[0]?.trim().toLowerCase() === normalized &&
    p.num_patients === numPatients
  ) || null;
}

module.exports = {
  getTodayQueue,
  registerPatient,
  getFullQueueDisplay,
  getRecentlySkipped,
  getPatient,
  getPatientByAccessToken,
  getAvgMinutesPerPerson,
  callNext,
  confirmCheckin,
  skipIfExpired,
  rejoinQueue,
  markDone,
  findActivePatientByName,
  cleanupOldPatientData,
  GRACE_PERIOD_SECONDS,
};