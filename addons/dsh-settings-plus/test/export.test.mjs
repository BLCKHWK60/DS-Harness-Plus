import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildExport, fileName, FORMATS, LEVELS, readable } from '../lib/export.js';

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
