/**
 * Budget guard: hard limits that stop a task that is running away.
 *
 * A task is one turn of a conversation: everything the assistant does after one message, with the
 * work of its helper agents counted in. The guard counts the task's steps (requests to a model; the
 * conversation's own and its helpers' apart, so a long Deep research or Mission run is not cut by the
 * limit meant for a runaway conversation),
 * tokens and minutes, and watches for the same tool call repeated in a row. At a limit it refuses
 * the task's next step, which ends the turn; the conversation is untouched and the next message
 * starts a fresh allowance. The limit is enforced here, by the program: the model is never asked
 * to keep to it.
 *
 * Route: `GET /dsh-budget/data`.
 */
import z from '@deepseek-ai/schemastery';
import { join } from 'node:path';
import { createMeter, describe, openRecord, readLimits } from './lib/meter.js';

export const name = 'dsh-budget';
export const inject = ['tools'];

export const DATA_PATH = '/dsh-budget/data';

export const Config = z.object({
  /** Master switch. */
  enabled: z.boolean().default(true).volatile(),
  /** Most requests to a model in one task made by the conversation itself. 0 = no limit (helpers are then not limited either). */
  maxSteps: z.natural().default(300).volatile(),
  /** Most requests in one task made by helper agents (Deep research, Mission, sub-agents), counted apart so a long run is not cut by the conversation's own limit. 0 = helpers share `maxSteps`, as before. */
  maxHelperSteps: z.natural().default(1500).volatile(),
  /** While a Mission Long run is on: most requests in one task, all of them (the Long run's own allowance; Mission has its own limits too). 0 = the ordinary limit. */
  maxLongSteps: z.natural().default(5000).volatile(),
  /** While a Mission Long run is on: most tokens in one task. 0 = the ordinary limit. */
  maxLongTokens: z.natural().default(60000000).volatile(),
  /** Set by a first install only: the token limit below is the installer's starting value, not one the person chose, so a Long run's allowance may replace it. Saving the token limit on the Budget page clears it. */
  startingTokens: z.boolean().default(false).volatile(),
  /** Most tokens (sent plus received) in one task, helpers included. 0 = no limit. */
  maxTokens: z.natural().default(20000000).volatile(),
  /** Longest one task may run, in minutes. Time spent waiting for you counts. 0 = no limit. */
  maxMinutes: z.natural().default(0).volatile(),
  /** The same tool call this many times in a row is treated as a loop. 0 = no check. */
  maxRepeats: z.natural().default(8).volatile(),
  /** Most tokens in one day, over all conversations. 0 = no limit. */
  dayTokens: z.natural().default(0).volatile(),
});

function plain(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const limits = () => readLimits({
    enabled: plain(config.enabled),
    maxSteps: plain(config.maxSteps),
    maxHelperSteps: plain(config.maxHelperSteps),
    maxLongSteps: plain(config.maxLongSteps),
    maxLongTokens: plain(config.maxLongTokens),
    maxTokens: plain(config.maxTokens),
    startingTokens: plain(config.startingTokens),
    maxMinutes: plain(config.maxMinutes),
    maxRepeats: plain(config.maxRepeats),
    dayTokens: plain(config.dayTokens),
  });
  const home = ctx.get('dshHomePath');
  const record = openRecord(typeof home === 'function' ? join(home('budget'), 'budget.json') : '');
  const meter = createMeter({ limits, record });

  const flush = () => {
    try {
      record.flush();
    } catch (error) {
      ctx.logger?.warn?.(`budget: could not save the record: ${String(error?.message ?? error)}`);
    }
  };
  const timer = setInterval(flush, 15000);
  timer.unref?.();
  ctx.effect(() => () => { clearInterval(timer); flush(); }, 'budget: record');

  /** The conversation a session's work is counted under: itself, or the one that started it as a helper. */
  const rootOf = (session) => {
    let header = session?.header ?? {};
    const seen = new Set();
    while (header.origin === 'subagent' && typeof header.parentSession === 'string' && !seen.has(header.id)) {
      seen.add(header.id);
      let parent;
      try {
        parent = ctx.get('sessions')?.get?.(header.parentSession);
      } catch {
        parent = undefined;
      }
      if (!parent?.header) return header.parentSession;
      header = parent.header;
    }
    return String(header.id ?? session?.id ?? '');
  };
  const isHelper = (session) => session?.header?.origin === 'subagent';
  /** The Long run working in a conversation right now ('' when none, or paused, or an ordinary /mission run): only then its allowance applies. */
  const longKey = (id) => {
    try {
      return id ? String(ctx.get('mission')?.longRunId?.(id) ?? '') : '';
    } catch {
      return '';
    }
  };

  // Events older than this start are history being read back, not work happening now.
  const startedAt = Date.now();
  ctx.on('session/event', (session, event) => {
    try {
      const at = event?.time ? new Date(event.time).getTime() : Date.now();
      if (Number.isFinite(at) && at < startedAt - 5000) return;
      const id = rootOf(session);
      if (!id) return;
      switch (event?.type) {
        case 'turn/start':
          if (!isHelper(session)) meter.startTask(id);
          break;
        case 'step/start':
          meter.step(id, isHelper(session), longKey(id));
          break;
        case 'assistant/message': {
          const usage = event.data?.usage;
          if (usage && typeof usage === 'object') meter.usage(id, (Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0), longKey(id));
          break;
        }
        case 'turn/end':
          if (!isHelper(session)) meter.endTask(id);
          break;
        default:
      }
    } catch (error) {
      ctx.logger?.warn?.(`budget: could not count an event: ${String(error?.message ?? error)}`);
    }
  });

  // The stop itself: at a limit, the task's next step is refused, for the conversation and its helpers.
  ctx.on('agent/pre-step', (payload, next) => {
    let hit = null;
    let id = '';
    try {
      id = rootOf(payload?.agent?.session);
      hit = id ? meter.check(id, longKey(id)) : null;
    } catch (error) {
      ctx.logger?.warn?.(`budget: could not check a step: ${String(error?.message ?? error)}`);
    }
    if (!hit) return next();
    if (hit.first) {
      record.addStop({ sessionId: id, at: Date.now(), limit: hit.limit, used: hit.used, max: hit.max, text: describe(hit) });
      flush();
      ctx.logger?.info?.(`budget: stopped ${id}: ${describe(hit)}`);
    }
    return Promise.resolve({ kind: 'reject' });
  });

  // The loop check: the same tool call, again and again.
  ctx.effect(() => ctx.tools.guard((exec) => {
    try {
      const session = exec?.agent?.session;
      const id = rootOf(session);
      if (!id) return undefined;
      return meter.tool(id, String(session?.id ?? id), exec.name, exec.arguments);
    } catch {
      return undefined;
    }
  }), 'budget: loop check');

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: DATA_PATH,
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
            const now = Date.now();
            res.end(JSON.stringify({ at: now, limits: limits(), today: record.today(now), biggest: record.biggest(now), stops: record.stops().slice(0, 30) }));
          },
        }),
      'budget: data route',
    );
  });
}
