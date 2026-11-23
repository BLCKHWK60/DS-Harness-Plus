/**
 * Creator Plus: a tab that builds and improves plugins so they fit everything already installed, and
 * keeps them working through updates (the owner's build prompt "Creator Plus", 16 November 2026).
 *
 * - The map (lib/map.js), read live from the running app; the passports (lib/passport.js); the fit check
 *   (lib/fit.js); the fixed rules and the guard (lib/rules.js); the trial copy, backups and the way back
 *   (lib/trial.js); the interview, brief and plan (lib/interview.js); recipes (recipes/, lib/recipes.js);
 *   the scaffold (lib/scaffold.js); the four checks and upkeep (lib/checks.js); changes (lib/change.js);
 *   learning (lib/learning.js); the session logs (lib/logs.js); the bar (lib/bar.js); Depth (lib/depth.js);
 *   hand-off (lib/handoff.js); the eight self-tests (lib/eight.js); the tools (lib/tools.js).
 * - The real setup changes only from the Creator Plus page, by the user (fixed rule 2).
 *
 * Item 4A, stage 6a: the Workshop space keeps Creator Plus's guard for any mode. Another mode in the Workshop space (a
 * guest), and a thread whose space Modes cannot read (`guardedBy: 'unknown'`), get the same fixed rules and allow-list
 * as a Creator Plus conversation, but not the creator_ tools (they need the bar and the method). `guestsGuarded: true`
 * and `allowed()` on the service tell Modes this version guards guests (STAGE6A-DESIGN.md P3).
 *
 * Off until switched on in Settings → Creator Plus. Needs the Modes add-on and the Cowork sidebar for the tab.
 * Route: `GET/POST /dsh-creator-plus/data`.
 */
import z from '@deepseek-ai/schemastery';
import { execFile, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { carriesExport } from './lib/logs.js';
import { withoutSends } from './lib/sent.js';
import { RUNS, SAVED_RUN_MARK, barState, runSentence, savedRunPrompt, savedRunsOf, startRefusal } from './lib/bar.js';
import { moveRefusal, openCards } from './lib/cards.js';
import { filesOf, mismatched } from './lib/change.js';
import { depthText, questionRefusal } from './lib/depth.js';
import { runCodeParts, scoreText } from './lib/eight.js';
import { openLearning } from './lib/learning.js';
import { buildMap, mapText } from './lib/map.js';
import { MODE_ID, withCreator } from './lib/mode.js';
import { readOrigin } from './lib/passport.js';
import { LOG_READERS, providerPlace } from './lib/place.js';
import { loadRecipes } from './lib/recipes.js';
import { ALLOWED, BUILD_FOLDER, FIXED_RULES, GUEST_EXTRA, NOT_ALLOWED, WORKSHOP_GUEST_CREATOR_TOOLS, WORKSHOP_GUEST_NOTE, folderRefusal, guardRefusal, guestRefusal, guestText, real, within } from './lib/rules.js';
import { makeGuardOf } from './lib/space-guard.js';
import { sandboxed } from './lib/sandbox.js';
import { scanAddon, scanAddons } from './lib/scan.js';
import { buildTools } from './lib/tools.js';
import { appPrograms, openBackups, openTrial } from './lib/trial.js';
import { openRuns } from './lib/runs.js';
import { createHash } from 'node:crypto';

export const name = 'dsh-creator-plus';
export const DATA_PATH = '/dsh-creator-plus/data';
/** The app's tools service: the final rule is a `tools.guard`. */
export const inject = ['tools'];
const MODES_NS = 'modes';
const NS = 'creator-plus';
const HERE = dirname(fileURLToPath(import.meta.url));
/** Item 4A, stage 6a: the spaces whose guard is Creator Plus's: Workshop, and a thread whose space Modes could not read. */
const GUEST_SPACES = ['workshop', 'unknown'];

export const Config = z.object({
  /** The Creator Plus mode, the Workshop space and their tools. Off leaves nothing of it in the app; its folder stays. */
  enabled: z.boolean().default(false).volatile(),
  /** Which models may read the thread logs: this-mac (default), my-network, any. */
  logReaders: z.string().default('this-mac').volatile(),
  /** Models the user marked as strong, one "provider/model" per line: they may replace a recipe's default steps. */
  strongModels: z.string().default('').volatile(),
  /** A Plus folder with its tests (the installed copy carries none), for upkeep and changes. Empty: tests are not run. */
  plusFolder: z.string().default('').volatile(),
  /** Saved runs of the bar, as JSON: [{ name, state, sentence }]. */
  savedRuns: z.string().default('[]').volatile(),
  /** Each thread's bar, as JSON: { sessionId: { selection, all, run, lookOnly, logsFrom } }. */
  sessionBars: z.string().default('{}').volatile(),
});

function plain(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}
const readObject = (value) => {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

/**
 * Run a fixed command, never through a shell: the app's own Node with ELECTRON_RUN_AS_NODE, the app's CLI
 * with the trial folder. A sandboxed one (`pureEnv`) gets its environment alone. Every program runs in a
 * process group of its own, and when it ends (or its time is up) the whole group is stopped, so nothing of
 * it lives on (a plugin's own code may not start child processes at all: lib/sandbox.js).
 */
function runFixed(file, args, { env = {}, cwd, timeoutMs = 120_000, pureEnv = false } = {}) {
  return new Promise((done) => {
    let child;
    try {
      // `pureEnv` (every sandboxed program): this environment alone, never the app's own, which holds keys.
      child = spawn(file, args, { cwd, shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: pureEnv ? env : { ...process.env, ELECTRON_RUN_AS_NODE: '1', ...env } });
    } catch (error) {
      done({ code: 1, stdout: '', stderr: String(error?.message ?? error) });
      return;
    }
    let stdout = '';
    let stderr = '';
    const cap = 32 * 1024 * 1024;
    child.stdout.on('data', (chunk) => { if (stdout.length < cap) stdout += chunk; });
    child.stderr.on('data', (chunk) => { if (stderr.length < cap) stderr += chunk; });
    const stopGroup = () => {
      try {
        process.kill(-child.pid, 'SIGKILL');
      } catch {
        /* the group is gone */
      }
    };
    const timer = setTimeout(stopGroup, timeoutMs);
    child.on('error', (error) => { stderr += String(error?.message ?? error); });
    // The moment the program itself ends, whatever it left in its group is stopped (before its output closes).
    child.on('exit', stopGroup);
    child.on('close', (code) => {
      clearTimeout(timer);
      stopGroup();
      done({ code: typeof code === 'number' ? code : 1, stdout, stderr });
    });
  });
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 * @param {object} [standIns] - for tests: `home`, `realHome`, `plusDir`, `programs`, `run` (put in the sandbox all the same),
 *   `sandboxExists`, `approve`, `reader`, `appVersion`.
 */
export function apply(ctx, config, standIns = {}) {
  const enabled = () => plain(config?.enabled) === true;
  const warn = (text) => ctx.logger?.warn?.(`creator-plus: ${text}`);
  const homeOf = ctx.get('dshHomePath');
  const home = standIns.home ?? (typeof homeOf === 'function' ? homeOf('creator-plus') : '');
  const realHome = standIns.realHome ?? (typeof homeOf === 'function' ? homeOf('') : '');
  const plusDir = standIns.plusDir ?? dirname(HERE);
  const programs = standIns.programs ?? appPrograms();
  // Every program Creator Plus starts (the checks, the tests, the trial copy) runs in the sandbox: a plugin's
  // code was written by a model, so it gets no network and sees only its own folder and the trial copy.
  const run = sandboxed(standIns.run ?? runFixed, { readOnly: [programs.bundle ?? ''], programs: [programs.node ?? '', programs.dsh ?? ''].filter(Boolean), dataHome: realHome, ...(standIns.userHome ? { home: standIns.userHome } : {}), ...(standIns.sandboxExists ? { exists: standIns.sandboxExists } : {}) });
  // Every sandboxed program in a fresh run folder of its own, filled by the host before it starts (lib/runs.js).
  const runs = () => openRuns({ home, run });
  const backups = () => openBackups({ home });
  const setting = (key) => plain(config?.[key]);
  const modes = () => {
    try {
      return ctx.get('modes');
    } catch {
      return undefined;
    }
  };
  /** The parent a header names: a string, or an object with an id (Item 4A, stage 6a). */
  const parentOf = (agent) => {
    const raw = agent?.header?.parentSession ?? agent?.session?.header?.parentSession;
    const id = raw && typeof raw === 'object' ? raw.id ?? raw.sessionId : raw;
    return id ? String(id) : '';
  };
  /** Creator Plus's own walk up the headers (up to 8 levels); a parent that is not loaded still counts. */
  const ownWalk = (agent) => {
    let id = String(agent?.id ?? '');
    let parent = parentOf(agent);
    for (let depth = 0; parent && depth < 8; depth += 1) {
      id = parent;
      let above;
      try {
        above = ctx.get('agents')?.get?.(id);
      } catch {
        above = undefined;
      }
      parent = parentOf(above);
    }
    return id;
  };
  /** The thread a helper works for. Item 4A, stage 6a: Modes' `topOf` first, the own walk with an older Modes. */
  const topOf = (agent) => {
    const id = String(agent?.id ?? '');
    const own = ownWalk(agent);
    try {
      const viaModes = modes()?.topOf?.(id);
      if (typeof viaModes === 'string' && viaModes && viaModes !== id) return viaModes;
    } catch {
      /* the own walk */
    }
    return own;
  };
  /** Item 4A, stage 6a: what Modes says about the thread's space (lib/space-guard.js; no Modes: no space). */
  const guardOf = makeGuardOf(() => ctx.get('modes'));
  const guardFor = (agent) => guardOf(typeof modes()?.guardOf === 'function' ? String(agent?.id ?? '') : topOf(agent));
  /** A Creator Plus conversation or one of its helpers (the mode test of before). */
  const isCreatorMode = (agent) => {
    const id = topOf(agent);
    try {
      return Boolean(id) && modes()?.get?.(id) === MODE_ID;
    } catch {
      return false;
    }
  };
  /**
   * Item 4A, stage 6a: whose calls Creator Plus's guard decides: the Creator Plus mode, and, while Creator Plus is on,
   * any mode in the Workshop space and any thread whose space Modes could not read (fail closed).
   */
  const inWorkshop = (agent) => isCreatorMode(agent) || (Boolean(agent) && enabled() && GUEST_SPACES.includes(guardFor(agent).guardedBy));
  const inCreator = inWorkshop;
  /** Lab fix (6a): a guest's mode by its shown name (Modes' modeName when it has one, else the id with a capital). */
  const guestModeName = (agent) => {
    const id = topOf(agent);
    let mode = '';
    try {
      mode = String(modes()?.get?.(id) ?? '');
      const shown = typeof modes()?.modeName === 'function' ? modes().modeName(mode, 'en') : '';
      if (typeof shown === 'string' && shown.trim()) return shown.trim();
    } catch {
      /* the id below */
    }
    return mode ? `${mode.charAt(0).toUpperCase()}${mode.slice(1).replace(/-/g, ' ')}` : '';
  };

  // ---- the map, kept with the one before -----------------------------------------------------------
  let cached;
  const appVersion = () => standIns.appVersion ?? (() => {
    try {
      return JSON.parse(readFileSync(join(programs.bundle ?? '', 'Contents', 'Resources', 'app.asar', 'package.json'), 'utf8')).version;
    } catch {
      return process.env.DSH_VERSION ?? '';
    }
  })();
  const plusVersion = () => {
    try {
      return readFileSync(join(plusDir, 'VERSION'), 'utf8').trim();
    } catch {
      return '';
    }
  };
  const buildNow = () => {
    let entries = [];
    try {
      const loader = ctx.get('loader') ?? ctx.loader;
      entries = loader ? [...loader.entries()] : [];
    } catch {
      entries = [];
    }
    let settings = [];
    try {
      settings = ctx.get('settings')?.describe?.({ redactSecrets: true }) ?? [];
    } catch {
      settings = [];
    }
    let tools = [];
    try {
      tools = (ctx.get('tools')?.definitions?.() ?? []).map((definition) => definition.name);
    } catch {
      tools = [];
    }
    const scans = [...scanAddons(plusDir), ...scanAddons(join(home, 'plugins'))];
    const passports = {};
    for (const scan of scans) {
      const origin = readOrigin(join(scan.folder && existsSync(join(plusDir, scan.folder)) ? join(plusDir, scan.folder) : join(home, 'plugins', scan.folder), 'passport'));
      if (origin) passports[scan.name] = origin;
    }
    return buildMap({ entries, settings, tools, scans, passports, appVersion: appVersion(), plusVersion: plusVersion() });
  };
  const map = (refresh = false) => {
    if (!cached || refresh || Date.now() - cached.at > 60_000) cached = buildNow();
    return cached;
  };
  const mapFile = () => join(home, 'map.json');
  const previousMap = () => {
    try {
      return JSON.parse(readFileSync(mapFile(), 'utf8'));
    } catch {
      return undefined;
    }
  };
  const saveMap = (fresh) => {
    try {
      mkdirSync(home, { recursive: true, mode: 0o700 });
      if (existsSync(mapFile())) renameSync(mapFile(), join(home, 'map-before.json'));
      writeFileSync(mapFile(), JSON.stringify(fresh));
    } catch (error) {
      warn(`the map could not be kept: ${String(error?.message ?? error)}`);
    }
  };

  // ---- per conversation: the bar, the plan, the Long run's start --------------------------------------
  const states = new Map();
  const conversation = (exec) => {
    const id = topOf(exec?.agent) || 'unknown';
    if (!states.has(id)) states.set(id, { id });
    return states.get(id);
  };
  const bar = (exec) => barState(readObject(setting('sessionBars'))[topOf(exec?.agent)], map().plugins.map((plugin) => plugin.name));
  const cwdOf = (exec) => {
    const header = exec?.agent?.header ?? exec?.agent?.session?.header;
    let top;
    try {
      top = ctx.get('agents')?.get?.(topOf(exec?.agent));
    } catch {
      top = undefined;
    }
    const cwd = (top?.header ?? top?.session?.header)?.cwd ?? header?.cwd;
    return typeof cwd === 'string' && isAbsolute(cwd) ? cwd : '';
  };
  const longStarts = new Map();
  const longSince = (exec) => {
    const id = topOf(exec?.agent);
    let on = false;
    try {
      on = Boolean(ctx.get('mission')?.longRun?.(id));
    } catch {
      on = false;
    }
    if (!on) {
      longStarts.delete(id);
      return undefined;
    }
    if (!longStarts.has(id)) longStarts.set(id, Date.now());
    return longStarts.get(id);
  };
  const depthOf = (exec) => {
    try {
      const depth = modes()?.depthSpoken?.(exec?.agent);
      return depth === 'quick' || depth === 'thorough' ? depth : 'standard';
    } catch {
      return 'standard';
    }
  };
  const routeOf = (exec) => {
    try {
      const current = exec?.agent?.model?.current?.();
      return current?.provider && current?.model ? { provider: String(current.provider), model: String(current.model) } : undefined;
    } catch {
      return undefined;
    }
  };
  const settingsNs = (ns) => {
    try {
      return ctx.get('settings')?.describe?.({ redactSecrets: true })?.find?.((row) => row.ns === ns)?.value;
    } catch {
      return undefined;
    }
  };
  const placeOf = (exec) => providerPlace(settingsNs('llm-pi-ai')?.providers, routeOf(exec)?.provider);
  const strong = (exec) => {
    const route = routeOf(exec);
    if (!route) return false;
    return String(setting('strongModels') ?? '').split('\n').map((line) => line.trim()).filter(Boolean).includes(`${route.provider}/${route.model}`);
  };
  /**
   * The user's newest own message, as their words: a message that carries a Recon export gives none (its
   * text is Recon's material), and a card sent with Split Plus's Send to is left out (material, never a yes).
   */
  const userSaid = (exec) => {
    try {
      const messages = exec?.agent?.session?.deriveMessages?.() ?? [];
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index];
        if (message?.role !== 'user' || message?.source?.kind !== 'user') continue;
        const content = message.content;
        const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((part) => (part?.type === 'text' ? part.text : '')).join(' ') : '';
        return carriesExport(text, logsDeps().exportsService) ? '' : withoutSends(text);
      }
    } catch {
      /* nothing said */
    }
    return '';
  };
  /** How many messages the user wrote in this conversation (a yes must come after the plan). */
  const userCount = (exec) => {
    try {
      return (exec?.agent?.session?.deriveMessages?.() ?? []).filter((message) => message?.role === 'user' && message?.source?.kind === 'user').length;
    } catch {
      return 0;
    }
  };
  const approve = standIns.approve ?? (async (exec, reason) => {
    const approval = ctx.get('approval');
    if (!approval?.request || !exec?.agent) return 'unavailable';
    try {
      return await approval.request({ agent: exec.agent, toolName: exec.name, ...(exec.callId ? { callId: exec.callId } : {}), reason, displayReason: { en: reason }, signal: exec.signal });
    } catch {
      return 'unavailable';
    }
  });

  // ---- a reader with no tools (a second read; Recon text when the user agreed) ----------------------
  const toolless = new Set();
  const reader = standIns.reader ?? (async (exec, prompt) => {
    const subagents = ctx.get('subagents');
    if (!subagents?.startActivation) throw new Error('the app\'s helper service is not available here');
    const route = routeOf(exec);
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(new Error('The reader worked for more than 10 minutes and was stopped.')), 10 * 60_000);
    timer.unref?.();
    const signal = exec?.signal ? AbortSignal.any([exec.signal, limit.signal]) : limit.signal;
    let child;
    try {
      const request = { prompt: [{ type: 'text', text: `${prompt}\n\n` }], parent: exec.agent, signal, ...(route ? { agentOptions: route } : {}) };
      child = await subagents.startActivation({ ...request, provider: 'spawn', label: 'Creator Plus reader', request, delivery: 'parent', signal });
      if (child?.childId) toolless.add(String(child.childId));
      const result = await child.result;
      if (result?.stopReason === 'error' || result?.stopReason === 'refusal') throw new Error(`the reader ${result.stopReason === 'refusal' ? 'refused' : 'failed'}`);
      return (result?.output ?? []).filter((block) => block?.type === 'text').map((block) => block.text).join('\n').trim().slice(0, 4000);
    } finally {
      clearTimeout(timer);
      if (child?.childId) toolless.delete(String(child.childId));
      Promise.resolve(child?.dispose?.()).catch(() => {});
    }
  });
  const isToolless = (agent) => {
    if (!agent?.id) return false;
    if (toolless.has(String(agent.id))) return true;
    if (!(agent.header?.parentSession ?? agent.session?.header?.parentSession)) return false;
    try {
      const first = (agent.session?.deriveMessages?.() ?? []).find((message) => message?.role === 'user');
      const text = Array.isArray(first?.content) ? first.content.map((part) => part?.text ?? '').join('\n') : String(first?.content ?? '');
      return /(?:^|\n)\s*CREATOR_READER\b/.test(text.slice(0, 4000));
    } catch {
      return false;
    }
  };

  // ---- folders and stores ---------------------------------------------------------------------------
  const trial = () => openTrial({ home, realHome, programs, runs: runs() });
  const cards = openCards(join(home || '/nonexistent', 'cards.json'));
  const learning = openLearning(join(home || '/nonexistent', 'learning.json'));
  const recipes = () => loadRecipes(join(HERE, 'recipes'), join(home, 'recipes'));
  /** The Plus folder the owner named (the repository or a download), and its add-ons folder. */
  const plusFolder = () => {
    const folder = String(setting('plusFolder') ?? '').trim();
    return folder && isAbsolute(folder) ? folder : '';
  };
  const sourcesRoot = () => {
    const folder = plusFolder();
    return folder ? (existsSync(join(folder, 'addons')) ? join(folder, 'addons') : folder) : '';
  };
  /** Whether a conversation's folder is a safe place for a build folder (rules.js folderRefusal). */
  const unsafeFolder = (exec) => folderRefusal({ cwd: cwdOf(exec), userHome: standIns.userHome, dshHome: realHome, scratch: join(realHome, 'scratch'), plusDirs: [plusDir, plusFolder()], appBundle: programs.bundle ?? '' });
  const sources = () => {
    const root = sourcesRoot();
    if (!root) return {};
    return Object.fromEntries(scanAddons(root).map((scan) => [scan.name, join(root, scan.folder)]));
  };
  const installedDir = (plugin) => {
    if (!plugin?.folder) return '';
    for (const base of [plusDir, join(home, 'plugins')]) if (existsSync(join(base, plugin.folder, 'package.json'))) return join(base, plugin.folder);
    return '';
  };
  const toolOwner = (tool) => {
    const owners = map().index.tools[tool] ?? [];
    return owners[0] ?? '';
  };
  const logsDeps = () => ({
    query: ctx.get('sessionQuery'),
    isSealed: (id) => {
      const service = modes();
      if (!service?.isolated) return true;
      return service.isolated(id) !== false;
    },
    toolOwner,
    exportsService: (() => {
      try {
        return ctx.get('reconExports');
      } catch {
        return undefined;
      }
    })(),
  });

  // ---- the mode: kept in step with the switch -----------------------------------------------------------
  let problem = '';
  let syncing = false;
  const syncMode = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const service = ctx.get('settings');
      const row = service?.describe?.().find((entry) => entry.ns === MODES_NS);
      if (!row) {
        problem = 'The Modes add-on is not running, so there is no Creator Plus mode. Switch Modes on on the Plugins page.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        problem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const on = enabled();
      const ops = [];
      const next = withCreator(row.value.extraModes, on);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      // Item 4A, stage 6b (D14): without the Cowork sidebar (and in the lab with spaces off) `defaultMode` still picks a new
      // thread's mode, so it must not name a mode that is gone. With spaces, Modes already skips a start mode whose
      // add-on is off and keeps the owner's choice (lib/spaces.js draftStartMode, startModeGone).
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = '';
    } catch (error) {
      problem = `The Creator Plus mode could not be ${enabled() ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(problem);
    } finally {
      syncing = false;
    }
  };

  // ---- the tools: there only while switched on, only in Creator Plus conversations -------------------
  let toolsOff;
  const deps = {
    enabled, conversation, map, previousMap, saveMap, bar, cwdOf, recipes, strong, learning, trial, run, node: () => programs.node || process.execPath,
    runs, backups, cards, userSaid, longSince, depthOf, approve, reader, sources, installedDir, modules: () => join(HERE, 'node_modules'), passportsHome: () => join(home, 'passports'), checkedHome: () => join(home, 'checked'),
    preparedHome: () => join(home, 'prepared'), buildsHome: () => join(home, 'builds'), folderRefusal: unsafeFolder, userCount, routeOf,
    settingsOf: () => ({ logReaders: String(setting('logReaders') ?? 'this-mac') }), placeOf, logsDeps,
    // Mission stage E: a card a Mission's helper made waits for the owner's yes in the Mission's card too.
    missionYes: async (exec, request) => {
      try {
        const mission = ctx.get('mission');
        const sessionId = String(exec?.agent?.id ?? '');
        if (typeof mission?.askYes !== 'function' || !sessionId) return undefined;
        const said = await mission.askYes({ sessionId, addon: 'creatorPlus', ...request });
        return said && typeof said === 'object' ? said : undefined;
      } catch {
        return undefined;
      }
    },
  };
  const syncTools = () => {
    const on = enabled();
    if (on && !toolsOff) {
      const tools = ctx.get('tools');
      if (!tools?.register) return;
      // The creator_ tools need the bar and Creator Plus's method: only the Creator Plus mode, never a guest.
      toolsOff = buildTools(deps).map((tool) => tools.register(tool, { when: ({ agent }) => enabled() && isCreatorMode(agent) && !isToolless(agent) }));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
    }
  };
  // ---- scheduled saved runs stop while Creator Plus is off ------------------------------------------
  // Off, a Creator Plus conversation falls back to an ordinary tab without this guard: its saved runs must
  // not go on sending. They are paused (the owner switches them on again on the Automations page).
  let scheduler;
  const pauseSaved = async () => {
    if (!scheduler?.catalog) return;
    try {
      for (const task of await scheduler.catalog()) {
        if (task?.status !== 'active' || !String(task.prompt ?? '').startsWith(SAVED_RUN_MARK)) continue;
        await scheduler.edit({ id: task.id, action: 'update', patch: { active: false } });
      }
    } catch (error) {
      warn(`could not pause the saved runs: ${String(error?.message ?? error)}`);
    }
  };
  ctx.inject(['schedule'], (inner) => {
    scheduler = inner.schedule;
    inner.effect(() => () => { scheduler = undefined; }, 'creator-plus: scheduler');
    if (!enabled()) void pauseSaved();
  });
  let wasOn = enabled();
  const follow = () => {
    void syncMode();
    try {
      syncTools();
    } catch (error) {
      warn(`could not update the tools: ${String(error?.message ?? error)}`);
    }
    const on = enabled();
    if (wasOn && !on) void pauseSaved();
    wasOn = on;
  };
  follow();
  const timer = setInterval(follow, 3000);
  timer.unref?.();
  ctx.effect(() => () => {
    clearInterval(timer);
    for (const dispose of toolsOff ?? []) if (typeof dispose === 'function') dispose();
    toolsOff = undefined;
  }, 'creator-plus: follow the switch');

  // ---- the guard: the fixed rules, the bar's boundary, the reader's lock, the Long run's quiet ----------
  // Lab re-check fix (6a, problem 4): every refusal a guest reaches is said in the guest's own mode's words, never
  // pointing to creator_ tools or the Creator Plus conversation.
  const decide = (exec) => {
    const why = decideHome(exec);
    if (!why || !exec?.agent || isCreatorMode(exec.agent) || isToolless(exec.agent)) return why;
    const name = String(exec.name ?? '');
    // Item 4A, stage 6b (J14, point 27): a guest in Workshop may schedule (no path arguments; Modes' fences decide where
    // its runs go). The home mode keeps its allow-list, without schedules (D15).
    // The 'unknown' guard (a space that could not be read) keeps refusing them (fail closed).
    if (GUEST_EXTRA.some((prefix) => name.startsWith(prefix)) && guardFor(exec.agent).guardedBy === 'workshop') return '';
    // Item 4A, stage 6a: a guest never runs Creator Plus's own tools (they change add-ons).
    if (/^creator_/.test(name)) return guestText(WORKSHOP_GUEST_CREATOR_TOOLS, { mode: guestModeName(exec.agent) });
    return guestRefusal(why, { mode: guestModeName(exec.agent), tool: name });
  };
  const decideHome = (exec) => {
    const agent = exec?.agent;
    if (!agent || !inCreator(agent)) return '';
    const name = String(exec.name ?? '');
    if (isToolless(agent)) return 'You are Creator Plus\'s reader: you have no tools. Answer with text only.';
    // Item 4A, stage 6a: a guest never runs Creator Plus's own tools (decide gives it the guest's sentence).
    if (/^creator_/.test(name) && !isCreatorMode(agent)) return NOT_ALLOWED;
    if (name === 'ask_user_question') {
      const late = questionRefusal({ longSince: longSince(exec) });
      if (late) return late;
    }
    const cwd = cwdOf(exec);
    // Writing needs a safe conversation folder; it then goes only into its build folder (creator-plus-builds).
    if (['write', 'edit', 'multi_edit'].includes(name)) {
      const unsafe = unsafeFolder(exec);
      if (unsafe) return unsafe;
    }
    // Creator Plus's own folder (backups, checked and prepared copies, the trial copy, the cards with their
    // log evidence) is never read or written by a file tool.
    const why = guardRefusal({ name, args: exec.arguments, cwd, build: cwd ? join(cwd, BUILD_FOLDER) : '', dshHome: realHome, appBundle: programs.bundle ?? '', readable: [plusDir], outside: [join(realHome, 'addons'), join(realHome, 'profiles'), join(realHome, 'sessions'), home, plusDir, plusFolder()] });
    if (why) return why;
    // The bar's selection: a plugin's own files are opened only when it is selected; a look over all the
    // plugins (their folder itself, or a folder holding it) only with "All".
    if (['read', 'glob', 'grep', 'read_image', 'pdf_read', 'pdf_info', 'pdf_search'].includes(name)) {
      const state = bar(exec);
      const args = exec.arguments ?? {};
      const named = ['file_path', 'path'].map((key) => args[key]).filter((value) => typeof value === 'string' && value.trim());
      const paths = named.map((value) => real(resolve(cwd || '/', value)));
      if ((name === 'glob' || name === 'grep') && named.length === 0 && cwd) paths.push(real(cwd));
      const roots = [{ root: plusDir, nameOf: (folder) => map().plugins.find((entry) => entry.folder === folder)?.name }];
      const repo = sourcesRoot();
      if (repo) {
        const byFolder = Object.fromEntries(Object.entries(sources()).map(([pkg, dir]) => [dir.split('/').pop(), pkg]));
        roots.push({ root: repo, nameOf: (folder) => byFolder[folder] });
      }
      for (const path of paths) {
        for (const { root, nameOf } of roots) {
          const base = real(root);
          if (within(base, path)) {
            if (!state.all) return 'That would look into every plugin at once: only with "All" picked on the bar. Name a selected plugin\'s folder instead.';
            continue;
          }
          if (!within(path, base)) continue;
          const folder = path.slice(base.length + 1).split('/')[0];
          const pkg = nameOf(folder);
          if (pkg && !state.selection.includes(pkg)) return `${pkg} is outside this run's selection: Creator Plus sees only its place on the map (creator_map). Ask the user to add it on the bar if it must be opened.`;
        }
      }
    }
    return '';
  };
  ctx.on('tools/pre-execute', async (exec, next) => {
    try {
      const reason = decide(exec);
      if (reason) return { kind: 'deny', reason };
    } catch (error) {
      warn(`could not check a tool call: ${String(error?.message ?? error)}`);
      if (exec?.agent && inCreator(exec.agent)) return { kind: 'deny', reason: 'Creator Plus could not check this call, so it was not run.' };
    }
    return next();
  });
  ctx.effect(() => ctx.tools?.guard?.((exec) => {
    try {
      return decide(exec) || undefined;
    } catch {
      return exec?.agent && inCreator(exec.agent) ? 'Creator Plus could not check this call, so it was not run.' : undefined;
    }
  }), 'creator-plus: the rules, final');

  // ---- a note in every Creator Plus conversation: the bar, Depth, what was learned --------------------
  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(() => agent.ctx.systemPrompt.section({
        name: 'creator-plus:note',
        order: 59,
        interpolate: false,
        text: () => {
          try {
            if (!enabled() || topOf(agent) !== agent.id) return '';
            // Item 4A, stage 6a: another mode in the Workshop space gets the guest note (top-level only).
            if (modes()?.get?.(agent.id) !== MODE_ID) return guardOf(agent.id).guardedBy === 'workshop' ? WORKSHOP_GUEST_NOTE : '';
            const exec = { agent };
            const state = bar(exec);
            const current = map();
            const learned = learning.forPrompt();
            return [
              `The bar: ${runSentence(state, { depth: depthOf(exec) })} ${state.selection.length === 0 ? 'Nothing is selected: build a new plugin, or ask the user to select the plugins to work on.' : `Selected: ${state.selection.join(', ')}.`}`,
              `The setup: app ${current.app.version || '?'}, Plus ${current.plus.version || '?'}, ${current.plugins.length} plugins (creator_map shows them).`,
              depthText(depthOf(exec), { long: Boolean(longSince(exec)) }),
              learned,
            ].filter(Boolean).join('\n');
          } catch {
            return '';
          }
        },
      }), 'creator-plus note');
      sections.set(agent.id, dispose);
    } catch (error) {
      warn(`could not add the note: ${String(error?.message ?? error)}`);
    }
  };
  ctx.on('agent/created', ({ agent }) => install(agent));
  ctx.on('agent/disposed', ({ agent }) => {
    sections.delete(agent?.id);
    states.delete(agent?.id);
    longStarts.delete(agent?.id);
  });
  try {
    for (const agent of ctx.get('agents')?.list?.() ?? []) install(agent);
  } catch {
    /* agents appear later */
  }

  // ---- the service: saved runs for the Automations tab -----------------------------------------------
  ctx.effect(() => ctx.provide('creatorPlus', Object.freeze({
    apiVersion: 1,
    /** Item 4A, stage 6a: this version guards guests in the Workshop space (Modes opens Workshop to other modes only then). */
    guestsGuarded: true,
    /**
     * Item 4A, stage 6a: the Workshop allow-list (tool names), for the Settings line that says what a mode loses there.
     * @returns {readonly string[]} the names, sorted.
     */
    // Stage 6b (3.4): what a guest may run in Workshop: the allow-list plus the schedule tools (prefix form).
    allowed: () => Object.freeze([...ALLOWED, ...GUEST_EXTRA].sort()),
    /** @returns {{name: string, sentence: string}[]} the saved runs (empty while switched off). */
    savedRuns: () => (enabled() ? savedRunsOf(setting('savedRuns')).map(({ name: runName, sentence }) => ({ name: runName, sentence })) : []),
    /** @returns {string} the message an automation sends for a saved run ('' when there is none). */
    savedRunPrompt: (runName) => {
      const found = savedRunsOf(setting('savedRuns')).find((item) => item.name === String(runName ?? ''));
      return found && enabled() ? savedRunPrompt(found) : '';
    },
    /**
     * Mission asks this at the start of a Long run (as it asks Bench): in a Creator Plus conversation, its
     * check commands run in Mission's strictest fence (no network, nothing of the home folder, writing only
     * in the run's folder) with no keys in their environment, and its helpers run no commands. Undefined
     * anywhere else and while Creator Plus is off: Mission as always. Item 4A, stage 6a: also for any mode in the
     * Workshop space, and for a thread whose space Modes could not read.
     * @param {string} id - the conversation.
     * @returns {{offlineChecks: true, cleanEnv: true} | undefined} the rules.
     */
    longRunRules: (id) => {
      try {
        if (!enabled()) return undefined;
        if (modes()?.get?.(String(id ?? '')) !== MODE_ID && !GUEST_SPACES.includes(guardOf(String(id ?? '')).guardedBy)) return undefined;
        // A Long run checks its work in the conversation's folder: a folder Creator Plus would not build in is refused.
        let agent;
        try {
          agent = ctx.get('agents')?.get?.(String(id));
        } catch {
          agent = undefined;
        }
        const why = unsafeFolder({ agent: agent ?? { id: String(id), header: {} } });
        return { offlineChecks: true, cleanEnv: true, ...(why ? { refuse: why } : {}) };
      } catch {
        return undefined;
      }
    },
    /**
     * Mission stage E: the owner pressed Allow in a Mission's card for a ready plugin or a prepared change that a
     * Mission's helper made. It does what Apply on that card in Settings → Creator Plus does, with the same checks
     * (the checked copy unchanged, a way back kept); only for that conversation's own card.
     * @param {{sessionId: string, key?: string, ref: {card: string}}} request
     * @returns {Promise<{ok: boolean, text: string}>}
     */
    missionAllow: async (request) => {
      try {
        if (!enabled()) return { ok: false, text: 'Creator Plus is switched off in Settings → Creator Plus.' };
        const card = cards.get(String(request?.ref?.card ?? ''));
        if (!card) return { ok: false, text: 'That card is not on the Creator Plus page any more.' };
        if (!card.conversation || card.conversation !== String(request?.sessionId ?? '')) return { ok: false, text: 'That card belongs to another thread.' };
        if (card.status === 'applied') return { ok: true, text: 'Already applied from Settings → Creator Plus.' };
        return { ok: true, text: await applyById(card.id) };
      } catch (error) {
        return { ok: false, text: String(error?.message ?? error).slice(0, 400) };
      }
    },
  })), 'creator-plus service');

  // ---- the page's data and the user's buttons ---------------------------------------------------------
  const mutate = async (ops) => {
    const service = ctx.get('settings');
    if (!service?.mutate) throw new Error('The settings service is not running.');
    await service.mutate(NS, ops);
  };
  /** The most of a plugin's code the page shows in full (lib/tools.js SHOW_MAX); what is longer is not installed. */
  const SHOW_MAX = 2_000_000;
  const hashOfFile = (path) => {
    try {
      return createHash('sha256').update(readFileSync(path)).digest('hex');
    } catch {
      return '';
    }
  };
  /**
   * A checked plugin's code as the page shows it: every file but its modules in full (binary files named),
   * and whether its modules are exactly Creator Plus's own (the only modules a built plugin may carry).
   */
  const codeOf = (folder) => {
    const files = [];
    const binary = [];
    const modules = [];
    let size = 0;
    for (const rel of filesOf(folder)) {
      if (rel.startsWith('node_modules/')) {
        if (hashOfFile(join(folder, rel)) !== hashOfFile(join(HERE, rel)) || !hashOfFile(join(HERE, rel))) modules.push(rel);
        continue;
      }
      let bytes;
      try {
        bytes = readFileSync(join(folder, rel));
      } catch {
        binary.push(rel);
        continue;
      }
      if (bytes.includes(0)) {
        binary.push(rel);
        continue;
      }
      size += bytes.length;
      files.push({ path: rel, text: bytes.toString('utf8') });
    }
    return { files, binary, modules, tooLong: size > SHOW_MAX };
  };
  const applyCard = async (card) => {
    if (card.kind === 'new-plugin') {
      const manager = ctx.get('pluginManager');
      if (!manager?.installBundle) throw new Error('The app\'s plugin manager is not available here: install it with the Plus installer instead.');
      const folder = String(card.data?.folder ?? '');
      if (!folder || !within(real(folder), real(join(home, 'checked'))) || !existsSync(join(folder, 'package.json'))) throw new Error('The checked copy of this add-on is gone; run creator_check again.');
      // What is installed is what was checked: every file as it was, nothing added.
      const differs = mismatched(folder, card.data?.hashes);
      const extra = filesOf(folder).filter((rel) => !Object.hasOwn(card.data?.hashes ?? {}, rel));
      if (differs.length > 0 || extra.length > 0) throw new Error(`The checked copy changed since the checks (${[...differs, ...extra].slice(0, 5).join(', ')}): nothing was installed. Run creator_check again.`);
      // A new plugin never replaces one that is there (the fit check blocks its name; checked again now).
      const name = String(card.data?.name ?? '');
      if (!name || map(true).plugins.some((plugin) => plugin.name === name)) throw new Error(`${name || 'This add-on'} is already an add-on of your setup: a new add-on never replaces one. Nothing was installed.`);
      // What cannot be shown in full is not installed: binary files, modules other than Creator Plus's own, too much code.
      const code = codeOf(folder);
      if (code.binary.length || code.modules.length || code.tooLong) throw new Error(`This add-on cannot be shown in full (${code.binary.length ? `binary files: ${code.binary.slice(0, 3).join(', ')}` : code.modules.length ? `modules that are not Creator Plus's own: ${code.modules.slice(0, 3).join(', ')}` : 'too much code'}), so it is not installed from here.`);
      const target = join(home, 'plugins', folder.split('/').pop());
      if (existsSync(target)) throw new Error(`There is already an add-on folder ${folder.split('/').pop()} from an earlier Apply: Remove that one first. Nothing was installed.`);
      mkdirSync(join(home, 'plugins'), { recursive: true });
      cpSync(folder, target, { recursive: true, dereference: false, filter: (path) => !/\/test(\/|$)/.test(path.slice(folder.length)) });
      const result = await manager.installBundle(target, { activate: true });
      return { text: `Installed in your real setup (${String(result?.application ?? 'done')}). Way back: Remove on this card.`, data: { installed: target } };
    }
    if (card.kind === 'change') {
      const plugin = map().plugins.find((entry) => entry.name === card.plugin);
      if (!plugin || plugin.locked) throw new Error('That add-on cannot be changed here.');
      const target = installedDir(plugin);
      if (!target) throw new Error(`${plugin.name}'s folder was not found.`);
      const copy = String(card.data?.copy ?? '');
      if (!copy || !within(real(copy), real(join(home, 'prepared')))) throw new Error('The prepared copy of this change is gone; prepare it again.');
      if (card.data?.cut !== false) throw new Error('This change is too long to show in full on the card, so it is not applied from here.');
      // What is applied is what was shown on the card: every changed file as it was reviewed.
      const differs = mismatched(copy, card.data?.hashes);
      const files = card.data?.files ?? [];
      if (differs.length > 0 || files.some((rel) => !Object.hasOwn(card.data?.hashes ?? {}, rel))) throw new Error(`The prepared change differs from the one on this card (${differs.slice(0, 5).join(', ')}): nothing was applied.`);
      const backup = backups().keep(target, `${plugin.folder}-before-apply`);
      for (const rel of files) {
        const from = join(copy, rel);
        mkdirSync(dirname(join(target, rel)), { recursive: true });
        cpSync(from, join(target, rel));
      }
      return { text: `Applied to ${plugin.name} in your real setup; it takes effect when the app starts again. Way back: Undo on this card. A Plus update replaces it; the installer keeps your changed files.`, data: { applyBackup: backup } };
    }
    throw new Error('Only a ready add-on or a prepared change can be applied.');
  };
  /**
   * Apply a card: the page's Apply, and Allow in a Mission's card (Mission stage E), which does exactly the same.
   * Marked first, so a second click while it runs is refused (MOVES has no "applying" → apply).
   * @returns {Promise<string>} what was done.
   */
  const applyById = async (cardId) => {
    const card = cards.get(String(cardId ?? ''));
    if (!card) throw new Error('There is no such card.');
    const refusal = moveRefusal(card, 'apply');
    if (refusal) throw new Error(refusal);
    cards.set(card.id, 'applying');
    let done;
    try {
      done = await applyCard(card);
    } catch (error) {
      cards.set(card.id, card.status);
      throw error;
    }
    cards.set(card.id, 'applied', done.text, done.data);
    return done.text;
  };
  const view = (session = '') => {
    // Switched off, the page and the bar get the switch alone, and nothing is read.
    if (!enabled()) return { at: Date.now(), enabled: false, problem, ...(session ? { session: { inCreator: false } } : {}) };
    const current = map();
    const bars = readObject(setting('sessionBars'));
    let backups = [];
    try {
      backups = existsSync(join(home, 'backups')) ? readdirSync(join(home, 'backups')).sort().reverse().slice(0, 40) : [];
    } catch {
      backups = [];
    }
    return {
      at: Date.now(),
      enabled: enabled(),
      problem,
      rules: FIXED_RULES,
      logReaders: String(setting('logReaders') ?? 'this-mac'),
      logReaderChoices: Object.entries(LOG_READERS).map(([id, entry]) => ({ id, label: entry.label })),
      strongModels: String(setting('strongModels') ?? ''),
      plusFolder: String(setting('plusFolder') ?? ''),
      savedRuns: savedRunsOf(setting('savedRuns')),
      runs: RUNS,
      map: { app: current.app.version, plus: current.plus.version, plugins: current.plugins.map((plugin) => ({ name: plugin.name, id: plugin.id, origin: plugin.origin, locked: plugin.locked, enabled: plugin.enabled, folder: plugin.folder })), modes: current.modes },
      cards: cards.list().slice(-120).reverse(),
      learning: learning.list().slice(-120).reverse(),
      backups,
      // Item 4A, stage 6a: any mode in the Workshop space gets the bar (its reads follow the bar's selection).
      ...(session ? { session: { inCreator: enabled() && inWorkshop({ id: session }), guest: !isCreatorMode({ id: session }), bar: barState(bars[session], current.plugins.map((plugin) => plugin.name)) } } : {}),
    };
  };
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: DATA_PATH,
      handler: async (req, res) => {
        const refused = inner.connection.requestRejection(req);
        if (refused !== undefined) {
          res.statusCode = refused;
          res.end();
          return;
        }
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        try {
          let note = '';
          if (req.method === 'POST') {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 65536) throw new Error('request too large');
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
            const session = String(body.sessionId ?? '').slice(0, 200);
            if (body.action === 'bar') {
              if (!session) throw new Error('Which thread?');
              const state = barState(body.state, map().plugins.map((plugin) => plugin.name));
              await mutate([{ op: 'set', path: ['sessionBars'], value: JSON.stringify({ ...readObject(setting('sessionBars')), [session]: state }) }]);
              note = runSentence(state);
            } else if (body.action === 'start') {
              const state = barState(body.state, map().plugins.map((plugin) => plugin.name));
              const why = startRefusal(state);
              if (why) throw new Error(why);
              note = runSentence(state);
            } else if (body.action === 'saveRun') {
              const runName = String(body.name ?? '').trim().slice(0, 60);
              if (!runName) throw new Error('Give the run a name.');
              const state = barState(body.state, map().plugins.map((plugin) => plugin.name));
              const list = savedRunsOf(setting('savedRuns')).filter((item) => item.name !== runName);
              await mutate([{ op: 'set', path: ['savedRuns'], value: JSON.stringify([...list, { name: runName, state, sentence: runSentence(state) }].slice(-30)) }]);
              note = `Saved "${runName}".`;
            } else if (body.action === 'deleteRun') {
              await mutate([{ op: 'set', path: ['savedRuns'], value: JSON.stringify(savedRunsOf(setting('savedRuns')).filter((item) => item.name !== String(body.name ?? ''))) }]);
            } else if (body.action === 'card') {
              const card = cards.get(String(body.id ?? ''));
              if (!card) throw new Error('There is no such card.');
              // Each button only where it makes sense for the card's state (apply once, undo only what was applied).
              const refusal = moveRefusal(card, String(body.act ?? ''));
              if (refusal) throw new Error(refusal);
              if (body.act === 'later') cards.set(card.id, 'later');
              else if (body.act === 'never') {
                cards.set(card.id, 'never');
                learning.propose({ kind: 'preference', key: `never:${card.kind}`, text: `Do not suggest again: ${card.title}`, reason: 'The user pressed "Do not suggest this again".', from: 'page' });
              } else if (body.act === 'try') {
                const folder = String(card.data?.copy ?? card.data?.folder ?? '');
                // Only a copy kept in Creator Plus's own folder (out of reach of the file tools and the sandbox).
                if (!folder || !(within(real(folder), real(join(home, 'checked'))) || within(real(folder), real(join(home, 'prepared'))))) throw new Error('This card has nothing to try.');
                const tried = await trial().check([folder]);
                cards.set(card.id, 'tried', tried.ok ? 'Tried in a trial copy: it installed and loaded without warnings.' : `Tried in a trial copy: ${String(tried.problem || tried.warnings).slice(0, 400)}`);
              } else if (body.act === 'apply') {
                note = await applyById(card.id);
              } else if (body.act === 'undo') {
                if (card.kind === 'new-plugin') {
                  const manager = ctx.get('pluginManager');
                  if (!manager?.removeBundle) throw new Error('The app\'s plugin manager is not available here.');
                  await manager.removeBundle(String(card.data?.name ?? ''));
                  // Its folder is kept as a backup, then taken away, so it can be applied again.
                  const installed = String(card.data?.installed ?? '');
                  if (installed && within(real(installed), real(join(home, 'plugins'))) && existsSync(installed)) {
                    backups().keep(installed, `${installed.split('/').pop()}-before-remove`);
                    rmSync(installed, { recursive: true, force: true });
                  }
                } else if (card.kind === 'change') {
                  // This card's own backup, taken when it was applied (never another card's).
                  const backup = String(card.data?.applyBackup ?? '');
                  const plugin = map().plugins.find((entry) => entry.name === card.plugin);
                  if (!backup || !existsSync(backup) || !plugin) throw new Error('The backup taken when this change was applied was not found.');
                  backups().restore(backup, installedDir(plugin));
                }
                cards.set(card.id, 'undone', 'Put back as it was before.');
              } else throw new Error('unknown card action');
            } else if (body.action === 'code') {
              // The code behind a card, in full and unmasked (it is the plugin's own): a ready plugin's files, or a change and its new files.
              const card = cards.get(String(body.id ?? ''));
              if (!card || !['new-plugin', 'change'].includes(card.kind)) throw new Error('This card has no code to show.');
              let shown;
              if (card.kind === 'new-plugin') {
                const folder = String(card.data?.folder ?? '');
                if (!folder || !within(real(folder), real(join(home, 'checked')))) throw new Error('The checked copy is gone.');
                shown = { kind: 'new-plugin', ...codeOf(folder) };
              } else {
                const copy = String(card.data?.copy ?? '');
                if (!copy || !within(real(copy), real(join(home, 'prepared')))) throw new Error('The prepared copy is gone.');
                let diff = '';
                try {
                  diff = readFileSync(String(card.data?.diffFile ?? ''), 'utf8');
                } catch {
                  diff = '';
                }
                shown = { kind: 'change', diff, cut: card.data?.cut !== false, files: (card.data?.files ?? []).map((rel) => ({ path: rel, text: (() => { try { return readFileSync(join(copy, rel), 'utf8'); } catch { return ''; } })() })) };
              }
              return res.end(JSON.stringify({ code: shown }));
            } else if (body.action === 'learn') {
              const id = String(body.id ?? '');
              if (body.act === 'keep') learning.keep(id);
              else if (body.act === 'undo') learning.undo(id);
              else if (body.act === 'read') learning.markRead(id);
              else throw new Error('unknown action');
            } else if (body.action === 'selftest') {
              const results = await runCodeParts();
              note = scoreText(results);
              return res.end(JSON.stringify({ ...view(), note, selftest: results }));
            } else if (body.action === 'claim') {
              // A new conversation made by the page (a scheduled saved run's home) becomes a Creator Plus one.
              if (!enabled()) throw new Error('Creator Plus is switched off.');
              await modes()?.set?.(session, MODE_ID, { claim: true });
              // A scheduled saved run's conversation starts with that run's bar (its selection, its kind).
              if (body.run !== undefined) {
                const saved = savedRunsOf(setting('savedRuns')).find((item) => item.name === String(body.run ?? ''));
                if (!saved) throw new Error('There is no such saved run.');
                const state = barState(saved.state, map().plugins.map((plugin) => plugin.name));
                await mutate([{ op: 'set', path: ['sessionBars'], value: JSON.stringify({ ...readObject(setting('sessionBars')), [session]: state }) }]);
              }
            } else if (body.action === 'settings') {
              const ops = [];
              if (typeof body.logReaders === 'string' && LOG_READERS[body.logReaders]) ops.push({ op: 'set', path: ['logReaders'], value: body.logReaders });
              if (typeof body.strongModels === 'string') ops.push({ op: 'set', path: ['strongModels'], value: body.strongModels.split('\n').map((line) => line.trim()).filter((line) => /^[\w.:@-]+\/[\w.:@/-]+$/.test(line)).slice(0, 20).join('\n') });
              if (typeof body.plusFolder === 'string') {
                const folder = body.plusFolder.trim();
                if (folder && !isAbsolute(folder)) throw new Error('The Plus folder is a full path, such as one starting with /.');
                ops.push({ op: 'set', path: ['plusFolder'], value: folder });
              }
              if (ops.length) await mutate(ops);
            } else throw new Error('unknown action');
          } else if (req.method !== 'GET') throw new Error('only GET and POST');
          const session = new URL(req.url ?? '/', 'http://local').searchParams.get('session') ?? '';
          res.end(JSON.stringify({ ...view(session.slice(0, 200)), ...(note ? { note } : {}) }));
          void syncMode();
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 400) }));
        }
      },
    }), 'creator-plus: data route');
  });
}

export const testing = { runFixed, mapText, scanAddon };
