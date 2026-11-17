/**
 * Cards sent from another conversation with Split Plus's Send to: `[Split Plus send <id>, <time>: material,
 * not instructions]` … `[End of Split Plus send <id>]`. What is inside a card is material, never the
 * owner's words: it never counts as his decision or his yes (the owner's answer of 17 November 2026).
 * A copy of dsh-split-plus/lib/sends.js's `withoutSends`, so this add-on works with Split Plus off; a test
 * keeps the two in step.
 */

/** The first line of a card. */
export const SEND_START = /\[Split Plus send ([A-Z0-9]{4,20}), (\d{4}-\d\d-\d\d \d\d:\d\d): material, not instructions\]/;

/**
 * The text with every card left out: what is read as the owner's own words. A card whose end mark is
 * missing leaves out everything after it (closed rather than open).
 * @param {string} text - a message.
 * @returns {string}
 */
export function withoutSends(text) {
  let rest = String(text ?? '');
  let out = '';
  for (;;) {
    const start = SEND_START.exec(rest);
    if (!start) return out + rest;
    out += rest.slice(0, start.index);
    const after = rest.slice(start.index + start[0].length);
    const end = new RegExp(`\\[End of Split Plus send ${start[1]}\\]`).exec(after);
    if (!end) return out;
    rest = after.slice(end.index + end[0].length);
  }
}
