// The owner's rule (18 November 2026): every mode has the same buttons at the bottom of the chat box, in the
// same order, with the same look and words. A mode's own buttons live in its gear; status signs (route badge,
// Scratch mark) stay. These tests read every add-on's chat-box code, so a new mode-only button cannot slip in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const addons = fileURLToPath(new URL('../../', import.meta.url));
const clientOf = (name) => readFileSync(join(addons, name, 'client.js'), 'utf8');

/** Every [slot, id, add-on] registered in the chat box's bottom row, across all add-ons. */
function rowEntries() {
  const out = [];
  for (const name of readdirSync(addons)) {
    const file = join(addons, name, 'client.js');
    if (!existsSync(file)) continue;
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/name:\s*'conversation\.input\.(left|right)',\s*id:\s*'([^']+)'/g)) out.push([match[1], match[2], name]);
  }
  return out;
}

// The same in every mode: the core buttons (Modes), Run (Mission), Export and the gear (this add-on), the activity
// signs and the model button. Status, not a choice: the route badge and the Scratch mark.
const SAME_EVERYWHERE = ['mode-select', 'mode-toggles', 'activity', 'mission-run-button', 'plus-export', 'plus-mode-gear', 'model-tier'];
const STATUS = ['route-health-badge', 'cowork-scratch-mark'];
// A choice only one mode has and needs per conversation (the owner's rules of 18 November 2026): hidden in the box and
// shown UNDER it, in the one options area every mode shares (dsh-cowork-shell's OptionsArea), in that mode only. Its
// in-box button stays for the switch-off layout.
const STRIPS = {
  'creator-plus-bar': ['dsh-creator-plus', 'creator-plus-strip', '.dsh-cp-ctl', 'creator-plus'],
  'finance-selection': ['dsh-finance', 'finance-strip', '.dsh-fn-ctls', 'finance'],
};

test('every button in the chat box row is either the same in every mode, a status sign, or lives in the gear', () => {
  const client = clientOf('dsh-settings-plus');
  const hosted = JSON.parse(client.match(/const HOSTED = (\[[^\]]*\]);/)[1].replace(/'/g, '"'));
  const entries = rowEntries();
  assert.ok(entries.length >= 10, `found ${entries.length} chat box entries`);
  const strays = entries.filter(([, id]) => !SAME_EVERYWHERE.includes(id) && !STATUS.includes(id) && !hosted.includes(id) && !STRIPS[id]);
  assert.deepEqual(strays, [], 'a mode-only button in the chat box row must be listed in the gear (HOSTED in dsh-settings-plus/client.js) or be a strip above the box');
  // Bench gets no exception: Bench rules are in the gear like the other modes' own buttons.
  for (const id of ['bench-rules', 'recon-export']) assert.ok(hosted.includes(id), id);
  // A strip is in one place only: not also in the gear.
  for (const [id, [owner, dock, cls, mode]] of Object.entries(STRIPS)) {
    assert.ok(!hosted.includes(id), `${id}: under the box, not in the gear`);
    const text = clientOf(owner);
    assert.match(text, new RegExp(`name: 'conversation\\.input\\.dock', id: '${dock}'`), `${owner} draws its area in a started conversation (${dock})`);
    assert.match(text, /window\.__dshOptionsArea/, `${owner} uses the one shared options area`);
    assert.ok(text.includes(`mode: '${mode}', place:`), `${owner}: its area belongs to its own tab`);
    assert.ok(client.match(/\[data-slot="conversation\.input\.left"\] :is\(([^)]*)\) \{ display: none !important; \}/)[1].includes(cls), `${id}: hidden in the box`);
  }
  // Research's Focus left the chat box altogether (the Web selector's ticks, 18 November 2026): no slot, nothing to host.
  assert.ok(!hosted.includes('research-controls'));
  assert.ok(!entries.some(([, id]) => id === 'research-controls'), 'Research registers nothing in the row');
  // Each hosted button is hidden in the box by its own class while it lives in the gear (one rule for all).
  const hide = client.match(/\[data-slot="conversation\.input\.left"\] :is\(([^)]*)\) \{ display: none !important; \}/);
  assert.ok(hide, 'one rule hides the mode buttons in the box');
  const classes = { 'bench-rules': ['dsh-bench', '.dsh-bn-ctl'], 'creator-plus-bar': ['dsh-creator-plus', '.dsh-cp-ctl'], 'finance-selection': ['dsh-finance', '.dsh-fn-ctls'], 'recon-export': ['dsh-recon', '.dsh-rc-ctl'] };
  for (const id of hosted) {
    const [owner, cls] = classes[id];
    assert.ok(hide[1].includes(cls), `${id}: ${cls} hidden in the box`);
    assert.ok(clientOf(owner).includes(cls.slice(1)), `${owner} still draws ${cls}`);
  }
});

test('the row\'s words follow the box\'s width alone: the parts that differ per conversation are measured at one width', () => {
  const modes = clientOf('dsh-modes');
  // Measured with the attribute on, always taken off again.
  const start = modes.indexOf('const fitUniform = () => {');
  const body = modes.slice(start, modes.indexOf('const measureUniform', start));
  assert.match(body, /row\.setAttribute\('data-dsh-measure', ''\);\s*try \{\s*measureUniform\(\);\s*\} finally \{\s*row\.removeAttribute\('data-dsh-measure'\);/);
  // A refit (Tools switched, a Depth picked) first takes off the second-line marks of the last fit, or the left
  // group (made a wrapping row by them) is taken for the row and the core buttons drop to a line of their own.
  const effect = modes.slice(modes.indexOf('useLayoutEffect(() => {\n        const el = root.current;'));
  const clear = effect.indexOf("el.parentElement?.parentElement?.removeAttribute('data-dsh-below');");
  assert.ok(clear > 0 && clear < effect.indexOf('let row = el.parentElement;'), 'marks cleared before the row is looked for');
  assert.ok(effect.indexOf("el.parentElement?.parentElement?.removeAttribute('data-dsh-wrap');") < effect.indexOf('let row = el.parentElement;'));
  // One width each while measuring; the real part is never wider (the same number as its cap).
  const ref = (re) => Number(modes.match(re)?.[1]);
  // The model button (its name differs per mode) has one width in every mode.
  assert.match(modes, /html\[data-dsh-uniform="true"\] \.dsh-mc-trigger\{width:(\d+)px;max-width:\1px;box-sizing:border-box\}/, 'model button: one width');
  const lvl = modes.match(/\[data-dsh-measure\] \.dsh-mt:not\(\[data-f1\]\) \.lvl\{display:inline-block !important;width:([\d.]+em) !important\}/)?.[1];
  assert.ok(lvl, 'the Web and Depth values');
  assert.ok(modes.includes(`html[data-dsh-uniform="true"] .dsh-mt .lvl{max-width:${lvl};overflow:hidden;text-overflow:ellipsis}`), 'values: measured at their cap');
  assert.match(modes, /\[data-dsh-measure\] \.dsh-mt:not\(\[data-f1\]\) button\[data-helpers\] \.lbl\{display:inline-block;min-width:[\d.]+em\}/, 'One model / 2 models');
  assert.match(modes, /\[data-dsh-measure\] \.dsh-mt:not\(\[data-f2\]\) button\[data-tools\] \.lbl\{display:inline-block;min-width:[\d.]+em\}/, 'Tools on / off');
  // Run: "Run" and "Running" have one width (that of "Running").
  const run = ref(/html\[data-dsh-uniform="true"\] \.dsh-ms-runbtn\{min-width:(\d+)px;box-sizing:border-box;justify-content:center\}/);
  assert.ok(run >= 80, 'Run as wide as "Running"');
  // The classes measured are the ones the owners draw.
  assert.ok(clientOf('dsh-model-tiers').includes("className: 'dsh-mc-trigger'"));
  assert.ok(clientOf('dsh-mission').includes("className: 'dsh-ms-runbtn'"));
  assert.match(modes, /'data-helpers': many \? 'many' : 'one'/);
  assert.match(modes, /'data-tools': none \? 'off' : 'on'/);
});

test('the same buttons whatever the conversation\'s state: Depth stays (greyed) with Tools off, Run stays (greyed) where a run cannot start', () => {
  const modes = clientOf('dsh-modes');
  assert.match(modes, /off && !uniform \? null : h\(DepthButton, \{\s*t, depth: sessionDepthNow, kind: depthKind\(modeDef\), busy: state\.busy, disabled: off,/);
  assert.match(modes, /disabled: busy \|\| disabled, 'data-depth': depth/);
  const mission = clientOf('dsh-mission');
  const start = mission.indexOf('function RunButton(');
  const body = mission.slice(start, mission.indexOf('const live = card.run', start));
  // Hidden only when Mission is off (then in every mode alike) or the Same chat box switch is off (as before).
  assert.match(body, /if \(off \|\| !uniform\) return null;/);
  assert.match(body, /getAttribute\('data-dsh-uniform'\) === 'true'/);
  assert.match(body, /setOff\(\/switched off\/i\.test/);
  assert.match(body, /disabled: true, title: why/);
  // The same word, icon and class as the live button.
  assert.equal((body.match(/className: 'dsh-ms-runbtn'/g) ?? []).length, 1);
  assert.match(body, /'Run'\)\);/);
});

test('a mode\'s own button never lingers on another tab: forgotten when the conversation changes, hidden on another sidebar tab', () => {
  const bench = clientOf('dsh-bench');
  assert.match(bench, /setView\(null\);\s*setOpen\(false\);\s*const tick = async/);
  assert.match(bench, /if \(otherTab\('bench'\)\) return null;/);
  const creator = clientOf('dsh-creator-plus');
  assert.match(creator, /setView\(null\);\s*setState\(null\);\s*setOpen\(false\);/);
  assert.match(creator, /if \(otherTab\('creator-plus'\)\) return null;/);
  const recon = clientOf('dsh-recon');
  assert.match(recon, /setRecon\(false\);\s*setOpen\(false\);\s*if \(!sessionId\) return undefined;/);
  assert.match(recon, /if \(!recon \|\| otherTab\) return h\('style', null, DOOR_CSS\);/);
  // The sidebar's selected tab is the mode the check compares with.
  assert.match(clientOf('dsh-cowork-shell'), /root\.setAttribute\('data-cws-tab', selected\.id\)/);
});

test('one Export: in a Recon conversation the shared Export button opens Recon\'s own export window', () => {
  const client = clientOf('dsh-settings-plus');
  const button = client.slice(client.indexOf('function ExportButton('), client.indexOf('return {', client.indexOf('function ExportButton(')));
  assert.match(button, /document\.querySelector\('\[data-slot="conversation\.input\.left"\] \.dsh-rc-ctl'\) \? 'recon' : 'shared'/);
  assert.match(button, /open === 'recon' \? h\(ReconExportHolder/);
  assert.match(client, /window\.dispatchEvent\(new CustomEvent\('dsh-split-plus:recon-export', \{ detail: \{ sessionId \} \}\)\)/);
  // Recon's door listens for that event (its own choices, its own route); the shared route still refuses Recon.
  assert.match(clientOf('dsh-recon'), /window\.addEventListener\('dsh-split-plus:recon-export', onAsk\)/);
  // While the shared button is on, Recon's Export… is not also in the gear.
  assert.match(client, /h\(HostedControls, \{ appCtx, sessionId, skip: exportOn \? \['recon-export'\] : \[\] \}\)/);
  assert.match(client, /exportOn: flags\.exportOn \}\) : null\);/);
});

test('one options area for every mode: under the chat box, the same place and look on the start page and in a conversation', () => {
  const shell = clientOf('dsh-cowork-shell');
  assert.match(shell, /window\.__dshOptionsArea = OptionsArea;/);
  // Start page: right under the box; a conversation: after the box (order 2 in the composer's column), only while the
  // modes' own buttons have left the box, and never on a start page.
  assert.match(shell, /\.dsh-opt-area\[data-place="start"\] \{ position: absolute; top: 100%;/);
  assert.match(shell, /\.dsh-opt-area\[data-place="chat"\] \{ order: 2;/);
  assert.match(shell, /html:not\(\[data-dsh-uniform="true"\]\[data-dsh-gear="on"\]\[data-dsh-extras="on"\]\) \.dsh-opt-area\[data-place="chat"\] \{ display: none !important; \}/);
  assert.match(shell, /const showing = tab === mode && !\(place === 'chat' && onStart\);/);
  for (const cls of ['dsh-opt-pick', 'dsh-opt-chip', 'dsh-opt-break', 'dsh-opt-hint']) assert.ok(shell.includes(`.${cls}`), cls);
  // Every mode with options uses it, with the shared classes and no look of its own.
  const users = { 'dsh-scout': ['scout', ['start']], 'dsh-finance': ['finance', ['start', 'chat']], 'dsh-creator-plus': ['creator-plus', ['start', 'chat']] };
  for (const [owner, [mode, places]] of Object.entries(users)) {
    const text = clientOf(owner);
    assert.match(text, /window\.__dshOptionsArea/, owner);
    assert.ok(text.includes(`mode: '${mode}'`), `${owner}: ${mode}`);
    for (const place of places) assert.ok(text.includes(`place: '${place}'`) || text.includes(`'${place}'`), `${owner}: ${place}`);
    assert.match(text, /className: 'dsh-opt-pick'/, `${owner} draws its fields with the shared look`);
    assert.match(text, /className: 'dsh-opt-hint'/, `${owner} has the shared summary line`);
  }
  assert.doesNotMatch(clientOf('dsh-scout'), /className: 'dsh-sc-(pick|chip|hint|bar)'/, 'Scout has no look of its own left');
  assert.doesNotMatch(clientOf('dsh-creator-plus'), /dsh-cp-strip|dsh-cp-pick/, 'the strip above the box is gone');
});
