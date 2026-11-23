// Item 4A, stage 6a: Research saves nothing from a sealed thread (Recon, any mode); no Modes saves as before.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { apply } from '../index.js';
import { MODE_ID } from '../lib/mode.js';

function plugin(modes) {
  const home = mkdtempSync(join(tmpdir(), 'research-sealed-'));
  const provided = {};
  const listeners = [];
  const sections = [];
  const services = {
    dshHomePath: (name) => join(home, name),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', defaultMode: 'cowork' } }], mutate: async () => {} },
    deepResearch: {},
    modes,
    agents: { list: () => [], get: (id) => ({ id }) },
  };
  const ctx = {
    get: (key) => services[key],
    on(name, fn) { listeners.push([name, fn]); },
    effect(fn) { fn(); },
    provide(name, value) { provided[name] = value; },
    inject() {},
    logger: { warn() {} },
  };
  apply(ctx, { enabled: true, focus: 'news', folder: '' });
  const reports = join(home, 'research', 'reports');
  const emit = (name, ...args) => { for (const [n, fn] of listeners) if (n === name) fn(...args); };
  const agent = (id) => ({ id, ctx: { effect: (make) => make(), systemPrompt: { section: (s) => { sections.push(s); return () => {}; } } } });
  return { provided, reports, home, emit, agent, sections, close: () => rmSync(home, { recursive: true, force: true }) };
}

const guardModes = (sealedIds) => ({
  get: () => MODE_ID,
  guardOf: (id) => ({ sealed: sealedIds.includes(id), sealedBy: sealedIds.includes(id) ? 'recon' : '', reconSpace: sealedIds.includes(id) }),
});

test('research-sealed-no-save: a sealed thread gets save false, no report, no packet, no pin, no note', () => {
  const app = plugin(guardModes(['recon-1']));
  try {
    assert.equal(app.provided.research.runOptions('recon-1').save, false);
    assert.equal(app.provided.research.saveReport('recon-1', { question: 'Q', text: 'Body.', packet: { tables: [] } }), '');
    assert.equal(existsSync(app.reports) ? readdirSync(app.reports).length : 0, 0);
    app.emit('session/event', { id: 'recon-1', header: {} }, { type: 'turn/start' });
    assert.equal(existsSync(join(app.home, 'research', 'conversations.json')), false);
    app.emit('agent/created', { agent: app.agent('recon-1') });
    assert.equal(app.sections.at(-1).text(), '');
    // A Chat thread in Research is unchanged.
    assert.equal(app.provided.research.runOptions('chat-1').save, true);
    const file = app.provided.research.saveReport('chat-1', { question: 'Q', text: 'Body.' });
    assert.ok(file && existsSync(file));
    app.emit('agent/created', { agent: app.agent('chat-1') });
    assert.notEqual(app.sections.at(-1).text(), '');
  } finally {
    app.close();
  }
});

test('research-sealed-no-save: a Modes error counts as sealed', () => {
  const app = plugin({ get: () => MODE_ID, guardOf: () => { throw new Error('x'); } });
  try {
    assert.equal(app.provided.research.saveReport('a', { question: 'Q', text: 'Body.' }), '');
  } finally {
    app.close();
  }
});

test('research-modes-absent: no Modes service saves as before', () => {
  const app = plugin(undefined);
  try {
    const file = app.provided.research.saveReport('a', { question: 'Q', text: 'Body.' });
    assert.ok(file && existsSync(file));
  } finally {
    app.close();
  }
});
