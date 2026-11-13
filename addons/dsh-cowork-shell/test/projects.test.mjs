import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { addFile, canonical, listFiles, noteOf, openProjects, safeName } from '../lib/projects.js';

const temp = () => mkdtempSync(join(tmpdir(), 'cws-proj-'));

test('a project record keeps its tab and instructions, field by field', () => {
  const dir = temp();
  const file = join(dir, 'home', 'projects.json');
  const store = openProjects(file);
  store.save(dir, { tab: 'cowork' });
  store.save(dir, { instructions: 'Write in British English.' });
  assert.deepEqual(store.get(dir), { tab: 'cowork', instructions: 'Write in British English.' });
  // A second reader sees the same, under the folder's real path.
  assert.deepEqual(openProjects(file).all()[canonical(dir)], { tab: 'cowork', instructions: 'Write in British English.' });
  assert.equal(store.forget(dir), true);
  assert.equal(store.get(dir), undefined);
});

test('instructions are cut at the limit and the note names the project', () => {
  const store = openProjects('');
  const saved = store.save('/nowhere/x', { instructions: 'a'.repeat(20000) });
  assert.equal(saved.instructions.length, 12000);
  assert.equal(noteOf('Books', '  '), '');
  assert.match(noteOf('Books', 'Be brief.'), /project "Books"[\s\S]*Be brief\./);
});

test('files are listed newest first, without hidden files', () => {
  const dir = temp();
  writeFileSync(join(dir, 'a.txt'), 'one');
  writeFileSync(join(dir, '.secret'), 'x');
  mkdirSync(join(dir, 'sub'));
  writeFileSync(join(dir, 'sub', 'b.csv'), 'x,y');
  mkdirSync(join(dir, 'node_modules'));
  writeFileSync(join(dir, 'node_modules', 'c.js'), '');
  const { files, more } = listFiles(dir);
  assert.deepEqual(files.map((f) => f.name).sort(), ['a.txt', 'sub/b.csv']);
  assert.equal(more, false);
});

test('an added file never replaces one and cannot leave the folder', () => {
  const dir = temp();
  assert.equal(addFile(dir, 'notes.txt', Buffer.from('first')), 'notes.txt');
  assert.equal(addFile(dir, 'notes.txt', Buffer.from('second')), 'notes (2).txt');
  assert.equal(readFileSync(join(dir, 'notes.txt'), 'utf8'), 'first');
  assert.equal(addFile(dir, '../../evil.txt', Buffer.from('x')), 'evil.txt');
  assert.equal(readFileSync(join(dir, 'evil.txt'), 'utf8'), 'x');
  assert.equal(safeName('..hidden'), 'hidden');
  assert.throws(() => addFile(dir, '...', Buffer.from('x')), /no usable name/);
  assert.throws(() => addFile(join(dir, 'missing'), 'a.txt', Buffer.from('x')), /not there/);
});
