import test from 'node:test';
import assert from 'node:assert/strict';
import { maskFor, parentIdOf, RESEARCH_TOOL, rootOf, toolsState, WEB_TOOLS, webDefault } from '../lib/mask.js';

const want = (over = {}) => ({ tools: 'none', web: false, research: false, off: false, child: false, ...over });

test('a conversation: the mode, the Search switch and the Deep research switch', () => {
  // Chat (no tools of its own).
  assert.deepEqual(maskFor(want()), { allow: [] });
  assert.deepEqual(maskFor(want({ web: true })), { allow: WEB_TOOLS });
  assert.deepEqual(maskFor(want({ research: true })), { allow: [RESEARCH_TOOL] }, 'Deep research alone gives the research tool, not the web tools');
  assert.deepEqual(maskFor(want({ web: true, research: true })), { allow: [...WEB_TOOLS, RESEARCH_TOOL] });
  // Cowork and Code (all tools).
  assert.equal(maskFor(want({ tools: 'all', web: true })), null);
  assert.deepEqual(maskFor(want({ tools: 'all' })), { deny: WEB_TOOLS });
  // A mode with a list of its own.
  assert.deepEqual(maskFor(want({ tools: ['read', 'web_search'] })), { allow: ['read'] }, 'Search off takes the web tools out of a list');
  assert.deepEqual(maskFor(want({ tools: ['read', 'grep'], web: true })), { allow: ['read', 'grep', ...WEB_TOOLS] });
});

test('a helper follows its conversation, and can search when Deep research is on', () => {
  // The bug: a Chat conversation with Deep research on started helpers that had no tools at all.
  assert.deepEqual(maskFor(want({ research: true, child: true })), { allow: WEB_TOOLS });
  assert.deepEqual(maskFor(want({ web: true, child: true })), { allow: WEB_TOOLS });
  assert.deepEqual(maskFor(want({ child: true })), { allow: [] }, 'a helper of a plain Chat conversation gets nothing, like the conversation');
  assert.equal(maskFor(want({ tools: 'all', research: true, child: true })), null, 'in Cowork a helper searches even with the Search switch off');
  assert.deepEqual(maskFor(want({ tools: 'all', child: true })), { deny: WEB_TOOLS });
  assert.ok(!maskFor(want({ web: true, research: true, child: true })).allow.includes(RESEARCH_TOOL), 'a helper does not start research of its own');
});

test('tools switched off means nothing at all, for the conversation and its helpers', () => {
  for (const tools of ['all', 'none', ['read']]) {
    for (const child of [false, true]) assert.deepEqual(maskFor(want({ tools, web: true, research: true, off: true, child })), { allow: [] });
  }
  assert.equal(toolsState(want({ tools: 'all', web: true, off: true })), 'off');
  assert.equal(toolsState(want({ tools: 'all' })), 'on');
  assert.equal(toolsState(want()), 'off', 'plain Chat has no tools');
  assert.equal(toolsState(want({ web: true })), 'on');
  assert.equal(toolsState(want({ research: true })), 'on');
});

test('defaults and family ties', () => {
  assert.equal(webDefault('none'), false);
  assert.equal(webDefault('all'), true);
  assert.equal(webDefault(['read']), false);
  assert.equal(webDefault(['read', 'web_fetch']), true);

  assert.equal(parentIdOf({ parentSession: 'p1' }), 'p1');
  assert.equal(parentIdOf({ parentSession: { id: 'p2' } }), 'p2');
  assert.equal(parentIdOf({ parentSession: { sessionId: 'p3' } }), 'p3');
  assert.equal(parentIdOf({}), null);
  assert.equal(parentIdOf(undefined), null);

  const parents = new Map([['c', 'b'], ['b', 'a']]);
  assert.equal(rootOf('c', parents), 'a');
  assert.equal(rootOf('a', parents), 'a');
  assert.equal(rootOf('stranger', parents), 'stranger');
  const loop = new Map([['x', 'y'], ['y', 'x']]);
  assert.ok(['x', 'y'].includes(rootOf('x', loop)), 'a loop does not hang');
});

test('a conversation that reaches tools through programs is told so', async () => {
  const { programNote, programOnly, PROGRAM_TOOL } = await import('../lib/ptc.js');
  const ptc = { selectExecutor: () => ({ describe: () => ({ knownNames: [PROGRAM_TOOL] }) }) };
  const direct = { selectExecutor: () => ({ describe: () => ({ schemas: [] }) }) };
  const broken = { selectExecutor: () => { throw new Error('no executor'); } };
  assert.equal(programOnly(ptc, {}), true);
  assert.equal(programOnly(direct, {}), false);
  assert.equal(programOnly(broken, {}), false, 'not knowing reads as calling tools directly');
  assert.equal(programOnly(undefined, {}), false);

  const plain = programNote();
  assert.match(plain, /inside a `run_code` program/);
  assert.doesNotMatch(plain, /timeoutMs/, 'no time advice without a slow tool');
  const slow = programNote({ timeout: { defaultMs: 120000, maxMs: 600000 }, slow: ['deep_research'] });
  assert.match(slow, /stopped after 120 seconds/);
  assert.match(slow, /deep_research can take minutes/);
  assert.match(slow, /timeoutMs: 600000/);
  assert.doesNotMatch(programNote({ slow: ['deep_research'] }), /timeoutMs/, 'no numbers are made up when the app gives none');
});

test('a conversation opened by an Automation task gets its own starting mode', async () => {
  const { fromScheduler, scheduledModeId } = await import('../lib/scheduled.js');
  assert.equal(fromScheduler([{ role: 'user', source: { kind: 'schedule' } }]), true);
  assert.equal(fromScheduler([{ message: { source: { kind: 'schedule' } } }]), true);
  assert.equal(fromScheduler([{ role: 'user', source: { kind: 'human' } }, { role: 'user' }]), false);
  assert.equal(fromScheduler(undefined), false);
  assert.equal(fromScheduler([]), false);

  const modes = { chat: { tools: 'none' }, cowork: { tools: 'all' }, code: { tools: 'all' } };
  assert.equal(scheduledModeId(modes, 'code'), 'code');
  assert.equal(scheduledModeId(modes, 'gone'), 'cowork', 'an unknown id falls back to the first mode with all tools');
  assert.equal(scheduledModeId(modes, ''), 'cowork');
  assert.equal(scheduledModeId({ chat: { tools: 'none' } }, 'gone'), undefined, 'nothing suitable leaves the usual rule in charge');
});
