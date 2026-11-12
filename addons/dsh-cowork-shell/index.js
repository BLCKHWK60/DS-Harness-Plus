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
  }
};

/** Read-only routes the Skills and Connectors pages read. */
export const SKILLS_PATH = '/dsh-cowork-shell/skills';
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
