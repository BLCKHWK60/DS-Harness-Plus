/**
 * OpenCode as an engine. One file per engine: where its program is, how one task is started, and
 * how its machine-readable output is read. Adding an engine means adding a file like this one.
 */
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const id = 'opencode';
export const label = 'OpenCode';

/** @returns {string} the program, '' when it is not installed. `chosen` is a path the user set. */
export function find(chosen = '') {
  const own = String(chosen ?? '').trim();
  if (own) return existsSync(own) ? own : '';
  return [join(homedir(), '.opencode', 'bin', 'opencode'), '/opt/homebrew/bin/opencode', '/usr/local/bin/opencode', join(homedir(), '.local', 'bin', 'opencode')].find((path) => existsSync(path)) ?? '';
}

/** The engine's own folders: its settings, sign-ins, sessions and cache. It may read and write these. */
export function ownFolders(home = homedir()) {
  return [join(home, '.opencode'), join(home, '.config', 'opencode'), join(home, '.local', 'share', 'opencode'), join(home, '.local', 'state', 'opencode'), join(home, '.cache', 'opencode'), join(home, 'Library', 'Application Support', 'opencode'), join(home, 'Library', 'Caches', 'opencode')];
}

/**
 * The command for one task.
 * `--standalone`: the whole engine runs in this one process, inside the lock, not in a background service.
 * `--auto`: it does not stop to ask; the lock and the project copy are the boundary.
 * @param {object} input - `task`, `model` ('' for the engine's own default), `session` (the engine's own id of an earlier
 *   run to carry on from; '' starts fresh).
 * @returns {string[]} the arguments.
 */
export function args({ task, model, session }) {
  return ['run', '--standalone', '--auto', '--format', 'json', ...(model ? ['--model', String(model)] : []), ...(session ? ['--session', String(session)] : []), String(task)];
}

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/**
 * One line of the engine's output, in the words the comparison uses.
 * @param {string} line - a line of JSON.
 * @returns {object | undefined} `{kind: 'step', input, output, cost}`, `{kind: 'text', text}`, `{kind: 'tool', name}`, `{kind: 'error', message}`.
 *   Each carries `session` when the line names the engine's session.
 */
export function parse(line) {
  let event;
  try {
    event = JSON.parse(line);
  } catch {
    return undefined;
  }
  const part = event?.part ?? {};
  const found = read(event, part);
  const session = typeof event?.sessionID === 'string' && /^[\w.:-]{4,120}$/.test(event.sessionID) ? event.sessionID : '';
  return found && session ? { ...found, session } : found;
}

function read(event, part) {
  switch (event?.type) {
    case 'step_finish': {
      const tokens = part.tokens ?? {};
      return { kind: 'step', input: number(tokens.input) + number(tokens.cache?.read) + number(tokens.cache?.write), output: number(tokens.output) + number(tokens.reasoning), cost: number(part.cost) };
    }
    case 'text':
      return typeof part.text === 'string' && part.text ? { kind: 'text', text: part.text } : undefined;
    case 'tool':
    case 'tool_use':
      return { kind: 'tool', name: String(part.tool ?? part.name ?? 'tool').slice(0, 60) };
    case 'error':
      return { kind: 'error', message: String(event.error?.message ?? event.error?.data?.message ?? part.message ?? 'the engine reported an error').slice(0, 400) };
    default:
      return undefined;
  }
}
