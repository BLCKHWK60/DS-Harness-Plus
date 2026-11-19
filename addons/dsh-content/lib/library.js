/**
 * The Voice Library (plan steps C10, C14, C16): one folder for all subjects, made of plain files the
 * owner can read and edit, from which Content learns his voice. Nothing enters by itself:
 *   - approved/<format>/: final pieces, added when the owner makes a piece final (with how much of it he
 *     wrote or changed: his share);
 *   - edits/: each writer's draft beside the version the owner approved, added at the same time;
 *   - own-words/written/ and own-words/spoken/: notes and transcripts the owner adds (written and spoken
 *     voice kept apart);
 *   - pinned-facts.md, sources.md, wording.md: facts he pins, sources he trusts or distrusts, passages
 *     he saves to reuse word for word;
 *   - profile/<voice>-<format>.md: the voice rules he approved, one list per format and voice;
 *   - signals.md: feedback ("too formal", a choice between two versions), kept as signals;
 *   - spoken.md: what a recording did with its talking outline (skipped, moved, expanded).
 * The record is library.json; the Markdown files are written from it, and a file the owner wrote himself
 * under one of those names is never replaced.
 */
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonStore } from './json-store.js';

export const LIBRARY_NAME = 'Voice Library';
export const VOICES = ['written', 'spoken'];
const RECORD = 'library.json';
const MARK = '<!-- Kept by Content from library.json: edit library.json or ask in a Content conversation; a file of yours with this name is never replaced. -->';
const TEXT_MAX = 200_000;
const LIST_MAX = 2000;

const clip = (value, max = 2000) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const slug = (value) => Array.from(String(value ?? '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')).slice(0, 60).join('') || 'piece';
const words = (text) => String(text ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}']+/gu, ' ').trim().split(' ').filter(Boolean);

/** Three-word runs of a text, for comparing two versions quickly (no full diff, so long pieces stay fast). */
function shingles(text) {
  const list = words(text);
  const out = new Set();
  for (let index = 0; index + 2 < list.length; index += 1) out.add(`${list[index]} ${list[index + 1]} ${list[index + 2]}`);
  if (list.length > 0 && list.length < 3) out.add(list.join(' '));
  return out;
}

/**
 * How much of the approved text is the owner's: the part of its three-word runs that are not in the
 * writer's draft. 0 when he changed nothing, 1 when he wrote it all (or there was no writer's draft).
 */
export function ownerShare(writerText, finalText) {
  const after = shingles(finalText);
  if (after.size === 0) return 0;
  if (!String(writerText ?? '').trim()) return 1;
  const before = shingles(writerText);
  let same = 0;
  for (const run of after) if (before.has(run)) same += 1;
  return Math.round((1 - same / after.size) * 100) / 100;
}

const sentences = (text) => String(text ?? '').replace(/\s*\[(?:C\d+(?:,\s*C\d+)*|view|GAP:[^\]]*)\]/g, '').split(/(?<=[.!?])\s+|\n{2,}/).map((part) => part.replace(/\s+/g, ' ').trim()).filter((part) => part.length > 3);

/**
 * What the owner changed between the writer's draft and the version he approved, as code can tell it:
 * sentences he took out, sentences he added, and how sentence length and the use of "I" moved. The
 * assistant proposes voice rules from this; each enters only with the owner's own words.
 */
export function changesOf(writerText, finalText) {
  const before = sentences(writerText);
  const after = sentences(finalText);
  const had = new Set(before.map((one) => one.toLowerCase()));
  const has = new Set(after.map((one) => one.toLowerCase()));
  const removed = before.filter((one) => !has.has(one.toLowerCase()));
  const added = after.filter((one) => !had.has(one.toLowerCase()));
  const mean = (list) => (list.length === 0 ? 0 : Math.round(list.reduce((sum, one) => sum + words(one).length, 0) / list.length));
  const firstPerson = (text) => words(text).filter((word) => word === 'i' || word === "i'm" || word === 'my' || word === 'me').length;
  return {
    removed: removed.slice(0, 12),
    added: added.slice(0, 12),
    sentenceLength: { before: mean(before), after: mean(after) },
    firstPerson: { before: firstPerson(writerText), after: firstPerson(finalText) },
    share: ownerShare(writerText, finalText),
  };
}

/**
 * What a recording did with its talking outline (stage 4, the spoken loop): the points the owner
 * skipped, the ones he took in another order, and the ones he talked about much longer than planned.
 * @param {string[]} points - the outline's points, in order.
 * @param {string} transcript - what he said.
 */
export function spokenCompare(points, transcript) {
  const said = words(transcript);
  const text = ` ${said.join(' ')} `;
  const keyOf = (point) => words(point).filter((word) => word.length >= 5).slice(0, 8);
  const found = points.map((point, index) => {
    const keys = keyOf(point);
    if (keys.length === 0) return { index, point, at: -1, hits: 0 };
    const hits = keys.filter((key) => text.includes(` ${key} `));
    const positions = hits.map((key) => text.indexOf(` ${key} `)).filter((at) => at >= 0);
    return { index, point, at: hits.length / keys.length >= 0.5 ? Math.min(...positions) : -1, hits: hits.length, keys };
  });
  const skipped = found.filter((one) => one.at < 0).map((one) => one.point);
  const order = found.filter((one) => one.at >= 0).sort((a, b) => a.at - b.at).map((one) => one.index);
  const moved = order.filter((index, place) => place > 0 && index < order[place - 1]).map((index) => points[index]);
  const share = said.length / Math.max(1, points.length);
  const expanded = found.filter((one) => one.at >= 0).map((one) => {
    const next = found.filter((other) => other.at > one.at).sort((a, b) => a.at - b.at)[0];
    const span = ((next ? next.at : text.length) - one.at) / 6;
    return { point: one.point, span };
  }).filter((one) => one.span > share * 2).map((one) => one.point);
  return { skipped, moved, expanded, words: said.length };
}

/**
 * @param {() => string} folderOf - the library folder (Settings → Content, or `<home>/content/voice-library`).
 */
export function openLibrary(folderOf) {
  const root = () => {
    const folder = String(folderOf() ?? '').trim();
    if (!folder) throw new Error('There is no Voice Library folder. Set one in Settings → Content.');
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    if (lstatSync(folder).isSymbolicLink()) throw new Error('The Voice Library folder is a link; Content does not write through links.');
    return folder;
  };
  const sub = (...parts) => {
    let dir = root();
    for (const part of parts) {
      dir = join(dir, part);
      try {
        const stat = lstatSync(dir);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`${part} in the Voice Library is ${stat.isSymbolicLink() ? 'a link' : 'a file'}; Content leaves it alone.`);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        mkdirSync(dir, { mode: 0o700 });
      }
    }
    return dir;
  };
  const empty = () => ({ version: 1, pieces: [], rules: [], wording: [], pinned: [], sources: [], signals: [], ownWords: [], spoken: [], next: 1 });
  const read = () => {
    const folder = String(folderOf() ?? '').trim();
    if (!folder) return empty();
    const value = readJsonStore(join(folder, RECORD), () => undefined, { label: 'the Content library record', valid: (found) => found && typeof found === 'object' && !Array.isArray(found) });
    return value ? { ...empty(), ...value } : empty();
  };
  /** A new file, never replacing one. */
  const newFile = (dir, base, text) => {
    for (let n = 1; n < 100; n += 1) {
      const path = join(dir, `${base}${n > 1 ? `-${n}` : ''}.md`);
      let fd;
      try {
        fd = openSync(path, 'wx', 0o600);
      } catch (error) {
        if (error?.code === 'EEXIST') continue;
        throw error;
      }
      try {
        writeSync(fd, text);
      } finally {
        closeSync(fd);
      }
      return path;
    }
    throw new Error('too many files of that name');
  };
  /** A Markdown copy of the record, unless a file of the owner's has that name. */
  const copy = (path, text) => {
    try {
      const had = readFileSync(path, 'utf8');
      if (!had.startsWith(MARK)) return false;
    } catch (error) {
      if (error?.code !== 'ENOENT') return false;
    }
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, `${MARK}\n${text}`, { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
    return true;
  };
  const write = (state) => {
    const folder = root();
    const trimmed = Object.fromEntries(Object.entries(state).map(([key, value]) => [key, Array.isArray(value) ? value.slice(-LIST_MAX) : value]));
    const temp = join(folder, `${RECORD}.${process.pid}.${Date.now()}.tmp`);
    writeFileSync(temp, `${JSON.stringify(trimmed, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temp, join(folder, RECORD));
    copy(join(folder, 'pinned-facts.md'), `# Pinned facts\n\nFacts and rulings the owner pinned to reuse.\n\n${trimmed.pinned.map((one) => `- ${one.text}${one.standing ? ` (${one.standing})` : ''} (pinned ${one.at?.slice?.(0, 10) ?? ''})`).join('\n') || 'None yet.'}\n`);
    copy(join(folder, 'sources.md'), `# Approved sources\n\n${trimmed.sources.map((one) => `- ${one.trust === 'distrusted' ? 'Distrusted' : 'Trusted'}: ${one.title || one.url}${one.url ? ` <${one.url}>` : ''}${one.note ? `: ${one.note}` : ''}`).join('\n') || 'None yet.'}\n`);
    copy(join(folder, 'wording.md'), `# Approved wording\n\nPassages to reuse word for word.\n\n${trimmed.wording.map((one) => `## ${one.label || one.id}${one.format ? ` (${one.format})` : ''}\n\n${one.text}`).join('\n\n') || 'None yet.'}\n`);
    copy(join(folder, 'signals.md'), `# Signals\n\nFeedback kept as signals: comments and choices between versions.\n\n${trimmed.signals.map((one) => `- ${one.at?.slice?.(0, 10) ?? ''} ${one.kind}${one.format ? ` (${one.format})` : ''}: ${one.text}`).join('\n') || 'None yet.'}\n`);
    copy(join(folder, 'spoken.md'), `# The spoken loop\n\nWhat each recording did with its talking outline.\n\n${trimmed.spoken.map((one) => `## ${one.title} (${one.at?.slice?.(0, 10) ?? ''})\n\n- Skipped: ${one.skipped.join('; ') || 'nothing'}\n- Moved: ${one.moved.join('; ') || 'nothing'}\n- Expanded: ${one.expanded.join('; ') || 'nothing'}`).join('\n\n') || 'No recording compared yet.'}\n`);
    const profiles = new Map();
    for (const rule of trimmed.rules) {
      const key = `${rule.voice}-${rule.format || 'all'}`;
      profiles.set(key, [...(profiles.get(key) ?? []), rule]);
    }
    if (profiles.size > 0) {
      const dir = sub('profile');
      for (const [key, rules] of profiles) copy(join(dir, `${key}.md`), `# Voice profile: ${key.replace('-', ', ')}\n\nRules the owner approved.\n\n${rules.map((one) => `- ${one.text}`).join('\n')}\n`);
    }
  };
  const stamp = (at) => at.toISOString();
  const id = (state, letter) => {
    const value = `${letter}${state.next}`;
    state.next += 1;
    return value;
  };

  return {
    /** @returns {string} the folder, without making it. */
    where: () => String(folderOf() ?? '').trim(),
    read,
    /**
     * A piece the owner made final, with the writer's draft beside his version (stage 1).
     * @returns {{entry: object, changes: object}} the shelf entry and what he changed.
     */
    addApproved({ title, format, voice = 'written', subject = '', piece = '', finalText, ownerText = undefined, writerText = '', at = new Date() }) {
      const state = read();
      const body = clip(finalText, TEXT_MAX);
      if (!body) throw new Error('The approved piece is empty.');
      // What he changed is measured on the drafts (claim marks and all), the shelf keeps the final text.
      const approvedDraft = clip(ownerText ?? finalText, TEXT_MAX);
      const changes = changesOf(writerText, approvedDraft);
      const base = `${stamp(at).slice(0, 10)}-${slug(title)}`;
      const file = newFile(sub('approved', slug(format || 'other')), base, `# ${clip(title, 200)}\n\n- Format: ${format}\n- Voice: ${voice}\n- Approved: ${stamp(at).slice(0, 16).replace('T', ' ')} UTC\n- The owner's share: ${Math.round(changes.share * 100)}% (how much of it he wrote or changed)\n- From: ${clip(subject, 300)} ${piece}\n\n---\n\n${body}\n`);
      let edits = '';
      if (String(writerText ?? '').trim()) {
        edits = newFile(sub('edits'), base, `# ${clip(title, 200)}: the writer's draft and the owner's version\n\n## What changed\n\n- Sentences taken out: ${changes.removed.length}\n- Sentences added: ${changes.added.length}\n- Average sentence length: ${changes.sentenceLength.before} → ${changes.sentenceLength.after} words\n- "I", "my", "me": ${changes.firstPerson.before} → ${changes.firstPerson.after}\n\n## The writer's draft\n\n${clip(writerText, TEXT_MAX)}\n\n## The owner's version\n\n${approvedDraft}\n`);
      }
      const entry = { id: id(state, 'P'), title: clip(title, 200), format: clip(format, 60), voice: VOICES.includes(voice) ? voice : 'written', subject: clip(subject, 400), piece: clip(piece, 40), file, edits, share: changes.share, words: words(body).length, at: stamp(at) };
      state.pieces.push(entry);
      write(state);
      return { entry, changes };
    },
    /** The owner's own words: notes and transcripts, kept by voice. */
    addOwnWords({ text, title = '', voice = 'written', format = '', at = new Date() }) {
      const state = read();
      const body = clip(text, TEXT_MAX);
      if (!body) throw new Error('Nothing to keep.');
      const kind = VOICES.includes(voice) ? voice : 'written';
      const file = newFile(sub('own-words', kind), `${stamp(at).slice(0, 10)}-${slug(title || body.slice(0, 40))}`, `# ${clip(title, 200) || 'Own words'}\n\n${body}\n`);
      const entry = { id: id(state, 'W'), title: clip(title, 200), voice: kind, format: clip(format, 60), file, words: words(body).length, at: stamp(at) };
      state.ownWords.push(entry);
      write(state);
      return entry;
    },
    pin({ text, standing = '', claim = '', quote, at = new Date() }) {
      const state = read();
      const entry = { id: id(state, 'F'), text: clip(text, 1500), standing: clip(standing, 40), claim: clip(claim, 20), quote: clip(quote, 600), at: stamp(at) };
      if (!entry.text) throw new Error('Give the fact.');
      state.pinned.push(entry);
      write(state);
      return entry;
    },
    source({ url = '', title = '', trust = 'trusted', note = '', quote, at = new Date() }) {
      const state = read();
      const entry = { id: id(state, 'S'), url: clip(url, 2000), title: clip(title, 300), trust: trust === 'distrusted' ? 'distrusted' : 'trusted', note: clip(note, 600), quote: clip(quote, 600), at: stamp(at) };
      if (!entry.url && !entry.title) throw new Error('Give the source\'s address or name.');
      state.sources = [...state.sources.filter((one) => !(entry.url && one.url === entry.url)), entry];
      write(state);
      return entry;
    },
    wording({ text, label = '', format = '', quote, at = new Date() }) {
      const state = read();
      const entry = { id: id(state, 'Q'), text: clip(text, 6000), label: clip(label, 120), format: clip(format, 60), quote: clip(quote, 600), at: stamp(at) };
      if (!entry.text) throw new Error('Give the passage.');
      state.wording.push(entry);
      write(state);
      return entry;
    },
    rule({ text, format = '', voice = 'written', quote, at = new Date() }) {
      const state = read();
      const entry = { id: id(state, 'R'), text: clip(text, 400), format: clip(format, 60), voice: VOICES.includes(voice) ? voice : 'written', quote: clip(quote, 600), at: stamp(at) };
      if (!entry.text) throw new Error('Give the rule.');
      state.rules.push(entry);
      write(state);
      return entry;
    },
    /** Take a rule off the profile (the owner's words). */
    dropRule(ruleId) {
      const state = read();
      const before = state.rules.length;
      state.rules = state.rules.filter((one) => one.id !== String(ruleId ?? '').toUpperCase());
      if (state.rules.length === before) throw new Error(`There is no rule ${ruleId}.`);
      write(state);
    },
    signal({ text, kind = 'comment', format = '', piece = '', at = new Date() }) {
      const state = read();
      const entry = { id: id(state, 'G'), text: clip(text, 1500), kind: kind === 'choice' ? 'choice' : 'comment', format: clip(format, 60), piece: clip(piece, 40), at: stamp(at) };
      if (!entry.text) throw new Error('Give the feedback.');
      state.signals.push(entry);
      write(state);
      return entry;
    },
    spoken({ title, format, compare, at = new Date() }) {
      const state = read();
      const entry = { id: id(state, 'T'), title: clip(title, 200), format: clip(format, 60), skipped: compare.skipped.slice(0, 20).map((one) => clip(one, 300)), moved: compare.moved.slice(0, 20).map((one) => clip(one, 300)), expanded: compare.expanded.slice(0, 20).map((one) => clip(one, 300)), at: stamp(at) };
      state.spoken.push(entry);
      write(state);
      return entry;
    },
    /**
     * What the writer is given from the library (stages 1 and 3): the two or three approved pieces closest
     * to this one (same format and voice first, then by shared words, a piece the owner changed more
     * counting for more), his voice rules, approved wording and pinned facts. Bounded.
     */
    forWriter({ format = '', voice = 'written', about = '', most = 3, each = 3500 } = {}) {
      const state = read();
      const want = new Set(words(about).filter((word) => word.length >= 5));
      const scored = state.pieces.filter((one) => one.voice === voice).map((one) => {
        let text = '';
        try {
          text = readFileSync(one.file, 'utf8').split('\n---\n').slice(1).join('\n---\n').trim();
        } catch {
          text = '';
        }
        const own = words(text);
        const overlap = want.size === 0 ? 0 : own.filter((word) => want.has(word)).length / Math.max(1, own.length);
        return { one, text, score: (one.format === format ? 2 : 0) + overlap * 10 + (one.share ?? 0) * 2 };
      }).filter((item) => item.text).sort((a, b) => b.score - a.score).slice(0, Math.max(0, Math.min(3, most)));
      return {
        examples: scored.map((item) => ({ title: item.one.title, format: item.one.format, share: item.one.share, text: item.text.slice(0, each) })),
        rules: state.rules.filter((one) => one.voice === voice && (!one.format || one.format === format)).map((one) => one.text).slice(0, 30),
        wording: state.wording.filter((one) => !one.format || one.format === format).slice(-12).map((one) => ({ label: one.label, text: one.text.slice(0, 1200) })),
        pinned: state.pinned.slice(-30).map((one) => ({ text: one.text, standing: one.standing })),
        distrusted: state.sources.filter((one) => one.trust === 'distrusted').slice(-30).map((one) => one.url || one.title),
        spoken: voice === 'spoken' ? state.spoken.filter((one) => !one.format || one.format === format).slice(-5) : [],
      };
    },
    /** Every approved piece's text in one string (for checking that saved wording came from the owner's approved writing). */
    approvedText() {
      return read().pieces.map((one) => {
        try {
          return readFileSync(one.file, 'utf8');
        } catch {
          return '';
        }
      }).join('\n');
    },
  };
}
