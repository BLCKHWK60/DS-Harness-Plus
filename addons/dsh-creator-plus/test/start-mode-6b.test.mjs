/**
 * Item 4A, stage 6b, Part D (STAGE6B-DESIGN.md D14, J20; owner answer Q5 A): a new mode add-on made from Creator Plus's
 * template keeps the one reset every mode add-on has (`defaultMode` back to `cowork` only when it named its mode), says
 * why, and never writes `spaceSettings`: Modes keeps each space's start mode. The recipe step says the same.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scaffoldFiles, writeScaffold } from '../lib/scaffold.js';
import { loadRecipes, recipeText } from '../lib/recipes.js';

const HERE = dirname(dirname(fileURLToPath(import.meta.url)));
const scratch = () => realpathSync(mkdtempSync(join(tmpdir(), 'creator-plus-6bd-')));

test('scaffold-mode-start-mode-kept: the mode template keeps its guarded reset, says why, writes no spaceSettings, and loads', async () => {
  const files = scaffoldFiles({ folder: 'dsh-notes6b', title: 'Notes', description: 'Meeting notes.', kind: 'mode', modeId: 'notes6b', method: 'Write short notes.' });
  const code = files['index.js'];
  assert.match(code, /if \(row\.value\.defaultMode === MODE_ID\) ops\.push\(\{ op: 'set', path: \['defaultMode'\], value: 'cowork' \}\);/);
  assert.match(code, /Without the Cowork sidebar \(and in the lab with spaces off\) defaultMode still picks a new thread's mode/);
  assert.match(code, /this add-on never writes spaceSettings\./);
  assert.doesNotMatch(code, /path: \['(spaceSettings|startMode)'\]/);
  const root = scratch();
  try {
    const dir = join(root, 'dsh-notes6b');
    writeScaffold(dir, files, join(HERE, 'node_modules'));
    const loaded = await import(join(dir, 'index.js'));
    assert.equal(typeof loaded.apply, 'function', 'the made add-on still loads');
    assert.equal(loaded.MODE_ID, 'notes6b');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('recipe-mode-start-mode: the mode recipe tells a builder not to write spaceSettings', () => {
  const recipes = loadRecipes(join(HERE, 'recipes'));
  const text = recipeText(recipes.mode, { strong: false });
  assert.match(text, /move defaultMode back to cowork if it pointed at the mode/);
  assert.match(text, /Do not write spaceSettings: Modes keeps the space's start mode\./);
});
