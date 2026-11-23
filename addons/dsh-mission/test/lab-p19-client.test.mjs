// Lab check of the owner's point 19 (20 November 2026, 23:24): F1 a repair helper's setting change that waits for
// your OK after the end (the strip's own card), F2 Start Mission's reason on a new conversation, F3 a typed
// "/mission <goal>" as the first message. Drawn with the stand-in page; the route is a stand-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPage, pureBlock, textOf, byClass, buttonsOf, tick, cardWith, runAt, drawPart, redrawPart, buttonText, posts } from './client-stand-in.mjs';
import { stripOf as stripFrom } from '../lib/strip.js';

const S = pureBlock('mission-strip', ['stripWords', 'slashMissionGoal', 'typedFirstMission', 'INFO']);
const NOW = Date.now();
const OK = { n: 1, id: 'a1', kind: 'repair', by: 'repair', fix: 'setting', what: 'Change Settings → Mission → Helpers at once from 4 to 2', reason: 'two helpers fight over one file', items: [], askedBy: [], choices: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }], status: 'open' };
const doneRun = (extra = {}) => runAt(NOW, { status: 'complete', endedAt: NOW - 60000, items: [{ id: '1', title: 'one', status: 'verified' }, { id: '2', title: 'two', status: 'verified' }], report: 'Mission complete: all 2 items done and checked.', ...extra });

// ---- F1 ----
test('F1: lib/strip.js after the end lists the changes that wait for your OK (also Full auto\'s), keeps them out of Finish it\'s card, and never makes it continuable', () => {
  const approvals = [{ ...OK, status: 'open' }, { ...OK, id: 'a2', status: 'unasked' }, { ...OK, id: 'a3', kind: 'files', by: '', fix: '', status: 'open' }];
  const done = stripFrom({ run: { status: 'complete', kind: 'long', items: [], questions: [], approvals, oks: ['a1', 'a2'], canContinue: false } });
  assert.deepEqual(done.oks.map((one) => [one.id, one.status]), [['a1', 'open'], ['a2', 'unasked']]);
  assert.equal(done.canContinue, false);
  assert.deepEqual(done.approvals, []);
  // With real work left (Finish it), the OKs still go only to the strip's own card.
  const more = stripFrom({ run: { status: 'stopped', kind: 'long', items: [], questions: [], approvals, oks: ['a1', 'a2'], canContinue: true } });
  assert.deepEqual(more.approvals.map((one) => one.id), ['a3']);
  assert.deepEqual(more.unasked, []);
  assert.equal(more.canContinue, true);
  // While it runs: no OKs; the card shows the approval as before.
  const live = stripFrom({ run: { status: 'running', kind: 'long', items: [], questions: [], approvals, oks: [], goalPhase: 'active' } });
  assert.deepEqual(live.oks, []);
  assert.deepEqual(live.approvals.map((one) => one.id), ['a1', 'a3']);
});

test('F1: the done strip says plainly that a change waits for your OK, and what to press; a complete Mission stays "Done", with nothing "left for you"', () => {
  const card = cardWith('finished', doneRun(), { oks: [OK] });
  const said = S.stripWords(card, NOW);
  assert.equal(said.words, 'Done · 1 change waits for your OK · report ready');
  assert.match(said.next, /^Press "1 change waits for your OK" to see it and Allow or Deny; nothing runs again\. Send talks to the assistant again\./);
  assert.doesNotMatch(`${said.words} ${said.next}`, /left for you|question|Finish it/);
  assert.equal(S.stripWords(cardWith('finished', doneRun(), { oks: [OK, { ...OK, id: 'a2' }] }), NOW).words, 'Done · 2 changes wait for your OK · report ready');
  assert.equal(S.stripWords(cardWith('finished', doneRun(), {}), NOW).words, 'Done · report ready');
});

test('drawn F1: the button opens the card with the change, the repair helper\'s reason and Allow / Deny; Allow posts ok and says what was done', async () => {
  const card = cardWith('finished', doneRun(), { oks: [OK] });
  const after = cardWith('finished', doneRun(), { oks: [] });
  let shown = card;
  const page = loadPage((method, body) => {
    if (method === 'POST' && body.action === 'ok') { shown = after; return { json: { ...after, said: 'Changed: Mission → Helpers at once: 4 → 2. The Mission stays complete; nothing runs again.' } }; }
    return { json: shown };
  });
  let tree = await drawPart(page, 'mission-run');
  const button = buttonText(tree, '1 change waits for your OK');
  assert.ok(button, 'the button');
  assert.equal(button.node.props['data-main'], 'true', 'the main button when nothing else is left');
  assert.equal(button.node.props['aria-expanded'], false);
  assert.ok(!buttonText(tree, 'Finish it'), 'no Finish it just for this');
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Changes that wait for your OK'));
  assert.equal(byClass(tree, 'dsh-ms-qappr').length, 0, 'the card is shut until pressed');
  button.node.props.onClick();
  tree = redrawPart(page, 'mission-run');
  const text = textOf(tree);
  assert.match(text, /Changes that wait for your OK/);
  assert.match(text, /Change Settings → Mission → Helpers at once from 4 to 2/);
  assert.match(text, /The repair helper said: “two helpers fight over one file”/);
  assert.match(text, /Allow makes this change now\. Deny leaves it as it is\. The Mission stays as it ended; nothing runs again\./);
  assert.ok(buttonText(tree, 'Deny'));
  await buttonText(tree, 'Allow').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'ok', id: 'a1', choice: 'allow' }]);
  tree = redrawPart(page, 'mission-run');
  assert.match(textOf(tree), /Changed: Mission → Helpers at once: 4 → 2\. The Mission stays complete; nothing runs again\./);
  assert.ok(!buttonText(tree, '1 change waits for your OK'), 'gone once answered');
});

test('drawn F1: with Finish it on the strip too, Finish it stays the main button and the OK button sits beside it; Full auto\'s change says it was not asked', async () => {
  const card = cardWith('finished', doneRun({ status: 'stopped' }), { canContinue: true, undone: [{ id: '2', title: 'two', mark: 'NOT DONE', why: 'x' }], oks: [{ ...OK, status: 'unasked' }] });
  const page = loadPage(() => ({ json: card }));
  let tree = await drawPart(page, 'mission-run');
  assert.equal(buttonText(tree, 'Finish it').node.props['data-main'], 'true');
  const button = buttonText(tree, '1 change waits for your OK');
  assert.equal(button.node.props['data-main'], undefined);
  button.node.props.onClick();
  tree = redrawPart(page, 'mission-run');
  assert.match(textOf(tree), /Full auto did not ask this while it ran\./);
});

// ---- F2 ----
test('drawn F2: a conversation with no message yet whose card is not ready says what to do first and never names Recon outside Recon', async () => {
  const page = loadPage(() => ({ json: { ...cardWith('none', null), runButton: false, hasThread: false } }));
  const tree = await drawPart(page, 'mission-run-button');
  const start = buttonsOf(tree).find((b) => /Start Mission/.test(b.text));
  assert.equal(start.label, 'Start Mission (not available here). Send a first message to start this thread; then Start Mission works here.');
  assert.doesNotMatch(start.label, /Recon|helper/);
  const helper = loadPage(() => ({ json: { ...cardWith('none', null), runButton: false, runButtonWhy: 'helper' } }));
  assert.match(buttonsOf(await drawPart(helper, 'mission-run-button')).find((b) => /Start Mission/.test(b.text)).label, /this is a helper's thread, and a helper never starts a Mission\.$/);
  const recon = loadPage(() => ({ json: { ...cardWith('none', null), runButton: false, runButtonWhy: 'recon' } }));
  assert.match(buttonsOf(await drawPart(recon, 'mission-run-button')).find((b) => /Start Mission/.test(b.text)).label, /Recon keeps Missions out unless Settings → Recon allows them\.$/);
});

test('drawn F2: "nothing changed" with no card in hand is never kept as a card; it looks again in full, and Start Mission works on the new conversation', async () => {
  let looks = 0;
  const full = { ...cardWith('none', null), hasThread: false };
  const page = loadPage((method, body) => {
    if (method !== 'GET') return { json: full };
    looks += 1;
    return looks === 1 ? { json: { same: true, stamp: 'old' } } : { json: full };
  });
  const tree = await drawPart(page, 'mission-run-button');
  const start = buttonsOf(tree).find((b) => /Start Mission/.test(b.text));
  assert.equal(start.label, 'Start Mission');
  assert.notEqual(start.node.props.disabled, true);
  assert.ok(looks >= 2, 'it looked again for the whole card');
});

// ---- F3 ----
test('F3: the goal of a typed /mission (three words or more, not one of its own words); only a first message, and never in Recon or a helper', () => {
  assert.equal(S.slashMissionGoal('/mission LABRP write two files'), 'LABRP write two files');
  assert.equal(S.slashMissionGoal('/Mission LABRP write two files'), 'LABRP write two files');
  for (const text of ['/mission', '/mission resume', '/mission back 3', '/mission auto do the two files', '/mission ask auto do it', '/mission two words', 'LABRP write two files', '/missions a b c', '/goal ship it now']) assert.equal(S.slashMissionGoal(text), '', text);
  const enter = { key: 'Enter', isTrusted: true };
  const text = '/mission LABRP write two files';
  assert.equal(S.typedFirstMission(enter, 'send', text, null, 'That thread is not open.', false), 'LABRP write two files', 'a thread not open yet, not in Recon');
  // Review: a missing card is not always "not open yet". The first look still on its way, failed looks, a Recon tab or
  // an unknown tab: Enter goes to the app's own /mission.
  assert.equal(S.typedFirstMission(enter, 'send', text, null), '', 'the first look still on its way');
  assert.equal(S.typedFirstMission(enter, 'send', text, null, 'HTTP 500', false), '', 'failed looks');
  assert.equal(S.typedFirstMission(enter, 'send', text, null, 'That thread is not open.', true), '', 'not open yet, in Recon');
  assert.equal(S.typedFirstMission(enter, 'send', text, null, 'That thread is not open.', undefined), '', 'not open yet, tab not known');
  assert.equal(S.typedFirstMission(enter, 'send', text, { hasThread: false, run: null, runButton: false }), '', 'no Mission may start here');
  assert.equal(S.typedFirstMission(enter, 'send', text, { hasThread: false, run: null, runButton: true }), 'LABRP write two files');
  assert.equal(S.typedFirstMission(enter, 'send', text, { hasThread: true, run: null }), '', 'a later message: the app\'s own /mission');
  assert.equal(S.typedFirstMission(enter, 'send', text, { hasThread: false, run: { status: 'complete' } }), '');
  assert.equal(S.typedFirstMission(enter, 'send', text, { hasThread: false, runButtonWhy: 'recon' }), '');
  const no = 'That conversation is not open.';
  assert.equal(S.typedFirstMission(enter, 'note', text, null, no, false), '');
  assert.equal(S.typedFirstMission({ key: 'Enter', isTrusted: false }, 'send', text, null, no, false), '', 'never a synthetic key');
  assert.equal(S.typedFirstMission({ ...enter, shiftKey: true }, 'send', text, null, no, false), '');
  assert.equal(S.typedFirstMission({ ...enter, isComposing: true }, 'send', text, null, no, false), '');
});

const pressEnter = (page) => {
  const ev = new Event('keydown', { cancelable: true });
  Object.assign(ev, { key: 'Enter' });
  Object.defineProperty(ev, 'target', { value: page.editor });
  Object.defineProperty(ev, 'isTrusted', { value: true });
  page.seat.dispatch(ev);
  return ev;
};

test('drawn F3: Enter on "/mission <goal>" as the first message asks the Start Mission question and starts the Mission with the goal; nothing goes out as chat', async () => {
  const card = { ...cardWith('none', null), hasThread: false };
  const page = loadPage((method, body) => (method === 'POST' ? { json: { ...card, said: '' } } : { json: card }));
  await drawPart(page, 'mission-run-button');
  page.editor.innerText = '/mission LABRP write two files';
  const ev = pressEnter(page);
  assert.equal(ev.defaultPrevented, true, 'the app never sends it');
  await tick(60);
  assert.equal(page.asked.length, 1, 'the Start Mission question first');
  assert.match(page.asked[0], /Start a Mission\?/);
  assert.deepEqual(posts(page), [{ sessionId: 's1', action: 'start', goal: 'LABRP write two files' }]);
  assert.equal(page.sendButton.clicks, 0, 'no chat message');
  assert.equal(page.editor.innerText, '', 'the box is emptied once it started');
});

test('drawn F3: in a conversation that is not open yet the goal (without /mission) is its first message, then the Mission starts from it; a later message keeps the app\'s /mission', async () => {
  const page = loadPage((method, body) => (method === 'GET' && body.defaults === '1' ? { json: { defaults: { minutes: 60, laps: 0, helpers: 4, needs: 'ask', waitAsk: 30, waitHold: 0 }, mode: 'auto', isolated: false } } : { status: 400, json: { error: 'That conversation is not open.' } }));
  const drafts = [];
  const props = { sessionId: 's1', inputActions: { setDraft: (text) => { drafts.push(text); page.editor.innerText = text; } } };
  await drawPart(page, 'mission-run-button', props);
  // It learns first whether the new conversation would be isolated (Recon): here it would not.
  await tick(30);
  page.editor.innerText = '/mission LABRP write two files';
  const ev = pressEnter(page);
  assert.equal(ev.defaultPrevented, true);
  await tick(150);
  assert.equal(page.asked.length, 1);
  assert.deepEqual(drafts, ['LABRP write two files']);
  assert.equal(page.sendButton.clicks, 1, 'sent as its first message, as Start Mission does there');
  const tip = textOf(byClass(redrawPart(page, 'mission-run-button', props), 'dsh-ms-runtip'));
  assert.match(tip, /Sending your message first, then the Mission starts/);
  // A conversation that has messages already: the app's own /mission command handles it (no confirmation).
  const later = loadPage(() => ({ json: { ...cardWith('none', null), hasThread: true } }));
  await drawPart(later, 'mission-run-button');
  later.editor.innerText = '/mission LABRP write two files';
  assert.equal(pressEnter(later).defaultPrevented, false);
  await tick(30);
  assert.deepEqual(posts(later), []);
});

test('drawn F3: when the start fails, or the question is answered no, the text stays in the box and the tip says so', async () => {
  const card = { ...cardWith('none', null), hasThread: false };
  const page = loadPage((method) => (method === 'POST' ? { status: 400, json: { error: 'This thread has no folder.' } } : { json: card }));
  await drawPart(page, 'mission-run-button');
  page.editor.innerText = '/mission LABRP write two files';
  pressEnter(page);
  await tick(60);
  assert.equal(page.editor.innerText, '/mission LABRP write two files');
  assert.match(textOf(byClass(redrawPart(page, 'mission-run-button'), 'dsh-ms-runtip')), /^The Mission did not start: This thread has no folder\. Your text is still in the chat box\.$/);
});

// ---- review of the lab check (20 November, late) ----
const NOT_OPEN = { status: 400, json: { error: 'That conversation is not open.' } };
const DEFAULTS = { minutes: 60, laps: 0, helpers: 4, needs: 'ask', waitAsk: 30, waitHold: 0 };

test('review F3: a new Recon conversation that is not open yet: Enter on "/mission <goal>" goes to the app\'s own /mission; nothing is sent as chat', async () => {
  const page = loadPage((method, body) => (method === 'GET' && body.defaults === '1' ? { json: { defaults: DEFAULTS, mode: 'recon', isolated: true } } : NOT_OPEN));
  const drafts = [];
  const props = { sessionId: 's1', inputActions: { setDraft: (text) => { drafts.push(text); page.editor.innerText = text; } } };
  await drawPart(page, 'mission-run-button', props);
  await tick(30);
  assert.ok(page.calls.some((c) => c.method === 'GET' && c.body.defaults === '1' && c.body.sessionId === 's1'), 'it asked whether the new conversation is isolated');
  page.editor.innerText = '/mission LABRP write two files';
  assert.equal(pressEnter(page).defaultPrevented, false, 'the app\'s /mission says why');
  await tick(60);
  assert.equal(page.asked.length, 0);
  assert.deepEqual(drafts, []);
  assert.equal(page.sendButton.clicks, 0);
});

test('review F3: while the first look is on its way (or looks failed) Enter on "/mission <goal>" goes to the app; only a definite "not open" outside Recon is caught', async () => {
  // The first look never answers while Enter is pressed.
  const pending = loadPage(() => ({ status: 400, json: { error: 'That conversation is not open.' } }));
  pending.fake.render(pending.fake.React.createElement(pending.parts['mission-run-button'], { sessionId: 's1' }));
  pending.editor.innerText = '/mission make every test pass now';
  assert.equal(pressEnter(pending).defaultPrevented, false);
  await tick(30);
  assert.equal(pending.sendButton.clicks, 0);
  assert.deepEqual(posts(pending), []);
  // Looks that fail with another reason (three in a row let the card go): not "not open", so not caught.
  const failing = loadPage(() => ({ status: 500, json: { error: 'Something broke.' } }));
  await drawPart(failing, 'mission-run-button');
  failing.editor.innerText = '/mission make every test pass now';
  assert.equal(pressEnter(failing).defaultPrevented, false);
  await tick(30);
  assert.equal(failing.sendButton.clicks, 0);
  // An older server that does not say whether it is isolated: not caught either.
  const older = loadPage((method, body) => (method === 'GET' && body.defaults === '1' ? { json: { defaults: DEFAULTS, mode: 'auto' } } : NOT_OPEN));
  await drawPart(older, 'mission-run-button');
  await tick(30);
  older.editor.innerText = '/mission make every test pass now';
  assert.equal(pressEnter(older).defaultPrevented, false);
});

test('review F3: a start that waits for the first message is dropped at once, with the reason, when the conversation turns out to be Recon\'s or a helper\'s', async () => {
  const W = pureBlock('waiting-start', ['waitingStart', 'waitingStep']);
  const me = {};
  Object.assign(W.waitingStart, { goal: 'LABRP write two files', at: Date.now(), owner: me, id: '', orphan: false });
  assert.equal(W.waitingStep(me, 's1', { runButton: false, runButtonWhy: 'recon', hasThread: true }, Date.now()), 'refuse');
  assert.equal(W.waitingStep(me, 's1', { runButton: false, runButtonWhy: 'helper' }, Date.now()), 'refuse');
  assert.equal(W.waitingStep(me, 's1', { runButton: true, busy: true }, Date.now()), 'wait');
  assert.equal(W.waitingStep(me, 's1', { runButton: true }, Date.now()), 'start');
  // Drawn: Start Mission on a conversation that was not open; the card that comes back says Recon.
  let open = false;
  const recon = { ...cardWith('none', null), runButton: false, runButtonWhy: 'recon', hasThread: true };
  const page = loadPage((method, body) => {
    if (method === 'GET' && body.defaults === '1') return { json: { defaults: DEFAULTS, mode: 'auto', isolated: false } };
    return open ? { json: recon } : NOT_OPEN;
  });
  const props = { sessionId: 's1', inputActions: { setDraft: (text) => { page.editor.innerText = text; } } };
  await drawPart(page, 'mission-run-button', props);
  await tick(30);
  page.editor.innerText = '/mission LABRP write two files';
  assert.equal(pressEnter(page).defaultPrevented, true);
  await tick(150);
  assert.equal(page.sendButton.clicks, 1);
  open = true;
  page.win.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId: 's1' } }));
  await tick(150);
  const tip = textOf(byClass(redrawPart(page, 'mission-run-button', props), 'dsh-ms-runtip'));
  assert.equal(tip, 'No Mission was started. A Mission cannot start here: Recon keeps Missions out unless Settings → Recon allows them.');
  assert.deepEqual(posts(page), [], 'never a start');
});

test('review F1: the Allow / Deny message goes once the strip leaves "finished"; a new run starts with the OK card shut', async () => {
  const card = cardWith('finished', doneRun(), { canContinue: true, undone: [{ id: '2', title: 'two', mark: 'NOT DONE', why: 'x' }], oks: [OK] });
  const after = cardWith('finished', doneRun(), { canContinue: true, undone: [{ id: '2', title: 'two', mark: 'NOT DONE', why: 'x' }], oks: [] });
  let shown = card;
  const page = loadPage((method, body) => {
    if (method === 'POST' && body.action === 'ok') { shown = after; return { json: { ...after, said: 'Changed: Mission → Helpers at once: 4 → 2. The Mission stays complete; nothing runs again.' } }; }
    return { json: shown };
  });
  let tree = await drawPart(page, 'mission-run');
  buttonText(tree, '1 change waits for your OK').node.props.onClick();
  tree = redrawPart(page, 'mission-run');
  await buttonText(tree, 'Allow').node.props.onClick();
  await tick(30);
  assert.match(textOf(redrawPart(page, 'mission-run')), /nothing runs again/);
  // Finish it: the same run runs again.
  shown = cardWith('running', doneRun({ status: 'running', endedAt: 0 }), {});
  page.win.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId: 's1' } }));
  await tick(60);
  redrawPart(page, 'mission-run');
  assert.doesNotMatch(textOf(redrawPart(page, 'mission-run')), /nothing runs again/);
  // A later run of the same chat with its own OK: its card stays shut until pressed.
  const page2 = loadPage(() => ({ json: shown }));
  shown = card;
  tree = await drawPart(page2, 'mission-run');
  buttonText(tree, '1 change waits for your OK').node.props.onClick();
  redrawPart(page2, 'mission-run');
  shown = cardWith('finished', doneRun({ id: 'r2' }), { oks: [{ ...OK, id: 'b1' }] });
  page2.win.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId: 's1' } }));
  await tick(60);
  redrawPart(page2, 'mission-run');
  tree = redrawPart(page2, 'mission-run');
  assert.equal(buttonText(tree, '1 change waits for your OK').node.props['aria-expanded'], false);
  assert.equal(byClass(tree, 'dsh-ms-qappr').length, 0);
});

test('review F1: while a change waits for your OK the strip stays after × and after a day, without ×; with nothing waiting it goes as before', async () => {
  // More than a day after the end.
  const old = doneRun({ endedAt: NOW - 2 * 24 * 3600000 });
  const page = loadPage(() => ({ json: cardWith('finished', old, { canContinue: true, undone: [{ id: '2', title: 'two', mark: 'NOT DONE', why: 'x' }], oks: [OK] }) }));
  let tree = await drawPart(page, 'mission-run');
  assert.ok(buttonText(tree, '1 change waits for your OK'), 'the button is still there');
  assert.ok(!buttonText(tree, 'Finish it'), 'Finish it keeps its day');
  assert.ok(!buttonsOf(tree).some((b) => b.label === 'Close'), 'no × while it waits');
  const gone = loadPage(() => ({ json: cardWith('finished', old, { oks: [] }) }));
  assert.equal(await drawPart(gone, 'mission-run'), null);
  // Closed with × before (an earlier version): still shown while it waits.
  const fresh = doneRun({ id: 'r9' });
  const closed = loadPage(() => ({ json: cardWith('finished', fresh, { oks: [OK] }) }));
  closed.win.localStorage.setItem('dsh-mission.dismissed', JSON.stringify([`r9:${fresh.endedAt}`]));
  tree = await drawPart(closed, 'mission-run');
  assert.ok(buttonText(tree, '1 change waits for your OK'));
  assert.match(S.INFO.oks.when, /stay above the chat box until you answer/);
});
