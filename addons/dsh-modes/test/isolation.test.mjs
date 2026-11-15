import test from 'node:test';
import assert from 'node:assert/strict';
import { isolatedMask, toolMaskFor } from '../lib/mask.js';
import { LATE_MODE, LOCKED_MODE, dropIsolatedNotes, heldMode, isolatedMayRun, modeChangeRefusal } from '../lib/isolation.js';

const RECON = { id: 'recon', tools: ['recon_onion_search', 'recon_onion_read', 'recon_cite'], isolated: true };
const COWORK = { id: 'cowork', tools: 'all' };

test('an isolated conversation gets exactly its own tools, and its helpers nothing', () => {
  assert.deepEqual(isolatedMask({ tools: RECON.tools }), { allow: RECON.tools });
  assert.deepEqual(isolatedMask({ tools: RECON.tools, child: true }), { allow: [] }, 'a helper gets nothing');
  assert.deepEqual(isolatedMask({ tools: RECON.tools, off: true }), { allow: [] }, 'Tools Off gives an empty list');
  assert.deepEqual(isolatedMask({ tools: RECON.tools, webOff: true }), { allow: ['recon_cite'] }, 'Web Off takes the tools that go online');
  assert.deepEqual(isolatedMask({ tools: 'all' }), { allow: [] }, 'an isolated mode without a list gets nothing');
  // Through the whole mask: no web tools, no Deep research, whatever the switches say.
  assert.deepEqual(toolMaskFor({ mode: RECON, web: true, research: true, known: ['web_search', 'deep_research', 'bash', ...RECON.tools] }), { allow: RECON.tools });
});

test('the tools of an isolated mode are fenced off from every other conversation', () => {
  const fenced = RECON.tools;
  assert.deepEqual(toolMaskFor({ mode: COWORK, web: true, fenced }), { deny: fenced });
  assert.deepEqual(toolMaskFor({ mode: COWORK, web: false, fenced }).deny.slice(-3), fenced);
  assert.deepEqual(toolMaskFor({ mode: { tools: ['read', 'recon_cite'] }, fenced }), { allow: ['read'] });
  const trimmed = toolMaskFor({ mode: COWORK, trimmed: true, known: ['read', 'recon_cite'], added: ['recon_cite'], web: true, fenced });
  assert.ok(!trimmed.allow.includes('recon_cite'), 'not even when added by name');
});

test('the second lock: an isolated conversation runs only what its mode lists', () => {
  assert.equal(isolatedMayRun({ mode: RECON, name: 'recon_cite' }), true);
  assert.equal(isolatedMayRun({ mode: RECON, name: 'bash' }), false, 'an unlisted tool is refused');
  assert.equal(isolatedMayRun({ mode: RECON, name: 'run_code' }), false, 'no programs');
  assert.equal(isolatedMayRun({ mode: RECON, name: 'recon_cite', child: true }), false, 'not for a helper');
  assert.equal(isolatedMayRun({ mode: RECON, name: 'recon_cite', off: true }), false, 'not with Tools Off');
  assert.equal(isolatedMayRun({ mode: RECON, name: 'recon_onion_search', webOff: true }), false, 'not a tool that goes online with Web Off');
  assert.equal(isolatedMayRun({ mode: RECON, name: 'recon_cite', webOff: true }), true);
  assert.equal(isolatedMayRun({ mode: LOCKED_MODE, name: 'recon_cite' }), false, 'a locked conversation runs nothing');
});

test('once isolated, always isolated; never isolated later', () => {
  assert.equal(heldMode({ found: RECON, wasIsolated: true, fresh: false }), RECON);
  assert.equal(heldMode({ found: RECON, wasIsolated: false, fresh: true }), RECON, 'a new conversation may begin isolated');
  assert.equal(heldMode({ found: COWORK, wasIsolated: true, fresh: false }), LOCKED_MODE, 'given another mode: locked');
  assert.equal(heldMode({ found: undefined, wasIsolated: true, fresh: false }), LOCKED_MODE, 'its mode gone: locked');
  assert.equal(heldMode({ found: RECON, wasIsolated: false, fresh: false }), LATE_MODE, 'one that ran elsewhere gets no isolated tools');
  assert.equal(heldMode({ found: COWORK, wasIsolated: false, fresh: false }), COWORK);
  for (const mode of [LOCKED_MODE, LATE_MODE]) assert.deepEqual([mode.isolated, mode.tools.length], [true, 0]);
});

test('an isolated conversation is not handed the app\'s own notes; what the user wrote stays', () => {
  const messages = [
    { role: 'user', source: { kind: 'human' }, content: 'question' },
    { role: 'user', source: { kind: 'agent-instructions' } },
    { role: 'user', source: { kind: 'skill-catalog' } },
    { message: { source: { kind: 'runtime-context' } } },
    { role: 'assistant', content: 'answer' },
  ];
  assert.deepEqual(dropIsolatedNotes(messages), [messages[0], messages[4]]);
});

test('the service refuses a way in and a way out', () => {
  assert.match(modeChangeRefusal({ wasIsolated: true, current: 'recon', target: 'cowork', targetIsolated: false, fresh: false }), /cannot change its mode/);
  assert.equal(modeChangeRefusal({ wasIsolated: true, current: 'recon', target: 'recon', targetIsolated: true, fresh: false }), '');
  assert.match(modeChangeRefusal({ wasIsolated: false, current: 'cowork', target: 'recon', targetIsolated: true, fresh: false }), /cannot become isolated/);
  assert.equal(modeChangeRefusal({ wasIsolated: false, current: 'cowork', target: 'recon', targetIsolated: true, fresh: true }), '', 'a new conversation may');
  assert.equal(modeChangeRefusal({ wasIsolated: false, current: 'cowork', target: 'code', targetIsolated: false, fresh: false }), '');
});
