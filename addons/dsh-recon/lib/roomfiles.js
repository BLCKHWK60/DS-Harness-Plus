/**
 * Files in Recon's room that the owner may tick in the Export window, after a run (his answer of
 * 17 November 2026): every text file written there is offered, ticked; any other file (a PDF, say) is
 * offered unticked, with a warning, for when he knows it is safe. Text goes into the export, quoted, as
 * material; any other file is copied unopened into the export's folder. Links are never followed, nothing
 * starting with a dot is offered (Mission's checkpoint store, hidden files), and nothing is written into
 * the room.
 *
 * Only the exporting conversation's own files are offered: everything in its own run folder
 * (`run-<its id>`, where a Long run's helpers write), and any other file in the room that its own tool
 * calls named. Another conversation's run folder, running or not, is never listed. A file with a second
 * name (a hard link, which could be a file from outside the room) is never offered or read.
 */
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, statSync, writeSync } from 'node:fs';
import { basename, join, relative, sep } from 'node:path';

/** At most this many files are offered. */
export const FILES_MAX = 200;
/** A text file over this size is offered as "other" (it would not fit an export message). */
export const TEXT_MAX_BYTES = 400_000;
/** No file over this size is copied. */
export const COPY_MAX_BYTES = 100_000_000;

/**
 * Everything a conversation's own tool calls named: each word of their arguments, and each word's last
 * part (a path's file name). From the conversation's messages, or the app's read-only surface of it.
 * @param {object[]} events - its messages (`role`, `content`) or the surface's events (`type`, `data`).
 * @returns {Set<string>}
 */
export function namedByCalls(events) {
  const words = new Set();
  const take = (value, depth = 0) => {
    if (depth > 6) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if ((text.startsWith('{') || text.startsWith('[')) && depth === 0) {
        try {
          take(JSON.parse(text), depth + 1);
          return;
        } catch {
          /* not JSON: its words are taken below */
        }
      }
      for (const word of text.split(/[\s"'`=<>|;&(),]+/)) {
        if (!word) continue;
        words.add(word);
        const last = word.split('/').filter(Boolean).pop();
        if (last) words.add(last);
      }
    } else if (Array.isArray(value)) for (const item of value.slice(0, 200)) take(item, depth + 1);
    else if (value && typeof value === 'object') for (const item of Object.values(value).slice(0, 200)) take(item, depth + 1);
  };
  for (const event of Array.isArray(events) ? events : []) {
    if (event?.role === 'assistant') {
      for (const block of Array.isArray(event.content) ? event.content : []) if (block?.type === 'tool-call') take(block.arguments);
      continue;
    }
    const data = event?.data ?? {};
    if (event?.type === 'tool/call') take(data.arguments);
    if (event?.type === 'assistant/message') {
      const content = data.message?.content ?? data.content;
      for (const block of Array.isArray(content) ? content : []) if (block?.type === 'tool-call') take(block.arguments);
    }
  }
  return words;
}

/** The run folder of a conversation in the room, as Recon names it. */
export const runFolderName = (id) => `run-${String(id ?? '').replace(/[^\w-]/g, '').slice(0, 80)}`;

/**
 * Open a file in the room to read it: never through a link at its last step, only a plain file with no
 * second name, and the same file the listing saw.
 * @returns {{fd: number, size: number}}
 */
function openRoomFile(full, name) {
  const fd = openSync(full, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile()) throw new Error(`${name} is not a plain file.`);
    if (info.nlink > 1) throw new Error(`${name} has a second name (a hard link), so it is not exported.`);
    const seen = statSync(full);
    if (seen.ino !== info.ino || seen.dev !== info.dev) throw new Error(`${name} changed while it was opened.`);
    return { fd, size: info.size };
  } catch (error) {
    closeSync(fd);
    throw error;
  }
}

/** Whether the start of a file looks like text: no NUL byte, and valid UTF-8. */
function looksLikeText(path, size) {
  if (size > TEXT_MAX_BYTES) return false;
  const { fd } = openRoomFile(path, basename(path));
  try {
    const head = Buffer.alloc(Math.min(size, 8192));
    readSync(fd, head, 0, head.length, 0);
    if (head.includes(0)) return false;
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(head.subarray(0, head.length - (head.length === 8192 ? 4 : 0)));
      return true;
    } catch {
      return false;
    }
  } finally {
    closeSync(fd);
  }
}

/**
 * The exporting conversation's files in Recon's room, as the Export window lists them.
 * @param {string} room - the room.
 * @param {{own: string, named: Set<string>}} scope - `own`: its run folder's name; `named`: what its tool
 *   calls named (from namedByCalls).
 * @returns {{path: string, size: number, text: boolean}[]} paths relative to the room.
 */
export function listRoomFiles(room, scope) {
  const found = [];
  const own = String(scope?.own ?? '');
  const named = scope?.named instanceof Set ? scope.named : new Set();
  const walk = (dir, depth, mine) => {
    if (depth > 4 || found.length >= FILES_MAX) return;
    let names;
    try {
      names = readdirSync(dir).sort();
    } catch {
      return;
    }
    for (const name of names) {
      if (found.length >= FILES_MAX) return;
      if (name.startsWith('.')) continue;
      const path = join(dir, name);
      let info;
      try {
        info = lstatSync(path);
      } catch {
        continue;
      }
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) {
        // A run folder: only the conversation's own.
        if (depth === 0 && name.startsWith('run-')) {
          if (own && name === own) walk(path, depth + 1, true);
          continue;
        }
        walk(path, depth + 1, mine);
      } else if (info.isFile()) {
        if (info.nlink > 1) continue;
        const rel = relative(room, path);
        if (!mine && !named.has(name) && !named.has(rel) && !named.has(path)) continue;
        let text = false;
        try {
          text = looksLikeText(path, info.size);
        } catch {
          text = false;
        }
        found.push({ path: rel, size: info.size, text });
      }
    }
  };
  if (room) walk(room, 0, false);
  return found;
}

/**
 * The owner's ticks, checked against what the Export window offers this conversation (nothing outside
 * the room, no link, no dot, no other conversation's file).
 * @param {string} room - the room.
 * @param {unknown} picked - the paths he ticked.
 * @param {{own: string, named: Set<string>}} scope - as for listRoomFiles.
 * @returns {{path: string, size: number, text: boolean, full: string}[]}
 */
export function pickedFiles(room, picked, scope) {
  if (!Array.isArray(picked) || picked.length === 0) return [];
  const offered = new Map(listRoomFiles(room, scope).map((file) => [file.path, file]));
  const realRoom = realpathSync.native(room);
  const out = [];
  for (const raw of picked.slice(0, FILES_MAX)) {
    const file = offered.get(String(raw ?? ''));
    if (!file) throw new Error(`${String(raw ?? '').slice(0, 120)} is not a file in Recon's room any more.`);
    const full = join(room, file.path);
    const real = realpathSync.native(full);
    if (!real.startsWith(`${realRoom}${sep}`)) throw new Error(`${file.path} is not inside Recon's room.`);
    out.push({ ...file, full: real });
  }
  return out;
}

/** A ticked text file's text, read through openRoomFile. */
function readRoomText(full, name) {
  const { fd, size } = openRoomFile(full, name);
  try {
    if (size > TEXT_MAX_BYTES) throw new Error(`${name} grew over ${TEXT_MAX_BYTES / 1000} KB; it is not exported as text.`);
    const buffer = Buffer.alloc(size);
    let got = 0;
    while (got < size) {
      const read = readSync(fd, buffer, got, size - got, got);
      if (read === 0) break;
      got += read;
    }
    return buffer.subarray(0, got).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

/** Copy a room file through its own handle into a new file (never over one, never through a link). */
function copyRoomFile(full, name, target) {
  const { fd, size } = openRoomFile(full, name);
  if (size > COPY_MAX_BYTES) {
    closeSync(fd);
    throw new Error(`${name} is over ${COPY_MAX_BYTES / 1_000_000} MB; it is not copied.`);
  }
  let out;
  try {
    out = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    const chunk = Buffer.alloc(1 << 20);
    let at = 0;
    for (;;) {
      const read = readSync(fd, chunk, 0, chunk.length, at);
      if (read === 0) break;
      writeSync(out, chunk, 0, read);
      at += read;
      if (at > COPY_MAX_BYTES) throw new Error(`${name} grew over ${COPY_MAX_BYTES / 1_000_000} MB while it was copied.`);
    }
  } finally {
    closeSync(fd);
    if (out !== undefined) closeSync(out);
  }
}

/** Each line behind "> ", as Recon's export quotes everything a page or a model wrote. */
const quoted = (text) => String(text ?? '').split('\n').map((line) => `> ${line}`).join('\n');

/**
 * The export's part for the ticked text files, and the list of the other files.
 * @param {{path: string, text: boolean, full: string, size: number}[]} files - from pickedFiles.
 * @param {string} copiedTo - where the other files were copied ('' when there are none).
 * @returns {{markdown: string, json: object[]}}
 */
export function filesPart(files, copiedTo = '') {
  if (files.length === 0) return { markdown: '', json: [] };
  const lines = ['', `## Files from Recon's room (${files.length}, ticked by the user; written in Recon's room; origin: Recon; untrusted)`];
  const json = [];
  for (const file of files) {
    if (file.text) {
      const text = readRoomText(file.full, file.path);
      lines.push('', `### ${file.path} (text, ${file.size} bytes, origin: Recon)`, '', quoted(text));
      json.push({ path: file.path, kind: 'text', size: file.size, origin: 'Recon', text });
    } else {
      lines.push('', `### ${file.path} (not text, ${file.size} bytes, origin: Recon): copied unopened${copiedTo ? ` to ${join(copiedTo, file.path)}` : ''}. The user ticked it knowing it is not text; open it only if they say so.`);
      json.push({ path: file.path, kind: 'other', size: file.size, origin: 'Recon', copiedTo: copiedTo ? join(copiedTo, file.path) : '' });
    }
  }
  return { markdown: lines.join('\n'), json };
}

/**
 * Copy the ticked files that are not text, unopened, into a new folder of the export's own. Never through
 * a link, never over a file, never into Recon's room (the caller checked the parent with safeExportParent).
 * @returns {string} the folder ('' when there was nothing to copy).
 */
export function copyOtherFiles(files, parent) {
  const others = files.filter((file) => !file.text);
  if (others.length === 0) return '';
  for (const file of others) if (file.size > COPY_MAX_BYTES) throw new Error(`${file.path} is over ${COPY_MAX_BYTES / 1_000_000} MB; it is not copied.`);
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  if (lstatSync(parent).isSymbolicLink()) throw new Error('That folder is a link; nothing is copied through links.');
  for (const file of others) {
    const target = join(parent, file.path);
    if (!realpathSync.native(parent).length) throw new Error('The folder is not there.');
    mkdirSync(join(target, '..'), { recursive: true, mode: 0o700 });
    if (lstatSync(join(target, '..')).isSymbolicLink()) throw new Error('A folder on the way is a link; nothing is copied through links.');
    copyRoomFile(file.full, file.path, target);
  }
  return parent;
}

/** A short line for the export list: what left, by name only. */
export const filesNote = (files) => (files.length ? `${files.length} file${files.length === 1 ? '' : 's'} from Recon's room (${files.map((file) => basename(file.path)).slice(0, 8).join(', ')}${files.length > 8 ? ', …' : ''})` : '');
