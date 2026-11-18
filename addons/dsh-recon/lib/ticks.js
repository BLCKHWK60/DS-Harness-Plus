/**
 * Recon's Web sources (the one Web selector, 18 November 2026): the same source ticks as every tab, plus
 * Recon's own networks (Tor, Usenet; I2P is not set up yet). The ticks are stored by Modes with the
 * conversation's other marks; Recon's tools ask Modes for them and refuse what is not ticked. All (nothing
 * stored) is Recon as before. Recon's isolation is unchanged: this only takes tools away.
 */

/** Kinds of page on the ordinary web. */
export const PAGE_KINDS = ['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives'];
/** Boards that are social media and channels rather than forums. */
const SOCIAL_BOARDS = ['telegram', 'mastodon'];
/** How a refusal begins (lib/tools.js counts such an answer as one that did not run). */
export const UNTICKED = 'Not among this conversation\'s Recon sources';

const NAMES = { verified: 'verified sources', academic: 'academic papers', news: 'news', sites: 'ordinary sites', forums: 'forums and boards', social: 'social media and channels', archives: 'archives', other: 'the user\'s own other sources', tor: '.onion sites through Tor', usenet: 'Usenet', unknown: 'pages that cannot be told apart' };

/**
 * Which ticks a Recon tool call needs (any one of them), or undefined when it needs none.
 * @param {string} name - the tool.
 * @param {object} args - its arguments.
 * @param {(address: string) => string[]} kinds - the kinds of an address (Modes' webKinds).
 * @returns {string[] | undefined}
 */
export function needsOf(name, args, kinds) {
  if (name.startsWith('recon_onion_')) return ['tor'];
  if (name.startsWith('recon_usenet_')) return ['usenet'];
  if (name.startsWith('recon_other_')) return ['other'];
  if (name === 'recon_news_search') return ['news'];
  if (name === 'recon_web_search') return PAGE_KINDS.filter((kind) => kind !== 'archives');
  if (name === 'recon_board_search' || name === 'recon_board_read') return [SOCIAL_BOARDS.includes(String(args?.source ?? '')) ? 'social' : 'forums'];
  if (name === 'recon_web_read' || name === 'recon_archive_find' || name === 'recon_archive_read') {
    const address = String(args?.address ?? '').trim();
    const found = kinds(/^[a-z][a-z0-9+.-]*:\/\//i.test(address) ? address : `https://${address}`);
    return found.length > 0 ? found : PAGE_KINDS;
  }
  return undefined;
}

/**
 * The refusal for a call the conversation's ticks leave out ('' when it may run).
 * @param {{name: string, args: object, ticks: string[] | undefined, kinds: Function}} input
 * @returns {string}
 */
export function untickedRefusal({ name, args, ticks, kinds }) {
  if (!Array.isArray(ticks)) return '';
  const needs = needsOf(name, args, kinds);
  if (!needs) return '';
  if (needs.some((kind) => ticks.includes(kind))) return '';
  if (needs[0] === 'unknown' && PAGE_KINDS.every((kind) => ticks.includes(kind))) return '';
  const what = [...new Set(needs)].map((kind) => NAMES[kind] ?? kind).join(' or ');
  return `${UNTICKED}: this needs ${what}, which ${needs.length > 1 ? 'are' : 'is'} not ticked on the Web button. Nothing was sent. Name it to the user as a lead: they can tick it on the Web button. Do not try to reach it another way.`;
}

/**
 * Whether a search result's address may be shown (its kind is ticked).
 * @returns {boolean}
 */
export function resultAllowed(url, ticks, kinds) {
  if (!Array.isArray(ticks)) return true;
  const found = kinds(url);
  if (found.length === 0) return true;
  if (found.some((kind) => ticks.includes(kind))) return true;
  return found[0] === 'unknown' && PAGE_KINDS.every((kind) => ticks.includes(kind));
}
