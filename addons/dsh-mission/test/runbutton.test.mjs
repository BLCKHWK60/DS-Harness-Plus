import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const body = client.slice(client.indexOf('function RunButton('), client.indexOf('/** Opens the setup card'));
const start = body.slice(body.indexOf('// ---- start-mission:begin'), body.indexOf('// ---- start-mission:end'));

test('one click never starts a Mission: the question comes before arming it and before a start from the thread', () => {
  const ask = start.indexOf('await askMission(savedWithHelpers(got))');
  const arm = start.indexOf("action: 'arm'");
  const thread = start.indexOf('fromThread: true');
  assert.ok(ask > 0 && arm > ask, 'the question is asked before Start Mission is armed');
  assert.ok(thread > ask, 'the question is asked before a start from the thread');
  // The new-chat path asks first too.
  const fresh = body.slice(body.indexOf('const pressNew = async'), body.indexOf('// ---- start-mission:begin'));
  assert.ok(fresh.indexOf('await askMission(await savedDefaults())') > 0 && fresh.indexOf('again.click()') > fresh.indexOf('await askMission(await savedDefaults())'));
  assert.match(client, /What you typed and this thread so far become its brief/);
  assert.match(client, /It can use many tokens/);
  assert.match(client, /title: 'Start a Mission\?'/);
  assert.match(client, /ok: 'Start Mission'/);
});

test('a refused start (pre-flight, answering, Recon, helper) says why and asks nothing', () => {
  const blocked = start.indexOf('const why = startBlocked(got);');
  assert.ok(blocked > 0 && blocked < start.indexOf('await askMission('), 'checked before the question');
  assert.match(start, /if \(why\) \{ setTip\(why\); return; \}/);
  assert.match(body, /if \(got\.preflight\?\.ok === false\) return \(got\.preflight\.ticks \?\? \[\]\)\.find\(\(tick\) => tick\.required !== false && tick\.ok !== true\)\?\.text/);
  assert.match(body, /'Wait until the answer is done, then press Start Mission\.'/);
});

test('a short text starts a Mission when the thread already says what to do; without a thread it asks for a few words', () => {
  assert.match(start, /if \(!typed && !got\.hasThread\) \{ setTip\('Type what the Mission should do in the chat box first\.'\); return; \}/);
  assert.match(start, /if \(typed && words < 3 && !got\.hasThread\) \{ setTip\('Say what the Mission should do in a few words\.'\); return; \}/);
  // Split Plus cards do not count as the user's words.
  assert.match(start, /ownWords\(typed\)/);
});

test('in a conversation that is not ready the button works: message first, then the Mission', () => {
  assert.match(body, /const notReady = !card;/);
  assert.match(body, /disabled: !notReady \|\| busy/);
  assert.match(body, /waitingStart\.goal = goal;/);
  assert.match(body, /action: 'start', goal/);
});

test('the button reads Start Mission and never uses a native dialog', () => {
  assert.match(body, /'Start Mission'\),/);
  assert.doesNotMatch(body, /'Long run'/);
  assert.doesNotMatch(body, /'Running'/);
  assert.doesNotMatch(client, /window\.(confirm|prompt|alert)\(/);
});

// ---- the goal waiting for a new chat belongs to the chat box where Start Mission was pressed (review item 5) ----
const block = client.slice(client.indexOf('// ---- waiting-start:begin'), client.indexOf('// ---- waiting-start:end'));
const waiting = () => new Function(`${block}\nreturn { waitingStart, clearWaiting, waitingStep };`)();
const ready = { runButton: true, run: null, armed: false, busy: false };

test('the waiting goal starts only in the chat box that pressed Start Mission, in the conversation that box turned into', () => {
  const { waitingStart, waitingStep } = waiting();
  const mine = {};
  const split = {};
  Object.assign(waitingStart, { goal: 'tidy the notes folder', at: 1000, owner: mine, id: '', orphan: false });
  // Another chat box (a Split pane, another tab) never takes it, however ready it is.
  assert.equal(waitingStep(split, 'other-chat', ready, 2000), 'none');
  assert.equal(waitingStart.id, '');
  // The pressing box: the first conversation it shows is the new chat; it waits while that is answering.
  assert.equal(waitingStep(mine, 'new-chat', { ...ready, busy: true }, 2000), 'wait');
  assert.equal(waitingStart.id, 'new-chat');
  assert.equal(waitingStep(mine, 'new-chat', { ...ready, run: { status: 'running' } }, 2000), 'wait');
  assert.equal(waitingStep(mine, 'new-chat', ready, 2000), 'start');
});

test('the waiting goal is dropped when its chat is left, and after three minutes', () => {
  const { waitingStart, waitingStep } = waiting();
  const mine = {};
  Object.assign(waitingStart, { goal: 'tidy the notes folder', at: 1000, owner: mine, id: 'new-chat', orphan: false });
  assert.equal(waitingStep(mine, 'some-other-chat', ready, 2000), 'drop', 'the user switched chats');
  Object.assign(waitingStart, { goal: 'tidy the notes folder', at: 1000, owner: mine, id: 'new-chat', orphan: false });
  assert.equal(waitingStep(mine, 'new-chat', ready, 1000 + 180000), 'drop');
  assert.equal(waitingStep(mine, 'new-chat', ready, 1000 + 179999), 'start');
  waiting().clearWaiting();
});

test('if the pressing box went away, another conversation may claim it, but only the server decides (it checks the words)', () => {
  const { waitingStart, waitingStep } = waiting();
  Object.assign(waitingStart, { goal: 'tidy the notes folder', at: 1000, owner: {}, id: '', orphan: true });
  assert.equal(waitingStep({}, 'new-chat', ready, 2000), 'start');
});

test('a failed start is dropped and said; the page waits while the chat is busy; the server checks the words and the state', () => {
  assert.match(body, /clearWaiting\(\); setTip\(`The Mission did not start: /);
  assert.match(body, /afterMessage: true/);
  assert.doesNotMatch(body, /waitingStart\.goal = goal; setTip/, 'a failed start is no longer kept for the next chat that looks');
  const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(index, /did not get those words/);
  assert.match(index, /This thread is still answering/);
});

// ---- lab 19 Nov: a new run in the same chat showed the last run's End message under its own pause line ----
test('the strip clears a button message when a new Mission starts in the same chat', () => {
  const card = client.slice(client.indexOf('function RunCard('), client.indexOf('function LongSetup('));
  assert.match(card, /const runId = run\?\.id;/);
  assert.match(card, /useEffect\(\(\) => \{ setNote\(\{ text: '', state: null \}\); setShowOks\(false\); \}, \[runId\]\);/);
});

// ---- the main button replaces Send while a Mission exists (stage B) ----
test('while a Mission exists the main button shows instead of Start Mission, and the seat (not the page) carries the marks', () => {
  assert.match(body, /if \(main !== 'send'\) \{/);
  assert.match(body, /className: 'dsh-ms-main'/);
  assert.match(body, /seat\.setAttribute\('data-dsh-mission', state\)/);
  assert.match(body, /seat\.setAttribute\('data-dsh-mission-main', main\)/);
  assert.match(body, /node\.closest\('\[data-composer-seat\]'\)/);
  assert.doesNotMatch(client, /setAttribute\('data-dsh-long-run'/);
});

// ---- stage C (20 November): continuing after the end is the questions card's job, not the main button's ----
test('the main button never continues an ended Mission: after the end it is Start Mission again, and only the questions card posts continue', () => {
  assert.doesNotMatch(body, /action: 'continue'/);
  assert.match(body, /const main = card && card\.runButton === true && strip\?\.main \? strip\.main : 'send';/);
  const qcard = client.slice(client.indexOf('function QuestionsCard('), client.indexOf('    return {\n      inject:'));
  assert.match(qcard, /send\(withPicks\(\{ action: 'continue', answers: sent \}, sentPicks\)\)/, 'first a quote (no minutes)');
  assert.match(qcard, /send\(withPicks\(\{ action: 'continue', answers: step\.answers, minutes \}, step\.approvals \?\? \[\]\)\)/);
});
