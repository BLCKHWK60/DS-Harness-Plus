/**
 * Looking after the skills (step 10): the health list (uses counted from the conversations Tuner Plus may
 * read), the list's cost, Improve (yours in place with your yes, the others as a copy under the same name,
 * never touching them), copies behind their originals, Retire and Put back, Retire unused, Merge and Split.
 * Made-up skills, conversations and a stand-in model only.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { listCost, roomOf, tallyUses, usesIn } from '../lib/skills/health.js';
import { changesBetween, howToChange, rewriteSkillText } from '../lib/skills/care.js';
import { textPrint } from '../lib/skills/exam.js';
import { openSkills } from '../lib/skills/part.js';
import { openStore } from '../lib/store.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'tuner-care-'));
const FLOOR = { provider: 'local', model: 'floor' };
const STRONG = { provider: 'cloud', model: 'strong' };
const here = (provider) => provider === 'local';
const skillFile = (folder, name, description, body, extra = '') => {
  mkdirSync(folder, { recursive: true });
  const file = join(folder, 'SKILL.md');
  writeFileSync(file, `---\nname: ${name}\ndescription: ${description}\n${extra}---\n${body}\n`);
  return file;
};
/** A stand-in model: improves, merges and splits; writes load sets; loads nothing. */
const model = (seen = []) => async (route, text) => {
  seen.push({ route, text });
  if (text.startsWith('You improve a skill')) return '{"description": "Use when writing your notes, not for email", "text": "Better steps."}';
  if (text.startsWith('You merge two')) return '{"description": "Use when writing notes or minutes", "text": "Merged steps."}';
  if (text.startsWith('You split')) return '{"first": {"description": "Use when writing notes", "text": "Notes only."}, "second": {"name": "write-minutes", "description": "Use when writing meeting minutes", "text": "Minutes only."}}';
  if (text.startsWith('You write test requests')) return JSON.stringify({ should: ['a request one', 'a request two', 'a request three', 'a request four'], shouldNot: ['other one', 'other two', 'other three', 'other four'] });
  return 'none';
};

test('uses: the model\'s skill call that worked, or your /name; a turn ended well unless it failed or you corrected it; a fork\'s copied turns are its parent\'s', () => {
  const events = [
    { type: 'user/message', data: { message: { content: 'write my notes' } }, time: 10 },
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'tool/call', data: { name: 'skill', arguments: '{"name":"my-notes"}', callId: 'a' }, time: 11 },
    { type: 'tool/result', data: { message: { toolCallId: 'a', content: 'ok' } } },
    { type: 'tool/call', data: { name: 'skill', arguments: { name: 'broken' }, callId: 'b' }, time: 12 },
    { type: 'tool/result', data: { message: { toolCallId: 'b', isError: true } } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    { type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'my-notes' } }, time: 20 },
    { type: 'user/message', data: { message: { content: 'now the minutes' } }, time: 21 },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    { type: 'user/message', data: { message: { content: 'no, that is wrong' } }, time: 30 },
    { type: 'turn/start', data: { turn: 3 } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ];
  assert.deepEqual(usesIn(events), [{ name: 'my-notes', at: 11, how: 'model', well: true }, { name: 'my-notes', at: 20, how: 'owner', well: false }]);
  assert.deepEqual(usesIn(events, 7), [{ name: 'my-notes', at: 20, how: 'owner', well: false }], 'a fork\'s copied turns are not counted again');
  const tally = tallyUses([{ mode: 'code', uses: usesIn(events) }, { mode: 'cowork', uses: [{ name: 'my-notes', at: 50, how: 'model', well: true }] }]);
  assert.deepEqual(tally.get('my-notes'), { loads: 3, well: 2, owner: 1, last: 50, byMode: { code: 2, cowork: 1 } });
  assert.deepEqual(roomOf('ab', 'x'.repeat(600)), { chars: '- `ab`: '.length + 500 + 1, tokens: Math.ceil(('- `ab`: '.length + 501) / 4) });
  const cost = listCost([{ name: 'my-notes', description: 'Notes' }, { name: 'other', description: 'Other' }], tally, ['code', 'research']);
  assert.equal(cost.skills, 2);
  assert.deepEqual(cost.perTab, [{ tab: 'code', never: ['other'] }, { tab: 'research', never: ['my-notes', 'other'] }]);
});

test('how each skill may change: yours in place; the others as a copy under the same name in a folder that wins; some not at all', () => {
  const dsh = '/U/x/.dsh';
  const agents = '/U/x/.agents';
  const app = '/Applications/A.app/Contents';
  const how = (mark, path, provider = 'filesystem', defaults = []) => howToChange({ row: { name: 'n', mark, path, provider }, dshHome: dsh, agentsHome: agents, appContents: app, defaultFolders: defaults });
  assert.equal(how('mine', `${dsh}/skills/n/SKILL.md`).how, 'in-place');
  assert.equal(how('ai', '/U/x/proj/.dsh/skills/n/SKILL.md').how, 'in-place');
  assert.equal(how('downloaded', `${dsh}/skills/n/SKILL.md`).how, 'none', 'nothing wins over ~/.dsh/skills');
  assert.equal(how('unsorted', '/U/x/proj/.dsh/skills/n/SKILL.md').how, 'none');
  assert.deepEqual([how('plus', '', 'runtime').how, how('plus', '', 'runtime').root], ['copy', `${dsh}/skills`]);
  assert.deepEqual([how('downloaded', `${agents}/skills/n/SKILL.md`).how, how('downloaded', `${agents}/skills/n/SKILL.md`).root], ['copy', `${dsh}/skills`]);
  assert.deepEqual([how('downloaded', '/U/x/proj/.agents/skills/n/SKILL.md').how, how('downloaded', '/U/x/proj/.agents/skills/n/SKILL.md').root], ['copy', '/U/x/proj/.dsh/skills']);
  assert.match(how('default', `${app}/Resources/doc/n/SKILL.md`).why, /comes with the app/);
  assert.match(how('mine', '/private/tmp/dsh-recon-room/.dsh/skills/n/SKILL.md').why, /Recon room is never touched/);
  assert.match(how('mine', '/U/x/ws/.dsh/skills/n/SKILL.md', 'filesystem', ['/U/x/ws']).why, /default workspace/);
});

test('a change rewrites only the description and the text; every other line at the top stays; what changed, in plain lines', () => {
  const old = '---\nname: my-notes\ndescription: >\n  Old words\n  over two lines\nwhenToUse: when writing\ndisable-model-invocation: false\nmetadata:\n  team: a\n---\nOld steps.\n';
  const next = rewriteSkillText(old, { description: 'New words', text: 'New steps.' });
  assert.equal(next, '---\nname: my-notes\ndescription: "New words"\nwhenToUse: when writing\ndisable-model-invocation: false\nmetadata:\n  team: a\n---\nNew steps.\n');
  assert.deepEqual(changesBetween('a\nb\nc', 'a\nc\nd'), { added: 1, gone: 1, lines: ['− b', '+ d'] });
});

function standIn({ ask = model() } = {}) {
  const dir = scratch();
  const dsh = join(dir, 'dsh');
  const agents = join(dir, 'agents');
  const state = { on: true, cards: [], clock: Date.parse('2026-09-01T00:00:00Z'), seen: [] };
  const store = openStore(() => join(dir, 'tuning'));
  const files = {
    mine: skillFile(join(dsh, 'skills', 'my-notes'), 'my-notes', 'Use when writing notes', 'Old steps.', 'whenToUse: when writing\n'),
    minutes: skillFile(join(dsh, 'skills', 'my-minutes'), 'my-minutes', 'Use when writing minutes', 'Minute steps.'),
    downloaded: skillFile(join(agents, 'skills', 'ego'), 'ego', 'Use a browser', 'Click things.'),
  };
  state.skills = [
    { name: 'my-notes', provider: 'filesystem', description: 'Use when writing notes', path: files.mine },
    { name: 'my-minutes', provider: 'filesystem', description: 'Use when writing minutes', path: files.minutes },
    { name: 'ego', provider: 'filesystem', description: 'Use a browser', path: files.downloaded },
    { name: 'read-pdf', provider: 'runtime', description: 'Read a PDF', content: 'Open it page by page.' },
  ];
  const part = openSkills({
    ctx: { get: (name) => ({ dshHomePath: (...parts) => join(dsh, ...parts) })[name], on: () => {}, effect: (fn) => fn() },
    store,
    on: () => state.on,
    now: () => (state.clock += 1000),
    addCard: (card) => { const entry = { id: `K${state.clock}${state.cards.length}`, ...card }; state.cards.push(entry); const all = store.cards(); all.cards.unshift(entry); store.saveCards(all); return entry; },
    hasCard: (key) => state.cards.some((card) => card.key === key),
    readable: async () => ({ read: [] }),
    exam: { models: () => ({ floor: FLOOR, strong: STRONG }), here, ask: async (...args) => ask(...args), examRows: () => [], answerRow: async () => '', canaries: async () => undefined, busy: () => '' },
    standIns: { listSkills: async () => { state.listing = (state.listing ?? 0) + 1; state.most = Math.max(state.most ?? 0, state.listing); state.lists = (state.lists ?? 0) + 1; if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay)); state.listing -= 1; return state.skills; }, learnedFile: join(dir, 'skill-architect', 'library.json'), plusFolder: join(dir, 'plus'), appContents: join(dir, 'App.app', 'Contents'), dshHome: dsh, agentsHome: agents, defaultFolder: [] },
  });
  /** A draft's exam passed and its text shown (the exam and the showing are tested elsewhere). */
  const ready = (id) => {
    const file = join(dir, 'tuning', 'skills', 'drafts', `${id}.json`);
    const entry = JSON.parse(readFileSync(file, 'utf8'));
    const fp = textPrint(entry.name, entry.description, entry.text);
    writeFileSync(file, JSON.stringify({ ...entry, exam: { passed: true, fp }, shown: fp }));
  };
  return { dir, dsh, agents, state, store, part, files, ready, close: () => rmSync(dir, { recursive: true, force: true }) };
}
const keyOfRow = async (w, name) => (await w.part.sync()).rows.find((row) => row.name === name).key;

test('"Hands off": an Improve run on a Downloaded and a Plus skill leaves both untouched to the last byte; each gets a copy under the same name, AI-made, naming its original', async () => {
  const w = standIn();
  try {
    const before = readFileSync(w.files.downloaded);
    const started = await w.part.startSkillsRun({ type: 'improve', keys: [await keyOfRow(w, 'ego'), await keyOfRow(w, 'read-pdf')] });
    await started.done;
    assert.deepEqual(readFileSync(w.files.downloaded), before, 'the downloaded file is untouched');
    const drafts = w.part.drafts();
    assert.deepEqual(drafts.map((one) => [one.name, one.replaces.how, one.replaces.root]).sort(), [['ego', 'copy', join(w.dsh, 'skills')], ['read-pdf', 'copy', join(w.dsh, 'skills')]]);
    assert.match(w.state.cards.at(-1).text, /ego \(as a copy under the same name\): waits under Skills/);
    // Used (after its exam and your yes): a copy in ~/.dsh/skills, AI-made, naming its original; the original still untouched.
    const ego = drafts.find((one) => one.name === 'ego');
    w.ready(ego.id);
    const live = await w.part.goLive(ego.id);
    assert.equal(live.how, 'copy');
    assert.equal(live.file, join(w.dsh, 'skills', 'ego', 'SKILL.md'));
    assert.deepEqual(readFileSync(w.files.downloaded), before);
    w.state.skills.push({ name: 'ego', provider: 'filesystem', description: ego.description, path: live.file });
    const row = (await w.part.sync()).rows.find((one) => one.path === live.file);
    assert.deepEqual([row.mark, row.copyOf?.name, row.behind], ['ai', 'ego', false]);
    // The original changes later (its maker updated it): your copy is behind, and you are told what changed, once.
    writeFileSync(w.files.downloaded, readFileSync(w.files.downloaded, 'utf8').replace('Click things.', 'Click things.\nAlso scroll.'));
    const again = (await w.part.sync()).rows.find((one) => one.path === live.file);
    assert.equal(again.behind, true);
    const behind = w.state.cards.filter((card) => card.kind === 'skill-behind');
    assert.equal(behind.length, 1);
    assert.match(behind[0].text, /\+ Also scroll\./);
    await w.part.sync();
    assert.equal(w.state.cards.filter((card) => card.kind === 'skill-behind').length, 1, 'told once');
  } finally {
    w.close();
  }
});

test('"My skill": Improve on a skill marked Mine writes nothing until your yes; then it changes where it is, its other lines kept, the old text kept, still Mine', async () => {
  const w = standIn();
  try {
    const key = await keyOfRow(w, 'my-notes');
    w.part.sort([key], 'mine');
    const before = readFileSync(w.files.mine, 'utf8');
    await (await w.part.startSkillsRun({ type: 'improve', keys: [key] })).done;
    assert.equal(readFileSync(w.files.mine, 'utf8'), before, 'nothing written by the run');
    const draft = w.part.drafts().find((one) => one.name === 'my-notes');
    assert.equal(draft.replaces.how, 'in-place');
    await assert.rejects(w.part.draft({ name: 'another-name', description: 'x', text: 'y', scope: 'everywhere', replaces: draft.replaces }), /A change keeps the skill's name/);
    assert.equal(draft.replaces.before.text, 'Old steps.');
    await assert.rejects(w.part.goLive(draft.id), /waits for its exam|did not pass its exam/, 'no change before a passed exam and your yes');
    w.ready(draft.id);
    await w.part.goLive(draft.id);
    const after = readFileSync(w.files.mine, 'utf8');
    assert.match(after, /^---\nname: my-notes\ndescription: "Use when writing your notes, not for email"\nwhenToUse: when writing\n---\nBetter steps\.\n$/);
    const kept = readdirSync(join(w.dir, 'tuning', 'skills', 'versions'));
    assert.equal(kept.length, 1);
    assert.equal(readFileSync(join(w.dir, 'tuning', 'skills', 'versions', kept[0], readdirSync(join(w.dir, 'tuning', 'skills', 'versions', kept[0]))[0]), 'utf8'), before);
    assert.equal((await w.part.sync()).rows.find((one) => one.name === 'my-notes').mark, 'mine', 'its origin did not change');
  } finally {
    w.close();
  }
});

test('a change is never used once the skill changed since it was written; a skill that cannot change says why', async () => {
  const w = standIn();
  try {
    const key = await keyOfRow(w, 'my-notes');
    w.part.sort([key], 'mine');
    await (await w.part.startSkillsRun({ type: 'improve', keys: [key] })).done;
    const draft = w.part.drafts().find((one) => one.name === 'my-notes');
    writeFileSync(w.files.mine, readFileSync(w.files.mine, 'utf8').replace('Old steps.', 'Old steps, edited by hand.'));
    w.ready(draft.id);
    await assert.rejects(w.part.goLive(draft.id), /changed since this change was written/);
    // my-minutes is not sorted: in ~/.dsh/skills nothing can win over it.
    await (await w.part.startSkillsRun({ type: 'improve', keys: [await keyOfRow(w, 'my-minutes')] })).done;
    assert.match(w.state.cards.at(-1).text, /my-minutes: not changed \(it is not yours, and no folder wins/);
  } finally {
    w.close();
  }
});

test('Retire switches a skill off and keeps it; Put back brings it back; only yours, and Retire unused proposes, you decide', async () => {
  const w = standIn();
  try {
    const key = await keyOfRow(w, 'my-notes');
    w.part.sort([key], 'mine');
    assert.throws(() => w.part.retireKey(key.replace('my-notes', 'nothing')), /not in the list/);
    assert.throws(() => w.part.retireKey((w.part.keysForNames(['ego']))[0]), /cannot be retired here/);
    assert.equal(w.part.retireKey(key), 'my-notes');
    assert.equal(existsSync(w.files.mine), false);
    const retired = w.part.sync ? (await w.part.sync()).retired : [];
    assert.equal(retired[0].name, 'my-notes');
    assert.ok(existsSync(join(retired[0].to, 'SKILL.md')));
    // Something new in its place: it stays retired.
    mkdirSync(join(w.dsh, 'skills', 'my-notes'), { recursive: true });
    assert.throws(() => w.part.putBack(retired[0].id), /Something is in its place now/);
    rmSync(join(w.dsh, 'skills', 'my-notes'), { recursive: true, force: true });
    assert.equal(w.part.putBack(retired[0].id), 'my-notes');
    assert.ok(existsSync(w.files.mine));
    // Retire unused: two months on, my-notes was never loaded; my-minutes is not yours.
    w.part.sort([await keyOfRow(w, 'my-minutes')], 'mine');
    w.state.clock = Date.parse('2026-11-17T00:00:00Z');
    writeFileSync(join(w.dir, 'tuning', 'skills', 'health.json'), JSON.stringify({ at: w.state.clock, sessions: { c1: { at: w.state.clock, mode: 'code', uses: [{ name: 'my-minutes', at: w.state.clock - 86_400_000, how: 'model', well: true }] } } }));
    await (await w.part.startSkillsRun({ type: 'retire', mark: 'all' })).done;
    const card = w.state.cards.find((one) => one.kind === 'skills-retire');
    assert.match(card.title, /^Retire unused: my-notes$/);
    assert.match(card.text, /my-minutes: used 1 time/);
    assert.match(card.text, /ego: not offered/);
    assert.ok(existsSync(w.files.mine), 'nothing retired before your yes');
    const result = w.part.retireFromCard(card.id);
    assert.deepEqual(result.done, ['my-notes']);
    assert.equal(existsSync(w.files.mine), false);
  } finally {
    w.close();
  }
});

test('Merge two of yours into one (the second retired when you use it); Split one of yours into two; never a merge of skills that are not yours', async () => {
  const w = standIn();
  try {
    const notes = await keyOfRow(w, 'my-notes');
    const minutes = await keyOfRow(w, 'my-minutes');
    w.part.sort([notes, minutes], 'mine');
    await (await w.part.startSkillsRun({ type: 'merge', keys: [notes, minutes] })).done;
    const merged = w.part.drafts().find((one) => one.name === 'my-notes');
    assert.deepEqual([merged.replaces.how, merged.retires.length], ['in-place', 1]);
    w.ready(merged.id);
    await w.part.goLive(merged.id);
    assert.match(readFileSync(w.files.mine, 'utf8'), /Merged steps\./);
    assert.equal(existsSync(w.files.minutes), false, 'the second is retired (kept)');
    assert.equal((await w.part.sync()).retired[0].name, 'my-minutes');
    // Split: the first part changes where it is, the second is a new skill.
    w.state.skills = w.state.skills.filter((one) => one.name !== 'my-minutes');
    await (await w.part.startSkillsRun({ type: 'merge', keys: [notes] })).done;
    assert.deepEqual(w.part.drafts().map((one) => one.name).sort(), ['my-notes', 'write-minutes']);
    // Not yours: no merge.
    await (await w.part.startSkillsRun({ type: 'merge', keys: [await keyOfRow(w, 'ego'), notes] })).done;
    assert.match(w.state.cards.at(-1).text, /Not merged: "ego" is not yours/);
  } finally {
    w.close();
  }
});

test('uses are counted from the conversations Tuner Plus may read; one holding a Recon export is skipped', async () => {
  const dir = scratch();
  try {
    const conversations = {
      c1: [{ type: 'turn/start', data: { turn: 1 } }, { type: 'tool/call', data: { name: 'skill', arguments: { name: 'my-notes' }, callId: 'a' }, time: 5 }, { type: 'tool/result', data: { message: { toolCallId: 'a' } } }, { type: 'turn/end', data: { reason: { kind: 'completed' } } }],
      c2: [{ type: 'user/message', data: { message: { content: '[Recon export 2026] x' } } }, { type: 'turn/start', data: { turn: 1 } }, { type: 'tool/call', data: { name: 'skill', arguments: { name: 'my-notes' }, callId: 'b' } }, { type: 'tool/result', data: { message: { toolCallId: 'b' } } }],
    };
    const part = openSkills({
      ctx: { get: (name) => ({ dshHomePath: (...parts) => join(dir, 'dsh', ...parts), sessionQuery: { readSession: async (id) => ({ events: conversations[id] }) } })[name], on: () => {}, effect: (fn) => fn() },
      store: openStore(() => join(dir, 'tuning')),
      on: () => true,
      now: () => 1_000,
      addCard: () => {},
      readable: async () => ({ known: true, read: [{ id: 'c1', mode: 'code', header: {} }, { id: 'c2', mode: 'code', header: {} }] }),
      exam: { models: () => ({}), here, ask: async () => '', examRows: () => [], answerRow: async () => '', canaries: async () => undefined, busy: () => '', exportIn: (events) => JSON.stringify(events).includes('Recon export') },
      standIns: { listSkills: async () => [], learnedFile: join(dir, 'skill-architect', 'library.json'), plusFolder: join(dir, 'plus'), appContents: join(dir, 'App.app', 'Contents'), dshHome: join(dir, 'dsh'), agentsHome: join(dir, 'agents') },
    });
    const counted = await part.refreshHealth();
    assert.deepEqual(Object.keys(counted.sessions), ['c1']);
    assert.equal(counted.sessions.c1.uses[0].name, 'my-notes');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the independent review of step 10 (17 November): one test for each finding --------------------

test('review 8: uses read in the app\'s real order (the turn starts, then its messages come in it), and in the older one', () => {
  const real = [
    { type: 'turn/start', data: { turn: 1 } },
    { type: 'user/message', data: { message: { content: 'write my notes' } }, time: 10 },
    { type: 'tool/call', data: { name: 'skill', arguments: { name: 'my-notes' }, callId: 'a' }, time: 11 },
    { type: 'tool/result', data: { message: { toolCallId: 'a' } } },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    { type: 'turn/start', data: { turn: 2 } },
    { type: 'user/message', data: { message: { content: 'no, that is wrong' } }, time: 20 },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
    { type: 'turn/start', data: { turn: 3 } },
    { type: 'user/message', data: { source: { kind: 'skill-invocation', name: 'my-minutes' } }, time: 30 },
    { type: 'user/message', data: { message: { content: 'the minutes now' } }, time: 31 },
    { type: 'turn/end', data: { reason: { kind: 'completed' } } },
  ];
  assert.deepEqual(usesIn(real), [{ name: 'my-notes', at: 11, how: 'model', well: false }, { name: 'my-minutes', at: 30, how: 'owner', well: true }], 'the corrected turn did not end well; a /name in the last turn counts');
});

test('review 5: a description over several lines (plain, quoted, block) is replaced whole; a top that cannot be read back is refused', () => {
  const body = (description) => `---\nname: my-notes\ndescription: ${description}\nwhenToUse: when writing\n---\nOld.\n`;
  for (const old of [body('Plain words\n  over two lines'), body('"Quoted words\n  over two lines"'), body("'Single\n  quoted'"), body('|\n  A block\n  of lines')]) {
    const next = rewriteSkillText(old, { description: 'New words', text: 'New.' });
    assert.equal(next, '---\nname: my-notes\ndescription: "New words"\nwhenToUse: when writing\n---\nNew.\n', old);
  }
  assert.equal(rewriteSkillText(body('Plain'), { description: 'Say "this" here', text: 'x' }).split('\n')[2], 'description: "Say \\"this\\" here"');
  assert.throws(() => rewriteSkillText('---\nname: my-notes\ndescription: "never closed\nwhenToUse: x\n---\nOld.\n', { description: 'New', text: 'x' }), /could not be rewritten safely/);
  // A top Tuner Plus cannot read back (a name written over two lines): refused, nothing written.
  assert.throws(() => rewriteSkillText('---\nname: >-\n  my-notes\ndescription: Old\n---\nOld.\n', { description: 'New', text: 'x' }), /could not be rewritten safely/);
});

test('review 1 and 7: a change is checked again when used: a skill sorted since as not yours, or a merged skill edited since, stops it', async () => {
  const w = standIn();
  try {
    const key = await keyOfRow(w, 'my-notes');
    w.part.sort([key], 'mine');
    await (await w.part.startSkillsRun({ type: 'improve', keys: [key] })).done;
    const draft = w.part.drafts().find((one) => one.name === 'my-notes');
    w.ready(draft.id);
    w.part.sort([key], 'downloaded');
    await assert.rejects(w.part.goLive(draft.id), /may no longer be changed this way/);
    assert.match(readFileSync(w.files.mine, 'utf8'), /Old steps\./);
    w.part.sort([key], 'mine');
    w.part.dropDraft(draft.id);
    const minutes = await keyOfRow(w, 'my-minutes');
    w.part.sort([minutes], 'mine');
    await (await w.part.startSkillsRun({ type: 'merge', keys: [key, minutes] })).done;
    const merged = w.part.drafts().find((one) => one.name === 'my-notes');
    w.ready(merged.id);
    writeFileSync(w.files.minutes, readFileSync(w.files.minutes, 'utf8').replace('Minute steps.', 'Minute steps, my newest edit.'));
    await assert.rejects(w.part.goLive(merged.id), /"my-minutes" changed since this merge was written/);
    assert.ok(existsSync(w.files.minutes), 'not retired');
    assert.match(readFileSync(w.files.mine, 'utf8'), /Old steps\./, 'not changed either');
  } finally {
    w.close();
  }
});

test('review 3: improving a copy again keeps it a copy of its original (and told when the original changes)', async () => {
  const w = standIn();
  try {
    await (await w.part.startSkillsRun({ type: 'improve', keys: [await keyOfRow(w, 'ego')] })).done;
    const copy = w.part.drafts().find((one) => one.name === 'ego');
    w.ready(copy.id);
    const live = await w.part.goLive(copy.id);
    w.state.skills.push({ name: 'ego', provider: 'filesystem', description: copy.description, path: live.file });
    const copyKey = (await w.part.sync()).rows.find((one) => one.path === live.file).key;
    // Improved again (it is AI-made and in ~/.dsh/skills: it changes where it is).
    await (await w.part.startSkillsRun({ type: 'improve', keys: [copyKey] })).done;
    const again = w.part.drafts().find((one) => one.name === 'ego');
    assert.equal(again.replaces.how, 'in-place');
    w.ready(again.id);
    await w.part.goLive(again.id);
    const row = (await w.part.sync()).rows.find((one) => one.path === live.file);
    assert.equal(row.copyOf?.name, 'ego', 'still a copy of its original');
    writeFileSync(w.files.downloaded, readFileSync(w.files.downloaded, 'utf8').replace('Click things.', 'Click things.\npassword: hunter2-secret-value'));
    assert.equal((await w.part.sync()).rows.find((one) => one.path === live.file).behind, true);
    const card = w.state.cards.find((one) => one.kind === 'skill-behind');
    assert.ok(card);
    assert.doesNotMatch(card.text, /hunter2-secret-value/, 'review 11: the changed lines are masked');
  } finally {
    w.close();
  }
});

test('review 6, 9, 10, 12: a name in two places is never changed by name; Retire unused counts first; a card stays when nothing was retired; one problem does not end Improve', async () => {
  const w = standIn();
  try {
    // The same name in two places (a project's copy too).
    const other = skillFile(join(w.dir, 'proj', '.dsh', 'skills', 'my-notes'), 'my-notes', 'Another', 'x');
    w.state.skills.push({ name: 'my-notes', provider: 'filesystem', description: 'Another', path: other });
    await w.part.sync();
    await assert.rejects(w.part.startSkillsRun({ type: 'merge', names: ['my-notes'] }), /stands in more than one place/);
    w.state.skills.pop();
    // Retire unused with a conversation not counted yet: nothing is proposed.
    const ws = await (async () => {
      const dir = w.dir;
      const part = openSkills({
        ctx: { get: (name) => ({ dshHomePath: (...parts) => join(dir, 'dsh2', ...parts), sessionQuery: { readSession: async () => { throw new Error('not now'); } } })[name], on: () => {}, effect: (fn) => fn() },
        store: openStore(() => join(dir, 'tuning2')),
        on: () => true,
        now: () => Date.parse('2026-11-17T00:00:00Z'),
        addCard: (card) => { w.state.cards.push(card); return card; },
        readable: async () => ({ known: true, read: [{ id: 'c1', mode: 'code', header: {} }] }),
        exam: { models: () => ({ floor: FLOOR, strong: STRONG }), here, ask: model(), examRows: () => [], answerRow: async () => '', canaries: async () => undefined, busy: () => '', exportIn: () => false },
        standIns: { listSkills: async () => w.state.skills, learnedFile: join(dir, 'skill-architect', 'library.json'), plusFolder: join(dir, 'plus'), appContents: join(dir, 'App.app', 'Contents'), dshHome: w.dsh, agentsHome: w.agents, defaultFolder: [] },
      });
      return part;
    })();
    await (await ws.startSkillsRun({ type: 'retire', mark: 'all' })).done;
    const nothing = w.state.cards.at(-1);
    assert.match(nothing.title, /^Nothing proposed yet/);
    assert.match(nothing.text, /not counted yet in 1 conversation/);
    // A proposal whose skills cannot be retired now: the card stays.
    const key = await keyOfRow(w, 'my-notes');
    w.part.sort([key], 'mine');
    const card = w.state.cards.at(-1);
    const all = w.store.cards();
    all.cards.unshift({ id: 'Kx', kind: 'skills-retire', retire: ['nothing|here'], title: 'Retire unused: nothing' });
    w.store.saveCards(all);
    const result = w.part.retireFromCard('Kx');
    assert.deepEqual(result.done, []);
    assert.equal(w.store.cards().cards.find((one) => one.id === 'Kx').done, undefined, 'the proposal stays');
    void card;
    // One skill's problem (its copy's place is taken) does not end the run: the next one is still improved.
    mkdirSync(join(w.dsh, 'skills', 'read-pdf'), { recursive: true });
    await (await w.part.startSkillsRun({ type: 'improve', keys: [await keyOfRow(w, 'read-pdf'), await keyOfRow(w, 'ego')] })).done;
    assert.match(w.state.cards.at(-1).text, /read-pdf: not kept \(There is already something called read-pdf/);
    assert.ok(w.part.drafts().some((one) => one.name === 'ego'));
  } finally {
    w.close();
  }
});

test('after an update: one card with the skills changed, gone and new (Default, Downloaded and Plus only); the marks hold; "Check them" checks those; a version change alone makes no card', async () => {
  const w = standIn();
  try {
    const plus = join(w.dir, 'plus', 'dsh-pdf');
    mkdirSync(plus, { recursive: true });
    writeFileSync(join(plus, 'package.json'), '{"version": "0.1.0"}');
    writeFileSync(join(plus, 'index.js'), "export const skills = [{ name: 'read-pdf', description: 'Read a PDF', content: 'Open it.' }];\n");
    const contents = join(w.dir, 'App.app', 'Contents');
    mkdirSync(contents, { recursive: true });
    const plist = (version) => writeFileSync(join(contents, 'Info.plist'), `<plist><dict><key>CFBundleShortVersionString</key>\n<string>${version}</string></dict></plist>`);
    plist('1.0.0');
    const keys = Object.fromEntries((await w.part.sync()).rows.map((row) => [row.name, row.key]));
    w.part.sort([keys['my-notes'], keys['my-minutes']], 'mine');
    w.part.sort([keys.ego], 'downloaded');
    const first = await w.part.sync();
    const marks = Object.fromEntries(first.rows.map((row) => [row.name, row.mark]));
    assert.deepEqual([marks['read-pdf'], marks.ego, marks['my-notes']], ['plus', 'downloaded', 'mine']);
    assert.equal(w.state.cards.filter((card) => card.kind === 'skills-update').length, 0, 'the first look only notes where things stand (sorting is no update)');
    // The app and the PDF add-on are updated: a Plus skill and a downloaded one change, one downloaded goes, one comes; yours changes too.
    plist('1.1.0');
    writeFileSync(join(plus, 'package.json'), '{"version": "0.2.0"}');
    const tools = skillFile(join(w.agents, 'skills', 'pdf-tools'), 'pdf-tools', 'Use for PDF tools', 'Tools.');
    w.state.skills = [
      { ...w.state.skills[0], description: 'Use when writing notes, yours changed' },
      w.state.skills[1],
      { name: 'read-pdf', provider: 'runtime', description: 'Read a PDF, page by page', content: 'Open it, then read.' },
      { name: 'pdf-tools', provider: 'filesystem', description: 'Use for PDF tools', path: tools },
    ];
    writeFileSync(w.files.mine, '---\nname: my-notes\ndescription: Use when writing notes, yours changed\n---\nNew.\n');
    rmSync(join(w.agents, 'skills', 'ego'), { recursive: true });
    const second = await w.part.sync();
    for (const row of second.rows) if (marks[row.name]) assert.equal(row.mark, marks[row.name], `${row.name} keeps its mark`);
    const cards = w.state.cards.filter((card) => card.kind === 'skills-update');
    assert.equal(cards.length, 1);
    const [card] = cards;
    assert.equal(card.title, 'After an update: 1 changed, 1 gone, 1 new');
    assert.match(card.text, /The app went from 1\.0\.0 to 1\.1\.0/);
    assert.match(card.text, /dsh-pdf 0\.1\.0 → 0\.2\.0/);
    assert.match(card.text, /Changed: read-pdf\./);
    assert.match(card.text, /Gone: ego\./);
    assert.match(card.text, /New: pdf-tools \(Not sorted\)\./);
    assert.doesNotMatch(card.text, /my-notes/, 'your own skills are not an update\'s news');
    assert.deepEqual(card.buttons, ['check', 'later', 'never']);
    assert.equal(card.check.length, 2);
    // Nothing changed since: no second card.
    await w.part.sync();
    assert.equal(w.state.cards.filter((one) => one.kind === 'skills-update').length, 1);
    // "Check them": a Check run of those two skills (look only), and the card is done.
    const started = await w.part.checkFromCard(card.id);
    assert.match(started.sentence, /^Check 2 skills \(read-pdf, pdf-tools\)/);
    await started.done;
    assert.equal(w.store.cards().cards.find((one) => one.id === card.id).done, 'checking');
    await assert.rejects(() => w.part.checkFromCard(card.id), /no such card/);
    // A version change that touched no skill: noted, no card.
    plist('1.2.0');
    await w.part.sync();
    assert.equal(w.state.cards.filter((one) => one.kind === 'skills-update').length, 1);
    assert.equal(JSON.parse(readFileSync(join(w.dir, 'tuning', 'skills', 'baseline.json'), 'utf8')).app, '1.2.0');
  } finally {
    w.close();
  }
});

test('the marks for the Cowork Skills page: name, file or provider, and mark; never a text; nothing while the skills part is off', async () => {
  const w = standIn();
  try {
    w.part.sort([await keyOfRow(w, 'my-notes')], 'mine');
    const got = await w.part.marksList();
    assert.equal(got.names.mine, 'Mine');
    const byName = Object.fromEntries(got.list.map((one) => [one.name, one]));
    assert.deepEqual(byName['my-notes'], { name: 'my-notes', path: w.files.mine, provider: 'filesystem', mark: 'mine' });
    assert.deepEqual(byName['read-pdf'], { name: 'read-pdf', path: '', provider: 'runtime', mark: byName['read-pdf'].mark });
    assert.doesNotMatch(JSON.stringify(got), /Old steps|Open it page by page/, 'never a skill\'s text');
    w.state.on = false;
    assert.equal(await w.part.marksList(), null);
  } finally {
    w.close();
  }
});

test('review of step 11: only what an update can touch; a skill merely not listed, one the app could not hand over, your own edits and a damaged baseline make no card', async () => {
  const w = standIn();
  try {
    const project = join(w.dir, 'proj');
    const local = skillFile(join(project, '.agents', 'skills', 'proj-tool'), 'proj-tool', 'Use for the project', 'Steps.');
    const hand = skillFile(join(w.dsh, 'skills', 'hand-made'), 'hand-made', 'Use when I say so', 'Mine.');
    const base = w.state.skills;
    w.state.skills = [...base, { name: 'proj-tool', provider: 'filesystem', description: 'Use for the project', path: local }, { name: 'hand-made', provider: 'filesystem', description: 'Use when I say so', path: hand }];
    await w.part.sync();
    const baseline = () => JSON.parse(readFileSync(join(w.dir, 'tuning', 'skills', 'baseline.json'), 'utf8'));
    assert.equal(Object.values(baseline().skills).some((one) => one.name === 'proj-tool'), false, 'a project\'s own skills are not an update\'s');
    // The project is not listed this time; ego is not listed either, but its folder is still there; the
    // app could not hand over read-pdf (its text came back empty); your Not sorted skill was edited.
    writeFileSync(hand, '---\nname: hand-made\ndescription: Use when I say so, edited\n---\nMine, edited.\n');
    w.state.skills = [base[0], base[1], { name: 'read-pdf', provider: 'runtime', description: 'Read a PDF', content: '', unread: true }, { name: 'hand-made', provider: 'filesystem', description: 'Use when I say so, edited', path: hand }];
    await w.part.sync();
    assert.deepEqual(w.state.cards.filter((card) => card.kind === 'skills-update'), []);
    assert.ok(Object.values(baseline().skills).some((one) => one.name === 'ego'), 'a skill merely not listed stays in the baseline');
    // Listed again: not "new".
    w.state.skills = base;
    await w.part.sync();
    assert.deepEqual(w.state.cards.filter((card) => card.kind === 'skills-update'), []);
    // A damaged baseline: the list still works, and the baseline is written again.
    writeFileSync(join(w.dir, 'tuning', 'skills', 'baseline.json'), '{"skills": null}');
    const view = await w.part.sync();
    assert.ok(view.rows.length > 0);
    assert.equal(typeof baseline().skills, 'object');
    assert.ok(Object.keys(baseline().skills).length > 0);
  } finally {
    w.close();
  }
});

test('review of step 13: one look at a time; the Cowork page is answered at once from the last look, and an old look is made again in the background', async () => {
  const w = standIn();
  try {
    w.state.delay = 30;
    await Promise.all([w.part.sync(), w.part.sync(), w.part.sync()]);
    assert.equal(w.state.most, 1, 'never two looks at once');
    assert.equal(w.state.lists, 3);
    // An old look: the answer comes at once (no new look waited for), one look starts behind it.
    w.state.clock += 120_000;
    w.state.delay = 300;
    const started = Date.now();
    const got = await w.part.marksList();
    assert.ok(Date.now() - started < 200, 'answered at once');
    assert.ok(got.list.length > 0);
    await Promise.all([w.part.marksList(), w.part.marksList()]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(w.state.lists, 4, 'one look in the background, not three');
  } finally {
    w.close();
  }
});

test('skill first, adapter later (step 15): a skill used often and well is proposed once; "Teach it" leaves its loading out of the rows the trainer and the exam get; the stored rows and the skill stay; off: as before', async () => {
  const { makeRow } = await import('../lib/rows.js');
  const { withoutTaught, skillsLoadedIn, teachable } = await import('../lib/skills/graduate.js');
  const run = (index, calls, answer = 'Done.') => makeRow({ kind: 'toolcalls', mode: 'code', input: [{ role: 'user', content: `Write the notes for meeting ${index}` }], output: JSON.stringify({ calls, answer }), proof: { check: 'finished', detail: 'none failed' }, by: { provider: 'local', model: 'floor' }, from: { session: `s${index}` } });
  const loads = (index) => run(index, [{ name: 'skill', arguments: { name: 'my-notes' } }, { name: 'write', arguments: { path: `notes-${index}.md` } }]);
  // The pure rules.
  assert.deepEqual(skillsLoadedIn(loads(1)), ['my-notes']);
  const stripped = withoutTaught(loads(1), new Set(['my-notes']));
  assert.deepEqual(JSON.parse(stripped.output).calls, [{ name: 'write', arguments: { path: 'notes-1.md' } }]);
  assert.deepEqual(stripped.from.taughtWithout, ['my-notes']);
  assert.equal(withoutTaught(run(2, [{ name: 'skill', arguments: { name: 'my-notes' } }], ''), new Set(['my-notes'])), undefined, 'nothing left to learn: left out');
  const other = run(3, [{ name: 'skill', arguments: { name: 'ego' } }]);
  assert.equal(withoutTaught(other, new Set(['my-notes'])), other, 'another skill\'s loading stays');
  const uses = (loadsN, well) => new Map([['my-notes', { loads: loadsN, well }]]);
  const base = { rows: Array.from({ length: 10 }, (_, i) => loads(i)), checks: { k: { found: [] } }, skills: [{ key: 'k', name: 'my-notes' }], taught: new Set(), skip: new Set() };
  assert.equal(teachable({ ...base, uses: uses(20, 16) }).length, 1);
  assert.equal(teachable({ ...base, uses: uses(19, 19) }).length, 0, 'not used often enough');
  assert.equal(teachable({ ...base, uses: uses(20, 15) }).length, 0, 'not ending well often enough');
  assert.equal(teachable({ ...base, uses: uses(20, 20), checks: { k: { found: ['loads wrongly'] } } }).length, 0, 'its last check found a problem');
  assert.equal(teachable({ ...base, uses: uses(20, 20), checks: {} }).length, 0, 'never checked');
  assert.equal(teachable({ ...base, uses: uses(20, 20), rows: base.rows.slice(1) }).length, 0, 'too few checked runs');

  // In the skills part.
  const w = standIn();
  try {
    const key = await keyOfRow(w, 'my-notes');
    w.store.addRows('code', Array.from({ length: 12 }, (_, i) => loads(i)));
    mkdirSync(join(w.dir, 'tuning', 'skills'), { recursive: true });
    writeFileSync(join(w.dir, 'tuning', 'skills', 'health.json'), JSON.stringify({ at: 1, sessions: { s1: { mode: 'code', uses: Array.from({ length: 25 }, (_, i) => ({ name: 'my-notes', at: i, how: 'model', well: i < 22 })) } } }));
    writeFileSync(join(w.dir, 'tuning', 'skills', 'checks.json'), JSON.stringify({ [key]: { at: 1, line: 'ok', found: [] } }));
    assert.equal(w.part.proposeTeaching().length, 1);
    w.part.proposeTeaching();
    const cards = w.state.cards.filter((card) => card.kind === 'skill-teach');
    assert.equal(cards.length, 1, 'proposed once');
    assert.match(cards[0].text, /loaded 25 times \(22 ended well\).*12 checked runs loaded it/s);
    assert.deepEqual(cards[0].buttons, ['teach', 'later', 'never']);
    // Before your yes: the trainer gets the rows as they are.
    const rows = w.store.rows();
    assert.equal(w.part.forTrainer(rows), rows);
    assert.equal(w.part.teachFromCard(cards[0].id), 'my-notes');
    const trained = w.part.forTrainer(rows);
    assert.ok(trained.every((row) => !skillsLoadedIn(row).includes('my-notes')));
    assert.ok(w.store.rows().every((row) => skillsLoadedIn(row).includes('my-notes')), 'the stored rows are not changed');
    assert.deepEqual((await w.part.sync()).taught.map((one) => [one.name, one.rows]), [['my-notes', 12]]);
    assert.equal(readFileSync(w.files.mine, 'utf8').includes('Old steps.'), true, 'the skill is not touched');
    assert.equal(w.part.proposeTeaching().length, 0, 'not proposed again while taught');
    // Switched off: the trainer gets the rows exactly as before.
    w.state.on = false;
    assert.equal(w.part.forTrainer(rows), rows);
    w.state.on = true;
    assert.equal(w.part.stopTeaching('my-notes'), 'my-notes');
    assert.equal(w.part.forTrainer(rows), rows);
    assert.throws(() => w.part.stopTeaching('my-notes'), /not being taught/);
  } finally {
    w.close();
  }
});

test('review of step 15: a failed-then-worked row whose working call loads a taught skill is left out; lessons too; "Not now" comes back a month later, "never" holds', async () => {
  const { makeRow } = await import('../lib/rows.js');
  const { withoutTaught } = await import('../lib/skills/graduate.js');
  const taught = new Set(['my-notes']);
  const fix = makeRow({ kind: 'toolfix', mode: 'code', input: [{ role: 'user', content: 'notes' }], output: JSON.stringify({ name: 'skill', arguments: { name: 'my-notes' } }), rejected: 'failed', proof: { check: 'finished', detail: 'x' }, by: { provider: 'local', model: 'floor' }, from: { session: 's1' } });
  assert.equal(withoutTaught(fix, taught), undefined);
  const otherFix = { ...fix, output: JSON.stringify({ name: 'write', arguments: {} }) };
  assert.equal(withoutTaught(otherFix, taught), otherFix);
  const lesson = { ...fix, kind: 'lesson', output: JSON.stringify({ calls: [{ name: 'skill', arguments: { name: 'my-notes' } }] }) };
  assert.equal(withoutTaught(lesson, taught), undefined);

  const w = standIn();
  try {
    const key = await keyOfRow(w, 'my-notes');
    const run = (index) => makeRow({ kind: 'toolcalls', mode: 'code', input: [{ role: 'user', content: `Notes ${index}` }], output: JSON.stringify({ calls: [{ name: 'skill', arguments: { name: 'my-notes' } }, { name: 'write', arguments: { path: `n${index}` } }], answer: 'Done.' }), proof: { check: 'finished', detail: 'x' }, by: { provider: 'local', model: 'floor' }, from: { session: `s${index}` } });
    w.store.addRows('code', Array.from({ length: 12 }, (_, i) => run(i)));
    mkdirSync(join(w.dir, 'tuning', 'skills'), { recursive: true });
    writeFileSync(join(w.dir, 'tuning', 'skills', 'health.json'), JSON.stringify({ at: 1, sessions: { s1: { mode: 'code', uses: Array.from({ length: 25 }, (_, i) => ({ name: 'my-notes', at: i, how: 'model', well: true })) } } }));
    writeFileSync(join(w.dir, 'tuning', 'skills', 'checks.json'), JSON.stringify({ [key]: { at: 1, line: 'ok', found: [] } }));
    assert.equal(w.part.proposeTeaching().length, 1);
    // "Not now": not again this month.
    const all = w.store.cards();
    const card = all.cards.find((one) => one.kind === 'skill-teach');
    card.done = 'later';
    w.store.saveCards(all);
    assert.equal(w.part.proposeTeaching().length, 0);
    // A month later: again.
    w.state.clock += 40 * 24 * 3600 * 1000;
    assert.equal(w.part.proposeTeaching().length, 1);
    // "Do not suggest this again": never, also in later months.
    const next = w.store.cards();
    const again = next.cards.find((one) => one.kind === 'skill-teach' && !one.done);
    next.never = [...(next.never ?? []), again.key];
    again.done = 'never';
    w.store.saveCards(next);
    w.state.clock += 40 * 24 * 3600 * 1000;
    assert.equal(w.part.proposeTeaching().length, 0);
  } finally {
    w.close();
  }
});
