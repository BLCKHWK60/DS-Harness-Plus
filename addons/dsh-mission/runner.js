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
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { OWN_FOLDER, real } from './lib/paths.js';
import { MODE_LABELS } from './lib/guard.js';
import { ROLES, addAsk, applyChecks, cleanEnv, dropCommands, noChecks, noCommands, offlineChecks, portsClosed, workersWithoutCommands, applyPlan, applyReview, applyUndo, applyWork, brokenChecks, checklist, finish, isLong, lapNotes, newRun, nextStep, reopen, report, tally } from './lib/run.js';
import { conductorNote, formatPrompt, jsonOf, planPrompt, reviewPrompt, workPrompt } from './lib/prompts.js';
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
/** Helpers in a row that could not do their item before a run pauses itself. */
export const FAIL_STREAK = 3;
/** Added to a failed check in a Bench Long run that reached for a device's port. */
export const PORTS_CLOSED_NOTE = 'Bench keeps the Mac\'s device ports closed to a Long run\'s checks, so this check could not open one. To run a Bench Long run without checks, switch them off in Settings → Bench.';
const ROLE_NAMES = { plan: 'planner', implement: 'worker', review: 'reviewer', judge: 'judge', check: 'checker' };
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
export function createRunner(ctx, { settings, pointsOf, afterCommand, warn, home, failedTurnMs = FAILED_TURN_MS, callsAtOnce = () => 4 }) {
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
  /** Conversation id -> the step under way: what stops it, and what had to be set aside. */
  const steps = new Map();
  /** Conversation id -> rounds in a row in which the step tool was not called. */
  const idle = new Map();
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
  const keep = (run, name, text) => {
    try {
      writeFileSync(join(dirOf(run), 'steps', `${String(run.steps + 1).padStart(3, '0')}-${name}.md`), String(text ?? ''));
    } catch {
      /* the log line still says what happened */
    }
  };

  /** @returns {object | undefined} the conversation's run, from memory or from its folder. */
  const runOf = (id) => {
    if (runs.has(id)) return runs.get(id);
    const where = readIndex()[id];
    if (!where?.root || !where?.id) return undefined;
    try {
      const run = JSON.parse(readFileSync(join(where.root, OWN_FOLDER, 'runs', where.id, 'run.json'), 'utf8'));
      if (run?.id !== where.id) return undefined;
      runs.set(id, run);
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
  const holdAfter = (agent, reason) => {
    const timer = setTimeout(() => {
      try {
        api.hold(agent, reason);
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
  try {
    ctx.on?.('session/event', (session, event) => {
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
  /** Run one helper model to its answer. A helper whose model failed throws, with the model's reason. */
  const helper = async ({ parent, role, root, label, prompt, signal, reader = '', index = 0, loopReader = false }) => {
    const owner = runs.get(parent?.id);
    const subagents = ctx.get('subagents');
    if (!subagents?.startActivation) throw new Error('The app\'s sub-agent service is not available.');
    const route = routeFor(parent, role, root, index);
    const key = route ? `${route.provider}/${route.model}` : '';
    let effort = owner?.kind === 'long' && owner.long?.effort === true && !noEffort.has(key) ? ROLE_EFFORT[role] : undefined;
    const limit = new AbortController();
    const timer = setTimeout(() => limit.abort(new Error(`The ${ROLE_NAMES[role]} worked for more than ${HELPER_MS / 60000} minutes and was stopped.`)), HELPER_MS);
    timer.unref?.();
    const both = AbortSignal.any([signal, limit.signal]);
    const started = Date.now();
    try {
      for (;;) {
        const child = await startChild(subagents, {
          provider: 'spawn',
          label,
          request: { prompt: [{ type: 'text', text: `${prompt}\n\n` }], parent, signal: both, ...(route ? { agentOptions: { provider: route.provider, model: route.model, ...(effort ? { reasoningEffort: effort } : {}), ...(route.maxTokens ? { maxTokens: route.maxTokens } : {}) } } : {}) },
          delivery: 'parent',
          signal: both,
        });
        if (reader && child?.childId) readers.set(String(child.childId), { name: reader, loop: loopReader });
        const close = () => Promise.resolve(child?.dispose?.()).catch(() => {});
        if (child?.childId) working.set(String(child.childId), close);
        let result;
        try {
          result = await awaitChild(child, both);
        } finally {
          if (child?.childId) {
            readers.delete(String(child.childId));
            if (working.get(String(child.childId)) === close) working.delete(String(child.childId));
          }
        }
        const text = (result.output ?? []).filter((block) => block.type === 'text').map((block) => block.text).join('\n').trim();
        const failure = helperFailure(result);
        // A model that does not take this thinking level (deepseek-flash refuses "medium", a local model
        // "high"): again without one. The app's result often carries no detail, so any failure with a
        // thinking level set is tried once more without it.
        if (failure && effort) {
          noEffort.add(key);
          effort = undefined;
          continue;
        }
        if (failure) throw new Error(failure);
        return { text, model: route?.model ?? 'the conversation\'s model', from: route?.from ?? 'conversation', ms: Date.now() - started, stopReason: result.stopReason };
      }
    } finally {
      clearTimeout(timer);
    }
  };

  /** Run a proof command, with a checkpoint before it and unapproved changes put back after it. */
  const prove = async (id, run, command, signal) => {
    let point;
    try {
      point = await pointsOf(run.root).take(`Before check: ${command.slice(0, 70)}`);
    } catch {
      point = undefined;
    }
    const closed = portsClosed(run);
    const ran = await runCommand({ command, root: run.root, signal, closePorts: closed, offline: offlineChecks(run), cleanEnv: cleanEnv(run) });
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

  const modelLine = (who, done) => `${who} on ${done.model}${done.from === 'conversation' || done.from === 'same' ? '' : ` (${done.from === 'tiers' ? 'Model Tiers role' : done.from === 'team' ? 'the tier\'s team' : done.from === 'project' ? 'this project\'s choice' : 'Mission\'s choice'})`}`;

  /**
   * A planner's or reviewer's prose answer turned into its JSON by one short ask (MISSION_FORMAT).
   * @returns {Promise<object | null>} the JSON when it has what `ok` asks for, else null.
   */
  const asJson = async (text, kind, ok, parent, run, signal) => {
    if (!String(text ?? '').trim()) return null;
    try {
      const done = await helper({ parent, role: 'plan', root: run.root, label: `Mission: ${kind === 'plan' ? 'planner' : 'reviewer'} (format)`, prompt: formatPrompt(kind, text), signal, reader: kind === 'plan' ? 'the planner' : 'the reviewer' });
      const parsed = jsonOf(done.text);
      return ok(parsed) ? parsed : null;
    } catch (error) {
      if (signal.aborted) throw error;
      return null;
    }
  };

  const doPlan = async (id, run, parent, signal) => {
    let files = '';
    try {
      const listed = await pointsOf(run.root).files(300);
      files = listed.files.join('\n') + (listed.more ? '\n… (more files)' : '');
    } catch {
      files = '';
    }
    const prompt = `${planPrompt({ goal: run.goal, root: run.root, files, maxItems: run.limits.maxItems, notes: lapNotes(run), context: run.long?.context ?? '', noCommands: noChecks(run), offline: offlineChecks(run) })}${run.loop?.recipe ? `\n\n${recipeText(run.loop)}` : ''}`;
    let done = await helper({ parent, role: 'plan', root: run.root, label: 'Mission: planner', prompt, signal, reader: 'the planner' });
    let plan = jsonOf(done.text);
    if (!plan || !Array.isArray(plan.items)) {
      // One more try: some models wrap the answer in talk the first time.
      done = await helper({ parent, role: 'plan', root: run.root, label: 'Mission: planner (again)', prompt: `${prompt}\n\nYour last answer was not a JSON object with an "items" list. Answer with that JSON object only.`, signal, reader: 'the planner' });
      plan = jsonOf(done.text);
    }
    // Still prose (a small local model, or one that wrote its plan into a file): turned into the JSON.
    if (!plan || !Array.isArray(plan.items)) plan = await asJson(done.text, 'plan', (parsed) => Array.isArray(parsed?.items), parent, run, signal) ?? plan;
    keep(run, 'plan', done.text);
    applyPlan(run, plan);
    dropCommands(run);
    record(run, { kind: 'plan', role: 'plan', model: done.model, ms: done.ms, items: run.items.length, parsed: Boolean(plan) });
    return [`Step ${run.steps}: plan (${modelLine('planner', done)}). ${run.items.length} item${run.items.length === 1 ? '' : 's'}${run.checks.length > 0 ? `, ${run.checks.length} overall command${run.checks.length === 1 ? '' : 's'}` : ''}.${plan ? '' : ' The planner gave no usable checklist, so the goal itself is the one item.'}`, run.summary ? `Approach: ${run.summary}` : '', '', checklist(run), run.checks.length > 0 ? `\nAt the end these must pass: ${run.checks.join(' ; ')}` : ''].filter((part) => part !== '').join('\n');
  };

  /**
   * Long run: the start of a lap is marked with a checkpoint once the overall commands have passed, so
   * the gate can undo a lap that breaks them (step 52). The items worked on in the lap are noted.
   */
  const lapStart = async (run, item) => {
    if (!isLong(run)) return;
    if (!run.long.lapPoint && run.long.checksPassedOnce) {
      try {
        const point = await pointsOf(run.root).take(`Long run: start of lap ${run.long.lap + 1}`);
        run.long.lapPoint = point.number;
        run.long.lapItems = [];
      } catch (error) {
        warn(`could not mark the start of a lap, so it cannot be undone: ${String(error?.message ?? error)}`);
      }
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
    const base = workPrompt({ goal: run.goal, summary: run.summary, item, others, senior: false, notes: lapNotes(run), root: run.root, noCommands: true });
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
          if (signal.aborted) throw error;
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
        if (signal.aborted) throw error;
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
      return { ran: true, why: verdict.ok ? '' : verdict.why, by: 'app' };
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
      if (signal.aborted) throw error;
      // A checker that could not run is no verdict: the item is not sent back for it.
      return { ran: false, why: '' };
    }
  };

  const doWork = async (id, run, item, parent, signal, step) => {
    // With the loop on, a step that failed twice goes up to the strongest model; without it, as before.
    const senior = goesUp(run, item);
    if (senior && run.loop) run.loop.escalations = (run.loop.escalations ?? 0) + 1;
    const others = run.items.filter((entry) => entry.id !== item.id).map((entry) => `${entry.id}. ${entry.title} [${entry.status}]`).join('\n');
    await lapStart(run, item);
    const prepared = run.loop && !senior ? await prepare(run, item, parent, signal, others) : undefined;
    const prompt = `${workPrompt({ goal: run.goal, summary: run.summary, item, others, senior, notes: lapNotes(run), root: run.root, noCommands: workersWithoutCommands(run) })}${run.loop ? `\n\n${SHAPE_NOTE}` : ''}${prepared ? `\n\nSeparate attempts prepared this answer (${prepared.how}). Check it, then do the item with it: write it where the item needs it. Do not start again from nothing.\n--- PREPARED ---\n${prepared.text.slice(0, 8000)}\n--- END ---` : ''}`;
    let done;
    let failed = '';
    try {
      done = await helper({ parent, role: senior ? 'plan' : 'implement', root: run.root, label: `Mission: item ${item.id}${senior ? ' (senior)' : ''}`, prompt, signal });
    } catch (error) {
      if (signal.aborted) throw error;
      failed = String(error?.message ?? error).slice(0, 300);
      done = { text: '', model: '?', from: 'conversation', ms: 0 };
    }
    keep(run, `item-${item.id}-try-${item.tries + 1}`, done.text || failed);
    const blocked = /^\s*\**\s*BLOCKED\b/i.test(done.text);
    const check = item.check && !failed && !noChecks(run) ? await prove(id, run, item.check, signal) : undefined;
    const aside = !check?.ok && step.asides.length > 0 ? step.asides.join(' ') : '';
    // The work loop's checker (only when it is on), after the worker and its command.
    const judged = run.loop && !failed && !blocked && !aside ? await loopCheck(run, item, done.text, prepared, parent, signal) : { ran: false, why: '' };
    if (judged.ran) run.loop.checks[judged.why ? 'failed' : 'passed'] += 1;
    applyWork(run, item.id, {
      report: done.text,
      check: check ? { ok: check.ok, output: check.output } : undefined,
      aside,
      failed: failed || (!check && blocked ? done.text.replace(/\s+/g, ' ').slice(0, 300) : ''),
      loopFail: judged.why,
      loopFailBy: judged.by ?? 'app',
    });
    record(run, { kind: 'work', role: senior ? 'plan' : 'implement', model: done.model, ms: done.ms, item: item.id, try: item.tries, status: item.status, check: check ? { command: item.check, ok: check.ok, seconds: check.seconds } : null, aside: aside || undefined, ...(run.loop ? { loop: { kind: run.loop.kind, prepared: prepared?.how ?? '', checked: judged.ran, passed: judged.ran && !judged.why, senior } } : {}) });
    if (item.status === 'aside') emit('needs-you', id, run, { item: item.id, title: item.title });
    // Helpers that keep failing the same way (a model that does not answer, a folder they cannot write):
    // the run is paused and says why, instead of using up its laps on it.
    const why = failed || (blocked ? done.text.replace(/\s+/g, ' ').slice(0, 300) : '');
    run.failStreak = why ? (run.failStreak ?? 0) + 1 : 0;
    let pausedNote = '';
    if (run.failStreak >= FAIL_STREAK) {
      run.failStreak = 0;
      const reason = `${FAIL_STREAK} helpers in a row could not do their item. The last one: ${why}`;
      holdAfter(parent, reason);
      pausedNote = `The run is paused: ${reason}\nTell the user this and do not call ${STEP_TOOL} again until they resume it.`;
    }
    const outcome = { verified: 'PASSED: its command was run and passed', unverified: 'done; no command proves it, so the reviewer will judge it', open: 'not done yet; it will be tried again', stuck: 'NOT FINISHED after all its tries', aside: 'SET ASIDE: it needs your yes' }[item.status] ?? item.status;
    const lines = [`Step ${run.steps}: item ${item.id} of ${run.items.length}, "${item.title}" (${modelLine(senior ? 'senior worker' : 'worker', done)}, try ${item.tries}). ${outcome}.`];
    if (prepared) lines.push(`Work loop: ${prepared.how}.`);
    if (judged.ran) lines.push(judged.why ? `Work loop check (${KINDS[run.loop.kind]?.name ?? run.loop.kind}): not passed. ${judged.why}` : `Work loop check (${KINDS[run.loop.kind]?.name ?? run.loop.kind}): passed.`);
    if (item.note) lines.push(item.note);
    if (check && !check.ok) lines.push(`Command: ${item.check}\n${check.output.slice(-1200)}`);
    if (done.text) lines.push(`Worker's report: ${done.text.replace(/\s+\n/g, '\n').slice(0, 700)}`);
    if (pausedNote) lines.push(pausedNote);
    return lines.join('\n');
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
    const failed = run.checkResults.filter((result) => !result.ok);
    return [
      `Step ${run.steps}: overall commands. ${failed.length === 0 ? 'All passed.' : `${failed.length} of ${results.length} failed.`}`,
      ...run.checkResults.map((result) => `- ${result.ok ? 'passed' : 'FAILED'}: ${result.command}${result.ok ? '' : `\n${result.output.slice(-800)}`}`),
      run.items.length > before ? `Added ${run.items.length - before} item${run.items.length - before === 1 ? '' : 's'} to fix what failed.` : '',
    ].filter((part) => part !== '').join('\n');
  };

  const doReview = async (id, run, parent, signal, hunt = false) => {
    let changes = '';
    try {
      const points = pointsOf(run.root);
      const start = await points.idOf(run.checkpoint);
      changes = start ? await points.changes(start, 40000) : '';
    } catch {
      changes = '';
    }
    const last = run.reviews + 1 >= run.limits.maxReviews;
    const prompt = reviewPrompt({ goal: run.goal, list: checklist(run), checks: run.checkResults.map((result) => `${result.ok ? 'passed' : 'FAILED'}: ${result.command}${result.ok ? '' : `\n${result.output.slice(-600)}`}`).join('\n'), changes, last: isLong(run) ? false : last, notes: lapNotes(run), hunt, context: run.long?.context ?? '' });
    let done;
    let review;
    let answered = false;
    try {
      done = await helper({ parent, role: 'review', root: run.root, label: 'Mission: reviewer', prompt, signal, reader: 'the reviewer' });
      answered = true;
      review = jsonOf(done.text);
    } catch (error) {
      if (signal.aborted) throw error;
      done = { text: String(error?.message ?? error), model: '?', from: 'conversation', ms: 0 };
    }
    if (!review && answered) review = await asJson(done.text, 'review', (parsed) => typeof parsed?.verdict === 'string', parent, run, signal);
    keep(run, `review-${run.reviews + 1}`, done.text);
    const before = { items: run.items.length, open: tally(run).open };
    applyReview(run, review);
    dropCommands(run);
    const now = tally(run);
    record(run, { kind: 'review', role: 'review', model: done.model, ms: done.ms, verdict: review?.verdict ?? null, reopened: now.open - before.open, added: run.items.length - before.items });
    const lapLine = isLong(run) ? ` Lap ${run.long.lap} of at most ${run.long.laps} done${hunt ? (now.open > 0 ? '; it found weak spots to work on' : '; it found nothing more to do') : ''}.` : '';
    return [
      `Step ${run.steps}: ${hunt ? 'extra lap: looking for weak spots' : 'review'} (${modelLine('reviewer', done)}). ${now.open > 0 ? `${now.open} item${now.open === 1 ? '' : 's'} to work on again.` : 'Nothing sent back.'}${lapLine}`,
      run.reviewNote,
      '',
      checklist(run),
    ].filter((part) => part !== '').join('\n');
  };

  const end = (id, run, agent, reason = '') => {
    finish(run, reason);
    const text = report(run);
    try {
      save(run);
      writeFileSync(join(dirOf(run), 'report.md'), `${text}\n`);
      record(run, { kind: 'finish', status: run.status, tally: tally(run) });
      // A Recon run leaves no line outside its folder (its goal would be there).
      if (finishedFile && !noCommands(run)) {
        mkdirSync(dirname(finishedFile), { recursive: true });
        appendFileSync(finishedFile, `${JSON.stringify({ at: new Date().toISOString(), id: run.id, conversation: id, folder: run.root, goal: run.goal.slice(0, 300), mode: run.mode, status: run.status, steps: run.steps, minutes: Math.round((run.endedAt - run.startedAt) / 60000), tally: tally(run), log: join(dirOf(run), 'log.jsonl') })}\n`);
      }
    } catch (error) {
      warn(`could not write the report: ${String(error?.message ?? error)}`);
    }
    // The app's goal ends with the run, so no further round is started.
    try {
      const goal = goalRef(agent);
      if (goal && goal.view.phase !== 'complete') goalsOf().complete(agent, goal.ref);
    } catch (error) {
      warn(`could not close the goal: ${String(error?.message ?? error)}`);
    }
    emit('finished', id, run, { summary: text.split('\n')[0] });
    return text;
  };

  /** Said with every final report: the run is over, and the conversation's model is not to carry its work on by itself. */
  const OVER = 'The run is over. After giving the report, stop: do not carry on its work yourself and do not start other research or runs, unless the user asks you to.';
  /** Why a Long run ended, for its report. */
  const LONG_ENDS = { time: 'its time was up', laps: 'it reached its lap limit', empty: `two laps in a row found nothing more to do`, asked: 'you asked it to finish the lap', allowance: 'it used its token allowance' };

  const describe = (run) => {
    const next = nextStep(run);
    if (next.kind === 'review' && next.hunt) return 'an extra lap: looking for weak spots';
    if (next.kind === 'work') return `item ${next.item.id}, "${next.item.title}"`;
    return { plan: 'the plan', checks: 'the overall commands', review: 'the review', finish: 'the final report' }[next.kind] ?? 'the next step';
  };

  /** One step from start to end. It never throws: what went wrong is part of what it returns. */
  const work = async (agent, run, step) => {
    const id = agent.id;
    const signal = step.stopper.signal;
    try {
      const next = nextStep(run);
      let text;
      if (next.kind === 'finish' && next.why && isLong(run)) run.longEnd = LONG_ENDS[next.why] ?? '';
      if (next.kind === 'plan') text = await doPlan(id, run, agent, signal);
      else if (next.kind === 'work') text = await doWork(id, run, next.item, agent, signal, step);
      else if (next.kind === 'checks') text = await doChecks(id, run, signal);
      else if (next.kind === 'review') text = await doReview(id, run, agent, signal, next.hunt === true);
      else return `This was the last step. Give the user this report in full:\n\n${end(id, run, agent)}\n\n${OVER}`;
      run.errors = 0;
      run.stalled = '';
      run.selfStops = 0;
      save(run);
      emit('step', id, run, { step: run.steps, what: next.kind, ...(isLong(run) ? { lap: run.long.lap } : {}) });
      const after = nextStep(run);
      if (after.kind === 'finish' && after.why && isLong(run)) run.longEnd = LONG_ENDS[after.why] ?? '';
      if (after.kind === 'finish') return `${text}\n\nThe work is through. This is the final report; give it to the user in full:\n\n${end(id, run, agent)}\n\n${OVER}`;
      const ahead = { work: `Next: item ${after.item?.id}, "${after.item?.title}".`, checks: 'Next: the overall commands.', review: 'Next: the review.', plan: 'Next: the plan.' }[after.kind] ?? '';
      return `${text}\n\n${ahead} The run goes on in the next round.`;
    } catch (error) {
      // A Recon run ended (End and wipe) while this step ran: its folder is being deleted, so nothing is
      // written there again (review finding 5).
      const gone = noCommands(run) && run.status !== 'running';
      try {
        if (!gone) save(run);
      } catch {
        /* the run on disk is one step behind */
      }
      if (signal.aborted) {
        if (!gone) record(run, { kind: 'interrupted' });
        // Ended by the user (End, /mission end): not "taken again on resume".
        if (run.status !== 'running') return `The user ended the run while this step was under way. Give the user its report:\n\n${report(run)}\n\n${OVER}`;
        return 'The step was stopped before it finished. Nothing is lost: the run takes this step again when it is resumed (/mission resume).';
      }
      const reason = String(error?.message ?? error).slice(0, 300);
      record(run, { kind: 'error', error: reason });
      warn(`a step failed: ${reason}`);
      // The same step failing three times running will not get better by itself.
      run.errors = (run.errors ?? 0) + 1;
      if (run.errors >= 3) return `The same step failed three times (${reason}), so the run is closed. Give the user this report in full:\n\n${end(id, run, agent, `A step failed three times: ${reason}`)}\n\n${OVER}`;
      save(run);
      return `This step did not work: ${reason}\nThe run goes on with the next round and tries the step again. If it keeps failing, the user can end the run with /mission end.`;
    }
  };

  const api = {
    runOf,
    /** @returns {boolean} whether the conversation has a run that is still going. */
    isOn: (id) => runOf(id)?.status === 'running',
    /** @returns {boolean} whether the run is paused: the user stopped it, so the conversation's model is free to talk and work. */
    paused: (agent) => {
      const goal = goalRef(agent);
      return !goal || goal.view.phase !== 'active';
    },
    /** The step under way in a conversation; the guard notes here what had to be set aside. */
    stepOf: (id) => steps.get(id),
    /** @returns {string} what the conversation's own model is told while a run is on; '' otherwise. */
    note: (id, viaProgram = false) => {
      const run = runOf(id);
      return run?.status === 'running' ? conductorNote(run, viaProgram) : '';
    },

    /**
     * Start a run in a conversation that has a mode on.
     * @param {object} agent - the conversation's agent.
     * @param {string} goal - what the user asked for.
     * @param {{mode: string, root: string}} entry - the conversation's mode and folder.
     * @returns {Promise<string>} what to tell the user.
     */
    async start(agent, goal, entry, options = {}) {
      const goals = goalsOf();
      if (!goals) throw new Error('This version of the app has no goal service, so a run cannot be kept going.');
      if (runOf(agent.id)?.status === 'running') throw new Error('A mission run is already on in this conversation. /mission stop pauses it, /mission end closes it with a report.');
      const before = goalRef(agent);
      if (before && before.view.phase !== 'complete') throw new Error('This conversation already has a goal of its own. Clear it first with /goal clear, then start the mission.');
      const point = await pointsOf(entry.root).take('Mission start');
      const now = settings();
      const id = `${new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '')}-${Math.random().toString(36).slice(2, 6)}`;
      const run = newRun({ id, goal, mode: MODE_LABELS[entry.mode], root: entry.root, limits: now.limits, checkpoint: point.number, ...(options.kind === 'long' ? { kind: 'long', long: options.long } : {}) });
      // The work loop (plan steps S3 to S5): only when Ultra Code or the tab's switch put it on.
      if (options.loop && typeof options.loop === 'object') run.loop = { ...options.loop, opened: [] };
      save(run);
      runs.set(agent.id, run);
      if (!noCommands(run)) writeIndex(agent.id, { root: run.root, id: run.id });
      record(run, { kind: 'start', goal: run.goal, mode: run.mode, limits: run.limits });
      emit('started', agent.id, run);
      goals.create(agent, { objective: `Mission run ${run.id}: ${run.goal}\n\nIn each round call the ${STEP_TOOL} tool once and tell the user what the step did. The run ends when ${STEP_TOOL} returns the final report.`, maxGoalRounds: GOAL_ROUNDS });
      const routes = ROLES.map((role) => [role, routeFor(agent, role, run.root)]);
      const names = [...new Set(routes.map(([, route]) => route?.model ?? 'the conversation\'s model'))];
      // Said first, because it decides how much memory the run needs.
      const roles = helperPolicy(agent) === 'same'
        ? `one model for everything (${names[0]}). To use different models for the roles, switch the models chip in the chat box before starting.`
        : names.length === 1
          ? `one model for everything (${names[0]}): the roles are set to different models, but all of them come to this one.`
          : `${names.length} different models: ${routes.map(([role, route]) => `${ROLE_NAMES[role]} ${route?.model ?? 'the conversation\'s model'}`).join(', ')}. They may be loaded at the same time.`;
      const loopSaid = run.loop ? `\n${loopLine(run).replace(/ Checks by the loop: .*$/, '')}` : '';
      if (isLong(run)) return `Long run started (${run.mode}), ${names.length === 1 ? 'one model' : `${names.length} models`}. It runs by itself now, for at most ${run.long.minutes} minutes and ${run.long.laps} laps; /mission stop pauses it.\nGoal: ${run.goal}\nModels: ${roles}${loopSaid}\nTo undo everything it changes: /mission back ${run.checkpoint}`;
      return `Mission started (${run.mode}), ${names.length === 1 ? 'one model' : `${names.length} models`}. It runs by itself now; /mission stop pauses it.\nGoal: ${run.goal}\nModels: ${roles}${loopSaid}\nLimits: ${run.limits.maxItems} items, ${run.limits.maxTries} tries per item, ${run.limits.maxReviews} review${run.limits.maxReviews === 1 ? '' : 's'}, ${run.limits.maxSteps} steps.\nTo undo everything it changes: /mission back ${run.checkpoint}`;
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
      if (!run) return 'No mission run is on in this conversation. The user starts one with /mission followed by the goal.';
      if (run.status !== 'running') return `The mission run has ended.\n\n${report(run)}\n\n${OVER}`;
      let step = steps.get(id);
      if (!step) {
        const stopper = new AbortController();
        step = { asides: [], stopper, startedAt: Date.now(), what: describe(run), done: false, text: '' };
        steps.set(id, step);
        step.promise = work(agent, run, step).then((text) => {
          step.done = true;
          step.text = text;
          return text;
        });
      }
      const current = step;
      let timer;
      let onAbort;
      const outcome = await Promise.race([
        current.promise.then(() => 'done'),
        new Promise((resolve) => { timer = setTimeout(() => resolve('wait'), waitMs); timer.unref?.(); }),
        new Promise((resolve) => { onAbort = () => resolve('cut'); if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, { once: true }); }),
      ]);
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      if (outcome === 'done') {
        if (steps.get(id) === current) steps.delete(id);
        return current.text;
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
      if (!run || run.status !== 'running' || steps.has(id)) return false;
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
      run.stalled = `Paused: the conversation's model did not call ${STEP_TOOL} for ${IDLE_ROUNDS} rounds in a row, so the run could not move. /mission resume tries again; another model for the conversation may do better.`;
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
    hold(agent, reason) {
      const run = runOf(agent.id);
      if (!run || run.status !== 'running') return false;
      const goal = goalRef(agent);
      if (goal && goal.view.phase === 'active') {
        try {
          goalsOf().pause(agent, goal.ref);
        } catch (error) {
          warn(`could not pause the run: ${String(error?.message ?? error)}`);
          return false;
        }
      }
      // As with /mission stop: the step under way stops, and is taken again on resume.
      steps.get(agent.id)?.stopper?.abort(new Error('Stopped.'));
      run.stalled = `Paused: ${reason}`;
      save(run);
      record(run, { kind: 'held', reason });
      emit('paused', agent.id, run, { reason });
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
      const under = steps.get(id);
      return {
        id: run.id, kind: isLong(run) ? 'long' : 'mission', status: run.status, goal: run.goal.slice(0, 600), mode: run.mode,
        items: run.items.map((item) => ({ id: item.id, title: item.title, status: item.status, check: item.check, note: item.note.slice(0, 300) })),
        checks: run.checkResults.map((result) => ({ command: result.command, ok: result.ok })),
        steps: run.steps, working: under && !under.done ? under.what : '', stalled: run.stalled ?? '',
        startedAt: run.startedAt, endedAt: run.endedAt, minutesUsed: Math.round(((run.endedAt || now) - run.startedAt) / 60000), tokens: run.tokens ?? 0,
        ...(isLong(run) ? { lap: run.long.lap, laps: run.long.laps, minutes: run.long.minutes, deadline: run.long.deadline, fullTime: run.long.fullTime, finishLap: run.long.finishLap, undone: run.long.undone.length } : {}),
        report: run.status === 'running' ? '' : report(run),
        reportFile: run.status === 'running' ? '' : join(dirOf(run), 'report.md'),
      };
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
          const run = runs.get(id) ?? JSON.parse(readFileSync(join(where.root, OWN_FOLDER, 'runs', where.id, 'run.json'), 'utf8'));
          if (run?.status === 'running') out.push({ conversation: id, run });
        } catch { /* a run whose folder is gone */ }
      }
      return out;
    },
    /** The watchdog tried a run again (its goal re-armed): written in the run's log. */
    retried(id, tries) {
      const run = runOf(id);
      if (!run || run.status !== 'running') return;
      run.stalled = '';
      save(run);
      record(run, { kind: 'retried', tries });
      emit('retried', id, run, { tries });
    },
    /** Tell listeners of a run found interrupted at start (once per app start). */
    announceInterrupted(conversation, run) {
      emit('stopped-by-itself', conversation, run, { why: 'restart' });
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
        ? 'Waiting: the app restarted, and it never carries on with work by itself. Resume it (/mission resume, or Resume on its card) or end it.'
        : 'Stopped by itself: the app stopped giving this run rounds (a model request failed after the app\'s own retries, or a reply hit its length limit).';
      run.selfStops = (run.selfStops ?? 0) + 1;
      save(run);
      record(run, { kind: 'stopped-by-itself', why });
      emit('stopped-by-itself', agent.id, run, { why });
      return run;
    },
    /** Long run: let the lap under way end, then report (Finish this lap). @returns {string} what to tell the user. */
    /**
     * A message you sent while a Long run works (step 64): its helpers read it from their next step on.
     * @returns {boolean} whether a running Long run kept it.
     */
    ask(id, text) {
      const run = runOf(id);
      if (!run || !addAsk(run, text)) return false;
      record(run, { kind: 'ask', text: String(text).slice(0, 500) });
      save(run);
      return true;
    },
    finishLap(agent) {
      const run = runOf(agent.id);
      if (!run || run.status !== 'running' || !isLong(run)) return 'No long run is on.';
      run.long.finishLap = true;
      save(run);
      record(run, { kind: 'finish-lap' });
      return `The long run finishes the lap under way (lap ${run.long.lap + 1}), then writes its report.`;
    },
    /** End the step under way, and its helpers, without pausing the run. */
    cut(id) {
      steps.get(id)?.stopper?.abort(new Error('Stopped.'));
    },
    /** Pause the run: no further rounds start. */
    stop(agent) {
      const run = runOf(agent.id);
      if (!run || run.status !== 'running') return 'No mission run is on.';
      const goal = goalRef(agent);
      if (goal && goal.view.phase === 'active') goalsOf().pause(agent, goal.ref);
      // The step under way stops with the run; it is taken again on resume.
      steps.get(agent.id)?.stopper?.abort(new Error('Stopped.'));
      record(run, { kind: 'paused' });
      emit('paused', agent.id, run, { reason: 'you' });
      return `Mission paused after step ${run.steps}. /mission resume carries on, /mission end closes it with a report.\n\n${checklist(run)}`;
    },
    /** Let a paused run carry on. */
    resume(agent) {
      const run = runOf(agent.id);
      if (!run) return 'No mission run is waiting to carry on.';
      // A Long run that ended in a Read Only tab gave the tab back its level: it is not taken up again (review finding 6).
      if (run.status !== 'running' && isLong(run) && run.long?.restore) return `That Long run has ended, and this tab is Read Only again. Start a new one from the Depth list.\n\n${report(run)}`;
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
      idle.set(agent.id, 0);
      record(run, { kind: 'resumed', reopened: again });
      return `Mission carries on from step ${run.steps + 1}${again > 0 ? `, with ${again} item${again === 1 ? '' : 's'} taken up again` : ''}.\n\n${checklist(run)}`;
    },
    /** Close the run now, with a report of how far it got. */
    end(agent) {
      const run = runOf(agent.id);
      if (!run) return 'No mission run was started in this conversation.';
      if (run.status !== 'running') return report(run);
      steps.get(agent.id)?.stopper?.abort(new Error('Stopped.'));
      steps.delete(agent.id);
      return end(agent.id, run, agent, 'You ended it.');
    },
    /** How the run stands. */
    status(agent) {
      const run = runOf(agent.id);
      if (!run) return '';
      if (run.status !== 'running') return report(run);
      const now = tally(run);
      const under = steps.get(agent.id);
      return `Mission run on: step ${run.steps}, ${now.verified + now.reviewed} of ${now.total} items done.${under && !under.done ? ` Working on ${under.what}.` : ''}${run.stalled ? `\n${run.stalled}` : ''}\nGoal: ${run.goal}\n\n${checklist(run)}\n\nLog: ${join(dirOf(run), 'log.jsonl')}`;
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
    /** Whether a run's folder exists; for tests. */
    has: (run) => existsSync(join(dirOf(run), 'run.json')),
  };
  return api;
}
