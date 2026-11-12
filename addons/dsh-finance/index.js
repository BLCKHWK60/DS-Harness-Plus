/**
 * Finance: a fourth mode and tab, beside Chat, Cowork and Code, for researching companies,
 * markets and economies from the figures, the news and what people are saying.
 *
 * Switched on, it adds:
 *   - the Finance mode (through the Modes add-on) with its method as the mode's instructions;
 *   - the Finance tab in the Cowork sidebar, with drop-downs for subject, market, focus and period;
 *   - a note in every Finance conversation saying what was selected when it started;
 *   - seven skills, one for each common research task.
 * Switched off, it takes all of that away again.
 *
 * It has no data tools of its own yet: the assistant uses the app's web search, the Deep research
 * add-on, the Library and the chart tools. It is research, not advice.
 *
 * Route: `GET /dsh-finance/data`.
 */
import z from '@deepseek-ai/schemastery';
import { join } from 'node:path';
import { FOCUSES, KINDS, MARKETS, MODE_ID, PERIODS, WATCHLIST_MAX, cleanList, openPins, readSelection, selectionNote, withFinance } from './lib/finance.js';
import { SKILLS } from './skills.js';

export const name = 'dsh-finance';

export const DATA_PATH = '/dsh-finance/data';
const MODES_NS = 'modes';

export const Config = z.object({
  /** The Finance mode and tab. Off leaves nothing of it in the app. */
  enabled: z.boolean().default(false).volatile(),
  /** The drop-downs: what kind of subject (company, sector, economy, market). */
  kind: z.string().default('company').volatile(),
  /** The drop-downs: the subject's name; may be empty. */
  subject: z.string().default('').volatile(),
  /** The drop-downs: the market. */
  market: z.string().default('Global').volatile(),
  /** The drop-downs: what to concentrate on. */
  focus: z.string().default('full').volatile(),
  /** The drop-downs: how far back to look. */
  period: z.string().default('year').volatile(),
  /** Subjects you follow; offered in the subject box. */
  watchlist: z.array(z.string()).default([]).volatile(),
  /** Markets of your own, offered after the built-in ones. */
  moreMarkets: z.array(z.string()).default([]).volatile(),
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
  if (Array.isArray(value)) return value.map(plain);
  return value;
}

/**
 * Settings as plain checked values.
 * @param {object} config - live Config.
 * @returns {object} the settings.
 */
export function readSettings(config) {
  const moreMarkets = cleanList(plain(config?.moreMarkets), 30).filter((market) => !MARKETS.some((other) => other.toLowerCase() === market.toLowerCase()));
  return {
    enabled: plain(config?.enabled) === true,
    selection: readSelection({ kind: plain(config?.kind), subject: plain(config?.subject), market: plain(config?.market), focus: plain(config?.focus), period: plain(config?.period) }),
    watchlist: cleanList(plain(config?.watchlist), WATCHLIST_MAX),
    moreMarkets,
  };
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const settings = () => readSettings(config);
  const warn = (text) => ctx.logger?.warn?.(`finance: ${text}`);
  const home = ctx.get('dshHomePath');
  const pins = openPins(typeof home === 'function' ? join(home('finance'), 'conversations.json') : '');

  // ---- the mode: kept in step with the switch ------------------------------------------------

  let problem = '';
  let syncing = false;
  /** Add the Finance mode to the Modes add-on, or take it out, to match the switch. */
  const syncMode = async () => {
    if (syncing) return;
    syncing = true;
    try {
      const service = ctx.get('settings');
      const row = service?.describe?.().find((entry) => entry.ns === MODES_NS);
      if (!row) {
        problem = 'The Modes add-on is not running, so there is no Finance tab.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        problem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const on = settings().enabled;
      const ops = [];
      const next = withFinance(row.value.extraModes, on);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      // A tab that no longer exists must not stay selected.
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = '';
    } catch (error) {
      problem = `The Finance tab could not be ${settings().enabled ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(problem);
    } finally {
      syncing = false;
    }
  };
  void syncMode();
  const timer = setInterval(() => void syncMode(), 3000);
  timer.unref?.();
  ctx.effect(() => () => clearInterval(timer), 'finance: follow the switch');

  // ---- the selection: a note in every Finance conversation -----------------------------------

  const modeOf = (agentId) => {
    try {
      return ctx.get('modes')?.get?.(agentId);
    } catch {
      return undefined;
    }
  };
  const isHelper = (session) => session?.header?.origin === 'subagent';

  /** Agent id -> prompt section disposer. */
  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(
        () =>
          agent.ctx.systemPrompt.section({
            name: 'finance:selection',
            order: 59,
            interpolate: false,
            text: () => {
              try {
                const now = settings();
                if (!now.enabled || modeOf(agent.id) !== MODE_ID) return '';
                // A helper agent works for a conversation; it gets that conversation's selection when known.
                const root = agent.header?.parentSession ?? agent.session?.header?.parentSession;
                return selectionNote(pins.get(agent.id) ?? (root ? pins.get(root) : undefined) ?? now.selection);
              } catch {
                return '';
              }
            },
          }),
        'finance selection note',
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
  ctx.effect(() => () => {
    for (const dispose of sections.values()) {
      try {
        dispose?.();
      } catch {
        /* the conversation may already be closing */
      }
    }
    sections.clear();
  }, 'finance: selection notes');

  // What was selected when a conversation started stays that conversation's selection.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'turn/start' || isHelper(session)) return;
      const id = session?.id;
      const now = settings();
      if (!id || !now.enabled || pins.get(id) || modeOf(id) !== MODE_ID) return;
      pins.pin(id, now.selection);
    } catch (error) {
      warn(`could not remember a conversation's selection: ${String(error?.message ?? error)}`);
    }
  });

  // ---- the skills -----------------------------------------------------------------------------

  let skillsOff;
  const syncSkills = () => {
    const on = settings().enabled;
    if (on && !skillsOff) {
      const skills = ctx.get('skills');
      if (!skills?.register) return;
      skillsOff = SKILLS.map((skill) => skills.register({ ...skill, source: 'custom', invocation: { modelInvocable: true, userInvocable: true } }));
    } else if (!on && skillsOff) {
      for (const dispose of skillsOff) if (typeof dispose === 'function') dispose();
      skillsOff = undefined;
    }
  };
  const skillTimer = setInterval(() => {
    try {
      syncSkills();
    } catch (error) {
      warn(`could not update the skills: ${String(error?.message ?? error)}`);
    }
  }, 3000);
  skillTimer.unref?.();
  try {
    syncSkills();
  } catch (error) {
    warn(`could not add the skills: ${String(error?.message ?? error)}`);
  }
  ctx.effect(() => () => {
    clearInterval(skillTimer);
    for (const dispose of skillsOff ?? []) if (typeof dispose === 'function') dispose();
    skillsOff = undefined;
  }, 'finance: skills');

  // ---- the pages' data -------------------------------------------------------------------------

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: DATA_PATH,
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
            const now = settings();
            res.end(JSON.stringify({
              at: Date.now(),
              ...now,
              problem,
              kinds: KINDS,
              markets: [...MARKETS, ...now.moreMarkets],
              focuses: FOCUSES.map(({ id, label }) => ({ id, label })),
              periods: PERIODS.map(({ id, label }) => ({ id, label })),
              skills: SKILLS.map((skill) => ({ name: skill.name, description: skill.description })),
              skillsOn: Boolean(skillsOff),
            }));
            // The switch on the page should take effect at once, not at the next tick.
            void syncMode();
          },
        }),
      'finance: data route',
    );
  });

}
