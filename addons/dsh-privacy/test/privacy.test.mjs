import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readState, FEEDBACK_ROW, USAGE_ROW } from '../index.js';

const row = (id, extra = {}) => ({ options: { id, config: {} }, disabled: false, ...extra });

test('rows that are on are reported as on', () => {
  const state = readState([row(FEEDBACK_ROW, { options: { id: FEEDBACK_ROW, config: { mode: 'FEEDBACK_ONLY' } } }), row(USAGE_ROW, { options: { id: USAGE_ROW, config: { enabled: true } } })]);
  assert.equal(state.feedbackUpload, 'on');
  assert.equal(state.usageEvents, 'on');
  assert.match(state.lines[0], /ON/);
});

test('each off value is recognised', () => {
  assert.equal(readState([row(FEEDBACK_ROW, { disabled: true })]).feedbackUpload, 'off');
  assert.equal(readState([row(FEEDBACK_ROW, { options: { id: FEEDBACK_ROW, config: { mode: 'DISABLED' } } })]).feedbackUpload, 'off');
  assert.equal(readState([row(USAGE_ROW, { options: { id: USAGE_ROW, config: { enabled: false } } })]).usageEvents, 'off');
  assert.equal(readState([row(USAGE_ROW, { options: { id: USAGE_ROW, config: { enabled: { get: () => false } } } })]).usageEvents, 'off');
  assert.equal(readState([row(USAGE_ROW, { disabled: true })]).usageEvents, 'off');
  // A row the profile does not have reports nothing.
  assert.deepEqual([readState([]).feedbackUpload, readState([]).usageEvents], ['off', 'off']);
});

test('the bundle patch switches both rows off', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8');
  assert.match(patch, /- id: session-telemetry-otel\n  disabled: true/);
  assert.match(patch, /- id: product-analytics\n  config:\n    enabled: false/);
});
