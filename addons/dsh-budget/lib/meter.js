/**
 * Counting for the budget guard: how much one task has used, and whether it has reached a limit.
 * A "task" is one turn of a conversation (everything the assistant does after one message), with
 * the work of its helper agents counted in. Kept apart from the plugin so it can be tested
 * without the app.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Tasks remembered for "your biggest recent task", and for how long. */
export const RECENT_MAX = 300;
export const RECENT_MS = 30 * 24 * 60 * 60 * 1000;
/** Stops remembered for the page and the cards under answers. */
export const STOPS_MAX = 50;

const LIMITS = ['steps', 'tokens', 'minutes', 'repeats', 'day'];

function whole(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Limits as plain whole numbers; 0 means no limit.
 * @param {object} raw - the settings.
 * @returns {{enabled: boolean, maxSteps: number, maxTokens: number, maxMinutes: number, maxRepeats: number, dayTokens: number}} checked limits.
 */
export function readLimits(raw = {}) {
  return {
    enabled: raw.enabled !== false,
    maxSteps: whole(raw.maxSteps),
    maxTokens: whole(raw.maxTokens),
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
    try {
      const read = JSON.parse(readFileSync(file, 'utf8'));
      data = {
        day: typeof read.day === 'string' ? read.day : '',
        dayTokens: whole(read.dayTokens),
        recent: Array.isArray(read.recent) ? read.recent : [],
        stops: Array.isArray(read.stops) ? read.stops : [],
      };
    } catch {
      /* a new or unreadable file starts empty */
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
      data.recent = [...data.recent, { at: now, steps: whole(task.steps), tokens: whole(task.tokens), minutes: Math.round((Number(task.ms) || 0) / 60000) }]
        .filter((t) => now - t.at < RECENT_MS).slice(-RECENT_MAX);
      dirty = true;
    },
    addStop(stop) {
      data.stops = [...data.stops, stop].slice(-STOPS_MAX);
      dirty = true;
    },
    /** @returns {{count: number, steps: number, tokens: number, minutes: number}} the largest of each over the recent tasks. */
    biggest(now) {
      const recent = data.recent.filter((t) => now - t.at < RECENT_MS && t.steps > 0);
      return {
        count: recent.length,
        steps: Math.max(0, ...recent.map((t) => t.steps)),
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
    if (!tasks.has(id)) tasks.set(id, { steps: 0, tokens: 0, startedAt: now(), repeated: null, last: new Map(), stopped: null });
    return tasks.get(id);
  };

  /** What a task has reached, if anything. */
  const reached = (t) => {
    const max = limits();
    if (!max.enabled) return null;
    if (t.repeated) return t.repeated;
    if (max.maxSteps && t.steps >= max.maxSteps) return { limit: 'steps', used: t.steps, max: max.maxSteps };
    if (max.maxTokens && t.tokens >= max.maxTokens) return { limit: 'tokens', used: t.tokens, max: max.maxTokens };
    const minutes = Math.floor((now() - t.startedAt) / 60000);
    if (max.maxMinutes && minutes >= max.maxMinutes) return { limit: 'minutes', used: minutes, max: max.maxMinutes };
    const today = record.today(now());
    if (max.dayTokens && today >= max.dayTokens) return { limit: 'day', used: today, max: max.dayTokens };
    return null;
  };

  return {
    /** A new message started a task: its allowance starts fresh. */
    startTask(id) {
      tasks.set(id, { steps: 0, tokens: 0, startedAt: now(), repeated: null, last: new Map(), stopped: null });
    },
    /** One request to a model, by the conversation or one of its helpers. */
    step(id) {
      task(id).steps += 1;
    },
    /** Tokens one request used. */
    usage(id, tokens) {
      const n = whole(tokens);
      task(id).tokens += n;
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
     * @returns {{limit: string, used: number, max: number, first: boolean} | null} the limit reached; `first` only the first time.
     */
    check(id) {
      const t = task(id);
      const hit = reached(t);
      if (!hit) return null;
      const first = !t.stopped;
      t.stopped = hit;
      return { ...hit, first };
    },
    /** The task ended: remember its size. */
    endTask(id) {
      const t = tasks.get(id);
      if (!t) return;
      tasks.delete(id);
      if (t.steps > 0) record.addTask({ steps: t.steps, tokens: t.tokens, ms: now() - t.startedAt }, now());
    },
    /** @returns {{steps: number, tokens: number, minutes: number} | null} the running task's counts, for display. */
    current(id) {
      const t = tasks.get(id);
      return t ? { steps: t.steps, tokens: t.tokens, minutes: Math.floor((now() - t.startedAt) / 60000) } : null;
    },
  };
}

/**
 * A stop in plain words.
 * @param {{limit: string, used: number, max: number, tool?: string}} hit - from `check`.
 * @returns {string} one sentence.
 */
export function describe(hit) {
  const n = (v) => Number(v).toLocaleString('en-US');
  switch (LIMITS.includes(hit?.limit) ? hit.limit : '') {
    case 'steps': return `This task reached its limit of ${n(hit.max)} ${hit.max === 1 ? 'step' : 'steps'}.`;
    case 'tokens': return `This task reached its limit of ${n(hit.max)} tokens.`;
    case 'minutes': return `This task reached its limit of ${n(hit.max)} ${hit.max === 1 ? 'minute' : 'minutes'}.`;
    case 'repeats': return `The assistant made the same ${hit.tool ?? 'tool'} call ${n(hit.used)} times in a row, which looks like a loop.`;
    case 'day': return `Today's limit of ${n(hit.max)} tokens is used up.`;
    default: return 'This task reached a limit.';
  }
}
