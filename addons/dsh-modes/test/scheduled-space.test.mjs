// Item 4A, final fix round (lab: medium). An Automation with no recorded tab or folder opens its new thread in the app's
// working folder (another project: Code), while the thread runs the task's mode (scheduledMode, Cowork). Code does not
// offer Cowork, so the thread sat in Code with a mode its space does not offer. Now space and mode agree: the thread goes
// to its mode's own space (Chat).
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');

test('an Automation\'s new thread in a project folder runs Cowork and is recorded in Chat, not Code', async () => {
  const world = makeWorld({ scheduledMode: 'cowork' });
  const run = boot(world, { tabs: true, known: ['read'] });
  const { agent } = await run.open('auto-1', { header: { cwd: '/Users/me/projects/spike-lab' } });
  await run.waterfall('schedule/resolve-agent', 'auto-1', async () => agent);
  await settle();
  assert.equal(run.service().get('auto-1'), 'cowork');
  assert.equal(run.service().spaces.of('auto-1'), 'chat', 'Cowork\'s own space');
  await run.firstTurn(agent);
  await settle();
  assert.equal(JSON.parse(world.config.sessionSpaces || '{}')['auto-1'], 'chat', 'recorded in Chat at its first message');
});

test('a scheduled mode the folder\'s space offers stays there (Code in a project folder)', async () => {
  const world = makeWorld({ scheduledMode: 'code' });
  const run = boot(world, { tabs: true, known: ['read'] });
  const { agent } = await run.open('auto-2', { header: { cwd: '/Users/me/projects/spike-lab' } });
  await run.waterfall('schedule/resolve-agent', 'auto-2', async () => agent);
  await settle();
  assert.equal(run.service().get('auto-2'), 'code');
  assert.equal(run.service().spaces.of('auto-2'), 'code');
});
