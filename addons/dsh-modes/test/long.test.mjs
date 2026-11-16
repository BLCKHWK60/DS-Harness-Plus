/**
 * Long run in every tab (16 November 2026): while a run is on, its tab keeps its own tools and gains
 * what the run needs; the starting choice per tab; the service Mission asks.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { LONG_STEP_TOOL, longRunMask, longToolsFor, WEB_TOOLS, RESEARCH_TOOL } from '../lib/mask.js';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const client = readFileSync(new URL('../client.js', import.meta.url), 'utf8');

test('a tab\'s starting choice: files and commands on, the web on except in an isolated tab', () => {
  assert.deepEqual(longToolsFor({ id: 'chat', tools: 'none' }, undefined), { files: true, web: true });
  assert.deepEqual(longToolsFor({ id: 'recon', isolated: true, tools: ['recon_cite'] }, undefined), { files: true, web: false });
  assert.deepEqual(longToolsFor({ id: 'chat' }, { files: false, web: false }), { files: false, web: false });
  assert.deepEqual(longToolsFor({ id: 'recon', isolated: true }, { web: true }), { files: true, web: false }, 'never the web in an isolated tab');
  assert.deepEqual(longToolsFor({ id: 'chat' }, { files: 'yes' }), { files: true, web: true }, 'only true or false count');
});

test('the mask while a Long run is on', () => {
  // Chat (no tools) with files and the web: every tool, as in Cowork.
  assert.equal(longRunMask({ mode: { tools: 'none' }, files: true, web: true }), null);
  // Without the web: every tool but the web ones.
  const noWeb = longRunMask({ mode: { tools: 'none' }, files: true, web: false });
  assert.ok(noWeb.deny.includes(WEB_TOOLS[0]) && noWeb.deny.includes(RESEARCH_TOOL));
  // Files off: the tab's own tools and the step tool.
  const scout = longRunMask({ mode: { tools: ['scout_search', 'web_search'] }, files: false, web: true });
  assert.ok(scout.allow.includes('scout_search') && scout.allow.includes(LONG_STEP_TOOL) && scout.allow.includes('web_search'));
  const quiet = longRunMask({ mode: { tools: 'none' }, files: false, web: false });
  assert.deepEqual(quiet, { allow: [LONG_STEP_TOOL] }, 'Chat with nothing chosen still has the step tool');
  // An isolated tab's tools stay with that tab.
  assert.deepEqual(longRunMask({ mode: { tools: 'none' }, files: true, web: true, fenced: ['recon_cite'] }), { deny: ['recon_cite'] });
  assert.ok(!longRunMask({ mode: { tools: ['recon_cite', 'x'] }, files: false, web: false, fenced: ['recon_cite'] }).allow.includes('recon_cite'));
});

test('Modes follows Long runs: the mask, the shell guard, the note, the service, the settings', () => {
  assert.match(source, /const long = longRunOf\(sessionId\);[\s\S]{0,400}if \(long && mode\?\.isolated\) return isolatedRunMask\(\{ tools: mode\.tools, child: topOf\(sessionId\) !== sessionId, files: long\.files/);
  assert.match(source, /if \(long && !mode\?\.isolated\) \{\n      return longRunMask\(/);
  assert.match(source, /const long = longRunOf\(id\);\s+if \(isolatedMayRun\(\{ mode, name: exec\.name, child: topOf\(id\) !== id, off: toolsOff\(id\), webOff: isolatedWebOff\(id\), long \}\)\)/);
  assert.match(source, /if \(mode\?\.isolated \|\| \(long \? long\.web : webOn\(id, mode\)\)\) return undefined;/);
  assert.match(source, /A Long run is on in this conversation\./);
  assert.match(source, /if \(event\?\.kind !== 'long' \|\| \(event\.type !== 'started' && event\.type !== 'finished'\)\) return;/);
  for (const name of ['readOnly(sessionId)', 'longTools(sessionId)', 'refreshTools(sessionId)']) assert.ok(source.includes(`    ${name} {`), name);
  assert.match(source, /longTools: z\.string\(\)\.default\('\{\}'\)\.volatile\(\),/);
  for (const key of ['long.group', 'long.hint', 'long.files', 'long.web', 'long.isolated']) {
    assert.equal(client.split('\n').filter((text) => text.includes(`'${key}':`)).length, 2, `${key}: English and Chinese`);
  }
});

test('in a Read Only tab a Long run\'s helpers keep the level they inherit, and the mask follows the run', async () => {
  const { boot, makeWorld, maskNow, sessionOf } = await import('./app.mjs');
  const world = makeWorld({ defaultMode: 'chat', pinOnFirstTurn: false });
  const on = new Set();
  const app = boot(world, { known: ['bash', 'edit', 'web_search', 'web_fetch', 'mission_step'], mission: { longRun: (id) => (on.has(id) ? { files: true, web: false } : undefined) } });
  const { agent, masks } = await app.open('c');
  await app.firstTurn(agent);
  assert.deepEqual(maskNow(masks), { allow: [] }, 'Chat on its own: no tools');
  // The run starts: the conversation (lifted to Workspace Write by Mission) gets every tool but the web.
  on.add('c');
  sessionOf(world, 'c').append('sandbox/mode', { mode: 'workspace-write' });
  app.service().refreshTools('c');
  const mask = maskNow(masks);
  assert.ok(mask.deny.includes('web_search') && !mask.deny.includes('bash'), JSON.stringify(mask));
  // A helper starts with the level it inherits; Modes leaves it (it used to put Read Only on it).
  sessionOf(world, 'h1', { parentSession: 'c' }).append('sandbox/mode', { mode: 'workspace-write' });
  await app.open('h1', { header: { parentSession: 'c' } });
  assert.equal(sessionOf(world, 'h1').level, 'workspace-write');
  // Without a run, a helper in Chat gets Read Only, as before.
  on.delete('c');
  sessionOf(world, 'h2', { parentSession: 'c' }).append('sandbox/mode', { mode: 'workspace-write' });
  await app.open('h2', { header: { parentSession: 'c' } });
  assert.equal(sessionOf(world, 'h2').level, 'read-only');
  app.service().refreshTools('c');
  assert.deepEqual(maskNow(masks), { allow: [] }, 'the tab\'s own tools are back');
  app.stop();
});

test('a research tab\'s helpers get no web while the run\'s Web is off', () => {
  const research = { tools: ['deep_research', 'web_search', 'web_fetch'] };
  const helperFiles = longRunMask({ mode: research, files: true, web: false, research: true, child: true });
  assert.ok(helperFiles?.deny?.includes('web_search'), JSON.stringify(helperFiles));
  const helperOwn = longRunMask({ mode: research, files: false, web: false, research: true, child: true });
  assert.ok(!helperOwn.allow.includes('web_search') && !helperOwn.allow.includes('web_fetch'), JSON.stringify(helperOwn));
  assert.equal(longRunMask({ mode: research, files: true, web: true, research: true, child: true }), null, 'with Web on, as before');
});

test('a Long run in an isolated tab (Recon): the conversation gets its own tools and the step tool, its helpers its own tools and the file tools; never a shell or a program', async () => {
  const { isolatedRunMask, isolatedMayRun, ISOLATED_RUN_FILES } = await import('../lib/isolation.js');
  const tools = ['recon_onion_search', 'recon_onion_read', 'recon_cite'];
  assert.deepEqual(isolatedRunMask({ tools }), { allow: [...tools, 'mission_step'] });
  assert.deepEqual(isolatedRunMask({ tools, child: true }), { allow: [...tools, ...ISOLATED_RUN_FILES] });
  assert.deepEqual(isolatedRunMask({ tools, child: true, files: false }), { allow: tools });
  assert.deepEqual(isolatedRunMask({ tools, off: true }), { allow: [] });
  for (const name of ['bash', 'shell', 'run_code', 'web_search', 'deep_research', 'subagent']) assert.equal(ISOLATED_RUN_FILES.includes(name), false, name);
  const mode = { isolated: true, tools };
  const long = { files: true, web: false };
  assert.equal(isolatedMayRun({ mode, name: 'mission_step', long }), true);
  assert.equal(isolatedMayRun({ mode, name: 'write', long }), false, 'the conversation itself writes no files');
  assert.equal(isolatedMayRun({ mode, name: 'write', child: true, long }), true);
  assert.equal(isolatedMayRun({ mode, name: 'write', child: true, long: { files: false } }), false);
  assert.equal(isolatedMayRun({ mode, name: 'mission_step', child: true, long }), false, 'a helper does not drive the run');
  for (const name of ['bash', 'run_code', 'web_fetch']) assert.equal(isolatedMayRun({ mode, name, child: true, long }), false, name);
  assert.equal(isolatedMayRun({ mode, name: 'recon_onion_read', child: true, long }), true);
  assert.equal(isolatedMayRun({ mode, name: 'recon_onion_read', child: true }), false, 'without a run, no helper at all');
  assert.equal(isolatedMayRun({ mode, name: 'mission_step' }), false, 'without a run, no step tool');
});

test('a Recon conversation whose Long run has ended: the step tool says the run is over, and a model that keeps calling it has its turn ended (16 November: some 340 calls)', async () => {
  const { RUN_OVER_LIMIT, RUN_OVER_TEXT } = await import('../lib/isolation.js');
  const { boot, makeWorld } = await import('./app.mjs');
  const RECON = { label: 'Recon', tools: ['recon_cite'], sandbox: 'read-only', prompt: 'Recon method.', isolated: true };
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify({ recon: RECON }), sessionModes: JSON.stringify({ r1: 'recon', c1: 'cowork' }) });
  const on = new Set(['r1']);
  const app = boot(world, { known: ['recon_cite', 'mission_step', 'bash'], mission: { longRun: (id) => (on.has(id) ? { files: true, web: false } : undefined) } });
  try {
    const r1 = (await app.open('r1')).agent;
    await app.open('c1');
    const call = (id, name = 'mission_step') => app.guard({ name, agent: { id }, arguments: {} });
    const nextStep = (agent) => app.waterfall('agent/pre-step', { agent }, () => ({ kind: 'enter', messages: [] }));
    // While the run is on: the step tool runs, nothing is counted.
    assert.equal(call('r1'), undefined);
    on.delete('r1');
    // The run has ended: a plain answer instead of "not part of this conversation".
    assert.equal(call('r1'), RUN_OVER_TEXT);
    assert.match(RUN_OVER_TEXT, /has ended[\s\S]*do not call mission_step again[\s\S]*then stop/);
    assert.equal((await nextStep(r1)).kind, 'enter', 'once is fine: the model may still answer');
    // Another tool in between starts the count afresh.
    call('r1');
    assert.match(call('r1', 'bash'), /is not part of this isolated conversation/);
    for (let n = 1; n < RUN_OVER_LIMIT; n += 1) call('r1');
    assert.equal((await nextStep(r1)).kind, 'enter');
    call('r1');
    assert.equal((await nextStep(r1)).kind, 'reject', `after ${RUN_OVER_LIMIT} calls in a row the turn ends`);
    assert.equal((await nextStep(r1)).kind, 'enter', 'counted afresh after that');
    // A new turn of the user's starts afresh too.
    for (let n = 0; n < RUN_OVER_LIMIT; n += 1) call('r1');
    await app.emit('session/event', { id: 'r1' }, { type: 'turn/start' });
    assert.equal((await nextStep(r1)).kind, 'enter');
    // Other tabs are not touched.
    assert.equal(call('c1'), undefined, 'Cowork: as before');
  } finally {
    app.stop();
  }
});
