/**
 * Scratch (the owner's plan, "Scratch: a conversation with no folder"), step 32: the hidden place.
 *
 * The app lets a conversation take its first message only when it belongs to a project (lab trial 1:
 * otherwise its box reads "Choose a workspace to start"). So, as the owner chose, Scratch is ONE hidden
 * project in the app's home, `<home>/scratch`, like the Recon room, and each Scratch conversation
 * ("thread") works in its own sub-folder there, named after the conversation. Deleting a thread later
 * removes its sub-folder (step 34). Nothing here is visible yet.
 */
import { chmodSync, closeSync, constants as fsConstants, copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

/** The project's name in the app's folder list. */
export const SCRATCH_TITLE = 'Scratch';

/** @returns {string} a conversation id safe as a folder name ('' when it is not one). */
export function threadName(sessionId) {
  const id = String(sessionId ?? '');
  return /^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(id) ? id : '';
}

/** @returns {string} a path with symbolic links resolved where it exists (and `/private` for macOS's /tmp and /var). */
function real(path, realpath = realpathSync) {
  const text = String(path ?? '');
  if (!text || !isAbsolute(text)) return '';
  try {
    return realpath(text);
  } catch {
    // Not there (yet): resolve what exists of it, so a sub-folder still compares with its place.
    const parent = resolve(text, '..');
    if (parent === text) return text;
    const head = real(parent, realpath);
    return head ? join(head, text.slice(parent.length + 1)) : resolve(text);
  }
}

/**
 * @param {string} path - a folder.
 * @param {string} place - the Scratch place.
 * @param {(path: string) => string} [realpath] - for tests.
 * @returns {boolean} whether the folder is the Scratch place itself or inside it (by place, links resolved).
 */
export function isScratch(path, place, realpath = realpathSync) {
  const target = real(path, realpath);
  const root = real(place, realpath);
  if (!target || !root) return false;
  const rel = relative(root, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

/** @returns {boolean} whether a folder is the Scratch place itself (where a thread's conversation is recorded). */
export function isScratchPlace(path, place, realpath = realpathSync) {
  const target = real(path, realpath);
  return Boolean(target) && target === real(place, realpath);
}

/** @returns {string} the folder a Scratch thread works in ('' for an id that cannot be a folder name). */
export function threadFolder(place, sessionId) {
  const name = threadName(sessionId);
  return name && place ? join(place, name) : '';
}

/**
 * The folder a conversation is kept to, from its header ('' when it is not a Scratch conversation).
 * A Scratch thread is recorded at the place itself and works in `<place>/<its id>`. A helper it starts
 * records the same place (the app copies the parent's folder), so it is kept to the folder of the
 * thread that started it, through any helpers in between (`rootOf`: helper id -> thread id).
 * A conversation recorded inside the place (not at it) is kept to the thread folder it is in.
 * @param {{id?: string, cwd?: string, origin?: string, parentSession?: string}} header
 * @param {string} place
 * @param {Map<string, string>} [rootOf]
 */
export function threadFolderOf(header, place, rootOf = new Map(), realpath = realpathSync) {
  const cwd = typeof header?.cwd === 'string' ? header.cwd : '';
  if (!cwd || !place || !isScratch(cwd, place, realpath)) return '';
  if (isScratchPlace(cwd, place, realpath)) {
    const id = header.origin === 'subagent' && header.parentSession ? rootOf.get(header.parentSession) ?? header.parentSession : header.id;
    return threadFolder(place, id);
  }
  const first = relative(real(place, realpath), real(cwd, realpath)).split(sep)[0];
  return threadName(first) ? join(place, first) : '';
}

/**
 * The name the app's message store gives a folder (dsh-session-persistence-jsonl format.ts
 * projectKey). It is lossy (`/` and `-` both become `-`), so another folder can share the Scratch
 * place's store name: a user's `~/.dsh-scratch` and `~/.dsh/scratch` do. Scratch is therefore always
 * told apart by its place (isScratch), never by this name.
 */
export function storeKey(cwd) {
  let readable = '';
  let separatorRun = false;
  for (const ch of String(cwd ?? '')) {
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!separatorRun) readable += '-';
      separatorRun = true;
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch;
      separatorRun = false;
    } else {
      // The app walks UTF-16 code units; a character outside the basic plane is two of them.
      for (let i = 0; i < ch.length; i += 1) readable += `~${ch.charCodeAt(i).toString(16).toUpperCase().padStart(4, '0')}`;
      separatorRun = false;
    }
  }
  const slug = readable.replace(/^-+/, '') || 'root';
  return `--${slug.slice(0, 251)}--`;
}

/**
 * @param {string} path - the folder asked for (absolute, or relative to `cwd`).
 * @param {string} cwd - the thread's current working folder.
 * @param {string} folder - the thread's own folder.
 * @returns {boolean} whether the thread may work there: its own folder or inside it.
 */
export function insideThread(path, cwd, folder, realpath = realpathSync, home = homedir()) {
  if (!folder) return false;
  const target = physicalPath(path, cwd ?? folder, realpath, home);
  return Boolean(target) && isScratch(target, folder, realpath);
}

/**
 * Where a path really leads, read the way the system reads it (the app's file service does the same):
 * `~` and `~/…` are the home folder, and `..` goes to the parent of where the part before it really is,
 * links followed, so `door/..` through a link leads where the link points. '' for `~user` forms.
 */
export function physicalPath(path, cwd, realpath = realpathSync, home = homedir()) {
  let text = String(path ?? '');
  if (text === '~' || text.startsWith('~/')) text = join(home, text.slice(1));
  else if (text.startsWith('~')) return '';
  let current = isAbsolute(text) ? sep : String(cwd ?? '');
  if (!isAbsolute(current)) return '';
  for (const part of text.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      let here = current;
      try {
        here = realpath(current);
      } catch {
        /* not there (yet): its spelling decides */
      }
      current = dirname(here);
    } else current = join(current, part);
  }
  return current;
}

/**
 * Make a folder for Scratch: there, the user's alone (0700). A link, or a folder that is not the
 * user's, is refused: work put there could land somewhere else.
 * @returns {string} '' when ready, else what is wrong.
 */
export function prepareFolder(path) {
  try {
    mkdirSync(path, { recursive: true, mode: 0o700 });
    const seen = lstatSync(path);
    if (seen.isSymbolicLink() || !seen.isDirectory()) return 'is a link or not a folder';
    if (typeof process.getuid === 'function' && seen.uid !== process.getuid()) return 'is not yours';
    chmodSync(path, 0o700);
    return '';
  } catch (error) {
    return String(error?.message ?? error);
  }
}

/** The most a copy of a thread's files may hold (a Fork of a thread), so a huge folder never fills the disk unseen. */
export const COPY_MAX = 200 * 1024 * 1024;

/** @returns {number} the size of a folder's files (links not followed), stopping once over `cap`. */
export function folderSize(folder, cap = COPY_MAX) {
  let total = 0;
  const walk = (at) => {
    for (const entry of readdirSync(at, { withFileTypes: true })) {
      if (total > cap) return;
      const path = join(at, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) total += lstatSync(path).size;
    }
  };
  walk(folder);
  return total;
}

/**
 * A copy of a thread (the app's Fork) gets its own folder; it starts with a copy of the thread's files,
 * so the conversation it carries on still finds them. Nothing is overwritten.
 * @returns {string} '' when copied, else why not (the folder is then made empty).
 */
export function copyThreadFiles(from, to, cap = COPY_MAX) {
  try {
    const size = folderSize(from, cap);
    if (size > cap) return `the files are larger than ${Math.round(cap / 1048576)} MB`;
    const problem = prepareFolder(to);
    if (problem) return `the folder ${problem}`;
    cpSync(from, to, { recursive: true, errorOnExist: false, force: false, verbatimSymlinks: true });
    return '';
  } catch (error) {
    return String(error?.message ?? error);
  }
}

// ---- Keep in a project (step 38) ----------------------------------------------------------------

/** The most Keep in a project copies in one go. */
export const KEEP_MAX = 1024 * 1024 * 1024;

/** @returns {string} a folder name from a conversation's title: no slashes, no leading dot, at most 60 characters. */
export function keepFolderName(title, sessionId) {
  const clean = String(title ?? '').replace(/[\u0000-\u001f\u007f/\\:]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 60).trim();
  return clean || `Scratch ${String(sessionId ?? '').replace(/^session-/, '').slice(0, 8) || 'files'}`;
}

/** @returns {string} `name`, or `name 2`, `name 3`… : the first that does not exist in `parent`. */
export function freeName(parent, name) {
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? name : `${name} ${n}`;
    if (!existsSync(join(parent, candidate))) return candidate;
  }
  throw new Error('no free folder name');
}

/**
 * Copy a thread's files into a new sub-folder of a project: never over anything that exists.
 * @returns {{folder: string, copied: boolean}} the new folder ('' when the thread has no files yet).
 */
export function keepInProject(from, project, title, sessionId, cap = KEEP_MAX) {
  if (!isAbsolute(String(project ?? ''))) throw new Error('not a project folder');
  const seen = lstatSync(project);
  if (seen.isSymbolicLink() || !seen.isDirectory()) throw new Error('the project folder is not a folder');
  let names = [];
  try {
    names = from && lstatSync(from).isDirectory() ? readdirSync(from) : [];
  } catch {
    names = [];
  }
  if (names.length === 0) return { folder: '', copied: false };
  if (folderSize(from, cap) > cap) throw new Error(`its files are larger than ${Math.round(cap / 1048576)} MB; copy them by hand with Show in Finder`);
  const folder = join(project, freeName(project, keepFolderName(title, sessionId)));
  cpSync(from, folder, { recursive: true, errorOnExist: true, force: false, verbatimSymlinks: true });
  return { folder, copied: true };
}

// ---- Dropped files (step 39) --------------------------------------------------------------------

/** @returns {string} a dropped file's name, safe as one file name ('' when nothing is left). */
export function droppedName(name) {
  return basename(String(name ?? '').replace(/[\u0000-\u001f\u007f]+/g, '').replace(/[/\\:]+/g, '_')).replace(/^\.+/, '').slice(0, 200).trim();
}

/**
 * Copy a file dropped into a Scratch conversation into its folder, under its own name. The same file
 * dropped again (same name and size) is not copied twice; another file of that name gets `name 2.ext`.
 * @returns {string} the name it has in the folder ('' when nothing was copied).
 */
export function copyDropped(hostPath, folder, name) {
  const clean = droppedName(name);
  if (!clean || !isAbsolute(String(hostPath ?? '')) || !isAbsolute(String(folder ?? ''))) return '';
  const source = statSync(hostPath);
  if (!source.isFile()) return '';
  const stem = clean.slice(0, clean.length - extname(clean).length) || clean;
  const ext = clean.slice(stem.length);
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? clean : `${stem} ${n}${ext}`;
    const target = join(folder, candidate);
    let seen;
    try {
      seen = lstatSync(target);
    } catch {
      seen = undefined;
    }
    if (!seen) {
      // Never through a link or over anything: the copy fails if something appeared there meanwhile.
      copyFileSync(hostPath, target, fsConstants.COPYFILE_EXCL);
      return candidate;
    }
    // The same file dropped again (same bytes) is not copied twice; anything else gets the next name.
    if (seen.isFile() && !seen.isSymbolicLink() && seen.size === source.size && sameBytes(hostPath, target)) return candidate;
  }
  return '';
}

/** @returns {boolean} whether two files hold the same bytes (read in parts, so a large file is fine). */
function sameBytes(a, b) {
  const digest = (file) => {
    const hash = createHash('sha256');
    const handle = openSync(file, 'r');
    try {
      const chunk = Buffer.alloc(1 << 20);
      for (let read = readSync(handle, chunk); read > 0; read = readSync(handle, chunk)) hash.update(chunk.subarray(0, read));
    } finally {
      closeSync(handle);
    }
    return hash.digest('hex');
  };
  try {
    return digest(a) === digest(b);
  } catch {
    return false;
  }
}
