/**
 * Recon: an isolated mode and tab for research on .onion sites and Usenet text newsgroups.
 *
 * Steps 1 to 3 of 7: the isolation frame, the connection layer, and searching and reading
 * .onion sites behind the filters, with citations and a research log; and step 4, Usenet text
 * newsgroups (lib/usenet.js; the login is in the macOS Keychain, lib/keychain.js).
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
import { join } from 'node:path';
import { onionAddressesIn, openTrail } from './lib/address.js';
import { MODE_ID, TOOLS, withRecon } from './lib/mode.js';
import { mayReceive, openConsent, providerPlace, staysHome } from './lib/model.js';
import { openForward } from './lib/forward.js';
import { login, loginName, REMOVE_COMMAND, STORE_COMMAND } from './lib/keychain.js';
import { AHMIA, createOnion } from './lib/onion.js';
import { runLocked } from './lib/sandbox.js';
import { openBlocklist } from './lib/screen.js';
import { openSources } from './lib/sources.js';
import { buildTools } from './lib/tools.js';
import { createUsenet } from './lib/usenet.js';
import { createTor, findTor, torVersion } from './lib/tor.js';

export const name = 'dsh-recon';

/** `GET` gives the page its data; `POST {action: 'tor-test'}` starts Tor once to see that it connects, then stops it. */
export const STATE_PATH = '/dsh-recon/state';
const MODES_NS = 'modes';

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
      toolsOff = buildTools({ enabled, inRecon: (exec) => inRecon(exec?.agent), gate: (exec) => gate(exec?.agent), onion, usenet, sources, idOf: (exec) => String(exec?.agent?.id ?? '') }).map((tool) => tools.register(tool));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
      void tor.stop();
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
  }, 'recon: follow the switch');
  ctx.on('agent/disposed', ({ agent }) => consent.forget(agent?.id));
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
      `Tools: only ${TOOLS.join(', ')}. No programs, files, memory, helpers or other modes.`,
      `Model: ${model}${where ? `, ${where}` : ''}.`,
      allowed.ok ? (staysHome(place) ? 'What Recon finds stays on your own machines.' : 'You agreed that what Recon finds goes to this cloud model, for this conversation.') : 'What Recon finds is NOT sent to this model. Type /recon cloud to agree for this conversation, or pick a local model.',
      `Network: .onion sites through Recon's own Tor (${tor.status().state}). Usenet: ${usenetRoute() === 'direct' ? `direct encrypted connection to ${usenetServer().host || '(no server set)'}` : 'off (Settings → Recon → Usenet)'}.`,
      `Blocklist of banned sites: ${blocklist.ready() ? `${blocklist.info().size} sites, fetched ${new Date(blocklist.info().at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'not fetched yet; it is fetched before the first search or page'}.`,
      `Read so far: ${sources.list(agent.id).length} sources. /recon log shows every search and source.`,
    ].join('\n');
  };
  ctx.inject(['commands'], (inner) => {
    inner.effect(
      () =>
        inner.commands.register({
          name: 'recon',
          description: 'Recon conversation: show its isolation and model, or agree to a cloud model',
          input: { hint: '[status | cloud | log | stop]' },
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
              if (word === 'stop') {
                await tor.stop();
                return { kind: 'success', text: 'Recon\'s Tor is stopped and its temporary folder deleted. It starts again with the next search or page.' };
              }
              return { kind: 'error', text: `/recon does not know "${word.slice(0, 40)}". Use /recon, /recon cloud, /recon log or /recon stop.` };
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
    return { usenet: { route: usenetRoute(), ...usenetServer(), hasLogin, storeCommand: STORE_COMMAND, removeCommand: REMOVE_COMMAND }, at: Date.now(), enabled: enabled(), problem, toolsOn: Boolean(toolsOff), tools: TOOLS, network: true, tor: { ...tor.status(), path, version: torSeen.version, test: torTest }, blocklist: blocklist.info(), engine: { builtIn: AHMIA, other: plain(config?.otherEngine) === true, host: String(plain(config?.engineHost) ?? '') } };
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
