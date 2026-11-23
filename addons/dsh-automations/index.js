/**
 * Automations: did my scheduled tasks work, and does anything need me?
 *
 * The app's scheduler (Automation tasks) records only that a task's instruction reached a
 * thread. This add-on follows the turn that instruction starts and records how it ended:
 * finished, failed, stopped, cancelled, or waiting for you. The record feeds the Automation runs
 * page, and alerts on this Mac and, when set up, on your phone.
 *
 * It only watches. It never answers for you or touches a thread, and changes a task (its name,
 * instruction, on/off or preset) only when you click on its page; the one thing it starts is a task you
 * ask it to run again.
 *
 * Route: `GET/POST /dsh-automations/data`.
 */
import z from '@deepseek-ai/schemastery';
import { realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createAlerter, phoneProblem, readAlertSettings } from './lib/alerts.js';
import { didNotStart, everyOf, ranUnrecorded, openAlive, openNotes, recipeOf, targetOf, timingOf, BEAT_MS } from './lib/notes.js';
import * as recur from './lib/recur.js';
import { finalAnswer, MODE_ID, pickRuns, withAutomations } from './lib/mode.js';
import { keepDefault, occurrencesOf, openRuns, scheduledTasks } from './lib/runs.js';
import { DEFAULT_CHOICE, choiceNote, defaultChoice, presetChoices, presetInfo, presetName, presetOfTask, targetWithPreset } from './lib/preset.js';
import { GUARDED_RUN_SPACES, RUN_SPACES, SEALED_NAME, checkText, createWords, guardWatch, guardedRefusal, guestOf, placePolicy, plainError, presetFor, runPlaceOf, runTabFor, scheduleProblem, scheduledIds, sealedOf } from './lib/create.js';
import { firstRun, planOf, previewOf, shortWhen, zoneOf } from './lib/when.js';

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
  /** Also alert for threads you started yourself, not only automations. */
  alertOthers: z.boolean().default(false).volatile(),
  /** For those threads: only when the task has run at least this many minutes. */
  othersMinutes: z.natural().default(2).volatile(),
  /**
   * Missions (step 54): alert when a run ends, needs your yes, or stops by itself.
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
   * the thread it writes into) is kept in the trash for 30 days, with Put back.
   */
  deletedToTrash: z.boolean().default(true).volatile(),
  /**
   * Step A11: runs older than an automation's keep rule leave the run list; for an automation that opens
   * a new thread at every run, that run's thread goes to the 30-day trash. A thread
   * shared by several runs is never touched.
   */
  oldRunsToTrash: z.boolean().default(true).volatile(),
  /** Step A5: the Automations mode in Chat's Mode list (a mode of the Modes add-on), with its own thread. */
  tab: z.boolean().default(true).volatile(),
  /** Item 6: the clock button "Schedule this…" next to Send in every chat box. */
  scheduleButton: z.boolean().default(true).volatile(),
  /**
   * Item 6: new threads of an automation made with the clock button or New open in the automation's mode. Off: in
   * Settings → Modes → Mode for automations, as before. Automations the assistant or Finance made are not affected.
   */
  runsInTheirTab: z.boolean().default(true).volatile(),
  /**
   * Item 6 (the owner's answer of 21 November 2026): scheduling from Recon, with the clock button and with the assistant's
   * schedule tools there (Tool access can grant those). On by default, with a warning; off takes both away.
   */
  scheduleFromRecon: z.boolean().default(true).volatile(),
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
  /**
   * The tab a new thread of a scheduled task opens in (Settings → Modes), for tasks with no known tab. Kept for
   * 1 s: the page's answer asks for it for every automation, and reading the settings is not free (lab finding).
   */
  const CACHE_MS = Math.max(0, Number(process.env.DSH_AUTOMATIONS_CACHE_MS ?? 1000) || 0);
  const scheduledCache = { at: 0, value: 'cowork' };
  const scheduledTab = () => {
    if (Date.now() - scheduledCache.at < CACHE_MS) return scheduledCache.value;
    let value;
    try {
      value = ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'modes')?.value?.scheduledMode;
    } catch {
      value = undefined;
    }
    scheduledCache.at = Date.now();
    scheduledCache.value = typeof value === 'string' && value ? value : 'cowork';
    return scheduledCache.value;
  };
  /** Whether a thread is isolated (Recon). Unknown counts as isolated: without Modes nothing is read. */
  const isolated = (sessionId) => {
    try {
      const modes = ctx.get('modes');
      if (typeof modes?.isolated !== 'function') return true;
      return modes.isolated(sessionId) !== false;
    } catch {
      return true;
    }
  };
  /**
   * Item 4A, stage 6a: what Modes says about a thread's space (STAGE6A-DESIGN.md 2.6, copied: no import across add-ons).
   * No Modes: not sealed, no space (as today); a Modes that throws: fail closed.
   */
  const NO_GUARD = Object.freeze({ top: '', space: '', mode: '', sealed: false, sealedBy: '', reconSpace: false, guardedBy: '', noPrograms: false, homeMode: false, fresh: false, unknownTop: false, legacy: true, absent: true });
  const ERROR_GUARD = Object.freeze({ top: '', space: '', mode: '', sealed: true, sealedBy: '', reconSpace: false, guardedBy: 'unknown', noPrograms: true, homeMode: false, fresh: false, unknownTop: true, legacy: true });
  const guardOf = (id) => {
    let m;
    try {
      m = ctx.get('modes');
    } catch {
      return NO_GUARD;
    }
    if (!m) return NO_GUARD;
    try {
      if (typeof m.guardOf === 'function') return m.guardOf(String(id ?? '')) ?? ERROR_GUARD;
      const mode = String(m.get?.(id) ?? '');
      const isSealed = m.isolated?.(id) === true;
      const space = String(m.spaces?.of?.(id) ?? '');
      const reconSpace = space === 'recon' || (mode === 'recon' && isSealed);
      return { top: String(id ?? ''), space, mode, sealed: isSealed, sealedBy: reconSpace ? 'recon' : isSealed ? 'mode' : '', reconSpace, guardedBy: space === 'devices' || space === 'workshop' ? space : '', noPrograms: isSealed || ['devices', 'recon', 'workshop'].includes(space), homeMode: ['recon', 'bench', 'creator-plus'].includes(mode), fresh: false, unknownTop: false, legacy: true };
    } catch {
      return ERROR_GUARD;
    }
  };
  /** Item 4A, stage 6b: the five spaces a thread can be in. */
  const SPACE_FIVE = ['chat', 'code', 'devices', 'recon', 'workshop'];
  /** Stage 6b (G10): the tab id that stands for a space in the trash (as the Cowork sidebar reads it). Recon never. */
  const SPACE_TAB = Object.freeze({ chat: 'chat', code: 'code', devices: 'bench', workshop: 'creator-plus' });
  /**
   * Item 4A, stage 6b (J15, J17): who made an automation, from the thread that asked: `createdIn` its mode (a Recon-space
   * thread: 'recon', so `isolatedTab` seals it whatever the mode, as in 6a); `createdSpace` its space; `createdBy` the
   * thread. Devices and Workshop no longer go into `createdIn` (6a refused automations there). A guarded space is
   * recorded only for a guest there: a home mode (Creator Plus at home in Workshop) keeps today's behaviour, so its
   * automations are never watched or paused as a guest's (review finding, point 26).
   */
  const createdOf = (sessionId) => {
    if (!sessionId) return { createdIn: '', createdSpace: '', createdBy: '' };
    const guard = guardOf(sessionId);
    const recon = guard.reconSpace === true;
    const space = recon ? 'recon' : String(guard.space ?? '');
    const homeOfGuarded = GUARDED_RUN_SPACES.includes(space) && guestOf(guard) !== space;
    return { createdIn: recon ? 'recon' : modeOf(sessionId), createdSpace: SPACE_FIVE.includes(space) && !homeOfGuarded ? space : '', createdBy: String(sessionId) };
  };
  /** The tab an automation belongs to: where it was created, else its thread's, else the scheduled tab. */
  const tabOf = (entry) => {
    const id = String(entry?.id ?? '');
    const made = notes.get(id).createdIn;
    if (made) return made;
    // Only a thread that exists: a 'new_once' target is only reserved until its first run.
    const into = entry?.target?.kind === 'session' ? entry.target.sessionId : '';
    return (into && modeOf(into)) || scheduledTab();
  };
  /**
   * A new automation's tab: the thread that asked for it (the assistant's schedule tools record it). Stage 6b:
   * `{createdIn, createdSpace, createdBy}` (createdOf), '' when no thread says.
   */
  const createdInOf = (entry) => {
    // The thread that asked; never the one a 'new_once' automation only reserved for its first run.
    const reserved = entry?.target?.kind === 'new_once' ? entry.target.sessionId : '';
    for (const sessionId of Array.isArray(entry?.involvedSessionIds) ? entry.involvedSessionIds : []) {
      if (sessionId === reserved) continue;
      const made = createdOf(sessionId);
      if (made.createdIn || made.createdSpace) return made;
    }
    return '';
  };
  // ---- item 6: tabs, Recon sealing ------------------------------------------------------------
  /** The tabs that are switched on (Modes' list); [] when Modes cannot say. */
  const tabCache = { at: 0, list: [] };
  const tabList = () => {
    // Kept for 1 s, as above: one page answer asks for it many times.
    if (Date.now() - tabCache.at < CACHE_MS) return tabCache.list;
    let list;
    try {
      const read = ctx.get('modes')?.list?.();
      list = Array.isArray(read) ? read.filter((mode) => mode && typeof mode.id === 'string') : [];
    } catch {
      list = [];
    }
    tabCache.at = Date.now();
    tabCache.list = list;
    return list;
  };
  /** Whether a tab is isolated (Recon). An older Modes does not say: Recon and its held modes count. */
  const isolatedTab = (tab) => {
    const id = String(tab ?? '');
    if (!id) return false;
    const mode = tabList().find((entry) => entry.id === id);
    if (typeof mode?.isolated === 'boolean') return mode.isolated;
    return id === 'recon' || id.startsWith('isolated-');
  };
  const tabLabel = (tab) => {
    const id = String(tab ?? '');
    const label = tabList().find((entry) => entry.id === id)?.label;
    return typeof label === 'string' && label.trim() ? label.trim() : id ? id.charAt(0).toUpperCase() + id.slice(1) : '';
  };
  /** Whether an automation's name must stay inside Recon (computed; also for automations made before item 6). */
  const sealed = (entry, note = notes.get(String(entry?.id ?? ''))) => {
    try {
      return sealedOf({ entry, createdIn: note?.createdIn ?? '', createdSpace: note?.createdSpace ?? '', isolated, isolatedTab });
    } catch {
      return true;
    }
  };
  /** Whether any automation of a run is sealed. */
  const sealedRun = (run) => (run?.tasks ?? []).some((task) => {
    const id = String(task?.id ?? '');
    const entry = lastCatalog.find((item) => String(item.id) === id) ?? notes.known()[id];
    return entry ? sealed(entry) : isolatedTab(notes.get(id).createdIn) || notes.get(id).createdSpace === 'recon' || isolated(String(run?.sessionId ?? ''));
  });
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
  /** Item 4A, stage 6b: a `schedule/changed` came after the last read (a run's thread is placed from current notes). */
  let tasksStale = true;
  const readTasks = async () => {
    if (!schedule) return [];
    tasksStale = false;
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
    // Item 6: the tab-gone guard looks at every fresh list (and once a minute, below).
    void guardTabs().catch(() => {});
    return catalog;
  };

  // ---- the trash: deleted automations (A10) and old runs' threads (A11) ----------------

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
        // Item 6: an automation of Recon never goes to the shared trash (its name and instruction would be listed there).
        if (sealed(recipe, recipe.note ?? {})) {
          notes.release(recipe.id);
          continue;
        }
        if (!trashHandle) {
          notes.hold(recipe);
          continue;
        }
        const { note = {}, ...kept } = recipe;
        const tab = note.createdIn || (kept.target?.kind === 'session' && kept.target.sessionId && modeOf(kept.target.sessionId)) || scheduledTab();
        // Item 4A, stage 6b (G10): the trash lists it under the space it was made in (the tab id that stands for it).
        const shownTab = SPACE_TAB[note.createdSpace] ?? tab;
        await trashHandle.add({
          key: `task.${kept.id}`.slice(0, 100),
          title: `Automation: ${kept.title || 'untitled'}`.slice(0, 200),
          tab: shownTab,
          data: { ownerData: { recipe: kept, tab, ...(note.createdSpace ? { createdSpace: note.createdSpace } : {}), ...(note.alerts ? { alerts: note.alerts } : {}), ...(note.keep ? { keep: note.keep } : {}) } },
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
          made = await createTask({ ...base, target: targetOf(recipe.target) });
        } catch (error) {
          // The thread it wrote into is gone or archived: it opens a thread of its own instead.
          if (recipe.target?.kind !== 'session') throw error;
          // Item 6: never for a Recon thread: a new thread would carry its instruction out of Recon.
          if (isolated(String(recipe.target.sessionId ?? '')) || isolatedTab(piece.ownerData?.tab)) throw new Error('Not put back: it wrote into a Recon thread that is gone.');
          made = await createTask({ ...base, target: { kind: 'new_once', create: {} } });
          said.push(`"${base.title}" now opens a thread of its own: the one it wrote into is archived or gone.`);
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
          if (piece.ownerData?.createdSpace) notes.setCreatedSpace(made.id, piece.ownerData.createdSpace);
          if (piece.ownerData?.alerts) notes.setAlerts(made.id, piece.ownerData.alerts);
          if (piece.ownerData?.keep) notes.setKeep(made.id, piece.ownerData.keep);
        }
        done.push(piece.item);
      } catch (error) {
        const said = String(error?.message ?? error);
        failed.push({ item: piece?.item, reason: (said.startsWith('Not put back') ? said : `It could not be made again: ${said}`).slice(0, 300) });
      }
    }
    void readTasks().catch(() => {});
    return { done, failed, notes: said };
  };
  /** Old runs leave the list; an own thread of a 'new' automation goes to the trash. Never throws. */
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
      // Runs are dropped only when their threads can go to the trash too (review finding 4).
      if (plainOf('oldRunsToTrash') && !trashHandle) return;
      const dropped = runs.prune(keepFor);
      // Stage 7 (point 29): a run that leaves the list still counts as a run of its automation.
      // A held run is not a run (nothing ran), so a one-time automation it belonged to stays "Did not start".
      for (const run of dropped) if (run.held !== true) for (const one of run.tasks ?? []) notes.markRan(String(one.id));
      if (!plainOf('oldRunsToTrash')) return;
      const byTask = new Map();
      for (const run of dropped) {
        // Never a thread you went on with after the run (review finding 8).
        if (!run.own || run.touched || run.tasks?.length !== 1) continue;
        const id = String(run.tasks[0].id);
        byTask.set(id, [...(byTask.get(id) ?? []), run]);
      }
      for (const [taskId, list] of byTask) {
        const entry = lastCatalog.find((task) => String(task.id) === taskId);
        // Only for an automation that opens a new thread at every run, checked again now.
        if (entry && entry.target?.kind !== 'new') continue;
        try {
          await trashHandle.add({
            key: `runs.${taskId}`.slice(0, 100),
            title: `Old runs: ${(entry ? sealed(entry) : sealedRun(list[0])) ? SEALED_NAME : list[0].tasks[0].title || titles[taskId] || 'automation'}`.slice(0, 200),
            tab: entry ? tabOf(entry) : scheduledTab(),
            threads: list.map((run) => ({ id: run.sessionId, archive: 'plus' })),
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
    inner.on('schedule/changed', () => {
      tasksStale = true;
      void readTasks().catch(() => {});
    });

    inner.effect(() => () => { schedule = undefined; }, 'automations: scheduler');
  });

  // ---- following threads --------------------------------------------------------------

  const isHelper = (session) => session?.header?.origin === 'subagent';
  /** The thread a session's work belongs to: itself, or the one that started it as a helper. */
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
  /** Thread id -> its turn in progress, for threads that are not scheduled runs. */
  const turns = new Map();
  const minutesSince = (at) => (Date.now() - at) / 60000;

  /** An automation's own alert choices (A17); a run of several automations together uses the global ones. */
  const ownAlerts = (run) => (run?.tasks?.length === 1 ? notes.get(String(run.tasks[0].id)).alerts : undefined);

  /** A thread started waiting for you. */
  const waiting = (id, kind, key) => {
    const run = runs.wait(id, kind, key);
    if (run) {
      const hide = sealedRun(run);
      void alerter.notify({ event: 'needs', scheduled: true, name: hide ? '' : run.tasks.map((task) => task.title).filter(Boolean).join(', '), sealed: hide, waiting: kind, own: ownAlerts(run) });
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
        // A Recon thread's run is named only "Recon": its folder holds the thread's id, and
        // an alert can go to an outside service (ntfy).
        let sealed = false;
        try {
          sealed = ctx.get('modes')?.isolated?.(event.conversation) === true;
        } catch {
          sealed = true;
        }
        const base = { scheduled: false, run: event.kind === 'long' ? 'long' : 'mission', name: sealed ? 'Recon' : event.folder ?? '' };
        // Mission point 17 (20 November 2026): `left` counts what is still for you, so the line can point to Finish it.
        // Mission stage E: `endKind` 'down' says it ended because its model server did not answer for 2 hours.
        if (event.type === 'finished') void alerter.notify({ ...base, event: 'finished', ...(Number.isFinite(event.left) ? { left: event.left } : {}), ...(typeof event.canContinue === 'boolean' ? { canContinue: event.canContinue } : {}), ...(typeof event.endKind === 'string' ? { endKind: event.endKind } : {}) });
        // Mission stage D: `waiting` says what it waits for ('question', 'approval' or 'you'); older events have none.
        // Point 17: a 'you' wait also says `until` (when it ends with no answer; 0 = until you answer).
        else if (event.type === 'needs-you') void alerter.notify({ ...base, event: 'needs', ...(typeof event.waiting === 'string' ? { waiting: event.waiting } : {}), ...(Number.isFinite(event.until) ? { until: event.until } : {}) });
        // Stage E: why 'down' is a Mission waiting for its model server (it tries again by itself).
        else if (event.type === 'stopped-by-itself') void alerter.notify({ ...base, event: 'failed', state: event.why === 'restart' ? 'restart' : event.why === 'down' ? 'down' : 'failed' });
      }) ?? (() => {}), 'automations: run alerts');
    } catch (error) {
      warn(`run alerts are off: ${String(error?.message ?? error)}`);
    }
  });

  /**
   * Stage 6b lab fix: the scheduler's message last put into each thread (its tasks and due times), until that turn ends,
   * so a held run (no step ran) is still recorded under Last runs.
   */
  const spliced = new Map();
  const noteSpliced = (session, event) => {
    try {
      if (!enabled() || !session?.id || isHelper(session)) return;
      const inserted = Array.isArray(event?.data?.inserted) ? event.data.inserted : [];
      const message = inserted.map((item) => item?.message ?? item).find((one) => scheduledTasks(one).length > 0);
      if (!message) return;
      spliced.set(String(session.id), { ids: scheduledTasks(message), due: occurrencesOf(message), at: Date.now() });
      if (spliced.size > 200) spliced.delete(spliced.keys().next().value);
    } catch {
      // the record is a nicety
    }
  };
  /** A held thread's turn ended with no run record: record the run (as held) from the scheduler's message. */
  const recordHeldRun = (id, reason) => {
    const seen = spliced.get(id);
    if (!seen || Date.now() - seen.at > 10 * 60_000) return undefined;
    let held = selfHeld.has(id);
    try {
      held = held || Boolean(ctx.get('modes')?.spaces?.held?.(id));
    } catch {
      // Modes could not say: only Automations' own hold counts
    }
    if (!held) return undefined;
    const due = Object.values(seen.due).filter((at) => Number.isFinite(at));
    runs.start({
      id: `${id}-held-${seen.at}`,
      sessionId: id,
      steps: 0,
      tasks: seen.ids.map((taskId) => ({ id: taskId, title: titles[taskId] ?? '' })),
      dueAt: due.length > 0 ? Math.min(...due) : undefined,
      target: seen.ids.length === 1 ? targets[seen.ids[0]] : '',
    });
    const run = runs.end(id, reason);
    if (run && selfHeld.has(id)) runs.held(id, `Did not start: Modes is off, missing or out of date, and it is what keeps these runs in their space. Nothing was run.`);
    return run;
  };
  // Events older than this start are history being read back, not work happening now.
  const startedAt = Date.now();
  ctx.on('session/event', (session, event) => {
    try {
      // Item 6: a scheduled message reached a new thread; place it in its automation's tab before its first turn.
      if (event?.type === 'agent/inbox/spliced') {
        claimInto(session, event);
        noteSpliced(session, event);
        return;
      }
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
          // You wrote in a run's own thread after it ended: it is yours now, never trashed by age.
          if (ids.length === 0 && (data.source?.kind ?? 'user') === 'user') runs.touch(id);
          if (ids.length === 0 || runs.active(id)) break;
          // Run now (from this page) is never late, even when it waited for a busy thread (review finding 7).
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
            // Never a word of an isolated (Recon) thread in the record (review finding 1).
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
          let run = runs.end(id, data.reason);
          // Stage 6b lab fix: a held run's turn ends with no step, so its scheduler message never became a run record
          // (the record starts at that message's step): it is recorded here, so Last runs lists it as held.
          const late = run ? undefined : recordHeldRun(id, data.reason);
          if (late) run = late;
          spliced.delete(id);
          // Item 4A, stage 6b (J11): a run its guarded space held ran nothing: the record says so.
          if (run) {
            try {
              const held = ctx.get('modes')?.spaces?.held?.(id);
              if (held?.space) runs.held(id, `Did not start: it runs in ${spaceName(held.space, 'en')}, which could not take it now (${String(held.reason ?? '')}). Nothing was run.`);
            } catch {
              // the record keeps the turn's own outcome
            }
          }
          const kind = String(data.reason?.kind ?? '');
          if (run) {
            // Item 6: a Recon automation's alert says only "A Recon automation". A held run recorded late (nothing ran,
            // its automation is paused with a note) sends no alert, as before this record existed.
            const hide = sealedRun(run);
            const names = hide ? '' : run.tasks.map((task) => task.title).filter(Boolean).join(', ');
            if (late) { /* no alert */ } else if (run.state === 'ok') void alerter.notify({ event: 'finished', scheduled: true, name: names, sealed: hide, own: ownAlerts(run) });
            else if (run.state !== 'cancelled') void alerter.notify({ event: 'failed', scheduled: true, name: names, sealed: hide, state: run.state, own: ownAlerts(run) });
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
        tabProblem = 'The Modes add-on is not running, so the Automations mode cannot be offered. Switch on Modes on the Plugins page.';
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
      // Item 4A, stage 6b (D14): without the Cowork sidebar (and in the lab with spaces off) `defaultMode` still picks a new
      // thread's mode, so it must not name a mode that is gone. With spaces, Modes already skips a start mode whose
      // add-on is off and keeps the owner's choice (lib/spaces.js draftStartMode, startModeGone).
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate('modes', ops);
      tabProblem = '';
    } catch (error) {
      tabProblem = `The Automations mode could not be switched on or off. Try the switch again. Details: ${String(error?.message ?? error).slice(0, 160)}`;
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
      'Read how your automations (the app\'s scheduled tasks) ran: when each run started, how it ended, whether it ran late, and what it said at the end. ' +
      'Filter by automation name or id, by date, and by outcome. Set full to read each run\'s whole final answer (only for runs that opened a thread of their own or wrote into a shared one; never Recon threads).',
    parameters: {
      type: 'object',
      properties: {
        automation: { type: 'string', description: 'Part of the automation\'s name, or its id. Empty for all.' },
        since: { type: 'string', description: 'Only runs from this date or time on (ISO 8601, e.g. 2026-11-10). Default: the last 31 days.' },
        state: { type: 'string', enum: ['failed', 'finished', 'waiting', 'running'], description: 'Only runs that ended this way.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Most runs to return (default 10).' },
        full: { type: 'boolean', description: 'Read each run\'s whole final answer from its thread.' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
      render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
    },
    isConcurrencySafe: () => true,
    async execute(args) {
      // Item 6: a Recon automation's runs carry no name here (the name filter cannot find them by it either).
      const listed = runs.list().map((run) => (sealedRun(run) ? { ...run, sealed: true, tasks: run.tasks.map((task) => ({ ...task, title: SEALED_NAME })) } : run));
      const picked = pickRuns(listed, args ?? {});
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
        const name = run.sealed ? SEALED_NAME : run.tasks.map((task) => task.title || titles[task.id] || task.id).join(', ');
        const head = `- ${name}: started ${new Date(run.startedAt).toISOString()}, ${run.state === 'ok' ? 'finished' : run.held === true ? 'did not start (nothing ran)' : run.state}${run.late ? `, ran late (due ${new Date(run.dueAt).toISOString()}${run.whenOpened ? ', when the app opened' : ''})` : ''}${run.detail ? ` (${run.detail})` : ''}.`;
        if (run.sealed || isolated(run.sessionId)) {
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
            /* the thread may be in the trash or gone: keep the record's last words */
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

  /** @param {'en'} [lang] - the page's language (always English). */
  const view = async (lang = 'en') => {
    let tasks = [];
    const now = Date.now();
    const presetRows = await presetList();
    const presetDefault = defaultPreset();
    // App default first (no preset stored), then the app's presets: a change can always go back to following the default.
    const pickable = [defaultChoice(presetDefault, presetRows, lang), ...presetChoices(presetRows, lang)];
    const presetOf = (task) => {
      let preset;
      try {
        preset = presetOfTask(task, { sessionPreset, defaultId: presetDefault, list: presetRows });
      } catch {
        preset = { id: '', name: '', kind: 'other', from: 'unknown', changeable: false, newConversation: false };
      }
      // The words in the page's language (the id and kind stay as they are).
      preset = { ...preset, name: presetName(preset.id, presetRows, lang) };
      const choices = preset.changeable ? pickable.map((choice) => ({ id: choice.id, note: choiceNote(choice, preset, lang) })) : [];
      return { ...preset, info: presetInfo(preset, presetName(presetDefault, presetRows, lang), lang), notes: Object.fromEntries(choices.map((choice) => [choice.id, choice.note])) };
    };
    // Stage 7 (point 29): every automation with a recorded run is marked, so the mark outlives the run in the list.
    // A held run is not a run (nothing ran): its one-time automation stays listed as "Did not start" after it leaves.
    const withRun = new Set();
    const withHeld = new Set();
    const finished = new Set();
    for (const run of runs.list()) {
      for (const one of run.tasks ?? []) {
        (run.held === true ? withHeld : withRun).add(String(one.id));
        // Marked once it has ended: a run still going may yet be held (its space can refuse it a moment later).
        if (run.held !== true && run.state !== 'running' && run.state !== 'waiting') finished.add(String(one.id));
      }
    }
    for (const id of finished) notes.markRan(id);
    try {
      const stored = await readTasks();
      await readStoredPresets(stored);
      const live = Boolean(spacesApi());
      tasks = stored.map((task) => {
        const id = String(task.id);
        const note = notes.get(id);
        const keepDays = (note.keep ?? keepDefault(everyOf(task))).days;
        const facts = { note, hasRun: withRun.has(id), held: withHeld.has(id), ranSince: notes.ranSince(), keepDays, now, closedAt: (at) => alive.closedAt(at), threadHeld };
        const notStarted = didNotStart(task, facts);
        // Stage 7 lab (bug C): the app ran it with no run recorded here (the add-on was off): an ended run, not "Did not start".
        const ranAlone = notStarted ? null : ranUnrecorded(task, facts);
        // Item 4A, stage 6b: where its runs happen (stored, or derived when read: J5), and the page's lines for it.
        const place = live ? placeOfTask(task, note) : null;
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
          tab: (ownTab() && !isFinanceBrief(task) && note.runTab) || tabOf(task),
          createdIn: note.createdIn ?? '',
          createdSpace: note.createdSpace ?? '',
          // Item 6: where its new threads really open (Details → Runs in), why it was paused, and whether it is Recon's.
          // `runsInFixed`: 'finance' (Finance decides) or 'off' (the setting is off): no Change, a line says why.
          runTab: note.runTab ?? '',
          runsIn: runsInOf(task, note).tab,
          runsInName: place && place.space && place.fixed !== 'thread' ? placeName(place, lang) : tabLabel(runsInOf(task, note).tab),
          runsInFixed: runsInOf(task, note).fixed,
          // Stage 6b: the place as a pair, whether it is stored, the "Runs in" line, and the J8 note.
          runsInPlace: place ? { space: place.space, mode: place.mode } : null,
          runSpace: note.runSpace ?? '',
          stored: place?.stored === true,
          runsInLine: place ? runsInLine(place, note, lang) : '',
          placeNote: place?.stored && note.placeNote === 'unticked' ? createWords(lang).placeUnticked(spaceName(place.space, lang), modeName(place.mode, lang)) : place?.stored && note.placeNote === 'hidden' ? createWords(lang).placeHidden(spaceName(place.space, lang)) : '',
          pausedNote: pausedNoteOf(task, note, lang),
          sealed: sealed(task, note),
          alerts: note.alerts ?? {},
          keep: note.keep ?? null,
          keepDefault: keepDefault(everyOf(task)),
          missed: missedOf(task, now),
          preset: presetOf(task),
          // Stage 7 (point 29): a one-time automation that ended with no recorded run: listed as "Did not start" until deleted.
          ...(notStarted ? { didNotStart: { reason: didNotStartWords(notStarted.reason, note, lang), ...(notStarted.at ? { at: notStarted.at } : {}) } } : {}),
          ...(ranAlone ? { ranUnrecorded: { at: ranAlone.at, sessionId: ranAlone.sessionId, line: ranAloneLine(ranAlone, task, note, place, lang) } } : {}),
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
        // Stage 7 (lab): a held run ran nothing, so it is not counted as run today (only under "Did not start").
        ranToday: list.filter((run) => run.startedAt >= today.getTime() && run.held !== true).length,
        missed: tasks.reduce((sum, task) => sum + task.missed.length, 0),
        // Stage 7 (6b lab leftover): a held run ran nothing; it is counted as held, never as failed.
        failed: list.filter((run) => run.startedAt >= today.getTime() - 6 * 24 * 60 * 60 * 1000 && !run.held && (run.state === 'failed' || run.state === 'stopped')).length,
        held: list.filter((run) => run.startedAt >= today.getTime() - 6 * 24 * 60 * 60 * 1000 && run.held === true).length,
        nextAt: next,
      },
      closed: alive.gaps().slice(-5),
      settings: { deletedToTrash: plainOf('deletedToTrash'), oldRunsToTrash: plainOf('oldRunsToTrash'), tab: plainOf('tab'), scheduleButton: plainOf('scheduleButton'), runsInTheirTab: plainOf('runsInTheirTab'), scheduleFromRecon: plainOf('scheduleFromRecon') },
      // Item 6: the tabs "Runs in" can pick (switched on, not sealed, not Automations).
      runTabs: runTabs(),
      // Item 4A, stage 6b: the space · mode pairs "Runs in" can pick, with the preset each one's lock gives (null: older Modes).
      places: placesWithLocks(lang, presetRows),
      tabProblem,
      guard: { ...guardState },
      creatorRuns: creatorRuns(),
      presets: { choices: pickable.length > 1 ? pickable : [], defaultId: presetDefault, defaultChoice: DEFAULT_CHOICE },
      lang,
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
        marks.push({ at: run.startedAt, kind: run.state === 'ok' ? 'done' : run.state === 'running' || run.state === 'waiting' ? run.state : run.held === true ? 'held' : 'failed', late: run.late === true });
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
    if (result?.code) throw Object.assign(new Error('The app did not accept the change. Look again, then try once more.'), { details: `The app refused: ${result.code}` });
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
    if (result?.code) throw Object.assign(new Error('The app did not accept the change. Look again, then try once more.'), { details: `The app refused: ${result.code}` });
    // Item 6: changed by the owner: the "paused while its tab was off" note has done its job.
    notes.setPausedBack(id, '');
    await readTasks();
  };

  // ---- each automation's preset (item 7, point 22): shown on the page, changed only on your click ----

  /** The app's preset list, read at most once a minute (reading it can wait for the app's loader). */
  let presetCache = { at: 0, list: [] };
  const presetList = async () => {
    const presets = ctx.get('agentPresets');
    if (typeof presets?.list !== 'function') return [];
    if (Date.now() - presetCache.at < 60000) return presetCache.list;
    try {
      let timer;
      const late = new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), 3000); timer.unref?.(); });
      const list = await Promise.race([presets.list(), late]).finally(() => clearTimeout(timer));
      if (Array.isArray(list)) presetCache = { at: Date.now(), list };
    } catch (error) {
      warn(`could not read the presets: ${String(error?.message ?? error)}`);
    }
    return presetCache.list;
  };
  const defaultPreset = () => {
    try {
      const id = ctx.get('agentPresets')?.defaultId;
      return typeof id === 'string' ? id : '';
    } catch {
      return '';
    }
  };
  /** Presets read from threads' stored records (not open since the app started): id -> { at, id }. */
  const storedPresets = new Map();
  const STORED_PRESET_TTL_MS = 60_000;
  /** The preset a thread has, when the app knows it (read only): the open thread, else its stored record. */
  const sessionPreset = (sessionId) => {
    const presets = ctx.get('agentPresets');
    const session = ctx.get('sessions')?.get?.(sessionId);
    if (session && typeof presets?.presetForSession === 'function') {
      try {
        const value = presets.presetForSession(session);
        const id = typeof value === 'string' ? value : value?.id ?? value?.presetId;
        if (typeof id === 'string' && id) return id;
      } catch {
        // its stored record below
      }
    }
    const kept = storedPresets.get(sessionId);
    return kept?.id || undefined;
  };
  /**
   * Read the preset of a thread that is not open, without opening it: the app's list cache of its log (the last
   * preset picked while it was new), else the preset in its stored header. Header-only reads, the same the scheduler uses.
   * @param {string} sessionId - the thread.
   * @returns {Promise<string>} the preset id, '' when the app cannot say.
   */
  const readStoredPreset = async (sessionId) => {
    const kept = storedPresets.get(sessionId);
    if (kept && Date.now() - kept.at < STORED_PRESET_TTL_MS) return kept.id;
    let id = '';
    try {
      const snapshot = await ctx.get('sessionPersistence')?.stat?.(sessionId);
      const header = snapshot?.header;
      if (header) {
        try {
          const keys = ctx.get('sessionProjections')?.summaryKeys?.();
          const cached = keys ? ctx.get('sessionProjectionCache')?.cachedSnapshot?.(header, keys) : undefined;
          const value = cached?.values?.agentPreset;
          if (typeof value === 'string' && value) id = value;
        } catch {
          // the header below
        }
        if (!id && typeof header.agentPreset === 'string') id = header.agentPreset;
      }
    } catch (error) {
      warn(`could not read the preset of ${sessionId}: ${String(error?.message ?? error)}`);
    }
    storedPresets.set(sessionId, { at: Date.now(), id });
    if (storedPresets.size > 500) storedPresets.delete(storedPresets.keys().next().value);
    return id;
  };
  /** Before the page's answer: read the stored preset of every thread an automation writes into that is not open. */
  const readStoredPresets = async (tasks) => {
    const ids = new Set();
    for (const task of tasks) {
      const target = task?.target ?? {};
      const sessionId = target.kind === 'session' || target.kind === 'new_once' ? target.sessionId : undefined;
      if (typeof sessionId === 'string' && sessionId && !ctx.get('sessions')?.get?.(sessionId)) ids.add(sessionId);
    }
    await Promise.all([...ids].slice(0, 100).map((id) => readStoredPreset(id)));
  };
  /** Run an automation in another preset: through the app's scheduler, refusing when it changed meanwhile. */
  const changePreset = async (id, presetId, expectedUpdatedAt, lang = 'en') => {
    if (!schedule) throw new Error("The app's scheduler is not running.");
    const choices = presetChoices(await presetList());
    if (presetId !== DEFAULT_CHOICE && !choices.some((choice) => choice.id === presetId)) throw new Error('That preset is not in the app now. Look again, then pick one from the list.');
    const task = (await readTasks()).find((entry) => String(entry.id) === id);
    if (!task) throw new Error('That automation is gone.');
    // Item 6: new threads that open in a locked tab always use its lock (item 7); the page says where to change it.
    const note = notes.get(id);
    // Item 4A, stage 6b (D11): a stored place follows its space's lock; the others keep the mode's lock (J5).
    const stored = note.runSpace && note.runTab && spacesApi() ? placeOfTask(task, note) : null;
    if (stored?.stored) {
      const spaceLock = lockedPreset(note.runTab, note.runSpace);
      if (spaceLock && presetId !== spaceLock) throw plainError(createWords(lang).presetLockedSpace(spaceName(note.runSpace, lang), modeName(note.runTab, lang), presetName(spaceLock, await presetList(), lang)));
    }
    const lock = !stored?.stored && runsInOf(task, note).fixed === '' && note.runTab && ownTab() ? lockedPreset(note.runTab) : '';
    if (lock && presetId !== lock) throw plainError(createWords(lang).presetLocked(tabLabel(note.runTab), presetName(lock, await presetList(), lang)));
    const target = targetWithPreset(task.target, presetId);
    const result = await schedule.edit({ id, action: 'update', patch: { target }, ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}) });
    if (result?.code === 'schedule_conflict') throw new Error('It was changed on another page meanwhile. Look again, then try once more.');
    if (result?.code === 'schedule_not_found') throw new Error('That automation is gone.');
    if (result?.code) throw Object.assign(new Error('The app did not accept the change. Look again, then try once more.'), { details: `The app refused: ${result.code}` });
    await readTasks();
  };

  /**
   * Item 6: the one way Plus makes an automation (the clock button, New, Creator Plus's saved runs, Put back). The app
   * refuses by throwing its ScheduleInputError (with a `.code`); that becomes a plain sentence, the code behind Details.
   * @param {object} request - title, prompt, timing and target, as the app takes them.
   * @param {string} [actorSessionId] - the thread it was made from (the app records it as involved).
   * @param {string} [lang] - the page's language.
   */
  const createTask = async (request, actorSessionId, lang = 'en') => {
    if (!schedule) throw plainError(createWords(lang).noScheduler);
    try {
      return actorSessionId ? await schedule.create(request, actorSessionId) : await schedule.create(request);
    } catch (error) {
      throw scheduleProblem(error, lang);
    }
  };

  const runNow = async (id) => {
    if (!schedule) throw new Error('The app\'s scheduler is not running.');
    ranNowAt.set(id, Date.now());
    if (ranNowAt.size > 200) ranNowAt.delete(ranNowAt.keys().next().value);
    const result = await schedule.run({ id });
    if (result?.code === 'schedule_not_found') throw new Error('That automation is gone. Reload this page.');
    if (result?.code === 'schedule_execution_pending') throw new Error('That automation is already running. Wait for its run to end, then try again.');
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
   * Schedule a saved run into a Creator Plus thread: daily, or on ISO weekdays (1 = Monday), at a time
   * in the user's time zone. It runs as a Long run would and changes nothing in the real setup without
   * the user's yes (Creator Plus's own rules hold in that thread).
   */
  const scheduleCreatorRun = async ({ name, sessionId, time, weekdays, timeZone }) => {
    if (!schedule) throw new Error("The app's scheduler is not running.");
    const creator = ctx.get('creatorPlus');
    const prompt = typeof creator?.savedRunPrompt === 'function' ? String(creator.savedRunPrompt(String(name ?? '')) ?? '') : '';
    if (!prompt) throw new Error('There is no such saved run, or Creator Plus is switched off.');
    const session = String(sessionId ?? '');
    if (!session) throw new Error('Which thread?');
    if (String(ctx.get('modes')?.get?.(session) ?? '') !== 'creator-plus') throw new Error('A saved run goes only into a Creator Plus thread.');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(time ?? ''))) throw new Error('A time like 09:00.');
    const zone = String(timeZone ?? '');
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
    } catch {
      throw new Error('An unknown time zone.');
    }
    if (!zone) throw new Error('An unknown time zone.');
    const days = [...new Set((Array.isArray(weekdays) ? weekdays : []).map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))].sort();
    // Item 6 fix: the app takes only HH:mm:ss (the page sends HH:mm), and refuses by throwing, not by an answer with a code.
    const clock = `${time}:00`;
    const timing = days.length === 0 || days.length === 7 ? { kind: 'daily', daily: { time: clock, time_zone: zone } } : { kind: 'weekly', weekly: { time: clock, time_zone: zone, weekdays: days } };
    const made = await createTask({ title: `Creator Plus: ${String(name)}`.slice(0, 120), prompt, timing, target: { kind: 'session', sessionId: session } });
    if (made?.id) notes.setCreatedIn(made.id, 'creator-plus');
    await readTasks();
  };

  // ---- item 6: "Schedule this…" in every chat box, and New on the Automations page ---------------------

  const ownTab = () => plain(config.runsInTheirTab) !== false;
  const reconAllowed = () => plain(config.scheduleFromRecon) !== false;
  /** Finance's own briefs: Finance moves them into its tab itself. */
  const isFinanceBrief = (entry) => String(entry?.title ?? '').startsWith('Finance brief: ');

  // ---- Item 4A, stage 6b: "Runs in: space · mode" (STAGE6B-DESIGN.md Part B) ------------------------------------------
  const modesService = () => {
    try {
      return ctx.get('modes');
    } catch {
      return undefined;
    }
  };
  /** Modes' spaces when it can say where runs go (`list`, `modesIn`, `ofMode`); null: today's tab paths exactly (3.5). */
  const spacesApi = () => {
    const spaces = modesService()?.spaces;
    return spaces && typeof spaces.list === 'function' && typeof spaces.modesIn === 'function' && typeof spaces.ofMode === 'function' ? spaces : null;
  };
  /** Whether Modes can hold a run its guarded place cannot take (`set {hold}`, `spaces.holdRun`; 3.5). */
  const holdSupported = () => {
    const service = modesService();
    return Number(service?.apiVersion) >= 2 && typeof service?.spaces?.holdRun === 'function';
  };
  const isGuardedRun = (space) => GUARDED_RUN_SPACES.includes(space);
  /** Modes' readiness of each guarded space's guard ({} when it cannot say: nothing counts as ready). */
  const readyNow = () => {
    try {
      const ready = modesService()?.spaces?.ready?.();
      return ready && typeof ready === 'object' ? ready : {};
    } catch {
      return {};
    }
  };
  const SPACE_NAMES_FALLBACK = { en: { chat: 'Chat', code: 'Code', devices: 'Devices', recon: 'Recon', workshop: 'Workshop' } };
  // Plus is English only (decision 28): names are always asked for in English; `lang` stays accepted.
  const spaceName = (space, lang = 'en') => {
    const key = 'en';
    try {
      const names = modesService()?.spaces?.names?.(key);
      if (names && typeof names[space] === 'string' && names[space]) return names[space];
    } catch {
      // the built-in names below
    }
    return SPACE_NAMES_FALLBACK[key][space] ?? String(space ?? '');
  };
  const modeName = (mode, lang = 'en') => {
    try {
      const name = modesService()?.modeName?.(mode, 'en');
      if (typeof name === 'string' && name.trim()) return name.trim();
    } catch {
      // the list's label below
    }
    return tabLabel(mode);
  };
  const placeName = (place, lang = 'en') => `${spaceName(place?.space, lang)} · ${modeName(place?.mode, lang)}`;
  const offeredRows = (space) => {
    try {
      const rows = spacesApi()?.modesIn(space);
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  /** Whether a mode is ticked for a space and not greyed there now. */
  const offeredIn = (space, mode) => offeredRows(space).some((row) => row?.id === mode && row.greyed !== true);
  const spaceRows = () => {
    try {
      const rows = spacesApi()?.list();
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  };
  const spaceAvailable = (space) => spaceRows().some((row) => row?.id === space && row.available !== false);
  const spaceShown = (space) => spaceRows().some((row) => row?.id === space && row.shown !== false);
  /** A guarded space's guard: 'ready', 'off' (its add-on or mode is off), 'old' (too old to guard guests), 'unknown'. */
  const guardOfSpace = (space) => {
    if (readyNow()[space] === true) return 'ready';
    if (typeof modesService()?.spaces?.ready !== 'function') return 'unknown';
    const name = space === 'devices' ? 'bench' : space === 'workshop' ? 'creatorPlus' : '';
    const modeId = space === 'devices' ? 'bench' : space === 'workshop' ? 'creator-plus' : '';
    let service;
    try {
      service = name ? ctx.get(name) : undefined;
    } catch {
      service = undefined;
    }
    if (!service || !tabList().some((mode) => mode.id === modeId)) return 'off';
    return service.guestsGuarded === true ? 'unknown' : 'old';
  };
  /**
   * The (space, mode) pairs an automation's new threads may open in (placeList): every available space but Recon, the
   * modes ticked there and not greyed, never sealed ones or the Automations mode. null with an older Modes (runTabs).
   */
  const placeList = (lang = 'en') => {
    if (!spacesApi()) return null;
    const out = [];
    for (const row of spaceRows()) {
      const space = String(row?.id ?? '');
      if (!RUN_SPACES.includes(space) || row.available === false) continue;
      for (const mode of offeredRows(space)) {
        const id = String(mode?.id ?? '');
        if (!id || mode.greyed === true || id === 'automations' || isolatedTab(id)) continue;
        out.push({ space, mode: id, label: placeName({ space, mode: id }, lang), spaceName: spaceName(space, lang) });
      }
    }
    return out;
  };
  const inPlaces = (list, place) => Array.isArray(list) && list.some((row) => row.space === place?.space && row.mode === place?.mode);
  /** A thread's space and mode (for "Runs in: this thread (Recon · Research)"). */
  const threadPlace = (sessionId) => {
    let space = '';
    try {
      space = String(modesService()?.spaces?.of?.(sessionId) ?? '');
    } catch {
      space = '';
    }
    return { space, mode: modeOf(sessionId) };
  };
  /** An automation's run place (runPlaceOf): stored, or derived when read (never written, J5). */
  const placeOfTask = (task, note = notes.get(String(task?.id ?? ''))) => runPlaceOf({
    task, note, ownTab: ownTab(), isFinanceBrief, threadPlace, scheduledMode: scheduledTab(),
    ofMode: (mode) => spacesApi()?.ofMode(mode),
    scheduledPlace: (cwd) => modesService()?.spaces?.scheduledPlace?.(cwd),
  });
  /** The "Runs in" line of an automation, in the page's language. */
  const runsInLine = (place, note, lang = 'en') => {
    if (!place?.space || !place.mode) return '';
    const words = createWords(lang);
    const names = [spaceName(place.space, lang), modeName(place.mode, lang)];
    if (place.fixed === 'thread' || place.fixed === 'reused') return words.runsInThread(...names);
    if (!place.stored && (!note?.runTab || place.fixed === 'off') && place.fixed !== 'finance') return words.runsInScheduled(...names);
    return words.runsIn(...names);
  };
  /** The words of a space pause ([reason, fix]) for a reason key, filled with the space and mode. */
  const pauseWords = (reason, space, mode, lang = 'en') => {
    const words = createWords(lang);
    const pair = words.reasons[reason] ?? words.reasons.unknown;
    const fill = (text) => text.replaceAll('{space}', spaceName(space, lang)).replaceAll('{mode}', modeName(mode, lang));
    return [fill(pair[0]), fill(pair[1])];
  };
  /**
   * Item 4A, stage 6b (J10): whether a folder picked for a guest's run in Chat or Code may be used: '' when fine, else the
   * sentence. Never the Devices folder, /dev, Recon's room, or a folder that holds or lies in them; Devices checks its
   * folders (an answer it cannot give refuses). Without Devices: a Devices guest is refused (unchecked), a Workshop
   * guest's folder is checked for /dev and the room only.
   */
  const guestFolderRefusal = (cwd, guest, target, lang = 'en') => {
    const words = createWords(lang);
    if (!cwd) return words.guestFolderNeeded(spaceName(target, lang));
    if (!cwd.startsWith('/') || cwd.length > 1000 || cwd.includes('\0')) return words.noFolder;
    let room;
    try {
      room = ctx.get('recon')?.isRoom?.(cwd);
    } catch {
      room = true;
    }
    if (room === true) return words.guestFolderRefused;
    let at = resolve(cwd);
    try {
      at = realpathSync.native(cwd);
    } catch {
      // a folder that does not exist yet: its spelling
    }
    const touchesDev = ['/dev', '/private/dev'].some((dev) => at === dev || at.startsWith(`${dev}/`) || dev.startsWith(`${at.replace(/\/+$/, '')}/`) || at === '/');
    if (touchesDev) return words.guestFolderRefused;
    let bench;
    try {
      bench = ctx.get('bench');
    } catch {
      bench = undefined;
    }
    if (typeof bench?.folderTouchesDevices === 'function') {
      let answer;
      try {
        answer = bench.folderTouchesDevices(cwd);
      } catch {
        answer = 'unknown';
      }
      if (answer === '') return '';
      return answer === 'devices' || answer === 'dev' ? words.guestFolderRefused : words.guestFolderUnchecked(spaceName(guest, lang));
    }
    return guest === 'devices' ? words.guestFolderUnchecked(spaceName(guest, lang)) : '';
  };
  /** Stage 7 (point 29): why a one-time automation did not start, in words ('' when not known). */
  const didNotStartWords = (reason, note, lang = 'en') => {
    if (reason === 'automationsOff') return 'The Automations add-on was off then, so no run was recorded.';
    if (reason === 'held') return 'Its space could not take it when it was due.';
    if (reason === 'modesOld') return 'Modes was off, missing or out of date when it was due.';
    if (reason === 'unknown') return '';
    const space = String(note.pausedFor ?? '').startsWith('space:') ? String(note.pausedFor).slice('space:'.length) : String(note.runSpace ?? note.createdSpace ?? '');
    const [why] = pauseWords(reason, space, note.runTab || note.createdIn || '', lang);
    return `When it was due, ${why}.`;
  };
  /** Stage 7 lab (bug C): whether a thread's scheduled run was held (nothing ran): Modes says so, or holds it locked. */
  const threadHeld = (sessionId) => {
    try {
      if (modesService()?.spaces?.held?.(sessionId)) return true;
    } catch {
      // the mode below
    }
    return modeOf(sessionId) === 'isolated-locked';
  };
  /**
   * Stage 7 lab (bug C): the line of a one-time automation the app ran with no run recorded here. With the add-on off,
   * the app opens its thread in its own mode for scheduled threads, so it says which, when that is not the chosen one.
   */
  const ranAloneLine = (ran, task, note, place, lang = 'en') => {
    const next = 'Open its thread to see the result.';
    if (!ran.off) return `It ran, but no run of it was recorded here. ${next}`;
    const actual = modeOf(ran.sessionId) || scheduledTab();
    // Stage 7 lab re-check: a delivered one-time automation's place is its thread's own (mode included, also when stored),
    // so the chosen mode is its run mode, never the place's.
    const inThread = place?.fixed === 'reused' || place?.fixed === 'thread';
    const chosen = String((!inThread && place?.stored && place.mode) || note.runTab || '');
    if (chosen && actual && chosen !== actual) return `It ran while the Automations add-on was off, so the app ran it in ${modeName(actual, lang)} instead of ${modeName(chosen, lang)}. ${next}`;
    return `It ran while the Automations add-on was off, so no run of it was recorded here. ${next}`;
  };
  /** Stage 6b: the page's "Paused: …" line (a space pause, Automations switched off, or a mode gone as before). */
  const pausedNoteOf = (task, note, lang = 'en') => {
    if (task?.status === 'active') return '';
    const words = createWords(lang);
    const spaceOfPause = (value) => String(value ?? '').slice('space:'.length);
    if (String(note.pausedFor ?? '').startsWith('space:')) {
      const space = spaceOfPause(note.pausedFor);
      if (note.pauseReason === 'automationsOff') return words.automationsOff(spaceName(space, lang));
      if (note.pauseReason === 'modesOld') return words.modesOld(spaceName(space, lang));
      const [reason, fix] = pauseWords(note.pauseReason && note.pauseReason !== 'held' ? note.pauseReason : 'unknown', space, note.runTab || note.createdIn || '', lang);
      return words.pausedSpace(spaceName(space, lang), reason, fix);
    }
    if (String(note.pausedBack ?? '').startsWith('space:')) return words.pausedSpaceBack(spaceName(spaceOfPause(note.pausedBack), lang));
    if (note.pausedFor) return words.tabGone(tabLabel(note.pausedFor), runsInOf(task, note).tab !== '' && !runsInOf(task, note).fixed);
    return note.pausedBack ? words.tabBack(tabLabel(note.pausedBack)) : '';
  };
  /** The pairs of placeList with the preset each one's lock gives (null with an older Modes). */
  const placesWithLocks = (lang, rows = []) => {
    const list = placeList(lang);
    if (!list) return null;
    return list.map((row) => {
      const locked = lockedPreset(row.mode, row.space);
      return { ...row, locked, lockedName: locked ? presetName(locked, rows, lang) : '' };
    });
  };
  /** Stage 6b (L4): tell Modes a task's new threads must stay in a guarded space ('' or Chat/Code: no longer). */
  const noteGuestRun = (taskId, space, mode = '') => {
    try {
      // Stage 7 (6b lab leftover): with its mode, so a run Modes holds (Automations off) is named in its own mode.
      return modesService()?.spaces?.noteGuestRun?.(String(taskId), space, String(mode ?? '')) === true;
    } catch {
      return false;
    }
  };
  /**
   * The tab an automation needs: for new threads, its run tab (only while "New threads use the automation's mode" is on,
   * else they open in the scheduled tab, which is never switched off); for one the clock button wrote into its own chat,
   * the tab it was made in. '' for the rest (the assistant's, Finance's).
   */
  const watchedTab = (task, note) => {
    const kind = task?.target?.kind;
    if (kind === 'new' || kind === 'new_once') return ownTab() && !isFinanceBrief(task) ? note.runTab ?? '' : '';
    // "In one new thread, reused" becomes a 'session' target at its first run (lab finding: that is why the guard never
    // paused the lab's Research automation): its thread was opened in its run tab, and its runs go on there.
    if (note.made && note.runTab) return note.runTab;
    return note.made === 'button' ? note.createdIn ?? '' : '';
  };
  /** Where an automation's new threads really open now ('' for one that writes into a thread). */
  const runsInOf = (task, note) => {
    const kind = task?.target?.kind;
    if (kind !== 'new' && kind !== 'new_once') return { tab: '', fixed: '' };
    if (isFinanceBrief(task)) return { tab: 'finance', fixed: 'finance' };
    // 'In one new thread, reused' after its first run: its thread exists, and the runs go on there.
    if (kind === 'new_once' && task.lastDelivery) return { tab: (task.target?.sessionId && modeOf(task.target.sessionId)) || note.runTab || scheduledTab(), fixed: 'reused' };
    if (note.runTab && ownTab() && !isolatedTab(note.runTab)) return { tab: note.runTab, fixed: '' };
    return { tab: scheduledTab(), fixed: note.runTab && !ownTab() ? 'off' : '' };
  };
  /** A mode's preset lock; stage 6b (D11): with `space`, the lock of that space with that mode (a stored place only). */
  const lockedPreset = (tab, space) => {
    try {
      const id = space ? ctx.get('modes')?.lockedPreset?.(tab, { space }) : ctx.get('modes')?.lockedPreset?.(tab);
      return typeof id === 'string' ? id : '';
    } catch {
      return '';
    }
  };
  const missionRunning = (sessionId) => {
    try {
      return ctx.get('mission')?.isRunning?.(sessionId) === true;
    } catch {
      return false;
    }
  };
  /** The tabs an automation's new threads may open in: switched on, not sealed, never the Automations tab. */
  const runTabs = () => tabList().filter((mode) => !isolatedTab(mode.id) && mode.id !== 'automations' && mode.tab !== false).map((mode) => ({ id: mode.id, label: tabLabel(mode.id) }));
  /** A thread's header: the open one, else its stored record. */
  const headerOf = async (sessionId) => {
    try {
      const open = ctx.get('sessions')?.get?.(sessionId)?.header ?? ctx.get('agents')?.get?.(sessionId)?.header;
      if (open) return { header: open, live: true };
    } catch {
      /* its stored record below */
    }
    try {
      const stored = await ctx.get('sessionPersistence')?.stat?.(sessionId);
      if (stored?.header) return { header: stored.header, live: Boolean(ctx.get('agents')?.get?.(sessionId)) };
    } catch {
      /* not known */
    }
    return { header: undefined, live: Boolean(ctx.get('agents')?.get?.(sessionId)) };
  };
  /** Whether a thread has not run a turn yet (a draft, or a scheduled chat before its first turn). */
  const neverRan = (sessionId) => {
    try {
      const agents = ctx.get('agents');
      const agent = agents?.get?.(sessionId);
      if (!agent) return false;
      const boundary = agents.turnBoundaryOf?.(agent.session);
      if (boundary && typeof boundary === 'object' && boundary.lastTurn !== undefined) return Number(boundary.lastTurn) === 0;
      return Boolean(agent.phase) && Number(agent.phase.lastTurn) === 0;
    } catch {
      return false;
    }
  };
  /** The presets the form offers: App default first, then the app's (with their one-line notes). */
  const formPresets = async (lang) => {
    const rows = await presetList();
    const defaultId = defaultPreset();
    const pickable = [defaultChoice(defaultId, rows, lang), ...presetChoices(rows, lang)];
    return { rows, list: rows.length > 0 ? pickable.map((choice) => ({ id: choice.id, name: choice.name, kind: choice.kind, note: choiceNote(choice, {}, lang) })) : [], known: presetChoices(rows).map((choice) => choice.id) };
  };
  /** What the form may offer in one thread, and what it starts with (the server decides; the page shows it). */
  const facts = async (sessionId) => {
    const { header, live } = await headerOf(sessionId);
    const tab = modeOf(sessionId);
    const helper = header?.origin === 'subagent' || Boolean(header?.parentSession) || Number(header?.delegationDepth ?? 0) > 0;
    const sealedChat = isolated(sessionId) || isolatedTab(tab);
    // Item 4A, stage 6b (J10): a guest in Devices or Workshop gets its three choices (never a sealed thread).
    const guard = guardOf(sessionId);
    const guest = sealedChat ? '' : guestOf(guard);
    const policy = placePolicy({ tab, isolated: sealedChat, helper, reconAllowed: reconAllowed(), guest });
    return { header, live, tab, helper, sealedChat, policy, guard, guest, cwd: typeof header?.cwd === 'string' ? header.cwd : '', blank: live ? neverRan(sessionId) : !header };
  };
  /**
   * Item 4A, stage 6b (J6, J7, G3): the place a new thread of an automation made from this thread opens in: a guest's
   * own space and mode; a Chat or Code thread's own space and mode (Code · Research runs in Code · Research); null for
   * the rest (Creator Plus at home, the Automations mode, an older Modes, the setting off): today's claim, no place stored.
   */
  const ownPlaceOf = (found) => {
    if (!spacesApi() || !found?.tab || found.tab === 'automations' || found.sealedChat) return null;
    if (found.guest) return { space: found.guest, mode: found.tab };
    const space = String(found.guard?.space ?? '');
    return ownTab() && (space === 'chat' || space === 'code') ? { space, mode: found.tab } : null;
  };
  /** A folder's name for the form: "Scratch" for Plus's own throwaway folder, else its last part. */
  const folderName = (cwd) => {
    if (!cwd) return '';
    const scratch = typeof home === 'function' ? home('scratch') : '';
    if (scratch && (cwd === scratch || cwd.startsWith(`${scratch}/`))) return 'Scratch';
    return basename(cwd);
  };
  /** The tab an automation's new threads will open in now, with the setting as it is. */
  const effectiveRunTab = (tab) => runTabFor({ tab, ownTab: ownTab(), scheduledTab: scheduledTab() });
  /** Stage 6b (L6): whether a folder is, or lies in, another one. */
  const sameOrInside = (path, folder) => Boolean(path && folder) && (resolve(path) === resolve(folder) || resolve(path).startsWith(`${resolve(folder).replace(/\/+$/, '')}/`));

  /** 'context': what the popover shows for a thread; without a thread, what New on the page shows. */
  const contextOf = async (sessionId, lang) => {
    const words = createWords(lang);
    const presets = await formPresets(lang);
    const scheduled = scheduledTab();
    if (!sessionId) {
      const tabs = runTabs().map((tab) => {
        const locked = lockedPreset(tab.id);
        return { ...tab, locked, lockedName: locked ? presetName(locked, presets.rows, lang) : '' };
      });
      // Item 4A, stage 6b (G5): the space · mode pairs; the form starts on the place "Mode for automations" gives.
      const places = placesWithLocks(lang, presets.rows);
      let startPlace = null;
      if (places) {
        let derived = null;
        try {
          derived = modesService()?.spaces?.scheduledPlace?.('') ?? null;
        } catch {
          derived = null;
        }
        const wanted = derived && inPlaces(places, derived) ? derived : places.find((row) => row.mode === scheduled) ?? places[0] ?? null;
        startPlace = wanted ? { space: wanted.space, mode: wanted.mode } : null;
      }
      const allowed = places ? places.length > 0 : tabs.length > 0;
      return { form: 'new', allowed, reason: allowed ? '' : words.noTab, wheres: ['new_once', 'new'], tabs, tab: tabs.some((tab) => tab.id === scheduled) ? scheduled : tabs[0]?.id ?? '', scheduledTab: scheduled, scheduledTabName: tabLabel(scheduled), ownTab: ownTab(), presets: presets.list, places, place: startPlace };
    }
    const found = await facts(sessionId);
    const place = ownPlaceOf(found);
    const runTab = place ? place.mode : effectiveRunTab(found.tab);
    const locked = place ? lockedPreset(place.mode, place.space) : lockedPreset(runTab);
    let presetNow = '';
    try {
      presetNow = sessionPreset(sessionId) || (await readStoredPreset(sessionId)) || '';
    } catch {
      presetNow = '';
    }
    const where = found.policy.wheres.includes('session') && !found.blank ? 'session' : found.policy.wheres.includes('new_once') ? 'new_once' : found.policy.wheres[0] ?? '';
    // Stage 6b (J10): a guest's choices: a new thread in this space · this mode (its own folder), or in Chat or Code in a
    // folder the owner picks (never pre-filled, L6), each with the preset its lock gives and the warning.
    let guest = null;
    if (found.guest && found.policy.allowed) {
      const spaceLabel = spaceName(found.guest, lang);
      const other = (placesWithLocks(lang, presets.rows) ?? []).filter((row) => row.space === 'chat' || row.space === 'code').map((row) => ({
        ...row, warn: words.otherWarn(spaceLabel, row.spaceName, modeName(row.mode, lang)), folderNeeded: words.guestFolderNeeded(row.spaceName),
      }));
      guest = {
        space: found.guest,
        spaceName: spaceLabel,
        here: { space: found.guest, mode: found.tab, label: words.guestHere(spaceLabel, modeName(found.tab, lang)), locked, lockedName: locked ? presetName(locked, presets.rows, lang) : '' },
        otherLabel: words.guestOther,
        info: words.guestInfo(spaceLabel),
        other,
        ownFolder: found.cwd,
        ownFolderWarn: words.guestOwnFolder(spaceLabel),
        folderRule: words.guestFolderRefused,
      };
    }
    return {
      form: 'chat',
      allowed: found.policy.allowed,
      reason: found.policy.allowed ? '' : words[found.policy.reason] ?? words.refused,
      reasonKind: found.policy.reason ?? '',
      recon: found.policy.recon,
      reconWarn: found.policy.recon && found.policy.allowed ? words.reconWarn : '',
      reconNewChat: found.policy.recon && found.policy.allowed ? words.reconNewChat : '',
      wheres: found.policy.wheres,
      where,
      blank: found.blank,
      tab: found.tab,
      tabName: tabLabel(found.tab),
      runTab,
      runTabName: place ? placeName(place, lang) : tabLabel(runTab),
      // Stage 6b: "Opens in {space} · {mode}" (null: today's tab words).
      place,
      placeName: place ? placeName(place, lang) : '',
      guest,
      ownTab: ownTab(),
      folder: folderName(found.cwd),
      hasFolder: Boolean(found.cwd),
      presetNow: presetNow && presets.known.includes(presetNow) ? presetNow : '',
      presetNowName: presetNow ? presetName(presetNow, presets.rows, lang) : '',
      locked,
      lockedName: locked ? presetName(locked, presets.rows, lang) : '',
      presets: presets.list,
      missionRunning: missionRunning(sessionId),
      missionWarn: words.missionWarn,
      waitingNote: words.waitingNote,
    };
  };

  /** The words of a refused guard (guardNotReady), in the page's language. */
  const guardRefusalText = (refusedBy, lang, guard = null) => {
    const words = createWords(lang);
    // G4: the Devices mode at home keeps no clock (as before 6b).
    if (refusedBy === 'devices' && guard?.mode === 'bench' && guard?.homeMode === true) return words.benchHome;
    if (refusedBy !== 'devices' && refusedBy !== 'workshop') return words.guardNotReady('this space', ...pauseWords('unknown', '', '', lang));
    const state = guardOfSpace(refusedBy);
    const key = state === 'old' ? `${refusedBy}Old` : state === 'off' ? `${refusedBy}Off` : 'unknown';
    return words.guardNotReady(spaceName(refusedBy, lang), ...pauseWords(key, refusedBy, '', lang));
  };

  /** 'create': check everything again on the server, then make it through createTask. */
  const createFromForm = async (body, lang) => {
    const words = createWords(lang);
    if (!schedule) throw plainError(words.noScheduler);
    const { title, prompt } = checkText(body ?? {}, lang);
    const plan = planOf(body?.when, String(body?.timeZone ?? ''), Date.now());
    if (!plan.ok) throw plainError(previewOf(body?.when, String(body?.timeZone ?? ''), lang).line);
    const where = String(body?.where ?? '');
    const sessionId = typeof body?.sessionId === 'string' ? body.sessionId : '';
    const presets = await formPresets(lang);
    const asked = body?.place && typeof body.place === 'object' ? { space: String(body.place.space ?? ''), mode: String(body.place.mode ?? '') } : null;
    let tab;
    let cwd;
    let chatPreset = '';
    /** Stage 6b: the place stored for its new threads (`runSpace` + `runTab`), or null: today's claim. */
    let place = null;
    let made = { createdIn: '', createdSpace: '', createdBy: '' };
    if (sessionId) {
      const found = await facts(sessionId);
      if (!found.policy.allowed) throw plainError(words[found.policy.reason] ?? words.refused);
      // Item 4A, stage 6b: Devices and Workshop guests may (point 27); a guard that cannot be read, or a guarded space
      // whose guard is not ready, refuses (fail closed). Home modes as before (Creator Plus yes, Devices mode no).
      const refusedBy = guardedRefusal(found.guard, readyNow());
      if (refusedBy) throw plainError(guardRefusalText(refusedBy, lang, found.guard));
      if (!found.policy.wheres.includes(where)) throw plainError(found.policy.recon ? words.reconNewChat : words.where);
      tab = found.tab;
      cwd = found.cwd;
      made = createdOf(sessionId);
      try {
        chatPreset = sessionPreset(sessionId) || (await readStoredPreset(sessionId)) || '';
      } catch {
        chatPreset = '';
      }
      if (where !== 'session') {
        const own = ownPlaceOf(found);
        if (found.guest) {
          // J10: this space · this mode in the thread's folder, or Chat/Code in a folder the owner picks.
          const want = asked ?? own;
          if (!want) throw plainError(words.placeRefused);
          if (want.space === found.guest && want.mode === found.tab) place = own;
          else if (want.space === 'chat' || want.space === 'code') {
            const picked = typeof body?.cwd === 'string' ? body.cwd.trim() : '';
            const refused = guestFolderRefusal(picked, found.guest, want.space, lang);
            if (refused) throw plainError(refused);
            if (!inPlaces(placeList(lang), want)) throw plainError(words.placeRefused);
            place = want;
            cwd = picked;
            // The guest thread's preset is not carried out of its space: the place's lock, a picked one, else the default.
            chatPreset = '';
          } else throw plainError(words.placeRefused);
        } else if (own && asked && (asked.space !== own.space || asked.mode !== own.mode)) {
          // G3: another place picked (also from Creator Plus at home): it must be offered.
          if (!inPlaces(placeList(lang), asked)) throw plainError(words.placeRefused);
          place = asked;
        } else place = own;
      }
    } else {
      if (where !== 'new_once' && where !== 'new') throw plainError(words.where);
      cwd = typeof body?.cwd === 'string' ? body.cwd.trim() : '';
      const places = placeList(lang);
      if (places) {
        // Stage 6b (J12, G5): a pair New offers (never Recon), and never Recon's room as its folder.
        const want = asked ?? (body?.tab ? { space: (() => { try { return String(spacesApi()?.ofMode(String(body.tab)) ?? ''); } catch { return ''; } })(), mode: String(body.tab) } : null);
        if (!want || !want.mode) throw plainError(words.noTab);
        if (isolatedTab(want.mode) || want.space === 'recon') throw plainError(words.tabIsolated);
        if (!inPlaces(places, want)) throw plainError(words.placeRefused);
        if (!cwd || !cwd.startsWith('/') || cwd.length > 1000 || cwd.includes('\0')) throw plainError(words.noFolder);
        let room = false;
        try {
          room = ctx.get('recon')?.isRoom?.(cwd) === true;
        } catch {
          room = true;
        }
        if (room) throw plainError(words.roomFolder);
        tab = want.mode;
        place = want;
      } else {
        tab = String(body?.tab ?? '');
        if (!tab || isolatedTab(tab)) throw plainError(isolatedTab(tab) ? words.tabIsolated : words.noTab);
        if (!runTabs().some((entry) => entry.id === tab)) throw plainError(words.noTab);
        if (!cwd || !cwd.startsWith('/') || cwd.length > 1000 || cwd.includes('\0')) throw plainError(words.noFolder);
      }
      made = { createdIn: tab, createdSpace: '', createdBy: '' };
    }
    // J9 (3.5): a guarded place needs a Modes that can hold a run it cannot take now; else refused.
    if (place && isGuardedRun(place.space) && !holdSupported()) throw plainError(words.needsNewerModes(spaceName(place.space, lang)));
    let target;
    let runTab = '';
    if (where === 'session') target = { kind: 'session', sessionId };
    else {
      // Where its new threads open: the tab it was made in (or picked); never a sealed tab, never the Automations tab.
      runTab = place ? place.mode : tab && tab !== 'automations' && !isolatedTab(tab) ? tab : '';
      const lock = place ? lockedPreset(place.mode, place.space) : lockedPreset(effectiveRunTab(tab));
      const agentPreset = presetFor({ locked: lock, picked: typeof body?.preset === 'string' ? body.preset : '', chat: chatPreset, known: presets.known });
      target = { kind: where, create: { ...(cwd ? { cwd } : {}), ...(agentPreset ? { agentPreset } : {}) } };
    }
    const result = await createTask({ title, prompt, timing: plan.timing, target }, sessionId || undefined, lang);
    const id = String(result?.id ?? '');
    if (id) {
      // Item 4A, stage 6b: the mode it was made in ('recon' for a Recon-space thread, which seals it), its space and thread.
      notes.setCreatedIn(id, made.createdIn || tab);
      if (made.createdSpace) notes.setCreatedSpace(id, made.createdSpace);
      if (made.createdBy) notes.setCreatedBy(id, made.createdBy);
      notes.setMade(id, sessionId ? 'button' : 'new');
      if (runTab) notes.setRunTab(id, runTab);
      if (runTab && place) {
        notes.setRunSpace(id, place.space);
        if (isGuardedRun(place.space)) noteGuestRun(id, place.space, place.mode || runTab);
      }
    }
    await readTasks().catch(() => {});
    const next = Date.parse(String(result?.scheduledAt ?? '')) || firstRun(plan.record);
    return { id, title, next, nextWords: shortWhen(next, zoneOf(String(body?.timeZone ?? '')) ?? 'UTC', lang), runTab, runTabName: runTab ? (place ? placeName(place, lang) : tabLabel(effectiveRunTab(tab))) : '' };
  };

  /** 'runTab': change the tab an automation's new threads open in (Details → Runs in). */
  const changeRunTab = async (id, tab, expectedUpdatedAt, lang) => {
    const words = createWords(lang);
    const task = (await readTasks()).find((entry) => String(entry.id) === id);
    if (!task) throw plainError(words.gone);
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== (task.updatedAt ?? null)) throw plainError(words.changed);
    if (task.target?.kind !== 'new' && task.target?.kind !== 'new_once') throw plainError(words.notNewChat);
    if (isFinanceBrief(task)) throw plainError(words.financeTab);
    if (!ownTab()) throw plainError(words.runTabOff);
    if (runsInOf(task, notes.get(id)).fixed === 'reused') throw plainError(words.reused);
    if (!runTabs().some((entry) => entry.id === tab)) throw plainError(isolatedTab(tab) ? words.tabIsolated : words.noTab);
    if (sealed(task)) throw plainError(words.tabIsolated);
    // A locked tab always uses its lock: the stored preset follows it first (refused as a whole if that fails).
    const lock = lockedPreset(tab);
    if (lock && task.target?.create?.agentPreset !== lock) {
      if (!schedule) throw plainError(words.noScheduler);
      const result = await schedule.edit({ id, action: 'update', patch: { target: targetWithPreset(task.target, lock) }, expectedUpdatedAt: task.updatedAt ?? null });
      if (result?.code === 'schedule_conflict') throw plainError(words.changed);
      if (result?.code === 'schedule_not_found') throw plainError(words.gone);
      if (result?.code) throw plainError(words.refused, `The app refused: ${result.code}`);
    }
    notes.setRunTab(id, tab);
    notes.setPausedFor(id, '');
    notes.setPausedBack(id, '');
    await readTasks().catch(() => {});
  };

  /**
   * Item 4A, stage 6b (J6, D11, G2, G11): Details → Runs in → Change, with a space · mode pair. Same checks as before
   * plus the pair offered now; a guest-made automation stays in its own space or goes to Chat/Code with a folder picked
   * (as when made). Writes the stored place, so its preset follows the space's lock from then on. Saving the place it
   * already has (and its preset) writes nothing.
   */
  const changeRunPlace = async (id, want, expectedUpdatedAt, lang, body = {}) => {
    const words = createWords(lang);
    if (!spacesApi()) return changeRunTab(id, String(want?.mode ?? ''), expectedUpdatedAt, lang);
    const task = (await readTasks()).find((entry) => String(entry.id) === id);
    if (!task) throw plainError(words.gone);
    if (expectedUpdatedAt !== undefined && expectedUpdatedAt !== (task.updatedAt ?? null)) throw plainError(words.changed);
    if (task.target?.kind !== 'new' && task.target?.kind !== 'new_once') throw plainError(words.notNewChat);
    if (isFinanceBrief(task)) throw plainError(words.financeTab);
    const space = String(want?.space ?? '');
    const mode = String(want?.mode ?? '');
    if (!ownTab() && !isGuardedRun(space)) throw plainError(words.runTabOff);
    const note = notes.get(id);
    if (runsInOf(task, note).fixed === 'reused') throw plainError(words.reused);
    if (sealed(task)) throw plainError(words.tabIsolated);
    if (space === 'recon' || isolatedTab(mode)) throw plainError(words.tabIsolated);
    if (!inPlaces(placeList(lang), { space, mode })) throw plainError(words.placeRefused);
    // A guest-made automation: within its own space, or to Chat/Code with a folder picked (checked as when made).
    const madeIn = String(note.createdSpace ?? '');
    let cwd = String(task.target?.create?.cwd ?? '');
    if (isGuardedRun(madeIn) && space !== madeIn) {
      if (space !== 'chat' && space !== 'code') throw plainError(words.placeRefused);
      const picked = typeof body?.cwd === 'string' ? body.cwd.trim() : '';
      const refused = guestFolderRefusal(picked, madeIn, space, lang);
      if (refused) throw plainError(refused);
      cwd = picked;
    }
    if (isGuardedRun(space) && !holdSupported()) throw plainError(words.needsNewerModes(spaceName(space, lang)));
    // G2: the same place and preset as now: nothing is written.
    const now = placeOfTask(task, note);
    const lock = lockedPreset(mode, space);
    const presetAfter = lock || task.target?.create?.agentPreset;
    const cwdChanged = cwd !== String(task.target?.create?.cwd ?? '');
    if (!now.stored && now.space === space && now.mode === mode && presetAfter === task.target?.create?.agentPreset && !cwdChanged) return;
    if ((lock && task.target?.create?.agentPreset !== lock) || cwdChanged) {
      if (!schedule) throw plainError(words.noScheduler);
      const base = cwdChanged ? { ...task.target, create: { ...(task.target?.create ?? {}), cwd } } : task.target;
      const result = await schedule.edit({ id, action: 'update', patch: { target: lock ? targetWithPreset(base, lock) : base }, expectedUpdatedAt: task.updatedAt ?? null });
      if (result?.code === 'schedule_conflict') throw plainError(words.changed);
      if (result?.code === 'schedule_not_found') throw plainError(words.gone);
      if (result?.code) throw plainError(words.refused, `The app refused: ${result.code}`);
    }
    notes.setRunTab(id, mode);
    notes.setRunSpace(id, space);
    notes.setPlaceNote(id, '');
    notes.setPausedFor(id, '');
    notes.setPausedBack(id, '');
    notes.setPauseReason(id, '');
    // L4: Modes holds a run of it that nobody placed in a guarded space; a move to Chat/Code takes that away.
    noteGuestRun(id, isGuardedRun(space) ? space : '', mode);
    await readTasks().catch(() => {});
  };

  // The claim: a new thread of an automation with a run tab opens in that tab. Read synchronously and moved before any
  // await, so its first turn already has that tab's tools (as Finance does with its briefs). Only automations the
  // clock button or New made have a run tab; the assistant's and Finance's keep today's behaviour.
  /** The tab a still-blank new thread of an automation moves into, or '' (the same checks for both claims below). */
  const claimTab = (taskId, sessionId) => {
    if (!enabled() || !ownTab() || !taskId || !sessionId) return '';
    const tab = notes.get(taskId).runTab;
    if (!tab) return '';
    const entry = lastCatalog.find((item) => String(item.id) === taskId) ?? notes.known()[taskId];
    if (entry && entry.target?.kind !== 'new' && entry.target?.kind !== 'new_once') return '';
    if (isFinanceBrief(entry)) return '';
    if (!neverRan(sessionId) || isolated(sessionId) || isolatedTab(tab) || !tabList().some((mode) => mode.id === tab)) return '';
    if (modeOf(sessionId) === tab) return '';
    return typeof ctx.get('modes')?.set === 'function' ? tab : '';
  };
  /**
   * Item 4A, stage 6b: where a still-blank new thread of an automation goes: `{mode, space, stored, guarded}`, or null.
   * An automation with a stored place (J6) is claimed into it (a guarded one also when "New threads use the automation's
   * mode" is off, C2); one without keeps today's claim exactly (J5: the same call, no space).
   */
  const claimPlace = (taskId, sessionId) => {
    if (!enabled() || !taskId || !sessionId) return null;
    const note = notes.get(taskId);
    // Review finding (3.5): a stored guarded place with a Modes that is gone, off or cannot hold a run is never dropped
    // to today's claim (that run would open as a plain thread with the default tools): this add-on holds the run itself.
    if (isGuardedRun(note.runSpace) && note.runTab && !holdSupported()) {
      const entry = lastCatalog.find((item) => String(item.id) === taskId) ?? notes.known()[taskId];
      if (entry && entry.target?.kind !== 'new' && entry.target?.kind !== 'new_once') return null;
      if (!neverRan(sessionId) || selfHeld.has(sessionId)) return null;
      return { mode: String(note.runTab), space: note.runSpace, stored: true, guarded: true, selfHold: true };
    }
    const space = RUN_SPACES.includes(note.runSpace) && note.runTab && spacesApi() ? note.runSpace : '';
    if (!space) {
      const tab = claimTab(taskId, sessionId);
      return tab ? { mode: tab, space: '', stored: false, guarded: false } : null;
    }
    const guarded = isGuardedRun(space);
    if (!guarded && !ownTab()) return null;
    const entry = lastCatalog.find((item) => String(item.id) === taskId) ?? notes.known()[taskId];
    if (entry && entry.target?.kind !== 'new' && entry.target?.kind !== 'new_once') return null;
    if (isFinanceBrief(entry)) return null;
    if (!neverRan(sessionId) || isolated(sessionId) || isolatedTab(note.runTab)) return null;
    if (typeof ctx.get('modes')?.set !== 'function') return null;
    // A thread the early claim already placed (or held) keeps that.
    try {
      if (modesService()?.spaces?.held?.(sessionId)) return null;
    } catch {
      return null;
    }
    if (modeOf(sessionId) === note.runTab && threadPlace(sessionId).space === space) return null;
    return { mode: String(note.runTab), space, stored: true, guarded };
  };
  /** The options of a claim: today's for no stored place; a stored one names its space, held (guarded) or anyTick (J8, J11). */
  const claimOptions = (place, extra = {}) => (place.stored ? { claim: true, ...extra, space: place.space, ...(place.guarded ? { hold: true } : { anyTick: true }) } : { claim: true, ...extra });
  /** Item 4A, stage 6b (J9, J11, G1): a run its guarded place held: pause the automation now (not in the start-up grace). */
  const heldRun = (taskId, sessionId, space, lang = 'en', why = '') => {
    try {
      runs.held(sessionId, `Did not start: it runs in ${spaceName(space, lang)}, which could not take it now. Nothing was run.`);
    } catch {
      // the record is a nicety
    }
    if (Date.now() - startedAt < SPACE_GRACE_MS || !schedule) return;
    const note = notes.get(taskId);
    const watch = guardWatch(watchInputs(lastCatalog.find((item) => String(item.id) === taskId) ?? { id: taskId, target: { kind: 'new' } }, note));
    void guardedEdit({ id: taskId, action: 'update', patch: { active: false } }, () => {
      notes.setPausedFor(taskId, `space:${space}`);
      notes.setPauseReason(taskId, why || (watch.missing && watch.reason && watch.reason !== 'modeGone' ? watch.reason : 'unknown'));
    }).then((result) => {
      if (result?.code) warn(`could not pause an automation whose run was held: ${result.code}`);
    }).catch(() => {});
  };
  /**
   * Review finding (3.5): fresh threads of a guarded-place automation that no Modes could hold: every step is refused
   * here until the owner writes in the thread (then it is theirs). Kept in memory only (a restart starts no such turn).
   */
  const selfHeld = new Set();
  const holdSelf = (taskId, sessionId, space) => {
    selfHeld.add(sessionId);
    if (selfHeld.size > 500) selfHeld.delete(selfHeld.values().next().value);
    warn(`held a run of ${taskId}: it runs in ${space}, and Modes is off, gone or too old to keep it there`);
    heldRun(taskId, sessionId, space, 'en', 'modesOld');
  };
  ctx.on('agent/pre-step', ({ agent } = {}, next) => {
    try {
      if (selfHeld.size > 0 && agent?.id && selfHeld.has(String(agent.id))) return { kind: 'reject' };
    } catch {
      return { kind: 'reject' };
    }
    return next();
  }, { prepend: true });
  const claimInto = (session, event) => {
    try {
      if (session?.id && selfHeld.size > 0 && Array.isArray(event?.data?.inserted) && event.data.inserted.some((item) => (item?.source ?? item?.message?.source)?.kind === 'user')) selfHeld.delete(String(session.id));
      if (isHelper(session) || !session?.id) return;
      const ids = scheduledIds(event?.data?.inserted);
      if (ids.length !== 1) return;
      const id = String(session.id);
      const place = claimPlace(ids[0], id);
      if (!place) return;
      if (place.selfHold) {
        holdSelf(ids[0], id, place.space);
        return;
      }
      // Called synchronously: Modes places (or holds) the thread before its first step.
      let claim;
      try {
        claim = ctx.get('modes').set(id, place.mode, claimOptions(place));
      } catch (error) {
        claim = Promise.reject(error);
      }
      void Promise.resolve(claim).catch((error) => {
        if (error?.held === true) heldRun(ids[0], id, place.space);
        warn(`a new thread could not open in its ${place.stored ? 'place' : 'tab'} ${place.stored ? `${place.space} · ${place.mode}` : place.mode}: ${String(error?.message ?? error)}`);
      });
    } catch (error) {
      warn(`could not place a new thread in its tab: ${String(error?.message ?? error)}`);
    }
  };
  // The early claim (review finding, item 6): a 'new_once' automation reserves its thread's id when it is made, so that
  // chat is known when the scheduler opens it, before its message is sent. It moves into its tab here and waits (at
  // most 10 s) until that tab's tools and model are applied, so its first step already runs with them. A 'new' chat
  // is known only when its message arrives (the claim above), so its first step may still use the scheduled tab's model.
  // Item 4A, stage 6b: notes are read again first when the list changed meanwhile (J9), and a thread target whose
  // guarded space cannot take the run now is held (J11).
  ctx.on('schedule/resolve-agent', async (sessionId, next) => {
    const agent = await next();
    try {
      if (tasksStale) await readTasks().catch(() => {});
      const id = String(agent?.id ?? sessionId ?? '');
      const entry = id ? lastCatalog.find((item) => item?.target?.kind === 'new_once' && item.target.sessionId === id && !item.lastDelivery) : undefined;
      const place = entry ? claimPlace(String(entry.id), id) : null;
      if (place?.selfHold) holdSelf(String(entry.id), id, place.space);
      else if (place) {
        try {
          await ctx.get('modes').set(id, place.mode, claimOptions(place, { settle: true }));
        } catch (error) {
          if (error?.held === true) heldRun(String(entry.id), id, place.space);
          throw error;
        }
      } else if (id && enabled()) holdThreadRun(id);
    } catch (error) {
      warn(`a new thread could not open in its tab before its first step: ${String(error?.message ?? error)}`);
    }
    return agent;
  });
  /**
   * Item 4A, stage 6b (J11): a run into a thread that exists (a session target, or the one thread of "one new thread,
   * reused") whose guarded space cannot take it now: Modes holds its next scheduled turn; the automation pauses.
   */
  const holdThreadRun = (id) => {
    const modes = modesService();
    if (typeof modes?.spaces?.holdRun !== 'function') return;
    for (const task of lastCatalog) {
      const target = task?.target ?? {};
      if (task.status !== 'active' || target.sessionId !== id || (target.kind !== 'session' && !(target.kind === 'new_once' && task.lastDelivery))) continue;
      const taskId = String(task.id);
      const watch = guardWatch(watchInputs(task, notes.get(taskId)));
      if (!watch.missing || !watch.watch.startsWith('space:')) continue;
      const [reason] = pauseWords(watch.reason, watch.space, watch.mode, 'en');
      if (modes.spaces.holdRun(id, { space: watch.space, reason }) === true) heldRun(taskId, id, watch.space);
      return;
    }
  };

  // The tab-gone guard: an automation whose tab was switched off is paused once, with a note (the Creator Plus
  // precedent, for every tab). Switched on again by the owner, it is left alone; when the tab is back, the note says so.
  // A tab must be missing on two looks a minute apart (add-on tabs can register late at start), and an edit that does
  // not answer in 15 s frees the guard for the next look (lab finding: one stuck edit stopped it for good).
  let guarding = false;
  /** Tab id -> when it was first seen missing. */
  const missingSince = new Map();
  /** What the guard did last (shown on the page's data, for checks). */
  const guardState = { at: 0, paused: 0, problem: '' };
  // Tests set these shorter (as Modes does with its settle time).
  const GUARD_WAIT_MS = Math.max(1, Number(process.env.DSH_AUTOMATIONS_GUARD_WAIT_MS ?? 15_000) || 15_000);
  const MISSING_MS = Math.max(0, Number(process.env.DSH_AUTOMATIONS_TAB_GONE_MS ?? 50_000) || 0);
  /** One edit of the scheduler, given up after GUARD_WAIT_MS (it may still land: `then` runs when it does). */
  const guardedEdit = (request, then) => {
    const edit = Promise.resolve().then(() => schedule.edit(request));
    void edit.then((result) => { if (!result?.code) then?.(); }).catch(() => {});
    let timer;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve({ code: `no answer in ${Math.round(GUARD_WAIT_MS / 1000)} s` }), GUARD_WAIT_MS); timer.unref?.(); });
    return Promise.race([edit, late]).finally(() => clearTimeout(timer));
  };
  /** Item 4A, stage 6b (G1): no space pause in the first two minutes after start (the guard add-ons register late). */
  const SPACE_GRACE_MS = Math.max(0, Number(process.env.DSH_AUTOMATIONS_SPACE_GRACE_MS ?? 120_000) || 0);
  /** Stage 6b: what guardWatch needs for one automation, read now. */
  const watchInputs = (task, note) => ({
    task,
    note,
    ownTab: ownTab(),
    legacyWatch: watchedTab(task, note),
    modeThere: (id) => tabList().some((mode) => mode.id === id),
    guardState: (space) => (holdSupported() ? guardOfSpace(space) : 'unknown'),
    offered: (space, mode) => offeredIn(space, mode),
    available: (space) => spaceAvailable(space),
    shown: (space) => spaceShown(space),
  });
  const guardTabs = async (lang = 'en') => {
    if (guarding || !schedule || !enabled()) return;
    const on = tabList();
    if (on.length === 0) return;
    guarding = true;
    guardState.at = Date.now();
    // Kept until a look ends: the page may read it while the next look is still waiting.
    let problem = '';
    try {
      const now = Date.now();
      const inGrace = now - startedAt < SPACE_GRACE_MS;
      const live = Boolean(spacesApi());
      /** Watched keys missing on this look (the others are forgotten, so a key must be missing on two looks again). */
      const stillMissing = new Set();
      for (const task of lastCatalog) {
        const id = String(task.id);
        const note = notes.get(id);
        // Item 4A, stage 6b: the mode (as before), or the space of a guarded place (J9, J17); a Chat or Code place gets a
        // note, never a pause (J8). Without spaces in Modes: today's watch exactly.
        const watch = live ? guardWatch(watchInputs(task, note)) : (() => {
          const legacy = watchedTab(task, note);
          return { watch: legacy, missing: legacy ? !on.some((mode) => mode.id === legacy) : false, reason: 'modeGone', placeNote: '', space: '', mode: legacy };
        })();
        if (live && (note.placeNote ?? '') !== watch.placeNote) notes.setPlaceNote(id, watch.placeNote);
        const watched = watch.watch;
        if (!watched) {
          if (note.pausedFor) notes.setPausedFor(id, '');
          continue;
        }
        const isSpace = watched.startsWith('space:');
        // G1: right after start, a space is not judged at all (neither paused nor "back").
        if (isSpace && inGrace) continue;
        if (!watch.missing) {
          // Back again: it stays paused until the owner switches it on; the note says why.
          if (note.pausedFor) {
            notes.setPausedFor(id, '');
            notes.setPauseReason(id, '');
            if (task.status !== 'active') notes.setPausedBack(id, note.pausedFor);
          } else if (note.pausedBack && task.status === 'active') notes.setPausedBack(id, '');
          await keepLock(task, note);
          continue;
        }
        const key = isSpace ? `${watched}|${watch.mode}|${watch.reason}` : watched;
        stillMissing.add(key);
        if (note.pausedFor === watched || task.status !== 'active') continue;
        if (!missingSince.has(key)) missingSince.set(key, now);
        if (now - missingSince.get(key) < MISSING_MS) continue;
        const result = await guardedEdit({ id, action: 'update', patch: { active: false } }, () => notes.setPausedFor(id, watched));
        if (result?.code) {
          problem = `could not pause ${id}: ${result.code}`;
          warn(`could not pause an automation whose ${isSpace ? 'space cannot run it' : 'tab is off'}: ${result.code}`);
          continue;
        }
        notes.setPausedFor(id, watched);
        notes.setPausedBack(id, '');
        if (isSpace) notes.setPauseReason(id, watch.reason);
        guardState.paused += 1;
        warn(isSpace ? `paused ${id}: ${watch.space} cannot run it now (${watch.reason})` : createWords(lang).tabGone(watched));
      }
      for (const key of [...missingSince.keys()]) if (!stillMissing.has(key)) missingSince.delete(key);
    } catch (error) {
      problem = String(error?.message ?? error).slice(0, 200);
      warn(`the tab-gone guard stopped: ${problem}`);
    } finally {
      guardState.problem = problem;
      guarding = false;
    }
    // A tab seen missing for the first time is looked at again a minute later (the timer below reads the list).
  };
  /**
   * A locked tab always uses its lock (item 7): the stored preset of an automation whose new threads open in its own tab
   * follows that tab's lock (the lock changed, Runs in changed, or the setting was switched on later). Modes leaves a
   * scheduled chat's preset to the automation, so it is kept here. Item 4A, stage 6b (D11, J5): a stored place follows
   * its space's lock (a guarded one also with the setting off, C2); one without keeps the mode's lock, as before.
   */
  const keepLock = async (task, note) => {
    const kind = task?.target?.kind;
    const stored = RUN_SPACES.includes(note.runSpace) && Boolean(note.runTab) && Boolean(spacesApi());
    if ((kind !== 'new' && kind !== 'new_once') || !note.runTab || isFinanceBrief(task) || sealed(task, note)) return;
    if (!ownTab() && !(stored && isGuardedRun(note.runSpace))) return;
    // A reused chat that exists keeps its preset; a new target would only reserve another chat.
    if (kind === 'new_once' && task.lastDelivery) return;
    const lock = stored ? lockedPreset(note.runTab, note.runSpace) : lockedPreset(note.runTab);
    if (!lock || task.target?.create?.agentPreset === lock) return;
    const result = await guardedEdit({ id: String(task.id), action: 'update', patch: { target: targetWithPreset(task.target, lock) }, expectedUpdatedAt: task.updatedAt ?? null });
    if (result?.code) warn(`could not set the locked preset of ${task.id}: ${result.code}`);
  };
  const guardTimer = setInterval(() => void readTasks().catch(() => {}), 60_000);
  guardTimer.unref?.();
  ctx.effect(() => () => clearInterval(guardTimer), 'automations: tab-gone guard');

  // ---- Item 4A, stage 6b: the assistant's schedule tools from guest and sealed threads (J10, J15, Revision 2 L3) ---------

  /** Whether an automation's target is a thread (its session target, or the one thread of "one new thread, reused"). */
  const targetsThread = (taskId, top) => {
    const entry = lastCatalog.find((item) => String(item.id) === taskId) ?? notes.known()[taskId];
    const target = entry?.target ?? {};
    return Boolean(top) && (target.kind === 'session' || target.kind === 'new_once') && String(target.sessionId ?? '') === top;
  };
  const knownTask = (taskId) => Boolean(taskId) && (lastCatalog.some((item) => String(item.id) === taskId) || Boolean(notes.known()[taskId]));
  const SEALED_EDIT_OTHER = 'From a sealed thread you can change only automations that run in this thread. Nothing was changed. Tell the user they can change it on the Automations page.';
  const guestEditOther = (space) => `From ${space} you can change only automations made in ${space} that still run there, or ones delivered to this thread. Nothing was changed. Tell the user they can change it on the Automations page.`;
  const newTargetCall = (exec) => (exec?.name === 'schedule_create' || exec?.name === 'schedule_edit') && (exec?.arguments?.target === 'new' || exec?.arguments?.target === 'new_once');
  // J15: a guest edits only its own space's automations (or one delivered to it); a sealed thread only one that runs in it.
  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    if (exec?.name !== 'schedule_edit' || !exec?.agent?.id) return decision;
    try {
      const guard = guardOf(exec.agent.id);
      const top = String(guard.top || exec.agent.id);
      const guest = guestOf(guard);
      const sealedHere = guard.sealed === true;
      if (!guest && !sealedHere) return decision;
      const taskId = String(exec.arguments?.id ?? '');
      if (!knownTask(taskId)) await readTasks().catch(() => {});
      if (sealedHere) return targetsThread(taskId, top) ? decision : { kind: 'deny', reason: SEALED_EDIT_OTHER };
      const name = spaceName(guest, 'en');
      if (!knownTask(taskId)) return { kind: 'deny', reason: guestEditOther(name) };
      if (targetsThread(taskId, top)) return decision;
      // Made in this space AND running in it now (stored or derived): one the owner moved to Chat or Code is the owner's
      // from then on, or the guest could rewrite what a Terminal-holding run does (review finding). Fail closed.
      const note = notes.get(taskId);
      const entry = lastCatalog.find((item) => String(item.id) === taskId) ?? notes.known()[taskId];
      const runsHere = Boolean(spacesApi()) && placeOfTask(entry, note).space === guest;
      return note.createdSpace === guest && runsHere ? decision : { kind: 'deny', reason: guestEditOther(name) };
    } catch {
      return { kind: 'deny', reason: 'The automation could not be checked just now, so nothing was changed. Try again in a moment.' };
    }
  });
  // J10: a guest's new-thread automation gets its place (this space · this mode) before the tool's answer reaches the model.
  // L3: if that cannot be recorded, it is paused at once; if that fails too, it is deleted.
  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    try {
      if (!newTargetCall(exec) || !exec?.agent?.id || result?.isError === true || result?.value?.code) return decision;
      const guard = guardOf(exec.agent.id);
      const guest = guestOf(guard);
      if (!guest) return decision;
      const taskId = String(result?.value?.id ?? (exec.name === 'schedule_edit' ? exec.arguments?.id ?? '' : ''));
      if (!taskId) return decision;
      const mode = String(guard.mode ?? '') || modeOf(String(guard.top || exec.agent.id));
      try {
        notes.setRunTab(taskId, mode);
        notes.setRunSpace(taskId, guest);
        notes.setCreatedIn(taskId, mode);
        notes.setCreatedSpace(taskId, guest);
        notes.setCreatedBy(taskId, String(guard.top || exec.agent.id));
        notes.setMade(taskId, 'tool');
        const written = notes.get(taskId);
        if (written.runSpace !== guest || written.runTab !== mode) throw new Error('its place was not recorded');
        noteGuestRun(taskId, guest, mode);
        return decision;
      } catch (error) {
        warn(`a guest automation's place could not be recorded: ${String(error?.message ?? error)}`);
        const said = createWords('en').wrapperPaused(spaceName(guest, 'en'));
        const paused = schedule ? await guardedEdit({ id: taskId, action: 'update', patch: { active: false } }) : { code: 'no scheduler' };
        let text = said;
        if (paused?.code) {
          const deleted = schedule ? await guardedEdit({ id: taskId, action: 'delete' }) : { code: 'no scheduler' };
          text = deleted?.code ? `It could not be kept in ${spaceName(guest, 'en')} and could not be paused or deleted. Tell the user to delete it on the Automations page now.` : `It was deleted again: its place in ${spaceName(guest, 'en')} could not be recorded. Tell the user to try again in a moment.`;
        }
        const blocks = Array.isArray(decision?.content) ? decision.content : Array.isArray(result?.content) ? result.content : [];
        return { ...(decision ?? { kind: 'accept' }), content: [...blocks, { type: 'text', text }] };
      }
    } catch (error) {
      warn(`could not check a schedule tool's answer: ${String(error?.message ?? error)}`);
      return decision;
    }
  });

  // J16 (owner question O4): while Automations is off, nobody keeps a guest's runs in Devices or Workshop: those
  // automations are paused, with a note; switched on again they stay paused until the owner switches them on.
  // Review finding (3.5): the same while Modes is gone, off or too old to hold a run (after the start-up grace, since
  // Modes may register late; a run in that grace is held by `holdSelf`). Once per off period: switched on again by the
  // owner meanwhile, it is left alone.
  let offPaused = '';
  const pauseGuardedWhileOff = async () => {
    const cause = !enabled() ? 'automationsOff' : !holdSupported() && Date.now() - startedAt >= SPACE_GRACE_MS ? 'modesOld' : '';
    if (!cause) {
      if (enabled() && holdSupported()) offPaused = '';
      return;
    }
    if (offPaused === cause || !schedule) return;
    offPaused = cause;
    let catalog = [];
    try {
      catalog = await schedule.catalog();
    } catch {
      offPaused = '';
      return;
    }
    for (const task of catalog) {
      const id = String(task?.id ?? '');
      const kind = task?.target?.kind;
      if (!id || task.status !== 'active' || (kind !== 'new' && kind !== 'new_once')) continue;
      const note = notes.get(id);
      const space = isGuardedRun(note.runSpace) ? note.runSpace : isGuardedRun(note.createdSpace) ? note.createdSpace : '';
      if (!space) continue;
      const result = await guardedEdit({ id, action: 'update', patch: { active: false } });
      if (result?.code) {
        offPaused = '';
        warn(`could not pause ${id} while ${cause === 'modesOld' ? 'Modes cannot keep its runs in place' : 'Automations is off'}: ${result.code}`);
        continue;
      }
      notes.setPausedFor(id, `space:${space}`);
      notes.setPausedBack(id, '');
      notes.setPauseReason(id, cause);
    }
  };
  const offTimer = setInterval(() => void pauseGuardedWhileOff().catch(() => {}), 3000);
  offTimer.unref?.();
  ctx.effect(() => () => clearInterval(offTimer), 'automations: guarded runs while off');

  // 3.2: the service Modes reads (it refuses a guest's new-thread schedule when Automations cannot place it, J10; and
  // the sealed edit rule, Revision 2 L2).
  ctx.effect(() => ctx.provide('automations', Object.freeze({
    apiVersion: 1,
    /** Whether Automations is on and places a guest's new threads in its space. */
    placesGuestRuns: () => enabled() && Boolean(schedule),
    /**
     * Where an automation runs: `{space, mode, stored, sessionId, createdSpace}` (`sessionId`: the thread it writes into,
     * '' for new threads; `createdSpace`: the space of the thread that made it, '' when not known), or null for an unknown
     * task. Read only; never throws.
     * @param {string} taskId - the automation.
     */
    placeOf(taskId) {
      try {
        const id = String(taskId ?? '');
        const task = lastCatalog.find((item) => String(item.id) === id) ?? notes.known()[id];
        if (!task) return null;
        const place = spacesApi() ? placeOfTask(task) : { space: '', mode: notes.get(id).runTab ?? '', stored: false };
        const target = task.target ?? {};
        const sessionId = target.kind === 'session' || target.kind === 'new_once' ? String(target.sessionId ?? '') : '';
        return Object.freeze({ space: place.space, mode: place.mode, stored: place.stored === true, sessionId, createdSpace: String(notes.get(id).createdSpace ?? '') });
      } catch {
        return null;
      }
    },
  })), 'automations: service');

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
              // Plus is English only (decision 28): the page's x-dsh-locale header may still say Chinese; it gets English.
              const lang = 'en';
              if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 200000) throw new Error('request too large');
                  chunks.push(chunk);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const id = String(body?.id ?? '');
                const expected = body?.expectedUpdatedAt === null || typeof body?.expectedUpdatedAt === 'string' ? body.expectedUpdatedAt : undefined;
                if (body?.action === 'timeline') {
                  await readTasks();
                  res.end(JSON.stringify({ ...(await view(lang)), timeline: timeline(String(body.span ?? 'week')) }));
                  return;
                }
                // Item 6: the Schedule form (the clock button in a chat box, and New on this page).
                if (body?.action === 'context') {
                  res.end(JSON.stringify(await contextOf(typeof body.sessionId === 'string' ? body.sessionId : '', lang)));
                  return;
                }
                // Item 6: whether the clock button shows in a thread (asked only while "Scheduling from Recon" is off).
                if (body?.action === 'isolated') {
                  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
                  // `blank`: a draft that never ran follows the tab it is shown in, so the page asks again for it.
                  // Item 4A, stage 6b: `guarded` only when the thread's space could not be read, or its guard is not ready
                  // now (the same rule as the refusal); Devices and Workshop guests keep the clock (`guest` says which).
                  // The Devices mode at home has none, Creator Plus at home keeps it (owner, point 26).
                  const guard = sessionId ? guardOf(sessionId) : null;
                  res.end(JSON.stringify({ isolated: Boolean(sessionId) && (isolated(sessionId) || isolatedTab(modeOf(sessionId))), guarded: Boolean(sessionId) && Boolean(guardedRefusal(guard, readyNow())), ...(guard && guestOf(guard) ? { guest: guestOf(guard) } : {}), blank: Boolean(sessionId) && neverRan(sessionId) }));
                  return;
                }
                if (body?.action === 'preview') {
                  res.end(JSON.stringify(previewOf(body.when, String(body.timeZone ?? ''), lang)));
                  return;
                }
                if (body?.action === 'create') {
                  const made = await createFromForm(body, lang);
                  res.end(JSON.stringify({ ...(await view(lang)), made }));
                  return;
                }
                if (body?.action === 'run') await runNow(id);
                else if (body?.action === 'test') sent = await alerter.test();
                else if (['pause', 'resume', 'delete'].includes(body?.action)) await change(id, body.action, expected);
                else if (body?.action === 'edit') await editText(id, { title: body.title, prompt: body.prompt }, expected);
                else if (body?.action === 'creatorRun') await scheduleCreatorRun(body);
                else if (body?.action === 'preset') await changePreset(id, String(body.preset ?? ''), expected, lang);
                else if (body?.action === 'runTab') await changeRunTab(id, String(body.tab ?? ''), expected, lang);
                // Item 4A, stage 6b: Change under Runs in, with a space · mode pair (and a folder for a guest-made one).
                else if (body?.action === 'runPlace') await changeRunPlace(id, { space: String(body.space ?? ''), mode: String(body.mode ?? '') }, expected, lang, body);
                else if (body?.action === 'alerts' || body?.action === 'keep') {
                  if (!(await readTasks()).some((task) => String(task.id) === id)) throw new Error('That automation is gone.');
                  if (body.action === 'alerts') notes.setAlerts(id, body.alerts);
                  else notes.setKeep(id, body.keep ?? null);
                }
                else throw new Error('unknown action');
              }
              res.end(JSON.stringify({ ...(await view(lang)), ...(sent ? { sent } : {}) }));
            } catch (error) {
              res.statusCode = req.method === 'POST' ? 400 : 500;
              // The raw cause, when there is one, goes only behind the page's Details.
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300), ...(error?.details ? { details: String(error.details).slice(0, 300) } : {}) }));
            }
          },
        }),
      'automations: data route',
    );
  });
}
