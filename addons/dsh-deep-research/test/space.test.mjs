// Item 4A, stage 6a: Deep research refuses in a sealed thread (Recon, any mode) and runs when Modes is absent.
import assert from 'node:assert/strict';
import test from 'node:test';
import { DEEP_REFUSED, apply } from '../index.js';

function plugin(modes) {
  let tool;
  let started = 0;
  const subagents = {
    async startActivation(spec) {
      started += 1;
      const role = spec.prompt[0].text.split('\n')[0];
      const text = role === 'RESEARCH_PLAN' ? JSON.stringify({ subquestions: [{ question: 'Q?', queries: ['q'] }] })
        : role === 'RESEARCH_SEARCH' ? JSON.stringify({ findings: [], queries: ['q'], gaps: [] })
          : 'Nothing found.';
      return { childId: `c${started}`, result: Promise.resolve({ output: [{ type: 'text', text }], stopReason: 'end' }) };
    },
  };
  const ctx = {
    on() {},
    effect(fn) { fn(); },
    provide() {},
    inject() {},
    tools: { register(definition) { tool = definition; } },
    get(key) {
      if (key === 'subagents') return subagents;
      if (key === 'modes') return typeof modes === 'function' ? modes() : modes;
      return undefined;
    },
  };
  apply(ctx, { enabled: true, toolName: 'deep_research', roles: { planner: 'plan', searcher: 'fast', writer: 'plan' }, helperModel: 'same', depth: 'quick', maxSubquestions: 8, maxParallel: 8, maxSources: 120, maxMinutes: 60, searchToolNames: ['web_search'], fetchToolNames: ['web_fetch'], requireFetched: false, wide: { maxRows: 500 } });
  const run = (id) => tool.execute({ question: 'What happened at the plant?' }, { agent: { id, model: { current: () => ({ provider: 'p', model: 'm' }) } }, callId: 'call_1', signal: new AbortController().signal });
  return { run, started: () => started };
}

test('deep-refuses-sealed: a Recon-space thread gets the sentence and no helper starts', async () => {
  const p = plugin({ guardOf: (id) => ({ sealed: id === 'recon-1', sealedBy: 'recon', reconSpace: true }) });
  const out = await p.run('recon-1');
  assert.equal(out.text, DEEP_REFUSED.en);
  assert.equal(p.started(), 0);
  assert.ok(DEEP_REFUSED.en.includes('recon_web_search'));
  assert.deepEqual(Object.keys(DEEP_REFUSED), ['en'], 'English only (owner decision 28)');
});

test('deep-refuses-sealed: a Modes error refuses (fail closed); an older Modes saying isolated refuses', async () => {
  const broken = plugin({ guardOf: () => { throw new Error('x'); } });
  assert.equal((await broken.run('a')).text, DEEP_REFUSED.en);
  const legacy = plugin({ get: () => 'research', isolated: () => true, spaces: { of: () => 'recon' } });
  assert.equal((await legacy.run('a')).text, DEEP_REFUSED.en);
  assert.equal(broken.started() + legacy.started(), 0);
});

test('deep-modes-absent: no Modes service runs as before', async () => {
  const p = plugin(undefined);
  // The stand-in helpers find nothing, so the run ends with its own error, after helpers started.
  await assert.rejects(p.run('chat-1'), /no usable sources/);
  assert.ok(p.started() > 0);
});
