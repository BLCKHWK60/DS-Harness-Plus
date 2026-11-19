/**
 * What this add-on keeps about each automation beyond the app's own task list (Automations part):
 * - when the app was running (a heartbeat), so a late run can say "when the app opened" (A2) and
 *   the times missed while it was closed can be listed (A3);
 * - the tab each automation was created in (A4), its own alert choices (A17) and keep rule (A11);
 * - a recipe of every automation, so one deleted anywhere can be put back from the trash (A10).
 * Plain functions and small JSON files, so they can be tested without the app.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readJsonStore } from './json-store.js';

/** The heartbeat is written this often; a longer silence means the app was closed (or the Mac slept). */
export const BEAT_MS = 60 * 1000;
const GAP_MS = 2.5 * BEAT_MS;
const GAPS_MAX = 60;
const GAP_DAYS = 31;
const PROMPT_MAX = 60000;

const readJson = (file, fallback) => {
  if (!file) return fallback;
  // A damaged file is kept aside (review H4), never read as empty and written over.
  return readJsonStore(file, () => fallback, { label: 'what Automations kept', valid: (value) => value && typeof value === 'object' && !Array.isArray(value) });
};
const writeJson = (file, value) => {
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  renameSync(temp, file);
};

/**
 * The heartbeat: the times the app was closed, as gaps between beats.
 * @param {string} file - JSON file; '' keeps it in memory.
 * @param {number} [now] - the time the add-on starts.
 */
export function openAlive(file, now = Date.now()) {
  const read = readJson(file, {});
  let gaps = (Array.isArray(read.gaps) ? read.gaps : []).filter((gap) => Number.isFinite(gap?.from) && Number.isFinite(gap?.to) && gap.to > gap.from);
  const last = Number(read.beat);
  // A silence longer than a few beats: the app was closed (or the Mac asleep) from the last beat until now.
  if (Number.isFinite(last) && now - last > GAP_MS) gaps.push({ from: last, to: now });
  gaps = gaps.filter((gap) => now - gap.to <= GAP_DAYS * 24 * 60 * 60 * 1000).slice(-GAPS_MAX);
  const save = (at) => writeJson(file, { beat: at, gaps });
  save(now);
  return {
    /** Write a beat now. */
    beat: (at = Date.now()) => save(at),
    /** @returns {{from: number, to: number}[]} times the app was not running, oldest first. */
    gaps: () => gaps.map((gap) => ({ ...gap })),
    /** @returns {boolean} whether a time falls in a gap (the app was closed then). */
    closedAt: (time) => gaps.some((gap) => time > gap.from - BEAT_MS && time <= gap.to),
    /** @returns {number | undefined} the end of the gap a time falls in (the app opened then). */
    openedAfter: (time) => gaps.find((gap) => time > gap.from - BEAT_MS && time <= gap.to)?.to,
  };
}

/**
 * The timing request that makes an automation again, from its stored record (put back, A10).
 * @param {object} entry - a catalog entry of the app's scheduler.
 * @param {number} [now] - the current time.
 * @returns {object | undefined} the `timing` of `schedule.create`; undefined when it cannot be made again (a time passed).
 */
export function timingOf(entry, now = Date.now()) {
  const zone = String(entry?.timeZone ?? '');
  switch (entry?.kind) {
    case 'after':
    case 'at': {
      const at = Date.parse(String(entry.scheduledAt ?? ''));
      return Number.isFinite(at) && at > now + 60000 ? { kind: 'at', at: new Date(at).toISOString() } : undefined;
    }
    case 'every':
      return Number.isSafeInteger(entry.everySeconds) ? { kind: 'every', every_seconds: entry.everySeconds } : undefined;
    case 'daily':
      return entry.time && zone ? { kind: 'daily', daily: { time: String(entry.time), time_zone: zone } } : undefined;
    case 'weekly':
      return entry.time && zone && Array.isArray(entry.weekdays) ? { kind: 'weekly', weekly: { time: String(entry.time), time_zone: zone, weekdays: [...entry.weekdays] } } : undefined;
    case 'cron':
      return entry.expression && zone ? { kind: 'cron', cron: { expression: String(entry.expression), time_zone: zone } } : undefined;
    case 'rrule':
      return entry.rrule ? { kind: 'rrule', rrule: String(entry.rrule) } : undefined;
    default:
      return undefined;
  }
}

/** The destination request from a stored target. */
export function targetOf(target) {
  const create = target?.create && typeof target.create === 'object'
    ? Object.fromEntries(['cwd', 'agentPreset'].filter((key) => typeof target.create[key] === 'string' && target.create[key]).map((key) => [key, target.create[key]]))
    : {};
  if (target?.kind === 'session' && target.sessionId) return { kind: 'session', sessionId: String(target.sessionId) };
  if (target?.kind === 'new') return { kind: 'new', create };
  return { kind: 'new_once', create };
}

/**
 * What is kept of an automation so it can be made again: its record and destination (not its delivery list).
 * @param {object} entry - a catalog entry.
 * @returns {object | undefined} the recipe; undefined for an ended task (it would never run again).
 */
export function recipeOf(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id || entry.status === 'ended') return undefined;
  const keep = ['kind', 'title', 'scheduledAt', 'afterSeconds', 'everySeconds', 'time', 'timeZone', 'weekdays', 'expression', 'rrule'];
  const record = Object.fromEntries(keep.filter((key) => entry[key] !== undefined).map((key) => [key, entry[key]]));
  return {
    id: String(entry.id),
    ...record,
    prompt: String(entry.prompt ?? '').slice(0, PROMPT_MAX),
    target: entry.target ? JSON.parse(JSON.stringify(entry.target)) : undefined,
    status: String(entry.status ?? 'active'),
    involved: Array.isArray(entry.involvedSessionIds) ? entry.involvedSessionIds.slice(0, 20).map(String) : [],
  };
}

/**
 * Which automations came and went between two looks at the app's list.
 * @param {Record<string, object>} known - id -> recipe, from the last look.
 * @param {object[]} catalog - the app's list now.
 * @returns {{added: object[], removed: object[]}} new entries, and recipes of those gone.
 */
export function diffCatalog(known, catalog) {
  const now = new Set(catalog.map((entry) => String(entry?.id)));
  return {
    added: catalog.filter((entry) => entry?.id && !Object.hasOwn(known, String(entry.id))),
    removed: Object.values(known).filter((recipe) => recipe?.id && !now.has(recipe.id)),
  };
}

/** The time between two runs of an automation, when its rule says it simply; undefined otherwise. */
export function everyOf(entry) {
  const day = 24 * 60 * 60 * 1000;
  switch (entry?.kind) {
    case 'every':
      return Number(entry.everySeconds) * 1000;
    case 'daily':
      return day;
    case 'weekly':
      return (7 * day) / Math.max(1, Array.isArray(entry.weekdays) ? entry.weekdays.length : 1);
    case 'rrule': {
      const freq = /FREQ=(\w+)/.exec(String(entry.rrule))?.[1];
      const interval = Number(/INTERVAL=(\d+)/.exec(String(entry.rrule))?.[1] ?? 1);
      const unit = { MINUTELY: 60000, HOURLY: 3600000, DAILY: day, WEEKLY: 7 * day, MONTHLY: 30 * day, YEARLY: 365 * day }[freq];
      return unit ? unit * interval : undefined;
    }
    case 'cron': {
      const [minute, hour, dom, month, dow] = String(entry.expression ?? '').trim().split(/\s+/);
      if (month !== '*') return 365 * day;
      if (dom !== '*') return 30 * day;
      if (dow !== '*') return 7 * day;
      if (hour !== '*' && !hour?.includes('/')) return day;
      if (minute !== '*' && !minute?.includes('/')) return 3600000;
      return 60000;
    }
    default:
      return undefined;
  }
}

const TAB_RE = /^[a-z0-9][a-z0-9_-]{0,127}$/;

/**
 * Per-automation notes: created-in tab, own alerts, own keep rule, and the recipes of all of them.
 * @param {string} file - JSON file; '' keeps them in memory.
 */
export function openNotes(file) {
  const read = readJson(file, {});
  const tasks = read.tasks && typeof read.tasks === 'object' ? read.tasks : {};
  let known = read.known && typeof read.known === 'object' ? read.known : {};
  // Deleted automations the trash could not take yet (it was off or starting), kept until it can.
  let held = Array.isArray(read.held) ? read.held.filter((recipe) => recipe?.id).slice(-200) : [];
  const save = () => writeJson(file, { tasks, known, held });
  const noteOf = (id) => tasks[id] ?? (tasks[id] = {});
  return {
    /** @returns {object} the notes of one automation (a copy). */
    get: (id) => ({ ...(tasks[String(id)] ?? {}) }),
    /** Hold a deleted automation until the trash can take it. */
    hold(recipe) {
      if (!recipe?.id) return;
      held = [...held.filter((item) => item.id !== recipe.id), recipe].slice(-200);
      save();
    },
    /** The trash took it. */
    release(id) {
      const before = held.length;
      held = held.filter((item) => item.id !== id);
      if (held.length !== before) save();
    },
    /** @returns {object[]} the deleted automations still waiting for the trash. */
    held: () => held.map((item) => ({ ...item })),
    /** @returns {Record<string, object>} the recipes seen at the last look. */
    known: () => known,
    /**
     * Take the app's list in: returns what came and went, and remembers the recipes.
     * @param {object[]} catalog - the app's list.
     * @param {(entry: object) => string} createdIn - the tab a new one was created in ('' when not known).
     */
    take(catalog, createdIn) {
      const change = diffCatalog(known, catalog);
      for (const entry of change.added) {
        const note = noteOf(String(entry.id));
        if (note.createdIn === undefined) note.createdIn = createdIn(entry) || '';
      }
      const next = {};
      for (const entry of catalog) {
        const recipe = recipeOf(entry);
        if (recipe) next[recipe.id] = recipe;
      }
      // A removed one takes its notes along (its tab, own alerts and keep rule), for the trash and Put back.
      const removed = change.removed.map((recipe) => ({ ...recipe, note: { ...(tasks[recipe.id] ?? {}) } }));
      for (const recipe of removed) delete tasks[recipe.id];
      known = next;
      save();
      return { added: change.added, removed };
    },
    /** Set the tab an automation was created in (one made by Plus itself, or put back). */
    setCreatedIn(id, tab) {
      if (!TAB_RE.test(String(tab ?? ''))) return;
      noteOf(String(id)).createdIn = String(tab);
      save();
    },
    /**
     * An automation's own alert choices (A17): each true, false, or absent for the global setting.
     * @param {string} id - the automation.
     * @param {{failed?: boolean|null, needs?: boolean|null, finished?: boolean|null}} alerts
     */
    setAlerts(id, alerts) {
      const note = noteOf(String(id));
      const own = {};
      for (const key of ['failed', 'needs', 'finished']) if (typeof alerts?.[key] === 'boolean') own[key] = alerts[key];
      if (Object.keys(own).length > 0) note.alerts = own;
      else delete note.alerts;
      save();
    },
    /**
     * An automation's own keep rule (A11): days and runs, 0 for no limit; null for the starting values.
     * @param {string} id - the automation.
     * @param {{days: number, count: number} | null} keep
     */
    setKeep(id, keep) {
      const note = noteOf(String(id));
      if (keep === null || keep === undefined) delete note.keep;
      else {
        const days = Math.min(3650, Math.max(0, Math.floor(Number(keep.days) || 0)));
        const count = Math.min(1000, Math.max(0, Math.floor(Number(keep.count) || 0)));
        note.keep = { days, count };
      }
      save();
    },
  };
}
