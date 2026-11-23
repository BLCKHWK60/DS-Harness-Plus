import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExport, fileName, FORMATS, LEVELS, readable, redact } from '../lib/export.js';

const events = [
  { type: 'session', version: 4, id: 'session-abcdef12-0000', createdAt: 1794810515219, cwd: '/tmp/work', agentPreset: 'standard' },
  { type: 'request/header', seq: 1, time: 1794810515300, data: { header: { config: { provider: 'p', model: 'm-1', reasoningEffort: 'high' }, tools: [{ name: 'bash', description: 'x' }, { name: 'web_search' }] } } },
  { type: 'system/message', seq: 2, time: 1794810515301, data: { turn: 1, step: 1, message: { role: 'system', content: [{ type: 'text', text: 'You are a test agent.' }] } } },
  { type: 'user/message', seq: 3, time: 1794810515302, data: { message: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Hello <b>there</b>' }] } } },
  { type: 'agent/inbox/spliced', seq: 4, time: 1794810515303, data: { inserted: [] } },
  { type: 'assistant/message', seq: 5, time: 1794810515400, data: { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'reasoning', text: 'I should look it up.' }, { type: 'tool-call', id: 'c1', name: 'web_search', arguments: '{"q":"x"}' }] } } },
  { type: 'tool/result', seq: 6, time: 1794810515500, data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: 'c1', isError: false, content: [{ type: 'text', text: 'RESULT TEXT' }] } } },
  { type: 'assistant/message', seq: 7, time: 1794810515600, data: { turn: 1, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: 'Here is the ``` answer.' }] } } },
  { type: 'user/message', seq: 8, time: 1794810515700, data: { message: { role: 'user', source: { kind: 'mission' }, content: [{ type: 'text', text: 'Run the next step' }] } } },
  { type: 'session/title', seq: 9, time: 1794810515800, data: { title: 'A test chat' } },
];

test('the three levels keep more and more of the stored log', () => {
  const some = (level) => readable(events, level).blocks.map((block) => block.kind);
  assert.deepEqual(some('conversation'), ['user', 'assistant']);
  assert.deepEqual(some('thinking'), ['user', 'thinking', 'assistant']);
  const full = some('full');
  for (const kind of ['system', 'model', 'user', 'thinking', 'tool-call', 'tool-result', 'assistant']) assert.ok(full.includes(kind), `full has ${kind}`);
  assert.equal(readable(events, 'conversation').title, 'A test chat');
});

test('"conversation" leaves out thinking, tools, instructions and messages other add-ons put in; "full" keeps them', () => {
  const md = buildExport(events, { level: 'conversation', format: 'md' }).body;
  assert.match(md, /Hello <b>there<\/b>/);
  assert.doesNotMatch(md, /I should look it up|RESULT TEXT|You are a test agent|Run the next step|web_search/);
  const full = buildExport(events, { level: 'full', format: 'md', sessionId: 'session-abcdef12-0000' }).body;
  for (const piece of ['I should look it up', 'RESULT TEXT', 'You are a test agent', 'Run the next step', 'Tool call: web_search', '"q": "x"', 'm-1', 'Raw log']) assert.ok(full.includes(piece), piece);
  assert.match(full, /"type":"tool\/result"/, 'the raw log is in the file, line by line');
});

test('Markdown fences are longer than any backticks inside the text', () => {
  const md = buildExport(events, { level: 'thinking', format: 'md' }).body;
  assert.match(md, /Here is the ``` answer\./);
  const full = buildExport([{ type: 'user/message', seq: 1, data: { message: { content: [{ type: 'text', text: 'x' }] } } }, { type: 'tool/result', seq: 2, data: { message: { content: [{ type: 'text', text: 'a ```` b' }] } } }], { level: 'full', format: 'md' }).body;
  assert.match(full, /`{5}\na ```` b\n`{5}/);
});

test('HTML escapes what was said; text and JSON are made too', () => {
  const html = buildExport(events, { level: 'full', format: 'html' }).body;
  assert.match(html, /Hello &lt;b&gt;there&lt;\/b&gt;/);
  assert.doesNotMatch(html, /Hello <b>there/);
  assert.match(html, /^<!doctype html>/);
  const txt = buildExport(events, { level: 'thinking', format: 'txt' }).body;
  assert.match(txt, /THINKING/);
  const flat = JSON.parse(buildExport(events, { level: 'thinking', format: 'json' }).body);
  assert.deepEqual(flat.messages.map((m) => m.role), ['user', 'thinking', 'assistant']);
  const whole = JSON.parse(buildExport(events, { level: 'full', format: 'json' }).body);
  assert.deepEqual(whole.events, events, 'level "full" in JSON is the stored log, untouched');
  assert.equal(whole.session.id, 'session-abcdef12-0000');
});

test('every level and format makes a file with a safe name and the right type', () => {
  for (const level of LEVELS) {
    for (const format of FORMATS) {
      const made = buildExport(events, { level, format, sessionId: 'session-abcdef12-0000' });
      assert.match(made.filename, /^[\p{L}\p{N}-]+-abcdef12-(conversation|thinking|full)\.(md|txt|html|json)$/u);
      assert.ok(made.body.length > 50);
      assert.ok(made.mime.includes(format === 'md' ? 'markdown' : format === 'txt' ? 'plain' : format));
    }
  }
  assert.equal(fileName('../../etc/passwd', 'full', 'session-1234567890', 'md'), 'etc-passwd-12345678-full.md');
  assert.equal(buildExport(undefined, { level: 'nope', format: 'nope' }).filename.endsWith('-conversation.md'), true);
});

test('the route and the button are wired, additive and off-able, and keep a kept-apart conversation apart', () => {
  const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(index, /EXPORT_PATH = '\/dsh-settings-plus\/export'/);
  assert.match(index, /exportButton: z\.boolean\(\)\.default\(true\)/);
  assert.match(index, /extrasInGear: z\.boolean\(\)\.default\(true\)/);
  assert.match(index, /isolated\?\.\(session\) === true/, 'a conversation another add-on keeps apart (Recon) is not exported here');
  assert.match(index, /connection\.requestRejection\(req\)/);
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /id: 'plus-export', order: 870/, 'beside the gear, before it');
  // The gear hosts these; Creator Plus's bar and Finance's selection are strips above the box instead (uniform-row.test.mjs checks that).
  for (const id of ['bench-rules', 'recon-export']) assert.ok(client.includes(`'${id}'`), id);
  assert.match(client, /openSettingsOn\(appCtx, 'web-sources', 'Web sources'\)/, 'the gear opens the Web selector\'s settings, shared by every mode');
  assert.match(client, /html\[data-dsh-uniform="true"\]\[data-dsh-gear="on"\]\[data-dsh-extras="on"\]/, 'extras leave the box only with the Modes switch on, the gear on and extrasInGear on');
  assert.match(client, /\/export\?session=|dsh-settings-plus\/export\?session=/);
  assert.match(client, /api\/session\.export\?sessionId=/, 'the app\'s own complete archive is offered too');
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /exportButton: true/);
  assert.match(patch, /extrasInGear: true/);
  assert.match(readFileSync(new URL('../package.json', import.meta.url), 'utf8'), /"lib\/\*\.js"/);
});

test('H10: hide keys and passwords removes them from every format, the log lines and the JSON, and is the full log\'s default', () => {
  const secret = 'sk-abcdefghijklmnop1234';
  const dirty = [
    ...events,
    { type: 'user/message', seq: 20, time: 1794810516000, data: { message: { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: `my key is ${secret} and password: hunter2hunter2 mail me at a.b@example.com` }] } } },
    { type: 'assistant/message', seq: 21, time: 1794810516100, data: { turn: 2, step: 1, message: { role: 'assistant', content: [{ type: 'tool-call', id: 'c2', name: 'bash', arguments: '{"password":"hunter2hunter2","cmd":"ls"}' }] } } },
  ];
  assert.equal(redact(`token = ${secret}`), 'token = [secret]');
  assert.match(redact('{"password":"hunter2hunter2"}'), /\[secret\]/);
  assert.match(redact('{\\"password\\":\\"hunter2hunter2\\"}'), /\[secret\]/);
  for (const format of FORMATS) {
    const open = buildExport(dirty, { level: 'full', format, hide: false }).body;
    const hidden = buildExport(dirty, { level: 'full', format, hide: true }).body;
    assert.ok(open.includes('hunter2hunter2'), `${format}: left in when not hidden`);
    assert.ok(!hidden.includes('hunter2hunter2') && !hidden.includes(secret) && !hidden.includes('a.b@example.com'), `${format}: nothing secret in the hidden export (log lines included)`);
  }
  const json = JSON.parse(buildExport(dirty, { level: 'full', format: 'json', hide: true }).body);
  assert.ok(Array.isArray(json.events), 'still valid JSON with the events');
  // The page: a warning line on the full log, the tick, on by default there; the route hides unless told not to.
  const page = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(page, /Careful: the full thread log holds everything/);
  assert.match(page, /Hide keys and passwords/);
  assert.match(functionBody(page, 'ExportDialog'), /setHide\(level === 'full'\)/, 'the Full level ticks the box inside the Export window');
  assert.match(page, /'Download'\)/, 'the Download button text stays');
  const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(index, /url\.searchParams\.get\('hide'\) \?\? \(level === 'full' \? '1' : '0'\)/);
});

test('H4: a damaged file kept aside is told once: the route lists the notes, then clears them; the page shows them once', () => {
  const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(index, /asked === '1'\) return res\.end\(JSON\.stringify\(\{ damaged: damagedNotes\(\)/);
  assert.match(index, /asked === 'told'\) return res\.end\(JSON\.stringify\(\{ cleared: clearDamagedNotes\(\)/);
  const page = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(page, /It was damaged, so it was kept aside under a new name/);
  assert.match(page, /You are told this once\./);
});

/** The text of one function of the page (from its "function Name(" to the closing brace at the same indent). */
function functionBody(source, name) {
  const at = source.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is in the page`);
  const lineStart = source.lastIndexOf('\n', at) + 1;
  const indent = at - lineStart;
  const close = source.indexOf(`\n${' '.repeat(indent)}}\n`, at);
  assert.ok(close > at, `${name} has an end`);
  return source.slice(at, close);
}

test('#1: the Export window\'s "hide keys" line is in the Export window and not in the gear popup, which has no such thing', () => {
  const page = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const line = /setHide\(/;
  assert.match(functionBody(page, 'ExportDialog'), /const \[hide, setHide\] = useState/);
  for (const name of ['ModePopup', 'ModeGear', 'HostedControls']) {
    const body = functionBody(page, name);
    assert.doesNotMatch(body, line, `${name} must not use setHide or level (it has neither)`);
    assert.doesNotMatch(body, /\blevel\b/, `${name} has no "level"`);
  }
  // Every name the gear popup reads is something it has: its props, its own state, or the page's shared helpers.
  const popup = functionBody(page, 'ModePopup');
  assert.match(popup, /function ModePopup\(\{ appCtx, mode, page, pageLabel, onClose, sessionId, exportOn = false \}\)/);
});

test('#7: hide keys and passwords catches the usual secret formats and leaves ordinary text alone', () => {
  const caught = [
    ['OPENAI_API_KEY=abcd1234efgh5678', 'abcd1234efgh5678'],
    ['DB_PASSWORD=hunter2x', 'hunter2x'],
    ['export AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG', 'wJalrXUtnFEMI'],
    ['Authorization: Basic dXNlcjpwYXNzd29yZA==', 'dXNlcjpwYXNzd29yZA'],
    ['authorization: Bearer abcdefghijklmnopqrstuv', 'abcdefghijklmnop'],
    ['{"access_token": "abc123xyz789"}', 'abc123xyz789'],
    ['{\\"api_key\\":\\"zzzzzzzz1234\\"}', 'zzzzzzzz1234'],
    ['passphrase: correcthorse', 'correcthorse'],
    ['client_secret = "s3cr3tvalue"', 's3cr3tvalue'],
    ['curl --password hunter22 x', 'hunter22'],
    ['https://bob:pw123456@host.io/x', 'pw123456'],
    ['key eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', 'eyJhbGci'],
    ['AKIAIOSFODNN7EXAMPLE', 'AKIAIOSFODNN7'],
    ['sk-proj-abcdefghijklmnop1234', 'abcdefghijklmnop'],
  ];
  for (const [text, secret] of caught) {
    const out = redact(text);
    assert.ok(!out.includes(secret), `${text} -> ${out}`);
    assert.match(out, /\[secret\]/);
  }
  const alone = ['max_tokens: 4096', 'tokens: 123456', 'Basic information about the key: name', 'the token count is high', 'password: null', 'key: value', 'skill-architect-learns-things', 'monkey=banana123', 'keyboard: qwertyuiop', '--max-tokens 100000'];
  for (const text of alone) assert.equal(redact(text), text, `left alone: ${text}`);
  // Through the export itself, in a tool call's JSON arguments and in plain text.
  const dirty = [{ type: 'user/message', seq: 1, data: { message: { role: 'user', content: [{ type: 'text', text: 'OPENAI_API_KEY=abcd1234efgh5678\nDB_PASSWORD=hunter2x' }] } } }];
  const out = buildExport(dirty, { level: 'full', format: 'md', hide: true }).body;
  assert.ok(!out.includes('abcd1234efgh5678') && !out.includes('hunter2x'));
});

test('#7: every add-on that keeps its own redact() uses the same pattern list as Export', () => {
  const take = (file) => {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    const from = text.indexOf('// --- shared redact rules');
    const to = text.indexOf('// --- end of the shared block ---');
    assert.ok(from >= 0 && to > from, `${file} has the shared block`);
    return text.slice(from, to);
  };
  const mine = take('../lib/export.js');
  for (const other of ['../../dsh-evolve/lib/review.js', '../../dsh-skill-architect/lib/learn.js']) {
    let exists = true;
    try { readFileSync(new URL(other, import.meta.url)); } catch { exists = false; }
    if (exists) assert.equal(take(other), mine, `${other} has drifted from Export's pattern list`);
  }
});
