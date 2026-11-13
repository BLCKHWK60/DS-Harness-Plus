import assert from 'node:assert/strict';
import test, { afterEach } from 'node:test';
import { forget, gdeltQuery, hooks, newsArticles, newsTimeline, priceHistory, socialPosts } from '../lib/feeds.js';
import { buildMarketTools, priceFacts } from '../lib/market.js';
import { byDay, split, tone } from '../lib/mood.js';
import { METHOD } from '../lib/finance.js';

const real = { ...hooks };
afterEach(() => { Object.assign(hooks, real); forget(); });

/** Answers by address; records what was asked and how long was waited. */
function fake(answers) {
  const asked = [];
  const waits = [];
  let clock = 1_800_000_000_000;
  hooks.now = () => clock;
  hooks.wait = async (ms) => { waits.push(ms); clock += ms; };
  hooks.get = async (url) => {
    asked.push(url);
    const hit = Object.entries(answers).find(([part]) => url.includes(part));
    if (!hit) return { status: 404, body: '' };
    const value = typeof hit[1] === 'function' ? hit[1](url) : hit[1];
    return typeof value === 'number' ? { status: value, body: '' } : { status: 200, body: JSON.stringify(value) };
  };
  return { asked, waits };
}

test('word tone: counts words, turns around after "not", and is 0 without any', () => {
  assert.equal(tone('Record profit and strong growth'), 1);
  assert.equal(tone('Shares plunge after fraud probe'), -1);
  assert.equal(tone('Results were not good'), -1);
  assert.equal(tone('The company held a meeting'), 0);
  assert.equal(tone('Strong sales but a lawsuit'), 0);
  assert.deepEqual(split([{ text: 'great' }, { text: 'crash' }, { text: 'meeting' }]), { positive: 1, negative: 1, neutral: 1 });
  assert.deepEqual(byDay([{ date: '2026-01-02', text: 'great' }, { date: '2026-01-01', text: 'crash' }, { date: '2026-01-02', text: 'x' }]), [{ date: '2026-01-01', posts: 1, tone: -1 }, { date: '2026-01-02', posts: 2, tone: 0.5 }]);
});

test('price facts: change, extremes, deepest fall', () => {
  const facts = priceFacts([{ date: 'a', close: 100 }, { date: 'b', close: 120 }, { date: 'c', close: 90 }, { date: 'd', close: 110 }]);
  assert.equal(Math.round(facts.change), 10);
  assert.equal(facts.high.date, 'b');
  assert.equal(facts.low.date, 'c');
  assert.equal(Math.round(facts.fall), -25);
  assert.ok(facts.swing > 0);
});

test('prices: reads closes, skips gaps, weekly for long ranges, refuses odd symbols', async () => {
  const { asked } = fake({ '/chart/NVDA': { chart: { result: [{ meta: { currency: 'USD', longName: 'NVIDIA Corporation', fullExchangeName: 'NasdaqGS' }, timestamp: [1793975400, 1794234600, 1794321000], indicators: { quote: [{ close: [186.64, null, 168.89] }] } }] } } });
  const got = await priceHistory('nvda', '5y');
  assert.equal(got.name, 'NVIDIA Corporation');
  assert.equal(got.weekly, true);
  assert.deepEqual(got.points.map((p) => p.close), [186.64, 168.89]);
  assert.match(got.points[0].date, /^2026-11-\d\d$/);
  assert.match(asked[0], /range=5y&interval=1wk/);
  await assert.rejects(priceHistory('NV DA; rm', '1y'), /not a ticker symbol/);
  await assert.rejects(priceHistory('NOPE', '1y'), /nothing under that name/);
});

test('news: one phrase for a name, English by default in the tool, one request every 5.5 seconds', async () => {
  assert.equal(gdeltQuery('euro area inflation', { language: 'English', country: 'United States' }), '"euro area inflation" sourcelang:english sourcecountry:unitedstates');
  assert.equal(gdeltQuery('Nvidia', { language: 'all' }), 'Nvidia');
  assert.throws(() => gdeltQuery('a'), /at least three letters/);
  const { asked, waits } = fake({
    'mode=artlist': { articles: [{ url: 'https://a.example/1', title: 'One  thing', seendate: '20261112T231500Z', domain: 'a.example', sourcecountry: 'Japan', language: 'English' }, { url: 'https://b.example/2', title: 'one thing', seendate: '20261112T000000Z', domain: 'b.example' }, { url: 'javascript:x', title: 'bad' }] },
    'mode=timelinevolraw': { timeline: [{ series: 'Article Count', data: [{ date: '20261110T000000Z', value: 5 }, { date: '20261110T120000Z', value: 7 }, { date: '20261111T000000Z', value: 3 }] }] },
    'mode=timelinetone': { timeline: [{ series: 'Average Tone', data: [{ date: '20261110T000000Z', value: -2 }, { date: '20261110T120000Z', value: -1 }] }] },
  });
  const articles = await newsArticles('Nvidia', { days: 7, limit: 10 });
  assert.deepEqual(articles, [{ title: 'One thing', url: 'https://a.example/1', source: 'a.example', date: '2026-11-12', country: 'Japan', language: 'English' }]);
  const rows = await newsTimeline('Nvidia', { days: 30 });
  assert.deepEqual(rows, [{ date: '2026-11-10', articles: 12, tone: -1.5 }, { date: '2026-11-11', articles: 3, tone: null }]);
  assert.equal(asked.length, 3);
  assert.deepEqual(waits, [5500, 5500]);
});

test('news: a "too many requests" answer is said plainly and not retried', async () => {
  const { asked } = fake({ 'gdeltproject': 429 });
  await assert.rejects(newsArticles('Nvidia'), /asking for fewer requests/);
  assert.equal(asked.length, 1);
});

test('social: three networks, newest first, bots and old posts left out, a silent network is named', async () => {
  const now = 1_800_000_000_000;
  const iso = (daysAgo) => new Date(now - daysAgo * 86400000).toISOString();
  fake({
    'hn.algolia.com': { hits: [{ title: 'Great <em>launch</em>', created_at: iso(1), objectID: '42', points: 7, num_comments: 3 }] },
    'mastodon.social': [{ content: '<p>Bad &amp; worse</p>', created_at: iso(2), url: 'https://m.example/1', favourites_count: 2, reblogs_count: 1, replies_count: 0 }, { content: '<p>old</p>', created_at: iso(40), url: 'https://m.example/2' }],
    'lemmy.world': 500,
  });
  const { posts, all, failed } = await socialPosts('Acme Corp', { days: 14, limit: 1 });
  assert.equal(posts.length, 1);
  assert.deepEqual(all.map((p) => [p.network, p.text, p.score, p.replies]), [['Hacker News', 'Great launch', 7, 3], ['Mastodon', 'Bad & worse', 3, 0]]);
  assert.equal(all[0].url, 'https://news.ycombinator.com/item?id=42');
  assert.match(failed[0], /^Lemmy \(Lemmy answered 500\)/);
});

test('the tools: text with source and date, a chart per series, a plain way out when a service fails', async () => {
  const stamps = Array.from({ length: 30 }, (_, i) => 1790000000 + i * 86400);
  fake({
    '/chart/AAA': { chart: { result: [{ meta: { currency: 'USD', longName: 'Triple A' }, timestamp: stamps, indicators: { quote: [{ close: stamps.map((_, i) => 100 + i) }] } }] } },
    '/chart/BBB': { chart: { result: [{ meta: { currency: 'EUR', longName: 'Triple B' }, timestamp: stamps, indicators: { quote: [{ close: stamps.map((_, i) => 50 - i * 0.5) }] } }] } },
    'hn.algolia.com': { hits: [] },
    'mastodon.social': [],
    'lemmy.world': { posts: [] },
  });
  const charts = [];
  let on = true;
  const tools = Object.fromEntries(buildMarketTools({ enabled: () => on, show: (_exec, picture) => { charts.push(picture); return { ok: true }; } }).map((tool) => [tool.name, tool]));
  assert.deepEqual(Object.keys(tools), ['finance_prices', 'finance_news', 'finance_social']);
  const two = (await tools.finance_prices.execute({ symbols: ['AAA', 'BBB', 'ZZZ'], range: '1mo' }, {})).text;
  assert.match(two, /^Prices from Yahoo Finance \(public chart data, daily closes, range 1mo\), fetched \d{4}-\d\d-\d\d\./);
  assert.match(two, /Triple A \(AAA\), in USD:\n- 100 on \S+ → 129 on \S+: \+29%/);
  assert.match(two, /Not found: ZZZ:/);
  assert.equal(charts[0].description.series.length, 2);
  assert.equal(charts[0].description.series[0].points[0][1], 100);
  assert.match(charts[0].description.series[0].points[0][0], /^\d{4}-\d\d-\d\d$/);
  const one = (await tools.finance_prices.execute({ symbols: ['AAA'] }, {})).text;
  assert.match(one, /Chart "Triple A \(AAA\), 1y": shown to the user/);
  assert.equal(charts[1].description.yLabel, 'USD');
  assert.match((await tools.finance_prices.execute({ symbols: ['ZZZ'] }, {})).text, /nothing under that name\. Use web search for the price instead/);
  assert.match((await tools.finance_social.execute({ query: 'Acme' }, {})).text, /No posts were found on these networks/);
  assert.match((await tools.finance_news.execute({ query: 'Acme' }, {})).text, /Use web search for the news instead/);
  on = false;
  assert.equal((await tools.finance_news.execute({ query: 'Acme' }, {})).text, 'Finance is switched off in Settings → Finance.');
});

test('the method names the new tools and still fits the Modes limit', () => {
  assert.ok(METHOD.length < 4000, String(METHOD.length));
  for (const word of ['finance_prices', 'finance_news', 'finance_social', 'Match the question']) assert.ok(METHOD.includes(word), word);
});
