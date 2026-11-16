/**
 * WireGuard for everything Recon sends outside Tor (the owner's rule, 16 November 2026): the
 * Internet Archive's direct reads, Usenet, and the ordinary web. Recon runs `wireproxy`, a
 * WireGuard client that serves one app through a local SOCKS5 port, so the Mac's own network
 * settings are never touched. The user adds as many WireGuard configurations as they like; the
 * first is the primary, the others are backups, tried in order. Each configuration is kept in the
 * macOS Keychain and nowhere else, put there by the user with a Terminal command (the settings page
 * shows it): Recon reads it only to start wireproxy, writes it for that moment into a folder of its
 * own that only the user can open, and deletes it as soon as wireproxy has read it. It is never
 * logged, shown, or put in a setting.
 *
 * When no configuration is set up, or none of them passes traffic, nothing goes out: the tool says
 * so, and the user may allow direct connections for that one conversation (`/recon direct`).
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import net, { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The Keychain items' name; each configuration adds its id. */
export const VPN_SERVICE = 'dsh-recon-wg';
/** Where wireproxy is usually found. Plus does not install it. */
export const WIREPROXY_PLACES = ['/opt/homebrew/bin/wireproxy', '/usr/local/bin/wireproxy'];
/** The most configurations kept. */
export const VPN_MAX = 20;
/** Where a working tunnel is tried: a well-known host's HTTPS port, reached through the tunnel. */
export const CHECK_HOST = 'one.one.one.one';
const SECURITY = '/usr/bin/security';

/** @returns {string} the Keychain item of one configuration. */
export const vpnServiceOf = (id) => `${VPN_SERVICE}-${String(id ?? '')}`;
/** @returns {string} what the user types in the Terminal to keep a configuration file in the Keychain. */
// Two steps, so the file's contents never appear on a command line (where the list of running programs
// shows them): the file is copied as one base64 line, then `security` asks for it and it is pasted.
export const vpnStoreCommandFor = (id) => `base64 -i ~/PATH/TO/YOUR-FILE.conf | pbcopy && security add-generic-password -U -s ${vpnServiceOf(id)} -a wireguard -w`;
/** @returns {string} what removes it again. */
export const vpnRemoveCommandFor = (id) => `security delete-generic-password -s ${vpnServiceOf(id)}`;

/**
 * The list of configurations as kept in the settings: ids and names only, in order (the first is the primary).
 * @param {unknown} value - the setting.
 * @returns {{id: string, label: string}[]} at most VPN_MAX, without repeats.
 */
export function readVpnList(value) {
  const out = [];
  for (const entry of Array.isArray(value) ? value : []) {
    const id = String(entry?.id ?? '').trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(id) || out.some((other) => other.id === id)) continue;
    out.push({ id, label: String(entry?.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) });
    if (out.length >= VPN_MAX) break;
  }
  return out;
}

/** @returns {string} the name shown for a configuration. */
export const vpnNameOf = (entry, index = 0) => entry?.label || `WireGuard ${index + 1}`;

/**
 * @param {string} [chosen] - a path the user gave.
 * @returns {string} where wireproxy is, '' when it is not there.
 */
export function findWireproxy(chosen = '') {
  const own = String(chosen ?? '').trim();
  if (own) return existsSync(own) ? own : '';
  return WIREPROXY_PLACES.find((path) => existsSync(path)) ?? '';
}

/**
 * Whether a text looks like a WireGuard configuration: an interface with a private key and at least
 * one peer with an endpoint. Its values are never returned or shown.
 * @param {string} text - the configuration.
 * @returns {string} what is wrong, '' when it looks usable.
 */
export function wgProblem(text) {
  const body = String(text ?? '');
  if (!/^\s*\[Interface\]\s*$/im.test(body)) return 'it has no [Interface] section';
  if (!/^\s*PrivateKey\s*=\s*\S+/im.test(body)) return 'its [Interface] has no PrivateKey';
  if (!/^\s*\[Peer\]\s*$/im.test(body)) return 'it has no [Peer] section';
  if (!/^\s*Endpoint\s*=\s*\S+/im.test(body)) return 'its [Peer] has no Endpoint';
  // Names are looked up through the tunnel by its DNS server; without one they are not looked up at all.
  if (!/^\s*DNS\s*=\s*\S+/im.test(body)) return 'its [Interface] has no DNS line, so no name could be looked up through the tunnel';
  return '';
}

/**
 * The configuration as the Keychain gives it back: the file's text, base64 as the store command
 * puts it there (a plain text is taken too).
 * @param {string} stored - the Keychain item's value.
 * @returns {string} the configuration's text.
 */
export function decodeStored(stored) {
  const raw = String(stored ?? '').trim();
  if (/^[A-Za-z0-9+/=\s]+$/.test(raw) && !/\[Interface\]/i.test(raw)) {
    try {
      return Buffer.from(raw.replace(/\s+/g, ''), 'base64').toString('utf8');
    } catch {
      return '';
    }
  }
  return raw;
}

/** wireproxy's own configuration: the WireGuard file, and a SOCKS5 port on this Mac only. */
export const wireproxyConfig = ({ wgPath, port }) => `WGConfig = ${wgPath}\n\n[Socks5]\nBindAddress = 127.0.0.1:${Number(port)}\n`;

/** Read one configuration from the Keychain: its text, or '' when there is none. */
function readKeychain(service) {
  return new Promise((resolve) => {
    execFile(SECURITY, ['find-generic-password', '-s', service, '-w'], { timeout: 15_000, env: { PATH: '/usr/bin:/bin', LANG: 'C' }, maxBuffer: 200_000 }, (error, stdout) => {
      resolve(error ? '' : String(stdout ?? '').replace(/\r?\n$/, ''));
    });
  });
}

/** @returns {Promise<boolean>} whether a configuration is in the Keychain (its value is not read). */
export function vpnStored(id) {
  return new Promise((resolve) => {
    execFile(SECURITY, ['find-generic-password', '-s', vpnServiceOf(id)], { timeout: 15_000, env: { PATH: '/usr/bin:/bin', LANG: 'C' } }, (error) => resolve(!error));
  });
}

/** A port on this Mac that nobody is using right now. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

/**
 * Open a connection to `host:port` through a SOCKS5 proxy on this Mac, the name looked up on the far
 * side (no name is ever looked up on this Mac).
 * @param {number} proxyPort - the proxy's local port.
 * @param {string} host - where to.
 * @param {number} port - its port.
 * @param {number} [timeoutMs] - how long to wait.
 * @returns {Promise<import('node:net').Socket>} the connection, ready to use.
 */
export function socksConnect(proxyPort, host, port, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    const name = Buffer.from(String(host));
    if (name.length < 1 || name.length > 255) {
      reject(new Error('the address is not usable'));
      return;
    }
    const socket = net.connect({ host: '127.0.0.1', port: proxyPort });
    let stage = 'hello';
    let got = Buffer.alloc(0);
    const fail = (why) => {
      clearTimeout(timer);
      socket.destroy();
      reject(new Error(why));
    };
    const timer = setTimeout(() => fail('the tunnel did not answer in time'), timeoutMs);
    socket.on('error', (error) => fail(`the tunnel could not be reached (${error.code ?? error.message})`));
    socket.on('connect', () => socket.write(Buffer.from([5, 1, 0])));
    const onData = (chunk) => {
      got = Buffer.concat([got, chunk]);
      if (stage === 'hello') {
        if (got.length < 2) return;
        if (got[0] !== 5 || got[1] !== 0) return fail('the tunnel refused the connection');
        got = got.subarray(2);
        stage = 'connect';
        socket.write(Buffer.concat([Buffer.from([5, 1, 0, 3, name.length]), name, Buffer.from([port >> 8, port & 255])]));
      }
      if (stage === 'connect') {
        if (got.length < 5) return;
        if (got[1] !== 0) return fail(`the tunnel could not reach ${host} (code ${got[1]})`);
        const kind = got[3];
        const size = kind === 1 ? 4 : kind === 4 ? 16 : kind === 3 ? 1 + got[4] : 0;
        if (got.length < 4 + size + 2) return;
        clearTimeout(timer);
        socket.removeListener('data', onData);
        const rest = got.subarray(4 + size + 2);
        if (rest.length > 0) socket.unshift(rest);
        resolve(socket);
      }
    };
    socket.on('data', onData);
  });
}

/**
 * The tunnel: wireproxy started with the first configuration that passes traffic, kept running
 * while Recon uses it.
 * @param {object} deps - `list()` (readVpnList), `bin()` (wireproxy's path), `read(service)` (the Keychain;
 *   a stand-in in tests), `check(port)` (does traffic pass; a stand-in in tests), `startMs`, `warn`.
 * @returns {object} `start()`, `stop()`, `status()`.
 */
export function createVpn({ list, bin, read = readKeychain, check, startMs = 20_000, recheckMs = 60_000, warn = () => {} }) {
  /** @type {{state: string, name: string, port: number, tried: {name: string, why: string}[], at: number}} */
  let status = { state: 'off', name: '', port: 0, tried: [], at: 0 };
  let child;
  let folder = '';
  let starting;
  const tidy = () => {
    if (child) {
      try {
        child.kill('SIGTERM');
      } catch {
        /* already gone */
      }
    }
    child = undefined;
    if (folder) rmSync(folder, { recursive: true, force: true });
    folder = '';
  };
  const passes = check ?? ((port) => socksConnect(port, CHECK_HOST, 443, 15_000).then((socket) => { socket.destroy(); return true; }, () => false));
  /** Start one configuration; resolves with '' when it passes traffic, else why not. */
  const tryOne = async (entry, index, program) => {
    const text = decodeStored(await read(vpnServiceOf(entry.id)));
    if (!text) return 'it is not in the Keychain (Settings → Recon → WireGuard shows the command)';
    const problem = wgProblem(text);
    if (problem) return `it is not a usable WireGuard configuration: ${problem}`;
    const port = await freePort();
    folder = mkdtempSync(join(tmpdir(), 'dsh-recon-wg-'));
    const wgPath = join(folder, 'wg.conf');
    const own = join(folder, 'wireproxy.conf');
    writeFileSync(wgPath, text, { mode: 0o600 });
    writeFileSync(own, wireproxyConfig({ wgPath, port }), { mode: 0o600 });
    let ended = '';
    child = spawn(program, ['-c', own], { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, stdio: ['ignore', 'ignore', 'pipe'] });
    // wireproxy's own messages are not kept: one about a bad key repeats the key (review, 16 November).
    child.stderr?.on('data', () => {});
    child.on('exit', (code) => { ended = `wireproxy stopped (${code ?? 'signal'})`; });
    child.on('error', (error) => { ended = `wireproxy could not start (${error.code ?? error.message})`; });
    // Its port opens once it has read the files; then they go.
    const until = Date.now() + startMs;
    let open = false;
    while (!open && !ended && Date.now() < until) {
      open = await new Promise((resolve) => {
        const probe = net.connect({ host: '127.0.0.1', port }, () => { probe.destroy(); resolve(true); });
        probe.on('error', () => resolve(false));
      });
      if (!open) await new Promise((resolve) => setTimeout(resolve, 200));
    }
    rmSync(wgPath, { force: true });
    rmSync(own, { force: true });
    if (!open) {
      const why = ended || 'wireproxy did not open its port in time';
      tidy();
      return `${why}; check that the file is the one your VPN provider gave you`;
    }
    if (!(await passes(port))) {
      tidy();
      return 'its tunnel passes no traffic (the server did not answer)';
    }
    status = { state: 'ready', id: entry.id, name: vpnNameOf(entry, index), port, tried: status.tried, at: Date.now() };
    checkedAt = Date.now();
    child.on('exit', () => {
      if (status.port === port) status = { ...status, state: 'stopped', port: 0 };
    });
    return '';
  };
  /** When the running tunnel was last seen to pass traffic. */
  let checkedAt = 0;
  const start = async () => {
    // A running tunnel is used while it passes traffic and its configuration is still the first that may run;
    // checked again a minute after the last check, else the configurations are tried again in order.
    if (status.state === 'ready' && child && child.exitCode === null) {
      const configs = list();
      const first = configs.find((entry) => !status.tried.some((one) => one.id === entry.id));
      const same = first?.id === status.id;
      if (same && Date.now() - checkedAt < recheckMs) return { ok: true, port: status.port, name: status.name };
      if (same && (await passes(status.port))) {
        checkedAt = Date.now();
        return { ok: true, port: status.port, name: status.name };
      }
    }
    if (starting) return starting;
    starting = (async () => {
      tidy();
      const configs = list();
      const program = bin();
      status = { state: 'starting', name: '', port: 0, tried: [], at: Date.now() };
      if (configs.length === 0) {
        status = { ...status, state: 'none' };
        return { ok: false, why: 'No WireGuard configuration is set up (Settings → Recon → WireGuard).' };
      }
      if (!program) {
        status = { ...status, state: 'failed' };
        return { ok: false, why: 'The wireproxy program was not found, so no WireGuard tunnel can be started (Settings → Recon → WireGuard).' };
      }
      for (const [index, entry] of configs.entries()) {
        let why;
        try {
          why = await tryOne(entry, index, program);
        } catch (error) {
          tidy();
          why = String(error?.message ?? error).slice(0, 200);
        }
        if (!why) return { ok: true, port: status.port, name: status.name };
        status.tried.push({ id: entry.id, name: vpnNameOf(entry, index), why });
        warn(`WireGuard ${vpnNameOf(entry, index)}: ${why}`);
      }
      status = { ...status, state: 'failed' };
      return { ok: false, why: `No WireGuard configuration works: ${status.tried.map((entry) => `${entry.name}: ${entry.why}`).join('; ')}.` };
    })().finally(() => {
      starting = undefined;
    });
    return starting;
  };
  return {
    start,
    stop() {
      tidy();
      status = { state: 'off', name: '', port: 0, tried: [], at: Date.now() };
    },
    status: () => ({ ...status, tried: [...status.tried] }),
  };
}
