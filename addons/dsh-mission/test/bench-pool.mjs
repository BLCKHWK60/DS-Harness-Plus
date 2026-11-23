/**
 * A stand-in runner for the stage D tests (pool, parking): helpers the test lets finish in any order.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClaims } from '../lib/claims.js';
import { createRunner } from '../runner.js';

const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), 'mission-pool-')));
export const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const signal = () => new AbortController().signal;
export const PLAN = (items, extra = {}) => JSON.stringify({ summary: 's', items, checks: [], ...extra });
export const APPROVE = JSON.stringify({ verdict: 'approve', note: 'ok', items: [] });

/**
 * A runner whose helpers the test controls. `answer(spec)` gives `{text}` at once, or `{hold: true}`: the helper works
 * until `release(label, text)` (or until it is stopped).
 */
export function bench({ answer = () => ({ text: 'DONE: ok' }), callsAtOnce = 4, settings = {}, points: givenPoints, activation, grants, home, retryAfterMs } = {}) {
  const root = fresh();
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const goals = {
    create: () => { made = true; goal.phase = 'active'; return goal; },
    get: () => (made ? goal : undefined),
    pause: () => { goal.phase = 'paused'; },
    resume: () => { goal.phase = 'active'; },
    complete: () => { goal.phase = 'complete'; },
    clear: () => { made = false; },
  };
  const seen = [];
  const holds = new Map();
  let live = 0;
  let most = 0;
  let n = 0;
  const subagents = {
    startActivation: async (spec) => {
      if (activation && activation(spec) === 'full') throw Object.assign(new Error('ACTIVATION_LIMIT_REACHED'), { code: 'ACTIVATION_LIMIT_REACHED' });
      n += 1;
      const childId = `child-${n}`;
      const label = spec.label;
      seen.push({ label, prompt: spec.prompt?.[0]?.text ?? '', childId });
      const got = (await answer(spec, childId)) ?? { text: 'DONE: ok' };
      live += 1;
      most = Math.max(most, live);
      if (got.hold) {
        let settle;
        let over = false;
        const result = new Promise((resolve) => { settle = (text) => { if (over) return; over = true; live -= 1; resolve({ output: text ? [{ type: 'text', text }] : [], stopReason: 'end' }); }; });
        holds.set(label, settle);
        return { childId, result, dispose: () => { if (holds.get(label) === settle) holds.delete(label); settle(''); } };
      }
      live -= 1;
      return { childId, result: Promise.resolve({ output: got.text ? [{ type: 'text', text: got.text }] : [], stopReason: 'end' }) };
    },
  };
  const services = { goals, subagents };
  const ctx = { get: (name) => services[name] };
  const points = givenPoints ?? { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '', since: async () => ({ changed: [], deleted: [], added: [] }), back: async () => ({ saved: 9 }) };
  const claims = createClaims();
  const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const runner = createRunner(ctx, {
    settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {}, ...settings }),
    ...(grants ? { grants } : {}),
    pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: home ? (sub) => join(home, sub) : undefined, claims, callsAtOnce: () => callsAtOnce,
    agentOf: () => agent, activationRetryMs: 5, activationMaxMs: 60, ...(retryAfterMs ? { retryAfterMs } : {}),
  });
  const fired = [];
  runner.onEvent((event) => fired.push(event));
  const release = async (label, text = 'DONE: ok') => {
    for (let i = 0; i < 100 && !holds.has(label); i += 1) await tick(2);
    const settle = holds.get(label);
    assert.ok(settle, `${label} is at work`);
    holds.delete(label);
    settle(text);
    await tick(10);
  };
  const working = () => [...holds.keys()].sort();
  const step = (ms = 2000) => runner.step(agent, signal(), ms);
  const done = () => rmSync(root, { recursive: true, force: true });
  return { runner, agent, root, goal, seen, fired, release, working, step, done, claims, most: () => most, holds };
}

/** Helpers that hold every item until released; the question pass asks nothing; the reviewer approves. */
export const holdItems = (spec) => (/^Mission: item/.test(spec.label) ? { hold: true } : spec.label === 'Mission: planner' ? undefined : spec.label === 'Mission: questions' ? { text: '{"questions": []}' } : { text: APPROVE });
