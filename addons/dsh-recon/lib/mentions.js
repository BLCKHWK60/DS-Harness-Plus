/**
 * Mentions of other conversations in what the user writes: `@[title](dsh-session:...)` or a bare
 * `dsh-session:...`. The app replaces each with a copy of that conversation's text. An isolated
 * conversation takes in no other conversation, and no other conversation takes in an isolated one,
 * so those mentions are taken out before the app sees them.
 */

/** The app's own pattern for a mention (dsh-session-reference, uri.ts). */
const MENTION = /@\[((?:\\.|[^\\\]])*)\]\((dsh-session:[^\s)]*)\)|(dsh-session:[A-Za-z0-9_-]+)/gu;
const SCHEME = 'dsh-session:';

/** What stands in for a mention that was taken out. */
export const LEFT_OUT = '[a reference to another thread was left out: Recon threads are sealed]';

/**
 * @param {string} uri - `dsh-session:` and the conversation id as base64url JSON.
 * @returns {string | undefined} the conversation id, or undefined when it cannot be read.
 */
export function mentionedId(uri) {
  try {
    const parsed = JSON.parse(Buffer.from(String(uri).slice(SCHEME.length), 'base64url').toString('utf8'));
    return typeof parsed === 'string' && parsed ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Take the mentions that must not be followed out of one text.
 * @param {string} text - what the user wrote.
 * @param {(id: string | undefined) => boolean} drop - whether a mention of this conversation goes (undefined: unreadable).
 * @returns {string} the text, with LEFT_OUT for each mention taken out.
 */
export function dropMentions(text, drop) {
  if (typeof text !== 'string' || !text.includes(SCHEME)) return text;
  return text.replace(MENTION, (whole, _label, markdown, bare) => (drop(mentionedId(markdown ?? bare)) ? LEFT_OUT : whole));
}

/**
 * The same for the user's messages a step is about to send.
 * @param {object[]} messages - the step's messages.
 * @param {(id: string | undefined) => boolean} drop - as for dropMentions.
 * @returns {object[]} the messages, the same array when nothing changed.
 */
export function withoutMentions(messages, drop) {
  let changed = false;
  const out = messages.map((message) => {
    if (message?.source?.kind !== 'user' || !Array.isArray(message.content)) return message;
    let touched = false;
    const content = message.content.map((block) => {
      if (block?.type !== 'text') return block;
      const text = dropMentions(block.text, drop);
      if (text === block.text) return block;
      touched = true;
      return Object.freeze({ ...block, text });
    });
    if (!touched) return message;
    changed = true;
    return Object.freeze({ ...message, content: Object.freeze(content) });
  });
  return changed ? out : messages;
}
