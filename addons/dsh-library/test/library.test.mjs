import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, test } from 'node:test';
import { PIECE, extract, hooks, kindOf, pieces, slideText } from '../lib/extract.js';
import { plan, walk } from '../lib/scan.js';
import { checkFolder, ftsQuery, openLibrary } from '../lib/store.js';
import { buildTools, createIndexer } from '../index.js';

const realHooks = { ...hooks };
const dirs = [];
afterEach(() => {
  Object.assign(hooks, realHooks);
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const temp = () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-library-')));
  dirs.push(dir);
  return dir;
};

test('which files the Library reads', () => {
  assert.equal(kindOf('/a/Notes.MD'), 'text');
  assert.equal(kindOf('/a/paper.pdf'), 'pdf');
  assert.equal(kindOf('/a/essay.docx'), 'doc');
  assert.equal(kindOf('/a/week4.pptx'), 'slides');
  assert.equal(kindOf('/a/photo.jpg'), undefined);
  assert.equal(kindOf('/a/script.js'), undefined);
  assert.equal(kindOf('/a/noending'), undefined);
});

test('text is cut into pieces at paragraph ends, each with its first line', () => {
  const para = (n) => `Paragraph ${n} ${'word '.repeat(120)}`.trim();
  const text = [para(1), '', para(2), '', para(3), '', para(4)].join('\n');
  const cut = pieces(text);
  assert.ok(cut.length >= 2);
  assert.equal(cut[0].line, 1);
  assert.ok(cut[0].text.startsWith('Paragraph 1'));
  assert.ok(cut.every((piece) => piece.text.length <= PIECE * 1.6));
  assert.ok(cut[1].line > 1);
  assert.equal(cut.map((piece) => piece.text).join('\n\n').match(/Paragraph \d/g).length, 4);

  // One endless line is cut at spaces; nothing is lost.
  const long = 'alpha '.repeat(1000).trim();
  const parts = pieces(long);
  assert.ok(parts.length > 3);
  assert.equal(parts.map((piece) => piece.text).join(' ').split(/\s+/).length, 1000);

  assert.deepEqual(pieces(''), []);
  assert.deepEqual(pieces('--- \n\n ***'), []);
  assert.deepEqual(pieces('one line'), [{ line: 1, text: 'one line' }]);
});

test('the words on a slide come out of its XML', () => {
  const xml = '<p:sld><a:p><a:r><a:t>Supply &amp; </a:t></a:r><a:r><a:t xml:space="preserve">demand</a:t></a:r></a:p><a:p><a:r><a:t>Price &lt; cost</a:t></a:r></a:p><a:p></a:p></p:sld>';
  assert.equal(slideText(xml), 'Supply & demand\nPrice < cost');
});

test('each kind of document becomes pieces with a place', async () => {
  const dir = temp();
  writeFileSync(join(dir, 'notes.md'), '# Week 4\n\nElasticity measures response.\n');
  assert.deepEqual(await extract(join(dir, 'notes.md')), [{ where: 'line 1', text: '# Week 4\n\nElasticity measures response.' }]);

  hooks.pdf = async () => ['First page words.', '', 'Third page words.'];
  assert.deepEqual(await extract('/x/paper.pdf'), [{ where: 'page 1', text: 'First page words.' }, { where: 'page 3', text: 'Third page words.' }]);

  hooks.slides = async () => ['Title slide', 'Second slide'];
  assert.deepEqual(await extract('/x/deck.pptx'), [{ where: 'slide 1', text: 'Title slide' }, { where: 'slide 2', text: 'Second slide' }]);

  hooks.convert = async () => 'Essay text.';
  assert.deepEqual(await extract('/x/essay.docx'), [{ where: 'part 1', text: 'Essay text.' }]);

  // A scan: pages, but no words.
  hooks.pdf = async () => ['', ' '];
  assert.deepEqual(await extract('/x/scan.pdf'), []);
  await assert.rejects(extract('/x/photo.jpg'), /not a kind/);
});

test('a typed search becomes a safe query', () => {
  assert.equal(ftsQuery('marginal utility'), '"marginal" "utility"');
  assert.equal(ftsQuery('marginal utility', false), '"marginal" OR "utility"');
  assert.equal(ftsQuery('"opportunity cost" definition'), '"opportunity cost" "definition"');
  assert.equal(ftsQuery('C++ AND (x OR *) NEAR "'), '"C" "AND" "x" "OR" "NEAR"');
  assert.equal(ftsQuery('économie'), '"économie"');
  assert.equal(ftsQuery('  ?? !! '), '');
  assert.equal(ftsQuery(Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ')).split(' ').length, 16);
});

test('a folder is checked before it is added', () => {
  const home = temp();
  const docs = join(home, 'Documents');
  mkdirSync(join(docs, 'Economics'), { recursive: true });
  mkdirSync(join(home, '.dsh'));
  writeFileSync(join(docs, 'file.txt'), 'x');
  const rules = { home, forbidden: [join(home, '.dsh')], existing: [] };
  assert.deepEqual(checkFolder(docs, rules), { path: docs });
  assert.deepEqual(checkFolder('~/Documents/Economics/', rules), { path: join(docs, 'Economics') });
  assert.match(checkFolder('', rules).error, /Type or choose/);
  assert.match(checkFolder('Documents', rules).error, /full path/);
  assert.match(checkFolder(join(home, 'Nope'), rules).error, /does not exist/);
  assert.match(checkFolder(join(docs, 'file.txt'), rules).error, /a file/);
  assert.match(checkFolder('~', rules).error, /too much/);
  assert.match(checkFolder('/', rules).error, /too much/);
  assert.match(checkFolder(join(home, '.dsh'), rules).error, /app itself/);
  assert.match(checkFolder(docs, { ...rules, existing: [docs] }).error, /already in the Library/);
  assert.match(checkFolder(join(docs, 'Economics'), { ...rules, existing: [docs] }).error, /already covered/);
  assert.match(checkFolder(docs, { ...rules, existing: [join(docs, 'Economics')] }).error, /Remove that one first/);
});

test('the walk finds documents and leaves the rest', () => {
  const dir = temp();
  mkdirSync(join(dir, 'sub', 'deep'), { recursive: true });
  mkdirSync(join(dir, '.hidden'));
  mkdirSync(join(dir, 'node_modules'));
  mkdirSync(join(dir, 'Tool.app'));
  mkdirSync(join(dir, 'Library'));
  writeFileSync(join(dir, 'a.txt'), 'a');
  writeFileSync(join(dir, 'sub', 'b.md'), 'b');
  writeFileSync(join(dir, 'sub', 'deep', 'c.pdf'), 'c');
  writeFileSync(join(dir, 'Library', 'd.txt'), 'd');
  writeFileSync(join(dir, 'empty.txt'), '');
  writeFileSync(join(dir, 'photo.jpg'), 'x');
  writeFileSync(join(dir, '.secret.txt'), 'x');
  writeFileSync(join(dir, '~$draft.docx'), 'x');
  writeFileSync(join(dir, '.hidden', 'e.txt'), 'x');
  writeFileSync(join(dir, 'node_modules', 'f.md'), 'x');
  writeFileSync(join(dir, 'Tool.app', 'g.txt'), 'x');
  symlinkSync(join(dir, 'a.txt'), join(dir, 'link.txt'));
  const found = walk(dir);
  assert.equal(found.missing, false);
  assert.equal(found.full, false);
  assert.deepEqual(found.files.map((file) => file.path.slice(dir.length + 1)).sort(), ['Library/d.txt', 'a.txt', 'sub/b.md', 'sub/deep/c.pdf']);
  assert.deepEqual(found.files.find((file) => file.path.endsWith('c.pdf')).kind, 'pdf');
  assert.equal(walk(join(dir, 'gone')).missing, true);
  assert.equal(walk(join(dir, 'a.txt')).missing, true);
});

test('only new and changed documents are read again', () => {
  const known = new Map([['/a', { mtime: 1, size: 10 }], ['/b', { mtime: 1, size: 10 }], ['/gone', { mtime: 1, size: 10 }]]);
  const found = [{ path: '/a', mtime: 1, size: 10 }, { path: '/b', mtime: 2, size: 10 }, { path: '/new', mtime: 5, size: 3 }];
  const todo = plan(known, found);
  assert.deepEqual(todo.add.map((file) => file.path), ['/b', '/new']);
  assert.deepEqual(todo.remove, ['/gone']);
});

function sample() {
  const library = openLibrary(':memory:');
  library.addFolder('/docs', 1);
  library.put({ folder: '/docs', path: '/docs/smith.pdf', mtime: 1, size: 9 }, [
    { where: 'page 1', text: 'Introduction to consumer choice.' },
    { where: 'page 14', text: 'Marginal utility falls as consumption rises. Cars are a common example.' },
    { where: 'page 15', text: 'The économie of scale lowers average cost.' },
  ], 100);
  library.put({ folder: '/docs', path: '/docs/notes.md', mtime: 1, size: 9 }, [{ where: 'line 3', text: 'Utility: see Smith on marginal thinking.' }], 200);
  library.put({ folder: '/docs', path: '/docs/scan.pdf', mtime: 1, size: 9 }, [], 300);
  library.fail({ folder: '/docs', path: '/docs/locked.pdf', mtime: 1, size: 9 }, 'protected by a password', 400);
  return library;
}

test('search finds passages by stem, without accents, best first', () => {
  const library = sample();
  const one = library.search('marginal utility');
  assert.equal(one.loose, false);
  assert.deepEqual(one.hits.map((hit) => `${hit.name} ${hit.where}`).sort(), ['notes.md line 3', 'smith.pdf page 14']);
  assert.equal(one.hits[0].folder, '/docs');
  assert.equal(typeof one.hits[0].position, 'number');

  assert.deepEqual(library.search('car').hits.map((hit) => hit.where), ['page 14']);
  assert.deepEqual(library.search('economie').hits.map((hit) => hit.where), ['page 15']);
  assert.deepEqual(library.search('"consumer choice"').hits.map((hit) => hit.where), ['page 1']);
  assert.deepEqual(library.search('"choice consumer"').hits, []);

  // Not every word together: fall back to any of them, and say so.
  const loose = library.search('marginal elephants');
  assert.equal(loose.loose, true);
  assert.equal(loose.hits.length, 2);
  assert.deepEqual(library.search('elephants').hits, []);
  assert.deepEqual(library.search('???').hits, []);

  // One folder only; a % in the name is not a wildcard.
  assert.equal(library.search('utility', { folder: '/docs' }).hits.length, 2);
  assert.equal(library.search('utility', { folder: '/other' }).hits.length, 0);
  assert.equal(library.search('utility', { folder: '/d%' }).hits.length, 0);
  assert.equal(library.search('utility', { limit: 1 }).hits.length, 1);
  library.close();
});

test('at most three passages come from one document', () => {
  const library = openLibrary(':memory:');
  library.put({ folder: '/d', path: '/d/big.txt', mtime: 1, size: 1 }, Array.from({ length: 10 }, (_, i) => ({ where: `line ${i}`, text: `inflation paragraph ${i}` })));
  library.put({ folder: '/d', path: '/d/small.txt', mtime: 1, size: 1 }, [{ where: 'line 1', text: 'inflation once' }]);
  const hits = library.search('inflation', { limit: 20 }).hits;
  assert.equal(hits.filter((hit) => hit.name === 'big.txt').length, 3);
  assert.equal(hits.filter((hit) => hit.name === 'small.txt').length, 1);
  library.close();
});

test('reading on from a passage', () => {
  const library = sample();
  const start = library.read('/docs/smith.pdf', 1);
  assert.equal(start.text, '[page 14]\nMarginal utility falls as consumption rises. Cars are a common example.\n\n[page 15]\nThe économie of scale lowers average cost.');
  assert.equal(start.next, undefined);
  assert.equal(start.pieces, 3);
  assert.equal(library.read('/docs/smith.pdf', 99).text, '');
  assert.equal(library.read('/docs/scan.pdf'), undefined);
  assert.equal(library.read('/docs/nope.pdf'), undefined);

  const long = openLibrary(':memory:');
  long.put({ folder: '/d', path: '/d/long.txt', mtime: 1, size: 1 }, Array.from({ length: 12 }, (_, i) => ({ where: `line ${i * 10 + 1}`, text: `Piece ${i}. ${'x'.repeat(1100)}` })));
  const first = long.read('/d/long.txt');
  assert.ok(first.text.startsWith('[line 1]\nPiece 0.'));
  assert.equal(first.next, 5);
  const last = long.read('/d/long.txt', 10);
  assert.equal(last.next, undefined);
  assert.ok(last.text.includes('Piece 11.'));
  long.close();
  library.close();
});

test('counts, problems, replacing and removing', () => {
  const library = sample();
  assert.deepEqual(library.stats(), { '/docs': { ok: 2, empty: 1, failed: 1, pieces: 4, at: 400 } });
  assert.deepEqual(library.problems().map((problem) => `${problem.path} ${problem.state}`), ['/docs/locked.pdf failed', '/docs/scan.pdf empty']);
  assert.deepEqual([...library.known('/docs').keys()].sort(), ['/docs/locked.pdf', '/docs/notes.md', '/docs/scan.pdf', '/docs/smith.pdf']);

  // A changed document replaces its old words.
  library.put({ folder: '/docs', path: '/docs/notes.md', mtime: 2, size: 9 }, [{ where: 'line 1', text: 'Now about inflation.' }]);
  assert.equal(library.search('marginal').hits.length, 1);
  assert.equal(library.search('inflation').hits.length, 1);
  library.drop('/docs/smith.pdf');
  assert.equal(library.search('marginal').hits.length, 0);

  library.addFolder('/other');
  library.put({ folder: '/other', path: '/other/x.txt', mtime: 1, size: 1 }, [{ where: 'line 1', text: 'inflation elsewhere' }]);
  library.removeFolder('/docs');
  assert.deepEqual(library.folders().map((folder) => folder.path), ['/other']);
  assert.deepEqual(library.search('inflation').hits.map((hit) => hit.path), ['/other/x.txt']);
  assert.deepEqual(Object.keys(library.stats()), ['/other']);
  library.close();
});

test('the index is kept on disk', () => {
  const dir = temp();
  const file = join(dir, 'library', 'index.sqlite');
  const first = openLibrary(file);
  first.addFolder('/docs');
  first.put({ folder: '/docs', path: '/docs/a.txt', mtime: 1, size: 1 }, [{ where: 'line 1', text: 'kept words' }]);
  first.close();
  const second = openLibrary(file);
  assert.equal(second.search('kept').hits.length, 1);
  assert.equal(second.folders().length, 1);
  second.close();
});

test('the indexer reads new files, re-reads changed ones and forgets deleted ones', async () => {
  const dir = temp();
  writeFileSync(join(dir, 'a.txt'), 'alpha words');
  writeFileSync(join(dir, 'b.md'), 'beta words');
  writeFileSync(join(dir, 'bad.pdf'), 'x');
  const library = openLibrary(':memory:');
  library.addFolder(dir);
  library.addFolder(join(dir, 'gone'));
  const reads = [];
  const indexer = createIndexer({
    library,
    read: async (path, kind) => {
      reads.push(path.slice(dir.length + 1));
      if (kind === 'pdf') throw new Error('macOS could not read this PDF');
      return extract(path, kind);
    },
  });
  await indexer.sync();
  assert.deepEqual(reads.sort(), ['a.txt', 'b.md', 'bad.pdf']);
  assert.equal(library.search('alpha').hits.length, 1);
  assert.deepEqual(library.stats()[dir], { ok: 2, empty: 0, failed: 1, pieces: 2, at: library.stats()[dir].at });
  const status = indexer.status();
  assert.equal(status.scanning, false);
  assert.equal(status.done, 3);
  assert.deepEqual(status.missing, [join(dir, 'gone')]);

  // Nothing changed: nothing is read. The failed file is not tried again either.
  reads.length = 0;
  await indexer.sync();
  assert.deepEqual(reads, []);

  // One changed, one deleted, one new.
  writeFileSync(join(dir, 'a.txt'), 'gamma words now');
  utimesSync(join(dir, 'a.txt'), new Date(), new Date(Date.now() + 5000));
  rmSync(join(dir, 'b.md'));
  writeFileSync(join(dir, 'c.txt'), 'delta words');
  await indexer.sync();
  assert.deepEqual(reads.sort(), ['a.txt', 'c.txt']);
  assert.equal(library.search('alpha').hits.length, 0);
  assert.equal(library.search('gamma').hits.length, 1);
  assert.equal(library.search('beta').hits.length, 0);
  assert.equal(library.search('delta').hits.length, 1);
  library.close();
});

test('the tools answer in plain text the assistant can quote from', async () => {
  const library = sample();
  let on = true;
  let scanning = false;
  const [search, read] = buildTools({ library, enabled: () => on, status: () => ({ scanning, done: 2, total: 9 }) });
  assert.equal(search.name, 'library_search');
  assert.equal(read.name, 'library_read');

  const found = (await search.execute({ query: 'marginal utility' })).text;
  assert.match(found, /^2 passages from the user's Library/);
  assert.match(found, /smith\.pdf, page 14\n {3}file: \/docs\/smith\.pdf\n {3}position: 1\n {3}\| Marginal utility falls/);
  assert.match((await search.execute({ query: 'marginal elephants' })).text, /^No passage has all of those words together/);
  assert.match((await search.execute({ query: 'elephants' })).text, /Nothing in the Library matches/);
  scanning = true;
  assert.match((await search.execute({ query: 'utility' })).text, /still reading documents \(2 of 9\)/);
  scanning = false;

  const more = (await read.execute({ file: '/docs/smith.pdf', position: 1 })).text;
  assert.match(more, /\[page 14\]/);
  assert.match(more, /That is the end of the document\.$/);
  assert.match((await read.execute({ file: '/docs/nope.pdf' })).text, /not in the Library/);
  assert.match((await read.execute({ file: '/docs/smith.pdf', position: 50 })).text, /nothing at that position/);

  on = false;
  assert.match((await search.execute({ query: 'utility' })).text, /switched off/);
  assert.match((await read.execute({ file: '/docs/smith.pdf' })).text, /switched off/);
  on = true;
  const empty = openLibrary(':memory:');
  const [emptySearch] = buildTools({ library: empty, enabled: () => true, status: () => ({}) });
  assert.match((await emptySearch.execute({ query: 'x' })).text, /no folders yet/);
  empty.close();
  library.close();
});
