/**
 * Finance: a fourth mode and tab, beside Chat, Cowork and Code, for researching companies,
 * markets and economies from the figures, the news and what people are saying.
 *
 * Switched on, it adds:
 *   - the Finance mode (through the Modes add-on) with its method as the mode's instructions;
 *   - the Finance tab in the Cowork sidebar, with drop-downs for subject, market, focus and period;
 *   - a note in every Finance conversation saying what was selected when it started, or since in
 *     its chat box (and, while its tools are off, that any figure is from memory);
 *   - seven skills, one for each common research task.
 * Switched off, it takes all of that away again.
 *
 * It also adds six data tools that need no key: a company's reported figures and its filings
 * from the US securities regulator, yearly readings for economies from the World Bank, and share
 * prices, news and social posts (lib/market.js). For
 * everything else the assistant uses the app's web search, the Deep research add-on, the Library
 * and the chart tools. It is research, not advice, unless the adviser is switched on (lib/adviser.js)
 * after the user typed their acceptance of its warning.
 *
 * Route: `GET /dsh-finance/data` (with `?session=<id>`: what one conversation's chat box shows), and
 * `POST` to it for the page's actions and the chat box's change of a conversation's selection (`pin`).
 */
import z from '@deepseek-ai/schemastery';
import { join } from 'node:path';
import { FOCUSES, KINDS, MARKETS, MODE_ID, PERIODS, WATCHLIST_MAX, changeSelection, cleanList, openPins, readSelection, selectionNote, toolsOffNote, withFinance } from './lib/finance.js';
import { BRIEF_PREFIX, OWN_MAX, RHYTHMS, briefPrompt, briefRule, briefTitle, briefsOf, ownTasksOf, researchOnly, scheduledIn } from './lib/briefs.js';
import { PRESETS, addressProblem, keyRef, readSources, sourceGet, sourcesNote } from './lib/sources.js';
import { buildSourceTool, buildTools } from './lib/tools.js';
import { buildMarketTools } from './lib/market.js';
import { SKILLS } from './skills.js';
import { adviserNote, adviserSkills, buildProfileTool, openProfile } from './lib/adviser.js';
import { makeGuardOf } from './lib/space-guard.js';

export const name = 'dsh-finance';

export const DATA_PATH = '/dsh-finance/data';
const MODES_NS = 'modes';

export const Config = z.object({
  /** The Finance mode. Off leaves nothing of it in the app. */
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
  /**
   * Extra data sources as JSON: `[{ id, kind: 'api' | 'connector', name, baseUrl, keyIn, keyName, about, docs, on }]`.
   * Keys are never here: each is kept in the app's secret store.
   */
  sources: z.string().default('[]').volatile(),
  /** Ids of automations of your own that run in Finance instead of Cowork. */
  financeTasks: z.array(z.string()).default([]).volatile(),
  /** The assistant speaks as the user's financial adviser: it recommends and ends with "AI output, not regulated advice". Works only after `adviserAccepted`. */
  adviser: z.boolean().default(false).volatile(),
  /** The user typed their acceptance of the adviser warning once. Without it the adviser stays off, whatever `adviser` says. */
  adviserAccepted: z.boolean().default(false).volatile(),
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
    adviser: plain(config?.adviser) === true && plain(config?.adviserAccepted) === true,
    adviserAccepted: plain(config?.adviserAccepted) === true,
    selection: readSelection({ kind: plain(config?.kind), subject: plain(config?.subject), market: plain(config?.market), focus: plain(config?.focus), period: plain(config?.period) }),
    watchlist: cleanList(plain(config?.watchlist), WATCHLIST_MAX),
    moreMarkets,
    sources: readSources(plain(config?.sources)),
    financeTasks: [...new Set((Array.isArray(plain(config?.financeTasks)) ? plain(config.financeTasks) : []).map((id) => String(id).slice(0, 100)).filter(Boolean))].slice(0, OWN_MAX),
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
  const profile = openProfile(typeof home === 'function' ? join(home('finance'), 'profile.md') : '');

  // ---- the keys of extra sources: in the app's secret store, never in the settings ----------

  /** Source id -> whether a key is saved (and a masked preview when the store gives one). */
  let keys = {};
  const store = () => {
    const service = ctx.get('credentials');
    if (!service?.resolve) throw new Error('The app\'s secret store is not available, so a key cannot be kept safely.');
    return service;
  };
  const keyOf = async (id) => String((await store().resolve(keyRef(id)))?.value ?? '');
  const refreshKeys = async () => {
    const next = {};
    for (const source of settings().sources) {
      if (source.kind !== 'api' || source.keyIn === 'none') continue;
      try {
        const info = await store().describe(keyRef(source.id));
        next[source.id] = { set: info?.configured === true, masked: typeof info?.masked === 'string' ? info.masked : '' };
      } catch {
        next[source.id] = { set: false, masked: '' };
      }
    }
    keys = next;
  };
  void refreshKeys().catch(() => {});

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
        problem = 'The Modes add-on is not running, so there is no Finance mode. Switch Modes on on the Plugins page.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        problem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const on = settings().enabled;
      const ops = [];
      const next = withFinance(row.value.extraModes, on, settings().adviser);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      // Item 4A, stage 6b (D14): without the Cowork sidebar (and in the lab with spaces off) `defaultMode` still picks a new
      // thread's mode, so it must not name a mode that is gone. With spaces, Modes already skips a start mode whose
      // add-on is off and keeps the owner's choice (lib/spaces.js draftStartMode, startModeGone).
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = '';
    } catch (error) {
      problem = `The Finance mode could not be ${settings().enabled ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
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
  /** Whether a conversation has no tools now (the Tools switch in its chat box is off). */
  const noTools = (agentId) => {
    try {
      return ctx.get('modes')?.noTools?.(agentId) === true;
    } catch {
      return false;
    }
  };

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
                if (ctx.get('modes')?.isolated?.(agent.id) === true) return '';
                const now = settings();
                if (!now.enabled || modeOf(agent.id) !== MODE_ID) return '';
                // A helper agent works for a conversation; it gets that conversation's selection when known.
                const root = agent.header?.parentSession ?? agent.session?.header?.parentSession;
                const note = selectionNote(pins.get(agent.id) ?? (root ? pins.get(root) : undefined) ?? now.selection);
                // The adviser's voice and the user's profile are for the conversation itself. A helper
                // only researches for it, and may run on another model or provider.
                const helper = Boolean(root) || isHelper(agent) || isHelper(agent.session);
                const adviser = now.adviser && !helper;
                // With Tools off the Modes add-on leaves the Finance method out; nothing can be fetched or
                // saved, so the sources and the profile tool go unmentioned and figures are marked as from memory.
                const off = noTools(agent.id);
                const extra = off ? '' : sourcesNote(now.sources, (id) => keys[id]?.set === true);
                const advice = adviser ? adviserNote(profile.read(), Boolean(profileToolOff), off) : '';
                return [note, off ? toolsOffNote(adviser) : '', extra, advice].filter(Boolean).join('\n\n');
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
      // A conversation a scheduled task opened gets the task's name instead, once it is looked up.
      if (!id || !now.enabled || pins.get(id) || adopting.has(id) || modeOf(id) !== MODE_ID) return;
      pins.pin(id, now.selection);
    } catch (error) {
      warn(`could not remember a conversation's selection: ${String(error?.message ?? error)}`);
    }
  });

  // ---- the data tools -------------------------------------------------------------------------

  let toolsOff;
  let sourceToolOff;
  let profileToolOff;
  const syncTools = () => {
    const on = settings().enabled;
    // The tool that adds to the profile exists only while the adviser is on.
    const wantProfile = on && settings().adviser;
    if (wantProfile && !profileToolOff) {
      const tools = ctx.get('tools');
      if (tools?.register) profileToolOff = tools.register(buildProfileTool({ enabled: () => settings().enabled && settings().adviser, profile, guardOf: makeGuardOf(() => ctx.get('modes')) }));
    } else if (!wantProfile && profileToolOff) {
      if (typeof profileToolOff === 'function') profileToolOff();
      profileToolOff = undefined;
    }
    // The tool for extra sources exists only while there is a source it can read.
    const wantSource = on && settings().sources.some((source) => source.kind === 'api' && source.on && (source.keyIn === 'none' || keys[source.id]?.set));
    if (wantSource && !sourceToolOff) {
      const tools = ctx.get('tools');
      if (tools?.register) sourceToolOff = tools.register(buildSourceTool({ enabled: () => settings().enabled, sources: () => settings().sources, keyOf, get: sourceGet }));
    } else if (!wantSource && sourceToolOff) {
      if (typeof sourceToolOff === 'function') sourceToolOff();
      sourceToolOff = undefined;
    }
    if (on && !toolsOff) {
      const tools = ctx.get('tools');
      if (!tools?.register) return;
      // Charts go into the chat through the Diagrams add-on.
      const show = (exec, picture) => {
        try {
          const diagrams = ctx.get('diagrams');
          if (typeof diagrams?.show !== 'function') return { ok: false, errors: ['the Diagrams add-on is not running'] };
          return diagrams.show(exec?.agent, picture);
        } catch (error) {
          return { ok: false, errors: [String(error?.message ?? error).slice(0, 160)] };
        }
      };
      toolsOff = [...buildTools(() => settings().enabled), ...buildMarketTools({ enabled: () => settings().enabled, show })].map((tool) => tools.register(tool));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
    }
  };
  ctx.effect(() => () => {
    for (const dispose of toolsOff ?? []) if (typeof dispose === 'function') dispose();
    toolsOff = undefined;
    if (typeof sourceToolOff === 'function') sourceToolOff();
    sourceToolOff = undefined;
    if (typeof profileToolOff === 'function') profileToolOff();
    profileToolOff = undefined;
  }, 'finance: data tools');

  // ---- the skills -----------------------------------------------------------------------------

  let skillsOff;
  let skillsAdviser = false;
  const syncSkills = () => {
    const on = settings().enabled;
    const adviser = settings().adviser;
    // The skills are worded for one way of working; a flip of the adviser switch replaces them.
    if (skillsOff && adviser !== skillsAdviser) {
      for (const dispose of skillsOff) if (typeof dispose === 'function') dispose();
      skillsOff = undefined;
    }
    if (on && !skillsOff) {
      const skills = ctx.get('skills');
      if (!skills?.register) return;
      skillsAdviser = adviser;
      skillsOff = (adviser ? adviserSkills(SKILLS) : SKILLS).map((skill) => skills.register({ ...skill, source: 'custom', invocation: { modelInvocable: true, userInvocable: true } }));
    } else if (!on && skillsOff) {
      for (const dispose of skillsOff) if (typeof dispose === 'function') dispose();
      skillsOff = undefined;
    }
  };
  const skillTimer = setInterval(() => {
    void refreshKeys().catch(() => {});
    void rewordBriefs().catch((error) => warn(`could not reword the briefs: ${String(error?.message ?? error)}`));
    try {
      syncTools();
      syncSkills();
    } catch (error) {
      warn(`could not update the skills: ${String(error?.message ?? error)}`);
    }
  }, 3000);
  skillTimer.unref?.();
  try {
    syncTools();
    syncSkills();
  } catch (error) {
    warn(`could not add the tools and skills: ${String(error?.message ?? error)}`);
  }
  ctx.effect(() => () => {
    clearInterval(skillTimer);
    for (const dispose of skillsOff ?? []) if (typeof dispose === 'function') dispose();
    skillsOff = undefined;
  }, 'finance: skills');

  // ---- the pages' data -------------------------------------------------------------------------

  // ---- scheduled briefs: tasks in the app's own scheduler ------------------------------------

  const scheduler = () => {
    const service = ctx.get('schedule');
    if (!service?.create) throw new Error('The app\'s scheduler is not running, so a brief cannot be scheduled.');
    return service;
  };
  const listBriefs = async () => {
    try {
      return briefsOf(await scheduler().catalog());
    } catch {
      return [];
    }
  };
  const addBrief = async (subject, rhythm, hour) => {
    const title = briefTitle(subject);
    if (title === BRIEF_PREFIX) throw new Error('Name what the brief is about.');
    if ((await listBriefs()).some((brief) => brief.subject.toLowerCase() === title.slice(BRIEF_PREFIX.length).toLowerCase())) throw new Error('There is already a brief for that.');
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const result = await scheduler().create({
      title,
      prompt: briefPrompt(subject, settings().selection.market, rhythm),
      timing: { kind: 'rrule', rrule: briefRule(rhythm, hour, zone) },
      target: { kind: 'new' },
    });
    if (result?.code) throw new Error(`The scheduler refused: ${result.message ?? result.code}`);
  };
  const removeBrief = async (id) => {
    const brief = (await listBriefs()).find((item) => item.id === id);
    if (!brief) throw new Error('That brief is gone.');
    const result = await scheduler().edit({ id, action: 'delete' });
    if (result?.code) throw new Error(`The scheduler refused: ${result.message ?? result.code}`);
  };

  // Briefs made while the adviser was on used to carry the adviser's wording in their own
  // instruction, so they kept advising after the switch went off. They are reworded once, as soon
  // as the scheduler is there; while the adviser is on, its note still makes them recommend.
  // A pass that fails (the scheduler still starting, or a brief that ran or changed at that
  // moment) is tried again from the same timer, up to five times in one app run.
  let briefsReworded = false;
  let rewordTries = 0;
  let rewording = false;
  const rewordBriefs = async () => {
    const service = ctx.get('schedule');
    if (briefsReworded || rewording || rewordTries >= 5 || !service?.catalog || !service.edit) return;
    rewording = true;
    rewordTries += 1;
    try {
      let left = 0;
      for (const task of await service.catalog()) {
        const prompt = String(task?.title ?? '').startsWith(BRIEF_PREFIX) ? researchOnly(task.prompt) : undefined;
        if (!prompt) continue;
        const result = await service.edit({ id: task.id, action: 'update', patch: { prompt }, expectedUpdatedAt: task.updatedAt ?? null });
        if (result?.code) {
          left += 1;
          warn(`could not reword the brief "${task.title}": ${result.message ?? result.code}`);
        }
      }
      if (left === 0) briefsReworded = true;
    } finally {
      rewording = false;
    }
  };

  const listOwn = async () => {
    try {
      return ownTasksOf(await scheduler().catalog(), settings().financeTasks);
    } catch {
      return [];
    }
  };

  // A conversation that a Finance brief opens belongs in Finance: it gets the Finance mode (and so
  // the Finance tab) instead of the mode the app gives scheduled conversations. The same goes for
  // a task of the owner's own that they marked on the Finance page.
  /** Conversations moved to Finance whose task name is still being looked up for their note. */
  const adopting = new Set();
  const adopt = async (sessionId, found) => {
    const now = settings();
    if (!now.enabled) return;
    const own = found.ids.find((id) => now.financeTasks.includes(id));
    if (!found.subject && !own) {
      // A Finance brief whose instruction was edited no longer names its subject in the text: it is
      // still known by its title in the scheduler. This lookup waits, so the move may come late;
      // meanwhile the first turn must not pin the drop-down selection in the brief's place.
      adopting.add(sessionId);
      try {
        const task = (await scheduler().catalog()).find((entry) => found.ids.includes(String(entry.id)) && String(entry.title ?? '').startsWith(BRIEF_PREFIX));
        if (!task || !settings().enabled) return;
        pins.pin(sessionId, { kind: 'brief', subject: String(task.title).slice(BRIEF_PREFIX.length) || 'Automation', market: found.market || 'Global' });
        const modes = ctx.get('modes');
        if (modes?.set) await modes.set(sessionId, MODE_ID, { claim: true });
      } finally {
        adopting.delete(sessionId);
      }
      return;
    }
    // Everything up to the move runs before the first await, so the move lands while the
    // conversation is still idle and its first turn already gets Finance's tools.
    const market = found.market || 'Global';
    if (found.subject) pins.pin(sessionId, { kind: 'brief', subject: found.subject, market });
    else adopting.add(sessionId);
    const modes = ctx.get('modes');
    // Always with the claim, even when Modes already reports Finance: before the conversation is
    // known to come from the scheduler, that may only be the selected tab speaking.
    if (modes?.set) void modes.set(sessionId, MODE_ID, { claim: true }).catch((error) => warn(`could not move a brief to Finance: ${String(error?.message ?? error)}`));
    if (found.subject) return;
    // A task of the owner's own is named in the scheduler only; its name is looked up afterwards.
    try {
      const task = (await scheduler().catalog()).find((entry) => String(entry.id) === own);
      pins.pin(sessionId, { kind: 'brief', subject: String(task?.title ?? '') || 'Automation', market });
    } finally {
      adopting.delete(sessionId);
    }
  };
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'agent/inbox/spliced' || isHelper(session) || !session?.id) return;
      const found = scheduledIn(event.data?.inserted);
      if (found.ids.length === 0) return;
      void adopt(session.id, found).catch((error) => warn(`could not move a brief to Finance: ${String(error?.message ?? error)}`));
    } catch (error) {
      warn(`could not look at a scheduled message: ${String(error?.message ?? error)}`);
    }
  });

  // ---- the pages' data -------------------------------------------------------------------------

  const view = async () => {
    const now = settings();
    return {
      at: Date.now(),
      ...now,
      profile: profile.read(),
      sources: now.sources.map((source) => ({ ...source, keySet: keys[source.id]?.set === true, keyShown: keys[source.id]?.masked ?? '' })),
      presets: PRESETS,
      briefs: await listBriefs(),
      ownTasks: await listOwn(),
      rhythms: RHYTHMS.map(({ id, label }) => ({ id, label })),
      problem,
      kinds: KINDS,
      markets: [...MARKETS, ...now.moreMarkets],
      focuses: FOCUSES.map(({ id, label }) => ({ id, label })),
      periods: PERIODS.map(({ id, label }) => ({ id, label })),
      skills: SKILLS.map((skill) => ({ name: skill.name, description: skill.description })),
      skillsOn: Boolean(skillsOff),
      toolsOn: Boolean(toolsOff),
    };
  };

  // ---- the chat box of a Finance conversation: its own selection --------------------------------

  /** Whether a conversation has had its first message (a turn has started). */
  const started = (id) => {
    try {
      const agents = ctx.get('agents');
      const session = agents?.get?.(id)?.session;
      if (!session || typeof agents.turnBoundaryOf !== 'function') return false;
      const boundary = agents.turnBoundaryOf(session);
      return Number(boundary?.lastTurn) > 0 || (boundary?.openTurnStartSeq ?? null) !== null;
    } catch {
      return false;
    }
  };
  /** Why the chat box of a conversation shows no selection; '' when it shows one. */
  const notShown = (id) => {
    if (!settings().enabled) return 'Finance is switched off.';
    if (!id || modeOf(id) !== MODE_ID) return 'This is not a Finance thread.';
    let helper = false;
    try {
      const session = ctx.get('agents')?.get?.(id)?.session;
      helper = isHelper(session) || Boolean(session?.header?.parentSession);
    } catch {
      helper = false;
    }
    if (helper) return 'A helper follows the selection of its thread.';
    // Before the first message, the drop-downs on the start page are the selection.
    if (!pins.get(id) && !started(id)) return 'Before the first message, the drop-downs under the message box set the selection.';
    return '';
  };
  /** What the chat box needs: the lists, and the conversation's selection. */
  const chatView = (id) => {
    const now = settings();
    const pin = pins.get(id);
    return {
      enabled: now.enabled,
      kinds: KINDS,
      markets: [...MARKETS, ...now.moreMarkets],
      focuses: FOCUSES.map(({ id: value, label, text }) => ({ id: value, label, about: text })),
      periods: PERIODS.map(({ id: value, label, text }) => ({ id: value, label, about: text })),
      watchlist: now.watchlist,
      // Whether the adviser is on, so the chat box can show the standing label that the app gives no way to append to an answer.
      adviser: now.adviser,
      session: { id, shown: notShown(id) === '', pinned: Boolean(pin), selection: pin ?? now.selection },
    };
  };
  /**
   * A change in the chat box: it becomes that conversation's selection, and only that one's. A
   * market must be on the Market list (built-in or your own) or be the conversation's market now.
   */
  const changePin = (id, values) => {
    const reason = notShown(id);
    if (reason) throw new Error(reason);
    const now = settings();
    return pins.set(id, changeSelection(pins.get(id) ?? now.selection, values, [...MARKETS, ...now.moreMarkets]));
  };

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
              // The chat box of one conversation asks with `?session=<id>` and gets only what it needs.
              const session = String(new URL(req.url ?? '/', 'http://local').searchParams.get('session') ?? '').slice(0, 200);
              if (req.method === 'GET' && session) {
                res.end(JSON.stringify(chatView(session)));
                return;
              }
              let extra = {};
              let chat = '';
              if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 16384) throw new Error('request too large');
                  chunks.push(chunk);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                const source = settings().sources.find((item) => item.id === String(body?.id ?? ''));
                switch (body?.action) {
                  case 'check': {
                    const reason = addressProblem(body.baseUrl);
                    if (reason) throw new Error(reason);
                    break;
                  }
                  case 'key': {
                    if (!source || source.kind !== 'api') throw new Error('Save the source first, then its key.');
                    const value = String(body.value ?? '').trim();
                    if (value.length < 4 || value.length > 500 || /\s/.test(value)) throw new Error('That does not look like a key.');
                    await store().set(keyRef(source.id), value);
                    await refreshKeys();
                    break;
                  }
                  case 'forget':
                    // Works for a source that was just removed too, so no key is left behind.
                    if (!/^[a-z0-9-]{1,30}$/.test(String(body.id ?? ''))) throw new Error('unknown source');
                    await store().unset(keyRef(String(body.id)));
                    await refreshKeys();
                    break;
                  case 'test': {
                    if (!source || source.kind !== 'api') throw new Error('unknown source');
                    extra = { tested: (await sourceGet(source, source.keyIn === 'none' ? '' : await keyOf(source.id), body.path, body.query)).slice(0, 1500) };
                    break;
                  }
                  case 'brief':
                    await addBrief(body.subject, String(body.rhythm ?? 'weekdays'), Number(body.hour ?? 8));
                    break;
                  case 'profile':
                    profile.save(body.text);
                    break;
                  case 'unbrief':
                    await removeBrief(String(body.id ?? ''));
                    break;
                  case 'pin':
                    // The chat box of a Finance conversation: `{ sessionId, values: { kind?, subject?, market?, focus?, period? } }`.
                    chat = String(body.sessionId ?? '').slice(0, 200);
                    changePin(chat, body.values);
                    break;
                  default:
                    throw new Error('unknown action');
                }
                if (chat) {
                  res.end(JSON.stringify(chatView(chat)));
                  return;
                }
                syncTools();
              }
              res.end(JSON.stringify({ ...(await view()), ...extra }));
              // The switch on the page should take effect at once, not at the next tick.
              void syncMode();
            } catch (error) {
              res.statusCode = req.method === 'POST' ? 400 : 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
            }
          },
        }),
      'finance: data route',
    );
  });

}
