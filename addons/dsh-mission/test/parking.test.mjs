/**
 * Mission stage D (20 November 2026): parking. A helper whose item truly needs the user's answer (NEEDS ANSWER) or yes
 * (NEEDS YES, an approval it was refused) stops; its work is kept and another helper takes the next item. The answer
 * takes the item up again from where it stopped. "Waiting for you" only when nothing else can move.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { statusOf, workPrompt } from '../lib/prompts.js';
import { addApproval, applyWork, decideApproval, newRun, applyPlan, report, takeUpParked } from '../lib/run.js';
import { stripOf } from '../lib/strip.js';
import { APPROVE, PLAN, bench, holdItems, tick } from './bench-pool.mjs';

test('a worker\'s status line: NEEDS ANSWER with what it would do, NEEDS YES, WAITING FOR FILE; QUESTION stays stage C', () => {
  assert.deepEqual(statusOf('NEEDS ANSWER: Which database? | IF NO ANSWER: SQLite\nI stopped.'), { kind: 'needs-answer', text: 'Which database? | IF NO ANSWER: SQLite', question: 'Which database?', assume: 'SQLite' });
  assert.deepEqual(statusOf('**NEEDS YES:** changing config.json'), { kind: 'needs-yes', text: 'changing config.json' });
  assert.equal(statusOf('WAITING FOR FILE: `src/app.js`').file, 'src/app.js');
  assert.equal(statusOf('QUESTION: Blue? | ASSUMING: blue').kind, 'question');
  const mission = workPrompt({ goal: 'g', item: { id: '1', title: 't', tries: 0 }, long: true });
  assert.match(mission, /NEEDS ANSWER: <your question for the user> \| IF NO ANSWER: <what you would do>/);
  assert.match(mission, /Never try another way to get the same result/);
  assert.match(mission, /some of them at the same time/);
  const old = workPrompt({ goal: 'g', item: { id: '1', title: 't', tries: 0 } });
  assert.doesNotMatch(old, /NEEDS ANSWER/, 'a /mission run of old keeps stage C\'s rule');
});

test('a helper that needs an answer stops; its work is kept; another helper takes the next item; the answer takes it up again from where it stopped', async () => {
  let first = true;
  const app = bench({
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'pick the database' }, { title: 'two' }, { title: 'three' }]) };
      if (spec.label === 'Mission: item 1' && first) {
        first = false;
        return { text: 'NEEDS ANSWER: Postgres or SQLite? | IF NO ANSWER: SQLite\nI wrote the schema in db.sql.' };
      }
      return holdItems(spec);
    },
  });
  try {
    await app.runner.start(app.agent, 'set up the data layer', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(30);
    const run = app.runner.runOf('conv');
    const item = run.items[0];
    assert.equal(item.status, 'parked');
    assert.deepEqual([item.tries, item.parks, item.parkedOn], [0, 1, ['q1']], 'no try used');
    assert.match(item.report, /db\.sql/, 'its work so far is kept');
    assert.deepEqual(run.questions[0].parks, ['1']);
    assert.deepEqual(app.working(), ['Mission: item 2', 'Mission: item 3'], 'the pool stays full');
    const told = await app.step();
    assert.match(told, /waits for the user's answer: Postgres or SQLite\? Its work so far is kept; the other helpers carry on\./);
    await tick();
    assert.ok(app.fired.some((event) => event.type === 'needs-you' && event.waiting === 'question'));
    const view = app.runner.view('conv');
    assert.deepEqual(view.parked.map((entry) => [entry.item, entry.on]), [['1', ['q1']]]);
    const strip = stripOf({ run: { ...view, goalPhase: 'active' } });
    assert.deepEqual([strip.state, strip.pool.parked, strip.questions[0].parks], ['running', 1, ['1']], 'running: other work goes on');
    // The answer: item 1 goes on with it when a helper is free (here: when item 2 finishes).
    const out = app.runner.answerMany('conv', [{ id: 'q1', text: 'Postgres' }]);
    assert.deepEqual(out.goesOn, ['1']);
    assert.equal(item.status, 'open');
    await app.release('Mission: item 2');
    const again = app.seen.filter((entry) => entry.label === 'Mission: item 1').at(-1);
    assert.match(again.prompt, /A helper started this item and stopped to wait for the user\. It reported: NEEDS ANSWER/);
    assert.match(again.prompt, /The user's answer to "Postgres or SQLite\?": Postgres\. Carry on from where it stopped/);
    await app.release('Mission: item 1');
    assert.equal(item.status, 'unverified');
    assert.equal(item.tries, 1);
    assert.equal(item.resume, undefined, 'used once it went on');
  } finally {
    app.done();
  }
});

test('nothing else can move: the Mission waits for you (told once, keep-awake lets go), ends after its wait time, and the card continues it', async () => {
  const app = bench({
    settings: { limits: { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 } },
    answer: (spec) => {
      if (spec.label === 'Mission: planner') return { text: PLAN([{ title: 'pick the colour' }, { title: 'two' }]) };
      if (spec.label === 'Mission: item 1') return { text: 'NEEDS ANSWER: Which colour? | IF NO ANSWER: blue' };
      if (spec.label === 'Mission: item 2') return { text: 'DONE: done' };
      return holdItems(spec);
    },
  });
  try {
    // Point 17: Wait for me is the run's own (3 minutes here); the wait is quiet (the goal paused by Mission).
    await app.runner.start(app.agent, 'paint the page', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 3, helpers: 2, waitFor: 3 } });
    let text = '';
    for (let i = 0; i < 6 && !/waits for the user: only/.test(text); i += 1) text = await app.step(200);
    assert.match(text, /The Mission now waits for the user: only their answers can move it on \(1 question, 0 approvals\)/);
    const run = app.runner.runOf('conv');
    assert.ok(run.long.waitingSince > 0);
    await tick();
    assert.ok(app.fired.some((event) => event.type === 'needs-you' && event.waiting === 'you'));
    const view = app.runner.view('conv');
    assert.equal(view.waitingForYou.until, run.long.waitingSince + 3 * 60_000);
    const strip = stripOf({ run: { ...view, goalPhase: 'active' } });
    assert.deepEqual([strip.state, strip.main, strip.waitUntil], ['waiting', 'note', run.long.waitingSince + 3 * 60_000]);
    assert.equal(app.runner.round(app.agent), false, 'the idle brake does not count while it waits');
    // Its wait time passes with no answer: the goal gets one more round, which gives the report (point 17).
    app.runner.sweep(run.long.waitingSince + 3 * 60_000 + 1, () => app.agent);
    assert.equal(app.goal.phase, 'active', 're-armed for the last round');
    assert.match(await app.step(), /final report/);
    assert.notEqual(run.status, 'running');
    const said = report(run);
    assert.match(said, /It ended because only your answers could move it on, and none came within 3 minutes\./);
    assert.match(said, /1\. \[WAITS FOR YOU\] pick the colour/);
    assert.match(said, /Waiting for your answer:\n- Item 1, "pick the colour": Which colour\? \(its suggestion: blue\)\. To answer it: press Finish it above the chat box\./);
    assert.match(await app.step(), /has ended/, 'the report was given in the last round');
    // Answer and continue: the item goes on from where it stopped.
    assert.equal(app.runner.view('conv').canContinue, true);
    const quote = app.runner.quoteContinue('conv', [{ id: 'q1', text: 'green' }]);
    assert.equal(quote.run, true);
    const goOn = await app.runner.continueRun(app.agent, { answers: [{ id: 'q1', text: 'green' }], minutes: 30 });
    assert.match(goOn.said, /1 item that waited for you goes on from where it stopped\./);
    assert.equal(run.items[0].status, 'open');
    assert.equal(run.long.waitingSince, undefined);
  } finally {
    app.done();
  }
});

test('a question with a safe default still finishes the item on it (stage C), also with several helpers', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : spec.label === 'Mission: item 1' ? { text: 'QUESTION: Tabs or spaces? | ASSUMING: spaces' } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'tidy the code', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(30);
    const run = app.runner.runOf('conv');
    assert.equal(run.items[0].status, 'unverified');
    assert.match(run.items[0].note, /Assumed: spaces/);
    assert.equal(run.questions[0].parks, undefined);
  } finally {
    app.done();
  }
});

test('the third stop of the same item counts as a try, and Skip lets it go on and decide itself', () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/x', limits: {}, checkpoint: 1, kind: 'long', long: { minutes: 60, laps: 3 } });
  applyPlan(run, { items: [{ title: 'one' }] });
  const item = run.items[0];
  run.questions.push({ id: 'q1', text: 'A?', status: 'open', items: ['1'] });
  applyWork(run, '1', { report: 'r1', parked: { on: ['q1'] } });
  assert.deepEqual([item.status, item.tries], ['parked', 0]);
  run.questions[0].status = 'skipped';
  assert.deepEqual(takeUpParked(run).reopened, ['1']);
  applyWork(run, '1', { report: 'r2', parked: { on: ['q1'] } });
  assert.deepEqual([item.status, item.tries, item.parks], ['parked', 0, 2]);
  applyWork(run, '1', { report: 'r3', parked: { on: ['q1'] } });
  assert.deepEqual([item.status, item.tries], ['open', 1], 'counted as blocked: a try used');
  assert.match(item.note, /third time/);
});

test('an approval a helper needs is parked: the item stops; Allow takes it up again; Deny lets it go on without it; asking again after a no is refused', () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Restricted', root: '/x', limits: {}, checkpoint: 1, kind: 'long', long: { minutes: 60, laps: 3 } });
  applyPlan(run, { items: [{ title: 'one' }, { title: 'two' }] });
  const first = addApproval(run, { kind: 'files', key: 'files:a.txt', what: 'Change a.txt', item: '1', files: ['a.txt'] });
  assert.equal(first.how, 'new');
  assert.deepEqual(first.entry.choices.map((choice) => choice.id), ['allow', 'deny']);
  assert.equal(addApproval(run, { kind: 'files', key: 'files:a.txt', what: 'Change a.txt', item: '2' }).entry, first.entry, 'the same thing asked again is the same entry');
  assert.deepEqual(first.entry.items, ['1', '2']);
  applyWork(run, '1', { report: 'did b.txt', parked: { on: ['a1'], kind: 'approval' } });
  assert.equal(run.items[0].status, 'parked');
  assert.throws(() => decideApproval(run, 'a1', 'item'), /Pick one of the choices on the card\./);
  assert.throws(() => decideApproval(run, 'a9', 'allow'), /That approval is not open any more\./);
  const out = decideApproval(run, 'a1', 'deny');
  assert.deepEqual(out.reopened, ['1']);
  assert.deepEqual(run.items[0].resume.answers.map((answer) => answer.kind), ['denied']);
  assert.equal(decideApproval(run, 'a1', 'allow').already, true, 'answered before (two panes)');
  assert.equal(addApproval(run, { kind: 'files', key: 'files:a.txt', what: 'Change a.txt', item: '1' }).how, 'no', 'no new entry after a no');
  // Done except the step that waited: a later Allow reopens it, without a try, to do only that step.
  const tool = addApproval(run, { kind: 'tool', key: 'tool:web_fetch', what: 'Use Web fetch', item: '2', tool: 'web_fetch', plain: 'Web fetch' }).entry;
  assert.deepEqual(tool.choices.map((choice) => choice.label), ['Allow for this item', 'Allow for this Mission', 'Deny']);
  run.items[1].status = 'unverified';
  run.items[1].tries = 1;
  tool.after = 'redo';
  const redo = decideApproval(run, tool.id, 'mission', { grantId: 'g7' });
  assert.deepEqual(redo.reopened, ['2']);
  assert.deepEqual([run.items[1].status, run.items[1].tries, tool.grantId], ['open', 0, 'g7']);
  assert.equal(run.items[1].resume.answers[0].kind, 'redo');
  const cannot = addApproval(run, { kind: 'outside-change', key: 'outside-change:x', what: 'Change outside the folder: x', item: '2', cannot: true });
  assert.equal(cannot.entry.status, 'cannot');
  run.status = 'incomplete';
  const said = report(run);
  assert.match(said, /You said no \(it went on without these\):\n- Change a\.txt \(item 1, 2\)\./);
  assert.match(said, /Not possible for a Mission's helper \(do it yourself if it is needed\):\n- Item 2: Change outside the folder: x\./);
});

test('a helper parks an approval through the runner: its item stops at the end of its step, the card answers it, and the next helper is told', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'edit the config' }, { title: 'two' }]) } : holdItems(spec)) });
  try {
    await app.runner.start(app.agent, 'set the config', { mode: 'restricted', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    await app.step();
    await tick(30);
    // Item 1's helper is refused a change that needs the user's yes (index.js parks it this way), then reports.
    const helper = app.seen.find((entry) => entry.label === 'Mission: item 1').childId;
    assert.equal(app.runner.canPark(helper), true);
    const parked = app.runner.parkFor(helper, { kind: 'files', key: 'files:config.json', what: 'Change config.json', files: ['config.json'] });
    assert.match(parked.text, /it waits in the Mission's card; the other helpers carry on/);
    await app.release('Mission: item 1', 'NEEDS YES: changing config.json');
    const run = app.runner.runOf('conv');
    assert.equal(run.items[0].status, 'parked');
    assert.deepEqual(run.items[0].parkedOn, ['a1']);
    await tick();
    assert.ok(app.fired.some((event) => event.type === 'needs-you' && event.waiting === 'approval'));
    const view = app.runner.view('conv');
    assert.deepEqual(view.approvals.map((entry) => [entry.id, entry.status, entry.askedBy]), [['a1', 'open', [{ id: '1', title: 'edit the config' }]]]);
    assert.deepEqual(stripOf({ run: { ...view, goalPhase: 'active' } }).approvals.map((entry) => entry.what), ['Change config.json']);
    assert.throws(() => app.runner.approve('conv', 'a1', 'item'), /Pick one of the choices/);
    const out = app.runner.approve('conv', 'a1', 'allow');
    assert.deepEqual(out.reopened, ['1']);
    await app.release('Mission: item 2');
    const again = app.seen.filter((entry) => entry.label === 'Mission: item 1').at(-1);
    assert.match(again.prompt, /The user allowed: Change config\.json\. Do it now and finish the item\./);
    // A helper of a Mission that has ended is not asked any more.
    app.runner.end(app.agent);
    assert.equal(app.runner.canPark(again.childId), false);
  } finally {
    app.done();
  }
});

test('Allow for this item: the tool is on while that item\'s helper works and taken back when it is done; for this Mission: taken back at the end', async () => {
  const revoked = [];
  const granted = [];
  const app = bench({
    grants: { grant: async (id, tool) => { granted.push(tool); return { ok: true, id: `g-${tool}` }; }, revoke: async (id) => { revoked.push(id); } },
    answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'look it up' }, { title: 'two' }]) } : holdItems(spec)),
  });
  try {
    await app.runner.start(app.agent, 'research a thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 60, laps: 1, helpers: 2 } });
    const run = app.runner.runOf('conv');
    applyPlan(run, { items: [{ title: 'look it up' }, { title: 'two' }] });
    // Asked by item 1's helper earlier, answered "for this item" (index.js gave it as g-1); a restart took it back.
    run.items[0].status = 'parked';
    run.items[0].parkedOn = ['a1'];
    run.approvals = [{ id: 'a1', kind: 'tool', what: 'Use Web fetch', key: 'tool:web_fetch', tool: 'web_fetch', plain: 'Web fetch', items: ['1'], by: '', status: 'open', choices: [{ id: 'item', label: 'Allow for this item' }, { id: 'mission', label: 'Allow for this Mission' }, { id: 'deny', label: 'Deny' }], after: 'park', askedAt: 1 }];
    app.runner.approve('conv', 'a1', 'item', { grantId: '' });
    assert.deepEqual(app.runner.itemToolOwners('conv', 'web_fetch'), ['1']);
    await app.step();
    await tick(30);
    assert.deepEqual(granted, ['web_fetch'], 'given again when its helper starts');
    assert.match(app.seen.find((entry) => entry.label === 'Mission: item 1').prompt, /The user allowed web_fetch for this item\./);
    await app.release('Mission: item 1');
    assert.deepEqual(revoked, ['g-web_fetch'], 'taken back when it is done');
    assert.deepEqual(app.runner.itemToolOwners('conv', 'web_fetch'), [], 'used up');
    run.approvals.push({ id: 'a2', kind: 'tool', what: 'Use Search', key: 'tool:search', tool: 'search', plain: 'Search', items: [], by: 'plan', status: 'allowed', choice: 'mission', grantId: 'g-search', choices: [], after: 'park', askedAt: 1 });
    app.runner.end(app.agent);
    assert.ok(revoked.includes('g-search'), 'a Mission\'s permission ends with it');
  } finally {
    app.done();
  }
});

test('one helper at once parks too, and waits for you when nothing else can move', async () => {
  const app = bench({ answer: (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : spec.label === 'Mission: item 1' ? { text: 'NEEDS ANSWER: Which one? | IF NO ANSWER: the first' } : { text: APPROVE }) });
  try {
    await app.runner.start(app.agent, 'do a thing', { mode: 'auto', root: app.root }, { kind: 'long', long: { minutes: 0, laps: 2, helpers: 1 } });
    await app.step(); // plan
    assert.match(await app.step(), /waits for the user's answer: Which one\?/);
    assert.match(await app.step(), /review/i);
    assert.match(await app.step(300), /^The Mission now waits for the user/, 'point 17: a quiet wait');
    const run = app.runner.runOf('conv');
    // Point 17: while it waits quietly a call gets the waiting words at once (the conductor is told not to call).
    assert.match(await app.step(2000), /waits for the user/);
    assert.equal(app.goal.phase, 'paused', 'the goal is paused by Mission: no rounds while it waits');
    app.runner.answerMany('conv', [{ id: 'q1', text: 'the second' }]);
    assert.equal(app.goal.phase, 'active', 'the answer gives the goal its rounds again');
    const went = await app.step(2000);
    assert.match(went, /item 1 of 1/, went);
    assert.equal(run.items[0].tries, 1);
  } finally {
    app.done();
  }
});
