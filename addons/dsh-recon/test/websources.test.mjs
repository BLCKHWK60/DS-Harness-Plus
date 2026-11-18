/**
 * Recon and the one Web selector (18 November 2026): its tools refuse sources the Web button does not
 * tick, its web results of unticked kinds are left out, and the user's own sources allowed in Recon are
 * read only through the WireGuard tunnel, with every secret part taken out. No network: stand-ins only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createClearnet, openWebTrail } from '../lib/clearnet.js';
import { loginLines } from '../lib/fetch-child.mjs';
import { MODE, TOOLS } from '../lib/mode.js';
import { createReconOther, linkOn, scrubbed } from '../lib/other.js';
import { openSources } from '../lib/sources.js';
import { UNTICKED, needsOf, resultAllowed, untickedRefusal } from '../lib/ticks.js';
import { answersOf, buildTools } from '../lib/tools.js';

/** Kinds as Modes would say them, for the hosts these tests use. */
const kinds = (address) => {
  const host = (() => { try { return new URL(address).hostname; } catch { return ''; } })();
  if (!host) return [];
  if (host.endsWith('reuters.com')) return ['verified', 'news'];
  if (host.endsWith('reddit.com')) return ['forums'];
  if (host.endsWith('arxiv.org')) return ['verified', 'academic'];
  return ['sites'];
};

test('each recon tool needs its own tick: Tor, Usenet, the kinds of page, boards as forums or social media, Other', () => {
  assert.deepEqual(needsOf('recon_onion_search', {}, kinds), ['tor']);
  assert.deepEqual(needsOf('recon_usenet_read', {}, kinds), ['usenet']);
  assert.deepEqual(needsOf('recon_news_search', {}, kinds), ['news']);
  assert.deepEqual(needsOf('recon_board_search', { source: 'reddit' }, kinds), ['forums']);
  assert.deepEqual(needsOf('recon_board_read', { source: 'telegram' }, kinds), ['social']);
  assert.deepEqual(needsOf('recon_web_read', { address: 'https://www.reuters.com/x' }, kinds), ['verified', 'news']);
  assert.deepEqual(needsOf('recon_archive_find', { address: 'old.reddit.com/r/x' }, kinds), ['forums'], 'an address without its scheme is judged too');
  assert.deepEqual(needsOf('recon_other_read', {}, kinds), ['other']);
  assert.equal(needsOf('recon_cite', {}, kinds), undefined);
  // "only Usenet and Tor"
  const usenetTor = ['tor', 'usenet'];
  assert.equal(untickedRefusal({ name: 'recon_onion_search', args: {}, ticks: usenetTor, kinds }), '');
  assert.equal(untickedRefusal({ name: 'recon_usenet_search', args: {}, ticks: usenetTor, kinds }), '');
  const no = untickedRefusal({ name: 'recon_web_search', args: {}, ticks: usenetTor, kinds });
  assert.ok(no.startsWith(UNTICKED));
  assert.match(no, /Nothing was sent\./);
  // "only Tor and verified sources"
  assert.equal(untickedRefusal({ name: 'recon_web_read', args: { address: 'https://www.reuters.com/x' }, ticks: ['verified', 'tor'], kinds }), '');
  assert.ok(untickedRefusal({ name: 'recon_web_read', args: { address: 'https://www.reddit.com/r/x' }, ticks: ['verified', 'tor'], kinds }).startsWith(UNTICKED));
  assert.equal(untickedRefusal({ name: 'recon_web_read', args: { address: 'https://www.reddit.com/r/x' }, ticks: undefined, kinds }), '', 'All: Recon as before');
  assert.equal(resultAllowed('https://www.reddit.com/r/x', ['verified'], kinds), false);
  assert.equal(resultAllowed('https://arxiv.org/abs/1', ['verified'], kinds), true);
  assert.ok(TOOLS.includes('recon_other_search') && MODE.tools.includes('recon_other_read'));
});

test('a tool refused for its tick did not run: nothing is counted as found', async () => {
  const tools = buildTools({
    enabled: () => true, inRecon: () => true, inRoom: () => true, gate: () => ({ ok: true }),
    onion: { search: async () => 'found' }, sources: openSources(), idOf: () => 'c1', ticks: () => ['usenet'], kinds,
  });
  const onion = tools.find((tool) => tool.name === 'recon_onion_search');
  const answer = await onion.execute({ query: 'x' }, { agent: { id: 'c1' } });
  assert.ok(answer.text.startsWith(UNTICKED));
  const history = [
    { role: 'assistant', content: [{ type: 'tool-call', id: 't1', name: 'recon_onion_search' }] },
    { role: 'tool', toolCallId: 't1', content: [{ type: 'text', text: answer.text }] },
  ];
  assert.equal([...answersOf(history)].length, 0);
});

test('web results of kinds that are not ticked are left out, and the answer says how many', async () => {
  const search = 'https://html.duckduckgo.com/html/?q=alias';
  const run = async (request) => (request.url === search
    ? { ok: true, status: 200, bytes: 10, links: [
      { url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.reuters.com%2Fa', text: 'Wire story' },
      { url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.reddit.com%2Fr%2Fx', text: 'Thread' },
    ] }
    : { ok: true, status: 404, links: [], bytes: 0 });
  const forward = async () => ({ port: 7000, how: 'wireguard', close: () => {} });
  const web = createClearnet({ run, forward, sources: openSources(), trail: openWebTrail(), sleep: async () => {}, allow: (id, url) => resultAllowed(url, ['verified'], kinds) });
  const found = await web.search('c1', 'alias');
  assert.match(found, /1 results; 1 more were left out because their kind is not ticked on the Web button\./);
  assert.match(found, /reuters\.com/);
  assert.doesNotMatch(found, /reddit\.com/);
});

test('the user\'s own sources: only through WireGuard; the login goes in the request, never in what the model reads; links stay on the source', async () => {
  const sent = [];
  let how = 'wireguard';
  const run = async (request) => {
    sent.push(request);
    if (request.url.endsWith('/search?q=alias')) return { ok: true, status: 302, redirect: '/results?q=alias' };
    if (request.url.endsWith('/results?q=alias')) return { ok: true, status: 200, title: 'Results', text: 'One hit. Signed in with made-up-key-55555.', links: [{ url: 'https://club.example.org/t/9', text: 'thread 9' }, { url: 'https://elsewhere.example/', text: 'away' }], bytes: 40 };
    if (request.url.endsWith('/away')) return { ok: true, status: 302, redirect: 'https://login.elsewhere.example/' };
    return { ok: true, status: 404, title: '', text: '', links: [], bytes: 0 };
  };
  const forward = async () => ({ port: 7000, how, close: () => {} });
  const sources = openSources();
  const clearnet = createClearnet({ run, forward, sources, trail: openWebTrail(), sleep: async () => {} });
  const request = async (name) => (name === 'Club'
    ? { name: 'Club', search: 'https://club.example.org/search?q={query}', start: '', headers: { 'x-api-key': 'made-up-key-55555' }, hide: ['made-up-key-55555'], hideHost: '' }
    : { error: `There is no source named "${name}" that may be used in Recon.` });
  const other = createReconOther({ fetch: clearnet.fetch, request, sources });
  const page = await other.search('c1', 'Club', 'alias');
  assert.equal(sent[0].headers['x-api-key'], 'made-up-key-55555', 'the login is sent');
  assert.equal(sent[0].tunnelOnly, undefined, 'the tunnel rule stays with Recon, not in the request');
  assert.match(page, /\[S1\] the user's own source "Club": https:\/\/club\.example\.org\/results\?q=alias/);
  assert.match(page, /Signed in with \[Club\]\./);
  assert.doesNotMatch(page, /made-up-key-55555/);
  assert.match(page, /- thread 9: \/t\/9/);
  assert.doesNotMatch(page, /elsewhere/);
  assert.match(await other.read('c1', 'Club', '/away'), /sent the request on to another site/);
  assert.match(await other.read('c1', 'Club', 'https://evil.example/x'), /not on this source's own site/);
  assert.match(await other.search('c1', 'Nope', 'x'), /no source named "Nope"/);
  how = 'direct';
  const before = sent.length;
  assert.match(await other.search('c1', 'Club', 'alias'), /only through WireGuard[\s\S]*Nothing was sent/);
  assert.equal(sent.length, before, 'nothing went out straight');
});

test('the locked process sends a login only on an encrypted connection through the forwarder, one line each', () => {
  assert.deepEqual(loginLines({ headers: { authorization: 'Basic abc', cookie: 'a=b' } }, true, true), ['authorization: Basic abc', 'cookie: a=b']);
  assert.deepEqual(loginLines({ headers: { authorization: 'Basic abc' } }, false, true), [], 'never through Tor');
  assert.deepEqual(loginLines({ headers: { authorization: 'Basic abc' } }, true, false), [], 'never unencrypted');
  assert.deepEqual(loginLines({ headers: { cookie: 'a=b\r\nHost: evil' , Host: 'x', 'bad name': 'y' } }, true, true), [], 'no line breaks, no Host, no odd names');
  assert.equal(scrubbed('key abc123 and abc123', ['abc123'], 'Club'), 'key [Club] and [Club]');
  assert.equal(linkOn('https://club.example.org/', '/a').url, 'https://club.example.org/a');
});

test('the status bar has a dot for Tor, Usenet, WireGuard, I2P (not set up yet) and each of your own sources allowed in Recon, with the reason on hover', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const start = source.indexOf('function barOf(');
  const body = source.slice(start, source.indexOf('\n    }\n', start) + 6);
  const barOf = new Function(`${body}\nreturn barOf;`)();
  const dot = (data, key) => barOf(data).pills.find((pill) => pill.key === key);
  const base = { tor: { path: '/opt/tor', state: 'ready' }, usenet: { route: 'direct', accounts: [{ id: 'a' }] }, conversation: { known: false } };
  assert.equal(dot(base, 'tor').state, 'ok');
  assert.equal(dot(base, 'usenet').state, 'ok');
  assert.equal(dot(base, 'wireguard').state, 'none', 'no configuration: grey');
  assert.match(dot(base, 'wireguard').title, /Settings → Recon → WireGuard/);
  assert.deepEqual([dot(base, 'i2p').state, dot(base, 'i2p').text], ['none', 'I2P not set up yet']);
  const tunnel = { ...base, vpn: { configs: [{ id: 'w1' }], status: { state: 'ready', name: 'Home' } } };
  assert.deepEqual([dot(tunnel, 'wireguard').state, dot(tunnel, 'wireguard').title], ['ok', 'Through Home.']);
  const failed = { ...base, vpn: { configs: [{ id: 'w1' }], status: { state: 'failed', tried: [{ name: 'Home', why: 'no answer' }] } } };
  assert.equal(dot(failed, 'wireguard').state, 'error');
  assert.match(dot(failed, 'wireguard').title, /Home: no answer/);
  const others = { ...tunnel, others: [
    { name: 'Club', kept: true, last: null },
    { name: 'Feed', kept: true, last: { ok: false, why: 'the source could not be reached' } },
    { name: 'Board', kept: false, last: null },
  ] };
  assert.equal(dot(others, 'other-Club').state, 'ok');
  assert.equal(dot(others, 'other-Feed').state, 'error');
  assert.match(dot(others, 'other-Feed').title, /could not be reached/);
  assert.equal(dot(others, 'other-Board').state, 'none');
  assert.match(dot(others, 'other-Board').title, /login is not kept yet/);
  assert.equal(dot({ ...others, vpn: { configs: [] } }, 'other-Club').state, 'none', 'no tunnel: your own sources cannot be read');
});

test('Recon remembers how the last read of each of your own sources went, without the login', async () => {
  const run = async () => ({ ok: false, why: 'the connection broke (made-up-key-777 rejected)' });
  const clearnet = createClearnet({ run, forward: async () => ({ port: 7000, how: 'wireguard', close: () => {} }), sources: openSources(), trail: openWebTrail(), sleep: async () => {} });
  const other = createReconOther({ fetch: clearnet.fetch, request: async () => ({ name: 'Club', search: '', start: 'https://club.example.org/', headers: {}, hide: ['made-up-key-777'], hideHost: '' }), sources: openSources() });
  assert.equal(other.last('Club'), undefined);
  await other.read('c1', 'Club', '/x');
  assert.equal(other.last('club').ok, false);
  assert.match(other.last('Club').why, /\[Club\] rejected/);
  assert.doesNotMatch(other.last('Club').why, /made-up-key-777/);
});
