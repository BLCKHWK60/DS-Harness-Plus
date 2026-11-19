// Tests the shared page helpers (docs/shared/dsh-kit.js, copied into pages by scripts/sync-kit.mjs). They live here
// because Artifacts is the first page that uses the question box; the master file is in the repository's docs folder.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../../docs/shared/dsh-kit.js', import.meta.url), 'utf8');
const kit = new Function(`${source}\nreturn dshKit;`)();

test('raw status and settings errors become plain sentences, the raw text goes to the details', () => {
  const cases = {
    'error 404': /not available/,
    'status 500': /ran into a problem/,
    'settings/conflict: stale revision': /changed somewhere else/,
    'not mounted': /not running/,
    'Failed to fetch': /Could not reach the app/,
    'error 403': /did not allow/,
  };
  for (const [raw, expected] of Object.entries(cases)) {
    const found = kit.plain(raw);
    assert.match(found.text, expected, raw);
    assert.equal(found.details, raw);
  }
});

test('an error object with a code and message is read, and a readable sentence is left alone', () => {
  assert.match(kit.plain({ code: 'settings/conflict', message: 'x' }).text, /changed somewhere else/);
  assert.equal(kit.plain({ code: 'settings/conflict', message: 'x' }).details, 'settings/conflict: x');
  assert.deepEqual(kit.plain('The folder does not exist.'), { text: 'The folder does not exist.', details: '' });
  assert.match(kit.plain('').text, /Something went wrong/);
});

test('fail() makes an Error whose message is plain and whose details keep the raw text', () => {
  const error = kit.fail('error 404');
  assert.ok(error instanceof Error);
  assert.match(error.message, /not available/);
  assert.equal(error.details, 'error 404');
  // A second pass keeps the details instead of losing them.
  assert.equal(kit.plain(error).details, 'error 404');
});

test('every page copy of the helpers matches the master', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, [new URL('../../../scripts/sync-kit.mjs', import.meta.url).pathname, '--check'], { encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } });
  assert.equal(run.status, 0, run.stdout);
});
