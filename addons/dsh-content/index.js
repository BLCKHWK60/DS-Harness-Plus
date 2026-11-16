/**
 * Content: a mode and tab for turning material into finished pieces (books, articles, blog posts,
 * scripts, podcast and video outlines). Switched on, it adds:
 *   - the Content mode (through the Modes add-on), with its method; Web, Depth, Long run and the Run
 *     button are the ones every tab has;
 *   - five tools: content_inventory (what the subject folder holds), content_setup (Content's own
 *     parts of the folder), content_save (a new file in one of them, never replacing one),
 *     content_conversations and content_bring_in (other conversations, copied in as material);
 *   - a note in each Content conversation naming its subject folder.
 * The subject folder is the conversation's folder: a Scratch thread's own folder, or the folder the
 * conversation was started in. Content writes only into its own parts of it (research, notes, drafts,
 * publish) and never replaces a file. Recon conversations are sealed and never come in.
 *
 * Off until switched on in Settings > Content. Needs the Modes add-on and the Cowork sidebar.
 * Route: `GET /dsh-content/data`.
 */
import z from '@deepseek-ai/schemastery';
import { isAbsolute, join } from 'node:path';
import { createConversations, textOf } from './lib/conversations.js';
import { inReconRoom, realRoot } from './lib/folder.js';
import { openIndex } from './lib/final.js';
import { openFormats } from './lib/formats.js';
import { MODE_ID, folderNote, statusOf, withContent } from './lib/mode.js';
import { buildPieceTools } from './lib/piece-tools.js';
import { openSubject } from './lib/subject.js';
import { buildTools } from './lib/tools.js';

/** How long a writer or checker may work. */
export const HELPER_MS = 15 * 60_000;

export const name = 'dsh-content';
export const DATA_PATH = '/dsh-content/data';
const MODES_NS = 'modes';
/** The readers Content sends the assistant to, from other add-ons. */
const READERS = [{ tool: 'data_text', addOn: 'Data' }, { tool: 'pdf_read', addOn: 'PDF reader' }];

export const Config = z.object({
  /** The Content mode and tab. Off leaves nothing of it in the app; files it saved stay where they are. */
  enabled: z.boolean().default(false).volatile(),
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
  const enabled = () => plain(config?.enabled) === true;
  const warn = (text) => ctx.logger?.warn?.(`content: ${text}`);

  /** A Scratch thread's own folder ('' when it is not one, or the Cowork sidebar is off). */
  const scratchFolderOf = (agent) => {
    try {
      return String(ctx.get('coworkScratch')?.folderOf?.(agent) ?? '');
    } catch {
      return '';
    }
  };
  /** The folder a conversation works in: a Scratch thread's own folder, else the folder in its header. */
  const folderOf = (agent) => {
    const own = scratchFolderOf(agent);
    if (own) return own;
    const header = agent?.header ?? agent?.session?.header;
    return typeof header?.cwd === 'string' ? header.cwd : '';
  };
  /** A helper works for the conversation that started it. */
  const conversationOf = (agent) => String(agent?.header?.parentSession ?? agent?.session?.header?.parentSession ?? agent?.id ?? '');
  const modeOf = (id) => {
    try {
      return ctx.get('modes')?.get?.(id);
    } catch {
      return undefined;
    }
  };
  /** Whether a tool is there for an agent; undefined when that cannot be told. */
  const hasOf = (exec) => {
    let names;
    try {
      names = ctx.get('tools')?.view?.(exec?.agent)?.knownNames;
    } catch {
      names = undefined;
    }
    return (tool) => (names && typeof names.has === 'function' && names.size > 0 ? names.has(tool) : undefined);
  };
  const conversations = createConversations({
    query: () => ctx.get('sessionQuery'),
    modes: () => ctx.get('modes'),
    trash: () => ctx.get('coworkTrash'),
  });
  const home = ctx.get('dshHomePath');
  const contentHome = typeof home === 'function' ? home('content') : '';
  const formats = openFormats(() => (contentHome ? join(contentHome, 'formats') : ''));
  const index = openIndex(() => (contentHome ? join(contentHome, 'where-used.json') : ''));
  /** Where the Research tab saves its reports: its own setting, else research/reports in the app's home. */
  const reportsFolder = () => {
    try {
      const value = plain(ctx.get('settings')?.describe?.().find((entry) => entry.ns === 'research')?.value?.folder);
      if (typeof value === 'string' && isAbsolute(value.trim())) return value.trim();
    } catch {
      /* the default below */
    }
    return typeof home === 'function' ? join(home('research'), 'reports') : '';
  };
  /** The user's own messages in the conversation a call belongs to (a helper's: the one that started it). */
  const ownerMessages = (exec) => {
    try {
      const top = ctx.get('agents')?.get?.(conversationOf(exec?.agent)) ?? exec?.agent;
      const messages = top?.session?.deriveMessages?.() ?? [];
      return messages.filter((message) => message?.role === 'user' && message?.source?.kind === 'user').map((message) => ({ text: textOf(message.content) }));
    } catch {
      return [];
    }
  };

  // ---- the writer and the checker: helper models with no tools ---------------------------------
  /**
   * Helper ids whose every tool call is refused: marked by the id the app gives back when the helper
   * starts, as Mission marks its planner and reviewer (never by guessing which helper is created next,
   * which could catch a Long run's own helper).
   */
  const toolless = new Set();
  /** A writer or checker: marked by its id, or known by its own task (which starts CONTENT_WRITER or CONTENT_CHECKER), so a call made before the mark is in place is refused too. */
  const notToolless = new Set();
  const isToolless = (agent) => {
    if (!agent?.id) return false;
    if (toolless.has(agent.id)) return true;
    if (notToolless.has(agent.id) || !(agent.header?.parentSession ?? agent.session?.header?.parentSession)) return false;
    try {
      const first = (agent.session?.deriveMessages?.() ?? []).find((message) => message?.role === 'user');
      // At the start of a line: the app may put a note of its own (the time) before the task.
      if (/(?:^|\n)\s*CONTENT_(WRITER|CHECKER)\b/.test(textOf(first?.content).slice(0, 4000))) {
        toolless.add(agent.id);
        return true;
      }
      // Its task is set once, so a helper seen with another task is not looked at again.
      if (first) notToolless.add(agent.id);
    } catch {
      /* not one of Content's */
    }
    return false;
  };
  // Decided before any other add-on is asked: no other rule (an approval card, a question) can let a
  // writer's or checker's call through.
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (isToolless(exec?.agent)) return { kind: 'deny', reason: 'You are Content\'s writer or checker: you have no tools. Answer with text only.' };
    return next();
  });
  /** One writer or checker at a time per conversation, so the next helper created is the one marked. */
  const queues = new Map();
  const helper = (exec, { label, prompt }) => {
    const parent = exec?.agent;
    // One at a time per conversation: a Long run's helper and the conversation share one queue.
    const key = conversationOf(parent);
    const run = async () => {
      const subagents = ctx.get('subagents');
      if (!subagents?.startActivation) throw new Error("The app's helper service is not available here, so the writer and checker cannot run.");
      let route;
      try {
        route = parent?.model?.current?.();
      } catch {
        route = undefined;
      }
      const limit = new AbortController();
      const timer = setTimeout(() => limit.abort(new Error(`${label} worked for more than ${HELPER_MS / 60000} minutes and was stopped.`)), HELPER_MS);
      timer.unref?.();
      const signal = exec?.signal ? AbortSignal.any([exec.signal, limit.signal]) : limit.signal;
      let child;
      try {
        const request = { prompt: [{ type: 'text', text: `${prompt}\n\n` }], parent, signal, ...(route?.provider && route?.model ? { agentOptions: { provider: route.provider, model: route.model } } : {}) };
        child = await subagents.startActivation({ ...request, provider: 'spawn', label, request, delivery: 'parent', signal });
        if (child?.childId) toolless.add(String(child.childId));
        const result = await Promise.race([
          child.result,
          new Promise((_, reject) => {
            if (signal.aborted) reject(signal.reason ?? new Error('Stopped.'));
            signal.addEventListener('abort', () => reject(signal.reason ?? new Error('Stopped.')), { once: true });
          }),
        ]);
        if (result?.stopReason === 'error' || result?.stopReason === 'refusal') throw new Error(`${label}: the model ${result.stopReason === 'refusal' ? 'refused' : 'failed'}${result.diagnostic ? ` (${String(result.diagnostic).slice(0, 200)})` : ''}.`);
        return (result?.output ?? []).filter((block) => block?.type === 'text').map((block) => block.text).join('\n').trim();
      } catch (error) {
        Promise.resolve(child?.dispose?.()).catch(() => {});
        throw error;
      } finally {
        clearTimeout(timer);
      }
    };
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(run);
    queues.set(key, next);
    return next;
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
        problem = 'The Modes add-on is not running, so there is no Content tab.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        problem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const on = enabled();
      const ops = [];
      const next = withContent(row.value.extraModes, on);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      // A tab that no longer exists must not stay selected.
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = '';
    } catch (error) {
      problem = `The Content tab could not be ${enabled() ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(problem);
    } finally {
      syncing = false;
    }
  };

  // ---- the tools: there only while Content is on ---------------------------------------------

  let toolsOff;
  const syncTools = () => {
    const on = enabled();
    if (on && !toolsOff) {
      const tools = ctx.get('tools');
      if (!tools?.register) return;
      // Offered only in Content conversations and their helpers: other tabs' tool lists stay as they were.
      const offered = (agent) => {
        if (!enabled()) return false;
        try {
          const id = conversationOf(agent);
          return Boolean(id) && modeOf(id) === MODE_ID && ctx.get('modes')?.isolated?.(id) !== true;
        } catch {
          return false;
        }
      };
      const rootOf = (exec) => folderOf(exec?.agent);
      toolsOff = [
        ...buildTools({ enabled, rootOf, conversationOf: (exec) => conversationOf(exec?.agent), hasOf, conversations }),
        ...buildPieceTools({ enabled, rootOf, ownerMessages, helper, formats, index, reportsFolder }),
      ].map((tool) => tools.register(tool, { when: ({ agent }) => offered(agent) }));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
    }
  };
  const follow = () => {
    void syncMode();
    try {
      syncTools();
    } catch (error) {
      warn(`could not update the tools: ${String(error?.message ?? error)}`);
    }
  };
  follow();
  const timer = setInterval(follow, 3000);
  timer.unref?.();
  ctx.effect(() => () => {
    clearInterval(timer);
    for (const dispose of toolsOff ?? []) if (typeof dispose === 'function') dispose();
    toolsOff = undefined;
  }, 'content: follow the switch');

  // ---- a note in every Content conversation: its subject folder ------------------------------

  /** Agent id -> prompt section disposer. */
  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(
        () =>
          agent.ctx.systemPrompt.section({
            name: 'content:folder',
            order: 59,
            interpolate: false,
            text: () => {
              try {
                if (!enabled() || modeOf(agent.id) !== MODE_ID) return '';
                if (ctx.get('modes')?.isolated?.(agent.id) === true) return '';
                const folder = folderOf(agent);
                const sealed = Boolean(folder) && inReconRoom(folder);
                let status = '';
                if (folder && !sealed) {
                  try {
                    status = statusOf(openSubject(realRoot(folder)).read());
                  } catch {
                    status = '';
                  }
                }
                return folderNote({ folder, scratch: scratchFolderOf(agent) !== '', sealed, status });
              } catch {
                return '';
              }
            },
          }),
        'content folder note',
      );
      sections.set(agent.id, dispose);
    } catch (error) {
      warn(`could not add the folder note: ${String(error?.message ?? error)}`);
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
  }, 'content: folder notes');

  // ---- the page's data ---------------------------------------------------------------------------

  /** Whether the readers of other add-ons are there (null when that cannot be told). */
  const readers = () => {
    let names = [];
    try {
      names = (ctx.get('tools')?.definitions?.() ?? []).map((definition) => definition?.name);
    } catch {
      names = [];
    }
    return READERS.map((reader) => ({ ...reader, there: names.length > 0 ? names.includes(reader.tool) : null }));
  };
  const view = () => ({
    at: Date.now(),
    enabled: enabled(),
    problem,
    toolsOn: Boolean(toolsOff),
    history: typeof ctx.get('sessionQuery')?.listSessions === 'function',
    readers: readers(),
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
          if (req.method !== 'GET') {
            res.statusCode = 405;
            res.end(JSON.stringify({ error: 'only GET' }));
            return;
          }
          res.end(JSON.stringify(view()));
          void syncMode();
        },
      }),
      'content: data route',
    );
  });
}
