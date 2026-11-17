/**
 * Split Plus, step 3: the tray (cards waiting in a conversation's chat box until the owner sends them)
 * and the ledger (every send, kept in Split Plus's folder: what, from where, to where, when, and what
 * became of it). Both survive a restart. The receiving conversation's own log carries the card itself
 * once it is sent.
 */
import { appendFileSync, closeSync, existsSync, fstatSync, mkdirSync, openSync, readFileSync, readSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_CHARS, cardText, deliveredText, newSendId, reconLine, sourcesOf } from './sends.js';

/** At most this many cards wait in one conversation's tray. */
export const MAX_TRAY = 30;
/** The ledger is read from its end: at most this many bytes (its newest sends). */
export const LEDGER_TAIL_BYTES = 4_000_000;

/**
 * The last lines of a file, read from its end (a long ledger is never read whole).
 * @param {string} file - the file.
 * @param {number} maxBytes - how much of its end to read.
 * @returns {string[]} whole lines, oldest first.
 */
export function tailLines(file, maxBytes = LEDGER_TAIL_BYTES) {
  const fd = openSync(file, 'r');
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, maxBytes);
    const buffer = Buffer.alloc(length);
    let got = 0;
    while (got < length) {
      const read = readSync(fd, buffer, got, length - got, size - length + got);
      if (read === 0) break;
      got += read;
    }
    const lines = buffer.subarray(0, got).toString('utf8').split('\n');
    // A read that starts mid-file starts mid-line: that first piece is left out.
    if (length < size) lines.shift();
    return lines.filter(Boolean);
  } finally {
    closeSync(fd);
  }
}

/**
 * @param {{home?: string, now?: () => number, random?: () => number}} [options] - `home`: the folder for
 *   tray.json and sends.jsonl ('' keeps them in memory only).
 */
export function openSendRoom({ home = '', now = Date.now, random = Math.random } = {}) {
  const trayFile = home ? join(home, 'tray.json') : '';
  const ledgerFile = home ? join(home, 'sends.jsonl') : '';
  /** sessionId → cards (no prototype, so no conversation id is special) */
  let trays = Object.create(null);
  const memoryLedger = [];
  if (trayFile && existsSync(trayFile)) {
    try {
      const saved = JSON.parse(readFileSync(trayFile, 'utf8'));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) trays = Object.assign(Object.create(null), saved);
    } catch { /* a damaged tray starts empty; the ledger still has every send */ }
  }
  const saveTrays = () => {
    if (!trayFile) return;
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const temp = `${trayFile}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(trays), { mode: 0o600 });
    renameSync(temp, trayFile);
  };
  const log = (entry) => {
    const row = { at: now(), ...entry };
    if (!ledgerFile) {
      memoryLedger.push(row);
      return;
    }
    mkdirSync(home, { recursive: true, mode: 0o700 });
    appendFileSync(ledgerFile, `${JSON.stringify(row)}\n`, { mode: 0o600 });
  };

  return {
    /**
     * Make a send. With `start`, its text goes straight to the receiving conversation (the caller sends
     * it); without, it waits in that conversation's tray.
     * @param {{from: {sessionId: string, label: string, title?: string}, to: {sessionId: string, label: string}, kind: string, text: string, file?: string, start?: boolean, plain?: boolean, recon?: boolean}} send
     * @returns {{id: string, text?: string}}
     */
    send({ from, to, kind, text, file = '', start = false, plain = false, recon = false }) {
      const material = String(text ?? '');
      if (!material.trim()) throw new Error('There is nothing to send.');
      const id = newSendId(random);
      const at = now();
      const sources = sourcesOf(material);
      // The Danger zone's "no card": the text goes as it is, and counts as the owner's own words.
      // Recon's marker goes with material from a conversation that holds a Recon export, card or not.
      const card = plain ? (recon ? `${reconLine(id, at)}\n${material}` : material) : cardText({ id, at, kind, text: material, from, file, sources, recon });
      log({ event: 'sent', id, kind, ...(plain ? { unmarked: true } : {}), ...(recon ? { recon: true } : {}), from: from.sessionId, fromLabel: from.label, to: to.sessionId, toLabel: to.label, chars: material.length, cut: material.length > MAX_CHARS, sources, file, how: start ? 'start' : 'tray' });
      if (start) return { id, text: card };
      const tray = Array.isArray(trays[to.sessionId]) ? trays[to.sessionId] : [];
      if (tray.length >= MAX_TRAY) throw new Error(`That conversation already has ${MAX_TRAY} cards waiting. Send or remove some first.`);
      trays[to.sessionId] = [...tray, { id, at, kind, from, file, chars: material.length, sources: sources.length, preview: material.slice(0, 280), card }];
      saveTrays();
      return { id };
    },
    /** The cards waiting in a conversation's tray, without their full text. */
    trayOf(sessionId) {
      return (Array.isArray(trays[sessionId]) ? trays[sessionId] : []).map(({ card, ...rest }) => rest);
    },
    /**
     * The owner sent a card from the tray: the message for the conversation, and the card leaves the tray.
     * @param {string} sessionId - the receiving conversation.
     * @param {string} id - the card.
     * @param {string} sentence - what the owner typed with it.
     * @param {'send'|'handover'} how - sent (held until a running turn ends) or handed to the running turn.
     */
    deliver(sessionId, id, sentence, how) {
      const tray = Array.isArray(trays[sessionId]) ? trays[sessionId] : [];
      const card = tray.find((entry) => entry.id === id);
      if (!card) throw new Error('That card is not in this conversation\'s tray any more.');
      trays[sessionId] = tray.filter((entry) => entry.id !== id);
      if (trays[sessionId].length === 0) delete trays[sessionId];
      saveTrays();
      log({ event: how === 'handover' ? 'handed over' : 'sent from the tray', id, to: sessionId, withSentence: Boolean(String(sentence ?? '').trim()) });
      return { text: deliveredText(sentence, card.card) };
    },
    /** The owner took a card out of the tray: nothing was sent. */
    drop(sessionId, id) {
      const tray = Array.isArray(trays[sessionId]) ? trays[sessionId] : [];
      if (!tray.some((entry) => entry.id === id)) return false;
      trays[sessionId] = tray.filter((entry) => entry.id !== id);
      if (trays[sessionId].length === 0) delete trays[sessionId];
      saveTrays();
      log({ event: 'removed', id, to: sessionId });
      return true;
    },
    /** A conversation went away for good: its tray goes too (the ledger keeps the sends). */
    forget(sessionId) {
      if (!trays[sessionId]) return;
      delete trays[sessionId];
      saveTrays();
    },
    /** Every send in the ledger, newest last (for the Split page and the linked logs). */
    ledger(limit = 500) {
      if (!ledgerFile) return memoryLedger.slice(-limit);
      if (!existsSync(ledgerFile)) return [];
      const lines = tailLines(ledgerFile).slice(-limit);
      return lines.map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(Boolean);
    },
  };
}
