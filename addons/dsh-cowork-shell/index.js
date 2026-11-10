/**
 * Host half of the Cowork sidebar. The sidebar itself is the browser half (client.js); this row
 * exists so the browser half loads only while the row is on, and it carries the tab layout as
 * settings (volatile, so a later Settings page can edit it).
 *
 * The bundle patch switches the app's own sidebar (`ui-sidebar`) off, and this row turns itself on only
 * while that sidebar is off: both at once would stop the app from loading.
 */
import z from '@deepseek-ai/schemastery';

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
    "chips": []
  }
};

/** Read-only routes the Skills and Connectors pages read. */
export const SKILLS_PATH = '/dsh-cowork-shell/skills';
export const CONNECTORS_PATH = '/dsh-cowork-shell/connectors';
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
      const url = new URL(config.url.replace(/\$\{[^}]*\}/g, 'x'));
      return url.origin + url.pathname;
    } catch {
      return '';
    }
  }
  if (typeof config.command === 'string') {
    const args = Array.isArray(config.args)
      ? config.args.filter((a) => typeof a === 'string' && !a.includes('${') && !/token|key|secret|password/i.test(a)).slice(0, 3)
      : [];
    return [config.command, ...args].join(' ').slice(0, 160);
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
  maxTabs: z.natural().min(1).max(5).default(3),
});

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  // Tells the Modes add-on that the sidebar tabs choose the mode of conversations that have not
  // sent a message yet (and that its chat-box selector should stay hidden).
  ctx.effect(() => ctx.provide('coworkShell', Object.freeze({ apiVersion: 1, tabsDecideMode: true })), 'cowork-shell service');

  /** Common guard for the read-only routes: login and Host/Origin fence, GET only, no caching. */
  const guard = (inner, req, res) => {
    const refused = inner.connection.requestRejection(req);
    if (refused !== undefined) {
      res.statusCode = refused;
      res.end();
      return false;
    }
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('allow', 'GET');
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
}
