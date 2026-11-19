/**
 * Rebuilds `off-baseline.json` from the add-on as it was committed BEFORE Tool access (never from the current one):
 *   node test/make-off-baseline.mjs
 * It unpacks that commit's `addons/dsh-modes` file by file with `git show` (not `git archive`: that leaves the tests out) into a temporary folder (nothing in the working copy is touched),
 * runs the scenario of `off-baseline.mjs` there, and writes the result next to this file.
 * Run it inside the app's own runtime, like the tests: ELECTRON_RUN_AS_NODE=1 "/Applications/DeepSeek Harness.app/Contents/MacOS/DeepSeek Harness" test/make-off-baseline.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { collect } from './off-baseline.mjs';

/** The commit before Tool access (Phases 1-4 of 1.0). */
export const BEFORE_TOOL_ACCESS = 'bc82004';

const here = path.dirname(new URL(import.meta.url).pathname);
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: here, encoding: 'utf8' }).trim();
const tmp = mkdtempSync(path.join(tmpdir(), 'dsh-modes-before-'));
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', BEFORE_TOOL_ACCESS, 'addons/dsh-modes'], { cwd: repo, encoding: 'utf8' }).split('\n').filter(Boolean);
for (const file of files) {
  const target = path.join(tmp, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, execFileSync('git', ['show', `${BEFORE_TOOL_ACCESS}:${file}`], { cwd: repo, maxBuffer: 64 * 1024 * 1024 }));
}
const old = await import(pathToFileURL(path.join(tmp, 'addons/dsh-modes/test/app.mjs')).href);
const result = await collect({ boot: old.boot, makeWorld: old.makeWorld, maskNow: old.maskNow });
writeFileSync(new URL('./off-baseline.json', import.meta.url), `${JSON.stringify(result, null, 1)}\n`);
console.log(`off-baseline.json rebuilt from ${BEFORE_TOOL_ACCESS}: ${Object.keys(result).length} entries`);
