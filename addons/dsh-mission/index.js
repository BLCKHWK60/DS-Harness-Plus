/**
 * Mission: three permission modes for a conversation, and checkpoints of its folder.
 *
 *   restricted  nothing outside the conversation's folder is seen or changed, and it is never
 *               asked for. Inside, new files are free; an existing file is asked for once.
 *   ask         the same inside. Outside, reading is asked for once per place; a change is asked
 *               for by the app's own sandbox.
 *   auto        free inside. Outside, as in ask.
 *
 * How the modes hold:
 *   - Every tool call is decided before it runs (`tools/pre-execute`, rules in lib/guard.js). A
 *     question goes to the user through the app's own approval card.
 *   - The conversation is put on the app's Workspace Write preset, so the app's sandbox stops
 *     writes outside the folder whatever a command does.
 *   - A checkpoint of the folder is taken at the start of every turn and before every command
 *     (lib/checkpoints.js). After a command, in restricted and ask, an existing file the user has
 *     not approved that the command changed or deleted is put back from that checkpoint.
 *
 * The `/mission` command switches a mode on and off, lists checkpoints and goes back to one. The
 * multi-model run that takes a goal is a later step and will use this as its base.
 */
import z from '@deepseek-ai/schemastery';
import { join } from 'node:path';
import { COMMAND_TOOLS, MODES, MODE_LABELS, WRITE_TOOLS, decide, modeOf, rulesNote } from './lib/guard.js';
import { exists, isInside, pathsOf, real, shown } from './lib/paths.js';
import { openCheckpoints } from './lib/checkpoints.js';
import { covered, openState } from './lib/state.js';

export const name = 'dsh-mission';
export const REQUEST_TOOL = 'mission_request_files';
/** The app's preset that confines writes to the folder and asks before going wider. */
const PRESET = 'workspace-write';
const REQUEST_MAX = 40;

export const Config = z.object({
  /** Off takes the /mission command and every mode away. */
  enabled: z.boolean().default(true).volatile(),
  /** The mode `/mission on` switches on: restricted, ask or auto. */
  defaultMode: z.string().default('restricted').volatile(),
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

/**
 * Settings as plain checked values.
 * @param {object} config - live Config.
 * @returns {{enabled: boolean, defaultMode: string}} the settings.
 */
export function readSettings(config) {
  const mode = String(plain(config?.defaultMode) ?? '');
  return { enabled: plain(config?.enabled) !== false, defaultMode: MODES.includes(mode) ? mode : 'restricted' };
}

/** What `/mission` with nothing after it says. */
export const HELP = [
  'Mission keeps the assistant inside this conversation\'s folder and takes checkpoints you can go back to.',
  '',
  '/mission restricted   nothing outside the folder; inside, asks once per existing file before changing it',
  '/mission ask          the same inside; may ask you to read or change something outside',
  '/mission auto         free inside the folder; must ask for anything outside',
  '/mission on           switch on the mode chosen in Settings → Mission',
  '/mission off          switch the mode off',
  '/mission checkpoint   take a checkpoint now (a name may follow)',
  '/mission checkpoints  list the checkpoints',
  '/mission back 12      put the folder back as it was at checkpoint 12',
].join('\n');

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live Config.
 */
export function apply(ctx, config) {
  const settings = () => readSettings(config);
  const warn = (text) => ctx.logger?.warn?.(`mission: ${text}`);
  const home = ctx.get('dshHomePath');
  const state = openState(typeof home === 'function' ? join(home('mission'), 'conversations.json') : '');
  ctx.effect(() => () => {
    try {
      state.flush();
    } catch {
      /* nothing to keep */
    }
  }, 'mission: keep the record');

  // ---- which conversation a call belongs to --------------------------------------------------

  const parentOf = (agent) => agent?.header?.parentSession ?? agent?.session?.header?.parentSession;
  const folderOf = (agent) => {
    const header = agent?.header ?? agent?.session?.header;
    return typeof header?.cwd === 'string' ? header.cwd : '';
  };
  /** A helper agent works for a conversation: the conversation's mode is the helper's mode. */
  const ownerOf = (agent) => {
    let id = agent?.id;
    let parent = parentOf(agent);
    for (let depth = 0; parent && depth < 8 && !state.get(id); depth += 1) {
      id = parent;
      let above;
      try {
        above = (ctx.get('agents')?.list?.() ?? []).find((other) => other.id === id);
      } catch {
        above = undefined;
      }
      parent = parentOf(above);
    }
    return id;
  };
  /** @returns {{id: string, entry: object} | undefined} the conversation's mode, when one is on. */
  const guardOf = (agent) => {
    if (!settings().enabled || !agent?.id) return undefined;
    const id = ownerOf(agent);
    const entry = id ? state.get(id) : undefined;
    return entry ? { id, entry } : undefined;
  };

  /** Folder -> its checkpoint store. */
  const stores = new Map();
  const pointsOf = (root) => {
    if (!stores.has(root)) stores.set(root, openCheckpoints(root));
    return stores.get(root);
  };
  /** Conversation id -> the checkpoint being taken at the start of its turn. */
  const settling = new Map();
  const settle = (id, work) => {
    const done = work.catch((error) => warn(`no checkpoint: ${String(error?.message ?? error)}`)).finally(() => {
      if (settling.get(id) === done) settling.delete(id);
    });
    settling.set(id, done);
    return done;
  };

  // ---- the rules, in every guarded conversation ----------------------------------------------

  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(
        () =>
          agent.ctx.systemPrompt.section({
            name: 'mission:rules',
            order: 57,
            interpolate: false,
            text: () => {
              try {
                const guard = guardOf(agent);
                return guard ? rulesNote(guard.entry.mode, guard.entry.root) : '';
              } catch {
                return '';
              }
            },
          }),
        'mission rules',
      );
      sections.set(agent.id, dispose);
    } catch (error) {
      warn(`could not add the rules: ${String(error?.message ?? error)}`);
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
  }, 'mission: rules');

  // A checkpoint at the start of every turn.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'turn/start' || !session?.id || !settings().enabled) return;
      const entry = state.get(session.id);
      if (!entry) return;
      void settle(session.id, pointsOf(entry.root).take(`Start of turn ${event.data?.turn ?? ''}`.trim()));
    } catch (error) {
      warn(`could not take the turn's checkpoint: ${String(error?.message ?? error)}`);
    }
  });

  // ---- every tool call ------------------------------------------------------------------------

  /** Call id -> the checkpoint taken before that command. */
  const pending = new Map();

  /** Put a question to the user through the app's approval card. */
  const askUser = async (exec, question) => {
    const approval = ctx.get('approval');
    if (!approval?.request || !exec?.agent) return 'unavailable';
    try {
      return await approval.request({ agent: exec.agent, toolName: exec.name, callId: exec.callId, reason: question, displayReason: { en: question }, signal: exec.signal });
    } catch (error) {
      warn(`could not ask: ${String(error?.message ?? error)}`);
      return 'unavailable';
    }
  };
  const refusal = (outcome, what) => {
    if (outcome === 'rejected') return `The user said no to ${what}. Do not try it another way; carry on without it or say what you could not do.`;
    if (outcome === 'cancelled') return `The question about ${what} was cancelled.`;
    return `${what} needs the user's yes, and they could not be asked just now.`;
  };

  ctx.on('tools/pre-execute', async (exec, next) => {
    const decision = await next();
    if (decision?.kind && decision.kind !== 'allow') return decision;
    let guard;
    try {
      guard = guardOf(exec?.agent);
    } catch {
      guard = undefined;
    }
    if (!guard || exec.name === REQUEST_TOOL) return decision;
    const { id, entry } = guard;
    try {
      // The turn's own checkpoint comes first, so it holds the folder as the turn found it.
      await settling.get(id);
      const root = real(entry.root);
      const verdict = decide({ mode: entry.mode, tool: exec.name, args: exec.arguments, root, approved: (path) => entry.approved.has(path), outsideOk: (path) => covered(entry.outside, path) });
      if (verdict.kind === 'deny') return { kind: 'deny', reason: verdict.reason };
      if (verdict.kind === 'ask') {
        const outcome = await askUser(exec, verdict.question);
        if (outcome !== 'allowed-once') return { kind: 'deny', reason: refusal(outcome, verdict.files ? `changing ${verdict.files.map((path) => shown(root, path)).join(', ')}` : `reaching ${verdict.outside.join(', ')}`) };
        if (verdict.files) state.approve(id, verdict.files);
        if (verdict.outside) state.allowOutside(id, verdict.outside);
      }
      // A file the assistant makes itself is its own to change later.
      if (WRITE_TOOLS.has(exec.name)) state.approve(id, pathsOf(exec.arguments, root).filter((path) => isInside(root, path) && !exists(path)));
      if (COMMAND_TOOLS.has(exec.name)) {
        const text = String(exec.arguments?.command ?? '').replace(/\s+/g, ' ').slice(0, 70);
        const point = await pointsOf(entry.root).take(`Before: ${text}`);
        pending.set(exec.callId, { id, root, point: point.id });
        if (pending.size > 500) pending.delete(pending.keys().next().value);
      }
      return decision ?? { kind: 'allow' };
    } catch (error) {
      // A guard that cannot decide must not wave the call through.
      const reason = String(error?.message ?? error).slice(0, 240);
      warn(`could not decide ${exec.name}: ${reason}`);
      return { kind: 'deny', reason: `Mission could not check this call (${reason}), so it was not run. The user can switch the mode off with /mission off.` };
    }
  });

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    const before = pending.get(exec?.callId);
    if (!before) return decision;
    pending.delete(exec.callId);
    const entry = state.get(before.id);
    if (!entry) return decision;
    try {
      const { changed, deleted, added } = await pointsOf(entry.root).since(before.point);
      // What the command made is the assistant's own.
      state.approve(before.id, added.map((file) => join(before.root, file)));
      if (entry.mode === 'auto') return decision;
      const mine = (file) => entry.approved.has(join(before.root, file));
      const back = [...changed.filter((file) => !mine(file)), ...deleted.filter((file) => !mine(file))];
      if (back.length === 0) return decision;
      await pointsOf(entry.root).putBack(before.point, back);
      const listed = back.slice(0, 30).join(', ') + (back.length > 30 ? ` and ${back.length - 30} more` : '');
      const notice = [
        `${MODE_LABELS[entry.mode]} mode: this command changed or deleted existing files the user has not approved: ${listed}.`,
        'They were put back as they were. Everything else the command did stands.',
        `To change them, ask the user once with ${REQUEST_TOOL} (name the files and say why), or edit a single file with the edit tool, and then run the command again.`,
      ].join(' ');
      if (decision?.kind === 'block') return { ...decision, feedback: [...(decision.feedback ?? []), { type: 'text', text: notice }] };
      const content = Array.isArray(decision?.content) ? decision.content : Array.isArray(result?.content) ? result.content : undefined;
      if (!content) return { kind: 'block', feedback: [{ type: 'text', text: notice }] };
      return { kind: 'accept', content: [...content, { type: 'text', text: `\n[${notice}]` }], ...(decision?.additionalContexts ? { additionalContexts: decision.additionalContexts } : {}) };
    } catch (error) {
      warn(`could not check what a command changed: ${String(error?.message ?? error)}`);
      return decision;
    }
  });

  // ---- asking for several files at once -------------------------------------------------------

  ctx.inject(['tools'], (inner) => {
    inner.effect(
      () =>
        inner.tools.register({
          name: REQUEST_TOOL,
          description: 'While a Mission mode is on: ask the user once for permission to change or delete several existing files in this conversation\'s folder, for example before a command that reformats or renames many files. After a yes, those files may be changed by tools and commands without further asking. Not needed for new files, and not needed in Full Auto. It cannot ask for anything outside the folder.',
          parameters: {
            type: 'object',
            properties: {
              files: { type: 'array', minItems: 1, maxItems: REQUEST_MAX, items: { type: 'string', maxLength: 400 }, description: 'The existing files, as paths inside the conversation\'s folder.' },
              why: { type: 'string', maxLength: 240, description: 'One line for the user: why these files have to change.' },
            },
            required: ['files', 'why'],
            additionalProperties: false,
          },
          output: {
            schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
            render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
          },
          isConcurrencySafe: () => false,
          execute: async (args, exec) => {
            try {
              const guard = guardOf(exec?.agent);
              if (!guard) return { text: 'No Mission mode is on in this conversation, so nothing needs asking.' };
              const { id, entry } = guard;
              if (entry.mode === 'auto') return { text: 'Full Auto: files inside the folder may be changed without asking.' };
              const root = real(entry.root);
              const named = pathsOf({ files: Array.isArray(args?.files) ? args.files.slice(0, REQUEST_MAX) : [] }, root);
              const outside = named.filter((path) => !isInside(root, path));
              if (outside.length > 0) return { text: `Not asked: these are outside the conversation's folder: ${outside.join(', ')}. This tool is for files inside it.` };
              const need = named.filter((path) => exists(path) && !entry.approved.has(path));
              if (need.length === 0) return { text: 'Nothing to ask: these files are new or already approved.' };
              const why = String(args?.why ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
              const outcome = await askUser(exec, `${MODE_LABELS[entry.mode]} mode: change ${need.map((path) => shown(root, path)).join(', ')}?${why ? ` Reason given: ${why}` : ''}`);
              if (outcome !== 'allowed-once') return { text: refusal(outcome, 'changing these files') };
              state.approve(id, need);
              return { text: `The user said yes. These files may now be changed without asking again: ${need.map((path) => shown(root, path)).join(', ')}.` };
            } catch (error) {
              return { text: `It did not work: ${String(error?.message ?? error).slice(0, 240)}` };
            }
          },
        }),
      'mission: request tool',
    );
  });

  // ---- the command ----------------------------------------------------------------------------

  const when = (at) => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const status = (agent) => {
    const entry = state.get(agent.id);
    if (!entry) return `No Mission mode is on in this conversation. Click for the commands.\n\n${HELP}`;
    return `Mission mode: ${MODE_LABELS[entry.mode]} is on. Click for details.\nFolder: ${entry.root}\nApproved so far: ${entry.approved.size} file${entry.approved.size === 1 ? '' : 's'} inside, ${entry.outside.size} place${entry.outside.size === 1 ? '' : 's'} outside.\n\n${HELP}`;
  };
  const switchOn = async (agent, mode) => {
    const root = folderOf(agent);
    if (!root) throw new Error('This conversation has no folder. Pick a folder on the start page first.');
    let preset = '';
    try {
      const presets = ctx.get('permissionPresets');
      if (presets?.set && agent.session) {
        preset = presets.current(agent.session);
        if (preset !== PRESET) presets.set(agent.session, PRESET);
      }
    } catch (error) {
      warn(`could not select the Workspace Write preset: ${String(error?.message ?? error)}`);
    }
    const entry = state.set(agent.id, { mode, root, preset });
    let note = '';
    try {
      const point = await pointsOf(root).take(`${MODE_LABELS[mode]} mode switched on`);
      note = ` Checkpoint ${point.number} holds the folder as it is now.`;
    } catch (error) {
      note = ` No checkpoint could be taken: ${String(error?.message ?? error).slice(0, 200)}`;
    }
    const inside = mode === 'auto' ? 'Inside the folder the assistant works without asking.' : 'Inside the folder it creates new files freely and asks you once per existing file before changing it.';
    const outside = mode === 'restricted' ? 'Outside the folder nothing is read or changed, and you are not asked.' : 'For anything outside the folder it must ask you.';
    return `Mission mode: ${MODE_LABELS[entry.mode]} is on.${note}\nFolder: ${root}\n${inside}\n${outside}`;
  };

  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: 'mission',
          description: 'Keep the assistant inside this folder (Restricted, Ask-Auto, Full Auto), take checkpoints, go back to one',
          input: { hint: '[restricted | ask | auto | off | checkpoints | back <number>]' },
          handler: async ({ agent, rawInput }) => {
            try {
              if (!settings().enabled) return { kind: 'error', text: 'Mission is switched off in Settings → Mission.' };
              const text = String(rawInput ?? '').trim();
              const [first = '', ...rest] = text.split(/\s+/);
              const word = first.toLowerCase();
              if (!word || word === 'status' || word === 'help') return { kind: 'success', text: status(agent) };
              const mode = word === 'on' ? settings().defaultMode : modeOf(text);
              if (mode) return { kind: 'success', text: await switchOn(agent, mode) };
              if (word === 'off') {
                const before = state.clear(agent.id);
                if (!before) return { kind: 'success', text: 'No Mission mode was on.' };
                try {
                  const presets = ctx.get('permissionPresets');
                  if (before.preset && before.preset !== PRESET && before.preset !== 'custom' && presets?.set && agent.session) presets.set(agent.session, before.preset);
                } catch (error) {
                  warn(`could not put the earlier preset back: ${String(error?.message ?? error)}`);
                }
                return { kind: 'success', text: 'Mission mode is off. The checkpoints stay in the folder.' };
              }
              const root = state.get(agent.id)?.root ?? folderOf(agent);
              if (!root) return { kind: 'error', text: 'This conversation has no folder.' };
              if (word === 'checkpoint') {
                const point = await pointsOf(root).take(rest.join(' ') || 'Taken by you');
                return { kind: 'success', text: point.fresh ? `Checkpoint ${point.number} taken.` : `Nothing changed since checkpoint ${point.number}; it stands for now too.` };
              }
              if (word === 'checkpoints' || word === 'list') {
                const list = await pointsOf(root).list(20);
                if (list.length === 0) return { kind: 'success', text: 'There are no checkpoints yet. One is taken when a mode is switched on.' };
                return { kind: 'success', text: `${list[0].number} checkpoint${list[0].number === 1 ? '' : 's'}. Click to see them, newest first.\nFolder: ${root}\n${list.map((point) => `${String(point.number).padStart(4)}  ${when(point.at)}  ${point.label}`).join('\n')}\n\nGo back with /mission back <number>.` };
              }
              if (word === 'back' || word === 'rollback') {
                const number = Number(rest[0]);
                if (!Number.isInteger(number)) return { kind: 'error', text: 'Say which one: /mission back 12. List them with /mission checkpoints.' };
                const went = await pointsOf(root).back(number);
                return { kind: 'success', text: `Went back to checkpoint ${went.number}. Undo with /mission back ${went.saved}.\nThe folder is as it was at checkpoint ${went.number} (${went.label}).\nHow it was a moment ago is kept as checkpoint ${went.saved}.\nFiles your project ignores (build output and the like) were left alone.` };
              }
              return { kind: 'error', text: `/mission does not know "${text.slice(0, 60)}". Click for the commands.\nRunning a goal with several models is the next step and is not built yet.\n\n${HELP}` };
            } catch (error) {
              return { kind: 'error', text: String(error?.message ?? error).slice(0, 400) };
            }
          },
        }),
      'mission command',
    );
  });
}
