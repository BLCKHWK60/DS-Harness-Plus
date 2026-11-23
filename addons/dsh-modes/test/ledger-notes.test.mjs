/**
 * Modes tells the Tool ledger (dsh-tool-ledger, service `toolLedger`) which of its rules refused a call, and what
 * a request for a tool came to. The ledger is optional: without it, or when it throws, Modes refuses exactly as before.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld } from './app.mjs';

const KNOWN = ['read', 'write', 'bash', 'web_fetch', 'recon_cite', 'tools_catalog', 'request_tool_access'];
const MODES = { lab: { label: 'Lab', tools: 'all' }, safe: { label: 'Safe', tools: ['read'] }, recon: { label: 'Recon', tools: ['recon_cite'], isolated: true } };

function start(ledger) {
  const world = makeWorld({
    pruneStaleSessions: false,
    toolAccessOn: true,
    extraModes: JSON.stringify(MODES),
    sessionModes: JSON.stringify({ l1: 'lab', s1: 'safe', r1: 'recon' }),
  });
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-ledger-notes-'));
  return boot(world, { known: KNOWN, home, services: ledger === undefined ? {} : { toolLedger: ledger } });
}

test('a refusal by a Modes rule is noted with the rule\'s name', async () => {
  const notes = [];
  const app = start({ note: (event) => notes.push(event) });
  try {
    const l1 = await app.open('l1');
    const r1 = await app.open('r1');
    assert.ok(app.guard({ name: 'bash', agent: l1.agent, arguments: { command: 'cat ~/.dsh/.credentials.yml' } }));
    assert.ok(app.guard({ name: 'bash', agent: r1.agent, arguments: { command: 'ls' } }));
    assert.equal(app.guard({ name: 'read', agent: l1.agent, arguments: { path: 'notes.md' } }), undefined);
    assert.deepEqual(notes.map((event) => [event.sessionId, event.tool, event.outcome, event.rule, event.by]), [
      ['l1', 'bash', 'refused', 'secrets', 'modes'],
      ['r1', 'bash', 'refused', 'isolated', 'modes'],
    ]);
    // The call itself is passed along (so the ledger joins the note to exactly that call); the ledger stores names only.
    assert.equal(notes[0].exec?.name, 'bash');
    assert.ok(notes.every(({ exec: _exec, ...rest }) => !JSON.stringify(rest).includes('credentials')), 'the call\'s words are not in the note itself');
  } finally {
    app.stop();
  }
});

test('without the ledger, or with a broken one, Modes refuses the same way', async () => {
  for (const ledger of [undefined, { note: () => { throw new Error('broken'); } }]) {
    const app = start(ledger);
    try {
      const l1 = await app.open('l1');
      assert.match(app.guard({ name: 'bash', agent: l1.agent, arguments: { command: 'cat ~/.dsh/.credentials.yml' } }), /secrets/);
    } finally {
      app.stop();
    }
  }
});

test('a request for a tool is noted with the answer\'s code, never the reason given', async () => {
  const notes = [];
  const app = start();
  try {
    const s1 = await app.open('s1');
    await app.firstTurn(s1.agent);
    app.provided('toolAccess').registerCard(async () => ({ choice: 'deny' }));
    const agent = { ...s1.agent, ctx: { get: (name) => (name === 'toolLedger' ? { note: (event) => notes.push(event) } : undefined) } };
    await app.tool('request_tool_access').definition.execute({ tool: 'write', reason: 'PRIVATE REASON' }, { agent });
    assert.equal(notes.length, 1);
    assert.deepEqual([notes[0].sessionId, notes[0].tool, notes[0].outcome, notes[0].rule, notes[0].by, notes[0].via], ['s1', 'write', 'denied', 'denied', 'tool-access', 'access-request']);
    assert.ok(!JSON.stringify(notes).includes('PRIVATE'), 'the reason never goes to the ledger');
  } finally {
    app.stop();
  }
});
