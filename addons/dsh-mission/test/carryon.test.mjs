/**
 * Stage E, point 9: "Carry on by itself after a restart" (on unless changed). Each test fails on the code before stage E.
 */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { stripOf } from '../lib/strip.js';
import { ASSISTANT_NOTE } from '../lib/assistant.js';
import { closeDown } from '../lib/run.js';
import { CARRIED_TOLD, CARRY_BRAKE_TEXT, PAUSED_TEXT, RESTART_OFF_TEXT, RESTART_OLD_TEXT, RESTART_OPEN_TEXT, RESTART_TRASH_TEXT } from '../runner.js';
import { PLAN, bench, fresh, tick } from './stage-e-bench.mjs';

/** A Mission started and stepped once, then the app "restarts": a second runner reads it from its folder. */
const restarted = async ({ long = {}, before, services = {}, agentOpen = true } = {}) => {
  const homeDir = fresh('mission-e-home-');
  const home = (sub) => join(homeDir, sub);
  const root = fresh();
  const answer = (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }, { title: 'two' }]) } : undefined);
  const first = bench({ home, root, answer });
  await first.start({ carryOn: true, ...long });
  await first.step();
  await before?.(first);
  first.run().lastStepAt = Date.now() - 60 * 60_000;
  first.runner.addTokens('conv', 1);
  // Saved as it stands (the next save happens after every step).
  first.runner.setLive('conv', {});
  const again = bench({ home, root, answer, services, agentOpen });
  // The app's restart: an active goal stays disarmed until an explicit resume.
  again.goals.create();
  again.goal.activation = 'disarmed';
  return { first, again, run: again.runner.runOf('conv'), done: () => { first.done(); } };
};

test('the goal of a Mission that lost its rounds (active but disarmed) is armed again; one paused or complete gets resumed or a new one', async () => {
  const { again, done } = await restarted();
  try {
    assert.equal(again.runner.armGoal(again.agent), true);
    assert.deepEqual([again.goal.phase, again.goal.activation], ['active', 'armed']);
    assert.ok(again.goalCalls.includes('resume'), 'resumed, not left disarmed (rearmGoal before stage E did nothing here)');
  } finally {
    done();
  }
});

test('carry on: decided once per boot; it carries on by itself, the closed time does not count, items a helper was on go on from where they stopped', async () => {
  const { again, run, done } = await restarted({ long: { helpers: 1 } });
  try {
    assert.deepEqual(again.runner.afterRestart('conv', run), { decision: 'carry', first: true });
    assert.deepEqual(again.runner.afterRestart('conv', run), { decision: 'carry', first: false }, 'one decision per boot');
    const pausedBefore = run.long.pausedMs;
    assert.equal(await again.runner.carryOn('conv'), 'carried');
    assert.equal(run.pausedAt, 0);
    assert.equal(run.pausedBy, '');
    assert.ok(run.long.pausedMs - pausedBefore >= 59 * 60_000, 'the hour it was closed does not count');
    assert.ok(run.carriedOnAt > 0);
    assert.deepEqual([again.goal.phase, again.goal.activation], ['active', 'armed']);
    await tick();
    assert.ok(again.fired.some((event) => event.type === 'resumed' && event.by === 'restart'));
    assert.equal(again.fired.some((event) => event.type === 'stopped-by-itself'), false, 'no alert');
    assert.match(await again.step(), new RegExp(CARRIED_TOLD.slice(0, 40)));
    assert.equal(stripOf({ run: { ...again.runner.view('conv'), goalPhase: 'active' } }).carriedOn, run.carriedOnAt);
  } finally {
    done();
  }
});

test('off, or a Mission from before stage E: it comes back paused, says why, with one alert; one you paused stays exactly as it was, with no alert', async () => {
  const off = await restarted({ long: { carryOn: false } });
  try {
    assert.equal(off.again.runner.afterRestart('conv', off.run).decision, 'paused-off');
    off.again.runner.announceInterrupted('conv', off.run);
    assert.deepEqual([off.run.stalled, off.run.pausedBy], [RESTART_OFF_TEXT, 'restart']);
    await tick();
    assert.equal(off.again.fired.filter((event) => event.type === 'stopped-by-itself' && event.why === 'restart').length, 1);
  } finally {
    off.done();
  }
  const old = await restarted({ before: (app) => { delete app.run().long.carryOn; } });
  try {
    assert.equal(old.again.runner.afterRestart('conv', old.run).decision, 'paused-off');
    old.again.runner.announceInterrupted('conv', old.run);
    assert.equal(old.run.stalled, RESTART_OLD_TEXT);
    assert.equal(stripOf({ run: { ...old.again.runner.view('conv'), goalPhase: 'active' } }).pausedBy, 'restart');
    assert.equal(old.again.runner.view('conv').carryOn, null);
  } finally {
    old.done();
  }
  const mine = await restarted({ before: (app) => { app.runner.stop(app.agent); } });
  try {
    assert.equal(mine.again.runner.afterRestart('conv', mine.run).decision, 'paused-before');
    mine.again.runner.announceInterrupted('conv', mine.run);
    assert.deepEqual([mine.run.pausedBy, mine.run.stalled ?? ''], ['you', ''], 'your pause is kept');
    await tick();
    assert.equal(mine.again.fired.length, 0, 'no alert');
  } finally {
    mine.done();
  }
});

test('review of stage E: a Mission that came back paused (Carry on off, from before, the brake, a failed check) stays paused: a chat message never carries it on, and the assistant gets its own rules', async () => {
  for (const how of ['off', 'old', 'problem']) {
    const { again, run, done } = await restarted(how === 'off' ? { long: { carryOn: false } } : how === 'old' ? { before: (app) => { delete app.run().long.carryOn; } } : {});
    try {
      if (how === 'problem') assert.equal(await again.runner.carryOn('conv', { check: () => 'This conversation\'s folder is gone or cannot be reached.' }), 'problem');
      else {
        assert.equal(again.runner.afterRestart('conv', run).decision, 'paused-off');
        again.runner.announceInterrupted('conv', run);
      }
      // The app's goal stays active but disarmed, as after every restart.
      assert.deepEqual([again.goal.phase, again.goal.activation], ['active', 'disarmed']);
      assert.equal(again.runner.paused(again.agent), true, how);
      assert.equal(again.runner.note('conv'), ASSISTANT_NOTE.look('do two small things'), 'the assistant\'s rules, not the conductor\'s');
      const said = await again.step();
      assert.ok(said.startsWith(PAUSED_TEXT), `${how}: ${said.slice(0, 80)}`);
      assert.ok(run.pausedAt > 0 && run.pausedBy !== '', 'still paused');
      assert.equal(again.fired.some((event) => event.type === 'resumed'), false, 'not resumed by a chat message');
      // The app's own resume of the goal (it arms it) still carries it on, as before stage E.
      again.goals.resume();
      assert.match(await again.step(), /item 1 of 2/);
      assert.equal(run.pausedAt, 0);
    } finally {
      done();
    }
  }
});

test('carry on opens a closed conversation through the app (sessionController.resolveAgent); without it, it waits paused and carries on when the conversation opens', async () => {
  const opened = [];
  let agent;
  const services = { sessionController: { resolveAgent: async (id) => { opened.push(id); return agent ? { agent } : { error: 'not found' }; } } };
  const { again, run, done } = await restarted({ services, agentOpen: false });
  try {
    assert.equal(await again.runner.carryOn('conv', { timeoutMs: 200 }), 'no-agent');
    assert.deepEqual(opened, ['conv']);
    assert.deepEqual([run.stalled, run.pausedBy, run.carryPending], [RESTART_OPEN_TEXT, 'restart', true]);
    agent = again.agent;
    assert.equal(await again.runner.carryOn('conv', { timeoutMs: 200 }), 'carried');
    assert.equal(run.carryPending, undefined);
  } finally {
    done();
  }
});

test('the brake, the trash and Resume\'s checks: it stays paused and says why', async () => {
  const { again, run, done } = await restarted();
  try {
    for (let i = 0; i < 3; i += 1) {
      assert.equal(await again.runner.carryOn('conv'), 'carried');
      again.runner.stop(again.agent);
      run.pausedBy = 'restart';
    }
    assert.equal(await again.runner.carryOn('conv'), 'brake');
    assert.deepEqual([run.stalled, run.pausedBy], [CARRY_BRAKE_TEXT, 'problem']);
    delete run.long.carryOns;
    run.pausedBy = 'restart';
    assert.equal(await again.runner.carryOn('conv', { trash: () => true }), 'trash');
    assert.equal(run.stalled, RESTART_TRASH_TEXT);
    run.pausedBy = 'restart';
    assert.equal(await again.runner.carryOn('conv', { check: () => 'This conversation\'s folder is gone or cannot be reached.' }), 'problem');
    assert.deepEqual([run.stalled, run.pausedBy], ['Paused: This conversation\'s folder is gone or cannot be reached.', 'problem']);
  } finally {
    done();
  }
});

test('a Mission that waited for its model server goes on waiting after a restart; its next try is at once', async () => {
  const DOWN = { text: '', stopReason: 'error', diagnostic: 'connect ECONNREFUSED' };
  const homeDir = fresh('mission-e-home-');
  const home = (sub) => join(homeDir, sub);
  const root = fresh();
  let down = true;
  const answer = (spec) => (spec.label === 'Mission: planner' ? { text: PLAN([{ title: 'one' }]) } : down ? DOWN : undefined);
  const first = bench({ home, root, answer });
  try {
    await first.start({ carryOn: true, retry: true });
    await first.step();
    await first.step();
    assert.ok(first.run().long.down);
    const again = bench({ home, root, answer });
    const run = again.runner.runOf('conv');
    assert.equal(again.runner.afterRestart('conv', run).decision, 'carry');
    down = false;
    assert.equal(await again.runner.carryOn('conv'), 'down');
    assert.equal(run.long.down, undefined, 'tried at once');
    assert.equal(run.long.probing, true);
    assert.match(await again.step(), /item 1 of 1/);
  } finally {
    first.done();
  }
});

test('review of stage E: a restart after a wait for the model server ended counts the paused time from the end of that wait (the wait already went to the deadline), not again from the last step', async () => {
  for (const carry of [false, true]) {
    const { again, run, done } = await restarted({ long: { carryOn: carry } });
    try {
      // The server was down from 50 to 10 minutes ago; a try started then (its time went to the deadline), then the app closed.
      run.long.down = { since: Date.now() - 50 * 60_000, first: Date.now() - 50 * 60_000 };
      const deadline = run.long.deadline;
      closeDown(run, Date.now() - 10 * 60_000);
      assert.equal(run.long.deadline - deadline, 40 * 60_000);
      if (carry) assert.equal(await again.runner.carryOn('conv'), 'carried');
      else again.runner.announceInterrupted('conv', run);
      const counted = run.long.deadline - deadline - 40 * 60_000;
      if (carry) assert.ok(counted >= 10 * 60_000 - 5000 && counted < 11 * 60_000, `carried: ${counted / 60000} minutes added again`);
      else assert.ok(Math.abs(run.pausedAt - (Date.now() - 10 * 60_000)) < 5000, 'paused from the end of the wait, not from the last step an hour ago');
    } finally {
      done();
    }
  }
});
