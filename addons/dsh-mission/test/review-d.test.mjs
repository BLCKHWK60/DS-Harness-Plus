/**
 * Mission stage D, after its review (20 November 2026): holds of parked items after a continue, the lap checkpoint with
 * several helpers, an Allow that came while its helper still worked, "Allow for this item" for several items or none,
 * the approvals limit, a question's parks, the retry time, and a Restricted command allowed exactly.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { APPROVALS_KEEP, APPROVALS_MAX, addApproval, applyPlan, applyWork, decideApproval, newRun } from '../lib/run.js';
import { PLAN, bench, holdItems, tick } from './bench-pool.mjs';

const longRun = () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Restricted', root: '/x', limits: {}, checkpoint: 1, kind: 'long', long: { minutes: 60, laps: 3 } });
  applyPlan(run, { items: [{ title: 'one' }, { title: 'two' }, { title: 'three' }] });
  return run;
};

test('a continue holds the files of items that still wait again: another helper cannot overwrite their kept work', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do two small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 2 } });
    await app.step();
    await tick(30);
    const run = app.runner.runOf('conv');
    const file = join(app.root, 'a.txt');
    app.claims.claim('conv', [file], { item: '1', lane: run.items[0].lane });
    await app.release('Mission: item 1', 'NEEDS ANSWER: Which colour? | IF NO ANSWER: blue');
    await app.release('Mission: item 2', 'NEEDS ANSWER: Which size? | IF NO ANSWER: big');
    assert.deepEqual(app.claims.holder('conv', file), { item: '1', lane: '', hold: true });
    app.runner.end(app.agent);
    await tick(20);
    const size = run.questions.find((question) => /size/.test(question.text));
    await app.runner.continueRun(app.agent, { answers: [{ id: size.id, text: 'small' }], minutes: 30 });
    await tick(30);
    assert.equal(run.items[0].status, 'parked', 'item 1 still waits for its answer');
    assert.deepEqual(app.claims.holder('conv', file), { item: '1', lane: '', hold: true }, 'its file is held for it again');
    assert.equal(app.claims.claim('conv', [file], { item: '2', lane: 'Lx' }).ok, false, 'another item cannot take it');
  } finally {
    app.done();
  }
});

test('several helpers: a lap undone (or continued in the same lap) gets a new start-of-lap checkpoint, so the gate can undo it again', async () => {
  const marks = [];
  const points = { take: async (label) => { if (/start of lap/.test(label)) marks.push(label); return { id: 'p', number: 10 + marks.length }; }, files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '', since: async () => ({ changed: [], deleted: [], added: [] }), back: async () => ({ saved: 9 }) };
  const app = bench({ points, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }, { title: 'three' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'do three small things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 2 } });
    const run = app.runner.runOf('conv');
    run.long.checksPassedOnce = true;
    await app.step();
    await tick(30);
    assert.equal(marks.length, 1, 'one checkpoint for the lap, before its first write');
    assert.ok(run.long.lapPoint > 0);
    // The lap gate undid the lap (doChecks): the point is let go and the items open again, in the same lap.
    run.long.lapPoint = 0;
    await app.release('Mission: item 1');
    await tick(30);
    assert.equal(marks.length, 2, 'the next lane of the same lap takes a new one');
    assert.ok(run.long.lapPoint > 0, 'so the gate can undo the lap again');
    // A continue in the same lap: the end let the point go (reviveRun), so the continued lap is marked again.
    await app.release('Mission: item 2', 'NEEDS ANSWER: Which colour? | IF NO ANSWER: blue');
    app.runner.end(app.agent);
    await tick(20);
    const before = marks.length;
    const lap = run.long.lap;
    const colour = run.questions.find((question) => /colour/.test(question.text));
    const out = await app.runner.continueRun(app.agent, { answers: [{ id: colour.id, text: 'red' }], minutes: 30 });
    assert.equal(out.ran, true);
    assert.equal(run.long.lapPoint, 0, 'the continue let the point go');
    await app.step();
    await tick(30);
    assert.equal(run.long.lap, lap, 'the same lap');
    assert.equal(marks.length, before + 1, 'a continue in the same lap marks it again');
    assert.ok(run.long.lapPoint > 0);
  } finally {
    app.done();
  }
});

test('an Allow that came while the asking helper still worked: when the item then passes, it is opened again to do that step', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'make X and update config Y' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'set the config', { mode: 'restricted', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(30);
    const helper = app.seen.find((entry) => entry.label === 'Mission: item 1').childId;
    app.runner.parkFor(helper, { kind: 'files', key: 'files:config.json', what: 'Change config.json', files: ['config.json'] });
    // The owner allows it at once, while the helper still works on X.
    assert.deepEqual(app.runner.approve('conv', 'a1', 'allow').reopened, []);
    await app.release('Mission: item 1', 'DONE: made X');
    const run = app.runner.runOf('conv');
    const item = run.items[0];
    assert.notEqual(item.status, 'unverified', 'not left done without the allowed step');
    assert.equal(item.tries, 0, 'no try used for the step');
    await app.release('Mission: item 2');
    const again = app.seen.filter((entry) => entry.label === 'Mission: item 1').at(-1);
    assert.match(again.prompt, /The user allowed: Change config\.json\. Do only that step now\./);
  } finally {
    app.done();
  }
});

test('Allow for this item on a tool two items asked for: both may use it, and one item being done does not take it from the other', async () => {
  const revoked = [];
  const granted = [];
  const app = bench({
    grants: { grant: async (id, tool) => { granted.push(tool); return { ok: true, id: `g${granted.length}` }; }, revoke: async (id) => { revoked.push(id); } },
    answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }, { title: 'three' }]) } : holdItems(spec)),
  });
  try {
    await app.runner.start(app.agent, 'research a thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 3 } });
    const run = app.runner.runOf('conv');
    applyPlan(run, { items: [{ title: 'one' }, { title: 'two' }, { title: 'three' }] });
    for (const item of run.items.slice(0, 2)) {
      item.status = 'parked';
      item.parkedOn = ['a1'];
    }
    run.approvals = [{ id: 'a1', kind: 'tool', what: 'Use Web fetch', key: 'tool:web_fetch', tool: 'web_fetch', plain: 'Web fetch', items: ['1', '2'], by: '', status: 'open', choices: [{ id: 'item', label: 'Allow for this item' }, { id: 'mission', label: 'Allow for this Mission' }, { id: 'deny', label: 'Deny' }], after: 'park', askedAt: 1 }];
    app.runner.approve('conv', 'a1', 'item');
    assert.deepEqual(app.runner.itemToolOwners('conv', 'web_fetch').sort(), ['1', '2'], 'every item that asked may use it');
    await app.step();
    await tick(30);
    assert.deepEqual(granted, ['web_fetch'], 'one permission for both');
    await app.release('Mission: item 2');
    assert.deepEqual(revoked, [], 'item 1 still works: not taken back');
    assert.deepEqual(app.runner.itemToolOwners('conv', 'web_fetch'), ['1'], 'item 2 is done: only item 1 now');
    await app.release('Mission: item 1');
    assert.deepEqual(revoked, ['g1'], 'taken back when the last of them is done');
    assert.deepEqual(app.runner.itemToolOwners('conv', 'web_fetch'), []);
    assert.equal(run.approvals[0].spent, true);
  } finally {
    app.done();
  }
});

test('Allow for this item is offered only when items asked: never for the plan, the question pass or the review', () => {
  const run = longRun();
  const plan = addApproval(run, { kind: 'tool', key: 'tool:web_search', what: 'Use Search', tool: 'web_search', plain: 'Search', by: 'plan' }).entry;
  assert.deepEqual(plan.choices.map((choice) => choice.id), ['mission', 'deny']);
  assert.throws(() => decideApproval(run, plan.id, 'item'), /Pick one of the choices on the card\./);
  // The plan asked first, an item later: still only for the Mission.
  addApproval(run, { kind: 'tool', key: 'tool:web_search', what: 'Use Search', tool: 'web_search', item: '2' });
  assert.deepEqual(plan.choices.map((choice) => choice.id), ['mission', 'deny']);
  // An item asked first, the review later: "for this item" goes.
  const fetch = addApproval(run, { kind: 'tool', key: 'tool:web_fetch', what: 'Use Fetch', tool: 'web_fetch', item: '1' }).entry;
  assert.deepEqual(fetch.choices.map((choice) => choice.id), ['item', 'mission', 'deny']);
  addApproval(run, { kind: 'tool', key: 'tool:web_fetch', what: 'Use Fetch', tool: 'web_fetch', by: 'review' });
  assert.deepEqual(fetch.choices.map((choice) => choice.id), ['mission', 'deny']);
  // A saved entry from before, with "for this item" and no item: refused.
  run.approvals.push({ id: 'a9', kind: 'tool', key: 'tool:x', what: 'Use X', tool: 'x', items: [], by: 'plan', status: 'open', choices: [{ id: 'item' }, { id: 'mission' }, { id: 'deny' }], after: 'park' });
  assert.throws(() => decideApproval(run, 'a9', 'item'), /Pick one of the choices on the card\./);
});

test('only approvals that still wait count against the limit of 40; answered ones beyond what a run keeps are let go', () => {
  const run = longRun();
  for (let n = 0; n < APPROVALS_MAX; n += 1) {
    const got = addApproval(run, { kind: 'files', key: `files:f${n}.txt`, what: `Change f${n}.txt`, item: '1' });
    assert.equal(got.how, 'new');
    decideApproval(run, got.entry.id, 'allow');
  }
  const next = addApproval(run, { kind: 'files', key: 'files:more.txt', what: 'Change more.txt', item: '1' });
  assert.equal(next.how, 'new', '40 answered: a new one still waits for you');
  for (let n = 0; n < APPROVALS_MAX - 1; n += 1) addApproval(run, { kind: 'files', key: `files:open${n}.txt`, what: 'x', item: '2' });
  assert.equal(addApproval(run, { kind: 'files', key: 'files:one-too-many.txt', what: 'x', item: '2' }).how, 'full', '40 waiting: full');
  // A very long run: the oldest answered ones go; ids are never given twice.
  const many = longRun();
  for (let n = 0; n < APPROVALS_KEEP + 5; n += 1) {
    const got = addApproval(many, { kind: 'files', key: `files:g${n}.txt`, what: 'x', item: '1' });
    decideApproval(many, got.entry.id, 'allow');
  }
  assert.ok(many.approvals.length <= APPROVALS_KEEP);
  const ids = many.approvals.map((entry) => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(ids.at(-1), `a${APPROVALS_KEEP + 5}`);
});

test('an item that stopped a third time for a question is no longer named as waiting for it', () => {
  const run = longRun();
  run.questions.push({ id: 'q1', text: 'A?', status: 'open', items: ['1'], parks: ['1'] });
  for (let n = 0; n < 2; n += 1) {
    applyWork(run, '1', { report: 'r', parked: { on: ['q1'] } });
    run.items[0].status = 'open';
    delete run.items[0].parkedOn;
  }
  applyWork(run, '1', { report: 'r3', parked: { on: ['q1'] } });
  assert.equal(run.items[0].status, 'open');
  assert.deepEqual(run.questions[0].parks, [], 'the card stops saying "Item 1 waits for this answer"');
});

test('several helpers: an item kept out for its retry time is started again when that time is up', async () => {
  const app = bench({ retryAfterMs: 40, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'one thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(30);
    const run = app.runner.runOf('conv');
    // Its step fails outside the helper once (here: noting the attempt), so the item is kept out for its retry time.
    let value = run.items[0].attempts ?? 0;
    let fail = true;
    Object.defineProperty(run.items[0], 'attempts', { configurable: true, enumerable: true, get: () => value, set: (next) => { if (fail) { fail = false; throw new Error('disk full'); } value = next; } });
    await app.release('Mission: item 1');
    const before = app.seen.filter((entry) => entry.label === 'Mission: item 1').length;
    // Nothing else happens in the Mission meanwhile: no step call, no other helper.
    await tick(150);
    assert.ok(app.seen.filter((entry) => entry.label === 'Mission: item 1').length > before, 'the pool is filled again when the retry time is up');
  } finally {
    app.done();
  }
});

test('Restricted: the helper that goes on after a command was allowed gets that command exactly', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'regenerate' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'regenerate', { mode: 'restricted', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(30);
    const helper = app.seen.find((entry) => entry.label === 'Mission: item 1').childId;
    const command = `cat > out.txt <<'EOF'\n${'line of text '.repeat(30)}\nEOF`;
    app.runner.parkFor(helper, { kind: 'command', key: `command:${command.slice(0, 500)}`, what: `Run a command: ${command.replace(/\s+/g, ' ').slice(0, 200)}`, command });
    await app.release('Mission: item 1', 'NEEDS YES: the command');
    app.runner.approve('conv', 'a1', 'allow');
    await app.release('Mission: item 2');
    const again = app.seen.filter((entry) => entry.label === 'Mission: item 1').at(-1);
    assert.ok(again.prompt.includes(`The command the user allowed, exactly (run it as written, unchanged): ${command}`));
  } finally {
    app.done();
  }
});

test('the strip passes Tool access\'s warnings on to the card; the view names only the items that wait for a question now', async () => {
  const { stripOf } = await import('../lib/strip.js');
  const warnings = { risk: 'Highest', recon: 'This is Recon.' };
  const got = stripOf({ run: { kind: 'long', status: 'running', goalPhase: 'active', items: [], questions: [], approvals: [{ id: 'a1', kind: 'tool', what: 'Use X', status: 'open', items: ['1'], choices: [], warnings }] } });
  assert.deepEqual(got.approvals[0].warnings, warnings);
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'two things', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    const run = app.runner.runOf('conv');
    applyPlan(run, { items: [{ title: 'one' }, { title: 'two' }] });
    run.questions.push({ id: 'q1', text: 'A?', status: 'open', items: ['1', '2'], parks: ['1', '2'] });
    run.items[0].status = 'parked';
    run.items[0].parkedOn = ['q1'];
    assert.deepEqual(app.runner.view('conv').questions[0].parks, ['1'], 'item 2 no longer waits for it');
  } finally {
    app.done();
  }
});

test('a tool allowed after the end when nothing needs doing again is not kept: the Mission stays finished and the permission goes back', async () => {
  const revoked = [];
  const app = bench({ grants: { grant: async () => ({ ok: true, id: 'g0' }), revoke: async (id) => { revoked.push(id); } }, answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : { text: spec.label === 'Mission: questions' ? '{"questions": []}' : 'DONE: ok' }) });
  try {
    await app.runner.start(app.agent, 'one thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    const run = app.runner.runOf('conv');
    run.approvals = [{ id: 'a1', kind: 'tool', what: 'Use Search', key: 'tool:web_search', tool: 'web_search', plain: 'Search', items: [], by: 'plan', status: 'open', choices: [{ id: 'mission', label: 'Allow for this Mission' }, { id: 'deny', label: 'Deny' }], after: 'park', askedAt: 1 }];
    app.runner.end(app.agent);
    await tick(20);
    const out = await app.runner.continueRun(app.agent, { answers: [], minutes: 30, approvals: [{ id: 'a1', choice: 'mission' }], applyApprovals: async (given) => { app.runner.approve('conv', 'a1', 'mission', { grantId: 'g9', force: true }); return { reopened: [] }; } });
    assert.equal(out.ran, false, 'nothing to do again');
    await tick(5);
    assert.deepEqual(revoked, ['g9'], 'the permission does not outlive the Mission');
    assert.equal(run.approvals[0].status, 'allowed', 'the answer is recorded');
  } finally {
    app.done();
  }
});
