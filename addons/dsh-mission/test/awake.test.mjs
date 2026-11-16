// Keep-awake for Long runs (step 57), with a stand-in for macOS's caffeinate.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CAFFEINATE, createAwake } from '../lib/awake.js';

function standIn(power) {
  const started = [];
  const killed = [];
  const spawn = (command, args) => {
    const child = { args, kill: () => killed.push(args), on: () => child };
    started.push([command, args]);
    return child;
  };
  return { started, killed, keeper: createAwake({ spawn, power: async () => power.value, pid: 4242 }) };
}

test('one caffeinate at most, tied to the app\'s process; it stops when no Long run wants it', async () => {
  const power = { value: true };
  const { started, killed, keeper } = standIn(power);
  assert.equal(await keeper.want('a', true), true);
  await keeper.want('b', true);
  assert.deepEqual(started, [[CAFFEINATE, ['-i', '-w', '4242']]], 'never two at once');
  await keeper.want('a', false);
  assert.equal(keeper.running(), true, 'another run still wants it');
  await keeper.want('b', false);
  assert.equal(keeper.running(), false);
  assert.equal(killed.length, 1);
});

test('on battery only when every run that wants it allows battery; unknown power counts as on power', async () => {
  const power = { value: false };
  const { started, keeper } = standIn(power);
  assert.equal(await keeper.want('a', true, false), false, 'on battery, not allowed: the Mac may sleep');
  assert.equal(started.length, 0);
  assert.equal(await keeper.want('a', true, true), true, 'allowed on battery');
  await keeper.want('b', true, false);
  assert.equal(keeper.running(), false, 'one run that does not allow battery stops it');
  power.value = undefined;
  assert.equal(await keeper.want('b', true, false), true);
  keeper.stop();
  assert.equal(keeper.running(), false, 'stopped when the add-on stops');
});

test('a run that ends while the power is being asked about leaves nothing awake', async () => {
  const power = { value: true };
  const { started, keeper } = standIn(power);
  // Both calls before the answer about power arrives, as when a run is ended right after it starts.
  const on = keeper.want('a', true);
  const off = keeper.want('a', false);
  assert.equal(await on, false);
  await off;
  assert.equal(keeper.running(), false);
  assert.equal(started.length, 0);
});

test('an older caffeinate that ends late does not hide a newer one', async () => {
  const children = [];
  const killed = [];
  const spawn = () => {
    const handlers = {};
    const child = { kill: () => killed.push(child), on: (name, fn) => { handlers[name] = fn; return child; }, fire: (name) => handlers[name]?.() };
    children.push(child);
    return child;
  };
  const keeper = createAwake({ spawn, power: async () => true, pid: 1 });
  await keeper.want('a', true);
  await keeper.want('a', false);
  await keeper.want('b', true);
  assert.equal(children.length, 2);
  children[0].fire('exit');
  assert.equal(keeper.running(), true, 'the newer one is still known');
  keeper.stop();
  assert.ok(killed.includes(children[1]), 'and it is stopped');
});
