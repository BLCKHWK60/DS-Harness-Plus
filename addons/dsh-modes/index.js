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
import { fromScheduler, scheduledModeId, scheduledTaskIds } from './lib/scheduled.js';
import { wireToolAccess } from './lib/wire.js';
import { PROGRAM_NAMES, SHELL_NAMES } from './lib/online.js';
import { classify, isOwnTool } from './lib/catalog.js';
import { ENGINE_HELD_TAKEN_PATH, TOOL_ACCESS_PATH, engineHeldTakenHandler, modeHandler, toolAccessHandler } from './lib/route.js';
import { engineHeldTexts } from './lib/engineheld.js';
import { PROGRAM_TOOL, programNote, programOnly, SLOW_TOOLS, TIMED_TOOLS } from './lib/ptc.js';
import { FALLBACK_MODE_IDS, LOCK_PRESET, PTC_PRESET, SPACE_LOCK_KEY, defaultLockOf, lockCaution, lockConflictLine, lockInSpace, lockOf, lockedPresetOf, loosenWarning, noProgramsPtcPrompt, presetInfo, ptcReach, reachLine, readLocks, refusesPrograms, restartPresetOf, swapNote, whereText } from './lib/presetlock.js';
import { helpersBelow, onlyStopNotes, stoppedByUser } from './lib/stop.js';
import { CORE, FAMILIES, FIND_TOOL, appOfficeFolder, brings, catalog as trimCatalog, closedHere, mentioned, others as trimOthers, resolveRequest, skillFamilies, skillFolderIn } from './lib/trim.js';
import { LOCKED_MODE, RUN_OVER_LIMIT, RUN_OVER_TEXT, RUN_STEP_TOOL, dropIsolatedNotes, heldMode, isolatedMayRun, isolatedRunMask, modeChangeRefusal } from './lib/isolation.js';
import { CHAT_PROMPT, DEPTH_CHECK_KIND, DEPTH_CHECK_PROMPT, DEPTH_CHECK_REFUSAL, DEPTH_CHECK_SUMMARY, promptText } from './lib/prompt.js';
import { lensIdIn, lensTextIn, ownLensesOf } from './lib/lens.js';
import { draftAccessStep, movedSince, readBase, readEntry, sandboxStep } from './lib/sandbox.js';
import { normalizeStart, restartOps, seededBy, startOps } from './lib/start.js';
import { OTHER_TOOLS, SECRET_MARKS, WRITE_TOOLS, linkOn, openSecrets, otherSourcesOf, partsOf, readSource, requestOf, scrub, showPage } from './lib/other.js';
import { ACADEMIC_START, KINDS, NETS, NEWS_START, PAGE_KINDS, kindsOf, filterSearchText, isAll, listsOf, selectionsOf, sourcesAllow, sourcesSaid, tickedWords, ticksFromLevel, ticksOf } from './lib/sources.js';
import { beforeFirstMessage, sidebarTabs, tabCount } from './lib/tabs.js';
import { offIn, withOff, withoutOffSkills, lastSeenCatalog } from './lib/skilloff.js';
import { plainAddOps, plainCarryOps } from './lib/plain.js';
import { FENCED_MODES, fenceCheck, fencePrompt, fenceRefusal } from './lib/fence.js';
import { ADDON_NAMES, GUARDED, GUARDED_ADDON, SPACES, SPACE_NAMES, SPACE_SETTINGS_TEXT, draftStartMode, fillSpaces, guessSpace, isSpace, guardedReason, heldText, modeBlurb, modeList, modeName, modeRowsForPage, nextDescriptions, nextModeSpaces, nextSpaceSettings, spaceCards, modePickRefusal, modesInSpace, noteModeChange, spaceMovePlan, spaceOfMode, spaceOfTab, spaceOfThread, spaceText, spacesLive, spacesNow, turnOfPhase } from './lib/spaces.js';
import { GUARDED_SPACES, SEALED_EXTRA_CHOICES, SPACE_RULES, guardRefusesEngine, guestRefuses, heldIn, lostIn, modeKey, reconRefusal, refusesProgramsIn, restartPresetIn, roomPathRefusal, spaceCopy, spaceRefuser, withoutGuestRefused } from './lib/spacerules.js';
import { parseAccess, stateOf } from './lib/access.js';

export { CODE_METHOD, COWORK_METHOD, DEPTH_CHECK_PROMPT, DEPTH_PROMPTS, DEPTH_SEARCH_PROMPTS, ISOLATED_DEPTH_PROMPTS, ISOLATED_LEVEL_PROMPTS, ISOLATED_OFF_PROMPT, SEARCH_DEPTH_PROMPTS } from './lib/prompt.js';

export const name = 'modes';
/** The chat box asks here which tools the model can call in a conversation (header `x-dsh-session`). */
export const TOOLS_PATH = '/dsh-modes/tools';
/** Settings → Web sources asks here which secrets of the owner's own sources are kept, and keeps or forgets one. */
export const OTHER_PATH = '/dsh-modes/other';
/** The preset menu's (i), its lock and the PTC note ask here (header `x-dsh-session`); without a conversation, Settings → Modes reads each tab's choice. */
export const PRESET_PATH = '/dsh-modes/preset';
/** Item 4A, stage 2: the Mode list in the chat box (GET: the list for a thread; POST: a pick, or a new draft's start). */
export const MODE_PATH = '/dsh-modes/mode';
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
    prompt: CHAT_PROMPT,
  },
  cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' },
  code: { label: 'Code', tools: 'all', sandbox: 'workspace-write', defaultTier: '', prompt: '' },
};

/**
 * Item 4A, stage 4: built-in modes added later. They join every list, the owner's own saved `modes` included, without
 * replacing a mode of the same id there (merged like an add-on's mode, but with no tab of their own). Plain chat: the
 * new start mode of the Chat space; every tool the space allows (a standalone thread reaches only its own folder, a
 * project thread its project), no instructions and no working method of its own.
 */
export const ADDED_MODES = Object.freeze({
  plain: Object.freeze({ label: 'Plain chat', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' }),
});

/** The answer to a program started in a conversation that has no tools (the app's PTC preset keeps `run_code` on offer). */
const NO_PROGRAMS = 'no tools are available in this thread, so programs are not run. Answer directly.';
/** The answer to a shell command that goes online while Web is Off. */
const SHELL_OFFLINE = 'web access is Off in this thread, so commands that go online (curl, wget, web addresses, downloads, installs, code that fetches) are not run. Answer without the web, or ask the user to switch Web on in the chat box.';
/** The answer to a program that goes online while Web is Off. */
const PROGRAM_OFFLINE = 'web access is Off in this thread, so programs that go online (fetch, web sockets, network modules, or starting curl, wget and the like) are not run. Answer without the web, or ask the user to switch Web on in the chat box.';
/** Added to the system prompt while the Deep research switch is on. */
const RESEARCH_PROMPT =
  'Deep research is switched on for this thread: for questions that need looking things up, use the deep_research tool to research them thoroughly and answer with a cited report. For small talk or follow-ups about an earlier report, answer directly.';

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
/** Item 4A fix round: what a refused mode for a new thread in Recon's room says (Modes' backstop under `set`). */
export const ROOM_ONLY_RECON = "This new thread is in Recon's room, so it can only be a sealed Recon thread. To use another mode, start a new thread in another space.";
/**
 * Item 4A, stage 6a: the model-facing note of a guest in Recon (its tool, route and room-file sentences only; Recon's
 * own `recon:space` section holds its METHOD rules, REGRESSION 20). English only: the model reads it.
 */
export const SEALED_SPACE_NOTE = 'This thread is in Recon, so it is sealed. Search and read the web only with Recon\'s tools (recon_web_search, recon_web_read and the other recon_ tools). web_search, web_fetch and deep_research are not available here. Files are read and written only in this thread\'s room folder. Nothing from this thread goes into notes other threads read.';
/**
 * Lab fix (6a): SEALED_SPACE_NOTE with the thread's room folder named and the mode's own web words redirected (Research's
 * "call deep_research" would otherwise contradict the note).
 * @param {string} [folder] - the thread's room folder ('' when not known: its file tools are then left out).
 * @returns {string}
 */
export function sealedSpaceNote(folder = '') {
  const where = folder ? ` This thread's room folder is ${folder}: give every file tool a full path inside it (glob and grep need path set to it); paths outside it, relative paths and calls without a path are refused.` : '';
  return `${SEALED_SPACE_NOTE}${where} Where this mode's own instructions above say to call web_search, web_fetch or deep_research, call recon_web_search and recon_web_read instead.`;
}
/** Item 4A, stage 6a: how long a spaced draft's first turn waits for its claim (I3). */
const CLAIM_WAIT_MS = 2000;
/** Item 4A, stage 6a: a failed space or seal write is tried again this often, this many times. */
const RETRY_MS = 5000;
const RETRY_MAX = 5;

export const Config = z.object({
  /** Mode definitions as a JSON object: `{ id: { label, tools, sandbox, defaultTier, prompt } }`. */
  modes: z.string().default(JSON.stringify(BUILTIN_MODES)).volatile(),
  /**
   * Modes that other add-ons add, in the same JSON shape. They come after the modes above and never
   * replace one of them. An add-on writes its own entry here and removes it when it is switched off.
   */
  extraModes: z.string().default('{}').volatile(),
  /** Mode of a thread that has not chosen one. */
  defaultMode: z.string().default('cowork').volatile(),
  /**
   * Mode of a thread that an automation opens. Nobody picked a mode for it, so the space last
   * looked at must not decide. An unknown id falls back to the first mode with all tools.
   * Chosen on Settings → Modes.
   */
  scheduledMode: z.string().default('cowork').volatile(),
  /** Per-thread choice as JSON: `{ sessionId: modeId }`. Written by the composer selector. */
  sessionModes: z.string().default('{}').volatile(),
  /** Threads that began in a sealed mode (id -> true). They stay sealed whatever happens to the mode. */
  sessionIsolated: z.string().default('{}').volatile(),
  /**
   * Skills switched off per mode, as JSON `{ modeId: [skill names] }` (Tuner Plus's step 14). In that mode the model
   * does not see them in its skill list and cannot load them; the owner's own /name still works. Empty: as before.
   */
  skillsOff: z.string().default('{}').volatile(),
  /** Drop per-thread entries whose thread is no longer stored, once per start. */
  pruneStaleSessions: z.boolean().default(true),
  /**
   * When a top-level thread starts its first turn without a chosen mode, record the mode it starts in.
   * A later change of `defaultMode` then only affects new threads.
   */
  pinOnFirstTurn: z.boolean().default(true),
  /** Per-thread web switch as JSON: `{ sessionId: true | false }`. Missing = the mode's default (off in a no-tools mode). */
  sessionWeb: z.string().default('{}').volatile(),
  /**
   * Per-thread Web level as JSON (plan step S1): `{ sessionId: 'verified' | 'open' | 'everything' | 'custom:<name>' }`.
   * Missing = On as before: no limit beyond the mode's own (the owner's choice: the levels are added, the
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
   * Per-thread Web sources as JSON: `{ sessionId: ['verified', 'forums', …] }` (the one Web selector, 18
   * November 2026). Missing = All: the web as before, or, for a thread that picked one of the older levels
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
  /** Obsolete: the old per-thread Deep research switch, no longer offered or read (kept so older settings files still load). Old entries are pruned with the others. */
  sessionResearch: z.string().default('{}').volatile(),
  /** Obsolete since 0.59.0: each thread's former Web level, moved into `sessionDepth` once (`depthMoved`). Kept so older settings files still load. */
  sessionSearchDepth: z.string().default('{}').volatile(),
  /**
   * Per-thread Depth as JSON: `{ sessionId: 'quick' | 'standard' | 'thorough' }` (missing = where new
   * threads start, `searchDepth`). How much work the thread gets: how much it searches when
   * Web is on, helpers, planning, checks and reviews. Set with the Depth button in the chat box, the
   * same in every mode (the owner's rule): Recon gets the care note and then its search effort; Research
   * and Scout get the care note but no searching note (they search by their own method), and a research
   * run started from the thread is sized by it. Never for helpers, while a Mission run is on, or
   * with tools off; a user's own /goal keeps it.
   */
  sessionDepth: z.string().default('{}').volatile(),
  /**
   * Threads whose Depth is on Mission (chosen, not started) as JSON: Start Mission is the main-looking button
   * there; Send keeps the thread's own Depth.
   */
  sessionMission: z.string().default('{}').volatile(),
  /**
   * Per-thread Lens as JSON: `{ sessionId: 'blunt' | 'scientific' | 'journalistic' | 'data-only' |
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
  /** Each thread's former Web level has been moved into its Depth (once, since 0.59.0). */
  depthMoved: z.boolean().default(false).volatile(),
  /**
   * Each mode's starting choice of tools for a Mission, as JSON: `{ modeId: { files: boolean, web: boolean } }`
   * (missing: files and commands on; the web on, off in a sealed mode). A run's card can change it for
   * that run. Set on Settings → Modes → Mission tools.
   */
  longTools: z.string().default('{}').volatile(),
  /** Per-thread tools switch as JSON: `{ sessionId: false }`. While off, the model is offered no tool at all. */
  sessionTools: z.string().default('{}').volatile(),
  /** The Depth new threads start with (quick, standard, thorough), and that a thread without its own pick follows. Set on Settings → Modes, and by every pick on the Depth button. (Named for the former Web level, which it replaced in 0.59.0.) */
  searchDepth: z.string().default('standard').volatile(),
  /** Give the Code mode a working method (read first, small changes, run the tests, report plainly) while it has no instructions of its own. */
  codeMethod: z.boolean().default(true).volatile(),
  /** Give the Cowork mode a working method (understand the task, a step list, care with the user's files, check the result, report plainly) while it has no instructions of its own. */
  coworkMethod: z.boolean().default(true).volatile(),
  /**
   * Per-thread access level from before a mode changed it, as JSON:
   * `{ sessionId: { mode: 'chat', base: 'workspace-write', set: 'read-only' } }` (`mode`: the mode
   * the level was last applied for; `set`: the level that mode set). Leaving the mode puts `base`
   * back, also after a restart, unless the level was changed by hand since. A thread whose
   * mode is no longer `mode` when it is opened was moved while closed: it gets its new mode's level.
   */
  sessionSandboxBase: z.string().default('{}').volatile(),
  /** Obsolete since 0.59.0: the former separate Depth of Deep research runs. A run now follows the Depth of the thread that starts it (`sessionDepth`, else `searchDepth`), the same in every mode. Kept so older settings files still load. */
  researchDepth: z.string().default('standard').volatile(),
  /**
   * Which model Deep research's helpers run on: `same` (the model of the thread that started
   * the research) or `roles` (the role models set in Settings → Model tiers). All threads.
   */
  researchModel: z.string().default('same').volatile(),
  /**
   * The same choice for one thread, as JSON: `{ sessionId: 'same' | 'roles' }`. It decides for
   * every tool that starts helper agents (Mission, Deep research, Agent swarm, the Tier tools, Code
   * power). A thread without an entry follows `researchModel`, which is the default for all.
   */
  sessionHelpers: z.string().default('{}').volatile(),
  /** A Rerun button under every answer: asks the same question again, with the model now selected, in a fresh copy of the thread. */
  rerunButton: z.boolean().default(true).volatile(),
  /** Hide the app's thumbs-up and thumbs-down buttons under answers. */
  hideFeedback: z.boolean().default(false).volatile(),
  /** Recon and Devices colours (on by default): a red frame, space button, New button, tint and error boxes in Recon, a violet frame, space button and New button in Devices, and the same outline on Split panes. Off: every space looks the same. */
  spaceColours: z.boolean().default(true).volatile(),
  /**
   * The chat box looks the same in every mode (on by default): the buttons' words (Web · On, Depth, One
   * model, Tools on) shrink by the window's width alone, not by what else a mode puts in the row, and the
   * buttons add-ons bring (Creator Plus, Bench rules, Export, Focus, the Finance pill) go on a second line
   * when the row is full, after the same core buttons. Off: the former per-row shrinking.
   */
  uniformBox: z.boolean().default(true).volatile(),
  /**
   * Starting values per mode as JSON: `{ modeId: { web, depth, helpers, tools } }` (lib/start.js). What the Web,
   * Depth, Models and Tools buttons read in a thread that begins in the mode; a missing or empty value
   * is the usual one (the mode's own default, or the one setting for all modes). Written into the
   * thread's own settings when it starts, so a pick made by hand later replaces it.
   * Settings → Modes → Starting values for new threads.
   */
  modeStart: z.string().default('{}').volatile(),
  /** Name of the slash command that switches modes. */
  commandName: z.string().default('mode'),
  /**
   * Modes with all tools that load them as needed: a core set and `tools_find` at first, other
   * families when the model asks for them or the user's message mentions them.
   */
  trimModes: z.array(z.string()).default(['cowork', 'code', 'data', 'plain']).volatile(),
  /** Tool families a thread added, as JSON: `{ sessionId: ['pdf', 'data'] }`. */
  sessionToolSets: z.string().default('{}').volatile(),
  /** Done once (0.55.1): old "Search off" marks cleared where Web Off would now block a mode's own search tools. */
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
  /**
   * Done once (item 4A, stage 4): Plain chat was given the Cowork mode's per-mode choices ("Load tools as needed", skills
   * switched off, Tool access) where Cowork had them and Plain chat had none (lib/plain.js). Kept on each Mac.
   */
  plainAdded: z.boolean().default(false).volatile(),
  /**
   * Done once (item 4A, fix round 2): Plain chat was also given the Cowork mode's starting values (`modeStart`), its
   * Mission tools (`longTools`), Mission's work loop choice and the other add-ons' per-mode choices where Cowork had them and
   * Plain chat had none (lib/plain.js plainCarryOps). The old keys stay as they are. Kept on each Mac.
   */
  plainCarried: z.boolean().default(false).volatile(),
  /**
   * Final fix round: the other add-ons whose per-mode choices were already carried to Plain chat (JSON list of their
   * namespaces: mission, sampling-presets, agent-swarm). An add-on installed or switched on later is still carried once.
   * Kept on each Mac.
   */
  plainCarriedIn: z.string().default('[]').volatile(),
  /**
   * Keep Plain chat inside its folder (item 4A, fix round 2; on by default): a standalone Plain chat thread reads, writes,
   * searches and runs commands only inside its own Scratch folder, a project thread only inside its project folder
   * (lib/fence.js). Off: the app's own file sandbox only (writes anywhere in the thread's folder, which for a standalone
   * thread is the whole Scratch place, reads anywhere). Settings → Modes.
   */
  plainFence: z.boolean().default(true).volatile(),
  /**
   * Preset in this space (item 7), as JSON `{ modeId: 'any' | 'standard' | 'creator' }` (lib/presetlock.js). Which of
   * the app's presets a new thread of the mode (or space) starts in: Any (the usual choice), Standard only, or Creator only
   * (the app's Creator preset). A mode without an entry has its default: Standard only for Recon, Devices and
   * Automations, Creator only for Creator Plus, Any for every other mode. Settings → Spaces → Preset in this space.
   */
  presetLock: z.string().default('{}').volatile(),
  /**
   * Item 4A: each thread's space as JSON `{ sessionId: 'chat' | 'code' | 'devices' | 'recon' | 'workshop' }`
   * (lib/spaces.js). Recorded at its first message (the space its draft was opened in), carried with a copy, pruned with
   * the other per-thread entries. Since stage 3a it decides where a thread is listed; a mode change never moves it.
   */
  sessionSpaces: z.string().default('{}').volatile(),
  /**
   * Item 4A: the owner's own space ticks per mode as JSON `{ modeId: [{ space, adjust: {} }] }` (a mode without an entry has
   * its default ticks; an empty list: offered in no space). Settings → Modes, "Modes and their spaces" (stage 5).
   */
  modeSpaces: z.string().default('{}').volatile(),
  /**
   * Item 4A: per-space settings as JSON `{ spaceId: { shown, startMode } }` (missing: shown, and the space's usual start
   * mode). Settings → Spaces (stage 5). Where new threads start is the Left panel add-on's `startPlaces`, the preset is
   * `presetLock`: each is kept in one place only.
   */
  spaceSettings: z.string().default('{}').volatile(),
  /**
   * Item 4A, stage 5: your own one-line description per mode as JSON `{ modeId: 'text' }`, for every mode, an add-on's
   * included (its instructions stay the add-on's). Shown under the mode's name in the chat box's Mode list. Settings → Modes.
   */
  modeDescriptions: z.string().default('{}').volatile(),
  /** Item 4A: every existing thread was given the space of its mode, once (`sessionSpaces`). */
  spacesFilled: z.boolean().default(false).volatile(),
  /**
   * Item 4A, stage 3a: when spaces went live, every recorded space was made to match the thread's mode once more (where
   * the old tabs last put it), once. Not shared: each Mac does its own.
   */
  spacesRefreshed: z.boolean().default(false).volatile(),
  /**
   * Item 4A, stage 2: the mode changes made after a thread's first message, as JSON `{ sessionId: [{ turn, from, to, at }] }`
   * (lib/spaces.js noteModeChange): the quiet line "Mode changed to Research" after that turn. Pruned with the thread.
   */
  sessionModeChanges: z.string().default('{}').volatile(),
  /**
   * Item 4A, stage 6b (Revision 2 L4): automations made from a guest thread in Devices or Workshop that open new threads,
   * as JSON `{ taskId: space }`. A run of one that nobody placed in its space is held (nothing runs), also when the
   * Automations add-on is off or gone. Default `{}`; pruned when the task is gone. Per Mac; never changed by a repair.
   */
  guestRunSpaces: z.string().default('{}').volatile(),
  /**
   * Stage 7 (6b lab leftover): the mode each of those automations runs in, as JSON `{ taskId: modeId }`, so a run that
   * nobody placed (Automations off) is recorded and named in its own mode, never the default mode for automations.
   * Default `{}`; pruned with `guestRunSpaces`. Per Mac; never changed by a repair.
   */
  guestRunModes: z.string().default('{}').volatile(),
  /**
   * Item 4A, stage 6a: extra tools a mode keeps in Recon, as a JSON list (only `library_search`, `library_read`;
   * lib/spacerules.js SEALED_EXTRA_CHOICES). Default empty: what these tools read can end up in Recon's web searches.
   * Each is still checked by Recon's own limit. Settings → Modes → Spaces.
   */
  sealedExtra: z.string().default('[]').volatile(),
  /**
   * Item 4A, stage 6a: Tool access Off also applies in Devices and Workshop (on by default: an owner's Off is a removal and
   * is kept there; a grid On never adds a tool to a guest there). Settings → Modes → Spaces.
   */
  gridInGuarded: z.boolean().default(true).volatile(),
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
    // Its own guard refuses programs (`run_code`), so it cannot work in the PTC preset (Devices and Creator Plus are known without it).
    noPrograms: value.noPrograms === true,
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
export function readModes(config) {
  // Fix round (6a review, I29): memoised by the raw strings of `modes` and `extraModes`; the table is frozen (callers
  // spread before they change anything).
  const rawModes = plain(config.modes);
  const rawExtra = plain(config.extraModes);
  const memoable = (value) => value === undefined || value === null || typeof value === 'string';
  if (memoable(rawModes) && memoable(rawExtra)) {
    const key = `${rawModes ?? ''}\u0000${rawExtra ?? ''}`;
    const hit = MODES_MEMO.get(key);
    if (hit) return hit;
    const value = Object.freeze(readModesNow(config));
    if (MODES_MEMO.size > 16) MODES_MEMO.delete(MODES_MEMO.keys().next().value);
    MODES_MEMO.set(key, value);
    return value;
  }
  return readModesNow(config);
}
/** Parsed mode tables by their raw strings (a small LRU). */
const MODES_MEMO = new Map();
function readModesNow(config) {
  const result = {};
  for (const [id, value] of Object.entries(readObject(config.modes))) {
    const mode = normalizeMode(id, value);
    if (mode) result[id] = mode;
  }
  if (Object.keys(result).length === 0) for (const [id, value] of Object.entries(BUILTIN_MODES)) result[id] = normalizeMode(id, value);
  // Built-in modes added later (Plain chat): there even when the owner saved a list of their own; theirs wins on the same id.
  for (const [id, value] of Object.entries(ADDED_MODES)) if (!result[id]) result[id] = { ...normalizeMode(id, value), added: true };
  for (const [id, value] of Object.entries(readObject(config.extraModes))) {
    const mode = result[id] ? undefined : normalizeMode(id, value);
    // Marked: an add-on's mode always gets a sidebar tab, whatever the tab count.
    if (mode) result[id] = { ...mode, extra: true };
  }
  return result;
}

/**
 * Item 4A, stage 6a: a Set and a Map that say when they change, so the seam's memo (spaceOfTopRaw, the copies) is
 * cleared on every change of what it reads (I29).
 */
class BumpSet extends Set {
  constructor(onChange) {
    super();
    this.onChange = onChange;
  }
  add(value) {
    if (!this.has(value)) this.onChange?.();
    return super.add(value);
  }
  delete(value) {
    if (this.has(value)) this.onChange?.();
    return super.delete(value);
  }
  clear() {
    if (this.size > 0) this.onChange?.();
    super.clear();
  }
}
class BumpMap extends Map {
  constructor(onChange) {
    super();
    this.onChange = onChange;
  }
  set(key, value) {
    if (!this.has(key) || this.get(key) !== value) this.onChange?.();
    return super.set(key, value);
  }
  delete(key) {
    if (this.has(key)) this.onChange?.();
    return super.delete(key);
  }
  clear() {
    if (this.size > 0) this.onChange?.();
    super.clear();
  }
}

export function apply(ctx, config) {
  /** Agent id -> what is applied: { modeId, unrestrict, sandboxBase }. */
  const applied = new Map();
  /** Choices made through the service that Settings could not store. */
  const overlay = new BumpMap(() => bump());
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
  const parents = new BumpMap(() => bump());
  /**
   * Note who started an agent, so a helper can follow its conversation.
   * @param {object} agent - live Agent.
   */
  function noteParent(agent) {
    const parent = parentIdOf(agent?.header ?? agent?.session?.header);
    if (parent && agent?.id && parent !== agent.id) parents.set(agent.id, parent);
  }
  /**
   * Item 4A, stage 6a (I5): the parent id a helper's header names, in any of the shapes the app and add-ons use.
   * @returns {string} '' when none.
   */
  function headerParent(agent) {
    for (const header of [agent?.header, agent?.session?.header]) {
      if (!header || typeof header !== 'object') continue;
      const raw = header.parentSession ?? header.parentSessionId ?? header.parent;
      const id = raw && typeof raw === 'object' ? raw.id ?? raw.sessionId : raw;
      if (typeof id === 'string' && id) return id;
    }
    return '';
  }
  /**
   * Item 4A, stage 6a (I5): the thread an agent works for. `known` is false only for a loaded agent that is not top level
   * and whose headers name no parent; a parent a header names counts even when it is not loaded (closed): its recorded
   * space still decides.
   * @returns {{top: string, known: boolean}}
   */
  function resolveTop(agentId) {
    const id = String(agentId ?? '');
    if (!id) return { top: '', known: false };
    let at = id;
    for (let depth = 0; depth < 12; depth += 1) {
      if (parents.has(at)) {
        at = parents.get(at);
        continue;
      }
      let agent;
      try {
        agent = ctx.get('agents')?.get?.(at);
      } catch {
        agent = undefined;
      }
      if (!agent) {
        // Fix round (6a review): a closed helper still links its live helpers to the thread.
        if (closedParents.has(at) && closedParents.get(at) !== at) {
          at = closedParents.get(at);
          continue;
        }
        // Reached through a parent link, not loaded and with nothing recorded for it: not a known thread (a closed helper
        // whose link is gone), so the unknown-helper rule holds (I5) instead of reading it as a Chat thread.
        if (at !== id && !hasThreadRecord(at)) return { top: at, known: false };
        return { top: at, known: true };
      }
      if (isTopLevel(agent)) return { top: at, known: true };
      const parent = headerParent(agent);
      if (!parent || parent === at) return { top: at, known: false };
      parents.set(at, parent);
      at = parent;
    }
    // Deeper than the walk goes: the top is not known (fail closed).
    return { top: at, known: false };
  }
  /**
   * Fix round (6a review): helper id -> the id of what started it, kept after the helper is closed, so a helper it started
   * still reaches the thread (its guard does not fall back to Chat). Capped; the oldest go first.
   */
  const closedParents = new Map();
  function rememberClosed(agent) {
    try {
      const id = agent?.id;
      if (!id) return;
      const parent = parents.get(id) ?? (isTopLevel(agent) ? '' : headerParent(agent));
      if (!parent || parent === id) return;
      closedParents.delete(id);
      closedParents.set(id, parent);
      if (closedParents.size > 5000) closedParents.delete(closedParents.keys().next().value);
    } catch {
      /* nothing to keep */
    }
  }
  /** @returns {boolean} whether anything is recorded for a thread id (its mode, space or mark, stored or held). */
  function hasThreadRecord(id) {
    try {
      if (overlay.has(id) || spaceOverlay.has(id) || isolatedSeen.has(id)) return true;
      if (readTable(config.sessionModes)[id] !== undefined) return true;
      if (readTable(config.sessionSpaces)[id] !== undefined) return true;
      return readTable(config.sessionIsolated)[id] === true;
    } catch {
      return false;
    }
  }
  /** @returns {string} the conversation an agent works for: itself, or the top of its chain of starters. */
  const topOf = (agentId) => resolveTop(agentId).top || agentId;

  // ---- Item 4A, stage 6a: the seam (the space keeps its safety rules for any mode) ----------------------------------
  /** Bumped on every change the seam reads that is not a stored value (drafts, claims, pins, moves, agents). */
  let seamEpoch = 0;
  const bump = () => {
    seamEpoch += 1;
  };
  /** Parsed tables by their raw string (a small LRU; frozen: callers never write into them). */
  const tableMemo = new Map();
  function readTable(value) {
    const raw = plain(value);
    if (typeof raw !== 'string') return Object.freeze(readObject(raw));
    if (tableMemo.has(raw)) return tableMemo.get(raw);
    const parsed = Object.freeze(readObject(raw));
    tableMemo.set(raw, parsed);
    if (tableMemo.size > 16) tableMemo.delete(tableMemo.keys().next().value);
    return parsed;
  }
  /**
   * The seam's own reader of `sessionSpaces` and `sessionIsolated` (I4): a value that cannot be read, or a damaged one,
   * throws (spaceOfTopRaw then fails closed), where readObject would read it as empty and open a guarded thread.
   */
  const strictMemo = new Map();
  function readStrict(value) {
    let raw = value;
    if (raw && typeof raw === 'object' && typeof raw.get === 'function' && Object.isFrozen(raw)) raw = raw.get();
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
    if (raw === undefined || raw === null || (typeof raw === 'string' && raw.trim() === '')) return {};
    if (typeof raw !== 'string') throw new Error('modes: a stored table is not readable');
    if (strictMemo.has(raw)) return strictMemo.get(raw);
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('modes: a stored table is damaged');
    const frozen = Object.freeze(parsed);
    strictMemo.set(raw, frozen);
    if (strictMemo.size > 16) strictMemo.delete(strictMemo.keys().next().value);
    return frozen;
  }
  /** The stored values the seam reads: a memo holds while every one is the same string and the epoch is the same. */
  const SEAM_KEYS = ['sessionSpaces', 'sessionIsolated', 'sessionModes', 'modes', 'extraModes', 'modeSpaces', 'spaceSettings', 'sealedExtra', 'defaultMode', 'scheduledMode'];
  const seamInputs = () => [seamEpoch, ...SEAM_KEYS.map((key) => {
    try {
      return plain(config[key]);
    } catch {
      // Unreadable: never equal to anything, so nothing is kept from it.
      return Symbol('unreadable');
    }
  })];
  const sameInputs = (a, b) => Array.isArray(a) && a.length === b.length && a.every((value, index) => value === b[index]);
  /** One memo per kind: key -> {inputs, value}. Cleared when it grows. */
  function memo(table, key, compute) {
    const inputs = seamInputs();
    const hit = table.get(key);
    if (hit && sameInputs(hit.inputs, inputs)) return hit.value;
    const value = compute();
    if (table.size > 500) table.clear();
    table.set(key, { inputs, value });
    return value;
  }
  const spaceMemo = new Map();
  const copyMemo = new Map();
  const roomMemo = new Map();
  const liveMemo = new Map();
  const isRoomMemo = new Map();
  /** A thread -> the space a guarded claim gave it, until its `sessionSpaces` write succeeds (I3). Wins over a stale record. */
  const spaceOverlay = new BumpMap(() => bump());
  const isGuarded = (space) => GUARDED_SPACES.includes(space);
  /** @returns {string | undefined} a thread's recorded space: the one not yet written first, else the stored one. */
  function recordedSpace(top) {
    const own = spaceOverlay.get(top);
    if (isSpace(own)) return own;
    const stored = readStrict(config.sessionSpaces)[top];
    return isSpace(stored) ? stored : undefined;
  }
  /** recordedSpace for callers outside the seam: undefined when it cannot be read. */
  function recordedSpaceSafe(top) {
    try {
      return recordedSpace(top);
    } catch {
      return isSpace(spaceOverlay.get(top)) ? spaceOverlay.get(top) : undefined;
    }
  }
  /** The old test (marks only), for use inside the seam (no freshNow loop). */
  function wasIsolatedRaw(sessionId) {
    return isolatedSeen.has(sessionId) || readStrict(config.sessionIsolated)[sessionId] === true;
  }
  /**
   * The space of a thread, read without ever asking for its mode (I18): never calls modeOf, spaces.of, guardOf or
   * isIsolated. Memoised per thread and inputs (I29). On a read error: a guarded value it can still read, else Recon for
   * a marked thread or one in the room, else 'unknown' (the base guard, I4).
   * @param {string} top - the thread.
   * @returns {string} a space id, or 'unknown'.
   */
  function spaceOfTopRaw(top) {
    const id = String(top ?? '');
    if (!id) return '';
    return memo(spaceMemo, `${id}\u0000${folderOfThread(id)}`, () => {
      try {
        return spaceOfTopRead(id);
      } catch {
        try {
          const own = spaceOverlay.get(id);
          if (isGuarded(own)) return own;
        } catch {
          /* next */
        }
        try {
          const stored = readObject(plain(config.sessionSpaces))[id];
          if (isGuarded(stored)) return stored;
        } catch {
          /* next */
        }
        try {
          if (wasIsolatedRaw(id) || roomSays(id) === true) return 'recon';
        } catch {
          /* next */
        }
        return 'unknown';
      }
    });
  }
  function spaceOfTopRead(top) {
    const recorded = recordedSpace(top);
    // (a) A guarded record wins over everything (a thread never leaves Devices, Recon or Workshop).
    if (isGuarded(recorded)) return recorded;
    // (b) Recon's room is Recon.
    if (inReconRoom(top)) return 'recon';
    // (c) A draft: the guarded space it was opened in (whatever `live` is), else its draft space.
    const isFresh = freshNow(top);
    if (isFresh) {
      const drafted = draftSpaces.get(top);
      if (isGuarded(drafted)) return drafted;
      if (spacesLive()) return draftSpaceOf(top);
      // Spaces off (a lab check only): the tab decides an unclaimed draft's mode, so its space too.
      const own = overlay.get(top) ?? readTable(config.sessionModes)[top];
      const byTab = tabsDecide() && !claimed.has(top) ? plain(config.defaultMode) : own;
      if (typeof byTab === 'string' && byTab) return spaceOfMode(byTab);
    }
    // (d) Its recorded space.
    if (recorded && spacesLive()) return recorded;
    const stored = overlay.get(top) ?? readTable(config.sessionModes)[top];
    // (e) Marked sealed: Recon, unless its stored mode is an owner's isolated mode (its own space, REGRESSION 16). A blank
    // draft's mark is not (it read nothing; it is unmarked when it starts elsewhere).
    if (!isFresh && wasIsolatedRaw(top)) {
      const def = typeof stored === 'string' ? readModes(config)[stored] : undefined;
      return def && def.isolated && def.id !== 'recon' ? spaceOfMode(def.id) : 'recon';
    }
    // With spaces off (a lab check only): its mode's space, as before.
    if (!spacesLive() && typeof stored === 'string' && stored) return spaceOfMode(stored);
    if (recorded) return recorded;
    // (f) Its mode's space, else its folder's.
    return typeof stored === 'string' && stored ? spaceOfMode(stored) : folderSpace(top);
  }
  /**
   * Whether each guarded space's guard is ready (I25): `true`, else 'off' (its mode or add-on is off) or 'old' (on but too
   * old to guard guests). Recon needs apiVersion 3 with `inSpace`; Devices `bench.guestsGuarded`; Workshop the
   * `creator-plus` mode and `creatorPlus.guestsGuarded`.
   * @returns {{devices: true|'off'|'old', recon: true|'off'|'old', workshop: true|'off'|'old'}}
   */
  function guardReady() {
    const modes = readModes(config);
    const service = (name) => {
      try {
        return ctx.get(name);
      } catch {
        return undefined;
      }
    };
    const recon = service('recon');
    const bench = service('bench');
    const creator = service('creatorPlus');
    // Lab fix (6a): an add-on switched off on the Plugins page is not running (no service), though its mode may still be
    // listed: 'plugin' (switch it on on the Plugins page), never "too old". 'off': running, its mode not offered.
    return {
      devices: !bench ? 'plugin' : modes.bench ? (bench.guestsGuarded === true ? true : 'old') : 'off',
      recon: !recon ? 'plugin' : modes.recon ? (Number(recon.apiVersion) >= 3 && typeof recon.inSpace === 'function' ? true : 'old') : 'off',
      workshop: !creator ? 'plugin' : modes['creator-plus'] ? (creator.guestsGuarded === true ? true : 'old') : 'off',
    };
  }
  /** @returns {{devices: boolean, workshop: boolean}} guard add-ons that are on but too old (their guests are held, I27). */
  function oldGuards() {
    const ready = guardReady();
    return { devices: ready.devices === 'old', workshop: ready.workshop === 'old' };
  }
  /** @returns {string[]} a JSON list setting, read safely. */
  function readList(value) {
    const raw = plain(value);
    try {
      const list = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw;
      return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
  /** @returns {string} the thread's room folder as Recon says (`roomRunFolder`, which never asks Modes), '' when unknown. */
  function roomFolder(top) {
    const read = () => {
      try {
        const folder = ctx.get('recon')?.roomRunFolder?.(top);
        return typeof folder === 'string' ? folder : '';
      } catch {
        return '';
      }
    };
    const found = memo(roomMemo, `${top}\u0000${folderOfThread(top)}`, read);
    // Not known yet (Recon still starting): asked again next time.
    if (!found) roomMemo.delete(`${top}\u0000${folderOfThread(top)}`);
    return found;
  }
  /**
   * The effective mode of a thread: its mode under its space's rules (lib/spacerules.js spaceCopy). Memoised: the same
   * inputs give the same frozen object (I29).
   */
  function copyFor(top, found) {
    if (!found) return found;
    const space = spaceOfTopRaw(top);
    if (!isGuarded(space) && space !== 'unknown') return found;
    const reconSpace = space === 'recon' && !['recon', LOCKED_MODE.id, 'isolated-late'].includes(found.id);
    const roomKnown = reconSpace ? Boolean(roomFolder(top)) : false;
    // Fix round (6a review): the guards' readiness is part of the key, so a guard that comes up, goes away or turns old
    // changes the copy at once.
    const ready = guardReady();
    const readyKey = `${ready.devices}|${ready.recon}|${ready.workshop}`;
    return memo(copyMemo, `${top}\u0000${modeKey(found)}\u0000${space}\u0000${roomKnown}\u0000${freshNow(top)}\u0000${readyKey}`, () => {
      const modes = readModes(config);
      return spaceCopy(found, space, {
        ready,
        oldGuard: { devices: ready.devices === 'old', workshop: ready.workshop === 'old' },
        ranBefore: !freshNow(top),
        reconNet: modes.recon?.tools ?? [],
        deviceTools: (Array.isArray(modes.bench?.tools) ? modes.bench.tools : []).filter((name) => typeof name === 'string' && name.startsWith('bench_')),
        roomKnown,
        extra: readList(config.sealedExtra).filter((name) => SEALED_EXTRA_CHOICES.includes(name)),
      });
    });
  }
  /**
   * Whether any loaded thread (or helper's thread) is in a guarded space, or could not be read (I5): an unknown helper is
   * then held without tools.
   */
  function guardedLive() {
    return memo(liveMemo, 'all', () => {
      for (const agent of ctx.get('agents')?.list?.() ?? []) {
        const top = resolveTop(agent?.id).top;
        const space = top ? spaceOfTopRaw(top) : '';
        if (isGuarded(space) || space === 'unknown') return true;
      }
      return false;
    });
  }

  function modeOf(agentId) {
    // A helper agent has no mode of its own: it follows the conversation that started it.
    const resolved = resolveTop(agentId);
    const sessionId = resolved.top || agentId;
    // Item 4A, stage 6a (I5): a helper no header names a parent for, while a thread in a guarded space is live: no tools.
    if (!resolved.known && guardedLive()) return LOCKED_MODE;
    const modes = readModes(config);
    const fallback = plain(config.defaultMode);
    // With the Cowork sidebar, the selected tab (defaultMode) decides until the first message.
    const chosen = overlay.get(sessionId) ?? readTable(config.sessionModes)[sessionId];
    const spaced = spacesLive() && tabsDecide();
    if (freshNow(sessionId) && !claimed.has(sessionId)) {
      // Opened by an Automation task: its own starting mode, unless the conversation already has one.
      const own = scheduled.has(sessionId) ? scheduledModeId(modes, plain(config.scheduledMode)) : undefined;
      // Item 4A fix round: with spaces, the selected space no longer writes `defaultMode`, so a draft no one has claimed
      // yet (a quick first message, a failed claim, a restart, a thread started in the background) takes its space's
      // start mode, and the mode it already has where the space offers it; Recon's room only ever gives Recon.
      // Item 4A, stage 6a: the space's rules apply to a draft too, before its first message (I1, I13).
      if (spaced) {
        if (own && chosen === undefined && !inReconRoom(sessionId)) return copyFor(sessionId, modes[own]);
        return copyFor(sessionId, draftModeOf(sessionId, modes, chosen));
      }
      if (own && (tabsDecide() || chosen === undefined)) return copyFor(sessionId, modes[own]);
      if (tabsDecide()) return copyFor(sessionId, modes[fallback] ?? Object.values(modes)[0]);
    }
    // A mode that is gone (its add-on switched off): with spaces, the thread's space's start mode, never `defaultMode`.
    const found = modes[chosen] ?? (spaced ? spaceStartModeOf(sessionId, modes) : undefined) ?? modes[fallback] ?? Object.values(modes)[0];
    // Once isolated, always isolated; and never isolated later. (The pages write the choice straight into Settings.)
    // Item 4A, stage 6a: the copy for the thread's space comes first (a guest in Recon is sealed, I1).
    const effective = copyFor(sessionId, found);
    // Held without tools by its space (guard off or too old, Recon off): no tools, not "began elsewhere" (I10, I16, I27).
    // Stage 6a leftovers: a guest held by Devices or Workshop gets its own held copy (heldIn), which names the space.
    if (effective === LOCKED_MODE || effective?.heldIn) return effective;
    return heldMode({ found: effective, wasIsolated: wasIsolated(sessionId), fresh: fresh.has(sessionId) });
  }

  // ---- Item 4A fix round: a draft's space from what the server can see ----------------------------------------------
  /** @returns {string} a live thread's folder ('' when unknown). */
  function folderOfThread(agentId) {
    try {
      const agent = ctx.get('agents')?.get?.(agentId);
      return String((agent?.header ?? agent?.session?.header)?.cwd ?? '');
    } catch {
      return '';
    }
  }
  /**
   * Whether a thread's folder is Recon's room, as Recon says (`recon.isRoom`). `undefined` when Recon cannot say (not
   * there, or an older Recon): then the space the window sends is trusted, as before.
   * @returns {boolean | undefined}
   */
  function roomSays(agentId) {
    try {
      const isRoom = ctx.get('recon')?.isRoom;
      if (typeof isRoom !== 'function') return undefined;
      const folder = folderOfThread(agentId);
      // Item 4A, stage 6a (LEAK 16, REGRESSION 13): no folder yet is "cannot say", not "not the room"; Recon's answer is
      // kept per folder until something the seam reads changes (I29).
      return folder ? memo(isRoomMemo, folder, () => isRoom(folder) === true) : undefined;
    } catch {
      return undefined;
    }
  }
  /** @returns {boolean} whether a thread works in Recon's room (false when Recon cannot say). */
  function inReconRoom(agentId) {
    return roomSays(agentId) === true;
  }
  /** @returns {boolean} whether a path lies in Recon's room (false when Recon cannot say). */
  function reconRoomOf(path) {
    try {
      return ctx.get('recon')?.isRoom?.(path) === true;
    } catch {
      return false;
    }
  }
  /**
   * Item 4A, fix round 2: the fence of a thread in a fenced mode (Plain chat) while "Keep Plain chat inside its folder"
   * is on: its own Scratch folder when it is standalone, else its project folder (the session's folder).
   * @param {string} top - the thread (not a helper).
   * @returns {{root: string, standalone: boolean} | null} null: no fence.
   */
  function fenceOf(top) {
    if (plain(config.plainFence) === false) return null;
    const mode = modeOf(top);
    if (!mode || mode.isolated || !FENCED_MODES.includes(mode.id)) return null;
    let agent;
    try {
      agent = ctx.get('agents')?.get?.(top);
    } catch {
      agent = undefined;
    }
    if (!agent) return null;
    let own = '';
    try {
      own = String(ctx.get('coworkScratch')?.folderOf?.(agent) ?? '');
    } catch {
      own = '';
    }
    const root = own || folderOfThread(top);
    return root ? { root, standalone: Boolean(own) } : null;
  }
  /** The space a thread's folder suggests: Recon's room = Recon, Scratch = Chat, else lib/spaces.js guessSpace. */
  function folderSpace(agentId) {
    if (inReconRoom(agentId)) return 'recon';
    let agent;
    try {
      agent = ctx.get('agents')?.get?.(agentId);
    } catch {
      agent = undefined;
    }
    if (agent && scratchConversation(agent)) return 'chat';
    const folder = folderOfThread(agentId);
    return guessSpace(folder ? { path: folder } : null);
  }
  /**
   * The space a space-asked-for thread may be in: Recon's room gives Recon only, and Recon only a thread in the room
   * (when Recon can say which folder that is).
   * @param {string} agentId - the thread.
   * @param {string | undefined} asked - the space a window or a stored entry names.
   * @returns {string | undefined}
   */
  function roomRule(agentId, asked) {
    const room = roomSays(agentId);
    if (room === true) return 'recon';
    if (room === false && asked === 'recon') return folderSpace(agentId);
    return isSpace(asked) ? asked : undefined;
  }
  /**
   * The space of a new draft: the one it was opened in, else its recorded one, else (claimed by another add-on: a
   * Creator Plus or Split Plus claim) its claimed mode's space, else its folder's. The room rule comes first.
   */
  function draftSpaceOf(top) {
    const own = overlay.get(top) ?? readTable(config.sessionModes)[top];
    const byClaim = claimed.has(top) && typeof own === 'string' && own ? spaceOfMode(own) : undefined;
    const space = roomRule(top, draftSpaces.get(top) ?? readTable(config.sessionSpaces)[top] ?? byClaim) ?? folderSpace(top);
    // Final fix round (lab): an Automation's new thread runs its task's mode (scheduledMode); when the space its folder or
    // window gives does not offer that mode (Cowork in Code), it goes to that mode's own space, so space and mode agree.
    // Stage 6b (J8): a stored Chat or Code place claimed with `anyTick` stays where it was set.
    if (scheduled.has(top) && space !== 'recon' && !(anyTicked.has(top) && draftSpaces.get(top) === space)) {
      const modes = readModes(config);
      const modeId = typeof own === 'string' && modes[own] ? own : scheduledModeId(modes, plain(config.scheduledMode));
      if (modeId && !offeredIn(space).some((row) => row.id === modeId)) return spaceOfMode(modeId);
    }
    return space;
  }
  /**
   * Item 4A, stage 6a: the modes a space offers now, each greyed while the space's guard is not ready (guardReady, I25).
   * Every list of offered modes in this file comes from here.
   */
  function offeredIn(space, lang = 'en') {
    return modesInSpace(String(space ?? ''), Object.values(readModes(config)), readObject(config.modeSpaces), { ready: guardReady(), lang });
  }
  /** A mode that is safe when a space offers none: Plain chat, else the first one that is not sealed. */
  function safeMode(modes) {
    return modes.plain ?? Object.values(modes).find((mode) => !mode.isolated) ?? Object.values(modes)[0];
  }
  /**
   * The mode an unclaimed new draft runs in with spaces: the mode it has when its space offers it, else the space's start
   * mode (Settings → Spaces, then the built-in table). Recon's room without the Recon mode: the locked mode (no tools).
   */
  function draftModeOf(top, modes, chosen) {
    const space = draftSpaceOf(top);
    const offered = offeredIn(space);
    const id = draftStartMode({ space, stored: typeof chosen === 'string' ? chosen : undefined, offered, spaceSettings: readObject(config.spaceSettings) });
    if (modes[id]) return modes[id];
    // Item 4A, stage 6a (I16, LEAK 6): a guarded space that offers nothing now (its guard off or too old, Workshop shown
    // through Tuner Plus only) gives no tools, never Plain chat.
    if (isGuarded(space)) return heldIn(space);
    return space === 'recon' && inReconRoom(top) ? LOCKED_MODE : safeMode(modes);
  }
  /** For a thread whose mode is gone: its space's start mode (never `defaultMode`, which may still name Recon). */
  function spaceStartModeOf(top, modes) {
    // Item 4A, stage 6a: the seam's space (a read error gives the 'unknown' guard, I4).
    const seam = spaceOfTopRaw(top);
    const space = isSpace(seam) || seam === 'unknown' ? seam : recordedSpaceSafe(top) ?? draftSpaces.get(top) ?? folderSpace(top);
    const offered = offeredIn(space);
    const found = modes[draftStartMode({ space, offered, spaceSettings: readObject(config.spaceSettings) })];
    if (found) return found;
    // Item 4A, stage 6a (I16): never Plain chat in a guarded space whose guard is not ready.
    return isGuarded(space) ? heldIn(space) : safeMode(modes);
  }

  /** Conversations seen running in an isolated mode, before Settings has stored them. */
  const isolatedSeen = new BumpSet(() => bump());
  /**
   * @returns {boolean} whether the conversation ever ran in an isolated mode. Item 4A, stage 6a (I2): also a thread that
   * has run and whose recorded space is Recon, when its mark was lost.
   */
  function wasIsolated(sessionId) {
    try {
      if (wasIsolatedRaw(sessionId)) return true;
    } catch {
      if (isolatedSeen.has(sessionId)) return true;
    }
    return !fresh.has(sessionId) && recordedSpaceSafe(sessionId) === 'recon' && !freshNow(sessionId);
  }
  let isolatedChain = Promise.resolve();
  /** Item 4A, stage 6a: marks whose write failed, tried again (at most RETRY_MAX times each). */
  const markRetry = new Map();
  let retryTimer;
  /** Try failed writes again in a moment (marks, space records, first-message pins). */
  function retrySoon() {
    if (retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      retryWrites();
    }, RETRY_MS);
    retryTimer.unref?.();
  }
  function retryWrites() {
    for (const [id, tries] of [...markRetry]) {
      markRetry.delete(id);
      if (tries >= RETRY_MAX) {
        ctx.logger.warn(`modes: isolation of ${id} still not stored after ${tries} tries; kept in memory for this run`);
        continue;
      }
      writeMark(id, tries + 1);
    }
    if (spaceOverlay.size > 0) flushSpaces();
    if (pinQueue.size > 0) flushPins();
  }
  /** The write of one mark, read inside its queued step so two threads never lose each other's mark (REGRESSION 3). */
  function writeMark(sessionId, tries = 0) {
    isolatedChain = isolatedChain.then(async () => {
      try {
        const settings = ctx.get('settings');
        if (!settings) return;
        const table = readObject(config.sessionIsolated);
        if (table[sessionId] === true) return;
        const next = { ...table, [sessionId]: true };
        await settings.mutate('modes', [{ op: 'set', path: ['sessionIsolated'], value: JSON.stringify(next) }]);
      } catch (error) {
        ctx.logger.warn(`modes: isolation of ${sessionId} not stored (${error?.message ?? error}); kept in memory, tried again`);
        markRetry.set(sessionId, tries);
        retrySoon();
      }
    });
  }
  /** Remember for good that a conversation is isolated. Only this and unmarkIsolated write `sessionIsolated`. */
  function markIsolated(sessionId) {
    try {
      if (wasIsolatedRaw(sessionId)) return;
    } catch {
      if (isolatedSeen.has(sessionId)) return;
    }
    isolatedSeen.add(sessionId);
    writeMark(sessionId);
  }
  /**
   * Take the isolated mark off a conversation that never ran a turn and now starts in an ordinary tab (a blank draft
   * an isolated tab left behind, reused from another tab): it read nothing in isolation, so "once isolated" does not
   * apply. Only for a chat that is still blank; one that ran a turn keeps its mark for good.
   */
  function unmarkIsolated(sessionId) {
    try {
      if (!wasIsolatedRaw(sessionId)) return;
    } catch {
      return;
    }
    isolatedSeen.delete(sessionId);
    isolatedChain = isolatedChain.then(async () => {
      try {
        const settings = ctx.get('settings');
        const table = readObject(config.sessionIsolated);
        if (!settings || table[sessionId] !== true) return;
        const next = { ...table };
        delete next[sessionId];
        await settings.mutate('modes', [{ op: 'set', path: ['sessionIsolated'], value: JSON.stringify(next) }]);
      } catch (error) {
        ctx.logger.warn(`modes: isolation mark of ${sessionId} not removed (${error?.message ?? error})`);
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
  const fresh = new BumpSet(() => bump());
  /**
   * Item 4A, stage 2: the space a new draft was opened in (its window's space), until its first message records it in
   * `sessionSpaces`. In memory only: after a restart the chat box claims the draft again.
   */
  const draftSpaces = new BumpMap(() => bump());
  /**
   * Item 4A, stage 5: drafts whose mode the chat box set by itself (the space's start mode), and drafts whose mode you
   * picked in the Mode list. A reused draft keeps a mode you picked; one it only got automatically follows the space's
   * start mode as it is now (Settings → Spaces), so a changed start mode reaches the next new thread.
   */
  const autoStarted = new Set();
  /**
   * Fix round: the mode you picked for a draft (Mode list, /mode, the Cowork switch carrying it), kept until its first
   * message or a New: a draft the app reuses in another space gets it back where that space offers it.
   */
  const pickedModes = new BumpMap(() => bump());
  /**
   * Fresh sessions another add-on moved on purpose (`set(id, mode, {claim: true})`, a Finance brief):
   * the tab and the scheduled starting mode no longer decide for them, so the move survives the first turn.
   */
  const claimed = new BumpSet(() => bump());
  /** Fresh sessions whose first message came from the app's scheduler. */
  const scheduled = new BumpSet(() => bump());
  /** Conversations whose current run was started by the scheduler (an Automation that re-runs in a conversation that already exists). */
  const scheduledRun = new Set();
  /**
   * Item 4A, stage 6b (J11): threads whose scheduled run is held (nothing runs) -> `{space, kind, mode, text, at}`. Memory
   * only; cleared by a user message in the thread, at `agent/disposed`, or after HELD_RUN_MS.
   */
  const heldRuns = new Map();
  /** Stage 6b (J8): scheduled threads claimed into a stored Chat or Code place with `anyTick` (memory only). */
  const anyTicked = new Set();
  const HELD_RUN_MS = 24 * 60 * 60 * 1000;
  /** Stage 6b: ids the app's scheduler is resolving right now (Modes' own resolve-agent hook may run after another's). */
  const schedulerResolving = new Set();
  /** @returns {boolean} whether a thread is a scheduled one (its first message from the scheduler, or being resolved for it). */
  function scheduledClaimable(id) {
    return scheduled.has(id) || schedulerResolving.has(id);
  }
  /** @returns {{space: string, kind: string, mode: string, text: string, at: number} | undefined} a thread's held run, while recent. */
  function heldRunOf(top) {
    const held = heldRuns.get(top);
    if (!held) return undefined;
    if (Date.now() - held.at > HELD_RUN_MS) {
      heldRuns.delete(top);
      return undefined;
    }
    return held;
  }
  /**
   * @returns {string} the chat box line of a held run. Stage 7 (6b lab leftover): with the Automations add-on off it names
   * the automation's own space · mode and says to switch Automations on (never "its rules could not be read").
   */
  function runHeldLine(held, lang = 'en') {
    const space = SPACE_NAMES.en[held?.space] ?? String(held?.space ?? '');
    let label = '';
    try {
      const mode = held?.mode ? readModes(config)[held.mode] : undefined;
      label = mode && mode.isolated !== true ? mode.label ?? '' : '';
    } catch {
      label = '';
    }
    const where = label ? `${space} · ${label}` : space;
    if (held?.kind === 'automations') return spaceText('runHeldNoAutomations', lang, { where, space });
    // Stage 7 (lab): the automation's own mode is named, and with the Automations add-on off the line first says to
    // switch it on (its page is not there meanwhile).
    return spaceText(automationsLoaded() ? 'runHeld' : 'runHeldAutomationsOff', lang, { where, space, reason: heldReasonText(held, lang) });
  }
  /** @returns {boolean} whether the Automations add-on is loaded (its page is there). */
  function automationsLoaded() {
    try {
      return Boolean(ctx.get('automations'));
    } catch {
      return false;
    }
  }
  /** @returns {string} why a held run's space cannot take it (runHeldReason; English for every `lang`). */
  function heldReasonText(held, lang = 'en') {
    if (held?.text) return String(held.text);
    const words = SPACE_SETTINGS_TEXT.en.runHeldReason ?? {};
    const key = held?.kind === 'guard' || held?.kind === 'mode' || held?.kind === 'automations' ? held.kind : 'other';
    const addon = ADDON_NAMES.en[held?.space] ?? String(held?.space ?? '');
    let label = String(held?.mode ?? '');
    try {
      label = readModes(config)[held?.mode]?.label ?? label;
    } catch {
      // the id
    }
    return String(words[key] ?? '').replaceAll('{addon}', addon).replaceAll('{mode}', label);
  }
  /**
   * @param {object} agent - live Agent.
   * @returns {boolean} true when the Agent has never run a turn. Unknown counts as "has run".
   */
  function neverRan(agent) {
    const phase = agent?.phase;
    return Boolean(phase) && phase.kind !== 'running' && phase.lastTurn === 0;
  }
  /** Conversations seen with a turn: they never count as fresh again. */
  const ranSeen = new BumpSet(() => bump());
  /**
   * Whether a conversation is still a new chat, so the selected tab decides its mode. Besides the ones marked when
   * they were created, a still-blank draft from an earlier run that the app reuses (its phase was not known when it
   * loaded) counts too, so a reused draft follows the tab it is shown in, not the mode it was stored with (lab, item 7).
   * @param {string} sessionId - the conversation.
   * @returns {boolean} true while it is a new, blank, top-level chat.
   */
  function freshNow(sessionId) {
    if (fresh.has(sessionId)) return true;
    if (ranSeen.has(sessionId)) return false;
    let agent;
    try {
      agent = ctx.get('agents')?.get?.(sessionId);
    } catch {
      agent = undefined;
    }
    if (!agent) return false;
    if (isTopLevel(agent) && stillBlank(agent)) {
      fresh.add(sessionId);
      return true;
    }
    // Unknown (no phase, no turn boundary) is not remembered: it is asked again later.
    if (agent.phase || typeof ctx.get('agents')?.turnBoundaryOf === 'function') ranSeen.add(sessionId);
    return false;
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
    const next = access ? access.withAccess(sessionId, mode, own, { researchHelper: topOf(sessionId) !== sessionId && researchOn(sessionId) }) : own;
    return mode?.guardedBy ? guardedMask(sessionId, mode, next) : next;
  }
  /**
   * Item 4A, stage 6a (I14, I17): a guest in Devices or Workshop (or a thread whose space could not be read) never gets a
   * tool `guestRefuses` names, whatever was granted or set On; with "Tool access Off also applies in Devices and
   * Workshop" on (default), the grid's Off for its mode still takes a tool away there (it never adds one).
   */
  function guardedMask(sessionId, mode, mask) {
    const known = knownTools(sessionId);
    // Stage 6b (J14, G13): schedules are open to a guest in Devices or Workshop, never to the 'unknown' guard or a Mission run.
    let next = withoutGuestRefused(mask, known, guestOpts(sessionId, mode));
    // Lab re-check fix (6a, problem 5): in Workshop, a guest is offered only what Creator Plus's guard lets run (its
    // allow-list), so the tool list and the guard agree (Deep research, helpers, the device tools are not offered there).
    const refused = spaceRefuser(mode, workshopAllowed());
    const outside = known.filter((name) => refused(name));
    if (outside.length > 0) next = next.allow ? { allow: next.allow.filter((name) => !refused(name)) } : { deny: [...new Set([...(next.deny ?? []), ...outside])] };
    if (plain(config.gridInGuarded) === false || !access?.enabled?.()) return next;
    let grid;
    try {
      grid = parseAccess(plain(config.toolAccess));
    } catch {
      return next;
    }
    if (!grid[mode.id]) return next;
    const plainMode = { id: mode.id };
    const off = known.filter((name) => stateOf(name, { mode: plainMode, access: grid, offered: true }) === 'off');
    if (off.length === 0) return next;
    if (next.allow) next = { allow: next.allow.filter((name) => !off.includes(name)) };
    else next = { deny: [...new Set([...(next.deny ?? []), ...off])] };
    return next;
  }
  /** Creator Plus's Workshop allow-list (`creatorPlus.allowed()`), or undefined when Creator Plus cannot say. */
  function workshopAllowed() {
    try {
      const list = ctx.get('creatorPlus')?.allowed?.();
      return Array.isArray(list) ? list : undefined;
    } catch {
      return undefined;
    }
  }
  /** The mask the mode's own rules give, before Tool access. */
  function baseToolMask(sessionId, mode, added) {
    const own = ownToolMask(sessionId, mode, added);
    // Item 4A, stage 6a (I14): Modes' base rule for a guest in Devices or Workshop, whether Bench or Creator Plus is on.
    return mode?.guardedBy ? withoutGuestRefused(own, knownTools(sessionId), guestOpts(sessionId, mode)) : own;
  }
  /**
   * Item 4A, stage 6b (J14, Revision 2 L1 and G13): what `guestRefuses` needs to know: the guest's space (its effective
   * `guardedBy`), and whether a Mission run is under way (an unattended run schedules nothing more).
   */
  function guestOpts(sessionId, mode) {
    let mission = false;
    try {
      mission = Boolean(longRunOf(sessionId));
    } catch {
      mission = true;
    }
    return { space: String(mode?.guardedBy ?? 'unknown'), mission };
  }
  function ownToolMask(sessionId, mode, added) {
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
      // The families the mode starts with (Data: data, pdf) are there from the first step. Lab fix (6a, I15): a guest in
      // Devices has the device tools (bench_…) from the first step too, as the Devices mode has.
      added: loadsAsNeeded ? [...new Set([...(mode?.startFamilies ?? []), ...devicesStart(sessionId, mode), ...(added ?? addedOf(sessionId))])] : [],
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

  /** Lab fix (6a, I15): the device tools a guest in Devices starts with where tools load as needed (none elsewhere). */
  function devicesStart(sessionId, mode) {
    if (mode?.guardedBy !== 'devices') return [];
    return knownTools(sessionId).filter((name) => typeof name === 'string' && name.startsWith('bench_'));
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
  const LEVEL_COMMAND = 'Not every kind of web source is ticked for this thread, and this command or program goes online without a web address Modes can check, so it was not run. Use the web tools for pages, or tell the user: they can pick All on the Web button.';

  /** @returns {string} the note a conversation gets about its Web sources ('' for All, as before). */
  function levelSaid(sessionId) {
    const top = topOf(sessionId);
    const mode = modeOf(top);
    const ticks = sourcesNow(sessionId);
    if (!ticks) return '';
    if (mode?.isolated) {
      const nets = ticks.filter((kind) => NETS.includes(kind));
      const kinds = ticks.filter((kind) => KINDS.includes(kind));
      return `\n\nRecon sources for this thread: ${tickedWords([...kinds, ...nets])}. The recon tools for sources that are not ticked refuse, and web results of other kinds are left out.${kinds.includes('other') && otherNames(true).length > 0 ? ` The user's own sources allowed in Recon: ${otherNames(true).map((name) => `"${name}"`).join(', ')} (recon_other_search, recon_other_read).` : ''} If the research needs another source, say so; the user ticks more on the Web button.`;
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
    const value = entry?.mode || entry?.base ? { ...(entry.mode ? { mode: entry.mode } : {}), ...(entry.mode && entry.key ? { key: entry.key } : {}), ...(entry.base ? { base: entry.base, set: entry.set } : {}) } : null;
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

  /** Item 4A, stage 6a: the key stored beside a mode's id, only for a sealed or guarded copy (a mode as it is stores none). */
  const storedKey = (mode) => (mode?.sealedBy || mode?.guardedBy ? modeKey(mode) : undefined);
  /** @returns {boolean} whether two stored entries say the same. */
  const sameEntry = (a, b) => a?.mode === b?.mode && (a?.key ?? '') === (b?.key ?? '') && a?.base === b?.base && (a?.base ? a?.set === b?.set : true);

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
      const next = { mode: mode.id, ...(storedKey(mode) ? { key: storedKey(mode) } : {}), ...(step.known ?? {}) };
      // Opened with nothing stored and nothing changed: only note the mode, so a later move made
      // while it is closed is seen.
      if (!sameEntry(next, entry)) keepBase(agent.id, next, { note: !entry && !start && !step.write });
    }
    if (step.write) {
      session.append('sandbox/mode', { mode: step.write });
      // Item 4A, fix round 2: what Modes itself last set on a draft, so a re-claim can tell it from a level picked by hand.
      if (lasting && fresh.has(agent.id)) levelsWritten.set(agent.id, step.write);
    }
  }
  /** Item 4A, fix round 2: a draft -> the access level Modes last wrote on it in this run. */
  const levelsWritten = new Map();
  /**
   * Item 4A, fix round 2: after the chat box claims a reused blank draft again (another space, another mode), its access
   * level is the new mode's start access: the mode's own level, or for a mode that leaves it alone the level from before a
   * mode changed it. A level picked by hand on the draft, or one Modes never set, stays (lib/sandbox.js draftAccessStep).
   * The usual way (applySandbox on the switch) already does this; this makes sure of it once the switch is applied.
   * @param {string} top - the draft.
   */
  async function settleDraftAccess(top) {
    const agent = ctx.get('agents')?.get?.(top);
    const policy = ctx.get('sandboxPolicy');
    if (!agent || !policy || !freshNow(top)) return;
    if (boundaryRuns.has(top)) {
      let timer;
      const waited = new Promise((resolve) => {
        timer = setTimeout(resolve, SCHEDULED_WAIT_MS);
        timer.unref?.();
      });
      await Promise.race([boundaryRuns.get(top).catch(() => {}), waited]);
      clearTimeout(timer);
    }
    const mode = modeOf(top);
    const level = policy.resolve({ session: agent.session }).mode;
    const known = readBase(storedEntry(top));
    const step = draftAccessStep({ sandbox: mode.sandbox, level, known, wrote: levelsWritten.get(top) });
    let write = step.write;
    if (!write) return;
    // Scratch (step 35): at Workspace Write at most.
    if (write === FULL_ACCESS && scratchConversation(agent)) write = SCRATCH_CAP;
    if (write === level) return;
    agent.session.append('sandbox/mode', { mode: write });
    levelsWritten.set(top, write);
    const state = applied.get(top);
    const next = mode.sandbox === 'inherit' ? null : { base: known?.base ?? level, set: write };
    if (state) state.sandbox = next;
    keepBase(top, { mode: mode.id, ...(next ?? {}) });
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
    const moved = !switching && state.modeId === undefined && isTopLevel(agent) && !fresh.has(agent.id) && movedSince(storedEntry(agent.id), mode.id, storedKey(mode));
    applyTools(agent, state, mode);
    applySandbox(agent, state, mode, switching || moved || fresh.has(agent.id));
    state.modeId = mode.id;
    // Item 4A, stage 6a (I20): the effective mode's key, so the same id moving into a sealed or guarded copy re-applies.
    state.modeKey = modeKey(mode);
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
      const ops = await writeFresh((current) => startOps(normalizeStart(entry, { isolated: mode.isolated === true }), current, agent.id));
      if (ops.length > 0) seeded.set(agent.id, seededBy(ops, agent.id));
    } catch (error) {
      ctx.logger.warn(`modes: starting values of ${mode?.id} not applied (${error?.message ?? error})`);
    }
  }
  /**
   * Final fix round (lab: a started thread's own Web, Depth and Models were lost when a new draft was seeded): the
   * per-thread maps (`sessionWeb`, `sessionDepth`, `sessionHelpers`, …) are each one setting, so a write replaces the
   * whole map. Such writes are built here from the settings as they stand right now (the settings service's own view,
   * not this add-on's copy), sent with that revision, and built again when another write landed in between (the
   * service answers "conflict"), so no other thread's entry is ever dropped. One at a time.
   * @param {(current: object) => Array<object>} build - the operations from the current values.
   * @returns {Promise<Array<object>>} the operations written (none: nothing to write).
   */
  let freshChain = Promise.resolve();
  function writeFresh(build) {
    const run = freshChain.catch(() => {}).then(async () => {
      const settings = ctx.get('settings');
      for (let attempt = 0; ; attempt += 1) {
        let row;
        try {
          row = settings?.describe?.().find((entry) => entry.ns === 'modes');
        } catch {
          row = undefined;
        }
        const current = row?.value && typeof row.value === 'object' ? { ...config, ...row.value } : config;
        const ops = build(current);
        if (!settings || ops.length === 0) return ops;
        try {
          await settings.mutate('modes', ops, typeof row?.revision === 'number' ? row.revision : undefined);
          return ops;
        } catch (error) {
          const conflict = error?.code === 'SETTINGS_CONFLICT' || /conflict/i.test(`${error?.name ?? ''} ${error?.message ?? ''}`);
          if (!conflict || attempt >= 4) throw error;
        }
      }
    });
    freshChain = run;
    return run;
  }
  /** Item 4A, fix round 2: what a draft's start wrote (field -> value), so a later pick before its first message can take it back. */
  const seeded = new Map();
  /**
   * Item 4A, fix round 2: a draft that gets another mode before its first message (the Mode list, a claim of the chat
   * box or of another add-on) takes that mode's starting values (Settings → Modes → Starting values). What the earlier
   * mode's start wrote is taken back where it is unchanged; what the owner set by hand on the draft stays. Never after
   * the first message (a mode change then keeps Web, Depth and Lens). Never throws.
   * @param {string} sessionId - the draft.
   * @param {object} mode - its new mode.
   */
  async function reseedStart(sessionId, mode, before) {
    try {
      const starts = readObject(config.modeStart);
      const start = normalizeStart(starts[mode.id] ?? {}, { isolated: mode.isolated === true });
      // What the earlier mode's start wrote is kept in memory only; after a restart (a reused blank draft) it is taken to
      // be that mode's starting values, so they are taken back where the draft still holds them unchanged.
      let earlier = seeded.get(sessionId);
      if (earlier === undefined && before) {
        const prior = readModes(config)[before];
        earlier = seededBy(startOps(normalizeStart(starts[before] ?? {}, { isolated: prior?.isolated === true }), {}, sessionId), sessionId);
      }
      let plan = { ops: [], seeded: {} };
      await writeFresh((current) => {
        plan = restartOps(start, current, sessionId, earlier);
        return plan.ops;
      });
      seeded.set(sessionId, plan.seeded);
    } catch (error) {
      ctx.logger.warn(`modes: starting values of ${mode?.id} not applied to a new thread (${error?.message ?? error})`);
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
  /** Item 6: the modes that have a sidebar tab, kept 2 s (`list()`). */
  const shownCache = { at: 0, shown: undefined };
  /** Agent id -> the boundary work started last while it was idle (item 6: `set(..., { settle: true })` waits for it). */
  const boundaryRuns = new Map();
  function atTurnBoundary(agent, work) {
    if (agent.status === 'idle') {
      const run = work().catch(report);
      boundaryRuns.set(agent.id, run);
      void run.finally(() => { if (boundaryRuns.get(agent.id) === run) boundaryRuns.delete(agent.id); });
    } else pendingIdle.set(agent.id, work);
  }

  /**
   * Bring one Agent to the mode it should be in.
   * @param {object} agent - live Agent.
   */
  function reconcile(agent) {
    const desired = modeOf(agent.id);
    const state = applied.get(agent.id);
    if (state?.modeId === desired.id && (state.modeKey === undefined || state.modeKey === modeKey(desired))) {
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
      const now = applied.get(agent.id);
      if (now?.modeId !== mode.id || (now.modeKey !== undefined && now.modeKey !== modeKey(mode))) await applyMode(agent, mode, true);
    });
  }

  // The Tool ledger (dsh-tool-ledger) records which rule of Modes refused a call. Optional: without the ledger nothing changes.
  const ledgerNote = (exec, rule) => {
    try {
      ctx.get('toolLedger')?.note?.({ sessionId: exec?.agent?.id, tool: exec?.name, outcome: 'refused', rule, by: 'modes', exec });
    } catch {
      // the ledger is optional
    }
  };
  const ledgered = (rule, guard) => (exec) => {
    const reason = guard(exec);
    if (reason !== undefined) ledgerNote(exec, rule);
    return reason;
  };
  // The Web sources (the one Web selector): a tool that opens an address of a kind that is not ticked is
  // refused, in the conversation and its helpers; so is a command or a program that goes online without an
  // address to check (unless every kind of page is ticked). All (nothing stored) changes nothing. Recon keeps
  // its own rules: its tools ask Modes themselves (service `webSources`). The owner's own sources are Other's,
  // judged by their own tools, not by the kind of their address.
  ctx.effect(
    () =>
      ctx.tools.guard(ledgered('web-sources', (exec) => {
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
          return 'Modes could not check this call against the thread\'s Web sources, so it was not run.';
        }
      })),
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
  const OTHER_UNTICKED = 'Other is not ticked in this thread\'s Web sources, so the user\'s own sources are not used. The user ticks Other on the Web button.';
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
      ctx.tools.guard(ledgered('secrets', (exec) => {
        try {
          if (!exec?.agent?.id || OTHER_TOOLS.includes(exec.name) || WRITE_TOOLS.includes(exec.name)) return undefined;
          const args = exec.arguments;
          const text = typeof args === 'string' ? args : JSON.stringify(args ?? {});
          return SECRET_MARKS.test(text.slice(0, 200_000)) ? 'This call names the place where the user\'s secrets (logins, keys, cookies) are kept, so it was not run. Secrets are never read or shown in a thread; the user manages them on Settings → Web sources.' : undefined;
        } catch {
          return undefined;
        }
      })),
    'modes: secrets stay out of reach',
  );
  // The app's PTC preset offers `run_code` whatever the mask says. With nothing to call, a program is refused,
  // so "Tools off" and a mode without tools mean the same in every preset.
  ctx.effect(
    () =>
      ctx.tools.guard(ledgered('no-programs', (exec) => {
        try {
          const id = exec?.agent?.id;
          if (exec?.name !== PROGRAM_TOOL || !id) return undefined;
          const mask = toolMask(id, modeOf(id));
          // The two Tool access tools (the catalogue and the request) are no tools to call from a program: Chat still has none.
          return Array.isArray(mask?.allow) && mask.allow.every(isOwnTool) ? NO_PROGRAMS : undefined;
        } catch {
          return undefined;
        }
      })),
    'modes: no programs without tools',
  );
  // Item 4A, fix round 2: Plain chat stays inside its folder (the owner's answer: "a standalone chat reaches only its
  // own folder, a project chat its project folder"). The app's sandbox limits writes to the session folder only, which
  // for a standalone thread is the whole Scratch place, and reads not at all. A setting with a default (`plainFence`).
  ctx.effect(
    () =>
      ctx.tools.guard(ledgered('plain-fence', (exec) => {
        try {
          const id = exec?.agent?.id;
          if (!id) return undefined;
          const fence = fenceOf(topOf(id));
          if (!fence) return undefined;
          let cwd = '';
          try {
            cwd = String(ctx.get('workingDirectory')?.get?.(exec.agent.session) ?? '');
          } catch {
            cwd = '';
          }
          const verdict = fenceCheck({ root: fence.root, name: exec.name, args: exec.arguments, cwd, isRoom: reconRoomOf });
          return verdict.ok ? undefined : fenceRefusal(verdict, fence.root);
        } catch {
          return 'Modes could not check whether this call stays inside the thread\'s folder, so it was not run. Try again; if it keeps happening, switch off "Keep Plain chat inside its folder" in Settings → Modes.';
        }
      })),
    'modes: Plain chat stays inside its folder',
  );
  // Web off: the app's sandbox limits file writing only, not the network, so a shell command that
  // goes online (curl, a web address, fetching code, an install) is stopped here, and so is a
  // program (`run_code`, the PTC preset) that fetches, opens a socket or starts curl and the like.
  const SHELL_TOOLS = new Set(SHELL_NAMES);
  ctx.effect(
    () =>
      ctx.tools.guard(ledgered('web-off', (exec) => {
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
      })),
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
      ctx.tools.guard(ledgered('isolated', (exec) => {
        try {
          const id = exec?.agent?.id;
          if (!id) return undefined;
          const mode = modeOf(id);
          if (!mode?.isolated) return undefined;
          const long = longRunOf(id);
          if (isolatedMayRun({ mode, name: exec.name, child: topOf(id) !== id, off: toolsOff(id), webOff: isolatedWebOff(id), long, granted: access?.grantedFor(id, exec.name, exec) === true, online: onlineImageTools() })) {
            runOverCalls.delete(id);
            // Item 4A, stage 6a (I6, I8, LEAK 9): in a Recon-space thread (Recon mode included) file tools, granted or
            // not, read and write only inside the thread's room folder.
            const top = topOf(id);
            if (spaceOfTopRaw(top) === 'recon') {
              const refusal = roomPathRefusal({ name: exec.name, args: exec.arguments, cwd: threadCwd(exec, top), room: roomFolder(top), extra: readList(config.sealedExtra) });
              if (refusal) return refusal;
            }
            return undefined;
          }
          // The run's own step tool after the run ended: say so plainly, and count the calls.
          if (exec.name === RUN_STEP_TOOL && topOf(id) === id && !long) {
            runOverCalls.set(id, (runOverCalls.get(id) ?? 0) + 1);
            return RUN_OVER_TEXT;
          }
          runOverCalls.delete(id);
          // Lab fix (6a): in Recon (any mode) the refusal says why and what to use instead (2.7 SHARED_REFUSED, PROFILE_REFUSED,
          // DEEP_REFUSED, the web through Recon's routes); an owner's isolated mode elsewhere keeps the plain sentence.
          if (spaceOfTopRaw(topOf(id)) === 'recon') return reconRefusal(exec?.name);
          return `the tool ${exec?.name} is not part of this sealed thread and was not run.`;
        } catch {
          return 'this sealed thread could not be checked, so the tool was not run.';
        }
      })),
    'modes: isolated conversations',
  );
  /** @returns {string} the folder a call runs in: the app's working directory for the agent, else the thread's folder. */
  function threadCwd(exec, top) {
    try {
      const cwd = ctx.get('workingDirectory')?.get?.(exec?.agent?.session);
      if (typeof cwd === 'string' && cwd) return cwd;
    } catch {
      /* the thread's folder */
    }
    return folderOfThread(top);
  }
  /** Item 4A, stage 6a (I26): threads that ran the Terminal or a program in this app run (they cannot move into Devices or Workshop). */
  const ranPrograms = new Set();
  /** @returns {boolean} whether a tool runs a program or a command (the Terminal, a program, an engine, a workflow). */
  const runsPrograms = (name) => classify(name).group === 'run' || name.startsWith('terminal_') || SHELL_NAMES.includes(name)
    || PROGRAM_NAMES.includes(name) || name === 'engine' || name === 'workflow';
  const notePrograms = (exec) => {
    try {
      const id = exec?.agent?.id;
      const name = String(exec?.name ?? '');
      if (id && name && runsPrograms(name)) ranPrograms.add(topOf(id));
    } catch {
      /* nothing to note */
    }
  };
  // Fix round (6a review, design 10c): noted when the call is let through, not when it returns, so a thread whose long
  // shell or program call is still running cannot move into Devices or Workshop. The result stays as a backstop.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (!decision?.kind || decision.kind === 'allow') notePrograms(exec);
    return decision;
  });
  ctx.on('tools/result', (exec) => notePrograms(exec));
  /** @returns {string} the sentence a guest's refused tool gets (2.7 BASE_NO_PROGRAMS). */
  const baseNoPrograms = (space, tool) => spaceText('baseNoPrograms', 'en', { space: SPACE_NAMES.en[space] ?? (space === 'unknown' ? 'This space' : String(space ?? '')), tool: String(tool ?? '') });
  /** Devices' folders (Bench's backups, `/dev`): the base rule's check for `mac_find_files` when Bench cannot say. */
  function namesDevicesFolder(args) {
    const text = typeof args === 'string' ? args : JSON.stringify(args ?? {});
    if (/(^|["\s'=])\/dev(\/|["\s']|$)/.test(text)) return true;
    try {
      const folders = ctx.get('bench')?.folders?.() ?? [];
      return (Array.isArray(folders) ? folders : []).some((folder) => typeof folder === 'string' && folder && text.includes(folder));
    } catch {
      return true;
    }
  }
  // Item 4A, stage 6a (I14): the base rule of Devices and Workshop for every mode (a guest, or a thread whose space could
  // not be read): no Terminal, programs, jobs, connectors, Mac app tools, Office files, app tools or unsorted (stage 6b:
  // schedules only for the 'unknown' guard and a Mission run, J14),
  // tools, whatever Bench or Creator Plus do (a belt; their own guards add the folder rules).
  ctx.effect(
    () =>
      ctx.tools.guard(ledgered('space-guard', (exec) => {
        const id = exec?.agent?.id;
        if (!id) return undefined;
        let mode;
        try {
          mode = modeOf(id);
        } catch {
          // The thread's mode cannot be read: the base rule as for an unknown space (I4).
          try {
            return guestRefuses(exec?.name, { space: 'unknown' }) ? baseNoPrograms('unknown', exec?.name) : undefined;
          } catch {
            return baseNoPrograms('unknown', exec?.name);
          }
        }
        try {
          if (!mode?.guardedBy) return undefined;
          if (guestRefuses(exec.name, guestOpts(id, mode))) return baseNoPrograms(mode.guardedBy, exec.name);
          if (exec.name === 'mac_find_files' && namesDevicesFolder(exec.arguments)) return baseNoPrograms(mode.guardedBy, exec.name);
          return undefined;
        } catch {
          return baseNoPrograms(mode?.guardedBy ?? 'unknown', exec?.name);
        }
      })),
    'modes: the base rule of Devices and Workshop',
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
    return programNote({ timeout, slow: SLOW_TOOLS.filter((tool) => reachable.includes(tool)), timed: TIMED_TOOLS.filter((tool) => reachable.includes(tool)) });
  }

  /**
   * The programs note of a conversation, by its tab: the usual "call every tool from inside run_code" note; nothing in an
   * isolated tab (its own PTC words come with promptText); and in a tab whose guard refuses programs (Devices, Creator
   * Plus, a mode marked noPrograms) not that note, which would send the AI into a dead end, but plain words that the tab
   * does not work in PTC and how to start again (item 7). A helper there gets nothing.
   * @param {object} agent - live Agent.
   * @param {object} mode - its mode.
   * @param {boolean} [child] - the agent is a helper.
   * @returns {string} the note, or ''.
   */
  function programsNoteFor(agent, mode, child = false) {
    if (mode?.isolated) return '';
    // Item 4A, stage 6a (I22): a guarded space refuses programs for every mode; the note then names the space.
    const space = spaceOfTopRaw(topOf(agent.id));
    if (!refusesProgramsIn(mode, space)) return viaPrograms(agent);
    if (child || !programOnly(ctx.tools, agent)) return '';
    const own = mode?.guardedBy || mode?.sealedBy ? readModes(config)[mode.id] ?? mode : mode;
    const label = refusesPrograms(own) ? mode.label : SPACE_NAMES.en[space] ?? mode.label;
    return noProgramsPtcPrompt(label, restartPresetIn(readLocks(plain(config.presetLock)), space, mode));
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

  /** Item 4A, stage 6a: a guest in Recon is told its routes and its room (its tool and route sentences only). */
  // Lab fix (6a): the note names the thread's own room folder (relative paths and calls without a path start in Recon's
  // shared room, which the room rule refuses), and says what replaces the web tools the mode's own words may name.
  const sealedNote = (mode, top) => (mode?.sealedBy === 'recon' && mode.id !== 'recon' ? `\n\n${sealedSpaceNote(roomFolder(top))}` : '');
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
            if (topOf(agent.id) !== agent.id) return programsNoteFor(agent, modeOf(agent.id), true);
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
            const isolatedRun = mode.isolated && longRunOf(agent.id) ? `\n\nA Mission is on in this thread. You conduct it with mission_step; its helpers do the work with this mode's tools${longRunOf(agent.id).files ? ' and file tools in the run\'s own folder' : ''}. There are no programs, commands or other tools.` : '';
            const long = mode.isolated ? undefined : longRunOf(agent.id);
            const longNote = long ? `\n\nA Mission is on in this thread. Until it ends, it and its helpers have the tools the run needs${long.files ? ' (files and commands' : ' (this mode\'s own tools'}${long.web ? ', and the web)' : ', no web)'}; this overrides what this mode says above about tools, files and the web. The mode's own way of working still applies.` : '';
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
              programs: programsNoteFor(agent, mode),
              programOnly: false,
            })}${longNote}${levelSaid(agent.id)}${sealedNote(mode, topOf(agent.id))}` : promptText({
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
              // An isolated tab runs no programs; under PTC it is told it cannot work there instead. So is a tab
              // whose guard refuses programs (Devices, Creator Plus). The two fallback modes have no tools in any
              // preset: they are not told to start again in Standard, the cause is the mode.
              programs: programsNoteFor(agent, mode),
              programOnly: mode.isolated === true && !FALLBACK_MODE_IDS.includes(mode.id) && programOnly(ctx.tools, agent),
              // Under PTC a mode without tools (Chat with Web on) is told how it may look things up.
              ptc: mode.tools === 'none' && programOnly(ctx.tools, agent),
            }) + isolatedRun + levelSaid(agent.id) + sealedNote(mode, topOf(agent.id));
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
    // Item 4A, fix round 2: a fenced Plain chat thread is told its folder, so what it hears matches the fence (the app's
    // file policy names the whole session folder, for a standalone thread the shared Scratch place). Helpers too.
    const disposeFence = agent.ctx.effect(
      () => agent.ctx.systemPrompt.section({ name: 'modes:fence', order: 60, interpolate: false, text: () => {
        try {
          const fence = fenceOf(topOf(agent.id));
          return fence ? fencePrompt(fence.root, fence.standalone) : '';
        } catch {
          return '';
        }
      } }),
      'modes fence section',
    );
    promptDisposers.set(agent.id, () => {
      dispose?.();
      disposeLens?.();
      disposeAccess?.();
      disposeFence?.();
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
      // Item 4A, stage 6a (I29): the seam reads which agents are there.
      bump();
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
    void addPlain().then(() => carryPlain()).catch(report);
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
    // Stage 6b (J11, G6): while the scheduler resolves a reserved thread, a claim from another add-on's hook counts as a
    // scheduled claim (whichever hook runs first).
    const asked = typeof sessionId === 'string' && sessionId ? sessionId : '';
    if (asked) schedulerResolving.add(asked);
    let agent;
    try {
      agent = await next();
    } finally {
      if (asked) schedulerResolving.delete(asked);
    }
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
      else if (id && Array.isArray(event.data?.inserted) && event.data.inserted.some((item) => (item?.source ?? item?.message?.source)?.kind === 'user')) {
        scheduledRun.delete(id);
        // Stage 6b (J11): the user wrote in a held thread: it runs again.
        if (heldRuns.delete(id)) bump();
        guestRunPending.delete(id);
        guestRunPendingMode.delete(id);
      }
      // Stage 6b (Revision 2 L4): a fresh thread of a guest automation that opens new threads must be in its space before
      // its first step; checked at that step (another add-on's claim may still come in this same event).
      if (fromTimer && id && fresh.has(id)) {
        const table = guestRunTable();
        const taskId = scheduledTaskIds(event.data?.inserted).find((one) => table[one] === 'devices' || table[one] === 'workshop');
        const space = taskId === undefined ? undefined : table[taskId];
        if (space) {
          guestRunPending.set(id, space);
          // Stage 7 (6b lab leftover): the mode it runs in (named on its line and its row; '' when not known).
          guestRunPendingMode.set(id, String(guestRunModeTable()[taskId] ?? ''));
        }
      }
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

  // ---- Preset in this tab (item 7) ------------------------------------------------------------------------
  // The Cowork sidebar starts a locked tab's conversations in its preset ({ agentPreset } on the app's start). This is
  // the backstop behind it: a still-blank conversation of a locked tab that gets another preset (a pick staged in
  // another tab, the app's own Cmd-N, the app's default) is switched to the locked one. A started conversation is
  // never touched (the app refuses with agent-preset/locked, which is ignored). Keyed on the setting, not on a tab id.

  /** Conversations whose preset the backstop switched: id -> { from, to, why: 'pick' | 'default' }. Read by the (i). */
  const presetOverrides = new Map();
  /** How long a preset change settles before it is checked (the tab that a new conversation belongs to is saved meanwhile). */
  const presetSettleMs = Math.max(0, Number(process.env.DSH_MODES_PRESET_SETTLE_MS ?? 600) || 0);
  /** @returns {Record<string, string>} each tab's choice as stored. */
  const presetLocks = () => readLocks(plain(config.presetLock));
  /** @returns {Promise<Array<{id: string, broken?: string}> | null>} the app's presets, or null when it cannot say. */
  async function presetRoster() {
    // Kept a few seconds: every open (i) asks for it, and the app checks every preset's plugins for each answer.
    if (rosterCache.list && Date.now() - rosterCache.at < ROSTER_TTL_MS) return rosterCache.list;
    try {
      const list = await ctx.get('agentPresets')?.list?.();
      if (!Array.isArray(list)) return null;
      rosterCache.list = list;
      rosterCache.at = Date.now();
      return list;
    } catch {
      return null;
    }
  }
  /** The app's preset list, kept briefly (none in tests: DSH_MODES_PRESET_SETTLE_MS=0 also means no wait here). */
  const ROSTER_TTL_MS = presetSettleMs === 0 ? 0 : 5000;
  const rosterCache = { list: null, at: 0 };
  /** @returns {string} the app's default preset ('' when it cannot say). */
  function defaultPresetId() {
    try {
      const id = ctx.get('agentPresets')?.defaultId;
      return typeof id === 'string' ? id : '';
    } catch {
      return '';
    }
  }
  /** @returns {string} the preset a conversation runs, '' when unknown. */
  function presetOfAgent(agent) {
    const presets = ctx.get('agentPresets');
    for (const read of [() => presets?.presetForSession?.(agent.session), () => presets?.composedPreset?.(agent.ctx)]) {
      try {
        const id = read();
        if (typeof id === 'string' && id) return id;
      } catch {
        // the next way
      }
    }
    return '';
  }
  /** @returns {boolean} whether no turn has started, by the rule the app's preset switch uses. */
  function stillBlank(agent) {
    try {
      const boundary = ctx.get('agents')?.turnBoundaryOf?.(agent.session);
      if (boundary && typeof boundary === 'object') return boundary.openTurnStartSeq === null && Number(boundary.lastTurn) === 0;
    } catch {
      // as below
    }
    return neverRan(agent);
  }
  /**
   * Switch a still-blank conversation of a locked tab to the tab's preset.
   * @param {string} sessionId - the conversation.
   * @param {'pick' | 'default'} why - a pick (agent-preset/selected) or a new conversation on the app's default.
   */
  async function holdPreset(sessionId, why) {
    const agent = ctx.get('agents')?.get?.(sessionId);
    // Not a helper, not one an Automation task opened (its preset is the task's own). A conversation another add-on
    // claimed into a tab (a Split Plus pane, Content, Finance) is held too: a claim moves the mode, it picks no preset.
    if (!agent || !isTopLevel(agent) || !stillBlank(agent) || scheduled.has(sessionId)) return;
    const mode = modeOf(sessionId);
    const held = lockFor(sessionId, mode);
    const wanted = held.lock === 'any' ? '' : LOCK_PRESET[held.lock];
    if (!wanted) return;
    const now = presetOfAgent(agent);
    if (!now || now === wanted) return;
    const roster = await presetRoster();
    const row = roster?.find((one) => one?.id === wanted);
    if (!row || row.broken) {
      // Graceful: the (i) says the preset is missing and the menu stays free.
      ctx.logger.warn(`modes: ${mode.label} is set to the preset "${wanted}", which the app does not offer now; ${sessionId} keeps "${now}"`);
      return;
    }
    // What the draft goes back to when it is shown in an Any tab again: the preset it had before it was carried into a
    // locked tab (kept through a chain of locked tabs), else the app's default. A refused pick is not given back.
    const before = lockHeld.get(sessionId);
    const back = before && before.to === now ? before.from : why === 'tab' ? now : '';
    try {
      await ctx.get('agentPresets').select(agent, wanted);
      // The tab is kept with the record, so the (i) names the tab of the switch and drops the line once it no longer applies.
      // Item 4A, stage 6a (map 1.2): the place is space and mode, so a draft re-claimed into another space starts over.
      presetOverrides.set(sessionId, { from: now, to: wanted, why, modeId: mode?.id ?? '', space: held.space ?? '', label: mode?.label ?? '', at: Date.now() });
      lockHeld.set(sessionId, { to: wanted, from: back });
    } catch (error) {
      const code = error?.code ?? error?.rpcError?.code;
      if (code !== 'agent-preset/locked') report(error);
    }
  }
  /**
   * The lock that holds for a thread (item 4A, stage 3a): with spaces live, the stricter of its space's lock and its mode's
   * (lib/presetlock.js lockInSpace; today's keys are read, nothing is rewritten); else its mode's (its tab's), as before.
   * @returns {{lock: string, conflict: boolean, space?: string, spaceLock?: string, modeLock?: string}}
   */
  function lockFor(sessionId, mode, table = presetLocks()) {
    if (!spacesLive()) return { lock: lockOf(table, mode?.id), conflict: false };
    let space;
    try {
      space = modes.spaces.of(sessionId);
    } catch {
      // Item 4A, stage 6a (map 1.1): fail closed to the seam's space, then a mark or the room (Recon), then the folder.
      try {
        const raw = spaceOfTopRaw(topOf(sessionId));
        space = isSpace(raw) ? raw : wasIsolated(sessionId) || inReconRoom(sessionId) ? 'recon' : folderSpace(sessionId);
      } catch {
        space = 'recon';
      }
    }
    return { ...lockInSpace(table, space, mode?.id), space };
  }
  /** Check after the settle time; one timer per conversation. */
  const presetTimers = new Map();
  function holdPresetSoon(sessionId, why) {
    if (typeof sessionId !== 'string' || !sessionId) return;
    clearTimeout(presetTimers.get(sessionId));
    const run = () => {
      presetTimers.delete(sessionId);
      void holdPreset(sessionId, why).catch(report);
    };
    if (presetSettleMs === 0) {
      run();
      return;
    }
    const timer = setTimeout(run, presetSettleMs);
    timer.unref?.();
    presetTimers.set(sessionId, timer);
  }
  ctx.on('agent-preset/selected', (sessionId) => {
    try {
      holdPresetSoon(sessionId, 'pick');
    } catch (error) {
      report(error);
    }
  });
  // A new conversation the app made on its default (its own Cmd-N with "Cmd-N follows" off, a restored draft).
  ctx.on('agent/created', ({ agent, source }) => {
    try {
      if (source === 'startup' && agent?.id && fresh.has(agent.id)) holdPresetSoon(agent.id, 'default');
    } catch (error) {
      report(error);
    }
  });
  ctx.on('agent/disposed', ({ agent }) => {
    bump();
    // Stage 6b (J3): a refused message's text goes with its thread (Recon's End and wipe disposes it too).
    engineHeldText.drop(agent?.id);
    pageLangs.delete(agent?.id);
    clearTimeout(presetTimers.get(agent?.id));
    presetTimers.delete(agent?.id);
    presetOverrides.delete(agent?.id);
    presetSeen.delete(agent?.id);
    lockHeld.delete(agent?.id);
  });
  // A tab's lock changed: check again only the blank chats whose tab is fixed (claimed or moved into a tab, a Split Plus
  // pane). A blank draft that follows the selected tab is not checked on a tab switch: only the one actually shown is
  // (noteShown, from the (i)'s own reads). Checking them all switched drafts of other tabs that were not on screen (lab, item 7).
  let presetInputs = plain(config.presetLock);
  ctx.on('loader/volatile-update', () => {
    try {
      const now = plain(config.presetLock);
      if (now === presetInputs) return;
      presetInputs = now;
      const stored = readObject(config.sessionModes);
      for (const agent of ctx.get('agents')?.list?.() ?? []) {
        if (!agent?.id || !freshNow(agent.id) || !isTopLevel(agent)) continue;
        if (claimed.has(agent.id) || overlay.has(agent.id) || Object.prototype.hasOwnProperty.call(stored, agent.id)) holdPresetSoon(agent.id, 'tab');
      }
    } catch (error) {
      report(error);
    }
  });

  /** Blank drafts the (i) was read for: id -> { modeId, first, last } (the tab it was shown in, and when). */
  const presetSeen = new Map();
  /** Blank drafts on a preset a locked tab gave them: id -> { to, from } (`from`: the preset to give back in an Any tab, '' for the app's default). */
  const lockHeld = new Map();
  /**
   * How long apart two reads must be before a draft counts as shown in a tab: a read made during a tab switch (the old
   * draft's (i) is told of the change before the new tab's draft replaces it, Recon's room draft can take a moment) is
   * not enough. None in tests (DSH_MODES_PRESET_SETTLE_MS=0).
   */
  const SHOWN_GAP_MS = presetSettleMs === 0 ? 0 : Math.max(presetSettleMs, 1500);
  /** A read later than this after the previous one starts the count again (the (i) reads every 2.5 seconds while shown). */
  const SHOWN_GAP_MAX_MS = 8000;
  /** How long the "switched" line stays in the (i) after the switch. */
  const SWITCH_NOTE_MS = 2 * 60 * 1000;

  /**
   * A blank draft the (i) was read for: once it has stayed in the same tab for a moment, a locked tab switches it to its
   * preset, and an Any tab gives back the preset a locked tab took away (the PTC pick it had before, else the app's default).
   * Only the draft on screen is handled, so a draft of another tab is never changed by looking at a tab.
   */
  function noteShown(sessionId, agent, { modeId, lockedTo, preset, blank, space = '' }) {
    if (!blank || !isTopLevel(agent) || scheduled.has(sessionId) || !freshNow(sessionId)) return;
    const now = Date.now();
    const seen = presetSeen.get(sessionId);
    // Item 4A, stage 6a (map 1.3): compared by place (space and mode), so the same draft moved Chat → Recon starts over.
    const place = `${space}:${modeId}`;
    if (!seen || seen.place !== place || now - seen.last > SHOWN_GAP_MAX_MS) {
      presetSeen.set(sessionId, { modeId, place, first: now, last: now });
      return;
    }
    seen.last = now;
    if (now - seen.first < SHOWN_GAP_MS) return;
    if (lockedTo) {
      if (preset !== lockedTo) holdPresetSoon(sessionId, 'tab');
      else if (!lockHeld.has(sessionId)) lockHeld.set(sessionId, { to: lockedTo, from: '' });
      return;
    }
    const held = lockHeld.get(sessionId);
    if (!held) return;
    lockHeld.delete(sessionId);
    presetOverrides.delete(sessionId);
    if (held.to !== preset) return;
    void givePresetBack(agent, held).catch(report);
  }
  /** Put a blank draft shown in an Any tab back on the preset it had before a locked tab switched it (else the app's default). */
  async function givePresetBack(agent, held) {
    const back = held.from || defaultPresetId();
    if (!back || back === held.to) return;
    const roster = await presetRoster();
    if (!roster?.some((one) => one?.id === back && !one.broken)) return;
    if (!stillBlank(agent) || presetOfAgent(agent) !== held.to) return;
    try {
      await ctx.get('agentPresets').select(agent, back);
    } catch (error) {
      const code = error?.code ?? error?.rpcError?.code;
      if (code !== 'agent-preset/locked') report(error);
    }
  }

  /**
   * What the preset menu's (i), its lock and the PTC note show; without a conversation, each tab's choice for Settings.
   * @param {string} sessionId - the conversation, or ''.
   * @returns {Promise<object>} see PRESET_PATH.
   */
  async function presetView(sessionId, locale = 'en') {
    // Plus is English only: `locale` is accepted and ignored.
    const lang = 'en';
    const table = presetLocks();
    const modes = readModes(config);
    const roster = await presetRoster();
    // true, false, or null when the app cannot say (then nothing is called missing).
    const has = (id) => (roster === null ? null : roster.some((one) => one?.id === id && !one.broken));
    const tabs = Object.values(modes).map((mode) => ({
      id: mode.id,
      label: mode.label,
      lock: lockOf(table, mode.id),
      defaultLock: defaultLockOf(mode.id),
      saved: Object.prototype.hasOwnProperty.call(table, mode.id),
      warn: loosenWarning(mode.id, 'any', mode.label, lang),
      // Shown under the row at all times (not only once loosened): Recon's own plain warning.
      caution: lockCaution(mode.id, lang),
      swap: { standard: swapNote(mode.id, 'standard', lang), creator: swapNote(mode.id, 'creator', lang) },
      refuses: refusesPrograms(mode),
    }));
    // Item 4A, stage 5: "Preset in this space" (Settings → Spaces). Each space reads today's key of its own tab, with that
    // tab's default and warnings (Recon and Devices Standard, Workshop Creator, Chat and Code Any); every other key stays a
    // lock of its mode (the Automations mode keeps its own Standard lock).
    const spaceLocks = Object.entries(SPACE_LOCK_KEY).map(([space, key]) => {
      const label = SPACE_NAMES[lang][space] ?? space;
      return {
        id: key,
        space,
        label,
        lock: lockOf(table, key),
        defaultLock: defaultLockOf(key),
        saved: Object.prototype.hasOwnProperty.call(table, key),
        warn: loosenWarning(key, 'any', label, lang),
        caution: lockCaution(key, lang),
        swap: { standard: swapNote(key, 'standard', lang), creator: swapNote(key, 'creator', lang) },
      };
    });
    const out = {
      tabs,
      spaces: spaceLocks,
      // The per-mode locks shown beside the spaces: the Automations mode always, and any other mode with a saved choice.
      modeLocks: tabs.filter((tab) => !Object.values(SPACE_LOCK_KEY).includes(tab.id) && (tab.id === 'automations' || tab.saved)),
      presets: { standard: has(LOCK_PRESET.standard), creator: has(LOCK_PRESET.creator) },
      // The app's default preset: the Cowork sidebar starts an Any tab's new chats on it, so a blank left on another preset is not reused.
      defaultPreset: defaultPresetId(),
      where: whereText(lang, spacesLive()),
    };
    if (!sessionId) return out;
    const agent = ctx.get('agents')?.get?.(sessionId) ?? (ctx.get('agents')?.list() ?? []).find((item) => item.id === sessionId);
    if (!agent) return { ...out, known: false };
    const mode = modeOf(sessionId);
    const held = lockFor(sessionId, mode, table);
    const lock = held.lock;
    const lockedTo = lock === 'any' ? '' : LOCK_PRESET[lock];
    // A space and a mode that lock to different presets: one line in the chat box says which holds (stage 3a).
    const conflict = held.conflict ? lockConflictLine({ space: SPACE_NAMES[lang][held.space] ?? String(held.space ?? ''), mode: mode?.label ?? '', spaceLock: held.spaceLock, modeLock: held.modeLock, lang }) : '';
    const missing = Boolean(lockedTo) && has(lockedTo) === false;
    const preset = presetOfAgent(agent);
    const blank = stillBlank(agent);
    const ptc = preset === PTC_PRESET || programOnly(ctx.tools, agent);
    // Item 4A, stage 6a (I22): the restart preset and the refusal follow the thread's space.
    const reach = ptcReach(mode, { web: webOn(sessionId, mode), restart: restartPresetIn(table, held.space, mode), blank, lang });
    // Greyed only while the chat is really on the locked preset, and only when the app's preset list could be read:
    // a blank draft still on another preset keeps a free menu until the backstop has switched it.
    const greyed = Boolean(lockedTo) && !missing && roster !== null && (!blank || preset === lockedTo);
    // Only the conversation on screen asks with its id (the (i) beside its menu or label): a locked tab switches it, an Any tab gives back.
    try {
      noteShown(sessionId, agent, { modeId: mode?.id ?? '', lockedTo: missing ? '' : lockedTo, preset, blank, space: held.space ?? '' });
    } catch (error) {
      report(error);
    }
    // A switch record shows only while it still applies: same tab, still blank, still on the preset it was switched to,
    // and for a short while after the switch (an old switch the owner never saw is not told later).
    let overridden = presetOverrides.get(sessionId) ?? null;
    const stale = Boolean(overridden) && Date.now() - (overridden.at ?? 0) > SWITCH_NOTE_MS;
    const samePlace = (record) => record.modeId === (mode?.id ?? '') && (record.space === undefined || record.space === (held.space ?? ''));
    if (overridden && (stale || !(blank && samePlace(overridden) && overridden.to === lockedTo && preset === overridden.to))) {
      if (stale || !blank || !samePlace(overridden) || overridden.to !== lockedTo) presetOverrides.delete(sessionId);
      overridden = null;
    }
    if (overridden) {
      const { at: _at, space: _space, ...shown } = overridden;
      overridden = shown;
    }
    return {
      ...out,
      known: true,
      modeId: mode?.id ?? '',
      modeLabel: mode?.label ?? '',
      lock,
      lockedTo,
      missing,
      preset,
      blank,
      ptc,
      greyed,
      overridden,
      // One line under the menu, only while the conversation is in PTC (inform, never block).
      note: conflict || (ptc ? reach.note : ''),
      // With spaces, a lock that comes from the space is named after the space ("Recon is set to Standard only").
      info: presetInfo({ label: held.from === 'space' && held.space ? SPACE_NAMES[lang][held.space] ?? mode?.label ?? '' : mode?.label ?? '', modeId: held.from === 'space' && held.space ? SPACE_LOCK_KEY[held.space] ?? mode?.id ?? '' : mode?.id ?? '', lock, missing, overridden, preset, started: !blank, reach: reachLine({ greyed, refuses: refusesProgramsIn(mode, held.space), preset, lockedTo, info: reach.info }), lang, spaces: spacesLive() }),
    };
  }

  // Fix round (6a review): a guard add-on's service coming or going (Bench, Creator Plus, Recon) changes whether its
  // space's guests are guarded (guardReady): the copies are worked out again and every live thread's tools follow.
  const guardsChanged = () => {
    try {
      bump();
      for (const agent of ctx.get('agents')?.list?.() ?? []) reconcile(agent);
    } catch (error) {
      report(error);
    }
  };
  for (const name of ['bench', 'creatorPlus', 'recon']) {
    ctx.inject([name], (inner) => {
      try {
        inner.effect(() => {
          guardsChanged();
          // Gone: checked once the service is really out of the app's list.
          return () => setTimeout(guardsChanged, 0);
        }, `modes: guests follow the ${name} guard`);
      } catch (error) {
        report(error);
      }
    });
  }
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
    const wasFresh = fresh.has(agent.id);
    // With spaces, modeOf gives an unclaimed draft its space's start mode (or the mode it has, where offered), so the
    // forced record below is what it really runs in, never a stale `defaultMode` (item 4A fix round).
    const force = wasFresh && tabsDecide() && !claimed.has(agent.id);
    const startMode = modeOf(agent.id);
    let modeId = startMode.id;
    // A blank draft an isolated tab left behind, now started from an ordinary tab: it read nothing there.
    if (force && !startMode.isolated && wasIsolated(agent.id)) unmarkIsolated(agent.id);
    // With spaces, a new thread is recorded in its draft's space: the one it was opened in, else its recorded one, else
    // its folder's; Recon's room only ever Recon.
    const spacedSpace = wasFresh && spacesLive() && tabsDecide() && isTopLevel(agent) ? draftSpaceOf(agent.id) : undefined;
    // Item 4A, stage 6a (REGRESSION 4): the space is worked out before anything is forgotten; a guarded record (a claim
    // not yet written, or written at the claim) wins over the draft's other guesses.
    const guardedRecord = isGuarded(recordedSpaceSafe(agent.id)) ? recordedSpaceSafe(agent.id) : undefined;
    // Stage 6b lab fix (check 15b): a guest automation's fresh thread that nobody placed (Automations off or gone) is
    // recorded in its guest space from its first turn, never in the folder's space (Chat): the turn starts before its
    // first step, where the hold below is decided.
    // The hold is set here too, with the same rule as at that step (not placed in its space = held).
    const guestRun = wasFresh && isTopLevel(agent) ? guestRunPending.get(agent.id) : undefined;
    const unplaced = isGuarded(guestRun) && (draftSpaces.get(agent.id) ?? guardedRecord) !== guestRun;
    const draftSpace = unplaced ? guestRun : guardedRecord ?? spacedSpace ?? draftSpaces.get(agent.id);
    // Stage 7 (6b lab leftover): the thread is recorded in the automation's own mode (its row and Mode button name it,
    // never the default mode for automations), and the line says why: Automations is off, or the space could not take it.
    let runMode = '';
    if (unplaced) {
      runMode = String(guestRunPendingMode.get(agent.id) ?? '');
      // Review: a sealed (Recon or own isolated) mode is never given to a guest run's thread.
      if (!runMode || !readModes(config)[runMode] || readModes(config)[runMode].isolated === true) runMode = '';
      if (runMode) modeId = runMode;
      guestRunPending.delete(agent.id);
      guestRunPendingMode.delete(agent.id);
      draftSpaces.set(agent.id, guestRun);
      void recordDraftSpace(agent.id, guestRun).catch(report);
      heldRuns.set(agent.id, { space: guestRun, kind: automationsPlaceGuestRuns() ? 'other' : 'automations', mode: runMode, text: '', at: Date.now() });
      ctx.logger.warn(`modes: held a scheduled run of ${agent.id}: its automation runs in ${guestRun} and was not placed there`);
      bump();
    } else if (wasFresh && isTopLevel(agent)) {
      // Stage 7 (lab): a run held at its claim (its guarded space could not take it, e.g. Devices off) is recorded in the
      // automation's own mode too, so its row and Mode button name it (never the space's start mode). Never a sealed mode.
      const held = heldRunOf(agent.id);
      const heldModeId = held && isGuarded(held.space) ? String(held.mode ?? '') : '';
      if (heldModeId && readModes(config)[heldModeId] && readModes(config)[heldModeId].isolated !== true) {
        runMode = heldModeId;
        modeId = heldModeId;
      }
    }
    fresh.delete(agent.id);
    ranSeen.add(agent.id);
    claimed.delete(agent.id);
    startTiers.delete(agent.id);
    pickedModes.delete(agent.id);
    autoStarted.delete(agent.id);
    seeded.delete(agent.id);
    levelsWritten.delete(agent.id);
    // "Pin the starting mode" off: the mode is not recorded (as before), but the space still is (item 4A).
    const pinMode = force || plain(config.pinOnFirstTurn) !== false;
    if (!isTopLevel(agent)) {
      draftSpaces.delete(agent.id);
      return;
    }
    // Item 4A: the thread's space is recorded at its first message too, from the mode it starts in (also when its mode
    // was already chosen, by a claim or the chat box). Stage 6a: also when the stored value is stale (a reused draft).
    const storedSpace = readObject(config.sessionSpaces)[agent.id];
    const needSpace = storedSpace === undefined || (draftSpace !== undefined && storedSpace !== draftSpace);
    const needMode = Boolean(runMode) || (pinMode && (force || !(overlay.has(agent.id) || readTable(config.sessionModes)[agent.id] !== undefined)));
    const space = draftSpace ?? spaceOfMode(needMode ? modeId : readTable(config.sessionModes)[agent.id] ?? modeId);
    // Held in memory until written (it wins over the stale value meanwhile), before any early return (REGRESSION 4).
    if (needSpace && isSpace(space)) spaceOverlay.set(agent.id, space);
    draftSpaces.delete(agent.id);
    // A thread that starts in Recon is marked for good (its own write; the seal does not depend on it, I2).
    if (space === 'recon' && wasFresh) {
      markIsolated(agent.id);
      if (roomSays(agent.id) === false) ctx.logger.warn(`modes: ${agent.id} was drafted in Recon but its folder is not Recon's room; it stays sealed in Recon, with no file tools`);
    }
    if (pinQueue.has(agent.id)) return;
    if (!needMode && !needSpace) return;
    if (needMode) overlay.set(agent.id, modeId);
    // Item 4A, stage 2: a draft opened in a space (claimed with its start mode, or a mode picked from its list) is recorded
    // in that space, whatever space its mode would give (Research picked in Code stays in Code).
    pinQueue.set(agent.id, { modeId: needMode ? modeId : undefined, force: force || Boolean(runMode), spaceForce: needSpace, space, tries: 0 });
    flushPins();
  }
  /**
   * Write the first-message pins waiting (modes and spaces), in one line with the other writes of these maps. A failed
   * write keeps them (and the space overlay) and is tried again (item 9).
   */
  function flushPins() {
    const settings = ctx.get('settings');
    if (!settings) return;
    pinChain = pinChain.then(async () => {
      if (pinQueue.size === 0) return;
      const batch = new Map(pinQueue);
      const next = { ...readObject(config.sessionModes) };
      const spaces = { ...readObject(config.sessionSpaces) };
      let modesChanged = false;
      let spacesChanged = false;
      for (const [id, pin] of batch) {
        if (pin.modeId !== undefined && (pin.force || next[id] === undefined)) {
          next[id] = pin.modeId;
          modesChanged = true;
        }
        if ((pin.force || pin.spaceForce || spaces[id] === undefined) && spaces[id] !== pin.space) {
          spaces[id] = pin.space;
          spacesChanged = true;
        }
      }
      const ops = [];
      if (modesChanged) ops.push({ op: 'set', path: ['sessionModes'], value: JSON.stringify(next) });
      if (spacesChanged) ops.push({ op: 'set', path: ['sessionSpaces'], value: JSON.stringify(spaces) });
      try {
        if (ops.length > 0) await settings.mutate('modes', ops);
        for (const [id, pin] of batch) {
          pinQueue.delete(id);
          if (pin.modeId !== undefined) overlay.delete(id);
          if (spaceOverlay.get(id) === spaces[id]) spaceOverlay.delete(id);
        }
      } catch (error) {
        ctx.logger.warn(`modes: starting mode not persisted (${error?.message ?? error}); kept in memory, tried again`);
        // Item 4A, stage 6a: kept (the overlay too) and tried again, at most RETRY_MAX times.
        for (const [id, pin] of batch) {
          pin.tries = (pin.tries ?? 0) + 1;
          if (pin.tries > RETRY_MAX) {
            pinQueue.delete(id);
            // Fix round (6a review): given up: an unguarded space held for it no longer outranks what is stored (a guarded
            // one stays: it fails closed).
            if (!isGuarded(spaceOverlay.get(id))) spaceOverlay.delete(id);
          }
        }
        if (pinQueue.size > 0) retrySoon();
      }
    });
  }
  /**
   * Item 4A, stage 6a (I3): write every space held in `spaceOverlay` into `sessionSpaces` (a guarded claim's space, a
   * first message's space). Each entry goes once written; a failed write keeps them and is tried again.
   */
  let spaceTries = 0;
  function flushSpaces() {
    const settings = ctx.get('settings');
    if (!settings || spaceOverlay.size === 0) return pinChain;
    const run = pinChain.catch(() => {}).then(async () => {
      if (spaceOverlay.size === 0) return;
      const batch = new Map(spaceOverlay);
      const spaces = { ...readObject(config.sessionSpaces) };
      let changed = false;
      for (const [id, space] of batch) {
        if (spaces[id] !== space) {
          spaces[id] = space;
          changed = true;
        }
      }
      try {
        if (changed) await settings.mutate('modes', [{ op: 'set', path: ['sessionSpaces'], value: JSON.stringify(spaces) }]);
        for (const [id, space] of batch) if (spaceOverlay.get(id) === space) spaceOverlay.delete(id);
        spaceTries = 0;
      } catch (error) {
        spaceTries += 1;
        ctx.logger.warn(`modes: thread space not stored (${error?.message ?? error}); kept in memory${spaceTries <= RETRY_MAX ? ', tried again' : ''}`);
        if (spaceTries <= RETRY_MAX) retrySoon();
        // Fix round (6a review): given up: unguarded spaces held no longer outrank what is stored.
        else for (const [id, space] of batch) if (!isGuarded(space) && spaceOverlay.get(id) === space) spaceOverlay.delete(id);
      }
    });
    pinChain = run.catch(() => {});
    return run;
  }
  /** Item 4A, stage 6a (I3, LEAK 10): a draft claimed for a guarded space is recorded there at once, not at its first message. */
  function recordDraftSpace(top, space) {
    if (!isGuarded(space)) return pinChain;
    if (readObject(config.sessionSpaces)[top] === space && !spaceOverlay.has(top)) return pinChain;
    spaceOverlay.set(top, space);
    return flushSpaces();
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
    else if (id && USER_KINDS.has(message?.source?.kind)) {
      scheduledRun.delete(id);
      // Stage 6b (J11): a message from the user ends a held run. Stage 7 (6b lab leftover): and the engine refusal line
      // (a new refusal of this message sets it again).
      const lineGone = engineHeld.delete(id);
      if (heldRuns.delete(id) || lineGone) bump();
      guestRunPending.delete(id);
      guestRunPendingMode.delete(id);
    }
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
      ctx.tools.guard(ledgered('depth-check', (exec) => {
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
      })),
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
      // Item 6: an isolated conversation's mask follows "Scheduling from Recon" (Automations' setting) at each turn.
      if (agent?.id && isIsolated(agent.id)) refreshTools(agent);
      // Only a conversation that begins in an isolated mode is marked; the mark is for good. Stage 6a: a guest in Recon
      // begins sealed (its copy is isolated), so it is marked too.
      // Stage 6a leftovers: a thread held by Devices or Workshop (guard off or too old) is not marked: it gets its mode
      // back once the guard is ready.
      const begins = fresh.has(agent.id) && isTopLevel(agent) && isIsolated(agent.id) && !modeOf(agent.id)?.heldIn;
      if (begins) markIsolated(agent.id);
      pinStartingMode(agent);
      // Item 4A, stage 6a: writes that failed earlier are tried again now.
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = undefined;
        retryWrites();
      }
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
  /**
   * Stage 6a leftovers: the second layer behind dsh-engines' own guard. A thread whose space keeps its rules (sealed in
   * Recon, guarded in Devices or Workshop, or a mode without programs) never takes a step on an engine model
   * (provider `engine-…`): an engine is an outside program with its own shell and network. Fails closed: a guard that
   * cannot be read refuses, and so does a model that cannot be read when the guard would refuse an engine.
   * Owner point 26, "Home modes keep today's behaviour": the home mode of Devices (bench) or Workshop (creator-plus)
   * is not refused here; as before 6a, dsh-engines' soft "Code space only" check (stage 6b) answers it and nothing runs. Recon's home
   * mode is sealed, so it stays refused.
   */
  const engineHeld = new Map();
  /**
   * Item 4A, stage 6b (J3): the text of the user's refused message, per top thread, in memory only (lib/engineheld.js):
   * the thread's own Mode-list view offers it, the chat box puts it back and says so (POST engine-held-taken).
   */
  const engineHeldText = engineHeldTexts();
  /** @returns {boolean} whether a step of this agent on its current model must be refused. */
  function engineRefused(agent) {
    let provider = '';
    let unread = false;
    try {
      provider = String(agent?.model?.current?.()?.provider ?? '');
    } catch {
      unread = true;
    }
    if (!unread && !provider.startsWith('engine-')) return false;
    try {
      return guardRefusesEngine(guardOf(agent.id));
    } catch {
      return true;
    }
  }
  /** Whether an agent on an engine model is a home-mode thread of Devices or Workshop (dsh-engines refuses it softly). */
  function engineAtHome(agent) {
    try {
      const provider = String(agent?.model?.current?.()?.provider ?? '');
      if (!provider.startsWith('engine-')) return false;
      const guard = guardOf(agent.id);
      return guard?.homeMode === true && (guard.space === 'devices' || guard.space === 'workshop') && guard.sealed !== true;
    } catch {
      return false;
    }
  }
  ctx.on('agent/pre-step', ({ agent, messages }, next) => {
    try {
      if (agent?.id && engineRefused(agent)) {
        const top = topOf(agent.id) || agent.id;
        engineHeld.set(top, Date.now());
        if (engineHeld.size > 200) engineHeld.delete(engineHeld.keys().next().value);
        // Stage 6b (J3): only a top thread's own step keeps the user's words (a helper's step carries none of theirs).
        // Never logged: the warning below names the thread only.
        if (top === agent.id) {
          try {
            engineHeldText.keep(top, messages);
          } catch {
            // nothing kept: the line still says what to do
          }
        }
        ctx.logger.warn(`modes: refused a step of ${agent.id} on an engine model: its space keeps its own rules`);
        bump();
        return { kind: 'reject' };
      }
      // Review finding (point 27, "the typed message goes back into the chat box", no exception): the home mode of
      // Devices or Workshop is still not refused here (J2: dsh-engines' soft refusal answers it and nothing runs), but the
      // user's words are kept the same way, so the chat box gets them back too.
      if (agent?.id && engineAtHome(agent)) {
        const top = topOf(agent.id) || agent.id;
        let kept = false;
        if (top === agent.id) {
          try {
            kept = engineHeldText.keep(top, messages);
          } catch {
            kept = false;
          }
        }
        if (kept) {
          engineHeld.set(top, Date.now());
          if (engineHeld.size > 200) engineHeld.delete(engineHeld.keys().next().value);
          bump();
        }
      }
    } catch (error) {
      ctx.logger.warn(`modes: could not check for an engine model: ${error?.message ?? error}`);
      return { kind: 'reject' };
    }
    return next();
  }, { prepend: true });
  // Item 4A, stage 6b (J11, Revision 2 L4): a held run never runs: every step of a held thread and of its helpers is
  // rejected until a user message arrives in it. A guest automation's fresh thread that nobody placed in its space by
  // its first step is held here too, whatever Automations does (it may be off or gone).
  ctx.on('agent/pre-step', ({ agent }, next) => {
    try {
      const id = agent?.id;
      if (!id) return next();
      const top = topOf(id) || id;
      const pending = guestRunPending.get(top);
      if (pending !== undefined && top === id) {
        guestRunPending.delete(top);
        const pendingMode = String(guestRunPendingMode.get(top) ?? '');
        guestRunPendingMode.delete(top);
        const now = draftSpaces.get(top) ?? spaceOfTopRaw(top);
        if (now !== pending) {
          // Stage 6b lab fix (check 15b): also when its first turn already recorded it elsewhere (it is no longer "fresh"
          // here): this thread was opened by this run and must stay in its guest space (a guarded record wins).
          draftSpaces.set(top, pending);
          void recordDraftSpace(top, pending).catch(report);
          heldRuns.set(top, { space: pending, kind: automationsPlaceGuestRuns() ? 'other' : 'automations', mode: readModes(config)[pendingMode] && readModes(config)[pendingMode].isolated !== true ? pendingMode : '', text: '', at: Date.now() });
          ctx.logger.warn(`modes: held a scheduled run of ${top}: its automation runs in ${pending} and was not placed there`);
          bump();
        }
      }
      if (heldRunOf(top)) return { kind: 'reject' };
    } catch (error) {
      ctx.logger.warn(`modes: could not check for a held run: ${error?.message ?? error}`);
      if (heldRuns.size > 0 || guestRunPending.size > 0) return { kind: 'reject' };
    }
    return next();
  }, { prepend: true });
  /** Stage 6b (Revision 2 L4): fresh threads whose first message is a guest automation's run -> the space it must be in. */
  const guestRunPending = new Map();
  /** Stage 7 (6b lab leftover): those threads -> the mode their automation runs in ('' when not known). */
  const guestRunPendingMode = new Map();
  /** Stage 6b (L4): the stored `guestRunSpaces` plus what was noted since (kept in memory too: a failed write still holds). */
  const guestRunMemory = new Map();
  function guestRunTable() {
    const stored = { ...readObject(config.guestRunSpaces) };
    for (const [taskId, space] of guestRunMemory) stored[taskId] = space;
    return stored;
  }
  /** Stage 7 (6b lab leftover): the stored `guestRunModes` plus what was noted since; '' marks one taken away. */
  const guestRunModeMemory = new Map();
  function guestRunModeTable() {
    const stored = { ...readObject(config.guestRunModes) };
    for (const [taskId, mode] of guestRunModeMemory) {
      if (mode) stored[taskId] = mode;
      else delete stored[taskId];
    }
    return stored;
  }
  /**
   * Stage 6b (L4): note that a task opens new threads that must stay in a guarded space (Devices or Workshop); any other
   * space (or '') takes the note away (the owner moved its runs to Chat or Code with a folder picked).
   */
  function noteGuestRun(taskId, space, mode) {
    const id = String(taskId ?? '');
    if (!id || id.length > 200) return false;
    const guarded = space === 'devices' || space === 'workshop';
    // Stage 7 (6b lab leftover): the mode it runs in, when the caller says (an older caller does not: none kept).
    const modeId = guarded && typeof mode === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/i.test(mode) ? mode : '';
    if (guarded) {
      guestRunMemory.set(id, space);
      if (guestRunMemory.size > 2000) guestRunMemory.delete(guestRunMemory.keys().next().value);
    } else guestRunMemory.delete(id);
    guestRunModeMemory.set(id, modeId);
    if (guestRunModeMemory.size > 2000) guestRunModeMemory.delete(guestRunModeMemory.keys().next().value);
    void writeFresh((current) => {
      const ops = [];
      const table = { ...readObject(current.guestRunSpaces) };
      if (!(guarded ? table[id] === space : table[id] === undefined)) {
        if (guarded) table[id] = space;
        else delete table[id];
        ops.push({ op: 'set', path: ['guestRunSpaces'], value: JSON.stringify(table) });
      }
      const modes = { ...readObject(current.guestRunModes) };
      if (!(modeId ? modes[id] === modeId : modes[id] === undefined)) {
        if (modeId) modes[id] = modeId;
        else delete modes[id];
        ops.push({ op: 'set', path: ['guestRunModes'], value: JSON.stringify(modes) });
      }
      return ops;
    }).catch(report);
    return true;
  }
  /** Stage 6b (L4): drop the tasks that are gone (only on a list the scheduler gave). */
  async function pruneGuestRuns(schedule) {
    const table = { ...readObject(config.guestRunModes), ...readObject(config.guestRunSpaces) };
    if (Object.keys(table).length === 0 && guestRunMemory.size === 0 && guestRunModeMemory.size === 0) return;
    let catalog;
    try {
      catalog = await schedule?.catalog?.();
    } catch {
      return;
    }
    if (!Array.isArray(catalog)) return;
    const alive = new Set(catalog.map((task) => String(task?.id ?? '')));
    for (const id of [...guestRunMemory.keys()]) if (!alive.has(id)) guestRunMemory.delete(id);
    for (const id of [...guestRunModeMemory.keys()]) if (!alive.has(id)) guestRunModeMemory.delete(id);
    const gone = Object.keys(table).filter((id) => !alive.has(id));
    if (gone.length === 0) return;
    await writeFresh((current) => {
      const now = { ...readObject(current.guestRunSpaces) };
      const modes = { ...readObject(current.guestRunModes) };
      for (const id of gone) {
        delete now[id];
        delete modes[id];
      }
      return [{ op: 'set', path: ['guestRunSpaces'], value: JSON.stringify(now) }, { op: 'set', path: ['guestRunModes'], value: JSON.stringify(modes) }];
    }).catch(report);
  }
  ctx.inject(['schedule'], (inner) => {
    inner.on('schedule/changed', () => void pruneGuestRuns(inner.schedule));
  });
  /**
   * @returns {string} the engine line for the chat box while recent ('' otherwise). Stage 6b: "Your message is back in the
   * chat box" only when the user's text was kept AND this window is given it now (or a chat box already took it); else
   * the line without that promise (a scheduled run, a helper, or a window that does not show the thread's space: review
   * finding, the box there stays empty).
   */
  function takeEngineHeld(top, lang, offeredHere = false) {
    const at = engineHeld.get(top);
    if (at === undefined) return '';
    if (Date.now() - at > 120_000) {
      engineHeld.delete(top);
      return '';
    }
    const back = engineHeldText.had(top) && (offeredHere || engineHeldText.taken(top));
    return spaceText(back ? 'engineHeld' : 'engineHeldPlain', lang);
  }
  /**
   * Item 4A, stage 6b (J3, L5): the refused message's text for the chat box to put back, while not taken and younger than
   * 10 minutes; only for the thread itself (never a helper id) and only when the asking window shows the thread's space.
   * @returns {{id: string, text: string} | null}
   */
  function takeEngineHeldDraft(sessionId, top, windowSpace) {
    if (!top || sessionId !== top) return null;
    if (typeof windowSpace !== 'string' || !windowSpace || windowSpace !== spaceOfTopRaw(top)) return null;
    return engineHeldText.draft(top);
  }
  /** Item 4A, stage 6b (C5): the language each thread's page last asked its Mode list in (memory only). */
  const pageLangs = new Map();
  /** Fix round (6a review): threads whose first message went on before their space was known -> when (SPACE_WAIT). */
  const spaceWaits = new Map();
  /** How long the chat box shows the SPACE_WAIT line. */
  const SPACE_WAIT_SHOWN_MS = 120_000;
  /** @returns {string} the SPACE_WAIT line for a thread, in the page's language, while it is recent ('' otherwise). */
  function takeSpaceWait(top, lang) {
    const at = spaceWaits.get(top);
    if (at === undefined) return '';
    if (Date.now() - at > SPACE_WAIT_SHOWN_MS) {
      spaceWaits.delete(top);
      return '';
    }
    return spaceText('spaceWait', lang);
  }
  // Item 4A, stage 6a (I3): a spaced draft whose claim is still in flight holds its first step (at most CLAIM_WAIT_MS)
  // until its space is known, then gets its space's tools; on time-out it goes on with what the seam reads (a guarded
  // overlay already wins).
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    try {
      const id = agent?.id;
      const waiting = id ? pendingClaims.get(id) : undefined;
      if (waiting && isTopLevel(agent)) {
        let timer;
        let timedOut = false;
        const waited = new Promise((resolve) => {
          timer = setTimeout(() => {
            timedOut = true;
            resolve();
          }, CLAIM_WAIT_MS);
          timer.unref?.();
        });
        await Promise.race([waiting.catch(() => {}), waited]);
        clearTimeout(timer);
        bump();
        if (timedOut) {
          ctx.logger.warn(`modes: ${spaceText('spaceWait', 'en')} (${id})`);
          // Fix round (6a review, 2.7 SPACE_WAIT): the chat box says it too (modeView `spaceWait`).
          spaceWaits.set(id, Date.now());
          if (spaceWaits.size > 200) spaceWaits.delete(spaceWaits.keys().next().value);
        }
        const state = applied.get(id);
        if (state) applyTools(agent, state, modeOf(id));
      }
    } catch (error) {
      ctx.logger.warn(`modes: could not wait for a draft's space: ${error?.message ?? error}`);
    }
    return next();
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
    return `The skill "${name}" is switched off in the ${mode?.label ?? 'this'} mode, so it is not loaded here. Do the task without it. (The user can switch it back on.)`;
  };
  ctx.effect(() => (typeof ctx.tools?.guard === 'function' ? ctx.tools.guard(ledgered('skill-off', (exec) => {
    try {
      return skillOffReason(exec);
    } catch {
      return undefined;
    }
  })) : undefined), 'modes: skills switched off per tab');
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
      description: 'Only the core tools (files, the step list, questions, skills, and the shell and the web where this thread may use them) are loaded in this thread, to keep it fast. Call this to see the other tool families and add the ones you need: give a family (pdf, data, finance, visual, schedule, helpers, goals, library, memory, mac, code, learn, mission, connectors, app, office), a tool name, or what you want to do. Added tools are there from your next step on, for the rest of the conversation. Without arguments it lists the families.',
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
          if (!agent?.id || !trimmed(agent.id, modeOf(agent.id))) return { text: 'All tools are already loaded in this thread.' };
          const known = knownTools(agent.id);
          // The catalog leaves out the tools of isolated modes: they cannot be added here.
          const fenced = isolatedTools();
          const mode = modeOf(agent.id);
          // Lab fix (6a, REGRESSION 18): a guest in Devices or Workshop is never offered what its space refuses.
          const refusedHere = spaceRefuser(mode, workshopAllowed());
          const live = known.filter((name) => !fenced.includes(name));
          // Lab re-check fix (6a, problem 3): a family the space closes is left out of the list, and a request for it is
          // answered "refused here" before anything else (never "already added").
          const closedFamilies = mode?.guardedBy ? FAMILIES.map((family) => family.id).filter((id) => closedHere(id, live, refusedHere)) : [];
          const listing = () => trimCatalog(live.filter((name) => !refusedHere(name)), [...startOf(agent.id), ...addedOf(agent.id)], closedFamilies);
          const need = String(args?.need ?? '').trim();
          if (!need) return { text: `Tool families you can add (call ${FIND_TOOL} with one of them):\n${listing()}` };
          const wanted = resolveRequest(need, findable(agent, known));
          if (wanted.length === 0) return { text: `Nothing matches "${need}". The families:\n${listing()}` };
          const closed = mode?.guardedBy ? wanted.filter((entry) => !CORE.includes(entry) && closedHere(entry, live, refusedHere)) : [];
          // Core tools need no adding; anything else only when it brings a tool that exists and that
          // this conversation's switches let through (a family whose add-on is off brings nothing).
          const core = wanted.filter((entry) => CORE.includes(entry));
          const usable = wanted.filter((entry) => !CORE.includes(entry) && !closed.includes(entry) && brings(entry, offeredWith(agent.id, mode, [entry]).filter((name) => known.includes(name))));
          const missing = wanted.filter((entry) => !CORE.includes(entry) && !usable.includes(entry));
          const absent = missing.filter((entry) => !closed.includes(entry));
          const spaceName = SPACE_NAMES.en[mode?.guardedBy] ?? 'This space';
          const notes = [
            core.length ? `${core.join(', ')} ${core.length === 1 ? 'is a core tool' : 'are core tools'}: offered whenever ${core.length === 1 ? 'it applies' : 'they apply'}, nothing to add.` : '',
            closed.length ? `${closed.join(', ')} ${closed.length === 1 ? 'is' : 'are'} refused here: ${spaceName} closes ${closed.length === 1 ? 'it' : 'them'} for every mode.` : '',
            absent.length ? `${absent.join(', ')} ${absent.length === 1 ? 'is' : 'are'} not available here (not installed, switched off, or Web is off).` : '',
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
    ranSeen.delete(agent.id);
    claimed.delete(agent.id);
    scheduled.delete(agent.id);
    autoStarted.delete(agent.id);
    pickedModes.delete(agent.id);
    seeded.delete(agent.id);
    levelsWritten.delete(agent.id);
    draftReplies.delete(agent.id);
    scheduledRun.delete(agent.id);
    heldRuns.delete(agent.id);
    anyTicked.delete(agent.id);
    guestRunPending.delete(agent.id);
    guestRunPendingMode.delete(agent.id);
    startTiers.delete(agent.id);
    overlay.delete(agent.id);
    pendingIdle.delete(agent.id);
    promptDisposers.delete(agent.id);
    // Fix round (6a review): the link is kept (closedParents) for the helpers this one started.
    rememberClosed(agent);
    parents.delete(agent.id);
    spaceWaits.delete(agent.id);
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
    let cleared = [];
    // Built from the settings as they stand (writeFresh), so no thread's newer Web choice is dropped.
    const writing = writeFresh((current) => {
      const webs = readObject(current.sessionWeb);
      cleared = oldWebMarks(webs, readObject(current.sessionModes), readModes(config));
      const next = { ...webs };
      for (const id of cleared) delete next[id];
      const ops = [{ op: 'set', path: ['webMarksCleared'], value: true }];
      if (cleared.length > 0) ops.push({ op: 'set', path: ['sessionWeb'], value: JSON.stringify(next) });
      return ops;
    });
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
    const writing = writeFresh((current) => {
      const { depths, start } = movedDepths(readObject(current.sessionSearchDepth), readObject(current.sessionDepth), current.searchDepth);
      const ops = [
        { op: 'set', path: ['depthMoved'], value: true },
        { op: 'set', path: ['sessionDepth'], value: JSON.stringify(depths) },
        { op: 'set', path: ['sessionSearchDepth'], value: '{}' },
      ];
      if (start !== current.searchDepth) ops.push({ op: 'set', path: ['searchDepth'], value: start });
      return ops;
    });
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
  /**
   * Item 4A, stage 4: Plain chat starts with the Cowork mode's per-mode choices, once (lib/plain.js); a choice made for
   * it afterwards stays.
   */
  let plainAddDone = false;
  async function addPlain() {
    if (plainAddDone || plain(config.plainAdded) === true) return;
    const settings = ctx.get('settings');
    if (!settings) return;
    plainAddDone = true;
    const ops = plainAddOps({ trimModes: plain(config.trimModes), skillsOff: plain(config.skillsOff), toolAccess: plain(config.toolAccess) });
    try {
      await settings.mutate('modes', ops);
    } catch (error) {
      plainAddDone = false;
      throw error;
    }
    if (ops.length > 1) ctx.logger.info('modes: Plain chat starts with the Cowork mode\'s choices (load tools as needed, skills, Tool access)');
  }
  /**
   * Item 4A, fix round 2: Plain chat also gets Cowork's other per-mode choices, once (lib/plain.js plainCarryOps): its
   * starting values, its Mission tools, Mission's work loop tab, and the Sampling presets and Agent swarm choices per
   * mode. Only where Cowork has one and Plain chat none; the Cowork entries stay. Another add-on's write that fails is
   * tried again at the next start (the copy is only made where Plain chat has none, so a second run changes nothing).
   */
  let plainCarryDone = false;
  async function carryPlain() {
    const doneIn = new Set(plainList(config.plainCarriedIn));
    const pending = CARRY_NAMESPACES.filter((ns) => !doneIn.has(ns));
    if (plainCarryDone || (plain(config.plainCarried) === true && pending.length === 0)) return;
    const settings = ctx.get('settings');
    if (!settings) return;
    plainCarryDone = true;
    const rows = settings.describe?.() ?? [];
    // Only the add-ons that are here now, and not carried yet; one that turns up later is carried at that start.
    const others = {};
    const present = [];
    for (const ns of pending) {
      const row = rows.find((entry) => entry.ns === ns);
      if (row?.value) {
        others[ns] = plain(row.value);
        present.push(ns);
      }
    }
    const own = plain(config.plainCarried) === true ? {} : { modeStart: plain(config.modeStart), longTools: plain(config.longTools) };
    const plan = plainCarryOps(own, others);
    const done = [...doneIn];
    for (const ns of present) {
      const ops = plan.others[ns];
      try {
        if (ops) await settings.mutate(ns, ops);
        done.push(ns);
      } catch (error) {
        ctx.logger.warn(`modes: Plain chat could not take Cowork's ${ns} choice (${error?.message ?? error}); tried again at the next start`);
      }
    }
    const ops = plain(config.plainCarried) === true ? [] : plan.modes;
    if (done.length !== doneIn.size) ops.push({ op: 'set', path: ['plainCarriedIn'], value: JSON.stringify(done) });
    try {
      if (ops.length > 0) await settings.mutate('modes', ops);
    } catch (error) {
      plainCarryDone = false;
      throw error;
    }
    if (plan.modes.length > 1 || Object.keys(plan.others).length > 0) ctx.logger.info('modes: Plain chat starts with the Cowork mode\'s other choices (starting values, Mission tools, work loop, sampling, swarm)');
  }
  /** The other add-ons whose per-mode choices Plain chat takes from Cowork once each (`plainCarriedIn`). */
  const CARRY_NAMESPACES = ['mission', 'sampling-presets', 'agent-swarm'];
  /** @returns {string[]} a stored JSON list. */
  function plainList(value) {
    try {
      const list = JSON.parse(typeof value === 'string' ? value : '[]');
      return Array.isArray(list) ? list.filter((item) => typeof item === 'string') : [];
    } catch {
      return [];
    }
  }
  /**
   * Item 4A, stage 1 (A4): every thread with a recorded mode gets the space of that mode, once (`spacesFilled`). Only
   * `sessionSpaces` is written; the modes, the tab order and every other stored value stay as they are.
   */
  let spacesFillDone = false;
  /** Its write while in flight (pruning waits for it, so it never writes the old value back). */
  let spacesFilling = Promise.resolve();
  async function fillSessionSpaces() {
    // Stage 3a: the switch-over to spaces fills once more with `refresh` (spacesRefreshed), so a thread the tabs moved
    // (Move to, /mode) is in the space where it was last put; from then on a mode change never moves a thread.
    const refresh = spacesLive() && plain(config.spacesRefreshed) !== true;
    if (spacesFillDone || (plain(config.spacesFilled) === true && !refresh)) return spacesFilling;
    const settings = ctx.get('settings');
    if (!settings) return;
    spacesFillDone = true;
    let added = 0;
    let changed = 0;
    // In the same line as the first-message writes (pinStartingMode), so neither writes over the other's entries.
    const writing = pinChain.catch(() => {}).then(async () => {
      // Item 4A, stage 6a (I21): marked threads and threads whose saved folder is Recon's room are never moved, and are
      // added to Recon (an owner's isolated mode keeps its own space).
      const keep = new Set(Object.keys(readObject(config.sessionIsolated)).filter((id) => readObject(config.sessionIsolated)[id] === true));
      for (const id of new Set([...Object.keys(readObject(config.sessionSpaces)), ...Object.keys(readObject(config.sessionModes))])) {
        if (keep.has(id)) continue;
        try {
          const folder = String(ctx.get('agents')?.header?.(id)?.cwd ?? ctx.get('agents')?.get?.(id)?.header?.cwd ?? '');
          if (folder && reconRoomOf(folder)) keep.add(id);
        } catch {
          /* not known: left as it is */
        }
      }
      const isolatedModes = Object.values(readModes(config)).filter((mode) => mode.isolated).map((mode) => mode.id);
      const filled = fillSpaces(readObject(config.sessionModes), readObject(config.sessionSpaces), { refresh, keep, isolatedModes });
      added = filled.added;
      changed = filled.changed;
      const ops = [{ op: 'set', path: ['spacesFilled'], value: true }];
      if (refresh) ops.push({ op: 'set', path: ['spacesRefreshed'], value: true });
      if (added > 0 || changed > 0) ops.push({ op: 'set', path: ['sessionSpaces'], value: JSON.stringify(filled.next) });
      await settings.mutate('modes', ops);
    });
    pinChain = writing.catch(() => {});
    spacesFilling = pinChain;
    try {
      await writing;
    } catch (error) {
      // Tried again at the next start.
      spacesFillDone = false;
      throw error;
    }
    if (added > 0) ctx.logger.info(`modes: ${added} existing thread(s) given the space of their mode (nothing else changed)`);
    if (changed > 0) ctx.logger.info(`modes: spaces are live; ${changed} thread(s) placed in the space where the tabs last put them`);
  }

  // Also a moment after loading, when Settings accepts this add-on's writes, for a start without any conversation opening.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      void moveWebLevels().catch(report);
      void addDataTrim().catch(report);
      void addPlain().catch(report);
      void fillSessionSpaces().catch(report);
    }, 2000);
    timer.unref?.();
    return () => clearTimeout(timer);
  }, 'modes: Web levels move into Depth, Data loads its tools as needed, threads get their space (once each)');

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
      const fields = ['sessionModes', 'sessionWeb', 'sessionWebLevel', 'sessionWebSources', 'sessionResearch', 'sessionSearchDepth', 'sessionDepth', 'sessionLens', 'sessionTools', 'sessionHelpers', 'sessionIsolated', 'sessionToolSets', 'sessionSandboxBase', 'sessionMission', 'sessionSpaces', 'sessionModeChanges'];
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
        await Promise.all([moveWebLevels().catch(() => {}), clearOldWebMarks().catch(() => {}), fillSessionSpaces().catch(() => {})]);
        // Build from the current values (they may have changed while checking); write only the fields
        // that hold a gone id, and drop only those ids.
        await writeFresh((values) => fields.flatMap((field) => {
          const current = readObject(values[field]);
          if (![...gone].some((id) => Object.hasOwn(current, id))) return [];
          const next = { ...current };
          for (const id of gone) delete next[id];
          return [{ op: 'set', path: [field], value: JSON.stringify(next) }];
        }));
        ctx.logger.info(`modes: pruned ${gone.size} stale session entries`);
      }
    } catch (error) {
      report(error);
    }
  }

  /** Mode API for other plugins and the command. */
  let skillsOffChain = Promise.resolve();
  /** Item 4A, stage 6a: what `guardOf` answers when it cannot work it out (fail closed, 2.1). */
  const ERROR_GUARD = Object.freeze({ top: '', space: '', mode: '', sealed: true, sealedBy: '', reconSpace: false, guardedBy: 'unknown', noPrograms: true, homeMode: false, fresh: false, unknownTop: true });
  /**
   * Item 4A, stage 6a (2.1): how a thread (or a helper's thread) is guarded, for the other add-ons. Never throws.
   * `sealed` is for refusals, `reconSpace` for permissions, `guardedBy` for the Devices and Workshop guards.
   */
  function guardOf(id) {
    try {
      const raw = String(id ?? '');
      if (!raw) return ERROR_GUARD;
      const { top, known } = resolveTop(raw);
      const space = known && top ? spaceOfTopRaw(top) : 'unknown';
      const mode = modeOf(raw);
      const sealed = mode?.isolated === true;
      const reconSpace = known && space === 'recon';
      const guardedBy = !known || space === 'unknown' ? 'unknown' : mode?.guardedBy || (space === 'devices' || space === 'workshop' ? space : '');
      return Object.freeze({
        top: known ? top : '',
        space: isSpace(space) ? space : '',
        mode: String(mode?.id ?? ''),
        sealed,
        sealedBy: !known ? '' : reconSpace || mode?.id === 'recon' ? 'recon' : sealed ? 'mode' : '',
        reconSpace,
        guardedBy,
        noPrograms: sealed || Boolean(guardedBy) || refusesPrograms(mode),
        homeMode: GUARDED[space] === mode?.id,
        fresh: known && top ? freshNow(top) : false,
        unknownTop: !known,
      });
    } catch {
      return ERROR_GUARD;
    }
  }
  const modes = {
    /** Item 4A, stage 6a: 2 adds guardOf, topOf, spaces.rules/guestRefuses/pending/ready, `set {space}`, `lockedPreset(id, opts)`. */
    apiVersion: 2,
    /**
     * Preset in this tab (item 7): the preset a new conversation of a tab is locked to, '' for Any. Other add-ons
     * read it; the Cowork sidebar reads the same setting itself when it starts a conversation.
     * @param {string} modeId - the tab.
     * @param {{space?: string, sessionId?: string}} [opts] - item 4A, stage 6a: `sessionId`: the lock that holds for that
     *   thread (its space and mode); `space`: the lock of that space with this mode.
     * @returns {string} the app's preset id ('standard', 'cordis') or ''.
     */
    lockedPreset(modeId, opts = {}) {
      const table = readLocks(plain(config.presetLock));
      try {
        if (typeof opts?.sessionId === 'string' && opts.sessionId) {
          const lock = lockFor(opts.sessionId, modeOf(opts.sessionId), table).lock;
          return lock === 'any' ? '' : LOCK_PRESET[lock] ?? '';
        }
        if (typeof opts?.space === 'string' && isSpace(opts.space)) {
          const lock = lockInSpace(table, opts.space, String(modeId ?? '')).lock;
          return lock === 'any' ? '' : LOCK_PRESET[lock] ?? '';
        }
      } catch {
        // as before
      }
      return lockedPresetOf(table, String(modeId ?? ''));
    },
    /** Item 4A, stage 6a (2.1): see guardOf above. */
    guardOf(id) {
      return guardOf(id);
    },
    /**
     * Item 4A, stage 6a (2.1): the thread an agent works for: the id itself for a thread or a closed id; for a helper the
     * highest parent id any header names (also when that agent is not loaded); '' when no header names a parent.
     * @param {string} id
     * @returns {string}
     */
    topOf(id) {
      try {
        const found = resolveTop(String(id ?? ''));
        return found.known ? found.top : '';
      } catch {
        return '';
      }
    },
    /**
     * What the preset menu's (i) shows for a conversation (as PRESET_PATH answers), or each tab's choice without one.
     * @param {string} [sessionId] - the conversation.
     * @returns {Promise<object>} the view.
     */
    presetView(sessionId, locale) {
      return presetView(typeof sessionId === 'string' ? sessionId : '', 'en');
    },
    /**
     * What Tool access knows about a tool, for Mission's rule on what the assistant may do while a Mission is
     * paused (Mission stage E: "Talk and look things up" allows only sorted tools of low tier that read or search).
     * @param {string} name - the tool's raw name.
     * @returns {{group: string, tier: number, sorted: boolean} | undefined} its group and tier; undefined if it cannot be read.
     */
    toolKind(name) {
      try {
        const entry = classify(String(name ?? ''));
        return Object.freeze({ group: entry.group, tier: entry.tier, sorted: entry.sorted === true });
      } catch {
        return undefined;
      }
    },
    /**
     * Item 4A, stage 1: spaces underneath. Read only; nothing on screen uses them yet (lib/spaces.js).
     * `list()`: the five spaces with `available` and `shown`; `of(sessionId)`: a thread's space (a helper asks for its
     * thread); `modesIn(spaceId)`: the modes offered there, a greyed one waiting for its space's own rules; `ofMode(id)`.
     */
    spaces: Object.freeze({
      /**
       * Stage 6a leftovers: the five spaces' shown names (one copy for every add-on). English for every language.
       * @param {string} [lang] - accepted and ignored: Plus is English only.
       * @returns {Readonly<Record<string, string>>} space id -> name.
       */
      names(lang = 'en') {
        return SPACE_NAMES.en;
      },
      list(spaceSettings = readObject(config.spaceSettings)) {
        let addons = [];
        try {
          // Owner's answer (22 Nov): Tuner Plus counts only while it is switched on (an older one without isOn: when there).
          const tuning = ctx.get('tuning');
          addons = tuning && (typeof tuning.isOn !== 'function' || tuning.isOn() === true) ? ['tuning'] : [];
        } catch {
          addons = [];
        }
        return spacesNow({ modeIds: Object.keys(readModes(config)), addons, spaceSettings });
      },
      of(sessionId) {
        // Item 4A, stage 6a (I18, LEAK 13): the same reader as modeOf; '' for a helper with no known thread (callers use
        // guardOf for safety). The display fallback below only when the seam gives nothing.
        const found = resolveTop(String(sessionId ?? ''));
        if (!found.known && found.top) return '';
        const top = found.top;
        const raw = top ? spaceOfTopRaw(top) : '';
        if (isSpace(raw)) return raw;
        if (raw === 'unknown') return '';
        // Item 4A, stage 2: a new draft is in the space it was opened in, until its first message records it. Fix round:
        // else its recorded space, else its folder's (never the space of a stale `defaultMode`); Recon's room only Recon.
        if (spacesLive() && freshNow(top)) return draftSpaceOf(top);
        const stored = overlay.get(top) ?? readTable(config.sessionModes)[top];
        let mode = stored;
        if (typeof mode !== 'string') {
          try {
            mode = modeOf(top).id;
          } catch {
            mode = undefined;
          }
        }
        return spaceOfThread(top, { sessionSpaces: readObject(config.sessionSpaces), sessionModes: typeof mode === 'string' ? { [top]: mode } : {} });
      },
      modesIn(spaceId) {
        return offeredIn(spaceId);
      },
      /**
       * Item 4A, stage 6a (2.1): the space rules other add-ons read (the guarded spaces, what a guest is refused, the
       * stores Recon never writes to).
       */
      rules() {
        return SPACE_RULES;
      },
      /**
       * Item 4A, stage 6a (2.3): the one test whether a guest in Devices or Workshop is refused a tool. Stage 6b: `opts`
       * `{space, mission}`; no space counts as the 'unknown' guard (schedules refused, Revision 2 L1).
       */
      guestRefuses(name, opts = {}) {
        try {
          return guestRefuses(name, opts && typeof opts === 'object' ? opts : {});
        } catch {
          return true;
        }
      },
      /** Item 4A, stage 6a: the spaces recorded in memory and not yet written (`{ threadId: space }`; the sidebar lists them). */
      pending() {
        return Object.freeze(Object.fromEntries(spaceOverlay));
      },
      /** Item 4A, stage 6a (I25): whether each guarded space's guard is ready. */
      ready() {
        const ready = guardReady();
        return Object.freeze({ devices: ready.devices === true, recon: ready.recon === true, workshop: ready.workshop === true });
      },
      ofMode(modeId) {
        return spaceOfMode(modeId);
      },
      /**
       * Item 4A, stage 6b (3.1, J11): mark an existing thread so its next scheduled turn is rejected (nothing runs): a
       * session target whose guarded space cannot take the run now. Cleared by a user message in it, or after 24 h.
       * @param {string} id - the thread (never a helper).
       * @param {{space: string, reason: string}} info - its space, and why (a short phrase for the chat box line).
       * @returns {boolean} false for a helper or an unknown id.
       */
      holdRun(id, info = {}) {
        try {
          const top = String(id ?? '');
          if (!top || !ctx.get('agents')?.get?.(top) || topOf(top) !== top) return false;
          const space = isSpace(info?.space) ? info.space : spaceOfTopRaw(top);
          heldRuns.set(top, { space, kind: 'other', mode: '', text: String(info?.reason ?? '').slice(0, 300), at: Date.now() });
          if (heldRuns.size > 500) heldRuns.delete(heldRuns.keys().next().value);
          bump();
          return true;
        } catch {
          return false;
        }
      },
      /**
       * Item 4A, stage 6b: a thread's held run (`{space, reason}`), or null.
       * @param {string} id - the thread or one of its helpers.
       */
      held(id) {
        try {
          const top = topOf(String(id ?? '')) || String(id ?? '');
          const found = heldRunOf(top);
          return found ? Object.freeze({ space: found.space, reason: heldReasonText(found, 'en') }) : null;
        } catch {
          return null;
        }
      },
      /**
       * Item 4A, stage 6b (J5, display only): where a scheduled thread opens in a folder (the rule of draftSpaceOf for a
       * scheduled thread, without an agent): Recon's room gives `{space: 'recon', mode: ''}` (never shown as a run place).
       * @param {string} cwd - the automation's folder ('' for none).
       * @returns {Readonly<{space: string, mode: string}>}
       */
      scheduledPlace(cwd) {
        const folder = typeof cwd === 'string' ? cwd : '';
        if (folder && reconRoomOf(folder)) return Object.freeze({ space: 'recon', mode: '' });
        const all = readModes(config);
        const mode = scheduledModeId(all, plain(config.scheduledMode)) ?? '';
        let space = guessSpace(folder ? { path: folder } : null);
        if (mode && !offeredIn(space).some((row) => row.id === mode)) space = spaceOfMode(mode);
        return Object.freeze({ space, mode });
      },
      /**
       * Item 4A, stage 6b (Revision 2 L4): a task that opens new threads which must stay in Devices or Workshop. Its fresh
       * threads that nobody placed there by their first step are held, also when Automations is off.
       * @param {string} taskId - the automation.
       * @param {string} space - 'devices' or 'workshop'.
       * @returns {boolean} whether it was noted.
       */
      noteGuestRun(taskId, space, mode) {
        try {
          return noteGuestRun(taskId, space, mode);
        } catch {
          return false;
        }
      },
      /**
       * Final fix round: the mode a new thread in a space starts in (Settings → Spaces, then the built-in table), for
       * other add-ons that start threads (Split Plus's Add pane).
       * @param {string} spaceId - the space.
       * @returns {string} the mode id ('' when the space offers none).
       */
      startOf(spaceId) {
        const space = String(spaceId ?? '');
        const offered = offeredIn(space);
        return draftStartMode({ space, offered, spaceSettings: readObject(config.spaceSettings) }) ?? '';
      },
      /** Item 4A: whether spaces are live (stages 2 to 5 read this one switch; lib/spaces.js spacesLive). */
      live() {
        return spacesLive();
      },
      /**
       * Item 4A, stage 2: what the chat box's Mode list shows for a thread.
       * @param {string} sessionId - the thread.
       * @param {string} [lang] - the page's language (ignored: Plus is English only) (the one-line descriptions and a greyed mode's reason).
       * @returns {object} `{live, shown, space, current, fresh, claimed, modes, changes}`.
       */
      view(sessionId, lang = 'en', opts = {}) {
        return modeView(String(sessionId ?? ''), lang, { windowSpace: typeof opts?.windowSpace === 'string' ? opts.windowSpace : '', page: opts?.page === true });
      },
      /**
       * Item 4A, stage 6b (C5): the language the thread's page last showed its Mode list in: 'en', or '' when no page
       * asked yet (Plus is English only, so it is never 'zh' now). dsh-engines says its sentences in it. Never throws.
       * @param {string} sessionId - a thread or a helper of it.
       * @returns {'en' | ''}
       */
      pageLang(sessionId) {
        try {
          return pageLangs.get(topOf(String(sessionId ?? ''))) ?? '';
        } catch {
          return '';
        }
      },
      /**
       * Item 4A, stage 6b (J3): the chat box put the refused message back (or the owner pressed Put back): its text is
       * deleted. Only the thread's own id with the id the view gave.
       * @returns {boolean} whether it was that thread's kept text.
       */
      engineHeldTaken(sessionId, id) {
        const raw = String(sessionId ?? '');
        if (!raw || topOf(raw) !== raw) return false;
        return engineHeldText.take(raw, String(id ?? ''));
      },
      /**
       * Item 4A, stage 2: a pick in the Mode list (or /mode). Only a mode ticked for the thread's space; a thread never
       * changes space. Before the first message the pick is a claim, so it stands at the first message.
       * @returns {Promise<void>} throws a plain sentence when refused.
       */
      pick(sessionId, modeId, { lang = 'en' } = {}) {
        return pickMode(String(sessionId ?? ''), String(modeId ?? ''), lang);
      },
      /**
       * Item 4A, stage 2: a new draft opened in a space is claimed with that space's start mode at once (the mode it has
       * stays when the space offers it). Nothing happens to a thread that has run, or a draft another add-on claimed.
       * @param {string} sessionId - the draft.
       * @param {{space?: string, tab?: string}} where - the window's space; or the tab it was opened from (stage 2).
       * @returns {Promise<{claimed: boolean, mode?: string, space?: string}>}
       */
      startDraft(sessionId, where = {}) {
        return startDraft(String(sessionId ?? ''), where);
      },
      /**
       * Item 4A, stage 3a: threads moved to another space (the sidebar's "Move to <space>"). Each keeps its mode when the
       * new space offers it, else it gets the space's start mode, from its next message. A sealed thread never moves and
       * nothing moves into Recon: a plain sentence says so, and nothing is written.
       * @param {string[]} sessionIds - the threads.
       * @param {string} spaceId - where to.
       * @returns {Promise<{moved: number, changed: number}>} `changed`: how many got another mode.
       */
      move(sessionIds, spaceId, { lang = 'en' } = {}) {
        return moveToSpace(Array.isArray(sessionIds) ? sessionIds : [sessionIds], String(spaceId ?? ''), lang);
      },
      /**
       * Item 4A, stage 5: what Settings → Spaces and the ticks on Settings → Modes show: the five space cards and every
       * mode with its description and its five ticks.
       * @param {string} [lang] - the page's language (ignored: Plus is English only).
       * @returns {{live: boolean, cards: object[], modes: object[]}}
       */
      page(lang = 'en') {
        return settingsPage('en');
      },
      /**
       * Item 4A, stage 5: one tick on Settings → Modes (`modeSpaces`). Refused with a sentence for a guarded mode, a guarded
       * space (until stage 6a), or the last mode of a space; nothing is written then.
       * @returns {Promise<object>} the page, as `page()`.
       */
      setTick(modeId, spaceId, on, { lang = 'en' } = {}) {
        return writeTick(String(modeId ?? ''), String(spaceId ?? ''), on === true, 'en');
      },
      /**
       * Item 4A, stage 5: a space's own settings on Settings → Spaces (`spaceSettings`): `{shown}` or `{startMode}`.
       * @returns {Promise<object>} the page, as `page()`.
       */
      setSpace(spaceId, patch, { lang = 'en' } = {}) {
        return writeSpace(String(spaceId ?? ''), patch && typeof patch === 'object' ? patch : {}, 'en');
      },
      /**
       * Item 4A, stage 5: a mode's own one-line description (`modeDescriptions`); '' gives the usual line back.
       * @returns {Promise<object>} the page, as `page()`.
       */
      describe(modeId, text, { lang = 'en' } = {}) {
        return writeDescription(String(modeId ?? ''), String(text ?? ''), 'en');
      },
      /**
       * Item 4A, stage 6a: Settings → Modes → Spaces: `{sealedExtra: string[]}` (extra tools a mode keeps in Recon, only the
       * Library tools) and `{gridInGuarded: boolean}` (Tool access Off also applies in Devices and Workshop).
       * @returns {Promise<object>} the page, as `page()`.
       */
      setRules(patch, { lang = 'en' } = {}) {
        return writeRules(patch && typeof patch === 'object' ? patch : {}, 'en');
      },
    }),
    /**
     * @param {string} [lang] - stage 6a leftovers: the page's language (ignored now: Plus is English only). `label` and
     *   `name` are the mode's stored name.
     * @returns {Array<{id: string, label: string, name: string, isolated: boolean}>} the available modes (`isolated`: a sealed tab such as Recon).
     */
    list(lang) {
      const all = Object.values(readModes(config));
      // Item 6: `tab` says whether the mode has a sidebar tab (the Cowork sidebar shows the first few modes and every
      // add-on's mode); a mode without one is reached only with /mode. Without the sidebar every mode counts. Reading
      // the sidebar's settings is not free, so the answer is kept for 2 s (other add-ons ask often).
      const now = Date.now();
      if (now - shownCache.at > 2000) {
        let shown;
        try {
          shown = ctx.get('settings')?.describe?.().some((entry) => entry.ns === 'cowork-shell') ? new Set(sidebarTabs(all, shellTabCount(), shellTabOrder()).map((mode) => mode.id)) : undefined;
        } catch {
          shown = undefined;
        }
        shownCache.at = now;
        shownCache.shown = shown;
      }
      const shown = shownCache.shown;
      const shownLang = 'en';
      return all.map((mode) => Object.freeze({ id: mode.id, label: lang === undefined ? mode.label : modeName(mode, shownLang), name: modeName(mode, shownLang), isolated: mode.isolated === true, tab: shown ? shown.has(mode.id) || mode.extra === true || (mode.added === true && spacesLive()) : true }));
    },
    /**
     * Stage 6a leftovers: a mode's shown name (its stored name; Plus is English only). An unknown id comes back as it is.
     * @param {string} id - the mode id.
     * @param {string} [lang] - the page's language (ignored: Plus is English only).
     * @returns {string}
     */
    modeName(id, lang = 'en') {
      const key = String(id ?? '');
      const found = Object.hasOwn(readModes(config), key) ? readModes(config)[key] : undefined;
      return found ? modeName(found, 'en') : key;
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
      if (!readModes(config)[id]) throw new Error(`There is no mode "${id}".`);
      if (readModes(config)[id].isolated === true) throw new Error('A sealed mode gets no skill list at all.');
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
     * Stage 6b (3.1): `anyTick` (Chat or Code only, a scheduled claim): run there also when the mode is no longer ticked;
     * `hold` (a scheduled claim): on any refusal the thread is recorded in that space and held (J11), and the error has
     * `held: true`. Both are ignored outside a claim of a scheduled thread that has not run (Revision 2 L11, G6).
     * @param {{claim?: boolean, settle?: boolean, space?: string, anyTick?: boolean, hold?: boolean}} [options] - `claim`: for a conversation that has not run a turn yet,
     *   the move stands over the selected tab and the scheduled starting mode (a Finance brief). `settle`: wait (at most
     *   10 s) until the new mode is applied, its tier included, when the conversation is idle.
     * @returns {Promise<void>}
     */
    async set(sessionId, modeId, options = {}) {
      const asked = options?.space;
      // Item 4A, stage 6b (3.1, Revision 2 L11): `anyTick` is for Automations' stored Chat or Code place only; a guarded
      // space never (a programming error, in English).
      if (options?.anyTick === true && isSpace(asked) && asked !== 'chat' && asked !== 'code') throw Object.assign(new Error('ANY_TICK_GUARDED: anyTick is only for the Chat and Code spaces.'), { code: 'ANY_TICK_GUARDED' });
      const agent = ctx.get('agents')?.get(sessionId);
      // Stage 6b (J11, G6): `hold` and `anyTick` count only for a claim of a scheduled thread that has not run (else ignored).
      const schedClaim = options?.claim === true && Boolean(agent) && scheduledClaimable(sessionId) && freshNow(sessionId) && isTopLevel(agent);
      const holding = options?.hold === true && schedClaim && isSpace(asked);
      const anyTick = options?.anyTick === true && schedClaim && (asked === 'chat' || asked === 'code');
      // Plus is English only: `options.lang` is accepted and ignored.
      const lang = 'en';
      /**
       * Stage 6b (J11): a refused held claim records the thread in its space and marks it held, synchronously, before the
       * throw; its steps are then rejected until a user message arrives. Without `hold`: the throw alone, as before.
       */
      const refuse = (error, kind = 'other') => {
        if (holding) {
          try {
            draftSpaces.set(sessionId, asked);
            if (isGuarded(asked)) void recordDraftSpace(sessionId, asked).catch(report);
            heldRuns.set(sessionId, { space: asked, kind, mode: modeId, text: '', at: Date.now() });
            if (heldRuns.size > 500) heldRuns.delete(heldRuns.keys().next().value);
            bump();
          } catch (inner) {
            report(inner);
          }
          error.held = true;
        }
        return error;
      };
      const target = readModes(config)[modeId];
      if (!target) throw refuse(new Error(`modes: unknown mode "${modeId}"`), 'mode');
      if (!agent) throw new Error(`modes: unknown session "${sessionId}"`);
      // Item 4A, stage 6a (I23): a claim may name the space; the mode must be offered there (ticked, not greyed); a thread
      // that has run never changes space; Recon only for a draft in its room.
      let undoDraft;
      if (asked !== undefined) {
        if (!isSpace(asked)) throw new Error(`There is no space "${String(asked).slice(0, 40)}".`);
        // A thread that has run never changes space.
        const now = spaceOfTopRaw(topOf(sessionId));
        if (!(freshNow(sessionId) && isTopLevel(agent)) && now !== asked) throw new Error(spaceText('spaceFixed', lang, { space: SPACE_NAMES[lang][now] ?? now }));
        if (isGuarded(asked) && guardReady()[asked] !== true && holding) throw refuse(new Error(heldReasonText({ space: asked, kind: 'guard', mode: modeId }, lang)), 'guard');
        const row = offeredIn(asked, lang).find((one) => one.id === modeId);
        // Stage 6b (J8): a stored Chat or Code place runs there also when its mode is no longer ticked (the mode exists).
        if (!anyTick && (!row || row.greyed)) throw refuse(new Error(modePickRefusal({ space: asked, modeId, modeLabel: target.label, offered: offeredIn(asked, lang), known: true, lang })), isGuarded(asked) && guardReady()[asked] !== true ? 'guard' : 'mode');
        if (freshNow(sessionId) && isTopLevel(agent)) {
          if (asked === 'recon' && roomSays(sessionId) === false) throw refuse(new Error(spaceText('reconRoomOnly', lang)));
          const before = draftSpaces.get(sessionId);
          draftSpaces.set(sessionId, asked);
          if (anyTick) anyTicked.add(sessionId);
          // A held thread keeps its space entry (J11): never undone when `hold` is set.
          undoDraft = holding ? undefined : () => (before === undefined ? draftSpaces.delete(sessionId) : draftSpaces.set(sessionId, before));
        }
      }
      try {
        // No way in and no way out: what an isolated conversation has read must not meet other tools. Stage 6a (I11): a
        // sealed thread in Recon may switch to another mode Recon offers; it stays sealed.
        const space = asked ?? spaceOfTopRaw(topOf(sessionId));
        const targetCopy = spaceCopy(target, space, { ready: guardReady(), oldGuard: oldGuards(), ranBefore: !freshNow(sessionId) });
        const withinSealed = space === 'recon' && offeredIn('recon').some((row) => row.id === modeId && !row.greyed);
        const refused = modeChangeRefusal({ wasIsolated: wasIsolated(sessionId), current: modeOf(sessionId).id, target: modeId, targetIsolated: targetCopy?.isolated === true, fresh: freshNow(sessionId), withinSealed });
        if (refused) throw new Error(refused);
        // Item 4A fix round: a new thread in Recon's room only takes a mode Recon offers (stage 6a: sealed, any of them).
        if (spacesLive() && freshNow(sessionId) && isTopLevel(agent) && inReconRoom(sessionId) && !offeredIn('recon').some((row) => row.id === modeId && !row.greyed)) throw new Error(spaceText('roomOnlySealed', lang));
      } catch (error) {
        undoDraft?.();
        throw refuse(error);
      }
      // A guarded claim is recorded at once (I3).
      if (asked !== undefined && isGuarded(asked) && freshNow(sessionId) && isTopLevel(agent)) void recordDraftSpace(sessionId, asked).catch(report);
      // Item 4A, stage 2: a change after the first message leaves a quiet line in the thread ("Mode changed to Research").
      const before = modeOf(sessionId).id;
      const noted = spacesLive() && !freshNow(sessionId) && before !== modeId && isTopLevel(agent) ? { turn: turnOfPhase(agent.phase), from: before, to: modeId, at: Date.now() } : null;
      if (options?.claim === true && freshNow(sessionId)) claimed.add(sessionId);
      overlay.set(sessionId, modeId);
      // Applied now, while the conversation may still be idle, so its first turn gets the mode's tools.
      reconcile(agent);
      const settings = ctx.get('settings');
      if (settings) {
        try {
          await writeFresh((current) => {
            const next = { ...readObject(current.sessionModes), [sessionId]: modeId };
            const ops = [{ op: 'set', path: ['sessionModes'], value: JSON.stringify(next) }];
            if (noted) {
              const changes = readObject(current.sessionModeChanges);
              ops.push({ op: 'set', path: ['sessionModeChanges'], value: JSON.stringify({ ...changes, [sessionId]: noteModeChange(changes[sessionId], noted) }) });
            }
            return ops;
          });
          overlay.delete(sessionId);
        } catch (error) {
          ctx.logger.warn(`modes: choice for ${sessionId} not persisted (${error?.message ?? error}); kept in memory`);
        }
      }
      reconcile(agent);
      // Item 4A, fix round 2: a draft that changes mode before its first message takes the new mode's starting values
      // (what you set by hand on it stays). Not an Automation's thread: its task decides.
      // Final fix round: also a draft the app made anew for the same mode (the Cowork switch picks a folder: a new draft is
      // claimed) and never seeded gets its mode's starting values.
      if ((before !== modeId || !seeded.has(sessionId)) && freshNow(sessionId) && isTopLevel(agent) && !scheduled.has(sessionId)) await reseedStart(sessionId, target, before);
      // A new chat moved into a locked tab (a Split Plus pane, a Creator Plus claim) gets that tab's preset too.
      if (freshNow(sessionId)) holdPresetSoon(sessionId, options?.claim === true ? 'claim' : 'tab');
      // Item 6: `settle` waits (at most 10 s) until the new mode's tools, sandbox and tier are applied, so a scheduled
      // chat claimed before its message arrives runs its first step with the new tab's model.
      if (options?.settle === true && boundaryRuns.has(sessionId)) {
        let timer;
        const waited = new Promise((resolve) => {
          timer = setTimeout(resolve, SCHEDULED_WAIT_MS);
          timer.unref?.();
        });
        await Promise.race([boundaryRuns.get(sessionId), waited]);
        clearTimeout(timer);
      }
    },
  };
  ctx.effect(() => ctx.provide('modes', Object.freeze(modes)), 'modes service');

  // ---- Item 4A, stage 2: the Mode list in the chat box ------------------------------------------------------------
  /** @returns {object} the stored modes' own fields (a description, from stage 5's editor), by id. */
  function rawModes() {
    return { ...readObject(config.extraModes), ...readObject(config.modes) };
  }
  /** The modes the Mode list knows, with a stored description where there is one. */
  function listedModes(lang = 'en') {
    const raw = rawModes();
    const own = readObject(config.modeDescriptions);
    return Object.values(readModes(config)).map((mode) => ({ id: mode.id, label: modeName(mode, lang), description: typeof own[mode.id] === 'string' && own[mode.id].trim() ? own[mode.id] : raw[mode.id]?.description }));
  }
  /** Fix round 2: a draft -> the last /mode reply ({id, text, kind, at}); the app shows no command output on a draft. */
  const draftReplies = new Map();
  /** How long the chat box may still pick up a /mode reply. */
  const REPLY_MS = 60_000;
  function replyOf(top) {
    const reply = top ? draftReplies.get(top) : undefined;
    if (!reply) return null;
    if (Date.now() - reply.at > REPLY_MS || !freshNow(top)) {
      draftReplies.delete(top);
      return null;
    }
    return reply;
  }
  function modeView(sessionId, lang, { windowSpace = '', page = false } = {}) {
    const live = spacesLive();
    const top = topOf(sessionId);
    // Stage 6b (C5): the page's language, for dsh-engines' sentences in that thread.
    if (page && top) {
      pageLangs.delete(top);
      pageLangs.set(top, 'en');
      if (pageLangs.size > 500) pageLangs.delete(pageLangs.keys().next().value);
    }
    const heldDraft = top ? takeEngineHeldDraft(sessionId, top, windowSpace) : null;
    const space = modes.spaces.of(top);
    let current;
    try {
      current = modeOf(top).id;
    } catch {
      current = undefined;
    }
    const isFresh = top ? freshNow(top) : false;
    const changes = readObject(config.sessionModeChanges)[top];
    const ready = guardReady();
    const list = modeList(space, listedModes(lang), readObject(config.modeSpaces), lang, { ready, lost: lostFor });
    // Item 4A, stage 6a (2.1, item 27): the effective mode (its space's copy), and why a thread is held without tools.
    let effectiveMode;
    try {
      effectiveMode = top ? modeOf(top) : undefined;
    } catch {
      effectiveMode = undefined;
    }
    const rawSpace = top ? spaceOfTopRaw(top) : '';
    const chosenId = top ? overlay.get(top) ?? readTable(config.sessionModes)[top] : undefined;
    const held = (() => {
      if (!effectiveMode || effectiveMode.id !== LOCKED_MODE.id || !isGuarded(rawSpace)) return null;
      const state = ready[rawSpace];
      if (state === true) return null;
      const addon = GUARDED_ADDON[GUARDED[rawSpace]] ?? rawSpace;
      // Fix round (6a review): the add-on in the page's language; "new thread" only for one that has not run.
      const reason = state === 'old' || state === 'plugin' ? state : 'off';
      return { space: rawSpace, addon, reason, text: heldText(rawSpace, reason, { ran: !isFresh, lang }), mode: typeof chosenId === 'string' ? chosenId : '' };
    })();
    const effective = effectiveMode ? {
      isolated: effectiveMode.isolated === true,
      sealedBy: effectiveMode.sealedBy ?? '',
      guardedBy: effectiveMode.guardedBy ?? '',
      tools: Array.isArray(effectiveMode.tools) ? [...effectiveMode.tools] : effectiveMode.tools,
      sandbox: effectiveMode.sandbox,
      held,
    } : null;
    // Fix round: the current mode's own name and line, also when its space does not offer it (a thread keeps a mode
    // unticked later), so the button never shows an inner id.
    const known = listedModes(lang).find((mode) => mode.id === current);
    const own = known ? modeBlurb(known.id, lang, known.description) : '';
    // A guarded space whose own mode is gone (its add-on's "Offer" switch off): which add-on to switch on.
    const home = GUARDED[space];
    const needs = home && !readModes(config)[home] ? { space, section: home, addon: GUARDED_ADDON[home] ?? home } : null;
    return {
      live,
      // The list shows under the chat box with the Cowork sidebar (without it, the former selector stays as it was).
      shown: live && tabsDecide(),
      space,
      current,
      fresh: isFresh,
      claimed: claimed.has(top),
      // Stage 6a: sealed by its mark, or by being in Recon (any mode).
      sealed: wasIsolated(top) || effective?.sealedBy === 'recon',
      effective,
      // Fix round 2: the thread's folder is Recon's room (the chat box then follows it to Recon and says why).
      room: top ? inReconRoom(top) : false,
      // Fix round 2: the reply to /mode on a draft, which the app does not show there (the chat box shows it once).
      reply: replyOf(top),
      // Fix round (6a review): a thread its guarded space holds shows the mode it chose, else "No tools for now"; never
      // Recon's "Sealed".
      currentLabel: held ? listedModes(lang).find((mode) => mode.id === held.mode)?.label ?? spaceText('heldLabel', lang) : known?.label ?? (current === LOCKED_MODE.id || current === 'isolated-late' ? 'Sealed' : current ?? ''),
      // Fix round (6a review, 2.7 SPACE_WAIT): its first message ran before its space was known (shown once).
      spaceWait: top ? takeSpaceWait(top, lang) : '',
      engineHeld: top ? takeEngineHeld(top, lang, Boolean(heldDraft)) : '',
      // Stage 7 (6b lab leftover): when that line was set, so the chat box hides it at once when a message goes out and
      // shows it again only for a newer refusal.
      engineHeldAt: top && engineHeld.has(top) ? engineHeld.get(top) : 0,
      // Stage 6b (J11): an automation's run held in this thread (nothing ran).
      runHeld: top && heldRunOf(top) ? runHeldLine(heldRunOf(top), lang) : '',
      // Stage 6b (J3): the refused message's text, for this thread's own chat box only; the line it shows when the box is
      // busy (or the app gives no setDraft), with a Put back button.
      engineHeldDraft: heldDraft,
      engineHeldKept: heldDraft ? spaceText('engineHeldKept', lang) : '',
      currentDesc: own,
      currentOffered: list.some((mode) => mode.id === current && !mode.greyed),
      needs,
      modes: list,
      // Stage 3a: the five spaces with `available` and `shown` (the Cowork sidebar draws its space buttons from these).
      spaces: modes.spaces.list(),
      changes: Array.isArray(changes) ? changes : [],
    };
  }
  async function pickMode(sessionId, modeId, lang) {
    const top = topOf(sessionId);
    if (!ctx.get('agents')?.get(top)) throw new Error('This thread is not open. Open it again and try once more.');
    const all = readModes(config);
    const space = modes.spaces.of(top);
    const offered = offeredIn(space, lang);
    const current = modeOf(top).id;
    if (modeId === current) return;
    const isFresh = freshNow(top);
    // Item 4A, stage 6a (I11): the target's copy for this space decides whether it is sealed; within Recon a switch stays sealed.
    const targetCopy = all[modeId] ? spaceCopy(all[modeId], space, { ready: guardReady(), oldGuard: oldGuards(), ranBefore: !isFresh }) : undefined;
    const withinSealed = space === 'recon' && offered.some((row) => row.id === modeId && !row.greyed);
    const sealedRefusal = all[modeId] ? modeChangeRefusal({ wasIsolated: wasIsolated(top), current, target: modeId, targetIsolated: targetCopy?.isolated === true, fresh: isFresh, withinSealed }) : '';
    const refused = modePickRefusal({ space, modeId, modeLabel: all[modeId]?.label, offered, known: Boolean(all[modeId]), sealedRefusal, lang });
    if (refused) throw new Error(refused);
    // A draft keeps its space: the pick is recorded in it at the first message, not in the space the mode would give.
    // Stage 6a: set only once the checks passed, and undone when `set` refuses.
    const placed = isFresh && !draftSpaces.has(top);
    if (placed) draftSpaces.set(top, space);
    try {
      await modes.set(top, modeId, isFresh ? { claim: true } : {});
    } catch (error) {
      if (placed) draftSpaces.delete(top);
      throw error;
    }
    if (isFresh) {
      pickedModes.set(top, modeId);
      autoStarted.delete(top);
    }
  }
  /** Fix round (6a review): whether a thread has a Mission that has not ended (Mission says; false without Mission). */
  function missionLive(id) {
    try {
      const mission = ctx.get('mission');
      if (!mission) return false;
      return Boolean(mission.runOf?.(id)) || mission.isRunning?.(id) === true || Boolean(mission.longRun?.(id));
    } catch {
      // Mission cannot say: as if one ran (a move into Devices or Workshop can wait).
      return true;
    }
  }
  async function moveToSpace(sessionIds, spaceId, lang) {
    const ids = [...new Set(sessionIds.map((id) => topOf(String(id ?? ''))).filter(Boolean))].slice(0, 500);
    if (ids.length === 0) throw new Error('No thread was named.');
    const all = readModes(config);
    const shown = modes.spaces.list().filter((row) => row.shown).map((row) => row.id);
    const offered = isSpace(spaceId) ? offeredIn(spaceId, lang) : [];
    const spaceSettings = readObject(config.spaceSettings);
    const plans = [];
    for (const id of ids) {
      let current;
      try {
        current = modeOf(id).id;
      } catch {
        current = readObject(config.sessionModes)[id];
      }
      // Item 4A, stage 6a: sealed by its mark or by its space (C5); a thread that ran programs in this run stays out of
      // Devices and Workshop (I26).
      const plan = spaceMovePlan({ to: spaceId, from: modes.spaces.of(id), current, sealed: wasIsolated(id) || (spaceOfTopRaw(id) === 'recon' && !freshNow(id)), room: inReconRoom(id), ranPrograms: ranPrograms.has(id), missionLive: missionLive(id), shown, offered, spaceSettings, lang });
      // One refusal stops the whole move, before anything is written.
      if (plan.refusal) throw new Error(plan.refusal);
      plans.push({ id, current, ...plan });
    }
    const settings = ctx.get('settings');
    if (!settings) throw new Error('Settings cannot be saved right now. Try again in a moment.');
    // In the same line as the first-message writes and the fill, so none writes over another's entries.
    const writing = pinChain.catch(() => {}).then(async () => {
      const spaces = { ...readObject(config.sessionSpaces) };
      const nextModes = { ...readObject(config.sessionModes) };
      const changes = readObject(config.sessionModeChanges);
      let notes = false;
      for (const plan of plans) {
        spaces[plan.id] = plan.space;
        if (!plan.mode) continue;
        nextModes[plan.id] = plan.mode;
        // A thread that has run gets the quiet line, as any mode change after the first message does.
        const agent = ctx.get('agents')?.get(plan.id);
        if (agent && !freshNow(plan.id) && isTopLevel(agent)) {
          changes[plan.id] = noteModeChange(changes[plan.id], { turn: turnOfPhase(agent.phase), from: plan.current, to: plan.mode, at: Date.now() });
          notes = true;
        }
      }
      const ops = [{ op: 'set', path: ['sessionSpaces'], value: JSON.stringify(spaces) }];
      if (plans.some((plan) => plan.mode)) ops.push({ op: 'set', path: ['sessionModes'], value: JSON.stringify(nextModes) });
      if (notes) ops.push({ op: 'set', path: ['sessionModeChanges'], value: JSON.stringify(changes) });
      await settings.mutate('modes', ops);
      // Fix round (6a review): the move replaces any space still waiting to be written (an earlier failed write), so the
      // stale one neither wins over it nor is written back by a retry.
      for (const plan of plans) {
        spaceOverlay.delete(plan.id);
        const pin = pinQueue.get(plan.id);
        if (pin) {
          pin.space = plan.space;
          pin.spaceForce = true;
        }
      }
    });
    pinChain = writing.catch(() => {});
    await writing;
    // The seam reads the new spaces (I29).
    bump();
    for (const plan of plans) {
      const live = ctx.get('agents')?.get(plan.id);
      if (live && !plan.mode) reconcile(live);
      if (!plan.mode) continue;
      overlay.delete(plan.id);
      const agent = ctx.get('agents')?.get(plan.id);
      if (agent) reconcile(agent);
    }
    return { moved: plans.length, changed: plans.filter((plan) => plan.mode).length };
  }
  // ---- Item 4A, stage 5: Settings → Spaces and the ticks on Settings → Modes ---------------------------------------
  /** `written`: a map just saved, read from here (the stored settings may not show it yet). */
  function settingsPage(lang, written = {}) {
    const all = Object.values(readModes(config)).map((mode) => ({ ...mode, label: modeName(mode, lang) }));
    const raw = rawModes();
    const modeSpaces = written.modeSpaces ?? readObject(config.modeSpaces);
    const descriptions = written.modeDescriptions ?? readObject(config.modeDescriptions);
    const spaceSettings = written.spaceSettings ?? readObject(config.spaceSettings);
    const spaces = modes.spaces.list(spaceSettings);
    const ready = guardReady();
    return {
      live: spacesLive(),
      cards: spaceCards({ spaces, spaceSettings, modes: all, modeSpaces, lang, ready }),
      modes: modeRowsForPage(all.map((mode) => ({ ...mode, description: raw[mode.id]?.description })), { modeSpaces, descriptions, lang, ready, lost: lostFor }),
      // Item 4A, stage 6a: Settings → Modes → Spaces.
      rules: {
        ready,
        // Fix round (6a review): why each guarded space is not ready now, in the page's language (none when all are).
        notReady: GUARDED_SPACES.map((space) => ({ space, text: guardedReason(space, ready, lang) })).filter((row) => row.text),
        sealedExtra: readList(config.sealedExtra).filter((name) => SEALED_EXTRA_CHOICES.includes(name)),
        sealedExtraChoices: [...SEALED_EXTRA_CHOICES],
        gridInGuarded: plain(config.gridInGuarded) !== false,
      },
    };
  }
  /** One write to the Modes settings, in the same line as the other writes of these maps. */
  async function writeModes(ops, lang) {
    const settings = ctx.get('settings');
    if (!settings) throw new Error('Settings cannot be saved right now. Try again in a moment.');
    const writing = pinChain.catch(() => {}).then(() => settings.mutate('modes', ops));
    pinChain = writing.catch(() => {});
    await writing;
  }
  /**
   * Item 4A, stage 6a: what a mode loses in Devices or Workshop (lib/spacerules.js lostIn): in Workshop by Creator Plus's
   * allow-list when it can say (`creatorPlus.allowed()`), else by the guest rule.
   */
  function lostFor(mode, space) {
    const full = readModes(config)[mode?.id] ?? mode;
    return lostIn(full, space, { known: globalToolNames(), workshopAllowed: workshopAllowed() });
  }
  async function writeTick(modeId, spaceId, on, lang) {
    const all = Object.values(readModes(config));
    // Fix round (6a review): the mode by its name in the page's language.
    const found = all.find((mode) => mode.id === modeId);
    const plan = nextModeSpaces({ modeSpaces: readObject(config.modeSpaces), modeId, modeLabel: found ? modeName(found, lang) : undefined, space: spaceId, on, modes: all, lang, ready: guardReady(), lost: lostFor });
    if (plan.refusal) throw new Error(plan.refusal);
    await writeModes([{ op: 'set', path: ['modeSpaces'], value: JSON.stringify(plan.next) }], lang);
    // The row itself shows its warning or note (tick.warn, tick.note): not said a second time above the list.
    return settingsPage(lang, { modeSpaces: plan.next });
  }
  /** Item 4A, stage 6a: Settings → Modes → Spaces: `sealedExtra` (only the Library tools) and `gridInGuarded`. */
  async function writeRules(patch, lang) {
    const ops = [];
    if (Object.hasOwn(patch, 'sealedExtra')) {
      const list = Array.isArray(patch.sealedExtra) ? patch.sealedExtra : [];
      const bad = list.find((name) => !SEALED_EXTRA_CHOICES.includes(name));
      if (bad !== undefined) throw new Error(`"${String(bad).slice(0, 60)}" cannot be kept in Recon. Only these can: ${SEALED_EXTRA_CHOICES.join(', ')}.`);
      ops.push({ op: 'set', path: ['sealedExtra'], value: JSON.stringify([...new Set(list)]) });
    }
    if (Object.hasOwn(patch, 'gridInGuarded')) ops.push({ op: 'set', path: ['gridInGuarded'], value: patch.gridInGuarded !== false });
    if (ops.length > 0) await writeModes(ops, lang);
    bump();
    for (const agent of ctx.get('agents')?.list?.() ?? []) reconcile(agent);
    return settingsPage(lang);
  }
  async function writeSpace(spaceId, patch, lang) {
    const all = Object.values(readModes(config));
    const want = {};
    if (Object.hasOwn(patch, 'shown')) want.shown = patch.shown === true;
    if (Object.hasOwn(patch, 'startMode')) want.startMode = String(patch.startMode ?? '').slice(0, 64);
    const offered = isSpace(spaceId) ? offeredIn(spaceId, lang) : [];
    const startFound = all.find((mode) => mode.id === want.startMode);
    const plan = nextSpaceSettings({ spaceSettings: readObject(config.spaceSettings), space: spaceId, patch: want, offered, modeLabel: startFound ? modeName(startFound, lang) : undefined, lang });
    if (plan.refusal) throw new Error(plan.refusal);
    await writeModes([{ op: 'set', path: ['spaceSettings'], value: JSON.stringify(plan.next) }], lang);
    return settingsPage(lang, { spaceSettings: plan.next });
  }
  async function writeDescription(modeId, text, lang) {
    if (!readModes(config)[modeId]) throw new Error(`There is no mode "${modeId.slice(0, 60)}". Reload the page and try again.`);
    const plan = nextDescriptions(readObject(config.modeDescriptions), modeId, text, lang);
    if (plan.refusal) throw new Error(plan.refusal);
    await writeModes([{ op: 'set', path: ['modeDescriptions'], value: JSON.stringify(plan.next) }], lang);
    return settingsPage(lang, { modeDescriptions: plan.next });
  }

  /**
   * Claim a new draft with the start mode of the space it is shown in. Fix round: a draft whose mode you picked is
   * claimed again when it shows in another space (the app reuses one blank draft per folder): the pick comes back where
   * that space offers it, else the space's start mode; `reset` (a New click) forgets the pick. The space the window
   * names is checked against the folder: Recon's room is Recon only, and Recon takes only a draft in its room. A `tab`
   * is only a hint without a space (the old tab layout): with a space, Settings → Spaces decides.
   * @returns {Promise<{claimed: boolean, mode?: string, space?: string, missing?: boolean}>} `missing`: no such thread yet.
   */
  async function startDraft(sessionId, where = {}) {
    // Item 4A, stage 6a (I3): the first turn of this draft waits (at most CLAIM_WAIT_MS) until this claim is done.
    const top = topOf(sessionId);
    // Fix round (6a review): a claim already in flight for this draft is waited for, so this one sees what it did.
    const before = pendingClaims.get(top);
    const run = (before ? before.catch(() => {}) : Promise.resolve()).then(() => startDraftNow(sessionId, where));
    pendingClaims.set(top, run);
    try {
      return await run;
    } finally {
      if (pendingClaims.get(top) === run) pendingClaims.delete(top);
    }
  }
  /** Item 4A, stage 6a: drafts whose claim (startDraft) is in flight -> its promise. */
  const pendingClaims = new Map();
  async function startDraftNow(sessionId, { space, tab, reset = false, lang = 'en' } = {}) {
    const top = topOf(sessionId);
    const agent = ctx.get('agents')?.get(top);
    if (!spacesLive()) return { claimed: false };
    if (!agent) return { claimed: false, missing: true };
    // Only a new, blank, top-level draft no other add-on has claimed (a Finance brief, a Split Plus pane, an Automation
    // task). A draft the chat box claimed by itself, or one whose mode you picked, may be claimed again.
    const ours = autoStarted.has(top) || pickedModes.has(top);
    const asked = isSpace(space) ? space : spaceOfTab(tab) ?? 'chat';
    // Fix round (6a review): a guarded window asking for a draft another claim holds in another space (another add-on's
    // claim, or one still in flight) is told where it is, so it opens a fresh draft instead of showing that one.
    if (isTopLevel(agent) && freshNow(top) && claimed.has(top) && !ours && isGuarded(asked)) {
      let now;
      try {
        now = draftSpaces.get(top) ?? draftSpaceOf(top);
      } catch {
        now = undefined;
      }
      if (now !== asked) return { claimed: false, keptIn: isSpace(now) ? now : 'chat' };
    }
    if (!isTopLevel(agent) || !freshNow(top) || (claimed.has(top) && !ours) || scheduled.has(top)) return { claimed: false };
    if (reset) pickedModes.delete(top);
    // Fix round 2 (upgrade safety): a draft whose space is recorded in another space and that this run did not claim
    // itself was placed there on purpose: by the one-time fill from a mode another add-on claimed (a Creator Plus saved
    // run an Automation will send to), or by Move to. A restart forgets who claimed it; the record does not. Left alone.
    const recorded = recordedSpaceSafe(top);
    // Item 4A, stage 6a (C6): a draft recorded in a guarded space never leaves it, and a guarded space never takes a draft
    // recorded elsewhere: the window opens a fresh draft instead.
    if (isSpace(recorded) && recorded !== asked && (isGuarded(asked) || isGuarded(recorded)) && !inReconRoom(top)) return { claimed: false, keptIn: recorded };
    if (!ours && isSpace(recorded) && recorded !== asked && !inReconRoom(top) && readObject(config.sessionModes)[top] !== undefined) return { claimed: false };
    // Item 4A, stage 6a (I9): Recon takes only a draft in its room, when Recon can say where the folder is.
    // Integration: the sentence in the window's language (the route passes it).
    if (asked === 'recon' && roomSays(top) === false) throw new Error(spaceText('reconRoomOnly', 'en'));
    const where = roomRule(top, asked) ?? folderSpace(top);
    const offered = offeredIn(where);
    const stored = readObject(config.sessionModes)[top];
    const picked = pickedModes.get(top);
    // A mode the draft only got automatically is not kept: after a restart, one equal to the space's built-in start mode
    // counts as automatic too (stage 5: a changed start mode reaches a reused draft); after a New, none is kept.
    const tableStart = SPACES.find((one) => one.id === where)?.startMode;
    const keepStored = !reset && !autoStarted.has(top) && stored !== tableStart;
    const mode = draftStartMode({ space: where, stored: picked ?? (keepStored ? stored : undefined), tab: isSpace(space) ? undefined : tab, offered, spaceSettings: readObject(config.spaceSettings) });
    if (!mode) {
      // Item 4A, stage 6a (I16): a guarded space that offers nothing now (Workshop without Creator Plus): the draft is in
      // that space and has no tools (never Plain chat).
      if (isGuarded(where)) {
        draftSpaces.set(top, where);
        // Lab re-check fix (6a, problem 6): a reused draft keeps no mode it got elsewhere (Plain chat from an earlier
        // Chat claim): that mode is not offered here, so nobody picked it for this space. Its claim and stored mode go, so
        // the first message records it as held, and it follows the space's home mode once the guard add-on is back.
        const kept = overlay.get(top) ?? stored;
        if (kept !== undefined && !offered.some((row) => row.id === kept)) {
          claimed.delete(top);
          autoStarted.delete(top);
          pickedModes.delete(top);
          overlay.delete(top);
          try {
            await writeFresh((current) => {
              const next = readObject(current.sessionModes);
              if (next[top] === undefined) return [];
              delete next[top];
              return [{ op: 'set', path: ['sessionModes'], value: JSON.stringify(next) }];
            });
          } catch (error) {
            report(error);
          }
          reconcile(agent);
        }
      }
      return { claimed: false };
    }
    // Claimed already, and in the right mode: nothing to do.
    if (claimed.has(top) && mode === (overlay.get(top) ?? stored) && draftSpaces.get(top) === where) return { claimed: false };
    const before = draftSpaces.get(top);
    draftSpaces.set(top, where);
    try {
      await modes.set(top, mode, { claim: true });
    } catch (error) {
      if (before === undefined) draftSpaces.delete(top);
      else draftSpaces.set(top, before);
      throw error;
    }
    // Item 4A, stage 6a (I3, LEAK 10): a guarded space is recorded now, not at the first message.
    if (isGuarded(where)) await recordDraftSpace(top, where).catch(report);
    if (mode !== picked) autoStarted.add(top);
    else autoStarted.delete(top);
    try {
      await settleDraftAccess(top);
    } catch (error) {
      report(error);
    }
    return { claimed: true, mode, space: where };
  }

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
    // Item 6 (the owner's answer of 21 November 2026): Automations' "Scheduling from Recon" switched off takes the
    // assistant's schedule tools out of Recon too, whatever Tool access granted. Without Automations nothing changes.
    reconScheduleOff: () => {
      try {
        return ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'automations')?.value?.scheduleFromRecon === false;
      } catch {
        return false;
      }
    },
    readModes: () => readModes(config),
    // Item 4A, stage 6a: a mode's copy in a space (catalogue per space), without a thread.
    copyIn: (modeId, space) => {
      const mode = readModes(config)[modeId];
      return mode && isSpace(space) ? spaceCopy(mode, space, { ready: guardReady(), oldGuard: oldGuards(), ranBefore: false, reconNet: readModes(config).recon?.tools ?? [], deviceTools: (Array.isArray(readModes(config).bench?.tools) ? readModes(config).bench.tools : []).filter((name) => typeof name === 'string' && name.startsWith('bench_')), roomKnown: true, extra: readList(config.sealedExtra) }) : undefined;
    },
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
    // Nobody is there to answer: an Automation's conversation (also one it re-runs in, and after a restart). A Mission
    // no longer counts here (Mission stage D): its helpers park their requests in the Mission's card (parkable, park),
    // and the conversation itself, while a Mission is paused, has the user there.
    unattended: (top) => scheduled.has(top) || scheduledRun.has(top) || lastMessageFromScheduler(top),
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
  // Fix round (6a review): a conversation Recon wipes (End and wipe) keeps nothing in Tool access: its permissions, its
  // note and its log lines go (Recon's `reconWipe` service: its list now, and each new entry).
  const wipedSeen = new Set();
  function forgetWiped(ids) {
    try {
      const fresh = (Array.isArray(ids) ? ids : [ids]).map((id) => String(id ?? '')).filter((id) => id && !wipedSeen.has(id));
      if (fresh.length === 0) return;
      for (const id of fresh) wipedSeen.add(id);
      if (wipedSeen.size > 2000) wipedSeen.delete(wipedSeen.values().next().value);
      access?.wiped?.(fresh);
    } catch (error) {
      report(error);
    }
  }
  function hookWipe(wipe) {
    if (!wipe) return undefined;
    try {
      forgetWiped(wipe.list?.() ?? []);
      const off = wipe.onChange?.((id) => forgetWiped([id]));
      return typeof off === 'function' ? off : undefined;
    } catch (error) {
      report(error);
      return undefined;
    }
  }
  ctx.inject(['reconWipe'], (inner) => {
    try {
      inner.effect(() => hookWipe(inner.reconWipe) ?? (() => {}), 'modes: Tool access forgets wiped Recon threads');
    } catch (error) {
      report(error);
    }
  });
  // A helper of a running Mission (Mission stage D): its request waits in the Mission's card (mission.parkApproval),
  // and the other helpers carry on. Mission answers through grantParked / denyParked.
  access?.service?.useParking?.({
    parkable: (requester) => {
      try {
        return ctx.get('mission')?.canPark?.(requester) === true;
      } catch {
        return false;
      }
    },
    park: (request) => ctx.get('mission')?.parkApproval?.(request),
  });
  ctx.on('tools/result', (exec, result) => access?.markOutside(exec, result));

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
      // Not in a tab that refuses programs (Devices, Creator Plus, Recon): there the hint would be wrong.
      // Item 4A, stage 6a (I22): not in a guarded space either.
      viaCode: programOnly(ctx.tools, agent) && !refusesProgramsIn(mode, modes.spaces.of(sessionId)) && !FALLBACK_MODE_IDS.includes(mode?.id),
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
    // Preset in this tab (item 7): the (i), the lock and the PTC note of a conversation; each tab's choice for Settings.
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: PRESET_PATH,
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
              // Plus is English only: a page that sends x-dsh-locale (Chinese included) gets English words.
              const locale = 'en';
              res.end(JSON.stringify(await presetView(typeof header === 'string' && /^[\w.:-]{1,120}$/.test(header) ? header : '', locale)));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 200) }));
            }
          },
        }),
      'modes: GET preset route',
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
    // Item 4A, stage 2: the chat box's Mode list reaches Modes here (lib/route.js modeHandler).
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: MODE_PATH,
          handler: modeHandler({ spaces: () => modes.spaces, connection: inner.connection }),
        }),
      'modes: Mode list route',
    );
    // Item 4A, stage 6b (J3): the chat box took the refused message back (lib/route.js engineHeldTakenHandler).
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: ENGINE_HELD_TAKEN_PATH,
          handler: engineHeldTakenHandler({ taken: (sessionId, id) => modes.spaces.engineHeldTaken(sessionId, id), connection: inner.connection }),
        }),
      'modes: engine put-back route',
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

  /**
   * Item 6: a schedule tool call from Recon that would make or move an automation into new chats (target new or
   * new_once). Those chats would open outside Recon. Undefined when the call keeps to this conversation.
   * @param {object} exec - the tool call.
   * @returns {string | undefined} the reason to refuse.
   */
  function reconNewChatRefusal(exec) {
    const name = String(exec?.name ?? '');
    const target = exec?.arguments?.target;
    // Stage 6b (J15, Revision 2 L2): from a sealed thread, schedule_edit only for an automation that runs in this thread
    // (Automations says where each runs); with no Automations to say, never (fail closed).
    if (name === 'schedule_edit' && !editsOwnTask(exec)) return SEALED_EDIT_OTHER;
    if (name === 'schedule_create' && target === 'this_session') return undefined;
    if (name === 'schedule_edit' && (target === undefined || target === null || target === 'this_session')) return undefined;
    if (name !== 'schedule_create' && name !== 'schedule_edit') return undefined;
    return 'In Recon an automation runs only in this thread (target this_session). A new thread would open outside Recon and carry the instruction there. Use target this_session, or tell the user.';
  }
  const SEALED_EDIT_OTHER = 'From a sealed thread you can change only automations that run in this thread. Nothing was changed. Tell the user they can change it on the Automations page.';
  /** Stage 6b (L2): whether a schedule_edit names an automation whose target is the calling thread (Automations' answer). */
  function editsOwnTask(exec) {
    try {
      const taskId = String(exec?.arguments?.id ?? exec?.arguments?.task_id ?? '');
      if (!taskId) return false;
      const place = ctx.get('automations')?.placeOf?.(taskId);
      return Boolean(place) && typeof place.sessionId === 'string' && place.sessionId !== '' && place.sessionId === topOf(exec.agent.id);
    } catch {
      return false;
    }
  }
  /** Stage 6b (J10): a schedule tool call that makes or moves an automation into new threads (target new or new_once). */
  const newTarget = (exec) => {
    const name = String(exec?.name ?? '');
    const target = exec?.arguments?.target;
    return (name === 'schedule_create' || name === 'schedule_edit') && (target === 'new' || target === 'new_once');
  };
  /** Stage 6b: the guarded space a thread is a guest of ('devices', 'workshop'), '' for none; 'unknown' when it cannot be read. */
  function guestSpaceOf(top) {
    try {
      const space = String(modeOf(top)?.guardedBy ?? '');
      return space === 'devices' || space === 'workshop' ? space : space ? 'unknown' : '';
    } catch {
      return 'unknown';
    }
  }
  /**
   * Stage 6b (review finding): whether a guest's schedule_edit names an automation delivered to this thread, or one made
   * in the guest's space that runs there now (Automations' answer). An unknown guest, no Automations, an unknown task or
   * an answer that cannot be read: false.
   */
  function guestEditsOwnSpace(exec, top, guest) {
    if (guest !== 'devices' && guest !== 'workshop') return false;
    try {
      const taskId = String(exec?.arguments?.id ?? exec?.arguments?.task_id ?? '');
      if (!taskId) return false;
      const place = ctx.get('automations')?.placeOf?.(taskId);
      if (!place || typeof place !== 'object') return false;
      if (typeof place.sessionId === 'string' && place.sessionId !== '' && place.sessionId === top) return true;
      return place.space === guest && place.createdSpace === guest;
    } catch {
      return false;
    }
  }
  /** Stage 6b (J10): whether Automations places a guest's new threads in its space (on, and new enough). */
  function automationsPlaceGuestRuns() {
    try {
      const service = ctx.get('automations');
      return Number(service?.apiVersion) >= 1 && service?.placesGuestRuns?.() === true;
    } catch {
      return false;
    }
  }
  // Item 6: "Scheduling from Recon" off (Automations' setting) also stops a schedule tool Recon was given earlier,
  // in a turn already under way (the mask follows at the next turn).
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    try {
      if (!String(exec?.name ?? '').startsWith('schedule_') || !exec?.agent?.id || !isIsolated(topOf(exec.agent.id))) return decision;
      if (ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'automations')?.value?.scheduleFromRecon === false) {
        return { kind: 'deny', reason: 'Scheduling from Recon is switched off by the user (Settings → Alerts → Scheduling from Recon). Do not schedule anything from here; tell the user if it matters.' };
      }
      // Whatever the setting: from Recon an automation runs only in this conversation. A new chat would be made outside
      // Recon, in the scheduled tab, with this chat's folder and the instruction written here (review finding, item 6).
      const reason = reconNewChatRefusal(exec);
      if (reason) ledgerNote(exec, 'recon-new-chat');
      return reason ? { kind: 'deny', reason } : decision;
    } catch (error) {
      report(error);
      return decision;
    }
  });
  // Item 4A, stage 6b (J10): a guest in Devices or Workshop may schedule (point 27); a new thread from there must stay in
  // that space, which only Automations can arrange: without it (off, gone, or too old) such a call is refused.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    try {
      if (!exec?.agent?.id) return decision;
      // Review finding (fail closed, as L2 for sealed threads): a guest's schedule_edit only for an automation delivered
      // to this thread, or made in this space and running there now (Automations says which); with no Automations to
      // say, never. Otherwise a guest could rewrite a Chat or Code automation (its runs get the Terminal), or pull a Recon
      // automation's instruction into this thread with target this_session.
      if (exec.name === 'schedule_edit') {
        const top = topOf(exec.agent.id) || exec.agent.id;
        const guest = guestSpaceOf(top);
        if (guest && !guestEditsOwnSpace(exec, top, guest)) {
          ledgerNote(exec, 'guest-edit-other');
          const name = SPACE_NAMES.en[guest] ?? 'this space';
          return { kind: 'deny', reason: `From ${name} you can change only automations made in ${name} that still run there, or ones delivered to this thread. Nothing was changed. Tell the user they can change it on the Automations page.` };
        }
      }
      if (!newTarget(exec)) return decision;
      const top = topOf(exec.agent.id) || exec.agent.id;
      const guest = guestSpaceOf(top);
      if (!guest) return decision;
      if (guest === 'unknown' || !automationsPlaceGuestRuns()) {
        ledgerNote(exec, 'guest-new-thread');
        const name = SPACE_NAMES.en[guest] ?? 'this space';
        return { kind: 'deny', reason: `New threads from ${name} need the Automations add-on to keep them in ${name}, and it is off or out of date. Use target this_session, or tell the user to switch on Automations.` };
      }
      return decision;
    } catch (error) {
      report(error);
      return { kind: 'deny', reason: 'The schedule tool could not be checked just now, so nothing was made. Try again in a moment.' };
    }
  });
  // Stage 6b (Revision 2 L4): a guest's automation that opens new threads is remembered with its space, so its runs are
  // held if nobody places them there (also when Automations is off or gone later).
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    try {
      if (!exec?.agent?.id || !newTarget(exec) || result?.isError === true) return decision;
      const top = topOf(exec.agent.id) || exec.agent.id;
      const guest = guestSpaceOf(top);
      if (guest !== 'devices' && guest !== 'workshop') return decision;
      const taskId = String(result?.value?.id ?? (exec.name === 'schedule_edit' ? exec.arguments?.id ?? '' : ''));
      if (taskId && !result?.value?.code) noteGuestRun(taskId, guest, modeOf(top)?.id);
    } catch (error) {
      report(error);
    }
    return decision;
  });

  // A skill switched off in this tab is not loaded by the model (it may still know its name from an older list).
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    try {
      const reason = skillOffReason(exec);
      if (reason) ledgerNote(exec, 'skill-off');
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
      ledgerNote(exec, 'one-model');
      return { kind: 'deny', reason: `This thread is set to one model for everything${own?.model ? ` (${own.model})` : ''}, so a helper may not be started on another model. Call the tool again without "provider" and "model": the helper then runs on this thread's model. The user can allow different models with the models chip in the chat box.` };
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
            description: 'Show or switch the mode of this thread',
            input: { hint: '[mode]' },
            handler: async ({ agent, rawInput }) => {
              const wanted = String(rawInput ?? '').trim().toLowerCase();
              // Item 4A, stage 2: with spaces live, /mode works like the Mode list: the modes of this thread's space, before
              // the first message too (the pick is then a claim), with the same sentences when a pick is refused.
              if (spacesLive() && tabsDecide()) {
                // Fix round 2: on a draft the app shows no command output, so the chat box shows this reply instead.
                const said = (answer) => {
                  const top = topOf(agent.id);
                  if (freshNow(top)) draftReplies.set(top, { id: randomUUID(), text: answer.text, kind: answer.kind, at: Date.now() });
                  return answer;
                };
                const view = modes.spaces.view(agent.id);
                const name = (id) => readModes(config)[id]?.label ?? id;
                if (!wanted) {
                  const lines = view.modes.map((mode) => `${mode.id === view.current ? '* ' : '  '}${mode.id}: ${mode.label}${mode.greyed ? ` (${mode.reason})` : ''}`);
                  const answer = { kind: 'success', text: `Mode: ${view.current} (space: ${view.space})\n${lines.join('\n')}\nA mode can be changed at any time; it applies from your next message.` };
                  if (freshNow(topOf(agent.id))) said({ kind: 'success', text: `Mode: ${name(view.current)}. To change it, type /${commandName} and a mode, or pick one in the Mode list under the chat box.` });
                  return answer;
                }
                const id = readModes(config)[wanted] ? wanted : Object.values(readModes(config)).find((mode) => mode.label.toLowerCase() === wanted)?.id ?? wanted;
                try {
                  await modes.spaces.pick(agent.id, id);
                } catch (error) {
                  return said({ kind: 'error', text: String(error?.message ?? error) });
                }
                return said({ kind: 'success', text: `Mode changed to ${name(id)}. It applies from your ${freshNow(topOf(agent.id)) ? 'first' : 'next'} message.` });
              }
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
