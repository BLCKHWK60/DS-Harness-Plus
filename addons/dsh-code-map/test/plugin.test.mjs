import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { ACTION_HEADER, ACTION_PATH, apply, buildTools, HINT, readLimits, STATUS_PATH } from '../index.js';
import { createManager } from '../lib/manager.js';
import { SKILLS } from '../skills.js';

/** @param {Record<string, string>} files @returns {string} a throwaway folder. */
function project(files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-plugin-')));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

const FILES = {
  'package.json': '{"name":"p"}',
  'src/a.js': "import { b } from './b.js';\nexport function a() {\n  return b();\n}\n",
  'src/b.js': 'export function b() {\n  return 1;\n}\n',
};

/**
 * A stand-in for the app: records what the add-on registers.
 * @param {object} options - folders and switches.
 * @returns {object} the fake context and what was registered.
 */
function fakeApp({ home, folder, rejection, config = {} }) {
  const seen = { tools: [], routes: new Map(), commands: [], skills: [], sections: [], listeners: {}, warnings: [], provided: {} };
  const agent = {
    id: 'agent-1',
    header: { cwd: folder },
    ctx: {
      effect: (fn) => fn(),
      systemPrompt: {
        section(section) {
          seen.sections.push(section);
          return () => {};
        },
      },
    },
  };
  const services = {
    dshHomePath: (name) => join(home, name),
    workingDirectory: { defaultDirectory: folder, ensure: async () => folder },
    skills: { register: (skill) => seen.skills.push(skill) },
    agents: { list: () => [agent] },
  };
  const inner = {
    effect: (fn) => fn(),
    webServer: { register: (route) => seen.routes.set(route.path, route) },
    connection: { requestRejection: () => rejection },
    commands: { register: (command) => seen.commands.push(command) },
  };
  const ctx = {
    get: (name) => services[name],
    logger: { warn: (message) => seen.warnings.push(message), info: () => {} },
    tools: { register: (tool) => seen.tools.push(tool) },
    effect: (fn) => fn(),
    provide: (name, value) => {
      seen.provided[name] = value;
    },
    on: (event, handler) => {
      seen.listeners[event] = handler;
    },
    inject: (_names, callback) => callback(inner),
  };
  apply(ctx, { enabled: true, promptHint: true, maxFiles: 5000, maxFileKb: 400, extraIgnore: '', dataDir: '', commandName: 'codemap', skills: true, ...config });
  return { seen, agent };
}

/**
 * Call a registered route the way the app's web server would.
 * @param {object} route - the registered route.
 * @param {object} request - method, headers and an optional JSON body.
 * @returns {Promise<{status: number, body: any, headers: object}>} the answer.
 */
async function call(route, { method = 'GET', headers = {}, body } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.headers = headers;
  req.url = route.path;
  const res = { statusCode: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; } };
  const done = new Promise((resolve) => {
    res.end = (text) => resolve(text);
  });
  const running = route.handler(req, res);
  if (method === 'POST') {
    setImmediate(() => {
      if (body !== undefined) req.emit('data', Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)));
      req.emit('end');
    });
  }
  const text = await done;
  await running;
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  return { status: res.statusCode, body: parsed, headers: res.headers };
}

test('limits are clamped to safe ranges', () => {
  assert.deepEqual(readLimits({ maxFiles: 9e9, maxFileKb: 1, extraIgnore: 'docs/' }), { maxFiles: 50000, maxFileBytes: 16 * 1024, extraIgnore: 'docs/' });
  assert.deepEqual(readLimits({}), { maxFiles: 5000, maxFileBytes: 400 * 1024, extraIgnore: '' });
});

test('the five tools answer from the map of the calling conversation only', async () => {
  const root = project(FILES);
  const data = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-data-')));
  const manager = createManager({ dataDir: data });
  let on = true;
  const tools = buildTools({ manager, folderOf: async () => root, enabled: () => on });
  assert.deepEqual(tools.map((tool) => tool.name), ['code_map_overview', 'code_map_file', 'code_map_find', 'code_map_related', 'code_map_read']);
  const run = (name, args) => tools.find((tool) => tool.name === name).execute(args, { agent: {} });
  assert.match((await run('code_map_overview', {})).text, /Code map of code-map-plugin-\w+: 3 files/);
  assert.match((await run('code_map_file', { path: 'src/a.js' })).text, /Uses \(local\): src\/b\.js/);
  assert.match((await run('code_map_find', { query: 'b' + 'x' })).text, /Nothing in the map/);
  assert.match((await run('code_map_related', { target: 'src/b.js' })).text, /directly \(1\): src\/a\.js/);
  assert.match((await run('code_map_read', { path: 'src/b.js', symbol: 'b' })).text, /function b {2}L1-3 of 4/);
  assert.match((await run('code_map_read', { path: '../../../etc/passwd' })).text, /inside the project/);
  assert.match((await run('code_map_read', { path: join(homedir(), '.ssh/id_rsa') })).text, /inside the project/);
  // Each answer is rendered as plain text, and each tool is safe to run beside others.
  for (const tool of tools) {
    assert.equal(tool.isConcurrencySafe(), true);
    assert.deepEqual(tool.output.render({}, { text: 'x' }), [{ type: 'text', text: 'x' }]);
    assert.equal(tool.parameters.additionalProperties, false);
    assert.ok(tool.description.length < 160, `${tool.name} description is short`);
  }
  on = false;
  assert.match((await run('code_map_overview', {})).text, /switched off/);
  on = true;
  // A broad or missing folder gets a plain refusal, not a crash.
  const broad = buildTools({ manager, folderOf: async () => homedir(), enabled: () => true });
  assert.match((await broad[0].execute({}, {})).text, /too broad.*read and grep/);
  const failing = buildTools({ manager, folderOf: async () => { throw new Error('no agent'); }, enabled: () => true });
  assert.match((await failing[0].execute({}, {})).text, /no folder to map/);
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

test('the tool descriptions stay small, because they are sent with every request', () => {
  const tools = buildTools({ manager: {}, folderOf: async () => '', enabled: () => true });
  const sent = JSON.stringify(tools.map((tool) => ({ name: tool.name, description: tool.description, parameters: tool.parameters })));
  assert.ok(sent.length < 3000, `tool definitions are ${sent.length} characters`);
  assert.ok(HINT.length < 520, `the hint is ${HINT.length} characters`);
});

test('the add-on registers tools, skills, a command, a hint and two fenced routes', async () => {
  const root = project(FILES);
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-home-')));
  const { seen, agent } = fakeApp({ home, folder: root });
  assert.equal(seen.tools.length, 5);
  assert.deepEqual(seen.skills.map((skill) => skill.name), ['reverse-codebase', 'reverse-website', 'reverse-api-format', 'reverse-app-binary']);
  assert.ok(seen.skills.every((skill) => skill.invocation.modelInvocable && skill.invocation.userInvocable && skill.source === 'custom'));
  assert.equal(seen.commands[0].name, 'codemap');
  assert.deepEqual([...seen.routes.keys()].sort(), [ACTION_PATH, STATUS_PATH]);
  assert.equal(seen.provided.codeMap.apiVersion, 1);
  // The hint shows only in a code project, and is a few lines.
  const section = seen.sections[0];
  assert.equal(section.name, 'code-map');
  assert.equal(section.interpolate, false);
  assert.equal(section.text(), HINT);
  // An agent/created listener never throws, whatever it is handed.
  assert.doesNotThrow(() => seen.listeners['agent/created']({ agent: null }));
  assert.doesNotThrow(() => seen.listeners['agent/created']({ agent: { id: 'x', ctx: { effect: () => { throw new Error('boom'); }, systemPrompt: {} } } }));
  assert.doesNotThrow(() => seen.listeners['agent/disposed']({ agent }));

  // The command: status before and after a build, then clear.
  const command = seen.commands[0].handler;
  assert.match((await command({ agent, rawInput: '' })).text, /has no code map yet/);
  const built = await command({ agent, rawInput: 'build' });
  assert.equal(built.kind, 'success');
  assert.match(built.text, /3 files, \d+ symbols/);
  assert.equal((await command({ agent, rawInput: 'nonsense' })).kind, 'error');

  // Status route: GET only, numbers only.
  const status = await call(seen.routes.get(STATUS_PATH));
  assert.equal(status.status, 200);
  assert.equal(status.headers['cache-control'], 'no-store');
  assert.equal(status.body.enabled, true);
  assert.equal(status.body.folders.length, 1);
  assert.equal(status.body.folders[0].folder, root);
  assert.equal(status.body.defaultFolder.id, status.body.folders[0].id);
  assert.ok(!JSON.stringify(status.body).includes('return b()'), 'no file content leaves through the status route');
  assert.equal((await call(seen.routes.get(STATUS_PATH), { method: 'POST' })).status, 405);

  // Action route: POST only, needs the header, a JSON body and a known folder id.
  const action = seen.routes.get(ACTION_PATH);
  const id = status.body.folders[0].id;
  const good = { [ACTION_HEADER]: '1', 'content-type': 'application/json' };
  assert.equal((await call(action, { method: 'GET' })).status, 405);
  assert.equal((await call(action, { method: 'POST', headers: { 'content-type': 'application/json' }, body: { action: 'clear', id } })).status, 400);
  assert.equal((await call(action, { method: 'POST', headers: { [ACTION_HEADER]: '1', 'content-type': 'text/plain' }, body: { action: 'clear', id } })).status, 400);
  assert.equal((await call(action, { method: 'POST', headers: good, body: 'not json' })).status, 400);
  assert.equal((await call(action, { method: 'POST', headers: good, body: { action: 'format-disk', id } })).status, 400);
  assert.equal((await call(action, { method: 'POST', headers: good, body: { action: 'rebuild', id: '../../../etc' } })).status, 400);
  assert.equal((await call(action, { method: 'POST', headers: good, body: { action: 'rebuild', id: '0123456789abcdef' } })).status, 404);
  assert.equal((await call(action, { method: 'POST', headers: good, body: { action: 'rebuild', id, padding: 'x'.repeat(5000) } })).status, 400);
  const rebuilt = await call(action, { method: 'POST', headers: good, body: { action: 'rebuild', id } });
  assert.equal(rebuilt.status, 200);
  assert.equal(rebuilt.body.folders[0].files, 3);
  const cleared = await call(action, { method: 'POST', headers: good, body: { action: 'clear', id } });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.folders.length, 0);
  assert.match((await command({ agent, rawInput: 'clear' })).text, /no code map yet/);
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test('the routes refuse a request the app refuses, before doing anything', async () => {
  const root = project(FILES);
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-home-')));
  const { seen } = fakeApp({ home, folder: root, rejection: 401 });
  assert.equal((await call(seen.routes.get(STATUS_PATH))).status, 401);
  assert.equal((await call(seen.routes.get(ACTION_PATH), { method: 'POST', headers: { [ACTION_HEADER]: '1', 'content-type': 'application/json' }, body: { action: 'clear', id: '0123456789abcdef' } })).status, 401);
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test('switched off: tools say so, the hint is empty, a rebuild is refused', async () => {
  const root = project(FILES);
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-home-')));
  const { seen, agent } = fakeApp({ home, folder: root, config: { enabled: false, skills: false, commandName: '' } });
  assert.equal(seen.skills.length, 0);
  assert.equal(seen.commands.length, 0);
  assert.equal(seen.sections[0].text(), '');
  assert.match((await seen.tools[0].execute({}, { agent })).text, /switched off/);
  const status = await call(seen.routes.get(STATUS_PATH));
  const answer = await call(seen.routes.get(ACTION_PATH), { method: 'POST', headers: { [ACTION_HEADER]: '1', 'content-type': 'application/json' }, body: { action: 'rebuild', id: status.body.defaultFolder.id } });
  assert.equal(answer.status, 409);
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test('the hint is silent outside a code project', () => {
  const root = project({ 'notes.txt': 'hello' });
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-home-')));
  const { seen } = fakeApp({ home, folder: root });
  assert.equal(seen.sections[0].text(), '');
  rmSync(root, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

test('the skills are well formed, short, and the app skill states what it will not do', () => {
  for (const skill of SKILLS) {
    assert.match(skill.name, /^[a-z][a-z0-9-]*$/);
    assert.ok(skill.description.length > 40 && skill.description.length < 260);
    const words = skill.content.split(/\s+/).length;
    assert.ok(words < 1000, `${skill.name} has ${words} words`);
    assert.match(skill.content, /What I could not determine/);
    assert.match(skill.content, /read-only/i);
  }
  const app = SKILLS.find((skill) => skill.name === 'reverse-app-binary').content;
  for (const word of ['licence checks', 'DRM', 'copy protection', 'code signing', 'anti-tamper', 'credentials', 'cracks', 'key generators']) {
    assert.ok(app.includes(word), `the app skill names ${word}`);
  }
  assert.match(app, /does \*\*not\*\*/);
  const site = SKILLS.find((skill) => skill.name === 'reverse-website').content;
  assert.match(site, /robots\.txt/);
  assert.match(site, /No login bypass/);
  const api = SKILLS.find((skill) => skill.name === 'reverse-api-format').content;
  assert.match(api, /<TOKEN>/);
  assert.match(SKILLS.find((skill) => skill.name === 'reverse-codebase').content, /code_map_overview/);
});

test('nothing user-specific ships in the add-on', () => {
  const here = new URL('..', import.meta.url);
  const patch = readFileSync(new URL('cordis.patch.yml', here), 'utf8');
  assert.doesNotMatch(patch, /\/Users\/|localhost|127\.0\.0\.1/);
  for (const file of ['index.js', 'client.js', 'skills.js', 'lib/manager.js', 'lib/scan.js']) {
    assert.doesNotMatch(readFileSync(new URL(file, here), 'utf8'), /\/Users\/[a-z]/);
  }
});
