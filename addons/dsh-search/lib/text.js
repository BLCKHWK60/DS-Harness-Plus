/**
 * Searching the text of messages, on top of the app's search index.
 *
 * Two things the app's own search endpoint does not do:
 *   - It stops at about 20 conversations. This asks for several pages.
 *   - It also finds the notes the app adds to every conversation by itself (the list of skills,
 *     the instruction files). Those are the same text in conversation after conversation, so a
 *     snippet that turns up word for word in three or more conversations is taken to be such a
 *     note and left out.
 * A query of several words finds conversations that hold every word, not only the exact phrase.
 */

const FILTERS = [{ kind: 'type', values: ['user/message', 'assistant/message'] }, { kind: 'surface', values: ['current'] }];
const clean = (text) => String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Every hit for one word or phrase, a few pages deep.
 * @param {(request: object) => Promise<{items: object[], nextCursor?: string}>} search - the index's search across conversations.
 * @param {string} query - the word or phrase.
 * @param {number} pages - most pages to read.
 * @returns {Promise<{hits: {sessionId: string, snippet: string}[], more: boolean}>}
 */
async function hitsFor(search, query, pages) {
  const hits = [];
  let cursor;
  for (let page = 0; page < pages; page += 1) {
    const got = await search({ query, eventFilters: FILTERS, limit: 100, ...(cursor === undefined ? {} : { cursor }) });
    // One item per conversation: the conversation, and its best-matching message.
    for (const item of got?.items ?? []) {
      const sessionId = String(item?.header?.id ?? item?.bestMatch?.sessionId ?? '');
      if (sessionId) hits.push({ sessionId, snippet: clean(item?.bestMatch?.snippet) });
    }
    cursor = got?.nextCursor;
    if (cursor === undefined) return { hits, more: false };
  }
  return { hits, more: true };
}

/** Snippets that are the same text in three or more conversations: the app's own notes, not what was said. */
function boilerplate(hits) {
  const where = new Map();
  for (const hit of hits) {
    const key = hit.snippet.toLowerCase();
    if (!where.has(key)) where.set(key, new Set());
    where.get(key).add(hit.sessionId);
  }
  return new Set([...where].filter(([, sessions]) => sessions.size >= 3).map(([key]) => key));
}

/**
 * @param {(request: object) => Promise<{items: object[], nextCursor?: string}>} search - the index's search across conversations.
 * @param {string} query - what the user typed.
 * @param {object} [options] - `pages` (per word), `words` (most words searched).
 * @returns {Promise<{hits: {sessionId: string, snippet: string}[], more: boolean}>} one hit per conversation that holds every word.
 */
export async function searchText(search, query, { pages = 3, words: most = 4 } = {}) {
  const text = clean(query);
  if (text.length < 2) return { hits: [], more: false };
  const words = [...new Set(text.toLowerCase().split(' ').filter((word) => word.length >= 2))].slice(0, most);
  if (words.length === 0) return { hits: [], more: false };
  // The whole phrase first (its snippet is the best one), then each word on its own.
  const parts = words.length > 1 ? [text, ...words] : [text];
  let more = false;
  const perPart = [];
  for (const part of parts) {
    const got = await hitsFor(search, part, pages);
    more = more || got.more;
    const junk = boilerplate(got.hits);
    const bySession = new Map();
    for (const hit of got.hits) if (!junk.has(hit.snippet.toLowerCase()) && !bySession.has(hit.sessionId)) bySession.set(hit.sessionId, hit.snippet);
    perPart.push(bySession);
  }
  const phrase = perPart[0];
  const each = words.length > 1 ? perPart.slice(1) : perPart;
  const out = [];
  const seen = new Set();
  for (const [sessionId, snippet] of phrase) {
    seen.add(sessionId);
    out.push({ sessionId, snippet });
  }
  if (words.length > 1) {
    for (const [sessionId, snippet] of each[0]) {
      if (seen.has(sessionId) || !each.every((map) => map.has(sessionId))) continue;
      seen.add(sessionId);
      out.push({ sessionId, snippet });
    }
  }
  return { hits: out.slice(0, 200), more };
}
