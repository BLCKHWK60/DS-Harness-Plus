// Lab check of the owner's point 19 (20 November 2026, 23:24), F2 on the server: the card says why Start Mission is
// greyed (runButtonWhy), so the page never names Recon outside Recon. F1's server tests are in settings-fix.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { appHarness } from './app-harness.mjs';

test('F2: the card says why Start Mission is greyed: nothing in an ordinary conversation, "helper" in a helper\'s, "recon" only where Recon keeps Missions out', async () => {
  const plain = appHarness();
  try {
    plain.open('c');
    const card = (await plain.get('c')).json;
    assert.equal(card.runButton, true);
    assert.equal(card.runButtonWhy, '');
    const helper = plain.open('h');
    helper.header.parentSession = 'c';
    const got = (await plain.get('h')).json;
    assert.equal(got.runButton, false);
    assert.equal(got.runButtonWhy, 'helper');
  } finally {
    plain.done();
  }
  const isolated = { isolated: () => true, get: () => 'research', readOnly: () => false, longTools: () => ({ files: true, web: true }), refreshTools: () => {}, ultraCode: () => false, depthOf: () => 'standard' };
  const recon = appHarness({ services: { modes: isolated } });
  try {
    recon.open('r');
    const card = (await recon.get('r')).json;
    assert.equal(card.runButton, false);
    assert.equal(card.runButtonWhy, 'recon');
  } finally {
    recon.done();
  }
  const allowed = appHarness({ services: { modes: isolated, recon: { runs: () => true } } });
  try {
    allowed.open('r');
    const card = (await allowed.get('r')).json;
    assert.equal(card.runButton, true);
    assert.equal(card.runButtonWhy, '');
  } finally {
    allowed.done();
  }
});
