/**
 * Stage E (point 6, 20 November 2026): the repair helper. Whenever the Mission's helpers cannot do their work (empty
 * answers, helpers that keep failing, a step that keeps failing, an item that ended NOT FINISHED, a check that cannot
 * run, a tool that keeps failing), a repair helper starts, looks for the cause and fixes what it may: the Mission's own
 * settings, and files inside its folder after a save point. What needs the user (a Budget guard limit, Calls at once, a
 * fallback model, any other setting) is asked in the Mission's card, as When it needs you says. Owner point 19: a setting
 * named exactly (its id in the settings list and a valid new value, lib/settings-fix.js) is changed after your Allow.
 *
 * Bounded: at most REPAIRS_PER_CAUSE repairs for one cause (one for one item), REPAIRS_MAX in one Mission (counted again
 * after a continue), never a repair of a repair, and it never gives the Mission more access.
 *
 * Kept in run.long.repair: {epoch, pending: cause | null, working, count, tries: {key: n}, list: [entry], heldBy}.
 * Pure, so it is tested without the app.
 */
import { KINDS } from './loop.js';
import { addItem, alwaysPasses, helpersOf, noChecks, noCommands } from './run.js';

/** At most this many repairs in one Mission (a continue starts the count again). */
export const REPAIRS_MAX = 6;
/** At most this many repairs for the same cause; one for one item (stuck, or its check could not run). */
export const REPAIRS_PER_CAUSE = 2;
/** Failed results in a row of the same tool, for a Mission's helpers, before a repair is asked. */
export const TOOL_FAILS = 4;
/** The repairs a run keeps in its list. */
export const REPAIRS_KEPT = 20;
/** The kinds of fix the repair helper may make by itself. */
export const OWN_KINDS = Object.freeze(['effort', 'split', 'check', 'recipe', 'retry', 'fewer', 'note']);
/** The kinds it may only ask the user for. */
export const ASK_KINDS = Object.freeze(['calls', 'model', 'setting']);

const line = (value, max = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * The cause in plain words (said after "why").
 * @param {{kind: string, item?: string, tool?: string, command?: string}} cause
 * @returns {string}
 */
export function causeWords(cause) {
  const kind = String(cause?.kind ?? '');
  if (kind === 'empty') return 'helpers came back with empty answers';
  if (kind === 'failing') return '3 helpers in a row could not do their work';
  if (kind === 'errors') return 'the same step failed 3 times in a row';
  if (kind === 'stuck') return `item ${cause.item} was not finished after all its tries`;
  if (kind === 'check') return cause.item ? `the check of item ${cause.item} could not run` : 'an overall check could not run';
  if (kind === 'tool') return `the tool ${line(cause.tool, 80)} kept failing`;
  return 'its helpers could not do their work';
}

/** @returns {string} the key the bounds count by: the kind and what it is about. */
export function causeKey(cause) {
  const kind = String(cause?.kind ?? '');
  const about = cause?.item ? `item:${cause.item}` : cause?.tool ? `tool:${line(cause.tool, 80)}` : cause?.command ? `command:${line(cause.command, 200)}` : '';
  return about ? `${kind}:${about}` : kind;
}

/** @returns {number} the repairs one cause may get. */
export const perCause = (cause) => (cause?.item && (cause.kind === 'stuck' || cause.kind === 'check') ? 1 : REPAIRS_PER_CAUSE);

/**
 * Whether a check result says the check could not run at all (a program that is not there or cannot be started), not
 * that it ran and failed. Devices' closed ports are a rule, never a broken check.
 * @param {{ok?: boolean, code?: number | null, output?: string}} result - the check's result.
 * @returns {boolean}
 */
export function cannotRun(result) {
  if (!result || result.ok) return false;
  const output = String(result.output ?? '');
  if (/device ports closed|keeps the Mac's device ports closed/i.test(output)) return false;
  if (result.code === 126 || result.code === 127) return true;
  return /command not found|: not found\s*$|cannot execute|exec format error|bad interpreter/im.test(output);
}

/**
 * The run's repair state, made when missing; a new epoch (a continue) starts the counts again (the list stays).
 * @param {object} run - a Mission; changed in place.
 * @param {number} epoch - how often it was continued.
 * @returns {object} run.long.repair.
 */
export function repairOf(run, epoch = 0) {
  const L = run.long;
  if (!L.repair || typeof L.repair !== 'object') L.repair = { epoch, pending: null, working: false, count: 0, tries: {}, list: [], heldBy: '' };
  const R = L.repair;
  if (!Array.isArray(R.list)) R.list = [];
  if (!R.tries || typeof R.tries !== 'object') R.tries = {};
  if (R.epoch !== epoch) {
    R.epoch = epoch;
    R.count = 0;
    R.tries = {};
    R.pending = null;
    R.working = false;
  }
  return R;
}

/**
 * Ask for a repair.
 * @param {object} run - a Mission; changed in place.
 * @param {object} cause - {kind, item?, tool?, command?, evidence?, hold?}.
 * @param {number} [epoch] - the run's epoch.
 * @returns {'asked' | 'busy' | 'spent'} asked: it runs next; busy: one is pending or working (nothing else is done);
 *   spent: its bounds are reached (what happened before stage E follows).
 */
export function requestRepair(run, cause, epoch = 0) {
  const R = repairOf(run, epoch);
  if (R.pending || R.working) return 'busy';
  if (R.count >= REPAIRS_MAX) return 'spent';
  if ((Number(R.tries[causeKey(cause)]) || 0) >= perCause(cause)) return 'spent';
  R.pending = {
    kind: String(cause.kind ?? ''), key: causeKey(cause), text: causeWords(cause),
    ...(cause.item ? { item: String(cause.item) } : {}), ...(cause.tool ? { tool: line(cause.tool, 80) } : {}), ...(cause.command ? { command: line(cause.command, 400) } : {}),
    evidence: String(cause.evidence ?? '').slice(0, 4000),
    ...(cause.hold ? { hold: { reason: line(cause.hold.reason, 600), details: String(cause.hold.details ?? '').slice(0, 600) } } : {}),
  };
  return 'asked';
}

/** Words that would give the Mission more access: such an ask is refused and listed, never asked. */
export const ACCESS_ASK = /permission|sandbox|access level|tool access|\btools?\b|internet|network|web access|\bkeys?\b|secret|token|password|preset|outside the folder|full disk|keychain|devices?' rules|recon'?s? rules|danger/i;

/**
 * The repair helper's answer: {cause, fixed, own: [≤4], ask: [≤2]}, checked.
 * @param {unknown} parsed - the JSON it answered with.
 * @returns {{cause: string, fixed: boolean, own: object[], ask: object[]} | null}
 */
export function readRepair(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (!('own' in parsed) && !('ask' in parsed) && !('fixed' in parsed) && !('cause' in parsed)) return null;
  const own = (Array.isArray(parsed.own) ? parsed.own : []).filter((fix) => fix && typeof fix === 'object' && OWN_KINDS.includes(fix.kind)).slice(0, 4);
  const ask = (Array.isArray(parsed.ask) ? parsed.ask : []).filter((fix) => fix && typeof fix === 'object' && ASK_KINDS.includes(fix.kind)).slice(0, 2);
  return { cause: line(parsed.cause, 400), fixed: parsed.fixed === true, own, ask };
}

/** @returns {string} a fix as a key (the same fix as last time for the same cause counts as nothing). */
export const fixKey = (fix) => JSON.stringify(fix ?? {});

/**
 * Make the repair helper's own fixes on the run (the Mission's own settings, never another add-on's or the app's).
 * @param {object} run - a Mission; changed in place.
 * @param {object[]} own - its fixes.
 * @param {{cause?: object, checked?: Map<string, object>, last?: Set<string>, id?: string, kinds?: object}} [ctx] - the cause;
 *   the result of each new check, run once by the runner (a check that was not run is refused); the fixes made for
 *   this cause before; the repair's id (item.repaired).
 * @returns {{said: string[], refused: string[], touched: string[], made: string[]}} touched: the items a fix changed.
 */
export function applyOwn(run, own, { cause = {}, checked = new Map(), last = new Set(), id = '', kinds = KINDS } = {}) {
  const L = run.long;
  const out = { said: [], refused: [], touched: [], made: [] };
  const itemOf = (ref) => run.items.find((item) => item.id === String(ref ?? '').replace(/^item\s*/i, '').trim());
  for (const fix of Array.isArray(own) ? own : []) {
    const key = fixKey(fix);
    if (last.has(key)) continue;
    const before = out.said.length;
    if (fix.kind === 'effort') {
      const on = fix.to === 'on';
      if ((L.effort === true) !== on) {
        L.effort = on;
        out.said.push(on ? 'Think by role is on for this Mission now.' : 'Think by role is off for this Mission now: its helpers use the tier\'s thinking level.');
      }
    } else if (fix.kind === 'split') {
      const item = itemOf(fix.item ?? cause.item);
      const parts = (Array.isArray(fix.into) ? fix.into : []).filter((part) => part && typeof part === 'object' && line(part.title, 120)).slice(0, 4);
      const cap = run.limits.itemCap ?? run.limits.maxItems * 2;
      if (!item || !['open', 'stuck'].includes(item.status) || parts.length < 2) out.refused.push('A split needs an item that is not done and 2 to 4 parts.');
      else if (run.items.length + parts.length - 1 > cap) out.refused.push(`Item ${item.id} could not be split: the checklist is full.`);
      else {
        const checkOf = (part) => {
          const given = noChecks(run) ? '' : line(part.check, 400);
          return alwaysPasses(given) ? '' : given;
        };
        const [first, ...rest] = parts;
        item.title = line(first.title, 120);
        item.doneWhen = line(first.done_when ?? first.doneWhen, 300);
        item.detail = line(first.detail ?? '', 600) || item.detail;
        item.check = checkOf(first);
        item.status = 'open';
        item.tries = Math.max(0, (run.limits.maxTries ?? 1) - 1);
        item.repaired = id;
        item.note = 'The repair helper split this item.';
        const ids = [item.id];
        let previous = item.id;
        for (const part of rest) {
          const added = addItem(run, { title: part.title, detail: part.detail, done_when: part.done_when ?? part.doneWhen, check: checkOf(part) }, 'repair');
          if (!added) break;
          added.after = [previous];
          added.repaired = id;
          previous = added.id;
          ids.push(added.id);
        }
        // Review of stage E: items that waited for the split item now wait for its last part (the scheduler reads only
        // `after`, with one helper too), so none starts before every part is done.
        if (ids.length > 1) {
          for (const other of run.items) {
            if (ids.includes(other.id) || !Array.isArray(other.after) || !other.after.map(String).includes(item.id)) continue;
            other.after = [...new Set(other.after.map((ref) => (String(ref) === item.id ? previous : String(ref))))];
          }
        }
        out.touched.push(...ids);
        out.said.push(`Item ${item.id} is split into items ${ids.join(', ')}.`);
      }
    } else if (fix.kind === 'check') {
      const given = typeof fix.check === 'string' ? line(fix.check, 400) : undefined;
      const overall = fix.overall === true || typeof fix.overall === 'string' || (!fix.item && !cause.item && cause.command);
      if (noChecks(run) || noCommands(run)) out.refused.push('This Mission runs no checks, so no check was changed.');
      else if (given === undefined) out.refused.push('A check fix needs the new check (or empty).');
      else if (given && alwaysPasses(given)) out.refused.push(`Not used: ${given} passes whatever was done.`);
      else if (overall) {
        const old = typeof fix.overall === 'string' ? line(fix.overall, 400) : line(cause.command, 400);
        const at = run.checks.indexOf(old);
        if (!given) {
          if (at < 0) out.refused.push('No such overall check to take out.');
          else {
            run.checks.splice(at, 1);
            run.checkResults = (run.checkResults ?? []).filter((result) => result.command !== old);
            out.said.push(`An overall check was taken out: ${old}`);
          }
        } else {
          const ran = checked.get(given);
          if (!ran || cannotRun(ran)) out.refused.push(`Not used: ${given} ${ran ? 'could not run either' : 'could not be tried'}.`);
          else {
            if (at >= 0) run.checks[at] = given;
            else if (run.checks.length < 6) run.checks.push(given);
            run.checkResults = (run.checkResults ?? []).filter((result) => result.command !== old);
            out.said.push(`An overall check is now: ${given}`);
          }
        }
      } else {
        const item = itemOf(fix.item ?? cause.item);
        // Review of stage E: only an item that is still being worked on (open or stuck); never one that waits for you,
        // was set aside or skipped, and never one that is done.
        if (!item || !['open', 'stuck'].includes(item.status)) out.refused.push(item && ['parked', 'aside', 'skipped'].includes(item.status) ? `Item ${item.id} waits for the user or was set aside, so its check was not changed.` : 'A check fix needs an item that is not done.');
        else if (!given) {
          item.check = '';
          item.repaired = id;
          if (item.status === 'stuck') {
            item.status = 'open';
            item.tries = Math.max(0, (run.limits.maxTries ?? 1) - 1);
          }
          out.touched.push(item.id);
          out.said.push(`Item ${item.id} has no check now: the reviewer judges it.`);
        } else {
          const ran = checked.get(given);
          if (!ran || cannotRun(ran)) out.refused.push(`Not used: ${given} ${ran ? 'could not run either' : 'could not be tried'}; the reviewer judges item ${item.id}.`);
          else {
            item.check = given;
            item.repaired = id;
            item.maybeInverted = false;
            if (ran.ok) {
              // An item no helper has worked on yet is judged by the reviewer, not counted done by its check alone.
              const tried = (Number(item.tries) || 0) > 0 || Boolean(item.report);
              item.status = tried ? 'verified' : 'unverified';
              item.note = tried ? 'Its new check passed.' : 'Its new check passed before any helper worked on it; the reviewer judges it.';
            } else {
              // The broken check cost a try: it is given back.
              item.status = 'open';
              item.tries = Math.max(0, Math.min((item.tries ?? 0) - 1, (run.limits.maxTries ?? 1) - 1));
            }
            out.touched.push(item.id);
            out.said.push(`Item ${item.id}'s check is now: ${given}`);
          }
        }
      }
    } else if (fix.kind === 'recipe') {
      const kind = String(fix.to ?? fix.recipe ?? fix.kindOf ?? fix.name ?? '');
      if (!run.loop || !kinds[kind]) out.refused.push('A recipe can be changed only while the work loop is on, to a kind of work Mission knows.');
      else if (run.loop.kind !== kind) {
        run.loop.kind = kind;
        out.said.push(`It works with the recipe "${kinds[kind].name}" now.`);
      }
    } else if (fix.kind === 'retry') {
      const minutes = Math.round(Number(fix.minutes));
      if (!Number.isFinite(minutes) || minutes < 1 || minutes > 30) out.refused.push('A retry time is 1 to 30 minutes.');
      else {
        L.retryAfterMs = minutes * 60_000;
        out.said.push(`Items wait ${minutes} minute${minutes === 1 ? '' : 's'} before they are tried again.`);
      }
    } else if (fix.kind === 'fewer') {
      const now = Math.min(helpersOf(run), Number(L.helpersCap) > 0 ? Number(L.helpersCap) : helpersOf(run));
      const helpers = Math.round(Number(fix.helpers));
      if (!Number.isFinite(helpers) || helpers < 1 || helpers >= now) out.refused.push('Fewer helpers means at least 1 and fewer than now.');
      else {
        L.helpersCap = helpers;
        out.said.push(`It works with ${helpers} helper${helpers === 1 ? '' : 's'} at once now (it was ${now}).`);
      }
    } else if (fix.kind === 'note') {
      const text = line(fix.text, 400);
      if (text) {
        L.repairNote = text;
        out.said.push(`Told the helpers: ${text}`);
      }
    }
    if (out.said.length > before) out.made.push(key);
  }
  return out;
}

/**
 * An ask of the repair helper that would give the Mission more access: refused, never asked.
 * @param {object} ask - {kind, where?, change?, why?}.
 * @returns {boolean}
 */
export function widensAccess(ask) {
  if (!ask || ask.kind !== 'setting') return false;
  return ACCESS_ASK.test(`${line(ask.where, 200)} ${line(ask.change, 300)} ${line(ask.field ?? ask.setting ?? ask.id, 200)}`);
}
