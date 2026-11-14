/**
 * Host half of Role prompts.
 *
 * Adds each configured section to the system prompt of every Agent as its own
 * prompt section, in the configured order, optionally only on chosen tiers.
 * Nothing is configured by default: `sections` is empty until the user adds
 * their own text.
 */
import z from '@deepseek-ai/schemastery';

export const name = 'role-prompts';

/** Order used for a section that does not set one; Tier's own section is 70. */
const DEFAULT_ORDER = 60;

const sectionSchema = z.object({
  enabled: z.boolean().default(true),
  order: z.number().default(DEFAULT_ORDER),
  appliesToTiers: z.array(z.string()).default([]),
  text: z.string().required(),
});

export const Config = z.object({
  sections: z.dict(sectionSchema).default({}),
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

export function apply(ctx, config) {
  /** Agent id -> disposer of the prompt sections installed on it. */
  const disposers = new Map();

  /**
   * Read the configured sections.
   * @returns {Record<string, {enabled: boolean, order: number, appliesToTiers: string[], text: string}>} sections.
   */
  function sections() {
    const raw = plain(config.sections);
    return raw && typeof raw === 'object' ? raw : {};
  }

  /**
   * Text of one section for one Agent, or an empty string when it is off or
   * does not apply to the Agent's tier.
   * @param {object} agent - live Agent.
   * @param {string} key - section key.
   * @returns {string} text to add to the prompt.
   */
  function textFor(agent, key) {
    const section = sections()[key];
    if (!section || section.enabled === false) return '';
    // A model version that stands alone leaves out the other added instructions.
    try {
      if (ctx.get('modelTiers')?.instructionsReplaced?.(agent.id) === true) return '';
    } catch {
      // Without Model Tiers nothing is left out.
    }
    const tiers = Array.isArray(section.appliesToTiers) ? section.appliesToTiers : [];
    if (tiers.length > 0) {
      const tier = ctx.get('modelTiers')?.resolveTier?.(agent.id);
      if (!tier || !tiers.includes(tier.id)) return '';
    }
    return String(section.text ?? '').trim();
  }

  /**
   * Install every configured section on one Agent.
   * @param {object} agent - live Agent.
   */
  function install(agent) {
    if (disposers.has(agent.id)) return;
    const agentCtx = agent?.ctx;
    if (!agentCtx?.systemPrompt) return;
    const installed = [];
    for (const [key, section] of Object.entries(sections())) {
      // A section that is somehow already there must not stop the Session from opening.
      try {
        installed.push(
        agentCtx.effect(
          () =>
            agentCtx.systemPrompt.section({
              name: `role-prompts:${key}`,
              order: section.order,
              // The text is the user's own prose: never treat `{{...}}` in it as a variable.
              interpolate: false,
              text: () => (ctx.get('modes')?.isolated?.(agent.id) === true ? '' : textFor(agent, key)),
            }),
          `role-prompts section ${key}`,
        ),
        );
      } catch (error) {
        ctx.logger.warn(`role-prompts: section ${key} not added: ${error?.message ?? error}`);
      }
    }
    disposers.set(agent.id, () => {
      for (const dispose of installed) {
        try {
          dispose?.();
        } catch {
          // The Agent context may already be unwinding.
        }
      }
    });
  }

  ctx.effect(() => () => {
    for (const dispose of disposers.values()) dispose();
    disposers.clear();
  }, 'role-prompts ownership');

  ctx.on('agent/created', ({ agent }) => install(agent));
  for (const agent of ctx.get('agents')?.list() ?? []) install(agent);
  ctx.on('agent/disposed', ({ agent }) => disposers.delete(agent.id));
}
