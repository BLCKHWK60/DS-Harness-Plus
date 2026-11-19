/**
 * The learned-skill library (Skill architect, step 70): skills as plain text in this add-on's own data
 * folder, never in any skill folder of yours, a project's, Plus's or the app's. Every change is a new
 * version; Put back makes an earlier one current again (as a new version, so nothing is lost). Delete
 * keeps the versions, so a deleted skill can be put back too.
 *
 * Learned skills are plain text: there are no scripts, so nothing a model wrote is ever run.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readJsonStore } from './json-store.js';

/** A skill name: kebab-case, as the app addresses skills. */
export const NAME = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const NAME_MAX = 48;
export const DESCRIPTION_MAX = 300;
export const TEXT_MAX = 8000;
/** The most learned skills kept (deleted ones included). */
export const SKILLS_MAX = 200;
/** Versions kept per skill (the oldest go first). */
export const VERSIONS_MAX = 30;

/** Where a learned skill reaches (step 71): every tab, one tab, or one project's folder. Never Recon. */
export const REACH_KINDS = ['all', 'tab', 'project'];

/** @returns {{kind: 'all'|'tab'|'project', tab?: string, folder?: string}} a reach, checked ('all' when not usable). */
export function readReach(value) {
  const kind = REACH_KINDS.includes(value?.kind) ? value.kind : 'all';
  if (kind === 'tab' && typeof value.tab === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value.tab) && value.tab !== 'recon') return { kind, tab: value.tab };
  if (kind === 'project' && typeof value.folder === 'string' && value.folder.startsWith('/')) return { kind, folder: value.folder };
  return { kind: 'all' };
}

const clean = (value, max) => String(value ?? '').replace(/\r/g, '').trim().slice(0, max);

/**
 * @param {{name: string, description: string, text: string}} skill - what is to be saved.
 * @param {(name: string) => boolean} [taken] - whether another skill (yours, a project's, Plus's, the app's) has the name.
 * @returns {string} what is wrong, in plain words ('' when it can be saved).
 */
export function skillProblem(skill, taken = () => false) {
  const name = String(skill?.name ?? '').trim();
  if (!NAME.test(name) || name.length > NAME_MAX) return `The name must be lowercase words joined by hyphens, at most ${NAME_MAX} characters, like "check-dates-first".`;
  if (taken(name)) return `There is already a skill called "${name}" (yours, a project's, Plus's or the app's). A learned skill never takes another skill's name: pick another one.`;
  if (!clean(skill?.description, DESCRIPTION_MAX)) return 'Say in one line when the skill helps (its description).';
  if (!clean(skill?.text, TEXT_MAX)) return 'The skill needs its text.';
  if (String(skill.text).length > TEXT_MAX) return `The text is longer than ${TEXT_MAX} characters.`;
  return '';
}

/**
 * @param {string} dir - the library's folder ('' keeps it in memory, for tests).
 * @param {{now?: () => number}} [options]
 */
export function openLibrary(dir, { now = () => Date.now() } = {}) {
  const file = dir ? join(dir, 'library.json') : '';
  let table = {};
  if (file) {
    table = readJsonStore(file, () => ({}), { label: 'the Skill architect library', valid: (value) => value && typeof value === 'object' && !Array.isArray(value) });
  }
  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(table, null, 1), { mode: 0o600 });
    renameSync(temp, file);
  };
  const current = (entry) => entry?.versions?.find((version) => version.n === entry.current);
  const view = (name, entry) => {
    const version = current(entry);
    return { name, description: version?.description ?? '', text: version?.text ?? '', reach: readReach(entry.reach), by: entry.by ?? 'hand', deleted: entry.deleted === true, current: entry.current, versions: entry.versions.map(({ n, at, why }) => ({ n, at, why })), createdAt: entry.createdAt, uses: entry.uses ?? 0 };
  };
  const push = (entry, { description, text, why }) => {
    const n = Math.max(0, ...entry.versions.map((version) => version.n)) + 1;
    entry.versions.push({ n, at: now(), why: clean(why, 200), description: clean(description, DESCRIPTION_MAX), text: clean(text, TEXT_MAX) });
    if (entry.versions.length > VERSIONS_MAX) entry.versions.splice(0, entry.versions.length - VERSIONS_MAX);
    entry.current = n;
  };
  return {
    /** @returns {object[]} every learned skill (deleted ones too, marked), newest first. */
    list: () => Object.entries(table).map(([name, entry]) => view(name, entry)).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)),
    /** @returns {object | undefined} one skill, with its current text. */
    get: (name) => (table[name] ? view(name, table[name]) : undefined),
    /** Add a new learned skill. @throws when it cannot be saved (the reason, in plain words). */
    add({ name, description, text, reach, by = 'hand', why = '' }, taken = () => false) {
      const key = String(name ?? '').trim();
      if (table[key]) throw new Error(`There is already a learned skill called "${key}". Change that one instead.`);
      const problem = skillProblem({ name: key, description, text }, taken);
      if (problem) throw new Error(problem);
      if (Object.keys(table).length >= SKILLS_MAX) throw new Error(`There are already ${SKILLS_MAX} learned skills. Delete some first.`);
      const entry = { by: by === 'learned' ? 'learned' : 'hand', reach: readReach(reach), createdAt: now(), versions: [], current: 0 };
      push(entry, { description, text, why: why || (by === 'learned' ? 'Learned' : 'Added by hand') });
      table[key] = entry;
      save();
      return view(key, entry);
    },
    /** Change a skill: a new version (the earlier ones stay). */
    update(name, { description, text, reach, why = 'Changed' }) {
      const entry = table[name];
      if (!entry) throw new Error('No such learned skill.');
      const before = current(entry);
      const next = { description: description ?? before?.description, text: text ?? before?.text };
      const problem = skillProblem({ name, ...next });
      if (problem) throw new Error(problem);
      if (reach !== undefined) entry.reach = readReach(reach);
      if (next.description !== before?.description || next.text !== before?.text) push(entry, { ...next, why });
      entry.deleted = false;
      save();
      return view(name, entry);
    },
    /** Make an earlier version current again, as a new version. */
    putBack(name, n) {
      const entry = table[name];
      const version = entry?.versions.find((item) => item.n === Number(n));
      if (!version) throw new Error('That version is not kept.');
      push(entry, { description: version.description, text: version.text, why: `Put back version ${version.n}` });
      entry.deleted = false;
      save();
      return view(name, entry);
    },
    /** Delete: it stops being offered; its versions stay, so Put back still works. */
    remove(name) {
      const entry = table[name];
      if (!entry) return false;
      entry.deleted = true;
      save();
      return true;
    },
    /** Count one use (the skill tool loaded it, or /name started it). */
    used(name) {
      const entry = table[name];
      if (!entry) return;
      entry.uses = (entry.uses ?? 0) + 1;
      save();
    },
  };
}
