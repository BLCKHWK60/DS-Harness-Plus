/**
 * Host half of the Model Tiers bundle.
 *
 * Responsibilities:
 *  - own the five tier definitions and the global sub-agent cap;
 *  - map a tier's plugin-level effort to an adapter-supported reasoning effort;
 *  - gate web_search, web_fetch, browser use, and sub-agent delegation per tier;
 *  - contribute one compact per-Agent prompt section describing the active tier.
 *
 * Tier selection itself is persisted by the Client through the normal settings
 * service (`activeTiers`, keyed by Session id). Model selection is applied by the
 * existing Session model-selection Remote, so this plugin never invents a second
 * routing path.
 */
import z from '@deepseek-ai/schemastery';

/** Canonical tier order. Later tiers are the more expensive defaults. */
const TIER_IDS = ['haiku', 'sonnet', 'opus', 'fable', 'code'];

/** Plugin-level effort levels, from no thinking to the most aggressive mode. */
const EFFORT_LEVELS = ['off', 'low', 'medium', 'high', 'extra-high', 'ultra'];

/** Display labels used in the model-visible tier section. */
const TIER_LABELS = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
  fable: 'Fable',
  code: 'Code',
  custom: 'Custom',
};

/** Effort labels used in the model-visible tier section. */
const EFFORT_LABELS = {
  off: 'Off',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  'extra-high': 'Extra high',
  ultra: 'Ultra Code',
};

/** Tools that start or orchestrate child Agents. */
const SUBAGENT_TOOLS = new Set([
  'subagent',
  'subagent_fork',
  'workflow',
  'spawn_teammate',
  'delegate_role',
  'review_lanes',
  'run_pipeline',
]);

/** Optional role routes that may be delegated to a child Agent. */
const ROLE_IDS = ['plan', 'implement', 'review', 'fast'];

/** Model-facing labels and instructions for role delegation. */
const ROLE_META = {
  plan: {
    label: 'Plan',
    instruction:
      'Act as a planning specialist. Investigate the repository, identify constraints, and return a decision-complete implementation plan. Do not edit files.',
  },
  implement: {
    label: 'Implement',
    instruction:
      'Act as an implementation specialist. Make the requested code changes, verify the touched path, and report the exact changes and checks.',
  },
  review: {
    label: 'Review',
    instruction:
      'Act as a strict code reviewer. Look for correctness, regression, security, and missing-test issues. Report concrete findings with file locations; do not make changes unless the task explicitly asks for fixes.',
  },
  fast: {
    label: 'Fast',
    instruction:
      'Act as a fast, narrow helper. Answer the focused question or perform the small scoped check directly, without broad exploration.',
  },
};

/** Independent review angles used by the multi-lane review tool. */
const REVIEW_ANGLES = {
  correctness: {
    label: 'Correctness & regressions',
    instruction:
      'Focus on correctness and regressions. Trace the changed behavior, compare it with the surrounding contracts, and report concrete failures with file:line.',
  },
  security: {
    label: 'Security',
    instruction:
      'Focus on security. Check trust boundaries, input validation, secrets, path and command handling, injection, and unsafe defaults. Report concrete exploitable issues with file:line.',
  },
  tests: {
    label: 'Tests & edge cases',
    instruction:
      'Focus on tests and edge cases. Identify missing coverage, boundary cases, error paths, and checks that would fail to catch the change. Report concrete gaps with file:line.',
  },
  performance: {
    label: 'Performance',
    instruction:
      'Focus on performance. Look for avoidable rework, unbounded growth, blocking calls, and hot-path regressions. Report only concrete issues with file:line.',
  },
};
const REVIEW_ANGLE_IDS = Object.keys(REVIEW_ANGLES);

/**
 * Describe a non-completed child result without hiding the stop reason.
 * @param {object} result - SubagentResult.
 * @returns {string} suffix for empty-output messages, or an empty string.
 */
function childResultNote(result) {
  if (result?.diagnostic) {
    return ` (${result.stopReason ?? 'error'}: ${result.diagnostic})`;
  }
  if (result?.stopReason && result.stopReason !== 'completed') {
    return ` (${result.stopReason})`;
  }
  return '';
}


/** Default tier definitions. Keep in sync with cordis.patch.yml. */
const DEFAULTS = {
  haiku: {
    provider: 'omlx-max',
    model: 'claude-haiku',
    effort: 'low',
    webSearch: true,
    webFetch: true,
    browser: true,
    subagents: true,
  },
  sonnet: {
    provider: 'omlx-max',
    model: 'claude-sonnet',
    effort: 'medium',
    webSearch: true,
    webFetch: true,
    browser: true,
    subagents: true,
  },
  opus: {
    provider: 'omlx-max',
    model: 'claude-opus',
    effort: 'high',
    webSearch: true,
    webFetch: true,
    browser: true,
    subagents: true,
  },
  fable: {
    provider: 'omlx-max',
    model: 'Qwen3.8-27B-TURBO-Fable-Cold-Fusion-735-882-Heretic-Uncensored-NM-DAU-mlx-oQ4e-1M',
    effort: 'medium',
    webSearch: true,
    webFetch: true,
    browser: true,
    subagents: true,
  },
  code: {
    provider: 'omlx-max',
    model: 'claude-opus',
    effort: 'ultra',
    webSearch: true,
    webFetch: true,
    browser: true,
    subagents: true,
  },
};

/**
 * Build a fresh leaf-volatile tier schema. Volatile leaves are editable through
 * the settings form without remounting this plugin.
 * @param {object} fallback - defaults for one tier.
 * @returns {object} schemastery object schema.
 */
function tierSchema(fallback) {
  return z.object({
    provider: z.string().default(fallback.provider).volatile(),
    model: z.string().default(fallback.model).volatile(),
    effort: z.string().default(fallback.effort).volatile(),
    webSearch: z.boolean().default(fallback.webSearch).volatile(),
    webFetch: z.boolean().default(fallback.webFetch).volatile(),
    browser: z.boolean().default(fallback.browser).volatile(),
    subagents: z.boolean().default(fallback.subagents).volatile(),
    /** Optional cap on concurrent child Agents for this tier; absent uses the global `maxSubagents`. */
    maxSubagents: z.number().min(1).max(8).volatile(),
  });
}

/** Live plugin configuration. Generated configuration catalog is authoritative. */
export const Config = z.object({
  tiers: z.object({
    haiku: tierSchema(DEFAULTS.haiku),
    sonnet: tierSchema(DEFAULTS.sonnet),
    opus: tierSchema(DEFAULTS.opus),
    fable: tierSchema(DEFAULTS.fable),
    code: tierSchema(DEFAULTS.code),
  }),
  maxSubagents: z.number().min(1).max(8).default(4).volatile(),
  ultraAutoDelegate: z.boolean().default(true).volatile(),
  activeTiers: z.string().default('{}').volatile(),
  /**
   * Per-model sampling defaults, keyed by provider and exact model id:
   * `{ provider: { model: { label, wireEffort, temperature, maxTokens, enabled } } }`.
   * Route-keyed so one model profile is shared by every tier using that route.
   */
  modelProfiles: z.string().default('{}').volatile(),
  /** One-time client migration marker for the route-keyed model registry. */
  modelProfilesMigrated: z.boolean().default(false).volatile(),
  /**
   * User-created tiers as a JSON array. Built-in tiers stay in `tiers`; custom
   * entries are additive and can never shadow a built-in id.
   */
  customTiers: z.string().default('[]').volatile(),
  /** Named tier decks scoped to Workspaces, plus each project's default profile. */
  projectProfiles: z.string().default('{"profiles":[],"projects":{}}').volatile(),
  /** Optional per-Session profile override; project default applies otherwise. */
  sessionProfiles: z.string().default('{}').volatile(),
  /** Ordered fallback routes per tier: `{ tierId: [{provider, model}] }`. */
  fallbackChains: z.string().default('{}').volatile(),
  /** Role routes per tier: `{ tierId: { plan|implement|review|fast: {provider, model} } }`. */
  roleModels: z.string().default('{}').volatile(),
  /** Drop per-Session tier and profile entries whose stored Session no longer exists, once per start. */
  pruneStaleSessions: z.boolean().default(true),
});

export const inject = ['tools', 'systemPrompt'];

/**
 * Recursively detach live Config references.
 * @param {unknown} value - plain value or volatile reference.
 * @returns {unknown} detached plain JSON-shaped value.
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

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Read the concurrent child-Agent cap: the tier's own cap when it has one,
 * otherwise the clamped global setting.
 * @param {object} config - live plugin Config.
 * @param {{maxSubagents?: number}} [tier] - tier whose cap applies.
 * @returns {number} 1..8
 */
function readMaxSubagents(config, tier) {
  if (tier?.maxSubagents !== undefined) return tier.maxSubagents;
  const value = Number(plain(config.maxSubagents));
  return Number.isFinite(value) ? clamp(Math.round(value), 1, 8) : 4;
}

/**
 * Normalize an optional per-tier sub-agent cap.
 * @param {unknown} value - stored cap.
 * @returns {number | undefined} whole number 1..8, or undefined when unset or invalid.
 */
function readTierCap(value) {
  const number = Number(value);
  return value === undefined || value === null || value === '' || !Number.isFinite(number)
    ? undefined
    : clamp(Math.round(number), 1, 8);
}

/**
 * Parse a Config field holding a JSON object.
 * @param {unknown} value - field value, a JSON string or an object.
 * @returns {Record<string, unknown>} the object, or an empty one.
 */
function readJsonObject(value) {
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

/** Session tier overrides set through the service when Settings cannot persist them, per Config. */
const sessionOverlays = new WeakMap();

/**
 * Read the persisted active-tier map.
 * @param {object} config - live plugin Config.
 * @returns {Record<string, string>} Session id to tier id.
 */
function readActiveTiers(config) {
  const base = readPersistedActiveTiers(config);
  const overlay = sessionOverlays.get(config);
  return overlay && overlay.size > 0 ? { ...base, ...Object.fromEntries(overlay) } : base;
}

/**
 * Read the active-tier map as persisted in Config, without session overrides
 * that a plugin set through the service and Settings could not store.
 * @param {object} config - live plugin Config.
 * @returns {Record<string, unknown>} Session id to stored selection.
 */
function readPersistedActiveTiers(config) {
  const raw = plain(config.activeTiers);
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
 * Read and normalize the per-model sampling registry.
 * Invalid entries are ignored rather than failing a model request.
 * @param {object} config - live plugin Config.
 * @returns {Record<string, Record<string, object>>} provider -> model -> profile.
 */
function readModelProfiles(config) {
  const raw = plain(config.modelProfiles);
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const result = {};
  for (const [provider, models] of Object.entries(parsed)) {
    if (!provider || !models || typeof models !== 'object' || Array.isArray(models)) continue;
    const normalizedModels = {};
    for (const [model, value] of Object.entries(models)) {
      if (!model || !value || typeof value !== 'object' || Array.isArray(value)) continue;
      const temperature =
        typeof value.temperature === 'number' && Number.isFinite(value.temperature)
          ? clamp(value.temperature, 0, 2)
          : undefined;
      const maxTokens =
        typeof value.maxTokens === 'number' &&
        Number.isFinite(value.maxTokens) &&
        value.maxTokens > 0
          ? Math.min(1_000_000, Math.floor(value.maxTokens))
          : undefined;
      normalizedModels[model] = {
        label: typeof value.label === 'string' && value.label.trim() ? value.label.trim() : model,
        wireEffort:
          typeof value.wireEffort === 'string' && value.wireEffort.trim()
            ? value.wireEffort.trim()
            : undefined,
        temperature,
        maxTokens,
        enabled: value.enabled !== false,
      };
    }
    if (Object.keys(normalizedModels).length > 0) result[provider] = normalizedModels;
  }
  return result;
}

/**
 * Read ordered fallback routes per tier.
 * @param {object} config - live plugin Config.
 * @returns {Record<string, Array<{provider: string, model: string}>>} tier id -> routes.
 */
function readFallbackChains(config) {
  const raw = plain(config.fallbackChains);
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const result = {};
  for (const [tierId, routes] of Object.entries(parsed)) {
    if (!tierId || !Array.isArray(routes)) continue;
    const chain = [];
    for (const route of routes) {
      if (!route || typeof route !== 'object') continue;
      const provider = typeof route.provider === 'string' ? route.provider.trim() : '';
      const model = typeof route.model === 'string' ? route.model.trim() : '';
      if (!provider || !model) continue;
      if (!chain.some((entry) => entry.provider === provider && entry.model === model)) {
        chain.push({ provider, model });
      }
    }
    if (chain.length > 0) result[tierId] = chain;
  }
  return result;
}

/**
 * Read role-model routes per tier.
 * @param {object} config - live plugin Config.
 * @returns {Record<string, Record<string, {provider: string, model: string}>>} tier id -> role -> route.
 */
function readRoleModels(config) {
  const raw = plain(config.roleModels);
  let parsed = raw;
  if (typeof raw === 'string') {
    try {
      parsed = raw.trim() ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const result = {};
  for (const [tierId, roles] of Object.entries(parsed)) {
    if (!tierId || !roles || typeof roles !== 'object' || Array.isArray(roles)) continue;
    const normalizedRoles = {};
    for (const role of ROLE_IDS) {
      const route = roles[role];
      if (!route || typeof route !== 'object') continue;
      const provider = typeof route.provider === 'string' ? route.provider.trim() : '';
      const model = typeof route.model === 'string' ? route.model.trim() : '';
      if (provider && model) normalizedRoles[role] = { provider, model };
    }
    if (Object.keys(normalizedRoles).length > 0) result[tierId] = normalizedRoles;
  }
  return result;
}

/**
 * Resolve one enabled model profile by exact route.
 * @param {Record<string, Record<string, object>>} profiles - normalized registry.
 * @param {string} provider - provider route.
 * @param {string} model - exact model id.
 * @returns {object | undefined} profile when present and enabled.
 */
function profileFor(profiles, provider, model) {
  const profile = profiles?.[provider]?.[model];
  return profile?.enabled === false ? undefined : profile;
}

/**
 * Merge a model profile's sampling defaults into one selection. Session values
 * already present win; a profile only fills fields the selection leaves unset.
 * @param {object} selection - tier/session selection.
 * @param {Record<string, Record<string, object>>} profiles - normalized registry.
 * @returns {object} selection with profile defaults merged.
 */
function withModelProfile(selection, profiles) {
  const profile = profileFor(profiles, selection.provider, selection.model);
  if (!profile) return selection;
  return {
    ...selection,
    ...(selection.temperature === undefined && profile.temperature !== undefined
      ? { temperature: profile.temperature }
      : {}),
    ...(selection.maxTokens === undefined && profile.maxTokens !== undefined
      ? { maxTokens: profile.maxTokens }
      : {}),
    ...(selection.wireEffort === undefined && profile.wireEffort !== undefined
      ? { wireEffort: profile.wireEffort }
      : {}),
  };
}

/**
 * Normalize one custom tier. Invalid entries are skipped rather than breaking
 * the built-in deck.
 * @param {unknown} value - raw custom tier.
 * @param {number} index - array position, used as an order fallback.
 * @param {Set<string>} usedIds - ids already claimed by built-ins/customs.
 * @returns {object | undefined} normalized custom tier.
 */
function normalizeCustomTier(value, index, usedIds) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const id = typeof value.id === 'string' ? value.id.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || usedIds.has(id)) return undefined;
  const provider = typeof value.provider === 'string' ? value.provider.trim() : '';
  const model = typeof value.model === 'string' ? value.model.trim() : '';
  if (!provider || !model) return undefined;
  const variants = [];
  if (Array.isArray(value.variants)) {
    for (const variant of value.variants) {
      if (!variant || typeof variant !== 'object') continue;
      const variantProvider = typeof variant.provider === 'string' ? variant.provider.trim() : '';
      const variantModel = typeof variant.model === 'string' ? variant.model.trim() : '';
      if (!variantProvider || !variantModel) continue;
      if (!variants.some((entry) => entry.provider === variantProvider && entry.model === variantModel)) {
        variants.push({ provider: variantProvider, model: variantModel });
      }
    }
  }
  const name =
    typeof value.name === 'string' && value.name.trim() ? value.name.trim() : id;
  usedIds.add(id);
  return {
    id,
    name,
    short:
      typeof value.short === 'string' && value.short.trim()
        ? value.short.trim().slice(0, 2)
        : name.slice(0, 1).toUpperCase(),
    role: typeof value.role === 'string' ? value.role : '',
    prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, 4000) : '',
    provider,
    model,
    effort: EFFORT_LEVELS.includes(value.effort) ? value.effort : 'medium',
    webSearch: value.webSearch !== false,
    webFetch: value.webFetch !== false,
    browser: value.browser !== false,
    subagents: value.subagents !== false,
    maxSubagents: readTierCap(value.maxSubagents),
    order:
      typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : 100 + index,
    variants,
    custom: true,
  };
}

/**
 * Read the merged built-in + custom tier deck.
 * @param {object} config - live plugin Config.
 * @returns {{ ids: string[], tiers: Record<string, object> }} ordered deck.
 */
function readDeck(config) {
  const raw = plain(config.tiers) ?? {};
  const tiers = {};
  for (const [index, id] of TIER_IDS.entries()) {
    const tier = raw[id] ?? {};
    const fallback = DEFAULTS[id];
    tiers[id] = {
      id,
      name: TIER_LABELS[id] ?? id,
      short: (TIER_LABELS[id] ?? id).slice(0, 1).toUpperCase(),
      role: '',
      prompt: '',
      provider: typeof tier.provider === 'string' ? tier.provider : fallback.provider,
      model: typeof tier.model === 'string' ? tier.model : fallback.model,
      effort: EFFORT_LEVELS.includes(tier.effort) ? tier.effort : fallback.effort,
      webSearch: tier.webSearch !== false,
      webFetch: tier.webFetch !== false,
      browser: tier.browser !== false,
      subagents: tier.subagents !== false,
      maxSubagents: readTierCap(tier.maxSubagents),
      order: index,
      variants: [],
      custom: false,
    };
  }

  const usedIds = new Set(TIER_IDS);
  let custom = [];
  const rawCustom = plain(config.customTiers);
  try {
    const parsed =
      typeof rawCustom === 'string' ? (rawCustom.trim() ? JSON.parse(rawCustom) : []) : rawCustom;
    if (Array.isArray(parsed)) {
      for (const [index, value] of parsed.entries()) {
        const tier = normalizeCustomTier(value, index, usedIds);
        if (tier) custom.push(tier);
      }
    }
  } catch {
    custom = [];
  }
  custom.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  for (const tier of custom) tiers[tier.id] = tier;
  return { ids: [...TIER_IDS, ...custom.map((tier) => tier.id)], tiers };
}

/**
 * Read all built-in and custom tiers.
 * @param {object} config - live plugin Config.
 * @returns {Record<string, object>} normalized tiers.
 */
function readTiers(config) {
  return readDeck(config).tiers;
}

/**
 * Test whether a tier owns an exact route as its primary or a variant.
 * @param {object} tier - normalized tier.
 * @param {string} provider - provider id.
 * @param {string} model - model id.
 * @returns {boolean} whether the tier uses the route.
 */
function tierHasRoute(tier, provider, model) {
  if (!tier) return false;
  if (tier.provider === provider && tier.model === model) return true;
  return Array.isArray(tier.variants)
    ? tier.variants.some((variant) => variant.provider === provider && variant.model === model)
    : false;
}

/**
 * Whether an exact route belongs to a tier's fallback chain.
 * @param {Record<string, Array<{provider: string, model: string}>>} chains - fallback registry.
 * @param {string | undefined} tierId - owning tier.
 * @param {string} provider - provider id.
 * @param {string} model - model id.
 * @returns {boolean} whether the route is a fallback for the tier.
 */
function tierFallbackHasRoute(chains, tierId, provider, model) {
  if (!tierId) return false;
  return (chains?.[tierId] ?? []).some(
    (route) => route.provider === provider && route.model === model,
  );
}

/**
 * Find which configured role owns an exact route for a tier.
 * @param {Record<string, Record<string, {provider: string, model: string}>>} roles - role registry.
 * @param {string | undefined} tierId - owning tier.
 * @param {string} provider - provider id.
 * @param {string} model - model id.
 * @returns {string | undefined} matching role id.
 */
function roleForRoute(roles, tierId, provider, model) {
  if (!tierId) return undefined;
  return ROLE_IDS.find((role) => {
    const route = roles?.[tierId]?.[role];
    return route?.provider === provider && route?.model === model;
  });
}

/**
 * Display label for a built-in or custom tier.
 * @param {object} tier - normalized tier.
 * @returns {string} label.
 */
function tierLabel(tier) {
  return tier?.name ?? tier?.id ?? 'Tier';
}

/**
 * Prefer a real reasoning effort for a plugin-level level, using only efforts
 * the selected adapter advertises.
 * @param {string[]} ids - advertised effort ids in adapter order.
 * @param {string} level - plugin-level effort.
 * @returns {string | undefined} chosen effort id.
 */
function chooseEffort(ids, level) {
  if (ids.length === 0) return undefined;
  const lower = ids.map((id) => ({ id, key: String(id).toLowerCase() }));
  const preferences = {
    off: ['off', 'none', 'disabled', 'minimal'],
    low: ['low', 'minimal', 'light'],
    medium: ['medium', 'mid', 'moderate', 'default'],
    high: ['high', 'deep', 'extended'],
    'extra-high': ['xhigh', 'extra-high', 'extra_high', 'very-high', 'max'],
    ultra: ['ultra', 'max', 'xhigh', 'extra-high', 'high'],
  };
  for (const candidate of preferences[level] ?? []) {
    const hit = lower.find((entry) => entry.key === candidate);
    if (hit) return hit.id;
  }
  if (level === 'off') return lower[0].id;
  if (level === 'ultra') return lower[lower.length - 1].id;
  if (level === 'extra-high') return lower[Math.max(0, lower.length - 2)].id;
  return undefined;
}

/**
 * Normalize one stored active-tier value. String values are the original
 * tier-only form; object values carry a per-Session model/effort override
 * written by the composer selector.
 * @param {unknown} entry - stored value for one Session.
 * @param {Record<string, object>} tiers - normalized tier definitions.
 * @param {Record<string, Record<string, object>>} profiles - normalized model profiles.
 * @returns {object | undefined} selection with an `id`, route, effort, and flags.
 */
function normalizeSelection(entry, tiers, profiles) {
  if (typeof entry === 'string') {
    const tier = tiers[entry];
    return tier ? withModelProfile({ id: entry, ...tier, explicit: true }, profiles) : undefined;
  }
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return undefined;

  const tierId =
    typeof entry.tier === 'string' && Object.hasOwn(tiers, entry.tier) ? entry.tier : undefined;
  const tier = tierId ? tiers[tierId] : undefined;
  const provider =
    typeof entry.provider === 'string' && entry.provider.length > 0 ? entry.provider : tier?.provider;
  const model = typeof entry.model === 'string' && entry.model.length > 0 ? entry.model : tier?.model;
  if (!provider || !model) return undefined;

  const matchedId =
    tierId ??
    Object.keys(tiers).find((id) => tierHasRoute(tiers[id], provider, model));
  const base = matchedId
    ? tiers[matchedId]
    : { webSearch: true, webFetch: true, browser: true, subagents: true };
  const effort = EFFORT_LEVELS.includes(entry.effort)
    ? entry.effort
    : matchedId
      ? tiers[matchedId].effort
      : 'medium';
  const temperature =
    typeof entry.temperature === 'number' && Number.isFinite(entry.temperature)
      ? Math.min(2, Math.max(0, entry.temperature))
      : undefined;
  const maxTokens =
    typeof entry.maxTokens === 'number' && Number.isFinite(entry.maxTokens) && entry.maxTokens > 0
      ? Math.min(1_000_000, Math.floor(entry.maxTokens))
      : undefined;

  return withModelProfile(
    {
      id: matchedId ?? 'custom',
      ...base,
      provider,
      model,
      effort,
      explicit: true,
      ...(temperature === undefined ? {} : { temperature }),
      ...(maxTokens === undefined ? {} : { maxTokens }),
    },
    profiles,
  );
}

/**
 * Resolve the tool-facing selection for one Session. The request route is used
 * to reject a stale override after the user switches models elsewhere.
 * @param {string} sessionId - owning Session.
 * @param {Map<string, {provider: string, model: string}>} lastRoute - last observed request route.
 * @param {object} config - live plugin Config.
 * @param {Record<string, Record<string, object>>} [profiles] - normalized model profiles.
 * @param {Record<string, Array<{provider: string, model: string}>>} [fallbacks] - fallback chains.
 * @param {Record<string, Record<string, {provider: string, model: string}>>} [roles] - role routes.
 * @returns {object | undefined} selection with its id.
 */
function tierForSession(
  sessionId,
  lastRoute,
  config,
  profiles = readModelProfiles(config),
  fallbacks = readFallbackChains(config),
  roles = readRoleModels(config),
) {
  const tiers = readTiers(config);
  const selection = normalizeSelection(readActiveTiers(config)[sessionId], tiers, profiles);
  const route = lastRoute.get(sessionId);
  if (
    selection &&
    (!route || (route.provider === selection.provider && route.model === selection.model))
  ) {
    return selection;
  }
  if (
    selection &&
    route &&
    tierFallbackHasRoute(fallbacks, selection.id, route.provider, route.model)
  ) {
    return { ...selection, provider: route.provider, model: route.model };
  }
  if (selection && route) {
    const role = roleForRoute(roles, selection.id, route.provider, route.model);
    if (role) {
      return { ...selection, provider: route.provider, model: route.model, role };
    }
  }
  if (route) {
    for (const id of Object.keys(tiers)) {
      const tier = tiers[id];
      const role = roleForRoute(roles, id, route.provider, route.model);
      if (tierHasRoute(tier, route.provider, route.model) || role) {
        const selected = withModelProfile(tier, profiles);
        return role
          ? { ...selected, provider: route.provider, model: route.model, role }
          : selected;
      }
    }
    for (const id of Object.keys(tiers)) {
      if (tierFallbackHasRoute(fallbacks, id, route.provider, route.model)) {
        return { ...withModelProfile(tiers[id], profiles), provider: route.provider, model: route.model };
      }
    }
  }
  return undefined;
}

/**
 * Resolve a selection from an exact route, preferring the Session override.
 * @param {string} sessionId - owning Session.
 * @param {string} provider - request provider.
 * @param {string} model - request model.
 * @param {object} config - live plugin Config.
 * @param {Record<string, Record<string, object>>} [profiles] - normalized model profiles.
 * @param {Record<string, Array<{provider: string, model: string}>>} [fallbacks] - fallback chains.
 * @param {Record<string, Record<string, {provider: string, model: string}>>} [roles] - role routes.
 * @returns {object | undefined} matching selection.
 */
function tierForRoute(
  sessionId,
  provider,
  model,
  config,
  profiles = readModelProfiles(config),
  fallbacks = readFallbackChains(config),
  roles = readRoleModels(config),
) {
  const tiers = readTiers(config);
  const selection = normalizeSelection(readActiveTiers(config)[sessionId], tiers, profiles);
  if (selection && selection.provider === provider && selection.model === model) return selection;
  if (selection && tierFallbackHasRoute(fallbacks, selection.id, provider, model)) {
    return { ...selection, provider, model };
  }
  if (selection) {
    const role = roleForRoute(roles, selection.id, provider, model);
    if (role) return { ...selection, provider, model, role };
  }
  for (const id of Object.keys(tiers)) {
    const tier = tiers[id];
    const role = roleForRoute(roles, id, provider, model);
    if (tierHasRoute(tier, provider, model) || role) {
      const selected = withModelProfile(tier, profiles);
      return role ? { ...selected, provider, model, role } : selected;
    }
  }
  // A route that is only a fallback of a tier still belongs to that tier.
  for (const id of Object.keys(tiers)) {
    if (tierFallbackHasRoute(fallbacks, id, provider, model)) {
      return { ...withModelProfile(tiers[id], profiles), provider, model };
    }
  }
  return undefined;
}

/**
 * Compose the model-visible description of the active tier.
 * @param {object | undefined} tier - active tier.
 * @param {number} maxSubagents - current global cap.
 * @param {boolean} ultraAutoDelegate - whether Ultra Code should push delegation.
 * @param {Record<string, Record<string, {provider: string, model: string}>>} [roles] - role routes.
 * @returns {string} prompt section text, or an empty string.
 */
function tierPrompt(tier, maxSubagents, ultraAutoDelegate, roles = {}) {
  if (!tier) return '';
  const lines = [
    `## Active model tier: ${tierLabel(tier)}`,
    `Effort: ${EFFORT_LABELS[tier.effort] ?? tier.effort}. Route: \`${tier.provider}/${tier.model}\`.`,
  ];
  if (tier.role && ROLE_META[tier.role]) {
    lines[1] += ` Role: ${ROLE_META[tier.role].label}.`;
  }
  if (typeof tier.maxTokens === 'number') lines.push(`Max output tokens: ${tier.maxTokens}.`);

  const internet = [
    tier.webSearch ? 'web search' : null,
    tier.webFetch ? 'web fetch' : null,
    tier.browser ? 'browser (ego-browser)' : null,
  ].filter(Boolean);
  lines.push(
    internet.length > 0
      ? `Internet access for this tier: ${internet.join(', ')}.`
      : 'Internet access for this tier: none. Do not attempt web search, web fetch, or browser automation.',
  );

  switch (tier.id) {
    case 'haiku':
      lines.push(
        'Haiku behavior: prefer fast, narrow actions. Locate the relevant code, make the smallest correct change, and avoid broad refactors unless the user asks for them.',
      );
      break;
    case 'sonnet':
      lines.push(
        'Sonnet behavior: plan briefly, implement the change, then verify the touched path. Balance speed against completeness.',
      );
      break;
    case 'opus':
      lines.push(
        'Opus behavior: take the harder reasoning path. State assumptions, weigh alternatives, and verify edge cases before declaring success.',
      );
      break;
    case 'fable':
      lines.push(
        'Fable behavior: explore broadly. Gather context, connect disparate parts, and produce a coherent synthesis before editing.',
      );
      break;
    case 'code':
      lines.push(
        'This is the Code tier. Its sole purpose is to review, check, and fix code. Do not plan features or start new product scope.',
        'Begin with the diff or the named files, then run the narrowest checks that prove the change (typecheck, focused tests, lint).',
        'Report findings first, ordered by severity, each with `file:line` and a concrete failure mode. Then apply the fixes and re-run the checks.',
        'If nothing is wrong, say so plainly and name the checks you ran.',
      );
      break;
    default:
      if (tier.custom) {
        lines.push(
          `Custom tier "${tier.name}". ${tier.role ? `${tier.role} ` : ''}Follow this tier's role and the user's request; do not silently switch to a built-in tier.`,
        );
        if (tier.prompt) lines.push(tier.prompt);
      } else {
        lines.push(
          'This is a custom model selection. Use the selected model at the depth requested; do not silently switch to a configured tier.',
        );
      }
      break;
  }

  if (tier.effort === 'off') {
    lines.push('Answer directly with no extended reasoning preamble and no self-review loop.');
  } else if (tier.effort === 'low') {
    lines.push('Keep reasoning brief and act on the first sound approach.');
  } else if (tier.effort === 'medium') {
    lines.push('Plan briefly, implement, then verify the touched path.');
  } else if (tier.effort === 'high') {
    lines.push(
      'Reason carefully, state assumptions, and verify the result before finishing. Run the narrowest relevant checks.',
    );
  } else if (tier.effort === 'extra-high') {
    lines.push(
      'Reason exhaustively: check edge cases, failure paths, and the relevant tests. Run typecheck/tests and review the final diff; prefer one more verification pass over a plausible guess.',
    );
  }

  if (!tier.subagents) {
    lines.push('Sub-agent delegation is disabled for this tier; do all work in this Session.');
  } else {
    lines.push(
      `You may delegate to sub-agents, with at most ${maxSubagents} concurrent children for this tier. Prefer local models for cheap independent checks and cloud models for hard reasoning when both are configured.`,
    );
  }

  if (tier.effort === 'ultra') {
    if (tier.subagents && ultraAutoDelegate) {
      lines.push(
        '**Ultra Code.** Decompose the task before acting. When two or more pieces are genuinely independent, start them as sub-agents together in one assistant message and keep doing useful work while they run.',
        `Cap concurrent children at ${maxSubagents}; if a piece is not independent, do it directly instead of delegating. Do not sleep or poll while children run.`,
        'Proactively look for delegation opportunities (parallel file audits, independent test/lint checks, separate review angles) instead of waiting to be asked. Do not create busywork when the pieces are not independent.',
        'You own the final synthesis and verification; do not delegate either one.',
      );
    } else if (tier.subagents) {
      lines.push(
        '**Ultra Code.** Reason exhaustively and verify the result. Do not proactively delegate; only use a sub-agent when the user asks for one or when a piece is clearly blocking.',
        `If you do delegate, keep concurrent children at or below ${maxSubagents} and keep working while they run.`,
      );
    } else {
      lines.push(
        '**Ultra Code.** Reason exhaustively and verify the result. Sub-agent delegation is disabled for this tier, so do the work directly.',
      );
    }
    lines.push(
      'Before finishing, run the narrowest checks that prove the change (typecheck, focused tests, lint), review the final diff, and fix and rerun on failure. State which checks you ran.',
    );
    if (tier.id === 'code') {
      lines.push(
        'At Ultra on the Code tier, fan out independent review angles when sub-agents are available (correctness, security, performance, tests), then consolidate their findings yourself and verify each fix.',
      );
    }
  }

  if (tier.subagents) {
    lines.push(
      `The same ${maxSubagents}-child cap applies to \`workflow\` agent() calls and to any team members you spawn.`,
    );
    const configuredRoles = ROLE_IDS.filter((role) => roles?.[tier.id]?.[role]);
    if (configuredRoles.length > 0) {
      lines.push(
        `Role models are configured for: ${configuredRoles.map((role) => ROLE_META[role].label).join(', ')}. ` +
          'Use `delegate_role` with a role when a focused child on that role model is useful; the parent tier still enforces access and the child cap.',
      );
      if (configuredRoles.includes('review')) {
        lines.push(
          'For a substantive diff or scoped implementation review, use `review_lanes` to run independent correctness, security, and test angles in parallel, then consolidate and verify their findings yourself.',
        );
      }
      if (configuredRoles.includes('plan') && configuredRoles.includes('implement')) {
        lines.push(
          'For a feature-sized task that needs planning and implementation, `run_pipeline` sequences Plan → Implement → Review on those role models. Prefer it when the task is large enough to justify staged children; verify the final diff yourself.',
        );
      }
    }
  }

  return lines.join('\n');
}

/**
 * Host plugin entry.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live plugin Config.
 */
export function apply(ctx, config) {
  /** Last request route seen per Session, used to reject stale tier entries. */
  const lastRoute = new Map();
  /** Adapter effort ids, cached per exact route. */
  const effortCache = new Map();
  /** Last tier/route observed for one request, used when a failure needs the chain. */
  const lastSelection = new Map();
  /** Agent id to the disposer owning that Agent's prompt section. */
  const promptDisposers = new Map();

  // Plugin teardown also removes prompt sections registered on Agent
  // contexts, which outlive this plugin's own scope.
  ctx.effect(() => () => {
    for (const dispose of promptDisposers.values()) {
      try {
        dispose?.();
      } catch {
        // The Agent context may already be disposed.
      }
    }
    promptDisposers.clear();
  }, 'model-tiers prompt ownership');

  /**
   * Resolve adapter-advertised effort ids for one route.
   * @param {string} provider - provider route.
   * @param {string} model - model id.
   * @returns {Promise<string[]>} effort ids, possibly empty.
   */
  async function effortIds(provider, model) {
    const key = `${provider}\0${model}`;
    const cached = effortCache.get(key);
    if (cached !== undefined) return cached;
    const llm = ctx.get('llm');
    if (!llm) return [];
    try {
      const info = await llm.resolveModelInfo(provider, model);
      const ids = (info?.reasoning?.efforts ?? []).map((effort) => String(effort.id));
      effortCache.set(key, ids);
      return ids;
    } catch {
      return [];
    }
  }

  /**
   * Install the tier prompt section on one live Agent.
   * @param {object} agent - live Agent.
   */
  function installPrompt(agent) {
    if (promptDisposers.has(agent.id)) return;
    const agentCtx = agent?.ctx;
    if (!agentCtx?.systemPrompt) return;
    let dispose;
    try {
      dispose = agentCtx.effect(
        () =>
          agentCtx.systemPrompt.section({
            name: 'model-tiers',
            order: 70,
            text: () => {
              // The route is only recorded at the first request, so a new Session
              // resolves its tier from the Agent's current selection until then.
              const tier = resolveTierOf(agent.id);
              return tierPrompt(
                tier,
                readMaxSubagents(config, tier),
                plain(config.ultraAutoDelegate) !== false,
                readRoleModels(config),
              );
            },
          }),
        'model-tiers prompt section',
      );
    } catch (error) {
      // A section left by an earlier generation of this plugin (for example
      // before a lifecycle fix) stays owned by the Agent until restart. The
      // current one is equivalent, so keep it instead of failing activation.
      if (String(error?.message ?? error).includes('already registered')) return;
      throw error;
    }
    if (typeof dispose === 'function') promptDisposers.set(agent.id, dispose);
  }

  ctx.on('agent/created', ({ agent }) => installPrompt(agent));

  // Live Agents created before this plugin activated (including the current
  // Session) receive the same section without waiting for a restart.
  for (const agent of ctx.get('agents')?.list() ?? []) installPrompt(agent);

  const delegateRoleTool = {
    name: 'delegate_role',
    description:
      'Delegate one focused task to a child Agent running a role-specific model configured for the active tier. ' +
      'Roles: plan (investigate and return a plan), implement (make scoped changes), review (strict review/findings), fast (narrow quick check). ' +
      'The parent tier\'s access and concurrent sub-agent policy still apply. Configure role routes in Settings → Model Tiers.',
    parameters: {
      type: 'object',
      properties: {
        role: {
          type: 'string',
          enum: ROLE_IDS,
          description: 'Role model to run the child with.',
        },
        prompt: {
          type: 'string',
          minLength: 1,
          description: 'Self-contained task for the child. Include paths, acceptance criteria, and what to return.',
        },
        description: {
          type: 'string',
          maxLength: 200,
          description: 'Short label for the child Agent card.',
        },
      },
      required: ['role', 'prompt'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          role: { type: 'string' },
          childId: { type: 'string' },
          stopReason: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['role', 'childId', 'text'],
      },
      render: (_args, value) => [
        { type: 'text', text: typeof value?.text === 'string' ? value.text : '' },
      ],
    },
    timeoutMs: 15 * 60 * 1000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const sessionId = exec.agent?.id;
      if (!sessionId) throw new Error('delegate_role needs a live parent Session.');
      const tier = tierForSession(sessionId, lastRoute, config);
      if (!tier) throw new Error('delegate_role needs an active model tier in this Session.');
      if (!tier.subagents) {
        throw new Error(`The ${tierLabel(tier)} tier has sub-agent delegation disabled.`);
      }
      const role = typeof args?.role === 'string' ? args.role : '';
      if (!ROLE_IDS.includes(role)) {
        throw new Error(`Unknown role "${role}". Use one of: ${ROLE_IDS.join(', ')}.`);
      }
      const route = readRoleModels(config)?.[tier.id]?.[role];
      if (!route) {
        throw new Error(
          `No ${ROLE_META[role].label} role model is configured for the ${tierLabel(tier)} tier. ` +
            'Add it in Settings → Model Tiers → Role models.',
        );
      }
      const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : '';
      if (!prompt) throw new Error('delegate_role prompt must not be empty.');
      const subagents = ctx.get('subagents');
      if (!subagents) throw new Error('Sub-agent service is unavailable.');

      const label =
        typeof args?.description === 'string' && args.description.trim()
          ? args.description.trim().slice(0, 200)
          : `${ROLE_META[role].label} · ${tierLabel(tier)}`;
      const started = await subagents.startActivation({
        provider: 'spawn',
        label,
        request: {
          prompt: [
            {
              type: 'text',
              text: `${ROLE_META[role].instruction}\n\n${prompt}`,
            },
          ],
          parent: exec.agent,
          signal: exec.signal,
          agentOptions: {
            provider: route.provider,
            model: route.model,
          },
        },
        delivery: 'parent',
        signal: exec.signal,
      });
      const result = await started.result;
      const text = (result.output ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim();
      return {
        role,
        childId: started.childId,
        stopReason: result.stopReason,
        text: text || `(The child returned no text output${childResultNote(result)}.)`,
      };
    },
  };
  ctx.effect(() => ctx.tools.register(delegateRoleTool));

  const reviewLanesTool = {
    name: 'review_lanes',
    description:
      'Run up to three independent review lanes in parallel on the active tier\'s configured Review role model. ' +
      'Angles cover correctness, security, tests, and performance. Use this for a substantive diff or scoped implementation review; ' +
      'the parent tier enforces access and the concurrent sub-agent cap. Configure the Review role in Settings → Model Tiers → Role models.',
    parameters: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          minLength: 1,
          description: 'Diff, paths, commit, or question to review. Be specific about what changed.',
        },
        context: {
          type: 'string',
          description: 'Optional repository context, constraints, or checks already run.',
        },
        angles: {
          type: 'array',
          maxItems: 3,
          items: { type: 'string', enum: REVIEW_ANGLE_IDS },
          description: 'Review angles. Defaults to correctness, security, and tests.',
        },
      },
      required: ['target'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          lanes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                angle: { type: 'string' },
                label: { type: 'string' },
                childId: { type: 'string' },
                stopReason: { type: 'string' },
                text: { type: 'string' },
                error: { type: 'string' },
              },
              required: ['angle', 'label'],
            },
          },
        },
        required: ['summary', 'lanes'],
      },
      render: (_args, value) => [
        { type: 'text', text: typeof value?.summary === 'string' ? value.summary : '' },
      ],
    },
    timeoutMs: 20 * 60 * 1000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const sessionId = exec.agent?.id;
      if (!sessionId) throw new Error('review_lanes needs a live parent Session.');
      const tier = tierForSession(sessionId, lastRoute, config);
      if (!tier) throw new Error('review_lanes needs an active model tier in this Session.');
      if (!tier.subagents) {
        throw new Error(`The ${tierLabel(tier)} tier has sub-agent delegation disabled.`);
      }
      const route = readRoleModels(config)?.[tier.id]?.review;
      if (!route) {
        throw new Error(
          `No Review role model is configured for the ${tierLabel(tier)} tier. ` +
            'Add it in Settings → Model Tiers → Role models.',
        );
      }
      const target = typeof args?.target === 'string' ? args.target.trim() : '';
      if (!target) throw new Error('review_lanes target must not be empty.');
      const context = typeof args?.context === 'string' ? args.context.trim() : '';
      const requested = Array.isArray(args?.angles)
        ? [...new Set(args.angles.filter((angle) => REVIEW_ANGLE_IDS.includes(angle)))]
        : [];
      const angles = requested.length > 0 ? requested : ['correctness', 'security', 'tests'];
      const subagents = ctx.get('subagents');
      if (!subagents) throw new Error('Sub-agent service is unavailable.');

      const max = readMaxSubagents(config, tier);
      let running = 0;
      try {
        const rows = await subagents.listDescendants(sessionId, exec.signal);
        running = rows.filter(
          (row) => row.kind === 'child' && row.depth <= 1 && row.activity === 'running',
        ).length;
      } catch {
        running = 0;
      }
      const available = Math.max(0, max - running);
      if (available === 0) {
        throw new Error(
          `This tier allows at most ${max} concurrent sub-agents and ${running} are already running.`,
        );
      }
      const selected = angles.slice(0, Math.min(3, available));

      const lanes = await Promise.all(
        selected.map(async (angle) => {
          const label = `${REVIEW_ANGLES[angle].label} · ${tierLabel(tier)}`;
          try {
            const started = await subagents.startActivation({
              provider: 'spawn',
              label,
              request: {
                prompt: [
                  {
                    type: 'text',
                    text:
                      `${ROLE_META.review.instruction}\n\n` +
                      `${REVIEW_ANGLES[angle].instruction}\n\n` +
                      `Target:\n${target}\n\n` +
                      `Context:\n${context || '(none provided)'}\n\n` +
                      'Return findings first, ordered by severity, each with `file:line` and a concrete failure mode. ' +
                      'If this angle finds nothing, say so plainly and name what you checked.',
                  },
                ],
                parent: exec.agent,
                signal: exec.signal,
                agentOptions: route,
              },
              delivery: 'parent',
              signal: exec.signal,
            });
            const result = await started.result;
            const text = (result.output ?? [])
              .filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join('\n')
              .trim();
            return {
              angle,
              label,
              childId: started.childId,
              stopReason: result.stopReason,
              text: text || `(No findings text returned${childResultNote(result)}.)`,
            };
          } catch (error) {
            return {
              angle,
              label,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        }),
      );

      const summary = [
        `### Review lanes (${tierLabel(tier)})`,
        ...lanes.map((lane) =>
          `#### ${lane.label}\n${lane.error ? `Lane failed: ${lane.error}` : lane.text}`,
        ),
      ].join('\n\n');
      return { summary, lanes };
    },
  };
  ctx.effect(() => ctx.tools.register(reviewLanesTool));

  const runPipelineTool = {
    name: 'run_pipeline',
    description:
      'Run a plan → implement → review pipeline on the active tier\'s configured Plan, Implement, and (optionally) Review role models. ' +
      'Plan investigates without edits, Implement makes scoped changes in the current workspace, and Review inspects the result. ' +
      'Use for feature-sized work when role models are configured. The parent still owns final synthesis and verification.',
    parameters: {
      type: 'object',
      properties: {
        task: {
          type: 'string',
          minLength: 1,
          description: 'Self-contained task. Include paths, constraints, and acceptance criteria.',
        },
        context: {
          type: 'string',
          description: 'Optional repository context, prior findings, or checks already run.',
        },
        review: {
          type: 'boolean',
          description: 'Run the Review stage when a Review role is configured. Defaults to true.',
        },
      },
      required: ['task'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string' },
          plan: { type: 'string' },
          implementation: { type: 'string' },
          review: { type: 'string' },
          planChildId: { type: 'string' },
          implementChildId: { type: 'string' },
          reviewChildId: { type: 'string' },
        },
        required: ['summary', 'plan', 'implementation'],
      },
      render: (_args, value) => [
        { type: 'text', text: typeof value?.summary === 'string' ? value.summary : '' },
      ],
    },
    timeoutMs: 30 * 60 * 1000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const sessionId = exec.agent?.id;
      if (!sessionId) throw new Error('run_pipeline needs a live parent Session.');
      const tier = tierForSession(sessionId, lastRoute, config);
      if (!tier) throw new Error('run_pipeline needs an active model tier in this Session.');
      if (!tier.subagents) {
        throw new Error(`The ${tierLabel(tier)} tier has sub-agent delegation disabled.`);
      }
      const task = typeof args?.task === 'string' ? args.task.trim() : '';
      if (!task) throw new Error('run_pipeline task must not be empty.');
      const context = typeof args?.context === 'string' ? args.context.trim() : '';
      const roles = readRoleModels(config)?.[tier.id] ?? {};
      if (!roles.plan || !roles.implement) {
        const missing = [!roles.plan ? 'Plan' : null, !roles.implement ? 'Implement' : null]
          .filter(Boolean)
          .join(' and ');
        throw new Error(
          `run_pipeline needs ${missing} role models for the ${tierLabel(tier)} tier. ` +
            'Add them in Settings → Model Tiers → Role models.',
        );
      }
      const subagents = ctx.get('subagents');
      if (!subagents) throw new Error('Sub-agent service is unavailable.');

      const max = readMaxSubagents(config, tier);
      try {
        const rows = await subagents.listDescendants(sessionId, exec.signal);
        const running = rows.filter(
          (row) => row.kind === 'child' && row.depth <= 1 && row.activity === 'running',
        ).length;
        if (running >= max) {
          throw new Error(
            `This tier allows at most ${max} concurrent sub-agents and ${running} are already running.`,
          );
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('concurrent sub-agents')) throw error;
      }

      const runStage = async (role, route, prompt) => {
        const started = await subagents.startActivation({
          provider: 'spawn',
          label: `${ROLE_META[role].label} · ${tierLabel(tier)}`,
          request: {
            prompt: [{ type: 'text', text: prompt }],
            parent: exec.agent,
            signal: exec.signal,
            agentOptions: route,
          },
          delivery: 'parent',
          signal: exec.signal,
        });
        const result = await started.result;
        const text = (result.output ?? [])
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
          .join('\n')
          .trim();
        return { childId: started.childId, stopReason: result.stopReason, text };
      };

      const plan = await runStage(
        'plan',
        roles.plan,
        `${ROLE_META.plan.instruction}\n\n` +
          `Task:\n${task}\n\n` +
          `Context:\n${context || '(none provided)'}\n\n` +
          'Return a decision-complete implementation plan, including the files and checks the implementer should use.',
      );
      const implementation = await runStage(
        'implement',
        roles.implement,
        `${ROLE_META.implement.instruction}\n\n` +
          `Task:\n${task}\n\n` +
          `Context:\n${context || '(none provided)'}\n\n` +
          `Plan:\n${plan.text || '(no plan text returned)'}\n\n` +
          'Work in the current workspace. Keep the change scoped, run the narrowest checks, and report exact files changed and verification results.',
      );

      let review = null;
      if (args?.review !== false && roles.review) {
        review = await runStage(
          'review',
          roles.review,
          `${ROLE_META.review.instruction}\n\n` +
            `Task:\n${task}\n\n` +
            `Plan:\n${plan.text || '(no plan text returned)'}\n\n` +
            `Implementation report:\n${implementation.text || '(no implementation text returned)'}\n\n` +
            'Inspect the current workspace and diff. Report concrete findings first, ordered by severity, with file:line. If nothing is wrong, say so and name the checks you ran.',
        );
      }

      const stages = [
        `#### Plan\n${plan.text || `(empty${childResultNote(plan)})`}`,
        `#### Implement\n${implementation.text || `(empty${childResultNote(implementation)})`}`,
        review
          ? `#### Review\n${review.text || `(empty${childResultNote(review)})`}`
          : '#### Review\nSkipped: no Review role configured or review disabled.',
      ];
      const summary = [`### Pipeline (${tierLabel(tier)})`, ...stages].join('\n\n');
      return {
        summary,
        plan: plan.text,
        implementation: implementation.text,
        review: review?.text ?? '',
        planChildId: plan.childId,
        implementChildId: implementation.childId,
        ...(review ? { reviewChildId: review.childId } : {}),
      };
    },
  };
  ctx.effect(() => ctx.tools.register(runPipelineTool));

  /**
   * Work out the reasoning effort Tier wants for one exact route.
   * @param {string} sessionId - owning Session (Agent id).
   * @param {string} provider - route provider.
   * @param {string} model - route model.
   * @returns {Promise<string | undefined>} effort id, or undefined when Tier has no opinion.
   */
  async function desiredEffort(sessionId, provider, model) {
    const profiles = readModelProfiles(config);
    const tier = tierForRoute(sessionId, provider, model, config, profiles, readFallbackChains(config));
    const profile = profileFor(profiles, provider, model);
    if (!tier && !profile) return undefined;
    const ids = await effortIds(provider, model);
    const pinned = tier?.wireEffort ?? profile?.wireEffort;
    if (pinned !== undefined && ids.includes(pinned)) return pinned;
    return tier ? chooseEffort(ids, tier.effort) : undefined;
  }

  /**
   * Record Tier's desired effort for the Agent's current route. dsh fixes
   * provider, model and effort when a step is prepared, so this uses the
   * supported `agent.model.select()` and takes effect at the next step.
   * Never throws: a failure leaves the adapter default effort in place.
   * @param {object} agent - live Agent.
   * @param {{provider: string, model: string, reasoningEffort?: string} | undefined} selection - current selection.
   * @returns {Promise<void>}
   */
  async function reconcileEffort(agent, selection) {
    try {
      if (!selection || typeof agent?.model?.select !== 'function') return;
      const effort = await desiredEffort(agent.id, selection.provider, selection.model);
      if (effort === undefined || effort === selection.reasoningEffort) return;
      agent.model.select({
        provider: selection.provider,
        model: selection.model,
        reasoningEffort: effort,
      });
    } catch (error) {
      ctx.logger.warn(`model-tiers: could not record tier effort: ${error?.message ?? error}`);
    }
  }

  // Before the first step of a new or resumed Agent, and ahead of each later
  // step, make the recorded selection carry the tier's effort.
  ctx.on('agent/created', async ({ agent }) => {
    await reconcileEffort(agent, agent.model?.current?.());
  });
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    await reconcileEffort(payload.agent, payload.modelSelection);
    return decision;
  });
  for (const agent of ctx.get('agents')?.list() ?? []) {
    void reconcileEffort(agent, agent.model?.current?.());
  }

  // `agent/request` is deprecated for provider, model and effort: on rc.1 the
  // loop throws if a listener changes any of them after step preparation. It
  // stays only for sampling controls, which have no replacement API.
  ctx.on('agent/request', async (payload, next) => {
    const base = await next();
    const sessionId = payload.agent.id;
    const profiles = readModelProfiles(config);
    const tier = tierForRoute(
      sessionId,
      base.provider,
      base.model,
      config,
      profiles,
      readFallbackChains(config),
    );
    const profile = profileFor(profiles, base.provider, base.model);
    if (!tier) {
      lastRoute.delete(sessionId);
      lastSelection.delete(sessionId);
    } else {
      lastRoute.set(sessionId, { provider: base.provider, model: base.model });
      lastSelection.set(sessionId, { tierId: tier.id, turn: payload.turn, step: payload.step });
    }
    if (!tier && !profile) return base;

    const nextConfig = { ...base };
    const temperature = tier?.temperature ?? profile?.temperature;
    if (typeof temperature === 'number') nextConfig.temperature = temperature;
    else if (tier?.explicit) delete nextConfig.temperature;

    const maxTokens = tier?.maxTokens ?? profile?.maxTokens;
    if (typeof maxTokens === 'number') nextConfig.maxTokens = maxTokens;
    else if (tier?.explicit) delete nextConfig.maxTokens;

    return nextConfig;
  });

  // ---- stale session pruning (T4) ---------------------------------------
  let pruned = false;

  /**
   * Remove per-Session entries for Sessions that are no longer stored. Runs
   * once, when the first Agent exists, so persistence is mounted. Live Agents
   * and Sessions whose existence cannot be confirmed are always kept.
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
      const fields = {
        activeTiers: readPersistedActiveTiers(config),
        sessionProfiles: readJsonObject(config.sessionProfiles),
      };
      const ops = [];
      const removed = {};
      for (const [field, map] of Object.entries(fields)) {
        const keep = {};
        let dropped = 0;
        for (const [sessionId, value] of Object.entries(map)) {
          let missing = false;
          if (!live.has(sessionId)) {
            try {
              missing = (await persistence.stat(sessionId)) === undefined;
            } catch {
              missing = false;
            }
          }
          if (missing) dropped += 1;
          else keep[sessionId] = value;
        }
        if (dropped > 0) {
          ops.push({ op: 'set', path: [field], value: JSON.stringify(keep) });
          removed[field] = dropped;
        }
      }
      if (ops.length === 0) return;
      await settings.mutate('model-tiers', ops);
      ctx.logger.info(`model-tiers: pruned stale session entries ${JSON.stringify(removed)}`);
    } catch (error) {
      ctx.logger.warn(`model-tiers: could not prune stale sessions: ${error?.message ?? error}`);
    }
  }
  ctx.on('agent/created', async () => {
    await pruneStale();
  });

  // ---- modelTiers service (T3) ------------------------------------------
  /** Handlers per event name; only `tier/changed` exists. */
  const tierListeners = { 'tier/changed': new Set() };
  /** Last tier id seen per Agent, used to report changes made outside the service. */
  const knownTier = new Map();
  /** Extra tool names that start child Agents, with a use count per name. */
  const extraSubagentTools = new Map();
  const overlay = new Map();
  sessionOverlays.set(config, overlay);

  /**
   * Describe one normalized tier for service consumers.
   * @param {object} tier - normalized tier.
   * @returns {object} frozen TierInfo.
   */
  function tierInfo(tier) {
    return Object.freeze({
      id: tier.id,
      label: tierLabel(tier),
      provider: tier.provider,
      model: tier.model,
      effort: tier.effort,
      webSearch: tier.webSearch,
      webFetch: tier.webFetch,
      browser: tier.browser,
      subagents: tier.subagents,
      maxSubagents: readMaxSubagents(config, tier),
      custom: tier.custom === true,
    });
  }

  /**
   * Resolve the tier an Agent is on, including a session override.
   * @param {string} sessionId - Agent id.
   * @returns {object | undefined} tier, or undefined when no tier applies.
   */
  function resolveTierOf(sessionId) {
    const known = tierForSession(sessionId, lastRoute, config);
    if (known) return known;
    const current = ctx.get('agents')?.get(sessionId)?.model?.current?.();
    return current ? tierForRoute(sessionId, current.provider, current.model, config) : undefined;
  }

  /**
   * Tell listeners a tier changed. A listener failure is logged, never thrown.
   * @param {string} sessionId - Agent id.
   * @param {string | undefined} from - previous tier id.
   * @param {string | undefined} to - new tier id.
   */
  function emitTierChanged(sessionId, from, to) {
    for (const handler of [...tierListeners['tier/changed']]) {
      try {
        handler(sessionId, from, to);
      } catch (error) {
        ctx.logger.warn(`model-tiers: tier/changed listener failed: ${error?.message ?? error}`);
      }
    }
  }

  /**
   * Report a tier change made outside the service (the composer) once per change.
   * @param {object} agent - live Agent.
   */
  function noteTier(agent) {
    const now = resolveTierOf(agent.id)?.id;
    const before = knownTier.get(agent.id);
    knownTier.set(agent.id, now);
    if (before !== now && before !== undefined) emitTierChanged(agent.id, before, now);
  }
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    noteTier(payload.agent);
    return decision;
  });

  /**
   * Primary route of a tier for one Session: its composer choice when the
   * Session selected that tier, otherwise the tier's configured route.
   * @param {string} sessionId - Agent id.
   * @param {string} tierId - tier id.
   * @returns {{provider: string, model: string} | null} primary route.
   */
  function primaryRouteOf(sessionId, tierId) {
    const tiers = readTiers(config);
    const chosen = normalizeSelection(
      readActiveTiers(config)[sessionId],
      tiers,
      readModelProfiles(config),
    );
    if (chosen && chosen.id === tierId) return { provider: chosen.provider, model: chosen.model };
    const tier = tiers[tierId];
    return tier ? { provider: tier.provider, model: tier.model } : null;
  }

  /**
   * Record a route (and the tier's effort for it) for the Agent's next step.
   * @param {object} agent - live Agent.
   * @param {{provider: string, model: string}} route - route to use.
   * @returns {Promise<void>}
   */
  async function selectRoute(agent, route) {
    const effort = await desiredEffort(agent.id, route.provider, route.model);
    agent.model.select({
      provider: route.provider,
      model: route.model,
      ...(effort === undefined ? {} : { reasoningEffort: effort }),
    });
  }

  /**
   * Move an Agent to the next route of its tier's fallback chain.
   * @param {object} agent - live Agent.
   * @param {(route: {provider: string, model: string}) => boolean} [skip] - routes to pass over.
   * @returns {Promise<{tierId: string, from: object, to: object} | null>} the move, or null when there is no next route.
   */
  async function advanceFallbackFor(agent, skip) {
    const current = agent.model?.current?.();
    if (!current) return null;
    const tier = tierForRoute(agent.id, current.provider, current.model, config);
    const chain = tier ? readFallbackChains(config)[tier.id] : undefined;
    if (!Array.isArray(chain) || chain.length === 0) return null;
    const at = chain.findIndex(
      (route) => route.provider === current.provider && route.model === current.model,
    );
    const target = chain.slice(at + 1).find((route) => !(skip && skip(route)));
    if (!target) return null;
    await selectRoute(agent, target);
    return {
      tierId: tier.id,
      from: { provider: current.provider, model: current.model },
      to: { provider: target.provider, model: target.model },
    };
  }

  /**
   * Move an Agent back to a tier's primary route.
   * @param {object} agent - live Agent.
   * @param {string} tierId - tier whose primary route to use.
   * @returns {Promise<{from: object, to: object} | null>} the move, or null when already there.
   */
  async function restorePrimaryFor(agent, tierId) {
    const current = agent.model?.current?.();
    const primary = primaryRouteOf(agent.id, tierId);
    if (!current || !primary) return null;
    if (current.provider === primary.provider && current.model === primary.model) return null;
    await selectRoute(agent, primary);
    return {
      from: { provider: current.provider, model: current.model },
      to: primary,
    };
  }

  /** Read-mostly Tier API for other plugins; the one write path is `setSessionTier`. */
  const modelTiers = {
    apiVersion: 1,

    /** @returns {object[]} every tier in deck order. */
    listTiers() {
      const deck = readDeck(config);
      return deck.ids.map((id) => tierInfo(deck.tiers[id]));
    },

    /**
     * @param {string} sessionId - Agent id.
     * @returns {object | null} the tier the Agent is on, or null.
     */
    resolveTier(sessionId) {
      const tier = resolveTierOf(sessionId);
      return tier ? tierInfo(tier) : null;
    },

    /**
     * Put one Agent on a tier: record the per-session choice and select the
     * tier's route and effort for the next step.
     * @param {string} sessionId - Agent id.
     * @param {string} tierId - tier to use.
     * @returns {Promise<void>}
     */
    async setSessionTier(sessionId, tierId) {
      const tier = readTiers(config)[tierId];
      if (!tier) throw new Error(`model-tiers: unknown tier "${tierId}"`);
      const agent = ctx.get('agents')?.get(sessionId);
      if (!agent) throw new Error(`model-tiers: unknown session "${sessionId}"`);
      const entry = { tier: tierId, provider: tier.provider, model: tier.model, effort: tier.effort };
      const from = resolveTierOf(sessionId)?.id;
      overlay.set(sessionId, entry);
      const settings = ctx.get('settings');
      if (settings) {
        const next = { ...readPersistedActiveTiers(config), [sessionId]: entry };
        try {
          await settings.mutate('model-tiers', [
            { op: 'set', path: ['activeTiers'], value: JSON.stringify(next) },
          ]);
          overlay.delete(sessionId);
        } catch (error) {
          // Settings refuses writes that an overlay or home patch would override.
          // The tier still applies for this run; the choice is not persisted.
          ctx.logger.warn(
            `model-tiers: tier for ${sessionId} not persisted (${error?.message ?? error}); kept in memory`,
          );
        }
      }
      const effort = await desiredEffort(sessionId, tier.provider, tier.model);
      agent.model.select({
        provider: tier.provider,
        model: tier.model,
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
      });
      lastRoute.set(sessionId, { provider: tier.provider, model: tier.model });
      knownTier.set(sessionId, tierId);
      if (from !== tierId) emitTierChanged(sessionId, from, tierId);
    },

    /**
     * @param {string} tierId - tier id.
     * @param {'plan' | 'implement' | 'review' | 'fast'} role - role.
     * @returns {{provider: string, model: string} | null} the role's route, or null.
     */
    roleRoute(tierId, role) {
      if (!ROLE_IDS.includes(role)) throw new Error(`model-tiers: unknown role "${role}"`);
      const route = readRoleModels(config)[tierId]?.[role];
      return route ? Object.freeze({ provider: route.provider, model: route.model }) : null;
    },

    /**
     * @param {string} tierId - tier id.
     * @returns {Array<{provider: string, model: string}>} fallback routes in order.
     */
    fallbackChain(tierId) {
      const chain = readFallbackChains(config)[tierId];
      return (Array.isArray(chain) ? chain : []).map((route) =>
        Object.freeze({ provider: route.provider, model: route.model }),
      );
    },

    /**
     * Sampling the user set explicitly for one Session in the composer (not model-profile defaults).
     * @param {string} sessionId - Agent id.
     * @returns {{temperature?: number, maxTokens?: number}} only the fields the Session sets.
     */
    sessionSampling(sessionId) {
      const entry = readPersistedActiveTiers(config)[sessionId];
      const result = {};
      if (entry && typeof entry === 'object') {
        if (typeof entry.temperature === 'number' && Number.isFinite(entry.temperature)) result.temperature = entry.temperature;
        if (typeof entry.maxTokens === 'number' && entry.maxTokens > 0) result.maxTokens = Math.floor(entry.maxTokens);
      }
      const live = overlay.get(sessionId);
      if (live && typeof live === 'object') {
        if (typeof live.temperature === 'number') result.temperature = live.temperature;
        if (typeof live.maxTokens === 'number') result.maxTokens = live.maxTokens;
      }
      return Object.freeze(result);
    },

    /**
     * Move a Session to the next route of its tier's fallback chain for the
     * next step. Only for plugins that detect an unreachable route; the
     * route in use stays untouched when there is no next route.
     * @param {string} sessionId - Agent id.
     * @param {{skip?: (route: {provider: string, model: string}) => boolean}} [options] - routes to pass over.
     * @returns {Promise<{tierId: string, from: object, to: object} | null>} the move, or null.
     */
    async advanceFallback(sessionId, options = {}) {
      const agent = ctx.get('agents')?.get(sessionId);
      if (!agent) throw new Error(`model-tiers: unknown session "${sessionId}"`);
      return advanceFallbackFor(agent, options.skip);
    },

    /**
     * Move a Session back to a tier's primary route for the next step.
     * @param {string} sessionId - Agent id.
     * @param {string} tierId - tier id.
     * @returns {Promise<{from: object, to: object} | null>} the move, or null when already on it.
     */
    async restorePrimary(sessionId, tierId) {
      const agent = ctx.get('agents')?.get(sessionId);
      if (!agent) throw new Error(`model-tiers: unknown session "${sessionId}"`);
      return restorePrimaryFor(agent, tierId);
    },

    /**
     * Subject a tool that starts child Agents to the tier's sub-agent access
     * and concurrency cap.
     * @param {string} name - tool name.
     * @returns {() => void} disposer.
     */
    registerSubagentTool(name) {
      if (typeof name !== 'string' || name.trim() === '') {
        throw new Error('model-tiers: registerSubagentTool needs a tool name');
      }
      extraSubagentTools.set(name, (extraSubagentTools.get(name) ?? 0) + 1);
      let disposed = false;
      return () => {
        if (disposed) return;
        disposed = true;
        const count = (extraSubagentTools.get(name) ?? 1) - 1;
        if (count <= 0) extraSubagentTools.delete(name);
        else extraSubagentTools.set(name, count);
      };
    },

    /**
     * @param {'tier/changed'} event - event name.
     * @param {(sessionId: string, from: string | undefined, to: string | undefined) => void} handler - listener.
     * @returns {() => void} disposer.
     */
    on(event, handler) {
      const set = tierListeners[event];
      if (!set) throw new Error(`model-tiers: unknown event "${event}"`);
      set.add(handler);
      return () => set.delete(handler);
    },
  };
  ctx.effect(() => ctx.provide('modelTiers', Object.freeze(modelTiers)), 'model-tiers service');

  // Fallback (T2). rc.1 fixes the route for a step and all of its retries, so
  // a failed step cannot be retried on another route. When a step fails
  // terminally on a tier's route, record the next route of the tier's fallback
  // chain with `agent.model.select()`; the next message uses it. The failed
  // step still ends with the provider error.
  ctx.on('agent/request-error', async (payload, next) => {
    const downstream = await next();
    if (downstream?.kind === 'retry' || payload.signal.aborted) return downstream;
    try {
      const moved = await advanceFallbackFor(payload.agent);
      if (moved) {
        ctx.logger.warn(
          `model-tiers: ${moved.from.provider}/${moved.from.model} failed; the next message will use ${moved.to.provider}/${moved.to.model}`,
        );
      }
    } catch (error) {
      ctx.logger.warn(`model-tiers: could not record fallback route: ${error?.message ?? error}`);
    }
    return downstream;
  });

  ctx.on('agent/disposed', ({ agent }) => {
    lastRoute.delete(agent.id);
    lastSelection.delete(agent.id);
    knownTier.delete(agent.id);
    overlay.delete(agent.id);
    const dispose = promptDisposers.get(agent.id);
    promptDisposers.delete(agent.id);
    try {
      dispose?.();
    } catch {
      // The Agent context is already unwinding.
    }
  });

  ctx.on('tools/pre-execute', async (exec, next) => {
    const sessionId = exec.agent?.id;
    if (!sessionId) return next();
    const tier = tierForSession(sessionId, lastRoute, config);
    if (!tier) return next();

    if (exec.name === 'web_search' && !tier.webSearch) {
      return {
        kind: 'deny',
        reason:
          `The ${tierLabel(tier)} tier has web search disabled. Answer from local context, or ask the user to enable it in Settings → Model Tiers.`,
      };
    }
    if (exec.name === 'web_fetch' && !tier.webFetch) {
      return {
        kind: 'deny',
        reason:
          `The ${tierLabel(tier)} tier has web fetch disabled. Work from local files, or ask the user to enable it in Settings → Model Tiers.`,
      };
    }
    if (!tier.browser) {
      const command = String(exec.arguments?.command ?? '');
      if (/browser|ego/i.test(exec.name) || (exec.name === 'bash' && /\bego(-browser)?\b/i.test(command))) {
        return {
          kind: 'deny',
          reason:
            `The ${tierLabel(tier)} tier has browser access disabled. Do not launch ego-browser; ask the user to enable it in Settings → Model Tiers.`,
        };
      }
    }

    if (SUBAGENT_TOOLS.has(exec.name) || extraSubagentTools.has(exec.name)) {
      if (!tier.subagents) {
        return {
          kind: 'deny',
          reason: `The ${tierLabel(tier)} tier has sub-agent delegation disabled. Do the work directly in this Session.`,
        };
      }
      if (exec.name !== 'workflow' && exec.name !== 'spawn_teammate') {
        const max = readMaxSubagents(config, tier);
        let running = 0;
        const subagents = ctx.get('subagents');
        if (subagents) {
          try {
            const rows = await subagents.listDescendants(sessionId, exec.signal);
            running = rows.filter(
              (row) => row.kind === 'child' && row.depth <= 1 && row.activity === 'running',
            ).length;
          } catch {
            running = 0;
          }
        }
        if (running >= max) {
          return {
            kind: 'deny',
            reason:
              `This tier allows at most ${max} concurrent sub-agents and ${running} are already running. ` +
              'Wait for a completion notice, then delegate again, or raise the cap in Settings → Model Tiers.',
          };
        }
      }
    }

    return next();
  });
}
