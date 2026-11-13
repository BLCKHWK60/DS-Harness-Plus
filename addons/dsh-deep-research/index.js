/**
 * Host half of Deep research.
 *
 * Registers one tool, `deep_research`. A run is: a planner child splits the
 * question into sub-questions with search queries; searcher children research
 * them in parallel with the web tools and return findings with source URLs;
 * between rounds an analyst child reads the findings, names what is missing or
 * contradictory and writes sharper follow-up questions and queries for the next
 * round; the host merges and de-duplicates the sources; a writer child writes a
 * report that cites them by number; the host then checks every citation against
 * the numbered sources and against what each searcher actually fetched.
 *
 * How deep a run goes (rounds, helpers at once, sub-questions, time) comes from
 * the depth chosen with the slider beside the Deep research button (kept by the
 * Modes add-on): Quick, Standard or Thorough. See `lib/rounds.js`.
 *
 * Helpers at once are also held to the Tier plugin's sub-agent limit (Settings → Model Tiers).
 * Children run on the model of the conversation that started the research, or, when the
 * owner chose "role models" beside the Deep research button, on the Tier plugin's role
 * routes (planner, analyst and writer: `plan`, searchers: `fast` by default).
 * Writing files is left to the model's own tools, so the sandbox applies.
 */
import z from '@deepseek-ai/schemastery';
import { insideProgram, researchMinutes } from './lib/budget.js';
import { analysisOf, analyzePrompt, capped, depthOf, planPrompt, roundLeft, searchAnswer, searchPrompt, tasksOf, writePrompt } from './lib/rounds.js';

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

export const name = 'deep-research';
export const inject = ['tools'];

export const Config = z.object({
  enabled: z.boolean().default(true),
  toolName: z.string().default('deep_research'),
  roles: z
    .object({
      planner: z.union([z.const('plan'), z.const('implement'), z.const('review'), z.const('fast')]).default('plan'),
      searcher: z.union([z.const('plan'), z.const('implement'), z.const('review'), z.const('fast')]).default('fast'),
      writer: z.union([z.const('plan'), z.const('implement'), z.const('review'), z.const('fast')]).default('plan'),
    })
    .default({ planner: 'plan', searcher: 'fast', writer: 'plan' }),
  /**
   * Which model the helpers run on when the Modes add-on is not there to say: `same` (the model of
   * the conversation that started the research) or `roles` (the Tier add-on's role models).
   */
  helperModel: z.union([z.const('same'), z.const('roles')]).default('same'),
  /** Used when the Modes add-on is not there to say which depth the slider is on. */
  depth: z.union([z.const('quick'), z.const('standard'), z.const('thorough')]).default('standard'),
  /** Upper bounds. The chosen depth decides the actual numbers and is held to these. */
  maxSubquestions: z.number().min(1).max(12).default(8),
  maxParallel: z.number().min(1).max(8).default(8),
  maxSources: z.number().min(1).max(200).default(120),
  maxMinutes: z.number().min(1).max(240).default(60),
  searchToolNames: z.array(z.string()).default(['web_search']),
  fetchToolNames: z.array(z.string()).default(['web_fetch']),
  requireFetched: z.boolean().default(false),
  wide: z.object({ maxRows: z.number().min(1).max(5000).default(500) }).default({ maxRows: 500 }),
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
 * Normalize a URL for comparison: lower-case host, no fragment, no trailing slash.
 * @param {string} raw - URL text.
 * @returns {string | null} normalized URL, or null when it is not an http(s) URL.
 */
export function normalizeUrl(raw) {
  try {
    const url = new URL(String(raw).trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    url.hash = '';
    url.hostname = url.hostname.toLowerCase();
    let text = url.toString();
    if (text.endsWith('/') && url.pathname === '/') text = text.slice(0, -1);
    return text;
  } catch {
    return null;
  }
}

/**
 * Pull the first JSON object out of a model answer, which may wrap it in prose or a code fence.
 * @param {string} text - model output.
 * @returns {any | null} parsed object, or null.
 */
export function extractJson(text) {
  const source = String(text ?? '');
  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fenced ? [fenced[1], source] : [source];
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    if (start < 0) continue;
    for (let end = candidate.lastIndexOf('}'); end > start; end = candidate.lastIndexOf('}', end - 1)) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // Try a shorter slice.
      }
    }
  }
  return null;
}

/**
 * Run `fn` over `items` with at most `limit` in flight, keeping order.
 * @param {any[]} items - inputs.
 * @param {number} limit - concurrency.
 * @param {(item: any, index: number) => Promise<any>} fn - worker.
 * @returns {Promise<any[]>} results in input order.
 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Quote one CSV field (RFC 4180).
 * @param {unknown} value - field value.
 * @returns {string} CSV text.
 */
function csvField(value) {
  let text = value === null || value === undefined ? '' : String(value);
  // A cell starting with = + - @ (or a tab / CR) runs as a formula in spreadsheets; quote it as text.
  if (/^[=+\-@\t\r]/.test(text) && !/^-?\d+(\.\d+)?$/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function apply(ctx, config) {
  if (plain(config.enabled) === false) return;

  /** Agents this plugin started, which may not start research themselves. */
  const childIds = new Set();

  /** @returns {'same' | 'roles'} which model the helpers run on: the choice beside the Deep research button, else the setting. */
  function helperModel(parent) {
    let chosen;
    try {
      const modes = ctx.get('modes');
      // The conversation's own choice when Modes knows one, else the default for all.
      chosen = modes?.helperModels ? modes.helperModels(parent?.id) : modes?.researchModel?.();
    } catch {
      chosen = undefined;
    }
    return (chosen ?? plain(config.helperModel)) === 'roles' ? 'roles' : 'same';
  }

  /**
   * Route for a child. `same`: the model the parent conversation is on. `roles`: Tier's role route
   * for the parent's tier, and the parent's own model when that role has none.
   */
  function routeFor(parent, role) {
    const tiers = helperModel(parent) === 'roles' ? ctx.get('modelTiers') : undefined;
    const tier = tiers?.resolveTier?.(parent.id);
    const route = tier ? tiers.roleRoute(tier.id, role) : null;
    if (route) return { provider: route.provider, model: route.model };
    const current = parent.model?.current?.();
    return current ? { provider: current.provider, model: current.model } : undefined;
  }

  /**
   * Run one child agent to completion.
   * @param {{role: string, prompt: string, label: string, parent: object, signal: AbortSignal}} spec - child spec.
   * @returns {Promise<{childId: string, text: string, stopReason: string}>} the child's answer.
   */
  async function runChild({ role, prompt, label, parent, signal }) {
    const subagents = ctx.get('subagents');
    if (!subagents) throw new Error('The sub-agent service is unavailable.');
    const route = routeFor(parent, role);
    const started = await startChild(subagents, {
      provider: 'spawn',
      label,
      request: {
        // The app adds a note of its own right after the text: end ours with a blank line.
        prompt: [{ type: 'text', text: `${prompt}\n\n` }],
        parent,
        signal,
        ...(route ? { agentOptions: { provider: route.provider, model: route.model } } : {}),
      },
      delivery: 'parent',
      signal,
    });
    childIds.add(started.childId);
    const result = await awaitChild(started, signal);
    const text = (result.output ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return { childId: started.childId, text, stopReason: result.stopReason };
  }

  /** Session id -> what its fetch and search tools touched. A child is disposed when it finishes, so this is recorded live. */
  const logs = new Map();
  /** Session id -> call id -> tool name, for pairing results with calls. */
  const calls = new Map();

  /**
   * The record of one Session, created on first use and bounded in number.
   * @param {string} sessionId - Session id.
   * @returns {{fetched: Set<string>, seen: Set<string>}} record.
   */
  function logOf(sessionId) {
    let entry = logs.get(sessionId);
    if (!entry) {
      if (logs.size >= 500) {
        const oldest = logs.keys().next().value;
        logs.delete(oldest);
        calls.delete(oldest);
      }
      entry = { fetched: new Set(), seen: new Set() };
      logs.set(sessionId, entry);
    }
    return entry;
  }

  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'tool/call' && event?.type !== 'tool/result') return;
      const fetchNames = new Set(plain(config.fetchToolNames) ?? []);
      const searchNames = new Set(plain(config.searchToolNames) ?? []);
      const id = session?.id;
      if (!id) return;
      if (event.type === 'tool/call') {
        const names = calls.get(id) ?? new Map();
        names.set(event.data.callId, event.data.name);
        calls.set(id, names);
        if (fetchNames.has(event.data.name)) {
          const url = normalizeUrl(JSON.parse(event.data.arguments)?.url);
          if (url) logOf(id).fetched.add(url);
        }
      } else {
        const callId = event.data.message?.toolCallId ?? event.data.callId;
        if (!searchNames.has(calls.get(id)?.get(callId))) return;
        calls.get(id)?.delete(callId);
        const text = JSON.stringify(event.data.message?.content ?? event.data.content ?? event.data.result ?? '');
        for (const match of text.matchAll(/https?:\/\/[^\s"'<>\\)]+/g)) {
          const url = normalizeUrl(match[0]);
          if (url) logOf(id).seen.add(url);
        }
      }
    } catch {
      // A malformed event is not a fetch; never disturb the Session.
    }
  });

  /**
   * URLs a child fetched or was shown by a search, then forget the record.
   * @param {string} childId - child agent id (its Session id).
   * @returns {{fetched: Set<string>, seen: Set<string>}} normalized URLs.
   */
  function fetchLog(childId) {
    const entry = logs.get(childId) ?? { fetched: new Set(), seen: new Set() };
    logs.delete(childId);
    calls.delete(childId);
    return entry;
  }

  /** Remaining budget as a signal: the caller's cancellation or the run's deadline. */
  function limitedSignal(signal, deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    return AbortSignal.any([signal, AbortSignal.timeout(remaining)]);
  }

  const deepResearchTool = {
    name: plain(config.toolName),
    description:
      'Research a question in depth: plan sub-questions, search and read the web in parallel with child agents, review what was found and search again for what is missing, and return a cited report. ' +
      'Every citation is checked against the numbered sources and against the pages the children fetched. ' +
      'mode "wide" researches one row per item and returns a CSV text with a Sources column; save it with your own file tools. ' +
      'Use it for questions that need several sources; answer simple questions directly.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string', minLength: 3, description: 'The research question, or for wide mode what to find for each item.' },
        mode: { type: 'string', enum: ['standard', 'wide'], description: 'standard (default): one cited report. wide: one row per item.' },
        items: { type: 'array', items: { type: 'string' }, maxItems: 5000, description: 'Wide mode only: the entities to research, one row each.' },
        columns: { type: 'array', items: { type: 'string' }, maxItems: 30, description: 'Wide mode only: the columns to fill for each item.' },
        maxSources: { type: 'integer', minimum: 1, description: 'Upper bound on distinct sources (capped by configuration).' },
        maxMinutes: { type: 'number', minimum: 1, description: 'Time budget in minutes (capped by configuration).' },
      },
      required: ['question'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: { text: { type: 'string' }, stats: { type: 'object' } },
        required: ['text'],
      },
      render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
    },
    timeoutMs: 4 * 60 * 60 * 1000,
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const parent = exec.agent;
      if (!parent?.id) throw new Error('deep_research needs a live parent Session.');
      if (childIds.has(parent.id)) throw new Error('deep_research cannot be called from one of its own research agents.');
      const startedAt = Date.now();
      // Inside a program (the app's PTC preset) the app stops everything after a fixed time: finish before that.
      let programMaxMs;
      try {
        programMaxMs = ctx.get('ptcRuntime')?.timeout?.maxMs;
      } catch {
        programMaxMs = undefined;
      }
      // How deep to go: the slider beside the Deep research button, held to the settings' and the model version's limits.
      let chosen;
      try {
        chosen = ctx.get('modes')?.researchDepth?.();
      } catch {
        chosen = undefined;
      }
      const depth = capped(depthOf(chosen ?? plain(config.depth)), {
        maxParallel: plain(config.maxParallel),
        maxSubquestions: plain(config.maxSubquestions),
        maxSources: plain(config.maxSources),
        tierCap: ctx.get('modelTiers')?.resolveTier?.(parent.id)?.maxSubagents,
        askedSources: args?.maxSources,
      });
      const minutes = researchMinutes({ configured: Math.min(Number(plain(config.maxMinutes)) || depth.minutes, depth.minutes), asked: args?.maxMinutes, inProgram: insideProgram(exec.callId), programMaxMs });
      const deadline = startedAt + minutes * 60 * 1000;
      const maxSources = depth.sources;
      const parallel = depth.runners;
      const roles = plain(config.roles);
      const question = String(args.question).trim();
      const signalFor = () => limitedSignal(exec.signal, deadline);
      const wide = args.mode === 'wide';
      const today = new Date().toISOString().slice(0, 10);
      const searchTools = plain(config.searchToolNames);
      const fetchTools = plain(config.fetchToolNames);

      if (wide) return runWide({ args, exec, parent, question, deadline, parallel, roles, startedAt, signalFor });

      // 1. Plan: sub-questions, each with search queries.
      const planned = await runChild({ role: roles.planner, label: 'Research plan', parent, signal: signalFor(), prompt: planPrompt(question, depth, today) });
      let tasks = tasksOf(extractJson(planned.text)?.subquestions, depth.subquestions);
      if (tasks.length === 0) tasks = [{ question, queries: [], why: '' }];

      const failures = [];
      const sources = [];
      const sourceIndex = new Map();
      const findings = [];
      const asked = [];
      const tried = [];
      const gaps = [];
      const conflicts = [];
      let dropped = 0;
      let round = 0;
      let stoppedEarly = '';

      while (tasks.length > 0) {
        round += 1;
        const known = findings.map((finding) => finding.claim.slice(0, 160));
        const triedBefore = [...tried];
        // 2. Search and read, in parallel.
        const outcomes = await mapLimit(tasks, parallel, async (task, index) => {
          if (Date.now() >= deadline) return null;
          try {
            const answer = await runChild({
              role: roles.searcher,
              label: `Research ${depth.rounds > 1 ? `round ${round}, ` : ''}${index + 1}/${tasks.length}`,
              parent,
              signal: signalFor(),
              prompt: searchPrompt({ question, task, round, depth, searchTools, fetchTools, tried: triedBefore, known, today }),
            });
            return { task, ...searchAnswer(extractJson(answer.text), depth.findings), log: fetchLog(answer.childId) };
          } catch (error) {
            failures.push(`${task.question}: ${error?.message ?? error}`);
            return null;
          }
        });
        for (const task of tasks) asked.push(task.question);

        // 3. Merge and de-duplicate sources.
        for (const outcome of outcomes) {
          if (!outcome) continue;
          for (const query of outcome.queries) if (!tried.includes(query)) tried.push(query);
          for (const gap of outcome.gaps) if (!gaps.includes(gap)) gaps.push(gap);
          for (const finding of outcome.findings) {
            const url = normalizeUrl(finding?.url);
            const claim = String(finding?.claim ?? '').trim();
            if (!url || !claim) {
              dropped += 1;
              continue;
            }
            const status = outcome.log.fetched.has(url) ? 'fetched' : outcome.log.seen.has(url) ? 'search result only' : 'not fetched';
            if (plain(config.requireFetched) === true && status !== 'fetched') {
              dropped += 1;
              continue;
            }
            let entry = sourceIndex.get(url);
            if (!entry) {
              if (sources.length >= maxSources) {
                dropped += 1;
                continue;
              }
              entry = { n: sources.length + 1, url, status, host: new URL(url).hostname.replace(/^www\./, '') };
              sources.push(entry);
              sourceIndex.set(url, entry);
            } else if (status === 'fetched') {
              entry.status = 'fetched';
            }
            // The same claim from the same page, reported by two helpers, is kept once.
            if (findings.some((other) => other.n === entry.n && other.claim.toLowerCase() === claim.toLowerCase())) continue;
            findings.push({ n: entry.n, host: entry.host, claim, quote: String(finding?.quote ?? '').trim().slice(0, 300), date: String(finding?.date ?? '').trim().slice(0, 40) });
          }
        }

        // 4. Between rounds: what is missing, what contradicts, and better queries for the next round.
        tasks = [];
        if (!roundLeft({ round, depth, startedAt, deadline, now: Date.now() })) {
          if (round < depth.rounds) stoppedEarly = 'time';
          break;
        }
        try {
          const reviewed = await runChild({
            role: roles.planner,
            label: `Research review, round ${round}`,
            parent,
            signal: signalFor(),
            prompt: analyzePrompt({ question, findings, gaps, tried, asked, round, depth, today }),
          });
          const verdict = analysisOf(extractJson(reviewed.text), depth, asked);
          for (const conflict of verdict.conflicts) if (!conflicts.includes(conflict)) conflicts.push(conflict);
          if (verdict.enough) stoppedEarly = 'enough';
          else tasks = verdict.followups;
        } catch (error) {
          failures.push(`review of round ${round}: ${error?.message ?? error}`);
          stoppedEarly = 'review failed';
        }
      }

      if (findings.length === 0) {
        throw new Error(
          `deep_research found no usable sources${failures.length ? ` (${failures.length} searcher(s) failed: ${failures[0]})` : ''}.`,
        );
      }

      // 5. Write the report.
      const partial = Date.now() >= deadline;
      const written = await runChild({ role: roles.writer, label: 'Research report', parent, signal: exec.signal, prompt: writePrompt({ question, findings, conflicts, gaps, today }) });

      // 6. Check the citations.
      const cited = new Set([...written.text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
      const unknown = [...cited].filter((n) => !sources.some((source) => source.n === n));
      const usedSources = sources.filter((source) => cited.has(source.n));
      const notes = [];
      notes.push(`Depth: ${depth.label}. ${round} round${round === 1 ? '' : 's'} of searching with up to ${parallel} helper${parallel === 1 ? '' : 's'} at once, ${asked.length} sub-question${asked.length === 1 ? '' : 's'}, ${sources.length} source${sources.length === 1 ? '' : 's'}.`);
      if (stoppedEarly === 'enough') notes.push('The review after the last round found the question answered, so no further round was run.');
      if (stoppedEarly === 'time') notes.push('Not enough time was left for another round.');
      if (stoppedEarly === 'review failed') notes.push('The review between rounds failed, so no further round was run.');
      if (unknown.length) notes.push(`The report cites [${unknown.join('], [')}], which are not in the source list.`);
      const unverified = usedSources.filter((source) => source.status !== 'fetched');
      if (unverified.length) notes.push(`${unverified.length} cited source(s) were not fetched by a researcher; treat them with care.`);
      if (partial) notes.push('The time budget ran out; the report covers only the sub-questions finished in time.');
      if (failures.length) notes.push(`${failures.length} step(s) failed.`);
      if (dropped) notes.push(`${dropped} finding(s) were dropped (no usable URL, over the source limit, or not fetched).`);

      const list = (usedSources.length ? usedSources : sources).map((source) => `[${source.n}] ${source.url} (${source.status})`).join('\n');
      const text = `${written.text}\n\n## Sources\n${list}${notes.length ? `\n\n## Checks\n${notes.map((note) => `- ${note}`).join('\n')}` : ''}`;
      return {
        text,
        stats: {
          depth: depth.id,
          rounds: round,
          subquestions: asked.length,
          findings: findings.length,
          sources: sources.length,
          cited: usedSources.length,
          unknownCitations: unknown.length,
          partial,
          minutes: Math.round(((Date.now() - startedAt) / 60000) * 10) / 10,
        },
      };
    },
  };

  /**
   * Wide mode: one row per item.
   * @param {object} run - the run context.
   * @returns {Promise<{text: string, stats: object}>} CSV text and stats.
   */
  async function runWide({ args, parent, question, deadline, parallel, roles, startedAt, signalFor }) {
    const maxRows = Number(plain(config.wide)?.maxRows) || 500;
    const items = (Array.isArray(args.items) ? args.items : []).map((item) => String(item).trim()).filter(Boolean);
    const columns = (Array.isArray(args.columns) ? args.columns : []).map((column) => String(column).trim()).filter(Boolean);
    if (items.length === 0) throw new Error('Wide mode needs a non-empty `items` list.');
    if (columns.length === 0) throw new Error('Wide mode needs a non-empty `columns` list.');
    if (items.length > maxRows) throw new Error(`Wide mode is limited to ${maxRows} rows; got ${items.length}.`);
    const rows = await mapLimit(items, parallel, async (item) => {
      if (Date.now() >= deadline) return { item, values: {}, sources: [], note: 'time budget ran out' };
      try {
        const answer = await runChild({
          role: roles.searcher,
          label: `Row: ${item.slice(0, 60)}`,
          parent,
          signal: signalFor(),
          prompt:
            `RESEARCH_ROW\nResearch ONE item on the web with ${plain(config.searchToolNames).join(', ')} and ${plain(config.fetchToolNames).join(', ')}. ` +
            'Fetch the pages you rely on. Leave a value empty when you cannot find it.\n' +
            `Answer with ONLY JSON: {"values": {${columns.map((c) => JSON.stringify(c) + ': "..."').join(', ')}}, "sources": ["https://..."]}\n\n` +
            `Task: ${question}\nItem: ${item}`,
        });
        const parsed = extractJson(answer.text);
        const log = fetchLog(answer.childId);
        const urls = (Array.isArray(parsed?.sources) ? parsed.sources : []).map(normalizeUrl).filter(Boolean);
        const verified = urls.filter((url) => log.fetched.has(url));
        return { item, values: parsed?.values ?? {}, sources: verified, note: urls.length > verified.length ? 'some sources not fetched and omitted' : '' };
      } catch (error) {
        return { item, values: {}, sources: [], note: `failed: ${error?.message ?? error}` };
      }
    });
    const header = ['Item', ...columns, 'Sources', 'Notes'];
    const lines = [header.map(csvField).join(',')];
    for (const row of rows) {
      lines.push([row.item, ...columns.map((column) => row.values?.[column] ?? ''), row.sources.join(' '), row.note].map(csvField).join(','));
    }
    const failed = rows.filter((row) => row.note.startsWith('failed')).length;
    return {
      text: `${lines.join('\n')}\n`,
      stats: {
        rows: rows.length,
        failed,
        withSources: rows.filter((row) => row.sources.length > 0).length,
        minutes: Math.round(((Date.now() - startedAt) / 60000) * 10) / 10,
      },
    };
  }

  ctx.effect(() => ctx.tools.register(deepResearchTool));

  // The tool starts child agents, so the tier's sub-agent access and cap apply to it.
  // Tier may load after this plugin, so register once its service exists.
  ctx.inject(['modelTiers'], (inner) => {
    inner.effect(() => inner.modelTiers.registerSubagentTool(deepResearchTool.name), 'deep-research tier gate');
  });
}
