/**
 * Host half of Model router.
 *
 * At the first step of a turn a small routing model picks one of 2 to 5
 * candidate models for the user's request. On dsh 0.2.2-rc.1 the model of the
 * step that is about to run is fixed before any plugin can act, so the choice
 * is recorded with `agent.model.select()` and takes effect from the SECOND step
 * of the turn; a turn that needs only one step still runs on the current route.
 * (Rejecting the first step to restart the turn was tried and simply ends the
 * turn with no answer.)
 *
 * Nothing is configured by default: with no candidates the plugin does nothing.
 * Every routing decision is kept in memory and visible with `/router`.
 */
import z from '@deepseek-ai/schemastery';

export const name = 'model-router';

const candidateSchema = z.object({
  id: z.string().required(),
  tier: z.string(),
  provider: z.string(),
  model: z.string(),
  reasoningEffort: z.string(),
  strengths: z.string().default(''),
  localOnly: z.boolean().default(false),
});

export const Config = z.object({
  enabled: z.boolean().default(true),
  candidates: z.array(candidateSchema).default([]),
  routingModel: z
    .object({
      provider: z.string(),
      model: z.string(),
      timeoutMs: z.number().min(500).max(60000).default(4000),
      maxTokens: z.number().min(50).max(2000).default(200),
    })
    .default({ timeoutMs: 4000, maxTokens: 200 }),
  policy: z
    .object({
      stickyTurns: z.number().min(0).max(50).default(2),
      minConfidence: z.number().min(0).max(1).default(0.6),
      defaultCandidate: z.string().default(''),
      respectHealth: z.boolean().default(true),
    })
    .default({ stickyTurns: 2, minConfidence: 0.6, defaultCandidate: '', respectHealth: true }),
  prompt: z
    .object({ systemText: z.string().default(''), includeLastN: z.number().min(0).max(10).default(3) })
    .default({ systemText: '', includeLastN: 3 }),
  commandName: z.string().default('router'),
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
 * Validate the candidate list; the plugin fails at load when it is wrong.
 * @param {Array<object>} candidates - configured candidates.
 * @returns {Array<object>} the candidates.
 */
export function validateCandidates(candidates) {
  if (candidates.length === 0) return candidates;
  if (candidates.length < 2 || candidates.length > 5) {
    throw new Error(`model-router: configure 2 to 5 candidates, got ${candidates.length}`);
  }
  const seen = new Set();
  for (const candidate of candidates) {
    if (!/^[A-Za-z0-9_-]+$/.test(candidate.id ?? '')) throw new Error(`model-router: invalid candidate id "${candidate.id}"`);
    if (seen.has(candidate.id)) throw new Error(`model-router: duplicate candidate id "${candidate.id}"`);
    seen.add(candidate.id);
    if (!candidate.tier && !(candidate.provider && candidate.model)) {
      throw new Error(`model-router: candidate "${candidate.id}" needs a tier or a provider and model`);
    }
  }
  return candidates;
}

/**
 * Text of the user messages claimed for a step.
 * @param {Array<{content?: any}>} messages - claimed messages.
 * @returns {string} their text.
 */
export function textOf(messages) {
  return (Array.isArray(messages) ? messages : [])
    .flatMap((message) => (Array.isArray(message?.content) ? message.content : []))
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim();
}

/**
 * Pull `{route, reason, confidence}` from a routing-model answer.
 * @param {string} text - model output.
 * @returns {{route: string, reason: string, confidence: number} | null} the answer, or null.
 */
export function parseRoute(text) {
  const source = String(text ?? '');
  for (let end = source.lastIndexOf('}'); end >= 0; end = source.lastIndexOf('}', end - 1)) {
    const start = source.lastIndexOf('{', end);
    if (start < 0) break;
    try {
      const data = JSON.parse(source.slice(start, end + 1));
      if (typeof data?.route === 'string') {
        const confidence = Number(data.confidence);
        return {
          route: data.route.trim(),
          reason: String(data.reason ?? '').slice(0, 300),
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
        };
      }
    } catch {
      // Try an earlier brace.
    }
  }
  return null;
}

/**
 * The pure decision: which candidate to use, given the routing answer and the policy.
 * @param {object} input - decision inputs.
 * @param {Array<{id: string}>} input.candidates - usable candidates (down routes already removed when respecting health).
 * @param {string | undefined} input.currentId - the candidate currently in use, if any.
 * @param {number} input.turnsSinceSwitch - turns since the router last changed the route.
 * @param {number} input.stickyTurns - turns to stay put after a switch.
 * @param {{route: string, reason: string, confidence: number} | null} input.answer - routing answer, or null.
 * @param {number} input.minConfidence - below this the answer is ignored.
 * @param {string} input.defaultId - candidate for a failed or doubtful decision ('' = keep current).
 * @returns {{id: string | undefined, why: string}} chosen candidate id and the reason.
 */
export function decide({ candidates, currentId, turnsSinceSwitch, stickyTurns, answer, minConfidence, defaultId }) {
  const ids = new Set(candidates.map((candidate) => candidate.id));
  const fallback = () => {
    if (defaultId && ids.has(defaultId)) return defaultId;
    return currentId && ids.has(currentId) ? currentId : candidates[0]?.id;
  };
  if (candidates.length === 0) return { id: undefined, why: 'no usable candidate' };
  if (currentId && ids.has(currentId) && turnsSinceSwitch < stickyTurns) return { id: currentId, why: 'sticky' };
  if (!answer) return { id: fallback(), why: 'no usable routing answer' };
  if (!ids.has(answer.route)) return { id: fallback(), why: `unknown or unusable route "${answer.route}"` };
  if (answer.confidence < minConfidence) return { id: fallback(), why: `confidence ${answer.confidence} below ${minConfidence}` };
  return { id: answer.route, why: answer.reason || 'routing model' };
}

export function apply(ctx, config) {
  if (plain(config.enabled) === false) return;
  const candidates = validateCandidates(plain(config.candidates) ?? []);
  if (candidates.length === 0) return;
  const routing = plain(config.routingModel) ?? {};
  if (!routing.provider || !routing.model) {
    throw new Error('model-router: `routingModel` needs a provider and a model when candidates are configured');
  }
  const policy = plain(config.policy) ?? {};
  const promptConfig = plain(config.prompt) ?? {};

  /** Per-session state: { recent: string[], appliedId, switchedAtTurn, turns, off, history: [] }. */
  const sessions = new Map();
  const listeners = new Set();

  /**
   * @param {string} sessionId - Agent id.
   * @returns {object} mutable state.
   */
  function stateOf(sessionId) {
    let state = sessions.get(sessionId);
    if (!state) {
      state = { recent: [], appliedId: undefined, appliedKey: undefined, lastSwitchTurn: -Infinity, turns: 0, off: false, history: [] };
      sessions.set(sessionId, state);
    }
    return state;
  }

  /**
   * Resolve a candidate to a concrete route, using Tier for tier candidates.
   * @param {object} candidate - configured candidate.
   * @returns {{id: string, provider: string, model: string, tierId?: string, effort?: string, strengths: string} | null} route, or null when unresolvable.
   */
  function resolve(candidate) {
    if (candidate.tier) {
      const tier = ctx.get('modelTiers')?.listTiers?.().find((item) => item.id === candidate.tier);
      return tier ? { id: candidate.id, provider: tier.provider, model: tier.model, tierId: tier.id, strengths: candidate.strengths ?? '' } : null;
    }
    return {
      id: candidate.id,
      provider: candidate.provider,
      model: candidate.model,
      ...(candidate.reasoningEffort ? { effort: candidate.reasoningEffort } : {}),
      strengths: candidate.strengths ?? '',
    };
  }

  /**
   * Candidates that can be used now: resolvable, and not on a route known to be down.
   * @returns {Array<object>} resolved usable candidates.
   */
  function usable() {
    const health = policy.respectHealth === false ? undefined : ctx.get('routeHealth');
    return candidates
      .map(resolve)
      .filter(Boolean)
      .filter((route) => health?.state?.(route.provider)?.state !== 'down');
  }

  /**
   * Ask the routing model; returns null on any failure or timeout.
   * @param {object[]} options - usable candidates.
   * @param {string[]} recent - earlier requests, oldest first.
   * @param {string} current - the current request.
   * @param {AbortSignal} signal - cancellation.
   * @returns {Promise<{route: string, reason: string, confidence: number} | null>} the answer.
   */
  async function askRoutingModel(options, recent, current, signal) {
    const llm = ctx.get('llm');
    if (!llm?.stream) return null;
    const cut = (text) => (text.length > 1500 ? `${text.slice(0, 1500)} …` : text);
    const prompt = [
      promptConfig.systemText ? String(promptConfig.systemText).trim() : '',
      'ROUTE_DECISION',
      "Choose which model should handle the user's next request. Candidates:",
      ...options.map((option) => `- ${option.id}${option.strengths ? `: ${option.strengths}` : ''}`),
      recent.length ? `Earlier requests, oldest first:\n${recent.map((text, index) => `${index + 1}. ${cut(text)}`).join('\n')}` : '',
      `Current request:\n${cut(current)}`,
      'Answer with ONLY JSON: {"route": "<candidate id>", "reason": "<one short sentence>", "confidence": <number 0 to 1>}',
    ]
      .filter(Boolean)
      .join('\n\n');
    const timeout = AbortSignal.timeout(Number(routing.timeoutMs) || 4000);
    const combined = AbortSignal.any([signal, timeout]);
    let text = '';
    try {
      for await (const chunk of llm.stream({
        provider: routing.provider,
        model: routing.model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        maxTokens: Number(routing.maxTokens) || 200,
        temperature: 0,
        signal: combined,
      })) {
        if (chunk.type === 'text-delta') text += chunk.text;
      }
    } catch (error) {
      ctx.logger.warn(`model-router: routing call failed: ${error?.message ?? error}`);
      return null;
    }
    return parseRoute(text);
  }

  /**
   * Record a decision for `/router` and the service.
   * @param {object} state - session state.
   * @param {object} entry - decision entry.
   */
  function remember(state, entry) {
    state.history.push(entry);
    if (state.history.length > 20) state.history.shift();
    for (const handler of [...listeners]) {
      try {
        handler(entry);
      } catch (error) {
        ctx.logger.warn(`model-router: listener failed: ${error?.message ?? error}`);
      }
    }
  }

  ctx.on('agent/pre-step', async (payload, next) => {
    const decisionOfLoop = await next();
    if (payload.step !== 1) return decisionOfLoop;
    try {
      await routeTurn(payload);
    } catch (error) {
      ctx.logger.warn(`model-router: routing skipped: ${error?.message ?? error}`);
    }
    return decisionOfLoop;
  });

  /**
   * Route one turn from its first step.
   * @param {object} payload - agent/pre-step payload.
   */
  async function routeTurn(payload) {
    const agent = payload.agent;
    const state = stateOf(agent.id);
    const current = textOf(payload.messages);
    if (!current) return; // a step with no user text (for example a resumed turn) is not routed
    state.turns += 1;
    const recentBefore = state.recent.slice(-(Number(promptConfig.includeLastN) || 0));
    state.recent.push(current);
    if (state.recent.length > 12) state.recent.shift();
    if (state.off) return;

    const selection = payload.modelSelection;
    const options = usable();
    const selectedKey = `${selection.provider}/${selection.model}`;
    const inUse = options.find((route) => `${route.provider}/${route.model}` === selectedKey);

    // The route the router chose went down and route health moved the session: not a manual choice.
    const health = policy.respectHealth === false ? undefined : ctx.get('routeHealth');
    if (state.appliedKey !== undefined && state.appliedKey !== selectedKey && health?.state?.(state.appliedProvider)?.state === 'down') {
      state.appliedKey = inUse ? selectedKey : undefined;
      state.appliedId = inUse?.id;
      remember(state, { turn: payload.turn, kind: 'resync', why: `route ${state.appliedProvider} is down; following the fallback to ${selectedKey}` });
    }
    // A route the router did not choose and that is not a candidate: the user (or another plugin) is in charge.
    if (!inUse && state.appliedKey !== undefined) {
      state.off = true;
      remember(state, { turn: payload.turn, kind: 'stand-down', why: `route ${selectedKey} is not a candidate; manual choice respected` });
      return;
    }
    if (inUse && state.appliedKey !== undefined && state.appliedKey !== selectedKey) {
      state.off = true;
      remember(state, { turn: payload.turn, kind: 'stand-down', why: `route changed to ${selectedKey} by someone else; manual choice respected` });
      return;
    }

    const turnsSinceSwitch = state.turns - state.lastSwitchTurn;
    const sticky = inUse && turnsSinceSwitch < (Number(policy.stickyTurns) || 0);
    const answer = sticky ? null : await askRoutingModel(options, recentBefore, current, payload.signal);
    const chosen = decide({
      candidates: options,
      currentId: inUse?.id,
      turnsSinceSwitch,
      stickyTurns: Number(policy.stickyTurns) || 0,
      answer,
      minConfidence: Number(policy.minConfidence) || 0,
      defaultId: String(policy.defaultCandidate ?? ''),
    });
    const target = options.find((route) => route.id === chosen.id);
    const entry = {
      turn: payload.turn,
      kind: 'decision',
      chosen: chosen.id,
      why: chosen.why,
      from: inUse?.id ?? selectedKey,
      switched: false,
      answer: answer ? { route: answer.route, confidence: answer.confidence } : null,
    };
    if (target && `${target.provider}/${target.model}` !== selectedKey) {
      if (target.tierId && ctx.get('modelTiers')?.setSessionTier) await ctx.get('modelTiers').setSessionTier(agent.id, target.tierId);
      else agent.model.select({ provider: target.provider, model: target.model, ...(target.effort ? { reasoningEffort: target.effort } : {}) });
      entry.switched = true;
      state.lastSwitchTurn = state.turns;
    }
    if (target) {
      state.appliedId = target.id;
      state.appliedKey = `${target.provider}/${target.model}`;
      state.appliedProvider = target.provider;
    }
    remember(state, entry);
  }

  ctx.on('agent/disposed', ({ agent }) => sessions.delete(agent.id));

  /** Router API for other plugins. */
  const modelRouter = Object.freeze({
    apiVersion: 1,
    /**
     * @param {string} sessionId - Agent id.
     * @returns {{off: boolean, applied: string | undefined, decisions: object[]}} state for the Session.
     */
    status(sessionId) {
      const state = stateOf(sessionId);
      return { off: state.off, applied: state.appliedId, decisions: state.history.slice() };
    },
    /**
     * @param {string} sessionId - Agent id.
     * @param {boolean} on - route this Session (true) or leave it alone (false).
     */
    setEnabled(sessionId, on) {
      const state = stateOf(sessionId);
      state.off = !on;
      if (on) state.appliedKey = undefined;
    },
    /**
     * @param {(entry: object) => void} handler - called after every decision.
     * @returns {() => void} disposer.
     */
    onDecision(handler) {
      listeners.add(handler);
      return () => listeners.delete(handler);
    },
  });
  ctx.effect(() => ctx.provide('modelRouter', modelRouter), 'model-router service');

  const commandName = plain(config.commandName);
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Show the router state for this session; `off` leaves the model alone, `on` resumes routing',
            input: { hint: '[on|off]' },
            handler: async ({ agent, rawInput }) => {
              const arg = String(rawInput ?? '').trim().toLowerCase();
              if (arg === 'off' || arg === 'on') {
                modelRouter.setEnabled(agent.id, arg === 'on');
                return { kind: 'success', text: `Routing ${arg === 'on' ? 'on' : 'off'} for this session.` };
              }
              if (arg) return { kind: 'error', text: 'Usage: /router [on|off]' };
              const status = modelRouter.status(agent.id);
              const last = status.decisions.slice(-5).map((entry) =>
                entry.kind === 'stand-down'
                  ? `turn ${entry.turn}: stand-down (${entry.why})`
                  : `turn ${entry.turn}: ${entry.from} -> ${entry.chosen}${entry.switched ? ' (switched)' : ''}: ${entry.why}`,
              );
              return {
                kind: 'success',
                text: `Router ${status.off ? 'off' : 'on'}; in use: ${status.applied ?? 'none yet'}.${last.length ? `\n${last.join('\n')}` : ''}`,
              };
            },
          }),
        'model-router command',
      );
    });
  }
}
