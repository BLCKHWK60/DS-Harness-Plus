/**
 * Item 4A, stage 6b, Part B (STAGE6B-DESIGN.md J5-J17, Revision 2): "Runs in: space · mode". Existing automations keep
 * where they run and their presets (nothing is rewritten, nothing pauses); new or changed ones store their place, run
 * there, and follow the space's lock; guarded places (Devices, Workshop) are never left: a run they cannot take is held
 * and the automation paused; guests in Devices and Workshop schedule within their space unless the owner picks another
 * space and a folder. Nothing here touches the real app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apply, DATA_PATH } from '../index.js';
import { recipeOf } from '../lib/notes.js';

process.env.DSH_AUTOMATIONS_TAB_GONE_MS = '0';
process.env.DSH_AUTOMATIONS_GUARD_WAIT_MS = '40';
process.env.DSH_AUTOMATIONS_CACHE_MS = '0';

const FIXTURE = new URL('./fixtures/pre6b/', import.meta.url);

test('clock-refusal-above-buttons: the refusal is scrolled clear of the pop-up\'s sticky button row', () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  // The pop-up's Cancel/Schedule row is sticky at its bottom; a plain `nearest` scroll counts a refusal under it as seen.
  assert.match(source, /\.dsh-au-popover \.dsh-au-form-btns \{ position: sticky;/);
  const at = source.indexOf("'data-au-problem'");
  assert.ok(at > 0, 'the refusal has its own wrapper');
  const wrapper = source.slice(at - 80, at + 120);
  assert.match(wrapper, /ref: problemAt/);
  const margin = Number((wrapper.match(/scrollMarginBottom: '(\d+)px'/) || [])[1]);
  assert.ok(margin >= 64, 'at least the sticky row\'s height (8 + 14 padding, a button, the -14 px offset)');
  assert.match(source, /problemAt\.current\?\.scrollIntoView\?\.\(\{ block: 'nearest' \}\)/);
});
const SPACES = ['chat', 'code', 'devices', 'recon', 'workshop'];
const NAMES = { chat: 'Chat', code: 'Code', devices: 'Devices', recon: 'Recon', workshop: 'Workshop' };
const MODE_SPACE = { bench: 'devices', recon: 'recon', 'creator-plus': 'workshop', code: 'code' };
const LABELS = { cowork: 'Cowork', chat: 'Chat', research: 'Research', finance: 'Finance', code: 'Code', bench: 'Devices', recon: 'Recon', 'creator-plus': 'Creator Plus', automations: 'Automations', lab: 'Lab', mine: 'Mine' };
const weekdays = { kind: 'weekdays', time: '09:00' };
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));
const spliced = (taskId) => ({ type: 'agent/inbox/spliced', data: { inserted: [{ message: { source: { kind: 'schedule' }, content: [{ type: 'text', text: `[SCHEDULE REMINDER]\nschedule_id_json: "${taskId}"\nreminder_prompt_json: "p"` }] } }] } });

/**
 * A stand-in app with a Modes service of stage 6b (spaces, guardOf, set with hold/anyTick, holdRun, scheduledPlace).
 * `ready`: each guarded space's guard; `ticks`: mode -> spaces; `chats`: id -> {mode, space, cwd, lastTurn, home}.
 */
function world({ catalog = [], notes, ready = { devices: true, workshop: true }, ticks, hidden = [], chats: extraChats = {}, bench = { guestsGuarded: true, folderTouchesDevices: (path) => (String(path).startsWith('/w/devfolder') ? 'devices' : String(path).startsWith('/dev') ? 'dev' : '') }, recon = { isRoom: (path) => String(path).startsWith('/room') }, modesExtra = {}, config: own = {}, grace = '0', noHold = false, refuseEdits = false, noModes = false } = {}) {
  process.env.DSH_AUTOMATIONS_SPACE_GRACE_MS = grace;
  const home = mkdtempSync(join(tmpdir(), 'automations-6b-'));
  if (notes) {
    mkdirSync(join(home, 'automations'), { recursive: true });
    writeFileSync(join(home, 'automations', 'tasks.json'), JSON.stringify(notes));
  }
  const config = { enabled: true, deletedToTrash: true, oldRunsToTrash: true, tab: true, mac: false, phone: false, ...own };
  let list = catalog.map((entry) => JSON.parse(JSON.stringify(entry)));
  const created = [];
  const edits = [];
  const sets = [];
  const held = new Map();
  const noted = [];
  const trashAdds = [];
  const handlers = {};
  const provided = {};
  let route;
  let changed = () => {};
  const tickTable = ticks ?? { cowork: ['chat'], chat: ['chat'], research: ['chat', 'code', 'devices', 'workshop', 'recon'], finance: ['chat'], code: ['code', 'devices', 'workshop'], bench: ['devices'], recon: ['recon'], 'creator-plus': ['workshop'], lab: ['chat'], automations: ['chat'] };
  const modeIds = ['cowork', 'chat', 'research', 'finance', 'code', 'bench', 'recon', 'creator-plus', 'automations', 'lab', 'mine'];
  const off = new Set();
  const chats = {
    'chat-fin': { mode: 'finance', space: 'chat', cwd: '/w/fin', lastTurn: 2 },
    'code-r1': { mode: 'research', space: 'code', cwd: '/w/proj', lastTurn: 2 },
    'chat-1': { mode: 'chat', space: 'chat', cwd: '/w/proj', lastTurn: 2 },
    'dev-r': { mode: 'research', space: 'devices', cwd: '/w/devthread', lastTurn: 2 },
    'ws-r': { mode: 'research', space: 'workshop', cwd: '/w/ws', lastTurn: 2 },
    'bench-1': { mode: 'bench', space: 'devices', cwd: '/w/devfolder', lastTurn: 2, home: true },
    'cp-1': { mode: 'creator-plus', space: 'workshop', cwd: '/w/ws', lastTurn: 2, home: true },
    'recon-1': { mode: 'research', space: 'recon', cwd: '/room/r1', lastTurn: 2 },
    'iso-1': { mode: 'mine', space: 'chat', cwd: '/w/proj', lastTurn: 2 },
    ...extraChats,
  };
  const isolatedModes = ['recon', 'mine'];
  const schedule = {
    catalog: async () => list.map((entry) => JSON.parse(JSON.stringify(entry))),
    create: async (request, actor) => {
      const entry = { id: `new-${created.length + 1}`, kind: request.timing.kind, title: request.title, prompt: request.prompt, status: 'active', target: request.target.kind === 'new_once' ? { ...request.target, sessionId: `reserved-${created.length + 1}` } : request.target, involvedSessionIds: actor ? [actor] : [], updatedAt: 'u1' };
      created.push(request);
      list.push(entry);
      return entry;
    },
    edit: async (request) => {
      edits.push(request);
      if (refuseEdits) return { id: request.id, code: 'schedule_weird' };
      const entry = list.find((item) => item.id === request.id);
      if (!entry) return { id: request.id, code: 'schedule_not_found' };
      if (request.expectedUpdatedAt !== undefined && request.expectedUpdatedAt !== entry.updatedAt) return { id: request.id, code: 'schedule_conflict' };
      if (request.action === 'delete') list = list.filter((item) => item.id !== request.id);
      else {
        if (request.patch.active !== undefined) entry.status = request.patch.active ? 'active' : 'paused';
        if (request.patch.target) entry.target = request.patch.target;
      }
      entry.updatedAt = `u${edits.length + 1}`;
      return entry;
    },
    run: async ({ id }) => ({ id }),
  };
  const guarded = (space) => space === 'devices' || space === 'workshop';
  const modes = {
    apiVersion: 2,
    get: (id) => chats[id]?.mode ?? 'cowork',
    isolated: (id) => chats[id]?.space === 'recon' || isolatedModes.includes(chats[id]?.mode),
    list: () => modeIds.filter((id) => !off.has(id)).map((id) => ({ id, label: LABELS[id] ?? id, isolated: isolatedModes.includes(id), tab: true })),
    modeName: (id) => LABELS[id] ?? id,
    lockedPreset: (mode, opts) => (opts?.space ? ({ code: 'cordis', devices: 'standard' }[opts.space] ?? '') : ({ research: 'ptc', bench: 'standard' }[mode] ?? '')),
    guardOf: (id) => {
      const chat = chats[id];
      if (!chat) return { top: id, space: '', mode: '', sealed: false, sealedBy: '', reconSpace: false, guardedBy: '', noPrograms: false, homeMode: false, fresh: true, unknownTop: false };
      const sealed = chat.space === 'recon' || isolatedModes.includes(chat.mode);
      return { top: id, space: chat.space, mode: chat.mode, sealed, sealedBy: chat.space === 'recon' ? 'recon' : sealed ? 'mode' : '', reconSpace: chat.space === 'recon', guardedBy: guarded(chat.space) ? chat.space : '', noPrograms: guarded(chat.space) || chat.space === 'recon', homeMode: chat.home === true, fresh: false, unknownTop: false };
    },
    set: (id, mode, options) => {
      sets.push([id, mode, options]);
      if (options?.hold && ready[options.space] !== true) {
        held.set(id, { space: options.space, reason: 'not ready' });
        return Promise.reject(Object.assign(new Error('held'), { held: true }));
      }
      if (chats[id]) Object.assign(chats[id], { mode, ...(options?.space ? { space: options.space } : {}) });
      return Promise.resolve();
    },
    spaces: {
      list: () => SPACES.map((id) => ({ id, available: !(guarded(id) && ready[id] === 'gone'), shown: !hidden.includes(id) })),
      modesIn: (space) => modeIds.filter((id) => !off.has(id) && (tickTable[id] ?? []).includes(space)).map((id) => ({ id, label: LABELS[id] ?? id, greyed: guarded(space) && ready[space] !== true })),
      ofMode: (mode) => MODE_SPACE[mode] ?? 'chat',
      names: () => NAMES,
      ready: () => ({ devices: ready.devices === true, workshop: ready.workshop === true, recon: true }),
      scheduledPlace: () => ({ space: 'chat', mode: 'cowork' }),
      of: (id) => chats[id]?.space ?? '',
      held: (id) => held.get(id) ?? null,
      ...(noHold ? {} : { holdRun: (id, info) => { held.set(id, info); return true; } }),
      noteGuestRun: (id, space) => { noted.push([id, space]); return true; },
    },
    ...modesExtra,
  };
  const services = {
    dshHomePath: (...parts) => join(home, ...parts),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', scheduledMode: 'cowork' } }], mutate: async () => {} },
    ...(noModes ? {} : { modes }),
    agents: { get: (id) => (chats[id] ? { id, session: id } : undefined), turnBoundaryOf: (id) => ({ openTurnStartSeq: null, lastTurn: chats[id]?.lastTurn ?? 0 }) },
    sessions: { get: (id) => (chats[id] ? { id, header: { id, cwd: chats[id].cwd } } : undefined) },
    agentPresets: { defaultId: 'standard', list: async () => [{ id: 'standard' }, { id: 'ptc' }, { id: 'cordis' }], presetForSession: () => 'standard' },
    ...(bench ? { bench } : {}),
    ...(recon ? { recon } : {}),
    creatorPlus: { guestsGuarded: true },
  };
  const on = (name, fn) => { handlers[name] = fn; };
  const services_ = services;
  const inner = {
    effect: (make) => make(),
    on: (name, fn) => { if (name === 'schedule/changed') changed = fn; },
    schedule,
    tools: { register: () => () => {} },
    webServer: { register: (spec) => { if (spec.path === DATA_PATH) route = spec.handler; return () => {}; } },
    connection: { requestRejection: () => undefined },
    coworkTrash: { register: () => ({ add: async (request) => { trashAdds.push(request); return { row: request.key }; }, items: () => [], dispose: () => {} }) },
  };
  const ctx = { get: (name) => services[name], effect: (make) => make(), provide: (name, value) => { provided[name] = value; }, on, logger: { warn: () => {}, info: () => {} }, inject: (_deps, fn) => fn(inner) };
  apply(ctx, config);
  const call = async (body, lang) => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    const req = body
      ? { method: 'POST', headers: lang ? { 'x-dsh-locale': lang } : {}, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } }
      : { method: 'GET', headers: {}, async *[Symbol.asyncIterator]() {} };
    await route(req, res);
    return JSON.parse(out);
  };
  const tool = (phase) => (exec, result) => (phase === 'pre'
    ? handlers['tools/pre-execute'](exec, async () => ({ kind: 'allow' }))
    : handlers['tools/post-execute'](exec, result, async () => ({ kind: 'accept', content: [{ type: 'text', text: '{}' }] })));
  return {
    home, call, config, created, edits, sets, held, noted, trashAdds, provided, chats, off, ready, modes, schedule, services: services_,
    step: (id) => handlers['agent/pre-step']({ agent: { id } }, () => ({ kind: 'next' })),
    list: () => list,
    task: (id) => list.find((item) => item.id === id),
    notes: () => JSON.parse(readFileSync(join(home, 'automations', 'tasks.json'), 'utf8')).tasks,
    event: (session, event) => handlers['session/event'](session, event),
    resolve: (id, agent = { id }) => handlers['schedule/resolve-agent'](id, async () => agent),
    pre: tool('pre'),
    post: tool('post'),
    remove: (id) => { list = list.filter((item) => item.id !== id); changed(); },
    changed: () => changed(),
    done: () => rmSync(home, { recursive: true, force: true }),
  };
}
const fixture = () => {
  const catalog = JSON.parse(readFileSync(new URL('catalog.json', FIXTURE), 'utf8'));
  const notes = JSON.parse(readFileSync(new URL('notes.json', FIXTURE), 'utf8'));
  notes.known = Object.fromEntries(catalog.map((entry) => [entry.id, recipeOf(entry)]));
  return { catalog, notes };
};
const failOf = async (promise) => (await promise).error ?? '';
const task = (id, target, extra = {}) => ({ id, kind: 'every', everySeconds: 3600, title: id, prompt: 'p', status: 'active', target, involvedSessionIds: [], updatedAt: 'u0', ...extra });

// ---- J5: nothing moves, nothing pauses at upgrade -----------------------------------------------------------------

test('migrate-claims-unchanged, migrate-runs-in-shown and migrate-no-pause: pre-6b automations run where they did', async () => {
  const { catalog, notes } = fixture();
  const app = world({ catalog, notes });
  try {
    const before = JSON.parse(JSON.stringify(notes.tasks));
    const view = await app.call();
    await settle();
    await app.call();
    await settle();
    assert.deepEqual(app.notes(), before, 'no note is rewritten');
    assert.equal(app.edits.filter((edit) => edit.patch?.active === false).length, 0, 'nothing paused');
    const shown = (id) => view.tasks.find((item) => item.id === id);
    assert.equal(shown('p-research').runsInLine, 'Runs in: Chat · Research', 'Research made in Code ran in Chat before 6b: it still does');
    assert.equal(shown('p-research').stored, false);
    assert.equal(shown('p-bench').runsInLine, 'Runs in: Devices · Devices');
    assert.equal(shown('p-assistant').runsInLine, 'Runs in: Chat · Cowork (the mode for automations)');
    assert.equal(shown('p-recon').runsInLine, 'Runs in: this thread (Recon · Research)');
    // A run's new thread is claimed with today's exact call: no space, same mode.
    app.chats['fresh-1'] = { mode: 'cowork', space: 'chat', cwd: '/w/proj', lastTurn: 0 };
    app.event({ id: 'fresh-1', header: { id: 'fresh-1' } }, spliced('p-research'));
    app.chats['fresh-2'] = { mode: 'cowork', space: 'chat', cwd: '/w/dev', lastTurn: 0 };
    app.event({ id: 'fresh-2', header: { id: 'fresh-2' } }, spliced('p-bench'));
    assert.deepEqual(app.sets, [['fresh-1', 'research', { claim: true }], ['fresh-2', 'bench', { claim: true }]]);
  } finally {
    app.done();
  }
});

test('migrate-lock-mode-keyed and lock-by-space-new-only: an existing automation keeps the mode\'s lock; a stored place follows the space\'s', async () => {
  const { catalog, notes } = fixture();
  const app = world({ catalog, notes });
  try {
    await app.call();
    await settle();
    const presetEdits = app.edits.filter((edit) => edit.patch?.target);
    assert.deepEqual(presetEdits.map((edit) => [edit.id, edit.patch.target.create.agentPreset]), [['p-research', 'ptc'], ['p-bench', 'standard']], 'the mode-keyed locks, as before 6b');
    // Change its place: from then on, Code's lock.
    const changed = await app.call({ action: 'runPlace', id: 'p-research', space: 'code', mode: 'research' });
    assert.equal(changed.error, undefined, changed.error);
    assert.equal(app.task('p-research').target.create.agentPreset, 'cordis', 'Code\'s lock');
    assert.equal(app.notes()['p-research'].runSpace, 'code');
  } finally {
    app.done();
  }
});

// ---- J6, J7: a stored place for new or changed ones, and runs go there ---------------------------------------------

test('new-stored-place, runs-in-chat-finance and runs-in-code-research: made from a thread, its new threads run in that space · mode', async () => {
  const app = world();
  try {
    const fin = await app.call({ action: 'create', sessionId: 'chat-fin', title: 'F', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' });
    assert.equal(fin.error, undefined, fin.error);
    const res = await app.call({ action: 'create', sessionId: 'code-r1', title: 'R', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' });
    assert.equal(res.error, undefined, res.error);
    assert.equal(res.made.runTabName, 'Code · Research');
    const notes = app.notes();
    assert.equal(notes['new-1'].runSpace, 'chat');
    assert.equal(notes['new-1'].runTab, 'finance');
    assert.equal(notes['new-2'].runSpace, 'code');
    assert.equal(notes['new-2'].createdSpace, 'code');
    assert.equal(notes['new-2'].createdBy, 'code-r1');
    assert.equal(app.created[1].target.create.agentPreset, 'cordis', 'D11: Code\'s lock for a stored place');
    const view = await app.call();
    assert.equal(view.tasks.find((item) => item.id === 'new-2').runsInLine, 'Runs in: Code · Research');
    app.chats['f1'] = { mode: 'cowork', space: 'chat', cwd: '/w/fin', lastTurn: 0 };
    app.event({ id: 'f1', header: { id: 'f1' } }, spliced('new-1'));
    app.chats['f2'] = { mode: 'cowork', space: 'chat', cwd: '/w/proj', lastTurn: 0 };
    app.event({ id: 'f2', header: { id: 'f2' } }, spliced('new-2'));
    assert.deepEqual(app.sets, [['f1', 'finance', { claim: true, space: 'chat', anyTick: true }], ['f2', 'research', { claim: true, space: 'code', anyTick: true }]]);
    // Into this thread: no stored place (it runs in the thread).
    const here = await app.call({ action: 'create', sessionId: 'code-r1', title: 'H', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(here.error, undefined);
    assert.equal(app.notes()['new-3'].runSpace, undefined);
  } finally {
    app.done();
  }
});

test('change-writes-place and change-same-place-noop (G2): Change stores the pair; saving the place it has writes nothing', async () => {
  const app = world({ catalog: [task('a1', { kind: 'new', create: { agentPreset: 'standard' } })], notes: { tasks: { a1: { createdIn: 'lab', made: 'new', runTab: 'lab' } } } });
  try {
    await app.call();
    await settle();
    const editsBefore = app.edits.length;
    const same = await app.call({ action: 'runPlace', id: 'a1', space: 'chat', mode: 'lab' });
    assert.equal(same.error, undefined, same.error);
    assert.equal(app.notes().a1.runSpace, undefined, 'nothing written');
    assert.equal(app.edits.length, editsBefore);
    assert.match(await failOf(app.call({ action: 'runPlace', id: 'a1', space: 'recon', mode: 'research' })), /Recon or in a sealed mode/);
    assert.match(await failOf(app.call({ action: 'runPlace', id: 'a1', space: 'chat', mode: 'code' })), /not offered now/);
    const moved = await app.call({ action: 'runPlace', id: 'a1', space: 'code', mode: 'research' });
    assert.equal(moved.error, undefined, moved.error);
    assert.equal(app.notes().a1.runSpace, 'code');
    assert.equal(app.notes().a1.runTab, 'research');
    // The page shows the pairs with the preset each one's lock gives (shown before saving).
    assert.equal(moved.places.find((row) => row.space === 'code' && row.mode === 'research').lockedName, 'Creator', 'cordis is shown as Creator');
  } finally {
    app.done();
  }
});

// ---- J8: Chat and Code places run where set ------------------------------------------------------------------------

test('runs-unticked-still-there, runs-hidden-space-still-there and mode-gone-pauses-as-today', async () => {
  const app = world({ catalog: [task('c1', { kind: 'new', create: {} })], notes: { tasks: { c1: { createdIn: 'research', made: 'button', runTab: 'research', runSpace: 'code' } } } });
  try {
    await app.call();
    await settle();
    // Research unticked for Code: it still runs there, with a note; never paused.
    app.modes.spaces.modesIn = ((orig) => (space) => orig(space).filter((row) => !(space === 'code' && row.id === 'research')))(app.modes.spaces.modesIn);
    await app.call();
    await settle();
    let view = await app.call();
    assert.match(view.tasks[0].placeNote, /^Research is no longer offered in Code\. This automation still runs there/);
    assert.equal(view.tasks[0].status, 'active');
    app.chats['n1'] = { mode: 'cowork', space: 'chat', cwd: '/w/proj', lastTurn: 0 };
    app.event({ id: 'n1', header: { id: 'n1' } }, spliced('c1'));
    assert.deepEqual(app.sets.at(-1), ['n1', 'research', { claim: true, space: 'code', anyTick: true }], 'claimed there (anyTick)');
    // Code hidden: the same, with the hidden note.
    app.modes.spaces.list = () => SPACES.map((id) => ({ id, available: true, shown: id !== 'code' }));
    await app.call();
    await settle();
    view = await app.call();
    assert.match(view.tasks[0].placeNote, /Code is hidden in Settings → Spaces/);
    assert.equal(view.tasks[0].status, 'active');
    // The mode's add-on off (C3): paused as today, its mode named.
    app.off.add('research');
    await app.call();
    await settle();
    view = await app.call();
    assert.equal(view.tasks[0].status, 'paused');
    assert.equal(app.notes().c1.pausedFor, 'research');
  } finally {
    app.done();
  }
});

// ---- J9, J11, J16, J17: guarded places are never left -------------------------------------------------------------

const guestTask = () => task('d1', { kind: 'new', create: { cwd: '/w/devthread' } });
const guestNote = { createdIn: 'research', createdSpace: 'devices', createdBy: 'dev-r', made: 'button', runTab: 'research', runSpace: 'devices' };

test('guarded-place-never-moved and refused-claim-pauses: a Devices run that cannot open there is held and the automation paused', async () => {
  const app = world({ catalog: [guestTask()], notes: { tasks: { d1: { ...guestNote } } }, ready: { devices: false, workshop: true } });
  try {
    await app.call();
    app.chats['h1'] = { mode: 'cowork', space: 'chat', cwd: '/w/devthread', lastTurn: 0 };
    app.event({ id: 'h1', header: { id: 'h1' } }, spliced('d1'));
    assert.deepEqual(app.sets, [['h1', 'research', { claim: true, space: 'devices', hold: true }]], 'only ever into Devices, held if it cannot');
    await settle();
    assert.equal(app.held.get('h1').space, 'devices');
    assert.equal(app.task('d1').status, 'paused');
    assert.equal(app.notes().d1.pausedFor, 'space:devices');
    // The run's record says it was held: nothing ran.
    const message = { id: 'm-h1', source: { kind: 'schedule' }, content: [{ type: 'text', text: '[SCHEDULE REMINDER]\nschedule_id_json: "d1"\nreminder_prompt_json: "p"' }] };
    app.event({ id: 'h1', header: { id: 'h1' } }, { type: 'user/message', time: new Date().toISOString(), data: message });
    app.event({ id: 'h1', header: { id: 'h1' } }, { type: 'turn/end', time: new Date().toISOString(), data: { reason: { kind: 'blocked' } } });
    const run = (await app.call()).runs.find((one) => one.sessionId === 'h1');
    assert.equal(run.state, 'stopped');
    assert.match(run.detail, /^Did not start: it runs in Devices, which could not take it now/);
    // C2: also with "New threads use the automation's mode" off.
    app.config.runsInTheirTab = false;
    app.chats['h2'] = { mode: 'cowork', space: 'chat', cwd: '/w/devthread', lastTurn: 0 };
    app.event({ id: 'h2', header: { id: 'h2' } }, spliced('d1'));
    assert.deepEqual(app.sets.at(-1), ['h2', 'research', { claim: true, space: 'devices', hold: true }]);
  } finally {
    app.done();
  }
});

test('guarded-pause-guard-off and guarded-pause-unticked: the guard pauses with a note naming the space and what to switch on', async () => {
  const app = world({ catalog: [guestTask()], notes: { tasks: { d1: { ...guestNote } } } });
  try {
    await app.call();
    await settle();
    assert.equal(app.task('d1').status, 'active', 'ready: nothing happens');
    app.ready.devices = false;
    app.off.add('bench');
    await app.call();
    await settle();
    let view = await app.call();
    assert.equal(view.tasks[0].status, 'paused');
    assert.equal(view.tasks[0].pausedNote, 'Paused: Devices cannot run it now (Devices is switched off). It was not moved anywhere else. Switch on Devices in Settings → Devices, then switch this automation on.');
    assert.match((await app.call(undefined, 'zh')).tasks[0].pausedNote ?? '', /^Paused: Devices cannot run it now/, 'a Chinese page gets English');
    // Back: a note; it stays paused until the owner switches it on.
    app.ready.devices = true;
    app.off.delete('bench');
    await app.call();
    await settle();
    view = await app.call();
    assert.equal(view.tasks[0].status, 'paused');
    assert.equal(view.tasks[0].pausedNote, 'Paused while Devices could not run it. Devices can run it again: switch this automation on when you want.');
    // Unticked for Devices: paused too (a guarded place is never moved).
    await app.call({ action: 'resume', id: 'd1' });
    app.modes.spaces.modesIn = ((orig) => (space) => orig(space).filter((row) => !(space === 'devices' && row.id === 'research')))(app.modes.spaces.modesIn);
    await app.call();
    await settle();
    view = await app.call();
    assert.equal(view.tasks[0].status, 'paused');
    assert.match(view.tasks[0].pausedNote, /\(Research is no longer ticked for Devices\)\. It was not moved anywhere else\. Tick it in Settings → Modes, or change Runs in/);
  } finally {
    app.done();
  }
});

test('guarded-pause-debounced-at-start (G1): no space pause in the first two minutes after start', async () => {
  const app = world({ catalog: [guestTask()], notes: { tasks: { d1: { ...guestNote } } }, ready: { devices: false, workshop: true }, grace: '120000' });
  try {
    await app.call();
    await settle();
    await app.call();
    await settle();
    assert.equal(app.task('d1').status, 'active');
    assert.equal(app.edits.filter((edit) => edit.patch?.active === false).length, 0);
  } finally {
    app.done();
  }
});

test('legacy-createdin-space-not-paused (J17) and recon-session-paused-recon-off: a space id in createdIn is a space; Recon as today', async () => {
  const legacy = task('l1', { kind: 'session', sessionId: 'dev-r' });
  const reconOne = task('r1', { kind: 'session', sessionId: 'recon-1' });
  const app = world({ catalog: [legacy, reconOne], notes: { tasks: { l1: { createdIn: 'devices', made: 'button' }, r1: { createdIn: 'recon', made: 'button' } } } });
  try {
    await app.call();
    await settle();
    await app.call();
    await settle();
    assert.equal(app.task('l1').status, 'active', 'not a missing mode');
    // Recon off: its mode is gone: paused as before 6b, the mode named.
    app.off.add('recon');
    await app.call();
    await settle();
    assert.equal(app.task('r1').status, 'paused');
    assert.equal(app.notes().r1.pausedFor, 'recon');
    // Devices off: the legacy one is watched as the space.
    app.ready.devices = false;
    await app.call();
    await settle();
    assert.equal(app.task('l1').status, 'paused');
    assert.equal(app.notes().l1.pausedFor, 'space:devices');
  } finally {
    app.done();
  }
});

test('holdrun for a thread target: a run into a Devices thread whose guard is off is held before it starts', async () => {
  const app = world({ catalog: [task('s1', { kind: 'session', sessionId: 'dev-r' })], notes: { tasks: { s1: { createdIn: 'research', createdSpace: 'devices', createdBy: 'dev-r', made: 'button' } } } });
  try {
    await app.call();
    await settle();
    // Devices goes off just before the run (before the guard's look): the run is held, then the automation paused.
    app.ready.devices = false;
    app.off.add('bench');
    await app.resolve('dev-r');
    await settle();
    assert.equal(app.task('s1').status, 'paused');
    assert.equal(app.held.get('dev-r').space, 'devices');
    assert.equal(app.held.get('dev-r').reason, 'Devices is switched off');
  } finally {
    app.done();
  }
});

test('automations-off-pauses-guarded (J16): switched off, Devices and Workshop automations pause with a note; Chat/Code ones do not', async () => {
  const chatOne = task('c1', { kind: 'new', create: {} });
  const app = world({ catalog: [guestTask(), chatOne], notes: { tasks: { d1: { ...guestNote }, c1: { createdIn: 'research', made: 'button', runTab: 'research', runSpace: 'code' } } } });
  try {
    await app.call();
    app.config.enabled = false;
    await new Promise((resolve) => setTimeout(resolve, 3300));
    assert.equal(app.task('d1').status, 'paused');
    assert.equal(app.task('c1').status, 'active');
    assert.equal(app.notes().d1.pauseReason, 'automationsOff');
    const view = await app.call();
    assert.equal(view.tasks.find((item) => item.id === 'd1').pausedNote, 'Paused: Automations was switched off, and it is what keeps these runs in Devices. Switch Automations on, then switch this automation on.');
    // Switched on again: it stays paused until the owner switches it on; the note says it can run again.
    app.config.enabled = true;
    await app.call();
    await settle();
    const back = await app.call();
    assert.equal(back.tasks.find((item) => item.id === 'd1').status, 'paused');
    assert.match(back.tasks.find((item) => item.id === 'd1').pausedNote, /Devices can run it again/);
    assert.equal(app.provided.automations.placesGuestRuns(), true);
    app.config.enabled = false;
    assert.equal(app.provided.automations.placesGuestRuns(), false, 'Modes then refuses a guest\'s new-thread schedule');
  } finally {
    app.done();
  }
});

// ---- J10: guests in Devices and Workshop --------------------------------------------------------------------------

test('guest-clock-three-choices and bench-home-no-clock (G4)', async () => {
  const app = world();
  try {
    assert.deepEqual(await app.call({ action: 'isolated', sessionId: 'dev-r' }), { isolated: false, guarded: false, guest: 'devices', blank: false });
    assert.equal((await app.call({ action: 'isolated', sessionId: 'ws-r' })).guarded, false);
    assert.equal((await app.call({ action: 'isolated', sessionId: 'bench-1' })).guarded, true, 'the Devices mode at home: no clock, as before');
    assert.equal((await app.call({ action: 'isolated', sessionId: 'cp-1' })).guarded, false, 'Creator Plus at home: its clock, as before');
    const context = await app.call({ action: 'context', sessionId: 'dev-r' });
    assert.deepEqual(context.wheres, ['session', 'new_once', 'new'], 'this thread, or a new thread');
    assert.equal(context.guest.here.label, 'A new thread in Devices · Research');
    assert.equal(context.guest.otherLabel, 'A new thread in another space…');
    assert.ok(context.guest.other.length > 0 && context.guest.other.every((row) => row.space === 'chat' || row.space === 'code'), 'another space: Chat or Code');
    assert.match(context.guest.other[0].warn, /do not follow the rules of Devices/);
    assert.equal(context.placeName, 'Devices · Research');
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'bench-1', title: 'B', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })), /not made from the Devices mode/);
    // This space · this mode: the thread's folder, stored in Devices, noted to Modes (L4).
    const here = await app.call({ action: 'create', sessionId: 'dev-r', title: 'D', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' });
    assert.equal(here.error, undefined, here.error);
    assert.equal(app.created[0].target.create.cwd, '/w/devthread');
    assert.equal(app.notes()['new-1'].runSpace, 'devices');
    assert.deepEqual(app.noted, [['new-1', 'devices']]);
  } finally {
    app.done();
  }
});

test('guest-other-space-folder-required, guest-folder-devices-refused, guest-folder-room-refused, guest-folder-unchecked-refused', async () => {
  const app = world();
  try {
    const make = (cwd, place = { space: 'code', mode: 'research' }, id = 'dev-r') => app.call({ action: 'create', sessionId: id, title: 'O', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new', place, ...(cwd === undefined ? {} : { cwd }) });
    assert.match(await failOf(make(undefined)), /^Pick a folder for runs in Code\.$/);
    assert.match(await failOf(make('')), /Pick a folder/);
    assert.match(await failOf(make('/w/devfolder/sub')), /it is, or holds, the Devices folder, \/dev or Recon's room/);
    assert.match(await failOf(make('/dev/tty.usb')), /Devices folder, \/dev/);
    assert.match(await failOf(make('/')), /Devices folder, \/dev/, 'the whole disk holds /dev');
    assert.match(await failOf(make('/room/r9')), /Recon's room/);
    assert.match(await failOf(make('/w/elsewhere', { space: 'recon', mode: 'research' })), /not offered now/);
    assert.equal(app.created.length, 0);
    const ok = await make('/w/project');
    assert.equal(ok.error, undefined, ok.error);
    assert.equal(app.created[0].target.create.cwd, '/w/project', 'the folder picked, never the Devices thread\'s');
    assert.equal(app.notes()['new-1'].runSpace, 'code');
    assert.deepEqual(app.noted, [], 'a Code place is not a guest run space');
  } finally {
    app.done();
  }
  // Devices cannot check the folder (off or too old): refused for a Devices guest.
  const unchecked = world({ bench: { guestsGuarded: true } });
  try {
    assert.match(await failOf(unchecked.call({ action: 'create', sessionId: 'dev-r', title: 'O', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new', place: { space: 'code', mode: 'research' }, cwd: '/w/project' })), /could not be checked, because Devices is off or out of date/);
  } finally {
    unchecked.done();
  }
  const throws = world({ bench: { guestsGuarded: true, folderTouchesDevices: () => 'unknown' } });
  try {
    assert.match(await failOf(throws.call({ action: 'create', sessionId: 'ws-r', title: 'O', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new', place: { space: 'code', mode: 'research' }, cwd: '/w/project' })), /could not be checked/);
  } finally {
    throws.done();
  }
});

test('needs-newer-modes: a guarded place with a Modes that cannot hold a run is refused (3.5)', async () => {
  const app = world({ noHold: true });
  try {
    assert.match(await failOf(app.call({ action: 'create', sessionId: 'dev-r', title: 'D', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' })), /Runs in Devices need a newer Modes add-on/);
    assert.equal((await app.call({ action: 'create', sessionId: 'dev-r', title: 'D', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' })).error, undefined, 'this thread still works');
  } finally {
    app.done();
  }
});

test('assistant-guest-new-stays-in-space: a guest\'s schedule_create with a new thread gets this space · this mode before its answer', async () => {
  const app = world();
  try {
    const result = { value: { id: 't-77', target: { kind: 'new' } }, content: [{ type: 'text', text: '{}' }] };
    const decision = await app.post({ name: 'schedule_create', agent: { id: 'dev-r' }, arguments: { target: 'new' } }, result);
    assert.equal(decision.kind, 'accept');
    const note = app.notes()['t-77'];
    assert.deepEqual({ runSpace: note.runSpace, runTab: note.runTab, createdSpace: note.createdSpace, createdBy: note.createdBy, made: note.made }, { runSpace: 'devices', runTab: 'research', createdSpace: 'devices', createdBy: 'dev-r', made: 'tool' });
    assert.deepEqual(app.noted, [['t-77', 'devices']]);
    // this_session, or a Chat thread: nothing written.
    await app.post({ name: 'schedule_create', agent: { id: 'dev-r' }, arguments: { target: 'this_session' } }, { value: { id: 't-78' } });
    await app.post({ name: 'schedule_create', agent: { id: 'chat-1' }, arguments: { target: 'new' } }, { value: { id: 't-79' } });
    assert.equal(app.notes()['t-78'], undefined);
    assert.equal(app.notes()['t-79'], undefined);
  } finally {
    app.done();
  }
});

test('wrapper-note-failure-pauses (L3): if its place cannot be recorded, the new automation is paused at once, else deleted', async () => {
  const app = world({ catalog: [task('t-80', { kind: 'new', create: {} })] });
  try {
    await app.call();
    // A thread whose mode cannot be written as a run mode: the place is not recorded.
    app.chats['dev-bad'] = { mode: 'Not A Mode!', space: 'devices', cwd: '/w/devthread', lastTurn: 2 };
    const decision = await app.post({ name: 'schedule_create', agent: { id: 'dev-bad' }, arguments: { target: 'new' } }, { value: { id: 't-80' }, content: [{ type: 'text', text: '{}' }] });
    assert.equal(app.task('t-80').status, 'paused');
    assert.match(decision.content.at(-1).text, /^It was made paused: its place in Devices could not be recorded\./);
  } finally {
    app.done();
  }
  const refusing = world({ catalog: [task('t-81', { kind: 'new', create: {} })], refuseEdits: true });
  try {
    await refusing.call();
    refusing.chats['dev-bad'] = { mode: 'Not A Mode!', space: 'devices', cwd: '/w/devthread', lastTurn: 2 };
    const decision = await refusing.post({ name: 'schedule_create', agent: { id: 'dev-bad' }, arguments: { target: 'new' } }, { value: { id: 't-81' } });
    assert.deepEqual(refusing.edits.map((edit) => edit.action === 'delete' ? 'delete' : 'pause'), ['pause', 'delete']);
    assert.match(decision.content.at(-1).text, /could not be paused or deleted|It was deleted again/);
  } finally {
    refusing.done();
  }
});

// ---- J12, J13: Recon "this thread only"; Scheduling from Recon off ----------------------------------------------

test('recon-this-thread-only, recon-pairs-never-listed and new-form-room-folder-refused', async () => {
  const app = world();
  try {
    const context = await app.call({ action: 'context', sessionId: 'recon-1' });
    assert.deepEqual(context.wheres, ['session']);
    const made = await app.call({ action: 'create', sessionId: 'recon-1', title: 'R', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(made.error, undefined, made.error);
    assert.equal(made.tasks.find((item) => item.id === 'new-1').runsInLine, 'Runs in: this thread (Recon · Research)');
    assert.equal(made.tasks.find((item) => item.id === 'new-1').sealed, true);
    const newForm = await app.call({ action: 'context' });
    assert.ok(newForm.places.length > 0);
    assert.ok(!newForm.places.some((row) => row.space === 'recon' || row.mode === 'recon' || row.mode === 'mine' || row.mode === 'automations'), 'never a Recon pair, a sealed mode or Automations');
    assert.ok(!made.places.some((row) => row.space === 'recon'));
    assert.match(await failOf(app.call({ action: 'create', place: { space: 'code', mode: 'research' }, cwd: '/room/r1', title: 'x', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' })), /Recon's room/);
    assert.match(await failOf(app.call({ action: 'create', place: { space: 'recon', mode: 'research' }, cwd: '/w/p', title: 'x', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' })), /Recon or in a sealed mode/);
  } finally {
    app.done();
  }
});

test('new-form-default-place (G5): New starts on the place the mode for scheduled tasks gives, and stores the pair', async () => {
  const app = world();
  try {
    const context = await app.call({ action: 'context' });
    assert.deepEqual(context.place, { space: 'chat', mode: 'cowork' });
    const made = await app.call({ action: 'create', place: { space: 'code', mode: 'research' }, cwd: '/w/p', title: 'x', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' });
    assert.equal(made.error, undefined, made.error);
    assert.equal(app.notes()['new-1'].runSpace, 'code');
    assert.equal(app.notes()['new-1'].made, 'new');
  } finally {
    app.done();
  }
});

test('schedule-from-recon-off-owner-isolated and schedule-from-recon-off-recon-guest: no clock in any sealed thread', async () => {
  const app = world({ config: { scheduleFromRecon: false } });
  try {
    for (const id of ['iso-1', 'recon-1']) {
      assert.equal((await app.call({ action: 'isolated', sessionId: id })).isolated, true, id);
      const context = await app.call({ action: 'context', sessionId: id });
      assert.equal(context.allowed, false, id);
      assert.equal(context.reasonKind, 'reconOff');
    }
    assert.equal((await app.call({ action: 'context', sessionId: 'chat-1' })).allowed, true);
  } finally {
    app.done();
  }
});

// ---- J15: a guest edits only its own space's automations; a sealed thread only one into it ------------------------

test('guest-edit-other-space-denied, sealed-edit-other-task-denied and edit-unknown-task-denied', async () => {
  const mine = task('dev-own', { kind: 'new', create: {} });
  const chatOne = task('chat-own', { kind: 'new', create: {} });
  const intoGuest = task('into-dev', { kind: 'session', sessionId: 'dev-r' });
  const intoRecon = task('into-recon', { kind: 'session', sessionId: 'recon-1' });
  const moved = task('dev-moved', { kind: 'new', create: { cwd: '/w/project' } });
  const app = world({ catalog: [mine, chatOne, intoGuest, intoRecon, moved], notes: { tasks: { 'dev-own': { createdIn: 'research', createdSpace: 'devices', made: 'tool', runTab: 'research', runSpace: 'devices' }, 'chat-own': { createdIn: 'research', createdSpace: 'chat' }, 'into-dev': { createdIn: 'chat', createdSpace: 'chat' }, 'into-recon': { createdIn: 'recon', createdSpace: 'recon' }, 'dev-moved': { createdIn: 'research', createdSpace: 'devices', made: 'button', runTab: 'research', runSpace: 'code' } } } });
  try {
    await app.call();
    const edit = (agent, id) => app.pre({ name: 'schedule_edit', agent: { id: agent }, arguments: { id, action: 'update', prompt: 'x' } });
    assert.equal((await edit('dev-r', 'dev-own')).kind, 'allow', 'made in Devices');
    assert.equal((await edit('dev-r', 'into-dev')).kind, 'allow', 'delivered to this thread');
    const other = await edit('dev-r', 'chat-own');
    assert.equal(other.kind, 'deny');
    assert.equal(other.reason, 'From Devices you can change only automations made in Devices that still run there, or ones delivered to this thread. Nothing was changed. Tell the user they can change it on the Automations page.');
    // Review finding: made in Devices, but the owner sent its runs to Code: the guest can no longer rewrite it.
    assert.equal((await edit('dev-r', 'dev-moved')).kind, 'deny', 'made in Devices, now runs in Code');
    // A Devices place made elsewhere is not the guest's either.
    assert.equal((await edit('ws-r', 'dev-own')).kind, 'deny', 'another guarded space');
    assert.equal((await edit('dev-r', 'nope')).kind, 'deny', 'an unknown task');
    assert.equal((await edit('recon-1', 'into-recon')).kind, 'allow');
    const sealedOther = await edit('recon-1', 'chat-own');
    assert.equal(sealedOther.kind, 'deny');
    assert.match(sealedOther.reason, /^From a sealed thread you can change only automations that run in this thread/);
    assert.equal((await edit('iso-1', 'chat-own')).kind, 'deny', 'an owner\'s sealed mode too');
    assert.equal((await edit('chat-1', 'dev-own')).kind, 'allow', 'other threads are not touched');
    assert.deepEqual({ ...app.provided.automations.placeOf('into-recon') }, { space: 'recon', mode: 'research', stored: false, sessionId: 'recon-1', createdSpace: 'recon' });
    assert.deepEqual({ ...app.provided.automations.placeOf('dev-moved') }, { space: 'code', mode: 'research', stored: true, sessionId: '', createdSpace: 'devices' });
    assert.equal(app.provided.automations.placeOf('nope'), null);
  } finally {
    app.done();
  }
});

// ---- G10: the trash lists a deleted automation under the space it was made in ---------------------------------------

test('trash-tab-from-created-space (G10)', async () => {
  const app = world({ catalog: [task('t1', { kind: 'new', create: {} })], notes: { tasks: { t1: { createdIn: 'research', createdSpace: 'code', made: 'button' } } } });
  try {
    await app.call();
    app.remove('t1');
    await settle();
    assert.equal(app.trashAdds[0].tab, 'code');
    assert.equal(app.trashAdds[0].data.ownerData.tab, 'research', 'Put back keeps the mode');
    assert.equal(app.trashAdds[0].data.ownerData.createdSpace, 'code');
  } finally {
    app.done();
  }
});

// ---- Review findings (stage 6b) -------------------------------------------------------------------------------------

test('home-creator-plus-not-a-guest: Creator Plus at home records no guarded space, and switching Automations off pauses nothing', async () => {
  const app = world();
  try {
    const made = await app.call({ action: 'create', sessionId: 'cp-1', title: 'C', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'new' });
    assert.equal(made.error, undefined, made.error);
    const here = await app.call({ action: 'create', sessionId: 'cp-1', title: 'S', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(here.error, undefined, here.error);
    const notes = app.notes();
    assert.equal(notes['new-1'].createdSpace, undefined, 'home mode: no guarded space recorded');
    assert.equal(notes['new-1'].runSpace, undefined, 'no stored place: today\'s claim');
    assert.equal(notes['new-2'].createdSpace, undefined);
    // A guest still records its space.
    await app.call({ action: 'create', sessionId: 'ws-r', title: 'G', prompt: 'p', when: weekdays, timeZone: 'UTC', where: 'session' });
    assert.equal(app.notes()['new-3'].createdSpace, 'workshop');
    app.config.enabled = false;
    await new Promise((resolve) => setTimeout(resolve, 3300));
    assert.equal(app.task('new-1').status, 'active', 'made at home: keeps running, as before 6b');
    assert.equal(app.task('new-2').status, 'active');
  } finally {
    app.config.enabled = true;
    app.done();
  }
});

test('modes-gone-holds-and-pauses (3.5): with no Modes, a Devices automation\'s run is held here and the automation paused', async () => {
  const app = world({ catalog: [guestTask(), task('c1', { kind: 'new', create: {} })], notes: { tasks: { d1: { ...guestNote }, c1: { createdIn: 'research', made: 'button', runTab: 'research', runSpace: 'code' } } }, noModes: true, grace: '120000' });
  try {
    await app.call();
    // In the start-up grace: the run is held (never a plain thread), the automation not yet paused.
    app.chats['h1'] = { mode: 'cowork', space: 'chat', cwd: '/w/devthread', lastTurn: 0 };
    app.event({ id: 'h1', header: { id: 'h1' } }, spliced('d1'));
    assert.deepEqual(app.sets, [], 'no claim without Modes');
    assert.deepEqual(app.step('h1'), { kind: 'reject' }, 'its first step is refused');
    assert.deepEqual(app.step('other'), { kind: 'next' });
    await settle();
    assert.equal(app.task('d1').status, 'active', 'no pause in the start-up grace');
    // The owner writes in it: it is theirs, it runs.
    app.event({ id: 'h1', header: { id: 'h1' } }, { type: 'agent/inbox/spliced', data: { inserted: [{ message: { source: { kind: 'user' }, content: [] } }] } });
    assert.deepEqual(app.step('h1'), { kind: 'next' });
  } finally {
    app.done();
  }
  const later = world({ catalog: [guestTask(), task('c1', { kind: 'new', create: {} })], notes: { tasks: { d1: { ...guestNote }, c1: { createdIn: 'research', made: 'button', runTab: 'research', runSpace: 'code' } } }, noModes: true });
  try {
    await later.call();
    await new Promise((resolve) => setTimeout(resolve, 3300));
    assert.equal(later.task('d1').status, 'paused', 'after the grace: paused before any run');
    assert.equal(later.task('c1').status, 'active', 'a Code place is not paused');
    assert.equal(later.notes().d1.pauseReason, 'modesOld');
    const view = await later.call();
    assert.equal(view.tasks.find((item) => item.id === 'd1').pausedNote, 'Paused: Modes is off, missing or out of date, and it is what keeps these runs in Devices. Switch on or update Modes in Settings, then switch this automation on.');
    // Switched on by the owner: left alone (no fight).
    await later.call({ action: 'resume', id: 'd1' });
    await new Promise((resolve) => setTimeout(resolve, 3300));
    assert.equal(later.task('d1').status, 'active');
  } finally {
    later.done();
  }
});

test('modes-too-old-holds (3.5): a Modes that cannot hold a run: the run is held here, never claimed as a plain thread', async () => {
  const app = world({ catalog: [guestTask()], notes: { tasks: { d1: { ...guestNote } } }, noHold: true });
  try {
    await app.call();
    app.chats['h1'] = { mode: 'cowork', space: 'chat', cwd: '/w/devthread', lastTurn: 0 };
    app.event({ id: 'h1', header: { id: 'h1' } }, spliced('d1'));
    assert.deepEqual(app.sets, [], 'not dropped to today\'s claim');
    assert.deepEqual(app.step('h1'), { kind: 'reject' });
    await settle();
    assert.equal(app.task('d1').status, 'paused');
    assert.equal(app.notes().d1.pauseReason, 'modesOld');
  } finally {
    app.done();
  }
});

test('held-run-listed (lab fix): a held run whose turn ran no step (no message event) is still listed under Last runs', async () => {
  const app = world({ catalog: [guestTask()], notes: { tasks: { d1: { ...guestNote } } }, ready: { devices: false, workshop: true } });
  try {
    await app.call();
    app.chats['h1'] = { mode: 'cowork', space: 'chat', cwd: '/w/devthread', lastTurn: 0 };
    app.event({ id: 'h1', header: { id: 'h1' } }, spliced('d1'));
    await settle();
    // As in the lab: the step is refused, so the scheduler's message never shows as a message of the turn.
    app.event({ id: 'h1', header: { id: 'h1' } }, { type: 'turn/end', time: new Date().toISOString(), data: { reason: { kind: 'completed' } } });
    const run = (await app.call()).runs.find((one) => one.sessionId === 'h1');
    assert.ok(run, 'listed');
    assert.equal(run.state, 'stopped');
    assert.equal(run.held, true);
    assert.deepEqual(run.tasks.map((one) => one.id), ['d1']);
    assert.match(run.detail, /^Did not start: it runs in Devices, which could not take it now/);
    // An ordinary turn with no scheduler message is not made a run.
    app.event({ id: 'chat-1', header: { id: 'chat-1' } }, { type: 'turn/end', time: new Date().toISOString(), data: { reason: { kind: 'completed' } } });
    assert.equal((await app.call()).runs.filter((one) => one.sessionId === 'chat-1').length, 0);
  } finally {
    app.done();
  }
  // Modes gone: Automations' own hold is recorded the same way.
  const own = world({ catalog: [guestTask()], notes: { tasks: { d1: { ...guestNote } } }, noModes: true });
  try {
    await own.call();
    own.chats['h2'] = { mode: 'cowork', space: 'chat', cwd: '/w/devthread', lastTurn: 0 };
    own.event({ id: 'h2', header: { id: 'h2' } }, spliced('d1'));
    own.event({ id: 'h2', header: { id: 'h2' } }, { type: 'turn/end', time: new Date().toISOString(), data: { reason: { kind: 'completed' } } });
    const run = (await own.call()).runs.find((one) => one.sessionId === 'h2');
    assert.equal(run?.held, true);
    assert.match(run.detail, /Modes is off, missing or out of date/);
  } finally {
    own.done();
  }
});

test('held-not-failed (stage 7, 6b lab): a held run counts under "Did not start", never under Failed (7 days); its badge and mark say so', async () => {
  const app = world({ catalog: [guestTask()], notes: { tasks: { d1: { ...guestNote } } }, ready: { devices: false, workshop: true } });
  try {
    await app.call();
    app.chats['h3'] = { mode: 'cowork', space: 'chat', cwd: '/w/devthread', lastTurn: 0 };
    app.event({ id: 'h3', header: { id: 'h3' } }, spliced('d1'));
    await settle();
    app.event({ id: 'h3', header: { id: 'h3' } }, { type: 'turn/end', time: new Date().toISOString(), data: { reason: { kind: 'completed' } } });
    const view = await app.call();
    assert.equal(view.runs.find((one) => one.sessionId === 'h3')?.held, true);
    assert.equal(view.tiles.failed, 0, 'a held run is not a failed one');
    assert.equal(view.tiles.held, 1);
    assert.equal(view.tiles.ranToday, 0, 'stage 7 lab: a held run is not counted under Ran today');
  } finally {
    app.done();
  }
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(source, /state: run\.held && !live \? 'held' : run\.state/);
  // Stage 7 lab: the automation's own row says "Did not start" for a held last run too (it said "Stopped").
  assert.match(source, /last\.held === true && last\.state !== 'running' && last\.state !== 'waiting' \? 'held' : last\.state/);
  assert.match(source, /h\(Badge, \{ state: lastState \}\)/);
  assert.match(source, /'Did not start \(7 days\)'/);
  assert.doesNotMatch(source, /'Held/, 'the word guide: never "held" in user texts');
  const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(index, /run\.held === true \? 'held' : 'failed'/);
});

test('modes-back-note (lab 15c): once Modes is back, the Modes pause note becomes "can run it again"', async () => {
  const app = world({ catalog: [guestTask()], notes: { tasks: { d1: { ...guestNote } } }, noModes: true });
  try {
    await app.call();
    await new Promise((resolve) => setTimeout(resolve, 3300));
    assert.equal(app.task('d1').status, 'paused');
    assert.equal(app.notes().d1.pauseReason, 'modesOld');
    // Modes is back: the next look says it can run again; it stays paused until the owner switches it on.
    app.services.modes = app.modes;
    app.changed();
    await settle();
    await app.call();
    await settle();
    const note = (await app.call()).tasks.find((item) => item.id === 'd1').pausedNote;
    assert.equal(app.task('d1').status, 'paused');
    assert.doesNotMatch(note, /Modes is off/);
    assert.match(note, /again/);
  } finally {
    app.done();
  }
});
