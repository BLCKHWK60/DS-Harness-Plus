/**
 * Learning (build prompt, part 8). Creator Plus proposes; the user approves each change; nothing about
 * it changes by itself. It keeps three things: preferences (the user's usual answers, so it asks less),
 * patterns (how things are built here) and lessons (mistakes not to repeat). Each entry has a date and a
 * reason and can be undone. Nothing from a third-party plugin becomes a pattern or a lesson until the
 * user has read it. Recon's text never enters (index.js reads Recon's logs as structure only).
 */
import { closeSync, constants as fsConstants, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { oneLine } from './text.js';

export const KINDS = ['preference', 'pattern', 'lesson'];

/**
 * Open the learning record.
 * @param {string} file - Creator Plus's learning.json.
 * @param {() => number} [now] - the clock.
 * @returns {object} the record.
 */
export function openLearning(file, now = () => Date.now()) {
  const read = () => {
    try {
      const value = JSON.parse(readFileSync(file, 'utf8'));
      return Array.isArray(value) ? value : [];
    } catch {
      return [];
    }
  };
  const write = (list) => {
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    const fd = openSync(temp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_TRUNC, 0o600);
    try {
      writeSync(fd, `${JSON.stringify(list.slice(-500), null, 2)}\n`);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
  };
  return {
    list: read,
    /**
     * Propose an entry (from an interview answer, an edit the user made, a failed check, how plugins are used).
     * @returns {object} the proposal.
     */
    propose({ kind, key = '', text, reason, from = 'creator-plus', thirdParty = false }) {
      if (!KINDS.includes(kind)) throw new Error('The kind is preference, pattern or lesson.');
      const entry = { id: `L${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind, key: oneLine(key, 60), text: oneLine(text, 600), reason: oneLine(reason, 400), from: oneLine(from, 60), thirdParty: thirdParty === true, read: false, status: 'proposed', at: now() };
      if (!entry.text || !entry.reason) throw new Error('Say what it is and why.');
      const list = read();
      if (list.some((item) => item.status !== 'undone' && item.kind === entry.kind && item.text === entry.text)) return list.find((item) => item.text === entry.text);
      write([...list, entry]);
      return entry;
    },
    /** The user read a third-party entry (only then can it be kept). */
    markRead(id) {
      write(read().map((item) => (item.id === id ? { ...item, read: true } : item)));
    },
    /** The user's yes (only from the Creator Plus page). */
    keep(id) {
      const list = read();
      const entry = list.find((item) => item.id === id);
      if (!entry) throw new Error('There is no such entry.');
      if (entry.thirdParty && !entry.read) throw new Error('This came from a third-party plugin: read it first, then keep it.');
      write(list.map((item) => (item.id === id ? { ...item, status: 'kept', keptAt: now() } : item)));
    },
    /** Undo an entry (kept or proposed); it stays in the record as undone. */
    undo(id) {
      write(read().map((item) => (item.id === id ? { ...item, status: 'undone', undoneAt: now() } : item)));
    },
    /** @returns {Record<string, string>} the kept preferences: question id → the user's usual answer. */
    preferences() {
      const out = {};
      for (const item of read()) if (item.kind === 'preference' && item.status === 'kept' && item.key) out[item.key] = item.text;
      return out;
    },
    /** @returns {string} the kept patterns and lessons, for the model's instructions. */
    forPrompt() {
      const kept = read().filter((item) => item.status === 'kept' && item.kind !== 'preference').slice(-30);
      if (kept.length === 0) return '';
      return ['What Creator Plus has learned here (approved by the user):', ...kept.map((item) => `- ${item.kind === 'lesson' ? 'Lesson' : 'Pattern'}: ${item.text}`)].join('\n');
    },
  };
}
