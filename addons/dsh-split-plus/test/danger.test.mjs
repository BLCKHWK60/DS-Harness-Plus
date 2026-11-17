/**
 * Split Plus's Danger zone: each rule holds by default, and a switch the owner turns on opens that rule
 * only; the page learns which are off, and each change is noted. Stand-ins and throwaway folders only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DANGERS, DATA_PATH } from '../index.js';

const folder = () => realpathSync(mkdtempSync(join(tmpdir(), 'split-plus-danger-')));

function standIn(home, dir, config) {
  const routes = new Map();
  const hooks = {};
  const guards = [];
  const ctx = {
    get: (name) => (name === 'settings' ? { describe: () => [{ ns: 'modes', value: { modes: { code: { label: 'Code' } }, extraModes: { recon: { label: 'Recon', isolated: true } } } }] }
      : name === 'modes' ? { get: (id) => (id === 'r1' ? 'recon' : 'code'), isolated: (id) => id === 'r1' }
        : name === 'workingDirectory' ? { get: () => dir }
          : name === 'sessionQuery' ? { readSurface: async () => ({ events: [] }) } : undefined),
    tools: { guard: (fn) => { guards.push(fn); return () => {}; } },
    on: (name, fn) => { hooks[name] = fn; },
    effect: (fn) => fn(),
    inject(_names, fn) { fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } }); },
    logger: { warn() {} },
  };
  apply(ctx, { enabled: true, ...config }, { home });
  return { routes, hooks, guards };
}
async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  let text = '';
  const res = { statusCode: 200, setHeader() {}, end(value) { text = value ?? ''; } };
  await routes.get(DATA_PATH).handler(req, res);
  return { status: res.statusCode, data: text ? JSON.parse(text) : {} };
}

test('by default every rule holds and the page learns of no switch', async () => {
  const home = folder();
  try {
    const { routes } = standIn(home, home, {});
    assert.deepEqual((await hit(routes, {})).data.danger, []);
    assert.match((await hit(routes, { method: 'POST', body: { action: 'send', fromSessionId: 'r1', toSessionId: 'c1', kind: 'selection', text: 'x' } })).data.error, /Export… button/);
    assert.match((await hit(routes, { method: 'POST', body: { action: 'watch', watcher: 'w1', watched: 'r1' } })).data.error, /cannot be watched/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('each switch opens its own rule only, the page shows which, and the change is noted', async () => {
  const home = folder();
  try {
    const { routes, guards } = standIn(home, home, { dangerSealedSends: true, dangerWatchSealed: true, dangerWatcherTools: true, dangerUnmarked: true });
    const view = (await hit(routes, {})).data.danger;
    assert.deepEqual(view.map((one) => one.name), ['dangerSealedSends', 'dangerWatchSealed', 'dangerWatcherTools', 'dangerUnmarked']);
    assert.equal(view[0].what, DANGERS.dangerSealedSends);
    const sent = await hit(routes, { method: 'POST', body: { action: 'send', fromSessionId: 'r1', toSessionId: 'c1', kind: 'selection', text: 'found it', start: true } });
    assert.equal(sent.data.text, 'found it', 'out of Recon, and without the card');
    assert.equal((await hit(routes, { method: 'POST', body: { action: 'watch', watcher: 'w1', watched: 'r1' } })).status, 200);
    assert.equal(guards.map((guard) => guard({ agent: { id: 'w1', session: { header: { id: 'w1' } } }, name: 'write' })).find(Boolean), undefined, 'the watcher may use every tool');
    const log = readFileSync(join(home, 'danger.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.deepEqual(log.at(-1).on, ['dangerSealedSends', 'dangerWatchSealed', 'dangerWatcherTools', 'dangerUnmarked']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('with the file holds switched off, a stale change is no longer refused', async () => {
  const home = folder();
  try {
    const file = join(home, 'shared.md');
    writeFileSync(file, 'one');
    const { routes, hooks } = standIn(home, home, { dangerFileHolds: true });
    await hit(routes, { method: 'POST', body: { action: 'panes', panes: [{ id: 'a', sessionId: 'A' }, { id: 'b', sessionId: 'B' }] } });
    const run = async (who, name, args) => {
      const exec = { agent: { id: who, session: { header: { id: who } } }, name, arguments: args, callId: `${who}${Math.random()}`, signal: new AbortController().signal };
      const allowed = await hooks['tools/pre-execute'](exec, async () => ({ kind: 'allow' }));
      await hooks['tools/post-execute'](exec, { content: [{ type: 'text', text: 'ok' }] }, async () => ({ kind: 'accept' }));
      return allowed;
    };
    await run('B', 'read', { file_path: 'shared.md' });
    writeFileSync(file, 'changed');
    utimesSync(file, Date.now() / 1000 + 10, Date.now() / 1000 + 10);
    assert.equal((await run('B', 'write', { file_path: 'shared.md', content: 'x' })).kind, 'allow');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
