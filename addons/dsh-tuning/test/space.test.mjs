/**
 * Item 4A, stage 6a (STAGE6A-DESIGN.md 4.3, P3): a row from the Recon or the Devices space never trains, whatever its
 * mode; the guard reader without Modes says "no space".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mayTrain } from '../lib/rows.js';
import { makeGuardOf } from '../lib/space-guard.js';

test('rows-maytrain-space: rows of the Recon and the Devices space never train; other spaces as before', () => {
  const row = { kind: 'toolcalls', mode: 'code', by: { provider: 'local', model: 'small' } };
  assert.equal(mayTrain(row).ok, true);
  assert.equal(mayTrain({ ...row, space: 'chat' }).ok, true);
  assert.equal(mayTrain({ ...row, space: 'workshop' }).ok, true);
  assert.deepEqual(mayTrain({ ...row, space: 'recon' }), { ok: false, why: 'Recon is never harvested' });
  assert.deepEqual(mayTrain({ ...row, space: 'devices' }), { ok: false, why: 'the Devices space is never harvested' });
});

test('the guard reader: no Modes is no space; a Modes that throws is sealed', () => {
  assert.equal(makeGuardOf(() => undefined)('a').sealed, false);
  assert.equal(makeGuardOf(() => { throw new Error('x'); })('a').sealed, false);
  assert.equal(makeGuardOf(() => ({ get: () => { throw new Error('x'); } }))('a').sealed, true);
  assert.equal(makeGuardOf(() => ({ get: () => 'code', isolated: () => false, spaces: { of: () => 'devices' } }))('a').guardedBy, 'devices');
});
