/**
 * The ordinary web in Recon (lib/clearnet.js): addresses, the trail of shown addresses, results from
 * the engines' pages, searching with fallback, reading with redirects, and nothing sent without the
 * tunnel or the user's say-so. No network: the locked process and the relay are stand-ins.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ENGINES, createClearnet, openWebTrail, resultsFrom, webAddress } from '../lib/clearnet.js';
import { openSources } from '../lib/sources.js';
import { partOf } from '../lib/restore.js';

test('a web address: read over https, no login, no fragment, not .onion', () => {
  assert.deepEqual(webAddress('http://Example.com:80/a?b=1#top'), { ok: true, url: 'https://example.com/a?b=1', host: 'example.com', port: 443 });
  assert.equal(webAddress('https://user:pw@example.com/').ok, false);
  assert.match(webAddress('http://abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuvwx.onion/').why, /recon_onion_read/);
  assert.equal(webAddress('ftp://example.com/').ok, false);
  assert.equal(webAddress('https://localhost/').ok, false, 'no site name');
  assert.equal(webAddress('https://192.168.1.1/admin').ok, false, 'no bare number address');
  assert.equal(webAddress('https://example.com:8443/x').port, 8443, 'its own port is kept');
});

test('the trail: only addresses shown, and the bare front page of a site among them', () => {
  const trail = openWebTrail();
  trail.add('c1', ['https://forum.example.org/t/123?page=2', 'not a url']);
  assert.equal(trail.has('c1', 'http://forum.example.org/t/123?page=2'), true, 'the same address over http counts');
  assert.equal(trail.has('c1', 'https://forum.example.org/'), true, 'its front page');
  assert.equal(trail.has('c1', 'https://forum.example.org/t/124'), false, 'not another page of it');
  assert.equal(trail.has('c1', 'https://evil.example.net/?leak=findings'), false, 'not an address built by the model');
  assert.equal(trail.has('c2', 'https://forum.example.org/t/123?page=2'), false, 'not another thread');
  trail.forget('c1');
  assert.equal(trail.has('c1', 'https://forum.example.org/'), false);
  // Full: the oldest go, the newest stay readable.
  const busy = openWebTrail();
  busy.add('c1', Array.from({ length: 8100 }, (_, n) => `https://site${n}.example.com/p`));
  assert.equal(busy.has('c1', 'https://site8099.example.com/p'), true);
  assert.equal(busy.has('c1', 'https://site0.example.com/p'), false);
});

test('results from the engines\' pages: DuckDuckGo\'s own links unwrapped, engine links left out, title then description', () => {
  const ddg = resultsFrom('duckduckgo', [
    { url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fboards.example.org%2Fthread%2F9&rut=x', text: 'A thread title' },
    { url: 'https://duckduckgo.com/l/?uddg=https%3A%2F%2Fboards.example.org%2Fthread%2F9&rut=x', text: 'The snippet under it' },
    { url: 'https://duckduckgo.com/html/?q=next', text: 'Next page' },
  ]);
  assert.deepEqual(ddg, [{ url: 'https://boards.example.org/thread/9', title: 'A thread title', description: 'The snippet under it' }]);
  const mojeek = resultsFrom('mojeek', [{ url: 'https://www.mojeek.com/about', text: 'About' }, { url: 'https://blog.example.com/post', text: 'A post' }, { url: 'https://blog.example.com/post', text: 'A post' }]);
  assert.deepEqual(mojeek, [{ url: 'https://blog.example.com/post', title: 'A post', description: '' }]);
  assert.deepEqual(ENGINES.map((one) => one.id), ['duckduckgo', 'mojeek', 'marginalia']);
});

/** The relay and the locked process, as stand-ins: pages by address. */
function world({ pages, blocked = false }) {
  const asked = [];
  const forward = async (host, port, id) => {
    if (blocked) throw new Error('No WireGuard configuration is set up. Nothing was sent.');
    asked.push(['forward', host, port, id]);
    return { port: 7000, how: 'wireguard', close: () => asked.push(['close', host]) };
  };
  const run = async (request) => {
    asked.push(['get', request.url, request.via, request.links]);
    return pages[request.url] ?? { ok: true, status: 404, title: 'Not found', text: 'nothing', links: [], bytes: 7 };
  };
  return { asked, forward, run };
}

test('a search goes through the tunnel; an engine that gives nothing passes to the next; the results are shown and may then be read', async () => {
  const search = 'https://html.duckduckgo.com/html/?q=quiet%20forum%20alias';
  const fallback = 'https://www.mojeek.com/search?q=quiet%20forum%20alias';
  const { asked, forward, run } = world({ pages: {
    [search]: { ok: true, status: 200, links: [], bytes: 10 },
    [fallback]: { ok: true, status: 200, links: [{ url: 'https://boards.example.org/thread/9', text: 'Thread about the alias' }], bytes: 10 },
    'https://boards.example.org/thread/9': { ok: true, status: 301, redirect: '/thread/9/full' },
    'https://boards.example.org/thread/9/full': { ok: true, status: 200, title: 'Thread', text: 'Users discuss the alias and its old name.', links: [{ url: 'https://other.example.net/profile', text: 'profile' }], bytes: 41 },
  } });
  const sources = openSources();
  const trail = openWebTrail();
  const web = createClearnet({ run, forward, sources, trail, sleep: async () => {} });
  const found = await web.search('c1', 'quiet forum alias');
  assert.match(found, /^Web search "quiet forum alias" on mojeek, retrieved \S+ \(UTC\) through WireGuard\. 1 results\. Tried first: duckduckgo: no results/);
  assert.match(found, /https:\/\/boards\.example\.org\/thread\/9/);
  assert.ok(asked.some((entry) => entry[0] === 'get' && entry[2] === 'forward' && entry[3] === 'web'), 'through the relay, with web links kept');
  const page = await web.read('c1', 'https://boards.example.org/thread/9');
  assert.match(page, /^\[S1\] https:\/\/boards\.example\.org\/thread\/9\/full\nRetrieved \S+ \(UTC\) through WireGuard\./);
  assert.match(page, /Users discuss the alias/);
  assert.equal(trail.has('c1', 'https://other.example.net/profile'), true, 'a link on the page may be read next');
  // What a restart rebuilds from that answer.
  const back = partOf('recon_web_read', page);
  assert.equal(back.url, 'https://boards.example.org/thread/9/full');
  assert.equal(back.via, 'wireguard');
  assert.equal(back.n, 1);
  // An address the conversation was not shown is not opened.
  assert.match(await web.read('c1', 'https://evil.example.net/?q=secret'), /was not shown in this thread/);
});

test('no tunnel and no permission: nothing is sent, and the tool says so; the ordinary web switched off says so too', async () => {
  const { asked, forward, run } = world({ pages: {}, blocked: true });
  const web = createClearnet({ run, forward, sources: openSources(), trail: openWebTrail(), sleep: async () => {} });
  await assert.rejects(web.search('c1', 'anything'), /No WireGuard configuration is set up\. Nothing was sent\./);
  assert.equal(asked.length, 0);
  const off = createClearnet({ run, forward, sources: openSources(), trail: openWebTrail(), on: () => false });
  assert.match(await off.search('c1', 'anything'), /switched off/);
});

test('the filter: a refused search is not sent', async () => {
  const { asked, forward, run } = world({ pages: {} });
  const web = createClearnet({ run, forward, sources: openSources(), trail: openWebTrail(), sleep: async () => {} });
  assert.match(await web.search('c1', 'child porn'), /refused by the filter and was not sent/);
  assert.equal(asked.length, 0);
});
