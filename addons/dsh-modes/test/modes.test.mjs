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
