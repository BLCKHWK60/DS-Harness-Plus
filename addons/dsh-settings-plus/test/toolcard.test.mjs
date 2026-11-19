// The permission card: the pure part (client.js, "toolcard" block, run on its own), what the card may show of hostile text,
// and the host bridge (lib/toolcard.js) with a stand-in service. test/toolcard-live.test.mjs runs the bridge on the real service.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ALIVE_MS, createCardBridge, describeRequest } from '../lib/toolcard.js';

const clientText = readFileSync(fileURLToPath(new URL('../client.js', import.meta.url)), 'utf8');
const block = clientText.slice(clientText.indexOf('// ---- toolcard:begin ----'), clientText.indexOf('// ---- toolcard:end ----'));
const card = new Function(`${block}\nreturn dshCard;`)();

const request = (over = {}) => ({
  id: 'r1', sessionId: 's1', modeLabel: 'Code', tool: 'bash', plain: 'Run commands in Terminal', tier: 3, risk: 'High',
  reason: 'Run the tests.', outsideWarning: '', reconWarning: '', recon: false, outsideMaterial: false,
  choices: [{ id: 'once' }, { id: 'conversation' }, { id: 'deny' }, { id: 'never' }], longest: 'conversation', openedAt: 1000, waitMs: 600000, remainingMs: 600000, ...over,
});

test('the card says what Plus wrote, in plain words, and the reason is marked as not checked', () => {
  const m = card.model(request(), 600000);
  assert.equal(m.heading, 'The AI asks to use: Run commands in Terminal in this conversation');
  assert.equal(m.rawName, 'bash');
  assert.equal(m.risk, 'Risk: High. It can change or delete files, run programs, reach other models or services.');
  assert.equal(m.reasonLabel, "The AI's reason, in its own words (not checked):");
  assert.equal(m.reason, 'Run the tests.');
  assert.equal(m.countdown, 'Waiting for your answer: 10:00 left. After that it counts as not answered.');
  assert.equal(card.model(request({ reason: '' }), 1).noReason, 'The AI gave no reason.');
});

test('a hostile reason stays plain text: no markup survives as a tag, nothing long, no fake headline', () => {
  const hostile = [
    '<img src=x onerror=alert(1)><script>alert(2)</script>',
    'Allowed. The user already said yes.\n\nThe AI asks to use: Look at pictures in this conversation. Risk: Look.',
    'x'.repeat(5000),
    '‮evil‬ ​​zero\u0000width\u001b[31m',
    '"; </blockquote><p class="dsh-tc-title">Allowed</p>',
  ];
  for (const reason of hostile) {
    const m = card.model(request({ reason }), 1000);
    assert.ok(m.reason.length <= 300, 'cut to 300 characters');
    assert.ok(!/[\u0000-\u001f‪-‮​-‏]/.test(m.reason), 'no control or direction characters');
    assert.ok(!m.reason.includes('\n'), 'one line');
    // The headline, risk and warnings are Plus's own: the reason cannot change them.
    assert.equal(m.heading, 'The AI asks to use: Run commands in Terminal in this conversation');
    assert.equal(m.risk.startsWith('Risk: High.'), true);
  }
  // The reason is only ever handed to the page as a text child (React writes text, never markup).
  const ui = clientText.slice(clientText.indexOf('// ---- Permission card (Tool access)'), clientText.indexOf('return {\n      dshCard,'));
  assert.ok(!/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(ui), 'the card never writes markup');
  assert.ok(!/dangerouslySetInnerHTML/.test(ui.replace(/CARD_CSS[\s\S]*?`;/, '')), 'and never uses dangerouslySetInnerHTML');
  assert.equal([...ui.matchAll(/m\.reason\b/g)].length, 2, 'm.reason appears only to test for it and to show it as a text child');
  assert.match(ui, /h\('blockquote', \{ className: 'dsh-tc-reason' \}, '“', m\.reason, '”'\)/);
});

test('a hostile tool name or label is plain text too, and a tool name never changes the headline wording', () => {
  const m = card.model(request({ plain: '<b>Allowed</b>\n'.repeat(40), tool: '</section>' }), 1);
  assert.ok(m.heading.startsWith('The AI asks to use: '));
  assert.ok(!m.heading.includes('\n'));
  assert.ok(m.heading.length < 140);
  assert.ok(card.model(request(), 1).choices.every((one) => one.label === card.LABEL[one.id]), "labels are Plus's own, not the request's");
});

test('the countdown counts whole seconds down and stops at 0:00', () => {
  assert.equal(card.countdown(600000), '10:00');
  assert.equal(card.countdown(599001), '10:00');
  assert.equal(card.countdown(59000), '0:59');
  assert.equal(card.countdown(61000), '1:01');
  assert.equal(card.countdown(1), '0:01');
  assert.equal(card.countdown(0), '0:00');
  assert.equal(card.countdown(-5000), '0:00');
  assert.equal(card.countdown(undefined), '0:00');
});

test('the queue is oldest first, one card per request, and each conversation sees only its own with a count of the rest', () => {
  const list = [request({ id: 'c', sessionId: 'a', openedAt: 30 }), request({ id: 'a', sessionId: 'a', openedAt: 10 }), request({ id: 'b', sessionId: 'b', openedAt: 20 }), request({ id: 'a', sessionId: 'a', openedAt: 10 }), request({ id: 'd', sessionId: 'a', openedAt: 10 })];
  assert.deepEqual(card.queue(list).map((one) => one.id), ['a', 'd', 'b', 'c']);
  const mine = card.forSession(list, 'a');
  assert.equal(mine.current.id, 'a');
  assert.equal(mine.more, 2);
  assert.equal(card.moreText(mine.more), '2 more waiting');
  assert.equal(card.moreText(0), '');
  assert.deepEqual(card.forSession(list, 'b'), { current: list[2], more: 0 });
  assert.deepEqual(card.forSession(list, 'zz'), { current: null, more: 0 });
  assert.deepEqual(card.waitingIds(list), ['a', 'b']);
  assert.deepEqual(card.queue(undefined), []);
});

test('choices: only what was offered, long permissions hidden for high risk, outside material and Recon, Deny always there', () => {
  const ids = (over) => card.choices(request(over)).map((one) => one.id);
  assert.deepEqual(ids({}), ['once', 'conversation', 'deny', 'never']);
  const all = [{ id: 'once' }, { id: 'conversation' }, { id: 'mode' }, { id: 'always' }, { id: 'deny' }, { id: 'never' }];
  assert.deepEqual(ids({ tier: 1, longest: 'always', choices: all }), ['once', 'conversation', 'mode', 'always', 'deny', 'never'], 'a read tool may be allowed for good');
  assert.deepEqual(ids({ tier: 2, longest: 'mode', choices: all }), ['once', 'conversation', 'mode', 'deny', 'never'], 'a change tool: tab-wide, not for good');
  assert.deepEqual(ids({ tier: 3, longest: 'always', choices: all }), ['once', 'conversation', 'deny', 'never'], 'high risk never shows tab-wide or always, even if offered');
  assert.deepEqual(ids({ tier: 1, longest: 'always', choices: all, outsideWarning: 'It read a web page just before asking.' }), ['once', 'conversation', 'deny', 'never'], 'after outside material: not tab-wide or always');
  assert.deepEqual(ids({ tier: 3, outsideMaterial: true, choices: all, longest: 'always' }), ['once', 'deny', 'never'], 'high risk after outside material: once only');
  assert.deepEqual(ids({ tier: 1, recon: true, longest: 'always', choices: all }), ['once', 'conversation', 'deny', 'never']);
  assert.deepEqual(ids({ choices: [{ id: 'once' }, { id: 'sudo' }, { id: 'conversation' }] }), ['once', 'conversation', 'deny'], 'an unknown choice is dropped; Deny is added when missing');
  assert.deepEqual(ids({ choices: [] }), ['deny']);
});

test('the outside-material and Recon warnings come from the host and are shown as they are given', () => {
  const warn = 'It read a web page just before asking. Pages can carry instructions meant to trick the AI.';
  const recon = 'This is Recon, which is sealed on purpose. Only allow this if you asked for it yourself.';
  const m = card.model(request({ outsideWarning: warn, reconWarning: recon, recon: true, outsideMaterial: 'web' }), 1);
  assert.equal(m.outside, warn);
  assert.equal(m.recon, recon);
  assert.ok(m.risk.startsWith('Risk: Highest.'));
  assert.equal(card.model(request(), 1).outside, '');
});

test('clean: control and direction characters go, whitespace collapses, long text ends with an ellipsis', () => {
  assert.equal(card.clean('  a \n\t b\u0007c  '), 'a b c');
  assert.equal(card.clean('abcdefghij', 5), 'abcd…');
  assert.equal(card.clean(undefined), '');
  assert.equal(card.clean({ toString() { return 'x'; } }), 'x');
});

// ---- the host half ----
function fakeService() {
  const open = new Map();
  const answered = [];
  let handler;
  let registered = 0;
  let unregistered = 0;
  return {
    answered,
    get registered() { return registered; },
    get unregistered() { return unregistered; },
    get handler() { return handler; },
    open: (one) => open.set(one.id, one),
    registerCard: (fn) => { handler = fn; registered += 1; return () => { unregistered += 1; handler = undefined; }; },
    pending: () => [...open.values()],
    answer: (id, decision) => { if (!open.has(id)) return false; answered.push([id, decision]); open.delete(id); return true; },
    enabled: () => true,
  };
}
const asked = (over = {}) => ({ id: 'q1', sessionId: 's1', modeLabel: 'Code', modeId: 'code', tool: 'bash', plain: 'Run commands in Terminal', tier: 3, wording: { risk: 'High', reason: 'Run the tests.', outsideWarning: '', reconWarning: '' }, choices: [{ id: 'once', label: 'Allow once' }, { id: 'deny', label: 'Deny' }], longest: 'once', openedAt: 5000, waitMs: 600000, signal: new AbortController().signal, ...over });

test('describeRequest copies text only, never the live signal, and counts the wait on the host clock', () => {
  const out = describeRequest(asked(), 65000);
  assert.equal(out.remainingMs, 540000);
  assert.equal(JSON.stringify(out).includes('signal'), false);
  assert.equal(describeRequest(asked({ wording: { reason: 'y'.repeat(2000) } }), 0).reason.length, 300);
  assert.equal(describeRequest(asked(), 99999999).remainingMs, 0);
  assert.equal(out.defaultChoice, 'deny');
});

test('bridge: the first look registers the card, answers reach the service, and a quiet page withdraws it', () => {
  const service = fakeService();
  let timeout;
  const bridge = createCardBridge({ service: () => service, now: () => 9000, setTimer: (fn, ms) => { timeout = { fn, ms }; return { unref() {} }; }, clearTimer: () => {} });
  assert.equal(service.registered, 0, 'nothing registered before a page looks (the app\'s own card stays in use)');
  service.open(asked());
  const first = bridge.poll();
  assert.equal(service.registered, 1);
  assert.equal(first.ready, true);
  assert.equal(first.requests.length, 1);
  bridge.poll();
  assert.equal(service.registered, 1, 'registered once, not on every look');
  assert.equal(timeout.ms, ALIVE_MS);
  // A choice the request did not offer is Deny.
  assert.deepEqual(bridge.answer({ id: 'q1', choice: 'always' }), { ok: true });
  assert.deepEqual(service.answered, [['q1', { choice: 'deny' }]]);
  assert.deepEqual(bridge.answer({ id: 'q1', choice: 'once' }), { ok: false, reason: 'That request is no longer waiting.' });
  assert.equal(bridge.answer({ id: '<x>', choice: 'once' }).ok, false);
  service.open(asked({ id: 'q2' }));
  assert.deepEqual(bridge.answer({ id: 'q2', choice: 'once' }), { ok: true });
  assert.deepEqual(service.answered[1], ['q2', { choice: 'once' }]);
  timeout.fn();
  assert.equal(service.unregistered, 1, 'no page looked for a while: the card is withdrawn');
  assert.equal(bridge.registered(), false);
});

test('bridge: a request that waits ends with the wait, and Modes loading late or switched off is handled', async () => {
  const service = fakeService();
  const bridge = createCardBridge({ service: () => service, setTimer: () => ({ unref() {} }), clearTimer: () => {} });
  bridge.poll();
  const controller = new AbortController();
  const waiting = service.handler(asked({ signal: controller.signal }));
  controller.abort();
  assert.deepEqual(await waiting, { choice: 'timeout' });
  assert.deepEqual(await service.handler(asked({ signal: AbortSignal.abort() })), { choice: 'timeout' });
  let current;
  const late = createCardBridge({ service: () => current, setTimer: () => ({ unref() {} }), clearTimer: () => {} });
  const none = late.poll();
  assert.deepEqual([none.ready, none.requests], [false, []]);
  assert.equal(late.answer({ id: 'q1', choice: 'once' }).ok, false);
  current = fakeService();
  assert.equal(late.poll().ready, true);
  current.enabled = () => false;
  assert.equal(late.poll().off, true);
  assert.equal(late.registered(), false, 'switched off: no card registered');
});

test('the headline names exactly how far the buttons reach', () => {
  const said = (over) => card.model(request(over), 1).heading;
  // High risk: this conversation at most.
  assert.match(said({}), /in this conversation$/);
  // High risk after outside material: one use only.
  assert.match(said({ outsideMaterial: true }), /for one use only$/);
  // Low risk, everything offered: all four reaches are named.
  const wide = { tier: 1, longest: 'always', choices: ['once', 'conversation', 'mode', 'always', 'deny', 'never'].map((id) => ({ id })) };
  assert.match(said(wide), /in this conversation, the whole tab or always$/);
  assert.match(said({ ...wide, longest: 'mode' }), /in this conversation or the whole tab$/);
  // The headline always matches the longest button that is really shown.
  for (const over of [{}, { outsideMaterial: true }, wide, { ...wide, longest: 'mode' }, { ...wide, recon: true }]) {
    const req = request(over);
    const widest = card.choices(req).filter((one) => one.kind === 'allow').pop()?.id;
    const expect = { once: 'for one use only', conversation: 'in this conversation', mode: 'in this conversation or the whole tab', always: 'in this conversation, the whole tab or always' }[widest];
    assert.ok(card.model(req, 1).heading.endsWith(expect), `${JSON.stringify(over)} -> ${expect}`);
  }
});

test('a refused answer is a failure, never a silent success', () => {
  assert.deepEqual(card.answerResult(200, { ok: true }), { state: 'sent', text: '' });
  // The host says the request is gone (timed out, cancelled, answered): the card says so.
  const late = card.answerResult(200, { ok: false, reason: 'That request is no longer waiting.' });
  assert.equal(late.state, 'gone');
  assert.equal(late.text, 'This request is no longer waiting. Your answer was not used.');
  // No reply, or a server error: try again.
  assert.equal(card.answerResult(200, null).state, 'error');
  assert.equal(card.answerResult(500, { ok: true }).state, 'error');
  assert.equal(card.answerResult(200, 'x').state, 'error');
});

test('a late Allow on the real bridge is refused, and the card turns that into the plain note', () => {
  // A request that is no longer open: the bridge refuses and the page logic reads the refusal.
  const bridge = createCardBridge({ service: () => ({ registerCard: () => () => {}, pending: () => [], answer: () => false, enabled: () => true }) });
  const late = bridge.answer({ id: 'r1', choice: 'once' });
  assert.equal(late.ok, false);
  assert.equal(card.answerResult(200, late).state, 'gone');
});

test('Esc is Deny and nothing else is bound; Enter and others do nothing', () => {
  assert.equal(card.keyAction('Escape'), 'deny');
  for (const key of ['Enter', ' ', 'Tab', 'Backspace', 'a', 'Return']) assert.equal(card.keyAction(key), null);
  // The page wires the key through this one function and binds no click-outside handler.
  const ui = clientText.slice(clientText.indexOf('function PermissionCard'), clientText.indexOf('return {\n      dshCard,'));
  assert.match(ui, /dshCard\.keyAction\(event\.key\) === 'deny'/);
  assert.ok(!/addEventListener\('(pointerdown|mousedown|click)'/.test(ui), 'a click outside the card does nothing');
});

test('the card never takes focus from a chat box (empty or not), a chosen control, or another pane', () => {
  const t = card.mayTakeFocus;
  assert.equal(t({ inCard: true, active: 'other' }), false);
  assert.equal(t({ active: null }), true, 'nothing is focused');
  assert.equal(t({ active: 'body' }), true);
  assert.equal(t({ active: 'other', editable: true, draft: true }), false, 'half written message');
  assert.equal(t({ active: 'other', editable: true, draft: false }), false, 'an empty chat box keeps the keyboard: a stray Space or Enter must not answer');
  assert.equal(t({ active: 'other', editable: false }), false, 'a control the person chose');
});

test('Enter and Space right after the card focused a button by itself are dropped; later they act as the button says', () => {
  const ignored = card.keyIgnored;
  assert.equal(ignored('Enter', 0), true);
  assert.equal(ignored(' ', 300), true);
  assert.equal(ignored('Enter', card.KEY_GRACE_MS), false, 'after the grace a pressed button does what it says');
  assert.equal(ignored('Enter', -1), false, 'the focus was not taken by the card (the person tabbed here)');
  assert.equal(ignored('Escape', 0), false, 'Esc is always Deny');
  assert.equal(ignored('Tab', 0), false);
});

test('a refusal that is not "no longer waiting" is a failed send, not a gone request', () => {
  assert.equal(card.answerResult(200, { ok: false, reason: 'Tool access is not available.' }).state, 'rejected');
  assert.equal(card.answerResult(200, { ok: false, reason: 'No request given.' }).state, 'rejected');
  assert.equal(card.answerResult(200, { ok: false }).state, 'rejected');
  assert.ok(!/no longer waiting/.test(card.answerResult(200, { ok: false, reason: 'x' }).text));
});

test('Recon wording says plainly what Recon can and cannot ask for, and the card says tab, never mode', () => {
  const m = card.model(request({ recon: true, tier: 2, choices: [{ id: 'once' }, { id: 'deny' }] }), 1);
  for (const word of ['Terminal', 'connectors', 'engines', 'helpers', 'online']) assert.ok(m.risk.includes(word), word);
  assert.ok(!/\bmode\b/i.test(JSON.stringify([Object.values(card.LABEL), m.heading, m.risk])));
  assert.equal(card.LABEL.mode, 'Allow in this tab');
});

test('the page wires the new guards and keeps no dead helper or unused style', () => {
  const ui = clientText.slice(clientText.indexOf('function PermissionCard'), clientText.indexOf('return {\n      dshCard,'));
  assert.match(ui, /dshCard\.keyIgnored\(/);
  assert.ok(!clientText.includes('dsh-tc-dot'), 'unused style removed');
  assert.ok(!/count: \(sessionId\)/.test(clientText), 'unused door helper removed');
});

test('the queue shows the oldest first and a conversation never shows another one\'s request', () => {
  const list = [request({ id: 'b', sessionId: 's1', openedAt: 20 }), request({ id: 'a', sessionId: 's1', openedAt: 10 }), request({ id: 'c', sessionId: 's2', openedAt: 5 }), request({ id: 'a', sessionId: 's1', openedAt: 10 })];
  assert.deepEqual(card.queue(list).map((one) => one.id), ['c', 'a', 'b']);
  const one = card.forSession(list, 's1');
  assert.equal(one.current.id, 'a');
  assert.equal(one.more, 1);
  assert.equal(card.forSession(list, 's9').current, null);
});

test('Recon shows its own highest-risk wording and only the safe buttons', () => {
  const req = request({ recon: true, tier: 2, reconWarning: 'Recon held this material. It could leave with the tool.', choices: ['once', 'conversation', 'mode', 'always', 'deny'].map((id) => ({ id })), longest: 'always' });
  const m = card.model(req, 1);
  assert.match(m.risk, /^Risk: Highest\./);
  assert.equal(m.recon, 'Recon held this material. It could leave with the tool.');
  assert.deepEqual(card.choices(req).map((one) => one.id), ['once', 'conversation', 'deny']);
});

test('the page looks only every 15 seconds while Tool access is off', () => {
  assert.match(clientText, /data\?\.ready !== true \|\| data\?\.off === true \? 15000/);
  const bridge = createCardBridge({ service: () => ({ registerCard: () => () => {}, pending: () => [], enabled: () => false }) });
  assert.equal(bridge.poll().off, true);
});
