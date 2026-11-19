/**
 * Bench's own rule on every tool call in a Bench conversation and its helpers, decided before the call
 * runs. It holds also while a Long run widens the conversation's tools (a run with "Files and commands"
 * on offers every tool in any tab):
 * - an allow-list: Bench's own tools, the web, PDFs, the Library, reading and (in a Long run) writing
 *   files, diagrams, the step list and questions; no shell, no program, no background job, and no tool
 *   Bench does not know: Bench reaches a device only through its own tools;
 * - no file tool may read or write inside a Bench folder (cards, logbooks and backups are Bench's own)
 *   or under /dev (a device's port), and no search may reach a Bench folder.
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
const PATH_KEYS = ['file_path', 'path', 'file', 'filename', 'directory', 'dir', 'folder', 'cwd', 'notebook_path', 'target', 'source', 'destination', 'output', 'output_path', 'input_path'];
const LIST_KEYS = ['files', 'paths', 'file_paths'];

export const NO_COMMANDS = 'Devices runs no commands and no programs, also during a Long run: it reaches a device only through its own tools (bench_usb and the cards). Nothing was run. This is fixed in Devices (the user sees it under "Devices rules" in the chat box). Tell the user it is closed, and say what you would do and why, in plain words.';
export const NOT_ALLOWED = 'This tool is closed in Devices: a Devices conversation uses Devices\' own tools, the web, PDFs, the Library, reading files, diagrams, the step list and questions (and, in a Long run, writing files outside the Devices folder). Nothing was run. Tell the user it is closed in Devices.';
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
export function benchRefusal({ name, args, cwd, benchFolders = [] }) {
  if (/^bench_/.test(name)) return '';
  if (COMMAND_TOOLS.has(name) || /^(terminal|shell|bash|pwsh|powershell)(_|$)/.test(name)) return NO_COMMANDS;
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
