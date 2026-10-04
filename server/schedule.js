// Session schedule logic — pure functions, no database access.
// All clock times are IST (UTC+5:30, no daylight saving).

const OFFSET_MIN = 330;
const MIN_MS = 60 * 1000;
const DAY_MIN = 24 * 60;

// How far around "today" we look when working out which session is running
const DAYS_BACK = 2;
const DAYS_AHEAD = 9;

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const pad = (n) => String(n).padStart(2, '0');

// 'HH:MM' or 'HH:MM:SS' → minutes since midnight (or null if invalid)
function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(value ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function minutesToTime(min) {
  const m = ((min % DAY_MIN) + DAY_MIN) % DAY_MIN;
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

// ── IST date helpers ───────────────────────────────────────────────
function istDateKey(ms) {
  const d = new Date(ms + OFFSET_MIN * MIN_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function keyParts(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

function addDaysToKey(key, n) {
  const { y, m, d } = keyParts(key);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

// The moment (UTC ms) that this IST date begins
function keyMidnightMs(key) {
  const { y, m, d } = keyParts(key);
  return Date.UTC(y, m - 1, d) - OFFSET_MIN * MIN_MS;
}

function keyWeekday(key) {
  const { y, m, d } = keyParts(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
}

function daysBetweenKeys(fromKey, toKey) {
  return Math.round((keyMidnightMs(toKey) - keyMidnightMs(fromKey)) / (DAY_MIN * MIN_MS));
}

// ── Wording ────────────────────────────────────────────────────────
function timeLabel(ms) {
  const d = new Date(ms + OFFSET_MIN * MIN_MS);
  const h = d.getUTCHours();
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${pad(d.getUTCMinutes())} ${h < 12 ? 'AM' : 'PM'}`;
}

// "today at 3:00 PM" / "tomorrow at 9:00 AM" / "on Monday at 9:00 AM"
function whenText(ms, nowMs) {
  const diff = daysBetweenKeys(istDateKey(nowMs), istDateKey(ms));
  const t = timeLabel(ms);
  if (diff === 0) return `today at ${t}`;
  if (diff === 1) return `tomorrow at ${t}`;
  return `on ${WEEKDAY_NAMES[keyWeekday(istDateKey(ms))]} at ${t}`;
}

// "12:30 PM" if it is today, otherwise "tomorrow at 12:30 AM"
function untilText(ms, nowMs) {
  return istDateKey(ms) === istDateKey(nowMs) ? timeLabel(ms) : whenText(ms, nowMs);
}

// ["Morning"] → "Morning", ["Morning","Evening"] → "Morning and Evening"
function joinNames(names) {
  return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

// ── Sessions → concrete time windows ───────────────────────────────
function durationMin(startMin, endMin) {
  const d = (endMin - startMin + DAY_MIN) % DAY_MIN;
  return d === 0 ? DAY_MIN : d;
}

function sessionFromRow(row) {
  return {
    id: row.id,
    slot: row.slot,
    name: row.name,
    startMin: parseTime(row.start_time),
    endMin: parseTime(row.end_time),
    opensBefore: row.booking_opens_before_min,
    closesBefore: row.booking_closes_before_end_min,
    closedDays: (row.closed_days || []).map(Number),
  };
}

// Every session "occurrence" around today. A session belongs to the day it STARTS,
// so an evening session that runs past midnight is still that day's session.
function buildInstances(sessions, nowMs) {
  const todayKey = istDateKey(nowMs);
  const list = [];

  for (let i = -DAYS_BACK; i <= DAYS_AHEAD; i++) {
    const key = addDaysToKey(todayKey, i);
    const weekday = keyWeekday(key);
    const midnight = keyMidnightMs(key);

    for (const s of sessions) {
      if (s.closedDays.includes(weekday)) continue;
      const startMs = midnight + s.startMin * MIN_MS;
      const endMs = startMs + durationMin(s.startMin, s.endMin) * MIN_MS;
      list.push({
        sessionId: s.id,
        slot: s.slot,
        name: s.name,
        dateKey: key,
        startMs,
        endMs,
        openMs: startMs - s.opensBefore * MIN_MS,
        closeMs: endMs - s.closesBefore * MIN_MS,
      });
    }
  }

  return list.sort((a, b) => a.openMs - b.openMs);
}

// What is the clinic doing right now?
//   active      – the session whose queue is live (from its booking opening until
//                 the NEXT session's booking opens)
//   bookingOpen – patients may join right now
//   message     – when booking is closed, the REASON (shown to patients)
function getStatus(sessionRows, nowMs = Date.now()) {
  const sessions = (sessionRows || [])
    .map(sessionFromRow)
    .filter(s => s.startMin !== null && s.endMin !== null);

  // No sessions set: the clinic is open all day (old behaviour)
  if (sessions.length === 0) {
    return {
      mode: 'always', bookingOpen: true, active: null, next: null,
      message: '', shortMessage: '', reason: null, key: 'always',
    };
  }

  const instances = buildInstances(sessions, nowMs);
  let active = null;
  let next = null;
  for (const inst of instances) {
    if (inst.openMs <= nowMs) active = inst;
    else { next = inst; break; }
  }

  const bookingOpen = !!active && nowMs < active.closeMs;

  let message = '';
  let shortMessage = '';
  let reason = null;

  if (bookingOpen) {
    shortMessage = `Booking open until ${untilText(active.closeMs, nowMs)}`;
  } else {
    // Why is booking closed? Work out the reasons that apply right now.
    const todayKey = istDateKey(nowMs);
    const weekday = keyWeekday(todayKey);
    const dayName = WEEKDAY_NAMES[weekday];

    const closedToday = sessions.filter(s => s.closedDays.includes(weekday));
    const allClosedToday = closedToday.length === sessions.length;

    // A session that was taking bookings earlier today (or just after midnight) has now stopped
    const justClosed = !!active && active.closeMs >= keyMidnightMs(todayKey);

    const parts = [];
    if (justClosed) parts.push(`${active.name} booking has closed.`);

    if (allClosedToday) {
      parts.push(`The clinic is closed today (${dayName}).`);
    } else if (closedToday.length > 0) {
      const names = joinNames(closedToday.map(s => s.name));
      parts.push(`${names} ${closedToday.length > 1 ? 'are' : 'is'} closed today (${dayName}).`);
    }

    if (next) parts.push(`${next.name} booking opens ${whenText(next.openMs, nowMs)}.`);

    message = parts.length > 0 ? parts.join(' ') : 'Online booking is not available right now.';

    if (allClosedToday) {
      shortMessage = next ? `Closed today · booking opens ${whenText(next.openMs, nowMs)}` : 'Closed today';
    } else {
      shortMessage = next ? `Booking opens ${whenText(next.openMs, nowMs)}` : 'Booking closed';
    }

    if (allClosedToday || closedToday.length > 0) reason = 'closed_day';
    if (justClosed && !allClosedToday) reason = 'booking_closed';
    if (!reason) reason = next ? 'not_open_yet' : 'unavailable';
  }

  return {
    mode: 'sessions',
    bookingOpen,
    active,
    next,
    message,
    shortMessage,
    reason,
    key: active ? `${active.sessionId}:${active.dateKey}` : 'none',
  };
}

// The safe-to-share version sent to browsers
function publicStatus(status) {
  const a = status.active;
  return {
    mode: status.mode,
    bookingOpen: status.bookingOpen,
    sessionName: a ? a.name : null,
    sessionLabel: a ? `${a.name} · ${timeLabel(a.startMs)} – ${timeLabel(a.endMs)}` : null,
    message: status.message,
    shortMessage: status.shortMessage,
    reason: status.reason,
  };
}

// ── Checking what the owner typed in ───────────────────────────────
// Returns { sessions: [...rows] } or { error: '...' }
function normalizeSessions(input) {
  if (!Array.isArray(input)) return { error: 'Sessions must be a list' };
  if (input.length > 2) return { error: 'A clinic can have at most 2 sessions' };

  const rows = [];
  for (const raw of input) {
    const item = raw || {};

    const name = String(item.name ?? '').trim();
    if (!name || name.length > 30) return { error: 'Each session needs a name (max 30 characters)' };

    const startMin = parseTime(item.startTime);
    const endMin = parseTime(item.endTime);
    if (startMin === null || endMin === null) return { error: `${name}: enter a valid start and end time` };
    if (startMin === endMin) return { error: `${name}: start and end time can't be the same` };

    const opensBefore = Number(item.opensBeforeMin ?? 120);
    const closesBefore = Number(item.closesBeforeMin ?? 30);
    if (!Number.isInteger(opensBefore) || opensBefore < 0 || opensBefore > 720)
      return { error: `${name}: "booking opens before" must be 0 to 720 minutes` };
    if (!Number.isInteger(closesBefore) || closesBefore < 0 || closesBefore > 240)
      return { error: `${name}: "booking closes before end" must be 0 to 240 minutes` };

    const closedDays = [...new Set((Array.isArray(item.closedDays) ? item.closedDays : []).map(Number))]
      .sort((a, b) => a - b);
    if (closedDays.some(d => !Number.isInteger(d) || d < 0 || d > 6))
      return { error: `${name}: invalid closed day` };
    if (closedDays.length >= 7)
      return { error: `${name}: it can't be closed every day — remove the session instead` };

    const duration = durationMin(startMin, endMin);
    if (duration + opensBefore <= closesBefore)
      return { error: `${name}: booking would close before it opens` };

    rows.push({
      name,
      start_time: minutesToTime(startMin),
      end_time: minutesToTime(endMin),
      booking_opens_before_min: opensBefore,
      booking_closes_before_end_min: closesBefore,
      closed_days: closedDays,
      _start: startMin,
      _duration: duration,
    });
  }

  rows.sort((a, b) => a._start - b._start);

  if (rows.length === 1) {
    const r = rows[0];
    if (r._duration + r.booking_opens_before_min > DAY_MIN)
      return { error: `${r.name}: booking opens too early — it would overlap with the previous day's session` };
  }

  if (rows.length === 2) {
    const [a, b] = rows;
    if (a._start === b._start) return { error: 'The two sessions cannot start at the same time' };

    const endA = a._start + a._duration;
    if (endA > b._start)
      return { error: `${a.name} runs into ${b.name}. Make sure the two sessions don't overlap.` };

    const openB = b._start - b.booking_opens_before_min;
    if (openB < endA)
      return { error: `${b.name} booking would open before ${a.name} ends. Reduce "booking opens before" for ${b.name}.` };

    const endB = b._start + b._duration;
    if (endB > a._start + DAY_MIN)
      return { error: `${b.name} runs into tomorrow's ${a.name}. Make sure the sessions don't overlap.` };

    const openANext = a._start + DAY_MIN - a.booking_opens_before_min;
    if (openANext < endB)
      return { error: `${a.name} booking would open (the next morning) before ${b.name} ends. Reduce "booking opens before" for ${a.name}.` };
  }

  return {
    sessions: rows.map(({ _start, _duration, ...row }, i) => ({ ...row, slot: i + 1 })),
  };
}

module.exports = {
  OFFSET_MIN,
  istDateKey,
  addDaysToKey,
  getStatus,
  publicStatus,
  normalizeSessions,
};