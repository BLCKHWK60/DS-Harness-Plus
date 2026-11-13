/**
 * Projects: what Plus keeps about a project folder beyond what the app keeps (its folder, its name
 * and its conversations). That is the tab the project shows under and the project's own
 * instructions. Also the two things the project page does with the folder: list its files and put
 * a copy of an added file into it. Kept apart from the plugin so it can be tested without the app.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';

export const INSTRUCTIONS_MAX = 12000;
export const FILES_MAX = 400;
export const UPLOAD_MAX = 100 * 1024 * 1024;
const SKIP = new Set(['node_modules', '__pycache__', 'data-output']);

/**
 * A folder path in its one true spelling, so the same folder is always the same key.
 * @param {unknown} path - a folder path.
 * @returns {string} the real path, or the text as given when the folder is not there.
 */
export function canonical(path) {
  const text = String(path ?? '').trim();
  if (!text) return '';
  try {
    return realpathSync(text);
  } catch {
    return text.replace(/[\\/]+$/, '');
  }
}

/**
 * @param {string} file - JSON file; '' keeps everything in memory.
 * @returns {object} the record.
 */
export function openProjects(file) {
  /** @type {Record<string, {tab: string, instructions: string, preset: string}>} */
  let table = {};
  if (file) {
    try {
      const read = JSON.parse(readFileSync(file, 'utf8'));
      if (read && typeof read === 'object' && !Array.isArray(read)) table = read;
    } catch {
      table = {};
    }
  }
  const write = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(table, null, 1));
    renameSync(temp, file);
  };
  const clean = (entry) => ({
    tab: typeof entry?.tab === 'string' ? entry.tab.slice(0, 40) : '',
    instructions: typeof entry?.instructions === 'string' ? entry.instructions.slice(0, INSTRUCTIONS_MAX) : '',
    // The project's type. '' means no type was ever chosen; 'blank' means Blank was chosen.
    preset: typeof entry?.preset === 'string' && /^[a-z0-9-]{1,50}$/.test(entry.preset) ? entry.preset : '',
  });
  return {
    /** @returns {Record<string, {tab: string, instructions: string}>} every record, by folder. */
    all: () => Object.fromEntries(Object.entries(table).map(([path, entry]) => [path, clean(entry)])),
    /** @param {string} path @returns {{tab: string, instructions: string} | undefined} */
    get: (path) => {
      const entry = table[canonical(path)];
      return entry ? clean(entry) : undefined;
    },
    /** Change the fields that are given; the others stay. */
    save(path, patch) {
      const key = canonical(path);
      if (!key) throw new Error('No folder was given.');
      const before = clean(table[key]);
      const next = clean({
        tab: typeof patch?.tab === 'string' ? patch.tab : before.tab,
        instructions: typeof patch?.instructions === 'string' ? patch.instructions : before.instructions,
        preset: typeof patch?.preset === 'string' ? patch.preset : before.preset,
      });
      table = { ...table, [key]: next };
      write();
      return next;
    },
    forget(path) {
      const key = canonical(path);
      if (!Object.hasOwn(table, key)) return false;
      const { [key]: _gone, ...rest } = table;
      table = rest;
      write();
      return true;
    },
  };
}

/**
 * The project's instructions as a note for the assistant.
 * @param {string} title - the project's name.
 * @param {string} instructions - the owner's text.
 * @param {string[]} [shared] - the shared tools ('data', 'finance') to point the assistant at.
 * @returns {string} the note; '' when there is nothing to say.
 */
export function noteOf(title, instructions, shared = []) {
  const text = String(instructions ?? '').trim();
  const tools = sharedNote(shared);
  const parts = [];
  if (text) parts.push(`This conversation belongs to the project "${String(title || 'Untitled').slice(0, 80)}". The user wrote these instructions for every conversation in this project. Follow them:\n\n${text}`);
  if (tools) parts.push(tools);
  return parts.join('\n\n');
}

/**
 * What a project is told about the tools it shares with the Data and Finance tabs.
 * @param {string[]} shared - which of them this project's type uses and which are switched on: 'data', 'finance'.
 * @returns {string} the note; '' when there is nothing to say.
 */
export function sharedNote(shared) {
  const lines = [];
  if (shared.includes('data')) lines.push('For tables in this folder (CSV, TSV, JSON, Excel) use the data tools instead of reading a file into the conversation: data_files lists them, data_profile describes a table, data_query runs read-only SQL on it and gives each result an id such as [Q3] to cite, data_chart draws a chart from a query, and data_python does statistics. They read only this folder and never change a file.');
  if (shared.includes('finance')) lines.push('For figures about companies and economies use the finance tools rather than memory: finance_company_figures and finance_company_filings (reported figures and filings), finance_economy (yearly readings), finance_prices, finance_news and finance_social. Give each figure with its source and date.');
  return lines.join('\n');
}

/**
 * The files of a folder, newest first, without hidden files.
 * @param {string} folder - the project's folder.
 * @param {number} max - most files returned.
 * @returns {{files: {name: string, size: number, modified: number}[], more: boolean}} the list.
 */
export function listFiles(folder, max = FILES_MAX) {
  const root = canonical(folder);
  const files = [];
  let more = false;
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < 3) walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= max * 4) {
        more = true;
        return;
      }
      try {
        const info = statSync(full);
        files.push({ name: relative(root, full).split(sep).join('/'), size: info.size, modified: info.mtimeMs });
      } catch {
        /* gone in the meantime */
      }
    }
  };
  walk(root, 0);
  files.sort((a, b) => b.modified - a.modified);
  if (files.length > max) more = true;
  return { files: files.slice(0, max), more };
}

/**
 * A file name that is safe to create inside a folder: one plain name, no path, not hidden.
 * @param {unknown} name - the name the browser gave.
 * @returns {string} the cleaned name; '' when nothing usable is left.
 */
export function safeName(name) {
  // eslint-disable-next-line no-control-regex
  const text = basename(String(name ?? '').replace(/\\/g, '/')).replace(/[\u0000-\u001f\u007f:]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '');
  return text.slice(0, 180);
}

/**
 * Put a copy of a file into the project's folder. Never replaces a file: a taken name gets " (2)".
 * @param {string} folder - the project's folder.
 * @param {unknown} name - the file's name.
 * @param {Buffer} bytes - its content.
 * @returns {string} the name it was saved under.
 */
export function addFile(folder, name, bytes) {
  const root = canonical(folder);
  if (!root || !existsSync(root) || !statSync(root).isDirectory()) throw new Error('The project folder is not there.');
  const clean = safeName(name);
  if (!clean) throw new Error('That file has no usable name.');
  if (bytes.length > UPLOAD_MAX) throw new Error('That file is larger than 100 MB. Put it into the folder with the Finder instead.');
  const ext = extname(clean);
  const stem = clean.slice(0, clean.length - ext.length);
  let target = clean;
  for (let n = 2; existsSync(join(root, target)); n += 1) {
    if (n > 500) throw new Error('Too many files with that name.');
    target = `${stem} (${n})${ext}`;
  }
  // 'wx' refuses to write over a file that appeared in the meantime.
  writeFileSync(join(root, target), bytes, { flag: 'wx' });
  return target;
}
