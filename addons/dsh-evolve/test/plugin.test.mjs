import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { apply, readSettings, readBody } from '../index.js';
import { openStore } from '../lib/store.js';
import { applyEdit, validateEdit } from '../lib/policy.js';

test('nothing is preconfigured', () => {
  const settings = readSettings({});
  assert.equal(settings.student, null);
  assert.equal(settings.reviewer, null);
  assert.equal(settings.judge, null);
  assert.equal(settings.repeats, 3);
  assert.equal(settings.target, '');
  assert.equal(readSettings({ target: ' Qwen-Coding ' }).target, 'qwen-coding');
  assert.equal(readSettings({ target: '../escape' }).target, '');
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(patch, /^\s*(studentModel|reviewerModel|judgeModel|studentProvider|reviewerProvider):/m);
});

test('settings are clamped and a model needs both parts', () => {
  const settings = readSettings({ studentProvider: 'p', studentModel: '', reviewerProvider: ' p ', reviewerModel: ' m ', repeats: 99, maxEdits: 0, tokenBudget: -5, costCeiling: 0.2, enabled: false });
  assert.equal(settings.student, null);
  assert.deepEqual(settings.reviewer, { provider: 'p', model: 'm' });
  assert.equal(settings.repeats, 5);
  assert.equal(settings.maxEdits, 1);
  assert.equal(settings.tokenBudget, 0);
  assert.equal(settings.costCeiling, 1);
  assert.equal(settings.enabled, false);
});

test('request bodies must be small JSON objects', async () => {
  assert.deepEqual(await readBody(Readable.from([Buffer.from('{"action":"measure"}')])), { action: 'measure' });
  assert.equal(await readBody(Readable.from([Buffer.from('[1,2]')])), undefined);
  assert.equal(await readBody(Readable.from([Buffer.from('not json')])), undefined);
  assert.equal(await readBody(Readable.from([Buffer.alloc(70 * 1024, 0x61)])), undefined);
});

test('a lesson for a mode reaches conversations in that mode', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'evolve-plugin-'));
  const store = openStore(dataDir);
  const first = store.active();
  store.savePolicy(applyEdit(first, validateEdit({ op: 'add_entry', family: 'code', text: 'A lesson for Code.' }, first).edit, 'v0002'));
  store.activate('v0002');

  // Modes answers get() with the mode id as a plain string.
  let section;
  const agent = { id: 's1', ctx: { effect: (fn) => fn(), systemPrompt: { section: (options) => ((section = options), () => {}) } } };
  const services = { modes: { get: () => 'code', isolated: () => false }, agents: { list: () => [agent] } };
  const noop = () => {};
  const ctx = { get: (name) => services[name], on: noop, effect: noop, provide: noop, inject: noop, logger: { warn: noop, info: noop } };
  apply(ctx, { dataDir, commandName: '' });
  assert.match(section.text(), /A lesson for Code\./);
  services.modes.get = () => 'chat';
  assert.doesNotMatch(section.text(), /A lesson for Code\./);
});
