/**
 * Runs one outside engine on one task, inside the lock, in its copy of the project, and keeps
 * count of what it used: steps, tokens, cost, time, and whether it finished.
 */
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { lockProfile } from './lock.js';

const SANDBOX = '/usr/bin/sandbox-exec';
const TEXT_MAX = 30_000;

/** A pane's figures at the start. */
export function emptyPane(engine, label) {
  return { engine, label, model: '', status: 'waiting', startedAt: 0, endedAt: 0, steps: 0, input: 0, output: 0, cost: null, tools: 0, text: '', error: '', work: '' };
}

/**
 * @param {object} input - `adapter` (an engine file), `program`, `task`, `model`, `work`, `pane` (updated as it runs),
 *   `timeoutMs`, `env`, `locked` (false only in tests on other systems), `session` (carry on from an earlier run),
 *   `onEvent(event)` (called for every step, piece of text and tool call as it arrives).
 * @returns {{stop: () => void, done: Promise<void>}} `done` settles when the engine has ended; it never rejects.
 */
export function runEngine({ adapter, program, task, model, work, pane, timeoutMs = 30 * 60_000, env = process.env, locked = true, session = '', onEvent }) {
  let child;
  let stopped = false;
  const done = new Promise((resolve) => {
    pane.status = 'running';
    pane.startedAt = Date.now();
    pane.work = work;
    pane.model = model || 'the engine\'s own default';
    const finish = (status, error = '') => {
      if (pane.endedAt) return;
      pane.status = status;
      pane.error = error;
      pane.endedAt = Date.now();
      resolve();
    };
    try {
      const engineArgs = adapter.args({ task, model, session });
      const command = locked ? [SANDBOX, ['-p', lockProfile({ work, own: adapter.ownFolders(), readable: [dirname(program)] }), program, ...engineArgs]] : [program, engineArgs];
      child = spawn(command[0], command[1], { cwd: work, env: { ...env, TERM: 'dumb', NO_COLOR: '1', CI: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      finish('failed', `The engine could not be started: ${String(error?.message ?? error).slice(0, 200)}`);
      return;
    }
    const timer = setTimeout(() => {
      stopped = true;
      finish('failed', `Stopped after ${Math.round(timeoutMs / 60000)} minutes without finishing.`);
      child.kill('SIGKILL');
    }, timeoutMs);
    let rest = '';
    let errors = '';
    child.stdout.on('data', (chunk) => {
      rest += chunk.toString('utf8');
      for (;;) {
        const end = rest.indexOf('\n');
        if (end < 0) break;
        const line = rest.slice(0, end).trim();
        rest = rest.slice(end + 1);
        if (!line) continue;
        const event = adapter.parse(line);
        if (!event) continue;
        if (event.session) pane.session = event.session;
        try {
          onEvent?.(event);
        } catch {
          /* a listener's trouble is not the engine's */
        }
        if (event.kind === 'step') {
          pane.steps += 1;
          pane.input += event.input;
          pane.output += event.output;
          if (event.cost > 0 || pane.cost !== null) pane.cost = (pane.cost ?? 0) + event.cost;
        } else if (event.kind === 'text') pane.text = (pane.text + event.text).slice(-TEXT_MAX);
        else if (event.kind === 'tool') pane.tools += 1;
        else if (event.kind === 'error') pane.error = event.message;
      }
      if (rest.length > 2_000_000) rest = '';
    });
    child.stderr.on('data', (chunk) => {
      errors = (errors + chunk.toString('utf8')).slice(-4000);
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      finish('failed', `The engine could not be started: ${String(error?.message ?? error).slice(0, 200)}`);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (stopped) return finish('stopped', pane.error);
      if (code === 0 && !pane.error) return finish('finished');
      const last = errors.trim().split('\n').filter(Boolean).pop() ?? '';
      finish('failed', pane.error || `The engine ended with code ${code}.${last ? ` It said: ${last.slice(0, 300)}` : ''}`);
    });
  });
  return {
    stop: () => {
      if (!child || child.exitCode !== null) return;
      stopped = true;
      child.kill('SIGTERM');
      setTimeout(() => child.exitCode === null && child.kill('SIGKILL'), 3000).unref?.();
    },
    done,
  };
}
