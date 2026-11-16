/**
 * What a report says about each source: whether a helper read the page, saw it only in search
 * results, or neither. The citation check does not compare a claim with its page; it checks that
 * every [n] is in the source list and labels each source by how the helpers came to it.
 * Kept apart from the plugin so it can be tested without the app.
 */

/**
 * A source's status, from what its helpers did: read the page (a fetch that came back without an
 * error), saw it in search results, or neither.
 */
export const FETCHED = 'fetched';
export const SEARCH_ONLY = 'search result only';
export const UNSEEN = 'not fetched';

/** How certain each status is; an unknown status ranks below them all. */
const RANK = Object.freeze({ [FETCHED]: 2, [SEARCH_ONLY]: 1, [UNSEEN]: 0 });
const rankOf = (status) => RANK[status] ?? -1;

/**
 * The more certain of two statuses. Two helpers that cite the same address are merged into one
 * source; it keeps the best of what they did, so a page one helper read is read, and one a helper
 * saw in its search results is not "not seen in search results".
 * @param {string} a - the status so far.
 * @param {string} b - another helper's status.
 * @returns {string} `b` when it is more certain than `a`, else `a`.
 */
export const moreCertain = (a, b) => (rankOf(b) > rankOf(a) ? b : a);

/**
 * Whether a fetch tool's result says the page came back: not an error, and (for `web_fetch`,
 * whose result carries the HTTP status in `meta`) a status below 400. The app's own fetch
 * returns a 403 or 404 page as a normal result, so the status is what tells it apart.
 * A page that answers 200 with only a teaser (a paywall) still counts as read.
 * @param {object} data - the `tool/result` event's data.
 * @returns {boolean} true when the page counts as read.
 */
export function fetchSucceeded(data) {
  if (!data || data.message?.isError === true) return false;
  const status = data?.meta?.statusCode;
  return typeof status !== 'number' || status < 400;
}

/** How each status reads in the report (the Sources list and the writer's findings). */
export const SOURCE_LABELS = Object.freeze({
  [FETCHED]: 'read',
  [SEARCH_ONLY]: 'seen only in search results, not read',
  [UNSEEN]: 'not read, and not seen in search results',
});

/**
 * @param {string} status - a source's status.
 * @returns {string} its label; an unknown status reads as the least certain one.
 */
export const sourceLabel = (status) => SOURCE_LABELS[status] ?? SOURCE_LABELS[UNSEEN];

/**
 * @param {string} status - a status.
 * @returns {boolean} true when the status is not "read": for a finding, its own helper did not read
 *   the page (another helper may have); for a source, none of the helpers that cited it did.
 */
export const notRead = (status) => status !== FETCHED;

/**
 * A source's status from one helper's record.
 * @param {string} url - the normalized address.
 * @param {{fetched: Set<string>, seen: Set<string>}} log - what the helper read and was shown.
 * @returns {string} FETCHED, SEARCH_ONLY or UNSEEN.
 */
export function statusOf(url, log) {
  if (log?.fetched?.has(url)) return FETCHED;
  if (log?.seen?.has(url)) return SEARCH_ONLY;
  return UNSEEN;
}

/**
 * The `## Sources` lines: each source with its label.
 * @param {{n: number, url: string, status: string}[]} sources - the sources to list.
 * @returns {string} one line per source.
 */
export function sourceLines(sources, grades = new Map()) {
  return sources.map((source) => `[${source.n}] ${source.url} (${sourceLabel(source.status)}${grades.has(source.n) ? ` · ${grades.get(source.n)}` : ''})`).join('\n');
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/**
 * The `## Checks` notes about cited sources no helper read.
 * @param {{status: string}[]} cited - the sources the report cites.
 * @returns {string[]} up to two notes; none when every cited source was read.
 */
export function unreadNotes(cited) {
  const searchOnly = cited.filter((source) => source.status === SEARCH_ONLY).length;
  const unseen = cited.filter((source) => notRead(source.status) && source.status !== SEARCH_ONLY).length;
  const notes = [];
  if (searchOnly) notes.push(`${count(searchOnly, 'cited source was', 'cited sources were')} seen only in search results, not read: what the report takes from ${searchOnly === 1 ? 'it' : 'them'} rests at most on a search result's short summary, not on the page.`);
  if (unseen) notes.push(`${count(unseen, 'cited source was', 'cited sources were')} not read, and not seen in search results either: check ${unseen === 1 ? 'it' : 'them'} before relying on what ${unseen === 1 ? 'it supports' : 'they support'}.`);
  return notes;
}

/**
 * The `## Checks` note about dropped findings.
 * @param {number} dropped - how many findings were dropped.
 * @param {boolean} requireFetched - whether a finding is dropped when its own helper did not read the page
 *   (decided per finding: another helper having read the same page does not keep it).
 * @returns {string} the note, or '' when none was dropped.
 */
export function droppedNote(dropped, requireFetched) {
  if (!dropped) return '';
  return `${count(dropped, 'finding was', 'findings were')} dropped (no usable address, over the source limit${requireFetched ? ', or its helper did not read the page' : ''}).`;
}
