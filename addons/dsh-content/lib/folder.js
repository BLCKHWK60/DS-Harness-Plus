/**
 * The subject folder: Content's own parts inside a conversation's folder, what the folder holds (the
 * inventory), and saving a file into one of Content's parts without ever replacing anything.
 *
 * Rules, enforced here:
 * - Content writes only into its own parts (research, notes, drafts, publish) of the folder.
 * - A part that is a link, or leads out of the folder, is never written into.
 * - A file is never replaced: a save is always a new file (`wx`), and a draft gets the next number.
 * - The user's own files are read for the inventory only; nothing is moved, renamed or deleted.
 */
import { closeSync, lstatSync, mkdirSync, openSync, readdirSync, realpathSync, writeSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, sep } from 'node:path';

/** Content's own parts of the subject folder, in the order they are shown. */
export const PARTS = [
  { id: 'research', about: 'material that came in: kept as it came, only added to' },
  { id: 'notes', about: "the user's own words: notes, transcripts, answers" },
  { id: 'drafts', about: 'numbered drafts' },
  { id: 'publish', about: 'titles, descriptions, show notes' },
];
/** Files the later steps keep at the top of the subject folder; the inventory reports them. */
export const TOP_FILES = ['brief.md', 'ledger.md', 'outline.md'];
/** Parts the later steps add (approval comes with them); the inventory reports them when present. */
export const LATER_PARTS = ['final'];

/** What the inventory looks at. */
export const SCAN_MAX = 4000;
export const DEPTH_MAX = 5;
export const LIST_MAX = 120;
/** The largest file content_save writes. */
export const SAVE_MAX = 2 * 1024 * 1024;
const SKIP = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', '.cache', '.Trash']);

/** File kinds, the endings that make them, and which tool reads them. */
export const KINDS = [
  { id: 'text', label: 'Markdown and text', endings: ['.md', '.markdown', '.txt', '.text', '.org', '.rst'], reader: 'read' },
  { id: 'json', label: 'JSON and YAML', endings: ['.json', '.jsonl', '.ndjson', '.yaml', '.yml'], reader: 'read' },
  { id: 'pdf', label: 'PDF', endings: ['.pdf'], reader: 'pdf_read' },
  { id: 'word', label: 'Word and other documents', endings: ['.docx', '.doc', '.odt', '.rtf', '.pages'], reader: 'data_text' },
  { id: 'sheet', label: 'Spreadsheets and tables', endings: ['.csv', '.tsv', '.xlsx', '.xls', '.ods', '.numbers'], reader: 'data_query' },
  { id: 'web', label: 'Web pages', endings: ['.html', '.htm', '.xml'], reader: 'data_text' },
  { id: 'image', label: 'Pictures', endings: ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.tif', '.tiff'], reader: 'read_image' },
  { id: 'media', label: 'Audio and video', endings: ['.mp3', '.m4a', '.wav', '.aac', '.flac', '.ogg', '.mp4', '.mov', '.m4v', '.mkv', '.webm'], reader: '' },
];
/** Apple's own formats (Pages, Numbers) are packages the Data add-on cannot open. */
const UNREADABLE = new Set(['.pages', '.numbers']);

/** @returns {object | undefined} the kind of a file, by its ending. */
export function kindOf(name) {
  const ending = extname(String(name ?? '')).toLowerCase();
  return KINDS.find((kind) => kind.endings.includes(ending));
}

export const sizeText = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 102.4) / 10} KB` : `${Math.round(bytes / 1024 / 102.4) / 10} MB`);
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

/**
 * A short, safe file name from what the model asked for.
 * @param {unknown} name - the wished name.
 * @param {string} [fallback] - when nothing usable is left.
 * @returns {string} lowercase words joined by dashes, at most 60 characters, no ending.
 */
export function slugOf(name, fallback = 'untitled') {
  const base = String(name ?? '').replace(/\.(md|markdown|txt|json)$/i, '');
  const slug = base.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  // Cut by characters, never inside one.
  return Array.from(slug).slice(0, 60).join('').replace(/-+$/, '') || fallback;
}

/**
 * Whether a folder is Recon's sealed room or inside it. Recon's rule for its room: a folder whose name
 * starts with "dsh-recon-", directly inside /tmp or the system's temporary folder. Content never reads
 * or writes there, so nothing of Recon's comes out through a Content conversation.
 * @param {string} path - a real path.
 * @returns {boolean} whether it is the room or inside it.
 */
export function inReconRoom(path) {
  // The Mac's disk does not tell capitals from small letters: /private/TMP is /private/tmp.
  const temporary = new Set(['/tmp', '/private/tmp', tmpdir()].flatMap((where) => {
    try {
      return [where, realpathSync.native(where)];
    } catch {
      return [where];
    }
  }).map((where) => where.replace(/\/+$/, '').toLowerCase()));
  let here = String(path ?? '');
  while (here && here !== dirname(here)) {
    if (/^dsh-recon-/i.test(basename(here)) && temporary.has(dirname(here).toLowerCase())) return true;
    here = dirname(here);
  }
  return false;
}

/**
 * The folder as a real directory, checked.
 * @param {string} root - the conversation's folder.
 * @returns {string} its real path.
 */
export function realRoot(root) {
  if (!root) throw new Error('This conversation has no folder. Start a Content conversation in a folder (picked on the start page), or in Scratch.');
  let real;
  try {
    real = realpathSync.native(root);
  } catch {
    throw new Error(`The conversation's folder ${root} is not there any more.`);
  }
  if (inReconRoom(real) || inReconRoom(root)) throw new Error("This conversation's folder is Recon's sealed room. Content does not read or write there. Start the Content conversation in another folder, or in Scratch.");
  if (!lstatSync(real).isDirectory()) throw new Error(`The conversation's folder ${root} is not a folder.`);
  return real;
}

/**
 * One of Content's parts as a real folder inside the subject folder, made when it is missing.
 * @param {string} root - the real subject folder.
 * @param {string} part - a part id, optionally with one subfolder (`research/conversations`).
 * @param {{make?: boolean}} [options] - make it when missing (default true).
 * @returns {string} the part's path.
 */
export function partFolder(root, part, { make = true } = {}) {
  const pieces = String(part ?? '').split('/');
  if (!PARTS.some((entry) => entry.id === pieces[0]) || pieces.length > 2 || pieces.some((piece) => !/^[a-z][a-z0-9-]{0,40}$/.test(piece))) {
    throw new Error(`Content saves only into its own parts: ${PARTS.map((entry) => entry.id).join(', ')}.`);
  }
  let path = root;
  for (const piece of pieces) {
    path = join(path, piece);
    let stat;
    try {
      stat = lstatSync(path);
    } catch {
      stat = undefined;
    }
    if (stat?.isSymbolicLink()) throw new Error(`${relative(root, path)} is a link; Content does not write through links.`);
    if (stat && !stat.isDirectory()) throw new Error(`${relative(root, path)} is a file of yours, not a folder; Content leaves it alone. Rename it to use this part.`);
    if (!stat) {
      if (!make) return path;
      mkdirSync(path, { mode: 0o700 });
    }
  }
  return path;
}

/**
 * Add Content's parts that are missing. Nothing that is there is changed.
 * @param {string} root - the conversation's folder.
 * @returns {{added: string[], had: string[], refused: string[]}} what was made, what was there, and what is in the way.
 */
export function makeLayout(root) {
  const real = realRoot(root);
  const added = [];
  const had = [];
  const refused = [];
  for (const part of PARTS) {
    let existed = true;
    try {
      lstatSync(join(real, part.id));
    } catch {
      existed = false;
    }
    try {
      partFolder(real, part.id);
      (existed ? had : added).push(part.id);
    } catch (error) {
      refused.push(`${part.id}: ${String(error?.message ?? error)}`);
    }
  }
  return { added, had, refused };
}

/**
 * Walk the folder: every file with its kind, size and date. Links are listed, never followed.
 * @param {string} root - the real folder.
 * @returns {{files: object[], links: string[], skipped: string[], cut: boolean}} what is there.
 */
function walk(root) {
  const files = [];
  const links = [];
  const skipped = [];
  let sealed = false;
  let seen = 0;
  let cut = false;
  const visit = (dir, depth) => {
    if (cut) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      skipped.push(relative(root, dir) || '.');
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (seen >= SCAN_MAX) {
        cut = true;
        return;
      }
      if (entry.name.startsWith('.')) continue;
      seen += 1;
      const path = join(dir, entry.name);
      const shown = relative(root, path);
      if (entry.isSymbolicLink()) {
        links.push(shown);
      } else if (entry.isDirectory()) {
        if (SKIP.has(entry.name)) continue;
        // Recon's sealed room is never looked into, nor named.
        if (inReconRoom(path)) {
          sealed = true;
          continue;
        }
        if (depth >= DEPTH_MAX) skipped.push(`${shown}/ (deeper than ${DEPTH_MAX} levels)`);
        else visit(path, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stat = lstatSync(path);
          files.push({ path: shown, size: stat.size, at: stat.mtimeMs, kind: kindOf(entry.name) });
        } catch {
          skipped.push(shown);
        }
      }
    }
  };
  visit(root, 0);
  return { files, links, skipped, cut, sealed };
}

/** The part a path belongs to: one of Content's, or '' for the user's own files. */
const partOf = (path) => {
  const first = String(path).split(sep)[0];
  return [...PARTS.map((part) => part.id), ...LATER_PARTS].includes(first) && String(path).includes(sep) ? first : '';
};

/**
 * What the subject folder holds, as a report for the model.
 * @param {string} root - the conversation's folder.
 * @param {{has?: (tool: string) => boolean | undefined}} [options] - whether a reading tool is there (undefined: not known).
 * @returns {string} the inventory.
 */
export function inventory(root, { has } = {}) {
  const real = realRoot(root);
  const { files, links, skipped, cut, sealed } = walk(real);
  const own = files.filter((file) => !partOf(file.path) && !TOP_FILES.includes(file.path));
  const lines = [`Inventory of ${real}, ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC.`];

  // Content's own parts first.
  const partLines = [];
  for (const id of [...PARTS.map((part) => part.id), ...LATER_PARTS]) {
    let there = false;
    try {
      there = lstatSync(join(real, id)).isDirectory();
    } catch {
      there = false;
    }
    if (!there) continue;
    const inPart = files.filter((file) => partOf(file.path) === id).sort((a, b) => b.at - a.at);
    const newest = inPart[0] ? `, newest ${inPart[0].path} (${dayOf(inPart[0].at)})` : '';
    partLines.push(`- ${id}/: ${inPart.length} file${inPart.length === 1 ? '' : 's'}${newest}`);
  }
  for (const name of TOP_FILES) if (files.some((file) => file.path === name)) partLines.push(`- ${name}: there`);
  lines.push('', partLines.length > 0 ? "Content's own parts:" : `Content's own parts: none yet. content_setup adds them (${PARTS.map((part) => `${part.id}/`).join(', ')}); content_save adds the one it needs.`);
  lines.push(...partLines);

  // The user's files, by kind.
  if (own.length === 0) {
    lines.push('', 'Files of the user: none. The material can come from other conversations (content_bring_in), from what the user writes, or from the web.');
  } else {
    lines.push('', `Files of the user: ${own.length}${cut ? ` (the first ${SCAN_MAX} entries looked at; there are more)` : ''}, ${sizeText(own.reduce((sum, file) => sum + file.size, 0))} in all.`);
    const groups = [...KINDS, { id: 'other', label: 'Other files', reader: '' }];
    for (const kind of groups) {
      const mine = own.filter((file) => (file.kind?.id ?? 'other') === kind.id);
      if (mine.length === 0) continue;
      const unreadable = mine.filter((file) => UNREADABLE.has(extname(file.path).toLowerCase()));
      const there = kind.reader ? has?.(kind.reader) : undefined;
      const how = !kind.reader
        ? kind.id === 'media' ? 'cannot be read: a transcript is needed' : 'not read by Content'
        : there === false ? `${kind.reader} would read them, but it is not available here` : `read with ${kind.reader}`;
      lines.push(`- ${kind.label}: ${mine.length} (${how}${unreadable.length > 0 ? `; ${unreadable.length} in an Apple format that cannot be read: export them to PDF or Word first` : ''})`);
    }
    lines.push('', 'The files, newest first:');
    const shown = [...own].sort((a, b) => b.at - a.at).slice(0, LIST_MAX);
    for (const file of shown) lines.push(`- ${file.path} · ${sizeText(file.size)} · ${dayOf(file.at)}`);
    if (own.length > shown.length) lines.push(`- … and ${own.length - shown.length} more`);
  }
  if (links.length > 0) lines.push('', `Links, not followed: ${links.slice(0, 20).join(', ')}${links.length > 20 ? ` and ${links.length - 20} more` : ''}.`);
  if (sealed) lines.push('', "Recon's sealed room is inside this folder and was left out: Content never looks into it.");
  if (skipped.length > 0) lines.push('', `Not looked into: ${skipped.slice(0, 10).join(', ')}${skipped.length > 10 ? ` and ${skipped.length - 10} more` : ''}.`);
  return lines.join('\n');
}

/** The next draft number in a drafts folder: one more than the highest `NNN-` there. */
function nextNumber(folder) {
  let high = 0;
  try {
    for (const name of readdirSync(folder)) {
      // Content's own names (001-…), never a date (2025-11-03-…).
      const found = /^(\d{3,6})-(?!\d\d-\d\d-)/.exec(name);
      if (found) high = Math.max(high, Number(found[1]));
    }
  } catch {
    high = 0;
  }
  return high + 1;
}

/** Write a new file and never replace one: `wx` fails when the name is taken. @returns {boolean} whether it was written. */
function writeNew(path, text) {
  let fd;
  try {
    fd = openSync(path, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
  try {
    writeSync(fd, text);
  } finally {
    closeSync(fd);
  }
  return true;
}

/**
 * Save a text as a new file in one of Content's parts. Drafts are numbered (`drafts/003-chapter-one.md`);
 * the other parts are dated (`notes/2026-11-16-interview.md`). A taken name gets `-2`, `-3`, …
 * @param {string} root - the conversation's folder.
 * @param {{part: string, name: string, text: string, ending?: string}} file - where, the wished name, the text, and `.md` (default), `.txt` or `.json`.
 * @param {Date} [at] - the time it is saved.
 * @returns {string} the saved file, relative to the subject folder.
 */
export function saveFile(root, { part, name, text, ending = '.md' }, at = new Date()) {
  const real = realRoot(root);
  const body = String(text ?? '');
  if (!body.trim()) throw new Error('There is no text to save.');
  if (Buffer.byteLength(body, 'utf8') > SAVE_MAX) throw new Error(`The text is larger than ${sizeText(SAVE_MAX)}. Save it in parts (one chapter or section per file).`);
  const end = ['.md', '.txt', '.json'].includes(String(ending).toLowerCase()) ? String(ending).toLowerCase() : '.md';
  const folder = partFolder(real, part);
  const inside = () => {
    const now = realpathSync.native(folder);
    if (!now.toLowerCase().startsWith(`${real.toLowerCase()}${sep}`)) throw new Error(`${part} no longer leads into the subject folder; nothing was saved.`);
  };
  const slug = slugOf(name);
  const pad = (n) => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
  const drafts = String(part).split('/')[0] === 'drafts';
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const stem = drafts ? `${String(nextNumber(folder) + (attempt > 0 ? attempt : 0)).padStart(3, '0')}-${slug}` : `${day}-${slug}${attempt > 0 ? `-${attempt + 1}` : ''}`;
    const path = join(folder, `${stem}${end}`);
    inside();
    if (writeNew(path, body.endsWith('\n') ? body : `${body}\n`)) return relative(real, path);
  }
  throw new Error('No free file name was found.');
}
