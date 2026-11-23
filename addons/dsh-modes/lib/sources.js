/**
 * Web sources (18 November 2026, the owner's "one Web selector"): the Web button is the same in every
 * tab, and what a conversation may use on the web is a set of ticks the owner can combine ("only
 * verified sources and forums"). No ticks stored means All, which is the web as before: no limit and no
 * extra words, so nothing changes until the owner unticks something.
 *
 * A tick changes the search in three ways together: the model is told which kinds are ticked and how to
 * word its searches for them; web_search results of other kinds are removed before the model sees them;
 * and opening a page of another kind is refused (lib/weblevel.js judges the address). Other is the
 * owner's own sources (lib/other.js). Tor, Usenet and I2P are ticks of Recon only.
 */
import { VERIFIED_START, hostOf, originalOf, UNKNOWN } from './weblevel.js';

/** The ticks every tab shows, in the popup's order. */
export const KINDS = ['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives', 'other'];
/** The ticks only Recon shows: its own networks. */
export const NETS = ['tor', 'usenet', 'i2p'];
/** Recon's networks that can be used today (I2P is shown as not set up yet). */
export const NETS_READY = ['tor', 'usenet'];
/** Every kind of page on the ordinary web (Other is the owner's own sources, not a kind of page). */
export const PAGE_KINDS = ['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives'];

/** The short names on the chip and in the popup. */
export const KIND_SHORT = { verified: 'Verified', academic: 'Academic', news: 'News', sites: 'Sites', forums: 'Forums', social: 'Social', archives: 'Archives', other: 'Other', tor: 'Tor', usenet: 'Usenet', i2p: 'I2P' };
/** The plain names, for the model and the refusals. */
export const KIND_NAMES = {
  verified: 'verified sources',
  academic: 'academic papers',
  news: 'news',
  sites: 'ordinary sites',
  forums: 'forums and boards',
  social: 'social media and channels',
  archives: 'archives of removed posts',
  other: 'the user\'s own other sources',
  tor: '.onion sites through Tor',
  usenet: 'Usenet',
  i2p: 'I2P',
  unknown: 'pages that cannot be told apart (a copy whose page cannot be read out, or a site by number)',
};

/**
 * The academic list a new install starts with: journals, preprint servers, indexes and universities.
 * Kinds of source, not anyone's choice; the owner edits it on Settings → Web sources.
 */
export const ACADEMIC_START = [
  '.edu', '.ac.uk', '.ac.jp', '.edu.au', '.uni-heidelberg.de',
  'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'ssrn.com', 'osf.io', 'zenodo.org', 'researchgate.net', 'semanticscholar.org', 'scholar.archive.org', 'core.ac.uk', 'openalex.org', 'europepmc.org',
  'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'doi.org', 'crossref.org', 'jstor.org',
  'nature.com', 'science.org', 'cell.com', 'thelancet.com', 'nejm.org', 'bmj.com', 'jamanetwork.com', 'plos.org', 'frontiersin.org', 'mdpi.com', 'springer.com', 'link.springer.com', 'sciencedirect.com', 'wiley.com', 'onlinelibrary.wiley.com', 'tandfonline.com', 'sagepub.com', 'oup.com', 'academic.oup.com', 'cambridge.org', 'ieee.org', 'ieeexplore.ieee.org', 'acm.org', 'dl.acm.org', 'pnas.org', 'cochranelibrary.com',
].join('\n');

/**
 * The news list a new install starts with: wire services, public broadcasters and established
 * newspapers and magazines. The owner edits it on Settings → Web sources.
 */
export const NEWS_START = [
  'reuters.com', 'apnews.com', 'afp.com', 'dpa.com', 'ansa.it', 'efe.com',
  'bbc.co.uk', 'bbc.com', 'npr.org', 'pbs.org', 'cbc.ca', 'abc.net.au', 'tagesschau.de', 'zdf.de', 'deutschlandfunk.de', 'dw.com', 'france24.com', 'rfi.fr', 'nhk.or.jp', 'rnz.co.nz', 'rte.ie', 'swissinfo.ch', 'orf.at', 'srf.ch', 'svt.se', 'nrk.no', 'yle.fi', 'dr.dk',
  'nytimes.com', 'washingtonpost.com', 'wsj.com', 'ft.com', 'economist.com', 'theguardian.com', 'thetimes.co.uk', 'telegraph.co.uk', 'latimes.com', 'bloomberg.com', 'cnbc.com', 'cnn.com', 'nbcnews.com', 'cbsnews.com', 'abcnews.go.com', 'politico.com', 'politico.eu', 'axios.com', 'theatlantic.com', 'newyorker.com', 'time.com', 'propublica.org',
  'spiegel.de', 'zeit.de', 'faz.net', 'sueddeutsche.de', 'handelsblatt.com', 'nzz.ch', 'derstandard.at', 'lemonde.fr', 'lefigaro.fr', 'liberation.fr', 'elpais.com', 'elmundo.es', 'corriere.it', 'repubblica.it', 'nrc.nl', 'volkskrant.nl', 'aljazeera.com', 'scmp.com', 'japantimes.co.jp', 'thehindu.com', 'smh.com.au',
].join('\n');

/** Forums and boards (kept apart from lib/weblevel.js so a list here can grow without touching the old levels). */
const FORUMS = ['reddit.com', 'redd.it', 'redditmedia.com', 'redditstatic.com', 'news.ycombinator.com', 'stackexchange.com', 'stackoverflow.com', 'superuser.com', 'serverfault.com', 'askubuntu.com', 'quora.com', '4chan.org', '4channel.org', 'lemmy.world', 'kbin.social', 'gutefrage.net', 'xda-developers.com', 'resetera.com', 'somethingawful.com', 'tildes.net', 'slashdot.org'];
/** Social media and channels. */
const SOCIAL = ['fxtwitter.com', 'vxtwitter.com', 'fixupx.com', 'fixvx.com', 'xcancel.com', 'twstalker.com', 't.me', 'telegram.me', 'telegram.org', 'discord.com', 'discord.gg', 'whatsapp.com', 'vk.com', 'ok.ru', 'groups.google.com', 'groups.io', 'mastodon.social', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'threads.net', 'bsky.app', 'youtube.com', 'youtu.be', 'twitch.tv', 'rumble.com', 'odysee.com', 'bitchute.com', 'gab.com', 'truthsocial.com', 'linkedin.com', 'pinterest.com', 'snapchat.com', 'weibo.com', 'tumblr.com'];
/** Archives of removed posts (the Reddit archives). */
const ARCHIVES = ['pullpush.io', 'api.pullpush.io', 'arctic-shift.photon-reddit.com', 'reveddit.com', 'unddit.com', 'camas.unddit.com', 'pushshift.io', 'redditsearch.io', 'undelete.pullpush.io'];

/** @returns {string[]} one host or ending per line, from a list's text (# starts a note). */
export function listOf(text) {
  return String(text ?? '').split('\n').map((line) => line.replace(/#.*/, '').trim().toLowerCase()).filter((line) => /^\.?[a-z0-9.-]{2,253}$/.test(line));
}

/** @returns {boolean} whether a host is a list entry or under it (".gov" matches any host ending in .gov). */
function onList(host, list) {
  return list.some((entry) => {
    const item = String(entry).trim().toLowerCase();
    if (!item) return false;
    if (item.startsWith('.')) return host.endsWith(item) || host === item.slice(1);
    return host === item || host.endsWith(`.${item}`);
  });
}

/** @returns {boolean} whether a host is an address by number (IPv4 or IPv6). */
const byNumber = (host) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || /^(?:0x[0-9a-f]+|\d+)$/i.test(host);

/**
 * The lists the kinds are judged by, from the settings' texts (each falls back to its starting list
 * only when the setting is missing; an emptied list stays empty).
 * @param {{verified?: unknown, academic?: unknown, news?: unknown}} texts - the stored lists.
 * @returns {{verified: string[], academic: string[], news: string[]}}
 */
export function listsOf({ verified, academic, news } = {}) {
  return {
    verified: listOf(typeof verified === 'string' ? verified : VERIFIED_START),
    academic: listOf(typeof academic === 'string' ? academic : ACADEMIC_START),
    news: listOf(typeof news === 'string' ? news : NEWS_START),
  };
}

/**
 * Every kind an address belongs to. One site can be two kinds (a wire service is verified and news).
 * An archived copy or a reader's page is judged by the page it shows.
 * @param {string} address - a web address.
 * @param {{verified: string[], academic: string[], news: string[]}} lists - from listsOf.
 * @returns {string[]} its kinds; ['unknown'] for a page that cannot be told apart; [] when it is no web address.
 */
export function kindsOf(address, lists) {
  if (!hostOf(address)) return [];
  const original = originalOf(address);
  if (original === UNKNOWN) return ['unknown'];
  const host = hostOf(original);
  if (!host || byNumber(host)) return ['unknown'];
  if (onList(host, ARCHIVES)) return ['archives'];
  const kinds = [];
  if (onList(host, lists.verified)) kinds.push('verified');
  if (onList(host, lists.academic)) kinds.push('academic');
  if (onList(host, lists.news)) kinds.push('news');
  if (onList(host, FORUMS) || /^(?:forums?|boards?|community|discuss|discourse)\./.test(host) || /(?:^|[.-])forums?(?:[.-]|$)/.test(host) || /(?:^|[.-])(?:libreddit|redlib|teddit|safereddit)(?:[.-]|$)/.test(host)) kinds.push('forums');
  if (onList(host, SOCIAL) || /^groups?\./.test(host) || /(?:^|[.-])nitter(?:[.-]|$)/.test(host)) kinds.push('social');
  return kinds.length > 0 ? kinds : ['sites'];
}

/**
 * The ticks a conversation stored, cleaned: undefined for All (nothing stored, or every kind ticked
 * in a tab that has no networks of its own).
 * @param {unknown} stored - the stored array.
 * @param {{recon?: boolean}} [where] - Recon keeps its network ticks.
 * @returns {string[] | undefined}
 */
export function ticksOf(stored, { recon = false } = {}) {
  if (!Array.isArray(stored)) return undefined;
  const allowed = recon ? [...KINDS, ...NETS] : KINDS;
  const ticks = [...new Set(stored.map((item) => String(item)).filter((item) => allowed.includes(item)))];
  return allowed.filter((kind) => ticks.includes(kind));
}

/** @returns {boolean} whether a set of ticks is everything (All): every kind, and in Recon every network that can be used. */
export function isAll(ticks, { recon = false } = {}) {
  if (!ticks) return true;
  return KINDS.every((kind) => ticks.includes(kind)) && (!recon || NETS_READY.every((net) => ticks.includes(net)));
}

/** The old Web levels as ticks (carry-over, never written back over a conversation's own ticks). */
const LEVEL_TICKS = {
  verified: ['verified'],
  open: ['verified', 'academic', 'news', 'sites'],
  everything: ['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives'],
};
/** The old mix lanes as ticks. */
const LANE_TICKS = { verified: ['verified'], sites: ['sites'], forums: ['forums'], channels: ['social'], archives: ['archives'] };

/**
 * A saved selection's ticks: new kinds as they are, the old lanes of an earlier Custom mix mapped
 * (groups and channels is now social media and channels).
 * @param {unknown} list - the stored list.
 * @returns {string[]}
 */
export function selectionTicks(list) {
  if (!Array.isArray(list)) return [];
  const out = new Set();
  for (const item of list) {
    const name = String(item);
    if ([...KINDS, ...NETS].includes(name)) out.add(name);
    else for (const kind of LANE_TICKS[name] ?? []) out.add(kind);
  }
  return [...KINDS, ...NETS].filter((kind) => out.has(kind));
}

/**
 * An older Web level (Verified, Open web, Everything, a Custom mix) as ticks.
 * @param {unknown} picked - the stored level ('verified', 'open', 'everything', 'custom:<name>').
 * @param {Record<string, unknown[]>} mixes - the saved selections.
 * @returns {string[] | undefined} the ticks; undefined for On (All) or a level that cannot be read.
 */
export function ticksFromLevel(picked, mixes) {
  if (typeof picked !== 'string') return undefined;
  if (LEVEL_TICKS[picked]) return [...LEVEL_TICKS[picked]];
  if (picked.startsWith('custom:')) {
    const lanes = mixes?.[picked.slice(7)];
    return Array.isArray(lanes) ? selectionTicks(lanes) : undefined;
  }
  return undefined;
}

/**
 * What the chip reads after "Web ·": All, one or two short names, "N sources", or the name of a saved
 * selection whose ticks are exactly these.
 * @param {string[] | undefined} ticks - the ticks (undefined: All).
 * @param {{recon?: boolean, selections?: Record<string, string[]>}} [where]
 * @returns {string}
 */
export function ticksLabel(ticks, { recon = false, selections = {} } = {}) {
  if (isAll(ticks, { recon })) return 'All';
  const same = Object.entries(selections).find(([, list]) => list.length === ticks.length && list.every((kind) => ticks.includes(kind)));
  if (same) return same[0];
  if (ticks.length === 0) return 'None';
  if (ticks.length <= 2) return ticks.map((kind) => KIND_SHORT[kind]).join(' + ');
  return `${ticks.length} sources`;
}

/**
 * Whether the conversation's ticks let a tool open an address.
 * @param {{ticks: string[] | undefined, lists: object, address: string}} input
 * @returns {{ok: boolean, why: string, kinds: string[]}} the decision, and the plain reason when it is no.
 */
export function sourcesAllow({ ticks, lists, address }) {
  if (!ticks) return { ok: true, why: '', kinds: [] };
  const kinds = kindsOf(address, lists);
  if (kinds.length === 0) return { ok: true, why: '', kinds };
  if (kinds.some((kind) => ticks.includes(kind))) return { ok: true, why: '', kinds };
  // What cannot be told apart opens only when every kind of page is ticked.
  if (kinds[0] === 'unknown' && PAGE_KINDS.every((kind) => ticks.includes(kind))) return { ok: true, why: '', kinds };
  const original = originalOf(address);
  const host = hostOf(original === UNKNOWN ? address : original) || hostOf(address);
  const what = kinds.map((kind) => KIND_NAMES[kind]).join(' and ');
  return {
    ok: false,
    kinds,
    why: `This thread's Web sources are ${tickedWords(ticks)}, which leaves out ${what}: ${host} was not opened. Name it to the user as a lead: they can tick ${kinds[0] === 'unknown' ? 'every kind of source' : what} on the Web button, or add the site to a list on Settings → Web sources. Do not try to reach it another way (a command, a program, another tool).`,
  };
}

/** @returns {string} the ticks in plain words ("only verified sources and forums and boards"). */
export function tickedWords(ticks) {
  if (!ticks || ticks.length === 0) return 'nothing';
  const names = ticks.map((kind) => KIND_NAMES[kind]);
  return `only ${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0]}`;
}

/** How to word searches for each kind (Research's former News and Academic focus words live here now). */
export const KIND_TIPS = {
  verified: 'for verified sources, add the official body\'s name or "official", or use site:.gov, site:.europa.eu, site:who.int',
  academic: 'for academic papers, add "study", "paper", "meta-analysis" or "filetype:pdf", or use site:arxiv.org, site:pubmed.ncbi.nlm.nih.gov; give authors and year and say whether a paper is peer-reviewed or a preprint',
  news: 'for news, add the current year or month, prefer the newest and the original report, and give each report\'s date',
  sites: '',
  forums: 'for forums and boards, add "forum" or "reddit", or use site:reddit.com, site:stackexchange.com, site:news.ycombinator.com',
  social: 'for social media and channels, add the platform\'s name, or use site:x.com, site:youtube.com, site:t.me, site:bsky.app',
  archives: 'for removed posts, use the Reddit archives (pullpush.io, arctic-shift)',
  other: 'for the user\'s own sources, use other_search and other_read with the source\'s name',
};

/**
 * The note a conversation gets about its ticks ('' for All, as before).
 * @param {string[] | undefined} ticks - the ticks.
 * @param {{other?: string[]}} [extra] - the names of the user's own sources, when Other is ticked.
 * @returns {string}
 */
export function sourcesSaid(ticks, { other = [] } = {}) {
  if (isAll(ticks)) return '';
  const kinds = ticks.filter((kind) => KINDS.includes(kind));
  if (kinds.length === 0) return '\n\nWeb sources: nothing is ticked, so no web page may be opened and search results are all left out. Say so if the task needs the web; the user ticks sources on the Web button.';
  const tips = kinds.map((kind) => KIND_TIPS[kind]).filter(Boolean);
  const own = kinds.includes('other') && other.length > 0 ? ` The user's own sources: ${other.map((name) => `"${name}"`).join(', ')}.` : '';
  return `\n\nWeb sources: ${tickedWords(kinds)}. Search results of other kinds are removed before you see them, and pages of other kinds cannot be opened.${tips.length > 0 ? ` Word your searches for these kinds: ${tips.join('; ')}.` : ''}${own} If the answer needs another kind of source, say so; the user ticks more on the Web button.`;
}

/**
 * A web_search result as the model sees it, with the results of unticked kinds taken out.
 * @param {string} text - the rendered result ("Sources:" then one "- [title](url) …" line each).
 * @param {Array<{url: string}>} sources - the result's sources.
 * @param {string[] | undefined} ticks - the ticks.
 * @param {object} lists - from listsOf.
 * @param {string} [answer] - the search service's own summary, when it gave one: it may draw on the results left out, so it goes too.
 * @returns {{text: string, left: number}} the new text and how many results were left out (0: unchanged).
 */
export function filterSearchText(text, sources, ticks, lists, answer = '') {
  if (!ticks || !Array.isArray(sources)) return { text, left: 0 };
  const out = sources.filter((source) => !sourcesAllow({ ticks, lists, address: String(source?.url ?? '') }).ok).map((source) => String(source.url));
  if (out.length === 0) return { text, left: 0 };
  const drop = new Set(out);
  let body = String(text ?? '').split('\n').filter((line) => !(line.startsWith('- [') && [...drop].some((url) => line.includes(`](${url})`)))).join('\n');
  if (answer && body.includes(answer)) body = body.replace(answer, '(The search service\'s own summary was left out: it may draw on results that are not among this thread\'s Web sources.)');
  const kept = sources.length - out.length;
  if (kept === 0) body = body.replace(/Sources:\n?/, 'Sources: none of the ticked kinds.\n');
  body += `\n\n(${out.length} result${out.length === 1 ? ' was' : 's were'} left out because ${out.length === 1 ? 'it is' : 'they are'} not among this thread's Web sources: ${tickedWords(ticks.filter((kind) => KINDS.includes(kind)))}.)`;
  return { text: body, left: out.length };
}

/** A saved selection's name as kept: no control characters, trimmed, at most 40 characters. */
export const selectionName = (name) => String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);

/**
 * The owner's saved selections from the setting's JSON text: at most 20, each as ticks (an earlier Custom
 * mix's lanes are read as ticks). A selection with no tick that can be read is left out.
 * @param {unknown} text - the stored JSON.
 * @returns {Record<string, string[]>}
 */
export function selectionsOf(text) {
  let value = {};
  try {
    value = typeof text === 'string' ? JSON.parse(text || '{}') : text ?? {};
  } catch {
    value = {};
  }
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [name, list] of Object.entries(value).slice(0, 20)) {
    const clean = selectionName(name);
    const ticks = selectionTicks(list);
    if (clean && ticks.length > 0) out[clean] = ticks;
  }
  return out;
}
