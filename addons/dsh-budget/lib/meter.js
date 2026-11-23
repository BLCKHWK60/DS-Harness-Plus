/**
 * Counting for the budget guard: how much one task has used, and whether it has reached a limit.
 * A "task" is one turn of a conversation (everything the assistant does after one message), with
 * the work of its helper agents counted in. Kept apart from the plugin so it can be tested
 * without the app.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readJsonStore } from './json-store.js';

/** Tasks remembered for "your biggest recent task", and for how long. */
export const RECENT_MAX = 300;
export const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
/** Stops remembered for the page and the cards under answers. */
export const STOPS_MAX = 50;

const LIMITS = ['steps', 'helperSteps', 'tokens', 'minutes', 'repeats', 'day'];

function whole(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The built-in values of the limits that have allowances (index.js's Config uses the same). A value that differs from these
 * was saved by the user and is never overridden by an allowance; a value that equals them is "not chosen", so the allowance
 * of a Mission (or of helpers) may replace it.
 */
export const DEFAULTS = { maxSteps: 300, maxHelperSteps: 1500, maxLongSteps: 5000, maxLongTokens: 60000000, maxTokens: 20000000 };

/**
 * Limits as plain whole numbers; 0 means no limit.
 * @param {object} raw - the settings.
 * `maxSteps` counts the conversation's own requests. Helpers (Deep research, Mission and other helper
 * agents) have their own count, `maxHelperSteps`; 0 there means "no separate allowance": helpers share
 * `maxSteps`, as before 0.63. With `maxSteps` at 0 (no step limit) helpers are not limited either.
 * While a Mission is on in the conversation (`long` in `check`), `maxLongSteps` (all requests,
 * helpers included) and `maxLongTokens` replace the step and token limits: a Mission is meant to work
 * for hours, and Mission has its own limits (time, laps, steps, an optional token allowance). 0 there
 * means "use the ordinary limit"; the ordinary limit at 0 (none) stays none.
 * @returns {{enabled: boolean, maxSteps: number, maxHelperSteps: number, maxLongSteps: number, maxLongTokens: number, maxTokens: number, maxMinutes: number, maxRepeats: number, dayTokens: number}} checked limits.
 */
export function readLimits(raw = {}) {
  return {
    enabled: raw.enabled !== false,
    maxSteps: whole(raw.maxSteps),
    maxHelperSteps: whole(raw.maxHelperSteps),
    maxLongSteps: whole(raw.maxLongSteps),
    maxLongTokens: whole(raw.maxLongTokens),
    maxTokens: whole(raw.maxTokens),
    /** The token limit is the installer's starting value, never saved by the user: a Mission's allowance may replace it. */
    startingTokens: raw.startingTokens === true,
    maxMinutes: whole(raw.maxMinutes),
    maxRepeats: whole(raw.maxRepeats),
    dayTokens: whole(raw.dayTokens),
  };
}

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * The small record kept on disk: today's total, recent task sizes and recent stops.
 * @param {string} file - JSON file; '' keeps everything in memory.
 * @returns {object} the record.
 */
export function openRecord(file) {
  let data = { day: '', dayTokens: 0, recent: [], stops: [] };
  if (file) {
    // A damaged file is kept aside (review H4); a new one starts empty.
    const read = readJsonStore(file, () => undefined, { label: 'the Budget record', valid: (value) => value && typeof value === 'object' && !Array.isArray(value) });
    if (read) {
      data = {
        day: typeof read.day === 'string' ? read.day : '',
        dayTokens: whole(read.dayTokens),
        recent: Array.isArray(read.recent) ? read.recent : [],
        stops: Array.isArray(read.stops) ? read.stops : [],
      };
    }
  }
  let dirty = false;
  const roll = (now) => {
    const today = dayKey(now);
    if (data.day !== today) data = { ...data, day: today, dayTokens: 0 };
  };
  return {
    addTokens(tokens, now) {
      roll(now);
      data.dayTokens += whole(tokens);
      dirty = true;
    },
    today(now) {
      roll(now);
      return data.dayTokens;
    },
    addTask(task, now) {
      data.recent = [...data.recent, { at: now, steps: whole(task.steps), helperSteps: whole(task.helperSteps), tokens: whole(task.tokens), minutes: Math.round((Number(task.ms) || 0) / 60000) }]
        .filter((t) => now - t.at < RECENT_MS).slice(-RECENT_MAX);
      dirty = true;
    },
    addStop(stop) {
      data.stops = [...data.stops, stop].slice(-STOPS_MAX);
      dirty = true;
    },
    /** @returns {{count: number, steps: number, helperSteps: number, tokens: number, minutes: number}} the largest of each over the recent tasks. */
    biggest(now) {
      const recent = data.recent.filter((t) => now - t.at < RECENT_MS && (t.steps > 0 || t.helperSteps > 0));
      return {
        count: recent.length,
        steps: Math.max(0, ...recent.map((t) => t.steps)),
        helperSteps: Math.max(0, ...recent.map((t) => whole(t.helperSteps))),
        tokens: Math.max(0, ...recent.map((t) => t.tokens)),
        minutes: Math.max(0, ...recent.map((t) => t.minutes)),
      };
    },
    stops: () => [...data.stops].reverse(),
    flush() {
      if (!dirty || !file) return;
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(data));
      renameSync(temp, file);
      dirty = false;
    },
  };
}

/**
 * The meter.
 * @param {object} deps - what it needs.
 * @param {() => object} deps.limits - current limits, from `readLimits`.
 * @param {object} deps.record - from `openRecord`.
 * @param {() => number} [deps.now] - the clock.
 * @returns {object} the meter.
 */
export function createMeter({ limits, record, now = Date.now }) {
  /** Conversation id -> the running task's counts. */
  const tasks = new Map();
  const task = (id) => {
    if (!tasks.has(id)) tasks.set(id, { steps: 0, helperSteps: 0, tokens: 0, startedAt: now(), repeated: null, last: new Map(), stopped: null });
    return tasks.get(id);
  };

  /**
   * The step limit that applies and what it counts, as `{max, all}`: `all` when helpers' steps are added to the conversation's own.
   * Ordinary tasks: helpers have their own allowance (maxHelperSteps) only while the user left the step limit at its built-in value;
   * a step limit the user saved counts everything, unless they saved a helper limit of their own too.
   */
  const stepRule = (max, long) => {
    if (!max.maxSteps) return { max: 0, all: true };
    if (long) {
      // A Mission: all requests together, with its own allowance whatever step limit is saved for ordinary
      // tasks (the owner's decision of 19 November 2026: a saved 538 per task had capped whole runs). Never
      // below the ordinary limit; 0 for the allowance means the ordinary limit.
      return { max: max.maxLongSteps ? Math.max(max.maxLongSteps, max.maxSteps) : max.maxSteps, all: true };
    }
    return { max: max.maxSteps, all: false };
  };

  /** A Mission's token limit: its own allowance replaces the starting value, never a token limit the user saved. */
  const longTokens = (max) => {
    let tokens = max.maxTokens;
    if (max.maxTokens) {
      if (max.maxLongTokens && max.maxLongTokens !== DEFAULTS.maxLongTokens) tokens = Math.max(max.maxLongTokens, max.maxTokens);
      else if (max.maxLongTokens && (max.maxTokens === DEFAULTS.maxTokens || max.startingTokens)) tokens = Math.max(max.maxLongTokens, max.maxTokens);
    }
    return tokens;
  };

  /** What a task has reached, if anything. `run` is the Mission's whole-run count (`{steps, helperSteps, tokens}`) while a Mission works, else null. */
  const reached = (t, long = false, run = null) => {
    const max = limits();
    if (!max.enabled) return null;
    if (t.repeated) return t.repeated;
    const counts = long && run ? run : t;
    if (long) {
      const rule = stepRule(max, true);
      const all = counts.steps + counts.helperSteps;
      if (rule.max && all >= rule.max) return { limit: 'steps', used: all, max: rule.max };
      const tokens = longTokens(max);
      if (tokens && counts.tokens >= tokens) return { limit: 'tokens', used: counts.tokens, max: tokens };
      const minutes = Math.floor((now() - t.startedAt) / 60000);
      if (max.maxMinutes && minutes >= max.maxMinutes) return { limit: 'minutes', used: minutes, max: max.maxMinutes };
      const today = record.today(now());
      if (max.dayTokens && today >= max.dayTokens) return { limit: 'day', used: today, max: max.dayTokens };
      return null;
    }
    if (max.maxSteps) {
      // Helpers' own allowance: only where the step limit is the built-in one, or the user saved a helper limit too.
      const helperSaved = max.maxHelperSteps && max.maxHelperSteps !== DEFAULTS.maxHelperSteps;
      if (max.maxHelperSteps && (helperSaved || max.maxSteps === DEFAULTS.maxSteps)) {
        if (t.steps >= max.maxSteps) return { limit: 'steps', used: t.steps, max: max.maxSteps };
        const room = Math.max(max.maxHelperSteps, max.maxSteps);
        if (t.helperSteps >= room) return { limit: 'helperSteps', used: t.helperSteps, max: room };
      } else if (t.steps + t.helperSteps >= max.maxSteps) {
        return { limit: 'steps', used: t.steps + t.helperSteps, max: max.maxSteps };
      }
    }
    if (max.maxTokens && t.tokens >= max.maxTokens) return { limit: 'tokens', used: t.tokens, max: max.maxTokens };
    const minutes = Math.floor((now() - t.startedAt) / 60000);
    if (max.maxMinutes && minutes >= max.maxMinutes) return { limit: 'minutes', used: minutes, max: max.maxMinutes };
    const today = record.today(now());
    if (max.dayTokens && today >= max.dayTokens) return { limit: 'day', used: today, max: max.dayTokens };
    return null;
  };

  /** Conversation id -> the whole Mission's counts (across its rounds). */
  const runs = new Map();
  const runOf = (id, key, create) => {
    if (!key) return null;
    const have = runs.get(id);
    if (have && have.key === key) return have;
    if (!create) return null;
    const fresh = { key, steps: 0, helperSteps: 0, tokens: 0 };
    runs.set(id, fresh);
    return fresh;
  };

  return {
    /** A new message started a task: its allowance starts fresh. */
    startTask(id) {
      tasks.set(id, { steps: 0, helperSteps: 0, tokens: 0, startedAt: now(), repeated: null, last: new Map(), stopped: null });
    },
    /**
     * One request to a model, by the conversation or, with `helper` true, by one of its helpers.
     * @param {string} id - the conversation.
     * @param {boolean} [helper] - whether a helper agent made it.
     */
    step(id, helper = false, runKey = '') {
      task(id)[helper === true ? 'helperSteps' : 'steps'] += 1;
      const run = runOf(id, runKey, true);
      if (run) run[helper === true ? 'helperSteps' : 'steps'] += 1;
    },
    /** Tokens one request used. */
    usage(id, tokens, runKey = '') {
      const n = whole(tokens);
      task(id).tokens += n;
      const run = runOf(id, runKey, true);
      if (run) run.tokens += n;
      record.addTokens(n, now());
    },
    /**
     * A tool is about to run. The same call, repeated without anything else in between, is a loop.
     * @param {string} id - the conversation.
     * @param {string} agent - which agent calls (the conversation itself or a helper).
     * @param {string} name - tool name.
     * @param {unknown} args - its input.
     * @returns {string | undefined} a reason to refuse the call, when it is a loop.
     */
    tool(id, agent, name, args) {
      const max = limits();
      if (!max.enabled || !max.maxRepeats) return undefined;
      const t = task(id);
      let key = String(name);
      try {
        key += JSON.stringify(args ?? null);
      } catch {
        key += '?';
      }
      const last = t.last.get(agent);
      const count = last && last.key === key ? last.count + 1 : 1;
      t.last.set(agent, { key, count });
      if (count <= max.maxRepeats) return undefined;
      t.repeated = { limit: 'repeats', used: count, max: max.maxRepeats, tool: String(name) };
      return `Stopped by the budget guard: the same ${name} call was made ${count} times in a row.`;
    },
    /**
     * Whether the task may take another step.
     * @param {string} id - the conversation.
     * @param {boolean | string} [long] - the id of the Mission working in it right now (it has its own allowance, counted across all its rounds); `true` counts the task only. Empty or false for anything else (no run, a paused one, an ordinary /mission run).
     * @returns {{limit: string, used: number, max: number, first: boolean} | null} the limit reached; `first` only the first time.
     */
    check(id, long = false) {
      const t = task(id);
      const hit = reached(t, long, typeof long === 'string' && long ? runOf(id, long, true) : null);
      if (!hit) return null;
      const first = !t.stopped;
      t.stopped = hit;
      return { ...hit, first };
    },
    /**
     * A Mission ended, or was resumed (a fresh allowance): forget its whole-run count.
     * @returns {{key: string, steps: number, helperSteps: number, tokens: number} | null} the count it had, so a
     *   continue of the same run (Mission stage C) can put it back.
     */
    endRun(id) {
      const had = runs.get(id);
      runs.delete(id);
      return had ? { ...had } : null;
    },
    /**
     * A Mission that ended was continued (Mission stage C): its whole-run count comes back. Steps counted
     * since the continue, under the same run, are added rather than lost.
     * @param {string} id - the conversation.
     * @param {{key: string, steps?: number, helperSteps?: number, tokens?: number} | null} entry - what endRun returned.
     */
    restoreRun(id, entry) {
      if (!entry?.key) return;
      const kept = { key: String(entry.key), steps: whole(entry.steps), helperSteps: whole(entry.helperSteps), tokens: whole(entry.tokens) };
      const have = runs.get(id);
      if (have && have.key === kept.key) {
        have.steps += kept.steps;
        have.helperSteps += kept.helperSteps;
        have.tokens += kept.tokens;
      } else {
        runs.set(id, kept);
      }
    },
    /**
     * What a Mission gets, as the limits stand now: its steps and tokens over the whole run (0 = no limit),
     * and the daily limit, which still holds. For Mission's pre-flight line.
     * @returns {{enabled: boolean, steps: number, tokens: number, dayTokens: number}}
     */
    longAllowance() {
      const max = limits();
      return { enabled: max.enabled, steps: stepRule(max, true).max, tokens: longTokens(max), dayTokens: max.dayTokens };
    },
    endTask(id) {
      const t = tasks.get(id);
      if (!t) return;
      tasks.delete(id);
      if (t.steps + t.helperSteps > 0) record.addTask({ steps: t.steps, helperSteps: t.helperSteps, tokens: t.tokens, ms: now() - t.startedAt }, now());
    },
    /** @returns {{steps: number, helperSteps: number, tokens: number, minutes: number} | null} the running task's counts, for display. */
    current(id) {
      const t = tasks.get(id);
      return t ? { steps: t.steps, helperSteps: t.helperSteps, tokens: t.tokens, minutes: Math.floor((now() - t.startedAt) / 60000) } : null;
    },
  };
}

/**
 * A stop in plain words.
 * @param {{limit: string, used: number, max: number, tool?: string}} hit - from `check`.
 * @param {boolean} [long] - whether it stopped a Mission (its own allowance).
 * @returns {string} one sentence.
 */
export function describe(hit, long = false) {
  const n = (v) => Number(v).toLocaleString('en-US');
  switch (LIMITS.includes(hit?.limit) ? hit.limit : '') {
    case 'steps': return long ? `This Mission reached its own limit of ${n(hit.max)} ${hit.max === 1 ? 'step' : 'steps'}.` : `This run reached its limit of ${n(hit.max)} ${hit.max === 1 ? 'step' : 'steps'}.`;
    case 'helperSteps': return `This run's helpers reached their limit of ${n(hit.max)} steps.`;
    case 'tokens': return long ? `This Mission reached its own limit of ${n(hit.max)} tokens.` : `This run reached its limit of ${n(hit.max)} tokens.`;
    case 'minutes': return `This run reached its limit of ${n(hit.max)} ${hit.max === 1 ? 'minute' : 'minutes'}.`;
    case 'repeats': return `The assistant made the same ${hit.tool ?? 'tool'} call ${n(hit.used)} times in a row, which looks like a loop.`;
    case 'day': return `Today's limit of ${n(hit.max)} tokens is used up.`;
    default: return 'This run reached a limit.';
  }
}

/**
 * Stop texts saved before Mission's stage B said "Long run" (Mission was called Long run until 19 November 2026).
 * They are kept as stored and shown with today's name.
 * @param {unknown} text - a stored stop text.
 * @returns {string} the text with "Long run" read as "Mission".
 */
export function missionWords(text) {
  return String(text ?? '').replace(/\bLong runs\b/g, 'Missions').replace(/\bLong run\b/g, 'Mission').replace(/\blong run\b/g, 'Mission');
}

/** The highest Mission allowance `raiseMission` may set, so a fix can never lift the guard without bound. */
export const RAISE_MAX = { steps: 50000, tokens: 500000000 };

/**
 * Whether a Mission allowance may be raised to `to`, from what it is now.
 * @param {{limit: string, to: unknown}} request - which limit, and the new value.
 * @param {{steps: number, tokens: number}} now - the allowance as it stands (0 = no limit).
 * @returns {{ok: true, key: string, from: number, to: number} | {ok: false, text: string}}
 */
export function checkRaise(request, now) {
  const limit = request?.limit === 'tokens' ? 'tokens' : request?.limit === 'steps' ? 'steps' : '';
  if (!limit) return { ok: false, text: 'Only the steps or tokens of a Mission can be raised here.' };
  const to = Math.floor(Number(request?.to));
  const from = whole(now?.[limit]);
  const unit = limit === 'tokens' ? 'tokens' : 'steps';
  if (!Number.isFinite(to) || to <= 0) return { ok: false, text: `The new limit is not a whole number of ${unit}.` };
  if (from === 0) return { ok: false, text: `A Mission has no ${unit} limit now, so there is nothing to raise.` };
  if (to <= from) return { ok: false, text: `The new limit (${to.toLocaleString('en-US')} ${unit}) is not higher than the one now (${from.toLocaleString('en-US')}).` };
  if (to > RAISE_MAX[limit]) return { ok: false, text: `A Mission's ${unit} can be raised here up to ${RAISE_MAX[limit].toLocaleString('en-US')}; for more, change it in Settings → Budget guard.` };
  return { ok: true, key: limit === 'tokens' ? 'maxLongTokens' : 'maxLongSteps', from, to };
}
