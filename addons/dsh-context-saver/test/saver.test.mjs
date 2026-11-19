// Context saver: when it shortens a tool result and when it must not, and what happens when its helper
// misbehaves (never fails a tool call). The Python helper is replaced by a small Node script that speaks the
// same one-line-JSON protocol, started through a tiny shell wrapper that stands in for the "python" setting.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Config, apply } from '../index.js';

const HELPER = `
import { createInterface } from 'node:readline';
const calls = [];
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const { id, method, params } = JSON.parse(line);
  const reply = (result) => process.stdout.write(JSON.stringify({ id, result }) + '\\n');
  if (method === 'compress') {
    calls.push(params);
    if (params.text.includes('HANG')) return;
    if (params.text.includes('CRASH')) process.exit(3);
    if (params.text.includes('GARBAGE')) { process.stdout.write('not json\\n'); return; }
    if (params.text.includes('ERROR')) { process.stdout.write(JSON.stringify({ id, error: 'boom' }) + '\\n'); return; }
    if (params.text.includes('KEEP')) return reply({ changed: false });
    return reply({ changed: true, text: 'SHORT[' + params.surface + ',' + params.min_chars + ',' + params.min_gain + ']' });
  }
  if (method === 'savings') return reply({ today: { calls: 2, before: 100, after: 40, saved: 60 }, period: { calls: 5, before: 500, after: 200, saved: 300 } });
  if (method === 'store_stats') return reply({ items: 4 });
});
`;

/** A wrapper script that runs the stand-in helper when the app starts "python -m dsh_intel_mcp.context_saver". */
function makeHelper() {
  const dir = mkdtempSync(join(tmpdir(), 'context-saver-test-'));
  writeFileSync(join(dir, 'helper.mjs'), HELPER);
  const python = join(dir, 'fake-python');
  writeFileSync(python, `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${join(dir, 'helper.mjs')}"\n`);
  chmodSync(python, 0o755);
  return { dir, python, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function fakeApp(helper, options = {}, services = {}) {
  const handlers = {};
  const provided = {};
  const disposers = [];
  const warnings = [];
  const commands = {};
  const sections = [];
  const config = { enabled: true, python: helper.python, dataDir: helper.dir, minChars: 500, minGainPercent: 15, perTier: {}, skipTools: ['read', 'write'], retrieveToolName: 'mcp__context__context_retrieve', helperTimeoutMs: 5000, promptSection: true, commandName: 'saved', ...options };
  const ctx = {
    get: (name) => services[name],
    on: (event, handler) => { handlers[event] = handler; },
    logger: { warn: (m) => warnings.push(m), info: () => {} },
    effect: (fn) => { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); },
    provide: (key, value) => { provided[key] = value; },
    inject: (_names, callback) => callback({ effect: (fn) => fn(), commands: { register: (command) => { commands[command.name] = command; } } }),
  };
  apply(ctx, config);
  const big = (extra = '') => `${extra}${'x'.repeat(900)}`;
  /** One tool result through the hook. */
  const run = (name, blocks, { isError = false, agent = { id: 'a' }, decision } = {}) =>
    handlers['tools/post-execute']({ name, agent }, { content: blocks, isError }, async () => decision ?? { kind: 'accept' });
  return { handlers, provided, warnings, commands, sections, big, run, stop: () => disposers.forEach((d) => d()) };
}
const text = (value) => [{ type: 'text', text: value }];

test('the settings keep their keys and defaults', () => {
  const config = Config({ python: 'p', dataDir: '/d' });
  assert.equal(config.enabled, false);
  assert.equal(config.minChars, 4000);
  assert.equal(config.minGainPercent, 15);
  assert.equal(config.helperTimeoutMs, 10000);
  assert.equal(config.retrieveToolName, 'mcp__context__context_retrieve');
  assert.equal(config.commandName, 'saved');
  assert.ok(['read', 'write', 'edit', 'apply_patch'].every((tool) => config.skipTools.includes(tool)), 'file reads and edits are never shortened by default');
});

test('off by default: nothing is registered; on, it needs an interpreter and an absolute data folder', () => {
  const helper = makeHelper();
  const off = fakeApp(helper, { enabled: false });
  assert.deepEqual(Object.keys(off.handlers), []);
  assert.throws(() => fakeApp(helper, { python: ' ' }), /python/);
  assert.throws(() => fakeApp(helper, { dataDir: 'relative' }), /absolute/);
  helper.cleanup();
});

test('a long result is replaced by the helper\'s shorter text, with the surface and limits sent along', async (t) => {
  const helper = makeHelper();
  const app = fakeApp(helper, {}, { modes: { get: () => 'code' } });
  t.after(() => { app.stop(); helper.cleanup(); });
  const out = await app.run('grep', text(app.big()));
  assert.deepEqual(out.content, [{ type: 'text', text: 'SHORT[code,500,0.15]' }]);
});

test('a surface that is not chat or code is sent as cowork', async (t) => {
  const helper = makeHelper();
  const app = fakeApp(helper, {}, { modes: { get: () => 'research' } });
  t.after(() => { app.stop(); helper.cleanup(); });
  assert.match((await app.run('grep', text(app.big()))).content[0].text, /^SHORT\[cowork,/);
});

test('results that must stay whole are left alone: short ones, errors, skipped tools, the retrieve tool, images, isolated conversations, and a helper that decides no', async (t) => {
  const helper = makeHelper();
  const app = fakeApp(helper, {}, { modes: { isolated: (id) => id === 'iso' } });
  t.after(() => { app.stop(); helper.cleanup(); });
  const same = async (name, blocks, options) => { const out = await app.run(name, blocks, options); assert.equal(out.content, undefined, `${name} must be unchanged`); };
  await same('grep', text('short result'));
  await same('grep', text(app.big()), { isError: true });
  await same('read', text(app.big()));
  await same('write', text(app.big()));
  await same('mcp__context__context_retrieve', text(app.big()));
  await same('grep', [{ type: 'image', data: 'x'.repeat(2000) }]);
  await same('grep', text(app.big()), { agent: { id: 'iso' } });
  await same('grep', text(app.big('KEEP ')));
  // A decision that is not a plain accept (for example a rewritten or blocked result) is not touched.
  const blocked = await app.run('grep', text(app.big()), { decision: { kind: 'reject' } });
  assert.deepEqual(blocked, { kind: 'reject' });
});

test('only the long text blocks of a result are shortened', async (t) => {
  const helper = makeHelper();
  const app = fakeApp(helper);
  t.after(() => { app.stop(); helper.cleanup(); });
  const out = await app.run('grep', [{ type: 'text', text: 'tiny' }, { type: 'text', text: app.big() }, { type: 'image', data: 'i' }]);
  assert.equal(out.content[0].text, 'tiny');
  assert.match(out.content[1].text, /^SHORT/);
  assert.deepEqual(out.content[2], { type: 'image', data: 'i' });
});

test('per-tier: with a list, only the tiers switched on are shortened; with none listed, all are', async (t) => {
  const helper = makeHelper();
  const tiers = { resolveTier: (id) => (id === 'on' ? { id: 'fast' } : id === 'off' ? { id: 'deep' } : null) };
  const app = fakeApp(helper, { perTier: { fast: true, deep: false } }, { modelTiers: tiers });
  t.after(() => { app.stop(); helper.cleanup(); });
  assert.match((await app.run('grep', text(app.big()), { agent: { id: 'on' } })).content[0].text, /^SHORT/);
  assert.equal((await app.run('grep', text(app.big()), { agent: { id: 'off' } })).content, undefined);
  assert.equal((await app.run('grep', text(app.big()), { agent: { id: 'none' } })).content, undefined);
});

test('a helper that errors or hangs never fails the tool call; one warning is logged, and the next result is shortened again', async (t) => {
  const helper = makeHelper();
  const app = fakeApp(helper, { helperTimeoutMs: 2500 });
  t.after(() => { app.stop(); helper.cleanup(); });
  for (const word of ['ERROR', 'HANG']) {
    const decision = await app.run('grep', text(app.big(`${word} `)));
    assert.equal(decision.kind, 'accept', word);
    assert.equal(decision.content, undefined, word);
  }
  assert.equal(app.warnings.filter((line) => /leaving tool results unchanged/.test(line)).length, 1, 'logged once, not twice');
  // And it recovers: the next ordinary result is shortened again (the helper restarts on the next call).
  assert.match((await app.run('grep', text(app.big()))).content[0].text, /^SHORT/);
});

test('a helper that keeps crashing is left alone for a while instead of being restarted for ever', async (t) => {
  const helper = makeHelper();
  const app = fakeApp(helper);
  t.after(() => { app.stop(); helper.cleanup(); });
  for (let i = 0; i < 4; i += 1) assert.equal((await app.run('grep', text(app.big('CRASH ')))).content, undefined);
  assert.ok(app.warnings.some((line) => /failed 3 times in a minute; paused for 5 minutes/.test(line)));
  assert.equal((await app.run('grep', text(app.big()))).content, undefined, 'paused: even a good result is passed on unchanged');
});

test('a helper that cannot be started leaves results unchanged', async (t) => {
  const helper = makeHelper();
  const app = fakeApp(helper, { python: join(helper.dir, 'does-not-exist') });
  t.after(() => { app.stop(); helper.cleanup(); });
  const decision = await app.run('grep', text(app.big()));
  assert.equal(decision.content, undefined);
});

test('/saved and the savings service report what the helper says', async (t) => {
  const helper = makeHelper();
  const app = fakeApp(helper);
  t.after(() => { app.stop(); helper.cleanup(); });
  const out = await app.commands.saved.handler();
  assert.equal(out.kind, 'success');
  assert.equal(out.text, 'Context Saver: today 2 results, 100→40 tokens (saved 60); last 30 days 5 results, 500→200 tokens (saved 300); 4 originals stored.');
  assert.equal((await app.provided.contextSaver.storeStats()).items, 4);
});

test('the prompt section is added to each conversation, tells the model about the marker, and is empty for an isolated one', async (t) => {
  const helper = makeHelper();
  const added = {};
  const mkAgent = (id) => ({ id, ctx: { effect: (fn) => fn(), systemPrompt: { section: (section) => { added[id] = section; return () => { added[id] = null; }; } } } });
  const first = mkAgent('a'); const iso = mkAgent('iso');
  const app = fakeApp(helper, {}, { agents: { list: () => [first] }, modes: { isolated: (id) => id === 'iso' } });
  t.after(() => { app.stop(); helper.cleanup(); });
  assert.match(added.a.text(), /context_retrieve/);
  assert.equal(added.a.name, 'context-saver');
  app.handlers['agent/created']({ agent: iso });
  assert.equal(added.iso.text(), '');
  app.stop();
  assert.equal(added.a, null, 'the section goes when the add-on stops');
  const without = fakeApp(helper, { promptSection: false });
  assert.equal(without.handlers['agent/created'], undefined);
  without.stop();
});
