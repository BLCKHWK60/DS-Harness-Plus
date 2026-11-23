// Point 17 (owner, 20 November 2026), the browser half of the end and Finish it: the strip after an end (what it decided
// itself, steps it did not ask for, items not done, an end after waiting), the waiting strip with its stopped clock, Full
// auto while running, the strip's Finish it and the one card it opens ("Finish the Mission"), and what that card sends.
// Pure blocks run on their own; the strip and the card are drawn with the stand-in in test/client-stand-in.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPage, pureBlock, textOf, findAll, byClass, buttonsOf, tick, cardWith, stripOf, runAt, posts, drawPart, redrawPart, buttonText, clockOf } from './client-stand-in.mjs';

const S = pureBlock('mission-strip', ['stripWords', 'timeWords', 'itemWords', 'INFO']);
const Q = pureBlock('mission-questions', ['questionsShown', 'questionsKey', 'foldedAtFirst', 'finishMine', 'cardTop', 'foldWords', 'finishBody', 'decidedWords', 'undoneWords', 'waitDefaultWords', 'INFO_Q']);

const NOW = 1_800_000_000_000;
const q1 = { n: 1, id: 'q1', text: 'Which port?', assume: '8080', items: [], from: 'plan', askedBy: [] };
const d4 = { id: 'q4', text: 'Tabs or spaces?', assume: 'spaces', chosen: 'spaces', items: ['3'], from: 'item', self: true, askedBy: [{ id: '3', title: 'Format the files' }] };
const d6 = { id: 'q6', text: 'Which licence?', assume: 'MIT', chosen: 'MIT', items: [], from: 'plan', self: false, askedBy: [] };
const ua = { id: 'a7', kind: 'file', what: 'Change the existing file src/app.js', items: ['2'], askedBy: [{ id: '2', title: 'Add the option' }], reason: 'The option is read there.', choices: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }] };
const un = { id: '5', title: 'Docs', mark: 'NOT STARTED', why: 'Not started before the Mission ended.' };
const items = [{ id: '1', title: 'Fix the test', status: 'verified' }, { id: '2', title: 'Add the option', status: 'aside', asideOn: ['a7'] }, { id: '3', title: 'Format the files', status: 'verified' }, { id: '5', title: 'Docs', status: 'open' }];

// ---- pure: the strip ----
test('the strip after an end: what it decided itself, steps not asked, items not done, and Finish it as what to do next', () => {
  const ended = (strip, run = {}) => S.stripWords({ run: runAt(NOW, { status: 'incomplete', items, endedAt: NOW, ...run }), strip: stripOf('finished', strip) }, NOW);
  const all = ended({ canContinue: true, decided: [d4, d6], unasked: [ua], undone: [un] });
  assert.equal(all.words, 'Finished · 2 of 4 done · 1 approval left for you · it decided 2 itself · 1 not done · report ready');
  assert.equal(all.next, 'Press Finish it to answer what is left or change what it decided; the same Mission then does the rest. Send talks to the assistant again. Start Mission starts a new one.');
  assert.equal(ended({ canContinue: true, decided: [d4] }).words, 'Finished · 2 of 4 done · it decided 1 itself · report ready');
  assert.equal(ended({ canContinue: true, undone: [un] }, { status: 'stopped' }).words, 'Ended · 1 not done · report ready');
  // Ended because only your answers could move it on and nobody answered (or Full auto, which never waits).
  assert.equal(ended({ canContinue: true, questions: [q1], endKind: 'waited' }).words, 'Ended after waiting for you · 2 of 4 done · a question left for you · report ready');
  // Review of point 17: Full auto never waits, so its 'noWait' end never says it waited.
  assert.equal(ended({ canContinue: true, decided: [d4], endKind: 'noWait' }).words, 'Ended: only your answers could move it on (Full auto does not wait) · 2 of 4 done · it decided 1 itself · report ready');
  assert.match(ended({ canContinue: true, questions: [q1] }, { endKind: 'waited' }).words, /^Ended after waiting for you/, 'from the run when the strip does not say');
  // Nothing to finish: the stage B words.
  const none = ended({ canContinue: false, decided: [d4], undone: [un] });
  assert.equal(none.words, 'Finished · 2 of 4 done · report ready');
  assert.equal(none.next, 'Send talks to the assistant again. Start Mission starts a new one.');
});

test('waiting: the clock is stopped while it waits; Full auto running says it asks nothing', () => {
  const since = NOW - 20 * 60000;
  const run = runAt(NOW, { deadline: since + 50 * 60000, waitingForYou: { since, until: 0, quiet: true } });
  assert.equal(S.timeWords(run, NOW), '50 m left, clock stopped while it waits', 'counted from when it started waiting, not from now');
  assert.equal(S.timeWords({ ...run, deadline: since + 10000 }, NOW), 'clock stopped while it waits');
  assert.equal(S.timeWords({ ...run, waitingForYou: null }, NOW), '30 m left');
  const waiting = S.stripWords({ run, strip: stripOf('waiting', { questions: [q1], waitUntil: NOW + 30 * 60000 }) }, NOW);
  assert.equal(waiting.words, 'Waiting for you · 1 question · nothing else can move · time limit paused');
  assert.equal(waiting.next, `Answer in the card below. With no answer it ends at ${clockOf(NOW + 30 * 60000)} with its report; Finish it then takes it up again. Its time limit is paused while it waits.`);
  // Review of point 17: no time limit, no "time limit paused"; an end on the next day says so.
  const free = S.stripWords({ run: { ...run, deadline: 0 }, strip: stripOf('waiting', { questions: [q1], waitUntil: NOW + 30 * 60000 }) }, NOW);
  assert.equal(free.words, 'Waiting for you · 1 question · nothing else can move');
  assert.doesNotMatch(free.next, /time limit/);
  assert.equal(S.stripWords({ run: { ...run, deadline: 0 }, strip: stripOf('waiting', { questions: [q1], waitUntil: 0 }) }, NOW).next, 'Answer in the card below. It waits until you answer, and the Mac may sleep.');
  const evening = new Date(2026, 10, 20, 20, 0).getTime();
  const late = S.stripWords({ run: { ...run, deadline: 0 }, strip: stripOf('waiting', { questions: [q1], waitUntil: evening + 12 * 3600000 }) }, evening);
  assert.match(late.next, /it ends at 08:00 tomorrow with its report/);
  assert.match(Q.cardTop({ at: evening, run: { deadline: 0 }, strip: stripOf('waiting', { questions: [q1], waitUntil: evening + 12 * 3600000 }) }).line, /ends at 08:00 tomorrow with its report; Finish it then takes it up again\.$/);
  const auto = S.stripWords({ run: runAt(NOW, { workingItem: '2' }), strip: stripOf('running', { needs: 'decide' }) }, NOW);
  assert.equal(auto.next, 'Full auto: it asks nothing and decides questions itself; the report lists them. Type a note and press Add note to steer it.');
  assert.match(S.stripWords({ run: runAt(NOW), strip: stripOf('running', { needs: 'ask' }) }, NOW).next, /^Type a note and press Add note: the Mission reads it/);
  assert.equal(S.itemWords({ id: '2', status: 'aside', asideOn: ['a7'] }, {}), 'not done without your yes (Full auto does not ask)');
  assert.equal(S.itemWords({ id: '2', status: 'aside' }, {}), '', 'an item set aside before stage D says nothing new');
});

// ---- pure: the card ----
test('the Finish card shows for decided questions, steps not asked or undone items alone, and starts folded with only decided ones', () => {
  const run = runAt(NOW, { status: 'incomplete', endedAt: NOW - 1000 });
  const shown = (strip) => Q.questionsShown({ run, strip: stripOf('finished', strip) }, new Set(), NOW);
  assert.equal(shown({ canContinue: true, decided: [d4] }), true);
  assert.equal(shown({ canContinue: true, unasked: [ua] }), true);
  assert.equal(shown({ canContinue: true, undone: [un] }), true);
  assert.equal(shown({ canContinue: false, decided: [d4] }), false, 'End with nothing open: final');
  assert.equal(shown({ canContinue: true }), false);
  assert.equal(Q.foldedAtFirst({ strip: stripOf('finished', { decided: [d4] }) }), true);
  assert.equal(Q.foldedAtFirst({ strip: stripOf('finished', { decided: [d4], undone: [un] }) }), false);
  assert.equal(Q.foldedAtFirst({ strip: stripOf('finished', { decided: [d4], questions: [q1] }) }), false);
  assert.equal(Q.foldedAtFirst({ strip: stripOf('running', { decided: [d4] }) }), false);
  const key = (strip) => Q.questionsKey({ run: { id: 'r1' }, strip: stripOf('finished', strip) });
  assert.notEqual(key({ decided: [d4] }), key({}));
  assert.notEqual(key({ unasked: [ua] }), key({}));
});

test('the Finish card\'s title, line and folded line', () => {
  const top = (strip) => Q.cardTop({ strip: stripOf('finished', strip) });
  assert.deepEqual(top({ questions: [q1], decided: [d4] }), { title: 'Finish the Mission', line: 'It has ended. Answer what is still open, change what it decided if you like, or allow what it skipped. Then press Finish it: the same Mission does the rest.' });
  assert.equal(top({ decided: [d4] }).line, 'It has ended and decided these itself. Change any of them, then press Finish it, or leave them as they are.');
  assert.equal(top({ undone: [un] }).line, 'It has ended with work left. Press Finish it to give it more time; the same Mission does the rest.');
  assert.equal(top({ unasked: [ua] }).line, top({ questions: [q1] }).line);
  const fold = (strip) => Q.foldWords({ strip: stripOf('finished', strip) });
  assert.equal(fold({ questions: [q1], unasked: [ua], decided: [d4, d6], undone: [un] }), 'Finish the Mission: 2 open · 2 decided by it · 1 not done');
  assert.equal(fold({ decided: [d4] }), 'Finish the Mission: 1 decided by it');
  // Ask and wait while it runs: nothing is decided on a guess.
  assert.equal(Q.cardTop({ strip: stripOf('running', { needs: 'wait', questions: [q1] }) }).line, 'Items that need your answer or your yes wait for it; the other items go on. Nothing is decided on a guess.');
  assert.equal(Q.waitDefaultWords(q1), 'Without an answer nothing is decided on it: the Mission waits for it before it ends. Its suggestion: 8080.');
  assert.equal(Q.waitDefaultWords({ ...q1, assume: '' }), 'Without an answer nothing is decided on it: the Mission waits for it before it ends.');
  assert.equal(Q.decidedWords(d4), 'Full auto did not ask you. It chose: spaces');
  assert.equal(Q.decidedWords(d6), 'You left it to the Mission. It chose: MIT');
  assert.equal(Q.undoneWords(un), 'Item 5, Docs: Not started before the Mission ended.');
  for (const key of ['finish', 'finishCard', 'decided', 'unasked', 'undone']) {
    const info = Q.INFO_Q[key];
    assert.ok(info?.title && info.what && info.when && info.change, key);
  }
});

test('what Finish it sends: open answers, then changed decided answers (empty keeps its choice), and choices for open and not-asked steps', () => {
  const body = Q.finishBody({ q1: ' 3000 ' }, {}, { q4: ' tabs ', q6: '   ' }, { a7: 'allow', a9: 'nope' }, ['q1'], { approvals: [ua], decided: [d4, d6] });
  assert.deepEqual(body, { action: 'continue', answers: [{ id: 'q1', text: '3000' }, { id: 'q4', text: 'tabs' }], approvals: [{ id: 'a7', choice: 'allow' }] });
  assert.deepEqual(Q.finishBody({}, {}, {}, {}, [], { approvals: [ua], decided: [d4] }), { action: 'continue', answers: [] }, 'nothing chosen: no approvals key (the body stays as before)');
  assert.deepEqual(Q.finishBody({ q1: 'x' }, { q1: true }, {}, {}, ['q1'], {}), { action: 'continue', answers: [{ id: 'q1', skip: true }] });
});

test('the strip\'s Finish it is for the card in the same chat box, else the same conversation', () => {
  const seatA = { name: 'A' };
  const seatB = { name: 'B' };
  const from = (seat) => ({ closest: (selector) => (selector === '[data-composer-seat]' ? seat : null) });
  assert.equal(Q.finishMine({ sessionId: 's1', from: from(seatA) }, seatA, 's1'), true);
  assert.equal(Q.finishMine({ sessionId: 's1', from: from(seatB) }, seatA, 's1'), false, 'another Split Plus pane on the same conversation');
  assert.equal(Q.finishMine({ sessionId: 's1', from: null }, seatA, 's1'), true, 'no button: by conversation');
  assert.equal(Q.finishMine({ sessionId: 's2', from: null }, seatA, 's1'), false);
  assert.equal(Q.finishMine(null, seatA, 's1'), false);
});

// ---- drawn ----
const finishedCard = (strip, run = {}) => cardWith('finished', runAt(Date.now(), { status: 'incomplete', endedAt: Date.now() - 60000, items, report: 'Mission finished.', needs: 'decide', waitFor: 0, ...run }), { canContinue: true, ...strip });

test('drawn: the strip shows Finish it with its (i) only after an end it can finish; it asks this chat box\'s card to open', async () => {
  const card = finishedCard({ decided: [d4], unasked: [ua], undone: [un] }, { hasAside: true });
  const page = loadPage(() => ({ json: card }));
  let tree = await drawPart(page, 'mission-run');
  const finish = buttonText(tree, 'Finish it');
  assert.ok(finish, 'Finish it on the strip');
  assert.equal(finish.node.props['data-main'], 'true', 'drawn as the main-looking button');
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Finish it'));
  assert.doesNotMatch(textOf(tree), /type \/mission resume/, 'the old aside line goes when Finish it can take them up');
  const heard = [];
  page.win.addEventListener('dsh-mission:finish', (event) => heard.push(event.detail));
  const pressed = { closest: () => null };
  finish.node.props.onClick({ currentTarget: pressed });
  assert.equal(heard.length, 1);
  assert.equal(heard[0].sessionId, 's1');
  assert.equal(heard[0].from, pressed);
  assert.equal(posts(page).length, 0, 'it posts nothing itself');
  // The checklist says what the Mission does when it needs you, and the item Full auto set aside.
  await buttonText(tree, `Checklist (${items.length})`).node.props.onClick();
  tree = redrawPart(page, 'mission-run');
  assert.match(textOf(tree), /When it needs you: Full auto/);
  assert.match(textOf(tree), /NEEDS YOU2\. Add the option · not done without your yes \(Full auto does not ask\)/);
  // Not when nothing can be finished, and never while it runs.
  for (const other of [finishedCard({ canContinue: false, decided: [d4] }, { hasAside: true }), cardWith('running', runAt(Date.now()), { canContinue: true })]) {
    const page2 = loadPage(() => ({ json: other }));
    const tree2 = await drawPart(page2, 'mission-run');
    assert.ok(!buttonText(tree2, 'Finish it'));
  }
  const page3 = loadPage(() => ({ json: finishedCard({ canContinue: false }, { hasAside: true }) }));
  assert.match(textOf(await drawPart(page3, 'mission-run')), /type \/mission resume to take them up again/, 'old runs with items set aside keep their line');
});

test('drawn: a card holding only what it decided itself starts folded; the strip\'s Finish it unfolds it here, never in another pane', async () => {
  const card = finishedCard({ decided: [d4] });
  const page = loadPage(() => ({ json: card }));
  let tree = await drawPart(page, 'mission-questions');
  assert.equal(textOf(byClass(tree, 'dshu-state')[0]), 'Finish the Mission: 1 decided by it');
  assert.equal(findAll(tree, (n) => n.type === 'textarea').length, 0, 'folded');
  // Another pane's button (its own chat box): this card stays folded.
  const otherSeat = {};
  page.win.dispatchEvent(new CustomEvent('dsh-mission:finish', { detail: { sessionId: 's1', from: { closest: (s) => (s === '[data-composer-seat]' ? otherSeat : null) } } }));
  tree = redrawPart(page, 'mission-questions');
  assert.equal(findAll(tree, (n) => n.type === 'textarea').length, 0);
  // This chat box's button.
  page.win.dispatchEvent(new CustomEvent('dsh-mission:finish', { detail: { sessionId: 's1', from: { closest: (s) => (s === '[data-composer-seat]' ? page.seat : null) } } }));
  tree = redrawPart(page, 'mission-questions');
  const text = textOf(tree);
  assert.match(text, /Finish the Mission/);
  assert.match(text, /It has ended and decided these itself\. Change any of them, then press Finish it, or leave them as they are\./);
  assert.match(text, /Decided by the Mission/);
  assert.match(text, /Full auto did not ask you\. It chose: spaces/);
  assert.match(text, /Empty keeps its choice\. A different answer does the items again with yours\./);
  const field = findAll(tree, (n) => n.type === 'textarea')[0];
  assert.equal(field.props.placeholder, 'Your answer (empty keeps its choice)');
  assert.equal(field.props['aria-label'], 'Change what it chose for: Tabs or spaces?');
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Decided by the Mission'));
  assert.ok(!byClass(tree, 'dsh-ms-qskip').length, 'no Skip chip for a decided question');
});

test('drawn: Finish it — open, decided, not-asked and undone in one card; it sends them, then the time, then the same Mission goes on', async () => {
  const card = finishedCard({ questions: [q1], decided: [d4, d6], unasked: [ua], undone: [un] });
  const quote = { run: true, minutes: 20, needed: 20, noLimit: false, perItem: 10, measured: true, units: 2, cap: 30, capped: false, stepMinutes: 3, raised: false, late: 0 };
  const running = cardWith('running', runAt(Date.now(), { continues: 1 }), {});
  let current = card;
  const page = loadPage((method, body) => {
    if (method === 'POST' && body.minutes === undefined) return { json: { ...card, said: '', quote } };
    if (method === 'POST') { current = running; return { json: { ...running, said: 'The Mission continues.' } }; }
    return { json: current };
  });
  let tree = await drawPart(page, 'mission-questions');
  const text = textOf(tree);
  assert.match(text, /Finish the Mission/);
  assert.ok(text.indexOf('Which port?') < text.indexOf('Decided by the Mission'), 'open questions first');
  assert.ok(text.indexOf('Decided by the Mission') < text.indexOf('Not asked: it needs your yes'));
  assert.ok(text.indexOf('Not asked: it needs your yes') < text.indexOf('Not done yet'));
  assert.match(text, /You left it to the Mission\. It chose: MIT/);
  assert.match(text, /Change the existing file src\/app\.js/);
  assert.match(text, /It went on without this\. If you leave it, nothing changes\./);
  assert.match(text, /The helper says: “The option is read there\.”/);
  assert.match(text, /Item 5, Docs: Not started before the Mission ended\./);
  for (const label of ['About Not asked: it needs your yes', 'About Not done yet', 'About Finish it', 'About Finish the Mission']) assert.ok(buttonsOf(tree).some((b) => b.label === label), label);
  const finish = buttonText(tree, 'Finish it');
  assert.equal(finish.node.props.disabled, false);
  const fields = findAll(tree, (n) => n.type === 'textarea');
  fields[0].props.onChange({ target: { value: '3000' } });
  fields[1].props.onChange({ target: { value: 'tabs' } });
  tree = redrawPart(page, 'mission-questions');
  const allow = byClass(tree, 'dsh-ms-qchip').find((chip) => textOf(chip) === 'Allow');
  allow.props.onClick();
  tree = redrawPart(page, 'mission-questions');
  await buttonText(tree, 'Finish it').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page)[0], { sessionId: 's1', action: 'continue', answers: [{ id: 'q1', text: '3000' }, { id: 'q4', text: 'tabs' }], approvals: [{ id: 'a7', choice: 'allow' }] });
  tree = redrawPart(page, 'mission-questions');
  assert.match(textOf(tree), /How much more time\?/);
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Continue the Mission'));
  await buttonText(tree, 'Continue the Mission').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page)[1], { sessionId: 's1', action: 'continue', answers: [{ id: 'q1', text: '3000' }, { id: 'q4', text: 'tabs' }], approvals: [{ id: 'a7', choice: 'allow' }], minutes: 20 });
  assert.match(textOf(redrawPart(page, 'mission-questions')), /The Mission continues\./);
});

test('review: after the end a step still waiting for your yes says it stays undone (nothing waits any more); a decided question\'s (i) speaks of its choice, not a default', async () => {
  const open = { id: 'a8', kind: 'files', what: 'Change config.json', items: ['2'], askedBy: [{ id: '2', title: 'Add the option' }], choices: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }] };
  const page = loadPage(() => ({ json: finishedCard({ approvals: [open], decided: [d4] }) }));
  const text = textOf(await drawPart(page, 'mission-questions'));
  assert.match(text, /Still waiting for your yes/);
  assert.match(text, /If you leave it, it stays undone\. Allow, then Finish it, takes it up\./);
  assert.doesNotMatch(text, /If you don't answer: it waits/);
  assert.match(Q.INFO_Q.decidedField.change, /Left empty, it keeps its choice/);
  assert.doesNotMatch(`${Q.INFO_Q.decidedField.when} ${Q.INFO_Q.decidedField.change}`, /default|While the Mission has this question/);
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /h\('legend', null, String\(q\.text \?\? ''\), h\(ui\.Info, INFO_Q\.decidedField\)\)/);
});

test('drawn: Finish it with nothing typed still asks the Mission (undone items alone), and its "nothing to finish" is said plainly', async () => {
  const card = finishedCard({ undone: [un] });
  const page = loadPage((method) => (method === 'POST' ? { status: 400, json: { error: 'Nothing to finish: answer a question, change what it decided or allow a step first.' } } : { json: card }));
  let tree = await drawPart(page, 'mission-questions');
  assert.match(textOf(tree), /It has ended with work left\. Press Finish it to give it more time; the same Mission does the rest\./);
  await buttonText(tree, 'Finish it').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page)[0], { sessionId: 's1', action: 'continue', answers: [] });
  tree = redrawPart(page, 'mission-questions');
  assert.match(textOf(tree), /Nothing to finish: answer a question, change what it decided or allow a step first\./);
});

test('drawn: the running card never shows decided or not-asked entries; Ask and wait says nothing is decided on a guess', async () => {
  const card = cardWith('running', runAt(Date.now()), { needs: 'wait', questions: [q1], decided: [d4], unasked: [ua], undone: [un] });
  const page = loadPage(() => ({ json: card }));
  const tree = await drawPart(page, 'mission-questions');
  const text = textOf(tree);
  assert.doesNotMatch(text, /Decided by the Mission|Not asked|Not done yet/);
  assert.match(text, /Items that need your answer or your yes wait for it; the other items go on\. Nothing is decided on a guess\./);
  assert.match(text, /Without an answer nothing is decided on it: the Mission waits for it before it ends\. Its suggestion: 8080\./);
  assert.ok(buttonText(tree, 'Send answers'));
  assert.ok(!buttonText(tree, 'Finish it'));
});

test('drawn: the strip while it waits says the clock is stopped and when it ends; the main button stays Add note or Answer as the server says', async () => {
  const until = Date.now() + 30 * 60000;
  const card = cardWith('waiting', runAt(Date.now(), { waitingForYou: { since: Date.now(), until, quiet: true } }), { questions: [q1], waitUntil: until, main: 'note' });
  const page = loadPage(() => ({ json: card }));
  const strip = await drawPart(page, 'mission-run');
  assert.match(textOf(strip), /Waiting for you · 1 question · nothing else can move · time limit paused/);
  // Late in the evening the end is on the next day ("00:15 tomorrow").
  assert.match(textOf(strip), new RegExp(`With no answer it ends at ${clockOf(until)}( tomorrow)? with its report`));
  assert.ok(!buttonText(strip, 'Finish it'));
  const button = await drawPart(page, 'mission-run-button');
  assert.equal(textOf(byClass(button, 'dsh-ms-main')[0]), 'Add note');
});
