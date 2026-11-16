/**
 * Which tools a conversation, or a helper agent working for it, may use.
 * Kept apart from the plugin so it can be tested without the app.
 */
import { allowed as trimAllowed } from './trim.js';

/** Web tools the Search switch turns on or off. */
export const WEB_TOOLS = ['web_search', 'web_fetch'];
/** The tool the Deep research switch makes available. Its helpers do the searching. */
export const RESEARCH_TOOL = 'deep_research';

/**
 * Other tools that reach the internet, which Web Off takes away too: those of the Free Search
 * plugin, the Finance data tools and Scout's search tools. Matched against the tools the app
 * knows, so a tool that is not installed costs nothing.
 */
export const WEB_REACHING = {
  names: [
    'weather', 'multi_search', 'advanced_search', 'platform_search', 'video_search', 'cache_search', 'domain_search', 'research',
    'free_search_test', 'search_web_pages', 'web_search_exa', 'zhihu_search', 'global_search', 'search_pro',
    'scout_search', 'scout_posting', 'scout_titles', 'scout_demand', 'scout_pay',
    'recon_onion_search', 'recon_onion_read', 'recon_usenet_groups', 'recon_usenet_search', 'recon_usenet_read', 'recon_news_search', 'recon_archive_find', 'recon_archive_read',
    // Recon's ordinary-web and board tools and its Ultra Code search go online too: Off leaves only recon_cite.
    'recon_web_search', 'recon_web_read', 'recon_board_search', 'recon_board_read', 'recon_ultra',
  ],
  prefixes: ['finance_'],
};

/** Tools whose names match the list above but that never go online: they stay when the web is off. */
export const LOCAL_ONLY = ['finance_profile_save'];

/**
 * @param {string[]} known - the tools the app knows.
 * @returns {string[]} those of them that reach the internet, besides the web tools and the research tool.
 */
export function webReaching(known) {
  return (Array.isArray(known) ? known : []).filter((name) => !LOCAL_ONLY.includes(name) && (WEB_REACHING.names.includes(name) || WEB_REACHING.prefixes.some((prefix) => name.startsWith(prefix))));
}

/** @returns {boolean} whether a mode is a research tab (it lists the research tool): it always has the web, and shows a fixed 'Web · Always on' label instead of a Web button. */
export function researchTab(tools) {
  return Array.isArray(tools) && tools.includes(RESEARCH_TOOL);
}

/**
 * Whether a conversation has the web tools.
 * @param {object} want - what applies to the conversation.
 * @param {'all' | 'none' | string[]} want.tools - the mode's tools.
 * @param {boolean} [want.isolated] - an isolated mode: it searches with its own tools only.
 * @param {boolean} [want.off] - the conversation's tools are switched off.
 * @param {unknown} [want.chosen] - the conversation's own Web choice, when it made one.
 * @returns {boolean} true when the web tools are on.
 */
export function webFor({ tools, isolated, off, chosen }) {
  if (off || isolated) return false;
  // The Research tab always researches with the web; its Web label is fixed (Always on).
  if (researchTab(tools)) return true;
  return typeof chosen === 'boolean' ? chosen : webDefault(tools);
}

/**
 * Old "Search off" marks to clear once (0.55.1): those in conversations whose tab has its own search,
 * which Web Off would now take away.
 * @param {Record<string, unknown>} webs - conversation id -> its Web choice.
 * @param {Record<string, string>} chosen - conversation id -> its mode id.
 * @param {Record<string, object>} modes - mode id -> mode.
 * @returns {string[]} the ids whose mark goes.
 */
export function oldWebMarks(webs, chosen, modes) {
  const ownSearch = (mode) => Boolean(mode) && (mode.isolated || (Array.isArray(mode.tools) && (mode.tools.includes(RESEARCH_TOOL) || webReaching(mode.tools).length > 0)));
  return Object.keys(webs).filter((id) => webs[id] === false && ownSearch(modes[chosen[id]]));
}

/**
 * Whether web tools are on when the conversation has not chosen.
 * @param {'all' | 'none' | string[]} tools - the mode's tools.
 * @returns {boolean} the mode's default.
 */
export function webDefault(tools) {
  if (tools === 'none') return false;
  if (Array.isArray(tools)) return WEB_TOOLS.some((tool) => tools.includes(tool));
  return true;
}

/** Tools a helper of a research conversation is not given: they reach the user's material or the conversation. */
export const RESEARCH_HELPER_LEAVES = ['diagram_draw', 'todo_write', 'ask_user_question'];
const helperLeaves = (tool) => tool.startsWith('library_') || RESEARCH_HELPER_LEAVES.includes(tool);

/**
 * The tool mask to apply.
 * @param {object} want - what applies to the agent.
 * @param {'all' | 'none' | string[]} want.tools - the mode's tools.
 * @param {boolean} want.web - the Search switch of the conversation.
 * @param {boolean} want.research - the conversation is a research one (its mode lists deep_research): its helpers search.
 * @param {boolean} want.off - the conversation's tools are switched off altogether.
 * @param {boolean} want.child - the agent is a helper started by the conversation, not the conversation itself.
 * @param {string[]} [want.offline] - other tools that reach the internet, taken away with the web.
 * @returns {{allow?: string[], deny?: string[]} | null} the mask, or null for no restriction.
 */
export function maskFor({ tools, web, research, off, child, offline = [] }) {
  if (off) return { allow: [] };
  // A helper of a research conversation (the Research tab) is the one that searches: it needs the
  // web tools whatever the conversation's own web level says.
  const needsWeb = web || (child && research);
  // Web off means no web at all: no search, no page reading, and no Deep research, which is made of them.
  if (tools === 'all') return needsWeb ? null : { deny: [...new Set([...WEB_TOOLS, RESEARCH_TOOL, ...offline])] };
  // Such a helper reads pages that may carry hidden instructions: it gets nothing that reaches the
  // user's own material or the conversation itself (the Library, drawings, the step list, questions).
  const leftToHelper = (tool) => !(child && research && helperLeaves(tool));
  const base = tools === 'none' ? [] : tools.filter((tool) => !WEB_TOOLS.includes(tool) && leftToHelper(tool) && (needsWeb || (tool !== RESEARCH_TOOL && !offline.includes(tool))));
  const allow = [...base];
  if (needsWeb) allow.push(...WEB_TOOLS);
  return { allow: [...new Set(allow)] };
}

/** Mission's step tool: the conversation conducts a run by calling it. */
export const LONG_STEP_TOOL = 'mission_step';

/**
 * A tab's starting choice of tools for a Long run (the owner's rule, 16 November 2026: a Long run runs
 * in its own tab with the tools it needs, switchable per tab and per run). Files and commands are on
 * everywhere; the web is on except in an isolated tab, which searches only with its own tools.
 * @param {object} mode - the tab's mode.
 * @param {{files?: unknown, web?: unknown} | undefined} saved - the choice saved on Settings → Modes, if any.
 * @returns {{files: boolean, web: boolean}} the starting choice.
 */
export function longToolsFor(mode, saved) {
  const isolated = mode?.isolated === true;
  return {
    files: typeof saved?.files === 'boolean' ? saved.files : true,
    web: isolated ? false : typeof saved?.web === 'boolean' ? saved.web : true,
  };
}

/**
 * The mask while a Long run is on in a conversation that is not isolated: the tab keeps its own tools,
 * gains Mission's step tool, and with Files and commands on gets every tool (as in Cowork). The web
 * follows the run's own switch. An isolated mode's tools stay with that mode.
 * @param {object} want - what applies.
 * @param {object} want.mode - the tab's mode.
 * @param {boolean} want.files - the run's Files and commands switch.
 * @param {boolean} want.web - the run's Web switch.
 * @param {boolean} [want.research] - a research tab (its helpers search).
 * @param {boolean} [want.child] - the agent is a helper.
 * @param {string[]} [want.offline] - tools that go online besides the web tools.
 * @param {string[]} [want.fenced] - the tools of isolated modes.
 * @returns {{allow?: string[], deny?: string[]} | null} the mask.
 */
export function longRunMask({ mode, files, web, research = false, child = false, offline = [], fenced = [] }) {
  const own = mode?.tools === 'all' ? 'all' : Array.isArray(mode?.tools) ? mode.tools : [];
  const tools = files || own === 'all' ? 'all' : [...own, LONG_STEP_TOOL];
  // A research tab's helpers search whatever the conversation's Web says, but not when the run's own Web is off.
  let mask = maskFor({ tools, web, research: research && web, off: false, child, offline });
  if (mask?.allow && !mask.allow.includes(LONG_STEP_TOOL)) mask = { allow: [...mask.allow, LONG_STEP_TOOL] };
  if (fenced.length === 0) return mask;
  if (!mask) return { deny: [...fenced] };
  if (mask.deny) return { deny: [...new Set([...mask.deny, ...fenced])] };
  return { allow: mask.allow.filter((name) => !fenced.includes(name)) };
}

/**
 * The mask of a conversation in an isolated mode: its own list, to the letter. No web search, no
 * Deep research, nothing for helpers.
 * @param {object} want - what applies to the agent.
 * @param {'all' | 'none' | string[]} want.tools - the mode's tools.
 * @param {boolean} [want.off] - the conversation's tools are switched off.
 * @param {boolean} [want.child] - the agent is a helper, not the conversation.
 * @param {boolean} [want.webOff] - the conversation's Web button is on Off: its own tools that go online are not offered.
 * @returns {{allow: string[]}} the mask.
 */
export function isolatedMask({ tools, off, child, webOff }) {
  if (off || child || !Array.isArray(tools)) return { allow: [] };
  const online = webOff ? webReaching(tools) : [];
  return { allow: tools.filter((name) => !online.includes(name)) };
}

/** The image tools of the Media tools add-on: they call the image service set there. */
export const IMAGE_TOOLS = ['generate_image', 'edit_image'];

/**
 * The numbers of a dotted IPv4 address.
 * @param {string} host - a host name.
 * @returns {number[] | null} the four numbers, or null when it is not one.
 */
function ipv4(host) {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every((part) => part <= 255) ? parts : null;
}

/**
 * Whether an address is on this Mac or on a private network: localhost, a `.local` name,
 * 127.0.0.0/8, ::1, 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 or fc00::/7.
 * @param {unknown} address - a web address (http or https).
 * @returns {boolean} true for such an address; false for any other, and for one that cannot be read.
 */
export function privateAddress(address) {
  let url;
  try {
    url = new URL(String(address ?? '').trim());
  } catch {
    return false;
  }
  if (!/^https?:$/.test(url.protocol)) return false;
  let host = url.hostname.toLowerCase();
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (!host) return false;
  if (host === 'localhost' || host.endsWith('.local')) return true;
  // An IPv4 address written as IPv6 (::ffff:7f00:1) counts as the IPv4 address.
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
  if (mapped) {
    const [high, low] = [parseInt(mapped[1], 16), parseInt(mapped[2], 16)];
    host = `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  const four = ipv4(host);
  if (four) {
    const [a, b] = four;
    return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  if (host === '::1') return true;
  // fc00::/7: the first group is four digits, fc.. or fd.. ("fc::" is 00fc, outside it).
  return /^f[cd][0-9a-f]{2}:/.test(host);
}

/**
 * The image tools to take away while Web is Off: all of them, unless the image service they call is
 * on this Mac or on a private network.
 * @param {object} want - the image service.
 * @param {unknown} [want.baseUrl] - its address (Media tools' `images.baseUrl`); unknown counts as outside.
 * @param {string[]} [want.names] - the image tools' names.
 * @returns {string[]} the names to take away; empty when the service is local.
 */
export function imageToolsOffline({ baseUrl, names = IMAGE_TOOLS } = {}) {
  return privateAddress(baseUrl) ? [] : [...new Set(names.filter((name) => typeof name === 'string' && name))];
}

/**
 * The tool mask of one agent, from everything that applies to it.
 * Names are not filtered against a visible list: in this dsh version many tools (web_fetch, read,
 * grep...) come from the Agent's preset and are not listed to plugins, yet a restriction can name
 * them. Names the app refuses are dropped when the mask is applied.
 * @param {object} want - what applies to the agent.
 * @param {{tools: 'all' | 'none' | string[], isolated?: boolean}} want.mode - its conversation's mode.
 * @param {boolean} [want.trimmed] - the conversation loads its tools as needed.
 * @param {string[]} [want.known] - every tool the app knows.
 * @param {string[]} [want.added] - families and single tools the conversation added (when trimmed).
 * @param {boolean} [want.web] - the conversation has the web.
 * @param {boolean} [want.research] - a research conversation: its helpers search.
 * @param {boolean} [want.off] - the conversation's tools are switched off.
 * @param {boolean} [want.child] - the agent is a helper.
 * @param {string[]} [want.fenced] - the tools of isolated modes, which no other conversation is offered.
 * @param {boolean} [want.webOff] - an isolated conversation's Web button is on Off.
 * @param {string[]} [want.online] - other tools that go online here (the image tools of an outside service).
 * @returns {{allow?: string[], deny?: string[]} | null} the mask, or null for no restriction.
 */
export function toolMaskFor({ mode, trimmed = false, known = [], added = [], web = false, research = false, off = false, child = false, fenced = [], webOff = false, online = [] }) {
  const offline = [...new Set([...webReaching(known), ...online.filter((name) => known.includes(name))])];
  if (trimmed) {
    const listed = trimAllowed(known, added);
    const mask = maskFor({ tools: listed, web, research, off: false, child, offline });
    return { allow: mask.allow.filter((name) => !fenced.includes(name)) };
  }
  if (mode.isolated) return isolatedMask({ tools: mode.tools, off, child, webOff });
  const mask = maskFor({ tools: mode.tools, web, research, off, child, offline });
  // The tools of an isolated mode belong to that mode alone: no other conversation is offered them.
  if (fenced.length === 0) return mask;
  if (!mask) return { deny: fenced };
  if (mask.deny) return { deny: [...new Set([...mask.deny, ...fenced])] };
  return { allow: mask.allow.filter((name) => !fenced.includes(name)) };
}

/**
 * Whether the model has any tools in this conversation, for the label in the chat box.
 * @param {{tools: 'all' | 'none' | string[], web: boolean, research: boolean, off: boolean}} want - as for `maskFor`.
 * @returns {'off' | 'on'} the state.
 */
export function toolsState(want) {
  const mask = maskFor({ ...want, child: false });
  return mask?.allow && mask.allow.length === 0 ? 'off' : 'on';
}

/**
 * The conversation that started a helper agent, from the helper's header.
 * @param {object} header - the agent's session header.
 * @returns {string | null} the parent's id, or null for a conversation of its own.
 */
export function parentIdOf(header) {
  const raw = header?.parentSession;
  const id = raw && typeof raw === 'object' ? raw.id ?? raw.sessionId : raw;
  return typeof id === 'string' && id ? id : null;
}

/**
 * The conversation at the top of a chain of helpers.
 * @param {string} id - an agent's id.
 * @param {Map<string, string>} parents - helper id -> the id of what started it.
 * @returns {string} the top conversation's id; `id` itself when it has no known parent.
 */
export function rootOf(id, parents) {
  let at = id;
  for (let depth = 0; depth < 12 && parents.has(at); depth += 1) at = parents.get(at);
  return at;
}

/** Programs that go online, where a command starts (after `;`, `&&`, `|`, `$(`, a backtick, `sudo` or `env`). */
const ONLINE_PROGRAMS = /(?:^|[;&|(`]\s*|\$\(\s*|\b(?:sudo|env|exec|xargs|time|nohup)\s+)(?:curl|wget|aria2c|httpie|https?|xh|nc|ncat|netcat|telnet|ssh|scp|sftp|ftp|lftp|rsync|ping6?|traceroute|dig|nslookup|host|whois|lynx|w3m|links|elinks|osascript\s+-e\s+['"]?open\s+location|yt-dlp|youtube-dl|gh|ollama\s+pull|docker\s+(?:pull|push|login|run))\b/im;
/** Other signs: a web address, fetching code, network installs and git remotes. */
const ONLINE_SIGNS = [
  /\b(?:https?|ftp|wss?):\/\//i,
  /\b(?:urllib|urlopen|requests\.(?:get|post|put|delete|head|Session)|http\.client|httpx|aiohttp|socket\.(?:create_connection|socket)|smtplib|ftplib|websocket)/,
  /\b(?:fetch|axios|got|undici|XMLHttpRequest)\s*\(|require\(\s*['"](?:https?|net|dgram|undici|axios|node-fetch)['"]\s*\)|from\s+['"](?:https?|net|undici|axios|node-fetch)['"]/,
  /\b(?:Net::HTTP|open-uri|LWP::|HTTP::Tiny|IO::Socket::INET|Invoke-WebRequest|Invoke-RestMethod|URLSession|NSURLConnection)\b/,
  /\b(?:pip3?|pipx|uv\s+pip|poetry|npm|pnpm|yarn|bun|gem|cargo|go|brew|apt(?:-get)?|port|conda|mamba)\s+(?:install|add|i|get|update|upgrade|fetch|search|view|info|outdated)\b/i,
  /\bgit\s+(?:clone|fetch|pull|push|ls-remote|submodule\s+update|remote\s+update)\b/i,
  /\bopen\s+(?:-a\s+\S+\s+)?['"]?(?:https?|ftp):/i,
];

/**
 * Whether a shell command looks like it goes online. A barrier, not a wall: it catches the usual
 * ways (programs, web addresses, fetching code, installs), not every possible one.
 * @param {unknown} command - the command text.
 * @returns {boolean} true when it should not run while the web is off.
 */
export function goesOnline(command) {
  const text = String(command ?? '');
  if (!text.trim()) return false;
  return ONLINE_PROGRAMS.test(text) || ONLINE_SIGNS.some((sign) => sign.test(text));
}

/** Network modules a program can load: Node's own and the usual web libraries. */
const NETWORK_MODULES = '(?:node:)?(?:https?|http2|net|tls|dgram|dns(?:/promises)?|undici|axios|node-fetch|got|ws|superagent)';
/** What a program uses to go online by itself. */
const PROGRAM_SIGNS = [
  // fetch(...), and fetch handed on (fetch.call, globalThis.fetch, globalThis['fetch']).
  /\bfetch\s*(?:\(|\.(?:call|apply|bind)\b)/,
  /\b(?:globalThis|window|self)\s*(?:\.\s*fetch\b|\[\s*['"`]fetch['"`]\s*\])/,
  /\b(?:XMLHttpRequest|WebSocket|WebSocketStream|EventSource|WebTransport|RTCPeerConnection)\b/,
  /\bsendBeacon\s*\(/,
  // require('https'), import('node:net'), import x from 'undici', import 'tls'.
  new RegExp(`(?:\\brequire\\s*\\(\\s*|\\bimport\\s*\\(\\s*|\\bfrom\\s+|\\bimport\\s+)(['"\`])${NETWORK_MODULES}\\1`),
  /\b(?:Deno\.(?:connect|connectTls|listen)|Bun\.(?:connect|listen))\s*\(/,
];
/** A program that starts other programs. */
const STARTS_PROGRAMS = /\bchild_process\b|\b(?:Bun\.spawn(?:Sync)?|Deno\.(?:Command|run))\b/;
/** The text inside quotes, backticks included. */
const QUOTED = /(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

/**
 * Whether a program (the code of a `run_code` call) goes online: it fetches, opens a web socket,
 * loads a network module, or starts a program that goes online (curl, wget and the like). A barrier,
 * not a wall: it catches the usual ways, not every possible one.
 * @param {unknown} source - the program's code.
 * @returns {boolean} true when it should not run while the web is off.
 */
export function programGoesOnline(source) {
  const text = String(source ?? '');
  if (!text.trim()) return false;
  if (PROGRAM_SIGNS.some((sign) => sign.test(text))) return true;
  if (!STARTS_PROGRAMS.test(text)) return false;
  // The commands it starts are in its strings: execSync('curl …'), spawn('wget', […]).
  for (const [, , inner] of text.matchAll(QUOTED)) if (goesOnline(inner)) return true;
  return false;
}

