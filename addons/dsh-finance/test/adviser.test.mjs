import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { PROFILE_MAX, adviserNote, adviserSkills, buildProfileTool, forAdviser, openProfile } from '../lib/adviser.js';
import { ADVISER_METHOD, METHOD, MODE_ID, withFinance } from '../lib/finance.js';
import { briefPrompt } from '../lib/briefs.js';
import { SKILLS } from '../skills.js';

test('the adviser method fits the Modes limit and drops the research-only rule', () => {
  assert.ok(ADVISER_METHOD.length <= 4000, `${ADVISER_METHOD.length} characters`);
  assert.ok(METHOD.includes('This is research, not advice'));
  assert.ok(!ADVISER_METHOD.includes('This is research, not advice'));
  assert.ok(!ADVISER_METHOD.includes('Do not tell the user to buy'));
  assert.match(ADVISER_METHOD, /7\. Advise\./);
  assert.match(ADVISER_METHOD, /Never add a disclaimer/);
  assert.match(ADVISER_METHOD, /your call\.$/);
});

test('the stored mode follows the adviser switch', () => {
  const plain = withFinance('{}', true);
  assert.equal(JSON.parse(plain)[MODE_ID].prompt, METHOD);
  assert.equal(withFinance(plain, true), undefined);
  const advised = withFinance(plain, true, true);
  assert.equal(JSON.parse(advised)[MODE_ID].prompt, ADVISER_METHOD);
  assert.equal(withFinance(advised, true, true), undefined);
  assert.equal(JSON.parse(withFinance(advised, true, false))[MODE_ID].prompt, METHOD);
});

test('skills and briefs are reworded for the adviser', () => {
  const skills = adviserSkills(SKILLS);
  assert.equal(skills.length, SKILLS.length);
  for (const skill of skills) {
    assert.ok(!/research, not advice/.test(skill.content), skill.name);
    assert.match(skill.content, /add no disclaimer/);
  }
  assert.ok(SKILLS.every((skill) => /research, not advice/.test(skill.content)));
  assert.match(briefPrompt('NVIDIA', 'Global', 'weekdays'), /research, not advice/);
  assert.ok(!/research, not advice/.test(briefPrompt('NVIDIA', 'Global', 'weekdays', true)));
  assert.equal(forAdviser('plain text'), 'plain text');
});

test('the profile is kept, added to, and never pushed past its limit', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-adviser-'));
  try {
    const file = join(dir, 'finance', 'profile.md');
    const profile = openProfile(file);
    assert.equal(profile.read(), '');
    profile.save('Goals: retire at 60.\r\nRisk: medium.');
    assert.equal(profile.read(), 'Goals: retire at 60.\nRisk: medium.');
    profile.add('  Holds 40 NVDA\nbought at 118 ', '2026-11-13');
    assert.equal(readFileSync(file, 'utf8'), 'Goals: retire at 60.\nRisk: medium.\n- 2026-11-13: Holds 40 NVDA bought at 118\n');
    assert.throws(() => profile.add('   '), /nothing to save/);
    profile.save('x'.repeat(PROFILE_MAX));
    assert.throws(() => profile.add('one more'), /full/);
    assert.equal(profile.read().length, PROFILE_MAX);
    profile.save('');
    assert.equal(profile.read(), '');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the note carries the profile and forbids disclaimers', () => {
  const note = adviserNote('Goals: retire at 60.');
  assert.match(note, /Never open or close with a disclaimer/);
  assert.match(note, /The client's profile:\nGoals: retire at 60\./);
  assert.match(note, /finance_profile_save/);
  assert.match(adviserNote(''), /profile is empty\. Advise anyway/);
  // The answer comes first: no question in place of it, and no question card.
  for (const text of [note, adviserNote('')]) {
    assert.match(text, /Answer first, always/);
    assert.match(text, /never use ask_user_question/);
    assert.ok(!/ask for (it|the few facts)/.test(text));
  }
  assert.ok(!adviserNote('', false).includes('finance_profile_save'));
  assert.ok(!/\n\n\n/.test(adviserNote('', false)));
});

test('the profile tool saves a fact and refuses account numbers', async () => {
  const profile = openProfile('');
  let on = true;
  const tool = buildProfileTool({ enabled: () => on, profile });
  assert.match((await tool.execute({ note: 'Wants income from dividends' })).text, /^Saved/);
  assert.match(profile.read(), /Wants income from dividends$/);
  assert.match((await tool.execute({ note: 'Card 4111 1111 1111 1111' })).text, /^Not saved/);
  assert.match((await tool.execute({})).text, /^Not saved/);
  on = false;
  assert.match((await tool.execute({ note: 'x' })).text, /switched off/);
  assert.equal(profile.read().split('\n').length, 1);
});
