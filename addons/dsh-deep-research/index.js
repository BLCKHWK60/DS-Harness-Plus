/**
 * Host half of Deep research.
 *
 * Registers one tool, `deep_research`. A run is: a planner child splits the
 * question into sub-questions; searcher children research them in parallel with
 * the web tools and return findings with source URLs; the host merges and
 * de-duplicates the sources; a writer child writes a report that cites them by
 * number; the host then checks every citation against the numbered sources and
 * against what each searcher actually fetched.
 *
 * Children run on the Tier plugin's role routes when it is loaded (planner and
 * writer: `plan`, searchers: `fast` by default), otherwise on the parent's route.
 * Writing files is left to the model's own tools, so the sandbox applies.
 */
import z from '@deepseek-ai/schemastery';

export const name = 'deep-research';
export const inject = ['tools'];

export const Config = z.object({
  enabled: z.boolean().default(true),
  toolName: z.string().default('deep_research'),
  roles: z
    .object({
      planner: z.string().default('plan'),
      searcher: z.string().default('fast'),
      writer: z.string().default('plan'),
    })
    .default({ planner: 'plan', searcher: 'fast', writer: 'plan' }),
  maxSubquestions: z.number().min(1).max(12).default(6),
  maxParallel: z.number().min(1).max(8).default(4),
  maxSources: z.number().min(1).max(200).default(40),
  maxMinutes: z.number().min(1).max(240).default(20),
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
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function apply(ctx, config) {
  if (plain(config.enabled) === false) return;

  /** Agents this plugin started, which may not start research themselves. */
  const childIds = new Set();

  /** Role route for a child: Tier's route for the parent's tier, else the parent's own route. */
  function routeFor(parent, role) {
    const tiers = ctx.get('modelTiers');
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
    const started = await subagents.startActivation({
      provider: 'spawn',
      label,
      request: {
        prompt: [{ type: 'text', text: prompt }],
        parent,
        signal,
        ...(route ? { agentOptions: { provider: route.provider, model: route.model } } : {}),
      },
      delivery: 'parent',
      signal,
    });
    childIds.add(started.childId);
    const result = await started.result;
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
      } else if (searchNames.has(calls.get(id)?.get(event.data.callId))) {
        const text = JSON.stringify(event.data.content ?? event.data.result ?? '');
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
      'Research a question in depth: plan sub-questions, search and read the web in parallel with child agents, and return a cited report. ' +
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
      const minutes = Math.min(Number(plain(config.maxMinutes)) || 20, Number(args?.maxMinutes) || Infinity);
      const deadline = startedAt + minutes * 60 * 1000;
      const maxSources = Math.min(Number(plain(config.maxSources)) || 40, Number(args?.maxSources) || Infinity);
      const parallel = Math.min(Number(plain(config.maxParallel)) || 4, ctx.get('modelTiers')?.resolveTier?.(parent.id)?.maxSubagents ?? 8);
      const roles = plain(config.roles);
      const question = String(args.question).trim();
      const signalFor = () => limitedSignal(exec.signal, deadline);
      const wide = args.mode === 'wide';

      if (wide) return runWide({ args, exec, parent, question, deadline, parallel, roles, startedAt, signalFor });

      // 1. Plan.
      const maxSub = Number(plain(config.maxSubquestions)) || 6;
      const planned = await runChild({
        role: roles.planner,
        label: 'Research plan',
        parent,
        signal: signalFor(),
        prompt:
          `RESEARCH_PLAN\nSplit this research question into 2 to ${maxSub} independent sub-questions that together answer it.\n` +
          `Answer with ONLY JSON: {"subquestions": ["...", "..."]}\n\nQuestion: ${question}`,
      });
      const plan = extractJson(planned.text);
      const subquestions = (Array.isArray(plan?.subquestions) ? plan.subquestions : [])
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .slice(0, maxSub);
      if (subquestions.length === 0) subquestions.push(question);

      // 2. Search and read, in parallel.
      const failures = [];
      const outcomes = await mapLimit(subquestions, parallel, async (subquestion, index) => {
        if (Date.now() >= deadline) return null;
        try {
          const answer = await runChild({
            role: roles.searcher,
            label: `Research ${index + 1}/${subquestions.length}`,
            parent,
            signal: signalFor(),
            prompt:
              `RESEARCH_SEARCH\nResearch ONE sub-question on the web with ${plain(config.searchToolNames).join(', ')} and ${plain(config.fetchToolNames).join(', ')}. ` +
              'Fetch every page you cite. Do not cite a page you did not fetch.\n' +
              'Answer with ONLY JSON: {"findings": [{"claim": "...", "url": "https://...", "quote": "short verbatim quote"}]} with at most 8 findings.\n\n' +
              `Overall question: ${question}\nSub-question: ${subquestion}`,
          });
          const parsed = extractJson(answer.text);
          return { subquestion, findings: Array.isArray(parsed?.findings) ? parsed.findings : [], log: fetchLog(answer.childId) };
        } catch (error) {
          failures.push(`${subquestion}: ${error?.message ?? error}`);
          return null;
        }
      });

      // 3. Merge and de-duplicate sources.
      const sources = [];
      const sourceIndex = new Map();
      const findings = [];
      let dropped = 0;
      for (const outcome of outcomes) {
        if (!outcome) continue;
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
            entry = { n: sources.length + 1, url, status };
            sources.push(entry);
            sourceIndex.set(url, entry);
          } else if (status === 'fetched') {
            entry.status = 'fetched';
          }
          findings.push({ n: entry.n, claim, quote: String(finding?.quote ?? '').trim().slice(0, 300) });
        }
      }
      if (findings.length === 0) {
        throw new Error(
          `deep_research found no usable sources${failures.length ? ` (${failures.length} searcher(s) failed: ${failures[0]})` : ''}.`,
        );
      }

      // 4. Write the report.
      const partial = Date.now() >= deadline;
      const written = await runChild({
        role: roles.writer,
        label: 'Research report',
        parent,
        signal: exec.signal,
        prompt:
          'RESEARCH_WRITE\nWrite a clear report that answers the question using ONLY the numbered findings below. ' +
          'Cite each claim inline as [n]. Do not cite any number that is not listed and do not add facts of your own. ' +
          'Say where the evidence is thin or conflicting. Do not add a source list; it is added for you.\n\n' +
          `Question: ${question}\n\nFindings:\n` +
          findings.map((f) => `[${f.n}] ${f.claim}${f.quote ? ` — "${f.quote}"` : ''}`).join('\n'),
      });

      // 5. Check the citations.
      const cited = new Set([...written.text.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])));
      const unknown = [...cited].filter((n) => !sources.some((source) => source.n === n));
      const usedSources = sources.filter((source) => cited.has(source.n));
      const notes = [];
      if (unknown.length) notes.push(`The report cites [${unknown.join('], [')}], which are not in the source list.`);
      const unverified = usedSources.filter((source) => source.status !== 'fetched');
      if (unverified.length) notes.push(`${unverified.length} cited source(s) were not fetched by a researcher; treat them with care.`);
      if (partial) notes.push('The time budget ran out; the report covers only the sub-questions finished in time.');
      if (failures.length) notes.push(`${failures.length} sub-question(s) failed.`);
      if (dropped) notes.push(`${dropped} finding(s) were dropped (no usable URL, over the source limit, or not fetched).`);

      const list = (usedSources.length ? usedSources : sources).map((source) => `[${source.n}] ${source.url} (${source.status})`).join('\n');
      const text = `${written.text}\n\n## Sources\n${list}${notes.length ? `\n\n## Checks\n${notes.map((note) => `- ${note}`).join('\n')}` : ''}`;
      return {
        text,
        stats: {
          subquestions: subquestions.length,
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
