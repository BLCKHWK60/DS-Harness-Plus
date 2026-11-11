/**
 * Pure helpers for Shared settings: canonical digests, path picking, secret scrubbing,
 * the three-way field merge and the shared file format. No app services are used here.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';

/** File format version written into the shared file. */
export const FORMAT = 1;
/** Name of the shared file inside the chosen folder. */
export const FILE_NAME = 'settings.json';
/** Field names that look like secrets; they never leave this Mac, whatever their schema says. */
export const SECRET_KEY = /(api[-_]?key|token|secret|password|passphrase|credential|private[-_]?key)/i;
/** Marker for "no value" in digests, so an absent field and an empty one differ. */
const ABSENT = '-';

/**
 * JSON with sorted object keys, so equal values always give equal text.
 * @param {unknown} value - JSON-shaped value.
 * @returns {string} canonical JSON.
 */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

/**
 * Short digest of a value; `undefined` is the absent marker.
 * @param {unknown} value - JSON-shaped value or undefined.
 * @returns {string} digest.
 */
export function digest(value) {
  if (value === undefined) return ABSENT;
  return createHash('sha256').update(canonical(value)).digest('hex').slice(0, 20);
}

/** @param {unknown} value @returns {boolean} true for a plain object. */
export function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Deep copy of a JSON-shaped value.
 * @param {unknown} value - value.
 * @returns {unknown} copy.
 */
export function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Read a nested value.
 * @param {object} object - root.
 * @param {string[]} path - keys.
 * @returns {unknown} value or undefined.
 */
export function getPath(object, path) {
  let node = object;
  for (const key of path) {
    if (!isObject(node) || !Object.hasOwn(node, key)) return undefined;
    node = node[key];
  }
  return node;
}

/**
 * Set a nested value, creating objects on the way. Mutates `object`.
 * @param {object} object - root.
 * @param {string[]} path - keys (at least one).
 * @param {unknown} value - value.
 */
export function setPath(object, path, value) {
  let node = object;
  for (const key of path.slice(0, -1)) {
    if (!isObject(node[key])) node[key] = {};
    node = node[key];
  }
  node[path[path.length - 1]] = clone(value);
}

/**
 * Copy of `object` without the given paths; emptied parent objects are dropped.
 * @param {object} object - root.
 * @param {string[][]} paths - paths to remove.
 * @returns {object} copy.
 */
export function withoutPaths(object, paths) {
  const result = clone(object ?? {});
  for (const path of paths) {
    const parents = [];
    let node = result;
    for (const key of path.slice(0, -1)) {
      if (!isObject(node?.[key])) {
        node = undefined;
        break;
      }
      parents.push([node, key]);
      node = node[key];
    }
    if (!isObject(node)) continue;
    delete node[path[path.length - 1]];
    for (let i = parents.length - 1; i >= 0; i -= 1) {
      const [parent, key] = parents[i];
      if (isObject(parent[key]) && Object.keys(parent[key]).length === 0) delete parent[key];
    }
  }
  return result;
}

/**
 * Only the given paths of `object` that hold a value.
 * @param {object} object - root.
 * @param {string[][]} paths - paths to keep.
 * @returns {object} new object.
 */
export function onlyPaths(object, paths) {
  const result = {};
  for (const path of paths) {
    const value = getPath(object, path);
    if (value !== undefined) setPath(result, path, value);
  }
  return result;
}

/**
 * Paths of every object key that looks like a secret.
 * @param {unknown} value - root.
 * @param {string[]} [path] - prefix.
 * @returns {string[][]} paths.
 */
export function secretPaths(value, path = []) {
  if (!isObject(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    SECRET_KEY.test(key) ? [[...path, key]] : secretPaths(child, [...path, key]),
  );
}

/**
 * Deep merge where `top` wins; arrays and scalars are replaced whole.
 * @param {object} base - lower layer.
 * @param {object} top - upper layer.
 * @returns {object} merged copy.
 */
export function deepMerge(base, top) {
  const result = clone(base ?? {});
  for (const [key, value] of Object.entries(top ?? {})) {
    result[key] = isObject(value) && isObject(result[key]) ? deepMerge(result[key], value) : clone(value);
  }
  return result;
}

/**
 * Three-way merge of one settings section, field by field (top-level keys).
 *
 * For each field: the same on both sides keeps it; changed only here goes to the file; changed only in
 * the file comes here; changed on both sides is a conflict and the file wins (the shared copy is the
 * one both Macs agree on; the local value is backed up by the caller). With no sync record yet
 * (a fresh install joining an existing file) the file wins too.
 * @param {object|undefined} local - this Mac's shared values.
 * @param {object|undefined} file - the file's values, undefined when the file lacks the section.
 * @param {Record<string,string>|undefined} synced - field digests at the last sync.
 * @returns {{merged: object, toLocal: boolean, toFile: boolean, conflicts: string[]}} result.
 */
export function mergeSection(local, file, synced) {
  const here = local ?? {};
  if (file === undefined) return { merged: clone(here), toLocal: false, toFile: true, conflicts: [] };
  const merged = {};
  const conflicts = [];
  const fields = new Set([...Object.keys(here), ...Object.keys(file), ...Object.keys(synced ?? {})]);
  for (const field of [...fields].sort()) {
    const l = digest(here[field]);
    const f = digest(file[field]);
    let pick;
    if (l === f) pick = here[field];
    else if (synced === undefined) pick = file[field];
    else if (l === (synced[field] ?? ABSENT)) pick = file[field];
    else if (f === (synced[field] ?? ABSENT)) pick = here[field];
    else {
      pick = file[field];
      conflicts.push(field);
    }
    if (pick !== undefined) merged[field] = clone(pick);
  }
  return {
    merged,
    toLocal: digest(merged) !== digest(here),
    toFile: digest(merged) !== digest(file),
    conflicts,
  };
}

/**
 * Field digests of a section, for the sync record.
 * @param {object} section - values.
 * @returns {Record<string,string>} digests.
 */
export function fieldDigests(section) {
  return Object.fromEntries(Object.entries(section ?? {}).map(([key, value]) => [key, digest(value)]));
}

/**
 * Read the shared file.
 * @param {string} file - path.
 * @returns {{exists: false} | {exists: true, settings: Record<string, object>, digest: string} | {exists: true, error: string}} result.
 */
export function readShared(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return { exists: false };
    return { exists: true, error: `could not read ${file}: ${error?.message ?? error}` };
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { exists: true, error: `${file} is not valid JSON (${error.message}); fix or delete it` };
  }
  if (!isObject(data) || (data.settings !== undefined && !isObject(data.settings))) {
    return { exists: true, error: `${file} does not look like a Shared settings file` };
  }
  if (Number(data.format ?? FORMAT) > FORMAT) {
    return { exists: true, error: `${file} was written by a newer DeepSeek Harness Plus; update this Mac first` };
  }
  const settings = {};
  for (const [ns, section] of Object.entries(data.settings ?? {})) if (isObject(section)) settings[ns] = section;
  return { exists: true, settings, digest: digest(settings) };
}

/**
 * Text of the shared file.
 * @param {Record<string, object>} settings - sections by entry id.
 * @param {Date} now - time stamp.
 * @returns {string} JSON text.
 */
export function renderShared(settings, now) {
  const sorted = Object.fromEntries(Object.keys(settings).sort().map((ns) => [ns, settings[ns]]));
  const data = {
    format: FORMAT,
    about: 'DeepSeek Harness Plus shared settings. Kept in step by the Shared settings add-on on every Mac that points at this folder. Holds no secrets. You may edit it; changes apply within a minute.',
    updatedAt: now.toISOString(),
    settings: sorted,
  };
  return `${JSON.stringify(data, null, 2)}\n`;
}

/**
 * Write a file through a temporary file in the same folder and a rename, so readers
 * (and iCloud) never see half a file.
 * @param {string} file - target.
 * @param {string} text - contents.
 */
export function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.tmp`);
  try {
    writeFileSync(temp, text, { mode: 0o600 });
    renameSync(temp, file);
  } catch (error) {
    try {
      if (existsSync(temp)) unlinkSync(temp);
    } catch {
      // Best effort.
    }
    throw error;
  }
}

/**
 * Expand a leading `~/` and check the result is absolute.
 * @param {string} folder - folder as written.
 * @param {string} home - home directory.
 * @returns {string} absolute path, or '' when not usable.
 */
export function resolveFolder(folder, home) {
  let text = String(folder ?? '').trim();
  if (!text) return '';
  if (text === '~') text = home;
  else if (text.startsWith('~/')) text = join(home, text.slice(2));
  return text.startsWith('/') ? text.replace(/\/+$/, '') || '/' : '';
}

/**
 * Parse "entry.field.sub" strings into a map of entry id to paths.
 * @param {string[]} list - dotted names.
 * @returns {Map<string, string[][]>} paths per entry id.
 */
export function parseFieldList(list) {
  const map = new Map();
  for (const item of list ?? []) {
    const parts = String(item).split('.').map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const [ns, ...path] = parts;
    if (!map.has(ns)) map.set(ns, []);
    map.get(ns).push(path);
  }
  return map;
}
