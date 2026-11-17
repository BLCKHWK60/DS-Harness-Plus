/**
 * Results the user can act on (build prompt, part 13): every finding and proposal is a card in plain
 * words, with the same few buttons: try it in the trial copy, apply, not now, and do not suggest this
 * again (saved as a preference). Kept in Creator Plus's own folder.
 */
import { closeSync, constants as fsConstants, mkdirSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import { clip, oneLine } from './text.js';

export const STATUSES = ['open', 'tried', 'applying', 'applied', 'later', 'never', 'undone'];

/** What makes two cards the same suggestion (for "do not suggest this again"). */
export const signatureOf = (card) => `${card.kind}|${card.plugin ?? ''}|${oneLine(card.title, 80).toLowerCase().replace(/\(\d+ times?\)/, '')}`;

/**
 * @param {string} file - cards.json.
 * @param {() => number} [now] - the clock.
 * @returns {object} the cards.
 */
export function openCards(file, now = () => Date.now()) {
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
      writeSync(fd, `${JSON.stringify(list.slice(-300), null, 2)}\n`);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, file);
  };
  return {
    list: read,
    /** Add a card unless the user said "do not suggest this again" for the same one. @returns {object | undefined} the card. */
    add({ kind, plugin = '', title, text = '', conversation = '', data = {} }) {
      const card = { id: `C${now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind: oneLine(kind, 20), plugin: oneLine(plugin, 80), title: oneLine(title, 200), text: clip(text, 4000), conversation: oneLine(conversation, 120), data, status: 'open', at: now() };
      const list = read();
      const signature = signatureOf(card);
      if (list.some((item) => item.status === 'never' && signatureOf(item) === signature)) return undefined;
      write([...list, card]);
      return card;
    },
    get: (id) => read().find((item) => item.id === id),
    /** Change a card's status (and add a line to its text, and facts to its data, such as the backup of an Apply). */
    set(id, status, note = '', data = {}) {
      if (!STATUSES.includes(status)) throw new Error('unknown status');
      const list = read();
      if (!list.some((item) => item.id === id)) throw new Error('There is no such card.');
      write(list.map((item) => (item.id === id ? { ...item, status, text: note ? clip(`${item.text}\n${note}`, 6000) : item.text, data: { ...(item.data ?? {}), ...data }, changedAt: now() } : item)));
      return read().find((item) => item.id === id);
    },
  };
}

/** What a button may do to a card, by the card's status (and only cards that prepare something can be tried, applied or undone). */
export const MOVES = {
  try: ['open', 'tried', 'later'],
  apply: ['open', 'tried', 'later'],
  later: ['open', 'tried'],
  never: ['open', 'tried', 'later'],
  undo: ['applied'],
};
/** @returns {string} why a button cannot act on this card now, or ''. */
export function moveRefusal(card, act) {
  if (!MOVES[act]) return 'unknown card action';
  if (['try', 'apply', 'undo'].includes(act) && !['new-plugin', 'change'].includes(card?.kind)) return 'Only a ready plugin or a prepared change can be tried, applied or undone.';
  if (!MOVES[act].includes(card?.status)) return `This card is "${card?.status}": ${act === 'undo' ? 'only what was applied can be undone' : act === 'apply' ? 'it was applied, undone or set aside already' : 'that is not possible now'}.`;
  return '';
}
