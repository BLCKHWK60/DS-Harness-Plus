/**
 * Item 4A, stage 6b, Part A (STAGE6B-DESIGN.md J3): the text of a message Modes refused because the thread's model is an
 * engine and its space keeps its own rules (Recon, guests in Devices or Workshop). The chat box puts it back, so the
 * owner does not have to type it again.
 *
 * Rules (all of them tested in test/engine-held-6b.test.mjs):
 * - only the text of messages the user wrote (source kind user, a skill call, a reply to a question), never the
 *   scheduler's or a tool's;
 * - at most HELD_TEXT_MAX characters, for HELD_TEXT_MS, for at most HELD_THREADS threads;
 * - kept in memory only: never written, never logged, never in a ledger; dropped when the thread is disposed (Recon's
 *   End and wipe disposes it too);
 * - kept per top thread; only that thread's own view offers it (index.js modeView), until the chat box says it took it.
 */
import { randomUUID } from 'node:crypto';

/** The message source kinds the user wrote (the same set as index.js USER_KINDS). */
export const HELD_USER_KINDS = Object.freeze(['user', 'skill-invocation', 'user-question-reply']);
/** The most characters kept. */
export const HELD_TEXT_MAX = 20_000;
/** How long a kept text may be put back. */
export const HELD_TEXT_MS = 10 * 60_000;
/** The most threads with a kept text at once (the oldest goes first). */
export const HELD_THREADS = 200;

/**
 * The text the user wrote in a step's messages: the text parts of user messages, joined with blank lines.
 * @param {unknown} messages - the pre-step payload's messages (`{source, content}`, or `{message: {source, content}}`).
 * @param {Iterable<string>} [kinds] - the source kinds that count as the user's.
 * @returns {string} the text ('' when there is none), cut to HELD_TEXT_MAX characters.
 */
export function heldTextOf(messages, kinds = HELD_USER_KINDS) {
  const wanted = new Set(kinds);
  const parts = [];
  for (const item of Array.isArray(messages) ? messages : []) {
    const message = item && typeof item === 'object' && item.message && typeof item.message === 'object' && !item.source ? item.message : item;
    const kind = message?.source?.kind ?? item?.source?.kind;
    if (!wanted.has(kind)) continue;
    const content = message?.content;
    let text = '';
    if (typeof content === 'string') text = content;
    else if (Array.isArray(content)) text = content.map((block) => (block && block.type === 'text' && typeof block.text === 'string' ? block.text : '')).join('');
    if (text.trim()) parts.push(text);
  }
  return parts.join('\n\n').slice(0, HELD_TEXT_MAX);
}

/**
 * The kept texts, by top thread.
 * @param {{now?: () => number, newId?: () => string}} [options] - a clock and an id maker (tests).
 */
export function engineHeldTexts({ now = () => Date.now(), newId = randomUUID } = {}) {
  /** top -> {id, text, at, taken} */
  const kept = new Map();
  const fresh = (top) => {
    const entry = kept.get(top);
    if (!entry) return undefined;
    if (now() - entry.at > HELD_TEXT_MS) {
      kept.delete(top);
      return undefined;
    }
    return entry;
  };
  return Object.freeze({
    /**
     * Keep the user's text of a refused step. A step with no user text keeps what was kept before.
     * @returns {boolean} whether a text was kept.
     */
    keep(top, messages) {
      if (typeof top !== 'string' || !top) return false;
      const text = heldTextOf(messages);
      if (!text) return false;
      kept.delete(top);
      kept.set(top, { id: newId(), text, at: now(), taken: false });
      while (kept.size > HELD_THREADS) kept.delete(kept.keys().next().value);
      return true;
    },
    /** @returns {{id: string, text: string} | null} the text not yet taken and still recent. */
    draft(top) {
      const entry = fresh(top);
      return entry && !entry.taken ? Object.freeze({ id: entry.id, text: entry.text }) : null;
    },
    /** @returns {boolean} whether a text was kept for this thread recently (taken or not). */
    had(top) {
      return Boolean(fresh(top));
    },
    /** @returns {boolean} whether this thread's kept text was taken by a chat box (put back) and is still recent. */
    taken(top) {
      return fresh(top)?.taken === true;
    },
    /**
     * The chat box took it (or the owner pressed Put back): the text is deleted, the mark that one was kept stays.
     * @returns {boolean} whether the id was the thread's kept text.
     */
    take(top, id) {
      const entry = fresh(top);
      if (!entry || entry.taken || typeof id !== 'string' || entry.id !== id) return false;
      entry.taken = true;
      entry.text = '';
      return true;
    },
    /** The thread is gone: forget it. */
    drop(top) {
      kept.delete(top);
    },
    /** For tests: how many threads have a kept entry. */
    size() {
      return kept.size;
    },
  });
}
