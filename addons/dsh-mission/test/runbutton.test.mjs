import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const body = client.slice(client.indexOf('function RunButton('), client.indexOf('/** Opens the setup card'));

test('one click never starts a Long run: the question comes before arming it', () => {
  const ask = body.indexOf('await askLong(card.saved)');
  const arm = body.indexOf("action: 'arm'");
  assert.ok(ask > 0 && arm > ask, 'the question is asked before the run is armed');
  assert.match(client, /What you typed becomes the goal/);
  assert.match(client, /It can use many tokens/);
});

test('the question says how long and how many laps, from the chat\'s own settings', () => {
  assert.match(client, /const longWords = \(saved\)/);
  assert.match(client, /as long as \$\{length\}/);
  assert.match(client, /up to \$\{laps\} rounds \(laps\)/);
});

test('in a conversation that is not ready the button works: message first, then the run', () => {
  assert.match(body, /const notReady = !card;/);
  assert.match(body, /disabled: !notReady \|\| busy/);
  assert.match(body, /waitingStart\.goal = goal;/);
  assert.match(body, /action: 'start', goal/);
});

test('the button reads Long run in both states and never uses a native dialog', () => {
  assert.match(body, /'Long run'\),/);
  assert.match(body, /live \? 'Running' : 'Long run'/);
  assert.doesNotMatch(client, /window\.(confirm|prompt|alert)\(/);
});

// ---- the goal waiting for a new chat belongs to the chat box where Run was pressed (review item 5) ----
const block = client.slice(client.indexOf('// ---- waiting-start:begin'), client.indexOf('// ---- waiting-start:end'));
const waiting = () => new Function(`${block}\nreturn { waitingStart, clearWaiting, waitingStep };`)();
const ready = { runButton: true, run: null, armed: false, busy: false };

test('the waiting goal starts only in the chat box that pressed Run, in the conversation that box turned into', () => {
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
  assert.match(body, /clearWaiting\(\); setTip\(`The Long run did not start: /);
  assert.match(body, /afterMessage: true/);
  assert.doesNotMatch(body, /waitingStart\.goal = goal; setTip/, 'a failed start is no longer kept for the next chat that looks');
  const index = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(index, /did not get those words/);
  assert.match(index, /This conversation is still answering/);
});
