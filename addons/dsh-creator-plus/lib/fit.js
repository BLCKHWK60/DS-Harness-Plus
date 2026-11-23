/**
 * The fit check (build prompt, part 4): code that checks a plan before the build, and the result after
 * it, against the map. The result is one of three: clear, needs the user's decision, or blocked.
 * Blocked is final: a plugin that would weaken another mode's safety rule is never put to the user as a
 * question (fixed rule 3, the owner's answer of 16 November).
 */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MODE_TEXT_BUDGET, PLUGIN_TEXT_BUDGET } from './map.js';
import { patchRows } from './scan.js';

/** Safety rules of other modes a plan may never touch. `plan.loosens` names them; a change of these files does too. */
export const SAFETY = [
  { id: 'recon-sealed', plain: 'Recon is sealed: no plugin hands a Recon thread a tool, reads it, or carries its text out (only the owner\'s Export door does)' },
  { id: 'bench-write-gates', plain: 'Devices writes to a device only behind its gates (levels, the four conditions, the owner\'s yes)' },
  { id: 'content-owner-words', plain: 'Content counts a decision only from the owner\'s own words' },
  { id: 'web-off', plain: 'Web Off and the Web levels hold for every tool, command and program' },
  { id: 'mission-one-writer', plain: 'Only one helper changes files at a time in a run' },
];
/**
 * Files whose change would loosen a safety rule (a change to them is blocked, not asked). Recon, Bench,
 * Modes, Mission and Creator Plus itself: every file holds a seal, a gate or a guard. Every plugin's
 * setup file (cordis.patch.yml) too: it can switch off or replace another plugin.
 */
export const GUARDED_FILES = {
  'dsh-recon': ['*'],
  'dsh-bench': ['*'],
  'dsh-modes': ['*'],
  'dsh-mission': ['*'],
  'dsh-creator-plus': ['*'],
  'dsh-content': ['lib/subject.js'],
};
/** Files guarded in every plugin. */
export const GUARDED_EVERYWHERE = ['cordis.patch.yml'];
/** @returns {boolean} whether a file of a plugin holds a safety rule (capitals ignored, as macOS does). */
export function guardedFile(folder, file) {
  const name = String(file ?? '').replace(/^\.\//, '').toLowerCase();
  const list = (GUARDED_FILES[folder] ?? []).map((entry) => entry.toLowerCase());
  return list.includes('*') || list.includes(name) || GUARDED_EVERYWHERE.includes(name.split('/').pop());
}
/** Chat-box seats: the chat box keeps its three controls (Web access, Depth, the model selector). */
const CHAT_BOX = /^conversation\.input\./;

/**
 * Check a plan against the map.
 * @param {object} plan - what the plugin will add and touch: `name`, `folder`, `tools`, `commands`, `routes`,
 *   `slots` ([{name, id}]), `services`, `settings`, `storage`, `rows`, `modes` (tabs it appears in), `instructionChars`,
 *   `before` (rows it must load before), `changes` ([{plugin, files}]), `loosens` (safety rule ids), `givesTools` ({mode: [tools]}).
 * @param {object} map - lib/map.js.
 * @returns {{result: 'clear' | 'decision' | 'blocked', findings: {level: 'blocked' | 'decision', text: string}[]}} the outcome.
 */
export function fitCheck(plan, map) {
  const findings = [];
  const block = (text) => findings.push({ level: 'blocked', text });
  const ask = (text) => findings.push({ level: 'decision', text });
  const self = String(plan?.name ?? '');
  // A new plugin never takes a name that is already on the map: installing it would replace that plugin, and removing it would remove that one.
  if (self && (map?.plugins ?? []).some((plugin) => plugin.name === self)) block(`The name "${self}" is already a plugin on the map: a new plugin with it would replace that one. Pick another name.`);
  const others = (owners) => (owners ?? []).filter((owner) => owner !== self);
  const index = map?.index ?? {};
  const twice = (kind, list, label, level = 'blocked', key = (item) => item) => {
    for (const item of list ?? []) {
      const who = others(index[kind]?.[key(item)]);
      if (who.length > 0) (level === 'blocked' ? block : ask)(`The ${label} "${key(item)}" is already used by ${who.join(', ')}.`);
    }
  };
  twice('commands', plan.commands, 'command');
  twice('tools', plan.tools, 'tool name');
  twice('routes', plan.routes, 'page address');
  twice('slots', plan.slots, 'place in the interface', 'blocked', (slot) => `${slot.name}#${slot.id}`);
  twice('services', plan.services, 'service');
  twice('settings', plan.settings, 'settings name');
  twice('rows', plan.rows, 'setup row');
  twice('storage', plan.storage, 'storage folder', 'decision');
  twice('modes', plan.modes?.filter((mode) => plan.newModes?.includes(mode)), 'mode');
  // A tool name the app already has (a built-in one).
  for (const tool of plan.tools ?? []) if ((map?.tools ?? []).includes(tool) && !others(index.tools?.[tool]).length && !(index.tools?.[tool] ?? []).includes(self)) block(`The tool name "${tool}" is already one of the app's own tools.`);
  // The chat box keeps its three controls.
  for (const slot of plan.slots ?? []) if (CHAT_BOX.test(slot.name)) ask(`It adds "${slot.id}" to the chat box (${slot.name}). The chat box keeps its three controls (Web access, Depth, the model selector); anything else there needs your yes.`);
  // Order: loading before other rows changes the order plugins run in.
  if ((plan.before ?? []).length > 0) ask(`It must run before ${plan.before.join(', ')}, which changes the order plugins run in.`);
  // Instruction text: every plugin's words cost a small model room.
  const chars = Number(plan.instructionChars ?? 0);
  if (chars > PLUGIN_TEXT_BUDGET) ask(`It adds ${chars} characters to a model's instructions; the budget per plugin is ${PLUGIN_TEXT_BUDGET}, so a small model loses room.`);
  if (chars > MODE_TEXT_BUDGET) block(`Its method is ${chars} characters, over the ${MODE_TEXT_BUDGET} a mode may have.`);
  // Safety rules of other modes: blocked, never asked.
  const isolated = new Set((map?.modes ?? []).filter((mode) => mode.isolated).map((mode) => mode.id));
  for (const mode of plan.modes ?? []) if (isolated.has(mode)) block(`It would appear in "${mode}", a sealed mode: no plugin hands a sealed mode a tool or a control.`);
  for (const [mode, tools] of Object.entries(plan.givesTools ?? {})) if (isolated.has(mode) && (tools ?? []).length > 0) block(`It would give the sealed mode "${mode}" the tools ${tools.join(', ')}.`);
  for (const id of plan.loosens ?? []) {
    const rule = SAFETY.find((entry) => entry.id === id);
    block(`It would loosen a safety rule of another mode: ${rule ? rule.plain : id}.`);
  }
  for (const change of plan.changes ?? []) {
    const plugin = (map?.plugins ?? []).find((entry) => entry.name === change.plugin || entry.folder === change.plugin || entry.id === change.plugin);
    if (!plugin) {
      block(`It would change "${change.plugin}", which is not in the map.`);
      continue;
    }
    if (plugin.locked) block(`It would change ${plugin.name}, a ${plugin.origin === 'built-in' ? 'built-in' : 'third-party'} plugin. Those are never edited; an adapter beside it is built instead.`);
    const named = (change.files ?? []).map((file) => String(file).replace(/^\.\//, '').toLowerCase());
    const whole = (GUARDED_FILES[plugin.folder] ?? []).includes('*');
    if (whole && named.length === 0) named.push('(any file)');
    const hit = named.filter((file) => whole || guardedFile(plugin.folder, file));
    for (const file of hit) block(`It would change ${plugin.folder}/${file}, which holds a safety rule (${plugin.folder === 'dsh-recon' ? 'Recon\'s seal' : plugin.folder === 'dsh-bench' ? 'the Devices write gates' : file.endsWith('cordis.patch.yml') ? 'the plugin\'s setup' : 'a guard'}).`);
    if (!plugin.locked && hit.length === 0) ask(`It changes ${plugin.name} (${(change.files ?? []).join(', ') || 'files to be named'}): shown first, backed up, tested in the trial copy, done only with your yes.`);
  }
  const result = findings.some((finding) => finding.level === 'blocked') ? 'blocked' : findings.length > 0 ? 'decision' : 'clear';
  return { result, findings };
}

/** @returns {string} the outcome in plain words. */
export function fitText({ result, findings }) {
  const head = result === 'clear' ? 'Fit check: clear. Nothing collides.' : result === 'blocked' ? 'Fit check: BLOCKED. This plan cannot be built as it is:' : 'Fit check: needs your decision:';
  return [head, ...findings.map((finding) => `- ${finding.level === 'blocked' ? 'Blocked' : 'Decide'}: ${finding.text}`)].join('\n');
}

/** Every code file of a plugin, in any folder but its modules and its tests, never through a link. */
function allCode(dir, rel = '', out = [], depth = 0) {
  let entries = [];
  try {
    entries = readdirSync(join(dir, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = rel ? `${rel}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink() || out.length >= 400) continue;
    if (entry.isDirectory()) {
      if (depth < 6 && !['node_modules', 'test', 'passport', '.git'].includes(entry.name)) allCode(dir, path, out, depth + 1);
    } else if (/\.(m?js|cjs|ts|json)$/.test(entry.name) && entry.name !== 'package-lock.json') out.push(path);
  }
  return out;
}

/**
 * What a built plugin's own code says it does that could weaken another tab's safety rules, read from its
 * files (not from what a model declares): writing another plugin's settings or the Modes add-on's (a mode
 * plugin may add its own tab, as a decision), naming a sealed tab, hooking every tool call, and a setup file
 * that does more than insert its own rows. A heuristic over the code: what it cannot tell is refused.
 * @param {string} dir - the plugin's folder.
 * @param {object} map - the map.
 * @param {{kind?: string, name?: string, own?: string[]}} [plan] - its kind, its package name, its own settings names.
 * @returns {{level: 'blocked' | 'decision', text: string}[]} the findings.
 */
export function codeFindings(dir, map, { kind = '', name = '', own = [] } = {}) {
  const findings = [];
  const block = (text) => findings.push({ level: 'blocked', text });
  const ask = (text) => findings.push({ level: 'decision', text });
  const texts = {};
  for (const file of allCode(dir)) {
    try {
      texts[file] = lstatSync(join(dir, file)).size > 2_000_000 ? '' : readFileSync(join(dir, file), 'utf8');
    } catch {
      texts[file] = '';
    }
  }
  const code = Object.values(texts).join('\n');
  const consts = Object.fromEntries([...code.matchAll(/const ([A-Za-z_$][\w$]*)\s*=\s*['"`]([\w-]+)['"`]/g)].map((found) => [found[1], found[2]]));
  const mine = new Set(own);
  const owners = map?.index?.settings ?? {};
  const wrote = new Set();
  for (const found of code.matchAll(/\.mutate\(\s*(?:(['"`])([\w-]+)\1|([A-Za-z_$][\w$]*))\s*,/g)) {
    const ns = found[2] ?? consts[found[3]];
    if (!ns) {
      block(`It writes settings it names only while running (mutate(${found[3]}, …)): what it would change cannot be checked.`);
      continue;
    }
    if (mine.has(ns) || wrote.has(ns)) continue;
    wrote.add(ns);
    if (ns === 'modes') {
      if (kind === 'mode') ask('It adds its own mode through the Modes add-on\'s settings (extraModes).');
      else block('It writes the Modes add-on\'s settings, which hold every mode\'s tools and seals.');
    } else block(`It writes the settings "${ns}"${owners[ns]?.length ? `, which belong to ${owners[ns].join(', ')}` : ', which are not its own'}.`);
  }
  if (/path\s*:\s*\[\s*['"`](modes|sessionModes|scheduledMode)['"`]/.test(code)) block('It changes the Modes add-on\'s table of modes or which mode a thread is in.');
  if (kind !== 'mode' && /['"`]extraModes['"`]/.test(code)) block('It touches the Modes add-on\'s extra modes, but it is not a mode.');
  for (const mode of (map?.modes ?? []).filter((entry) => entry.isolated)) {
    if (new RegExp(`(['"\`])${mode.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\1`).test(code)) block(`It names the sealed mode "${mode.id}": no plugin hands a sealed mode a tool or reads it.`);
  }
  if (/['"`]tools\/(pre|post)-execute['"`]/.test(code) || /\btools\??\.guard\??\.?\(/.test(code)) block('It hooks every tool call (tools/pre-execute or a tool guard), which could let through what another mode refuses.');
  // Package scripts would run the plugin's own code during an install (the trial copy's and the app's).
  try {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    if (pkg?.scripts && typeof pkg.scripts === 'object' && Object.keys(pkg.scripts).length > 0) block(`Its package.json has scripts (${Object.keys(pkg.scripts).slice(0, 5).join(', ')}), which would run its code during an install.`);
  } catch {
    /* no package.json: the load check says so */
  }
  let patch = '';
  try {
    patch = readFileSync(join(dir, 'cordis.patch.yml'), 'utf8');
  } catch {
    patch = '';
  }
  const read = patchRows(patch);
  for (const problem of read.problems) block(`Its setup file: ${problem}.`);
  for (const row of read.rows) if (name && row.name && row.name !== name) block(`Its setup file adds the row ${row.id} for "${row.name}", not for itself.`);
  return findings;
}
