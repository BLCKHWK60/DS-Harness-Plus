// The parts of the Tool ledger that need no app: line shape, outcomes, loaded-set difference, the monthly
// files (prune, erase, clear), the four views and the CSV export.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUFFER_MAX, CSV_COLUMNS, REQUEST_RULES, callRow, createStore, loadedDiff, loadedRow, monthOf, outcomeOf, rangeStart, ruleKeyOf, sizeOf, summarize, toCsv } from '../lib/ledger.js';

const temp = () => mkdtempSync(join(tmpdir(), 'tool-ledger-'));

test('a call line keeps only the listed fields: never arguments or results', () => {
  const row = callRow({ t: 0, sid: 's1', tab: 'cowork', tool: 'bash', family: 'core', state: 'on', loaded: true, via: 'direct', outcome: 'ran', ms: 12.4, size: 30, arguments: { command: 'cat secret' }, result: 'TOKEN', content: [{ text: 'x' }] });
  assert.deepEqual(Object.keys(row).sort(), ['family', 'kind', 'loaded', 'ms', 'outcome', 'sid', 'size', 'state', 't', 'tab', 'tool', 'via'].sort());
  assert.equal(row.ms, 12);
  assert.doesNotMatch(JSON.stringify(row), /secret|TOKEN/);
});

test('unknown values fall back to safe ones', () => {
  const row = callRow({ tool: 'x y', state: 'weird', via: 'magic', outcome: 'boom', mission: { runId: 'r1', role: 'plan' } });
  assert.equal(row.tool, 'x_y');
  assert.equal(row.state, 'unknown');
  assert.equal(row.via, 'direct');
  assert.equal(row.outcome, 'error');
  assert.deepEqual(row.mission, { runId: 'r1', role: 'plan' });
  assert.equal(callRow({ tool: 't', mission: { role: 'plan' } }).mission, undefined, 'no run id, no Mission place');
});

test('loaded lines: the full set the first time, then what was added and removed', () => {
  assert.deepEqual(loadedDiff(undefined, ['b', 'a', 'a']), { full: ['a', 'b'] });
  assert.equal(loadedDiff(new Set(['a', 'b']), ['b', 'a']), null);
  assert.deepEqual(loadedDiff(new Set(['a', 'b']), ['a', 'c']), { added: ['c'], removed: ['b'] });
  assert.deepEqual(loadedRow({ t: 0, sid: 's', added: ['c'] }).added, ['c']);
});

test('outcomes are read from what the app reported', () => {
  assert.deepEqual(outcomeOf({ gate: 'allow', dispatched: true }, { isError: false }), { outcome: 'ran' });
  assert.deepEqual(outcomeOf({ gate: 'allow', dispatched: true }, { isError: true, error: { message: 'x' } }), { outcome: 'error' });
  assert.deepEqual(outcomeOf({ gate: 'ask', dispatched: true }, { isError: false }), { outcome: 'allowed' });
  assert.deepEqual(outcomeOf({ gate: 'ask' }, { isError: true, error: { info: { code: 'APPROVAL_REJECTED' } } }), { outcome: 'denied', rule: 'approval' });
  assert.deepEqual(outcomeOf({ gate: 'ask' }, { isError: true, error: { info: { code: 'APPROVAL_UNAVAILABLE' } } }), { outcome: 'parked', rule: 'no-approval-channel' });
  assert.deepEqual(outcomeOf({ gate: 'allow' }, { isError: true, error: { message: 'guard said no' } }), { outcome: 'refused', rule: 'unknown' });
  assert.deepEqual(outcomeOf({ gate: 'deny' }, { isError: true, error: { message: 'no' } }), { outcome: 'refused', rule: 'unknown' });
  assert.deepEqual(outcomeOf(undefined, { isError: true, error: { info: { code: 'UNKNOWN_TOOL' } } }), { outcome: 'refused', rule: 'not-offered' });
  assert.deepEqual(outcomeOf({ gate: 'allow', dispatched: true }, { isError: true, error: { info: { code: 'ABORTED' } } }), { outcome: 'error', rule: 'stopped' });
});

test('a tool that is not on offer is "not offered", even though the app sent it through the execute step', () => {
  // The installed app only finds out inside the tool body (ToolNotFoundError), after tools/execute has begun.
  const unknown = { isError: true, error: { message: 'Unknown tool', info: { name: 'ToolNotFoundError', code: 'UNKNOWN_TOOL' } } };
  assert.deepEqual(outcomeOf({ gate: 'allow', dispatched: true }, unknown), { outcome: 'refused', rule: 'not-offered' });
  assert.deepEqual(outcomeOf({ gate: 'ask', dispatched: true }, unknown), { outcome: 'refused', rule: 'not-offered' });
});

test('size counts the characters of text blocks only', () => {
  assert.equal(sizeOf({ content: [{ type: 'text', text: 'abc' }, { type: 'image', data: 'xxxxxxxx' }, { type: 'text', text: 'de' }] }), 5);
  assert.equal(sizeOf(undefined), 0);
});

test('the store writes monthly files, reads ranges, and skips a damaged line instead of losing the file', () => {
  const dir = temp();
  try {
    const store = createStore({ dir });
    store.append(callRow({ t: new Date(2026, 9, 3).getTime(), tool: 'read', outcome: 'ran' }));
    store.append(callRow({ t: new Date(2026, 10, 3).getTime(), tool: 'bash', outcome: 'ran' }));
    store.flush();
    assert.deepEqual(readdirSync(dir).sort(), ['2026-10.jsonl', '2026-11.jsonl']);
    writeFileSync(join(dir, '2026-11.jsonl'), readFileSync(join(dir, '2026-11.jsonl'), 'utf8') + '{broken\n');
    assert.equal(store.read().length, 2);
    assert.equal(store.read({ from: new Date(2026, 10, 1).getTime() }).length, 1);
    assert.equal(monthOf(new Date(2026, 0, 31).getTime()), '2026-01');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('memory stays bounded when nothing can be written', () => {
  const store = createStore({ dir: '/dev/null/not-a-folder', warn: () => {} });
  for (let i = 0; i < BUFFER_MAX + 50; i += 1) store.append(callRow({ tool: 'read', outcome: 'ran' }));
  assert.equal(store.waiting(), BUFFER_MAX);
  store.flush();
  assert.ok(store.waiting() <= BUFFER_MAX, 'a failed write keeps the lines for the next try, no more than the limit');
});

test('prune removes the months that ended more than keepDays ago, and only those', () => {
  const dir = temp();
  try {
    const now = new Date(2026, 10, 19).getTime();
    const store = createStore({ dir, now: () => now });
    for (const name of ['2025-09.jsonl', '2025-11.jsonl', '2025-12.jsonl', '2026-11.jsonl']) writeFileSync(join(dir, name), '');
    const gone = store.prune(365);
    assert.deepEqual(gone.sort(), ['2025-09.jsonl']);
    assert.deepEqual(readdirSync(dir).sort(), ['2025-11.jsonl', '2025-12.jsonl', '2026-11.jsonl']);
    store.prune(30);
    assert.deepEqual(readdirSync(dir).sort(), ['2026-11.jsonl']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('erasing a conversation takes the link out of its lines and its helpers\' lines, and keeps the counts', () => {
  const dir = temp();
  try {
    const store = createStore({ dir });
    const t = Date.now();
    store.append(callRow({ t, sid: 'gone', ws: 'w1', tab: 'cowork', tool: 'read', outcome: 'ran' }));
    store.append(callRow({ t, sid: 'helper', parent: 'gone', ws: 'w1', tab: 'cowork', tool: 'grep', outcome: 'ran' }));
    store.append(loadedRow({ t, sid: 'gone', tab: 'cowork', full: ['read'] }));
    store.append(callRow({ t, sid: 'kept', ws: 'w2', tab: 'code', tool: 'bash', outcome: 'ran' }));
    store.flush();
    const before = readFileSync(join(dir, `${monthOf(t)}.jsonl`), 'utf8');
    assert.equal(store.erase(['gone']), 3);
    const rows = store.read();
    assert.equal(rows.length, 4, 'every line stays');
    const text = JSON.stringify(rows);
    assert.doesNotMatch(text, /"gone"|"helper"|"w1"/);
    assert.match(text, /"kept"/);
    const anon = rows.filter((row) => row.g);
    assert.equal(anon.length, 3);
    assert.equal(new Set(anon.filter((row) => row.tool !== 'grep').map((row) => row.g)).size, 1, 'the conversation\'s own lines share one group');
    assert.notEqual(before, readFileSync(join(dir, `${monthOf(t)}.jsonl`), 'utf8'));
    assert.ok(!readdirSync(dir).some((name) => name.endsWith('.tmp')), 'no half-written file is left');
    assert.equal(store.erase(['nobody']), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('clear removes every month', () => {
  const dir = temp();
  try {
    const store = createStore({ dir });
    store.append(callRow({ tool: 'read', outcome: 'ran' }));
    store.flush();
    store.append(callRow({ tool: 'read', outcome: 'ran' }));
    assert.equal(store.clear(), 1);
    assert.equal(store.read().length, 0);
    assert.equal(existsSync(dir), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('ranges: last 30 days, last 6 months, all', () => {
  const now = new Date(2026, 10, 19).getTime();
  assert.equal(rangeStart('30d', now), now - 30 * 86_400_000);
  assert.equal(new Date(rangeStart('6m', now)).getMonth(), 4);
  assert.equal(rangeStart('all', now), 0);
});

/** A small month of use: three Cowork conversations and one Chat conversation. */
function sample() {
  const rows = [];
  const t = Date.now();
  for (const sid of ['c1', 'c2', 'c3']) {
    rows.push(loadedRow({ t, sid, tab: 'cowork', full: ['read', 'bash', 'web_fetch', 'tools_find'] }));
    rows.push(callRow({ t, sid, tab: 'cowork', tool: 'read', outcome: 'ran', loaded: true }));
    // pdf_read fetched from the reserve in every conversation
    rows.push(loadedRow({ t, sid, tab: 'cowork', added: ['pdf_read'] }));
    rows.push(callRow({ t, sid, tab: 'cowork', tool: 'pdf_read', family: 'pdf', outcome: 'ran', loaded: false, via: 'tools_find' }));
  }
  rows.push(callRow({ t, sid: 'h1', tab: 'chat', tool: 'bash', state: 'off', outcome: 'refused', rule: 'not-offered' }));
  rows.push(callRow({ t, sid: 'h1', tab: 'chat', tool: 'bash', state: 'off', outcome: 'refused', rule: 'not-offered' }));
  rows.push(callRow({ t, sid: 'h1', tab: 'chat', tool: 'bash', state: 'off', via: 'access-request', outcome: 'denied', rule: 'denied', by: 'tool-access' }));
  rows.push(callRow({ t, sid: 'c1', tab: 'cowork', tool: 'web_fetch', outcome: 'refused', rule: 'web-off', by: 'modes' }));
  return rows;
}

test('the four views', () => {
  const view = summarize(sample());
  assert.equal(view.totals.calls, 9, 'a request for a tool is not a call');
  assert.equal(view.totals.requests, 1);
  assert.equal(view.totals.conversations, 4);
  // Asked for often but off: bash in Chat, three times (twice not offered, once asked for).
  assert.deepEqual(view.askedButOff.map((row) => [row.tab, row.tool, row.count]), [['chat', 'bash', 3]]);
  // Loaded but never used: bash and web_fetch in Cowork (web_fetch was only refused, never used); tools_find is machinery.
  assert.deepEqual(view.loadedNeverUsed.map((row) => [row.tab, row.tool, row.conversations]), [['cowork', 'bash', 3], ['cowork', 'web_fetch', 3]]);
  // Held in reserve but always called: pdf_read, fetched in 3 of 3 Cowork conversations.
  assert.deepEqual(view.reserveAlwaysCalled.map((row) => [row.tab, row.tool, row.conversations, row.of]), [['cowork', 'pdf_read', 3, 3]]);
  // Refused most: bash in Chat (not offered) first.
  assert.deepEqual(view.refusedMost[0], { tool: 'bash', tab: 'chat', rule: 'not-offered', by: undefined, outcome: 'refused', count: 2 });
  assert.ok(view.refusedMost.some((row) => row.rule === 'web-off' && row.by === 'modes'));
  // The table: per tool, per tab and outcome.
  const bash = view.tools.find((row) => row.tool === 'bash');
  assert.deepEqual(bash.tabs.chat.outcomes, { refused: 2 }, 'the request is not in the call table');
  assert.deepEqual(view.tools.map((row) => [row.tool, row.total]), [['pdf_read', 3], ['read', 3], ['bash', 2], ['web_fetch', 1]], 'most used first, then by name');
  assert.ok(view.refusedMost.some((row) => row.tool === 'bash' && row.rule === 'request:denied'), 'a request\'s answer has its own rule key');
});

test('erased lines still count in the views', () => {
  const rows = sample().map((row) => (row.sid === 'c3' ? { ...row, sid: undefined, g: 'gx' } : row));
  const view = summarize(rows);
  assert.equal(view.totals.calls, 9);
  assert.equal(view.reserveAlwaysCalled[0].conversations, 3);
});

test('CSV export: a header row, one row per line, quoting, and no formula cells', () => {
  const rows = [callRow({ t: 0, sid: 's,1', tool: 'read', outcome: 'ran', mission: { runId: 'r', role: 'plan' } }), loadedRow({ t: 0, sid: '=cmd', added: ['a', 'b'] })];
  const csv = toCsv(rows).split('\r\n');
  assert.equal(csv[0], CSV_COLUMNS.join(','));
  assert.equal(csv.length, 4);
  assert.match(csv[1], /^1970-01-01T00:00:00\.000Z,call,"s,1",/);
  assert.match(csv[1], /,r,plan,read,/);
  assert.match(csv[2], /,'=cmd,/);
  assert.match(csv[2], /,a b,$/);
});

test('requests for a tool: never "used", never "from the reserve", and "already on" is not "asked for but off"', () => {
  const rows = [];
  const t = Date.now();
  for (const sid of ['c1', 'c2', 'c3']) {
    rows.push(loadedRow({ t, sid, tab: 'cowork', full: ['read', 'web_fetch'] }));
    // web_fetch is on offer; the assistant only asks for write (allowed) and for web_fetch (already on), never calls them.
    rows.push(callRow({ t, sid, tab: 'cowork', tool: 'write', state: 'ask', loaded: false, via: 'access-request', outcome: 'allowed', rule: 'allowed', by: 'tool-access' }));
    rows.push(callRow({ t, sid, tab: 'cowork', tool: 'web_fetch', state: 'on', loaded: true, via: 'access-request', outcome: 'refused', rule: 'already', by: 'tool-access' }));
    rows.push(callRow({ t, sid, tab: 'cowork', tool: 'tools_catalog', loaded: false, via: 'access-request', outcome: 'refused', rule: 'self', by: 'tool-access' }));
  }
  const view = summarize(rows);
  assert.deepEqual(view.reserveAlwaysCalled, [], 'a granted request that was never followed by a call is not a fetch from the reserve');
  assert.deepEqual(view.loadedNeverUsed.map((row) => row.tool), ['read', 'web_fetch'], 'asking for a tool is not using it');
  assert.equal(view.totals.calls, 0);
  assert.equal(view.totals.requests, 9);
  assert.deepEqual(view.tools, []);
  assert.deepEqual(view.askedButOff.map((row) => row.tool), ['write'], 'already on, and the request tool itself, are not "off"');
});

test('a request\'s answer gets its own rule key; "off" tells a tool switched off from Tool access switched off', () => {
  assert.equal(ruleKeyOf({ rule: 'unknown' }), 'unknown');
  assert.equal(ruleKeyOf({ via: 'access-request', rule: 'unknown' }), 'request:unknown');
  assert.equal(ruleKeyOf({ via: 'access-request', rule: 'off', state: 'off' }), 'request:off');
  assert.equal(ruleKeyOf({ via: 'access-request', rule: 'off', state: 'unknown' }), 'request:access-off');
  assert.equal(ruleKeyOf({ via: 'access-request' }), 'request:unknown');
});

test('the page has plain words for every answer a request can get', () => {
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const table = client.slice(client.indexOf('const RULES = {'), client.indexOf('const ruleWords'));
  for (const key of REQUEST_RULES) assert.match(table, new RegExp(`'${key}': \\['[^']+`), `words for ${key}`);
  // Mission stage D: a parked request and one the policy allows only once are codes too, and Mission's own rules have words.
  assert.ok(REQUEST_RULES.includes('request:parked') && REQUEST_RULES.includes('request:once-only'));
  // Mission point 17: a Full auto Mission never asks; Tool access answers 'not-asked' (not 'denied': you never said no).
  assert.ok(REQUEST_RULES.includes('request:not-asked'));
  for (const key of ['mission-approval', 'mission-file-held', 'mission-folder-busy', 'mission-said-no', 'mission-outside-change', 'mission-item-tool', 'mission-background', 'mission-not-asked']) assert.match(table, new RegExp(`'${key}': \\['[^']+`), `words for ${key}`);
  // The codes come from Modes' Tool access; when Modes is beside this add-on, every code it can give is listed.
  const access = new URL('../../dsh-modes/lib/access.js', import.meta.url);
  if (existsSync(access)) {
    const codes = [...readFileSync(access, 'utf8').matchAll(/refuse\('([\w-]+)'/g)].map((match) => match[1]);
    assert.ok(codes.length > 10);
    for (const code of codes) assert.ok(REQUEST_RULES.includes(`request:${code}`), `code ${code} has a key`);
  }
});

test('a tool only offered in a certain state (Mission\'s step tool) is no suggestion when it was not on offer', () => {
  const t = new Date().toISOString();
  const rows = [];
  // mission_step called three times in Chat with no run on: the tab did not offer it.
  for (const sid of ['m1', 'm2', 'm3']) rows.push(callRow({ t, sid, tab: 'chat', tool: 'mission_step', outcome: 'refused', rule: 'not-offered' }));

  // The same step tool refused by another rule still counts (a real refusal, not the state).
  rows.push(callRow({ t, sid: 'm4', tab: 'recon', tool: 'mission_step', outcome: 'refused', rule: 'isolated', by: 'modes' }));
  // An ordinary tool that is not offered still counts as before.
  for (const sid of ['m1', 'm2']) rows.push(callRow({ t, sid, tab: 'chat', tool: 'bash', outcome: 'refused', rule: 'not-offered' }));
  const view = summarize(rows);
  assert.deepEqual(view.askedButOff.map((row) => [row.tab, row.tool, row.count]), [['chat', 'bash', 2]]);
  assert.deepEqual(view.refusedMost.map((row) => [row.tab, row.tool, row.rule]).sort(), [['chat', 'bash', 'not-offered'], ['recon', 'mission_step', 'isolated']]);
  // Still in the raw counts and the Every tool table.
  assert.equal(view.totals.calls, 6);
  assert.equal(view.tools.find((row) => row.tool === 'mission_step').total, 4);
});

test('Mission\'s request-files tool is no state-only tool: a tab that does not offer it is missing it', () => {
  const t = new Date().toISOString();
  // A "Load tools as needed" tab with a Mission mode on: Mission tells the model to call mission_request_files,
  // the tab does not offer it, twice.
  const rows = ['m1', 'm2'].map((sid) => callRow({ t, sid, tab: 'chat', tool: 'mission_request_files', outcome: 'refused', rule: 'not-offered' }));
  const view = summarize(rows);
  assert.deepEqual(view.askedButOff.map((row) => [row.tab, row.tool, row.count]), [['chat', 'mission_request_files', 2]]);
  assert.deepEqual(view.refusedMost.map((row) => [row.tab, row.tool, row.rule, row.count]), [['chat', 'mission_request_files', 'not-offered', 2]]);
});

test('"Loaded but never used" means never got to use: a tool called but always turned down is listed, one that ran is not', () => {
  const t = new Date().toISOString();
  const rows = [];
  for (const sid of ['n1', 'n2', 'n3']) {
    rows.push({ kind: 'loaded', t, sid, tab: 'chat', full: ['bash', 'grep'] });
    rows.push(callRow({ t, sid, tab: 'chat', tool: 'bash', outcome: 'denied', rule: 'denied' }));
  }
  rows.push(callRow({ t, sid: 'n1', tab: 'chat', tool: 'grep', outcome: 'ran' }));
  const view = summarize(rows);
  assert.deepEqual(view.loadedNeverUsed.map((row) => row.tool), ['bash']);
});

// ---- lab 19 Nov: the page said "54 tool calls in 42 conversations" when 37 of them were helpers ----
test('totals count conversations and helpers apart', () => {
  const rows = [
    { kind: 'call', t: '2026-11-19T10:00:00Z', sid: 'c1', tab: 'code', tool: 'read', outcome: 'ran' },
    { kind: 'call', t: '2026-11-19T10:00:01Z', sid: 'h1', parent: 'c1', tab: 'code', tool: 'write', outcome: 'ran' },
    { kind: 'call', t: '2026-11-19T10:00:02Z', sid: 'h2', parent: 'c1', tab: 'code', tool: 'write', outcome: 'ran' },
  ];
  const view = summarize(rows);
  assert.equal(view.totals.conversations, 1);
  assert.equal(view.totals.helpers, 2);
});

test('item 4A: a line keeps the thread\'s space next to its mode; a line from before spaces stays valid', () => {
  const row = callRow({ sid: 's', tab: 'research', space: 'code', preset: 'standard', tool: 'read', outcome: 'ran' });
  assert.deepEqual([row.tab, row.space], ['research', 'code']);
  assert.deepEqual(Object.keys(row).slice(0, 6), ['kind', 't', 'sid', 'tab', 'space', 'preset']);
  assert.equal(loadedRow({ sid: 's', tab: 'plain', space: 'chat', full: ['read'] }).space, 'chat');
  const old = callRow({ sid: 's', tab: 'cowork', tool: 'read', outcome: 'ran' });
  assert.equal(old.space, undefined);
  const csv = toCsv([old, row]).split('\r\n');
  assert.equal(CSV_COLUMNS.indexOf('space'), CSV_COLUMNS.indexOf('tab') + 1);
  assert.equal(csv[1].split(',')[CSV_COLUMNS.indexOf('space')], '', 'an old line: empty space cell');
  assert.equal(csv[2].split(',')[CSV_COLUMNS.indexOf('space')], 'code');
  // Summaries read old and new lines alike.
  assert.ok(summarize([old, row]));
});
