/**
 * Host half of Sampling presets.
 *
 * A preset is a named set of sampling values. A session gets one preset from
 * its task category (set with `/sampling`, or taken from its Modes mode, or the
 * default category). Two delivery paths, because dsh itself can send only
 * `temperature` and `maxTokens` per request (no top_p, top_k, min_p or
 * penalties; `stop` is refused by the pi-ai adapter):
 *
 * - in-dsh: the deprecated `agent/request` hook sets temperature and maxTokens
 *   (its only remaining job on rc.1). A value the user set explicitly for the
 *   session in the Tier composer is never overridden.
 * - server-alias: a preset can name a model alias that the inference server
 *   maps to its own sampling settings; the plugin selects that alias model at a
 *   turn boundary with `agent.model.select()`. Whether your server can hold
 *   several sampling profiles for one model is yours to know; this plugin only
 *   switches between model ids you list.
 *
 * Nothing is configured by default: with no presets the plugin does nothing.
 */
import z from '@deepseek-ai/schemastery';

export const name = 'sampling-presets';

const presetSchema = z.object({
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().min(1).max(1000000),
  notes: z.string().default(''),
});

export const Config = z.object({
  enabled: z.boolean().default(true),
  // The six fields below are volatile so the Settings page can edit them while the app runs.
  presets: z.dict(presetSchema).default({}).volatile(),
  categories: z.dict(z.string()).default({}).volatile(),
  byMode: z.dict(z.string()).default({}).volatile(),
  defaultCategory: z.string().default('').volatile(),
  perModel: z
    .dict(z.object({ allowedPresets: z.array(z.string()).default([]), aliases: z.dict(z.string()).default({}) }))
    .default({})
    .volatile(),
  strategy: z.union([z.const('in-dsh'), z.const('server-alias'), z.const('mixed')]).default('mixed').volatile(),
  commandName: z.string().default('sampling'),
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
 * Check the configuration for references that do not resolve; the plugin fails at load when it is wrong.
 * @param {object} cfg - plain Config.
 */
export function validateConfig(cfg) {
  const presets = cfg.presets ?? {};
  for (const [category, preset] of Object.entries(cfg.categories ?? {})) {
    if (!presets[preset]) throw new Error(`sampling-presets: category "${category}" names unknown preset "${preset}"`);
  }
  for (const [mode, category] of Object.entries(cfg.byMode ?? {})) {
    if (!(cfg.categories ?? {})[category]) throw new Error(`sampling-presets: mode "${mode}" names unknown category "${category}"`);
  }
  if (cfg.defaultCategory && !(cfg.categories ?? {})[cfg.defaultCategory]) {
    throw new Error(`sampling-presets: defaultCategory "${cfg.defaultCategory}" is not a category`);
  }
  for (const [key, entry] of Object.entries(cfg.perModel ?? {})) {
    if (!/^[^/]+\/.+$/.test(key)) throw new Error(`sampling-presets: perModel key "${key}" must be "<provider>/<model>"`);
    for (const preset of [...(entry.allowedPresets ?? []), ...Object.keys(entry.aliases ?? {})]) {
      if (!presets[preset]) throw new Error(`sampling-presets: perModel "${key}" names unknown preset "${preset}"`);
    }
  }
}

/**
 * Which preset applies for a category on a base model.
 * @param {object} cfg - plain Config.
 * @param {string | null | undefined} category - task category.
 * @param {string} baseKey - "<provider>/<model>" of the user's chosen model.
 * @returns {{category: string, name: string, preset: object, alias?: string} | {blocked: string} | null} the preset, a reason it is not allowed, or null.
 */
export function pickPreset(cfg, category, baseKey) {
  if (!category) return null;
  const name = (cfg.categories ?? {})[category];
  const preset = name ? (cfg.presets ?? {})[name] : undefined;
  if (!preset) return null;
  const model = (cfg.perModel ?? {})[baseKey];
  if (model?.allowedPresets?.length && !model.allowedPresets.includes(name)) {
    return { blocked: `preset "${name}" is not allowed for ${baseKey}` };
  }
  const alias = model?.aliases?.[name];
  return { category, name, preset, ...(alias ? { alias } : {}) };
}

export function apply(ctx, config) {
  if (plain(config.enabled) === false) return;
  // Checked at load. Live edits from the Settings page are checked by that page; a reference that
  // stops resolving later only makes pickPreset return nothing, it never throws mid-run.
  validateConfig(plain(config));

  /** Per-session state: { override, base: {provider, model}, aliasKey }. */
  const sessions = new Map();
  /** Work waiting for an idle Agent. */
  const pendingIdle = new Map();

  /** @returns {object} the current plain Config. */
  const cfg = () => plain(config);

  /**
   * @param {string} id - Agent id.
   * @returns {object} mutable per-session state.
   */
  function stateOf(id) {
    let state = sessions.get(id);
    if (!state) {
      state = { override: null, base: undefined, aliasKey: undefined };
      sessions.set(id, state);
    }
    return state;
  }

  /**
   * The user's chosen model: the current one, unless it is an alias this plugin switched to.
   * @param {object} agent - live Agent.
   * @returns {{provider: string, model: string} | undefined} base route.
   */
  function baseOf(agent) {
    const state = stateOf(agent.id);
    const current = agent.model?.current?.();
    if (!current) return undefined;
    const key = `${current.provider}/${current.model}`;
    if (state.aliasKey === key && state.base) return state.base;
    state.base = { provider: current.provider, model: current.model };
    state.aliasKey = undefined;
    return state.base;
  }

  /**
   * Resolve the preset an Agent should use now.
   * @param {object} agent - live Agent.
   * @returns {object | null} the pickPreset result with the category, or null.
   */
  function resolveFor(agent) {
    const state = stateOf(agent.id);
    const c = cfg();
    const mode = ctx.get('modes')?.get?.(agent.id);
    const category = state.override ?? (mode ? c.byMode?.[mode] : undefined) ?? (c.defaultCategory || null);
    const base = baseOf(agent);
    return base ? pickPreset(c, category, `${base.provider}/${base.model}`) : null;
  }

  /**
   * Select the alias model for the preset, or the base model when it has none (server-alias strategies only).
   * @param {object} agent - live Agent.
   */
  function reconcileModel(agent) {
    const c = cfg();
    if (c.strategy === 'in-dsh') return;
    const state = stateOf(agent.id);
    const picked = resolveFor(agent);
    const base = state.base;
    const current = agent.model?.current?.();
    if (!base || !current) return;
    const desiredModel = picked && !picked.blocked && picked.alias ? picked.alias : base.model;
    if (current.provider === base.provider && current.model === desiredModel) return;
    // Only move between the base model and its own aliases; never touch a route the user chose.
    const aliases = Object.values((c.perModel ?? {})[`${base.provider}/${base.model}`]?.aliases ?? {});
    const onFamily = current.model === base.model || aliases.includes(current.model);
    if (!onFamily || current.provider !== base.provider) return;
    agent.model.select({
      provider: base.provider,
      model: desiredModel,
      ...(current.reasoningEffort ? { reasoningEffort: current.reasoningEffort } : {}),
    });
    state.aliasKey = desiredModel === base.model ? undefined : `${base.provider}/${desiredModel}`;
  }

  /**
   * Run `work` now when the Agent is idle, otherwise once it is.
   * @param {object} agent - live Agent.
   * @param {() => void} work - task.
   */
  function atTurnBoundary(agent, work) {
    if (agent.status === 'idle') work();
    else pendingIdle.set(agent.id, work);
  }

  ctx.on('agent/created', ({ agent }) => {
    try {
      reconcileModel(agent);
    } catch (error) {
      ctx.logger.warn(`sampling-presets: ${error?.message ?? error}`);
    }
  });
  ctx.on('agent/status', ({ agent, status }) => {
    if (status !== 'idle') return;
    try {
      const work = pendingIdle.get(agent.id);
      pendingIdle.delete(agent.id);
      work?.();
      reconcileModel(agent);
    } catch (error) {
      ctx.logger.warn(`sampling-presets: ${error?.message ?? error}`);
    }
  });

  // Deprecated hook, kept only for sampling (rc.1 forbids route and effort changes there): preserve them exactly.
  ctx.on('agent/request', async (payload, next) => {
    const base = await next();
    const c = cfg();
    if (c.strategy === 'server-alias') return base;
    const picked = resolveFor(payload.agent);
    if (!picked || picked.blocked) return base;
    const explicit = ctx.get('modelTiers')?.sessionSampling?.(payload.agent.id) ?? {};
    const next2 = { ...base };
    if (picked.preset.temperature !== undefined && explicit.temperature === undefined) next2.temperature = picked.preset.temperature;
    if (picked.preset.maxTokens !== undefined && explicit.maxTokens === undefined) next2.maxTokens = picked.preset.maxTokens;
    return next2;
  });

  ctx.on('agent/disposed', ({ agent }) => {
    sessions.delete(agent.id);
    pendingIdle.delete(agent.id);
  });

  /**
   * What applies to one Session right now.
   * @param {string} sessionId - Agent id.
   * @returns {object} summary.
   */
  function effective(sessionId) {
    const agent = ctx.get('agents')?.get(sessionId);
    if (!agent) throw new Error(`sampling-presets: unknown session "${sessionId}"`);
    const picked = resolveFor(agent);
    const explicit = ctx.get('modelTiers')?.sessionSampling?.(sessionId) ?? {};
    const state = stateOf(sessionId);
    return {
      category: picked?.category ?? state.override ?? null,
      preset: picked && !picked.blocked ? picked.name : null,
      values: picked && !picked.blocked ? picked.preset : null,
      alias: picked && !picked.blocked ? picked.alias ?? null : null,
      blocked: picked?.blocked ?? null,
      explicitSessionSampling: explicit,
      strategy: cfg().strategy,
      override: state.override,
    };
  }

  const samplingPresets = Object.freeze({
    apiVersion: 1,
    /** @returns {{presets: string[], categories: string[]}} what is configured. */
    list() {
      const c = cfg();
      return { presets: Object.keys(c.presets), categories: Object.keys(c.categories ?? {}) };
    },
    effective,
    /**
     * @param {string} sessionId - Agent id.
     * @param {string | null} category - category to force, or null for automatic.
     */
    setCategory(sessionId, category) {
      const agent = ctx.get('agents')?.get(sessionId);
      if (!agent) throw new Error(`sampling-presets: unknown session "${sessionId}"`);
      if (category !== null && !(cfg().categories ?? {})[category]) throw new Error(`sampling-presets: unknown category "${category}"`);
      stateOf(sessionId).override = category;
      atTurnBoundary(agent, () => reconcileModel(agent));
    },
  });
  ctx.effect(() => ctx.provide('samplingPresets', samplingPresets), 'sampling-presets service');

  const commandName = plain(config.commandName);
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Show or set the sampling category of this session; `auto` returns to the mode or default',
            input: { hint: '[category|auto]' },
            handler: async ({ agent, rawInput }) => {
              const arg = String(rawInput ?? '').trim();
              if (arg) {
                try {
                  samplingPresets.setCategory(agent.id, arg.toLowerCase() === 'auto' ? null : arg);
                } catch (error) {
                  return { kind: 'error', text: `${error.message}. Categories: ${samplingPresets.list().categories.join(', ') || 'none'}` };
                }
              }
              const e = effective(agent.id);
              if (!e.preset) {
                return { kind: 'success', text: `No preset applies${e.blocked ? ` (${e.blocked})` : ''}. Category: ${e.category ?? 'none'}.` };
              }
              const v = e.values;
              return {
                kind: 'success',
                text:
                  `Category ${e.category}${e.override ? ' (set by you)' : ''}: preset ${e.preset} (temperature ${v.temperature}, max tokens ${v.maxTokens})` +
                  `${e.alias ? `, model alias ${e.alias}` : ''}; strategy ${e.strategy}.` +
                  `${Object.keys(e.explicitSessionSampling).length ? ' Your composer sampling for this session takes precedence.' : ''}`,
              };
            },
          }),
        'sampling-presets command',
      );
    });
  }
}
