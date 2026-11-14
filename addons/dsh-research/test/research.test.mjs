// The Research tab without the app: the mode, its note, and saved reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEPTHS, FOCUSES, METHOD, MODE, MODE_ID, TOOLS, listReports, saveReport, selectionNote, stem, withResearch } from '../lib/mode.js';

test('the mode and its method', () => {
  assert.ok(METHOD.length <= 4000, `method is ${METHOD.length} characters`);
  assert.equal(MODE.label, 'Research');
  assert.ok(TOOLS.includes('deep_research') && TOOLS.includes('web_search'));
  for (const forbidden of ['bash', 'write', 'edit', 'run_code']) assert.ok(!TOOLS.includes(forbidden), forbidden);
  const added = JSON.parse(withResearch('{"scout":{}}', true));
  assert.deepEqual(Object.keys(added), ['scout', MODE_ID]);
  assert.equal(withResearch(JSON.stringify(added), true), undefined);
  assert.deepEqual(Object.keys(JSON.parse(withResearch(JSON.stringify(added), false))), ['scout']);
  assert.deepEqual(FOCUSES.map((focus) => focus.id), ['web', 'news', 'academic']);
  assert.deepEqual(DEPTHS.map((depth) => depth.id), ['quick', 'standard', 'thorough']);
  assert.match(selectionNote({ focus: 'news', depth: 'thorough' }), /focus News .*depth Thorough/);
  assert.match(selectionNote({ focus: 'odd', depth: 'odd' }), /focus Web .*depth Standard/);
});

test('reports are saved as Markdown and listed newest first', () => {
  const dir = mkdtempSync(join(tmpdir(), 'research-'));
  try {
    const at = new Date(2026, 10, 14, 21, 5);
    assert.equal(stem('How do heat pumps compare?', at), '2026-11-14-2105-how-do-heat-pumps-compare');
    const first = saveReport(join(dir, 'reports'), { question: 'How do heat pumps compare?', text: 'Answer [1].\n\n## Sources\n[1] https://a', focus: 'web', depth: 'Standard' }, at);
    const second = saveReport(join(dir, 'reports'), { question: 'How do heat pumps compare?', text: 'Again [1].', focus: 'news', depth: 'Quick' }, at);
    assert.notEqual(first, second, 'the same minute and question do not overwrite');
    assert.match(readFileSync(first, 'utf8'), /^# How do heat pumps compare\?\n\nResearched .* UTC .*focus web, depth Standard/);
    assert.equal(listReports(join(dir, 'reports')).length, 2);
    assert.deepEqual(listReports(join(dir, 'missing')), []);
    assert.throws(() => saveReport(dir, { question: 'q', text: '  ' }), /empty/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
