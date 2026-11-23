/**
 * Stage E (point 6, 20 November 2026): a Mission whose model server does not answer. It waits and tries again by itself
 * (the wait does not count against its time limit, and uses no try and no lap), for at most DOWN_MAX_MS from the first
 * failure; then it ends with its report. Pure, so it is tested without the app.
 */

/** How long a Mission waits for its model server at most, counted from the first failure. */
export const DOWN_MAX_MS = 2 * 60 * 60_000;
/** Minutes before each try (the first, the second, …); every 15 minutes after the fifth. */
export const DOWN_WAITS = Object.freeze([1, 2, 5, 10, 15]);
/** After this long without the server, a fallback model of the tier is asked for (once per outage, never in Recon). */
export const FALLBACK_ASK_MS = 10 * 60_000;

/** Error words that say the model server cannot be reached or is down (not that the model refused or failed). */
const DOWN_WORDS = /ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|fetch failed|socket hang up|transport failed|Cannot reach |connection (refused|reset|closed)|Service Unavailable|Bad Gateway|Gateway Time-?out|\b50[234]\b/i;

/**
 * Whether a failure means the model server does not answer.
 * @param {{text?: string, code?: string, status?: number, health?: string}} failure - the error's words, the app's failure code
 *   (TRANSPORT, SERVER, …) and HTTP status when known, and Route health's state for the helper's server ('down' or other).
 * @returns {boolean}
 */
export function isServerDown({ text = '', code = '', status, health = '' } = {}) {
  const kind = String(code ?? '').toUpperCase();
  if (kind === 'TRANSPORT') return true;
  if (kind === 'SERVER' && [502, 503, 504].includes(Number(status))) return true;
  if (String(health) === 'down') return true;
  return DOWN_WORDS.test(String(text ?? ''));
}

/**
 * When the next try is.
 * @param {number} now - now.
 * @param {number} tries - tries made so far in this outage.
 * @returns {number} ms.
 */
export function nextTryAt(now, tries) {
  const at = Math.min(Math.max(0, Math.floor(Number(tries) || 0)), DOWN_WAITS.length - 1);
  return now + DOWN_WAITS[at] * 60_000;
}

/** @returns {string} a time of day as hh:mm (24 hours). */
export function clockWords(at) {
  const date = new Date(Number(at) || 0);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
