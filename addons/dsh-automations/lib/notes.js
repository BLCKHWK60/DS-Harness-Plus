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

/** Stage 7 (point 29): whether an automation runs only once (a time, a delay, or a rule that repeats once). */
export function isOnce(entry) {
  if (entry?.kind === 'at' || entry?.kind === 'after') return true;
  return entry?.kind === 'rrule' && /(^|[;:\s])COUNT=1(;|\s|$)/.test(String(entry.rrule ?? ''));
}

/**
 * Stage 7 (point 29): a one-time automation that ended with no recorded run stays on the page as "Did not start" until
 * the owner deletes it. Other ended automations keep today's behaviour (hidden when nothing was recorded).
 * @param {object} entry - the app's catalog entry.
 * @param {{note?: object, hasRun?: boolean, held?: boolean, ranSince?: number, keepDays?: number, now?: number, closedAt?: (time: number) => boolean}} facts -
 *   its notes; whether a run of it is in the list (a held run, where nothing ran, does not count); whether a held run of it is; since when recorded runs mark it; its keep rule's days (0: no limit);
 *   the time now; whether Automations was not running at a time (its beat stopped).
 * @returns {{reason: string, at?: number} | null} why (a key: 'automationsOff', a pause reason, or 'unknown') and when it
 *   was due; null when it is not such an automation.
 */
export function didNotStart(entry, { note = {}, hasRun = false, held = false, ranSince = 0, keepDays = 31, now = Date.now(), closedAt = () => false, threadHeld = () => false } = {}) {
  if (!entry || entry.status !== 'ended' || !isOnce(entry) || hasRun || note.ran === true) return null;
  // Stage 7 lab (bug C): the app delivered it to a thread and nothing held it: it ran (shown by ranUnrecorded instead).
  if (ranSign(entry, { note, held, threadHeld })) return null;
  const delivered = Date.parse(String(entry.lastDelivery?.deliveredAt ?? ''));
  const scheduled = Date.parse(String(entry.scheduledAt ?? ''));
  const at = Number.isFinite(delivered) ? delivered : Number.isFinite(scheduled) ? scheduled : undefined;
  // Before runs marked their automation, a run may have left the list by age: past its keep time, stay as today (hidden).
  const marked = at !== undefined && at >= ranSince;
  if (!marked && (at === undefined || (keepDays > 0 && now - at > keepDays * 24 * 60 * 60 * 1000))) return null;
  let reason = 'unknown';
  if (Number.isFinite(delivered) && closedAt(delivered)) reason = 'automationsOff';
  else if (PAUSE_REASONS.includes(note.pauseReason)) reason = note.pauseReason;
  else if (held) reason = 'held';
  return at === undefined ? { reason } : { reason, at };
}

/**
 * Stage 7 lab (bug C): signs that the app ran a delivery of an automation: a delivery receipt (the app wrote the message
 * into a thread) with a known thread, and nothing held it (no held run, no pause of the add-on's, its thread not held).
 * @returns {{at: number, sessionId: string} | null}
 */
function ranSign(entry, { note = {}, held = false, threadHeld = () => false } = {}) {
  const delivered = Date.parse(String(entry?.lastDelivery?.deliveredAt ?? ''));
  if (!Number.isFinite(delivered)) return null;
  const sessionId = String(entry.lastDelivery?.targetSessionId ?? entry.target?.sessionId ?? '');
  if (!sessionId) return null;
  if (held || PAUSE_REASONS.includes(note.pauseReason)) return null;
  let heldThread = true;
  try {
    heldThread = threadHeld(sessionId) === true;
  } catch {
    heldThread = true;
  }
  return heldThread ? null : { at: delivered, sessionId };
}

/**
 * Stage 7 lab (bug C): a one-time automation the app ran with no run recorded here (most often: the Automations add-on was
 * off then, so the app's own scheduler ran it alone). It is listed like an ended automation that ran, for as long as its
 * keep rule would have kept that run.
 * @param {object} entry - the app's catalog entry.
 * @param {{note?: object, hasRun?: boolean, held?: boolean, keepDays?: number, now?: number, closedAt?: (time: number) => boolean, threadHeld?: (sessionId: string) => boolean}} facts -
 *   as for didNotStart; `threadHeld`: whether a thread's run was held (nothing ran in it).
 * @returns {{at: number, sessionId: string, off: boolean} | null} when it was delivered, its thread, and whether
 *   Automations was off then; null when it is not such an automation.
 */
export function ranUnrecorded(entry, { note = {}, hasRun = false, held = false, keepDays = 31, now = Date.now(), closedAt = () => false, threadHeld = () => false } = {}) {
  if (!entry || entry.status !== 'ended' || !isOnce(entry) || hasRun || note.ran === true) return null;
  const sign = ranSign(entry, { note, held, threadHeld });
  if (!sign) return null;
  if (keepDays > 0 && now - sign.at > keepDays * 24 * 60 * 60 * 1000) return null;
  let off = false;
  try {
    off = closedAt(sign.at) === true;
  } catch {
    off = false;
  }
  return { ...sign, off };
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
/** Item 4A, stage 6b (J9, J17): a pause caused by a space, told apart from a mode-gone pause (a mode id). */
const SPACE_PAUSE_RE = /^space:(devices|workshop|recon)$/;
const pauseId = (value) => (TAB_RE.test(String(value ?? '')) || SPACE_PAUSE_RE.test(String(value ?? '')) ? String(value) : '');
/** Stage 6b: the spaces a run may be stored in (never Recon: "this thread only", D9), and the five a thread can be in. */
const RUN_SPACE_IDS = ['chat', 'code', 'devices', 'workshop'];
const SPACE_IDS = ['chat', 'code', 'devices', 'recon', 'workshop'];
const THREAD_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
/** Stage 6b: why a space paused an automation (the page's sentence picks its words by it). */
const PAUSE_REASONS = ['devicesOff', 'devicesOld', 'workshopOff', 'workshopOld', 'unticked', 'unavailable', 'unknown', 'automationsOff', 'modesOld', 'held'];

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
  // Stage 7 (point 29): since when a recorded run marks its automation (`ran`), so a one-time automation with no mark
  // is known to have had no run, even after old runs left the list. Set once, the first time these notes are opened.
  const ranSince = Number.isFinite(read.ranSince) ? read.ranSince : Date.now();
  const save = () => writeJson(file, { tasks, known, held, ranSince });
  // Kept at once, so a restart before any other change does not move the time forward.
  if (!Number.isFinite(read.ranSince)) {
    try {
      save();
    } catch {
      // Not writable now: the next change saves it.
    }
  }
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
     * @param {(entry: object) => string | {createdIn: string, createdSpace?: string, createdBy?: string}} createdIn - the
     *   tab a new one was created in ('' when not known); stage 6b: or `{createdIn, createdSpace, createdBy}`.
     */
    take(catalog, createdIn) {
      const change = diffCatalog(known, catalog);
      for (const entry of change.added) {
        const note = noteOf(String(entry.id));
        if (note.createdIn !== undefined) continue;
        const said = createdIn(entry);
        if (said && typeof said === 'object') {
          note.createdIn = TAB_RE.test(String(said.createdIn ?? '')) ? String(said.createdIn) : '';
          if (note.createdSpace === undefined && SPACE_IDS.includes(said.createdSpace)) note.createdSpace = said.createdSpace;
          if (note.createdBy === undefined && THREAD_RE.test(String(said.createdBy ?? ''))) note.createdBy = String(said.createdBy);
        } else note.createdIn = said || '';
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
     * Item 6: the tab an automation's new threads open in. Written only by the clock button, New on the Automations
     * page, or a change of "Runs in" there; '' takes it away. Automations the assistant or Finance made have none.
     */
    setRunTab(id, tab) {
      const note = noteOf(String(id));
      if (tab === '' || tab === null || tab === undefined) delete note.runTab;
      else if (TAB_RE.test(String(tab))) note.runTab = String(tab);
      else return;
      save();
    },
    /**
     * Item 4A, stage 6b (J6): the space an automation's new threads open in (with `runTab`, its run place). Written only by
     * the clock button, New, Change under "Runs in", and the assistant's schedule tools in a guest thread. One of chat,
     * code, devices, workshop (never Recon); '' takes it away.
     */
    setRunSpace(id, space) {
      const note = noteOf(String(id));
      if (space === '' || space === null || space === undefined) {
        if (note.runSpace === undefined) return;
        delete note.runSpace;
      } else if (RUN_SPACE_IDS.includes(space)) note.runSpace = space;
      else return;
      save();
    },
    /** Stage 6b: the space the thread it was made from is in (any of the five; '' takes it away). */
    setCreatedSpace(id, space) {
      const note = noteOf(String(id));
      if (space === '' || space === null || space === undefined) {
        if (note.createdSpace === undefined) return;
        delete note.createdSpace;
      } else if (SPACE_IDS.includes(space)) note.createdSpace = space;
      else return;
      save();
    },
    /** Stage 6b (J15): the thread it was made from (a thread id; '' takes it away). */
    setCreatedBy(id, sessionId) {
      const note = noteOf(String(id));
      if (sessionId === '' || sessionId === null || sessionId === undefined) {
        if (note.createdBy === undefined) return;
        delete note.createdBy;
      } else if (THREAD_RE.test(String(sessionId))) note.createdBy = String(sessionId);
      else return;
      save();
    },
    /** Stage 6b (J8): a stored Chat or Code place whose mode is no longer offered there ('unticked') or is hidden. */
    setPlaceNote(id, kind) {
      const note = noteOf(String(id));
      if (kind === 'unticked' || kind === 'hidden') {
        if (note.placeNote === kind) return;
        note.placeNote = kind;
      } else if (note.placeNote !== undefined) delete note.placeNote;
      else return;
      save();
    },
    /** Stage 7 (point 29): a run of this automation was recorded (kept even when the run leaves the list). */
    markRan(id) {
      const note = noteOf(String(id));
      if (note.ran === true) return;
      note.ran = true;
      save();
    },
    /** @returns {number} since when `markRan` marks every recorded run (earlier runs may have left the list unmarked). */
    ranSince: () => ranSince,
    /** Stage 6b: why a space paused it (PAUSE_REASONS), for the page's sentence; '' takes it away. */
    setPauseReason(id, reason) {
      const note = noteOf(String(id));
      if (PAUSE_REASONS.includes(reason)) {
        if (note.pauseReason === reason) return;
        note.pauseReason = reason;
      } else if (note.pauseReason !== undefined) delete note.pauseReason;
      else return;
      save();
    },
    /**
     * Item 6: how Plus made an automation ('button' or 'new'), so the tab-gone guard knows which tab to watch. Stage 6b:
     * also 'tool' (the assistant's schedule tools in a guest thread in Devices or Workshop).
     */
    setMade(id, how) {
      if (how !== 'button' && how !== 'new' && how !== 'tool') return;
      noteOf(String(id)).made = how;
      save();
    },
    /** Item 6: paused because its tab was switched off (the tab's id), or '' when that no longer holds. */
    setPausedFor(id, tab) {
      const note = noteOf(String(id));
      // Stage 6b: also 'space:<id>' (a space that cannot run it now).
      if (tab && pauseId(tab)) note.pausedFor = String(tab);
      else if (note.pausedFor !== undefined) delete note.pausedFor;
      else return;
      save();
    },
    /**
     * Item 6: it was paused while its tab was off, and that tab is on again (the tab's id); it stays paused until the
     * owner resumes or changes it, and the note says why. '' takes the note away.
     */
    setPausedBack(id, tab) {
      const note = noteOf(String(id));
      if (tab && pauseId(tab)) note.pausedBack = String(tab);
      else if (note.pausedBack !== undefined) delete note.pausedBack;
      else return;
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
