/**
 * The record of scheduled runs: what the app's scheduler started, and how each one ended.
 *
 * The app only records that a task's instruction reached a conversation. This follows the turn that
 * instruction started, to its end. Kept apart from the plugin so it can be tested without the app.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** Runs kept, newest first. */
export const RUNS_MAX = 200;
/** How much of the answer's end is kept, in characters. */
export const TEXT_MAX = 400;

/** What a run is waiting for you to do. */
export const WAITS = ['approval', 'question', 'plan-review'];

/**
 * The tasks a message from the scheduler is a run of.
 * A change notice ("a task was edited") also comes from the scheduler but starts no run.
 * @param {unknown} message - a user-role message.
 * @returns {string[]} task ids; empty when the message is not a scheduled run.
 */
export function scheduledTasks(message) {
  if (message?.source?.kind !== 'schedule') return [];
  const text = (Array.isArray(message.content) ? message.content : [])
    .map((block) => (block?.type === 'text' ? String(block.text ?? '') : ''))
    .join('\n');
  if (!text.trimStart().startsWith('[SCHEDULE REMINDER')) return [];
  const ids = [];
  const one = /^schedule_id_json: (.+)$/m.exec(text);
  if (one) {
    try {
      ids.push(String(JSON.parse(one[1])));
    } catch {
      /* not a task id */
    }
  }
  const many = /^reminders_json: (.+)$/m.exec(text);
  if (many) {
    try {
      for (const item of JSON.parse(many[1])) if (item?.schedule_id) ids.push(String(item.schedule_id));
    } catch {
      /* not a list */
    }
  }
  return [...new Set(ids)];
}

/**
 * How a run ended, from the reason the app gives for the end of its turn.
 * @param {unknown} reason - the turn's end reason (`{kind, error?}`).
 * @returns {{state: 'ok' | 'failed' | 'stopped' | 'cancelled', detail: string}} the outcome.
 */
export function outcomeOf(reason) {
  const kind = String(reason?.kind ?? 'unknown');
  if (kind === 'completed') return { state: 'ok', detail: '' };
  if (kind === 'error') return { state: 'failed', detail: String(reason?.error?.message ?? reason?.error?.code ?? 'error').replace(/\s+/g, ' ').slice(0, 200) };
  if (kind === 'aborted') return { state: 'cancelled', detail: '' };
  if (kind === 'blocked') return { state: 'stopped', detail: 'Stopped before it finished, by a limit or a rule.' };
  if (kind === 'max-tokens') return { state: 'failed', detail: 'The answer was cut off: it reached the model\'s output limit.' };
  return { state: 'failed', detail: `Ended: ${kind}` };
}

function tail(text) {
  const clean = String(text ?? '').replace(/\s+\n/g, '\n').trim();
  return clean.length > TEXT_MAX ? `…${clean.slice(-TEXT_MAX)}` : clean;
}

/**
 * Open the record.
 * @param {string} file - JSON file; '' keeps everything in memory.
 * @returns {object} the record.
 */
export function openRuns(file) {
  let runs = [];
  if (file) {
    try {
      const read = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(read?.runs)) runs = read.runs.filter((run) => run && typeof run.id === 'string' && typeof run.sessionId === 'string');
    } catch {
      runs = [];
    }
  }
  let dirty = false;
  /** Conversation id -> its run in progress. */
  const active = new Map();

  const save = () => {
    if (!file || !dirty) return;
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ runs }, null, 1));
    renameSync(temp, file);
    dirty = false;
  };

  return {
    /**
     * Runs left "in progress" by an app that closed: they cannot finish any more.
     * @param {number} [now] - the current time.
     */
    closeLeftovers(now = Date.now()) {
      for (const run of runs) {
        if (run.state !== 'running' && run.state !== 'waiting') continue;
        run.state = 'failed';
        run.detail = 'The app closed before it finished.';
        run.waiting = undefined;
        run.endedAt = run.endedAt ?? now;
        dirty = true;
      }
      save();
    },

    /**
     * A scheduled message started a turn.
     * @param {object} what - the run.
     * @param {string} what.id - the message's id.
     * @param {string} what.sessionId - the conversation.
     * @param {{id: string, title: string}[]} what.tasks - the tasks it is a run of.
     * @param {number} [what.at] - when.
     * @param {number} [what.steps] - steps of its turn already begun (the instruction is read inside the first step).
     * @returns {object} the run.
     */
    start({ id, sessionId, tasks, at = Date.now(), steps = 0 }) {
      const run = { id: String(id), sessionId: String(sessionId), tasks, startedAt: at, state: 'running', steps: Math.max(0, Number(steps) || 0), tokens: 0, text: '', detail: '' };
      active.set(run.sessionId, run);
      runs = [run, ...runs.filter((other) => other.id !== run.id)].slice(0, RUNS_MAX);
      dirty = true;
      save();
      return run;
    },

    /** The run in progress in a conversation, if any. */
    active: (sessionId) => active.get(String(sessionId)),

    /** Name a run's tasks once their titles are known. */
    name(sessionId, titles) {
      const run = active.get(String(sessionId));
      if (!run) return;
      run.tasks = run.tasks.map((task) => ({ ...task, title: titles[task.id] ?? task.title }));
      dirty = true;
    },

    step(sessionId) {
      const run = active.get(String(sessionId));
      if (run) run.steps += 1;
    },

    usage(sessionId, tokens) {
      const run = active.get(String(sessionId));
      if (run) run.tokens += Math.max(0, Number(tokens) || 0);
    },

    /** The assistant's latest words in the run's own conversation. */
    text(sessionId, text) {
      const run = active.get(String(sessionId));
      const clean = tail(text);
      if (run && clean) run.text = clean;
    },

    /**
     * The run now waits for you.
     * @param {string} sessionId - the conversation.
     * @param {string} kind - one of `WAITS`.
     * @param {string} [key] - what will end the wait (an approval id or a tool call id).
     * @returns {object | undefined} the run when it just started waiting.
     */
    wait(sessionId, kind, key = '') {
      const run = active.get(String(sessionId));
      if (!run || !WAITS.includes(kind)) return undefined;
      const fresh = run.state !== 'waiting';
      run.state = 'waiting';
      run.waiting = kind;
      run.waitKey = String(key);
      dirty = true;
      save();
      return fresh ? run : undefined;
    },

    /** You answered: the run goes on. */
    resume(sessionId, key = '') {
      const run = active.get(String(sessionId));
      if (!run || run.state !== 'waiting') return;
      if (key && run.waitKey && String(key) !== run.waitKey) return;
      run.state = 'running';
      run.waiting = undefined;
      run.waitKey = undefined;
      dirty = true;
      save();
    },

    /**
     * The run's turn ended.
     * @param {string} sessionId - the conversation.
     * @param {unknown} reason - the turn's end reason.
     * @param {number} [at] - when.
     * @returns {object | undefined} the finished run.
     */
    end(sessionId, reason, at = Date.now()) {
      const run = active.get(String(sessionId));
      if (!run) return undefined;
      active.delete(run.sessionId);
      const outcome = outcomeOf(reason);
      run.state = outcome.state;
      run.detail = outcome.detail;
      run.waiting = undefined;
      run.waitKey = undefined;
      run.endedAt = at;
      dirty = true;
      save();
      return run;
    },

    /** Every run, newest first. */
    list: () => runs.map((run) => ({ ...run, waitKey: undefined })),

    flush: save,
  };
}
