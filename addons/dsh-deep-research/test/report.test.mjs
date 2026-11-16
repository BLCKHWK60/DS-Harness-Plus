// A whole Quick run on a stand-in app: findings from pages no helper read stay in the report,
// labelled in the findings the writer gets, in the Sources list and in the Checks.
import assert from 'node:assert/strict';
import test from 'node:test';
import { apply } from '../index.js';

const READ = 'https://read.example/report';
const SNIPPET = 'https://snippet.example/news';
const UNSEEN = 'https://unseen.example/page';
const SHARED = 'https://x.example/page';

/** What a helper does with its tools: each emits the app's `tool/call` and `tool/result` events. */
const search = (callId, urls) => (emit) => {
  emit({ type: 'tool/call', data: { callId, name: 'web_search', arguments: JSON.stringify({ query: 'what happened' }) } });
  emit({ type: 'tool/result', data: { message: { toolCallId: callId, content: [{ type: 'text', text: urls.map((url, i) => `${i + 1}. ${url} A short summary.`).join('\n') }] } } });
};
/** A `web_fetch` call and, unless `result` is null, its result (`isError`, `statusCode`, `finalUrl` shape it). */
const fetchPage = (callId, url, result = {}) => (emit) => {
  emit({ type: 'tool/call', data: { callId, name: 'web_fetch', arguments: JSON.stringify({ url }) } });
  if (result === null) return;
  const { isError = false, statusCode = 200, finalUrl = url } = result;
  emit({
    type: 'tool/result',
    data: {
      message: { toolCallId: callId, content: [{ type: 'text', text: isError ? 'web fetch failed' : `Fetched ${finalUrl} (HTTP ${statusCode})` }], isError },
      ...(isError ? {} : { meta: { url: finalUrl, statusCode, truncated: false } }),
    },
  });
};

/** The default searcher: opens READ, is shown SNIPPET by a search, never meets UNSEEN, and reports a finding from each. */
const DEFAULT_SEARCHER = {
  tools: [search('s1', [SNIPPET, READ]), fetchPage('f1', READ)],
  findings: [
    { claim: 'Output rose 4%', url: READ, quote: 'rose 4%' },
    { claim: 'Prices fell', url: SNIPPET, quote: 'prices fell' },
    { claim: 'A plant closed', url: UNSEEN, quote: '' },
  ],
};

/**
 * The plugin with stand-in helpers.
 * @param {object} config - plugin settings over the defaults.
 * @param {object} [script] - `searchers`: one per sub-question, in order (tools and findings);
 *   `row`: the wide-mode helper (tools and sources); `writer`: the report text.
 */
function plugin(config = {}, { searchers = [DEFAULT_SEARCHER], row, writer = 'Output rose [1]. Prices fell (seen only in search results, not read) [2]. A plant closed [3].' } = {}) {
  let tool;
  let onEvent;
  const services = {};
  const prompts = {};
  let children = 0;
  // A helper's tool events come after its start returns, as in the app, then its answer.
  const answer = (childId, text, tools = []) => ({
    childId,
    result: new Promise((done) => setImmediate(() => {
      for (const step of tools) step((event) => onEvent({ id: childId }, event));
      done({ output: [{ type: 'text', text }], stopReason: 'end' });
    })),
  });
  const subagents = {
    async startActivation(spec) {
      const text = spec.prompt[0].text;
      const childId = `child-${(children += 1)}`;
      const role = text.split('\n')[0];
      prompts[role] = text;
      if (role === 'RESEARCH_PLAN') {
        return answer(childId, JSON.stringify({ subquestions: searchers.map((_, i) => ({ question: `Sub-question ${i + 1}?`, queries: [`query ${i + 1}`] })) }));
      }
      if (role === 'RESEARCH_SEARCH') {
        // Quick has one round, so the label is "Research i/n".
        const index = Number(/(\d+)\/\d+$/.exec(spec.label)?.[1] ?? 1) - 1;
        const searcher = searchers[index];
        return answer(childId, JSON.stringify({ findings: searcher.findings, queries: [`query ${index + 1}`], gaps: [] }), searcher.tools);
      }
      if (role === 'RESEARCH_ROW') {
        return answer(childId, JSON.stringify({ values: { Price: '10' }, sources: row.sources }), row.tools);
      }
      if (role === 'RESEARCH_WRITE') return answer(childId, writer);
      throw new Error(`unexpected helper: ${role}`);
    },
  };
  const ctx = {
    on(name, handler) {
      if (name === 'session/event') onEvent = handler;
    },
    effect(fn) { fn(); },
    provide(name, value) {
      services[name] = value;
    },
    inject() {},
    tools: { register(definition) { tool = definition; } },
    get(key) {
      if (key === 'subagents') return subagents;
      return undefined;
    },
  };
  apply(ctx, { enabled: true, toolName: 'deep_research', roles: { planner: 'plan', searcher: 'fast', writer: 'plan' }, helperModel: 'same', depth: 'quick', maxSubquestions: 8, maxParallel: 8, maxSources: 120, maxMinutes: 60, searchToolNames: ['web_search'], fetchToolNames: ['web_fetch'], requireFetched: false, wide: { maxRows: 500 }, ...config });
  const parent = { id: 'conv-1', model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const run = (args) => tool.execute(args, { agent: parent, callId: 'call_1', signal: new AbortController().signal });
  return { run, prompts, description: tool.description, progress: () => services.deepResearch.progress(parent.id) };
}

/** The `## Sources` block of a report. */
// The read labels (research-4); the grade beside them (step 64) is tested in grades.test.mjs.
const sourcesOf = (text) => text.split('## Sources\n')[1].split('\n\n')[0].replace(/ · (?:Primary|Confirmed|Single)\)/g, ')');
/** The `## Checks` block of a report. */
const checksOf = (text) => text.split('## Checks\n')[1];

test('findings from pages no helper read stay in the report, each labelled', async () => {
  const { run, prompts } = plugin();
  const { text, stats } = await run({ question: 'What happened at the plant?' });
  assert.equal(stats.sources, 3, 'all three findings are kept');
  // The writer is shown which findings were not read and told to say so.
  assert.match(prompts.RESEARCH_WRITE, /\[1\] Output rose 4% — "rose 4%"\n/);
  assert.match(prompts.RESEARCH_WRITE, /\[2\] Prices fell — "prices fell" \[seen only in search results, not read\]/);
  assert.match(prompts.RESEARCH_WRITE, /\[3\] A plant closed \[not read, and not seen in search results\]/);
  assert.match(prompts.RESEARCH_WRITE, /say so in the same sentence/);
  // The Sources list labels each source.
  assert.equal(sourcesOf(text), `[1] ${READ} (read)\n[2] ${SNIPPET} (seen only in search results, not read)\n[3] ${UNSEEN} (not read, and not seen in search results)`);
  // Grades (step 64): each cited source gets one beside its label, explained under Checks; the writer is asked for its primary sources.
  assert.match(text.split('## Sources\n')[1], /\(read · (?:Primary|Confirmed|Single)\)/);
  assert.match(prompts.RESEARCH_WRITE, /## Primary sources/);
  assert.match(checksOf(text), /Grades beside each source: Primary is the writer model's judgement/);
  // The Checks say what rests on unread pages.
  const checks = checksOf(text);
  assert.match(checks, /- 1 cited source was seen only in search results, not read: what the report takes from it rests at most on a search result's short summary, not on the page\./);
  assert.match(checks, /- 1 cited source was not read, and not seen in search results either: check it before relying on what it supports\./);
  assert.doesNotMatch(text, /\(fetched\)|not fetched|treat them with care|comes from a search result's short summary/, 'the old wording is gone');
});

test('with requireFetched on, findings from unread pages are dropped and the Checks say why', async () => {
  const { run, prompts } = plugin({ requireFetched: true });
  const { text, stats } = await run({ question: 'What happened at the plant?' });
  assert.equal(stats.sources, 1);
  assert.doesNotMatch(prompts.RESEARCH_WRITE, /not read/);
  assert.match(text, /- 2 findings were dropped \(no usable address, over the source limit, or its helper did not read the page\)\./);
});

test('the tool description promises only what the check does', () => {
  const { description } = plugin();
  assert.match(description, /Each citation is checked to be in the numbered source list/);
  assert.match(description, /claims are not compared with the pages/);
  assert.doesNotMatch(description, /against the pages the children fetched/);
});

// ---- two helpers cite one page: the source keeps the more certain status, each finding its own ----

const fromMemory = { tools: [], findings: [{ claim: 'The page says one thing', url: SHARED, quote: '' }] };
const fromSearch = { tools: [search('s1', [SHARED])], findings: [{ claim: 'The page says another', url: SHARED, quote: 'a snippet' }] };

for (const [order, searchers] of [['from memory first', [fromMemory, fromSearch]], ['from the search first', [fromSearch, fromMemory]]]) {
  test(`a page one helper names from memory and another saw in its search results is "seen only in search results" (${order})`, async () => {
    const { run, prompts } = plugin({}, { searchers, writer: 'One thing (seen only in search results, not read) [1].' });
    const { text, stats } = await run({ question: 'What does the page say?' });
    assert.equal(stats.sources, 1, 'one source for both helpers');
    assert.equal(sourcesOf(text), `[1] ${SHARED} (seen only in search results, not read)`);
    const checks = checksOf(text);
    assert.match(checks, /- 1 cited source was seen only in search results, not read:/);
    assert.doesNotMatch(checks, /not seen in search results either/);
    // Each finding reaches the writer with what its own helper did, not the source's merged label.
    assert.match(prompts.RESEARCH_WRITE, /The page says one thing \[not read, and not seen in search results\]/);
    assert.match(prompts.RESEARCH_WRITE, /The page says another — "a snippet" \[seen only in search results, not read\]/);
  });
}

const reader = { tools: [fetchPage('f1', SHARED)], findings: [{ claim: 'Read it', url: SHARED, quote: 'q' }] };

for (const [order, searchers] of [['the reader first', [reader, fromSearch]], ['the search first', [fromSearch, reader]]]) {
  test(`a page one helper read stays read, and the other helper's finding keeps its own label (${order})`, async () => {
    const { run, prompts } = plugin({}, { searchers, writer: 'Read it [1]. Another (seen only in search results, not read) [1].' });
    const { text, stats } = await run({ question: 'What does the page say?' });
    assert.equal(stats.sources, 1, 'one source for both helpers');
    assert.equal(sourcesOf(text), `[1] ${SHARED} (read)`, 'the Sources list keeps the merged status');
    // The helper that only saw the page in its search results did not read it: its finding says so.
    assert.match(prompts.RESEARCH_WRITE, /\[1\] The page says another — "a snippet" \[seen only in search results, not read\]/);
    assert.match(prompts.RESEARCH_WRITE, /\[1\] Read it — "q"\n/, 'the reader\'s finding is not labelled');
    assert.match(prompts.RESEARCH_WRITE, /say so in the same sentence/);
    // The Checks explain why a source listed as read has claims marked not read.
    assert.match(text, /- 1 cited source is listed as read, but some claims about it came from a helper that did not read the page; those claims are marked not read in the text\./);
  });
}

// The same claim (in other letter case) from a helper that only saw the page in its search results.
const sameClaimFromSearch = { ...fromSearch, findings: [{ claim: 'read it', url: SHARED, quote: 'a snippet' }] };

for (const [order, searchers, kept] of [['the reader first', [reader, sameClaimFromSearch], '[1] Read it — "q"'], ['the search first', [sameClaimFromSearch, reader], '[1] read it — "a snippet"']]) {
  test(`the same claim from the same page, from a helper that read it and one that did not, is kept once as read (${order})`, async () => {
    const { run, prompts } = plugin({}, { searchers, writer: 'Read it [1].' });
    const { stats } = await run({ question: 'What does the page say?' });
    assert.equal(stats.findings, 1, 'the claim is kept once');
    assert.equal(prompts.RESEARCH_WRITE.split('Findings:\n')[1].trim(), kept, 'the more certain of the two statuses: read, so no label');
    assert.doesNotMatch(prompts.RESEARCH_WRITE, /not read/);
  });
}

test('with requireFetched on, a finding is kept only when its own helper read the page', async () => {
  const { run, prompts } = plugin({ requireFetched: true }, { searchers: [reader, fromSearch], writer: 'Read it [1].' });
  const { text, stats } = await run({ question: 'What does the page say?' });
  assert.equal(stats.sources, 1);
  assert.equal(sourcesOf(text), `[1] ${SHARED} (read)`);
  assert.match(prompts.RESEARCH_WRITE, /Read it/);
  assert.doesNotMatch(prompts.RESEARCH_WRITE, /The page says another/, 'another helper having read the page does not keep it');
  assert.match(checksOf(text), /- 1 finding was dropped \(no usable address, over the source limit, or its helper did not read the page\)\./);
});

// ---- a page counts as read only when its fetch came back without an error ---------------------

const failedFetch = (result) => ({
  tools: [search('s1', [SHARED]), fetchPage('f1', SHARED, result)],
  findings: [{ claim: 'The article says so', url: SHARED, quote: 'the snippet' }],
});

for (const [what, result] of [['an error result', { isError: true }], ['an HTTP 403 page', { statusCode: 403 }], ['no result at all', null]]) {
  test(`a fetch that ended in ${what} does not make the page read`, async () => {
    const { run, prompts } = plugin({}, { searchers: [failedFetch(result)], writer: 'The article says so (seen only in search results, not read) [1].' });
    const { text } = await run({ question: 'What does the article say?' });
    assert.equal(sourcesOf(text), `[1] ${SHARED} (seen only in search results, not read)`);
    assert.match(checksOf(text), /- 1 cited source was seen only in search results, not read: what the report takes from it rests at most on a search result's short summary, not on the page\./);
    assert.match(prompts.RESEARCH_WRITE, /The article says so — "the snippet" \[seen only in search results, not read\]/);
  });
}

test('with requireFetched on, a finding whose fetch failed is dropped', async () => {
  const searchers = [{
    tools: [search('s1', [SHARED, READ]), fetchPage('f1', SHARED, { statusCode: 404 }), fetchPage('f2', READ)],
    findings: [{ claim: 'The article says so', url: SHARED, quote: 'the snippet' }, { claim: 'Output rose 4%', url: READ, quote: 'rose 4%' }],
  }];
  const { run, prompts } = plugin({ requireFetched: true }, { searchers, writer: 'Output rose [1].' });
  const { text, stats } = await run({ question: 'What does the article say?' });
  assert.equal(stats.sources, 1);
  assert.equal(sourcesOf(text), `[1] ${READ} (read)`);
  assert.doesNotMatch(prompts.RESEARCH_WRITE, /The article says so/);
  assert.match(checksOf(text), /- 1 finding was dropped \(no usable address, over the source limit, or its helper did not read the page\)\./);
});

test('the progress strip counts as read only the pages whose fetch came back', async () => {
  const searchers = [{
    tools: [fetchPage('f1', READ), fetchPage('f2', SHARED, { isError: true }), fetchPage('f3', SNIPPET, { statusCode: 404 })],
    findings: [{ claim: 'Output rose 4%', url: READ, quote: 'rose 4%' }],
  }];
  const { run, progress } = plugin({}, { searchers, writer: 'Output rose [1].' });
  await run({ question: 'What happened?' });
  const view = progress();
  assert.equal(view.pages, 1, 'one of three pages was read');
  assert.deepEqual(view.hosts, ['read.example', 'x.example', 'snippet.example'], 'the sites the helpers went to are shown at once');
});

test('a fetch that was redirected counts the page it ended on as read too', async () => {
  const landed = 'https://x.example/page-moved';
  const searchers = [{ tools: [fetchPage('f1', SHARED, { finalUrl: landed })], findings: [{ claim: 'Asked for', url: SHARED, quote: 'q' }, { claim: 'Landed on', url: landed, quote: 'q' }] }];
  const { run } = plugin({}, { searchers, writer: 'Asked for [1]. Landed on [2].' });
  const { text } = await run({ question: 'Where did it go?' });
  assert.equal(sourcesOf(text), `[1] ${SHARED} (read)\n[2] ${landed} (read)`);
});

test('wide mode keeps only sources whose fetch came back without an error', async () => {
  const good = 'https://good.example/price';
  const row = {
    tools: [fetchPage('f1', good), fetchPage('f2', SHARED, { isError: true }), fetchPage('f3', UNSEEN, { statusCode: 403 })],
    sources: [good, SHARED, UNSEEN],
  };
  const { run } = plugin({}, { row });
  const { text, stats } = await run({ question: 'Price of each', mode: 'wide', items: ['Widget'], columns: ['Price'] });
  assert.equal(stats.withSources, 1);
  const [, line] = text.trim().split('\n');
  assert.equal(line, `Widget,10,${good},sources no helper read were left out`);
});
