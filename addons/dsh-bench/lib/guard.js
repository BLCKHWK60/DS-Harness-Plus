/**
 * Bench's own rule on every tool call in a Bench conversation and its helpers, decided before the call
 * runs. It holds also while a Long run widens the conversation's tools (a run with "Files and commands"
 * on offers every tool in any tab):
 * - an allow-list: Bench's own tools, the web, PDFs, the Library, reading and (in a Long run) writing
 *   files, diagrams, the step list and questions; no shell, no program, no background job, and no tool
 *   Bench does not know: Bench reaches a device only through its own tools;
 * - no file tool may read or write inside a Bench folder (cards, logbooks and backups are Bench's own)
 *   or under /dev (a device's port), and no search may reach a Bench folder.
 *
 * Item 4A, stage 6a: a guest (another mode in the Devices space, or a thread whose space Modes could not read) keeps
 * its own tools plus Devices' tools under Devices' rules (`guest: true`, STAGE6A-DESIGN.md P3): no tool Modes'
 * guest test refuses (commands, programs, jobs, connectors, other Mac apps, Office files, schedules, unsorted tools);
 * every path-like string at any key (depth 3) is kept out of the Devices folders and /dev; a thread whose folder holds
 * or lies in a Devices folder uses no file tool at all; writes go only inside the thread's own folder (`writeRoot`),
 * never into a dot-file or dot-folder, Git hooks or start-up items, and not at all from a folder that is too wide.
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

/** Tools that run commands or programs: named in the refusal. */
export const COMMAND_TOOLS = new Set(['bash', 'terminal', 'terminal_open', 'terminal_send', 'shell', 'pwsh', 'powershell', 'run_code', 'job_output', 'job_list', 'job_kill']);
/** Tools that change files: allowed only outside the Bench folder and /dev (a Long run's own files). */
export const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit']);
/** Tools that read files: never inside the Bench folder or /dev. */
export const READ_TOOLS = new Set(['read', 'read_image', 'glob', 'grep', 'pdf_read', 'pdf_info', 'pdf_search', 'pdf_page_image', 'pdf_ocr']);
/**
 * Everything a Bench conversation and its helpers may call besides Bench's own tools (bench_…). An
 * allow-list: a tool Bench does not know (a terminal, another editor, a connector) is closed.
 */
export const ALLOWED = new Set([
  ...READ_TOOLS, ...WRITE_TOOLS,
  'web_search', 'web_fetch', 'deep_research', 'library_search', 'library_read',
  'diagram_draw', 'todo_write', 'ask_user_question', 'mission_step', 'tools_find', 'skill',
  // The Memory add-on's tool: it only suggests a fact, and the user decides.
  'remember',
]);
export const PATH_KEYS = ['file_path', 'path', 'file', 'filename', 'directory', 'dir', 'folder', 'cwd', 'notebook_path', 'target', 'source', 'destination', 'output', 'output_path', 'input_path'];
export const LIST_KEYS = ['files', 'paths', 'file_paths'];

export const NO_COMMANDS = 'Devices runs no commands and no programs, also during a Mission: it reaches a device only through its own tools (bench_usb and the cards). Nothing was run. This is fixed in Devices (the user sees it under "Devices rules" in the chat box). Tell the user it is closed, and say what you would do and why, in plain words.';
export const NOT_ALLOWED = 'This tool is closed in Devices: a Devices thread uses Devices\' own tools, the web, PDFs, the Library, reading files, diagrams, the step list and questions (and, in a Mission, writing files outside the Devices folder). Nothing was run. Tell the user it is closed in Devices.';
export const NO_BACKUPS = 'The Devices folder (cards, logbooks, backups, logs) is read only through Devices\' own tools: backups can hold Wi-Fi and other keys and are never shown to a model. Nothing was read. bench_devices shows a card and what its backups are.';
export const NOT_THERE = 'Devices\' file tools never write into the Devices folder (cards and logbooks are kept by bench_card and bench_log) or into /dev (a device\'s port). Nothing was written.';
export const NO_DEVICE_FILES = 'A file under /dev is a device: Devices reaches devices only through its own tools. Nothing was read.';

/** A path in its real spelling; a path that does not exist yet takes the real spelling of the part that does. */
function real(path) {
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

/** The paths a tool call names, made absolute against the conversation's folder. */
export function pathsOf(args, cwd) {
  if (!args || typeof args !== 'object') return [];
  const found = [];
  for (const key of PATH_KEYS) if (typeof args[key] === 'string') found.push(args[key]);
  for (const key of LIST_KEYS) if (Array.isArray(args[key])) for (const item of args[key].slice(0, 200)) if (typeof item === 'string') found.push(item);
  return found.map((text) => String(text).trim()).filter((text) => text && !text.includes('\0') && text.length <= 4000).map((text) => {
    const path = text === '~' ? homedir() : text.startsWith('~/') ? join(homedir(), text.slice(2)) : text;
    return isAbsolute(path) ? resolve(path) : resolve(cwd || '/', path);
  });
}

const within = (path, folder) => {
  const a = path.toLowerCase();
  const b = folder.replace(/\/+$/, '').toLowerCase();
  return a === b || a.startsWith(`${b}${sep}`);
};

/**
 * Bench's decision on one tool call.
 * @param {{name: string, args: unknown, cwd: string, benchFolders: string[]}} call - the call, and every Bench folder in use (the current one, Bench's own, earlier ones).
 * @returns {string} the reason it is refused, or '' when Bench lets it through.
 */
export function benchRefusal({ name, args, cwd, benchFolders = [], guest = false, writeRoot = '', folderUnsafe = '', isRefused, mode = '' }) {
  if (/^bench_/.test(name)) return '';
  if (COMMAND_TOOLS.has(name) || /^(terminal|shell|bash|pwsh|powershell)(_|$)/.test(name)) return guest ? DEVICES_GUEST_NO_COMMANDS.en : NO_COMMANDS;
  // Item 4A, stage 6a: another mode in Devices gets the guest rule instead of the Devices mode's allow-list.
  if (guest) return guestRefusal({ name, args, cwd, benchFolders, writeRoot, folderUnsafe, isRefused, mode });
  if (!ALLOWED.has(name)) return NOT_ALLOWED;
  if (!READ_TOOLS.has(name) && !WRITE_TOOLS.has(name)) return '';
  const folders = benchFolders.filter(Boolean).flatMap((folder) => [resolve(folder), real(folder)]);
  const dev = ['/dev', '/private/dev'];
  const named = [...pathsOf(args, cwd), ...(typeof args?.pattern === 'string' && /[\\/]/.test(args.pattern) ? pathsOf({ path: args.pattern }, cwd) : [])];
  // A search with no path searches the conversation's folder: refused when the Bench folder is inside it.
  const searched = (name === 'glob' || name === 'grep') && !pathsOf(args, cwd).length && cwd ? [resolve(cwd)] : [];
  for (const path of [...named, ...searched]) {
    for (const spelling of [path, real(path)]) {
      if (dev.some((folder) => within(spelling, folder))) return WRITE_TOOLS.has(name) ? NOT_THERE : NO_DEVICE_FILES;
      if (folders.some((folder) => within(spelling, folder))) return WRITE_TOOLS.has(name) ? NOT_THERE : NO_BACKUPS;
      // Searching a folder that holds the Bench folder would reach it.
      if ((name === 'glob' || name === 'grep') && folders.some((folder) => within(folder, spelling))) return NO_BACKUPS;
    }
  }
  return '';
}

// ---- Item 4A, stage 6a: guests in the Devices space ----------------------------------------------------------------

/**
 * The sentences a guest is refused with (STAGE6A-DESIGN.md 2.7); they go to the model. Plus is English only (decision
 * 28, stage 7): `en` is the only text, kept as a field because callers and tests read `.en`.
 */
export const DEVICES_GUEST_NO_COMMANDS = Object.freeze({
  en: 'Devices refuses the Terminal, programs and background jobs for every mode, so this was not run. Use the device tools (bench_…) or the file tools.',
});
export const DEVICES_GUEST_WRITE = Object.freeze({
  en: 'In Devices, {mode} may change files only inside this thread\'s own folder, never hidden files, Git hooks or start-up items. Nothing was written.',
});
export const DEVICES_GUEST_FOLDER = Object.freeze({
  en: 'This thread\'s folder is too wide for Devices (it is your home folder, the app\'s data or holds the Devices folder), so {mode} cannot use files here. Start a new Devices thread in a project folder of its own.',
});
/**
 * Lab re-check fix (6a, problem 8): a path that only holds the Devices folder further down (the home folder, a parent
 * folder) is refused with its own sentence: the call would reach Devices' files through it (a search, a code map, a
 * folder change), not open them by name.
 */
export const DEVICES_GUEST_HOLDS = Object.freeze({
  en: 'In Devices, {mode} cannot use {tool} on {path}: that folder holds the Devices folder (cards, logbooks, backups) further down, and a search or a move into it would reach them. Nothing was run. Use this thread\'s own folder or another folder that does not hold the Devices folder.',
});
/**
 * A `lang` field is still accepted from older callers and ignored: the text is English whatever the app's language.
 * @returns {string} DEVICES_GUEST_HOLDS with the mode, tool and folder filled in.
 */
export const holdsText = ({ mode = '', tool = '', path = '' } = {}) => withMode(DEVICES_GUEST_HOLDS.en.replaceAll('{tool}', String(tool ?? '')).replaceAll('{path}', String(path ?? '')), mode);
/**
 * Lab fix (6a): the refusal names what the space closes for this tool (BASE_NO_PROGRAMS's groups), not always the
 * Terminal: a schedule, a connector, another Mac app's tool, an Office file tool are refused for reasons of their own.
 */
export const DEVICES_GUEST_REFUSED = Object.freeze({
  en: 'Devices refuses {what} for every mode, so {tool} was not run. Use the device tools (bench_…) or the file tools.',
});
const REFUSED_WHAT = Object.freeze({
  connectors: 'connectors',
  mac: 'tools that drive other Mac apps',
  office: 'Office file tools',
  schedules: 'automations (they start work later)',
  engines: 'engines',
  creator: 'Creator Plus\'s own tools',
  app: 'the app\'s own tools (plugins, workflows, tuning)',
  helpers: 'this kind of helper',
  other: 'tools no one has sorted yet in Tool access',
});
/**
 * The sentence a guest's refused tool gets: the Terminal sentence for commands, programs and jobs, else the group.
 * @param {string} name - the tool.
 * @param {string} [_lang] - still accepted from older callers and ignored: the text is always English.
 * @returns {string}
 */
export function guestRefusedText(name, _lang = 'en') {
  const tool = String(name ?? '');
  if (COMMAND_TOOLS.has(tool) || /^(terminal|shell|bash|pwsh|powershell)(_|$)/.test(tool) || ['run_code', 'data_python', 'code_run', 'python'].includes(tool)) return DEVICES_GUEST_NO_COMMANDS.en;
  const group = tool.startsWith('mcp__') || ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'].includes(tool) ? 'connectors'
    : tool.startsWith('mac_') ? 'mac'
      : tool.startsWith('office_') ? 'office'
        : tool.startsWith('schedule_') ? 'schedules'
          : tool === 'engine' ? 'engines'
            : tool.startsWith('creator_') ? 'creator'
              : ['plugin_manager', 'workflow', 'skills'].includes(tool) || tool.startsWith('tuning_') ? 'app'
                : ['subagent', 'run_swarm', 'delegate_role'].includes(tool) ? 'helpers'
                  : 'other';
  return DEVICES_GUEST_REFUSED.en.replace('{what}', REFUSED_WHAT[group]).replace('{tool}', tool);
}
/** Model-facing, English only (the model reads it). */
export const DEVICES_GUEST_NOTE = 'This thread is in the Devices space: Devices\' rules hold whatever the mode. No Terminal, no programs, no background jobs; files only in this thread\'s folder; never the Devices folder or /dev.';

/** A sentence with the mode's name in it ("this mode" when it is not known). */
export const withMode = (text, mode) => text.replaceAll('{mode}', String(mode ?? '').trim() || 'this mode');

/**
 * Tools of the `change` catalog group (dsh-modes lib/catalog.js): each writes, so each must name a path inside the
 * thread's folder; one whose path the guard cannot read is refused.
 */
export const CHANGE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'str_replace_editor', 'notebook_edit', 'move', 'delete', 'remove', 'data_save_analysis', 'data_rerun_analysis', 'finance_profile_save']);
/** What a guest may still use when its folder holds or lies in a Devices folder: no file tool among them. */
export const FOLDER_FREE = new Set(['web_search', 'web_fetch', 'other_search', 'other_read', 'todo_write', 'ask_user_question', 'create_goal', 'get_goal', 'update_goal', 'skill', 'tools_find', 'tools_catalog', 'request_tool_access', 'exit_plan_mode']);
/** The text a change tool writes (not a path): left out of the any-key scan, so code that mentions /dev/null can be written. */
const CONTENT_KEYS = new Set(['content', 'new_string', 'old_string', 'new_source', 'text', 'input', 'patch']);
const DEV = ['/dev', '/private/dev'];

const absolute = (text, cwd) => {
  const path = text === '~' ? homedir() : text.startsWith('~/') ? join(homedir(), text.slice(2)) : text;
  return isAbsolute(path) ? resolve(path) : resolve(cwd || '/', path);
};
const usable = (text) => typeof text === 'string' && text.trim() !== '' && !text.includes('\0') && text.length <= 4000;
/** Whole strings that look like a path: start with /, ~, ./, ../ or hold a /. */
const pathLike = (text) => /^(?:\/|~(?:\/|$)|\.\.?\/)/.test(text) || (text.includes('/') && !/\s/.test(text.trim()));
/** Paths inside a longer text (a query, a command line): an absolute or home path after a space, quote, bracket or = . */
const EMBEDDED = /(?:^|[\s'"`(=,:])((?:~\/|\/)[^\s'"`;,()<>|]+)/g;

/**
 * Every path a guest's call names, at any key to depth 3: whole path-like strings and paths inside longer texts, plus
 * the usual path keys and lists. The text a change tool writes is not scanned (it is not a path).
 * @returns {string[]} absolute paths.
 */
export function pathsOfAny(args, cwd, { skipContent = false } = {}) {
  const found = new Set(pathsOf(args, cwd));
  const walk = (value, depth, key) => {
    if (depth > 3 || value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (skipContent && CONTENT_KEYS.has(key)) return;
      if (!usable(value)) return;
      const text = value.trim();
      if (pathLike(text)) found.add(absolute(text, cwd));
      for (const match of text.slice(0, 20000).matchAll(EMBEDDED)) found.add(absolute(match[1], cwd));
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 200)) walk(item, depth + 1, key);
      return;
    }
    if (typeof value === 'object') for (const [inner, item] of Object.entries(value).slice(0, 200)) walk(item, depth + 1, inner);
  };
  walk(args, 0, '');
  return [...found];
}

/** The files a change tool writes: its path keys, its edits, and the files an apply_patch names. */
export function writeTargets(args, cwd) {
  if (!args || typeof args !== 'object') return [];
  const found = [...pathsOf(args, cwd)];
  if (Array.isArray(args.edits)) for (const edit of args.edits.slice(0, 50)) if (usable(edit?.file_path)) found.push(absolute(edit.file_path.trim(), cwd));
  for (const key of ['input', 'patch']) {
    if (typeof args[key] !== 'string') continue;
    for (const match of args[key].slice(0, 200000).matchAll(/^\*\*\* (?:Add|Update|Delete) File: (.+)$|^\*\*\* Move to: (.+)$/gm)) {
      const named = (match[1] ?? match[2] ?? '').trim();
      if (usable(named)) found.push(absolute(named, cwd));
    }
  }
  return [...new Set(found)];
}

/** Whether a file inside the write root is a hidden file or folder, a Git hook or a start-up item. */
const forbiddenWrite = (path, root) => {
  const rest = path.slice(root.replace(/\/+$/, '').length).split(sep).filter(Boolean);
  if (rest.some((part) => part.startsWith('.'))) return true;
  const lower = path.toLowerCase();
  return lower.includes(`${sep}.git${sep}hooks`) || lower.includes(`${sep}library${sep}launchagents`) || lower.includes(`${sep}library${sep}launchdaemons`);
};

/**
 * Whether a guest's folder may be written in at all (Creator Plus's `folderRefusal`, copied, STAGE6A-DESIGN.md P3):
 * never the home folder or the whole disk, nothing in ~/Library, nothing that holds or lies in the app's data (but
 * Scratch) or a Plus folder, nothing in the app, and nothing that holds or lies in a Devices folder.
 * @param {object} input - `folder` (the thread's own folder), `userHome`, `dshHome`, `scratch`, `plusDirs`, `appBundle`, `benchFolders`.
 * @returns {string} '' when the folder may be written in, else a short reason (for the log; the guest sees DEVICES_GUEST_FOLDER).
 */
export function guestFolderRefusal({ folder, userHome = homedir(), dshHome = '', scratch = '', plusDirs = [], appBundle = '', benchFolders = [] }) {
  if (!folder || !isAbsolute(folder)) return 'no folder';
  const at = real(folder);
  const home = real(userHome);
  if (at === '/' || at === home || within(home, at)) return 'home folder';
  if (within(at, join(home, 'Library'))) return 'Library';
  if (dshHome) {
    const data = real(dshHome);
    if (within(data, at)) return 'holds the app data';
    if (within(at, data) && !(scratch && within(at, real(scratch)))) return 'inside the app data';
  }
  for (const dir of plusDirs.filter(Boolean)) if (within(real(dir), at) || within(at, real(dir))) return 'Plus folder';
  if (appBundle && within(at, real(appBundle))) return 'the app';
  for (const dir of benchFolders.filter(Boolean)) if (within(real(dir), at) || within(at, real(dir))) return 'Devices folder';
  return '';
}

/** The guest rule (see the file's head). */
function guestRefusal({ name, args, cwd, benchFolders, writeRoot, folderUnsafe, isRefused, mode }) {
  let refused = true;
  try {
    refused = typeof isRefused === 'function' ? isRefused(name) === true : true;
  } catch {
    refused = true;
  }
  if (refused) return guestRefusedText(name);
  // Item 4A, stage 6b (J14): a schedule tool the guest rule lets through names no files (its instruction may mention /dev:
  // its runs stay under Devices' rules); Modes' fences decide where its runs go.
  if (/^schedule_/.test(String(name ?? ''))) return '';
  const folders = benchFolders.filter(Boolean).flatMap((folder) => [resolve(folder), real(folder)]);
  const holdsOrIn = (place) => Boolean(place) && [resolve(place), real(place)].some((spelling) => folders.some((folder) => within(spelling, folder) || within(folder, spelling)));
  // A folder that holds (or lies in) a Devices folder: no file tool, whatever its arguments name.
  if ((holdsOrIn(cwd) || holdsOrIn(writeRoot)) && !FOLDER_FREE.has(name)) return withMode(DEVICES_GUEST_FOLDER.en, mode);
  const writes = CHANGE_TOOLS.has(name);
  const named = pathsOfAny(args, cwd, { skipContent: writes });
  if (typeof args?.pattern === 'string' && /[\\/]/.test(args.pattern)) named.push(absolute(args.pattern.trim(), cwd));
  const searched = (name === 'glob' || name === 'grep') && pathsOf(args, cwd).length === 0 && cwd ? [resolve(cwd)] : [];
  for (const path of [...named, ...searched]) {
    for (const spelling of [path, real(path)]) {
      if (DEV.some((folder) => within(spelling, folder))) return writes ? NOT_THERE : NO_DEVICE_FILES;
      if (folders.some((folder) => within(spelling, folder))) return writes ? NOT_THERE : NO_BACKUPS;
      // A path that holds a Devices folder (a search, a code map, a query over it) would reach it. Lab re-check fix (6a,
      // problem 8): said so, not as if the Devices folder itself had been named.
      if (folders.some((folder) => within(folder, spelling))) return holdsText({ mode, tool: name, path });
    }
  }
  // Writes: only inside the thread's own folder (its real path), never from a folder that is too wide.
  const targets = writes ? writeTargets(args, cwd)
    : name === 'data_chart' ? [resolve(cwd || writeRoot || '/')]
      : name === 'diagram_draw' ? pathsOf(args, cwd)
        : [];
  if (!writes && targets.length === 0) return '';
  if (folderUnsafe) return withMode(DEVICES_GUEST_FOLDER.en, mode);
  if (!writeRoot || !isAbsolute(writeRoot)) return withMode(DEVICES_GUEST_WRITE.en, mode);
  // Lab fix (6a): the sentence names the thread's folder, so the model can write there without guessing.
  const refusedHere = `${withMode(DEVICES_GUEST_WRITE.en, mode)} This thread's folder is ${writeRoot}.`;
  if (writes && targets.length === 0) return refusedHere;
  const root = real(writeRoot);
  for (const target of targets) {
    // By the real path (a link inside the folder to somewhere else is not the folder), and as named.
    const at = real(target);
    if (!within(at, root) || forbiddenWrite(at, root)) return refusedHere;
    if (within(target, resolve(writeRoot)) && forbiddenWrite(target, resolve(writeRoot))) return refusedHere;
  }
  return '';
}

/**
 * Item 4A, stage 6b (3.3, J10): whether a folder touches Devices, for Automations' "a new thread in another space" folder
 * from a Devices or Workshop guest: 'devices' when its real path is, lies in or holds a Devices folder; 'dev' when it is,
 * lies in or holds /dev (or /private/dev); '' when fine; 'unknown' when it could not be checked (fail closed).
 * @param {{path: unknown, benchFolders?: string[]}} input - the folder, and every Devices folder in use.
 * @returns {'devices' | 'dev' | '' | 'unknown'}
 */
export function folderTouchesDevices({ path, benchFolders = [] }) {
  try {
    const raw = typeof path === 'string' ? path.trim() : '';
    if (!raw || !isAbsolute(raw) || raw.includes('\0') || raw.length > 4000) return 'unknown';
    const spellings = [...new Set([resolve(raw), real(raw)])];
    const touches = (folder) => spellings.some((at) => within(at, folder) || within(folder, at));
    if (['/dev', '/private/dev'].some((dev) => touches(dev))) return 'dev';
    const folders = (Array.isArray(benchFolders) ? benchFolders : []).filter((dir) => typeof dir === 'string' && dir).flatMap((dir) => [resolve(dir), real(dir)]);
    if (folders.some((folder) => touches(folder))) return 'devices';
    return '';
  } catch {
    return 'unknown';
  }
}
