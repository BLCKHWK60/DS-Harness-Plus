/**
 * Stage E, point 12: Missions everywhere, always inside each tab's own rules. A typed /mission with a goal works where
 * Start Mission does (Data and Research: point 14's refusal lifted; Recon where Recon allows it; Creator Plus); the
 * /mission modes alone stay refused there. Each test fails on the code before stage E.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { GIT_CANDIDATES } from '../lib/checkpoints.js';
import { HELP } from '../index.js';
import { ISOLATED_TEXT, READ_ONLY_TEXT, READ_ONLY_TYPED_TEXT, helpersOffText, whyNot } from '../lib/gate.js';
import { appHarness } from './app-harness.mjs';

const hasGit = GIT_CANDIDATES.some((path) => existsSync(path));

test('the gate: a typed goal is a Mission in Data, Research and Recon (where Recon allows it); the mode words are not', () => {
  for (const tab of ['data', 'research']) {
    assert.equal(whyNot({ isolated: false, tab, word: 'make', goal: true }), '', tab);
    assert.equal(whyNot({ isolated: false, tab, word: 'auto' }), READ_ONLY_TEXT, tab);
  }
  assert.equal(whyNot({ isolated: true, runs: true, word: 'find', goal: true }), '');
  assert.equal(whyNot({ isolated: true, runs: false, word: 'find', goal: true }), ISOLATED_TEXT, 'not where Recon does not allow it');
  assert.equal(whyNot({ isolated: true, runs: true, word: 'restricted' }), ISOLATED_TEXT, 'no /mission modes in Recon');
  assert.match(READ_ONLY_TEXT, /^The \/mission access levels are not available in this mode: Data and Research run Read Only\. A Mission works here/);
  assert.match(HELP, /It works in every space and mode, inside their rules\./);
});

const tabbed = (tabs, extra = {}) => {
  const app = appHarness({ services: extra });
  app.services.modes = { ...app.services.modes, get: (id) => tabs[id] ?? 'code', readOnly: (id) => ['data', 'research'].includes(tabs[id]), isolated: (id) => tabs[id] === 'recon' };
  return app;
};

test('typed /mission in Data and Research starts a Mission (Read Only comes back at its end); /mission auto alone is still refused there', { skip: !hasGit }, async () => {
  const app = tabbed({ d: 'data', r: 'research' });
  try {
    for (const id of ['d', 'r']) {
      const agent = app.open(id);
      assert.deepEqual(await app.mission(agent, 'auto'), { kind: 'error', text: READ_ONLY_TEXT });
      const said = await app.mission(agent, 'look at the sales figures and write a summary');
      assert.equal(said.kind, 'success', said.text);
      assert.match(said.text, /^Mission started/);
      // Review of stage E: a typed start has no confirm card, so it warns in its answer.
      assert.ok(said.text.endsWith(READ_ONLY_TYPED_TEXT), said.text);
      const view = app.runner().view(id);
      assert.equal(view.kind, 'long');
      assert.equal(app.runner().runOf(id).kind, 'long');
      const saved = JSON.parse(readFileSync(join(agent.header.cwd, '.dsh-mission', 'runs', view.id, 'run.json'), 'utf8'));
      assert.ok(saved.long.restore, 'Read Only comes back at its end');
    }
  } finally {
    app.done();
  }
});

test('the tier\'s Sub-agents off: a typed goal in Data says that, not Read Only (the goal is passed to the helpers check too)', { skip: !hasGit }, async () => {
  const app = tabbed({ d: 'data' });
  app.services.modelTiers = { resolveTier: () => ({ id: 'small', label: 'Small', subagents: false }), roleRoute: () => undefined };
  try {
    const agent = app.open('d');
    const said = await app.mission(agent, 'look at the sales figures and write a summary');
    assert.deepEqual(said, { kind: 'error', text: helpersOffText({ id: 'small', label: 'Small' }) });
  } finally {
    app.done();
  }
});

test('typed /mission in Recon, where Recon allows Missions: inside Recon\'s rules (its room, Restricted, its model, no record outside); refused where Recon does not allow it', { skip: !hasGit }, async () => {
  const room = mkdtempSync(join(tmpdir(), 'dsh-recon-e-'));
  let allowed = false;
  const recon = { runs: () => allowed, runFolder: (id) => { mkdirSync(join(room, `run-${id}`), { recursive: true }); return join(room, `run-${id}`); } };
  const app = tabbed({ rc: 'recon' }, { recon });
  try {
    const agent = app.open('rc');
    assert.deepEqual(await app.mission(agent, 'find what the forums say about the leak'), { kind: 'error', text: ISOLATED_TEXT });
    allowed = true;
    assert.deepEqual(await app.mission(agent, 'restricted'), { kind: 'error', text: ISOLATED_TEXT }, 'no /mission modes in Recon');
    const said = await app.mission(agent, 'find what the forums say about the leak');
    assert.equal(said.kind, 'success', said.text);
    const dir = join(room, 'run-rc', '.dsh-mission', 'runs');
    const [id] = readdirSync(dir);
    const run = JSON.parse(readFileSync(join(dir, id, 'run.json'), 'utf8'));
    assert.deepEqual([run.mode, run.long.isolated], ['Restricted', true]);
    assert.equal(existsSync(join(app.home, 'mission', 'active-runs.json')) && readFileSync(join(app.home, 'mission', 'active-runs.json'), 'utf8').includes('"rc"'), false, 'no record outside Recon');
  } finally {
    app.done();
  }
});

test('typed /mission and Start Mission in Creator Plus: a Mission inside its rules (checks offline, no keys, no commands for its workers); a folder it refuses is refused with its words', { skip: !hasGit }, async () => {
  let refuse = '';
  const app = tabbed({ cp: 'creator-plus' }, { creatorPlus: { longRunRules: () => ({ cleanEnv: true, ...(refuse ? { refuse } : {}) }) } });
  try {
    const agent = app.open('cp');
    refuse = 'Creator Plus does not work in this folder.';
    const no = await app.mission(agent, 'build the hello plugin for me');
    assert.equal(no.kind, 'error');
    assert.match(no.text, /Creator Plus does not work in this folder\./);
    refuse = '';
    const card = await app.get('cp');
    assert.equal(card.json.preflight.ok, true);
    const said = await app.mission(agent, 'build the hello plugin for me');
    assert.equal(said.kind, 'success', said.text);
    const run = app.runner().runOf('cp');
    assert.equal(run.kind, 'long');
  } finally {
    app.done();
  }
});
