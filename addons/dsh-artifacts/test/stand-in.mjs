/**
 * A stand-in app for Artifacts' tests: Modes (r1 is Recon), the tools hooks, the app's trash shaped like the
 * Cowork sidebar's real one (rows with their pieces; nothing listed while it is not up), the route, and
 * real files in throwaway folders.
 */
import { mkdirSync, mkdtempSync, realpathSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';

export const folder = () => realpathSync(mkdtempSync(join(tmpdir(), 'artifacts-test-')));
let clock = Date.now() / 1000;
/** Write a file whose time moves on with each write (so "changed during the call" is clear). */
export const write = (path, text) => { mkdirSync(join(path, '..'), { recursive: true }); writeFileSync(path, text); clock += 5; utimesSync(path, clock, clock); };

/**
 * @param {string} home - Artifacts' folder.
 * @param {string} work - the conversations' folder.
 * @param {{modes?: boolean, outputRoots?: string[], config?: object}} [options] - `modes: false`: Modes is off.
 */
export function standIn(home, work, { modes = true, outputRoots = [], config = {} } = {}) {
  const routes = new Map();
  const hooks = {};
  const trashed = [];
  const rows = [];
  /** The trash: `ready` (up or not), `gate` (a promise an add waits for). */
  const trash = { ready: true, gate: null };
  /** Recon's wipe list as the Recon add-on offers it (review B2): ids waiting, and who wants to hear of changes. */
  const wipe = { ids: [], listeners: new Set() };
  let owner;
  let tidy = () => {};
  const ctx = {
    get: (name) => (name === 'modes' ? (modes ? { get: (id) => ({ c1: 'code', r1: 'recon' })[id] ?? 'chat', isolated: (id) => id === 'r1' } : undefined)
      : name === 'workingDirectory' ? { get: () => work }
        : name === 'reconWipe' ? { has: (id) => wipe.ids.includes(id), list: () => [...wipe.ids], onChange: (fn) => { wipe.listeners.add(fn); return () => wipe.listeners.delete(fn); } } : undefined),
    on: (name, fn) => { hooks[name] = fn; },
    effect: (fn) => fn(),
    inject(names, fn) {
      if (names.includes('coworkTrash')) {
        fn({
          effect: (register) => register(),
          coworkTrash: {
            ready: () => trash.ready,
            register: (spec) => {
              owner = spec;
              return {
                add: async (request) => {
                  if (trash.gate) await trash.gate;
                  trashed.push(request);
                  rows.push({ row: `group.artifacts.${request.key}`, key: request.key, title: request.title, tab: request.tab, members: [], data: [{ item: `piece-${trashed.length}`, deletedAt: Date.now(), ownerData: request.data.ownerData }] });
                },
                items: () => (trash.ready ? rows : []),
                dispose() {},
              };
            },
            onErased: () => () => {},
          },
        });
        return;
      }
      fn({ effect: (register) => register(), webServer: { register: (route) => routes.set(route.path, route) }, connection: { requestRejection: () => undefined } });
    },
    logger: { warn() {} },
  };
  const opened = [];
  const revealed = [];
  apply(ctx, { enabled: true, ...config }, { home, userHome: '/Users/nobody', outputRoots, open: async (path) => { opened.push(path); }, reveal: async (path) => { revealed.push(path); }, tidy: (fn) => { tidy = fn; } });
  const run = async (who, name, args, effect, text = 'ok') => {
    const exec = { agent: { id: who, session: { header: { id: who } } }, name, arguments: args, callId: `${who}-${Math.random()}` };
    await hooks['tools/pre-execute'](exec, async () => ({ kind: 'allow' }));
    effect?.();
    await hooks['tools/post-execute'](exec, { content: [{ type: 'text', text }] }, async () => ({ kind: 'accept' }));
  };
  const wipeSession = (id) => { wipe.ids.push(id); for (const fn of wipe.listeners) fn(id, 'add'); };
  return { routes, run, trashed, rows, trash, wipeSession, opened, revealed, owner: () => owner, tidy: () => tidy() };
}

/** Ask the route as the page would. */
export async function hit(routes, { method = 'GET', query = '', body } = {}) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = { method, url: `${DATA_PATH}${query}`, async *[Symbol.asyncIterator]() { yield* chunks; } };
  const headers = {};
  const parts = [];
  const res = { statusCode: 200, setHeader(key, value) { headers[key.toLowerCase()] = value; }, write(chunk) { parts.push(Buffer.from(chunk)); return true; }, end(value) { if (value) parts.push(Buffer.from(value)); this.done?.(); }, on() { return this; }, once() { return this; }, emit() { return true; } };
  const finished = new Promise((done) => { res.done = done; });
  await routes.get(DATA_PATH).handler(req, res);
  if (headers['content-type'] === 'application/octet-stream') await new Promise((done) => setTimeout(done, 50));
  else await finished;
  const text = Buffer.concat(parts).toString('utf8');
  return { status: res.statusCode, headers, text, data: headers['content-type']?.startsWith('application/json') && text ? JSON.parse(text) : null };
}
