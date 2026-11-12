import assert from 'node:assert/strict';
import { test } from 'node:test';
import { insideProgram, researchMinutes } from '../lib/budget.js';

test('a run inside a program ends early enough to write its report', () => {
  assert.equal(insideProgram('call_1:ptc:2'), true);
  assert.equal(insideProgram('call_1'), false);
  assert.equal(insideProgram(undefined), false);

  assert.equal(researchMinutes({ configured: 20 }), 20);
  assert.equal(researchMinutes({ configured: 20, asked: 5 }), 5);
  assert.equal(researchMinutes({ configured: 20, asked: 90 }), 20, 'the setting is the ceiling');
  assert.equal(researchMinutes({}), 20);
  assert.equal(researchMinutes({ configured: 20, inProgram: true, programMaxMs: 600000 }), 7, '10 minutes less 3 for the report');
  assert.equal(researchMinutes({ configured: 20, asked: 4, inProgram: true, programMaxMs: 600000 }), 4);
  assert.equal(researchMinutes({ configured: 20, inProgram: false, programMaxMs: 600000 }), 20, 'direct calls keep the full budget');
  assert.equal(researchMinutes({ configured: 20, inProgram: true }), 20, 'an unknown limit changes nothing');
  assert.equal(researchMinutes({ configured: 20, inProgram: true, programMaxMs: 60000 }), 1, 'never less than a minute');
});
