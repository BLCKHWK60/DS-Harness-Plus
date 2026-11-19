/**
 * The work loop (Content and Devices plan, steps S3 to S6): off unless switched on; recipes; the fixed
 * shape; a checker per kind of work; attempts side by side and a judge only for work that writes no file;
 * checking questions; a step that failed twice goes up; teams. Stand-in helpers only, no real model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEPTH_LOOP, KINDS, STARTERS, agreement, citationCheck, goesUp, judgeOf, limited, limitedBy, loopFor, loopReaderRefuses, openRecipes, pickRecipe, questionsOf, readRecipe, readerVerdict, recipeText, sameAddress, sameAnswer, shapeCheck, shapeOf, sideBySide } from '../lib/loop.js';
import { COMMAND_TOOLS, WRITE_TOOLS } from '../lib/guard.js';
import { symlinkSync } from 'node:fs';
import { applyPlan, applyWork, newRun, report } from '../lib/run.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'mission-loop-'));

test('off unless switched on: no Ultra Code and no tab switch, no loop; either one puts it on', () => {
  const recipes = STARTERS.map(readRecipe);
  assert.equal(loopFor({ ultra: false, tabOn: false, depth: 'thorough', goal: 'fix the failing test', recipes }), undefined);
  assert.equal(loopFor({ goal: 'x', recipes }), undefined, 'not knowing counts as off');
  const tab = loopFor({ tabOn: true, depth: 'standard', goal: 'fix the failing test in the build', recipes });
  assert.equal(tab.ultra, false);
  assert.equal(tab.attempts, 1, 'several attempts only with Ultra Code');
  assert.equal(tab.recipe.id, 'code-change');
  const ultra = loopFor({ ultra: true, depth: 'thorough', goal: 'research who said what and find sources', recipes });
  assert.equal(ultra.attempts, DEPTH_LOOP.thorough.attempts);
  assert.equal(ultra.questions, true, 'checking questions at Thorough');
  assert.equal(ultra.kind, 'research');
  assert.equal(loopFor({ ultra: true, depth: 'quick', goal: 'x', recipes }).attempts, 1, 'Quick: one pass');
  assert.equal(loopFor({ ultra: true, depth: 'nonsense', goal: 'x', recipes }).depth, 'standard');
  assert.equal(loopFor({ ultra: true, long: true, goal: 'x', recipes }).depth, 'long');
  assert.equal(loopFor({ ultra: true, goal: 'qwxz', recipes }).kind, 'code', 'no recipe fits: code work, checked by commands, one writer (review finding 1)');
  assert.equal(loopFor({ ultra: true, goal: 'add dark mode to the settings page', recipes }).kind, 'code');
  assert.deepEqual([loopFor({ ultra: true, depth: 'quick', goal: 'x', recipes }).retries, loopFor({ ultra: true, depth: 'standard', goal: 'x', recipes }).retries], [0, 1], 'the checker may send an item back per Depth');
});

test('recipes: plain files written once, the owner\'s edits kept, a removed one not put back, a broken one named', () => {
  const dir = scratch();
  try {
    const first = openRecipes(dir);
    assert.deepEqual(first.recipes.map((recipe) => recipe.id).sort(), STARTERS.map((recipe) => recipe.id).sort());
    const file = join(dir, 'code-change.json');
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, 'utf8')), name: 'My code change', version: 2 }));
    unlinkSync(join(dir, 'writing-piece.json'));
    writeFileSync(join(dir, 'broken.json'), '{ not json');
    writeFileSync(join(dir, 'unknown-kind.json'), JSON.stringify({ id: 'x', kind: 'magic', steps: [{ does: 'a' }] }));
    const again = openRecipes(dir);
    assert.equal(again.recipes.find((recipe) => recipe.id === 'code-change').name, 'My code change');
    assert.equal(again.recipes.find((recipe) => recipe.id === 'code-change').version, 2);
    assert.equal(again.recipes.some((recipe) => recipe.id === 'writing-piece'), false, 'not put back');
    assert.deepEqual(again.broken.sort(), ['broken.json', 'unknown-kind.json']);
    assert.equal(existsSync(join(dir, '.starters-written')), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  assert.equal(pickRecipe('make a csv table of the numbers', STARTERS.map(readRecipe)).id, 'data-question');
  assert.equal(pickRecipe('qwxz', STARTERS.map(readRecipe)), undefined);
  const text = recipeText(loopFor({ ultra: true, goal: 'write a blog post', recipes: STARTERS.map(readRecipe) }));
  assert.match(text, /Work by this recipe for a piece of writing \("A piece of writing"\):\n1\. \(lead\)/);
  assert.match(text, /Ultra Code is on: you may adapt the recipe/);
  assert.match(text, /How the work is checked here: a separate reader/);
});

test('the fixed shape, and a checker per kind of work', () => {
  const answer = 'I read two pages.\n{"done": true, "summary": "found it", "sources": ["https://a.example/x#part", "https://b.example/y/"], "answer": "42"}';
  const shape = shapeOf(answer);
  assert.deepEqual([shape.done, shape.summary, shape.answer], [true, 'found it', '42']);
  assert.equal(shapeOf('no json here'), undefined);
  assert.equal(shapeOf('{"verdict":"approve","items":[]}'), undefined, 'an answer that starts with a brace and has no shape ends (it looped for ever before)');
  assert.equal(shapeOf('{ not json }'), undefined);
  // Research: every cited source really opened in the run.
  const opened = new Set([sameAddress('https://a.example/x'), sameAddress('https://B.example/y')]);
  assert.deepEqual(citationCheck(answer, opened), { ok: true, why: '' });
  assert.match(citationCheck(answer, new Set([sameAddress('https://a.example/x')])).why, /cited but never opened in this run: https:\/\/b\.example\/y/);
  assert.match(citationCheck('{"done": true, "summary": "s"}', opened).why, /cites no source/);
  assert.match(citationCheck('See https://c.example/z for it.', opened).why, /never opened/, 'an address in the text counts too');
  // Extraction: a fixed shape.
  assert.equal(shapeCheck('{"done": true, "answer": {"items": [1, 2]}}').ok, true);
  assert.equal(shapeCheck('{"done": true, "answer": "{\\"items\\": []}"}').ok, true);
  assert.match(shapeCheck('{"done": true, "answer": {"rows": []}}').why, /has no "items"/);
  assert.match(shapeCheck('plain text').why, /does not fit the fixed shape/);
  // One right answer: tries must agree.
  assert.deepEqual(agreement(['It is 42.', 'it is 42', 'It is 41']), { ok: true, pick: 0, why: '' });
  assert.equal(agreement(['a', 'b', 'c']).ok, false);
  assert.equal(agreement(['{"done":true,"answer":"Paris"}', '{"done":true,"answer":"paris"}']).ok, true, 'the shape\'s answer is compared');
  // A reader that gives no usable verdict passes nothing.
  assert.deepEqual(readerVerdict('{"ok": true}'), { ok: true, why: '' });
  assert.equal(readerVerdict('looks fine to me').ok, undefined, 'a reply in the wrong format is no verdict (review finding 4)');
  assert.equal(sameAnswer('{"done":true,"answer":"Paris"}', 'paris.'), true);
  assert.equal(sameAnswer('{"done":true,"answer":"Lyon"}', 'Paris'), false);
  assert.deepEqual(judgeOf('{"pick": 2, "why": "w"}', 3), { pick: 1, merged: '', why: 'w' });
  assert.equal(judgeOf('{"pick": 9}', 3).pick, -1);
  assert.deepEqual(questionsOf('{"questions": ["When?", "", "Who?", "a", "b", "c"]}'), ['When?', 'Who?', 'a', 'b']);
  for (const kind of Object.values(KINDS)) assert.ok(kind.checker && kind.says);
});

test('the run: the loop\'s checker sends an item back with its words, never marks one done; without the loop, nothing changes', () => {
  const base = () => applyPlan(newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/w', limits: {} }), { items: [{ title: 'a' }] });
  const plainRun = base();
  applyWork(plainRun, '1', { report: 'did it' });
  assert.equal(plainRun.items[0].status, 'unverified');
  assert.doesNotMatch(report(plainRun), /Work loop/, 'no loop: the report as before');
  const looped = base();
  looped.loop = loopFor({ ultra: true, goal: 'research sources', recipes: STARTERS.map(readRecipe) });
  applyWork(looped, '1', { report: 'did it', loopFail: 'no source opened' });
  assert.equal(looped.items[0].status, 'open');
  assert.equal(looped.items[0].note, 'Checker: no source opened');
  applyWork(looped, '1', { report: 'did it' });
  assert.equal(looped.items[0].status, 'unverified', 'a yes from the loop marks nothing done');
  assert.match(report(looped), /Work loop: on \(Ultra Code, Depth standard, recipe "A research question"; 2 attempts per text step\)/);
  // A command that passed is still sent back when the loop's checker says no (sources never opened).
  const proved = base();
  proved.items[0].check = 'true';
  proved.loop = looped.loop;
  applyWork(proved, '1', { report: 'r', check: { ok: true, output: '' }, loopFail: 'not opened' });
  assert.equal(proved.items[0].status, 'open');
  // Out of tries: stuck.
  const tired = base();
  tired.loop = { ...looped.loop, retries: 3 };
  for (let i = 0; i < 3; i += 1) applyWork(tired, '1', { report: 'r', loopFail: 'no' });
  assert.equal(tired.items[0].status, 'stuck');
  // Standard: one send-back from the checker, then the reviewer decides (review finding 10).
  const once = base();
  once.loop = looped.loop;
  applyWork(once, '1', { report: 'r', loopFail: 'no' });
  assert.equal(once.items[0].status, 'open');
  applyWork(once, '1', { report: 'r', loopFail: 'still no' });
  assert.equal(once.items[0].status, 'unverified');
  assert.equal(once.items[0].note, 'Checker (no more tries at this Depth): still no');
  const quick = base();
  quick.loop = { ...looped.loop, retries: 0 };
  applyWork(quick, '1', { report: 'r', loopFail: 'no' });
  assert.equal(quick.items[0].status, 'unverified', 'Quick: the checker never sends one back');
  // A model reader's no never reopens an item whose command passed (review finding 1).
  const byModel = base();
  byModel.items[0].check = 'true';
  byModel.loop = looped.loop;
  applyWork(byModel, '1', { report: 'r', check: { ok: true, output: '' }, loopFail: 'I do not like it', loopFailBy: 'model' });
  assert.equal(byModel.items[0].status, 'verified');
});

test('a step that failed twice goes up with the loop on; without it, only the last try, as before', () => {
  const run = newRun({ id: 'r', goal: 'g', mode: 'Full Auto', root: '/w', limits: { maxTries: 5 } });
  const item = { tries: 2 };
  assert.equal(goesUp(run, item), false, 'without the loop: the last try only (4 of 5)');
  assert.equal(goesUp(run, { tries: 4 }), true);
  run.loop = {};
  assert.equal(goesUp(run, item), true);
  assert.equal(goesUp(run, { tries: 1 }), false);
  assert.equal(sideBySide({ loop: { ultra: true, attempts: 3 } }, true), true);
  assert.equal(sideBySide({ loop: { ultra: true, attempts: 3 } }, false), false, 'work that writes files: one writer');
  assert.equal(sideBySide({ loop: { ultra: false, attempts: 3 } }, true), false);
});

test('calls at once: a server that runs one request at a time gets them one after another', async () => {
  let now = 0;
  let most = 0;
  const job = () => async () => {
    now += 1;
    most = Math.max(most, now);
    await new Promise((done) => setTimeout(done, 5));
    now -= 1;
    return 'x';
  };
  await limited([job(), job(), job(), job()], 1);
  assert.equal(most, 1);
  most = 0;
  await limited([job(), job(), job(), job()], 2);
  assert.equal(most, 2);
  const results = await limited([async () => { throw new Error('no'); }, async () => 'yes'], 2);
  assert.deepEqual([results[0].ok, results[1].value], [false, 'yes']);
});

/** A stand-in app for the runner: scripted helpers by label, a team from Model Tiers. */
async function world({ loop, answers, team, helperModels = 'roles', isolated = false, grandchild = false } = {}) {
  const { createRunner } = await import('../runner.js');
  const root = scratch();
  const goal = { id: 'g', revision: 1, phase: 'active' };
  let made = false;
  const goals = { create: () => { made = true; goal.phase = 'active'; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => { goal.phase = 'complete'; made = false; } };
  const seen = [];
  const lockSeen = [];
  const chainSeen = [];
  const agentsMap = new Map();
  let at = 0;
  let most = 0;
  let runnerRef;
  const subagents = {
    startActivation: async (spec) => {
      seen.push({ label: spec.label, model: spec.agentOptions?.model, prompt: spec.prompt?.[0]?.text ?? '' });
      const childId = `c${seen.length}`;
      const script = answers[spec.label] ?? answers[spec.label.replace(/ \d+ of \d+$/, '')] ?? answers[spec.label.replace(/ \d+$/, '')];
      const text = typeof script === 'function' ? script(spec) : Array.isArray(script) ? script.shift() ?? '' : script ?? 'done';
      at += 1;
      most = Math.max(most, at);
      await new Promise((done) => setTimeout(done, 2));
      at -= 1;
      // While the helper works: is it locked to reading (the guard refuses its file changes)?
      return { childId, result: new Promise((done) => setTimeout(() => {
        lockSeen.push([spec.label, runnerRef.readerOf(childId)]);
        // A helper this one starts: it is a reader too, up the chain.
        if (grandchild) {
          agentsMap.set(`${childId}-sub`, { id: `${childId}-sub`, header: { parentSession: childId } });
          chainSeen.push([spec.label, runnerRef.loopReaderOf(childId), runnerRef.loopReaderOf(`${childId}-sub`)]);
        }
        done({ output: [{ type: 'text', text }], stopReason: 'end' });
      }, 1)) };
    },
  };
  const modelTiers = { resolveTier: () => ({ id: 't' }), roleRoute: () => null, teamRoute: (id, role, index) => (team ? (role === 'helper' ? team.helpers[index % team.helpers.length] : team[role]) ?? null : null) };
  const modes = { helperModels: () => helperModels };
  const agents = { get: (id) => agentsMap.get(id), list: () => [...agentsMap.values()] };
  const ctx = { get: (name) => ({ goals, subagents, modelTiers, modes, agents })[name] };
  const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
  const runner = createRunner(ctx, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 1, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined, callsAtOnce: () => 1 });
  runnerRef = runner;
  const agent = { id: 'c1', model: { current: () => ({ provider: 'p', model: 'conv' }) } };
  const steps = async (options, goalText = 'answer the question well') => {
    await runner.start(agent, goalText, { mode: 'auto', root }, options);
    const out = [];
    for (let i = 0; i < 12 && runner.isOn('c1'); i += 1) out.push(await runner.step(agent, new AbortController().signal, 60000));
    return out.join('\n---\n');
  };
  return { runner, seen, lockSeen, chainSeen, steps, root, most: () => most, close: () => rmSync(root, { recursive: true, force: true }), loop, isolated };
}

test('with the loop off a run is as before: no recipe, no shape, no attempts, no checker, no team', async () => {
  const app = await world({ team: { helpers: [{ provider: 'p', model: 'team-helper' }], lead: { provider: 'p', model: 'team-lead' } }, answers: { 'Mission: planner': '{"items":[{"title":"Answer it"}],"checks":[]}', 'Mission: reviewer': '{"verdict":"approve","items":[{"id":"1","ok":true}]}' } });
  try {
    const all = await app.steps({});
    assert.deepEqual(app.seen.map((entry) => entry.label), ['Mission: planner', 'Mission: item 1', 'Mission: reviewer']);
    assert.doesNotMatch(app.seen[0].prompt, /Work by this recipe/);
    assert.doesNotMatch(app.seen[1].prompt, /"done": true or false/);
    assert.doesNotMatch(all, /Work loop/);
    assert.equal(app.seen.every((entry) => entry.model === 'conv'), true, 'the team is only for the loop');
  } finally {
    app.close();
  }
});

test('Ultra Code on, a question with one answer: attempts side by side as readers, a vote, one writer, the vote as the check; team models for the attempts', async () => {
  const recipes = [readRecipe({ id: 'one-answer', name: 'One answer', kind: 'answer', when: ['answer'], steps: [{ role: 'helper', does: 'Work it out.', check: 'Tries agree.' }], stop: 'Agreed.' })];
  const loop = loopFor({ ultra: true, depth: 'standard', goal: 'answer the question well', recipes });
  const app = await world({
    team: { helpers: [{ provider: 'p', model: 'small-a' }, { provider: 'p', model: 'small-b' }], judge: { provider: 'p', model: 'big' }, lead: { provider: 'p', model: 'big' }, checker: { provider: 'p', model: 'precise' } },
    answers: {
      'Mission: planner': '{"items":[{"title":"Answer it"}],"checks":[]}',
      'Mission: item 1, attempt': ['{"done":true,"summary":"s","sources":[],"answer":"42"}', '{"done":true,"summary":"s","sources":[],"answer":"42"}'],
      'Mission: item 1': 'Wrote it down.\n{"done":true,"summary":"s","sources":[],"answer":"42"}',
      'Mission: reviewer': '{"verdict":"approve","items":[{"id":"1","ok":true}]}',
    },
  });
  try {
    const all = await app.steps({ loop });
    const labels = app.seen.map((entry) => entry.label);
    assert.deepEqual(labels.slice(0, 4), ['Mission: planner', 'Mission: item 1, attempt 1 of 2', 'Mission: item 1, attempt 2 of 2', 'Mission: item 1']);
    assert.match(app.seen[0].prompt, /Work by this recipe for a question with one right answer/);
    assert.deepEqual(app.seen.slice(1, 3).map((entry) => entry.model), ['small-a', 'small-b'], 'mixed models make attempts differ');
    assert.match(app.seen[1].prompt, /Answer in text only: write no file/);
    assert.deepEqual(app.lockSeen.filter(([label]) => /attempt/.test(label)).map(([, lock]) => lock), ['an attempt of the work loop', 'an attempt of the work loop'], 'attempts cannot change files');
    assert.equal(app.lockSeen.find(([label]) => label === 'Mission: item 1')[1], '', 'the one writer can');
    assert.match(app.seen[3].prompt, /Separate attempts prepared this answer \(2 attempts, the answer most of them gave\)/);
    assert.equal(app.most(), 1, 'one call at a time on a server that runs one');
    assert.match(all, /Work loop: 2 attempts, the answer most of them gave\./);
    assert.match(all, /Work loop check \(a question with one right answer\): passed\./);
    assert.match(all, /Work loop: on \(Ultra Code, Depth standard, recipe "One answer"; 2 attempts per text step\)\. Checks by the loop: 1 passed, 0 failed\./);
  } finally {
    app.close();
  }
});

test('the research checker sends an item back when a cited page was never opened; the retry has the checker\'s words; the third try goes to the strongest model', async () => {
  const loop = { ...loopFor({ tabOn: true, depth: 'quick', goal: 'research the sources', recipes: STARTERS.map(readRecipe) }), retries: 3 };
  const app = await world({
    team: { helpers: [{ provider: 'p', model: 'small' }], lead: { provider: 'p', model: 'big' } },
    answers: {
      'Mission: planner': '{"items":[{"title":"Find who said it"}],"checks":[]}',
      'Mission: item 1': (spec) => `I found it.\n{"done":true,"summary":"s","sources":["https://news.example/a"],"answer":"x"}`,
      'Mission: item 1 (senior)': (spec) => {
        app.runner.noteOpened('c1', ['https://news.example/a']);
        return 'Opened it now.\n{"done":true,"summary":"s","sources":["https://news.example/a"],"answer":"x"}';
      },
      'Mission: reviewer': '{"verdict":"approve","items":[{"id":"1","ok":true}]}',
    },
  });
  try {
    const all = await app.steps({ loop }, 'research the sources');
    const items = app.seen.filter((entry) => entry.label.startsWith('Mission: item 1'));
    assert.deepEqual(items.map((entry) => [entry.label, entry.model]), [['Mission: item 1', 'small'], ['Mission: item 1', 'small'], ['Mission: item 1 (senior)', 'big']]);
    assert.match(items[1].prompt, /Checker: These sources were cited but never opened in this run: https:\/\/news\.example\/a/);
    assert.match(all, /Work loop check \(a research question\): not passed\. These sources were cited but never opened/);
    assert.match(all, /Work loop check \(a research question\): passed\./);
    assert.match(all, /1 step went up to the strongest model/);
  } finally {
    app.close();
  }
});

test('one writer: Ultra Code on, but code work gets one worker and no attempts; a Recon run gets no extra helper models', async () => {
  const code = loopFor({ ultra: true, depth: 'thorough', goal: 'fix the bug and the test', recipes: STARTERS.map(readRecipe) });
  const app = await world({ answers: { 'Mission: planner': '{"items":[{"title":"Fix it","check":"true"}],"checks":[]}', 'Mission: reviewer': '{"verdict":"approve","items":[]}' } });
  try {
    await app.steps({ loop: code }, 'fix the bug and the test');
    assert.equal(app.seen.some((entry) => /attempt|judge|checker|checking/.test(entry.label)), false);
  } finally {
    app.close();
  }
  const OPEN = [readRecipe({ id: 'explain', name: 'Explain', kind: 'open', when: ['qwxz'], steps: [{ role: 'helper', does: 'Explain it.', check: 'A reader agrees.' }], stop: 'Explained.' })];
  const open = loopFor({ ultra: true, depth: 'thorough', goal: 'qwxz', recipes: OPEN });
  assert.equal(open.kind, 'open');
  const recon = await world({ answers: { 'Mission: planner': '{"items":[{"title":"Look"}],"checks":[]}', 'Mission: reviewer': '{"verdict":"approve","items":[]}' } });
  try {
    await recon.steps({ kind: 'long', long: { minutes: 30, laps: 1, isolated: true }, loop: open }, 'qwxz looking around');
    assert.equal(recon.seen.some((entry) => /attempt|judge|checker|checking|senior/.test(entry.label)), false, 'Recon: the app\'s own checks only');
    assert.equal(recon.seen.every((entry) => entry.model === 'conv'), true, 'and the conversation\'s own model');
  } finally {
    recon.close();
  }
});

test('Thorough: checking questions answered separately (the answerer never sees the draft), then a revision; a judge picks between drafts', async () => {
  const loop = loopFor({ ultra: true, depth: 'thorough', goal: 'qwxz', recipes: [readRecipe({ id: 'explain', name: 'Explain', kind: 'open', when: ['qwxz'], steps: [{ role: 'helper', does: 'Explain it.', check: 'A reader agrees.' }], stop: 'Explained.' })] });
  const app = await world({
    answers: {
      'Mission: planner': '{"items":[{"title":"Explain it"}],"checks":[]}',
      'Mission: item 1, attempt': ['Draft A says 1990.', 'Draft B says 1991.', 'Draft C says 1990.'],
      'Mission: judge for item 1': '{"pick": 3, "why": "best sourced"}',
      'Mission: checking questions for item 1': '{"questions":["In which year was it?"]}',
      'Mission: checking question': 'It was 1990, per https://example.org/y',
      'Mission: revision of item 1': 'Revised: 1990.\n{"done":true,"summary":"s","sources":[],"answer":"1990"}',
      'Mission: item 1': 'Written.\n{"done":true,"summary":"s","sources":[],"answer":"1990"}',
      'Mission: checker for item 1': '{"ok": true}',
      'Mission: reviewer': '{"verdict":"approve","items":[{"id":"1","ok":true}]}',
    },
  });
  try {
    const all = await app.steps({ loop }, 'qwxz explain');
    const question = app.seen.find((entry) => entry.label === 'Mission: checking question 1');
    assert.match(question.prompt, /Question: In which year was it\?/);
    assert.doesNotMatch(question.prompt, /Draft/, 'the answerer never sees the draft');
    assert.match(app.seen.find((entry) => entry.label === 'Mission: revision of item 1').prompt, /Draft C says 1990[\s\S]*Answer: It was 1990/);
    assert.match(app.seen.find((entry) => entry.label === 'Mission: item 1').prompt, /attempt 3 of 3, picked by the judge; checked with 1 separate question and revised\)[\s\S]*Revised: 1990/);
    assert.match(all, /Work loop check \(an open question\): passed\./);
  } finally {
    app.close();
  }
});

/** Mission on a stand-in app, to start a /mission run the way the owner does. */
async function plugin({ ultra = false, tab = 'cowork', loopTabs = '[]' } = {}) {
  const { apply } = await import('../index.js');
  const home = scratch();
  const folder = scratch();
  const provided = {};
  const commands = {};
  const tools = {};
  const handlers = new Map();
  const prompts = [];
  const busy = { now: 0, most: 0 };
  const goals = new Map();
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: { isolated: () => false, get: () => tab, readOnly: () => false, ultraCode: () => ultra, depthOf: () => 'standard', helperModels: () => 'same' },
    sandboxPolicy: { resolve: () => ({ mode: 'workspace-write' }) },
    modelTiers: { resolveTier: () => ({ id: 't', subagents: true }), roleRoute: () => undefined },
    permissionPresets: { current: () => 'danger-full-access', set: () => {} },
    agents: { list: () => [agent], get: () => agent },
    goals: { create: (who) => { const goal = { id: 'g', revision: 1, phase: 'active' }; goals.set(who.id, goal); return goal; }, get: (who) => goals.get(who.id), pause: () => {}, resume: () => {}, complete: (who) => { goals.get(who.id).phase = 'complete'; }, clear: (who) => goals.delete(who.id) },
    subagents: { startActivation: async (spec) => {
      prompts.push([spec.label, spec.prompt?.[0]?.text ?? '']);
      busy.now += 1;
      busy.most = Math.max(busy.most, busy.now);
      return { childId: `c${prompts.length}`, result: new Promise((done) => setTimeout(() => { busy.now -= 1; done({ output: [{ type: 'text', text: spec.label === 'Mission: planner' ? '{"items":[{"title":"Write the post"}],"checks":[]}' : '{"verdict":"approve","items":[]}' }], stopReason: 'end' }); }, 10)) };
    } },
  };
  const agent = { id: 'c1', header: { cwd: folder }, session: { id: 'c1', header: { cwd: folder }, append: () => {} }, model: { current: () => ({ provider: 'p', model: 'm' }) } };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (start) => start(),
    provide: (name, service) => { provided[name] = service; return () => {}; },
    on: (name, handler) => { handlers.set(name, [...(handlers.get(name) ?? []), handler]); return () => {}; },
    inject: (_deps, fn) => fn({ effect: (start) => start(), tools: { register: (spec) => { tools[spec.name] = spec; return () => {}; } }, commands: { register: (spec) => { commands[spec.name] = spec; return () => {}; } }, webServer: { register: () => () => {} }, connection: { requestRejection: () => undefined } }),
  };
  apply(ctx, { loopTabs });
  return {
    provided, prompts, home, handlers, folder, busy,
    start: async (goal) => commands.mission.handler({ agent, rawInput: `auto ${goal}` }),
    step: () => tools.mission_step.execute({}, { agent, signal: new AbortController().signal }),
    close: () => { rmSync(home, { recursive: true, force: true }); rmSync(folder, { recursive: true, force: true }); },
  };
}

test('on a stand-in app: a /mission run with Ultra Code off and no tab switch is as before; Ultra Code or the tab\'s switch puts the loop on', async () => {
  const off = await plugin();
  try {
    const said = await off.start('write a blog post about heat pumps');
    assert.doesNotMatch(said.text, /Work loop/);
    await off.step();
    assert.doesNotMatch(off.prompts[0][1], /Work by this recipe/);
    assert.equal(existsSync(join(off.home, 'mission', 'recipes')), false, 'with the loop off not even the recipes folder is made');
  } finally {
    off.close();
  }
  const ultra = await plugin({ ultra: true });
  try {
    const said = await ultra.start('write a blog post about heat pumps');
    assert.match(said.text, /Work loop: on \(Ultra Code, Depth standard, recipe "A piece of writing"/);
    await ultra.step();
    assert.match(ultra.prompts[0][1], /Work by this recipe for a piece of writing/);
    assert.equal(existsSync(join(ultra.home, 'mission', 'recipes', 'writing-piece.json')), true);
  } finally {
    ultra.close();
  }
  const tab = await plugin({ tab: 'code', loopTabs: '["code"]' });
  try {
    assert.match((await tab.start('write a blog post about heat pumps')).text, /Work loop: on \(switched on for this tab/);
  } finally {
    tab.close();
  }
  const other = await plugin({ tab: 'cowork', loopTabs: '["code"]' });
  try {
    assert.doesNotMatch((await other.start('write a blog post about heat pumps')).text, /Work loop/, 'another tab\'s switch does not count here');
  } finally {
    other.close();
  }
});

test('a recipe the owner accepted is saved as a new version; the earlier one is kept; a broken one is refused', async () => {
  const app = await plugin();
  try {
    const before = app.provided.mission.recipes();
    assert.equal(before.find((recipe) => recipe.id === 'code-change').version, 1);
    const saved = app.provided.mission.saveRecipe({ id: 'code-change', name: 'Code change, tests first', kind: 'code', when: ['code'], steps: [{ role: 'helper', does: 'Write the failing test first.', check: 'It fails for the right reason.' }], stop: 'Tests pass.' });
    assert.equal(saved.version, 2);
    assert.match(saved.kept, /^old\/code-change-v1-\d+\.json$/);
    assert.equal(existsSync(join(app.home, 'mission', 'recipes', saved.kept)), true);
    assert.equal(app.provided.mission.recipes().find((recipe) => recipe.id === 'code-change').name, 'Code change, tests first');
    assert.throws(() => app.provided.mission.saveRecipe({ id: '../x', kind: 'code', steps: [{ does: 'a' }] }), /not a recipe Mission can use/);
    assert.throws(() => app.provided.mission.saveRecipe({ id: 'x', kind: 'magic', steps: [{ does: 'a' }] }), /not a recipe/);
    assert.equal(app.provided.mission.saveRecipe({ id: 'new-one', kind: 'open', steps: [{ does: 'a' }] }).version, 1);
  } finally {
    app.close();
  }
});

test('the pages a run\'s helpers open are noted only for a run with the loop on', async () => {
  const app = await plugin({ ultra: true });
  try {
    await app.start('research the sources about heat pumps');
    const result = app.handlers.get('tools/result')[0];
    result({ name: 'web_fetch', agent: { id: 'c1' }, arguments: { url: 'https://example.org/a#x' } }, {});
    result({ name: 'web_fetch', agent: { id: 'c1' }, arguments: { url: 'https://example.org/b' } }, { isError: true });
    result({ name: 'web_search', agent: { id: 'c1' }, arguments: { url: 'https://example.org/c' } }, {});
    await app.step();
    const { readdirSync } = await import('node:fs');
    const runsDir = join(app.folder, '.dsh-mission', 'runs');
    const run = JSON.parse(readFileSync(join(runsDir, readdirSync(runsDir)[0], 'run.json'), 'utf8'));
    assert.deepEqual(run.loop.opened, ['https://example.org/a'], 'opened, without the failed read or a search');
  }
  finally {
    app.close();
  }
  const off = await plugin();
  try {
    await off.start('research the sources about heat pumps');
    off.handlers.get('tools/result')[0]({ name: 'web_fetch', agent: { id: 'c1' }, arguments: { url: 'https://example.org/a' } }, {});
    await off.step();
    const { readdirSync } = await import('node:fs');
    const runsDir = join(off.folder, '.dsh-mission', 'runs');
    const run = JSON.parse(readFileSync(join(runsDir, readdirSync(runsDir)[0], 'run.json'), 'utf8'));
    assert.equal(run.loop, undefined, 'the loop off: nothing noted');
  } finally {
    app.close();
  }
});

test('review fixes: code work by default gets one worker and only commands; a model checker never reopens a passed item; a reply in the wrong format is no verdict', async () => {
  const loop = loopFor({ ultra: true, depth: 'thorough', goal: 'add dark mode to the settings page', recipes: STARTERS.map(readRecipe) });
  const app = await world({ answers: { 'Mission: planner': '{"items":[{"title":"Add it","check":"true"}],"checks":[]}', 'Mission: reviewer': '{"verdict":"approve","items":[]}' } });
  try {
    const all = await app.steps({ loop }, 'add dark mode to the settings page');
    assert.equal(app.seen.some((entry) => /attempt|judge|checker|checking/.test(entry.label)), false, 'no text-only steps, no model checker');
    assert.match(all, /PASSED: its command was run and passed/);
  } finally {
    app.close();
  }
  const OPEN = [readRecipe({ id: 'explain', name: 'Explain', kind: 'open', when: ['qwxz'], steps: [{ role: 'helper', does: 'Explain it.', check: 'A reader agrees.' }], stop: 'Explained.' })];
  const open = loopFor({ tabOn: true, depth: 'standard', goal: 'qwxz', recipes: OPEN });
  const vague = await world({ answers: { 'Mission: planner': '{"items":[{"title":"Explain","check":"true"}],"checks":[]}', 'Mission: checker for item 1': ['looks fine', '{"ok": false, "why": "too short"}'], 'Mission: reviewer': '{"verdict":"approve","items":[]}' } });
  try {
    const all = await vague.steps({ loop: open }, 'qwxz explain');
    assert.doesNotMatch(all, /Work loop check/, 'no verdict, nothing said, nothing sent back');
    assert.match(all, /PASSED/);
  } finally {
    vague.close();
  }
});

test('review fix 3: the worker\'s final answer must be the one the tries agreed on', async () => {
  const recipes = [readRecipe({ id: 'one-answer', name: 'One answer', kind: 'answer', when: ['answer'], steps: [{ role: 'helper', does: 'Work it out.', check: 'Tries agree.' }], stop: 'Agreed.' })];
  const loop = loopFor({ ultra: true, depth: 'standard', goal: 'answer the question well', recipes });
  const app = await world({
    answers: {
      'Mission: planner': '{"items":[{"title":"Answer it"}],"checks":[]}',
      'Mission: item 1, attempt': ['{"done":true,"answer":"42"}', '{"done":true,"answer":"42"}', '{"done":true,"answer":"42"}', '{"done":true,"answer":"42"}'],
      'Mission: item 1': ['Wrote it.\n{"done":true,"answer":"41"}', 'Wrote it.\n{"done":true,"answer":"42"}'],
      'Mission: reviewer': '{"verdict":"approve","items":[{"id":"1","ok":true}]}',
    },
  });
  try {
    const all = await app.steps({ loop });
    assert.match(all, /not passed\. The final answer is not the one the separate tries agreed on/);
    assert.match(all, /Work loop check \(a question with one right answer\): passed\./);
  } finally {
    app.close();
  }
});

test('review fix 2: the loop\'s readers and whatever they start may run no command, program or helper and change no file', async () => {
  for (const name of ['bash', 'terminal_send', 'shell', 'pwsh', 'powershell', 'run_code', 'job_output', 'agent', 'spawn', 'task', 'subagent_acp', 'delegate_role', 'review_lanes', 'run_pipeline', 'agent_swarm_start', 'write', 'edit', 'apply_patch']) assert.equal(loopReaderRefuses(name, WRITE_TOOLS, COMMAND_TOOLS), true, name);
  for (const name of ['read', 'grep', 'web_fetch', 'web_search']) assert.equal(loopReaderRefuses(name, WRITE_TOOLS, COMMAND_TOOLS), false, name);
  const recipes = [readRecipe({ id: 'one-answer', name: 'One answer', kind: 'answer', when: ['answer'], steps: [{ role: 'helper', does: 'x', check: 'y' }], stop: 'z' })];
  const loop = loopFor({ ultra: true, depth: 'standard', goal: 'answer the question well', recipes });
  const app = await world({ answers: { 'Mission: planner': '{"items":[{"title":"Answer it"}],"checks":[]}', 'Mission: item 1, attempt': ['{"done":true,"answer":"1"}', '{"done":true,"answer":"1"}'], 'Mission: item 1': '{"done":true,"answer":"1"}', 'Mission: reviewer': '{"verdict":"approve","items":[]}' }, grandchild: true });
  try {
    await app.steps({ loop });
    const attempt = app.chainSeen.find(([label]) => /attempt/.test(label));
    assert.deepEqual(attempt.slice(1), [true, true], 'an attempt, and a helper it started, are both loop readers');
    const writer = app.chainSeen.find(([label]) => label === 'Mission: item 1');
    assert.deepEqual(writer.slice(1), [false, false]);
  } finally {
    app.close();
  }
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /if \(exec\?\.agent\?\.id && loopReaderRefuses\(exec\.name, WRITE_TOOLS, COMMAND_TOOLS\) && runner\.loopReaderOf\(exec\.agent\.id\)\) return \{ kind: 'deny'/);
});

test('review fix 10: calls at once per model server, each with its own limit', async () => {
  const at = new Map();
  const most = new Map();
  const job = (key) => ({ key, run: async () => { at.set(key, (at.get(key) ?? 0) + 1); most.set(key, Math.max(most.get(key) ?? 0, at.get(key))); await new Promise((done) => setTimeout(done, 5)); at.set(key, at.get(key) - 1); return key; } });
  const results = await limitedBy([job('local'), job('local'), job('cloud'), job('cloud'), job('cloud')], (key) => (key === 'cloud' ? 2 : 1));
  assert.deepEqual(results.map((result) => result.value), ['local', 'local', 'cloud', 'cloud', 'cloud']);
  assert.deepEqual([most.get('local'), most.get('cloud')], [1, 2]);
});

test('review fixes 7 and 8: recipes are never written through a link; a Recon conversation writes none', async () => {
  const dir = scratch();
  const elsewhere = scratch();
  try {
    symlinkSync(elsewhere, join(dir, 'recipes'));
    const through = openRecipes(join(dir, 'recipes'));
    assert.equal(through.recipes.length, STARTERS.length, 'the starters from memory');
    assert.deepEqual((await import('node:fs')).readdirSync(elsewhere), [], 'nothing written through the link');
    const marked = join(dir, 'other');
    (await import('node:fs')).mkdirSync(marked);
    symlinkSync(join(elsewhere, 'target'), join(marked, '.starters-written'));
    openRecipes(marked);
    assert.equal(existsSync(join(elsewhere, 'target')), false, 'a marker that is a link is not followed');
    assert.equal(existsSync(join(marked, 'code-change.json')), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
    rmSync(elsewhere, { recursive: true, force: true });
  }
  const app = await plugin();
  try {
    app.provided.mission.recipes();
    const recipesDir = join(app.home, 'mission', 'recipes');
    const outside = scratch();
    symlinkSync(join(outside, 'gone.json'), join(recipesDir, 'dangling.json'));
    assert.throws(() => app.provided.mission.saveRecipe({ id: 'dangling', kind: 'code', steps: [{ does: 'a' }] }), /link or not a file/);
    assert.equal(existsSync(join(outside, 'gone.json')), false);
    rmSync(outside, { recursive: true, force: true });
  } finally {
    app.close();
  }
  const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(source, /recipes: openRecipes\(isolated\(agent\.id\) \? '' : recipesDir\(\)\)\.recipes/, 'Recon: the starters from memory');
});

test('a finished run\'s line names its conversation (so a conversation that received a Recon export keeps its runs out of learning)', async () => {
  const { createRunner } = await import('../runner.js');
  const root = scratch();
  const home = scratch();
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => { goal.phase = 'complete'; made = false; } };
    const subagents = { startActivation: async (spec) => ({ childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text: spec.label === 'Mission: planner' ? '{"items":[{"title":"x","check":"true"}],"checks":[]}' : '{"items":[]}' }], stopReason: 'end' }) }) };
    const points = { take: async () => ({ id: 'p', number: 1 }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner({ get: (name) => ({ goals, subagents })[name] }, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 1, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: (sub) => join(home, sub) });
    const agent = { id: 'conv-7', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    await runner.start(agent, 'do a small thing well', { mode: 'auto', root });
    for (let i = 0; i < 6 && runner.isOn('conv-7'); i += 1) await runner.step(agent, new AbortController().signal, 60000);
    const line = JSON.parse(readFileSync(join(home, 'mission', 'runs.jsonl'), 'utf8').trim().split('\n').pop());
    assert.equal(line.conversation, 'conv-7');
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

test('the owner\'s answer: calls at once per model server default to 4, so attempts on one server run side by side unless the owner sets 1', async () => {
  const app = await plugin({ ultra: true });
  try {
    await app.start('research the sources about heat pumps');
    await app.step();
    app.busy.most = 0;
    await app.step();
    assert.equal(app.prompts.filter(([label]) => /attempt/.test(label)).length, 2);
    assert.equal(app.busy.most, 2, 'two attempts at once with nothing set');
  } finally {
    app.close();
  }
  const { CALLS_AT_ONCE } = await import('../lib/loop.js');
  assert.deepEqual(CALLS_AT_ONCE, { start: 4, min: 1, max: 16 });
});
