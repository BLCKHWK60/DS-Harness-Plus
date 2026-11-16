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
  assert.match(source, /const long = longRunOf\(sessionId\);\n    if \(long && !mode\?\.isolated\) \{\n      return longRunMask\(/);
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
