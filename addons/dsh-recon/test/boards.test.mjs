/**
 * Back channels (lib/boards.js): each source's search and read, from stand-in answers shaped like the
 * services' own (checked against the live services on 16 November 2026). No network.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { ARCHIVES, SOURCES, createBoards, plainText } from '../lib/boards.js';
import { openWebTrail } from '../lib/clearnet.js';
import { openSources } from '../lib/sources.js';
import { partOf } from '../lib/restore.js';

/** The relay as a stand-in: answers by address; `how` says it went through WireGuard. */
function app(answers) {
  const asked = [];
  const fetch = async (_id, url, extra = {}) => {
    asked.push([url, extra.shape ?? 'page']);
    const answer = answers[url];
    if (answer === undefined) return { ok: true, status: 404, json: undefined, text: 'not found', how: 'wireguard' };
    if (answer.page) return { ok: true, status: 200, how: 'wireguard', ...answer.page };
    return { ok: true, status: answer.status ?? 200, json: answer, how: 'wireguard' };
  };
  const sources = openSources();
  const trail = openWebTrail();
  return { asked, sources, trail, boards: createBoards({ fetch, sources, trail }) };
}

test('plain text from a post\'s HTML', () => {
  assert.equal(plainText('<a href="#p1" class="quotelink">&gt;&gt;123</a><br>Hello &amp; <b>bye</b>'), '>>123\nHello & bye');
  assert.deepEqual(SOURCES, ['4chan', '4chan-archive', 'reddit', 'telegram', 'hackernews', 'lemmy', 'mastodon', 'github', 'breaches']);
});

test('4chan: a board\'s live threads searched by their subject and first post, then a thread read', async () => {
  const { boards, trail, sources } = app({
    'https://a.4cdn.org/int/catalog.json': [{ page: 1, threads: [{ no: 111, sub: 'Quiet alias thread', com: 'about the <b>alias</b>', name: 'Anonymous', now: '11/16/26(Mon)10:00', replies: 3 }, { no: 222, sub: 'Other', com: 'nothing', name: 'Anonymous', now: '', replies: 0 }] }],
    'https://a.4cdn.org/int/thread/111.json': { posts: [{ no: 111, name: 'Anonymous', now: 'x', sub: 'Quiet alias thread', com: 'first post' }, { no: 112, name: 'Anonymous', now: 'y', com: '<a>&gt;&gt;111</a><br>a reply naming the old handle' }] },
  });
  assert.match(await boards.search('c1', { source: '4chan' }), /Name a 4chan board/);
  const found = await boards.search('c1', { source: '4chan', board: 'int', query: 'alias' });
  assert.match(found, /Live \/int\/ threads matching "alias", retrieved \S+ \(UTC\) through WireGuard\. 1 found\./);
  assert.match(found, /https:\/\/boards\.4chan\.org\/int\/thread\/111\n   read with: source 4chan, board int, id 111/);
  assert.doesNotMatch(found, /thread\/222/);
  assert.equal(trail.has('c1', 'https://boards.4chan.org/int/thread/111'), true);
  assert.match(await boards.read('c1', { source: '4chan', board: 'int', id: '222' }), /was not shown in this conversation/);
  const thread = await boards.read('c1', { source: '4chan', board: 'int', id: '111' });
  assert.match(thread, /^\[S1\] https:\/\/boards\.4chan\.org\/int\/thread\/111\nRetrieved \S+ \(UTC\) through WireGuard\./);
  assert.match(thread, /No\. 112 \| Anonymous \| y\n>>111\na reply naming the old handle/);
  assert.equal(sources.list('c1').length, 1);
  assert.equal(partOf('recon_board_read', thread).url, 'https://boards.4chan.org/int/thread/111', 'it comes back after a restart');
});

test('4chan archives: every archive searched, one not answering is named; a thread read from the one that listed it', async () => {
  const post = (board, thread, num) => ({ num: String(num), thread_num: String(thread), timestamp: 1791505992, name: 'Anonymous', title: null, comment: 'the old handle again', board: { shortname: board } });
  const { boards } = app({
    'https://desuarchive.org/_/api/chan/search/?text=old%20handle': { 0: { posts: [post('a', 291498366, 291508052)] } },
    'https://archive.palanq.win/_/api/chan/search/?text=old%20handle': { 0: { posts: [post('bant', 25140011, 25143816)] } },
    'https://archive.palanq.win/_/api/chan/thread/?board=bant&num=25140011': { 25140011: { op: { num: '25140011', name: 'Anonymous', timestamp: 1791477850, title: 'The thread', comment: 'opening post' }, posts: { 25143816: { num: '25143816', name: 'Anonymous', timestamp: 1791525567, comment: 'the old handle again' } } } },
  });
  const found = await boards.search('c1', { source: '4chan-archive', query: 'old handle' });
  assert.match(found, /not answering: b4k: arch\.b4k\.dev answered with status 404/);
  assert.match(found, /https:\/\/desuarchive\.org\/a\/thread\/291498366\//);
  assert.match(found, /read with: source 4chan-archive, archive palanq, board bant, id 25140011/);
  const thread = await boards.read('c1', { source: '4chan-archive', archive: 'palanq', board: 'bant', id: '25140011' });
  assert.match(thread, /No\. 25140011 \| Anonymous \| [\dT:-]+Z \| The thread\nopening post/);
  assert.match(thread, /No\. 25143816 \| Anonymous \| 2026-\d\d-\d\dT[\d:]+Z\nthe old handle again/);
  assert.deepEqual(ARCHIVES.map((one) => one.id), ['desuarchive', 'b4k', 'palanq']);
});

test('Reddit: words through PullPush, a subreddit or author through Arctic Shift; a post read with its comments', async () => {
  const { boards, trail } = app({
    'https://api.pullpush.io/reddit/search/submission/?q=old%20handle&size=25': { data: [{ id: 'abc12', title: 'Who is behind the old handle?', author: 'someone', subreddit: 'OSINT', created_utc: 1791000000, num_comments: 2, selftext: 'Asking around.', permalink: '/r/OSINT/comments/abc12/who_is/' }] },
    'https://arctic-shift.photon-reddit.com/api/posts/search?subreddit=OSINT&query=handle&limit=25': { data: [] },
    'https://api.pullpush.io/reddit/search/submission/?ids=abc12': { data: [{ id: 'abc12', title: 'Who is behind the old handle?', author: 'someone', subreddit: 'OSINT', created_utc: 1791000000, selftext: 'Asking around.', permalink: '/r/OSINT/comments/abc12/who_is/', url: 'https://example.org/evidence' }] },
    'https://api.pullpush.io/reddit/search/comment/?link_id=abc12&size=100': { data: [{ author: 'reply1', created_utc: 1791000100, body: 'It was the same person as the forum admin.' }] },
  });
  const found = await boards.search('c1', { source: 'reddit', query: 'old handle' });
  assert.match(found, /Reddit posts for "old handle" \(PullPush\)/);
  assert.match(found, /read with: source reddit, id abc12/);
  assert.match(await boards.search('c1', { source: 'reddit', subreddit: 'OSINT', query: 'handle' }), /Nothing found: Reddit posts in r\/OSINT for "handle" \(Arctic Shift\)/);
  const post = await boards.read('c1', { source: 'reddit', id: 'abc12' });
  assert.match(post, /u\/reply1 \| [\dT:-]+Z\nIt was the same person as the forum admin\./);
  assert.equal(trail.has('c1', 'https://example.org/evidence'), true, 'the post\'s own link may be read next');
});

test('Telegram: a public channel read by name, searched inside; no search across channels', async () => {
  const { boards, trail } = app({ 'https://t.me/s/somechannel?q=handle': { page: { title: 'Some Channel – Telegram', text: 'Post 1: the handle appears here.', links: [{ url: 'https://example.net/post', text: 'link' }] } } });
  assert.match(await boards.search('c1', { source: 'telegram', query: 'x' }), /no public search across channels/);
  // Only a channel the conversation was shown.
  assert.match(await boards.read('c1', { source: 'telegram', id: 'somechannel', query: 'handle' }), /was not shown in this conversation/);
  trail.add('c1', ['https://t.me/somechannel']);
  const read = await boards.read('c1', { source: 'telegram', id: '@somechannel', query: 'handle' });
  assert.match(read, /^\[S1\] https:\/\/t\.me\/s\/somechannel\?q=handle/);
  assert.match(read, /the handle appears here/);
  assert.equal(trail.has('c1', 'https://example.net/post'), true);
  assert.match(await boards.read('c1', { source: 'telegram', id: 'x' }), /public channel's name/);
});

test('Hacker News, Lemmy, Mastodon, GitHub and known breaches: searched; Hacker News and Lemmy read', async () => {
  const { boards } = app({
    'https://hn.algolia.com/api/v1/search?query=old%20handle&hitsPerPage=25': { hits: [{ objectID: '42', title: 'Show HN: a tool', author: 'pg', created_at: '2026-01-01T00:00:00Z', num_comments: 1 }] },
    'https://hn.algolia.com/api/v1/items/42': { author: 'pg', created_at: '2026-01-01T00:00:00Z', title: 'Show HN: a tool', url: 'https://tool.example.com/', children: [{ author: 'dang', created_at: '2026-01-02T00:00:00Z', text: '<p>Nice', children: [] }] },
    'https://lemmy.world/api/v3/search?q=old%20handle&type_=All&limit=25': { posts: [{ post: { id: 7, name: 'A post', body: 'b', published: '2026' }, creator: { name: 'u1' }, community: { name: 'privacy' } }], comments: [] },
    'https://mastodon.social/api/v1/timelines/tag/wireguard?limit=40': [{ url: 'https://mastodon.social/@a/1', content: '<p>Tunnel up</p>', account: { acct: 'a' }, created_at: '2026' }],
    'https://api.github.com/search/issues?q=old%20handle&per_page=25': { items: [{ html_url: 'https://github.com/o/r/issues/1', title: 'Issue', user: { login: 'dev' }, created_at: '2026', comments: 0, body: 'text' }] },
    'https://haveibeenpwned.com/api/v3/breaches?domain=adobe.com': [{ Name: 'Adobe', Title: 'Adobe', Domain: 'adobe.com', BreachDate: '2013-10-04', PwnCount: 152445165, DataClasses: ['Email addresses', 'Passwords'], Description: 'In <a>October 2013</a>...' }],
  });
  assert.match(await boards.search('c1', { source: 'hackernews', query: 'old handle' }), /news\.ycombinator\.com\/item\?id=42/);
  const hn = await boards.read('c1', { source: 'hackernews', id: '42' });
  assert.match(hn, /dang \| 2026-01-02T00:00:00Z\nNice/);
  assert.match(await boards.search('c1', { source: 'lemmy', query: 'old handle' }), /https:\/\/lemmy\.world\/post\/7/);
  assert.match(await boards.search('c1', { source: 'mastodon', query: 'two words' }), /by hashtag/);
  assert.match(await boards.search('c1', { source: 'mastodon', query: '#wireguard' }), /Tunnel up/);
  assert.match(await boards.search('c1', { source: 'github', query: 'old handle' }), /github\.com\/o\/r\/issues\/1/);
  assert.match(await boards.search('c1', { source: 'breaches', query: 'adobe.com' }), /152,445,165 accounts, data: Email addresses, Passwords/);
  assert.match(await boards.read('c1', { source: 'github', id: '1' }), /nothing more to read than what its search shows/);
});

test('the filter refuses a search before anything is sent; unknown sources and the switch say so', async () => {
  const { boards, asked } = app({});
  assert.match(await boards.search('c1', { source: 'reddit', query: 'child porn' }), /refused by the filter and was not sent/);
  assert.equal(asked.length, 0);
  assert.match(await boards.search('c1', { source: 'myspace', query: 'x' }), /Unknown source/);
  const off = createBoards({ fetch: async () => ({}), sources: openSources(), trail: openWebTrail(), on: () => false });
  assert.match(await off.search('c1', { source: 'reddit', query: 'x' }), /switched off/);
});

test('Reddit: a post found through a comment search can be read; an id that was not shown is refused before anything is sent', async () => {
  const { boards, asked } = app({
    'https://api.pullpush.io/reddit/search/comment/?q=old%20handle&size=25': { data: [{ author: 'r1', body: 'Same person, see the thread', subreddit: 'OSINT', created_utc: 1791000000, link_id: 't3_xyz99', permalink: '/r/OSINT/comments/xyz99/t/c1/' }] },
    'https://api.pullpush.io/reddit/search/submission/?ids=xyz99': { data: [{ id: 'xyz99', title: 'The thread', author: 'op', subreddit: 'OSINT', created_utc: 1791000000, selftext: '', permalink: '/r/OSINT/comments/xyz99/the_thread/' }] },
    'https://api.pullpush.io/reddit/search/comment/?link_id=xyz99&size=100': { data: [] },
  });
  const before = asked.length;
  assert.match(await boards.read('c1', { source: 'reddit', id: 'zzz11' }), /was not shown in this conversation/);
  assert.equal(asked.length, before, 'nothing was sent for it');
  assert.match(await boards.search('c1', { source: 'reddit', query: 'old handle', kind: 'comments' }), /read with: source reddit, id xyz99/);
  assert.match(await boards.read('c1', { source: 'reddit', id: 'xyz99' }), /^\[S1\] https:\/\/www\.reddit\.com\/r\/OSINT\/comments\/xyz99\/the_thread\//);
});
