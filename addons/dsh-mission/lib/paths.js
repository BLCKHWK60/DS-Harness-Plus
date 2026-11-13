/**
 * Where a tool call reaches: inside the conversation's folder or outside it. Paths are compared in
 * their real spelling, so a link that points out of the folder counts as outside.
 */
import { existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** The folder Mission keeps its checkpoints in, inside the conversation's folder. */
export const OWN_FOLDER = '.dsh-mission';

/** Argument names that hold one path. */
const PATH_KEYS = ['file_path', 'path', 'file', 'filename', 'directory', 'dir', 'folder', 'cwd', 'notebook_path', 'target', 'source', 'destination', 'output', 'output_path', 'input_path'];
/** Argument names that hold a list of paths. */
const LIST_KEYS = ['files', 'paths', 'file_paths'];

/**
 * A path in its real spelling. A path that does not exist yet takes the real spelling of the
 * nearest folder that does.
 * @param {string} path - an absolute path.
 * @returns {string} the real path.
 */
export function real(path) {
  let head = resolve(path);
  const tail = [];
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      return tail.length > 0 ? join(realpathSync(head), ...tail.reverse()) : realpathSync(head);
    } catch {
      const up = dirname(head);
      if (up === head) break;
      tail.push(basename(head));
      head = up;
    }
  }
  return resolve(path);
}

/** @returns {boolean} whether `path` is `root` or lies inside it. Both in their real spelling. */
export function isInside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/**
 * @param {unknown} text - a path as the model wrote it.
 * @param {string} cwd - the conversation's folder.
 * @param {string} [home] - the user's home folder.
 * @returns {string} the absolute path, not yet in its real spelling; '' when it is not a path.
 */
export function absolute(text, cwd, home = homedir()) {
  let path = String(text ?? '').trim();
  if (!path || path.includes('\0') || path.length > 4000) return '';
  if (path === '~') path = home;
  else if (path.startsWith('~/')) path = join(home, path.slice(2));
  return isAbsolute(path) ? resolve(path) : resolve(cwd, path);
}

/**
 * The paths a tool call names in its arguments.
 * @param {unknown} args - the call's arguments.
 * @param {string} cwd - the conversation's folder.
 * @returns {string[]} real absolute paths, each once.
 */
export function pathsOf(args, cwd) {
  if (!args || typeof args !== 'object') return [];
  const found = [];
  for (const key of PATH_KEYS) if (typeof args[key] === 'string') found.push(args[key]);
  for (const key of LIST_KEYS) if (Array.isArray(args[key])) for (const item of args[key]) if (typeof item === 'string') found.push(item);
  return [...new Set(found.map((text) => absolute(text, cwd)).filter(Boolean).map(real))];
}

/** Places that belong to the system or to tools, not to the user's own files. */
const SYSTEM = ['/usr', '/bin', '/sbin', '/opt', '/System', '/Library', '/Applications', '/dev', '/etc', '/private/etc', '/var', '/private/var', '/tmp', '/private/tmp', '/nix', '/proc', '/sys'];

/** @returns {boolean} whether a path is one of the system's or a tool's, so reading it gives nothing of the user's away. */
export function isSystem(path) {
  return SYSTEM.some((root) => path === root || path.startsWith(`${root}/`));
}

/**
 * The places outside the conversation's folder that a terminal command names. This reads the
 * command's text; it cannot see what a script does once it runs. Writes outside are stopped by
 * the app's own sandbox whatever this finds.
 * @param {unknown} command - the command line.
 * @param {string} root - the conversation's folder, in its real spelling.
 * @param {string} [home] - the user's home folder.
 * @returns {string[]} real absolute paths outside the folder that are not the system's, each once.
 */
export function outsideInCommand(command, root, home = homedir()) {
  const text = String(command ?? '');
  const words = text.replace(/\$\{?HOME\}?/g, home).split(/[\s;|&<>()`'"=,:]+/).filter(Boolean);
  const outside = new Set();
  for (const word of words) {
    if (!(word.startsWith('/') || word === '~' || word.startsWith('~/') || word === '..' || word.startsWith('../') || word.includes('/../'))) continue;
    // Not a path: an option such as /dev/null is handled by isSystem, a lone "/" is a division or the root.
    // The rest of a web address ("//host/…") is not a place on this Mac.
    if (word.startsWith('//')) continue;
    const path = absolute(word, root, home);
    if (!path || path === '/') continue;
    // "/api/users" in a search pattern is not a place either: its first part does not exist.
    if (!existsSync(`/${path.split('/')[1]}`)) continue;
    const actual = real(path);
    if (isInside(root, actual) || isSystem(actual)) continue;
    outside.add(actual);
  }
  return [...outside];
}

/** @returns {string} a path as it is shown: relative to the folder when inside it. */
export function shown(root, path) {
  return isInside(root, path) ? relative(root, path) || '.' : path;
}

/** @returns {boolean} whether there is a file or folder at the path. */
export const exists = (path) => existsSync(path);
