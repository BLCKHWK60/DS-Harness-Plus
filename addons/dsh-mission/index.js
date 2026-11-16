/**
 * Mission: three permission modes for a conversation, and checkpoints of its folder.
 *
 *   restricted  nothing outside the conversation's folder is seen or changed, and it is never
 *               asked for. Inside, new files are free; an existing file is asked for once.
 *   ask         the same inside. Outside, reading is asked for once per place; a change is asked
 *               for by the app's own sandbox.
 *   auto        free inside. Outside, as in ask.
 *
 * How the modes hold:
 *   - Every tool call is decided before it runs (`tools/pre-execute`, rules in lib/guard.js). A
 *     question goes to the user through the app's own approval card.
 *   - The conversation is put on the app's Workspace Write preset, so the app's sandbox stops
 *     writes outside the folder whatever a command does.
 *   - A checkpoint of the folder is taken at the start of every turn and before every command
 *     (lib/checkpoints.js). After a command, in restricted and ask, an existing file the user has
 *     not approved that the command changed or deleted is put back from that checkpoint.
 *
 * The `/mission` command switches a mode on and off, lists checkpoints and goes back to one, and
 * with a goal after it starts a run on several models (runner.js, lib/run.js).
 *
 * Where it does not work (lib/gate.js): an isolated conversation (Recon) is left alone (a run left
 * on there is paused at its next turn), and a run is refused, or paused, while the conversation's
 * tier has its sub-agents switched off. On such a tier the permission modes still switch: they
 * start no helpers.
 */
import z from '@deepseek-ai/schemastery';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ISOLATED_TEXT, READ_ONLY_LONG_TEXT, READ_ONLY_TABS, whyNot } from './lib/gate.js';
import { COMMAND_TOOLS, MODES, MODE_LABELS, WRITE_TOOLS, decide, modeOf, rulesNote } from './lib/guard.js';
import { exists, isInside, pathsOf, real, shown } from './lib/paths.js';
import { GIT_CANDIDATES, openCheckpoints } from './lib/checkpoints.js';
import { covered, openState } from './lib/state.js';
import { CONTEXT_MAX, LIMITS, LONG, ROLES, isLong, readLimits, readLong, readTools } from './lib/run.js';

/** `/mission` words that look at, pause, carry on or end a Long run: they work in Data and Research too. */
const LONG_WORDS = new Set(['', 'status', 'help', 'report', 'resume', 'go', 'continue', 'stop', 'pause', 'end', 'finish', 'checkpoints', 'list', 'checkpoint', 'back', 'rollback']);
import { createAwake } from './lib/awake.js';
import { PROGRAM_TOOL, STEP_TOOL, WAIT_MS, createRunner, routeOf } from './runner.js';

/** The Long run card's route: a run's view and pre-flight (GET), start and the card's buttons (POST). */
export const LONG_PATH = '/dsh-mission/long';
/** Minutes before each try again after the app stopped a Long run by itself (at most three). */
export const RETRY_MINUTES = [2, 5, 10];
/** How long a press of Run waits for its message to arrive before it counts as not pressed. */
export const ARM_MS = 30_000;
/** The most chats whose Long run settings are kept. */
const SAVED_MAX = 500;
/** What the conversation's model is told between a press of Run and the start of its run. */
export const ARMED_NOTE = `The user pressed Run: their message is the goal of a Long run that starts now in this conversation. Do not do the work yourself and call no other tool: call ${STEP_TOOL} (no arguments) once per round and tell the user in a line or two what each step did.`;

export const name = 'dsh-mission';
export const REQUEST_TOOL = 'mission_request_files';
/** The app's preset that confines writes to the folder and asks before going wider. */
const PRESET = 'workspace-write';
const REQUEST_MAX = 40;

export const Config = z.object({
  /** Off takes the /mission command and every mode away. */
  enabled: z.boolean().default(true).volatile(),
  /** The mode `/mission on` switches on: restricted, ask or auto. */
  defaultMode: z.string().default('restricted').volatile(),
  /** A run's limits: most checklist items, tries per item, review passes, steps in all. */
  maxItems: z.number().default(LIMITS.maxItems).volatile(),
  maxTries: z.number().default(LIMITS.maxTries).volatile(),
  maxReviews: z.number().default(LIMITS.maxReviews).volatile(),
  maxSteps: z.number().default(LIMITS.maxSteps).volatile(),
  /** Long run defaults (the owner's plan, Long run part; one place, as he chose): minutes, laps, use the full time. */
  longMinutes: z.number().default(LONG.minutes).volatile(),
  longLaps: z.number().default(LONG.laps).volatile(),
  longFullTime: z.boolean().default(false).volatile(),
  /** Keep the Mac awake while a Long run is on (on power; on battery only with longBattery). */
  longKeepAwake: z.boolean().default(true).volatile(),
  longBattery: z.boolean().default(false).volatile(),
  /** When the app stops giving a Long run rounds by itself, try again up to 3 times, minutes apart. */
  longRetry: z.boolean().default(true).volatile(),
  /** Long run helpers think by role: planner and reviewer High, workers Medium (Model Tiers leaves them alone). */
  longEffort: z.boolean().default(true).volatile(),
  /** Minutes a helper waits for the user's yes before the item is set aside. 0 waits without end. */
  waitMinutes: z.number().default(LIMITS.waitMinutes).volatile(),
  /** The models for the roles, as JSON: `{ plan: {provider, model}, implement: {…}, review: {…} }`. Empty follows Model Tiers. */
  roles: z.string().default('{}').volatile(),
  /** The same per project, as JSON keyed by the project's folder. A project's choice wins over `roles`. */
  projects: z.string().default('{}').volatile(),
});

function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return plain(value.get());
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * Settings as plain checked values.
 * @param {object} config - live Config.
 * @returns {{enabled: boolean, defaultMode: string}} the settings.
 */
export function readSettings(config) {
  const mode = String(plain(config?.defaultMode) ?? '');
  const object = (value) => {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value || '{}') : value;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const rolesOf = (value) => Object.fromEntries(ROLES.map((role) => [role, routeOf(value?.[role])]).filter(([, route]) => route));
  const projects = {};
  for (const [folder, value] of Object.entries(object(plain(config?.projects))).slice(0, 100)) {
    const roles = rolesOf(value);
    if (folder && Object.keys(roles).length > 0) projects[folder] = roles;
  }
  return {
    enabled: plain(config?.enabled) !== false,
    defaultMode: MODES.includes(mode) ? mode : 'restricted',
    limits: readLimits({ maxItems: plain(config?.maxItems), maxTries: plain(config?.maxTries), maxReviews: plain(config?.maxReviews), maxSteps: plain(config?.maxSteps), waitMinutes: plain(config?.waitMinutes) }),
    roles: rolesOf(object(plain(config?.roles))),
    projects,
    long: {
      ...readLong({ minutes: plain(config?.longMinutes), laps: plain(config?.longLaps), fullTime: plain(config?.longFullTime) === true }),
      keepAwake: plain(config?.longKeepAwake) !== false,
      battery: plain(config?.longBattery) === true,
      retry: plain(config?.longRetry) !== false,
      effort: plain(config?.longEffort) !== false,
    },
  };
}

/** What `/mission` with nothing after it says. */
export const HELP = [
  'Mission keeps the assistant inside this conversation\'s folder, takes checkpoints you can go back to, and can work on a goal with several models.',
  '',
  '/mission <your goal>  start a run: a planner writes a checklist, workers do it, commands prove it, a reviewer checks it',
  '/mission auto <goal>  the same, in the mode named first (restricted, ask or auto)',
  '/mission stop         pause the run        /mission resume   carry on',
  '/mission end          close the run now, with a report',
  '/mission report       how the run stands, or its final report',
  '',
  '/mission restricted   nothing outside the folder; inside, asks once per existing file before changing it',
  '/mission ask          the same inside; may ask you to read or change something outside',
  '/mission auto         free inside the folder; must ask for anything outside',
  '/mission on           switch on the mode chosen in Settings → Mission',
  '/mission off          switch the mode off',
  '/mission checkpoint   take a checkpoint now (a name may follow)',
  '/mission checkpoints  list the checkpoints',
  '/mission back 12      put the folder back as it was at checkpoint 12',
  '',
  'Not available in an isolated conversation (Recon). A run needs helper models: its tier must have Sub-agents on (Settings → Model Tiers).',
].join('\n');

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const settings = () => readSettings(config);
  const warn = (text) => ctx.logger?.warn?.(`mission: ${text}`);
  const home = ctx.get('dshHomePath');
  const state = openState(typeof home === 'function' ? join(home('mission'), 'conversations.json') : '');
  ctx.effect(() => () => {
    try {
      state.flush();
    } catch {
      /* nothing to keep */
    }
  }, 'mission: keep the record');

  // ---- which conversation a call belongs to --------------------------------------------------

  const parentOf = (agent) => agent?.header?.parentSession ?? agent?.session?.header?.parentSession;
  const folderOf = (agent) => {
    // A Scratch conversation works in its own sub-folder of the Scratch place (the Cowork sidebar
    // knows it); its checks and checkpoints belong there, not in the place shared by every thread.
    try {
      const own = ctx.get('coworkScratch')?.folderOf?.(agent);
      if (typeof own === 'string' && own) return own;
    } catch {
      /* not a Scratch conversation, or no Cowork sidebar */
    }
    const header = agent?.header ?? agent?.session?.header;
    return typeof header?.cwd === 'string' ? header.cwd : '';
  };
  /** A helper agent works for a conversation: the conversation's mode is the helper's mode. */
  const ownerOf = (agent) => {
    let id = agent?.id;
    let parent = parentOf(agent);
    for (let depth = 0; parent && depth < 8 && !state.get(id); depth += 1) {
      id = parent;
      let above;
      try {
        above = (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === id);
      } catch {
        above = undefined;
      }
      parent = parentOf(above);
    }
    return id;
  };
  /**
   * Whether a conversation, or the one a helper works for, is isolated (Recon). Other add-ons leave
   * it alone. A Modes add-on that cannot answer counts as isolated, as Modes itself says.
   */
  const isolated = (id) => {
    try {
      return ctx.get('modes')?.isolated?.(id) === true;
    } catch {
      return true;
    }
  };
  /** @returns {string} the conversation's tab (Modes' mode id), '' when Modes cannot say. */
  const tabOf = (id) => {
    try {
      return String(ctx.get('modes')?.get?.(id) ?? '');
    } catch {
      return '';
    }
  };
  /** @returns {object | null} the conversation's tier from Model Tiers (its `subagents` gate), or null. */
  const tierOf = (id) => {
    try {
      return ctx.get('modelTiers')?.resolveTier?.(id) ?? null;
    } catch {
      return null;
    }
  };

  /** @returns {{id: string, entry: object} | undefined} the conversation's mode, when one is on. */
  const guardOf = (agent) => {
    if (!settings().enabled || !agent?.id) return undefined;
    const id = ownerOf(agent);
    // A mode an earlier version let through in an isolated conversation is left alone.
    if (!id || isolated(id)) return undefined;
    const entry = state.get(id);
    return entry ? { id, entry } : undefined;
  };

  // Other add-ons ask which permission mode a conversation is in ('' when none is on).
  /** The runner, made further down; the service reaches it through this. */
  const runnerRef = { current: undefined };
  /** Long runs about to start: their tools are given before the first round (conversation id -> tools). */
  const pendingLong = new Map();
  /** Conversations whose Run button was pressed: their next message of yours starts a Long run (id -> {at, timer}). */
  const armed = new Map();
  /** Long runs being started from a message (id -> a promise that never fails). */
  const starting = new Map();
  /** Why the last press of Run did not start a run (id -> {at, text}), shown by the button and told to the model. */
  const startErrors = new Map();
  // Other add-ons ask which permission mode a conversation is in ('' when none is on), follow runs
  // (events, view), and Model Tiers asks whose effort a Long run sets (its helpers', by role).
  ctx.effect(() => ctx.provide('mission', Object.freeze({
    apiVersion: 1,
    mode: (agentId) => {
      try {
        const agent = (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === agentId);
        return String(guardOf(agent)?.entry?.mode ?? '');
      } catch {
        return '';
      }
    },
    onEvent: (listener) => runnerRef.current?.onEvent(listener) ?? (() => {}),
    isRunning: (id) => runnerRef.current?.isOn(String(id ?? '')) === true,
    /**
     * The tools of a Long run in a conversation, for Modes: a run that has not ended (also paused).
     * @returns {{files: boolean, web: boolean} | undefined} undefined when none, or for a run from before tools were chosen.
     */
    longRun: (id) => {
      const key = String(id ?? '');
      if (pendingLong.has(key)) return { ...pendingLong.get(key) };
      const run = runnerRef.current?.runOf(key);
      return run && isLong(run) && !run.endedAt && run.long?.tools ? { ...run.long.tools } : undefined;
    },
    view: (id) => runnerRef.current?.view(String(id ?? '')),
    ownsEffort: (agent) => {
      try {
        const parent = parentOf(agent);
        return Boolean(parent) && runnerRef.current?.effortByRole(String(parent)) === true;
      } catch {
        return false;
      }
    },
  })), 'mission service');

  /** Folder -> its checkpoint store. */
  const stores = new Map();
  const pointsOf = (root) => {
    if (!stores.has(root)) stores.set(root, openCheckpoints(root));
    return stores.get(root);
  };
  /** Conversation id -> the checkpoint being taken at the start of its turn. */
  const settling = new Map();
  const settle = (id, work) => {
    const done = work.catch((error) => warn(`no checkpoint: ${String(error?.message ?? error)}`)).finally(() => {
      if (settling.get(id) === done) settling.delete(id);
    });
    settling.set(id, done);
    return done;
  };

  // ---- the rules, in every guarded conversation ----------------------------------------------

  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(
        () =>
          agent.ctx.systemPrompt.section({
            name: 'mission:rules',
            order: 57,
            interpolate: false,
            text: () => {
              try {
                if (ctx.get('modes')?.isolated?.(agent.id) === true) return '';
                // Between a press of Run and its run's start: the model is told what is coming.
                if ((armed.has(agent.id) || starting.has(agent.id)) && !runner.isOn(agent.id)) return ARMED_NOTE;
                const guard = guardOf(agent);
                if (!guard) return '';
                // The conversation's own model conducts a run; its helpers do the work.
                const conducting = guard.id === agent.id ? runner.note(agent.id, viaProgram(agent)) : '';
                return [rulesNote(guard.entry.mode, guard.entry.root), conducting].filter(Boolean).join('\n\n');
              } catch {
                return '';
              }
            },
          }),
        'mission rules',
      );
      sections.set(agent.id, dispose);
    } catch (error) {
      warn(`could not add the rules: ${String(error?.message ?? error)}`);
    }
  };
  ctx.on('agent/created', ({ agent }) => install(agent));
  ctx.on('agent/disposed', ({ agent }) => sections.delete(agent?.id));
  try {
    for (const agent of ctx.get('agents')?.list?.() ?? []) install(agent);
  } catch {
    /* agents appear later */
  }
  ctx.effect(() => () => {
    for (const dispose of sections.values()) {
      try {
        dispose?.();
      } catch {
        /* the conversation may already be closing */
      }
    }
    sections.clear();
  }, 'mission: rules');

  // Stop in the conversation pauses the run and ends the step under way, with its helpers.
  ctx.on('session/event', (session, event) => {
    try {
      const reason = event?.type === 'turn/end' ? event.data?.reason : undefined;
      if (reason?.kind !== 'aborted' || reason.reason?.kind !== 'user' || !runner.isOn(session?.id)) return;
      // The step ends at once. The pause is written a moment later: the app does not take a new
      // entry for a conversation while it is still handing this one out.
      runner.cut(session.id);
      const agent = (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === session.id);
      if (agent) setTimeout(() => {
        try {
          runner.stop(agent);
        } catch (error) {
          warn(`could not pause the run on Stop: ${String(error?.message ?? error)}`);
        }
      }, 0);
    } catch (error) {
      warn(`could not pause the run on Stop: ${String(error?.message ?? error)}`);
    }
  });

  /**
   * Run something a moment after a session event. Inside the app's `session/event` listeners a
   * goal cannot be paused (`goals.pause` writes to the conversation, and the app refuses that while
   * it is still handing out this event: "session append cannot reenter"), so a pause waits a tick,
   * as the Stop handler above does.
   * @param {() => void} work - what to do.
   * @param {string} what - for the warning when it fails.
   */
  const afterEvent = (work, what) => {
    setTimeout(() => {
      try {
        work();
      } catch (error) {
        warn(`${what}: ${String(error?.message ?? error)}`);
      }
    }, 0);
  };

  // A checkpoint at the start of every turn.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'turn/start' || !session?.id || !settings().enabled) return;
      const agent = (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === session.id);
      // An isolated conversation (Recon) gets no checkpoint. A run left on there (one an earlier
      // version started, or one in a conversation moved to the Recon tab) cannot move, because
      // Modes refuses mission_step there: it is paused, so it does not use up the goal's rounds.
      if (isolated(session.id)) {
        if (agent && runner.isOn(session.id) && !runner.paused(agent)) afterEvent(() => runner.hold(agent, ISOLATED_TEXT), 'could not pause the run in an isolated conversation');
        return;
      }
      const entry = state.get(session.id);
      if (!entry) return;
      void settle(session.id, pointsOf(entry.root).take(`Start of turn ${event.data?.turn ?? ''}`.trim()));
      // A run that is not being stepped is paused rather than left to use up rounds.
      if (agent) afterEvent(() => runner.round(agent), 'could not count the run\'s round');
    } catch (error) {
      warn(`could not take the turn's checkpoint: ${String(error?.message ?? error)}`);
    }
  });

  /**
   * After a command: what it made is the assistant's own, and (in restricted and ask) existing
   * files it changed or deleted without the user's yes go back as they were.
   * @param {string} id - the conversation.
   * @param {string} point - the checkpoint taken before the command.
   * @returns {Promise<string[]>} the files that were put back.
   */
  const afterCommand = async (id, point) => {
    const entry = state.get(id);
    if (!entry) return [];
    const root = real(entry.root);
    const { changed, deleted, added } = await pointsOf(entry.root).since(point);
    state.approve(id, added.map((file) => join(root, file)));
    if (entry.mode === 'auto') return [];
    const mine = (file) => entry.approved.has(join(root, file));
    const back = [...changed.filter((file) => !mine(file)), ...deleted.filter((file) => !mine(file))];
    if (back.length > 0) await pointsOf(entry.root).putBack(point, back);
    return back;
  };

  const runner = createRunner(ctx, { settings, pointsOf, afterCommand, warn, home });
  runnerRef.current = runner;

  // ---- Long run (the owner's plan, Long run part, steps 45 to 63) ---------------------------------

  const agentById = (id) => {
    try {
      return (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === id);
    } catch {
      return undefined;
    }
  };
  const goalView = (agent) => {
    try {
      return agent ? ctx.get('goals')?.get?.(agent) : undefined;
    } catch {
      return undefined;
    }
  };
  /** @returns {object | undefined} another add-on's settings, by namespace. */
  const settingsOf = (ns) => {
    try {
      return ctx.get('settings')?.describe?.().find((entry) => entry.ns === ns)?.value;
    } catch {
      return undefined;
    }
  };

  // Tokens a run used: every model reply of the conversation and its helpers while the run is on.
  ctx.on('agent/assistant-stream', ({ agent, frame }) => {
    try {
      const chunk = frame?.type === 'chunk' ? frame.chunk : undefined;
      if (chunk?.type !== 'usage') return;
      const id = ownerOf(agent);
      if (!id || !runner.isOn(id)) return;
      const used = Number(chunk.usage?.totalTokens) || (Number(chunk.usage?.inputTokens) || 0) + (Number(chunk.usage?.outputTokens) || 0);
      runner.addTokens(id, used);
    } catch {
      /* the count is a convenience */
    }
  });

  /**
   * Pre-flight (step 47): what must hold before a Long run starts, each with a plain reason. `ok` null means
   * "not checked" (it never blocks). Nothing is changed.
   */
  /** @returns {boolean} whether the conversation's tab runs Read Only (Modes says so; Data and Research always). */
  const readOnlyTab = (id) => {
    try {
      return READ_ONLY_TABS.has(tabOf(id)) || ctx.get('modes')?.readOnly?.(id) === true;
    } catch {
      return READ_ONLY_TABS.has(tabOf(id));
    }
  };
  /** @returns {{files: boolean, web: boolean}} the tab's starting choice of tools for a Long run (Settings → Modes). */
  const longToolsOf = (id) => {
    try {
      return readTools(ctx.get('modes')?.longTools?.(id)) ?? { files: true, web: true };
    } catch {
      return { files: true, web: true };
    }
  };
  /** Ask Modes to put the tools on now (before a run's first round, and after it ends). */
  const refreshTools = (id) => {
    try {
      ctx.get('modes')?.refreshTools?.(id);
    } catch (error) {
      warn(`could not renew the tools: ${String(error?.message ?? error)}`);
    }
  };
  /** @returns {string} the conversation's access level now ('' when not known). */
  const levelOf = (agent) => {
    try {
      return String(ctx.get('sandboxPolicy')?.resolve?.({ session: agent.session })?.mode ?? '');
    } catch {
      return '';
    }
  };

  const preflight = (agent) => {
    const id = agent?.id;
    const ticks = [];
    const add = (key, ok, text, required = true) => ticks.push({ key, ok, text, required });
    const root = folderOf(agent);
    add('folder', Boolean(root) && existsSync(root), root ? 'The conversation has a folder to work in.' : 'This conversation has no folder. Pick a project on the start page first.');
    const git = GIT_CANDIDATES.some((candidate) => existsSync(candidate));
    add('git', git, git ? 'The git program for checkpoints is there.' : 'Checkpoints need Apple\'s git program: install the Command Line Tools first.');
    const iso = isolated(id);
    add('isolated', !iso, iso ? ISOLATED_TEXT : 'Not an isolated conversation.');
    // Every tab but Recon (the isolated check above), Scratch too (the owner's choice, 16 November). In
    // Data and Research, which run Read Only, it is allowed with a warning: the run can change files.
    if (readOnlyTab(id)) ticks.push({ key: 'tab', ok: false, warn: true, required: false, text: READ_ONLY_LONG_TEXT });
    const tier = tierOf(id);
    add('helpers', tier?.subagents !== false, tier?.subagents === false ? whyNot({ isolated: false, tier, helpers: true }) : 'The tier allows helper models.');
    add('free', !runner.isOn(id), runner.isOn(id) ? 'A run is already on in this conversation.' : 'No run is on here yet.');
    // Model reachable: only where Route health has a probe for the conversation's route.
    let model = null;
    let modelText = 'Not checked: Route health has no probe for this model.';
    try {
      const current = agent?.model?.current?.();
      const health = current ? ctx.get('routeHealth')?.state?.(current.provider) : null;
      if (health) {
        model = health.state !== 'down';
        modelText = model ? 'The model answered its last check.' : 'The model did not answer its last check (Route health).';
      }
    } catch {
      model = null;
    }
    ticks.push({ key: 'model', ok: model, text: modelText, required: false });
    const budget = settingsOf('budget');
    ticks.push({ key: 'budget', ok: true, required: false, text: budget ? `Budget guard counts each lap's rounds on their own (at most ${Number(budget.maxSteps) || 300} requests per round)${Number(budget.dayTokens) > 0 ? `, and ${budget.dayTokens} tokens a day` : ''}.` : 'Budget guard is off.' });
    const alerts = settingsOf('automations');
    const channel = alerts ? alerts.mac !== false || (alerts.phone === true && String(alerts.ntfyTopic ?? '').trim() !== '') : false;
    ticks.push({ key: 'alerts', ok: channel, required: false, text: channel ? 'You will be told when it ends, needs you, or stops.' : 'No alert channel: switch on Mac or phone alerts in Settings → Alerts to be told.' });
    return { ok: ticks.every((tick) => !tick.required || tick.ok === true), ticks };
  };

  // Each chat's Long run settings (step 64): saved from Depth → Long run settings, used by the Run button.
  const savedFile = typeof home === 'function' ? join(home('mission'), 'long-settings.json') : '';
  const savedLong = (() => {
    try {
      const read = savedFile && existsSync(savedFile) ? JSON.parse(readFileSync(savedFile, 'utf8')) : {};
      return new Map(Object.entries(read && typeof read === 'object' ? read : {}));
    } catch (error) {
      warn(`could not read the chats' Long run settings: ${String(error?.message ?? error)}`);
      return new Map();
    }
  })();
  const keepSaved = () => {
    if (!savedFile) return;
    try {
      mkdirSync(dirname(savedFile), { recursive: true });
      const temp = `${savedFile}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(Object.fromEntries(savedLong)));
      renameSync(temp, savedFile);
    } catch (error) {
      warn(`could not save a chat's Long run settings: ${String(error?.message ?? error)}`);
    }
  };

  /** What the conversation's tier or settings say for a Long run's options: the given values, then the chat's saved ones, then the defaults. */
  const longOptions = (body, id) => {
    const saved = (id && savedLong.get(id)) || {};
    const pick = (key) => body?.[key] ?? saved[key];
    const defaults = settings().long;
    const own = readLong({ minutes: pick('minutes') ?? defaults.minutes, laps: pick('laps') ?? defaults.laps, fullTime: pick('fullTime') ?? defaults.fullTime });
    const flag = (key) => (typeof body?.[key] === 'boolean' ? body[key] : typeof saved[key] === 'boolean' ? saved[key] : defaults[key]);
    const cap = Number(pick('tokenCap'));
    return {
      ...own,
      keepAwake: flag('keepAwake'),
      battery: flag('battery'),
      retry: flag('retry'),
      effort: flag('effort'),
      tokenCap: cap > 0 ? Math.floor(cap) : 0,
      tools: readTools(body?.tools) ?? readTools(saved.tools) ?? (id ? longToolsOf(id) : { files: true, web: true }),
    };
  };
  /** @returns {string} the file-changes mode for a chat's Long run: given, saved, the chat's own, or the default. */
  const longModeOf = (body, id) => {
    const saved = (id && savedLong.get(id)) || {};
    return MODES.includes(body?.mode) ? body.mode : MODES.includes(saved.mode) ? saved.mode : state.get(id)?.mode ?? settings().defaultMode;
  };

  // Keep-awake (step 57): while a Long run that wants it is on and not paused.
  const awake = createAwake({ warn });
  ctx.effect(() => () => awake.stop(), 'mission: let the Mac sleep');
  const keepAwakeFor = (conversation) => {
    const run = runner.runOf(conversation);
    // Not while you paused it: its goal is then paused too (review finding 5).
    let paused = false;
    try {
      const agent = agentById(conversation);
      const goal = agent ? goalView(agent) : undefined;
      paused = Boolean(goal) && goal.phase !== 'active';
    } catch {
      paused = false;
    }
    const live = run?.kind === 'long' && run.status === 'running' && run.long?.keepAwake === true && !run.stalled && !paused;
    void awake.want(conversation, live, run?.long?.battery === true);
  };

  // The watchdog (step 56): when the app stops giving a Long run rounds while it runs (its goal still
  // active, but disarmed), the run notes it, tells you, and, if chosen, tries again up to three times,
  // minutes apart. Never after your own pause or stop, and never after a restart: then one click.
  const retryTimers = new Map();
  ctx.effect(() => () => { for (const timer of retryTimers.values()) clearTimeout(timer); retryTimers.clear(); }, 'mission: retries');
  const createdAt = new Map();
  ctx.on('agent/created', ({ agent }) => {
    if (!agent?.id) return;
    createdAt.set(agent.id, Date.now());
    // Opened after a restart with a run on: the app never carries on by itself; the card offers Resume.
    const timer = setTimeout(() => {
      try {
        const run = runner.runOf(agent.id);
        const view = goalView(agent);
        if (run?.status === 'running' && view && view.phase === 'active' && view.activation === 'disarmed' && !runner.stepOf(agent.id)) runner.selfStopped(agent, 'restart');
      } catch { /* the card still shows the run */ }
    }, 3000);
    timer.unref?.();
  });
  ctx.on('goal/activation-changed', ({ sessionId, goal }) => {
    try {
      if (goal?.activation !== 'disarmed') return;
      const agent = agentById(sessionId);
      const run = runner.runOf(sessionId);
      if (!agent || run?.status !== 'running') return;
      const view = goalView(agent);
      if (!view || view.phase !== 'active') return;
      if (Date.now() - (createdAt.get(sessionId) ?? 0) < 3000) return;
      const stopped = runner.selfStopped(agent, 'error');
      if (!stopped || stopped.kind !== 'long' || stopped.long?.retry !== true) return;
      const tries = stopped.selfStops ?? 1;
      if (tries > RETRY_MINUTES.length) return;
      clearTimeout(retryTimers.get(sessionId));
      const timer = setTimeout(() => {
        retryTimers.delete(sessionId);
        try {
          const now = goalView(agentById(sessionId) ?? agent);
          const still = runner.runOf(sessionId);
          // Only while it is still stopped by itself: never over your own pause, a stop or an end.
          if (still?.status !== 'running' || !now || now.phase !== 'active' || now.activation !== 'disarmed') return;
          ctx.get('goals').resume(agentById(sessionId) ?? agent, { id: now.id, revision: now.revision });
          runner.retried(sessionId, tries);
        } catch (error) {
          warn(`a long run could not be tried again: ${String(error?.message ?? error)}`);
        }
      }, RETRY_MINUTES[tries - 1] * 60000);
      timer.unref?.();
      retryTimers.set(sessionId, timer);
    } catch (error) {
      warn(`could not look after a run that stopped by itself: ${String(error?.message ?? error)}`);
    }
  });
  // Runs that were running when the app closed: told once (alerts), shown on their card when opened.
  const startupTimer = setTimeout(() => {
    try {
      for (const { conversation, run } of runner.interrupted()) runner.announceInterrupted(conversation, run);
    } catch { /* nothing to tell */ }
  }, 5000);
  startupTimer.unref?.();
  ctx.effect(() => () => clearTimeout(startupTimer), 'mission: interrupted runs');
  ctx.effect(() => () => { for (const press of armed.values()) clearTimeout(press.timer); armed.clear(); }, 'mission: Run presses');

  /** @returns {string} the text of a message (its text blocks). */
  const textOf = (message) => (Array.isArray(message?.content) ? message.content : [])
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text).join('\n').trim();
  /**
   * What was said in a conversation before a message: your messages and the model's answers, newest
   * last, at most CONTEXT_MAX characters (the planner and reviewer of a run started with Run get it).
   */
  const contextBefore = (agent, messageId) => {
    try {
      const lines = [];
      let size = 0;
      const messages = agent?.session?.deriveMessages?.() ?? [];
      for (let index = messages.length - 1; index >= 0 && size < CONTEXT_MAX; index -= 1) {
        const message = messages[index];
        if (message?.id === messageId) continue;
        const who = message?.role === 'assistant' ? 'Assistant' : message?.role === 'user' && message?.source?.kind === 'user' ? 'User' : '';
        const text = who ? textOf(message) : '';
        if (!text) continue;
        lines.unshift(`${who}: ${text}`);
        size += text.length + who.length + 2;
      }
      const all = lines.join('\n\n');
      return all.length > CONTEXT_MAX ? `…${all.slice(-CONTEXT_MAX)}` : all;
    } catch (error) {
      warn(`could not read the conversation before a run: ${String(error?.message ?? error)}`);
      return '';
    }
  };

  // Your messages (step 64): after a press of Run the next one starts a Long run with it as the goal;
  // while a Long run works, each one is kept for its helpers' next step.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'user/message' || !session?.id || event.data?.source?.kind !== 'user') return;
      if (session.header?.parentSession || !settings().enabled) return;
      const id = session.id;
      const text = textOf(event.data);
      if (armed.has(id)) {
        // The press is used up; its tools stay until the run started (startLong) or did not (below).
        clearTimeout(armed.get(id).timer);
        armed.delete(id);
        const agent = agentById(id);
        if (!agent) {
          pendingLong.delete(id);
          return;
        }
        const context = contextBefore(agent, event.data?.id);
        const work = (async () => {
          try {
            // Not while the app hands out this event: it refuses changes to the conversation then
            // ("session append cannot reenter"), and the run's Workspace Write would be lost.
            await new Promise((resolve) => setTimeout(resolve, 0));
            await startLong(agent, text, { context });
          } catch (error) {
            const why = String(error?.message ?? error).slice(0, 300);
            startErrors.set(id, { at: Date.now(), text: why });
            warn(`a Long run did not start: ${why}`);
            if (!runner.isOn(id)) {
              pendingLong.delete(id);
              refreshTools(id);
            }
          } finally {
            starting.delete(id);
          }
        })();
        starting.set(id, work);
        return;
      }
      const run = runner.runOf(id);
      if (text && isLong(run) && run.status === 'running') runner.ask(id, text);
    } catch (error) {
      warn(`could not take your message: ${String(error?.message ?? error)}`);
    }
  });
  ctx.effect(() => runner.onEvent((event) => {
    keepAwakeFor(event.conversation);
    if (event.type === 'finished') {
      clearTimeout(retryTimers.get(event.conversation));
      putBackAfterLong(event.conversation);
    }
  }), 'mission: keep-awake follows runs');

  /**
   * A Long run in a Read Only tab has ended: its access level and preset come back, and the Mission mode
   * goes off if the run put it on. The tab's own tools come back too (Modes, asked now).
   * @param {string} id - the conversation.
   */
  const putBackAfterLong = (id) => {
    const run = runner.runOf(id);
    const restore = isLong(run) ? run.long?.restore : undefined;
    refreshTools(id);
    if (!restore) return;
    const agent = agentById(id);
    if (agent?.session) restoreAccess(agent, restore);
  };
  /** Put a Read Only tab's preset and level back, and the Mission mode off if a Long run put it on. */
  const restoreAccess = (agent, restore) => {
    const id = agent.id;
    try {
      const presets = ctx.get('permissionPresets');
      if (!restore.modeWasOn) state.clear(id);
      if (restore.preset && restore.preset !== PRESET && restore.preset !== 'custom' && presets?.set) presets.set(agent.session, restore.preset);
      if (levelOf(agent) !== restore.sandbox) agent.session.append('sandbox/mode', { mode: restore.sandbox });
    } catch (error) {
      warn(`could not put the access level back after a Long run: ${String(error?.message ?? error)}`);
    }
  };

  /** The card's view of a conversation: its run, the pre-flight, and the defaults. */
  const cardOf = (agent) => {
    const view = runner.view(agent.id);
    const goal = goalView(agent);
    return {
      at: Date.now(),
      run: view ? { ...view, goalPhase: goal?.phase ?? '', activation: goal?.activation ?? '' } : null,
      preflight: preflight(agent),
      defaults: settings().long,
      tools: longToolsOf(agent.id),
      mode: state.get(agent.id)?.mode ?? settings().defaultMode,
      // This chat's Long run settings, as the Run button will use them.
      saved: { ...longOptions({}, agent.id), mode: longModeOf({}, agent.id) },
      // The Run button: not in an isolated conversation (Recon), and not in a helper.
      runButton: !isolated(agent.id) && !parentOf(agent),
      armed: armed.has(agent.id) || starting.has(agent.id),
      startError: startErrors.get(agent.id) ?? null,
    };
  };

  /** Forget a press of Run (its message did not come, or the run started). Its tools go too, unless a run is starting. */
  const disarm = (id) => {
    const press = armed.get(id);
    if (!press) return;
    clearTimeout(press.timer);
    armed.delete(id);
    if (!starting.has(id)) {
      pendingLong.delete(id);
      refreshTools(id);
    }
  };

  /**
   * Start a Long run in a conversation, with the chat's saved settings under the given ones.
   * @param {object} agent - the conversation.
   * @param {string} goalText - what it should do.
   * @param {object} body - settings given now (the card), and `context` (the conversation before it).
   * @returns {Promise<string>} what to tell the user.
   */
  const startLong = async (agent, goalText, body = {}) => {
    const check = preflight(agent);
    if (!check.ok) throw new Error(check.ticks.find((tick) => tick.required && tick.ok !== true)?.text ?? 'Not ready.');
    if (goalText.trim() === '') throw new Error('Say what the run should do.');
    const mode = longModeOf(body, agent.id);
    const options = longOptions(body, agent.id);
    if (typeof body.context === 'string' && body.context.trim()) options.context = body.context;
    // In a Read Only tab, or a conversation set to Read Only by hand, the run may write in the folder
    // (the owner's choice); the level from before comes back when it ends, and the Mission mode goes
    // off again if the run put it on.
    const before = readOnlyTab(agent.id) || levelOf(agent) === 'read-only' ? { sandbox: levelOf(agent), preset: (() => { try { return String(ctx.get('permissionPresets')?.current?.(agent.session) ?? ''); } catch { return ''; } })(), modeWasOn: Boolean(state.get(agent.id)) } : undefined;
    let lead = '';
    let said = '';
    // The tools first, so the run's first round has them.
    pendingLong.set(agent.id, options.tools);
    try {
      refreshTools(agent.id);
      if (state.get(agent.id)?.mode !== mode || before) lead = `${(await switchOn(agent, mode)).split('\n')[0]}\n`;
      // A run whose helpers cannot write would use up its laps for nothing: refused, and says why.
      if (options.tools?.files !== false && levelOf(agent) === 'read-only') throw new Error('This conversation is still Read Only, so the run\'s helpers could not save anything. Set the access to Workspace Write (the chip in the chat box) and press Run again.');
      said = `${await runner.start(agent, goalText, state.get(agent.id), { kind: 'long', long: { ...options, ...(before ? { restore: before } : {}) } })}${lead ? `\n${lead}` : ''}`;
    } catch (error) {
      // No run came of it: a Read Only tab gets its level back at once (review finding 3).
      if (before && !runner.isOn(agent.id)) restoreAccess(agent, before);
      throw error;
    } finally {
      pendingLong.delete(agent.id);
      refreshTools(agent.id);
    }
    keepAwakeFor(agent.id);
    return said;
  };

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: LONG_PATH,
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
          let body = {};
          if (req.method === 'POST') {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 32768) throw new Error('request too large');
              chunks.push(chunk);
            }
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } else {
            body = { sessionId: new URL(req.url ?? '', 'http://x').searchParams.get('sessionId') };
          }
          if (!settings().enabled) throw new Error('Mission is switched off in Settings → Mission.');
          const agent = agentById(String(body?.sessionId ?? ''));
          if (!agent) throw new Error('That conversation is not open.');
          let said = '';
          if (req.method === 'POST') {
            const action = String(body.action ?? '');
            if (action === 'start') {
              const goalText = String(body.goal ?? '').trim();
              if (goalText.split(/\s+/).length < 3) throw new Error('Say what the run should do in a few words.');
              said = await startLong(agent, goalText, body);
            } else if (action === 'save') {
              // Depth → Long run settings: kept for this chat, used by its Run button.
              const options = longOptions(body, agent.id);
              const { minutes, laps, fullTime, keepAwake, battery, retry, effort, tokenCap, tools } = options;
              savedLong.delete(agent.id);
              savedLong.set(agent.id, { minutes, laps, fullTime, keepAwake, battery, retry, effort, tokenCap, tools, mode: longModeOf(body, agent.id), at: Date.now() });
              while (savedLong.size > SAVED_MAX) savedLong.delete(savedLong.keys().next().value);
              keepSaved();
              said = 'Saved for this chat.';
            } else if (action === 'arm') {
              // The Run button: the next message of yours here is the goal (it arrives as a user/message event).
              if (parentOf(agent)) throw new Error('Only a conversation of your own can start a Long run.');
              // Only while it is not answering: a message sent meanwhile waits in the queue, past the press.
              if (agent.status && agent.status !== 'idle') throw new Error('Wait until the conversation is done answering, then press Run.');
              const check = preflight(agent);
              if (!check.ok) throw new Error(check.ticks.find((tick) => tick.required && tick.ok !== true)?.text ?? 'Not ready.');
              disarm(agent.id);
              startErrors.delete(agent.id);
              const timer = setTimeout(() => disarm(agent.id), ARM_MS);
              timer.unref?.();
              armed.set(agent.id, { at: Date.now(), timer });
              // Its tools from the first request of the turn the message starts.
              pendingLong.set(agent.id, longOptions({}, agent.id).tools);
              refreshTools(agent.id);
              said = 'Run: your message starts a Long run.';
            } else if (action === 'disarm') {
              disarm(agent.id);
            } else if (action === 'finish-lap') said = runner.finishLap(agent);
            else if (action === 'pause') said = runner.stop(agent);
            else if (action === 'resume') {
              const no = whyNot({ isolated: isolated(agent.id), tier: tierOf(agent.id), helpers: true, tab: tabOf(agent.id), long: isLong(runner.runOf(agent.id)) });
              if (no) throw new Error(no);
              said = runner.resume(agent);
              refreshTools(agent.id);
            } else if (action === 'end') said = runner.end(agent);
            else throw new Error('Unknown action.');
          }
          res.end(JSON.stringify({ ...cardOf(agent), said }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 400) }));
        }
      },
    }), 'mission: long run route');
  });

  /** Whether an agent reaches its tools only from inside a program (the app's PTC preset). */
  const viaProgram = (agent) => {
    try {
      const names = ctx.get('tools')?.selectExecutor?.(agent)?.describe?.([])?.knownNames;
      return Array.isArray(names) && names.length === 1 && names[0] === PROGRAM_TOOL;
    } catch {
      return false;
    }
  };

  // ---- every tool call ------------------------------------------------------------------------

  /** Call id -> the checkpoint taken before that command. */
  const pending = new Map();

  /** Put a question to the user through the app's approval card. */
  const askUser = async (exec, question, owner) => {
    const approval = ctx.get('approval');
    if (!approval?.request || !exec?.agent) return 'unavailable';
    // A helper in a run does not wait for ever: the user may be away. After the wait the item is set aside.
    const helper = Boolean(owner) && owner !== exec.agent.id;
    const step = helper ? runner.stepOf(owner) : undefined;
    // The app answers a helper agent's own request with a no, without showing a card. The question
    // therefore goes through the conversation the helper works for, which is where the user is.
    let asker = exec.agent;
    if (helper) {
      try {
        asker = (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === owner) ?? exec.agent;
      } catch {
        asker = exec.agent;
      }
    }
    const through = asker === exec.agent ? { callId: exec.callId } : {};
    const minutes = step ? settings().limits.waitMinutes : 0;
    const wait = minutes > 0 ? new AbortController() : undefined;
    const timer = wait ? setTimeout(() => wait.abort(), minutes * 60_000) : undefined;
    timer?.unref?.();
    try {
      const outcome = await approval.request({ agent: asker, toolName: exec.name, ...through, reason: question, displayReason: { en: question }, signal: wait ? AbortSignal.any([exec.signal, wait.signal]) : exec.signal });
      if (wait?.signal.aborted && outcome !== 'allowed-once' && outcome !== 'rejected') {
        step.asides.push(question);
        return 'timeout';
      }
      return outcome;
    } catch (error) {
      if (wait?.signal.aborted && !exec.signal.aborted) {
        step.asides.push(question);
        return 'timeout';
      }
      warn(`could not ask: ${String(error?.message ?? error)}`);
      return 'unavailable';
    } finally {
      clearTimeout(timer);
    }
  };
  const refusal = (outcome, what) => {
    if (outcome === 'timeout') return `${what} needs the user's yes, and they did not answer in time. Do not try it another way and do not ask again: finish what you can without it and say in your report that this is waiting for the user.`;
    if (outcome === 'rejected') return `The user said no to ${what}. Do not try it another way; carry on without it or say what you could not do.`;
    if (outcome === 'cancelled') return `The question about ${what} was cancelled.`;
    return `${what} needs the user's yes, and they could not be asked just now.`;
  };

  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    // A Long run being started from your message comes first: then the run's rules below hold.
    if (exec?.agent?.id && starting.has(exec.agent.id)) await starting.get(exec.agent.id);
    // A run's planner and reviewer only read: their answer goes in their reply, not into a file in the
    // folder (small models wrote plan.json and review.json there).
    const reader = exec?.agent?.id && WRITE_TOOLS.has(exec.name) ? runner.readerOf(exec.agent.id) : '';
    if (reader) return { kind: 'deny', reason: `You are ${reader} of a run: change no files. Put your whole answer in your reply.` };
    let guard;
    try {
      guard = guardOf(exec?.agent);
    } catch {
      guard = undefined;
    }
    if (!guard || exec.name === REQUEST_TOOL) return decision;
    const { id, entry } = guard;
    // While a run is on, the conversation's own model only keeps it moving; the helpers do the work.
    if (exec.agent.id === id && runner.isOn(id) && !runner.paused(exec.agent)) {
      // In the app's PTC preset the step tool is reached from inside a run_code program, so the
      // program itself must be let through; what it calls is decided here one by one.
      if (exec.name === STEP_TOOL || exec.name === PROGRAM_TOOL) return decision;
      return { kind: 'deny', reason: `A mission run is on in this conversation. Call ${STEP_TOOL} and nothing else${viaProgram(exec.agent) ? ` (from inside a program: return await tools.${STEP_TOOL}({}))` : ''}; the run's worker models do the work. The user can pause the run with /mission stop.` };
    }
    try {
      // The turn's own checkpoint comes first, so it holds the folder as the turn found it.
      await settling.get(id);
      const root = real(entry.root);
      const verdict = decide({ mode: entry.mode, tool: exec.name, args: exec.arguments, root, approved: (path) => entry.approved.has(path), outsideOk: (path) => covered(entry.outside, path) });
      if (verdict.kind === 'deny') return { kind: 'deny', reason: verdict.reason };
      if (verdict.kind === 'ask') {
        const outcome = await askUser(exec, verdict.question, id);
        if (outcome !== 'allowed-once') return { kind: 'deny', reason: refusal(outcome, verdict.files ? `changing ${verdict.files.map((path) => shown(root, path)).join(', ')}` : `reaching ${verdict.outside.join(', ')}`) };
        if (verdict.files) state.approve(id, verdict.files);
        if (verdict.outside) state.allowOutside(id, verdict.outside);
      }
      // A file the assistant makes itself is its own to change later.
      if (WRITE_TOOLS.has(exec.name)) state.approve(id, pathsOf(exec.arguments, root).filter((path) => isInside(root, path) && !exists(path)));
      if (COMMAND_TOOLS.has(exec.name)) {
        const text = String(exec.arguments?.command ?? '').replace(/\s+/g, ' ').slice(0, 70);
        const point = await pointsOf(entry.root).take(`Before: ${text}`);
        pending.set(exec.callId, { id, root, point: point.id });
        if (pending.size > 500) pending.delete(pending.keys().next().value);
      }
      return decision ?? { kind: 'allow' };
    } catch (error) {
      // A guard that cannot decide must not wave the call through.
      const reason = String(error?.message ?? error).slice(0, 240);
      warn(`could not decide ${exec.name}: ${reason}`);
      return { kind: 'deny', reason: `Mission could not check this call (${reason}), so it was not run. The user can switch the mode off with /mission off.` };
    }
  });

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    const before = pending.get(exec?.callId);
    if (!before) return decision;
    pending.delete(exec.callId);
    const entry = state.get(before.id);
    if (!entry) return decision;
    try {
      const back = await afterCommand(before.id, before.point);
      if (back.length === 0) return decision;
      const listed = back.slice(0, 30).join(', ') + (back.length > 30 ? ` and ${back.length - 30} more` : '');
      const notice = [
        `${MODE_LABELS[entry.mode]} mode: this command changed or deleted existing files the user has not approved: ${listed}.`,
        'They were put back as they were. Everything else the command did stands.',
        `To change them, ask the user once with ${REQUEST_TOOL} (name the files and say why), or edit a single file with the edit tool, and then run the command again.`,
      ].join(' ');
      if (decision?.kind === 'block') return { ...decision, feedback: [...(decision.feedback ?? []), { type: 'text', text: notice }] };
      const content = Array.isArray(decision?.content) ? decision.content : Array.isArray(result?.content) ? result.content : undefined;
      if (!content) return { kind: 'block', feedback: [{ type: 'text', text: notice }] };
      return { kind: 'accept', content: [...content, { type: 'text', text: `\n[${notice}]` }], ...(decision?.additionalContexts ? { additionalContexts: decision.additionalContexts } : {}) };
    } catch (error) {
      warn(`could not check what a command changed: ${String(error?.message ?? error)}`);
      return decision;
    }
  });

  // ---- asking for several files at once -------------------------------------------------------

  ctx.inject(['tools'], (inner) => {
    inner.effect(
      () =>
        inner.tools.register({
          name: REQUEST_TOOL,
          description: 'While a Mission mode is on: ask the user once for permission to change or delete several existing files in this conversation\'s folder, for example before a command that reformats or renames many files. After a yes, those files may be changed by tools and commands without further asking. Not needed for new files, and not needed in Full Auto. It cannot ask for anything outside the folder.',
          parameters: {
            type: 'object',
            properties: {
              files: { type: 'array', minItems: 1, maxItems: REQUEST_MAX, items: { type: 'string', maxLength: 400 }, description: 'The existing files, as paths inside the conversation\'s folder.' },
              why: { type: 'string', maxLength: 240, description: 'One line for the user: why these files have to change.' },
            },
            required: ['files', 'why'],
            additionalProperties: false,
          },
          output: {
            schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
            render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
          },
          isConcurrencySafe: () => false,
          execute: async (args, exec) => {
            try {
              const guard = guardOf(exec?.agent);
              if (!guard) return { text: 'No Mission mode is on in this conversation, so nothing needs asking.' };
              const { id, entry } = guard;
              if (entry.mode === 'auto') return { text: 'Full Auto: files inside the folder may be changed without asking.' };
              const root = real(entry.root);
              const named = pathsOf({ files: Array.isArray(args?.files) ? args.files.slice(0, REQUEST_MAX) : [] }, root);
              const outside = named.filter((path) => !isInside(root, path));
              if (outside.length > 0) return { text: `Not asked: these are outside the conversation's folder: ${outside.join(', ')}. This tool is for files inside it.` };
              const need = named.filter((path) => exists(path) && !entry.approved.has(path));
              if (need.length === 0) return { text: 'Nothing to ask: these files are new or already approved.' };
              const why = String(args?.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
              const outcome = await askUser(exec, `${MODE_LABELS[entry.mode]} mode: change ${need.map((path) => shown(root, path)).join(', ')}?${why ? ` Reason given: ${why}` : ''}`, id);
              if (outcome !== 'allowed-once') return { text: refusal(outcome, 'changing these files') };
              state.approve(id, need);
              return { text: `The user said yes. These files may now be changed without asking again: ${need.map((path) => shown(root, path)).join(', ')}.` };
            } catch (error) {
              return { text: `It did not work: ${String(error?.message ?? error).slice(0, 240)}` };
            }
          },
        }),
      'mission: request tool',
    );
  });

  // ---- the run's one tool ---------------------------------------------------------------------

  ctx.inject(['tools'], (inner) => {
    inner.effect(
      () =>
        inner.tools.register({
          name: STEP_TOOL,
          description: 'Do the next step of this conversation\'s mission run: the plan, one checklist item (a worker model does it and its command is run for real), the overall commands, the review, or the final report. Call it once per round while a mission run is on, with no arguments, and tell the user what it returned. It can take many minutes. Only the user can start a run, with /mission.',
          parameters: { type: 'object', properties: {}, additionalProperties: false },
          output: {
            schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
            render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
          },
          isConcurrencySafe: () => false,
          timeoutMs: 75 * 60_000,
          execute: async (_args, exec) => {
            try {
              if (!settings().enabled) return { text: 'Mission is switched off in Settings → Mission.' };
              if (!exec?.agent?.id) return { text: 'This call has no conversation.' };
              // A helper must not drive the run it is part of.
              if (parentOf(exec.agent)) return { text: 'Only the conversation that owns the run calls this tool. Do your own item and report.' };
              // Not in an isolated conversation, and not while the tier has its sub-agents off: the
              // run is paused instead of using up rounds, with the reason for /mission to show.
              // A run being started from your message is waited for; one that did not start says why.
              await starting.get(exec.agent.id);
              const failed = startErrors.get(exec.agent.id);
              if (!runner.isOn(exec.agent.id) && failed && Date.now() - failed.at < 10 * 60_000) return { text: `The Long run did not start: ${failed.text} Tell the user this and do not call ${STEP_TOOL} again.` };
              const isolatedHere = isolated(exec.agent.id);
              const no = whyNot({ isolated: isolatedHere, tier: tierOf(exec.agent.id), helpers: true, tab: tabOf(exec.agent.id), long: isLong(runner.runOf(exec.agent.id)) });
              if (no) {
                const paused = runner.hold(exec.agent, no);
                const next = isolatedHere ? 'End it with /mission end.' : 'Once that is changed, the user carries on with /mission resume.';
                return { text: paused ? `The mission run is paused. ${no} ${next} Tell the user this and do not call ${STEP_TOOL} again.` : no };
              }
              return { text: await runner.step(exec.agent, exec.signal, viaProgram(exec.agent) ? WAIT_MS.program : WAIT_MS.direct) };
            } catch (error) {
              return { text: `It did not work: ${String(error?.message ?? error).slice(0, 300)}` };
            }
          },
        }),
      'mission: step tool',
    );
  });

  // ---- the command ----------------------------------------------------------------------------

  const when = (at) => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const status = (agent) => {
    const entry = state.get(agent.id);
    const run = runner.status(agent);
    if (run) return `${run}\n\n${HELP}`;
    if (!entry) return `No Mission mode is on in this conversation. Click for the commands.\n\n${HELP}`;
    return `Mission mode: ${MODE_LABELS[entry.mode]} is on. Click for details.\nFolder: ${entry.root}\nApproved so far: ${entry.approved.size} file${entry.approved.size === 1 ? '' : 's'} inside, ${entry.outside.size} place${entry.outside.size === 1 ? '' : 's'} outside.\n\n${HELP}`;
  };
  const switchOn = async (agent, mode) => {
    const root = folderOf(agent);
    if (!root) throw new Error('This conversation has no folder. Pick a folder on the start page first.');
    let preset = '';
    try {
      const presets = ctx.get('permissionPresets');
      if (presets?.set && agent.session) {
        preset = presets.current(agent.session);
        // Selected again even when it is the preset already: a tab may have set the Read Only level
        // under it (Modes), and selecting the preset sets its level again. Nothing is added when it holds.
        presets.set(agent.session, PRESET);
      }
    } catch (error) {
      warn(`could not select the Workspace Write preset: ${String(error?.message ?? error)}`);
    }
    const entry = state.set(agent.id, { mode, root, preset });
    let note = '';
    try {
      const point = await pointsOf(root).take(`${MODE_LABELS[mode]} mode switched on`);
      note = ` Checkpoint ${point.number} holds the folder as it is now.`;
    } catch (error) {
      note = ` No checkpoint could be taken: ${String(error?.message ?? error).slice(0, 200)}`;
    }
    const inside = mode === 'auto' ? 'Inside the folder the assistant works without asking.' : 'Inside the folder it creates new files freely and asks you once per existing file before changing it.';
    const outside = mode === 'restricted' ? 'Outside the folder nothing is read or changed, and you are not asked.' : 'For anything outside the folder it must ask you.';
    return `Mission mode: ${MODE_LABELS[entry.mode]} is on.${note}\nFolder: ${root}\n${inside}\n${outside}`;
  };

  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: 'mission',
          description: 'Keep the assistant inside this folder (Restricted, Ask-Auto, Full Auto), take checkpoints, go back to one',
          input: { hint: '[restricted | ask | auto | off | checkpoints | back <number>]' },
          handler: async ({ agent, rawInput }) => {
            try {
              if (!settings().enabled) return { kind: 'error', text: 'Mission is switched off in Settings → Mission.' };
              const text = String(rawInput ?? '').trim();
              const [first = '', ...rest] = text.split(/\s+/);
              const word = first.toLowerCase();
              // An isolated conversation (Recon) is left alone; only what takes back a mode or a run
              // an earlier version started there still works (off, stop, end).
              const isolatedHere = isolated(agent?.id);
              // A Long run in Data or Research (allowed there) can still be looked at, paused and carried on.
              const long = isLong(runner.runOf(agent?.id));
              const shut = whyNot({ isolated: isolatedHere, word, tab: tabOf(agent?.id), long: long && LONG_WORDS.has(word) });
              if (shut) return { kind: 'error', text: shut };
              /** Why a run may not start or carry on here: its helpers need the tier's sub-agents. */
              const noHelpers = () => whyNot({ isolated: isolatedHere, tier: tierOf(agent?.id), helpers: true, word, tab: tabOf(agent?.id), long });
              if (!word || word === 'status' || word === 'help') return { kind: 'success', text: status(agent) };
              const mode = word === 'on' ? settings().defaultMode : modeOf(text);
              if (mode) return { kind: 'success', text: await switchOn(agent, mode) };
              if (word === 'stop' || word === 'pause') return { kind: 'success', text: runner.stop(agent) };
              if (word === 'resume' || word === 'go' || word === 'continue') {
                const no = noHelpers();
                if (no) return { kind: 'error', text: no };
                const resumed = runner.resume(agent);
                refreshTools(agent.id);
                return { kind: 'success', text: resumed };
              }
              if (word === 'end' || word === 'finish') return { kind: 'success', text: runner.end(agent) };
              if (word === 'report') return { kind: 'success', text: runner.status(agent) || 'No mission run was started in this conversation.' };
              if (word === 'off') {
                const before = state.clear(agent.id);
                if (!before) return { kind: 'success', text: 'No Mission mode was on.' };
                try {
                  const presets = ctx.get('permissionPresets');
                  if (before.preset && before.preset !== PRESET && before.preset !== 'custom' && presets?.set && agent.session) presets.set(agent.session, before.preset);
                } catch (error) {
                  warn(`could not put the earlier preset back: ${String(error?.message ?? error)}`);
                }
                return { kind: 'success', text: 'Mission mode is off. The checkpoints stay in the folder.' };
              }
              const root = state.get(agent.id)?.root ?? folderOf(agent);
              if (!root) return { kind: 'error', text: 'This conversation has no folder.' };
              if (word === 'checkpoint') {
                const point = await pointsOf(root).take(rest.join(' ') || 'Taken by you');
                return { kind: 'success', text: point.fresh ? `Checkpoint ${point.number} taken.` : `Nothing changed since checkpoint ${point.number}; it stands for now too.` };
              }
              if (word === 'checkpoints' || word === 'list') {
                const list = await pointsOf(root).list(20);
                if (list.length === 0) return { kind: 'success', text: 'There are no checkpoints yet. One is taken when a mode is switched on.' };
                return { kind: 'success', text: `${list[0].number} checkpoint${list[0].number === 1 ? '' : 's'}. Click to see them, newest first.\nFolder: ${root}\n${list.map((point) => `${String(point.number).padStart(4)}  ${when(point.at)}  ${point.label}`).join('\n')}\n\nGo back with /mission back <number>.` };
              }
              if (word === 'back' || word === 'rollback') {
                const number = Number(rest[0]);
                if (!Number.isInteger(number)) return { kind: 'error', text: 'Say which one: /mission back 12. List them with /mission checkpoints.' };
                const went = await pointsOf(root).back(number);
                return { kind: 'success', text: `Went back to checkpoint ${went.number}. Undo with /mission back ${went.saved}.\nThe folder is as it was at checkpoint ${went.number} (${went.label}).\nHow it was a moment ago is kept as checkpoint ${went.saved}.\nFiles your project ignores (build output and the like) were left alone.` };
              }
              // Anything else is a goal. A mode named first applies to it: "/mission auto make the tests pass".
              const named = modeOf(`${first} ${rest[0] ?? ''}`) ? 2 : modeOf(first) ? 1 : 0;
              const goal = text.split(/\s+/).slice(named).join(' ').trim();
              if (goal.split(/\s+/).length < 3) return { kind: 'error', text: `/mission does not know "${text.slice(0, 60)}". Click for the commands.\nA goal needs a few words, for example: /mission make every test pass and add a --json option\n\n${HELP}` };
              // Before anything is switched on: a run's helpers need the tier's sub-agents.
              const no = noHelpers();
              if (no) return { kind: 'error', text: no };
              const wanted = named === 2 ? modeOf(`${first} ${rest[0]}`) : named === 1 ? modeOf(first) : state.get(agent.id)?.mode ?? settings().defaultMode;
              let lead = '';
              if (state.get(agent.id)?.mode !== wanted) lead = `${(await switchOn(agent, wanted)).split('\n')[0]}\n`;
              const started = await runner.start(agent, goal, state.get(agent.id));
              const [head, ...more] = started.split('\n');
              return { kind: 'success', text: [head, lead.trim(), ...more].filter(Boolean).join('\n') };
            } catch (error) {
              return { kind: 'error', text: String(error?.message ?? error).slice(0, 400) };
            }
          },
        }),
      'mission command',
    );
  });
}
