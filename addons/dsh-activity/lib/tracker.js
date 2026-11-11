/**
 * Keeps track of what every conversation is doing right now, from the app's own
 * events. It stores no text: only kinds of work, tool names, counts and timings.
 *
 * Kinds of work:
 *   prompt  the model is reading the prompt (request sent, no token back yet)
 *   reason  the model is thinking (reasoning tokens arrive)
 *   write   the model is writing (answer tokens or a tool call's arguments arrive)
 *   tool    a tool is running
 *   web     a web search or fetch tool is running
 *   script  a shell command or script tool is running
 *   sub     sub-agents of the conversation are working
 *   other   other conversations are working
 *   wait    the app waits for your approval
 *   error   the last turn failed, or the model request is being retried
 */

export const KINDS = ['prompt', 'reason', 'write', 'tool', 'web', 'script', 'sub', 'other', 'wait', 'error'];

/** Tool names that count as web work or as a script, when the settings give none. */
export const DEFAULT_WEB = ['web', 'search', 'fetch', 'browse', 'http', 'url'];
export const DEFAULT_SCRIPT = ['bash', 'shell', 'exec', 'terminal', 'command', 'script', 'python', 'run_'];

const RATE_WINDOW_MS = 3000;
const DEFAULT_CHARS_PER_TOKEN = 4;
const FORGET_AFTER_MS = 30 * 60 * 1000;

/**
 * Does a tool name contain one of the words?
 * @param {string} name - tool name.
 * @param {string[]} words - lower-case fragments.
 * @returns {boolean} true on a match.
 */
export function nameMatches(name, words) {
  const lower = String(name ?? '').toLowerCase();
  return words.some((word) => word && lower.includes(String(word).toLowerCase()));
}

/**
 * @param {object} [options] - `now` (clock), `web` and `script` (tool-name fragments), `errorHoldMs`.
 * @returns {object} the tracker.
 */
export function createTracker(options = {}) {
  const now = options.now ?? Date.now;
  const errorHoldMs = options.errorHoldMs ?? 8000;
  let webWords = options.web ?? DEFAULT_WEB;
  let scriptWords = options.script ?? DEFAULT_SCRIPT;
  /** @type {Map<string, object>} */
  const sessions = new Map();

  function open(id, info = {}) {
    let state = sessions.get(id);
    if (!state) {
      state = {
        id,
        parent: null,
        top: true,
        running: false,
        turnStart: 0,
        phase: null, // 'prompt' | 'reason' | 'write' | null
        phaseStart: 0,
        requestStart: 0,
        firstTokenAt: 0,
        marks: [], // [time, characters] of recent chunks
        chars: { reason: 0, write: 0 },
        charsPerToken: DEFAULT_CHARS_PER_TOKEN,
        tools: new Map(), // callId -> {name, start}
        waits: new Map(), // approval id -> {tool, since}
        error: null, // {text, at}
        retry: 0,
        lastPrompt: null, // {rate, tokens, seconds}
        contextTokens: 0,
        lastRates: { reason: 0, write: 0 },
        touched: now(),
      };
      sessions.set(id, state);
    }
    if (info.parent !== undefined && info.parent !== null) state.parent = String(info.parent);
    if (info.top !== undefined) state.top = Boolean(info.top);
    state.touched = now();
    return state;
  }

  function setPhase(state, phase) {
    if (state.phase === phase) return;
    if (state.phase === 'reason' || state.phase === 'write') state.lastRates[state.phase] = rateOf(state);
    state.phase = phase;
    state.phaseStart = now();
    state.marks = [];
  }

  /** Tokens per second over the last few seconds of the current phase. */
  function rateOf(state) {
    const at = now();
    const from = Math.max(at - RATE_WINDOW_MS, state.phaseStart);
    const span = at - from;
    if (span < 250) return 0;
    let chars = 0;
    for (const [time, count] of state.marks) if (time >= from) chars += count;
    return chars / state.charsPerToken / (span / 1000);
  }

  function endTurn(state) {
    state.running = false;
    setPhase(state, null);
    state.tools.clear();
    state.waits.clear();
    state.retry = 0;
  }

  /** Is `id` below `ancestor` in the sub-agent tree? */
  function isBelow(id, ancestor) {
    let at = sessions.get(id);
    for (let depth = 0; at && depth < 12; depth += 1) {
      if (!at.parent) return false;
      if (at.parent === ancestor) return true;
      at = sessions.get(at.parent);
    }
    return false;
  }

  function forget() {
    const at = now();
    for (const [id, state] of sessions) if (!state.running && at - state.touched > FORGET_AFTER_MS) sessions.delete(id);
  }

  return {
    /** Change which tool names count as web work or scripts. */
    setWords(web, script) {
      webWords = Array.isArray(web) && web.length > 0 ? web : DEFAULT_WEB;
      scriptWords = Array.isArray(script) && script.length > 0 ? script : DEFAULT_SCRIPT;
    },

    /**
     * Take in one session event.
     * @param {{id: string, parent?: string | null, top?: boolean}} session - which conversation.
     * @param {string} type - event type.
     * @param {object} [data] - event data.
     */
    event(session, type, data = {}) {
      if (!session?.id || typeof type !== 'string') return;
      const state = open(String(session.id), session);
      switch (type) {
        case 'turn/start':
          state.running = true;
          state.turnStart = now();
          state.error = null;
          state.retry = 0;
          state.tools.clear();
          state.waits.clear();
          setPhase(state, null);
          break;
        case 'turn/end': {
          endTurn(state);
          const kind = String(data?.reason?.kind ?? '');
          if (kind === 'error') state.error = { text: String(data?.reason?.message ?? data?.reason?.error?.message ?? 'The turn failed').slice(0, 120), at: now() };
          break;
        }
        case 'step/start':
          state.running = true;
          if (state.phase === null) {
            setPhase(state, 'prompt');
            state.requestStart = now();
            state.firstTokenAt = 0;
          }
          break;
        case 'assistant/message': {
          const usage = data?.usage;
          if (usage && typeof usage === 'object') {
            const input = Number(usage.inputTokens) || 0;
            const output = Number(usage.outputTokens) || 0;
            const cached = Number(usage.cacheReadTokens) || 0;
            if (input > 0 || output > 0) state.contextTokens = input + output;
            const seconds = state.firstTokenAt > state.requestStart ? (state.firstTokenAt - state.requestStart) / 1000 : 0;
            const fresh = Math.max(0, input - cached);
            if (seconds > 0.05 && fresh > 0) state.lastPrompt = { rate: fresh / seconds, tokens: fresh, seconds };
            const chars = state.chars.reason + state.chars.write;
            if (output > 0 && chars > 0) state.charsPerToken = Math.min(8, Math.max(1.5, chars / output));
          }
          state.chars = { reason: 0, write: 0 };
          state.retry = 0;
          setPhase(state, null);
          break;
        }
        case 'tool/call':
          if (data?.callId) state.tools.set(String(data.callId), { name: String(data.name ?? 'tool').slice(0, 60), start: now() });
          break;
        case 'tool/result': {
          const id = data?.message?.toolCallId ?? data?.message?.source?.callId ?? data?.callId;
          if (id) state.tools.delete(String(id));
          break;
        }
        case 'approval/asked':
          state.waits.set(String(data?.id ?? 'approval'), { tool: String(data?.toolName ?? '').slice(0, 60), since: now() });
          break;
        case 'approval/decided':
          state.waits.delete(String(data?.id ?? 'approval'));
          break;
        case 'llm/retry-started':
        case 'llm/retry':
          state.retry += type === 'llm/retry-started' ? 1 : 0;
          if (state.retry === 0) state.retry = 1;
          break;
        default:
          break;
      }
    },

    /**
     * Take in one frame of the live model stream.
     * @param {string} sessionId - which conversation.
     * @param {{type: string, chunk?: object}} frame - `start`, `chunk` or `end`.
     */
    frame(sessionId, frame) {
      if (!sessionId || !frame || typeof frame.type !== 'string') return;
      const state = open(String(sessionId));
      if (frame.type === 'start') {
        state.running = true;
        setPhase(state, 'prompt');
        state.phaseStart = now();
        state.requestStart = now();
        state.firstTokenAt = 0;
        state.chars = { reason: 0, write: 0 };
        return;
      }
      if (frame.type === 'end') {
        setPhase(state, null);
        return;
      }
      const chunk = frame.chunk;
      if (frame.type !== 'chunk' || !chunk) return;
      let phase = null;
      let size = 0;
      if (chunk.type === 'reasoning-delta') {
        phase = 'reason';
        size = String(chunk.text ?? '').length;
      } else if (chunk.type === 'text-delta') {
        phase = 'write';
        size = String(chunk.text ?? '').length;
      } else if (chunk.type === 'tool-call-delta') {
        phase = 'write';
        size = String(chunk.argumentsDelta ?? '').length + (chunk.name ? String(chunk.name).length : 0);
      }
      if (!phase) return;
      if (!state.firstTokenAt) state.firstTokenAt = now();
      state.retry = 0;
      setPhase(state, phase);
      state.chars[phase] += size;
      state.marks.push([now(), size]);
      if (state.marks.length > 400) state.marks.splice(0, 200);
    },

    /** Drop a conversation that was closed. */
    drop(sessionId) {
      sessions.delete(String(sessionId));
    },

    /**
     * What the indicator shows.
     * @param {string} [viewId] - the conversation on screen; without it, the busiest top-level one.
     * @returns {object} `{at, session, kinds, context, lastPrompt, turnSeconds}`; `kinds` holds only what is active.
     */
    snapshot(viewId) {
      forget();
      const at = now();
      let main = viewId ? sessions.get(String(viewId)) : undefined;
      if (!main) {
        const tops = [...sessions.values()].filter((state) => state.top && !state.parent);
        main = tops.filter((state) => state.running).sort((a, b) => b.touched - a.touched)[0] ?? (viewId ? undefined : tops.sort((a, b) => b.touched - a.touched)[0]);
      }
      const kinds = {};
      const seconds = (from) => Math.max(0, Math.round((at - from) / 100) / 10);
      const mainId = main?.id ?? null;

      if (main) {
        if (main.phase === 'prompt') {
          kinds.prompt = { seconds: seconds(main.phaseStart), tokens: main.contextTokens, lastRate: Math.round(main.lastPrompt?.rate ?? 0) };
        } else if (main.phase === 'reason' || main.phase === 'write') {
          kinds[main.phase] = {
            rate: Math.round(rateOf(main) * 10) / 10,
            seconds: seconds(main.phaseStart),
            tokens: Math.round(main.chars[main.phase] / main.charsPerToken),
          };
        }
        const groups = { tool: [], web: [], script: [] };
        for (const tool of main.tools.values()) {
          const kind = nameMatches(tool.name, webWords) ? 'web' : nameMatches(tool.name, scriptWords) ? 'script' : 'tool';
          groups[kind].push(tool);
        }
        for (const [kind, list] of Object.entries(groups)) {
          if (list.length === 0) continue;
          const newest = list.reduce((a, b) => (b.start > a.start ? b : a));
          const oldest = list.reduce((a, b) => (b.start < a.start ? b : a));
          kinds[kind] = { count: list.length, name: newest.name, seconds: seconds(oldest.start) };
        }
        if (main.retry > 0) kinds.error = { text: `Retrying the model request (${main.retry})`, retry: main.retry };
        else if (main.error && at - main.error.at < errorHoldMs) kinds.error = { text: main.error.text, retry: 0 };
      }

      const subs = [];
      const others = [];
      const waits = main ? [...main.waits.values()].map((wait) => ({ ...wait, from: 'main' })) : [];
      for (const state of sessions.values()) {
        if (state.id === mainId) continue;
        const below = mainId !== null && isBelow(state.id, mainId);
        if (below) for (const wait of state.waits.values()) waits.push({ ...wait, from: 'sub' });
        if (!state.running) continue;
        // A sub-agent of another conversation is counted with that conversation, below.
        if (below) subs.push(state);
        else others.push(state);
      }
      if (subs.length > 0) {
        kinds.sub = {
          count: subs.length,
          seconds: seconds(Math.min(...subs.map((state) => state.turnStart || at))),
          tools: subs.reduce((total, state) => total + state.tools.size, 0),
        };
      }
      const otherTops = new Set(others.map((state) => (state.parent && sessions.has(state.parent) ? rootOf(state.id) : state.id)));
      if (otherTops.size > 0) kinds.other = { count: otherTops.size };
      if (waits.length > 0) {
        const first = waits.reduce((a, b) => (b.since < a.since ? b : a));
        kinds.wait = { tool: first.tool, seconds: seconds(first.since), count: waits.length, from: first.from };
      }

      return {
        at,
        session: mainId,
        running: Boolean(main?.running),
        kinds,
        context: main?.contextTokens ?? 0,
        lastPrompt: main?.lastPrompt ? { rate: Math.round(main.lastPrompt.rate), tokens: main.lastPrompt.tokens, seconds: Math.round(main.lastPrompt.seconds * 10) / 10 } : null,
        lastRates: main ? { reason: Math.round(main.lastRates.reason * 10) / 10, write: Math.round(main.lastRates.write * 10) / 10 } : null,
        turnSeconds: main?.running ? seconds(main.turnStart || at) : 0,
      };
    },

    /** How many conversations are known (for tests and `/activity`). */
    size() {
      return sessions.size;
    },
  };

  function rootOf(id) {
    let at = sessions.get(id);
    for (let depth = 0; at?.parent && sessions.has(at.parent) && depth < 12; depth += 1) at = sessions.get(at.parent);
    return at?.id ?? id;
  }
}
