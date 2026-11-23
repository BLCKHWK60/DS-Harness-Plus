// Item 4A, fix round 2 (review: medium): Plain chat replaced Cowork and Chat as the Chat space's start mode, so it also
// gets Cowork's other per-mode choices once (`plainCarried`): starting values, Mission tools, Mission's work loop tab,
// Sampling presets and Agent swarm per mode. Only where Cowork has one and Plain chat none; the Cowork keys stay.
import assert from 'node:assert/strict';
import test from 'node:test';
import { plainCarryOps } from '../lib/plain.js';

process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');
const read = (value) => (typeof value?.get === 'function' ? value.get() : value);

test('plainCarryOps: Cowork\'s entries copied to Plain chat where it has none; Cowork kept; the marker last', () => {
  const start = { cowork: { web: 'on', depth: 'thorough' }, chat: { web: 'off' } };
  const plan = plainCarryOps(
    { modeStart: JSON.stringify(start), longTools: JSON.stringify({ cowork: { files: true, web: false } }) },
    { mission: { loopTabs: '["cowork","code"]' }, 'sampling-presets': { byMode: { cowork: 'creative', code: 'precise' } }, 'agent-swarm': { defaultSwarmByMode: { cowork: 'trio' } } },
  );
  assert.deepEqual(plan.modes.map((op) => op.path[0]), ['modeStart', 'longTools', 'plainCarried']);
  assert.deepEqual(JSON.parse(plan.modes[0].value), { ...start, plain: { web: 'on', depth: 'thorough' } }, 'from Cowork (tools on), not Chat');
  assert.deepEqual(JSON.parse(plan.modes[1].value).plain, { files: true, web: false });
  assert.deepEqual(JSON.parse(plan.others.mission[0].value), ['cowork', 'code', 'plain']);
  assert.deepEqual(plan.others['sampling-presets'][0].value, { cowork: 'creative', code: 'precise', plain: 'creative' });
  assert.deepEqual(plan.others['agent-swarm'][0], { op: 'set', path: ['defaultSwarmByMode'], value: { cowork: 'trio', plain: 'trio' } });
});

test('plainCarryOps: Plain chat\'s own choice stays; nothing from Cowork, a missing add-on or a broken value: only the marker', () => {
  const plan = plainCarryOps(
    { modeStart: '{"cowork":{"web":"on"},"plain":{}}', longTools: 'not json' },
    { mission: { loopTabs: '["cowork","plain"]' }, 'sampling-presets': { byMode: { cowork: 'x', plain: '' } } },
  );
  assert.deepEqual(plan, { modes: [{ op: 'set', path: ['plainCarried'], value: true }], others: {} });
  assert.deepEqual(plainCarryOps({}, {}), { modes: [{ op: 'set', path: ['plainCarried'], value: true }], others: {} });
  assert.deepEqual(plainCarryOps({}, { mission: { loopTabs: '["code"]' } }).others, {}, 'no Cowork: no work loop for Plain chat either');
});

test('on an install from before: written once at the first thread, into each add-on that is there; the marker stops a second run', async () => {
  const mission = { ns: 'mission', value: { loopTabs: '["cowork"]' } };
  const sampling = { ns: 'sampling-presets', value: { byMode: { cowork: 'creative' } } };
  const world = makeWorld({ plainAdded: true, modeStart: JSON.stringify({ cowork: { depth: 'quick' } }) });
  const run = boot(world, { tabs: true, settingsExtra: [mission, sampling] });
  await run.open('t1');
  await settle();
  assert.equal(read(world.config.plainCarried), true);
  assert.deepEqual(JSON.parse(read(world.config.modeStart)), { cowork: { depth: 'quick' }, plain: { depth: 'quick' } });
  assert.deepEqual(JSON.parse(mission.value.loopTabs), ['cowork', 'plain']);
  assert.deepEqual(sampling.value.byMode, { cowork: 'creative', plain: 'creative' });
  // The owner turns Plain chat's work loop off afterwards: a restart does not bring it back.
  mission.value.loopTabs = '["cowork"]';
  const again = boot(world, { tabs: true, settingsExtra: [mission, sampling] });
  await again.open('t2');
  await settle();
  assert.deepEqual(JSON.parse(mission.value.loopTabs), ['cowork']);
});

test('another add-on\'s write fails: no marker for that add-on, tried again at the next start (nothing written twice)', async () => {
  const mission = { ns: 'mission', value: { loopTabs: '["cowork"]' } };
  const world = makeWorld({ plainAdded: true, longTools: JSON.stringify({ cowork: { files: false } }) });
  const run = boot(world, { tabs: true, settingsExtra: [mission], failWrite: (ops, ns) => ns === 'mission' });
  await run.open('t1');
  await settle();
  assert.ok(!JSON.parse(read(world.config.plainCarriedIn)).includes('mission'), 'Mission not marked done');
  assert.deepEqual(JSON.parse(read(world.config.longTools)).plain, { files: false }, 'Modes\' own copy is made');
  const again = boot(world, { tabs: true, settingsExtra: [mission] });
  await again.open('t2');
  await settle();
  assert.equal(read(world.config.plainCarried), true);
  assert.deepEqual(JSON.parse(mission.value.loopTabs), ['cowork', 'plain']);
});

// Final fix round (review: low): the marker is per add-on, so Mission, Sampling presets or Agent swarm installed (or
// switched on) after the first carry still gets Cowork's choice for Plain chat once.
test('an add-on that turns up later is carried once at that start; one already carried is not touched again', async () => {
  const sampling = { ns: 'sampling-presets', value: { byMode: { cowork: 'creative' } } };
  const world = makeWorld({ plainAdded: true, modeStart: JSON.stringify({ cowork: { depth: 'quick' } }) });
  const run = boot(world, { tabs: true, settingsExtra: [sampling] });
  await run.open('t1');
  await settle();
  assert.equal(read(world.config.plainCarried), true);
  assert.deepEqual(JSON.parse(read(world.config.plainCarriedIn)), ['sampling-presets']);
  // The owner clears Plain chat's sampling preset; then installs Mission.
  delete sampling.value.byMode.plain;
  const mission = { ns: 'mission', value: { loopTabs: '["cowork"]' } };
  const again = boot(world, { tabs: true, settingsExtra: [sampling, mission] });
  await again.open('t2');
  await settle();
  assert.deepEqual(JSON.parse(mission.value.loopTabs), ['cowork', 'plain'], 'Mission, new here, is carried');
  assert.deepEqual(sampling.value.byMode, { cowork: 'creative' }, 'Sampling presets, carried before, is left as the owner set it');
  assert.deepEqual(JSON.parse(read(world.config.plainCarriedIn)).sort(), ['mission', 'sampling-presets']);
});
