/**
 * The memory list: short, lasting facts and preferences the owner chose to keep. Kept apart from
 * the plugin so it can be tested without the app.
 *
 * Two files:
 * - the data file (JSON): the entries, and the suggestions waiting for a yes or no;
 * - the notes file (the app's personal `AGENTS.md`, which it adds to every new conversation): the
 *   entries are written into one marked section of it. Everything outside the marks is left alone.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';

export const START = '<!-- dsh-memory:start (written by the Memory page; change it there, not here) -->';
export const END = '<!-- dsh-memory:end -->';
/** Longest single entry, in characters. */
export const ENTRY_MAX = 300;
/** Longest the whole list may be: memory stays about a page. */
export const TOTAL_MAX = 4000;
/** Most suggestions kept waiting; the oldest go first. */
export const SUGGESTIONS_MAX = 20;
/** After this long an entry is marked "still true?". */
export const STALE_MS = 120 * 24 * 60 * 60 * 1000;

export const GROUPS = ['about', 'style', 'projects', 'other'];
const HEADINGS = { about: 'About the user', style: 'How the user likes answers', projects: 'Current projects', other: 'Other' };

/**
 * One entry's text as a single plain line.
 * @param {unknown} text - what was typed or suggested.
 * @returns {string} the cleaned text, possibly empty.
 */
export function cleanText(text) {
  return String(text ?? '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[-*#>\s]+/, '')
    .trim()
    .slice(0, ENTRY_MAX);
}

function groupOf(group) {
  return GROUPS.includes(group) ? group : 'other';
}

function newId() {
  return randomBytes(6).toString('hex');
}

function day(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * The section written into the notes file.
 * @param {{text: string, group: string, addedAt: number}[]} entries - the saved entries.
 * @returns {string} the section, or '' when there is nothing to remember.
 */
export function renderSection(entries) {
  if (entries.length === 0) return '';
  const lines = [START, '## What the user asked you to remember', '', 'Lasting facts and preferences the user saved. Follow them unless the user says otherwise in this conversation.'];
  for (const group of GROUPS) {
    const mine = entries.filter((entry) => groupOf(entry.group) === group);
    if (mine.length === 0) continue;
    lines.push('', `### ${HEADINGS[group]}`);
    for (const entry of mine) lines.push(`- ${entry.text} (saved ${day(entry.addedAt)})`);
  }
  lines.push(END);
  return lines.join('\n');
}

/**
 * Notes-file text with the memory section replaced (or removed when `section` is empty).
 * @param {string} notes - the file's current text.
 * @param {string} section - from `renderSection`.
 * @returns {string} the new text.
 */
export function withSection(notes, section) {
  const from = notes.indexOf(START);
  const to = from < 0 ? -1 : notes.indexOf(END, from);
  let rest = notes;
  if (from >= 0 && to >= 0) rest = [notes.slice(0, from).trim(), notes.slice(to + END.length).trim()].filter(Boolean).join('\n\n');
  rest = rest.trim();
  if (!section) return rest ? `${rest}\n` : '';
  return rest ? `${rest}\n\n${section}\n` : `${section}\n`;
}

function writeSafely(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, file);
}

/**
 * Open the memory kept in two files.
 * @param {object} where - the files.
 * @param {string} where.dataFile - JSON file holding entries and suggestions.
 * @param {string} where.notesFile - the app's personal notes file.
 * @returns {object} the memory.
 */
export function openMemory({ dataFile, notesFile }) {
  const read = () => {
    let data = {};
    try {
      data = JSON.parse(readFileSync(dataFile, 'utf8'));
    } catch {
      data = {};
    }
    const entries = (Array.isArray(data.entries) ? data.entries : []).filter((e) => e && typeof e.id === 'string' && cleanText(e.text));
    const suggestions = (Array.isArray(data.suggestions) ? data.suggestions : []).filter((s) => s && typeof s.id === 'string' && cleanText(s.text));
    return { entries, suggestions };
  };

  /** Write the notes file's section from the entries; `on` false removes the section. */
  const writeNotes = (entries, on = true) => {
    let notes = '';
    try {
      notes = readFileSync(notesFile, 'utf8');
    } catch {
      notes = '';
    }
    const next = withSection(notes, on ? renderSection(entries) : '');
    if (next === notes) return;
    if (next === '' && existsSync(notesFile)) rmSync(notesFile, { force: true });
    else if (next !== '') writeSafely(notesFile, next);
  };

  let shown = true;
  const save = (data) => {
    writeSafely(dataFile, JSON.stringify(data, null, 2));
    writeNotes(data.entries, shown);
  };

  const total = (entries) => entries.reduce((sum, entry) => sum + entry.text.length, 0);
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();

  const addEntry = (data, text, group, now) => {
    const clean = cleanText(text);
    if (!clean) throw new Error('There is nothing to remember.');
    if (data.entries.some((entry) => same(entry.text, clean))) throw new Error('That is already remembered.');
    if (total(data.entries) + clean.length > TOTAL_MAX) throw new Error('Memory is full. Delete an entry first: it is kept short on purpose.');
    data.entries.push({ id: newId(), text: clean, group: groupOf(group), addedAt: now, checkedAt: now });
  };

  return {
    /**
     * Everything, for the page.
     * @param {number} [now] - the current time.
     * @returns {{entries: object[], suggestions: object[], chars: number, limit: number}} the list.
     */
    list(now = Date.now()) {
      const data = read();
      return {
        entries: data.entries.map((entry) => ({ ...entry, group: groupOf(entry.group), stale: now - (Number(entry.checkedAt) || Number(entry.addedAt) || 0) > STALE_MS })),
        suggestions: data.suggestions.map((s) => ({ ...s, group: groupOf(s.group) })),
        chars: total(data.entries),
        limit: TOTAL_MAX,
      };
    },

    /** Remember something the owner typed. */
    add(text, group, now = Date.now()) {
      const data = read();
      addEntry(data, text, group, now);
      save(data);
    },

    /** Change an entry's text or group. */
    edit(id, text, group) {
      const data = read();
      const entry = data.entries.find((e) => e.id === id);
      if (!entry) throw new Error('That entry is gone.');
      const clean = cleanText(text);
      if (!clean) throw new Error('There is nothing to remember.');
      if (total(data.entries) - entry.text.length + clean.length > TOTAL_MAX) throw new Error('Memory is full. Shorten or delete an entry first.');
      entry.text = clean;
      if (group !== undefined) entry.group = groupOf(group);
      save(data);
    },

    /** Forget an entry. */
    remove(id) {
      const data = read();
      data.entries = data.entries.filter((e) => e.id !== id);
      save(data);
    },

    /** The owner says an old entry is still true. */
    keep(id, now = Date.now()) {
      const data = read();
      const entry = data.entries.find((e) => e.id === id);
      if (entry) entry.checkedAt = now;
      save(data);
    },

    /**
     * The assistant suggests something to remember. Nothing is remembered until the owner accepts.
     * @param {object} what - the suggestion.
     * @param {string} what.text - what to remember.
     * @param {string} [what.group] - which group.
     * @param {string} [what.sessionId] - the conversation it came from.
     * @param {number} [what.now] - the current time.
     * @returns {'suggested' | 'known' | 'waiting'} what happened.
     */
    suggest({ text, group, sessionId, now = Date.now() }) {
      const data = read();
      const clean = cleanText(text);
      if (!clean) throw new Error('There is nothing to remember.');
      if (data.entries.some((entry) => same(entry.text, clean))) return 'known';
      if (data.suggestions.some((s) => same(s.text, clean))) return 'waiting';
      data.suggestions.push({ id: newId(), text: clean, group: groupOf(group), sessionId: String(sessionId ?? ''), at: now });
      data.suggestions = data.suggestions.slice(-SUGGESTIONS_MAX);
      save(data);
      return 'suggested';
    },

    /** The owner accepts a suggestion: it becomes an entry. */
    accept(id, now = Date.now()) {
      const data = read();
      const suggestion = data.suggestions.find((s) => s.id === id);
      if (!suggestion) throw new Error('That suggestion is gone.');
      addEntry(data, suggestion.text, suggestion.group, now);
      data.suggestions = data.suggestions.filter((s) => s.id !== id);
      save(data);
    },

    /** The owner declines a suggestion. */
    dismiss(id) {
      const data = read();
      data.suggestions = data.suggestions.filter((s) => s.id !== id);
      save(data);
    },

    /**
     * Put the entries into the notes file, or take them out (memory switched off). The list is kept.
     * @param {boolean} on - whether conversations should get the memory.
     */
    show(on) {
      shown = on !== false;
      writeNotes(read().entries, shown);
    },
  };
}
