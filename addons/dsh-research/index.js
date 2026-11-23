/**
 * Research: a mode and tab for researching a question in depth, built on the Deep research
 * add-on's engine. Switched on, it adds:
 *   - the Research mode (through the Modes add-on) with its method and tool list;
 *   - the Research tab, with a Focus dropdown in its chat box (Depth is the Modes add-on's Depth
 *     button, the same in every tab: it also sets how long a run takes and how many helpers work);
 *   - for Deep research runs in its conversations: the tab's focus, three follow-up questions at
 *     the end of the report, and the report saved as Markdown in the Research folder;
 *   - the live progress of a run, with the follow-up questions as buttons (browser half).
 * Route: `/dsh-research/data`.
 */
import z from '@deepseek-ai/schemastery';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEPTHS, FOCUSES, HELPER_MODELS, MODE_ID, listReports, saveReport, selectionNote, withResearch } from './lib/mode.js';
import { PACKET_SUFFIX, writePacket } from './lib/packet.js';
import { openOwned, removeOwned } from './lib/owned.js';
import { readJsonStore } from './lib/json-store.js';
import { makeGuardOf } from './lib/space-guard.js';

export const name = 'dsh-research';
export const DATA_PATH = '/dsh-research/data';
const MODES_NS = 'modes';

export const Config = z.object({
  /** The Research mode. Off leaves nothing of it in the app. */
  enabled: z.boolean().default(false).volatile(),
  /**
   * Where a run looked first before the one Web selector (18 November 2026): web, news or academic. Read once to
   * carry it over into the Web selector's ticks (`focusMoved`); the chat box no longer sets it.
   */
  focus: z.string().default('web').volatile(),
  /** Each thread's Focus and this starting Focus have been carried over into the Web selector's ticks (once). */
  focusMoved: z.boolean().default(false).volatile(),
  /** Where reports are saved. Empty: `research/reports` in the app's home. */
  folder: z.string().default('').volatile(),
});

function plain(value) {
  if (value === null || typeof value !== 'object') return value;
  if (typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return plain(value.get());
    } catch {
      return undefined;
    }
  }
  return value;
}
const focusOf = (value) => (FOCUSES.some((item) => item.id === value) ? value : 'web');
/** A Focus as Web selector ticks (the owner's choice: News and Academic become "only", like every tick). */
export const FOCUS_TICKS = { news: ['verified', 'news'], academic: ['verified', 'academic'] };
/**
 * The focus a run's helpers are told, from the conversation's Web sources: Academic or News when those are
 * the only kinds of page ticked besides verified sources; else Web (no extra words).
 * @param {string[] | undefined} ticks - the conversation's ticks (undefined: All).
 * @returns {'web' | 'news' | 'academic'}
 */
export function focusFromTicks(ticks) {
  if (!Array.isArray(ticks)) return 'web';
  const pages = ticks.filter((kind) => !['verified', 'other', 'tor', 'usenet', 'i2p'].includes(kind));
  if (pages.length === 1 && pages[0] === 'academic') return 'academic';
  if (pages.length === 1 && pages[0] === 'news') return 'news';
  return 'web';
}

export function apply(ctx, config) {
  const warn = (text) => ctx.logger?.warn?.(`research: ${text}`);
  const enabled = () => plain(config?.enabled) === true;
  // Item 4A, stage 6a: a sealed thread (Recon, any mode; a Modes read error counts) gets no saved report, no packet,
  // no pin and no selection note. Research reports come only from deep_research, which is left out in Recon, so this
  // is a belt. No Modes service: as before.
  const guardOf = makeGuardOf(() => ctx.get('modes'));
  const sealed = (id) => guardOf(String(id ?? '')).sealed === true;
  const home = ctx.get('dshHomePath');
  const researchHome = typeof home === 'function' ? home('research') : '';
  const folder = () => String(plain(config?.folder) ?? '').trim() || (researchHome ? join(researchHome, 'reports') : '');
  // Scratch (step 40): a report made in a Scratch conversation stays in the report folder (listed, and
  // compared as before) and goes when that conversation is deleted for good. Only in Research's own
  // folder: reports in a folder you picked yourself are never removed.
  const defaultFolder = researchHome ? join(researchHome, 'reports') : '';
  const ownFolder = () => Boolean(defaultFolder) && folder() === defaultFolder;
  const owned = openOwned(researchHome ? join(researchHome, 'scratch-reports.json') : '');
  const scratchConversation = (sessionId) => {
    try {
      const agent = ctx.get('agents')?.get?.(String(sessionId));
      return Boolean(agent && ctx.get('coworkScratch')?.folderOf?.(agent));
    } catch {
      return false;
    }
  };
  ctx.inject(['coworkTrash'], (inner) => {
    try {
      inner.effect(() => inner.coworkTrash.onErased((ids) => {
        const removed = removeOwned(owned.take(ids), defaultFolder, [PACKET_SUFFIX]);
        if (removed > 0) ctx.logger?.info?.(`research: removed ${removed} report(s) of deleted Scratch conversations`);
      }), 'research: Scratch reports');
    } catch (error) {
      warn(`reports of Scratch conversations will stay after they are deleted: ${String(error?.message ?? error)}`);
    }
  });
  const settingsOf = (ns) => {
    try {
      return ctx.get('settings')?.describe?.().find((entry) => entry.ns === ns)?.value;
    } catch {
      return undefined;
    }
  };
  /** A conversation's Depth: the Modes add-on's, the same in every tab (Standard without Modes). */
  const depthFor = (sessionId) => {
    let value;
    try {
      value = ctx.get('modes')?.depthOf?.(sessionId);
    } catch {
      value = undefined;
    }
    return DEPTHS.some((item) => item.id === value) ? value : 'standard';
  };

  // ---- which focus each conversation started with -------------------------------------------
  const pinFile = researchHome ? join(researchHome, 'conversations.json') : '';
  let pins = {};
  if (pinFile) pins = readJsonStore(pinFile, () => ({}), { label: 'the focus Research kept for each thread', valid: (value) => value && typeof value === 'object' && !Array.isArray(value) });
  const pin = (id, focus) => {
    pins[id] = focus;
    const ids = Object.keys(pins);
    if (ids.length > 500) for (const old of ids.slice(0, ids.length - 500)) delete pins[old];
    try {
      if (!pinFile) return;
      mkdirSync(dirname(pinFile), { recursive: true, mode: 0o700 });
      writeFileSync(pinFile, JSON.stringify(pins), { mode: 0o600 });
    } catch {
      /* the pins are a convenience */
    }
  };

  /**
   * What to tell when Deep research is not there. Its own "Deep research on" switch (Settings > Research > Advanced) takes the engine
   * away after a restart while the add-on still shows as on under Plugins, so say which of the two it is.
   * @returns {string} a plain sentence, or '' when the engine is running.
   */
  const engineProblem = () => {
    if (ctx.get('deepResearch')) return '';
    if (settingsOf('deep-research')?.enabled === false) return 'Deep research is switched off, so research runs cannot start. Switch "Deep research on" back on under Advanced on this page, then restart the app. (It still shows as on under Plugins: that only says the add-on is installed.)';
    return 'The Deep research add-on is not running, so research runs cannot start. Switch it on under Plugins.';
  };

  // ---- the mode: kept in step with the switch ------------------------------------------------
  let problem = '';
  let syncing = false;
  const syncMode = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const service = ctx.get('settings');
      const row = service?.describe?.().find((entry) => entry.ns === MODES_NS);
      if (!row) {
        problem = 'The Modes add-on is not running, so the Research mode cannot be offered. Switch Modes on on the Plugins page.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        problem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const ops = [];
      const next = withResearch(row.value.extraModes, enabled());
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      // Item 4A, stage 6b (D14): without the Cowork sidebar (and in the lab with spaces off) `defaultMode` still picks a new
      // thread's mode, so it must not name a mode that is gone. With spaces, Modes already skips a start mode whose
      // add-on is off and keeps the owner's choice (lib/spaces.js draftStartMode, startModeGone).
      if (!enabled() && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = engineProblem();
    } catch (error) {
      problem = `The Research mode could not be ${enabled() ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(problem);
    } finally {
      syncing = false;
    }
  };
  void syncMode();
  const timer = setInterval(() => {
    void syncMode();
    void moveFocus();
  }, 3000);
  timer.unref?.();
  ctx.effect(() => () => clearInterval(timer), 'research: follow the switch');

  // ---- conversations of the tab --------------------------------------------------------------
  const inResearch = (id) => {
    try {
      return Boolean(id) && ctx.get('modes')?.get?.(id) === MODE_ID;
    } catch {
      return false;
    }
  };
  /** @returns {boolean} whether a conversation is a helper of another one (a run's planner, worker or reviewer). */
  const isHelper = (id) => {
    try {
      const agent = (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === id);
      return Boolean(agent?.header?.parentSession ?? agent?.session?.header?.parentSession);
    } catch {
      return false;
    }
  };
  const rootOf = (agent) => String(agent?.header?.parentSession ?? agent?.session?.header?.parentSession ?? agent?.id ?? '');
  /** A conversation's focus: from its Web sources (the one Web selector); before the carry-over, its old pin. */
  const focusFor = (id) => {
    const modes = ctx.get('modes');
    if (plain(config?.focusMoved) === true && typeof modes?.webSources === 'function') return focusFromTicks(modes.webSources(id));
    return focusOf(pins[id] ?? plain(config?.focus));
  };

  // ---- the carry-over into the Web selector (once) -------------------------------------------
  // Each conversation's News or Academic focus becomes its ticks (unless it has its own), and a starting
  // focus other than Web becomes the Research tab's starting ticks. Nothing is removed: the pins file and
  // the old setting stay as they are.
  let moving = false;
  const moveFocus = async () => {
    if (moving || plain(config?.focusMoved) === true) return;
    const modes = ctx.get('modes');
    const service = ctx.get('settings');
    if (typeof modes?.carryWebSources !== 'function' || !service?.mutate) return;
    moving = true;
    try {
      for (const [id, focus] of Object.entries(pins)) {
        if (FOCUS_TICKS[focus]) await modes.carryWebSources(id, FOCUS_TICKS[focus]);
      }
      const start = focusOf(plain(config?.focus));
      const row = service.describe?.().find((entry) => entry.ns === MODES_NS);
      if (FOCUS_TICKS[start] && row?.value?.modeStart !== undefined) {
        let starts = {};
        try {
          starts = JSON.parse(String(row.value.modeStart || '{}')) ?? {};
        } catch {
          starts = {};
        }
        if (!Array.isArray(starts[MODE_ID]?.sources)) {
          starts[MODE_ID] = { ...(starts[MODE_ID] ?? {}), sources: FOCUS_TICKS[start] };
          await service.mutate(MODES_NS, [{ op: 'set', path: ['modeStart'], value: JSON.stringify(starts) }]);
        }
      }
      await service.mutate('research', [{ op: 'set', path: ['focusMoved'], value: true }]);
    } catch (error) {
      warn(`could not carry the Focus over into the Web selector: ${String(error?.message ?? error).slice(0, 160)}`);
    } finally {
      moving = false;
    }
  };
  void moveFocus();

  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'turn/start' || session?.header?.origin === 'subagent') return;
      const id = session?.id;
      // After the carry-over a conversation's focus is its Web sources: nothing to pin.
      if (!id || !enabled() || pins[id] || !inResearch(id) || plain(config?.focusMoved) === true || sealed(id)) return;
      pin(id, focusOf(plain(config?.focus)));
    } catch (error) {
      warn(`could not remember a conversation's focus: ${String(error?.message ?? error)}`);
    }
  });

  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(
        () => agent.ctx.systemPrompt.section({
          name: 'research:selection',
          order: 59,
          interpolate: false,
          text: () => {
            try {
              if (!enabled() || rootOf(agent) !== agent.id || !inResearch(agent.id) || sealed(agent.id)) return '';
              return selectionNote({ focus: focusFor(agent.id), depth: depthFor(agent.id) });
            } catch {
              return '';
            }
          },
        }),
        'research selection note',
      );
      sections.set(agent.id, dispose);
    } catch (error) {
      warn(`could not add the selection note: ${String(error?.message ?? error)}`);
    }
  };
  ctx.on('agent/created', ({ agent }) => install(agent));
  ctx.on('agent/disposed', ({ agent }) => sections.delete(agent?.id));
  try {
    for (const agent of ctx.get('agents')?.list?.() ?? []) install(agent);
  } catch {
    /* agents appear later */
  }

  // ---- what Deep research asks of the tab ----------------------------------------------------
  ctx.effect(
    () => ctx.provide('research', Object.freeze({
      /** For a run in a Research conversation: the focus, follow-up questions, and saving the report. */
      runOptions(sessionId) {
        const id = String(sessionId ?? '');
        if (!enabled() || !inResearch(id)) return {};
        // Follow-up questions are for you to click in your own conversation; a helper's (one a Long run
        // started) has nobody to ask them, and clicking one would write to a helper that has finished.
        // Item 4A, stage 6a: never saved from a sealed thread.
        return { focus: focusFor(id), followups: !isHelper(id), save: Boolean(folder()) && !sealed(id) };
      },
      /** Save a finished report; returns the file. One made in a Scratch conversation is remembered with it. */
      saveReport(sessionId, report) {
        // Item 4A, stage 6a: nothing from a sealed thread lands in the shared Research folder.
        if (!enabled() || !folder() || sealed(sessionId)) return '';
        const file = saveReport(folder(), report);
        // The packet beside it (step C2): its tables for the Content tab. A packet that cannot be written
        // never costs the report.
        if (report?.packet) {
          try {
            writePacket(file, report.packet, { question: report.question });
          } catch (error) {
            warn(`the report was saved, its packet was not: ${String(error?.message ?? error)}`);
          }
        }
        try {
          if (ownFolder() && scratchConversation(sessionId)) owned.add(String(sessionId), file);
        } catch (error) {
          warn(`a Scratch report was saved but will stay after its conversation is deleted: ${String(error?.message ?? error)}`);
        }
        return file;
      },
    })),
    'research: service',
  );

  // ---- the pages' data -----------------------------------------------------------------------
  /** Minutes a run started from a program (the PTC preset) gets whatever the depth, from Deep research; undefined when unknown. */
  const programMinutes = () => {
    try {
      const minutes = ctx.get('deepResearch')?.programMinutes?.();
      return Number.isFinite(minutes) ? minutes : undefined;
    } catch {
      return undefined;
    }
  };
  const view = () => ({
    at: Date.now(),
    enabled: enabled(),
    focus: focusOf(plain(config?.focus)),
    focuses: FOCUSES,
    depths: DEPTHS,
    programMinutes: programMinutes(),
    helperModel: String(plain(settingsOf(MODES_NS)?.researchModel) ?? '') === 'roles' ? 'roles' : 'same',
    helperModels: HELPER_MODELS,
    folder: folder(),
    reports: listReports(folder()),
    engine: Boolean(ctx.get('deepResearch')),
    problem,
  });
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () => inner.webServer.register({
        kind: 'exact',
        path: DATA_PATH,
        handler: async (req, res) => {
          const refused = inner.connection.requestRejection(req);
          if (refused !== undefined) {
            res.statusCode = refused;
            res.end();
            return;
          }
          res.setHeader('content-type', 'application/json; charset=utf-8');
          res.setHeader('cache-control', 'no-store');
          try {
            const session = new URL(req.url ?? '/', 'http://local').searchParams.get('session') ?? '';
            if (req.method === 'POST') {
              const chunks = [];
              for await (const chunk of req) chunks.push(chunk);
              const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
              if (body.action === 'reveal') {
                const path = folder();
                mkdirSync(path, { recursive: true, mode: 0o700 });
                if (process.platform === 'darwin') await new Promise((done) => execFile('/usr/bin/open', [path], () => done()));
              } else if (body.action === 'focus') {
                // The chat box's Focus: this conversation's own, and where new ones start.
                const focus = focusOf(body.focus);
                const id = String(body.sessionId ?? '').slice(0, 200);
                if (id) pin(id, focus);
                await ctx.get('settings')?.mutate?.('research', [{ op: 'set', path: ['focus'], value: focus }]);
              } else throw new Error('unknown action');
            }
            res.end(JSON.stringify({ ...view(), ...(session ? { session: { inResearch: enabled() && inResearch(session), focus: focusFor(session), depth: depthFor(session) } } : {}) }));
            void syncMode();
          } catch (error) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
          }
        },
      }),
      'research: data route',
    );
  });
}
