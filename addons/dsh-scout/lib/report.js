/**
 * A run's report, saved as two files in the Scout folder's `reports` folder: the report as
 * Markdown, and the ranked opportunities as a table (CSV) to sort and keep notes in. Beside them,
 * `<name>.seen.json` holds the keys (address; title, company and town) of every posting the run
 * found, ranked or not, so a later run can say what is really new. Earlier reports can be listed
 * and read again.
 */
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sameJob } from './store.js';

/** The table's columns: the opportunity, its four scores each with a reason, the signals, and the approach. */
export const COLUMNS = [
  'rank', 'posting', 'title', 'company', 'location', 'pay', 'posted', 'link', 'new',
  'fit', 'fit_reason', 'freshness', 'freshness_reason', 'pay_score', 'pay_reason', 'legitimacy', 'legitimacy_reason',
  'flags', 'signals', 'reason', 'contact', 'channel', 'timing', 'trigger', 'draft', 'next_step',
];
/** Filled by Scout itself when the report is saved, never by the model. */
export const COMPUTED = ['new', 'signals'];
/** The columns the model fills. */
export const MODEL_COLUMNS = COLUMNS.filter((column) => !COMPUTED.includes(column));
/** Each score and the column that holds its reason. */
export const SCORES = [['fit', 'fit_reason'], ['freshness', 'freshness_reason'], ['pay_score', 'pay_reason'], ['legitimacy', 'legitimacy_reason']];
const DRAFT_MAX = 1000;
const READ_MAX = 60_000;
const EARLIER_MAX = 50;
/** Keys kept for the postings a run found. */
const SEEN_MAX = 3000;
const SEEN = '.seen.json';

const cell = (value) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim().slice(0, 1000);
  // A cell that a spreadsheet would read as a formula is written as text.
  const safe = /^[=+\-@\t]/.test(text) ? `'${text}` : text;
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The table as CSV text. */
export function csv(rows) {
  return [COLUMNS.join(','), ...rows.map((row) => COLUMNS.map((column) => cell(row?.[column])).join(','))].join('\n');
}

/** CSV text as rows keyed by the header's names. Reads what `csv` writes, and quoted cells in general. */
export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;
  const value = String(text ?? '');
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (quoted) {
      if (char === '"' && value[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && value[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else field += char;
  }
  if (field || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [head = [], ...rest] = records.filter((row) => row.some((part) => part !== ''));
  return rest.map((row) => Object.fromEntries(head.map((name, index) => [name.trim(), (row[index] ?? '').replace(/^'(?=[=+\-@\t])/, '')])));
}

/**
 * What is wrong with the rows before they are saved.
 * @returns {{problems: string[], missing: string[]}} both stop the save (scout_report refuses it
 *   while either list holds anything); missing scores are kept apart only for their wording.
 */
export function checkRows(rows) {
  const problems = [];
  const missing = [];
  rows.forEach((row, index) => {
    const which = `row ${row?.rank ?? index + 1}${row?.title ? ` (${String(row.title).slice(0, 40)})` : ''}`;
    for (const [score, reason] of SCORES) {
      const raw = row?.[score];
      if (raw === undefined || raw === null || raw === '') {
        missing.push(`${which}: ${score}`);
        continue;
      }
      const n = Number(raw);
      if (!Number.isInteger(n) || n < 1 || n > 5) problems.push(`${which}: ${score} must be a whole number from 1 to 5`);
      else if (!String(row?.[reason] ?? '').trim()) problems.push(`${which}: ${score} has no reason; write it in ${reason}`);
    }
    const draft = String(row?.draft ?? '').trim();
    if (draft && !String(row?.trigger ?? '').trim()) problems.push(`${which}: a draft must rest on a real trigger; write it in trigger (what in the posting or the news it answers)`);
    if (draft.length > DRAFT_MAX) problems.push(`${which}: the draft is ${draft.length} characters; keep it under ${DRAFT_MAX}`);
  });
  return { problems, missing };
}

/** A file name from a title and a time: `2026-11-14-2105-data-engineer-berlin`. */
export function stem(title, at = new Date()) {
  const iso = at.toISOString();
  const stamp = `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  const slug = String(title ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scout-run';
  return `${stamp}-${slug}`;
}

/** The reports folder inside the Scout folder. */
export const reportsOf = (folder) => join(String(folder ?? ''), 'reports');

/**
 * @param {string} folder - the Scout folder.
 * @param {{title: string, markdown: string, opportunities: object[], found?: object[]}} report - from
 *   the model, the rows already completed by Scout; `found`: every posting the run found, ranked or not.
 * @param {Date} [at] - when.
 * @param {string} [appendix] - what Scout adds at the end: the signals it computed, what is new.
 * @returns {{markdown: string, table: string, rows: number, name: string, seen: number}} the files
 *   written; `seen`: how many keys of found postings were kept beside them.
 */
export function writeReport(folder, { title, markdown, opportunities, found }, at = new Date(), appendix = '') {
  const text = String(markdown ?? '').trim();
  if (text.length < 40) throw new Error('the report is empty; write it first, then save it');
  const rows = Array.isArray(opportunities) ? opportunities.slice(0, 300) : [];
  const dir = reportsOf(folder);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const base = stem(title, at);
  // Two saves in the same minute with the same title never overwrite each other.
  let name = base;
  for (let n = 2; existsSync(join(dir, `${name}.md`)) || existsSync(join(dir, `${name}.csv`)); n += 1) name = `${base}-${n}`;
  const head = `# ${String(title ?? 'Scout run').replace(/\s+/g, ' ').trim().slice(0, 200)}\n\nSaved ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC by Scout. Postings, titles and companies are as the sources gave them; check each before acting. Messages are drafts: nothing was sent, submitted or applied for.\n\n`;
  const markdownFile = join(dir, `${name}.md`);
  const tableFile = join(dir, `${name}.csv`);
  writeFileSync(markdownFile, `${head}${text}\n${appendix ? `\n${appendix.trim()}\n` : ''}`, { mode: 0o600 });
  writeFileSync(tableFile, `${csv(rows)}\n`, { mode: 0o600 });
  const seen = Array.isArray(found) ? writeSeen(dir, name, found) : 0;
  return { markdown: markdownFile, table: tableFile, rows: rows.length, name, seen };
}

/**
 * Keep the keys of every posting a run found beside its report, written whole or not at all.
 * Only the keys (address; title, company and town), never a posting's text.
 * @returns {number} how many keys were kept (0 when the file could not be written).
 */
function writeSeen(dir, name, found) {
  const keys = new Set();
  for (const item of found) {
    for (const key of keysOf(item)) if (keys.size < SEEN_MAX) keys.add(key);
  }
  const file = join(dir, `${name}${SEEN}`);
  const part = `${file}.part`;
  try {
    writeFileSync(part, JSON.stringify({ keys: [...keys] }), { mode: 0o600 });
    renameSync(part, file);
    return keys.size;
  } catch {
    return 0;
  }
}

/**
 * The keys of every posting an earlier run found, from the file beside its report.
 * @returns {Set<string> | null} null when the report has no such file (saved before 0.57.0).
 */
export function seenKeys(folder, name) {
  const wanted = reportFile(name);
  if (!wanted) return null;
  try {
    const path = join(reportsOf(folder), `${wanted.name}${SEEN}`);
    if (!existsSync(path)) return null;
    const keys = JSON.parse(readFileSync(path, 'utf8'))?.keys;
    return Array.isArray(keys) ? new Set(keys.filter((key) => typeof key === 'string').slice(0, SEEN_MAX * 2)) : null;
  } catch {
    return null;
  }
}

/** The first bytes of a file. */
function head(path, size = 1024) {
  const fd = openSync(path, 'r');
  try {
    const buffer = Buffer.alloc(size);
    const read = readSync(fd, buffer, 0, size, 0);
    return buffer.subarray(0, read).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * The saved reports, newest first.
 * @param {string} folder - the Scout folder.
 * @returns {{name: string, title: string, saved: string, rows: number, at: number}[]}
 */
export function listReports(folder) {
  const dir = reportsOf(folder);
  if (!folder || !existsSync(dir)) return [];
  const names = new Map();
  for (const file of readdirSync(dir, { withFileTypes: true })) {
    if (!file.isFile()) continue;
    const match = /^(.+)\.(md|csv)$/.exec(file.name);
    if (!match || match[1].startsWith('.')) continue;
    const entry = names.get(match[1]) ?? { name: match[1], md: false, csv: false };
    entry[match[2]] = true;
    names.set(match[1], entry);
  }
  const out = [];
  for (const entry of names.values()) {
    const stamp = /^(\d{4}-\d{2}-\d{2})-(\d{2})(\d{2})-/.exec(entry.name);
    let title = entry.name;
    let rows = 0;
    let at = 0;
    try {
      if (entry.md) {
        const path = join(dir, `${entry.name}.md`);
        title = /^#\s+(.+)$/m.exec(head(path))?.[1]?.trim() ?? entry.name;
        at = statSync(path).mtimeMs;
      }
      if (entry.csv) {
        const path = join(dir, `${entry.name}.csv`);
        rows = readFileSync(path, 'utf8').split('\n').filter((line) => line.trim()).length - 1;
        at = Math.max(at, statSync(path).mtimeMs);
      }
    } catch {
      /* a file that cannot be read is listed by its name */
    }
    out.push({ name: entry.name, title: title.slice(0, 200), saved: stamp ? `${stamp[1]} ${stamp[2]}:${stamp[3]} UTC` : '', rows: Math.max(0, rows), at, files: [entry.md && 'md', entry.csv && 'csv'].filter(Boolean) });
  }
  // Newest first, by the time in the name; within one minute by the files' time. Files without a
  // time in their name (notes of the user's own) come last.
  return out.sort((a, b) => {
    const ta = savedAt(a.name);
    const tb = savedAt(b.name);
    if (Number.isNaN(ta) !== Number.isNaN(tb)) return Number.isNaN(ta) ? 1 : -1;
    return (Number.isNaN(ta) ? 0 : tb - ta) || b.at - a.at || b.name.localeCompare(a.name);
  });
}

/** The time a report's name begins with (`2026-11-14-2105-…`), in ms; NaN when it has none. */
function savedAt(name) {
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})-/.exec(String(name ?? ''));
  return match ? Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5])) : NaN;
}

/** How many reports are saved: a quick count by name, for the note in every Scout conversation. */
export function countReports(folder) {
  try {
    const dir = reportsOf(folder);
    return folder && existsSync(dir) ? readdirSync(dir).filter((name) => name.endsWith('.md') && !name.startsWith('.')).length : 0;
  } catch {
    return 0;
  }
}

/** A report's name as the model gives it: one plain name in the reports folder, with or without .md or .csv. */
export function reportFile(raw) {
  const value = String(raw ?? '').trim().replace(/^reports\//, '');
  const match = /^([\p{L}\p{N}][\p{L}\p{N}._-]{0,159}?)(?:\.(md|csv))?$/u.exec(value);
  if (!match || value.includes('..')) return undefined;
  return { name: match[1], kind: match[2] ?? 'md' };
}

/**
 * The text of one saved report.
 * @param {string} folder - the Scout folder.
 * @param {string} raw - its name, as listReports gives it, with .md (default) or .csv.
 * @returns {string} the text, cut at 60,000 characters.
 */
export function readReport(folder, raw) {
  const wanted = reportFile(raw);
  if (!wanted) throw new Error('give the name of one saved report, as scout_reports lists it');
  const path = join(reportsOf(folder), `${wanted.name}.${wanted.kind}`);
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`there is no saved report called ${wanted.name}.${wanted.kind}`);
  const text = readFileSync(path, 'utf8');
  return text.length > READ_MAX ? `${text.slice(0, READ_MAX)}\n[The report is longer; only its first ${READ_MAX} characters are shown.]` : text;
}

/** The rows of one saved report's table. */
export function reportRows(folder, name) {
  const wanted = reportFile(name);
  if (!wanted) return [];
  const path = join(reportsOf(folder), `${wanted.name}.csv`);
  try {
    return existsSync(path) ? parseCsv(readFileSync(path, 'utf8')) : [];
  } catch {
    return [];
  }
}

/** The keys an opportunity is known by: its address, and its title, company and town. */
export function keysOf(item) {
  const keys = [];
  const link = String(item?.link ?? item?.url ?? '').trim().toLowerCase().replace(/\/+$/, '').slice(0, 500);
  if (link) keys.push(link);
  if (String(item?.title ?? '').trim()) keys.push(sameJob({ title: item.title, company: item.company, location: item.location }).slice(0, 500));
  return keys;
}

/**
 * Where each opportunity was seen in earlier reports: key -> the oldest report that had it,
 * ranked in its table or only found by that run (the keys kept beside it).
 * @param {string} folder - the Scout folder.
 * @param {{except?: string | string[], limit?: number}} [options] - reports to leave out (a
 *   conversation's own); how many to read (newest first).
 * @returns {Map<string, {report: string, saved: string, rank: string, ranked: boolean}>}
 */
export function seenBefore(folder, { except = [], limit = EARLIER_MAX } = {}) {
  const skip = new Set(Array.isArray(except) ? except : [except]);
  const seen = new Map();
  for (const report of listReports(folder).filter((item) => !skip.has(item.name)).slice(0, limit)) {
    // Newest first: an older report that had the same job overwrites, so the first sighting is
    // kept; within one report a ranked row overwrites the same job found but not ranked.
    for (const key of seenKeys(folder, report.name) ?? []) seen.set(key, { report: report.name, saved: report.saved, rank: '', ranked: false });
    for (const row of reportRows(folder, report.name)) {
      for (const key of keysOf(row)) seen.set(key, { report: report.name, saved: report.saved, rank: String(row.rank ?? ''), ranked: true });
    }
  }
  return seen;
}

/**
 * This conversation's postings against one earlier report.
 * @param {object[]} postings - from the store.
 * @param {object[]} rows - the earlier report's table.
 * @param {Set<string> | null} [found] - the keys of every posting that run found (seenKeys); null when not kept.
 * @returns {{fresh: object[], again: {posting: object, row: object}[], unranked: object[], gone: object[]}}
 *   fresh: in neither; again: ranked then; unranked: found then but not ranked; gone: ranked then, not found now.
 */
export function compare(postings, rows, found = null) {
  const byKey = new Map();
  for (const row of rows) for (const key of keysOf(row)) byKey.set(key, row);
  const matched = new Set();
  const fresh = [];
  const again = [];
  const unranked = [];
  for (const posting of postings) {
    const keys = keysOf(posting);
    const row = keys.map((key) => byKey.get(key)).find(Boolean);
    if (row) {
      matched.add(row);
      again.push({ posting, row });
    } else if (found && keys.some((key) => found.has(key))) unranked.push(posting);
    else fresh.push(posting);
  }
  return { fresh, again, unranked, gone: rows.filter((row) => !matched.has(row)) };
}
