import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, checkRemote, resolveSettings } from '../index.mjs';
import { mirrorSessionRoot, restoreSessionRoot } from '../lib/mirror.mjs';
import { mapPath, checkFolderMap } from '../lib/projects.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'dsh-sync-'));
const git = (dir, ...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' } });

/** A bare repository as the hub. */
function makeRemote() {
  const dir = tmp();
  execFileSync('git', ['init', '--bare', '-b', 'main', dir], { stdio: 'ignore' });
  return dir;
}

/** A shim `age` that is NOT encryption (reversible, marked) so the code paths run without the real tool. */
function makeAgeShim() {
  const dir = tmp();
  const file = join(dir, 'age');
  writeFileSync(file, `#!/bin/sh
case "$1" in
  --version) echo "age-shim"; exit 0 ;;
  -r) recipient=$2; out=$4; in=$5
      { printf 'AGE-SHIM-FOR:%s\\n' "$recipient"; base64 < "$in"; } > "$out"; exit 0 ;;
  -d) identity=$3; out=$5; in=$6
      [ -f "$identity" ] || exit 3
      tail -n +2 "$in" | base64 -d > "$out"; exit 0 ;;
esac
exit 2
`);
  chmodSync(file, 0o755);
  return file;
}

/**
 * One "machine": own dsh home, a fake ctx, and the registered command. The Modes add-on's settings are there unless
 * `modes: false`; `isolated` lists the conversations it marked isolated, `open` the ones open in the app (with
 * `modes.isolated` answering for them), `stored` the stored headers (`sessionPersistence.list`).
 */
function device(config, { registry, modes = true, isolated = [], open = {}, stored, sessionModes = {}, late = [] } = {}) {
  const home = config.home ?? tmp();
  mkdirSync(join(home, 'sessions'), { recursive: true });
  const commands = {};
  const provided = {};
  const listeners = {};
  const modesValue = { sessionIsolated: JSON.stringify(Object.fromEntries(isolated.map((id) => [id, true]))), sessionModes: JSON.stringify(sessionModes), extraModes: JSON.stringify({ recon: { label: 'Recon', isolated: true } }) };
  const services = {
    settings: { describe: () => (modes ? [{ ns: 'modes', value: modesValue }] : []) },
    // `late` lists the conversations Modes holds in its late lock (moved into an isolated tab after they ran).
    modes: modes ? { isolated: (id) => open[id] === true, get: (id) => (late.includes(id) ? 'isolated-late' : 'recon') } : undefined,
    agents: { list: () => Object.keys(open).map((id) => ({ id })) },
    sessionPersistence: stored ? { list: async () => (typeof stored === 'function' ? stored() : stored) } : undefined,
  };
  /** Mark a conversation isolated, as Modes does when it begins in Recon. */
  const isolate = (id) => { modesValue.sessionIsolated = JSON.stringify({ ...JSON.parse(modesValue.sessionIsolated), [id]: true }); };
  const ctx = {
    get: (key) => (key === 'dshHomePath' ? (sub) => join(home, sub) : key === 'workspaceRegistry' ? registry : key in services ? services[key] : provided[key]),
    effect: (fn) => fn(),
    provide: (key, value) => { provided[key] = value; },
    on: (event, fn) => { (listeners[event] ??= []).push(fn); },
    inject: (_k, fn) => fn({ effect: (f) => f(), commands: { register: (spec) => { commands[spec.name] = spec; } } }),
  };
  const { home: _ignore, ...rest } = config;
  apply(ctx, rest);
  const run = async (text) => commands.sync.handler({ rawInput: text });
  const sessions = join(home, 'sessions');
  const put = (rel, text) => { const f = join(sessions, ...rel.split('/')); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, text); };
  const add = (rel, text) => appendFileSync(join(sessions, ...rel.split('/')), text);
  const read = (rel) => readFileSync(join(sessions, ...rel.split('/')), 'utf8');
  const has = (rel) => existsSync(join(sessions, ...rel.split('/')));
  return { home, sessions, run, put, add, read, has, provided, listeners, commands, isolate, repo: join(home, 'sync', 'repo') };
}
const plainCfg = (remote, extra = {}) => ({ remote, ...extra });
const walk = (dir, base = dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '.git' ? [] : walk(join(dir, e.name), base)) : [join(dir, e.name).slice(base.length + 1)]));

test('an absolute folder path with spaces (iCloud Drive) is a valid remote; a URL with spaces is not', () => {
  const icloud = '/Users/someone/Library/Mobile Documents/com~apple~CloudDocs/dsh-sync.git';
  assert.equal(checkRemote(icloud), icloud);
  assert.throws(() => checkRemote('https://example.com/a b.git'), /spaces/);
  assert.throws(() => checkRemote('/tmp/a\nb'), /spaces/);
});

test('plaintext git through a remote folder whose path has spaces', async () => {
  const parent = join(tmp(), 'Mobile Documents');
  mkdirSync(parent);
  const remote = join(parent, 'hub.git');
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' });
  const a = device(plainCfg(remote));
  const b = device(plainCfg(remote));
  a.put('p/s/session.jsonl', 'hello\n');
  assert.equal((await a.run('push')).kind, 'success');
  assert.equal((await b.run('pull')).kind, 'success');
  assert.equal(b.read('p/s/session.jsonl'), 'hello\n');
});

test('checkRemote and resolveSettings refuse unsafe values', () => {
  assert.equal(checkRemote(''), '');
  assert.equal(checkRemote('git@host:me/repo.git'), 'git@host:me/repo.git');
  assert.equal(checkRemote('/some/bare/repo.git'), '/some/bare/repo.git');
  assert.equal(checkRemote('https://host/me/repo.git'), 'https://host/me/repo.git');
  for (const bad of ['--upload-pack=x', 'ext::sh -c evil', 'https://user:pw@host/r.git', 'https://token@host/r.git', 'ftp://host/r', 'a b', 'fd::3']) assert.throws(() => checkRemote(bad), undefined, bad);
  const home = (s) => `/h/${s}`;
  assert.throws(() => resolveSettings({ remote: '', encryption: 'required', backend: 'git' }, home), /needs backend: encrypted/);
  assert.throws(() => resolveSettings({ remote: '', encryption: 'required', backend: 'encrypted' }, home), /ageRecipient and ageIdentity/);
  assert.throws(() => resolveSettings({ remote: '', backend: 'encrypted', ageIdentity: 'AGE-SECRET-KEY-1ABC' }, home), /PATH/);
  assert.throws(() => resolveSettings({ remote: '', backend: 'encrypted', ageIdentity: 'relative/key.txt' }, home), /absolute/);
  assert.throws(() => resolveSettings({ remote: '' }, () => undefined), /absolute path/);
  assert.throws(() => resolveSettings({ remote: '', sessionRoot: '/a/b', repoDir: '/a/b/repo' }, home), /must not be inside/);
  assert.throws(() => resolveSettings({ remote: '', projects: { folderMap: [{ from: 'rel', to: '/x' }] } }, home), /absolute/);
  assert.equal(resolveSettings({ remote: '' }, home).encryption, 'optional');
  assert.equal(resolveSettings({ remote: '' }, home).autoPushOnTurnEnd, false);
});

test('inert without a remote: status works, pull and push explain', async () => {
  const a = device({});
  assert.match((await a.run('status')).text, /no commits yet|remote/);
  assert.equal((await a.run('pull')).kind, 'error');
  assert.match((await a.run('push')).text, /No remote is configured/);
  assert.equal(a.listeners['session/event'], undefined, 'no listeners without a remote');
  assert.match((await a.run('bogus')).text, /Usage: \/sync/);
});

test('plaintext git: sessions travel both ways and stay byte-identical', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote));
  const b = device(plainCfg(remote));
  a.put('proj-a/sess-1/session.jsonl', 'line1\nline2\n');
  a.put('proj-a/sess-2/session.jsonl', 'other\n');
  const pushed = await a.run('push');
  assert.equal(pushed.kind, 'success', pushed.text);
  const pulled = await b.run('pull');
  assert.equal(pulled.kind, 'success', pulled.text);
  assert.equal(b.read('proj-a/sess-1/session.jsonl'), 'line1\nline2\n');
  assert.equal(b.read('proj-a/sess-2/session.jsonl'), 'other\n');
  assert.equal(statSync(join(b.sessions, 'proj-a/sess-1/session.jsonl')).mode & 0o777, 0o600);
  // other direction
  b.put('proj-b/sess-9/session.jsonl', 'from b\n');
  assert.equal((await b.run('push')).kind, 'success');
  assert.equal((await a.run('pull')).kind, 'success');
  assert.equal(a.read('proj-b/sess-9/session.jsonl'), 'from b\n');
  // an append on one side is adopted on the other
  a.add('proj-a/sess-1/session.jsonl', 'line3\n');
  await a.run('push');
  const second = await b.run('pull');
  assert.match(second.text, /remote changes merged/);
  assert.match(second.text, /copied 1 session file/);
  assert.equal(b.read('proj-a/sess-1/session.jsonl'), 'line1\nline2\nline3\n');
  assert.deepEqual(walk(b.sessions).filter((f) => f.includes('.tmp')), [], 'no temp files left');
  // no false conflicts: the original wrote one shared device.txt per device and every pull reported a fork
  assert.ok(![...walk(a.repo), ...walk(b.repo)].some((f) => f.includes('.remote-fork-') || f === 'device.txt'));
  assert.ok(!/diverged/.test(second.text));
});

test('plaintext is never silent: status, push and pull all carry the PLAINTEXT warning', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote));
  a.put('p/s/session.jsonl', 'x\n');
  assert.match((await a.run('status')).text, /PLAINTEXT/);
  assert.match((await a.run('push')).text, /warning: PLAINTEXT/i);
  assert.match((await a.run('pull')).text, /warning: PLAINTEXT/i);
});

test('both sides appended: local kept, the other side preserved as a fork file, nothing lost', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote));
  const b = device(plainCfg(remote));
  a.put('p/s/session.jsonl', 'base\n');
  await a.run('push');
  await b.run('pull');
  a.add('p/s/session.jsonl', 'from-a\n');
  b.add('p/s/session.jsonl', 'from-b\n');
  await a.run('push');
  const out = await b.run('pull');
  assert.match(out.text, /both sides appended in 1 file/);
  assert.equal(b.read('p/s/session.jsonl'), 'base\nfrom-b\n', 'live file untouched');
  const forks = walk(join(b.repo, 'sessions')).filter((f) => f.includes('.remote-fork-'));
  assert.equal(forks.length, 1);
  assert.equal(readFileSync(join(b.repo, 'sessions', forks[0]), 'utf8'), 'base\nfrom-a\n', 'the other side survives byte for byte');
  assert.ok(!walk(b.sessions).some((f) => f.includes('.remote-fork-')), 'fork files are never written into the live store');
});

test('a rejected push reconciles by pulling, never by forcing', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote));
  const b = device(plainCfg(remote));
  a.put('p/one/session.jsonl', '1\n');
  b.put('p/two/session.jsonl', '2\n');
  assert.equal((await a.run('push')).kind, 'success');
  const second = await b.run('push');
  assert.equal(second.kind, 'success', second.text);
  const log = git(remote, 'log', '--oneline', 'main');
  assert.ok(log.split('\n').filter(Boolean).length >= 3, 'history kept, no rewrite');
  assert.equal((await a.run('pull')).kind, 'success');
  assert.equal(a.read('p/two/session.jsonl'), '2\n');
});

test('restore leaves a live file alone when it changed after it was mirrored, and never replaces non-atomically', async () => {
  const root = tmp();
  const sessionRoot = join(root, 'live');
  const repoDir = join(root, 'repo');
  mkdirSync(join(sessionRoot, 'p', 's'), { recursive: true });
  mkdirSync(join(repoDir, '.git'), { recursive: true });
  writeFileSync(join(sessionRoot, 'p', 's', 'session.jsonl'), 'a\n');
  await mirrorSessionRoot({ sessionRoot, repoDir, mirrorDir: 'sessions' });
  // the remote side's merged copy has more bytes; the live file grows in the meantime
  writeFileSync(join(repoDir, 'sessions', 'p', 's', 'session.jsonl'), 'a\nremote\n');
  appendFileSync(join(sessionRoot, 'p', 's', 'session.jsonl'), 'local-during-pull\n');
  const result = await restoreSessionRoot({ repoDir, mirrorRoot: join(repoDir, 'sessions'), sessionRoot });
  assert.deepEqual(result.skippedChanged, ['p/s/session.jsonl']);
  assert.equal(readFileSync(join(sessionRoot, 'p', 's', 'session.jsonl'), 'utf8'), 'a\nlocal-during-pull\n');
  // unchanged live file is replaced, atomically (no temp left)
  await mirrorSessionRoot({ sessionRoot, repoDir, mirrorDir: 'sessions' });
  writeFileSync(join(repoDir, 'sessions', 'p', 's', 'session.jsonl'), 'a\nlocal-during-pull\nmore\n');
  const again = await restoreSessionRoot({ repoDir, mirrorRoot: join(repoDir, 'sessions'), sessionRoot });
  assert.equal(again.restored, 1);
  assert.equal(readFileSync(join(sessionRoot, 'p', 's', 'session.jsonl'), 'utf8'), 'a\nlocal-during-pull\nmore\n');
  assert.deepEqual(walk(sessionRoot).filter((f) => f.endsWith('.tmp')), []);
});

test('restore leaves a session that is open in the app (session.lock present) for the next pull', async () => {
  const root = tmp();
  const sessionRoot = join(root, 'live');
  const repoDir = join(root, 'repo');
  mkdirSync(join(sessionRoot, 'p', 's'), { recursive: true });
  mkdirSync(join(repoDir, '.git'), { recursive: true });
  writeFileSync(join(sessionRoot, 'p', 's', 'session.jsonl'), 'a\n');
  await mirrorSessionRoot({ sessionRoot, repoDir, mirrorDir: 'sessions' });
  writeFileSync(join(repoDir, 'sessions', 'p', 's', 'session.jsonl'), 'a\nremote\n');
  writeFileSync(join(sessionRoot, 'p', 's', 'session.lock'), '');
  const open = await restoreSessionRoot({ repoDir, mirrorRoot: join(repoDir, 'sessions'), sessionRoot });
  assert.deepEqual(open.skippedChanged, ['p/s/session.jsonl']);
  assert.equal(readFileSync(join(sessionRoot, 'p', 's', 'session.jsonl'), 'utf8'), 'a\n');
  execFileSync('rm', [join(sessionRoot, 'p', 's', 'session.lock')]);
  const closed = await restoreSessionRoot({ repoDir, mirrorRoot: join(repoDir, 'sessions'), sessionRoot });
  assert.equal(closed.restored, 1);
  assert.equal(readFileSync(join(sessionRoot, 'p', 's', 'session.jsonl'), 'utf8'), 'a\nremote\n');
});

test('the reserved folder never reaches the live session store', async () => {
  const root = tmp();
  const sessionRoot = join(root, 'live');
  const repoDir = join(root, 'repo');
  mkdirSync(sessionRoot, { recursive: true });
  mkdirSync(join(repoDir, '.git'), { recursive: true });
  mkdirSync(join(repoDir, 'sessions', '__dsh-sync__', 'projects'), { recursive: true });
  writeFileSync(join(repoDir, 'sessions', '__dsh-sync__', 'projects', 'abcd1234.json'), '{}');
  const result = await restoreSessionRoot({ repoDir, mirrorRoot: join(repoDir, 'sessions'), sessionRoot });
  assert.equal(result.restored, 0);
  assert.deepEqual(walk(sessionRoot), []);
});

test('encryption required: not configured means nothing is sent and nothing reaches the remote', async () => {
  const remote = makeRemote();
  const keyDir = tmp();
  const key = join(keyDir, 'key.txt');
  writeFileSync(key, 'shim identity');
  const a = device({ remote, backend: 'encrypted', encryption: 'required', ageBin: join(tmp(), 'no-such-age'), ageRecipient: 'age1recipient', ageIdentity: key });
  a.put('p/s/session.jsonl', 'TOP-SECRET-TEXT\n');
  const push = await a.run('push');
  assert.equal(push.kind, 'error');
  assert.match(push.text, /encryption is required but not active/);
  const pull = await a.run('pull');
  assert.equal(pull.kind, 'error');
  assert.equal(git(remote, 'branch', '--list').trim(), '', 'the remote received nothing');
  assert.match((await a.run('status')).text, /PLAINTEXT/);
});

test('encrypted backend: the remote holds only ciphertext, and pulled sessions reach the other machine', async () => {
  const remote = makeRemote();
  const age = makeAgeShim();
  const key = join(tmp(), 'key.txt');
  writeFileSync(key, 'shim identity');
  const cfg = { remote, backend: 'encrypted', encryption: 'required', ageBin: age, ageRecipient: 'age1recipient', ageIdentity: key };
  const a = device(cfg);
  const b = device(cfg);
  a.put('p/s/session.jsonl', 'TOP-SECRET-TEXT\nsecond\n');
  const pushed = await a.run('push');
  assert.equal(pushed.kind, 'success', pushed.text);
  assert.ok(!/PLAINTEXT/.test(pushed.text));
  const files = git(remote, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n').filter((f) => f !== '.gitignore');
  assert.ok(files.length && files.every((f) => f.startsWith('encrypted/') && f.endsWith('.age')), files.join(','));
  assert.throws(() => git(remote, 'grep', '-a', 'TOP-SECRET-TEXT', 'main'), undefined, 'the secret text is nowhere in the remote');
  const pulled = await b.run('pull');
  assert.equal(pulled.kind, 'success', pulled.text);
  assert.equal(b.read('p/s/session.jsonl'), 'TOP-SECRET-TEXT\nsecond\n', 'the session arrived in the live store (the original encrypted backend skipped this)');
  // an append travels too
  a.add('p/s/session.jsonl', 'third\n');
  await a.run('push');
  assert.equal((await b.run('pull')).kind, 'success');
  assert.equal(b.read('p/s/session.jsonl'), 'TOP-SECRET-TEXT\nsecond\nthird\n');
  assert.match((await a.run('status')).text, /transport: encrypted/);
});

test('encrypted backend: a machine that pulled can push again, both ways, without forcing', async () => {
  const remote = makeRemote();
  const age = makeAgeShim();
  const key = join(tmp(), 'key.txt');
  writeFileSync(key, 'shim identity');
  const cfg = { remote, backend: 'encrypted', encryption: 'required', ageBin: age, ageRecipient: 'age1recipient', ageIdentity: key };
  const a = device(cfg);
  const b = device(cfg);
  a.put('p/a/session.jsonl', 'from a\n');
  assert.equal((await a.run('push')).kind, 'success');
  b.put('p/b/session.jsonl', 'from b\n');
  assert.equal((await b.run('pull')).kind, 'success');
  // Before the fix this push was rejected every time: the pull commit was not a descendant of the remote.
  const pushedB = await b.run('push');
  assert.equal(pushedB.kind, 'success', pushedB.text);
  assert.equal((await a.run('pull')).kind, 'success');
  assert.equal(a.read('p/b/session.jsonl'), 'from b\n');
  a.add('p/a/session.jsonl', 'more from a\n');
  const pushedA = await a.run('push');
  assert.equal(pushedA.kind, 'success', pushedA.text);
  assert.equal((await b.run('pull')).kind, 'success');
  assert.equal(b.read('p/a/session.jsonl'), 'from a\nmore from a\n');
  // No merge left half-done in either repository.
  assert.throws(() => git(b.repo, 'rev-parse', '--verify', '-q', 'MERGE_HEAD'));
});

test('encrypted backend: pushing again with nothing changed adds no commit (no re-encryption churn)', async () => {
  const remote = makeRemote();
  const age = makeAgeShim();
  const key = join(tmp(), 'key.txt');
  writeFileSync(key, 'shim identity');
  const a = device({ remote, backend: 'encrypted', encryption: 'required', ageBin: age, ageRecipient: 'age1recipient', ageIdentity: key });
  a.put('p/s/session.jsonl', 'one\n');
  a.put('p/t/session.jsonl', 'two\n');
  assert.equal((await a.run('push')).kind, 'success');
  const first = git(remote, 'rev-parse', 'main').trim();
  const before = statSync(join(a.repo, 'encrypted', 'p', 't', 'session.jsonl.age')).mtimeMs;
  assert.equal((await a.run('push')).kind, 'success');
  assert.equal(git(remote, 'rev-parse', 'main').trim(), first, 'nothing changed, so nothing new was pushed');
  a.add('p/s/session.jsonl', 'more\n');
  assert.equal((await a.run('push')).kind, 'success');
  const changed = git(remote, 'diff', '--name-only', first, 'main').trim().split('\n');
  assert.deepEqual(changed, ['encrypted/p/s/session.jsonl.age'], 'only the changed session was re-encrypted');
  assert.equal(statSync(join(a.repo, 'encrypted', 'p', 't', 'session.jsonl.age')).mtimeMs, before);
});

test('encryption optional with encrypted backend but no age: it still works, in plaintext, with a loud warning', async () => {
  const remote = makeRemote();
  const a = device({ remote, backend: 'encrypted', encryption: 'optional', ageBin: join(tmp(), 'missing-age'), ageRecipient: '', ageIdentity: '' });
  a.put('p/s/session.jsonl', 'visible\n');
  const out = await a.run('push');
  assert.equal(out.kind, 'success', out.text);
  assert.match(out.text, /PLAINTEXT/);
  assert.match(out.text, /age binary not found/);
  assert.ok(git(remote, 'ls-tree', '-r', '--name-only', 'main').includes('sessions/p/s/session.jsonl'));
});

test('project list: one manifest per device, mapped to local folders, applied only on request', async () => {
  const remote = makeRemote();
  const folderA = tmp();   // "the folder on machine A"
  const folderB = tmp();   // "the same project's folder on machine B"
  const gone = join(tmp(), 'never-created');
  const registryA = { list: () => [{ id: 'w1', title: 'My project', path: folderA }, { id: 'w2', title: 'Lost one', path: gone }, { id: 'w3', title: 'Shared path', path: folderB }] };
  const created = [];
  const registryB = {
    list: () => [],
    resolveByPath: async (p) => (p === folderB ? { id: 'already' } : undefined),
    create: async (p, title) => { created.push([p, title]); return {}; },
  };
  const a = device(plainCfg(remote, { projects: { sync: true } }), { registry: registryA });
  const folderC = tmp();
  const b = device(plainCfg(remote, { projects: { sync: true, folderMap: [{ from: folderA, to: folderC }] } }), { registry: registryB });
  a.put('p/s/session.jsonl', 'x\n');
  assert.equal((await a.run('push')).kind, 'success');
  const pulled = await b.run('pull');
  assert.match(pulled.text, /1 project\(s\) from other devices can be added/);
  const plan = await b.run('projects');
  assert.match(plan.text, new RegExp(`My project: ${folderA.replace(/[/.]/g, '\\$&')} -> ${folderC.replace(/[/.]/g, '\\$&')} \\(can be added\\)`));
  assert.match(plan.text, /Lost one: .* \(no mapping and no such folder here\)/);
  assert.match(plan.text, /Shared path: .*\(already here\)/);
  assert.deepEqual(created, [], 'nothing is created until you ask');
  assert.match((await b.run('projects apply')).text, /Added 1 project/);
  assert.deepEqual(created, [[folderC, 'My project']]);
  assert.ok(!walk(b.sessions).some((f) => f.includes('__dsh-sync__')), 'the manifest is not in the live session store');
  assert.ok(walk(join(b.repo, 'sessions')).some((f) => f.startsWith('__dsh-sync__/projects/')), 'it lives in the sync worktree');
});

test('project list over the encrypted backend: titles and folders are never on the remote in plaintext', async () => {
  const remote = makeRemote();
  const age = makeAgeShim();
  const key = join(tmp(), 'key.txt');
  writeFileSync(key, 'shim identity');
  const cfgBase = { remote, backend: 'encrypted', encryption: 'required', ageBin: age, ageRecipient: 'age1recipient', ageIdentity: key };
  const folderA = tmp();
  const folderB = tmp();
  const a = device({ ...cfgBase, projects: { sync: true } }, { registry: { list: () => [{ id: 'w', title: 'Very Private Title', path: folderA }] } });
  const created = [];
  const b = device({ ...cfgBase, projects: { sync: true, folderMap: [{ from: folderA, to: folderB }] } }, { registry: { list: () => [], resolveByPath: async () => undefined, create: async (p, t) => { created.push([p, t]); } } });
  a.put('p/s/session.jsonl', 'x\n');
  assert.equal((await a.run('push')).kind, 'success');
  assert.throws(() => git(remote, 'grep', '-a', 'Very Private Title', 'main'));
  assert.throws(() => git(remote, 'grep', '-a', folderA, 'main'));
  assert.equal((await b.run('pull')).kind, 'success');
  assert.match((await b.run('projects')).text, /Very Private Title/);
  await b.run('projects apply');
  assert.deepEqual(created, [[folderB, 'Very Private Title']]);
  assert.ok(!walk(b.sessions).some((f) => f.includes('__dsh-sync__')));
});

test('project sync off: the plan says so and no manifest is written', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote), { registry: { list: () => [{ id: 'w', title: 't', path: '/x' }] } });
  a.put('p/s/session.jsonl', 'x\n');
  await a.run('push');
  assert.match((await a.run('projects')).text, /Project sync is off/);
  assert.ok(!walk(join(a.repo, 'sessions')).some((f) => f.includes('__dsh-sync__')));
});

test('autoCreate adds projects on pull; deleting nothing; own manifest ignored', async () => {
  const remote = makeRemote();
  const folder = tmp();
  const created = [];
  const a = device(plainCfg(remote, { projects: { sync: true } }), { registry: { list: () => [{ id: 'w1', title: 'P', path: folder }] } });
  const b = device(plainCfg(remote, { projects: { sync: true, autoCreate: true } }), { registry: { list: () => [], resolveByPath: async () => undefined, create: async (p, t) => { created.push([p, t]); } } });
  a.put('p/s/session.jsonl', 'x\n');
  await a.run('push');
  await b.run('pull');
  assert.deepEqual(created, [[folder, 'P']]);
  const own = device(plainCfg(remote, { projects: { sync: true } }), { registry: { list: () => [{ id: 'w1', title: 'P', path: folder }] } });
  await own.run('push');
  assert.match((await own.run('projects')).text, /other devices|already here|can be added/);
});

test('mapPath maps on folder boundaries only', () => {
  const rules = checkFolderMap([{ from: '/a/proj', to: '/b/work' }]);
  assert.deepEqual(mapPath('/a/proj', rules), { path: '/b/work', mapped: true });
  assert.deepEqual(mapPath('/a/proj/sub/dir', rules), { path: '/b/work/sub/dir', mapped: true });
  assert.deepEqual(mapPath('/a/project2', rules), { path: '/a/project2', mapped: false });
  assert.throws(() => checkFolderMap([{ from: '/a/..', to: '/b' }]), /\.\./);
});

test('auto push after a turn ends is debounced, ignores sub-agents and replayed history', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote, { autoPushOnTurnEnd: true, minPushIntervalSeconds: 0.05 }));
  a.put('p/s/session.jsonl', 'x\n');
  const [handler] = a.listeners['session/event'];
  const top = { id: 's', header: {} };
  handler(top, { type: 'turn/end', time: new Date().toISOString() });
  handler(top, { type: 'turn/end', time: new Date().toISOString() });
  handler({ id: 'c', header: { origin: 'subagent', parentSession: 's' } }, { type: 'turn/end', time: new Date().toISOString() });
  handler(top, { type: 'turn/end', time: new Date(Date.now() - 3600000).toISOString() });
  handler(top, { type: 'turn/start' });
  await new Promise((r) => setTimeout(r, 1500));
  assert.match(git(remote, 'log', '--oneline', 'main'), /push snapshot/);
  assert.equal(git(remote, 'log', '--oneline', 'main').trim().split('\n').filter((l) => /push snapshot/.test(l)).length, 1, 'one push for the burst');
});

test('no auto modes without opting in', () => {
  const a = device(plainCfg(makeRemote()));
  assert.equal(a.listeners['session/event'], undefined);
});

test('state: device id is stable, files are private, the plugin offers a service', async () => {
  const home = tmp();
  const a = device(plainCfg(makeRemote(), { home }));
  const id1 = JSON.parse(readFileSync(join(home, 'sync', 'state.json'), 'utf8')).deviceId;
  assert.match(id1, /^[0-9a-f-]{36}$/);
  device(plainCfg(makeRemote(), { home }));
  assert.equal(JSON.parse(readFileSync(join(home, 'sync', 'state.json'), 'utf8')).deviceId, id1);
  assert.equal(statSync(join(home, 'sync', 'state.json')).mode & 0o777, 0o600);
  assert.equal(typeof a.provided.sync.push, 'function');
  assert.equal(a.provided.sync.settings().ageIdentity, '');
});

test('no secrets in the sync data folder: no key text, no remote credentials', async () => {
  const remote = makeRemote();
  const key = join(tmp(), 'key.txt');
  writeFileSync(key, 'KEY-FILE-CONTENT');
  const age = makeAgeShim();
  const a = device({ remote, backend: 'encrypted', ageBin: age, ageRecipient: 'age1pub', ageIdentity: key });
  a.put('p/s/session.jsonl', 'x\n');
  await a.run('push');
  const state = readFileSync(join(a.home, 'sync', 'state.json'), 'utf8');
  assert.ok(!state.includes('KEY-FILE-CONTENT'));
  const config = readFileSync(join(a.repo, '.git', 'config'), 'utf8');
  assert.ok(!config.includes('KEY-FILE-CONTENT'));
});

// ---- isolated conversations (Recon) are never synced (0.57.0) ----

test('isolation: which file belongs to which conversation, and which conversations are isolated', async () => {
  const { decodeSegment, sessionIdOf, isolatedIds, excludeFor, readIsolation, UNKNOWN_REASON } = await import('../lib/isolation.mjs');
  // The app escapes a conversation id as one folder name: `~XXXX` for anything outside [A-Za-z0-9._-].
  assert.equal(decodeSegment('r~003A1'), 'r:1');
  assert.equal(decodeSegment('plain-id_1.x'), 'plain-id_1.x');
  assert.equal(sessionIdOf('--Users-me-proj--/r~003A1/session.jsonl'), 'r:1');
  assert.equal(sessionIdOf('_no-cwd/abc/session.v4.jsonl.zstd'), 'abc');
  assert.equal(sessionIdOf('p/abc/session.jsonl.remote-fork-20260101000000-abcdef12'), 'abc');
  assert.equal(sessionIdOf('p/abc/sub/x.remote-fork-20260101000000-abcdef12'), 'abc', 'a file deeper in the conversation folder');
  assert.equal(sessionIdOf('abc/session.jsonl'), 'abc', 'the old flat layout <conversation>/<file>');
  assert.equal(sessionIdOf('abc'), undefined, 'not inside a conversation folder');
  assert.equal(sessionIdOf('__dsh-sync__/projects/abcd1234.json'), undefined, 'the plugin\'s own folder');
  assert.equal(sessionIdOf('__dsh-sync__/x'), undefined);
  // The same escaping as lib/paths.mjs (one function, not two).
  assert.equal(decodeSegment, (await import('../lib/paths.mjs')).decodeSegment);

  const modes = {
    sessionIsolated: JSON.stringify({ r1: true, no: false }),
    // A stored isolated mode alone does not count: a conversation moved into the Recon tab holds nothing from Recon.
    sessionModes: JSON.stringify({ r2: 'recon', c1: 'cowork' }),
    modes: JSON.stringify({ cowork: { label: 'Cowork' } }),
    extraModes: JSON.stringify({ recon: { label: 'Recon', isolated: true } }),
  };
  const parents = new Map([['h1', 'r1'], ['h2', 'h1'], ['h3', 'c1'], ['copy', 'r2']]);
  const ids = isolatedIds({ modes, open: ['r3', 'c1', 'odd'], isolated: (id) => { if (id === 'odd') throw new Error('x'); return id === 'r3'; }, parents });
  assert.deepEqual([...ids].sort(), ['h1', 'h2', 'odd', 'r1', 'r3'], 'marked, open and isolated (or unknown), and their helpers');
  const exclude = excludeFor(ids);
  assert.equal(exclude('p/r1/session.jsonl'), true);
  assert.equal(exclude('r1/session.jsonl'), true, 'the old flat layout too');
  assert.equal(exclude('p/c1/session.jsonl'), false);
  assert.equal(exclude('p/r2/session.jsonl'), false);
  assert.equal(exclude('__dsh-sync__/projects/r1.json'), false);

  // Without the Modes add-on's settings nothing is known, and that is said.
  const unknown = await readIsolation({ settings: { describe: () => [{ ns: 'other', value: {} }] } });
  assert.equal(unknown.known, false);
  assert.equal(unknown.reason, UNKNOWN_REASON);
  assert.equal((await readIsolation({})).known, false);
  // With them: the stored headers give the parents.
  const known = await readIsolation({
    settings: { describe: () => [{ ns: 'modes', value: modes }] },
    modes: { isolated: () => false },
    agents: { list: () => [] },
    sessionPersistence: { list: async () => [{ header: { id: 'h9', parentSession: 'r1' } }, { header: { id: 'c1' } }] },
  });
  assert.equal(known.known, true);
  assert.ok(known.exclude('p/h9/session.jsonl'));
  assert.ok(!known.exclude('p/c1/session.jsonl'));
  // A conversation moved into the Recon tab after it ran (the Cowork sidebar's "Move to" menu stores its mode): Modes
  // holds it in its late lock and never marks it, so it is not isolated, open or closed.
  const movedModes = { sessionModes: JSON.stringify({ old: 'recon' }), extraModes: JSON.stringify({ recon: { label: 'Recon', isolated: true } }) };
  const lateModes = { isolated: () => true, get: (id) => (id === 'old' ? 'isolated-late' : 'recon') };
  const late = await readIsolation({ settings: { describe: () => [{ ns: 'modes', value: movedModes }] }, modes: lateModes, agents: { list: () => [{ id: 'old' }, { id: 'fresh-recon' }] } });
  assert.deepEqual([...late.ids], ['fresh-recon']);
  const closed = await readIsolation({ settings: { describe: () => [{ ns: 'modes', value: movedModes }] }, modes: lateModes, agents: { list: () => [] } });
  assert.equal(closed.known, true);
  assert.equal(closed.exclude('p/old/session.jsonl'), false);
  // Stored headers that cannot be listed: nothing is known.
  const failed = await readIsolation({ settings: { describe: () => [{ ns: 'modes', value: modes }] }, sessionPersistence: { list: async () => { throw new Error('busy'); } } });
  assert.equal(failed.known, false);
  assert.match(failed.reason, /could not be listed[\s\S]*busy/);
  // Modes' marks are read after the stored headers are listed, so a mark made meanwhile counts.
  const marks = { sessionIsolated: '{}' };
  const meanwhile = await readIsolation({ settings: { describe: () => [{ ns: 'modes', value: { ...marks } }] }, sessionPersistence: { list: async () => { marks.sessionIsolated = JSON.stringify({ r9: true }); return []; } } });
  assert.ok(meanwhile.exclude('p/r9/session.jsonl'));
});

test('askIsolation never throws, and anything but a usable answer means "not known"', async () => {
  const { askIsolation, isolationSummary, UNKNOWN_REASON } = await import('../lib/isolation.mjs');
  assert.equal((await askIsolation(undefined)).known, false);
  assert.equal((await askIsolation(undefined)).reason, UNKNOWN_REASON);
  const thrown = await askIsolation(async () => { throw new Error('settings busy'); });
  assert.equal(thrown.known, false);
  assert.match(thrown.reason, /could not tell which conversations are isolated \(settings busy\)/);
  assert.equal((await askIsolation(async () => ({ known: true }))).known, false, 'no rule to leave files out');
  assert.equal((await askIsolation(async () => ({ known: false, reason: 'Modes is starting' }))).reason, 'Modes is starting');
  const good = await askIsolation(async () => ({ known: true, ids: new Set(['r1']), exclude: (rel) => rel.includes('/r1/') }));
  assert.equal(good.known, true);
  assert.ok(good.exclude('p/r1/session.jsonl'));
  assert.deepEqual(await isolationSummary(good), { known: true, reason: '', count: 1 });
  assert.deepEqual(await isolationSummary(undefined, undefined), { known: false, reason: UNKNOWN_REASON, count: 0 });
});

test('the mirror asks which conversations are isolated after it lists the session store, and stops when nobody knows', async () => {
  const { IsolationUnknownError } = await import('../lib/isolation.mjs');
  const sessionRoot = tmp();
  const repoDir = tmp();
  const put = (rel, text) => { const f = join(sessionRoot, ...rel.split('/')); mkdirSync(join(f, '..'), { recursive: true }); writeFileSync(f, text); };
  const mirrored = (rel) => existsSync(join(repoDir, 'sessions', ...rel.split('/')));
  put('p/c1/session.jsonl', 'ordinary\n');
  // A conversation that begins while Modes is asked is not in the listing: it waits for the next run.
  const first = await mirrorSessionRoot({ sessionRoot, repoDir, mirrorDir: 'sessions', fence: async () => { put('p/r1/session.jsonl', 'begun while asking\n'); return { known: true, exclude: () => false }; } });
  assert.equal(first.mirrored, 1);
  assert.ok(mirrored('p/c1/session.jsonl'));
  assert.ok(!mirrored('p/r1/session.jsonl'));
  // Nobody knows: nothing is copied and nothing is removed.
  put('p/c2/session.jsonl', 'more\n');
  await assert.rejects(
    mirrorSessionRoot({ sessionRoot, repoDir, mirrorDir: 'sessions', exclude: () => true, fence: async () => ({ known: false, reason: 'Sync did not run: Modes is off.' }) }),
    (error) => error instanceof IsolationUnknownError && error.message === 'Sync did not run: Modes is off.',
  );
  assert.ok(!mirrored('p/c2/session.jsonl'));
  assert.ok(mirrored('p/c1/session.jsonl'), 'the fixed rule was not used either');
  // The answer replaces the fixed rule, and is handed back for the rest of the operation.
  const second = await mirrorSessionRoot({ sessionRoot, repoDir, mirrorDir: 'sessions', exclude: () => true, fence: async () => ({ known: true, exclude: (rel) => rel.startsWith('p/r1/') }) });
  assert.equal(second.isolatedSkipped, 1);
  assert.ok(second.exclude('p/r1/session.jsonl'));
  assert.ok(mirrored('p/c2/session.jsonl'));
  assert.ok(!mirrored('p/r1/session.jsonl'));
});

test('plaintext git: an isolated conversation is never pushed, and the other machine never gets it', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote), { isolated: ['r:1'] });
  const b = device(plainCfg(remote));
  a.put('--proj--/c1/session.jsonl', 'ordinary talk\n');
  a.put('--proj--/r~003A1/session.jsonl', 'RECON-SECRET-TEXT\n');
  const pushed = await a.run('push');
  assert.equal(pushed.kind, 'success', pushed.text);
  assert.match(pushed.text, /left out 1 file\(s\) of isolated conversations \(Recon\): they are never synced/);
  assert.deepEqual(git(remote, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n'), ['sessions/--proj--/c1/session.jsonl']);
  assert.equal(git(remote, 'log', '--all', '-p').includes('RECON-SECRET-TEXT'), false, 'not in any commit');
  assert.ok(!walk(a.repo).some((file) => file.includes('r~003A1')), 'not even in the local worktree');
  assert.equal((await b.run('pull')).kind, 'success');
  assert.equal(b.read('--proj--/c1/session.jsonl'), 'ordinary talk\n');
  assert.equal(b.has('--proj--/r~003A1/session.jsonl'), false);
  // The live files of the isolated conversation are left as they are.
  assert.equal(a.read('--proj--/r~003A1/session.jsonl'), 'RECON-SECRET-TEXT\n');
  assert.match((await a.run('status')).text, /isolated conversations \(Recon\): 1, never synced/);
});

test('a conversation pushed by an earlier version leaves the remote\'s branch once it is known to be isolated', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote));
  const b = device(plainCfg(remote));
  a.put('--proj--/c1/session.jsonl', 'ordinary\n');
  a.put('--proj--/r1/session.jsonl', 'recon talk\n');
  assert.equal((await a.run('push')).kind, 'success');
  assert.equal((await b.run('pull')).kind, 'success');
  assert.equal(b.read('--proj--/r1/session.jsonl'), 'recon talk\n');
  a.isolate('r1');
  const pushed = await a.run('push');
  assert.equal(pushed.kind, 'success', pushed.text);
  assert.match(pushed.text, /took 1 file\(s\) of isolated conversations out of the sync repository \(its git history still holds them\)/);
  assert.deepEqual(git(remote, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n'), ['sessions/--proj--/c1/session.jsonl']);
  assert.equal(a.read('--proj--/r1/session.jsonl'), 'recon talk\n', 'the live files stay');
  // The other machine's copy, which only Sync put there and nobody changed, goes with it.
  assert.equal((await b.run('pull')).kind, 'success');
  assert.equal(b.has('--proj--/r1/session.jsonl'), false);
  assert.equal(b.read('--proj--/c1/session.jsonl'), 'ordinary\n');
});

test('a pull never writes into an isolated conversation, and does not keep it in the merge', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote));
  a.put('--proj--/x1/session.jsonl', 'from the other machine\n');
  a.put('--proj--/c1/session.jsonl', 'ordinary\n');
  assert.equal((await a.run('push')).kind, 'success');
  // On this machine x1 is an isolated conversation (open in the app, Modes says so).
  const b = device(plainCfg(remote), { open: { x1: true } });
  const pulled = await b.run('pull');
  assert.equal(pulled.kind, 'success', pulled.text);
  assert.equal(b.read('--proj--/c1/session.jsonl'), 'ordinary\n');
  assert.equal(b.has('--proj--/x1/session.jsonl'), false, 'nothing written into it');
  assert.ok(!walk(join(b.repo, 'sessions')).some((file) => file.includes('x1')), 'not kept in the worktree');
  assert.ok(!git(b.repo, 'ls-tree', '-r', '--name-only', 'HEAD').includes('x1'), 'not in the merge commit');
});

test('a helper of an isolated conversation is left out through its header, a copy through Modes\' mark', async () => {
  const remote = makeRemote();
  // Rerun's copy carries Modes' mark; its header has no parentSession (in this app version only helpers have one).
  const a = device(plainCfg(remote), { isolated: ['r1', 'rerun1'], stored: [{ header: { id: 'r1' } }, { header: { id: 'h1', parentSession: 'r1', origin: 'subagent' } }, { header: { id: 'rerun1' } }, { header: { id: 'c1' } }] });
  a.put('--proj--/r1/session.jsonl', 'recon\n');
  a.put('--proj--/h1/session.jsonl', 'helper of recon\n');
  a.put('--proj--/rerun1/session.jsonl', 'copy of recon\n');
  a.put('--proj--/c1/session.jsonl', 'ordinary\n');
  assert.equal((await a.run('push')).kind, 'success');
  assert.deepEqual(git(remote, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n'), ['sessions/--proj--/c1/session.jsonl']);
});

test('a conversation moved into the Recon tab after it ran is still synced, open or closed', async () => {
  const remote = makeRemote();
  // Modes holds it in its late lock: isolated() is true while it is open, get() names the late mode, no mark.
  const open = { moved: true };
  const a = device(plainCfg(remote), { sessionModes: { moved: 'recon' }, open, late: ['moved'] });
  const c = device(plainCfg(remote));
  a.put('--proj--/moved/session.jsonl', 'budget talk\n');
  const pushed = await a.run('push');
  assert.equal(pushed.kind, 'success', pushed.text);
  assert.ok(!/isolated conversations/.test(pushed.text), pushed.text);
  assert.equal((await c.run('pull')).kind, 'success');
  assert.equal(c.read('--proj--/moved/session.jsonl'), 'budget talk\n');
  delete open.moved;
  a.add('--proj--/moved/session.jsonl', 'more\n');
  assert.equal((await a.run('push')).kind, 'success');
  assert.deepEqual(git(remote, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n'), ['sessions/--proj--/moved/session.jsonl'], 'not taken off the remote');
  assert.equal((await c.run('pull')).kind, 'success');
  assert.equal(c.read('--proj--/moved/session.jsonl'), 'budget talk\nmore\n', 'the other machine keeps its copy');
});

test('a Recon conversation that begins while another sync operation runs is never pushed with an old answer', async () => {
  const remote = makeRemote();
  // A git that is slow to fetch, so a pull holds Sync's lock for a while.
  const dir = tmp();
  const marker = join(dir, 'fetching');
  const slowGit = join(dir, 'git');
  const realGit = execFileSync('/bin/sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  writeFileSync(slowGit, `#!/bin/sh
for a in "$@"; do
  if [ "$a" = fetch ]; then : > '${marker}'; sleep 2; break; fi
done
exec '${realGit}' "$@"
`);
  chmodSync(slowGit, 0o755);
  const a = device(plainCfg(remote, { gitBin: slowGit }));
  a.put('--proj--/c1/session.jsonl', 'ordinary\n');
  assert.equal((await a.run('push')).kind, 'success');
  rmSync(marker, { force: true });
  const pulling = a.run('pull');
  for (let i = 0; i < 100 && !existsSync(marker); i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  assert.ok(existsSync(marker), 'the pull is fetching');
  // A push is asked for now; it waits for the pull.
  const pushing = a.run('push');
  await new Promise((resolve) => setTimeout(resolve, 400));
  // Meanwhile a Recon conversation begins: its first turn writes its file, and Modes marks it.
  a.put('--proj--/r1/session.jsonl', 'RECON-SECRET-TEXT\n');
  a.isolate('r1');
  assert.equal((await pulling).kind, 'success');
  const pushed = await pushing;
  assert.equal(pushed.kind, 'success', pushed.text);
  assert.match(pushed.text, /left out 1 file\(s\) of isolated conversations/);
  assert.equal(git(remote, 'log', '--all', '-p').includes('RECON-SECRET-TEXT'), false, 'not in any commit on the remote');
  assert.equal(git(a.repo, 'log', '--all', '-p').includes('RECON-SECRET-TEXT'), false, 'not in any local commit either');
});

test('without the Modes add-on nothing is pushed or pulled, and status copies nothing', async () => {
  const remote = makeRemote();
  const a = device(plainCfg(remote), { modes: false });
  a.put('--proj--/r1/session.jsonl', 'maybe recon\n');
  const push = await a.run('push');
  assert.equal(push.kind, 'error');
  assert.match(push.text, /Sync did not run: the Modes add-on is not running, and it is what tells Sync which conversations are isolated \(Recon\)/);
  assert.equal(git(remote, 'branch', '--list').trim(), '', 'the remote received nothing');
  const pull = await a.run('pull');
  assert.equal(pull.kind, 'error');
  assert.match(pull.text, /Modes add-on is not running/);
  const status = await a.run('status');
  assert.match(status.text, /isolated conversations \(Recon\): unknown, so push and pull wait: the Modes add-on is not running/);
  assert.ok(!existsSync(join(a.repo, 'sessions')) || walk(join(a.repo, 'sessions')).length === 0, 'nothing copied into the worktree');
});

test('encrypted backend: an isolated conversation never reaches the remote, and an earlier copy is taken off', async () => {
  const remote = makeRemote();
  const age = makeAgeShim();
  const key = join(tmp(), 'key.txt');
  writeFileSync(key, 'shim identity');
  const cfg = { remote, backend: 'encrypted', encryption: 'required', ageBin: age, ageRecipient: 'age1recipient', ageIdentity: key };
  const a = device(cfg);
  a.put('--proj--/c1/session.jsonl', 'ordinary\n');
  a.put('--proj--/r1/session.jsonl', 'recon before the fix\n');
  assert.equal((await a.run('push')).kind, 'success');
  assert.ok(git(remote, 'ls-tree', '-r', '--name-only', 'main').includes('encrypted/--proj--/r1/session.jsonl.age'));
  a.isolate('r1');
  a.put('--proj--/r2/session.jsonl', 'more recon\n');
  a.isolate('r2');
  const pushed = await a.run('push');
  assert.equal(pushed.kind, 'success', pushed.text);
  assert.match(pushed.text, /left out 2 file\(s\)/);
  assert.match(pushed.text, /took 1 file\(s\)/);
  assert.deepEqual(git(remote, 'ls-tree', '-r', '--name-only', 'main').trim().split('\n').filter((file) => file !== '.gitignore'), ['encrypted/--proj--/c1/session.jsonl.age']);
  const b = device(cfg, { isolated: ['r1'] });
  assert.equal((await b.run('pull')).kind, 'success');
  assert.equal(b.read('--proj--/c1/session.jsonl'), 'ordinary\n');
  assert.equal(b.has('--proj--/r1/session.jsonl'), false);
  assert.equal(b.has('--proj--/r2/session.jsonl'), false);
  // Without the Modes add-on the encrypted backend stops inside its lock too: nothing copied, nothing sent.
  const before = git(remote, 'rev-parse', 'main').trim();
  const off = device(cfg, { modes: false });
  off.put('--proj--/r3/session.jsonl', 'maybe recon\n');
  const push = await off.run('push');
  assert.equal(push.kind, 'error');
  assert.match(push.text, /Modes add-on is not running/);
  assert.equal(git(remote, 'rev-parse', 'main').trim(), before, 'the remote received nothing');
  assert.ok(!existsSync(join(off.repo, 'sessions')) || walk(join(off.repo, 'sessions')).length === 0, 'nothing copied into the worktree');
  assert.match((await off.run('status')).text, /isolated conversations \(Recon\): unknown, so push and pull wait/);
});
