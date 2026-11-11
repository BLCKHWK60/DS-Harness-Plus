import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createSessions, readBody, readSettings } from '../index.js';
import { apply, can, EVENTS, freshIdea, guidance, LEVELS, outcomeOf, stageLabel } from '../lib/rules.js';
import { dueIdeas, INTERVALS, schedule, whenText } from '../lib/schedule.js';
import { openStore, readPlan } from '../lib/store.js';
import { SKILLS } from '../skills.js';

const DAY = 86_400_000;
const PLAN = {
  title: 'Binary search',
  source: { kind: 'pdf', ref: 'algorithms.pdf' },
  ideas: [
    { title: 'Halving', question: 'A sorted list has 1,000 numbers. Roughly how many must you look at to find one, and why?' },
    { title: 'Needs sorting', question: 'What goes wrong if the list is not sorted?' },
    { title: 'The loop rule', question: 'What stays true about the part of the list still in play?' },
  ],
};

/** Run events on a state, asserting each is allowed. */
function run(state, ...events) {
  let now = state;
  for (const event of events) {
    assert.equal(can(now, event).ok, true, `${event} should be allowed: ${can(now, event).why}`);
    now = apply(now, event);
  }
  return now;
}
const idea = (level) => ({ level, ...freshIdea() });

test('Firm: an attempt first, hints one at a time, the answer after three hints or giving up', () => {
  let state = idea('firm');
  assert.match(can(state, 'hint').why, /has not tried yet/);
  assert.match(can(state, 'answer_shown').why, /has not tried yet/);
  assert.match(can(state, 'giveup').why, /Try it once first/);
  assert.match(can(state, 'solved').why, /Record the attempt first/);

  state = run(state, 'attempt');
  assert.equal(state.stage, 'work');
  assert.match(can(state, 'answer_shown').why, /Give the next hint \(0 of 3 so far\)/);
  state = run(state, 'hint', 'attempt', 'hint');
  assert.match(can(state, 'answer_shown').why, /2 of 3/);
  state = run(state, 'hint');
  assert.match(can(state, 'hint').why, /All 3 hints/);
  state = run(state, 'answer_shown');
  assert.equal(state.stage, 'shown');
  assert.match(can(state, 'next').why, /explain it back/);
  state = run(state, 'explained');
  assert.equal(outcomeOf(state), 'shown');
  assert.equal(can(state, 'next').ok, true);

  // Giving up after one try unlocks the answer without the three hints.
  const quit = run(idea('firm'), 'attempt', 'giveup', 'answer_shown', 'explained');
  assert.equal(outcomeOf(quit), 'shown');

  // Solved after one hint counts as "with hints"; solved straight away as "alone".
  assert.equal(outcomeOf(run(idea('firm'), 'attempt', 'hint', 'attempt', 'solved', 'explained')), 'hints');
  assert.equal(outcomeOf(run(idea('firm'), 'attempt', 'solved', 'explained')), 'alone');
  assert.match(can(run(idea('firm'), 'attempt', 'solved'), 'hint').why, /already finished/);
});

test('Strict: say where you are stuck before each hint, no giving up, one more try before the answer', () => {
  let state = run(idea('strict'), 'attempt');
  assert.match(can(state, 'hint').why, /says where they are stuck/);
  assert.match(can(state, 'giveup').why, /no giving up early/);
  state = run(state, 'stuck', 'hint');
  assert.match(can(state, 'hint').why, /says where they are stuck/, 'being stuck must be said again for the next hint');
  state = run(state, 'attempt', 'stuck', 'hint', 'stuck', 'hint');
  assert.match(can(state, 'answer_shown').why, /one more attempt after the last hint/);
  state = run(state, 'attempt', 'answer_shown', 'explained');
  assert.equal(outcomeOf(state), 'shown');
});

test('Gentle: everything on request, and explaining back is optional', () => {
  let state = idea('gentle');
  for (const event of ['hint', 'giveup', 'answer_shown']) assert.equal(can(state, event).ok, true, event);
  state = run(state, 'answer_shown');
  assert.equal(can(state, 'next').ok, true);
  assert.equal(can(idea('nonsense'), 'hint').ok, false, 'an unknown level is treated as Firm');
  assert.equal(can(idea('firm'), 'dance').ok, false);
});

test('the tutor is told the stage and the rule, and never to reveal early', () => {
  const about = { title: 'Binary search', source: { kind: 'pdf', ref: 'algorithms.pdf' }, total: 3, at: 0, review: false };
  const first = guidance(idea('firm'), PLAN.ideas[0], about);
  assert.match(first, /## Study session: Binary search/);
  assert.match(first, /idea 1 of 3: "Halving"/);
  assert.match(first, /Rule in force: Firm/);
  assert.match(first, /put the question to the learner before explaining anything: "A sorted list has 1,000 numbers/);
  assert.match(first, /Source: algorithms\.pdf.*give the page/);
  assert.match(first, /decline kindly and ask for their best guess/);

  const working = guidance(run(idea('firm'), 'attempt', 'hint'), PLAN.ideas[0], about);
  assert.match(working, /Say what is right in the attempt/);
  assert.match(working, /give hint 2 of 3, which is a pointer/);
  assert.doesNotMatch(working, /you may now give the answer/);
  assert.match(guidance(run(idea('firm'), 'attempt', 'hint', 'hint', 'hint'), PLAN.ideas[0], about), /you may now give the answer/);
  assert.match(guidance(run(idea('firm'), 'attempt', 'giveup'), PLAN.ideas[0], about), /has given up on this one\. Give the full answer now/);
  assert.doesNotMatch(guidance(run(idea('firm'), 'attempt', 'giveup'), PLAN.ideas[0], about), /Do not give the answer/);
  assert.match(guidance(run(idea('strict'), 'attempt', 'stuck', 'hint', 'stuck', 'hint', 'stuck', 'hint'), PLAN.ideas[0], about), /Ask for one more attempt/);
  assert.match(guidance(run(idea('firm'), 'attempt', 'solved'), PLAN.ideas[0], about), /Fill in only what they could not have worked out[\s\S]*explain it back[\s\S]*A diagram may help now/);
  assert.match(guidance(run(idea('firm'), 'attempt', 'solved', 'explained'), PLAN.ideas[0], { ...about, at: 2 }), /this was the last idea/);
  assert.match(guidance(idea('firm'), PLAN.ideas[0], { ...about, source: { kind: 'topic', ref: '' } }), /No source was given.*Say so once/);
  assert.match(guidance(idea('firm'), PLAN.ideas[0], { ...about, source: { kind: 'code', ref: 'src/' } }), /Do not write the solution for them/);
  assert.match(guidance(idea('firm'), PLAN.ideas[0], { ...about, review: true }), /review of ideas learned earlier/);

  assert.equal(stageLabel(idea('firm')), 'Your turn: try it');
  assert.equal(stageLabel(run(idea('firm'), 'attempt')), 'Attempt received');
  assert.equal(stageLabel(run(idea('firm'), 'attempt', 'hint')), 'Hint 1 of 3 given');
  assert.equal(stageLabel(run(idea('firm'), 'attempt', 'hint', 'attempt', 'solved')), 'Solved with 1 hint');
  assert.equal(stageLabel(run(idea('firm'), 'attempt', 'solved')), 'Solved alone');
  assert.deepEqual(LEVELS, ['gentle', 'firm', 'strict']);
  assert.equal(EVENTS.length, 7);
});

test('reviews move out when solved alone and come back when not', () => {
  const now = Date.UTC(2026, 0, 10, 12);
  assert.deepEqual(INTERVALS, [1, 3, 7, 16, 35]);
  assert.deepEqual(schedule(-1, 'alone', now), { step: 0, due: now + DAY, days: 1 });
  assert.equal(schedule(0, 'alone', now).days, 3);
  assert.equal(schedule(1, 'alone', now).days, 7);
  assert.equal(schedule(3, 'alone', now).days, 35);
  assert.equal(schedule(4, 'alone', now).days, 35, 'it does not go beyond the last step');
  assert.equal(schedule(2, 'hints', now).days, 7, 'needing hints keeps it where it is');
  assert.equal(schedule(-1, 'hints', now).days, 1);
  assert.equal(schedule(3, 'shown', now).days, 1, 'needing the answer brings it back to the start');
  assert.equal(schedule(undefined, 'alone', now).step, 0);

  const topics = [{ id: 't', title: 'T', ideas: [{ id: 'a', title: 'A', question: 'q', due: now - DAY, step: 0 }, { id: 'b', title: 'B', question: 'q', due: now + DAY, step: 1 }, { id: 'c', title: 'C', question: 'q', due: null, step: -1 }, { id: 'd', title: 'D', question: 'q', due: now - 3 * DAY, step: 2 }] }];
  assert.deepEqual(dueIdeas(topics, now).map((item) => item.ideaId), ['d', 'a']);
  assert.equal(whenText(now, now), 'today');
  assert.equal(whenText(now + DAY, now), 'tomorrow');
  assert.equal(whenText(now + 3 * DAY, now), 'in 3 days');
  assert.equal(whenText(now - 2 * DAY, now), '2 days ago');
});

test('the record keeps plans and outcomes, and nothing the learner wrote', (t) => {
  assert.match(readPlan(null).error, /"title" and "ideas"/);
  assert.match(readPlan({ ideas: PLAN.ideas }).error, /needs a "title"/);
  assert.match(readPlan({ title: 'x', ideas: [{ title: 'only a title' }] }).error, /"question"/);
  assert.match(readPlan({ title: 'x', ideas: [PLAN.ideas[0]] }).error, /at least 2 ideas/);
  assert.match(readPlan({ title: 'x', ideas: Array.from({ length: 13 }, () => PLAN.ideas[0]) }).error, /too many/);
  const read = readPlan({ ...PLAN, source: { kind: 'spaceship', ref: 'x' } });
  assert.equal(read.topic.source.kind, 'topic', 'an unknown kind of source is treated as a plain topic');
  assert.equal(read.topic.ideas.length, 3);
  assert.ok(read.topic.ideas.every((item) => item.step === -1 && item.due === null));

  const dir = mkdtempSync(join(tmpdir(), 'dsh-learn-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const store = openStore(dir);
  const topic = store.add(readPlan(PLAN).topic);
  const now = Date.UTC(2026, 0, 10, 12);
  assert.deepEqual(store.record(topic.id, topic.ideas[0].id, 'alone', 0, now), { days: 1, due: now + DAY });
  assert.deepEqual(store.record(topic.id, topic.ideas[0].id, 'alone', 0, now + DAY), { days: 3, due: now + 4 * DAY });
  store.record(topic.id, topic.ideas[1].id, 'shown', 3, now);
  assert.equal(store.record(topic.id, 'nope', 'alone', 0, now), undefined);
  assert.deepEqual(store.stats(), { topics: 1, ideas: 3, tries: 3, alone: 2, hints: 0, shown: 1 });

  // A second opening of the same folder sees the same record.
  const again = openStore(dir);
  assert.equal(again.topic(topic.id).ideas[0].step, 1);
  assert.equal(again.topic(topic.id).ideas[0].history.length, 2);
  const saved = readFileSync(join(dir, 'topics.json'), 'utf8');
  assert.ok(saved.includes('Halving') && saved.includes('"outcome":"alone"'));
  assert.ok(!existsSync(join(dir, 'topics.json.tmp')));
  assert.equal(again.remove(topic.id), true);
  assert.equal(again.remove(topic.id), false);
  assert.deepEqual(openStore(dir).topics(), []);
  assert.deepEqual(openStore('').topics(), [], 'without a folder it still works, in memory');
});

test('a whole session: plan, the rules in force, outcomes recorded, then a review', () => {
  let time = Date.UTC(2026, 0, 10, 12);
  const store = openStore('');
  let level = 'firm';
  const sessions = createSessions({ store, settings: () => ({ enabled: true, level, reviewSize: 10 }), now: () => time });

  assert.equal(sessions.instructions('c1'), '');
  assert.match(sessions.mark('c1', 'attempt').text, /No study session is running/);
  sessions.request('c1', { request: 'binary search from algorithms.pdf' });
  assert.match(sessions.instructions('c1'), /## Study request\nThe learner wants to study: binary search from algorithms\.pdf[\s\S]*Call learn_plan/);
  assert.equal(sessions.view('c1').pending.request, 'binary search from algorithms.pdf');

  assert.match(sessions.plan('c1', { title: 'x' }).error, /at least 2 ideas/);
  const started = sessions.plan('c1', PLAN);
  assert.match(started.text, /The plan is saved: "Binary search", 3 ideas\.[\s\S]*idea 1 of 3: "Halving"/);
  assert.match(sessions.plan('c1', PLAN).error, /already running/);
  assert.equal(sessions.view('c1').pending, null);
  assert.match(sessions.instructions('c1'), /put the question to the learner before explaining/);

  // The tutor tries to give the answer straight away: refused, and told what to do.
  assert.match(sessions.mark('c1', 'answer_shown').text, /^Not allowed: The learner has not tried yet[\s\S]*put the question/);
  assert.match(sessions.mark('c1', 'hint').text, /^Not allowed/);
  assert.match(sessions.mark('c1', 'sing').text, /Unknown event/);
  let view = sessions.view('c1').session;
  assert.deepEqual([view.at, view.total, view.idea, view.label, view.canHint.ok, view.canGiveUp.ok], [0, 3, 'Halving', 'Your turn: try it', false, false]);

  // Idea 1: solved alone.
  for (const event of ['attempt', 'solved', 'explained']) assert.match(sessions.mark('c1', event).text, /^Recorded/);
  assert.match(sessions.mark('c1', 'next').text, /Idea 2 of 3 now\.[\s\S]*"Needs sorting"/);
  // Idea 2: the learner presses "Show answer" after one try.
  assert.equal(sessions.choose('c1', 'giveup').ok, false, 'not before trying');
  sessions.mark('c1', 'attempt');
  assert.equal(sessions.view('c1').session.canGiveUp.ok, true);
  assert.equal(sessions.choose('c1', 'giveup').ok, true);
  assert.equal(sessions.view('c1').session.canGiveUp.ok, false);
  assert.match(sessions.instructions('c1'), /has given up on this one/);
  for (const event of ['answer_shown', 'explained', 'next']) sessions.mark('c1', event);
  // Idea 3: solved with one hint, under Strict, switched mid-session.
  assert.equal(sessions.choose('c1', 'level', 'strict').ok, true);
  assert.equal(sessions.choose('c1', 'level', 'extreme').ok, false);
  for (const event of ['attempt', 'stuck', 'hint', 'attempt', 'solved', 'explained']) assert.match(sessions.mark('c1', event).text, /^Recorded/, event);
  const end = sessions.mark('c1', 'next').text;
  assert.match(end, /The session "Binary search" is finished: 3 ideas\./);
  assert.match(end, /- Halving: solved alone; comes back in 1 day\./);
  assert.match(end, /- Needs sorting: answer shown; comes back in 1 day\./);
  assert.match(end, /- The loop rule: solved with hints \(1 hint\); comes back in 1 day\./);
  assert.equal(sessions.get('c1'), undefined);
  assert.deepEqual(store.stats(), { topics: 1, ideas: 3, tries: 3, alone: 1, hints: 1, shown: 1 });

  // Nothing is due the same day. Two days later all three are, and a review runs in another conversation.
  assert.match(sessions.review('c2').error, /Nothing is due/);
  time += 2 * DAY;
  level = 'gentle';
  sessions.request('c2', { review: true });
  assert.match(sessions.instructions('c2'), /Call learn_review now/);
  const review = sessions.review('c2');
  assert.match(review.text, /Review started: 3 ideas due\.[\s\S]*review of ideas learned earlier/);
  assert.equal(sessions.view('c2').session.level, 'gentle');
  for (const event of ['attempt', 'solved', 'next']) sessions.mark('c2', event);
  assert.equal(store.topics()[0].ideas[0].step, 1, 'solved alone again: one step further out');
  assert.equal(sessions.choose('c2', 'end').ok, true);
  assert.equal(sessions.choose('c2', 'end').ok, false);
  assert.equal(store.topics()[0].ideas[1].history.length, 1, 'an idea left unfinished is not recorded');
  assert.equal(sessions.instructions('c2'), '');
});

test('a session survives a restart of the app', () => {
  let kept = {};
  const keep = { load: () => kept, save: (value) => { kept = JSON.parse(JSON.stringify(value)); } };
  const store = openStore('');
  const first = createSessions({ store, settings: () => ({ enabled: true, level: 'firm', reviewSize: 10 }), keep });
  first.request('c9', { request: 'something' });
  assert.equal(kept.pending.c9.request, 'something');
  first.plan('c1', PLAN);
  first.mark('c1', 'attempt');
  first.mark('c1', 'hint');
  // A second keeper over the same record and the same saved state: the session is where it was.
  const second = createSessions({ store, settings: () => ({ enabled: true, level: 'firm', reviewSize: 10 }), keep });
  const view = second.view('c1').session;
  assert.deepEqual([view.idea, view.label, view.hints], ['Halving', 'Hint 1 of 3 given', 1]);
  assert.equal(second.view('c9').pending.request, 'something');
  second.choose('c1', 'end');
  assert.equal(kept.sessions.c1, undefined);
  // A saved session whose topic was removed in the meantime is dropped, not broken.
  first.plan('c2', PLAN);
  store.remove(store.topics().at(-1).id);
  const third = createSessions({ store, settings: () => ({ enabled: true, level: 'firm', reviewSize: 10 }), keep });
  assert.equal(third.view('c2').session, null);
  assert.equal(third.instructions('c2'), '');
});

test('settings, request bodies and the skill', async () => {
  assert.deepEqual(readSettings({}), { enabled: true, level: 'firm', reviewSize: 10 });
  assert.deepEqual(readSettings({ enabled: Object.freeze({ get: () => false }), level: 'brutal', reviewSize: 900 }), { enabled: false, level: 'firm', reviewSize: 30 });
  assert.equal(readSettings({ level: 'strict' }).level, 'strict');

  assert.deepEqual(await readBody(Readable.from([Buffer.from('{"action":"giveup"}')])), { action: 'giveup' });
  assert.equal(await readBody(Readable.from([Buffer.from('[1]')])), undefined);
  assert.equal(await readBody(Readable.from([Buffer.from('nope')])), undefined);
  assert.equal(await readBody(Readable.from([Buffer.alloc(9 * 1024, 0x61)])), undefined);

  const skill = SKILLS[0];
  assert.equal(skill.name, 'study-tutor');
  for (const word of ['learn_plan', 'learn_mark', 'learn_review', 'Question first', 'explain it back']) assert.ok(skill.content.includes(word), word);
  assert.ok(skill.content.length < 3200, 'the skill stays short');
});
