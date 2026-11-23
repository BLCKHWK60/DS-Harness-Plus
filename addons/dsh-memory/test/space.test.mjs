// Item 4A, stage 6a: `remember` refuses in a sealed thread (Recon, any mode) and works when Modes is absent.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { SHARED_REFUSED, buildTool } from '../index.js';
import { ERROR_GUARD, NO_GUARD, makeGuardOf } from '../lib/space-guard.js';
import { openMemory } from '../lib/store.js';

function place() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-memory-space-'));
  const dataFile = join(root, 'memory', 'memory.json');
  return { root, dataFile, memory: openMemory({ dataFile, notesFile: join(root, 'AGENTS.md') }) };
}
const settings = () => ({ enabled: true, suggest: true });
const exec = (id) => ({ agent: { id, sessionId: id } });

test('memory-refuses-sealed: a guest in Recon gets the sentence and nothing is written', async () => {
  const { root, dataFile, memory } = place();
  try {
    const modes = { guardOf: (id) => ({ sealed: id === 'r1', sealedBy: 'recon', reconSpace: id === 'r1' }) };
    const tool = buildTool({ memory, settings, guardOf: makeGuardOf(() => modes) });
    const out = await tool.execute({ text: 'Lives in Lisbon.' }, exec('r1'));
    assert.equal(out.text, SHARED_REFUSED.en);
    assert.equal(existsSync(dataFile), false);
    assert.deepEqual(memory.list().suggestions, []);
    // A Chat thread still suggests.
    const ok = await tool.execute({ text: 'Lives in Lisbon.' }, exec('c1'));
    assert.match(ok.text, /^Suggested/);
    assert.match(readFileSync(dataFile, 'utf8'), /Lisbon/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('memory-refuses-sealed: an owner\'s isolated mode (sealedBy mode) and a Modes error refuse too', async () => {
  const { root, memory } = place();
  try {
    const owner = buildTool({ memory, settings, guardOf: makeGuardOf(() => ({ guardOf: () => ({ sealed: true, sealedBy: 'mode', reconSpace: false }) })) });
    assert.equal((await owner.execute({ text: 'x y z' }, exec('o1'))).text, SHARED_REFUSED.en);
    const throwing = buildTool({ memory, settings, guardOf: makeGuardOf(() => ({ guardOf: () => { throw new Error('boom'); } })) });
    assert.equal((await throwing.execute({ text: 'x y z' }, exec('o2'))).text, SHARED_REFUSED.en);
    // An older Modes (no guardOf) that says isolated: refused.
    const legacy = buildTool({ memory, settings, guardOf: makeGuardOf(() => ({ get: () => 'research', isolated: () => true, spaces: { of: () => 'recon' } })) });
    assert.equal((await legacy.execute({ text: 'x y z' }, exec('o3'))).text, SHARED_REFUSED.en);
    assert.deepEqual(memory.list().suggestions, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('memory-modes-absent: no Modes service means not sealed (works as before)', async () => {
  const { root, memory } = place();
  try {
    assert.equal(makeGuardOf(() => undefined)('a'), NO_GUARD);
    assert.equal(makeGuardOf(() => { throw new Error('not provided'); })('a'), NO_GUARD);
    assert.equal(makeGuardOf(() => ({ get: () => { throw new Error('x'); } }))('a'), ERROR_GUARD);
    const tool = buildTool({ memory, settings, guardOf: makeGuardOf(() => undefined) });
    assert.match((await tool.execute({ text: 'Prefers tables.' }, exec('a'))).text, /^Suggested/);
    // Without the dependency at all (older callers): as before.
    const plain = buildTool({ memory, settings });
    assert.match((await plain.execute({ text: 'Prefers tables.' }, exec('a'))).text, /already suggested/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the refusal sentence is English only', () => {
  assert.ok(SHARED_REFUSED.en.includes('Recon'));
  assert.equal(SHARED_REFUSED.zh, undefined);
});
