/**
 * Changing an existing plugin (build prompt, part 6). Creator Plus asks every time: it shows the change
 * in plain words, backs the plugin up, makes the change in a copy and runs that plugin's tests there, and
 * waits for the user's yes before anything reaches the real setup. A third-party plugin and the app's own
 * code are never edited (fixed rule 4): Creator Plus builds an adapter beside them, or changes the new
 * plugin instead.
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize } from 'node:path';
import { createHash } from 'node:crypto';
import { guardedFile } from './fit.js';

/** A changed file's path must stay inside its plugin. */
export function safeRelative(path) {
  if (isAbsolute(String(path ?? ''))) return '';
  const value = normalize(String(path ?? '')).replace(/^\.\//, '');
  if (!value || value === '.' || value.startsWith('..') || value.includes('/../') || value.includes('\0') || /(^|\/)node_modules(\/|$)/.test(value) || value.startsWith('passport/lessons/')) return '';
  return value;
}

/**
 * The lines that differ between two texts, as a short plain diff (removed lines with "-", added with "+").
 * @returns {string} the diff, at most `max` lines.
 */
export function lineDiff(before, after, max = 120) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA -= 1;
    endB -= 1;
  }
  const lines = [`@@ line ${start + 1}`];
  for (let index = start; index <= endA; index += 1) lines.push(`- ${a[index]}`);
  for (let index = start; index <= endB; index += 1) lines.push(`+ ${b[index]}`);
  if (lines.length > max) return [...lines.slice(0, max), `… ${lines.length - max} more lines`].join('\n');
  return lines.join('\n');
}

/**
 * Check a change before anything is written.
 * @param {object} input - `plugin` (its map entry), `files` (relative path → new text).
 * @returns {{ok: boolean, why: string, files: Record<string, string>}} the files with checked paths.
 */
export function checkChange({ plugin, files }) {
  if (!plugin) return { ok: false, why: 'That plugin is not in the map.', files: {} };
  if (plugin.locked) return { ok: false, why: `${plugin.name} is ${plugin.origin === 'built-in' ? 'part of the app' : 'a third-party plugin'}: it is never edited (fixed rule 4). Build an adapter beside it instead: a small plugin of your own that adds what is missing.`, files: {} };
  const out = {};
  for (const [path, text] of Object.entries(files ?? {})) {
    const rel = safeRelative(path);
    if (!rel) return { ok: false, why: `"${String(path).slice(0, 80)}" is not a file inside the plugin.`, files: {} };
    // Capitals ignored, as macOS does: LIB/Tools.js is lib/tools.js.
    if (guardedFile(plugin.folder, rel)) return { ok: false, why: `${plugin.folder}/${rel} holds a safety rule of its tab; a change to it is blocked, not asked (fixed rule 3).`, files: {} };
    out[rel] = String(text ?? '');
  }
  if (Object.keys(out).length === 0) return { ok: false, why: 'Name at least one file and its new text.', files: {} };
  return { ok: true, why: '', files: out };
}

/**
 * Prepare a change in a copy: back up the plugin, copy it into the trial's work folder, write the files
 * there, and report the diff. The real plugin is not touched.
 * @param {object} input - `plugin` (map entry), `source` (the plugin's folder), `files` (checked), `backups`, `workDir` (where the copy goes).
 * @returns {{backup: string, copy: string, diff: string}} where things are.
 */
export function prepareChange({ plugin, source, files, backups, workDir }) {
  if (!existsSync(source)) throw new Error(`${plugin.name}'s folder was not found.`);
  // Fixed rule 1: the backup comes first, before any copy or change.
  const backup = backups.keep(source, `${plugin.folder}-before-change`);
  const copy = join(workDir, plugin.folder);
  mkdirSync(workDir, { recursive: true });
  // Links are left out of the copy, so a changed file can never be written through one to somewhere else.
  cpSync(source, copy, { recursive: true, dereference: false, force: true, filter: (path) => !lstatSync(path).isSymbolicLink() });
  const diffs = [];
  let added = 0;
  let removed = 0;
  for (const [rel, text] of Object.entries(files)) {
    const target = join(copy, rel);
    const before = existsSync(target) ? readFileSync(target, 'utf8') : '';
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    // The whole change, never cut: what the owner reads is what Apply writes.
    diffs.push(`${rel}${before ? '' : ' (new file)'}\n${lineDiff(before, text, Infinity)}`);
    added += text.split('\n').filter((line) => !before.split('\n').includes(line)).length;
    removed += before.split('\n').filter((line) => before && !text.split('\n').includes(line)).length;
  }
  const names = Object.keys(files);
  const summary = `Changes ${names.length} file${names.length === 1 ? '' : 's'} of ${plugin.name} (${names.join(', ')}): about ${added} line${added === 1 ? '' : 's'} added or changed, ${removed} taken out.`;
  return { backup, copy, diff: diffs.join('\n\n'), summary, hashes: hashFiles(copy, names) };
}

/** @returns {string} a file's SHA-256, or '' when it cannot be read. */
export function hashOf(path) {
  try {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
  } catch {
    return '';
  }
}
/** @returns {Record<string, string>} each file's SHA-256, by its path in the folder. */
export function hashFiles(dir, files) {
  return Object.fromEntries(files.map((rel) => [rel, hashOf(join(dir, rel))]));
}
/** @returns {string[]} the files whose text is not what was reviewed (gone, changed, or never hashed). */
export function mismatched(dir, hashes) {
  const list = Object.entries(hashes ?? {});
  if (list.length === 0) return ['(nothing was reviewed)'];
  return list.filter(([rel, hash]) => !hash || hashOf(join(dir, rel)) !== hash).map(([rel]) => rel);
}

/** @returns {string[]} every file in a folder (its modules too), by its path in the folder, never through a link. */
export function filesOf(dir, rel = '', out = []) {
  let entries = [];
  try {
    entries = readdirSync(join(dir, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) out.push(path);
    else if (entry.isDirectory()) filesOf(dir, path, out);
    else out.push(path);
  }
  return out;
}
