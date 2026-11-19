/**
 * Host half of the Cowork sidebar. The sidebar itself is the browser half (client.js); this row
 * exists so the browser half loads only while the row is on, and it carries the tab layout as
 * settings (volatile, so a later Settings page can edit it).
 *
 * The bundle patch switches the app's own sidebar (`ui-sidebar`) off, and this row turns itself on only
 * while that sidebar is off: both at once would stop the app from loading.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import z from '@deepseek-ai/schemastery';
import { KEEP_MS, groupLabel, jsonSize, openTrash, safeId, safeOwner, safeTab, tidyPending } from './lib/trash.js';
import { INSTRUCTIONS_MAX, UPLOAD_MAX, addFile, canonical, listFiles, noteOf, openProjects } from './lib/projects.js';
import { openPresets } from './lib/presets.js';
import { askMarks, withMarks } from './lib/skill-marks.js';
import { buildDigest, drift } from './lib/digest.js';
import { generatePrompt, openVersions, parseGenerated, versionsDir, whereOf } from './lib/generate.js';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { addConnector, checkForm, dshProgram, namesInFile, profileOf, rowText, secretRefOf } from './lib/connectors.js';
import { SCRATCH_TITLE, copyDropped, copyThreadFiles, insideThread, isScratch, keepInProject, prepareFolder, threadFolderOf } from './lib/scratch.js';

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
  },
  "content": {
    "pages": [],
    "chips": [
      {
        "label": "Write a blog post",
        "icon": "research",
        "prompt": "Write a blog post about: "
      },
      {
        "label": "Draft an email",
        "icon": "spark",
        "prompt": "Draft an email to: "
      },
      {
        "label": "Make an outline",
        "icon": "chart",
        "prompt": "Make an outline for a talk or video about: "
      },
      {
        "label": "Tidy my notes",
        "icon": "spreadsheet",
        "prompt": "Turn my notes in this folder into a clear summary."
      }
    ]
  },
  "bench": {
    "pages": [],
    "chips": [
      {
        "label": "What is connected?",
        "icon": "spark",
        "prompt": "What devices are connected to this Mac right now?"
      },
      {
        "label": "Check an Android phone",
        "icon": "research",
        "prompt": "Read the details of my Android phone and tell me what you see."
      },
      {
        "label": "Look at a board",
        "icon": "chart",
        "prompt": "Identify the board on my USB port and tell me what it is."
      }
    ]
  },
  "creator-plus": {
    "pages": [],
    "chips": [
      {
        "label": "Build an add-on",
        "icon": "spark",
        "prompt": "Build a new add-on that: "
      },
      {
        "label": "Improve an add-on",
        "icon": "research",
        "prompt": "Improve this add-on and show me the change first: "
      },
      {
        "label": "What went wrong?",
        "icon": "chart",
        "prompt": "Look at my recent conversations and tell me what went wrong most often."
      }
    ]
  },
  "recon": {
    "pages": [],
    "greeting": "What should Recon look into?",
    "chips": [
      {
        "label": "Search .onion sites",
        "icon": "research",
        "prompt": "Search .onion sites for this and read the most relevant pages, with sources: "
      },
      {
        "label": "Search Usenet",
        "icon": "spreadsheet",
        "prompt": "Find text newsgroups about this, search their recent articles and read the most relevant ones: "
      },
      {
        "label": "News coverage",
        "icon": "chart",
        "prompt": "Find where this was reported in the news and read archived copies of the main articles: "
      },
      {
        "label": "Old web page",
        "icon": "website",
        "prompt": "List the Internet Archive's copies of this page and read the latest one: "
      },
      {
        "label": "Check a claim",
        "icon": "spark",
        "prompt": "Look for sources that confirm or contradict this claim, and say how far it can be trusted: "
      }
    ]
  }
};

/** Read-only routes the Skills and Connectors pages read. */
export const SKILLS_PATH = '/dsh-cowork-shell/skills';
export const PROJECTS_PATH = '/dsh-cowork-shell/projects';
export const CONNECTORS_PATH = '/dsh-cowork-shell/connectors';
/** "Write it for me": POST `{action: 'preview' | 'write', form}`; adds a connector to the person's own settings file (see lib/connectors.js). */
export const CONNECTOR_WRITE_PATH = '/dsh-cowork-shell/connectors/write';
export const TRASH_PATH = '/dsh-cowork-shell/trash';
export const SCRATCH_PATH = '/dsh-cowork-shell/scratch';
export const KEEP_PATH = '/dsh-cowork-shell/scratch/keep';
/** The most conversations one Empty trash request may name. */
export const EMPTY_MAX = 2000;
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
  /** Your own tab order (tab ids, set by arranging the tabs). Only the order: which tabs show is unchanged. */
  tabOrder: z.array(z.string()).default([]).volatile(),
  /** Hide the DeepSeek logo and name at the top of the sidebar and the logo on the start page. */
  hideLogos: z.boolean().default(false).volatile(),
  /**
   * Tab names in the wide sidebar. Off (default): every tab shows its icon and its name; tabs take the width of their
   * name and wrap onto more rows. On: tabs sit in rows of three and a name that does not fit shows the icon alone.
   */
  iconOnlyTabs: z.boolean().default(false).volatile(),
  /** Show today's date as the start page title instead of the tab's greeting. */
  dateTitle: z.boolean().default(false).volatile(),
  /** Let the conversation and the message box use the whole width of the window instead of a centred column. */
  wideChat: z.boolean().default(false).volatile(),
  /**
   * Start places (Scratch step 44) as JSON: `{ tabId: 'scratch' | 'folder' }`, over the defaults (every tab but
   * Code starts in Scratch; Recon always in its room). Set on Settings → Start places.
   */
  startPlaces: z.string().default('').volatile(),
  /** Cmd-N (the app's New Session) starts in the open tab's start place. Off: the app's own choice. */
  newKeyFollows: z.boolean().default(true).volatile(),
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

  /** The person's own settings file for connectors: where the running app keeps it, and its path as shown to the person. */
  const shorten = (path) => (path.startsWith(`${homedir()}/`) ? `~/${path.slice(homedir().length + 1)}` : path);
  function connectorPlace() {
    const home = dirname(ctx.get('dshHomePath')?.('x') ?? join(homedir(), '.dsh', 'x'));
    const place = profileOf({ home });
    return { ...place, shown: shorten(place.file), backupDir: join(home, 'backups', 'connectors'), exists: existsSync(place.file) };
  }
  /** The settings file's text for reading connector names ('' when it is missing or too big to bother with). */
  function connectorFileText() {
    try {
      const { file } = connectorPlace();
      return existsSync(file) && statSync(file).size < 2_000_000 ? readFileSync(file, 'utf8') : '';
    } catch {
      return '';
    }
  }

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
          // Connectors written to the settings file that the running app has not started yet (they start after a restart).
          const loaded = new Set(servers.flatMap((server) => [server.serverName.toLowerCase(), server.id.toLowerCase().replace(/^mcp-/, '')]));
          const waiting = namesInFile(connectorFileText()).filter((name) => !loaded.has(name.toLowerCase()));
          res.end(JSON.stringify({ at: Date.now(), servers, waiting }));
        } catch (error) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
        }
      },
    }), 'cowork-shell connectors route');

    // "Write it for me": the fields become one connector row in the person's own settings file, with a preview, a backup,
    // the app's own check on a throwaway copy of the app's home, and a plain "restart needed" answer. A key is kept in
    // the app's secret store, never in the file. POST only, behind the same login and Host/Origin fence as the page.
    let writing = false;
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: CONNECTOR_WRITE_PATH,
      handler: async (req, res) => {
        if (!guard(inner, req, res, ['POST'])) return;
        const say = (status, body) => { res.statusCode = status; res.end(JSON.stringify(body)); };
        try {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 65536) return say(413, { ok: false, text: 'That is too much text for a connector.' });
            chunks.push(chunk);
          }
          let body;
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
          } catch {
            return say(400, { ok: false, text: 'The request could not be read.' });
          }
          const place = connectorPlace();
          const loaderEntries = (() => { try { return [...((ctx.get('loader') ?? ctx.loader)?.entries?.() ?? [])]; } catch { return []; } })();
          const taken = [
            ...loaderEntries.filter((e) => e.options?.name === MCP_CLIENT).flatMap((e) => [String(plain(plain(e.options.config)?.serverName) ?? ''), String(e.options.id ?? '').replace(/^mcp-/, '')]),
            ...namesInFile(connectorFileText()),
          ].filter(Boolean);
          const checked = checkForm(body?.form, { taken });
          if (!checked.ok) return say(200, { ok: false, stage: 'form', problems: checked.problems });
          const value = checked.value;
          const credentials = () => ctx.get('credentials');
          const kept = async (ref) => { try { return (await credentials()?.describe?.(ref))?.configured === true; } catch { return false; } };
          if (body?.action === 'preview') {
            return say(200, {
              ok: true,
              text: rowText(value),
              file: place.shown,
              fileExists: place.exists,
              key: value.keyName ? { ref: secretRefOf(value.name), kept: await kept(secretRefOf(value.name)), typed: value.keyValue !== '' } : null,
              canCheck: Boolean(dshProgram()),
            });
          }
          if (body?.action !== 'write') return say(400, { ok: false, text: 'Unknown request.' });
          if (writing) return say(200, { ok: false, stage: 'busy', text: 'Another connector is being written. Wait a moment and try again.' });
          writing = true;
          try {
            const answer = await addConnector({
              value,
              file: place.file,
              backupDir: place.backupDir,
              dsh: dshProgram(),
              expect: typeof body.expect === 'string' ? body.expect : undefined,
              keepKey: async (ref, secret) => {
                const service = credentials();
                if (!service?.set) throw new Error('no secret store');
                await service.set(ref, secret);
              },
              hasKey: kept,
              forgetKey: async (ref) => { await credentials()?.unset?.(ref); },
            });
            if (!answer.ok) return say(200, { ok: false, stage: answer.stage, text: answer.text, checks: answer.checks, ...(answer.details ? { details: String(answer.details).slice(0, 800) } : {}) });
            return say(200, {
              ok: true,
              added: value.name,
              file: place.shown,
              backup: answer.backup ? shorten(answer.backup) : '',
              checks: answer.checks,
              restart: true,
              // The app gives an add-on no way to restart it (checked in 0.2.2-rc.2), so the page tells the person how.
              canRestart: false,
            });
          } finally {
            writing = false;
          }
        } catch (error) {
          say(500, { ok: false, text: 'Something went wrong before anything was written.', details: String(error?.message ?? error).slice(0, 300) });
        }
      },
    }), 'cowork-shell connector writer route');
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
          // Tuner Plus's marks (where each skill came from), while that add-on and its skills part are on;
          // without them the answer is exactly as before.
          const marks = await askMarks(() => ctx.get('tuning'));
          res.end(JSON.stringify(marks ? { at: Date.now(), folder: cwd, skills: withMarks(skills, marks), marks: marks.names } : { at: Date.now(), folder: cwd, skills }));
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
  /**
   * The Skill architect files a project rule you accepted (its step 81): appended to the project's instructions
   * as a new version marked as the architect's, so it can be put back. Only a folder the app lists as a project.
   */
  ctx.effect(() => ctx.provide('coworkProjects', Object.freeze({
    apiVersion: 1,
    appendRule(folder, text) {
      const key = canonical(folder);
      const known = key && registryList().some((item) => canonical(item.path) === key);
      if (!known) throw new Error('That folder is not one of your projects.');
      const rule = String(text ?? '').replace(/\r/g, '').trim();
      if (!rule) throw new Error('The rule is empty.');
      const before = projects.get(key)?.instructions ?? '';
      const next = before ? `${before.replace(/\s+$/, '')}\n\n${rule}` : rule;
      if (next.length > INSTRUCTIONS_MAX) throw new Error(`The project's instructions would pass ${INSTRUCTIONS_MAX} characters. Shorten them first on its page.`);
      projects.save(key, { instructions: next });
      if (versions.list(key).length === 0) versions.add(key, { text: before, by: 'you', at: Date.now() - 1 });
      versions.add(key, { text: next, by: 'architect', note: 'A rule you accepted from the Skill architect' });
      return { instructions: next };
    },
  })), 'cowork-shell projects service');

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
  /** What a Scratch conversation is told (its own folder is its working directory, so no path is needed). */
  const SCRATCH_NOTE = 'This is a Scratch conversation: it works in a private folder of its own (the working directory), never in a folder of the user\'s. Keep files you make there. Files the user drops into the chat are also copied there under their own names. Deleting the conversation deletes that folder.';
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
            // Scratch (step 39): no project note there; say where it works and where dropped files are.
            if (scratchFolderOf(agent)) return SCRATCH_NOTE;
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
   * A new conversation in a project whose type says so starts with Web set to Off (Paperwork:
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

  // Scratch (step 32, nothing visible yet): one hidden project, <home>/scratch, and a sub-folder per
  // thread named after the conversation (lib/scratch.js). A thread's working folder is moved into its
  // sub-folder before each of its turns, and the assistant cannot move it out again. Everything here
  // gives way when a part of the app is missing: a Scratch thread then works at the place itself.
  const scratchPlace = ctx.get('dshHomePath')?.('scratch') ?? '';
  /** Helper conversation id -> the Scratch thread that started it (through helpers in between). */
  const scratchRoots = new Map();
  const noteHelper = (agent) => {
    const header = agent?.session?.header ?? agent?.header;
    if (header?.origin !== 'subagent' || !header.parentSession || !header.id) return;
    scratchRoots.set(String(header.id), scratchRoots.get(header.parentSession) ?? String(header.parentSession));
  };
  /** The sub-folder a conversation is kept to ('' when it is not a Scratch conversation, or on any doubt). */
  const scratchFolderOf = (agent) => {
    try {
      return scratchPlace ? threadFolderOf(agent?.session?.header ?? agent?.header, scratchPlace, scratchRoots) : '';
    } catch {
      return '';
    }
  };
  /** Make the place (and a thread's sub-folder): the user's alone. '' when ready, else what is wrong. */
  const prepareScratch = (folder) => prepareFolder(scratchPlace) || (folder ? prepareFolder(folder) : '');
  ctx.on('agent/created', ({ agent }) => noteHelper(agent));
  ctx.on('agent/disposed', ({ agent }) => scratchRoots.delete(String(agent?.session?.header?.id ?? agent?.id ?? '')));
  try {
    for (const agent of ctx.get('agents')?.list?.() ?? []) noteHelper(agent);
  } catch {
    /* agents appear later */
  }
  /**
   * A copy of another thread (the app's Fork) still points into that thread's folder: its own folder starts
   * as a copy of those files, once, before anything else is put there. Done as soon as the copy exists, so
   * deleting the original first does not leave it empty, and again before its turns as a fallback.
   */
  const adoptFork = (agent, folder) => {
    if (!folder || !scratchPlace || existsSync(folder)) return;
    let now = '';
    try {
      now = ctx.get('workingDirectory')?.get?.(agent.session) ?? '';
    } catch {
      now = '';
    }
    if (!now || !isScratch(now, scratchPlace) || insideThread(now, now, folder)) return;
    const source = threadFolderOf({ cwd: now }, scratchPlace);
    if (!source || !existsSync(source)) return;
    const why = copyThreadFiles(source, folder);
    if (why) ctx.logger?.warn?.(`cowork-shell: a copy of a Scratch conversation starts with an empty folder: ${why}`);
  };
  ctx.on('agent/created', ({ agent }) => {
    try {
      const header = agent?.session?.header ?? agent?.header;
      if (header?.origin === 'subagent') return;
      const folder = scratchFolderOf(agent);
      if (folder) adoptFork(agent, folder);
    } catch (error) {
      ctx.logger?.warn?.(`cowork-shell: could not give a copy of a Scratch conversation its files: ${String(error?.message ?? error)}`);
    }
  });
  // Before a Scratch conversation's turn is put together, its working folder is its own sub-folder.
  // Only then, so a thread nobody wrote in leaves no folder behind.
  ctx.on('system-prompt/assemble', async (assembly, context, next) => {
    const agent = context?.agent;
    const folder = agent ? scratchFolderOf(agent) : '';
    if (folder) {
      try {
        const service = ctx.get('workingDirectory');
        const now = service?.get?.(agent.session) ?? '';
        adoptFork(agent, folder);
        // Its folder went missing (removed by hand, say): made again, empty, so the turn still runs there.
        if (!existsSync(folder)) {
          const problem = prepareScratch(folder);
          if (problem) throw new Error(`the folder ${problem}`);
        }
        if (service?.set && !insideThread(now, now, folder)) {
          const problem = prepareScratch(folder);
          if (problem) throw new Error(`the folder ${problem}`);
          await service.set(agent, folder, context.signal);
        }
      } catch (error) {
        ctx.logger?.warn?.(`cowork-shell: could not move a Scratch conversation into its own folder: ${String(error?.message ?? error)}`);
      }
    }
    return next();
  }, { prepend: true });
  // Dropped files (step 39): a file dropped into a Scratch conversation is copied into its own folder,
  // so Data and the PDF reader (which read only there) can open it. Done before the turn is put together.
  // The app keeps its own copy in its attachment store; deleting the conversation cannot remove that one.
  ctx.on('agent/inbox/claimed', ({ agent, message }) => {
    try {
      const blocks = Array.isArray(message?.content) ? message.content.filter((block) => block?.type === 'file' && block.attachment) : [];
      if (blocks.length === 0) return;
      const folder = scratchFolderOf(agent);
      if (!folder) return;
      adoptFork(agent, folder);
      const problem = prepareScratch(folder);
      if (problem) throw new Error(`the folder ${problem}`);
      const store = ctx.get('attachments');
      for (const block of blocks) {
        const hostPath = store?.fileHostPath?.(block.attachment);
        if (!hostPath) {
          ctx.logger?.warn?.('cowork-shell: a file dropped into a Scratch conversation could not be found in the app\'s store, so it was not copied');
          continue;
        }
        copyDropped(hostPath, folder, block.attachment.name);
      }
    } catch (error) {
      ctx.logger?.warn?.(`cowork-shell: a dropped file was not copied into its Scratch folder: ${String(error?.message ?? error)}`);
    }
  });
  // The assistant can move a conversation's working folder (the app's working_directory tool); a
  // Scratch conversation may move only within its own sub-folder. Checking the current folder (no
  // path) is always allowed, so the app can still restore a folder that went missing.
  ctx.on('working-directory/access', (request, next) => {
    if (request?.path === null || request?.path === undefined) return next();
    const folder = scratchFolderOf(request.agent);
    if (!folder) return next();
    let now = folder;
    try {
      now = ctx.get('workingDirectory')?.get?.(request.agent.session) ?? folder;
    } catch {
      /* relative paths are then read from the thread's own folder */
    }
    if (insideThread(request.path, now, folder)) return next();
    return Promise.reject(new Error(`This is a Scratch conversation: its working folder stays inside ${folder}. Work there instead.`));
  });
  // Other add-ons ask whether a folder or conversation is Scratch (by place, never by the store's name).
  ctx.effect(() => ctx.provide('coworkScratch', Object.freeze({
    apiVersion: 1,
    title: SCRATCH_TITLE,
    place: () => scratchPlace,
    isScratch: (path) => {
      try {
        return Boolean(scratchPlace) && isScratch(path, scratchPlace);
      } catch {
        return false;
      }
    },
    folderOf: (agent) => scratchFolderOf(agent),
  })), 'cowork-shell scratch service');
  // The page asks where the place is (GET: to keep it out of 'last used' and the project lists; this
  // makes no folder) and has it made before a thread starts there (POST).
  ctx.inject(['webServer', 'connection'], (inner) => {
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: SCRATCH_PATH,
      handler: (req, res) => {
        if (!guard(inner, req, res, ['GET', 'POST'])) return;
        if (!scratchPlace) {
          res.end(JSON.stringify({ place: '', title: SCRATCH_TITLE, error: 'No data folder is available.' }));
          return;
        }
        const problem = req.method === 'POST' ? prepareScratch('') : '';
        res.end(JSON.stringify(problem ? { place: '', title: SCRATCH_TITLE, error: `The Scratch folder ${problem}.` } : { place: scratchPlace, title: SCRATCH_TITLE }));
      },
    }), 'cowork-shell scratch route');
  });

  // Keep in a project (step 38): a Scratch thread's files are copied into a new sub-folder of a project
  // the user picked, named after the thread; nothing there is ever overwritten. The thread stays.
  ctx.inject(['webServer', 'connection', 'sessionPersistence'], (inner) => {
    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: KEEP_PATH,
      handler: async (req, res) => {
        if (!guard(inner, req, res, ['POST'])) return;
        try {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 16384) throw new Error('request too large');
            chunks.push(chunk);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          if (!scratchPlace) throw new Error('Scratch is not available.');
          const project = registryList().find((item) => String(item.id) === String(body?.workspaceId ?? ''));
          if (!project?.path || isScratch(project.path, scratchPlace)) throw new Error('That is not one of your projects.');
          const stored = await inner.sessionPersistence.list();
          const own = stored.find((snap) => snap.header?.id === body?.sessionId);
          const roots = new Map(stored.filter((snap) => snap.header?.origin === 'subagent').map((snap) => [snap.header.id, snap.header.parentSession]));
          const from = own ? threadFolderOf(own.header, scratchPlace, roots) : '';
          if (!from) throw new Error('This is not a Scratch conversation.');
          const kept = keepInProject(from, project.path, typeof body.title === 'string' ? body.title : '', body.sessionId);
          res.end(JSON.stringify({ ok: true, ...kept }));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
        }
      },
    }), 'cowork-shell keep route');
  });

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
          // The hidden Scratch project is not one of the user's projects to list.
          const list = registryList().filter((item) => !(scratchPlace && isScratch(item.path, scratchPlace))).map((item) => ({ workspaceId: String(item.id), path: item.path, title: item.title, tab: '', instructions: '', preset: '', ...(projects.get(item.path) ?? {}) }));
          res.end(JSON.stringify({ at: Date.now(), projects: list, presets: presets.list(), shared: sharedTools(), ...out }));
        } catch (error) {
          res.statusCode = req.method === 'POST' ? 400 : 500;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
        }
      },
    }), 'cowork-shell projects route');
  });

  // Folders automations open their conversations in (step 42): a Scratch thread's folder in this list
  // stays where it is when the thread is deleted.
  let automationFolders = [];
  ctx.inject(['schedule'], (inner) => {
    const read = () => void Promise.resolve().then(() => inner.schedule.catalog()).then((list) => {
      automationFolders = (Array.isArray(list) ? list : []).filter((task) => task?.status !== 'ended')
        .map((task) => String(task?.target?.create?.cwd ?? '').replace(/\/+$/, '')).filter(Boolean);
    }).catch(() => {});
    read();
    inner.on('schedule/changed', read);
  });

  // The shared trash (`coworkTrash`): other add-ons put their own things in this trash through it (old
  // runs of an automation as one row, an automation's recipe, later a Scratch thread). Offered at once,
  // ready only while the trash part below runs. Owners register; the trash never calls an add-on by a
  // name read from a record.
  const trashOwners = new Map();
  let trashHost = null;
  const NOT_AVAILABLE = 'The trash is not available now (the Cowork sidebar is off, still starting, or has no data folder). Nothing was moved.';
  /** A promise that gives up after `ms` (an owner's own work never holds the trash up for long). */
  const withTime = (promise, ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('it took too long')), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
  const registerTrashOwner = (spec) => {
    if (!safeOwner(spec?.owner)) throw new Error('Not a valid owner name.');
    if (typeof spec.label !== 'string' || !spec.label.trim()) throw new Error('Say what to call this add-on.');
    const token = Symbol(spec.owner);
    trashOwners.set(spec.owner, { spec, token });
    const live = () => trashOwners.get(spec.owner)?.token === token;
    return Object.freeze({
      add: async (request) => {
        if (!live()) throw new Error('This add-on is no longer registered with the trash.');
        if (!trashHost) throw new Error(NOT_AVAILABLE);
        return trashHost.add(spec, request);
      },
      items: (filter) => (live() && trashHost ? trashHost.items(spec.owner, filter) : []),
      dispose: () => { if (live()) trashOwners.delete(spec.owner); },
    });
  };
  /**
   * Told of conversations deleted for good (Delete permanently, Empty trash, the 30 days): add-ons remove
   * what they kept for them (Scratch steps 40 and 41). Never waited for; a failing listener changes nothing.
   */
  const erasedListeners = new Set();
  const tellErased = (ids) => {
    if (ids.length === 0) return;
    for (const listener of erasedListeners) {
      void withTime(Promise.resolve().then(() => listener([...ids])), 30000)
        .catch((error) => ctx.logger?.warn?.(`cowork-shell: an add-on could not clean up after a deleted conversation: ${String(error?.message ?? error)}`));
    }
  };
  ctx.effect(() => ctx.provide('coworkTrash', Object.freeze({
    apiVersion: 1,
    keepMs: KEEP_MS,
    ready: () => trashHost !== null,
    find: (id) => trashHost?.find(id),
    findMany: (ids) => trashHost?.findMany(ids) ?? {},
    register: registerTrashOwner,
    /** @param {(ids: string[]) => unknown} listener - told of conversations deleted for good. @returns {() => void} stop listening. */
    onErased: (listener) => {
      if (typeof listener !== 'function') throw new Error('Give a function.');
      erasedListeners.add(listener);
      return () => erasedListeners.delete(listener);
    },
  })), 'cowork-shell trash service');

  // Trash: the app cannot delete a conversation, so Delete moves an archived conversation's files
  // into <home>/trash/conversations for 30 days (see lib/trash.js). One the app still holds in
  // memory is only remembered; its files move at the next start.
  ctx.inject(['sessionPersistence', 'sessions', 'workspaceRegistry', 'webServer', 'connection'], (inner) => {
    const dir = ctx.get('dshHomePath')?.('trash', 'conversations');
    if (!dir) {
      ctx.logger?.warn?.('cowork-shell: no data folder is available; Delete is off');
      return;
    }
    // Recon's End and wipe list, when Recon runs: those conversations never go to the trash.
    const reconWipe = () => {
      try {
        return ctx.get('reconWipe');
      } catch {
        return undefined;
      }
    };
    const trash = openTrash(dir, { wiping: (id) => reconWipe()?.has?.(id) === true });
    const cacheOf = (id) => ctx.get('dshHomePath')('storages', 'session_projcache', 'sessions', `${id}.json`);
    const inMemory = (id) => {
      try {
        return inner.sessions.get(id) !== undefined;
      } catch {
        return true;
      }
    };

    /** The conversation and its helper conversations, each with its folder, from one reading of the store; undefined when one is in memory. */
    const partsFrom = (stored, id) => {
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

    /**
     * Scratch (step 34): a Scratch thread's own sub-folder goes to the trash with it. A folder another
     * stored conversation still works in (a Rerun copy started there, or one still waiting to move) stays
     * until the last of them is deleted. `[]` for anything else, and on any doubt.
     */
    const scratchFoldersFrom = (stored, id, parts) => {
      try {
        if (!scratchPlace) return [];
        const roots = new Map();
        const parentOf = new Map(stored.map((snap) => [snap.header?.id, snap.header?.origin === 'subagent' ? snap.header?.parentSession : undefined]));
        for (const sid of parentOf.keys()) {
          let at = sid;
          const seen = new Set();
          while (parentOf.get(at) !== undefined && !seen.has(at)) {
            seen.add(at);
            at = parentOf.get(at);
          }
          if (at !== sid) roots.set(sid, at);
        }
        const folderOf = (snap) => threadFolderOf(snap.header, scratchPlace, roots);
        const own = stored.find((snap) => snap.header?.id === id);
        const folder = own ? folderOf(own) : '';
        if (!folder) return [];
        const leaving = new Set(parts.map((part) => part.id));
        const shared = stored.some((snap) => !leaving.has(snap.header?.id) && folderOf(snap) === folder);
        // Step 42: an automation that opens its conversations in this thread's folder still needs it.
        const used = automationFolders.some((cwd) => cwd === folder || cwd.startsWith(`${folder}/`));
        if (used) ctx.logger?.info?.('cowork-shell: a Scratch thread\'s folder stays: an automation still opens its conversations there');
        return shared || used ? [] : [folder];
      } catch (error) {
        ctx.logger?.warn?.(`cowork-shell: a Scratch conversation's files stay where they are: ${String(error?.message ?? error)}`);
        return [];
      }
    };

    /**
     * `tab`: the sidebar tab it is deleted from, so only that tab's Trash list shows it; `fallbackTab`:
     * the tab its folder gives, used while that tab is not shown. `stillWaiting` (the tidy-up): checked
     * right before anything moves, so one put back or taken out of the archive meanwhile stays put.
     * A waiting run of a group row keeps its group (the trash copies it from the waiting entry).
     */
    const remove = async (id, title, deletedAt, tab, fallbackTab, stillWaiting) => {
      if (!inner.workspaceRegistry.archivedSessionIds.includes(id)) throw new Error('archive the conversation first');
      const stored = inMemory(id) ? undefined : await inner.sessionPersistence.list();
      const parts = stored === undefined ? undefined : partsFrom(stored, id);
      if (stillWaiting && !stillWaiting()) return 'cancelled';
      if (parts === undefined) {
        trash.addPending({ id, title, deletedAt, tab, fallbackTab });
        return 'pending';
      }
      trash.add({ id, title, parts, deletedAt, tab, fallbackTab, folders: scratchFoldersFrom(stored, id, parts) });
      return 'moved';
    };

    /**
     * Conversations erased for good leave the app's archived list (the app checks nothing there), but
     * only once the app no longer stores them: otherwise unarchiving would bring them back to the list.
     * One look at the store for all of them.
     */
    const forgetMany = async (ids) => {
      if (ids.length === 0) return;
      tellErased(ids);
      let stored;
      try {
        stored = new Set((await inner.sessionPersistence.list()).map((snap) => snap.header?.id));
      } catch (error) {
        ctx.logger?.warn?.(`cowork-shell: erased conversations stay in the archived list: ${String(error?.message ?? error)}`);
        return;
      }
      for (const id of ids) {
        if (stored.has(id)) {
          ctx.logger?.warn?.(`cowork-shell: "${id}" was erased from the trash but the app still stores it, so it stays archived`);
          continue;
        }
        try {
          await inner.workspaceRegistry.unarchiveSession?.(id);
        } catch (error) {
          ctx.logger?.warn?.(`cowork-shell: "${id}" was erased but stays in the archived list: ${String(error?.message ?? error)}`);
        }
      }
    };
    const forget = (id) => forgetMany([id]);

    /** The app's change token of a stored conversation's file (its identity, size and times), if any. */
    const stampOf = async (id) => {
      try {
        const snap = typeof inner.sessionPersistence.stat === 'function'
          ? await inner.sessionPersistence.stat(id)
          : (await inner.sessionPersistence.list()).find((item) => item.header?.id === id);
        return typeof snap?.revision === 'string' && snap.revision ? snap.revision : undefined;
      } catch {
        return undefined;
      }
    };

    // Every trash write runs here, one at a time: the route's actions, the tidy-up and other add-ons'
    // adds. The unarchive listener and the owners' own functions stay outside it (the app waits for its
    // listeners while a job here may wait for the app), so nothing can lock up.
    let chain = Promise.resolve();
    const queued = (job) => {
      const run = chain.then(job);
      chain = run.then(() => {}, () => {});
      return run;
    };

    /** Tell an owning add-on what happened to its things (never waited for; a slow or failing owner changes nothing here). */
    const notify = (owner, notice) => {
      const hook = trashOwners.get(owner)?.spec?.onNotice;
      if (typeof hook !== 'function') return;
      void withTime(Promise.resolve().then(() => hook(notice)), 10000)
        .catch((error) => ctx.logger?.warn?.(`cowork-shell: ${owner} could not take a trash notice: ${String(error?.message ?? error)}`));
    };
    /** One notice per row for grouped conversations and pieces: `found` from trash.locate or records. */
    const noticeRows = (type, why, gone) => {
      const rows = new Map();
      for (const item of gone) {
        if (!item?.group || !item.owner) continue;
        const row = rows.get(item.group) ?? rows.set(item.group, { owner: item.owner, conversations: [], data: [] }).get(item.group);
        if (item.item) row.data.push({ item: item.item, ...(item.ownerData !== undefined ? { ownerData: item.ownerData } : {}) });
        else row.conversations.push({ id: item.id, ...(item.ownerData !== undefined ? { ownerData: item.ownerData } : {}) });
      }
      for (const [row, { owner, conversations, data }] of rows) {
        notify(owner, { type, ...(why ? { why } : {}), row, key: row.slice(`group.${owner}.`.length), conversations, data });
      }
    };
    /** What the trash knows of a conversation's group (before it changes), for notices. */
    const groupOf = (ids) => {
      const found = trash.locate(ids);
      const out = new Map();
      for (const [id, where] of Object.entries(found)) if (where.owner) out.set(id, { id, group: where.row, owner: where.owner });
      return out;
    };

    /**
     * Empty trash: delete permanently every row the open tab's Trash list showed. One still waiting to
     * move is marked (with its file's change token) and erased when it moves. Unknown ids (put back
     * meanwhile) are skipped; one that cannot be erased is counted and left as it was. A group row counts
     * once: erased when all of it went, marked when some of it waits, failed when any of it failed.
     */
    const emptyNow = async (ids, rowIds, shown = {}) => {
      const out = { erased: 0, marked: 0, failed: 0 };
      const erased = [];
      for (const id of ids) {
        try {
          if (trash.isPiece(id)) throw new Error('Put back or delete the whole row.');
          const before = groupOf([id]);
          const stamp = trash.isWaiting(id) ? await stampOf(id) : undefined;
          const result = trash.erase(id, { stamp });
          if (result === 'erased') {
            out.erased += 1;
            erased.push(id);
            noticeRows('gone', 'emptied', [...before.values()]);
          } else if (result === 'marked') out.marked += 1;
        } catch (error) {
          out.failed += 1;
          ctx.logger?.warn?.(`cowork-shell: Empty trash could not erase "${id}": ${String(error?.message ?? error)}`);
        }
        // Many at once: let the app answer other requests in between.
        await new Promise((done) => setImmediate(done));
      }
      await forgetMany(erased);
      for (const group of rowIds) {
        // One row that cannot be emptied now (being put back, changed, or from a newer version) is
        // counted and the others still go.
        try {
          const done = await eraseRowNow(group, shown[group], 'emptied');
          if (done.failed > 0) out.failed += 1;
          else if (done.marked > 0) out.marked += 1;
          else if (done.erased > 0) out.erased += 1;
        } catch (error) {
          out.failed += 1;
          ctx.logger?.warn?.(`cowork-shell: Empty trash left the row "${group}": ${String(error?.message ?? error)}`);
        }
        await new Promise((resolve) => setImmediate(resolve));
      }
      return out;
    };

    // Group rows (several records, for example the old runs of one automation, and data pieces) are put
    // back or deleted as a whole. A row being changed answers so instead of being changed twice.
    const busyRows = new Set();
    const ROW_BUSY = 'It is being changed right now; try again in a moment.';

    /**
     * Delete a group row permanently (inside the queue): only what the list showed (`shown.ids` and
     * `shown.pieces`), never what came into the row since; that stays in the row.
     */
    const eraseRowNow = async (group, shown, why = 'erased') => {
      if (busyRows.has(group)) throw new Error(ROW_BUSY);
      const showIds = new Set(Array.isArray(shown?.ids) ? shown.ids : []);
      const showPieces = new Set(Array.isArray(shown?.pieces) ? shown.pieces : []);
      const parts = trash.groupParts(group);
      const records = parts.records.filter((src) => showIds.has(src.id));
      const waiting = parts.waiting.filter((src) => showIds.has(src.id));
      const pieces = parts.pieces.filter((piece) => showPieces.has(piece.item));
      if (records.length + waiting.length + pieces.length === 0) throw new Error('It is no longer in the trash.');
      if (pieces.some((piece) => piece.kind !== 'data')) throw new Error('This needs a newer version of the Cowork sidebar.');
      const out = { erased: 0, marked: 0, failed: 0, reasons: [] };
      const erasedIds = [];
      const gone = [];
      for (const src of records) {
        try {
          if (trash.erase(src.id) === 'erased') {
            out.erased += 1;
            erasedIds.push(src.id);
            gone.push({ id: src.id, group, owner: src.owner, ownerData: src.ownerData });
          }
        } catch (error) {
          out.failed += 1;
          out.reasons.push(String(error?.message ?? error).slice(0, 300));
          ctx.logger?.warn?.(`cowork-shell: could not erase "${src.id}": ${String(error?.message ?? error)}`);
        }
      }
      for (const src of waiting) {
        try {
          if (trash.erase(src.id, { stamp: await stampOf(src.id) }) === 'marked') out.marked += 1;
        } catch (error) {
          out.failed += 1;
          out.reasons.push(String(error?.message ?? error).slice(0, 300));
        }
      }
      for (const piece of pieces) {
        try {
          if (trash.removePiece(piece.item)) {
            out.erased += 1;
            gone.push({ item: piece.item, group, owner: piece.owner, ownerData: piece.ownerData });
          }
        } catch (error) {
          out.failed += 1;
          out.reasons.push(String(error?.message ?? error).slice(0, 300));
        }
      }
      await forgetMany(erasedIds);
      noticeRows('gone', why, gone);
      return out;
    };

    /**
     * Put a whole group row back: each conversation as today (all or nothing for each one, so one whose
     * place is taken stays and is named), then the owner puts back its data pieces. A row with data
     * cannot be put back while its owner is off: nothing is changed then.
     */
    const putBackRow = async (group) => {
      if (busyRows.has(group)) throw new Error(ROW_BUSY);
      busyRows.add(group);
      try {
        const first = await queued(async () => {
          const { records, waiting, pieces } = trash.groupParts(group);
          const any = records[0] ?? waiting[0] ?? pieces[0];
          if (!any) throw new Error('It is no longer in the trash.');
          if (pieces.some((piece) => piece.kind !== 'data')) throw new Error('This needs a newer version of the Cowork sidebar.');
          const owner = any.owner;
          const ownerLabel = any.ownerLabel || owner;
          if (pieces.length > 0 && typeof trashOwners.get(owner)?.spec?.putBack !== 'function') {
            throw new Error(`Put back needs ${ownerLabel}, which is off now. Switch it on, then try again. Nothing was changed.`);
          }
          const back = [];
          const left = [];
          for (const src of [...records, ...waiting]) {
            try {
              if (trash.restore(src.id)) back.push(src);
              else left.push({ id: src.id, reason: 'It is no longer in the trash.' });
            } catch (error) {
              left.push({ id: src.id, reason: String(error?.message ?? error) });
            }
          }
          // Back to the list only for those this add-on archived itself and that asked for it.
          for (const src of back) {
            if (src.back !== 'list' || src.archivedBy !== 'plus') continue;
            try {
              await inner.workspaceRegistry.unarchiveSession?.(src.id);
            } catch { /* it stays in the Archived list */ }
          }
          return { owner, ownerLabel, title: any.groupTitle || ownerLabel, back, left, pieces };
        });
        const backIds = first.back.map((src) => src.id);
        const data = { done: [], failed: [] };
        let notes = [];
        // A piece goes back only once its conversations of this row are back (one still in this row
        // holds it back; one that is now elsewhere in the trash does not).
        const left = trash.groupParts(group);
        const stillHere = new Set([...left.records, ...left.waiting].map((src) => src.id));
        const usable = first.pieces.filter((piece) => (piece.with ?? []).every((id) => !stillHere.has(id)));
        const heldBack = first.pieces.filter((piece) => !usable.includes(piece));
        if (usable.length > 0) {
          const hook = trashOwners.get(first.owner)?.spec?.putBack;
          try {
            if (typeof hook !== 'function') throw new Error('it is off now');
            const answer = await withTime(Promise.resolve().then(() => hook({
              row: group, key: group.slice(`group.${first.owner}.`.length), title: first.title,
              data: usable.map((piece) => ({ item: piece.item, ownerData: piece.ownerData, deletedAt: piece.deletedAt })),
              restored: { conversations: backIds },
            })), 60000);
            data.done = (Array.isArray(answer?.done) ? answer.done : []).filter((item) => usable.some((piece) => piece.item === item));
            data.failed = usable.filter((piece) => !data.done.includes(piece.item)).map((piece) => ({
              item: piece.item,
              reason: String((Array.isArray(answer?.failed) ? answer.failed : []).find((f) => f?.item === piece.item)?.reason ?? 'It was not put back.').slice(0, 300),
            }));
            notes = (Array.isArray(answer?.notes) ? answer.notes : []).filter((note) => typeof note === 'string').map((note) => note.slice(0, 300)).slice(0, 10);
          } catch (error) {
            data.failed = usable.map((piece) => ({ item: piece.item, reason: `${first.ownerLabel} did not finish putting it back: ${String(error?.message ?? error)}`.slice(0, 300) }));
          }
          await queued(async () => {
            for (const item of data.done) trash.removePiece(item);
            for (const failed of data.failed) trash.setPieceError(failed.item, failed.reason);
          });
        }
        for (const piece of heldBack) data.failed.push({ item: piece.item, reason: 'It goes back with its conversations: put those back first.' });
        notify(first.owner, {
          type: 'put-back', row: group, key: group.slice(`group.${first.owner}.`.length),
          conversations: first.back.map((src) => ({ id: src.id, ...(src.ownerData !== undefined ? { ownerData: src.ownerData } : {}) })),
          data: usable.filter((piece) => data.done.includes(piece.item)).map((piece) => ({ item: piece.item, ownerData: piece.ownerData })),
        });
        return { back: backIds, left: first.left, data, notes };
      } finally {
        busyRows.delete(group);
      }
    };

    /**
     * Another add-on puts its things in the trash (the coworkTrash service): conversations, each
     * archived by the trash only when that is safe (never a pinned one, one an automation delivers
     * into or names, one changed since the caller looked, or one still working), and data for its owner.
     * Everything refused is named with its reason; nothing is half done.
     */
    const serviceAdd = (spec, request) => queued(async () => {
      if (!request || typeof request !== 'object') throw new Error('Nothing to put in the trash.');
      if (request.folders !== undefined) throw new Error('Folders cannot go to the trash yet.');
      const group = groupLabel(spec.owner, request.key);
      if (!group) throw new Error('not a row key');
      if (!safeTab(request.tab)) throw new Error("Say which tab's Trash list shows it.");
      const conversations = Array.isArray(request.conversations) ? request.conversations : [];
      if (conversations.length > 500) throw new Error('Too many conversations at once (at most 500).');
      if (conversations.length === 0 && request.data === undefined) throw new Error('Nothing to put in the trash.');
      if (request.data !== undefined && jsonSize(request.data?.ownerData ?? null) > 65536) throw new Error('The kept data is too large (at most 64 KB).');
      if (conversations.some((c) => c?.ownerData !== undefined && jsonSize(c.ownerData) > 4096)) throw new Error('The kept data with a conversation is too large (at most 4 KB).');
      // Always now: the 30 days count from the moment it enters the trash (an owner's own dates go in ownerData).
      const deletedAt = Date.now();
      const base = {
        group, owner: spec.owner, ownerLabel: spec.label,
        ...(typeof request.title === 'string' ? { groupTitle: request.title } : {}),
        tab: request.tab, ...(safeTab(request.fallbackTab) ? { fallbackTab: request.fallbackTab } : {}),
      };
      const options = request.options && typeof request.options === 'object' ? request.options : {};
      const out = { row: group, moved: [], waiting: [], skipped: [], failed: [] };
      const skip = (id, code, reason) => out.skipped.push({ id, code, reason });
      const stored = await inner.sessionPersistence.list();
      const byId = new Map(stored.map((snap) => [snap.header?.id, snap]));
      const inTrash = trash.locate(conversations.map((c) => c?.id));
      let catalog;
      const tasks = async () => {
        if (catalog !== undefined) return catalog;
        try {
          const schedule = ctx.get('schedule');
          catalog = typeof schedule?.catalog === 'function' ? await schedule.catalog() : null;
        } catch {
          catalog = null;
        }
        return catalog;
      };
      const seen = new Set();
      for (const c of conversations) {
        const id = c?.id;
        if (!safeId(id) || id.startsWith('group.') || id.startsWith('piece-')) {
          skip(String(id ?? ''), 'bad-id', 'Not a conversation id.');
          continue;
        }
        if (seen.has(id)) continue;
        seen.add(id);
        if (inTrash[id]) { skip(id, 'in-trash', 'This conversation is already in the trash.'); continue; }
        if (reconWipe()?.has?.(id) === true) { skip(id, 'wiping', 'This Recon conversation was ended with End and wipe: it is being deleted for good, not moved to the trash.'); continue; }
        const snap = byId.get(id);
        if (!snap) { skip(id, 'unknown', 'The app does not have this conversation.'); continue; }
        if (snap.header?.origin === 'subagent') { skip(id, 'helper', 'A helper conversation goes with its main conversation.'); continue; }
        if (snap.location?.kind !== 'jsonl') { skip(id, 'not-files', 'This conversation is not stored as files.'); continue; }
        const archived = () => inner.workspaceRegistry.archivedSessionIds.includes(id);
        let archivedBy;
        if (c.archive === 'already') {
          if (!archived()) { skip(id, 'not-archived', 'Archive the conversation first.'); continue; }
          archivedBy = 'user';
        } else if (c.archive === 'plus') {
          if ((inner.workspaceRegistry.pinnedSessionIds ?? []).includes(id) && options.allowPinned !== true) { skip(id, 'pinned', 'It is pinned, so it was left alone.'); continue; }
          if (typeof c.expectRevision === 'string' && (await stampOf(id)) !== c.expectRevision) { skip(id, 'changed', 'It changed since, so it was left alone.'); continue; }
          const list = await tasks();
          if (!Array.isArray(list)) { skip(id, 'cannot-check', 'The automations could not be checked, so it was left alone.'); continue; }
          if (list.some((task) => task?.target?.sessionId === id || (Array.isArray(task?.involvedSessionIds) && task.involvedSessionIds.includes(id)))) {
            skip(id, 'automation-target', 'An automation delivers into it or names it, so it was left alone.');
            continue;
          }
          // Looked at again right before archiving: the checks above waited, and a pin or the user's own
          // archive may have come meanwhile.
          if ((inner.workspaceRegistry.pinnedSessionIds ?? []).includes(id) && options.allowPinned !== true) { skip(id, 'pinned', 'It is pinned, so it was left alone.'); continue; }
          if (archived()) archivedBy = 'user';
          else {
            try {
              // Never with stopActivity: a conversation that is still working is left alone.
              await inner.workspaceRegistry.archiveSession(id);
              archivedBy = 'plus';
            } catch (error) {
              if (error?.name === 'WorkspaceActiveSessionError' || Array.isArray(error?.activity)) {
                const kinds = (Array.isArray(error?.activity) ? error.activity : []).map((entry) => entry?.kind).filter(Boolean).join(', ');
                skip(id, 'busy', `It is still working${kinds ? ` (${kinds})` : ''}. Try again later.`);
              } else if (error?.name === 'WorkspaceUnknownSessionError') skip(id, 'unknown', 'The app does not have this conversation.');
              else out.failed.push({ id, code: 'failed', reason: String(error?.message ?? error).slice(0, 200) });
              continue;
            }
          }
        } else {
          skip(id, 'bad-request', "Say whether it is archived already ('already') or the trash should archive it ('plus').");
          continue;
        }
        const fields = {
          ...base, archivedBy, title: typeof c.title === 'string' ? c.title : '', deletedAt,
          ...(c.ownerData !== undefined ? { ownerData: c.ownerData } : {}),
          ...(options.back === 'list' ? { back: 'list' } : {}),
        };
        try {
          const parts = inMemory(id) ? undefined : partsFrom(stored, id);
          if (parts === undefined) {
            trash.addPending({ id, ...fields });
            out.waiting.push(id);
          } else {
            trash.add({ id, parts, ...fields, folders: scratchFoldersFrom(stored, id, parts) });
            out.moved.push(id);
          }
        } catch (error) {
          const failed = { id, code: 'move-failed', reason: String(error?.message ?? error).slice(0, 200) };
          if (trash.locate([id])[id]) {
            // Part of it reached the trash (its record is written first): it must stay archived.
            failed.inTrash = true;
            failed.reason += ' Part of it reached the trash, so it stays archived: put it back from the Trash, or delete it there.';
          } else if (archivedBy === 'plus') {
            try {
              await inner.workspaceRegistry.unarchiveSession(id);
            } catch {
              failed.stillArchived = true;
              failed.reason += ' It stays archived; restore it from the Archived list.';
            }
          }
          out.failed.push(failed);
        }
      }
      // The data never depends on the conversations: its owner has already let go of it.
      if (request.data !== undefined) {
        out.data = trash.addPiece({ ...base, title: request.title, deletedAt, with: [...out.moved, ...out.waiting], ownerData: request.data?.ownerData ?? null });
      }
      return out;
    });

    /** One owner's rows, with each run and piece, optionally for one key only. */
    const serviceItems = (owner, filter) => {
      const only = filter && filter.key !== undefined ? groupLabel(owner, filter.key) : '';
      if (filter && filter.key !== undefined && !only) return [];
      return trash.list().filter((row) => row.kind === 'group' && row.owner === owner && (!only || row.id === only)).map((row) => {
        const { records, waiting, pieces } = trash.groupParts(row.id);
        const member = (src, state) => ({ id: src.id, title: src.title ?? '', deletedAt: Number(src.deletedAt) || 0, state, erasing: src.erase === true, ...(src.archivedBy ? { archivedBy: src.archivedBy } : {}), ...(src.ownerData !== undefined ? { ownerData: src.ownerData } : {}) });
        return {
          row: row.id, key: row.id.slice(`group.${owner}.`.length), title: row.title, tab: row.tab, ...(row.fallbackTab ? { fallbackTab: row.fallbackTab } : {}),
          members: [...records.map((src) => member(src, 'moved')), ...waiting.map((src) => member(src, 'waiting'))],
          data: pieces.map((piece) => ({ item: piece.item, deletedAt: Number(piece.deletedAt) || 0, ownerData: piece.ownerData, ...(piece.lastError ? { lastError: piece.lastError } : {}) })),
        };
      });
    };
    const host = {
      add: serviceAdd,
      items: serviceItems,
      find: (id) => trash.locate([id])[id],
      findMany: (ids) => trash.locate((Array.isArray(ids) ? ids : []).slice(0, 2000)),
    };
    inner.effect(() => {
      trashHost = host;
      return () => { if (trashHost === host) trashHost = null; };
    }, 'cowork-shell trash service ready');

    // At start: move what was waiting, then drop what is older than 30 days. Repeated a few times a day.
    // Never rejects: the app stops on an unhandled rejection.
    const tidy = () => queued(async () => {
      try {
        // Groups of what the tidy-up may change, read before it changes them (for the owners' notices).
        const before = groupOf([...trash.pending().map((item) => item.id), ...trash.markedMoved()]);
        const done = await tidyPending(trash, {
          isArchived: (id) => inner.workspaceRegistry.archivedSessionIds.includes(id),
          inMemory,
          isStored: async (id) => (await inner.sessionPersistence.list()).some((snap) => snap.header?.id === id),
          move: (item) => remove(item.id, item.title, item.deletedAt, item.tab, item.fallbackTab, () => trash.isWaiting(item.id)),
          stampOf,
        });
        await forgetMany(done.erased);
        noticeRows('gone', 'marked-erased', done.erased.map((id) => before.get(id)).filter(Boolean));
        noticeRows('left', 'unarchived', done.restored.map((id) => before.get(id)).filter(Boolean));
        noticeRows('left', 'files-gone', done.dropped.map((id) => before.get(id)).filter(Boolean));
        for (const id of done.kept) ctx.logger?.info?.(`cowork-shell: "${id}" changed after Delete permanently (it was taken back at some point), so it went to the trash with Put back instead`);
        for (const id of done.unmarked) ctx.logger?.warn?.(`cowork-shell: "${id}" could not be deleted permanently; it is back in the Trash list with Put back`);
        for (const id of done.dropped) ctx.logger?.info?.(`cowork-shell: "${id}" left the trash list: its files are gone, so there is nothing to put back`);
        for (const { id, error } of done.failed) ctx.logger?.warn?.(`cowork-shell: could not move "${id}" to the trash: ${error}`);
        const expired = [];
        trash.purge(Date.now(), (gone) => expired.push(gone));
        await forgetMany(expired.filter((gone) => gone.id).map((gone) => gone.id));
        noticeRows('gone', 'expired', expired);
        trash.sweepTemp();
      } catch (error) {
        ctx.logger?.warn?.(`cowork-shell: the trash tidy-up stopped: ${String(error?.message ?? error)}`);
      }
    });
    void tidy();
    // Taken out of the archive (here or in the app's own list) while it waited to move: it is not deleted
    // after all, and a "delete permanently" mark goes with it, at once rather than at the next tidy-up.
    // Never throws and never waits for the queue: the app waits for this before it unarchives.
    inner.on('workspace/session-unarchiving', (request) => {
      try {
        const id = request?.sessionId;
        if (!safeId(id) || !trash.isWaiting(id)) return;
        const before = groupOf([id]);
        if (trash.dropPending(id)) {
          ctx.logger?.info?.(`cowork-shell: "${id}" was taken out of the archive, so it is no longer deleted`);
          noticeRows('left', 'unarchived', [...before.values()]);
        }
      } catch (error) {
        ctx.logger?.warn?.(`cowork-shell: could not update the trash after an unarchive: ${String(error?.message ?? error)}`);
      }
    });
    inner.effect(() => {
      const timer = setInterval(() => void tidy(), 6 * 60 * 60 * 1000);
      timer.unref?.();
      return () => clearInterval(timer);
    }, 'cowork-shell trash tidy');

    /** A group row's id (its label), as the route accepts it. */
    const rowId = (value) => typeof value === 'string' && value.startsWith('group.') && safeId(value);

    inner.effect(() => inner.webServer.register({
      kind: 'exact',
      path: TRASH_PATH,
      handler: async (req, res) => {
        if (!guard(inner, req, res, ['GET', 'POST'])) return;
        const extra = {};
        try {
          if (req.method === 'POST') {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              // Empty trash sends the ids of a whole list (up to EMPTY_MAX of about 50 characters each).
              if (size > 262144) throw new Error('request too large');
              chunks.push(chunk);
            }
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (body?.action === 'restore' && body.itemId !== undefined) {
              // Put back a whole group row (it runs partly outside the queue: its owner's own work).
              if (!rowId(body.itemId)) throw new Error('not a row of the trash');
              const restored = await putBackRow(body.itemId);
              if (restored.back.length === 0 && restored.data.done.length === 0) {
                throw new Error(restored.left[0]?.reason ?? restored.data.failed[0]?.reason ?? 'Nothing could be put back.');
              }
              extra.restored = restored;
            } else {
              await queued(async () => {
                if (body?.action === 'empty') {
                  // Empty trash: the conversations and rows the open tab's Trash list showed.
                  const ids = Array.isArray(body.sessionIds) ? body.sessionIds : [];
                  const rows = Array.isArray(body.itemIds) ? body.itemIds : [];
                  if (!Array.isArray(body.sessionIds) && !Array.isArray(body.itemIds)) throw new Error('not a list of conversation ids');
                  if (ids.length + rows.length === 0 || ids.length + rows.length > EMPTY_MAX || !ids.every(safeId) || !rows.every(rowId)) throw new Error('not a list of conversation ids');
                  const shown = body.shown && typeof body.shown === 'object' ? body.shown : {};
                  extra.emptied = await emptyNow([...new Set(ids)], [...new Set(rows)], shown);
                } else if (body?.action === 'erase' && body.itemId !== undefined) {
                  if (!rowId(body.itemId)) throw new Error('not a row of the trash');
                  // What the list showed: only that is erased.
                  const erased = await eraseRowNow(body.itemId, { ids: body.ids, pieces: body.pieces });
                  if (erased.erased + erased.marked === 0) throw new Error(erased.failed > 0 ? 'It could not be deleted permanently.' : 'It is no longer in the trash.');
                  extra.erased = erased;
                } else {
                  const id = body?.sessionId;
                  if (!safeId(id)) throw new Error('not a conversation id');
                  if (trash.isPiece(id)) throw new Error('Put back or delete the whole row.');
                  if (body.action === 'delete') await remove(id, body.title, undefined, safeTab(body.tab) ? body.tab : undefined, safeTab(body.fallbackTab) ? body.fallbackTab : undefined);
                  else if (body.action === 'restore') {
                    // One run of a group row can be put back on its own too; its owner is told.
                    const before = groupOf([id]);
                    // Nothing to put back (erased meanwhile, for example by Empty trash): say so, not "done".
                    if (!trash.restore(id)) throw new Error('It is no longer in the trash.');
                    noticeRows('put-back', '', [...before.values()]);
                  } else if (body.action === 'erase') {
                    // Delete permanently: once its files are gone the app's archived list may forget it too.
                    // One still waiting keeps its file's change token: erased only if unchanged when it moves.
                    const before = groupOf([id]);
                    const stamp = trash.isWaiting(id) ? await stampOf(id) : undefined;
                    if (trash.erase(id, { stamp }) === 'erased') {
                      await forget(id);
                      noticeRows('gone', 'erased', [...before.values()]);
                    }
                  } else throw new Error('unknown action');
                }
              });
            }
          }
          let wiping = [];
          try {
            wiping = (reconWipe()?.list?.() ?? []).filter(safeId);
          } catch {
            wiping = [];
          }
          const registered = (owner) => typeof trashOwners.get(owner)?.spec?.putBack === 'function';
          res.end(JSON.stringify({ at: Date.now(), keepMs: KEEP_MS, items: trash.list({ registered }), wiping, ...extra }));
        } catch (error) {
          res.statusCode = req.method === 'POST' ? 400 : 500;
          res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
        }
      },
    }), 'cowork-shell trash route');
  });
}
