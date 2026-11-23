/**
 * Item 4A, stage 6b, Part A (STAGE6B-DESIGN.md J1, J2, C1, C5): an engine runs in the Code space only, in any mode; it
 * needs Modes to say so (no fallback to "Code mode"); everything else gets a sentence in the thread and nothing runs.
 * Stand-ins only (as test/space-6a.test.mjs): a missing program path keeps any real OpenCode out of the test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENGINE_TEXTS, GUARDED_ENGINE_TEXT, apply, engineAllowed, engineText } from '../index.js';

// An older Modes may still answer a 'zh' table (here: stand-in words, not Chinese); Engines must never ask for it.
const NAMES = { en: { chat: 'Chat', code: 'Code', devices: 'Devices', recon: 'Recon', workshop: 'Workshop' }, zh: { chat: 'ZH-chat', code: 'ZH-code', devices: 'ZH-devices', recon: 'ZH-recon', workshop: 'ZH-workshop' } };
const MODE_NAMES = { code: 'Code', research: 'Research', mine: 'My notes', bench: 'Devices', 'creator-plus': 'Creator Plus' };

/** A Modes stand-in (apiVersion 2) whose guardOf answers these fields for every id. */
function modesWith(fields = {}, extra = {}) {
  return {
    apiVersion: 2,
    get: () => fields.mode ?? 'code',
    isolated: () => false,
    modeName: (id) => MODE_NAMES[id] ?? id,
    spaces: { names: (lang) => NAMES[lang === 'zh' ? 'zh' : 'en'], pageLang: () => extra.lang ?? '' },
    guardOf: (id) => ({ top: id, space: 'code', mode: 'code', sealed: false, sealedBy: '', reconSpace: false, guardedBy: '', noPrograms: false, homeMode: false, fresh: false, unknownTop: false, ...fields }),
    ...extra.service,
  };
}

function standIn(modes, { cwd } = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-engines-6b-'));
  let adapter;
  let command;
  const agent = { id: 't1', header: { cwd: cwd ?? home } };
  const services = { dshHomePath: (part) => join(home, part), agents: { currentInitiator: () => agent, get: () => agent }, modes };
  const ctx = {
    get: (name) => {
      const value = services[name];
      if (value instanceof Error) throw value;
      return value;
    },
    logger: { warn() {}, info() {} },
    effect: (make) => make(),
    on: () => () => {},
    inject: (names, use) => {
      if (names.length === 1 && names[0] === 'llm') use({ llm: { registerAdapter: (_providers, a) => { adapter = a; return () => {}; } }, effect: (make) => make() });
      if (names.length === 1 && names[0] === 'commands') use({ commands: { register: (spec) => { command = spec; return () => {}; } }, effect: (make) => make() });
    },
  };
  apply(ctx, { opencodePath: '/nonexistent/opencode', maxMinutes: 1, opencodeModels: [], applyWhen: 'review' });
  const send = async () => {
    let text = '';
    for await (const part of adapter.stream({ provider: 'engine-opencode', model: 'default', messages: [{ role: 'user', content: 'write a file' }], tools: [{ name: 'read' }] })) {
      if (part.type === 'text-delta') text += part.text;
    }
    return text;
  };
  const engine = (rawInput) => command.handler({ agent, rawInput });
  return { send, engine, done: () => rmSync(home, { recursive: true, force: true }) };
}

async function said(modes) {
  const app = standIn(modes);
  try {
    return await app.send();
  } finally {
    app.done();
  }
}

test('engine-code-space-any-mode: Code, Research, Plain chat, Data and an owner\'s mode in the Code space reach the engine', async () => {
  for (const mode of ['code', 'research', 'plain', 'data', 'mine']) {
    assert.equal(engineAllowed(() => modesWith({ mode }), 't1'), '', mode);
    const text = await said(modesWith({ mode }));
    assert.doesNotMatch(text, /Engines work only|do not run|Nothing was run: the Modes/, mode);
    assert.match(text, /not installed/, `${mode}: reaches the program lookup (none here)`);
  }
});

test('engine-chat-space-refused: Code mode ticked into Chat no longer runs an engine (D1); the sentence names the space', async () => {
  assert.equal(engineAllowed(() => modesWith({ space: 'chat', mode: 'code' }), 't1'), 'notCode');
  const text = await said(modesWith({ space: 'chat', mode: 'code' }));
  assert.equal(text, engineText('codeSpaceOnly', 'en', { space: 'Chat' }));
  assert.match(text, /^Engines work only in the Code space\. This thread is in Chat, so nothing was run\. Pick one of your models for it, or start a thread in the Code space\.$/);
});

test('engine-old-modes-refused: a Modes older than apiVersion 2, or one without guardOf, refuses (no fallback to the mode)', async () => {
  const old = { ...modesWith({}), apiVersion: 1 };
  assert.equal(engineAllowed(() => old, 't1'), 'noModes');
  assert.equal(await said(old), ENGINE_TEXTS.en.needsModes);
  const noGuard = { apiVersion: 2, get: () => 'code', spaces: { of: () => 'code' } };
  assert.equal(engineAllowed(() => noGuard, 't1'), 'noModes');
  assert.equal(await said(noGuard), ENGINE_TEXTS.en.needsModes);
});

test('engine-no-modes-refused: no Modes, or a Modes that throws when asked for, refuses with what to switch on', async () => {
  assert.equal(engineAllowed(() => undefined, 't1'), 'noModes');
  assert.equal(engineAllowed(() => { throw new Error('gone'); }, 't1'), 'noModes');
  assert.equal(await said(undefined), ENGINE_TEXTS.en.needsModes);
  assert.equal(await said(new Error('gone')), ENGINE_TEXTS.en.needsModes);
  assert.match(ENGINE_TEXTS.en.needsModes, /Settings → Modes/);
});

test('engine-draft-unknown-space-refused: a space that cannot be read refuses (fail closed) and asks to send again', async () => {
  for (const fields of [{ space: '' }, { space: 'unknown' }, { unknownTop: true }, { guardedBy: 'unknown' }, { unknownTop: undefined }]) {
    assert.equal(engineAllowed(() => modesWith(fields), 't1'), 'unknown', JSON.stringify(fields));
  }
  const throws = { ...modesWith({}), guardOf: () => { throw new Error('x'); } };
  assert.equal(engineAllowed(() => throws, 't1'), 'unknown');
  assert.equal(engineAllowed(() => ({ ...modesWith({}), guardOf: () => null }), 't1'), 'unknown');
  assert.equal(await said(modesWith({ space: '' })), ENGINE_TEXTS.en.spaceUnknown);
  assert.equal(await said(throws), ENGINE_TEXTS.en.spaceUnknown);
});

test('engine-noprograms-mode-refused: an owner\'s mode without programs refuses in the Code space too (C1), naming the mode', async () => {
  assert.equal(engineAllowed(() => modesWith({ mode: 'mine', noPrograms: true }), 't1'), 'noPrograms');
  const text = await said(modesWith({ mode: 'mine', noPrograms: true }));
  assert.equal(text, engineText('modeNoPrograms', 'en', { mode: 'My notes' }));
  assert.match(text, /its mode \(My notes\) does not allow programs/);
});

test('engine-home-modes-soft: Bench in Devices and Creator Plus in Workshop get the soft "Code space" sentence (J2)', async () => {
  for (const [space, mode, name] of [['devices', 'bench', 'Devices'], ['workshop', 'creator-plus', 'Workshop']]) {
    const fields = { space, mode, guardedBy: space, noPrograms: true, homeMode: true };
    assert.equal(engineAllowed(() => modesWith(fields), 't1'), 'home', mode);
    assert.equal(await said(modesWith(fields)), engineText('codeSpaceOnly', 'en', { space: name }), mode);
  }
  // homeMode alone, or a home mode visiting the other guarded space, is a guest.
  assert.equal(engineAllowed(() => modesWith({ space: 'workshop', mode: 'bench', guardedBy: 'workshop', noPrograms: true, homeMode: true }), 't1'), 'guarded');
});

test('engine guarded: Recon, sealed threads and guests of Devices or Workshop keep the 6a sentence', async () => {
  const cases = [
    { space: 'recon', mode: 'research', sealed: true, reconSpace: true, noPrograms: true },
    { space: 'recon', mode: 'recon', sealed: true, reconSpace: true, homeMode: true, noPrograms: true },
    { space: 'chat', mode: 'mine', sealed: true, sealedBy: 'mode', noPrograms: true },
    { space: 'devices', mode: 'code', guardedBy: 'devices', noPrograms: true },
    { space: 'workshop', mode: 'research', guardedBy: 'workshop', noPrograms: true },
  ];
  for (const fields of cases) {
    assert.equal(engineAllowed(() => modesWith(fields), 't1'), 'guarded', JSON.stringify(fields));
    assert.equal(await said(modesWith(fields)), GUARDED_ENGINE_TEXT, JSON.stringify(fields));
  }
  assert.equal(engineAllowed(() => ({ ...modesWith({}), isolated: () => true }), 't1'), 'guarded', 'isolated() alone is enough');
  assert.match(GUARDED_ENGINE_TEXT, /use a thread in the Code space\.$/);
  assert.doesNotMatch(GUARDED_ENGINE_TEXT, /Chat or Code space|Code thread/);
});

test('engine-pending-devices-draft-refused: a Devices draft whose space is pending answers devices, so it is refused (L9)', async () => {
  // guardOf reads the draft's space (6a I3): a Code guest draft in Devices before its first message.
  const fields = { space: 'devices', mode: 'code', guardedBy: 'devices', noPrograms: true, fresh: true };
  assert.equal(engineAllowed(() => modesWith(fields), 'draft'), 'guarded');
});

test('the refusals are checked in the design\'s order: noModes, unknown, guarded, home, noPrograms, notCode', () => {
  assert.equal(engineAllowed(() => ({ ...modesWith({ space: '' }), apiVersion: 1 }), 't1'), 'noModes');
  assert.equal(engineAllowed(() => modesWith({ space: '', sealed: true }), 't1'), 'unknown');
  assert.equal(engineAllowed(() => modesWith({ space: 'chat', sealed: true, noPrograms: true }), 't1'), 'guarded');
  assert.equal(engineAllowed(() => modesWith({ space: 'chat', noPrograms: true }), 't1'), 'noPrograms');
  assert.equal(engineAllowed(() => modesWith({ space: 'chat' }), 't1'), 'notCode');
  assert.equal(engineAllowed(() => modesWith({ sealed: undefined }), 't1'), 'guarded', 'sealed must be false, not missing');
  assert.equal(engineAllowed(() => modesWith({ noPrograms: undefined }), 't1'), 'noPrograms', 'noPrograms must be false, not missing');
});

test('apply-sealed-refused: /engine apply is refused in a sealed thread and when Modes cannot say; others go on', async () => {
  const sealed = standIn(modesWith({ space: 'recon', sealed: true, reconSpace: true }));
  const broken = standIn({ ...modesWith({}), guardOf: () => { throw new Error('x'); } });
  const none = standIn(undefined);
  const open = standIn(modesWith({}));
  try {
    assert.deepEqual(await sealed.engine('apply'), { kind: 'error', text: 'Nothing to apply here: this thread is sealed.' });
    assert.deepEqual(await broken.engine('apply'), { kind: 'error', text: ENGINE_TEXTS.en.applySealed });
    assert.deepEqual(await none.engine('apply'), { kind: 'error', text: ENGINE_TEXTS.en.needsModes });
    assert.deepEqual(await open.engine('apply'), { kind: 'error', text: 'Nothing is waiting: the engine has no changes that are not in your project. Give it a task first; /engine shows what it has.' }, 'not sealed: the usual path');
    // The status still answers in a sealed thread, with the new words.
    const status = await sealed.engine('');
    assert.equal(status.kind, 'success');
    assert.match(status.text, /Engines work in the Code space, in any mode\./);
    assert.doesNotMatch(status.text, /Code mode only/);
  } finally {
    for (const app of [sealed, broken, none, open]) app.done();
  }
  // Owner decision 28: on a Chinese page the status's 6b sentence is the English one.
  const zh = standIn(modesWith({}, { lang: 'zh' }));
  try {
    const status = await zh.engine('');
    assert.ok(status.text.includes(ENGINE_TEXTS.en.status), status.text);
  } finally {
    zh.done();
  }
});

test('zh-texts (owner decision 28): a thread whose page is in Chinese gets the English sentences, as every other thread', async () => {
  assert.equal(await said(modesWith({ space: 'chat' }, { lang: 'zh' })), engineText('codeSpaceOnly', 'en', { space: 'Chat' }));
  assert.equal(await said(modesWith({ space: 'devices', mode: 'code', guardedBy: 'devices', noPrograms: true }, { lang: 'zh' })), GUARDED_ENGINE_TEXT);
  assert.equal(await said(modesWith({ mode: 'mine', noPrograms: true }, { lang: 'zh' })), engineText('modeNoPrograms', 'en', { mode: 'My notes' }));
  assert.equal(await said(modesWith({ space: '' }, { lang: 'zh' })), ENGINE_TEXTS.en.spaceUnknown);
  assert.equal(engineText('codeSpaceOnly', 'zh', { space: 'Chat' }), engineText('codeSpaceOnly', 'en', { space: 'Chat' }), 'a zh language asks for nothing else');
  assert.equal(await said(modesWith({ space: 'chat' }, { lang: 'en' })), engineText('codeSpaceOnly', 'en', { space: 'Chat' }));
  assert.equal(await said(modesWith({ space: 'chat' }, { service: { spaces: { names: () => NAMES.en, pageLang: () => { throw new Error('x'); } } } })), engineText('codeSpaceOnly', 'en', { space: 'Chat' }), 'a language that cannot be read: English');
  // English only, and each sentence says nothing ran or what to click.
  assert.deepEqual(Object.keys(ENGINE_TEXTS), ['en']);
  for (const key of ['codeSpaceOnly', 'modeNoPrograms', 'spaceUnknown', 'needsModes', 'guarded']) {
    assert.match(ENGINE_TEXTS.en[key], /[Nn]othing was run/, key);
  }
});
