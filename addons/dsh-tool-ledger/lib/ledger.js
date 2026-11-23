/**
 * Tool ledger, the parts that need no app: the shape of a line, how a call's outcome is read from the app's
 * result, the loaded-set difference, the monthly files (append, prune, erase, clear), the four suggestion
 * views and the table export. Kept apart from the plugin so it can be tested without the app.
 *
 * One JSON line per event in $DSH_HOME/tool-ledger/YYYY-MM.jsonl. Two kinds:
 *   call    {kind:'call', t, sid?, parent?, ws?, tab?, space?, preset?, mission?:{runId, role}, tool, family, state, loaded,
 *            via, outcome, rule?, by?, ms?, size?}
 *   loaded  {kind:'loaded', t, sid?, parent?, ws?, tab?, space?, preset?, mission?, full?:[names], added?:[names], removed?:[names]}
 * `tab` is the thread's mode id (the name is from before spaces); `space` (item 4A: chat, code, devices, recon, workshop)
 * is the thread's space, next to it. Lines from before spaces have no `space` and stay valid.
 * A line never holds what a tool was given or what it gave back. Lines of a deleted conversation lose sid, parent
 * and ws and get a random `g` instead, so they still count but no longer point at the conversation.
 */
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { isStateOnlyMiss } from './families.js';

export const OUTCOMES = ['ran', 'error', 'refused', 'asked', 'allowed', 'denied', 'parked'];
export const VIAS = ['direct', 'tools_find', 'access-request', 'program'];
export const STATES = ['on', 'ask', 'off', 'locked', 'unknown'];
/** Outcomes a note from another add-on may give. */
export const NOTE_OUTCOMES = ['refused', 'parked', 'asked', 'allowed', 'denied'];
/** Tools that are the machinery of loading and asking, left out of "loaded but never used". */
export const MACHINERY = ['tools_find', 'tools_catalog', 'request_tool_access', 'exit_plan_mode'];

const FILE = /^(\d{4})-(\d{2})\.jsonl$/;
/** At most this many lines wait in memory for the next write; past it the oldest are dropped (a full disk must not fill memory). */
export const BUFFER_MAX = 5000;

/** A name, cut to size and stripped of anything that is not a name character. */
export function cleanName(value, max = 128) {
  const text = String(value ?? '').slice(0, max);
  return /^[\w.:@/-]+$/.test(text) ? text : text.replace(/[^\w.:@/-]/g, '_');
}

/** A short id (session, workspace, run), or undefined. */
function cleanId(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const text = String(value).slice(0, 200);
  return text ? text : undefined;
}

/**
 * The line for one tool call. Only the fields listed are kept, whatever else is passed in, so arguments and
 * results can never reach the file by accident.
 * @param {object} fields - see the file comment.
 * @returns {object} the line.
 */
export function callRow(fields) {
  const row = { kind: 'call', t: new Date(fields.t ?? Date.now()).toISOString() };
  for (const key of ['sid', 'parent', 'ws', 'tab', 'space', 'preset']) {
    const value = cleanId(fields[key]);
    if (value !== undefined) row[key] = value;
  }
  const mission = missionOf(fields.mission);
  if (mission) row.mission = mission;
  row.tool = cleanName(fields.tool) || 'unknown';
  row.family = cleanName(fields.family ?? 'other', 40);
  row.state = STATES.includes(fields.state) ? fields.state : 'unknown';
  if (typeof fields.loaded === 'boolean') row.loaded = fields.loaded;
  row.via = VIAS.includes(fields.via) ? fields.via : 'direct';
  row.outcome = OUTCOMES.includes(fields.outcome) ? fields.outcome : 'error';
  if (fields.rule) row.rule = cleanName(fields.rule, 60);
  if (fields.by) row.by = cleanName(fields.by, 40);
  if (Number.isFinite(fields.ms) && fields.ms >= 0) row.ms = Math.round(fields.ms);
  if (Number.isFinite(fields.size) && fields.size >= 0) row.size = Math.round(fields.size);
  return row;
}

/**
 * The line for a change of a conversation's loaded tools.
 * @param {object} fields - t, sid, parent, ws, tab, space, preset, mission, and full or added/removed name lists.
 * @returns {object} the line.
 */
export function loadedRow(fields) {
  const row = { kind: 'loaded', t: new Date(fields.t ?? Date.now()).toISOString() };
  for (const key of ['sid', 'parent', 'ws', 'tab', 'space', 'preset']) {
    const value = cleanId(fields[key]);
    if (value !== undefined) row[key] = value;
  }
  const mission = missionOf(fields.mission);
  if (mission) row.mission = mission;
  for (const key of ['full', 'added', 'removed']) if (Array.isArray(fields[key])) row[key] = fields[key].slice(0, 2000).map((name) => cleanName(name));
  return row;
}

/** A Mission place as {runId, role}, or undefined. */
export function missionOf(value) {
  if (!value || typeof value !== 'object') return undefined;
  const runId = cleanId(value.runId);
  if (!runId) return undefined;
  return { runId, role: cleanName(value.role ?? 'run', 30) };
}

/**
 * What the loaded set of a conversation did, from the names it had before and has now.
 * @param {Set<string> | undefined} before - the names last seen, or undefined the first time.
 * @param {string[]} now - the names now.
 * @returns {{full?: string[], added?: string[], removed?: string[]} | null} null when nothing changed.
 */
export function loadedDiff(before, now) {
  const next = [...new Set(now.map(String))].sort();
  if (!before) return { full: next };
  const added = next.filter((name) => !before.has(name));
  const nextSet = new Set(next);
  const removed = [...before].filter((name) => !nextSet.has(name)).sort();
  if (added.length === 0 && removed.length === 0) return null;
  return { ...(added.length ? { added } : {}), ...(removed.length ? { removed } : {}) };
}

/**
 * The outcome of one call from what the app reported.
 * @param {object} seen - what this add-on saw of the call: {gate: 'allow'|'deny'|'ask'|'cancel'|undefined, dispatched: boolean}.
 * @param {object} result - the app's final result ({isError, error: {message, info: {name, code}}}).
 * @returns {{outcome: string, rule?: string}} the outcome, and the rule when the app names it.
 */
export function outcomeOf(seen, result) {
  const info = result?.error?.info ?? {};
  const code = String(info.code ?? '');
  const isError = result?.isError === true;
  const asked = seen?.gate === 'ask';
  // A tool that is not on offer still passes pre-execute and the execute waterfall; the app only finds out
  // inside the body (ToolNotFoundError), so this comes before the "it ran" branch.
  if (code === 'UNKNOWN_TOOL') return { outcome: 'refused', rule: 'not-offered' };
  if (seen?.dispatched) {
    if (asked) return isError ? { outcome: 'allowed', rule: 'error-after-yes' } : { outcome: 'allowed' };
    if (isError && (code === 'ABORTED' || code === 'ABORTED_BEFORE_DISPATCH')) return { outcome: 'error', rule: 'stopped' };
    return { outcome: isError ? 'error' : 'ran' };
  }
  // Not dispatched: something stopped it first.
  if (code === 'APPROVAL_REJECTED') return { outcome: 'denied', rule: 'approval' };
  if (code === 'APPROVAL_CANCELLED') return { outcome: 'denied', rule: 'approval-cancelled' };
  if (code === 'APPROVAL_UNAVAILABLE') return { outcome: 'parked', rule: 'no-approval-channel' };
  if (code === 'ABORTED' || code === 'ABORTED_BEFORE_DISPATCH') return { outcome: 'error', rule: 'stopped' };
  if (!isError) return { outcome: 'ran' };
  if (seen?.gate === undefined) return { outcome: 'refused', rule: 'executor' };
  return { outcome: 'refused', rule: 'unknown' };
}

/** Characters of text a result gave back (its text blocks only; pictures count 0). */
export function sizeOf(result) {
  const blocks = Array.isArray(result?.content) ? result.content : [];
  let total = 0;
  for (const block of blocks) if (block && block.type === 'text' && typeof block.text === 'string') total += block.text.length;
  return total;
}

/** Local month key YYYY-MM of a moment. */
export function monthOf(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** First moment after a month (local), in ms. */
function monthEnd(key) {
  const [, y, m] = /^(\d{4})-(\d{2})$/.exec(key) ?? [];
  return new Date(Number(y), Number(m), 1).getTime();
}

/** Where a range starts, in ms: '30d', '6m' or 'all'. */
export function rangeStart(range, now = Date.now()) {
  if (range === '30d') return now - 30 * 86_400_000;
  if (range === '6m') {
    const date = new Date(now);
    date.setMonth(date.getMonth() - 6);
    return date.getTime();
  }
  return 0;
}

/**
 * The monthly files.
 * @param {{dir: string, now?: () => number, warn?: (text: string) => void}} options - the folder, a clock, a log line.
 * @returns {object} the store.
 */
export function createStore({ dir, now = Date.now, warn = () => {} }) {
  let buffer = [];
  let dropped = 0;

  const months = () => {
    try {
      return readdirSync(dir).filter((name) => FILE.test(name)).sort();
    } catch {
      return [];
    }
  };

  /** Keep a line for the next write. */
  function append(row) {
    buffer.push(row);
    if (buffer.length > BUFFER_MAX) {
      dropped += buffer.length - BUFFER_MAX;
      buffer = buffer.slice(-BUFFER_MAX);
    }
  }

  /** Write the waiting lines, each to its month's file. Lines that could not be written stay for the next try. */
  function flush() {
    if (buffer.length === 0) return 0;
    const waiting = buffer;
    buffer = [];
    const byMonth = new Map();
    for (const row of waiting) {
      const key = monthOf(row.t);
      if (!byMonth.has(key)) byMonth.set(key, []);
      byMonth.get(key).push(row);
    }
    let written = 0;
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (error) {
      warn(`could not make ${dir}: ${error?.message ?? error}`);
    }
    for (const [key, rows] of byMonth) {
      try {
        appendFileSync(join(dir, `${key}.jsonl`), rows.map((row) => JSON.stringify(row)).join('\n') + '\n', { mode: 0o600 });
        written += rows.length;
      } catch (error) {
        warn(`could not write ${key}.jsonl: ${error?.message ?? error}`);
        for (const row of rows) append(row);
      }
    }
    if (dropped > 0) {
      warn(`${dropped} lines were dropped because they could not be written in time`);
      dropped = 0;
    }
    return written;
  }

  /** Every line of one file; a damaged line is skipped, never the whole file. */
  function readFile(name) {
    let text;
    try {
      text = readFileSync(join(dir, name), 'utf8');
    } catch {
      return [];
    }
    const out = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row && typeof row === 'object' && typeof row.t === 'string') out.push(row);
      } catch {
        // one damaged line is skipped
      }
    }
    return out;
  }

  /**
   * Lines between two moments (the waiting ones too).
   * @param {{from?: number, to?: number}} [range] - ms; both ends included.
   * @returns {object[]} lines, oldest first.
   */
  function read({ from = 0, to = Infinity } = {}) {
    flush();
    const out = [];
    for (const name of months()) {
      const key = name.slice(0, 7);
      if (monthEnd(key) <= from) continue;
      const [y, m] = key.split('-').map(Number);
      if (new Date(y, m - 1, 1).getTime() > to) continue;
      for (const row of readFile(name)) {
        const at = Date.parse(row.t);
        if (Number.isFinite(at) && at >= from && at <= to) out.push(row);
      }
    }
    return out.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  }

  /** Write a file whole, safely: a new file beside it, then moved over it. */
  function replace(name, rows) {
    const file = join(dir, name);
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, rows.length ? rows.map((row) => JSON.stringify(row)).join('\n') + '\n' : '', { mode: 0o600 });
    renameSync(temp, file);
  }

  /**
   * Drop the files of months that ended more than `keepDays` ago.
   * @param {number} keepDays - how long lines are kept.
   * @returns {string[]} the files removed.
   */
  function prune(keepDays) {
    const days = Math.max(30, Math.min(3650, Math.floor(Number(keepDays) || 365)));
    const cutoff = now() - days * 86_400_000;
    const gone = [];
    for (const name of months()) {
      if (monthEnd(name.slice(0, 7)) > cutoff) continue;
      try {
        unlinkSync(join(dir, name));
        gone.push(name);
      } catch (error) {
        warn(`could not remove ${name}: ${error?.message ?? error}`);
      }
    }
    return gone;
  }

  /**
   * Take the link to deleted conversations out of their lines: sid, parent and ws go, a random group id stays,
   * so the lines still count. Only files that change are rewritten.
   * @param {string[]} ids - the conversations deleted for good.
   * @returns {number} how many lines changed.
   */
  function erase(ids) {
    const gone = new Set((ids ?? []).map(String).filter(Boolean));
    if (gone.size === 0) return 0;
    flush();
    const groups = new Map();
    const groupOf = (key) => {
      if (!groups.has(key)) groups.set(key, `g${randomBytes(6).toString('hex')}`);
      return groups.get(key);
    };
    const scrub = (row) => {
      const top = gone.has(row.parent) ? row.parent : gone.has(row.sid) ? row.sid : undefined;
      if (top === undefined) return row;
      const { sid: _sid, parent: _parent, ws: _ws, ...rest } = row;
      return { ...rest, g: groupOf(`${top}\u0000${gone.has(row.parent) ? row.sid ?? '' : ''}`) };
    };
    let changed = 0;
    // Ids as they appear in a line; a month whose text holds none of them is neither parsed nor rewritten.
    const needles = [...gone].map((id) => JSON.stringify(id));
    for (const name of months()) {
      let text;
      try {
        text = readFileSync(join(dir, name), 'utf8');
      } catch {
        continue;
      }
      if (!needles.some((needle) => text.includes(needle))) continue;
      const rows = readFile(name);
      let here = 0;
      const next = rows.map((row) => {
        const out = scrub(row);
        if (out !== row) here += 1;
        return out;
      });
      if (here === 0) continue;
      try {
        replace(name, next);
        changed += here;
      } catch (error) {
        warn(`could not rewrite ${name}: ${error?.message ?? error}`);
      }
    }
    return changed;
  }

  /** Remove every line (Start fresh). @returns {number} files removed. */
  function clear() {
    buffer = [];
    let count = 0;
    for (const name of months()) {
      try {
        unlinkSync(join(dir, name));
        count += 1;
      } catch (error) {
        warn(`could not remove ${name}: ${error?.message ?? error}`);
      }
    }
    return count;
  }

  return { append, flush, read, prune, erase, clear, months, waiting: () => buffer.length };
}

// ---- the suggestion views ----

/** Thresholds for the views; small on purpose so a short test period already shows something. */
export const LIMITS = { asked: 2, loaded: 3, reserve: 3, reserveShare: 0.5, top: 50 };

const keyOf = (row) => row.sid ?? row.g ?? '';
const tabOf = (row) => row.tab ?? 'unknown';
/** A request for a tool (request_tool_access): a line about the tool asked for, not a call of it. */
export const isRequest = (row) => row.via === 'access-request';
/** A real call that reached the tool or its question: a request, even a granted one, is not a use. */
const used = (row) => !isRequest(row) && (row.outcome === 'ran' || row.outcome === 'error' || row.outcome === 'allowed');
/** Answers to a request that say nothing about the tool being off: it was on already, it was the request tool, or no such tool. */
export const REQUEST_NOT_OFF = ['already', 'self', 'unknown'];

/**
 * The rule key the page words: a request's answer code gets its own `request:` key, so it never clashes with the
 * pipeline's own rules ('unknown' there means another add-on refused a call; here it means no such tool). A request
 * answered 'off' while Tool access was off (state unknown) is told apart from a tool switched Off in the tab.
 * @param {object} row - a call line.
 * @returns {string} the key.
 */
export function ruleKeyOf(row) {
  const rule = row.rule ?? 'unknown';
  if (!isRequest(row)) return rule;
  if (rule === 'off' && row.state !== 'off') return 'request:access-off';
  return `request:${rule}`;
}

/** Every answer code a request for a tool can get (dsh-modes access.js decide() and toolaccess.js ask()), as ruleKeyOf gives them. */
export const REQUEST_RULES = ['unknown', 'self', 'tools-off', 'locked', 'never', 'addon-off', 'recon-limit', 'already', 'off', 'access-off', 'fenced', 'dont-ask', 'denied-recently', 'unanswered-recently', 'too-many-noes', 'helper-limit', 'recon-export', 'too-many', 'unattended', 'cancelled', 'timeout', 'unavailable', 'denied', 'error', 'parked', 'once-only', 'not-asked'].map((code) => `request:${code}`);

/**
 * Totals, the four suggestion views and the table per tool, from the lines of a range.
 * @param {object[]} rows - lines, any order.
 * @param {object} [limits] - thresholds (LIMITS).
 * @returns {object} {totals, askedButOff, loadedNeverUsed, reserveAlwaysCalled, refusedMost, tools}
 */
export function summarize(rows, limits = LIMITS) {
  const lim = { ...LIMITS, ...limits };
  const calls = rows.filter((row) => row.kind === 'call');
  const loaded = rows.filter((row) => row.kind === 'loaded');

  const realCalls = calls.filter((row) => !isRequest(row));
  const totals = { calls: realCalls.length, requests: calls.length - realCalls.length, conversations: new Set(rows.filter((row) => !row.parent).map(keyOf).filter(Boolean)).size, helpers: new Set(rows.filter((row) => row.parent).map(keyOf).filter(Boolean)).size, tools: new Set(realCalls.map((row) => row.tool)).size };
  for (const outcome of OUTCOMES) totals[outcome] = 0;
  for (const row of realCalls) totals[row.outcome] = (totals[row.outcome] ?? 0) + 1;

  // Asked for often but off: requests for a tool, calls refused while it was Off or Locked, calls of a tool the tab does not offer.
  const asked = new Map();
  for (const row of calls) {
    const off = row.state === 'off' || row.state === 'locked';
    // A tool that is only on offer in a certain state (Mission's step tool outside a run) is expected to be missing then.
    if (isStateOnlyMiss(row)) continue;
    if (isRequest(row) ? REQUEST_NOT_OFF.includes(row.rule) : !((off && row.outcome !== 'ran') || row.rule === 'not-offered')) continue;
    const key = `${tabOf(row)}\u0000${row.tool}`;
    const entry = asked.get(key) ?? { tool: row.tool, tab: tabOf(row), family: row.family, count: 0, allowed: 0, denied: 0, state: row.state };
    entry.count += 1;
    if (row.outcome === 'allowed') entry.allowed += 1;
    if (row.outcome === 'denied' || row.outcome === 'refused' || row.outcome === 'parked') entry.denied += 1;
    entry.state = row.state;
    asked.set(key, entry);
  }
  const askedButOff = [...asked.values()].filter((entry) => entry.count >= lim.asked).sort((a, b) => b.count - a.count).slice(0, lim.top);

  // Loaded but never used: tools a conversation had on offer, never called in that tab in this range.
  const loadedIn = new Map(); // tab\0tool -> Set(conversation)
  for (const row of loaded) {
    for (const name of [...(row.full ?? []), ...(row.added ?? [])]) {
      if (MACHINERY.includes(name)) continue;
      const key = `${tabOf(row)}\u0000${name}`;
      if (!loadedIn.has(key)) loadedIn.set(key, new Set());
      loadedIn.get(key).add(keyOf(row));
    }
  }
  const usedIn = new Set(calls.filter(used).map((row) => `${tabOf(row)}\u0000${row.tool}`));
  const loadedNeverUsed = [...loadedIn.entries()]
    .filter(([key, set]) => set.size >= lim.loaded && !usedIn.has(key))
    .map(([key, set]) => {
      const [tab, tool] = key.split('\u0000');
      return { tool, tab, conversations: set.size };
    })
    .sort((a, b) => b.conversations - a.conversations || a.tool.localeCompare(b.tool))
    .slice(0, lim.top * 4);

  // Held in reserve but always called: brought in from the reserve in at least half of a tab's conversations.
  const tabConversations = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    if (!tabConversations.has(tabOf(row))) tabConversations.set(tabOf(row), new Set());
    tabConversations.get(tabOf(row)).add(key);
  }
  const fromReserve = new Map();
  for (const row of calls) {
    if (row.loaded !== false || row.via === 'program' || !used(row)) continue;
    const key = `${tabOf(row)}\u0000${row.tool}`;
    if (!fromReserve.has(key)) fromReserve.set(key, { tool: row.tool, tab: tabOf(row), family: row.family, set: new Set(), calls: 0 });
    const entry = fromReserve.get(key);
    entry.calls += 1;
    if (keyOf(row)) entry.set.add(keyOf(row));
  }
  const reserveAlwaysCalled = [...fromReserve.values()]
    .map((entry) => {
      const of = tabConversations.get(entry.tab)?.size ?? 0;
      return { tool: entry.tool, tab: entry.tab, family: entry.family, conversations: entry.set.size, of, share: of ? entry.set.size / of : 0, calls: entry.calls };
    })
    .filter((entry) => entry.conversations >= lim.reserve && entry.share >= lim.reserveShare)
    .sort((a, b) => b.share - a.share || b.conversations - a.conversations)
    .slice(0, lim.top);

  // Refused most: refusals, no answers and denials, by rule.
  const refused = new Map();
  for (const row of calls) {
    if (!['refused', 'denied', 'parked'].includes(row.outcome)) continue;
    if (isStateOnlyMiss(row)) continue;
    const rule = ruleKeyOf(row);
    const key = `${tabOf(row)}\u0000${row.tool}\u0000${rule}`;
    const entry = refused.get(key) ?? { tool: row.tool, tab: tabOf(row), rule, by: row.by, outcome: row.outcome, count: 0 };
    entry.count += 1;
    refused.set(key, entry);
  }
  const refusedMost = [...refused.values()].sort((a, b) => b.count - a.count).slice(0, lim.top);

  // The table: one row per tool, with counts per tab and outcome.
  const tools = new Map();
  for (const row of realCalls) {
    const entry = tools.get(row.tool) ?? { tool: row.tool, family: row.family, total: 0, ms: 0, size: 0, outcomes: {}, tabs: {} };
    entry.total += 1;
    entry.ms += row.ms ?? 0;
    entry.size += row.size ?? 0;
    entry.outcomes[row.outcome] = (entry.outcomes[row.outcome] ?? 0) + 1;
    const tab = (entry.tabs[tabOf(row)] ??= { total: 0, outcomes: {} });
    tab.total += 1;
    tab.outcomes[row.outcome] = (tab.outcomes[row.outcome] ?? 0) + 1;
    tools.set(row.tool, entry);
  }
  return {
    totals,
    askedButOff,
    loadedNeverUsed,
    reserveAlwaysCalled,
    refusedMost,
    tools: [...tools.values()].sort((a, b) => b.total - a.total || a.tool.localeCompare(b.tool)),
  };
}

// ---- export ----

export const CSV_COLUMNS = ['t', 'kind', 'sid', 'parent', 'g', 'ws', 'tab', 'space', 'preset', 'mission_run', 'mission_role', 'tool', 'family', 'state', 'loaded', 'via', 'outcome', 'rule', 'by', 'ms', 'size', 'full', 'added', 'removed'];

/** One CSV cell: quoted when needed; a cell that a spreadsheet would read as a formula starts with a quote mark. */
function cell(value) {
  if (value === undefined || value === null) return '';
  let text = Array.isArray(value) ? value.join(' ') : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The lines as a CSV table with a header row (the columns above). */
export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    const flat = { ...row, mission_run: row.mission?.runId, mission_role: row.mission?.role };
    lines.push(CSV_COLUMNS.map((column) => cell(flat[column])).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}
