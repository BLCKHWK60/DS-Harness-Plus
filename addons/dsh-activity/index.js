/**
 * Activity indicator: a thin bar by the chat box or on the window edge that shows
 * what the model and its helpers are doing right now.
 *
 * This file is the server half. It listens to the app's own events (turns, model
 * stream, tool calls, approvals, sub-agent sessions), keeps counts and timings in
 * memory, and answers the page's question "what is happening now?". It stores no
 * prompt or answer text, writes no file, and sends nothing anywhere.
 *
 * The browser half can also play a short sound when the app starts waiting for you
 * or a turn fails.
 *
 * Service `activity` (apiVersion 1): `snapshot(sessionId?)`, `settings()`.
 * Route: `GET /dsh-activity/status` (header `x-dsh-session` names the conversation on screen).
 * Command: `/activity`.
 */
import z from '@deepseek-ai/schemastery';
import { demoSnapshot, labelOf } from './lib/label.js';
import { createTracker, DEFAULT_SCRIPT, DEFAULT_WEB, KINDS } from './lib/tracker.js';

export const name = 'dsh-activity';

export const STATUS_PATH = '/dsh-activity/status';
export const SESSION_HEADER = 'x-dsh-session';
/** The settings page asks for a sample state with this header, to show a preview. */
export const DEMO_HEADER = 'x-dsh-demo';

/** The built-in alert sounds. They are made in the browser; there are no sound files. */
export const SOUNDS = ['none', 'chime', 'beep', 'double', 'triple', 'bell', 'ping', 'low', 'alarm', 'siren'];

export const DESIGNS = ['pulse', 'lanes', 'threads', 'tape', 'rings', 'pulse+tape', 'threads+rings'];

export const Config = z.object({
  /** Master switch. */
  enabled: z.boolean().default(true).volatile(),
  /** Which look to use. */
  design: z.string().default('pulse').volatile(),
  /** Kinds of work that are switched off. Everything else is shown. */
  hidden: z.array(z.string()).default([]).volatile(),
  /** Show the row of text. */
  text: z.boolean().default(true).volatile(),
  /** Add figures to the text: tokens per second, seconds, counts. */
  figures: z.boolean().default(true).volatile(),
  /** Write words ("Writing") in place of short codes ("TG"). */
  words: z.boolean().default(false).volatile(),
  /** Add the last prompt-processing speed to the text while the model thinks or writes. */
  promptSpeed: z.boolean().default(true).volatile(),
  /** Add how many tokens the conversation holds to the text. */
  context: z.boolean().default(true).volatile(),
  /** Show nothing at all while nothing is running. */
  hideIdle: z.boolean().default(false).volatile(),
  /** Colour only, no movement. */
  still: z.boolean().default(false).volatile(),
  /** Keep the line above the message box as wide as the box. Off lets it span the whole chat area. */
  fit: z.boolean().default(true).volatile(),
  /** Thickness: 1 thin, 2 normal, 3 bold. */
  weight: z.number().min(1).max(3).default(2).volatile(),
  /** Ticker tape: how many minutes it holds. */
  tapeMinutes: z.number().min(1).max(30).default(1).volatile(),
  /** Ticker tape: solid blocks (true) or separate ticks. */
  tapeBlocks: z.boolean().default(true).volatile(),
  /** Ticker tape: older work fades. */
  tapeFade: z.boolean().default(true).volatile(),
  /** Ticker tape: a mark every 10 seconds. */
  tapeMarks: z.boolean().default(true).volatile(),
  /** Play a sound when the app starts waiting for you or a turn fails. */
  sound: z.boolean().default(true).volatile(),
  /** Loudness of the sounds, 0 to 100. */
  soundVolume: z.number().min(0).max(100).default(30).volatile(),
  /** The sound for "waiting for you"; `none` plays nothing. */
  waitSound: z.string().default('chime').volatile(),
  /** The sound for an error; `none` plays nothing. */
  errorSound: z.string().default('low').volatile(),
  /** Play the waiting sound again every this many seconds while it still waits; 0 plays it once. */
  soundRepeat: z.number().min(0).max(600).default(0).volatile(),
  /** Your own colour per kind of work, as `#rrggbb`. Empty uses the built-in colours. */
  colors: z.dict(z.string()).default({}).volatile(),
  /** Tool names that count as web work (a tool matches when its name contains one of these). */
  webTools: z.array(z.string()).default([]).volatile(),
  /** Tool names that count as scripts. */
  scriptTools: z.array(z.string()).default([]).volatile(),
  /** Slash command; empty registers none. */
  commandName: z.string().default('activity'),
});

/**
 * Plain value of a Config field that may be a live reference.
 * @param {unknown} value - field value.
 * @returns {unknown} plain value.
 */
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

const list = (value) => (Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean).slice(0, 40) : []);
const flag = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

/**
 * Read the settings as plain, checked values.
 * @param {object} config - live Config.
 * @returns {object} settings the page can use as they are.
 */
export function readSettings(config) {
  const design = String(plain(config.design) ?? 'pulse');
  const colors = {};
  const raw = plain(config.colors);
  if (raw && typeof raw === 'object') {
    for (const kind of KINDS) {
      const value = String(raw[kind] ?? '').trim();
      if (/^#[0-9a-fA-F]{6}$/.test(value)) colors[kind] = value.toLowerCase();
    }
  }
  const number = (value, fallback, min, max) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  };
  return {
    enabled: plain(config.enabled) !== false,
    design: DESIGNS.includes(design) ? design : 'pulse',
    hidden: list(plain(config.hidden)).filter((kind) => KINDS.includes(kind)),
    text: flag(plain(config.text), true),
    figures: flag(plain(config.figures), true),
    words: flag(plain(config.words), false),
    promptSpeed: flag(plain(config.promptSpeed), true),
    context: flag(plain(config.context), true),
    hideIdle: flag(plain(config.hideIdle), false),
    still: flag(plain(config.still), false),
    fit: flag(plain(config.fit), true),
    weight: Math.round(number(plain(config.weight), 2, 1, 3)),
    tapeMinutes: Math.round(number(plain(config.tapeMinutes), 1, 1, 30)),
    tapeBlocks: flag(plain(config.tapeBlocks), true),
    tapeFade: flag(plain(config.tapeFade), true),
    tapeMarks: flag(plain(config.tapeMarks), true),
    sound: flag(plain(config.sound), true),
    soundVolume: Math.round(number(plain(config.soundVolume), 30, 0, 100)),
    waitSound: SOUNDS.includes(String(plain(config.waitSound))) ? String(plain(config.waitSound)) : 'chime',
    errorSound: SOUNDS.includes(String(plain(config.errorSound))) ? String(plain(config.errorSound)) : 'low',
    soundRepeat: Math.round(number(plain(config.soundRepeat), 0, 0, 600)),
    colors,
    webTools: list(plain(config.webTools)),
    scriptTools: list(plain(config.scriptTools)),
  };
}

/**
 * Where a session sits in the sub-agent tree.
 * @param {object} session - the app's session object.
 * @returns {{id: string, parent: string | null, top: boolean} | undefined} its place, or undefined without an id.
 */
export function placeOf(session) {
  const id = session?.id;
  if (!id) return undefined;
  const header = session?.header ?? session;
  const parentRaw = header?.parentSession;
  const parent = parentRaw && typeof parentRaw === 'object' ? parentRaw.id ?? parentRaw.sessionId ?? null : parentRaw ?? null;
  const child = Boolean(header?.origin === 'subagent' || parent || Number(header?.delegationDepth) > 0);
  return { id: String(id), parent: parent ? String(parent) : null, top: !child };
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const tracker = createTracker();
  const startedAt = Date.now();
  let wordsKey = '';

  /** Keep the tracker's tool-name lists in step with the settings. */
  function settings() {
    const now = readSettings(config);
    const key = `${now.webTools.join('|')}#${now.scriptTools.join('|')}`;
    if (key !== wordsKey) {
      wordsKey = key;
      tracker.setWords(now.webTools, now.scriptTools);
    }
    return now;
  }

  ctx.on('session/event', (session, event) => {
    try {
      const place = placeOf(session);
      if (!place || typeof event?.type !== 'string') return;
      // An event from before this start is history being loaded, not something happening now.
      const stamp = event.time ? new Date(event.time).getTime() : Date.now();
      if (Number.isFinite(stamp) && stamp < startedAt - 5000) return;
      tracker.event(place, event.type, event.data);
    } catch (error) {
      ctx.logger?.warn?.(`activity: could not read an event: ${error?.message ?? error}`);
    }
  });

  // The live model stream: one frame when a request starts, one per chunk, one when it ends.
  ctx.on('agent/assistant-stream', (...args) => {
    try {
      const payload = args.find((arg) => arg && typeof arg === 'object' && arg.frame);
      if (!payload) return;
      const agent = payload.agent;
      const id = agent?.session?.id ?? agent?.sessionId ?? agent?.id;
      if (!id) return;
      const place = placeOf(agent?.session ?? { id });
      if (place) tracker.event(place, 'activity/seen');
      tracker.frame(String(id), payload.frame);
    } catch (error) {
      ctx.logger?.warn?.(`activity: could not read a stream frame: ${error?.message ?? error}`);
    }
  });

  ctx.on('agent/disposed', (...args) => {
    try {
      const payload = args.find((arg) => arg && typeof arg === 'object' && (arg.agent || arg.id));
      const agent = payload?.agent ?? payload;
      const id = agent?.session?.id ?? agent?.sessionId ?? agent?.id;
      if (id) tracker.drop(String(id));
    } catch {
      // Nothing to clean up.
    }
  });

  /**
   * What the page shows: the live state and the display settings in one answer.
   * @param {string} [sessionId] - the conversation on screen.
   * @param {string} [demo] - name of a sample state, for the preview on the settings page.
   * @returns {object} state.
   */
  function status(sessionId, demo) {
    const now = settings();
    const defaults = { web: DEFAULT_WEB, script: DEFAULT_SCRIPT };
    const sample = demo ? demoSnapshot(demo) : undefined;
    if (!sample && !now.enabled) return { at: Date.now(), settings: now, session: null, running: false, kinds: {}, label: { text: '', parts: [] }, defaults };
    const snapshot = sample ?? tracker.snapshot(sessionId);
    return { ...snapshot, label: labelOf(snapshot, now), settings: now, defaults };
  }

  ctx.effect(() => ctx.provide('activity', Object.freeze({ apiVersion: 1, snapshot: (sessionId) => tracker.snapshot(sessionId), settings: () => settings() })), 'activity service');

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: STATUS_PATH,
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
            try {
              const header = req.headers?.[SESSION_HEADER];
              const sessionId = typeof header === 'string' && /^[\w.:-]{1,120}$/.test(header) ? header : undefined;
              const demo = req.headers?.[DEMO_HEADER];
              res.end(JSON.stringify(status(sessionId, typeof demo === 'string' ? demo : undefined)));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 200) }));
            }
          },
        }),
      'activity: GET status route',
    );
  });

  const commandName = String(plain(config.commandName) ?? '').trim();
  if (!commandName) return;
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: commandName,
          description: 'Activity indicator: shows what is running right now, in words',
          handler: async ({ agent }) => {
            const now = status(agent?.session?.id ?? agent?.id);
            if (!now.settings.enabled) return { kind: 'success', text: 'The activity indicator is switched off (Settings → Activity).' };
            const active = Object.entries(now.kinds).map(([kind, detail]) => `${kind}${detail.count > 1 ? ` ×${detail.count}` : ''}${detail.name ? ` (${detail.name})` : ''}${detail.rate ? ` ${detail.rate} t/s` : ''}`);
            return {
              kind: 'success',
              text: [
                `Design: ${now.settings.design}. Switched off: ${now.settings.hidden.join(', ') || 'nothing'}.`,
                active.length > 0 ? `Running now: ${active.join(', ')}.` : 'Nothing is running.',
                now.lastPrompt ? `Last prompt processing: ${now.lastPrompt.rate} tokens/s (${now.lastPrompt.tokens} tokens in ${now.lastPrompt.seconds}s).` : '',
              ].filter(Boolean).join('\n'),
            };
          },
        }),
      'activity command',
    );
  });
}
