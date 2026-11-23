/**
 * Mission stage D (20 November 2026), through the add-on: approvals a Mission's helpers need are parked in the Mission's
 * card (the app's approval card is never asked, so it never covers the chat box), answered with the route's `approve`
 * or with a continue after the end; one writer per file in the tool guard; Tool access's parked requests.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { apply } from '../index.js';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));
const fresh = () => realpathSync(mkdtempSync(join(tmpdir(), 'mission-approvals-')));
const tick = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const PLAN = (items) => JSON.stringify({ summary: 's', items, checks: [] });

/** Mission on stand-in services; its helpers hold their items until the test releases them. */
function running({ config = {}, helperText, jobs } = {}) {
  const home = fresh();
  const folders = [home];
  const goals = new Map();
  const handlers = new Map();
  const commands = {};
  const tools = {};
  const routes = {};
  const agents = new Map();
  const provided = {};
  const asked = [];
  const ledger = [];
  const levels = {};
  const holds = new Map();
  const granted = [];
  const revoked = [];
  const denied = [];
  let toolAccessOn = true;
  let n = 0;
  const services = {
    dshHomePath: (sub) => join(home, sub),
    modes: { isolated: () => false, get: () => 'code', readOnly: () => false, longTools: () => ({ files: true, web: true }), refreshTools: () => {}, ultraCode: () => false, depthOf: () => 'standard' },
    sandboxPolicy: { resolve: ({ session }) => ({ mode: levels[session.id] ?? 'workspace-write' }) },
    modelTiers: { resolveTier: () => null, roleRoute: () => undefined },
    permissionPresets: { current: () => 'workspace-write', set: () => {} },
    agents: { list: () => [...agents.values()], get: (id) => agents.get(id) },
    approval: { request: async (request) => { asked.push(request); return 'allowed-once'; } },
    ...(jobs ? { jobs } : {}),
    toolLedger: { note: (entry) => ledger.push([entry.outcome, entry.rule]) },
    get toolAccess() {
      return toolAccessOn ? {
        grantParked: async ({ tool }) => { granted.push(tool); const count = granted.filter((each) => each === tool).length; await tick(1); return { ok: true, id: count === 1 ? `g-${tool}` : `g-${tool}#${count}` }; },
        denyParked: ({ tool }) => denied.push(tool),
        revoke: async (id) => { revoked.push(id); },
      } : undefined;
    },
    goals: {
      create: (agent) => { const goal = { id: `g-${agent.id}`, revision: 1, phase: 'active' }; goals.set(agent.id, goal); return goal; },
      get: (agent) => goals.get(agent.id),
      pause: (agent) => { goals.get(agent.id).phase = 'paused'; },
      resume: (agent) => { goals.get(agent.id).phase = 'active'; },
      complete: (agent) => { goals.get(agent.id).phase = 'complete'; },
      clear: (agent) => { goals.delete(agent.id); },
    },
    subagents: {
      startActivation: async (spec) => {
        n += 1;
        const childId = `h${n}`;
        const parent = spec.parent?.id ?? 'c';
        const cwd = agents.get(parent)?.header?.cwd;
        agents.set(childId, { id: childId, header: { parentSession: parent, cwd }, session: { id: childId, header: { parentSession: parent, cwd } } });
        if (spec.label === 'Mission: planner') return { childId, result: Promise.resolve({ output: [{ type: 'text', text: PLAN([{ title: 'one' }, { title: 'two' }, { title: 'three' }]) }], stopReason: 'end' }) };
        if (spec.label === 'Mission: questions') return { childId, result: Promise.resolve({ output: [{ type: 'text', text: '{"questions": []}' }], stopReason: 'end' }) };
        if (/^Mission: item/.test(spec.label)) {
          let settle;
          const result = new Promise((resolve) => { settle = (text) => resolve({ output: [{ type: 'text', text }], stopReason: 'end' }); });
          holds.set(spec.label, { childId, settle });
          return { childId, result, dispose: () => settle('') };
        }
        return { childId, result: Promise.resolve({ output: [{ type: 'text', text: helperText ?? '{"verdict":"approve","items":[]}' }], stopReason: 'end' }) };
      },
    },
  };
  const ctx = {
    logger: { warn: () => {}, info: () => {} },
    get: (name) => services[name],
    effect: (start) => start(),
    provide: (name, service) => { provided[name] = service; return () => {}; },
    on: (name, handler) => { handlers.set(name, [...(handlers.get(name) ?? []), handler]); return () => {}; },
    inject: (_deps, fn) => fn({
      effect: (start) => start(),
      tools: { register: (spec) => { tools[spec.name] = spec; return () => {}; } },
      commands: { register: (spec) => { commands[spec.name] = spec; return () => {}; } },
      webServer: { register: (spec) => { routes[spec.path] = spec.handler; return () => {}; } },
      connection: { requestRejection: () => undefined },
    }),
  };
  apply(ctx, { longKeepAwake: false, ...config });
  const open = (id) => {
    const cwd = fresh();
    folders.push(cwd);
    const agent = { id, header: { cwd }, session: { id, header: { cwd }, append: () => {} }, model: { current: () => ({ provider: 'p', model: 'm' }) } };
    agents.set(id, agent);
    return agent;
  };
  const chain = async (name, exec, ...rest) => {
    let decision = name === 'tools/pre-execute' ? { kind: 'allow' } : { kind: 'accept', content: [{ type: 'text', text: 'ran' }] };
    for (const handler of handlers.get(name) ?? []) decision = await handler(exec, ...rest, async () => decision);
    return decision;
  };
  const card = async (body) => {
    const chunks = [Buffer.from(JSON.stringify(body))];
    const req = { method: 'POST', url: '/dsh-mission/long', headers: {}, async *[Symbol.asyncIterator]() { yield* chunks; } };
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text ?? ''; } };
    await routes['/dsh-mission/long'](req, res);
    return { status: res.statusCode, json: out ? JSON.parse(out) : null };
  };
  const helperOf = (label) => holds.get(label)?.childId;
  const agentOf = (label) => agents.get(helperOf(label));
  const release = async (label, text = 'DONE: ok') => {
    const held = holds.get(label);
    holds.delete(label);
    held.settle(text);
    await tick(30);
  };
  const runner = () => provided.mission;
  // Helpers still settling may write the run's files a moment longer: removed with retries.
  const done = () => { for (const folder of folders) rmSync(folder, { recursive: true, force: true, maxRetries: 10, retryDelay: 30 }); };
  return { handlers: (name) => handlers.get(name) ?? [], agents, open, commands, tools, chain, card, helperOf, agentOf, release, holds, asked, ledger, levels, granted, revoked, denied, provided, runner, done, setToolAccess: (on) => { toolAccessOn = on; } };
}

/** Start a Mission with three helpers and get its three items to work. */
async function started(app, mode = 'restricted') {
  const chat = app.open('c');
  writeFileSync(join(chat.header.cwd, 'existing.txt'), 'old\n');
  const said = await app.commands.mission.handler({ agent: chat, rawInput: `${mode} do three small things in this folder please` });
  assert.equal(said.kind, 'success', said.text);
  assert.match(said.text, /Up to 3 helpers work at once\./);
  const first = await app.tools.mission_step.execute({}, { agent: chat, signal: new AbortController().signal });
  assert.match(first.text, /plan/);
  for (let i = 0; i < 50 && app.holds.size < 3; i += 1) await tick(5);
  assert.equal(app.holds.size, 3);
  return chat;
}

test('a helper\'s change that needs the user\'s yes is parked: no approval card, the helper is told not to try another way, and the card answers it', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    const chat = await started(app);
    const helper = app.agentOf('Mission: item 1');
    const root = chat.header.cwd;
    const write = (agent, file, callId) => app.chain('tools/pre-execute', { agent, name: 'write', arguments: { file_path: join(root, file), content: 'x' }, callId, signal: new AbortController().signal });
    const refused = await write(helper, 'existing.txt', 'w1');
    assert.equal(refused.kind, 'deny');
    assert.match(refused.reason, /^This needs the user's yes, so it waits in the Mission's card; the other helpers carry on\. Do not do the same thing another way/);
    assert.equal(app.asked.length, 0, 'the app\'s approval card is never asked for a Mission\'s helper');
    assert.deepEqual(app.ledger.at(-1), ['parked', 'mission-approval']);
    // The same ask from another helper is the same approval, with its item added.
    await write(app.agentOf('Mission: item 2'), 'existing.txt', 'w2');
    let card;
    const view = app.runner().view('c');
    assert.deepEqual(view.approvals.map((entry) => [entry.id, entry.kind, entry.what, entry.items, entry.status]), [['a1', 'files', 'Change existing.txt', ['1', '2'], 'open']]);
    // Errors change nothing.
    assert.equal((await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: 'a9', choice: 'allow' }] })).json.error, 'That approval is not open any more.');
    assert.equal((await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: 'a1', choice: 'mission' }] })).json.error, 'Pick one of the choices on the card.');
    card = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: 'a1', choice: 'allow' }] });
    assert.equal(card.status, 200, JSON.stringify(card.json));
    assert.equal(card.json.said, 'Allowed: Change existing.txt. Items 1, 2 go on when a helper is free.');
    assert.equal((await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: 'a1', choice: 'deny' }] })).json.said, 'Already answered.', 'two panes are safe');
    // The yes holds for that file for the rest of the conversation, as Mission's modes always did.
    const now = await write(helper, 'existing.txt', 'w3');
    assert.equal(now.kind, 'allow');
    await app.chain('tools/post-execute', { agent: helper, name: 'write', callId: 'w3' }, {});
  } finally {
    app.done();
  }
});

test('one writer per file: a file another item\'s helper changes is refused at once; a command that changed it has it put back', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    const chat = await started(app, 'auto');
    const root = chat.header.cwd;
    const one = app.agentOf('Mission: item 1');
    const two = app.agentOf('Mission: item 2');
    const first = await app.chain('tools/pre-execute', { agent: one, name: 'write', arguments: { file_path: join(root, 'shared.js'), content: 'a' }, callId: 'c1', signal: new AbortController().signal });
    assert.equal(first.kind, 'allow');
    writeFileSync(join(root, 'shared.js'), 'by item 1\n');
    await app.chain('tools/post-execute', { agent: one, name: 'write', callId: 'c1' }, {});
    const second = await app.chain('tools/pre-execute', { agent: two, name: 'edit', arguments: { file_path: join(root, 'shared.js') }, callId: 'c2', signal: new AbortController().signal });
    assert.equal(second.kind, 'deny');
    assert.match(second.reason, /^shared\.js is being changed by another helper \(item 1\) right now\. Do not change it another way\..*WAITING FOR FILE: shared\.js/);
    assert.deepEqual(app.ledger.at(-1), ['refused', 'mission-file-held']);
    // An apply_patch naming it is refused too.
    const patch = await app.chain('tools/pre-execute', { agent: two, name: 'apply_patch', arguments: { input: '*** Begin Patch\n*** Update File: shared.js\n*** End Patch' }, callId: 'c3', signal: new AbortController().signal });
    assert.equal(patch.kind, 'deny');
    // A command of item 2 that changed it: put back, and the helper is told.
    const command = await app.chain('tools/pre-execute', { agent: two, name: 'bash', arguments: { command: 'sed -i "" s/1/2/ shared.js' }, callId: 'c4', signal: new AbortController().signal });
    assert.equal(command.kind, 'allow');
    writeFileSync(join(root, 'shared.js'), 'changed by item 2\n');
    writeFileSync(join(root, 'own.js'), 'item 2 made this\n');
    const after = await app.chain('tools/post-execute', { agent: two, name: 'bash', callId: 'c4' }, { content: [{ type: 'text', text: 'ok' }] });
    assert.equal(readFileSync(join(root, 'shared.js'), 'utf8'), 'by item 1\n', 'put back');
    assert.match(JSON.stringify(after), /This command changed files another helper's item is working on: shared\.js\. They were put back\./);
    // Item 2 stops: it waits for the file, with no try used, and goes on when item 1 is done.
    await app.release('Mission: item 2', 'WAITING FOR FILE: shared.js');
    const run = app.runner().view('c');
    const item = run.items.find((entry) => entry.id === '2');
    assert.deepEqual([item.status, item.waitFile], ['open', 'shared.js']);
    assert.deepEqual(run.waitingFile.map((entry) => [entry.item, entry.file, entry.heldBy]), [['2', 'shared.js', '1']]);
    assert.equal(app.holds.has('Mission: item 2'), false, 'not started again while item 1 holds the file');
    await app.release('Mission: item 1');
    for (let i = 0; i < 40 && !app.holds.has('Mission: item 2'); i += 1) await tick(5);
    assert.ok(app.holds.has('Mission: item 2'), 'the file is free: item 2 goes on');
  } finally {
    app.done();
  }
});

test('Tool access parks a Mission helper\'s request; Allow for this item gives it to that item only; a helper may not widen its sandbox; nothing is asked after the end', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    const chat = await started(app, 'auto');
    const service = app.provided.mission;
    const one = app.helperOf('Mission: item 1');
    assert.equal(service.canPark(one), true);
    assert.equal(service.canPark('c'), false, 'the thread itself is not a helper');
    assert.equal(service.parkApproval({ sessionId: 'c', kind: 'tool', tool: 'web_fetch' }), undefined, 'not a helper: the old flow applies');
    const parked = service.parkApproval({ sessionId: one, kind: 'tool', tool: 'web_fetch', plain: 'Fetch a web page', reason: 'Need the docs' });
    assert.match(parked.text, /waits in the Mission's card/);
    const entry = app.runner().view('c').approvals.find((each) => each.id === parked.id);
    assert.deepEqual([entry.kind, entry.what, entry.reason, entry.choices.map((choice) => choice.id)], ['tool', 'Use Fetch a web page', 'Need the docs', ['item', 'mission', 'deny']]);
    app.setToolAccess(false);
    assert.equal((await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: parked.id, choice: 'item' }] })).json.error, 'Tool access is switched off, so this tool cannot be allowed here. Switch it on in Settings → Modes → Tool access.');
    app.setToolAccess(true);
    const ok = await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: parked.id, choice: 'item' }] });
    assert.equal(ok.json.said, 'Allowed for item 1: Fetch a web page. It goes on when a helper is free.');
    assert.deepEqual(app.granted, ['web_fetch']);
    const other = await app.chain('tools/pre-execute', { agent: app.agentOf('Mission: item 3'), name: 'web_fetch', arguments: {}, callId: 't1', signal: new AbortController().signal });
    assert.deepEqual([other.kind, other.reason], ['deny', 'web_fetch was allowed for item 1 only. Carry on without it.']);
    assert.deepEqual(app.ledger.at(-1), ['refused', 'mission-item-tool']);
    const wide = await app.chain('tools/pre-execute', { agent: app.agentOf('Mission: item 3'), name: 'bash', arguments: { command: 'touch /etc/x', sandbox_permissions: 'danger-full-access' }, callId: 't2', signal: new AbortController().signal });
    assert.match(wide.reason, /^A Mission's helpers cannot change anything outside the thread's folder/);
    assert.ok(app.runner().view('c').approvals.some((each) => each.kind === 'outside-change' && each.status === 'cannot'));
    // Denied: the deny cooldown in Tool access; asking again is refused.
    const two = app.helperOf('Mission: item 2');
    const search = service.parkApproval({ sessionId: two, kind: 'tool', tool: 'search', plain: 'Search' });
    await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: search.id, choice: 'deny' }] });
    assert.deepEqual(app.denied, ['search']);
    assert.equal(service.parkApproval({ sessionId: two, kind: 'tool', tool: 'search', plain: 'Search' }).said, 'no');
    // After the end: approve is refused; the helper is told nothing is asked any more; the item's permission is taken back.
    await app.commands.mission.handler({ agent: chat, rawInput: 'end' });
    assert.equal((await app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: parked.id, choice: 'deny' }] })).json.error, 'This Mission has ended. Choose in the card and press Answer and continue.');
    assert.ok(app.revoked.includes('g-web_fetch'));
    assert.equal(service.canPark(app.helperOf('Mission: item 3')), false, 'nothing is parked for a Mission that has ended');
  } finally {
    app.done();
  }
});

test('an approval still open at the end is in the report and the card; Answer and continue takes its item up again', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    const chat = await started(app);
    const root = chat.header.cwd;
    await app.chain('tools/pre-execute', { agent: app.agentOf('Mission: item 1'), name: 'write', arguments: { file_path: join(root, 'existing.txt') }, callId: 'w1', signal: new AbortController().signal });
    await app.release('Mission: item 1', 'NEEDS YES: changing existing.txt');
    const ended = await app.commands.mission.handler({ agent: chat, rawInput: 'end' });
    assert.match(ended.text, /Waiting for your yes:\n- Change existing\.txt \(item 1: one\)\./);
    assert.match(ended.text, /1\. \[WAITS FOR YOU\] one/);
    const view = app.runner().view('c');
    assert.equal(view.canContinue, true, 'End is not final while an approval waits');
    const quote = await app.card({ sessionId: 'c', action: 'continue', answers: [], approvals: [{ id: 'a1', choice: 'allow' }] });
    assert.equal(quote.status, 200, JSON.stringify(quote.json));
    assert.equal(quote.json.quote.run, true);
    const go = await app.card({ sessionId: 'c', action: 'continue', answers: [], approvals: [{ id: 'a1', choice: 'allow' }], minutes: 30 });
    assert.equal(go.status, 200, JSON.stringify(go.json));
    assert.match(go.json.said, /1 item that waited for you goes on from where it stopped\./);
    const after = app.runner().view('c');
    assert.equal(after.items[0].status, 'open');
    assert.equal(after.approvals[0].status, 'allowed');
  } finally {
    app.done();
  }
});

test('/mission back while a Mission runs: it is paused first, its helpers stop, then the folder goes back; Resume carries on from there', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    const chat = await started(app, 'auto');
    const back = await app.commands.mission.handler({ agent: chat, rawInput: 'back 1' });
    assert.equal(back.kind, 'success', back.text);
    assert.match(back.text, /^The Mission was paused first, so no helper was changing files\.\nWent back to checkpoint 1\./);
    assert.match(back.text, /Press Resume to carry on from the folder as it is now\.$/);
    assert.equal(app.runner().view('c').status, 'running', 'paused, not ended');
    assert.equal(app.runner().view('c').pausedBy, 'you');
  } finally {
    app.done();
  }
});

test('the turn\'s own checkpoint is skipped while several helpers work (their item and command checkpoints hold the folder)', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    const chat = await started(app, 'auto');
    writeFileSync(join(chat.header.cwd, 'new.txt'), 'changed\n');
    const before = (await app.commands.mission.handler({ agent: chat, rawInput: 'checkpoints' })).text;
    for (const handler of app.handlers('session/event')) handler({ id: 'c', header: chat.header }, { type: 'turn/start', data: { turn: 9 } });
    await tick(300);
    const after = (await app.commands.mission.handler({ agent: chat, rawInput: 'checkpoints' })).text;
    assert.doesNotMatch(after, /Start of turn 9/);
    assert.equal(after.split('\n')[0], before.split('\n')[0], 'no new checkpoint');
  } finally {
    app.done();
  }
});

// ---- review of stage D: the fixes ----

test('several helpers: a command that may change files is refused in the background (run it in the foreground); a read-only one is not', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    await started(app, 'auto');
    const one = app.agentOf('Mission: item 1');
    const bg = await app.chain('tools/pre-execute', { agent: one, name: 'bash', arguments: { command: 'npx prettier --write .', run_in_background: true }, callId: 'b1', signal: new AbortController().signal });
    assert.deepEqual([bg.kind, bg.reason], ['deny', 'Several helpers work at once, so a command that may change files must run in the foreground (without run_in_background): its changes are checked when it ends. Run it again in the foreground.']);
    assert.deepEqual(app.ledger.at(-1), ['refused', 'mission-background']);
    const reads = await app.chain('tools/pre-execute', { agent: one, name: 'bash', arguments: { command: 'ls -la', run_in_background: true }, callId: 'b2', signal: new AbortController().signal });
    assert.equal(reads.kind, 'allow');
  } finally {
    app.done();
  }
});

test('several helpers: a command that went on as a background job keeps the folder lock until the job ends, and its changes are checked then', { skip: !hasGit }, async () => {
  let finish;
  const ended = new Promise((resolve) => { finish = resolve; });
  const looked = [];
  const jobs = { wait: async (id, ms, owner) => { looked.push([id, owner]); return Promise.race([ended, new Promise((resolve) => setTimeout(() => resolve({ status: 'running' }), 20))]); } };
  const app = running({ config: { longHelpers: 3 }, jobs });
  try {
    const chat = await started(app, 'auto');
    const root = chat.header.cwd;
    const one = app.agentOf('Mission: item 1');
    const two = app.agentOf('Mission: item 2');
    // Item 2 holds b.txt.
    assert.equal((await app.chain('tools/pre-execute', { agent: two, name: 'write', arguments: { file_path: join(root, 'b.txt'), content: 'x' }, callId: 'w1', signal: new AbortController().signal })).kind, 'allow');
    writeFileSync(join(root, 'b.txt'), 'by item 2\n');
    await app.chain('tools/post-execute', { agent: two, name: 'write', callId: 'w1' }, {});
    await app.chain('tools/result', { agent: two, name: 'write', callId: 'w1' }, {});
    // Item 1's build runs past its wait: the app moves it to a background job.
    assert.equal((await app.chain('tools/pre-execute', { agent: one, name: 'bash', arguments: { command: 'make build' }, callId: 'c1', signal: new AbortController().signal })).kind, 'allow');
    const promoted = { content: [{ type: 'text', text: '[still running after 120000ms; moved to background job J1]' }], value: { kind: 'promoted', jobId: 'J1' } };
    const after = await app.chain('tools/post-execute', { agent: one, name: 'bash', callId: 'c1' }, promoted);
    await app.chain('tools/result', { agent: one, name: 'bash', callId: 'c1' }, promoted);
    assert.match(JSON.stringify(after), /this command still runs in the background\. No other helper changes files until it ends/);
    // Meanwhile another helper's write waits for the lock.
    let done = false;
    const write = app.chain('tools/pre-execute', { agent: two, name: 'write', arguments: { file_path: join(root, 'b.txt'), content: 'y' }, callId: 'w2', signal: new AbortController().signal }).then((out) => { done = true; return out; });
    await tick(80);
    assert.equal(done, false, 'no other helper changes files while the job runs');
    assert.deepEqual(looked[0], ['J1', one.id], 'the job is looked at as its own helper');
    // The job writes item 2's file, then ends: the change is put back.
    writeFileSync(join(root, 'b.txt'), 'by the job\n');
    finish({ status: 'exited' });
    assert.equal((await write).kind, 'allow');
    assert.equal(readFileSync(join(root, 'b.txt'), 'utf8'), 'by item 2\n', 'put back after the job ended');
  } finally {
    app.done();
  }
});

test('several helpers: a background job keeps the folder lock after its helper stopped, and what it changed then is not claimed for a helper that is gone', { skip: !hasGit }, async () => {
  let finish;
  const ended = new Promise((resolve) => { finish = resolve; });
  const jobs = { wait: async () => Promise.race([ended, new Promise((resolve) => setTimeout(() => resolve({ status: 'running' }), 20))]) };
  const app = running({ config: { longHelpers: 3 }, jobs });
  try {
    const chat = await started(app, 'auto');
    const root = chat.header.cwd;
    const one = app.agentOf('Mission: item 1');
    const two = app.agentOf('Mission: item 2');
    const three = app.agentOf('Mission: item 3');
    assert.equal((await app.chain('tools/pre-execute', { agent: one, name: 'bash', arguments: { command: 'make build' }, callId: 'c1', signal: new AbortController().signal })).kind, 'allow');
    const promoted = { content: [{ type: 'text', text: '[still running after 120000ms; moved to background job J1]' }], value: { kind: 'promoted', jobId: 'J1' } };
    await app.chain('tools/post-execute', { agent: one, name: 'bash', callId: 'c1' }, promoted);
    await app.chain('tools/result', { agent: one, name: 'bash', callId: 'c1' }, promoted);
    // Item 1's helper stops while its job still runs: the lock stays with the job.
    await app.release('Mission: item 1');
    await tick(100);
    let done = false;
    const write = app.chain('tools/pre-execute', { agent: two, name: 'write', arguments: { file_path: join(root, 'b.txt'), content: 'y' }, callId: 'w2', signal: new AbortController().signal }).then((out) => { done = true; return out; });
    await tick(100);
    assert.equal(done, false, 'no other helper changes files while the job runs, also after its helper stopped');
    // The job makes c.txt, then ends: item 1 is done, so c.txt is nobody's.
    writeFileSync(join(root, 'c.txt'), 'by the job\n');
    finish({ status: 'exited' });
    assert.equal((await write).kind, 'allow');
    await tick(100);
    const later = await app.chain('tools/pre-execute', { agent: three, name: 'write', arguments: { file_path: join(root, 'c.txt'), content: 'z' }, callId: 'w3', signal: new AbortController().signal });
    assert.equal(later.kind, 'allow', later.reason);
  } finally {
    finish({ status: 'exited' });
    app.done();
  }
});

test('several helpers: what a background job changed after its item parked is held for that item', { skip: !hasGit }, async () => {
  let finish;
  const ended = new Promise((resolve) => { finish = resolve; });
  const jobs = { wait: async () => Promise.race([ended, new Promise((resolve) => setTimeout(() => resolve({ status: 'running' }), 20))]) };
  const app = running({ config: { longHelpers: 3 }, jobs });
  try {
    const chat = await started(app, 'auto');
    const root = chat.header.cwd;
    const one = app.agentOf('Mission: item 1');
    assert.equal((await app.chain('tools/pre-execute', { agent: one, name: 'bash', arguments: { command: 'make build' }, callId: 'c1', signal: new AbortController().signal })).kind, 'allow');
    const promoted = { content: [{ type: 'text', text: '[moved to background job J1]' }], value: { kind: 'promoted', jobId: 'J1' } };
    await app.chain('tools/post-execute', { agent: one, name: 'bash', callId: 'c1' }, promoted);
    await app.chain('tools/result', { agent: one, name: 'bash', callId: 'c1' }, promoted);
    app.provided.mission.parkApproval({ sessionId: app.helperOf('Mission: item 1'), kind: 'tool', tool: 'web_fetch', plain: 'Fetch' });
    await app.release('Mission: item 1', 'NEEDS YES: fetching a page');
    assert.equal(app.runner().view('c').items[0].status, 'parked');
    writeFileSync(join(root, 'c.txt'), 'by the job\n');
    finish({ status: 'exited' });
    await tick(150);
    const refused = await app.chain('tools/pre-execute', { agent: app.agentOf('Mission: item 3'), name: 'write', arguments: { file_path: join(root, 'c.txt'), content: 'z' }, callId: 'w3', signal: new AbortController().signal });
    assert.equal(refused.kind, 'deny');
    assert.match(refused.reason, /item 1/);
    const runs = join(root, '.dsh-mission', 'runs');
    const saved = JSON.parse(readFileSync(join(runs, readdirSync(runs)[0], 'run.json'), 'utf8'));
    assert.deepEqual(saved.items[0].claims, ['c.txt'], 'written down for a restart');
  } finally {
    finish({ status: 'exited' });
    app.done();
  }
});

test('a permission answered twice from two panes at once: one is kept, the other is taken back', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    await started(app, 'auto');
    // Two panes press Allow for this Mission at the same moment: one permission is kept, the other is taken back.
    const service = app.provided.mission;
    const parked = service.parkApproval({ sessionId: app.helperOf('Mission: item 1'), kind: 'tool', tool: 'web_fetch', plain: 'Fetch' });
    const [first, second] = await Promise.all([
      app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: parked.id, choice: 'mission' }] }),
      app.card({ sessionId: 'c', action: 'approve', approvals: [{ id: parked.id, choice: 'mission' }] }),
    ]);
    assert.deepEqual([first.json.said, second.json.said].sort().map((said) => said.split(':')[0]), ['Allowed for this Mission', 'Already answered.'].sort().map((said) => said.split(':')[0]));
    assert.deepEqual(app.granted.filter((tool) => tool === 'web_fetch').length, 2);
    await tick(5);
    assert.equal(app.revoked.length, 1, 'the one not kept is taken back');
    assert.ok(['g-web_fetch', 'g-web_fetch#2'].includes(app.revoked[0]));
  } finally {
    app.done();
  }
});

test('a Tool access request parked by a helper keeps Tool access\'s risk word and its Recon and outside-material warnings', { skip: !hasGit }, async () => {
  const app = running({ config: { longHelpers: 3 } });
  try {
    await started(app, 'auto');
    const service = app.provided.mission;
    const wording = { headline: 'h', risk: 'Highest', reconWarning: 'This is Recon, which is sealed on purpose. Only allow this if you asked for it yourself.', outsideWarning: 'Earlier in this conversation it read a web page.' };
    const parked = service.parkApproval({ sessionId: app.helperOf('Mission: item 1'), kind: 'tool', tool: 'web_fetch', plain: 'Fetch', wording });
    const entry = app.runner().view('c').approvals.find((each) => each.id === parked.id);
    assert.deepEqual(entry.warnings, { risk: 'Highest', recon: wording.reconWarning, outside: wording.outsideWarning });
  } finally {
    app.done();
  }
});
