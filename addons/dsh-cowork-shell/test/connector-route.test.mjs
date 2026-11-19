// The "Write it for me" route and the connector list (index.js) against a stand-in app. The app home is a throwaway folder; the
// check that reads the new file is the app's own configuration dump, run in another throwaway home (skipped without the app).
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { CONNECTORS_PATH, CONNECTOR_WRITE_PATH, apply } from '../index.js';
import { dshProgram } from '../lib/connectors.js';

function standIn() {
  const home = mkdtempSync(join(tmpdir(), 'cws-connector-route-'));
  mkdirSync(join(home, 'profiles', 'desktop'), { recursive: true });
  const file = join(home, 'profiles', 'desktop', 'cordis.patch.yml');
  const routes = new Map();
  const kept = new Map();
  const credentials = {
    set: async (ref, value) => { kept.set(ref, value); },
    describe: async (ref) => ({ configured: kept.has(ref), writable: true }),
    unset: async (ref) => { kept.delete(ref); },
  };
  const loaderEntries = [];
  const services = {};
  const inner = {
    webServer: { register: (spec) => { routes.set(spec.path, spec.handler); return () => {}; } },
    connection: { requestRejection: () => undefined },
    effect: (fn) => { fn(); },
  };
  const ctx = {
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    effect: (fn) => { try { fn(); } catch { /* not part of this test */ } },
    provide: (name, value) => { services[name] = value; },
    on() {},
    get: (name) => {
      if (name === 'dshHomePath') return (...parts) => join(home, ...parts);
      if (name === 'credentials') return credentials;
      if (name === 'loader') return { entries: () => loaderEntries };
      return services[name];
    },
    inject: (deps, fn) => {
      if (deps.length === 2 && deps[0] === 'webServer' && deps[1] === 'connection') { try { fn(inner); } catch { /* another route of this add-on */ } }
    },
  };
  apply(ctx);
  const call = async (path, method, body) => {
    const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
    const req = { method, headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await routes.get(path)(req, res);
    return { status: res.statusCode, body: out ? JSON.parse(out) : null };
  };
  return { home, file, kept, loaderEntries, call, close: () => rmSync(home, { recursive: true, force: true }) };
}

const form = (extra = {}) => ({ name: 'notes', kind: 'stdio', command: 'npx', args: '-y\nnotes-server', ...extra });

test('the write route is POST only, and a bad form is answered with plain problems', async () => {
  const app = standIn();
  try {
    assert.ok(CONNECTOR_WRITE_PATH.endsWith('/connectors/write'));
    assert.equal((await app.call(CONNECTOR_WRITE_PATH, 'GET')).status, 405);
    const reply = await app.call(CONNECTOR_WRITE_PATH, 'POST', { action: 'preview', form: { name: 'no good!', kind: 'stdio', command: '' } });
    assert.equal(reply.body.ok, false);
    assert.equal(reply.body.stage, 'form');
    assert.ok(reply.body.problems.every((p) => typeof p.text === 'string' && p.text.length > 10));
    assert.equal((await app.call(CONNECTOR_WRITE_PATH, 'POST', { action: 'bogus', form: form() })).status, 400);
  } finally {
    app.close();
  }
});

test('the preview shows the exact lines and the file they go to, and writes nothing', async () => {
  const app = standIn();
  try {
    writeFileSync(app.file, '- id: budget\n');
    const reply = await app.call(CONNECTOR_WRITE_PATH, 'POST', { action: 'preview', form: form({ keyName: 'NOTES_TOKEN', keyValue: 'sk-route-SECRET' }) });
    assert.equal(reply.body.ok, true);
    assert.equal(reply.body.file, app.file);
    assert.match(reply.body.text, /- id: mcp-notes/);
    assert.match(reply.body.text, /NOTES_TOKEN: '\$\{credential:DSH_CONNECTOR_NOTES_KEY\}'/);
    assert.deepEqual(reply.body.key, { ref: 'DSH_CONNECTOR_NOTES_KEY', kept: false, typed: true });
    assert.doesNotMatch(JSON.stringify(reply.body), /SECRET/);
    assert.equal(readFileSync(app.file, 'utf8'), '- id: budget\n', 'the file is untouched');
    assert.equal(app.kept.size, 0, 'the key is not kept by a preview');
  } finally {
    app.close();
  }
});

test('write: the file, a backup and the secret store, and the connector shows as waiting for a restart', async (t) => {
  if (!dshProgram()) return t.skip('the app is not installed here');
  const app = standIn();
  try {
    const original = '# mine\n- id: budget\n  config:\n    maxTokens: !!js "1000 * 5"\n';
    writeFileSync(app.file, original);
    const shown = await app.call(CONNECTOR_WRITE_PATH, 'POST', { action: 'preview', form: form({ keyName: 'NOTES_TOKEN', keyValue: 'sk-route-SECRET' }) });
    // The lines the person looked at are the lines that are written: a changed form is refused.
    const stale = await app.call(CONNECTOR_WRITE_PATH, 'POST', { action: 'write', form: form({ command: 'other', keyName: 'NOTES_TOKEN', keyValue: 'sk-route-SECRET' }), expect: shown.body.text });
    assert.equal(stale.body.ok, false);
    assert.equal(stale.body.stage, 'changed');
    assert.equal(readFileSync(app.file, 'utf8'), original);
    const reply = await app.call(CONNECTOR_WRITE_PATH, 'POST', { action: 'write', form: form({ keyName: 'NOTES_TOKEN', keyValue: 'sk-route-SECRET' }), expect: shown.body.text });
    assert.equal(reply.body.ok, true, JSON.stringify(reply.body));
    assert.equal(reply.body.restart, true);
    assert.equal(reply.body.canRestart, false);
    assert.equal(app.kept.get('DSH_CONNECTOR_NOTES_KEY'), 'sk-route-SECRET');
    const after = readFileSync(app.file, 'utf8');
    assert.ok(after.startsWith(original));
    assert.doesNotMatch(after, /SECRET/);
    assert.doesNotMatch(JSON.stringify(reply.body), /SECRET/);
    const backups = readdirSync(join(app.home, 'backups', 'connectors'));
    assert.equal(backups.length, 1);
    assert.equal(readFileSync(join(app.home, 'backups', 'connectors', backups[0]), 'utf8'), original);
    // Written but not started: the list says so, with no secrets in it.
    const list = await app.call(CONNECTORS_PATH, 'GET');
    assert.deepEqual(list.body.waiting, ['notes']);
    assert.deepEqual(list.body.servers, []);
    // The same name again is refused, in plain words, and the file does not grow.
    const again = await app.call(CONNECTOR_WRITE_PATH, 'POST', { action: 'preview', form: form() });
    assert.equal(again.body.ok, false);
    assert.match(again.body.problems[0].text, /already a connector called "notes"/);
  } finally {
    app.close();
  }
});

test('write: a settings file with a parse error is left exactly as it is, and the answer says why', async (t) => {
  if (!dshProgram()) return t.skip('the app is not installed here');
  const app = standIn();
  try {
    const broken = '- insert:\n    - id: [broken\n';
    writeFileSync(app.file, broken);
    const reply = await app.call(CONNECTOR_WRITE_PATH, 'POST', { action: 'write', form: form() });
    assert.equal(reply.body.ok, false);
    assert.equal(reply.body.stage, 'existing-unreadable');
    assert.match(reply.body.text, /Line \d+ cannot be read/);
    assert.match(reply.body.text, /nothing was added and the file was not touched/);
    assert.equal(readFileSync(app.file, 'utf8'), broken);
    assert.equal(existsSync(join(app.home, 'backups')), false);
  } finally {
    app.close();
  }
});
