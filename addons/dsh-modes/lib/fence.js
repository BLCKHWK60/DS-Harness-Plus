/**
 * Item 4A, fix round 2: the folder fence of Plain chat (the owner's answer of 22 November 2026: "a standalone chat
 * reaches only its own folder, a project chat its project folder").
 *
 * The app's own file sandbox keeps writes inside the session's folder, but a standalone (Scratch) thread's session
 * folder is the whole Scratch place, where every other standalone thread keeps its files, and the sandbox does not limit
 * reading at all. So a Plain chat thread is fenced here: every path a tool call names (file tools, a command's words, a
 * program's text, a patch's headers) must lie inside the thread's own folder: its Scratch sub-folder when it is
 * standalone, its project folder otherwise. A few system places (programs, /dev/null) may still be read.
 *
 * A setting with a default (`plainFence`, on): Settings → Modes → "Keep Plain chat inside its folder".
 * Pure apart from reading the real spelling of paths, so it is tested without the app.
 */
import { existsSync, realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** The modes the fence applies to. Only Plain chat for now (the owner's answer names Plain chat). */
export const FENCED_MODES = Object.freeze(['plain']);

/** Argument names that hold one path (as Mission's lib/paths.js reads them; `cd` is the app's working_directory tool). */
const PATH_KEYS = ['file_path', 'path', 'file', 'filename', 'directory', 'dir', 'folder', 'cwd', 'cd', 'notebook_path', 'target', 'source', 'destination', 'output', 'output_path', 'input_path', 'workdir', 'working_directory'];
/** Argument names that hold a list of paths. */
const LIST_KEYS = ['files', 'paths', 'file_paths'];
/**
 * Tools whose arguments hold a command line: the app's shell tools (lib/online.js SHELL_NAMES) and the bench guard's
 * (dsh-bench lib/guard.js), plus any tool named like one (`terminal_…`, `shell_…`).
 */
export const COMMAND_TOOLS = Object.freeze(['bash', 'terminal', 'terminal_open', 'terminal_send', 'shell', 'pwsh', 'powershell', 'exec', 'run']);
const isCommandTool = (tool) => COMMAND_TOOLS.includes(tool) || /^(?:terminal|shell|bash|pwsh|powershell)_/.test(tool);
/** Argument names a command tool keeps its command line in (as the web-off guard reads them). */
const COMMAND_KEYS = ['command', 'cmd', 'script', 'text', 'input', 'keys'];
/** Argument names a command tool keeps its own working folder in (the app's bash: `workdir`). */
const WORKDIR_KEYS = ['workdir', 'cwd', 'directory', 'working_directory', 'dir'];
/** Tools whose arguments hold a program's text (the app's PTC program, Data's Python). */
export const PROGRAM_TOOLS = Object.freeze(['run_code', 'data_python']);
/** Tools that look anywhere on the Mac by nature: never inside a fenced thread. */
export const ANYWHERE_TOOLS = Object.freeze(['mac_find_files']);
/** Tools that write: a system place is never theirs. */
const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'notebook_edit', 'str_replace_editor', 'move', 'delete', 'remove']);
/**
 * System places a fenced thread may still read (programs, libraries, /dev/null). Not /tmp or /var: other threads and
 * Recon's room can live there. Not `/` itself: that is the whole disk.
 */
const SYSTEM = ['/usr', '/bin', '/sbin', '/opt', '/System', '/Library', '/Applications', '/dev', '/etc', '/private/etc', '/nix'];

/**
 * Where a path really leads, read the way the system reads it: `~` and `~/…` are the home folder, and `..` goes to the
 * parent of where the part before it really is, links followed, so `door/..` through a link leads where the link points
 * (the same walk as dsh-cowork-shell lib/scratch.js physicalPath; add-ons do not import each other's files).
 * @returns {string} an absolute path, or '' for a form that cannot be read here (`~user`).
 */
export function physical(path, cwd, home = homedir()) {
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
        here = realpathSync(current);
      } catch {
        /* not there (yet): its spelling decides */
      }
      current = dirname(here);
    } else current = join(current, part);
  }
  return current;
}

/**
 * A path in its real spelling; a path that does not exist yet takes the real spelling of the nearest folder that does.
 * `..` is read through links first (physical), so `link/..` is the link target's parent, as the system reads it.
 * @param {string} path - an absolute path.
 * @returns {string}
 */
export function real(path) {
  let head = physical(path, sep) || resolve(path);
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

/** @returns {boolean} whether `path` is `root` or lies inside it (both absolute). */
export function isInside(root, path) {
  const rel = relative(root, path);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/** @returns {boolean} whether a path is one of the system's places a fenced thread may read. */
export function isSystem(path) {
  return SYSTEM.some((root) => path === root || path.startsWith(`${root}/`));
}

/** A word that names a place this check cannot read (`~user/…`, `$VAR/…`, `$(…)/…`): outside unless proven otherwise. */
const UNREADABLE = '\0unreadable';

/** @returns {string} the absolute path of what the model wrote ('' when it is not a path; UNREADABLE for `~user`). */
function absolute(text, cwd, home) {
  const path = String(text ?? '').trim();
  if (!path || path.includes('\0') || path.length > 4000 || /^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return '';
  if (path.startsWith('~') && path !== '~' && !path.startsWith('~/')) return UNREADABLE;
  return physical(path, cwd, home) || UNREADABLE;
}

/** @returns {string[]} the paths a call's arguments name, absolute. */
function argPaths(args, cwd, home) {
  if (!args || typeof args !== 'object') return [];
  const found = [];
  for (const key of PATH_KEYS) if (typeof args[key] === 'string') found.push(args[key]);
  for (const key of LIST_KEYS) if (Array.isArray(args[key])) for (const item of args[key].slice(0, 200)) if (typeof item === 'string') found.push(item);
  // apply_patch: the files its headers name.
  const patch = typeof args.input === 'string' ? args.input : typeof args.patch === 'string' ? args.patch : '';
  if (patch) {
    for (const row of patch.split('\n').slice(0, 20000)) {
      const header = /^\*\*\*\s+(?:Add File|Update File|Delete File|Move to)\s*:\s*(.+?)\s*$/.exec(row);
      if (header) found.push(header[1]);
    }
  }
  return found.map((text) => absolute(text, cwd, home)).filter(Boolean);
}

/** @returns {boolean} whether a call's arguments name a relative path (read from the working folder). */
function namesRelative(args) {
  if (!args || typeof args !== 'object') return false;
  const rel = (text) => typeof text === 'string' && text.trim() !== '' && !isAbsolute(text.trim()) && !text.trim().startsWith('~') && !/^[a-z][a-z0-9+.-]*:\/\//i.test(text.trim());
  return PATH_KEYS.some((key) => rel(args[key])) || LIST_KEYS.some((key) => Array.isArray(args[key]) && args[key].some(rel));
}

/** Tools that search or list the working folder when no path is given. */
const SEARCH_TOOLS = new Set(['grep', 'glob', 'ls', 'list', 'list_dir', 'list_directory', 'find', 'search', 'search_files', 'tree']);
/** @returns {boolean} whether a call reads from the working folder (a relative path, or a search with no path). */
function readsWorkingFolder(tool, args) {
  if (namesRelative(args)) return true;
  if (tool === 'glob' && typeof args?.pattern === 'string' && !isAbsolute(args.pattern.trim())) return true;
  return SEARCH_TOOLS.has(tool) && !PATH_KEYS.some((key) => typeof args?.[key] === 'string' && args[key].trim());
}

/**
 * The places a command line or a program's text names (its words that look like paths). This reads the text; it cannot
 * see what a script does once it runs. `/` alone is the whole disk; `~user`, and a variable or a command's output
 * followed by a path, name a place that cannot be read here, so they count as outside; `cd` elsewhere counts too.
 * @param {string} text - the command line or the program.
 * @param {string} cwd - the folder the command runs in.
 * @param {string} [home] - the home folder.
 * @param {{program?: boolean, tmp?: string}} [options] - `program`: a program's text (no shell variables or `cd`).
 * @returns {string[]} absolute paths, not yet in their real spelling (UNREADABLE for a place that cannot be read).
 */
export function pathsInText(text, cwd, home = homedir(), { program = false, tmp = tmpdir() } = {}) {
  let source = String(text ?? '').slice(0, 200_000);
  const found = [];
  if (program) {
    // A program's '/' (or "/") is the whole disk; a bare / between spaces is division.
    if (/(['"`])\/+\1/.test(source)) found.push(sep);
  } else {
    source = source
      .replace(/\$\{?HOME\}?(?![A-Za-z0-9_])/g, home)
      .replace(/\$\{?PWD\}?(?![A-Za-z0-9_])/g, cwd)
      .replace(/\$\{?TMPDIR\}?(?![A-Za-z0-9_])/g, tmp);
    // A variable or a command's output used as (part of) a path: where it leads is not known here.
    if (/(?:\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\$\([^)]*\)|`[^`]*`)(?:\/|\.\.)/.test(source)) found.push(UNREADABLE);
    // `cd`/`pushd` anywhere but inside the folder: the next words (and the shell's next calls) start from there.
    for (const match of source.matchAll(/(?:^|[;&|(\n{]|\bthen|\bdo)\s*(?:cd|pushd|chdir)(?:\s+([^\s;&|)]+))?\s*(?=$|[;&|)\n}])/g)) {
      const target = String(match[1] ?? '').replace(/^['"]|['"]$/g, '');
      // `cd` alone is the home folder; `cd -` and `cd $X` go where this check cannot see.
      if (target === '-' || target.includes('$')) found.push(UNREADABLE);
      else found.push(`\0cd${physical(target || '~', cwd, home) || UNREADABLE}`);
    }
  }
  const words = source.split(/[\s;|&<>()`'"=,:[\]{}]+/).filter(Boolean);
  for (const word of words) {
    // The rest of a web address ("//host/…") is not a place on this Mac.
    if (word.startsWith('//')) continue;
    if (word.startsWith('~')) {
      found.push(word === '~' || word.startsWith('~/') ? physical(word, cwd, home) : UNREADABLE);
      continue;
    }
    if (!word.includes('/') && word !== '..') continue;
    if (program && !(word.startsWith('/') || word.startsWith('../') || word === '..' || word.includes('/../'))) continue;
    // A pattern's fixed part ("/Users/*" names /Users; "/*" the whole disk).
    const fixed = word.split(/[*?]/)[0];
    if (/^\/+$/.test(word)) {
      // A bare / in a program is division (its string '/' was read above); in a command it is the whole disk.
      if (!program) found.push(sep);
      continue;
    }
    if (/^\/+$/.test(fixed)) {
      found.push(sep);
      continue;
    }
    const escapes = /(?:^|\/)\.\.(?:\/|$)/.test(word);
    if (word.startsWith('/')) {
      // "/api/users" in a search pattern is not a place: its first part does not exist (unless it climbs with "..").
      if (!escapes && !existsSync(`/${fixed.split('/')[1]}`)) continue;
    }
    const path = physical(fixed || word, cwd, home);
    if (path) found.push(path);
  }
  return found;
}

/**
 * Whether a fenced thread's tool call stays inside its folder.
 * @param {object} want - the call.
 * @param {string} want.root - the thread's folder (its Scratch sub-folder, or its project folder).
 * @param {string} want.name - the tool.
 * @param {unknown} want.args - its arguments.
 * @param {string} [want.cwd] - the thread's working folder (the root when unknown). Outside the root: every relative path,
 *   command and program is refused until the working folder is back inside.
 * @param {string} [want.home] - the user's home folder.
 * @param {(path: string) => boolean} [want.isRoom] - Recon's room (never readable, also where it is a system place).
 * @returns {{ok: true} | {ok: false, path: string, kind: 'anywhere' | 'outside' | 'cwd' | 'unreadable'}} the verdict.
 */
export function fenceCheck({ root, name, args, cwd, home = homedir(), isRoom, tmp }) {
  const tool = String(name ?? '');
  if (!root || tool.startsWith('mcp__')) return { ok: true };
  if (ANYWHERE_TOOLS.includes(tool)) return { ok: false, path: '', kind: 'anywhere' };
  const base = real(root);
  const from = cwd ? real(cwd) : base;
  const command = isCommandTool(tool);
  const program = PROGRAM_TOOLS.includes(tool);
  const text = typeof args === 'string' ? args : null;
  // The command's own working folder (the app's bash `workdir`) is where its words are read from; it must be inside.
  let start = from;
  if ((command || program) && args && typeof args === 'object') {
    const own = WORKDIR_KEYS.map((key) => args[key]).find((value) => typeof value === 'string' && value.trim());
    if (own) {
      const at = absolute(own, from, home);
      const actual = at === UNREADABLE ? '' : real(at);
      if (!actual || !isInside(base, actual)) return { ok: false, path: actual || own, kind: at === UNREADABLE ? 'unreadable' : 'outside' };
      start = actual;
    }
  }
  // A working folder outside the root (moved earlier, or a move into the thread's folder that failed): the tools read
  // relative paths from there, so nothing relative is checked against the root instead.
  if (!isInside(base, start) && (command || program || readsWorkingFolder(tool, args) || (text !== null && !isAbsolute(text.trim())))) {
    return { ok: false, path: start, kind: 'cwd' };
  }
  let paths;
  if (command) {
    const line = text ?? COMMAND_KEYS.map((key) => args?.[key]).map((value) => (Array.isArray(value) ? value.join(' ') : value)).find((value) => typeof value === 'string') ?? '';
    paths = pathsInText(line, start, home, { tmp });
  } else if (program) paths = pathsInText(text ?? args?.code ?? args?.source ?? args?.script ?? '', start, home, { program: true, tmp });
  else {
    paths = argPaths(args, start, home);
    // glob: the pattern names a place too (its fixed part, and any ".." in it).
    if (tool === 'glob' && typeof args?.pattern === 'string' && args.pattern.trim()) paths.push(absolute(args.pattern.trim(), start, home));
  }
  const writes = WRITE_TOOLS.has(tool);
  for (const found of paths) {
    if (found === UNREADABLE || found.endsWith(UNREADABLE)) return { ok: false, path: '', kind: 'unreadable' };
    const moves = found.startsWith('\0cd');
    const actual = real(moves ? found.slice(3) : found);
    if (isInside(base, actual)) continue;
    if (!moves && !writes && actual !== sep && isSystem(actual) && !isRoom?.(actual)) continue;
    return { ok: false, path: actual, kind: 'outside' };
  }
  return { ok: true };
}

/**
 * What the model is told when a call is refused: what happened and what to do instead.
 * @param {{path: string, kind: string}} verdict - from fenceCheck.
 * @param {string} root - the thread's folder.
 * @returns {string}
 */
export function fenceRefusal(verdict, root) {
  const where = {
    anywhere: 'This tool searches the whole Mac',
    cwd: `This thread's working folder (${verdict.path}) is outside its own folder`,
    unreadable: 'This call names a place through a variable, a command\'s output or another user\'s home (~name), so where it leads cannot be checked',
  }[verdict.kind] ?? (verdict.path === sep ? 'The whole disk (/) is outside this thread\'s folder' : `${verdict.path} is outside this thread's folder`);
  const next = verdict.kind === 'cwd'
    ? ` First move back with the working_directory tool to ${root}, then use paths inside it.`
    : verdict.kind === 'unreadable'
      ? ' Write the path out in full, inside that folder.'
      : ' Work with the files in that folder, and search or list only inside it (not /, not the home folder).';
  return `${where}, and this Plain chat thread is kept inside its own folder (${root}), so nothing was read, changed or run.${next} If the user needs a file from elsewhere, ask them to drop it into the chat (it is copied into this folder) or to start a project thread in that folder. The owner can switch this off in Settings → Modes → "Keep Plain chat inside its folder".`;
}

/**
 * The line in a fenced thread's instructions, so what the model is told matches the fence (the app's file policy names
 * the whole session folder, which for a standalone thread is the shared Scratch place).
 * @param {string} root - the thread's folder.
 * @param {boolean} standalone - a standalone (Scratch) thread.
 * @returns {string}
 */
export function fencePrompt(root, standalone) {
  return `Folder: this thread works only inside ${root}${standalone ? ' (its own folder; other threads\' folders are not yours)' : ' (its project folder)'}. Reading, writing, searching and commands outside it are refused, even where the file policy names a wider folder. Keep every path inside it.`;
}
