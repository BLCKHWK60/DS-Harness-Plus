// Skill architect (steps 70 to 87) with plain data and a stand-in app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLibrary, readReach, skillProblem } from '../lib/library.js';
import { openProposals, visibleTo } from '../lib/proposals.js';
import { learnPrompt, pickConversations, proposalsOf, redact, signalsOf, whereOf } from '../lib/learn.js';
import { DATA_PATH, apply } from '../index.js';

test('the library: kebab names, never another skill\'s name, versions with Put back, delete keeps the versions', () => {
  let clock = 1000;
  const library = openLibrary('', { now: () => (clock += 1) });
  assert.match(skillProblem({ name: 'Bad Name', description: 'd', text: 't' }), /lowercase words/);
  assert.match(skillProblem({ name: 'mine', description: 'd', text: 't' }, (name) => name === 'mine'), /already a skill called "mine"/);
  assert.throws(() => library.add({ name: 'pdf', description: 'd', text: 't' }, (name) => name === 'pdf'), /never takes another skill's name/);
  library.add({ name: 'check-dates', description: 'When dates matter', text: 'Check every date twice.' });
  assert.throws(() => library.add({ name: 'check-dates', description: 'x', text: 'y' }), /already a learned skill/);
  library.update('check-dates', { text: 'Check every date three times.' });
  assert.equal(library.get('check-dates').current, 2);
  library.putBack('check-dates', 1);
  const back = library.get('check-dates');
  assert.equal(back.text, 'Check every date twice.');
  assert.equal(back.versions.length, 3, 'Put back is a new version: nothing is lost');
  library.remove('check-dates');
  assert.equal(library.get('check-dates').deleted, true);
  library.putBack('check-dates', 2);
  assert.equal(library.get('check-dates').deleted, false, 'a deleted skill can be put back');
  assert.deepEqual(readReach({ kind: 'tab', tab: 'recon' }), { kind: 'all' }, 'never a Recon reach');
  assert.deepEqual(readReach({ kind: 'project', folder: 'relative' }), { kind: 'all' });
});

test('who sees a learned skill: every tab, its tab only where the tab is known, its project only there', () => {
  const all = { reach: { kind: 'all' } };
  const tab = { reach: { kind: 'tab', tab: 'code' } };
  const project = { reach: { kind: 'project', folder: '/w/books' } };
  assert.equal(visibleTo(all, {}), true);
  assert.equal(visibleTo(tab, { tab: 'code' }), true);
  assert.equal(visibleTo(tab, { tab: '' }), false, 'tab not known: not offered');
  assert.equal(visibleTo(project, { cwd: '/w/books/' }), true);
  assert.equal(visibleTo(project, { cwd: '/w/other' }), false);
  assert.equal(visibleTo({ ...all, deleted: true }, {}), false);
});

test('signals: corrections you typed, Stops, thumbs down with a note, feedback; the copied part is skipped', () => {
  const answer = (text) => ({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } });
  const user = (text, kind = 'user') => ({ type: 'user/message', data: { message: { content: [{ type: 'text', text }], source: { kind } } } });
  const events = [
    answer('copied answer'), user('No, that is wrong'),
    answer('Here are the dates: 1 May.'), user('No, I said June.'),
    answer('Working…'), { type: 'turn/end', data: { reason: { kind: 'aborted' } } },
    { type: 'feedback/message-put', data: { rating: 'down', note: 'Too long' } },
    user('Run the morning brief', 'schedule'),
    user('Thanks, that works.'),
  ];
  const signals = signalsOf(events, 2);
  assert.equal(signals.corrections, 1, 'the copied correction does not count');
  assert.equal(signals.stops, 1);
  assert.equal(signals.thumbsDown, 1);
  assert.match(signals.excerpts[0], /The assistant said:\nHere are the dates: 1 May\.\nThen you wrote:\nNo, I said June\./);
  assert.ok(signals.score > 0);
  assert.equal(signalsOf([answer('a'), user('Thanks!')]).score, 0);
});

test('what may be read: nothing without Modes; helpers and the reasons given are left out', () => {
  const records = [{ header: { id: 'a' } }, { header: { id: 'h', origin: 'subagent', parentSession: 'a' } }, { header: { id: 'r' } }];
  assert.deepEqual(pickConversations(records, { known: false, why: () => '' }), { read: [], left: [] });
  const picked = pickConversations(records, { known: true, why: (id) => (id === 'r' ? 'isolated (Recon)' : '') });
  assert.deepEqual(picked.read.map((record) => record.header.id), ['a']);
  assert.deepEqual(picked.left, [{ id: 'h', why: 'a helper' }, { id: 'r', why: 'isolated (Recon)' }]);
});

test('what goes to the reading model is redacted; its proposals are checked', () => {
  const text = learnPrompt({ conversations: [{ n: 1, tab: 'code', excerpts: ['key sk-abcdefghijklmnop1234 in /Users/someone/x and me@example.org'] }], taken: ['pdf'] });
  assert.doesNotMatch(text, /sk-abcdefghijklmnop1234|someone|me@example\.org/);
  assert.match(text, /\[secret\]/);
  assert.match(text, /must not be used: pdf/);
  assert.equal(redact('/Users/abc/file'), '~/file');
  const answer = 'Here: {"proposals":[{"kind":"skill","name":"pdf","description":"x","text":"t"},{"kind":"skill","name":"check-dates","description":"When dates matter","text":"Check them."},{"kind":"fact","text":"Prefers June dates."},{"kind":"nonsense","text":"x"},{"kind":"rule","text":""}]}';
  const found = proposalsOf(answer, { taken: (name) => name === 'pdf' });
  assert.deepEqual(found.map((item) => item.kind), ['skill', 'fact']);
  assert.equal(found[0].name, 'check-dates');
  assert.deepEqual(proposalsOf('no json'), []);
  assert.equal(whereOf('http://127.0.0.1:8080/v1').where, 'local');
  assert.equal(whereOf('http://192.168.1.20/v1').where, 'network');
  assert.equal(whereOf('https://api.example.com').where, 'cloud');
});

test('proposals: quotes go once you decide, or when their conversation is deleted for good', () => {
  const store = openProposals('');
  const [one, two] = store.add([{ kind: 'fact', text: 'A', quotes: ['q1'], conversations: ['c1'] }, { kind: 'fact', text: 'B', quotes: ['q2'], conversations: ['c2'] }]);
  store.decide(one.id, 'accepted');
  assert.deepEqual(store.list().find((item) => item.id === one.id).quotes, []);
  store.dropQuotes(['c2']);
  const after = store.list().find((item) => item.id === two.id);
  assert.deepEqual(after.quotes, []);
  assert.equal(after.quotesGone, true);
  assert.equal(after.state, 'waiting', 'the proposal itself still waits for you');
});

// ---- the add-on in a stand-in app -------------------------------------------------------------

function standIn({ modes = true, where = 'http://127.0.0.1:9000/v1', allowInternet = false, answer, mission, reconExports, extra = {}, tuning } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'architect-'));
  const config = { enabled: true, readingModel: JSON.stringify({ provider: 'own', model: 'reader' }), allowInternet, nolearn: '[]', projectsOff: '[]' };
  let provider;
  let route;
  const memory = [];
  const rules = [];
  const sent = [];
  const erased = [];
  const answer2 = (text) => ({ type: 'assistant/message', data: { message: { content: [{ type: 'text', text }] } } });
  const user = (text) => ({ type: 'user/message', data: { message: { content: [{ type: 'text', text }], source: { kind: 'user' } } } });
  const sessions = {
    c1: { header: { id: 'c1', cwd: '/w/books' }, events: [answer2('Dates: 1 May.'), user('No, I said June.')] },
    r1: { header: { id: 'r1', cwd: '/private/tmp/dsh-recon-room' }, events: [answer2('x'), user('No, wrong.')] },
    i1: { header: { id: 'i1', cwd: '/w/x' }, events: [answer2('x'), user('No, wrong.')] },
    // A conversation that received an export from Recon, read with Recon switched off.
    e1: { header: { id: 'e1', cwd: '/w/books' }, events: [user('[Recon export 2026-11-16, report packet]\nClaims: …'), answer2('Dates: 1 May.'), user('No, I said June.')] },
    ...Object.fromEntries(Object.entries(extra).map(([id, text]) => [id, { header: { id, cwd: '/w/books' }, events: [user(text), answer2('Dates: 1 May.'), user('No, I said June.')] }])),
  };
  const services = {
    dshHomePath: (name) => join(home, name),
    settings: {
      describe: () => [...(modes ? [{ ns: 'modes', value: { sessionIsolated: JSON.stringify({ i1: true }) } }] : []), { ns: 'llm-pi-ai', value: { providers: { own: { baseURL: where } } } }],
      mutate: async (_ns, ops) => { for (const op of ops) config[op.path[0]] = op.value; },
    },
    modes: { get: () => 'code', isolated: (id) => id === 'i1' },
    sessionQuery: { listSessions: async () => Object.values(sessions).map((item) => ({ header: item.header })), readSession: async (id) => ({ session: sessions[id].header, inheritedEventCount: 0, events: sessions[id].events }) },
    llm: { stream: async function* (request) { sent.push(request.messages[0].content[0].text); yield { type: 'text-delta', text: answer ?? '{"proposals":[{"kind":"skill","name":"check-dates","description":"When dates matter","text":"Check the month the user gave.","reach":"all","from":["1.1"],"why":"You corrected a month."},{"kind":"fact","text":"Plans in June.","from":["1.1"]},{"kind":"rule","text":"Dates in this project are in June.","reach":"project","from":["1.1"]}]}' }; yield { type: 'finish', reason: { kind: 'stop' } }; } },
    memoryStore: { add: (text) => memory.push(text) },
    coworkProjects: { appendRule: (folder, text) => rules.push([folder, text]) },
    skills: {},
    agents: { list: () => [] },
    ...(mission ? { mission } : {}),
    ...(reconExports ? { reconExports } : {}),
    ...(tuning ? { tuning } : {}),
  };
  services.skills = { list: async () => [{ name: 'pdf', provider: 'filesystem' }], registerProvider: (make) => { provider = make({ invalidate: () => {} }); return () => {}; } };
  const ctx = {
    get: (name) => services[name],
    effect: (make) => make(),
    provide: () => {},
    on: () => {},
    logger: { warn: () => {}, info: () => {} },
    inject: (deps, fn) => fn({
      effect: (make) => make(),
      ...services,
      commands: { register: () => () => {} },
      webServer: { register: (spec) => { if (spec.path === DATA_PATH) route = spec.handler; return () => {}; } },
      connection: { requestRejection: () => undefined },
      coworkTrash: { onErased: (fn2) => { erased.push(fn2); return () => {}; } },
    }),
  };
  apply(ctx, config);
  const post = async (body) => {
    const chunks = [Buffer.from(JSON.stringify(body))];
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await route({ method: 'POST', headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } }, res);
    return { status: res.statusCode, json: out ? JSON.parse(out) : null };
  };
  return { home, provider: () => provider, post, memory, rules, sent, erased, config, done: () => rmSync(home, { recursive: true, force: true }) };
}

test('the learning loop: reads only what may be read, proposes, and files only what you accept', async () => {
  const app = standIn();
  try {
    const found = await app.post({ action: 'candidates' });
    assert.equal(found.status, 200, JSON.stringify(found.json));
    assert.deepEqual(found.json.candidates.map((item) => item.id), ['c1'], 'never Recon\'s room, never an isolated conversation');
    const learned = await app.post({ action: 'learn' });
    assert.equal(learned.status, 200, JSON.stringify(learned.json));
    assert.doesNotMatch(app.sent[0], /recon/i);
    const waiting = learned.json.proposals.filter((item) => item.state === 'waiting');
    assert.equal(waiting.length, 3);
    assert.deepEqual(await app.provider().list({}), [], 'nothing is installed before your yes');
    for (const proposal of waiting) {
      const done = await app.post({ action: 'accept', id: proposal.id });
      assert.equal(done.status, 200, JSON.stringify(done.json));
    }
    assert.deepEqual((await app.provider().list({ cwd: '/w/books' })).map((skill) => skill.name), ['check-dates']);
    assert.deepEqual(await app.provider().list({ cwd: '/private/tmp/dsh-recon-room' }), [], 'Recon\'s room never gets a learned skill');
    const body = await app.provider().get({ locator: 'check-dates' }, { cwd: '/w/books' });
    assert.equal(body.content, 'Check the month the user gave.');
    assert.deepEqual(app.memory, ['Plans in June.']);
    assert.deepEqual(app.rules, [['/w/books', 'Dates in this project are in June.']], 'the rule goes to the project the conversation was in');
    // A project that starts clean gets none.
    await app.post({ action: 'projectOff', folder: '/w/books', on: true });
    assert.deepEqual(await app.provider().list({ cwd: '/w/books' }), []);
  } finally {
    app.done();
  }
});

test('nothing is read without Modes; an internet reading model needs your yes and a look first', async () => {
  const blind = standIn({ modes: false });
  try {
    const found = await blind.post({ action: 'candidates' });
    assert.equal(found.json.known, false);
    assert.match(found.json.reason, /Nothing is read/);
  } finally {
    blind.done();
  }
  const cloud = standIn({ where: 'https://api.example.com/v1' });
  try {
    assert.match((await cloud.post({ action: 'learn' })).json.error, /on the internet\. Allow that/);
    cloud.config.allowInternet = true;
    assert.match((await cloud.post({ action: 'learn' })).json.error, /See what would be sent first/);
    const preview = await cloud.post({ action: 'preview' });
    assert.equal(preview.json.preview.where, 'cloud');
    assert.match(preview.json.preview.text, /No, I said June\./);
    assert.equal(cloud.sent.length, 0, 'the preview sends nothing');
    assert.equal((await cloud.post({ action: 'learn', seen: true })).status, 200);
    assert.equal(cloud.sent.length, 1);
  } finally {
    cloud.done();
  }
});

test('"never learn from this" leaves a conversation out; deleting it for good drops its quotes', async () => {
  const app = standIn();
  try {
    await app.post({ action: 'learn' });
    await app.post({ action: 'nolearn', sessionId: 'c1', on: true });
    const found = await app.post({ action: 'candidates' });
    assert.deepEqual(found.json.candidates, []);
    assert.ok(found.json.left.some((item) => item.id === 'c1' && /never learn/.test(item.why)));
    await app.erased[0](['c1']);
    const after = await app.post({ action: 'candidates' });
    assert.ok(after.json.proposals.every((item) => item.quotes.length === 0));
  } finally {
    app.done();
  }
});

test('finished Mission runs with stuck items are read too, never one in Recon\'s room', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const app = standIn();
  try {
    const folder = join(app.home, 'work');
    mkdirSync(join(folder, '.dsh-mission', 'runs', 'r1'), { recursive: true });
    writeFileSync(join(folder, '.dsh-mission', 'runs', 'r1', 'run.json'), JSON.stringify({ items: [{ title: 'Fix the parser', status: 'stuck', tries: 3, note: 'Its command did not pass.' }, { title: 'Easy one', status: 'verified', tries: 1 }] }));
    mkdirSync(join(app.home, 'mission'), { recursive: true });
    writeFileSync(join(app.home, 'mission', 'runs.jsonl'), `${JSON.stringify({ id: 'r1', folder })}\n${JSON.stringify({ id: 'r2', folder: '/tmp/dsh-recon-room' })}\n`);
    const preview = await app.post({ action: 'preview' });
    assert.match(preview.json.preview.text, /A Mission run's item "Fix the parser" took 3 tries and was not finished/);
    assert.doesNotMatch(preview.json.preview.text, /Easy one/);
  } finally {
    app.done();
  }
});

test('the schedule is off unless chosen, and shows its state', async () => {
  const app = standIn();
  try {
    const view = await app.post({ action: 'candidates' });
    assert.equal(view.json.schedule, 'off');
    assert.equal(view.json.lastRun, 0);
  } finally {
    app.done();
  }
});

test('the work loop learns (plan step S8): a run with the loop is read with its recipe and its checker\'s words, never a Bench run; a recipe change is saved only with your yes, through Mission', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const saved = [];
  const recipe = { id: 'research-question', name: 'Research, sources first', kind: 'research', when: ['research'], steps: [{ role: 'helper', does: 'Open each source before citing it.', check: 'Every cited page was opened.' }], stop: 'All answered.' };
  const app = standIn({
    answer: JSON.stringify({ proposals: [
      { kind: 'recipe', text: 'Open sources before citing them.', recipe, from: ['1.1'], why: 'The checker kept sending items back.' },
      { kind: 'recipe', text: 'no object', from: ['1.1'] },
      { kind: 'recipe', text: 'take every goal', recipe: { ...recipe, id: 'code-change', name: 'Harmless', when: ['the', 'a'] }, from: ['1.1'] },
      { kind: 'recipe', text: 'short words', recipe: { ...recipe, id: 'code-change', when: ['fix', 'go'] }, from: ['1.1'] },
      { kind: 'version', text: 'Lower the temperature of the checker version to 0.1.', from: ['1.1'] },
    ] }),
    mission: {
      saveRecipe: (value) => { saved.push(value); return { name: value.name, version: 2, kept: 'old/research-question-v1-1.json' }; },
      recipe: (id) => (id === 'research-question' ? { id, name: 'A research question', kind: 'research', version: 1, when: ['research', 'sources'], steps: [{ role: 'helper', does: 'Search and read.', check: 'Sources opened.' }], stop: 'All answered.' } : undefined),
    },
  });
  try {
    const folder = join(app.home, 'work');
    const write = (id, run) => {
      mkdirSync(join(folder, '.dsh-mission', 'runs', id), { recursive: true });
      writeFileSync(join(folder, '.dsh-mission', 'runs', id, 'run.json'), JSON.stringify(run));
    };
    write('r1', { status: 'complete', items: [{ title: 'Find who said it', status: 'reviewed', tries: 1, note: 'Checker: These sources were cited but never opened in this run: https://x.example' }], loop: { kind: 'research', depth: 'standard', ultra: true, recipe: { id: 'research-question', name: 'A research question', steps: [{ role: 'helper', does: 'Search and read.', check: 'Sources opened.' }] }, checks: { passed: 1, failed: 2 }, escalations: 1 } });
    write('b1', { status: 'complete', long: { bench: { checks: true } }, items: [{ title: 'Read the router', status: 'stuck', tries: 3, note: 'Device said: admin password hunter2' }], loop: { kind: 'open', checks: { passed: 0, failed: 1 } } });
    mkdirSync(join(app.home, 'mission'), { recursive: true });
    writeFileSync(join(app.home, 'mission', 'runs.jsonl'), `${JSON.stringify({ id: 'r1', folder })}\n${JSON.stringify({ id: 'b1', folder })}\n`);
    const preview = await app.post({ action: 'preview' });
    assert.match(preview.json.preview.text, /A Mission run used the work loop: kind research, Depth standard, Ultra Code on, recipe "research-question"/);
    assert.match(preview.json.preview.text, /Its checks: 1 passed, 2 failed; 1 steps went up/);
    assert.match(preview.json.preview.text, /the checker sent back the item "Find who said it": Checker: These sources were cited but never opened/);
    assert.doesNotMatch(preview.json.preview.text, /router|hunter2/, 'a Bench run is never read');
    const learned = await app.post({ action: 'learn' });
    const waiting = learned.json.proposals.filter((item) => item.state === 'waiting');
    assert.deepEqual(waiting.map((item) => item.kind), ['recipe', 'version'], 'a recipe without its object, or whose words would take every goal, is dropped (review finding 5)');
    // The page shows what a change replaces: the file, its version, the words that pick it.
    const view = await app.post({ action: 'candidates' });
    const shown = view.json.proposals.find((item) => item.kind === 'recipe' && item.state === 'waiting');
    assert.deepEqual([shown.replaces.id, shown.replaces.version, shown.replaces.when], ['research-question', 1, ['research', 'sources']]);
    const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
    assert.match(client, /`Replaces recipes\/\$\{now\.id\}\.json, version \$\{now\.version\}/);
    assert.match(client, /`Picked for goals with: \$\{/);
    assert.match(client, /`Answer shape: \$\{recipe\.shape\.join/);
    assert.equal(saved.length, 0, 'nothing saved before your yes');
    const done = await app.post({ action: 'accept', id: waiting[0].id });
    assert.equal(done.status, 200, JSON.stringify(done.json));
    assert.deepEqual(saved, [recipe]);
    const version = await app.post({ action: 'accept', id: waiting[1].id });
    assert.match(JSON.stringify(version.json), /Change it yourself on Settings → Model Tiers → Model versions/);
  } finally {
    app.done();
  }
});

test('text exported from Recon never reaches learned skills: such a conversation and its runs are left out, also when Recon cannot answer', async () => {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  let broken = false;
  const app = standIn({ reconExports: { apiVersion: 1, has: (id) => { if (broken) throw new Error('no'); return id === 'c1' || id === 'x1'; }, addressesOf: () => [] } });
  try {
    const found = await app.post({ action: 'candidates' });
    assert.deepEqual(found.json.candidates.map((item) => item.id), [], 'c1 received an export: left out');
    assert.match(JSON.stringify(found.json), /it received an export from Recon/);
    const folder = join(app.home, 'work');
    const write = (id) => {
      mkdirSync(join(folder, '.dsh-mission', 'runs', id), { recursive: true });
      writeFileSync(join(folder, '.dsh-mission', 'runs', id, 'run.json'), JSON.stringify({ items: [{ title: `Item of ${id}`, status: 'stuck', tries: 3, note: 'n' }] }));
    };
    for (const id of ['r1', 'r2', 'r3']) write(id);
    mkdirSync(join(app.home, 'mission'), { recursive: true });
    writeFileSync(join(app.home, 'mission', 'runs.jsonl'), [{ id: 'r1', folder, conversation: 'x1' }, { id: 'r2', folder, conversation: 'ok1' }, { id: 'r3', folder }].map((line) => JSON.stringify(line)).join('\n'));
    const preview = await app.post({ action: 'preview' });
    assert.match(preview.json.preview.text, /Item of r2/);
    assert.doesNotMatch(preview.json.preview.text, /Item of r1/, 'a run of an exported-to conversation');
    assert.doesNotMatch(preview.json.preview.text, /Item of r3/, 'a run that does not say its conversation, while the door is there');
    broken = true;
    const failing = await app.post({ action: 'preview' });
    assert.doesNotMatch(JSON.stringify(failing.json), /Item of r2/, 'Recon cannot answer: left out');
  } finally {
    app.done();
  }
});

test('an export from Recon in a conversation\'s messages keeps it out, also with Recon switched off; Recon\'s own detector counts too, and a detector that fails leaves it out', async () => {
  const off = standIn({ extra: { e2: 'Notes.\n- [S1] A page\n  origin: Recon · lane: onion · exported 2026-11-16' } });
  try {
    const found = await off.post({ action: 'candidates' });
    assert.deepEqual(found.json.candidates.map((item) => item.id), ['c1'], 'e1 and e2 carry an export: left out without any Recon service');
    // A Mission run whose goal carries an export is left out too.
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const folder = join(off.home, 'work');
    for (const [id, goal] of [['r1', '[Recon export 2026-11-16, report packet]\nFind more'], ['r2', 'Fix the parser']]) {
      mkdirSync(join(folder, '.dsh-mission', 'runs', id), { recursive: true });
      writeFileSync(join(folder, '.dsh-mission', 'runs', id, 'run.json'), JSON.stringify({ goal, items: [{ title: `Item of ${id}`, status: 'stuck', tries: 3, note: 'n' }] }));
    }
    mkdirSync(join(off.home, 'mission'), { recursive: true });
    writeFileSync(join(off.home, 'mission', 'runs.jsonl'), [{ id: 'r1', folder }, { id: 'r2', folder }].map((line) => JSON.stringify(line)).join('\n'));
    const preview = await off.post({ action: 'preview' });
    assert.match(preview.json.preview.text, /Item of r2/);
    assert.doesNotMatch(preview.json.preview.text, /Item of r1/);
  } finally {
    off.done();
  }
  let fail = false;
  const on = standIn({ extra: { e3: 'pasted: SECRET-MARK 42' }, reconExports: { apiVersion: 1, has: () => false, addressesOf: () => [], isExport: (text) => { if (fail) throw new Error('no'); return text.includes('SECRET-MARK'); } } });
  try {
    assert.deepEqual((await on.post({ action: 'candidates' })).json.candidates.map((item) => item.id).sort(), ['c1'], 'Recon\'s detector finds e3');
    fail = true;
    assert.deepEqual((await on.post({ action: 'candidates' })).json.candidates.map((item) => item.id), [], 'a detector that fails: nothing read');
  } finally {
    on.done();
  }
  // Recon's own detector as it ships: inText(text) → { ids }.
  const shipped = standIn({ extra: { e3: 'pasted: SECRET-MARK 42' }, reconExports: { apiVersion: 1, has: () => false, addressesOf: () => [], inText: (text) => ({ ids: text.includes('SECRET-MARK') ? ['x'] : [], addresses: [], text: '' }) } });
  try {
    assert.deepEqual((await shipped.post({ action: 'candidates' })).json.candidates.map((item) => item.id).sort(), ['c1'], 'Recon\'s inText finds e3');
  } finally {
    shipped.done();
  }
});

const until = async (check) => {
  for (let index = 0; index < 200; index += 1) {
    if (await check()) return;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error('timed out');
};

test('Tuning Plus\'s exam: tried in the background (the page is not held); a skill worse on the owner\'s exam is not added unless the owner presses Add anyway; no exam, as before', async () => {
  const asked = [];
  let finish;
  const tuning = { apiVersion: 1, examGate: (input) => { asked.push(input); return new Promise((done) => { finish = done; }); } };
  const app = standIn({ tuning });
  try {
    const learned = await app.post({ action: 'learn' });
    const skill = learned.json.proposals.find((item) => item.kind === 'skill');
    // Accept answers at once while the exam is still going.
    const started = Date.now();
    const accepted = await Promise.race([app.post({ action: 'accept', id: skill.id }), new Promise((done) => setTimeout(() => done('held'), 500))]);
    assert.notEqual(accepted, 'held', 'the request is not held open for the exam');
    assert.ok(Date.now() - started < 500);
    assert.match(accepted.json.said, /Trying "check-dates" on your own exam first \(Tuning Plus\), with reader/);
    const card = () => app.post({ action: 'candidates' }).then((out) => out.json.proposals.find((item) => item.id === skill.id));
    assert.equal((await card()).examRunning, true, 'the page shows it is being tried');
    assert.match((await app.post({ action: 'accept', id: skill.id })).json.said, /being tried/, 'a second Accept does not start it again');
    assert.equal(asked.length, 1);
    assert.deepEqual(asked[0].route, { provider: 'own', model: 'reader' }, 'the reading model is examined');
    assert.match(asked[0].after, /Check the month the user gave/);
    // Worse: not added, the result kept on the card.
    finish({ ok: false, why: 'worse on the owner\'s exam: 40% against 60% with today\'s instructions' });
    await until(async () => (await card()).examRunning === false);
    const after = await card();
    assert.equal(after.state, 'waiting');
    assert.equal(after.exam.ok, false);
    assert.deepEqual(await app.provider().list({ cwd: '/w/books' }), []);
    // Add anyway: the owner's call; the exam is not asked again.
    const forced = await app.post({ action: 'accept', id: skill.id, anyway: true });
    assert.equal(forced.status, 200, JSON.stringify(forced.json));
    assert.equal(asked.length, 1);
    assert.deepEqual((await app.provider().list({ cwd: '/w/books' })).map((one) => one.name), ['check-dates']);
  } finally {
    finish?.(undefined);
    app.done();
  }
  // Not worse: added once the exam is done; no exam (undefined) or a broken exam: added as before.
  for (const answer of [{ ok: true, why: '62% against 60% with today\'s instructions' }, undefined, 'throw']) {
    const other = standIn({ tuning: { apiVersion: 1, examGate: async () => { if (answer === 'throw') throw new Error('exam down'); return answer; } } });
    try {
      const learned = await other.post({ action: 'learn' });
      const skill = learned.json.proposals.find((item) => item.kind === 'skill');
      assert.equal((await other.post({ action: 'accept', id: skill.id })).status, 200);
      await until(async () => (await other.provider().list({ cwd: '/w/books' })).length === 1);
      if (answer?.ok) assert.match((await other.provider().get({ locator: 'check-dates' }, { cwd: '/w/books' })).content, /Check the month/);
    } finally {
      other.done();
    }
  }
  // Tuning Plus not there: added at once, as before.
  const plain = standIn();
  try {
    const learned = await plain.post({ action: 'learn' });
    const skill = learned.json.proposals.find((item) => item.kind === 'skill');
    assert.match((await plain.post({ action: 'accept', id: skill.id })).json.said, /^The skill "check-dates" is added\.$/);
  } finally {
    plain.done();
  }
});
