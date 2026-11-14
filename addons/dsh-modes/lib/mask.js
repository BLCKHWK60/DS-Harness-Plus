/**
 * Which tools a conversation, or a helper agent working for it, may use.
 * Kept apart from the plugin so it can be tested without the app.
 */

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
  ],
  prefixes: ['finance_'],
};

/**
 * @param {string[]} known - the tools the app knows.
 * @returns {string[]} those of them that reach the internet, besides the web tools and the research tool.
 */
export function webReaching(known) {
  return (Array.isArray(known) ? known : []).filter((name) => WEB_REACHING.names.includes(name) || WEB_REACHING.prefixes.some((prefix) => name.startsWith(prefix)));
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
  const base = tools === 'none' ? [] : tools.filter((tool) => !WEB_TOOLS.includes(tool) && (needsWeb || (tool !== RESEARCH_TOOL && !offline.includes(tool))));
  const allow = [...base];
  if (needsWeb) allow.push(...WEB_TOOLS);
  return { allow: [...new Set(allow)] };
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

