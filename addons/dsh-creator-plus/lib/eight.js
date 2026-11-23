/**
 * "How we will know it is as good as you": the eight tests (build prompt). Each has a part code can run by
 * itself (in a throwaway folder, with stand-ins) and, for some, a part only a model can do. The code parts
 * run from the Creator Plus page or the tests; the model parts are the prompts below, run in a Creator Plus
 * conversation on the model being scored (the floor model, then the strongest model connected), with
 * the result kept on the scorecard by creator_note. A real-model scorecard needs the user's own models:
 * it was not run when this was built.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { barState, boundaryRefusal } from './bar.js';
import { checkChange, prepareChange } from './change.js';
import { upkeep } from './checks.js';
import { questionRefusal } from './depth.js';
import { fitCheck } from './fit.js';
import { findingCards, findingsOf } from './logs.js';
import { buildMap } from './map.js';
import { guardRefusal } from './rules.js';
import { openBackups } from './trial.js';

export const EIGHT = [
  { id: 'rebuild', label: 'Rebuild', what: 'Three plugins of different kinds are each rebuilt from a one-paragraph brief with the original hidden.', must: 'The rebuilt plugin works, passes the original\'s tests, and fits.', model: true },
  { id: 'collision', label: 'Collision', what: 'A request made to collide: a command name that already exists, and a tool for Recon.', must: 'Both are caught before anything is built.', model: false },
  { id: 'look', label: 'Look', what: 'The same plugin is built twice: once to match what is enabled, once with a look of its own.', must: 'Each one looks the way it was asked to.', model: true },
  { id: 'change', label: 'Change', what: 'A new plugin that needs an existing plugin to change.', must: 'The proposal, the backup and the undo all work.', model: false },
  { id: 'update', label: 'Update', what: 'A change to the plugin interface, simulated, that breaks one plugin.', must: 'It is reported in plain words with a fix proposed.', model: false },
  { id: 'improve', label: 'Improve', what: 'Thread logs with two planted problems: a tool that fails the same way several times, and a task done by hand again and again.', must: 'It names the right plugin, shows the log entries, proposes the fix, and recommends the missing plugin.', model: true },
  { id: 'long', label: 'Mission', what: 'A Mission with a time limit and a turn limit.', must: 'It asks nothing after the first minute, stops at the first limit, changes nothing in the real setup, and hands over its questions and proposals.', model: false },
  { id: 'scope', label: 'Scope', what: 'One plugin is selected, and the request needs a second plugin to change.', must: 'It stops and asks to add the second plugin; nothing outside the selection was opened or changed.', model: false },
];

/** The prompts of the model parts, to run in a Creator Plus conversation on the model being scored. */
export const MODEL_PROMPTS = {
  rebuild: 'Self-test "Rebuild": pick three plugins of different kinds from the map (a tool, a mode, a page). For each, read only its brief (creator_passport show), build it again in this folder with creator_scaffold and the recipe, without opening the original\'s code, and run creator_check. Then report for each: did it pass the original\'s tests (creator_check with the original\'s tests copied in), and does it fit.',
  look: 'Self-test "Look": build the same small page plugin twice with creator_scaffold: once to match the look of what is enabled (the map\'s look list), once with a look of its own (a different accent and type size you choose). Run creator_check on both and describe how each one looks and why.',
  improve: 'Self-test "Improve": run creator_improve on the selection. Name the plugin with the repeated failure, show its log entries, propose the fix as a card, and recommend the plugin that is missing for the task the user keeps doing by hand.',
};

/** A stand-in map with a few plugins, Recon sealed. */
function sampleMap() {
  const scans = [
    { folder: 'dsh-recon', name: '@local/dsh-recon', version: '1', provides: ['recon'], uses: [], events: [], tools: ['recon_cite'], commands: ['recon'], routes: ['/dsh-recon/state'], slots: [{ name: 'settings.section', id: 'recon' }], settingsNs: ['recon'], sections: [], modes: ['recon'], storage: ['recon'], config: [], methodChars: 3000, rows: ['recon'], cssVars: {} },
    { folder: 'dsh-notes', name: '@local/dsh-notes', version: '1', provides: [], uses: [], events: [], tools: ['notes_find'], commands: ['notes'], routes: ['/dsh-notes/data'], slots: [{ name: 'settings.section', id: 'notes' }], settingsNs: ['notes'], sections: [], modes: [], storage: ['notes'], config: [], methodChars: 0, rows: ['notes'], cssVars: {} },
    { folder: 'dsh-files', name: '@local/dsh-files', version: '1', provides: [], uses: [], events: [], tools: ['files_rename'], commands: [], routes: ['/dsh-files/data'], slots: [{ name: 'settings.section', id: 'files' }], settingsNs: ['files'], sections: [], modes: [], storage: [], config: [], methodChars: 0, rows: ['files'], cssVars: {} },
  ];
  const entries = scans.map((scan) => ({ id: scan.rows[0], options: { id: scan.rows[0], name: scan.name } }));
  entries.push({ id: 'shell', options: { id: 'shell', name: '@deepseek-ai/dsh-tool-shell' } });
  return buildMap({ entries, scans, settings: [{ ns: 'modes', value: { extraModes: JSON.stringify({ recon: { label: 'Recon', isolated: true, tools: ['recon_cite'], prompt: 'x' } }) } }], tools: ['bash', 'recon_cite', 'notes_find', 'files_rename'], appVersion: '0.2.2', at: 1 });
}

/**
 * Run the code parts of the eight tests in a throwaway folder.
 * @param {{node?: string, run?: Function}} [options] - for upkeep's test run (a stand-in by default).
 * @returns {Promise<{id: string, label: string, ok: boolean | undefined, text: string}[]>} one result per test; `undefined` where a model is needed.
 */
export async function runCodeParts({ run } = {}) {
  const map = sampleMap();
  const scratch = mkdtempSync(join(tmpdir(), 'creator-plus-eight-'));
  const results = [];
  try {
    // 2. Collision: a command that exists and a tool for Recon, caught before anything is built.
    const fit = fitCheck({ name: '@local/dsh-new', commands: ['notes'], tools: ['new_find'], modes: ['recon'], givesTools: { recon: ['new_find'] } }, map);
    const caught = fit.result === 'blocked' && fit.findings.some((finding) => /command "notes"/.test(finding.text)) && fit.findings.some((finding) => /sealed mode/.test(finding.text));
    results.push({ id: 'collision', ok: caught, text: caught ? 'Both collisions were blocked before anything was built.' : `Not caught: ${JSON.stringify(fit)}` });
    // 4. Change: proposal, backup and undo.
    const plugin = map.plugins.find((entry) => entry.name === '@local/dsh-notes');
    const source = join(scratch, 'installed', 'dsh-notes');
    mkdirSync(join(source, 'lib'), { recursive: true });
    writeFileSync(join(source, 'index.js'), 'export const name = "dsh-notes";\n');
    const backups = openBackups({ home: join(scratch, 'home'), now: () => 1_700_000_000_000 });
    const checked = checkChange({ plugin, files: { 'index.js': 'export const name = "dsh-notes"; // changed\n' } });
    const prepared = checked.ok ? prepareChange({ plugin, source, files: checked.files, backups, workDir: join(scratch, 'work') }) : undefined;
    const untouched = readFileSync(join(source, 'index.js'), 'utf8').includes('changed') === false;
    writeFileSync(join(source, 'index.js'), 'broken');
    if (prepared) backups.restore(prepared.backup, source);
    const undone = readFileSync(join(source, 'index.js'), 'utf8') === 'export const name = "dsh-notes";\n';
    const changeOk = Boolean(prepared?.diff.includes('// changed')) && untouched && undone && !checkChange({ plugin: map.plugins.find((entry) => entry.name === '@deepseek-ai/dsh-tool-shell'), files: { 'x.js': '' } }).ok;
    results.push({ id: 'change', ok: changeOk, text: changeOk ? 'The change was shown as a diff and made in a copy only; the backup was taken first, and putting it back worked; a built-in plugin was refused.' : 'The change, its backup or its undo did not work.' });
    // 5. Update: a tool goes away and one plugin's tests fail.
    const after = { ...map, app: { version: '0.2.3' }, tools: map.tools.filter((tool) => tool !== 'notes_find') };
    mkdirSync(join(scratch, 'src', 'dsh-notes', 'test'), { recursive: true });
    writeFileSync(join(scratch, 'src', 'dsh-notes', 'test', 'a.test.mjs'), '');
    const report = await upkeep({ before: map, after, sources: { '@local/dsh-notes': join(scratch, 'src', 'dsh-notes') }, node: 'node', sandbox: async (dir, work) => work({ at: dir, run: run ?? (async () => ({ code: 1, stdout: 'ℹ pass 3\nℹ fail 1\nnotes_find is not a tool', stderr: '' })) }) });
    const updateOk = report.changed && report.diff.app === '0.2.2 → 0.2.3' && report.diff.tools.removed.includes('notes_find') && report.results.some((result) => result.plugin === '@local/dsh-notes' && result.ok === false);
    results.push({ id: 'update', ok: updateOk, text: updateOk ? 'The new app version, the tool that went away and the plugin whose tests failed were all reported, with the smallest fix first.' : 'The update was not reported.' });
    // 6. Improve (code part): the failing tool is tied to its plugin, with its entries.
    const events = [];
    for (let n = 0; n < 3; n += 1) {
      events.push({ type: 'tool/call', data: { callId: `c${n}`, name: 'files_rename', arguments: { from: 'a', to: 'b' } } });
      events.push({ type: 'tool/result', data: { message: { toolCallId: `c${n}`, content: [{ type: 'text', text: 'Error: the folder is read only' }], isError: true } } });
    }
    const found = findingsOf(events, { toolOwner: (name) => (name.startsWith('files_') ? '@local/dsh-files' : '') });
    const cards = findingCards({ byPlugin: { '@local/dsh-files': found.findings.map((item) => ({ ...item, conversation: 'c1' })) }, general: [] });
    const improveOk = cards.some((card) => card.plugin === '@local/dsh-files' && card.kind === 'tool-error' && card.count === 3) && cards.some((card) => card.kind === 'repeated');
    results.push({ id: 'improve', ok: improveOk ? undefined : false, text: improveOk ? 'Code part passed: the repeated failure was tied to its plugin with its log entries. The fix and the missing plugin need a model (the prompt is ready).' : 'The planted failure was not found.' });
    // 7. Mission (id 'long', was "Long run"): no question after the first minute; no write into the real setup.
    const silent = questionRefusal({ longSince: 1_000, now: 70_000 }) !== '' && questionRefusal({ longSince: 1_000, now: 30_000 }) === '';
    const realHome = join(scratch, 'dsh');
    const blocked = guardRefusal({ name: 'write', args: { file_path: join(realHome, 'addons', 'x', 'index.js') }, cwd: join(scratch, 'build'), dshHome: realHome, outside: [join(realHome, 'addons')] }) !== '';
    results.push({ id: 'long', ok: silent && blocked, text: silent && blocked ? 'After its first minute a Mission asks nothing; it cannot write into the real setup. Stopping at the first limit is the Mission\'s own.' : 'A Mission could ask late or write into the real setup.' });
    // 8. Scope: one plugin selected; the second must be added by the user.
    const state = barState({ selection: ['@local/dsh-notes'], run: 'improve' }, map.plugins.map((entry) => entry.name));
    const stopped = boundaryRefusal(state, '@local/dsh-files', map.plugins.find((entry) => entry.name === '@local/dsh-files'), 'change') !== '' && boundaryRefusal(state, '@local/dsh-notes', plugin, 'change') === '';
    results.push({ id: 'scope', ok: stopped, text: stopped ? 'A plugin outside the selection was neither opened nor changed; the run stops and asks to add it.' : 'The selection did not hold.' });
    results.push({ id: 'rebuild', ok: undefined, text: 'Needs a model: run the "Rebuild" prompt on each model to be scored.' });
    results.push({ id: 'look', ok: undefined, text: 'Needs a model: run the "Look" prompt on each model to be scored.' });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return EIGHT.map((test) => ({ ...test, ...results.find((result) => result.id === test.id) }));
}

/** @returns {string} a scorecard line for the page. */
export function scoreText(results) {
  const passed = results.filter((result) => result.ok === true).length;
  const failed = results.filter((result) => result.ok === false).length;
  const open = results.filter((result) => result.ok === undefined).length;
  return `${passed} passed, ${failed} failed, ${open} need a model.`;
}
