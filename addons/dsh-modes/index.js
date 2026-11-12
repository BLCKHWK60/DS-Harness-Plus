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
import { maskFor, parentIdOf, rootOf, webDefault } from './lib/mask.js';
import { PROGRAM_TOOL, programNote, programOnly, SLOW_TOOLS } from './lib/ptc.js';

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
      'You are in Chat mode: answer directly in one reply. No tools are available. If a task needs files, commands or the web, say so and suggest switching to Cowork or Code mode.',
  },
  cowork: { label: 'Cowork', tools: 'all', sandbox: 'inherit', defaultTier: '', prompt: '' },
  code: { label: 'Code', tools: 'all', sandbox: 'workspace-write', defaultTier: '', prompt: '' },
};

/** Added while the conversation's tools are switched off. */
const TOOLS_OFF_PROMPT =
  'Tools are switched off for this conversation. Answer from what you know and do not try to call a tool. If the task cannot be done without tools, say so in one sentence.';
/** The answer to a program started in a conversation that has no tools (the app's PTC preset keeps `run_code` on offer). */
const NO_PROGRAMS = 'no tools are available in this conversation, so programs are not run. Answer directly.';
/** Added in a restricted mode (for example Chat) while the Search switch is on. */
const WEB_PROMPT =
  'Search is switched on for this conversation: you may use web_search and web_fetch to look things up, even though other tools are unavailable in this mode.';
/** Added to the system prompt while the Deep research switch is on. */
const RESEARCH_PROMPT =
  'Deep research is switched on for this conversation: for questions that need looking things up, use the deep_research tool to research them thoroughly and answer with a cited report. For small talk or follow-ups about an earlier report, answer directly.';

/** Sandbox values a mode may set. `danger-full-access` is deliberately not allowed here. */
const SANDBOX_VALUES = ['inherit', 'read-only', 'workspace-write'];

export const Config = z.object({
  /** Mode definitions as a JSON object: `{ id: { label, tools, sandbox, defaultTier, prompt } }`. */
  modes: z.string().default(JSON.stringify(BUILTIN_MODES)).volatile(),
  /** Mode of a session that has not chosen one. */
  defaultMode: z.string().default('cowork').volatile(),
  /** Per-session choice as JSON: `{ sessionId: modeId }`. Written by the composer selector. */
  sessionModes: z.string().default('{}').volatile(),
  /** Drop per-session entries whose Session is no longer stored, once per start. */
  pruneStaleSessions: z.boolean().default(true),
  /**
   * When a top-level Session starts its first turn without a chosen mode, record the mode it starts in.
   * A later change of `defaultMode` (for example from a sidebar tab) then only affects new Sessions.
   */
  pinOnFirstTurn: z.boolean().default(true),
  /** Per-session web switch as JSON: `{ sessionId: true | false }`. Missing = the mode's default (off in a no-tools mode). */
  sessionWeb: z.string().default('{}').volatile(),
  /** Per-session deep-research switch as JSON: `{ sessionId: true }`. While on, the model is told to use `deep_research`. */
  sessionResearch: z.string().default('{}').volatile(),
  /** Per-session tools switch as JSON: `{ sessionId: false }`. While off, the model is offered no tool at all. */
  sessionTools: z.string().default('{}').volatile(),
  /** Name of the slash command that switches modes. */
  commandName: z.string().default('mode'),
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
function normalizeMode(id, value) {
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
  if (Object.keys(result).length > 0) return result;
  for (const [id, value] of Object.entries(BUILTIN_MODES)) result[id] = normalizeMode(id, value);
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
    if (fresh.has(sessionId) && tabsDecide()) return modes[fallback] ?? Object.values(modes)[0];
    const chosen = overlay.get(sessionId) ?? readObject(config.sessionModes)[sessionId];
    return modes[chosen] ?? modes[fallback] ?? Object.values(modes)[0];
  }

  /** Sessions that have not run a turn yet. */
  const fresh = new Set();
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
    if (!accepted) return;
    state.unrestrict = agent.ctx.effect(() => agent.ctx.tools.restrict(accepted), 'modes tool restriction');
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
   * The tool mask for a Session: its mode's tools, with the Search and Deep research switches applied.
   * @param {string} sessionId - Agent id.
   * @param {object} mode - mode.
   * @returns {{allow?: string[], deny?: string[]} | null} mask, or null for no restriction.
   */
  function toolMask(sessionId, mode) {
    // Names are not filtered against a visible list: in this dsh version many tools (web_fetch,
    // read, grep...) come from the Agent's preset and are not listed to plugins, yet a restriction
    // can name them. Names the app refuses are dropped when the mask is applied (applyTools).
    return maskFor({ tools: mode.tools, web: webOn(sessionId, mode), research: researchOn(sessionId), off: toolsOff(sessionId), child: topOf(sessionId) !== sessionId });
  }

  /** @returns {boolean} whether the conversation's tools are switched off altogether. A helper follows its conversation. */
  function toolsOff(sessionId) {
    return readObject(config.sessionTools)[topOf(sessionId)] === false;
  }

  /** @returns {boolean} whether web tools are on for the Session (explicit switch, else the mode's default). */
  function webOn(sessionId, mode) {
    if (toolsOff(sessionId)) return false;
    const chosen = readObject(config.sessionWeb)[topOf(sessionId)];
    return typeof chosen === 'boolean' ? chosen : webDefault(mode.tools);
  }

  /** @returns {boolean} whether the Deep research switch is on for the Session. */
  function researchOn(sessionId) {
    return !toolsOff(sessionId) && readObject(config.sessionResearch)[topOf(sessionId)] === true;
  }

  /**
   * Set the session's sandbox mode for a mode, and put it back when a mode
   * that does not set one is chosen later.
   * @param {object} agent - live Agent.
   * @param {object} state - applied state of the Agent.
   * @param {object} mode - mode to apply.
   */
  function applySandbox(agent, state, mode) {
    const policy = ctx.get('sandboxPolicy');
    if (!policy) return;
    const session = agent.session;
    const effective = () => policy.resolve({ session }).mode;
    if (mode.sandbox !== 'inherit') {
      if (state.sandboxBase === undefined) state.sandboxBase = effective();
      if (effective() !== mode.sandbox) session.append('sandbox/mode', { mode: mode.sandbox });
    } else if (state.sandboxBase !== undefined) {
      if (effective() !== state.sandboxBase) session.append('sandbox/mode', { mode: state.sandboxBase });
      state.sandboxBase = undefined;
    }
  }

  /**
   * Apply a mode to one Agent.
   * @param {object} agent - live Agent.
   * @param {object} mode - mode to apply.
   * @param {boolean} switching - true when this replaces an earlier mode, so a default tier applies.
   * @returns {Promise<void>}
   */
  async function applyMode(agent, mode, switching) {
    const state = applied.get(agent.id) ?? {};
    applied.set(agent.id, state);
    applyTools(agent, state, mode);
    applySandbox(agent, state, mode);
    state.modeId = mode.id;
    if (switching && mode.defaultTier) {
      const tiers = ctx.get('modelTiers');
      if (tiers?.listTiers().some((tier) => tier.id === mode.defaultTier)) {
        await tiers.setSessionTier(agent.id, mode.defaultTier);
      } else {
        ctx.logger.warn(`modes: default tier "${mode.defaultTier}" of mode ${mode.id} is not available`);
      }
    }
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
      // Same mode; the Search / Deep research switches may still have changed the tool mask.
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
          text: () => {
            // A helper gets no mode wording: "answer in one reply, no tools" would stop a searcher from searching.
            if (topOf(agent.id) !== agent.id) return viaPrograms(agent);
            const mode = modeOf(agent.id);
            if (toolsOff(agent.id)) return [mode.tools === 'none' ? mode.prompt : '', TOOLS_OFF_PROMPT].filter(Boolean).join('\n\n');
            const webGranted = mode.tools !== 'all' && webOn(agent.id, mode);
            // A model version that stands alone leaves out the mode's own wording; the notes about tools stay.
            let alone = false;
            try {
              alone = ctx.get('modelTiers')?.instructionsReplaced?.(agent.id) === true;
            } catch {
              alone = false;
            }
            return [alone ? '' : mode.prompt, webGranted ? WEB_PROMPT : '', researchOn(agent.id) ? RESEARCH_PROMPT : '', viaPrograms(agent)].filter(Boolean).join('\n\n');
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
  ctx.on('agent/created', async ({ agent }) => {
    try {
      noteParent(agent);
      if (neverRan(agent)) fresh.add(agent.id);
      installPrompt(agent);
      await applyMode(agent, modeOf(agent.id), false);
    } catch (error) {
      report(error);
    }
    void pruneStale().catch(report);
  });
  for (const agent of ctx.get('agents')?.list() ?? []) {
    noteParent(agent);
    if (neverRan(agent)) fresh.add(agent.id);
    installPrompt(agent);
    void applyMode(agent, modeOf(agent.id), false).catch(report);
  }

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
    const force = fresh.has(agent.id) && tabsDecide();
    const modeId = modeOf(agent.id).id;
    fresh.delete(agent.id);
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
    if (status === 'running') pinStartingMode(agent);
    if (status !== 'idle') return;
    const work = pendingIdle.get(agent.id);
    if (!work) return;
    pendingIdle.delete(agent.id);
    void work().catch(report);
  });

  ctx.on('agent/disposed', ({ agent }) => {
    applied.get(agent.id)?.unrestrict?.();
    applied.delete(agent.id);
    fresh.delete(agent.id);
    overlay.delete(agent.id);
    pendingIdle.delete(agent.id);
    promptDisposers.delete(agent.id);
    parents.delete(agent.id);
  });

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
      const fields = ['sessionModes', 'sessionWeb', 'sessionResearch', 'sessionTools'];
      const ids = new Set(fields.flatMap((field) => Object.keys(readObject(config[field]))));
      const gone = new Set();
      for (const sessionId of ids) {
        if (live.has(sessionId)) continue;
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
    /**
     * @param {string} sessionId - Agent id.
     * @returns {string} id of the Session's mode.
     */
    get(sessionId) {
      return modeOf(sessionId).id;
    },
    /**
     * Switch a Session's mode; it applies at the next turn boundary.
     * @param {string} sessionId - Agent id.
     * @param {string} modeId - mode id.
     * @returns {Promise<void>}
     */
    async set(sessionId, modeId) {
      if (!readModes(config)[modeId]) throw new Error(`modes: unknown mode "${modeId}"`);
      const agent = ctx.get('agents')?.get(sessionId);
      if (!agent) throw new Error(`modes: unknown session "${sessionId}"`);
      overlay.set(sessionId, modeId);
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
   * What the model can and cannot call in a conversation right now, for the Tools list in the chat box.
   * @param {string} sessionId - the conversation.
   * @returns {object} `{known, mode, off, viaCode, can, cannot}`; `known` is false when the conversation is not loaded.
   */
  function toolsView(sessionId) {
    const agent = ctx.get('agents')?.get?.(sessionId) ?? (ctx.get('agents')?.list() ?? []).find((item) => item.id === sessionId);
    if (!agent) return { known: false, mode: '', off: false, can: [], cannot: [] };
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
    const allowed = new Set(can);
    return { known: true, mode: mode.label, off: toolsOff(sessionId), viaCode: programOnly(ctx.tools, agent), can: can.sort(), cannot: all.filter((name) => !allowed.has(name)).sort() };
  }

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: TOOLS_PATH,
          handler: (req, res) => {
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
              res.end(JSON.stringify(toolsView(typeof header === 'string' && /^[\w.:-]{1,120}$/.test(header) ? header : '')));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 200) }));
            }
          },
        }),
      'modes: GET tools route',
    );
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
              if (!wanted) {
                const lines = available.map((mode) => `${mode.id === current ? '* ' : '  '}${mode.id}: ${mode.label}`);
                return { kind: 'success', text: `Mode: ${current}\n${lines.join('\n')}` };
              }
              if (!available.some((mode) => mode.id === wanted)) {
                return { kind: 'error', text: `Unknown mode "${wanted}". Available: ${available.map((mode) => mode.id).join(', ')}` };
              }
              await modes.set(agent.id, wanted);
              return { kind: 'success', text: `Mode switched to ${wanted}.` };
            },
          }),
        'modes command',
      );
    });
  }
}
