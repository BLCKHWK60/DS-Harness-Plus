import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync, appendFileSync } from 'node:fs';
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

/** One "machine": own dsh home, a fake ctx, and the registered command. */
function device(config, { registry } = {}) {
  const home = config.home ?? tmp();
  mkdirSync(join(home, 'sessions'), { recursive: true });
  const commands = {};
  const provided = {};
  const listeners = {};
  const ctx = {
    get: (key) => (key === 'dshHomePath' ? (sub) => join(home, sub) : key === 'workspaceRegistry' ? registry : provided[key]),
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
  return { home, sessions, run, put, add, read, has, provided, listeners, commands, repo: join(home, 'sync', 'repo') };
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
