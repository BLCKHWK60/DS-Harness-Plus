/**
 * Web levels (plan step S1): which pages each level opens, the Internet Archive judged by the page it
 * copies, the owner's own mixes, and the addresses a tool call would open.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LANES, VERIFIED_START, addressesOf, laneOf, levelAllows, mixesOf, originalOf, pickedLevel, verifiedList } from '../lib/weblevel.js';

const verified = verifiedList(VERIFIED_START);

test('lanes: verified sources, ordinary sites, forums, channels, the Reddit archives', () => {
  assert.equal(laneOf('https://www.destatis.de/DE/Themen/x.html', verified), 'verified');
  assert.equal(laneOf('https://data.census.gov/table', verified), 'verified', 'a list entry covers its subdomains');
  assert.equal(laneOf('https://www.nasa.gov/news', verified), 'verified', '.gov covers every site ending so');
  assert.equal(laneOf('https://www.example.com/article', verified), 'sites');
  assert.equal(laneOf('https://old.reddit.com/r/x/comments/1', verified), 'forums');
  assert.equal(laneOf('https://forum.example.org/t/1', verified), 'forums');
  assert.equal(laneOf('https://community.vendor.com/t/1', verified), 'forums');
  assert.equal(laneOf('https://t.me/somechannel/12', verified), 'channels');
  assert.equal(laneOf('https://api.pullpush.io/reddit/search', verified), 'archives');
  assert.equal(laneOf('not an address', verified), '');
  assert.equal(laneOf('file:///etc/passwd', verified), '', 'only web addresses are judged');
  assert.equal(laneOf('https://evil.gov.example.com/', verified), 'sites', 'a look-alike host is not on the list');
  assert.equal(laneOf('https://notreuters.com/', verified), 'sites', 'a host only ending in the same letters is not on the list');
});

test('the Internet Archive follows the level: a copy is judged by the page it copies', () => {
  assert.equal(originalOf('https://web.archive.org/web/20200101000000/https://forum.example.org/t/1'), 'https://forum.example.org/t/1');
  assert.equal(laneOf('https://web.archive.org/web/2020/https://www.reddit.com/r/x', verified), 'forums');
  assert.equal(laneOf('https://web.archive.org/web/2020/www.bbc.co.uk/news', verified), 'verified');
  assert.equal(levelAllows({ level: 'open', verified, address: 'https://web.archive.org/web/2020/https://t.me/x' }).ok, false);
});

test('each level opens its own kinds of source; the refusal says what to do', () => {
  const at = (level, address, lanes) => levelAllows({ level, lanes, verified, address });
  assert.equal(at('verified', 'https://www.reuters.com/x').ok, true);
  const no = at('verified', 'https://www.example.com/x');
  assert.equal(no.ok, false);
  assert.match(no.why, /Web is at Verified, which does not open ordinary sites: www\.example\.com was not opened\. Name it to the user as a lead[\s\S]*\(Open web or Everything\)/);
  assert.equal(at('open', 'https://www.example.com/x').ok, true);
  assert.equal(at('open', 'https://www.reddit.com/r/x').ok, false);
  assert.match(at('open', 'https://discord.gg/abc').why, /public groups and channels[\s\S]*\(Everything\)/);
  for (const address of ['https://www.reddit.com/r/x', 'https://t.me/x', 'https://api.pullpush.io/x', 'https://www.example.com/x', 'https://who.int/x']) assert.equal(at('everything', address).ok, true, address);
  assert.equal(at('custom', 'https://www.reddit.com/r/x', ['verified', 'forums']).ok, true);
  assert.equal(at('custom', 'https://www.example.com/x', ['verified', 'forums']).ok, false);
  assert.match(at('custom', 'https://www.example.com/x', ['verified']).why, /your Custom mix/);
  assert.equal(at('custom', 'https://www.example.com/x', []).ok, false, 'an empty mix opens nothing');
  assert.equal(at(undefined, 'https://www.example.com/x').ok, true, 'no level: as before');
});

test('the owner\'s list and mixes are read safely; a conversation\'s pick is read only when it names a level', () => {
  assert.deepEqual(verifiedList('example.org\n  .gov.example # a note\nnot a host!\n\n# only a note'), ['example.org', '.gov.example']);
  assert.deepEqual(mixesOf('{"Papers and forums":["verified","forums","bogus"],"":["sites"]}'), { 'Papers and forums': ['verified', 'forums'] });
  assert.deepEqual(mixesOf('not json'), {});
  assert.deepEqual(mixesOf('[1,2]'), {});
  const mixes = { Mine: ['verified', 'sites'] };
  assert.deepEqual(pickedLevel('open', mixes), { level: 'open' });
  assert.deepEqual(pickedLevel('custom:Mine', mixes), { level: 'custom', lanes: ['verified', 'sites'], name: 'Mine' });
  assert.equal(pickedLevel('custom:Gone', mixes), undefined, 'a mix that was removed: as before');
  assert.equal(pickedLevel('off', mixes), undefined);
  assert.equal(pickedLevel(undefined, mixes), undefined);
  assert.deepEqual(LANES, ['verified', 'sites', 'forums', 'channels', 'archives']);
});

test('the addresses a tool call would open', () => {
  assert.deepEqual(addressesOf({ url: 'https://a.example/x', prompt: 'summarise https://b.example' }), ['https://a.example/x']);
  assert.deepEqual(addressesOf({ urls: ['https://a.example/', 'ftp://x', 5] }), ['https://a.example/']);
  assert.deepEqual(addressesOf({ query: 'reddit heat pumps' }), [], 'a search query opens nothing');
  assert.deepEqual(addressesOf(null), []);
});

test('on a stand-in app: a picked level limits what a tool opens, in the conversation and its helpers; On as before limits nothing; Recon and Research keep their own', async () => {
  const { boot, makeWorld } = await import('./app.mjs');
  const RECON = { label: 'Recon', tools: ['recon_cite'], sandbox: 'read-only', prompt: 'Recon method.', isolated: true };
  const RESEARCH = { label: 'Research', tools: ['deep_research', 'web_search', 'web_fetch'], sandbox: 'read-only', prompt: 'Research method.' };
  const world = makeWorld({
    pruneStaleSessions: false,
    extraModes: JSON.stringify({ recon: RECON, research: RESEARCH }),
    sessionModes: JSON.stringify({ c1: 'cowork', c2: 'cowork', c3: 'cowork', r1: 'recon', s1: 'research' }),
    sessionWeb: JSON.stringify({ c3: false }),
    sessionWebLevel: JSON.stringify({ c1: 'verified', c3: 'verified', r1: 'verified', s1: 'verified', c4: 'custom:Mine' }),
    webMixes: JSON.stringify({ Mine: ['verified', 'forums'] }),
  });
  const app = boot(world, { known: ['web_fetch', 'web_search'], ultra: new Set(['c2']) });
  try {
    for (const id of ['c1', 'c2', 'c3', 'r1', 's1']) await app.open(id);
    await app.open('h1', { header: { parentSession: 'c1' } });
    const fetch = (id, url) => app.guard({ name: 'web_fetch', agent: { id }, arguments: { url } });
    assert.match(fetch('c1', 'https://www.example.com/a'), /Web is at Verified[\s\S]*www\.example\.com was not opened/);
    assert.equal(fetch('c1', 'https://www.reuters.com/a'), undefined);
    assert.match(fetch('h1', 'https://www.example.com/a'), /Web is at Verified/, 'a helper follows its conversation');
    assert.equal(app.guard({ name: 'web_search', agent: { id: 'c1' }, arguments: { query: 'heat pumps' } }), undefined, 'searching lists results as usual');
    assert.equal(fetch('c2', 'https://www.reddit.com/r/x'), undefined, 'On as before: no limit');
    assert.doesNotMatch(String(fetch('r1', 'https://www.example.com/a')), /Web is at/, 'Recon keeps its own rules (its own refusal, not a level)');
    assert.equal(fetch('s1', 'https://www.example.com/a'), undefined, 'Research keeps its own web');
    const service = app.service();
    assert.equal(service.webLevel('c1'), 'verified');
    assert.equal(service.webLevel('h1'), 'verified');
    assert.equal(service.webLevel('c2'), undefined, 'On as before');
    assert.equal(service.webLevel('c3'), 'off');
    assert.equal(service.webAllows('c1', 'https://www.example.com/'), false);
    assert.equal(service.webAllows('c1', 'https://who.int/x'), true);
    assert.equal(service.webAllows('c2', 'https://www.example.com/'), undefined);
    assert.equal(service.ultraCode('c2'), true);
    assert.equal(service.ultraCode('c1'), false);
    assert.match(app.prompt('c1'), /Web level: Verified\. Pages you open must be only sources on the verified list/);
    assert.doesNotMatch(app.prompt('c2'), /Web level/);
  } finally {
    app.stop();
  }
});

test('on a stand-in app: an older Model Tiers that cannot say leaves Ultra Code unknown', async () => {
  const { boot, makeWorld } = await import('./app.mjs');
  const app = boot(makeWorld({ pruneStaleSessions: false, sessionModes: JSON.stringify({ c1: 'cowork' }) }));
  try {
    await app.open('c1');
    assert.equal(app.service().ultraCode('c1'), undefined);
  } finally {
    app.stop();
  }
});

test('after review: archive and reader forms, Reddit and X front-ends, addresses by number and a copy that cannot be read out are judged, not let through', () => {
  const at = (address, level = 'verified') => levelAllows({ level, verified, address }).ok;
  for (const address of [
    'https://web.archive.org:443/web/2024/https://www.reddit.com/r/x',
    'https://web.archive.org./web/2024/https://www.reddit.com/r/x',
    ' https://web.archive.org/web/2024/https://www.reddit.com/r/x',
    'https://web.archive.org/web/2024/https://www.red\ndit.com/r/x',
    'https://wayback.archive.org/web/2024/https://www.reddit.com/',
    'https://web.archive.org/save/https://www.reddit.com/',
    'https://web.archive.org/web/2024/https%3A%2F%2Fwww.reddit.com%2Fr%2Fx',
    'https://archive.ph/newest/https://reddit.com/r/x',
    'https://r.jina.ai/https://www.reddit.com/',
    'https://www-reddit-com.translate.goog/r/x',
  ]) {
    assert.equal(at(address), false, address);
    assert.equal(at(address, 'open'), false, `${address} at Open web`);
    assert.equal(at(address, 'everything'), true, `${address} at Everything`);
  }
  for (const address of ['https://i.redd.it/x.png', 'https://libreddit.example.net/r/x', 'https://nitter.net/x', 'https://xcancel.com/x']) assert.equal(at(address, 'open'), false, address);
  assert.equal(laneOf('https://archive.ph/AbCd', verified), 'unknown', 'a short copy link: the page cannot be read out');
  assert.equal(laneOf('http://203.0.113.10/r/x', verified), 'unknown', 'an address by number');
  assert.equal(at('http://203.0.113.10/r/x', 'open'), false);
  assert.equal(at('http://203.0.113.10/r/x', 'everything'), true);
  assert.equal(laneOf('https://chat.openai.com/', verified), 'sites', 'chat.* is not a channel by its name alone');
  assert.equal(at('https://archive.org/details/some-book'), true, 'the archive\'s own pages are the archive');
  assert.equal(at('https://web.archive.org/web/2020/www.bbc.co.uk/news'), true);
  assert.match(levelAllows({ level: 'verified', verified, address: 'https://www.example.com/' }).why, /Do not try to reach it another way/);
});

test('after review: every argument that is a whole web address is judged, at any depth, under any name', () => {
  assert.deepEqual(addressesOf({ uri: 'https://a.example/x' }), ['https://a.example/x']);
  assert.deepEqual(addressesOf({ input: { startUrls: [{ url: 'https://b.example/' }] } }), ['https://b.example/']);
  assert.deepEqual(addressesOf('https://c.example/'), ['https://c.example/']);
  assert.deepEqual(addressesOf({ prompt: 'read https://d.example and summarise' }), [], 'free text is not an address');
});

test('on a stand-in app, after review: commands and programs follow the level; a level kept while the button is Off does not apply; Recon reads as no level', async () => {
  const { boot, makeWorld } = await import('./app.mjs');
  const RECON = { label: 'Recon', tools: ['recon_cite'], sandbox: 'read-only', prompt: 'Recon method.', isolated: true };
  const world = makeWorld({
    pruneStaleSessions: false,
    extraModes: JSON.stringify({ recon: RECON }),
    sessionModes: JSON.stringify({ c1: 'cowork', c2: 'cowork', c3: 'cowork', r1: 'recon' }),
    sessionWeb: JSON.stringify({ c2: false, r1: false }),
    sessionWebLevel: JSON.stringify({ c1: 'verified', c2: 'verified', c3: 'everything' }),
  });
  const on = new Set(['c2']);
  const app = boot(world, { known: ['web_fetch', 'bash', 'run_code'], mission: { longRun: (id) => (on.has(id) ? { files: true, web: true } : undefined) } });
  try {
    for (const id of ['c1', 'c2', 'c3', 'r1']) await app.open(id);
    const bash = (id, command) => app.guard({ name: 'bash', agent: { id }, arguments: { command } });
    assert.match(bash('c1', 'curl -s https://www.reddit.com/r/x.json'), /Web is at Verified[\s\S]*forums and boards/);
    assert.equal(bash('c1', 'curl -s https://www.reuters.com/x'), undefined, 'an address on the list');
    assert.match(bash('c1', 'pip install requests'), /goes online without a web address Modes can check/);
    assert.equal(bash('c1', 'ls -la'), undefined, 'a command that stays here');
    assert.equal(bash('c3', 'pip install requests'), undefined, 'Everything');
    assert.match(app.guard({ name: 'run_code', agent: { id: 'c1' }, arguments: { code: "await fetch('https://www.reddit.com/r/x.json')" } }), /Web is at Verified/);
    // The button on Off kept the level; a Long run with the web on does not bring it back.
    assert.equal(app.guard({ name: 'web_fetch', agent: { id: 'c2' }, arguments: { url: 'https://www.reddit.com/r/x' } }), undefined);
    assert.equal(app.service().webLevel('c2'), undefined);
    assert.equal(app.service().webLevel('r1'), undefined, 'Recon keeps its own web');
  } finally {
    app.stop();
  }
});

test('Recon with its Web button on Off keeps only recon_cite: every tool of its that goes online is refused, its ordinary-web, board and Ultra Code tools too', async () => {
  const { isolatedMayRun } = await import('../lib/isolation.js');
  const mode = { id: 'recon', isolated: true, tools: ['recon_cite', 'recon_onion_search', 'recon_web_search', 'recon_web_read', 'recon_board_search', 'recon_board_read', 'recon_ultra', 'recon_news_search'] };
  for (const name of mode.tools.filter((tool) => tool !== 'recon_cite')) assert.equal(isolatedMayRun({ mode, name, webOff: true }), false, name);
  assert.equal(isolatedMayRun({ mode, name: 'recon_cite', webOff: true }), true);
  for (const name of mode.tools) assert.equal(isolatedMayRun({ mode, name, webOff: false }), true, `${name} with the web on`);
});
