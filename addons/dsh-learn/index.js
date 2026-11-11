/**
 * Learning: a tutor that makes the learner do the thinking.
 *
 * Research on learning with AI points one way: being told is quick and teaches
 * little; trying first and being helped in small steps teaches more. This
 * add-on turns a conversation into a study session with rules to that effect:
 * a question before any teaching, hints one small step at a time, the answer
 * last, an explanation in the learner's own words, and a review days later.
 *
 * The rules are kept here, not left to the model: the tools refuse a hint or an
 * answer that the level in force does not allow yet, and the tutor is told the
 * current stage before each of its turns.
 *
 * Tools: learn_plan, learn_mark, learn_review, learn_status, learn_end.
 * Skill: study-tutor. Command: /learn. Record: topics.json under the dsh home
 * (`learn/`), holding questions and outcomes, never what the learner wrote.
 *
 * Service `learning` (apiVersion 1): `due()`, `stats()`.
 * Routes: GET /dsh-learn/status, GET /dsh-learn/overview, POST /dsh-learn/action.
 */
import z from '@deepseek-ai/schemastery';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { apply as applyEvent, can, EVENTS, freshIdea, guidance, LEVEL_RULES, LEVELS, MAX_HINTS, outcomeOf, stageLabel } from './lib/rules.js';
import { dueIdeas, whenText } from './lib/schedule.js';
import { openStore, readPlan, SOURCES } from './lib/store.js';
import { SKILLS } from './skills.js';

export const name = 'dsh-learn';
export const inject = ['tools'];

export const STATUS_PATH = '/dsh-learn/status';
export const OVERVIEW_PATH = '/dsh-learn/overview';
export const ACTION_PATH = '/dsh-learn/action';
export const ACTION_HEADER = 'x-dsh-learn';
const BODY_LIMIT = 8 * 1024;

export const Config = z.object({
  /** Master switch. */
  enabled: z.boolean().default(true).volatile(),
  /** How firmly answers are held back in a new session: gentle, firm or strict. */
  level: z.string().default('firm').volatile(),
  /** Most ideas in one review session. */
  reviewSize: z.number().min(1).max(30).default(10).volatile(),
  /** Where the record is kept; default is a folder in the dsh home. */
  dataDir: z.string(),
  /** Register the study-tutor skill. */
  skills: z.boolean().default(true),
  /** Slash command; empty registers none. */
  commandName: z.string().default('learn'),
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

/**
 * Read the settings as plain, checked values.
 * @param {object} config - live Config.
 * @returns {{enabled: boolean, level: string, reviewSize: number}} settings.
 */
export function readSettings(config) {
  const level = String(plain(config.level) ?? 'firm');
  const size = Number(plain(config.reviewSize));
  return { enabled: plain(config.enabled) !== false, level: LEVELS.includes(level) ? level : 'firm', reviewSize: Number.isFinite(size) ? Math.min(30, Math.max(1, Math.round(size))) : 10 };
}

/**
 * Read a small JSON request body.
 * @param {import('node:http').IncomingMessage} req - request.
 * @returns {Promise<object | undefined>} parsed body, or undefined when it is too large or not a JSON object.
 */
export async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) return undefined;
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The study sessions of all conversations: starting, moving through the ideas,
 * recording outcomes. Exported for tests; `apply` wires it to the app.
 * @param {{store: object, settings: () => object, now?: () => number, keep?: {load: () => object, save: (value: object) => void}}} deps - the record,
 *   the settings, a clock, and somewhere to keep running sessions across a restart.
 * @returns {object} the session keeper.
 */
export function createSessions({ store, settings, now = Date.now, keep }) {
  /** Conversation id -> its study session. */
  const sessions = new Map();
  /** Conversation id -> what the learner asked for with /learn, until the tutor has made a plan. */
  const pending = new Map();
  try {
    const kept = keep?.load() ?? {};
    for (const [id, session] of Object.entries(kept.sessions ?? {})) {
      // Only sessions whose ideas still exist are taken up again.
      const whole = Array.isArray(session?.order) && session.order.length > 0 && session.order.every((at) => store.topic(at.topicId)?.ideas.some((idea) => idea.id === at.ideaId));
      if (whole && Number.isInteger(session.at) && session.at < session.order.length) sessions.set(id, session);
    }
    for (const [id, wish] of Object.entries(kept.pending ?? {})) if (wish && typeof wish === 'object') pending.set(id, wish);
  } catch {
    // Start with no sessions.
  }
  const persist = () => {
    try {
      keep?.save({ sessions: Object.fromEntries(sessions), pending: Object.fromEntries(pending) });
    } catch {
      // The session still runs; it just will not survive a restart.
    }
  };

  const ideaOf = (session) => {
    const at = session.order[session.at];
    const topic = store.topic(at.topicId);
    return { topic, idea: topic?.ideas.find((item) => item.id === at.ideaId) };
  };
  const about = (session) => {
    const { topic } = ideaOf(session);
    return { title: session.title, source: session.review ? { kind: 'topic', ref: '' } : topic?.source ?? { kind: 'topic', ref: '' }, total: session.order.length, at: session.at, review: session.review };
  };
  const tell = (session) => {
    const { idea } = ideaOf(session);
    return idea ? guidance(session, idea, about(session)) : '';
  };

  function begin(sessionId, order, title, review, level) {
    const session = { title, review, order, at: 0, level: LEVELS.includes(level) ? level : settings().level, results: [], startedAt: now(), ...freshIdea() };
    sessions.set(sessionId, session);
    pending.delete(sessionId);
    return session;
  }

  /** Close the idea in hand: record how it went and step to the next one. */
  function finishIdea(sessionId, session) {
    const at = session.order[session.at];
    const outcome = outcomeOf(session);
    const next = store.record(at.topicId, at.ideaId, outcome, session.hints, now());
    const { idea } = ideaOf(session);
    session.results.push({ title: idea?.title ?? '', outcome, hints: session.hints, days: next?.days ?? 1 });
    session.at += 1;
    Object.assign(session, freshIdea());
    if (session.at < session.order.length) return { done: false };
    sessions.delete(sessionId);
    return { done: true, summary: summaryOf(session) };
  }

  function summaryOf(session) {
    const words = { alone: 'solved alone', hints: 'solved with hints', shown: 'answer shown' };
    return [
      `The session "${session.title}" is finished: ${session.results.length} idea${session.results.length === 1 ? '' : 's'}.`,
      ...session.results.map((result) => `- ${result.title}: ${words[result.outcome]}${result.hints > 0 && result.outcome !== 'alone' ? ` (${result.hints} hint${result.hints === 1 ? '' : 's'})` : ''}; comes back in ${result.days} day${result.days === 1 ? '' : 's'}.`),
      'Tell the learner this in a few friendly lines, name what went well, and stop tutoring. The record is saved.',
    ].join('\n');
  }

  /** Run a change, then keep the new state. */
  const saving = (fn) => (...args) => {
    const result = fn(...args);
    persist();
    return result;
  };

  const api = {
    get: (sessionId) => sessions.get(sessionId),
    pendingFor: (sessionId) => pending.get(sessionId),

    /** The learner asked to study something (or to review); the tutor has not planned yet. */
    request(sessionId, wish) {
      pending.set(sessionId, { request: String(wish.request ?? '').slice(0, 500), review: wish.review === true, level: LEVELS.includes(wish.level) ? wish.level : settings().level });
    },

    /** The tutor's plan: store it and start with its first idea. */
    plan(sessionId, raw) {
      if (sessions.has(sessionId)) return { error: 'A study session is already running in this conversation. Finish it, or call learn_end first.' };
      const read = readPlan(raw);
      if (read.error) return { error: read.error };
      const topic = store.add(read.topic);
      const session = begin(sessionId, topic.ideas.map((idea) => ({ topicId: topic.id, ideaId: idea.id })), topic.title, false, pending.get(sessionId)?.level);
      return { session, text: `The plan is saved: "${topic.title}", ${topic.ideas.length} ideas.\n\n${tell(session)}` };
    },

    /** Start a review of the ideas that are due. */
    review(sessionId) {
      if (sessions.has(sessionId)) return { error: 'A study session is already running in this conversation. Finish it, or call learn_end first.' };
      const due = dueIdeas(store.topics(), now()).slice(0, settings().reviewSize);
      if (due.length === 0) {
        pending.delete(sessionId);
        return { error: 'Nothing is due for review. Tell the learner so; they can study something new instead.' };
      }
      const session = begin(sessionId, due.map((item) => ({ topicId: item.topicId, ideaId: item.ideaId })), `Review (${due.length} idea${due.length === 1 ? '' : 's'})`, true, pending.get(sessionId)?.level);
      return { session, text: `Review started: ${due.length} idea${due.length === 1 ? '' : 's'} due.\n\n${tell(session)}` };
    },

    /** Something happened in the session, reported by the tutor. */
    mark(sessionId, event) {
      const session = sessions.get(sessionId);
      if (!session) return { text: 'No study session is running in this conversation. Call learn_plan to start one, or learn_review to review what is due.' };
      if (!EVENTS.includes(event)) return { text: `Unknown event "${event}". Use one of: ${EVENTS.join(', ')}.` };
      const allowed = can(session, event);
      if (!allowed.ok) return { text: `Not allowed: ${allowed.why}\n\n${tell(session)}` };
      if (event === 'next') {
        const finished = finishIdea(sessionId, session);
        return { text: finished.done ? finished.summary : `Recorded. Idea ${session.at + 1} of ${session.order.length} now.\n\n${tell(session)}` };
      }
      Object.assign(session, applyEvent(session, event));
      return { text: `Recorded: ${event}.\n\n${tell(session)}` };
    },

    /** The learner's own choices, from the study bar or the command. */
    choose(sessionId, action, value) {
      const session = sessions.get(sessionId);
      if (action === 'end') {
        const had = sessions.delete(sessionId) || pending.delete(sessionId);
        return had ? { ok: true, text: 'The study session is ended. What you finished is saved.' } : { ok: false, text: 'No study session is running here.' };
      }
      if (action === 'level') {
        if (!LEVELS.includes(value)) return { ok: false, text: `The levels are: ${LEVELS.join(', ')}.` };
        if (session) session.level = value;
        else if (pending.has(sessionId)) pending.get(sessionId).level = value;
        else return { ok: false, text: 'No study session is running here.' };
        return { ok: true, text: LEVEL_RULES[value] };
      }
      if (!session) return { ok: false, text: 'No study session is running here.' };
      if (action === 'giveup') {
        const allowed = can(session, 'giveup');
        if (!allowed.ok) return { ok: false, text: allowed.why };
        Object.assign(session, applyEvent(session, 'giveup'));
        return { ok: true, text: 'Recorded. The tutor will show the answer; this idea comes back tomorrow.' };
      }
      return { ok: false, text: 'Unknown action.' };
    },

    /** What the tutor is told before its next turn; empty outside a session. */
    instructions(sessionId) {
      const session = sessions.get(sessionId);
      if (session) return tell(session);
      const wish = pending.get(sessionId);
      if (!wish) return '';
      if (wish.review) return '## Study request\nThe learner asked to review what is due. Call learn_review now, then put the first question. Do not explain anything before they have tried.';
      return [
        '## Study request',
        `The learner wants to study: ${wish.request}`,
        `Level: ${LEVEL_RULES[wish.level]}`,
        'Do this now, before teaching anything:',
        '1. If the request names a file, read it first (pdf_info and pdf_read for a PDF; the read tool for notes or code).',
        '2. Break the material into 5 to 9 small ideas, in the order they build on each other. For each, write a question the learner can attempt before being taught: one that needs reasoning or a guess, not a definition to recite.',
        '3. Call learn_plan with the title, the source and the ideas. Then show the learner the idea titles in one short message and put the first question.',
        'Do not explain any idea before the learner has tried its question.',
      ].join('\n');
    },

    /** What the study bar shows for a conversation. */
    view(sessionId) {
      const session = sessions.get(sessionId);
      const wish = pending.get(sessionId);
      if (!session) return { session: null, pending: wish ? { request: wish.review ? 'Review what is due' : wish.request, level: wish.level } : null };
      const { idea } = ideaOf(session);
      return {
        pending: null,
        session: {
          title: session.title,
          review: session.review,
          at: session.at,
          total: session.order.length,
          idea: idea?.title ?? '',
          level: session.level,
          stage: session.stage,
          label: stageLabel(session),
          hints: session.hints,
          maxHints: MAX_HINTS,
          canHint: can(session, 'hint'),
          canGiveUp: session.gaveUp ? { ok: false, why: 'Already asked for.' } : can(session, 'giveup'),
        },
      };
    },
  };
  for (const method of ['request', 'plan', 'review', 'mark', 'choose']) api[method] = saving(api[method]);
  return api;
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const settings = () => readSettings(config);
  const dataDir = String(plain(config.dataDir) ?? '').trim() || ctx.get('dshHomePath')?.('learn') || '';
  if (!dataDir) ctx.logger?.warn?.('learn: no data folder is available; the record is kept in memory only');
  const store = openStore(dataDir);
  const sessionFile = dataDir ? join(dataDir, 'sessions.json') : '';
  const keep = {
    load: () => (sessionFile && existsSync(sessionFile) ? JSON.parse(readFileSync(sessionFile, 'utf8')) : {}),
    save: (value) => {
      if (!sessionFile) return;
      mkdirSync(dataDir, { recursive: true });
      writeFileSync(sessionFile, JSON.stringify(value));
    },
  };
  const sessions = createSessions({ store, settings, keep });
  const idOf = (agent) => String(agent?.session?.id ?? agent?.sessionId ?? agent?.id ?? '');
  const off = 'Learning is switched off in Settings → Learning.';

  // ---- the tutor is told the stage before each of its turns ----------------------
  const sections = new Map();
  function installPrompt(agent) {
    try {
      if (sections.has(agent.id) || !agent?.ctx?.systemPrompt) return;
      const dispose = agent.ctx.effect(
        () =>
          agent.ctx.systemPrompt.section({
            name: 'learn:session',
            order: 74,
            // The text holds titles and questions a model wrote: a stray {{...}} must not break prompt assembly.
            interpolate: false,
            text: () => {
              try {
                return settings().enabled ? sessions.instructions(idOf(agent)) : '';
              } catch {
                return '';
              }
            },
          }),
        'learn session section',
      );
      if (typeof dispose === 'function') sections.set(agent.id, dispose);
    } catch (error) {
      ctx.logger?.warn?.(`learn: could not add the session section: ${error?.message ?? error}`);
    }
  }
  ctx.on('agent/created', ({ agent }) => installPrompt(agent));
  for (const agent of ctx.get('agents')?.list() ?? []) installPrompt(agent);
  ctx.on('agent/disposed', ({ agent }) => {
    try {
      sections.get(agent.id)?.();
    } catch {
      // Already gone.
    }
    sections.delete(agent.id);
  });

  // ---- tools ---------------------------------------------------------------------
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  const tool = (definition, body) => ({
    ...definition,
    output,
    timeoutMs: 15_000,
    isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      if (!settings().enabled) return { text: off };
      try {
        return { text: body(args ?? {}, idOf(exec?.agent)) };
      } catch (error) {
        return { text: `That did not work: ${String(error?.message ?? error).slice(0, 200)}` };
      }
    },
  });
  const tools = [
    tool(
      {
        name: 'learn_plan',
        description: 'Start a study session: save the plan (5 to 9 small ideas, each with a question the learner tries before being taught) and get the first step. Read the source first if there is one.',
        parameters: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'What is being studied.' },
            source: { type: 'object', properties: { kind: { type: 'string', enum: SOURCES, description: 'pdf, notes, topic (no source) or code.' }, ref: { type: 'string', description: 'The file path, or a few words.' } } },
            ideas: { type: 'array', description: 'In the order they build on each other.', items: { type: 'object', properties: { title: { type: 'string', description: 'A few words.' }, question: { type: 'string', description: 'A question to attempt before being taught; needs reasoning, not recall of a definition.' } }, required: ['title', 'question'] } },
          },
          required: ['title', 'ideas'],
        },
      },
      (args, id) => {
        const started = sessions.plan(id, args);
        return started.error ? `The plan was not saved: ${started.error}` : started.text;
      },
    ),
    tool(
      {
        name: 'learn_mark',
        description: 'Record what just happened in the study session and learn what the rules allow next. Call it after each attempt, hint, solution, shown answer and explanation. If it answers "Not allowed", do not do that thing.',
        parameters: { type: 'object', properties: { event: { type: 'string', enum: EVENTS, description: 'attempt: the learner tried. stuck: they said where they are stuck. hint: you gave a hint. solved: their answer is right. answer_shown: you gave the answer. explained: they explained it back. next: go to the next idea.' } }, required: ['event'] },
      },
      (args, id) => sessions.mark(id, String(args.event ?? '')).text,
    ),
    tool(
      { name: 'learn_review', description: 'Start a review session with the ideas that are due today. Use when the learner asks to review or to be quizzed on what they learned.', parameters: { type: 'object', properties: {} } },
      (_args, id) => {
        const started = sessions.review(id);
        return started.error ?? started.text;
      },
    ),
    tool({ name: 'learn_status', description: 'Where the study session stands and what to do next; and what is due for review.', parameters: { type: 'object', properties: {} } }, (_args, id) => {
      const due = dueIdeas(store.topics(), Date.now());
      const text = sessions.instructions(id);
      return `${text || 'No study session is running in this conversation.'}\n\nDue for review: ${due.length}${due.length > 0 ? ` (${due.slice(0, 5).map((item) => item.title).join('; ')}${due.length > 5 ? '; …' : ''})` : ''}.`;
    }),
    tool({ name: 'learn_end', description: 'End the study session because the learner asked to stop. What was finished stays saved.', parameters: { type: 'object', properties: {} } }, (_args, id) => sessions.choose(id, 'end').text),
  ];
  for (const definition of tools) ctx.effect(() => ctx.tools.register(definition), `learn tool ${definition.name}`);

  if (plain(config.skills) !== false) {
    const skills = ctx.get('skills');
    if (skills?.register) {
      for (const skill of SKILLS) ctx.effect(() => skills.register({ ...skill, source: 'custom', invocation: { modelInvocable: true, userInvocable: true } }), `learn skill ${skill.name}`);
    } else ctx.logger?.warn?.('learn: the skills service is not available; the study-tutor skill is not registered');
  }

  ctx.effect(() => ctx.provide('learning', Object.freeze({ apiVersion: 1, due: () => dueIdeas(store.topics(), Date.now()), stats: () => store.stats() })), 'learning service');

  /** Everything the progress page shows. */
  function overview() {
    const now = Date.now();
    return {
      settings: settings(),
      levels: LEVEL_RULES,
      stats: store.stats(),
      due: dueIdeas(store.topics(), now).map((item) => ({ topic: item.topic, title: item.title, when: whenText(item.due, now) })),
      topics: [...store.topics()].reverse().map((topic) => ({
        id: topic.id,
        title: topic.title,
        source: topic.source,
        createdAt: topic.createdAt,
        ideas: topic.ideas.map((idea) => ({ title: idea.title, step: idea.step, when: Number.isFinite(idea.due) ? whenText(idea.due, now) : '', last: idea.history?.at(-1)?.outcome ?? '' })),
      })),
    };
  }

  ctx.inject(['webServer', 'connection'], (inner) => {
    const guard = (req, res, method) => {
      const refused = inner.connection.requestRejection(req);
      if (refused !== undefined) {
        res.statusCode = refused;
        res.end();
        return false;
      }
      if (req.method !== method) {
        res.statusCode = 405;
        res.setHeader('allow', method);
        res.end();
        return false;
      }
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      return true;
    };
    const sessionOf = (req) => {
      const header = req.headers?.['x-dsh-session'];
      return typeof header === 'string' && /^[\w.:-]{1,120}$/.test(header) ? header : '';
    };
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: STATUS_PATH,
          handler: (req, res) => {
            if (!guard(req, res, 'GET')) return;
            const now = settings();
            res.end(JSON.stringify({ settings: now, levels: LEVEL_RULES, due: dueIdeas(store.topics(), Date.now()).length, ...(now.enabled ? sessions.view(sessionOf(req)) : { session: null, pending: null }) }));
          },
        }),
      'learn: GET status route',
    );
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: OVERVIEW_PATH,
          handler: (req, res) => {
            if (!guard(req, res, 'GET')) return;
            res.end(JSON.stringify(overview()));
          },
        }),
      'learn: GET overview route',
    );
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: ACTION_PATH,
          handler: async (req, res) => {
            if (!guard(req, res, 'POST')) return;
            const fail = (code, message) => {
              res.statusCode = code;
              res.end(JSON.stringify({ error: message }));
            };
            try {
              if (req.headers?.[ACTION_HEADER] !== '1' || !String(req.headers?.['content-type'] ?? '').startsWith('application/json')) return fail(400, 'This request did not come from the Learning add-on.');
              const body = await readBody(req);
              if (!body || typeof body.action !== 'string') return fail(400, 'Unknown action.');
              if (body.action === 'removeTopic') {
                return store.remove(String(body.id ?? '')) ? res.end(JSON.stringify(overview())) : fail(404, 'There is no such topic.');
              }
              const id = sessionOf(req);
              if (!id) return fail(400, 'No conversation was named.');
              const outcome = sessions.choose(id, body.action, body.value);
              if (!outcome.ok) return fail(409, outcome.text);
              res.end(JSON.stringify({ text: outcome.text, ...sessions.view(id) }));
            } catch (error) {
              fail(500, String(error?.message ?? error).slice(0, 200));
            }
          },
        }),
      'learn: POST action route',
    );
  });

  const commandName = String(plain(config.commandName) ?? '').trim();
  if (!commandName) return;
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: commandName,
          description: 'Study with a tutor that makes you think first: `/learn <topic or file>`, `/learn review`, `/learn level gentle|firm|strict`, `/learn end`',
          input: { hint: '<topic or file> | review | level <name> | end' },
          handler: async ({ agent, rawInput }) => {
            if (!settings().enabled) return { kind: 'success', text: off };
            const id = idOf(agent);
            const wish = String(rawInput ?? '').trim();
            const [first, second] = wish.toLowerCase().split(/\s+/);
            if (!wish || first === 'status') {
              const view = sessions.view(id);
              const due = dueIdeas(store.topics(), Date.now()).length;
              const lines = [];
              if (view.session) lines.push(`Studying "${view.session.title}": idea ${view.session.at + 1} of ${view.session.total} (${view.session.idea}). ${view.session.label}. Level: ${view.session.level}.`);
              else if (view.pending) lines.push(`Ready to study: ${view.pending.request}. Send a message to begin.`);
              else lines.push(`No study session here. Start one with /${commandName} <topic or file>.`);
              lines.push(`Due for review: ${due}.${due > 0 ? ` Start with /${commandName} review.` : ''}`);
              return { kind: 'success', text: lines.join('\n') };
            }
            if (first === 'end' || first === 'stop') return { kind: 'success', text: sessions.choose(id, 'end').text };
            if (first === 'level') {
              const outcome = sessions.choose(id, 'level', second);
              return { kind: outcome.ok ? 'success' : 'error', text: outcome.text };
            }
            if (sessions.get(id)) return { kind: 'error', text: `A study session is already running here. End it first with /${commandName} end.` };
            if (first === 'review' && !second) {
              const due = dueIdeas(store.topics(), Date.now()).length;
              if (due === 0) return { kind: 'success', text: 'Nothing is due for review today.' };
              sessions.request(id, { review: true });
              return { kind: 'success', text: `${due} idea${due === 1 ? ' is' : 's are'} due. Press Start in the study bar, or send any message, to begin the review.` };
            }
            sessions.request(id, { request: wish });
            return { kind: 'success', text: `Ready to study: ${wish}\nLevel: ${LEVEL_RULES[settings().level]}\nPress Start in the study bar, or send any message, to begin. The tutor will ask before it explains.` };
          },
        }),
      'learn command',
    );
  });
}
