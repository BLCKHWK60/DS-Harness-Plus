/**
 * The whole add-on in a stand-in app (Automations part): deleted automations to the trash and back,
 * missed times, late runs, the tab's mode, and the results tool. Nothing here touches the real app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';

const MIN = 60 * 1000;
// The tab-gone guard's waits, short here (item 6 fix): a tab missing for 0 ms on a second look, an edit given up after 40 ms.
process.env.DSH_AUTOMATIONS_TAB_GONE_MS = '0';
process.env.DSH_AUTOMATIONS_GUARD_WAIT_MS = '40';
// No 1 s cache of the tab list and the scheduled tab here: the tests change them between calls.
process.env.DSH_AUTOMATIONS_CACHE_MS = '0';

function standIn({ noTrash = false, catalog = [], gap, notesFile, modesValue = { extraModes: '{}', scheduledMode: 'cowork' }, isolated = () => false, events = {}, extra = {}, refuseWith = '', refuseCreate = null, config: own = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'automations-'));
  if (gap) {
    mkdirSync(join(home, 'automations'), { recursive: true });
    writeFileSync(join(home, 'automations', 'alive.json'), JSON.stringify({ beat: gap.from, gaps: [] }));
  }
  if (notesFile) {
    mkdirSync(join(home, 'automations'), { recursive: true });
    writeFileSync(join(home, 'automations', 'tasks.json'), JSON.stringify(notesFile));
  }
  const config = { enabled: true, deletedToTrash: true, oldRunsToTrash: true, tab: true, mac: false, phone: false, ...own };
  let list = catalog.map((entry) => ({ ...entry }));
  const created = [];
  const actors = [];
  const edits = [];
  const trashAdds = [];
  const mutations = [];
  const handlers = {};
  let owner;
  let route;
  let tool;
  let changed = () => {};
  const schedule = {
    catalog: async () => list.map((entry) => ({ ...entry })),
    create: async (request, actor) => {
      if (request.target?.kind === 'session' && request.target.sessionId === 'gone') throw new Error('session not found');
      // As the real scheduler: a time without seconds is refused, by a thrown ScheduleInputError with a code (item 6).
      const time = request.timing?.daily?.time ?? request.timing?.weekly?.time ?? request.timing?.at?.time;
      if (time !== undefined && !/^\d\d:\d\d:\d\d(\.\d{1,3})?$/.test(time)) throw Object.assign(new Error('time must be HH:mm:ss'), { name: 'ScheduleInputError', code: 'invalid_selector' });
      if (refuseCreate) throw Object.assign(new Error(refuseCreate.message), { name: 'ScheduleInputError', code: refuseCreate.code });
      const entry = { id: `new-${created.length + 1}`, kind: request.timing.kind, title: request.title, prompt: request.prompt, status: 'active', target: request.target, involvedSessionIds: actor ? [actor] : [], updatedAt: 'u1' };
      created.push(request);
      actors.push(actor);
      list.push(entry);
      return entry;
    },
    edit: async (request) => {
      edits.push(request);
      // A refusal the page has no words of its own for (a test gives its code).
      if (refuseWith) return { id: request.id, code: refuseWith };
      const entry = list.find((item) => item.id === request.id);
      if (!entry) return { id: request.id, code: 'schedule_not_found' };
      if (request.expectedUpdatedAt !== undefined && request.expectedUpdatedAt !== entry.updatedAt) return { id: request.id, code: 'schedule_conflict' };
      if (request.action === 'delete') list = list.filter((item) => item.id !== request.id);
      else if (request.patch.active !== undefined) entry.status = request.patch.active ? 'active' : 'paused';
      if (request.action === 'update' && request.patch.target) entry.target = request.patch.target.kind === 'new_once' ? { ...request.patch.target, sessionId: `reserved-${edits.length}` } : request.patch.target;
      entry.updatedAt = `u${edits.length + 1}`;
      return entry;
    },
    run: async ({ id }) => ({ id }),
  };
  const services = {
    dshHomePath: (...parts) => join(home, ...parts),
    settings: { describe: () => [{ ns: 'modes', value: modesValue }], mutate: async (ns, ops) => { mutations.push([ns, ops]); for (const op of ops) modesValue[op.path[0]] = op.value; } },
    modes: { get: (id) => (String(id).startsWith('fin-') ? 'finance' : ''), isolated },
    sessionQuery: { readSession: async (id) => ({ events: events[id] ?? [] }) },
    sessions: { get: () => undefined },
    ...extra,
  };
  const inner = {
    effect: (make) => make(),
    on: (name, fn) => { if (name === 'schedule/changed') changed = fn; },
    schedule,
    tools: { register: (spec) => { tool = spec; return () => {}; } },
    webServer: { register: (spec) => { if (spec.path === DATA_PATH) route = spec.handler; return () => {}; } },
    connection: { requestRejection: () => undefined },
    coworkTrash: { register: (spec) => { if (noTrash) throw new Error('trash off'); owner = spec; return { add: async (request) => { trashAdds.push(request); return { row: request.key }; }, items: () => [], dispose: () => {} }; } },
  };
  const ctx = {
    get: (name) => services[name],
    effect: (make) => make(),
    provide: () => {},
    on: (name, fn) => { handlers[name] = fn; },
    logger: { warn: () => {}, info: () => {} },
    inject: (_deps, fn) => fn(inner),
  };
  apply(ctx, config);
  const call = async (body) => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    const req = body
      ? { method: 'POST', headers: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }
      : { method: 'GET', headers: {}, async *[Symbol.asyncIterator]() {} };
    await route(req, res);
    return JSON.parse(out);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
  return {
    home, call, settle, created, actors, edits, trashAdds, mutations, modesValue, config, schedule, hook: (name) => handlers[name],
    owner: () => owner, tool: () => tool, event: (session, event) => handlers['session/event'](session, event),
    remove: (id) => { list = list.filter((item) => item.id !== id); changed(); },
    list: () => list,
    done: () => rmSync(home, { recursive: true, force: true }),
  };
}

const daily = { id: 'd1', kind: 'daily', title: 'Brief', prompt: 'Summarise.', time: '08:30:00.000', timeZone: 'UTC', scheduledAt: new Date(Date.now() + 3600000).toISOString(), status: 'paused', target: { kind: 'session', sessionId: 'gone' }, involvedSessionIds: ['fin-1'], updatedAt: 'u0' };
const ended = { id: 'e1', kind: 'at', title: 'Old', prompt: 'x', scheduledAt: '2026-01-01T00:00:00Z', status: 'ended', target: { kind: 'new_once', sessionId: 'r1', create: {} }, involvedSessionIds: [], updatedAt: 'u0' };

test('a deleted automation goes to the trash with its tab, and Put back makes it again (A4, A10)', async () => {
  const reserved = { id: 'r2', kind: 'every', everySeconds: 300, title: 'Reserved', prompt: 'p', status: 'active', scheduledAt: new Date(Date.now() + 60000).toISOString(), target: { kind: 'new_once', sessionId: 'fin-reserved', create: {} }, involvedSessionIds: ['fin-reserved'], updatedAt: 'u0' };
  const app = standIn({ catalog: [daily, ended, reserved] });
  try {
    const first = await app.call();
    assert.equal(first.tasks.find((task) => task.id === 'd1').createdIn, 'finance');
    // The conversation a 'new_once' automation only reserved says nothing about where it was made (lab finding).
    assert.equal(first.tasks.find((task) => task.id === 'r2').createdIn, '');
    assert.equal(first.tasks.find((task) => task.id === 'r2').tab, 'cowork');
    app.remove('d1');
    app.remove('e1');
    await app.settle();
    assert.equal(app.trashAdds.length, 1, 'an ended automation is not kept');
    const add = app.trashAdds[0];
    assert.equal(add.key, 'task.d1');
    assert.equal(add.tab, 'finance');
    assert.equal(add.data.ownerData.recipe.prompt, 'Summarise.');
    // Put back: the conversation it wrote into is gone, so it opens its own; it was paused, so it stays paused.
    const answer = await app.owner().putBack({ data: [{ item: 'p1', ownerData: { ...add.data.ownerData, alerts: { finished: true } } }] });
    assert.deepEqual(answer.done, ['p1']);
    assert.equal(app.created.length, 1);
    assert.deepEqual(app.created[0].target, { kind: 'new_once', create: {} });
    assert.deepEqual(app.created[0].timing, { kind: 'daily', daily: { time: '08:30:00.000', time_zone: 'UTC' } });
    assert.match(answer.notes[0], /thread of its own/);
    assert.ok(app.edits.some((edit) => edit.id === 'new-1' && edit.patch?.active === false));
    // The one made again is not put in the trash a second time, and keeps its own alerts.
    const again = await app.call();
    assert.deepEqual(again.tasks.find((task) => task.id === 'new-1').alerts, { finished: true });
    assert.equal(again.tasks.find((task) => task.id === 'new-1').createdIn, 'finance');
    assert.equal(app.trashAdds.length, 1);
    // A one-time automation whose time has passed cannot come back.
    const passed = await app.owner().putBack({ data: [{ item: 'p2', ownerData: { recipe: { ...add.data.ownerData.recipe, kind: 'at', scheduledAt: '2026-01-01T00:00:00Z' } } }] });
    assert.match(passed.failed[0].reason, /time has passed/);
  } finally {
    app.done();
  }
});

test('the switch off: deleting stays final', async () => {
  const app = standIn({ catalog: [daily] });
  try {
    app.config.deletedToTrash = false;
    await app.call();
    app.remove('d1');
    await app.settle();
    assert.equal(app.trashAdds.length, 0);
  } finally {
    app.done();
  }
});

test('times missed while the app was closed are listed, but not the one the app ran late (A3)', async () => {
  const now = Date.now();
  const every = { id: 'm1', kind: 'every', everySeconds: 60, title: 'Each minute', prompt: 'p', status: 'active', scheduledAt: new Date(now + 30000).toISOString(), createdAt: new Date(now - 60 * MIN).toISOString(), target: { kind: 'new', create: {} }, involvedSessionIds: [], updatedAt: 'u0' };
  const app = standIn({ catalog: [every], gap: { from: now - 6 * MIN } });
  try {
    const view = await app.call();
    const task = view.tasks.find((item) => item.id === 'm1');
    assert.ok(task.missed.length >= 4 && task.missed.length <= 6, `missed ${task.missed.length}`);
    assert.equal(view.tiles.missed, task.missed.length);
    assert.equal(view.closed.length, 1);
    const line = await app.call({ action: 'timeline', span: 'day' });
    assert.ok(line.timeline.lanes[0].marks.some((mark) => mark.kind === 'missed'));
    assert.ok(line.timeline.lanes[0].marks.some((mark) => mark.kind === 'upcoming'));
  } finally {
    app.done();
  }
});

test('a late run is marked, and "when the app opened" only inside a gap (A2)', async () => {
  const now = Date.now();
  const app = standIn({ catalog: [daily], gap: { from: now - 30 * MIN } });
  try {
    await app.call();
    const message = (id, at) => ({ id, source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nx\nschedule_id_json: "d1"\noccurrence_at: ${new Date(at).toISOString()}\nreminder_prompt_json: "p"` }] });
    app.event({ id: 's1', header: { id: 's1' } }, { type: 'user/message', data: message('m1', now - 10 * MIN) });
    app.event({ id: 's1', header: { id: 's1' } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
    app.event({ id: 's2', header: { id: 's2' } }, { type: 'user/message', data: message('m2', now - 1000) });
    const view = await app.call();
    const late = view.runs.find((run) => run.id === 'm1');
    assert.equal(late.late, true);
    assert.equal(late.whenOpened, true);
    assert.equal(view.runs.find((run) => run.id === 'm2').late, undefined);
  } finally {
    app.done();
  }
});

test('the tab joins the Modes add-on and leaves it when switched off (A5)', async () => {
  const app = standIn();
  try {
    await app.settle();
    assert.ok(JSON.parse(app.modesValue.extraModes).automations);
    app.config.tab = false;
    app.modesValue.defaultMode = 'automations';
    // The next sync (every 3 s) takes it out; call it by waiting.
    await new Promise((resolve) => setTimeout(resolve, 3200));
    assert.equal(JSON.parse(app.modesValue.extraModes).automations, undefined);
    assert.equal(app.modesValue.defaultMode, 'cowork');
  } finally {
    app.done();
  }
});

test('pause, resume and a stale change through the page (A6, A7)', async () => {
  const app = standIn({ catalog: [{ ...daily, status: 'active', target: { kind: 'new', create: {} } }] });
  try {
    let view = await app.call({ action: 'pause', id: 'd1', expectedUpdatedAt: 'u0' });
    assert.equal(view.tasks[0].status, 'paused');
    await assert.rejects(async () => {
      const out = await app.call({ action: 'resume', id: 'd1', expectedUpdatedAt: 'u0' });
      if (out.error) throw new Error(out.error);
    }, /changed on another page/);
    view = await app.call({ action: 'alerts', id: 'd1', alerts: { failed: false } });
    assert.deepEqual(view.tasks[0].alerts, { failed: false });
    const gone = await app.call({ action: 'keep', id: 'nope', keep: { days: 1, count: 0 } });
    assert.match(gone.error, /gone/);
  } finally {
    app.done();
  }
});

test('automation_results answers from the record and never reads an isolated conversation (A22)', async () => {
  const events = { s1: [{ type: 'assistant/message', time: new Date().toISOString(), data: { message: { content: [{ type: 'text', text: 'The full brief.' }] } } }] };
  const app = standIn({ catalog: [daily], isolated: (id) => id === 's2', events: { ...events, s2: events.s1 } });
  try {
    await app.call();
    const now = Date.now();
    const message = (id) => ({ id, source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nx\nschedule_id_json: "d1"\noccurrence_at: ${new Date(now).toISOString()}\nreminder_prompt_json: "p"` }] });
    for (const sid of ['s1', 's2']) {
      app.event({ id: sid, header: { id: sid } }, { type: 'user/message', data: message(`m-${sid}`) });
      app.event({ id: sid, header: { id: sid } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
    }
    const out = await app.tool().execute({ automation: 'brief', full: true });
    assert.equal((out.text.match(/The full brief\./g) ?? []).length, 1, out.text);
    assert.match((await app.tool().execute({ automation: 'nothing like it' })).text, /No run matches/);
  } finally {
    app.done();
  }
});

test('without the trash a deletion is held, not lost (review finding 3)', async () => {
  const { readFileSync } = await import('node:fs');
  const app = standIn({ catalog: [daily], noTrash: true });
  try {
    await app.call();
    app.remove('d1');
    await app.settle();
    assert.equal(app.trashAdds.length, 0);
    const saved = JSON.parse(readFileSync(join(app.home, 'automations', 'tasks.json'), 'utf8'));
    assert.deepEqual(saved.held.map((recipe) => recipe.id), ['d1']);
    assert.equal(saved.held[0].note.createdIn, 'finance');
  } finally {
    app.done();
  }
});

test('nothing of an isolated conversation is kept or quoted, and without Modes nothing is read (review finding 1)', async () => {
  const app = standIn({ catalog: [daily], isolated: () => true });
  try {
    await app.call();
    const message = { id: 'm-x', source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nx\nschedule_id_json: "d1"\noccurrence_at: ${new Date().toISOString()}\nreminder_prompt_json: "p"` }] };
    app.event({ id: 'sx', header: { id: 'sx' } }, { type: 'user/message', data: message });
    app.event({ id: 'sx', header: { id: 'sx' } }, { type: 'assistant/message', data: { message: { content: [{ type: 'text', text: 'SECRET RECON WORDS' }] } } });
    app.event({ id: 'sx', header: { id: 'sx' } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
    const view = await app.call();
    assert.equal(view.runs[0].text, '');
    const out = await app.tool().execute({ full: true });
    assert.doesNotMatch(out.text, /SECRET/);
  } finally {
    app.done();
  }
});

test('Run now pressed on the page is never late, even when it starts much later (review finding 7)', async () => {
  const app = standIn({ catalog: [{ ...daily, status: 'active' }] });
  try {
    await app.call({ action: 'run', id: 'd1' });
    const pressed = Date.now();
    const message = { id: 'm-now', source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nx\nschedule_id_json: "d1"\noccurrence_at: ${new Date(pressed).toISOString()}\nreminder_prompt_json: "p"` }] };
    // It waited behind a busy conversation: the stand-in cannot wait minutes, so the record's clock is checked instead.
    app.event({ id: 'sn', header: { id: 'sn' } }, { type: 'user/message', data: message });
    const view = await app.call();
    assert.equal(view.runs.find((run) => run.id === 'm-now').dueAt, undefined);
  } finally {
    app.done();
  }
});

test('Creator Plus\'s saved runs are offered, and one is scheduled only into a Creator Plus conversation', async () => {
  let on = true;
  const creatorPlus = {
    savedRuns: () => (on ? [{ name: 'Weekly check', sentence: 'Check after an update: notes, reporting only.' }] : []),
    savedRunPrompt: (name) => (on && name === 'Weekly check' ? '[Creator Plus saved run: Weekly check]\nCheck after an update.' : ''),
  };
  const modes = { get: (id) => (String(id).startsWith('cp-') ? 'creator-plus' : 'cowork'), isolated: () => false };
  const app = standIn({ extra: { creatorPlus, modes } });
  try {
    const view = await app.call();
    assert.deepEqual(view.creatorRuns, [{ name: 'Weekly check', sentence: 'Check after an update: notes, reporting only.' }]);
    await app.call({ action: 'creatorRun', name: 'Weekly check', sessionId: 'cp-1', time: '09:00', weekdays: [1], timeZone: 'UTC' });
    assert.equal(app.created.length, 1);
    assert.deepEqual(app.created[0], { title: 'Creator Plus: Weekly check', prompt: '[Creator Plus saved run: Weekly check]\nCheck after an update.', timing: { kind: 'weekly', weekly: { time: '09:00:00', time_zone: 'UTC', weekdays: [1] } }, target: { kind: 'session', sessionId: 'cp-1' } });
    await app.call({ action: 'creatorRun', name: 'Weekly check', sessionId: 'cp-2', time: '07:30', weekdays: [], timeZone: 'UTC' });
    assert.deepEqual(app.created[1].timing, { kind: 'daily', daily: { time: '07:30:00', time_zone: 'UTC' } });
    assert.equal((await app.call()).tasks.find((task) => task.title === 'Creator Plus: Weekly check').createdIn, 'creator-plus');
    // Refused: a Cowork conversation, an unknown run, a bad time or zone, Creator Plus switched off.
    await assert.rejects(app.call({ action: 'creatorRun', name: 'Weekly check', sessionId: 'c-1', time: '09:00', timeZone: 'UTC' }).then((answer) => { if (answer.error) throw new Error(answer.error); }), /only into a Creator Plus thread/);
    await assert.rejects(app.call({ action: 'creatorRun', name: 'Other', sessionId: 'cp-1', time: '09:00', timeZone: 'UTC' }).then((answer) => { if (answer.error) throw new Error(answer.error); }), /no such saved run/);
    await assert.rejects(app.call({ action: 'creatorRun', name: 'Weekly check', sessionId: 'cp-1', time: '9 am', timeZone: 'UTC' }).then((answer) => { if (answer.error) throw new Error(answer.error); }), /A time like 09:00/);
    await assert.rejects(app.call({ action: 'creatorRun', name: 'Weekly check', sessionId: 'cp-1', time: '09:00', timeZone: 'Mars/Base' }).then((answer) => { if (answer.error) throw new Error(answer.error); }), /unknown time zone/);
    on = false;
    assert.deepEqual((await app.call()).creatorRuns, []);
    await assert.rejects(app.call({ action: 'creatorRun', name: 'Weekly check', sessionId: 'cp-1', time: '09:00', timeZone: 'UTC' }).then((answer) => { if (answer.error) throw new Error(answer.error); }), /switched off/);
    assert.equal(app.created.length, 2);
  } finally {
    app.done();
  }
});

test('without Creator Plus, the page offers no saved runs', async () => {
  const app = standIn();
  try {
    assert.deepEqual((await app.call()).creatorRuns, []);
    const refused = await app.call({ action: 'creatorRun', name: 'x', sessionId: 'cp-1', time: '09:00', timeZone: 'UTC' });
    assert.match(refused.error, /no such saved run, or Creator Plus is switched off/);
  } finally {
    app.done();
  }
});

test('each automation shows its preset, and changes it only through the app\'s scheduler on request (item 7)', async () => {
  const fromPtc = { id: 'p1', kind: 'every', everySeconds: 3600, title: 'Hourly', prompt: 'p', status: 'active', target: { kind: 'new', create: { cwd: '/w', agentPreset: 'ptc' } }, involvedSessionIds: [], updatedAt: 'u0' };
  const once = { id: 'p2', kind: 'every', everySeconds: 3600, title: 'Once', prompt: 'p', status: 'active', target: { kind: 'new_once', sessionId: 'conv-once', create: {} }, lastDelivery: { deliveredAt: '2026-11-20T08:00:00Z' }, involvedSessionIds: [], updatedAt: 'u0' };
  const into = { id: 'p3', kind: 'every', everySeconds: 3600, title: 'Into', prompt: 'p', status: 'active', target: { kind: 'session', sessionId: 'conv-into' }, involvedSessionIds: [], updatedAt: 'u0' };
  const sessions = { 'conv-once': { id: 'conv-once', preset: 'ptc' }, 'conv-into': { id: 'conv-into', preset: 'cordis' } };
  let listed = 0;
  const agentPresets = {
    defaultId: 'standard',
    list: async () => { listed += 1; return [{ id: 'standard' }, { id: 'ptc' }, { id: 'cordis' }, { id: 'gone', broken: 'x' }]; },
    presetForSession: (session) => session.preset,
  };
  const app = standIn({ catalog: [fromPtc, once, into], extra: { agentPresets, sessions: { get: (id) => sessions[id] } } });
  try {
    const view = await app.call();
    const of = (id) => view.tasks.find((task) => task.id === id).preset;
    assert.equal(of('p1').name, 'PTC');
    assert.equal(of('p1').from, 'own');
    assert.match(of('p1').info.what, /runs as a program each time/);
    assert.equal(of('p1').notes.ptc, 'Runs as a program each time.');
    assert.equal(of('p2').id, 'ptc', 'the conversation it ran in');
    assert.equal(of('p2').newConversation, true);
    assert.equal(of('p3').name, 'Creator');
    assert.equal(of('p3').changeable, false);
    assert.deepEqual(of('p3').notes, {});
    assert.deepEqual(view.presets.choices.map((choice) => choice.id), [':default', 'standard', 'ptc', 'cordis'], 'App default first');
    assert.equal(view.presets.choices[0].name, 'App default (now Standard)');
    assert.match(of('p1').notes[':default'], /each run uses the app's default preset/);
    assert.equal(view.presets.defaultId, 'standard');
    // Reading the page changes nothing.
    assert.equal(app.edits.length, 0);
    // A second look within a minute reads the cached list.
    await app.call();
    assert.equal(listed, 1);

    // Change on request: kind and folder kept, the preset set, sent with the version the page read.
    const changed = await app.call({ action: 'preset', id: 'p1', preset: 'standard', expectedUpdatedAt: 'u0' });
    assert.deepEqual(app.edits.at(-1), { id: 'p1', action: 'update', patch: { target: { kind: 'new', create: { cwd: '/w', agentPreset: 'standard' } } }, expectedUpdatedAt: 'u0' });
    assert.equal(changed.tasks.find((task) => task.id === 'p1').preset.name, 'Standard');
    // Changed elsewhere meanwhile: refused in plain words, nothing more sent.
    const stale = await app.call({ action: 'preset', id: 'p1', preset: 'ptc', expectedUpdatedAt: 'u0' });
    assert.match(stale.error, /changed on another page/);
    // A one-conversation automation that ran: the app reserves a new conversation for its next run.
    await app.call({ action: 'preset', id: 'p2', preset: 'standard' });
    assert.deepEqual(app.edits.at(-1).patch.target, { kind: 'new_once', create: { agentPreset: 'standard' } });
    // Refused: one that writes into a conversation, a broken or unknown preset, a gone automation.
    const before = app.edits.length;
    assert.match((await app.call({ action: 'preset', id: 'p3', preset: 'standard' })).error, /keeps the preset it started with/);
    assert.match((await app.call({ action: 'preset', id: 'p1', preset: 'gone' })).error, /not in the app now/);
    assert.match((await app.call({ action: 'preset', id: 'p1', preset: '' })).error, /not in the app now/);
    assert.match((await app.call({ action: 'preset', id: 'nope', preset: 'ptc' })).error, /gone/);
    assert.equal(app.edits.length, before, 'nothing sent for a refused change');
    // Back to App default (lab, item 7): nothing stored, so the automation follows the app's default preset again.
    await app.call({ action: 'preset', id: 'p1', preset: ':default' });
    assert.deepEqual(app.edits.at(-1).patch.target, { kind: 'new', create: { cwd: '/w' } });
  } finally {
    app.done();
  }
});

test('without the app\'s preset service the page still works and offers no change', async () => {
  const fromPtc = { id: 'p1', kind: 'every', everySeconds: 3600, title: 'Hourly', prompt: 'p', status: 'active', target: { kind: 'new', create: { agentPreset: 'ptc' } }, involvedSessionIds: [], updatedAt: 'u0' };
  const app = standIn({ catalog: [fromPtc] });
  try {
    const view = await app.call();
    assert.equal(view.tasks[0].preset.name, 'PTC');
    assert.deepEqual(view.presets.choices, []);
    assert.match((await app.call({ action: 'preset', id: 'p1', preset: 'standard' })).error, /not in the app now/);
    assert.equal(app.edits.length, 0);
  } finally {
    app.done();
  }
});

test('an automation writing into a conversation that is not open shows its stored preset, not "not known" (item 7 lab)', async () => {
  const into = { id: 'q1', kind: 'every', everySeconds: 3600, title: 'Into', prompt: 'p', status: 'active', target: { kind: 'session', sessionId: 'cold-1' }, involvedSessionIds: [], updatedAt: 'u0' };
  const headerOnly = { id: 'q2', kind: 'every', everySeconds: 3600, title: 'Header', prompt: 'p', status: 'active', target: { kind: 'session', sessionId: 'cold-2' }, involvedSessionIds: [], updatedAt: 'u0' };
  const lost = { id: 'q3', kind: 'every', everySeconds: 3600, title: 'Lost', prompt: 'p', status: 'active', target: { kind: 'session', sessionId: 'cold-3' }, involvedSessionIds: [], updatedAt: 'u0' };
  const headers = { 'cold-1': { id: 'cold-1', agentPreset: 'standard' }, 'cold-2': { id: 'cold-2', agentPreset: 'cordis' } };
  const stats = [];
  const extra = {
    agentPresets: { defaultId: 'standard', list: async () => [{ id: 'standard' }, { id: 'ptc' }, { id: 'cordis' }], presetForSession: () => null },
    sessionPersistence: { stat: async (id) => { stats.push(id); return headers[id] ? { header: headers[id] } : undefined; } },
    sessionProjections: { summaryKeys: () => ['agentPreset'] },
    // The app's list cache: cold-1 was switched to PTC while it was new (its log says so); cold-2 has no cached row.
    sessionProjectionCache: { cachedSnapshot: (header) => (header.id === 'cold-1' ? { values: { agentPreset: 'ptc' } } : undefined) },
  };
  const app = standIn({ catalog: [into, headerOnly, lost], extra });
  try {
    const view = await app.call();
    const of = (id) => view.tasks.find((task) => task.id === id).preset;
    assert.equal(of('q1').id, 'ptc', 'the preset its log ends on');
    assert.equal(of('q1').from, 'conversation');
    assert.equal(of('q2').id, 'cordis', 'else the stored header');
    assert.equal(of('q3').from, 'unknown');
    assert.match(of('q3').info.when, /Open its thread once, then come back/, 'the (i) says what to do');
    await app.call();
    assert.equal(stats.filter((id) => id === 'cold-1').length, 1, 'read once a minute at most');
  } finally {
    app.done();
  }
});

test('a change the app refuses for another reason says what to do; the code is only behind Details', async () => {
  const task = { id: 'z1', kind: 'every', everySeconds: 3600, title: 'Z', prompt: 'p', status: 'active', target: { kind: 'new', create: { agentPreset: 'ptc' } }, involvedSessionIds: [], updatedAt: 'u0' };
  const app = standIn({ catalog: [task], refuseWith: 'schedule_weird', extra: { agentPresets: { defaultId: 'standard', list: async () => [{ id: 'standard' }, { id: 'ptc' }], presetForSession: () => null } } });
  try {
    for (const body of [{ action: 'preset', id: 'z1', preset: 'standard' }, { action: 'pause', id: 'z1' }]) {
      const answer = await app.call(body);
      assert.equal(answer.error, 'The app did not accept the change. Look again, then try once more.', body.action);
      assert.equal(answer.details, 'The app refused: schedule_weird', 'the raw code, for Details only');
    }
  } finally {
    app.done();
  }
});

// ---- item 6: "Schedule this…" from every chat box, and New on the Automations page ----------------------------------

/** A stand-in app with tabs, conversations and a Modes service for the Schedule form. */
function item6({ catalog = [], config = {}, missionOn = false, refuseCreate = null } = {}) {
  const tabs = [
    { id: 'cowork', label: 'Cowork' }, { id: 'chat', label: 'Chat' }, { id: 'research', label: 'Research' },
    { id: 'devices', label: 'Devices' }, { id: 'recon', label: 'Recon', isolated: true }, { id: 'automations', label: 'Automations' },
  ];
  const chats = {
    'chat-1': { tab: 'chat', cwd: '/w/proj', preset: 'ptc', lastTurn: 3 },
    'draft-1': { tab: 'cowork', cwd: '/w/draft', preset: 'standard', lastTurn: 0 },
    'dev-1': { tab: 'devices', cwd: '/w/dev', preset: 'ptc', lastTurn: 2 },
    'auto-1': { tab: 'automations', cwd: '/w/auto', preset: 'standard', lastTurn: 1 },
    'recon-1': { tab: 'recon', cwd: '/tmp/dsh-recon-x', preset: 'standard', lastTurn: 2 },
    'helper-1': { tab: 'cowork', cwd: '/w/proj', preset: 'standard', lastTurn: 1, helper: true },
    'fresh-1': { tab: 'cowork', cwd: '/w/proj', preset: 'standard', lastTurn: 0 },
    'used-1': { tab: 'cowork', cwd: '/w/proj', preset: 'standard', lastTurn: 4 },
  };
  const sets = [];
  const modes = {
    get: (id) => chats[id]?.tab ?? 'cowork',
    isolated: (id) => chats[id]?.tab === 'recon',
    list: () => tabs.map((tab) => ({ ...tab })),
    lockedPreset: (tab) => (tab === 'devices' ? 'standard' : ''),
    set: async (id, tab, options) => { sets.push([id, tab, options]); },
  };
  const header = (id) => (chats[id] ? { id, cwd: chats[id].cwd, ...(chats[id].helper ? { origin: 'subagent', parentSession: 'chat-1' } : {}) } : undefined);
  const extra = {
    modes,
    agents: { get: (id) => (chats[id] ? { id, session: id } : undefined), turnBoundaryOf: (id) => ({ openTurnStartSeq: null, lastTurn: chats[id]?.lastTurn ?? 0 }) },
    sessions: { get: (id) => (chats[id] ? { id, header: header(id), preset: chats[id].preset } : undefined) },
    agentPresets: { defaultId: 'standard', list: async () => [{ id: 'standard' }, { id: 'ptc' }, { id: 'cordis' }], presetForSession: (session) => session.preset },
    mission: { isRunning: (id) => missionOn && id === 'chat-1' },
  };
  const app = standIn({ catalog, extra, config, refuseCreate });
  return { ...app, tabs, chats, sets, modes };
}
const weekdays = { kind: 'weekdays', time: '09:00' };
const failOf = async (promise) => { const answer = await promise; return answer.error ?? ''; };

test('the form in a started Chat conversation: all three places, this conversation first, the warnings', async () => {
  const app = item6({ missionOn: true });
  try {
    const context = await app.call({ action: 'context', sessionId: 'chat-1' });
    assert.equal(context.allowed, true);
    assert.deepEqual(context.wheres, ['session', 'new_once', 'new']);
    assert.equal(context.where, 'session');
    assert.equal(context.runTab, 'chat', 'new chats open in the tab it was made in');
    assert.equal(context.runTabName, 'Chat');
    assert.equal(context.folder, 'proj');
    assert.equal(context.presetNow, 'ptc');
    assert.equal(context.missionRunning, true);
    assert.match(context.missionWarn, /A Mission is running here/);
    assert.match(context.waitingNote, /Waiting for you/);
    assert.equal(context.presets[0].id, ':default');
    // A draft: one new chat, reused, by default.
    assert.equal((await app.call({ action: 'context', sessionId: 'draft-1' })).where, 'new_once');
  } finally {
    app.done();
  }
});

test('create into this conversation: HH:mm:ss, the conversation recorded as the actor, where it was made', async () => {
  const app = item6();
  try {
    const answer = await app.call({ action: 'create', sessionId: 'chat-1', title: ' Morning ', prompt: 'Summarise my inbox.', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(answer.error, undefined, answer.error);
    assert.deepEqual(app.created[0], { title: 'Morning', prompt: 'Summarise my inbox.', timing: { kind: 'weekly', weekly: { time: '09:00:00', time_zone: 'UTC', weekdays: [1, 2, 3, 4, 5] } }, target: { kind: 'session', sessionId: 'chat-1' } });
    assert.equal(app.actors[0], 'chat-1');
    assert.equal(answer.made.id, 'new-1');
    const task = answer.tasks.find((item) => item.id === 'new-1');
    assert.equal(task.createdIn, 'chat');
    assert.equal(task.runTab, '', 'this conversation has no run tab');
  } finally {
    app.done();
  }
});

test('create a new chat each time: the chat\'s folder and preset, the run tab written', async () => {
  const app = item6();
  try {
    const answer = await app.call({ action: 'create', sessionId: 'chat-1', title: 'News', prompt: 'p', when: { kind: 'hours', hours: 3 }, timeZone: 'UTC', where: 'new', cwd: '/elsewhere' });
    assert.equal(answer.error, undefined, answer.error);
    assert.deepEqual(app.created[0].target, { kind: 'new', create: { cwd: '/w/proj', agentPreset: 'ptc' } }, 'the folder comes from the chat, never from the page');
    assert.deepEqual(app.created[0].timing, { kind: 'every', every_seconds: 10800 });
    const task = answer.tasks.find((item) => item.id === 'new-1');
    assert.equal(task.runTab, 'chat');
    assert.equal(task.runsIn, 'chat');
    assert.equal(task.tab, 'chat');
    // A preset picked in the popover wins; App default stores none.
    await app.call({ action: 'create', sessionId: 'chat-1', title: 'N2', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new_once', preset: 'standard' });
    assert.deepEqual(app.created[1].target.create, { cwd: '/w/proj', agentPreset: 'standard' });
    await app.call({ action: 'create', sessionId: 'chat-1', title: 'N3', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new_once', preset: ':default' });
    assert.deepEqual(app.created[2].target.create, { cwd: '/w/proj' });
  } finally {
    app.done();
  }
});

test('a tab with a preset lock always uses its lock, written into create.agentPreset', async () => {
  const app = item6();
  try {
    await app.call({ action: 'create', sessionId: 'dev-1', title: 'Check', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new', preset: 'ptc' });
    assert.equal(app.created[0].target.create.agentPreset, 'standard');
    const context = await app.call({ action: 'context', sessionId: 'dev-1' });
    assert.equal(context.locked, 'standard');
    assert.equal(context.lockedName, 'Standard');
  } finally {
    app.done();
  }
});

test('made in the Automations tab: new chats only, and they open in the scheduled tab', async () => {
  const app = item6();
  try {
    const context = await app.call({ action: 'context', sessionId: 'auto-1' });
    assert.deepEqual(context.wheres, ['new_once', 'new']);
    assert.equal(context.runTab, 'cowork');
    const answer = await app.call({ action: 'create', sessionId: 'auto-1', title: 'A', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' });
    assert.equal(answer.tasks.find((item) => item.id === 'new-1').runTab, '');
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'auto-1', title: 'A', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /Pick where it runs/);
  } finally {
    app.done();
  }
});

test('Recon: allowed with a warning, only this conversation; the setting switches it off', async () => {
  const app = item6();
  try {
    const context = await app.call({ action: 'context', sessionId: 'recon-1' });
    assert.equal(context.allowed, true);
    assert.equal(context.recon, true);
    assert.deepEqual(context.wheres, ['session']);
    assert.match(context.reconWarn, /can be seen outside Recon/);
    assert.match(context.reconNewChat, /only in this thread/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'recon-1', title: 'R', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' })), /only in this thread/);
    assert.equal(app.created.length, 0);
    const made = await app.call({ action: 'create', sessionId: 'recon-1', title: 'R', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(made.error, undefined);
    assert.equal(made.tasks.find((item) => item.id === 'new-1').sealed, true);
    app.config.scheduleFromRecon = false;
    const off = await app.call({ action: 'context', sessionId: 'recon-1' });
    assert.equal(off.allowed, false);
    assert.match(off.reason, /Scheduling is off in Recon/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'recon-1', title: 'R', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /Scheduling is off in Recon/);
    assert.equal(app.created.length, 1);
  } finally {
    app.done();
  }
});

test('helper conversations are refused; names, instructions and times are checked again on the server', async () => {
  const app = item6();
  try {
    assert.match((await app.call({ action: 'context', sessionId: 'helper-1' })).reason, /helper thread/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'helper-1', title: 'H', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /helper thread/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'chat-1', title: '', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /1 to 120/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'chat-1', title: 'x', prompt: ' ', when: weekdays, timeZone: 'UTC', where: 'session' })), /what should happen/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'chat-1', title: 'x', prompt: 'p', when: { kind: 'once', date: '2020-01-01', time: '09:00' }, timeZone: 'UTC', where: 'session' })), /has passed/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'chat-1', title: 'x', prompt: 'p', when: weekdays, timeZone: 'Mars/Base', where: 'session' })), /time zone/);
    assert.equal(app.created.length, 0);
  } finally {
    app.done();
  }
});

test('the app\'s thrown refusal becomes a plain sentence, its code only behind Details', async () => {
  const app = item6({ refuseCreate: { code: 'frequency_too_high', message: 'every_seconds is below the floor' } });
  try {
    const answer = await app.call({ action: 'create', sessionId: 'chat-1', title: 'x', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(answer.error, 'That repeats too often. The app allows at most one run a minute.');
    assert.equal(answer.details, 'frequency_too_high: every_seconds is below the floor');
  } finally {
    app.done();
  }
});

test('New on the page: tabs without Recon and Automations, a folder needed, the run tab is the one picked', async () => {
  const app = item6();
  try {
    const context = await app.call({ action: 'context' });
    assert.equal(context.form, 'new');
    assert.deepEqual(context.tabs.map((tab) => tab.id), ['cowork', 'chat', 'research', 'devices']);
    assert.equal(context.tab, 'cowork');
    assert.equal(context.tabs.find((tab) => tab.id === 'devices').lockedName, 'Standard');
    const answer = await app.call({ action: 'create', tab: 'research', cwd: '/scratch/x', title: 'Weekly scan', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' });
    assert.equal(answer.error, undefined, answer.error);
    assert.deepEqual(app.created[0].target, { kind: 'new', create: { cwd: '/scratch/x' } });
    assert.equal(app.actors[0], undefined, 'no conversation asked');
    assert.equal(answer.tasks.find((item) => item.id === 'new-1').runTab, 'research');
    assert.match(await failOf(app.call({ action: 'create', tab: 'recon', cwd: '/x', title: 'x', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' })), /Recon or in a sealed mode/);
    assert.match(await failOf(app.call({ action: 'create', tab: 'chat', cwd: '', title: 'x', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' })), /folder/);
    assert.match(await failOf(app.call({ action: 'create', tab: 'chat', cwd: '/x', title: 'x', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /Pick where it runs/);
  } finally {
    app.done();
  }
});

test('the preview reads like the list, and says what is wrong', async () => {
  const app = item6();
  try {
    const preview = await app.call({ action: 'preview', when: weekdays, timeZone: 'UTC' });
    assert.match(preview.line, /^Every weekday at 09:00 · next: /);
    assert.match((await app.call({ action: 'preview', when: { kind: 'hours', hours: 3 }, timeZone: 'UTC' })).line, /Every 3 hours, first in 3 hours/);
    assert.match((await app.call({ action: 'preview', when: { kind: 'days', time: '09:00', days: [] }, timeZone: 'UTC' })).line, /at least one day/);
  } finally {
    app.done();
  }
});

const spliced = (taskId) => ({ type: 'agent/inbox/spliced', data: { inserted: [{ message: { source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nschedule_id_json: "${taskId}"\nreminder_prompt_json: "p"` }] } }] } });

test('the claim: only automations with a run tab, a fresh chat, a tab that is on, not Finance\'s, and only with the setting on', async () => {
  const withTab = { id: 't1', kind: 'every', everySeconds: 3600, title: 'Mine', prompt: 'p', status: 'active', scheduledAt: new Date(Date.now() + 3600000).toISOString(), target: { kind: 'new', create: {} }, involvedSessionIds: [], updatedAt: 'u0' };
  const assistant = { ...withTab, id: 't2', title: 'Assistant made' };
  const finance = { ...withTab, id: 't3', title: 'Finance brief: Markets' };
  const app = item6({ catalog: [withTab, assistant, finance] });
  try {
    await app.call();
    await app.call({ action: 'runTab', id: 't1', tab: 'research' });
    assert.match((await app.call({ action: 'runTab', id: 't3', tab: 'research' })).error, /Chat · Finance thread/, 'Finance decides where its briefs open');
    app.event({ id: 'fresh-1', header: { id: 'fresh-1' } }, spliced('t1'));
    assert.deepEqual(app.sets, [['fresh-1', 'research', { claim: true }]], 'claimed at once, before any await');
    app.event({ id: 'fresh-1', header: { id: 'fresh-1' } }, spliced('t2'));
    app.event({ id: 'fresh-1', header: { id: 'fresh-1' } }, spliced('t3'));
    app.event({ id: 'used-1', header: { id: 'used-1' } }, spliced('t1'));
    app.event({ id: 'helper-1', header: { id: 'helper-1', origin: 'subagent' } }, spliced('t1'));
    assert.equal(app.sets.length, 1, 'no claim for the assistant\'s, Finance\'s, a chat that ran, or a helper');
    app.config.runsInTheirTab = false;
    app.event({ id: 'fresh-1', header: { id: 'fresh-1' } }, spliced('t1'));
    assert.equal(app.sets.length, 1, 'the setting off: the scheduled tab, as before');
    app.config.runsInTheirTab = true;
    app.tabs.splice(app.tabs.findIndex((tab) => tab.id === 'research'), 1);
    app.event({ id: 'fresh-1', header: { id: 'fresh-1' } }, spliced('t1'));
    assert.equal(app.sets.length, 1, 'never into a tab that is off');
    // Runs in cannot be Recon or the Automations tab.
    assert.match((await app.call({ action: 'runTab', id: 't1', tab: 'recon' })).error, /sealed mode/);
    assert.match((await app.call({ action: 'runTab', id: 't1', tab: 'automations' })).error, /switched on/);
  } finally {
    app.done();
  }
});

test('the tab-gone guard pauses once with a note, and never fights the owner who switches it on again', async () => {
  const withTab = { id: 'g1', kind: 'every', everySeconds: 3600, title: 'Dev check', prompt: 'p', status: 'active', scheduledAt: new Date(Date.now() + 3600000).toISOString(), target: { kind: 'new', create: {} }, involvedSessionIds: [], updatedAt: 'u0' };
  const app = item6({ catalog: [withTab] });
  try {
    await app.call();
    await app.call({ action: 'runTab', id: 'g1', tab: 'devices' });
    await app.settle();
    assert.equal(app.edits.filter((edit) => edit.patch?.active !== undefined).length, 0, 'its tab is on: nothing happens (Devices\' preset lock is written, a separate fix)');
    app.tabs.splice(app.tabs.findIndex((tab) => tab.id === 'devices'), 1);
    await app.call();
    await app.settle();
    assert.deepEqual(app.edits.filter((edit) => edit.patch?.active !== undefined).map((edit) => [edit.id, edit.patch?.active]), [['g1', false]]);
    const view = await app.call();
    assert.equal(view.tasks[0].status, 'paused');
    assert.equal(view.tasks[0].pausedNote, 'Paused: its mode Devices is switched off. Switch it on, or change Runs in, then switch this automation on.');
    // The owner switches it on anyway: it is not paused again.
    await app.call({ action: 'resume', id: 'g1' });
    await app.call();
    await app.settle();
    assert.equal(app.edits.filter((edit) => edit.patch?.active === false).length, 1);
    // Runs in changed to a tab that is on: the note goes.
    await app.call({ action: 'pause', id: 'g1' });
    await app.call({ action: 'runTab', id: 'g1', tab: 'chat' });
    assert.equal((await app.call()).tasks[0].pausedNote, '');
  } finally {
    app.done();
  }
});

test('a Recon automation: no name in results, never in the shared trash, and Put back never re-routes it out of Recon', async () => {
  const reconTask = { id: 'rc1', kind: 'daily', title: 'Onion watch', prompt: 'secret plan', time: '08:00:00.000', timeZone: 'UTC', scheduledAt: new Date(Date.now() + 3600000).toISOString(), status: 'active', target: { kind: 'session', sessionId: 'recon-1' }, involvedSessionIds: ['recon-1'], updatedAt: 'u0' };
  const app = item6({ catalog: [reconTask, { ...daily, status: 'active', target: { kind: 'session', sessionId: 'chat-1' } }] });
  try {
    const view = await app.call();
    assert.equal(view.tasks.find((task) => task.id === 'rc1').sealed, true);
    assert.equal(view.tasks.find((task) => task.id === 'd1').sealed, false);
    const message = (id) => ({ id, source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nx\nschedule_id_json: "rc1"\noccurrence_at: ${new Date().toISOString()}\nreminder_prompt_json: "p"` }] });
    app.event({ id: 'recon-1', header: { id: 'recon-1' } }, { type: 'user/message', data: message('m-r') });
    app.event({ id: 'recon-1', header: { id: 'recon-1' } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
    const out = await app.tool().execute({});
    assert.doesNotMatch(out.text, /Onion watch/);
    assert.match(out.text, /A Recon automation/);
    assert.match((await app.tool().execute({ automation: 'onion' })).text, /No run matches/, 'not found by its name either');
    app.remove('rc1');
    await app.settle();
    assert.equal(app.trashAdds.length, 0, 'never in the shared trash');
    // An older trash row of a Recon automation: Put back never falls back to a new chat.
    const answer = await app.owner().putBack({ data: [{ item: 'p-r', ownerData: { recipe: { ...reconTask, target: { kind: 'session', sessionId: 'gone' } }, tab: 'recon' } }] });
    assert.equal(answer.failed[0].reason, 'Not put back: it wrote into a Recon thread that is gone.');
    assert.equal(app.created.length, 0);
  } finally {
    app.done();
  }
});

// ---- item 6 fixes (lab and review findings of 21 November 2026) ----------------------------------------------------

const every = (id, extra = {}) => ({ id, kind: 'every', everySeconds: 3600, title: id, prompt: 'p', status: 'active', scheduledAt: new Date(Date.now() + 3600000).toISOString(), target: { kind: 'new', create: {} }, involvedSessionIds: [], updatedAt: 'u0', ...extra });

test('the guard frees itself when an edit does not answer, and pauses at the next look', async () => {
  const app = item6({ catalog: [every('s1')] });
  try {
    await app.call({ action: 'runTab', id: 's1', tab: 'devices' });
    app.tabs.splice(app.tabs.findIndex((tab) => tab.id === 'devices'), 1);
    const edit = app.schedule.edit;
    app.schedule.edit = () => new Promise(() => {});
    await app.call();
    await new Promise((resolve) => setTimeout(resolve, 80));
    const stuck = await app.call();
    assert.match(stuck.guard.problem, /no answer/);
    assert.equal(stuck.tasks[0].status, 'active');
    app.schedule.edit = edit;
    // The look still waiting on the stuck edit gives up first.
    await new Promise((resolve) => setTimeout(resolve, 80));
    await app.call();
    await app.settle();
    const view = await app.call();
    assert.equal(view.tasks[0].status, 'paused', 'the guard was not left stuck');
    assert.match(view.tasks[0].pausedNote, /its mode Devices is switched off/);
  } finally {
    app.done();
  }
});

test('the guard waits for a second look before pausing (add-on tabs can register late)', async () => {
  process.env.DSH_AUTOMATIONS_TAB_GONE_MS = '60000';
  const app = item6({ catalog: [every('s2')] });
  process.env.DSH_AUTOMATIONS_TAB_GONE_MS = '0';
  try {
    await app.call({ action: 'runTab', id: 's2', tab: 'devices' });
    app.tabs.splice(app.tabs.findIndex((tab) => tab.id === 'devices'), 1);
    await app.call();
    await app.settle();
    assert.equal(app.edits.filter((one) => one.patch?.active === false).length, 0, 'not on the first look');
  } finally {
    app.done();
  }
});

test('when the tab is back, a paused automation says why until the owner switches it on', async () => {
  const app = item6({ catalog: [every('s3')] });
  try {
    await app.call({ action: 'runTab', id: 's3', tab: 'devices' });
    const devices = app.tabs.splice(app.tabs.findIndex((tab) => tab.id === 'devices'), 1)[0];
    await app.call();
    await app.settle();
    assert.equal((await app.call()).tasks[0].status, 'paused');
    app.tabs.push(devices);
    await app.call();
    await app.settle();
    const back = await app.call();
    assert.equal(back.tasks[0].status, 'paused', 'never switched on for the owner');
    assert.equal(back.tasks[0].pausedNote, 'Paused while its mode Devices was off. Devices is on again: switch this automation on when you want.');
    await app.call({ action: 'resume', id: 's3' });
    await app.settle();
    assert.equal((await app.call()).tasks[0].pausedNote, '');
  } finally {
    app.done();
  }
});

test('with "New chats open in the automation\'s tab" off, the guard does not watch the run tab, and Runs in says the truth', async () => {
  const app = item6({ catalog: [every('s4')] });
  try {
    await app.call({ action: 'runTab', id: 's4', tab: 'research' });
    app.config.runsInTheirTab = false;
    app.tabs.splice(app.tabs.findIndex((tab) => tab.id === 'research'), 1);
    await app.call();
    await app.settle();
    const view = await app.call();
    assert.equal(view.tasks[0].status, 'active', 'its runs open in the scheduled tab, which is on');
    assert.equal(view.tasks[0].runsIn, 'cowork');
    assert.equal(view.tasks[0].runsInFixed, 'off');
    assert.equal(view.tasks[0].tab, 'cowork');
    assert.match((await app.call({ action: 'runTab', id: 's4', tab: 'chat' })).error, /is off/);
  } finally {
    app.done();
  }
});

test('Runs in: a Finance brief and a reused chat that exists cannot be moved', async () => {
  const brief = every('f1', { title: 'Finance brief: Markets' });
  const reused = every('n1', { target: { kind: 'new_once', sessionId: 'used-1', create: {} }, lastDelivery: { deliveredAt: '2026-11-20T08:00:00Z' } });
  const app = item6({ catalog: [brief, reused] });
  try {
    const view = await app.call();
    const f1 = view.tasks.find((task) => task.id === 'f1');
    assert.equal(f1.runsIn, 'finance');
    assert.equal(f1.runsInFixed, 'finance');
    assert.equal(view.tasks.find((task) => task.id === 'n1').runsInFixed, 'reused');
    assert.match((await app.call({ action: 'runTab', id: 'n1', tab: 'chat' })).error, /already made/);
  } finally {
    app.done();
  }
});

test('a locked tab always uses its lock: Runs in, the guard\'s look, and the preset change', async () => {
  const app = item6({ catalog: [every('l1', { target: { kind: 'new', create: { agentPreset: 'ptc' } } }), every('l2', { target: { kind: 'new', create: { agentPreset: 'ptc' } } })] });
  try {
    await app.call({ action: 'runTab', id: 'l1', tab: 'devices' });
    assert.equal(app.list().find((task) => task.id === 'l1').target.create.agentPreset, 'standard', 'moved into Devices: its lock');
    assert.match((await app.call({ action: 'preset', id: 'l1', preset: 'ptc' })).error, /always uses Standard/);
    // The lock set after the run tab was saved: the guard's next look follows it.
    await app.call({ action: 'runTab', id: 'l2', tab: 'chat' });
    app.modes.lockedPreset = (tab) => (tab === 'devices' || tab === 'chat' ? 'standard' : '');
    await app.call();
    await app.settle();
    assert.equal(app.list().find((task) => task.id === 'l2').target.create.agentPreset, 'standard');
  } finally {
    app.done();
  }
});

test('the claim waits for the Automations switch; a reused chat is claimed before its message', async () => {
  const once = every('o1', { target: { kind: 'new_once', sessionId: 'fresh-1', create: {} } });
  const app = item6({ catalog: [once, every('o2')] });
  try {
    await app.call({ action: 'runTab', id: 'o1', tab: 'research' });
    await app.call({ action: 'runTab', id: 'o2', tab: 'research' });
    const agent = { id: 'fresh-1' };
    assert.equal(await app.hook('schedule/resolve-agent')('fresh-1', async () => agent), agent);
    assert.deepEqual(app.sets, [['fresh-1', 'research', { claim: true, settle: true }]], 'before its message, waiting for the tab\'s model');
    app.config.enabled = false;
    app.event({ id: 'fresh-1', header: { id: 'fresh-1' } }, spliced('o2'));
    await app.hook('schedule/resolve-agent')('fresh-1', async () => agent);
    assert.equal(app.sets.length, 1, 'the add-on switched off: no claim');
  } finally {
    app.done();
  }
});

test('the clock button asks whether a chat is Recon\'s; tabs without a sidebar tab are not offered; Scratch reads as Scratch', async () => {
  const app = item6();
  try {
    assert.equal((await app.call({ action: 'isolated', sessionId: 'recon-1' })).isolated, true);
    assert.equal((await app.call({ action: 'isolated', sessionId: 'chat-1' })).isolated, false);
    app.tabs.push({ id: 'review', label: 'Review', tab: false });
    const context = await app.call({ action: 'context' });
    assert.ok(!context.tabs.some((tab) => tab.id === 'review'));
    assert.ok(!(await app.call()).runTabs.some((tab) => tab.id === 'review'));
    app.chats['scr-1'] = { tab: 'chat', cwd: join(app.home, 'scratch', 'session-x'), preset: 'standard', lastTurn: 1 };
    assert.equal((await app.call({ action: 'context', sessionId: 'scr-1' })).folder, 'Scratch');
  } finally {
    app.done();
  }
});

test('the Schedule form\'s words are English only, and the clock button hides as set', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const block = source.slice(source.indexOf('const FORM_UI = {'), source.indexOf('const formWords ='));
  const keysOf = (part) => [...part.matchAll(/^ {8}([A-Za-z]+):/gm)].map((match) => match[1]).sort();
  const en = block.slice(block.indexOf('en: {'));
  assert.ok(keysOf(en).length > 30);
  assert.equal(block.indexOf('zh: {'), -1, 'no Chinese table (decision 28)');
  assert.match(source, /const formWords = \(\) => FORM_UI\.en;/);
  assert.match(source, /settings\.scheduleButton === false\) return null;/);
  // Item 4A, stage 6a: also hidden in Devices and Workshop (guarded), whatever "Scheduling from Recon" says.
  assert.match(source, /if \(\(reconOff && sealedHere\?\.isolated !== false && !open\) \|\| \(sealedHere\?\.guarded === true && !open\) \|\| \(narrow && !open\)\) return place0;/);
  const { WHEN_WORDS } = await import('../lib/when.js');
  if (WHEN_WORDS) assert.deepEqual(Object.keys(WHEN_WORDS), ['en']);
});

test('"In one new chat, reused" after its first run (the app makes it a session target) is still watched by the guard', async () => {
  const ran = every('w1', { target: { kind: 'session', sessionId: 'used-1' } });
  const app = item6({ catalog: [ran] });
  try {
    await app.call();
    // Made with New, its run tab Research; then its first run turns it into a session target.
    await app.call({ action: 'create', tab: 'research', cwd: '/scratch/x', title: 'R', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new_once' });
    const made = app.list().find((task) => task.title === 'R');
    made.target = { kind: 'session', sessionId: 'used-1' };
    app.tabs.splice(app.tabs.findIndex((tab) => tab.id === 'research'), 1);
    await app.call();
    await app.settle();
    const view = await app.call();
    assert.equal(view.tasks.find((task) => task.title === 'R').status, 'paused');
    assert.equal(view.tasks.find((task) => task.id === 'w1').status, 'active', 'one the assistant made is not watched');
  } finally {
    app.done();
  }
});

// ---- item 4A, stage 6a: the space keeps its rules for any mode (STAGE6A-DESIGN.md, P4 Automations) ---------------

/** A Modes stand-in with the stage 6a `guardOf`: `rr-1` is Research in Recon, `dev-1` Code in Devices, `ws-1` Research in Workshop. */
const spaced = (app) => {
  app.chats['rr-1'] = { tab: 'research', cwd: '/tmp/dsh-recon-x', preset: 'standard', lastTurn: 2 };
  app.chats['ws-1'] = { tab: 'research', cwd: '/w/ws', preset: 'cordis', lastTurn: 2 };
  const spaces = { 'rr-1': 'recon', 'recon-1': 'recon', 'dev-1': 'devices', 'ws-1': 'workshop' };
  app.modes.isolated = (id) => spaces[id] === 'recon';
  app.modes.guardOf = (id) => {
    const space = spaces[id] ?? 'chat';
    return { top: id, space, mode: app.chats[id]?.tab ?? 'cowork', sealed: space === 'recon', sealedBy: space === 'recon' ? 'recon' : '', reconSpace: space === 'recon', guardedBy: space === 'devices' || space === 'workshop' ? space : '', noPrograms: space !== 'chat', homeMode: false, fresh: false, unknownTop: false };
  };
  return app;
};

test('created-in-recon-guest-sealed: an automation made in Research-in-Recon records Recon, is sealed, and keeps no name in the trash', async () => {
  const app = spaced(item6());
  try {
    const made = await app.call({ action: 'create', sessionId: 'rr-1', title: 'Forum watch', prompt: 'look again', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(made.error, undefined, made.error);
    const task = made.tasks.find((item) => item.id === 'new-1');
    assert.equal(task.createdIn, 'recon', 'the space, not the mode (research)');
    assert.equal(task.sealed, true);
    app.remove('new-1');
    await app.settle();
    assert.equal(app.trashAdds.length, 0, 'never in the shared trash');
  } finally {
    app.done();
  }
  // Made by the assistant's schedule tools (no form): the space is recorded from the thread that asked.
  const byTool = { id: 'rt1', kind: 'daily', title: 'Tool watch', prompt: 'p', time: '08:00:00.000', timeZone: 'UTC', scheduledAt: new Date(Date.now() + 3600000).toISOString(), status: 'active', target: { kind: 'session', sessionId: 'rr-1' }, involvedSessionIds: ['rr-1'], updatedAt: 'u0' };
  const tool = spaced(item6({ catalog: [byTool] }));
  try {
    const task = (await tool.call()).tasks.find((item) => item.id === 'rt1');
    assert.equal(task.createdIn, 'recon');
    assert.equal(task.sealed, true);
  } finally {
    tool.done();
  }
});

// Stage 6b (7.6): updated on purpose: a guest keeps its clock while its space's guard is ready; it is hidden (and the
// server refuses) only when the guard is not ready or cannot be read. This stand-in Modes has no `spaces.ready`.
test('clock-hidden-guarded: Code in Devices and Research in Workshop show no clock while their guard is not ready; Chat as before', async () => {
  const app = spaced(item6());
  try {
    assert.deepEqual(await app.call({ action: 'isolated', sessionId: 'dev-1' }), { isolated: false, guarded: true, guest: 'devices', blank: false });
    assert.equal((await app.call({ action: 'isolated', sessionId: 'ws-1' })).guarded, true);
    assert.equal((await app.call({ action: 'isolated', sessionId: 'chat-1' })).guarded, false);
    assert.equal((await app.call({ action: 'isolated', sessionId: 'rr-1' })).isolated, true, 'any mode in Recon is sealed');
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'dev-1', title: 'D', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /Automations cannot be made from this thread now: the rules of Devices cannot be read/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'ws-1', title: 'W', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new_once' })), /the rules of Workshop cannot be read/);
    assert.equal(app.created.length, 0);
    // The guard ready: the clock shows for the guest (J10).
    app.modes.spaces = { ready: () => ({ devices: true, workshop: true, recon: true }) };
    assert.deepEqual(await app.call({ action: 'isolated', sessionId: 'dev-1' }), { isolated: false, guarded: false, guest: 'devices', blank: false });
    delete app.modes.spaces;
    const chat = await app.call({ action: 'create', sessionId: 'chat-1', title: 'C', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(chat.error, undefined, chat.error);
    assert.equal(chat.tasks.find((item) => item.id === 'new-1').createdIn, 'chat', 'Chat: the mode, as before');
  } finally {
    app.done();
  }
});

test('creator-plus-home-clock: Creator Plus at home in Workshop keeps the clock and makes automations as before 6a; guests and unknowns still refuse', async () => {
  const app = item6();
  app.tabs.push({ id: 'creator-plus', label: 'Creator Plus' }, { id: 'bench', label: 'Bench' });
  const threads = {
    'cp-1': ['creator-plus', 'workshop'], 'cp-dev': ['creator-plus', 'devices'], 'bench-1': ['bench', 'devices'],
    'cp-lie': ['creator-plus', 'workshop', false], 'ws-guest': ['research', 'workshop'],
  };
  for (const id of Object.keys(threads)) app.chats[id] = { tab: threads[id][0], cwd: '/w/ws', preset: 'standard', lastTurn: 2 };
  app.modes.guardOf = (id) => {
    if (id === 'cp-err') throw new Error('Modes could not read the space');
    const [mode, space, home] = threads[id] ?? [app.chats[id]?.tab ?? 'cowork', 'chat'];
    const guarded = space === 'devices' || space === 'workshop';
    return { top: id, space, mode, sealed: false, sealedBy: '', reconSpace: false, guardedBy: guarded ? space : '', noPrograms: guarded, homeMode: home ?? ['recon', 'bench', 'creator-plus'].includes(mode), fresh: false, unknownTop: false };
  };
  app.chats['cp-err'] = { tab: 'creator-plus', cwd: '/w/ws', preset: 'standard', lastTurn: 2 };
  try {
    assert.deepEqual(await app.call({ action: 'isolated', sessionId: 'cp-1' }), { isolated: false, guarded: false, blank: false }, 'the clock shows');
    const made = await app.call({ action: 'create', sessionId: 'cp-1', title: 'Nightly build', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(made.error, undefined, made.error);
    assert.equal(made.tasks.find((item) => item.id === 'new-1').createdIn, 'creator-plus', 'its mode, as before 6a (not the space)');
    assert.equal(app.created.length, 1);
    // Guests in Workshop, every mode in Devices (Devices mode included: no change), a guard that is not plain, or one
    // that could not be read: no clock, and the server refuses.
    for (const id of ['ws-guest', 'cp-dev', 'bench-1', 'cp-lie', 'cp-err']) {
      assert.equal((await app.call({ action: 'isolated', sessionId: id })).guarded, true, id);
      assert.notEqual(await failOf(app.call({ action: 'create', sessionId: id, title: 'X', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), '', id);
    }
    // Stage 6b: the sentences changed (guardNotReady replaces 6a's guardedSpace; the Devices mode at home, G4).
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'cp-lie', title: 'X', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /the rules of Workshop cannot be read/);
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'bench-1', title: 'X', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /not made from the Devices mode/);
    assert.equal(app.created.length, 1, 'nothing more was made');
  } finally {
    app.done();
  }
  // Made by the assistant's schedule tools from a Creator Plus thread in Workshop: its mode is recorded, as before 6a.
  const byTool = { id: 'ct1', kind: 'daily', title: 'Tool build', prompt: 'p', time: '08:00:00.000', timeZone: 'UTC', scheduledAt: new Date(Date.now() + 3600000).toISOString(), status: 'active', target: { kind: 'session', sessionId: 'cp-1' }, involvedSessionIds: ['cp-1'], updatedAt: 'u0' };
  const tool = item6({ catalog: [byTool] });
  tool.chats['cp-1'] = { tab: 'creator-plus', cwd: '/w/ws', preset: 'standard', lastTurn: 2 };
  tool.modes.guardOf = (id) => ({ top: id, space: id === 'cp-1' ? 'workshop' : 'chat', mode: tool.chats[id]?.tab ?? 'cowork', sealed: false, sealedBy: '', reconSpace: false, guardedBy: id === 'cp-1' ? 'workshop' : '', noPrograms: id === 'cp-1', homeMode: id === 'cp-1', fresh: false, unknownTop: false });
  try {
    assert.equal((await tool.call()).tasks.find((item) => item.id === 'ct1').createdIn, 'creator-plus');
  } finally {
    tool.done();
  }
});

test('the clock fails closed on an answer without a plain guarded: false', async () => {
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(source, /guarded: answer\?\.guarded !== false \}/);
});

test('the stage 6b sentence that replaced 6a\'s is English, also for a page that reports Chinese', async () => {
  const { createWords } = await import('../lib/create.js');
  assert.match(createWords('en').guardNotReady('Devices', 'Devices is switched off', 'Switch on Devices in Settings → Devices'), /Switch on Devices in Settings → Devices, then try again\./);
  assert.equal(createWords('zh').guardNotReady('Devices', 'a', 'b'), createWords('en').guardNotReady('Devices', 'a', 'b'));
});

test('the clock keeps only a sealed answer for good; a guarded answer is asked again after a mode change', async () => {
  const { readFileSync } = await import('node:fs');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  // Stage 7 (lab): a sealed answer that is guarded too (a guest held while its space is off) is passing, never kept.
  assert.match(client, /if \(answer\?\.blank !== true && sealed\.isolated && !sealed\.guarded\) \{\n\s+sealedChats\.set\(sessionId, sealed\);/);
});

// ---- Stage 7 (point 29): a one-time automation that never ran stays listed as "Did not start" until deleted ----------

test('point 29: which ended automations count as "Did not start" (lib)', async () => {
  const { didNotStart, isOnce } = await import('../lib/notes.js');
  const now = Date.now();
  const at = new Date(now - 60 * MIN).toISOString();
  const once = { id: 'o1', kind: 'at', status: 'ended', scheduledAt: at, lastDelivery: { deliveredAt: at } };
  assert.equal(isOnce(once), true);
  assert.equal(isOnce({ kind: 'after' }), true);
  assert.equal(isOnce({ kind: 'rrule', rrule: 'DTSTART:20261101T090000Z\nRRULE:FREQ=DAILY;COUNT=1' }), true);
  assert.equal(isOnce({ kind: 'rrule', rrule: 'RRULE:FREQ=DAILY;COUNT=10' }), false);
  assert.equal(isOnce({ kind: 'daily' }), false);
  assert.deepEqual(didNotStart(once, { now }), { reason: 'unknown', at: Date.parse(at) });
  assert.equal(didNotStart({ ...once, status: 'active' }, { now }), null, 'only ended ones');
  assert.equal(didNotStart({ ...once, kind: 'daily' }, { now }), null, 'other ended automations keep today\'s behaviour');
  assert.equal(didNotStart(once, { now, hasRun: true }), null, 'a recorded run is listed instead');
  assert.equal(didNotStart(once, { now, note: { ran: true } }), null, 'a run that left the list still counts');
  assert.deepEqual(didNotStart(once, { now, closedAt: (time) => time === Date.parse(at) }), { reason: 'automationsOff', at: Date.parse(at) });
  assert.equal(didNotStart(once, { now, note: { pauseReason: 'held' } }).reason, 'held');
  // Review: a held run (its space refused it, nothing ran) is not a run: the automation stays "Did not start", held.
  assert.deepEqual(didNotStart(once, { now, held: true }), { reason: 'held', at: Date.parse(at) });
  const index = (await import('node:fs')).readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(index, /\(run\.held === true \? withHeld : withRun\)\.add/, 'a held run does not count as a run');
  assert.match(index, /if \(run\.held !== true && run\.state !== 'running' && run\.state !== 'waiting'\) finished\.add/, 'only an ended, not held run marks it');
  assert.match(index, /for \(const run of dropped\) if \(run\.held !== true\)/, 'a held run leaving the list does not mark it');
  // Before runs marked their automation: an old one may have had a run that left the list, so it stays hidden as today.
  const old = { ...once, scheduledAt: new Date(now - 40 * 24 * 60 * MIN).toISOString(), lastDelivery: { deliveredAt: new Date(now - 40 * 24 * 60 * MIN).toISOString() } };
  assert.equal(didNotStart(old, { now, ranSince: now, keepDays: 31 }), null);
  // Due after marks began: it stays listed, however old, until deleted.
  assert.ok(didNotStart(old, { now, ranSince: now - 50 * 24 * 60 * MIN, keepDays: 31 }));
});

test('point 29: the page lists a one-time automation that did not start, with its reason, and Delete removes it for good', async () => {
  const now = Date.now();
  const due = new Date(now - 10 * MIN).toISOString();
  const missedOnce = { id: 'o1', kind: 'at', title: 'Remind me', prompt: 'x', scheduledAt: due, status: 'ended', lastDelivery: { deliveredAt: due }, target: { kind: 'new_once', sessionId: 'o1-thread', create: {} }, involvedSessionIds: [], updatedAt: 'u0' };
  const endedDaily = { id: 'd9', kind: 'daily', title: 'Old daily', prompt: 'x', time: '08:30:00.000', timeZone: 'UTC', status: 'ended', target: { kind: 'new', create: {} }, involvedSessionIds: [], updatedAt: 'u0' };
  // Automations was not running from 30 minutes ago until now (its beat stopped): the add-on was off when it was due.
  // Modes held its thread (stage 7 lab, bug C: only then did nothing run; a thread that was not held ran).
  const modes = { get: () => 'isolated-locked', isolated: () => false };
  const app = standIn({ catalog: [missedOnce, endedDaily], gap: { from: now - 30 * MIN }, extra: { modes } });
  try {
    let view = await app.call();
    const task = view.tasks.find((one) => one.id === 'o1');
    assert.equal(task.status, 'ended');
    assert.deepEqual(task.didNotStart, { reason: 'The Automations add-on was off then, so no run was recorded.', at: Date.parse(due) });
    assert.equal(view.tasks.find((one) => one.id === 'd9').didNotStart, undefined, 'an ended repeating automation is not marked');
    view = await app.call({ action: 'delete', id: 'o1', expectedUpdatedAt: 'u0' });
    assert.equal(view.error, undefined);
    assert.ok(!view.tasks.some((one) => one.id === 'o1'), 'Delete works for it');
    await app.settle();
    assert.equal(app.trashAdds.length, 0, 'an ended automation is deleted for good, never kept in the trash');
  } finally {
    app.done();
  }
});

test('point 29: a one-time automation with a recorded run is not "Did not start", also after the run left the list', async () => {
  const now = Date.now();
  const due = new Date(now - 5 * MIN).toISOString();
  const ran = { id: 'o2', kind: 'at', title: 'Ran', prompt: 'x', scheduledAt: due, status: 'ended', lastDelivery: { deliveredAt: due }, target: { kind: 'new_once', sessionId: 's9', create: {} }, involvedSessionIds: [], updatedAt: 'u0' };
  const app = standIn({ catalog: [ran] });
  try {
    await app.call();
    const message = { id: 'm9', source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nx\nschedule_id_json: "o2"\noccurrence_at: ${due}\nreminder_prompt_json: "p"` }] };
    app.event({ id: 's9', header: { id: 's9' } }, { type: 'user/message', data: message });
    app.event({ id: 's9', header: { id: 's9' } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } });
    const view = await app.call();
    assert.equal(view.tasks.find((one) => one.id === 'o2').didNotStart, undefined);
    const { readFileSync } = await import('node:fs');
    const stored = JSON.parse(readFileSync(join(app.home, 'automations', 'tasks.json'), 'utf8'));
    assert.equal(stored.tasks.o2.ran, true, 'the mark outlives the run in the list');
    assert.ok(Number.isFinite(stored.ranSince));
  } finally {
    app.done();
  }
});

// ---- Stage 7 lab (bug C): a one-time automation the app ran alone (Automations off) is not "Did not start" ----------

test('bug C: a delivered one-time automation whose thread was not held ran: not "Did not start" (lib)', async () => {
  const { didNotStart, ranUnrecorded } = await import('../lib/notes.js');
  const now = Date.now();
  const at = new Date(now - 60 * MIN).toISOString();
  const once = { id: 'o1', kind: 'at', status: 'ended', scheduledAt: at, lastDelivery: { deliveredAt: at, targetSessionId: 's1' }, target: { kind: 'session', sessionId: 's1' } };
  const off = { now, closedAt: (time) => time === Date.parse(at) };
  assert.equal(didNotStart(once, off), null, 'it ran, so it did start');
  assert.deepEqual(ranUnrecorded(once, off), { at: Date.parse(at), sessionId: 's1', off: true });
  assert.deepEqual(ranUnrecorded(once, { now }), { at: Date.parse(at), sessionId: 's1', off: false });
  // The thread of the receipt counts, also with only the reserved target id.
  assert.equal(ranUnrecorded({ ...once, lastDelivery: { deliveredAt: at }, target: { kind: 'new_once', sessionId: 'r1' } }, off).sessionId, 'r1');
  // Nothing ran: no delivery, a held run, a pause of the add-on's, or a thread Modes held: still "Did not start".
  assert.equal(ranUnrecorded({ ...once, lastDelivery: undefined }, off), null);
  assert.ok(didNotStart({ ...once, lastDelivery: undefined }, off));
  assert.equal(ranUnrecorded(once, { ...off, held: true }), null);
  assert.equal(didNotStart(once, { ...off, held: true }).reason, 'automationsOff');
  assert.equal(ranUnrecorded(once, { ...off, note: { pauseReason: 'devicesOff' } }), null);
  assert.equal(ranUnrecorded(once, { ...off, threadHeld: (id) => id === 's1' }), null);
  assert.equal(didNotStart(once, { ...off, threadHeld: (id) => id === 's1' }).reason, 'automationsOff');
  assert.equal(ranUnrecorded(once, { ...off, threadHeld: () => { throw new Error('x'); } }), null, 'unknown counts as held (never claims a run)');
  // A recorded run (or one that left the list) is listed as before; only one-time and ended ones.
  assert.equal(ranUnrecorded(once, { ...off, hasRun: true }), null);
  assert.equal(ranUnrecorded(once, { ...off, note: { ran: true } }), null);
  assert.equal(ranUnrecorded({ ...once, status: 'active' }, off), null);
  assert.equal(ranUnrecorded({ ...once, kind: 'daily' }, off), null);
  // It leaves the list after its keep time, as a run would; it never turns into "Did not start" then.
  const old = { ...once, lastDelivery: { deliveredAt: new Date(now - 40 * 24 * 60 * MIN).toISOString(), targetSessionId: 's1' } };
  assert.equal(ranUnrecorded(old, { now, keepDays: 31 }), null);
  assert.equal(didNotStart(old, { now, keepDays: 31, ranSince: 0 }), null);
  assert.ok(ranUnrecorded(old, { now, keepDays: 0 }), 'keep with no limit');
});

test('bug C: the lab case: due while Automations was off, the app ran it in Cowork: the page says so and opens its thread', async () => {
  const now = Date.now();
  const due = new Date(now - 10 * MIN).toISOString();
  const once = { id: 'o3', kind: 'at', title: 'Remind me', prompt: 'x', scheduledAt: due, status: 'ended', lastDelivery: { scheduledAt: due, deliveredAt: due, messageId: 'm1', targetSessionId: 'o3-thread' }, target: { kind: 'session', sessionId: 'o3-thread' }, involvedSessionIds: ['o3-thread'], updatedAt: 'u0' };
  const modes = { get: (id) => (id === 'o3-thread' ? 'cowork' : ''), isolated: () => false, modeName: (id) => ({ cowork: 'Cowork', research: 'Research' })[id] ?? '' };
  const app = standIn({ catalog: [once], gap: { from: now - 30 * MIN }, extra: { modes }, notesFile: { tasks: { o3: { runTab: 'research', made: 'button', createdIn: 'research' } }, ranSince: now - 60 * MIN } });
  try {
    const view = await app.call();
    const task = view.tasks.find((one) => one.id === 'o3');
    assert.equal(task.didNotStart, undefined, 'never "Did not start" when it ran');
    assert.deepEqual(task.ranUnrecorded, {
      at: Date.parse(due),
      sessionId: 'o3-thread',
      line: 'It ran while the Automations add-on was off, so the app ran it in Cowork instead of Research. Open its thread to see the result.',
    });
  } finally {
    app.done();
  }
  // Stage 7 lab re-check: the lab's case exactly: a new_once target with a stored place (runSpace), delivered into its
  // thread. Its place is the thread's (Cowork, stored), yet the chosen mode is still Research.
  const newOnce = { ...once, target: { kind: 'new_once', sessionId: 'o3-thread', create: { cwd: '/tmp' } } };
  const spaces = { list: () => [], modesIn: () => [], ofMode: () => 'chat', of: (id) => (id === 'o3-thread' ? 'chat' : '') };
  const stored = standIn({ catalog: [newOnce], gap: { from: now - 30 * MIN }, extra: { modes: { ...modes, spaces } }, notesFile: { tasks: { o3: { runTab: 'research', runSpace: 'chat', createdIn: 'research' } }, ranSince: now - 60 * MIN } });
  try {
    const task = (await stored.call()).tasks.find((one) => one.id === 'o3');
    assert.equal(task.stored, true, 'the place is stored, as in the lab');
    assert.deepEqual(task.runsInPlace, { space: 'chat', mode: 'cowork' }, 'the thread\'s own place');
    assert.equal(task.didNotStart, undefined);
    assert.equal(task.ranUnrecorded.line, 'It ran while the Automations add-on was off, so the app ran it in Cowork instead of Research. Open its thread to see the result.');
  } finally {
    stored.done();
  }
  // Same mode, or the add-on was on (no record for another reason): a plain line, still no "Did not start".
  const same = standIn({ catalog: [once], gap: { from: now - 30 * MIN }, extra: { modes } });
  try {
    const task = (await same.call()).tasks.find((one) => one.id === 'o3');
    assert.equal(task.ranUnrecorded.line, 'It ran while the Automations add-on was off, so no run of it was recorded here. Open its thread to see the result.');
  } finally {
    same.done();
  }
  const on = standIn({ catalog: [once], extra: { modes } });
  try {
    const task = (await on.call()).tasks.find((one) => one.id === 'o3');
    assert.equal(task.didNotStart, undefined);
    assert.equal(task.ranUnrecorded.line, 'It ran, but no run of it was recorded here. Open its thread to see the result.');
  } finally {
    on.done();
  }
});

test('bug C: the page lists it as ended (no "Did not start" badge), with its line and Open its thread', async () => {
  const { readFileSync } = await import('node:fs');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /const ranAlone = !last && !notStarted && task\.ranUnrecorded \? task\.ranUnrecorded : null;/);
  assert.match(client, /else if \(ranAlone\) lines\.push\(`Ended\. \$\{ranAlone\.line\}`\);/);
  assert.match(client, /ranAlone \? `ran \$\{when\(ranAlone\.at\)\}`/);
  assert.match(client, /task\.ranUnrecorded && own\.length === 0 \? h\('div', \{ className: 'dsh-au-rowdesc' \}, task\.ranUnrecorded\.line\)/);
  assert.match(client, /task\.sessionId \|\| task\.ranUnrecorded\?\.sessionId \? h\('div', null, h\('button', \{ type: 'button', className: 'dsh-au-link', onClick: \(\) => openConversation\(appCtx, task\.sessionId \|\| task\.ranUnrecorded\.sessionId\) \}, 'Open its thread'\)\)/);
  // The badge stays for a real "Did not start" only.
  assert.match(client, /last \? h\(Badge, \{ state: lastState \}\) : notStarted \? h\(Badge, \{ state: 'held' \}\) : null/);
});

test('point 29: the page shows "Did not start" with what to do next, and its Delete says "for good"', async () => {
  const { readFileSync } = await import('node:fs');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /filter\(\(task\) => task\.status !== 'ended' \|\| lastOf\(task\.id\) \|\| task\.didNotStart \|\| task\.ranUnrecorded\)/);
  assert.match(client, /Did not start\$\{due\}\.\$\{why\} It stays here until you delete it \(Details → Delete…\)\. To try again, make a new one with New\./);
  assert.match(client, /notStarted \? h\(Badge, \{ state: 'held' \}\)/);
  assert.match(client, /const toTrash = data\.settings\?\.deletedToTrash !== false && data\.trash && task\.status !== 'ended';/);
  assert.doesNotMatch(client, /\bconfirm\(|\balert\(/);
});
