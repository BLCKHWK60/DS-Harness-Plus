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
  assert.equal(alertText({ event: 'finished', scheduled: true, name: '' }), 'A scheduled task finished');
  assert.equal(alertText({ event: 'needs', scheduled: true, name: 'Tidy', waiting: 'approval' }), 'Tidy needs your approval');
  assert.equal(alertText({ event: 'needs', scheduled: true, name: 'Tidy', waiting: 'question' }), 'Tidy has a question for you');
  assert.equal(alertText({ event: 'needs', scheduled: false, name: 'my-site', waiting: 'plan-review' }), 'A task in my-site wants its plan reviewed');
  assert.equal(alertText({ event: 'finished', scheduled: false }), 'A task finished');
  assert.equal(cleanName(`  Line one\nline\ttwo ${'x'.repeat(200)}`).length, 80);
  assert.equal(cleanName('a\u0000b'), 'a b');
});

test('settings: defaults and checks', () => {
  assert.deepEqual(readAlertSettings({}), { failed: true, needs: true, finished: false, others: false, othersMinutes: 2, mac: true, phone: false, ntfyServer: 'https://ntfy.sh', ntfyTopic: '' });
  const set = readAlertSettings({ alertFailed: false, alertFinished: true, alertOthers: true, othersMinutes: 0, mac: false, phone: true, ntfyServer: ' https://example.org// ', ntfyTopic: ' my-topic ' });
  assert.deepEqual(set, { failed: false, needs: true, finished: true, others: true, othersMinutes: 0, mac: false, phone: true, ntfyServer: 'https://example.org', ntfyTopic: 'my-topic' });
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
  assert.deepEqual(sent.mac, [{ title: 'DeepSeek Harness', text: 'A task in my-site failed' }]);
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
