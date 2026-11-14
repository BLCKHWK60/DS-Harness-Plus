/**
 * Matching for Global Search, kept apart from the page so it can be tested without the app.
 */

/** Words of a query, lower-case, without empty ones. */
export function wordsOf(query) {
  return String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 12);
}

/** @returns {boolean} whether a text holds every word of the query. */
export function holds(text, words) {
  const flat = String(text ?? '').toLowerCase();
  return words.length > 0 && words.every((word) => flat.includes(word));
}

/**
 * A text cut into pieces, with the pieces that match a word marked, for showing a match in bold.
 * @param {string} text - a title or a snippet.
 * @param {string[]} words - the query's words.
 * @returns {{text: string, hit: boolean}[]} the pieces, in order.
 */
export function marked(text, words) {
  const value = String(text ?? '');
  const flat = value.toLowerCase();
  const spans = [];
  for (const word of words) {
    if (!word) continue;
    for (let at = flat.indexOf(word); at >= 0; at = flat.indexOf(word, at + word.length)) spans.push([at, at + word.length]);
  }
  spans.sort((a, b) => a[0] - b[0]);
  const out = [];
  let done = 0;
  for (const [from, to] of spans) {
    if (to <= done) continue;
    const start = Math.max(from, done);
    if (start > done) out.push({ text: value.slice(done, start), hit: false });
    out.push({ text: value.slice(start, to), hit: true });
    done = to;
  }
  if (done < value.length) out.push({ text: value.slice(done), hit: false });
  return out;
}

/**
 * The results for a query: conversations whose title matches, then conversations whose text
 * matches, each once, grouped by tab; and projects whose name or folder matches.
 * @param {object} input - `query`, `sessions` ([{id, title, updatedAt, tab}]), `hits` ([{sessionId, snippet}] from the
 *   app's text search), `projects` ([{id, title, path}]), `tabs` ([{id, label}] in the sidebar's order).
 * @returns {{groups: {tab: string, label: string, items: object[]}[], projects: object[], total: number}}
 */
export function results({ query, sessions = [], hits = [], projects = [], tabs = [] }) {
  const words = wordsOf(query);
  if (words.length === 0) return { groups: [], projects: [], total: 0 };
  const byId = new Map(sessions.map((session) => [session.id, session]));
  const found = new Map();
  for (const session of sessions) if (holds(session.title, words)) found.set(session.id, { ...session, by: 'title', snippet: '' });
  for (const hit of hits) {
    const session = byId.get(hit.sessionId);
    if (!session) continue;
    const have = found.get(session.id);
    if (have) have.snippet = have.snippet || String(hit.snippet ?? '');
    else found.set(session.id, { ...session, by: 'text', snippet: String(hit.snippet ?? '') });
  }
  const labelOf = new Map(tabs.map((tab) => [tab.id, tab.label]));
  const order = [...tabs.map((tab) => tab.id)];
  const groups = new Map();
  for (const item of found.values()) {
    const tab = labelOf.has(item.tab) ? item.tab : 'other';
    if (!groups.has(tab)) groups.set(tab, []);
    groups.get(tab).push(item);
  }
  const rank = (item) => (item.by === 'title' ? 0 : 1);
  const sorted = [...groups.entries()]
    .sort((a, b) => (order.indexOf(a[0]) < 0 ? 999 : order.indexOf(a[0])) - (order.indexOf(b[0]) < 0 ? 999 : order.indexOf(b[0])))
    .map(([tab, items]) => ({ tab, label: labelOf.get(tab) ?? 'Other', items: items.sort((a, b) => rank(a) - rank(b) || (b.updatedAt ?? 0) - (a.updatedAt ?? 0)).slice(0, 30) }));
  const places = projects.filter((project) => holds(`${project.title} ${project.path}`, words)).slice(0, 8);
  return { groups: sorted, projects: places, total: sorted.reduce((sum, group) => sum + group.items.length, 0) + places.length };
}
