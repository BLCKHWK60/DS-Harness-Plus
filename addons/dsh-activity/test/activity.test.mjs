import test from 'node:test';
import assert from 'node:assert/strict';
import { DESIGNS, placeOf, readSettings, SOUNDS } from '../index.js';
import { DEMOS, demoSnapshot, labelOf, shortCount, shortTime, shownKinds } from '../lib/label.js';
import { createTracker, KINDS, nameMatches } from '../lib/tracker.js';

/** A tracker with a clock the test moves by hand. */
function setup(options = {}) {
  let time = 1_000_000;
  const tracker = createTracker({ now: () => time, ...options });
  return { tracker, tick: (ms) => { time += ms; } };
}
const main = { id: 'm', top: true };
const text = (size) => ({ type: 'chunk', chunk: { type: 'text-delta', text: 'x'.repeat(size) } });
const think = (size) => ({ type: 'chunk', chunk: { type: 'reasoning-delta', text: 'x'.repeat(size) } });

test('a request goes from reading the prompt to thinking to writing, with rates', () => {
  const { tracker, tick } = setup();
  tracker.event(main, 'turn/start');
  tracker.frame('m', { type: 'start' });
  tick(2000);
  let now = tracker.snapshot('m');
  assert.deepEqual(Object.keys(now.kinds), ['prompt']);
  assert.equal(now.kinds.prompt.seconds, 2);
  assert.equal(now.running, true);

  // Thinking: 40 characters every 100 ms = 400 characters a second = 100 tokens a second at 4 characters a token.
  for (let i = 0; i < 20; i += 1) { tick(100); tracker.frame('m', think(40)); }
  now = tracker.snapshot('m');
  assert.deepEqual(Object.keys(now.kinds), ['reason']);
  assert.ok(Math.abs(now.kinds.reason.rate - 100) < 8, `thinking rate ${now.kinds.reason.rate}`);
  assert.equal(now.kinds.reason.tokens, 200);

  for (let i = 0; i < 10; i += 1) { tick(100); tracker.frame('m', text(20)); }
  now = tracker.snapshot('m');
  assert.deepEqual(Object.keys(now.kinds), ['write']);
  assert.ok(Math.abs(now.kinds.write.rate - 50) < 8, `writing rate ${now.kinds.write.rate}`);
  assert.ok(now.lastRates.reason > 0);

  // The request ends. 8,000 fresh prompt tokens took 2.1 s before the first token.
  tracker.event(main, 'assistant/message', { usage: { inputTokens: 10000, cacheReadTokens: 2000, outputTokens: 250 } });
  now = tracker.snapshot('m');
  assert.deepEqual(now.kinds, {});
  assert.equal(now.lastPrompt.rate, Math.round(8000 / 2.1));
  assert.equal(now.lastPrompt.tokens, 8000);
  assert.equal(now.context, 10250);

  // The next request shows the last prompt speed while it reads, and uses the learned characters per token (1000 / 250 = 4).
  tracker.frame('m', { type: 'start' });
  tick(500);
  now = tracker.snapshot('m');
  assert.equal(now.kinds.prompt.lastRate, Math.round(8000 / 2.1));
  assert.equal(now.kinds.prompt.tokens, 10250);
  tracker.event(main, 'turn/end', { reason: { kind: 'completed' } });
  assert.equal(tracker.snapshot('m').running, false);
});

test('tools are sorted into tool, web and script, and end with their result', () => {
  const { tracker, tick } = setup();
  tracker.event(main, 'turn/start');
  tracker.event(main, 'tool/call', { callId: 'a', name: 'read_file' });
  tick(1000);
  tracker.event(main, 'tool/call', { callId: 'b', name: 'web_search' });
  tracker.event(main, 'tool/call', { callId: 'c', name: 'bash' });
  tracker.event(main, 'tool/call', { callId: 'd', name: 'grep_files' });
  tick(1000);
  let now = tracker.snapshot('m');
  assert.deepEqual(now.kinds.tool, { count: 2, name: 'grep_files', seconds: 2 });
  assert.equal(now.kinds.web.name, 'web_search');
  assert.equal(now.kinds.script.name, 'bash');
  tracker.event(main, 'tool/result', { message: { toolCallId: 'a' } });
  tracker.event(main, 'tool/result', { message: { source: { callId: 'd' } } });
  now = tracker.snapshot('m');
  assert.equal(now.kinds.tool, undefined);
  assert.ok(now.kinds.web && now.kinds.script);

  // Your own words replace the built-in ones.
  tracker.setWords(['read_'], ['zzz']);
  tracker.event(main, 'tool/call', { callId: 'e', name: 'read_file' });
  now = tracker.snapshot('m');
  assert.equal(now.kinds.web.count, 1);
  assert.equal(now.kinds.web.name, 'read_file');
  assert.ok(nameMatches('Run_Tests', ['run_']));
  assert.ok(!nameMatches('read', ['']));
});

test('sub-agents and other conversations show while the main model is quiet', () => {
  const { tracker, tick } = setup();
  tracker.event(main, 'turn/start');
  tracker.event(main, 'turn/end', { reason: { kind: 'completed' } });
  tracker.event({ id: 's1', parent: 'm', top: false }, 'turn/start');
  tracker.event({ id: 's2', parent: 's1', top: false }, 'turn/start');
  tracker.event({ id: 's2', parent: 's1', top: false }, 'tool/call', { callId: 't', name: 'bash' });
  tracker.event({ id: 'o', top: true }, 'turn/start');
  tracker.event({ id: 'o1', parent: 'o', top: false }, 'turn/start');
  tick(5000);
  const now = tracker.snapshot('m');
  assert.equal(now.running, false);
  assert.deepEqual(now.kinds.sub, { count: 2, seconds: 5, tools: 1 });
  assert.deepEqual(now.kinds.other, { count: 1 }, 'another conversation and its helper count once');
  assert.equal(now.kinds.prompt, undefined);

  // Seen from the other conversation, it is the other way round.
  const other = tracker.snapshot('o');
  assert.equal(other.kinds.sub.count, 1);
  assert.equal(other.kinds.other.count, 1);

  // Without a conversation on screen, the busiest top-level one is shown.
  assert.equal(tracker.snapshot().session, 'o');
  tracker.drop('s1');
  tracker.drop('s2');
  assert.equal(tracker.snapshot('m').kinds.sub, undefined);
});

test('waiting for approval, errors and retries', () => {
  const { tracker, tick } = setup({ errorHoldMs: 5000 });
  tracker.event(main, 'turn/start');
  tracker.event(main, 'approval/asked', { id: 'p1', toolName: 'bash' });
  tick(3000);
  let now = tracker.snapshot('m');
  assert.deepEqual(now.kinds.wait, { tool: 'bash', seconds: 3, count: 1, from: 'main' });
  tracker.event(main, 'approval/decided', { id: 'p1', outcome: 'allow' });
  assert.equal(tracker.snapshot('m').kinds.wait, undefined);

  // A helper that waits for you shows on its parent conversation.
  tracker.event({ id: 's', parent: 'm', top: false }, 'approval/asked', { id: 'p2', toolName: 'write_file' });
  assert.equal(tracker.snapshot('m').kinds.wait.from, 'sub');
  tracker.event({ id: 's', parent: 'm', top: false }, 'approval/decided', { id: 'p2' });

  tracker.event(main, 'llm/retry-started', {});
  assert.equal(tracker.snapshot('m').kinds.error.retry, 1);
  tracker.frame('m', text(4));
  assert.equal(tracker.snapshot('m').kinds.error, undefined, 'a token after a retry clears it');

  tracker.event(main, 'turn/end', { reason: { kind: 'error', message: 'server gone' } });
  now = tracker.snapshot('m');
  assert.equal(now.kinds.error.text, 'server gone');
  tick(6000);
  assert.equal(tracker.snapshot('m').kinds.error, undefined, 'an error fades after a while');
});

test('nothing is kept of what was said, and idle conversations are forgotten', () => {
  const { tracker, tick } = setup();
  tracker.event(main, 'turn/start');
  tracker.frame('m', { type: 'start' });
  tracker.frame('m', { type: 'chunk', chunk: { type: 'text-delta', text: 'a secret sentence' } });
  tracker.event(main, 'tool/call', { callId: 'a', name: 'read_file', arguments: '{"path":"/private/file"}' });
  const dump = JSON.stringify(tracker.snapshot('m'));
  assert.doesNotMatch(dump, /secret|private/);
  tracker.event(main, 'turn/end', { reason: { kind: 'completed' } });
  tick(31 * 60 * 1000);
  tracker.snapshot();
  assert.equal(tracker.size(), 0);
  // Unknown events and broken frames change nothing and do not throw.
  tracker.event({}, 'turn/start');
  tracker.event(main, 42);
  tracker.frame('', { type: 'start' });
  tracker.frame('m', null);
  tracker.frame('m', { type: 'chunk', chunk: { type: 'usage' } });
  assert.deepEqual(tracker.snapshot('m').kinds, {});
});

test('the text: short codes, words, figures, and what is switched off', () => {
  const all = demoSnapshot('all');
  const base = { hidden: [], figures: true, words: false, promptSpeed: true, context: true };
  assert.equal(labelOf(all, base).text, 'TG 42 t/s · 378 tokens · Tool read_file 2s · Web web_search 4s · Run bash 31s · BG 2 · 1m 12s · OC 1 · PP 1,850 t/s · ctx 46.2k');
  assert.equal(labelOf(all, { ...base, figures: false }).text, 'TG · Tool read_file · Web web_search · Run bash · BG 2 · OC 1');
  assert.equal(labelOf(all, { ...base, words: true, figures: false }).text, 'Writing · Tool read_file · Web web_search · Script bash · Sub-agents 2 · Other chat 1');
  assert.equal(labelOf(all, { ...base, hidden: ['tool', 'web', 'script', 'sub', 'other'], promptSpeed: false, context: false }).text, 'TG 42 t/s · 378 tokens');
  assert.deepEqual(shownKinds(all, { hidden: ['write'] }), ['tool', 'web', 'script', 'sub', 'other']);

  assert.equal(labelOf(demoSnapshot('prompt'), base).text, 'PP 3.2s · ~12.4k tokens · last 1,850 t/s · ctx 12.4k');
  assert.equal(labelOf(demoSnapshot('reason'), base).text, 'Thinking 38 t/s · 6s · PP 1,850 t/s · ctx 12.4k');
  assert.equal(labelOf(demoSnapshot('wait'), base).text, 'Waiting for you: bash 12s · BG 1 · 40s');
  assert.equal(labelOf(demoSnapshot('wait'), { ...base, hidden: ['wait'] }).text, 'BG 1 · 40s');
  assert.equal(labelOf(demoSnapshot('error'), base).text, 'Error: The model server did not answer');
  assert.equal(labelOf(demoSnapshot('idle'), base).text, '');
  assert.equal(labelOf(undefined, undefined).text, '');
  assert.equal(demoSnapshot('nope'), undefined);
  for (const name of Object.keys(DEMOS)) for (const kind of Object.keys(DEMOS[name].kinds)) assert.ok(KINDS.includes(kind), `${name}: ${kind}`);

  assert.equal(shortCount(840), '840');
  assert.equal(shortCount(9999), '9,999');
  assert.equal(shortCount(12400), '12.4k');
  assert.equal(shortCount(1_200_000), '1.2M');
  assert.equal(shortTime(4.9), '4s');
  assert.equal(shortTime(72), '1m 12s');
  assert.equal(shortTime(4.94, true), '4.9s');
  assert.equal(shortTime(12.4, true), '12s');
  assert.equal(shortTime(3780), '1h 3m');
});

test('settings are read with safe defaults, and sessions are placed in the tree', () => {
  const defaults = readSettings({});
  assert.equal(defaults.enabled, true);
  assert.equal(defaults.design, 'pulse');
  assert.deepEqual(defaults.hidden, []);
  assert.equal(defaults.text, true);
  assert.equal(defaults.tapeMinutes, 1);
  assert.deepEqual(defaults.colors, {});
  assert.deepEqual(defaults.webTools, [], 'no tool names are preconfigured in the settings');
  assert.deepEqual([defaults.sound, defaults.soundVolume, defaults.waitSound, defaults.errorSound, defaults.soundRepeat], [true, 30, 'chime', 'low', 0]);
  const loud = readSettings({ sound: false, soundVolume: 250, waitSound: 'foghorn', errorSound: 'none', soundRepeat: -5 });
  assert.deepEqual([loud.sound, loud.soundVolume, loud.waitSound, loud.errorSound, loud.soundRepeat], [false, 100, 'chime', 'none', 0]);
  for (const sound of SOUNDS) assert.equal(readSettings({ waitSound: sound }).waitSound, sound);

  const live = (value) => Object.freeze({ get: () => value });
  const odd = readSettings({
    enabled: live(false),
    design: 'sparkles',
    hidden: ['write', 'nonsense', 'sub'],
    weight: 9,
    tapeMinutes: 'x',
    colors: { write: '#00FF88', tool: 'red', nonsense: '#000000' },
    webTools: [' fetch ', '', 7],
  });
  assert.equal(odd.enabled, false);
  assert.equal(odd.design, 'pulse');
  assert.deepEqual(odd.hidden, ['write', 'sub']);
  assert.equal(odd.weight, 3);
  assert.equal(odd.tapeMinutes, 1);
  assert.deepEqual(odd.colors, { write: '#00ff88' });
  assert.deepEqual(odd.webTools, ['fetch', '7']);
  for (const design of DESIGNS) assert.equal(readSettings({ design }).design, design);

  assert.deepEqual(placeOf({ id: 'a', header: {} }), { id: 'a', parent: null, top: true });
  assert.deepEqual(placeOf({ id: 'b', header: { parentSession: 'a' } }), { id: 'b', parent: 'a', top: false });
  assert.deepEqual(placeOf({ id: 'c', header: { parentSession: { id: 'a' } } }), { id: 'c', parent: 'a', top: false });
  assert.deepEqual(placeOf({ id: 'd', header: { origin: 'subagent', delegationDepth: 1 } }), { id: 'd', parent: null, top: false });
  assert.equal(placeOf({}), undefined);
});
