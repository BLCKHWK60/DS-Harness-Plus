/**
 * News, social media and prices from services that need no key and allow this use:
 *   GDELT            worldwide news coverage: articles, how much, and its tone over time
 *   Hacker News      technology and business community (stories with points and comments)
 *   Mastodon         public posts under a hashtag (mastodon.social)
 *   Lemmy            public community posts (lemmy.world)
 *   Yahoo Finance    daily prices of shares, indices, currencies and crypto (a public chart address,
 *                    not an official service: it can change or stop)
 * X (Twitter), Reddit and StockTwits refuse readers without an account, so they are not here; the
 * assistant reaches them through web search only.
 */
import https from 'node:https';
import { AGENT } from './data.js';

const BODY_MAX = 12 * 1024 * 1024;
export const KEEP_MS = 5 * 60 * 1000;

/** The network; replaceable by tests. */
export const hooks = {
  /**
   * @param {string} url - an https address.
   * @param {number} timeout - how long to wait.
   * @returns {Promise<{status: number, body: string}>} the answer as text, whatever its status.
   */
  get(url, timeout = 15000) {
    return new Promise((done, fail) => {
      const request = https.get(url, { headers: { 'user-agent': AGENT, accept: 'application/json' }, timeout, family: 4 }, (response) => {
        let size = 0;
        const chunks = [];
        response.on('data', (chunk) => {
          size += chunk.length;
          if (size > BODY_MAX) request.destroy(new Error('the answer was too large'));
          else chunks.push(chunk);
        });
        response.on('end', () => done({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
        response.on('error', fail);
      });
      request.on('timeout', () => request.destroy(new Error('the service did not answer in time')));
      request.on('error', fail);
    });
  },
  now: () => Date.now(),
  wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

const cache = new Map();
/** Forget kept answers (for tests). */
export const forget = () => {
  cache.clear();
  gdeltFree = 0;
};

async function json(url, name, timeout) {
  const kept = cache.get(url);
  if (kept && hooks.now() - kept.at < KEEP_MS) return kept.value;
  const answer = await hooks.get(url, timeout);
  if (answer.status === 429) throw new Error(`${name} is asking for fewer requests right now. Wait a minute before trying it again`);
  if (answer.status === 404) throw new Error(`${name} has nothing under that name`);
  if (answer.status !== 200) throw new Error(`${name} answered ${answer.status}`);
  let value;
  try {
    value = JSON.parse(answer.body);
  } catch {
    throw new Error(`${name} gave an answer that could not be read`);
  }
  cache.set(url, { at: hooks.now(), value });
  while (cache.size > 60) cache.delete(cache.keys().next().value);
  return value;
}

const plainText = (html) => String(html ?? '').replace(/<br\s*\/?>|<\/p>/gi, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const day = (value) => {
  const at = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(at) ? new Date(at).toISOString().slice(0, 10) : '';
};

// ---- GDELT: news ------------------------------------------------------------------------------

/** GDELT allows one request every five seconds. */
let gdeltFree = 0;
async function gdelt(params) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${new URLSearchParams({ ...params, format: 'json' })}`;
  if (cache.has(url) && hooks.now() - cache.get(url).at < KEEP_MS) return cache.get(url).value;
  const wait = gdeltFree - hooks.now();
  gdeltFree = Math.max(hooks.now(), gdeltFree) + 5500;
  if (wait > 0) await hooks.wait(wait);
  try {
    return await json(url, 'The news service (GDELT)', 30000);
  } catch (error) {
    // It often drops a connection and answers the second time. A plain "too many requests" is not retried.
    if (/fewer requests|answered \d+|nothing under/.test(String(error?.message))) throw error;
    const again = gdeltFree - hooks.now();
    gdeltFree = Math.max(hooks.now(), gdeltFree) + 5500;
    await hooks.wait(Math.max(0, again));
    return json(url, 'The news service (GDELT)', 30000);
  }
}
const gdeltDate = (text) => {
  const found = /^(\d{4})(\d{2})(\d{2})/.exec(String(text ?? ''));
  return found ? `${found[1]}-${found[2]}-${found[3]}` : '';
};
/** The words as GDELT wants them: a name of several words is one phrase. */
export function gdeltQuery(query, { language, country } = {}) {
  const words = String(query ?? '').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (words.length < 3) throw new Error('Give at least three letters to search the news for');
  const parts = [/\s/.test(words) && !/\b(OR|AND)\b/.test(words) ? `"${words}"` : words];
  if (language && String(language).toLowerCase() !== 'all') parts.push(`sourcelang:${String(language).toLowerCase().replace(/[^a-z]/g, '')}`);
  if (country) parts.push(`sourcecountry:${String(country).toLowerCase().replace(/[^a-z]/g, '')}`);
  return parts.join(' ');
}

/**
 * Recent articles about something.
 * @returns {Promise<{title: string, url: string, source: string, date: string, country: string, language: string}[]>} newest first.
 */
export async function newsArticles(query, { days = 7, limit = 20, language, country } = {}) {
  const data = await gdelt({ query: gdeltQuery(query, { language, country }), mode: 'artlist', maxrecords: String(Math.min(75, Math.max(1, limit))), timespan: `${Math.min(90, Math.max(1, days))}d`, sort: 'datedesc' });
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(data?.articles) ? data.articles : []) {
    const title = plainText(item?.title).slice(0, 220);
    const key = title.toLowerCase();
    if (!title || !/^https?:\/\//.test(String(item?.url)) || seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url: String(item.url), source: String(item.domain ?? ''), date: gdeltDate(item.seendate), country: String(item.sourcecountry ?? ''), language: String(item.language ?? '') });
  }
  return out;
}

/**
 * How much was written about something each day, and in what tone.
 * @returns {Promise<{date: string, articles: number, tone: number | null}[]>} oldest first. Tone runs from about -10 (very negative) to +10 (very positive); most news sits between -3 and +3.
 */
export async function newsTimeline(query, { days = 30, language, country } = {}) {
  const base = { query: gdeltQuery(query, { language, country }), timespan: `${Math.min(365, Math.max(7, days))}d` };
  const series = (data) => {
    const rows = new Map();
    for (const point of data?.timeline?.[0]?.data ?? []) {
      const date = gdeltDate(point?.date);
      if (!date || !Number.isFinite(Number(point?.value))) continue;
      const entry = rows.get(date) ?? { sum: 0, n: 0 };
      entry.sum += Number(point.value);
      entry.n += 1;
      rows.set(date, entry);
    }
    return rows;
  };
  const volume = series(await gdelt({ ...base, mode: 'timelinevolraw' }));
  let tone = new Map();
  try {
    tone = series(await gdelt({ ...base, mode: 'timelinetone' }));
  } catch {
    tone = new Map();
  }
  return [...volume.keys()].sort().map((date) => ({ date, articles: Math.round(volume.get(date).sum), tone: tone.has(date) ? Math.round((tone.get(date).sum / tone.get(date).n) * 100) / 100 : null }));
}

// ---- social media -------------------------------------------------------------------------------

/**
 * Public posts about something, from the networks that can be read without an account.
 * @returns {Promise<{posts: object[], all: object[], failed: string[]}>} the newest `limit` posts ({network, date, text, url, score, replies}), every post found, and the networks that did not answer.
 */
export async function socialPosts(query, { days = 14, limit = 40 } = {}) {
  const words = String(query ?? '').replace(/\s+/g, ' ').trim().slice(0, 100);
  if (words.length < 2) throw new Error('Give a name or a word to look for');
  const since = Math.floor((hooks.now() - Math.min(90, Math.max(1, days)) * 86400000) / 1000);
  // More than is listed, so the count per day rests on as much as the networks give.
  const each = 50;
  const tag = words.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 40);
  const tasks = {
    'Hacker News': async () => {
      const data = await json(`https://hn.algolia.com/api/v1/search_by_date?${new URLSearchParams({ query: words, tags: 'story', hitsPerPage: '100', numericFilters: `created_at_i>${since}` })}`, 'Hacker News');
      return (data?.hits ?? []).map((hit) => ({ network: 'Hacker News', date: day(hit.created_at), text: plainText(hit.title).slice(0, 300), url: `https://news.ycombinator.com/item?id=${hit.objectID}`, score: Number(hit.points) || 0, replies: Number(hit.num_comments) || 0 }));
    },
    Mastodon: async () => {
      if (!tag) return [];
      const data = await json(`https://mastodon.social/api/v1/timelines/tag/${encodeURIComponent(tag)}?limit=40`, 'Mastodon');
      return (Array.isArray(data) ? data : []).filter((post) => Date.parse(post?.created_at) / 1000 > since).map((post) => ({ network: 'Mastodon', date: day(post.created_at), text: plainText(post.content).slice(0, 300), url: String(post.url ?? ''), score: (Number(post.favourites_count) || 0) + (Number(post.reblogs_count) || 0), replies: Number(post.replies_count) || 0 }));
    },
    Lemmy: async () => {
      const data = await json(`https://lemmy.world/api/v3/search?${new URLSearchParams({ q: words, type_: 'Posts', sort: 'New', limit: String(each) })}`, 'Lemmy');
      return (data?.posts ?? []).filter((item) => Date.parse(item?.post?.published) / 1000 > since && !item?.creator?.bot_account).map((item) => ({ network: 'Lemmy', date: day(item.post.published), text: plainText(`${item.post.name}${item.post.body ? `: ${item.post.body}` : ''}`).slice(0, 300), url: String(item.post.ap_id ?? ''), score: Number(item.counts?.score) || 0, replies: Number(item.counts?.comments) || 0 }));
    },
  };
  const posts = [];
  const failed = [];
  await Promise.all(Object.entries(tasks).map(async ([name, task]) => {
    try {
      posts.push(...(await task()).filter((post) => post.text && post.date));
    } catch (error) {
      failed.push(`${name} (${String(error?.message ?? error).slice(0, 80)})`);
    }
  }));
  posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.score - a.score));
  return { posts: posts.slice(0, Math.max(1, limit)), all: posts, failed };
}

// ---- prices -------------------------------------------------------------------------------------

export const RANGES = ['1mo', '3mo', '6mo', 'ytd', '1y', '2y', '5y', '10y'];

/**
 * Closing prices of one share, index, currency pair or coin.
 * @param {string} symbol - as Yahoo Finance writes it: NVDA, SAP.DE, ^GSPC, EURUSD=X, BTC-USD.
 * @param {string} range - one of RANGES.
 * @returns {Promise<{symbol: string, name: string, currency: string, exchange: string, weekly: boolean, points: {date: string, close: number}[]}>} oldest first.
 */
export async function priceHistory(symbol, range = '1y') {
  const clean = String(symbol ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9^.=\-]{1,15}$/.test(clean)) throw new Error(`"${String(symbol).slice(0, 30)}" is not a ticker symbol. Use the symbol as Yahoo Finance writes it, for example NVDA, SAP.DE, ^GSPC, EURUSD=X or BTC-USD`);
  const span = RANGES.includes(range) ? range : '1y';
  const weekly = span === '5y' || span === '10y';
  const data = await json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(clean)}?range=${span}&interval=${weekly ? '1wk' : '1d'}`, `The price service (Yahoo Finance), for ${clean},`);
  const result = data?.chart?.result?.[0];
  const stamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  const points = [];
  for (let i = 0; i < stamps.length; i += 1) {
    if (typeof closes[i] === 'number' && Number.isFinite(closes[i])) points.push({ date: day(stamps[i] * 1000), close: Math.round(closes[i] * 10000) / 10000 });
  }
  if (points.length === 0) throw new Error(`The price service has no prices for ${clean}`);
  const meta = result.meta ?? {};
  return { symbol: clean, name: String(meta.longName ?? meta.shortName ?? clean), currency: String(meta.currency ?? ''), exchange: String(meta.fullExchangeName ?? meta.exchangeName ?? ''), weekly, points };
}
