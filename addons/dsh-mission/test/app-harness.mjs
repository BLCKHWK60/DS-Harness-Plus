/**
 * The add-on in a stand-in app, for the point 17 tests (When it needs you): every helper answers through `answer(spec)`
 * with `{text}` at once or `{hold: true}` (released by the test); the app's approval card, the Tool ledger and Tool access
 * are recorded. Never the user's ~/.dsh: everything lives in fresh temporary folders.
 */
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { apply } from '../index.js';

export const fresh = (prefix = 'mission-p17-') => realpathSync(mkdtempSync(join(tmpdir(), prefix)));
export const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
export const PLAN = (items, extra = {}) => JSON.stringify({ summary: 's', items, checks: [], ...extra });
export const APPROVE = '{"verdict":"approve","note":"ok","items":[]}';

/** @returns {object} the stand-in app. */
/**
 * `driver: true` stands in for the app's goal round driver (dsh-goal-round-driver): a goal paused while its conversation
 * is running, from outside the conversation's own chain (agents.currentInitiator()), ends the running turn as the user's
 * Stop (turn/end aborted/user). `initiators: false` leaves agents.withInitiator out (an app that cannot say on whose
 * behalf a call is made).
 */
/** `services` (stage E) adds or replaces stand-in services (Route health, Budget guard, sessionController, Modes, …). */
/** `settingsIndex` (owner point 19) stands in for Settings helper's settings list (the repair helper names settings from it). */
export function appHarness({ config = {}, answer = () => undefined, driver = false, initiators = true, services: extra = {}, settingsIndex, home: givenHome } = {}) {
  const initiator = new AsyncLocalStorage();
  const cancels = [];
  // `home`: an earlier harness's home, as after an app restart (that harness removes it).
  const home = givenHome ?? fresh();
  const folders = givenHome ? [] : [home];
  const goals = new Map();
  const handlers = new Map();
  const commands = {};
  const emit = (name, ...args) => { for (const handler of handlers.get(name) ?? []) handler(...args); };
  const tools = {};
  const routes = {};
  const agents = new Map();
  const provided = {};
  const asked = [];
  const ledger = [];
  const holds = new Map();
  const seen = [];
  const pauses = [];
  let n = 0;
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: { isolated: () => false, get: () => 'code', readOnly: () => false, longTools: () => ({ files: true, web: true }), refreshTools: () => {}, ultraCode: () => false, depthOf: () => 'standard' },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    modelTiers: { resolveTier: () => null, roleRoute: () => undefined },
    permissionPresets: { current: () => 'workspace-write', set: () => {} },
    agents: { list: () => [...agents.values()], get: (id) => agents.get(id), currentInitiator: () => initiator.getStore(), ...(initiators ? { withInitiator: (agent, operation) => initiator.run(agent, operation) } : {}) },
    approval: { request: async (request) => { asked.push(request); return 'allowed-once'; } },
    toolLedger: { note: (entry) => ledger.push([entry.outcome, entry.rule]) },
    toolAccess: { grantParked: async ({ tool }) => ({ ok: true, id: `g-${tool}` }), denyParked: () => {}, revoke: async () => {} },
    goals: {
      create: (agent) => { const goal = { id: `g-${agent.id}`, revision: 1, phase: 'active' }; goals.set(agent.id, goal); return goal; },
      get: (agent) => goals.get(agent.id),
      pause: (agent) => {
        pauses.push(agent.id);
        goals.get(agent.id).phase = 'paused';
        if (driver && agent.status === 'running' && initiator.getStore() !== agent) {
          cancels.push(agent.id);
          emit('session/event', { id: agent.id }, { type: 'turn/end', data: { reason: { kind: 'aborted', reason: { kind: 'user' } } } });
        }
      },
      resume: (agent) => { goals.get(agent.id).phase = 'active'; },
      complete: (agent) => { goals.get(agent.id).phase = 'complete'; },
      clear: (agent) => { goals.delete(agent.id); },
    },
    subagents: {
      startActivation: async (spec) => {
        n += 1;
        const childId = `h${n}`;
        const parent = spec.parent?.id ?? 'c';
        const cwd = agents.get(parent)?.header?.cwd;
        agents.set(childId, { id: childId, header: { parentSession: parent, cwd }, session: { id: childId, header: { parentSession: parent, cwd } } });
        seen.push({ label: spec.label, childId, prompt: spec.prompt?.[0]?.text ?? '' });
        const given = (await answer(spec, childId)) ?? (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : spec.label === 'Mission: questions' ? { text: '{"questions": []}' } : /^Mission: item/.test(spec.label) ? { hold: true } : { text: APPROVE });
        if (given.throws) throw new Error(given.throws);
        if (given.hold) {
          let settle;
          const result = new Promise((resolve) => { settle = (text) => resolve({ output: text ? [{ type: 'text', text }] : [], stopReason: 'end' }); });
          holds.set(spec.label, { childId, settle });
          return { childId, result, dispose: () => settle('') };
        }
        return { childId, result: Promise.resolve({ output: [{ type: 'text', text: given.text ?? '' }], stopReason: 'end' }) };
      },
    },
    ...extra,
  };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (start) => start(),
    provide: (name, service) => { provided[name] = service; return () => {}; },
    on: (name, handler) => { handlers.set(name, [...(handlers.get(name) ?? []), handler]); return () => {}; },
    inject: (_deps, fn) => fn({
      effect: (start) => start(),
      tools: { register: (spec) => { tools[spec.name] = spec; return () => {}; } },
      commands: { register: (spec) => { commands[spec.name] = spec; return () => {}; } },
      webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } },
      connection: { requestRejection: () => undefined },
    }),
  };
  apply(ctx, { longKeepAwake: false, ...config }, Array.isArray(settingsIndex) ? { settingsIndex: () => settingsIndex } : {});
  const open = (id, given) => {
    const cwd = given ?? fresh();
    if (!given) folders.push(cwd);
    const agent = { id, header: { cwd }, session: { id, header: { cwd }, append: () => {} }, model: { current: () => ({ provider: 'p', model: 'm' }) } };
    agents.set(id, agent);
    return agent;
  };
  const chain = async (name, exec, ...rest) => {
    let decision = name === 'tools/pre-execute' ? { kind: 'allow' } : { kind: 'accept', content: [{ type: 'text', text: 'ran' }] };
    for (const handler of handlers.get(name) ?? []) decision = await handler(exec, ...rest, async () => decision);
    return decision;
  };
  const card = async (body) => {
    const chunks = [Buffer.from(JSON.stringify(body))];
    const req = { method: 'POST', url: '/dsh-mission/long', headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await routes['/dsh-mission/long'](req, res);
    return { status: res.statusCode, json: out ? JSON.parse(out) : null };
  };
  const get = async (sessionId) => {
    const req = { method: 'GET', url: `/dsh-mission/long?sessionId=${encodeURIComponent(sessionId)}`, headers: {} };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await routes['/dsh-mission/long'](req, res);
    return { status: res.statusCode, json: out ? JSON.parse(out) : null };
  };
  /** GET /dsh-mission/long?defaults=1: the defaults for a chat that is not open yet. */
  const defaults = async (sessionId = '') => {
    const req = { method: 'GET', url: `/dsh-mission/long?defaults=1${sessionId ? `&sessionId=${encodeURIComponent(sessionId)}` : ''}`, headers: {} };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await routes['/dsh-mission/long'](req, res);
    return { status: res.statusCode, json: out ? JSON.parse(out) : null };
  };
  const release = async (label, text = 'DONE: ok') => {
    for (let i = 0; i < 100 && !holds.has(label); i += 1) await tick(2);
    const held = holds.get(label);
    if (!held) throw new Error(`${label} is not at work`);
    holds.delete(label);
    held.settle(text);
    await tick(30);
  };
  const helperAgent = (label) => agents.get(holds.get(label)?.childId);
  const step = (agent) => tools.mission_step.execute({}, { agent, signal: new AbortController().signal });
  const mission = (agent, rawInput) => commands.mission.handler({ agent, rawInput });
  const done = () => { for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 30 }); };
  return { home, services, handlers, tools, goals, agents, provided, asked, ledger, holds, seen, pauses, cancels, open, chain, card, get, defaults, release, helperAgent, step, mission, emit, done, runner: () => provided.mission };
}
