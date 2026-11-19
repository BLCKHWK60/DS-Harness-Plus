// When the engine is missing, Research says why in plain words and names the right switch: Deep research's own "Deep research on"
// switch (still shown as on under Plugins) or the add-on not running at all.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply } from '../index.js';

/** The add-on on a stand-in app; `deep` is the Deep research service (or undefined) and `deepSettings` its settings row (or undefined). */
async function pageData({ deep, deepSettings }) {
  const home = mkdtempSync(join(tmpdir(), 'research-engine-'));
  const rows = [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }];
  if (deepSettings) rows.push({ ns: 'deep-research', value: deepSettings });
  const settings = { describe: () => rows, mutate: async () => {} };
  const services = { dshHomePath: (name) => join(home, name), settings, ...(deep ? { deepResearch: deep } : {}), modes: { get: () => 'cowork' }, agents: { list: () => [] } };
  let handler;
  const disposers = [];
  const ctx = {
    get: (key) => services[key],
    on() {},
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    provide() {},
    inject(_names, fn) {
      fn({ effect: (make) => { const dispose = make(); if (typeof dispose === 'function') disposers.push(dispose); }, webServer: { register: (route) => { handler = route.handler; return () => {}; } }, connection: { requestRejection: () => undefined } });
    },
    logger: { warn() {} },
  };
  try {
    apply(ctx, { enabled: true, focus: 'news', folder: '' });
    await new Promise((done) => setTimeout(done, 30));
    let body = '';
    const req = { method: 'GET', url: '/data', async *[Symbol.asyncIterator]() {} };
    const res = { setHeader() {}, end: (text) => { body = text ?? ''; } };
    await handler(req, res);
    return JSON.parse(body);
  } finally {
    for (const dispose of disposers) dispose();
    rmSync(home, { recursive: true, force: true });
  }
}

test('engine running: no problem is shown', async () => {
  const data = await pageData({ deep: {}, deepSettings: { enabled: true } });
  assert.equal(data.engine, true);
  assert.equal(data.problem, '');
});

test('Deep research switched off by its own switch: the page names that switch and does not send the person to Plugins alone', async () => {
  const data = await pageData({ deep: undefined, deepSettings: { enabled: false } });
  assert.equal(data.engine, false);
  assert.match(data.problem, /"Deep research on"/);
  assert.match(data.problem, /restart the app/);
  assert.match(data.problem, /still shows as on under Plugins/);
  assert.doesNotMatch(data.problem, /^The Deep research add-on is not running/);
});

test('Deep research not running for another reason: the page says to switch it on under Plugins', async () => {
  const data = await pageData({ deep: undefined, deepSettings: undefined });
  assert.match(data.problem, /not running.*Plugins/);
});
