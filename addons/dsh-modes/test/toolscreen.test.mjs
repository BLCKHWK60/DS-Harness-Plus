// The Tool access screens' page logic (Settings → Tool access, the chat-box Tools panel): the plain functions between the
// ta-logic lines of client.js, run as they are, with a grid of the same shape the service (lib/toolaccess.js) gives.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createToolAccess, catalogueText } from '../lib/toolaccess.js';
import { GROUPS, UNSORTED_GROUP } from '../lib/catalog.js';

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
const from = source.indexOf('// ---- ta-logic:begin ----');
const to = source.indexOf('// ---- ta-logic:end ----');
assert.ok(from > 0 && to > from, 'the logic block is in client.js');
const names = ['tgNextState', 'tgCellChange', 'tgToolChange', 'tgChip', 'tgSections', 'tgAiPreview', 'tgWhen', 'tgPlainOf', 'tgGrantSections', 'tgEventText', 'tgHistoryFilter', 'tgRecords', 'tgCanAllowWaiting', 'tgPanelSections', 'tgAskGroups', 'TG_GROUP_LABELS', 'tgClick', 'tgSwitchOnQuestion', 'tgRestorePlan', 'tgPanelMerge', 'tgCatalogueText', 'tgConvoLabel', 'tgTabLabel', 'tgSettingsOnly', 'tgRiskWord', 'TG_SETTINGS_WHY', 'tgToolOnQuestion', 'tgStartMixQuestion', 'tgUndoMisses', 'tgPanelView'];
const logic = new Function(`${source.slice(from, to)}\nreturn { ${names.join(', ')} };`)();

const grid = () => ({
  modes: [{ id: 'code', label: 'Code', locked: false }, { id: 'recon', label: 'Recon', locked: true }],
  groups: [{ id: 'run', label: 'Run commands', about: 'x' }, { id: 'unsorted', label: 'Not sorted', about: 'y' }],
  cells: { code: { run: { state: 'on', count: 2, chosen: null }, unsorted: { state: 'ask', count: 0, chosen: null } }, recon: { run: { state: 'locked', count: 0, chosen: null }, unsorted: { state: 'locked', count: 0, chosen: null } } },
  summary: {},
});

test('a click goes On, Ask, Off, On; nothing unknown ever jumps to On', () => {
  assert.deepEqual(['on', 'ask', 'off', 'mixed'].map(logic.tgNextState), ['ask', 'off', 'on', 'ask']);
});

test('a cell change is applied to a copy and the old grid is untouched', () => {
  const before = grid();
  const out = logic.tgCellChange(before, 'code', 'run', 'off');
  assert.equal(out.ok, true);
  assert.equal(out.grid.cells.code.run.state, 'off');
  assert.equal(out.grid.cells.code.run.chosen, 'off');
  assert.equal(before.cells.code.run.state, 'on');
  assert.equal(out.grid.cells.code.unsorted.state, 'ask');
});

test('a Locked tab refuses a change, with a plain sentence and no new grid', () => {
  const out = logic.tgCellChange(grid(), 'recon', 'run', 'on');
  assert.equal(out.ok, false);
  assert.match(out.why, /Recon has its own safety rules/);
  assert.equal(out.grid, undefined);
});

test('a state that is not On, Ask or Off, and a tab or group that is gone, are refused', () => {
  assert.equal(logic.tgCellChange(grid(), 'code', 'run', 'locked').ok, false);
  assert.equal(logic.tgCellChange(grid(), 'nope', 'run', 'on').ok, false);
  assert.equal(logic.tgCellChange(grid(), 'code', 'nope', 'on').ok, false);
});

test('the chip says its word, whether it can change, and why a padlock is there', () => {
  const g = grid();
  assert.deepEqual([logic.tgChip(g, 'code', 'run').word, logic.tgChip(g, 'code', 'run').change], ['On', true]);
  assert.match(logic.tgChip(g, 'code', 'run').title, /Click to change it to Ask/);
  const locked = logic.tgChip(g, 'recon', 'run');
  assert.equal(locked.change, false);
  assert.equal(locked.word, 'Locked');
  assert.match(locked.title, /own safety rules/);
  g.cells.code.run.state = 'mixed';
  assert.match(logic.tgChip(g, 'code', 'run').title, /set one by one/);
});

const rows = () => [
  { name: 'bash', plain: 'Run commands in Terminal', purpose: 'Runs programs.', addon: '', group: 'run', groupLabel: 'Run commands', tier: 3, risk: 'High', state: 'on' },
  { name: 'new_tool', plain: 'new_tool', purpose: 'A tool nobody has sorted yet.', addon: '', group: 'unsorted', groupLabel: 'Not sorted', tier: 3, risk: 'High', state: 'ask' },
  { name: 'recon_x', plain: 'Recon tool', purpose: 'p', addon: 'dsh-recon', group: 'read', groupLabel: 'Read files', tier: 4, risk: 'Never', state: 'off' },
  { name: 'todo', plain: 'To-do list', purpose: 'Keeps a step list.', addon: '', group: 'schedule', groupLabel: 'Schedule and remember', tier: 0, risk: 'Look', state: 'on' },
];

test('a tool change: Ask is refused for a tool that can never be requested; a locked tab refuses everything', () => {
  assert.equal(logic.tgToolChange(rows(), 'recon_x', 'ask').ok, false);
  assert.match(logic.tgToolChange(rows(), 'recon_x', 'ask').why, /Only you can switch this tool on/);
  const ok = logic.tgToolChange(rows(), 'bash', 'ask');
  assert.equal(ok.ok, true);
  assert.equal(ok.rows.find((r) => r.name === 'bash').state, 'ask');
  const lockedRows = rows().map((r) => ({ ...r, state: 'locked' }));
  assert.equal(logic.tgToolChange(lockedRows, 'bash', 'on').ok, false);
  assert.equal(logic.tgToolChange(rows(), 'gone', 'on').ok, false);
});

test('the tool list puts "Not sorted" first and searches name, raw name and purpose', () => {
  const all = logic.tgSections(rows());
  assert.equal(all[0].group, 'unsorted');
  assert.equal(all.reduce((n, s) => n + s.rows.length, 0), 4);
  assert.deepEqual(logic.tgSections(rows(), 'terminal').map((s) => s.rows.map((r) => r.name)), [['bash']]);
  assert.deepEqual(logic.tgSections(rows(), 'STEP LIST').flatMap((s) => s.rows.map((r) => r.name)), ['todo']);
  assert.deepEqual(logic.tgSections(rows(), 'zzz'), []);
});

test('what the AI sees leaves out Off tools and says how each one is had', () => {
  const sees = logic.tgAiPreview(rows());
  assert.deepEqual(sees.map((r) => [r.name, r.status]), [['bash', 'available now'], ['new_tool', 'can be requested'], ['todo', 'available now']]);
  assert.equal(logic.tgAiPreview(rows().map((r) => ({ ...r, state: 'locked' })))[0].status, 'fixed by this tab');
});

test('permissions are sorted into this conversation, this tab and always, and the blocks are listed apart', () => {
  const now = Date.now();
  const data = {
    grants: [
      { id: 'a', tool: 'bash', scope: 'conversation', sessionId: 'sess-1234', createdAt: now - 120000, expiresAt: now + 86400000 },
      { id: 'b', tool: 'todo', scope: 'mode', modeId: 'code', createdAt: now },
      { id: 'c', tool: 'pdf_read', scope: 'always', createdAt: now },
      { id: 'd', tool: 'bash', scope: 'once', sessionId: 'sess-9', createdAt: now },
    ],
    blocks: [{ id: 'e', tool: 'write', modeId: 'chat', createdAt: now }],
  };
  const out = logic.tgGrantSections(data, { plainOf: (n) => `plain ${n}`, modeLabel: (id) => id.toUpperCase(), now });
  assert.deepEqual(out.sections.map((s) => [s.id, s.items.length]), [['conversation', 2], ['mode', 1], ['always', 1], ['never', 1]]);
  assert.equal(out.total, 5);
  assert.equal(out.sections[0].items[0].plain, 'plain bash');
  assert.equal(out.sections[0].items[0].where, '…1234');
  assert.match(logic.tgGrantSections(data, { convoLabel: (id) => `Chat about ${id}` }).sections[0].items[0].where, /^Chat about sess-1234$/);
  assert.match(out.sections[0].items[1].where, /next use only/);
  assert.equal(out.sections[1].items[0].where, 'In CODE');
  assert.equal(out.sections[3].items[0].block, true);
  assert.equal(logic.tgGrantSections({}).total, 0);
});

test('the record reads in plain words and filters by kind, words and conversation', () => {
  const events = [
    { t: 5, type: 'allowed', tool: 'bash', choice: 'conversation', sessionId: 's1', modeId: 'code' },
    { t: 4, type: 'asked', tool: 'bash', sessionId: 's1', modeId: 'code', reason: 'to run the tests' },
    { t: 3, type: 'denied', tool: 'write', choice: 'deny', sessionId: 's2', modeId: 'chat' },
    { t: 2, type: 'waiting', tool: 'bash', unattended: true, id: 'w1', tier: 3 },
    { t: 1, type: 'revoked-all', reason: '4 removed' },
  ];
  const plainOf = (n) => (n === 'bash' ? 'Run commands in Terminal' : n);
  assert.equal(logic.tgEventText(events[0], plainOf), 'Allowed: Run commands in Terminal (for the conversation)');
  assert.match(logic.tgEventText(events[3], plainOf), /Not answered: Run commands in Terminal · nobody was there to answer/);
  assert.equal(logic.tgEventText(events[4], plainOf), 'Everything revoked: 4 removed');
  assert.equal(logic.tgHistoryFilter(events, { kind: 'allowed' }, plainOf).length, 1);
  assert.equal(logic.tgHistoryFilter(events, { kind: 'other' }, plainOf).length, 2);
  assert.equal(logic.tgHistoryFilter(events, { search: 'terminal' }, plainOf).length, 3);
  assert.equal(logic.tgHistoryFilter(events, { search: 'run the tests' }, plainOf).length, 1);
  assert.equal(logic.tgHistoryFilter(events, { sessionId: 's2' }, plainOf).length, 1);
  assert.deepEqual(logic.tgRecords(events).map((r) => [r.sessionId, r.asked, r.allowed, r.denied]), [['s1', 1, 1, 0], ['s2', 0, 0, 1]]);
});

test('only a request at the lowest three risk levels can be allowed for next time', () => {
  assert.equal(logic.tgCanAllowWaiting({ tool: 'todo', tier: 0 }), true);
  assert.equal(logic.tgCanAllowWaiting({ tool: 'write', tier: 2 }), true);
  assert.equal(logic.tgCanAllowWaiting({ tool: 'bash', tier: 3 }), false);
  assert.equal(logic.tgCanAllowWaiting({ tool: 'x' }), false);
});

test('the chat-box panel shows only the permissions that apply here, each with its id to revoke', () => {
  const catalogue = [
    { name: 'read', plain: 'Read', status: 'available now' },
    { name: 'bash', plain: 'Run commands', purpose: 'p', risk: 'High', status: 'can be requested' },
    { name: 'pdf_read', plain: 'Read a PDF', status: 'can be requested' },
  ];
  const grants = { grants: [
    { id: 'g1', tool: 'bash', scope: 'conversation', sessionId: 'here' },
    { id: 'g2', tool: 'bash', scope: 'conversation', sessionId: 'elsewhere' },
    { id: 'g3', tool: 'pdf_read', scope: 'mode', modeId: 'code' },
    { id: 'g4', tool: 'pdf_read', scope: 'mode', modeId: 'chat' },
    { id: 'g5', tool: 'read', scope: 'always' },
  ] };
  const out = logic.tgPanelSections(catalogue, grants, { sessionId: 'here', modeId: 'code' });
  assert.deepEqual(out.now.map((r) => r.name), ['read']);
  assert.deepEqual(out.ask.map((r) => r.name), ['bash', 'pdf_read']);
  assert.deepEqual(out.allowed.map((a) => [a.id, a.scope]), [['g1', 'this conversation'], ['g3', 'in this tab'], ['g5', 'always']]);
});

test('"2 minutes ago" and friends', () => {
  const now = 1_000_000_000_000;
  assert.equal(logic.tgWhen(now - 5000, now), 'just now');
  assert.equal(logic.tgWhen(now - 120000, now), '2 minutes ago');
  assert.equal(logic.tgWhen(now - 3600000, now), '1 hour ago');
  assert.equal(logic.tgWhen(now - 100000000, now), 'yesterday');
  assert.equal(logic.tgWhen(undefined, now), '');
});

// The functions above are checked on their own; this one checks them against the real service, so a grid the service
// gives is a grid the page can use, and a Locked tab really refuses in both places.
test('against the real service: its grid works with the page logic, and a Locked tab refuses on both sides', async () => {
  let stored = '{}';
  const modes = [{ id: 'code', label: 'Code' }, { id: 'recon', label: 'Recon' }];
  const store = { isBlocked: () => false, log() {}, newId: () => 'x', grants: () => [], blocks: () => [] };
  const service = createToolAccess({
    store, modes: () => modes, modeOf: () => modes[0], known: () => ['bash', 'read'], knownAll: () => ['bash', 'read'], baseOffered: () => ['bash', 'read'],
    readAccess: () => stored, writeAccess: async (text) => { stored = text; },
  });
  const g = service.grid();
  assert.equal(g.modes.find((m) => m.id === 'recon').locked, true);
  assert.equal(logic.tgChip(g, 'recon', 'run').state, 'locked');
  // Code offers bash today but not the other command tools, so the group starts mixed; with no choice made yet a click starts at Ask, never On.
  // Nothing was chosen tool by tool, so the cell is the tab's own starting mix: shown as "Default", never "Mixed", and the click asks first.
  assert.equal(g.cells.code.run.state, 'mixed');
  assert.equal(g.cells.code.run.custom, 0);
  assert.equal(logic.tgChip(g, 'code', 'run').state, 'default');
  assert.equal(logic.tgChip(g, 'code', 'run').word, 'Default');
  assert.equal(logic.tgClick(g, 'code', 'run').to, 'ask');
  assert.equal(logic.tgClick(g, 'code', 'run').startMix, true);
  assert.equal(logic.tgClick(g, 'code', 'run').wipes, false, 'nothing of the person\u2019s is replaced, so the page must not say so');
  assert.equal(logic.tgCellChange(g, 'recon', 'run', 'off').ok, false);
  await assert.rejects(() => service.setCell({ modeId: 'recon', groupId: 'run', state: 'off' }), /Locked/);
  const check = logic.tgCellChange(g, 'code', 'run', 'ask');
  assert.equal(check.ok, true);
  const after = await service.setCell({ modeId: 'code', groupId: 'run', state: 'ask' });
  assert.equal(after.cells.code.run.state, 'ask');
  assert.equal(after.cells.code.run.state, check.grid.cells.code.run.state);
  assert.equal(JSON.parse(stored).code.groups.run, 'ask');
  const toolRows = service.toolsOf('code');
  assert.equal(logic.tgToolChange(toolRows, 'bash', 'off').ok, true);
});

test('what the AI can ask for is counted by group, not listed tool by tool', () => {
  const ask = [
    { name: 'a', plain: 'Devices tool', group: 'devices' }, { name: 'b', plain: 'Devices tool', group: 'devices' },
    { name: 'c', plain: 'Run a program', group: 'run' }, { name: 'd', plain: 'Run a command in Terminal', group: 'run' }, { name: 'e', plain: 'x_unsorted', group: 'unsorted' },
  ];
  const out = logic.tgAskGroups(ask);
  assert.deepEqual(out.map((g) => [g.label, g.count]), [['Devices', 2], ['Run commands', 2], ['Not sorted', 1]]);
  assert.deepEqual(out[0].names, ['Devices tool']);
  assert.deepEqual(out[1].names, ['Run a program', 'Run a command in Terminal']);
});

test('the group names in the page are the ones the service uses', () => {
  for (const group of [...GROUPS, UNSORTED_GROUP]) assert.equal(logic.TG_GROUP_LABELS[group.id], group.label, group.id);
  assert.equal(Object.keys(logic.TG_GROUP_LABELS).length, GROUPS.length + 1);
});


const cellGrid = (state, chosen) => ({ modes: [{ id: 'code', label: 'Code', locked: false }, { id: 'recon', label: 'Recon', locked: true }], groups: [{ id: 'run', label: 'Run commands' }], cells: { code: { run: { state, chosen, count: 3 } }, recon: { run: { state: 'locked', chosen: null, count: 0 } } } });

test('a click on a mixed cell goes on from the last choice, and anything that ends On needs a question', () => {
  const click = (state, chosen) => logic.tgClick(cellGrid(state, chosen), 'code', 'run');
  assert.deepEqual(click('mixed', null), { kind: 'set', from: 'on', to: 'ask', confirm: false, wipes: true, startMix: false });
  assert.deepEqual(click('mixed', 'ask'), { kind: 'set', from: 'ask', to: 'off', confirm: false, wipes: true, startMix: false });
  assert.deepEqual(click('mixed', 'off'), { kind: 'set', from: 'off', to: 'on', confirm: true, wipes: true, startMix: false });
  assert.deepEqual(click('mixed', 'on'), { kind: 'set', from: 'on', to: 'ask', confirm: false, wipes: true, startMix: false });
  assert.deepEqual(click('off', 'off'), { kind: 'set', from: 'off', to: 'on', confirm: true, wipes: false, startMix: false }, 'Off to On always asks');
  assert.equal(click('on', 'on').confirm, false);
  const startMix = logic.tgClick({ ...cellGrid('mixed', null), cells: { code: { run: { state: 'mixed', chosen: null, count: 3, custom: 0 } } } }, 'code', 'run');
  assert.deepEqual(startMix, { kind: 'set', from: 'on', to: 'ask', confirm: false, wipes: false, startMix: true });
  const custom = logic.tgClick({ ...cellGrid('mixed', null), cells: { code: { run: { state: 'mixed', chosen: null, count: 3, custom: 1 } } } }, 'code', 'run');
  assert.deepEqual([custom.wipes, custom.startMix], [true, false], 'a cell with a tool-by-tool choice of the person\u2019s still says it replaces it');
  assert.equal(click('ask', null).to, 'off');
  // The only way to On is through a question: no state ever reaches On with confirm false.
  for (const state of ['on', 'ask', 'off', 'mixed']) for (const chosen of [null, 'on', 'ask', 'off']) { const one = click(state, chosen); assert.equal(one.to === 'on', one.confirm); }
  assert.equal(logic.tgClick(cellGrid('locked', null), 'recon', 'run').kind, 'blocked');
  assert.equal(logic.tgClick(cellGrid('on', null), 'gone', 'run').kind, 'blocked');
});

test('the question before On names what will be switched on', () => {
  const list = [
    { name: 'bash', plain: 'Run commands in Terminal', group: 'run', state: 'off', tier: 3 },
    { name: 'py', plain: 'Run Python', group: 'run', state: 'ask', tier: 3 },
    { name: 'already', plain: 'Already on', group: 'run', state: 'on', tier: 3 },
    { name: 'never', plain: 'Closed tool', group: 'run', state: 'off', tier: 4 },
    { name: 'other', plain: 'Other group', group: 'read', state: 'off', tier: 0 },
  ];
  const q = logic.tgSwitchOnQuestion(list, 'run', 'Run commands', 'Code');
  assert.equal(q.title, 'Switch on Run commands in Code?');
  assert.match(q.text, /2 tools in Code: Run commands in Terminal, Run Python\./);
  assert.ok(!/Closed tool|Already on|Other group/.test(q.text), 'only what changes, never a settings-only tool');
});

test('Undo puts every tool of a group back as it was, checked against the real service', async () => {
  let stored = JSON.stringify({ code: { groups: { run: 'ask' }, tools: { bash: 'on' } } });
  const modes = [{ id: 'code', label: 'Code' }];
  const names = ['bash', 'python', 'process'];
  const store = { isBlocked: () => false, log() {}, newId: () => 'x', grants: () => [], blocks: () => [] };
  const service = createToolAccess({ store, modes: () => modes, modeOf: () => modes[0], known: () => names, knownAll: () => names, baseOffered: () => [], readAccess: () => stored, writeAccess: async (text) => { stored = text; } });
  const inGroup = () => service.toolsOf('code').filter((row) => row.group === 'run').map((row) => [row.name, row.state]).sort();
  const g = service.grid();
  const cell = g.cells.code.run;
  assert.equal(cell.state, 'mixed');
  assert.equal(cell.chosen, 'ask');
  const before = inGroup();
  const plan = logic.tgClick(g, 'code', 'run');
  assert.deepEqual([plan.to, plan.wipes], ['off', true]);
  const restore = logic.tgRestorePlan(service.toolsOf('code'), 'run', cell.chosen);
  await service.setCell({ modeId: 'code', groupId: 'run', state: plan.to });
  assert.ok(inGroup().every(([, state]) => state === 'off'), 'the click replaced the tool-by-tool choices');
  await service.setCell({ modeId: 'code', groupId: 'run', state: restore.cell });
  for (const one of restore.tools) await service.setTool({ modeId: 'code', tool: one.tool, state: one.state });
  assert.deepEqual(inGroup(), before);
  assert.equal(service.grid().cells.code.run.state, 'mixed');
});

test('the Tools panel lists each tool once, in the one place that is true', () => {
  const list = { can: ['read', 'tools_catalog'], later: ['pdf_read', 'bash2'], cannot: ['bash', 'bash2', 'read', 'secret_x'], trimmed: true };
  const ask = [{ name: 'bash', plain: 'Run commands' }, { name: 'pdf_read', plain: 'Read a PDF' }, { name: 'read', plain: 'Read' }];
  const out = logic.tgPanelMerge(list, ask);
  assert.deepEqual(out.can, ['read', 'tools_catalog']);
  assert.deepEqual(out.ask.map((row) => row.name), ['bash'], 'a tool this tab loads as needed is not something to ask for');
  assert.deepEqual(out.later, ['pdf_read', 'bash2']);
  assert.deepEqual(out.cannot, ['secret_x']);
  const all = [...out.can, ...out.ask.map((r) => r.name), ...out.later, ...out.cannot];
  assert.equal(new Set(all).size, all.length, 'no tool twice');
});

test('"what the AI sees" is the very text the AI is given', () => {
  const rows = [
    { name: 'bash', plain: 'Run commands in Terminal', purpose: 'Runs programs.', group: 'run', risk: 'High', status: 'can be requested' },
    { name: 'read', plain: 'Read files', purpose: 'Reads.', group: 'read', risk: 'Look', status: 'available now' },
  ];
  assert.equal(logic.tgCatalogueText(rows), catalogueText(rows));
  assert.equal(logic.tgCatalogueText([]), catalogueText([]));
  const many = Array.from({ length: 120 }, (_, i) => ({ ...rows[0], name: `t${i}` }));
  assert.equal(logic.tgCatalogueText(many), catalogueText(many));
  assert.deepEqual(Object.keys(logic.TG_GROUP_LABELS).sort(), [...GROUPS, UNSORTED_GROUP].map((g) => g.id).sort());
});

test('conversations show by title and tabs by their label, never an id fragment', () => {
  assert.equal(logic.tgConvoLabel('abc-1234', { 'abc-1234': 'Plan the trip' }), 'Plan the trip');
  assert.equal(logic.tgConvoLabel('abc-1234', { 'abc-1234': 'x'.repeat(200) }).length, 60);
  const gone = logic.tgConvoLabel('abc-1234', {}, Date.now() - 120000);
  assert.equal(gone, 'An earlier conversation (2 minutes ago)');
  assert.ok(!gone.includes('1234'));
  assert.equal(logic.tgTabLabel('creator-plus', { 'creator-plus': 'Creator Plus' }), 'Creator Plus');
  assert.equal(logic.tgTabLabel('old-tab', {}), 'A tab that is gone');
  assert.equal(logic.tgTabLabel('', {}), '');
});

test('the highest-risk tools: never switched On or Ask here; Off only, and an On one shows its true state', () => {
  const never = { name: 'recon_x', plain: 'x', tier: 4, risk: 'Never', state: 'off' };
  assert.equal(logic.tgRiskWord(never), 'Settings only');
  assert.equal(logic.tgRiskWord({ ...never, state: 'on', risk: 'Never' }), 'Highest', 'an On one is not called "Settings only"');
  assert.equal(logic.tgRiskWord({ tier: 3, risk: 'High' }), 'High');
  for (const state of ['on', 'ask']) {
    const out = logic.tgToolChange([never], 'recon_x', state);
    assert.equal(out.ok, false);
    assert.equal(out.why, logic.TG_SETTINGS_WHY);
  }
  const on = { ...never, name: 'git_push', state: 'on' };
  const off = logic.tgToolChange([on], 'git_push', 'off');
  assert.equal(off.ok, true);
  assert.equal(off.rows[0].state, 'off');
  assert.match(source, /Only you can switch it on, in the app\\u2019s own settings; here you can switch it Off/);
});

test('the page switches off, says so, and the first things on it are the real ones', () => {
  assert.match(source, /Off\. Every tab has exactly its own tools/);
  assert.match(source, /body\.current\.inert = off/);
  assert.match(source, /tgCall\('catalogueForMode', \{ modeId \}\)/, 'the preview asks the service the same question the AI tool does');
  assert.match(source, /'data-settings-only'/);
});


test('"Show what the AI sees" answers like the AI\'s own catalogue: the same rows and words, no Off tools, and the route reaches it', async () => {
  const { toolAccessCall } = await import('../lib/route.js');
  const modes = [{ id: 'code', label: 'Code' }, { id: 'chat', label: 'Chat' }];
  const all = ['bash', 'read', 'pdf_read', 'write', 'git_force_push'];
  let stored = JSON.stringify({ code: { groups: {}, tools: { write: 'off' } } });
  const store = { isBlocked: () => false, log() {}, newId: () => 'x', grants: () => [], blocks: () => [] };
  const service = createToolAccess({ store, modes: () => modes, modeOf: () => modes[0], known: () => ['bash', 'read'], knownAll: () => all, baseOffered: () => ['bash', 'read'], readAccess: () => stored, writeAccess: async (text) => { stored = text; } });
  const mode = service.catalogueForMode('code');
  const live = service.catalogueFor('s1');
  assert.ok(!mode.some((row) => row.name === 'write'), 'an Off tool is never shown');
  for (const row of live.filter((one) => ['bash', 'read'].includes(one.name))) assert.deepEqual(mode.find((one) => one.name === row.name), row, `${row.name} reads the same in both`);
  assert.equal(mode.find((row) => row.name === 'pdf_read').status, 'can be requested');
  assert.equal(mode.find((row) => row.name === 'bash').status, 'available now');
  assert.equal(logic.tgCatalogueText(mode), catalogueText(mode));
  assert.deepEqual(await toolAccessCall(service, 'catalogueForMode', { modeId: 'code' }), { ok: true, value: mode });
  assert.deepEqual(service.catalogueForMode('nope'), []);
});

test('the Tools list with Tool access off is the list from before: old label, no ask part, the two new tools hidden', () => {
  const list = { can: ['read', 'tools_catalog', 'request_tool_access'], later: ['request_tool_access'], cannot: ['bash', 'tools_catalog'], trimmed: true };
  const ask = [{ name: 'bash', plain: 'Run commands' }];
  for (const access of [false, null, undefined, 'yes']) {
    const off = logic.tgPanelView(list, access, ask);
    assert.equal(off.on, false);
    assert.equal(off.canLabel, 'tools.can.off');
    assert.deepEqual([off.can, off.later, off.cannot, off.ask], [['read'], [], ['bash'], []]);
  }
  const on = logic.tgPanelView(list, true, ask);
  assert.equal(on.canLabel, 'tools.can');
  assert.deepEqual(on.can, ['read', 'tools_catalog', 'request_tool_access']);
  assert.deepEqual(on.ask.map((row) => row.name), ['bash']);
  // The dictionary has both labels, in both languages, and the old one is the pre-feature wording.
  assert.match(source, /'tools\.can\.off': 'Can call'/);
  assert.match(source, /'tools\.can': 'Can use now'/);
  assert.match(source, /merged\.on && sessionId \? h\(TgPanelPart/);
});

test('"Allowed here" lists only what applies: a sealed tab ignores Always and this-tab permissions', () => {
  const grants = { grants: [
    { id: 'a', tool: 'read', scope: 'always' }, { id: 'm', tool: 'edit', scope: 'mode', modeId: 'recon' },
    { id: 'c', tool: 'bash', scope: 'conversation', sessionId: 's1', modeId: 'recon' }, { id: 'c2', tool: 'x', scope: 'conversation', sessionId: 's1', modeId: 'code' },
    { id: 'o', tool: 'y', scope: 'once', sessionId: 's2', modeId: 'recon' },
  ] };
  const ids = (locked) => logic.tgPanelSections([], grants, { sessionId: 's1', modeId: 'recon', locked }).allowed.map((one) => one.id);
  assert.deepEqual(ids(true), ['c'], 'only this conversation, given in this tab');
  assert.deepEqual(ids(false), ['a', 'm', 'c', 'c2']);
});

test('the questions before On start on Cancel (danger), also tool by tool; a starting mix is explained, not called a choice', () => {
  const row = { name: 'bash', plain: 'Run commands in Terminal', purpose: 'Runs programs.', risk: 'High', group: 'run', state: 'off', tier: 3 };
  assert.equal(logic.tgSwitchOnQuestion([row], 'run', 'Run commands', 'Code').danger, true);
  const q = logic.tgToolOnQuestion(row, 'Code');
  assert.equal(q.danger, true);
  assert.equal(q.title, 'Switch on Run commands in Terminal in Code?');
  assert.match(q.text, /without asking you each time\. Runs programs\. Risk: High\./);
  const mix = logic.tgStartMixQuestion([{ ...row, state: 'on' }, { ...row, name: 'py', plain: 'Run Python', state: 'ask' }], 'run', 'Run commands', 'Code', 'ask');
  assert.equal(mix.title, 'Set Run commands in Code to Ask?');
  assert.match(mix.text, /1 tool changes to Ask in Code: Run commands in Terminal\./);
  assert.ok(!mix.danger);
  // The page asks before the click changes anything, and before a tool goes On.
  assert.match(source, /plan\.startMix && !plan\.confirm && !\(await dshKit\.ask\(tgStartMixQuestion/);
  assert.match(source, /state === 'on' && row\?\.state !== 'on' && !\(await dshKit\.ask\(tgToolOnQuestion/);
});

test('Undo says only what is true: tools that did not come back are named', () => {
  const before = [{ name: 'a', plain: 'A', group: 'run', state: 'on', tier: 3 }, { name: 'b', plain: 'B', group: 'run', state: 'ask', tier: 3 }, { name: 'c', plain: 'C', group: 'read', state: 'on', tier: 0 }];
  assert.deepEqual(logic.tgUndoMisses(before, before, 'run'), []);
  assert.deepEqual(logic.tgUndoMisses(before, [{ ...before[0] }, { ...before[1], state: 'off' }, before[2]], 'run'), ['B']);
  assert.deepEqual(logic.tgUndoMisses(before, [], 'run'), ['A', 'B'], 'a tool missing from the new list did not come back');
  assert.match(source, /const canUndo = wasMixed && rows\.length > 0/);
});

test('a highest-risk tool that is On: the preview matches what the AI is really told, and Off takes it away', async () => {
  let stored = '{}';
  const modes = [{ id: 'code', label: 'Code' }];
  const names = ['git_push', 'read'];
  const store = { isBlocked: () => false, log() {}, newId: () => 'x', grants: () => [], blocks: () => [] };
  const service = createToolAccess({ store, modes: () => modes, modeOf: () => modes[0], known: () => names, knownAll: () => names, baseOffered: () => names, readAccess: () => stored, writeAccess: async (text) => { stored = text; } });
  const row = () => service.toolsOf('code').find((one) => one.name === 'git_push');
  assert.equal(row().tier >= 4 || row().tier === 3, true);
  if (row().tier >= 4) {
    assert.equal(row().state, 'on', 'already On in this tab');
    const seen = (list) => list.find((one) => one.name === 'git_push')?.status;
    assert.equal(seen(service.catalogueForMode('code')), seen(service.catalogueFor('s')), 'the preview says what the AI is told');
    assert.equal(seen(service.catalogueForMode('code')), 'available now');
    await service.setTool({ modeId: 'code', tool: 'git_push', state: 'off' });
    assert.equal(row().state, 'off');
    assert.equal(service.catalogueForMode('code').some((one) => one.name === 'git_push'), false);
    assert.equal(service.catalogueFor('s').some((one) => one.name === 'git_push'), false);
  }
});

test('switching a highest-risk tool Off on the page really takes it away from the AI (the real mask code)', async () => {
  const { applyAccess, parseAccess } = await import('../lib/access.js');
  const access = parseAccess({ code: { groups: {}, tools: { git_push: 'off' } } });
  const out = applyAccess({ mask: null, known: ['git_push', 'git_force_push', 'read'], mode: { id: 'code' }, access });
  assert.deepEqual(out, { deny: ['git_push'] });
});
