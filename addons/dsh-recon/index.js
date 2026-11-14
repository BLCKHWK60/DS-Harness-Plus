/**
 * Recon: an isolated mode and tab for research on .onion sites and Usenet text newsgroups.
 *
 * Steps 1 to 3 of 7: the isolation frame, the connection layer, and searching and reading
 * .onion sites behind the filters, with citations and a research log; and step 4, Usenet text
 * newsgroups (lib/usenet.js; the login is in the macOS Keychain, lib/keychain.js); and step 6: the
 * export (lib/export.js), the throwaway folder all Recon conversations run in (ROOM), and End and
 * wipe (lib/wipe.js).
 * The isolation:
 *   - the mode is marked isolated, so the Modes add-on gives its conversations exactly the six
 *     recon tools, no programs, no helpers, no web search, and never lets them change mode;
 *   - every other add-on leaves an isolated conversation alone;
 *   - research content goes to a model on this computer or in the user's own network without a
 *     question, and to any other model only after the user typed /recon cloud in that conversation.
 *
 * Off until switched on in Settings > Recon. Needs the Modes add-on and the Cowork sidebar.
 * The connection layer: lib/tor.js (Recon's own Tor, state in a throwaway folder), lib/sandbox.js
 * and lib/fetch-child.mjs (one locked process per page: one local port, no files, text only),
 * lib/address.js (only .onion addresses the conversation was shown).
 * Route: `GET/POST /dsh-recon/state`.
 */
import z from '@deepseek-ai/schemastery';
import { chmodSync, existsSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { onionAddressesIn, openTrail } from './lib/address.js';
import { MODE_ID, TOOLS, withRecon } from './lib/mode.js';
import { mayReceive, openConsent, providerPlace, staysHome } from './lib/model.js';
import { exportText, writeExport } from './lib/export.js';
import { openForward } from './lib/forward.js';
import { login, loginName, REMOVE_COMMAND, STORE_COMMAND } from './lib/keychain.js';
import { AHMIA, createOnion } from './lib/onion.js';
import { runLocked } from './lib/sandbox.js';
import { openBlocklist } from './lib/screen.js';
import { openSources } from './lib/sources.js';
import { buildTools } from './lib/tools.js';
import { createUsenet } from './lib/usenet.js';
import { openWipeList, wipeFiles } from './lib/wipe.js';
import { createTor, findTor, torVersion } from './lib/tor.js';

export const name = 'dsh-recon';

/** `GET` gives the page its data; `POST {action: 'tor-test'}` starts Tor once to see that it connects, then stops it. */
export const STATE_PATH = '/dsh-recon/state';
const MODES_NS = 'modes';
/**
 * The folder every Recon conversation runs in. The app tells a model the path of its conversation's
 * folder, so this one is outside the user's home and says nothing about them. It is kept empty.
 */
export const ROOM = '/private/tmp/dsh-recon-room';

export const Config = z.object({
  /** The Recon mode and tab. Off leaves nothing of it in the app. */
  enabled: z.boolean().default(false).volatile(),
  /** Where the tor program is. Empty looks in the usual places (Homebrew, /usr/local). Plus does not install it. */
  torPath: z.string().default('').volatile(),
  /**
   * Search with another .onion search engine than the built-in filtered index. Off uses the
   * built-in one. The blocklist of banned sites and the word screen apply either way.
   */
  otherEngine: z.boolean().default(false).volatile(),
  /** That other engine's .onion name (the 56 characters and ".onion"). Used only while `otherEngine` is on. */
  engineHost: z.string().default('').volatile(),
  /**
   * How Usenet is reached. `off`: not at all. `direct`: an encrypted connection straight to the
   * news server, which sees your address and knows your account.
   */
  usenetRoute: z.union([z.const('off'), z.const('direct')]).default('off').volatile(),
  /** The news server's name, as your Usenet provider gives it. The login is not kept here: it is in the macOS Keychain. */
  usenetHost: z.string().default('').volatile(),
  /** Where `/recon export` writes its files. Empty uses the folder `recon/exports` in the app's home. */
  exportFolder: z.string().default('').volatile(),
  /** The news server's port for encrypted connections. */
  usenetPort: z.natural().default(563).volatile(),
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
  const warn = (text) => ctx.logger?.warn?.(`recon: ${text}`);
  const consent = openConsent();
  const torBin = () => findTor(String(plain(config?.torPath) ?? ''));
  const tor = createTor({ bin: torBin });
  ctx.effect(() => () => void tor.stop(), 'recon: tor');
  const home = ctx.get('dshHomePath');
  // The only thing Recon keeps on disk: the blocklist of banned sites, as fingerprints.
  const blocklist = openBlocklist(typeof home === 'function' ? join(home('recon'), 'blocklist.json') : '');
  const trail = openTrail();
  const sources = openSources();
  const onion = createOnion({ tor, run: runLocked, blocklist, trail, sources, engine: () => ({ host: String(plain(config?.engineHost) ?? ''), other: plain(config?.otherEngine) === true }) });
  const usenetRoute = () => (String(plain(config?.usenetRoute) ?? 'off') === 'direct' ? 'direct' : 'off');
  const usenetServer = () => ({ host: String(plain(config?.usenetHost) ?? '').trim().toLowerCase(), port: Number(plain(config?.usenetPort)) || 563 });
  const usenet = createUsenet({ run: runLocked, route: usenetRoute, server: usenetServer, login, forward: openForward, sources });
  /** Whether a login is in the Keychain, looked up now and then for the page. Only the fact, never the login. */
  let hasLogin = false;
  const lookForLogin = () => void loginName().then((name) => { hasLogin = Boolean(name); }, () => { hasLogin = false; });
  let torSeen = { path: '', version: '' };
  /** The last test of the connection, for the page. */
  let torTest = { state: 'none', text: '' };
  const runTorTest = async () => {
    if (torTest.state === 'running') return;
    torTest = { state: 'running', text: 'Starting Tor…' };
    const wasReady = tor.status().state === 'ready';
    try {
      await tor.start();
      torTest = { state: 'ok', text: wasReady ? `Tor is connected (checked at ${new Date().toLocaleTimeString()}). A Recon conversation is using it, so it was left running.` : `Tor connected to its network at ${new Date().toLocaleTimeString()}. No site was opened. Tor was stopped again and its temporary folder deleted.` };
    } catch (error) {
      torTest = { state: 'failed', text: String(error?.message ?? error).slice(0, 300) };
    } finally {
      // A test must not cut off a conversation that is using Tor: it stops Tor only if it started it.
      if (!wasReady) await tor.stop();
    }
  };

  /** Make sure the room is there, belongs to the user alone, and is empty. */
  const prepareRoom = () => {
    try {
      mkdirSync(ROOM, { recursive: true, mode: 0o700 });
      chmodSync(ROOM, 0o700);
      for (const name of readdirSync(ROOM)) rmSync(join(ROOM, name), { recursive: true, force: true });
    } catch (error) {
      warn(`could not prepare the Recon folder: ${String(error?.message ?? error)}`);
    }
  };
  prepareRoom();
  const sameFolder = (path) => {
    if (!path) return false;
    try {
      return realpathSync(String(path)) === realpathSync(ROOM);
    } catch {
      return false;
    }
  };
  /** Whether a conversation runs in the room. */
  const inRoom = (agent) => sameFolder((agent?.header ?? agent?.session?.header)?.cwd);

  const settingsOf = (ns) => {
    try {
      return ctx.get('settings')?.describe?.().find((entry) => entry.ns === ns)?.value;
    } catch {
      return undefined;
    }
  };
  const modes = () => {
    try {
      return ctx.get('modes');
    } catch {
      return undefined;
    }
  };
  /** Whether an agent is an isolated Recon conversation. A missing Modes add-on means no. */
  const inRecon = (agent) => {
    const service = modes();
    return Boolean(agent?.id) && service?.get?.(agent.id) === MODE_ID && service?.isolated?.(agent.id) === true;
  };
  /** The conversation's model, and where it runs. */
  const modelOf = (agent) => {
    let route;
    try {
      const now = agent?.model?.current?.();
      if (now && typeof now.provider === 'string' && typeof now.model === 'string' && now.provider && now.model) route = { provider: now.provider, model: now.model };
    } catch {
      route = undefined;
    }
    return { route, place: providerPlace(settingsOf('llm-pi-ai')?.providers, route?.provider) };
  };
  const gate = (agent) => {
    const { route, place } = modelOf(agent);
    return mayReceive({ place, route, id: agent?.id, consent });
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
        problem = 'The Modes add-on is not running, so there is no Recon tab.';
        return;
      }
      if (row.value?.extraModes === undefined || row.value?.sessionIsolated === undefined) {
        problem = 'The Modes add-on is an older version that cannot isolate a mode. Update Plus.';
        return;
      }
      const on = enabled();
      const ops = [];
      const next = withRecon(row.value.extraModes, on);
      if (next !== undefined) ops.push({ op: 'set', path: ['extraModes'], value: next });
      if (!on && row.value.defaultMode === MODE_ID) ops.push({ op: 'set', path: ['defaultMode'], value: 'cowork' });
      if (ops.length > 0) await service.mutate(MODES_NS, ops);
      problem = '';
    } catch (error) {
      problem = `The Recon tab could not be ${enabled() ? 'added' : 'removed'}: ${String(error?.message ?? error).slice(0, 160)}`;
      warn(problem);
    } finally {
      syncing = false;
    }
  };

  // ---- the tools: there only while Recon is on ------------------------------------------------

  let toolsOff;
  const syncTools = () => {
    const on = enabled();
    if (on && !toolsOff) {
      const tools = ctx.get('tools');
      if (!tools?.register) return;
      toolsOff = buildTools({ enabled, inRecon: (exec) => inRecon(exec?.agent), inRoom: (exec) => inRoom(exec?.agent), gate: (exec) => gate(exec?.agent), onion, usenet, sources, idOf: (exec) => String(exec?.agent?.id ?? '') }).map((tool) => tools.register(tool));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
      void tor.stop();
    }
  };
  const follow = () => {
    void syncMode();
    try {
      if (!existsSync(ROOM)) prepareRoom();
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
  }, 'recon: follow the switch');
  ctx.on('agent/disposed', ({ agent }) => consent.forget(agent?.id));
  // What the assistant writes in a Recon conversation is kept for the export.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'assistant/message' || !session?.id || !inRecon({ id: session.id })) return;
      const content = event.data?.message?.content;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((block) => (block?.type === 'text' ? block.text : '')).join('\n') : '';
      if (text.trim()) sources.say(session.id, text);
    } catch (error) {
      warn(`could not keep an answer for the export: ${String(error?.message ?? error)}`);
    }
  });
  // An address the user writes is one the conversation may open.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'user/message' || !session?.id || event.data?.source?.kind !== 'user') return;
      const content = event.data?.content;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((block) => (block?.type === 'text' ? block.text : '')).join('\n') : '';
      const found = onionAddressesIn(text);
      if (found.length > 0) trail.add(session.id, found);
    } catch (error) {
      warn(`could not note the addresses in a message: ${String(error?.message ?? error)}`);
    }
  });

  // ---- the user's words -------------------------------------------------------------------------

  const status = (agent) => {
    if (!enabled()) return 'Recon is switched off in Settings → Recon.';
    if (!inRecon(agent)) return 'This is not a Recon conversation. Start one from the Recon tab. A conversation of another tab cannot become one.';
    const { route, place } = modelOf(agent);
    const model = route ? `${route.model} (${place.name || route.provider})` : 'no model picked';
    const where = !route ? '' : staysHome(place) ? (place.where === 'local' ? 'on this computer' : `in your own network (${place.host})`) : place.where === 'cloud' ? `in the cloud${place.host ? ` (${place.host})` : ''}` : 'at a place Recon cannot tell, treated as cloud';
    const allowed = gate(agent);
    return [
      'Recon conversation: isolated.',
      inRoom(agent) ? 'Folder: Recon\'s own empty folder. The model is told no path of yours.' : 'Folder: a folder of yours, so the tools are OFF in this conversation. Start a new one with the New button in the Recon tab.',
      `Tools: only ${TOOLS.join(', ')}. No programs, files, memory, helpers or other modes.`,
      `Model: ${model}${where ? `, ${where}` : ''}.`,
      allowed.ok ? (staysHome(place) ? 'What Recon finds stays on your own machines.' : 'You agreed that what Recon finds goes to this cloud model, for this conversation.') : 'What Recon finds is NOT sent to this model. Type /recon cloud to agree for this conversation, or pick a local model.',
      `Network: .onion sites through Recon's own Tor (${tor.status().state}). Usenet: ${usenetRoute() === 'direct' ? `direct encrypted connection to ${usenetServer().host || '(no server set)'}` : 'off (Settings → Recon → Usenet)'}.`,
      `Blocklist of banned sites: ${blocklist.ready() ? `${blocklist.info().size} sites, fetched ${new Date(blocklist.info().at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'not fetched yet; it is fetched before the first search or page'}.`,
      `Read so far: ${sources.list(agent.id).length} sources. /recon log shows every search and source.`,
    ].join('\n');
  };
  // ---- export, and End and wipe ------------------------------------------------------------------

  const exportFolder = () => String(plain(config?.exportFolder) ?? '').trim() || (typeof home === 'function' ? home('recon', 'exports') : join(ROOM, '..', 'dsh-recon-exports'));
  const wipeList = openWipeList(typeof home === 'function' ? join(home('recon'), 'wipe.json') : '');
  /** Set once the app's conversation services are there. */
  let wiper;
  /**
   * End a Recon conversation: forget what it read, close it, and delete its files. The app holds an
   * open conversation in memory, so the files go as soon as it lets go, at the latest at the next start.
   */
  const endAndWipe = async (agent) => {
    const id = String(agent.id);
    sources.forget(id);
    trail.forget(id);
    consent.forget(id);
    await tor.stop();
    if (!wiper) return 'What this conversation read is forgotten and Tor is stopped. The conversation itself could not be deleted: this version of the app does not offer what that needs. Archive it yourself, then delete it from the list.';
    wipeList.add(id);
    let closed = true;
    try {
      await wiper.archive(id);
    } catch (error) {
      closed = false;
      warn(`could not archive ${id}: ${String(error?.message ?? error)}`);
    }
    const gone = await wiper.sweep().then(() => !wipeList.has(id), () => false);
    return [
      'Ended. What this conversation read is forgotten, and Tor is stopped with its temporary folder deleted.',
      closed ? 'The conversation is closed and taken off the list.' : 'The conversation could not be taken off the list; archive it yourself.',
      gone ? 'Its files are deleted. They are not in the trash.' : 'Its files are deleted as soon as the app lets go of it, at the latest when the app next starts. They do not go to the trash.',
      'An export you made before is kept; delete that file yourself if you do not want it.',
    ].join('\n');
  };
  ctx.inject(['sessionPersistence', 'sessions', 'workspaceRegistry'], (inner) => {
    const inMemory = (id) => {
      try {
        return inner.sessions.get(id) !== undefined;
      } catch {
        return true;
      }
    };
    const sweep = async () => {
      const waiting = wipeList.list();
      if (waiting.length === 0) return;
      const stored = await inner.sessionPersistence.list();
      for (const id of waiting) {
        try {
          if (inMemory(id)) continue;
          const snap = stored.find((entry) => entry.header?.id === id);
          if (!snap) {
            wipeList.done(id);
            continue;
          }
          if (snap.location?.kind !== 'jsonl' || typeof snap.location.path !== 'string') throw new Error('it is not stored as files');
          const folder = dirname(snap.location.path);
          const done = wipeFiles({ id, folder, cache: typeof home === 'function' ? home('storages', 'session_projcache', 'sessions', `${id}.json`) : '' }, dirname(dirname(folder)));
          if (done) wipeList.done(id);
        } catch (error) {
          warn(`could not delete the ended conversation ${id}: ${String(error?.message ?? error)}`);
        }
      }
    };
    wiper = { archive: (id) => inner.workspaceRegistry.archiveSession(id, { stopActivity: true }), sweep };
    void sweep().catch((error) => warn(`could not delete ended conversations: ${String(error?.message ?? error)}`));
    const again = setInterval(() => void sweep().catch(() => {}), 60_000);
    again.unref?.();
    inner.effect(() => () => {
      clearInterval(again);
      wiper = undefined;
    }, 'recon: wipe');
  });

  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: 'recon',
          description: 'Recon conversation: show its isolation and model, or agree to a cloud model',
          input: { hint: '[status | cloud | log | export | end | stop]' },
          handler: async ({ agent, rawInput }) => {
            try {
              const word = String(rawInput ?? '').trim().toLowerCase();
              if (!word || word === 'status') return { kind: 'success', text: status(agent) };
              if (word === 'cloud') {
                if (!enabled() || !inRecon(agent)) return { kind: 'error', text: status(agent) };
                const { route, place } = modelOf(agent);
                if (!route) return { kind: 'error', text: 'Pick a model in the chat box first.' };
                if (staysHome(place)) return { kind: 'success', text: 'This conversation\'s model runs on your own machines. Nothing to agree to.' };
                consent.agree(agent.id, route);
                return { kind: 'success', text: `Agreed: what Recon finds in this conversation is sent to ${route.model} (${place.name || route.provider}). This holds for this conversation and this model until the app is closed.` };
              }
              if (word === 'log') return enabled() && inRecon(agent) ? { kind: 'success', text: `Research log of this conversation\n\n${sources.log(agent.id)}` } : { kind: 'error', text: status(agent) };
              if (word === 'export') {
                if (!enabled() || !inRecon(agent)) return { kind: 'error', text: status(agent) };
                const found = sources.full(agent.id);
                const notes = sources.notes(agent.id);
                if (found.length === 0 && notes.length === 0) return { kind: 'error', text: 'There is nothing to export: nothing was read in this conversation since the app was started. What Recon reads is kept in memory only.' };
                const file = writeExport(exportFolder(), exportText({ sources: found, cite: (source) => sources.cite(source), log: sources.log(agent.id), notes }));
                sources.note(agent.id, 'export', `written (${found.length} sources, ${notes.length} notes)`);
                return { kind: 'success', text: `Exported ${found.length} sources and ${notes.length} notes to:\n${file}\n\nEverything from sources and from the assistant is quoted and marked as untrusted material in that file. If you give the file to another tab or tool, leave the marks in.` };
              }
              if (word === 'end' || word === 'wipe') {
                if (!inRecon(agent)) return { kind: 'error', text: status(agent) };
                return { kind: 'success', text: await endAndWipe(agent) };
              }
              if (word === 'stop') {
                await tor.stop();
                return { kind: 'success', text: 'Recon\'s Tor is stopped and its temporary folder deleted. It starts again with the next search or page.' };
              }
              return { kind: 'error', text: `/recon does not know "${word.slice(0, 40)}". Use /recon, /recon cloud, /recon log, /recon export, /recon end or /recon stop.` };
            } catch (error) {
              return { kind: 'error', text: String(error?.message ?? error).slice(0, 300) };
            }
          },
        }),
      'recon: command',
    );
  });

  // ---- the page's data ---------------------------------------------------------------------------

  const view = () => {
    const path = torBin();
    if (path !== torSeen.path) {
      torSeen = { path, version: '' };
      if (path) void torVersion(path).then((version) => { if (torSeen.path === path) torSeen = { path, version }; });
    }
    lookForLogin();
    return { room: ROOM, exportFolder: exportFolder(), waitingToWipe: wipeList.list().length, usenet: { route: usenetRoute(), ...usenetServer(), hasLogin, storeCommand: STORE_COMMAND, removeCommand: REMOVE_COMMAND }, at: Date.now(), enabled: enabled(), problem, toolsOn: Boolean(toolsOff), tools: TOOLS, network: true, tor: { ...tor.status(), path, version: torSeen.version, test: torTest }, blocklist: blocklist.info(), engine: { builtIn: AHMIA, other: plain(config?.otherEngine) === true, host: String(plain(config?.engineHost) ?? '') } };
  };
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
              if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                  size += chunk.length;
                  if (size > 4096) throw new Error('request too large');
                  chunks.push(chunk);
                }
                const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
                if (body?.action !== 'tor-test') throw new Error('unknown action');
                if (!enabled()) throw new Error('Recon is switched off.');
                // Runs in the background; the page asks again to see how far it is.
                void runTorTest();
              }
              res.end(JSON.stringify(view()));
              follow();
            } catch (error) {
              res.statusCode = 400;
              res.end(JSON.stringify({ error: String(error?.message ?? error).slice(0, 300) }));
            }
          },
        }),
      'recon: state route',
    );
  });
}
