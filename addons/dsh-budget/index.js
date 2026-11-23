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
import { checkRaise, createMeter, describe, missionWords, openRecord, readLimits } from './lib/meter.js';

export const name = 'dsh-budget';
export const inject = ['tools'];

export const DATA_PATH = '/dsh-budget/data';

export const Config = z.object({
  /** Master switch. */
  enabled: z.boolean().default(true).volatile(),
  /** Most requests to a model in one run made by the thread itself. 0 = no limit (helpers are then not limited either). */
  maxSteps: z.natural().default(300).volatile(),
  /** Most requests in one run made by helper agents (Deep research, Mission, sub-agents), counted apart so a long run is not cut by the thread's own limit. 0 = helpers share `maxSteps`, as before. */
  maxHelperSteps: z.natural().default(1500).volatile(),
  /** While a Mission is on (started with Start Mission or a typed /mission): most requests in one task, all of them (the Mission's own allowance; Mission has its own limits too). 0 = the ordinary limit. */
  maxLongSteps: z.natural().default(5000).volatile(),
  /** While a Mission is on: most tokens in one task. 0 = the ordinary limit. */
  maxLongTokens: z.natural().default(60000000).volatile(),
  /** Set by a first install only: the token limit below is the installer's starting value, not one the person chose, so a Mission's allowance may replace it. Saving the token limit on the Budget page clears it. */
  startingTokens: z.boolean().default(false).volatile(),
  /** Most tokens (sent plus received) in one task, helpers included. 0 = no limit. */
  maxTokens: z.natural().default(20000000).volatile(),
  /** Longest one task may run, in minutes. Time spent waiting for you counts. 0 = no limit. */
  maxMinutes: z.natural().default(0).volatile(),
  /** The same tool call this many times in a row is treated as a loop. 0 = no check. */
  maxRepeats: z.natural().default(8).volatile(),
  /** Most tokens in one day, over all threads. 0 = no limit. */
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
  /** Conversation -> the Mission allowance limit that stopped its run ({limit: 'steps' | 'tokens', max}). */
  const budgetStops = new Map();
  /** Whether the limit that stopped a Mission is higher now (or off). */
  const raisedSince = (stop) => {
    try {
      const now = meter.longAllowance();
      if (!now.enabled) return true;
      const max = stop.limit === 'tokens' ? now.tokens : now.steps;
      return !max || max > stop.max;
    } catch {
      return false;
    }
  };

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
  /** The Mission working in a conversation right now ('' when none, or paused, or an ordinary /mission run): only then its allowance applies. */
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
    let key = '';
    try {
      id = rootOf(payload?.agent?.session);
      key = id ? longKey(id) : '';
      hit = id ? meter.check(id, key) : null;
    } catch (error) {
      ctx.logger?.warn?.(`budget: could not check a step: ${String(error?.message ?? error)}`);
    }
    if (!hit) return next();
    if (hit.first) {
      const text = describe(hit, Boolean(key));
      // A Mission stopped by its own allowance: noted, so a Resume after the limit was raised starts afresh.
      if (key && (hit.limit === 'steps' || hit.limit === 'tokens')) budgetStops.set(id, { limit: hit.limit, max: hit.max });
      // `mission: true` marks a stop by a Mission's own allowance, so the card under the answer says what to do for a Mission.
      record.addStop({ sessionId: id, at: Date.now(), limit: hit.limit, used: hit.used, max: hit.max, text, ...(key ? { mission: true } : {}) });
      flush();
      ctx.logger?.info?.(`budget: stopped ${id}: ${text}`);
      // A Mission run in that conversation pauses and says which limit, rather than sitting there unexplained.
      // The third argument (stage E) says which limit and its value, so Mission can offer to raise it.
      try {
        const mission = ctx.get('mission');
        if (mission?.isRunning?.(id)) mission.budgetStopped?.(id, text, { limit: hit.limit, max: hit.max });
      } catch {
        /* the stop holds anyway */
      }
    }
    return Promise.resolve({ kind: 'reject' });
  });

  // A Mission that ended starts its next allowance from nothing. A resumed one keeps its count over the whole
  // run (a pause by you, an idle stall, step errors, a restart), except after a stop by its own allowance whose
  // limit was raised since: that one starts a fresh allowance. Resumed without raising it, it stops again.
  // A run that ended and is then continued (Mission stage C: answers to its questions after the end) is the same
  // run: its count comes back, kept here in memory from its end (so after an app restart a continue starts fresh).
  /** Conversation -> {runId, counts, stop} of the run that ended there last. */
  const ended = new Map();
  ctx.inject(['mission'], (inner) => {
    try {
      inner.effect(() => inner.mission.onEvent?.((event) => {
        const conversation = String(event?.conversation ?? '');
        if (event?.type === 'finished') {
          ended.delete(conversation);
          ended.set(conversation, { runId: String(event?.runId ?? ''), counts: meter.endRun(conversation), stop: budgetStops.get(conversation) });
          while (ended.size > 200) ended.delete(ended.keys().next().value);
          budgetStops.delete(conversation);
        } else if (event?.type === 'resumed' && event?.continued === true) {
          const kept = ended.get(conversation);
          ended.delete(conversation);
          if (kept && kept.runId && kept.runId === String(event?.runId ?? '') && kept.counts && !(kept.stop && raisedSince(kept.stop))) {
            meter.restoreRun(conversation, kept.counts);
            if (kept.stop) budgetStops.set(conversation, kept.stop);
          }
        } else if (event?.type === 'resumed') {
          const stop = budgetStops.get(conversation);
          if (stop && raisedSince(stop)) {
            budgetStops.delete(conversation);
            meter.endRun(conversation);
          }
        }
      }) ?? (() => {}), 'budget: Mission allowance');
    } catch (error) {
      ctx.logger?.warn?.(`budget: could not follow Mission's runs: ${String(error?.message ?? error)}`);
    }
  });

  /**
   * Raise a Mission's own allowance (Mission stage E): only after the owner's Allow in the Mission's card.
   * Budget checks the request itself: higher than now, at most 50,000 steps or 500,000,000 tokens, Budget guard on.
   * It writes `maxLongSteps` or `maxLongTokens` through the app's settings, as the Budget page does, so the owner
   * sees and can change it back there. A raise is a raise like one on the page: a run stopped by that limit and
   * then resumed starts a fresh allowance ('resumed' above).
   * @param {{limit: 'steps' | 'tokens', to: number}} request
   * @returns {Promise<{ok: true, from: number, to: number} | {ok: false, text: string}>}
   */
  const raiseMission = async (request) => {
    try {
      const now = meter.longAllowance();
      if (!now.enabled) return { ok: false, text: 'Budget guard is switched off, so there is no limit to raise.' };
      const checked = checkRaise(request, now);
      if (!checked.ok) return checked;
      const settings = ctx.get('settings');
      if (typeof settings?.mutate !== 'function') return { ok: false, text: 'The app\'s settings could not be reached.' };
      await settings.mutate('budget', [{ op: 'set', path: [checked.key], value: checked.to }]);
      return { ok: true, from: checked.from, to: checked.to };
    } catch (error) {
      return { ok: false, text: `The setting could not be saved (${String(error?.message ?? error).slice(0, 200)}).` };
    }
  };

  // What a Mission gets now, for Mission's pre-flight line; and the raise above.
  ctx.effect(() => ctx.provide('budgetGuard', Object.freeze({
    apiVersion: 1,
    longAllowance: () => {
      try {
        return meter.longAllowance();
      } catch {
        return undefined;
      }
    },
    raiseMission,
  })), 'budget: service');

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
            // Stops saved before Mission's stage B say "Long run": shown with today's name (kept as stored).
            const stops = record.stops().slice(0, 30).map((stop) => (stop && typeof stop.text === 'string' ? { ...stop, text: missionWords(stop.text) } : stop));
            res.end(JSON.stringify({ at: now, limits: limits(), today: record.today(now), biggest: record.biggest(now), stops }));
          },
        }),
      'budget: data route',
    );
  });
}
