/**
 * Past and future run times of the app's scheduled tasks, and their rules in plain words.
 *
 * The add-on cannot load the app's scheduler, so this repeats its rules with Node and `Intl` only
 * (source: dsh-schedule `domain.ts`, dsh-util-time `cron.ts`, `rrule.ts`, `instant.ts`):
 * - a wall-clock time that a daylight-saving jump skips does not run that day (no shift forward);
 *   a time that happens twice runs once, at the earlier of the two;
 * - `every` runs at `scheduledAt + k * everySeconds`;
 * - cron uses five numeric fields and the Vixie rule: day-of-month and day-of-week are joined
 *   by OR only when neither field starts with `*`;
 * - RRULE steps in local wall time, even for HOURLY and MINUTELY.
 * No run is listed at or before the entry's `createdAt` when it has one.
 */

const DAY = 86_400_000;
const MIN_MS = Date.parse('0001-01-01T00:00:00.000Z');
const MAX_MS = Date.parse('9999-12-31T23:59:59.999Z');
const CYCLE_DAYS = 146_097; // 400 Gregorian years: weekdays and leap days repeat after it
const HORIZON = CYCLE_DAYS * DAY;
const SLACK = 4 * 3_600_000; // more than any clock jump
const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

// ---- time zones -------------------------------------------------------------------------------

const formats = new Map();
/** Canonical zone name, or undefined when `Intl` does not know it. */
function zoneOf(tz) {
  if (typeof tz !== 'string' || tz === '') return undefined;
  try { return new Intl.DateTimeFormat('en-US', { timeZone: tz }).resolvedOptions().timeZone; } catch { return undefined; }
}
const processZone = () => new Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Epoch ms of a calendar date-time read as UTC; years below 100 are not shifted to 19xx. */
function utc(y, mo, d, h = 0, mi = 0, s = 0) {
  const t = new Date(Date.UTC(2000, mo - 1, d, h, mi, s));
  t.setUTCFullYear(y);
  return t.getTime();
}

/** The local wall clock of an instant in a zone, as "UTC-shaped" ms. */
function wallOf(epoch, tz) {
  if (tz === 'UTC') return epoch;
  let f = formats.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric',
      day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formats.set(tz, f);
  }
  const p = {};
  for (const { type, value } of f.formatToParts(epoch)) p[type] = value;
  return utc(+p.year, +p.month, +p.day, +p.hour % 24, +p.minute, +p.second) + (((epoch % 1000) + 1000) % 1000);
}

/**
 * The instant of a local wall clock, as the app resolves it: the earlier one when the time happens
 * twice, undefined when a clock change skips it.
 */
function toInstant(wall, tz) {
  if (tz === 'UTC') return wall;
  let best;
  for (const offset of new Set([wall - DAY, wall, wall + DAY].map((p) => wallOf(p, tz) - p))) {
    const e = wall - offset;
    if ((best === undefined || e < best) && wallOf(e, tz) === wall) best = e;
  }
  return best;
}

// ---- calendar of day numbers (days since 1970-01-01 in wall time) -----------------------------

const dayNum = (y, m, d) => Math.floor(utc(y, m, d) / DAY);
function ymd(day) { const t = new Date(day * DAY); return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() }; }
const isoDow = (day) => ((((day + 3) % 7) + 7) % 7) + 1; // day 0 was a Thursday
const monthLen = (y, m) => ymd(dayNum(y, m + 1, 1) - 1).d;
const parseIso = (s) => (typeof s === 'string' ? Date.parse(s) : NaN);

/** Walk local days; each matching day runs at each time of day (ms). Ascending. */
function walkDays(tz, from, to, max, match, times) {
  const out = [];
  const fromWall = wallOf(from, tz);
  const toWall = wallOf(to, tz);
  const first = Math.floor((fromWall - SLACK) / DAY);
  for (let day = first; day * DAY <= toWall + SLACK && out.length < max; day += 1) {
    if (out.length === 0 && day - first > CYCLE_DAYS) break; // nothing in 400 years: never
    if (!match(day)) continue;
    for (const t of times) {
      const wall = day * DAY + t;
      if (wall < fromWall - SLACK || wall > toWall + SLACK) continue;
      const e = toInstant(wall, tz);
      if (e !== undefined && e > from && e <= to && out.length < max) out.push(e);
    }
  }
  return out;
}

// ---- rules ------------------------------------------------------------------------------------

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,3}))?$/;
/** 'HH:mm:ss.SSS' as ms of day, or undefined. */
function clockMs(text) {
  const m = typeof text === 'string' ? CLOCK.exec(text) : null;
  return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + Number((m[4] ?? '0').padEnd(3, '0')) : undefined;
}

/** One cron field: matched values and whether its text starts with `*` (Vixie DOM_STAR/DOW_STAR). */
function cronField(text, lo, hi) {
  const values = new Set();
  for (const el of text.split(',')) {
    let m;
    if (el === '*') for (let v = lo; v <= hi; v += 1) values.add(v);
    else if ((m = /^\*\/(\d+)$/.exec(el))) {
      if (+m[1] < 1) return undefined;
      for (let v = lo; v <= hi; v += +m[1]) values.add(v);
    } else if ((m = /^(\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(el))) {
      if (m[2] === undefined && m[3] !== undefined) return undefined; // the app refuses "5/10"
      const a = +m[1]; const b = m[2] === undefined ? a : +m[2]; const step = m[3] === undefined ? 1 : +m[3];
      if (a < lo || b > hi || a > b || step < 1) return undefined;
      for (let v = a; v <= b; v += step) values.add(v);
    } else return undefined;
  }
  return { values, star: text.startsWith('*'), text };
}

/** Parse a five-field numeric cron expression as the app accepts it; undefined otherwise. */
function parseCron(expression) {
  if (typeof expression !== 'string' || expression === '' || expression.trim() !== expression) return undefined;
  const texts = expression.split(/\s+/);
  if (texts.length !== 5) return undefined;
  const f = texts.map((t, i) => cronField(t, [0, 0, 1, 1, 0][i], [59, 23, 31, 12, 7][i]));
  if (f.some((x) => x === undefined)) return undefined;
  if (f[4].values.delete(7)) f[4].values.add(0); // 7 is Sunday too
  const [mi, h, dom, mon, dow] = f;
  const times = [...h.values].sort((a, b) => a - b)
    .flatMap((hh) => [...mi.values].sort((a, b) => a - b).map((mm) => (hh * 60 + mm) * 60_000));
  const match = (day) => {
    const { m, d } = ymd(day);
    if (!mon.values.has(m)) return false;
    const a = dom.values.has(d); const b = dow.values.has(isoDow(day) % 7);
    return !dom.star && !dow.star ? a || b : a && b;
  };
  return { mi, h, dom, mon, dow, times, match };
}

const RR_PARTS = new Set(['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'WKST', 'BYSECOND', 'BYMINUTE', 'BYHOUR', 'BYDAY',
  'BYMONTHDAY', 'BYYEARDAY', 'BYWEEKNO', 'BYMONTH', 'BYSETPOS']);
const RR_LISTS = { BYSECOND: [0, 59], BYMINUTE: [0, 59], BYHOUR: [0, 23], BYMONTHDAY: [-31, 31], BYMONTH: [1, 12], BYSETPOS: [-366, 366] };
const FREQS = ['MINUTELY', 'HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];

/** 'YYYYMMDDTHHMMSS' as UTC-shaped ms, or undefined when not a real date-time. */
function basicWall(text) {
  const n = [0, 4, 6, 9, 11, 13].map((i, k) => +text.slice(i, [4, 6, 8, 11, 13, 15][k]));
  if (n[0] < 100) return undefined;
  const w = utc(...n);
  const t = new Date(w);
  return t.getUTCMonth() + 1 === n[1] && t.getUTCDate() === n[2] && t.getUTCHours() === n[3] && t.getUTCMinutes() === n[4] ? w : undefined;
}

/**
 * Parse the app's two-line DTSTART + RRULE text. Undefined for what the app refuses and for what
 * this engine does not compute (BYWEEKNO, BYYEARDAY, BYDAY mixing plain days and numbered days).
 */
function parseRRule(text) {
  if (typeof text !== 'string') return undefined;
  const lines = text.replaceAll('\r\n', '\n').trim().split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length !== 2 || !lines[1].startsWith('RRULE:')) return undefined;
  let m; let tz; let start;
  if ((m = /^DTSTART:(\d{8}T\d{6})Z$/.exec(lines[0]))) { tz = 'UTC'; start = basicWall(m[1]); }
  else if ((m = /^DTSTART;TZID=([^:;]+):(\d{8}T\d{6})$/.exec(lines[0]))) { tz = zoneOf(m[1]); start = basicWall(m[2]); }
  if (tz === undefined || start === undefined || toInstant(start, tz) === undefined) return undefined;
  const parts = new Map();
  for (const c of lines[1].slice(6).split(';')) {
    const i = c.indexOf('=');
    const key = c.slice(0, i);
    if (i <= 0 || i === c.length - 1 || parts.has(key) || !RR_PARTS.has(key)) return undefined;
    parts.set(key, c.slice(i + 1));
  }
  const freq = parts.get('FREQ');
  const int = (k, lo, hi) => (parts.has(k) ? (/^\d+$/.test(parts.get(k)) && +parts.get(k) >= lo && +parts.get(k) <= hi ? +parts.get(k) : NaN) : undefined);
  const interval = int('INTERVAL', 1, Number.MAX_SAFE_INTEGER) ?? 1;
  const count = int('COUNT', 1, 1000);
  const untilText = parts.get('UNTIL');
  const until = untilText === undefined ? undefined : /^\d{8}T\d{6}Z$/.test(untilText) ? basicWall(untilText.slice(0, -1)) ?? NaN : NaN;
  const wkst = WD.indexOf(parts.get('WKST') ?? 'MO');
  if (!FREQS.includes(freq) || Number.isNaN(interval) || Number.isNaN(count) || Number.isNaN(until) || wkst < 0) return undefined;
  if ((count !== undefined && until !== undefined) || parts.has('BYWEEKNO') || parts.has('BYYEARDAY')) return undefined;
  const r = { tz, start, freq, interval, count, until, wkst, line: lines[1] };
  for (const [key, [lo, hi]] of Object.entries(RR_LISTS)) {
    if (!parts.has(key)) continue;
    const items = parts.get(key).split(',');
    const vals = items.map(Number);
    if (items.some((s, i) => !(lo < 0 ? /^[+-]?\d+$/ : /^\d+$/).test(s) || vals[i] < lo || vals[i] > hi || (lo < 0 && vals[i] === 0))
      || new Set(vals).size !== vals.length) return undefined;
    r[key] = vals;
  }
  if (parts.has('BYDAY')) {
    r.BYDAY = [];
    for (const s of parts.get('BYDAY').split(',')) {
      const d = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/.exec(s);
      if (!d || (d[1] !== undefined && (+d[1] === 0 || Math.abs(+d[1]) > 53))) return undefined;
      r.BYDAY.push({ n: d[1] === undefined ? 0 : +d[1], wd: WD.indexOf(d[2]) + 1 });
    }
    const numbered = r.BYDAY.filter((b) => b.n !== 0).length;
    if (numbered > 0 && (numbered < r.BYDAY.length || !['MONTHLY', 'YEARLY'].includes(freq))) return undefined;
    r.numbered = numbered > 0;
  }
  const byParts = Object.keys(RR_LISTS).some((k) => r[k]) || r.BYDAY;
  if ((r.BYSECOND?.length ?? 1) > 1 || (FREQS.indexOf(freq) < 2 && byParts)) return undefined;
  if (r.BYMONTHDAY && !['MONTHLY', 'YEARLY'].includes(freq)) return undefined;
  if (r.BYSETPOS && !Object.keys(RR_LISTS).some((k) => k !== 'BYSETPOS' && r[k]) && !r.BYDAY) return undefined;
  if (FREQS.indexOf(freq) >= 2) { // DAILY and longer take missing parts from DTSTART, as the app does
    const s = new Date(start);
    r.BYHOUR ??= [s.getUTCHours()]; r.BYMINUTE ??= [s.getUTCMinutes()]; r.BYSECOND ??= [s.getUTCSeconds()];
    if (!r.BYDAY && !r.BYMONTHDAY) {
      if (freq === 'WEEKLY') r.BYDAY = [{ n: 0, wd: isoDow(Math.floor(start / DAY)) }];
      if (freq === 'MONTHLY' || freq === 'YEARLY') r.BYMONTHDAY = [s.getUTCDate()];
      if (freq === 'YEARLY') r.BYMONTH ??= [s.getUTCMonth() + 1];
    }
    const sort = (a) => [...a].sort((x, y) => x - y);
    r.times = sort(r.BYHOUR).flatMap((h) => sort(r.BYMINUTE).flatMap((mi) => r.BYSECOND.map((sec) => ((h * 60 + mi) * 60 + sec) * 1000)));
  }
  return r;
}

/** Whether a day passes the BYMONTH, BYMONTHDAY and BYDAY filters. */
function rruleDay(r, day) {
  const { y, m, d } = ymd(day);
  if (r.BYMONTH && !r.BYMONTH.includes(m)) return false;
  if (r.BYMONTHDAY && !r.BYMONTHDAY.some((v) => v === d || v === d - monthLen(y, m) - 1)) return false;
  if (!r.BYDAY) return true;
  const wd = isoDow(day);
  if (!r.numbered) return r.BYDAY.some((b) => b.wd === wd);
  // "1MO" counts within the month (MONTHLY, or YEARLY with BYMONTH), else within the year
  const inMonth = r.freq === 'MONTHLY' || r.BYMONTH;
  const idx = inMonth ? d : day - dayNum(y, 1, 1) + 1;
  const len = inMonth ? monthLen(y, m) : dayNum(y + 1, 1, 1) - dayNum(y, 1, 1);
  const pos = Math.floor((idx - 1) / 7) + 1; const neg = -(Math.floor((len - idx) / 7) + 1);
  return r.BYDAY.some((b) => b.wd === wd && (b.n === pos || b.n === neg));
}

/** Candidate wall times of an RRULE, ascending, from the period holding `fromWall` up to `stopWall`. */
function* rruleWalls(r, fromWall, stopWall) {
  const { freq, interval: n, start } = r;
  if (freq === 'MINUTELY' || freq === 'HOURLY') {
    const step = n * (freq === 'MINUTELY' ? 60_000 : 3_600_000);
    for (let w = start + Math.max(0, Math.floor((fromWall - start) / step)) * step; w <= stopWall; w += step) yield w;
    return;
  }
  const sd = Math.floor(start / DAY); const s = ymd(sd); const f = ymd(Math.floor(fromWall / DAY));
  const weekStart = (day) => day - ((isoDow(day) - 1 - r.wkst + 7) % 7);
  const span = { DAILY: Math.floor(fromWall / DAY) - sd, WEEKLY: (weekStart(Math.floor(fromWall / DAY)) - weekStart(sd)) / 7,
    MONTHLY: (f.y - s.y) * 12 + f.m - s.m, YEARLY: f.y - s.y }[freq];
  let yielded = false;
  for (let k = Math.max(0, Math.floor(span / n)); ; k += 1) {
    let days;
    if (freq === 'DAILY') days = [sd + k * n];
    else if (freq === 'WEEKLY') {
      const w0 = weekStart(sd) + k * 7 * n;
      days = [0, 1, 2, 3, 4, 5, 6].map((i) => w0 + i).filter((d) => d >= sd); // the first week starts at DTSTART
    } else {
      const mm = (s.y * 12 + s.m - 1) + k * n * (freq === 'YEARLY' ? 12 : 1);
      const y = Math.floor(mm / 12); const m = (mm % 12) + 1;
      if (y > 9999) return;
      const a = dayNum(y, freq === 'YEARLY' ? 1 : m, 1); const b = freq === 'YEARLY' ? dayNum(y + 1, 1, 1) : dayNum(y, m + 1, 1);
      days = Array.from({ length: b - a }, (_, i) => a + i);
    }
    if (days[0] * DAY > stopWall) return;
    if (!yielded && days[0] * DAY - Math.max(fromWall, start) > HORIZON * n) return; // never matches
    let walls = days.filter((d) => rruleDay(r, d)).flatMap((d) => r.times.map((t) => d * DAY + t));
    if (r.BYSETPOS) {
      walls = [...new Set(r.BYSETPOS.map((p) => walls[p > 0 ? p - 1 : walls.length + p]).filter((w) => w !== undefined))]
        .sort((a, b) => a - b);
    }
    for (const w of walls) if (w >= start) { yielded = true; yield w; }
  }
}

/** RRULE instants in (from, to]; COUNT counts the real runs from DTSTART, skipped times excluded. */
function rruleRuns(r, from, to, max) {
  const out = [];
  const stop = Math.min(to, r.until ?? Infinity);
  const fromWall = r.count === undefined ? Math.max(r.start, wallOf(from, r.tz) - DAY) : r.start;
  let seen = 0; let last;
  for (const wall of rruleWalls(r, fromWall, wallOf(stop, r.tz) + DAY)) {
    const e = toInstant(wall, r.tz);
    if (e === undefined || e === last) continue;
    last = e;
    if (e > stop || (r.count !== undefined && ++seen > r.count)) break;
    if (e > from) { out.push(e); if (out.length >= max) break; }
  }
  return out;
}

// ---- public API -------------------------------------------------------------------------------

/**
 * Run times of a scheduled task: strictly after `from`, at or before `to`, ascending.
 * One-time tasks (`after`, `at`) give their single time when it is in range.
 * @param {object} entry - catalog entry of the app's scheduler (a record plus status, createdAt...).
 * @param {number} from - exclusive lower bound, epoch ms.
 * @param {number} to - inclusive upper bound, epoch ms.
 * @param {{max?: number}} [options] - `max`: most times returned (default 500).
 * @returns {number[] | undefined} epoch ms times, or undefined when the rule is not understood.
 */
export function occurrences(entry, from, to, { max = 500 } = {}) {
  if (!entry || typeof entry !== 'object' || Number.isNaN(Number(from)) || Number.isNaN(Number(to))) return undefined;
  const at = parseIso(entry.scheduledAt);
  if (!Number.isFinite(at)) return undefined;
  const created = parseIso(entry.createdAt);
  let lo = Math.max(Number(from), MIN_MS - 1);
  if (entry.kind !== 'at' && entry.kind !== 'after' && Number.isFinite(created)) lo = Math.max(lo, created);
  const hi = Math.min(Number(to), MAX_MS);
  const limit = Math.max(0, Math.floor(max));
  const empty = hi <= lo || limit === 0;
  switch (entry.kind) {
    case 'at': case 'after':
      return at > from && at <= to && limit > 0 ? [at] : [];
    case 'every': {
      const step = Number(entry.everySeconds) * 1000;
      if (!Number.isSafeInteger(step) || step <= 0) return undefined;
      const out = [];
      if (empty) return out;
      for (let t = at + (Math.floor((lo - at) / step) + 1) * step; t <= hi && out.length < limit; t += step) out.push(t);
      return out;
    }
    case 'daily': case 'weekly': {
      const tz = zoneOf(entry.timeZone); const ms = clockMs(entry.time);
      const days = entry.kind === 'weekly' ? entry.weekdays : [1, 2, 3, 4, 5, 6, 7];
      if (!tz || ms === undefined || !Array.isArray(days) || days.length === 0
        || days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) return undefined;
      return empty ? [] : walkDays(tz, lo, hi, limit, (day) => days.includes(isoDow(day)), [ms]);
    }
    case 'cron': {
      const tz = zoneOf(entry.timeZone); const c = parseCron(entry.expression);
      if (!tz || !c) return undefined;
      return empty ? [] : walkDays(tz, lo, hi, limit, c.match, c.times);
    }
    case 'rrule': {
      const r = parseRRule(entry.rrule);
      if (!r) return undefined;
      return empty ? [] : rruleRuns(r, lo, hi, limit);
    }
    default: return undefined;
  }
}

/**
 * The first run strictly after `at` (searching up to 400 years ahead).
 * @param {object} entry - catalog entry of the app's scheduler.
 * @param {number} at - epoch ms.
 * @returns {number | undefined} epoch ms, or undefined when there is none or the rule is not understood.
 */
export function nextAfter(entry, at) {
  return occurrences(entry, at, Number(at) + HORIZON, { max: 1 })?.[0];
}

// ---- plain words ------------------------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0');
const clock = (ms) => { const s = Math.floor(ms / 1000); return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}${s % 60 ? `:${pad(s % 60)}` : ''}`; };
const nth = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'));
const join = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);
const named = (locale, opts, ms) => new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(ms);
const dayName = (iso, locale) => named(locale, { weekday: 'long' }, Date.UTC(2024, 0, iso)); // 2024-01-01 was a Monday
const unitText = (n, unit) => (n === 1 ? `Every ${unit}` : `Every ${n} ${unit}s`);
const ORDINAL = { 1: 'first', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', '-1': 'last', '-2': 'second-to-last' };

/** "Every Monday and Thursday", "Every weekday", "Every day" from ISO weekdays. */
function daysText(isoDays, locale) {
  const d = [...new Set(isoDays)].sort();
  if (d.length === 7) return 'Every day';
  if (d.join() === '1,2,3,4,5') return 'Every weekday';
  return `Every ${join(d.map((x) => dayName(x, locale)))}`;
}

/** "Mon 17 Nov at 09:00" in a zone; the year is added when it is not the current one. */
function whenText(epoch, tz, locale) {
  const wall = wallOf(epoch, tz); const day = Math.floor(wall / DAY); const { y } = ymd(day);
  const date = `${named(locale, { weekday: 'short' }, day * DAY)} ${ymd(day).d} ${named(locale, { month: 'short' }, day * DAY)}`;
  return `${date}${y === ymd(Math.floor(wallOf(Date.now(), tz) / DAY)).y ? '' : ` ${y}`} at ${clock(wall - day * DAY)}`;
}

/** "08:30" or "09:00 and 15:00" for up to four times; undefined for more. */
const timesText = (times) => (times.length > 0 && times.length <= 4 ? join(times.map(clock)) : undefined);

function cronText(c, locale) {
  const { mi, h, dom, dow } = c;
  if (c.mon.text !== '*') return undefined;
  const step = (f) => /^\*\/(\d+)$/.exec(f.text)?.[1];
  if (dom.text === '*' && dow.text === '*') {
    if (h.text === '*' && mi.text === '*') return 'Every minute';
    if (h.text === '*' && step(mi) && 60 % step(mi) === 0) return unitText(+step(mi), 'minute');
    if (h.text === '*' && mi.values.size === 1) return mi.values.has(0) ? 'Every hour' : `Every hour at ${[...mi.values][0]} minutes past`;
    if (step(h) && 24 % step(h) === 0 && mi.values.size === 1 && mi.values.has(0)) return unitText(+step(h), 'hour');
  }
  const times = mi.star ? undefined : timesText(c.times);
  if (!times) return undefined;
  if (dom.text === '*' && dow.text === '*') return `Every day at ${times}`;
  if (dom.text === '*' && !dow.star) return `${daysText([...dow.values].map((d) => d || 7), locale)} at ${times}`;
  if (dow.text === '*' && !dom.star && dom.values.size <= 3) {
    return `On the ${join([...dom.values].sort((a, b) => a - b).map(nth))} of every month at ${times}`;
  }
  return undefined;
}

function rruleText(r, locale) {
  const n = r.interval;
  if (r.freq === 'MINUTELY' || r.freq === 'HOURLY') return unitText(n, r.freq === 'MINUTELY' ? 'minute' : 'hour');
  const times = timesText(r.times);
  if (!times || r.BYSETPOS || (r.BYMONTH && r.freq !== 'YEARLY')) return undefined;
  let text;
  if (r.freq === 'DAILY') text = r.BYDAY ? (n === 1 ? daysText(r.BYDAY.map((b) => b.wd), locale) : undefined) : unitText(n, 'day');
  else if (r.freq === 'WEEKLY') {
    const wds = r.BYDAY.map((b) => b.wd);
    text = n === 1 ? daysText(wds, locale) : `Every ${n} weeks on ${join([...new Set(wds)].sort().map((d) => dayName(d, locale)))}`;
  } else if (r.freq === 'MONTHLY') {
    const every = n === 1 ? 'every month' : `every ${n} months`;
    if (r.BYMONTHDAY && !r.BYDAY && r.BYMONTHDAY.length <= 3) {
      text = `On the ${join(r.BYMONTHDAY.map((d) => (d === -1 ? 'last day' : d > 0 ? nth(d) : undefined)))} of ${every}`;
      if (r.BYMONTHDAY.some((d) => d < -1)) text = undefined;
    } else if (r.BYDAY?.length === 1 && r.numbered && !r.BYMONTHDAY && ORDINAL[r.BYDAY[0].n]) {
      text = `The ${ORDINAL[r.BYDAY[0].n]} ${dayName(r.BYDAY[0].wd, locale)} of ${every}`;
    }
  } else if (n === 1 && r.BYMONTH?.length === 1 && r.BYMONTHDAY?.length === 1 && r.BYMONTHDAY[0] > 0 && !r.BYDAY) {
    text = `Every year on ${r.BYMONTHDAY[0]} ${named(locale, { month: 'long' }, Date.UTC(2024, r.BYMONTH[0] - 1, 1))}`;
  }
  return text && `${text} at ${times}`;
}

/**
 * A task's rule in short plain English, for example "Every day at 08:30" or "Every Monday and
 * Thursday at 09:00 (Europe/Paris time)". The zone is named only when it differs from the local one.
 * @param {object} entry - catalog entry of the app's scheduler.
 * @param {{locale?: string, localZone?: string}} [options] - `locale` for day and month names
 *   (default 'en-US'); `localZone` to compare with (default: this process's zone).
 * @returns {string} the description; "Rule: <expression>" or "Custom rule: <RRULE parts>" when
 *   a cron or RRULE form has no plain wording.
 */
export function describe(entry, { locale = 'en-US', localZone } = {}) {
  const here = zoneOf(localZone) ?? processZone();
  const zoned = (text, tz) => (tz && tz !== here ? `${text} (${tz} time)` : text);
  const at = parseIso(entry?.scheduledAt);
  switch (entry?.kind) {
    case 'at':
      return Number.isFinite(at) ? `Once, on ${whenText(at, here, locale)}` : 'Once';
    case 'after': {
      const s = Number(entry.afterSeconds);
      const [v, unit] = [[86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']]
        .map(([k, u]) => [s / k, u]).find(([x]) => Number.isInteger(x)) ?? [s, 'second'];
      const delay = `${v} ${unit}${v === 1 ? '' : 's'}`;
      return `Once, ${delay} after it was created${Number.isFinite(at) ? `, on ${whenText(at, here, locale)}` : ''}`;
    }
    case 'every': {
      const s = Number(entry.everySeconds);
      const [k, u] = [[86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']].find(([x]) => s % x === 0) ?? [1, 'second'];
      return unitText(s / k, u);
    }
    case 'daily': case 'weekly': {
      const ms = clockMs(entry.time); const tz = zoneOf(entry.timeZone);
      if (ms === undefined) return 'Unknown schedule';
      const days = entry.kind === 'daily' ? 'Every day' : daysText(Array.isArray(entry.weekdays) ? entry.weekdays : [], locale);
      return zoned(`${days} at ${clock(ms)}`, tz);
    }
    case 'cron': {
      const c = parseCron(entry.expression); const text = c && cronText(c, locale);
      return text ? zoned(text, /^Every (minute|hour|\d+ (minutes|hours))$/.test(text) ? undefined : zoneOf(entry.timeZone))
        : `Rule: ${entry.expression}`;
    }
    case 'rrule': {
      const r = parseRRule(entry.rrule);
      const line = String(entry.rrule ?? '').split('\n').map((l) => l.trim()).find((l) => l.startsWith('RRULE:')) ?? String(entry.rrule ?? '');
      if (!r) return `Custom rule: ${line.replace(/^RRULE:/, '')}`;
      if (r.count === 1) {
        const first = rruleRuns(r, -Infinity, MAX_MS, 1)[0];
        if (first !== undefined) return `Once, on ${whenText(first, here, locale)}`;
      }
      const text = rruleText(r, locale);
      if (!text) return `Custom rule: ${line.replace(/^RRULE:/, '')}`;
      const end = r.count ? `, ${r.count} times` : r.until !== undefined ? `, until ${whenText(r.until, r.tz, locale).replace(/ at .*$/, '')}` : '';
      return zoned(text + end, r.freq === 'MINUTELY' || r.freq === 'HOURLY' ? undefined : r.tz);
    }
    default: return 'Unknown schedule';
  }
}
