/**
 * The one Web selector (18 November 2026): combinable source ticks, the older levels read as ticks,
 * search results filtered, Research and Recon following their own ticks, and the owner's own other
 * sources with their secrets kept out of the model's reach.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACADEMIC_START, KINDS, NETS, NEWS_START, filterSearchText, isAll, kindsOf, listsOf, selectionsOf, sourcesAllow, sourcesSaid, ticksFromLevel, ticksLabel, ticksOf } from '../lib/sources.js';
import { addressOf, keychainQuote, linkOn, localHost, openSecrets, otherSourcesOf, readSource, requestOf, scrub, showPage } from '../lib/other.js';
import { maskFor, toolMaskFor } from '../lib/mask.js';
import { normalizeStart, startOps } from '../lib/start.js';

const lists = listsOf({});

test('kinds: one site can be two kinds; everything else is an ordinary site', () => {
  assert.deepEqual(kindsOf('https://www.reuters.com/world/x', lists), ['verified', 'news']);
  assert.deepEqual(kindsOf('https://arxiv.org/abs/2401.1', lists), ['verified', 'academic']);
  assert.deepEqual(kindsOf('https://www.mdpi.com/x', lists), ['academic']);
  assert.deepEqual(kindsOf('https://www.theguardian.com/x', lists), ['news']);
  assert.deepEqual(kindsOf('https://www.example.com/a', lists), ['sites']);
  assert.deepEqual(kindsOf('https://old.reddit.com/r/x', lists), ['forums']);
  assert.deepEqual(kindsOf('https://x.com/someone/status/1', lists), ['social']);
  assert.deepEqual(kindsOf('https://www.youtube.com/watch?v=1', lists), ['social']);
  assert.deepEqual(kindsOf('https://api.pullpush.io/reddit/search', lists), ['archives']);
  assert.deepEqual(kindsOf('http://203.0.113.10/x', lists), ['unknown']);
  assert.deepEqual(kindsOf('https://web.archive.org/web/2020/https://www.reddit.com/r/x', lists), ['forums'], 'a copy is judged by the page it copies');
  assert.deepEqual(kindsOf('not an address', lists), []);
  assert.deepEqual(kindsOf('https://notreuters.com/', lists), ['sites']);
  assert.ok(ACADEMIC_START.includes('arxiv.org') && NEWS_START.includes('apnews.com'));
  assert.deepEqual(listsOf({ academic: '' }).academic, [], 'an emptied list stays empty');
});

test('ticks combine: a page passes when any of its kinds is ticked; the refusal says what to tick', () => {
  const at = (ticks, address) => sourcesAllow({ ticks, lists, address });
  assert.equal(at(['verified', 'forums'], 'https://www.reddit.com/r/x').ok, true);
  assert.equal(at(['verified', 'forums'], 'https://who.int/x').ok, true);
  const no = at(['verified', 'forums'], 'https://www.example.com/x');
  assert.equal(no.ok, false);
  assert.match(no.why, /Web sources are only verified sources and forums and boards, which leaves out ordinary sites: www\.example\.com was not opened\. Name it to the user as a lead: they can tick ordinary sites on the Web button/);
  assert.equal(at(['news'], 'https://www.reuters.com/x').ok, true, 'a wire service is news too');
  assert.equal(at(['academic'], 'https://www.reuters.com/x').ok, false);
  assert.equal(at(['social'], 'https://t.me/x').ok, true);
  assert.equal(at(['verified', 'academic', 'news', 'sites', 'forums', 'social'], 'http://203.0.113.10/x').ok, false, 'what cannot be told apart needs every kind of page');
  assert.equal(at(['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives'], 'http://203.0.113.10/x').ok, true);
  assert.equal(at([], 'https://who.int/x').ok, false, 'nothing ticked opens nothing');
  assert.equal(at(undefined, 'https://www.example.com/x').ok, true, 'All: as before');
});

test('the older levels and Custom mixes are read as ticks; the chip says All, one or two names, N sources, or a saved name', () => {
  assert.deepEqual(ticksFromLevel('verified', {}), ['verified']);
  assert.deepEqual(ticksFromLevel('open', {}), ['verified', 'academic', 'news', 'sites']);
  assert.deepEqual(ticksFromLevel('everything', {}), ['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives']);
  const saved = selectionsOf('{"Mine":["verified","channels","bogus"],"Empty":["bogus"],"":["sites"]}');
  assert.deepEqual(saved, { Mine: ['verified', 'social'] }, 'groups and channels is social media now; a selection with nothing readable is left out');
  assert.deepEqual(ticksFromLevel('custom:Mine', saved), ['verified', 'social']);
  assert.equal(ticksFromLevel('on', saved), undefined);
  assert.equal(ticksLabel(undefined), 'All');
  assert.equal(ticksLabel([...KINDS]), 'All');
  assert.equal(ticksLabel(['verified', 'forums']), 'Verified + Forums');
  assert.equal(ticksLabel(['verified', 'academic', 'news', 'sites']), '4 sources');
  assert.equal(ticksLabel(['social', 'verified'], { selections: saved }), 'Mine');
  assert.equal(ticksLabel(['tor', 'usenet'], { recon: true }), 'Tor + Usenet');
  assert.equal(isAll([...KINDS], { recon: true }), false, 'in Recon All includes its networks');
  assert.equal(isAll([...KINDS, 'tor', 'usenet'], { recon: true }), true, 'I2P is not set up yet, so it does not count');
  assert.deepEqual(ticksOf(['tor', 'verified']), ['verified'], 'outside Recon its networks are dropped');
  assert.deepEqual(ticksOf(['tor', 'verified'], { recon: true }), ['verified', 'tor']);
  assert.deepEqual(NETS, ['tor', 'usenet', 'i2p']);
});

test('search results of kinds that are not ticked are taken out, with a line saying so; the service\'s summary goes too', () => {
  const sources = [{ url: 'https://www.reuters.com/a' }, { url: 'https://www.reddit.com/r/b' }, { url: 'https://www.example.com/c' }];
  const text = 'NOTICE\n\nThe answer is 42.\n\nSources:\n- [Reuters](https://www.reuters.com/a) — wire\n- [Reddit](https://www.reddit.com/r/b) — thread\n- [Example](https://www.example.com/c)\n\nCite the relevant URLs above as markdown links in your answer.';
  const out = filterSearchText(text, sources, ['verified', 'forums'], lists, 'The answer is 42.');
  assert.equal(out.left, 1);
  assert.match(out.text, /Reuters/);
  assert.match(out.text, /Reddit/);
  assert.doesNotMatch(out.text, /example\.com/);
  assert.doesNotMatch(out.text, /The answer is 42/);
  assert.match(out.text, /1 result was left out because it is not among this conversation's Web sources: only verified sources and forums and boards/);
  const none = filterSearchText(text, sources, ['academic'], lists);
  assert.equal(none.left, 3);
  assert.match(none.text, /Sources: none of the ticked kinds/);
  assert.deepEqual(filterSearchText(text, sources, undefined, lists), { text, left: 0 }, 'All: unchanged');
  assert.deepEqual(filterSearchText(text, sources, ['verified', 'forums', 'sites'], lists), { text, left: 0 });
});

test('the model is told the ticks and how to word its searches (Research\'s former Academic words are here)', () => {
  assert.equal(sourcesSaid(undefined), '');
  const academic = sourcesSaid(['academic']);
  assert.match(academic, /Web sources: only academic papers\. Search results of other kinds are removed before you see them/);
  assert.match(academic, /"study", "paper", "meta-analysis"/);
  assert.match(sourcesSaid(['news', 'other'], { other: ['Club archive'] }), /add the current year or month[\s\S]*The user's own sources: "Club archive"/);
  assert.match(sourcesSaid([]), /nothing is ticked/);
});

test('start values may hold a tab\'s ticks; they are written once, not over a conversation\'s own', () => {
  const start = normalizeStart({ sources: ['forums', 'verified', 'tor', 'bogus'] });
  assert.deepEqual(start.sources, ['verified', 'forums']);
  assert.deepEqual(normalizeStart({ sources: ['tor', 'usenet'] }, { isolated: true }).sources, ['tor', 'usenet']);
  assert.equal(normalizeStart({}).sources, undefined, 'nothing saved: usual');
  const ops = startOps(start, { sessionWebSources: '{}' }, 'c1');
  assert.deepEqual(ops, [{ op: 'set', path: ['sessionWebSources'], value: JSON.stringify({ c1: ['verified', 'forums'] }) }]);
  assert.deepEqual(startOps(start, { sessionWebSources: JSON.stringify({ c1: ['news'] }) }, 'c1'), []);
  assert.deepEqual(startOps({ ...start, web: 'off' }, { sessionWebSources: '{}', sessionWeb: '{}' }, 'c1').map((op) => op.path[0]), ['sessionWeb'], 'Web Off: no ticks');
});

test('the owner\'s own tools come with the web in a list mode (only when the app has them), and go with it', () => {
  assert.deepEqual(maskFor({ tools: ['read', 'web_search'], web: true, research: false, off: false, child: false, withWeb: ['other_search'] }), { allow: ['read', 'web_search', 'web_fetch', 'other_search'] });
  assert.deepEqual(maskFor({ tools: ['read', 'web_search'], web: false, research: false, off: false, child: false, withWeb: ['other_search'] }), { allow: ['read'] });
  assert.deepEqual(toolMaskFor({ mode: { tools: 'all' }, known: ['other_search', 'other_read'] }), { deny: ['web_search', 'web_fetch', 'deep_research', 'other_search', 'other_read'] }, 'Web off in a tab with all tools');
  assert.equal(toolMaskFor({ mode: { tools: 'all' }, known: ['other_search'], web: true }), null);
  assert.deepEqual(toolMaskFor({ mode: { tools: 'none' }, known: ['other_read'], web: true }), { allow: ['web_search', 'web_fetch', 'other_read'] });
});

test('other sources: only what can be used is kept; nothing secret is in the settings', () => {
  const list = otherSourcesOf(JSON.stringify([
    { id: 'club', name: 'Club archive', search: 'https://club.example.org/search?q={query}', login: 'basic', store: 'keychain', recon: true },
    { id: 'club', name: 'Again', start: 'https://a.example/' },
    { id: 'feed', name: 'Paid feed', start: 'https://feed.example.com/', login: 'header', header: 'X-Api-Key' },
    { id: 'bad1', name: 'Host header', start: 'https://b.example/', login: 'header', header: 'Host' },
    { id: 'priv', name: 'Private board', login: 'secret-address', search: 'https://leak.example/{query}' },
    { id: 'nope', name: 'No address' },
    { id: 'BAD', name: 'Upper id', start: 'https://c.example/' },
    { id: 'pw', name: 'Login in address', start: 'https://user:pw@d.example/' },
  ]));
  assert.deepEqual(list.map((one) => one.id), ['club', 'feed', 'priv']);
  assert.equal(list[0].store, 'keychain');
  assert.equal(list[0].recon, true);
  assert.equal(list[1].store, 'app', 'the app\'s secret store is the default');
  assert.equal(list[1].recon, false, 'Recon may not use a source until the owner says so');
  assert.equal(list[2].search, '', 'a secret address is never kept in the settings');
  assert.equal(addressOf('https://x.example/s', { query: true }).ok, false, 'a search address needs {query}');
  assert.equal(localHost('192.168.1.5'), true);
  assert.equal(localHost('example.com'), false);
});

test('secrets: the app\'s store by default, the Keychain by choice; a Keychain value goes in on standard input, never on the command line', async () => {
  const kept = new Map();
  const credentials = { resolve: async (name) => ({ value: kept.get(name) ?? '' }), describe: async (name) => ({ configured: kept.has(name) }), set: async (name, value) => kept.set(name, value), unset: async (name) => kept.delete(name) };
  const calls = [];
  const security = async (args, input) => {
    calls.push({ args, input });
    return { ok: true, out: 'kept-value\n' };
  };
  const secrets = openSecrets({ credentials: () => credentials, security });
  const app = { id: 'feed', name: 'Paid feed', store: 'app' };
  await secrets.set(app, 'secret', 'k-123456');
  assert.equal(kept.get('DSH_OTHER_SOURCE_FEED_SECRET'), 'k-123456');
  assert.equal(await secrets.get(app, 'secret'), 'k-123456');
  assert.equal(await secrets.has(app, 'secret'), true);
  const chain = { id: 'club', name: 'Club "archive"', store: 'keychain' };
  await secrets.set(chain, 'secret', 'made-up "pw" \\ x');
  const write = calls.at(-1);
  assert.deepEqual(write.args, ['-i']);
  assert.ok(!write.args.join(' ').includes('made-up'), 'the value is not on the command line');
  assert.match(write.input, /^add-generic-password -U -s dsh-other-source-club -a secret -l "DeepSeek Harness: Club \\"archive\\"" -w "made-up \\"pw\\" \\\\ x"\n$/);
  assert.equal(await secrets.get(chain, 'secret'), 'kept-value');
  await assert.rejects(secrets.set(app, 'secret', 'two\nlines'), /one line/);
  await secrets.unset(app, 'secret');
  assert.equal(kept.has('DSH_OTHER_SOURCE_FEED_SECRET'), false);
  assert.equal(keychainQuote('a"b\\c'), '"a\\"b\\\\c"');
});

test('a request fills in the login; whatever the model sees has the secret parts taken out, and a secret address\'s site is the source\'s name', async () => {
  const basic = await requestOf({ name: 'Club', login: 'basic', search: 'https://club.example.org/s?q={query}', start: '' }, async (part) => (part === 'user' ? 'made-up-user' : 'made-up-pass'));
  assert.equal(basic.headers.authorization, `Basic ${Buffer.from('made-up-user:made-up-pass').toString('base64')}`);
  assert.equal(scrub('hello made-up-user and made-up-pass', basic.hide, 'Club'), 'hello [Club] and [Club]');
  const hidden = await requestOf({ name: 'Board', login: 'secret-address', search: '', start: '' }, async () => 'https://secret-board.example/s/abc123token?q={query}');
  assert.equal(hidden.search, 'https://secret-board.example/s/abc123token?q={query}');
  assert.equal(hidden.hideHost, 'secret-board.example');
  const page = { url: 'https://secret-board.example/s/abc123token/thread/9', status: 200, title: 'secret-board.example board', text: 'See https://secret-board.example/s/abc123token/thread/10', links: [{ url: 'https://secret-board.example/thread/10', text: 'next' }, { url: 'https://elsewhere.example/', text: 'away' }] };
  const shown = showPage({ name: 'Board', page, hide: hidden.hide, hideHost: hidden.hideHost });
  assert.doesNotMatch(shown, /secret-board\.example|abc123token/);
  assert.match(shown, /Source "Board": \[Board\]/);
  assert.match(shown, /- next: \/thread\/10/);
  assert.doesNotMatch(shown, /elsewhere/, 'links to other sites are not listed');
  await assert.rejects(requestOf({ name: 'Club', login: 'basic', search: 'https://x.example/{query}', start: '' }, async () => ''), /No login is kept for "Club"/);
  assert.equal(linkOn('https://club.example.org/', '/item/1').url, 'https://club.example.org/item/1');
  assert.equal(linkOn('https://club.example.org/', 'https://evil.example/x').ok, false);
});

test('reading a source: its own site only, text only, no login over plain http', async () => {
  const answer = (status, headers, body = '') => ({ status, headers: new Map(Object.entries(headers)), text: async () => body });
  const seen = [];
  const fake = (responses) => async (url, init) => {
    seen.push({ url, init });
    return responses.shift();
  };
  const ok = await readSource('https://club.example.org/s?q=x', { authorization: 'Basic abc' }, { fetch: fake([answer(302, { location: '/s2' }), answer(200, { 'content-type': 'text/html; charset=utf-8' }, '<title>Club</title><p>Hello <a href="/t/1">one</a></p><script>bad()</script>')]) });
  assert.equal(ok.ok, true);
  assert.equal(ok.url, 'https://club.example.org/s2');
  assert.match(ok.text, /Hello one/);
  assert.doesNotMatch(ok.text, /bad\(\)/);
  assert.equal(ok.links[0].url, 'https://club.example.org/t/1');
  assert.equal(seen[0].init.redirect, 'manual');
  assert.equal(seen[0].init.headers.authorization, 'Basic abc');
  const away = await readSource('https://club.example.org/', { cookie: 'a=b' }, { fetch: fake([answer(302, { location: 'https://login.other.example/' })]) });
  assert.equal(away.ok, false);
  assert.match(away.why, /another site/);
  const binary = await readSource('https://club.example.org/f', {}, { fetch: fake([answer(200, { 'content-type': 'application/zip' })]) });
  assert.match(binary.why, /not text/);
  const plain = await readSource('http://club.example.org/', { cookie: 'a=b' }, { fetch: fake([]) });
  assert.match(plain.why, /unencrypted/);
});

test('on a stand-in app: every tab follows its own ticks (Research too), results are filtered for the conversation and its helpers, Recon\'s ticks are Recon\'s own', async () => {
  const { boot, makeWorld } = await import('./app.mjs');
  const RECON = { label: 'Recon', tools: ['recon_cite', 'recon_onion_search'], sandbox: 'read-only', prompt: 'Recon method.', isolated: true };
  const RESEARCH = { label: 'Research', tools: ['deep_research', 'web_search', 'web_fetch'], sandbox: 'read-only', prompt: 'Research method.' };
  const world = makeWorld({
    pruneStaleSessions: false,
    extraModes: JSON.stringify({ recon: RECON, research: RESEARCH }),
    sessionModes: JSON.stringify({ c1: 'cowork', c2: 'cowork', c3: 'cowork', r1: 'recon', s1: 'research', s2: 'research' }),
    sessionWeb: JSON.stringify({ c3: false }),
    sessionWebSources: JSON.stringify({ c1: ['verified', 'forums'], c3: ['verified'], r1: ['tor', 'verified'], s1: ['academic'] }),
    sessionWebLevel: JSON.stringify({ s2: 'verified' }),
  });
  const app = boot(world, { known: ['web_fetch', 'web_search'] });
  try {
    for (const id of ['c1', 'c2', 'c3', 'r1', 's1', 's2']) await app.open(id);
    await app.open('h1', { header: { parentSession: 's1' } });
    const fetch = (id, url) => app.guard({ name: 'web_fetch', agent: { id }, arguments: { url } });
    assert.equal(fetch('c1', 'https://www.reddit.com/r/x'), undefined);
    assert.match(fetch('c1', 'https://www.example.com/a'), /leaves out ordinary sites/);
    assert.match(fetch('s1', 'https://www.example.com/a'), /only academic papers/, 'Research follows its ticks now');
    assert.match(fetch('h1', 'https://www.reuters.com/a'), /only academic papers/, 'its helpers too');
    assert.equal(fetch('s2', 'https://www.example.com/a'), undefined, 'an older level picked in another tab does not reach Research');
    assert.equal(fetch('c2', 'https://www.example.com/a'), undefined, 'All: as before');
    assert.equal(fetch('c3', 'https://www.example.com/a'), undefined, 'Web Off keeps the ticks for later');
    const service = app.service();
    assert.deepEqual(service.webSources('c1'), ['verified', 'forums']);
    assert.deepEqual(service.webSources('r1'), ['verified', 'tor'], 'Recon reads its own ticks, networks included');
    assert.equal(service.webSources('c2'), undefined);
    assert.equal(service.webAllows('s1', 'https://arxiv.org/abs/1'), true);
    assert.deepEqual(service.webKinds('https://www.reuters.com/'), ['verified', 'news']);
    assert.match(app.prompt('r1'), /Recon sources for this conversation: only verified sources and \.onion sites through Tor/);
    assert.match(app.prompt('s1'), /Web sources: only academic papers/);
    assert.doesNotMatch(app.prompt('c2'), /Web sources/);
    // Search results.
    const value = { sources: [{ url: 'https://www.reddit.com/r/x' }, { url: 'https://www.example.com/a' }], truncated: false };
    const content = [{ type: 'text', text: 'Sources:\n- [R](https://www.reddit.com/r/x)\n- [E](https://www.example.com/a)' }];
    const run = (id) => app.waterfall('tools/post-execute', { name: 'web_search', agent: { id } }, { isError: false, value, content }, async () => ({ kind: 'accept' }));
    const filtered = await run('c1');
    assert.match(filtered.content[0].text, /\[R\]/);
    assert.doesNotMatch(filtered.content[0].text, /\[E\]/);
    assert.match(filtered.content[0].text, /1 result was left out/);
    assert.deepEqual(await run('c2'), { kind: 'accept' }, 'All: the result as it came');
    assert.deepEqual(await run('r1'), { kind: 'accept' }, 'Recon filters its own results');
    const helper = await run('h1');
    assert.match(helper.content[0].text, /2 results were left out/);
    assert.equal(await service.carryWebSources('s2', ['news', 'verified']), true);
    assert.deepEqual(JSON.parse(app.config.sessionWebSources).s2, ['verified', 'news']);
    assert.equal(await service.carryWebSources('c1', ['news']), false, 'a conversation\'s own ticks stay');
  } finally {
    app.stop();
  }
});

test('on a stand-in app: the owner\'s own sources are offered while Other is ticked, read with the login kept in the secret store, and every secret is taken out', async () => {
  const { boot, makeWorld } = await import('./app.mjs');
  const kept = new Map([['DSH_OTHER_SOURCE_FEED_SECRET', 'made-up-key-98765']]);
  const credentials = { resolve: async (name) => ({ value: kept.get(name) ?? '' }), describe: async (name) => ({ configured: kept.has(name) }), set: async (name, value) => kept.set(name, value), unset: async (name) => kept.delete(name) };
  const world = makeWorld({
    pruneStaleSessions: false,
    sessionModes: JSON.stringify({ c1: 'cowork', c2: 'cowork', c3: 'cowork' }),
    sessionWebSources: JSON.stringify({ c1: ['verified'], c3: ['other'] }),
    otherSources: JSON.stringify([{ id: 'feed', name: 'Paid feed', search: 'https://feed.example.com/find?q={query}', login: 'header', header: 'X-Api-Key' }]),
  });
  const app = boot(world, { known: ['web_fetch', 'web_search', 'other_search', 'other_read', 'bash', 'read'], credentials });
  const realFetch = globalThis.fetch;
  try {
    for (const id of ['c1', 'c2', 'c3']) await app.open(id);
    const search = app.tool('other_search');
    assert.ok(search && app.tool('other_read'));
    const offered = (id) => search.options.when({ agent: { id } });
    assert.equal(offered('c1'), false, 'Other not ticked');
    assert.equal(offered('c2'), true, 'All ticks Other');
    assert.equal(offered('c3'), true);
    assert.match(app.guard({ name: 'other_read', agent: { id: 'c1' }, arguments: { source: 'Paid feed' } }), /Other is not ticked/);
    assert.equal(app.guard({ name: 'other_read', agent: { id: 'c3' }, arguments: { source: 'Paid feed', link: 'https://feed.example.com/x' } }), undefined, 'an Other link is not judged as an ordinary site');
    let asked;
    globalThis.fetch = async (url, init) => {
      asked = { url, init };
      return { status: 200, headers: new Map([['content-type', 'text/html']]), text: async () => '<title>Feed</title><p>Result one. Your key made-up-key-98765 is active.</p>' };
    };
    const out = await search.definition.execute({ source: 'paid FEED', query: 'heat pumps' });
    assert.equal(asked.url, 'https://feed.example.com/find?q=heat%20pumps');
    assert.equal(asked.init.headers['x-api-key'], 'made-up-key-98765');
    assert.match(out.text, /Result one/);
    assert.doesNotMatch(out.text, /made-up-key-98765/);
    assert.match(out.text, /Your key \[Paid feed\] is active/);
    assert.match((await search.definition.execute({ source: 'Nope', query: 'x' })).text, /There is no source named "Nope"\. The user's own sources: "Paid feed"/);
    kept.clear();
    assert.match((await search.definition.execute({ source: 'Paid feed', query: 'x' })).text, /No key is kept for "Paid feed"/);
    // The secret store stays out of reach of commands and file tools.
    assert.match(app.guard({ name: 'bash', agent: { id: 'c2' }, arguments: { command: 'cat ~/.dsh/.credentials.yaml' } }), /names the place where the user's secrets/);
    assert.match(app.guard({ name: 'read', agent: { id: 'c2' }, arguments: { path: '/Users/x/.dsh/.credentials.yaml' } }), /secrets/);
    assert.match(app.guard({ name: 'bash', agent: { id: 'c2' }, arguments: { command: 'security find-generic-password -s dsh-other-source-feed -w' } }), /secrets/);
    assert.equal(app.guard({ name: 'bash', agent: { id: 'c2' }, arguments: { command: 'ls' } }), undefined);
    assert.equal(app.guard({ name: 'edit', agent: { id: 'c2' }, arguments: { path: 'lib/other.js', text: 'appRef = DSH_OTHER_SOURCE_ ... .credentials.yaml' } }), undefined, 'editing code that mentions them is fine');
    assert.equal(app.guard({ name: 'bash', agent: { id: 'c2' }, arguments: { command: 'grep -n DSH_OTHER_SOURCE_ lib/other.js' } }), undefined);
    assert.deepEqual(app.service().reconOtherNames(), [], 'Recon may not use a source until the owner says so');
    assert.match((await app.service().reconOtherRequest('Paid feed')).error, /may be used in Recon/);
  } finally {
    globalThis.fetch = realFetch;
    app.stop();
  }
});

test('on a stand-in app: Recon\'s status bar learns which of your own sources it may use and whether each login is kept, never the login', async () => {
  const { boot, makeWorld } = await import('./app.mjs');
  const kept = new Map([['DSH_OTHER_SOURCE_CLUB_SECRET', 'made-up-pass'], ['DSH_OTHER_SOURCE_CLUB_USER', 'made-up-user']]);
  const credentials = { resolve: async (name) => ({ value: kept.get(name) ?? '' }), describe: async (name) => ({ configured: kept.has(name) }), set: async () => {}, unset: async () => {} };
  const world = makeWorld({
    pruneStaleSessions: false,
    otherSources: JSON.stringify([
      { id: 'club', name: 'Club', search: 'https://club.example.org/s?q={query}', login: 'basic', recon: true },
      { id: 'feed', name: 'Feed', start: 'https://feed.example.com/', login: 'cookie', recon: true },
      { id: 'open', name: 'Open', start: 'https://open.example.com/', recon: false },
    ]),
  });
  const app = boot(world, { credentials });
  try {
    const status = await app.service().reconOtherStatus();
    assert.deepEqual(status, [{ name: 'Club', login: 'basic', kept: true }, { name: 'Feed', login: 'cookie', kept: false }]);
    assert.doesNotMatch(JSON.stringify(status), /made-up/);
  } finally {
    app.stop();
  }
});
