/**
 * The four checks, in this order (build prompt, part 5): the harness loads the plugin without errors,
 * its tests pass, the fit check is clear, and the trial install works. And upkeep (part 9): after a
 * version change, the map is compared with the one before and every plugin's tests run again.
 * Every program runs through `run` (a stand-in in tests), with the trial copy as its app-data folder.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { codeFindings, fitCheck } from './fit.js';
import { changed, diffMap } from './map.js';
import { planOf } from './interview.js';
import { scanAddon } from './scan.js';
import { mask } from './text.js';

/** The end of a program's output, masked (a test may print a key). */
const lastLines = (text, n = 3) => mask(String(text ?? '').trim().split('\n').slice(-n).join(' ').slice(0, 800)).slice(0, 400);

/** A small program that imports a plugin's index.js and checks its shape, run with the app's Node. */
const LOAD_PROBE = `const url = require('node:url').pathToFileURL(process.argv[1] + '/index.js').href;
import(url).then((m) => {
  if (typeof m.apply !== 'function') throw new Error('index.js exports no apply()');
  if (!m.name) throw new Error('index.js exports no name');
  console.log('loaded ' + m.name);
}).catch((error) => { console.error(String(error && error.stack || error)); process.exit(1); });`;

/**
 * The plan a built plugin really has, read from its own files (for the fit check after the build).
 * @param {string} dir - the plugin's folder.
 * @param {object} [intended] - the plan before the build (its tabs and changes are kept).
 * @returns {object} the plan.
 */
export function planFromFolder(dir, intended = {}) {
  const scan = scanAddon(dir);
  const plan = planOf({ folder: scan.folder, kind: intended.kind ?? '', tools: scan.tools, commands: scan.commands, tabs: (intended.modes ?? []).filter((mode) => !(scan.modes ?? []).includes(mode)), services: scan.provides, storage: scan.storage, instructionChars: scan.methodChars, changes: intended.changes ?? [], newMode: scan.modes?.[0] ?? '' });
  return { ...plan, name: scan.name || plan.name, routes: scan.routes.length ? scan.routes : plan.routes, slots: scan.slots.length ? scan.slots : plan.slots, settings: scan.settingsNs.length ? scan.settingsNs.filter((ns) => ns !== 'modes') : plan.settings, rows: scan.rows.length ? scan.rows : plan.rows, givesTools: intended.givesTools ?? {}, loosens: intended.loosens ?? [] };
}

/**
 * Run the four checks on a plugin folder only the host writes (the checked copy). The programs run on a copy
 * of it in a run folder of their own (`sandbox(dir, work)`, lib/runs.js); the fit check reads the checked
 * copy itself; the trial install makes a trial copy of its own (`trial.check`).
 * @param {object} input - `dir` (the checked copy), `map`, `intended` (the plan), `sandbox` ((dir, work) =>
 *   work({run, at}): `at` is the copy in the run folder, `run(file, args, {cwd, env, timeoutMs})` runs there),
 *   `trial` (lib/trial.js), `node` (the app's Node), `skipTrial` (Quick: no trial install).
 * @returns {Promise<{passed: boolean, steps: {id: string, ok: boolean | undefined, text: string}[], fit: object}>} the outcome.
 */
export async function fourChecks({ dir, map, intended = {}, sandbox, trial, node, skipTrial = false }) {
  const steps = [];
  const files = ['index.js', 'client.js', ...(existsSync(join(dir, 'lib')) ? readdirSync(join(dir, 'lib')).filter((name) => name.endsWith('.js')).map((name) => `lib/${name}`) : [])].filter((file) => existsSync(join(dir, file)));
  const testDir = join(dir, 'test');
  const tests = existsSync(testDir) ? readdirSync(testDir).filter((name) => name.endsWith('.test.mjs')).map((name) => `test/${name}`) : [];
  await sandbox(dir, async ({ run, at, trialHome }) => {
    const env = trialHome ? { DSH_HOME: trialHome } : {};
    // 1. The harness loads it: every file parses, and index.js imports with the app's Node.
    let loaded = true;
    for (const file of files) {
      const parsed = await run(node, ['--check', join(at, file)], { env, cwd: at, timeoutMs: 30_000 });
      if (parsed.code !== 0) {
        loaded = false;
        steps.push({ id: 'load', ok: false, text: `${file} does not parse: ${lastLines(parsed.stderr)}` });
        break;
      }
    }
    if (loaded) {
      const probe = await run(node, ['-e', LOAD_PROBE, at], { env, cwd: at, timeoutMs: 30_000 });
      loaded = probe.code === 0;
      steps.push({ id: 'load', ok: loaded, text: loaded ? 'Loads: every file parses and its code imports without errors.' : `Does not load: ${lastLines(probe.stderr)}` });
    }
    // 2. Its tests pass.
    if (tests.length === 0) steps.push({ id: 'tests', ok: false, text: 'It has no tests yet: tests come first.' });
    else {
      // In one process: a plugin's own code may start no child process (lib/sandbox.js).
      const result = await run(node, ['--test', '--test-isolation=none', '--test-timeout=60000', ...tests], { env, cwd: at, timeoutMs: 600_000 });
      const pass = /ℹ pass (\d+)/.exec(result.stdout)?.[1] ?? '?';
      const fail = /ℹ fail (\d+)/.exec(result.stdout)?.[1] ?? '?';
      steps.push({ id: 'tests', ok: result.code === 0, text: result.code === 0 ? `Tests pass (${pass}).` : `Tests fail (${fail} of ${Number(pass) + Number(fail) || '?'}): ${lastLines(result.stdout, 6)}` });
    }
  });
  // 3. The fit check, on what was really built (the checked copy, read by the host).
  const plan = planFromFolder(dir, intended);
  const fit = fitCheck(plan, map);
  // What the code itself does, not only what the plan says (a help, not a guarantee: a model can hide intent).
  const fromCode = codeFindings(dir, map, { kind: intended.kind ?? plan.kind ?? '', name: plan.name, own: plan.settings });
  if (fromCode.length > 0) {
    fit.findings.push(...fromCode);
    fit.result = fit.findings.some((finding) => finding.level === 'blocked') ? 'blocked' : 'decision';
  }
  steps.push({ id: 'fit', ok: fit.result === 'clear' ? true : fit.result === 'blocked' ? false : undefined, text: fit.result === 'clear' ? 'Fit check: clear.' : `Fit check: ${fit.result === 'blocked' ? 'blocked' : 'needs your decision'}: ${fit.findings.map((finding) => finding.text).join(' ')}` });
  // 4. The trial install: a fresh trial copy of its own, never the real setup.
  if (skipTrial || !trial) steps.push({ id: 'trial', ok: undefined, text: 'Trial install: not run at this Depth.' });
  else {
    try {
      const tried = await trial.check([dir]);
      steps.push({ id: 'trial', ok: tried.ok, text: tried.ok ? 'Trial install: installed and loaded in a trial copy without warnings.' : `The trial copy reports: ${mask(tried.problem || tried.warnings).slice(0, 400)}` });
    } catch (error) {
      steps.push({ id: 'trial', ok: false, text: `The trial install could not run: ${mask(String(error?.message ?? error)).slice(0, 300)}` });
    }
  }
  const order = ['load', 'tests', 'fit', 'trial'];
  steps.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  const passed = steps.every((step) => step.ok === true || (step.id === 'trial' && step.ok === undefined && skipTrial));
  return { passed, steps, fit };
}

/** @returns {string} the checks in plain words. */
export function checksText({ passed, steps }) {
  return [passed ? 'All four checks passed.' : 'Not all checks passed:', ...steps.map((step) => `- ${step.ok === true ? 'Passed' : step.ok === false ? 'FAILED' : 'Open'}: ${step.text}`)].join('\n');
}

/**
 * Upkeep: compare the map with the one before and run every plugin's tests where they are, each on a copy
 * in a run folder of its own (`sandbox`, as for the four checks).
 * @param {object} input - `before`, `after` (maps), `sources` (plugin name → a folder with its tests, or ''),
 *   `node`, `sandbox`.
 * @returns {Promise<{diff: object, changed: boolean, results: {plugin: string, ok: boolean | undefined, text: string}[]}>} the report.
 */
export async function upkeep({ before, after, sources = {}, node, sandbox }) {
  const diff = diffMap(before, after);
  const results = [];
  for (const plugin of after?.plugins ?? []) {
    if (plugin.locked) continue;
    const dir = sources[plugin.name];
    if (!dir || !existsSync(join(dir, 'test'))) {
      results.push({ plugin: plugin.name, ok: undefined, text: 'No tests here (an installed copy carries none): set the Plus folder on the Creator Plus page to run them.' });
      continue;
    }
    const tests = readdirSync(join(dir, 'test')).filter((name) => name.endsWith('.test.mjs')).map((name) => `test/${name}`);
    const result = await sandbox(dir, ({ run, at, trialHome }) => run(node, ['--test', '--test-isolation=none', '--test-timeout=60000', ...tests], { env: trialHome ? { DSH_HOME: trialHome } : {}, cwd: at, timeoutMs: 600_000 }));
    results.push({ plugin: plugin.name, ok: result.code === 0, text: result.code === 0 ? 'Tests pass.' : `Tests fail: ${lastLines(result.stdout, 4)}` });
  }
  return { diff, changed: changed(diff), results };
}

/** The smallest fix first (part 9): a setting, then an adapter beside it, then a change, then a rebuild from the brief. */
export const FIX_LADDER = ['a setting', 'an adapter beside the plugin', 'a change to the plugin', 'a rebuild from its brief'];

/** @returns {string} an upkeep report in plain words. */
export function upkeepText({ diff, changed: anything, results }) {
  const lines = [anything ? 'Since the last map:' : 'Nothing changed since the last map.'];
  if (diff.app) lines.push(`- The app: ${diff.app}.`);
  if (diff.added.length) lines.push(`- New: ${diff.added.join(', ')}.`);
  if (diff.removed.length) lines.push(`- Gone: ${diff.removed.join(', ')}.`);
  for (const line of diff.versions) lines.push(`- Updated: ${line}.`);
  for (const line of diff.switched) lines.push(`- ${line}.`);
  if (diff.tools.removed.length) lines.push(`- Tools that went away: ${diff.tools.removed.join(', ')} (a plugin that used one is at risk).`);
  const broken = results.filter((result) => result.ok === false);
  lines.push('', broken.length ? `Broken: ${broken.map((result) => result.plugin).join(', ')}. The smallest fix comes first: ${FIX_LADDER.join(', then ')}.` : `No plugin's tests failed${results.some((result) => result.ok === undefined) ? ' (some could not run here)' : ''}.`);
  for (const result of broken) lines.push(`- ${result.plugin}: ${result.text}`);
  return lines.join('\n');
}
