/**
 * Host half of Usage ledger.
 *
 * Counts model requests and tokens per day, provider and model from the
 * `assistant/message` events of every Session. It stores numbers only: no
 * prompt, response or tool text, and no Session id.
 *
 * Data lives in one JSON file written atomically. Whether a model is "free"
 * is decided when the ledger is read, from the configured `freeModels`
 * patterns, so changing the list re-labels history.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import z from '@deepseek-ai/schemastery';

export const name = 'usage-ledger';

/** Counter fields kept per day and model. */
const FIELDS = ['requests', 'input', 'output', 'cacheRead', 'cacheWrite', 'reasoning'];

export const Config = z.object({
  enabled: z.boolean().default(true),
  retentionDays: z.number().min(1).max(3650).default(365),
  freeModels: z.array(z.string()).default([]),
  modelAliases: z.dict(z.string()).default({}),
  dataDir: z.string(),
  commandName: z.string().default('usage'),
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

/** Path of the read-only summary route the browser card reads. */
const SUMMARY_PATH = '/dsh-usage-ledger/summary';

/**
 * Local calendar day of a moment, as YYYY-MM-DD.
 * @param {Date} date - moment.
 * @returns {string} day key.
 */
function dayOf(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Compile a `*` wildcard pattern to a RegExp matching a whole `provider/model` id.
 * @param {string} pattern - wildcard pattern.
 * @returns {RegExp} matcher.
 */
function wildcard(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

/** @returns {{version: number, days: Record<string, Record<string, object>>}} an empty ledger. */
function emptyLedger() {
  return { version: 1, days: {} };
}

export function apply(ctx, config) {
  if (plain(config.enabled) === false) return;

  const dir = String(plain(config.dataDir) ?? '').trim() || String(ctx.get('dshHomePath')?.('usage-ledger') ?? '');
  if (!dir || !(dir.startsWith('/') || /^[A-Za-z]:[\\/]/.test(dir))) {
    throw new Error('usage-ledger: `dataDir` must be an absolute path (no dsh home folder was available as a default)');
  }
  const file = join(dir, 'usage-ledger.json');

  /**
   * Read the ledger from disk; a missing or unreadable file is an empty ledger.
   * @returns {{version: number, days: Record<string, Record<string, object>>}} ledger.
   */
  function load() {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      return emptyLedger(); // No file yet.
    }
    try {
      const data = JSON.parse(text);
      if (data && typeof data === 'object' && data.days && typeof data.days === 'object') return data;
    } catch {
      // Not valid JSON: handled below.
    }
    // A damaged file is kept aside, never overwritten, so its history can still be recovered by hand.
    const aside = `${file}.damaged-${Date.now()}`;
    try {
      renameSync(file, aside);
      ctx.logger.warn(`usage-ledger: ${file} could not be read; kept it as ${aside} and started a new ledger`);
    } catch (error) {
      ctx.logger.warn(`usage-ledger: ${file} could not be read or moved aside: ${error?.message ?? error}`);
    }
    return emptyLedger();
  }

  let ledger = load();
  let dirty = false;
  let timer;

  /** Write the ledger atomically. */
  function flush() {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty) return;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(ledger), { mode: 0o600 });
      renameSync(temp, file);
      dirty = false;
    } catch (error) {
      ctx.logger.warn(`usage-ledger: could not write ${file}: ${error?.message ?? error}`);
    }
  }

  /** Schedule a write soon; many events share one write. */
  function scheduleFlush() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(flush, 5000);
    timer.unref?.();
  }

  /** Drop days older than the retention window. */
  function prune() {
    const keep = Number(plain(config.retentionDays)) || 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - keep);
    const first = dayOf(cutoff);
    for (const day of Object.keys(ledger.days)) {
      if (day < first) {
        delete ledger.days[day];
        dirty = true;
      }
    }
  }
  prune();

  ctx.effect(() => () => flush(), 'usage-ledger flush');

  /**
   * Row key for a model: `provider/model`, with the model renamed by an alias entry.
   * @param {string} provider - provider route.
   * @param {string} model - model id.
   * @returns {string} key.
   */
  function keyOf(provider, model) {
    const aliases = plain(config.modelAliases) ?? {};
    return `${provider}/${aliases[model] ?? model}`;
  }

  /**
   * Add one request to today's ledger.
   * @param {string} key - provider/model key.
   * @param {object | undefined} usage - token usage, when reported.
   * @param {Date} when - moment of the request.
   */
  function record(key, usage, when) {
    const day = (ledger.days[dayOf(when)] ??= {});
    const row = (day[key] ??= Object.fromEntries(FIELDS.map((field) => [field, 0])));
    row.requests += 1;
    if (usage && typeof usage === 'object') {
      row.input += Number(usage.inputTokens) || 0;
      row.output += Number(usage.outputTokens) || 0;
      row.cacheRead += Number(usage.cacheReadTokens) || 0;
      row.cacheWrite += Number(usage.cacheWriteTokens) || 0;
      row.reasoning += Number(usage.reasoningTokens) || 0;
    }
    scheduleFlush();
  }

  // One `assistant/message` is one model request. Only live events count: an event
  // older than this start is a replay of history and is ignored.
  const startedAt = Date.now();
  ctx.on('session/event', (_session, event) => {
    try {
      if (event?.type !== 'assistant/message') return;
      const source = event.data?.message?.source;
      if (!source?.provider || !source?.model) return;
      const stamp = event.time ? new Date(event.time) : new Date();
      if (Number.isFinite(stamp.getTime()) && stamp.getTime() < startedAt - 5000) return;
      record(keyOf(source.provider, source.model), event.data.usage, Number.isFinite(stamp.getTime()) ? stamp : new Date());
    } catch (error) {
      ctx.logger.warn(`usage-ledger: could not count a request: ${error?.message ?? error}`);
    }
  });

  /**
   * Whether a provider/model key matches the configured free list.
   * @param {string} key - provider/model key.
   * @returns {boolean} true when free.
   */
  function isFree(key) {
    return (plain(config.freeModels) ?? []).some((pattern) => wildcard(String(pattern)).test(key));
  }

  /**
   * Summarize the last `days` days.
   * @param {number} days - how many days, including today.
   * @returns {{days: Array<object>, models: Array<object>, totals: object}} summary.
   */
  function summary(days = 30) {
    const count = Math.max(1, Math.min(3650, Math.floor(days)));
    const start = new Date();
    start.setDate(start.getDate() - (count - 1));
    const first = dayOf(start);
    const byModel = new Map();
    const totals = Object.fromEntries(FIELDS.map((field) => [field, 0]));
    const perDay = [];
    for (const day of Object.keys(ledger.days).sort()) {
      if (day < first) continue;
      const dayTotal = Object.fromEntries(FIELDS.map((field) => [field, 0]));
      for (const [key, row] of Object.entries(ledger.days[day])) {
        const into = byModel.get(key) ?? { model: key, free: isFree(key), ...Object.fromEntries(FIELDS.map((field) => [field, 0])) };
        for (const field of FIELDS) {
          into[field] += row[field] ?? 0;
          dayTotal[field] += row[field] ?? 0;
          totals[field] += row[field] ?? 0;
        }
        byModel.set(key, into);
      }
      perDay.push({ date: day, ...dayTotal });
    }
    return { days: perDay, models: [...byModel.values()].sort((a, b) => b.requests - a.requests), totals };
  }

  /** Clear every count. */
  function reset() {
    ledger = emptyLedger();
    dirty = true;
    flush();
  }

  /** Read-mostly ledger API for other plugins. */
  const usageLedger = Object.freeze({
    apiVersion: 1,
    /**
     * @param {{days?: number}} [options] - period.
     * @returns {object} summary by day and model, with totals and the free flag per model.
     */
    summary: (options = {}) => summary(options.days ?? 30),
    /** Clear every count. */
    reset,
  });
  ctx.effect(() => ctx.provide('usageLedger', usageLedger), 'usage-ledger service');

  // Read-only summary route for the browser card (client.js): behind the connection fence
  // (Host/Origin check and the login cookie), GET only. Numbers only, never prompt text.
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: SUMMARY_PATH,
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
            const asked = Number(new URL(req.url ?? '/', 'http://placeholder').searchParams.get('days'));
            const days = Number.isInteger(asked) && asked >= 1 && asked <= 365 ? asked : 30;
            res.statusCode = 200;
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            res.end(JSON.stringify({ at: Date.now(), period: days, ...summary(days) }));
          },
        }),
      'usage-ledger: GET summary route',
    );
  });

  const commandName = plain(config.commandName);
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Show model usage: requests and tokens per model; `reset` clears the counts',
            input: { hint: '[days|reset]' },
            handler: async ({ rawInput }) => {
              const arg = String(rawInput ?? '').trim().toLowerCase();
              if (arg === 'reset') {
                reset();
                return { kind: 'success', text: 'Usage counts cleared.' };
              }
              const days = arg ? Number(arg) : 30;
              if (!Number.isInteger(days) || days < 1) {
                return { kind: 'error', text: 'Usage: /usage [days] or /usage reset' };
              }
              const result = summary(days);
              if (result.models.length === 0) return { kind: 'success', text: `No requests recorded in the last ${days} days.` };
              const lines = result.models.map(
                (row) =>
                  `${row.model}${row.free ? ' (free)' : ''}: ${row.requests} requests, in ${row.input}, out ${row.output}` +
                  (row.cacheRead || row.cacheWrite ? `, cache ${row.cacheRead}/${row.cacheWrite}` : ''),
              );
              const t = result.totals;
              lines.push(`Total, last ${days} days: ${t.requests} requests, in ${t.input}, out ${t.output}`);
              return { kind: 'success', text: lines.join('\n') };
            },
          }),
        'usage-ledger command',
      );
    });
  }
}
