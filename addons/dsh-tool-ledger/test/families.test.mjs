// The family copy stays the same as Modes' own table, so the ledger groups tools the way Modes loads them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { CORE, FAMILIES, familyOf, loadFamilyOf } from '../lib/families.js';

const MODES_TRIM = new URL('../../dsh-modes/lib/trim.js', import.meta.url);

test('the copy matches Modes\' table (ids, names, prefixes, core)', { skip: !existsSync(MODES_TRIM) && 'Modes is not beside this add-on' }, async () => {
  const trim = await import(MODES_TRIM.href);
  assert.deepEqual(CORE, trim.CORE);
  const strip = (list) => list.map((family) => ({ id: family.id, names: family.names ?? [], prefixes: family.prefixes ?? [] }));
  assert.deepEqual(strip(FAMILIES), strip(trim.FAMILIES));
});

test('family of a tool: core, a family, or other', async () => {
  assert.equal(familyOf('read'), 'core');
  assert.equal(familyOf('pdf_read'), 'pdf');
  assert.equal(familyOf('mcp__github__list'), 'connectors');
  assert.equal(familyOf('web_fetch'), 'other');
  const live = await loadFamilyOf();
  assert.equal(live('pdf_read'), 'pdf');
});

test('state-only tools: only Mission\'s step tool (offered only while a Mission runs), and only for "not offered"', async () => {
  const { STATE_ONLY_TOOLS, isStateOnlyMiss } = await import('../lib/families.js');
  assert.deepEqual([...STATE_ONLY_TOOLS], ['mission_step']);
  assert.equal(isStateOnlyMiss({ tool: 'mission_request_files', rule: 'not-offered' }), false, 'always registered: a tab without it is missing it');
  assert.equal(isStateOnlyMiss({ tool: 'mission_step', rule: 'not-offered' }), true);
  assert.equal(isStateOnlyMiss({ tool: 'mission_step', rule: 'isolated' }), false);
  assert.equal(isStateOnlyMiss({ tool: 'bash', rule: 'not-offered' }), false);
  // The names are the ones Mission registers, when Mission is beside this add-on.
  const runner = new URL('../../dsh-mission/runner.js', import.meta.url);
  if (existsSync(runner)) {
    const { readFileSync } = await import('node:fs');
    assert.match(readFileSync(runner, 'utf8'), /STEP_TOOL = 'mission_step'/);
  }
});
