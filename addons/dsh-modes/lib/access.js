/**
 * Tool access, part 2: states per tool and mode (On / Ask / Off / Locked), grants, and the policy that
 * decides what happens when the AI asks for a tool. Pure functions: no files, no app.
 *
 * Rules that never bend (each has a test):
 *  - A grant can only ADD a tool. It never lifts a fence: the tools an isolated mode keeps for itself,
 *    Web Off, the conversation's Tools switch, or any add-on's own final guard (those run when a tool
 *    is called, after this).
 *  - Off beats a grant. Locked modes keep their own list (Recon may be given tools through the popup).
 *  - Tier 4 tools are never requestable; tier 3 and above are never granted beyond one conversation, and
 *    after outside material (a web page, a file) was read, only once.
 *  - The headline of a request is written here, never by the model. The AI's reason is shown as
 *    untrusted text.
 */
import { CATALOG_TOOL, LOCKED_MODES, RECON_NEVER, REQUEST_TOOL, SETTINGS_ONLY, TIERS, HIDDEN_FROM_AI, classify, isOwnTool } from './catalog.js';
import { RECON_LIMIT_TEXT, reconMayAsk } from './online.js';

export const STATES = ['on', 'ask', 'off', 'locked'];
/** What the owner can choose in a cell. */
export const CHOICE_STATES = ['on', 'ask', 'off'];
/** Longest reason the AI may give. */
export const REASON_MAX = 300;
/** A request nobody answers counts as "not answered" after this long. */
export const ASK_WAIT_MS = 10 * 60_000;
/** Modes a conversation is held in with no tools at all: nothing is ever added there. */
export const NO_TOOL_MODES = ['isolated-late', 'isolated-locked'];
/** The scopes of a permission, shortest first. */
export const SCOPES = ['once', 'conversation', 'mode', 'always'];

/**
 * Read the stored grid.
 * @param {unknown} value - the `toolAccess` setting (JSON text or an object).
 * @returns {Record<string, {groups: Record<string, string>, tools: Record<string, string>}>} mode id -> its choices; damaged input reads as nothing chosen.
 */
export function parseAccess(value) {
  let raw = value;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const pick = (map) => {
    const out = {};
    if (map && typeof map === 'object' && !Array.isArray(map)) for (const [key, state] of Object.entries(map)) if (CHOICE_STATES.includes(state) && typeof key === 'string' && key.length <= 128) out[key] = state;
    return out;
  };
  const result = {};
  for (const [mode, entry] of Object.entries(raw)) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(mode) || !entry || typeof entry !== 'object') continue;
    result[mode] = { groups: pick(entry.groups), tools: pick(entry.tools) };
  }
  return result;
}

/**
 * @returns {boolean} whether a mode is fixed by its own safety rules. Item 4A, stage 6a: a guarded copy (a guest in
 * Devices or Workshop) too: grid choices and "mode" grants of its mode never carry into it (I17).
 */
export function lockedMode(mode) {
  return Boolean(mode) && (mode.isolated === true || Boolean(mode.guardedBy) || LOCKED_MODES.includes(mode.id));
}

/**
 * The state of one tool in one mode.
 * @param {string} name - the tool.
 * @param {object} want - what applies.
 * @param {{id: string, isolated?: boolean}} want.mode - the mode.
 * @param {ReturnType<typeof parseAccess>} want.access - the stored grid.
 * @param {boolean} want.offered - whether the mode offers the tool today (its list, before this overlay).
 * @returns {'on' | 'ask' | 'off' | 'locked'} the state. A tool the mode does not offer starts on Ask, except tier 4 and secrets (Off).
 */
export function stateOf(name, { mode, access, offered }) {
  // The two Tool access tools sit outside the grid: always on while Tool access is on (the AI can always look and ask).
  if (isOwnTool(name)) return 'on';
  if (lockedMode(mode)) return 'locked';
  const entry = classify(name);
  // The secret store and the Keychain are never switched on by a choice (not by the page, not by a call to it, not by an edited grid): they follow what the tab offers.
  if (HIDDEN_FROM_AI(name)) return offered ? 'on' : 'off';
  const mine = access?.[mode?.id];
  let chosen = mine?.tools?.[name];
  // A whole group never opens a tier 4 tool: those are switched on one by one, by the owner.
  if (!chosen && entry.tier < SETTINGS_ONLY && !HIDDEN_FROM_AI(name)) chosen = mine?.groups?.[entry.group];
  if (entry.tier >= SETTINGS_ONLY || HIDDEN_FROM_AI(name)) {
    // Never "Ask": it cannot be requested.
    if (chosen === 'ask') return 'off';
    return chosen ?? (offered ? 'on' : 'off');
  }
  return chosen ?? (offered ? 'on' : 'ask');
}

/**
 * The mask after the grid and the grants: the mode's own mask (`mask`) with tools set to Ask or Off taken
 * away, tools set to On added, and granted tools added. With nothing chosen and nothing granted the
 * mask comes back unchanged (the same object), so today's behaviour is exactly kept.
 * @param {object} want - what applies.
 * @param {{allow?: string[], deny?: string[]} | null} want.mask - the mask the mode's own rules gave.
 * @param {string[]} want.known - every tool the app knows.
 * @param {{id: string, isolated?: boolean}} want.mode - the conversation's mode.
 * @param {ReturnType<typeof parseAccess>} [want.access] - the stored grid.
 * @param {string[]} [want.granted] - tools granted to this conversation now (once, conversation, mode, always).
 * @param {string[]} [want.blocked] - fences: tools no choice and no grant may add (Web Off, tools of isolated modes, tools of a mode a conversation is not in).
 * @param {boolean} [want.off] - the conversation's Tools switch is off: nothing is added or changed.
 * @param {boolean} [want.noAdd] - add nothing (a helper that reads outside pages).
 * @param {string[]} [want.online] - image tools found to go online (for Recon's own limit).
 * @returns {{allow?: string[], deny?: string[]} | null} the mask to apply.
 */
export function applyAccess({ mask, known, mode, access, granted = [], blocked = [], off = false, noAdd = false, online = [] }) {
  if (off || !Array.isArray(known) || known.length === 0) return mask;
  const locked = lockedMode(mode);
  const hasGrid = Boolean(access?.[mode?.id]) && (Object.keys(access[mode.id].groups).length > 0 || Object.keys(access[mode.id].tools).length > 0);
  // In a locked tab (Recon) a permission only ever adds a tool Recon may ask for at all (lib/online.js): never one that can go online.
  const grants = noAdd || NO_TOOL_MODES.includes(mode?.id) ? [] : granted.filter((name) => !HIDDEN_FROM_AI(name) && classify(name).tier < SETTINGS_ONLY && !RECON_NEVER.includes(name) && (!locked || reconMayAsk(name, { online })));
  if (locked ? grants.length === 0 : !hasGrid && grants.length === 0) return mask;
  const fence = new Set(blocked);
  const known_ = new Set(known);
  const base = mask?.allow ? new Set(mask.allow) : new Set(known.filter((name) => !(mask?.deny ?? []).includes(name)));
  const add = new Set();
  const remove = new Set();
  const grantSet = new Set(grants);
  for (const name of known_) {
    // The two Tool access tools are not the grid's to take away (the wiring adds them on top).
    if (isOwnTool(name)) continue;
    const offered = base.has(name);
    const state = stateOf(name, { mode, access, offered });
    if (state === 'locked') {
      // The mode's own list stands; only a grant adds (below).
      if (!offered && grantSet.has(name)) add.add(name);
      continue;
    }
    if (state === 'on') {
      if (!offered) add.add(name);
    } else if (state === 'ask') {
      if (offered && !grantSet.has(name)) remove.add(name);
      else if (!offered && grantSet.has(name)) add.add(name);
    } else if (offered) remove.add(name); // off: never offered, a grant does not bring it back
  }
  for (const name of [...add]) if (fence.has(name)) add.delete(name);
  if (add.size === 0 && remove.size === 0) return mask;
  if (mask?.allow) {
    const next = [...new Set([...mask.allow.filter((name) => !remove.has(name)), ...add])];
    return { allow: next };
  }
  const deny = [...new Set([...(mask?.deny ?? []), ...remove])].filter((name) => !add.has(name));
  return deny.length > 0 ? { deny } : null;
}

/** @returns {string} the longest scope allowed for a tier. */
export function longestScope(tier, { outsideMaterial = false, recon = false } = {}) {
  let top = tier <= 0 ? 'always' : tier === 1 ? 'always' : tier === 2 ? 'mode' : 'conversation';
  // After outside material was read: tier 3 and above only once, everything else at most this conversation.
  if (outsideMaterial) top = tier >= 3 ? 'once' : SCOPES.indexOf(top) > 1 ? 'conversation' : top;
  if (recon && SCOPES.indexOf(top) > 1) top = 'conversation';
  return top;
}

const LABELS = {
  once: 'Allow once',
  conversation: 'Allow in this thread',
  mode: 'Allow in this mode',
  always: 'Always allow',
  deny: 'Deny',
  never: "Don't ask again",
};

/** What was read from outside, in plain words, for the warning on the card. */
const OUTSIDE_KINDS = {
  web: { read: 'a web page', carry: 'Pages' },
  file: { read: 'a file', carry: 'Files' },
  app: { read: 'something from another app (mail, notes)', carry: 'Mail and notes' },
  helper: { read: 'what a helper brought back', carry: 'What a helper read' },
};

/**
 * The words on the card, written here and not by the model.
 * @param {object} want - what the card is for.
 * @param {string} want.tool - the raw tool name.
 * @param {string} [want.reason] - the AI's reason, as it wrote it.
 * @param {unknown} [want.outsideMaterial] - what was read just before: 'web', 'file' or true; falsy for nothing.
 * @param {boolean} [want.recon] - the request comes from Recon.
 * @param {boolean} [want.helper] - a helper agent asked, not the conversation itself.
 * @returns {{headline: string, risk: string, tier: number, reasonLine: string, reason: string, outsideWarning: string, reconWarning: string, helperWarning: string}} the parts.
 */
export function wording({ tool, reason, outsideMaterial, recon = false, helper = false }) {
  const entry = classify(tool);
  const tier = TIERS[entry.tier] ?? TIERS[3];
  const risk = recon ? 'Highest' : tier.word === 'High' ? 'High' : tier.word;
  const says = recon ? 'it can open a way out of a sealed thread, and what Recon read could leave with it' : tier.says;
  const cleaned = cleanReason(reason);
  const kind = OUTSIDE_KINDS[outsideMaterial] ?? OUTSIDE_KINDS.web;
  return {
    headline: `${helper ? 'A helper of the AI asks' : 'The AI asks'} to use: ${entry.plain}${entry.plain === tool ? '' : ` (${tool})`}. Risk: ${risk}, ${says}.`,
    risk,
    tier: entry.tier,
    reasonLine: cleaned ? `The AI's reason, in its own words (not checked): “${cleaned}”` : "The AI gave no reason.",
    reason: cleaned,
    outsideWarning: outsideMaterial ? `Earlier in this thread it read ${kind.read}. ${kind.carry} can carry instructions meant to trick the AI.` : '',
    helperWarning: helper ? 'A helper agent asked for this, not the thread itself.' : '',
    reconWarning: recon ? 'This is Recon, which is sealed on purpose. Only allow this if you asked for it yourself.' : '',
  };
}

/**
 * A reason made safe to show: plain text, one line, at most 300 characters.
 * @param {unknown} value - what the AI wrote.
 * @returns {string} the cleaned text.
 */
export function cleanReason(value) {
  // Control characters, line breaks and the marks that bend text direction come out; quotes stay as typed.
  // eslint-disable-next-line no-control-regex
  return String(value ?? '').replace(/[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, REASON_MAX);
}

/**
 * What to do with a request for a tool.
 * @param {object} want - everything the decision depends on.
 * @param {string} want.tool - the raw tool name.
 * @param {string} [want.reason] - the AI's reason.
 * @param {{id: string, label?: string, isolated?: boolean}} want.mode - the conversation's mode.
 * @param {'on' | 'ask' | 'off' | 'locked'} want.state - the tool's state in this mode now.
 * @param {boolean} want.known - the app has the tool at all.
 * @param {boolean} [want.addonOff] - the tool's add-on is switched off.
 * @param {boolean} [want.fenced] - something outside Tool access keeps the tool out (Web Off, an isolated mode's own tools).
 * @param {string} [want.fenceWhy] - plain words for the fence.
 * @param {boolean} [want.unattended] - nobody is there to answer (an Automation, a Mission run with no wait).
 * @param {unknown} [want.outsideMaterial] - what outside material was read just before ('web', 'file' or true).
 * @param {boolean} [want.reconExport] - the conversation holds material exported from Recon.
 * @param {boolean} [want.blockedByUser] - the user chose "Don't ask again" for this tool.
 * @param {boolean} [want.toolsOff] - the conversation's Tools switch is off.
 * @param {boolean} [want.helper] - a helper agent asks, not the conversation itself.
 * @param {boolean} [want.helperReadsPages] - that helper reads outside pages: it may not ask for more than tier 1.
 * @param {boolean} [want.deniedRecently] - the user said no to this tool in this conversation a moment ago.
 * @param {boolean} [want.unansweredRecently] - the same request was not answered (no card, or a time-out) a moment ago.
 * @param {boolean} [want.tooManyNoes] - the user has said no (or not answered) to several requests of this conversation already.
 * @param {string[]} [want.online] - image tools found to go online (for Recon's own limit).
 * @param {boolean} [want.tooMany] - too many requests are waiting already.
 * @returns {object} `{action: 'refuse', code, text}` or `{action: 'ask', tier, choices, longest, wording}`.
 */
export function decide(want) {
  const { tool, mode, state } = want;
  const refuse = (code, text) => ({ action: 'refuse', code, text, tool });
  const entry = classify(tool);
  const recon = mode?.isolated === true || mode?.id === 'recon';
  if (!tool || typeof tool !== 'string') return refuse('unknown', 'No tool was named.');
  if (tool === REQUEST_TOOL || tool === CATALOG_TOOL) return refuse('self', 'You already have this tool.');
  if (want.toolsOff) return refuse('tools-off', 'Tools are switched off in this thread by the user. Nothing can be requested. Carry on without tools.');
  if (mode && NO_TOOL_MODES.includes(mode.id)) return refuse('locked', 'This thread is kept without tools. It cannot be given any here.');
  if (HIDDEN_FROM_AI(tool) || RECON_NEVER.includes(tool)) return refuse('never', 'That can never be requested. Only the user can open it, in Settings.');
  if (entry.tier >= SETTINGS_ONLY) return refuse('never', `"${entry.plain}" cannot be requested by the AI. Only the user can switch it on, in Settings → Tool access. Carry on without it.`);
  if (!want.known && !want.addonOff) return refuse('unknown', `No tool called "${tool}" exists here. Call ${CATALOG_TOOL} to see the names.`);
  if (want.addonOff) return refuse('addon-off', `The add-on that brings "${entry.plain}" is switched off. It cannot be used until the user switches it on in Settings.`);
  // Recon keeps the final say: it may only ask for tools that stay on this Mac (one list, lib/online.js, shared with the guard that runs a tool).
  if (recon && !reconMayAsk(tool, { online: want.online })) return refuse('recon-limit', RECON_LIMIT_TEXT);
  if (state === 'on') return refuse('already', 'This tool is already available. Just call it.');
  if (state === 'off') return refuse('off', 'The user has switched this tool off here. It cannot be requested.');
  if (state === 'locked' && !recon) return refuse('locked', "This mode's own safety rules fix its tools. It cannot be requested here.");
  if (want.fenced) return refuse('fenced', want.fenceWhy || 'Something the user switched off keeps this tool out here (for example Web Off). A permission cannot lift that.');
  if (want.blockedByUser) return refuse('dont-ask', 'The user chose not to be asked about this tool again. Do not ask again; carry on without it.');
  if (want.deniedRecently) return refuse('denied-recently', `The user said no to "${entry.plain}" a moment ago. Do not ask again now; carry on without it.`);
  if (want.unansweredRecently) return refuse('unanswered-recently', `Your request for "${entry.plain}" was not answered a moment ago. Do not ask again now; carry on without it and say in your report that this is waiting for the user.`);
  if (want.tooManyNoes) return refuse('too-many-noes', 'The user has said no to, or not answered, several of your requests in this thread. Do not ask for any more tools now; carry on with what you have.');
  if (want.helper && want.helperReadsPages && entry.tier >= 2) return refuse('helper-limit', 'A helper that reads web pages may only ask for tools that look or read (tier 0 and 1).');
  if (want.reconExport && entry.tier >= 2) return refuse('recon-export', 'This thread holds material from Recon. Only tools that look or read (tier 0 and 1) can be requested here.');
  if (want.tooMany) return refuse('too-many', 'Too many requests are waiting for the user already. Carry on without this tool.');
  if (want.unattended) return refuse('unattended', `Nobody is there to answer, so "${entry.plain}" was not allowed. Carry on without it, and say in your report that this is waiting for the user.`);
  const longest = longestScope(entry.tier, { outsideMaterial: Boolean(want.outsideMaterial), recon });
  const top = SCOPES.indexOf(longest);
  const choices = [...SCOPES.slice(0, top + 1), 'deny', 'never'].map((id) => ({ id, label: LABELS[id] }));
  return {
    action: 'ask',
    tool,
    tier: entry.tier,
    longest,
    recon,
    choices,
    // Esc and a click outside mean Deny. Nothing is bound to Enter.
    defaultChoice: 'deny',
    wording: wording({ tool, reason: want.reason, outsideMaterial: want.outsideMaterial, recon, helper: want.helper === true }),
  };
}

/** @returns {string} what the AI is told after an answer. */
export function answerText(choice, tool) {
  const entry = classify(tool);
  if (choice === 'deny' || choice === 'never') return `The user said no to "${entry.plain}". Do not try it another way and do not ask again; carry on without it or say what you could not do.`;
  if (choice === 'timeout') return `The user did not answer about "${entry.plain}" in time. Do not ask again; carry on without it and say in your report that this is waiting for the user.`;
  if (choice === 'unavailable') return `"${entry.plain}" needs the user's yes, and they could not be asked just now. Carry on without it.`;
  if (choice === 'once') return `Allowed for exactly ONE call of ${tool}. Once you have called it, the permission is used up and a second call is refused; it also lapses when this turn ends. Ask again if you need it again.`;
  return `Allowed: you may call ${tool} ${choice === 'conversation' ? 'in this thread' : choice === 'mode' ? 'in this mode' : 'from now on'}.`;
}

/** Whether a grant is still valid. */
export function live(grant, now = Date.now()) {
  return Boolean(grant) && (grant.expiresAt === undefined || grant.expiresAt === null || grant.expiresAt > now) && !(grant.scope === 'once' && grant.used === true);
}

/**
 * The tools a conversation is granted now.
 * @param {object[]} grants - stored grants.
 * @param {{sessionId: string, modeId: string, locked?: boolean}} where - the conversation and its mode. `locked`: a tab that keeps its own tools (Recon, Devices, Creator Plus) takes only permissions given in its own popup for this one conversation, never a permission for a mode or for good.
 * @param {number} [now] - the time.
 * @returns {string[]} tool names.
 */
export function grantedTools(grants, { sessionId, modeId, locked = false }, now = Date.now()) {
  const out = new Set();
  for (const grant of grants ?? []) {
    if (!live(grant, now)) continue;
    if (locked && !((grant.scope === 'conversation' || grant.scope === 'once') && grant.sessionId === sessionId && grant.modeId === modeId)) continue;
    if (grant.scope === 'always' || (grant.scope === 'mode' && grant.modeId === modeId) || ((grant.scope === 'conversation' || grant.scope === 'once') && grant.sessionId === sessionId)) out.add(grant.tool);
  }
  return [...out];
}
