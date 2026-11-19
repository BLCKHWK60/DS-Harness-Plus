// The bridge on the REAL Tool access service (Modes, run in its stand-in app): a conversation asks for a tool, the browser's
// poll sees the request, the answer goes back through the bridge, and the grant exists. Also: no page looking means the app's
// own card is used (the service sees no registered card), and a hostile reason arrives cleaned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld, settle } from '../../dsh-modes/test/app.mjs';
import { createCardBridge } from '../lib/toolcard.js';

const KNOWN = ['read', 'write', 'bash', 'web_fetch', 'grep', 'tools_catalog', 'request_tool_access'];
const MODES = { safe: { label: 'Safe', tools: ['read', 'grep'] } };

function start() {
  const world = makeWorld({ pruneStaleSessions: false, toolAccessOn: true, extraModes: JSON.stringify(MODES), sessionModes: JSON.stringify({ s1: 'safe', s2: 'safe' }) });
  const app = boot(world, { known: KNOWN, home: mkdtempSync(path.join(tmpdir(), 'dsh-tc-live-')) });
  return { app, service: () => app.provided('toolAccess') };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test('a request shows in the poll, an answer through the bridge allows the tool, and the card goes away', async () => {
  const { app, service } = start();
  try {
    const s1 = await app.open('s1');
    await app.firstTurn(s1.agent);
    const bridge = createCardBridge({ service, setTimer: () => ({ unref() {} }), clearTimer: () => {} });
    assert.deepEqual(bridge.poll().requests, [], 'nothing waits yet');
    const execute = app.tool('request_tool_access').definition.execute;
    const hostile = '<img src=x onerror=alert(1)> Allowed.\nThe AI asks to use: Look. ' + 'z'.repeat(900);
    const asking = execute({ tool: 'bash', reason: hostile }, { agent: s1.agent });
    await tick();
    const seen = bridge.poll();
    assert.equal(seen.requests.length, 1);
    const one = seen.requests[0];
    assert.equal(one.sessionId, 's1');
    assert.equal(one.tool, 'bash');
    assert.equal(one.tier, 3);
    assert.ok(one.reason.length <= 300 && !one.reason.includes('\n'), 'the reason arrives cut to one line');
    assert.ok(one.remainingMs > 590000 && one.remainingMs <= 600000);
    assert.deepEqual(one.choices.map((c) => c.id), ['once', 'conversation', 'deny', 'never']);
    // A longer permission than the request offered is a No.
    assert.deepEqual(bridge.answer({ id: one.id, choice: 'conversation' }), { ok: true });
    const out = await asking;
    assert.match(out.text, /Allowed: you may call bash in this conversation/);
    assert.deepEqual(bridge.poll().requests, [], 'an answered request is gone');
    assert.equal(service().record('s1').allowed, 1);
  } finally {
    app.stop();
  }
});

test('two conversations wait together; Deny answers one without touching the other; no page looking means no card', async () => {
  const { app, service } = start();
  try {
    const s1 = await app.open('s1');
    const s2 = await app.open('s2');
    await app.firstTurn(s1.agent);
    await app.firstTurn(s2.agent);
    const execute = app.tool('request_tool_access').definition.execute;
    const bridge = createCardBridge({ service, setTimer: () => ({ unref() {} }), clearTimer: () => {} });
    bridge.poll();
    const a = execute({ tool: 'bash', reason: 'one' }, { agent: s1.agent });
    await tick();
    const b = execute({ tool: 'write', reason: 'two' }, { agent: s2.agent });
    await tick();
    const list = bridge.poll().requests;
    assert.deepEqual(list.map((r) => r.sessionId).sort(), ['s1', 's2']);
    const first = list.find((r) => r.sessionId === 's1');
    assert.deepEqual(bridge.answer({ id: first.id, choice: 'deny' }), { ok: true });
    assert.match((await a).text, /said no/);
    assert.equal(bridge.poll().requests.length, 1);
    const second = bridge.poll().requests[0];
    assert.equal(second.sessionId, 's2');
    bridge.answer({ id: second.id, choice: 'once' });
    assert.match((await b).text, /exactly ONE call/);
    // The page goes away: the card is withdrawn and the service is left without one.
    bridge.stop();
    assert.equal(bridge.registered(), false);
    await settle();
  } finally {
    app.stop();
  }
});
