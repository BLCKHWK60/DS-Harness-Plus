import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { END, START, STALE_MS, TOTAL_MAX, cleanText, openMemory, withSection } from '../lib/store.js';
import { buildTool } from '../index.js';

function place() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-memory-'));
  const notesFile = join(root, 'AGENTS.md');
  return { root, notesFile, memory: openMemory({ dataFile: join(root, 'memory', 'memory.json'), notesFile }) };
}

test('an entry is one plain line and cannot carry marks or headings', () => {
  assert.equal(cleanText('  ## Prefers\n short   answers <!-- dsh-memory:end --> '), 'Prefers short answers');
  assert.equal(cleanText('x'.repeat(900)).length, 300);
  assert.equal(cleanText(' \n '), '');
});

test('entries are written into their own section; the rest of the notes file is left alone', () => {
  const { root, notesFile, memory } = place();
  try {
    writeFileSync(notesFile, '# My own notes\n\nAlways answer in English.\n');
    memory.add('I am a student, not a programmer.', 'about', Date.UTC(2026, 10, 12));
    memory.add('Prefers short answers.', 'style', Date.UTC(2026, 10, 12));
    const notes = readFileSync(notesFile, 'utf8');
    assert.match(notes, /^# My own notes\n\nAlways answer in English\.\n\n<!-- dsh-memory:start/);
    assert.match(notes, /### About the user\n- I am a student, not a programmer\. \(saved 2026-11-12\)/);
    assert.match(notes, /### How the user likes answers\n- Prefers short answers\./);
    assert.equal(notes.trimEnd().endsWith(END), true);

    const [first, second] = memory.list().entries;
    memory.edit(first.id, 'I am a student.', 'about');
    memory.remove(second.id);
    const after = readFileSync(notesFile, 'utf8');
    assert.match(after, /- I am a student\. \(saved/);
    assert.doesNotMatch(after, /short answers/);
    assert.equal(after.split(START).length, 2);

    memory.remove(first.id);
    assert.equal(readFileSync(notesFile, 'utf8'), '# My own notes\n\nAlways answer in English.\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('with no notes of your own, the file exists only while something is remembered', () => {
  const { root, notesFile, memory } = place();
  try {
    assert.equal(existsSync(notesFile), false);
    memory.add('Lives in Lisbon.', 'about');
    assert.equal(existsSync(notesFile), true);
    memory.show(false);
    assert.equal(existsSync(notesFile), false);
    assert.equal(memory.list().entries.length, 1);
    memory.show(true);
    assert.match(readFileSync(notesFile, 'utf8'), /Lives in Lisbon/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a suggestion is not remembered until accepted', () => {
  const { root, notesFile, memory } = place();
  try {
    assert.equal(memory.suggest({ text: 'Prefers tables.', group: 'style', sessionId: 's1', now: 5 }), 'suggested');
    assert.equal(memory.suggest({ text: 'prefers tables.', sessionId: 's2' }), 'waiting');
    assert.equal(existsSync(notesFile), false);
    const [waiting] = memory.list().suggestions;
    assert.deepEqual({ text: waiting.text, group: waiting.group, sessionId: waiting.sessionId, at: waiting.at }, { text: 'Prefers tables.', group: 'style', sessionId: 's1', at: 5 });

    memory.accept(waiting.id);
    assert.match(readFileSync(notesFile, 'utf8'), /Prefers tables/);
    assert.deepEqual(memory.list().suggestions, []);
    assert.equal(memory.suggest({ text: 'Prefers tables.' }), 'known');

    memory.suggest({ text: 'Owns a dog.' });
    memory.dismiss(memory.list().suggestions[0].id);
    assert.deepEqual(memory.list().suggestions, []);
    assert.doesNotMatch(readFileSync(notesFile, 'utf8'), /dog/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('memory stays short, refuses repeats, and marks old entries', () => {
  const { root, memory } = place();
  try {
    memory.add('Same thing.', 'other', 0);
    assert.throws(() => memory.add('same thing.', 'other'), /already remembered/);
    for (let i = 0; i < 13; i += 1) memory.add(`${i} ${'y'.repeat(290)}`, 'other', 0);
    assert.throws(() => memory.add('z'.repeat(300), 'other'), /Memory is full/);
    assert.equal(memory.list().chars <= TOTAL_MAX, true);

    const old = memory.list(STALE_MS + 1).entries[0];
    assert.equal(old.stale, true);
    memory.keep(old.id, STALE_MS + 1);
    assert.equal(memory.list(STALE_MS + 2).entries[0].stale, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('the remember tool only suggests, and says when it is switched off', async () => {
  const { root, notesFile, memory } = place();
  try {
    let now = { enabled: true, suggest: true };
    const tool = buildTool({ memory, settings: () => now });
    const said = await tool.execute({ text: 'Prefers plain words.', group: 'style' }, { agent: { session: { id: 'session-1' } } });
    assert.match(said.text, /Suggested, not saved/);
    assert.equal(existsSync(notesFile), false);
    assert.equal(memory.list().suggestions[0].sessionId, 'session-1');
    now = { enabled: true, suggest: false };
    assert.match((await tool.execute({ text: 'Another.' }, {})).text, /Suggestions are switched off/);
    now = { enabled: false, suggest: true };
    assert.match((await tool.execute({ text: 'Another.' }, {})).text, /Memory is switched off/);
    assert.equal(memory.list().suggestions.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('replacing the section keeps one copy and tidy spacing', () => {
  const notes = `Top\n\n${START}\nold\n${END}\n\nBottom\n`;
  assert.equal(withSection(notes, `${START}\nnew\n${END}`), `Top\n\nBottom\n\n${START}\nnew\n${END}\n`);
  assert.equal(withSection(notes, ''), 'Top\n\nBottom\n');
});
