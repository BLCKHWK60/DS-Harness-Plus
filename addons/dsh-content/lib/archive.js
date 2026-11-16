/**
 * Archived copies for a final piece's sources (plan step C16): the Internet Archive's own copy of each
 * web source, looked up with one fixed request to its availability service and recorded on the source,
 * so the sources page can show it. Never for a source from Recon or an onion address, never with the
 * web off, and bounded: at most 20 lookups, 8 seconds each.
 */
export const ARCHIVE_API = 'https://archive.org/wayback/available?url=';
export const LOOKUPS_MAX = 20;
const EACH_MS = 8000;

/** Whether a source may be looked up: a web address, not from Recon, not an onion address. */
export function lookable(source) {
  const url = String(source?.url ?? '');
  if (source?.origin === 'recon' || /\.onion\b/i.test(url) || /\.onion\b/i.test(String(source?.archived ?? ''))) return false;
  try {
    const parsed = new URL(url);
    return (parsed.protocol === 'https:' || parsed.protocol === 'http:') && !/^(localhost|127\.|10\.|192\.168\.|\[)/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

/**
 * The archived copy of one address, or ''.
 * @param {string} url - the source's address.
 * @param {typeof fetch} fetchFn - the web (a stand-in in tests).
 */
export async function archivedCopy(url, fetchFn) {
  if (typeof fetchFn !== 'function') return '';
  try {
    const response = await fetchFn(`${ARCHIVE_API}${encodeURIComponent(url)}`, { redirect: 'error', signal: AbortSignal.timeout(EACH_MS), headers: { accept: 'application/json', 'user-agent': 'DeepSeek-Harness-Content' } });
    if (!response?.ok) return '';
    const body = await response.json();
    const closest = body?.archived_snapshots?.closest;
    const found = String(closest?.url ?? '');
    if (closest?.available !== true || !/^https?:\/\/web\.archive\.org\/web\/\d{4,14}[^\s]*$/i.test(found)) return '';
    return found.replace(/^http:/i, 'https:');
  } catch {
    return '';
  }
}

/**
 * Look up the archived copies of the sources a final piece uses, in place.
 * @param {object[]} sources - the sources to look at (the subject's records; `archived` is set on them).
 * @param {{fetchFn?: typeof fetch, webOff?: boolean}} [options] - the web, and whether it is off.
 * @returns {Promise<{looked: number, found: number}>} what was done.
 */
export async function archiveSources(sources, { fetchFn, webOff = false } = {}) {
  if (webOff || typeof fetchFn !== 'function') return { looked: 0, found: 0 };
  let looked = 0;
  let found = 0;
  for (const source of sources) {
    if (looked >= LOOKUPS_MAX) break;
    if (!lookable(source) || source.archived) continue;
    looked += 1;
    const copy = await archivedCopy(source.url, fetchFn);
    if (copy) {
      source.archived = copy;
      found += 1;
    }
  }
  return { looked, found };
}
