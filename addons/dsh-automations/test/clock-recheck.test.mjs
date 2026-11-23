// Stage 7 (6b lab leftover): after a space's "Offer" switch goes off and on, the clock in a guest thread comes back
// without a reload: a guarded answer (the guard not ready yet) is asked again a few times after short waits.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('    const sealedChats = new Map();'), source.indexOf('    /** Round 2: the Alerts row'));

/** Runs the hook once with stand-ins for React, the add-on's `post` and the timers. */
function run(answers) {
  const timers = [];
  const posts = [];
  const box = { value: undefined };
  const react = {
    useState: (init) => { if (box.value === undefined) box.value = typeof init === 'function' ? init() : init; return [box.value, (next) => { box.value = next; }]; },
    useEffect: (effect) => { box.cleanup = effect(); },
  };
  const post = (call) => { posts.push(call); return Promise.resolve(answers[Math.min(posts.length - 1, answers.length - 1)]); };
  const setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  const clearTimeout = () => {};
  const useSealed = new Function('useState', 'useEffect', 'post', 'setTimeout', 'clearTimeout', `${body}\nreturn useSealed;`)(react.useState, react.useEffect, post, setTimeout, clearTimeout);
  useSealed('g1', true, {});
  return { box, timers, posts };
}
const tick = () => new Promise((resolve) => setImmediate(resolve));

test('clock-back-after-offer-on: a guarded answer is asked again; the guest answer then shows the clock', async () => {
  const { box, timers, posts } = run([{ isolated: false, guarded: true }, { isolated: false, guarded: true }, { isolated: false, guarded: false, guest: 'Devices' }]);
  await tick();
  assert.equal(box.value.guarded, true, 'the first answer hides the clock (guard not ready yet)');
  assert.equal(timers.length, 1, 'and asks again later');
  timers[0].fn();
  await tick();
  timers[1].fn();
  await tick();
  assert.equal(posts.length, 3);
  assert.deepEqual(box.value, { isolated: false, guarded: false, guest: 'Devices' }, 'the clock is back, no reload');
  assert.equal(timers.length, 2, 'a clear answer stops asking');
});

test('clock-recheck-bounded: a thread that stays guarded is asked again only a few times', async () => {
  const { timers, posts } = run([{ isolated: false, guarded: true }]);
  for (let i = 0; i < 10; i += 1) {
    await tick();
    const next = timers[i];
    if (!next) break;
    next.fn();
  }
  await tick();
  assert.ok(timers.length <= 5, `at most five waits (${timers.length})`);
  assert.equal(posts.length, timers.length + 1);
});

test('a Recon (sealed) answer is not asked again', async () => {
  const { timers } = run([{ isolated: true, guarded: false }]);
  await tick();
  assert.equal(timers.length, 0);
});

test('held-guest-not-kept: a guest held by Offer off (sealed and guarded) is asked again, and the clock comes back', async () => {
  const { box, timers, posts } = run([{ isolated: true, guarded: true, guest: 'devices' }, { isolated: false, guarded: false, guest: 'devices' }]);
  await tick();
  assert.equal(box.value.guarded, true, 'held: no clock');
  assert.equal(timers.length, 1, 'a held answer is asked again (lab: it was kept for good)');
  timers[0].fn();
  await tick();
  assert.equal(posts.length, 2);
  assert.deepEqual(box.value, { isolated: false, guarded: false, guest: 'devices' }, 'the clock is back without a reload');
});

test('held-guest-not-kept: a later mount asks again (nothing kept)', async () => {
  const first = run([{ isolated: true, guarded: true, guest: 'devices' }]);
  await tick();
  assert.equal(first.posts.length, 1);
  assert.doesNotMatch(body, /sealed\.isolated\) \{/, 'the keep rule is not "sealed alone"');
  assert.match(body, /sealed\.isolated && !sealed\.guarded/);
});

test('guest-title-named (stage 7 lab): while the pop-up loads, its title names the space ("Devices"), not its id', () => {
  assert.match(source, /SPACE_TITLE = Object\.freeze\(\{ devices: 'Devices', workshop: 'Workshop' \}\)/);
  assert.match(source, /sealedHere\?\.guest \? ` · \$\{SPACE_TITLE\[sealedHere\.guest\] \?\? sealedHere\.guest\}`/);
  assert.doesNotMatch(source, /sealedHere\?\.guest \? ` · \$\{sealedHere\.guest\}`/);
});
