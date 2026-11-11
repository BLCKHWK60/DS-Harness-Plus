/**
 * Host half of Code map.
 *
 * Gives the model a compact map of the project a conversation works in (files,
 * symbols, what uses what), so it can look things up instead of reading whole
 * files, and ships four "reverse engineer" skills.
 *
 * Nothing is written into the project: each map is one JSON file in the app's
 * own data folder. Only the conversation's working folder is ever mapped, links
 * are never followed, and reads go through the map (a path that is not in the
 * map cannot be read with these tools).
 */
import z from '@deepseek-ai/schemastery';
import { createManager } from './lib/manager.js';
import { fileOutline, find, overview, readPart, related, size } from './lib/query.js';
import { SKILLS } from './skills.js';

export const name = 'code-map';

/** Routes the Settings page uses. */
export const STATUS_PATH = '/dsh-code-map/status';
export const ACTION_PATH = '/dsh-code-map/action';
/** The page must send this header with an action; a foreign site cannot add it without the app's consent. */
export const ACTION_HEADER = 'x-dsh-code-map';

export const Config = z.object({
  /** Offer the code map tools and the short hint. */
  enabled: z.boolean().default(true).volatile(),
  /** Add a three-line hint to the model's instructions in code projects. */
  promptHint: z.boolean().default(true).volatile(),
  /** Most files mapped in one folder. */
  maxFiles: z.number().min(100).max(50000).default(5000).volatile(),
  /** Files larger than this many kilobytes are skipped. */
  maxFileKb: z.number().min(16).max(4096).default(400).volatile(),
  /** More ignore patterns, one per line, written like lines of a `.gitignore`. */
  extraIgnore: z.string().default('').volatile(),
  /** Where maps are kept; empty uses a folder in the app's data folder. */
  dataDir: z.string().default(''),
  /** Name of the slash command; empty registers none. */
  commandName: z.string().default('codemap'),
  /** Register the four reverse-engineer skills. */
  skills: z.boolean().default(true),
});

export const inject = ['tools'];

/**
 * Plain value of a config field that may be a live reference.
 * @param {unknown} value - field value.
 * @returns {unknown} plain value.
 */
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
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = plain(child);
  return result;
}

/** The hint added to the model's instructions in a code project. Kept short on purpose. */
export const HINT =
  '## Code map\n' +
  'This folder has a code map. If the `code_map_*` tools are available, use them before reading whole files: ' +
  '`code_map_overview` first, then `code_map_find`, `code_map_file` and `code_map_related`, and `code_map_read` to read one function instead of a file. ' +
  'The map holds names and structure, not file contents: use grep for text inside files.';

/**
 * The limits in force, read from live config.
 * @param {object} config - plugin config.
 * @returns {{maxFiles: number, maxFileBytes: number, extraIgnore: string}} limits.
 */
export function readLimits(config) {
  const files = Number(plain(config.maxFiles));
  const kb = Number(plain(config.maxFileKb));
  const extra = plain(config.extraIgnore);
  return {
    maxFiles: Number.isFinite(files) ? Math.min(50000, Math.max(100, Math.round(files))) : 5000,
    maxFileBytes: (Number.isFinite(kb) ? Math.min(4096, Math.max(16, Math.round(kb))) : 400) * 1024,
    extraIgnore: typeof extra === 'string' ? extra.slice(0, 4000) : '',
  };
}

/**
 * The tools, as plain definitions over a manager. Exported for tests.
 * @param {object} deps - what the tools need.
 * @param {object} deps.manager - from `createManager`.
 * @param {(exec: object) => Promise<string>} deps.folderOf - the working folder of the calling conversation.
 * @param {() => boolean} deps.enabled - whether the add-on is switched on.
 * @returns {object[]} tool definitions.
 */
export function buildTools({ manager, folderOf, enabled }) {
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  /**
   * @param {(map: {index: object, links: object, running: boolean}, args: object) => string} answer - builds the text.
   * @returns {(args: object, exec: object) => Promise<{text: string}>} the tool body.
   */
  const withMap = (answer) => async (args, exec) => {
    if (!enabled()) return { text: 'The code map is switched off in Settings → Code map. Use the read and grep tools.' };
    let root;
    try {
      root = await folderOf(exec);
    } catch {
      root = '';
    }
    const map = await manager.ensure(root);
    if (map.error) return { text: `${map.error} Use the read and grep tools instead.` };
    try {
      return { text: answer(map, args ?? {}) };
    } catch (error) {
      return { text: `The code map could not answer (${String(error?.message ?? error).slice(0, 120)}). Use the read and grep tools for this.` };
    }
  };
  const common = { output, timeoutMs: 30_000, isConcurrencySafe: () => true };
  return [
    {
      name: 'code_map_overview',
      description: 'Map of the project: size, languages, folders, starting points, most connected files. Call first, before reading files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Sub-folder to zoom into.' },
          budget: { type: 'integer', minimum: 300, maximum: 6000, description: 'Rough size of the answer in tokens (default 1500).' },
        },
        additionalProperties: false,
      },
      ...common,
      execute: withMap((map, args) => overview(map.index, map.links, { path: args.path, budget: args.budget, running: map.running })),
    },
    {
      name: 'code_map_file',
      description: "One file's outline: its symbols with line numbers, what it uses and what uses it. No file body.",
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path inside the project.' } },
        required: ['path'],
        additionalProperties: false,
      },
      ...common,
      execute: withMap((map, args) => fileOutline(map.index, map.links, args.path)),
    },
    {
      name: 'code_map_find',
      description: 'Find functions, classes, types and files by name across the project (names and signatures, not file contents).',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2, description: 'Name or part of a name.' },
          kind: { type: 'string', enum: ['function', 'method', 'class', 'type', 'const', 'file'], description: 'Only this kind.' },
          path: { type: 'string', description: 'Only under this folder.' },
          limit: { type: 'integer', minimum: 1, maximum: 60 },
        },
        required: ['query'],
        additionalProperties: false,
      },
      ...common,
      execute: withMap((map, args) => find(map.index, map.links, args)),
    },
    {
      name: 'code_map_related',
      description: 'For a file: what it uses and what uses it. For a symbol name: where it is defined and where the name is used.',
      parameters: {
        type: 'object',
        properties: {
          target: { type: 'string', description: 'File path or symbol name.' },
          depth: { type: 'integer', minimum: 1, maximum: 3, description: 'Steps to follow for a file (default 1).' },
        },
        required: ['target'],
        additionalProperties: false,
      },
      ...common,
      execute: withMap((map, args) => related(map.index, map.links, args)),
    },
    {
      name: 'code_map_read',
      description: 'Read one symbol (function, class, method) or the lines around a line number, instead of a whole file.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path inside the project.' },
          symbol: { type: 'string', description: 'Symbol name, or Class.method.' },
          line: { type: 'integer', minimum: 1, description: 'Read around this line instead.' },
          context: { type: 'integer', minimum: 3, maximum: 120, description: 'Lines before and after `line` (default 20).' },
        },
        required: ['path'],
        additionalProperties: false,
      },
      ...common,
      execute: withMap((map, args) => readPart(map.index, args)),
    },
  ];
}

/**
 * One line of numbers about a mapped folder.
 * @param {object} row - a row from `manager.list()`.
 * @returns {string} the line.
 */
function rowLine(row) {
  return `${row.folder}: ${row.files} files, ${row.symbols} symbols, ${size(row.bytes)} of source; the map takes ${size(row.diskBytes)} on disk${row.building ? ' (updating now)' : ''}.`;
}

/**
 * Read a small JSON body from a request.
 * @param {object} req - Node request.
 * @param {number} limit - most bytes accepted.
 * @returns {Promise<object | null>} the parsed object, or null when missing, too large or not JSON.
 */
function readBody(req, limit = 2048) {
  return new Promise((done) => {
    let total = 0;
    const chunks = [];
    let over = false;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) over = true;
      else chunks.push(chunk);
    });
    req.on('end', () => {
      if (over) return done(null);
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        done(value && typeof value === 'object' && !Array.isArray(value) ? value : null);
      } catch {
        done(null);
      }
    });
    req.on('error', () => done(null));
  });
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - live plugin config.
 */
export function apply(ctx, config) {
  const enabled = () => plain(config.enabled) !== false;
  const home = ctx.get('dshHomePath');
  const configuredDir = String(plain(config.dataDir) ?? '').trim();
  const dataDir = configuredDir || (typeof home === 'function' ? home('code-map') : '');
  if (!dataDir) {
    ctx.logger.warn('code-map: no data folder is available; the code map is off');
    return;
  }
  const manager = createManager({
    dataDir,
    limits: () => readLimits(config),
    warn: (message) => ctx.logger.warn(message),
  });

  /** Agent id -> its working folder, for the prompt hint (which must answer at once). */
  const folders = new Map();

  /**
   * @param {object} agent - live Agent.
   * @returns {string} the folder recorded in the Agent's header, or an empty string.
   */
  function headerFolder(agent) {
    const header = agent?.header ?? agent?.session?.header;
    return typeof header?.cwd === 'string' ? header.cwd : '';
  }

  /**
   * The working folder of an Agent, as the app sees it now.
   * @param {object} agent - live Agent.
   * @param {AbortSignal} [signal] - stops the lookup.
   * @returns {Promise<string>} absolute folder, or an empty string.
   */
  async function folderOfAgent(agent, signal) {
    let folder = '';
    try {
      const service = ctx.get('workingDirectory');
      if (service?.ensure && agent) folder = String((await service.ensure(agent, signal)) ?? '');
    } catch {
      folder = '';
    }
    if (!folder) folder = headerFolder(agent);
    if (agent?.id && folder) folders.set(agent.id, folder);
    return folder;
  }

  // ---- tools ---------------------------------------------------------------
  for (const tool of buildTools({ manager, folderOf: (exec) => folderOfAgent(exec?.agent, exec?.signal), enabled })) {
    ctx.effect(() => ctx.tools.register(tool), `code-map tool ${tool.name}`);
  }

  // ---- the short hint --------------------------------------------------------
  /** Agent id -> disposer of its prompt section. */
  const sections = new Map();

  /**
   * Add the hint section to one Agent. Never throws.
   * @param {object} agent - live Agent.
   */
  function installHint(agent) {
    try {
      if (!agent?.id || sections.has(agent.id) || !agent.ctx?.systemPrompt) return;
      const dispose = agent.ctx.effect(
        () =>
          agent.ctx.systemPrompt.section({
            name: 'code-map',
            order: 72,
            interpolate: false,
            text: () => {
              try {
                if (!enabled() || plain(config.promptHint) === false) return '';
                const folder = folders.get(agent.id) ?? headerFolder(agent);
                return folder && manager.looksLikeProject(folder) ? HINT : '';
              } catch {
                return '';
              }
            },
          }),
        'code-map prompt section',
      );
      if (typeof dispose === 'function') sections.set(agent.id, dispose);
    } catch (error) {
      // A section left by an earlier load of this add-on stays until restart; it says the same thing.
      if (!String(error?.message ?? error).includes('already registered')) {
        ctx.logger.warn(`code-map: could not add the hint: ${error?.message ?? error}`);
      }
    }
  }

  ctx.on('agent/created', ({ agent }) => {
    try {
      installHint(agent);
      // Learn the folder in the background; the app waits for this listener before a conversation opens.
      void folderOfAgent(agent).catch(() => {});
    } catch {
      // An agent/created listener must never throw.
    }
  });
  for (const agent of ctx.get('agents')?.list() ?? []) {
    installHint(agent);
    void folderOfAgent(agent).catch(() => {});
  }
  ctx.on('agent/disposed', ({ agent }) => {
    folders.delete(agent.id);
    const dispose = sections.get(agent.id);
    sections.delete(agent.id);
    try {
      dispose?.();
    } catch {
      // The Agent context is already unwinding.
    }
  });
  ctx.effect(() => () => {
    for (const dispose of sections.values()) {
      try {
        dispose?.();
      } catch {
        // The Agent context may already be disposed.
      }
    }
    sections.clear();
  }, 'code-map prompt ownership');

  // ---- service ---------------------------------------------------------------
  ctx.effect(
    () =>
      ctx.provide(
        'codeMap',
        Object.freeze({
          apiVersion: 1,
          /** @param {string} folder @returns {Promise<object>} `{index, links, running}` or `{error}`. */
          ensure: (folder) => manager.ensure(folder),
          /** @returns {object[]} mapped folders with their numbers. */
          list: () => manager.list(),
        }),
      ),
    'code-map service',
  );

  // ---- skills ----------------------------------------------------------------
  if (plain(config.skills) !== false) {
    const skills = ctx.get('skills');
    if (skills?.register) {
      for (const skill of SKILLS) {
        ctx.effect(
          () => skills.register({ ...skill, source: 'custom', invocation: { modelInvocable: true, userInvocable: true } }),
          `code-map skill ${skill.name}`,
        );
      }
    } else {
      ctx.logger.warn('code-map: the skills service is not available; the reverse-engineer skills are not registered');
    }
  }

  // ---- command ---------------------------------------------------------------
  const commandName = String(plain(config.commandName) ?? '').trim();
  if (commandName) {
    ctx.inject(['commands'], (inner) => {
      inner.effect(
        () =>
          inner.commands.register({
            name: commandName,
            description: 'Code map of this folder: `status` (default), `build` to map it again, `clear` to delete its map',
            input: { hint: '[status|build|clear]' },
            handler: async ({ agent, rawInput }) => {
              const arg = String(rawInput ?? '').trim().toLowerCase() || 'status';
              if (!['status', 'build', 'clear'].includes(arg)) {
                return { kind: 'error', text: `Usage: /${commandName} [status|build|clear]` };
              }
              const folder = await folderOfAgent(agent);
              const refusal = manager.refusal(folder);
              if (refusal) return { kind: 'error', text: refusal };
              if (arg === 'clear') {
                const removed = manager.clear(manager.idOf(folder));
                return { kind: 'success', text: removed ? `The code map of ${folder} was deleted. It is built again when next needed.` : 'This folder has no code map yet.' };
              }
              if (!enabled()) return { kind: 'error', text: 'The code map is switched off in Settings → Code map.' };
              if (arg === 'build') {
                // A slow disk must not hold the command: after a few seconds the mapping goes on in the background.
                let timer;
                const built = await Promise.race([
                  manager.rebuild(folder),
                  new Promise((done) => {
                    timer = setTimeout(() => done({ pending: true }), 8000);
                  }),
                ]);
                clearTimeout(timer);
                if (built.error) return { kind: 'error', text: built.error };
                if (built.pending) return { kind: 'success', text: `Mapping ${folder} is taking a while and goes on in the background. Run /${commandName} again in a moment to see the numbers.` };
              }
              const row = manager.list().find((item) => item.id === manager.idOf(folder));
              if (!row) return { kind: 'success', text: `${folder} has no code map yet. It is built the first time the model uses it, or now with /${commandName} build.` };
              const languages = row.languages.slice(0, 6).map(([lang, n]) => `${lang} ${n}`).join(', ');
              return { kind: 'success', text: `${rowLine(row)}\nLanguages: ${languages}.${row.truncated ? '\nOnly part of the folder is mapped (a limit was reached); raise the limits in Settings → Code map.' : ''}` };
            },
          }),
        'code-map command',
      );
    });
  }

  // ---- routes for the Settings page ---------------------------------------------
  // Both sit behind the app's own fence (login cookie and Host/Origin check) and are never cached.
  // Status is GET only. Actions are POST only, need a small JSON body and a custom header, and can
  // only name a folder that already has a map or the app's default folder: the page cannot point
  // the mapper at an arbitrary path.
  ctx.inject(['webServer', 'connection'], (inner) => {
    /**
     * @param {object} req - request. @param {object} res - response. @param {string} method - the one method allowed.
     * @returns {boolean} true when the request may go on.
     */
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
    /** @returns {string} the app's default working folder, or an empty string. */
    const defaultFolder = () => {
      try {
        return String(ctx.get('workingDirectory')?.defaultDirectory ?? '');
      } catch {
        return '';
      }
    };
    /** @returns {object} what the page shows. */
    const status = () => {
      const folder = defaultFolder();
      const rows = manager.list();
      const limits = readLimits(config);
      return {
        at: Date.now(),
        enabled: enabled(),
        promptHint: plain(config.promptHint) !== false,
        limits: { maxFiles: limits.maxFiles, maxFileKb: Math.round(limits.maxFileBytes / 1024), extraIgnore: limits.extraIgnore },
        defaultFolder: folder ? { folder, id: manager.idOf(folder), refusal: manager.refusal(folder) } : null,
        folders: rows.slice(0, 50),
      };
    };

    inner.effect(
      () =>
        inner.webServer.register({
          kind: 'exact',
          path: STATUS_PATH,
          handler: (req, res) => {
            if (!guard(req, res, 'GET')) return;
            try {
              res.end(JSON.stringify(status()));
            } catch (error) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 200) }));
            }
          },
        }),
      'code-map: GET status route',
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
              if (req.headers?.[ACTION_HEADER] !== '1' || !String(req.headers?.['content-type'] ?? '').startsWith('application/json')) {
                return fail(400, 'This request did not come from the Code map page.');
              }
              const body = await readBody(req);
              const id = String(body?.id ?? '');
              if (!body || !['rebuild', 'clear'].includes(body.action) || !/^[a-f0-9]{16}$/.test(id)) {
                return fail(400, 'Unknown action.');
              }
              const preset = defaultFolder();
              const folder = manager.folderOf(id) ?? (preset && manager.idOf(preset) === id ? preset : null);
              if (!folder) return fail(404, 'That folder has no code map.');
              if (body.action === 'clear') {
                manager.clear(id);
              } else {
                if (!enabled()) return fail(409, 'The code map is switched off.');
                // A very large folder goes on mapping in the background; the page shows "Mapping…".
                let timer;
                const built = await Promise.race([
                  manager.rebuild(folder),
                  new Promise((done) => {
                    timer = setTimeout(() => done({ pending: true }), 60_000);
                  }),
                ]);
                clearTimeout(timer);
                if (built.error) return fail(409, built.error);
              }
              res.end(JSON.stringify(status()));
            } catch (error) {
              fail(500, String(error?.message ?? error).slice(0, 200));
            }
          },
        }),
      'code-map: POST action route',
    );
  });
}
