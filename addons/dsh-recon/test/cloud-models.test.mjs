import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cloudPolicy, mayReceive, openConsent } from '../lib/model.js';

// Cloud models in Recon are the owner's choice (18 November 2026): Settings → Recon → Models →
// Cloud models: Ask each time (the default, /recon cloud per conversation), Always, Never.
const local = { where: 'local', host: '127.0.0.1', name: 'Mine' };
const cloud = { where: 'cloud', host: 'api.example.com', name: 'Far' };
const unknown = { where: 'unknown', host: '', name: 'x' };
const route = { provider: 'far', model: 'big' };

test('ask is the default: a cloud model gets nothing until /recon cloud in that conversation', () => {
  const consent = openConsent();
  assert.equal(cloudPolicy(undefined), 'ask');
  assert.equal(cloudPolicy('sometimes'), 'ask');
  assert.equal(mayReceive({ place: cloud, route, id: 'a', consent }).ok, false);
  assert.equal(mayReceive({ place: cloud, route, id: 'a', consent, policy: 'ask' }).ok, false);
  consent.agree('a', route);
  assert.equal(mayReceive({ place: cloud, route, id: 'a', consent, policy: 'ask' }).ok, true);
});

test('always: a cloud model, or one whose place is unknown, gets it without asking', () => {
  const consent = openConsent();
  assert.equal(mayReceive({ place: cloud, route, id: 'a', consent, policy: 'always' }).ok, true);
  assert.equal(mayReceive({ place: unknown, route: { provider: 'x', model: 'm' }, id: 'a', consent, policy: 'always' }).ok, true);
  // Still nothing when the model cannot be told at all.
  assert.equal(mayReceive({ place: cloud, route: undefined, id: 'a', consent, policy: 'always' }).ok, false);
});

test('never: not even after /recon cloud, and the reason names the setting', () => {
  const consent = openConsent();
  consent.agree('a', route);
  const refused = mayReceive({ place: cloud, route, id: 'a', consent, policy: 'never' });
  assert.equal(refused.ok, false);
  assert.match(refused.why, /Settings → Recon → Models/);
  assert.doesNotMatch(refused.why, /\/recon cloud/);
});

test('a model on this Mac or in your own network gets it under every setting', () => {
  const consent = openConsent();
  for (const policy of ['ask', 'always', 'never']) {
    assert.equal(mayReceive({ place: local, route, id: 'a', consent, policy }).ok, true, policy);
    assert.equal(mayReceive({ place: { where: 'network', host: '192.168.1.5', name: 'Box' }, route, id: 'a', consent, policy }).ok, true, policy);
  }
});

test('the add-on reads the setting everywhere it checks a model, and the page offers it', () => {
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /cloudModels: z\.union\(\[z\.const\('ask'\), z\.const\('always'\), z\.const\('never'\)\]\)\.default\('ask'\)\.volatile\(\),/);
  const calls = source.match(/mayReceive\(\{[^}]*\}\)/g) ?? [];
  assert.ok(calls.length >= 2);
  for (const call of calls) assert.match(call, /policy: cloudModels\(\)/, call);
  // /recon cloud says what the setting does instead of agreeing.
  assert.match(source, /if \(cloudModels\(\) === 'never'\) return \{ kind: 'error'/);
  assert.match(source, /cloudModels: cloudModels\(\),/);
  const page = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(page, /\[\['ask', 'Ask each time'\], \['always', 'Always'\], \['never', 'Never'\]\]/);
  assert.match(page, /save\(\{ cloudModels: value \}/);
});
