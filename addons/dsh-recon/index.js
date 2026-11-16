/**
 * Recon: an isolated mode and tab for research on .onion sites and Usenet text newsgroups.
 *
 * Steps 1 to 3 of 7: the isolation frame, the connection layer, and searching and reading
 * .onion sites behind the filters, with citations and a research log; and step 4, Usenet text
 * newsgroups on one or more accounts (lib/usenet.js, lib/accounts.js; each login is in the macOS
 * Keychain, lib/keychain.js); and step 6: the
 * export (lib/export.js), the throwaway folder all Recon conversations run in (ROOM), and End and
 * wipe (lib/wipe.js).
 * The isolation:
 *   - the mode is marked isolated, so the Modes add-on gives its conversations exactly the nine
 *     recon tools, no programs, no helpers, no web search, and never lets them change mode;
 *   - every other add-on leaves an isolated conversation alone;
 *   - research content goes to a model on this computer or in the user's own network without a
 *     question, and to any other model only after the user typed /recon cloud in that conversation.
 *
 * Off until switched on in Settings > Recon. Needs the Modes add-on and the Cowork sidebar.
 * The connection layer: lib/tor.js (Recon's own Tor, state in a throwaway folder), lib/sandbox.js
 * and lib/fetch-child.mjs (one locked process per page: one local port, no files, text only),
 * lib/address.js (only .onion addresses the conversation was shown). The Internet Archive is read
 * directly or through Tor (`archiveDirect`, lib/web.js); GDELT always through Tor.
 * After a restart, a conversation's sources and the addresses it was shown are rebuilt from its
 * saved history (lib/restore.js), in memory only.
 * Route: `GET/POST /dsh-recon/state`; `GET ?session=<id>` adds that conversation's model and
 * whether it may receive findings, for the status bar on the Recon tab's start page.
 */
import z from '@deepseek-ai/schemastery';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { nameOf, readAccounts, removeCommandFor, serviceOf, storeCommandFor } from './lib/accounts.js';
import { onionAddressesIn, openTrail } from './lib/address.js';
import { MODE_ID, TOOLS, withRecon } from './lib/mode.js';
import { mayReceive, openConsent, providerPlace, staysHome } from './lib/model.js';
import { exportText, writeExport } from './lib/export.js';
import { openForward } from './lib/forward.js';
import { login, loginName } from './lib/keychain.js';
import { AHMIA, createOnion } from './lib/onion.js';
import { runLocked } from './lib/sandbox.js';
import { openBlocklist } from './lib/screen.js';
import { openSources } from './lib/sources.js';
import { findingsIn } from './lib/restore.js';
import { withoutMentions } from './lib/mentions.js';
import { buildTools, holdsFindings, wasCompacted } from './lib/tools.js';
import { createUsenet } from './lib/usenet.js';
import { ARCHIVE, NEWS, createWeb } from './lib/web.js';
import { createClearnet, openWebTrail } from './lib/clearnet.js';
import { createBoards } from './lib/boards.js';
import { openWipeList, wipeFiles, wipeTrashed } from './lib/wipe.js';
import { createTor, findTor, torVersion } from './lib/tor.js';
import { createVpn, findWireproxy, readVpnList, vpnNameOf, vpnRemoveCommandFor, vpnStoreCommandFor, vpnStored } from './lib/vpn.js';

export const name = 'dsh-recon';

/** `GET` gives the page its data; `POST {action: 'tor-test'}` starts Tor once to see that it connects, then stops it. */
export const STATE_PATH = '/dsh-recon/state';
const MODES_NS = 'modes';
/** The folder every Recon conversation runs in, unless a test moves it (roomFrom). */
export const DEFAULT_ROOM = '/private/tmp/dsh-recon-room';

/**
 * The room a test asks for through the environment variable DSH_RECON_ROOM, so a test never
 * empties the real room while the app uses it. Recon empties its room, so only a throwaway folder
 * is taken: an absolute path whose name starts with "dsh-recon-", directly inside /tmp or the
 * system's temporary folder, and not the real room's name in any spelling (/tmp is a link to
 * /private/tmp, and the Mac's disk does not tell capitals from small letters, so
 * "/tmp/dsh-recon-Room" is the real room). Anything else is ignored and the usual room is used.
 * @param {unknown} value - the variable's value.
 * @returns {string} the room's path.
 */
export function roomFrom(value) {
  const text = String(value ?? '').trim();
  if (!text || !isAbsolute(text)) return DEFAULT_ROOM;
  const path = resolve(text);
  if (path !== text.replace(/\/+$/, '') || !/^dsh-recon-[\w.-]{1,80}$/.test(basename(path))) return DEFAULT_ROOM;
  if (basename(path).toLowerCase() === basename(DEFAULT_ROOM).toLowerCase()) return DEFAULT_ROOM;
  const real = (where) => {
    try {
      return realpathSync(where);
    } catch {
      return '';
    }
  };
  const parent = real(dirname(path));
  const temporary = [real('/tmp'), real(tmpdir())].filter(Boolean);
  if (!parent || !temporary.includes(parent)) return DEFAULT_ROOM;
  // A link to another folder is never taken: emptying it would empty that folder.
  try {
    const seen = lstatSync(path);
    if (seen.isSymbolicLink() || !seen.isDirectory()) return DEFAULT_ROOM;
  } catch {
    /* not there yet: it is made when Recon starts */
  }
  return path;
}

/**
 * The folder every Recon conversation runs in. The app tells a model the path of its conversation's
 * folder, so this one is outside the user's home and says nothing about them. It is kept empty.
 */
export const ROOM = roomFrom(process.env.DSH_RECON_ROOM);

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
   * How Usenet is reached. `off`: not at all. `direct`: an encrypted connection straight to a news
   * server, which sees your address and knows the account used.
   */
  usenetRoute: z.union([z.const('off'), z.const('direct')]).default('off').volatile(),
  /**
   * The Internet Archive: dated copies of web pages, read as text. On lets recon_archive_find and
   * recon_archive_read work.
   */
  archiveOn: z.boolean().default(false).volatile(),
  /**
   * A Long run here may check its work with small commands that Mission runs with no internet, no
   * name lookups, no other programs, nothing of the home folder and writing only in the run's folder.
   * Off (the owner's default): no commands at all; the reviewer judges each step by reading.
   */
  longChecks: z.boolean().default(false).volatile(),
  /**
   * Read the Internet Archive directly, not through Tor: its list of copies and the copies
   * themselves, still GET only, text only, with the same filters and limits. The Archive then sees
   * this Mac's internet address. Off: through Recon's Tor, where the Archive refuses most reads.
   * GDELT and .onion sites always go through Tor.
   */
  archiveDirect: z.boolean().default(true).volatile(),
  /** The GDELT Project's index of news coverage, asked through Recon's Tor. On lets recon_news_search work. */
  newsOn: z.boolean().default(false).volatile(),
  /** The ordinary web (recon_web_search, recon_web_read), through WireGuard only, or straight where a conversation allowed it. */
  webOn: z.boolean().default(true).volatile(),
  /**
   * The Usenet accounts: a news server each, with its own login. No login is kept here: each is in
   * the macOS Keychain, under an item named after the account's id (lib/accounts.js).
   */
  usenetAccounts: z.array(z.object({
    id: z.string().default(''),
    label: z.string().default(''),
    host: z.string().default(''),
    port: z.natural().default(563),
  })).default([]).volatile(),
  /** The account used when a request names none. Empty uses the first. */
  usenetDefaultAccount: z.string().default('').volatile(),
  /** The one news server of older versions. Read only, to turn it into the first account. */
  usenetHost: z.string().default('').volatile(),
  /** Where `/recon export` writes its files. Empty uses the folder `recon/exports` in the app's home. */
  exportFolder: z.string().default('').volatile(),
  /** That older server's port. Read only, for the same reason. */
  usenetPort: z.natural().default(563).volatile(),
  /**
   * WireGuard (16 November 2026): everything Recon sends outside Tor goes through a WireGuard tunnel.
   * The configurations by name, in order: the first is the primary, the others are backups. Each one's
   * file is in the macOS Keychain under an item named after its id, never here (lib/vpn.js).
   */
  vpnConfigs: z.array(z.object({ id: z.string().default(''), label: z.string().default('') })).default([]).volatile(),
  /** Where the wireproxy program is. Empty looks in the usual places (Homebrew). Plus does not install it. */
  wireproxyPath: z.string().default('').volatile(),
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
  /** The Usenet accounts: the saved list, or the one server of older versions as the first account. */
  const usenetAccounts = () => readAccounts(plain(config?.usenetAccounts), { host: plain(config?.usenetHost), port: plain(config?.usenetPort) });
  /** The account used when a request names none. */
  const usenetDefault = () => String(plain(config?.usenetDefaultAccount) ?? '');
  /** Whether the Internet Archive is read directly (the default) rather than through Tor. */
  const archiveDirect = () => plain(config?.archiveDirect) !== false;
  const web = createWeb({ port: () => onion.port(), run: runLocked, sources, on: () => ({ archive: plain(config?.archiveOn) === true, news: plain(config?.newsOn) === true }), archiveDirect, forward: (host, port, id) => clearForward(host, port, id) });
  // ---- WireGuard: the way out for everything that is not Tor ------------------------------------
  const vpnList = () => readVpnList(plain(config?.vpnConfigs));
  const wireproxyBin = () => findWireproxy(String(plain(config?.wireproxyPath) ?? ''));
  const vpn = createVpn({ list: vpnList, bin: wireproxyBin, warn });
  ctx.effect(() => () => vpn.stop(), 'recon: wireguard');
  /** Conversations whose user allowed direct connections (no tunnel works, or none is set up): in memory only. */
  const directOk = new Set();
  const ASK_DIRECT = 'Tell the user this. To allow direct connections for this conversation anyway, they type /recon direct (the sites then see this Mac\'s internet address); /recon block takes it back.';
  /**
   * The relay to one server outside Tor (lib/forward.js): through the WireGuard tunnel when one works,
   * straight only when the user allowed it for this conversation. Otherwise nothing is sent.
   */
  const clearForward = async (host, port, id) => {
    if (vpnList().length > 0) {
      const tunnel = await vpn.start();
      if (tunnel.ok) return { ...(await openForward(host, port, { socksPort: tunnel.port })), how: 'wireguard' };
      if (!directOk.has(String(id))) throw new Error(`${tunnel.why} Nothing was sent. ${ASK_DIRECT}`);
    } else if (!directOk.has(String(id))) {
      throw new Error(`No WireGuard configuration is set up (Settings → Recon → WireGuard), so this would go straight from this Mac and show its internet address. Nothing was sent. ${ASK_DIRECT}`);
    }
    return { ...(await openForward(host, port)), how: 'direct' };
  };
  /** How a conversation reaches what is not Tor just now, in words. */
  const clearWayText = (id) => {
    const now = vpn.status();
    if (vpnList().length === 0) return directOk.has(String(id)) ? 'directly (you allowed it for this conversation; no WireGuard is set up)' : 'blocked: no WireGuard is set up, and direct connections are not allowed in this conversation (/recon direct)';
    if (now.state === 'ready') return `through WireGuard (${now.name})`;
    return directOk.has(String(id)) ? 'through WireGuard when it starts, else directly (you allowed it for this conversation)' : 'through WireGuard when it starts; blocked if no configuration works (/recon direct allows direct connections)';
  };
  const usenet = createUsenet({ run: runLocked, route: usenetRoute, accounts: usenetAccounts, defaultAccount: usenetDefault, login, forward: clearForward, sources });
  /** The ordinary web's addresses each conversation was shown (search results, links on pages it read, your messages). */
  const webTrail = openWebTrail();
  const clearnet = createClearnet({ run: runLocked, forward: clearForward, sources, trail: webTrail, on: () => plain(config?.webOn) !== false });
  // Boards, forums and public channels that search engines miss (lib/boards.js), the same way out.
  const boards = createBoards({ fetch: clearnet.fetch, sources, trail: webTrail, on: clearnet.on });
  /** Whether each account has a login in the Keychain, looked up now and then for the page. Only the fact, never a login. */
  const hasLogin = new Map();
  /** Whether each WireGuard configuration is in the Keychain: only the fact, never its contents. */
  const hasVpn = new Map();
  const lookForVpns = () => {
    for (const entry of vpnList()) void vpnStored(entry.id).then((there) => { hasVpn.set(entry.id, there); }, () => { hasVpn.set(entry.id, false); });
  };
  /** The last test of the tunnel, for the page. */
  let vpnTest = { state: 'none', text: '' };
  const runVpnTest = async () => {
    if (vpnTest.state === 'running') return;
    vpnTest = { state: 'running', text: 'Starting WireGuard…' };
    const result = await vpn.start();
    vpnTest = result.ok
      ? { state: 'ok', text: `WireGuard works: ${result.name} passed traffic at ${new Date().toLocaleTimeString()}. It keeps running while Recon uses it.` }
      : { state: 'failed', text: result.why.slice(0, 600) };
  };
  const lookForLogins = () => {
    for (const account of usenetAccounts()) {
      void loginName(serviceOf(account.id)).then((name) => { hasLogin.set(account.id, Boolean(name)); }, () => { hasLogin.set(account.id, false); });
    }
  };
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

  /**
   * Make sure the room is there, belongs to the user alone, and is empty. A room that is a link,
   * not a folder, or someone else's is left alone: emptying it could delete files elsewhere.
   */
  const prepareRoom = () => {
    try {
      mkdirSync(ROOM, { recursive: true, mode: 0o700 });
      const seen = lstatSync(ROOM);
      if (seen.isSymbolicLink() || !seen.isDirectory() || (typeof process.getuid === 'function' && seen.uid !== process.getuid())) {
        warn(`the Recon folder ${ROOM} is a link, not a folder, or not yours, so it was not emptied`);
        return;
      }
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
  /** Whether a conversation (a helper's: its conversation) runs in the room. */
  const inRoom = (agent) => {
    const top = topOf(agent);
    return sameFolder((top?.header ?? top?.session?.header)?.cwd ?? (agent?.header ?? agent?.session?.header)?.cwd);
  };
  /**
   * A Long run's own folder in the room (Mission keeps its record, checkpoints and the helpers' files
   * there). Each conversation has its own; End and wipe deletes it, and the room is emptied at every start.
   * @returns {string} the folder, made if need be ('' when it cannot be).
   */
  const runFolder = (id) => {
    const safe = String(id ?? '').replace(/[^\w-]/g, '').slice(0, 80);
    if (!safe || !existsSync(ROOM)) return '';
    const folder = join(ROOM, `run-${safe}`);
    try {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      const seen = lstatSync(folder);
      return seen.isDirectory() && !seen.isSymbolicLink() ? folder : '';
    } catch {
      return '';
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
  /**
   * The conversation an agent belongs to: itself, or for a helper (a Long run's planner, worker or
   * reviewer) the conversation that started it. What Recon keeps per conversation (sources, the
   * addresses it may open, your agreement to a cloud model, the export) is that conversation's.
   * @returns {string} its id ('' when none).
   */
  const topIdOf = (agent) => {
    let id = agent?.id ? String(agent.id) : '';
    let parent = agent?.header?.parentSession ?? agent?.session?.header?.parentSession;
    for (let depth = 0; parent && depth < 8; depth += 1) {
      id = String(parent);
      let above;
      try {
        above = ctx.get('agents')?.get?.(id);
      } catch {
        above = undefined;
      }
      parent = above?.header?.parentSession ?? above?.session?.header?.parentSession;
    }
    return id;
  };
  /** The agent of an agent's conversation (itself, or the one a helper works for). */
  const topOf = (agent) => {
    const id = topIdOf(agent);
    if (!id || id === String(agent?.id ?? '')) return agent;
    try {
      return ctx.get('agents')?.get?.(id) ?? { id };
    } catch {
      return { id };
    }
  };
  /** Whether an agent is an isolated Recon conversation, or a helper of one. A missing Modes add-on means no. */
  const inRecon = (agent) => {
    const service = modes();
    const id = topIdOf(agent);
    return Boolean(id) && service?.get?.(id) === MODE_ID && service?.isolated?.(id) === true;
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
    // The model the agent uses; the agreement is the conversation's (a helper uses the same model).
    const { route, place } = modelOf(agent);
    return mayReceive({ place, route, id: topIdOf(agent), consent });
  };

  /** Conversations whose record was rebuilt from their saved history since Recon started. */
  const rebuilt = new Set();
  /** Conversations ended with /recon end since Recon started: what they read stays forgotten. */
  const ended = new Set();
  /** "1 source", "2 sources". */
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  /**
   * After a restart, put back what a Recon conversation was shown, from its saved history: the
   * numbered sources and the addresses it may open (lib/restore.js). Once per conversation, in
   * memory only; nothing is written. An ended conversation gets back only its numbering, so a new
   * source never takes the number of one in its history.
   */
  const restore = (agent) => {
    const id = agent?.id ? String(agent.id) : '';
    if (!id || rebuilt.has(id)) return;
    let messages;
    try {
      messages = agent.session?.deriveMessages?.();
    } catch (error) {
      warn(`could not read a conversation's history: ${String(error?.message ?? error)}`);
      return;
    }
    if (!Array.isArray(messages)) return;
    rebuilt.add(id);
    try {
      const found = findingsIn(messages);
      if (ended.has(id) || wipeList.has(id)) {
        sources.restore(id, { floor: found.floor });
        return;
      }
      const added = sources.restore(id, found);
      // Only what was missing counts: an address the user wrote since the start is already known.
      const before = trail.count(id);
      if (found.shown.length > 0) trail.add(id, found.shown);
      const opened = trail.count(id) - before;
      if (added > 0 || opened > 0) sources.note(id, 'restored', `rebuilt from the saved conversation after the app started: ${count(added, 'source', 'sources')}${found.sources.length > added ? ` (${found.sources.length - added} already known)` : ''}, ${count(opened, 'address', 'addresses')} it was shown`);
    } catch (error) {
      warn(`could not rebuild a conversation's sources: ${String(error?.message ?? error)}`);
    }
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
      // A helper's searches and reads belong to its conversation: one numbering of sources, one log, one export.
      toolsOff = buildTools({ enabled, inRecon: (exec) => inRecon(exec?.agent), inRoom: (exec) => inRoom(exec?.agent), gate: (exec) => gate(exec?.agent), onion, clearnet, boards, usenet, web, sources, idOf: (exec) => topIdOf(exec?.agent), restore: (exec) => restore(topOf(exec?.agent)) }).map((tool) => tools.register(tool));
    } else if (!on && toolsOff) {
      for (const dispose of toolsOff) if (typeof dispose === 'function') dispose();
      toolsOff = undefined;
      void tor.stop();
      vpn.stop();
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
  ctx.on('agent/disposed', ({ agent }) => {
    consent.forget(agent?.id);
    // A conversation that never read anything leaves no entry behind; loaded again, its history is
    // read again, so the numbers it used are known again.
    if (agent?.id && sources.empty(agent.id)) {
      sources.forget(agent.id);
      rebuilt.delete(String(agent.id));
    }
  });

  // ---- what Recon found stays where it may go ----------------------------------------------------

  /**
   * Whether a conversation's history holds something Recon found: a Recon tool answer in it, a
   * source read since the app started, or, for an isolated conversation, a compaction summary (it
   * keeps what the removed tool answers said, also in a Rerun copy or after a restart).
   */
  const holdsRecon = (agent) => {
    if (!agent?.id) return false;
    // A helper of a Recon conversation carries its goal, plan and findings from its first request on
    // (review finding 3): it counts as holding them.
    if (topIdOf(agent) !== String(agent.id) && inRecon(agent)) return true;
    if (sources.readCount(topIdOf(agent)) > 0) return true;
    try {
      const messages = agent.session?.deriveMessages?.();
      if (holdsFindings(messages)) return true;
      let isolated = false;
      try {
        isolated = modes()?.isolated?.(agent.id) === true;
      } catch {
        isolated = false;
      }
      return isolated && wasCompacted(messages);
    } catch (error) {
      warn(`could not read a conversation's history: ${String(error?.message ?? error)}`);
      return false;
    }
  };
  // The tools check the model before they fetch, but what they found earlier is in the history, and
  // every step sends the history to the model picked at that moment. So a conversation holding
  // Recon findings (switched to another model, a Rerun copy, or one moved to another tab) takes no
  // step on a model they may not go to. The step fails with a message the user sees; a silent
  // refusal would leave them guessing.
  ctx.on('agent/pre-step', async (payload, next) => {
    const agent = payload?.agent;
    const chosen = payload?.modelSelection;
    const route = chosen?.provider && chosen?.model ? { provider: String(chosen.provider), model: String(chosen.model) } : undefined;
    const place = providerPlace(settingsOf('llm-pi-ai')?.providers, route?.provider);
    if (mayReceive({ place, route, id: topIdOf(agent), consent }).ok || !holdsRecon(agent)) return next();
    const who = !route ? 'not known' : `${route.model} (${place.name || route.provider}), ${place.where === 'cloud' ? 'in the cloud' : 'at a place Recon cannot tell, treated as cloud'}`;
    const agree = enabled() && inRecon(agent) ? ', or type /recon cloud to agree to this model for this conversation' : '';
    throw new Error(`This conversation holds what Recon found, and its model is ${who}. Nothing was sent. Pick a model on this computer or in your own network${agree}, then send your message again.`);
  });
  // Mentions of other conversations: an isolated conversation takes in none, and none takes in an
  // isolated one. The app's own handler runs outside this one, so it never sees what is taken out.
  ctx.on('agent/pre-step', async (payload, next) => {
    const decision = await next();
    if (decision?.kind === 'reject' || !Array.isArray(decision?.messages)) return decision;
    const service = modes();
    if (typeof service?.isolated !== 'function') return decision;
    const sealed = service.isolated(payload?.agent?.id) === true;
    const messages = withoutMentions(decision.messages, (id) => sealed || (id !== undefined && service.isolated(id) === true));
    return messages === decision.messages ? decision : { ...decision, messages };
  });
  // What the assistant writes in a Recon conversation is kept for the export.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'assistant/message' || !session?.id || !inRecon({ id: session.id, header: session.header })) return;
      const content = event.data?.message?.content;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((block) => (block?.type === 'text' ? block.text : '')).join('\n') : '';
      // A Long run's helpers write their findings as answers: kept with their conversation.
      // The planner's and reviewer's JSON is not a finding (review finding 9).
      const helper = Boolean(session.header?.parentSession);
      if (text.trim() && !(helper && text.trim().startsWith('{'))) sources.say(topIdOf({ id: session.id, header: session.header }), text);
    } catch (error) {
      warn(`could not keep an answer for the export: ${String(error?.message ?? error)}`);
    }
  });
  // An address the user writes is one the conversation may open.
  ctx.on('session/event', (session, event) => {
    try {
      if (event?.type !== 'user/message' || !session?.id || event.data?.source?.kind !== 'user') return;
      // A helper's task arrives as a "user" message too, but it is Mission's text, not yours: an address
      // a worker copied from a page must not become one the conversation may open (review finding 2).
      if (session.header?.parentSession) return;
      const content = event.data?.content;
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((block) => (block?.type === 'text' ? block.text : '')).join('\n') : '';
      const found = onionAddressesIn(text);
      if (found.length > 0) trail.add(session.id, found);
      // A web address the user writes may be read too (the ordinary web, through WireGuard).
      const web = text.match(/https?:\/\/[^\s<>"')\]]+/gi) ?? [];
      if (web.length > 0) webTrail.add(session.id, web.slice(0, 50));
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
    restore(agent);
    return [
      'Recon conversation: isolated.',
      inRoom(agent) ? 'Folder: Recon\'s own empty folder. The model is told no path of yours.' : 'Folder: a folder of yours, so the tools are OFF in this conversation. Start a new one with the New button in the Recon tab.',
      `Tools: only ${TOOLS.join(', ')}. No programs, files, memory, helpers or other modes; a Long run (the Run button) adds helpers on this conversation's model, with file tools in the run's own folder in the room, and no programs or commands.`,
      `Model: ${model}${where ? `, ${where}` : ''}.`,
      allowed.ok ? (staysHome(place) ? 'What Recon finds stays on your own machines.' : 'You agreed that what Recon finds goes to this cloud model, for this conversation.') : 'What Recon finds is NOT sent to this model. Type /recon cloud to agree for this conversation, or pick a local model.',
      `Outside Tor (the Internet Archive read directly, Usenet, the ordinary web): ${clearWayText(topIdOf(agent))}.`,
      `Network: .onion sites through Recon's own Tor (${tor.status().state}). Usenet: ${usenetRoute() === 'direct' ? `encrypted connections, ${clearWayText(topIdOf(agent))}; accounts: ${usenetAccounts().map((account) => `${nameOf(account)} (${account.host || 'no server yet'}:${account.port})`).join(', ') || '(none set yet)'}` : 'off (Settings → Recon → Usenet)'}.`,
      `The ordinary web: ${plain(config?.webOn) !== false ? `on, ${clearWayText(topIdOf(agent))}` : 'off (Settings → Recon → More sources)'}.`,
      `More sources (Settings → Recon → More sources): Internet Archive ${plain(config?.archiveOn) !== true ? 'off' : archiveDirect() ? `on, not through Tor but ${clearWayText(topIdOf(agent))}` : 'on, through Tor'}; GDELT news ${plain(config?.newsOn) === true ? 'on, through Tor' : 'off'}.`,
      `Blocklist of banned sites: ${blocklist.ready() ? `${blocklist.info().size} sites, fetched ${new Date(blocklist.info().at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : 'not fetched yet; it is fetched before the first search or page'}.`,
      `Read so far: ${sources.list(agent.id).length} sources. /recon log shows every search and source.`,
    ].join('\n');
  };
  // ---- export, and End and wipe ------------------------------------------------------------------

  const exportFolder = () => String(plain(config?.exportFolder) ?? '').trim() || (typeof home === 'function' ? home('recon', 'exports') : join(ROOM, '..', 'dsh-recon-exports'));
  const wipeList = openWipeList(typeof home === 'function' ? join(home('recon'), 'wipe.json') : '');
  const trashDir = typeof home === 'function' ? home('trash', 'conversations') : '';
  // Which conversations End and wipe is deleting: the Cowork sidebar's trash refuses them, and its
  // Archived list offers no Restore or Delete for them.
  // Mission asks where a Long run of a Recon conversation keeps its files (16 November).
  /**
   * Whether a conversation may have a Long run Recon keeps in its rules: Recon is on, the conversation is
   * a Recon conversation of its own (not a helper, not one locked in another tab) and runs in the room.
   */
  const runsIn = (id) => {
    if (!enabled() || !existsSync(ROOM)) return false;
    let agent;
    try {
      agent = ctx.get('agents')?.get?.(String(id ?? ''));
    } catch {
      agent = undefined;
    }
    if (!agent || topIdOf(agent) !== String(agent.id)) return false;
    return inRecon(agent) && inRoom(agent);
  };
  if (typeof ctx.provide === 'function') ctx.effect(() => ctx.provide('recon', Object.freeze({ apiVersion: 2, runs: runsIn, runFolder: (id) => (runsIn(id) ? runFolder(id) : ''), longChecks: () => plain(config?.longChecks) === true })), 'recon: run folders');
  if (typeof ctx.provide === 'function') ctx.effect(() => ctx.provide('reconWipe', Object.freeze({ has: (id) => wipeList.has(String(id)), list: () => wipeList.list() })), 'recon: wipe list');
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
    webTrail.forget(id);
    consent.forget(id);
    directOk.delete(id);
    // Not rebuilt from its history again while Recon runs (only its numbering is), also when it
    // cannot be deleted. After the app restarts, only a conversation still waiting on the wipe
    // list is kept from it; one that could not be deleted still holds what it read.
    ended.add(id);
    rebuilt.delete(id);
    // A Long run of this conversation ends first, and its folder in the room goes (its record, the
    // checkpoints, the helpers' files). Its helpers' saved conversations go with the conversation (sweep).
    try {
      ctx.get('mission')?.endRun?.(id);
    } catch (error) {
      warn(`could not end the conversation's Long run: ${String(error?.message ?? error)}`);
    }
    const dropRunFolder = () => {
      try {
        const folder = join(ROOM, `run-${id.replace(/[^\w-]/g, '').slice(0, 80)}`);
        if (existsSync(folder) && !lstatSync(folder).isSymbolicLink()) rmSync(folder, { recursive: true, force: true });
      } catch (error) {
        warn(`could not delete the Long run's folder: ${String(error?.message ?? error)}`);
      }
    };
    dropRunFolder();
    // Once more after the step that was under way has stopped, in case it still wrote something.
    const again = setTimeout(dropRunFolder, 3000);
    again.unref?.();
    await tor.stop();
    if (!wiper) return 'What this conversation read is forgotten and Tor is stopped. The conversation itself could not be deleted: this version of the app does not offer what that needs. Its saved history still holds what it read until you delete it: archive it yourself, then delete it from the list.';
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
      /** The saved helpers of a conversation (a Long run's planner, workers, reviewer), at any depth. */
      const helpersOf = (id) => {
        const out = [];
        const below = new Set([id]);
        for (let grew = true; grew;) {
          grew = false;
          for (const entry of stored) {
            const own = entry.header?.id;
            if (own && !below.has(own) && below.has(entry.header?.parentSession)) {
              below.add(own);
              out.push(entry);
              grew = true;
            }
          }
        }
        return out;
      };
      for (const id of waiting) {
        try {
          if (inMemory(id)) continue;
          // Its helpers first: the conversation leaves the list only once they are gone too.
          let left = 0;
          for (const helper of helpersOf(id)) {
            const helperId = helper.header.id;
            if (inMemory(helperId)) {
              left += 1;
              continue;
            }
            if (helper.location?.kind !== 'jsonl' || typeof helper.location.path !== 'string') continue;
            const folder = dirname(helper.location.path);
            if (!wipeFiles({ id: helperId, folder, cache: typeof home === 'function' ? home('storages', 'session_projcache', 'sessions', `${helperId}.json`) : '' }, dirname(dirname(folder)))) left += 1;
          }
          if (left > 0) continue;
          const snap = stored.find((entry) => entry.header?.id === id);
          // Deleted from the Archived list after /recon end, its files may be in the Cowork
          // sidebar's trash: they go too, and it leaves the trash's waiting list.
          wipeTrashed(trashDir, id);
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
          input: { hint: '[status | cloud | direct | block | log | export | end | stop]' },
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
              if (word === 'log') {
                if (!enabled() || !inRecon(agent)) return { kind: 'error', text: status(agent) };
                restore(agent);
                return { kind: 'success', text: `Research log of this conversation\n\n${sources.log(agent.id)}` };
              }
              if (word === 'export') {
                if (!enabled() || !inRecon(agent)) return { kind: 'error', text: status(agent) };
                restore(agent);
                const found = sources.full(agent.id);
                const notes = sources.notes(agent.id);
                if (found.length === 0 && notes.length === 0) return { kind: 'error', text: 'There is nothing to export: nothing was read in this conversation, and nothing the assistant wrote was kept since the app was started.' };
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
                vpn.stop();
                return { kind: 'success', text: 'Recon\'s Tor and its WireGuard tunnel are stopped and their temporary folders deleted. They start again with the next search or page.' };
              }
              // WireGuard missing or not working: the user may let this conversation connect directly (16 November).
              if (word === 'direct') {
                if (!enabled() || !inRecon(agent)) return { kind: 'error', text: status(agent) };
                directOk.add(topIdOf(agent));
                return { kind: 'success', text: 'Allowed for this conversation: when no WireGuard tunnel works, what is not Tor (the Internet Archive read directly, Usenet, the ordinary web) goes straight from this Mac, and those sites see its internet address. A working tunnel is still used first. /recon block takes this back. It holds until the app is closed.' };
              }
              if (word === 'block') {
                if (!enabled() || !inRecon(agent)) return { kind: 'error', text: status(agent) };
                directOk.delete(topIdOf(agent));
                return { kind: 'success', text: 'Blocked again: without a working WireGuard tunnel, nothing outside Tor is sent from this conversation.' };
              }
              return { kind: 'error', text: `/recon does not know "${word.slice(0, 40)}". Use /recon, /recon cloud, /recon direct, /recon block, /recon log, /recon export, /recon end or /recon stop.` };
            } catch (error) {
              return { kind: 'error', text: String(error?.message ?? error).slice(0, 300) };
            }
          },
        }),
      'recon: command',
    );
  });

  // ---- the page's data ---------------------------------------------------------------------------

  /**
   * One conversation as the Recon start page's status bar shows it: its model, where that runs,
   * and whether what Recon finds may go to it. Agreeing to a cloud model stays typed (/recon cloud).
   * @param {string} id - the conversation's id.
   */
  const conversationView = (id) => {
    let agent;
    try {
      agent = ctx.get('agents')?.get?.(id);
    } catch {
      agent = undefined;
    }
    if (!agent) return { known: false };
    const { route, place } = modelOf(agent);
    const allowed = gate(agent);
    return {
      known: true,
      recon: enabled() && inRecon(agent),
      inRoom: inRoom(agent),
      model: route?.model ?? '',
      provider: route ? place.name || route.provider : '',
      where: !route ? '' : staysHome(place) ? place.where : place.where === 'cloud' ? 'cloud' : 'unknown',
      may: allowed.ok,
      agreed: allowed.ok && Boolean(route) && !staysHome(place),
    };
  };

  /** @param {object} [options] - `light`: leave out the Keychain look-up (the start page asks often and needs no logins). */
  const view = ({ light = false } = {}) => {
    const path = torBin();
    if (path !== torSeen.path) {
      torSeen = { path, version: '' };
      if (path) void torVersion(path).then((version) => { if (torSeen.path === path) torSeen = { path, version }; });
    }
    if (!light) {
      lookForLogins();
      lookForVpns();
    }
    const accounts = usenetAccounts();
    return {
      vpn: {
        bin: wireproxyBin(),
        configs: vpnList().map((entry, index) => ({ ...entry, name: vpnNameOf(entry, index), stored: hasVpn.get(entry.id) === true, storeCommand: vpnStoreCommandFor(entry.id), removeCommand: vpnRemoveCommandFor(entry.id) })),
        status: vpn.status(),
        test: vpnTest,
      },
      more: { longChecks: plain(config?.longChecks) === true, web: plain(config?.webOn) !== false, archive: plain(config?.archiveOn) === true, archiveDirect: archiveDirect(), news: plain(config?.newsOn) === true, archiveHost: ARCHIVE, newsHost: NEWS },
      room: ROOM,
      exportFolder: exportFolder(),
      waitingToWipe: wipeList.list().length,
      usenet: {
        route: usenetRoute(),
        accounts: accounts.map((account) => ({
          ...account,
          hasLogin: hasLogin.get(account.id) === true,
          storeCommand: storeCommandFor(account.id),
          removeCommand: removeCommandFor(account.id),
        })),
        defaultAccount: usenetDefault(),
      },
      at: Date.now(),
      enabled: enabled(),
      problem,
      toolsOn: Boolean(toolsOff),
      tools: TOOLS,
      network: true,
      tor: { ...tor.status(), path, version: torSeen.version, test: torTest },
      blocklist: blocklist.info(),
      engine: { builtIn: AHMIA, other: plain(config?.otherEngine) === true, host: String(plain(config?.engineHost) ?? '') },
    };
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
                if (body?.action !== 'tor-test' && body?.action !== 'vpn-test') throw new Error('unknown action');
                if (!enabled()) throw new Error('Recon is switched off.');
                // Runs in the background; the page asks again to see how far it is.
                if (body.action === 'vpn-test') void runVpnTest();
                else void runTorTest();
              }
              // The start page's status bar names its conversation: `?session=<id>`.
              const asked = req.method === 'GET' ? String(new URL(String(req.url ?? ''), 'http://recon.invalid').searchParams.get('session') ?? '').slice(0, 200) : '';
              res.end(JSON.stringify(asked ? { ...view({ light: true }), conversation: conversationView(asked) } : view()));
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
