// The Research tab without the app: the mode, its note, and saved reports.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEPTHS, FOCUSES, METHOD, MODE, MODE_ID, TOOLS, listReports, saveReport, selectionNote, stem, withResearch } from '../lib/mode.js';

test('the mode and its method', () => {
  assert.ok(METHOD.length <= 4000, `method is ${METHOD.length} characters`);
  assert.match(METHOD, /keep every citation \[n\], every "not read" label/, 'labels of sources no helper read survive the presentation');
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

test('Research runs Read Only, and a Research mode stored before that is replaced', () => {
  assert.equal(MODE.sandbox, 'read-only');
  // An install from before 0.57.0 stored Research with `inherit`: the next sync writes the new mode.
  const older = JSON.stringify({ scout: { label: 'Scout' }, [MODE_ID]: { ...MODE, sandbox: 'inherit' } });
  const next = JSON.parse(withResearch(older, true));
  assert.equal(next[MODE_ID].sandbox, 'read-only');
  assert.deepEqual(next.scout, { label: 'Scout' }, 'other modes are left as they are');
  assert.equal(withResearch(JSON.stringify(next), true), undefined, 'nothing to write once it is current');
});

test('Settings → Research and its search entry say what the check really does', () => {
  const client = readFileSync(join(import.meta.dirname, '..', 'client.js'), 'utf8');
  const description = /'(A tab for researching a question in depth\.[^']*)'/.exec(client)?.[1];
  assert.ok(description, 'the page description is found');
  assert.match(description, /writes a report that cites its sources by number\./);
  assert.match(description, /Every citation is checked to be in the source list/);
  // All three labels, so no source label in a report is a surprise.
  assert.match(description, /marked "read", "seen only in search results, not read" or "not read, and not seen in search results"/);
  assert.match(description, /claims are not compared with the pages/);
  assert.doesNotMatch(description, /every claim cites|when a helper opened the page/, 'no promise the check does not keep');
  const goodToKnow = /'(Sources are pages from the web\.[^']*)'/.exec(client)?.[1];
  assert.ok(goodToKnow, 'the Good to know item about sources is found');
  assert.match(goodToKnow, /Claims are not compared with the pages, so check the important ones yourself\./);
  assert.doesNotMatch(client, /word for word/, 'no hint that claims are compared with the pages in some other way');
  const index = JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'dsh-settings-plus', 'settings-index.json'), 'utf8'));
  const section = index.find((entry) => entry.page === 'research' && entry.kind === 'section' && entry.label === 'Research');
  assert.match(section.description, /the report cites its sources by number and marks which ones a helper read\./);
  assert.doesNotMatch(section.description, /cites every claim|checks every claim/);
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

test('Research has no Depth of its own any more: the Modes Depth button, the same in every tab, sets its runs', async () => {
  const { readFileSync } = await import('node:fs');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const host = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(client + host, /researchDepth/, 'never reads or writes the old setting');
  assert.doesNotMatch(client, /label: 'Depth'/, 'no Depth dropdown or segments of its own');
  assert.match(host, /ctx\.get\('modes'\)\?\.depthOf\?\.\(sessionId\)/);
  assert.match(client, /The same Depth as in every tab/);
  // The chat box keeps only Focus, with nothing about Depth or run times (the Depth list says those).
  assert.match(client, /h\(DropButton, \{ label: 'Focus', items: view\.focuses \?\? \[\], value: view\.session\.focus \?\? view\.focus, busy, onPick: \(id\) => void pickFocus\(id\) \}\)/);
  // Good to know: the Depth button, not the Web button, sets how much the assistant searches by itself.
  const good = /'The helpers search with your web search provider\.[^']*'/.exec(client)?.[0] ?? '';
  assert.match(good, /the Depth button in the chat box sets how much the assistant searches by itself/);
  assert.doesNotMatch(good, /Web button[^.]*sets how much/);
  // Settings search finds the row by its title.
  const index = JSON.parse(readFileSync(new URL('../../dsh-settings-plus/settings-index.json', import.meta.url), 'utf8'));
  const entry = index.find((item) => item.page === 'research' && item.field === 'modes.researchDepth');
  assert.equal(entry?.label, 'Depth');
  assert.match(client, /h\('div', \{ className: 'dsh-rs-rowtitle' \}, 'Depth'\)/);
});
