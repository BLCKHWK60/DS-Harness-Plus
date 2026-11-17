/**
 * The skills part, step 4: the marks set by code, the record beside the skills, the doors (a model's file
 * tools make the app ask first, and are stamped), sorting by hand, and the part's own switch; with the
 * findings of the independent review of 17 November. Made-up skills and folders only, in a throwaway
 * folder; never the owner's skills or the app's data.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { MARKS, learnedMark, markOf } from '../lib/skills/marks.js';
import { fingerprint, indexRecords, keyOf, openRecords } from '../lib/skills/records.js';
import { inReconRoom, nameInFile, onDisk, skillOf, writeDecision, writeTargets } from '../lib/skills/doors.js';
import { foldersToList, openSkills, placeOf, plusNamesIn } from '../lib/skills/part.js';
import { textPrint } from '../lib/skills/exam.js';
import { openStore } from '../lib/store.js';
import { apply } from '../index.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'tuner-skills-'));
const skillFile = (folder, name, body = 'Do the thing.', extra = '') => {
  mkdirSync(folder, { recursive: true });
  const file = join(folder, 'SKILL.md');
  writeFileSync(file, `---\nname: ${name}\ndescription: A made-up skill called ${name}.\n${extra}---\n${body}\n`);
  return file;
};
/** A draft marked as having passed its exam and been shown to the owner, of its very text (both are tested in skill-exam.test.mjs). */
const passExam = (file) => {
  const entry = JSON.parse(readFileSync(file, 'utf8'));
  const fp = textPrint(entry.name, entry.description, entry.text);
  writeFileSync(file, JSON.stringify({ ...entry, exam: { passed: true, fp }, shown: fp }));
};
const CLOSED = (folder) => [{ folder, reason: 'Tuner Plus keeps its records of where each skill came from in that folder; a model may not write there.' }];

test('marks come from where a skill lives and who served it, never from its own text', () => {
  const app = '/Applications/Made Up.app/Contents';
  const facts = { appContents: app, plusFolder: '/plus', plusNames: new Map([['reverse-codebase', 'dsh-code-map']]) };
  assert.equal(markOf({ name: 'office', provider: 'dsh-office', base: `${app}/Resources/app.asar/x/dsh-skill-office/assets/office` }, facts).mark, 'default');
  assert.equal(markOf({ name: 'office', provider: 'dsh-office' }, facts).mark, 'downloaded', 'a provider\'s name alone proves nothing');
  assert.equal(markOf({ name: 'office', provider: 'dsh-office', base: '/elsewhere/office' }, facts).mark, 'downloaded');
  assert.equal(markOf({ name: 'doc', provider: 'filesystem', path: `${app}/Resources/app.asar/x/skills/doc/SKILL.md` }, facts).mark, 'default');
  assert.equal(markOf({ name: 'doc', provider: 'filesystem', path: '/APPLICATIONS/MADE UP.APP/CONTENTS/Resources/x/SKILL.md' }, facts).mark, 'default', 'capitals do not matter on a Mac');
  assert.equal(markOf({ name: 'research', provider: 'industry-research', path: '/u/.dsh/profiles/desktop/node_modules/dsh-x/skills/research/SKILL.md' }, facts).mark, 'downloaded');
  assert.equal(markOf({ name: 'browser', provider: 'filesystem', path: '/Applications/Other.app/Contents/Resources/skills/browser/SKILL.md' }, facts).mark, 'downloaded', 'inside another app');
  assert.equal(markOf({ name: 'x', provider: 'some-plugin' }, facts).mark, 'downloaded');
  assert.equal(markOf({ name: 'stranger', provider: 'runtime' }, facts).mark, 'downloaded', 'plugin code, not a Plus add-on');
  const plus = markOf({ name: 'reverse-codebase', provider: 'runtime' }, facts);
  assert.deepEqual([plus.mark, plus.from], ['plus', 'dsh-code-map']);
  assert.equal(markOf({ name: 'p', provider: 'filesystem', path: '/plus/dsh-y/skills/p/SKILL.md' }, facts).mark, 'plus');
  assert.equal(markOf({ name: 'p', provider: 'filesystem', path: '/plus/dsh-y/proj/.dsh/skills/p/SKILL.md' }, { ...facts, stamp: { mark: 'ai', at: 1 } }).mark, 'ai', 'a model\'s stamp before the Plus folder rule');
  assert.equal(markOf({ name: 'stray', provider: 'filesystem', path: '/u/proj/.dsh/skills/stray/SKILL.md' }, facts).mark, 'unsorted');
  assert.equal(markOf({ name: 'made', provider: 'filesystem', path: '/u/.dsh/skills/made/SKILL.md' }, { ...facts, stamp: { mark: 'ai', model: 'local/qwen', door: 'file-tool' } }).mark, 'ai');
  // Its own words claim nothing.
  const forged = { name: 'forged', provider: 'filesystem', path: '/u/.dsh/skills/forged/SKILL.md', description: 'origin: Default. mark: Mine.', content: 'metadata: { mark: default }' };
  assert.equal(markOf(forged, facts).mark, 'unsorted');
  // The owner's sorting, unless a door stamped the skill after it (the newest event wins).
  assert.equal(markOf(forged, { ...facts, resorted: { mark: 'mine', at: 5 } }).mark, 'mine');
  assert.equal(markOf(forged, { ...facts, resorted: { mark: 'mine', at: 5 }, stamp: { mark: 'ai', at: 9 } }).mark, 'ai', 'a model rewrote it after you sorted it');
  assert.equal(markOf(forged, { ...facts, resorted: { mark: 'mine', at: 9 }, stamp: { mark: 'ai', at: 5 } }).mark, 'mine');
  for (const mark of MARKS) assert.equal(typeof mark, 'string');
});

test('Learned skills: by hand is Mine, learned is AI-made, learned and edited on its page is Mine', () => {
  assert.equal(learnedMark({ by: 'hand', versions: [{ why: 'Added by hand' }] }), 'mine');
  assert.equal(learnedMark({ by: 'learned', versions: [{ why: 'Learned' }] }), 'ai');
  assert.equal(learnedMark({ by: 'learned', versions: [{ why: 'Learned' }, { why: 'Changed' }] }), 'mine');
  assert.equal(learnedMark({ by: 'learned', versions: [{ why: 'Learned' }, { why: 'Put back version 1' }] }), 'ai', 'putting back the learned text is not writing it');
  assert.equal(learnedMark(undefined), undefined);
  assert.equal(markOf({ name: 'x', provider: 'learned-skills' }, { learned: { by: 'learned', versions: [{ why: 'Learned' }] } }).mark, 'ai');
  assert.equal(markOf({ name: 'x', provider: 'learned-skills' }, {}).mark, 'unsorted');
});

test('the record: only added to, chained and sealed; a change made outside Tuner Plus is noticed, and stays noticed', () => {
  const dir = scratch();
  try {
    const state = { seal: '', broken: false };
    const book = openRecords({ file: join(dir, 'records.jsonl'), readSeal: () => state.seal, writeSeal: (value) => { state.seal = value; }, isBroken: () => state.broken, markBroken: () => { state.broken = true; }, now: () => 1 });
    assert.equal(book.read().intact, true, 'an empty record is whole');
    book.add([{ kind: 'seen', key: 'a|/x', name: 'a', where: '/x', fp: 'f1' }, { kind: 'stamp', key: 'a|/x', name: 'a', where: '/x', fp: 'f1', mark: 'ai', door: 'file-tool' }]);
    book.add({ kind: 'sorted', keys: ['b|/y'], mark: 'mine' });
    assert.equal(book.read().intact, true);
    let index = indexRecords(book.read());
    assert.equal(index.get('a|/x').stamp.mark, 'ai');
    assert.equal(index.get('b|/y').sorted.mark, 'mine');
    const original = readFileSync(join(dir, 'records.jsonl'), 'utf8');
    const check = (label, text) => {
      writeFileSync(join(dir, 'records.jsonl'), text);
      assert.equal(book.read().intact, false, label);
      state.broken = false;
      writeFileSync(join(dir, 'records.jsonl'), original);
      assert.equal(book.read().intact, true, `${label}: whole again when put back`);
    };
    check('a line in the middle edited', original.replace('"mark":"ai"', '"mark":"mine"'));
    const lines = original.trim().split('\n');
    check('the last line taken out', `${lines.slice(0, -1).join('\n')}\n`);
    check('the first line taken out', `${lines.slice(1).join('\n')}\n`);
    // A forged line that links correctly to the last one, with the seal left alone: broken, and Tuner Plus
    // writes nothing more on top of it (that would make the forged line look like its own).
    const lastHash = createHash('sha256').update(lines.at(-1)).digest('hex');
    appendFileSync(join(dir, 'records.jsonl'), `${JSON.stringify({ kind: 'sorted', keys: ['a|/x'], mark: 'default', prev: lastHash })}\n`);
    assert.equal(book.read().intact, false);
    assert.equal(book.add({ kind: 'seen', key: 'c|/z', fp: 'f3' }), 0, 'nothing is added to a broken record');
    index = indexRecords(book.read());
    assert.equal(index.get('a|/x').stamp, undefined, 'stamps are not trusted');
    assert.equal(index.get('a|/x').sorted, undefined, 'nor sortings');
    assert.equal(index.get('a|/x').first.fp, 'f1', 'when a skill was first seen is still known');
    // Putting the old text back does not make it trusted again: only a new record does.
    writeFileSync(join(dir, 'records.jsonl'), original);
    assert.equal(book.read().intact, false, 'broken stays broken');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a skill that moved keeps its record', () => {
  const index = indexRecords({ intact: true, events: [
    { kind: 'seen', key: 'a|/old', fp: 'f1' },
    { kind: 'sorted', keys: ['a|/old'], mark: 'downloaded', at: 2 },
    { kind: 'seen', key: 'a|/new', fp: 'f1', from: 'a|/old' },
  ] });
  assert.equal(index.get('a|/new').sorted.mark, 'downloaded');
});

test('the doors read paths as the app\'s file tools do: ~ is home, .. goes through links, patch headers are trimmed', () => {
  assert.deepEqual(writeTargets('write', { file_path: 'notes/a.md' }, '/u/proj'), ['/u/proj/notes/a.md']);
  assert.deepEqual(writeTargets('edit', { file_path: '/abs/b.md' }, '/u/proj'), ['/abs/b.md']);
  assert.deepEqual(writeTargets('write', { file_path: '~/.dsh/tuning/skills/records.jsonl' }, '/u/proj'), [`${homedir()}/.dsh/tuning/skills/records.jsonl`]);
  const patch = '*** Begin Patch\n*** Add File: .dsh/skills/new-one/SKILL.md\n+x\n*** Update File: src/a.js\n*** Move to: .agents/skills/moved.md\n*** Delete File: old.md\n*** End Patch';
  assert.deepEqual(writeTargets('apply_patch', { input: patch }, '/u/proj'), ['/u/proj/.dsh/skills/new-one/SKILL.md', '/u/proj/src/a.js', '/u/proj/.agents/skills/moved.md', '/u/proj/old.md']);
  // Indented headers, as the app's own parser trims them (the review's first finding).
  const indented = '*** Begin Patch\n *** Add File: .agents/skills/evil/SKILL.md\n+x\n\t*** Update File: ~/.dsh/tuning/state.json\n *** Delete File: x.md\n*** End Patch';
  assert.deepEqual(writeTargets('apply_patch', { input: indented }, '/u/proj'), ['/u/proj/.agents/skills/evil/SKILL.md', `${homedir()}/.dsh/tuning/state.json`, '/u/proj/x.md']);
  assert.deepEqual(writeTargets('bash', { command: 'echo > .dsh/skills/x/SKILL.md' }, '/u/proj'), [], 'the shell is not a file tool (its skills show Not sorted)');
  assert.equal(skillOf('/u/proj/.dsh/skills/one/SKILL.md').folder, '/u/proj/.dsh/skills/one');
  assert.equal(skillOf('/u/proj/.dsh/skills/one/references/a.md').folder, '/u/proj/.dsh/skills/one', 'a file inside a skill belongs to it');
  assert.equal(skillOf('/u/.agents/skills/flat.md').folder, '/u/.agents/skills/flat.md');
  assert.equal(skillOf('/u/proj/.DSH/Skills/one/SKILL.md')?.entry, 'one', 'capitals do not matter on a Mac');
  assert.equal(skillOf('/data/custom-home/skills/two/SKILL.md', { dshHome: '/data/custom-home' })?.entry, 'two', 'the app\'s own data folder when it is not ~/.dsh');
  assert.equal(skillOf('/u/proj/skills/one/SKILL.md'), undefined, 'a folder merely called skills is not one the app reads');
  assert.equal(skillOf('/nexus/copilot/skills-real/one/run.sh', { known: ['/nexus/copilot/skills-real/one'] })?.entry, 'one', 'the real folder of a linked skill');
  const own = scratch();
  try {
    const refused = writeDecision({ name: 'write', args: { file_path: join(own, 'skills', 'records.jsonl') }, cwd: '/u', closed: CLOSED(own) });
    assert.match(refused.refuse, /may not write there/);
    // `..` through a link, as the disk resolves it: <link to own>/../<own's name>/x is inside own.
    const side = scratch();
    try {
      symlinkSync(join(own), join(side, 'link'));
      const through = writeDecision({ name: 'write', args: { file_path: `${side}/link/x.txt` }, cwd: '/u', closed: CLOSED(own) });
      assert.match(String(through.refuse), /may not write there/, 'through a link');
    } finally {
      rmSync(side, { recursive: true, force: true });
    }
    const asked = writeDecision({ name: 'write', args: { file_path: '.dsh/skills/new-one/SKILL.md' }, cwd: '/u/proj', closed: CLOSED(own) });
    assert.match(asked.ask, /new-one[\s\S]*Allow it this once\?/);
    assert.match(writeDecision({ name: 'write', args: { file_path: '.dsh/skills/new-one/SKILL.md' }, cwd: '/u/proj', closed: CLOSED(own), helper: true }).refuse, /helper may not write a skill/);
    assert.deepEqual(writeDecision({ name: 'write', args: { file_path: 'src/a.js' }, cwd: '/u/proj', closed: CLOSED(own) }), { skills: [] }, 'other writes: nothing changes');
    assert.deepEqual(writeDecision({ name: 'read', args: { file_path: join(own, 'x') }, cwd: '/u', closed: CLOSED(own) }), { skills: [] });
  } finally {
    rmSync(own, { recursive: true, force: true });
  }
  assert.equal(nameInFile('---\nname: my-skill\ndescription: x\n---\nbody'), 'my-skill');
  assert.equal(nameInFile('no front matter'), '');
  assert.equal(inReconRoom('/private/tmp/dsh-recon-room/x'), true);
  assert.equal(inReconRoom('/tmp/dsh-recon-copy-abc'), true);
  assert.equal(inReconRoom('/tmp/other'), false);
});

test('Plus add-ons name their skills in skill objects in their own files; a tool or a name two add-ons use is not counted', () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, 'dsh-a'));
    mkdirSync(join(dir, 'dsh-b'));
    writeFileSync(join(dir, 'dsh-a', 'skills.js'), "export const SKILLS = [{ name: 'one', description: 'x', content: `# One` }, { name: 'dup', description: 'y', content: 'z' }];");
    writeFileSync(join(dir, 'dsh-b', 'index.js'), "const skills = [{ name: 'two', description: 'x', content: 'y' }, { name: \"dup\", description: 'a', content: 'b' }];\nctx.tools.register({ name: 'remember', description: 'a tool', parameters: {}, execute() {} });");
    const found = plusNamesIn(dir, ['one', 'two', 'dup', 'remember', 'missing']);
    assert.deepEqual([...found.entries()].sort(), [['one', 'dsh-a'], ['two', 'dsh-b']]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('skills are listed from stamped projects first, then each conversation\'s own working folder too (Scratch); never a Recon room', () => {
  const dir = scratch();
  try {
    mkdirSync(join(dir, 'scratch', 'session-1'), { recursive: true });
    const folders = foldersToList({
      usual: join(dir, 'default'),
      read: [{ header: { id: 'session-1', cwd: join(dir, 'scratch') } }, { header: { id: 'session-2', cwd: join(dir, 'scratch') } }, { header: { id: 'c3', cwd: 'relative/path' } }, { header: { id: 'r1', cwd: '/private/tmp/dsh-recon-room' } }],
      stamped: [join(dir, 'proj', '.dsh', 'skills', 'made'), join(dir, 'home', '.agents', 'skills', 'flat.md'), '/not/a/skills/place', '/private/tmp/dsh-recon-copy-1/.agents/skills/x'],
    });
    assert.deepEqual(folders, [join(dir, 'default'), join(dir, 'proj'), join(dir, 'home'), join(dir, 'scratch'), join(dir, 'scratch', 'session-1')]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** The skills part on a stand-in app: made-up skills in a throwaway folder. */
function standIn({ on = true, answer = 'allowed-once', isolated = [] } = {}) {
  const dir = scratch();
  const state = { on, answer, asked: [], cards: [], skills: [], clock: 1_000 };
  const handlers = {};
  const guards = [];
  const tuning = join(dir, 'tuning');
  const dsh = join(dir, 'dsh');
  const app = join(dir, 'Made Up.app', 'Contents');
  const plus = join(dir, 'plus');
  mkdirSync(join(plus, 'dsh-code-map'), { recursive: true });
  writeFileSync(join(plus, 'dsh-code-map', 'skills.js'), "export const SKILLS = [{ name: 'reverse-codebase', description: 'x', content: 'y' }];");
  mkdirSync(join(dir, 'skill-architect'), { recursive: true });
  const learnedFile = join(dir, 'skill-architect', 'library.json');
  writeFileSync(learnedFile, JSON.stringify({ 'my-rule': { by: 'hand', versions: [{ why: 'Added by hand' }] }, 'learned-one': { by: 'learned', versions: [{ why: 'Learned' }] } }));
  const store = openStore(() => tuning);
  let working = '';
  const ctx = {
    get: (name) => ({
      dshHomePath: (...parts) => join(dsh, ...parts),
      tools: { guard: (fn) => { guards.push(fn); return () => {}; } },
      workingDirectory: { ensure: async () => working || undefined },
      modes: { isolated: (id) => isolated.includes(id) },
    })[name],
    on: (name, fn) => { handlers[name] = fn; },
    effect: (fn) => fn(),
  };
  const part = openSkills({
    ctx,
    store,
    on: () => state.on,
    now: () => state.clock,
    addCard: (card) => { state.cards.push(card); return card; },
    hasCard: (key) => state.cards.some((card) => card.key === key),
    readable: async () => ({ read: [] }),
    standIns: { listSkills: async () => state.skills, learnedFile, plusFolder: plus, appContents: app, dshHome: dsh },
  });
  const agent = (id = 'c1', parent) => ({ id, header: { cwd: join(dir, 'proj'), ...(parent ? { parentSession: parent } : {}) }, session: { requestHeader: () => ({ config: { provider: 'local', model: 'qwen' } }) } });
  /**
   * A call of the app's file tools through the part's rule, as the app's pipeline runs it: the rules after
   * it say `inner` (allow by default); an "ask" shows the app's approval card (the stand-in answers).
   */
  const call = async (exec, inner = { kind: 'allow' }) => {
    let decision = await handlers['tools/pre-execute'](exec, async () => inner);
    if (decision.kind === 'ask') {
      state.asked.push(decision.reason);
      decision = state.answer === 'allowed-once' ? { kind: 'allow' } : { kind: 'deny', reason: `the user rejected tool "${exec.name}"` };
    }
    return { decision, ran: decision.kind === 'allow' };
  };
  const written = (exec, path) => handlers['fs/observed']({ displayPath: path }, { kind: 'present' }, exec);
  const row = async (name) => (await part.sync()).rows?.find((one) => one.name === name);
  return { dir, state, part, store, call, written, row, guards, agent, tuning, dsh, app, learnedFile, ctxWorking: (folder) => { working = folder; }, close: () => rmSync(dir, { recursive: true, force: true }) };
}

test('four doors: with the app, by install, written by a model, typed by you; each gets its mark, set by nobody by hand', async () => {
  const w = standIn();
  try {
    const modelSkill = join(w.dsh, 'skills', 'model-made', 'SKILL.md');
    w.state.skills = [
      { name: 'office', provider: 'dsh-office', description: 'App Office', content: 'x', base: join(w.app, 'Resources', 'app.asar', 'dsh-skill-office', 'assets', 'office') },
      { name: 'company-research', provider: 'industry-research', description: 'A plugin skill', path: join(w.dir, 'profiles', 'desktop', 'node_modules', 'dsh-x', 'skills', 'company-research', 'SKILL.md') },
      { name: 'reverse-codebase', provider: 'runtime', description: 'Plus', content: 'y' },
      { name: 'my-rule', provider: 'learned-skills', description: 'Typed by hand in Learned skills', content: 'z' },
      { name: 'learned-one', provider: 'learned-skills', description: 'Learned', content: 'w' },
    ];
    // A model writes a skill with its file tools: the app asks first, then it is stamped with its model.
    const exec = { name: 'write', arguments: { file_path: modelSkill, content: '…' }, agent: w.agent() };
    const { ran } = await w.call(exec);
    assert.equal(ran, true);
    assert.match(w.state.asked[0], /model-made[\s\S]*Allow it this once\?/);
    skillFile(join(w.dsh, 'skills', 'model-made'), 'model-made');
    w.written(exec, modelSkill);
    w.state.skills.push({ name: 'model-made', provider: 'filesystem', description: 'A made-up skill called model-made.', path: modelSkill });
    const view = await w.part.sync();
    const mark = (name) => view.rows.find((one) => one.name === name);
    assert.equal(mark('office').mark, 'default');
    assert.equal(mark('company-research').mark, 'downloaded');
    assert.equal(mark('reverse-codebase').mark, 'plus');
    assert.equal(mark('my-rule').mark, 'mine');
    assert.equal(mark('learned-one').mark, 'ai');
    assert.equal(mark('model-made').mark, 'ai');
    assert.match(mark('model-made').why, /local\/qwen/);
    assert.equal(view.intact, true);
    const seen = () => readFileSync(join(w.tuning, 'skills', 'records.jsonl'), 'utf8').trim().split('\n').filter((line) => line.includes('"seen"')).length;
    assert.equal(seen(), 6, 'the first sorting: every skill seen once, with its fingerprint');
    await w.part.sync();
    assert.equal(seen(), 6, 'seen once, not at every look');
    // Learned skills' file changed afterwards to say "by hand": who made it stays as first seen.
    writeFileSync(w.learnedFile, JSON.stringify({ 'my-rule': { by: 'hand', versions: [{ why: 'Added by hand' }] }, 'learned-one': { by: 'hand', versions: [{ why: 'Learned' }] } }));
    assert.equal((await w.row('learned-one')).mark, 'ai');
  } finally {
    w.close();
  }
});

test('a stray folder dropped in by hand: Not sorted, treated as Downloaded, asked once; your sorting is kept, also when it moves', async () => {
  const w = standIn();
  try {
    const stray = skillFile(join(w.dir, 'proj', '.dsh', 'skills', 'stray'), 'stray');
    w.state.skills = [{ name: 'stray', provider: 'filesystem', description: 'x', path: stray }];
    const first = await w.row('stray');
    assert.deepEqual([first.mark, first.treatAs], ['unsorted', 'downloaded']);
    await w.part.sync();
    await w.part.sync();
    assert.equal(w.state.cards.length, 1, 'asked once, however often the page looks');
    assert.match(w.state.cards[0].text, /treats it as Downloaded/);
    assert.equal(w.part.sort([first.key], 'downloaded'), 1);
    assert.equal((await w.row('stray')).mark, 'downloaded');
    assert.equal((await w.row('stray')).why, 'sorted by you');
    // Moved to another folder: the record follows its fingerprint, the old place being gone.
    mkdirSync(join(w.dir, 'proj', '.agents', 'skills'), { recursive: true });
    renameSync(join(w.dir, 'proj', '.dsh', 'skills', 'stray'), join(w.dir, 'proj', '.agents', 'skills', 'stray'));
    w.state.skills = [{ name: 'stray', provider: 'filesystem', description: 'x', path: join(w.dir, 'proj', '.agents', 'skills', 'stray', 'SKILL.md') }];
    assert.equal((await w.row('stray')).mark, 'downloaded');
    assert.equal((await w.row('stray')).mark, 'downloaded', 'and on every look after');
    assert.throws(() => w.part.sort([first.key], 'favourite'), /not a mark/);
    assert.throws(() => w.part.sort(['nobody|/nowhere'], 'mine'), /Pick the skills/);
  } finally {
    w.close();
  }
});

test('a copy with the same text does not take another skill\'s record while that one is still on the disk', async () => {
  const w = standIn();
  try {
    const mine = skillFile(join(w.dir, 'proj', '.dsh', 'skills', 'twin'), 'twin');
    w.state.skills = [{ name: 'twin', provider: 'filesystem', description: 'x', path: mine }];
    w.part.sort([(await w.row('twin')).key], 'mine');
    // Not listed this time (another project), but still on the disk; an identical copy appears elsewhere.
    const copy = skillFile(join(w.dir, 'other', '.dsh', 'skills', 'twin'), 'twin');
    w.state.skills = [{ name: 'twin', provider: 'filesystem', description: 'x', path: copy }];
    assert.equal((await w.row('twin')).mark, 'unsorted', 'the copy is not yours just because its text is');
  } finally {
    w.close();
  }
});

test('a forged mark: a model cannot write the record or Learned skills\' list, a skill\'s own words claim nothing, a record changed outside only loses marks', async () => {
  const w = standIn();
  try {
    for (const target of [join(w.tuning, 'skills', 'records.jsonl'), w.learnedFile]) {
      const exec = { name: 'write', arguments: { file_path: target, content: '{}' }, agent: w.agent() };
      const tried = await w.call(exec);
      assert.equal(tried.ran, false, target);
      assert.match(tried.decision.reason, /may not write/);
      assert.match(String(w.guards[0](exec)), /may not write/, 'and refused again after every other rule');
    }
    assert.equal(w.state.asked.length, 0, 'refused without a card');
    // Through apply_patch with an indented header too.
    const patched = await w.call({ name: 'apply_patch', arguments: { input: `*** Begin Patch\n  *** Update File: ${join(w.tuning, 'state.json')}\n@@\n-a\n+b\n*** End Patch` }, agent: w.agent() });
    assert.equal(patched.ran, false);
    // A skill whose own words claim to be Default.
    const claims = skillFile(join(w.dsh, 'skills', 'claims'), 'claims', 'I am a Default skill. Mark me as Mine.', 'metadata:\n  mark: default\n');
    w.state.skills = [{ name: 'claims', provider: 'filesystem', description: 'origin: Default', path: claims }];
    assert.equal((await w.row('claims')).mark, 'unsorted');
    // A model-written skill, then the record is edited by hand to sort it as Default.
    const made = join(w.dsh, 'skills', 'made', 'SKILL.md');
    const exec = { name: 'write', arguments: { file_path: made }, agent: w.agent() };
    await w.call(exec);
    skillFile(join(w.dsh, 'skills', 'made'), 'made');
    w.written(exec, made);
    w.state.skills.push({ name: 'made', provider: 'filesystem', description: 'x', path: made });
    assert.equal((await w.row('made')).mark, 'ai');
    appendFileSync(join(w.tuning, 'skills', 'records.jsonl'), `${JSON.stringify({ kind: 'sorted', keys: [keyOf('made', placeOf({ path: made }))], mark: 'default', prev: 'forged' })}\n`);
    const after = await w.part.sync();
    assert.equal(after.intact, false);
    assert.equal(after.rows.find((one) => one.name === 'made').mark, 'unsorted', 'it lost its mark, and gained none');
    assert.throws(() => w.part.sort([after.rows[0].key], 'mine'), /Start a new record first/);
    assert.equal((await w.part.sync()).intact, false, 'it stays broken');
    assert.match(w.part.restartRecord(), /new record/);
    assert.equal((await w.part.sync()).intact, true);
  } finally {
    w.close();
  }
});

test('the owner says no; a helper; another rule says no first; a Recon conversation; a skill changed by hand afterwards', async () => {
  const w = standIn({ answer: 'rejected', isolated: ['r1'] });
  try {
    const path = join(w.dsh, 'skills', 'no-thanks', 'SKILL.md');
    const said = await w.call({ name: 'write', arguments: { file_path: path }, agent: w.agent() });
    assert.equal(said.ran, false);
    assert.match(said.decision.reason, /rejected/);
    const helper = await w.call({ name: 'write', arguments: { file_path: path }, agent: w.agent('h1', 'c1') });
    assert.equal(helper.ran, false);
    assert.match(helper.decision.reason, /helper may not write a skill/);
    // Another rule said no already: no card is shown for a call that will not run.
    const denied = await w.call({ name: 'write', arguments: { file_path: path }, agent: w.agent() }, { kind: 'deny', reason: 'another rule' });
    assert.deepEqual([denied.ran, denied.decision.reason], [false, 'another rule']);
    assert.equal(w.state.asked.length, 1, 'only the first call showed a card');
    // Other writes are not touched.
    assert.equal((await w.call({ name: 'write', arguments: { file_path: 'src/a.js' }, agent: w.agent() })).ran, true);
    // A write seen in a Recon conversation is never stamped.
    skillFile(join(w.dsh, 'skills', 'from-recon'), 'from-recon');
    w.written({ name: 'write', agent: w.agent('r1') }, join(w.dsh, 'skills', 'from-recon', 'SKILL.md'));
    assert.equal(existsSync(join(w.tuning, 'skills', 'records.jsonl')) ? readFileSync(join(w.tuning, 'skills', 'records.jsonl'), 'utf8').includes('from-recon') : false, false);
    // A model-written skill edited by hand later (its text, or a script beside it): it keeps its mark and shows Changed.
    w.state.answer = 'allowed-once';
    const exec = { name: 'write', arguments: { file_path: path }, agent: w.agent() };
    await w.call(exec);
    skillFile(join(w.dsh, 'skills', 'no-thanks'), 'no-thanks');
    w.written(exec, path);
    w.state.skills = [{ name: 'no-thanks', provider: 'filesystem', description: 'x', path }];
    assert.equal((await w.row('no-thanks')).changed, false);
    writeFileSync(join(w.dsh, 'skills', 'no-thanks', 'run.sh'), 'echo changed\n');
    const edited = await w.row('no-thanks');
    assert.deepEqual([edited.mark, edited.changed], ['ai', true], 'a script added beside it counts as a change');
    assert.notEqual(fingerprint(readFileSync(path, 'utf8')), '');
  } finally {
    w.close();
  }
});

test('your sorting, then a model rewrites the skill with your yes: the newest event wins', async () => {
  const w = standIn();
  try {
    const path = skillFile(join(w.dsh, 'skills', 'mine-first'), 'mine-first');
    w.state.skills = [{ name: 'mine-first', provider: 'filesystem', description: 'x', path }];
    w.part.sort([(await w.row('mine-first')).key], 'mine');
    assert.equal((await w.row('mine-first')).mark, 'mine');
    // Later, a model rewrites it, with your yes on the card: it is AI-made now, and not "Changed".
    w.state.clock = 2_000;
    const exec = { name: 'write', arguments: { file_path: path }, agent: w.agent() };
    assert.equal((await w.call(exec)).ran, true);
    writeFileSync(path, readFileSync(path, 'utf8').replace('Do the thing.', 'Do it the model\'s way.'));
    w.written(exec, path);
    const after = await w.row('mine-first');
    assert.deepEqual([after.mark, after.changed], ['ai', false]);
    // And you sort it again later: yours again.
    w.state.clock = 3_000;
    w.part.sort([after.key], 'mine');
    assert.equal((await w.row('mine-first')).mark, 'mine');
  } finally {
    w.close();
  }
});

test('the approval card names the folder the app really writes in (the conversation\'s own working folder)', async () => {
  const w = standIn();
  try {
    const own = join(w.dir, 'scratch', 'session-9');
    w.ctxWorking(own);
    const result = await w.call({ name: 'write', arguments: { file_path: '.dsh/skills/here/SKILL.md' }, agent: w.agent() });
    assert.equal(result.ran, true);
    assert.ok(w.state.asked[0].includes(`${own}/.dsh/skills/here`), w.state.asked[0]);
  } finally {
    w.close();
  }
});

test('with the skills part off nothing of it runs, writes or asks', async () => {
  const w = standIn({ on: false });
  try {
    const path = join(w.dsh, 'skills', 'any', 'SKILL.md');
    const exec = { name: 'write', arguments: { file_path: path }, agent: w.agent() };
    const result = await w.call(exec);
    assert.equal(result.ran, true);
    assert.equal(w.state.asked.length, 0, 'no card');
    skillFile(join(w.dsh, 'skills', 'any'), 'any');
    w.written(exec, path);
    assert.deepEqual(await w.part.sync(), { on: false });
    assert.equal(w.guards[0]({ name: 'write', arguments: { file_path: join(w.tuning, 'x') }, agent: w.agent() }), undefined);
    assert.equal(existsSync(join(w.tuning, 'skills')), false, 'nothing written');
    assert.throws(() => w.part.sort(['x'], 'mine'), /switched off/);
  } finally {
    w.close();
  }
});

test('on Tuner Plus\'s page: the switch, starting off; the list with marks once it is on; sorting from the page', async () => {
  const home = scratch();
  const config = { enabled: true, harvest: '{}', folder: '', python: '', models: '{}', teacher: '', teacherCloud: false, providers: '{}', anthropicOpenEnded: false, nightShift: false, idleMinutes: 15, nightMinutes: 30, nightTrain: '[]', examLimit: 40, ownNetworkLocal: false };
  const stray = skillFile(join(home, 'proj', '.dsh', 'skills', 'stray'), 'stray');
  let route;
  const services = {
    dshHomePath: (...parts) => join(home, ...parts),
    settings: {
      describe: () => [{ ns: 'modes', value: { sessionIsolated: '{}', sessionModes: '{}' } }, { ns: 'tuning', value: config }],
      mutate: async (_ns, ops) => { for (const op of ops) config[op.path[0]] = op.value; },
    },
    sessionQuery: { listSessions: async () => [], readSession: async () => ({ events: [] }) },
    tools: { register: () => () => {}, list: () => [] },
  };
  const ctx = {
    get: (name) => services[name],
    on: () => {},
    effect: (fn) => fn(),
    provide: () => {},
    inject: (_names, callback) => callback({ effect: (fn) => fn(), webServer: { register: (spec) => { route = spec.handler; return () => {}; } }, connection: { requestRejection: () => undefined } }),
    logger: { warn() {}, info() {} },
  };
  const page = async (body) => {
    let out = '';
    const res = { statusCode: 200, setHeader() {}, end: (text) => { out = text; } };
    await route(body ? { method: 'POST', async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)); } } : { method: 'GET', async *[Symbol.asyncIterator]() {} }, res);
    return JSON.parse(out);
  };
  try {
    apply(ctx, config, { skills: { listSkills: async () => [{ name: 'stray', provider: 'filesystem', description: 'x', path: stray }] } });
    assert.deepEqual((await page()).skills, { on: false }, 'starts off');
    assert.equal(existsSync(join(home, 'tuning', 'skills')), false);
    const on = await page({ action: 'set', field: 'skills', value: true });
    assert.equal(config.skills, true);
    assert.equal(on.skills.on, true);
    const row = on.skills.rows.find((one) => one.name === 'stray');
    assert.equal(row.mark, 'unsorted');
    const sorted = await page({ action: 'skillsSort', keys: [row.key], mark: 'mine' });
    assert.match(sorted.note, /1 skill sorted/);
    assert.equal(sorted.skills.rows.find((one) => one.name === 'stray').mark, 'mine');
    // The "not sorted" card came once; marking it "Not now" keeps it away.
    const card = sorted.cards?.find((one) => one.kind === 'skills');
    assert.ok(card, 'the card is on the page');
    await page({ action: 'card', card: card.id, do: 'later' });
    config.skills = true;
    const again = await page({ action: 'skillsRestart' });
    assert.equal(again.cards.filter((one) => one.kind === 'skills').length, 0, 'not asked again for the same skills after "Not now"');
    // Tuner Plus itself off: the skills part is off too.
    config.enabled = false;
    assert.deepEqual((await page()).skills, { on: false });
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a path is compared as the disk names it', () => {
  const dir = scratch();
  try {
    assert.equal(onDisk(join(dir, 'not', 'there', 'yet')), join(onDisk(dir), 'not', 'there', 'yet'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('same name, two places: the folders are read as the app reads them, and what the app picks hides the rest', async () => {
  const { frontOf, hiddenBehind, projectOf, rootsFor, sameSkill, scanRoot } = await import('../lib/skills/shadows.js');
  const dir = scratch();
  try {
    // The project is the nearest folder with .git.
    mkdirSync(join(dir, 'repo', '.git'), { recursive: true });
    mkdirSync(join(dir, 'repo', 'src', 'deep'), { recursive: true });
    assert.equal(projectOf(join(dir, 'repo', 'src', 'deep')), join(dir, 'repo'));
    assert.equal(projectOf(join(dir, 'loose')), join(dir, 'loose'), 'no .git: the folder itself');
    assert.deepEqual(rootsFor('/p', { dshHome: '/h', agentsHome: '/a' }).map((root) => [root.path, root.rank]), [['/p/.dsh/skills', 100], ['/p/.agents/skills', 200], ['/h/skills', 400], ['/a/skills', 500]]);
    // The top of a skill file: a name the app takes and a description, or nothing.
    assert.deepEqual(frontOf('---\nname: "read-pdf"\ndescription: Read PDFs\n---\nx'), { name: 'read-pdf', description: 'Read PDFs' });
    assert.deepEqual(frontOf('---\nname: Read_PDF\ndescription: x\n---\n'), {}, 'not a name the app takes');
    assert.deepEqual(frontOf('---\nname: no-description\n---\n'), {});
    assert.deepEqual(frontOf('no front matter'), {});
    const root = join(dir, 'repo', '.dsh', 'skills');
    skillFile(join(root, 'read-pdf'), 'read-pdf');
    writeFileSync(join(root, 'flat.md'), '---\nname: flat\ndescription: one file\n---\nbody\n');
    writeFileSync(join(root, 'notes.txt'), 'not a skill');
    skillFile(join(root, '.system'), 'system-one');
    assert.deepEqual(scanRoot(root).map((one) => one.name), ['flat', 'read-pdf']);
    assert.deepEqual(scanRoot(join(dir, 'missing')), []);
    // Same skill: the same file in any spelling; without files, the same provider.
    assert.equal(sameSkill({ path: join(root, 'read-pdf', 'SKILL.md') }, { path: join(root, '..', 'skills', 'read-pdf', 'SKILL.md') }), true);
    assert.equal(sameSkill({ provider: 'runtime' }, { provider: 'runtime' }), true);
    assert.equal(sameSkill({ provider: 'runtime' }, { provider: 'filesystem', path: '/x' }), false);
    // The app picked the project's file: the Plus skill and a lower folder's copy are hidden behind it.
    const winner = { name: 'read-pdf', provider: 'filesystem', path: join(root, 'read-pdf', 'SKILL.md') };
    const hidden = hiddenBehind({
      winners: new Map([['read-pdf', winner], ['flat', { name: 'flat', provider: 'filesystem', path: join(root, 'flat.md') }]]),
      candidates: [
        { name: 'read-pdf', provider: 'filesystem', path: join(root, 'read-pdf', 'SKILL.md') },
        { name: 'read-pdf', provider: 'filesystem', path: '/home/.agents/skills/read-pdf/SKILL.md' },
        { name: 'read-pdf', provider: 'runtime', path: '' },
        { name: 'read-pdf', provider: 'runtime', path: '' },
        { name: 'flat', provider: 'filesystem', path: join(root, 'flat.md') },
        { name: 'alone', provider: 'runtime', path: '' },
      ],
    });
    assert.deepEqual(hidden.map((one) => [one.name, one.provider, one.path]), [['read-pdf', 'filesystem', '/home/.agents/skills/read-pdf/SKILL.md'], ['read-pdf', 'runtime', '']]);
    assert.equal(hidden[1].hiddenBy.path, winner.path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the list shows which skill the model gets and which are hidden behind it, read from the app\'s own answers', async () => {
  const dir = scratch();
  const tuning = join(dir, 'tuning');
  const dsh = join(dir, 'dsh');
  const agents = join(dir, 'agents');
  const project = join(dir, 'proj');
  const app = join(dir, 'Made Up.app', 'Contents');
  try {
    // A project file named like the Plus skill read-pdf, and a copy in the shared folder: the project's wins.
    const projectFile = skillFile(join(project, '.dsh', 'skills', 'read-pdf'), 'read-pdf', 'My own PDF way.');
    const sharedFile = skillFile(join(agents, 'skills', 'read-pdf'), 'read-pdf', 'Another tool\'s PDF way.');
    skillFile(join(dsh, 'skills', 'only-mine'), 'only-mine');
    mkdirSync(join(dir, 'plus', 'dsh-pdf'), { recursive: true });
    writeFileSync(join(dir, 'plus', 'dsh-pdf', 'skills.js'), "export const SKILLS = [{ name: 'read-pdf', description: 'x', content: 'y' }];");
    const plusSkill = { name: 'read-pdf', description: 'Plus PDF reader', provider: 'runtime', source: 'custom' };
    const skills = {
      // The app's answer per folder: the winners only (as the real app answers).
      async list({ cwd, scope } = {}) {
        if (!cwd && !scope) return [plusSkill];
        if (cwd === project) return [{ name: 'read-pdf', description: 'A made-up skill called read-pdf.', provider: 'filesystem', source: 'project-dsh', path: projectFile }, { name: 'only-mine', description: 'x', provider: 'filesystem', path: join(dsh, 'skills', 'only-mine', 'SKILL.md') }];
        // Elsewhere the shared folder's file wins: a skill file always beats a skill a plugin serves.
        return [{ name: 'read-pdf', description: 'x', provider: 'filesystem', source: 'user-agents', path: sharedFile }, { name: 'only-mine', description: 'x', provider: 'filesystem', path: join(dsh, 'skills', 'only-mine', 'SKILL.md') }];
      },
      async get(name) {
        return name === 'read-pdf' ? { name, content: 'Plus PDF text', provider: 'runtime' } : undefined;
      },
    };
    const store = openStore(() => tuning);
    const part = openSkills({
      ctx: { get: (name) => ({ skills, dshHomePath: (...parts) => join(dsh, ...parts), workingDirectory: { defaultDirectory: join(dir, 'default') } })[name], on: () => {}, effect: (fn) => fn() },
      store,
      on: () => true,
      now: () => 1,
      addCard: () => {},
      readable: async () => ({ read: [{ header: { id: 'c1', cwd: project } }] }),
      standIns: { plusFolder: join(dir, 'plus'), appContents: app, dshHome: dsh, agentsHome: agents, learnedFile: join(dir, 'none.json') },
    });
    const view = await part.sync();
    const rows = view.rows.filter((row) => row.name === 'read-pdf');
    assert.equal(rows.length, 3, 'the project file, the shared copy and the Plus skill');
    const mine = rows.find((row) => row.path === projectFile);
    const plus = rows.find((row) => row.provider === 'runtime');
    const shared = rows.find((row) => row.path === sharedFile);
    assert.equal(mine.hides, 2, 'in the project the model gets the project\'s file; it hides the shared copy and the Plus skill');
    assert.equal(mine.hiddenIn.length, 0);
    assert.equal(plus.mark, 'plus');
    assert.deepEqual(plus.hiddenIn.map((one) => one.byPlace).sort(), [placeOf({ path: projectFile }), placeOf({ path: sharedFile })].sort(), 'hidden everywhere, behind a different file in each place');
    assert.equal(shared.hides, 1, 'in the default folder the shared copy wins and hides the Plus skill');
    assert.equal(shared.hiddenIn.length, 1, 'and in the project it is hidden itself');
    assert.equal(shared.mark, 'unsorted');
    assert.equal(view.rows.find((row) => row.name === 'only-mine').hides, 0);
    assert.equal(view.counts.shared, 1, 'one name is shared');
    // The Plus skill is hidden in two places behind two files; each of those files hides it once.
    assert.equal(plus.hiddenIn.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the writer: the app\'s own format and name rule, never a name that is taken or an office one, never the default workspace, Recon or the shared folder', async () => {
  const { contentProblem, nameProblem, skillFileText, targetFor, writeSkillFile } = await import('../lib/skills/writer.js');
  const { frontOf } = await import('../lib/skills/shadows.js');
  const dir = scratch();
  try {
    assert.equal(nameProblem('write-changelogs', new Set()), '');
    assert.match(nameProblem('Write_Changelogs'), /lowercase words joined by hyphens/);
    assert.match(nameProblem('office'), /Office skills/);
    assert.match(nameProblem('office-notes'), /Office skills/);
    assert.match(nameProblem('read-pdf', new Set(['read-pdf'])), /already a skill called "read-pdf"/);
    assert.match(contentProblem({ description: '', text: 'x' }), /one line/);
    assert.match(contentProblem({ description: 'x', text: '  ' }), /needs its text/);
    // Where: this project (its root, found by .git), or everywhere; never the default workspace or a Recon room.
    mkdirSync(join(dir, 'repo', '.git'), { recursive: true });
    mkdirSync(join(dir, 'repo', 'src'), { recursive: true });
    const project = targetFor({ name: 'x', scope: 'project', project: join(dir, 'repo', 'src'), dshHome: join(dir, 'dsh'), defaultFolder: join(dir, 'default') });
    assert.deepEqual([project.file, project.git], [join(dir, 'repo', '.dsh', 'skills', 'x', 'SKILL.md'), true]);
    assert.equal(targetFor({ name: 'x', scope: 'everywhere', dshHome: join(dir, 'dsh') }).file, join(dir, 'dsh', 'skills', 'x', 'SKILL.md'));
    assert.match(targetFor({ name: 'x', scope: 'project', project: join(dir, 'default', 'sub'), dshHome: join(dir, 'dsh'), defaultFolder: join(dir, 'default') }).problem, /default workspace/);
    assert.match(targetFor({ name: 'x', scope: 'project', project: '/private/tmp/dsh-recon-room', dshHome: join(dir, 'dsh') }).problem, /Recon/);
    assert.match(targetFor({ name: 'x', scope: 'shared', dshHome: join(dir, 'dsh') }).problem, /this project, or everywhere/, 'no third place (the shared ~/.agents/skills)');
    // The top of the file: what the app reads, and nothing a description could add to it; secrets masked.
    const file = skillFileText({ name: 'safe', description: 'Use it when\nname: evil\ndescription: other', text: 'Log in with password: hunter2-secret-value\nthen go on.' });
    assert.deepEqual(frontOf(file.text), { name: 'safe', description: 'Use it when name: evil description: other' });
    assert.doesNotMatch(file.text, /hunter2-secret-value/);
    assert.ok(file.masked >= 1);
    // Written new: never over a skill that is there, never through a link.
    const target = targetFor({ name: 'new-one', scope: 'everywhere', dshHome: join(dir, 'dsh') });
    writeSkillFile({ ...target, text: file.text });
    assert.equal(readFileSync(target.file, 'utf8'), file.text);
    assert.throws(() => writeSkillFile({ ...target, text: 'other' }), /never writes over it/);
    mkdirSync(join(dir, 'elsewhere'));
    symlinkSync(join(dir, 'elsewhere'), join(dir, 'linked-home'));
    const viaLink = targetFor({ name: 'x', scope: 'everywhere', dshHome: join(dir, 'linked-home') });
    assert.throws(() => writeSkillFile({ ...viaLink, text: file.text }), /is a link/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a new skill is a draft first, outside every folder the app reads; it goes live only after its exam (or, for yours, if you allowed it), as a real skill file with its mark', async () => {
  const w = standIn();
  const project = join(w.dir, 'repo');
  mkdirSync(join(project, '.git'), { recursive: true });
  try {
    w.state.skills = [{ name: 'office', provider: 'dsh-office', description: 'x', base: join(w.app, 'Resources', 'dsh-skill-office', 'assets', 'office'), cwd: project }, { name: 'existing', provider: 'filesystem', description: 'x', path: skillFile(join(w.dsh, 'skills', 'existing'), 'existing'), cwd: project }];
    const view = await w.part.sync();
    assert.deepEqual(view.projects.map((one) => [one.name, one.git]), [['repo', true]]);
    // Names taken anywhere are refused: an app skill, a skill file, a Learned skill, another draft.
    for (const name of ['office', 'existing', 'my-rule']) await assert.rejects(w.part.draft({ name, description: 'x', text: 'y', scope: 'everywhere' }), /already a skill called|Office skills/, name);
    const mine = await w.part.draft({ name: 'write-changelogs', description: 'When writing a changelog', text: 'Plain words. Newest first.', scope: 'project', project });
    assert.equal(mine.git, true);
    assert.equal(mine.file, join(project, '.dsh', 'skills', 'write-changelogs', 'SKILL.md'));
    assert.equal(existsSync(mine.file), false, 'a draft is not in any folder the app reads');
    await assert.rejects(w.part.draft({ name: 'write-changelogs', description: 'x', text: 'y', scope: 'everywhere' }), /already a skill called/, 'another draft has the name');
    assert.equal(w.part.drafts().length, 1);
    // No skill goes live before its exam.
    await assert.rejects(w.part.goLive(mine.id), /waits for its exam/);
    assert.equal(existsSync(mine.file), false);
    // Once the exam passed (the next step writes this), it goes live: a real skill file, stamped Mine (you wrote it).
    const draftPath = join(w.tuning, 'skills', 'drafts', `${mine.id}.json`);
    passExam(draftPath);
    const live = await w.part.goLive(mine.id);
    assert.equal(live.file, mine.file);
    assert.match(readFileSync(mine.file, 'utf8'), /^---\nname: "write-changelogs"\ndescription: "When writing a changelog"\n---\nPlain words\. Newest first\.\n$/);
    w.state.skills.push({ name: 'write-changelogs', provider: 'filesystem', description: 'When writing a changelog', path: mine.file, cwd: project });
    const row = await w.row('write-changelogs');
    assert.deepEqual([row.mark, row.why, row.changed], ['mine', 'written by you', false]);
    await assert.rejects(w.part.goLive(mine.id), /no such draft/, 'once live, it is no draft any more');
    // A draft a model wrote is AI-made once live.
    const model = await w.part.draft({ name: 'model-idea', description: 'x', text: 'y', scope: 'everywhere', by: 'model', model: 'local/qwen' });
    const modelPath = join(w.tuning, 'skills', 'drafts', `${model.id}.json`);
    passExam(modelPath);
    const modelLive = await w.part.goLive(model.id);
    w.state.skills.push({ name: 'model-idea', provider: 'filesystem', description: 'x', path: modelLive.file, cwd: project });
    assert.equal((await w.row('model-idea')).mark, 'ai');
    // Dropping keeps nothing in any skills folder.
    const dropped = await w.part.draft({ name: 'not-needed', description: 'x', text: 'y', scope: 'everywhere' });
    assert.equal(w.part.dropDraft(dropped.id), 'not-needed');
    assert.equal(w.part.drafts().some((one) => one.id === dropped.id), false);
    assert.throws(() => w.part.dropDraft('../../etc'), /no such draft/);
  } finally {
    w.close();
  }
});

test('a skill you typed may go live before the exam only if you allowed that; a model\'s never', async () => {
  const dir = scratch();
  try {
    let allowed = false;
    const store = openStore(() => join(dir, 'tuning'));
    const part = openSkills({
      ctx: { get: (name) => ({ dshHomePath: (...parts) => join(dir, 'dsh', ...parts) })[name], on: () => {}, effect: (fn) => fn() },
      store,
      on: () => true,
      now: () => 1,
      addCard: () => {},
      readable: async () => ({ read: [] }),
      liveWithoutExam: () => allowed,
      standIns: { listSkills: async () => [], learnedFile: join(dir, 'none.json'), plusFolder: join(dir, 'plus'), appContents: join(dir, 'App.app', 'Contents'), dshHome: join(dir, 'dsh') },
    });
    const yours = await part.draft({ name: 'yours', description: 'x', text: 'y', scope: 'everywhere' });
    const models = await part.draft({ name: 'models', description: 'x', text: 'y', scope: 'everywhere', by: 'model' });
    await assert.rejects(part.goLive(yours.id), /waits for its exam/);
    allowed = true;
    await assert.rejects(part.goLive(yours.id), /Show its whole text first/, 'you see it first, also without an exam');
    part.markShown(yours.id);
    assert.equal((await part.goLive(yours.id)).name, 'yours');
    await assert.rejects(part.goLive(models.id), /waits for its exam/, 'a model\'s draft always waits for its exam');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- the independent review of step 6 (17 November): one test for each finding --------------------

test('the writer, reviewed: a name like "true" stays a name; a secret the masking cannot judge stops the save; the folder checked is the one written in', async () => {
  const { preflight, skillFileText, targetFor, writeSkillFile } = await import('../lib/skills/writer.js');
  const { frontOf } = await import('../lib/skills/shadows.js');
  const dir = scratch();
  try {
    // Quoted at the top, so the app's reader takes "true" or "123" as a name, not as yes or a number.
    for (const name of ['true', '123', 'null']) {
      const file = skillFileText({ name, description: 'x', text: 'y' });
      assert.match(file.text, new RegExp(`^---\\nname: "${name}"\\n`));
      assert.equal(frontOf(file.text).name, name);
    }
    // A labelled secret the masking leaves in place is flagged; one it masked, or plain words, are not.
    assert.equal(skillFileText({ name: 'x', description: 'x', text: 'password: [hunter2xyz]' }).unsure, true);
    assert.equal(skillFileText({ name: 'x', description: 'token = [made-up-value]', text: 'y' }).unsure, true, 'the description too');
    assert.equal(skillFileText({ name: 'x', description: 'x', text: 'api key = "abcdef12345"' }).unsure, false);
    assert.equal(skillFileText({ name: 'x', description: 'x', text: 'The password field must not be empty.' }).unsure, false);
    // A Recon room in the temporary folder, as the disk spells it too (Recon's test copies live there).
    assert.equal(inReconRoom(join(tmpdir(), 'dsh-recon-copy-1a2b', '.dsh', 'skills')), true);
    assert.equal(targetFor({ name: 'x', scope: 'project', project: join(tmpdir(), 'dsh-recon-copy-1a2b'), dshHome: join(dir, 'dsh') }).problem, 'Recon\'s room never gets a skill.');
    // A project that is the home folder: its skills folder is the "everywhere" one.
    const home = join(dir, 'home');
    mkdirSync(home);
    assert.match(targetFor({ name: 'x', scope: 'project', project: home, dshHome: join(home, '.dsh') }).problem, /is the "everywhere" one/);
    // A project that holds the default workspace (the workspace has no .git of its own): never.
    mkdirSync(join(dir, 'repo', '.git'), { recursive: true });
    mkdirSync(join(dir, 'repo', 'workspace'), { recursive: true });
    assert.match(targetFor({ name: 'x', scope: 'project', project: join(dir, 'repo'), dshHome: join(dir, 'dsh'), defaultFolder: join(dir, 'repo', 'workspace') }).problem, /default workspace/);
    // The shared skills folder other tools read, whichever way it is reached.
    const agents = join(dir, 'agents');
    assert.match(targetFor({ name: 'x', scope: 'project', project: join(agents, 'skills', 'inside'), dshHome: join(dir, 'dsh'), agentsHome: agents }).problem, /shared skills folder/);
    assert.match(targetFor({ name: 'x', scope: 'everywhere', dshHome: agents, agentsHome: agents }).problem, /shared skills folder/);
    // Seen before anything is kept: something of that name in other capitals, or a file where a folder must be.
    const root = join(dir, 'dsh', 'skills');
    mkdirSync(join(root, 'New-One'), { recursive: true });
    assert.match(preflight({ root, folder: join(root, 'new-one') }), /already something called new-one/);
    mkdirSync(join(dir, 'flat'), { recursive: true });
    writeFileSync(join(dir, 'flat', '.dsh'), 'a file, not a folder');
    assert.match(preflight({ root: join(dir, 'flat', '.dsh', 'skills'), folder: join(dir, 'flat', '.dsh', 'skills', 'x') }), /is not a folder/);
    // The app's data folder reached through a linked parent folder is still written (only the last two steps must not be links).
    mkdirSync(join(dir, 'real-parent', 'dsh'), { recursive: true });
    symlinkSync(join(dir, 'real-parent'), join(dir, 'linked-parent'));
    const through = targetFor({ name: 'through-link', scope: 'everywhere', dshHome: join(dir, 'linked-parent', 'dsh') });
    assert.equal(writeSkillFile({ ...through, text: skillFileText({ name: 'through-link', description: 'x', text: 'y' }).text }), through.file);
    assert.ok(existsSync(join(dir, 'real-parent', 'dsh', 'skills', 'through-link', 'SKILL.md')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('drafts, reviewed: deleted learned names are taken, a double click makes one draft, an unsure secret or a path not offered is refused, nothing works while off', async () => {
  const w = standIn();
  const project = join(w.dir, 'repo');
  mkdirSync(join(project, '.git'), { recursive: true });
  try {
    writeFileSync(w.learnedFile, JSON.stringify({ 'my-rule': { by: 'hand', versions: [{ why: 'x' }] }, 'gone-one': { by: 'learned', deleted: true, versions: [{ why: 'x' }] } }));
    w.state.skills = [{ name: 'existing', provider: 'filesystem', description: 'x', path: skillFile(join(project, '.dsh', 'skills', 'existing'), 'existing'), cwd: project }];
    // A deleted learned skill can be put back, so its name stays taken.
    await assert.rejects(w.part.draft({ name: 'gone-one', description: 'x', text: 'y', scope: 'everywhere' }), /already a skill called "gone-one"/);
    // Two saves at once (a double click): one draft, the other refused for the name.
    const both = await Promise.allSettled([1, 2].map(() => w.part.draft({ name: 'twice', description: 'x', text: 'y', scope: 'everywhere' })));
    assert.deepEqual(both.map((one) => one.status).sort(), ['fulfilled', 'rejected']);
    assert.match(both.find((one) => one.status === 'rejected').reason.message, /already a skill called "twice"/);
    assert.equal(w.part.drafts().filter((one) => one.name === 'twice').length, 1);
    // A secret the masking could not judge: nothing is kept.
    await assert.rejects(w.part.draft({ name: 'with-secret', description: 'x', text: 'password: [hunter2xyz]', scope: 'everywhere' }), /password or key/);
    assert.equal(w.part.drafts().some((one) => one.name === 'with-secret'), false);
    // Only a project the page offered; any other path sent in is refused.
    const other = join(w.dir, 'elsewhere');
    mkdirSync(join(other, '.git'), { recursive: true });
    await assert.rejects(w.part.draft({ name: 'stray', description: 'x', text: 'y', scope: 'project', project: other }), /projects offered/);
    // A file where the project's .dsh folder must be: refused when saving the draft, not later.
    const flat = join(w.dir, 'flat');
    mkdirSync(join(flat, '.git'), { recursive: true });
    writeFileSync(join(flat, '.dsh'), 'a file');
    w.state.skills.push({ name: 'in-flat', provider: 'dsh-office', description: 'x', cwd: flat });
    await assert.rejects(w.part.draft({ name: 'flat-one', description: 'x', text: 'y', scope: 'project', project: flat }), /is not a folder/);
    // Switched off: no draft is made, put live or dropped.
    const kept = w.part.drafts().find((one) => one.name === 'twice');
    w.state.on = false;
    await assert.rejects(w.part.draft({ name: 'while-off', description: 'x', text: 'y', scope: 'everywhere' }), /switched off/);
    await assert.rejects(w.part.goLive(kept.id), /switched off/);
    assert.throws(() => w.part.dropDraft(kept.id), /switched off/);
    w.state.on = true;
    assert.equal(w.part.drafts().some((one) => one.id === kept.id), true);
  } finally {
    w.close();
  }
});

test('drafts, reviewed: projects come from every folder the skills were listed from (one without skills too); a listing that failed refuses every name', async () => {
  const dir = scratch();
  try {
    const dsh = join(dir, 'dsh');
    const quiet = join(dir, 'quiet');
    const busy = join(dir, 'busy');
    for (const one of [quiet, busy]) mkdirSync(join(one, '.git'), { recursive: true });
    skillFile(join(busy, '.dsh', 'skills', 'busy-skill'), 'busy-skill');
    const broken = new Set();
    const ctx = {
      get: (name) => ({
        dshHomePath: (...parts) => join(dsh, ...parts),
        skills: {
          list: async ({ cwd } = {}) => {
            if (cwd && broken.has(cwd)) throw new Error('could not read');
            return cwd === busy ? [{ name: 'busy-skill', provider: 'filesystem', description: 'x', path: join(busy, '.dsh', 'skills', 'busy-skill', 'SKILL.md') }] : [];
          },
          get: async () => ({ content: '' }),
        },
        workingDirectory: { defaultDirectory: join(dir, 'default') },
        agentPresets: { acquireScope: async () => ({ key: 'lab', [Symbol.asyncDispose]: async () => {} }) },
      })[name],
      on: () => {},
      effect: (fn) => fn(),
    };
    const part = openSkills({
      ctx,
      store: openStore(() => join(dir, 'tuning')),
      on: () => true,
      now: () => 1,
      addCard: () => {},
      readable: async () => ({ read: [{ header: { cwd: quiet, id: 'c1' } }, { header: { cwd: busy, id: 'c2' } }] }),
      standIns: { learnedFile: join(dir, 'none.json'), plusFolder: join(dir, 'plus'), appContents: join(dir, 'App.app', 'Contents'), dshHome: dsh, agentsHome: join(dir, 'agents') },
    });
    const view = await part.sync();
    assert.deepEqual(view.projects.map((one) => one.name).sort(), ['busy', 'quiet'], 'a project with no skill yet is offered too');
    const made = await part.draft({ name: 'for-quiet', description: 'x', text: 'y', scope: 'project', project: quiet });
    assert.equal(made.file, join(quiet, '.dsh', 'skills', 'for-quiet', 'SKILL.md'));
    await assert.rejects(part.draft({ name: 'busy-skill', description: 'x', text: 'y', scope: 'everywhere' }), /already a skill called/);
    // One folder could not be listed: nobody can say a name is free, so every name waits.
    broken.add(busy);
    await assert.rejects(part.draft({ name: 'brand-new', description: 'x', text: 'y', scope: 'everywhere' }), /cannot be sure the name is free/);
    broken.clear();
    assert.equal((await part.draft({ name: 'brand-new', description: 'x', text: 'y', scope: 'everywhere' })).name, 'brand-new');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the default workspace is the app\'s own folder (Documents/deepseek-harness/default-workspace), not the working-folder service\'s start folder (the lab of step 7)', async () => {
  const { DEFAULT_WORKSPACE } = await import('../lib/skills/part.js');
  const { targetFor } = await import('../lib/skills/writer.js');
  // Only its path is used here: nothing is written in the real default workspace.
  assert.equal(DEFAULT_WORKSPACE, join(homedir(), 'Documents', 'deepseek-harness', 'default-workspace'));
  assert.match(targetFor({ name: 'x', scope: 'project', project: DEFAULT_WORKSPACE, dshHome: '/nowhere/.dsh', defaultFolder: [DEFAULT_WORKSPACE] }).problem, /default workspace/);
  const dir = scratch();
  try {
    const quiet = join(dir, 'quiet');
    mkdirSync(join(quiet, '.git'), { recursive: true });
    const open = (defaultDirectory) => openSkills({
      ctx: {
        get: (name) => ({
          dshHomePath: (...parts) => join(dir, 'dsh', ...parts),
          skills: { list: async () => [], get: async () => ({ content: '' }) },
          workingDirectory: { defaultDirectory },
          agentPresets: { acquireScope: async () => ({ key: 'lab', [Symbol.asyncDispose]: async () => {} }) },
        })[name],
        on: () => {},
        effect: (fn) => fn(),
      },
      store: openStore(() => join(dir, `tuning-${String(defaultDirectory).length}`)),
      on: () => true,
      now: () => 1,
      addCard: () => {},
      // Two conversations: one in the app's default workspace, one in a project of its own.
      readable: async () => ({ read: [{ header: { cwd: DEFAULT_WORKSPACE, id: 'c1' } }, { header: { cwd: quiet, id: 'c2' } }] }),
      standIns: { learnedFile: join(dir, 'none.json'), plusFolder: join(dir, 'plus'), appContents: join(dir, 'App.app', 'Contents'), dshHome: join(dir, 'dsh'), agentsHome: join(dir, 'agents') },
    });
    // The service's start folder is the profile folder on the owner's Mac: the default workspace is still never offered.
    const desktop = open(join(dir, 'profiles', 'desktop'));
    const names = (await desktop.sync()).projects.map((one) => one.path);
    assert.equal(names.includes(DEFAULT_WORKSPACE), false, 'the default workspace is never offered');
    assert.ok(names.includes(quiet));
    await assert.rejects(desktop.draft({ name: 'into-default', description: 'x', text: 'y', scope: 'project', project: DEFAULT_WORKSPACE }), /projects offered|default workspace/);
    // A start folder of "/" or the home folder would close every project: it is not taken as the default workspace.
    for (const start of ['/', homedir()]) assert.ok((await open(start).sync()).projects.some((one) => one.path === quiet), start);
    // A start folder that is a real working folder is closed too.
    assert.equal((await open(quiet).sync()).projects.some((one) => one.path === quiet), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('built from outside material: the mark stays when a model edits the skill later (the review of step 8)', async () => {
  const w = standIn();
  try {
    const made = await w.part.draft({ name: 'from-a-guide', description: 'When following the guide', text: 'Steps.', scope: 'everywhere', by: 'model', model: 'local/qwen', origin: { kind: 'chat', source: 'https://example.com/guide' } });
    passExam(join(w.tuning, 'skills', 'drafts', `${made.id}.json`));
    const live = await w.part.goLive(made.id);
    w.state.skills.push({ name: 'from-a-guide', provider: 'filesystem', description: 'When following the guide', path: live.file });
    assert.equal((await w.row('from-a-guide')).outside, 'https://example.com/guide');
    // A model edits it later with its file tools: the new stamp keeps the mark.
    writeFileSync(live.file, `${readFileSync(live.file, 'utf8')}More.\n`);
    w.written({ name: 'edit', agent: w.agent('c1'), arguments: { file_path: live.file } }, live.file);
    w.state.clock += 10;
    const row = await w.row('from-a-guide');
    assert.equal(row.mark, 'ai');
    assert.equal(row.outside, 'https://example.com/guide');
  } finally {
    w.close();
  }
});
