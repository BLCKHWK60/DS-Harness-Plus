/**
 * Which addresses Recon reads. Only .onion addresses, and only ones that came from somewhere the
 * user can see: a search result, a page already read, or the user's own message. A page cannot
 * make the assistant open an address the page invented a moment ago with the user's words in it.
 */

/** A current (version 3) onion name: 56 letters and digits, with or without names in front. */
const ONION = /^(?:[a-z0-9-]{1,40}\.){0,3}[a-z2-7]{56}\.onion$/;

/**
 * @param {unknown} address - what was asked for.
 * @returns {{ok: true, url: string, host: string} | {ok: false, why: string}} the address in its one spelling.
 */
export function onionAddress(address) {
  const text = String(address ?? '').trim();
  if (!text || text.length > 600) return { ok: false, why: 'That is not a usable address.' };
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `http://${text}`);
  } catch {
    return { ok: false, why: 'That is not a usable address.' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return { ok: false, why: 'Only http and https addresses are read.' };
  if (url.username || url.password) return { ok: false, why: 'Addresses with a sign-in in them are not read.' };
  const host = url.hostname.toLowerCase();
  if (!ONION.test(host)) return { ok: false, why: 'Recon reads only .onion addresses (the long ones with 56 characters). Other sites are not reached from here.' };
  url.hash = '';
  return { ok: true, url: url.href, host };
}

/**
 * Every .onion address written in a piece of text.
 * @param {unknown} text - a message.
 * @returns {string[]} the addresses, each in its one spelling.
 */
export function onionAddressesIn(text) {
  const found = new Set();
  for (const match of String(text ?? '').matchAll(/(?:https?:\/\/)?(?:[a-z0-9-]{1,40}\.){0,3}[a-z2-7]{56}\.onion(?::\d{1,5})?(?:\/[^\s<>"'`)\]]*)?/gi)) {
    const parsed = onionAddress(match[0].replace(/[.,;:!?]+$/, ''));
    if (parsed.ok) found.add(parsed.url);
    if (found.size >= 200) break;
  }
  return [...found];
}

/**
 * The addresses each conversation may open. Kept in memory only.
 * @returns {object} the record.
 */
export function openTrail() {
  /** conversation id -> the addresses it has been shown. */
  const shown = new Map();
  /** conversation id -> the sites those addresses are on. */
  const sites = new Map();
  const MAX = 5000;
  return {
    /** These addresses were shown to the conversation: by a search, by a page, or by the user. */
    add(id, urls) {
      const key = String(id);
      const set = shown.get(key) ?? new Set();
      const hosts = sites.get(key) ?? new Set();
      for (const url of urls ?? []) {
        const parsed = onionAddress(url);
        if (parsed.ok && set.size < MAX) {
          set.add(parsed.url);
          hosts.add(parsed.host);
        }
      }
      shown.set(key, set);
      sites.set(key, hosts);
    },
    /**
     * @returns {boolean} whether the conversation may open this address: it was shown exactly this
     * address, or this is the bare front page of a site it was shown an address on. A front page
     * carries nothing in its address, so nothing can be smuggled out through it.
     */
    has(id, url) {
      const parsed = onionAddress(url);
      if (!parsed.ok) return false;
      if (shown.get(String(id))?.has(parsed.url) === true) return true;
      const made = new URL(parsed.url);
      return made.pathname === '/' && made.search === '' && sites.get(String(id))?.has(parsed.host) === true;
    },
    count: (id) => shown.get(String(id))?.size ?? 0,
    forget: (id) => {
      sites.delete(String(id));
      return shown.delete(String(id));
    },
  };
}
