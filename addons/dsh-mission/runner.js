/**
 * The mission run inside the app: starts the helper models, runs the proof commands, keeps the
 * run on disk, and looks after the app's goal that keeps the rounds coming. The order of work is
 * in lib/run.js; this file only does what a step needs done.
 *
 * A run lives in `<folder>/.dsh-mission/runs/<id>/`:
 *   run.json    the run as it stands (written after every step)
 *   log.jsonl   one line per step: what, which model, how long, how it ended
 *   steps/      what each helper answered, in full
 *   report.md   the final report
 * `<home>/mission/runs.jsonl` gets one line per finished run, for later review.
 */
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { OWN_FOLDER, real } from './lib/paths.js';
import { MODE_LABELS, shownAccess } from './lib/guard.js';
import { ADDON_NAMES, NEEDS_LABELS, asideReopens, closeDown, restartPauseFrom, clockAt, closeWait, decidedQuestions, noteDecidedSeen, endGate, needsOf, openQuestionRef, readNeeds, unaskedApprovals, undoneItems, waitMsOf, waitOf, waitedOf } from './lib/run.js';
import { APPROVAL_ERRORS, CONTINUE_RANGE, CONVERSATION_GONE, ENDED_BY_YOU, ROLES, addApproval, decideApproval, redoAllowed, helpersOf, openApprovals, settledParked, takeUpParked, asideWaiting, addAsk, addQuestion, decideOk, lapseAtEnd, pendingOks, afterEndOf, answerMany, answerQuestions, continueBlock, extraTime, followAnswer, lateAnswers, lateRedo, openQuestions, questionFrom, repairAsk, repairQuestion, tookMinutes, readAnswers, reviveRun, briefOf, lapLine, userNotes, noteStepTime, pauseRun, planFit, unpauseRun, applyChecks, cleanEnv, devicesChecks, dropCommands, noChecks, noCommands, offlineChecks, portsClosed, workersWithoutCommands, applyPlan, applyReview, applyUndo, applyWork, brokenChecks, checklist, finish, isLong, lapNotes, newRun, nextStep, reopen, report, tally } from './lib/run.js';
import { GUARD_TEXTS, OTHERS_WORKING, RESUME_TEXTS, choicesOf, conductorNote, formatPrompt, jsonOf, planPrompt, questionsPassPrompt, repairPrompt, reviewPrompt, statusFor, statusOf, workPrompt } from './lib/prompts.js';
import { REPAIRS_KEPT, TOOL_FAILS, applyOwn, cannotRun, causeKey, causeWords, readRepair, repairOf, requestRepair, widensAccess } from './lib/repair.js';
import { catalogText, changeWords, changedWords, resolveSettingAsk, settingsCatalog } from './lib/settings-fix.js';
import { DOWN_MAX_MS, FALLBACK_ASK_MS, clockWords, isServerDown, nextTryAt } from './lib/down.js';
import { ASSISTANT_NOTE, LOOK_WORKING_NOTE, readAssistant } from './lib/assistant.js';
import { ALONE_KINDS, STEP_KINDS, joinTold, liveLanes, newPool, poolLine, stepLanes, stillWorking, waitingText, workLanes } from './lib/pool.js';
import { pickEffort } from './lib/effort.js';
import { runCommand } from './lib/shell.js';
import { KINDS, SHAPE_NOTE, TEXT_KINDS, agreement, answerPrompt, citationCheck, goesUp, judgeOf, judgePrompt, limitedBy, loopLine, sameAnswer, questionsOf, questionsPrompt, readerCheckPrompt, readerVerdict, recipeText, revisePrompt, sameAddress, shapeCheck, sideBySide } from './lib/loop.js';

export const STEP_TOOL = 'mission_step';
/** The one tool a conversation in the app's PTC preset can call directly; every other tool is called from inside its program. */
export const PROGRAM_TOOL = 'run_code';
/** How long one call of the step tool waits for the step. A PTC program is stopped by the app after two minutes unless the model asks for more. */
export const WAIT_MS = { program: 100_000, direct: 70 * 60_000 };
/** Rounds in a row without a step before a run is paused. */
export const IDLE_ROUNDS = 5;
/** The app's cap on goal rounds. A long step takes several rounds of waiting, so this is far above a run's own step limit, which is what ends a run. */
const GOAL_ROUNDS = 3000;
/** How long one helper may work before it is stopped. */
const HELPER_MS = 30 * 60_000;
/** How long after a helper's failed turn it is closed, if the app has not settled it by then. */
export const FAILED_TURN_MS = 5000;
/** How long a continue waits for a step End stopped to settle (stage C). */
export const CLOSING_WAIT_MS = 10_000;
/** How long the question pass of a Mission with several helpers may work (stage D). */
export const QUESTIONS_MS = 90_000;
/** At most this many helper sessions of one conversation work at once (the app allows 8 per tree). */
export const HELPERS_PER_CONVERSATION = 8;
/** The app refused a new helper because 8 already work in the tree: tried again every 5 s, for at most 10 minutes. */
export const ACTIVATION_RETRY_MS = 5000;
export const ACTIVATION_MAX_MS = 10 * 60_000;
/** A lane that failed: its item waits this long before a helper takes it again (several helpers only). */
export const RETRY_AFTER_MS = 10_000;
/** A Mission whose last steps were cut by the time limit: ended anyway when they have not settled this long after. */
export const CUT_WAIT_MS = 60_000;
/** At most once per this long per run: the "needs you" event for a parked question or approval. */
export const NEEDS_EVERY_MS = 10 * 60_000;
/** Helpers in a row that could not do their item before a run pauses itself. */
export const FAIL_STREAK = 3;
/** Added to a failed check in a Bench Long run that reached for a device's port. */
/**
 * Item 4A, stage 6a integration: a check or continue in a thread that now sits in a guarded space (Devices, Workshop)
 * whose add-on gives a Mission no rules (off, too old, or a Modes read error) is not run.
 */
export const SPACE_HELD_TEXT = 'Not run: this thread is now in a space whose add-on gives a Mission no rules (Devices needs Devices/Bench, Workshop needs Creator Plus). Switch that add-on on, or move the thread back.';
export const PORTS_CLOSED_NOTE = 'Devices keeps the Mac\'s device ports closed to a Mission\'s checks, so this check could not open one. To run a Devices Mission without checks, switch them off in Settings → Devices.';
/** A text cut to `max` characters. */
const clip = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** A parsed reviewer answer that is a review: it has a verdict. */
const hasVerdict = (parsed) => typeof parsed?.verdict === 'string';
const ROLE_NAMES = { plan: 'planner', implement: 'worker', review: 'reviewer', judge: 'judge', check: 'checker', questions: 'question pass', repair: 'repair helper' };
/** The work loop's roles as a team names them (Model Tiers, plan step S6). */
const TEAM_ROLE = { plan: 'lead', implement: 'helper', review: 'checker', check: 'checker', judge: 'judge' };

/** App 0.2.2-rc.2 takes the task's fields at the top level of the spec; rc.1 took them under `request`. */
const startChild = (subagents, spec) => subagents.startActivation({ ...spec.request, ...spec });

async function awaitChild(started, signal) {
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => {
      Promise.resolve(started.dispose?.()).catch(() => {});
      reject(signal.reason instanceof Error ? signal.reason : new Error('Stopped.'));
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

/**
 * Why a helper's model failed, from the app's result: a model or connection error, or a refusal.
 * @param {{stopReason?: string, diagnostic?: string}} result - the helper's result.
 * @returns {string} the reason ('' when it finished).
 */
export function helperFailure(result) {
  const reason = result?.stopReason;
  if (reason !== 'error' && reason !== 'refusal') return '';
  const detail = String(result?.diagnostic ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return `The helper's model ${reason === 'refusal' ? 'refused the task' : 'failed'}${detail ? `: ${detail}` : '.'}`;
}

/** Said when a helper never got as far as its model: no request was made, no tool ran. */
export const NEVER_REACHED = 'The app stopped the helper before it reached the model (a route or setting problem).';
/** What the step tool says while the run is paused. */
export const PAUSED_TEXT = 'The run is paused; it carries on when the user presses Resume.';
/** Step errors in a row before a run pauses itself. */
export const ERROR_STREAK = 3;
/**
 * Point 17: the start text's sentence about when it needs you (Start Mission and a typed /mission).
 * @returns {string} with a leading space.
 */
export function needsStartText(run) {
  const needs = needsOf(run);
  const minutes = waitOf(run);
  if (needs === 'decide') return ' When it needs you: Full auto. It asks nothing: it decides questions itself and never gives itself permission; the report lists what it decided and what it skipped.';
  if (needs === 'wait') return ` When it needs you: Ask and wait. Every question and every request for your yes waits for you; other items go on. When only waiting is left, it waits ${minutes > 0 ? `up to ${minutes} minute${minutes === 1 ? '' : 's'}` : 'until you answer'}.`;
  return ` When it needs you: Ask, keep working. Questions with a safe default go on with it; when only your answers can move it on, it waits ${minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : 'until you answer'}.`;
}

/** Point 17: what Resume says while a Mission waits for your answers (it is not paused; it carries on when you answer). */
export const WAIT_RESUME_TEXT = 'The Mission is not paused: it waits for your answers in the card above the chat box, and carries on by itself when you answer.';
/** Point 17: what a resume of an ended Mission that Finish it can take up says. */
export const FINISH_SHOW_TEXT = 'That Mission has ended. Press Finish it above the chat box: it brings back what is still open and what it decided itself, then the same Mission does the rest.';
/** Point 17: Finish it's errors (plain words, shown on the card). */
export const FINISH_ERRORS = Object.freeze({
  nothing: 'Nothing to finish: answer a question, change what it decided or allow a step first.',
  busy: 'It is being taken up already. Look at the strip in a moment.',
  already: 'This Mission is going on again already. Answer in the card while it works.',
});
/** Lab check of point 19: an OK after the end pressed while the Mission is on again. */
export const OK_RUNNING = 'This Mission is on again: answer the change in the card above the chat box.';
/** Point 17: what a note says while the Mission waits for your answers. */
export const NOTE_WHILE_WAITING = 'Your note reaches the Mission when it goes on. It still waits for your answers in the card.';
/** Point 17: what the continue says for an answer that matches what the Mission did. */
export const SAME_ANSWER = (question) => ` Your answer to "${String(question ?? '').replace(/\s+/g, ' ').trim().slice(0, 160)}" matches what it did, so nothing is done again for it.`;
export const SAME_ONLY_TEXT = 'Noted. Your answers match what it did, so nothing needs doing again; the Mission stays finished.';

// ---- Stage E (20 November 2026) ---------------------------------------------------------------------------------

/** Said when a Mission's model server does not answer (the stopped-by-itself alert's reason). */
export const DOWN_REASON = 'Your model server does not answer. The Mission waits and tries again by itself.';
/** Said when it does not answer and Try again by itself is off for the Mission. */
export const DOWN_OFF_TEXT = 'Your model server does not answer, and Try again by itself is off for this Mission. Start the server, then press Resume.';
/** What Try now (and Resume while it waits for its server) says. */
export const TRY_NOW_TEXT = 'It tries your model server again now.';
export const NOT_DOWN_TEXT = 'The Mission is not waiting for its model server.';
/** What mission_step says while it waits for its model server. */
export const DOWN_STEP = (nextAt, endsAt) => `Your model server does not answer. The Mission waits and tries again by itself (next try at ${clockWords(nextAt)}); this wait does not count against its time limit. If the server is not back by ${clockWords(endsAt)}, the Mission ends with its report. Tell the user this in one line and do not call mission_step again.`;
/** After a restart (point 9). */
export const RESTART_OFF_TEXT = 'Paused: the app restarted, and Carry on by itself after a restart is off for this Mission. Press Resume beside the chat box to carry on, or End to close it with its report.';
export const RESTART_OLD_TEXT = 'Paused: the app restarted. This Mission started before it could carry on by itself. Press Resume beside the chat box to carry on, or End to close it with its report.';
export const RESTART_OPEN_TEXT = 'Paused: the app restarted and could not open this thread by itself. It carries on when you open the thread, or press Resume.';
export const CARRY_BRAKE_TEXT = 'Paused: it was carried on 3 times after the app restarted without finishing a step, so this time it waits for you. Press Resume to try again.';
export const RESTART_TRASH_TEXT = 'Paused: the app restarted, and this thread is in the trash. Put it back to carry on, or End the Mission.';
export const CARRIED_TOLD = 'The app restarted; the Mission carries on by itself. Items a helper was working on go on from where they stopped.';
/** Carry-ons in a row with no finished step, within CARRY_BRAKE_MS, before it waits for you. */
export const CARRY_BRAKE = 3;
export const CARRY_BRAKE_MS = 30 * 60_000;
/** How long one repair helper may work. */
export const REPAIR_MS = 10 * 60_000;
/** Point 12: what a Mission's helper is told about a yes another add-on asks for. */
export const ADDON_TEXTS = Object.freeze({
  parked: (name) => `This needs the user's yes (${name} asks). It waits in the Mission's card; the other helpers carry on. Do not do the same thing another way. Finish what you can without it, then start your report with NEEDS YES: and say what waits.`,
  parkedAct: (name) => `This needs the user's yes (${name}): it waits in the Mission's card above the chat box, and nothing is done until then. Carry on with the rest.`,
  cannot: (name) => `${name}'s own rule does not let a Mission's helper do this. It is listed in the Mission's report. Do not try another way; finish what you can without it.`,
});
/** A Mission's own Budget allowance, raised by half (rounded up), never past these. */
export const BUDGET_RAISE = Object.freeze({ steps: { round: 500, max: 50_000 }, tokens: { round: 10_000_000, max: 500_000_000 } });
/** @returns {number} the raised allowance (0: it cannot be raised any more). */
export function raisedLimit(limit, max) {
  const rule = BUDGET_RAISE[limit];
  const from = Math.max(0, Number(max) || 0);
  if (!rule || !(from > 0)) return 0;
  const to = Math.min(rule.max, Math.ceil((from * 1.5) / rule.round) * rule.round);
  return to > from ? to : 0;
}

/**
 * The grace after a Long run's deadline: 10% of its time, at most 10 minutes. A step still running past
 * deadline plus grace is stopped, and a run that does not move past it is ended with its report.
 * @param {object} run - a Long run.
 * @returns {number} the grace in ms.
 */
export function graceMs(run) {
  // No time limit: no deadline, so no grace either.
  if (!(Number(run?.long?.deadline) > 0)) return 0;
  // A Mission continued after its end (stage C): 10% of the time the continue gave it.
  const continues = Array.isArray(run.long.continues) ? run.long.continues : [];
  const minutes = continues.length > 0 ? Number(continues[continues.length - 1].minutes) || 0 : Number(run?.long?.minutes) || 0;
  return Math.min(10 * 60_000, Math.round(minutes * 60_000 * 0.1));
}

/**
 * A step error in plain words, for the pause it causes (the raw error is kept as details).
 * @param {string} raw - the error.
 * @returns {string} one or two plain sentences.
 */
export function plainError(raw) {
  const text = String(raw ?? '');
  if (/reasoning|thinking level|effort/i.test(text)) return 'The model does not take the thinking level Mission asked for.';
  if (/model[_ ]not[_ ]found|not found.*model|unknown model|no such model/i.test(text)) return 'The model named for a helper was not found by its provider. Check the model in Settings → Model tiers or Mission.';
  if (/ECONNREFUSED|connection refused|fetch failed|ETIMEDOUT|ENOTFOUND|socket hang up|network/i.test(text)) return 'The model\'s server did not answer.';
  if (/sub-?agent/i.test(text)) return 'The app could not start a helper.';
  if (text.startsWith(NEVER_REACHED)) return NEVER_REACHED;
  return 'The same step failed three times in a row.';
}

/**
 * Why the app's goal of a run was blocked, in plain words.
 * @param {{code?: string, message?: string} | undefined} reason - the app's GoalBlockReason.
 * @returns {string} what the user reads.
 */
export function blockedText(reason) {
  const code = String(reason?.code ?? '');
  const message = String(reason?.message ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (code === 'round-limit') return 'The app\'s limit of rounds for this run was reached. Press Resume to give it new rounds.';
  if (code === 'prompt-rejected') return 'The app refused the run\'s next round before it started (a limit such as the Budget guard). Press Resume once it is sorted.';
  if (code === 'queue-failed') return 'The app could not start the run\'s next round. Press Resume to try again.';
  if (code === 'model-reported') return `The thread's model said the run cannot go on${message ? `: ${message}` : ''}. Press Resume to try again.`;
  return `The app stopped giving the run rounds${message ? `: ${message}` : ''}. Press Resume to try again.`;
}

/**
 * A model choice as the settings hold it.
 * @param {unknown} value - `{provider, model}`.
 * @returns {{provider: string, model: string} | undefined} the choice; undefined when it names nothing.
 */
export function routeOf(value) {
  const provider = typeof value?.provider === 'string' ? value.provider.trim() : '';
  const model = typeof value?.model === 'string' ? value.model.trim() : '';
  return provider && model ? { provider, model } : undefined;
}

/**
 * Which model a role runs on: the project's own choice, then Mission's, then Model Tiers' role
 * model, then the conversation's model.
 * @param {object} choices - what is set.
 * @param {string} role - plan, implement or review.
 * @returns {{provider: string, model: string, from: string} | undefined} the model and where the choice came from.
 */
export function pickRoute({ project, defaults, tierRoute, current }, role) {
  const own = routeOf(project?.[role]);
  if (own) return { ...own, from: 'project' };
  const mine = routeOf(defaults?.[role]);
  if (mine) return { ...mine, from: 'mission' };
  const tier = routeOf(tierRoute);
  if (tier) return { ...tier, from: 'tiers' };
  const now = routeOf(current);
  return now ? { ...now, from: 'conversation' } : undefined;
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} deps - what the plugin shares with the runner.
 * @returns {object} starting, stepping and ending runs.
 */
export function createRunner(ctx, { settings, pointsOf, afterCommand, warn, home, failedTurnMs = FAILED_TURN_MS, callsAtOnce = () => 4, helperMs = HELPER_MS, closingWaitMs = CLOSING_WAIT_MS, claims, onChange, agentOf, mayRun, grants, activationRetryMs = ACTIVATION_RETRY_MS, activationMaxMs = ACTIVATION_MAX_MS, questionsMs = QUESTIONS_MS, retryAfterMs = RETRY_AFTER_MS, cutWaitMs = CUT_WAIT_MS, assistantOf, settingsIndex = () => [], liveRules }) {
  /** Conversation id -> its run. */
  const runs = new Map();
  /**
   * Run events (Long run part, step 45): started, step, needs-you, paused, stalled, stopped-by-itself,
   * finished. Told a moment later, never inside the app's own event handling (it does not allow re-entry),
   * and a listener that fails changes nothing.
   */
  const listeners = new Set();
  const emit = (type, conversation, run, extra = {}) => {
    if (listeners.size === 0) return;
    const event = Object.freeze({ type, conversation, runId: run?.id ?? '', kind: run?.kind === 'long' ? 'long' : 'mission', goal: noCommands(run) ? '' : String(run?.goal ?? '').slice(0, 200), folder: run?.root ? basename(run.root) : '', status: run?.status ?? '', at: Date.now(), ...extra });
    const timer = setTimeout(() => {
      for (const listener of listeners) {
        try {
          const done = listener(event);
          if (done && typeof done.catch === 'function') done.catch((error) => warn(`a run event listener failed: ${String(error?.message ?? error)}`));
        } catch (error) {
          warn(`a run event listener failed: ${String(error?.message ?? error)}`);
        }
      }
    }, 0);
    timer.unref?.();
  };
  /**
   * Conversation id -> its helper pool (stage D, lib/pool.js): the lanes at work, the ones closing, and what the
   * conductor has not been told yet. With one helper at once there is at most one lane, as stage C's one step.
   */
  const pools = new Map();
  const poolOf = (id) => {
    const key = String(id ?? '');
    let pool = pools.get(key);
    if (!pool) {
      pool = newPool();
      pools.set(key, pool);
    }
    // The holds of parked items come back after a restart (the claims live in memory only).
    if (!pool.built && claims && runs.has(key)) {
      pool.built = true;
      rebuildHolds(key, runs.get(key));
    }
    return pool;
  };
  /**
   * The files of parked items held for them again from the run (item.claims): after a restart, and on a continue (the
   * end let every claim go).
   */
  const rebuildHolds = (id, run) => {
    const root = run?.root ? real(run.root) : '';
    if (!claims || !root) return;
    claims.rebuild(String(id ?? ''), (run.items ?? []).filter((item) => item.status === 'parked' && Array.isArray(item.claims)).map((item) => ({ item: item.id, paths: item.claims.map((file) => join(root, file)) })));
  };
  /**
   * The approvals the page is sent: every open one (at most 40), then the ones Full auto did not ask (point 17), then the
   * newest answered ones, up to 40 in all; in order.
   */
  const shownApprovals = (run) => {
    const all = Array.isArray(run.approvals) ? run.approvals : [];
    const open = all.filter((entry) => entry.status === 'open').slice(0, 40);
    const unasked = all.filter((entry) => entry.status === 'unasked').slice(0, Math.max(0, 40 - open.length));
    const rest = all.filter((entry) => entry.status !== 'open' && entry.status !== 'unasked');
    const room = Math.max(0, 40 - open.length - unasked.length);
    const keep = new Set([...open, ...unasked, ...rest.slice(Math.max(0, rest.length - room))]);
    return all.filter((entry) => keep.has(entry));
  };
  /** The oldest lane of a conversation (a settled one waiting to be collected counts while none works). */
  const leadOf = (id) => {
    const pool = pools.get(String(id ?? ''));
    if (!pool) return undefined;
    const all = [...pool.lanes.values()];
    return all.find((lane) => !lane.done) ?? all[0];
  };
  /** Tell the waiting mission_step calls that something happened. */
  const wake = (id) => {
    const pool = pools.get(String(id ?? ''));
    if (!pool) return;
    for (const resolve of [...pool.waiters]) resolve('news');
    pool.waiters.clear();
  };
  /** Something the strip shows changed (index.js bumps the stamp and looks at keep-awake). */
  const changed = (id) => {
    try {
      onChange?.(String(id ?? ''));
    } catch (error) {
      warn(`could not tell the strip: ${String(error?.message ?? error)}`);
    }
  };
  /** Wait for news (a lane settles, a park, an answer, the end), at most `ms`, or until the call is cut off. */
  const news = (id, ms, signal) => new Promise((resolve) => {
    const pool = poolOf(id);
    let timer;
    let onAbort;
    const done = (why) => {
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      pool.waiters.delete(done);
      resolve(why);
    };
    timer = setTimeout(() => done('wait'), Math.max(0, ms));
    timer.unref?.();
    onAbort = () => done('cut');
    if (signal?.aborted) {
      done('cut');
      return;
    }
    signal?.addEventListener?.('abort', onAbort, { once: true });
    pool.waiters.add(done);
  });
  /** The folder relative path of a file in a run's folder ('' when outside). */
  const relOf = (run, path) => {
    const root = real(run.root);
    const rel = relative(root, String(path ?? ''));
    return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : '';
  };
  /** A lane of the conversation's pool by id. */
  const laneById = (id, laneId) => pools.get(String(id ?? ''))?.lanes.get(String(laneId ?? ''));
  /** Conversation id -> rounds in a row in which the step tool was not called. */
  const idle = new Map();
  /** Stage E: this boot's restart decisions, Missions being carried on now, and tool failures in a row per conversation. */
  const restartDecisions = new Map();
  const carrying = new Set();
  const toolFails = new Map();
  const indexFile = typeof home === 'function' ? join(home('mission'), 'active-runs.json') : '';
  const finishedFile = typeof home === 'function' ? join(home('mission'), 'runs.jsonl') : '';

  const readIndex = () => {
    try {
      const read = JSON.parse(readFileSync(indexFile, 'utf8'));
      return read && typeof read === 'object' && !Array.isArray(read) ? read : {};
    } catch {
      return {};
    }
  };
  const writeIndex = (id, value) => {
    if (!indexFile) return;
    try {
      const table = readIndex();
      if (value) table[id] = value;
      else delete table[id];
      // Old entries make room; the runs themselves stay in their folders.
      const kept = Object.fromEntries(Object.entries(table).slice(-200));
      mkdirSync(dirname(indexFile), { recursive: true });
      const temp = `${indexFile}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(kept));
      renameSync(temp, indexFile);
    } catch (error) {
      warn(`could not note the run: ${String(error?.message ?? error)}`);
    }
  };
  const dirOf = (run) => join(run.root, OWN_FOLDER, 'runs', run.id);
  const save = (run) => {
    const dir = dirOf(run);
    mkdirSync(join(dir, 'steps'), { recursive: true });
    const temp = join(dir, `run.json.${process.pid}.tmp`);
    writeFileSync(temp, JSON.stringify(run, null, 1));
    renameSync(temp, join(dir, 'run.json'));
  };
  const record = (run, entry) => {
    try {
      appendFileSync(join(dirOf(run), 'log.jsonl'), `${JSON.stringify({ at: new Date().toISOString(), step: run.steps, ...entry })}\n`);
    } catch (error) {
      warn(`could not write the run log: ${String(error?.message ?? error)}`);
    }
  };
  /** @returns {number} when a run last logged a step or an event (0 when its log cannot be read). */
  const lastLoggedAt = (run) => {
    try {
      const rows = readFileSync(join(dirOf(run), 'log.jsonl'), 'utf8').trim().split('\n').slice(-50).reverse();
      for (const row of rows) {
        try {
          const at = Date.parse(JSON.parse(row)?.at ?? '');
          if (Number.isFinite(at) && at > 0) return at;
        } catch { /* a broken line: the one before it */ }
      }
    } catch { /* no log */ }
    return 0;
  };
  const keep = (run, name, text) => {
    try {
      writeFileSync(join(dirOf(run), 'steps', `${String(run.steps + 1).padStart(3, '0')}-${name}.md`), String(text ?? ''));
    } catch {
      /* the log line still says what happened */
    }
  };

  /**
   * A run read from its folder (stage D): an item a helper was working on when the app closed is marked as stopped part
   * way (its next helper is told), and a wait for the user is over (the restart pauses the run anyway).
   */
  /** Runs read from their folder whose Wait for me ran out before the report round (the first sweep ends them). */
  const overLoaded = new WeakSet();
  const loaded = (run) => {
    for (const item of Array.isArray(run?.items) ? run.items : []) {
      if (!item.lane) continue;
      delete item.lane;
      if (item.status === 'open') item.interrupted = true;
    }
    // Point 17: a quiet wait (the goal paused by Mission) goes on across a restart; stage D's wait is over (the restart
    // pauses that run). A wait that ran out before its report round (review of point 17) ends at the first sweep with
    // that report, not with a new wait.
    if (isLong(run) && run.long?.waitingSince && run.long?.quietGoal !== true) delete run.long.waitingSince;
    if (isLong(run) && run.long?.waitOver) {
      if (run.status === 'running') overLoaded.add(run);
      else delete run.long.waitOver;
    }
    // Stage E: a wait for the model server goes on across a restart; its next try is at once.
    if (isLong(run) && run.long?.down) {
      run.long.down.nextAt = Date.now();
      delete run.long.probing;
    }
    if (isLong(run) && run.long?.repair) run.long.repair.working = false;
    return run;
  };
  /** @returns {object | undefined} the conversation's run, from memory or from its folder. */
  const runOf = (id) => {
    if (runs.has(id)) return runs.get(id);
    const where = readIndex()[id];
    if (!where?.root || !where?.id) return undefined;
    try {
      const run = JSON.parse(readFileSync(join(where.root, OWN_FOLDER, 'runs', where.id, 'run.json'), 'utf8'));
      if (run?.id !== where.id) return undefined;
      runs.set(id, loaded(run));
      return run;
    } catch {
      return undefined;
    }
  };

  const goalsOf = () => {
    const goals = ctx.get('goals');
    return goals?.create && goals?.get ? goals : undefined;
  };
  const goalRef = (agent) => {
    try {
      const view = goalsOf()?.get(agent);
      return view ? { view, ref: { id: view.id, revision: view.revision } } : undefined;
    } catch {
      return undefined;
    }
  };

  /** @returns {'same' | 'roles'} whether this conversation's helpers use its own model or the roles' models. */
  const helperPolicy = (parent) => {
    try {
      const modes = ctx.get('modes');
      const chosen = modes?.helperModels ? modes.helperModels(parent?.id) : undefined;
      return chosen === 'roles' ? 'roles' : 'same';
    } catch {
      return 'same';
    }
  };

  const routeFor = (parent, role, root, index = 0) => {
    const now = settings();
    // Stage E: a fallback model you allowed for this Mission's helpers (never in Recon; the conductor keeps its model).
    const owner = runs.get(parent?.id);
    const fallback = isLong(owner) && owner.status === 'running' && !noCommands(owner) ? routeOf(owner.long?.fallback) : undefined;
    if (fallback) return { ...fallback, from: 'fallback' };
    // The work loop's own roles (judge, check) take the reviewer's place outside a team.
    const base = role === 'judge' || role === 'check' ? 'review' : role;
    let tierRoute;
    try {
      const tiers = ctx.get('modelTiers');
      const tier = tiers?.resolveTier?.(parent.id);
      tierRoute = tier ? tiers.roleRoute(tier.id, base) : undefined;
    } catch {
      tierRoute = undefined;
    }
    let current;
    try {
      current = parent.model?.current?.();
    } catch {
      current = undefined;
    }
    // One model for everything is the default: with it, every role runs on the conversation's
    // model and nothing else has to be loaded. The roles' own models apply only when the
    // conversation is set to "different models" (the Modes add-on keeps that choice).
    // A Recon conversation's helpers use its own model: the one Recon's rules were checked for.
    if (helperPolicy(parent) === 'same' || noCommands(runs.get(parent?.id))) {
      const only = routeOf(current);
      return only ? { ...only, from: 'same' } : undefined;
    }
    // The work loop's team (plan step S6), only while the loop is on in this run.
    if (runs.get(parent?.id)?.loop) {
      try {
        const member = ctx.get('modelTiers')?.teamRoute?.(parent.id, TEAM_ROLE[role] ?? 'helper', index);
        const route = routeOf(member);
        if (route) return { ...route, from: 'team', ...(Number.isFinite(member.maxTokens) && member.maxTokens > 0 ? { maxTokens: member.maxTokens } : {}) };
      } catch {
        /* no team: the roles as before */
      }
    }
    // The settings hold a project's folder as the app names it; compare in the real spelling.
    const here = real(root);
    const project = now.projects[here] ?? Object.entries(now.projects).find(([folder]) => real(folder) === here)?.[1];
    return pickRoute({ project, defaults: now.roles, tierRoute, current }, base);
  };

  /** Long run effort by role (step 59): planner and reviewer think harder than the workers. */
  const ROLE_EFFORT = { plan: 'high', review: 'high', implement: 'medium', judge: 'high', check: 'high' };
  /** Pause a run a moment after the step under way has returned (from inside a step: hold stops that step). */
  const holdAfter = (agent, reason, details = '') => {
    const timer = setTimeout(() => {
      try {
        api.hold(agent, reason, { details });
      } catch (error) {
        warn(`could not pause the run: ${String(error?.message ?? error)}`);
      }
    }, 0);
    timer.unref?.();
  };
  /** Helpers that only read (the planner, the reviewer, a format ask): child id -> its name for the refusal. */
  const readers = new Map();
  /**
   * Helpers at work (child id -> how to close one). A helper whose turn failed while something still
   * waited in its inbox is never settled by the app; it is closed a moment later, so its result comes
   * and the run goes on (16 November: a Recon run hung on its planner).
   */
  const working = new Map();
  /**
   * What each helper did, counted from its session events while it works (the app's result says only how it
   * stopped): model requests (`step/start`) and tool calls (`tool/call`), its own and its helpers'. Helper id ->
   * counts; `known` is false where no session events reach the runner (then nothing is claimed from them).
   */
  const evidence = new Map();
  let evidenceKnown = false;
  const countFor = (id) => {
    if (!evidence.has(id)) {
      evidence.set(id, { steps: 0, tools: 0 });
      while (evidence.size > 500) evidence.delete(evidence.keys().next().value);
    }
    return evidence.get(id);
  };
  /** Helper id -> its run, role and item (for helperOf). */
  const roles = new Map();
  try {
    if (typeof ctx.on === 'function') evidenceKnown = true;
    ctx.on?.('session/event', (session, event) => {
      const type = event?.type;
      if (type === 'step/start' || type === 'tool/call') {
        const id = String(session?.id ?? '');
        const parent = String(session?.header?.parentSession ?? '');
        // A helper's own events, and those of a helper it started.
        const key = evidence.has(id) || roles.has(id) ? id : parent && (evidence.has(parent) || roles.has(parent)) ? parent : parent ? id : '';
        if (!key) return;
        const counts = countFor(key);
        counts[type === 'tool/call' ? 'tools' : 'steps'] += 1;
        return;
      }
      if (event?.type !== 'turn/end' || event.data?.reason?.kind !== 'error') return;
      const close = working.get(String(session?.id ?? ''));
      if (!close) return;
      const timer = setTimeout(() => {
        if (working.get(String(session.id)) === close) close();
      }, failedTurnMs);
      timer.unref?.();
    });
  } catch {
    /* no session events here (a test): the helper's own time limit still holds */
  }
  /** The reader a helper is, or the one it was started by (its parent, and so on up). */
  const readerUp = (id) => {
    let current = String(id ?? '');
    for (let depth = 0; current && depth < 8; depth += 1) {
      const found = readers.get(current);
      if (found) return found;
      let agent;
      try {
        agent = ctx.get('agents')?.get?.(current) ?? (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === current);
      } catch {
        agent = undefined;
      }
      const parent = agent?.header?.parentSession ?? agent?.session?.header?.parentSession;
      if (typeof parent !== 'string' || parent === current) return undefined;
      current = parent;
    }
    return undefined;
  };
  /** Models that refused a thinking level ("provider/model"): their helpers get none from then on. */
  const noEffort = new Set();
  /** The thinking levels a model lists ("provider/model" -> ids; undefined while not known). */
  const levels = new Map();
  const levelsOf = async (route) => {
    if (!route) return undefined;
    const key = `${route.provider}/${route.model}`;
    if (levels.has(key)) return levels.get(key);
    let llm;
    try {
      llm = ctx.get('llm');
    } catch {
      llm = undefined;
    }
    if (!llm?.resolveModelInfo) return undefined;
    let timer;
    try {
      // Never held up by a model server that does not answer.
      const info = await Promise.race([
        llm.resolveModelInfo(route.provider, route.model),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('model info timeout')), 5000); timer.unref?.(); }),
      ]);
      const ids = (Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : []).map((effort) => String(effort?.id ?? '')).filter(Boolean);
      levels.set(key, ids);
      return ids;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };
  /** The tier's own effort for a conversation ('off' sends none). */
  const tierEffortOf = (parent) => {
    try {
      return ctx.get('modelTiers')?.resolveTier?.(parent?.id)?.effort;
    } catch {
      return undefined;
    }
  };
  /** The role a helper has, as other add-ons read it (helperOf). */
  const roleName = (role, label) => (role === 'questions' ? 'questions' : /repair helper/.test(label) ? 'repair' : /\(senior\)/.test(label) ? 'senior' : /reviewer/.test(label) ? 'review' : /planner/.test(label) ? 'plan' : role === 'implement' ? 'implement' : role === 'review' ? 'review' : role === 'plan' ? 'plan' : 'check');
  /**
   * Room for a helper (stage D): one counter per model server for the whole app (Calls at once, its helpers and the
   * work loop together, also across Split panes), and at most HELPERS_PER_CONVERSATION per conversation. A helper
   * waits for room; a stopped step stops waiting at once.
   */
  const slots = new Map();
  const takeSlot = async (key, limit, signal) => {
    let slot = slots.get(key);
    if (!slot) {
      slot = { used: 0, queue: [] };
      slots.set(key, slot);
    }
    if (slot.used >= Math.max(1, limit)) {
      await new Promise((resolve, reject) => {
        const waiter = { resolve: () => { signal?.removeEventListener?.('abort', onAbort); resolve(); } };
        const onAbort = () => {
          const at = slot.queue.indexOf(waiter);
          if (at >= 0) slot.queue.splice(at, 1);
          reject(signal.reason instanceof Error ? signal.reason : new Error('Stopped.'));
        };
        if (signal?.aborted) {
          onAbort();
          return;
        }
        signal?.addEventListener?.('abort', onAbort, { once: true });
        slot.queue.push(waiter);
      });
    }
    slot.used += 1;
    let given = false;
    return () => {
      if (given) return;
      given = true;
      slot.used = Math.max(0, slot.used - 1);
      const next = slot.queue.shift();
      if (next) next.resolve();
    };
  };
  /** Whether the app refused a helper because the tree has as many helpers as it allows. */
  const activationFull = (error) => error?.code === 'ACTIVATION_LIMIT_REACHED' || /ACTIVATION_LIMIT_REACHED/.test(String(error?.message ?? error));
  const pause = (ms, signal) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { signal?.removeEventListener?.('abort', onAbort); resolve(); }, ms);
    timer.unref?.();
    const onAbort = () => { clearTimeout(timer); reject(signal.reason instanceof Error ? signal.reason : new Error('Stopped.')); };
    if (signal?.aborted) onAbort();
    else signal?.addEventListener?.('abort', onAbort, { once: true });
  });
  /** Stage E: Route health's state of a model server ('' when it has no probe for it). */
  const healthOf = (provider) => {
    try {
      return provider ? String(ctx.get('routeHealth')?.state?.(String(provider))?.state ?? '') : '';
    } catch {
      return '';
    }
  };
  /**
   * Run one helper model to its answer. A helper whose model failed throws, with the model's reason. So
   * does one that came back with nothing: no text, no tool run and no file changed. Such an error carries
   * `free` (it does not use up the item's try) and `stopReason`.
   */
  const helper = async ({ parent, role, root, label, prompt, signal, reader = '', index = 0, loopReader = false, item = '', changed, lane = '', limitMs = 0 }) => {
    const started = Date.now();
    let route;
    try {
      return await helperRun({ parent, role, root, label, prompt, signal, reader, index, loopReader, item, changed, started, lane, limitMs }, (found) => { route = found; });
    } catch (raw) {
      // The step itself was stopped (a pause, End, the time): no label needed, the step is taken again.
      if (signal?.aborted) throw raw;
      // Every other failure (the helper's time limit, a helper the app could not start, a missing service)
      // still names the model it was given and how long it took: the log says that, not "?" and 0.
      const error = raw instanceof Error ? raw : new Error(String(raw));
      // Stage E: the model server does not answer (the app's failure code, its words, or Route health): no try is used,
      // and the Mission waits for the server instead of counting failures.
      if (error.down === undefined) error.down = isServerDown({ text: `${error.message ?? ''} ${error.diagnostic ?? ''}`, code: error.code ?? error.failure?.code, status: error.status ?? error.failure?.status, health: healthOf(route?.provider) });
      if (error.down) {
        error.free = true;
        error.provider ??= String(route?.provider ?? '');
      }
      error.model ??= route?.model ?? 'the thread\'s model';
      error.from ??= route?.from ?? 'conversation';
      error.ms ??= Date.now() - started;
      error.effort ??= '';
      throw error;
    }
  };
  const helperRun = async ({ parent, role, root, label, prompt, signal, reader, index, loopReader, item, changed, started, lane, limitMs }, routed) => {
    const owner = runs.get(parent?.id);
    const route = routeFor(parent, role === 'questions' ? 'plan' : role, root, index);
    routed(route);
    const subagents = ctx.get('subagents');
    if (!subagents?.startActivation) throw new Error('The app\'s sub-agent service is not available.');
    const key = route ? `${route.provider}/${route.model}` : '';
    const wanted = owner?.kind === 'long' && owner.long?.effort === true && !noEffort.has(key) ? ROLE_EFFORT[role] : undefined;
    // Only a level the model lists (or the nearest one), and none when the tier's effort is off.
    let effort = wanted ? pickEffort(await levelsOf(route), wanted, tierEffortOf(parent)) : undefined;
    // Room on its model server and in its conversation first (stage D); a stopped step stops waiting. The helper's own
    // time limit starts once it has room.
    let freeServer;
    let freeConversation;
    try {
      freeConversation = await takeSlot(`conversation:${String(parent?.id ?? '')}`, HELPERS_PER_CONVERSATION, signal);
      const server = String(route?.provider ?? '');
      let calls = 4;
      try {
        calls = Number(callsAtOnce(server)) || 4;
      } catch {
        calls = 4;
      }
      freeServer = await takeSlot(`server:${server}`, calls, signal);
    } catch (error) {
      freeConversation?.();
      throw error;
    }
    const ownMs = limitMs > 0 ? limitMs : helperMs;
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(new Error(`The ${ROLE_NAMES[role] ?? 'helper'} worked for more than ${limitMs > 0 && ownMs < 60000 ? `${Math.round(ownMs / 1000)} seconds` : `${Math.max(1, Math.round(ownMs / 60000))} minutes`} and was stopped.`)), ownMs);
    timer.unref?.();
    const both = AbortSignal.any([signal, limit.signal]);
    try {
      for (;;) {
        let child;
        // The app allows a set number of helpers per conversation tree (no queue): tried again a little later.
        const giveUpAt = Date.now() + activationMaxMs;
        for (;;) {
          try {
            child = await startChild(subagents, {
              provider: 'spawn',
              label,
              request: { prompt: [{ type: 'text', text: `${prompt}\n\n` }], parent, signal: both, ...(route ? { agentOptions: { provider: route.provider, model: route.model, ...(effort ? { reasoningEffort: effort } : {}), ...(route.maxTokens ? { maxTokens: route.maxTokens } : {}) } } : {}) },
              delivery: 'parent',
              signal: both,
            });
            break;
          } catch (error) {
            if (!activationFull(error) || both.aborted) throw error;
            if (Date.now() >= giveUpAt) {
              const full = new Error('The app had no room for another helper for 10 minutes (too many helpers at work), so this one did not start.');
              full.free = true;
              throw full;
            }
            await pause(activationRetryMs, both);
          }
        }
        const childId = child?.childId ? String(child.childId) : '';
        if (reader && childId) readers.set(childId, { name: reader, loop: loopReader });
        if (childId && owner) roles.set(childId, { runId: String(owner.id ?? ''), role: roleName(role, label), item: String(item ?? ''), lane: String(lane ?? ''), conversation: String(parent?.id ?? '') });
        const close = () => Promise.resolve(child?.dispose?.()).catch(() => {});
        if (childId) working.set(childId, close);
        let result;
        try {
          result = await awaitChild(child, both);
        } finally {
          if (childId) {
            readers.delete(childId);
            roles.delete(childId);
            if (working.get(childId) === close) working.delete(childId);
          }
        }
        const counts = (childId && evidence.get(childId)) || { steps: 0, tools: 0 };
        if (childId) evidence.delete(childId);
        const text = (result.output ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
        // Never reached its model: the app counted no request of it (only where its events are seen).
        const unreached = evidenceKnown && Boolean(childId) && counts.steps === 0 && counts.tools === 0;
        let failure = helperFailure(result);
        if (failure && unreached) failure = `${NEVER_REACHED}${failure.includes(':') ? ` ${failure.slice(failure.indexOf(':') + 1).trim()}` : ''}`;
        // Nothing came back: no text, no tool run, and (for a worker) no file changed. That is no answer at all.
        let empty = false;
        if (!failure && !text && counts.tools === 0) {
          let touched = false;
          try {
            touched = changed ? (await changed()) === true : false;
          } catch {
            touched = false;
          }
          empty = !touched;
        }
        const stopReason = String(result?.stopReason ?? '');
        if (empty) failure = unreached ? NEVER_REACHED : `The helper came back with an empty answer and did nothing (it ended with "${stopReason || 'no reason'}").`;
        // Stage E: a server that does not answer is no reason to try without a thinking level.
        const serverDown = Boolean(failure) && isServerDown({ text: `${failure} ${result?.diagnostic ?? ''}`, health: healthOf(route?.provider) });
        if (serverDown) {
          const error = new Error(failure);
          Object.assign(error, { free: true, down: true, empty, stopReason, provider: String(route?.provider ?? ''), model: route?.model ?? 'the thread\'s model', from: route?.from ?? 'conversation', ms: Date.now() - started, effort: effort ?? '' });
          throw error;
        }
        // A model that does not take this thinking level (deepseek-flash refuses "medium", a local model
        // "high"): again without one. The app's result often carries no detail, so any failure (an empty
        // answer too) with a thinking level set is tried once more without it.
        if (failure && effort) {
          noEffort.add(key);
          effort = undefined;
          continue;
        }
        if (failure) {
          const error = new Error(failure);
          error.free = empty || unreached;
          error.stopReason = stopReason;
          // The model it was given and how long it took: the log names them, not "?" and 0.
          error.model = route?.model ?? 'the thread\'s model';
          error.from = route?.from ?? 'conversation';
          error.ms = Date.now() - started;
          error.effort = effort ?? '';
          throw error;
        }
        return { text, model: route?.model ?? 'the thread\'s model', from: route?.from ?? 'conversation', ms: Date.now() - started, stopReason, effort: effort ?? '', tools: counts.tools };
      }
    } finally {
      clearTimeout(timer);
      freeServer?.();
      freeConversation?.();
    }
  };

  /**
   * Run `work` holding the folder lock alone (stage D, several helpers): no other helper writes a file or runs a
   * command that changes files meanwhile. With one helper, or without the claims, it simply runs. A lock that could not
   * be had in 10 minutes does not stop the work (the check or checkpoint runs anyway).
   */
  let lockCount = 0;
  const underLock = async (id, run, lane, signal, work) => {
    if (!claims || !lane || helpersOf(run) <= 1) return work();
    lockCount += 1;
    const key = `runner:${lane.id}:${lockCount}`;
    const inside = await claims.enter(id, key, { lane: lane.id, mode: 'exclusive', signal });
    if (signal?.aborted) {
      if (inside) claims.leave(id, key);
      throw new Error('Stopped.');
    }
    try {
      return await work();
    } finally {
      if (inside) claims.leave(id, key);
    }
  };

  /**
   * Item 4A, stage 6a integration: the rules of the space the thread sits in now (index.js reads them from Modes,
   * Bench and Creator Plus before every check and continue), so a run started in another space never runs a check under
   * its old, looser rules. `{held: true}`: a guarded space without rules (a failing read counts). A Long run takes the
   * stricter rules on for good.
   * @returns {{held?: boolean, bench?: object, creator?: object}}
   */
  const spaceNow = (id, run) => {
    if (typeof liveRules !== 'function') return {};
    let live;
    try {
      live = liveRules(id) ?? {};
    } catch {
      return { held: true };
    }
    if (live.held === true) return { held: true };
    if (isLong(run) && run.long) {
      if (live.bench && !run.long.bench) run.long.bench = { ...live.bench };
      // Owner's answer after review: the Devices mode keeps its checks' network; once a guest is in (or Mission cannot
      // be sure), the run loses that mark for good and its checks run in the Devices fence.
      if (live.bench && live.bench.home !== true && run.long.bench?.home === true) delete run.long.bench.home;
      if (live.creator && !run.long.creator) run.long.creator = { ...live.creator };
    }
    return live;
  };

  /** Run a proof command, with a checkpoint before it and unapproved changes put back after it. */
  const prove = (id, run, command, signal, lane) => underLock(id, run, lane, signal, () => proveNow(id, run, command, signal));
  const proveNow = async (id, run, command, signal) => {
    // Item 4A, stage 6a integration: the space's rules are read again before every check.
    const live = spaceNow(id, run);
    if (live.held) return { ok: false, output: SPACE_HELD_TEXT };
    let point;
    try {
      point = await pointsOf(run.root).take(`Before check: ${command.slice(0, 70)}`);
    } catch {
      point = undefined;
    }
    const closed = portsClosed(run) || live.bench?.closedPorts === true;
    // Item 4A, stage 6a: a guest's Devices run's checks run in the Devices fence; the Devices mode's own run keeps the
    // network as before 6a (owner's answer), only while Bench reads the thread as the Devices mode now too.
    const devices = devicesChecks(run) || Boolean(live.bench && live.bench.home !== true);
    const ran = await runCommand({ command, root: run.root, signal, closePorts: closed, offline: offlineChecks(run) || Boolean(live.creator), cleanEnv: cleanEnv(run) || Boolean(live.creator), devices });
    // In Bench a check may not open a device's port: said where the user and the reviewer read it.
    const result = closed && !ran.ok && /\/dev\/(cu|tty)\.|\/dev\/r?disk|Operation not permitted/i.test(ran.output ?? '')
      ? { ...ran, output: `${ran.output}\n[${PORTS_CLOSED_NOTE}]` }
      : ran;
    let back = [];
    if (point) {
      try {
        back = await afterCommand(id, point.id);
      } catch (error) {
        warn(`could not check what a proof command changed: ${String(error?.message ?? error)}`);
      }
    }
    return { ...result, output: back.length > 0 ? `${result.output}\n[It changed files the user has not approved; they were put back: ${back.slice(0, 20).join(', ')}]` : result.output };
  };

  const modelLine = (who, done) => `${who} on ${done.model}${done.from === 'conversation' || done.from === 'same' ? '' : ` (${done.from === 'tiers' ? 'Model tiers role' : done.from === 'fallback' ? 'the fallback model you allowed' : done.from === 'team' ? 'the tier\'s team' : done.from === 'project' ? 'this project\'s choice' : 'Mission\'s choice'})`}`;

  /**
   * A planner's or reviewer's prose answer turned into its JSON by one short ask (MISSION_FORMAT).
   * @returns {Promise<object | null>} the JSON when it has what `ok` asks for, else null.
   */
  const asJson = async (text, kind, ok, parent, run, signal) => {
    if (!String(text ?? '').trim()) return null;
    try {
      const done = await helper({ parent, role: 'plan', root: run.root, label: `Mission: ${kind === 'plan' ? 'planner' : kind === 'repair' ? 'repair helper' : 'reviewer'} (format)`, prompt: formatPrompt(kind, text), signal, reader: kind === 'plan' ? 'the planner' : kind === 'repair' ? 'the repair helper' : 'the reviewer' });
      const parsed = jsonOf(done.text, ok);
      return parsed && ok(parsed) ? parsed : null;
    } catch (error) {
      // Stage E: a server that does not answer is never swallowed (the Mission waits for it).
      if (signal.aborted || error?.down) throw error;
      return null;
    }
  };

  /** A helper's CHOSE lines: the first choice for each question you left to the Mission's judgement (stage C). */
  const takeChoices = (run, text, by) => {
    for (const choice of choicesOf(text)) {
      const question = (run.questions ?? []).find((entry) => entry.id === choice.id && entry.status === 'skipped' && !entry.chosen);
      if (!question) continue;
      question.chosen = choice.text;
      question.chosenBy = String(by);
    }
  };

  const doPlan = async (id, run, parent, signal, lane) => {
    let files = '';
    try {
      const listed = await pointsOf(run.root).files(300);
      files = listed.files.join('\n') + (listed.more ? '\n… (more files)' : '');
    } catch {
      files = '';
    }
    // A Long run's planner is told its time, so the plan fits it.
    // No time limit (deadline 0): no time line at all, never "1 minute".
    const minutes = isLong(run) && run.long.deadline > 0 ? Math.max(1, Math.round((run.long.deadline - Date.now()) / 60000)) : 0;
    // Stage C: its lap and step limits too, so the plan is sized to every limit it has.
    const laps = isLong(run) ? Number(run.long.laps) || 0 : 0;
    const stepLimit = isLong(run) && Number(run.long.steps) > 0 ? run.limits.maxSteps : 0;
    const needs = needsOf(run);
    const prompt = `${planPrompt({ goal: run.goal, root: run.root, files, maxItems: run.limits.maxItems, notes: lapNotes(run), context: run.long?.context ?? '', noCommands: noChecks(run), offline: offlineChecks(run), minutes, laps, steps: stepLimit, userNotes: userNotes(run), helpers: helpersOf(run), needs: isLong(run) ? needs : 'ask' })}${run.loop?.recipe ? `\n\n${recipeText(run.loop)}` : ''}`;
    let done = await helper({ parent, role: 'plan', root: run.root, label: 'Mission: planner', prompt, signal, reader: 'the planner', lane: lane?.id });
    let plan = jsonOf(done.text);
    if (!plan || !Array.isArray(plan.items)) {
      // One more try: some models wrap the answer in talk the first time.
      done = await helper({ parent, role: 'plan', root: run.root, label: 'Mission: planner (again)', prompt: `${prompt}\n\nYour last answer was not a JSON object with an "items" list. Answer with that JSON object only.`, signal, reader: 'the planner', lane: lane?.id });
      plan = jsonOf(done.text);
    }
    // Still prose (a small local model, or one that wrote its plan into a file): turned into the JSON.
    if (!plan || !Array.isArray(plan.items)) plan = await asJson(done.text, 'plan', (parsed) => Array.isArray(parsed?.items), parent, run, signal) ?? plan;
    keep(run, 'plan', done.text || `(The planner gave no text; it ended with "${done.stopReason || 'no reason'}".)`);
    if (signal.aborted) throw new Error('Stopped.');
    const questionsBefore = (run.questions ?? []).length;
    applyPlan(run, plan, { needs });
    dropCommands(run);
    // Does the plan fit the time? If not, said now (one plain line) and kept as a question with a default.
    const fit = planFit(run);
    let fitLine = '';
    if (fit && !fit.fits) {
      fitLine = `This plan needs about ${fit.needed} minutes, but the run has ${fit.left} left. It will do the most important items first and list the rest in its report. About ${fit.recommend} minutes would fit, with some time to spare.`;
      // Stage C: asked on the questions card in the first minute; `extra` is what "Give it more" adds to the limit.
      addQuestion(run, { text: `The plan needs about ${fit.needed} minutes, but the Mission has ${fit.left} left. Give it about ${fit.extra} more minutes? That covers the plan with some time to spare.`, assume: 'I will do the most important items and list the rest.', kind: 'time', from: 'time', recommend: fit.recommend, needed: fit.needed, left: fit.left, extra: fit.extra });
    }
    // A step limit set by the user that the plan may not fit: said in the plan and the report (no time to recommend).
    run.stepsNote = '';
    if (isLong(run) && Number(run.long.steps) > 0) {
      const open = run.items.filter((item) => item.status === 'open').length;
      if (open + run.checks.length + 1 > run.limits.maxSteps - run.steps) run.stepsNote = `This plan may need more steps than the limit of ${run.limits.maxSteps} allows. It does the first items and lists the rest.`;
    }
    // How soon the questions were there to be read (the one-minute target is checked in the lab).
    const questionsMs = Math.max(0, Date.now() - run.startedAt);
    // Point 17: Ask and wait parks the items its questions name before they start; Full auto decides its questions.
    const before = Array.isArray(run.waitingBefore) ? run.waitingBefore : [];
    const decidedNow = (run.questions ?? []).slice(questionsBefore).filter((question) => question.self === true && question.kind !== 'time').length;
    record(run, { kind: 'plan', role: 'plan', model: done.model, ms: done.ms, items: run.items.length, parsed: Boolean(plan), ...(run.planNote ? { note: run.planNote } : {}), ...(fit ? { needs: fit.needed, left: fit.left } : {}), questions: (run.questions ?? []).length, questionsMs, ...(before.length > 0 ? { waitingBefore: before } : {}), ...(decidedNow > 0 ? { decided: decidedNow } : {}) });
    if (before.length > 0) {
      record(run, { kind: 'park', items: before, before: true });
      needsYou(id, run, 'question');
    }
    const asked = (run.questions ?? []).filter((question) => question.status === 'open' && question.kind !== 'time');
    const waitLine = before.length > 0 ? `${before.length === 1 ? `Item ${before[0]} waits` : `Items ${before.join(', ')} wait`} for your answers before ${before.length === 1 ? 'it starts' : 'they start'}; the others go on.` : '';
    const decidedLine = decidedNow > 0 ? `The planner decided ${decidedNow} question${decidedNow === 1 ? '' : 's'} itself (Full auto); the report lists them.` : '';
    return [`Step ${run.steps}: plan (${modelLine('planner', done)}). ${run.items.length} item${run.items.length === 1 ? '' : 's'}${run.checks.length > 0 ? `, ${run.checks.length} overall command${run.checks.length === 1 ? '' : 's'}` : ''}.${run.planNote ? ` ${run.planNote}` : ''}`, fitLine, run.stepsNote, run.summary ? `Approach: ${run.summary}` : '', '', checklist(run), run.checks.length > 0 ? `\nAt the end these must pass: ${run.checks.join(' ; ')}` : '', asked.length > 0 ? `\n${needs === 'wait' ? 'Questions for the user (nothing is decided on them until they answer)' : 'Questions for the user (the run goes on with the default)'}:\n${asked.map((question) => `- ${question.text}${question.assume ? ` (${needs === 'wait' ? 'suggestion' : 'default'}: ${question.assume})` : ''}`).join('\n')}` : '', waitLine, decidedLine].filter((part) => part !== '').join('\n');
  };

  /**
   * Long run: the start of a lap is marked with a checkpoint once the overall commands have passed, so
   * the gate can undo a lap that breaks them (step 52). The items worked on in the lap are noted.
   */
  const lapStart = async (id, run, item, signal, lane) => {
    if (!isLong(run)) return;
    const mark = async () => {
      try {
        const point = await pointsOf(run.root).take(`Mission: start of lap ${run.long.lap + 1}`);
        run.long.lapPoint = point.number;
        run.long.lapItems = [];
      } catch (error) {
        warn(`could not mark the start of a lap, so it cannot be undone: ${String(error?.message ?? error)}`);
      }
    };
    if (!run.long.lapPoint && run.long.checksPassedOnce) {
      if (helpersOf(run) > 1 && lane) {
        // Several helpers: one checkpoint per lap, taken once, before the lap's first write; every work lane waits for it.
        // Only a mark still being taken is waited for: one that ended with no checkpoint (a lap undone, a continue in the
        // same lap, a pause while it was taken) is taken again by the next lane, so the lap gate can always undo the lap.
        const pool = poolOf(id);
        if (!pool.lapStart || pool.lapStart.lap !== run.long.lap || pool.lapStart.over) {
          const marking = { lap: run.long.lap, over: false };
          marking.promise = underLock(id, run, lane, signal, mark).catch(() => {}).finally(() => { marking.over = true; });
          pool.lapStart = marking;
        }
        await pool.lapStart.promise;
        if (signal?.aborted) throw new Error('Stopped.');
      } else await mark();
    }
    if (!Array.isArray(run.long.lapItems)) run.long.lapItems = [];
    if (!run.long.lapItems.includes(item.id)) run.long.lapItems.push(item.id);
  };

  /**
   * The work loop's preparation of a text item (only when the loop is on): separate attempts side by side
   * (Ultra Code), a vote or a judge between them, and checking questions at Thorough. Every helper here
   * only reads: the one worker after them writes. Undefined when there is nothing to prepare.
   */
  const prepare = async (run, item, parent, signal, others) => {
    const loop = run.loop;
    const textOnly = TEXT_KINDS.includes(loop.kind) && !workersWithoutCommands(run);
    const tries = sideBySide(run, textOnly) ? loop.attempts : 1;
    if (!textOnly || noCommands(run) || (tries < 2 && !loop.questions)) return undefined;
    const base = workPrompt({ goal: run.goal, summary: run.summary, item, others, senior: false, notes: lapNotes(run), root: run.root, noCommands: true, userNotes: userNotes(run), brief: briefOf(run) });
    const attemptPrompt = `${base}\n\nYou are one of ${tries} separate attempts at this item. Answer in text only: write no file and change nothing. ${SHAPE_NOTE}`;
    // Calls at once per model server: each attempt waits for its own server's room.
    const keyOf = (role, index) => String(routeFor(parent, role, run.root, index)?.provider ?? '');
    const results = await limitedBy(Array.from({ length: tries }, (_, index) => ({ key: keyOf('implement', index), run: () => helper({ parent, role: 'implement', root: run.root, label: `Mission: item ${item.id}, attempt ${index + 1} of ${tries}`, prompt: attemptPrompt, signal, reader: 'an attempt of the work loop', index, loopReader: true }) })), callsAtOnce);
    if (signal.aborted) throw new Error('Stopped.');
    const texts = results.filter((result) => result.ok && String(result.value?.text ?? '').trim()).map((result) => result.value.text);
    if (texts.length === 0) return undefined;
    keep(run, `item-${item.id}-attempts`, texts.map((text, index) => `--- attempt ${index + 1} ---\n${text}`).join('\n\n'));
    let text = texts[0];
    let how = texts.length === 1 ? 'one attempt' : '';
    let vote;
    if (texts.length > 1) {
      if (loop.kind === 'answer' || loop.kind === 'extraction') {
        vote = agreement(texts);
        text = texts[vote.pick];
        how = vote.ok ? `${texts.length} attempts, the answer most of them gave` : `${texts.length} attempts that did not agree`;
      } else {
        try {
          const judged = await helper({ parent, role: 'judge', root: run.root, label: `Mission: judge for item ${item.id}`, prompt: judgePrompt({ goal: run.goal, item, attempts: texts }), signal, reader: 'the judge', loopReader: true });
          const verdict = judgeOf(judged.text, texts.length);
          text = verdict.merged || texts[Math.max(0, verdict.pick)];
          how = verdict.merged ? `${texts.length} attempts merged by the judge` : verdict.pick >= 0 ? `attempt ${verdict.pick + 1} of ${texts.length}, picked by the judge` : `${texts.length} attempts; the judge gave no usable pick, so the first is used`;
        } catch (error) {
          if (signal.aborted || error?.down) throw error;
          how = `${texts.length} attempts; the judge could not run, so the first is used`;
        }
      }
    }
    if (loop.questions) {
      try {
        const asked = await helper({ parent, role: 'check', root: run.root, label: `Mission: checking questions for item ${item.id}`, prompt: questionsPrompt({ item, text }), signal, reader: 'the checker', loopReader: true });
        const questions = questionsOf(asked.text);
        if (questions.length > 0) {
          // Each answered on its own: the answerer never sees the draft.
          const answered = await limitedBy(questions.map((question, index) => ({ key: keyOf('check', index), run: () => helper({ parent, role: 'check', root: run.root, label: `Mission: checking question ${index + 1}`, prompt: answerPrompt(question), signal, reader: 'the checker', index, loopReader: true }) })), callsAtOnce);
          const answers = questions.map((question, index) => ({ question, answer: answered[index]?.ok ? answered[index].value.text : '(no answer)' }));
          const revised = await helper({ parent, role: 'check', root: run.root, label: `Mission: revision of item ${item.id}`, prompt: revisePrompt({ item, text, answers }), signal, reader: 'the checker', loopReader: true });
          if (String(revised.text ?? '').trim()) {
            text = revised.text;
            how = `${how}; checked with ${questions.length} separate question${questions.length === 1 ? '' : 's'} and revised`;
          }
        }
      } catch (error) {
        if (signal.aborted || error?.down) throw error;
        how = `${how}; the checking questions could not run`;
      }
    }
    record(run, { kind: 'loop', item: item.id, attempts: texts.length, how });
    return { text, how, vote, agreed: vote ? texts[vote.pick] : '', count: texts.length };
  };

  /**
   * The work loop's checker for an item's kind (only when the loop is on): run by the app (sources really
   * opened, a fixed shape, a vote) or by a separate checker that only reads, never by the run that made it.
   * @returns {Promise<{ran: boolean, why: string}>} whether a check ran, and its words when it said no.
   */
  const loopCheck = async (run, item, text, prepared, parent, signal) => {
    const loop = run.loop;
    if (loop.kind === 'research') {
      const verdict = citationCheck(text, new Set(loop.opened ?? []));
      return { ran: true, why: verdict.ok ? '' : verdict.why, by: 'app' };
    }
    if (loop.kind === 'extraction') {
      const verdict = shapeCheck(text, loop.recipe?.shape ?? ['items']);
      // A shape alone: advice only where the item's own command passed (it never reopens such an item).
      return { ran: true, why: verdict.ok ? '' : verdict.why, by: 'format' };
    }
    // One right answer: the tries must agree, and the worker's final answer must be the one they agreed on.
    if (loop.kind === 'answer' && prepared?.vote) {
      if (!prepared.vote.ok) return { ran: true, why: prepared.vote.why, by: 'app' };
      return { ran: true, why: sameAnswer(text, prepared.agreed) ? '' : 'The final answer is not the one the separate tries agreed on. Give the agreed answer, or show why it is wrong.', by: 'app' };
    }
    // Commands check code and data, as Mission always did; in the Content tab Content's drift check decides writing.
    if (loop.kind === 'code' || loop.kind === 'data' || (loop.kind === 'writing' && loop.tab === 'content')) return { ran: false, why: '' };
    // A Recon run gets no extra helper models: only the app's own checks.
    if (noCommands(run)) return { ran: false, why: '' };
    try {
      const checked = await helper({ parent, role: 'check', root: run.root, label: `Mission: checker for item ${item.id}`, prompt: readerCheckPrompt({ goal: run.goal, item, text }), signal, reader: 'the checker', loopReader: true });
      const verdict = readerVerdict(checked.text);
      // A reply that is not the asked format is no verdict.
      if (verdict.ok === undefined) return { ran: false, why: '' };
      return { ran: true, why: verdict.ok ? '' : verdict.why, by: 'model' };
    } catch (error) {
      if (signal.aborted || error?.down) throw error;
      // A checker that could not run is no verdict: the item is not sent back for it.
      return { ran: false, why: '' };
    }
  };

  /** Item ids and titles, for the conductor's lines. */
  const titleOf = (run, id) => run.items.find((entry) => entry.id === String(id))?.title ?? '';
  /** The live kinds of a conversation's lanes, without one of them (answerTooLate, followAnswer). */
  const liveKinds = (id, but) => liveLanes(pools.get(String(id ?? ''))).filter((lane) => lane !== but).map((lane) => lane.kind);

  /** What the next helper of an item that waited (or was stopped) is told (stage D). */
  const resumeBlock = (run, item, extra = []) => {
    const lines = [];
    const files = (Array.isArray(item.touched) ? item.touched : []).slice(-30).join(', ');
    if (item.resume && typeof item.resume === 'object') {
      // Point 17: an item that waited before it was started (Ask and wait) has no helper's work to go on from.
      const before = item.resume.before === true;
      lines.push(before ? RESUME_TEXTS.before : RESUME_TEXTS.head(String(item.resume.report ?? '').replace(/\s+/g, ' ').slice(0, 800), files));
      for (const answer of Array.isArray(item.resume.answers) ? item.resume.answers : []) {
        if (answer.kind === 'answer') lines.push(before ? RESUME_TEXTS.beforeAnswer(answer.question ?? '', answer.text ?? '') : RESUME_TEXTS.answer(answer.question ?? '', answer.text ?? ''));
        else if (answer.kind === 'skip') lines.push(before ? RESUME_TEXTS.beforeSkip(answer.question ?? '', answer.ref ?? '') : RESUME_TEXTS.skip(answer.question ?? '', answer.ref ?? ''));
        else if (answer.kind === 'allowed') lines.push(answer.tool && answer.scope === 'item' ? RESUME_TEXTS.allowedTool(answer.tool) : RESUME_TEXTS.allowed(answer.text ?? ''));
        else if (answer.kind === 'denied') lines.push(RESUME_TEXTS.denied(answer.text ?? ''));
        else if (answer.kind === 'redo') lines.push(RESUME_TEXTS.redo(answer.text ?? ''));
        // A command allowed in Restricted mode is allowed exactly as asked: the helper gets it whole, to run unchanged.
        if (['allowed', 'redo'].includes(answer.kind) && answer.command) lines.push(RESUME_TEXTS.command(String(answer.command).slice(0, 2000)));
      }
    }
    if (item.waitFile) lines.push(RESUME_TEXTS.file(item.waitFile));
    if (item.undone) lines.push(RESUME_TEXTS.undone());
    if (item.interrupted) lines.push(RESUME_TEXTS.interrupted());
    lines.push(...extra);
    return lines.join('\n');
  };

  /**
   * "Allow for this item" (stage D): the tool is allowed for the conversation while the helper of an item it was allowed
   * for works (Mission's guard refuses it to every other item's helper), and taken back when no such helper works. It
   * covers every item that asked for it; each item's part is used up once that item is done. Given again here after a
   * restart or a pause.
   * @returns {Promise<string[]>} lines for the helper when a grant could not be had any more.
   */
  const granting = new WeakMap();
  const itemGrants = async (id, run, item, lane) => {
    const lines = [];
    for (const entry of (Array.isArray(run.approvals) ? run.approvals : [])) {
      if (entry.kind !== 'tool' || entry.status !== 'allowed' || entry.choice !== 'item' || entry.spent || !(entry.items ?? []).includes(item.id) || (entry.usedBy ?? []).includes(item.id)) continue;
      if (!entry.grantId) {
        // Helpers of two items that start at once share one grant (asked once).
        let pending = granting.get(entry);
        if (!pending) {
          pending = Promise.resolve().then(() => grants?.grant?.(id, entry.tool)).catch((error) => ({ ok: false, text: String(error?.message ?? error) }));
          granting.set(entry, pending);
          pending.finally(() => granting.delete(entry)).catch(() => {});
        }
        const got = await pending;
        if (got?.ok && got.id) entry.grantId = String(got.id);
        else {
          entry.spent = true;
          lines.push(RESUME_TEXTS.toolGone(entry.plain || entry.tool));
          continue;
        }
      }
      lane.itemGrants.push(entry.id);
    }
    return lines;
  };
  /**
   * A lane settled: an item that is done has used up its part of the tool permissions allowed for it; the permission
   * goes back while no other helper of those items works (given again when the next one starts), for good once every
   * item it was allowed for is done.
   */
  const dropItemGrants = (id, run, lane) => {
    const pool = pools.get(String(id ?? ''));
    const item = lane.item ? run.items.find((entry) => entry.id === lane.item) : undefined;
    const goesOn = Boolean(item) && ['open', 'parked'].includes(item.status);
    for (const ref of lane.itemGrants ?? []) {
      const entry = (run.approvals ?? []).find((each) => each.id === ref);
      if (!entry) continue;
      if (lane.item && !goesOn) entry.usedBy = [...new Set([...(Array.isArray(entry.usedBy) ? entry.usedBy : []), lane.item])];
      if ((entry.items ?? []).every((each) => (entry.usedBy ?? []).includes(each))) entry.spent = true;
      const others = liveLanes(pool).some((other) => other !== lane && (other.itemGrants ?? []).includes(ref));
      if (others && !entry.spent) continue;
      const grant = entry.grantId;
      entry.grantId = '';
      if (grant) Promise.resolve(grants?.revoke?.(grant)).catch((error) => warn(`could not take back a tool permission: ${String(error?.message ?? error)}`));
    }
    lane.itemGrants = [];
  };

  /** The tool permissions a Mission's approvals gave are taken back (its end, or an answer given after it ended). */
  const takeBackGrants = (run) => {
    for (const entry of Array.isArray(run.approvals) ? run.approvals : []) {
      if (!entry.grantId) continue;
      const grant = entry.grantId;
      entry.grantId = '';
      // An item permission is used up only when none of its items is left to do: Finish it gives it again to an item
      // that still waits (review of point 17).
      if (entry.choice === 'item' && !(entry.items ?? []).some((ref) => ['open', 'parked'].includes(run.items.find((item) => item.id === String(ref))?.status))) entry.spent = true;
      Promise.resolve(grants?.revoke?.(grant)).catch((error) => warn(`could not take back a tool permission: ${String(error?.message ?? error)}`));
    }
  };

  /**
   * Finish it (review of point 17): the tool permissions you gave with Allow for this Mission were taken back at its end;
   * the same Mission gets them again, so its helpers are not asked twice. One that cannot be given is asked again.
   */
  const regrantMission = async (id, run) => {
    for (const entry of Array.isArray(run.approvals) ? run.approvals : []) {
      if (entry.kind !== 'tool' || entry.status !== 'allowed' || entry.choice !== 'mission' || entry.grantId || !entry.tool) continue;
      let got;
      try {
        got = await grants?.grant?.(id, entry.tool);
      } catch (error) {
        got = { ok: false, text: String(error?.message ?? error) };
      }
      if (got?.ok && got.id) entry.grantId = String(got.id);
      else warn(`could not give a tool permission back for the continued Mission (its helpers ask again): ${String(got?.text ?? '')}`);
    }
  };

  /**
   * "Needs you" for a parked question or approval: questions and approvals together at most once per NEEDS_EVERY_MS per
   * Mission (point 17); 'you' once when a wait starts (startWaiting is once per wait). Full auto sends none.
   */
  const needsYou = (id, run, waiting, extra = {}) => {
    if (needsOf(run) === 'decide') return;
    const pool = poolOf(id);
    const now = Date.now();
    if (waiting !== 'you') {
      if (now - (pool.needsAt.parks ?? 0) < NEEDS_EVERY_MS) return;
      pool.needsAt.parks = now;
    }
    emit('needs-you', id, run, { waiting, items: run.items.filter((item) => item.status === 'parked').map((item) => item.id), questions: openQuestions(run).length, approvals: openApprovals(run).length, ...extra });
  };

  // ---- Stage E: the repair helper -----------------------------------------------------------------------------------

  /** The last failures of a conversation's helpers (in memory): their words and whether each was an empty answer. */
  const failures = new Map();
  const noteFailure = (id, text, empty) => {
    const list = failures.get(String(id)) ?? [];
    list.push({ text: String(text ?? '').slice(0, 600), empty: empty === true });
    failures.set(String(id), list.slice(-3));
  };
  /** Whether the last three failures were all empty answers (or helpers that never reached their model). */
  const allEmpty = (id) => {
    const list = failures.get(String(id)) ?? [];
    return list.length >= 3 && list.every((entry) => entry.empty);
  };
  /** The words of the last failures, for the repair helper. */
  const lastFailures = (id) => (failures.get(String(id)) ?? []).map((entry, index) => `${index + 1}. ${entry.text}`).join('\n');
  /** What the repair helper is told about an item: its check, the check's output and the worker's last report. */
  const itemEvidence = (run, item, check) => [
    `Item ${item.id}: ${item.title}`,
    item.doneWhen ? `Done when: ${item.doneWhen}` : '',
    item.check ? `Its check: ${item.check}` : 'It has no check.',
    check ? `The check's output (end):\n${String(check.output ?? '').slice(-1200)}` : '',
    item.note ? `Its note: ${String(item.note).slice(0, 400)}` : '',
    item.report ? `The worker's last report (end):\n${String(item.report).slice(-2000)}` : '',
  ].filter(Boolean).join('\n');
  /**
   * Ask for a repair (stage E). Pending or working already: 'busy' (the streaks start again; nothing pauses). Spent: what
   * happened before stage E follows.
   * @returns {'asked' | 'busy' | 'spent'}
   */
  const askRepair = (id, run, cause) => {
    if (!isLong(run) || run.status !== 'running') return 'spent';
    const got = requestRepair(run, cause, epochOf(run));
    if (got === 'spent') return got;
    // A streak that asked for a repair (or found one at work) starts again; an item's own cause leaves the streaks alone.
    if (cause.hold) {
      run.failStreak = 0;
      run.errors = 0;
    }
    if (got === 'asked') {
      failures.delete(String(id));
      try {
        save(run);
      } catch { /* kept in memory */ }
      record(run, { kind: 'repair-asked', cause: run.long.repair.pending.key });
      changed(id);
      wake(id);
    }
    return got;
  };
  /** A repair for a cause with no pause of its own (an item, a check, a tool); `say` gets the conductor's line. */
  const repairNote = (id, run, cause, say) => {
    const got = askRepair(id, run, cause);
    if (got === 'asked') say?.(`The Mission's repair helper looks at why ${causeWords(cause)} next.`);
    return got;
  };
  /**
   * Helpers or steps that keep failing (stage E): a repair first; once it is spent, the pause from before stage E, with
   * a tail that says the repair helper already tried.
   * @returns {string} the conductor's line ('' when nothing is to be said).
   */
  const streakRepair = (id, run, agent, { kind, reason, details }) => {
    const got = isLong(run) ? askRepair(id, run, { kind, evidence: lastFailures(id) || details, hold: { reason, details } }) : 'spent';
    if (got === 'asked') return `The Mission's repair helper looks at why ${causeWords({ kind })} next; the other work waits for it.`;
    if (got === 'busy') return '';
    const tried = isLong(run) && (Number(run.long?.repair?.tries?.[causeKey({ kind })]) || 0) > 0;
    const said = `${reason}${tried ? ' The repair helper already tried for this.' : ''}`;
    holdAfter(agent, said, details);
    return `The run is paused: ${said}\nTell the user this and do not call ${STEP_TOOL} again until they resume it.`;
  };

  /**
   * A change the repair helper (or a Budget stop) needs the user's yes for, kept as an approval of kind 'repair' (by
   * 'repair'): parked in the card with the Ask modes; Full auto never asks (kept 'unasked', listed, Finish it).
   * @returns {object | undefined} the entry.
   */
  const parkRepair = (id, run, given) => {
    const decide = needsOf(run) === 'decide';
    const kept = addApproval(run, { kind: 'repair', by: 'repair', ...given, ...(decide && given.cannot !== true ? { unasked: true } : {}) }, Date.now());
    if (!kept.entry) return undefined;
    if (kept.how === 'new') record(run, { kind: 'approval', id: kept.entry.id, approval: 'repair', fix: given.fix?.kind ?? '', ...(decide ? { unasked: true } : {}), ...(given.cannot ? { cannot: true } : {}) });
    if (!decide && kept.entry.status === 'open') needsYou(id, run, 'approval');
    return kept.entry;
  };
  /** The first route of the tier's fallback list on another server that Route health does not call down. */
  const fallbackFor = (parent, run) => {
    if (noCommands(run)) return undefined;
    try {
      const tiers = ctx.get('modelTiers');
      const tier = tiers?.resolveTier?.(parent?.id);
      const chain = tier && typeof tiers.fallbackChain === 'function' ? tiers.fallbackChain(tier.id) : [];
      const now = routeFor(parent, 'implement', run.root);
      return (Array.isArray(chain) ? chain : []).map(routeOf).find((route) => route && route.provider !== now?.provider && healthOf(route.provider) !== 'down');
    } catch {
      return undefined;
    }
  };
  /** Owner point 19: the app's settings as the settings service has them now (undefined when it cannot be reached). */
  const appSettingsNow = async () => {
    try {
      const service = ctx.get('settings');
      if (typeof service?.describe !== 'function') return undefined;
      const got = await service.describe({ redactSecrets: true });
      return Array.isArray(got) ? got : undefined;
    } catch {
      return undefined;
    }
  };
  /** The settings list (Settings helper's settings-index.json); [] when it is not there. */
  const indexNow = () => {
    try {
      const got = settingsIndex();
      return Array.isArray(got) ? got : [];
    } catch {
      return [];
    }
  };
  /** The Mission's own settings, as the repair helper reads them. */
  const ownSettings = (run, parent) => {
    const L = run.long;
    const provider = String(routeFor(parent, 'implement', run.root)?.provider ?? '');
    let calls = 4;
    try {
      calls = Number(callsAtOnce(provider)) || 4;
    } catch { /* 4 */ }
    return [
      `Think by role (planner and reviewer high, workers medium): ${L.effort === true ? 'on' : 'off'}`,
      `Helpers at once: ${helpersOf(run)}${Number(L.helpersCap) > 0 ? ` (now at most ${L.helpersCap})` : ''}; Calls at once for the helpers' model server${provider ? ` (${provider})` : ''}: ${calls}`,
      `A failed item waits ${Math.round((Number(L.retryAfterMs) || retryAfterMs) / 1000)} seconds before it is tried again.`,
      run.loop ? `The work loop is on, recipe kind: ${run.loop.kind}` : 'The work loop is off.',
      noChecks(run) ? 'This Mission runs no checks.' : `Overall checks: ${run.checks.length > 0 ? run.checks.join(' ; ') : 'none'}`,
      `Tries per item: ${run.limits.maxTries}`,
    ].join('\n');
  };
  /**
   * The repair helper's step (stage E): a save point, then a helper that finds the cause and fixes what it may; its own
   * fixes are made on the Mission's settings, its asks go to the card (or are listed with Full auto), and a cause that
   * paused nothing before stage E pauses now only when nothing was fixed.
   */
  const doRepair = async (id, run, parent, signal, lane) => {
    const R = repairOf(run, epochOf(run));
    const cause = R.pending;
    if (!cause) return `Step ${run.steps}: nothing to repair.`;
    R.working = true;
    R.seq = (Number(R.seq) || 0) + 1;
    const rid = `r${R.seq}`;
    try {
      save(run);
    } catch { /* kept in memory */ }
    changed(id);
    // 1. A save point first; without one the repair helper changes no files (its guard refuses them).
    let point;
    try {
      point = await underLock(id, run, lane, signal, () => pointsOf(run.root).take(`Before the repair helper: ${cause.text}`));
    } catch {
      point = undefined;
    }
    if (signal.aborted) {
      R.working = false;
      throw new Error('Stopped.');
    }
    const pointNo = point && !point.skipped ? Number(point.number) || 0 : 0;
    lane.repairPoint = pointNo;
    const item = cause.item ? run.items.find((entry) => entry.id === String(cause.item)) : undefined;
    const logTail = (() => {
      try {
        return readFileSync(join(dirOf(run), 'log.jsonl'), 'utf8').trim().split('\n').slice(-15).join('\n').slice(-3000);
      } catch {
        return '';
      }
    })();
    const evidence = [
      cause.evidence ? `What the helpers said:\n${cause.evidence.split('\n').map((row) => row.slice(0, 600)).join('\n').slice(0, 2400)}` : '',
      item ? itemEvidence(run, item) : '',
      cause.command ? `The check: ${cause.command}` : '',
      cause.tool ? `The tool that kept failing: ${cause.tool}` : '',
      logTail ? `The Mission's log (last lines):\n${logTail}` : '',
    ].filter(Boolean).join('\n\n');
    const finishEntry = (entry) => {
      R.list = [...R.list, entry].slice(-REPAIRS_KEPT);
      R.tries[cause.key] = (Number(R.tries[cause.key]) || 0) + 1;
      R.count = (Number(R.count) || 0) + 1;
      R.pending = null;
      R.working = false;
      record(run, { kind: 'repair', id: entry.id, cause: cause.key, status: entry.status, point: pointNo, said: entry.said, files: entry.files.slice(0, 40), asked: entry.asked, refused: entry.refused });
    };
    // Owner point 19: the settings it may name, read live (a Recon Mission names none: its record never leaves Recon).
    const index = noCommands(run) ? [] : indexNow();
    const appSettings = index.length > 0 ? catalogText(settingsCatalog(index, await appSettingsNow())) : '';
    let done;
    let parsed;
    try {
      done = await helper({ parent, role: 'plan', root: run.root, label: 'Mission: repair helper', prompt: repairPrompt({ goal: run.goal, cause: cause.text, evidence, settings: ownSettings(run, parent), point: pointNo > 0, noCommands: workersWithoutCommands(run), appSettings }), signal, item: cause.item ?? '', lane: lane.id, limitMs: REPAIR_MS });
      parsed = readRepair(jsonOf(done.text, (value) => readRepair(value) !== null));
      if (!parsed) parsed = readRepair(await asJson(done.text, 'repair', (value) => readRepair(value) !== null, parent, run, signal));
    } catch (error) {
      R.working = false;
      // Stopped (a pause, End): it is taken again on resume. The server does not answer: it waits for it, no try used.
      if (signal.aborted || error?.down) throw error;
      const why = String(error?.message ?? error).replace(/\s+/g, ' ').trim().replace(/\.$/, '').slice(0, 300);
      const entry = { id: rid, at: Date.now(), cause: cause.text, point: pointNo, status: 'failed', said: [], files: [], asked: [], refused: [], text: `The repair helper could not run: ${why}.` };
      finishEntry(entry);
      keep(run, `repair-${rid}`, why);
      const lines = [`Step ${run.steps}: the repair helper looked at why ${cause.text}, but it could not run: ${why}.`];
      if (cause.hold) {
        const reason = `${cause.hold.reason} The repair helper could not run: ${why}.`;
        R.heldBy = rid;
        holdAfter(parent, reason, cause.hold.details);
        lines.push(`The run is paused: ${reason}\nTell the user this and do not call ${STEP_TOOL} again until they resume it.`);
      }
      return lines.join('\n');
    }
    keep(run, `repair-${rid}`, done.text || '(The repair helper gave no text.)');
    if (signal.aborted) {
      R.working = false;
      throw new Error('Stopped.');
    }
    const answer = parsed ?? { cause: '', fixed: false, own: [], ask: [] };
    // 2. Its new checks are run once first: one that cannot run is never used.
    const checked = new Map();
    for (const fix of answer.own) {
      const command = fix.kind === 'check' && typeof fix.check === 'string' ? fix.check.replace(/\s+/g, ' ').trim().slice(0, 400) : '';
      if (!command || checked.has(command) || noChecks(run) || noCommands(run)) continue;
      try {
        checked.set(command, await prove(id, run, command, signal, lane));
      } catch {
        /* not run: refused below */
      }
      if (signal.aborted) {
        R.working = false;
        throw new Error('Stopped.');
      }
    }
    // 3. Its own fixes, on the Mission's own settings (the same fix as last time for this cause counts as nothing).
    const last = new Set(R.list.filter((entry) => entry.key === cause.key).flatMap((entry) => entry.made ?? []));
    const own = applyOwn(run, answer.own, { cause, checked, last, id: rid });
    for (const fix of answer.own) {
      if (fix.kind === 'retry' && own.said.some((text) => text.startsWith('Items wait'))) {
        const target = String(fix.item ?? cause.item ?? '');
        if (target) poolOf(id).retry.set(target, Date.now() + (Number(run.long.retryAfterMs) || retryAfterMs));
      }
    }
    // What it changed in the folder, from its save point.
    let files = [];
    if (point?.id && pointNo > 0) {
      try {
        const since = await pointsOf(run.root).since(point.id);
        files = [...since.changed, ...since.added, ...since.deleted].slice(0, 200);
      } catch {
        files = [];
      }
    }
    if (files.length > 0) own.said.push(`Changed in the folder: ${files.slice(0, 20).join(', ')}${files.length > 20 ? ` and ${files.length - 20} more` : ''}.`);
    // A stuck item, or one whose check could not run, opens again only when a fix touched it or files changed.
    if (item && item.status === 'stuck' && (own.touched.includes(item.id) || files.length > 0)) {
      item.status = 'open';
      item.tries = Math.max(0, (run.limits.maxTries ?? 1) - 1);
      item.repaired = rid;
      item.note = 'The repair helper fixed what stopped it; it is tried once more.';
    }
    // 4. Its asks: parked in the card (the Ask modes) or listed (Full auto); anything that widens access is refused.
    const asked = [];
    const refused = [...own.refused];
    for (const ask of answer.ask) {
      if (ask.kind === 'setting') {
        // Owner point 19: a setting named exactly (its id and a valid value) waits for your Allow, as Calls at once does;
        // one that would give the Mission more access is refused and listed; anything else stays a suggestion.
        const named = String(ask.field ?? ask.setting ?? ask.id ?? '').trim();
        const got = named && index.length > 0 ? resolveSettingAsk(ask, { index, namespaces: await appSettingsNow() }) : { how: 'suggest' };
        if (got.how !== 'refused' && widensAccess(ask)) {
          const what = (`${String(ask.where ?? '').trim()}: ${String(ask.change ?? '').trim()}`.replace(/\s+/g, ' ').replace(/^:\s*|:\s*$/g, '').trim() || named).slice(0, 300);
          refused.push(`Not done: ${what}. The repair helper may not give the Mission more access.`);
          parkRepair(id, run, { key: `repair-access:${what}`, what, cannot: true });
          continue;
        }
        if (got.how === 'refused') {
          const what = `${got.what}${ask.to !== undefined ? ` to ${String(typeof ask.to === 'string' ? ask.to : JSON.stringify(ask.to)).slice(0, 80)}` : ''}`;
          refused.push(`Not done: ${what}. The repair helper may not change that setting: ${got.why}.`);
          parkRepair(id, run, { key: `repair-access:${named}`, what: `Change ${what} (${got.why})`, cannot: true });
          continue;
        }
        // The setting has that value already (you may have changed it since): nothing to ask.
        if (got.how === 'same') continue;
        if (got.how === 'change') {
          const entry = parkRepair(id, run, { key: `setting:${got.fix.field}:${JSON.stringify(got.fix.to)}`, what: got.what, reason: String(ask.why ?? '').slice(0, 400), fix: got.fix });
          if (entry) {
            entry.repair = rid;
            asked.push(entry.id);
          }
          continue;
        }
        const known = named ? index.find((entry) => entry.field === named) : undefined;
        const where = String(ask.where ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || (known ? `Settings → ${String(known.pageLabel ?? '').trim() || 'Settings'} → ${String(known.label ?? '').trim()}` : 'the settings');
        const change = String(ask.change ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || (known && ask.to !== undefined ? `set it to ${String(typeof ask.to === 'string' ? ask.to : JSON.stringify(ask.to)).slice(0, 80)}` : '');
        if (!change) continue;
        const question = addQuestion(run, { text: `The repair helper suggests a change in ${where}: ${change}. Mission does not change that setting itself. If you agree, change it there; then answer here.`, assume: 'It goes on as it is.', from: 'repair' });
        if (question?.id) asked.push(question.id);
        continue;
      }
      if (ask.kind === 'calls') {
        const route = routeFor(parent, 'implement', run.root);
        const server = String(route?.provider ?? '');
        let from = 4;
        try {
          from = Number(callsAtOnce(server)) || 4;
        } catch { /* 4 */ }
        const to = Math.round(Number(ask.to));
        if (!server || !Number.isFinite(to) || to < 1 || to > 16 || to >= from) {
          refused.push('Calls at once can only be lowered, for the model server this Mission uses.');
          continue;
        }
        const entry = parkRepair(id, run, { key: `calls:${server}:${to}`, what: `Send at most ${to} request${to === 1 ? '' : 's'} at a time to your model server ${server} (Settings → Mission → Calls at once; now ${from})`, reason: String(ask.why ?? '').slice(0, 400), fix: { kind: 'calls', provider: server, from, to } });
        if (entry) {
          entry.repair = rid;
          asked.push(entry.id);
        }
        continue;
      }
      if (ask.kind === 'model') {
        if (noCommands(run)) {
          refused.push('A Recon Mission keeps this thread\'s model, so no other model was asked for.');
          continue;
        }
        const route = fallbackFor(parent, run);
        if (!route) {
          refused.push('No other model is in your tier\'s fallback list (Settings → Model tiers), so none was asked for.');
          continue;
        }
        const entry = parkRepair(id, run, { key: `model:${route.provider}/${route.model}`, what: `Let this Mission's helpers use ${route.model}, the next model in your tier's fallback list (Settings → Model tiers)`, reason: String(ask.why ?? '').slice(0, 400), fix: { kind: 'model', provider: route.provider, model: route.model } });
        if (entry) {
          entry.repair = rid;
          asked.push(entry.id);
        }
      }
    }
    const fixed = own.said.length > 0;
    // Only what really waits for the user counts as asked (Full auto lists its asks and decides the questions itself).
    const waiting = asked.filter((ref) => (run.approvals ?? []).some((entry) => entry.id === ref && entry.status === 'open') || (run.questions ?? []).some((question) => question.id === ref && question.status === 'open'));
    asked.splice(0, asked.length, ...waiting);
    const status = fixed ? 'fixed' : asked.length > 0 ? 'asked' : 'nothing';
    // Lab check of stage E: each fix is a sentence of its own ("…: test -f rp2.txt It asks…" ran on), and the line
    // stays true in the report after the end (no "card above the chat box" then).
    const sentence = (said) => (/[.!?:]$/.test(String(said).trim()) ? String(said).trim() : `${String(said).trim()}.`);
    // Lab check of point 19: an ask for your OK is said as one, never as a question.
    const askedOks = asked.filter((ref) => (run.approvals ?? []).some((entry) => entry.id === ref)).length;
    const askedRest = askedOks === 0 ? 'It put the rest to you as a question.' : askedOks === asked.length ? 'It asked for your OK on the rest.' : 'It asked for your OK on part of the rest and put the rest to you as a question.';
    const text = [own.said.map(sentence).join(' '), asked.length > 0 ? askedRest : '', refused.length > 0 && !fixed && asked.length === 0 ? refused[0] : ''].filter(Boolean).join(' ') || (answer.cause ? `It found: ${answer.cause.replace(/\.?$/, '.')} It could not fix it by itself.` : 'It found nothing it could fix by itself.');
    const entry = { id: rid, key: cause.key, at: Date.now(), cause: cause.text, point: pointNo, status, said: own.said, made: own.made, files, asked, refused, text: text.slice(0, 600) };
    finishEntry(entry);
    // 5. A cause that paused the Mission before stage E pauses it now when nothing was fixed.
    const lines = [`Step ${run.steps}: the repair helper looked at why ${cause.text}. ${own.said.map(sentence).join(' ')}${asked.length > 0 ? (askedOks === 0 ? ' It asks the user about the rest in the card above the chat box.' : ' It asks the user for an OK on the rest in the card above the chat box.') : ''}`.trim()];
    if (pointNo > 0) lines.push(`Save point before it: /mission back ${pointNo}.`);
    if (cause.hold && !fixed) {
      const reason = `${cause.hold.reason}${asked.length > 0 ? ' The repair helper asks you about it in the card above the chat box.' : ' The repair helper could not fix it by itself.'}`;
      R.heldBy = rid;
      holdAfter(parent, reason, cause.hold.details);
      lines.push(`The run is paused: ${reason}\nTell the user this and do not call ${STEP_TOOL} again until they resume it.`);
    }
    try {
      save(run);
    } catch { /* the next save has it */ }
    return lines.join('\n');
  };

  const doWork = async (id, run, item, parent, signal, lane) => {
    const long = isLong(run);
    // Point 17: when it needs you, fixed for the run (kind 'mission' runs: Ask, keep working, as before).
    const needs = long ? needsOf(run) : 'ask';
    const size = helpersOf(run);
    const pool = poolOf(id);
    // With the loop on, a step that failed twice goes up to the strongest model; without it, as before.
    const senior = goesUp(run, item);
    if (senior && run.loop) run.loop.escalations = (run.loop.escalations ?? 0) + 1;
    const others = run.items.filter((entry) => entry.id !== item.id).map((entry) => `${entry.id}. ${entry.title} [${entry.status}]`).join('\n');
    await lapStart(id, run, item, signal, lane);
    if (signal.aborted) throw new Error('Stopped.');
    // Stage D: a tool allowed for this item only is put on for its helper; what waited is told to the helper.
    const grantLines = long ? await itemGrants(id, run, item, lane) : [];
    if (signal.aborted) throw new Error('Stopped.');
    const resume = long ? resumeBlock(run, item, grantLines) : '';
    // Several helpers: what the others work on now, and the files they hold.
    let working = '';
    if (size > 1) {
      const busy = workLanes(pool).filter((other) => other !== lane && other.item);
      if (busy.length > 0) {
        const held = claims ? claims.list(id).filter((entry) => entry.item !== item.id).map((entry) => relOf(run, entry.path)).filter(Boolean).slice(0, 30) : [];
        working = OTHERS_WORKING(busy.map((other) => `${other.item}. ${titleOf(run, other.item)}`).join('; '), held.join(', '));
      }
    }
    const prepared = run.loop && !senior ? await prepare(run, item, parent, signal, others) : undefined;
    // The recipe's own shape, when it has one (an extraction's keys), with the shape every loop worker ends with.
    const shapeKeys = Array.isArray(run.loop?.recipe?.shape) && run.loop.recipe.shape.length > 0 ? run.loop.recipe.shape : undefined;
    const shapeNote = run.loop ? `\n\n${SHAPE_NOTE}${shapeKeys ? ` Here "answer" must be a JSON object with ${shapeKeys.map((key) => `"${key}"`).join(', ')}.` : ''}` : '';
    // Full auto: the plan's and the review's decisions this worker is told to keep to (Finish it redoes it when one changes).
    if (long) noteDecidedSeen(run, item);
    const prompt = `${workPrompt({ goal: run.goal, summary: run.summary, item, others, senior, notes: lapNotes(run), root: run.root, noCommands: workersWithoutCommands(run), userNotes: userNotes(run), brief: briefOf(run), long, working, resume, needs })}${shapeNote}${prepared ? `\n\nSeparate attempts prepared this answer (${prepared.how}). Check it, then do the item with it: write it where the item needs it. Do not start again from nothing.\n--- PREPARED ---\n${prepared.text.slice(0, 8000)}\n--- END ---` : ''}`;
    // Where the helper's own events cannot be seen, the folder tells whether it changed anything.
    let before;
    if (!evidenceKnown) {
      try {
        before = await pointsOf(run.root).take(`Step ${run.steps + 1}: before item ${item.id}`);
      } catch {
        before = undefined;
      }
    }
    const changedFiles = before?.id ? async () => {
      const since = await pointsOf(run.root).since(before.id);
      return since.changed.length + since.deleted.length + since.added.length > 0;
    } : undefined;
    let done;
    let failed = '';
    let free = false;
    let stopReason = '';
    try {
      done = await helper({ parent, role: senior ? 'plan' : 'implement', root: run.root, label: `Mission: item ${item.id}${senior ? ' (senior)' : ''}`, prompt, signal, item: item.id, changed: changedFiles, lane: lane.id });
      stopReason = done.stopReason ?? '';
    } catch (error) {
      // Stopped, or failed while the Budget guard was stopping the run: interrupted, no try used. Stage E: so is a model
      // server that does not answer (the Mission waits for it).
      if (signal.aborted || pool.stopping || (long && error?.down)) throw error;
      failed = String(error?.message ?? error).slice(0, 300);
      free = error?.free === true;
      stopReason = String(error?.stopReason ?? '');
      done = { text: '', model: error?.model || '?', from: error?.from || 'conversation', ms: Number(error?.ms) || 0, effort: error?.effort || '' };
    }
    // Never a 0-byte step file: an answer with no text says how the helper ended.
    keep(run, `item-${item.id}-try-${item.tries + 1}`, done.text || failed || `(The worker gave no text; it ended with "${stopReason || 'no reason'}".)`);
    if (signal.aborted) throw new Error('Stopped.');
    // The worker's status line (DONE, PARTLY, BLOCKED, QUESTION; for a Mission also NEEDS ANSWER, NEEDS YES, WAITING
    // FOR FILE); "BLOCKED: none" is done.
    // Point 17: read for the run's When it needs you (Full auto never waits; Ask and wait decides nothing on a guess).
    const said = statusFor(statusOf(done.text), needs);
    const blocked = said.kind === 'blocked';
    // Questions you left to its judgement that this worker decided (stage C): kept for the report.
    takeChoices(run, done.text, item.id);
    let assumed = '';
    // A question you already answered, asked again: not shown again; the item follows your answer (after applyWork).
    let answeredBefore;
    // The question kept for the user (still open), if any; one answered or skipped before is never put to them again.
    let asked;
    let skippedBefore;
    // Stage D: what the item stops to wait for (questions and approvals), and how.
    const parkOn = [];
    let parkKind = '';
    if (said.kind === 'question' || (said.kind === 'needs-answer' && !long)) {
      // The question comes with the default the worker finished the item on; later stages show it as a card.
      asked = addQuestion(run, { text: said.question || said.text, assume: said.assume, items: [item.id], from: 'item' });
      if (asked?.status === 'answered') answeredBefore = asked;
      assumed = said.assume || 'the worker\'s own judgement (it named no default)';
    } else if (said.kind === 'needs-answer' && !failed) {
      // Ask and wait: a NEEDS ANSWER naming an open question by its id ("q3") waits for that question.
      const named = needs === 'wait' ? openQuestionRef(run, said.question || said.text) : undefined;
      if (named && !named.items.includes(item.id) && named.items.length < 20) named.items.push(item.id);
      asked = named ?? addQuestion(run, { text: said.question || said.text, assume: said.assume, items: [item.id], from: 'item' });
      if (asked?.status === 'answered') {
        // Answered before: no stop; the item follows your answer (followAnswer), and this try counts.
        answeredBefore = asked;
        assumed = said.assume || 'its own judgement';
      } else if (asked?.status === 'skipped') skippedBefore = asked;
      else if (asked?.status === 'open') {
        parkOn.push(asked.id);
        parkKind = 'question';
        asked.parks = [...new Set([...(Array.isArray(asked.parks) ? asked.parks : []), item.id])];
      } else assumed = said.assume || 'its own judgement';
    }
    // Point 17: what this item assumed for the question (a later answer that says the same redoes nothing).
    if (asked?.id && assumed) item.assumedBy = { ...(item.assumedBy && typeof item.assumedBy === 'object' ? item.assumedBy : {}), [asked.id]: String(said.assume ?? '').slice(0, 400) };
    // A helper that did nothing (an empty answer) still lets the item's own check run: an item that is already
    // done (by an earlier item's worker, say) is then verified instead of waiting for a helper that never answers.
    // An item that stopped for your answer runs no check: it is not done.
    const check = parkOn.length === 0 && item.check && (!failed || free) && !noChecks(run) ? await prove(id, run, item.check, signal, lane) : undefined;
    const freePassed = Boolean(free && failed && check?.ok);
    // Stopped while the check ran (a pause, End, the time): the item keeps its try; the step is taken again.
    if (signal.aborted) throw new Error('Stopped.');
    // Stage D: the approvals this item's helper waits for. Done (or its check passed): they stay open, and a later
    // Allow does only that step again. Otherwise the item stops and waits for them.
    const mine = long ? (lane.parkedApprovals ?? []).map((ref) => (run.approvals ?? []).find((entry) => entry.id === ref)).filter(Boolean) : [];
    const finished = Boolean(check?.ok) || (!check && said.kind === 'done');
    // Allowed while this helper still worked (it had been told to finish without it): the item does that step next.
    let allowedMeanwhile = [];
    if (long && !failed && mine.length > 0) {
      // Ask and wait: an item that finished while its yes is still open waits for it (nothing goes on a guess).
      if (finished && !(needs === 'wait' && mine.some((entry) => entry.status === 'open'))) {
        for (const entry of mine) if (entry.status === 'open') entry.after = 'redo';
        allowedMeanwhile = mine.filter((entry) => entry.status === 'allowed');
      } else if (said.kind === 'needs-yes' || mine.some((entry) => entry.status === 'open') || said.kind !== 'done') {
        for (const entry of mine) if (!parkOn.includes(entry.id)) parkOn.push(entry.id);
        parkKind = parkKind || 'approval';
      }
    }
    // Point 17, Full auto: what it was not asked. Finished: done without it (the entries stay for Finish it). Otherwise
    // set aside until the user allows it with Finish it; never a failure, never an alert.
    const notAsked = long && needs === 'decide' && !failed ? [...new Set(lane.unasked ?? [])].map((ref) => (run.approvals ?? []).find((entry) => entry.id === ref)).filter((entry) => entry && entry.status === 'unasked') : [];
    const whatOf = (entry) => (entry.kind === 'tool' ? entry.plain || entry.tool || entry.what : entry.what);
    const doneWithout = notAsked.length > 0 && finished ? notAsked : [];
    const asideOn = notAsked.length > 0 && !finished ? notAsked.map((entry) => entry.id) : [];
    // NEEDS YES with nothing of its own asked: it cannot be finished; counted as blocked (never with Full auto).
    const yesWithout = long && needs !== 'decide' && said.kind === 'needs-yes' && mine.length === 0;
    // Stage D: a file another item's helper holds (several helpers): it goes on when the file is free.
    let waitFile = '';
    if (size > 1 && !failed && parkOn.length === 0 && !check?.ok && (said.kind === 'waiting-file' || ((lane.blocked ?? []).length > 0 && (Boolean(check) || said.kind !== 'done')))) {
      const named = said.kind === 'waiting-file' ? String(said.file ?? '').trim() : '';
      waitFile = (named ? relOf(run, isAbsolute(named) ? named : join(real(run.root), named)) || named : '') || String(lane.blocked?.[0]?.file ?? '');
    }
    // Several helpers: a check that failed while others worked is run again on its own once they are done.
    const recheck = size > 1 && Boolean(check) && !check.ok && !failed && parkOn.length === 0 && !waitFile && workLanes(pool).some((other) => other !== lane);
    // The worker says it is done, but a grep check failed and printed nothing: the check may prove the opposite.
    const inverted = Boolean(check) && !check.ok && check.code === 1 && !String(check.output ?? '').trim() && /\bgrep\b/.test(item.check) && (said.kind === 'done' || /\b(passe[sd]|passing|exit(s|ed)? 0)\b/i.test(done.text));
    const aside = asideOn.length > 0 && parkOn.length === 0 && !waitFile && !recheck
      ? `Not done: it needs your yes for ${notAsked.map(whatOf).join('; ')}. Full auto does not ask; Finish it lets you allow it.`
      : !check?.ok && (lane.asides ?? []).length > 0 ? lane.asides.join(' ') : '';
    const stops = parkOn.length > 0 || Boolean(waitFile) || recheck;
    // The work loop's checker (only when it is on), after the worker and its command.
    const judged = run.loop && !failed && !blocked && !aside && !stops ? await loopCheck(run, item, done.text, prepared, parent, signal) : { ran: false, why: '' };
    if (signal.aborted) throw new Error('Stopped.');
    if (judged.ran) run.loop.checks[judged.why ? 'failed' : 'passed'] += 1;
    const touched = [...(lane.touched ?? [])];
    applyWork(run, item.id, {
      report: done.text,
      check: check ? { ok: check.ok, output: check.output } : undefined,
      aside,
      asideOn: aside && asideOn.length > 0 ? asideOn : [],
      failed: failed || (yesWithout ? `NEEDS YES: ${said.text}`.slice(0, 300) : '') || (!check && blocked ? said.text : ''),
      loopFail: judged.why,
      loopFailBy: judged.by ?? 'app',
      free,
      assumed,
      inverted,
      parked: parkOn.length > 0 ? { on: parkOn, kind: parkKind } : undefined,
      waitFile,
      recheck,
      touched,
    });
    if (allowedMeanwhile.length > 0 && redoAllowed(run, item, allowedMeanwhile, Date.now())) record(run, { kind: 'redo-allowed', item: item.id, approvals: allowedMeanwhile.map((entry) => entry.id) });
    // Full auto: finished without what it was not asked; said in its note (the report lists the entries).
    if (doneWithout.length > 0 && ['verified', 'reviewed', 'unverified'].includes(item.status)) {
      const text = String(item.note ?? '').trim();
      item.note = clip(`${text ? `${/[.!?…]$/u.test(text) ? text : `${text}.`} ` : ''}Done without: ${doneWithout.map(whatOf).join('; ')}. It needed your yes, and Full auto does not ask.`, 400);
    }
    // An item that stopped for something answered meanwhile goes on at once (with what was said).
    if (item.status === 'parked') {
      for (const ref of item.parkedOn ?? []) {
        const entry = (run.approvals ?? []).find((each) => each.id === ref);
        if (!entry || entry.status === 'open') continue;
        item.resume = item.resume && typeof item.resume === 'object' ? item.resume : { report: item.report ?? '', answers: [] };
        item.resume.answers = [...(item.resume.answers ?? []), { kind: entry.status === 'denied' ? 'denied' : 'allowed', ref, text: entry.kind === 'tool' ? entry.plain || entry.tool || entry.what : entry.what, ...(entry.tool && entry.status === 'allowed' ? { tool: entry.tool, scope: entry.choice } : {}), ...(entry.kind === 'command' && entry.status === 'allowed' && entry.command ? { command: entry.command } : {}) }];
      }
      if (settledParked(run).includes(item)) takeUpParked(run, Date.now(), { under: liveKinds(id, lane) });
      else {
        // Its files are kept for it while it waits (holds; written down for a restart).
        if (claims && size > 1) item.claims = claims.list(id).filter((entry) => entry.item === item.id).map((entry) => relOf(run, entry.path)).filter(Boolean).slice(0, 200);
      }
    }
    // Left to the Mission's judgement before: the helper stopped, so it goes on and decides it itself.
    if (skippedBefore && ['unverified', 'open'].includes(item.status) && !check?.ok) {
      item.status = item.tries >= run.limits.maxTries ? 'stuck' : 'open';
      item.resume = { report: item.report ?? '', answers: [{ kind: 'skip', ref: skippedBefore.id, text: '', question: skippedBefore.text }] };
      item.note = clip(`You left "${skippedBefore.text}" to the Mission's judgement: it decides it itself.`, 400);
    }
    const askedAgain = answeredBefore ? followAnswer(run, item.id, answeredBefore, said.assume, Date.now(), liveKinds(id, lane)) : '';
    // A step that changed the folder gets a checkpoint of its own (skipped when nothing changed). With several helpers it
    // is taken while no other helper writes, and it holds their unfinished work too.
    if (!failed && (done.tools ?? 0) > 0) {
      try {
        await underLock(id, run, lane, signal, () => pointsOf(run.root).take(`Step ${run.steps}: item ${item.id}`));
      } catch {
        /* the next check's checkpoint still holds it */
      }
    }
    record(run, { kind: 'work', role: senior ? 'plan' : 'implement', model: done.model, ms: done.ms, item: item.id, try: item.tries, status: item.status, stopReason: stopReason || undefined, effort: done.effort || undefined, status_line: said.kind, free: free || undefined, check: check ? { command: item.check, ok: check.ok, seconds: check.seconds } : null, aside: aside || undefined, askedAgain: askedAgain || undefined, ...(size > 1 ? { lane: lane.id, helpers: size } : {}), ...(item.status === 'parked' ? { parked: parkKind || 'question' } : {}), ...(waitFile ? { waitFile } : {}), ...(item.recheck ? { recheck: true } : {}), ...(run.loop ? { loop: { kind: run.loop.kind, prepared: prepared?.how ?? '', checked: judged.ran, passed: judged.ran && !judged.why, senior } } : {}) });
    if (item.status === 'parked') record(run, { kind: 'park', item: item.id, on: item.parkedOn, lane: lane.id });
    // Full auto sends no alert (it asks nothing; the report lists what it set aside).
    if (item.status === 'aside' && needs !== 'decide') emit('needs-you', id, run, { item: item.id, title: item.title });
    if (item.status === 'parked') needsYou(id, run, parkKind === 'approval' ? 'approval' : 'question');
    // Helpers that keep failing the same way (a model that does not answer, a folder they cannot write):
    // the run is paused and says why, instead of using up its laps on it. A stop to wait is no failure, and neither is
    // an item Full auto set aside for a yes it does not ask (point 17).
    const why = freePassed || item.status === 'parked' || waitFile || item.recheck || (item.status === 'aside' && (item.asideOn ?? []).length > 0) ? '' : failed || (blocked ? said.text : '') || (yesWithout ? said.text : '');
    // Workers and reviewers share the streak, so the pause names no single kind: "failed", then the last reason.
    run.failStreak = why ? (run.failStreak ?? 0) + 1 : 0;
    if (why) noteFailure(id, why, free && Boolean(failed));
    let pausedNote = '';
    if (run.failStreak >= FAIL_STREAK) {
      run.failStreak = 0;
      const reason = `${FAIL_STREAK} helpers in a row failed. The last one: ${why}`;
      // Stage E: the repair helper looks at it first; only when it is spent does the Mission pause, as before.
      pausedNote = streakRepair(id, run, parent, { kind: allEmpty(id) ? 'empty' : 'failing', reason, details: why });
    }
    // Stage E: an item that ended NOT FINISHED, or whose check could not run, gets a repair (once per item).
    // A check that cannot run is the nearer cause, so it comes first.
    if (long && check && cannotRun(check) && !noChecks(run)) repairNote(id, run, { kind: 'check', item: item.id, command: item.check, evidence: itemEvidence(run, item, check) }, pausedNote ? undefined : (said) => { pausedNote = said; });
    else if (long && item.status === 'stuck') repairNote(id, run, { kind: 'stuck', item: item.id, evidence: itemEvidence(run, item, check) }, pausedNote ? undefined : (said) => { pausedNote = said; });
    const head = `Step ${run.steps}: item ${item.id} of ${run.items.length}, "${item.title}"`;
    const outcome = { verified: 'PASSED: its command was run and passed', unverified: 'done; no command proves it, so the reviewer will judge it', open: 'not done yet; it will be tried again', stuck: 'NOT FINISHED after all its tries', aside: (item.asideOn ?? []).length > 0 ? 'SET ASIDE: it needs your yes, and Full auto does not ask' : 'SET ASIDE: it needs your yes' }[item.status] ?? item.status;
    let first;
    if (item.status === 'parked') {
      const question = (run.questions ?? []).find((entry) => (item.parkedOn ?? []).includes(entry.id));
      const yes = (run.approvals ?? []).filter((entry) => (item.parkedOn ?? []).includes(entry.id));
      first = question
        ? `${head} (${modelLine('worker', done)}): waits for the user's answer: ${question.text} Its work so far is kept; the other helpers carry on.`
        : `${head} (${modelLine('worker', done)}): waits for the user's yes: ${yes.map((entry) => entry.what).join('; ')}. Its work so far is kept; the other helpers carry on.`;
    } else if (waitFile) {
      const holder = claims?.holder(id, join(real(run.root), waitFile));
      first = `${head}: waits for ${waitFile}, which item ${holder?.item || '?'} is changing. It goes on when that file is free.`;
    } else if (item.recheck) first = `Step ${run.steps}: item ${item.id}'s check failed while other helpers were working, so it is checked again when they are done.`;
    else first = free && !freePassed ? `${head}: the helper did nothing, so this try does not count. ${failed}` : `${head} (${modelLine(senior ? 'senior worker' : 'worker', done)}, try ${item.tries}). ${outcome}.`;
    const lines = [first];
    if (prepared) lines.push(`Work loop: ${prepared.how}.`);
    if (judged.ran) lines.push(judged.why ? `Work loop check (${KINDS[run.loop.kind]?.name ?? run.loop.kind}): not passed. ${judged.why}` : `Work loop check (${KINDS[run.loop.kind]?.name ?? run.loop.kind}): passed.`);
    if (item.note && !free && item.status !== 'parked' && !waitFile && !item.recheck) lines.push(item.note);
    // Only a question still open is for the user; one answered before is in the item's note, one left to the
    // Mission's judgement is settled: neither is put to the user again (owner, 20 November).
    if (said.kind === 'question' && (!asked || asked.status === 'open')) lines.push(`The worker has a question for the user: ${said.question || said.text}`);
    else if (said.kind === 'question' && asked.status === 'skipped' && asked.self === true) lines.push(`The worker decided a question itself (Full auto): ${asked.text} It chose: ${String(said.assume || asked.chosen || 'its own judgement').replace(/[.!?]$/, '')}.`);
    else if (said.kind === 'question' && asked.status === 'skipped') lines.push(`The worker asked again a question the user left to the Mission's judgement; it went with ${asked.chosen || said.assume || 'its own judgement'}. Do not ask the user.`);
    if (check && !check.ok) lines.push(`Command: ${item.check}\n${check.output.slice(-1200)}`);
    if (done.text && item.status !== 'parked') lines.push(`Worker's report: ${done.text.replace(/\s+\n/g, '\n').slice(0, 700)}`);
    if (pausedNote) lines.push(pausedNote);
    return lines.join('\n');
  };

  /** A check that failed while other helpers worked, run again on its own now (stage D): only this result counts. */
  const doRecheck = async (id, run, item, signal, lane) => {
    const check = await prove(id, run, item.check, signal, lane);
    if (signal.aborted) throw new Error('Stopped.');
    applyWork(run, item.id, { report: item.report, check: { ok: check.ok, output: check.output } });
    record(run, { kind: 'recheck', item: item.id, ok: check.ok, status: item.status, lane: lane.id });
    if (isLong(run) && cannotRun(check)) repairNote(id, run, { kind: 'check', item: item.id, command: item.check, evidence: itemEvidence(run, item, check) });
    else if (isLong(run) && item.status === 'stuck') repairNote(id, run, { kind: 'stuck', item: item.id, evidence: itemEvidence(run, item, check) });
    return [`Step ${run.steps}: item ${item.id}'s check, run again on its own: ${check.ok ? 'passed' : 'failed again; the item is tried again'}.`, ...(check.ok ? [] : [`Command: ${item.check}\n${String(check.output ?? '').slice(-1200)}`])].join('\n');
  };

  /**
   * The question pass (stage D, several helpers): one reader asks, beside the planner, everything the Mission can
   * foresee needing from the user, so the questions are there in the first minute. Not a step: a pass that fails or
   * comes late is no failure.
   */
  const doQuestions = async (id, run, parent, signal, lane) => {
    let files = '';
    try {
      const listed = await pointsOf(run.root).files(150);
      files = listed.files.join('\n') + (listed.more ? '\n… (more files)' : '');
    } catch {
      files = '';
    }
    if (signal.aborted) throw new Error('Stopped.');
    let done;
    try {
      done = await helper({ parent, role: 'questions', root: run.root, label: 'Mission: questions', prompt: questionsPassPrompt({ goal: run.goal, context: run.long?.context ?? '', files, needs: needsOf(run) }), signal, reader: 'the question pass', loopReader: true, lane: lane.id, limitMs: questionsMs });
    } catch (error) {
      if (signal.aborted) throw error;
      record(run, { kind: 'questions', role: 'questions', model: error?.model || '?', ms: Number(error?.ms) || 0, count: 0, failed: String(error?.message ?? error).slice(0, 200) });
      return '';
    }
    if (signal.aborted || run.status !== 'running') throw new Error('Stopped.');
    const parsed = jsonOf(done.text, (value) => Array.isArray(value?.questions));
    const before = new Set((run.questions ?? []).map((question) => question.id));
    for (const entry of (Array.isArray(parsed?.questions) ? parsed.questions : []).slice(0, 6)) {
      if (typeof entry === 'string') addQuestion(run, { text: entry, from: 'plan' });
      else if (entry && typeof entry === 'object') addQuestion(run, { text: entry.question ?? entry.text, assume: entry.default ?? entry.assume ?? '', from: 'plan' });
    }
    const fresh = (run.questions ?? []).filter((question) => !before.has(question.id) && question.status === 'open');
    const askedMs = Math.max(0, Date.now() - run.startedAt);
    keep(run, 'questions', done.text || '(The question pass gave no text.)');
    record(run, { kind: 'questions', role: 'questions', model: done.model, ms: done.ms, count: fresh.length, questionsMs: askedMs });
    save(run);
    if (fresh.length === 0) return '';
    return `Questions for the user (the Mission goes on with the default; they answer in the card above the chat box):\n${fresh.map((question) => `- ${question.text}${question.assume ? ` (default: ${question.assume})` : ''}`).join('\n')}`;
  };

  const doChecks = async (id, run, signal) => {
    const results = [];
    for (const command of run.checks) {
      const result = await prove(id, run, command, signal);
      results.push({ command, ok: result.ok, output: result.output });
      if (signal.aborted) throw new Error('Stopped.');
    }
    // The keep-or-roll-back gate (Long run, step 52): a command that passed before and fails now is run a
    // second time (a flaky command never undoes good work); still failing, the lap is undone.
    let broke = brokenChecks(run, results);
    if (broke.length > 0 && run.long.lapPoint) {
      for (const result of results.filter((entry) => broke.includes(entry.command))) {
        const again = await prove(id, run, result.command, signal);
        if (again.ok) Object.assign(result, { ok: true, output: again.output });
        if (signal.aborted) throw new Error('Stopped.');
      }
      broke = brokenChecks(run, results);
    }
    if (broke.length > 0 && run.long.lapPoint) {
      const back = run.long.lapPoint;
      const went = await pointsOf(run.root).back(back);
      applyUndo(run, { kept: went.saved, back, broke, touched: run.long.lapItems ?? [] });
      run.long.lapPoint = 0;
      record(run, { kind: 'undone', back, kept: went.saved, broke });
      return [
        `Step ${run.steps}: overall commands. ${broke.join(', ')} passed before this lap and fails now, also when run again.`,
        `The lap was undone: the folder is back at checkpoint ${back}, and the undone work is kept as checkpoint ${went.saved}. Its items are open again.`,
        '',
        checklist(run),
      ].join('\n');
    }
    const before = run.items.length;
    applyChecks(run, results);
    record(run, { kind: 'checks', results: results.map((result) => ({ command: result.command, ok: result.ok })) });
    // Stage E: an overall check that cannot run at all gets a repair (it would fail every lap otherwise).
    let repairSaid = '';
    if (isLong(run)) {
      const broken = results.find((result) => cannotRun(result));
      if (broken) repairNote(id, run, { kind: 'check', command: broken.command, evidence: `Overall check: ${broken.command}\nIts output (end):\n${String(broken.output ?? '').slice(-1200)}` }, (said) => { repairSaid = said; });
    }
    const failed = run.checkResults.filter((result) => !result.ok);
    return [
      `Step ${run.steps}: overall commands. ${failed.length === 0 ? 'All passed.' : `${failed.length} of ${results.length} failed.`}`,
      ...run.checkResults.map((result) => `- ${result.ok ? 'passed' : 'FAILED'}: ${result.command}${result.ok ? '' : `\n${result.output.slice(-800)}`}`),
      run.items.length > before ? `Added ${run.items.length - before} item${run.items.length - before === 1 ? '' : 's'} to fix what failed.` : '',
      repairSaid,
    ].filter((part) => part !== '').join('\n');
  };

  const doReview = async (id, run, parent, signal, hunt = false, lane) => {
    let changes = '';
    try {
      const points = pointsOf(run.root);
      const start = await points.idOf(run.checkpoint);
      changes = start ? await points.changes(start, 40000) : '';
    } catch {
      changes = '';
    }
    const last = run.reviews + 1 >= run.limits.maxReviews;
    const prompt = reviewPrompt({ goal: run.goal, list: checklist(run), checks: run.checkResults.map((result) => `${result.ok ? 'passed' : 'FAILED'}: ${result.command}${result.ok ? '' : `\n${result.output.slice(-600)}`}`).join('\n'), changes, last: isLong(run) ? false : last, notes: lapNotes(run), hunt, context: run.long?.context ?? '', userNotes: userNotes(run), parked: run.items.some((item) => item.status === 'parked'), needs: isLong(run) ? needsOf(run) : 'ask' });
    let done;
    let review;
    let answered = false;
    try {
      done = await helper({ parent, role: 'review', root: run.root, label: 'Mission: reviewer', prompt, signal, reader: 'the reviewer', lane: lane?.id });
      answered = true;
      // Only an object with a verdict is a review: a snippet the reviewer quoted ({"name": "app"} from a
      // package file, say) is skipped; prose with no verdict at all goes through the format ask.
      review = jsonOf(done.text, hasVerdict);
    } catch (error) {
      if (signal.aborted || (isLong(run) && error?.down)) throw error;
      done = { text: String(error?.message ?? error), model: error?.model || '?', from: error?.from || 'conversation', ms: Number(error?.ms) || 0, free: error?.free === true };
    }
    if (!review && answered) review = await asJson(done.text, 'review', hasVerdict, parent, run, signal);
    if (signal.aborted) throw new Error('Stopped.');
    keep(run, `review-${run.reviews + 1}`, done.text || `(The reviewer gave no text; it ended with "${done.stopReason || 'no reason'}".)`);
    if (answered) takeChoices(run, done.text, 'review');
    const before = { items: run.items.length, open: tally(run).open };
    applyReview(run, review);
    dropCommands(run);
    const now = tally(run);
    // A Long run's reviewer with no usable answer is a helper failure: it counts toward the pause, never as
    // a lap that found nothing, and the review is taken again in the next step.
    const unusable = !review && isLong(run);
    record(run, { kind: 'review', role: 'review', model: done.model, ms: done.ms, verdict: review?.verdict ?? null, ...(unusable ? { unusable: true, again: true } : {}), reopened: now.open - before.open, added: run.items.length - before.items });
    if (isLong(run)) {
      run.failStreak = unusable ? (run.failStreak ?? 0) + 1 : 0;
      if (unusable) {
        const detail = answered ? (done.text.trim() ? 'its answer could not be read as a verdict.' : 'its answer was empty.') : done.text;
        const why = `The reviewer gave no usable answer: ${detail}`;
        const lines = [`Step ${run.steps}: ${hunt ? 'extra lap: looking for weak spots' : 'review'} (${modelLine('reviewer', done)}). ${why} The review will be taken again; this does not count as a lap that found nothing.`];
        noteFailure(id, why, answered ? !done.text.trim() : done.free === true);
        if (run.failStreak >= FAIL_STREAK) {
          run.failStreak = 0;
          const reason = `${FAIL_STREAK} helpers in a row failed. The last one: ${why}`;
          const said = streakRepair(id, run, parent, { kind: allEmpty(id) ? 'empty' : 'failing', reason, details: why });
          if (said) lines.push(said);
        }
        return lines.join('\n');
      }
    }
    const lapSaid = isLong(run) ? ` ${lapLine(run).replace(/\.$/, '')} done${hunt ? (now.open > 0 ? '; it found weak spots to work on' : '; it found nothing more to do') : ''}.` : '';
    return [
      `Step ${run.steps}: ${hunt ? 'extra lap: looking for weak spots' : 'review'} (${modelLine('reviewer', done)}). ${now.open > 0 ? `${now.open} item${now.open === 1 ? '' : 's'} to work on again.` : 'Nothing sent back.'}${lapSaid}`,
      run.reviewNote,
      '',
      checklist(run),
    ].filter((part) => part !== '').join('\n');
  };

  /** The line `<home>/mission/runs.jsonl` gets for a run that ended. */
  const finishedLine = (id, run) => `${JSON.stringify({ at: new Date().toISOString(), id: run.id, conversation: id, folder: run.root, goal: run.goal.slice(0, 300), mode: run.mode, status: run.status, steps: run.steps, minutes: Math.round(((run.endedAt || Date.now()) - run.startedAt - afterEndOf(run)) / 60000), tally: tally(run), log: join(dirOf(run), 'log.jsonl'), ...(run.stopReason ? { reason: run.stopReason.slice(0, 200) } : {}), ...(continuesOf(run) > 0 ? { continues: continuesOf(run) } : {}) })}\n`;
  /** How often a run was continued after its end (stage C). */
  const continuesOf = (run) => (isLong(run) && Array.isArray(run.long.continues) ? run.long.continues.length : 0);

  /**
   * The run's record, mirrored to `<home>/mission/runs/<id>/` after every step and at the end, so deleting a
   * conversation (and with it a Scratch folder) never loses it: a summary of the run's state, report.md and
   * log.jsonl. Never for a Recon run: its record never leaves Recon.
   */
  const mirrorDir = (run) => (typeof home === 'function' && run?.id && /^[A-Za-z0-9-]{1,80}$/.test(String(run.id)) ? join(home('mission'), 'runs', String(run.id)) : '');
  const mirror = (run, conversation = '') => {
    const dir = mirrorDir(run);
    if (!dir || noCommands(run)) return;
    try {
      mkdirSync(dir, { recursive: true });
      const now = tally(run);
      const summary = {
        id: run.id, conversation, kind: isLong(run) ? 'long' : 'mission', goal: run.goal, mode: run.mode, folder: run.root, status: run.status, stopReason: run.stopReason || '',
        steps: run.steps, startedAt: run.startedAt, endedAt: run.endedAt, ...(run.endedAt ? { minutes: tookMinutes(run) } : {}), ...(Number(run.closedAt) > 0 ? { closedAt: run.closedAt } : {}), paused: run.pausedAt ? true : false, stalled: run.stalled ?? '', tally: now,
        items: run.items.map((item) => ({ id: item.id, title: item.title, status: item.status, tries: item.tries, note: item.note })),
        questions: (run.questions ?? []).map((question) => ({ ...question })),
        ...(isLong(run) ? { long: { minutes: run.long.minutes, laps: run.long.laps, lap: run.long.lap, deadline: run.long.deadline, pausedMs: run.long.pausedMs ?? 0, continues: continuesOf(run) } } : {}),
        savedAt: Date.now(),
      };
      const temp = join(dir, `summary.json.${process.pid}.tmp`);
      writeFileSync(temp, JSON.stringify(summary, null, 1));
      renameSync(temp, join(dir, 'summary.json'));
      for (const name of ['report.md', 'log.jsonl']) {
        const from = join(dirOf(run), name);
        if (existsSync(from)) copyFileSync(from, join(dir, name));
      }
    } catch (error) {
      warn(`could not keep a copy of the run's record: ${String(error?.message ?? error)}`);
    }
  };

  const end = (id, run, agent, reason = '') => {
    // Point 17: a wait for the user that was on is over (its time never counts).
    if (isLong(run)) {
      if (Number(run.long.waitingSince) > 0) closeWait(run, Date.now());
      delete run.long.quietGoal;
      delete run.long.waitOver;
      // Stage E: a wait for the model server is over too (its time never counts).
      closeDown(run, Date.now());
      delete run.long.probing;
      if (run.long.repair) {
        run.long.repair.pending = null;
        run.long.repair.working = false;
      }
    }
    // A run ended while paused: its last paused span counts as paused in the report, not as working time.
    unpauseRun(run);
    finish(run, reason);
    run.pausedAt = 0;
    // Lab check of point 19: a fallback model the repair helper asked for means nothing once the Mission ended.
    if (isLong(run)) lapseAtEnd(run);
    const text = report(run);
    try {
      save(run);
      writeFileSync(join(dirOf(run), 'report.md'), `${text}\n`);
      record(run, { kind: 'finish', status: run.status, tally: tally(run) });
      // A Recon run leaves no line outside its folder (its goal would be there).
      if (finishedFile && !noCommands(run)) {
        mkdirSync(dirname(finishedFile), { recursive: true });
        appendFileSync(finishedFile, finishedLine(id, run));
      }
    } catch (error) {
      warn(`could not write the report: ${String(error?.message ?? error)}`);
    }
    mirror(run, id);
    // The app's goal ends with the run, so no further round is started. A conversation that is not open now
    // has it closed when it opens (closeGoal).
    let closed = false;
    try {
      const goal = agent ? goalRef(agent) : undefined;
      if (goal && goal.view.phase !== 'complete') goalsOf().complete(agent, goal.ref);
      closed = Boolean(agent);
    } catch (error) {
      warn(`could not close the goal: ${String(error?.message ?? error)}`);
    }
    if (!closed) {
      run.goalClosePending = true;
      try {
        save(run);
      } catch {
        /* closed when the conversation opens, if the record is there */
      }
    }
    // Stage D: tool permissions given for this Mission (or an item of it) are taken back, and its files are let go.
    takeBackGrants(run);
    if (isLong(run)) delete run.long.waitingSince;
    claims?.clear(id);
    // Point 17: what is left for Finish it.
    const decided = isLong(run) ? decidedQuestions(run).length : 0;
    const unasked = unaskedApprovals(run).length;
    const undone = isLong(run) ? run.items.filter((item) => item.status === 'open').length : 0;
    const late = lateRedo(run).length;
    // Owner point 19: the repair helper's suggestions alone leave nothing for you (a complete Mission stays complete).
    // Lab check of point 19: changes that wait for your OK are never "left for you" (they are counted in `oks`).
    const suggestions = (continueBlock(run) === '' ? 0 : openQuestions(run).filter((question) => repairQuestion(run, question)).length) + [...openApprovals(run), ...unaskedApprovals(run)].filter(repairAsk).length;
    emit('finished', id, run, { oks: pendingOks(run).length, summary: text.split('\n')[0], questions: openQuestions(run).length, continues: continuesOf(run), approvals: openApprovals(run).length, parked: run.items.filter((item) => item.status === 'parked').map((item) => item.id), decided, unasked, undone, left: openQuestions(run).length + late + openApprovals(run).length + unasked + undone - suggestions, canContinue: continueBlock(run) === '' && api.has(run), endKind: String(run.longEndKind ?? '') });
    wake(id);
    return text;
  };

  // Stages A-D said "Waiting: the app restarted, and it never carries on with work by itself. …"; a run saved with it
  // still reads as paused by a restart (lib/strip.js RESTARTED).
  /** Stage E: why a run came back paused after a restart. */
  const restartText = (run) => (isLong(run) && run.long?.carryOn === false ? RESTART_OFF_TEXT : isLong(run) && run.long?.carryOn === true ? RESTART_OPEN_TEXT : RESTART_OLD_TEXT);
  /** Said with every final report: the run is over, and the conversation's model is not to carry its work on by itself. */
  const OVER = 'The run is over. After giving the report, stop: do not carry on its work yourself and do not start other research or runs, unless the user asks you to.';
  /** Why a Long run ended, for its report. */
  const LONG_ENDS = { time: 'its time was up', short: 'too little time was left for another step', laps: 'it reached its lap limit', empty: `two laps in a row found nothing more to do`, asked: 'you asked it to finish the lap', allowance: 'it used its token allowance', continued: 'it did the work your answers called for', waited: (minutes) => `only your answers could move it on, and none came within ${minutes} minute${Number(minutes) === 1 ? '' : 's'}`, noWait: 'only your answers could move it on, and Full auto never waits', down: 'your model server did not answer for 2 hours' };
  /**
   * Why a Mission ended, for its report (point 17: one place, so LONG_ENDS.waited, a function, is never read as text).
   * Notes the kind (run.longEndKind) for the strip and the finished event.
   */
  const longEndText = (run, why) => {
    run.longEndKind = String(why ?? '');
    if (!why) return '';
    if (why === 'waited') return LONG_ENDS.waited(waitOf(run));
    const said = LONG_ENDS[why];
    return typeof said === 'string' ? said : '';
  };

  /** Said by a step that belonged to the Mission before it was continued (stage C). */
  const OLD_STEP = 'This step belonged to the Mission before it was continued; nothing more to do.';
  /** A run's epoch: how often it was continued. Every step carries the epoch it started in. */
  const epochOf = (run) => (isLong(run) && Array.isArray(run.long.continues) ? run.long.continues.length : 0);

  /** What a step does, in a few words (the strip and "Still working"). */
  const describeNext = (next) => {
    if (next.kind === 'review' && next.hunt) return 'an extra lap: looking for weak spots';
    if (next.kind === 'work') return `item ${next.item.id}, "${next.item.title}"`;
    if (next.kind === 'recheck') return `the check of item ${next.item.id}, run again`;
    return { plan: 'the plan', questions: 'the questions for the user', checks: 'the overall commands', review: 'the review', finish: 'the final report', repair: 'the repair helper' }[next.kind] ?? 'the next step';
  };
  const describe = (run, id) => describeNext(nextStep(run, Date.now(), id ? poolArg(id, run) : undefined));

  /** Why an item may not start yet (stage D): a stopped helper still closing, its retry time, a file someone holds. */
  const holdOf = (id, run, pool, item) => {
    if ([...pool.closing].some((lane) => lane.item === item.id && !lane.done)) return 'later';
    if ((pool.retry.get(item.id) ?? 0) > Date.now()) return 'later';
    if (item.waitFile && claims) {
      const holder = claims.holder(id, join(real(run.root), item.waitFile));
      if (holder && holder.item !== item.id) return holder.hold ? 'parked' : 'later';
    }
    return '';
  };
  /** What the run's next step reads about the pool (lib/run.js nextStep's third argument). */
  const poolArg = (id, run) => {
    const pool = poolOf(id);
    const lanes = stepLanes(pool);
    return { busy: new Set(lanes.filter((lane) => lane.item).map((lane) => lane.item)), inflight: lanes.length, exclusive: lanes.some((lane) => ALONE_KINDS.has(lane.kind)), hold: (item) => holdOf(id, run, pool, item), asking: liveLanes(pool).some((lane) => lane.kind === 'questions') };
  };

  /** @returns {number} when a wait that started at `since` ends by itself (0: it waits until the user answers). */
  const waitUntilOf = (run, since) => {
    const ms = waitMsOf(run);
    return Number.isFinite(ms) && ms > 0 && since > 0 ? since + ms : 0;
  };
  /** The words mission_step gives while the Mission waits (quiet: its goal is paused by Mission, no more calls). */
  const waitWords = (run) => waitingText({ questions: openQuestions(run).length, approvals: openApprovals(run).length, until: waitUntilOf(run, Number(run.long?.waitingSince) || 0), quiet: run.long?.quietGoal === true });
  /** The conversation's agent, when it is open. */
  const agentFor = (id) => {
    const pool = pools.get(String(id ?? ''));
    if (pool?.agent) return pool.agent;
    try {
      return agentOf?.(String(id ?? ''));
    } catch {
      return undefined;
    }
  };
  /** The run's objective for the app's goal (a new goal, or one given again). */
  const objectiveOf = (run) => `Mission run ${run.id}: ${run.goal}\n\nIn each round call the ${STEP_TOOL} tool once and tell the user what the step did. The run ends when ${STEP_TOOL} returns the final report.`;
  /**
   * The app's goal given rounds again (resume's way, point 17's wait): resumed, or a new one when it cannot be.
   * @returns {boolean} whether it is active now.
   */
  const rearmGoal = (agent, run) => {
    const goals = goalsOf();
    if (!goals || !agent) return false;
    try {
      const goal = goalRef(agent);
      if (!goal || goal.view.phase === 'complete') goals.create(agent, { objective: objectiveOf(run), maxGoalRounds: GOAL_ROUNDS });
      else if (goal.view.phase !== 'active') {
        try {
          goals.resume(agent, goal.ref);
        } catch {
          // A goal that used up its rounds, or was blocked for good, cannot be resumed: the run gets a new one.
          goals.clear(agent, goalRef(agent).ref);
          goals.create(agent, { objective: objectiveOf(run), maxGoalRounds: GOAL_ROUNDS });
        }
      }
      idle.set(agent.id, 0);
      return goalRef(agent)?.view.phase === 'active';
    } catch (error) {
      warn(`could not give the Mission rounds again: ${String(error?.message ?? error)}`);
      return false;
    }
  };

  /**
   * The Mission waits for you (stage D; point 17): marked once, one alert, keep-awake lets go, its time limit stops. Then,
   * outside the app's event (a moment later), the app's goal is paused by Mission (a quiet wait): no rounds, no model calls
   * until you answer or Wait for me runs out. If that pause cannot be made, it waits stage D's way (rounds go on).
   */
  const startWaiting = (id, run) => {
    if (!isLong(run) || needsOf(run) === 'decide' || Number(run.long.waitingSince) > 0) return;
    const since = Date.now();
    run.long.waitingSince = since;
    delete run.long.waitOver;
    try {
      save(run);
    } catch { /* kept in memory */ }
    const until = waitUntilOf(run, since);
    record(run, { kind: 'waiting', items: run.items.filter((item) => item.status === 'parked').map((item) => item.id), needs: needsOf(run), until });
    needsYou(id, run, 'you', { until, needs: needsOf(run) });
    changed(id);
    // The app's goal round driver ends a running turn of the conversation (as the user's Stop) when its goal is paused
    // from outside the conversation's own chain. Mission's pause may come from a helper settling after an answer or a
    // Resume (review of point 17): it is made on the conversation's behalf, or, where the app cannot say so, once the
    // conversation is idle.
    const agents = () => {
      try {
        return ctx.get('agents');
      } catch {
        return undefined;
      }
    };
    const attempt = (first) => {
      const L = run.long;
      let quiet = false;
      const agent = agentFor(id);
      if (L.waitingSince === since && run.status === 'running' && !run.pausedAt && agent) {
        const goal = goalRef(agent);
        const service = agents();
        const asIt = typeof service?.withInitiator === 'function';
        if (goal && goal.view.phase === 'active' && !asIt && agent.status === 'running' && typeof agent.whenIdle === 'function') {
          // Marked now, so the conductor is told not to call again; the pause follows once its turn is over.
          L.quietGoal = true;
          Promise.resolve(agent.whenIdle()).then(() => setTimeout(() => attempt(false), 0).unref?.(), () => {});
        } else if (goal && goal.view.phase === 'active') {
          // Marked first, so the app's event for this pause is known as Mission's own (pausedOutside leaves it).
          L.quietGoal = true;
          try {
            save(run);
          } catch { /* kept in memory */ }
          try {
            const pause = () => goalsOf().pause(agent, goal.ref);
            if (asIt) service.withInitiator(agent, pause);
            else pause();
            quiet = true;
            record(run, { kind: 'waiting-quietly' });
          } catch (error) {
            delete L.quietGoal;
            try {
              save(run);
            } catch { /* kept in memory */ }
            warn(`could not pause the goal of a Mission that waits for you; it waits with rounds going on: ${String(error?.message ?? error)}`);
          }
        }
      }
      if (first && L.waitingSince === since && run.status === 'running') poolOf(id).told.push(waitWords(run));
      if (quiet) idle.set(id, 0);
      changed(id);
      wake(id);
    };
    const timer = setTimeout(() => attempt(true), 0);
    timer.unref?.();
  };
  /**
   * The wait is over. An answer that lets it move on ('answer'): its time is added to the deadline, and a quiet wait gives
   * the goal its rounds again. Pause, a hold, End or /mission back ('stop'): never given rounds again here.
   */
  const stopWaiting = (id, run, why = 'answer') => {
    if (!isLong(run) || !(Number(run.long.waitingSince) > 0)) return;
    const quiet = run.long.quietGoal === true;
    closeWait(run, Date.now());
    record(run, { kind: 'waited', why, quiet });
    try {
      save(run);
    } catch { /* kept in memory */ }
    if (quiet && why === 'answer') {
      const agent = agentFor(id);
      if (agent) rearmGoal(agent, run);
    }
    changed(id);
  };

  // ---- Stage E: the model server does not answer --------------------------------------------------------------------

  /**
   * The app's goal given rounds again, also when it is active but disarmed (after a restart, or after a request the app
   * gave up on): resumed, or a new one when it cannot be. Never for a run paused by you (its callers make sure).
   * @returns {boolean} whether it is active now.
   */
  const armGoal = (agent, run) => {
    const goals = goalsOf();
    if (!goals || !agent) return false;
    try {
      const goal = goalRef(agent);
      if (!goal || goal.view.phase === 'complete') goals.create(agent, { objective: objectiveOf(run), maxGoalRounds: GOAL_ROUNDS });
      else if (goal.view.phase !== 'active' || goal.view.activation === 'disarmed') {
        try {
          goals.resume(agent, goal.ref);
        } catch {
          goals.clear(agent, goalRef(agent).ref);
          goals.create(agent, { objective: objectiveOf(run), maxGoalRounds: GOAL_ROUNDS });
        }
      }
      idle.set(agent.id, 0);
      return goalRef(agent)?.view.phase === 'active';
    } catch (error) {
      warn(`could not give the Mission rounds again: ${String(error?.message ?? error)}`);
      return false;
    }
  };
  /**
   * Pause the app's goal on the conversation's behalf (point 17's way: through agents.withInitiator, else once the
   * conversation is idle, else plainly), so no round is spent while nothing can move. `mark` says it is Mission's own
   * pause before the app's event for it comes; `unmark` when the pause could not be made.
   */
  const pauseQuietly = (id, wanted, mark, unmark) => {
    const attempt = () => {
      const agent = agentFor(id);
      if (!wanted() || !agent) return;
      const goal = goalRef(agent);
      if (!goal || goal.view.phase !== 'active') return;
      let service;
      try {
        service = ctx.get('agents');
      } catch {
        service = undefined;
      }
      const asIt = typeof service?.withInitiator === 'function';
      mark();
      if (!asIt && agent.status === 'running' && typeof agent.whenIdle === 'function') {
        Promise.resolve(agent.whenIdle()).then(() => setTimeout(attempt, 0).unref?.(), () => {});
        return;
      }
      try {
        const pause = () => goalsOf().pause(agent, goal.ref);
        if (asIt) service.withInitiator(agent, pause);
        else pause();
        idle.set(id, 0);
      } catch (error) {
        unmark();
        warn(`could not pause the goal of a Mission that waits for its model server: ${String(error?.message ?? error)}`);
      }
      changed(id);
    };
    const timer = setTimeout(attempt, 0);
    timer.unref?.();
  };
  /** What mission_step says while the Mission waits for its model server. */
  const downWords = (run) => {
    const D = run.long?.down;
    return D ? DOWN_STEP(D.nextAt, (Number(D.first) || Number(D.since)) + DOWN_MAX_MS) : NOT_DOWN_TEXT;
  };
  /**
   * The model server does not answer (stage E): the steps under way stop (their items keep their tries), the Mission
   * waits with its goal paused by itself, its time limit stands still, and the sweep tries the server again 1, 2, 5, 10
   * and 15 minutes later, then every 15 minutes. A failure 2 hours after the first ends it with its report.
   */
  const enterDown = (id, run, info = {}, tell = true) => {
    if (!isLong(run) || run.status !== 'running' || run.pausedAt) return;
    const L = run.long;
    const now = Date.now();
    const last = String(info.last ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
    if (L.down) {
      if (last) L.down.last = last;
      return;
    }
    const fresh = !(Number(L.downFirst) > 0);
    const first = fresh ? now : Number(L.downFirst);
    if (now >= first + DOWN_MAX_MS) {
      endDown(id, run, now);
      return;
    }
    stopWaiting(id, run, 'stop');
    stopLanes(id, 'Your model server does not answer.');
    const tries = Number(L.downTries) || 0;
    L.downFirst = first;
    L.down = { since: now, first, nextAt: nextTryAt(now, tries), tries, provider: String(info.provider ?? ''), model: String(info.model ?? ''), last, quiet: false };
    delete L.probing;
    try {
      save(run);
    } catch { /* kept in memory */ }
    record(run, { kind: 'down', tries, ...(last ? { last } : {}) });
    if (tell) poolOf(id).told.push(downWords(run));
    pauseQuietly(id, () => run.status === 'running' && !run.pausedAt && Boolean(run.long.down), () => {
      if (run.long.down) run.long.down.quiet = true;
      try {
        save(run);
      } catch { /* kept in memory */ }
    }, () => {
      if (run.long.down) run.long.down.quiet = false;
    });
    if (fresh) emit('stopped-by-itself', id, run, { why: 'down', reason: DOWN_REASON });
    maybeAskFallback(id, run, now);
    changed(id);
    wake(id);
  };
  /** The model server of the conversation's own model (the conductor), '' when it cannot be said. */
  const conductorProvider = (agent) => {
    try {
      return String(agent?.model?.current?.()?.provider ?? '');
    } catch {
      return '';
    }
  };
  /** Once per outage, after 10 minutes: the tier's next fallback model is asked for (not in Recon). */
  const maybeAskFallback = (id, run, now) => {
    const L = run.long;
    const D = L.down;
    if (!D || noCommands(run) || L.fallbackAsked === L.downFirst || now - (Number(L.downFirst) || now) < FALLBACK_ASK_MS || routeOf(L.fallback)) return;
    const agent = agentFor(id);
    const route = agent ? fallbackFor(agent, run) : undefined;
    if (!route) return;
    // Review of stage E: only where it can help. With one helper the conversation's own model starts every step, so a
    // fallback for the helpers alone does nothing while that model is on the server that does not answer.
    if (helpersOf(run) <= 1 && conductorProvider(agent) === String(D.provider ?? '')) return;
    L.fallbackAsked = L.downFirst;
    const entry = parkRepair(id, run, { key: `model:${route.provider}/${route.model}`, what: `Let this Mission's helpers use ${route.model}, the next model in your tier's fallback list (Settings → Model tiers)`, reason: 'Your model server does not answer.', fix: { kind: 'model', provider: route.provider, model: route.model, down: true } });
    if (entry) {
      try {
        save(run);
      } catch { /* kept in memory */ }
      changed(id);
    }
  };
  /** A try of the server that failed (a probe said down): the next one later, or the end past 2 hours. */
  const failedTry = (id, run, now) => {
    const L = run.long;
    const D = L.down;
    if (!D) return;
    if (now >= (Number(D.first) || now) + DOWN_MAX_MS) {
      endDown(id, run, now);
      return;
    }
    D.tries = (Number(D.tries) || 0) + 1;
    L.downTries = D.tries;
    D.nextAt = nextTryAt(now, D.tries);
    try {
      save(run);
    } catch { /* kept in memory */ }
    record(run, { kind: 'down-try', tries: D.tries, ok: false });
    changed(id);
  };
  /**
   * A try of the server: the wait is over (its time goes to the deadline), the goal gets its rounds again, and the
   * Mission takes one step with one helper; if the server still does not answer it waits again (the count from the
   * first failure goes on).
   */
  const startTry = (id, run, now, agentOf) => {
    const L = run.long;
    let agent;
    try {
      agent = agentOf?.(id) ?? agentFor(id);
    } catch {
      agent = agentFor(id);
    }
    if (!agent) {
      // Its conversation is not open: opened by the app when carry on is on, otherwise looked at again in a minute.
      L.down.nextAt = now + 60_000;
      if (L.carryOn === true) {
        void openAgent(id).then((opened) => {
          if (opened && run.long.down && run.status === 'running' && !run.pausedAt) startTry(id, run, Date.now(), () => opened);
        });
      }
      return;
    }
    closeDown(run, now);
    L.downTries = (Number(L.downTries) || 0) + 1;
    L.probing = true;
    record(run, { kind: 'down-try', tries: L.downTries });
    try {
      save(run);
    } catch { /* kept in memory */ }
    const pool = poolOf(id);
    pool.agent = agent;
    pool.stopping = false;
    armGoal(agent, run);
    pump(id);
    changed(id);
    wake(id);
  };
  /** The sweep's look at a Mission that waits for its model server. */
  const probing = new Set();
  const downSweep = (id, run, now, agentOf) => {
    const D = run.long.down;
    if (!D) return;
    maybeAskFallback(id, run, now);
    if (now < (Number(D.nextAt) || 0) || probing.has(id)) return;
    let health;
    try {
      health = ctx.get('routeHealth');
    } catch {
      health = undefined;
    }
    // Review of stage E: with a fallback model you allowed, its server is the one the helpers use, so that one is tried.
    const target = routeOf(run.long.fallback)?.provider || D.provider;
    if (target && typeof health?.probeNow === 'function' && health.state?.(target)) {
      probing.add(id);
      // The probe's answer counts at the time of this look (a probe takes a few seconds at most).
      Promise.resolve(health.probeNow(target)).then((snapshot) => {
        probing.delete(id);
        if (!run.long.down || run.status !== 'running' || run.pausedAt) return;
        if (snapshot?.state === 'down') failedTry(id, run, now);
        else startTry(id, run, now, agentOf);
      }, () => {
        probing.delete(id);
        if (run.long.down && run.status === 'running' && !run.pausedAt) failedTry(id, run, now);
      });
      return;
    }
    startTry(id, run, now, agentOf);
  };
  /** Two hours without the model server: the Mission ends at once with its report (no report round: the server is the problem). */
  const endDown = (id, run, now = Date.now()) => {
    const L = run.long;
    closeDown(run, now);
    delete L.downFirst;
    delete L.downTries;
    delete L.probing;
    run.longEnd = longEndText(run, 'down');
    record(run, { kind: 'down-end' });
    const text = end(id, run, agentFor(id));
    poolOf(id).told.push(`Your model server did not answer for 2 hours, so the Mission ended. This is the final report; give it to the user in full:\n\n${text}\n\n${OVER}`);
    wake(id);
    return text;
  };
  /** The app's sessionController opens a closed conversation (as its scheduler does); undefined when it cannot. */
  const openAgent = async (id, timeoutMs = 20_000) => {
    const open = agentFor(id);
    if (open) return open;
    let controller;
    try {
      controller = ctx.get('sessionController');
    } catch {
      controller = undefined;
    }
    if (typeof controller?.resolveAgent !== 'function') return undefined;
    let timer;
    try {
      const got = await Promise.race([
        Promise.resolve(controller.resolveAgent(String(id))),
        new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs); timer.unref?.(); }),
      ]);
      return got?.agent ?? undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  };

  /** Start a lane for the step `next` (stage D). */
  const startLane = (id, run, agent, next) => {
    const pool = poolOf(id);
    pool.n += 1;
    const kind = next.kind === 'review' && next.hunt ? 'hunt' : next.kind;
    const lane = { id: `L${pool.n}`, kind, item: next.item ? String(next.item.id) : '', why: next.why ?? '', gen: pool.gen, epoch: epochOf(run), stopper: new AbortController(), startedAt: Date.now(), what: describeNext(next), asides: [], blocked: [], parkedApprovals: [], unasked: [], touched: new Set(), itemGrants: [], cutByTime: false, done: false, text: '' };
    pool.lanes.set(lane.id, lane);
    if (next.item && STEP_KINDS.has(kind)) {
      // Written down, so a restart knows the item was being worked on (it is told so when it goes on).
      next.item.lane = lane.id;
      try {
        save(run);
      } catch { /* the next save has it */ }
    }
    if (kind === 'questions') run.long.askedEarly = true;
    lane.promise = runLane(agent, run, lane).then((result) => settle(id, run, agent, lane, result));
    lane.promise.catch((error) => warn(`a lane failed to settle: ${String(error?.message ?? error)}`));
    changed(id);
    return lane;
  };

  /**
   * One lane from start to end. It never throws: what went wrong is part of what it returns. Run changes happen only
   * while the lane is current: after every await, `signal.aborted` (a pause, End, the time) is checked first.
   * @returns {Promise<{text: string, ok?: boolean, stale?: boolean, cut?: boolean, ended?: boolean}>}
   */
  const runLane = async (agent, run, lane) => {
    const id = agent.id;
    const signal = lane.stopper.signal;
    // A step of the Mission before it was continued (stage C) that settles late leaves the continued run alone.
    const stale = () => epochOf(run) !== lane.epoch;
    const item = lane.item ? run.items.find((entry) => entry.id === lane.item) : undefined;
    try {
      let text;
      if (lane.kind === 'finish') {
        if (lane.why && isLong(run)) run.longEnd = longEndText(run, lane.why);
        return { text: `This was the last step. Give the user this report in full:\n\n${end(id, run, agent)}\n\n${OVER}`, final: true };
      }
      if (lane.kind === 'plan') text = await doPlan(id, run, agent, signal, lane);
      else if (lane.kind === 'questions') text = await doQuestions(id, run, agent, signal, lane);
      else if (lane.kind === 'work') text = await doWork(id, run, item, agent, signal, lane);
      else if (lane.kind === 'recheck') text = await doRecheck(id, run, item, signal, lane);
      else if (lane.kind === 'checks') text = await doChecks(id, run, signal);
      else if (lane.kind === 'repair') text = await doRepair(id, run, agent, signal, lane);
      else text = await doReview(id, run, agent, signal, lane.kind === 'hunt', lane);
      if (stale()) return { text: OLD_STEP, stale: true };
      // Ended while this step finished (End, the clock): nothing more is written for it.
      if (run.status !== 'running') return { text: `The user ended the run while this step was under way. Give the user its report:\n\n${report(run)}\n\n${OVER}`, ended: true };
      if (lane.kind !== 'questions') {
        run.errors = 0;
        // Stage E: a repair that paused the Mission keeps its words (the pause is a moment later).
        if (lane.kind !== 'repair') {
          run.stalled = '';
          run.stalledDetails = '';
        }
        run.selfStops = 0;
        // How long a step of this run takes (the clock uses its median); a repair is no step of the work.
        if (lane.kind !== 'repair') noteStepTime(run, Date.now() - lane.startedAt);
        run.lastStepAt = Date.now();
        // Stage E: a finished step ends the carry-on brake's count.
        if (isLong(run) && lane.kind !== 'repair') delete run.long.carryOns;
      }
      save(run);
      mirror(run, id);
      return { text, ok: true };
    } catch (error) {
      if (stale()) return { text: OLD_STEP, stale: true };
      // A Recon run ended (End and wipe) while this step ran: its folder is being deleted, so nothing is
      // written there again (review finding 5).
      const gone = noCommands(run) && run.status !== 'running';
      try {
        if (!gone) save(run);
      } catch {
        /* the run on disk is one step behind */
      }
      const pool = poolOf(id);
      if (signal.aborted || pool.stopping) {
        if (!gone) record(run, { kind: lane.cutByTime ? 'cut-by-time' : 'interrupted', ...(lane.item ? { item: lane.item } : {}), ...(helpersOf(run) > 1 ? { lane: lane.id } : {}) });
        // Ended by the user (End, /mission end): not "taken again on resume".
        if (run.status !== 'running') return { text: `The user ended the run while this step was under way. Give the user its report:\n\n${report(run)}\n\n${OVER}`, ended: true };
        // The step ran past the run's time and its grace: the item keeps its try, and the run ends with its report.
        if (lane.cutByTime && isLong(run)) return { text: '', cut: true };
        return { text: 'The step was stopped before it finished. Nothing is lost: the run takes this step again when it is resumed (Resume beside the chat box, or /mission resume).', interrupted: true };
      }
      const reason = String(error?.message ?? error).slice(0, 300);
      // Stage E: the model server does not answer. No error is counted and no try used: the Mission waits for it.
      if (error?.down && isLong(run) && lane.kind !== 'questions' && run.status === 'running') {
        const item = lane.item ? run.items.find((entry) => entry.id === lane.item) : undefined;
        if (item && (lane.kind === 'work' || lane.kind === 'recheck') && item.status === 'open') item.interrupted = true;
        if (lane.kind === 'repair' && run.long.repair) run.long.repair.working = false;
        record(run, { kind: 'error', error: reason, down: true, ...(lane.item ? { item: lane.item } : {}) });
        if (run.long.retry !== true) {
          holdAfter(agent, DOWN_OFF_TEXT, reason);
          save(run);
          return { text: `${DOWN_OFF_TEXT}\nTell the user this in plain words and do not call ${STEP_TOOL} again until they resume it.` };
        }
        enterDown(id, run, { last: reason, provider: error.provider, model: error.model }, helpersOf(run) > 1);
        // Two hours without the server: it ended just now; its report is what this step says.
        if (run.status !== 'running') return { text: joinTold(pool.told.splice(0)), final: true };
        return { text: run.long.down ? DOWN_STEP(run.long.down.nextAt, run.long.down.first + DOWN_MAX_MS) : '', down: true };
      }
      record(run, { kind: 'error', error: reason, ...(lane.item ? { item: lane.item } : {}) });
      warn(`a step failed: ${reason}`);
      if (lane.kind === 'questions') return { text: '' };
      // Stage E: a repair helper that failed in an unforeseen way counts toward no streak and starts no repair.
      if (lane.kind === 'repair') {
        const R = isLong(run) ? repairOf(run, epochOf(run)) : undefined;
        if (R?.pending) {
          R.tries[R.pending.key] = (Number(R.tries[R.pending.key]) || 0) + 1;
          R.count = (Number(R.count) || 0) + 1;
          R.pending = null;
        }
        if (R) R.working = false;
        save(run);
        return { text: `The repair helper could not run: ${reason}` };
      }
      // Several helpers: the item waits a moment before a helper takes it again, so a failing step cannot spin.
      // Stage E: the repair helper may have set a longer wait for this Mission.
      const waitMs = isLong(run) && Number(run.long.retryAfterMs) > 0 ? Number(run.long.retryAfterMs) : retryAfterMs;
      if (lane.item && helpersOf(run) > 1) {
        pool.retry.set(lane.item, Date.now() + waitMs);
        // When that moment is up the pool is filled again (nothing else may come to start it).
        const timer = setTimeout(() => {
          pump(id);
          wake(id);
        }, waitMs + 20);
        timer.unref?.();
      }
      // The same step failing three times running will not get better by itself: the run pauses with a plain
      // reason (the error itself is kept as details) and carries on when the user presses Resume. Only End or
      // the run's budget ends a run.
      run.errors = (run.errors ?? 0) + 1;
      noteFailure(id, reason, false);
      if (run.errors >= ERROR_STREAK) {
        run.errors = 0;
        const plain = `${plainError(reason)} The run is paused; fix it, then press Resume.`;
        // Stage E: the repair helper looks at it first; once it is spent, the pause from before.
        const got = isLong(run) ? askRepair(id, run, { kind: 'errors', evidence: lastFailures(id) || reason, hold: { reason: plain, details: reason } }) : 'spent';
        if (got === 'asked') {
          save(run);
          return { text: `The same step failed ${ERROR_STREAK} times in a row (${reason}). The Mission's repair helper looks at why next.` };
        }
        if (got !== 'busy') {
          const tried = isLong(run) && (Number(run.long?.repair?.tries?.errors) || 0) > 0;
          const said = `${plain}${tried ? ' The repair helper already tried for this.' : ''}`;
          holdAfter(agent, said, reason);
          save(run);
          return { text: `The same step failed ${ERROR_STREAK} times in a row (${reason}), so the run is paused: ${said}\nTell the user this in plain words and do not call ${STEP_TOOL} again until they resume it.` };
        }
      }
      save(run);
      return { text: `This step did not work: ${reason}\nThe run goes on with the next round and tries the step again. If it keeps failing, the user can end it with End above the chat box, or /mission end.` };
    }
  };

  /** After a lane of a Mission with one helper: what comes next, or the final report (stage C's words). */
  const afterOne = (id, run, agent, text) => {
    const after = nextStep(run, Date.now(), isLong(run) ? poolArg(id, run) : undefined);
    if (after.kind === 'finish' && after.why && isLong(run)) run.longEnd = longEndText(run, after.why);
    if (after.kind === 'finish') return `${text}\n\nThe work is through. This is the final report; give it to the user in full:\n\n${end(id, run, agent)}\n\n${OVER}`;
    const ahead = { work: `Next: item ${after.item?.id}, "${after.item?.title}".`, checks: 'Next: the overall commands.', review: 'Next: the review.', plan: 'Next: the plan.', recheck: `Next: the check of item ${after.item?.id}, run again.`, 'wait-you': 'Next: the Mission waits for the user\'s answers in the card.', repair: 'Next: the repair helper.' }[after.kind] ?? '';
    return `${text}\n\n${ahead} The run goes on in the next round.`;
  };

  /** The conductor's line about the pool now (several helpers). */
  const poolNow = (id, run) => {
    const pool = poolOf(id);
    const lanes = liveLanes(pool);
    const working = lanes.filter((lane) => lane.kind === 'work' && lane.item).map((lane) => lane.item);
    const other = lanes.find((lane) => lane.kind !== 'work' && lane.kind !== 'questions')?.what ?? '';
    return poolLine({ working, size: helpersOf(run), waiting: run.items.filter((item) => item.status === 'parked').map((item) => item.id), other });
  };

  /**
   * A lane settled (stage D, F): what it held is let go (an item that parked keeps its files as holds), its text goes
   * to the conductor, and the pump starts what can start now. A lane of an older gen or epoch only lets go.
   */
  const settle = (id, run, agent, lane, result) => {
    const pool = poolOf(id);
    lane.done = true;
    pool.closing.delete(lane);
    const item = lane.item ? run.items.find((entry) => entry.id === lane.item) : undefined;
    if (item && item.lane === lane.id) delete item.lane;
    if (claims) claims.settle(id, lane.id, { keep: item?.status === 'parked' });
    // An item that goes on (or was let go) no longer holds files.
    if (claims && item && item.status !== 'parked') {
      claims.releaseItem(id, item.id);
      delete item.claims;
    }
    dropItemGrants(id, run, lane);
    let text = String(result?.text ?? '');
    const current = lane.gen === pool.gen && lane.epoch === epochOf(run) && !result?.stale;
    const size = helpersOf(run);
    if (result?.cut && run.status === 'running' && isLong(run)) {
      // Cut by the time limit: when the last cut lane settles, the run ends with its report.
      if (lane.item && size > 1) run.cutItems = [...new Set([...(Array.isArray(run.cutItems) ? run.cutItems : []), lane.item])];
      run.cutByTime = run.cutByTime || lane.what;
      if (stepLanes(pool).length === 0) {
        run.longEnd = longEndText(run, 'time');
        text = `The step was cut short: the run's time was up. This is the final report; give it to the user in full:\n\n${end(id, run, agent)}\n\n${OVER}`;
      } else text = '';
    } else if (current && result?.ok && run.status === 'running' && lane.kind !== 'questions') {
      // Stage E: the first step that worked after the model server came back ends the outage.
      if (isLong(run) && Number(run.long.downFirst) > 0 && !run.long.down) {
        const minutes = Math.round((Number(run.long.downMs) || 0) / 60000);
        delete run.long.downFirst;
        delete run.long.downTries;
        delete run.long.probing;
        delete run.long.fallbackAsked;
        record(run, { kind: 'down-over', minutes });
        try {
          save(run);
        } catch { /* the next save has it */ }
        emit('resumed', id, run, { by: 'down', reopened: 0 });
      }
      emit('step', id, run, { step: run.steps, what: lane.kind === 'hunt' ? 'review' : lane.kind, lane: lane.id, item: lane.item, working: stepLanes(pool).length, ...(isLong(run) ? { lap: run.long.lap } : {}) });
      if (size <= 1) text = afterOne(id, run, agent, text);
    } else if (!current && !result?.final) text = size > 1 ? '' : text;
    if (size > 1 || lane.kind === 'questions') {
      pool.lanes.delete(lane.id);
      if (text) pool.told.push(text);
    } else lane.text = text;
    wake(id);
    changed(id);
    if (size > 1 && current && run.status === 'running') pump(id);
    return text;
  };

  /**
   * Start what can start now (stage D, D): several helpers keep the pool full while work can move; checks, the review
   * and a recheck start alone once it has drained. One helper at once: only mission_step starts a lane, one per call.
   */
  const pump = (id) => {
    const run = runs.get(String(id ?? ''));
    if (!run || run.status !== 'running' || !isLong(run) || helpersOf(run) <= 1) return;
    const pool = poolOf(id);
    if (pool.stopping || pool.pumping) return;
    let agent = pool.agent;
    if (!agent) {
      try {
        agent = agentOf?.(id);
      } catch {
        agent = undefined;
      }
    }
    if (!agent || run.pausedAt || api.paused(agent) || run.long.down) return;
    try {
      if (mayRun?.(agent)) return;
    } catch {
      return;
    }
    // Stage E: the repair helper may have asked for fewer helpers; a try of the model server uses one until it worked.
    const cap = Number(run.long.helpersCap) > 0 ? Number(run.long.helpersCap) : helpersOf(run);
    const size = run.long.probing === true ? 1 : Math.max(1, Math.min(helpersOf(run), cap));
    pool.pumping = true;
    try {
      for (let turn = 0; turn < 20; turn += 1) {
        const next = nextStep(run, Date.now(), poolArg(id, run));
        if (next.kind !== 'wait-you') stopWaiting(id, run);
        if (next.kind === 'plan') {
          if (!liveLanes(pool).some((lane) => lane.kind === 'plan')) {
            startLane(id, run, agent, next);
            // The question pass beside the planner: everything foreseeable asked in the first minute (not in Recon).
            // Not with Full auto (nobody is asked; its planner decides and lists its questions).
            if (!noCommands(run) && !run.long.askedEarly && needsOf(run) !== 'decide') startLane(id, run, agent, { kind: 'questions' });
          }
          break;
        }
        if (next.kind === 'work') {
          if (workLanes(pool).length >= size) break;
          startLane(id, run, agent, next);
          continue;
        }
        if (next.kind === 'checks' || next.kind === 'review' || next.kind === 'recheck' || next.kind === 'repair') {
          if (stepLanes(pool).length === 0) startLane(id, run, agent, next);
          break;
        }
        if (next.kind === 'wait-you') {
          startWaiting(id, run);
          break;
        }
        if (next.kind === 'finish' && stepLanes(pool).length === 0) {
          if (next.why) run.longEnd = longEndText(run, next.why);
          pool.told.push(`The work is through. This is the final report; give it to the user in full:\n\n${end(id, run, agent)}\n\n${OVER}`);
          wake(id);
        }
        break;
      }
    } finally {
      pool.pumping = false;
    }
  };

  /**
   * Stop every lane of a conversation (Pause, a hold, Stop, a pause outside Mission, End): a new gen starts, their
   * items are marked as stopped part way, and the lanes are kept as closing until they settle.
   * @returns {number} how many were at work.
   */
  const stopLanes = (id, why = 'Stopped.') => {
    const pool = pools.get(String(id ?? ''));
    if (!pool) return 0;
    pool.gen += 1;
    const run = runs.get(String(id ?? ''));
    let count = 0;
    for (const lane of liveLanes(pool)) {
      if (lane.kind !== 'questions') count += 1;
      pool.closing.add(lane);
      const item = lane.item && run ? run.items.find((entry) => entry.id === lane.item) : undefined;
      if (item && (lane.kind === 'work' || lane.kind === 'recheck')) item.interrupted = true;
      lane.stopper.abort(new Error(why));
    }
    if (run) stopWaiting(id, run, 'stop');
    wake(id);
    return count;
  };
  /** Wait for every closing lane to settle, at most `ms`. @returns {Promise<boolean>} whether they all did. */
  const closed = async (id, ms) => {
    const pool = pools.get(String(id ?? ''));
    const left = pool ? [...pool.closing].filter((lane) => !lane.done && lane.promise) : [];
    if (left.length === 0) return true;
    let timer;
    const settledAll = await Promise.race([Promise.all(left.map((lane) => lane.promise.then(() => true, () => true))).then(() => true), new Promise((resolve) => { timer = setTimeout(() => resolve(false), ms); timer.unref?.(); })]);
    clearTimeout(timer);
    return settledAll;
  };
  /** The texts the conductor has not been told yet, joined, plus where the pool stands (several helpers). */
  const takeTold = (id, run) => {
    const pool = poolOf(id);
    if (pool.told.length === 0) return '';
    const text = joinTold(pool.told.splice(0));
    if (helpersOf(run) <= 1 || run.status !== 'running') return text;
    const line = poolNow(id, run);
    return line ? `${text}\n\n${line}` : text;
  };

  /** mission_step with one helper at once (stage C's path, plus waiting for you). */
  const stepOne = async (agent, run, signal, waitMs) => {
    const id = agent.id;
    const pool = poolOf(id);
    const until = Date.now() + waitMs;
    let lane = [...pool.lanes.values()][0];
    while (!lane) {
      const next = nextStep(run, Date.now(), isLong(run) ? poolArg(id, run) : undefined);
      if (next.kind === 'wait-you' || next.kind === 'drain') {
        if (next.kind === 'wait-you') startWaiting(id, run);
        const told = takeTold(id, run);
        if (told) return told;
        const left = until - Date.now();
        if (left <= 0) return next.kind === 'wait-you' ? waitWords(run) : stillWorking({ minutes: 1, other: 'a step that is closing' });
        const outcome = await news(id, next.kind === 'drain' ? Math.min(left, 2000) : left, signal);
        if (outcome === 'cut') return 'The call was cut off. The step itself is looked after by the run.';
        if (run.status !== 'running') return takeTold(id, run) || `The mission run has ended.\n\n${report(run)}\n\n${OVER}`;
        // Point 17: Mission paused its goal to wait for the user (no rounds): the conductor is told so, once.
        if (api.waitingQuietly(id)) return takeTold(id, run) || waitWords(run);
        if (api.paused(agent)) return `${PAUSED_TEXT}${run.stalled ? ` ${run.stalled}` : ''}\nTell the user this in one line, and do not call ${STEP_TOOL} again; do no work of your own for the run.`;
        continue;
      }
      if (isLong(run)) stopWaiting(id, run);
      lane = startLane(id, run, agent, next.kind === 'done' ? { kind: 'finish' } : next);
    }
    const current = lane;
    let timer;
    let onAbort;
    const outcome = await Promise.race([
      current.promise.then(() => 'done'),
      new Promise((resolve) => { timer = setTimeout(() => resolve('wait'), Math.max(0, until - Date.now())); timer.unref?.(); }),
      new Promise((resolve) => { onAbort = () => resolve('cut'); if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true }); }),
    ]);
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    if (outcome === 'done') {
      if (pool.lanes.get(current.id) === current) pool.lanes.delete(current.id);
      // Stage E: what the conductor was told meanwhile (a carry on after a restart) comes first.
      const told = run.status === 'running' && !current.final ? takeTold(id, run) : '';
      return told ? `${told}\n\n${current.text}` : current.text;
    }
    if (outcome === 'cut') {
      // The call was cut off. If the user stopped the run, the step stops too; if only the
      // program's time ran out, the step goes on and the next call finds it.
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const goal = goalRef(agent);
      if (!goal || goal.view.phase !== 'active') current.stopper.abort(new Error('Stopped.'));
      return 'The call was cut off. The step itself is looked after by the run.';
    }
    const minutes = Math.max(1, Math.round((Date.now() - current.startedAt) / 60000));
    return `Still working on this step: ${current.what} (${minutes} minute${minutes === 1 ? '' : 's'} so far). This is normal: a model is doing the work. Call ${STEP_TOOL} again in the next round; it waits for the same step. Do nothing else.`;
  };

  /** mission_step with several helpers at once (stage D, E): start what can start, then give what settled. */
  const stepMany = async (agent, run, signal, waitMs) => {
    const id = agent.id;
    const pool = poolOf(id);
    const until = Date.now() + waitMs;
    for (;;) {
      pump(id);
      const told = takeTold(id, run);
      if (told) return told;
      if (run.status !== 'running') return `The mission run has ended.\n\n${report(run)}\n\n${OVER}`;
      const left = until - Date.now();
      if (left <= 0) break;
      const outcome = await news(id, left, signal);
      if (outcome === 'cut') {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const goal = goalRef(agent);
        if (!goal || goal.view.phase !== 'active') stopLanes(id);
        return 'The call was cut off. The step itself is looked after by the run.';
      }
      if (api.waitingQuietly(id)) return takeTold(id, run) || waitWords(run);
      if (api.paused(agent)) return `${PAUSED_TEXT}${run.stalled ? ` ${run.stalled}` : ''}\nTell the user this in one line, and do not call ${STEP_TOOL} again; do no work of your own for the run.`;
    }
    if (Number(run.long?.waitingSince) > 0) return waitWords(run);
    const lanes = liveLanes(pool);
    const oldest = lanes.reduce((min, lane) => Math.min(min, lane.startedAt), Date.now());
    return stillWorking({ working: lanes.filter((lane) => lane.kind === 'work' && lane.item).map((lane) => lane.item), minutes: Math.max(1, Math.round((Date.now() - oldest) / 60000)), other: lanes.find((lane) => lane.kind !== 'work')?.what ?? '' });
  };

  /** The kinds of the lanes at work (answers read them to tell whether a reopened item can still be done). */
  const underOf = (id) => liveKinds(id).filter((kind) => kind !== 'questions');
  /** An answer or an approval came: what waits may move now. */
  /**
   * An answer or an approval came: what waits may move now. During a wait for the user (point 17): an answer that frees
   * work starts a new pass (also at the lap limit), and so does an answer to a question that only kept Ask and wait from
   * ending (its checks and a review read it); then the wait is over (a quiet one gets its rounds back). An answer that
   * frees nothing yet keeps it waiting, with no new alert.
   * @param {{gateBefore?: string[]}} [given] - Ask and wait's end gate before the answer.
   */
  const afterAnswer = (id, run, wentOn = [], { gateBefore = [] } = {}) => {
    if (wentOn.length > 0) record(run, { kind: 'unpark', items: wentOn });
    const quiet = isLong(run) && Number(run.long.waitingSince) > 0 && run.long.quietGoal === true;
    if (isLong(run) && Number(run.long.waitingSince) > 0 && run.status === 'running') {
      const L = run.long;
      const was = { lapEnded: L.lapEnded, phase: run.phase };
      L.lapEnded = false;
      const next = nextStep(run, Date.now(), poolArg(id, run));
      const gateNow = endGate(run);
      const orphan = gateBefore.some((ref) => !gateNow.includes(ref));
      if (next.kind === 'work') run.phase = 'work';
      if (orphan) {
        // A question (or approval) no item waited for was answered: its checks and a review that reads it come next.
        run.phase = 'work';
        run.limits = { ...run.limits, maxSteps: Math.max(run.limits.maxSteps, run.steps + 4) };
        if (run.reviews >= run.limits.maxReviews) run.reviews = Math.max(0, run.limits.maxReviews - 1);
      }
      const after = nextStep(run, Date.now(), poolArg(id, run));
      if (after.kind === 'wait-you') {
        L.lapEnded = was.lapEnded;
        run.phase = was.phase;
      } else {
        delete L.waitOver;
        stopWaiting(id, run, 'answer');
      }
    } else if (isLong(run) && run.long.waitOver === true && run.status === 'running') {
      // Wait for me ran out a moment ago and its report round has not come yet: an answer that frees work goes on
      // instead of ending as "no answer came" (review of point 17).
      const L = run.long;
      delete L.waitOver;
      const was = { lapEnded: L.lapEnded, phase: run.phase };
      L.lapEnded = false;
      const after = nextStep(run, Date.now(), poolArg(id, run));
      if (after.kind === 'wait-you') {
        L.waitOver = true;
        L.lapEnded = was.lapEnded;
        run.phase = was.phase;
      } else {
        if (after.kind === 'work') run.phase = 'work';
        record(run, { kind: 'wait-over-answered' });
      }
    }
    wake(id);
    changed(id);
    pumpAfterWait(id, run, quiet && !(Number(run.long?.waitingSince) > 0));
  };
  /**
   * The pump after a quiet wait ended (an answer, Finish this lap). With several helpers the pump would end the Mission
   * at once when its next step is the final report, and complete the goal before the round it was just given comes:
   * nobody would be told the report in the chat. Then the goal's round does it (its mission_step ends the Mission), as
   * when Wait for me runs out (review of point 17). Anything else is pumped as before.
   */
  const pumpAfterWait = (id, run, wasQuiet) => {
    if (wasQuiet && run.status === 'running' && nextStep(run, Date.now(), poolArg(id, run)).kind === 'finish') {
      const agent = agentFor(id);
      if (agent && goalRef(agent)?.view.phase === 'active') return;
    }
    pump(id);
  };

  /** The helper a session is (or a helper of one), and its lane: walks up the chain of helpers. */
  const laneUp = (sessionId) => {
    let current = String(sessionId ?? '');
    for (let depth = 0; current && depth < 8; depth += 1) {
      const found = roles.get(current);
      if (found) return found;
      let agent;
      try {
        agent = ctx.get('agents')?.get?.(current) ?? (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === current);
      } catch {
        agent = undefined;
      }
      const parent = agent?.header?.parentSession ?? agent?.session?.header?.parentSession;
      if (typeof parent !== 'string' || parent === current) return undefined;
      current = parent;
    }
    return undefined;
  };

  /** Wait for me ran out: the Mission ends with its report (said in the chat at its next round). */
  const endWaited = (id, run, agent, now = Date.now()) => {
    const minutes = waitOf(run);
    if (Number(run.long.waitingSince) > 0) closeWait(run, now);
    delete run.long.waitOver;
    run.longEnd = longEndText(run, 'waited');
    record(run, { kind: 'waited', minutes });
    const text = end(id, run, agent);
    poolOf(id).told.push(`Nobody answered within ${minutes} minute${minutes === 1 ? '' : 's'}, so the Mission ended. This is the final report; give it to the user in full:\n\n${text}\n\n${OVER}`);
    wake(id);
    return text;
  };

  /** Stage E's part of a run's view. */
  const stageView = (run, id = '') => {
    const L = isLong(run) ? run.long : {};
    let chosen = L.assistant;
    if (chosen !== 'talk' && chosen !== 'look') {
      try {
        chosen = assistantOf?.(id, run) ?? settings().long?.assistant;
      } catch {
        chosen = '';
      }
    }
    const R = L.repair && typeof L.repair === 'object' ? L.repair : undefined;
    const D = L.down && typeof L.down === 'object' ? L.down : undefined;
    const fallback = routeOf(L.fallback);
    return {
      assistant: readAssistant(chosen),
      carryOn: typeof L.carryOn === 'boolean' ? L.carryOn : null,
      carriedOnAt: Number(run.carriedOnAt) || 0,
      down: D && run.status === 'running' ? { since: Number(D.since) || 0, first: Number(D.first) || Number(D.since) || 0, nextAt: Number(D.nextAt) || 0, tries: Number(D.tries) || 0, provider: String(D.provider ?? ''), last: String(D.last ?? '') } : null,
      downMs: Number(L.downMs) || 0,
      repairing: R?.pending && run.status === 'running' ? { cause: String(R.pending.text ?? ''), working: R.working === true } : null,
      repairs: (R?.list ?? []).slice(-10).map((entry) => ({ id: String(entry.id ?? ''), at: Number(entry.at) || 0, cause: String(entry.cause ?? ''), text: String(entry.text ?? ''), status: String(entry.status ?? ''), point: Number(entry.point) || 0 })),
      fallback: fallback ? { provider: fallback.provider, model: fallback.model } : null,
    };
  };

  const api = {
    runOf,
    /** @returns {boolean} whether the conversation has a run that is still going. */
    isOn: (id) => runOf(id)?.status === 'running',
    /**
     * @returns {boolean} whether the run is paused: the user stopped it, so the conversation's model is free to talk and work.
     * Review of stage E: also a run Mission marked paused itself (a restart, a problem the app stopped it with) while the
     * app's goal stays active but disarmed (the app's state after every restart or failed round): only Resume (or the
     * app's own resume of the goal, which arms it) carries it on, never a chat message.
     */
    paused: (agent) => {
      const goal = goalRef(agent);
      if (!goal || goal.view.phase !== 'active') return true;
      if (goal.view.activation !== 'disarmed') return false;
      const run = runOf(agent?.id);
      return run?.status === 'running' && Number(run.pausedAt) > 0;
    },
    /**
     * @returns {boolean} whether a conversation's Mission waits for the user with its goal paused by Mission itself (point
     * 17): the conductor guard stays on, mission_step answers with the waiting words, and the pause is not the user's.
     */
    waitingQuietly: (id) => {
      const run = runs.get(String(id ?? ''));
      return Boolean(run) && isLong(run) && run.status === 'running' && !run.pausedAt && ((Number(run.long?.waitingSince) > 0 && run.long?.quietGoal === true) || run.long?.down?.quiet === true);
    },
    /** The lead lane of a conversation (the oldest at work; stage A-C's "step under way"); the guard notes asides here. */
    stepOf: (id) => leadOf(id),
    /** @returns {number} lanes at work in a conversation now (the restart check, the turn's checkpoint). */
    busy: (id) => liveLanes(pools.get(String(id ?? ''))).length,
    /** @returns {number} helpers at work in a Mission with more than one helper at once (0 otherwise). */
    helpersAtWork: (id) => {
      const run = runs.get(String(id ?? ''));
      return run && helpersOf(run) > 1 ? liveLanes(pools.get(String(id ?? ''))).length : 0;
    },
    /** @returns {string} what the conversation's own model is told while a run is on; '' otherwise. */
    note: (id, viaProgram = false) => {
      const run = runOf(id);
      if (run?.status !== 'running') return '';
      // Stage E: paused (by you, a problem or a restart): the assistant talks, and looks things up if the settings say so.
      const agent = agentFor(id);
      if (agent && api.paused(agent) && !api.waitingQuietly(id)) {
        let choice = '';
        try {
          choice = assistantOf?.(id, run) ?? '';
        } catch {
          choice = '';
        }
        return ASSISTANT_NOTE[readAssistant(choice || (isLong(run) ? run.long?.assistant : '') || settings().long?.assistant)](String(run.goal ?? '').replace(/\s+/g, ' ').slice(0, 300));
      }
      // Review of stage E: while it works or waits, Talk and look things up lets the conductor read and search to answer you.
      let choice = '';
      try {
        choice = assistantOf?.(id, run) ?? '';
      } catch {
        choice = '';
      }
      const look = !viaProgram && readAssistant(choice || (isLong(run) ? run.long?.assistant : '') || settings().long?.assistant) === 'look';
      return look ? `${conductorNote(run, viaProgram)}\n${LOOK_WORKING_NOTE}` : conductorNote(run, viaProgram);
    },

    /**
     * Start a run in a conversation that has a mode on.
     * @param {object} agent - the conversation's agent.
     * @param {string} goal - what the user asked for.
     * @param {{mode: string, root: string}} entry - the conversation's mode and folder.
     * @returns {Promise<string>} what to tell the user.
     */
    async start(agent, goal, entry, options = {}) {
      const undoLine = (run) => (run.checkpoint > 0 ? `\nTo undo everything it changes: /mission back ${run.checkpoint}` : '\nNo checkpoints are kept of this folder, so what it changes cannot be undone with /mission back.');
      const goals = goalsOf();
      if (!goals) throw new Error('This version of the app has no goal service, so a run cannot be kept going.');
      if (runOf(agent.id)?.status === 'running') throw new Error('A Mission is already on in this thread. /mission stop pauses it, /mission end closes it with a report.');
      const before = goalRef(agent);
      if (before && before.view.phase !== 'complete') throw new Error('This thread already has a goal of its own. Clear it first with /goal clear, then start the mission.');
      const point = await pointsOf(entry.root).take('Mission start');
      const now = settings();
      const id = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
      // Stage D: helpers at once, worked out once: the chat's choice, never more than Calls at once for the workers'
      // model server, and one in a folder without checkpoints (a command's changes could not be checked afterwards).
      let long = options.long;
      const asked = Math.round(Number(long?.helpers));
      if (options.kind === 'long' && Number.isFinite(asked) && asked >= 1) {
        let size = Math.min(8, asked);
        let why = '';
        let server = 4;
        try {
          server = Math.max(1, Number(callsAtOnce(String(routeFor(agent, 'implement', entry.root)?.provider ?? ''))) || 4);
        } catch {
          server = 4;
        }
        if (!(Number(point.number) > 0)) {
          size = 1;
          why = asked > 1 ? 'no-checkpoints' : '';
        } else if (server < size) {
          size = server;
          why = 'server';
        }
        long = { ...long, helpers: size, helpersAsked: Math.min(8, asked), helpersWhy: why };
      }
      // Point 17: when it needs you and Wait for me, from the chat's choice, else Settings → Mission (fixed for the run).
      if (options.kind === 'long') {
        const defaults = now.long ?? {};
        const needs = readNeeds(long?.needs, readNeeds(defaults.needs));
        const given = Number(long?.waitFor);
        const hasGiven = long?.waitFor !== null && long?.waitFor !== undefined && long?.waitFor !== '' && Number.isFinite(given);
        const fallback = needs === 'wait' ? defaults.waitHold : defaults.waitAsk;
        const waitFor = needs === 'decide' ? 0 : hasGiven ? given : Number.isFinite(Number(fallback)) && fallback !== null && fallback !== undefined ? Number(fallback) : undefined;
        long = { ...long, needs, ...(waitFor !== undefined ? { waitFor } : {}) };
      }
      const run = newRun({ id, goal, mode: MODE_LABELS[entry.mode], root: entry.root, limits: now.limits, checkpoint: point.number, ...(options.kind === 'long' ? { kind: 'long', long } : {}) });
      // The work loop (plan steps S3 to S5): only when Ultra Code or the tab's switch put it on.
      if (options.loop && typeof options.loop === 'object') run.loop = { ...options.loop, opened: [] };
      save(run);
      runs.set(agent.id, run);
      if (!noCommands(run)) writeIndex(agent.id, { root: run.root, id: run.id });
      record(run, { kind: 'start', goal: run.goal, mode: run.mode, limits: run.limits });
      emit('started', agent.id, run, isLong(run) ? { needs: needsOf(run), waitFor: waitOf(run) } : {});
      goals.create(agent, { objective: `Mission run ${run.id}: ${run.goal}\n\nIn each round call the ${STEP_TOOL} tool once and tell the user what the step did. The run ends when ${STEP_TOOL} returns the final report.`, maxGoalRounds: GOAL_ROUNDS });
      const routes = ROLES.map((role) => [role, routeFor(agent, role, run.root)]);
      const names = [...new Set(routes.map(([, route]) => route?.model ?? 'the thread\'s model'))];
      // Said first, because it decides how much memory the run needs.
      const roles = helperPolicy(agent) === 'same'
        ? `one model for everything (${names[0]}). To use different models for the roles, switch the models chip in the chat box before starting.`
        : names.length === 1
          ? `one model for everything (${names[0]}): the roles are set to different models, but all of them come to this one.`
          : `${names.length} different models: ${routes.map(([role, route]) => `${ROLE_NAMES[role]} ${route?.model ?? 'the thread\'s model'}`).join(', ')}. They may be loaded at the same time.`;
      const loopSaid = run.loop ? `\n${loopLine(run).replace(/ Checks by the loop: .*$/, '')}` : '';
      const helpersSaid = !isLong(run) || !(Number(run.long.helpers) >= 1) ? ''
        : run.long.helpersWhy === 'no-checkpoints' ? ' One helper at a time: no checkpoints are kept of this folder, so helpers could not be kept from changing each other\'s files.'
          : run.long.helpersWhy === 'server' ? ` ${run.long.helpers} helper${run.long.helpers === 1 ? '' : 's'} at once: your model server takes ${run.long.helpers} request${run.long.helpers === 1 ? '' : 's'} at a time (Settings → Mission → Calls at once).`
            : run.long.helpers > 1 ? ` Up to ${run.long.helpers} helpers work at once.` : '';
      if (isLong(run)) return `Mission started (${shownAccess(run.mode)}), ${names.length === 1 ? 'one model' : `${names.length} models`}. It works by itself now, ${run.long.deadline > 0 ? `for at most ${run.long.minutes} minutes` : 'until its checklist is done (no time limit)'}${run.long.laps > 0 ? `, in at most ${run.long.laps} laps` : ''}.${helpersSaid}${needsStartText(run)} Pause or End it above the chat box, or type /mission stop.\nGoal: ${run.goal}\nModels: ${roles}${loopSaid}${undoLine(run)}`;
      return `Mission started (${shownAccess(run.mode)}), ${names.length === 1 ? 'one model' : `${names.length} models`}. It runs by itself now; /mission stop pauses it.\nGoal: ${run.goal}\nModels: ${roles}${loopSaid}\nLimits: ${run.limits.maxItems} items, ${run.limits.maxTries} tries per item, ${run.limits.maxReviews} review${run.limits.maxReviews === 1 ? '' : 's'}, ${run.limits.maxSteps} steps.${undoLine(run)}`;
    },

    /**
     * Do the run's next step, or wait for the one under way. A step runs on its own, apart from
     * the call that started it: a call only waits for it, for at most `waitMs`. That matters in
     * the app's PTC preset, where a program (and every tool call in it) is cut off after minutes
     * while a worker may need longer. The next call picks the step up where it is.
     * @param {object} agent - the conversation's agent.
     * @param {AbortSignal} signal - the calling tool's signal.
     * @param {number} [waitMs] - how long this call waits.
     * @returns {Promise<string>} what the step did, or that it is still under way.
     */
    async step(agent, signal, waitMs = WAIT_MS.direct) {
      const id = agent.id;
      idle.set(id, 0);
      const run = runOf(id);
      if (!run) return 'No mission run is on in this thread. The user starts one with /mission followed by the goal.';
      // An ended run whose final report the conductor was not given yet (several helpers): that report, once.
      if (run.status !== 'running') return (pools.has(id) ? takeTold(id, run) : '') || `The mission run has ended.\n\n${report(run)}\n\n${OVER}`;
      // Point 17: a Mission that waits for you with its goal paused by itself says so (before the paused check). Its goal
      // active again (someone resumed it outside Mission): it waits stage D's way, rounds going on.
      if (isLong(run) && Number(run.long.waitingSince) > 0 && run.long.quietGoal === true) {
        if (api.paused(agent)) return takeTold(id, run) || waitWords(run);
        delete run.long.quietGoal;
        try {
          save(run);
        } catch { /* kept in memory */ }
        record(run, { kind: 'waiting', quiet: false, why: 'goal resumed outside Mission' });
      }
      // Stage E: it waits for its model server. Its goal resumed outside Mission (after Mission's own quiet pause) counts
      // as a try; otherwise mission_step says it waits.
      if (isLong(run) && run.long.down && !run.pausedAt) {
        if (api.paused(agent) || run.long.down.quiet !== true) return takeTold(id, run) || downWords(run);
        startTry(id, run, Date.now(), () => agent);
      }
      // A paused run takes no step, also when its conversation's model keeps calling.
      if (api.paused(agent)) return `${PAUSED_TEXT}${run.stalled ? ` ${run.stalled}` : ''}\nTell the user this in one line, and do not call ${STEP_TOOL} again; do no work of your own for the run.`;
      // The goal was resumed outside Mission (the app's own Resume, /goal resume): the pause is over now, so the
      // wall clock watches the run again and the paused time is added to its deadline once, not again later.
      if (run.pausedAt) {
        const span = unpauseRun(run);
        run.stalled = '';
        run.stalledDetails = '';
        save(run);
        record(run, { kind: 'resumed', by: 'app', ...(span > 0 ? { pausedMinutes: Math.round(span / 60000) } : {}) });
        emit('resumed', id, run, { reopened: 0, by: 'app' });
      }
      const pool = poolOf(id);
      pool.agent = agent;
      return helpersOf(run) > 1 ? stepMany(agent, run, signal, waitMs) : stepOne(agent, run, signal, waitMs);
    },

    /**
     * A round of the conversation began. Rounds in which the step tool is never called do not move
     * the run: after a few in a row the run is paused, so it does not use up rounds for nothing.
     * @param {object} agent - the conversation's agent.
     * @returns {boolean} whether the run was paused just now.
     */
    round(agent) {
      const id = agent.id;
      const run = runOf(id);
      // A step that finished but was never collected does not count as one under way.
      // Not while a lane works, or while the Mission waits for the user's answers (stage D).
      if (!run || run.status !== 'running' || liveLanes(pools.get(id)).length > 0 || Number(run.long?.waitingSince) > 0 || run.long?.down) return false;
      const goal = goalRef(agent);
      if (!goal || goal.view.phase !== 'active') return false;
      const count = (idle.get(id) ?? -1) + 1;
      idle.set(id, count);
      if (count < IDLE_ROUNDS) return false;
      idle.set(id, 0);
      try {
        goalsOf().pause(agent, goal.ref);
      } catch (error) {
        warn(`could not pause a stalled run: ${String(error?.message ?? error)}`);
        return false;
      }
      run.stalled = `Paused: the thread's model did not call ${STEP_TOOL} for ${IDLE_ROUNDS} rounds in a row, so the run could not move. Press Resume to try again; another model for the thread may do better.`;
      pauseRun(run);
      run.pausedBy = 'problem';
      save(run);
      record(run, { kind: 'stalled', rounds: IDLE_ROUNDS });
      emit('stalled', id, run);
      return true;
    },

    /**
     * Pause a run that may not go on here now (the conversation is isolated, or its tier has
     * sub-agents off), so it does not use up rounds. The reason is kept and shown by /mission.
     * @param {object} agent - the conversation's agent.
     * @param {string} reason - why, for the user.
     * @returns {boolean} whether a running run was paused. False also when the app's goal could
     *   not be paused: then nothing is changed or reported, since the rounds would go on.
     */
    hold(agent, reason, { details = '', keep = false } = {}) {
      const run = runOf(agent.id);
      if (!run || run.status !== 'running') return false;
      // Already paused with its reason (the Budget guard said why before the app's goal was blocked): kept.
      if (keep && run.pausedAt && run.stalled) {
        if (details && !run.stalledDetails) {
          run.stalledDetails = String(details).slice(0, 600);
          save(run);
        }
        return false;
      }
      const goal = goalRef(agent);
      if (goal && goal.view.phase === 'active') {
        try {
          goalsOf().pause(agent, goal.ref);
        } catch (error) {
          warn(`could not pause the run: ${String(error?.message ?? error)}`);
          return false;
        }
      }
      // As with /mission stop: the steps under way stop, and are taken again on resume.
      stopLanes(agent.id);
      const said = String(reason ?? '').trim();
      run.stalled = /^paused\b/i.test(said) ? said : `Paused: ${said}`;
      run.stalledDetails = details ? String(details).slice(0, 600) : '';
      pauseRun(run);
      run.pausedBy = 'problem';
      if (isLong(run)) delete run.long.waitOver;
      save(run);
      record(run, { kind: 'held', reason, ...(details ? { details: String(details).slice(0, 600) } : {}) });
      emit('paused', agent.id, run, { reason });
      // The run paused itself (step errors, failing helpers, Budget guard, a blocked goal): the alerts that are
      // on for "stops by itself" are sent, as the pre-flight promises ("told when it ... stops").
      emit('stopped-by-itself', agent.id, run, { why: 'problem', reason });
      return true;
    },
    /** Add tokens a model reply of this run used (the conversation and its helpers); kept with the run's next save. */
    addTokens(id, count) {
      const run = runs.get(id);
      if (!run || run.status !== 'running' || !(count > 0)) return;
      run.tokens = (run.tokens ?? 0) + Math.round(count);
    },
    /**
     * A run as plain data, for the run card and the status route (step 46): checklist with marks, the step
     * under way, time and tokens used, laps. No goal text from the app, no file contents.
     */
    view(id, now = Date.now()) {
      const run = runOf(id);
      if (!run) return undefined;
      const pool = pools.get(id);
      const lanes = liveLanes(pool);
      const under = lanes[0];
      const counts = tally(run);
      // About how many steps in all: the ones taken, the open (and parked) items, the overall commands and a review (0 before the plan).
      const about = run.items.length === 0 ? 0 : run.steps + counts.open + (counts.parked ?? 0) + (run.checks.length > 0 ? 1 : 0) + 1;
      const titleFor = (itemId) => String(run.items.find((item) => item.id === String(itemId))?.title ?? '');
      const busy = new Set(lanes.filter((lane) => lane.item && STEP_KINDS.has(lane.kind)).map((lane) => lane.item));
      const since = isLong(run) && run.status === 'running' ? Number(run.long.waitingSince) || 0 : 0;
      // Point 17: why each item not done yet is not done (after the end), and what was decided without the user.
      const whyOf = run.status !== 'running' ? new Map(undoneItems(run).map((entry) => [entry.id, entry.why])) : new Map();
      const triedOf = (item) => (item.attempts ?? 0) > 0 || (item.tries ?? 0) > 0;
      return {
        id: run.id, kind: isLong(run) ? 'long' : 'mission', status: run.status, goal: run.goal.slice(0, 600), mode: run.mode,
        pausedBy: run.pausedBy ?? '', phase: run.phase ?? '', stepsAbout: about > 0 ? Math.min(about, run.limits?.maxSteps ?? about) : 0,
        workingItem: under ? under.item ?? '' : '', workingKind: under ? under.kind ?? '' : '', hasAside: counts.aside > 0,
        items: run.items.map((item) => ({ id: item.id, title: item.title, status: item.status, check: item.check, note: String(item.note ?? '').slice(0, 300), working: busy.has(item.id), ...(item.parkedOn ? { parkedOn: [...item.parkedOn] } : {}), ...(item.waitFile ? { waitFile: item.waitFile } : {}), ...(item.recheck ? { recheck: true } : {}), ...(item.parks ? { parks: item.parks } : {}), ...(Array.isArray(item.asideOn) && item.asideOn.length > 0 ? { asideOn: [...item.asideOn] } : {}), tried: triedOf(item), ...(whyOf.has(item.id) ? { why: whyOf.get(item.id) } : {}) })),
        checks: run.checkResults.map((result) => ({ command: result.command, ok: result.ok })),
        steps: run.steps, working: under ? under.what : '', stalled: run.stalled ?? '', stalledDetails: run.stalledDetails ?? '', pausedAt: run.pausedAt ?? 0,
        // Stage D: the helper pool. `working` stays stage C's words for the lead lane; every lane is in `workingLanes`.
        helpers: helpersOf(run), helpersAsked: isLong(run) ? Number(run.long.helpersAsked) || helpersOf(run) : 1, helpersWhy: isLong(run) ? String(run.long.helpersWhy ?? '') : '',
        workingLanes: lanes.map((lane) => ({ lane: lane.id, kind: lane.kind, item: lane.item, title: lane.item ? titleFor(lane.item) : '', since: lane.startedAt, role: { plan: 'plan', questions: 'questions', work: 'implement', recheck: 'check', checks: 'check', review: 'review', hunt: 'review', finish: '', repair: 'repair' }[lane.kind] ?? '' })),
        parked: run.items.filter((item) => item.status === 'parked').map((item) => ({ item: item.id, title: item.title, on: [...(item.parkedOn ?? [])], since: Number(item.parkedAt) || 0 })),
        waitingFile: run.items.filter((item) => item.status === 'open' && item.waitFile).map((item) => ({ item: item.id, title: item.title, file: item.waitFile, heldBy: claims?.holder(id, join(real(run.root), item.waitFile))?.item ?? '' })),
        // A setting change is said from its fix (whole values, no cut), the same words Allow checks it against.
        approvals: shownApprovals(run).map((entry) => ({ id: entry.id, kind: entry.kind, what: entry.fix?.kind === 'setting' ? changeWords(entry.fix) : entry.what, items: [...(entry.items ?? [])], askedBy: (entry.items ?? []).map((itemId) => ({ id: String(itemId), title: titleFor(itemId) })), by: entry.by ?? '', choices: (entry.choices ?? []).map((choice) => ({ ...choice })), status: entry.status, after: entry.after ?? 'park', askedAt: entry.askedAt ?? 0, ...(entry.tool ? { tool: entry.tool } : {}), ...(entry.plain ? { plain: entry.plain } : {}), ...(entry.reason ? { reason: entry.reason } : {}), ...(entry.warnings ? { warnings: { ...entry.warnings } } : {}), addon: String(entry.addon ?? ''), addonName: String(entry.addonName ?? ''), act: entry.act === true, fix: ['budget', 'calls', 'model', 'setting'].includes(entry.fix?.kind) ? entry.fix.kind : '' })),
        waitingForYou: since > 0 ? { since, until: waitUntilOf(run, since), quiet: run.long.quietGoal === true } : null,
        // Point 17: when it needs you, Wait for me, the time it waited, how it ended, and what it decided itself.
        needs: needsOf(run), waitFor: isLong(run) ? waitOf(run) : 0, waitedMs: waitedOf(run), endKind: String(run.longEndKind ?? ''),
        decided: isLong(run) ? decidedQuestions(run).map((question) => ({ id: String(question.id), text: question.text, assume: question.assume ?? '', chosen: question.chosen ?? '', items: (question.items ?? []).map(String), from: questionFrom(question), self: question.self === true, askedBy: (question.items ?? []).map((itemId) => ({ id: String(itemId), title: titleFor(itemId) })) })) : [],
        // A question's parks: the items that wait for it now (an item that stopped waiting is not named any more).
        questions: (run.questions ?? []).filter((question) => question.status === 'open').map((question) => ({ ...question, from: questionFrom(question), ...(Array.isArray(question.parks) ? { parks: question.parks.filter((itemId) => run.items.some((item) => item.id === String(itemId) && item.status === 'parked' && (item.parkedOn ?? []).includes(question.id))) } : {}) })),
        // Stage C: the answers that came too late (still to redo), whether it can be continued by answering, and
        // when the card was asked to show again (/mission resume on an ended run with questions).
        lateAnswers: lateAnswers(run),
        canContinue: continueBlock(run) === '' && api.has(run),
        // Lab check of point 19: the repair helper's changes that wait for your OK after the end.
        oks: pendingOks(run).map((entry) => entry.id),
        firstMinutes: isLong(run) ? Number(run.long.firstMinutes ?? run.long.minutes) || 0 : 0,
        continues: continuesOf(run),
        showFrom: Number(run.showFrom) || 0,
        startedAt: run.startedAt, endedAt: run.endedAt, minutesUsed: Math.round(((run.endedAt || now) - run.startedAt - afterEndOf(run) - waitedOf(run)) / 60000), tokens: run.tokens ?? 0,
        ...(isLong(run) ? { lap: run.long.lap, laps: run.long.laps, minutes: run.long.minutes, deadline: run.long.deadline, fullTime: run.long.fullTime, finishLap: run.long.finishLap, undone: run.long.undone.length, stepLimit: Number(run.long.steps) || 0, lapEnded: run.long.lapEnded === true, hunting: run.long.hunting === true } : {}),
        report: run.status === 'running' ? '' : report(run),
        reportFile: run.status === 'running' ? '' : join(dirOf(run), 'report.md'),
        // Stage E: the assistant while it is paused, carry on after a restart (null: a Mission from before), the wait for
        // the model server, the repair helper and its repairs, and a fallback model allowed for its helpers.
        ...stageView(run, id),
      };
    },
    /** Stage E's part of a run's view (also for tests). */
    stageView: (id) => {
      const run = runOf(id);
      return run ? stageView(run, id) : undefined;
    },
    /** @returns {boolean} whether this conversation's helpers think by role now (a Long run with effort by role is running). */
    effortByRole(id) {
      const run = runs.get(id);
      return run?.kind === 'long' && run.status === 'running' && run.long?.effort === true;
    },
    /** Conversations whose run was running when the app last closed (read from the record of runs). */
    interrupted() {
      const table = readIndex();
      const out = [];
      for (const [id, where] of Object.entries(table)) {
        try {
          const run = runs.get(id) ?? loaded(JSON.parse(readFileSync(join(where.root, OWN_FOLDER, 'runs', where.id, 'run.json'), 'utf8')));
          if (run?.status === 'running') out.push({ conversation: id, run });
        } catch { /* a run whose folder is gone */ }
      }
      return out;
    },
    /**
     * Tidy the record of runs at start-up (active-runs.json; writeIndex keeps at most 200 entries):
     *   - a run that has ended: its entry stays, so its card, /mission report and /mission resume (items that
     *     waited for the user) still find it after a restart;
     *   - a run whose folder is surely gone (no such file, while the folder above the project is there and the
     *     conversation is not in the Cowork trash): its entry goes, with one runs.jsonl line. Any other read
     *     error (a disk not mounted yet, a folder still syncing, no permission, a half-written file) is unsure:
     *     the entry stays and the run is skipped this time;
     *   - a run still "running" whose conversation no longer exists: ended with "Its conversation is gone", its
     *     report written into its folder (and the copy in Mission's own folder), a runs.jsonl line added. No
     *     "stopped by itself" alert is raised for it;
     *   - a run whose conversation is there: kept, and returned (it is told once, as before).
     * @param {(conversation: string) => boolean} exists - whether a conversation still exists (unsure: true; one
     *   in the Cowork trash, which can be put back, counts as existing).
     * @param {(conversation: string) => boolean} [inTrash] - whether the conversation is in the Cowork trash (its
     *   Scratch folder may have moved there with it).
     * @returns {{kept: {conversation: string, run: object}[], closed: string[], dropped: string[]}} what was done.
     */
    reconcile(exists = () => true, inTrash = () => false) {
      const kept = [];
      const closed = [];
      const dropped = [];
      const table = readIndex();
      /**
       * Whether a run whose run.json is not there is surely gone, not just out of reach for now: its own folder
       * is missing, the folder above its project is there (on an external disk: the disk is mounted), and the
       * conversation is not in the Cowork trash (Put back brings a Scratch folder back).
       */
      const surelyGone = (where, id) => {
        try {
          const root = String(where?.root ?? '');
          if (!root.startsWith('/')) return false;
          const volume = /^\/Volumes\/[^/]+/.exec(root)?.[0];
          if (volume && !existsSync(volume)) return false;
          if (!existsSync(dirname(root))) return false;
          const runDir = join(root, OWN_FOLDER, 'runs', String(where.id ?? ''));
          if (existsSync(runDir)) return false;
          if (inTrash(id) !== false) return false;
          return true;
        } catch {
          return false;
        }
      };
      /** Whether runs.jsonl has this end of a run already (a continued run has a line per end, stage C). */
      const hasLine = (text, runId, continues) => text.split('\n').some((row) => {
        if (!row.includes(`"id":"${runId}"`)) return false;
        try {
          return (Number(JSON.parse(row).continues) || 0) === continues;
        } catch {
          return false;
        }
      });
      let lines = '';
      try {
        lines = finishedFile && existsSync(finishedFile) ? readFileSync(finishedFile, 'utf8') : '';
      } catch {
        lines = '';
      }
      for (const [id, where] of Object.entries(table)) {
        let run;
        let gone = false;
        try {
          run = runs.get(id) ?? loaded(JSON.parse(readFileSync(join(where.root, OWN_FOLDER, 'runs', where.id, 'run.json'), 'utf8')));
        } catch (error) {
          run = undefined;
          gone = error?.code === 'ENOENT' && surelyGone(where, id);
        }
        // Unreadable for another reason, or a record that names another run: unsure, kept and skipped.
        if (!gone && (!run || run.id !== where.id)) continue;
        if (gone) {
          // Its folder is gone (a deleted Scratch conversation): the entry goes; the record says so once.
          if (finishedFile && where?.id && !lines.includes(`"id":"${where.id}"`)) {
            try {
              mkdirSync(dirname(finishedFile), { recursive: true });
              appendFileSync(finishedFile, `${JSON.stringify({ at: new Date().toISOString(), id: where.id, conversation: id, folder: where.root, status: 'stopped', reason: 'Its folder is gone.' })}\n`);
            } catch { /* the entry still goes */ }
          }
          writeIndex(id, null);
          dropped.push(id);
          continue;
        }
        // Ended: the entry stays (its report, card and /mission resume of items that wait for the user).
        if (run.status !== 'running') continue;
        let there = true;
        try {
          there = exists(id) !== false;
        } catch {
          there = true;
        }
        if (there) {
          runs.set(id, run);
          kept.push({ conversation: id, run });
          continue;
        }
        // Its conversation was deleted: the run is closed with its report, quietly. Owner point 19: it counts only the time
        // it worked, up to its last logged step or event; the time it then sat unused until now is said, not counted.
        const closedAt = Date.now();
        const loggedAt = Math.min(closedAt, Math.max(Number(run.startedAt) || 0, lastLoggedAt(run)));
        // A paused run worked only up to its pause: a line logged after it (a restart, say) is not working time, and the
        // paused span is not added to it either.
        const pausedAt = Number(run.pausedAt) || 0;
        const lastAt = pausedAt > 0 ? Math.max(Number(run.startedAt) || 0, Math.min(loggedAt, pausedAt)) : loggedAt;
        // A wait for you or for the model server still open ends there too, as at an ordinary end (its time never counts).
        if (isLong(run)) {
          if (Number(run.long.waitingSince) > 0) closeWait(run, Math.max(Number(run.long.waitingSince), lastAt));
          if (run.long.down) closeDown(run, Math.max(Number(run.long.down.since) || 0, lastAt));
          delete run.long.probing;
        }
        run.pausedBy = '';
        finish(run, CONVERSATION_GONE, lastAt);
        run.closedAt = closedAt;
        run.pausedAt = 0;
        run.goalClosePending = false;
        const text = report(run);
        try {
          if (existsSync(dirOf(run))) {
            save(run);
            writeFileSync(join(dirOf(run), 'report.md'), `${text}\n`);
            record(run, { kind: 'finish', status: run.status, reason: 'conversation gone', tally: tally(run) });
          }
        } catch (error) {
          warn(`could not write the report of a run whose conversation is gone: ${String(error?.message ?? error)}`);
        }
        try {
          if (finishedFile && !hasLine(lines, run.id, continuesOf(run))) {
            mkdirSync(dirname(finishedFile), { recursive: true });
            appendFileSync(finishedFile, finishedLine(id, run));
          }
        } catch { /* the report is in the folder */ }
        mirror(run, id);
        runs.delete(id);
        writeIndex(id, null);
        closed.push(id);
      }
      return { kept, closed, dropped };
    },
    /**
     * The clock between steps is not enough: a run that stops moving never reaches its next step. This looks at
     * every running Long run (called every half minute):
     *   - a step still under way past the deadline plus the grace is stopped; the item keeps its try and the
     *     run ends with its report ("cut short by the time limit");
     *   - a run with no step under way whose deadline plus grace has passed is ended with "its time was up"
     *     and its report (keep-awake is let go with it). A paused run is never ended here: its time is not counted.
     * @param {number} [now] - now.
     * @param {(id: string) => object | undefined} [agentOf] - the conversation's agent, when it is open.
     * @returns {string[]} the conversations whose run was ended or cut.
     */
    sweep(now = Date.now(), agentOf = () => undefined) {
      const out = [];
      for (const [id, run] of runs) {
        // Wait for me ran out before a restart, and its report round never came: it ends now with that report (also when
        // the restart paused it).
        if (isLong(run) && run.status === 'running' && overLoaded.has(run) && run.long.waitOver === true && liveLanes(pools.get(id)).length === 0) {
          overLoaded.delete(run);
          let agent;
          try {
            agent = agentOf?.(id) ?? pools.get(id)?.agent;
          } catch {
            agent = undefined;
          }
          endWaited(id, run, agent, now);
          out.push(id);
          continue;
        }
        if (!isLong(run) || run.status !== 'running' || run.pausedAt) continue;
        // Stage E: it waits for its model server: tried again on time, ended 2 hours after the first failure. Its clock
        // stands still, so the deadline below is never read meanwhile.
        if (run.long.down) {
          const ended = run.status;
          downSweep(id, run, now, agentOf);
          if (run.status !== ended) out.push(id);
          continue;
        }
        const pool = pools.get(id);
        // Stage D, point 17: a Mission that waited for the user's answers as long as Wait for me says ends with its report
        // (also one with no time limit); Finish it takes it up again. Until I answer: never. Not while paused.
        const since = Number(run.long.waitingSince) || 0;
        const waitMs = waitMsOf(run);
        if (since > 0 && Number.isFinite(waitMs) && waitMs > 0 && now - since >= waitMs && liveLanes(pool).length === 0) {
          let agent;
          try {
            agent = agentOf?.(id) ?? pool?.agent;
          } catch {
            agent = pool?.agent;
          }
          const quiet = run.long.quietGoal === true;
          // Paused by someone else meanwhile (not Mission's own quiet pause): left alone, as a paused run is.
          if (!quiet && agent && api.paused(agent) && goalRef(agent)) continue;
          const minutes = waitOf(run);
          if (quiet && agent) {
            // The conversation is open: the goal gets one more round, which gives the report in the chat.
            closeWait(run, now);
            run.long.waitOver = true;
            record(run, { kind: 'waited', minutes, over: true });
            try {
              save(run);
            } catch { /* kept in memory */ }
            if (rearmGoal(agent, run)) {
              changed(id);
              wake(id);
              out.push(id);
              continue;
            }
          }
          endWaited(id, run, agent, now);
          out.push(id);
          continue;
        }
        // Point 17: a Mission that waits for the user is never ended or cut by its time limit (its clock stands still).
        if (since > 0) continue;
        // A Mission with no time limit (deadline 0) is never ended by the clock.
        if (!(run.long.deadline > 0)) continue;
        const late = now - (run.long.deadline + graceMs(run));
        if (late <= 0) continue;
        const working = liveLanes(pool);
        if (working.length > 0) {
          const fresh = working.filter((lane) => !lane.cutByTime);
          for (const lane of fresh) {
            lane.cutByTime = true;
            lane.cutAt = now;
            lane.stopper.abort(new Error('The run\'s time was up.'));
          }
          if (fresh.length > 0) out.push(id);
          // Cut lanes that never settle do not keep the run from ending: CUT_WAIT_MS later it ends anyway.
          if (fresh.length > 0 || working.some((lane) => now - (lane.cutAt ?? now) < cutWaitMs)) continue;
        }
        // A step that finished with nobody waiting for it (a PTC "still working" reply, or a cut call) is no
        // step under way: it is let go, and the run that stopped moving is ended.
        if (pool) {
          for (const lane of [...pool.lanes.values()]) if (lane.done) pool.lanes.delete(lane.id);
          if (working.length > 0) stopLanes(id, 'The run\'s time was up.');
        }
        let agent;
        try {
          agent = agentOf(id);
        } catch {
          agent = undefined;
        }
        // Not while the app is paused by the user or a problem (the goal then is not active).
        if (agent && api.paused(agent) && goalRef(agent)) continue;
        run.longEnd = longEndText(run, 'time');
        const text = end(id, run, agent);
        if (helpersOf(run) > 1) {
          poolOf(id).told.push(`The run's time was up. This is the final report; give it to the user in full:\n\n${text}\n\n${OVER}`);
          wake(id);
        }
        out.push(id);
      }
      return out;
    },
    /** A conversation opened whose run ended while it was not open: its goal is closed now. @returns {boolean} whether it was. */
    closeGoal(agent) {
      const run = runOf(agent?.id);
      if (!run || run.status === 'running' || !run.goalClosePending) return false;
      try {
        const goal = goalRef(agent);
        if (goal && goal.view.phase !== 'complete') goalsOf().complete(agent, goal.ref);
        run.goalClosePending = false;
        save(run);
        return true;
      } catch (error) {
        warn(`could not close the goal of an ended run: ${String(error?.message ?? error)}`);
        return false;
      }
    },
    /**
     * Whether a session is a helper of a run, and which (for other add-ons, such as the Tool ledger).
     * @param {string} sessionId - the session.
     * @returns {{runId: string, role: string, item: string} | undefined}
     */
    helperOf(sessionId) {
      try {
        const own = roles.get(String(sessionId ?? ''));
        return own ? { runId: own.runId, role: own.role, item: own.item, lane: own.lane ?? '' } : undefined;
      } catch {
        return undefined;
      }
    },
    /**
     * The run a conversation conducts (its own model drives it), while it has not ended.
     * @param {string} sessionId - the conversation.
     * @returns {{runId: string, kind: 'long' | 'mission'} | undefined}
     */
    conducting(sessionId) {
      try {
        const run = runs.get(String(sessionId ?? ''));
        return run && run.status === 'running' ? { runId: String(run.id ?? ''), kind: isLong(run) ? 'long' : 'mission' } : undefined;
      } catch {
        return undefined;
      }
    },
    /** The watchdog tried a run again (its goal re-armed): written in the run's log. */
    retried(id, tries) {
      const run = runOf(id);
      if (!run || run.status !== 'running') return;
      run.stalled = '';
      // The time it waited does not count.
      unpauseRun(run);
      save(run);
      record(run, { kind: 'retried', tries });
      emit('retried', id, run, { tries });
    },
    /**
     * Tell listeners of a run found interrupted at start (once per app start). Nothing runs it now, so it is
     * marked as waiting (keep-awake lets go), and the time the app was closed does not count.
     */
    announceInterrupted(conversation, run) {
      const live = runs.get(conversation) ?? run;
      // Point 17: a Mission that waits quietly for the user (its goal paused by Mission) goes on waiting: no restart
      // pause, no alert. Wait for me's end is the sweep's to see.
      if (live?.status === 'running' && isLong(live) && ((Number(live.long?.waitingSince) > 0 && live.long?.quietGoal === true) || live.long?.waitOver === true)) {
        if (!runs.has(conversation)) runs.set(conversation, live);
        return;
      }
      // Stage E: paused before the app closed (by you, a problem, a restart): it stays exactly as it was, with no alert.
      if (live?.status === 'running' && Number(live.pausedAt) > 0) {
        if (!runs.has(conversation)) runs.set(conversation, live);
        return;
      }
      if (live?.status === 'running') {
        if (!runs.has(conversation)) runs.set(conversation, live);
        live.stalled = restartText(live);
        // From the last step it took: the app was closed since then (a wait for the model server ends there too).
        pauseRun(live, restartPauseFrom(live) || Date.now());
        live.pausedBy = 'restart';
        try {
          save(live);
        } catch { /* told anyway */ }
      }
      emit('stopped-by-itself', conversation, live, { why: 'restart' });
    },
    /** @param {(event: object) => unknown} listener - told of run events. @returns {() => void} stop listening. */
    onEvent(listener) {
      if (typeof listener !== 'function') throw new Error('Give a function.');
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /**
     * The app stopped giving a running run rounds by itself (its goal is still active but disarmed: a
     * failed request, a reply cut at its length limit, or a restart). Written in the run and told.
     * @param {object} agent - the conversation's agent.
     * @param {'error'|'restart'} why - live failure, or the app (re)started.
     * @returns {object | undefined} the run, when it is one that is on.
     */
    selfStopped(agent, why) {
      const run = runOf(agent.id);
      if (!run || run.status !== 'running') return undefined;
      run.stalled = why === 'restart'
        ? restartText(run)
        : 'Stopped by itself: the app stopped giving this run rounds (a model request failed after the app\'s own retries, or a reply hit its length limit).';
      run.selfStops = (run.selfStops ?? 0) + 1;
      pauseRun(run);
      run.pausedBy = why === 'restart' ? 'restart' : 'problem';
      save(run);
      record(run, { kind: 'stopped-by-itself', why });
      emit('stopped-by-itself', agent.id, run, { why });
      return run;
    },
    /**
     * A note for a Mission that is on (Add note, or a chat message while one runs): its helpers read it from their
     * next step on. Any kind of run, paused or not.
     * @param {string} id - the conversation.
     * @param {string} text - the note.
     * @param {'ask' | 'note'} [by] - how it came: a chat message ('ask') or Add note ('note'); for the log.
     * @returns {boolean} whether a running run kept it.
     */
    ask(id, text, by = 'ask') {
      const run = runOf(id);
      if (!run || !addAsk(run, text)) return false;
      record(run, { kind: by === 'note' ? 'note' : 'ask', text: String(text).slice(0, 1000) });
      save(run);
      return true;
    },
    /**
     * Your answers to the run's open questions (Answer and continue, or text with Resume). Items finished on a
     * question's default are done again with your answer.
     * @returns {{answered: string[], reopened: string[], late: string[]}}
     */
    answer(id, text) {
      const run = runOf(id);
      if (!run || run.status !== 'running') return { answered: [], reopened: [], late: [] };
      // The steps under way decide whether a reopened item can still be done (not during the last lap's review).
      const gateBefore = endGate(run);
      const out = answerQuestions(run, text, Date.now(), { under: underOf(id, run) });
      if (out.answered.length === 0) return out;
      afterAnswer(id, run, out.goesOn ?? [], { gateBefore });
      record(run, { kind: 'answer', answered: out.answered, reopened: out.reopened, ...(out.late.length > 0 ? { late: out.late } : {}), text: String(text).slice(0, 1000) });
      save(run);
      mirror(run, id);
      return out;
    },
    /** Let the lap under way end, then report (Finish this lap). Says why when it can do nothing. @returns {string} what to tell the user. */
    finishLap(agent, now = Date.now()) {
      const run = runOf(agent.id);
      if (!run || run.status !== 'running') return 'No Mission with laps is on.';
      if (!isLong(run)) return 'This Mission has no laps to finish.';
      // Stage E: while it waits for its model server nothing can move: it ends now with its report.
      if (run.long.down && !run.pausedAt) {
        closeDown(run, now);
        run.long.finishLap = true;
        run.longEnd = longEndText(run, 'asked');
        record(run, { kind: 'finish-lap', down: true });
        const text = end(agent.id, run, agent);
        poolOf(agent.id).told.push(`You asked it to finish while it waited for your model server. This is the final report; give it to the user in full:\n\n${text}\n\n${OVER}`);
        wake(agent.id);
        return 'The Mission stops waiting for your model server and writes its report now. Finish it takes it up again later.';
      }
      // Point 17 (review): while it waits for you nothing else can move, so the lap is over: it ends now with its report
      // (also at its lap limit, where it would otherwise wait on). A quiet wait gets one round back to give the report.
      if (Number(run.long.waitingSince) > 0 && !run.pausedAt) {
        const quiet = run.long.quietGoal === true;
        run.long.finishLap = true;
        run.long.lapEnded = true;
        delete run.long.waitOver;
        save(run);
        record(run, { kind: 'finish-lap', waiting: true });
        stopWaiting(agent.id, run, 'answer');
        wake(agent.id);
        pumpAfterWait(agent.id, run, quiet);
        return 'The Mission stops waiting and writes its report now. Finish it takes it up again later.';
      }
      // After the deadline the clock ends it anyway; on the last lap the lap limit does: no flag (the lab bug). A pause
      // or a wait stops the clock, so the deadline is read on the Mission's own clock.
      if (run.long.deadline > 0 && clockAt(run, now) >= run.long.deadline) return 'Its time is up already: it ends after the step under way and writes its report.';
      if (run.long.laps > 0 && run.long.lap + 1 >= run.long.laps) return 'This is its last lap already: it ends after this lap anyway.';
      run.long.finishLap = true;
      save(run);
      record(run, { kind: 'finish-lap' });
      return `The Mission finishes the lap under way (lap ${run.long.lap + 1}), then writes its report.`;
    },
    /** End the step under way, and its helpers, without pausing the run. */
    cut(id) {
      stopLanes(id);
    },
    /** Pause the run: no further rounds start. */
    stop(agent) {
      const run = runOf(agent.id);
      if (!run || run.status !== 'running') return 'No mission run is on.';
      const goal = goalRef(agent);
      if (goal && goal.view.phase === 'active') goalsOf().pause(agent, goal.ref);
      // The steps under way stop with the run; they are taken again on resume.
      const stopped = stopLanes(agent.id);
      pauseRun(run);
      run.pausedBy = 'you';
      // A wait that just ran out is not ended as "no answer came" on Resume: you are here (review of point 17).
      if (isLong(run)) delete run.long.waitOver;
      save(run);
      record(run, { kind: 'paused', ...(stopped > 0 && helpersOf(run) > 1 ? { helpers: stopped } : {}) });
      emit('paused', agent.id, run, { reason: 'you' });
      if (stopped > 0 && helpersOf(run) > 1) return `Mission paused after step ${run.steps}. ${stopped} helper${stopped === 1 ? ' was' : 's were'} stopped; their items go on from where they left off when you resume. Press Resume beside the chat box to carry on, or End above it to close it with a report.\n\n${checklist(run)}`;
      return `Mission paused after step ${run.steps}. Press Resume beside the chat box to carry on, or End above it to close it with a report.\n\n${checklist(run)}`;
    },
    /**
     * The run's goal was paused outside Mission (the app's Stop, /goal pause, the model's update_goal): the run counts
     * as paused from then on, so its clock stops (Resume moves the deadline on) and the wall clock leaves it alone.
     * @param {object} agent - the conversation.
     * @param {number} [at] - when it was paused.
     * @returns {boolean} whether the run was marked paused now (false: no run on, or Mission had paused it already).
     */
    pausedOutside(agent, at = Date.now()) {
      const run = runOf(agent?.id);
      if (!run || run.status !== 'running' || run.pausedAt) return false;
      // Point 17: Mission paused the goal itself to wait for the user: not a pause of the user's.
      if (api.waitingQuietly(agent.id)) return false;
      // The steps under way stop with the goal; they are taken again on resume.
      stopLanes(agent.id);
      pauseRun(run, at);
      run.pausedBy = 'app';
      if (isLong(run)) delete run.long.waitOver;
      save(run);
      record(run, { kind: 'paused', by: 'app' });
      emit('paused', agent.id, run, { reason: 'app' });
      return true;
    },
    /** Let a paused run carry on. Stage E: `by` 'restart' when Carry on by itself after a restart does it. */
    resume(agent, { by = '' } = {}) {
      const run = runOf(agent.id);
      if (!run) return 'No mission run is waiting to carry on.';
      // Stage E: it waits for its model server (not paused): Resume tries the server at once.
      if (run.status === 'running' && isLong(run) && run.long.down && !run.pausedAt) {
        api.tryNow(agent.id);
        return TRY_NOW_TEXT;
      }
      // A Long run that ended in a Read Only tab gave the tab back its level: it is not taken up again (review finding 6).
      // An ended Mission is never brought back by Resume (review of stage C): End stays final unless it still has
      // questions for you, and a continue goes through the questions card or /mission resume <minutes>, which ask how
      // much more time to give, leave out the time after the end, take a checkpoint and tell Budget guard (continued).
      if (run.status !== 'running' && isLong(run)) {
        // Point 17: Finish it brings back what is left (the card shows again).
        if (continueBlock(run) === '' && api.has(run)) {
          api.showAgain(agent.id);
          return `${FINISH_SHOW_TEXT}\n\n${report(run)}`;
        }
        if (run.long?.restore) return `That Mission has ended, and this thread is Read Only again. Start a new one with Start Mission.\n\n${report(run)}`;
        const waiting = asideWaiting(run);
        if (waiting > 0) {
          let minutes = 0;
          try {
            minutes = extraTime(run, []).minutes;
          } catch {
            minutes = 0;
          }
          return `That Mission has ended. ${waiting} item${waiting === 1 ? ' waits' : 's wait'} for your yes. To take ${waiting === 1 ? 'it' : 'them'} up again, give it more time: type /mission resume ${minutes || 10}${minutes ? ' (the suggested time)' : ''}, another number of minutes from 10 to 720, or /mission resume 0 for no time limit.`;
        }
        return `That Mission has ended, so it cannot carry on${run.stopReason === ENDED_BY_YOU ? ' (it was ended with End)' : ''}. Start Mission starts a new one.\n\n${report(run)}`;
      }
      // Point 17: a Mission that waits for your answers is not paused: Resume changes nothing (it goes on when you answer).
      if (run.status === 'running' && isLong(run) && Number(run.long.waitingSince) > 0 && !run.pausedAt) return WAIT_RESUME_TEXT;
      // An ended run with items that waited for the user is taken up again: the user is here now.
      const again = run.status !== 'running' ? reopen(run) : 0;
      if (run.status !== 'running') return `That run has ended and nothing in it waits for you.\n\n${report(run)}`;
      if (again > 0) save(run);
      const goals = goalsOf();
      const goal = goalRef(agent);
      if (!goals) throw new Error('This version of the app has no goal service.');
      if (!goal || goal.view.phase === 'complete') goals.create(agent, { objective: `Mission run ${run.id}: ${run.goal}\n\nIn each round call the ${STEP_TOOL} tool once and tell the user what the step did.`, maxGoalRounds: GOAL_ROUNDS });
      else {
        const objective = `Mission run ${run.id}: ${run.goal}\n\nIn each round call the ${STEP_TOOL} tool once and tell the user what the step did.`;
        try {
          goals.resume(agent, goal.ref);
        } catch {
          // A goal that used up its rounds, or was blocked for good, cannot be resumed: the run gets a new one.
          goals.clear(agent, goalRef(agent).ref);
          goals.create(agent, { objective, maxGoalRounds: GOAL_ROUNDS });
        }
      }
      run.stalled = '';
      run.stalledDetails = '';
      run.errors = 0;
      // Stage E: your Resume starts a fresh count of the 2 hours a Mission waits for its model server; it is carried on.
      if (isLong(run)) {
        if (by !== 'restart') {
          delete run.long.downFirst;
          delete run.long.downTries;
          delete run.long.fallbackAsked;
        }
        delete run.long.probing;
        if (run.long.repair) run.long.repair.heldBy = '';
      }
      delete run.carryPending;
      // Paused time does not count: the deadline moves on by it.
      const span = unpauseRun(run);
      save(run);
      idle.set(agent.id, 0);
      if (by === 'restart') {
        record(run, { kind: 'restarted', carried: true, closedMinutes: Math.round(span / 60000) });
        emit('resumed', agent.id, run, { by: 'restart', reopened: 0 });
      } else {
        record(run, { kind: 'resumed', reopened: again, ...(span > 0 ? { pausedMinutes: Math.round(span / 60000) } : {}) });
        emit('resumed', agent.id, run, { reopened: again });
      }
      // Stage D: a new gen of lanes; with several helpers the pool fills again at once.
      const pool = poolOf(agent.id);
      pool.stopping = false;
      pool.agent = agent;
      pump(agent.id);
      return `Mission carries on from step ${run.steps + 1}${again > 0 ? `, with ${again} item${again === 1 ? '' : 's'} taken up again` : ''}.\n\n${checklist(run)}`;
    },
    /** Close the run now, with a report of how far it got. */
    end(agent) {
      const run = runOf(agent.id);
      if (!run) return 'No mission run was started in this thread.';
      if (run.status !== 'running') return report(run);
      // Every lane stops; they are kept as closing until they settle (stage C): a continue waits for them, so none can
      // write into the continued run. A settled lane left uncollected would hand an old text to the next call.
      stopLanes(agent.id);
      const pool = pools.get(agent.id);
      if (pool) for (const lane of [...pool.lanes.values()]) pool.lanes.delete(lane.id);
      if (isLong(run)) run.longEndKind = 'ended';
      return end(agent.id, run, agent, ENDED_BY_YOU);
    },
    /** How the run stands. */
    status(agent) {
      const run = runOf(agent.id);
      if (!run) return '';
      if (run.status !== 'running') return report(run);
      const now = tally(run);
      const lanes = liveLanes(pools.get(agent.id));
      const under = lanes[0];
      const items = lanes.filter((lane) => lane.kind === 'work' && lane.item).map((lane) => lane.item);
      const waiting = run.items.filter((item) => item.status === 'parked').map((item) => item.id);
      const at = helpersOf(run) > 1 && items.length > 0 ? ` Working on items ${items.join(', ')} (${items.length} helper${items.length === 1 ? '' : 's'}).` : under ? ` Working on ${under.what}.` : '';
      return `Mission run on: step ${run.steps}, ${now.verified + now.reviewed} of ${now.total} items done.${at}${waiting.length > 0 ? ` Waiting for you: item${waiting.length === 1 ? '' : 's'} ${waiting.join(', ')}.` : ''}${isLong(run) ? ` When it needs you: ${NEEDS_LABELS[needsOf(run)]}.` : ''}${run.stalled ? `\n${run.stalled}` : ''}\nGoal: ${run.goal}\n\n${checklist(run)}\n\nLog: ${join(dirOf(run), 'log.jsonl')}`;
    },
    /**
     * A helper that only reads (the planner or the reviewer of a run under way).
     * @returns {string} its name ('' for any other conversation).
     */
    /** A run's reader, also a helper started by one (up the chain of helpers): its name, '' for none. */
    readerOf: (id) => readerUp(id)?.name ?? '',
    /** Whether a call comes from a reader of the work loop (an attempt, the judge, a checker) or a helper of one. */
    loopReaderOf: (id) => readerUp(id)?.loop === true,
    /**
     * Pages a run's helpers opened (the work loop's research checker reads them). Kept only for a run
     * with the loop on, at most 500, in the address form it compares.
     * @param {string} id - the conversation.
     * @param {string[]} addresses - web addresses a tool opened.
     */
    noteOpened(id, addresses) {
      const run = runs.get(String(id ?? ''));
      if (!run?.loop || run.status !== 'running') return;
      const known = new Set(run.loop.opened ?? []);
      for (const address of addresses ?? []) {
        const same = sameAddress(address);
        if (same) known.add(same);
      }
      run.loop.opened = [...known].slice(-500);
    },
    /**
     * The questions card's answers to a Mission that is on (stage C): text, skip or a time choice per question id.
     * Throws a plain Error (lib/run.js ANSWER_ERRORS) when nothing can be taken; then nothing is changed.
     * @returns {{answered: string[], skipped: string[], timeChoice: string, reopened: string[], late: string[]}}
     */
    answerMany(id, answers) {
      const run = runOf(id);
      if (!run || run.status !== 'running') throw new Error('No Mission is on here, so the answer was not given.');
      const gateBefore = endGate(run);
      const out = answerMany(run, answers, Date.now(), { under: underOf(id, run) });
      afterAnswer(id, run, out.goesOn ?? [], { gateBefore });
      record(run, { kind: 'answer', by: 'card', answered: out.answered, ...(out.skipped.length > 0 ? { skipped: out.skipped } : {}), ...(out.timeChoice ? { time: out.timeChoice } : {}), reopened: out.reopened, ...(out.late.length > 0 ? { late: out.late } : {}) });
      save(run);
      mirror(run, id);
      return out;
    },
    /**
     * Whether an ended Mission may be continued with these answers (stage C); throws the plain reason when not.
     * @param {string} id - the conversation.
     * @param {unknown} answers - the card's answers.
     * @param {unknown} [minutes] - the time given (checked only when not undefined or null).
     * @returns {object} the run.
     */
    continueCheck(id, answers, minutes, { aside = false, approvals = [] } = {}) {
      const run = runOf(id);
      if (!run) throw new Error('No Mission was started in this thread.');
      if (run.status === 'running') throw new Error(FINISH_ERRORS.already);
      if (!isLong(run)) throw new Error('Only a Mission of this version can be continued. Start Mission starts a new one.');
      if (!api.has(run)) throw new Error('Its record is gone, so this Mission cannot be continued.');
      const block = continueBlock(run);
      if (block === 'allowance') throw new Error('It used its whole token allowance, so it cannot continue. Start a new Mission with your answers.');
      // Items waiting for your yes (typed /mission resume <minutes>) are a reason to continue too, but not after End.
      const waiting = aside ? asideWaiting(run) : 0;
      if (block && waiting === 0) throw new Error(aside && run.stopReason === ENDED_BY_YOU ? 'That Mission was ended with End, so it cannot be continued. Start Mission starts a new one.' : 'That Mission has ended and has no open questions, so it cannot be continued. Start Mission starts a new one.');
      let taken = [];
      try {
        taken = readAnswers(run, answers, { times: false, decided: true });
      } catch {
        taken = [];
      }
      // Stage D: an approval answered in the card counts too, and so do parked items whose answers are all in. Point 17:
      // also what Full auto did not ask, items not done yet, and items Full auto set aside that would go on.
      const picks = (Array.isArray(approvals) ? approvals : []).filter((pick) => (run.approvals ?? []).some((entry) => entry.id === String(pick?.id ?? '') && (entry.status === 'open' || entry.status === 'unasked') && (entry.choices ?? []).some((choice) => choice.id === pick?.choice)));
      const openItems = run.stopReason === ENDED_BY_YOU ? 0 : run.items.filter((item) => item.status === 'open').length;
      if (taken.length === 0 && lateRedo(run).length === 0 && waiting === 0 && picks.length === 0 && settledParked(run).length === 0 && openItems === 0) {
        // Stage C's words while questions are open; Finish it's otherwise.
        if (openQuestions(run).length > 0 || openApprovals(run).length > 0) throw new Error((run.approvals ?? []).some((entry) => entry.status === 'open') ? 'Answer or skip at least one question, or answer an approval, first.' : 'Answer or skip at least one question first.');
        throw new Error(FINISH_ERRORS.nothing);
      }
      if (minutes !== undefined && minutes !== null) {
        const number = Number(minutes);
        const [low, high] = CONTINUE_RANGE;
        if (typeof minutes === 'boolean' || !Number.isFinite(number) || (Math.round(number) !== 0 && (Math.round(number) < low || Math.round(number) > high))) throw new Error('Give a time from 10 minutes to 12 hours, or No time limit.');
      }
      return run;
    },
    /** The time a continue would get, and whether any work would follow (a dry run, stage C). Throws as continueCheck. */
    quoteContinue(id, answers, now = Date.now(), { aside = false, approvals = [] } = {}) {
      const run = api.continueCheck(id, answers, undefined, { aside, approvals });
      return extraTime(run, answers, now, approvals);
    },
    /**
     * Whether the conversation has a goal of its own now (set after the Mission ended): a continue then refuses rather
     * than clear it. The run's own goal that could not be closed (goalClosePending) is not the user's.
     */
    ownGoalBlocks(agent) {
      const goal = goalRef(agent);
      if (!goal || goal.view.phase === 'complete') return false;
      return runOf(agent.id)?.goalClosePending !== true;
    },
    /**
     * Continue an ended Mission with your answers (stage C): the same run goes on, for `minutes` more (0: no time
     * limit). Answers that only skip, with nothing to do again, are only recorded: the Mission stays finished.
     * @param {object} agent - the conversation.
     * @param {{answers: unknown, minutes: number, restore?: object | null}} given - the card's answers, the time, and
     *   what to put back at its next end (a Read Only tab's level; null: nothing).
     * @returns {Promise<{said: string, reopened: string[], answered: string[], skipped: string[], ran: boolean, checkpoint: number}>}
     */
    async continueRun(agent, { answers, minutes, restore, aside = false, approvals = [], applyApprovals } = {}) {
      const id = agent.id;
      const run = api.continueCheck(id, answers, minutes ?? 0, { aside, approvals });
      // Item 4A, stage 6a integration: a run continued in another space goes on under that space's rules, or not at all.
      if (spaceNow(id, run).held) throw new Error(SPACE_HELD_TEXT);
      const quote = extraTime(run, answers, Date.now(), approvals);
      if (!quote.run) {
        // Nothing to do again: the answers are recorded, the report rewritten, and the Mission stays finished.
        if (typeof applyApprovals === 'function' && approvals.length > 0) {
          await applyApprovals(run);
          // The Mission stays finished: a tool allowed now has nothing to be used for, so it is not kept.
          takeBackGrants(run);
        }
        let out = { answered: [], skipped: [] };
        try {
          out = answerMany(run, answers, Date.now(), { force: true });
        } catch (error) {
          if (!(approvals.length > 0)) throw error;
        }
        try {
          save(run);
          writeFileSync(join(dirOf(run), 'report.md'), `${report(run)}\n`);
        } catch (error) {
          warn(`could not write the report: ${String(error?.message ?? error)}`);
        }
        record(run, { kind: 'answer-after-end', answered: out.answered, skipped: out.skipped, ...((out.same ?? []).length > 0 ? { same: out.same } : {}) });
        mirror(run, id);
        changed(id);
        // Point 17: answers that say what it did redo nothing.
        const sameOnly = out.answered.length > 0 && out.answered.every((ref) => (out.same ?? []).includes(ref)) && (out.skipped ?? []).length === 0;
        return { said: sameOnly ? SAME_ONLY_TEXT : 'Noted. Nothing needs doing again, so the Mission stays finished. The report shows what it chose.', reopened: [], answered: out.answered, skipped: out.skipped, ran: false, checkpoint: 0 };
      }
      const goals = goalsOf();
      if (!goals) throw new Error('This version of the app has no goal service.');
      // Steps End stopped that have not settled yet: waited for (at most 10 s), so none can write into the continued run.
      if (!(await closed(id, closingWaitMs))) throw new Error(helpersOf(run) > 1 ? 'It is still closing its last steps. Try again in a moment.' : 'It is still closing its last step. Try again in a moment.');
      // A done step left behind would hand the old final report to the next mission_step call; a new gen of lanes.
      const pool = poolOf(id);
      pool.gen += 1;
      pool.lanes.clear();
      pool.closing.clear();
      pool.told = [];
      pool.stopping = false;
      pool.agent = agent;
      // The end let every file go: the files of items that still wait are held for them again (one writer per file).
      pool.lapStart = undefined;
      rebuildHolds(id, run);
      let given = Math.round(Number(minutes) || 0);
      const raised = given > 0 && quote.stepMinutes > 0 && given <= quote.stepMinutes;
      if (raised) given = quote.stepMinutes + 1;
      let checkpoint = 0;
      try {
        const point = await pointsOf(run.root).take('Mission continued');
        checkpoint = point?.skipped ? 0 : Number(point?.number) || 0;
      } catch (error) {
        warn(`could not take a checkpoint before the continue: ${String(error?.message ?? error)}`);
      }
      // Checked again after the waits: an answer from another pane may have changed the questions meanwhile.
      api.continueCheck(id, answers, given, { aside, approvals });
      const taken = (() => {
        try {
          return readAnswers(run, answers, { times: false, decided: true });
        } catch {
          return [];
        }
      })();
      const lateIds = lateRedo(run);
      // Stage D: approvals answered with the continue are given first (index.js grants them), then the run goes on.
      const parkedBefore = run.items.filter((item) => item.status === 'parked').map((item) => item.id);
      const openBefore = new Set(run.items.filter((item) => item.status === 'open').map((item) => item.id));
      let approved = { reopened: [] };
      if (typeof applyApprovals === 'function' && approvals.length > 0) approved = (await applyApprovals(run)) ?? approved;
      await regrantMission(id, run);
      // Items not done yet that are taken up again (Full auto's set-aside ones only with the yes they lacked).
      const left = run.items.filter((item) => (item.status === 'open' && openBefore.has(item.id)) || (item.status === 'aside' && asideReopens(run, item))).length;
      const allowedCount = (Array.isArray(approvals) ? approvals : []).filter((pick) => pick && typeof pick === 'object' && pick.choice && pick.choice !== 'deny').length;
      reviveRun(run, { minutes: given, at: Date.now(), answered: taken.filter((entry) => entry.text).length, skipped: taken.filter((entry) => entry.skip).length, allowed: allowedCount, checkpoint, units: quote.units });
      if (restore !== undefined) {
        if (restore) run.long.restore = restore;
        else delete run.long.restore;
      }
      const out = taken.length > 0 ? answerMany(run, answers, Date.now(), { force: true }) : { answered: [], skipped: [], reopened: [], late: [], same: [] };
      const objective = `Mission run ${run.id}: ${run.goal}\n\nIn each round call the ${STEP_TOOL} tool once and tell the user what the step did. The run ends when ${STEP_TOOL} returns the final report.`;
      const goal = goalRef(agent);
      if (!goal || goal.view.phase === 'complete') goals.create(agent, { objective, maxGoalRounds: GOAL_ROUNDS });
      else {
        // Only the run's own goal is here (continue refuses a goal of the user's): resumed, or replaced when it cannot be.
        try {
          goals.resume(agent, goal.ref);
        } catch {
          goals.clear(agent, goal.ref);
          goals.create(agent, { objective, maxGoalRounds: GOAL_ROUNDS });
        }
      }
      idle.set(id, 0);
      runs.set(id, run);
      save(run);
      if (!noCommands(run)) writeIndex(id, { root: run.root, id: run.id });
      mirror(run, id);
      const wentOn = parkedBefore.filter((itemId) => run.items.find((item) => item.id === itemId)?.status !== 'parked');
      const reopened = [...new Set([...out.reopened, ...lateIds, ...(approved.reopened ?? [])].filter((itemId) => !wentOn.includes(itemId)))];
      record(run, { kind: 'continued', minutes: given, answered: out.answered, skipped: out.skipped, reopened, checkpoint });
      emit('resumed', id, run, { by: 'continue', continued: true, minutes: given, reopened: reopened.length + left });
      const count = out.answered.length + out.skipped.length;
      const items = (list) => (list.length === 1 ? `Item ${list[0]} is` : `Items ${list.join(', ')} are`);
      const said = [
        `The Mission continues${count > 0 || allowedCount > 0 ? ` with ${[count > 0 ? `your ${count} answer${count === 1 ? '' : 's'}` : '', allowedCount > 0 ? `${allowedCount} step${allowedCount === 1 ? '' : 's'} you allowed` : ''].filter(Boolean).join(' and ')}` : ''}, ${given > 0 ? `for up to ${given} more minutes` : 'with no time limit'}.`,
        reopened.length > 0 ? ` ${items(reopened)} done again with your answer.` : '',
        left > 0 ? ` ${left} item${left === 1 ? '' : 's'} not done yet ${left === 1 ? 'is' : 'are'} taken up again.` : '',
        raised ? ` The time was raised to ${given} minutes: one step of this Mission takes about ${quote.stepMinutes} minutes.` : '',
        wentOn.length > 0 ? ` ${wentOn.length} item${wentOn.length === 1 ? '' : 's'} that waited for you go${wentOn.length === 1 ? 'es' : ''} on from where ${wentOn.length === 1 ? 'it' : 'they'} stopped.` : '',
        // Point 17: an answer that says what it did redoes nothing.
        ...(out.same ?? []).map((ref) => SAME_ANSWER(run.questions.find((question) => question.id === ref)?.text ?? '')),
      ].join('');
      return { said, reopened, answered: out.answered, skipped: out.skipped, ran: true, checkpoint };
    },
    /** Show an ended Mission's questions card again (typed /mission resume on a run with questions left, stage C). */
    showAgain(id, at = Date.now()) {
      const run = runOf(id);
      if (!run) return false;
      run.showFrom = at;
      try {
        save(run);
      } catch {
        /* shown until the next restart */
      }
      return true;
    },
    // ---- Stage D: the helper pool, parked approvals, one writer per file -------------------------------------

    /**
     * The Mission lane a session works in (a helper, or a helper's helper).
     * @returns {{conversation: string, lane: string, item: string, role: string, size: number, run: object} | undefined}
     */
    laneOf(sessionId) {
      const found = laneUp(sessionId);
      if (!found?.conversation) return undefined;
      const run = runs.get(found.conversation);
      if (!run) return undefined;
      return { conversation: found.conversation, lane: found.lane ?? '', item: found.item ?? '', role: found.role ?? '', size: helpersOf(run), run };
    },
    /** @returns {boolean} whether a session is a helper of a Mission (kind long) that has not ended: its asks are parked. */
    canPark(sessionId) {
      const found = api.laneOf(sessionId);
      return Boolean(found) && isLong(found.run) && found.run.status === 'running';
    },
    /** @returns {boolean} whether a session is a helper of a Mission (kind long) that has ended: nothing is asked any more. */
    endedHelper(sessionId) {
      const found = api.laneOf(sessionId);
      return Boolean(found) && isLong(found.run) && found.run.status !== 'running';
    },
    /**
     * Park what a Mission's helper needs the user's yes for (stage D): kept in the run's approvals, shown in the card; the
     * helper is refused and told to finish without it; another helper takes its place when it stops.
     * @param {string} sessionId - the asking helper.
     * @param {object} given - {kind, key, what, tool?, plain?, reason?, files?, paths?, outside?, command?, cannot?}.
     * @returns {{id: string, text: string} | {id: string, said: 'no', text: string} | {cannot: true, id: string, text: string} | undefined}
     */
    parkFor(sessionId, given) {
      const found = api.laneOf(sessionId);
      if (!found || !isLong(found.run)) return undefined;
      const run = found.run;
      const id = found.conversation;
      if (run.status !== 'running') return { id: '', said: 'no', text: GUARD_TEXTS.ended };
      // Work lanes park with their item; the planner, the question pass, the review and the loop's readers with none.
      const owner = laneById(id, found.lane);
      const kind = owner?.kind ?? (found.item ? 'work' : 'plan');
      const item = kind === 'work' || kind === 'recheck' ? owner?.item || found.item : '';
      const by = kind === 'hunt' ? 'hunt' : kind === 'review' || kind === 'checks' ? 'review' : item ? '' : 'plan';
      // Point 17, Full auto: nothing is asked and a Mission never gives itself permission. The step is refused at once and
      // kept as 'unasked' (Finish it lets the user allow it after the end); no card, no alert, no wait.
      if (needsOf(run) === 'decide' && given?.cannot !== true) {
        const noted = addApproval(run, { ...given, item, by, unasked: true }, Date.now());
        // Full auto never waits: never "say what waits" (review of point 17).
        if (noted.how === 'full') return { id: '', said: 'no', unasked: true, text: GUARD_TEXTS.notAsked };
        if (noted.how === 'no') return { id: noted.entry.id, said: 'no', text: GUARD_TEXTS.saidNo };
        const lane = laneById(id, found.lane);
        if (lane) lane.unasked = [...new Set([...(lane.unasked ?? []), noted.entry.id])];
        try {
          save(run);
        } catch { /* kept in memory */ }
        if (noted.how === 'new') record(run, { kind: 'approval', id: noted.entry.id, approval: noted.entry.kind, unasked: true, item: found.item || undefined, lane: found.lane || undefined });
        changed(id);
        return { id: noted.entry.id, said: 'no', unasked: true, text: GUARD_TEXTS.notAsked };
      }
      const kept = addApproval(run, { ...given, item, by }, Date.now());
      if (kept.how === 'full') return { id: '', said: 'no', text: GUARD_TEXTS.tooMany };
      if (kept.how === 'no') return { id: kept.entry.id, said: 'no', text: GUARD_TEXTS.saidNo };
      const entry = kept.entry;
      try {
        save(run);
      } catch { /* kept in memory */ }
      if (entry.status === 'cannot') {
        record(run, { kind: 'approval', id: entry.id, approval: entry.kind, cannot: true, item: found.item || undefined });
        changed(id);
        return { cannot: true, id: entry.id, text: given?.cannotText ?? '' };
      }
      const lane = laneById(id, found.lane);
      if (lane && !lane.parkedApprovals.includes(entry.id)) lane.parkedApprovals.push(entry.id);
      if (kept.how === 'new') record(run, { kind: 'approval', id: entry.id, approval: entry.kind, item: found.item || undefined, lane: found.lane || undefined });
      needsYou(id, run, 'approval');
      changed(id);
      return { id: entry.id, text: GUARD_TEXTS.parked };
    },
    /**
     * The user's answer to a parked approval (the route's `approve`, or a continue after the end with `force`).
     * Index.js gives the permission first (files, places, commands, Tool access) and passes its id.
     * @returns {{entry: object, already?: boolean, reopened: string[], kept: string[]}} throws APPROVAL_ERRORS.
     */
    approve(id, approvalId, choice, { grantId = '', force = false } = {}) {
      const run = runOf(id);
      if (!run || !isLong(run)) throw new Error('No Mission was started in this thread.');
      if (run.status !== 'running' && !force) throw new Error(APPROVAL_ERRORS.ended);
      const gateBefore = endGate(run);
      const out = decideApproval(run, approvalId, choice, { at: Date.now(), grantId, under: run.status === 'running' ? underOf(id) : '', force });
      if (out.already) return out;
      record(run, { kind: 'approved', id: out.entry.id, choice, reopened: out.reopened, ...(out.kept.length > 0 ? { kept: out.kept } : {}) });
      try {
        save(run);
      } catch { /* kept in memory */ }
      mirror(run, id);
      if (run.status === 'running') afterAnswer(id, run, out.reopened, { gateBefore });
      else changed(id);
      return out;
    },
    /** @returns {object | undefined} an approval of a conversation's Mission, by id (index.js reads its files and tool). */
    approvalOf(id, approvalId) {
      return (runOf(id)?.approvals ?? []).find((entry) => entry.id === String(approvalId ?? ''));
    },
    /** @returns {string[]} the items a tool was allowed for only ("Allow for this item") and not done yet; [] when none. */
    itemToolOwners(id, tool) {
      const run = runs.get(String(id ?? ''));
      const owners = new Set();
      for (const entry of run?.approvals ?? []) {
        if (entry.kind !== 'tool' || entry.status !== 'allowed' || entry.choice !== 'item' || entry.spent || entry.tool !== String(tool ?? '')) continue;
        for (const item of entry.items ?? []) if (!(entry.usedBy ?? []).includes(item)) owners.add(String(item));
      }
      return [...owners];
    },
    /** Files a helper's tool or command changed (relative or absolute): kept for its item (the next helper reads them). */
    noteFiles(sessionId, paths) {
      const found = api.laneOf(sessionId);
      const lane = found ? laneById(found.conversation, found.lane) : undefined;
      if (!lane) return;
      for (const path of paths ?? []) {
        const rel = isAbsolute(String(path)) ? relOf(found.run, path) : String(path);
        if (rel) lane.touched.add(rel);
        if (lane.touched.size > 200) break;
      }
    },
    /**
     * Files a background job changed after its helper had stopped (several helpers). An item that waits for the user
     * (parked) holds them, as it holds its other files; any other item claims nothing: its helper is gone, so a claim
     * would never be let go and would keep every other item off those files for the rest of the Mission.
     * @param {string} id - the conversation.
     * @param {string} itemId - the job's item.
     * @param {string[]} paths - absolute paths inside the run's folder.
     */
    heldAfterJob(id, itemId, paths) {
      const run = runs.get(String(id ?? ''));
      if (!claims || !run || !run.root) return;
      const item = (run.items ?? []).find((entry) => entry.id === String(itemId));
      if (!item || item.status !== 'parked') return;
      claims.rebuild(String(id), [{ item: item.id, paths }]);
      item.claims = claims.list(String(id)).filter((entry) => entry.item === item.id).map((entry) => relOf(run, entry.path)).filter(Boolean).slice(0, 200);
      try {
        save(run);
      } catch { /* the next save has it */ }
    },
    /** A file was refused to a helper because another item holds it (its item waits for the file when it stops). */
    noteBlocked(sessionId, { file, heldBy }) {
      const found = api.laneOf(sessionId);
      const lane = found ? laneById(found.conversation, found.lane) : undefined;
      if (!lane) return;
      const rel = isAbsolute(String(file)) ? relOf(found.run, file) : String(file);
      if (rel && !lane.blocked.some((entry) => entry.file === rel)) lane.blocked.push({ file: rel, heldBy: String(heldBy ?? '') });
      try {
        record(found.run, { kind: 'file-held', item: found.item, file: rel, heldBy: String(heldBy ?? '') });
      } catch { /* the log is a convenience */ }
    },
    /** @returns {Promise<boolean>} whether every stopped lane of a conversation settled within `ms` (/mission back waits). */
    settled: (id, ms = closingWaitMs) => closed(id, ms),
    /** A line in a running Mission's log (the tool guard's folder-busy and put-back notes). */
    log(sessionId, entry) {
      const found = api.laneOf(sessionId);
      if (!found || !entry || typeof entry !== 'object') return;
      try {
        record(found.run, { ...entry, item: found.item || undefined, lane: found.lane || undefined });
      } catch { /* the log is a convenience */ }
    },
    /** The Budget guard refused a step: no lane starts and a failing helper uses no try until the hold has come. */
    stopping(id) {
      const pool = pools.get(String(id ?? ''));
      if (pool) pool.stopping = true;
    },
    /**
     * At start-up: tool permissions Mission gave for one item (of running Missions) and for whole Missions that have ended
     * are taken back. @returns {string[]} their ids (index.js revokes them).
     */
    staleGrants() {
      const out = [];
      for (const [conversation, where] of Object.entries(readIndex())) {
        let run;
        try {
          run = runs.get(conversation) ?? JSON.parse(readFileSync(join(where.root, OWN_FOLDER, 'runs', where.id, 'run.json'), 'utf8'));
        } catch {
          continue;
        }
        let touched = false;
        for (const entry of Array.isArray(run?.approvals) ? run.approvals : []) {
          if (!entry.grantId || (run.status === 'running' && entry.choice !== 'item')) continue;
          out.push(entry.grantId);
          entry.grantId = '';
          touched = true;
        }
        if (touched) {
          try {
            save(run);
          } catch { /* taken back anyway */ }
        }
      }
      return out;
    },
    // ---- Stage E ----------------------------------------------------------------------------------------------------

    /** Try the model server now (Try now, or Resume while it waits for it). Throws NOT_DOWN_TEXT when it does not wait. */
    tryNow(id) {
      const run = runOf(String(id ?? ''));
      if (!run || run.status !== 'running' || !isLong(run) || !run.long.down || run.pausedAt) throw new Error(NOT_DOWN_TEXT);
      run.long.down.nextAt = 0;
      downSweep(String(id), run, Date.now(), (key) => agentFor(key));
      changed(String(id));
      return TRY_NOW_TEXT;
    },
    /** @returns {boolean} whether a conversation's Mission waits for its model server now. */
    downActive(id) {
      const run = runs.get(String(id ?? ''));
      return Boolean(run) && isLong(run) && run.status === 'running' && Boolean(run.long?.down);
    },
    /**
     * The watchdog found the conversation's model server down (the app stopped giving rounds): the Mission waits for it.
     * @returns {boolean} whether it waits now (false: not a Mission that is on and not paused, or Try again by itself is off).
     */
    serverDown(agent, info = {}) {
      const run = runOf(agent?.id);
      if (!run || !isLong(run) || run.status !== 'running' || run.pausedAt || run.long.retry !== true) return false;
      // Review of stage E: the conversation's own model is on a server that does not answer, but several helpers work on
      // the fallback model you allowed: they keep working (they start their own items and end the Mission with its
      // report); only the conversation's rounds wait.
      const fallback = routeOf(run.long.fallback);
      const from = String(info.provider ?? '');
      if (!run.long.down && fallback && helpersOf(run) > 1 && from && from !== fallback.provider) {
        if (run.long.conductorDown !== from) {
          run.long.conductorDown = from;
          record(run, { kind: 'conductor-down', provider: from });
          try {
            save(run);
          } catch { /* kept in memory */ }
        }
        poolOf(agent.id).agent = agent;
        pump(agent.id);
        changed(agent.id);
        return true;
      }
      if (!run.long.down) {
        poolOf(agent.id).agent = agent;
        enterDown(agent.id, run, info);
      }
      return Boolean(run.long.down);
    },
    /**
     * After a restart (point 9), decided once per boot for each Mission that was on:
     *   waiting        it waits for you quietly (Wait for me) or its wait ran out: as point 17 built it
     *   paused-before  it was paused before the app closed (by you, a problem, a restart): it stays exactly so
     *   carry          working (or waiting for its model server) with Carry on by itself after a restart on
     *   paused-off     anything else: paused, said why, one alert
     * @returns {{decision: string, first: boolean}}
     */
    afterRestart(conversation, run) {
      const key = String(conversation ?? '');
      if (restartDecisions.has(key)) return { decision: restartDecisions.get(key), first: false };
      const live = runs.get(key) ?? run ?? runOf(key);
      if (live && !runs.has(key)) runs.set(key, live);
      let decision = 'ended';
      if (live?.status === 'running') {
        if (isLong(live) && ((Number(live.long?.waitingSince) > 0 && live.long?.quietGoal === true) || live.long?.waitOver === true)) decision = 'waiting';
        else if (Number(live.pausedAt) > 0) decision = 'paused-before';
        else if (isLong(live) && live.long?.carryOn === true) decision = 'carry';
        else decision = 'paused-off';
      }
      restartDecisions.set(key, decision);
      return { decision, first: true };
    },
    /** @returns {string | undefined} this boot's restart decision for a conversation. */
    restartDecision: (conversation) => restartDecisions.get(String(conversation ?? '')),
    /**
     * Carry a Mission on by itself after a restart (point 9): paused from its last step (the closed time never counts),
     * its conversation opened, checked as Resume checks it, and resumed (its goal re-armed). A Mission that waits for
     * its model server goes on waiting (its next try is now).
     * @param {string} conversation - the conversation.
     * @param {{check?: (agent: object) => string, trash?: (id: string) => boolean, timeoutMs?: number}} [how] - Resume's
     *   checks (the reason, '' when it may), and the Cowork trash.
     * @returns {Promise<string>} what came of it.
     */
    async carryOn(conversation, { check = () => '', trash = () => false, timeoutMs = 20_000 } = {}) {
      const id = String(conversation ?? '');
      if (carrying.has(id)) return 'busy';
      carrying.add(id);
      try {
        const run = runOf(id);
        if (!run || run.status !== 'running' || !isLong(run)) return 'none';
        const L = run.long;
        const now = Date.now();
        const stop = (text, by, alert = true) => {
          if (!run.pausedAt) pauseRun(run, restartPauseFrom(run) || now);
          run.stalled = text;
          run.pausedBy = by;
          try {
            save(run);
          } catch { /* kept in memory */ }
          record(run, { kind: 'restarted', carried: false, why: by });
          if (alert) emit('stopped-by-itself', id, run, { why: by === 'problem' ? 'problem' : 'restart', reason: text });
          changed(id);
        };
        let inTrash = false;
        try {
          inTrash = trash(id) === true;
        } catch {
          inTrash = false;
        }
        if (inTrash) {
          stop(RESTART_TRASH_TEXT, 'restart');
          return 'trash';
        }
        // A Mission that waits for its model server: it goes on waiting; the next try is now (it arms the goal).
        if (L.down && !run.pausedAt) {
          L.down.nextAt = now;
          const agent = agentFor(id) ?? await openAgent(id, timeoutMs);
          if (agent) poolOf(id).agent = agent;
          record(run, { kind: 'restarted', carried: true, down: true });
          downSweep(id, run, Date.now(), () => agent);
          return 'down';
        }
        // From its last step: the time the app was closed never counts.
        if (!run.pausedAt) pauseRun(run, restartPauseFrom(run) || now);
        run.pausedBy = 'restart';
        try {
          save(run);
        } catch { /* kept in memory */ }
        const agent = agentFor(id) ?? await openAgent(id, timeoutMs);
        if (!agent) {
          run.carryPending = true;
          stop(RESTART_OPEN_TEXT, 'restart');
          return 'no-agent';
        }
        const why = (() => {
          try {
            return String(check(agent) ?? '');
          } catch (error) {
            return String(error?.message ?? error);
          }
        })();
        if (why) {
          delete run.carryPending;
          stop(/^paused\b/i.test(why) ? why : `Paused: ${why}`, 'problem');
          return 'problem';
        }
        // The brake: carried on 3 times within 30 minutes with no step finished in between.
        const recent = (Array.isArray(L.carryOns) ? L.carryOns : []).filter((at) => now - Number(at) < CARRY_BRAKE_MS);
        if (recent.length >= CARRY_BRAKE) {
          delete run.carryPending;
          stop(CARRY_BRAKE_TEXT, 'problem');
          return 'brake';
        }
        L.carryOns = [...recent, now];
        if (agent.status && agent.status !== 'idle' && typeof agent.whenIdle === 'function') {
          try {
            await agent.whenIdle();
          } catch { /* looked at again below */ }
        }
        // Something else moved it meanwhile (you pressed Resume or End): left as it is.
        if (run.status !== 'running' || run.pausedBy !== 'restart') return 'changed';
        api.resume(agent, { by: 'restart' });
        run.carriedOnAt = Date.now();
        poolOf(id).told.push(CARRIED_TOLD);
        try {
          save(run);
        } catch { /* kept in memory */ }
        changed(id);
        return 'carried';
      } finally {
        carrying.delete(id);
      }
    },
    /** A chat's Mission settings saved while its Mission is on: the assistant's choice and Carry on apply at once. */
    setLive(id, { assistant, carryOn } = {}) {
      const run = runOf(String(id ?? ''));
      if (!run || run.status !== 'running' || !isLong(run)) return false;
      if (assistant === 'look' || assistant === 'talk') run.long.assistant = assistant;
      if (typeof carryOn === 'boolean') run.long.carryOn = carryOn;
      try {
        save(run);
      } catch { /* kept in memory */ }
      changed(String(id));
      return true;
    },
    /** A fallback model you allowed for this Mission's helpers (never in Recon). @returns {boolean} whether it is used. */
    setFallback(id, route) {
      const run = runOf(String(id ?? ''));
      const chosen = routeOf(route);
      if (!run || !isLong(run) || noCommands(run) || !chosen) return false;
      run.long.fallback = chosen;
      // Review of stage E: while it waits for its server, the fallback's server is tried at once.
      if (run.long.down) run.long.down.nextAt = 0;
      record(run, { kind: 'fallback', provider: chosen.provider, model: chosen.model });
      try {
        save(run);
      } catch { /* kept in memory */ }
      changed(String(id));
      return true;
    },
    /**
     * Owner point 19: a setting the repair helper asked for was changed after your Allow. Kept on its approval (the
     * report's "Changed after your Allow" line) and in the run log.
     * @param {string} id - the conversation.
     * @param {string} approvalId - the approval.
     * @param {unknown} from - the value it had just before the change.
     * @returns {string} the line, '' when there is no such approval.
     */
    settingChanged(id, approvalId, from) {
      const run = runOf(String(id ?? ''));
      const entry = (run?.approvals ?? []).find((each) => each.id === String(approvalId ?? ''));
      if (!entry || entry.fix?.kind !== 'setting') return '';
      if (from !== undefined) entry.fix.from = from;
      entry.changedText = changedWords(entry.fix);
      entry.changedAt = Date.now();
      record(run, { kind: 'setting-changed', id: entry.id, field: entry.fix.field, page: entry.fix.page, setting: entry.fix.label, from: entry.fix.from ?? null, to: entry.fix.to, said: entry.changedText });
      try {
        save(run);
      } catch { /* kept in memory */ }
      changed(String(id));
      return entry.changedText;
    },
    /**
     * Lab check of point 19: your Allow or Deny for a change that waits for your OK after the end (index.js made the
     * change first). The Mission stays as it ended: no item is taken up again; the report is written again.
     * @returns {{entry: object, already?: boolean}} throws APPROVAL_ERRORS.
     */
    okAfterEnd(id, approvalId, choice, { changedText = '', now } = {}) {
      const run = runOf(String(id ?? ''));
      if (!run || !isLong(run)) throw new Error('No Mission was started in this thread.');
      if (run.status === 'running') throw new Error(OK_RUNNING);
      // 'stale': your Allow came when the setting was no longer what the repair helper saw (`now` is its value now).
      const out = decideOk(run, approvalId, choice, Date.now(), { now });
      if (out.already) return out;
      if (changedText && choice === 'allow' && !out.entry.changedText) out.entry.changedText = String(changedText).slice(0, 400);
      record(run, { kind: 'ok-after-end', id: out.entry.id, choice, fix: out.entry.fix?.kind ?? '' });
      try {
        save(run);
        writeFileSync(join(dirOf(run), 'report.md'), `${report(run)}\n`);
      } catch (error) {
        warn(`could not write the report: ${String(error?.message ?? error)}`);
      }
      mirror(run, String(id));
      changed(String(id));
      return out;
    },
    /** @returns {object[]} the changes that wait for your OK after the end (lab check of point 19). */
    pendingOks(id) {
      return pendingOks(runOf(String(id ?? '')));
    },
    /** @returns {string[]} the fallback routes a tier offers this conversation now (Allow checks the model is still there). */
    fallbackOf(id) {
      const run = runOf(String(id ?? ''));
      const agent = agentFor(String(id ?? ''));
      return run && agent ? fallbackFor(agent, run) : undefined;
    },
    /**
     * The Budget guard stopped a Mission by its own allowance (steps or tokens): the raise by half is asked in the card
     * (the Ask modes) or listed (Full auto).
     * @returns {{entry: object, to: number, needs: string} | undefined} undefined when it cannot be raised.
     */
    budgetAsk(id, { limit, max } = {}) {
      const run = runOf(String(id ?? ''));
      if (!run || !isLong(run) || run.status !== 'running' || !['steps', 'tokens'].includes(limit)) return undefined;
      const from = Math.round(Number(max) || 0);
      const to = raisedLimit(limit, from);
      if (!to) return undefined;
      const count = (value) => Number(value).toLocaleString('en-US');
      const entry = parkRepair(String(id), run, { key: `budget:${limit}:${from}`, what: `Raise the Budget guard's Mission allowance from ${count(from)} to ${count(to)} ${limit} (Settings → Budget guard)`, fix: { kind: 'budget', limit, from, to } });
      if (!entry || !['open', 'unasked'].includes(entry.status)) return undefined;
      repairOf(run, epochOf(run)).heldBy = entry.id;
      try {
        save(run);
      } catch { /* kept in memory */ }
      changed(String(id));
      return { entry, to, needs: needsOf(run) };
    },
    /** @returns {boolean} whether the Mission is paused by a problem that this approval (or the repair that asked it) holds. */
    heldBy(id, approvalId) {
      const run = runOf(String(id ?? ''));
      if (!run || !isLong(run) || run.status !== 'running' || run.pausedBy !== 'problem') return false;
      const held = String(run.long?.repair?.heldBy ?? '');
      const entry = (run.approvals ?? []).find((each) => each.id === String(approvalId ?? ''));
      return Boolean(held) && Boolean(entry) && (held === entry.id || held === String(entry.repair ?? ''));
    },
    /**
     * Point 12: another add-on (Devices, Recon, Creator Plus, Tuner Plus) needs the user's yes for a Mission's helper.
     * Never throws. See the README's Stage E section for the answers.
     * @param {{sessionId: string, addon: string, key: string, what: string, reason?: string, act?: boolean, needed?: boolean, cannot?: boolean, ref?: object}} request
     * @returns {object | undefined} undefined: not a helper of a Mission (the add-on's old flow applies).
     */
    askYes(request) {
      try {
        const addon = String(request?.addon ?? '');
        const name = ADDON_NAMES[addon];
        if (!name) return undefined;
        const found = api.laneOf(String(request?.sessionId ?? ''));
        if (!found || !isLong(found.run)) return undefined;
        const run = found.run;
        const id = found.conversation;
        if (run.status !== 'running') return { id: '', said: 'no', text: GUARD_TEXTS.ended };
        const key = `${addon}:${String(request?.key ?? '').replace(/\s+/g, ' ').trim().slice(0, 300)}`;
        const what = String(request?.what ?? '').replace(/\s+/g, ' ').trim().slice(0, 300) || `A step through ${name}`;
        const owner = laneById(id, found.lane);
        const kind = owner?.kind ?? (found.item ? 'work' : 'plan');
        const act = request?.act === true;
        const item = !act && (kind === 'work' || kind === 'recheck') ? owner?.item || found.item : '';
        const by = item || act ? '' : kind === 'hunt' ? 'hunt' : kind === 'review' || kind === 'checks' ? 'review' : kind === 'repair' ? 'repair' : 'plan';
        const given = { kind: 'addon', key, what, addon, act, needed: request?.needed !== false, item, by, ...(request?.reason ? { reason: String(request.reason).slice(0, 600) } : {}), ...(request?.ref && typeof request.ref === 'object' ? { ref: request.ref } : {}) };
        if (request?.cannot === true) {
          const kept = addApproval(run, { ...given, cannot: true }, Date.now());
          if (kept.entry && kept.how === 'new') record(run, { kind: 'approval', id: kept.entry.id, approval: 'addon', addon, cannot: true });
          try {
            save(run);
          } catch { /* kept in memory */ }
          changed(id);
          return { cannot: true, id: kept.entry?.id ?? '', text: ADDON_TEXTS.cannot(name) };
        }
        // An Allow given before for exactly this step, not used yet: used once now.
        const granted = (run.approvals ?? []).find((entry) => entry.kind === 'addon' && entry.key === key && entry.status === 'allowed' && entry.act !== true && entry.used !== true);
        if (granted) {
          granted.used = true;
          record(run, { kind: 'approval-used', id: granted.id, addon });
          try {
            save(run);
          } catch { /* kept in memory */ }
          return { granted: true, id: granted.id };
        }
        if (needsOf(run) === 'decide') {
          const noted = addApproval(run, { ...given, unasked: true }, Date.now());
          if (noted.how === 'full') return { id: '', said: 'no', unasked: true, text: GUARD_TEXTS.notAsked };
          if (noted.how === 'no') return { id: noted.entry.id, said: 'no', text: GUARD_TEXTS.saidNo };
          if (owner && !act) owner.unasked = [...new Set([...(owner.unasked ?? []), noted.entry.id])];
          if (noted.how === 'new') record(run, { kind: 'approval', id: noted.entry.id, approval: 'addon', addon, unasked: true });
          try {
            save(run);
          } catch { /* kept in memory */ }
          changed(id);
          return { id: noted.entry.id, said: 'no', unasked: true, text: GUARD_TEXTS.notAsked };
        }
        const kept = addApproval(run, given, Date.now());
        if (kept.how === 'full') return { id: '', said: 'no', text: GUARD_TEXTS.tooMany };
        if (kept.how === 'no') return { id: kept.entry.id, said: 'no', text: GUARD_TEXTS.saidNo };
        if (owner && !act && !owner.parkedApprovals.includes(kept.entry.id)) owner.parkedApprovals.push(kept.entry.id);
        if (kept.how === 'new') record(run, { kind: 'approval', id: kept.entry.id, approval: 'addon', addon, ...(act ? { act: true } : {}), item: item || undefined });
        try {
          save(run);
        } catch { /* kept in memory */ }
        needsYou(id, run, 'approval');
        changed(id);
        return { id: kept.entry.id, text: act ? ADDON_TEXTS.parkedAct(name) : ADDON_TEXTS.parked(name) };
      } catch (error) {
        warn(`could not take an add-on's question for a Mission: ${String(error?.message ?? error)}`);
        return undefined;
      }
    },
    /**
     * A tool call of a Mission's helper ended (only calls Mission's guard let through count; refusals never). The same
     * tool failing TOOL_FAILS times in a row gets a repair; a success of it starts the count again.
     */
    toolResult(id, tool, failed, text = '') {
      const run = runs.get(String(id ?? ''));
      if (!run || !isLong(run) || run.status !== 'running') return;
      const name = String(tool ?? '').slice(0, 80);
      if (!name) return;
      const counts = toolFails.get(String(id)) ?? new Map();
      toolFails.set(String(id), counts);
      if (!failed) {
        counts.delete(name);
        return;
      }
      const seen = (counts.get(name)?.n ?? 0) + 1;
      const texts = [...(counts.get(name)?.texts ?? []), String(text ?? '').slice(0, 600)].slice(-3);
      if (seen < TOOL_FAILS) {
        counts.set(name, { n: seen, texts });
        return;
      }
      counts.delete(name);
      askRepair(String(id), run, { kind: 'tool', tool: name, evidence: texts.map((said, index) => `${index + 1}. ${said}`).join('\n') });
    },
    /** @returns {{point: number} | undefined} the repair helper a session is (its save point; 0: none was taken). */
    repairLaneOf(sessionId) {
      const found = laneUp(sessionId);
      if (!found?.conversation) return undefined;
      const lane = laneById(found.conversation, found.lane);
      return lane?.kind === 'repair' ? { point: Number(lane.repairPoint) || 0 } : undefined;
    },
    /** The goal given rounds again (also an active but disarmed one). For tests and the carry on. */
    armGoal: (agent) => {
      const run = runOf(agent?.id);
      return run ? armGoal(agent, run) : false;
    },
    /** Whether a run's folder exists; for tests. */
    has: (run) => existsSync(join(dirOf(run), 'run.json')),
  };
  return api;
}
