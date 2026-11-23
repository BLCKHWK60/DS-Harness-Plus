// Item 4A, final fix round (lab: high). The per-thread maps (sessionWeb, sessionDepth, sessionHelpers, …) are one
// setting each, so every write replaces the whole map. A new draft's starting values were written from this add-on's own
// copy of the settings and dropped what another thread had set by hand a minute earlier. Now such writes are built from
// the settings service's current view, sent with its revision, and built again after a conflict. A draft picked into
// another mode after a restart (what its earlier start wrote is no longer known) gives back that mode's starting values,
// and a new draft for the same mode (the Cowork switch picks a folder) is seeded too.
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');

const json = (value) => JSON.parse((typeof value === 'string' ? value : '') || '{}');
const EXTRA = { research: { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research.' } };
const WS = '/Users/me/Documents/deepseek-harness/default-workspace';

/** A settings service like the app's: its own current values and a revision; a write with an old revision is refused. */
function liveSettings(world, { interfere } = {}) {
  const store = { ...world.config };
  let revision = 1;
  const service = {
    store,
    /** Another writer (the chat box's buttons): the service sees it, this add-on's copy does not yet. */
    external(field, value) {
      store[field] = value;
      revision += 1;
    },
    describe: () => [{ ns: 'modes', value: { ...store }, revision }],
    mutate: async (ns, ops, expected) => {
      if (ns !== 'modes') return;
      interfere?.(ops, service);
      if (expected !== undefined && expected !== revision) throw Object.assign(new Error('settings conflict'), { code: 'SETTINGS_CONFLICT' });
      for (const op of ops) {
        store[op.path[0]] = op.value;
        world.config[op.path[0]] = op.value;
      }
      revision += 1;
    },
  };
  return service;
}

function app(fields, options = {}) {
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), ...fields });
  const settings = liveSettings(world, options);
  const run = boot(world, { tabs: true, known: ['read'], services: { settings } });
  return { run, world, settings };
}

test('a new draft\'s starting values keep every other thread\'s own Web, Depth and Models', async () => {
  const modeStart = { plain: { web: 'off', depth: 'thorough', helpers: 'roles' } };
  const { run, settings } = app({ modeStart: JSON.stringify(modeStart) });
  // A started thread's Models and Depth were set by hand (the chat box wrote them; this add-on's copy is behind).
  await run.open('started', { header: { cwd: WS }, source: 'resume', lastTurn: 3 });
  settings.external('sessionHelpers', JSON.stringify({ started: 'same' }));
  settings.external('sessionDepth', JSON.stringify({ started: 'quick' }));
  settings.external('sessionWeb', JSON.stringify({ started: true }));
  await run.open('d1', { header: { cwd: WS } });
  await settle();
  await run.service().spaces.startDraft('d1', { space: 'chat' });
  await settle();
  assert.deepEqual(json(settings.store.sessionHelpers), { started: 'same', d1: 'roles' });
  assert.deepEqual(json(settings.store.sessionDepth), { started: 'quick', d1: 'thorough' });
  assert.deepEqual(json(settings.store.sessionWeb), { started: true, d1: false });
});

test('a write that meets another write in between is built again from the new values', async () => {
  let once = true;
  const interfere = (ops, service) => {
    if (once && ops.some((op) => op.path[0] === 'sessionDepth')) {
      once = false;
      service.external('sessionDepth', JSON.stringify({ ...json(service.store.sessionDepth), other: 'standard' }));
    }
  };
  const { run, settings } = app({ modeStart: JSON.stringify({ plain: { depth: 'thorough' } }) }, { interfere });
  await run.open('other', { header: { cwd: WS }, source: 'resume', lastTurn: 3 });
  await run.open('d2', { header: { cwd: WS } });
  await settle();
  await run.service().spaces.startDraft('d2', { space: 'chat' });
  await settle();
  assert.equal(once, false, 'the other write happened');
  assert.deepEqual(json(settings.store.sessionDepth), { other: 'standard', d2: 'thorough' });
});

test('after a restart, a reused draft picked into another mode gives back the earlier mode\'s starting values', async () => {
  const modeStart = { plain: { depth: 'quick' }, research: { depth: 'thorough', web: 'off', helpers: 'roles' } };
  // The draft was in Research before the restart and holds Research's starting values (what wrote them is gone).
  const { run, settings } = app({
    modeStart: JSON.stringify(modeStart),
    sessionModes: JSON.stringify({ d3: 'research' }),
    sessionSpaces: JSON.stringify({ d3: 'chat' }),
    sessionDepth: JSON.stringify({ d3: 'thorough' }),
    sessionWeb: JSON.stringify({ d3: false }),
    sessionHelpers: JSON.stringify({ d3: 'roles' }),
  });
  await run.open('d3', { header: { cwd: WS }, source: 'resume' });
  await settle();
  assert.equal(run.service().get('d3'), 'research');
  await run.service().spaces.pick('d3', 'plain');
  await settle();
  assert.equal(json(settings.store.sessionDepth).d3, 'quick', 'Plain chat\'s Depth');
  assert.equal(json(settings.store.sessionWeb).d3, undefined, 'Research\'s Web Off taken back');
  assert.equal(json(settings.store.sessionHelpers).d3, undefined, 'Research\'s Models taken back');
});

test('a new draft claimed for the same mode it already shows (the Cowork switch made it) gets the starting values', async () => {
  const modeStart = { plain: { web: 'off', depth: 'thorough', helpers: 'roles' } };
  const { run, settings } = app({ modeStart: JSON.stringify(modeStart), sessionModes: JSON.stringify({ d4: 'plain' }) });
  // Opened by the app's folder switch, not as a just-made conversation: no start was written for it.
  await run.open('d4', { header: { cwd: WS }, source: 'resume' });
  await settle();
  assert.equal(json(settings.store.sessionDepth).d4, undefined);
  await run.service().spaces.startDraft('d4', { space: 'chat' });
  await settle();
  assert.equal(json(settings.store.sessionDepth).d4, 'thorough');
  assert.equal(json(settings.store.sessionWeb).d4, false);
  assert.equal(json(settings.store.sessionHelpers).d4, 'roles');
});
