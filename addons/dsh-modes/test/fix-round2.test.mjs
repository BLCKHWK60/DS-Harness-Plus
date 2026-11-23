// Item 4A, fix round 2 (22 November 2026): Recon's room picked from Chat or Code tells the chat box to follow the thread
// to Recon (review: medium); /mode on a draft leaves a reply the chat box shows (review: low); the owner's upgrade from
// the stage 0+1 tree never turns a blank Workshop draft with a scheduled first message into Cowork in Chat (the lab
// thread session-42ebe888 that the pre-fix code damaged).
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DSH_MODES_PRESET_SETTLE_MS = '0';
const { boot, makeWorld, settle } = await import('./app.mjs');

const ROOM = '/tmp/dsh-recon-test-room-2';
const EXTRA = {
  research: { label: 'Research', tools: 'all', sandbox: 'inherit', prompt: 'Research.' },
  recon: { label: 'Recon', tools: ['recon_cite'], sandbox: 'read-only', isolated: true, prompt: 'Recon.' },
  'creator-plus': { label: 'Creator Plus', tools: ['creator_map'], sandbox: 'workspace-write', prompt: 'Creator Plus.' },
};
const recon = { isRoom: (path) => path === ROOM || String(path).startsWith(`${ROOM}/`) };
const json = (value) => JSON.parse((typeof value === 'string' ? value : value?.get?.()) || '{}');
const read = (value) => (typeof value?.get === 'function' ? value.get() : value);

function app(fields = {}, options = {}) {
  const world = makeWorld({ extraModes: JSON.stringify(EXTRA), ...fields });
  return { world, run: boot(world, { tabs: true, known: ['read', 'recon_cite', 'creator_map'], services: { recon }, ...options }) };
}

test('a folder picked from Chat or Code that is Recon\'s room: the answer says so, so the chat box follows it to Recon', async () => {
  const { run } = app();
  for (const space of ['chat', 'code']) {
    const id = `room-${space}`;
    await run.open(id, { header: { cwd: ROOM } });
    const started = await run.service().spaces.startDraft(id, { space });
    assert.deepEqual(started, { claimed: true, mode: 'recon', space: 'recon' });
    const view = run.service().spaces.view(id);
    assert.equal(view.room, true);
    assert.equal(view.space, 'recon');
  }
  await run.open('plain-1', { header: { cwd: '/Users/me/src/app' } });
  assert.equal(run.service().spaces.view('plain-1').room, false);
});

test('the chat box: Recon\'s room switches the window to Recon with one line and an (i); /mode replies show once (page file)', async () => {
  const { readFileSync } = await import('node:fs');
  const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  assert.match(client, /if \(value\.room && space && space !== 'recon' && !shownNotes\.current\.has\(`room \$\{sessionId\}`\)\)/);
  assert.match(client, /new CustomEvent\('dsh-cowork-shell:show-space', \{ cancelable: true, detail: \{ space: 'recon' \} \}\)/);
  assert.match(client, /room \? h\(tgUi\(\)\.Info, \{ title: t\('mflash\.room\.title'\)/);
  for (const key of ['mflash.room', 'mflash.room.title', 'mflash.room.what', 'mflash.room.when', 'mflash.room.change', 'mflash.close', 'fence.group', 'fence.title', 'fence.hint', 'fence.what', 'fence.when', 'fence.change', 'fence.off', 'fence.ask.title', 'fence.ask.text', 'fence.ask.ok']) {
    assert.equal(client.split(`'${key}':`).length - 1, 1, `${key}: once, English only`);
  }
  assert.match(client, /'mflash\.room': 'This folder is Recon\\'s room, so this thread is a Recon thread\.'/);
});

test('/mode on a draft: the reply is kept for the chat box (the app shows none there); after the first message: none', async () => {
  const { run } = app();
  const { agent } = await run.open('d1', { header: { cwd: '/Users/me/Documents/deepseek-harness/default-workspace' } });
  await run.service().spaces.startDraft('d1', { space: 'chat' });
  await run.command(agent, 'research');
  await settle();
  let reply = run.service().spaces.view('d1').reply;
  assert.equal(reply.kind, 'success');
  assert.equal(reply.text, 'Mode changed to Research. It applies from your first message.');
  const first = reply.id;
  await run.command(agent, 'recon');
  reply = run.service().spaces.view('d1').reply;
  assert.equal(reply.kind, 'error');
  assert.notEqual(reply.id, first);
  assert.match(reply.text, /Recon/);
  await run.command(agent, '');
  assert.match(run.service().spaces.view('d1').reply.text, /^Mode: Research\. To change it, type \/mode and a mode, or pick one in the Mode list under the chat box\.$/);
  await run.firstTurn(agent);
  await settle();
  assert.equal(run.service().spaces.view('d1').reply, null, 'a started thread shows the app\'s own command output');
  await run.command(agent, 'plain');
  assert.equal(run.service().spaces.view('d1').reply, null);
});

/**
 * The stage 0+1 tree as the owner's app has it before stages 2 to 5 are installed: every thread filled once
 * (`spacesFilled`), the switch-over fill not yet done (`spacesRefreshed` false), `defaultMode` and `scheduledMode` on
 * Cowork. A blank draft Creator Plus claimed for a saved run (its mode stored, in the Scratch place as in the lab), which
 * an Automation's first message reaches after the update and a restart (the claim in memory is gone).
 */
for (const recorded of [true, false]) {
  test(`upgrade from stage 0+1: a blank Workshop draft hit by a scheduled first message stays Creator Plus in Workshop (space ${recorded ? 'recorded' : 'not recorded'})`, async () => {
    const fields = {
      defaultMode: 'cowork',
      scheduledMode: 'cowork',
      spacesFilled: true,
      spacesRefreshed: false,
      sessionModes: JSON.stringify({ 'session-42ebe888': 'creator-plus', older: 'research' }),
      ...(recorded ? { sessionSpaces: JSON.stringify({ 'session-42ebe888': 'workshop', older: 'chat' }) } : {}),
    };
    const { world, run } = app(fields, { scratch: new Set(['session-42ebe888']) });
    const { agent } = await run.open('session-42ebe888', { source: 'resume', header: { cwd: '/Users/me/.dsh/scratch' } });
    await settle();
    // The window shows Chat (where the owner was); the chat box claims nothing: the draft is not its own. Stage 6a: it is
    // kept in Workshop (the window opens a fresh draft).
    assert.deepEqual(await run.service().spaces.startDraft('session-42ebe888', { space: 'chat' }), { claimed: false, keptIn: 'workshop' });
    // The scheduler opens the thread and splices in the task's message.
    await run.waterfall('schedule/resolve-agent', 'session-42ebe888', () => agent);
    await run.emit('session/event', { id: 'session-42ebe888' }, { type: 'agent/inbox/spliced', data: { inserted: [{ source: { kind: 'schedule' }, content: [{ type: 'text', text: 'Creator Plus saved run' }] }] } });
    await settle();
    assert.equal(run.service().get('session-42ebe888'), 'creator-plus');
    await run.firstTurn(agent);
    await settle();
    assert.equal(json(world.config.sessionModes)['session-42ebe888'], 'creator-plus', 'never Cowork');
    assert.equal(json(world.config.sessionSpaces)['session-42ebe888'], 'workshop', 'never Chat');
    assert.equal(read(world.config.spacesRefreshed), true, 'the switch-over fill ran');
  });
}
