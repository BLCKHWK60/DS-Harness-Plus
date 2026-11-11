/**
 * Which tools a conversation, or a helper agent working for it, may use.
 * Kept apart from the plugin so it can be tested without the app.
 */

/** Web tools the Search switch turns on or off. */
export const WEB_TOOLS = ['web_search', 'web_fetch'];
/** The tool the Deep research switch makes available. Its helpers do the searching. */
export const RESEARCH_TOOL = 'deep_research';

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
 * @param {boolean} want.research - the Deep research switch of the conversation.
 * @param {boolean} want.off - the conversation's tools are switched off altogether.
 * @param {boolean} want.child - the agent is a helper started by the conversation, not the conversation itself.
 * @returns {{allow?: string[], deny?: string[]} | null} the mask, or null for no restriction.
 */
export function maskFor({ tools, web, research, off, child }) {
  if (off) return { allow: [] };
  // A helper of a conversation with Deep research on is the one that searches: it needs the web
  // tools even when the conversation's own Search switch is off.
  const needsWeb = web || (child && research);
  if (tools === 'all') return needsWeb ? null : { deny: [...WEB_TOOLS] };
  const base = tools === 'none' ? [] : tools.filter((tool) => !WEB_TOOLS.includes(tool));
  const allow = [...base];
  if (needsWeb) allow.push(...WEB_TOOLS);
  if (research && !child) allow.push(RESEARCH_TOOL);
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
