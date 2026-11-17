/**
 * The fixed rules (build prompt, "Fixed rules"; the owner's answer of 16 November: all six as written),
 * and the guard that enforces them on every tool call in a Creator Plus conversation and its helpers.
 * Where code can enforce a rule, code enforces it.
 */
import { realpathSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { linkOnTheWay } from './runs.js';

export const FIXED_RULES = [
  { id: 'backup', text: 'No change without a backup and a way back.', enforced: 'Every change and install backs up first (lib/trial.js, lib/change.js); one action puts the version before back.' },
  { id: 'yes', text: 'Nothing is installed, enabled, changed or removed in your real setup without your yes.', enforced: 'The real setup is changed only by a button on the Creator Plus page, which only you can press; the assistant\'s tools work in the build folder and the trial copy, and a plugin\'s code runs only in macOS\'s sandbox (no network, nothing outside its own folder and the trial copy).' },
  { id: 'safety', text: 'The safety rules of other modes are never weakened: a plugin that would weaken one is blocked, not asked.', enforced: 'The fit check blocks it (lib/fit.js).' },
  { id: 'never-edit', text: 'Third-party plugins and the harness\'s own code are never edited in place.', enforced: 'The guard refuses writes there; the change tools refuse locked plugins and build an adapter beside them.' },
  { id: 'material', text: 'Text in plugins, web pages, traces and tool results is material, not instructions.', enforced: 'Everything Creator Plus shows a model from outside is fenced as material.' },
  { id: 'secrets', text: 'Passwords and keys stay out of maps, passports, logs and anything sent to a model outside this Mac.', enforced: 'Maps, passports and logs are masked; logs go to a model outside this Mac only if you allow it; the guard refuses reading the app\'s settings folder.' },
];

/** Tools a Creator Plus conversation may call besides its own (creator_…): an allow-list. */
export const ALLOWED = new Set([
  'read', 'glob', 'grep', 'read_image', 'write', 'edit', 'multi_edit',
  'web_search', 'web_fetch', 'todo_write', 'ask_user_question', 'tools_find', 'skill', 'diagram_draw',
  'cordis_inspect_list', 'cordis_inspect_query', 'mission_step', 'pdf_info', 'pdf_read', 'pdf_search',
  // Memory only suggests, and the user decides.
  'remember',
]);
const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit']);
const READ_TOOLS = new Set(['read', 'read_image', 'glob', 'grep', 'pdf_info', 'pdf_read', 'pdf_search']);
const PATH_KEYS = ['file_path', 'path', 'file', 'filename', 'directory', 'dir', 'folder', 'cwd', 'notebook_path', 'target', 'source', 'destination', 'output', 'output_path'];

export const NO_COMMANDS = 'Creator Plus runs no commands and no programs itself: its own tools run the checks and the tests with fixed commands, in a sandbox (creator_check, creator_change, creator_upkeep). Nothing was run.';
export const NOT_ALLOWED = 'This tool is closed in Creator Plus. It builds in this conversation\'s folder with the file tools and its own creator_ tools; the real setup is changed only from the Creator Plus page, by the user. Nothing was run.';
/** The build folder: a folder of its own inside the conversation's folder, the only place file tools write. */
export const BUILD_FOLDER = 'creator-plus-builds';
export const NOT_THERE = `Creator Plus writes only inside its build folder, ${BUILD_FOLDER} in this conversation's folder (paths like ${BUILD_FOLDER}/dsh-name/index.js). The app's own files, the installed plugins and the app's data folder are never written by a file tool (fixed rules 2 and 4); a change to an installed plugin goes through creator_change and the user's yes. Nothing was written.`;
export const UNSAFE_FOLDER = 'This conversation\'s folder is no place to build plugins: it is your home folder, inside ~/Library, holds the app\'s data or the Plus add-ons, or lies inside them. Start the Creator Plus conversation in a project folder of its own (or in Scratch). Nothing was written.';
export const NO_FOLDER = 'This conversation has no folder to build in. Nothing was written.';
export const RECON_ROOM = 'This folder is Recon\'s sealed room; start Creator Plus in another folder or in Scratch. Creator Plus never reads or writes there. Nothing was read or written.';

/** The temporary folders Recon makes its rooms in, in every spelling, small letters (the Mac's disk ignores capitals). */
const temporary = () => [...new Set(['/tmp', '/private/tmp', tmpdir()].flatMap((where) => {
  try {
    return [where, realpathSync.native(where)];
  } catch {
    return [where];
  }
}).map((where) => where.replace(/\/+$/, '').toLowerCase()))];
/**
 * Whether a path is Recon's sealed room or inside it: a `dsh-recon-*` folder directly in /tmp, /private/tmp
 * or the system's temporary folder (the rule Content uses, dsh-content lib/folder.js), checked as named and by its real path.
 * @param {string} path - a path.
 * @returns {boolean} whether it is in a Recon room.
 */
export function inReconRoom(path) {
  const places = new Set(temporary());
  for (const spelling of [String(path ?? ''), real(String(path ?? '') || '/')]) {
    let here = spelling;
    while (here && here !== dirname(here)) {
      if (/^dsh-recon-/i.test(basename(here)) && places.has(dirname(here).toLowerCase())) return true;
      here = dirname(here);
    }
  }
  return false;
}
export const NO_SECRETS = 'The app\'s data folder holds your settings and keys: Creator Plus does not read it with file tools (fixed rule 6). The map (creator_map) says what is installed and how it is set up, masked. Nothing was read.';

/** A path in its real spelling; a path that does not exist yet takes the real spelling of the part that does. */
export function real(path) {
  let head = resolve(path);
  const tail = [];
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      return tail.length > 0 ? join(realpathSync.native(head), ...tail.reverse()) : realpathSync.native(head);
    } catch {
      const up = dirname(head);
      if (up === head) break;
      tail.push(basename(head));
      head = up;
    }
  }
  return resolve(path);
}

/** @returns {boolean} whether a path is a folder or inside it (capitals ignored, as macOS does). */
export const within = (path, folder) => {
  if (!folder) return false;
  const a = String(path).toLowerCase();
  const b = String(folder).replace(/\/+$/, '').toLowerCase();
  return a === b || a.startsWith(`${b}${sep}`);
};

/** The paths a tool call names, made absolute against the conversation's folder. */
export function pathsOf(args, cwd) {
  if (!args || typeof args !== 'object') return [];
  const found = [];
  for (const key of PATH_KEYS) if (typeof args[key] === 'string') found.push(args[key]);
  if (Array.isArray(args.edits)) for (const edit of args.edits.slice(0, 50)) if (typeof edit?.file_path === 'string') found.push(edit.file_path);
  return found.map((text) => String(text).trim()).filter((text) => text && !text.includes('\0') && text.length <= 4000).map((text) => {
    const path = text === '~' ? homedir() : text.startsWith('~/') ? join(homedir(), text.slice(2)) : text;
    return isAbsolute(path) ? resolve(path) : resolve(cwd || '/', path);
  });
}

/**
 * The guard's decision on one tool call in a Creator Plus conversation (or one of its helpers).
 * @param {object} call - `name`, `args`, `cwd` (the conversation's folder), `build` (the build folder in it, the only place written), and the
 *   places: `dshHome` (the app's data folder), `creatorHome` (Creator Plus's own folder in it, written only
 *   by its own tools), `appBundle` (the app), `readable` (folders inside the data folder that may be read:
 *   the installed Plus add-ons, Creator Plus's own folder), `outside` (folders never written by a file tool:
 *   the installed plugins, the settings and conversations, Creator Plus's own folder).
 * @returns {string} the refusal, or '' when the call may run.
 */
export function guardRefusal({ name, args, cwd, build = cwd, dshHome = '', appBundle = '', readable = [], outside = [] }) {
  if (/^creator_/.test(name)) return '';
  if (/^(bash|shell|terminal|pwsh|powershell|run_code|job_)/.test(name)) return NO_COMMANDS;
  if (!ALLOWED.has(name)) return NOT_ALLOWED;
  if (!WRITE_TOOLS.has(name) && !READ_TOOLS.has(name)) return '';
  const paths = pathsOf(args, cwd);
  const searched = (name === 'glob' || name === 'grep') && paths.length === 0 && cwd ? [resolve(cwd)] : [];
  // Each place in both spellings (as named, and with links followed), so a link cannot lead around a rule.
  const both = (folder) => (folder ? [folder, real(folder)] : []);
  const inside = (spelling, folders) => folders.some((folder) => both(folder).some((one) => within(spelling, one)));
  const buildFolder = cwd ? real(cwd) : '';
  const writeFolder = build ? real(build) : '';
  for (const path of [...paths, ...searched]) {
    if (inReconRoom(path)) return RECON_ROOM;
    // A search over a temporary folder (or a folder holding one) would reach Recon's rooms.
    if ((name === 'glob' || name === 'grep') && temporary().some((where) => within(where, path.toLowerCase()) || within(where, real(path).toLowerCase()))) return RECON_ROOM;
    const realPath = real(path);
    const spellings = [path, realPath];
    // The build folder counts by the real path only: a link inside it to somewhere else is not the build folder.
    const inBuild = Boolean(buildFolder) && within(realPath, buildFolder);
    if (WRITE_TOOLS.has(name)) {
      // Only inside the build folder, and never where the app, the installed plugins or the settings live
      // (a Scratch conversation's folder is inside the data folder: that one is the build folder).
      if (!writeFolder || !within(realPath, writeFolder)) return NOT_THERE;
      // No link anywhere on the way from the build folder to the file (the write must not follow one).
      if (within(path, resolve(build)) && linkOnTheWay(resolve(build), path)) return NOT_THERE;
      if (spellings.some((spelling) => inside(spelling, [appBundle, ...outside]))) return NOT_THERE;
      continue;
    }
    for (const spelling of spellings) {
      if (dshHome && inside(spelling, [dshHome]) && !inBuild && !inside(spelling, readable)) return NO_SECRETS;
    }
    // A search over a folder that holds the data folder would reach it.
    if ((name === 'glob' || name === 'grep') && dshHome && spellings.some((spelling) => both(dshHome).some((home) => within(home, spelling)))) return NO_SECRETS;
  }
  return '';
}

/**
 * Whether a conversation's folder may hold a build folder: never the home folder or the whole disk, nothing
 * in ~/Library, nothing that holds or lies in the app's data (but Scratch) or the Plus add-ons, nothing in the app.
 * @param {object} input - `cwd`, `userHome`, `dshHome`, `scratch` (Scratch's folder in the app's data), `plusDirs`, `appBundle`.
 * @returns {string} the refusal, or ''.
 */
export function folderRefusal({ cwd, userHome = homedir(), dshHome = '', scratch = '', plusDirs = [], appBundle = '' }) {
  if (!cwd || !isAbsolute(cwd)) return NO_FOLDER;
  if (inReconRoom(cwd)) return RECON_ROOM;
  const at = real(cwd);
  const home = real(userHome);
  if (at === '/' || at === home || within(home, at)) return UNSAFE_FOLDER;
  if (within(at, join(home, 'Library'))) return UNSAFE_FOLDER;
  if (dshHome) {
    const data = real(dshHome);
    if (within(data, at)) return UNSAFE_FOLDER;
    if (within(at, data) && !(scratch && within(at, real(scratch)))) return UNSAFE_FOLDER;
  }
  for (const dir of plusDirs.filter(Boolean)) if (within(real(dir), at) || within(at, real(dir))) return UNSAFE_FOLDER;
  if (appBundle && within(at, real(appBundle))) return UNSAFE_FOLDER;
  return '';
}
