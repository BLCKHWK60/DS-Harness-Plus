/**
 * Host half of the Cowork sidebar. The sidebar itself is the browser half (client.js); this row
 * exists so the browser half loads only while the row is on, and it carries the tab layout as
 * settings (volatile, so a later Settings page can edit it).
 *
 * The bundle patch switches the app's own sidebar (`ui-sidebar`) off, and this row turns itself on only
 * while that sidebar is off: both at once would stop the app from loading.
 */
import { dirname } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { KEEP_MS, openTrash, safeId } from './lib/trash.js';
import { UPLOAD_MAX, addFile, canonical, listFiles, noteOf, openProjects } from './lib/projects.js';
import { openPresets } from './lib/presets.js';
import { buildDigest, drift } from './lib/digest.js';
import { generatePrompt, openVersions, parseGenerated, versionsDir, whereOf } from './lib/generate.js';
import { fileURLToPath } from 'node:url';

export const name = 'cowork-shell';

/** Default tab layout: which sidebar pages each mode's tab lists, by page id. */
export const DEFAULT_TABS = {
  "chat": {
    "newLabel": "New chat",
    "pages": [
      "model-arena"
    ],
    "greeting": "Let's knock something off your list",
    "chips": []
  },
  "cowork": {
    "newLabel": "New task",
    "pages": [
      "schedules",
      "automations",
      "connectors",
      "skills"
    ],
    "greeting": "Let's knock something off your list",
    "chips": [
      {
        "label": "Create slides",
        "icon": "slides",
        "prompt": "Create a slide deck about: "
      },
      {
        "label": "Build website",
        "icon": "website",
        "prompt": "Build a website for: "
      },
      {
        "label": "Develop apps",
        "icon": "app",
        "prompt": "Help me develop an app that: "
      },
      {
        "label": "Spreadsheet",
        "icon": "spreadsheet",
        "prompt": "Make a spreadsheet that: "
      },
      {
        "label": "Visualization",
        "icon": "chart",
        "prompt": "Make a chart or visual that shows: "
      },
      {
        "label": "Wide research",
        "icon": "research",
        "prompt": "Research a list of items and put the findings in a table: "
      },
      {
        "label": "Create games",
        "icon": "game",
        "prompt": "Create a small game: "
      }
    ]
  },
  "code": {
    "newLabel": "New code task",
    "pages": [
      "connectors",
      "skills"
    ],
    "greeting": "What should we build?",
    "chips": [
      {
        "label": "Create slides",
        "icon": "slides",
        "prompt": "Create a slide deck about: "
      },
      {
        "label": "Build website",
        "icon": "website",
        "prompt": "Build a website for: "
      },
      {
        "label": "Develop apps",
        "icon": "app",
        "prompt": "Help me develop an app that: "
      },
      {
        "label": "Spreadsheet",
        "icon": "spreadsheet",
        "prompt": "Make a spreadsheet that: "
      },
      {
        "label": "Visualization",
        "icon": "chart",
        "prompt": "Make a chart or visual that shows: "
      },
      {
        "label": "Wide research",
        "icon": "research",
        "prompt": "Research a list of items and put the findings in a table: "
      },
      {
        "label": "Create games",
        "icon": "game",
        "prompt": "Create a small game: "
      }
    ]
  },
  "data": {
    "newLabel": "New analysis",
    "pages": [],
    "greeting": "What do you want to find out from your data?",
    "chips": [
      {
        "label": "What is here",
        "icon": "folder",
        "prompt": "List the data files in this folder and profile the tables: what each holds, how many rows, and anything that looks wrong."
      },
      {
        "label": "Summarise",
        "icon": "spreadsheet",
        "prompt": "Summarise the main table in this folder: the key figures, how they are spread, and what stands out."
      },
      {
        "label": "Trends",
        "icon": "chart",
        "prompt": "Show how the main figures in this data change over time, with a chart."
      },
      {
        "label": "Compare groups",
        "icon": "chart",
        "prompt": "Compare the main groups in this data with each other and say which differences matter."
      },
      {
        "label": "Check quality",
        "icon": "spark",
        "prompt": "Check this data for problems: empty cells, duplicates, outliers, odd formats and values that cannot be right."
      },
      {
        "label": "Run saved",
        "icon": "research",
        "prompt": "Run my saved analyses for this folder again and tell me what moved."
      }
    ]
  },
  "finance": {
    "newLabel": "New research",
    "pages": [],
    "greeting": "What do you want to look into?",
    "chips": [
      {
        "label": "Deep dive",
        "icon": "research",
        "prompt": "Do a full deep dive on the selected subject."
      },
      {
        "label": "Earnings review",
        "icon": "spreadsheet",
        "prompt": "Review the latest earnings of the selected company."
      },
      {
        "label": "News and mood",
        "icon": "spark",
        "prompt": "What are the news and social media saying about the selected subject right now?"
      },
      {
        "label": "Compare",
        "icon": "chart",
        "prompt": "Compare the selected company with its closest competitors."
      },
      {
        "label": "Sector scan",
        "icon": "research",
        "prompt": "Scan the sector of the selected subject: who is gaining, who is losing, and why?"
      },
      {
        "label": "Economy brief",
        "icon": "chart",
        "prompt": "Give me an economy brief for the selected market."
      },
      {
        "label": "What changed",
        "icon": "spark",
        "prompt": "What has changed for the selected subject in the last month?"
      }
    ]
  }
};

/** Read-only routes the Skills and Connectors pages read. */
export const SKILLS_PATH = '/dsh-cowork-shell/skills';
export const PROJECTS_PATH = '/dsh-cowork-shell/projects';
export const CONNECTORS_PATH = '/dsh-cowork-shell/connectors';
export const TRASH_PATH = '/dsh-cowork-shell/trash';
const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';

/**
 * What an MCP server row runs or reaches, without env values, headers or arguments that may hold secrets.
 * @param {object} config - the row's config.
 * @returns {string} a short description.
 */
export function targetOf(config) {
  if (!config || typeof config !== 'object') return '';
  if (typeof config.url === 'string') {
    try {
      // Only where it goes: some services put a key in the path or the query.
      return new URL(config.url.replace(/\$\{[^}]*\}/g, 'x')).origin;
    } catch {
      return '';
    }
  }
  if (typeof config.command === 'string') {
    const SECRET_NAME = /token|key|secret|password|passwd|auth|bearer|credential/i;
    const looksSecret = (a) => a.includes('${') || SECRET_NAME.test(a) || /^[A-Za-z0-9_\-+/=.]{24,}$/.test(a);
    const shown = [];
    const args = Array.isArray(config.args) ? config.args.filter((a) => typeof a === 'string') : [];
    for (let i = 0; i < args.length && shown.length < 3; i += 1) {
      const arg = args[i];
      if (looksSecret(arg)) {
        // A flag like --api-key is usually followed by its value: drop that too.
        if (/^-/.test(arg) && !arg.includes('=')) i += 1;
        continue;
      }
      shown.push(arg);
    }
    return [config.command, ...shown].join(' ').slice(0, 160);
  }
  return '';
}

/**
 * Plain value of a config field that may be a reactive wrapper.
 * @param {unknown} value - field value.
 * @returns {unknown} plain value.
 */
function plain(value) {
  if (value && typeof value === 'object' && typeof value.get === 'function' && !Array.isArray(value)) {
    try {
      return value.get();
    } catch {
      return undefined;
    }
  }
  return value;
}

export const Config = z.object({
  /**
   * Tab layout as JSON: `{ modeId: { newLabel, pages: [pageId], greeting, chips: [{ label, prompt, icon }] } }`. Tabs follow the Modes add-on's
   * modes; a mode not listed here gets a tab with no pages of its own. Pages that no tab lists
   * (for example Plugins) show under every tab.
   */
  tabs: z.string().default(JSON.stringify(DEFAULT_TABS)).volatile(),
  /** At most this many tabs (the first modes in order). */
  maxTabs: z.natural().min(1).max(5).default(3).volatile(),
  /** Hide the DeepSeek logo and name at the top of the sidebar and the logo on the start page. */
  hideLogos: z.boolean().default(false).volatile(),
  /** Show today's date as the start page title instead of the tab's greeting. */
  dateTitle: z.boolean().default(false).volatile(),
  /** Let the conversation and the message box use the whole width of the window instead of a centred column. */
  wideChat: z.boolean().default(false).volatile(),
});

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  // Tells the Modes add-on that the sidebar tabs choose the mode of conversations that have not
  // sent a message yet (and that its chat-box selector should stay hidden).
  ctx.effect(() => ctx.provide('coworkShell', Object.freeze({ apiVersion: 1, tabsDecideMode: true })), 'cowork-shell service');

  /** Common guard for the routes: login and Host/Origin fence, one method (GET unless named), no caching. */
  const guard = (inner, req, res, methods = ['GET']) => {
    const refused = inner.connection.requestRejection(req);
    if (refused !== undefined) {
      res.statusCode = refused;
      res.end();
      return false;
    }
    if (!methods.includes(req.method)) {
      res.statusCode = 405;
      res.setHeader('allow', methods.join(', '));
      res.end();
      return false;
    }
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    return true;
  };

  // Connectors page: every MCP server row (one `dsh-mcp-client` row per server in this app version),
  // whether it is on, what it runs (no secrets) and how many tools it has registered right now.
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: CONNECTORS_PATH,
      handler: (req, res) => {
        if (!guard(inner, req, res)) return;
        try {
          const loader = ctx.get('loader') ?? ctx.loader;
          const entries = loader ? [...loader.entries()] : [];
          let tools = [];
          try {
            tools = (ctx.get('tools')?.definitions?.() ?? []).map((d) => d.name);
          } catch {
            tools = [];
          }
          const servers = entries.filter((e) => e.options?.name === MCP_CLIENT).map((e) => {
            const config = plain(e.options.config) ?? {};
            const serverName = String(plain(config.serverName) ?? e.options.id ?? '');
            return {
              entryId: String(e.id ?? e.options.id ?? ''),
              id: String(e.options.id ?? ''),
              serverName,
              transport: String(plain(config.transport) ?? (config.url ? 'streamable-http' : 'stdio')),
              target: targetOf(config),
              enabled: !e.disabled,
              running: Boolean(e.fiber),
              toolCount: tools.filter((name) => name.startsWith(`mcp__${serverName}__`)).length,
            };
          });
          res.end(JSON.stringify({ at: Date.now(), servers }));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
        }
      },
    }), 'cowork-shell connectors route');
  });

  // Skills page: the skills available in the default working folder. GET only, behind the app's
  // login and Host/Origin check, no caching. Serves names, descriptions and file paths, never skill bodies.
  ctx.inject(['skills', 'workingDirectory', 'webServer', 'connection'], (inner) => {
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: SKILLS_PATH,
      handler: async (req, res) => {
        if (!guard(inner, req, res)) return;
        try {
          const cwd = inner.workingDirectory.defaultDirectory;
          // Skills load per agent preset (the default one is "Standard mode"), so read through the
          // default preset's scope, the way the app's own skill menu does for a new conversation.
          const presets = ctx.get('agentPresets');
          let lease;
          try {
            lease = presets ? await presets.acquireScope(undefined) : undefined;
          } catch {
            lease = undefined;
          }
          let list;
          try {
            list = await inner.skills.list({ cwd, scope: lease?.key });
          } finally {
            await lease?.[Symbol.asyncDispose]?.();
          }
          const skills = list.map((skill) => ({
            name: String(skill.name),
            description: typeof skill.description === 'string' ? skill.description.slice(0, 600) : '',
            whenToUse: typeof skill.whenToUse === 'string' ? skill.whenToUse.slice(0, 400) : '',
            path: typeof skill.path === 'string' ? skill.path : '',
            provider: typeof skill.provider === 'string' ? skill.provider : '',
            modelInvocable: skill.invocation?.modelInvocable !== false,
            userInvocable: skill.invocation?.userInvocable !== false,
          }));
          res.end(JSON.stringify({ at: Date.now(), folder: cwd, skills }));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
        }
      },
    }), 'cowork-shell skills route');
  });

  // Projects: a project is one of the app's project folders plus what Plus keeps about it (the tab it
  // shows under and its own instructions, in <home>/cowork-shell/projects.json). The instructions
  // reach every conversation whose folder is the project's folder as a system-prompt section.
  const projects = openProjects(ctx.get('dshHomePath')?.('cowork-shell', 'projects.json') ?? '');
  const versions = openVersions(versionsDir(ctx.get('dshHomePath')?.('cowork-shell', 'projects.json') ?? ''));

  /** The settings of another part of the app, by its namespace; undefined when it is not there. */
  const settingsOf = (ns) => {
    try {
      return ctx.get('settings')?.describe?.().find((entry) => entry.ns === ns)?.value;
    } catch {
      return undefined;
    }
  };
  /**
   * Where a provider's models run. Providers the user added carry their address; the app's own
   * DeepSeek providers and catalogue providers without an address of their own are services on
   * the internet. What cannot be told is reported as unknown, and the page treats that as cloud.
   */
  const whereIs = (provider) => {
    const id = String(provider ?? '');
    const own = settingsOf('llm-pi-ai')?.providers?.[id];
    if (own && typeof own === 'object') {
      const address = own.baseURL ?? own.baseUrl;
      return address ? { ...whereOf(address), name: String(own.displayName ?? id) } : { where: 'cloud', host: '', name: String(own.displayName ?? id) };
    }
    if (/^deepseek/i.test(id)) return { where: 'cloud', host: 'DeepSeek', name: 'DeepSeek' };
    return { where: 'unknown', host: '', name: id };
  };
  /** Whether the shared tools of another tab are there for a Cowork project to use. */
  const sharedTools = () => ({ data: settingsOf('data')?.enabled === true, finance: settingsOf('finance')?.enabled === true });

  /** Ask a model for text. It is given no tools: it can only answer. */
  const askModel = async (provider, model, text, signal) => {
    const llm = ctx.get('llm');
    if (!llm?.stream) throw new Error('The app\'s model service is not available.');
    let answer = '';
    for await (const chunk of llm.stream({ provider, model, messages: [{ role: 'user', content: [{ type: 'text', text }] }], signal })) {
      if (chunk.type === 'text-delta') answer += chunk.text;
      else if (chunk.type === 'finish' && chunk.reason?.kind === 'error') throw new Error(chunk.reason.failure?.message ?? 'The model reported an error.');
      else if (chunk.type === 'finish' && chunk.reason?.kind === 'aborted') throw new Error('The model took too long and was stopped.');
    }
    if (signal?.aborted) throw new Error('The model took too long and was stopped.');
    return answer;
  };

  // Project types: the ones that ship are files beside this one; the user's own are in the data folder.
  const presets = openPresets(fileURLToPath(new URL('./presets', import.meta.url)), ctx.get('dshHomePath')?.('cowork-shell', 'presets') ?? '');
  const registryList = () => {
    try {
      return ctx.get('workspaceRegistry')?.list?.() ?? [];
    } catch {
      return [];
    }
  };
  const projectNote = (agent) => {
    const header = agent?.header ?? agent?.session?.header;
    // A helper agent works for its conversation and has its own task text: no project note.
    if (typeof header?.cwd !== 'string' || !header.cwd || header.origin === 'subagent') return '';
    const record = projects.get(header.cwd);
    if (!record) return '';
    // A typed project is pointed at the Data and Finance tools its type uses, while they are switched on.
    const wants = presets.get(record.preset)?.tools ?? [];
    const on = sharedTools();
    const shared = wants.filter((tool) => on[tool]);
    if (!record.instructions && shared.length === 0) return '';
    const key = canonical(header.cwd);
    const workspace = registryList().find((item) => canonical(item.path) === key);
    return noteOf(workspace?.title ?? '', record.instructions, shared);
  };
  const projectSections = new Map();
  const installProjectNote = (agent) => {
    if (!agent?.id || projectSections.has(agent.id) || !agent.ctx?.systemPrompt) return;
    try {
      projectSections.set(agent.id, agent.ctx.effect(() => agent.ctx.systemPrompt.section({
        name: 'cowork-shell:project',
        order: 58,
        interpolate: false,
        text: () => {
          try {
            if (ctx.get('modes')?.isolated?.(agent.id) === true) return '';
            return projectNote(agent);
          } catch {
            return '';
          }
        },
      }), 'project instructions'));
    } catch (error) {
      ctx.logger?.warn?.(`cowork-shell: could not add the project instructions: ${String(error?.message ?? error)}`);
    }
  };
  /**
   * A new conversation in a project whose type says so starts with Search switched off (Paperwork:
   * private papers should not turn into web queries by default). The user can switch it on in the
   * chat box as always; a conversation that has run, or whose switch was set, is left alone.
   */
  const startSearchOff = async (agent) => {
    try {
      const header = agent?.header ?? agent?.session?.header;
      if (!agent?.id || typeof header?.cwd !== 'string' || !header.cwd || header.origin === 'subagent') return;
      const phase = agent.phase;
      if (!phase || phase.kind === 'running' || phase.lastTurn !== 0) return;
      const record = projects.get(header.cwd);
      if (!record || !presets.get(record.preset)?.searchOff) return;
      const service = ctx.get('settings');
      const modes = service?.describe?.().find((entry) => entry.ns === 'modes')?.value;
      if (!modes || typeof modes.sessionWeb !== 'string') return;
      let table;
      try {
        table = JSON.parse(modes.sessionWeb || '{}');
      } catch {
        return;
      }
      if (!table || typeof table !== 'object' || Array.isArray(table) || typeof table[agent.id] === 'boolean') return;
      await service.mutate('modes', [{ op: 'set', path: ['sessionWeb'], value: JSON.stringify({ ...table, [agent.id]: false }) }]);
    } catch (error) {
      ctx.logger?.warn?.(`cowork-shell: could not start a conversation with Search off: ${String(error?.message ?? error)}`);
    }
  };
  ctx.on('agent/created', ({ agent }) => {
    installProjectNote(agent);
    void startSearchOff(agent);
  });
  ctx.on('agent/disposed', ({ agent }) => projectSections.delete(agent?.id));
  try {
    for (const agent of ctx.get('agents')?.list?.() ?? []) installProjectNote(agent);
  } catch {
    /* agents appear later */
  }
  ctx.effect(() => () => {
    for (const dispose of projectSections.values()) {
      try {
        dispose?.();
      } catch {
        /* the conversation may already be closing */
      }
    }
    projectSections.clear();
  }, 'cowork-shell project notes');

  ctx.inject(['webServer', 'connection'], (inner) => {
    /** Only a folder the app lists as a project may be read or written through this route. */
    const projectFolder = (path) => {
      const key = canonical(path);
      const found = key ? registryList().find((item) => canonical(item.path) === key) : undefined;
      if (!found) throw new Error('That folder is not one of your projects.');
      return key;
    };
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: PROJECTS_PATH,
      handler: async (req, res) => {
        if (!guard(inner, req, res, ['GET', 'POST'])) return;
        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const out = {};
          if (req.method === 'POST' && url.searchParams.get('upload') === '1') {
            const folder = projectFolder(url.searchParams.get('path'));
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > UPLOAD_MAX) throw new Error('That file is larger than 100 MB. Put it into the folder with the Finder instead.');
              chunks.push(chunk);
            }
            out.saved = addFile(folder, url.searchParams.get('name'), Buffer.concat(chunks));
            out.files = listFiles(folder);
          } else if (req.method === 'POST') {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 64 * 1024) throw new Error('request too large');
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (body?.action === 'save') {
              // A type must be one that exists; an unknown one is left out rather than stored.
              const preset = typeof body.preset === 'string' && presets.get(body.preset) ? body.preset : undefined;
              const folder = projectFolder(body.path);
              const before = projects.get(folder)?.instructions ?? '';
              const saved = projects.save(folder, { tab: body.tab, instructions: body.instructions, preset });
              if (typeof body.instructions === 'string' && saved.instructions !== before) {
                // What was there before this add-on kept versions is kept too, so the first change can be undone.
                if (versions.list(folder).length === 0) versions.add(folder, { text: before, by: 'you', at: Date.now() - 1 });
                versions.add(folder, { text: saved.instructions, by: body.by, note: body.note });
                if (body.by === 'model' && body.mark && typeof body.mark === 'object') versions.setMark(folder, body.mark);
              }
              out.versions = versions.list(folder);
            } else if (body?.action === 'generate') {
              const folder = projectFolder(body.path);
              const provider = String(body.provider ?? '');
              const model = String(body.model ?? '');
              if (!provider || !model) throw new Error('Pick a model first.');
              const place = whereIs(provider);
              // Nothing of the folder leaves this computer without the user having said yes to exactly that.
              if ((place.where === 'cloud' || place.where === 'unknown') && body.agreed !== true) throw new Error('This model runs on the internet, or Plus cannot tell where it runs. Confirm that the folder may be sent to it.');
              const digest = buildDigest(folder, { contents: body.contents !== false });
              const record = projects.get(folder);
              const preset = presets.get(record?.preset || 'blank');
              const title = registryList().find((item) => canonical(item.path) === folder)?.title ?? '';
              const limit = AbortSignal.timeout(5 * 60_000);
              const answer = await askModel(provider, model, generatePrompt({ title, preset, current: typeof body.current === 'string' ? body.current : record?.instructions ?? '', digest: digest.text, guides: digest.summary.guides }), limit);
              const parsed = parseGenerated(answer);
              if (!parsed.instructions) throw new Error('The model gave no instructions. Try again, or try another model.');
              out.generated = { ...parsed, model, provider, where: place.where, sent: { files: digest.summary.files, included: digest.summary.included.length, chars: digest.summary.chars, contents: digest.summary.contents }, mark: digest.mark };
            } else if (body?.action === 'preset-save') out.saved = presets.save({ name: body.name, description: body.description, tools: body.tools, searchOff: body.searchOff === true, instructions: body.instructions }).id;
            else if (body?.action === 'preset-remove') presets.remove(body.id);
            else if (body?.action === 'forget') projects.forget(body.path);
            else throw new Error('unknown action');
          } else if (url.searchParams.get('files')) {
            out.files = listFiles(projectFolder(url.searchParams.get('files')));
          } else if (url.searchParams.get('digest')) {
            // What would be sent, for the user to see before anything is sent. The text itself stays here.
            const folder = projectFolder(url.searchParams.get('digest'));
            const digest = buildDigest(folder, { contents: url.searchParams.get('contents') !== '0' });
            out.digest = { ...digest.summary, drift: drift(versions.mark(folder), digest.mark), generatedBefore: versions.mark(folder) !== undefined };
            out.versions = versions.list(folder);
            if (url.searchParams.get('provider')) out.where = whereIs(url.searchParams.get('provider'));
          }
          const list = registryList().map((item) => ({ workspaceId: String(item.id), path: item.path, title: item.title, tab: '', instructions: '', preset: '', ...(projects.get(item.path) ?? {}) }));
          res.end(JSON.stringify({ at: Date.now(), projects: list, presets: presets.list(), shared: sharedTools(), ...out }));
        } catch (error) {
          res.statusCode = req.method === 'POST' ? 400 : 500;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
        }
      },
    }), 'cowork-shell projects route');
  });

  // Trash: the app cannot delete a conversation, so Delete moves an archived conversation's files
  // into <home>/trash/conversations for 30 days (see lib/trash.js). One the app still holds in
  // memory is only remembered; its files move at the next start.
  ctx.inject(['sessionPersistence', 'sessions', 'workspaceRegistry', 'webServer', 'connection'], (inner) => {
    const dir = ctx.get('dshHomePath')?.('trash', 'conversations');
    if (!dir) {
      ctx.logger?.warn?.('cowork-shell: no data folder is available; Delete is off');
      return;
    }
    const trash = openTrash(dir);
    const cacheOf = (id) => ctx.get('dshHomePath')('storages', 'session_projcache', 'sessions', `${id}.json`);
    const inMemory = (id) => {
      try {
        return inner.sessions.get(id) !== undefined;
      } catch {
        return true;
      }
    };

    /** The conversation and its helper conversations, each with its folder; undefined when one is in memory. */
    const partsOf = async (id) => {
      const stored = await inner.sessionPersistence.list();
      const parentOf = new Map(stored.map((snap) => [snap.header?.id, snap.header?.origin === 'subagent' ? snap.header?.parentSession : undefined]));
      const under = (sid) => {
        const seen = new Set();
        for (let at = parentOf.get(sid); at !== undefined && !seen.has(at); at = parentOf.get(at)) {
          if (at === id) return true;
          seen.add(at);
        }
        return false;
      };
      const parts = [];
      for (const snap of stored) {
        const sid = snap.header?.id;
        if (sid !== id && !under(sid)) continue;
        if (!safeId(sid) || snap.location?.kind !== 'jsonl' || typeof snap.location.path !== 'string') {
          if (sid === id) throw new Error('this conversation is not stored as files');
          continue;
        }
        if (inMemory(sid)) return undefined;
        const part = { id: sid, folder: dirname(snap.location.path), cache: cacheOf(sid) };
        if (sid === id) parts.unshift(part);
        else parts.push(part);
      }
      if (parts[0]?.id !== id) throw new Error('conversation not found');
      return parts;
    };

    const remove = async (id, title, deletedAt) => {
      if (!inner.workspaceRegistry.archivedSessionIds.includes(id)) throw new Error('archive the conversation first');
      const parts = inMemory(id) ? undefined : await partsOf(id);
      if (parts === undefined) {
        trash.addPending({ id, title, deletedAt });
        return 'pending';
      }
      trash.add({ id, title, parts, deletedAt });
      return 'moved';
    };

    // At start: move what was waiting, then drop what is older than 30 days. Repeated a few times a day.
    const tidy = async () => {
      for (const item of trash.pending()) {
        try {
          if (!inner.workspaceRegistry.archivedSessionIds.includes(item.id)) trash.restore(item.id);
          else await remove(item.id, item.title, item.deletedAt);
        } catch (error) {
          ctx.logger?.warn?.(`cowork-shell: could not move "${item.id}" to the trash: ${String(error?.message ?? error)}`);
        }
      }
      try {
        trash.purge();
      } catch (error) {
        ctx.logger?.warn?.(`cowork-shell: could not empty old trash: ${String(error?.message ?? error)}`);
      }
    };
    void tidy();
    inner.effect(() => {
      const timer = setInterval(() => void tidy(), 6 * 60 * 60 * 1000);
      timer.unref?.();
      return () => clearInterval(timer);
    }, 'cowork-shell trash tidy');

    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: TRASH_PATH,
      handler: async (req, res) => {
        if (!guard(inner, req, res, ['GET', 'POST'])) return;
        try {
          if (req.method === 'POST') {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 4096) throw new Error('request too large');
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            const id = body?.sessionId;
            if (!safeId(id)) throw new Error('not a conversation id');
            if (body.action === 'delete') await remove(id, body.title);
            else if (body.action === 'restore') trash.restore(id);
            else throw new Error('unknown action');
          }
          res.end(JSON.stringify({ at: Date.now(), keepMs: KEEP_MS, items: trash.list() }));
        } catch (error) {
          res.statusCode = req.method === 'POST' ? 400 : 500;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
        }
      },
    }), 'cowork-shell trash route');
  });
}
