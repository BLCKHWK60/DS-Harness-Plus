/**
 * Files of the add-on, all inside one data folder:
 *
 *   tasks.json                 the test tasks (the loop never edits these)
 *   policies/v0001.json ...    every version of the instructions, kept for good
 *   active.json                which version is in use
 *   results/<version>.json     how a version scored, and on which tasks
 *   candidates.json            proposed changes and how the gates judged them
 *   history.json               one line per finished proposal
 *
 * Writes go to a temporary file first and are then moved into place, so a
 * crash never leaves half a file.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyPolicy, familyOf, normalizePolicy } from './policy.js';
import { normalizeCheck } from './verify.js';

export const SPLITS = ['learn', 'check', 'guard'];
export const KINDS = ['answer', 'agent'];
const TASK_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const VERSION = /^v\d{4}$/;
const MAX_TASKS = 500;

/**
 * Normalize one stored task.
 * @param {unknown} raw - stored task.
 * @returns {object | undefined} task, or undefined when unusable.
 */
export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return undefined;
  const id = typeof raw.id === 'string' ? raw.id.trim().toLowerCase() : '';
  const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim().slice(0, 8000) : '';
  if (!TASK_ID.test(id) || !prompt) return undefined;
  return {
    id,
    family: familyOf(raw.family) === 'all' ? 'general' : familyOf(raw.family),
    split: SPLITS.includes(raw.split) ? raw.split : 'learn',
    kind: KINDS.includes(raw.kind) ? raw.kind : 'answer',
    prompt,
    checks: (Array.isArray(raw.checks) ? raw.checks : []).map(normalizeCheck).filter(Boolean).slice(0, 8),
    enabled: raw.enabled !== false,
  };
}

/**
 * Open the data folder.
 * @param {string} dir - absolute folder; created when missing.
 * @returns {object} the store.
 */
export function openStore(dir) {
  mkdirSync(join(dir, 'policies'), { recursive: true });
  mkdirSync(join(dir, 'results'), { recursive: true });

  const read = (name, fallback) => {
    try {
      const path = join(dir, name);
      return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (name, value) => {
    const path = join(dir, name);
    const temp = `${path}.${randomBytes(4).toString('hex')}.tmp`;
    writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
    renameSync(temp, path);
  };

  const store = {
    dir,

    /** @returns {object[]} every task, in stored order. */
    tasks() {
      const seen = new Set();
      const tasks = [];
      for (const raw of read('tasks.json', [])) {
        const task = normalizeTask(raw);
        if (task && !seen.has(task.id)) {
          seen.add(task.id);
          tasks.push(task);
        }
      }
      return tasks;
    },

    /**
     * Add or replace one task.
     * @param {unknown} raw - the task; without an id one is made from the prompt.
     * @returns {{task?: object, error?: string}} the stored task, or why it was refused.
     */
    saveTask(raw) {
      const tasks = store.tasks();
      const draft = { ...(raw && typeof raw === 'object' ? raw : {}) };
      if (!draft.id) {
        const base = String(draft.prompt ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'task';
        let id = base;
        for (let n = 2; tasks.some((task) => task.id === id); n += 1) id = `${base.slice(0, 20)}-${n}`;
        draft.id = id;
      }
      const task = normalizeTask(draft);
      if (!task) return { error: 'A task needs a prompt, and an id of lower-case letters, digits and dashes.' };
      const at = tasks.findIndex((item) => item.id === task.id);
      if (at < 0 && tasks.length >= MAX_TASKS) return { error: `There can be at most ${MAX_TASKS} tasks.` };
      if (at >= 0) tasks[at] = task;
      else tasks.push(task);
      write('tasks.json', tasks);
      return { task };
    },

    /** @param {string} id - task id. @returns {boolean} true when a task was removed. */
    deleteTask(id) {
      const tasks = store.tasks();
      const next = tasks.filter((task) => task.id !== id);
      if (next.length === tasks.length) return false;
      write('tasks.json', next);
      return true;
    },

    /** @returns {string[]} every stored version id, oldest first. */
    versions() {
      try {
        return readdirSync(join(dir, 'policies'))
          .map((name) => name.replace(/\.json$/, ''))
          .filter((name) => VERSION.test(name))
          .sort();
      } catch {
        return [];
      }
    },

    /** @param {string} version - version id. @returns {object | undefined} that policy. */
    policy(version) {
      if (!VERSION.test(String(version))) return undefined;
      const raw = read(join('policies', `${version}.json`), undefined);
      return raw ? normalizePolicy(raw) : undefined;
    },

    /** @returns {object} the policy in use; the empty starting policy on a fresh install. */
    active() {
      const version = read('active.json', {})?.version;
      const policy = store.policy(version);
      if (policy) return policy;
      const first = emptyPolicy();
      if (!store.policy(first.version)) write(join('policies', `${first.version}.json`), { ...first, createdAt: new Date().toISOString() });
      write('active.json', { version: first.version, at: new Date().toISOString() });
      return store.policy(first.version);
    },

    /** @param {object} policy - a new version. Stored versions are never overwritten. */
    savePolicy(policy) {
      if (!VERSION.test(policy.version)) throw new Error('bad version id');
      if (store.policy(policy.version)) throw new Error(`version ${policy.version} already exists`);
      write(join('policies', `${policy.version}.json`), policy);
    },

    /** @param {string} version - an existing version. @returns {boolean} true when it is now in use. */
    activate(version) {
      if (!store.policy(version)) return false;
      write('active.json', { version, at: new Date().toISOString() });
      return true;
    },

    /** @param {string} version - version id. @returns {object | undefined} `{version, at, fingerprint, model, repeats, results}`. */
    results(version) {
      return VERSION.test(String(version)) ? read(join('results', `${version}.json`), undefined) : undefined;
    },

    /** @param {string} version - version id. @param {object} value - results to keep. */
    saveResults(version, value) {
      if (!VERSION.test(String(version))) throw new Error('bad version id');
      write(join('results', `${version}.json`), value);
    },

    /** @returns {object[]} proposed changes, newest first. */
    candidates() {
      const list = read('candidates.json', []);
      return Array.isArray(list) ? list : [];
    },

    /** @param {object[]} list - every candidate; only the 40 newest are kept. */
    saveCandidates(list) {
      write('candidates.json', list.slice(0, 40));
    },

    /** @returns {Array<{at: string, description: string, outcome: string, note: string}>} finished proposals, oldest first. */
    history() {
      const list = read('history.json', []);
      return Array.isArray(list) ? list : [];
    },

    /** @param {{description: string, outcome: string, note: string}} entry - one finished proposal. */
    addHistory(entry) {
      write('history.json', [...store.history(), { at: new Date().toISOString(), ...entry }].slice(-200));
    },

    /** Remove a version's stored results, for example after the tasks changed. */
    clearResults(version) {
      try {
        rmSync(join(dir, 'results', `${version}.json`), { force: true });
      } catch {
        // Nothing to remove.
      }
    },
  };
  return store;
}

/**
 * A short fingerprint of what a set of results depends on, so stale results are noticed.
 * @param {object[]} tasks - the tasks that were run.
 * @param {{provider: string, model: string}} model - the model under test.
 * @param {number} repeats - runs per task.
 * @returns {string} fingerprint.
 */
export function fingerprint(tasks, model, repeats) {
  const body = JSON.stringify([
    tasks.map((task) => [task.id, task.kind, task.split, task.family, task.prompt, task.checks]),
    model?.provider,
    model?.model,
    repeats,
  ]);
  return createHash('sha256').update(body).digest('hex').slice(0, 16);
}
