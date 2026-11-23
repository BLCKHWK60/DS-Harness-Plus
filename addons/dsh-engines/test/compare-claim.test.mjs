/**
 * Item 4A, stage 6b, Part A (STAGE6B-DESIGN.md J4): the Compare page's dsh side is claimed into the Code space with Code
 * mode through the page's route (action `claim`), never by writing the owner's `modes.defaultMode`. A refused claim comes
 * back as the route's error, so the page sends nothing (the page itself is Part D).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENGINE_TEXTS, STATE_PATH, apply } from '../index.js';

function standIn(modes) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-engines-claim-'));
  let route;
  const writes = [];
  const settings = { mutate: (...args) => { writes.push(args); return { ok: true }; }, get: () => ({}) };
  const services = { dshHomePath: (part) => join(home, part), agents: { currentInitiator: () => undefined, get: () => undefined }, modes, settings };
  const ctx = {
    get: (name) => services[name],
    logger: { warn() {}, info() {} },
    effect: (make) => make(),
    on: () => () => {},
    inject: (names, use) => {
      if (names.includes('webServer')) {
        use({
          webServer: { register: (spec) => { route = spec; return () => {}; } },
          connection: { requestRejection: () => undefined },
          effect: (make) => make(),
        });
      }
    },
  };
  apply(ctx, { opencodePath: '/nonexistent/opencode', maxMinutes: 1, opencodeModels: [], applyWhen: 'review' });
  const post = async (body) => {
    const req = {
      method: 'POST',
      async *[Symbol.asyncIterator]() {
        yield Buffer.from(JSON.stringify(body));
      },
    };
    const res = { statusCode: 200, headers: {}, body: '', setHeader(key, value) { this.headers[key] = value; }, end(text = '') { this.body = String(text); } };
    await route.handler(req, res);
    return { status: res.statusCode, data: JSON.parse(res.body || '{}') };
  };
  assert.equal(route.path, STATE_PATH);
  return { post, writes, done: () => rmSync(home, { recursive: true, force: true }) };
}

function spyModes(apiVersion = 2, fail) {
  const calls = [];
  return {
    calls,
    modes: {
      apiVersion,
      async set(...args) {
        calls.push(args);
        if (fail) throw new Error(fail);
      },
    },
  };
}

test('compare-claims-code-space: the claim action calls set(id, "code", {claim, space: "code"})', async () => {
  const spy = spyModes(2);
  const app = standIn(spy.modes);
  try {
    const answer = await app.post({ action: 'claim', sessionId: 'abc-123' });
    assert.equal(answer.status, 200);
    assert.equal(answer.data.error, undefined);
    assert.deepEqual(spy.calls, [['abc-123', 'code', { claim: true, space: 'code' }]]);
  } finally {
    app.done();
  }
});

test('compare-claims-code-space: an older Modes (no space option) is claimed without the space', async () => {
  const spy = spyModes(1);
  const app = standIn(spy.modes);
  try {
    assert.equal((await app.post({ action: 'claim', sessionId: 's1' })).status, 200);
    assert.deepEqual(spy.calls, [['s1', 'code', { claim: true }]]);
  } finally {
    app.done();
  }
});

test('compare-claim-refused-sends-nothing: Modes\' refusal comes back as the error; no Modes, or no thread, is refused too', async () => {
  const refusal = 'Code is not offered in this space. Tick it in Settings → Modes.';
  const spy = spyModes(2, refusal);
  const app = standIn(spy.modes);
  const none = standIn(undefined);
  try {
    const answer = await app.post({ action: 'claim', sessionId: 's1' });
    assert.equal(answer.status, 400);
    assert.equal(answer.data.error, refusal, 'the sentence passes through');
    const missing = await none.post({ action: 'claim', sessionId: 's1' });
    assert.equal(missing.status, 400);
    assert.equal(missing.data.error, ENGINE_TEXTS.en.claimNoModes);
    for (const sessionId of ['', 'bad id with spaces', 42, 'x'.repeat(121)]) {
      const bad = await app.post({ action: 'claim', sessionId });
      assert.equal(bad.status, 400, String(sessionId));
    }
    assert.equal(spy.calls.length, 1, 'only the valid id reached Modes');
  } finally {
    app.done();
    none.done();
  }
});

test('compare-no-defaultmode-write: the claim never writes settings (no modes.defaultMode)', async () => {
  const spy = spyModes(2);
  const app = standIn(spy.modes);
  try {
    await app.post({ action: 'claim', sessionId: 's1' });
    await app.post({ action: 'claim', sessionId: 's2' });
    assert.deepEqual(app.writes, []);
  } finally {
    app.done();
  }
});

test('compare-claim-page-language (owner decision 28): a Chinese page still works and gets the English refusal; no language goes to Modes', async () => {
  const spy = spyModes(2);
  const app = standIn(spy.modes);
  const none = standIn(undefined);
  try {
    await app.post({ action: 'claim', sessionId: 's1', lang: 'zh-CN' });
    assert.deepEqual(spy.calls, [['s1', 'code', { claim: true, space: 'code' }]]);
    const missing = await none.post({ action: 'claim', sessionId: 's1', lang: 'zh' });
    assert.equal(missing.data.error, ENGINE_TEXTS.en.claimNoModes);
    assert.equal((await none.post({ action: 'claim', sessionId: 's1', lang: 'en-GB' })).data.error, ENGINE_TEXTS.en.claimNoModes);
  } finally {
    app.done();
    none.done();
  }
});
