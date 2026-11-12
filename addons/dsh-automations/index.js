/**
 * Automations: did my scheduled tasks work, and does anything need me?
 *
 * The app's scheduler (Automation tasks) records only that a task's instruction reached a
 * conversation. This add-on follows the turn that instruction starts and records how it ended:
 * finished, failed, stopped, cancelled, or waiting for you. The record feeds the Automation runs
 * page, and alerts on this Mac and, when set up, on your phone.
 *
 * It only watches. It never answers for you, changes a task or touches a conversation; the one
 * thing it starts is a task you ask it to run again.
 *
 * Route: `GET/POST /dsh-automations/data`.
 */
import z from '@deepseek-ai/schemastery';
import { basename, join } from 'node:path';
import { createAlerter, phoneProblem, readAlertSettings } from './lib/alerts.js';
import { openRuns, scheduledTasks } from './lib/runs.js';

export const name = 'dsh-automations';

export const DATA_PATH = '/dsh-automations/data';

/** The tools through which the assistant asks you something. */
const ASKING_TOOLS = { ask_user_question: 'question', exit_plan_mode: 'plan-review' };

export const Config = z.object({
  /** Master switch: off records nothing and alerts nothing. */
  enabled: z.boolean().default(true).volatile(),
  /** Alert when a task fails or is stopped. */
  alertFailed: z.boolean().default(true).volatile(),
  /** Alert when a task waits for your approval, your answer or a plan review. */
  alertNeeds: z.boolean().default(true).volatile(),
  /** Alert when a task finishes. */
  alertFinished: z.boolean().default(false).volatile(),
  /** Also alert for conversations you started yourself, not only scheduled tasks. */
  alertOthers: z.boolean().default(false).volatile(),
  /** For those conversations: only when the task has run at least this many minutes. */
  othersMinutes: z.natural().default(2).volatile(),
  /** Show alerts as notifications on this Mac. */
  mac: z.boolean().default(true).volatile(),
  /** Send alerts to your phone through ntfy. Needs a topic. */
  phone: z.boolean().default(false).volatile(),
  /** The ntfy server. */
  ntfyServer: z.string().default('https://ntfy.sh').volatile(),
  /** Your ntfy topic: the name your phone is subscribed to. Treat it like a password. */
  ntfyTopic: z.string().default('').volatile(),
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
  const enabled = () => plain(config.enabled) !== false;
  const alertSettings = () => readAlertSettings({
    alertFailed: plain(config.alertFailed),
    alertNeeds: plain(config.alertNeeds),
    alertFinished: plain(config.alertFinished),
    alertOthers: plain(config.alertOthers),
    othersMinutes: plain(config.othersMinutes),
    mac: plain(config.mac),
    phone: plain(config.phone),
    ntfyServer: plain(config.ntfyServer),
    ntfyTopic: plain(config.ntfyTopic),
  });
  const warn = (text) => ctx.logger?.warn?.(`automations: ${text}`);

  const home = ctx.get('dshHomePath');
  const runs = openRuns(typeof home === 'function' ? join(home('automations'), 'runs.json') : '');
  try {
    runs.closeLeftovers();
  } catch (error) {
    warn(`could not tidy the record: ${String(error?.message ?? error)}`);
  }
  const alerter = createAlerter({ settings: alertSettings, warn });
  ctx.effect(() => () => {
    try {
      runs.flush();
    } catch {
      /* nothing more to do while closing */
    }
  }, 'automations: record');

  // ---- the app's scheduler: task names, the task list, run now ----------------------------

  let schedule;
  /** Task id -> its name. */
  let titles = {};
  const readTasks = async () => {
    if (!schedule) return [];
    const catalog = await schedule.catalog();
    titles = Object.fromEntries(catalog.map((task) => [String(task.id), String(task.title ?? '')]));
    return catalog;
  };
  ctx.inject(['schedule'], (inner) => {
    schedule = inner.schedule;
    void readTasks().catch(() => {});
    inner.on('schedule/changed', () => void readTasks().catch(() => {}));
    inner.effect(() => () => { schedule = undefined; }, 'automations: scheduler');
  });

  // ---- following conversations --------------------------------------------------------------

  const isHelper = (session) => session?.header?.origin === 'subagent';
  /** The conversation a session's work belongs to: itself, or the one that started it as a helper. */
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

  /** Conversation id -> its turn in progress, for conversations that are not scheduled runs. */
  const turns = new Map();
  const minutesSince = (at) => (Date.now() - at) / 60000;

  /** A conversation started waiting for you. */
  const waiting = (id, kind, key) => {
    const run = runs.wait(id, kind, key);
    if (run) {
      void alerter.notify({ event: 'needs', scheduled: true, name: run.tasks.map((task) => task.title).filter(Boolean).join(', '), waiting: kind });
      return;
    }
    const turn = turns.get(id);
    if (turn && !runs.active(id) && !turn.asked) {
      turn.asked = true;
      void alerter.notify({ event: 'needs', scheduled: false, name: turn.project, waiting: kind, minutes: minutesSince(turn.at) });
    }
  };

  // Events older than this start are history being read back, not work happening now.
  const startedAt = Date.now();
  ctx.on('session/event', (session, event) => {
    try {
      if (!enabled()) return;
      const at = event?.time ? new Date(event.time).getTime() : Date.now();
      if (Number.isFinite(at) && at < startedAt - 5000) return;
      const id = rootOf(session);
      if (!id) return;
      const helper = isHelper(session);
      const data = event?.data ?? {};
      switch (event?.type) {
        case 'turn/start':
          if (helper) break;
          if (turns.size > 500) turns.clear();
          turns.set(id, { at: Date.now(), steps: 0, project: session?.header?.cwd ? basename(String(session.header.cwd)) : '' });
          break;
        case 'user/message': {
          if (helper) break;
          const ids = scheduledTasks(data);
          if (ids.length === 0 || runs.active(id)) break;
          runs.start({ id: String(data.id ?? `${id}-${Date.now()}`), sessionId: id, steps: turns.get(id)?.steps, tasks: ids.map((taskId) => ({ id: taskId, title: titles[taskId] ?? '' })) });
          if (ids.some((taskId) => !titles[taskId])) void readTasks().then(() => runs.name(id, titles)).catch(() => {});
          break;
        }
        case 'step/start': {
          const turn = turns.get(id);
          if (turn) turn.steps += 1;
          runs.step(id);
          break;
        }
        case 'assistant/message': {
          const usage = data.usage;
          if (usage && typeof usage === 'object') runs.usage(id, (Number(usage.inputTokens) || 0) + (Number(usage.outputTokens) || 0));
          if (!helper) {
            const blocks = Array.isArray(data.message?.content) ? data.message.content : [];
            runs.text(id, blocks.map((block) => (block?.type === 'text' ? String(block.text ?? '') : '')).join('\n'));
          }
          break;
        }
        case 'approval/asked':
          waiting(id, 'approval', `approval:${String(data.id ?? '')}`);
          break;
        case 'approval/decided':
          runs.resume(id, `approval:${String(data.id ?? '')}`);
          break;
        case 'tool/call':
          if (!helper && ASKING_TOOLS[data.name]) waiting(id, ASKING_TOOLS[data.name], `call:${String(data.callId ?? '')}`);
          break;
        case 'tool/result':
          if (!helper) runs.resume(id, `call:${String(data.message?.toolCallId ?? '')}`);
          break;
        case 'turn/end': {
          if (helper) break;
          const turn = turns.get(id);
          turns.delete(id);
          const run = runs.end(id, data.reason);
          const kind = String(data.reason?.kind ?? '');
          if (run) {
            const names = run.tasks.map((task) => task.title).filter(Boolean).join(', ');
            if (run.state === 'ok') void alerter.notify({ event: 'finished', scheduled: true, name: names });
            else if (run.state !== 'cancelled') void alerter.notify({ event: 'failed', scheduled: true, name: names, state: run.state });
          } else if (turn && kind !== 'aborted') {
            const what = { scheduled: false, name: turn.project, minutes: minutesSince(turn.at) };
            if (kind === 'completed') void alerter.notify({ ...what, event: 'finished' });
            else void alerter.notify({ ...what, event: 'failed', state: kind === 'blocked' ? 'stopped' : 'failed' });
          }
          break;
        }
        default:
      }
    } catch (error) {
      warn(`could not follow an event: ${String(error?.message ?? error)}`);
    }
  });

  // ---- the page's data ------------------------------------------------------------------------

  const view = async () => {
    let tasks = [];
    try {
      tasks = (await readTasks()).map((task) => ({
        id: String(task.id),
        title: String(task.title ?? ''),
        status: String(task.status ?? 'active'),
        nextAt: task.status === 'active' ? task.scheduledAt : undefined,
        running: task.executionActive === true,
        deliveredAt: task.lastDelivery?.deliveredAt,
      }));
    } catch (error) {
      warn(`could not read the tasks: ${String(error?.message ?? error)}`);
    }
    const settings = alertSettings();
    return {
      at: Date.now(),
      enabled: enabled(),
      scheduler: Boolean(schedule),
      tasks,
      runs: runs.list().map((run) => ({ ...run, tasks: run.tasks.map((task) => ({ ...task, title: task.title || titles[task.id] || '' })) })),
      alerts: { ...settings, phoneProblem: settings.phone ? phoneProblem(settings) : '', ...alerter.status() },
    };
  };

  const runNow = async (id) => {
    if (!schedule) throw new Error('The app\'s scheduler is not running.');
    const result = await schedule.run({ id });
    if (result?.code === 'schedule_not_found') throw new Error('That task is gone.');
    if (result?.code === 'schedule_execution_pending') throw new Error('That task is already running.');
    if (result?.code) throw new Error(`The app refused: ${result.code}`);
  };

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: DATA_PATH,
          handler: async (req, res) => {
            const refused = inner.connection.requestRejection(req);
            if (refused !== undefined) {
              res.statusCode = refused;
              res.end();
              return;
            }
            if (req.method !== 'GET' && req.method !== 'POST') {
              res.statusCode = 405;
              res.setHeader('allow', 'GET, POST');
              res.end();
              return;
            }
            res.setHeader('content-type', 'application/json; charset=utf-8');
            res.setHeader('cache-control', 'no-store');
            try {
              let sent;
              if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 8192) throw new Error('request too large');
                  chunks.push(chunk);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (body?.action === 'run') await runNow(String(body.id ?? ''));
                else if (body?.action === 'test') sent = await alerter.test();
                else throw new Error('unknown action');
              }
              res.end(JSON.stringify({ ...(await view()), ...(sent ? { sent } : {}) }));
            } catch (error) {
              res.statusCode = req.method === 'POST' ? 400 : 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
            }
          },
        }),
      'automations: data route',
    );
  });
}
