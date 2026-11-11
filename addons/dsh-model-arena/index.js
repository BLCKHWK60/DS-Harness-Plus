/**
 * Host half of Model arena.
 *
 * One prompt goes to several configured models at once. The answers come back
 * under shuffled labels (A, B, ...) with no model name anywhere, so you judge
 * the text, not the brand. A blind judge (the shared `candidateJudge` service
 * from Code power, so the project has one judge) and your own pick can both be
 * recorded; `reveal` then shows who wrote what, with latency and tokens.
 *
 * Model calls go through dsh (`ctx.llm.stream`), so provider keys stay where
 * dsh keeps them: this plugin holds no secret. One contestant failing never
 * stops the others, and a failure is shown as a generic "no answer" so it
 * cannot give the contestant away. Nothing is configured by default: with no
 * candidates the plugin does nothing.
 */
import { mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import z from '@deepseek-ai/schemastery';

export const name = 'model-arena';

/** Paths of the read-only routes the browser page reads. */
const ROUNDS_PATH = '/dsh-model-arena/rounds';
const ROUND_PATH = '/dsh-model-arena/round';
/** The one write route: the page's Ask, Judge, Pick, Reveal and Delete buttons. POST only. */
const ACTION_PATH = '/dsh-model-arena/action';
const ACTIONS = ['ask', 'judge', 'pick', 'reveal', 'delete'];
/** Largest request body the write route reads. */
const MAX_BODY = 64 * 1024;
/** Round ids are `YYYYMMDDHHMMSS-xxx`. */
const ROUND_ID = /^\d{14}-[a-z0-9]{1,3}$/;

// Everything the Settings page edits is volatile, so a change applies at once, without a restart.
export const Config = z.object({
  enabled: z.boolean().default(true),
  dataDir: z.string(),
  candidates: z.array(z.object({ id: z.string().required(), provider: z.string().required(), model: z.string().required(), reasoningEffort: z.string() })).default([]).volatile(),
  maxContestants: z.number().min(2).max(4).default(4).volatile(),
  blindByDefault: z.boolean().default(true).volatile(),
  redactNames: z.boolean().default(true).volatile(),
  judge: z.object({ provider: z.string(), model: z.string() }).default({}).volatile(),
  criteria: z.array(z.string()).default([]).volatile(),
  consistencyCheck: z.boolean().default(true).volatile(),
  limits: z
    .object({
      timeoutMs: z.number().min(1000).max(1800000).default(120000),
      maxTokens: z.number().min(0).max(1000000).default(0),
    })
    .default({ timeoutMs: 120000, maxTokens: 0 })
    .volatile(),
  storeDays: z.number().min(1).max(3650).default(30).volatile(),
  commandName: z.string().default('arena'),
});

const DEFAULT_CRITERIA = ['accuracy', 'completeness', 'clarity', 'relevance'];
const LABELS = 'ABCD';

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

// ---- pure helpers (exported for tests) -------------------------------------------------

/**
 * A fair shuffle (Fisher-Yates) with an injectable integer source.
 * @template T
 * @param {T[]} items - items to shuffle; not modified.
 * @param {(max: number) => number} [pick] - returns an integer in [0, max).
 * @returns {T[]} a shuffled copy.
 */
export function shuffle(items, pick = (max) => randomInt(max)) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = pick(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Remove candidate ids and model names from an answer, so a model that says
 * who it is cannot give itself away. Matching is case-insensitive on whole
 * names; names shorter than 3 characters are left alone.
 * @param {string} text - answer text.
 * @param {Array<{id: string, model: string}>} candidates - names to hide.
 * @returns {string} the text with names replaced by "[model]".
 */
export function redact(text, candidates) {
  let result = String(text ?? '');
  const names = new Set();
  for (const candidate of candidates) {
    for (const value of [candidate.id, candidate.model, String(candidate.model ?? '').split(/[/:]/).pop()]) {
      const name = String(value ?? '').trim();
      if (name.length >= 3) names.add(name);
    }
  }
  for (const name of [...names].sort((a, b) => b.length - a.length)) {
    result = result.replace(new RegExp(`(?<![A-Za-z0-9])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z0-9])`, 'gi'), '[model]');
  }
  return result;
}

/**
 * Turn an error into a generic phrase that cannot identify a model.
 * @param {unknown} error - the failure.
 * @returns {string} "timed out", "route unavailable" or "request failed".
 */
export function genericFailure(error) {
  const text = String(error?.message ?? error ?? '');
  if (/time(d)? ?out|abort/i.test(text)) return 'timed out';
  if (/unavailable|down/i.test(text)) return 'route unavailable';
  return 'request failed';
}

/**
 * Split `[--open] [--blind] [--with a,b] <prompt>` into options and prompt.
 * @param {string} input - the text after `ask`.
 * @returns {{prompt: string, open: boolean | undefined, with: string[]}} parsed options.
 */
export function parseAsk(input) {
  let rest = String(input ?? '').trim();
  let open;
  let only = [];
  for (;;) {
    const flag = rest.match(/^--(open|blind|with)(?:[=\s]+|$)/);
    if (!flag) break;
    rest = rest.slice(flag[0].length);
    if (flag[1] === 'open') open = true;
    else if (flag[1] === 'blind') open = false;
    else {
      const value = rest.match(/^(\S+)\s*/);
      if (!value) break;
      only = value[1].split(',').map((item) => item.trim()).filter(Boolean);
      rest = rest.slice(value[0].length);
    }
  }
  return { prompt: rest.trim(), open, with: only };
}

/**
 * Text of a round as shown while it is still blind (no names, no timings).
 * @param {object} round - stored round.
 * @param {(text: string) => string} shown - maps a stored answer to display text.
 * @returns {string} the display text.
 */
export function formatBlind(round, shown, { next = true } = {}) {
  const lines = [`Round ${round.id}: ${round.slots.length} contestants (blind).`, `Prompt: ${round.prompt}`];
  for (const slot of round.slots) {
    lines.push('', `=== Answer ${slot.label} ===`);
    lines.push(slot.error ? `(no answer: ${slot.error})` : shown(slot.text));
  }
  if (next) lines.push('', `Next: /arena judge ${round.id} | /arena pick <label> ${round.id} | /arena reveal ${round.id}`);
  return lines.join('\n');
}

/**
 * The settings as they are right now. Read at every use, because the Settings page can change
 * them while the app runs. Entries that cannot be used (no id, no model, a repeated id) are left out.
 * @param {object} config - plugin config (may hold live references).
 * @returns {object} candidates, ids, limits, judge and switches.
 */
export function readSettings(config) {
  const cfg = plain(config) ?? {};
  const ids = new Set();
  const candidates = [];
  for (const item of Array.isArray(cfg.candidates) ? cfg.candidates : []) {
    const id = String(item?.id ?? '').trim();
    const provider = String(item?.provider ?? '').trim();
    const model = String(item?.model ?? '').trim();
    if (!id || !provider || !model || ids.has(id)) continue;
    ids.add(id);
    const effort = String(item.reasoningEffort ?? '').trim();
    candidates.push({ id, provider, model, ...(effort ? { reasoningEffort: effort } : {}) });
  }
  const criteria = (Array.isArray(cfg.criteria) ? cfg.criteria : []).map((item) => String(item ?? '').trim()).filter(Boolean);
  const judge = cfg.judge && cfg.judge.provider && cfg.judge.model ? { provider: String(cfg.judge.provider), model: String(cfg.judge.model) } : null;
  return {
    candidates,
    ids,
    maxContestants: Math.min(4, Math.max(2, Number(cfg.maxContestants) || 4)),
    timeoutMs: Math.min(1800000, Math.max(1000, Number(cfg.limits?.timeoutMs) || 120000)),
    maxTokens: Math.max(0, Number(cfg.limits?.maxTokens) || 0),
    storeDays: Math.max(1, Number(cfg.storeDays) || 30),
    criteria: criteria.length ? criteria : DEFAULT_CRITERIA,
    judge,
    redactNames: cfg.redactNames !== false,
    blindByDefault: cfg.blindByDefault !== false,
    consistencyCheck: cfg.consistencyCheck !== false,
  };
}

/**
 * Read a small JSON body from a request.
 * @param {AsyncIterable<Uint8Array | string>} req - the request.
 * @returns {Promise<{ok: true, value: object} | {ok: false, status: number}>} the object, or why not.
 */
export async function readJsonBody(req) {
  let size = 0;
  const parts = [];
  try {
    for await (const chunk of req) {
      const part = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += part.length;
      if (size > MAX_BODY) return { ok: false, status: 413 };
      parts.push(part);
    }
    const value = JSON.parse(Buffer.concat(parts).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, status: 400 };
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400 };
  }
}

// ---- plugin ----------------------------------------------------------------------------

/**
 * Plugin entry.
 * @param {object} ctx - Cordis context.
 * @param {object} config - plugin config.
 */
export function apply(ctx, config) {
  const cfg0 = plain(config) ?? {};
  if (cfg0.enabled === false) return;

  // A config file that names the same contestant twice is a mistake worth stopping for.
  const listed = new Set();
  for (const candidate of Array.isArray(cfg0.candidates) ? cfg0.candidates : []) {
    if (listed.has(candidate.id)) throw new Error(`model-arena: duplicate candidate id "${candidate.id}"`);
    listed.add(candidate.id);
  }
  /** @returns {object} the settings in force right now. */
  const live = () => readSettings(config);
  const commandName = String(cfg0.commandName ?? 'arena').trim();

  const ownDir = String(cfg0.dataDir ?? '').trim();
  const dir = ownDir || String(ctx.get('dshHomePath')?.('arena') ?? '');
  if (ownDir && !(ownDir.startsWith('/') || /^[A-Za-z]:[\\/]/.test(ownDir))) {
    throw new Error('model-arena: `dataDir` must be an absolute path');
  }

  /** Round id -> round. Loaded lazily from disk. */
  const rounds = new Map();
  /** Round id -> { id, createdAt, prompt, total, answered } while a round is being asked. Counts only: a per-answer
   * state or partial text would show which model is fastest, which a blind test must not do. */
  const inflight = new Map();
  let latest = '';
  let loaded = false;

  /**
   * Persist a round atomically.
   * @param {object} round - round.
   */
  function save(round) {
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = join(dir, `arena-${round.id}.json`);
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(round), { mode: 0o600 });
      renameSync(temp, file);
    } catch (error) {
      ctx.logger?.warn?.(`model-arena: could not save round ${round.id}: ${error.message}`);
    }
  }

  /** Delete stored rounds older than the retention window. */
  function prune() {
    if (!dir) return;
    try {
      const cutoff = Date.now() - live().storeDays * 86400000;
      for (const file of readdirSync(dir)) {
        if (!/^arena-[\w-]+\.json$/.test(file)) continue;
        const path = join(dir, file);
        let created = 0;
        try {
          created = Number(JSON.parse(readFileSync(path, 'utf8')).createdAt) || statSync(path).mtimeMs;
        } catch {
          created = statSync(path).mtimeMs;
        }
        if (created < cutoff) {
          unlinkSync(path);
          rounds.delete(file.slice(6, -5));
        }
      }
    } catch {
      // The folder may not exist yet; nothing to prune.
    }
  }

  /** Load stored rounds into memory once. */
  function load() {
    if (loaded || !dir) return;
    loaded = true;
    prune();
    try {
      for (const file of readdirSync(dir).sort()) {
        if (!/^arena-[\w-]+\.json$/.test(file)) continue;
        try {
          const round = JSON.parse(readFileSync(join(dir, file), 'utf8'));
          if (round?.id && Array.isArray(round.slots)) {
            rounds.set(round.id, round);
            latest = round.id;
          }
        } catch {
          // A damaged file is skipped, not fatal.
        }
      }
    } catch {
      // No folder yet.
    }
  }

  /**
   * Find a round by id (or the latest one).
   * @param {string | undefined} id - round id.
   * @returns {object} the round.
   */
  function need(id) {
    load();
    const key = id || latest;
    const round = rounds.get(key);
    if (!round) throw new Error(key ? `no round "${key}"` : 'no rounds yet. Start one with /' + commandName + ' ask <prompt>');
    return round;
  }

  /**
   * Ask one model.
   * @param {{provider: string, model: string, reasoningEffort?: string}} target - where to ask.
   * @param {string} prompt - user text.
   * @param {{temperature?: number, signal?: AbortSignal}} options - options.
   * @returns {Promise<{text: string, input: number, output: number, latencyMs: number}>} result.
   */
  async function ask(target, prompt, options = {}) {
    const llm = ctx.get('llm');
    if (!llm?.stream) throw new Error('the llm service is unavailable');
    const { timeoutMs, maxTokens } = live();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(new Error('timed out')), timeoutMs);
    const forward = () => abort.abort(options.signal?.reason);
    options.signal?.addEventListener?.('abort', forward, { once: true });
    const started = performance.now();
    let text = '';
    let usage;
    try {
      for await (const chunk of llm.stream({
        provider: target.provider,
        model: target.model,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
        ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
        ...(maxTokens ? { maxTokens } : {}),
        ...(target.reasoningEffort ? { reasoningEffort: target.reasoningEffort } : {}),
        signal: abort.signal,
      })) {
        if (chunk.type === 'text-delta') text += chunk.text;
        else if (chunk.type === 'usage') usage = chunk.usage;
        else if (chunk.type === 'finish' && chunk.reason?.kind === 'error') throw new Error(chunk.reason.failure?.message ?? 'model error');
        else if (chunk.type === 'finish' && chunk.reason?.kind === 'aborted') break;
      }
      if (options.signal?.aborted) throw new Error('cancelled');
      if (abort.signal.aborted) throw new Error('timed out');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener?.('abort', forward);
    }
    return { text, input: usage?.inputTokens ?? 0, output: usage?.outputTokens ?? 0, latencyMs: Math.round(performance.now() - started) };
  }

  /**
   * Candidate list for display after a reveal.
   * @param {object} round - round.
   * @returns {Array<{id: string, model: string}>} names in this round.
   */
  const namesOf = (round) => round.slots.map((slot) => ({ id: slot.candidateId, model: slot.model }));

  /**
   * Text of one answer as it is shown and judged.
   * @param {object} round - round.
   * @param {string} text - stored answer.
   * @returns {string} display text.
   */
  const shownText = (round, text) => (live().redactNames ? redact(text, namesOf(round)) : text);

  const arena = {
    apiVersion: 1,

    /** @returns {Array<{id: string, provider: string, model: string}>} the configured candidates. */
    candidates() {
      return live().candidates.map(({ id, provider, model }) => ({ id, provider, model }));
    },

    /**
     * Ask the contestants one prompt in parallel.
     * @param {{prompt: string, only?: string[], signal?: AbortSignal, temperature?: number, onStart?: (id: string) => void}} spec - the round;
     *   `onStart` is told the round id as soon as the models are being asked.
     * @returns {Promise<object>} the stored round (slots carry names; show with `view`).
     */
    async run({ prompt, only = [], signal, temperature, onStart }) {
      load();
      const text = String(prompt ?? '').trim();
      if (!text) throw new Error('give a prompt');
      const { candidates, ids, maxContestants } = live();
      if (candidates.length < 2) throw new Error('the arena needs at least two models to compare. Pick them in Settings > Arena, or list them under `candidates`.');
      if (!dir) throw new Error('the arena has no folder to keep rounds in. Set `dataDir`.');
      let pool = candidates;
      if (only.length) {
        for (const id of only) if (!ids.has(id)) throw new Error(`unknown candidate "${id}". Candidates: ${[...ids].join(', ')}`);
        pool = candidates.filter((candidate) => only.includes(candidate.id));
        if (pool.length < 2) throw new Error('pick at least two candidates');
        if (pool.length > maxContestants) throw new Error(`at most ${maxContestants} contestants per round`);
      } else if (pool.length > maxContestants) {
        pool = shuffle(pool).slice(0, maxContestants);
      }
      const health = ctx.get('routeHealth');
      const order = shuffle(pool);
      const id = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 5).padEnd(3, '0')}`;
      const progress = { id, createdAt: Date.now(), prompt: text, total: order.length, answered: 0 };
      inflight.set(id, progress);
      try {
        onStart?.(id);
      } catch {
        // The caller's own problem; the round goes on.
      }
      let slots;
      try {
        slots = await Promise.all(
          order.map(async (candidate, index) => {
            const slot = { label: LABELS[index], candidateId: candidate.id, provider: candidate.provider, model: candidate.model, text: '', error: '', latencyMs: 0, input: 0, output: 0 };
            try {
              if (health?.state?.(candidate.provider)?.state === 'down') {
                slot.error = 'route unavailable';
                return slot;
              }
              try {
                const answer = await ask(candidate, text, { temperature, signal });
                if (!answer.text.trim()) throw new Error('empty answer');
                Object.assign(slot, answer);
              } catch (error) {
                slot.error = genericFailure(error);
              }
              return slot;
            } finally {
              progress.answered += 1;
            }
          }),
        );
      } finally {
        inflight.delete(id);
      }
      // A cancelled round is dropped, not saved as a round of failed answers.
      if (signal?.aborted) throw new Error('cancelled');
      const round = { id, createdAt: Date.now(), prompt: text, slots, judge: null, pick: null, revealed: false };
      rounds.set(id, round);
      latest = id;
      save(round);
      prune();
      return round;
    },

    /**
     * What to show for a round: blind until revealed.
     * @param {string} [id] - round id (default: the latest).
     * @param {{open?: boolean}} [options] - open: show names too (reveal).
     * @returns {string} display text.
     */
    view(id, options = {}) {
      const round = need(id);
      const blind = formatBlind(round, (text) => shownText(round, text), { next: !(options.open || round.revealed) });
      return options.open || round.revealed ? `${blind}\n\n${arena.reveal(round.id, { mark: false })}` : blind;
    },

    /**
     * Let the blind judge compare the answers.
     * @param {string} [id] - round id.
     * @param {{signal?: AbortSignal}} [options] - options.
     * @returns {Promise<string>} a text report, with labels only.
     */
    async judge(id, options = {}) {
      const round = need(id);
      const settings = live();
      const judgeCfg = settings.judge;
      if (!judgeCfg) throw new Error('no judge model is set. Pick one in Settings > Arena, or set `judge.provider` and `judge.model`.');
      const service = ctx.get('candidateJudge');
      if (!service?.compare) throw new Error('the judge service is unavailable. Load dsh-code-power, which provides it.');
      const answered = round.slots.filter((slot) => !slot.error);
      if (answered.length < 2) throw new Error('fewer than two answers to compare');
      const sameFamily = round.slots.some((slot) => slot.provider === judgeCfg.provider || slot.model === judgeCfg.model);
      const outcome = await service.compare({
        task: round.prompt,
        texts: answered.map((slot) => shownText(round, slot.text)),
        criteria: settings.criteria,
        consistencyCheck: settings.consistencyCheck,
        signal: options.signal,
        ask: async (message, signal) => (await ask({ provider: judgeCfg.provider, model: judgeCfg.model }, message, { temperature: 0, signal })).text,
      });
      const labelOf = (index) => answered[index].label;
      round.judge = {
        winner: outcome.winner === 'tie' ? null : labelOf(outcome.winner),
        consistent: outcome.consistent,
        average: Object.fromEntries(answered.map((slot, index) => [slot.label, outcome.average[index]])),
        rounds: outcome.verdicts.length,
        sameFamily,
      };
      save(round);
      return arena.judgeText(round);
    },

    /**
     * Judge result as text, in labels only.
     * @param {object} round - round.
     * @returns {string} text.
     */
    judgeText(round) {
      const judge = round.judge;
      if (!judge) return 'Not judged yet.';
      const lines = [
        judge.winner
          ? `Judge: Answer ${judge.winner} wins${judge.rounds > 1 ? ', in both rounds' : ''}.`
          : `Judge: tie${judge.consistent ? '' : ' (the two rounds disagreed, so the judge was split)'}.`,
        'Average score: ' + Object.entries(judge.average).map(([label, value]) => `${label} ${value ?? 'n/a'}`).join('; ') + '.',
      ];
      if (judge.sameFamily) lines.push('Note: the judge shares a provider or model with at least one contestant, so it may favour its own family.');
      return lines.join('\n');
    },

    /**
     * Record your own pick.
     * @param {string} label - the answer you prefer.
     * @param {string} [id] - round id.
     * @returns {string} confirmation.
     */
    pick(label, id) {
      const round = need(id);
      const value = String(label ?? '').trim().toUpperCase();
      const slot = round.slots.find((item) => item.label === value);
      if (!slot) throw new Error(`pick one of: ${round.slots.map((item) => item.label).join(', ')}`);
      if (slot.error) throw new Error(`Answer ${value} has no answer to pick`);
      round.pick = value;
      save(round);
      return `Picked Answer ${value} for round ${round.id}. Reveal with /${commandName} reveal ${round.id}.`;
    },

    /**
     * Show who wrote what.
     * @param {string} [id] - round id.
     * @param {{mark?: boolean}} [options] - mark: record the round as revealed (default true).
     * @returns {string} text with names, timings and tokens.
     */
    reveal(id, options = {}) {
      const round = need(id);
      if (options.mark !== false && !round.revealed) {
        round.revealed = true;
        save(round);
      }
      const lines = [`Round ${round.id} (revealed).`, `Prompt: ${round.prompt}`, ''];
      for (const slot of round.slots) {
        const detail = slot.error ? `no answer (${slot.error})` : `${slot.latencyMs} ms, ${slot.input} in / ${slot.output} out`;
        lines.push(`Answer ${slot.label}: ${slot.candidateId} (${slot.provider}/${slot.model}) — ${detail}`);
      }
      const name = (label) => {
        const slot = round.slots.find((item) => item.label === label);
        return slot ? `${label} = ${slot.candidateId}` : 'none';
      };
      lines.push('');
      if (round.judge) lines.push(round.judge.winner ? `Judge picked ${name(round.judge.winner)}.` : 'Judge: tie.');
      if (round.pick) lines.push(`You picked ${name(round.pick)}.`);
      if (round.judge?.winner && round.pick) lines.push(round.judge.winner === round.pick ? 'You and the judge agree.' : 'You and the judge disagree.');
      if (round.judge?.sameFamily) lines.push('Note: the judge shares a provider or model with a contestant.');
      return lines.join('\n');
    },

    /** @returns {Array<{id: string, createdAt: number, prompt: string, judged: boolean, picked: boolean, revealed: boolean}>} rounds, newest first. */
    list() {
      load();
      return [...rounds.values()]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((round) => ({ id: round.id, createdAt: round.createdAt, prompt: round.prompt, judged: Boolean(round.judge), picked: Boolean(round.pick), revealed: Boolean(round.revealed) }));
    },

    /**
     * Delete a stored round.
     * @param {string} id - round id.
     */
    delete(id) {
      const round = need(id);
      rounds.delete(round.id);
      if (latest === round.id) latest = [...rounds.keys()].pop() ?? '';
      try {
        unlinkSync(join(dir, `arena-${round.id}.json`));
      } catch {
        // Already gone.
      }
    },
  };

  ctx.effect(() => ctx.provide('modelArena', Object.freeze(arena)), 'model arena service');

  /**
   * One round as the browser page may see it. While the round is blind this carries the redacted
   * answer text, generic failure words, the judge's result in labels and your pick: never a model,
   * provider, candidate id, latency or token count. Those are added only after `reveal`.
   * @param {string} id - round id.
   * @returns {object} view.
   */
  function roundView(id) {
    const round = need(id);
    const view = {
      id: round.id,
      createdAt: round.createdAt,
      prompt: round.prompt,
      revealed: Boolean(round.revealed),
      pick: round.pick ?? null,
      judge: round.judge
        ? { winner: round.judge.winner, consistent: round.judge.consistent, rounds: round.judge.rounds, average: round.judge.average, sameFamily: Boolean(round.judge.sameFamily) }
        : null,
      slots: round.slots.map((slot) => ({ label: slot.label, text: slot.error ? '' : shownText(round, slot.text), error: slot.error || '' })),
    };
    if (round.revealed) {
      view.names = round.slots.map((slot) => ({
        label: slot.label,
        candidateId: slot.candidateId,
        provider: slot.provider,
        model: slot.model,
        latencyMs: slot.latencyMs,
        input: slot.input,
        output: slot.output,
      }));
    }
    return view;
  }

  // Read-only routes for the browser page (client.js): behind the connection fence (Host/Origin
  // check and the login cookie), GET only. Asking, judging, picking and revealing stay with /arena.
  ctx.inject(['webServer', 'connection'], (inner) => {
    /**
     * Wrap a producer with the fence, the GET-only check and JSON output.
     * @param {(url: URL) => {status: number, body: object}} produce - builds the answer.
     * @returns {(req: object, res: object) => void} route handler.
     */
    const fenced = (produce) => (req, res) => {
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
      let answer;
      try {
        answer = produce(new URL(req.url ?? '/', 'http://placeholder'));
      } catch {
        answer = { status: 500, body: { error: 'failed' } };
      }
      res.statusCode = answer.status;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(JSON.stringify(answer.body));
    };
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: ROUNDS_PATH,
          handler: fenced(() => ({
            status: 200,
            body: {
              at: Date.now(),
              // Counts only; the candidates' names stay out of the page so a blind round cannot be matched to them.
              candidates: live().candidates.length,
              judge: Boolean(live().judge),
              // Whether the shared judge (Code power) is loaded, so the page can say why Judge is unavailable.
              judgeService: Boolean(ctx.get('candidateJudge')?.compare),
              running: [...inflight.values()].map((item) => ({ id: item.id, createdAt: item.createdAt, prompt: item.prompt, total: item.total, answered: item.answered })),
              rounds: arena.list().slice(0, 50),
            },
          })),
        }),
      'model-arena: GET rounds route',
    );
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: ROUND_PATH,
          handler: fenced((url) => {
            const id = url.searchParams.get('id') ?? '';
            if (!ROUND_ID.test(id)) return { status: 400, body: { error: 'bad round id' } };
            const running = inflight.get(id);
            if (running) return { status: 200, body: { at: Date.now(), running: { id, total: running.total, answered: running.answered, prompt: running.prompt } } };
            try {
              return { status: 200, body: { at: Date.now(), round: roundView(id) } };
            } catch {
              return { status: 404, body: { error: 'unknown round' } };
            }
          }),
        }),
      'model-arena: GET round route',
    );

    // The write route for the page's buttons. Same fence as the read routes (login cookie and
    // Host/Origin check), POST only, a small JSON body, a fixed list of actions, ids checked.
    // Answers carry labels only, exactly like the read routes: nothing here names a model.
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: ACTION_PATH,
          handler: async (req, res) => {
            const send = (status, body) => {
              res.statusCode = status;
              res.setHeader('content-type', 'application/json; charset=utf-8');
              res.setHeader('cache-control', 'no-store');
              res.end(JSON.stringify(body));
            };
            try {
              const rejection = inner.connection.requestRejection(req);
              if (rejection !== undefined) {
                res.statusCode = rejection;
                res.end();
                return;
              }
              if (req.method !== 'POST') {
                res.statusCode = 405;
                res.setHeader('allow', 'POST');
                res.end();
                return;
              }
              const body = await readJsonBody(req);
              if (!body.ok) return send(body.status, { error: body.status === 413 ? 'too large' : 'bad request' });
              const { action, id, prompt, label } = body.value;
              if (!ACTIONS.includes(action)) return send(400, { error: 'unknown action' });
              if (action !== 'ask' && (typeof id !== 'string' || !ROUND_ID.test(id))) return send(400, { error: 'bad round id' });
              if (action === 'ask') {
                if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20000) return send(400, { error: 'give a prompt (at most 20,000 characters)' });
                // Answer as soon as the round has started; the page then follows it through the read routes.
                const started = await new Promise((resolve) => {
                  arena
                    .run({ prompt, onStart: (roundId) => resolve({ id: roundId }) })
                    .catch((error) => resolve({ error: String(error?.message ?? error).slice(0, 300) }));
                });
                return started.id ? send(200, { ok: true, id: started.id }) : send(409, { error: started.error });
              }
              try {
                need(id);
              } catch {
                return send(404, { error: 'unknown round' });
              }
              if (action === 'judge') {
                if (!live().judge) return send(409, { error: 'No judge model is set. Pick one in Setup.' });
                try {
                  await arena.judge(id);
                } catch (error) {
                  // The judge model answered in a way that cannot be read, or could not be reached.
                  return send(409, { error: `The judge could not give a verdict (${String(error?.message ?? error).slice(0, 200)}). Try again, or pick another judge model.` });
                }
              } else if (action === 'pick') {
                if (typeof label !== 'string' || !/^[A-Da-d]$/.test(label)) return send(400, { error: 'bad label' });
                arena.pick(label, id);
              } else if (action === 'reveal') {
                arena.reveal(id);
              } else {
                arena.delete(id);
              }
              return send(200, { ok: true, id });
            } catch (error) {
              // A refused action (no judge set, nothing to pick, the judge failed) says why, in plain words.
              return send(409, { error: String(error?.message ?? error).slice(0, 300) });
            }
          },
        }),
      'model-arena: POST action route',
    );
  });

  if (!commandName) return;
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: commandName,
          description: 'Model arena: `ask <prompt>`, `judge [round]`, `pick <label> [round]`, `reveal [round]`, `show [round]`, `list`, `delete <round>`',
          input: { hint: 'ask <prompt> | judge | pick <label> | reveal | show | list | delete <round>' },
          handler: async ({ rawInput, signal }) => {
            const input = String(rawInput ?? '').trim();
            const verb = input.split(/\s+/)[0] ?? '';
            const rest = input.slice(verb.length).trim();
            const args = rest ? rest.split(/\s+/) : [];
            try {
              if (verb === 'ask') {
                const parsed = parseAsk(rest);
                const round = await arena.run({ prompt: parsed.prompt, only: parsed.with, signal });
                const open = parsed.open ?? !live().blindByDefault;
                return { kind: 'success', text: open ? `${formatBlind(round, (text) => shownText(round, text))}\n\n${arena.reveal(round.id)}` : formatBlind(round, (text) => shownText(round, text)) };
              }
              if (verb === 'judge') return { kind: 'success', text: await arena.judge(args[0], { signal }) };
              if (verb === 'pick') return { kind: 'success', text: arena.pick(args[0], args[1]) };
              if (verb === 'reveal') return { kind: 'success', text: arena.reveal(args[0]) };
              if (verb === 'show') return { kind: 'success', text: arena.view(args[0]) };
              if (verb === 'delete') {
                if (!args[0]) throw new Error('give a round id');
                arena.delete(args[0]);
                return { kind: 'success', text: `Deleted round ${args[0]}.` };
              }
              if (verb === 'list' || !verb) {
                const rows = arena.list();
                if (!live().candidates.length) return { kind: 'success', text: 'The arena has no candidates configured. Pick the models to compare in Settings > Arena.' };
                return { kind: 'success', text: rows.length ? rows.map((row) => `${row.id}${row.judged ? ' judged' : ''}${row.picked ? ' picked' : ''}${row.revealed ? ' revealed' : ''}: ${row.prompt.slice(0, 60)}`).join('\n') : 'No rounds yet.' };
              }
              return { kind: 'error', text: `Usage: /${commandName} ask [--with id,id] [--open] <prompt> | judge [round] | pick <label> [round] | reveal [round] | show [round] | list | delete <round>` };
            } catch (error) {
              return { kind: 'error', text: error.message };
            }
          },
        }),
      'model arena command',
    );
  });
}
