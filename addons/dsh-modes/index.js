/**
 * Host half of Modes.
 *
 * A mode is a per-session setting that can change at any time: it narrows the
 * tools the model sees, can set the session's sandbox mode, can move the
 * session to a default tier, and adds a short prompt section. dsh agent
 * presets are fixed when a session is created, so modes are applied to the
 * live Agent instead.
 *
 * Changes apply at a turn boundary (when the Agent is idle), never in the
 * middle of a turn.
 */
import z from '@deepseek-ai/schemastery';
import { IMAGE_TOOLS, WEB_TOOLS, goesOnline, imageToolsOffline, oldWebMarks, parentIdOf, programGoesOnline, researchTab, rootOf, toolMaskFor, webFor, webReaching } from './lib/mask.js';
import { trashedIds } from './lib/trashed.js';
import { fromScheduler, scheduledModeId } from './lib/scheduled.js';
import { PROGRAM_TOOL, programNote, programOnly, SLOW_TOOLS } from './lib/ptc.js';
import { helpersBelow, onlyStopNotes, stoppedByUser } from './lib/stop.js';
import { CORE, FAMILIES, FIND_TOOL, brings, catalog as trimCatalog, mentioned, others as trimOthers, resolveRequest, skillFamilies } from './lib/trim.js';
import { dropIsolatedNotes, heldMode, isolatedMayRun, modeChangeRefusal } from './lib/isolation.js';
import { promptText } from './lib/prompt.js';
import { movedSince, readBase, readEntry, sandboxStep } from './lib/sandbox.js';
import { beforeFirstMessage, sidebarTabs, tabCount } from './lib/tabs.js';

export { CODE_METHOD, COWORK_METHOD, ISOLATED_LEVEL_PROMPTS, ISOLATED_OFF_PROMPT, SEARCH_DEPTH_PROMPTS } from './lib/prompt.js';

export const name = 'modes';
/** The chat box asks here which tools the model can call in a conversation (header `x-dsh-session`). */
export const TOOLS_PATH = '/dsh-modes/tools';
export const inject = ['tools'];

/** Modes that exist until the user supplies their own `modes` JSON. */
const BUILTIN_MODES = {
  chat: {
    label: 'Chat',
    tools: 'none',
    sandbox: 'read-only',
    defaultTier: '',
    prompt:
      'You are in Chat mode: answer directly in one reply. You cannot read or change files or run commands. If a task needs those, say so and suggest switching to Cowork or Code mode.',
  },
  cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' },
  code: { label: 'Code', tools: 'all', sandbox: 'workspace-write', defaultTier: '', prompt: '' },
};

/** The answer to a program started in a conversation that has no tools (the app's PTC preset keeps `run_code` on offer). */
const NO_PROGRAMS = 'no tools are available in this conversation, so programs are not run. Answer directly.';
/** The answer to a shell command that goes online while Web is Off. */
const SHELL_OFFLINE = 'web access is Off in this conversation, so commands that go online (curl, wget, web addresses, downloads, installs, code that fetches) are not run. Answer without the web, or ask the user to switch Web on in the chat box.';
/** The answer to a program that goes online while Web is Off. */
const PROGRAM_OFFLINE = 'web access is Off in this conversation, so programs that go online (fetch, web sockets, network modules, or starting curl, wget and the like) are not run. Answer without the web, or ask the user to switch Web on in the chat box.';
/** Added to the system prompt while the Deep research switch is on. */
const RESEARCH_PROMPT =
  'Deep research is switched on for this conversation: for questions that need looking things up, use the deep_research tool to research them thoroughly and answer with a cited report. For small talk or follow-ups about an earlier report, answer directly.';

/** The text of one message, whatever its shape. */
function textOf(message) {
  const content = message?.content ?? message?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part === 'string' ? part : part?.text ?? '')).join(' ');
  return '';
}

/** The three steps of the Depth choices (Deep research runs, the Research tab). */
export const DEPTH_IDS = ['quick', 'standard', 'thorough'];
/** The levels of the Web button in the chat box, below Off. */
export const SEARCH_LEVELS = ['quick', 'standard', 'thorough', 'deep'];

/**
 * A Web level, checked.
 * @param {unknown} value - quick, standard, thorough or deep.
 * @returns {string} the level; standard when unknown.
 */
export function searchLevel(value) {
  const id = String(plain(value) ?? '').toLowerCase();
  return SEARCH_LEVELS.includes(id) ? id : 'standard';
}
/**
 * A slider step, checked.
 * @param {unknown} value - quick, standard or thorough.
 * @returns {string} the step; standard when unknown.
 */
export function depthId(value) {
  const id = String(plain(value) ?? '').toLowerCase();
  return DEPTH_IDS.includes(id) ? id : 'standard';
}

/** Sandbox values a mode may set. `danger-full-access` is deliberately not allowed here. */
const SANDBOX_VALUES = ['inherit', 'read-only', 'workspace-write'];

export const Config = z.object({
  /** Mode definitions as a JSON object: `{ id: { label, tools, sandbox, defaultTier, prompt } }`. */
  modes: z.string().default(JSON.stringify(BUILTIN_MODES)).volatile(),
  /**
   * Modes that other add-ons add, in the same JSON shape. They come after the modes above and never
   * replace one of them. An add-on writes its own entry here and removes it when it is switched off.
   */
  extraModes: z.string().default('{}').volatile(),
  /** Mode of a session that has not chosen one. */
  defaultMode: z.string().default('cowork').volatile(),
  /**
   * Mode of a conversation that an Automation task opens. Nobody picked a tab for it, so the tab last
   * looked at must not decide. An unknown id falls back to the first mode with all tools.
   * Chosen on Settings → Modes.
   */
  scheduledMode: z.string().default('cowork').volatile(),
  /** Per-session choice as JSON: `{ sessionId: modeId }`. Written by the composer selector. */
  sessionModes: z.string().default('{}').volatile(),
  /** Conversations that began in an isolated mode (id -> true). They stay isolated whatever happens to the mode. */
  sessionIsolated: z.string().default('{}').volatile(),
  /** Drop per-session entries whose Session is no longer stored, once per start. */
  pruneStaleSessions: z.boolean().default(true),
  /**
   * When a top-level Session starts its first turn without a chosen mode, record the mode it starts in.
   * A later change of `defaultMode` (for example from a sidebar tab) then only affects new Sessions.
   */
  pinOnFirstTurn: z.boolean().default(true),
  /** Per-session web switch as JSON: `{ sessionId: true | false }`. Missing = the mode's default (off in a no-tools mode). */
  sessionWeb: z.string().default('{}').volatile(),
  /** Obsolete: the old per-conversation Deep research switch, no longer offered or read (kept so older settings files still load). Old entries are pruned with the others. */
  sessionResearch: z.string().default('{}').volatile(),
  /** Per-session Web level as JSON: `{ sessionId: 'quick' | 'standard' | 'thorough' | 'deep' }`. Missing = `searchDepth`. */
  sessionSearchDepth: z.string().default('{}').volatile(),
  /** Per-session tools switch as JSON: `{ sessionId: false }`. While off, the model is offered no tool at all. */
  sessionTools: z.string().default('{}').volatile(),
  /** The Web level new conversations start with (quick, standard, thorough, deep): how hard the model searches. A conversation's own pick on the Web button is kept in `sessionSearchDepth`. */
  searchDepth: z.string().default('standard').volatile(),
  /** Give the Code mode a working method (read first, small changes, run the tests, report plainly) while it has no instructions of its own. */
  codeMethod: z.boolean().default(true).volatile(),
  /** Give the Cowork mode a working method (understand the task, a step list, care with the user's files, check the result, report plainly) while it has no instructions of its own. */
  coworkMethod: z.boolean().default(true).volatile(),
  /**
   * Per-conversation access level from before a mode changed it, as JSON:
   * `{ sessionId: { mode: 'chat', base: 'workspace-write', set: 'read-only' } }` (`mode`: the mode
   * the level was last applied for; `set`: the level that mode set). Leaving the mode puts `base`
   * back, also after a restart, unless the level was changed by hand since. A conversation whose
   * mode is no longer `mode` when it is opened was moved while closed: it gets its new mode's level.
   */
  sessionSandboxBase: z.string().default('{}').volatile(),
  /** Depth of a Deep research run (quick, standard, thorough): how many rounds and helpers it uses. Chosen in the Research tab's chat box and in Settings → Research. One setting for all conversations. */
  researchDepth: z.string().default('standard').volatile(),
  /**
   * Which model Deep research's helpers run on: `same` (the model of the conversation that started
   * the research) or `roles` (the role models set in Settings → Model Tiers). All conversations.
   */
  researchModel: z.string().default('same').volatile(),
  /**
   * The same choice for one conversation, as JSON: `{ sessionId: 'same' | 'roles' }`. It decides for
   * every tool that starts helper agents (Mission, Deep research, Agent swarm, the Tier tools, Code
   * power). A conversation without an entry follows `researchModel`, which is the default for all.
   */
  sessionHelpers: z.string().default('{}').volatile(),
  /** A Rerun button under every answer: asks the same question again, with the model now selected, in a fresh copy of the conversation. */
  rerunButton: z.boolean().default(true).volatile(),
  /** Hide the app's thumbs-up and thumbs-down buttons under answers. */
  hideFeedback: z.boolean().default(false).volatile(),
  /** Name of the slash command that switches modes. */
  commandName: z.string().default('mode'),
  /**
   * Modes with all tools that load them as needed: a core set and `tools_find` at first, other
   * families when the model asks for them or the user's message mentions them.
   */
  trimModes: z.array(z.string()).default(['cowork', 'code', 'data']).volatile(),
  /** Tool families a conversation added, as JSON: `{ sessionId: ['pdf', 'data'] }`. */
  sessionToolSets: z.string().default('{}').volatile(),
  /** Done once (0.55.1): old "Search off" marks cleared where Web Off would now block a tab's own search tools. */
  webMarksCleared: z.boolean().default(false).volatile(),
  /** Done once (0.57.0): 'data' added to a stored `trimModes` list that lacked it (Data loads its tools as needed). */
  dataTrimAdded: z.boolean().default(false).volatile(),
});

/**
 * Unwrap a Config value that may be a reactive reference.
 * @param {unknown} value - Config value.
 * @returns {unknown} plain value.
 */
function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return plain(value.get());
    } catch {
      return undefined;
    }
  }
  if (Array.isArray(value)) return value.map(plain);
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = plain(child);
  return result;
}

/**
 * Parse a Config field holding a JSON object (or an object already).
 * @param {unknown} value - field value.
 * @returns {Record<string, unknown>} object, or an empty one.
 */
function readObject(value) {
  const raw = plain(value);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Normalize one mode definition.
 * @param {string} id - mode id.
 * @param {unknown} value - stored definition.
 * @returns {object | undefined} mode, or undefined when the id or shape is invalid.
 */
export function normalizeMode(id, value) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || !value || typeof value !== 'object') return undefined;
  let tools = 'all';
  if (value.tools === 'none') tools = 'none';
  else if (Array.isArray(value.tools)) {
    tools = value.tools.filter((entry) => typeof entry === 'string' && entry.length > 0);
  }
  return {
    id,
    label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id,
    tools,
    sandbox: SANDBOX_VALUES.includes(value.sandbox) ? value.sandbox : 'inherit',
    defaultTier: typeof value.defaultTier === 'string' ? value.defaultTier.trim() : '',
    prompt: typeof value.prompt === 'string' ? value.prompt.trim().slice(0, 4000) : '',
    // An isolated mode: its conversations get exactly the tools it lists and nothing else of the
    // app, and they can never become a conversation of another mode.
    isolated: value.isolated === true,
    // Its prompt holds rules of its own (Scout): kept even under a model version that stands alone.
    keepPrompt: value.keepPrompt === true,
    // Where tools load as needed: families (or tools) its conversations have from the first step (Data: data, pdf).
    startFamilies: Array.isArray(value.startFamilies)
      ? [...new Set(value.startFamilies.filter((entry) => typeof entry === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(entry)))].slice(0, 20)
      : [],
  };
}

/**
 * Read the mode definitions, falling back to the built-in three.
 * @param {object} config - live plugin Config.
 * @returns {Record<string, object>} id to mode, in definition order.
 */
function readModes(config) {
  const result = {};
  for (const [id, value] of Object.entries(readObject(config.modes))) {
    const mode = normalizeMode(id, value);
    if (mode) result[id] = mode;
  }
  if (Object.keys(result).length === 0) for (const [id, value] of Object.entries(BUILTIN_MODES)) result[id] = normalizeMode(id, value);
  for (const [id, value] of Object.entries(readObject(config.extraModes))) {
    const mode = result[id] ? undefined : normalizeMode(id, value);
    // Marked: an add-on's mode always gets a sidebar tab, whatever the tab count.
    if (mode) result[id] = { ...mode, extra: true };
  }
  return result;
}

export function apply(ctx, config) {
  /** Agent id -> what is applied: { modeId, unrestrict, sandboxBase }. */
  const applied = new Map();
  /** Choices made through the service that Settings could not store. */
  const overlay = new Map();
  /** Work waiting for an Agent to become idle. */
  const pendingIdle = new Map();
  /** Agent id -> prompt section disposer. */
  const promptDisposers = new Map();

  /**
   * @param {unknown} error - failure to log.
   */
  function report(error) {
    ctx.logger.warn(`modes: ${error?.message ?? error}`);
  }

  /**
   * Mode an Agent should be in now.
   * @param {string} sessionId - Agent id.
   * @returns {object} mode definition.
   */
  /** Helper agent id -> the id of what started it. */
  const parents = new Map();
  /**
   * Note who started an agent, so a helper can follow its conversation.
   * @param {object} agent - live Agent.
   */
  function noteParent(agent) {
    const parent = parentIdOf(agent?.header ?? agent?.session?.header);
    if (parent && agent?.id && parent !== agent.id) parents.set(agent.id, parent);
  }
  /** @returns {string} the conversation an agent works for: itself, or the top of its chain of starters. */
  const topOf = (agentId) => rootOf(agentId, parents);

  function modeOf(agentId) {
    // A helper agent has no mode of its own: it follows the conversation that started it.
    const sessionId = topOf(agentId);
    const modes = readModes(config);
    const fallback = plain(config.defaultMode);
    // With the Cowork sidebar, the selected tab (defaultMode) decides until the first message.
    const chosen = overlay.get(sessionId) ?? readObject(config.sessionModes)[sessionId];
    if (fresh.has(sessionId) && !claimed.has(sessionId)) {
      // Opened by an Automation task: its own starting mode, unless the conversation already has one.
      const own = scheduled.has(sessionId) ? scheduledModeId(modes, plain(config.scheduledMode)) : undefined;
      if (own && (tabsDecide() || chosen === undefined)) return modes[own];
      if (tabsDecide()) return modes[fallback] ?? Object.values(modes)[0];
    }
    const found = modes[chosen] ?? modes[fallback] ?? Object.values(modes)[0];
    // Once isolated, always isolated; and never isolated later. (The pages write the choice straight into Settings.)
    return heldMode({ found, wasIsolated: wasIsolated(sessionId), fresh: fresh.has(sessionId) });
  }

  /** Conversations seen running in an isolated mode, before Settings has stored them. */
  const isolatedSeen = new Set();
  /** @returns {boolean} whether the conversation ever ran in an isolated mode. */
  function wasIsolated(sessionId) {
    return isolatedSeen.has(sessionId) || readObject(config.sessionIsolated)[sessionId] === true;
  }
  let isolatedChain = Promise.resolve();
  /** Remember for good that a conversation is isolated. */
  function markIsolated(sessionId) {
    if (wasIsolated(sessionId)) return;
    isolatedSeen.add(sessionId);
    isolatedChain = isolatedChain.then(async () => {
      try {
        const settings = ctx.get('settings');
        if (!settings) return;
        const next = { ...readObject(config.sessionIsolated), [sessionId]: true };
        await settings.mutate('modes', [{ op: 'set', path: ['sessionIsolated'], value: JSON.stringify(next) }]);
      } catch (error) {
        ctx.logger.warn(`modes: isolation of ${sessionId} not stored (${error?.message ?? error}); kept in memory`);
      }
    });
  }
  /** @returns {boolean} whether a conversation, or the conversation a helper belongs to, is isolated. */
  function isIsolated(agentId) {
    try {
      return modeOf(agentId)?.isolated === true;
    } catch {
      return true;
    }
  }

  /** Sessions that have not run a turn yet. */
  const fresh = new Set();
  /**
   * Fresh sessions another add-on moved on purpose (`set(id, mode, {claim: true})`, a Finance brief):
   * the tab and the scheduled starting mode no longer decide for them, so the move survives the first turn.
   */
  const claimed = new Set();
  /** Fresh sessions whose first message came from the app's scheduler. */
  const scheduled = new Set();
  /**
   * @param {object} agent - live Agent.
   * @returns {boolean} true when the Agent has never run a turn. Unknown counts as "has run".
   */
  function neverRan(agent) {
    const phase = agent?.phase;
    return Boolean(phase) && phase.kind !== 'running' && phase.lastTurn === 0;
  }
  /** @returns {boolean} true while the Cowork sidebar is on (its tabs choose the mode of new conversations). */
  function tabsDecide() {
    try {
      return Boolean(ctx.get('coworkShell'));
    } catch {
      return false;
    }
  }
  /** @returns {unknown} the Cowork sidebar's own tab order (`tabOrder`), or nothing. */
  function shellTabOrder() {
    try {
      return plain(ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'cowork-shell')?.value?.tabOrder);
    } catch {
      return undefined;
    }
  }
  /** @returns {number} how many of the modes get a sidebar tab (the Cowork sidebar's `maxTabs`; 3 when unknown). */
  function shellTabCount() {
    try {
      return tabCount(plain(ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'cowork-shell')?.value?.maxTabs));
    } catch {
      return tabCount(undefined);
    }
  }

  /** @returns {string[]} names of the tools an Agent may be restricted over. */
  function globalToolNames() {
    try {
      return ctx.tools.definitions().map((definition) => definition.name);
    } catch {
      return [];
    }
  }

  /**
   * Apply a mode's tool mask to one Agent, replacing the previous one.
   * @param {object} agent - live Agent.
   * @param {object} state - applied state of the Agent.
   * @param {object} mode - mode to apply.
   */
  function applyTools(agent, state, mode) {
    state.unrestrict?.();
    state.unrestrict = undefined;
    const mask = toolMask(agent.id, mode);
    state.maskKey = JSON.stringify(mask);
    if (!mask) return;
    const accepted = acceptedMask(agent, mask);
    // Tools the mode names that the app does not have yet (their add-on starts a moment later):
    // the mask is put on again once they are there, see `refit`.
    state.short = Array.isArray(mask.allow) && (!accepted || accepted.allow.length < mask.allow.length);
    if (!accepted) return;
    state.unrestrict = agent.ctx.effect(() => agent.ctx.tools.restrict(accepted), 'modes tool restriction');
  }

  /**
   * Put the tool mask on again when it was applied before all of the mode's tools existed. Without
   * this, a conversation restored while the app starts keeps a mask without those tools for good.
   * @param {object} agent - live Agent.
   */
  function refit(agent) {
    const state = applied.get(agent?.id);
    if (!state?.short) return;
    try {
      applyTools(agent, state, modeOf(agent.id));
    } catch (error) {
      ctx.logger.warn(`modes: could not renew the tools of ${agent.id}: ${error?.message ?? error}`);
    }
  }

  /**
   * The mask with only names the app accepts. Tries the whole mask first; if the app refuses it,
   * tests each name on its own and keeps the accepted ones.
   * @param {object} agent - live Agent.
   * @param {{allow?: string[], deny?: string[]}} mask - wanted mask.
   * @returns {{allow?: string[], deny?: string[]} | null} accepted mask, or null when nothing is left to deny.
   */
  function acceptedMask(agent, mask) {
    const key = mask.allow ? 'allow' : 'deny';
    const test = (names) => {
      try {
        const undo = agent.ctx.tools.restrict({ [key]: names });
        undo?.();
        return true;
      } catch {
        return false;
      }
    };
    if (mask[key].length === 0 || test(mask[key])) return mask;
    const kept = mask[key].filter((name) => test([name]));
    ctx.logger.warn(`modes: tools not available here and left out: ${mask[key].filter((n) => !kept.includes(n)).join(', ')}`);
    if (key === 'deny' && kept.length === 0) return null;
    return { [key]: kept };
  }

  /**
   * The tool mask for a Session: its mode's tools, with the Web and Tools switches applied.
   * Names the app refuses are dropped when the mask is applied (applyTools).
   * @param {string} sessionId - Agent id.
   * @param {object} mode - mode.
   * @param {string[]} [added] - where tools load as needed: the families and tools to count as added (default: those the conversation added).
   * @returns {{allow?: string[], deny?: string[]} | null} mask, or null for no restriction.
   */
  function toolMask(sessionId, mode, added) {
    const loadsAsNeeded = trimmed(sessionId, mode);
    return toolMaskFor({
      mode,
      trimmed: loadsAsNeeded,
      known: knownTools(sessionId),
      // The families the mode starts with (Data: data, pdf) are there from the first step.
      added: loadsAsNeeded ? [...new Set([...(mode?.startFamilies ?? []), ...(added ?? addedOf(sessionId))])] : [],
      web: webOn(sessionId, mode),
      research: researchOn(sessionId),
      off: toolsOff(sessionId),
      child: topOf(sessionId) !== sessionId,
      fenced: isolatedTools(),
      webOff: isolatedWebOff(sessionId),
      online: onlineImageTools(),
    });
  }

  /**
   * The image tools that go online: those of the Media tools add-on, unless the image service set
   * there (`images.baseUrl`) is on this Mac or on a private network. Unknown counts as online.
   * @returns {string[]} their names.
   */
  function onlineImageTools() {
    try {
      const loader = ctx.get('loader') ?? ctx.loader;
      const entry = (loader ? [...loader.entries()] : []).find((item) => item?.options?.id === 'media-tools' || item?.options?.name === '@local/dsh-media-tools');
      if (!entry) return IMAGE_TOOLS;
      let effective;
      try {
        effective = plain(entry.fiber?.effectiveConfig);
      } catch {
        effective = undefined;
      }
      const images = plain((effective ?? plain(entry.options?.config) ?? {}).images) ?? {};
      const named = [images.generateToolName, images.editToolName].filter((name) => typeof name === 'string' && name.trim()).map((name) => name.trim());
      return imageToolsOffline({ baseUrl: images.baseUrl, names: [...IMAGE_TOOLS, ...named] });
    } catch {
      return IMAGE_TOOLS;
    }
  }
  /** @returns {string[]} where tools load as needed, the tools a conversation would be offered with `added` added. */
  function offeredWith(sessionId, mode, added) {
    return toolMask(sessionId, mode, added)?.allow ?? [];
  }

  /** @returns {boolean} whether a conversation loads its tools as needed. A helper follows its conversation. */
  function trimmed(sessionId, mode) {
    if (!mode || mode.isolated || mode.tools !== 'all' || toolsOff(sessionId)) return false;
    const list = plain(config.trimModes);
    return Array.isArray(list) && list.includes(mode.id);
  }
  /** Families and single tools added per conversation, before Settings has stored them. */
  const addedSeen = new Map();
  /** @returns {string[]} what a conversation added. */
  function addedOf(sessionId) {
    const top = topOf(sessionId);
    const stored = readObject(config.sessionToolSets)[top];
    return [...new Set([...(Array.isArray(stored) ? stored : []), ...(addedSeen.get(top) ?? [])])];
  }
  /** @returns {string[]} the families (or tools) a conversation's mode starts with, where tools load as needed. */
  function startOf(sessionId) {
    try {
      return modeOf(topOf(sessionId))?.startFamilies ?? [];
    } catch {
      return [];
    }
  }
  let addChain = Promise.resolve();
  /** Add families or tools to a conversation, for good. @returns {string[]} what was new. */
  function addTools(sessionId, entries) {
    const top = topOf(sessionId);
    // What the mode starts with counts as there already.
    const have = [...addedOf(top), ...startOf(top)];
    const fresh = entries.filter((entry) => entry && !have.includes(entry));
    if (fresh.length === 0) return [];
    addedSeen.set(top, [...(addedSeen.get(top) ?? []), ...fresh]);
    addChain = addChain.then(async () => {
      try {
        const settings = ctx.get('settings');
        if (!settings) return;
        const next = { ...readObject(config.sessionToolSets), [top]: addedOf(top) };
        await settings.mutate('modes', [{ op: 'set', path: ['sessionToolSets'], value: JSON.stringify(next) }]);
      } catch (error) {
        ctx.logger.warn(`modes: tools added to ${top} not stored (${error?.message ?? error}); kept in memory`);
      }
    });
    return fresh;
  }
  /** @returns {string[]} every tool the app knows for an agent, before restrictions. */
  function knownTools(sessionId) {
    try {
      const agent = ctx.get('agents')?.get?.(sessionId);
      const names = ctx.tools.view(agent).knownNames;
      if (names && names.size > 0) return [...names];
    } catch {
      // fall back to the tools plugins can see
    }
    return globalToolNames();
  }
  /** Put the tool mask on again now, when it no longer matches (a family was added). */
  function refreshTools(agent) {
    const state = applied.get(agent?.id);
    if (!state) return;
    const mode = modeOf(agent.id);
    if (state.maskKey === JSON.stringify(toolMask(agent.id, mode))) return;
    applyTools(agent, state, mode);
  }

  /**
   * Before a turn's first step: families the user's waiting message names are added, so the model
   * has them from its first step.
   * @param {object} agent - live Agent.
   */
  function wordsAddTools(agent) {
    try {
      if (!agent?.id || topOf(agent.id) !== agent.id || !trimmed(agent.id, modeOf(agent.id))) return;
      const waiting = [...(agent.inbox?.nextTurn ?? []), ...(agent.inbox?.nextStep ?? [])];
      const said = waiting.filter((message) => message?.role === 'user' && message?.source?.kind !== 'runtime-context').map((message) => textOf(message)).join('\n');
      // A skill the user started (/office-pptx) brings its family as well.
      const skills = waiting.filter((message) => message?.source?.kind === 'skill-invocation').flatMap((message) => skillFamilies(message.source.name));
      if (addTools(agent.id, [...mentioned(said), ...skills]).length > 0) refreshTools(agent);
    } catch (error) {
      ctx.logger.warn(`modes: could not read which tools a message needs: ${error?.message ?? error}`);
    }
  }

  /** @returns {string[]} every tool that an isolated mode lists. */
  function isolatedTools() {
    return [...new Set(Object.values(readModes(config)).filter((mode) => mode.isolated && Array.isArray(mode.tools)).flatMap((mode) => mode.tools))];
  }

  /** @returns {boolean} whether the conversation's tools are switched off altogether. A helper follows its conversation. */
  function toolsOff(sessionId) {
    return readObject(config.sessionTools)[topOf(sessionId)] === false;
  }

  /** @returns {boolean} whether web tools are on for the Session (explicit switch, else the mode's default). */
  function webOn(sessionId, mode) {
    return webFor({ tools: mode?.tools, isolated: mode?.isolated, off: toolsOff(sessionId), chosen: readObject(config.sessionWeb)[topOf(sessionId)] });
  }

  /** @returns {boolean} whether an isolated conversation's Web button is on Off (its own searching is then off). */
  function isolatedWebOff(sessionId) {
    return readObject(config.sessionWeb)[topOf(sessionId)] === false;
  }

  /** @returns {string} a conversation's Web level (below Off): its own, else the one new conversations start with. */
  function levelOf(sessionId) {
    return searchLevel(readObject(config.sessionSearchDepth)[topOf(sessionId)] ?? config.searchDepth);
  }

  /** @returns {boolean} whether the conversation is a research one (the Research tab): its helpers search. */
  function researchOn(sessionId) {
    // A research conversation is one whose mode lists the research tool (the Research tab). The old
    // per-conversation Deep research switch (`sessionResearch`) is no longer offered or read.
    const mode = modeOf(topOf(sessionId));
    return !toolsOff(sessionId) && !mode?.isolated && researchTab(mode?.tools);
  }

  /** Access-level entries changed in this run, before Settings has stored them (null: dropped). */
  const baseSeen = new Map();
  /** @returns {{mode?: string, base?: string, set?: string} | undefined} a conversation's entry, as stored: the mode its level was last applied for, and its earlier level. */
  function storedEntry(sessionId) {
    if (baseSeen.has(sessionId)) return baseSeen.get(sessionId) ?? undefined;
    return readEntry(readObject(config.sessionSandboxBase)[sessionId]);
  }
  let baseChain = Promise.resolve();
  /**
   * Remember a conversation's entry for good, or forget it (`entry` undefined).
   * @param {string} sessionId - the conversation.
   * @param {{mode?: string, base?: string, set?: string} | undefined} entry - what to store.
   * @param {object} [how] - how.
   * @param {boolean} [how.note] - only the mode of a conversation opened with nothing stored: written
   *   only if nothing is stored by then, so it never replaces an entry someone else wrote meanwhile
   *   (a Rerun copy gets its conversation's entry just after the app created it).
   */
  function keepBase(sessionId, entry, { note = false } = {}) {
    const value = entry?.mode || entry?.base ? { ...(entry.mode ? { mode: entry.mode } : {}), ...(entry.base ? { base: entry.base, set: entry.set } : {}) } : null;
    if (!note) baseSeen.set(sessionId, value);
    baseChain = baseChain.then(async () => {
      try {
        const settings = ctx.get('settings');
        if (!settings) return;
        const next = { ...readObject(config.sessionSandboxBase) };
        if (note && (next[sessionId] !== undefined || baseSeen.has(sessionId))) return;
        if (value) next[sessionId] = value;
        else delete next[sessionId];
        await settings.mutate('modes', [{ op: 'set', path: ['sessionSandboxBase'], value: JSON.stringify(next) }]);
        if (baseSeen.get(sessionId) === value) baseSeen.delete(sessionId);
      } catch (error) {
        ctx.logger.warn(`modes: earlier access level of ${sessionId} not stored (${error?.message ?? error}); kept in memory`);
      }
    });
  }

  /**
   * The level a conversation from before 0.57.0 presumably had before a mode changed it (nothing is
   * stored for it): the sandbox of its permission preset, which the app records when the
   * conversation is created and on every pick in the chat box or with /permission (Modes only ever
   * writes the sandbox), else that of the user's default preset. Never the app's built-in default.
   * @param {object} session - the conversation's session.
   * @returns {string | undefined} the level; undefined without the app's permission presets.
   */
  function presetLevel(session) {
    const presets = ctx.get('permissionPresets');
    if (!presets) return undefined;
    const sandboxOf = (name) => {
      try {
        const sandbox = name ? presets.resolve(name)?.sandbox : undefined;
        return typeof sandbox === 'string' && sandbox ? sandbox : undefined;
      } catch {
        return undefined;
      }
    };
    const read = (get) => {
      try {
        return get();
      } catch {
        return undefined;
      }
    };
    return sandboxOf(read(() => presets.permissionState?.(session)?.preset)) ?? sandboxOf(read(() => presets.defaultPreset));
  }

  /** @returns {boolean} whether two stored entries say the same. */
  const sameEntry = (a, b) => a?.mode === b?.mode && a?.base === b?.base && (a?.base ? a?.set === b?.set : true);

  /**
   * Set the conversation's access level (the app's sandbox mode) for a mode, and put the earlier
   * one back when a mode that does not set one is chosen later, also after a restart. A mode sets
   * its level only when the conversation starts in it or switches into it (a move made while it
   * was closed counts): a conversation that already ran keeps its level on a reload, so a level
   * picked by hand survives a restart. A conversation's entry also says which mode its level was
   * last applied for, so a move made while it was closed is seen when it is opened.
   * @param {object} agent - live Agent.
   * @param {object} state - applied state of the Agent.
   * @param {object} mode - mode to apply.
   * @param {boolean} start - the conversation starts in the mode now, or switches into it.
   */
  function applySandbox(agent, state, mode, start) {
    const policy = ctx.get('sandboxPolicy');
    if (!policy) return;
    const session = agent.session;
    // Only conversations keep it for good; a helper keeps it while it lives.
    const lasting = isTopLevel(agent);
    const entry = lasting ? storedEntry(agent.id) : undefined;
    const known = lasting ? readBase(entry) : state.sandbox ?? undefined;
    const level = policy.resolve({ session }).mode;
    // Nothing stored (a conversation from before 0.57.0) while the level in force is the one the
    // previous mode sets: that mode set it, so the level from before is the conversation's preset.
    const previous = state.modeId ?? entry?.mode;
    const earlier = lasting && start && !known && previous && previous !== mode.id ? readModes(config)[previous]?.sandbox : undefined;
    const before = earlier && earlier !== 'inherit' && level === earlier ? presetLevel(session) : undefined;
    const step = sandboxStep({ sandbox: mode.sandbox, start, level, known, before });
    state.sandbox = step.known ?? null;
    if (lasting) {
      const next = { mode: mode.id, ...(step.known ?? {}) };
      // Opened with nothing stored and nothing changed: only note the mode, so a later move made
      // while it is closed is seen.
      if (!sameEntry(next, entry)) keepBase(agent.id, next, { note: !entry && !start && !step.write });
    }
    if (step.write) session.append('sandbox/mode', { mode: step.write });
  }

  /**
   * Apply a mode to one Agent.
   * @param {object} agent - live Agent.
   * @param {object} mode - mode to apply.
   * @param {boolean} switching - true when this replaces an earlier mode, so its sandbox and default tier apply.
   * @param {object} [how] - how the mode comes to the Agent.
   * @param {boolean} [how.starting] - a new conversation starts in the mode (just created, not reloaded): its default tier applies.
   * @returns {Promise<void>}
   */
  async function applyMode(agent, mode, switching, { starting = false } = {}) {
    const state = applied.get(agent.id) ?? {};
    applied.set(agent.id, state);
    // Moved to another mode while it was not open (the Cowork sidebar's Move writes only its mode):
    // on opening, the new mode applies as on a switch, its access level and tier included.
    const moved = !switching && state.modeId === undefined && isTopLevel(agent) && !fresh.has(agent.id) && movedSince(storedEntry(agent.id), mode.id);
    applyTools(agent, state, mode);
    applySandbox(agent, state, mode, switching || moved || fresh.has(agent.id));
    state.modeId = mode.id;
    await applyTier(agent, mode, switching || moved, starting);
  }

  /**
   * Before a conversation's first message: the tier it had before a mode's tier was put on, and that
   * tier (`{before, set}`). A move to a mode without a tier then puts `before` back: a conversation an
   * Automation task opens is created in the selected tab's mode before its task's mode is known.
   */
  const startTiers = new Map();
  /**
   * Move a conversation to its mode's tier: on a switch, and when a new conversation starts in the mode.
   * @param {object} agent - live Agent.
   * @param {object} mode - its mode.
   * @param {boolean} switching - the mode replaces an earlier one.
   * @param {boolean} starting - a new conversation starts in the mode.
   * @returns {Promise<void>}
   */
  async function applyTier(agent, mode, switching, starting) {
    const tiers = ctx.get('modelTiers');
    const known = (id) => Boolean(id) && tiers?.listTiers().some((tier) => tier.id === id);
    const now = () => {
      try {
        return tiers?.resolveTier?.(agent.id)?.id ?? '';
      } catch {
        return '';
      }
    };
    const early = fresh.has(agent.id);
    if ((switching || starting) && mode.defaultTier) {
      if (!known(mode.defaultTier)) {
        ctx.logger.warn(`modes: default tier "${mode.defaultTier}" of mode ${mode.id} is not available`);
        return;
      }
      if (early) startTiers.set(agent.id, { before: startTiers.get(agent.id)?.before ?? now(), set: mode.defaultTier });
      await tiers.setSessionTier(agent.id, mode.defaultTier);
      return;
    }
    const start = startTiers.get(agent.id);
    if (!switching || !early || !start) return;
    startTiers.delete(agent.id);
    // A tier picked by hand since then stays.
    if (now() === start.set && start.before !== start.set && known(start.before)) await tiers.setSessionTier(agent.id, start.before);
  }

  /**
   * Run `work` now when the Agent is idle, otherwise once it becomes idle.
   * @param {object} agent - live Agent.
   * @param {() => Promise<void>} work - task.
   */
  function atTurnBoundary(agent, work) {
    if (agent.status === 'idle') void work().catch(report);
    else pendingIdle.set(agent.id, work);
  }

  /**
   * Bring one Agent to the mode it should be in.
   * @param {object} agent - live Agent.
   */
  function reconcile(agent) {
    const desired = modeOf(agent.id);
    const state = applied.get(agent.id);
    if (state?.modeId === desired.id) {
      // Same mode; the Web level or the tools switch may still have changed the tool mask.
      if (state.maskKey !== JSON.stringify(toolMask(agent.id, desired))) {
        atTurnBoundary(agent, async () => {
          const current = applied.get(agent.id);
          if (current) applyTools(agent, current, modeOf(agent.id));
        });
      }
      return;
    }
    atTurnBoundary(agent, async () => {
      const mode = modeOf(agent.id);
      if (applied.get(agent.id)?.modeId !== mode.id) await applyMode(agent, mode, true);
    });
  }

  // The app's PTC preset offers `run_code` whatever the mask says. With nothing to call, a program is refused,
  // so "Tools off" and a mode without tools mean the same in every preset.
  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        try {
          const id = exec?.agent?.id;
          if (exec?.name !== PROGRAM_TOOL || !id) return undefined;
          const mask = toolMask(id, modeOf(id));
          return Array.isArray(mask?.allow) && mask.allow.length === 0 ? NO_PROGRAMS : undefined;
        } catch {
          return undefined;
        }
      }),
    'modes: no programs without tools',
  );
  // Web off: the app's sandbox limits file writing only, not the network, so a shell command that
  // goes online (curl, a web address, fetching code, an install) is stopped here, and so is a
  // program (`run_code`, the PTC preset) that fetches, opens a socket or starts curl and the like.
  const SHELL_TOOLS = new Set(['bash', 'shell', 'pwsh', 'powershell', 'terminal_send']);
  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        try {
          const id = exec?.agent?.id;
          const name = exec?.name;
          if (!id || (!SHELL_TOOLS.has(name) && name !== PROGRAM_TOOL)) return undefined;
          const mode = modeOf(id);
          if (mode?.isolated || webOn(id, mode)) return undefined;
          const args = exec.arguments ?? {};
          if (name === PROGRAM_TOOL) return programGoesOnline(typeof args === 'string' ? args : args.code ?? '') ? PROGRAM_OFFLINE : undefined;
          const command = typeof args === 'string' ? args : args.command ?? args.cmd ?? args.script ?? args.text ?? '';
          return goesOnline(command) ? SHELL_OFFLINE : undefined;
        } catch {
          return undefined;
        }
      }),
    'modes: no network from the shell or from programs while the web is off',
  );
  // An isolated conversation runs a tool only when its mode lists it, whatever else is on offer:
  // no programs, no helpers, nothing of another add-on. A second lock behind the tool mask.
  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        try {
          const id = exec?.agent?.id;
          if (!id) return undefined;
          const mode = modeOf(id);
          if (!mode?.isolated) return undefined;
          if (isolatedMayRun({ mode, name: exec.name, child: topOf(id) !== id, off: toolsOff(id), webOff: isolatedWebOff(id) })) return undefined;
          return `the tool ${exec?.name} is not part of this isolated conversation and was not run.`;
        } catch {
          return 'this isolated conversation could not be checked, so the tool was not run.';
        }
      }),
    'modes: isolated conversations',
  );

  /**
   * The note for an agent that reaches its tools through programs (the app's PTC preset).
   * @param {object} agent - live Agent.
   * @returns {string} the note, or '' when the agent calls tools directly or has none.
   */
  function viaPrograms(agent) {
    if (!programOnly(ctx.tools, agent)) return '';
    let reachable = [];
    let timeout;
    try {
      reachable = ctx.tools.definitions(agent).map((definition) => definition.name);
      timeout = ctx.get('ptcRuntime')?.timeout;
    } catch {
      // Without the list the note still says where tools are called from.
    }
    if (reachable.length === 0) return '';
    return programNote({ timeout, slow: SLOW_TOOLS.filter((tool) => reachable.includes(tool)) });
  }

  /**
   * The web tools a step really offers: the app admits web_search only while a search provider is
   * ready for the step's model (a DeepSeek key, for example).
   * @param {object} [context] - the assembly's context.
   * @returns {string[] | undefined} the names, or undefined when the assembly has no step (an inspection).
   */
  function stepWebTools(context) {
    try {
      const view = context?.toolSet?.view?.(context.agent ?? context.scope);
      return view ? WEB_TOOLS.filter((name) => view.has(name)) : undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Install the prompt section on one Agent.
   * @param {object} agent - live Agent.
   */
  function installPrompt(agent) {
    if (promptDisposers.has(agent.id) || !agent.ctx?.systemPrompt) return;
    const dispose = agent.ctx.effect(
      () =>
        agent.ctx.systemPrompt.section({
          name: 'modes:mode',
          order: 58,
          interpolate: false,
          text: (context) => {
            // A helper gets no mode wording: "answer in one reply, no tools" would stop a searcher from searching.
            if (topOf(agent.id) !== agent.id) return viaPrograms(agent);
            const mode = modeOf(agent.id);
            // A model version that stands alone leaves out the mode's own wording; the notes about tools stay.
            let alone = false;
            try {
              alone = ctx.get('modelTiers')?.instructionsReplaced?.(agent.id) === true;
            } catch {
              alone = false;
            }
            const known = knownTools(agent.id);
            const images = onlineImageTools();
            return promptText({
              mode,
              off: toolsOff(agent.id),
              alone,
              web: webOn(agent.id, mode),
              stepWeb: stepWebTools(context),
              level: levelOf(agent.id),
              webOff: isolatedWebOff(agent.id),
              codeMethod: plain(config.codeMethod) !== false,
              coworkMethod: plain(config.coworkMethod) !== false,
              trimmed: trimmed(agent.id, mode),
              offline: [...webReaching(known), ...images.filter((name) => known.includes(name))],
              connectors: known.some((name) => name.startsWith('mcp__')),
              // An isolated tab runs no programs; under PTC it is told it cannot work there instead.
              programs: mode.isolated ? '' : viaPrograms(agent),
              programOnly: mode.isolated === true && programOnly(ctx.tools, agent),
            });
          },
        }),
      'modes prompt section',
    );
    promptDisposers.set(agent.id, dispose);
  }

  ctx.effect(() => () => {
    for (const state of applied.values()) state.unrestrict?.();
    applied.clear();
    for (const dispose of promptDisposers.values()) {
      try {
        dispose?.();
      } catch {
        // The Agent context may already be unwinding.
      }
    }
    promptDisposers.clear();
  }, 'modes ownership');

  // Apply the mode to a new or resumed Agent before its first step.
  // The app waits for these listeners before a Session opens, and a failure here would stop it
  // opening: never throw, and do the one-off cleanup in the background.
  ctx.on('agent/created', async ({ agent, source }) => {
    try {
      noteParent(agent);
      if (neverRan(agent)) fresh.add(agent.id);
      installPrompt(agent);
      // A conversation just created (not one reloaded) takes its mode's tier from its first message.
      const starting = source === 'startup' && fresh.has(agent.id) && isTopLevel(agent);
      await applyMode(agent, modeOf(agent.id), false, { starting });
    } catch (error) {
      report(error);
    }
    void pruneStale().catch(report);
    void clearOldWebMarks().catch(report);
    void addDataTrim().catch(report);
  });
  // Loading the add-on is a reload: conversations already there keep their tier and their access
  // level, unless they never ran or their mode was changed while Modes did not see it (moved).
  for (const agent of ctx.get('agents')?.list() ?? []) {
    noteParent(agent);
    if (neverRan(agent)) fresh.add(agent.id);
    installPrompt(agent);
    void applyMode(agent, modeOf(agent.id), false).catch(report);
  }

  /** How long the app's scheduler waits at most for a task's conversation to take its mode. */
  const SCHEDULED_WAIT_MS = 10_000;
  // The app's scheduler opens (or creates) the conversation of an Automation task through this hook,
  // and sends the task's message only once it returns. A new conversation was created in the selected
  // tab's mode, with that mode's tier; here it moves to the task's mode, and the tier change (a
  // settings write, then the model) is finished before the message starts the turn. The model of a
  // step is fixed before any step hook runs, so waiting there would come too late for the first step.
  ctx.on('schedule/resolve-agent', async (sessionId, next) => {
    const agent = await next();
    try {
      const id = agent?.id ?? sessionId;
      if (agent && id && fresh.has(id) && !scheduled.has(id)) {
        scheduled.add(id);
        const mode = modeOf(id);
        if (applied.get(id)?.modeId !== mode.id) {
          let timer;
          const waited = new Promise((resolve) => {
            timer = setTimeout(resolve, SCHEDULED_WAIT_MS);
            timer.unref?.();
          });
          await Promise.race([applyMode(agent, mode, true).catch(report), waited]);
          clearTimeout(timer);
        }
      }
    } catch (error) {
      report(error);
    }
    return agent;
  });
  // An Automation task puts its instruction into the inbox of the conversation it opened, before the
  // first turn. (Where the scheduler's hook above ran, the conversation is already marked.)
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'agent/inbox/spliced' || !fromScheduler(event.data?.inserted)) return;
      const id = session?.id;
      if (!id || !fresh.has(id) || scheduled.has(id)) return;
      scheduled.add(id);
      const agent = ctx.get('agents')?.get?.(id);
      const mode = modeOf(id);
      // A new conversation that starts in the task's mode: its sandbox and tier apply as on a switch.
      if (agent && applied.get(id)?.modeId !== mode.id) void applyMode(agent, mode, true).catch(report);
    } catch (error) {
      report(error);
    }
  });

  // A choice written through Settings (the composer selector) arrives here.
  ctx.on('loader/volatile-update', () => {
    for (const agent of ctx.get('agents')?.list() ?? []) reconcile(agent);
  });

  // Pin the starting mode of a Session that never chose one, so a later default change leaves it alone.
  const pinQueue = new Map();
  let pinChain = Promise.resolve();
  /**
   * @param {object} agent - live Agent.
   * @returns {boolean} true for a top-level Session (not a sub-agent child).
   */
  function isTopLevel(agent) {
    const header = agent?.header ?? agent?.session?.header;
    return !(header?.origin === 'subagent' || header?.parentSession || Number(header?.delegationDepth) > 0);
  }
  /**
   * Record the mode a Session runs its first turn in, unless it already has a choice.
   * @param {object} agent - live Agent.
   */
  function pinStartingMode(agent) {
    // A first turn under the Cowork sidebar records the tab's mode, replacing any earlier choice.
    const force = fresh.has(agent.id) && tabsDecide() && !claimed.has(agent.id);
    const modeId = modeOf(agent.id).id;
    fresh.delete(agent.id);
    claimed.delete(agent.id);
    startTiers.delete(agent.id);
    if (plain(config.pinOnFirstTurn) === false && !force) return;
    if (!isTopLevel(agent) || pinQueue.has(agent.id)) return;
    if (!force && (overlay.has(agent.id) || readObject(config.sessionModes)[agent.id] !== undefined)) return;
    overlay.set(agent.id, modeId);
    pinQueue.set(agent.id, { modeId, force });
    const settings = ctx.get('settings');
    if (!settings) return;
    pinChain = pinChain.then(async () => {
      if (pinQueue.size === 0) return;
      const batch = new Map(pinQueue);
      const next = { ...readObject(config.sessionModes) };
      for (const [id, pin] of batch) if (pin.force || next[id] === undefined) next[id] = pin.modeId;
      try {
        await settings.mutate('modes', [{ op: 'set', path: ['sessionModes'], value: JSON.stringify(next) }]);
        for (const id of batch.keys()) {
          pinQueue.delete(id);
          overlay.delete(id);
        }
      } catch (error) {
        ctx.logger.warn(`modes: starting mode not persisted (${error?.message ?? error}); kept in memory`);
        for (const id of batch.keys()) pinQueue.delete(id);
      }
    });
  }

  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'running') {
      // Before the turn's tools are put together.
      refit(agent);
      wordsAddTools(agent);
      // Only a conversation that begins in an isolated mode is marked; the mark is for good.
      const begins = fresh.has(agent.id) && isTopLevel(agent) && isIsolated(agent.id);
      if (begins) markIsolated(agent.id);
      pinStartingMode(agent);
    }
    if (status !== 'idle') return;
    const work = pendingIdle.get(agent.id);
    if (!work) return;
    pendingIdle.delete(agent.id);
    void work().catch(report);
  });

  // Stop in a conversation also stops the helpers it started, and theirs.
  /** Helpers stopped by the user's Stop, with the time, so their "I was stopped" note wakes nobody. */
  const stoppedHelpers = new Map();
  const STOP_NOTE_MS = 2 * 60_000;
  const wasStopped = (id) => Date.now() - (stoppedHelpers.get(id) ?? -Infinity) < STOP_NOTE_MS;
  /** Stop every helper at work below a conversation. */
  const stopHelpers = (id) => {
    const now = Date.now();
    for (const [key, at] of stoppedHelpers) if (now - at >= STOP_NOTE_MS) stoppedHelpers.delete(key);
    for (const helper of helpersBelow(ctx.get('agents')?.list?.() ?? [], id)) {
      try {
        stoppedHelpers.set(helper.id, now);
        helper.cancel({ kind: 'parent' });
      } catch (error) {
        ctx.logger.warn(`modes: could not stop helper "${helper.id}": ${error?.message ?? error}`);
      }
    }
  };
  ctx.on('session/event', (session, event) => {
    if (stoppedByUser(event) && session?.id) stopHelpers(session.id);
  });
  // Stop pressed while the conversation itself is idle and only its helpers work: the app ends no
  // turn then and records nothing, so the Stop is caught where it arrives.
  const stopWatched = new WeakSet();
  const watchStop = (agent) => {
    if (!agent || stopWatched.has(agent) || typeof agent.cancel !== 'function') return;
    stopWatched.add(agent);
    const cancel = agent.cancel.bind(agent);
    try {
      agent.cancel = (cause, options) => {
        if (cause?.kind === 'user') {
          try {
            stopHelpers(agent.id);
          } catch (error) {
            ctx.logger.warn(`modes: could not stop the helpers of "${agent.id}": ${error?.message ?? error}`);
          }
        }
        return cancel(cause, options);
      };
    } catch {
      /* an Agent that cannot be watched keeps the app's own Stop */
    }
  };
  ctx.on('agent/created', ({ agent }) => watchStop(agent));
  for (const agent of ctx.get('agents')?.list?.() ?? []) watchStop(agent);
  // An isolated conversation is not handed the app's own notes either (see ISOLATED_DROPS).
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next();
    try {
      if (!agent?.id || !isIsolated(agent.id) || decision?.kind !== 'enter' || !Array.isArray(decision.messages)) return decision;
      const kept = dropIsolatedNotes(decision.messages);
      return kept.length === decision.messages.length ? decision : { ...decision, messages: kept };
    } catch (error) {
      ctx.logger.warn(`modes: could not clear an isolated conversation's notes: ${error?.message ?? error}`);
      return { kind: 'reject' };
    }
  });
  // Loading tools as needed: a family the model added with tools_find is there from its next step
  // on. (The tools of the step are already chosen when this runs; the user's own words are read
  // earlier, when the turn starts: see wordsAddTools.)
  ctx.on('agent/pre-step', ({ agent }, next) => {
    try {
      if (agent?.id && trimmed(agent.id, modeOf(agent.id))) refreshTools(agent);
    } catch (error) {
      ctx.logger.warn(`modes: could not load the tools a conversation needs: ${error?.message ?? error}`);
    }
    return next();
  });
  // A skill that says its tools appear next step (the Office skills) gets them where tools load as
  // needed: its family is added when the skill has loaded.
  ctx.on('tools/result', (exec, result) => {
    try {
      const agent = exec?.agent;
      if (!agent?.id || exec.name !== 'skill' || result?.isError || !trimmed(agent.id, modeOf(agent.id))) return;
      if (addTools(agent.id, skillFamilies(exec.arguments?.name)).length === 0) return;
      refreshTools(agent);
      const top = ctx.get('agents')?.get?.(topOf(agent.id));
      if (top && top !== agent) refreshTools(top);
    } catch (error) {
      ctx.logger.warn(`modes: could not add the tools a skill needs: ${error?.message ?? error}`);
    }
  });
  // The tool that lists and adds tool families, offered only where tools load as needed.
  ctx.effect(
    () => ctx.tools.register(buildFindTool(), { when: ({ agent }) => Boolean(agent?.id) && trimmed(agent.id, modeOf(agent.id)) }),
    'modes: tools_find',
  );
  /**
   * The tools a request to tools_find is matched against: every tool the app knows, not only those
   * already offered (the point is to find the hidden ones), with their descriptions where the app
   * gives them. The tools of isolated modes are left out: no other conversation is offered them.
   * @param {object} agent - live Agent.
   * @param {string[]} known - every tool the app knows for it.
   * @returns {{name: string, description?: string}[]} the tools.
   */
  function findable(agent, known) {
    const described = new Map();
    const take = (definitions) => {
      for (const definition of definitions ?? []) if (definition?.name && !described.has(definition.name)) described.set(definition.name, definition.description);
    };
    try {
      take(ctx.tools.definitions());
    } catch {
      // no descriptions from the global view
    }
    try {
      take(ctx.tools.view(agent).visible.values());
    } catch {
      // no descriptions from the agent's view
    }
    const fenced = isolatedTools();
    return known.filter((name) => !fenced.includes(name)).map((name) => ({ name, description: described.get(name) }));
  }
  function buildFindTool() {
    return {
      name: FIND_TOOL,
      description: 'Only the core tools (files, shell, step list, questions, skills, and the web unless Web is Off) are loaded in this conversation, to keep it fast. Call this to see the other tool families and add the ones you need: give a family (pdf, data, finance, visual, schedule, helpers, goals, library, memory, mac, code, learn, mission, connectors, app, office), a tool name, or what you want to do. Added tools are there from your next step on, for the rest of the conversation. Without arguments it lists the families.',
      parameters: {
        type: 'object',
        properties: { need: { type: 'string', maxLength: 200, description: 'A family, a tool name, or what you need to do (for example "read a PDF", "make a chart").' } },
        additionalProperties: false,
      },
      output: {
        schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
        render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
      },
      isConcurrencySafe: () => false,
      timeoutMs: 15_000,
      execute: async (args, exec) => {
        try {
          const agent = exec?.agent;
          if (!agent?.id || !trimmed(agent.id, modeOf(agent.id))) return { text: 'All tools are already loaded in this conversation.' };
          const known = knownTools(agent.id);
          // The catalog leaves out the tools of isolated modes: they cannot be added here.
          const fenced = isolatedTools();
          const listing = () => trimCatalog(known.filter((name) => !fenced.includes(name)), [...startOf(agent.id), ...addedOf(agent.id)]);
          const need = String(args?.need ?? '').trim();
          if (!need) return { text: `Tool families you can add (call ${FIND_TOOL} with one of them):\n${listing()}` };
          const mode = modeOf(agent.id);
          const wanted = resolveRequest(need, findable(agent, known));
          if (wanted.length === 0) return { text: `Nothing matches "${need}". The families:\n${listing()}` };
          // Core tools need no adding; anything else only when it brings a tool that exists and that
          // this conversation's switches let through (a family whose add-on is off brings nothing).
          const core = wanted.filter((entry) => CORE.includes(entry));
          const usable = wanted.filter((entry) => !CORE.includes(entry) && brings(entry, offeredWith(agent.id, mode, [entry]).filter((name) => known.includes(name))));
          const missing = wanted.filter((entry) => !CORE.includes(entry) && !usable.includes(entry));
          const notes = [
            core.length ? `${core.join(', ')} ${core.length === 1 ? 'is a core tool' : 'are core tools'}: offered whenever ${core.length === 1 ? 'it applies' : 'they apply'}, nothing to add.` : '',
            missing.length ? `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not available here (not installed, switched off, or Web is off).` : '',
          ].filter(Boolean).join(' ');
          const tail = notes ? ` ${notes}` : '';
          if (usable.length === 0) return { text: missing.length ? `${notes} The families:\n${listing()}` : notes };
          const fresh = addTools(agent.id, usable);
          refreshTools(agent);
          const top = ctx.get('agents')?.get?.(topOf(agent.id));
          if (top && top !== agent) refreshTools(top);
          const before = new Set(offeredWith(agent.id, mode, addedOf(agent.id).filter((entry) => !fresh.includes(entry))));
          const now = offeredWith(agent.id, mode).filter((name) => known.includes(name) && !before.has(name));
          const already = usable.filter((entry) => !fresh.includes(entry));
          if (fresh.length === 0) return { text: `${usable.join(', ')} ${usable.length === 1 ? 'is' : 'are'} already added and can be called now.${tail}` };
          return { text: `Added ${fresh.join(', ')}${now.length ? `: ${now.join(', ')}` : ''}. They can be called from your next step.${already.length ? ` Already there: ${already.join(', ')}.` : ''}${tail}` };
        } catch (error) {
          return { text: `Tools could not be added: ${String(error?.message ?? error).slice(0, 200)}` };
        }
      },
    };
  }
  // A turn that would start only because stopped helpers reported back ends at once, unasked.
  // The first step of a turn is step 1.
  ctx.on('agent/pre-step', ({ messages, step }, next) => {
    if (step <= 1 && stoppedHelpers.size > 0 && onlyStopNotes(messages, wasStopped)) return Promise.resolve({ kind: 'enter', messages: [] });
    return next();
  });

  ctx.on('agent/disposed', ({ agent }) => {
    applied.get(agent.id)?.unrestrict?.();
    applied.delete(agent.id);
    fresh.delete(agent.id);
    claimed.delete(agent.id);
    scheduled.delete(agent.id);
    startTiers.delete(agent.id);
    overlay.delete(agent.id);
    pendingIdle.delete(agent.id);
    promptDisposers.delete(agent.id);
    parents.delete(agent.id);
  });

  /**
   * Before 0.54.0 a conversation's Search switch only took away `web_search` and `web_fetch`. The
   * Web button's Off now also takes away the tools that go online in Scout and Recon, and the
   * Research tab always has the web. So an old "Search off" mark in a conversation of such a tab is
   * cleared once, and the conversation gets its tab's search back.
   */
  let marksDone = false;
  async function clearOldWebMarks() {
    if (marksDone || plain(config.webMarksCleared) === true) return;
    marksDone = true;
    const settings = ctx.get('settings');
    if (!settings) return;
    const webs = readObject(config.sessionWeb);
    const cleared = oldWebMarks(webs, readObject(config.sessionModes), readModes(config));
    const next = { ...webs };
    for (const id of cleared) delete next[id];
    const ops = [{ op: 'set', path: ['webMarksCleared'], value: true }];
    if (cleared.length > 0) ops.push({ op: 'set', path: ['sessionWeb'], value: JSON.stringify(next) });
    await settings.mutate('modes', ops);
    if (cleared.length > 0) ctx.logger.info(`modes: cleared ${cleared.length} old "Search off" mark(s) in tabs with their own search`);
  }

  /**
   * Data loads its tools as needed since 0.57.0 (with its data and PDF tools from the start). A
   * `trimModes` list stored before then lacks it, so 'data' is added to it once; switched off
   * after that, it stays off.
   */
  let dataTrimDone = false;
  async function addDataTrim() {
    if (dataTrimDone || plain(config.dataTrimAdded) === true) return;
    const settings = ctx.get('settings');
    if (!settings) return;
    dataTrimDone = true;
    const list = plain(config.trimModes);
    const ops = [{ op: 'set', path: ['dataTrimAdded'], value: true }];
    if (Array.isArray(list) && !list.includes('data')) ops.push({ op: 'set', path: ['trimModes'], value: [...list, 'data'] });
    try {
      await settings.mutate('modes', ops);
    } catch (error) {
      // Tried again with the next conversation that opens.
      dataTrimDone = false;
      throw error;
    }
    if (ops.length > 1) ctx.logger.info('modes: Data now loads its tools as needed (added to "Load tools as needed")');
  }
  // Also a moment after loading, when Settings accepts this add-on's writes, for a start without any conversation opening.
  ctx.effect(() => {
    const timer = setTimeout(() => void addDataTrim().catch(report), 2000);
    timer.unref?.();
    return () => clearTimeout(timer);
  }, 'modes: Data loads its tools as needed (once)');

  let pruned = false;
  /**
   * Remove choices for Sessions that are no longer stored; runs once.
   * @returns {Promise<void>}
   */
  async function pruneStale() {
    if (pruned || plain(config.pruneStaleSessions) === false) return;
    pruned = true;
    const persistence = ctx.get('sessionPersistence');
    const settings = ctx.get('settings');
    if (!persistence || !settings) return;
    try {
      const live = new Set((ctx.get('agents')?.list() ?? []).map((agent) => agent.id));
      // A conversation in the Cowork sidebar's trash is not listed by the app, but can be put back:
      // its choices stay (Recon's isolation mark above all). When the trash cannot be read, nothing goes.
      const home = ctx.get('dshHomePath');
      // Without an app home there is no trash (the Cowork sidebar keeps it there).
      const trashed = typeof home === 'function' ? trashedIds(home('trash', 'conversations')) : new Set();
      if (trashed === null) return;
      const fields = ['sessionModes', 'sessionWeb', 'sessionResearch', 'sessionSearchDepth', 'sessionTools', 'sessionHelpers', 'sessionIsolated', 'sessionToolSets', 'sessionSandboxBase'];
      const ids = new Set(fields.flatMap((field) => Object.keys(readObject(config[field]))));
      const gone = new Set();
      for (const sessionId of ids) {
        if (live.has(sessionId) || trashed.has(sessionId)) continue;
        try {
          if ((await persistence.stat(sessionId)) === undefined) gone.add(sessionId);
        } catch {
          // keep it when unsure
        }
      }
      if (gone.size > 0) {
        // Build from the current values (they may have changed while checking) and drop only the gone ids.
        const ops = fields.map((field) => {
          const next = { ...readObject(config[field]) };
          for (const id of gone) delete next[id];
          return { op: 'set', path: [field], value: JSON.stringify(next) };
        });
        await settings.mutate('modes', ops);
        ctx.logger.info(`modes: pruned ${gone.size} stale session entries`);
      }
    } catch (error) {
      report(error);
    }
  }

  /** Mode API for other plugins and the command. */
  const modes = {
    apiVersion: 1,
    /** @returns {Array<{id: string, label: string}>} the available modes. */
    list() {
      return Object.values(readModes(config)).map((mode) => Object.freeze({ id: mode.id, label: mode.label }));
    },
    /** @returns {string} the Web level new conversations start with: quick, standard, thorough or deep. */
    searchDepth() {
      return searchLevel(config.searchDepth);
    },
    /** @returns {'same' | 'roles'} the default for all conversations: helpers on the conversation's model, or on other models. */
    researchModel() {
      return String(plain(config.researchModel) ?? '') === 'roles' ? 'roles' : 'same';
    },
    /**
     * Which models a conversation's helper agents run on. `same`: the conversation's own model, so
     * only one model is loaded. `roles`: the models set for the roles (Model Tiers, Mission).
     * A helper asking gets its conversation's answer.
     * @param {string} [sessionId] - the conversation; without it, the default for all.
     * @returns {'same' | 'roles'} the choice in force.
     */
    helperModels(sessionId) {
      const chosen = sessionId ? readObject(config.sessionHelpers)[topOf(sessionId)] : undefined;
      if (chosen === 'same' || chosen === 'roles') return chosen;
      return String(plain(config.researchModel) ?? '') === 'roles' ? 'roles' : 'same';
    },
    /** @returns {string} the Deep research slider's step: quick, standard or thorough. */
    researchDepth() {
      return depthId(config.researchDepth);
    },
    /**
     * @param {string} sessionId - Agent id.
     * @returns {string} id of the Session's mode.
     */
    get(sessionId) {
      return modeOf(sessionId).id;
    },
    /**
     * Whether a conversation is isolated: other add-ons then leave it alone. They add nothing to its
     * instructions, keep nothing from it and send nothing of it anywhere. A helper asking gets its
     * conversation's answer. Unknown counts as isolated.
     * @param {string} sessionId - Agent id.
     * @returns {boolean}
     */
    isolated(sessionId) {
      return isIsolated(sessionId);
    },
    /**
     * Whether a conversation has no tools to work with: its tools are off, or its mode offers at
     * most the web tools (Chat). Model Tiers then leaves out what it says about checks, helpers and
     * skills. A helper asking gets its conversation's answer; unknown counts as having tools.
     * @param {string} sessionId - Agent id.
     * @returns {boolean}
     */
    noTools(sessionId) {
      try {
        const mask = toolMask(sessionId, modeOf(sessionId));
        return Array.isArray(mask?.allow) && mask.allow.every((tool) => WEB_TOOLS.includes(tool));
      } catch {
        return false;
      }
    },
    /**
     * Whether a conversation's Web is Off (the Web button, or a mode without the web). Model Tiers
     * then does not tell the model the tier has internet access. Unknown counts as not off.
     * @param {string} sessionId - Agent id.
     * @returns {boolean}
     */
    webOff(sessionId) {
      try {
        const top = topOf(sessionId);
        const mode = modeOf(top);
        return mode?.isolated ? isolatedWebOff(top) : !webOn(top, mode);
      } catch {
        return false;
      }
    },
    /**
     * Switch a Session's mode; it applies at the next turn boundary.
     * @param {string} sessionId - Agent id.
     * @param {string} modeId - mode id.
     * @param {{claim?: boolean}} [options] - `claim`: for a conversation that has not run a turn yet,
     *   the move stands over the selected tab and the scheduled starting mode (a Finance brief).
     * @returns {Promise<void>}
     */
    async set(sessionId, modeId, options = {}) {
      const target = readModes(config)[modeId];
      if (!target) throw new Error(`modes: unknown mode "${modeId}"`);
      const agent = ctx.get('agents')?.get(sessionId);
      if (!agent) throw new Error(`modes: unknown session "${sessionId}"`);
      // No way in and no way out: what an isolated conversation has read must not meet other tools.
      const refused = modeChangeRefusal({ wasIsolated: wasIsolated(sessionId), current: modeOf(sessionId).id, target: modeId, targetIsolated: target.isolated, fresh: fresh.has(sessionId) });
      if (refused) throw new Error(refused);
      if (options?.claim === true && fresh.has(sessionId)) claimed.add(sessionId);
      overlay.set(sessionId, modeId);
      // Applied now, while the conversation may still be idle, so its first turn gets the mode's tools.
      reconcile(agent);
      const settings = ctx.get('settings');
      if (settings) {
        try {
          const next = { ...readObject(config.sessionModes), [sessionId]: modeId };
          await settings.mutate('modes', [{ op: 'set', path: ['sessionModes'], value: JSON.stringify(next) }]);
          overlay.delete(sessionId);
        } catch (error) {
          ctx.logger.warn(`modes: choice for ${sessionId} not persisted (${error?.message ?? error}); kept in memory`);
        }
      }
      reconcile(agent);
    },
  };
  ctx.effect(() => ctx.provide('modes', Object.freeze(modes)), 'modes service');

  /**
   * Which models a conversation and its helpers would use, for the chip in the chat box.
   * @param {object} agent - the conversation's agent.
   * @returns {object} the choice in force, the default, and the models by where they are set.
   */
  function helpersView(agent) {
    const pick = (value) => (value && typeof value.provider === 'string' && typeof value.model === 'string' && value.provider && value.model ? { provider: value.provider, model: value.model } : undefined);
    let own;
    try {
      own = pick(agent.model?.current?.());
    } catch {
      own = undefined;
    }
    const sources = [];
    try {
      const tiers = ctx.get('modelTiers');
      const tier = tiers?.resolveTier?.(agent.id);
      if (tier) for (const role of ['plan', 'implement', 'review', 'fast']) {
        const route = pick(tiers.roleRoute(tier.id, role));
        if (route) sources.push({ from: 'tiers', role, ...route });
      }
    } catch {
      /* Model Tiers is not there: no role models */
    }
    try {
      // Mission's own choices, and those of this conversation's folder.
      const mission = ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'mission')?.value;
      const parse = (value) => {
        try {
          const read = JSON.parse(String(value ?? '') || '{}');
          return read && typeof read === 'object' && !Array.isArray(read) ? read : {};
        } catch {
          return {};
        }
      };
      const folder = (agent.header ?? agent.session?.header)?.cwd;
      const sets = [['mission', parse(mission?.roles)], ['project', folder ? parse(mission?.projects)[folder] ?? {} : {}]];
      for (const [from, roles] of sets) for (const role of ['plan', 'implement', 'review']) {
        const route = pick(roles?.[role]);
        if (route) sources.push({ from, role, ...route });
      }
    } catch {
      /* Mission is not there */
    }
    const policy = modes.helperModels(agent.id);
    const key = (route) => `${route.provider}\u0000${route.model}`;
    const others = new Map();
    for (const source of sources) if (!own || key(source) !== key(own)) others.set(key(source), source.model);
    return {
      policy,
      explicit: ['same', 'roles'].includes(readObject(config.sessionHelpers)[topOf(agent.id)]),
      usual: modes.researchModel(),
      own: own?.model ?? '',
      sources: sources.map(({ from, role, model }) => ({ from, role, model })),
      // How many models may be loaded at once: one, or the conversation's plus each other one named for a role.
      count: policy === 'same' ? 1 : 1 + others.size,
      names: policy === 'same' ? (own ? [own.model] : []) : [...(own ? [own.model] : []), ...others.values()],
    };
  }

  /**
   * The web tools the app will not offer to a conversation's model: it admits web_search and
   * web_fetch only while their provider is ready for that model (a search key, for example).
   * @param {object} agent - the conversation's agent.
   * @param {string[]} names - the tools to check.
   * @returns {Promise<string[]>} the web tools among them that are not ready.
   */
  async function webNotReady(agent, names) {
    const web = ctx.get('web');
    if (!web) return [];
    let provider;
    try {
      provider = agent.model?.current?.()?.provider;
    } catch {
      provider = undefined;
    }
    const out = [];
    for (const [name, method] of [['web_search', 'searchReady'], ['web_fetch', 'fetchReady']]) {
      if (!names.includes(name) || typeof web[method] !== 'function') continue;
      try {
        if ((await web[method](provider)) === false) out.push(name);
      } catch {
        // not knowing reads as ready, as the app does
      }
    }
    return out;
  }

  /**
   * What the model can and cannot call in a conversation right now, for the Tools list in the chat box.
   * Where tools load as needed, those it can add later are listed apart (`later`), not as "cannot".
   * @param {string} sessionId - the conversation.
   * @returns {Promise<object>} `{known, mode, off, viaCode, trimmed, can, later, cannot, notReady}`; `known` is false when the conversation is not loaded.
   */
  async function toolsView(sessionId) {
    const agent = ctx.get('agents')?.get?.(sessionId) ?? (ctx.get('agents')?.list() ?? []).find((item) => item.id === sessionId);
    if (!agent) return { known: false, mode: '', off: false, can: [], later: [], cannot: [] };
    const mode = modeOf(sessionId);
    let can = [];
    let all = [];
    try {
      can = ctx.tools.definitions(agent).map((definition) => definition.name);
      // Everything the app has, before this conversation's restrictions.
      all = [...(ctx.tools.view?.(agent)?.knownNames ?? [])];
    } catch {
      // An older app: show what is known.
    }
    const notReady = await webNotReady(agent, can);
    can = can.filter((name) => !notReady.includes(name));
    const allowed = new Set(can);
    const loadsAsNeeded = trimmed(sessionId, mode);
    // Where tools load as needed: what the conversation would have with every family and single tool added.
    const reachable = new Set(loadsAsNeeded ? offeredWith(sessionId, mode, [...FAMILIES.map((family) => family.id), ...trimOthers(all)]) : []);
    const later = all.filter((name) => !allowed.has(name) && reachable.has(name) && !notReady.includes(name));
    const waiting = new Set(later);
    return {
      known: true,
      mode: mode.label,
      off: toolsOff(sessionId),
      viaCode: programOnly(ctx.tools, agent),
      trimmed: loadsAsNeeded,
      can: can.sort(),
      later: later.sort(),
      cannot: all.filter((name) => !allowed.has(name) && !waiting.has(name)).sort(),
      notReady,
      helpers: helpersView(agent),
    };
  }

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: TOOLS_PATH,
          handler: async (req, res) => {
            const refused = inner.connection.requestRejection(req);
            if (refused !== undefined) {
              res.statusCode = refused;
              res.end();
              return;
            }
            if (req.method !== 'GET') {
              res.statusCode = 405;
              res.setHeader('allow', 'GET');
              res.end();
              return;
            }
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            try {
              const header = req.headers?.['x-dsh-session'];
              res.end(JSON.stringify(await toolsView(typeof header === 'string' && /^[\w.:-]{1,120}$/.test(header) ? header : '')));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 200) }));
            }
          },
        }),
      'modes: GET tools route',
    );
  });

  // The app's own sub-agent tool lets the model name a model for a helper. With "one model for
  // everything" that would load a second model behind the user's back, so such a call is refused
  // with a plain reason; without a model named, the helper runs on the conversation's model.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    try {
      if (!exec?.agent?.id || !['subagent', 'subagent_fork'].includes(exec.name)) return decision;
      const args = exec.arguments ?? {};
      const wantModel = typeof args.model === 'string' ? args.model.trim() : '';
      const wantProvider = typeof args.provider === 'string' ? args.provider.trim() : '';
      if (!wantModel && !wantProvider) return decision;
      if (modes.helperModels(exec.agent.id) !== 'same') return decision;
      const own = exec.agent.model?.current?.();
      if (own && (!wantModel || wantModel === own.model) && (!wantProvider || wantProvider === own.provider)) return decision;
      return { kind: 'deny', reason: `This conversation is set to one model for everything${own?.model ? ` (${own.model})` : ''}, so a helper may not be started on another model. Call the tool again without "provider" and "model": the helper then runs on this conversation's model. The user can allow different models with the models chip in the chat box.` };
    } catch (error) {
      report(error);
      return decision;
    }
  });

  const commandName = plain(config.commandName);
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Show or switch the mode of this session',
            input: { hint: '[mode]' },
            handler: async ({ agent, rawInput }) => {
              const wanted = String(rawInput ?? '').trim().toLowerCase();
              const available = modes.list();
              const current = modes.get(agent.id);
              // With the Cowork sidebar on, the selected tab decides the mode of a conversation that has
              // not had its first message (the first message fixes it): /mode would not hold, so it says so.
              const tabDecides = fresh.has(agent.id) && tabsDecide() && !claimed.has(agent.id);
              const tabNote = () => {
                const all = Object.values(readModes(config));
                return beforeFirstMessage({
                  current: all.find((mode) => mode.id === current)?.label ?? current,
                  tabs: sidebarTabs(all, shellTabCount(), shellTabOrder()).map((mode) => mode.label),
                  command: commandName,
                });
              };
              if (!wanted) {
                const lines = available.map((mode) => `${mode.id === current ? '* ' : '  '}${mode.id}: ${mode.label}`);
                return { kind: 'success', text: `Mode: ${current}\n${lines.join('\n')}${tabDecides ? `\n${tabNote().replace(/^Not switched\. /, '')}` : ''}` };
              }
              if (!available.some((mode) => mode.id === wanted)) {
                return { kind: 'error', text: `Unknown mode "${wanted}". Available: ${available.map((mode) => mode.id).join(', ')}` };
              }
              if (tabDecides) return { kind: 'error', text: tabNote() };
              await modes.set(agent.id, wanted);
              return { kind: 'success', text: `Mode switched to ${wanted}.` };
            },
          }),
        'modes command',
      );
    });
  }
}
