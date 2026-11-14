/**
 * Engines: outside coding engines in dsh's Code mode, and a page that compares one with dsh.
 *
 * Using an engine: each engine is offered as a model ("OpenCode (engine)"). Picked for a Code
 * conversation, it answers instead of dsh's own loop: it gets the user's message as its task and
 * works in a copy of the project inside a lock. What it changed goes into the project when the
 * permission mode says so (a Mission mode, else the `applyWhen` setting), or on /engine apply.
 * See lib/model.js, lib/room.js, lib/apply.js.
 *
 * Compare: the same coding task given to dsh and to an outside coding engine, side by side.
 *
 * Each side works in its own copy of the project, so they cannot get in each other's way and the
 * project itself is not touched. The page shows, per side: tokens, steps, time, cost, whether it
 * finished, what it answered, and what it changed.
 *
 *   - The dsh side is an ordinary Code conversation that the page starts in its copy. This add-on
 *     follows that conversation's events and counts.
 *   - The other side is an engine's own program (OpenCode first), started for one task in its
 *     machine-readable mode, inside a lock: it can change files only in its copy and in its own
 *     settings folders, and cannot read the rest of the user's home. See lib/lock.js.
 *   - An engine is one file in lib/engines. Adding one means adding a file and naming it here.
 *
 * Nothing runs until a comparison is started on the page. Route: `GET/POST /dsh-engines/state`.
 */
import z from '@deepseek-ai/schemastery';
import { randomBytes } from 'node:crypto';
import { existsSync, realpathSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { apply as applyChanges, listing, pending, undoLast } from './lib/apply.js';
import { copyProject, difference } from './lib/copy.js';
import * as opencode from './lib/engines/opencode.js';
import { engineModels } from './lib/model.js';
import { clearRoom, prepareRoom } from './lib/room.js';
import { emptyPane, runEngine } from './lib/runner.js';
import { ended, openRuns } from './lib/runs.js';

export const name = 'dsh-engines';
export const STATE_PATH = '/dsh-engines/state';

/** The outside engines. One file each in lib/engines. */
const ENGINES = { [opencode.id]: opencode };

export const Config = z.object({
  /** Where the OpenCode program is. Empty looks in the usual places. Plus does not install it. */
  opencodePath: z.string().default('').volatile(),
  /** The longest an outside engine may work on one task, in minutes. */
  maxMinutes: z.natural().default(30).volatile(),
  /** Models of OpenCode to offer in the model menu, as OpenCode names them (provider/model). Its own default is always offered. */
  opencodeModels: z.array(String).default([]).volatile(),
  /**
   * When an engine's changes are put into the project, in a conversation where no Mission mode is on.
   * `review`: nothing until you type /engine apply. `new`: new files at once; changed and deleted files
   * wait for /engine apply. `auto`: everything at once, and /engine undo takes the last one back.
   * A Mission mode decides instead when one is on: Restricted is `review`, Ask-Auto is `new`, Full Auto is `auto`.
   */
  applyWhen: z.union([z.const('review'), z.const('new'), z.const('auto')]).default('review').volatile(),
});

function plain(value) {
  if (value !== null && typeof value === 'object' && typeof value.get === 'function' && Object.isFrozen(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const warn = (text) => ctx.logger?.warn?.(`engines: ${text}`);
  const home = ctx.get('dshHomePath');
  const dir = typeof home === 'function' ? home('engines') : '';
  const runs = openRuns(dir ? join(dir, 'runs.json') : '');
  const workOf = (id) => join(dir, 'work', id);
  /** run id -> the running engine's handle. */
  const live = new Map();
  /** conversation id -> { run, pane } for the dsh side, and for helpers it starts. */
  const followed = new Map();
  const programOf = (engine) => ENGINES[engine]?.find(engine === 'opencode' ? String(plain(config?.opencodePath) ?? '') : '') ?? '';

  /** When both sides have ended: work out what each changed. */
  const settle = async (run) => {
    if (!ended(run) || run.settled) return;
    run.settled = true;
    for (const pane of run.panes) {
      try {
        if (pane.work && existsSync(pane.work)) pane.diff = await difference(join(workOf(run.id), 'base'), pane.work);
      } catch (error) {
        pane.diff = { patch: '', cut: false, files: 0, added: 0, removed: 0, error: String(error?.message ?? error).slice(0, 200) };
      }
    }
    runs.save();
  };

  const start = async ({ project, task, engine, model }) => {
    if (!dir) throw new Error('No data folder is available.');
    const words = String(task ?? '').trim();
    if (words.length < 3) throw new Error('Write the task first.');
    if (words.length > 8000) throw new Error('The task is too long (8,000 characters at most).');
    const adapter = ENGINES[String(engine ?? 'opencode')];
    if (!adapter) throw new Error('That engine is not known.');
    const program = programOf(adapter.id);
    if (!program) throw new Error(`${adapter.label} is not installed on this Mac, or not where it usually is.`);
    let folder;
    try {
      folder = realpathSync(String(project ?? ''));
    } catch {
      throw new Error('The project folder is not there.');
    }
    if (!statSync(folder).isDirectory()) throw new Error('The project is not a folder.');
    if ([...live.keys()].length > 0) throw new Error('A comparison is already running. Wait for it, or stop it.');
    const id = `${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
    const root = workOf(id);
    // Three copies: the starting point, one for dsh, one for the engine.
    await copyProject(folder, join(root, 'base'));
    await copyProject(folder, join(root, 'dsh'));
    await copyProject(folder, join(root, adapter.id));
    const dsh = { ...emptyPane('dsh', 'dsh (Code mode)'), work: join(root, 'dsh') };
    const other = emptyPane(adapter.id, adapter.label);
    const run = { id, at: Date.now(), project: folder, task: words, panes: [dsh, other], settled: false };
    for (const gone of runs.add(run)) rmSync(workOf(gone), { recursive: true, force: true });
    const handle = runEngine({ adapter, program, task: words, model: String(model ?? '').trim(), work: join(root, adapter.id), pane: other, timeoutMs: (Number(plain(config?.maxMinutes)) || 30) * 60_000 });
    live.set(id, handle);
    void handle.done.then(() => {
      live.delete(id);
      runs.save();
      return settle(run);
    }).catch((error) => warn(String(error?.message ?? error)));
    return run;
  };

  /** The page started the dsh side's conversation: follow it. */
  const attach = (runId, sessionId) => {
    const run = runs.get(String(runId));
    const pane = run?.panes.find((one) => one.engine === 'dsh');
    if (!run || !pane) throw new Error('That comparison is gone.');
    if (typeof sessionId !== 'string' || !sessionId) throw new Error('No conversation was given.');
    pane.sessionId = sessionId;
    pane.status = 'running';
    pane.startedAt = Date.now();
    followed.set(sessionId, { run, pane, own: true });
    runs.save();
  };
  /** The dsh side could not be started. */
  const failDsh = (runId, why) => {
    const run = runs.get(String(runId));
    const pane = run?.panes.find((one) => one.engine === 'dsh');
    if (!run || !pane || pane.endedAt) return;
    pane.status = 'failed';
    pane.error = String(why ?? 'The dsh conversation could not be started.').slice(0, 300);
    pane.endedAt = Date.now();
    void settle(run);
  };

  ctx.on('session/event', (session, event) => {
    try {
      const id = session?.id;
      if (!id || followed.size === 0) return;
      let entry = followed.get(id);
      // A helper the dsh side starts counts towards the dsh side.
      if (!entry) {
        const parent = (session.header ?? {}).parentSession;
        const above = parent ? followed.get(parent) : undefined;
        if (!above) return;
        entry = { ...above, own: false };
        followed.set(id, entry);
      }
      const { run, pane, own } = entry;
      const data = event?.data ?? {};
      if (event.type === 'request/context' && own && data.model) pane.model = `${data.model}${data.provider ? ` (${data.provider})` : ''}`;
      else if (event.type === 'step/start') pane.steps += 1;
      else if (event.type === 'tool/call') pane.tools += 1;
      else if (event.type === 'assistant/message') {
        const usage = data.usage ?? {};
        pane.input += Number(usage.inputTokens) || 0;
        pane.output += Number(usage.outputTokens) || 0;
        if (own) {
          const content = data.message?.content;
          const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((block) => (block?.type === 'text' ? block.text : '')).join('') : '';
          if (text.trim()) pane.text = text.slice(-30_000);
        }
      } else if (event.type === 'turn/end' && own) {
        const reason = data.reason ?? {};
        pane.endedAt = Date.now();
        pane.status = reason.kind === 'completed' ? 'finished' : reason.kind === 'aborted' ? 'stopped' : 'failed';
        if (pane.status === 'failed') pane.error = String(reason.error?.message ?? reason.kind ?? 'It did not finish.').slice(0, 300);
        for (const [key, value] of followed) if (value.run === run) followed.delete(key);
        runs.save();
        void settle(run);
      }
    } catch (error) {
      warn(`could not follow a conversation: ${String(error?.message ?? error)}`);
    }
  });

  const stop = (runId) => {
    const run = runs.get(String(runId));
    if (!run) throw new Error('That comparison is gone.');
    live.get(run.id)?.stop();
    const pane = run.panes.find((one) => one.engine === 'dsh');
    if (pane?.sessionId && !pane.endedAt) {
      try {
        ctx.get('agents')?.get?.(pane.sessionId)?.cancel({ kind: 'user' });
      } catch (error) {
        warn(`could not stop the dsh side: ${String(error?.message ?? error)}`);
      }
    } else if (pane && !pane.endedAt) failDsh(run.id, 'Stopped before it started.');
  };
  const remove = (runId) => {
    const run = runs.get(String(runId));
    if (!run) return;
    if (!ended(run)) throw new Error('Stop it first.');
    runs.remove(run.id);
    rmSync(workOf(run.id), { recursive: true, force: true });
  };
  ctx.effect(() => () => {
    for (const handle of live.values()) handle.stop();
  }, 'engines: engines');

  // ---- an engine as the model of a Code conversation ------------------------------------------

  const roomOf = (id) => join(dir, 'rooms', String(id).replace(/[^A-Za-z0-9._-]/g, '_'));
  /** conversation id -> the engine's own session id, so a follow-up carries on. Kept while the app runs. */
  const engineSessions = new Map();
  const headerOf = (agent) => agent?.header ?? agent?.session?.header ?? {};
  /** When changes go into the project: 'review', 'new' or 'auto'. A Mission mode decides when one is on. */
  const policyOf = (agent) => {
    let mission = '';
    try {
      mission = String(ctx.get('mission')?.mode?.(agent.id) ?? '');
    } catch {
      mission = '';
    }
    if (mission === 'restricted') return { when: 'review', from: 'Mission: Restricted' };
    if (mission === 'ask') return { when: 'new', from: 'Mission: Ask-Auto' };
    if (mission === 'auto') return { when: 'auto', from: 'Mission: Full Auto' };
    const own = String(plain(config?.applyWhen) ?? 'review');
    return { when: ['review', 'new', 'auto'].includes(own) ? own : 'review', from: 'Settings' };
  };
  const block = (changes) => `\`\`\`\n${listing(changes)}\n\`\`\``;
  const waitingText = (changes) => `${changes.length} change${changes.length === 1 ? '' : 's'} wait${changes.length === 1 ? 's' : ''} in the engine's copy and ${changes.length === 1 ? 'is' : 'are'} not in your project:\n${block(changes)}\nType \`/engine apply\` to put them into the project (or \`/engine apply <file>\` for one), \`/engine discard\` to drop them.`;

  /** One turn of a conversation whose model is an engine. Returns undefined when the caller is not a conversation's turn. */
  const turn = async ({ engine, model, task, signal, say }) => {
    let agent;
    try {
      agent = ctx.get('agents')?.currentInitiator?.();
    } catch {
      agent = undefined;
    }
    if (!agent?.id) return undefined;
    const header = headerOf(agent);
    const none = { input: 0, output: 0 };
    if (header.parentSession) {
      say('An engine cannot work as a helper of another conversation. Nothing was run.');
      return none;
    }
    let mode = '';
    try {
      mode = String(ctx.get('modes')?.get?.(agent.id) ?? '');
    } catch {
      mode = '';
    }
    if (mode !== 'code') {
      say('Engines work in Code mode only. This conversation is in another mode, so nothing was run. Pick one of your models for it, or start a conversation in the Code tab.');
      return none;
    }
    const adapter = ENGINES[engine];
    const program = programOf(engine);
    if (!adapter || !program) {
      say(`${adapter?.label ?? 'That engine'} is not installed on this Mac, or not where it usually is. Nothing was run.`);
      return none;
    }
    if (!task) {
      say('Write what the engine should do.');
      return none;
    }
    let project;
    try {
      project = realpathSync(String(header.cwd ?? ''));
    } catch {
      say('This conversation has no project folder, so there is nothing for the engine to work on.');
      return none;
    }
    const room = await prepareRoom(roomOf(agent.id), project);
    const pane = emptyPane(adapter.id, adapter.label);
    const handle = runEngine({
      adapter, program, task, model, work: room.work, pane,
      session: room.fresh ? '' : engineSessions.get(agent.id) ?? '',
      timeoutMs: (Number(plain(config?.maxMinutes)) || 30) * 60_000,
      onEvent: (event) => { if (event.kind === 'text') say(event.text); },
    });
    const onAbort = () => handle.stop();
    if (signal?.aborted) onAbort();
    else signal?.addEventListener('abort', onAbort, { once: true });
    await handle.done;
    signal?.removeEventListener('abort', onAbort);
    if (pane.session) engineSessions.set(agent.id, pane.session);
    if (pane.status === 'failed') say(`\n\n${adapter.label} did not finish: ${pane.error}`);
    else if (pane.status === 'stopped') say('\n\nStopped.');
    // What it changed, and what happens to it.
    const changes = pending(room.base, room.work);
    const policy = policyOf(agent);
    const head = `\n\n---\n*${adapter.label}, ${pane.steps} step${pane.steps === 1 ? '' : 's'}.*`;
    if (changes.length === 0) say(`${head} No file was changed.`);
    else if (policy.when === 'review') say(`${head} ${waitingText(changes)}`);
    else {
      const done = applyChanges({ project, base: room.base, work: room.work, undo: room.undo, kinds: policy.when === 'new' ? ['added'] : undefined });
      const parts = [];
      if (done.applied.length > 0) parts.push(`Put into your project (${policy.from}):\n${block(done.applied)}\n\`/engine undo\` takes this back.`);
      if (done.conflicts.length > 0) parts.push(`Not touched, because you changed them in the project meanwhile: ${done.conflicts.join(', ')}`);
      if (done.left.length > 0) parts.push(waitingText(done.left));
      say(`${head} ${parts.join('\n\n')}`);
    }
    return { input: pane.input, output: pane.output };
  };
  /** A request that is not a conversation's turn (the app asking for a title, for one): answered without running anything. */
  const aside = async (messages) => {
    // The app's title request quotes the user's messages as JSON; the first one's opening words make the title.
    const all = (Array.isArray(messages) ? messages : []).map((message) => (typeof message?.content === 'string' ? message.content : (message?.content ?? []).map((block) => block?.text ?? '').join(' '))).join(' ');
    const said = /"text"\s*:\s*"((?:[^"\\]|\\.){3,200})/.exec(all)?.[1] ?? '';
    const words = said.replace(/\\[nrt"\\]/g, ' ').replace(/[\u0000-\u001f]/g, ' ').trim().split(/\s+/).slice(0, 7).join(' ');
    return words || 'Engine task';
  };
  const offered = engineModels({
    adapters: ENGINES,
    models: (engine) => (engine === 'opencode' ? (plain(config?.opencodeModels) ?? []) : []).map((name) => String(name).trim()).filter((name) => /^[\w.@:/#-]{1,120}$/.test(name)).slice(0, 30),
    turn,
    aside,
  });
  ctx.inject(['llm'], (inner) => {
    inner.effect(() => inner.llm.registerAdapter(offered.providers, offered.adapter), 'engines: models');
  });
  ctx.on('agent/disposed', ({ agent }) => engineSessions.delete(agent?.id));

  const engineStatus = (agent) => {
    const root = roomOf(agent.id);
    const policy = policyOf(agent);
    const when = { review: 'nothing goes into your project until you type /engine apply', new: 'new files go into your project at once; changed and deleted files wait for /engine apply', auto: 'everything goes into your project at once' }[policy.when];
    let waiting = [];
    try {
      if (existsSync(join(root, 'work')) && existsSync(join(root, 'base'))) waiting = pending(join(root, 'base'), join(root, 'work'));
    } catch {
      waiting = [];
    }
    return [
      'To use an engine in this conversation, pick it in the model menu of the chat box (for example "OpenCode (engine)"). To go back to dsh, pick one of your models. Engines work in Code mode only.',
      `When an engine finishes: ${when} (${policy.from}).`,
      waiting.length > 0 ? waitingText(waiting) : 'No changes are waiting.',
      'Commands: /engine apply [file …], /engine discard, /engine undo.',
    ].join('\n');
  };
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: 'engine',
          description: 'Outside coding engines in this conversation: what waits, put it into the project, drop it, or take the last one back',
          input: { hint: '[apply [file …] | discard | undo]' },
          handler: async ({ agent, rawInput }) => {
            try {
              const [word = '', ...rest] = String(rawInput ?? '').trim().split(/\s+/);
              const root = roomOf(agent.id);
              const work = join(root, 'work');
              const base = join(root, 'base');
              const undo = join(root, 'undo');
              let project = '';
              try {
                project = realpathSync(String(headerOf(agent).cwd ?? ''));
              } catch {
                project = '';
              }
              if (!word || word === 'status') return { kind: 'success', text: engineStatus(agent) };
              if (!project) return { kind: 'error', text: 'This conversation has no project folder.' };
              if (word === 'apply') {
                if (!existsSync(work) || !existsSync(base)) return { kind: 'error', text: 'Nothing is waiting.' };
                const only = rest.length > 0 ? rest.map((file) => file.replace(/^\.\//, '')) : undefined;
                const done = applyChanges({ project, base, work, undo, only });
                if (done.applied.length === 0 && done.conflicts.length === 0) return { kind: 'error', text: only ? `Nothing waiting has that name. Waiting:\n${listing(done.left)}` : 'Nothing is waiting.' };
                return { kind: 'success', text: [done.applied.length > 0 ? `Put into your project:\n${listing(done.applied)}\n/engine undo takes this back.` : 'Nothing was put into your project.', done.conflicts.length > 0 ? `Not touched, because you changed them in the project meanwhile: ${done.conflicts.join(', ')}` : '', done.left.length > 0 ? `Still waiting:\n${listing(done.left)}` : ''].filter(Boolean).join('\n') };
              }
              if (word === 'discard') {
                clearRoom(root);
                engineSessions.delete(agent.id);
                return { kind: 'success', text: 'Dropped. The engine\'s copy is gone; its next task starts from your project as it is, and from a fresh session.' };
              }
              if (word === 'undo') {
                const back = undoLast(project, undo);
                if (back.length === 0) return { kind: 'error', text: 'There is nothing to take back.' };
                clearRoom(root);
                engineSessions.delete(agent.id);
                return { kind: 'success', text: `Taken back:\n${back.join('\n')}\nThe engine's copy was reset, so its next task starts from your project as it is now.` };
              }
              return { kind: 'error', text: `/engine does not know "${word.slice(0, 40)}". Use /engine, /engine apply, /engine discard or /engine undo.` };
            } catch (error) {
              return { kind: 'error', text: String(error?.message ?? error).slice(0, 300) };
            }
          },
        }),
      'engines: command',
    );
  });

  const view = () => ({
    at: Date.now(),
    engines: Object.values(ENGINES).map((adapter) => ({ id: adapter.id, label: adapter.label, program: programOf(adapter.id) })),
    applyWhen: String(plain(config?.applyWhen) ?? 'review'),
    opencodeModels: plain(config?.opencodeModels) ?? [],
    running: live.size > 0 || runs.list().some((run) => !ended(run)),
    runs: runs.list(),
  });

  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: STATE_PATH,
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
              let made;
              if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 20_000) throw new Error('request too large');
                  chunks.push(chunk);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (body?.action === 'start') made = (await start(body)).id;
                else if (body?.action === 'attach') attach(body.run, body.sessionId);
                else if (body?.action === 'dsh-failed') failDsh(body.run, body.why);
                else if (body?.action === 'stop') stop(body.run);
                else if (body?.action === 'remove') remove(body.run);
                else throw new Error('unknown action');
              }
              res.end(JSON.stringify({ ...view(), made }));
            } catch (error) {
              res.statusCode = req.method === 'POST' ? 400 : 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
            }
          },
        }),
      'engines: state route',
    );
  });
}
