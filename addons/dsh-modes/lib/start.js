/**
 * Starting values per mode (Settings → Modes → "Starting values for new conversations"): what the Web,
 * Depth, Models and Tools buttons read in a conversation that begins in a mode. Nothing is set until the
 * owner picks something: a missing or empty value is "usual" (the mode's own default and the one setting
 * for all modes), so an install that never opens the page behaves as before.
 *
 * The values are written once, when the conversation starts, into the same per-conversation settings the
 * buttons write (`sessionWeb`, `sessionWebLevel`, `sessionDepth`, `sessionHelpers`, `sessionTools`), so the
 * buttons, the prompt and the tool lists all read them the way they read a pick made by hand, and a pick
 * made later simply replaces them. A conversation that already has its own value in a field keeps it.
 */

/** The Web choices: Off, On (the usual level), or one of the three levels. */
export const START_WEB = ['off', 'on', 'verified', 'open', 'everything'];
/** The Depth choices. */
export const START_DEPTH = ['quick', 'standard', 'thorough'];
/** The Models choices: one model for every helper, or the role models. */
export const START_HELPERS = ['same', 'roles'];
/** The Tools choice: only Off is a start of its own (On is what every mode starts with). */
export const START_TOOLS = ['off'];

const plain = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');
/** The Web source ticks a start may hold (lib/sources.js KINDS, and in Recon its networks). */
const START_KINDS = ['verified', 'academic', 'news', 'sites', 'forums', 'social', 'archives', 'other'];
const START_NETS = ['tor', 'usenet', 'i2p'];

/** @returns {object} a JSON object from a stored string or an object; `{}` for anything else. */
function objectOf(value) {
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

/**
 * One mode's starting values, checked.
 * @param {unknown} raw - the stored entry for a mode.
 * @param {{isolated?: boolean}} [mode] - an isolated mode (Recon) keeps its own web rules: only Off is honoured there.
 * @returns {{web: string, depth: string, helpers: string, tools: string, sources?: string[]}} each value, or '' for usual;
 *   `sources` (the Web selector's ticks, 18 November) only when the owner saved some for the mode.
 */
export function normalizeStart(raw, { isolated = false } = {}) {
  const entry = raw && typeof raw === 'object' ? raw : {};
  const pick = (value, allowed) => (allowed.includes(plain(value)) ? plain(value) : '');
  const web = pick(entry.web, START_WEB);
  return {
    web: isolated && web !== 'off' ? '' : web,
    depth: pick(entry.depth, START_DEPTH),
    helpers: pick(entry.helpers, START_HELPERS),
    tools: pick(entry.tools, START_TOOLS),
    ...(Array.isArray(entry.sources) ? { sources: [...START_KINDS, ...(isolated ? START_NETS : [])].filter((kind) => entry.sources.includes(kind)) } : {}),
  };
}

/**
 * The settings to write for a conversation that starts in a mode.
 * @param {object} start - `normalizeStart` output.
 * @param {object} current - the live settings (`sessionWeb`, `sessionWebLevel`, `sessionDepth`, `sessionHelpers`, `sessionTools`; JSON strings or objects).
 * @param {string} sessionId - the conversation.
 * @returns {Array<{op: 'set', path: string[], value: string}>} the operations; none when there is nothing to set.
 */
export function startOps(start, current, sessionId) {
  const ops = [];
  const own = (field) => objectOf(current?.[field]);
  const put = (field, value, drop = false) => {
    const next = { ...own(field) };
    if (drop) delete next[sessionId];
    else next[sessionId] = value;
    ops.push({ op: 'set', path: [field], value: JSON.stringify(next) });
  };
  if (start.web && own('sessionWeb')[sessionId] === undefined) {
    put('sessionWeb', start.web !== 'off');
    if (start.web !== 'off') {
      if (start.web === 'on') put('sessionWebLevel', '', true);
      else put('sessionWebLevel', start.web);
    }
  }
  // The Web selector's ticks for this tab (the popup's "Start new conversations here with these"), unless the
  // conversation has its own, or starts with the Web Off.
  if (Array.isArray(start.sources) && start.web !== 'off' && own('sessionWebSources')[sessionId] === undefined) put('sessionWebSources', start.sources);
  if (start.depth && own('sessionDepth')[sessionId] === undefined) put('sessionDepth', start.depth);
  if (start.helpers && own('sessionHelpers')[sessionId] === undefined) put('sessionHelpers', start.helpers);
  if (start.tools === 'off' && own('sessionTools')[sessionId] === undefined) put('sessionTools', false);
  return ops;
}
