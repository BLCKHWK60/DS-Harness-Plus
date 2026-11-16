/**
 * Bench's own rule on every tool call in a Bench conversation and its helpers, decided before the call
 * runs. It holds also while a Long run widens the conversation's tools (a run with "Files and commands"
 * on offers every tool in any tab):
 * - no shell, no program, no background job: Bench reaches a device only through its own tools;
 * - no file tool may write into the Bench folder (cards and logbooks are Bench's own) or under /dev
 *   (a device's port).
 */
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

/** Tools that run commands or programs. */
export const COMMAND_TOOLS = new Set(['bash', 'terminal', 'shell', 'pwsh', 'run_code', 'job_output', 'job_list', 'job_kill']);
/** Tools that change files. */
export const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'notebook_edit', 'move', 'delete', 'remove']);
const PATH_KEYS = ['file_path', 'path', 'file', 'filename', 'directory', 'dir', 'folder', 'cwd', 'notebook_path', 'target', 'source', 'destination', 'output', 'output_path', 'input_path'];
const LIST_KEYS = ['files', 'paths', 'file_paths'];

export const NO_COMMANDS = 'Bench runs no commands and no programs, also during a Long run: it reaches a device only through its own tools (bench_usb and the cards). Nothing was run. This is fixed in Bench (the user sees it under "Bench rules" in the chat box). Tell the user it is closed, and say what you would do and why, in plain words.';
export const NOT_THERE = 'Bench\'s file tools never write into the Bench folder (cards and logbooks are kept by bench_card and bench_log) or into /dev (a device\'s port). Nothing was written.';

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
 * @param {{name: string, args: unknown, cwd: string, benchFolder: string}} call - the call.
 * @returns {string} the reason it is refused, or '' when Bench lets it through.
 */
export function benchRefusal({ name, args, cwd, benchFolder }) {
  if (COMMAND_TOOLS.has(name)) return NO_COMMANDS;
  if (!WRITE_TOOLS.has(name)) return '';
  const folders = ['/dev', '/private/dev', ...(benchFolder ? [resolve(benchFolder), real(benchFolder)] : [])];
  for (const path of pathsOf(args, cwd)) {
    for (const spelling of [path, real(path)]) if (folders.some((folder) => within(spelling, folder))) return NOT_THERE;
  }
  return '';
}
