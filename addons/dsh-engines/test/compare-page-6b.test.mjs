/**
 * Item 4A, stage 6b, Part D (STAGE6B-DESIGN.md J4, 7.1): the Compare page's dsh side. The page makes a new thread in the
 * run's copy, has the route claim it into the Code space with Code mode, and only then attaches and sends; it never
 * writes the owner's `modes.defaultMode` (the old `chooseCode` is gone). A refused claim stops with CMP_CLAIM_FAILED and
 * sends nothing. The page's own functions are cut out of client.js and run with stand-ins (no browser).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
/** The text from `head` to its matching closing brace. */
const cut = (head) => {
  const start = source.indexOf(head);
  assert.ok(start >= 0, `${head} is in client.js`);
  let depth = 0;
  // A function's body starts at its first `) {` (its defaults may hold braces); an object at the head's own brace.
  const open = head.endsWith('{') ? start + head.length - 1 : source.indexOf(') {', start) + 2;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(head);
};
const load = () => new Function(`
  ${cut('const WORDS_6B = {')};
  ${cut('function words6b(')}
  ${cut('async function startDshSide(')}
  return { WORDS_6B, words6b, startDshSide };
`)(); // eslint-disable-line no-new-func

/** Stand-ins that record every step in order; `refuse` makes the route's claim fail with that sentence. */
function world({ refuse = '' } = {}) {
  const steps = [];
  const writes = [];
  const appCtx = {
    remote: { settings: { mutate: (...args) => { writes.push(args); return { ok: true }; }, describe: () => ({ ok: true, value: { namespaces: [] } }) } },
    get(name) {
      if (name === 'sessions') return { create: async (options) => { steps.push(['create', options]); return 'new-thread-1'; } };
      if (name === 'remote.session') return { prompt: async (body) => { steps.push(['prompt', body.sessionId, body.content[0].text]); return { ok: true }; } };
      throw new Error(`no ${name}`);
    },
  };
  const call = async (body) => {
    steps.push([body.action, body.sessionId, body.run]);
    if (body.action === 'claim' && refuse) throw new Error(refuse);
    return {};
  };
  return { appCtx, call, steps, writes };
}

test('compare-claims-code-space (page): create, claim, then attach and send, in that order', async () => {
  const { startDshSide } = load();
  const w = world();
  const id = await startDshSide({ appCtx: w.appCtx, call: w.call, made: 'run-1', work: '/tmp/copy', task: 'Fix the test', wait: async () => {} });
  assert.equal(id, 'new-thread-1');
  assert.deepEqual(w.steps.map((step) => step[0]), ['create', 'claim', 'attach', 'prompt']);
  assert.deepEqual(w.steps[0][1], { cwd: '/tmp/copy' });
  assert.deepEqual(w.steps[1], ['claim', 'new-thread-1', undefined]);
  assert.deepEqual(w.steps[2], ['attach', 'new-thread-1', 'run-1']);
  assert.deepEqual(w.steps[3], ['prompt', 'new-thread-1', 'Fix the test']);
});

test('compare-no-defaultmode-write (page): starting the dsh side writes no settings, and the page has no defaultMode write', async () => {
  const { startDshSide } = load();
  const w = world();
  await startDshSide({ appCtx: w.appCtx, call: w.call, made: 'run-1', work: '/tmp/copy', task: 'x y z', wait: async () => {} });
  assert.deepEqual(w.writes, []);
  assert.doesNotMatch(source, /chooseCode/, 'the old defaultMode writer is gone');
  assert.doesNotMatch(source, /defaultMode/, 'the page never names defaultMode');
  assert.doesNotMatch(source, /mutate\(\s*'modes'/, 'the page never writes Modes\' settings');
});

test('compare-claim-refused-sends-nothing (page): a refused claim stops with CMP_CLAIM_FAILED; nothing attached, nothing sent', async () => {
  const { startDshSide, WORDS_6B } = load();
  const refusal = 'Code is not offered in this space. Tick it in Settings → Modes.';
  const w = world({ refuse: refusal });
  await assert.rejects(
    startDshSide({ appCtx: w.appCtx, call: w.call, made: 'run-1', work: '/tmp/copy', task: 'x y z', wait: async () => {} }),
    (error) => {
      assert.equal(error.claimFailed, true);
      assert.equal(error.message, WORDS_6B.en.claimFailed.replace('{reason}', refusal));
      assert.match(error.message, /Nothing was sent\. Check that the Code space is shown in Settings → Spaces, then press Start the comparison again\.$/);
      return true;
    },
  );
  assert.deepEqual(w.steps.map((step) => step[0]), ['create', 'claim']);
  assert.deepEqual(w.writes, []);
  // A reason without a full stop gets one, so the sentence reads.
  const bare = world({ refuse: 'the Modes add-on is not running' });
  await assert.rejects(startDshSide({ appCtx: bare.appCtx, call: bare.call, made: 'r', work: '/w', task: 'x y z', wait: async () => {} }), /in the Code space: the Modes add-on is not running\. Nothing was sent\./);
});

test('compare-page-words (7.1): Code-space wording in English only (also on a Chinese page); the old Code-mode wording is gone', () => {
  const { WORDS_6B, words6b } = load();
  assert.deepEqual(Object.keys(WORDS_6B), ['en'], 'English only (owner decision 28)');
  assert.equal(words6b('heading', {}, 'en'), 'Use an engine in the Code space');
  assert.equal(words6b('heading', {}, 'zh-CN'), 'Use an engine in the Code space');
  assert.match(words6b('desc', {}, 'en'), /in the Code space instead of dsh, in any mode/);
  assert.match(words6b('footer', {}, 'en'), /a new thread in the Code space starts with/);
  assert.match(words6b('claimFailed', { reason: 'a reason.' }, 'zh'), /^The dsh side could not start in the Code space: a reason\. Nothing was sent\./);
  assert.doesNotMatch(source, /Use an engine in Code mode|a new Code conversation starts with|In a Code conversation, open the model menu/);
});
