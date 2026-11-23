import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { OWN_FOLDER, isInside, outsideInCommand, pathsOf, real } from '../lib/paths.js';
import { decide, mayChangeFiles, modeOf, rulesNote } from '../lib/guard.js';
import { GIT_CANDIDATES, openCheckpoints } from '../lib/checkpoints.js';

const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), 'dsh-mission-')));
const none = () => false;

test('a path is inside only when its real spelling is', () => {
  const root = fresh();
  const other = fresh();
  try {
    mkdirSync(join(root, 'src'));
    writeFileSync(join(other, 'secret.txt'), 'x');
    symlinkSync(other, join(root, 'link'));
    assert.ok(isInside(root, real(join(root, 'src', 'new.js'))));
    assert.ok(isInside(root, real(root)));
    assert.ok(!isInside(root, real(join(root, '..', 'elsewhere'))));
    // A link that points out of the folder is outside, whatever its name says.
    assert.ok(!isInside(root, real(join(root, 'link', 'secret.txt'))));
    assert.ok(!isInside(root, `${root}-twin`));
    assert.deepEqual(pathsOf({ file_path: 'src/a.js', files: ['b.js', '../x'], other: 'src/zzz' }, root), [join(root, 'src/a.js'), join(root, 'b.js'), real(join(root, '..', 'x'))]);
    assert.deepEqual(pathsOf({ command: 'ls' }, root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(other, { recursive: true, force: true });
  }
});

test('a command is read for places outside the folder, not for look-alikes', () => {
  const root = fresh();
  const home = homedir();
  try {
    assert.deepEqual(outsideInCommand('npm test && node build.js > out.txt', root), []);
    assert.deepEqual(outsideInCommand('/usr/bin/git status; cat /etc/hosts 2>/dev/null', root), []);
    assert.deepEqual(outsideInCommand('grep -r "/api/users" . && curl https://example.com/a/../b', root), []);
    assert.deepEqual(outsideInCommand(`cat ${join(root, 'a.txt')}`, root), []);
    assert.deepEqual(outsideInCommand('cat ~/Documents/notes.txt', root), [real(join(home, 'Documents/notes.txt'))]);
    assert.deepEqual(outsideInCommand('ls $HOME && ls "${HOME}/Desktop"', root), [real(home), real(join(home, 'Desktop'))]);
    assert.deepEqual(outsideInCommand('cd .. && ls', root), [real(join(root, '..'))].filter((path) => !path.startsWith('/private/var') && !path.startsWith('/var') && !path.startsWith('/tmp') && !path.startsWith('/private/tmp')));
    assert.deepEqual(outsideInCommand(`cp x ${home}/y; cp x ${home}/y`, root), [real(join(home, 'y'))]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the three modes decide file calls as the owner asked', () => {
  const root = fresh();
  const outside = real(join(homedir(), 'Documents', 'plan.md'));
  try {
    writeFileSync(join(root, 'old.js'), '1');
    const call = (mode, tool, args, approved = none, outsideOk = none) => decide({ mode, tool, args, root, approved, outsideOk });
    for (const mode of ['restricted', 'ask']) {
      // New files are free; an existing one is asked for once.
      assert.deepEqual(call(mode, 'write', { file_path: 'new.js' }), { kind: 'allow' });
      const ask = call(mode, 'edit', { file_path: 'old.js' });
      assert.equal(ask.kind, 'ask');
      assert.deepEqual(ask.files, [join(root, 'old.js')]);
      assert.match(ask.question, /change old\.js\? You are asked once per file/);
      assert.deepEqual(call(mode, 'edit', { file_path: 'old.js' }, (path) => path === join(root, 'old.js')), { kind: 'allow' });
      assert.deepEqual(call(mode, 'read', { file_path: 'old.js' }), { kind: 'allow' });
    }
    assert.deepEqual(call('auto', 'edit', { file_path: 'old.js' }), { kind: 'allow' });

    // Outside: Restricted refuses and says not to ask; the other two ask once per place.
    for (const tool of ['read', 'write', 'glob']) {
      const no = call('restricted', tool, { file_path: outside, path: outside });
      assert.equal(no.kind, 'deny');
      assert.match(no.reason, /the user is not to be asked/);
    }
    for (const mode of ['ask', 'auto']) {
      const ask = call(mode, 'read', { file_path: outside });
      assert.equal(ask.kind, 'ask');
      assert.deepEqual(ask.outside, [outside]);
      assert.match(ask.question, /read outside the thread's folder/);
      // A change outside is left to the app's sandbox, which refuses it and asks on the retry.
      assert.deepEqual(call(mode, 'write', { file_path: outside }), { kind: 'allow' });
      assert.deepEqual(call(mode, 'read', { file_path: outside }, none, (path) => path === outside), { kind: 'allow' });
    }

    // The checkpoint folder is not for the assistant.
    assert.equal(call('auto', 'write', { file_path: `${OWN_FOLDER}/x` }).kind, 'deny');
    assert.equal(call('auto', 'bash', { command: `rm -rf ${OWN_FOLDER}` }).kind, 'deny');
    assert.equal(call('auto', 'bash', { command: `rm -rf ./${OWN_FOLDER}/checkpoints.git` }).kind, 'deny');

    // No mode, no folder, no paths: nothing to decide.
    assert.deepEqual(decide({ mode: '', tool: 'write', args: { file_path: outside }, root, approved: none, outsideOk: none }), { kind: 'allow' });
    assert.deepEqual(call('restricted', 'todo_write', { todos: [] }), { kind: 'allow' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('commands: free inside, outside by mode, and no wider sandbox in Restricted', () => {
  const root = fresh();
  try {
    const call = (mode, args, outsideOk = none) => decide({ mode, tool: 'bash', args, root, approved: none, outsideOk });
    for (const mode of ['restricted', 'ask', 'auto']) assert.deepEqual(call(mode, { command: 'npm test' }), { kind: 'allow' });
    assert.equal(call('restricted', { command: 'cat ~/Documents/x' }).kind, 'deny');
    assert.equal(call('restricted', { command: 'npm test', sandbox_permissions: 'danger-full-access', justification: 'x' }).kind, 'deny');
    assert.equal(call('ask', { command: 'npm test', sandbox_permissions: 'danger-full-access', justification: 'x' }).kind, 'allow');
    const ask = call('auto', { command: 'cat ~/Documents/x' });
    assert.equal(ask.kind, 'ask');
    assert.deepEqual(call('auto', { command: 'cat ~/Documents/x' }, () => true), { kind: 'allow' });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('mode names and the note for the assistant', () => {
  assert.equal(modeOf('Restricted'), 'restricted');
  assert.equal(modeOf(' ask-auto '), 'ask');
  assert.equal(modeOf('Full Auto'), 'auto');
  assert.equal(modeOf('2'), 'ask');
  assert.equal(modeOf('make the tests pass'), undefined);
  const root = fresh();
  try {
    assert.match(rulesNote('restricted', root), /Do not ask the user for it/);
    assert.match(rulesNote('restricted', root), /asked once per file/);
    assert.match(rulesNote('ask', root), /needs the user's yes/);
    assert.match(rulesNote('auto', root), /retry that exact call once with sandbox_permissions/);
    assert.match(rulesNote('auto', root), /without asking\.\n/);
    assert.ok(!/asked once per file/.test(rulesNote('auto', root)));
    assert.equal(rulesNote('nonsense', root), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkpoints: take, see what changed, put files back, go back and undo that', { skip: !GIT_CANDIDATES.some((path) => existsSync(path)) }, async () => {
  const root = fresh();
  try {
    writeFileSync(join(root, 'a.txt'), 'one');
    writeFileSync(join(root, 'b.txt'), 'bee');
    writeFileSync(join(root, '.gitignore'), 'build/\n');
    mkdirSync(join(root, 'build'));
    writeFileSync(join(root, 'build', 'out.bin'), 'x');
    const points = openCheckpoints(root);
    const first = await points.take('Start');
    assert.equal(first.number, 1);
    assert.equal(first.fresh, true);
    // Nothing changed: no new checkpoint.
    assert.deepEqual(await points.take('Again'), { id: first.id, number: 1, fresh: false });

    writeFileSync(join(root, 'a.txt'), 'two');
    rmSync(join(root, 'b.txt'));
    writeFileSync(join(root, 'c.txt'), 'new');
    writeFileSync(join(root, 'build', 'out.bin'), 'changed');
    assert.deepEqual(await points.since(first.id), { changed: ['a.txt'], deleted: ['b.txt'], added: ['c.txt'] });

    // Single files go back; the new file and ignored output stay.
    await points.putBack(first.id, ['a.txt', 'b.txt']);
    assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'one');
    assert.equal(readFileSync(join(root, 'b.txt'), 'utf8'), 'bee');
    assert.equal(readFileSync(join(root, 'c.txt'), 'utf8'), 'new');
    assert.equal(readFileSync(join(root, 'build', 'out.bin'), 'utf8'), 'changed');

    const second = await points.take('After work');
    assert.equal(second.number, 2);
    writeFileSync(join(root, 'a.txt'), 'three');
    const went = await points.back(1);
    assert.deepEqual({ number: went.number, label: went.label, saved: went.saved, now: went.now }, { number: 1, label: 'Start', saved: 3, now: 4 });
    assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'one');
    assert.ok(!existsSync(join(root, 'c.txt')));
    assert.equal(readFileSync(join(root, 'build', 'out.bin'), 'utf8'), 'changed');

    // Going back is itself a checkpoint, so it can be undone.
    await points.back(3);
    assert.equal(readFileSync(join(root, 'a.txt'), 'utf8'), 'three');
    assert.equal(readFileSync(join(root, 'c.txt'), 'utf8'), 'new');
    const list = await points.list();
    // Nothing had changed since the last checkpoint, so "before going back" needed no new one.
    assert.deepEqual(list.map((point) => point.number), [5, 4, 3, 2, 1]);
    assert.equal(list.at(-1).label, 'Start');
    assert.match(list[1].label, /^Went back to checkpoint 1: Start$/);
    assert.match(list[0].label, /^Went back to checkpoint 3: Before going back to checkpoint 1$/);
    await assert.rejects(points.back(99), /There is no checkpoint 99/);

    // The store never holds itself, and the project's own git is not there to be touched.
    assert.ok(existsSync(join(root, OWN_FOLDER, 'checkpoints.git', 'HEAD')));
    assert.ok(!existsSync(join(root, '.git')));
    assert.deepEqual((await points.since(list[0].id)), { changed: [], deleted: [], added: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the store stays out of the project\'s own git status, and is written once', { skip: !GIT_CANDIDATES.some((path) => existsSync(path)) }, async () => {
  const root = fresh();
  try {
    // A stand-in for a project that is a git repository.
    mkdirSync(join(root, '.git', 'info'), { recursive: true });
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    writeFileSync(join(root, '.git', 'info', 'exclude'), '# local\n*.log');
    writeFileSync(join(root, 'a.txt'), 'one');
    await openCheckpoints(root).take('First');
    await openCheckpoints(root).take('Second');
    assert.equal(readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8'), `# local\n*.log\n/${OWN_FOLDER}/\n`);
    // The project's own .git is not copied into a checkpoint.
    const points = openCheckpoints(root);
    writeFileSync(join(root, '.git', 'HEAD'), 'ref: refs/heads/other\n');
    assert.deepEqual(await points.since((await points.list())[0].id), { changed: [], deleted: [], added: [] });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the record keeps approvals across a restart and a mode change', async () => {
  const { openState, covered } = await import('../lib/state.js');
  const dir = fresh();
  try {
    const file = join(dir, 'mission', 'conversations.json');
    const state = openState(file);
    state.set('s1', { mode: 'restricted', root: '/w', preset: 'danger-full-access' });
    state.approve('s1', ['/w/a.js']);
    state.allowOutside('s1', ['/elsewhere/docs']);
    state.set('s1', { mode: 'auto', root: '/w', preset: 'workspace-write' });
    state.flush();
    const again = openState(file).get('s1');
    assert.equal(again.mode, 'auto');
    // The preset to return to is the one from before Mission, not Mission's own.
    assert.equal(again.preset, 'danger-full-access');
    assert.deepEqual([...again.approved], ['/w/a.js']);
    assert.ok(covered(again.outside, '/elsewhere/docs/deep/file.md'));
    assert.ok(!covered(again.outside, '/elsewhere/docs-other'));
    // Another folder under the same conversation starts clean.
    assert.equal(state.set('s1', { mode: 'ask', root: '/other' }).approved.size, 0);
    assert.throws(() => state.set('s2', { mode: 'wild', root: '/w' }), /unknown mode/);
    assert.equal(state.clear('s1').mode, 'ask');
    assert.equal(state.get('s1'), undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('settings fall back to Restricted', async () => {
  const { readSettings, HELP } = await import('../index.js');
  const limits = { maxItems: 12, maxTries: 3, maxReviews: 2, maxSteps: 60, waitMinutes: 3 };
  // Point 17: When it needs you (Ask, keep working) and Wait for me (30 minutes, migrated from waitMinutes 3; until you answer).
  // Stage E: Talk and look things up, and Carry on by itself after a restart, unless changed.
  const long = { minutes: 120, laps: 10, steps: 0, fullTime: false, keepAwake: true, battery: false, retry: true, effort: true, helpers: 4, needs: 'ask', waitAsk: 30, waitHold: 0, assistant: 'look', carryOn: true };
  // The work loop's settings (plan steps S3 to S5): no tab, one call at a time, unless the owner sets them.
  assert.deepEqual(readSettings({}), { enabled: true, loopTabs: [], callsAtOnce: {}, defaultMode: 'restricted', limits, roles: {}, projects: {}, long });
  assert.deepEqual(readSettings({ loopTabs: '["research","Bad Tab!",3]', callsAtOnce: '{"local":4,"cloud":99,"x":"no"}' }).loopTabs, ['research', '3']);
  assert.deepEqual(readSettings({ callsAtOnce: '{"local":4,"cloud":99,"tiny":0,"x":"no"}' }).callsAtOnce, { local: 4, cloud: 16, tiny: 1 }, 'between 1 and 16 (the owner\'s answer)');
  assert.deepEqual(readSettings({ loopTabs: 'not json' }).loopTabs, []);
  // Long run defaults: one place (Settings → Mission), kept in range.
  assert.deepEqual(readSettings({ longMinutes: 5000, longLaps: 0, longFullTime: true, longKeepAwake: false, longBattery: true, longRetry: false, longEffort: false }).long, { minutes: 720, laps: 0, steps: 0, fullTime: true, keepAwake: false, battery: true, retry: false, effort: false, helpers: 4, needs: 'ask', waitAsk: 30, waitHold: 0, assistant: 'look', carryOn: true }, 'stage B: laps 0 is no lap limit');
  const set = readSettings({ enabled: false, defaultMode: 'auto', maxTries: 99, maxSteps: 'x', waitMinutes: 0, roles: '{"plan":{"provider":"p","model":"big"},"review":{"provider":"","model":"x"},"other":{"provider":"p","model":"m"}}', projects: '{"/w":{"implement":{"provider":"p","model":"coder"}},"/empty":{}}' });
  assert.equal(set.enabled, false);
  assert.equal(set.defaultMode, 'auto');
  assert.deepEqual(set.limits, { ...limits, maxTries: 8, waitMinutes: 0 });
  // Only whole choices count, and only for the three roles.
  assert.deepEqual(set.roles, { plan: { provider: 'p', model: 'big' } });
  assert.deepEqual(set.projects, { '/w': { implement: { provider: 'p', model: 'coder' } } });
  assert.deepEqual(readSettings({ roles: 'not json', projects: '[1]' }).roles, {});
  assert.equal(readSettings({ defaultMode: 'anything' }).defaultMode, 'restricted');
  for (const word of ['/mission restricted', '/mission ask', '/mission auto', '/mission off', '/mission back 12', '/mission <your goal>', '/mission stop', '/mission end']) assert.ok(HELP.includes(word), word);
});

test('a role\'s model: the project\'s choice, then Mission\'s, then Model Tiers, then the conversation', async () => {
  const { pickRoute } = await import('../runner.js');
  const a = { provider: 'p', model: 'a' };
  const b = { provider: 'p', model: 'b' };
  const c = { provider: 'p', model: 'c' };
  const d = { provider: 'p', model: 'd' };
  assert.deepEqual(pickRoute({ project: { plan: a }, defaults: { plan: b }, tierRoute: c, current: d }, 'plan'), { ...a, from: 'project' });
  assert.deepEqual(pickRoute({ project: { review: a }, defaults: { plan: b }, tierRoute: c, current: d }, 'plan'), { ...b, from: 'mission' });
  assert.deepEqual(pickRoute({ project: undefined, defaults: {}, tierRoute: c, current: d }, 'implement'), { ...c, from: 'tiers' });
  assert.deepEqual(pickRoute({ defaults: {}, tierRoute: null, current: d }, 'review'), { ...d, from: 'conversation' });
  assert.equal(pickRoute({ defaults: {}, tierRoute: { provider: 'p' } }, 'review'), undefined);
});

test('answers are read for their JSON, whatever is written around it', async () => {
  const { jsonOf, planPrompt, workPrompt, reviewPrompt, conductorNote } = await import('../lib/prompts.js');
  assert.deepEqual(jsonOf('Here you go:\n```json\n{"items":[{"title":"a {brace} \\" quote"}]}\n```\nDone.'), { items: [{ title: 'a {brace} " quote' }] });
  assert.deepEqual(jsonOf('{broken} then {"ok":true}'), { ok: true });
  assert.equal(jsonOf('no json here'), undefined);
  assert.equal(jsonOf('[1,2]'), undefined);
  assert.match(planPrompt({ goal: 'g', root: '/w', files: 'a.js', maxItems: 5 }), /^MISSION_PLAN\n[\s\S]*At most 5 items/);
  const item = { id: '2', title: 'Add flag', detail: 'd', doneWhen: 'w', check: 'npm test', tries: 2, note: 'Its command did not pass.', evidence: 'npm test\nfail', report: 'tried' };
  const work = workPrompt({ goal: 'g', summary: 's', item, others: '1. x', senior: true });
  assert.match(work, /^MISSION_WORK\nYou are the senior worker/);
  assert.match(work, /ITEM 2: Add flag[\s\S]*It will be proved by running: npm test[\s\S]*Earlier attempts: 2[\s\S]*Never weaken or delete a test/);
  assert.match(workPrompt({ goal: 'g', item: { ...item, check: '', tries: 0 }, senior: false }), /No command proves this item/);
  assert.match(reviewPrompt({ goal: 'g', list: 'l', checks: '', changes: '', last: true }), /^MISSION_REVIEW[\s\S]*\(nothing changed\)[\s\S]*This is the last review/);
  assert.match(conductorNote({ goal: 'g' }), /call mission_step once/);
});

test('a run goes plan, work, checks, review, finish, and commands decide what passed', async () => {
  const { newRun, nextStep, applyPlan, applyWork, applyChecks, applyReview, finish, report, tally, checklist, readLimits } = await import('../lib/run.js');
  const run = newRun({ id: 'r1', goal: 'Ship it', mode: 'Full Auto', root: '/w', limits: { maxTries: 3 }, checkpoint: 4, at: 0 });
  assert.equal(nextStep(run).kind, 'plan');
  applyPlan(run, { summary: 'Do three things.', items: [{ title: 'Tests', done_when: 'tests exist', check: 'test -f t.js' }, { title: 'Docs', detail: 'write' }, { title: '' }, { title: 'Code', check: 'npm test' }], checks: ['npm test', 'npm test', 'npm run build'] });
  assert.deepEqual(run.items.map((item) => item.title), ['Tests', 'Docs', 'Code']);
  assert.deepEqual(run.checks, ['npm test', 'npm run build']);

  // Item 1: its command fails twice, then passes on the third (senior) try.
  assert.equal(nextStep(run).item.id, '1');
  applyWork(run, '1', { report: 'done!', check: { ok: false, output: 'no file' } });
  assert.equal(run.items[0].status, 'open');
  assert.equal(nextStep(run).item.id, '1');
  applyWork(run, '1', { report: 'done again', check: { ok: false, output: 'no file' } });
  applyWork(run, '1', { report: 'really', check: { ok: true, output: '' } });
  assert.equal(run.items[0].status, 'verified');
  assert.match(run.items[0].evidence, /passed, no output/);

  // Item 2 has no command: the worker's word is not enough.
  applyWork(run, '2', { report: 'wrote docs' });
  assert.equal(run.items[1].status, 'unverified');
  // Item 3: the user's yes did not come.
  applyWork(run, '3', { report: 'BLOCKED', check: { ok: false, output: 'x' }, aside: 'change src/a.js?' });
  assert.equal(run.items[2].status, 'aside');

  assert.equal(nextStep(run).kind, 'checks');
  applyChecks(run, [{ command: 'npm test', ok: true, output: 'ok' }, { command: 'npm run build', ok: false, output: 'TS2304' }]);
  // A failing overall command becomes work.
  assert.equal(run.items.at(-1).title, 'Make "npm run build" pass');
  assert.equal(nextStep(run).item.id, '4');
  applyWork(run, '4', { report: 'fixed', check: { ok: true, output: 'built' } });
  assert.equal(nextStep(run).kind, 'checks');
  applyChecks(run, [{ command: 'npm test', ok: true, output: 'ok' }, { command: 'npm run build', ok: true, output: 'ok' }]);
  assert.equal(nextStep(run).kind, 'review');

  // The reviewer accepts item 2, cannot overrule a set-aside item, and sends item 1 back.
  applyReview(run, { verdict: 'changes', note: 'Close.', items: [{ id: '2', ok: true, note: 'docs fine' }, { id: '3', ok: true }, { id: '1', ok: false, note: 'test asserts nothing' }], new_items: [] });
  assert.equal(run.items[1].status, 'reviewed');
  assert.equal(run.items[2].status, 'aside');
  // Item 1 had used all its tries, so it is not reopened; its command passed, so it stays passed.
  assert.equal(run.items[0].status, 'verified');
  assert.match(run.items[0].note, /Reviewer: test asserts nothing/);
  assert.equal(nextStep(run).kind, 'finish');

  finish(run, '', 20 * 60000);
  assert.equal(run.status, 'incomplete');
  assert.deepEqual(tally(run), { verified: 2, reviewed: 1, unverified: 0, stuck: 0, aside: 1, parked: 0, open: 0, total: 4 });
  const text = report(run);
  assert.match(text, /^Mission not complete: 3 of 4 items done\. 1 needs your yes\./);
  assert.match(text, /Waiting for your yes:\n- Item 3: change src\/a\.js\?/);
  assert.match(text, /To undo everything this run changed: \/mission back 4/);
  assert.match(text, /PASSED = its command was run and passed\. REVIEWED = no command could prove it/);
  assert.match(checklist(run), /^1\. \[PASSED\] Tests {2}\(proved by: test -f t\.js\)/);
  assert.equal(nextStep(run).kind, 'done');
  assert.deepEqual(readLimits({ maxItems: 500, maxSteps: 1 }), { maxItems: 30, maxTries: 3, maxReviews: 2, maxSteps: 5, waitMinutes: 3 });
});

test('a run ends complete only when every item is proved or reviewed and the commands pass', async () => {
  const { newRun, nextStep, applyPlan, applyWork, applyReview, finish, report } = await import('../lib/run.js');
  const good = newRun({ id: 'r2', goal: 'Small', mode: 'Restricted', root: '/w', checkpoint: 1, at: 0 });
  applyPlan(good, { items: [{ title: 'One', check: 'true' }, { title: 'Two' }] });
  applyWork(good, '1', { check: { ok: true, output: 'ok' } });
  applyWork(good, '2', { report: 'did it' });
  // No overall commands: straight to the review.
  assert.equal(nextStep(good).kind, 'review');
  applyReview(good, { verdict: 'approve', items: [{ id: '2', ok: true }] });
  finish(good, '', 60000);
  assert.equal(good.status, 'complete');
  assert.match(report(good), /^Mission complete: all 2 items done and checked\./);

  // A reviewer who says nothing usable approves nothing.
  const silent = newRun({ id: 'r3', goal: 'Small', mode: 'Restricted', root: '/w', at: 0 });
  applyPlan(silent, undefined);
  assert.equal(silent.items.length, 1);
  applyWork(silent, '1', { report: 'did it' });
  applyReview(silent, undefined);
  finish(silent);
  assert.equal(silent.status, 'incomplete');
  assert.match(report(silent), /1 could not be verified/);

  // A worker that never gets its command to pass is stuck after its tries; the step limit ends a run.
  const stuck = newRun({ id: 'r4', goal: 'Hard', mode: 'Full Auto', root: '/w', limits: { maxTries: 2, maxSteps: 5 }, at: 0 });
  applyPlan(stuck, { items: [{ title: 'A', check: 'false' }, { title: 'B', check: 'false' }, { title: 'C' }] });
  applyWork(stuck, '1', { check: { ok: false, output: 'no' } });
  applyWork(stuck, '1', { check: { ok: false, output: 'no' } });
  assert.equal(stuck.items[0].status, 'stuck');
  applyWork(stuck, '2', { failed: 'the worker stopped' });
  applyWork(stuck, '2', { check: { ok: false, output: 'no' } });
  assert.equal(stuck.steps, 5);
  assert.equal(nextStep(stuck).kind, 'finish');
  finish(stuck);
  assert.match(report(stuck), /^Mission not complete: 0 of 3 items done\. It reached its limit of 5 steps\./);

  const stopped = newRun({ id: 'r5', goal: 'x y z', mode: 'Ask-Auto', root: '/w', at: 0 });
  applyPlan(stopped, { items: [{ title: 'A' }] });
  finish(stopped, 'You ended it.');
  assert.match(report(stopped), /^Mission stopped: 0 of 1 items done\. You ended it\./);
});

test('an ended run is taken up again for what waited for the user', async () => {
  const { newRun, nextStep, applyPlan, applyWork, applyReview, finish, reopen, report } = await import('../lib/run.js');
  const run = newRun({ id: 'r6', goal: 'x y z', mode: 'Restricted', root: '/w', limits: { maxSteps: 5, maxReviews: 1 }, at: 0 });
  applyPlan(run, { items: [{ title: 'A', check: 'true' }, { title: 'B', check: 'true' }] });
  applyWork(run, '1', { check: { ok: true, output: '' } });
  applyWork(run, '2', { check: { ok: false, output: 'no' }, aside: 'change b.js?' });
  applyReview(run, { verdict: 'approve', items: [] });
  finish(run);
  assert.equal(run.status, 'incomplete');
  assert.match(report(run), /Type \/mission resume while you are here/);
  assert.equal(reopen(run), 1);
  assert.equal(run.status, 'running');
  assert.equal(run.items[1].tries, 0);
  // There is room to finish, and one more review.
  assert.ok(run.limits.maxSteps > run.steps + 3);
  assert.deepEqual(nextStep(run), { kind: 'work', item: run.items[1] });
  applyWork(run, '2', { check: { ok: true, output: '' } });
  assert.equal(nextStep(run).kind, 'review');
  applyReview(run, { verdict: 'approve', items: [] });
  finish(run);
  assert.equal(run.status, 'complete');
  // A finished run has nothing to take up.
  assert.equal(reopen(run), 0);
  assert.equal(run.status, 'complete');
});

test('a step runs on its own: a short call waits, is told to come back, and the next call gets the result', async () => {
  const { createRunner, WAIT_MS, IDLE_ROUNDS, PROGRAM_TOOL } = await import('../runner.js');
  const { conductorNote } = await import('../lib/prompts.js');
  assert.equal(PROGRAM_TOOL, 'run_code');
  // Under PTC the app stops a program after two minutes by default: the wait must end before that.
  assert.ok(WAIT_MS.program < 120_000);
  assert.match(conductorNote({ goal: 'g' }, true), /return await tools\.mission_step\(\{\}\)/);
  assert.match(conductorNote({ goal: 'g' }, true), /still working, that is not an error/);
  assert.ok(!/run_code/.test(conductorNote({ goal: 'g' }, false)));

  const root = fresh();
  try {
    const goal = { id: 'g1', revision: 1, phase: 'active' };
    let made = false;
    const calls = [];
    const goals = {
      create: (_agent, request) => { calls.push(['create', request.maxGoalRounds]); goal.phase = 'active'; made = true; return goal; },
      get: () => (made ? goal : undefined),
      pause: () => { calls.push(['pause']); goal.phase = 'paused'; },
      resume: () => { calls.push(['resume']); goal.phase = 'active'; },
      complete: () => { calls.push(['complete']); goal.phase = 'complete'; },
    };
    let delay = 250;
    const answers = ['{"summary":"s","items":[{"title":"Only item","check":"true"}],"checks":[]}', 'Report: did it.'];
    const subagents = { startActivation: async () => ({ childId: 'c', result: new Promise((resolve) => setTimeout(() => resolve({ output: [{ type: 'text', text: answers.shift() ?? 'ok' }], stopReason: 'end' }), delay)) }) };
    const ctx = { get: (name) => ({ goals, subagents })[name] };
    const points = { take: async () => ({ id: 'p', number: 3, fresh: true }), files: async () => ({ files: ['a.js'], more: false }), idOf: async () => 'p', changes: async () => '' };
    const runner = createRunner(ctx, { settings: () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 0, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} }), pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = { id: 'conv', model: { current: () => ({ provider: 'p', model: 'm' }) } };
    const started = await runner.start(agent, 'do one small thing', { mode: 'auto', root });
    assert.match(started, /^Mission started \(Auto\)/);
    // The app's own cap on rounds is far above the run's step limit: waiting rounds must not end a run.
    assert.ok(calls[0][1] >= 1000);
    assert.equal(runner.isOn('conv'), true);

    // The planner needs 250 ms; this call waits 40 ms and is told to come back.
    const first = await runner.step(agent, new AbortController().signal, 40);
    assert.match(first, /^Still working on this step: the plan \(1 minute so far\)[\s\S]*Call mission_step again/);
    assert.equal(runner.runOf('conv').steps, 0);
    // The next call finds the same step and gets its result.
    const second = await runner.step(agent, new AbortController().signal, 5000);
    assert.match(second, /^Step 1: plan \(planner on m\)\. 1 item\./);
    assert.equal(runner.runOf('conv').steps, 1);

    // A call that is cut off (a program's time ran out) does not stop the step while the goal is active.
    delay = 2200;
    const cut = new AbortController();
    setTimeout(() => cut.abort(), 30);
    assert.match(await runner.step(agent, cut.signal, 5000), /cut off/);
    const third = await runner.step(agent, new AbortController().signal, 5000);
    assert.match(third, /Step 2: item 1 of 1[\s\S]*PASSED[\s\S]*Mission complete: all 1 item done and checked\./);
    assert.equal(runner.isOn('conv'), false);
    assert.deepEqual(calls.at(-1), ['complete']);

    // Rounds without a step pause a run instead of using rounds up.
    const stalled = { id: 'conv2', model: agent.model };
    goal.phase = 'complete';
    answers.push('{"items":[{"title":"x"}]}');
    await runner.start(stalled, 'another small thing', { mode: 'auto', root });
    let paused = false;
    for (let round = 0; round <= IDLE_ROUNDS && !paused; round += 1) paused = runner.round(stalled);
    assert.equal(paused, true);
    assert.equal(goal.phase, 'paused');
    assert.match(runner.status(stalled), /did not call mission_step for 5 rounds/);
    // A step in between resets the count.
    assert.equal(runner.round(stalled), false);

    // A goal that used up its rounds cannot be resumed; the run gets a new one and carries on.
    goals.resume = () => { throw new Error('round cap reached'); };
    goals.clear = () => { calls.push(['clear']); made = false; };
    assert.match(runner.resume(stalled), /^Mission carries on from step 1/);
    assert.deepEqual(calls.slice(-2).map((call) => call[0]), ['clear', 'create']);
    assert.equal(goal.phase, 'active');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('one model for everything is the default; the roles\' models need the conversation to say so', async () => {
  const { createRunner } = await import('../runner.js');
  const root = fresh();
  try {
    let policy;
    let made = false;
    const goal = { id: 'g', revision: 1, phase: 'active' };
    const goals = { create: () => { made = true; goal.phase = 'active'; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => { goal.phase = 'complete'; }, clear: () => { made = false; } };
    const used = [];
    const subagents = { startActivation: async (spec) => { used.push(spec.agentOptions?.model); return { childId: 'c', result: Promise.resolve({ output: [{ type: 'text', text: '{"items":[{"title":"x","check":"true"}]}' }], stopReason: 'end' }) }; } };
    const modelTiers = { resolveTier: () => ({ id: 't' }), roleRoute: (_tier, role) => ({ provider: 'p', model: `tier-${role}` }) };
    const services = { goals, subagents, modelTiers };
    const ctx = { get: (name) => (name === 'modes' ? (policy === undefined ? undefined : { helperModels: () => policy }) : services[name]) };
    const points = { take: async () => ({ id: 'p', number: 1, fresh: true }), files: async () => ({ files: [], more: false }), idOf: async () => 'p', changes: async () => '' };
    const settings = () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 0, maxSteps: 60, waitMinutes: 3 }, roles: { review: { provider: 'p', model: 'mission-review' } }, projects: {} });
    const runner = createRunner(ctx, { settings, pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
    const agent = (id) => ({ id, model: { current: () => ({ provider: 'p', model: 'big-one' }) } });

    // No Modes add-on, and Modes saying "same": the conversation's model for every role.
    for (const [index, say] of [undefined, 'same'].entries()) {
      policy = say;
      made = false;
      const text = await runner.start(agent(`a${index}`), 'do one small thing', { mode: 'auto', root });
      assert.match(text, /^Mission started \(Auto\), one model\./);
      assert.match(text, /Models: one model for everything \(big-one\)\. To use different models/);
      await runner.step(agent(`a${index}`), new AbortController().signal, 5000);
      assert.equal(used.at(-1), 'big-one');
    }

    // "Different models": Mission's own pick for the reviewer, Model Tiers for the others.
    policy = 'roles';
    made = false;
    const text = await runner.start(agent('b'), 'do one small thing', { mode: 'auto', root });
    assert.match(text, /^Mission started \(Auto\), 3 models\./);
    assert.match(text, /Models: 3 different models: planner tier-plan, worker tier-implement, reviewer mission-review\. They may be loaded at the same time\./);
    await runner.step(agent('b'), new AbortController().signal, 5000);
    assert.equal(used.at(-1), 'tier-plan');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('checkpoints are refused for a home, Documents or system folder, in plain words, and nothing is written there', async () => {
  const home = fresh();
  try {
    mkdirSync(join(home, 'Documents'));
    mkdirSync(join(home, 'Library', 'Mobile Documents'), { recursive: true });
    mkdirSync(join(home, 'project'));
    writeFileSync(join(home, 'Documents', 'a.txt'), 'x');
    const { tooBroad } = await import('../lib/checkpoints.js');
    for (const broad of [home, join(home, 'Documents'), join(home, 'Library', 'Mobile Documents'), '/', '/Applications', dirname(home)]) assert.ok(tooBroad(broad, home), `${broad} is too broad`);
    assert.ok(!tooBroad(join(home, 'project'), home));
    assert.ok(!tooBroad(join(home, 'Documents', 'project'), home));

    for (const folder of [home, join(home, 'Documents')]) {
      const points = openCheckpoints(folder, { homeDir: home });
      const point = await points.take('Start');
      assert.equal(point.skipped, true);
      assert.equal(point.number, 0);
      assert.match(point.reason, /Checkpoints are off for this folder: it is too broad/);
      assert.match(point.reason, /including a Mission, works without them/);
      assert.equal(existsSync(join(folder, OWN_FOLDER)), false, 'no hidden store is made in a broad folder');
      // Everything that reads checkpoints answers "nothing" instead of failing, so a run goes on.
      assert.deepEqual(await points.since(''), { changed: [], deleted: [], added: [] });
      assert.deepEqual(await points.list(), []);
      assert.equal(await points.idOf(1), '');
      assert.equal(await points.changes(''), '');
      assert.deepEqual(await points.files(), { files: [], more: false });
      assert.match(await points.why(), /too broad/);
      await assert.rejects(points.back(1), /too broad/);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a folder with too many files or too many bytes is refused and its store is removed again; a small one still works', async (t) => {
  if (!GIT_CANDIDATES.some((path) => existsSync(path))) return t.skip('no git here');
  const home = fresh();
  const gitHome = fresh();
  try {
    const big = join(home, 'big');
    mkdirSync(big);
    for (let n = 0; n < 12; n += 1) writeFileSync(join(big, `f${n}.txt`), 'x');
    const small = join(home, 'small');
    mkdirSync(small);
    writeFileSync(join(small, 'a.txt'), 'x');

    const { MAX_FILES, MAX_BYTES } = await import('../lib/checkpoints.js');
    assert.equal(MAX_FILES, 20000);
    assert.equal(MAX_BYTES, 2 * 1024 * 1024 * 1024);
    // Too many files (the limit lowered for the test).
    const many = openCheckpoints(big, { homeDir: home, gitHome, maxFiles: 10 });
    const refused = await many.take('Start');
    assert.equal(refused.skipped, true);
    assert.match(refused.reason, /Checkpoints are off for this folder: it holds 12 files \(the limit is 10\)/);
    assert.equal(existsSync(join(big, OWN_FOLDER)), false, 'the store made for counting is removed again');
    // Too many bytes.
    writeFileSync(join(big, 'huge.bin'), Buffer.alloc(4096));
    const heavy = await openCheckpoints(big, { homeDir: home, gitHome, maxBytes: 1024 }).take('Start');
    assert.match(heavy.reason, /it holds more than/);
    assert.equal(existsSync(join(big, OWN_FOLDER)), false);
    // What the project ignores does not count.
    writeFileSync(join(big, '.gitignore'), 'f*.txt\nhuge.bin\n');
    const counted = await openCheckpoints(big, { homeDir: home, gitHome, maxFiles: 10, maxBytes: 1024 }).take('Start');
    assert.equal(counted.skipped, undefined);
    const ok = await openCheckpoints(small, { homeDir: home, gitHome }).take('Start');
    assert.equal(ok.skipped, undefined);
    assert.equal(ok.number, 1);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(gitHome, { recursive: true, force: true });
  }
});

test('Apple\'s stand-in git without the Command Line Tools gives a plain "install them" answer, not an error', async () => {
  const folder = fresh();
  try {
    const none = openCheckpoints(folder, { git: '', homeDir: '/nowhere' });
    const point = await none.take('Start');
    assert.equal(point.skipped, true);
    assert.match(point.reason, /xcode-select --install/);
    assert.match(point.reason, /Everything else works without checkpoints/);
    assert.equal(existsSync(join(folder, OWN_FOLDER)), false);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});

// ---- the regression fixes (review of Phases 1-3, items 5 and 6) ----

test('Apple\'s stand-in git (no Command Line Tools) is refused with the "install them" words; with the tools present it works', async (t) => {
  if (!existsSync('/usr/bin/git')) return t.skip('no /usr/bin/git here');
  const folder = fresh();
  const gitHome = fresh();
  try {
    writeFileSync(join(folder, 'a.txt'), 'x');
    // The very program Apple ships, with the tools check failing (what a Mac without the tools answers).
    const standIn = openCheckpoints(folder, { git: '/usr/bin/git', xcodeSelect: '/usr/bin/false', gitHome, homeDir: '/nowhere' });
    const point = await standIn.take('Start');
    assert.equal(point.skipped, true);
    assert.match(point.reason, /xcode-select --install/);
    assert.equal(existsSync(join(folder, OWN_FOLDER)), false, 'git was never run');
    assert.match(standIn.peek(), /xcode-select --install/);
    // The same program with the check passing: checkpoints work.
    const there = openCheckpoints(folder, { git: '/usr/bin/git', xcodeSelect: '/usr/bin/true', gitHome, homeDir: '/nowhere' });
    assert.equal((await there.take('Start')).number, 1);
  } finally {
    rmSync(folder, { recursive: true, force: true });
    rmSync(gitHome, { recursive: true, force: true });
  }
});

test('more places count as too broad: Pictures, Music, Movies, the cloud drives, a disk\'s top folder; a project inside is fine', async () => {
  const { tooBroad } = await import('../lib/checkpoints.js');
  const home = '/Users/someone';
  for (const broad of ['Pictures', 'Music', 'Movies', 'Dropbox', 'Google Drive', 'OneDrive', 'Library/Mobile Documents/com~apple~CloudDocs', 'Library/CloudStorage', 'Library/CloudStorage/GoogleDrive-me@example.com', 'Library/CloudStorage/OneDrive-Personal', 'Library/CloudStorage/Dropbox'].map((name) => join(home, name)).concat(['/Volumes', '/Volumes/Backup'])) assert.ok(tooBroad(broad, home), `${broad} is too broad`);
  for (const fine of ['Pictures/shoot', 'Dropbox/work/app', 'Library/CloudStorage/GoogleDrive-me@example.com/My Drive'].map((name) => join(home, name)).concat(['/Volumes/Backup/project', '/tmp/project'])) assert.ok(!tooBroad(fine, home), `${fine} is fine`);
});

test('a folder refused as too big stays refused after a restart, also when a .dsh-mission folder already existed', async (t) => {
  if (!GIT_CANDIDATES.some((path) => existsSync(path))) return t.skip('no git here');
  const home = fresh();
  const gitHome = fresh();
  try {
    const big = join(home, 'big');
    mkdirSync(join(big, OWN_FOLDER), { recursive: true });
    writeFileSync(join(big, OWN_FOLDER, 'note.txt'), 'kept');
    for (let n = 0; n < 12; n += 1) writeFileSync(join(big, `f${n}.txt`), 'x');
    const first = await openCheckpoints(big, { homeDir: home, gitHome, maxFiles: 10 }).take('Start');
    assert.equal(first.skipped, true);
    assert.equal(existsSync(join(big, OWN_FOLDER, 'checkpoints.git')), false, 'the store made for counting is gone');
    assert.equal(existsSync(join(big, OWN_FOLDER, 'note.txt')), true, 'what was already in that folder stays');
    // A restart: a new object, the folder is still too big, nothing was copied.
    const again = await openCheckpoints(big, { homeDir: home, gitHome, maxFiles: 10 }).take('Start');
    assert.equal(again.skipped, true);
    assert.match(again.reason, /it holds 12 files/);
    assert.equal(existsSync(join(big, OWN_FOLDER, 'checkpoints.git')), false);
    // And a store that exists but holds no checkpoint is counted too (an older version left one behind).
    mkdirSync(join(big, OWN_FOLDER, 'checkpoints.git'), { recursive: true });
    const { execFileSync } = await import('node:child_process');
    execFileSync(GIT_CANDIDATES.find((path) => existsSync(path)), ['init', '--quiet', join(big, OWN_FOLDER, 'checkpoints.git')]);
    const left = await openCheckpoints(big, { homeDir: home, gitHome, maxFiles: 10 }).take('Start');
    assert.equal(left.skipped, true, 'an empty store does not skip the size check');
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(gitHome, { recursive: true, force: true });
  }
});

test('old checkpoints in a folder now judged too broad stay reachable: listed and gone back to, none is added', async (t) => {
  if (!GIT_CANDIDATES.some((path) => existsSync(path))) return t.skip('no git here');
  const home = fresh();
  const gitHome = fresh();
  try {
    // A folder that was a project when its checkpoints were taken (its own home folder was elsewhere), and is "Documents" now.
    const folder = join(home, 'Documents');
    mkdirSync(folder);
    writeFileSync(join(folder, 'a.txt'), 'one');
    const before = openCheckpoints(folder, { homeDir: '/somewhere/else', gitHome });
    assert.equal((await before.take('Old')).number, 1);
    writeFileSync(join(folder, 'a.txt'), 'two');
    writeFileSync(join(folder, 'new.txt'), 'made later');
    // Now the rule applies to it.
    const points = openCheckpoints(folder, { homeDir: home, gitHome });
    assert.match(points.peek(), /Checkpoints kept earlier can still be listed/);
    const list = await points.list();
    assert.equal(list.length, 1);
    assert.equal(list[0].label, 'Old');
    const refused = await points.take('New');
    assert.equal(refused.skipped, true, 'no new checkpoint is taken');
    assert.match(refused.reason, /too broad to copy/);
    assert.equal((await points.list()).length, 1, 'still one');
    assert.match(await points.why(), /Checkpoints kept earlier/);
    assert.deepEqual(await points.since(list[0].id), { changed: [], deleted: [], added: [] }, 'the folder is not scanned');
    const went = await points.back(1);
    assert.equal(went.readOnly, true);
    assert.equal(went.saved, 0);
    assert.equal(readFileSync(join(folder, 'a.txt'), 'utf8'), 'one', 'the file is back as it was');
    assert.equal(readFileSync(join(folder, 'new.txt'), 'utf8'), 'made later', 'a file made later is left alone');
    assert.equal((await points.list()).length, 1, 'going back added nothing (that would copy the folder)');
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(gitHome, { recursive: true, force: true });
  }
});

test('a command is told apart: readers run freely, anything that could change a file is asked about', () => {
  const free = ['ls -la', 'cat src/a.js | grep -n foo', 'git status', 'git diff HEAD~1', 'git log --oneline -5', 'find . -name "*.js"', 'echo hello', 'pwd && ls', 'grep -r todo . 2>&1', 'cat a.txt > /dev/null', 'git config --get user.name', 'sed -n "1,5p" a.txt'];
  const asked = ['rm -rf build', 'npm test', 'echo hi > out.txt', 'cat a >> b', 'sed -i "" "s/a/b/" f.txt', 'find . -name "*.tmp" -delete', 'find . -exec rm {} ;', 'git checkout -- .', 'git commit -am x', 'git branch -D x', 'mv a b', 'cp a b', 'touch x', 'ls $(rm -rf x)', 'ls `touch x`', 'tee out.txt', 'python3 build.py', 'ls; rm x', 'ls && npm install', 'sort -o out.txt a.txt', 'cat <<EOF'];
  for (const command of free) assert.equal(mayChangeFiles(command), false, `${command} only reads`);
  for (const command of asked) assert.equal(mayChangeFiles(command), true, `${command} could change files`);
});

test('the model\'s rules tell the truth: with no undo they say so, and ask the model to tell the user; with checkpoints they keep the old text', () => {
  const root = '/tmp/project';
  const reason = 'Checkpoints are off for this folder: it is too broad.';
  for (const mode of ['restricted', 'ask']) {
    const note = rulesNote(mode, root, reason);
    assert.match(note, /no undo is available in this folder/);
    assert.match(note, /tell the user once, in plain words, that this folder has no undo/i);
    assert.doesNotMatch(note, /is undone at once/);
    assert.doesNotMatch(note, /A checkpoint of the folder is taken/);
    assert.match(note, /No checkpoints are taken of this folder/);
    const normal = rulesNote(mode, root);
    assert.match(normal, /is undone at once/);
    assert.match(normal, /A checkpoint of the folder is taken/);
  }
  assert.match(rulesNote('restricted', root, reason), /asked before every command that could change a file/);
  assert.match(rulesNote('ask', root, reason), /not stopped from changing existing files/);
  assert.match(rulesNote('auto', root, reason), /No checkpoints are taken of this folder/);
});

test('a run in a folder without checkpoints does not say "undo with /mission back 0", and its report does not either', async () => {
  const { createRunner } = await import('../runner.js');
  const root = fresh();
  try {
    const goal = { id: 'g', revision: 1, phase: 'active' };
    let made = false;
    const goals = { create: () => { made = true; return goal; }, get: () => (made ? goal : undefined), pause: () => {}, resume: () => {}, complete: () => {}, clear: () => {} };
    const ctx = { get: (name) => ({ goals, subagents: {}, modelTiers: { resolveTier: () => ({ id: 't' }), roleRoute: () => undefined } })[name] };
    const settings = () => ({ limits: { maxItems: 12, maxTries: 3, maxReviews: 0, maxSteps: 60, waitMinutes: 3 }, roles: {}, projects: {} });
    for (const [number, expect] of [[0, false], [4, true]]) {
      const points = { take: async () => (number ? { id: 'p', number, fresh: true } : { id: '', number: 0, fresh: false, skipped: true, reason: 'Checkpoints are off for this folder.' }), files: async () => ({ files: [], more: false }), idOf: async () => '', changes: async () => '' };
      const runner = createRunner(ctx, { settings, pointsOf: () => points, afterCommand: async () => [], warn: () => {}, home: undefined });
      made = false;
      const text = await runner.start({ id: `x${number}`, model: { current: () => ({ provider: 'p', model: 'm' }) } }, 'do one small thing', { mode: 'auto', root });
      assert.doesNotMatch(text, /back 0/);
      if (expect) assert.match(text, /To undo everything it changes: \/mission back 4/);
      else assert.match(text, /No checkpoints are kept of this folder, so what it changes cannot be undone with \/mission back\./);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
