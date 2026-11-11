import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTools, readSettings, sweepPages } from '../index.js';
import { resolvePdf } from '../lib/access.js';
import { layoutText, ocrText } from '../lib/layout.js';
import { createReader, pageRange, searchPages, shortList, tidy } from '../lib/reader.js';
import { SKILLS } from '../skills.js';
import { makePdf } from './make-pdf.mjs';

const onMac = process.platform === 'darwin' && existsSync('/usr/bin/osascript');

/** A throwaway folder, removed when the test ends. */
function folder(t) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'dsh-pdf-test-')));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

/** A reader over a made-up document, with no macOS involved. */
function fakeReader(pages, extra = {}) {
  const calls = [];
  const reader = createReader({
    run: async (request) => {
      calls.push(request);
      if (request.op === 'load') return { pages: pages.length, title: 'Made up', author: '', width: 612, height: 792, outline: extra.outline ?? [], text: pages };
      if (request.op === 'layout') return { pages: request.pages.map((page) => ({ page, runs: [{ t: `laid ${page}`, x: 10, y: 700, w: 40, h: 10 }] })) };
      if (request.op === 'image') return { out: request.out, width: 1224, height: 1584 };
      if (request.op === 'ocr') return { lines: extra.ocr ?? [] };
      throw new Error('unexpected');
    },
  });
  return { reader, calls, ref: { file: '/x/doc.pdf', size: 1, mtime: 1 } };
}

test('which PDFs may be opened', (t) => {
  const dir = folder(t);
  const work = join(dir, 'work');
  const papers = join(dir, 'papers');
  const secret = join(dir, 'secret');
  for (const each of [work, papers, secret, join(work, 'sub')]) mkdirSync(each, { recursive: true });
  for (const file of [join(work, 'a.pdf'), join(work, 'sub', 'b.PDF'), join(papers, 'c.pdf'), join(secret, 'd.pdf'), join(work, 'notes.txt')]) writeFileSync(file, 'x');
  symlinkSync(join(secret, 'd.pdf'), join(work, 'link.pdf'));

  assert.equal(resolvePdf('a.pdf', { cwd: work }).file, join(work, 'a.pdf'));
  assert.equal(resolvePdf('sub/b.PDF', { cwd: work }).file, join(work, 'sub', 'b.PDF'));
  assert.equal(resolvePdf(join(papers, 'c.pdf'), { cwd: work, folders: [papers] }).file, join(papers, 'c.pdf'));
  assert.match(resolvePdf(join(papers, 'c.pdf'), { cwd: work }).error, /outside this conversation's folder/);
  assert.match(resolvePdf('../secret/d.pdf', { cwd: work }).error, /outside/);
  assert.match(resolvePdf('link.pdf', { cwd: work }).error, /outside/, 'a link out of the folder is followed and refused');
  assert.equal(resolvePdf(join(secret, 'd.pdf'), { cwd: work, anywhere: true }).file, join(secret, 'd.pdf'));
  assert.match(resolvePdf('notes.txt', { cwd: work, anywhere: true }).error, /\.pdf/);
  assert.match(resolvePdf('missing.pdf', { cwd: work }).error, /no file/);
  assert.match(resolvePdf('sub.pdf', {}).error, /full path/);
  assert.match(resolvePdf('', { cwd: work }).error, /path of a PDF/);
  assert.match(resolvePdf('a\0.pdf', { cwd: work }).error, /path of a PDF/);
  assert.equal(resolvePdf('~/a.pdf', { home: work, cwd: papers, folders: [work] }).file, join(work, 'a.pdf'));
  const ref = resolvePdf('a.pdf', { cwd: work });
  assert.equal(ref.size, 1);
  assert.equal(ref.mtime, Math.round(statSync(join(work, 'a.pdf')).mtimeMs));
});

test('reading pages: page numbers, ranges, the size limit and scans', async () => {
  const { reader, ref, calls } = fakeReader(['First page text.', '', 'Third page, a little longer than the others, with words.', 'x'.repeat(5000), 'Last.']);
  assert.equal(await reader.read(ref, { from: 1, to: 1 }), '--- page 1 of 5 ---\nFirst page text.');
  const second = await reader.read(ref, { from: 2, to: 3 });
  assert.match(second, /--- page 2 of 5 ---\n\[No text layer on this page/);
  assert.match(second, /--- page 3 of 5 ---\nThird page/);
  const sparse = fakeReader(['p. 7']);
  assert.match(await sparse.reader.read(sparse.ref), /p\. 7\n\[Almost no text on this page/);

  // The limit stops between pages and says where to go on; one over-long page is cut.
  const limited = await reader.read(ref, { from: 3, to: 5, maxChars: 2000 });
  assert.match(limited, /--- page 3 of 5 ---/);
  assert.doesNotMatch(limited, /--- page 4 of 5 ---/);
  assert.match(limited, /Stopped before page 4.*from=4/);
  const cut = await reader.read(ref, { from: 4, to: 4, maxChars: 2000 });
  assert.match(cut, /longer than one answer can hold/);
  assert.ok(cut.length < 2300);

  assert.match(await reader.read(ref, { from: 99 }), /--- page 5 of 5 ---\nLast\./, 'a page past the end reads the last page');
  assert.deepEqual(pageRange(3, 2, 10), { from: 3, to: 10 });
  assert.deepEqual(pageRange(undefined, undefined, 10), { from: 1, to: 10 });
  assert.deepEqual(pageRange(-4, 4.4, 10), { from: 1, to: 4 });

  // Layout mode asks macOS for positions, at most 12 pages a call.
  const { reader: long, ref: longRef, calls: longCalls } = fakeReader(Array.from({ length: 20 }, (_, i) => `page ${i + 1} has some words on it`));
  const laid = await long.read(longRef, { layout: true });
  assert.match(laid, /--- page 12 of 20 ---\nlaid 12/);
  assert.match(laid, /Stopped before page 13/);
  assert.deepEqual(longCalls.find((call) => call.op === 'layout').pages.length, 12);

  // The text is loaded once and then served from memory.
  assert.equal(calls.filter((call) => call.op === 'load').length, 1);
  assert.equal(reader.size(), 1);
  assert.equal(tidy('a  \r\nb\n\n\n\nc '), 'a\nb\n\nc');
});

test('facts about a document', async () => {
  const { reader, ref } = fakeReader(['Intro words here for the first page.', '', 'More words on page three of this file.'], { outline: [{ title: 'Introduction', page: 1, level: 1 }, { title: 'Details', page: 3, level: 2 }] });
  const info = await reader.info(ref);
  assert.match(info, /Pages: 3 \(612 × 792 points\)/);
  assert.match(info, /Title: Made up/);
  assert.match(info, /Pages without a text layer.*: 2/);
  assert.match(info, /- Introduction \(page 1\)\n {2}- Details \(page 3\)/);
  const scan = fakeReader(['', '']);
  assert.match(await scan.reader.info(scan.ref), /this is a scan/);
  assert.equal(shortList([1, 2, 3, 7, 9, 10]), '1-3, 7, 9-10');
});

test('search finds phrases across line breaks and split words, with page numbers', async () => {
  const pages = ['The Budget was approved\nin March.', 'Results were cross-\nchecked and con-\nfirmed by audit.', 'budget BUDGET'];
  assert.deepEqual(searchPages(pages, 'approved in march').pages, [1]);
  assert.deepEqual(searchPages(pages, 'cross-checked').pages, [2]);
  assert.deepEqual(searchPages(pages, 'confirmed').pages, [2]);
  const budget = searchPages(pages, 'budget');
  assert.equal(budget.total, 3);
  assert.deepEqual(budget.pages, [1, 3]);
  assert.equal(searchPages(pages, 'budget', 1).hits.length, 1);
  assert.equal(searchPages(pages, 'x').total, 0, 'one character is too little');

  const { reader, ref } = fakeReader([...pages, '']);
  assert.match(await reader.search(ref, 'audit'), /"audit": 1 hit on page 2\.\np\.2: .*con-?firmed by audit/);
  assert.match(await reader.search(ref, 'unicorn'), /does not appear.*1 page\(s\) have no text layer and were not searched \(4\)/);
  assert.match(await reader.search(ref, ' '), /at least two characters/);
});

test('columns stay apart, and recognised lines come out in reading order', () => {
  const runs = [
    { t: 'Total', x: 382, y: 650, w: 28, h: 12 },
    { t: 'Region', x: 72, y: 650, w: 36, h: 12 },
    { t: 'Q1', x: 222, y: 650, w: 14, h: 12 },
    { t: 'North', x: 72, y: 632, w: 29, h: 12 },
    { t: '120', x: 222, y: 632, w: 18, h: 12 },
    { t: '255', x: 382, y: 632, w: 18, h: 12 },
    { t: 'The', x: 72, y: 600, w: 20, h: 12 },
    { t: 'East', x: 95, y: 600, w: 22, h: 12 },
  ];
  const lines = layoutText(runs).split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Region {3,}Q1 {3,}Total$/);
  assert.match(lines[1], /^North {3,}120 {3,}255$/);
  assert.equal(lines[2], 'The East');
  assert.equal(layoutText([]), '');
  assert.equal(layoutText([{ t: '  ', x: 1, y: 1, w: 1, h: 1 }]), '');

  const ocr = ocrText([
    { text: 'second line', x: 0.1, y: 0.7, w: 0.3, h: 0.02 },
    { text: '4.50', x: 0.6, y: 0.9, w: 0.1, h: 0.02 },
    { text: 'Cable', x: 0.1, y: 0.901, w: 0.1, h: 0.02 },
    { text: '', x: 0, y: 0, w: 0, h: 0 },
  ]);
  assert.equal(ocr, 'Cable   4.50\nsecond line');
  assert.equal(ocrText(undefined), '');
});

test('the tools: fenced in, switched off, and never throwing', async (t) => {
  const dir = folder(t);
  writeFileSync(join(dir, 'doc.pdf'), 'x');
  const { reader } = fakeReader(['Hello from page one of the document.'], { ocr: [{ text: 'Scanned words', confidence: 0.3, x: 0.1, y: 0.9, w: 0.3, h: 0.02 }] });
  let now = { enabled: true, folders: [], anywhere: false, readChars: 30000 };
  const tools = buildTools({ reader, settings: () => now, folderOf: async () => dir, pagePath: (file, page) => join(dir, `p${page}.png`) });
  const tool = (name) => tools.find((item) => item.name === name);
  assert.deepEqual(tools.map((item) => item.name), ['pdf_info', 'pdf_read', 'pdf_search', 'pdf_page_image', 'pdf_ocr']);
  for (const item of tools) {
    assert.equal(item.parameters.additionalProperties, false);
    assert.ok(item.parameters.required.includes('path'));
    assert.ok(item.description.length < 260, item.name);
  }

  assert.match((await tool('pdf_read').execute({ path: 'doc.pdf' }, {})).text, /--- page 1 of 1 ---\nHello from page one/);
  assert.match((await tool('pdf_info').execute({ path: 'doc.pdf' }, {})).text, /Pages: 1/);
  assert.match((await tool('pdf_search').execute({ path: 'doc.pdf', query: 'hello' }, {})).text, /1 hit on page 1/);
  const image = (await tool('pdf_page_image').execute({ path: 'doc.pdf', page: 1 }, {})).text;
  assert.match(image, /1224 × 1584 pixels/);
  assert.ok(image.includes(join(dir, 'p1.png')));
  assert.match((await tool('pdf_page_image').execute({ path: 'doc.pdf', page: 7 }, {})).text, /could not be read: There is no page 7/);
  assert.match((await tool('pdf_ocr').execute({ path: 'doc.pdf', page: 1 }, {})).text, /recognised from the picture ---\nScanned words\n\[1 of 1 lines were hard to read/);

  assert.match((await tool('pdf_read').execute({ path: '/etc/passwd' }, {})).text, /\.pdf/);
  assert.match((await tool('pdf_read').execute({ path: '../other.pdf' }, {})).text, /no file|outside/);
  assert.match((await tool('pdf_read').execute(undefined, {})).text, /path of a PDF/);
  now = { ...now, enabled: false };
  assert.match((await tool('pdf_read').execute({ path: 'doc.pdf' }, {})).text, /switched off/);
});

test('settings, the skill and tidying up old page pictures', (t) => {
  const defaults = readSettings({});
  assert.deepEqual(defaults, { enabled: true, folders: [], anywhere: false, readChars: 30000 });
  const odd = readSettings({ enabled: Object.freeze({ get: () => false }), folders: [' ~/Papers ', '', 3], anywhere: 'yes', readChars: 5 });
  assert.deepEqual(odd, { enabled: false, folders: ['~/Papers', '3'], anywhere: false, readChars: 4000 });

  assert.equal(SKILLS.length, 1);
  const skill = SKILLS[0];
  assert.equal(skill.name, 'read-pdf');
  for (const name of ['pdf_info', 'pdf_read', 'pdf_search', 'pdf_page_image', 'pdf_ocr']) assert.ok(skill.content.includes(name), name);
  assert.match(skill.content, /\(p\. 12\)/);
  assert.ok(skill.content.length < 3500, 'the skill stays short');

  const dir = folder(t);
  writeFileSync(join(dir, 'old-p1.png'), 'x');
  writeFileSync(join(dir, 'new-p1.png'), 'x');
  writeFileSync(join(dir, 'keep.txt'), 'x');
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000);
  utimesSync(join(dir, 'old-p1.png'), twoDaysAgo, twoDaysAgo);
  utimesSync(join(dir, 'keep.txt'), twoDaysAgo, twoDaysAgo);
  assert.equal(sweepPages(dir), 1);
  assert.ok(!existsSync(join(dir, 'old-p1.png')) && existsSync(join(dir, 'new-p1.png')) && existsSync(join(dir, 'keep.txt')));
  assert.equal(sweepPages(join(dir, 'missing')), 0);
});

test('a real PDF on this Mac: text, a table in columns, a picture, and a scan', { skip: onMac ? false : 'needs macOS' }, async (t) => {
  const dir = folder(t);
  const file = join(dir, 'report.pdf');
  const rows = [['Region', 'Q1', 'Q2', 'Total'], ['North', '120', '135', '255'], ['South West', '80', '95', '175'], ['East', '210', '190', '400']];
  const first = [{ x: 72, y: 720, text: 'Sales by region', size: 18 }, { x: 72, y: 690, text: 'Figures in thousands of euros for the year 2025.' }];
  rows.forEach((row, i) => row.forEach((cell, j) => first.push({ x: 72 + [0, 150, 230, 310][j], y: 650 - i * 18, text: cell })));
  first.push({ x: 72, y: 560, text: 'The East region led with 400, ahead of North at 255.' });
  const second = [{ x: 72, y: 720, text: 'Method', size: 18 }, { x: 72, y: 690, text: 'Numbers were collected from the regional ledgers and cross-' }, { x: 72, y: 676, text: 'checked against invoices.' }];
  makePdf(file, [first, second], { title: 'Sales report' });

  const reader = createReader();
  const ref = resolvePdf('report.pdf', { cwd: dir });
  assert.equal(ref.error, undefined);

  const info = await reader.info(ref);
  assert.match(info, /Pages: 2/);
  assert.match(info, /Title: Sales report/);
  assert.match(info, /Every page has a text layer/);

  const text = await reader.read(ref);
  assert.match(text, /--- page 1 of 2 ---\nSales by region/);
  assert.match(text, /--- page 2 of 2 ---\nMethod/);
  assert.match(text, /South West 80 95 175/);

  const laid = await reader.read(ref, { from: 1, to: 1, layout: true });
  assert.match(laid, /Region {3,}Q1 {3,}Q2 {3,}Total/);
  assert.match(laid, /South West {3,}80 {3,}95 {3,}175/);
  assert.match(laid, /The East region led with 400, ahead of North at 255\./, 'ordinary sentences are not pulled apart');

  assert.match(await reader.search(ref, 'cross-checked'), /1 hit on page 2/);
  assert.match(await reader.search(ref, 'EAST REGION'), /1 hit on page 1/);

  const picture = join(dir, 'p1.png');
  const made = await reader.image(ref, 1, 2, picture);
  assert.equal(made.width, 1224);
  assert.ok(statSync(picture).size > 2000);

  // A PDF made from that picture has no text layer: a scan. Recognition reads it back.
  const scan = join(dir, 'scan.pdf');
  execFileSync('/usr/bin/sips', ['-s', 'format', 'pdf', picture, '--out', scan], { stdio: 'ignore' });
  const scanRef = resolvePdf('scan.pdf', { cwd: dir });
  assert.match(await reader.info(scanRef), /this is a scan/);
  assert.match(await reader.read(scanRef), /No text layer on this page/);
  const recognised = await reader.ocr(scanRef, 1);
  assert.match(recognised, /Sales by region/);
  assert.match(recognised, /South West\s+80\s+95\s+175/);
  assert.match(recognised, /East region led with 400/);

  writeFileSync(join(dir, 'broken.pdf'), 'this is not a pdf');
  await assert.rejects(reader.info(resolvePdf('broken.pdf', { cwd: dir })), /could not be opened as a PDF|could not read/);
});
