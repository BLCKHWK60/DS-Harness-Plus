/**
 * Host half of Agent swarm.
 *
 * One tool, `run_swarm`, runs a named swarm: member child agents bound to the
 * Tier plugin's role routes (or to explicit routes), in one of three shapes:
 *  - fanout: all members work on the task at once;
 *  - pipeline: members run one after another, each seeing earlier outputs;
 *  - debate: several rounds in which every member sees the others' last answers.
 *
 * Caps: at most `maxActive` children at once (never more than the tier's
 * sub-agent cap or 8), a token and a dollar budget that stops the swarm when
 * spent, and one level of depth (a swarm member cannot start a swarm). A member
 * on a route that route health reports down is re-bound to the tier's fallback
 * route, skipped, or refuses the swarm, as configured. The tool returns every
 * member's output under its own heading, so the parent's answer can credit each.
 *
 * Nothing is configured by default: with no swarm the plugin does nothing except answer the
 * read-only state route. That route (GET /dsh-agent-swarm/state) feeds the Settings > Swarm page: the
 * configured swarms and the recent runs (member states, tokens, budget), kept in memory. It never
 * carries a task, a prompt or a member's answer.
 */
import z from '@deepseek-ai/schemastery';

/**
 * Start a helper agent. App 0.2.2-rc.2 takes the task's fields (prompt, parent, agentOptions) at
 * the top level of the spec; rc.1 took them under `request`. Both are given, so either works.
 * @param {object} subagents - the app's sub-agent service.
 * @param {object} spec - provider, label, delivery, signal, and the task under `request`.
 * @returns {Promise<object>} the activation receipt.
 */
const startChild = (subagents, spec) => subagents.startActivation({ ...spec.request, ...spec });


/**
 * Wait for a started child agent, stopping it when the signal aborts.
 * The host's own signal only covers start-up, so a running child is stopped through its receipt.
 * @param {{result: Promise<object>, dispose?: () => Promise<void>}} started - the activation receipt.
 * @param {AbortSignal | undefined} signal - the caller's signal.
 * @returns {Promise<object>} the child's result.
 */
async function awaitChild(started, signal) {
  if (!signal) return started.result;
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => {
      Promise.resolve(started.dispose?.()).catch(() => {});
      reject(signal.reason instanceof Error ? signal.reason : new Error('Cancelled.'));
    };
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
  aborted.catch(() => {});
  try {
    return await Promise.race([started.result, aborted]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export const name = 'agent-swarm';
export const inject = ['tools'];

const ROLES = ['plan', 'implement', 'review', 'fast'];
/** Read-only route behind the connection fence, read by the Settings page (client.js). */
export const STATE_PATH = '/dsh-agent-swarm/state';
/** How many finished runs are kept in memory for the page (lost when the host restarts). */
const MAX_HISTORY = 20;

const memberSchema = z.object({
  id: z.string().required(),
  role: z.string(),
  tier: z.string(),
  provider: z.string(),
  model: z.string(),
  instructions: z.string().default(''),
});

const swarmSchema = z.object({
  description: z.string().default(''),
  strategy: z.union([z.const('fanout'), z.const('pipeline'), z.const('debate')]).default('fanout'),
  rounds: z.number().min(2).max(5).default(2),
  maxActive: z.number().min(1).max(8).default(3),
  maxMinutes: z.number().min(1).max(240).default(20),
  budget: z.object({ tokens: z.number().min(0).default(0), usd: z.number().min(0).default(0) }).default({ tokens: 0, usd: 0 }),
  members: z.array(memberSchema).default([]),
});

export const Config = z.object({
  enabled: z.boolean().default(true),
  toolName: z.string().default('run_swarm'),
  swarms: z.dict(swarmSchema).default({}),
  pricing: z.dict(z.object({ inputPerMTok: z.number().min(0).default(0), outputPerMTok: z.number().min(0).default(0) })).default({}),
  defaultSwarmByMode: z.dict(z.string()).default({}),
  onRouteDown: z.union([z.const('rebind'), z.const('skip'), z.const('refuse')]).default('rebind'),
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
 * Check the swarm definitions; the plugin fails at load when they are wrong.
 * @param {object} cfg - plain Config.
 */
export function validateSwarms(cfg) {
  for (const [swarmName, swarm] of Object.entries(cfg.swarms ?? {})) {
    if (!/^[A-Za-z0-9_-]+$/.test(swarmName)) throw new Error(`agent-swarm: invalid swarm name "${swarmName}"`);
    const members = swarm.members ?? [];
    const minimum = swarm.strategy === 'debate' ? 2 : 1;
    if (members.length < minimum) throw new Error(`agent-swarm: swarm "${swarmName}" (${swarm.strategy}) needs at least ${minimum} member(s)`);
    if (members.length > 12) throw new Error(`agent-swarm: swarm "${swarmName}" has more than 12 members`);
    const seen = new Set();
    for (const member of members) {
      if (!/^[A-Za-z0-9_-]+$/.test(member.id)) throw new Error(`agent-swarm: invalid member id "${member.id}" in "${swarmName}"`);
      if (seen.has(member.id)) throw new Error(`agent-swarm: duplicate member id "${member.id}" in "${swarmName}"`);
      seen.add(member.id);
      const explicit = member.provider && member.model;
      if (!explicit && !(member.role && ROLES.includes(member.role))) {
        throw new Error(`agent-swarm: member "${member.id}" of "${swarmName}" needs a role (${ROLES.join('|')}) or a provider and model`);
      }
    }
  }
  for (const [mode, swarmName] of Object.entries(cfg.defaultSwarmByMode ?? {})) {
    if (!(cfg.swarms ?? {})[swarmName]) throw new Error(`agent-swarm: mode "${mode}" names unknown swarm "${swarmName}"`);
  }
}

/**
 * Cost of usage in USD from user-supplied prices.
 * @param {object} pricing - provider/model -> prices.
 * @param {string} key - provider/model.
 * @param {{input: number, output: number}} usage - tokens.
 * @returns {number} cost.
 */
export function costOf(pricing, key, usage) {
  const price = pricing?.[key];
  return price ? ((usage.input ?? 0) * (price.inputPerMTok ?? 0) + (usage.output ?? 0) * (price.outputPerMTok ?? 0)) / 1e6 : 0;
}

export function apply(ctx, config) {
  if (plain(config.enabled) === false) return;
  const cfg0 = plain(config);
  const hasSwarms = Object.keys(cfg0.swarms ?? {}).length > 0;
  if (hasSwarms) validateSwarms(cfg0);
  const cfg = () => plain(config);

  /** Child session id -> { input, output, keys: {provider/model: {input, output}} }, recorded live. */
  const usageBySession = new Map();
  /** Child session ids this plugin started: they may not start a swarm. */
  const childIds = new Set();
  /** Run id -> active run, for the budget watcher. */
  const runs = new Map();
  /** Newest first: records of recent runs for the Settings page. Memory only; no task text, no answers. */
  const history = [];

  /**
   * Tokens and dollars one member has used, from its child sessions' own usage.
   * @param {{childIds: Set<string>}} member - member record.
   * @returns {{tokens: number, usd: number}} spend.
   */
  function memberSpend(member) {
    const pricing = cfg().pricing;
    let tokens = 0;
    let usd = 0;
    for (const id of member.childIds) {
      const entry = usageBySession.get(id);
      if (!entry) continue;
      tokens += entry.input + entry.output;
      for (const [key, cell] of Object.entries(entry.keys)) usd += costOf(pricing, key, cell);
    }
    return { tokens, usd };
  }

  /**
   * The page's view of one run record: names, states and numbers only.
   * @param {object} rec - run record.
   * @returns {object} JSON-safe view.
   */
  function runView(rec) {
    let tokens = 0;
    let usd = 0;
    const members = rec.members.map((member) => {
      const spend = memberSpend(member);
      tokens += spend.tokens;
      usd += spend.usd;
      return {
        id: member.id,
        role: member.role ?? null,
        route: member.route ? `${member.route.provider}/${member.route.model}` : null,
        note: member.note,
        state: member.state,
        round: member.round,
        startedAt: member.startedAt,
        endedAt: member.endedAt,
        tokens: spend.tokens,
        usd: Math.round(spend.usd * 1e6) / 1e6,
        error: member.error,
      };
    });
    return {
      id: rec.id,
      swarm: rec.swarm,
      strategy: rec.strategy,
      rounds: rec.rounds,
      round: rec.round,
      status: rec.status,
      stopped: rec.stopped,
      startedAt: rec.startedAt,
      endedAt: rec.endedAt,
      maxActive: rec.maxActive,
      maxObservedActive: rec.maxObserved,
      budget: rec.budget,
      tokens,
      usd: Math.round(usd * 1e6) / 1e6,
      members,
    };
  }

  /** The configured swarms as the page shows them (no route resolution: that needs a live parent). */
  function swarmsView() {
    const c = cfg();
    return Object.entries(c.swarms ?? {}).map(([swarmName, swarm]) => ({
      name: swarmName,
      description: swarm.description ?? '',
      strategy: swarm.strategy,
      rounds: swarm.rounds,
      maxActive: swarm.maxActive,
      maxMinutes: swarm.maxMinutes,
      budget: swarm.budget,
      members: swarm.members.map((member) => ({
        id: member.id,
        role: member.role || null,
        tier: member.tier || null,
        route: member.provider && member.model ? `${member.provider}/${member.model}` : null,
        instructions: String(member.instructions ?? '').slice(0, 300),
      })),
    }));
  }

  // Read-only state for the browser page (client.js): behind the connection fence (Host/Origin
  // check and the login cookie), GET only. Running a swarm stays with the model's run_swarm tool.
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: STATE_PATH,
          handler: (req, res) => {
            const rejection = inner.connection.requestRejection(req);
            if (rejection !== undefined) {
              res.statusCode = rejection;
              res.end();
              return;
            }
            if (req.method !== 'GET') {
              res.statusCode = 405;
              res.setHeader('allow', 'GET');
              res.end();
              return;
            }
            let status = 200;
            let body;
            try {
              const c = cfg();
              body = {
                at: Date.now(),
                toolName: c.toolName,
                onRouteDown: c.onRouteDown,
                pricing: Object.keys(c.pricing ?? {}).length > 0,
                swarms: swarmsView(),
                runs: history.map(runView),
              };
            } catch {
              status = 500;
              body = { error: 'failed' };
            }
            res.statusCode = status;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.end(JSON.stringify(body));
          },
        }),
      'agent-swarm: GET state route',
    );
  });

  if (!hasSwarms) return;

  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'assistant/message') return;
      const usage = event.data?.usage;
      const source = event.data?.message?.source;
      const id = session?.id;
      if (!usage || !id) return;
      if (usageBySession.size >= 500 && !usageBySession.has(id)) usageBySession.delete(usageBySession.keys().next().value);
      const entry = usageBySession.get(id) ?? { input: 0, output: 0, keys: {} };
      const input = (usage.inputTokens ?? 0) + (usage.cacheReadTokens ?? 0) + (usage.cacheWriteTokens ?? 0);
      const output = usage.outputTokens ?? 0;
      entry.input += input;
      entry.output += output;
      const key = `${source?.provider ?? '?'}/${source?.model ?? '?'}`;
      const cell = (entry.keys[key] ??= { input: 0, output: 0 });
      cell.input += input;
      cell.output += output;
      usageBySession.set(id, entry);
      for (const run of runs.values()) if (run.children.has(id)) run.check();
    } catch {
      // Accounting must never disturb a Session.
    }
  });

  /**
   * Resolve a member's route, applying the route-down policy.
   * @param {object} member - member definition.
   * @param {object} parent - parent Agent.
   * @returns {{route: {provider: string, model: string} | null, note: string}} the route, or null to skip, with a note.
   */
  function resolveRoute(member, parent) {
    const tiers = ctx.get('modelTiers');
    const health = ctx.get('routeHealth');
    const tier = tiers?.resolveTier?.(parent.id);
    const tierId = member.tier ?? tier?.id;
    let route = null;
    if (member.provider && member.model) route = { provider: member.provider, model: member.model };
    else if (member.role && tierId) route = tiers?.roleRoute?.(tierId, member.role) ?? null;
    if (!route) {
      const current = parent.model?.current?.();
      route = current ? { provider: current.provider, model: current.model } : null;
    }
    if (!route) return { route: null, note: 'no route could be resolved' };
    const down = (candidate) => health?.state?.(candidate.provider)?.state === 'down';
    if (!down(route)) return { route, note: '' };
    const policy = cfg().onRouteDown;
    if (policy === 'rebind' && tierId && tiers?.fallbackChain) {
      const alternative = tiers.fallbackChain(tierId).find((candidate) => !down(candidate));
      if (alternative) return { route: { provider: alternative.provider, model: alternative.model }, note: `re-bound from ${route.provider}/${route.model} (route down)` };
    }
    return { route: null, note: `route ${route.provider}/${route.model} is down (${policy === 'rebind' ? 'no usable fallback' : policy})`, refuse: policy === 'refuse' };
  }

  /**
   * Run one child agent.
   * @param {object} spec - { parent, route, prompt, label, signal, run, onChild }.
   * @returns {Promise<{childId: string, text: string, stopReason: string}>} the child's answer.
   */
  async function runChild({ parent, route, prompt, label, signal, run, onChild }) {
    const subagents = ctx.get('subagents');
    if (!subagents) throw new Error('The sub-agent service is unavailable.');
    const started = await startChild(subagents, {
      provider: 'spawn',
      label,
      request: { prompt: [{ type: 'text', text: prompt }], parent, signal, agentOptions: { provider: route.provider, model: route.model } },
      delivery: 'parent',
      signal,
    });
    childIds.add(started.childId);
    run.children.add(started.childId);
    onChild?.(started.childId);
    run.check();
    const result = await awaitChild(started, signal);
    const text = (result.output ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return { childId: started.childId, text, stopReason: result.stopReason };
  }

  const swarmTool = {
    name: plain(config.toolName),
    description:
      'Run a named swarm of child agents on a task and return every member\'s output under its own heading. ' +
      `Available swarms: ${Object.entries(cfg0.swarms).map(([n, s]) => `${n} (${s.strategy}, ${s.members.length} members${s.description ? `: ${s.description}` : ''})`).join('; ')}. ` +
      'Use it for work that benefits from several independent viewpoints; credit each member in your final answer.',
    parameters: {
      type: 'object',
      properties: {
        swarm: { type: 'string', description: 'Swarm name.' },
        task: { type: 'string', minLength: 3, description: 'A self-contained task for the swarm, with paths and the result you want.' },
      },
      required: ['swarm', 'task'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' }, stats: { type: 'object' } }, required: ['text'] },
      render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
    },
    timeoutMs: 4 * 60 * 60 * 1000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const parent = exec.agent;
      if (!parent?.id) throw new Error('run_swarm needs a live parent Session.');
      if (childIds.has(parent.id)) throw new Error('A swarm member cannot start a swarm.');
      const c = cfg();
      const swarm = c.swarms[args.swarm];
      if (!swarm) throw new Error(`Unknown swarm "${args.swarm}". Swarms: ${Object.keys(c.swarms).join(', ')}.`);
      const task = String(args.task).trim();
      const startedAt = Date.now();
      const deadline = startedAt + swarm.maxMinutes * 60000;

      const tierCap = ctx.get('modelTiers')?.resolveTier?.(parent.id)?.maxSubagents ?? 8;
      const maxActive = Math.max(1, Math.min(swarm.maxActive, tierCap, 8));

      // Resolve every member's route before starting anything.
      const members = [];
      const skipped = [];
      for (const member of swarm.members) {
        const resolved = resolveRoute(member, parent);
        if (resolved.refuse) throw new Error(`Swarm "${args.swarm}" refused: member ${member.id}: ${resolved.note}.`);
        if (!resolved.route) skipped.push({ member, note: resolved.note });
        else members.push({ member, route: resolved.route, note: resolved.note });
      }
      if (members.length === 0) throw new Error(`Swarm "${args.swarm}" has no member that can run: ${skipped.map((s) => `${s.member.id}: ${s.note}`).join('; ')}.`);

      const abort = new AbortController();
      const signal = AbortSignal.any([exec.signal, abort.signal, AbortSignal.timeout(Math.max(1, deadline - Date.now()))]);
      const run = {
        children: new Set(),
        stopped: null,
        check() {
          if (run.stopped) return;
          const spent = totals();
          if (swarm.budget.tokens > 0 && spent.tokens >= swarm.budget.tokens) run.stopped = `token budget (${swarm.budget.tokens}) reached`;
          else if (swarm.budget.usd > 0 && spent.usd >= swarm.budget.usd) run.stopped = `dollar budget (${swarm.budget.usd}) reached`;
          if (run.stopped) {
            rec.stopped = run.stopped;
            abort.abort();
          }
        },
      };
      const runId = `${startedAt}-${Math.random().toString(36).slice(2, 8)}`;
      runs.set(runId, run);

      /** Record for the Settings page: states only, no task text and no answers. */
      const rec = {
        id: runId,
        swarm: args.swarm,
        strategy: swarm.strategy,
        rounds: swarm.strategy === 'debate' ? swarm.rounds : 1,
        round: 1,
        status: 'running',
        stopped: null,
        startedAt,
        endedAt: null,
        maxActive,
        maxObserved: 0,
        budget: { tokens: swarm.budget.tokens, usd: swarm.budget.usd },
        members: [
          ...members.map((entry) => ({ id: entry.member.id, role: entry.member.role, route: entry.route, note: entry.note, state: 'waiting', round: 0, startedAt: null, endedAt: null, error: '', childIds: new Set() })),
          ...skipped.map((item) => ({ id: item.member.id, role: item.member.role, route: null, note: item.note, state: 'skipped', round: 0, startedAt: null, endedAt: null, error: '', childIds: new Set() })),
        ],
      };
      history.unshift(rec);
      if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
      const memberRec = (id) => rec.members.find((m) => m.id === id);

      /** Tokens and dollars spent by this run's children so far. */
      function totals() {
        let tokens = 0;
        let usd = 0;
        for (const id of run.children) {
          const entry = usageBySession.get(id);
          if (!entry) continue;
          tokens += entry.input + entry.output;
          for (const [key, cell] of Object.entries(entry.keys)) usd += costOf(c.pricing, key, cell);
        }
        return { tokens, usd: Math.round(usd * 1e6) / 1e6 };
      }

      let active = 0;
      let maxObserved = 0;
      const results = new Map();
      /**
       * Run one member with the concurrency cap enforced by the caller's queue.
       * @param {object} entry - { member, route, note }.
       * @param {string} body - the member's prompt body.
       * @param {string} label - child card label.
       * @returns {Promise<void>}
       */
      async function runMember(entry, body, label, round = 1) {
        if (run.stopped || signal.aborted) return;
        active += 1;
        maxObserved = Math.max(maxObserved, active);
        rec.maxObserved = maxObserved;
        const mrec = memberRec(entry.member.id);
        mrec.state = 'running';
        mrec.round = round;
        mrec.startedAt ??= Date.now();
        mrec.endedAt = null;
        mrec.error = '';
        try {
          const prompt =
            `SWARM_MEMBER ${entry.member.id}\n${entry.member.instructions ? `Your focus: ${entry.member.instructions}\n\n` : ''}${body}`;
          const answer = await runChild({ parent, route: entry.route, prompt, label, signal, run, onChild: (id) => mrec.childIds.add(id) });
          results.set(entry.member.id, { ...entry, text: answer.text, childId: answer.childId, stopReason: answer.stopReason });
          mrec.state = 'done';
        } catch (error) {
          results.set(entry.member.id, { ...entry, text: '', error: String(error?.message ?? error) });
          mrec.state = run.stopped || signal.aborted ? 'cancelled' : 'failed';
          mrec.error = String(error?.message ?? error).slice(0, 160);
        } finally {
          mrec.endedAt = Date.now();
          active -= 1;
        }
      }

      /**
       * Run a list of jobs with at most `maxActive` in flight.
       * @param {Array<() => Promise<void>>} jobs - jobs.
       * @returns {Promise<void>}
       */
      async function limited(jobs) {
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(maxActive, jobs.length) }, async () => {
            while (next < jobs.length) {
              const job = jobs[next++];
              await job();
            }
          }),
        );
      }

      const taskBody = (extra) => `Task: ${task}${extra ? `\n\n${extra}` : ''}\n\nAnswer concisely and concretely; another agent will combine the answers.`;
      const board = () =>
        [...results.values()]
          .filter((r) => r.text)
          .map((r) => `- ${r.member.id} (${r.member.role ?? 'explicit route'}): ${r.text.slice(0, 600)}`)
          .join('\n');
      let rounds = 1;
      try {
        if (swarm.strategy === 'fanout') {
          await limited(members.map((entry) => () => runMember(entry, taskBody(''), `Swarm: ${entry.member.id}`)));
        } else if (swarm.strategy === 'pipeline') {
          for (const entry of members) {
            if (run.stopped || signal.aborted) break;
            await runMember(entry, taskBody(board() ? `Earlier members' results:\n${board()}` : ''), `Swarm: ${entry.member.id}`);
          }
        } else {
          rounds = swarm.rounds;
          for (let round = 1; round <= rounds; round += 1) {
            if (run.stopped || signal.aborted) break;
            rec.round = round;
            const before = new Map(results);
            const others = (entry) =>
              [...before.values()].filter((r) => r.member.id !== entry.member.id && r.text).map((r) => `- ${r.member.id}: ${r.text.slice(0, 800)}`).join('\n');
            await limited(
              members.map((entry) => () =>
                runMember(entry, taskBody(round === 1 ? '' : `Round ${round}. The other members' last answers:\n${others(entry)}\nRevise your answer: keep what holds up, fix what they got right.`), `Swarm: ${entry.member.id} r${round}`, round),
              ),
            );
          }
        }
      } finally {
        runs.delete(runId);
        rec.endedAt = Date.now();
        rec.stopped = run.stopped;
        rec.status = run.stopped ? 'stopped' : signal.aborted ? 'cancelled' : 'done';
        for (const m of rec.members) if (m.state === 'waiting') m.state = 'cancelled';
      }

      const spent = totals();
      const sections = [];
      for (const entry of members) {
        const result = results.get(entry.member.id);
        const where = `${entry.route.provider}/${entry.route.model}${entry.note ? `; ${entry.note}` : ''}`;
        sections.push(
          `## ${entry.member.id} (${entry.member.role ?? 'explicit route'}, ${where})\n` +
            (result?.error ? `(failed: ${result.error})` : result?.text || '(no output; the swarm stopped before this member answered)'),
        );
      }
      for (const item of skipped) sections.push(`## ${item.member.id} (skipped)\n(${item.note})`);
      const notes = [];
      if (run.stopped) notes.push(`The swarm stopped early: ${run.stopped}.`);
      if (signal.aborted && !run.stopped) notes.push('The swarm was cancelled or ran out of time.');
      const text =
        `Swarm "${args.swarm}" (${swarm.strategy}${swarm.strategy === 'debate' ? `, ${rounds} rounds` : ''}): ${[...results.values()].filter((r) => r.text || r.error).length} of ${members.length} member(s) answered, at most ${maxObserved} at once (cap ${maxActive}). ` +
        `Spent ${spent.tokens} tokens${spent.usd ? `, about ${spent.usd} USD` : ''}.${notes.length ? `\n${notes.join('\n')}` : ''}\n\n${sections.join('\n\n')}`;
      return { text, stats: { members: members.length, skipped: skipped.length, maxActive, maxObservedActive: maxObserved, tokens: spent.tokens, usd: spent.usd, stopped: run.stopped } };
    },
  };
  ctx.effect(() => ctx.tools.register(swarmTool));

  // The tool starts child agents, so the tier's sub-agent access and cap apply to it.
  ctx.inject(['modelTiers'], (inner) => {
    inner.effect(() => inner.modelTiers.registerSubagentTool(swarmTool.name), 'agent-swarm tier gate');
  });

  // Tell the model which swarm suits the session's mode.
  const byMode = cfg0.defaultSwarmByMode ?? {};
  if (Object.keys(byMode).length > 0) {
    const owned = new Map();
    ctx.effect(() => () => {
      for (const dispose of owned.values()) {
        try {
          dispose?.();
        } catch {
          // The Agent context may already be unwinding.
        }
      }
      owned.clear();
    }, 'agent-swarm section ownership');
    ctx.on('agent/disposed', ({ agent }) => owned.delete(agent?.id));
    const install = (agent) => {
      const agentCtx = agent?.ctx;
      if (!agentCtx?.systemPrompt || owned.has(agent.id)) return;
      try {
      owned.set(agent.id, agentCtx.effect(
        () =>
          agentCtx.systemPrompt.section({
            name: 'agent-swarm:hint',
            order: 76,
            interpolate: false,
            text: () => {
              const swarmName = byMode[ctx.get('modes')?.get?.(agent.id)];
              return swarmName ? `For work that needs several independent viewpoints, the \`${swarmTool.name}\` tool can run the "${swarmName}" swarm.` : '';
            },
          }),
        'agent-swarm hint',
      ));
      } catch (error) {
        ctx.logger?.warn?.(`agent-swarm: hint not added: ${error?.message ?? error}`);
      }
    };
    ctx.on('agent/created', ({ agent }) => install(agent));
    for (const agent of ctx.get('agents')?.list() ?? []) install(agent);
  }
}
