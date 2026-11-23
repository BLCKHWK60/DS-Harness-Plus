/**
 * Item 4A, stage 6a (belt, as Search and Sync): the Export route never sends a Recon conversation, also when Modes
 * cannot see it (a closed thread whose space and mark writes both failed) and when Modes fails. Stand-ins only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { EXPORT_PATH, apply, keptApart } from '../index.js';

const ROOM = '/tmp/dsh-recon-room-stand-in';
const events = (cwd) => [
  { type: 'session', version: 4, id: 's1', createdAt: 1794810515219, cwd, agentPreset: 'standard' },
  { type: 'user/message', seq: 1, time: 1794810515302, data: { message: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'SECRET ROOM TEXT' }] } } },
];

function standIn({ modes, modesSettings, recon, cwd = '/tmp/work' } = {}) {
  const routes = {};
  const services = {
    ...(modes === undefined ? {} : { modes }),
    ...(recon === undefined ? {} : { recon }),
    settings: { describe: () => (modesSettings === undefined ? [] : [{ ns: 'modes', value: modesSettings }]) },
    sessionQuery: { readSession: async () => ({ events: events(cwd) }) },
  };
  const ctx = {
    get: (name) => {
      const value = services[name];
      if (value instanceof Error) throw value;
      return value;
    },
    inject: (_names, use) => use({ webServer: { register: ({ path, handler }) => { routes[path] = handler; return () => {}; } }, connection: { requestRejection: () => undefined }, effect: (make) => make() }),
  };
  apply(ctx, { enabled: true, exportButton: true }, { plusDir: '/nonexistent', appVersion: '0.0.0' });
  const get = (query) => new Promise((resolve) => {
    const res = { statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(body) { resolve({ status: this.statusCode, body: String(body ?? '') }); } };
    routes[EXPORT_PATH]({ method: 'GET', url: `${EXPORT_PATH}?${query}`, headers: {} }, res);
  });
  return { get };
}

const recon = { isRoom: (folder) => String(folder).startsWith(ROOM) };

test('export-apart: a closed Recon-room thread that Modes cannot see is refused (stored folder is the room)', async () => {
  const app = standIn({ modes: { isolated: () => false }, modesSettings: {}, recon, cwd: ROOM });
  const answer = await app.get('session=s1&level=full');
  assert.equal(answer.status, 403);
  assert.doesNotMatch(answer.body, /SECRET ROOM TEXT/);
});

test('export-apart: Modes settings marks (sessionIsolated, sessionSpaces recon) refuse, also without the Modes service', async () => {
  for (const modesSettings of [{ sessionIsolated: '{"s1":true}' }, { sessionSpaces: '{"s1":"recon"}' }]) {
    for (const modes of [{ isolated: () => false }, undefined]) {
      const answer = await standIn({ modes, modesSettings }).get('session=s1&level=full');
      assert.equal(answer.status, 403, JSON.stringify(modesSettings));
    }
  }
});

test('export-apart: a Modes that throws (service or answer) refuses; an ordinary thread exports as before', async () => {
  assert.equal((await standIn({ modes: new Error('no modes') }).get('session=s1&level=full')).status, 403);
  assert.equal((await standIn({ modes: { isolated: () => { throw new Error('x'); } } }).get('session=s1&level=full')).status, 403);
  const ok = await standIn({ modes: { isolated: () => false }, modesSettings: { sessionSpaces: '{"s1":"chat"}' }, recon }).get('session=s1&level=full');
  assert.equal(ok.status, 200);
  assert.match(ok.body, /SECRET ROOM TEXT/);
  // A Recon that throws is no reason on its own.
  assert.equal(keptApart({ modes: () => undefined, modesSettings: () => ({}), recon: () => { throw new Error('x'); } }, 's1', ROOM), false);
});
