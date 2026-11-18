import { join } from 'node:path';
/**
 * A stand-in app for Modes: just enough of the app's services to run the add-on whole (apply())
 * and to restart it on the same stored settings and conversations. Not a test file itself.
 */
import { setImmediate as tick } from 'node:timers/promises';
import { apply, Config } from '../index.js';

/**
 * What outlives a restart: the stored settings and the conversations with their logs.
 * @param {object} [options] - the app's default access level, its permission presets, and Modes settings.
 * @param {string} [options.defaultLevel] - the level of a conversation whose log sets none.
 * @param {Record<string, {sandbox: string}>} [options.presets] - the app's permission presets (none: no presets service).
 * @param {string} [options.defaultPreset] - the user's default preset.
 * @returns {object} the world.
 */
export function makeWorld({ defaultLevel = 'read-only', presets, defaultPreset, ...fields } = {}) {
  return { config: Config(fields), sessions: new Map(), defaultLevel, presets, defaultPreset };
}

/** A conversation's log: `sandbox/mode` and `permission/preset` events set its access level and preset, as in the app. */
export function sessionOf(world, id, header = {}) {
  if (!world.sessions.has(id)) {
    const session = { id, header, level: undefined, preset: null, events: [] };
    session.append = (type, data) => {
      session.events.push({ type, data });
      if (type === 'sandbox/mode') session.level = data.mode;
      if (type === 'permission/preset') session.preset = data.preset;
    };
    world.sessions.set(id, session);
  }
  return world.sessions.get(id);
}

/** Let queued settings writes finish. */
export async function settle() {
  for (let i = 0; i < 6; i += 1) await tick();
}

/**
 * Start Modes in the stand-in app.
 * @param {object} world - from makeWorld.
 * @param {object} [options] - what the app has.
 * @param {boolean} [options.tabs] - the Cowork sidebar is on.
 * @param {number} [options.maxTabs] - the sidebar's tab count.
 * @param {string[]} [options.tiers] - tier ids Model Tiers knows.
 * @param {string} [options.baseTier] - the tier a conversation is on before any is set for it.
 * @param {string[]} [options.known] - the tools the app knows.
 * @param {object[]} [options.loader] - the app's loaded rows (for Media tools' settings).
 * @param {Set<string>} [options.persisted] - conversations stored on disk.
 * @param {boolean} [options.alone] - every model version stands alone.
 * @param {Array<{id: string, lastTurn?: number}>} [options.before] - conversations already open when the add-on loads.
 * @param {number} [options.tierDelay] - milliseconds Model Tiers takes before a tier change reaches the model (its settings write).
 * @param {number} [options.writeDelay] - milliseconds a settings write of Modes takes.
 * @param {Map<string, object>} [options.goals] - each conversation's goal as the app's goals service views it: `{ phase, activation, objective }`.
 * @param {(ops: object[]) => boolean} [options.failWrite] - a settings write it returns true for fails (as a refused or crashed write does).
 * @param {object} [options.chat] - the app's chat settings (`ui-chat`), e.g. `{ foldedReplies: 'final' }`.
 * @param {Set<string>} [options.studying] - conversations where Learn runs a study session (no set: no Learn add-on).
 * @param {Set<string>} [options.scratch] - Scratch conversations, as the Cowork sidebar's `coworkScratch` service tells (no set: no such service).
 * @param {object} [options.mission] - Mission's service, e.g. `{ longRun: (id) => ({ files, web }) }` (none: no Mission).
 * @param {Set<string>} [options.ultra] - conversations with Ultra Code on, as Model Tiers tells (no set: Model Tiers cannot say).
 * @returns {object} the running app.
 */
export function boot(world, { tabs = false, maxTabs, tiers = [], baseTier = 'everyday', known = [], loader = [], persisted, alone = false, before = [], tierDelay = 0, writeDelay = 0, home, goals, failWrite, chat, studying, scratch, mission, ultra, credentials } = {}) {
  const { config } = world;
  const handlers = new Map();
  const agents = new Map();
  const disposers = [];
  const guards = [];
  /** Tools Modes registers (name -> { definition, options }). */
  const registered = new Map();
  const tierCalls = [];
  /** Tier changes that reached the model (`agent.model.select`), in order. */
  const tierSelected = [];
  const currentTier = new Map();
  const sections = new Map();
  let command;
  const settings = {
    describe: () => [{ ns: 'modes', value: config }, ...(tabs ? [{ ns: 'cowork-shell', value: { maxTabs } }] : []), ...(chat ? [{ ns: 'ui-chat', value: chat }] : [])],
    mutate: async (ns, ops) => {
      if (ns !== 'modes') throw new Error(`unexpected namespace ${ns}`);
      if (writeDelay > 0) await new Promise((resolve) => setTimeout(resolve, writeDelay));
      if (failWrite?.(ops)) throw new Error('settings write failed');
      for (const op of ops) if (op.op === 'set') config[op.path[0]] = op.value;
    },
  };
  const services = {
    settings,
    agents: { get: (id) => agents.get(id), list: () => [...agents.values()] },
    sandboxPolicy: { resolve: ({ session }) => ({ mode: session?.level ?? world.defaultLevel }) },
    modelTiers: {
      listTiers: () => tiers.map((id) => ({ id })),
      setSessionTier: async (id, tier) => {
        tierCalls.push([id, tier]);
        // Model Tiers writes its settings first; the model is selected only after that.
        if (tierDelay > 0) await new Promise((resolve) => setTimeout(resolve, tierDelay));
        currentTier.set(id, tier);
        tierSelected.push([id, tier]);
      },
      // A conversation without a tier of its own is on the tier its model belongs to.
      resolveTier: (id) => ({ id: currentTier.get(id) ?? baseTier }),
      instructionsReplaced: () => alone,
      // Ultra Code's switch (plan step S1); no set: an older Model Tiers that cannot say.
      ...(ultra ? { ultraCode: (id) => ultra.has(id) } : {}),
    },
    sessionPersistence: { stat: async (id) => (persisted?.has(id) ? {} : undefined) },
    // The app's home folder, when a test gives one (the Cowork sidebar's trash lives there).
    ...(home ? { dshHomePath: (...parts) => join(home, ...parts) } : {}),
    loader: { entries: () => loader },
    ...(tabs ? { coworkShell: {} } : {}),
    // The app's goals service: a view per live conversation (its phase, whether rounds are driven, its objective).
    ...(goals ? { goals: { get: (agent) => goals.get(agent.id) } } : {}),
    // Learn's service: whether a study session runs in a conversation.
    ...(studying ? { learning: { studying: (id) => studying.has(id) } } : {}),
    // Mission's service (a test gives `longRun(id)`): the tools of a Long run on in a conversation.
    ...(mission ? { mission } : {}),
    // The app's secret store (a test gives a stand-in: resolve, describe, set, unset).
    ...(credentials ? { credentials } : {}),
    // The Cowork sidebar's Scratch service: the folder a Scratch conversation is kept to.
    ...(scratch ? { coworkScratch: { folderOf: (agent) => (scratch.has(agent?.id) ? `/home/scratch/${agent.id}` : '') } } : {}),
    ...(world.presets
      ? {
          permissionPresets: {
            get defaultPreset() {
              return world.defaultPreset;
            },
            resolve: (name) => {
              if (!world.presets[name]) throw new Error(`unknown preset "${name}"`);
              return world.presets[name];
            },
            permissionState: (session) => ({ preset: session?.preset ?? null }),
          },
        }
      : {}),
  };
  let service;
  const ctx = {
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    get: (name) => (name === 'modes' ? service : services[name]),
    on: (name, handler, options) => {
      // As the app: `prepend` puts a listener outermost.
      handlers.set(name, options?.prepend ? [handler, ...(handlers.get(name) ?? [])] : [...(handlers.get(name) ?? []), handler]);
      return () => {};
    },
    effect: (start) => {
      const stop = start();
      if (typeof stop === 'function') disposers.push(stop);
      return stop;
    },
    provide: (name, value) => {
      if (name === 'modes') service = value;
      return () => {};
    },
    inject: (names, callback) => {
      if (names.includes('commands')) callback({ commands: { register: (spec) => { command = spec; return () => {}; } }, effect: (start) => start() });
    },
    tools: {
      definitions: () => known.map((name) => ({ name })),
      view: () => ({ knownNames: new Set(known), visible: new Map() }),
      guard: (guard) => {
        guards.push(guard);
        return () => {};
      },
      register: (definition, options) => {
        registered.set(definition.name, { definition, options });
        return () => registered.delete(definition.name);
      },
      restrict: () => () => {},
    },
  };
  /** A live conversation on its stored log; `masks` records the tool masks put on it. */
  const agentOf = (id, { lastTurn = 0, header = {} } = {}) => {
    const masks = [];
    const session = sessionOf(world, id, header);
    const agent = {
      id,
      status: 'idle',
      phase: { kind: 'idle', lastTurn },
      header,
      session,
      ctx: {
        effect: (start) => start(),
        tools: { restrict: (mask) => { const entry = { mask, undone: false }; masks.push(entry); return () => { entry.undone = true; }; } },
        systemPrompt: { section: (spec) => { sections.set(spec.name === 'modes:mode' ? id : `${id} ${spec.name}`, spec); return () => {}; } },
      },
      model: { current: () => ({ provider: 'p', model: 'm' }) },
      cancel: () => {},
      /** Messages steered into the running turn (the app runs one more step for them). */
      steered: [],
      steer: (message) => agent.steered.push(message),
    };
    agents.set(id, agent);
    return { agent, masks };
  };
  const opened = before.map((item) => agentOf(item.id, item));
  apply(ctx, config);
  const emit = async (name, ...args) => {
    for (const handler of handlers.get(name) ?? []) await handler(...args);
  };
  /** Dispatch a waterfall event as the app does: listeners outermost-first around `inner`. */
  const waterfall = (name, ...args) => {
    const inner = args.pop();
    const callbacks = [...(handlers.get(name) ?? [])];
    const dispatch = () => {
      const callback = callbacks.shift();
      return callback ? callback(...args, dispatch) : inner();
    };
    return dispatch();
  };
  return {
    config,
    tierCalls,
    tierSelected,
    waterfall,
    /** Another add-on listens too, registered after Modes (as the app's own skill add-on may be). */
    listen: (name, handler, options) => ctx.on(name, handler, options),
    /** The conversation is closed: its live Agent goes away. */
    close: async (agent) => {
      agents.delete(agent.id);
      await emit('agent/disposed', { agent });
    },
    /** The user picks a tier in the chat box. */
    pickTier: (id, tier) => currentTier.set(id, tier),
    opened,
    service: () => service,
    emit,
    /** Open a conversation: `source` is the app's: startup (just created) or resume (reloaded). */
    open: async (id, { source = 'startup', lastTurn = 0, header = {} } = {}) => {
      const made = agentOf(id, { lastTurn, header });
      await emit('agent/created', { agent: made.agent, source });
      return made;
    },
    /** The first turn starts and ends. */
    firstTurn: async (agent) => {
      agent.status = 'running';
      agent.phase = { kind: 'running', lastTurn: 0 };
      await emit('agent/status', { agent, status: 'running' });
      agent.status = 'idle';
      agent.phase = { kind: 'idle', lastTurn: 1 };
      await emit('agent/status', { agent, status: 'idle' });
    },
    /** A tool Modes registered: its definition, and whether it is offered to an agent (`when`). */
    tool: (name) => registered.get(name),
    /** What the tool guards answer to a call. */
    guard: (exec) => {
      for (const guard of guards) {
        const denial = guard(exec);
        if (denial !== undefined) return denial;
      }
      return undefined;
    },
    /** Run the slash command in a conversation. */
    command: (agent, rawInput) => command.handler({ agent, rawInput }),
    /** A message is claimed into a turn (`agent/inbox/claimed`); `kind` is its source (the user's by default). */
    claim: (agent, turn, kind = 'user') => emit('agent/inbox/claimed', { agent, turn, message: { role: 'user', content: [], source: { kind } } }),
    /** A model reply stopped at the output limit (`agent/assistant-stream`). */
    cutOff: (agent) => emit('agent/assistant-stream', { agent, frame: { type: 'chunk', chunk: { type: 'finish', reason: { kind: 'max-tokens' } } } }),
    /** A tool's final result (`tools/result`). */
    toolResult: (agent, name, result, args = {}) => emit('tools/result', { name, agent, arguments: args }, result),
    /** The app asks before a turn closes (`agent/turn-stopping`); `aborted` is the turn's signal. */
    turnStopping: (agent, turn, { aborted = false } = {}) => {
      const controller = new AbortController();
      if (aborted) controller.abort();
      return emit('agent/turn-stopping', { agent, turn, signal: controller.signal });
    },
    /** The text Modes adds to a conversation's instructions. */
    prompt: (id) => sections.get(id)?.text({}) ?? '',
    /** Another section Modes adds (e.g. 'modes:lens'): its text, and its order. */
    section: (id, name) => ({ text: sections.get(`${id} ${name}`)?.text({}) ?? '', order: sections.get(`${id} ${name}`)?.order }),
    stop: () => disposers.forEach((dispose) => dispose()),
  };
}

/** The tool mask in force on a conversation: the last one put on and not taken off. */
export const maskNow = (masks) => masks.filter((entry) => !entry.undone).at(-1)?.mask ?? null;
