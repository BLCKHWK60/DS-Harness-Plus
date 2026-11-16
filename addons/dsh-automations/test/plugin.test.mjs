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

function standIn({ noTrash = false, catalog = [], gap, modesValue = { extraModes: '{}', scheduledMode: 'cowork' }, isolated = () => false, events = {} } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'automations-'));
  if (gap) {
    mkdirSync(join(home, 'automations'), { recursive: true });
    writeFileSync(join(home, 'automations', 'alive.json'), JSON.stringify({ beat: gap.from, gaps: [] }));
  }
  const config = { enabled: true, deletedToTrash: true, oldRunsToTrash: true, tab: true, mac: false, phone: false };
  let list = catalog.map((entry) => ({ ...entry }));
  const created = [];
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
    create: async (request) => {
      if (request.target?.kind === 'session' && request.target.sessionId === 'gone') throw new Error('session not found');
      const entry = { id: `new-${created.length + 1}`, kind: request.timing.kind, title: request.title, prompt: request.prompt, status: 'active', target: request.target, involvedSessionIds: [], updatedAt: 'u1' };
      created.push(request);
      list.push(entry);
      return entry;
    },
    edit: async (request) => {
      edits.push(request);
      const entry = list.find((item) => item.id === request.id);
      if (!entry) return { id: request.id, code: 'schedule_not_found' };
      if (request.expectedUpdatedAt !== undefined && request.expectedUpdatedAt !== entry.updatedAt) return { id: request.id, code: 'schedule_conflict' };
      if (request.action === 'delete') list = list.filter((item) => item.id !== request.id);
      else if (request.patch.active !== undefined) entry.status = request.patch.active ? 'active' : 'paused';
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
    home, call, settle, created, edits, trashAdds, mutations, modesValue, config,
    owner: () => owner, tool: () => tool, event: (session, event) => handlers['session/event'](session, event),
    remove: (id) => { list = list.filter((item) => item.id !== id); changed(); },
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
    assert.match(answer.notes[0], /conversation of its own/);
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
