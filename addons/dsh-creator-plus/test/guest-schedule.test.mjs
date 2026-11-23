/**
 * Item 4A, stage 6b, Part B (STAGE6B-DESIGN.md J14, 3.4; owner point 27): a guest in Workshop may use the app's schedule
 * tools (Modes' fences decide where its runs go); the Creator Plus mode at home keeps its own allow-list, without them
 * (point 26); a thread whose space Modes cannot read keeps them refused (fail closed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';
import { MODE_ID } from '../lib/mode.js';
import { ALLOWED, GUEST_EXTRA } from '../lib/rules.js';
import { ERROR_GUARD } from '../lib/space-guard.js';

const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), 'creator-plus-6b-')));

/** A Modes service of apiVersion 2: `cp…` threads are the Creator Plus mode at home, `u…` cannot be read, the rest guests. */
function newModes() {
  const modeOf = (id) => (String(id).startsWith('cp') ? MODE_ID : 'research');
  return {
    apiVersion: 2,
    get: (id) => modeOf(id),
    isolated: () => false,
    topOf: (id) => id,
    depthSpoken: () => 'standard',
    guardOf: (id) => {
      if (String(id).startsWith('u')) return { ...ERROR_GUARD, sealed: false, legacy: false };
      return { top: id, space: 'workshop', mode: modeOf(id), sealed: false, sealedBy: '', reconSpace: false, guardedBy: 'workshop', noPrograms: true, homeMode: modeOf(id) === MODE_ID, fresh: false, unknownTop: false };
    },
    spaces: { of: () => 'workshop' },
  };
}

function plugin() {
  const root = scratch();
  const realHome = join(root, 'dsh');
  const plus = join(realHome, 'addons', 'plus');
  mkdirSync(plus, { recursive: true });
  const build = join(root, 'work', 'conversation');
  mkdirSync(build, { recursive: true });
  const config = { enabled: true, logReaders: 'this-mac', strongModels: '', plusFolder: '', savedRuns: '[]', sessionBars: '{}' };
  const settings = { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }, { ns: 'creator-plus', value: { ...config } }], mutate: async () => {} };
  const tools = { register: () => () => {}, definitions: () => [] };
  const services = { dshHomePath: (name) => join(realHome, name), settings, tools, agents: { list: () => [], get: () => undefined }, mission: { longRun: () => false }, loader: { entries: () => [] }, modes: newModes() };
  const handlers = {};
  const provided = {};
  const effect = (fn) => fn();
  const ctx = {
    get: (key) => services[key],
    tools: { guard() { return () => {}; } },
    on(name, fn) { handlers[name] = fn; },
    effect,
    provide(name, value) { provided[name] = value; },
    inject(_names, fn) { fn({ effect, on() {}, schedule: { catalog: async () => [] }, webServer: { register: () => () => {} }, connection: { requestRejection: () => undefined } }); },
    logger: { warn() {}, info() {} },
  };
  apply(ctx, config, { home: join(realHome, 'creator-plus'), realHome, plusDir: plus, userHome: join(root, 'me'), programs: { bundle: join(root, 'App.app'), node: '/app/node', dsh: '/app/dsh' }, run: async () => ({ code: 0, stdout: '', stderr: '' }), sandboxExists: () => true, appVersion: '0.2.2' });
  const agent = (id) => ({ id, header: { cwd: build }, session: { deriveMessages: () => [] } });
  const decide = async (who, name, args = {}) => {
    let passed = false;
    const out = await handlers['tools/pre-execute']({ agent: who, name, arguments: args }, async () => { passed = true; return { kind: 'run' }; });
    return passed ? '' : out.reason;
  };
  return { provided, agent, decide, close: () => rmSync(root, { recursive: true, force: true }) };
}

test('workshop-guest-schedule-allowed: a guest in Workshop runs the app\'s schedule tools; its instruction is not read as paths', async () => {
  const app = plugin();
  try {
    const guest = app.agent('r1');
    for (const name of ['schedule_create', 'schedule_edit', 'schedule_list', 'schedule_view']) {
      assert.equal(await app.decide(guest, name, { title: 't', prompt: 'look at ~/Library/x every day', rrule: 'FREQ=DAILY', target: 'new' }), '', name);
    }
    assert.notEqual(await app.decide(guest, 'bash', { command: 'ls' }), '', 'the rest stays closed');
    assert.notEqual(await app.decide(guest, 'creator_scaffold', {}), '', 'never Creator Plus\'s own tools');
  } finally {
    app.close();
  }
});

test('creator-home-schedule-refused: the Creator Plus mode at home keeps its allow-list without schedules (point 26)', async () => {
  const app = plugin();
  try {
    assert.ok(!ALLOWED.has('schedule_create'));
    assert.notEqual(await app.decide(app.agent('cp1'), 'schedule_create', { target: 'this_session' }), '');
  } finally {
    app.close();
  }
});

test('unknown-guard: a thread whose space Modes cannot read keeps the schedule tools refused here', async () => {
  const app = plugin();
  try {
    assert.notEqual(await app.decide(app.agent('u1'), 'schedule_create', { target: 'this_session' }), '');
  } finally {
    app.close();
  }
});

test('allowed() lists schedule_ for guests (3.4), frozen; GUEST_EXTRA is the prefix form', () => {
  const app = plugin();
  try {
    const list = app.provided.creatorPlus.allowed();
    assert.ok(list.includes('schedule_'));
    assert.ok(Object.isFrozen(list));
    assert.deepEqual([...GUEST_EXTRA], ['schedule_']);
  } finally {
    app.close();
  }
});
