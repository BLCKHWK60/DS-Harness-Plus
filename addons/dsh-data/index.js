/**
 * Data: a mode and tab for analysing the data files in a conversation's folder.
 *
 * The assistant never loads raw data into the conversation. It gets seven tools:
 *   data_files            what is in the folder
 *   data_profile          a table file's columns, types, gaps and ranges
 *   data_query            one read-only SQL query against the real files; every result has an id (Q7)
 *   data_text             a text or Word document, a stretch at a time
 *   data_save_analysis    keep a set of queries under a name
 *   data_rerun_analysis   run it again and report what moved
 *   data_analyses         what is saved, and whose files changed
 * and a method that says: profile first, every number carries its query id, say what the data
 * cannot tell. Queries run in a helper process on an in-memory copy of the files, read-only.
 *
 * Off until switched on in Settings > Data. Needs the Modes add-on and the Cowork sidebar.
 * Route: `GET/POST /dsh-data/data`.
 */
import z from '@deepseek-ai/schemastery';
import { join } from 'node:path';
import { createEngine } from './lib/engine.js';
import { READS } from './lib/files.js';
import { MODE_ID, withData } from './lib/method.js';
import { createPython } from './lib/python.js';
import { openStore } from './lib/store.js';
import { OUTPUT_FOLDER, buildTools, changedFiles } from './lib/tools.js';

export const name = 'dsh-data';

export const DATA_PATH = '/dsh-data/data';
const MODES_NS = 'modes';
/** Modes whose conversations get the note about their data folder: Data itself, and Finance, which works on the user's own files the same way. */
const FOLDER_MODES = [MODE_ID, 'finance'];

export const Config = z.object({
  /** The Data mode and tab. Off leaves nothing of it in the app; saved analyses are kept. */
  enabled: z.boolean().default(false).volatile(),
  /**
   * Python for statistics and charts: set up Plus's own private Python folder the first time Data
   * is switched on (a download of about 450 MB). Off leaves the data_python tool saying it is not set up.
   */
  pythonSetup: z.boolean().default(true).volatile(),
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
  const warn = (text) => ctx.logger?.warn?.(`data: ${text}`);
  const home = ctx.get('dshHomePath');
  const dir = typeof home === 'function' ? home('data') : '';
  const store = openStore(dir ? join(dir, 'queries.json') : '', dir ? join(dir, 'analyses.json') : '');
  const engine = createEngine();
  ctx.effect(() => () => engine.stop(), 'data: engine');
  const python = dir ? createPython(join(dir, 'python')) : undefined;
  /** Pictures go into the chat through the Diagrams add-on. */
  const show = (exec, picture) => {
    try {
      const diagrams = ctx.get('diagrams');
      if (typeof diagrams?.show !== 'function') return { ok: false, errors: ['The Diagrams add-on is not running, so the picture cannot be shown in the chat.'] };
      return diagrams.show(exec?.agent, picture);
    } catch (error) {
      return { ok: false, errors: [String(error?.message ?? error).slice(0, 200)] };
    }
  };
  // Set Python up once, in the background, the first time Data is on. A failed set-up is not retried by itself.
  let pythonAsked = false;
  const preparePython = () => {
    if (!python || pythonAsked || !enabled() || plain(config?.pythonSetup) === false) return;
    pythonAsked = true;
    if (python.status().state !== 'missing') return;
    python.setup().then(
      (state) => ctx.logger?.info?.(`data: Python set-up: ${state.state} (${state.detail})`),
      (error) => warn(`Python set-up failed: ${String(error?.message ?? error)}`),
    );
  };

  /** The folder a conversation works in, from its header. */
  const folderOf = (agent) => {
    const header = agent?.header ?? agent?.session?.header;
    return typeof header?.cwd === 'string' ? header.cwd : '';
  };
  /** A helper's queries are numbered with the conversation that started it. */
  const conversationOf = (agent) => String(agent?.header?.parentSession ?? agent?.session?.header?.parentSession ?? agent?.id ?? '');

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
        problem = 'The Modes add-on is not running, so there is no Data tab.';
        return;
      }
      if (row.value?.extraModes === undefined) {
        problem = 'The Modes add-on is an older version that cannot take a new mode. Update Plus.';
        return;
      }
      const on = enabled();
      const ops = [];
      const next = withData(row.value.extraModes, on);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      // A tab that no longer exists must not stay selected.
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = '';
    } catch (error) {
      problem = `The Data tab could not be ${enabled() ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(problem);
    } finally {
      syncing = false;
    }
  };

  // ---- the tools: there only while Data is on -------------------------------------------------

  let toolsOff;
  const syncTools = () => {
    const on = enabled();
    if (on && !toolsOff) {
      const tools = ctx.get('tools');
      if (!tools?.register) return;
      toolsOff = buildTools({ enabled, rootOf: (exec) => folderOf(exec?.agent), conversationOf: (exec) => conversationOf(exec?.agent), engine, store, python, show }).map((tool) => tools.register(tool));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
      engine.stop();
    }
  };
  const follow = () => {
    void syncMode();
    try {
      preparePython();
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
  }, 'data: follow the switch');

  // ---- a note in every Data conversation: its folder, and saved analyses whose files changed ----

  const modeOf = (agentId) => {
    try {
      return ctx.get('modes')?.get?.(agentId);
    } catch {
      return undefined;
    }
  };
  const pythonLine = () => {
    const state = python?.status().state;
    if (state === 'ready') return 'data_python is ready (pandas, numpy, scipy, matplotlib and more).';
    if (state === 'installing') return 'Python is still being set up; data_python will work in a minute or two. Until then use data_query and data_chart.';
    return 'Python is not set up, so data_python will not run. The user can set it up in Settings → Data. Until then use data_query and data_chart.';
  };
  const note = (agent, mode) => {
    const folder = folderOf(agent);
    if (mode !== MODE_ID) {
      // Finance: the same tools work on the user's own files, next to the market data.
      if (!folder) return '';
      return [`The folder of this conversation is ${folder}. When the user's own files matter (a portfolio, exported statements, a spreadsheet of figures), work on them with the data tools: data_files, data_profile, data_query, data_chart (a chart straight from a query), data_python (statistics and special charts) and data_text. Cite each run's id, like [Q7]. New files go into ${OUTPUT_FOLDER}; never change the user's files.`, pythonLine()].join('\n');
    }
    if (!folder) return 'This Data conversation has no folder, so there are no files to analyse. Tell the user to start a conversation in the folder that holds their data (the folder is picked on the start page).';
    const lines = [`The data folder of this conversation is ${folder}. Paths you give the data tools are relative to it. Files you make go into ${OUTPUT_FOLDER} inside it.`, pythonLine()];
    const mine = store.analyses().filter((analysis) => analysis.folder === folder).slice(0, 12);
    if (mine.length > 0) {
      lines.push('Saved analyses for this folder:');
      for (const analysis of mine) {
        const changed = changedFiles(analysis);
        lines.push(`- "${analysis.name}"${changed.length > 0 ? `: files changed since its last run (${changed.slice(0, 4).join(', ')}). Offer to run it again with data_rerun_analysis.` : ': no file changed since its last run.'}`);
      }
    }
    return lines.join('\n');
  };
  /** Agent id -> prompt section disposer. */
  const sections = new Map();
  const install = (agent) => {
    if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      const dispose = agent.ctx.effect(
        () =>
          agent.ctx.systemPrompt.section({
            name: 'data:folder',
            order: 59,
            interpolate: false,
            text: () => {
              try {
                const mode = modeOf(agent.id);
                return enabled() && FOLDER_MODES.includes(mode) ? note(agent, mode) : '';
              } catch {
                return '';
              }
            },
          }),
        'data folder note',
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
  }, 'data: folder notes');

  // ---- the page's data ---------------------------------------------------------------------------

  const view = () => ({
    at: Date.now(),
    enabled: enabled(),
    problem,
    toolsOn: Boolean(toolsOff),
    reads: READS,
    python: python ? python.status() : { state: 'missing', detail: 'No data folder is available.', packages: [] },
    analyses: store.analyses().map((analysis) => {
      let changed = [];
      try {
        changed = changedFiles(analysis);
      } catch {
        changed = [];
      }
      return { name: analysis.name, folder: analysis.folder, steps: analysis.steps.map((step) => ({ label: step.label, sql: step.sql, files: step.files })), ranAt: analysis.ranAt, changed };
    }),
  });

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
              if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 8192) throw new Error('request too large');
                  chunks.push(chunk);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (body?.action === 'python') {
                  if (!python) throw new Error('No data folder is available.');
                  // Runs in the background; the page asks again to see how far it is.
                  python.setup().catch((error) => warn(`Python set-up failed: ${String(error?.message ?? error)}`));
                } else if (body?.action === 'remove') {
                  if (!store.remove(body.name)) throw new Error('That analysis is gone.');
                } else throw new Error('unknown action');
              }
              res.end(JSON.stringify(view()));
              // The switch on the page should take effect at once, not at the next tick.
              follow();
            } catch (error) {
              res.statusCode = req.method === 'POST' ? 400 : 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
            }
          },
        }),
      'data: data route',
    );
  });
}
