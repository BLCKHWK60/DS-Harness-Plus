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
import { randomUUID } from 'node:crypto';
import { dirname, resolve as resolvePath } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { LEVEL_NAMES, VERIFIED_START, addressesIn, addressesOf, levelAllows, mixesOf, pickedLevel, verifiedList } from './lib/weblevel.js';
import { IMAGE_TOOLS, RESEARCH_TOOL, WEB_TOOLS, goesOnline, imageToolsOffline, longRunMask, longToolsFor, oldWebMarks, parentIdOf, programGoesOnline, researchTab, rootOf, toolMaskFor, webFor, webReaching } from './lib/mask.js';
import { trashedIds } from './lib/trashed.js';
import { fromScheduler, scheduledModeId } from './lib/scheduled.js';
import { wireToolAccess } from './lib/wire.js';
import { SHELL_NAMES } from './lib/online.js';
import { isOwnTool } from './lib/catalog.js';
import { TOOL_ACCESS_PATH, toolAccessHandler } from './lib/route.js';
import { PROGRAM_TOOL, programNote, programOnly, SLOW_TOOLS } from './lib/ptc.js';
import { helpersBelow, onlyStopNotes, stoppedByUser } from './lib/stop.js';
import { CORE, FAMILIES, FIND_TOOL, appOfficeFolder, brings, catalog as trimCatalog, mentioned, others as trimOthers, resolveRequest, skillFamilies, skillFolderIn } from './lib/trim.js';
import { RUN_OVER_LIMIT, RUN_OVER_TEXT, RUN_STEP_TOOL, dropIsolatedNotes, heldMode, isolatedMayRun, isolatedRunMask, modeChangeRefusal } from './lib/isolation.js';
import { DEPTH_CHECK_KIND, DEPTH_CHECK_PROMPT, DEPTH_CHECK_REFUSAL, DEPTH_CHECK_SUMMARY, promptText } from './lib/prompt.js';
import { lensIdIn, lensTextIn, ownLensesOf } from './lib/lens.js';
import { movedSince, readBase, readEntry, sandboxStep } from './lib/sandbox.js';
import { normalizeStart, startOps } from './lib/start.js';
import { OTHER_TOOLS, SECRET_MARKS, WRITE_TOOLS, linkOn, openSecrets, otherSourcesOf, partsOf, readSource, requestOf, scrub, showPage } from './lib/other.js';
import { ACADEMIC_START, KINDS, NETS, NEWS_START, PAGE_KINDS, kindsOf, filterSearchText, isAll, listsOf, selectionsOf, sourcesAllow, sourcesSaid, tickedWords, ticksFromLevel, ticksOf } from './lib/sources.js';
import { beforeFirstMessage, sidebarTabs, tabCount } from './lib/tabs.js';
import { offIn, withOff, withoutOffSkills, lastSeenCatalog } from './lib/skilloff.js';

export { CODE_METHOD, COWORK_METHOD, DEPTH_CHECK_PROMPT, DEPTH_PROMPTS, DEPTH_SEARCH_PROMPTS, ISOLATED_DEPTH_PROMPTS, ISOLATED_LEVEL_PROMPTS, ISOLATED_OFF_PROMPT, SEARCH_DEPTH_PROMPTS } from './lib/prompt.js';

export const name = 'modes';
/** The chat box asks here which tools the model can call in a conversation (header `x-dsh-session`). */
export const TOOLS_PATH = '/dsh-modes/tools';
/** Settings → Web sources asks here which secrets of the owner's own sources are kept, and keeps or forgets one. */
export const OTHER_PATH = '/dsh-modes/other';
export const inject = ['tools'];
/** The app's Contents folder (…/DeepSeek Harness.app/Contents), where its own Office skills live. */
const APP_CONTENTS = resolvePath(dirname(process.execPath), '..');

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
/**
 * The move of 0.59.0: each conversation's former Web level becomes its Depth (Deep is Thorough), unless
 * it already has a Depth; a start of Deep becomes Thorough.
 * @param {Record<string, string>} levels - `sessionSearchDepth`.
 * @param {Record<string, string>} depths - `sessionDepth`.
 * @param {unknown} start - `searchDepth`.
 * @returns {{depths: Record<string, string>, start: string}} the new `sessionDepth` and start.
 */
export function movedDepths(levels, depths, start) {
  const out = { ...depths };
  for (const [id, level] of Object.entries(levels ?? {})) {
    if (out[id] !== undefined) continue;
    const value = searchLevel(level);
    out[id] = value === 'deep' ? 'thorough' : value;
  }
  const first = searchLevel(start);
  return { depths: out, start: first === 'deep' ? 'thorough' : first };
}

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
/** The app's Full access level, and the most a Scratch conversation starts with. */
const FULL_ACCESS = 'danger-full-access';
const SCRATCH_CAP = 'workspace-write';

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
  /**
   * Skills switched off per tab, as JSON `{ tabId: [skill names] }` (Tuner Plus's step 14). In that tab the model
   * does not see them in its skill list and cannot load them; the owner's own /name still works. Empty: as before.
   */
  skillsOff: z.string().default('{}').volatile(),
  /** Drop per-session entries whose Session is no longer stored, once per start. */
  pruneStaleSessions: z.boolean().default(true),
  /**
   * When a top-level Session starts its first turn without a chosen mode, record the mode it starts in.
   * A later change of `defaultMode` (for example from a sidebar tab) then only affects new Sessions.
   */
  pinOnFirstTurn: z.boolean().default(true),
  /** Per-session web switch as JSON: `{ sessionId: true | false }`. Missing = the mode's default (off in a no-tools mode). */
  sessionWeb: z.string().default('{}').volatile(),
  /**
   * Per-session Web level as JSON (plan step S1): `{ sessionId: 'verified' | 'open' | 'everything' | 'custom:<name>' }`.
   * Missing = On as before: no limit beyond the tab's own (the owner's choice: the levels are added, the
   * defaults kept). Only while the Web is on; lib/weblevel.js.
   */
  sessionWebLevel: z.string().default('{}').volatile(),
  /** The verified list (Web level Verified): one host or address ending per line. Its own list; Settings → Modes. */
  verifiedSources: z.string().default(VERIFIED_START).volatile(),
  /**
   * The owner's saved Web selections as JSON: `{ name: ['verified', 'forums', …] }` (lib/sources.js KINDS, and in
   * Recon its networks). Earlier Custom mixes keep working: their lanes are read as ticks ("channels" is social).
   * Saved from the Web popup; edited on Settings → Web sources.
   */
  webMixes: z.string().default('{}').volatile(),
  /**
   * Per-conversation Web sources as JSON: `{ sessionId: ['verified', 'forums', …] }` (the one Web selector, 18
   * November 2026). Missing = All: the web as before, or, for a conversation that picked one of the older levels
   * (`sessionWebLevel`), that level read as ticks. Only while the Web is on. lib/sources.js.
   */
  sessionWebSources: z.string().default('{}').volatile(),
  /** The academic list (Web source Academic papers): one host or ending per line. Settings → Web sources. */
  academicSources: z.string().default(ACADEMIC_START).volatile(),
  /** The news list (Web source News): one host or ending per line. Settings → Web sources. */
  newsSources: z.string().default(NEWS_START).volatile(),
  /**
   * The owner's own other sources (Web source Other) as JSON: `[{ id, name, search, start, login, header, store, recon }]`
   * (lib/other.js). No secret is ever kept here: logins, keys, cookies and secret addresses are in the app's
   * secret store or the macOS Keychain, by each source's `store`. Settings → Web sources → Other sources.
   */
  otherSources: z.string().default('[]').volatile(),
  /** Obsolete: the old per-conversation Deep research switch, no longer offered or read (kept so older settings files still load). Old entries are pruned with the others. */
  sessionResearch: z.string().default('{}').volatile(),
  /** Obsolete since 0.59.0: each conversation's former Web level, moved into `sessionDepth` once (`depthMoved`). Kept so older settings files still load. */
  sessionSearchDepth: z.string().default('{}').volatile(),
  /**
   * Per-session Depth as JSON: `{ sessionId: 'quick' | 'standard' | 'thorough' }` (missing = where new
   * conversations start, `searchDepth`). How much work the conversation gets: how much it searches when
   * Web is on, helpers, planning, checks and reviews. Set with the Depth button in the chat box, the
   * same in every tab (the owner's rule): Recon gets the care note and then its search effort; Research
   * and Scout get the care note but no searching note (they search by their own method), and a research
   * run started from the conversation is sized by it. Never for helpers, while a Mission run is on, or
   * with tools off; a user's own /goal keeps it.
   */
  sessionDepth: z.string().default('{}').volatile(),
  /**
   * Per-session Lens as JSON: `{ sessionId: 'blunt' | 'scientific' | 'journalistic' | 'data-only' |
   * 'skeptic' | 'encouraging' }` (missing or unknown = Default, which adds nothing). How the answer is
   * worded (lib/lens.js, texts approved word for word). Its own section after the standing texts.
   * Not for helpers, and paused during a /learn study session. No button yet (Lens part, step 28).
   */
  sessionLens: z.string().default('{}').volatile(),
  /**
   * Your own Lenses (Lens part, step 30): `[{ name, text }]`, at most 40, names up to 40 characters,
   * texts up to 4,000, no name of a shipped Lens. Each gets the same guard as every Lens. Edited on
   * Settings → Modes; kept in these settings, so Shared settings carries them to a second Mac.
   */
  ownLenses: z.array(z.object({ id: z.string(), name: z.string(), text: z.string() })).default([]).volatile(),
  /** Each conversation's former Web level has been moved into its Depth (once, since 0.59.0). */
  depthMoved: z.boolean().default(false).volatile(),
  /**
   * Each tab's starting choice of tools for a Long run, as JSON: `{ modeId: { files: boolean, web: boolean } }`
   * (missing: files and commands on; the web on, off in an isolated tab). A run's card can change it for
   * that run. Set on Settings → Modes → Long run tools.
   */
  longTools: z.string().default('{}').volatile(),
  /** Per-session tools switch as JSON: `{ sessionId: false }`. While off, the model is offered no tool at all. */
  sessionTools: z.string().default('{}').volatile(),
  /** The Depth new conversations start with (quick, standard, thorough), and that a conversation without its own pick follows. Set on Settings → Modes, and by every pick on the Depth button. (Named for the former Web level, which it replaced in 0.59.0.) */
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
  /** Obsolete since 0.59.0: the former separate Depth of Deep research runs. A run now follows the Depth of the conversation that starts it (`sessionDepth`, else `searchDepth`), the same in every tab. Kept so older settings files still load. */
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
  /**
   * The chat box looks the same in every mode (on by default): the buttons' words (Web · On, Depth, One
   * model, Tools on) shrink by the window's width alone, not by what else a mode puts in the row, and the
   * buttons add-ons bring (Creator Plus, Bench rules, Export, Focus, the Finance pill) go on a second line
   * when the row is full, after the same core buttons. Off: the former per-row shrinking.
   */
  uniformBox: z.boolean().default(true).volatile(),
  /**
   * Starting values per mode as JSON: `{ modeId: { web, depth, helpers, tools } }` (lib/start.js). What the Web,
   * Depth, Models and Tools buttons read in a conversation that begins in the mode; a missing or empty value
   * is the usual one (the mode's own default, or the one setting for all modes). Written into the
   * conversation's own settings when it starts, so a pick made by hand later replaces it.
   * Settings → Modes → Starting values for new conversations.
   */
  modeStart: z.string().default('{}').volatile(),
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
  /**
   * Tool access (lib/access.js): what each tool is set to in each mode, as JSON
   * `{ modeId: { groups: { groupId: 'on'|'ask'|'off' }, tools: { toolName: 'on'|'ask'|'off' } } }`.
   * Nothing chosen: every mode keeps exactly the tools it has. A tool the mode does not offer starts on Ask.
   * Settings → Tool access. Kept on each Mac (never shared).
   */
  toolAccess: z.string().default('{}').volatile(),
  /** Tool access on: the AI gets `tools_catalog` and `request_tool_access`, and your choices and permissions apply. */
  toolAccessOn: z.boolean().default(false).volatile(),
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
  /** Tool access (lib/wire.js), set up further down. */
  let access;

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
  /** Conversations whose current run was started by the scheduler (an Automation that re-runs in a conversation that already exists). */
  const scheduledRun = new Set();
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
    const own = baseToolMask(sessionId, mode, added);
    // The Tool access grid and the user's permissions: they only add tools, never lift a fence.
    return access ? access.withAccess(sessionId, mode, own, { researchHelper: topOf(sessionId) !== sessionId && researchOn(sessionId) }) : own;
  }
  /** The mask the mode's own rules give, before Tool access. */
  function baseToolMask(sessionId, mode, added) {
    // A Long run in this conversation (Mission): its tab keeps its own tools and gains what the run needs.
    const long = longRunOf(sessionId);
    // In an isolated conversation (Recon) a Long run keeps to the mode's own tools: the step tool for
    // the conversation, the file tools for its helpers, never a shell, a program or the web.
    if (long && mode?.isolated) return isolatedRunMask({ tools: mode.tools, child: topOf(sessionId) !== sessionId, files: long.files, off: toolsOff(sessionId), webOff: isolatedWebOff(sessionId) });
    if (long && !mode?.isolated) {
      return longRunMask({ mode, files: long.files, web: long.web, research: researchOn(sessionId), child: topOf(sessionId) !== sessionId, offline: [...webReaching(knownTools(sessionId)), ...onlineImageTools()], fenced: isolatedTools() });
    }
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
      // Not the app's context, and not Thorough's check (its words name a research run).
      const said = waiting.filter((message) => message?.role === 'user' && message?.source?.kind !== 'runtime-context' && message?.source?.kind !== DEPTH_CHECK_KIND).map((message) => textOf(message)).join('\n');
      // A skill the user started (/office-pptx) brings its family as well, when it is the app's own.
      const skills = waiting.filter((message) => message?.source?.kind === 'skill-invocation' && appOfficeFolder(skillFolderIn(textOf(message)), APP_CONTENTS)).flatMap((message) => skillFamilies(message.source.name));
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

  /**
   * The tools of a Long run on in the conversation (or the one a helper works for), as Mission says.
   * @returns {{files: boolean, web: boolean} | undefined} the run's switches; undefined when none is on.
   */
  function longRunOf(sessionId) {
    try {
      const run = ctx.get('mission')?.longRun?.(topOf(sessionId));
      return run && typeof run === 'object' ? { files: run.files === true, web: run.web === true } : undefined;
    } catch {
      return undefined;
    }
  }

  /** @returns {{files: boolean, web: boolean}} a tab's starting choice of tools for a Long run (Settings → Modes). */
  function longToolsOf(mode) {
    const saved = readObject(config.longTools)[mode?.id];
    return longToolsFor(mode, saved && typeof saved === 'object' ? saved : undefined);
  }

  /** @returns {boolean} whether web tools are on for the Session (explicit switch, else the mode's default). */
  function webOn(sessionId, mode) {
    return webFor({ tools: mode?.tools, isolated: mode?.isolated, off: toolsOff(sessionId), chosen: readObject(config.sessionWeb)[topOf(sessionId)] });
  }

  /**
   * The Web level a conversation picked (plan step S1), while its web is on. Undefined: On as before.
   * Not in an isolated tab (Recon keeps its own rules) nor in a research tab (its web is fixed).
   * @returns {{level: string, lanes?: string[], name?: string} | undefined}
   */
  function levelOf(sessionId) {
    const top = topOf(sessionId);
    const mode = modeOf(top);
    if (!mode || mode.isolated || researchTab(mode.tools)) return undefined;
    // The Web button on Off keeps a level for later; it applies only while the button is not on Off.
    if (readObject(config.sessionWeb)[top] === false) return undefined;
    const long = longRunOf(top);
    if (long ? !long.web : !webOn(top, mode)) return undefined;
    return pickedLevel(readObject(config.sessionWebLevel)[top], mixesOf(plain(config.webMixes)));
  }

  /** The lists the Web sources are judged by (Settings → Web sources). */
  function sourceLists() {
    return listsOf({ verified: plain(config.verifiedSources), academic: plain(config.academicSources), news: plain(config.newsSources) });
  }

  /**
   * The conversation's Web sources (the one Web selector, 18 November 2026) while its web is on: the ticks, or
   * undefined for All (no limit, as before). Every tab follows its own ticks, Research, Scout and Recon too. A
   * conversation with no ticks stored that picked one of the older levels outside Recon and the research tabs
   * reads that level as ticks (it is never written over). Recon's networks count only in Recon.
   * @param {string} sessionId - Agent id (a helper follows its conversation).
   * @returns {string[] | undefined}
   */
  function sourcesNow(sessionId) {
    const top = topOf(sessionId);
    const mode = modeOf(top);
    if (!mode) return undefined;
    // The Web button on Off keeps the ticks for later; they apply only while it is not on Off.
    if (readObject(config.sessionWeb)[top] === false) return undefined;
    const recon = mode.isolated === true;
    if (!recon) {
      const long = longRunOf(top);
      if (long ? !long.web : !webOn(top, mode)) return undefined;
    }
    const own = readObject(config.sessionWebSources)[top];
    if (own !== undefined) {
      const ticks = ticksOf(own, { recon });
      return !ticks || isAll(ticks, { recon }) ? undefined : ticks;
    }
    if (recon || researchTab(mode.tools)) return undefined;
    const ticks = ticksFromLevel(readObject(config.sessionWebLevel)[top], selectionsOf(plain(config.webMixes)));
    return ticks && !isAll(ticks) ? ticks : undefined;
  }

  /** The owner's own sources (Web source Other, lib/other.js): what the settings hold, never a secret. */
  function otherList() {
    return otherSourcesOf(plain(config.otherSources));
  }
  /** Where the sources' secrets are kept: the app's secret store or the macOS Keychain, per source. */
  const secrets = openSecrets({ credentials: () => ctx.get('credentials') });
  /** @returns {Promise<object>} one source's addresses, login headers and the parts to take out of what the model sees. */
  const otherRequest = (source) => requestOf(source, (part) => secrets.get(source, part));
  /** @returns {object | undefined} a source by the name the model gives (any case). */
  const otherNamed = (name, list = otherList()) => list.find((source) => source.name.toLowerCase() === String(name ?? '').trim().toLowerCase());

  /** @returns {string[]} the names of the owner's own sources a conversation may use (in Recon only those allowed there). */
  function otherNames(recon = false) {
    return otherList().filter((source) => !recon || source.recon).map((source) => source.name);
  }

  /** A command or program that goes online with no address to check, while not every kind of page is ticked. */
  const LEVEL_COMMAND = 'Not every kind of web source is ticked for this conversation, and this command or program goes online without a web address Modes can check, so it was not run. Use the web tools for pages, or tell the user: they can pick All on the Web button.';

  /** @returns {string} the note a conversation gets about its Web sources ('' for All, as before). */
  function levelSaid(sessionId) {
    const top = topOf(sessionId);
    const mode = modeOf(top);
    const ticks = sourcesNow(sessionId);
    if (!ticks) return '';
    if (mode?.isolated) {
      const nets = ticks.filter((kind) => NETS.includes(kind));
      const kinds = ticks.filter((kind) => KINDS.includes(kind));
      return `\n\nRecon sources for this conversation: ${tickedWords([...kinds, ...nets])}. The recon tools for sources that are not ticked refuse, and web results of other kinds are left out.${kinds.includes('other') && otherNames(true).length > 0 ? ` The user's own sources allowed in Recon: ${otherNames(true).map((name) => `"${name}"`).join(', ')} (recon_other_search, recon_other_read).` : ''} If the research needs another source, say so; the user ticks more on the Web button.`;
    }
    return sourcesSaid(ticks, { other: otherNames(false) });
  }

  /** @returns {boolean} whether an isolated conversation's Web button is on Off (its own searching is then off). */
  function isolatedWebOff(sessionId) {
    return readObject(config.sessionWeb)[topOf(sessionId)] === false;
  }


  /** @returns {string} the Depth new conversations start with: 'quick', 'standard' or 'thorough' (the former Web Deep is Thorough). */
  function depthStart() {
    const start = searchLevel(config.searchDepth);
    return start === 'deep' ? 'thorough' : start;
  }

  /** @returns {string} a conversation's Depth: its own pick, else where new conversations start. */
  function depthOf(sessionId) {
    const chosen = readObject(config.sessionDepth)[topOf(sessionId)];
    return chosen === 'quick' || chosen === 'standard' || chosen === 'thorough' ? chosen : depthStart();
  }

  /**
   * @param {object} agent - live Agent.
   * @returns {string} the Depth whose care note this agent's instructions carry: 'standard' (none) for
   *   a helper, with tools off, and while a Mission run is on. Model Tiers keeps only its thinking words exactly then, so
   *   the checks it leaves out are always asked for by the Depth note instead.
   */
  function depthSpoken(agent) {
    const id = agent?.id;
    if (typeof id !== 'string' || !id || topOf(id) !== id) return 'standard';
    const mode = modeOf(id);
    if (!mode || toolsOff(id) || missionRound(agent)) return 'standard';
    // An isolated conversation that can use none of its tools (locked, late, or under PTC) gets no Depth words.
    if (mode.isolated === true && (!Array.isArray(mode.tools) || mode.tools.length === 0 || programOnly(ctx.tools, agent))) return 'standard';
    return depthOf(id);
  }

  /**
   * @returns {boolean} whether a Mission run is on in the conversation: its goal is active and its
   *   objective is the one Mission writes (`Mission run <id>: …`, dsh-mission/runner.js). The
   *   conversation then only conducts the run, and Mission refuses every tool but its step tool,
   *   also while the goal is disarmed (after a restart or an error) and the user writes in it. A
   *   user's own /goal does the work in its rounds, so it keeps its Depth, stored or running.
   */
  function missionRound(agent) {
    try {
      const goal = ctx.get('goals')?.get?.(agent);
      return goal?.phase === 'active' && String(goal?.objective ?? '').startsWith('Mission run ');
    } catch {
      return false;
    }
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
  /** @returns {boolean} whether the Cowork sidebar says this is a Scratch conversation (false without it). */
  function scratchConversation(agent) {
    try {
      return Boolean(ctx.get('coworkScratch')?.folderOf?.(agent));
    } catch {
      return false;
    }
  }

  function applySandbox(agent, state, mode, start) {
    const policy = ctx.get('sandboxPolicy');
    if (!policy) return;
    // A helper of a Long run keeps the level it inherits from its conversation: in a Read Only tab the
    // run has lifted it to Workspace Write, and the helpers do the run's writing (review finding 1).
    if (!isTopLevel(agent) && longRunOf(agent.id)) return;
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
    let step = sandboxStep({ sandbox: mode.sandbox, start, level, known, before });
    // Scratch (step 35): a Scratch conversation starts, or switches tabs, at Workspace Write at most,
    // so nothing it does lands in a folder of yours. Full access picked by hand since still wins.
    if (lasting && scratchConversation(agent)) {
      const handPicked = Boolean(known) && known.set !== undefined && level !== known.set;
      const capped = known?.set === SCRATCH_CAP;
      if (capped && !handPicked && step.write === FULL_ACCESS) {
        // Never handed back by a tab that leaves the level alone, on a reload or a move.
        step = { known };
      } else if (start && !handPicked && (step.write ?? level) === FULL_ACCESS) {
        step = { write: SCRATCH_CAP, known: { base: step.known?.base ?? known?.base ?? level, set: SCRATCH_CAP } };
      } else if (capped && !step.known) {
        // Remembered, so a level picked by hand later is still told apart from the cap.
        step = { ...step, known };
      }
    }
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
   * A conversation that starts in a mode gets that mode's starting values (Settings → Modes → Starting
   * values for new conversations) into its own settings, where a field has none yet. Never throws.
   * @param {object} agent - the new conversation's Agent.
   * @param {object} mode - its mode.
   * @returns {Promise<void>}
   */
  async function seedStart(agent, mode) {
    try {
      const entry = readObject(config.modeStart)[mode.id];
      if (!entry) return;
      const ops = startOps(normalizeStart(entry, { isolated: mode.isolated === true }), config, agent.id);
      if (ops.length === 0) return;
      await ctx.get('settings')?.mutate('modes', ops);
    } catch (error) {
      ctx.logger.warn(`modes: starting values of ${mode?.id} not applied (${error?.message ?? error})`);
    }
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

  // The Web sources (the one Web selector): a tool that opens an address of a kind that is not ticked is
  // refused, in the conversation and its helpers; so is a command or a program that goes online without an
  // address to check (unless every kind of page is ticked). All (nothing stored) changes nothing. Recon keeps
  // its own rules: its tools ask Modes themselves (service `webSources`). The owner's own sources are Other's,
  // judged by their own tools, not by the kind of their address.
  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        let ticks;
        try {
          const id = exec?.agent?.id;
          if (!id || modeOf(topOf(id))?.isolated) return undefined;
          ticks = sourcesNow(id);
        } catch {
          return undefined;
        }
        if (!ticks) return undefined;
        try {
          const name = String(exec.name ?? '');
          if (OTHER_TOOLS.includes(name)) return ticks.includes('other') ? undefined : OTHER_UNTICKED;
          const args = exec.arguments ?? {};
          const lists = sourceLists();
          let addresses = addressesOf(args);
          if (SHELL_TOOLS.has(name) || name === PROGRAM_TOOL) {
            const text = String(name === PROGRAM_TOOL ? (typeof args === 'string' ? args : args.code ?? '') : (typeof args === 'string' ? args : args.command ?? args.cmd ?? args.script ?? args.text ?? ''));
            const written = addressesIn(text);
            addresses = [...addresses, ...written];
            const online = name === PROGRAM_TOOL ? programGoesOnline(text) : goesOnline(text);
            if (online && written.length === 0 && !PAGE_KINDS.every((kind) => ticks.includes(kind))) return LEVEL_COMMAND;
          }
          for (const address of addresses) {
            const decision = sourcesAllow({ ticks, lists, address });
            if (!decision.ok) return decision.why;
          }
          return undefined;
        } catch {
          return 'Modes could not check this call against the conversation\'s Web sources, so it was not run.';
        }
      }),
    'modes: web sources',
  );
  // Search results of kinds that are not ticked are taken out before the model sees them (web_search, in
  // the conversation and its helpers; Recon filters its own results). The search service's own summary goes
  // too when anything was taken out. The result card the user sees keeps every result.
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    try {
      if (exec?.name !== 'web_search' || decision?.kind !== 'accept' || decision.value !== undefined || result?.isError) return decision;
      const id = exec?.agent?.id;
      if (!id || modeOf(topOf(id))?.isolated) return decision;
      const ticks = sourcesNow(id);
      if (!ticks) return decision;
      const sources = Array.isArray(result?.value?.sources) ? result.value.sources : [];
      const blocks = decision.content ?? result.content;
      if (!Array.isArray(blocks) || sources.length === 0) return decision;
      const lists = sourceLists();
      const answer = typeof result.value.content === 'string' ? result.value.content : '';
      let changed = false;
      const out = blocks.map((block) => {
        if (block?.type !== 'text' || typeof block.text !== 'string') return block;
        const filtered = filterSearchText(block.text, sources, ticks, lists, answer);
        if (filtered.left === 0) return block;
        changed = true;
        return { ...block, text: filtered.text };
      });
      return changed ? { ...decision, content: out } : decision;
    } catch {
      return decision;
    }
  });
  // The owner's own sources (Web source Other): two tools, offered while at least one source is set up and
  // Other is ticked (All ticks it), outside Recon (Recon has its own, through its own route). The web switch
  // and the tool mask decide the rest, as for web_search. The model gives a source's name, never an address
  // or a login; whatever comes back has every secret part taken out.
  const OTHER_UNTICKED = 'Other is not ticked in this conversation\'s Web sources, so the user\'s own sources are not used. The user ticks Other on the Web button.';
  const otherOffered = (id) => {
    if (!id || otherList().length === 0) return false;
    if (modeOf(topOf(id))?.isolated) return false;
    const ticks = sourcesNow(id);
    return !ticks || ticks.includes('other');
  };
  const otherTool = (name) => ({
    name,
    description: name === 'other_search'
      ? 'Search one of the user\'s own sources (sites they set up with their own login, key or private address). Give the source\'s name exactly as listed and the search words. Returns the source\'s result page as text, with links on that source.'
      : 'Read a page of one of the user\'s own sources. Give the source\'s name exactly as listed and, optionally, a link as other_search or an earlier page gave it (a path on that source). Without a link it reads the source\'s start page. Long pages come in parts.',
    parameters: name === 'other_search'
      ? { type: 'object', properties: { source: { type: 'string', maxLength: 60, description: 'The source\'s name.' }, query: { type: 'string', maxLength: 300, description: 'The search words.' } }, required: ['source', 'query'], additionalProperties: false }
      : { type: 'object', properties: { source: { type: 'string', maxLength: 60, description: 'The source\'s name.' }, link: { type: 'string', maxLength: 2000, description: 'A link on the source, as given (a path such as /item/12).' }, part: { type: 'integer', minimum: 1, maximum: 200, description: 'Which part of a long page (1 first).' } }, required: ['source'], additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
    },
    isConcurrencySafe: () => true,
    timeoutMs: 60_000,
    execute: async (args) => {
      const list = otherList();
      const source = otherNamed(args?.source, list);
      if (!source) return { text: `There is no source named "${String(args?.source ?? '').slice(0, 60)}". The user's own sources: ${list.map((one) => `"${one.name}"`).join(', ') || 'none'}.` };
      let request;
      try {
        request = await otherRequest(source);
      } catch (error) {
        return { text: String(error?.message ?? error) };
      }
      const hide = request.hide;
      try {
        let address;
        if (name === 'other_search') {
          const words = String(args?.query ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
          if (!words) return { text: 'Give a few words to search for.' };
          if (!request.search) return { text: `"${source.name}" has no search address. Read its pages with other_read instead.` };
          address = request.search.replace('{query}', encodeURIComponent(words));
        } else {
          const base = request.start || new URL(request.search.replace('{query}', '')).origin;
          const target = linkOn(base, args?.link);
          if (!target.ok) return { text: target.why };
          address = target.url;
        }
        const page = await readSource(address, request.headers);
        if (!page.ok) return { text: scrub(`"${source.name}" could not be read: ${page.why}.`, hide, source.name) };
        return { text: showPage({ name: source.name, page, part: args?.part, hide, hideHost: request.hideHost }) };
      } catch (error) {
        return { text: scrub(`"${source.name}" could not be read: ${String(error?.message ?? error).slice(0, 200)}`, hide, source.name) };
      }
    },
  });
  for (const name of OTHER_TOOLS) {
    ctx.effect(() => ctx.tools.register(otherTool(name), { when: ({ agent }) => otherOffered(agent?.id) }), `modes: ${name} tool`);
  }
  // The secrets of the owner's own sources stay out of a model's reach: a command, a program or a tool call
  // that reads the app's secret store file, these sources' Keychain items or the whole Keychain is refused,
  // in every tab. A barrier, not a wall: a command written to hide what it does is not caught.
  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        try {
          if (!exec?.agent?.id || OTHER_TOOLS.includes(exec.name) || WRITE_TOOLS.includes(exec.name)) return undefined;
          const args = exec.arguments;
          const text = typeof args === 'string' ? args : JSON.stringify(args ?? {});
          return SECRET_MARKS.test(text.slice(0, 200_000)) ? 'This call names the place where the user\'s secrets (logins, keys, cookies) are kept, so it was not run. Secrets are never read or shown in a conversation; the user manages them on Settings → Web sources.' : undefined;
        } catch {
          return undefined;
        }
      }),
    'modes: secrets stay out of reach',
  );
  // The app's PTC preset offers `run_code` whatever the mask says. With nothing to call, a program is refused,
  // so "Tools off" and a mode without tools mean the same in every preset.
  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        try {
          const id = exec?.agent?.id;
          if (exec?.name !== PROGRAM_TOOL || !id) return undefined;
          const mask = toolMask(id, modeOf(id));
          // The two Tool access tools (the catalogue and the request) are no tools to call from a program: Chat still has none.
          return Array.isArray(mask?.allow) && mask.allow.every(isOwnTool) ? NO_PROGRAMS : undefined;
        } catch {
          return undefined;
        }
      }),
    'modes: no programs without tools',
  );
  // Web off: the app's sandbox limits file writing only, not the network, so a shell command that
  // goes online (curl, a web address, fetching code, an install) is stopped here, and so is a
  // program (`run_code`, the PTC preset) that fetches, opens a socket or starts curl and the like.
  const SHELL_TOOLS = new Set(SHELL_NAMES);
  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        try {
          const id = exec?.agent?.id;
          const name = exec?.name;
          if (!id || (!SHELL_TOOLS.has(name) && name !== PROGRAM_TOOL)) return undefined;
          const mode = modeOf(id);
          const long = mode?.isolated ? undefined : longRunOf(id);
          if (mode?.isolated || (long ? long.web : webOn(id, mode))) return undefined;
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
  /**
   * An isolated conversation's calls of the step tool with no Long run on, in a row: after
   * RUN_OVER_LIMIT of them the turn is ended (a model that ignores "stop" loops otherwise).
   */
  const runOverCalls = new Map();
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
          const long = longRunOf(id);
          if (isolatedMayRun({ mode, name: exec.name, child: topOf(id) !== id, off: toolsOff(id), webOff: isolatedWebOff(id), long, granted: access?.grantedFor(id, exec.name, exec) === true, online: onlineImageTools() })) {
            runOverCalls.delete(id);
            return undefined;
          }
          // The run's own step tool after the run ended: say so plainly, and count the calls.
          if (exec.name === RUN_STEP_TOOL && topOf(id) === id && !long) {
            runOverCalls.set(id, (runOverCalls.get(id) ?? 0) + 1);
            return RUN_OVER_TEXT;
          }
          runOverCalls.delete(id);
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
            const isolatedRun = mode.isolated && longRunOf(agent.id) ? `\n\nA Long run is on in this conversation. You conduct it with mission_step; its helpers do the work with this mode's tools${longRunOf(agent.id).files ? ' and file tools in the run\'s own folder' : ''}. There are no programs, commands or other tools.` : '';
            const long = mode.isolated ? undefined : longRunOf(agent.id);
            const longNote = long ? `\n\nA Long run is on in this conversation. Until it ends, it and its helpers have the tools the run needs${long.files ? ' (files and commands' : ' (this tab\'s own tools'}${long.web ? ', and the web)' : ', no web)'}; this overrides what this tab says above about tools, files and the web. The tab's own way of working still applies.` : '';
            return longNote ? `${promptText({
              mode,
              off: false,
              alone,
              web: long.web,
              stepWeb: stepWebTools(context),
              depth: missionRound(agent) ? 'standard' : depthOf(agent.id),
              webOff: isolatedWebOff(agent.id),
              codeMethod: plain(config.codeMethod) !== false,
              coworkMethod: plain(config.coworkMethod) !== false,
              trimmed: false,
              offline: [...webReaching(known), ...images.filter((name) => known.includes(name))],
              connectors: known.some((name) => name.startsWith('mcp__')),
              programs: viaPrograms(agent),
              programOnly: false,
            })}${longNote}${levelSaid(agent.id)}` : promptText({
              mode,
              off: toolsOff(agent.id),
              alone,
              web: webOn(agent.id, mode),
              stepWeb: stepWebTools(context),
              // During a Mission run's rounds the conversation only conducts: no Depth words.
              depth: missionRound(agent) ? 'standard' : depthOf(agent.id),
              webOff: isolatedWebOff(agent.id),
              codeMethod: plain(config.codeMethod) !== false,
              coworkMethod: plain(config.coworkMethod) !== false,
              trimmed: trimmed(agent.id, mode),
              offline: [...webReaching(known), ...images.filter((name) => known.includes(name))],
              connectors: known.some((name) => name.startsWith('mcp__')),
              // An isolated tab runs no programs; under PTC it is told it cannot work there instead.
              programs: mode.isolated ? '' : viaPrograms(agent),
              programOnly: mode.isolated === true && programOnly(ctx.tools, agent),
            }) + isolatedRun + levelSaid(agent.id);
          },
        }),
      'modes prompt section',
    );
    // The Lens: its own section, after the standing texts (tiers 70, Self-improve's lessons 72), so it
    // wins on wording, as the owner chose; empty for Default, for helpers and during a study session.
    const disposeLens = agent.ctx.effect(
      () => agent.ctx.systemPrompt.section({ name: 'modes:lens', order: 73, interpolate: false, text: () => lensSaid(agent) }),
      'modes lens section',
    );
    const disposeAccess = agent.ctx.effect(
      () => agent.ctx.systemPrompt.section({ name: 'modes:tool-access', order: 59, interpolate: false, text: () => {
        try {
          if (!access) return '';
          // A model version that stands alone keeps its own instructions only.
          if (ctx.get('modelTiers')?.instructionsReplaced?.(agent.id) === true) return '';
          return access.promptLine(agent);
        } catch {
          return '';
        }
      } }),
      'modes tool access section',
    );
    promptDisposers.set(agent.id, () => {
      dispose?.();
      disposeLens?.();
      disposeAccess?.();
    });
  }

  /** @returns {string} a conversation's Lens id: its own pick, else Default (a helper follows its conversation). */
  function lensOf(sessionId) {
    // A Lens of your own that was removed is Default again.
    return lensIdIn(readObject(config.sessionLens)[topOf(sessionId)], ownLensesOf(plain(config.ownLenses)));
  }
  /** @returns {string} the text the model is told for a conversation's Lens ('' for Default). */
  function lensWordsOf(sessionId) {
    return lensTextIn(lensOf(sessionId), ownLensesOf(plain(config.ownLenses)));
  }
  /**
   * @param {object} agent - live Agent.
   * @returns {string} the Lens text its instructions carry: '' for Default, for a helper (searchers and
   *   workers stay neutral), and while Learn's tutor runs a study session in it (the owner: the Lens
   *   pauses; without Learn it simply stays). It stays with tools off and under a model version that
   *   stands alone ("Use only these"), like the Web and Depth notes.
   */
  function lensSaid(agent) {
    try {
      const id = agent?.id;
      if (!id || topOf(id) !== id) return '';
      if (ctx.get('learning')?.studying?.(id) === true) return '';
      return lensWordsOf(id);
    } catch {
      return '';
    }
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
      if (starting) await seedStart(agent, modeOf(agent.id));
    } catch (error) {
      report(error);
    }
    void pruneStale().catch(report);
    void clearOldWebMarks().catch(report);
    void moveWebLevels().catch(report);
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
      if (event?.type !== 'agent/inbox/spliced') return;
      const id = session?.id;
      const fromTimer = fromScheduler(event.data?.inserted);
      // An Automation that runs again in a conversation that already exists: that run has nobody to answer (until the user writes).
      if (id && fromTimer) scheduledRun.add(id);
      else if (id && Array.isArray(event.data?.inserted) && event.data.inserted.some((item) => (item?.source ?? item?.message?.source)?.kind === 'user')) scheduledRun.delete(id);
      if (!fromTimer || !id || !fresh.has(id) || scheduled.has(id)) return;
      scheduled.add(id);
      const agent = ctx.get('agents')?.get?.(id);
      const mode = modeOf(id);
      // A new conversation that starts in the task's mode: its sandbox and tier apply as on a switch.
      if (agent && applied.get(id)?.modeId !== mode.id) void applyMode(agent, mode, true).catch(report);
    } catch (error) {
      report(error);
    }
  });

  // A Long run starting or ending changes the tools of its conversation and its helpers (Mission says which).
  ctx.inject(['mission'], (inner) => {
    try {
      inner.effect(() => inner.mission.onEvent?.((event) => {
        if (event?.kind !== 'long' || (event.type !== 'started' && event.type !== 'finished')) return;
        for (const agent of ctx.get('agents')?.list?.() ?? []) {
          if (topOf(agent.id) === event.conversation) reconcile(agent);
        }
      }) ?? (() => {}), 'modes: tools follow Long runs');
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

  // ---- Thorough: one check before the turn ends (step 17) --------------------------------------
  /** The turn each conversation last got its check in: one check per turn. */
  const checkedTurn = new Map();
  /** Conversations in their check step: a tool that would start a whole new run is refused. */
  const checking = new Set();
  /** Helpers started during a conversation's check step -> that conversation (refused the same tools). */
  const checkHelpers = new Map();
  /** Conversations whose turn last called a tool that asks the user (a question, a plan to approve), still unanswered. */
  const askedUser = new Set();
  /** The turn in which each conversation last got a message from its user (typed, a skill, an answer). */
  const userTurn = new Map();
  /** Conversations whose current turn had a reply cut off at the output limit: no check then. */
  const cutOff = new Set();
  const ASKING_TOOLS = new Set(['ask_user_question', 'exit_plan_mode']);
  /** Messages that come from the user: a turn without one (a goal round, a helper's notice, an Automation task) gets no check. */
  const USER_KINDS = new Set(['user', 'skill-invocation', 'user-question-reply']);
  /** What the check refuses: the tools that start a whole new run (the owner: never start the work over). */
  const CHECK_BLOCKED = new Set([...SLOW_TOOLS, 'workflow']);
  /** @returns {object} the check, as a message the app shows as one line, not as the user's. */
  function checkMessage() {
    return Object.freeze({
      id: randomUUID(),
      role: 'user',
      content: Object.freeze([Object.freeze({ type: 'text', text: DEPTH_CHECK_PROMPT })]),
      source: Object.freeze({ kind: DEPTH_CHECK_KIND, form: 'notice', summary: DEPTH_CHECK_SUMMARY }),
    });
  }
  /** @returns {boolean} whether the app shows only a turn's final answer (Settings → General → Replies after collapse). */
  function finalAnswerOnly() {
    try {
      return plain(ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'ui-chat')?.value?.foldedReplies) === 'final';
    } catch {
      return false;
    }
  }
  /**
   * @param {object} agent - live Agent.
   * @param {number} turn - the turn about to close.
   * @returns {boolean} whether this turn gets the check: the conversation itself (no helper), a turn
   *   with a message from its user (not a goal round, a helper's notice or an Automation task), its
   *   Depth note Thorough (so not with tools off, while a Mission run is on, or in a Recon conversation
   *   that can use none of its tools), not on an engine (Engines would run its whole task again), and
   *   not while only the final answer is shown (the check's one line would hide the answer).
   */
  function checkWanted(agent, turn) {
    if (!agent?.id || topOf(agent.id) !== agent.id || !isTopLevel(agent) || scheduled.has(agent.id)) return false;
    if (userTurn.get(agent.id) !== turn) return false;
    if (depthSpoken(agent) !== 'thorough') return false;
    let provider = '';
    try {
      provider = String(agent.model?.current?.()?.provider ?? '');
    } catch {
      provider = '';
    }
    return !provider.startsWith('engine-') && !finalAnswerOnly();
  }
  // Which turns the user spoke in; and input the user sends during the check step ends the check's block.
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    const id = agent?.id;
    // A run the scheduler started has nobody to answer; a message the user wrote ends that.
    if (id && message?.source?.kind === 'schedule') scheduledRun.add(id);
    else if (id && USER_KINDS.has(message?.source?.kind)) scheduledRun.delete(id);
    if (!id || !USER_KINDS.has(message?.source?.kind)) return;
    userTurn.set(id, turn);
    checking.delete(id);
  });
  // A reply cut off at the output limit: the app ends the turn there, and a check step could only leave a tool unanswered.
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    if (agent?.id && frame?.type === 'chunk' && frame.chunk?.type === 'finish' && frame.chunk.reason?.kind === 'max-tokens') cutOff.add(agent.id);
  });
  // The app asks before a turn closes; a listener that steers gets one more step (the check), and
  // the next ask closes the turn. Only once per turn, so it can never loop.
  ctx.on('agent/turn-stopping', ({ agent, turn, signal }) => {
    const id = agent?.id;
    if (!id) return;
    try {
      const asked = askedUser.delete(id);
      const cut = cutOff.delete(id);
      // The check step has run: the turn closes now.
      if (checking.delete(id)) return;
      if (signal?.aborted || asked || cut || checkedTurn.get(id) === turn || !checkWanted(agent, turn)) return;
      checkedTurn.set(id, turn);
      checking.add(id);
      agent.steer(checkMessage());
    } catch (error) {
      checking.delete(id);
      report(error);
    }
  });
  // A helper started during the check step is held to the check's rule too.
  ctx.on('agent/created', ({ agent }) => {
    try {
      const parent = parentIdOf(agent?.header ?? agent?.session?.header);
      const root = parent ? rootOf(parent, parents) : null;
      if (agent?.id && root && checking.has(root)) checkHelpers.set(agent.id, root);
    } catch {
      // never in the way of a new conversation
    }
  });
  // A question to the user or a plan to approve that was answered lets the rest of the turn be
  // checked; one still waiting (no answer in time, a review the user dismissed) does not.
  ctx.on('tools/result', (exec, result) => {
    try {
      const id = exec?.agent?.id;
      if (!id || !ASKING_TOOLS.has(exec.name)) return;
      const text = JSON.stringify(result ?? {});
      const waiting = result?.isError === true || /"pending"\s*:\s*true|"approved"\s*:\s*false|dismissed the plan review/.test(text);
      if (!waiting) askedUser.delete(id);
    } catch {
      // keep the mark: no check rather than a check over an open question
    }
  });
  // During the check, a tool that would start a whole new run is refused (the owner: a check never
  // starts the work over); small fixes and single searches still run. A question to the user or a
  // plan to approve is noted, so a turn that ends waiting on the user gets no check.
  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        try {
          const id = exec?.agent?.id;
          if (!id) return undefined;
          if (ASKING_TOOLS.has(exec.name)) {
            askedUser.add(id);
            return undefined;
          }
          const inCheck = checking.has(id) || checking.has(checkHelpers.get(id));
          return inCheck && CHECK_BLOCKED.has(exec.name) ? DEPTH_CHECK_REFUSAL : undefined;
        } catch {
          return undefined;
        }
      }),
    'modes: the check before finishing never starts the work over',
  );

  ctx.on('agent/status', ({ agent, status }) => {
    if (status === 'idle' && agent?.id) {
      checking.delete(agent.id);
      askedUser.delete(agent.id);
      cutOff.delete(agent.id);
      for (const [helper, root] of checkHelpers) if (root === agent.id) checkHelpers.delete(helper);
    }
    if (status === 'idle' && agent?.id) access?.idle(topOf(agent.id), agent.id);
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
  // An isolated conversation that keeps calling the step tool of a run that has ended: the turn ends.
  // Its report is already in the conversation; a new message from the user starts afresh.
  ctx.on('agent/pre-step', ({ agent }, next) => {
    try {
      if (agent?.id && (runOverCalls.get(agent.id) ?? 0) >= RUN_OVER_LIMIT) {
        runOverCalls.delete(agent.id);
        ctx.logger.info(`modes: ended a turn of ${agent.id}: it kept calling ${RUN_STEP_TOOL} after its Long run had ended`);
        return { kind: 'reject' };
      }
    } catch (error) {
      ctx.logger.warn(`modes: could not check for a run that has ended: ${error?.message ?? error}`);
    }
    return next();
  });
  ctx.on('session/event', (session, event) => {
    if (event?.type === 'turn/start' && session?.id) runOverCalls.delete(session.id);
  });
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
  // Skills switched off in a tab (Tuner Plus's step 14): the skill list the app hands a conversation leaves
  // them out, and a list the model already sees is not sent again. Isolated conversations get no list at all
  // (above). Nothing switched off: the step is left exactly as it is.
  // Registered outermost (prepend), so it sees the list the app adds, whatever the order the add-ons loaded in.
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    const decision = await next();
    try {
      if (!agent?.id || decision?.kind !== 'enter' || !Array.isArray(decision.messages) || isIsolated(agent.id)) return decision;
      const off = offIn(readObject(config.skillsOff), modeOf(agent.id)?.id);
      if (off.size === 0) return decision;
      const result = withoutOffSkills(decision.messages, off, () => lastSeenCatalog(agent.session));
      if (result.unknown) ctx.logger.warn('modes: the skill list was not in the form Modes knows, so it was left whole');
      return result.changed ? { ...decision, messages: result.messages } : decision;
    } catch (error) {
      ctx.logger.warn(`modes: could not leave out the skills switched off in this tab: ${error?.message ?? error}`);
      return decision;
    }
  }, { prepend: true });
  // A call for a switched-off skill is refused by a guard (it holds whatever other add-ons answer); the
  // listener below says the same when the guard service is not there.
  const skillOffReason = (exec) => {
    if (!exec?.agent?.id || exec.name !== 'skill') return undefined;
    const name = typeof exec.arguments?.name === 'string' ? exec.arguments.name.trim() : '';
    const mode = modeOf(exec.agent.id);
    if (!name || !offIn(readObject(config.skillsOff), mode?.id).has(name)) return undefined;
    return `The skill "${name}" is switched off in the ${mode?.label ?? 'this'} tab, so it is not loaded here. Do the task without it. (The user can switch it back on.)`;
  };
  ctx.effect(() => (typeof ctx.tools?.guard === 'function' ? ctx.tools.guard((exec) => {
    try {
      return skillOffReason(exec);
    } catch {
      return undefined;
    }
  }) : undefined), 'modes: skills switched off per tab');
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
      // Only the app's own Office skills: a skill of the same name from a project or the shared
      // folder (it wins over the app's) brings nothing (17 November 2026).
      const loaded = result?.value;
      if (loaded?.provider !== 'dsh-office' || !appOfficeFolder(loaded?.resourceBase?.path, APP_CONTENTS)) return;
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
    // The two Tool access tools are never found or added here (they are on their own while Tool access is on, absent while it is off).
    return known.filter((name) => !fenced.includes(name) && !isOwnTool(name)).map((name) => ({ name, description: described.get(name) }));
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
    checkedTurn.delete(agent.id);
    checking.delete(agent.id);
    askedUser.delete(agent.id);
    userTurn.delete(agent.id);
    cutOff.delete(agent.id);
    checkHelpers.delete(agent.id);
    applied.get(agent.id)?.unrestrict?.();
    applied.delete(agent.id);
    fresh.delete(agent.id);
    claimed.delete(agent.id);
    scheduled.delete(agent.id);
    scheduledRun.delete(agent.id);
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
  /** Its write while in flight (pruning waits for it, so it never writes the old marks back). */
  let marksWriting = Promise.resolve();
  async function clearOldWebMarks() {
    if (marksDone || plain(config.webMarksCleared) === true) return marksWriting;
    marksDone = true;
    const settings = ctx.get('settings');
    if (!settings) return;
    const webs = readObject(config.sessionWeb);
    const cleared = oldWebMarks(webs, readObject(config.sessionModes), readModes(config));
    const next = { ...webs };
    for (const id of cleared) delete next[id];
    const ops = [{ op: 'set', path: ['webMarksCleared'], value: true }];
    if (cleared.length > 0) ops.push({ op: 'set', path: ['sessionWeb'], value: JSON.stringify(next) });
    const writing = settings.mutate('modes', ops);
    marksWriting = writing.catch(() => {});
    await writing;
    if (cleared.length > 0) ctx.logger.info(`modes: cleared ${cleared.length} old "Search off" mark(s) in tabs with their own search`);
  }

  /**
   * Since 0.59.0 the Web button is only On or Off, and Depth carries how much the model searches. Each
   * conversation's former Web level becomes its Depth once (Deep becomes Thorough; a Depth already
   * picked stays), and a start of Deep becomes Thorough.
   */
  let depthMoveDone = false;
  /** Its write while in flight (pruning waits for it, so it never writes the old values back). */
  let depthMoving = Promise.resolve();
  async function moveWebLevels() {
    if (depthMoveDone || plain(config.depthMoved) === true) return depthMoving;
    const settings = ctx.get('settings');
    if (!settings) return;
    depthMoveDone = true;
    const { depths, start } = movedDepths(readObject(config.sessionSearchDepth), readObject(config.sessionDepth), config.searchDepth);
    const ops = [
      { op: 'set', path: ['depthMoved'], value: true },
      { op: 'set', path: ['sessionDepth'], value: JSON.stringify(depths) },
      { op: 'set', path: ['sessionSearchDepth'], value: '{}' },
    ];
    if (start !== config.searchDepth) ops.push({ op: 'set', path: ['searchDepth'], value: start });
    const writing = settings.mutate('modes', ops);
    depthMoving = writing.catch(() => {});
    try {
      await writing;
    } catch (error) {
      // Tried again with the next conversation that opens.
      depthMoveDone = false;
      throw error;
    }
    ctx.logger.info('modes: each conversation\'s Web level moved into its Depth (the Web button is now On or Off)');
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
    const timer = setTimeout(() => {
      void moveWebLevels().catch(report);
      void addDataTrim().catch(report);
    }, 2000);
    timer.unref?.();
    return () => clearTimeout(timer);
  }, 'modes: Web levels move into Depth, Data loads its tools as needed (once each)');

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
      const fields = ['sessionModes', 'sessionWeb', 'sessionWebLevel', 'sessionWebSources', 'sessionResearch', 'sessionSearchDepth', 'sessionDepth', 'sessionLens', 'sessionTools', 'sessionHelpers', 'sessionIsolated', 'sessionToolSets', 'sessionSandboxBase'];
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
      // The permissions of a conversation that was deleted go with it (not those of one in the trash, which can come back).
      try {
        for (const sessionId of access?.store?.conversations?.() ?? []) {
          if (live.has(sessionId) || trashed.has(sessionId)) continue;
          if ((await persistence.stat(sessionId)) === undefined) access.forget(sessionId);
        }
      } catch {
        // keep them when unsure
      }
      if (gone.size > 0) {
        // The one-time moves (Web levels into Depth, old Search-off marks) write some of these fields
        // too: wait for them, so this write is built from their result and never undoes them.
        await Promise.all([moveWebLevels().catch(() => {}), clearOldWebMarks().catch(() => {})]);
        // Build from the current values (they may have changed while checking); write only the fields
        // that hold a gone id, and drop only those ids.
        const ops = fields.flatMap((field) => {
          const current = readObject(config[field]);
          if (![...gone].some((id) => Object.hasOwn(current, id))) return [];
          const next = { ...current };
          for (const id of gone) delete next[id];
          return [{ op: 'set', path: [field], value: JSON.stringify(next) }];
        });
        if (ops.length > 0) await settings.mutate('modes', ops);
        ctx.logger.info(`modes: pruned ${gone.size} stale session entries`);
      }
    } catch (error) {
      report(error);
    }
  }

  /** Mode API for other plugins and the command. */
  let skillsOffChain = Promise.resolve();
  const modes = {
    apiVersion: 1,
    /** @returns {Array<{id: string, label: string}>} the available modes. */
    list() {
      return Object.values(readModes(config)).map((mode) => Object.freeze({ id: mode.id, label: mode.label }));
    },
    /** @returns {string} the Depth new conversations start with: quick, standard or thorough. */
    searchDepth() {
      return depthStart();
    },
    /**
     * @param {string} sessionId - a conversation (or one of its helpers: the top conversation counts).
     * @returns {string} its Depth as picked: quick, standard or thorough.
     */
    depthOf(sessionId) {
      return depthOf(sessionId);
    },
    /**
     * @param {string} sessionId - a conversation (or one of its helpers: the top conversation counts).
     * @returns {string} its Lens id ('default' when none is picked).
     */
    lens(sessionId) {
      return lensOf(sessionId);
    },
    /**
     * @param {string} sessionId - a conversation (or one of its helpers).
     * @returns {string} its Lens text for Deep research's report writer ('' for Default, and while a
     *   study session runs in the conversation).
     */
    lensWords(sessionId) {
      try {
        const top = topOf(String(sessionId ?? ''));
        if (!top || ctx.get('learning')?.studying?.(top) === true) return '';
        return lensWordsOf(top);
      } catch {
        return '';
      }
    },
    /**
     * @param {object} agent - live Agent.
     * @returns {string} the Depth whose note its instructions carry ('standard': none). Model Tiers
     *   keeps only its thinking words when it is Quick or Thorough (Depth then speaks for planning,
     *   checks and reviews).
     */
    depthSpoken(agent) {
      try {
        return depthSpoken(agent);
      } catch {
        return 'standard';
      }
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
    /**
     * @returns {string} for older callers: the Depth new conversations start with (quick, standard or
     *   thorough). Since 0.59.0 a research run follows its conversation's Depth: `depthOf(sessionId)`.
     */
    researchDepth() {
      return depthStart();
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
    /** @returns {Record<string, string[]>} the skills switched off per tab (`{ tabId: [names] }`). */
    skillsOff() {
      const table = readObject(config.skillsOff);
      return Object.fromEntries(Object.keys(readModes(config)).map((id) => [id, [...offIn(table, id)]]).filter(([, names]) => names.length > 0));
    },
    /**
     * Switch off exactly these skills in one tab (an empty list switches them all back on). The owner's click
     * on Tuner Plus's page or Modes' own page; never a model's.
     * @returns {Promise<string[]>} the tab's switched-off skills now.
     */
    async setSkillsOff(tabId, names) {
      const id = String(tabId ?? '');
      if (!readModes(config)[id]) throw new Error(`There is no tab "${id}".`);
      if (readModes(config)[id].isolated === true) throw new Error('An isolated tab gets no skill list at all.');
      // One change at a time, each from the setting as it is then.
      const run = skillsOffChain.catch(() => {}).then(async () => {
        const settings = ctx.get('settings');
        if (!settings) throw new Error('The settings cannot be written now.');
        const next = withOff(readObject(config.skillsOff), id, names);
        await settings.mutate('modes', [{ op: 'set', path: ['skillsOff'], value: JSON.stringify(next) }]);
        return [...offIn(next, id)];
      });
      skillsOffChain = run;
      return run;
    },
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
    /**
     * Whether the conversation's tab runs Read Only (its mode sets the read-only access level). A
     * Long run there is allowed, with a warning, and Mission puts the level back when it ends.
     * @param {string} sessionId - Agent id.
     * @returns {boolean}
     */
    readOnly(sessionId) {
      try {
        return modeOf(sessionId)?.sandbox === 'read-only';
      } catch {
        return false;
      }
    },
    /**
     * Put the tool mask of a conversation and its helpers right now (Mission, just before a Long run's
     * first round, and after it ends), not at the next turn's boundary: the run's first round needs them.
     * @param {string} sessionId - the conversation.
     */
    refreshTools(sessionId) {
      for (const agent of ctx.get('agents')?.list?.() ?? []) {
        try {
          if (topOf(agent.id) === sessionId) refreshTools(agent);
        } catch (error) {
          report(error);
        }
      }
    },
    /**
     * The tab's starting choice of tools for a Long run (Settings → Modes → Long run tools).
     * @param {string} sessionId - Agent id.
     * @returns {{files: boolean, web: boolean}}
     */
    longTools(sessionId) {
      try {
        return longToolsOf(modeOf(sessionId));
      } catch {
        return { files: true, web: true };
      }
    },
    noTools(sessionId) {
      try {
        const mask = toolMask(sessionId, modeOf(sessionId));
        // The two Tool access tools do not count: a conversation that has only them has no tools (Code map, Finance, Model tiers ask this).
        return Array.isArray(mask?.allow) && mask.allow.every((tool) => WEB_TOOLS.includes(tool) || isOwnTool(tool));
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
        const long = mode?.isolated ? undefined : longRunOf(top);
        if (long) return !long.web;
        return mode?.isolated ? isolatedWebOff(top) : !webOn(top, mode);
      } catch {
        return false;
      }
    },
    /**
     * The conversation's Web level (plan step S1): 'off', 'verified', 'open', 'everything' or 'custom';
     * undefined for On as before (no limit beyond the tab's own), and in Recon and Research.
     * @param {string} sessionId - Agent id.
     * @returns {string | undefined}
     */
    webLevel(sessionId) {
      try {
        const mode = modeOf(topOf(sessionId));
        if (!mode || mode.isolated || researchTab(mode.tools)) return undefined;
        if (modes.webOff(sessionId)) return 'off';
        return levelOf(sessionId)?.level;
      } catch {
        return undefined;
      }
    },
    /**
     * Whether the conversation's Web level lets a tool open an address (for tools that fetch inside
     * themselves, such as Deep research). Undefined when no level is picked.
     * @param {string} sessionId - Agent id.
     * @param {string} address - a web address.
     * @returns {boolean | undefined}
     */
    webAllows(sessionId, address) {
      try {
        const ticks = sourcesNow(sessionId);
        if (!ticks) return undefined;
        return sourcesAllow({ ticks, lists: sourceLists(), address }).ok;
      } catch {
        return undefined;
      }
    },
    /**
     * The conversation's Web sources (the one Web selector): its ticks, or undefined for All (no limit, as
     * before) and while the Web is Off. In Recon the ticks include its networks (tor, usenet, i2p); Recon's
     * tools ask here and refuse what is not ticked.
     * @param {string} sessionId - Agent id (a helper follows its conversation).
     * @returns {string[] | undefined}
     */
    webSources(sessionId) {
      try {
        return sourcesNow(sessionId);
      } catch {
        return undefined;
      }
    },
    /**
     * The conversation's Web sources in words, for helpers that search for it (Deep research's planner and
     * searchers): which kinds are ticked and how to word searches for them. '' for All, and in Recon.
     * @param {string} sessionId - Agent id.
     * @returns {string}
     */
    webSourcesSaid(sessionId) {
      try {
        if (modeOf(topOf(sessionId))?.isolated) return '';
        return sourcesSaid(sourcesNow(sessionId), { other: otherNames(false) }).trim();
      } catch {
        return '';
      }
    },
    /**
     * The kinds an address belongs to (verified, academic, news, sites, forums, social, archives, or
     * unknown), by the lists on Settings → Web sources. For tools that judge results themselves (Recon).
     * @param {string} address - a web address.
     * @returns {string[]}
     */
    webKinds(address) {
      try {
        return kindsOf(address, sourceLists());
      } catch {
        return [];
      }
    },
    /**
     * Sets a conversation's ticks once, unless it has its own (Research carries a conversation's former Focus
     * over with this). Undefined or every tick: All.
     * @param {string} sessionId - the conversation.
     * @param {string[] | undefined} ticks - the ticks.
     * @returns {Promise<boolean>} whether anything was written.
     */
    async carryWebSources(sessionId, ticks) {
      const id = String(sessionId ?? '');
      if (!id || readObject(config.sessionWebSources)[id] !== undefined) return false;
      const clean = ticksOf(ticks);
      if (!clean || isAll(clean)) return false;
      const next = { ...readObject(config.sessionWebSources), [id]: clean };
      await ctx.get('settings')?.mutate?.('modes', [{ op: 'set', path: ['sessionWebSources'], value: JSON.stringify(next) }]);
      return true;
    },
    /**
     * The owner's own sources Recon may use (each source's "May be used in Recon" switch): names only.
     * @returns {string[]}
     */
    reconOtherNames() {
      return otherNames(true);
    },
    /**
     * For Recon's status bar: each source it may use, whether its login is kept (looked up on this Mac only,
     * never sent anywhere, never the login itself) and its kind of login.
     * @returns {Promise<Array<{name: string, login: string, kept: boolean}>>}
     */
    async reconOtherStatus() {
      const out = [];
      for (const source of otherList().filter((one) => one.recon)) {
        let kept = true;
        for (const part of partsOf(source.login)) if (!(await secrets.has(source, part).catch(() => false))) kept = false;
        out.push({ name: source.name, login: source.login, kept });
      }
      return out;
    },
    /**
     * For Recon only: what a request to one of the sources it may use needs (its addresses, its login headers
     * and the parts to take out of what the model sees). Recon sends it only through its own route.
     * @param {string} name - the source's name, as the model gave it.
     * @returns {Promise<{name: string, search: string, start: string, headers: Record<string, string>, hide: string[], hideHost: string} | {error: string}>}
     */
    async reconOtherRequest(name) {
      const list = otherList().filter((source) => source.recon);
      const source = otherNamed(name, list);
      if (!source) return { error: `There is no source named "${String(name ?? '').slice(0, 60)}" that may be used in Recon. Those that may: ${list.map((one) => `"${one.name}"`).join(', ') || 'none'}.` };
      try {
        return { name: source.name, ...(await otherRequest(source)) };
      } catch (error) {
        return { error: String(error?.message ?? error) };
      }
    },
    /**
     * Whether Ultra Code is on for the conversation (its switch beside Effort, or Model Tiers' top
     * effort step). Undefined when Model Tiers cannot say.
     * @param {string} sessionId - Agent id.
     * @returns {boolean | undefined}
     */
    ultraCode(sessionId) {
      try {
        const answer = ctx.get('modelTiers')?.ultraCode?.(topOf(sessionId));
        return typeof answer === 'boolean' ? answer : undefined;
      } catch {
        return undefined;
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

  // Tool access: the grid, permissions, `tools_catalog` and `request_tool_access` (lib/access.js, docs/MODES-AND-SETTINGS.md).
  /** Mission's wait time, in minutes, or undefined when it cannot be read. */
  function missionWaitMinutes() {
    const value = plain(ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'mission')?.value?.waitMinutes);
    return typeof value === 'number' ? value : undefined;
  }
  /** Whether the newest message of a conversation came from the scheduler: also true after a restart, from the saved messages. */
  function lastMessageFromScheduler(top) {
    try {
      const messages = ctx.get('agents')?.get?.(top)?.session?.deriveMessages?.();
      if (!Array.isArray(messages)) return false;
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'user') continue;
        const kind = (message.source ?? message.message?.source)?.kind;
        // A message the app added by itself (a note, a reminder) is not the user's: look further back.
        if (kind === 'schedule') return true;
        if (kind === undefined || kind === 'user') return false;
      }
      return false;
    } catch {
      return false;
    }
  }
  access = wireToolAccess(ctx, {
    config,
    plain,
    readModes: () => readModes(config),
    modeOf,
    topOf,
    knownTools,
    globalToolNames,
    baseMask: (sessionId, mode) => baseToolMask(sessionId, mode),
    currentMask: (sessionId) => toolMask(sessionId, modeOf(sessionId)),
    isolatedTools,
    isolatedWebOff,
    webOn,
    webTools: WEB_TOOLS,
    researchTool: RESEARCH_TOOL,
    otherTools: OTHER_TOOLS,
    webReaching,
    onlineImageTools,
    toolsOff,
    shellTools: SHELL_TOOLS,
    goesOnline,
    refreshTools,
    // Does this conversation hold material that came out of Recon (an export that reached it, or a conversation moved
    // out of Recon)? Asked of Recon's real services: `reconExports` (a marker in the messages, or the door's list) and
    // `reconMoved` (the conversations a move opened). A damaged door.json counts for every conversation (Recon fails closed too).
    reconExport: (top) => {
      try {
        const moved = ctx.get('reconMoved');
        if (moved) {
          if (moved.damaged?.() === true) return true;
          if (typeof moved.holds === 'function' ? moved.holds(top) === true : moved.list?.().includes(top)) return true;
        }
        return ctx.get('reconExports')?.has?.(top) === true;
      } catch {
        // Recon cannot be asked: its limit applies (the tab that is not sure asks for less).
        return Boolean(ctx.get('reconMoved') || ctx.get('reconExports'));
      }
    },
    researchHelper: (id) => topOf(id) !== id && researchOn(id),
    programOnly: (id) => {
      try {
        return programOnly(ctx.tools, ctx.get('agents')?.get?.(id)) === true;
      } catch {
        return false;
      }
    },
    // Nobody is there to answer: an Automation's conversation (also one it re-runs in, and after a restart), or a Mission run that does not wait.
    unattended: (top) => {
      if (scheduled.has(top) || scheduledRun.has(top) || lastMessageFromScheduler(top)) return true;
      try {
        if (!ctx.get('mission')?.longRun?.(top)) return false;
        return missionWaitMinutes() === 0;
      } catch {
        return false;
      }
    },
    // A Mission run that waits for the user waits as long as its own wait time says (at most two hours here).
    waitMs: (top) => {
      try {
        if (!ctx.get('mission')?.longRun?.(top)) return undefined;
        const minutes = missionWaitMinutes();
        return typeof minutes === 'number' && minutes > 0 ? minutes * 60_000 : undefined;
      } catch {
        return undefined;
      }
    },
  });
  ctx.on('tools/result', (exec) => access?.markOutside(exec));

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
    // While Tool access is off the two tools of the feature are not there for the AI: the list shows what it showed before them.
    if (access && !access.enabled()) {
      can = can.filter((name) => !isOwnTool(name));
      all = all.filter((name) => !isOwnTool(name));
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
      // Whether Tool access is on (the page leaves its section out while it is off).
      access: access ? access.enabled() : false,
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
    // Tool access: the page and the choice card reach the service `toolAccess` here (lib/route.js).
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: TOOL_ACCESS_PATH,
          handler: toolAccessHandler({ service: () => access?.service, connection: inner.connection, lab: process.env.DSH_TOOL_ACCESS_LAB === '1' }),
        }),
      'modes: tool access route',
    );
    // Settings → Web sources → Other sources: which secrets are kept (never the secrets themselves), keeping
    // and forgetting one, and a test read. The sources themselves are saved as settings by the page.
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: OTHER_PATH,
          handler: async (req, res) => {
            const refused = inner.connection.requestRejection(req);
            if (refused !== undefined) {
              res.statusCode = refused;
              res.end();
              return;
            }
            if (req.method !== 'GET' && req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('allow', 'GET, POST');
              res.end();
              return;
            }
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            try {
              let extra = {};
              if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 32_768) throw new Error('request too large');
                  chunks.push(chunk);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const id = String(body?.id ?? '');
                const source = otherList().find((one) => one.id === id);
                switch (body?.action) {
                  case 'secret': {
                    if (!source) throw new Error('Save the source first, then its secret.');
                    const part = body.part === 'user' ? 'user' : 'secret';
                    if (!partsOf(source.login).includes(part)) throw new Error('This kind of login does not use that.');
                    await secrets.set(source, part, String(body.value ?? ''));
                    break;
                  }
                  case 'forget':
                    // Works for a source that was just removed too, so no secret is left behind (both places).
                    if (!/^[a-z0-9]{1,24}$/.test(id)) throw new Error('unknown source');
                    for (const part of ['user', 'secret']) await secrets.unset(source ?? { id, store: 'app', name: id }, part);
                    break;
                  case 'test': {
                    if (!source) throw new Error('unknown source');
                    const request = await otherRequest(source);
                    const address = request.search ? request.search.replace('{query}', encodeURIComponent('test')) : request.start;
                    const page = await readSource(address, request.headers);
                    extra = page.ok
                      ? { tested: { ok: true, status: page.status, title: scrub(page.title, request.hide, source.name).slice(0, 120), text: scrub(page.text, request.hide, source.name).slice(0, 400) } }
                      : { tested: { ok: false, why: scrub(page.why, request.hide, source.name) } };
                    break;
                  }
                  default:
                    throw new Error('unknown action');
                }
              }
              const kept = {};
              for (const source of otherList()) {
                kept[source.id] = {};
                for (const part of partsOf(source.login)) kept[source.id][part] = await secrets.has(source, part).catch(() => false);
              }
              res.end(JSON.stringify({ kept, keychain: process.platform === 'darwin', ...extra }));
            } catch (error) {
              res.statusCode = req.method === 'POST' ? 400 : 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
            }
          },
        }),
      'modes: Other sources route',
    );
  });

  // A skill switched off in this tab is not loaded by the model (it may still know its name from an older list).
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    try {
      const reason = skillOffReason(exec);
      return reason ? { kind: 'deny', reason } : decision;
    } catch (error) {
      report(error);
      return decision;
    }
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
