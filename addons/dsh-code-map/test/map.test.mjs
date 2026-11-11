import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createManager } from '../lib/manager.js';
import { fileOutline, find, overview, readIndexed, readPart, related, safeRel } from '../lib/query.js';
import { compileIgnore, isIgnored, tooBroad, walk } from '../lib/scan.js';
import { buildIndex, folderId, indexStats, linkIndex, loadIndex, saveIndex } from '../lib/store.js';

/**
 * Make a throwaway folder with the given files.
 * @param {Record<string, string>} files - path -> content.
 * @returns {string} the folder (real path).
 */
function project(files) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-test-')));
  for (const [rel, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), text);
  }
  return root;
}

const SAMPLE = {
  'package.json': '{"name":"sample","main":"src/index.js"}',
  'README.md': '# Sample\n\n## Use\n',
  'src/index.js': "// Starts the app.\nimport { start } from './server.js';\nimport { helper } from './util/helper';\nstart(helper());\n",
  'src/server.js': "import { helper } from './util/helper.js';\nimport express from 'express';\nexport function start(x) {\n  return helper(x);\n}\nexport class Server {\n  listen(port) {\n    return port;\n  }\n}\n",
  'src/util/helper.ts': 'export function helper(value = {}) {\n  return value;\n}\nexport const LIMIT = 3;\n',
  'src/util/unused.js': 'export function lonely() {}\n',
  'py/app.py': 'from .lib import tools\nfrom py.lib.tools import run\nimport os\n\ndef main():\n    run()\n',
  'py/lib/__init__.py': '',
  'py/lib/tools.py': 'def run():\n    pass\n',
  'go.mod': 'module example.com/sample\n\ngo 1.22\n',
  'cmd/main.go': 'package main\nimport "example.com/sample/internal/core"\nfunc main() { core.Run() }\n',
  'internal/core/core.go': 'package core\nfunc Run() {}\n',
  'internal/core/core_test.go': 'package core\nfunc TestRun() {}\n',
  'rs/src/lib.rs': 'mod parser;\nuse crate::parser::parse;\npub fn go() { parse(); }\n',
  'rs/src/parser.rs': 'pub fn parse() {}\n',
  'c/main.c': '#include "util.h"\n#include <stdio.h>\nint main(void) {\n  return add(1, 2);\n}\n',
  'c/util.h': 'int add(int a, int b);\n',
  'java/com/acme/App.java': 'package com.acme;\nimport com.acme.model.Item;\npublic class App {\n    public static void main(String[] args) {\n    }\n}\n',
  'java/com/acme/model/Item.java': 'package com.acme.model;\npublic class Item {\n}\n',
  'rb/main.rb': "require_relative 'lib/thing'\nclass Main\nend\n",
  'rb/lib/thing.rb': 'class Thing\nend\n',
  'sh/run.sh': '#!/bin/bash\nsource ./common.sh\nrun() {\n  say hi\n}\n',
  'sh/common.sh': 'say() {\n  echo "$1"\n}\n',
};

test('ignore patterns: comments, negation, folder rules, wildcards', () => {
  const stack = [{ base: '', rules: compileIgnore(['# note', '*.log', '!keep.log', '/top.txt', 'cache/', 'docs/**/draft-?.md', 'a/**', '\\#odd'].join('\n')) }];
  assert.equal(isIgnored(stack, 'x.log', false), true);
  assert.equal(isIgnored(stack, 'deep/x.log', false), true);
  assert.equal(isIgnored(stack, 'keep.log', false), false);
  assert.equal(isIgnored(stack, 'top.txt', false), true);
  assert.equal(isIgnored(stack, 'sub/top.txt', false), false);
  assert.equal(isIgnored(stack, 'cache', true), true);
  assert.equal(isIgnored(stack, 'cache', false), false);
  assert.equal(isIgnored(stack, 'src/cache', true), true);
  assert.equal(isIgnored(stack, 'docs/a/b/draft-1.md', false), true);
  assert.equal(isIgnored(stack, 'docs/draft-1.md', false), true);
  assert.equal(isIgnored(stack, 'docs/draft-12.md', false), false);
  assert.equal(isIgnored(stack, 'a/b/c', false), true);
  assert.equal(isIgnored(stack, '#odd', false), true);
  // A nested ignore file only speaks for its own folder.
  const nested = [...stack, { base: 'pkg', rules: compileIgnore('/build\n') }];
  assert.equal(isIgnored(nested, 'pkg/build', true), true);
  assert.equal(isIgnored(nested, 'build2', true), false);
  assert.equal(isIgnored(nested, 'other/build', true), false);
  // A broken pattern is dropped, not thrown.
  assert.deepEqual(compileIgnore('[unclosed\n').length <= 1, true);
});

test('the walk skips what must not be mapped and never follows links', async () => {
  const root = project({
    ...SAMPLE,
    '.gitignore': 'secret.txt\nlogs/\n',
    'secret.txt': 'x',
    'logs/a.txt': 'x',
    'node_modules/pkg/index.js': 'x',
    '.git/config': 'x',
    'dist/out.js': 'x',
    'yarn.lock': 'x',
    'app.min.js': 'x',
    'photo.png': 'x',
    'big.txt': 'y'.repeat(5000),
    'sub/.gitignore': '*.tmp\n',
    'sub/a.tmp': 'x',
    'sub/a.txt': 'x',
  });
  const outside = project({ 'outside.js': 'export const stolen = 1;\n' });
  symlinkSync(outside, join(root, 'linked-folder'));
  symlinkSync(join(outside, 'outside.js'), join(root, 'linked-file.js'));
  const { files, skipped, truncated } = await walk(root, { maxFileBytes: 2000, extraIgnore: 'rb/\n' });
  const rels = files.map((file) => file.rel);
  assert.equal(truncated, null);
  for (const gone of ['secret.txt', 'logs/a.txt', 'node_modules/pkg/index.js', '.git/config', 'dist/out.js', 'yarn.lock', 'app.min.js', 'photo.png', 'big.txt', 'sub/a.tmp', 'linked-file.js', 'linked-folder/outside.js', 'rb/main.rb']) {
    assert.ok(!rels.includes(gone), `${gone} should be skipped`);
  }
  assert.ok(rels.includes('sub/a.txt'));
  assert.ok(rels.includes('src/index.js'));
  assert.equal(skipped.links, 2);
  assert.equal(skipped.large, 1);
  assert.deepEqual(rels, [...rels].sort((a, b) => (a < b ? -1 : 1)).sort(() => 0), 'order is stable');
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

test('limits stop a walk instead of letting it run on', async () => {
  const files = {};
  for (let n = 0; n < 60; n += 1) files[`f${String(n).padStart(2, '0')}.js`] = 'x'.repeat(100);
  const root = project(files);
  assert.equal((await walk(root, { maxFiles: 10 })).truncated, 'files');
  assert.equal((await walk(root, { maxFiles: 10 })).files.length, 10);
  assert.equal((await walk(root, { maxTotalBytes: 550 })).truncated, 'bytes');
  assert.equal((await walk(root, { deadline: Date.now() - 1 })).files.length <= 60, true);
  const controller = new AbortController();
  controller.abort();
  const index = await buildIndex(root, { signal: controller.signal });
  assert.equal(index.truncated, 'stopped');
  rmSync(root, { recursive: true, force: true });
});

test('home and system folders are too broad to map', () => {
  assert.equal(tooBroad('/'), true);
  assert.equal(tooBroad(homedir()), true);
  assert.equal(tooBroad(dirname(homedir())), true);
  assert.equal(tooBroad('/usr'), true);
  assert.equal(tooBroad(join(homedir(), 'some', 'project')), false);
});

test('imports are resolved to local files across languages', async () => {
  const root = project(SAMPLE);
  const index = await buildIndex(root, {});
  const links = linkIndex(index);
  assert.deepEqual(links.local['src/index.js'], ['src/server.js', 'src/util/helper.ts']);
  // A .js import finds the .ts file it is compiled from.
  assert.deepEqual(links.local['src/server.js'], ['src/util/helper.ts']);
  assert.deepEqual(links.external['src/server.js'], ['express']);
  assert.deepEqual(links.importedBy['src/util/helper.ts'].sort(), ['src/index.js', 'src/server.js']);
  assert.deepEqual(links.local['py/app.py'].sort(), ['py/lib/__init__.py', 'py/lib/tools.py']);
  assert.deepEqual(links.external['py/app.py'], ['os']);
  // A Go import of the module's own path points at that folder's files, without tests.
  assert.deepEqual(links.local['cmd/main.go'], ['internal/core/core.go']);
  assert.deepEqual(links.local['rs/src/lib.rs'], ['rs/src/parser.rs']);
  assert.deepEqual(links.local['c/main.c'], ['c/util.h']);
  assert.deepEqual(links.external['c/main.c'], ['stdio.h']);
  assert.deepEqual(links.local['java/com/acme/App.java'], ['java/com/acme/model/Item.java']);
  assert.deepEqual(links.local['rb/main.rb'], ['rb/lib/thing.rb']);
  assert.deepEqual(links.local['sh/run.sh'], ['sh/common.sh']);
  assert.equal(links.importedBy['src/util/unused.js'], undefined);
  rmSync(root, { recursive: true, force: true });
});

test('a refresh reuses unchanged files and re-reads changed ones', async () => {
  const root = project(SAMPLE);
  const first = await buildIndex(root, {});
  assert.equal(first.reused, 0);
  const again = await buildIndex(root, { previous: first });
  assert.equal(again.parsed, 0);
  assert.equal(again.reused, Object.keys(first.files).length);
  // Same content, new time: the hash keeps the outline.
  const later = new Date(Date.now() + 5000);
  utimesSync(join(root, 'src/server.js'), later, later);
  const touched = await buildIndex(root, { previous: again });
  assert.equal(touched.parsed, 0);
  // New content: only that file is read again.
  writeFileSync(join(root, 'src/util/unused.js'), 'export function lonely() {}\nexport function fresh() {}\n');
  rmSync(join(root, 'README.md'));
  const changed = await buildIndex(root, { previous: touched });
  assert.equal(changed.parsed, 1);
  assert.ok(changed.files['src/util/unused.js'].symbols.some((s) => s.name === 'fresh'));
  assert.equal(changed.files['README.md'], undefined);
  rmSync(root, { recursive: true, force: true });
});

test('a map is saved, loaded, and an unknown version is rebuilt', async () => {
  const root = project(SAMPLE);
  const data = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-data-')));
  const index = await buildIndex(root, {});
  saveIndex(join(data, 'x'), index);
  assert.deepEqual(Object.keys(loadIndex(join(data, 'x')).files), Object.keys(index.files));
  writeFileSync(join(data, 'x', 'index.json'), JSON.stringify({ ...index, version: 99 }));
  assert.equal(loadIndex(join(data, 'x')), null);
  writeFileSync(join(data, 'x', 'index.json'), '{broken');
  assert.equal(loadIndex(join(data, 'x')), null);
  assert.equal(loadIndex(join(data, 'missing')), null);
  assert.match(folderId(root), /^[a-f0-9]{16}$/);
  const stats = indexStats(index);
  assert.equal(stats.files, Object.keys(index.files).length);
  assert.ok(stats.symbols > 10);
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

test('paths outside the folder are refused', async () => {
  const root = project(SAMPLE);
  const index = await buildIndex(root, {});
  for (const bad of ['../x', '..', 'src/../../etc/passwd', '/etc/passwd', '~/secrets', 'C:\\x', 'a\0b', '', '   ']) {
    assert.ok(safeRel(index, bad).error, `${JSON.stringify(bad)} should be refused`);
  }
  assert.deepEqual(safeRel(index, './src/index.js'), { rel: 'src/index.js' });
  assert.deepEqual(safeRel(index, 'src/util/../index.js'), { rel: 'src/index.js' });
  assert.deepEqual(safeRel(index, `${root}/src/index.js`), { rel: 'src/index.js' });
  assert.deepEqual(safeRel(index, 'src/'), { rel: 'src' });
  const links = linkIndex(index);
  assert.match(fileOutline(index, links, '../../etc/passwd'), /inside the project/);
  assert.match(readPart(index, { path: '/etc/passwd' }), /inside the project/);
  assert.match(readPart(index, { path: 'not/there.js' }), /not in the map/);
  // A file that is not in the map cannot be read, even though it exists.
  writeFileSync(join(root, 'later.js'), 'secret\n');
  assert.equal(readIndexed(index, 'later.js'), null);
  rmSync(root, { recursive: true, force: true });
});

test('a mapped file swapped for a link out of the folder is not read', async () => {
  const root = project(SAMPLE);
  const outside = project({ 'private.js': 'export const key = "outside";\n' });
  const index = await buildIndex(root, {});
  rmSync(join(root, 'src/util/unused.js'));
  symlinkSync(join(outside, 'private.js'), join(root, 'src/util/unused.js'));
  assert.equal(readIndexed(index, 'src/util/unused.js'), null);
  assert.match(readPart(index, { path: 'src/util/unused.js', line: 1 }), /can no longer be read/);
  // A folder swapped for a link is caught too.
  rmSync(join(root, 'rb'), { recursive: true, force: true });
  mkdirSync(join(outside, 'lib'), { recursive: true });
  writeFileSync(join(outside, 'main.rb'), 'class Other\nend\n');
  symlinkSync(outside, join(root, 'rb'));
  assert.equal(readIndexed(index, 'rb/main.rb'), null);
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

test('the overview fits its budget and says how to go deeper', async () => {
  const root = project(SAMPLE);
  const index = await buildIndex(root, {});
  const links = linkIndex(index);
  const text = overview(index, links, {});
  assert.match(text, /^Code map of code-map-test-\w+: 23 files, \d+ symbols/);
  assert.match(text, /Languages: /);
  assert.match(text, /Likely starting points: .*package\.json/);
  assert.match(text, /src\/util\/helper\.ts {2}←2 →0 {2}helper, LIMIT/);
  assert.match(text, /Next: code_map_file/);
  assert.equal(text, overview(index, links, {}), 'same input, same text');
  const small = overview(index, links, { budget: 300 });
  assert.ok(small.length <= 300 * 4);
  const scoped = overview(index, links, { path: 'src' });
  assert.match(scoped, /\/src: 4 files/);
  assert.match(overview(index, links, { path: '../..' }), /inside the project/);
  assert.match(overview(index, links, { path: 'nothing-here' }), /Nothing is mapped under/);
  assert.match(overview(index, links, { running: true }), /still being built/);
  rmSync(root, { recursive: true, force: true });
});

test('a file outline lists symbols and connections, not the body', async () => {
  const root = project(SAMPLE);
  const index = await buildIndex(root, {});
  const links = linkIndex(index);
  const text = fileOutline(index, links, 'src/server.js');
  assert.match(text, /^src\/server\.js: JavaScript, 11 lines/);
  assert.match(text, /Uses \(local\): src\/util\/helper\.ts/);
  assert.match(text, /Uses \(outside\): express/);
  assert.match(text, /Used by \(1\): src\/index\.js/);
  assert.match(text, /L3-5 +export function start\(x\)/);
  assert.match(text, /L7-9 +· listen\(port\)/);
  assert.ok(!text.includes('return helper(x)'), 'the body is not included');
  assert.match(fileOutline(index, links, 'src'), /is a folder with 4 mapped files/);
  assert.match(fileOutline(index, links, 'lib/helper.ts'), /Did you mean: src\/util\/helper\.ts/);
  rmSync(root, { recursive: true, force: true });
});

test('find ranks exact names first and respects kind, folder and limit', async () => {
  const root = project(SAMPLE);
  const index = await buildIndex(root, {});
  const links = linkIndex(index);
  const text = find(index, links, { query: 'run' });
  const lines = text.split('\n');
  assert.match(lines[0], /matches for "run"/);
  assert.match(lines[1], /py\/lib\/tools\.py:1 {2}function run|sh\/run\.sh/);
  assert.ok(text.indexOf('function run') < text.indexOf('TestRun'), 'an exact name comes before a partial one');
  assert.match(find(index, links, { query: 'helper', kind: 'file' }), /src\/util\/helper\.ts {2}file, TypeScript/);
  assert.ok(!find(index, links, { query: 'helper', kind: 'file' }).includes('function helper'));
  assert.match(find(index, links, { query: 'main', path: 'cmd' }), /2 matches for "main":\n {2}cmd\/main\.go:3 {2}function main/);
  assert.ok(!find(index, links, { query: 'main', path: 'cmd' }).includes('java/'), 'only the named folder is searched');
  assert.equal(find(index, links, { query: 'a', limit: 3 }), 'Give at least two characters to search for.');
  assert.equal(find(index, links, { query: 'in', limit: 2 }).split('\n').length, 4);
  assert.match(find(index, links, { query: 'zzzzzz' }), /use grep for text inside files/);
  rmSync(root, { recursive: true, force: true });
});

test('related: a file by its imports, a symbol by its name in connected files', async () => {
  const root = project(SAMPLE);
  const index = await buildIndex(root, {});
  const links = linkIndex(index);
  const file = related(index, links, { target: 'src/util/helper.ts', depth: 2 });
  assert.match(file, /It uses no other mapped file\./);
  assert.match(file, /It is used by:\n {2}directly \(2\): src\/index\.js, src\/server\.js/);
  const deep = related(index, links, { target: 'src/index.js', depth: 2 });
  assert.match(deep, /directly \(2\): src\/server\.js, src\/util\/helper\.ts/);
  const symbol = related(index, links, { target: 'helper' });
  assert.match(symbol, /helper is defined in 1 place:\n {2}src\/util\/helper\.ts:1/);
  assert.match(symbol, /src\/index\.js:3 {2}import \{ helper \}/);
  assert.match(symbol, /src\/server\.js:4 {2}return helper\(x\);/);
  assert.ok(!symbol.slice(symbol.indexOf('Its name appears in')).includes('src/util/helper.ts:1 '), 'the definition is not listed as a use');
  assert.match(related(index, links, { target: 'NoSuchThing' }), /neither a mapped file nor a known symbol/);
  assert.match(related(index, links, { target: '' }), /Give a file path or a symbol name/);
  rmSync(root, { recursive: true, force: true });
});

test('read: one symbol, lines around a line, a short file, never a long file by accident', async () => {
  const long = Array.from({ length: 900 }, (_, n) => (n === 500 ? 'export function needle() {\n  return 42;\n}' : `const v${n} = ${n};`)).join('\n');
  const root = project({ ...SAMPLE, 'src/long.js': long });
  const index = await buildIndex(root, {});
  const symbol = readPart(index, { path: 'src/long.js', symbol: 'needle' });
  assert.match(symbol, /^src\/long\.js {2}function needle {2}L501-503 of 902\n501 {2}export function needle\(\) \{\n502 {4}return 42;\n503 {2}\}$/);
  const around = readPart(index, { path: 'src/long.js', line: 10, context: 3 });
  assert.match(around, /around line 10 {2}L7-13 of 902/);
  assert.equal(around.split('\n').length, 8);
  assert.match(readPart(index, { path: 'src/long.js' }), /has 902 lines\. Name a symbol/);
  assert.match(readPart(index, { path: 'src/server.js' }), /whole file, it is short/);
  assert.match(readPart(index, { path: 'src/server.js', symbol: 'Server.listen' }), /method Server\.listen {2}L7-9/);
  assert.match(readPart(index, { path: 'src/server.js', symbol: 'liste' }), /No symbol named "liste".*Close: listen/);
  // A huge symbol is cut, with a way to continue.
  const huge = `export function wide() {\n${'  step();\n'.repeat(900)}}\n`;
  writeFileSync(join(root, 'src/wide.js'), huge);
  const next = await buildIndex(root, { previous: index });
  const cut = readPart(next, { path: 'src/wide.js', symbol: 'wide' });
  assert.match(cut, /L1-400 of 903/);
  assert.match(cut, /stopped at line 400; continue with code_map_read/);
  rmSync(root, { recursive: true, force: true });
});

test('the manager builds on first use, keeps the map outside the project, and can clear it', async () => {
  const root = project(SAMPLE);
  const data = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-data-')));
  const before = readdirSync(root).sort();
  const manager = createManager({ dataDir: data, refreshMs: 0 });
  assert.equal(manager.looksLikeProject(root), true);
  const map = await manager.ensure(root);
  assert.equal(map.running, false);
  assert.equal(Object.keys(map.index.files).length, 23);
  assert.deepEqual(readdirSync(root).sort(), before, 'nothing is written into the project');
  const id = manager.idOf(root);
  assert.ok(existsSync(join(data, id, 'index.json')));
  const rows = manager.list();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].folder, root);
  assert.equal(rows[0].files, 23);
  assert.ok(rows[0].diskBytes > 0);
  assert.equal(manager.folderOf(id), root);
  // A second manager (after a restart) loads the saved map.
  const second = createManager({ dataDir: data });
  assert.equal(second.folderOf(id), root);
  assert.equal(Object.keys((await second.ensure(root)).index.files).length, 23);
  // A change shows up at the next use.
  writeFileSync(join(root, 'src/new.js'), 'export function added() {}\n');
  assert.ok((await manager.ensure(root)).index.files['src/new.js']);
  assert.equal((await manager.rebuild(root)).index.reused, 0);
  assert.equal(manager.clear(id), true);
  assert.equal(existsSync(join(data, id)), false);
  assert.equal(manager.clear(id), false);
  assert.equal(manager.clear('../../etc'), false);
  assert.equal(manager.folderOf('not-an-id'), null);
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});

test('the manager refuses broad or missing folders and answers while a build is running', async () => {
  const data = realpathSync(mkdtempSync(join(tmpdir(), 'code-map-data-')));
  const manager = createManager({ dataDir: data });
  assert.match((await manager.ensure(homedir())).error, /too broad/);
  assert.match((await manager.ensure('')).error, /no folder/);
  assert.match((await manager.ensure(join(tmpdir(), 'no-such-folder-xyz'))).error, /no longer exists/);
  assert.equal(manager.looksLikeProject(homedir()), false);
  assert.equal(readdirSync(data).length, 0);
  // A wait of zero returns at once with whatever has been read, marked as still running.
  const files = {};
  for (let n = 0; n < 400; n += 1) files[`m${n}.js`] = `export function f${n}() {}\n`;
  const root = project(files);
  const early = await manager.ensure(root, 0);
  assert.equal(early.running, true);
  assert.ok(Object.keys(early.index.files).length < 400);
  const done = await manager.ensure(root, 20000);
  assert.equal(done.running, false);
  assert.equal(Object.keys(done.index.files).length, 400);
  rmSync(root, { recursive: true, force: true });
  rmSync(data, { recursive: true, force: true });
});
