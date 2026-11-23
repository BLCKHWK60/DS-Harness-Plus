/**
 * Item 4A, stage 6a: the space keeps its safety rules for any mode (STAGE6A-DESIGN.md section 2.3; the owner's answers of
 * 22 November 2026, REVIEW-REQUIREMENTS-1.md 1.5 point 26).
 *
 * A mode other than a guarded space's own (a "guest": Research in Recon, Code in Devices) runs under that space's rules:
 * - in Recon it gets the sealed copy: isolated, read only, online only through Recon's own tools, files only in the
 *   thread's room folder, never a tool that writes to notes other threads read;
 * - in Devices and Workshop it gets the guarded copy: its own tools (plus the device tools in Devices) minus everything
 *   `guestRefuses` names (the Terminal, programs, background jobs, connectors, Mac app tools, Office files, the app's own
 *   tools and every tool nobody has sorted). The Devices and Creator Plus guards add their folder rules. Stage 6b
 *   (owner, point 27): schedules are open to guests; the `unknown` guard and a Mission run still refuse them.
 *
 * The copies keep the mode's id; they carry `sealedBy` / `guardedBy`. Pure, so it is tested without the app. Modes
 * (index.js), Bench and Creator Plus read the same `guestRefuses` (the service's `spaces.guestRefuses`).
 */
import { classify, COMMAND_TOOLS, WRITE_TOOLS } from './catalog.js';
import { canGoOnline, PROGRAM_NAMES, reconMayAsk, SHARED_STORES, SHELL_NAMES } from './online.js';
import { LOCKED_MODE } from './isolation.js';
import { LOCK_PRESET, lockInSpace, refusesPrograms } from './presetlock.js';
import { ADDON_NAMES, GUARDED, SPACE_NAMES, UNSORTED_FAMILY } from './spaces.js';
import { isInside, pathsInText, physical, real } from './fence.js';

export { SHARED_STORES } from './online.js';

/** The three spaces with rules of their own. One constant for the words (PTC note, presets) and the run guards (I22). */
export const GUARDED_SPACES = Object.freeze(Object.keys(GUARDED));
/** Spaces that refuse programs for every mode. */
export const NO_PROGRAM_SPACES = GUARDED_SPACES;

/**
 * What a guest in Devices or Workshop (and the base rule, and the `unknown` guard) may never run: decided by catalog
 * group, so a tool nobody has sorted is refused (LEAK 1, REGRESSION 8).
 */
export const GUEST_REFUSED = Object.freeze({
  groups: Object.freeze(['run', 'accounts', 'app', 'mac', 'helpers']),
  names: Object.freeze([...new Set([...SHELL_NAMES, ...COMMAND_TOOLS, ...PROGRAM_NAMES, 'job_output', 'job_list', 'job_kill', 'engine', 'workflow', 'plugin_manager', 'mac_shortcuts'])]),
  prefixes: Object.freeze(['terminal_', 'mcp__', 'office_', 'creator_', 'mac_']),
  // Exceptions inside the refused groups: helpers inherit the thread's guard (their top is this thread); mac_find_files
  // only with the path check of the guard (Bench) or the base rule's Devices-folder check.
  keepHelpers: Object.freeze(['subagent', 'subagent_fork', 'list_agents', 'wait_agent', 'send_message', 'list_subagent_models', 'delegate_role', 'review_lanes', 'run_pipeline', 'judge_candidates', 'run_swarm', 'deep_research']),
  // Item 4A, stage 6a: Mission's own step and request tools stay too (a Mission in Devices or Workshop runs under the
  // space's rules, dsh-mission; without them its conversation could not conduct the run).
  keepNames: Object.freeze(['mac_find_files', 'tools_catalog', 'request_tool_access', 'mission_step', 'mission_request']),
});

/**
 * Item 4A, stage 6b (J14, Revision 2 L1, G13): what the `unknown` guard (a space that could not be read, an unknown
 * helper) and a Mission run in Devices or Workshop still refuse on top of GUEST_REFUSED: the schedule tools.
 */
export const UNKNOWN_EXTRA = Object.freeze(['schedule_']);

/** @returns {boolean} whether a name is listed by name or by prefix. */
export const matches = (name, { names, prefixes }) => names.includes(name) || prefixes.some((prefix) => name.startsWith(prefix));

/**
 * The one test for Modes, Bench and Creator Plus: whether a guest in a guarded space (Devices, Workshop, or a thread
 * whose space could not be read) is refused a tool.
 * @param {unknown} name - the tool's raw name.
 * @param {{space?: string, mission?: boolean}} [opts] - stage 6b: the guest's space ('devices', 'workshop', 'unknown').
 *   No space (or no opts) counts as 'unknown' (Revision 2 L1: a call site that forgets to say refuses schedules, fail
 *   closed). `mission`: an unattended Mission run, which schedules nothing more (G13).
 * @returns {boolean}
 */
export function guestRefuses(name, opts = {}) {
  const raw = String(name ?? '');
  if (/^bench_/.test(raw)) return false;
  if (GUEST_REFUSED.keepHelpers.includes(raw) || GUEST_REFUSED.keepNames.includes(raw)) return false;
  if (matches(raw, GUEST_REFUSED)) return true;
  const space = String(opts?.space ?? '');
  if ((space !== 'devices' && space !== 'workshop') || opts?.mission === true) {
    if (UNKNOWN_EXTRA.some((prefix) => raw.startsWith(prefix))) return true;
  }
  const entry = classify(raw);
  return !entry.sorted || GUEST_REFUSED.groups.includes(entry.group) || entry.addon === 'dsh-creator-plus';
}

/** @returns {boolean} whether a tool writes to a store other threads read (Memory, the Finance profile, …). */
export const isSharedStore = (name) => matches(String(name ?? ''), SHARED_STORES);

/** File tools a sealed guest keeps: only paths inside the thread's room folder (roomPathRefusal). */
export const SEALED_PATH_TOOLS = Object.freeze(['read', 'glob', 'grep', 'read_image', 'pdf_info', 'pdf_read', 'pdf_search',
  'pdf_page_image', 'data_files', 'data_profile', 'data_query', 'data_text', 'data_analyses', 'data_chart']);
/**
 * What a sealed guest may keep of its own tools. An allow-list, so an unsorted or new tool is left out (fail closed). No
 * tool here reads outside the room: `working_directory` and `library_*` are out (REGRESSION 1).
 */
export const SEALED_KEEP = Object.freeze([...SEALED_PATH_TOOLS, 'todo_write', 'ask_user_question', 'create_goal', 'get_goal',
  'update_goal', 'tools_find', 'tools_catalog', 'request_tool_access', 'diagram_draw', 'scout_report', 'scout_reports']);
/** Tools the owner may add on Settings → Modes → "Extra tools a mode keeps in Recon" (`sealedExtra`, default empty). */
export const SEALED_EXTRA_CHOICES = Object.freeze(['library_search', 'library_read']);
/** Recon's own tool that never runs for a guest (its Ultra Code search reaches outside Recon's routes for it). */
const RECON_NET_LEFT_OUT = 'recon_ultra';

/**
 * The tools of a mode's sealed copy (a guest in Recon).
 * @param {{tools?: 'all'|'none'|string[]}} mode - the mode.
 * @param {string[]} [reconNet] - the tools of the Recon mode (only `recon_*` are taken, `recon_ultra` never).
 * @param {{roomKnown?: boolean, extra?: string[]}} [options] - `roomKnown`: the thread's room folder is known (file tools
 *   are kept); `extra`: the owner's `sealedExtra` (only SEALED_EXTRA_CHOICES count).
 * @returns {string[]}
 */
export function sealedTools(mode, reconNet = [], { roomKnown = false, extra = [] } = {}) {
  if (mode?.tools === 'none') return [];
  const own = Array.isArray(mode?.tools) ? mode.tools : null;
  const allowed = [...SEALED_KEEP, ...(Array.isArray(extra) ? extra : []).filter((name) => SEALED_EXTRA_CHOICES.includes(name))];
  const keep = (own ?? allowed).filter((name) => allowed.includes(name) && (roomKnown || !SEALED_PATH_TOOLS.includes(name))
    && (reconMayAsk(name) || name === 'tools_catalog' || name === 'request_tool_access') && !isSharedStore(name) && !guestRefuses(name));
  // A mode that went online (Research, 'all') goes online through Recon's routes; one that never did stays offline.
  const wentOnline = own === null || own.some((name) => canGoOnline(name));
  const net = wentOnline ? (Array.isArray(reconNet) ? reconNet : []).filter((name) => typeof name === 'string' && name.startsWith('recon_') && name !== RECON_NET_LEFT_OUT) : [];
  return [...new Set([...keep, ...net])];
}

/**
 * Item 4A, stage 6a leftovers: the model's words for a thread its guarded space holds without tools (the guard add-on is
 * off or too old). The prompt is model-facing (English only, as every Modes prompt); the chat box says the same to the
 * user in the page's language (spaces.js heldText).
 * @param {string} space - 'devices' or 'workshop'.
 * @returns {string}
 */
export function heldPrompt(space) {
  const name = SPACE_NAMES.en[space] ?? String(space ?? '');
  const addon = ADDON_NAMES.en[space] ?? name;
  return `This thread is in the ${name} space, which keeps its own safety rules for every mode. The ${addon} add-on that applies those rules is switched off or out of date, so this thread has no tools for now. Do not call any tool. Answer only from what is already in this thread, and tell the user to switch on or update the ${addon} add-on in Settings, then send the message again.`;
}
const HELD = new Map();
/**
 * The locked mode (no tools) for a thread held by its guarded space: LOCKED_MODE's id and rules, with a prompt that names
 * the space and what to do, and `heldIn` (it is never marked isolated for good: the thread gets its mode back once the
 * guard is ready). One frozen object per space.
 * @param {string} space - 'devices' or 'workshop'.
 * @returns {object}
 */
export function heldIn(space) {
  const key = GUARDED_SPACES.includes(space) && space !== 'recon' ? space : '';
  if (!key) return LOCKED_MODE;
  if (!HELD.has(key)) HELD.set(key, Object.freeze({ ...LOCKED_MODE, prompt: heldPrompt(key), heldIn: key }));
  return HELD.get(key);
}

/** The modes that pass through a space unchanged (the home modes, and the two fallback modes with no tools). */
const PASSES_RECON = Object.freeze(['recon', 'isolated-locked', 'isolated-late']);

/**
 * The sealed copy of a mode (2.2): its id, label and prompt; isolated, read only, no programs, no start families.
 * @returns {object} frozen.
 */
export function sealedCopy(mode, { reconNet = [], roomKnown = false, extra = [] } = {}) {
  if (!mode) return mode;
  return Object.freeze({ ...mode, tools: Object.freeze(sealedTools(mode, reconNet, { roomKnown, extra })), isolated: true, sandbox: 'read-only', noPrograms: true, startFamilies: Object.freeze([]), sealedBy: 'recon' });
}

/**
 * The guarded copy of a mode in Devices or Workshop (or 'unknown': the space could not be read). The home mode comes
 * back as it is. A list loses every tool `guestRefuses` names, and in Devices gains the device tools; 'all' and 'none'
 * stay (the mask and the guard take the refused tools out).
 * @returns {object} frozen, or the mode itself.
 */
export function guardedCopy(mode, space, { deviceTools = [] } = {}) {
  if (!mode || GUARDED[space] === mode.id) return mode;
  let tools = mode.tools;
  if (Array.isArray(tools)) {
    const own = tools.filter((name) => !guestRefuses(name, { space }));
    const devices = space === 'devices' ? (Array.isArray(deviceTools) ? deviceTools : []).filter((name) => typeof name === 'string' && name.startsWith('bench_')) : [];
    tools = Object.freeze([...new Set([...own, ...devices])]);
  }
  return Object.freeze({ ...mode, tools, noPrograms: true, guardedBy: space });
}

/**
 * The effective mode of a thread in a space (2.2, 2.3).
 * @param {object} mode - the mode its choice gives.
 * @param {string} space - the thread's space ('unknown' when it could not be read).
 * @param {object} [options]
 * @param {{devices?: unknown, recon?: unknown, workshop?: unknown}} [options.ready] - guardReady(): `true` when the
 *   space's guard is ready, else 'off' or 'old'.
 * @param {boolean} [options.ranBefore] - the thread has run a turn.
 * @param {string[]} [options.reconNet] - the Recon mode's tools.
 * @param {string[]} [options.deviceTools] - the Bench mode's `bench_*` tools.
 * @param {boolean} [options.roomKnown] - the thread's room folder is known.
 * @param {string[]} [options.extra] - `sealedExtra`.
 * @param {{devices?: boolean, workshop?: boolean}} [options.oldGuard] - the guard add-on is on but too old.
 * @returns {object}
 */
export function spaceCopy(mode, space, { ready = { devices: true, recon: true, workshop: true }, ranBefore = false, reconNet = [], deviceTools = [], roomKnown = false, extra = [], oldGuard = {} } = {}) {
  if (!mode) return mode;
  const passes = PASSES_RECON.includes(mode.id);
  if (space === 'recon') {
    // Lab fix (6a): Recon's own mode while the Recon add-on is not running (off on the Plugins page; its mode may still be
    // listed): no tools, still isolated.
    if (mode.id === 'recon' && ready?.recon === 'plugin') return LOCKED_MODE;
    if (passes) return mode;
    // Recon switched off or too old, and the thread has run: no tools, still isolated (I10).
    if (ready?.recon !== true && ranBefore) return LOCKED_MODE;
    return sealedCopy(mode, { reconNet, roomKnown, extra });
  }
  if (space === 'devices' || space === 'workshop') {
    // The space's own mode keeps today's behaviour exactly (its own add-on guards it). Lab fix (6a, blocker): while that
    // add-on is not running (off on the Plugins page) its mode may still be listed, but nothing guards it: held.
    if (GUARDED[space] === mode.id) return ready?.[space] === 'plugin' ? heldIn(space) : mode;
    if (passes) return mode;
    // The guard add-on is on but too old: guests are held without tools until it is updated (I27). Fix round (6a review,
    // the owner's rule "never the Devices folder or /dev"): switched off too, since Modes' base rule has no folder rule.
    if (oldGuard?.[space] || (ready && ready[space] !== undefined && ready[space] !== true)) return heldIn(space);
    return guardedCopy(mode, space, { deviceTools });
  }
  if (space === 'unknown') return passes ? mode : guardedCopy(mode, 'unknown', {});
  return mode;
}

/** The key reconcile compares: the same id moving between a plain and a sealed/guarded copy re-applies (I20). */
export const modeKey = (mode) => `${mode?.id ?? ''}|${mode?.sealedBy ?? ''}|${mode?.guardedBy ?? ''}|${Array.isArray(mode?.tools) ? mode.tools.length : String(mode?.tools ?? '')}`;

/**
 * Stage 6a leftovers (c): whether a thread's guard (Modes' `guardOf`) refuses an engine model. Sealed threads and the
 * Recon space always refuse; a thread its space guards (Devices, Workshop, 'unknown') or whose mode refuses programs
 * refuses, except the space's own home mode (owner point 26, "Home modes keep today's behaviour": Bench in Devices and
 * Creator Plus in Workshop are answered by dsh-engines' "Code mode only" check, as before 6a). Anything that is not a
 * plain guard refuses.
 * @param {any} guard - what guardOf answered.
 * @returns {boolean} refused.
 */
export function guardRefusesEngine(guard) {
  if (!guard || typeof guard !== 'object') return true;
  if (guard.sealed !== false || guard.reconSpace === true || guard.unknownTop === true) return true;
  const home = guard.homeMode === true && GUARDED[guard.space] === guard.mode && guard.guardedBy === guard.space;
  if (home) return false;
  return Boolean(guard.guardedBy) || guard.noPrograms === true;
}

/** @returns {boolean} whether a mode in a space refuses programs (so the PTC note says start again in another preset). */
export function refusesProgramsIn(mode, space) {
  return refusesPrograms(mode) || (Boolean(mode) && !['isolated-locked', 'isolated-late'].includes(mode.id) && (NO_PROGRAM_SPACES.includes(space) || space === 'unknown'));
}

/**
 * The preset a thread that cannot work in PTC starts again in: the lock that holds in its space, else Creator in
 * Workshop (and for Creator Plus), else Standard.
 * @returns {string} the app's preset id.
 */
export function restartPresetIn(table, space, mode) {
  const lock = lockInSpace(table, space, mode?.id).lock;
  if (lock !== 'any') return LOCK_PRESET[lock];
  return space === 'workshop' || mode?.id === 'creator-plus' ? LOCK_PRESET.creator : LOCK_PRESET.standard;
}

/**
 * Lab fix (6a): the families a mode can lose in Devices or Workshop, in the order the Mode list names them (what matters
 * first: the Terminal and programs, background jobs, connectors, other Mac apps, Office files). lostIn gives
 * them as `\u0000<id>` keys; spaces.js tickLines names them in the page's language (LOST_FAMILY_WORDS).
 */
export const LOST_ORDER = Object.freeze(['terminal', 'programs', 'jobs', 'connectors', 'mac', 'office', 'schedules', 'engines',
  'helpers', 'deep', 'web', 'files', 'pdf', 'library', 'data', 'codeMap', 'finance', 'learn', 'memory', 'content', 'images',
  'diagrams', 'reports', 'steps', 'creator', 'tuning', 'appTools', 'unsorted']);
/**
 * What every mode loses in Devices and Workshop, whatever it has: the space refuses these families for every mode. Stage
 * 6b (point 27): schedules are no longer lost there.
 */
const LOST_ALWAYS = Object.freeze(['terminal', 'programs', 'jobs', 'connectors', 'mac', 'office']);
export const lostKey = (id) => `\u0000${id}`;

/** @returns {string} the family id (LOST_ORDER) a tool is named by in the Mode list. */
export function lostFamily(name) {
  const tool = String(name ?? '');
  const entry = classify(tool);
  if (!entry.sorted) return 'unsorted';
  if (['bash', 'terminal', 'shell', 'pwsh', 'powershell'].includes(tool) || tool.startsWith('terminal_')) return 'terminal';
  if (tool.startsWith('job_')) return 'jobs';
  if (entry.group === 'run') return 'programs';
  if (entry.group === 'accounts') return 'connectors';
  if (entry.group === 'mac') return 'mac';
  if (tool.startsWith('office_')) return 'office';
  if (tool.startsWith('schedule_')) return 'schedules';
  if (tool === 'engine') return 'engines';
  if (tool === 'deep_research') return 'deep';
  if (entry.group === 'helpers') return 'helpers';
  if (tool.startsWith('pdf_')) return 'pdf';
  if (tool.startsWith('library_')) return 'library';
  if (tool.startsWith('data_')) return 'data';
  if (tool.startsWith('code_map_')) return 'codeMap';
  if (tool.startsWith('finance_')) return 'finance';
  if (tool.startsWith('learn_')) return 'learn';
  if (tool === 'remember') return 'memory';
  if (tool.startsWith('content_')) return 'content';
  if (tool === 'generate_image' || tool === 'edit_image') return 'images';
  if (tool === 'diagram_draw' || tool === 'present') return 'diagrams';
  if (tool === 'automation_results') return 'reports';
  if (tool.startsWith('creator_')) return 'creator';
  if (tool.startsWith('tuning_') || tool === 'skills') return 'tuning';
  if (entry.group === 'web') return 'web';
  if (entry.group === 'read' || entry.group === 'change') return 'files';
  if (entry.group === 'schedule') return 'steps';
  return 'appTools';
}

/**
 * Lab re-check fix (6a, problem 5): whether Creator Plus's Workshop allow-list (`creatorPlus.allowed()`: names, and
 * prefixes ending in `_` or `*`) lets a tool through. The one test for the Mode list, the tools offered to a guest in
 * Workshop and tools_find, so what is offered there is what Creator Plus's guard lets run.
 * @param {unknown} name - the tool.
 * @param {unknown} list - the allow-list (not a list: everything passes, the guest rule alone decides).
 * @returns {boolean}
 */
export function workshopAllows(name, list) {
  if (!Array.isArray(list)) return true;
  const tool = String(name ?? '');
  return list.map((entry) => String(entry ?? '')).filter(Boolean)
    .some((entry) => (entry.endsWith('*') ? tool.startsWith(entry.slice(0, -1)) : entry.endsWith('_') ? tool.startsWith(entry) : tool === entry));
}

/**
 * What the space refuses a guest (problem 5): the guest rule, and in Workshop (and for the 'unknown' guard, which
 * Creator Plus guards too) also every tool outside Creator Plus's allow-list (when Creator Plus is on and can say). Not a guest (no `guardedBy`): nothing.
 * @param {{guardedBy?: string}|undefined} mode - the thread's effective mode.
 * @param {unknown} [workshopAllowed] - `creatorPlus.allowed()`.
 * @returns {(name: string) => boolean}
 */
export function spaceRefuser(mode, workshopAllowed) {
  const space = mode?.guardedBy;
  if (!space) return () => false;
  // Creator Plus guards Workshop and a thread whose space could not be read ('unknown'), with its allow-list.
  if ((space !== 'workshop' && space !== 'unknown') || !Array.isArray(workshopAllowed)) return (name) => guestRefuses(name, { space });
  return (name) => guestRefuses(name, { space }) || !workshopAllows(name, workshopAllowed);
}

/**
 * What a mode loses in a guarded space, as family keys (`\u0000<id>`, LOST_ORDER), most important first (the Settings →
 * Modes warning line and the Mode list).
 * @param {{tools?: 'all'|'none'|string[]}} mode - the mode.
 * @param {string} space - 'devices' or 'workshop' (anything else: nothing).
 * @param {{known?: string[], workshopAllowed?: string[]}} [options] - `known`: the tools there are (for a mode with all
 *   tools); `workshopAllowed`: Creator Plus's allow-list (names, and prefixes ending in `_` or `*`).
 * @returns {string[]} family keys, each once (UNSORTED_FAMILY for the tools nobody has sorted).
 */
export function lostIn(mode, space, { known = [], workshopAllowed } = {}) {
  if (space !== 'devices' && space !== 'workshop') return [];
  if (!mode || mode.tools === 'none' || GUARDED[space] === mode.id) return [];
  const all = !Array.isArray(mode.tools);
  const tools = all ? (Array.isArray(known) ? known : []) : mode.tools;
  const allowList = Array.isArray(workshopAllowed) ? workshopAllowed : null;
  const allowedInWorkshop = (name) => workshopAllows(name, allowList);
  // Missions run in Devices and Workshop under the space's rules (Start Mission), so Mission is never named as lost.
  const lost = tools.filter((name) => typeof name === 'string' && name && name !== 'tools_catalog' && name !== 'request_tool_access'
    && !name.startsWith('bench_') && !name.startsWith('mission') && (space === 'workshop' && allowList ? !allowedInWorkshop(name) : guestRefuses(name, { space })));
  const ids = new Set(lost.map(lostFamily));
  // A mode with all tools loses what the space closes for every mode, also where nothing of it is installed now.
  if (all) for (const id of LOST_ALWAYS) ids.add(id);
  return LOST_ORDER.filter((id) => ids.has(id)).map(lostKey);
}

// ---- The room path rule (I6, I8) -------------------------------------------------------------------------------

/** Keys whose value is a path even without a slash (relative to the thread's folder). */
const PATH_KEYS = Object.freeze(['path', 'file_path', 'filePath', 'file', 'filename', 'target', 'source', 'destination', 'dest', 'from', 'to', 'old_path', 'new_path', 'notebook_path', 'dir', 'directory', 'folder', 'root', 'cwd', 'paths', 'files', 'output', 'output_path', 'out', 'save', 'save_path', 'savePath']);
/** A string that is a single path (no spaces): `/…`, `~…`, `./…`, `../…`. */
const SINGLE_PATH = /^(?:\/|~|\.\.?\/)\S*$/;
const URL_LIKE = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Fix round (6a review): tools that read a store of their own outside the room (Scout's folder, the Library). Refused in
 * a Recon-space thread even when granted in the popup; the Library tools only when the owner kept them (`sealedExtra`).
 */
export const ROOM_OUTSIDE_READERS = Object.freeze({ names: Object.freeze(['scout_files']), prefixes: Object.freeze(['library_']) });
/** @returns {boolean} whether the room path rule applies to a tool: every file reader (the `read` group, fail closed) and changer. */
function roomRuled(name) {
  if (SEALED_PATH_TOOLS.includes(name) || name === 'diagram_draw' || name.startsWith('office_') || WRITE_TOOLS.has(name)) return true;
  const group = classify(name).group;
  return group === 'change' || group === 'read' || matches(name, ROOM_OUTSIDE_READERS);
}
/** @returns {boolean} whether a tool changes files (refused when the guard cannot read its path). */
function changes(name) {
  return name.startsWith('office_') || WRITE_TOOLS.has(name) || classify(name).group === 'change';
}

/**
 * Every place a call's arguments name, absolute ('' entries: a place that cannot be read here). Strings at any key to
 * depth 3: a path key's value is a path (relative to the folder); a single path-like word is a path; any other text
 * with a slash or `~` is read for the paths in it.
 */
/**
 * Fix round (6a review): keys whose value is a text body or a search pattern, never a place (a report that mentions
 * /etc/passwd, an edit's new text, grep's `/login`). Glob's `pattern` is a place (it names where to look); a `query` is
 * read (a data query can name a file).
 */
const BODY_KEYS = Object.freeze(['content', 'contents', 'text', 'old_string', 'new_string', 'old_text', 'new_text', 'regex', 'pattern',
  'description', 'message', 'body', 'prompt', 'title', 'summary', 'note', 'notes', 'caption', 'label']);

/**
 * Lab fix (6a): keys whose value is a file-name pattern read from a base folder (glob's `pattern`, grep's `glob` and
 * `include`): `**\/*` or `src/*.txt` names no place of its own; it stays under the call's `path` (or the thread's folder),
 * which is checked. Only an absolute or home pattern, or one that climbs with `..`, names a place: its fixed part.
 */
const PATTERN_KEYS = Object.freeze(['pattern', 'glob', 'include', 'exclude']);
const climbs = (text) => /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(text);
function patternPlace(text, base) {
  if (!(text.startsWith('/') || text.startsWith('~') || climbs(text))) return null;
  const fixed = text.split(/[*?[{]/)[0];
  const head = fixed.includes('/') ? fixed.slice(0, fixed.lastIndexOf('/') + 1) || '/' : fixed;
  return physical(head || '.', base) || '';
}

/**
 * Lab re-check fix (6a, problem 2): the real path arguments of each file tool the room rule knows, read from the tools'
 * own schemas (the app's read/write/edit/glob/grep/read_image/working_directory, dsh-pdf, dsh-data, dsh-code-map,
 * dsh-diagram). For these tools only `path` keys are places (a string or a list of strings), `pattern` keys are file-name
 * patterns, `text` keys are read for the paths in them (a data query can name a file); every other key of the schema is
 * not a place (a diagram's node ids `from`/`to`, labels and formulas with "/", a PDF page range, a search word). A key the
 * schema does not have is read the general way (fail closed). A tool not listed here (an Office tool, apply_patch, a new
 * add-on's tool) is read the general way too: PATH_KEYS, single path-like words and paths inside text.
 */
const TOOL_ARGS = (() => {
  const spec = (path = [], ignore = [], extra = {}) => Object.freeze({ path, ignore, pattern: extra.pattern ?? [], text: extra.text ?? [] });
  const pdf = spec(['path'], ['page', 'scale', 'from', 'to', 'layout', 'query', 'limit']);
  return Object.freeze({
    read: spec(['file_path'], ['offset', 'limit']),
    read_image: spec(['file_path']),
    write: spec(['file_path'], ['content', 'sandbox_permissions', 'justification']),
    edit: spec(['file_path'], ['old_string', 'new_string', 'replace_all', 'sandbox_permissions', 'justification']),
    glob: spec(['path'], [], { pattern: ['pattern'] }),
    grep: spec(['path'], ['pattern'], { pattern: ['include'] }),
    working_directory: spec(['cd']),
    pdf_info: pdf, pdf_read: pdf, pdf_search: pdf, pdf_page_image: pdf, pdf_ocr: pdf,
    data_files: spec(['folder']),
    data_profile: spec(['files']),
    data_query: spec(['files'], ['limit'], { text: ['sql'] }),
    data_chart: spec(['files'], ['title', 'chart', 'x', 'y', 'xLabel', 'yLabel'], { text: ['sql'] }),
    data_text: spec(['file'], ['from']),
    data_analyses: spec(),
    data_save_analysis: spec([], ['name', 'queries', 'labels']),
    data_rerun_analysis: spec([], ['name']),
    code_map_file: spec(['path']),
    code_map_find: spec(['path'], ['query', 'kind', 'limit']),
    code_map_overview: spec(['path'], ['budget']),
    code_map_read: spec(['path'], ['symbol', 'line', 'context']),
    code_map_related: spec(['target'], ['depth']),
    // diagram_draw has no path argument: its file name (`name`) is made safe by dsh-diagram and saved in the thread's
    // own run folder in the room (a sealed thread), never where the model says.
    diagram_draw: spec([], ['kind', 'title', 'name', 'direction', 'nodes', 'edges', 'root', 'actors', 'steps', 'events', 'chart',
      'categories', 'series', 'functions', 'xMin', 'xMax', 'yMin', 'yMax', 'xLabel', 'yLabel']),
  });
})();
export const ROOM_TOOL_ARGS = TOOL_ARGS;

function placesIn(args, cwd, tool = '') {
  const found = [];
  // A pattern is read from the call's own folder (`path`), else the thread's folder.
  const ownPath = args && typeof args === 'object' && typeof args.path === 'string' && args.path.trim() ? args.path.trim() : '';
  const patternBase = ownPath ? physical(ownPath, cwd) || cwd : cwd;
  const known = Object.hasOwn(TOOL_ARGS, tool) ? TOOL_ARGS[tool] : null;
  if (known && args && typeof args === 'object' && !Array.isArray(args)) {
    const asPath = (value) => {
      if (typeof value === 'string') {
        const text = value.trim();
        if (text && !URL_LIKE.test(text)) found.push(text.includes('\0') ? '' : physical(text, cwd) || '');
      } else if (Array.isArray(value)) {
        for (const item of value.slice(0, 200)) asPath(item);
      } else if (value !== undefined && value !== null) {
        found.push('');
      }
    };
    for (const [key, value] of Object.entries(args)) {
      if (known.ignore.includes(key)) continue;
      if (known.path.includes(key)) asPath(value);
      else if (known.pattern.includes(key)) {
        if (typeof value === 'string' && value.trim()) {
          const place = patternPlace(value.trim(), patternBase);
          if (place !== null) found.push(place);
        }
      } else if (known.text.includes(key)) {
        // A query (SQL) is read as a program: a bare "/" is division; absolute, home and climbing paths are places, and
        // so is every quoted name with a "/" or "~" in it (a file the query opens).
        if (typeof value === 'string' && (value.includes('/') || value.includes('~'))) {
          for (const place of pathsInText(value, cwd, undefined, { program: true })) {
            if (place.startsWith('\0cd')) found.push(place.slice(3) || '');
            else found.push(place.startsWith('\0') ? '' : place);
          }
          for (const match of value.slice(0, 200_000).matchAll(/'([^'\n]*)'|"([^"\n]*)"/g)) {
            const quoted = String(match[1] ?? match[2] ?? '').trim();
            if (quoted && !URL_LIKE.test(quoted) && (quoted.includes('/') || quoted.startsWith('~'))) found.push(physical(quoted, cwd) || '');
          }
        }
      } else {
        // A key the tool's schema does not have: read the general way.
        found.push(...placesIn({ [key]: value }, cwd, ''));
      }
      if (found.length > 400) break;
    }
    return found;
  }
  const visit = (value, key, depth) => {
    if (found.length > 400 || depth > 3) return;
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text || URL_LIKE.test(text)) return;
      if (depth === 1 && PATTERN_KEYS.includes(key) && (key !== 'pattern' || tool === 'glob')) {
        const place = patternPlace(text, patternBase);
        if (place !== null) found.push(place);
        return;
      }
      if (BODY_KEYS.includes(key) && !(key === 'pattern' && tool === 'glob')) return;
      if (PATH_KEYS.includes(key) || SINGLE_PATH.test(text)) {
        found.push(text.includes('\0') ? '' : physical(text, cwd) || '');
        return;
      }
      if (text.includes('/') || text.includes('~')) {
        for (const place of pathsInText(text, cwd)) {
          if (place.startsWith('\0cd')) found.push(place.slice(3) || '');
          else found.push(place.startsWith('\0') ? '' : place);
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value.slice(0, 200)) visit(item, key, depth + 1);
      return;
    }
    if (value && typeof value === 'object') for (const [inner, item] of Object.entries(value)) visit(item, inner, depth + 1);
  };
  if (typeof args === 'string') visit(args, '', 0);
  else visit(args, '', 0);
  return found;
}

/** The sentence a refused call gets (2.7 ROOM_PATH_ONLY). */
export const ROOM_PATH_ONLY = Object.freeze({
  en: 'In Recon, files are read and written only in this thread\'s room folder, so {tool} was not run. Use a path inside the room.',
});
/**
 * Lab fix (6a): the same sentence when the room folder is known, naming it, so the model can call again without
 * guessing (relative paths and calls without a path start in Recon's shared room, not in this thread's folder).
 */
export const ROOM_PATH_ONLY_AT = Object.freeze({
  en: 'In Recon, files are read and written only in this thread\'s room folder, {folder}, so {tool} was not run. Call it again with a full path inside that folder (for glob and grep, set path to it).',
});

/**
 * The room path rule, used by Modes' isolated guard for every Recon-space thread (Recon mode included): a file tool
 * (every tool of the `read` group: pdf_ocr, code_map_*, …), a tool of the `change` group (granted or not), `data_chart`, `diagram_draw` with a save path, `office_*`: every place
 * its arguments name must lie (real path) inside `room`; a tool that changes files and names no place is refused; with
 * no place named, a reading tool works in the thread's folder, which must be inside the room; `room === ''` refuses them all.
 * Text bodies and search patterns are not places (BODY_KEYS); Scout's files and the Library are refused (they read outside
 * the room), the Library tools not when the owner kept them (`extra`, the `sealedExtra` setting).
 * @param {{name: string, args: unknown, cwd?: string, room: string, extra?: string[]}} want
 * @returns {string} '' when the call may run, else the sentence.
 */
export function roomPathRefusal({ name, args, cwd = '', room = '', extra = [] }) {
  const tool = String(name ?? '');
  if (!tool || !roomRuled(tool)) return '';
  const refusal = room ? ROOM_PATH_ONLY_AT.en.replace('{folder}', room).replace('{tool}', tool) : ROOM_PATH_ONLY.en.replace('{tool}', tool);
  // A store outside the room: refused, unless the owner kept it in Recon (`sealedExtra`, the Library tools only).
  if (matches(tool, ROOM_OUTSIDE_READERS)) return SEALED_EXTRA_CHOICES.includes(tool) && Array.isArray(extra) && extra.includes(tool) ? '' : refusal;
  if (!room) return refusal;
  let base;
  try {
    base = real(room);
  } catch {
    return refusal;
  }
  let places;
  try {
    places = placesIn(args, cwd, tool);
  } catch {
    return refusal;
  }
  if (places.length === 0) {
    if (tool === 'diagram_draw') return '';
    if (changes(tool)) return refusal;
    // A search or a listing with no path works in the thread's folder.
    places = [cwd || ''];
  }
  for (const place of places) {
    if (!place) return refusal;
    let where;
    try {
      where = real(place);
    } catch {
      return refusal;
    }
    if (!isInside(base, where)) return refusal;
  }
  return '';
}

/**
 * A tool mask with every tool a guest may not run taken out (I14): an allow-list loses them; a deny-list (or no mask)
 * gains every known tool `guestRefuses` names. Because the test is by group with unsorted = refused, a new tool is
 * denied in the mask and in the guard alike (LEAK 1).
 * @param {{allow?: string[], deny?: string[]} | null} mask
 * @param {string[]} known - every tool the app knows.
 * @returns {{allow?: string[], deny?: string[]}}
 */
export function withoutGuestRefused(mask, known = [], opts = {}) {
  // Stage 6b: `opts` ({space, mission}) as guestRefuses; none counts as the 'unknown' guard (fail closed).
  const refused = (Array.isArray(known) ? known : []).filter((name) => guestRefuses(name, opts));
  if (mask?.allow) return { allow: mask.allow.filter((name) => !guestRefuses(name, opts)) };
  if (mask?.deny) return { deny: [...new Set([...mask.deny, ...refused])] };
  return { deny: refused };
}

/** The rules other add-ons read (`modes.spaces.rules()`). */
export const SPACE_RULES = Object.freeze({
  guarded: GUARDED_SPACES,
  guestRefused: Object.freeze({ groups: GUEST_REFUSED.groups, names: GUEST_REFUSED.names, prefixes: GUEST_REFUSED.prefixes, keepHelpers: GUEST_REFUSED.keepHelpers, keepNames: GUEST_REFUSED.keepNames }),
  sharedStores: SHARED_STORES,
});

// ---- Lab fix (6a): Recon's refusals say why and what to do -----------------------------------------------------------

/**
 * The sentences Modes' isolated guard answers in a Recon-space thread (STAGE6A-DESIGN.md 2.7: SHARED_REFUSED,
 * PROFILE_REFUSED, DEEP_REFUSED; the add-ons keep their own copies as the belt at the tool, which Modes' guard reaches
 * first). Model-facing: the sentence goes to the model.
 */
export const RECON_REFUSALS = Object.freeze({
  shared: Object.freeze({
    en: 'Nothing was remembered: this thread is in Recon, and what Recon reads never goes into notes other threads read. Keep the point in this thread.',
  }),
  profile: Object.freeze({
    en: 'The finance profile was not changed: this thread is in Recon, and Recon text never goes into the profile other threads read.',
  }),
  saved: Object.freeze({
    en: 'Nothing was saved: this thread is in Recon, and what Recon reads never goes into a store other threads read, so {tool} was not run. Keep the point in this thread.',
  }),
  deep: Object.freeze({
    en: 'Deep research does not run in Recon: its helpers would search the web outside Recon\'s routes. Use recon_web_search and recon_web_read here.',
  }),
  web: Object.freeze({
    en: 'In Recon the web is reached only through Recon\'s routes, so {tool} was not run. Use recon_web_search and recon_web_read here.',
  }),
  other: Object.freeze({
    en: '{tool} is not one of this Recon thread\'s tools (Recon keeps every mode sealed), so it was not run.',
  }),
});

/**
 * The sentence for a tool a Recon-space thread may not run (its sealed list or the Recon mode's own leaves it out).
 * @param {unknown} name - the tool.
 * @param {string} [lang] - accepted and ignored: Plus is English only.
 * @returns {string}
 */
export function reconRefusal(name, lang = 'en') {
  const tool = String(name ?? '');
  const pick = (entry) => entry.en.replaceAll('{tool}', tool);
  if (tool === 'remember') return pick(RECON_REFUSALS.shared);
  if (tool === 'finance_profile_save') return pick(RECON_REFUSALS.profile);
  if (isSharedStore(tool)) return pick(RECON_REFUSALS.saved);
  if (tool === 'deep_research') return pick(RECON_REFUSALS.deep);
  if (classify(tool).group === 'web' || tool.startsWith('finance_')) return pick(RECON_REFUSALS.web);
  return pick(RECON_REFUSALS.other);
}
