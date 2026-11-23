/**
 * A runner on stand-in services for the stage E tests (repair helper, model server down, carry on after a restart).
 * Never the user's ~/.dsh: everything lives in fresh temporary folders.
 */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunner } from '../runner.js';

export const fresh = (name = 'mission-e-') => realpathSync(mkdtempSync(join(tmpdir(), name)));
export const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
export const PLAN = (items, extra = {}) => JSON.stringify({ summary: 's', items, checks: [], ...extra });
export const APPROVE = '{"verdict":"approve","note":"ok","items":[]}';
export const REPAIR = (own = [], ask = [], cause = 'found it') => JSON.stringify({ cause, fixed: own.length > 0, own, ask });

/**
 * @param {object} given
 * @param {(spec: object, childId: string) => object | undefined} [given.answer] - {text, stopReason, diagnostic, throws}.
 * @param {object} [given.services] - more stand-in services (routeHealth, modelTiers, sessionController, agents).
 * @param {object} [given.points] - {skip: true} (no checkpoints), {since: {changed, added, deleted}}.
 * @param {string} [given.home] - Mission's home (a record of runs that a second runner reads).
 * @param {object} [given.calls] - Calls at once per provider.
 * @param {object[]} [given.settingsIndex] - owner point 19: the settings list the repair helper names settings from.
 */
export function bench({ answer, services = {}, points = {}, home, calls = {}, root: given, agentOpen = true, settingsIndex } = {}) {
  const root = given ?? fresh();
  const goal = { id: 'g', revision: 1, phase: 'active', activation: 'armed' };
  let made = false;
  const goalCalls = [];
  const goals = {
    create: () => { goalCalls.push('create'); made = true; goal.phase = 'active'; goal.activation = 'armed'; return goal; },
    get: () => (made ? { ...goal } : undefined),
    pause: () => { goalCalls.push('pause'); goal.phase = 'paused'; },
    resume: () => { goalCalls.push('resume'); goal.phase = 'active'; goal.activation = 'armed'; },
    complete: () => { goalCalls.push('complete'); goal.phase = 'complete'; },
    clear: () => { made = false; },
  };
  const seen = [];
  let n = 0;
  const subagents = {
    startActivation: async (spec) => {
      n += 1;
      const childId = `child-${n}`;
      seen.push({ label: spec.label, prompt: spec.prompt?.[0]?.text ?? '', childId, model: spec.agentOptions?.model ?? '', provider: spec.agentOptions?.provider ?? '' });
      const got = (await answer?.(spec, childId)) ?? { text: 'DONE: did it' };
      if (got.throws) throw Object.assign(new Error(got.throws), got.code ? { code: got.code } : {});
      // `later`: called while the helper works (after the app started it), then it answers.
      if (typeof got.later === 'function') return { childId, result: new Promise((resolve) => setTimeout(() => { got.later(); resolve({ output: got.text ? [{ type: 'text', text: got.text }] : [], stopReason: got.stopReason ?? 'end' }); }, 5)) };
      return { childId, result: Promise.resolve({ output: got.text ? [{ type: 'text', text: got.text }] : [], stopReason: got.stopReason ?? 'end', ...(got.diagnostic ? { diagnostic: got.diagnostic } : {}) }) };
    },
  };
  const all = { goals, subagents, ...services };
  const ctx = { get: (name) => all[name] };
  const labels = [];
  let number = 0;
  const pointStore = {
    take: async (label) => {
      labels.push(label);
      if (points.skip) return { id: '', number: 0, skipped: true, reason: 'No checkpoints here.' };
      number += 1;
      return { id: `p${number}`, number, fresh: true };
    },
    files: async () => ({ files: [], more: false }),
    idOf: async () => 'p1',
    changes: async () => '',
    since: async () => points.since ?? { changed: [], added: [], deleted: [] },
  };
  const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const runner = createRunner(ctx, {
    settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {}, long: { assistant: 'look' } }),
    pointsOf: () => pointStore, afterCommand: async () => [], warn: () => {}, home,
    callsAtOnce: (provider) => calls[provider] ?? 4,
    agentOf: (id) => (agentOpen && id === agent.id ? agent : undefined),
    ...(Array.isArray(settingsIndex) ? { settingsIndex: () => settingsIndex } : {}),
  });
  const fired = [];
  runner.onEvent((event) => fired.push(event));
  const step = () => runner.step(agent, new AbortController().signal, 60000);
  const start = (long = {}, goalText = 'do two small things') => runner.start(agent, goalText, { mode: 'auto', root }, { kind: 'long', long: { minutes: 60, laps: 2, ...long } });
  const done = () => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  return { runner, agent, root, goal, goals, goalCalls, seen, fired, labels, step, start, done, run: () => runner.runOf('conv') };
}
