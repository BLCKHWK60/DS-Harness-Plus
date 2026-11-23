/**
 * Host half of the Tool ledger.
 *
 * Writes one line per tool event, in every conversation, tab and helper, and for the calls made inside programs
 * (PTC `run_code`: the app sends each call a program makes through the same tool pipeline under its own name).
 * A line says when, which conversation, tab, preset and Mission helper, which tool and family, the tool's state
 * then (On, Ask, Off, Locked), whether it was loaded or came from the reserve and how, what happened, which rule
 * refused it, how long it took and how many characters came back. A second kind of line records a change of a
 * conversation's loaded tools. What a tool was given and what it gave back are never stored.
 *
 * How the app is read (0.2.2-rc.2, dsh-tools/lib/types/pipeline.js):
 *   tools/pre-execute  waterfall; this add-on's listener is put first (outermost), so it sees the final gate
 *                      (allow, deny, ask, cancel) after every other add-on's listener.
 *   tools/execute      waterfall around the tool's body: reached only when the call really runs.
 *   tools/result       the final result of every call, nested ones included (`exec.parent` set for those).
 *   request/header     session event with the tools the model is offered (`data.header.tools`), written when it changes.
 * Guards (`tools.guard`) give only a reason, so their refusals are 'refused' with rule 'unknown' unless the add-on
 * that refused says why through `toolLedger.note()` (Modes does).
 */
import z from '@deepseek-ai/schemastery';
import { NOTE_OUTCOMES, callRow, cleanName, createStore, loadedDiff, loadedRow, missionOf, outcomeOf, rangeStart, sizeOf, summarize, toCsv } from './lib/ledger.js';
import { familyOf as copyFamilyOf, loadFamilyOf } from './lib/families.js';

export const name = 'tool-ledger';
export const inject = ['tools'];

export const Config = z.object({
  /** Record tool use. Off: nothing new is written; what was recorded stays. */
  enabled: z.boolean().default(true).volatile(),
  /** How many days records are kept (30 to 3650). Older months are removed at start and once a day. */
  keepDays: z.number().min(30).max(3650).default(365).volatile(),
});

export const BASE = '/dsh-tool-ledger';
const FLUSH_MS = 2000;
const DAY_MS = 86_400_000;
/**
 * A note from another add-on that does not name its call (no `exec`) waits this long for the call it is about;
 * then it is written on its own. Much longer than any batch: the app sends a refused call's result only after the
 * slower calls made before it in the same step have finished (dsh-tools batch.js, results in the model's order).
 */
const NOTE_WAIT_MS = 30 * 60_000;
/** Within this long after tools_find or an access request, tools that appear count as brought by it. */
const ORIGIN_WINDOW_MS = 15 * 60_000;
const MAX_SESSIONS = 1000;
const MAX_NOTES = 500;
const PLACE_TTL_MS = 10_000;
const STATE_TTL_MS = 60_000;

/** Unwrap a Config value that may be a reactive reference. */
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

/** The parent conversation of a helper, from the app's session header. */
function parentOf(header) {
  const raw = header?.parentSession;
  const id = raw && typeof raw === 'object' ? raw.id ?? raw.sessionId : raw;
  return typeof id === 'string' && id ? id : undefined;
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const enabled = () => plain(config.enabled) !== false;
  const keepDays = () => {
    const days = Number(plain(config.keepDays));
    return Number.isFinite(days) ? Math.max(30, Math.min(3650, Math.floor(days))) : 365;
  };
  const warned = new Set();
  const warn = (text) => {
    const key = String(text).slice(0, 60);
    if (warned.has(key)) return;
    warned.add(key);
    ctx.logger?.warn?.(`tool-ledger: ${text}`);
  };

  const dir = String(ctx.get('dshHomePath')?.('tool-ledger') ?? '');
  if (!dir || !dir.startsWith('/')) {
    warn('no dsh home folder was available, so nothing is recorded');
    return;
  }
  const store = createStore({ dir, warn });

  let familyOf = copyFamilyOf;
  void loadFamilyOf().then((reader) => { familyOf = reader; }, () => {});

  // ---- what is known about each conversation ----
  /** sid -> {initial?: Set, current?: Set, origin: Map(name -> via), findAt, accessAt, touched} */
  const sessions = new Map();
  const sessionState = (sid) => {
    let state = sessions.get(sid);
    if (!state) {
      state = { origin: new Map(), findAt: 0, accessAt: 0, touched: 0 };
      sessions.set(sid, state);
      if (sessions.size > MAX_SESSIONS) {
        const oldest = [...sessions.entries()].sort((a, b) => a[1].touched - b[1].touched).slice(0, sessions.size - MAX_SESSIONS);
        for (const [id] of oldest) sessions.delete(id);
      }
    }
    state.touched = Date.now();
    return state;
  };

  /** The preset of a conversation (Standard, PTC, Minimal, Creator or the user's own), or undefined. */
  const presetOf = (session) => {
    try {
      const presets = ctx.get('agentPresets');
      const value = session && presets?.presetForSession ? presets.presetForSession(session) : undefined;
      const id = typeof value === 'string' ? value : value?.id ?? value?.presetId ?? value?.preset?.id ?? value?.preset;
      return typeof id === 'string' && id ? id : undefined;
    } catch {
      return undefined;
    }
  };
  /** The project of a working folder: the workspace whose folder holds it. */
  const workspaceOf = (cwd) => {
    if (typeof cwd !== 'string' || !cwd) return undefined;
    try {
      let best;
      for (const item of ctx.get('workspaceRegistry')?.list?.() ?? []) {
        const path = String(item?.path ?? '');
        if (!path || !(cwd === path || cwd.startsWith(`${path}/`))) continue;
        if (!best || path.length > String(best.path).length) best = item;
      }
      return best?.id !== undefined ? String(best.id) : undefined;
    } catch {
      return undefined;
    }
  };
  /** Mission's helper or conductor place of a conversation (dsh-mission's service; optional). */
  const missionPlace = (sid) => {
    try {
      const mission = ctx.get('mission');
      const helper = missionOf(mission?.helperOf?.(sid));
      if (helper) return helper;
      const run = mission?.runOf?.(sid);
      return missionOf(run && typeof run === 'object' ? { runId: run.runId, role: 'conductor' } : undefined);
    } catch {
      return undefined;
    }
  };
  const places = new Map();
  /**
   * Where a call or a change happened.
   * @param {string} sid - the agent (a conversation or a helper).
   * @param {object} [session] - its session, when at hand.
   * @returns {{sid, parent, ws, tab, space, preset, mission}} the place.
   */
  const placeOf = (sid, session) => {
    if (!sid) return {};
    const cached = places.get(sid);
    if (cached && Date.now() - cached.at < PLACE_TTL_MS) return cached.place;
    let place = { sid };
    try {
      const own = session ?? ctx.get('agents')?.get?.(sid)?.session ?? ctx.get('sessions')?.get?.(sid);
      const header = own?.header ?? own ?? {};
      const parent = parentOf(header);
      let tab;
      try {
        tab = ctx.get('modes')?.get?.(sid);
      } catch {
        tab = undefined;
      }
      if (!tab && parent) {
        try {
          tab = ctx.get('modes')?.get?.(parent);
        } catch {
          tab = undefined;
        }
      }
      // Item 4A: the thread's space next to its mode (a helper reports its thread's); none from a Modes without spaces.
      let space;
      try {
        space = ctx.get('modes')?.spaces?.of?.(sid);
      } catch {
        space = undefined;
      }
      place = { sid, parent, ws: workspaceOf(header?.cwd), tab: typeof tab === 'string' ? tab : undefined, space: typeof space === 'string' && space ? space : undefined, preset: presetOf(own), mission: missionPlace(sid) };
    } catch {
      // a place we cannot read is still recorded by its id
    }
    places.set(sid, { at: Date.now(), place });
    if (places.size > MAX_SESSIONS) places.delete(places.keys().next().value);
    return place;
  };

  const stateCache = new Map();
  /** A tool's state in a tab now: on, ask, off, locked; unknown while Tool access is off or not there. */
  const stateFor = (tab, tool) => {
    try {
      const access = ctx.get('toolAccess');
      if (!access || !tab || access.enabled?.() !== true) return 'unknown';
      let cached = stateCache.get(tab);
      if (!cached || Date.now() - cached.at > STATE_TTL_MS) {
        const map = new Map();
        for (const row of access.toolsOf?.(tab) ?? []) if (row?.name) map.set(row.name, row.state);
        cached = { at: Date.now(), map };
        stateCache.set(tab, cached);
      }
      const state = cached.map.get(tool);
      return ['on', 'ask', 'off', 'locked'].includes(state) ? state : 'unknown';
    } catch {
      return 'unknown';
    }
  };

  /** The names the agent had on offer at the moment of a call (for calls the add-on has no loaded set for). */
  const visible = new WeakMap();
  const visibleHas = (exec, tool) => {
    try {
      const key = exec.toolSet ?? exec.agent;
      if (!key || typeof key !== 'object') return undefined;
      let names = visible.get(key);
      if (!names) {
        names = new Set((ctx.tools?.definitions?.(exec.agent, exec.toolSet) ?? []).map((definition) => definition?.name));
        visible.set(key, names);
      }
      return names.has(tool);
    } catch {
      return undefined;
    }
  };

  // ---- notes from other add-ons ----
  const notes = new Map(); // sid\0tool -> [{outcome, rule, by, at, via, exact?}]
  /** exec -> its note: a note that names its call joins exactly that call, never another one. */
  const execNotes = new WeakMap();
  let noteCount = 0;
  const writeNote = (sid, tool, entry) => {
    const place = placeOf(sid);
    const st = sid ? sessions.get(sid) : undefined;
    store.append(callRow({
      t: entry.at,
      ...place,
      tool,
      family: familyOf(tool),
      state: stateFor(place.tab, tool),
      loaded: st?.initial ? st.initial.has(tool) && !st.origin.has(tool) : undefined,
      via: entry.via === 'access-request' ? 'access-request' : 'direct',
      outcome: entry.outcome,
      rule: entry.rule,
      by: entry.by,
    }));
  };
  /**
   * Another add-on refused, parked or asked about a tool and says why. Optional for every caller; never throws.
   * @param {{sessionId: string, tool: string, outcome: string, rule?: string, by?: string, via?: string, exec?: object}} event - what
   *   happened; `exec` is the app's call the note is about (a guard's or a pre-execute listener's argument), so the note
   *   joins that call whenever its result comes.
   * @returns {boolean} true when it was taken.
   */
  function note(event) {
    try {
      if (!event || typeof event !== 'object' || !enabled()) return false;
      const tool = cleanName(event.tool);
      if (!tool) return false;
      const sid = typeof event.sessionId === 'string' ? event.sessionId.slice(0, 200) : '';
      const entry = {
        outcome: NOTE_OUTCOMES.includes(event.outcome) ? event.outcome : 'refused',
        rule: event.rule ? cleanName(event.rule, 60) : undefined,
        by: event.by ? cleanName(event.by, 40) : undefined,
        via: event.via === 'access-request' ? 'access-request' : undefined,
        at: Date.now(),
      };
      // An access request is its own event (the tool asked for is not being called): written at once.
      if (entry.via === 'access-request') {
        writeNote(sid, tool, entry);
        return true;
      }
      const exec = event.exec && typeof event.exec === 'object' ? event.exec : undefined;
      if (exec && execNotes.has(exec)) return true; // the first rule that refused a call is the one kept
      if (noteCount >= MAX_NOTES) return false;
      const key = `${sid}\u0000${tool}`;
      if (exec) {
        entry.exact = true;
        entry.key = key;
        execNotes.set(exec, entry);
      }
      if (!notes.has(key)) notes.set(key, []);
      notes.get(key).push(entry);
      noteCount += 1;
      return true;
    } catch {
      return false;
    }
  }
  const dropNote = (key, entry) => {
    const list = notes.get(key);
    const at = list ? list.indexOf(entry) : -1;
    if (at < 0) return;
    list.splice(at, 1);
    noteCount -= 1;
    if (list.length === 0) notes.delete(key);
  };
  /**
   * The note about one call: the one that names this very call, else the oldest note of the same conversation and
   * tool that names no call. A note that names another call is never taken here.
   */
  const takeNote = (exec, sid, tool) => {
    const own = exec && typeof exec === 'object' ? execNotes.get(exec) : undefined;
    if (own) {
      execNotes.delete(exec);
      dropNote(own.key, own);
      return own;
    }
    const key = `${sid ?? ''}\u0000${tool}`;
    const entry = notes.get(key)?.find((one) => !one.exact);
    if (entry) dropNote(key, entry);
    return entry;
  };
  /** Notes nobody's call claimed in time are written on their own. */
  const sweepNotes = () => {
    const cutoff = Date.now() - NOTE_WAIT_MS;
    for (const [key, list] of [...notes]) {
      const [sid, tool] = key.split('\u0000');
      while (list.length > 0 && list[0].at <= cutoff) {
        const entry = list.shift();
        noteCount -= 1;
        entry.written = true;
        writeNote(sid, tool, entry);
      }
      if (list.length === 0) notes.delete(key);
    }
  };

  // ---- the tool pipeline ----
  /** exec -> {start, gate, dispatched, dispatchAt} */
  const seen = new WeakMap();
  // First in line (prepend), so `next()` returns the gate every other add-on agreed on.
  ctx.on('tools/pre-execute', async (exec, next) => {
    let mark;
    try {
      mark = { start: Date.now() };
      if (exec && typeof exec === 'object') seen.set(exec, mark);
    } catch {
      mark = undefined;
    }
    const decision = await next();
    try {
      if (mark) mark.gate = typeof decision?.kind === 'string' ? decision.kind : undefined;
    } catch {
      // nothing to note
    }
    return decision;
  }, true);
  ctx.on('tools/execute', (exec, next) => {
    try {
      if (exec && typeof exec === 'object') {
        const mark = seen.get(exec) ?? {};
        mark.dispatched = true;
        mark.dispatchAt = Date.now();
        seen.set(exec, mark);
      }
    } catch {
      // nothing to note
    }
    return next();
  }, true);

  /**
   * One finished call (also one refused before it ran): its line.
   * @param {object} exec - the app's frozen call.
   * @param {object} result - the app's final result.
   */
  function recordCall(exec, result) {
    const end = Date.now();
    const tool = cleanName(exec?.name);
    const sid = typeof exec?.agent?.id === 'string' ? exec.agent.id : undefined;
    const nested = exec?.parent !== undefined;
    const st = sid ? sessionState(sid) : undefined;
    if (st && !nested && result?.isError !== true) {
      if (tool === 'tools_find') st.findAt = end;
      if (tool === 'request_tool_access') st.accessAt = end;
    }
    const mark = seen.get(exec);
    let { outcome, rule } = outcomeOf(mark, result);
    let by;
    // A note that names this call is taken in any case, so it is never written as a second line.
    const own = execNotes.has(exec) ? takeNote(exec, sid, tool) : undefined;
    // Its note was already written on its own (the result came after the long wait): one line is enough.
    if (own?.written) return;
    if (!mark?.dispatched) {
      const noted = own ?? takeNote(undefined, sid, tool);
      if (noted) {
        outcome = noted.outcome;
        rule = noted.rule ?? rule;
        by = noted.by;
      }
    }
    const place = placeOf(sid, exec?.agent?.session);
    const origin = st?.origin.get(tool);
    let loaded;
    if (nested) loaded = visibleHas(exec, tool);
    else if (st?.initial) loaded = !st.origin.has(tool) && st.initial.has(tool);
    else loaded = visibleHas(exec, tool);
    const from = mark?.dispatchAt ?? mark?.start;
    store.append(callRow({
      t: end,
      ...place,
      tool,
      family: familyOf(tool),
      state: stateFor(place.tab, tool),
      loaded,
      via: nested ? 'program' : origin === 'tools_find' || origin === 'access-request' ? origin : 'direct',
      outcome,
      rule,
      by,
      ms: from ? end - from : undefined,
      size: sizeOf(result),
    }));
  }
  ctx.on('tools/result', (exec, result) => {
    try {
      if (enabled()) recordCall(exec, result);
    } catch (error) {
      warn(`a tool call could not be recorded: ${error?.message ?? error}`);
    }
  });

  // ---- the loaded tool set ----
  const startedAt = Date.now();
  /**
   * A model request's tool list (`request/header`): a 'loaded' line when the set changed.
   * @param {object} session - the app's session.
   * @param {string[]} names - the tool names on offer.
   * @param {number} at - when.
   */
  function recordLoaded(session, names, at) {
    const sid = String(session.id);
    const st = sessionState(sid);
    const diff = loadedDiff(st.current, names);
    if (!diff) return;
    if (diff.added) {
      const via = at - st.findAt < ORIGIN_WINDOW_MS ? 'tools_find' : at - st.accessAt < ORIGIN_WINDOW_MS ? 'access-request' : 'auto';
      for (const added of diff.added) st.origin.set(added, via);
      if (via === 'tools_find') st.findAt = 0;
      if (via === 'access-request') st.accessAt = 0;
    }
    if (!st.initial) st.initial = new Set(names);
    st.current = new Set(names);
    store.append(loadedRow({ t: at, ...placeOf(sid, session), ...diff }));
  }
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'request/header' || !session?.id || !enabled()) return;
      // An event from before this start is history being loaded, not something happening now.
      const at = event.time ? new Date(event.time).getTime() : Date.now();
      if (Number.isFinite(at) && at < startedAt - 5000) return;
      const tools = event.data?.header?.tools;
      const names = Array.isArray(tools) ? tools.map((tool) => tool?.name).filter((value) => typeof value === 'string') : [];
      recordLoaded(session, names, Number.isFinite(at) ? at : Date.now());
    } catch (error) {
      warn(`a change of loaded tools could not be recorded: ${error?.message ?? error}`);
    }
  });
  ctx.on('agent/disposed', (...args) => {
    try {
      const payload = args.find((arg) => arg && typeof arg === 'object');
      const id = payload?.agent?.id ?? payload?.id;
      if (id) places.delete(String(id));
    } catch {
      // nothing to forget
    }
  });

  // ---- writing, keeping, removing ----
  const flush = () => {
    try {
      sweepNotes();
      store.flush();
    } catch (error) {
      warn(`could not write: ${error?.message ?? error}`);
    }
  };
  const prune = () => {
    try {
      const gone = store.prune(keepDays());
      if (gone.length > 0) ctx.logger?.info?.(`tool-ledger: removed ${gone.length} month(s) older than ${keepDays()} days`);
    } catch (error) {
      warn(`could not remove old months: ${error?.message ?? error}`);
    }
  };
  prune();
  ctx.effect(() => {
    const writer = setInterval(flush, FLUSH_MS);
    writer.unref?.();
    const daily = setInterval(prune, DAY_MS);
    daily.unref?.();
    return () => {
      clearInterval(writer);
      clearInterval(daily);
      flush();
    };
  }, 'tool-ledger: writer');

  // Conversations deleted for good: their lines stay for the counts, without the link to the conversation.
  ctx.inject(['coworkTrash'], (inner) => {
    try {
      inner.effect(() => inner.coworkTrash.onErased((ids) => {
        const list = (Array.isArray(ids) ? ids : []).map(String);
        const gone = new Set(list);
        for (const id of list) {
          sessions.delete(id);
          places.delete(id);
        }
        // Notes still waiting for those conversations are dropped, so no line with their link is written later.
        for (const [key, waiting] of [...notes]) {
          if (!gone.has(key.split('\u0000')[0])) continue;
          for (const entry of [...waiting]) dropNote(key, entry);
        }
        const changed = store.erase(list);
        if (changed > 0) ctx.logger?.info?.(`tool-ledger: took the conversation link out of ${changed} line(s) of deleted conversations`);
      }), 'tool-ledger: deleted conversations');
    } catch (error) {
      warn(`lines of deleted conversations keep their link: ${error?.message ?? error}`);
    }
  });

  // ---- reading ----
  const RANGES = ['30d', '6m', 'all'];
  const rangeOf = (value) => (RANGES.includes(value) ? value : '30d');
  /** The tabs, with their names, for the page. */
  const tabList = () => {
    try {
      return (ctx.get('modes')?.list?.() ?? []).map((mode) => ({ id: String(mode.id), label: String(mode.label ?? mode.id) }));
    } catch {
      return [];
    }
  };
  /** Plain names of the tools (Tool access's catalogue), where it has one. */
  const plainNames = (tools) => {
    try {
      const access = ctx.get('toolAccess');
      const first = tabList()[0]?.id;
      if (!access || !first) return {};
      const wanted = new Set(tools);
      const out = {};
      for (const row of access.toolsOf?.(first) ?? []) if (wanted.has(row?.name) && row.plain) out[row.name] = String(row.plain).slice(0, 80);
      return out;
    } catch {
      return {};
    }
  };
  /**
   * Lines and summaries of a time range.
   * @param {{from?: number, to?: number, range?: string}} [options] - ms ends, or a range name ('30d', '6m', 'all').
   * @returns {{rows: object[], summary: object}} the lines and what they add up to.
   */
  function query(options = {}) {
    const to = Number.isFinite(options.to) ? options.to : Date.now();
    const from = Number.isFinite(options.from) ? options.from : rangeStart(options.range ? rangeOf(options.range) : 'all', to);
    const rows = store.read({ from, to });
    return { rows, summary: summarize(rows) };
  }
  function summaryFor(range) {
    const { rows, summary } = query({ range: rangeOf(range) });
    return {
      at: Date.now(),
      range: rangeOf(range),
      enabled: enabled(),
      keepDays: keepDays(),
      since: rows[0]?.t ?? null,
      tabs: tabList(),
      plain: plainNames(summary.tools.map((row) => row.tool).concat(summary.loadedNeverUsed.map((row) => row.tool))),
      ...summary,
    };
  }

  const toolLedger = Object.freeze({
    apiVersion: 1,
    note,
    query,
    /** @param {{range?: string}} [options] - '30d', '6m' or 'all'. @returns {object} the page's summary. */
    summary: (options = {}) => summaryFor(options.range),
    /** @param {{from?: number, to?: number, range?: string}} [options] - as query. @returns {string} the lines as CSV. */
    csv: (options = {}) => toCsv(query(options).rows),
    /** Write what is waiting now (tests, and before a backup). */
    flush,
  });
  ctx.effect(() => ctx.provide('toolLedger', toolLedger), 'tool-ledger service');

  // ---- routes for the page: behind the app's connection fence (login cookie, Host/Origin check) ----
  ctx.inject(['webServer', 'connection'], (inner) => {
    const fenced = (handler, methods = ['GET']) => (req, res) => {
      const rejection = inner.connection.requestRejection(req);
      if (rejection !== undefined) {
        res.statusCode = rejection;
        res.end();
        return;
      }
      if (!methods.includes(req.method)) {
        res.statusCode = 405;
        res.setHeader('allow', methods.join(', '));
        res.end();
        return;
      }
      res.setHeader('cache-control', 'no-store');
      try {
        handler(req, res, new URL(req.url ?? '/', 'http://placeholder').searchParams);
      } catch (error) {
        warn(`a page request failed: ${error?.message ?? error}`);
        res.statusCode = 500;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'The tool records could not be read.' }));
      }
    };
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: `${BASE}/summary`,
      handler: fenced((_req, res, params) => {
        res.statusCode = 200;
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(summaryFor(params.get('range'))));
      }),
    }), 'tool-ledger: GET summary');
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: `${BASE}/export`,
      handler: fenced((_req, res, params) => {
        const range = rangeOf(params.get('range'));
        const { rows } = query({ range });
        const stamp = new Date().toISOString().slice(0, 10);
        if (params.get('format') === 'json') {
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('content-disposition', `attachment; filename="tool-use-${range}-${stamp}.json"`);
          res.end(JSON.stringify({ range, at: new Date().toISOString(), rows }));
          return;
        }
        res.setHeader('content-type', 'text/csv; charset=utf-8');
        res.setHeader('content-disposition', `attachment; filename="tool-use-${range}-${stamp}.csv"`);
        res.end(toCsv(rows));
      }),
    }), 'tool-ledger: GET export');
    // Start fresh: the one write. A POST with a JSON body that says so; a cross-site form cannot send that.
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: `${BASE}/clear`,
      handler: fenced((req, res) => {
        void (async () => {
          res.setHeader('content-type', 'application/json; charset=utf-8');
          let asked = {};
          try {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 1000) throw new Error('too large');
              chunks.push(chunk);
            }
            asked = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } catch {
            asked = {};
          }
          if (!String(req.headers?.['content-type'] ?? '').includes('application/json') || asked?.confirm !== 'start fresh') {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Nothing was cleared.' }));
            return;
          }
          const files = store.clear();
          notes.clear();
          noteCount = 0;
          sessions.clear();
          ctx.logger?.info?.(`tool-ledger: started fresh (${files} month file(s) removed)`);
          res.statusCode = 200;
          res.end(JSON.stringify({ ok: true, files }));
        })();
      }, ['POST']),
    }), 'tool-ledger: POST clear');
  });

}
