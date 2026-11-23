// Item 4A, stage 6a: the finance profile is never written from a sealed thread (Recon, any mode).
import assert from 'node:assert/strict';
import test from 'node:test';
import { PROFILE_REFUSED, buildProfileTool, openProfile } from '../lib/adviser.js';
import { makeGuardOf } from '../lib/space-guard.js';

const exec = (id) => ({ agent: { id } });

test('finance-profile-refuses-sealed: a guest in Recon gets the sentence and the profile is unchanged', async () => {
  const profile = openProfile('');
  const modes = { guardOf: (id) => ({ sealed: id === 'r1', sealedBy: id === 'r1' ? 'recon' : '', reconSpace: id === 'r1' }) };
  const tool = buildProfileTool({ enabled: () => true, profile, guardOf: makeGuardOf(() => modes) });
  assert.equal((await tool.execute({ note: 'Holds 40 NVDA' }, exec('r1'))).text, PROFILE_REFUSED.en);
  assert.equal(profile.read(), '');
  assert.match((await tool.execute({ note: 'Holds 40 NVDA' }, exec('c1'))).text, /^Saved/);
  assert.match(profile.read(), /Holds 40 NVDA$/);
});

test('finance-profile-refuses-sealed: a Modes error refuses; no Modes saves as before', async () => {
  const profile = openProfile('');
  const broken = buildProfileTool({ enabled: () => true, profile, guardOf: makeGuardOf(() => ({ guardOf: () => { throw new Error('x'); } })) });
  assert.equal((await broken.execute({ note: 'Goal: retire at 60' }, exec('a'))).text, PROFILE_REFUSED.en);
  const absent = buildProfileTool({ enabled: () => true, profile, guardOf: makeGuardOf(() => undefined) });
  assert.match((await absent.execute({ note: 'Goal: retire at 60' }, exec('a'))).text, /^Saved/);
  assert.ok(PROFILE_REFUSED.en.includes('Recon') && !('zh' in PROFILE_REFUSED), 'English only');
});
