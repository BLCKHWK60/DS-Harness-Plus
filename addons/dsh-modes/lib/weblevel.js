/**
 * Web levels (Content and Bench plan, step S1; the owner's choice of 16 November: add the levels and keep
 * the defaults). The Web button keeps Off and On; On is today's web, with no limit beyond the tab's own,
 * and stays where every conversation starts. A conversation may pick a level instead:
 *
 * - Verified: only sources on the verified list (established news, papers and official statistics,
 *   courts, governments, registers and archives). The owner edits the list on Settings → Modes.
 * - Open web: Verified, and ordinary search engines and sites; not forums and boards, public groups and
 *   channels, or the Reddit archives.
 * - Everything: all of them, and new sources a run finds.
 * - Custom: the lanes the owner ticks, saved under a name.
 *
 * A level is a boundary on what a tool may open: the address a tool is given. Searching itself lists
 * results; a result is opened only when the level allows its kind. The Internet Archive follows the
 * level: an archived copy is judged by the address it is a copy of.
 */

/** The levels a conversation may pick, in the button's order (Off and On are the button's own). */
export const LEVELS = ['verified', 'open', 'everything'];
/** The lanes a Custom mix ticks. */
export const LANES = ['verified', 'sites', 'forums', 'channels', 'archives'];
/** What each level lets through. */
export const LEVEL_LANES = {
  verified: ['verified'],
  open: ['verified', 'sites'],
  everything: ['verified', 'sites', 'forums', 'channels', 'archives'],
};

/**
 * The verified list a new install starts with: one host or address ending per line. Kinds of source,
 * not anyone's choice: official domains, international bodies, research publishers and indexes, wire
 * services and public broadcasters, courts and registers, archives. The owner adds and removes lines.
 */
export const VERIFIED_START = [
  '.gov', '.mil', '.gov.uk', '.gouv.fr', '.bund.de', '.admin.ch', '.gv.at', '.gob.es', '.gov.it', '.overheid.nl', '.europa.eu', '.int',
  '.gc.ca', '.gov.au', '.govt.nz', '.go.jp', '.gov.in', '.edu', '.ac.uk',
  'un.org', 'who.int', 'oecd.org', 'worldbank.org', 'imf.org', 'europarl.europa.eu', 'curia.europa.eu', 'eur-lex.europa.eu',
  'destatis.de', 'eurostat.ec.europa.eu', 'census.gov', 'ons.gov.uk', 'insee.fr', 'data.gov',
  'nature.com', 'science.org', 'cell.com', 'thelancet.com', 'nejm.org', 'bmj.com', 'plos.org', 'springer.com', 'link.springer.com', 'sciencedirect.com', 'wiley.com', 'onlinelibrary.wiley.com', 'tandfonline.com', 'jstor.org', 'pubmed.ncbi.nlm.nih.gov', 'ncbi.nlm.nih.gov', 'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'ssrn.com', 'doi.org', 'scholar.archive.org',
  'reuters.com', 'apnews.com', 'afp.com', 'dpa.com', 'bbc.co.uk', 'bbc.com', 'tagesschau.de', 'zdf.de', 'deutschlandfunk.de', 'npr.org', 'pbs.org', 'cbc.ca', 'abc.net.au',
  'courtlistener.com', 'supremecourt.gov', 'bundesverfassungsgericht.de', 'bundesgerichtshof.de', 'echr.coe.int', 'handelsregister.de', 'unternehmensregister.de', 'find-and-update.company-information.service.gov.uk', 'sec.gov', 'opencorporates.com',
  'archive.org', 'web.archive.org', 'loc.gov', 'nationalarchives.gov.uk', 'bundesarchiv.de',
].join('\n');

/** Forums and boards. */
const FORUMS = ['reddit.com', 'redd.it', 'redditmedia.com', 'redditstatic.com', 'news.ycombinator.com', 'stackexchange.com', 'stackoverflow.com', 'superuser.com', 'serverfault.com', 'askubuntu.com', 'quora.com', '4chan.org', '4channel.org', 'lemmy.world', 'kbin.social', 'gutefrage.net', 'xda-developers.com', 'resetera.com', 'somethingawful.com', 'tildes.net', 'slashdot.org'];
/** Public groups and channels. */
const CHANNELS = ['fxtwitter.com', 'vxtwitter.com', 'fixupx.com', 'fixvx.com', 'xcancel.com', 'twstalker.com', 't.me', 'telegram.me', 'telegram.org', 'discord.com', 'discord.gg', 'whatsapp.com', 'vk.com', 'ok.ru', 'groups.google.com', 'groups.io', 'mastodon.social', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com', 'threads.net', 'bsky.app', 'youtube.com', 'youtu.be', 'twitch.tv', 'rumble.com', 'odysee.com', 'bitchute.com', 'gab.com', 'truthsocial.com'];
/** The Reddit archives. */
const ARCHIVES = ['pullpush.io', 'api.pullpush.io', 'arctic-shift.photon-reddit.com', 'reveddit.com', 'unddit.com', 'camas.unddit.com', 'pushshift.io', 'redditsearch.io', 'undelete.pullpush.io'];

/** @returns {string} the host of an address, lower case, or '' when it is not a web address. */
export function hostOf(address) {
  try {
    const url = new URL(String(address ?? '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return '';
  }
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

/** @returns {string[]} the verified list from the setting's text (one entry per line, # starts a note). */
export function verifiedList(text) {
  return String(text ?? '').split('\n').map((line) => line.replace(/#.*/, '').trim().toLowerCase()).filter((line) => /^\.?[a-z0-9.-]{2,253}$/.test(line));
}

/** Archives and readers that show another page: they are judged by the page they show. */
const WRAPPERS = [
  // The Internet Archive: /web/<time>/<address>, /save/<address>.
  { host: (host) => host === 'archive.org' || host.endsWith('.archive.org'), path: /^\/(?:web|save)\/(?:[^/]*\/)?(.+)$/i },
  // archive.today and its other names: /newest/<address>, /<time>/<address>, /o/<id>/<address>.
  { host: (host) => /^archive\.(?:ph|is|today|li|vn|md|fo)$/.test(host), path: /^\/(?:newest\/|oldest\/|o\/[^/]+\/|\d{4,14}\/)?(https?:.+)$/i },
  // Readers and paywall proxies.
  { host: (host) => host === 'r.jina.ai' || host === '12ft.io', path: /^\/(?:proxy\?q=)?(https?:.+)$/i },
];

/** Marks an address that wraps another page Bench cannot read out: judged as unknown. */
export const UNKNOWN = 'unknown';

/**
 * The page an address really shows: an archived copy or a reader's page is judged by the page it shows
 * ("https://web.archive.org/web/2020/https://x.org/a" is "https://x.org/a"); a wrapper whose page cannot
 * be read out is UNKNOWN; anything else is the address itself.
 * @returns {string} the address to judge.
 */
export function originalOf(address) {
  let text = String(address ?? '').trim();
  for (let depth = 0; depth < 4; depth += 1) {
    let url;
    try {
      url = new URL(text);
    } catch {
      return text;
    }
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    // Google's translation proxy names the site in its own host: www-example-com.translate.goog.
    if (host.endsWith('.translate.goog')) {
      const inner = host.slice(0, -'.translate.goog'.length).replace(/--/g, '\u0000').replace(/-/g, '.').replace(/\u0000/g, '-');
      text = `${url.protocol}//${inner}${url.pathname}`;
      continue;
    }
    const wrapper = WRAPPERS.find((entry) => entry.host(host));
    if (!wrapper) return text;
    const rest = `${url.pathname}${url.search}`;
    const found = wrapper.path.exec(rest);
    if (!found) {
      // The archive's own pages (search, a collection) are the archive; a short copy link is not readable.
      if (host === 'archive.org' || host.endsWith('.archive.org')) return /^\/(?:web|save)\//i.test(url.pathname) ? UNKNOWN : text;
      return UNKNOWN;
    }
    let inner = found[1];
    try {
      if (/^https?%3a/i.test(inner)) inner = decodeURIComponent(inner);
    } catch {
      return UNKNOWN;
    }
    text = /^https?:\/\//i.test(inner) ? inner : /^https?:\/[^/]/i.test(inner) ? inner.replace(/^(https?:)\//i, '$1//') : `http://${inner}`;
  }
  return UNKNOWN;
}

/** @returns {boolean} whether a host is an address by number (IPv4 or IPv6). */
const byNumber = (host) => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[') || /^(?:0x[0-9a-f]+|\d+)$/i.test(host);

/**
 * The lane an address belongs to.
 * @param {string} address - a web address.
 * @param {string[]} verified - the verified list.
 * @returns {'verified' | 'forums' | 'channels' | 'archives' | 'sites' | 'unknown' | ''} its lane ('' when it is no
 *   web address; 'unknown' for a copy whose page cannot be read out, or an address by number: only Everything opens those).
 */
export function laneOf(address, verified) {
  if (!hostOf(address)) return '';
  const original = originalOf(address);
  if (original === UNKNOWN) return 'unknown';
  const host = hostOf(original);
  if (!host) return 'unknown';
  if (byNumber(host)) return 'unknown';
  if (onList(host, ARCHIVES)) return 'archives';
  if (onList(host, verified)) return 'verified';
  if (onList(host, FORUMS) || /^(?:forums?|boards?|community|discuss|discourse)\./.test(host) || /(?:^|[.-])forums?(?:[.-]|$)/.test(host) || /(?:^|[.-])(?:libreddit|redlib|teddit|safereddit)(?:[.-]|$)/.test(host)) return 'forums';
  if (onList(host, CHANNELS) || /^groups?\./.test(host) || /(?:^|[.-])nitter(?:[.-]|$)/.test(host)) return 'channels';
  return 'sites';
}

/** The plain names, for the refusal and the button. */
export const LEVEL_NAMES = { verified: 'Verified', open: 'Open web', everything: 'Everything', custom: 'Custom' };
export const LANE_NAMES = { verified: 'verified sources', sites: 'ordinary sites', forums: 'forums and boards', channels: 'public groups and channels', archives: 'the Reddit archives', unknown: 'pages it cannot tell apart (a copy whose page cannot be read out, or a site by number)' };

/**
 * Whether the conversation's level lets a tool open an address.
 * @param {{level: string, lanes?: string[], verified: string[], address: string}} input - the level picked ('verified', 'open', 'everything', or 'custom' with its lanes), the verified list, the address.
 * @returns {{ok: boolean, why: string}} the decision, and the plain reason when it is no.
 */
export function levelAllows({ level, lanes, verified, address }) {
  const allowed = level === 'custom' ? (Array.isArray(lanes) ? lanes.filter((lane) => LANES.includes(lane)) : []) : LEVEL_LANES[level];
  if (!allowed) return { ok: true, why: '' };
  const lane = laneOf(address, verified);
  if (!lane) return { ok: true, why: '' };
  if (allowed.includes(lane)) return { ok: true, why: '' };
  // Only Everything opens what cannot be told apart.
  if (lane === 'unknown' && level === 'everything') return { ok: true, why: '' };
  const original = originalOf(address);
  const host = hostOf(original === UNKNOWN ? address : original) || hostOf(address);
  const name = level === 'custom' ? 'your Custom mix' : LEVEL_NAMES[level];
  return {
    ok: false,
    why: `The thread's Web is at ${name}, which does not open ${LANE_NAMES[lane]}: ${host} was not opened. Name it to the user as a lead: they can open it by picking a wider level on the Web button${lane === 'sites' ? ' (Open web or Everything)' : lane === 'verified' ? '' : ' (Everything)'} or by adding the site to the verified list on Settings → Modes. Do not try to reach it another way (a command, a program, another tool).`,
  };
}

/** @returns {string[]} the web addresses a tool call would open: every argument value, at any depth, that is a whole http(s) address. */
export function addressesOf(args) {
  const found = [];
  let seen = 0;
  const walk = (value, depth) => {
    if (seen > 400 || depth > 5) return;
    seen += 1;
    if (typeof value === 'string') {
      const text = value.trim();
      if (text.length <= 8000 && /^https?:/i.test(text) && !/\s/.test(text) && hostOf(text)) found.push(text);
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 100)) walk(item, depth + 1);
      return;
    }
    if (value && typeof value === 'object') for (const item of Object.values(value).slice(0, 100)) walk(item, depth + 1);
  };
  walk(args, 0);
  return found;
}

/** @returns {string[]} the web addresses written in a command or a program's text. */
export function addressesIn(text) {
  return [...String(text ?? '').slice(0, 100_000).matchAll(/https?:\/\/[^\s'"`<>)\]}]+/gi)].map((match) => match[0]).slice(0, 200).filter((address) => hostOf(address));
}

/**
 * A conversation's level from the settings: undefined means On as before (no limit beyond the tab's).
 * @param {unknown} picked - the stored pick: 'verified', 'open', 'everything' or 'custom:<name>'.
 * @param {Record<string, string[]>} mixes - the owner's saved Custom mixes.
 * @returns {{level: string, lanes?: string[], name?: string} | undefined} the level.
 */
export function pickedLevel(picked, mixes) {
  if (typeof picked !== 'string') return undefined;
  if (LEVELS.includes(picked)) return { level: picked };
  if (picked.startsWith('custom:')) {
    const name = picked.slice(7);
    const lanes = mixes?.[name];
    if (Array.isArray(lanes)) return { level: 'custom', lanes: lanes.filter((lane) => LANES.includes(lane)), name };
  }
  return undefined;
}

/** A mix's name as kept: no control characters, trimmed, at most 40 characters (the chat box cleans it the same way). */
export const mixName = (name) => String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40);

/** @returns {Record<string, string[]>} the saved Custom mixes from the setting's JSON text: at most 20, names up to 40 characters. */
export function mixesOf(text) {
  let value = {};
  try {
    value = JSON.parse(String(text ?? '') || '{}');
  } catch {
    value = {};
  }
  const out = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [name, lanes] of Object.entries(value).slice(0, 20)) {
    const clean = mixName(name);
    if (clean && Array.isArray(lanes)) out[clean] = [...new Set(lanes.filter((lane) => LANES.includes(lane)))];
  }
  return out;
}
