/**
 * "When" of the Schedule form (item 6): the five simple choices of the clock button and of New on the Automations
 * page, turned into the app's timing request and into the flat record the run-time helpers (recur.js) read.
 *
 * - once: a date and a time            -> { kind: 'at', at: { date, time, time_zone } }
 * - daily: a time                      -> { kind: 'daily', daily: { time, time_zone } }
 * - weekdays: a time                   -> { kind: 'weekly', weekly: { time, time_zone, weekdays: [1..5] } }
 * - days: a time and ISO weekdays      -> weekly (sorted, no repeats; all seven is daily)
 * - hours: every 1 to 24 hours         -> { kind: 'every', every_seconds: n * 3600 } (counted from creation)
 *
 * Times always go to the app as HH:mm:ss (the app refuses HH:mm). The zone is the browser's.
 * Pure functions, so they can be tested without the app.
 */
import { describe, nextAfter } from './recur.js';

export const WHEN_KINDS = ['once', 'daily', 'weekdays', 'days', 'hours'];

/** @returns {string | undefined} the canonical zone, or undefined when it is not known. */
export function zoneOf(zone) {
  if (typeof zone !== 'string' || !zone) return undefined;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

/**
 * A wall-clock time as the app wants it.
 * @param {unknown} value - "9:05", "09:05" or "09:05:00".
 * @returns {string | undefined} "09:05:00", or undefined when it is not a time.
 */
export function clockOf(value) {
  const found = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(value ?? '').trim());
  if (!found) return undefined;
  const [h, m, s] = [Number(found[1]), Number(found[2]), Number(found[3] ?? 0)];
  if (h > 23 || m > 59 || s > 59) return undefined;
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Offset of a zone at an instant, in ms (local wall clock minus UTC). */
function offsetAt(epoch, zone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(epoch)).map((part) => [part.type, part.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return wall - Math.floor(epoch / 1000) * 1000;
}

/**
 * The instant of a local date and time in a zone.
 * @returns {number | undefined} epoch ms; undefined when the date is not real or the time does not exist that day.
 */
export function zonedEpoch(date, time, zone) {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date ?? ''));
  const t = /^(\d{2}):(\d{2}):(\d{2})$/.exec(String(time ?? ''));
  if (!d || !t) return undefined;
  const [y, mo, day] = [Number(d[1]), Number(d[2]), Number(d[3])];
  const naive = Date.UTC(y, mo - 1, day, Number(t[1]), Number(t[2]), Number(t[3]));
  const check = new Date(naive);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== day) return undefined;
  let epoch = naive - offsetAt(naive, zone);
  epoch = naive - offsetAt(epoch, zone);
  // A time a clock change skips does not exist: the wall clock read back differs.
  return epoch + offsetAt(epoch, zone) === naive ? epoch : undefined;
}

/**
 * The Schedule form's choice, checked and turned into what the app and the run-time helpers need.
 * @param {object} when - { kind, date?, time?, days?, hours? }.
 * @param {string} zone - the browser's IANA zone.
 * @param {number} [now] - the current time.
 * @returns {{ok: true, timing: object, record: object} | {ok: false, problem: string}} `problem` is a code for problemWords.
 */
export function planOf(when, zone, now = Date.now()) {
  const tz = zoneOf(zone);
  if (!tz) return { ok: false, problem: 'zone' };
  const kind = String(when?.kind ?? '');
  if (!WHEN_KINDS.includes(kind)) return { ok: false, problem: 'kind' };
  const at = new Date(now).toISOString();
  if (kind === 'hours') {
    const hours = Number(when?.hours);
    if (!Number.isInteger(hours) || hours < 1 || hours > 24) return { ok: false, problem: 'hours' };
    const seconds = hours * 3600;
    return { ok: true, timing: { kind: 'every', every_seconds: seconds }, record: { kind: 'every', everySeconds: seconds, scheduledAt: new Date(now + seconds * 1000).toISOString(), createdAt: at } };
  }
  const time = clockOf(when?.time);
  if (!time) return { ok: false, problem: 'time' };
  if (kind === 'once') {
    const date = String(when?.date ?? '');
    const epoch = zonedEpoch(date, time, tz);
    if (epoch === undefined) return { ok: false, problem: /^\d{4}-\d{2}-\d{2}$/.test(date) ? 'gap' : 'date' };
    // The app needs a time in the future; a few seconds of slack for the form's round trip.
    if (epoch <= now + 30_000) return { ok: false, problem: 'past' };
    return { ok: true, timing: { kind: 'at', at: { date, time, time_zone: tz } }, record: { kind: 'at', scheduledAt: new Date(epoch).toISOString() } };
  }
  if (kind === 'daily') return { ok: true, timing: { kind: 'daily', daily: { time, time_zone: tz } }, record: { kind: 'daily', time, timeZone: tz, scheduledAt: at, createdAt: at } };
  const days = kind === 'weekdays'
    ? [1, 2, 3, 4, 5]
    : [...new Set((Array.isArray(when?.days) ? when.days : []).map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort((a, b) => a - b);
  if (days.length === 0) return { ok: false, problem: 'days' };
  if (days.length === 7) return { ok: true, timing: { kind: 'daily', daily: { time, time_zone: tz } }, record: { kind: 'daily', time, timeZone: tz, scheduledAt: at, createdAt: at } };
  return { ok: true, timing: { kind: 'weekly', weekly: { time, time_zone: tz, weekdays: days } }, record: { kind: 'weekly', time, timeZone: tz, weekdays: days, scheduledAt: at, createdAt: at } };
}

/** @returns {number | undefined} the first run of a planned record after now. */
export function firstRun(record, now = Date.now()) {
  if (!record) return undefined;
  if (record.kind === 'at' || record.kind === 'every') return Date.parse(record.scheduledAt);
  return nextAfter(record, now);
}

const DAYS = {
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};

/** Every word of the When part. Plus is English only (decision 28): `WHEN_WORDS.en` is the one table. */
export const WHEN_WORDS = {
  en: {
    problems: {
      zone: 'Your time zone was not recognised. Check the Mac\'s time zone, then try again.',
      kind: 'Pick when it runs.',
      time: 'Type a time like 09:00.',
      date: 'Pick a date.',
      gap: 'That time does not exist on that day (the clocks change). Pick another time.',
      past: 'That time has passed. Pick a later one.',
      days: 'Pick at least one day.',
      hours: 'Pick from 1 to 24 hours.',
    },
    next: (text) => `next: ${text}`,
    hours: (n) => `Every ${n === 1 ? 'hour' : `${n} hours`}, first in ${n === 1 ? '1 hour' : `${n} hours`}`,
    once: (text) => `Once, ${text}`,
    days: (list) => (list.length === 7 ? 'Every day' : list.join('-') === '1-2-3-4-5' ? 'Every weekday' : `Every ${list.map((day) => DAYS.en[day - 1]).join(', ')}`),
    at: (days, time) => `${days} at ${time}`,
  },
};

// Plus is English only (decision 28): a page that reports Chinese still gets English. `lang` stays accepted.
const langOf = () => 'en';

/** A date and time in a zone, short ("Mon 24 Nov, 09:00"). */
export function shortWhen(epoch, zone, lang = 'en') {
  if (!Number.isFinite(epoch)) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(epoch));
  } catch {
    return new Date(epoch).toISOString().slice(0, 16).replace('T', ' ');
  }
}

/**
 * The grey line under When: the rule in words and its next run, or what is wrong.
 * The rule's words are recur.describe's, so they match the Automations list.
 * @returns {{words: string, next: number | undefined, line: string, problem?: string}}
 */
export function previewOf(when, zone, lang = 'en', now = Date.now()) {
  const words = WHEN_WORDS[langOf(lang)];
  const plan = planOf(when, zone, now);
  if (!plan.ok) return { words: '', next: undefined, line: words.problems[plan.problem] ?? words.problems.kind, problem: plan.problem };
  const tz = zoneOf(zone);
  const next = firstRun(plan.record, now);
  let rule;
  if (plan.record.kind === 'every') rule = words.hours(plan.record.everySeconds / 3600);
  else if (plan.record.kind === 'at') rule = words.once(shortWhen(next, tz, lang));
  else rule = describe(plan.record, { localZone: tz });
  const line = plan.record.kind === 'every' || plan.record.kind === 'at' ? rule : `${rule} · ${words.next(shortWhen(next, tz, lang))}`;
  return { words: rule, next, line };
}
