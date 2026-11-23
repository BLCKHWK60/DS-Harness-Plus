/**
 * Tool access for a Mission's helpers (Mission stage D, 20 November 2026): a helper's request is parked in the
 * Mission's card (mission.canPark / mission.parkApproval) instead of a card that waits and times out; the other
 * helpers carry on. The answer comes back through grantParked / denyParked. Runs the add-on whole on the stand-in app.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { boot, makeWorld } from './app.mjs';
import { ONCE_ONLY, PARK_CHOICES } from '../lib/toolaccess.js';

const KNOWN = ['read', 'write', 'bash', 'web_fetch', 'web_search', 'grep', 'tools_catalog', 'request_tool_access', 'brand_new_tool', 'git_push', 'edit', 'apply_patch'];
const MODES = { safe: { label: 'Safe', tools: ['read', 'grep'] } };
const SESSIONS = { s1: 'safe', s2: 'safe' };

/** A stand-in Mission: h1 is a helper of a running Mission in s1; every parked request is kept. */
function fakeMission({ said, unasked } = {}) {
  const parked = [];
  return {
    parked,
    service: {
      longRun: () => ({ files: false, web: false }),
      canPark: (id) => id === 'h1',
      parkApproval: (request) => {
        if (request.sessionId !== 'h1') return undefined;
        parked.push(request);
        if (request.cannot) return { cannot: true, id: `a${parked.length}`, text: 'listed' };
        if (said) return { id: 'a1', said: 'no', text: 'The user said no to this earlier in this Mission.' };
        if (unasked) return { id: `a${parked.length}`, said: 'no', unasked: true, text: 'This needs the user\'s yes, and this Mission runs on Full auto: it never asks and never gives itself permission, so this step was not taken.' };
        return { id: `a${parked.length}`, text: 'This needs the user\'s yes, so it waits in the Mission\'s card.' };
      },
    },
  };
}

async function start({ mission, extra = {}, settingsExtra = [] } = {}) {
  const world = makeWorld({ pruneStaleSessions: false, toolAccessOn: true, extraModes: JSON.stringify(MODES), sessionModes: JSON.stringify(SESSIONS), ...extra });
  const home = mkdtempSync(path.join(tmpdir(), 'dsh-ta-park-'));
  const app = boot(world, { known: KNOWN, home, mission, settingsExtra });
  const s1 = await app.open('s1');
  await app.firstTurn(s1.agent);
  const h1 = await app.open('h1', { header: { parentSession: 's1' } });
  await app.firstTurn(h1.agent);
  return { app, world, s1, h1, access: () => app.provided('toolAccess') };
}
const cards = (access) => {
  const shown = [];
  access().registerCard(async (req) => {
    shown.push(req);
    return { choice: 'deny' };
  });
  return shown;
};

test('a Mission helper\'s request is parked in the Mission\'s card: no card, never refused as unattended, the ledger says parked', async () => {
  const mission = fakeMission();
  // waitMinutes 0 meant "nobody there" before stage D; a Mission's helper is never refused as unattended now.
  const { app, h1, access } = await start({ mission: mission.service, settingsExtra: [{ ns: 'mission', value: { waitMinutes: 0 } }] });
  try {
    const shown = cards(access);
    const notes = [];
    const exec = { agent: { ...h1.agent, ctx: { get: (name) => (name === 'toolLedger' ? { note: (entry) => notes.push(entry) } : undefined) } } };
    const out = await app.tool('request_tool_access').definition.execute({ tool: 'write', reason: 'the item needs a new file' }, exec);
    assert.equal(shown.length, 0, 'no card while the Mission runs: the request waits in its card');
    assert.equal(mission.parked.length, 1);
    assert.equal(mission.parked[0].tool, 'write');
    assert.equal(mission.parked[0].kind, 'tool');
    assert.equal(mission.parked[0].reason, 'the item needs a new file');
    assert.deepEqual(mission.parked[0].choices.map((one) => one.id), ['item', 'mission', 'deny']);
    assert.deepEqual(PARK_CHOICES.map((one) => one.label), ['Allow for this item', 'Allow for this Mission', 'Deny']);
    assert.match(JSON.stringify(out), /waits in the Mission's card/);
    assert.equal(notes[0].outcome, 'parked', 'the Tool ledger records it as parked');
    assert.equal(notes[0].rule, 'parked');
    const direct = await access().ask({ sessionId: 'h1', requester: 'h1', tool: 'bash', reason: 'x' });
    assert.equal(direct.code, 'parked');
    assert.equal(direct.ok, false);
    // Listed once per tool under "Waiting for you".
    await access().ask({ sessionId: 'h1', requester: 'h1', tool: 'bash', reason: 'again' });
    assert.equal(access().waiting().filter((event) => event.tool === 'bash').length, 1);
  } finally {
    app.stop();
  }
});

test('a helper told no before in this Mission gets the no at once, with no new card', async () => {
  const mission = fakeMission({ said: true });
  const { app, access } = await start({ mission: mission.service });
  try {
    const shown = cards(access);
    const result = await access().ask({ sessionId: 'h1', requester: 'h1', tool: 'write', reason: 'x' });
    assert.equal(result.code, 'denied');
    assert.match(result.text, /said no/);
    assert.equal(shown.length, 0);
  } finally {
    app.stop();
  }
});

test('a Full auto Mission never asks: its answer is not-asked (not denied), with Mission\'s text; the ledger says so, and Allow later still works', async () => {
  const mission = fakeMission({ unasked: true });
  const { app, h1, access } = await start({ mission: mission.service });
  try {
    const shown = cards(access);
    const notes = [];
    const exec = { agent: { ...h1.agent, ctx: { get: (name) => (name === 'toolLedger' ? { note: (entry) => notes.push(entry) } : undefined) } } };
    const out = await app.tool('request_tool_access').definition.execute({ tool: 'write', reason: 'the item needs a new file' }, exec);
    assert.match(JSON.stringify(out), /Full auto/);
    assert.equal(notes[0].rule, 'not-asked', 'the Tool ledger does not say "you said no"');
    const result = await access().ask({ sessionId: 'h1', requester: 'h1', tool: 'bash', reason: 'x' });
    assert.equal(result.code, 'not-asked');
    assert.equal(result.ok, false);
    assert.match(result.text, /never asks and never gives itself permission/);
    assert.equal(shown.length, 0, 'no card: Full auto shows nothing during the run');
    assert.equal(mission.parked.length, 2, 'Mission still hears of each request, to list it');
    // Not counted as a no: the conversation's own request is not refused as denied-recently.
    const own = await access().ask({ sessionId: 's1', requester: 's1', tool: 'bash', reason: 'x' });
    assert.notEqual(own.code, 'denied-recently');
    // Finish it can allow it later.
    const granted = await access().grantParked({ sessionId: 's1', tool: 'write' });
    assert.equal(granted.ok, true);
  } finally {
    app.stop();
  }
});

test('a tool the policy allows only one call at a time (after outside material) cannot be parked: once-only, listed as cannot', async () => {
  const mission = fakeMission();
  const { app, access } = await start({ mission: mission.service });
  try {
    const shown = cards(access);
    const result = await access().ask({ sessionId: 'h1', requester: 'h1', tool: 'brand_new_tool', reason: 'x', outsideMaterial: 'web' });
    assert.equal(result.code, 'once-only');
    assert.equal(result.text, ONCE_ONLY);
    assert.equal(shown.length, 0);
    assert.equal(mission.parked.length, 1);
    assert.equal(mission.parked[0].cannot, true);
  } finally {
    app.stop();
  }
});

test('the conversation itself, and a helper that is not a Mission\'s, still get the card; Off and blocked stay refused', async () => {
  const mission = fakeMission();
  const { app, access } = await start({ mission: mission.service });
  try {
    const shown = cards(access);
    const own = await access().ask({ sessionId: 's1', requester: 's1', tool: 'write', reason: 'x' });
    assert.equal(own.code, 'denied');
    assert.equal(shown.length, 1, 'the conversation\'s own request shows the card');
    const h2 = await app.open('h2', { header: { parentSession: 's1' } });
    await app.firstTurn(h2.agent);
    const other = await access().ask({ sessionId: 'h2', requester: 'h2', tool: 'bash', reason: 'x' });
    assert.equal(other.code, 'denied');
    assert.equal(shown.length, 2, 'a helper outside the Mission shows the card as before');
    assert.equal(mission.parked.length, 0);
  } finally {
    app.stop();
  }
  // Tool access off: refused before anything is parked.
  const off = await start({ mission: fakeMission().service, extra: { toolAccessOn: false } });
  try {
    const result = await off.access().ask({ sessionId: 'h1', requester: 'h1', tool: 'write', reason: 'x' });
    assert.equal(result.code, 'off');
  } finally {
    off.app.stop();
  }
});

test('grantParked stores a conversation permission with an id, and refuses what the policy no longer offers; denyParked starts the refusal time', async () => {
  const mission = fakeMission();
  const { app, access } = await start({ mission: mission.service });
  try {
    const granted = await access().grantParked({ sessionId: 's1', tool: 'write' });
    assert.equal(granted.ok, true);
    const stored = access().grants().grants.find((grant) => grant.id === granted.id);
    assert.ok(stored, 'the permission is stored with its id (Mission takes it back with revoke)');
    assert.equal(stored.scope, 'conversation');
    assert.equal(stored.sessionId, 's1');
    assert.equal(await access().revoke(granted.id), true);
    const never = await access().grantParked({ sessionId: 's1', tool: 'git_push' });
    assert.equal(never.ok, false, 'a tool only the user can switch on is never granted this way');
    assert.match(never.text, /Settings/);
    const already = await access().grantParked({ sessionId: 's1', tool: 'read' });
    assert.equal(already.ok, false, 'a tool already available needs no permission');
    access().denyParked({ sessionId: 's1', tool: 'bash' });
    const own = await access().ask({ sessionId: 's1', requester: 's1', tool: 'bash', reason: 'x' });
    assert.equal(own.code, 'denied-recently', 'a Deny in the Mission\'s card counts like a Deny in the card');
  } finally {
    app.stop();
  }
});

test('parked requests answered in the Mission\'s card leave "Waiting for you", and a sixth tool still parks', async () => {
  const mission = fakeMission();
  const { app, access } = await start({ mission: mission.service });
  try {
    const tools = ['write', 'bash', 'web_fetch', 'web_search', 'brand_new_tool'];
    for (const tool of tools) assert.equal((await access().ask({ sessionId: 'h1', requester: 'h1', tool, reason: 'x' })).code, 'parked', tool);
    assert.equal(access().waiting().filter((event) => event.sessionId === 's1').length, 5);
    // The owner answers all five in the Mission's card.
    for (const tool of tools.slice(0, 3)) await access().grantParked({ sessionId: 's1', tool });
    for (const tool of tools.slice(3)) access().denyParked({ sessionId: 's1', tool });
    assert.equal(access().waiting().filter((event) => event.sessionId === 's1').length, 0, 'answered: no longer waiting');
    const sixth = await access().ask({ sessionId: 'h1', requester: 'h1', tool: 'edit', reason: 'x' });
    assert.equal(sixth.code, 'parked', 'never "too many" for a Mission\'s helper');
    assert.equal(mission.parked.length, 6);
  } finally {
    app.stop();
  }
});

test('Denies in the Mission\'s card are not counted against the conversation: after three, another tool still parks', async () => {
  const mission = fakeMission();
  const { app, access } = await start({ mission: mission.service });
  try {
    for (const tool of ['write', 'bash', 'web_fetch']) {
      assert.equal((await access().ask({ sessionId: 'h1', requester: 'h1', tool, reason: 'x' })).code, 'parked');
      access().denyParked({ sessionId: 's1', tool });
    }
    const fourth = await access().ask({ sessionId: 'h1', requester: 'h1', tool: 'web_search', reason: 'x' });
    assert.equal(fourth.code, 'parked', 'not too-many-noes');
    assert.equal(mission.parked.length, 4);
    // The denied tool itself keeps its refusal time.
    assert.notEqual((await access().ask({ sessionId: 'h1', requester: 'h1', tool: 'write', reason: 'x' })).code, 'parked');
    // Tool access's own words (risk, Recon and outside-material warnings) go with the parked request.
    assert.ok(mission.parked[0].wording?.risk, 'the risk word is passed to Mission\'s card');
  } finally {
    app.stop();
  }
});

test('the Mission clause of "unattended" is gone: an Automation stays unattended, a Mission with waitMinutes 0 is not', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../index.js', import.meta.url), 'utf8');
  assert.match(src, /unattended: \(top\) => scheduled\.has\(top\) \|\| scheduledRun\.has\(top\) \|\| lastMessageFromScheduler\(top\),/);
  assert.match(src, /access\?\.service\?\.useParking\?\.\(\{\s*parkable: \(requester\) => \{/);
  assert.match(src, /park: \(request\) => ctx\.get\('mission'\)\?\.parkApproval\?\.\(request\),/);
});
