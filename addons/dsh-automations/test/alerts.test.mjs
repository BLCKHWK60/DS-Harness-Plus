import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { PER_MINUTE, alertText, cleanName, createAlerter, hooks, phoneProblem, readAlertSettings } from '../lib/alerts.js';

const real = { ...hooks };
afterEach(() => Object.assign(hooks, real));

/** Record what would be sent instead of sending it. */
function record() {
  const sent = { mac: [], phone: [] };
  hooks.mac = async (title, text) => { sent.mac.push({ title, text }); };
  hooks.phone = async (settings, alert) => { sent.phone.push({ topic: settings.ntfyTopic, server: settings.ntfyServer, ...alert }); };
  return sent;
}

test('the line has a name and what happened, nothing else', () => {
  assert.equal(alertText({ event: 'failed', scheduled: true, name: 'Morning brief' }), 'Morning brief failed');
  assert.equal(alertText({ event: 'failed', scheduled: true, name: 'Morning brief', state: 'stopped' }), 'Morning brief was stopped before it finished');
  assert.equal(alertText({ event: 'finished', scheduled: true, name: '' }), 'An automation finished');
  assert.equal(alertText({ event: 'needs', scheduled: true, name: 'Tidy', waiting: 'approval' }), 'Tidy needs your approval');
  assert.equal(alertText({ event: 'needs', scheduled: true, name: 'Tidy', waiting: 'question' }), 'Tidy has a question for you');
  assert.equal(alertText({ event: 'needs', scheduled: false, name: 'my-site', waiting: 'plan-review' }), 'A thread in my-site wants its plan reviewed');
  assert.equal(alertText({ event: 'finished', scheduled: false }), 'A thread finished');
  assert.equal(cleanName(`  Line one\nline\ttwo ${'x'.repeat(200)}`).length, 80);
  assert.equal(cleanName('a\u0000b'), 'a b');
});

test('settings: defaults and checks', () => {
  assert.deepEqual(readAlertSettings({}), { failed: true, needs: true, finished: false, others: false, runs: true, othersMinutes: 2, mac: true, phone: false, ntfyServer: 'https://ntfy.sh', ntfyTopic: '' });
  const set = readAlertSettings({ alertFailed: false, alertFinished: true, alertOthers: true, othersMinutes: 0, mac: false, phone: true, ntfyServer: ' https://example.org// ', ntfyTopic: ' my-topic ' });
  assert.deepEqual(set, { failed: false, needs: true, finished: true, others: true, runs: true, othersMinutes: 0, mac: false, phone: true, ntfyServer: 'https://example.org', ntfyTopic: 'my-topic' });
  assert.equal(readAlertSettings({ othersMinutes: -3 }).othersMinutes, 2);

  assert.equal(phoneProblem(set), '');
  assert.match(phoneProblem({ ...set, ntfyTopic: '' }), /No topic/);
  assert.match(phoneProblem({ ...set, ntfyTopic: 'has space' }), /letters, digits/);
  assert.match(phoneProblem({ ...set, ntfyTopic: 'a/b' }), /letters, digits/);
  assert.match(phoneProblem({ ...set, ntfyTopic: 'x'.repeat(65) }), /letters, digits/);
  assert.match(phoneProblem({ ...set, ntfyServer: 'not a url' }), /not a web address/);
  assert.match(phoneProblem({ ...set, ntfyServer: 'http://example.org' }), /https/);
  assert.equal(phoneProblem({ ...set, ntfyServer: 'http://127.0.0.1:8080' }), '');
});

test('scheduled tasks alert by the switches; nothing is sent when a switch is off', async () => {
  const sent = record();
  let raw = { mac: true, phone: true, ntfyTopic: 'my-topic' };
  const alerter = createAlerter({ settings: () => readAlertSettings(raw) });

  assert.deepEqual(await alerter.notify({ event: 'failed', scheduled: true, name: 'Morning brief' }), { mac: 'ok', phone: 'ok' });
  assert.deepEqual(sent.mac, [{ title: 'DeepSeek Harness', text: 'Morning brief failed' }]);
  assert.deepEqual(sent.phone, [{ topic: 'my-topic', server: 'https://ntfy.sh', title: 'DeepSeek Harness', text: 'Morning brief failed', event: 'failed' }]);

  // Finished is off unless switched on.
  assert.equal(alerter.notify({ event: 'finished', scheduled: true, name: 'Morning brief' }), undefined);
  raw = { ...raw, alertFinished: true, alertNeeds: false };
  assert.ok(await alerter.notify({ event: 'finished', scheduled: true, name: 'Morning brief' }));
  assert.equal(alerter.notify({ event: 'needs', scheduled: true, name: 'Morning brief', waiting: 'approval' }), undefined);
  assert.equal(alerter.notify({ event: 'unknown', scheduled: true }), undefined);

  // Both places off: nothing to do.
  raw = { mac: false, phone: false };
  assert.equal(alerter.notify({ event: 'failed', scheduled: true, name: 'x' }), undefined);
  assert.equal(sent.mac.length, 2);
  assert.equal(sent.phone.length, 2);
});

test('conversations you start alert only when asked for, and only after the set minutes', async () => {
  const sent = record();
  let raw = { phone: false };
  const alerter = createAlerter({ settings: () => readAlertSettings(raw) });
  assert.equal(alerter.notify({ event: 'failed', scheduled: false, name: 'my-site', minutes: 30 }), undefined);
  raw = { alertOthers: true, othersMinutes: 5 };
  assert.equal(alerter.notify({ event: 'failed', scheduled: false, name: 'my-site', minutes: 4.9 }), undefined);
  assert.deepEqual(await alerter.notify({ event: 'failed', scheduled: false, name: 'my-site', minutes: 5 }), { mac: 'ok' });
  assert.deepEqual(sent.mac, [{ title: 'DeepSeek Harness', text: 'A thread in my-site failed' }]);
});

test('a place that fails is reported and does not stop the other', async () => {
  const sent = record();
  hooks.mac = async () => { throw new Error('ENOENT'); };
  const warnings = [];
  const alerter = createAlerter({ settings: () => readAlertSettings({ phone: true, ntfyTopic: 'my-topic' }), warn: (text) => warnings.push(text) });
  assert.deepEqual(await alerter.notify({ event: 'failed', scheduled: true, name: 'T' }), { mac: 'ENOENT', phone: 'ok' });
  assert.equal(sent.phone.length, 1);
  assert.equal(alerter.status().macError, 'ENOENT');
  assert.equal(alerter.status().phoneError, '');
  assert.equal(warnings.length, 1);

  // A phone switched on without a usable topic says why, and never calls the service.
  const bad = createAlerter({ settings: () => readAlertSettings({ mac: false, phone: true, ntfyTopic: 'no good' }) });
  assert.match((await bad.test()).phone, /letters, digits/);
  assert.equal(sent.phone.length, 1);
});

test('the test alert ignores the event switches', async () => {
  const sent = record();
  const alerter = createAlerter({ settings: () => readAlertSettings({ alertFailed: false, alertNeeds: false }) });
  assert.deepEqual(await alerter.test(), { mac: 'ok' });
  assert.equal(sent.mac[0].text, 'This is a test alert. Alerts are working.');
});

test('at most a handful of alerts a minute', async () => {
  const sent = record();
  let clock = 0;
  const alerter = createAlerter({ settings: () => readAlertSettings({}), now: () => clock });
  for (let i = 0; i < PER_MINUTE + 4; i += 1) alerter.notify({ event: 'failed', scheduled: true, name: `T${i}` });
  await Promise.resolve();
  assert.equal(sent.mac.length, PER_MINUTE);
  assert.equal(alerter.status().skipped, 4);
  clock = 61000;
  assert.ok(alerter.notify({ event: 'failed', scheduled: true, name: 'later' }));
});

test('the phone alert is one JSON post to the server root', async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return { ok: calls.length === 1, status: 403 }; };
  try {
    const settings = readAlertSettings({ phone: true, ntfyTopic: 'my-topic' });
    await hooks.phone(settings, { title: 'DeepSeek Harness', text: 'Résumé check failed', event: 'failed' });
    assert.equal(calls[0].url, 'https://ntfy.sh/');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { topic: 'my-topic', title: 'DeepSeek Harness', message: 'Résumé check failed', priority: 4, tags: ['warning'] });
    await assert.rejects(hooks.phone(settings, { title: 't', text: 'x', event: 'needs' }), /answered 403/);
    assert.equal(JSON.parse(calls[1].options.body).priority, 3);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test('run alerts: their own switch, never the goal\'s text, and not held back by the switches for your own conversations', async () => {
  // Mission and Long run are one (stage B, 19 November 2026): both kinds read "A Mission".
  assert.equal(alertText({ event: 'finished', run: 'long', name: 'my-app' }), 'A Mission in my-app finished');
  assert.equal(alertText({ event: 'needs', run: 'mission', name: 'my-app' }), 'A Mission in my-app needs your yes');
  // Mission stage D: what it waits for.
  assert.equal(alertText({ event: 'needs', run: 'long', name: 'my-app', waiting: 'question' }), 'A Mission in my-app has a question for you');
  assert.equal(alertText({ event: 'needs', run: 'long', name: 'my-app', waiting: 'approval' }), 'A Mission in my-app needs your yes');
  assert.equal(alertText({ event: 'needs', run: 'long', name: 'my-app', waiting: 'you' }), 'A Mission in my-app is waiting for you');
  // The plugin passes Mission's `waiting` on to the alert.
  const plugin = (await import('node:fs')).readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(plugin, /event\.type === 'needs-you'\) void alerter\.notify\(\{ \.\.\.base, event: 'needs', \.\.\.\(typeof event\.waiting === 'string' \? \{ waiting: event\.waiting \} : \{\}\), \.\.\.\(Number\.isFinite\(event\.until\) \? \{ until: event\.until \} : \{\}\) \}\);/);
  assert.match(plugin, /event\.type === 'finished'\) void alerter\.notify\(\{ \.\.\.base, event: 'finished', \.\.\.\(Number\.isFinite\(event\.left\) \? \{ left: event\.left \} : \{\}\), \.\.\.\(typeof event\.canContinue === 'boolean' \? \{ canContinue: event\.canContinue \} : \{\}\)(, \.\.\.\(typeof event\.endKind === 'string' \? \{ endKind: event\.endKind \} : \{\}\))? \}\);/);
  assert.equal(alertText({ event: 'failed', run: 'long', name: '' }), 'A Mission stopped by itself (the model did not answer)');
  assert.match(alertText({ event: 'failed', run: 'long', name: 'x', state: 'restart' }), /interrupted when the app closed/);
  const sent = [];
  hooks.mac = async (_title, text) => { sent.push(text); };
  hooks.phone = async () => {};
  let raw = { alertOthers: false, alertFinished: false };
  const alerter = createAlerter({ settings: () => readAlertSettings(raw) });
  assert.ok(await alerter.notify({ event: 'finished', run: 'long', name: 'my-app' }), 'on by default, whatever the others say');
  assert.deepEqual(sent, ['A Mission in my-app finished']);
  raw = { ...raw, alertRuns: false };
  assert.equal(alerter.notify({ event: 'finished', run: 'long', name: 'my-app' }), undefined, 'off with its own switch');
});

test('Mission point 17: a wait says when it ends, and a finish with something left points to Finish it', () => {
  const at = new Date(2026, 10, 20, 14, 5).getTime();
  assert.equal(alertText({ event: 'needs', run: 'long', name: 'my-app', waiting: 'you', until: at }), 'A Mission in my-app is waiting for you (with no answer it ends at 14:05)');
  assert.equal(alertText({ event: 'needs', run: 'long', name: 'my-app', waiting: 'you', until: 0 }), 'A Mission in my-app is waiting for you (until you answer)');
  // Older events (no until) and nonsense values read as before.
  assert.equal(alertText({ event: 'needs', run: 'long', name: 'my-app', waiting: 'you' }), 'A Mission in my-app is waiting for you');
  assert.equal(alertText({ event: 'needs', run: 'long', name: 'my-app', waiting: 'you', until: '14:05' }), 'A Mission in my-app is waiting for you');
  assert.equal(alertText({ event: 'needs', run: 'long', name: 'my-app', waiting: 'question', until: 0 }), 'A Mission in my-app has a question for you');
  assert.equal(alertText({ event: 'finished', run: 'long', name: 'my-app', left: 3, canContinue: true }), 'A Mission in my-app finished; some things are left for you (Finish it, above the chat box)');
  assert.equal(alertText({ event: 'finished', run: 'long', name: 'my-app', left: 0, canContinue: false }), 'A Mission in my-app finished');
  assert.equal(alertText({ event: 'finished', run: 'long', name: 'my-app', left: 2, canContinue: false }), 'A Mission in my-app finished');
  assert.equal(alertText({ event: 'finished', run: 'long', name: 'my-app' }), 'A Mission in my-app finished');
  // A task (not a Mission) never takes these words.
  assert.equal(alertText({ event: 'finished', scheduled: true, name: 'Tidy', left: 3 }), 'Tidy finished');
});

test('Mission stage E: a Mission waiting for its model server, and one that ended because it did not answer for 2 hours', async () => {
  assert.equal(alertText({ event: 'failed', run: 'long', name: 'my-app', state: 'down' }), 'A Mission in my-app is waiting for your model server (it tries again by itself for up to 2 hours)');
  assert.equal(alertText({ event: 'finished', run: 'long', name: 'my-app', endKind: 'down', left: 2 }), 'A Mission in my-app ended: your model server did not answer for 2 hours');
  // The restart words and an ordinary end are unchanged.
  assert.match(alertText({ event: 'failed', run: 'long', name: 'x', state: 'restart' }), /interrupted when the app closed/);
  assert.equal(alertText({ event: 'finished', run: 'long', name: 'x', endKind: 'time' }), 'A Mission in x finished');
  // The plugin passes Mission's 'down' and endKind on.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /event\.why === 'down' \? 'down' : 'failed'/);
  assert.match(source, /typeof event\.endKind === 'string' \? \{ endKind: event\.endKind \} : \{\}/);
});
