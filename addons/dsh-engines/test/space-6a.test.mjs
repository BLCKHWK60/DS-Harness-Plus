/**
 * Item 4A, stage 6a (owner point 26): an engine picked as the model of a Code thread never runs in Recon, Devices or
 * Workshop (the guarded copy keeps the id 'code'), and fails closed when Modes cannot answer. Stand-ins only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GUARDED_ENGINE_TEXT, apply, engineGuarded } from '../index.js';

function standIn(modes) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-engines-6a-'));
  let adapter;
  const agent = { id: 't1', header: { cwd: home } };
  const services = { dshHomePath: (part) => join(home, part), agents: { currentInitiator: () => agent, get: () => agent }, modes };
  const ctx = {
    get: (name) => {
      const value = services[name];
      if (value instanceof Error) throw value;
      return value;
    },
    logger: { warn() {}, info() {} },
    effect: (make) => make(),
    on: () => () => {},
    inject: (names, use) => {
      if (names.length === 1 && names[0] === 'llm') use({ llm: { registerAdapter: (_providers, a) => { adapter = a; return () => {}; } }, effect: (make) => make() });
    },
  };
  // A missing program path keeps any real OpenCode out of the test even if a refusal were skipped.
  apply(ctx, { opencodePath: '/nonexistent/opencode', maxMinutes: 1, opencodeModels: [], applyWhen: 'review' });
  const send = async () => {
    let text = '';
    for await (const part of adapter.stream({ provider: 'engine-opencode', model: 'default', messages: [{ role: 'user', content: 'write a file' }], tools: [{ name: 'read' }] })) {
      if (part.type === 'text-delta') text += part.text;
    }
    return text;
  };
  return { send, done: () => rmSync(home, { recursive: true, force: true }) };
}

// Stage 6b: engines need Modes apiVersion 2 and a readable space (J1), so the stand-in says both.
const guard = (fields) => ({ apiVersion: 2, get: () => 'code', isolated: () => false, guardOf: (id) => ({ top: id, space: 'code', mode: 'code', sealed: false, guardedBy: '', noPrograms: false, reconSpace: false, unknownTop: false, ...fields }) });

test('engine-guarded: a Code thread in Recon, Devices or Workshop gets the refusal, not the engine', async () => {
  for (const fields of [{ sealed: true, reconSpace: true }, { guardedBy: 'devices', noPrograms: true }, { guardedBy: 'workshop', noPrograms: true }]) {
    const app = standIn(guard(fields));
    try {
      assert.equal(await app.send(), GUARDED_ENGINE_TEXT, JSON.stringify(fields));
    } finally {
      app.done();
    }
  }
  assert.match(GUARDED_ENGINE_TEXT, /Recon/);
});

test('engine-guarded: fails closed when Modes throws or gives no guard; an ordinary Code thread passes the check', async () => {
  const thrower = standIn(new Error('no modes'));
  const broken = standIn({ apiVersion: 2, get: () => 'code', isolated: () => false, guardOf: () => { throw new Error('x'); } });
  try {
    // Stage 6b (J1): ctx.get('modes') throwing means no Modes: refused with what to switch on (no fallback to the mode).
    assert.match(await thrower.send(), /engines need the Modes add-on/);
    // Stage 6b (J1): a guard that cannot be read is an unknown space (refused, nothing runs).
    assert.match(await broken.send(), /could not say which space this thread is in/);
  } finally {
    thrower.done();
    broken.done();
  }
  assert.equal(engineGuarded(() => { throw new Error('x'); }, 't1'), true);
  assert.equal(engineGuarded(() => ({ guardOf: () => undefined }), 't1'), true);
  assert.equal(engineGuarded(() => ({ isolated: () => true, guardOf: () => ({ sealed: false }) }), 't1'), true);
  assert.equal(engineGuarded(() => ({ spaces: { of: () => 'devices' } }), 't1'), true, 'an older Modes: by space');
  assert.equal(engineGuarded(() => ({ spaces: { of: () => 'code' } }), 't1'), false);
  assert.equal(engineGuarded(() => guard({}), 't1'), false);
  // Owner point 26, "Home modes keep today's behaviour": the home mode of Devices or Workshop is not a guest here.
  const home = (fields) => engineGuarded(() => guard({ noPrograms: true, homeMode: true, ...fields }), 't1');
  assert.equal(home({ space: 'devices', mode: 'bench', guardedBy: 'devices' }), false);
  assert.equal(home({ space: 'workshop', mode: 'creator-plus', guardedBy: 'workshop' }), false);
  assert.equal(home({ space: 'recon', mode: 'recon', sealed: true, reconSpace: true, guardedBy: '' }), true, 'Recon home is sealed');
  assert.equal(home({ space: 'workshop', mode: 'bench', guardedBy: 'workshop' }), true, 'homeMode alone is not enough');
  assert.equal(home({ space: 'devices', mode: 'bench', guardedBy: 'devices', unknownTop: true }), true);
  assert.equal(engineGuarded(() => guard({ space: 'devices', mode: 'code', guardedBy: 'devices', noPrograms: true }), 't1'), true, 'a guest');
  const plainCode = standIn(guard({}));
  try {
    const said = await plainCode.send();
    assert.doesNotMatch(said, /Engines do not run in this thread/, 'not refused by the space rule');
    assert.match(said, /not installed/, 'reaches the program lookup (none here)');
  } finally {
    plainCode.done();
  }
});

test('engine-guarded: home modes keep the pre-6a answer (stage 6b words): Bench in Devices and Creator Plus in Workshop get "Code space only"', async () => {
  for (const [space, mode] of [['devices', 'bench'], ['workshop', 'creator-plus']]) {
    const app = standIn({ ...guard({ space, mode, guardedBy: space, noPrograms: true, homeMode: true }), get: () => mode });
    try {
      assert.match(await app.send(), /Engines work only in the Code space\. This thread is in (Devices|Workshop), so nothing was run\./, mode);
    } finally {
      app.done();
    }
  }
});
