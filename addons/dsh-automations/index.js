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
import { everyOf, openAlive, openNotes, recipeOf, targetOf, timingOf, BEAT_MS } from './lib/notes.js';
import * as recur from './lib/recur.js';
import { finalAnswer, MODE_ID, pickRuns, withAutomations } from './lib/mode.js';
import { keepDefault, occurrencesOf, openRuns, scheduledTasks } from './lib/runs.js';

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
  /**
   * Mission and Long runs (Long run part, step 54): alert when a run ends, needs your yes, or stops by itself.
   * Never per round. The alert names the project folder only, never the run's goal.
   */
  alertRuns: z.boolean().default(true).volatile(),
  /** Show alerts as notifications on this Mac. */
  mac: z.boolean().default(true).volatile(),
  /** Send alerts to your phone through ntfy. Needs a topic. */
  phone: z.boolean().default(false).volatile(),
  /** The ntfy server. */
  ntfyServer: z.string().default('https://ntfy.sh').volatile(),
  /** Your ntfy topic: the name your phone is subscribed to. Treat it like a password. */
  ntfyTopic: z.string().default('').volatile(),
  /**
   * Automations part, step A10: an automation deleted anywhere (its page, the assistant, or archiving
   * the conversation it writes into) is kept in the trash for 30 days, with Put back.
   */
  deletedToTrash: z.boolean().default(true).volatile(),
  /**
   * Step A11: runs older than an automation's keep rule leave the run list; for an automation that opens
   * a new conversation at every run, that run's conversation goes to the 30-day trash. A conversation
   * shared by several runs is never touched.
   */
  oldRunsToTrash: z.boolean().default(true).volatile(),
  /** Step A5: the Automations tab in the sidebar (a mode of the Modes add-on), with its own chat. */
  tab: z.boolean().default(true).volatile(),
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
    alertRuns: plain(config.alertRuns),
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
  const file = (name) => (typeof home === 'function' ? join(home('automations'), name) : '');
  // When the app was running (steps A2, A3): one beat a minute.
  let alive;
  try {
    alive = openAlive(file('alive.json'));
  } catch (error) {
    alive = openAlive('');
    warn(`could not read when the app last ran: ${String(error?.message ?? error)}`);
  }
  const beat = setInterval(() => {
    try {
      alive.beat();
    } catch {
      /* the next beat tries again */
    }
  }, BEAT_MS);
  beat.unref?.();
  ctx.effect(() => () => clearInterval(beat), 'automations: heartbeat');
  // Created-in tabs, own alerts and keep rules, and the recipes for Put back (A4, A10, A11, A17).
  let notes;
  try {
    notes = openNotes(file('tasks.json'));
  } catch (error) {
    notes = openNotes('');
    warn(`could not read the automations' notes: ${String(error?.message ?? error)}`);
  }
  const plainOf = (key) => plain(config[key]) !== false;
  const modeOf = (sessionId) => {
    try {
      return String(ctx.get('modes')?.get?.(sessionId) ?? '');
    } catch {
      return '';
    }
  };
  /** The tab a new conversation of a scheduled task opens in (Settings → Modes), for tasks with no known tab. */
  const scheduledTab = () => {
    try {
      const value = ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'modes')?.value?.scheduledMode;
      return typeof value === 'string' && value ? value : 'cowork';
    } catch {
      return 'cowork';
    }
  };
  /** Whether a conversation is isolated (Recon). Unknown counts as isolated: without Modes nothing is read. */
  const isolated = (sessionId) => {
    try {
      const modes = ctx.get('modes');
      if (typeof modes?.isolated !== 'function') return true;
      return modes.isolated(sessionId) !== false;
    } catch {
      return true;
    }
  };
  /** The tab an automation belongs to: where it was created, else its conversation's, else the scheduled tab. */
  const tabOf = (entry) => {
    const id = String(entry?.id ?? '');
    const made = notes.get(id).createdIn;
    if (made) return made;
    // Only a conversation that exists: a 'new_once' target is only reserved until its first run.
    const into = entry?.target?.kind === 'session' ? entry.target.sessionId : '';
    return (into && modeOf(into)) || scheduledTab();
  };
  /** A new automation's tab: the conversation that asked for it (the assistant's schedule tools record it). */
  const createdInOf = (entry) => {
    // The conversation that asked; never the one a 'new_once' automation only reserved for its first run.
    const reserved = entry?.target?.kind === 'new_once' ? entry.target.sessionId : '';
    for (const sessionId of Array.isArray(entry?.involvedSessionIds) ? entry.involvedSessionIds : []) {
      if (sessionId === reserved) continue;
      const mode = modeOf(sessionId);
      if (mode) return mode;
    }
    return '';
  };
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
  /** Task id -> its destination kind ('session', 'new_once', 'new'). */
  let targets = {};
  /** The latest list, for the page. */
  let lastCatalog = [];
  const readTasks = async () => {
    if (!schedule) return [];
    const catalog = await schedule.catalog();
    titles = Object.fromEntries(catalog.map((task) => [String(task.id), String(task.title ?? '')]));
    targets = Object.fromEntries(catalog.map((task) => [String(task.id), String(task.target?.kind ?? '')]));
    lastCatalog = catalog;
    try {
      const change = notes.take(catalog, createdInOf);
      if (change.removed.length > 0) void keepDeleted(change.removed);
    } catch (error) {
      warn(`could not compare the automations: ${String(error?.message ?? error)}`);
    }
    return catalog;
  };

  // ---- the trash: deleted automations (A10) and old runs' conversations (A11) ----------------

  let trashHandle;
  ctx.inject(['coworkTrash'], (inner) => {
    try {
      const handle = inner.coworkTrash.register({ owner: 'automations', label: 'Automations', putBack: (request) => putBack(request) });
      trashHandle = handle;
      // The trash's own part may still be starting: try what was held a little later.
      const later = setTimeout(retryHeld, 15000);
      later.unref?.();
      inner.effect(() => () => clearTimeout(later), 'automations: held deletions');
      inner.effect(() => () => {
        if (trashHandle === handle) trashHandle = undefined;
        handle.dispose();
      }, 'automations: trash');
    } catch (error) {
      warn(`the trash is not available: ${String(error?.message ?? error)}`);
    }
  });
  /**
   * Put a copy of each deleted automation in the trash, one row each. Never throws. One the trash cannot
   * take now (the Cowork sidebar is off or still starting) is held in `tasks.json` and tried again when
   * the trash is ready (review finding 3).
   */
  const keepDeleted = async (removed) => {
    if (!enabled() || !plainOf('deletedToTrash')) return;
    for (const recipe of removed) {
      if (!recipe || recipe.status === 'ended') continue;
      try {
        if (!trashHandle) {
          notes.hold(recipe);
          continue;
        }
        const { note = {}, ...kept } = recipe;
        const tab = note.createdIn || (kept.target?.kind === 'session' && kept.target.sessionId && modeOf(kept.target.sessionId)) || scheduledTab();
        await trashHandle.add({
          key: `task.${kept.id}`.slice(0, 100),
          title: `Automation: ${kept.title || 'untitled'}`.slice(0, 200),
          tab,
          data: { ownerData: { recipe: kept, tab, ...(note.alerts ? { alerts: note.alerts } : {}), ...(note.keep ? { keep: note.keep } : {}) } },
        });
        notes.release(recipe.id);
      } catch (error) {
        if (/not available|no longer registered/i.test(String(error?.message ?? ''))) notes.hold(recipe);
        warn(`a deleted automation could not be kept in the trash: ${String(error?.message ?? error)}`);
      }
    }
  };
  const retryHeld = () => {
    const held = notes.held();
    if (held.length > 0 && trashHandle) void keepDeleted(held);
  };
  /** Put back (from the trash): make each automation again. Its old delivery list cannot come back. */
  const putBack = async ({ data = [] } = {}) => {
    const done = [];
    const failed = [];
    const said = [];
    for (const piece of data) {
      const recipe = piece?.ownerData?.recipe;
      try {
        if (!schedule) throw new Error("the app's scheduler is not running");
        if (!recipe?.prompt) throw new Error('nothing was kept of it');
        const timing = timingOf(recipe);
        if (!timing) throw new Error('its time has passed: make it again with a new time');
        const base = { title: String(recipe.title || 'Automation').slice(0, 120), prompt: recipe.prompt, timing };
        let made;
        try {
          made = await schedule.create({ ...base, target: targetOf(recipe.target) });
        } catch (error) {
          // The conversation it wrote into is gone or archived: it opens a conversation of its own instead.
          if (recipe.target?.kind !== 'session') throw error;
          made = await schedule.create({ ...base, target: { kind: 'new_once', create: {} } });
          said.push(`"${base.title}" now opens a conversation of its own: the one it wrote into is archived or gone.`);
        }
        if (made?.id) {
          if (recipe.status === 'paused') {
            // It exists now: never report it as not put back, or a second Put back would make a copy (review finding 5).
            try {
              const paused = await schedule.edit({ id: made.id, action: 'update', patch: { active: false } });
              if (paused?.code) throw new Error(paused.code);
            } catch {
              said.push(`"${base.title}" is back but switched on: it was paused, and pausing it again did not work. Pause it on the Automations page.`);
            }
          }
          notes.setCreatedIn(made.id, piece.ownerData?.tab);
          if (piece.ownerData?.alerts) notes.setAlerts(made.id, piece.ownerData.alerts);
          if (piece.ownerData?.keep) notes.setKeep(made.id, piece.ownerData.keep);
        }
        done.push(piece.item);
      } catch (error) {
        failed.push({ item: piece?.item, reason: `It could not be made again: ${String(error?.message ?? error)}`.slice(0, 300) });
      }
    }
    void readTasks().catch(() => {});
    return { done, failed, notes: said };
  };
  /** Old runs leave the list; an own conversation of a 'new' automation goes to the trash. Never throws. */
  const keepFor = (taskId) => {
    const own = notes.get(taskId).keep;
    if (own) return own;
    const entry = lastCatalog.find((task) => String(task.id) === taskId);
    return keepDefault(everyOf(entry ?? notes.known()[taskId]));
  };
  let pruning = false;
  const prune = async () => {
    if (pruning || !enabled()) return;
    pruning = true;
    try {
      // Runs are dropped only when their conversations can go to the trash too (review finding 4).
      if (plainOf('oldRunsToTrash') && !trashHandle) return;
      const dropped = runs.prune(keepFor);
      if (!plainOf('oldRunsToTrash')) return;
      const byTask = new Map();
      for (const run of dropped) {
        // Never a conversation you went on with after the run (review finding 8).
        if (!run.own || run.touched || run.tasks?.length !== 1) continue;
        const id = String(run.tasks[0].id);
        byTask.set(id, [...(byTask.get(id) ?? []), run]);
      }
      for (const [taskId, list] of byTask) {
        const entry = lastCatalog.find((task) => String(task.id) === taskId);
        // Only for an automation that opens a new conversation at every run, checked again now.
        if (entry && entry.target?.kind !== 'new') continue;
        try {
          await trashHandle.add({
            key: `runs.${taskId}`.slice(0, 100),
            title: `Old runs: ${list[0].tasks[0].title || titles[taskId] || 'automation'}`.slice(0, 200),
            tab: entry ? tabOf(entry) : scheduledTab(),
            conversations: list.map((run) => ({ id: run.sessionId, archive: 'plus' })),
          });
        } catch (error) {
          warn(`old runs could not go to the trash: ${String(error?.message ?? error)}`);
        }
      }
    } catch (error) {
      warn(`could not tidy old runs: ${String(error?.message ?? error)}`);
    } finally {
      pruning = false;
    }
  };
  const pruneTimer = setInterval(() => void prune(), 6 * 60 * 60 * 1000);
  pruneTimer.unref?.();
  ctx.effect(() => () => clearInterval(pruneTimer), 'automations: old runs');
  let pruneSoon;
  const schedulePrune = () => {
    clearTimeout(pruneSoon);
    pruneSoon = setTimeout(() => void prune(), 5000);
    pruneSoon.unref?.();
  };
  ctx.effect(() => () => clearTimeout(pruneSoon), 'automations: tidy-up after a run');
  const firstPrune = setTimeout(() => void prune(), 60000);
  firstPrune.unref?.();
  ctx.effect(() => () => clearTimeout(firstPrune), 'automations: first tidy-up');
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

  /** Task id -> when Run now was pressed on this page (its run is never late). */
  const ranNowAt = new Map();
  /** Conversation id -> its turn in progress, for conversations that are not scheduled runs. */
  const turns = new Map();
  const minutesSince = (at) => (Date.now() - at) / 60000;

  /** An automation's own alert choices (A17); a run of several automations together uses the global ones. */
  const ownAlerts = (run) => (run?.tasks?.length === 1 ? notes.get(String(run.tasks[0].id)).alerts : undefined);

  /** A conversation started waiting for you. */
  const waiting = (id, kind, key) => {
    const run = runs.wait(id, kind, key);
    if (run) {
      void alerter.notify({ event: 'needs', scheduled: true, name: run.tasks.map((task) => task.title).filter(Boolean).join(', '), waiting: kind, own: ownAlerts(run) });
      return;
    }
    const turn = turns.get(id);
    if (turn && !runs.active(id) && !turn.asked) {
      turn.asked = true;
      void alerter.notify({ event: 'needs', scheduled: false, name: turn.project, waiting: kind, minutes: minutesSince(turn.at) });
    }
  };

  /** Whether a turn is a round of a running Mission or Long run (step 55): those alert once, at the run's end. */
  const roundOfRun = (id) => {
    try {
      return ctx.get('mission')?.isRunning?.(id) === true;
    } catch {
      return false;
    }
  };
  // Run alerts (step 54): a run's end, when it needs your yes, and when it stopped by itself.
  ctx.inject(['mission'], (inner) => {
    try {
      inner.effect(() => inner.mission.onEvent?.((event) => {
        if (!enabled()) return;
        // A Recon conversation's run is named only "Recon": its folder holds the conversation's id, and
        // an alert can go to an outside service (ntfy).
        let sealed = false;
        try {
          sealed = ctx.get('modes')?.isolated?.(event.conversation) === true;
        } catch {
          sealed = true;
        }
        const base = { scheduled: false, run: event.kind === 'long' ? 'long' : 'mission', name: sealed ? 'Recon' : event.folder ?? '' };
        if (event.type === 'finished') void alerter.notify({ ...base, event: 'finished' });
        else if (event.type === 'needs-you') void alerter.notify({ ...base, event: 'needs' });
        else if (event.type === 'stopped-by-itself') void alerter.notify({ ...base, event: 'failed', state: event.why === 'restart' ? 'restart' : 'failed' });
      }) ?? (() => {}), 'automations: run alerts');
    } catch (error) {
      warn(`run alerts are off: ${String(error?.message ?? error)}`);
    }
  });

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
          // You wrote in a run's own conversation after it ended: it is yours now, never trashed by age.
          if (ids.length === 0 && (data.source?.kind ?? 'user') === 'user') runs.touch(id);
          if (ids.length === 0 || runs.active(id)) break;
          // Run now (from this page) is never late, even when it waited for a busy conversation (review finding 7).
          const pressed = ids.length === 1 ? ranNowAt.get(ids[0]) : undefined;
          const due = Object.entries(occurrencesOf(data)).filter(([taskId, at]) => !(ranNowAt.has(taskId) && Math.abs(at - ranNowAt.get(taskId)) < 120000)).map(([, at]) => at);
          if (pressed !== undefined) ranNowAt.delete(ids[0]);
          const dueAt = due.length > 0 ? Math.min(...due) : undefined;
          runs.start({
            id: String(data.id ?? `${id}-${Date.now()}`),
            sessionId: id,
            steps: turns.get(id)?.steps,
            tasks: ids.map((taskId) => ({ id: taskId, title: titles[taskId] ?? '' })),
            dueAt,
            whenOpened: dueAt !== undefined && alive.closedAt(dueAt),
            target: ids.length === 1 ? targets[ids[0]] : '',
          });
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
            // Never a word of an isolated (Recon) conversation in the record (review finding 1).
            if (!isolated(id)) runs.text(id, blocks.map((block) => (block?.type === 'text' ? String(block.text ?? '') : '')).join('\n'));
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
            if (run.state === 'ok') void alerter.notify({ event: 'finished', scheduled: true, name: names, own: ownAlerts(run) });
            else if (run.state !== 'cancelled') void alerter.notify({ event: 'failed', scheduled: true, name: names, state: run.state, own: ownAlerts(run) });
            schedulePrune();
          } else if (turn && kind !== 'aborted' && !roundOfRun(id)) {
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

  // ---- the Automations tab (A5): kept in step with its switch ------------------------------------

  let tabProblem = '';
  let syncing = false;
  const syncMode = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const service = ctx.get('settings');
      const row = service?.describe?.().find((entry) => entry.ns === 'modes');
      if (!row) {
        tabProblem = 'The Modes add-on is not running, so there is no Automations tab.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        tabProblem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const on = enabled() && plainOf('tab');
      const ops = [];
      const next = withAutomations(row.value.extraModes, on);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate('modes', ops);
      tabProblem = '';
    } catch (error) {
      tabProblem = `The Automations tab could not be changed: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(tabProblem);
    } finally {
      syncing = false;
    }
  };
  void syncMode();
  const modeTimer = setInterval(() => void syncMode(), 3000);
  modeTimer.unref?.();
  ctx.effect(() => () => clearInterval(modeTimer), 'automations: the tab');

  // ---- automation_results (A22): what past runs said ------------------------------------------

  const resultsTool = {
    name: 'automation_results',
    description:
      'Read how your automations (scheduled tasks) ran: when each run started, how it ended, whether it ran late, and what it said at the end. ' +
      'Filter by automation name or id, by date, and by outcome. Set full to read each run\'s whole final answer (only for runs that opened a conversation of their own or wrote into a shared one; never Recon conversations).',
    parameters: {
      type: 'object',
      properties: {
        automation: { type: 'string', description: 'Part of the automation\'s name, or its id. Empty for all.' },
        since: { type: 'string', description: 'Only runs from this date or time on (ISO 8601, e.g. 2026-11-10). Default: the last 31 days.' },
        state: { type: 'string', enum: ['failed', 'finished', 'waiting', 'running'], description: 'Only runs that ended this way.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Most runs to return (default 10).' },
        full: { type: 'boolean', description: 'Read each run\'s whole final answer from its conversation.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      const picked = pickRuns(runs.list(), args ?? {});
      if (picked.length === 0) return { text: 'No run matches. Runs are recorded from the moment the Automations add-on was installed.' };
      const query = (() => {
        try {
          return ctx.get('sessionQuery');
        } catch {
          return undefined;
        }
      })();
      const lines = [];
      for (const run of picked) {
        const name = run.tasks.map((task) => task.title || titles[task.id] || task.id).join(', ');
        const head = `- ${name}: started ${new Date(run.startedAt).toISOString()}, ${run.state === 'ok' ? 'finished' : run.state}${run.late ? `, ran late (due ${new Date(run.dueAt).toISOString()}${run.whenOpened ? ', when the app opened' : ''})` : ''}${run.detail ? ` (${run.detail})` : ''}.`;
        if (isolated(run.sessionId)) {
          lines.push(head);
          continue;
        }
        let said = run.text ? `  Its last words: ${run.text}` : '';
        if (args?.full && query) {
          try {
            const log = await query.readSession(run.sessionId);
            const all = (log.events ?? []).filter((event) => Date.parse(event?.time ?? '') >= run.startedAt - 1000 && (!run.endedAt || Date.parse(event?.time ?? '') <= run.endedAt + 1000));
            const text = finalAnswer(all.length > 0 ? all : log.events);
            if (text) said = `  Its final answer:\n${text.slice(0, 6000)}`;
          } catch {
            /* the conversation may be in the trash or gone: keep the record's last words */
          }
        }
        lines.push(said ? `${head}\n${said}` : head);
      }
      return { text: lines.join('\n') };
    },
  };
  ctx.inject(['tools'], (inner) => inner.effect(() => inner.tools.register(resultsTool), 'automations: results tool'));

  // ---- the page's data ------------------------------------------------------------------------

  /** Times missed while the app was closed (A3): in each gap, every due time but the latest, which the app ran late. */
  const MISSED_DAYS = 7;
  const missedOf = (entry, now) => {
    if (entry?.status !== 'active' || entry.kind === 'at' || entry.kind === 'after') return [];
    const made = Date.parse(String(entry.createdAt ?? '')) || 0;
    const out = [];
    const since = now - MISSED_DAYS * 24 * 60 * 60 * 1000;
    for (const gap of alive.gaps()) {
      if (gap.to < since) continue;
      let times;
      try {
        // The app may have run up to a beat after the last beat: those times are not counted as missed.
        times = recur.occurrences(entry, Math.max(gap.from + BEAT_MS, made), gap.to, { max: 5000 });
      } catch {
        times = undefined;
      }
      if (!Array.isArray(times) || times.length < 2) continue;
      // Every time but the latest, which the app ran late; only those of the last 7 days (review finding 11).
      out.push(...times.slice(0, -1).filter((at) => at >= since));
    }
    return out.slice(-50);
  };
  const describeOf = (entry) => {
    try {
      return recur.describe(entry) || '';
    } catch {
      return '';
    }
  };

  const view = async () => {
    let tasks = [];
    const now = Date.now();
    try {
      tasks = (await readTasks()).map((task) => {
        const id = String(task.id);
        const note = notes.get(id);
        return {
          id,
          title: String(task.title ?? ''),
          status: String(task.status ?? 'active'),
          nextAt: task.status === 'active' ? task.scheduledAt : undefined,
          running: task.executionActive === true,
          deliveredAt: task.lastDelivery?.deliveredAt,
          kind: String(task.kind ?? ''),
          rule: describeOf(task),
          prompt: String(task.prompt ?? '').slice(0, 4000),
          target: String(task.target?.kind ?? ''),
          sessionId: task.target?.sessionId ? String(task.target.sessionId) : '',
          cwd: String(task.target?.create?.cwd ?? ''),
          updatedAt: task.updatedAt ?? null,
          tab: tabOf(task),
          createdIn: note.createdIn ?? '',
          alerts: note.alerts ?? {},
          keep: note.keep ?? null,
          keepDefault: keepDefault(everyOf(task)),
          missed: missedOf(task, now),
        };
      });
    } catch (error) {
      warn(`could not read the tasks: ${String(error?.message ?? error)}`);
    }
    const settings = alertSettings();
    const list = runs.list().map((run) => ({ ...run, tasks: run.tasks.map((task) => ({ ...task, title: task.title || titles[task.id] || '' })) }));
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const next = tasks.filter((task) => task.nextAt).map((task) => Date.parse(task.nextAt)).filter(Number.isFinite).sort((a, b) => a - b)[0];
    return {
      at: now,
      enabled: enabled(),
      scheduler: Boolean(schedule),
      trash: Boolean(trashHandle),
      tasks,
      runs: list,
      // The Automations tab's tiles (A5).
      tiles: {
        on: tasks.filter((task) => task.status === 'active').length,
        ranToday: list.filter((run) => run.startedAt >= today.getTime()).length,
        missed: tasks.reduce((sum, task) => sum + task.missed.length, 0),
        failed: list.filter((run) => run.startedAt >= today.getTime() - 6 * 24 * 60 * 60 * 1000 && (run.state === 'failed' || run.state === 'stopped')).length,
        nextAt: next,
      },
      closed: alive.gaps().slice(-5),
      settings: { deletedToTrash: plainOf('deletedToTrash'), oldRunsToTrash: plainOf('oldRunsToTrash'), tab: plainOf('tab') },
      tabProblem,
      creatorRuns: creatorRuns(),
      alerts: { ...settings, phoneProblem: settings.phone ? phoneProblem(settings) : '', ...alerter.status() },
    };
  };

  /**
   * The timeline (A16): one lane per automation over a day, a week or a month, with its runs (done,
   * failed, waiting), the times it missed, and the times still to come.
   */
  const SPANS = { day: 24 * 60 * 60 * 1000, week: 7 * 24 * 60 * 60 * 1000, month: 31 * 24 * 60 * 60 * 1000 };
  const timeline = (span, now = Date.now()) => {
    const width = SPANS[span] ?? SPANS.week;
    // Two thirds behind now, one third ahead.
    const from = now - Math.round((width * 2) / 3);
    const to = from + width;
    const record = runs.list();
    const lanes = [];
    for (const task of lastCatalog) {
      const id = String(task.id);
      const marks = [];
      for (const run of record) {
        if (run.startedAt < from || run.startedAt > to || !run.tasks.some((item) => String(item.id) === id)) continue;
        marks.push({ at: run.startedAt, kind: run.state === 'ok' ? 'done' : run.state === 'running' || run.state === 'waiting' ? run.state : 'failed', late: run.late === true });
      }
      for (const at of missedOf(task, now)) if (at >= from && at <= to) marks.push({ at, kind: 'missed' });
      let ahead = [];
      if (task.status === 'active') {
        try {
          ahead = recur.occurrences(task, now, to, { max: 200 }) ?? [];
        } catch {
          ahead = [];
        }
        if (ahead.length === 0 && task.scheduledAt && Date.parse(task.scheduledAt) <= to) ahead = [Date.parse(task.scheduledAt)];
      }
      for (const at of ahead) marks.push({ at, kind: 'upcoming' });
      if (marks.length === 0 && task.status !== 'active') continue;
      lanes.push({ id, title: String(task.title ?? ''), tab: tabOf(task), status: String(task.status ?? ''), marks: marks.sort((a, b) => a.at - b.at).slice(0, 400) });
    }
    return { span: SPANS[span] ? span : 'week', from, to, now, lanes };
  };

  /** Pause, resume or delete through the app, refusing when the task changed since the page read it (A6, A7). */
  const change = async (id, action, expectedUpdatedAt) => {
    if (!schedule) throw new Error("The app's scheduler is not running.");
    const request = action === 'delete'
      ? { id, action: 'delete' }
      : { id, action: 'update', patch: { active: action === 'resume' } };
    if (expectedUpdatedAt !== undefined) request.expectedUpdatedAt = expectedUpdatedAt;
    const result = await schedule.edit(request);
    if (result?.code === 'schedule_conflict') throw new Error('It was changed on another page meanwhile. Look again, then try once more.');
    if (result?.code === 'schedule_not_found') throw new Error('That automation is gone.');
    if (result?.code) throw new Error(`The app refused: ${result.code}`);
    await readTasks();
  };
  /** Change an automation's name or instruction (A7). */
  const editText = async (id, { title, prompt }, expectedUpdatedAt) => {
    if (!schedule) throw new Error("The app's scheduler is not running.");
    const patch = {};
    if (typeof title === 'string') {
      const clean = title.trim();
      if (!clean || clean.length > 120) throw new Error('A name of 1 to 120 characters.');
      patch.title = clean;
    }
    if (typeof prompt === 'string') {
      const clean = prompt.trim();
      if (!clean) throw new Error('The instruction cannot be empty.');
      if (clean.length > 20000) throw new Error('The instruction is too long (at most 20,000 characters).');
      patch.prompt = clean;
    }
    if (Object.keys(patch).length === 0) throw new Error('Nothing to change.');
    const result = await schedule.edit({ id, action: 'update', patch, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) });
    if (result?.code === 'schedule_conflict') throw new Error('It was changed on another page meanwhile. Look again, then try once more.');
    if (result?.code) throw new Error(`The app refused: ${result.code}`);
    await readTasks();
  };

  const runNow = async (id) => {
    if (!schedule) throw new Error('The app\'s scheduler is not running.');
    ranNowAt.set(id, Date.now());
    if (ranNowAt.size > 200) ranNowAt.delete(ranNowAt.keys().next().value);
    const result = await schedule.run({ id });
    if (result?.code === 'schedule_not_found') throw new Error('That task is gone.');
    if (result?.code === 'schedule_execution_pending') throw new Error('That task is already running.');
    if (result?.code) throw new Error(`The app refused: ${result.code}`);
  };

  // ---- Creator Plus's saved runs, offered here to run on a schedule (Creator Plus, the owner's answer of 16 November) ----

  /** The saved runs, when Creator Plus is installed and switched on (none otherwise). */
  const creatorRuns = () => {
    try {
      const list = ctx.get('creatorPlus')?.savedRuns?.();
      return Array.isArray(list) ? list.slice(0, 30).map((run) => ({ name: String(run?.name ?? ''), sentence: String(run?.sentence ?? '') })).filter((run) => run.name) : [];
    } catch {
      return [];
    }
  };
  /**
   * Schedule a saved run into a Creator Plus conversation: daily, or on ISO weekdays (1 = Monday), at a time
   * in the user's time zone. It runs as a Long run would and changes nothing in the real setup without
   * the user's yes (Creator Plus's own rules hold in that conversation).
   */
  const scheduleCreatorRun = async ({ name, sessionId, time, weekdays, timeZone }) => {
    if (!schedule) throw new Error("The app's scheduler is not running.");
    const creator = ctx.get('creatorPlus');
    const prompt = typeof creator?.savedRunPrompt === 'function' ? String(creator.savedRunPrompt(String(name ?? '')) ?? '') : '';
    if (!prompt) throw new Error('There is no such saved run, or Creator Plus is switched off.');
    const session = String(sessionId ?? '');
    if (!session) throw new Error('Which conversation?');
    if (String(ctx.get('modes')?.get?.(session) ?? '') !== 'creator-plus') throw new Error('A saved run goes only into a Creator Plus conversation.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time ?? ''))) throw new Error('A time like 09:00.');
    const zone = String(timeZone ?? '');
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
    } catch {
      throw new Error('An unknown time zone.');
    }
    if (!zone) throw new Error('An unknown time zone.');
    const days = [...new Set((Array.isArray(weekdays) ? weekdays : []).map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort();
    const timing = days.length === 0 || days.length === 7 ? { kind: 'daily', daily: { time, time_zone: zone } } : { kind: 'weekly', weekly: { time, time_zone: zone, weekdays: days } };
    const made = await schedule.create({ title: `Creator Plus: ${String(name)}`.slice(0, 120), prompt, timing, target: { kind: 'session', sessionId: session } });
    if (made?.code) throw new Error(`The app refused: ${made.code}`);
    if (made?.id) notes.setCreatedIn(made.id, 'creator-plus');
    await readTasks();
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
                  if (size > 65536) throw new Error('request too large');
                  chunks.push(chunk);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const id = String(body?.id ?? '');
                const expected = body?.expectedUpdatedAt === null || typeof body?.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : undefined;
                if (body?.action === 'timeline') {
                  await readTasks();
                  res.end(JSON.stringify({ ...(await view()), timeline: timeline(String(body.span ?? 'week')) }));
                  return;
                }
                if (body?.action === 'run') await runNow(id);
                else if (body?.action === 'test') sent = await alerter.test();
                else if (['pause', 'resume', 'delete'].includes(body?.action)) await change(id, body.action, expected);
                else if (body?.action === 'edit') await editText(id, { title: body.title, prompt: body.prompt }, expected);
                else if (body?.action === 'creatorRun') await scheduleCreatorRun(body);
                else if (body?.action === 'alerts' || body?.action === 'keep') {
                  if (!(await readTasks()).some((task) => String(task.id) === id)) throw new Error('That automation is gone.');
                  if (body.action === 'alerts') notes.setAlerts(id, body.alerts);
                  else notes.setKeep(id, body.keep ?? null);
                }
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
