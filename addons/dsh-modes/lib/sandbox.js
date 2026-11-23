/**
 * A conversation's access level (the app's file sandbox mode) as modes change it: a mode sets its
 * level only when a conversation starts in it or switches into it (also a move made while the
 * conversation was not open), never on a plain reload, and leaving it puts back the level from
 * before. Kept apart from the plugin so it can be tested without the app.
 */

/** A level as the app writes it (read-only, workspace-write, danger-full-access…). */
const LEVEL = /^[a-z][a-z-]{0,39}$/;
/** A mode id, as Modes accepts them. */
const MODE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * A stored entry, checked.
 * @param {unknown} value - `{mode, base, set}` as stored in `sessionSandboxBase` (each part optional), or an older plain level.
 * @returns {{mode?: string, base?: string, set?: string} | undefined} what is known; undefined when nothing usable is there.
 */
export function readEntry(value) {
  if (typeof value === 'string') return LEVEL.test(value) ? { base: value } : undefined;
  if (!value || typeof value !== 'object') return undefined;
  const entry = {};
  const is = (pattern, text) => typeof text === 'string' && pattern.test(text);
  if (is(MODE_ID, value.mode)) entry.mode = value.mode;
  // Item 4A, stage 6a: the effective mode's key (lib/spacerules.js modeKey), beside its id.
  if (entry.mode && typeof value.key === 'string' && value.key.length > 0 && value.key.length <= 200) entry.key = value.key;
  if (is(LEVEL, value.base)) {
    entry.base = value.base;
    if (is(LEVEL, value.set)) entry.set = value.set;
  }
  return entry.mode || entry.base ? entry : undefined;
}

/**
 * The level to go back to, from a stored entry.
 * @param {unknown} value - a stored entry (see readEntry).
 * @returns {{base: string, set: string | undefined} | undefined} the earlier level and the level the mode set; undefined when none is stored.
 */
export function readBase(value) {
  const entry = readEntry(value);
  return entry?.base ? { base: entry.base, set: entry.set } : undefined;
}

/**
 * Whether a conversation was moved to another mode while it was not open (the Cowork sidebar's
 * Move writes only the conversation's mode): its level was last applied for another mode.
 * @param {{mode?: string} | undefined} entry - the stored entry.
 * @param {string} modeId - the mode the conversation is in now.
 * @param {string} [key] - item 4A, stage 6a: the effective mode's key (lib/spacerules.js modeKey), only for a sealed or
 *   guarded copy ('' or none for a mode as it is): the same mode moved into a guarded space while closed counts as moved.
 * @returns {boolean} true when the mode changed since its level was last applied.
 */
export function movedSince(entry, modeId, key) {
  if (!entry?.mode) return false;
  if (entry.mode !== modeId) return true;
  return (entry.key ?? '') !== (typeof key === 'string' ? key : '');
}

/**
 * What to do with a conversation's level when a mode is applied to it.
 * @param {object} want - the mode and the conversation.
 * @param {string} want.sandbox - the mode's sandbox: `inherit` (leave as it is) or a level.
 * @param {boolean} want.start - the conversation starts in the mode now, or switches into it (not a reload).
 * @param {string} want.level - the level in force now.
 * @param {{base: string, set?: string} | undefined} want.known - the level from before a mode changed it, and the level that mode set.
 * @param {string} [want.before] - only when nothing is known (a conversation from before 0.57.0) and the
 *   level in force is the one the previous mode sets: the level it presumably had before (the
 *   conversation's permission preset, else the default one).
 * @returns {{write?: string, known?: {base: string, set: string}}} the level to write, if any, and what to remember from now on.
 */
export function sandboxStep({ sandbox, start, level, known, before }) {
  // The level was not changed by hand since the mode set it.
  const untouched = Boolean(known) && (known.set === undefined || level === known.set);
  if (sandbox !== 'inherit') {
    // A conversation that already ran keeps the level it has: it may be one picked by hand.
    if (!start) return { known };
    // From one mode that sets a level to another: the earlier level stays, unless the level was
    // picked by hand in between; then that is the one to go back to.
    const next = { base: untouched ? known.base : known ? level : before ?? level, set: sandbox };
    return level === sandbox ? { known: next } : { write: sandbox, known: next };
  }
  if (!known) return start && before && before !== level ? { write: before } : {};
  // Leaving a mode that set the level: the earlier one comes back, unless the level was changed by hand since.
  return untouched && level !== known.base ? { write: known.base } : {};
}

/**
 * Item 4A, fix round 2: a reused blank draft claimed again for another space or mode (the chat box's claim, before the
 * first message) takes the start access of its new mode: the mode's own level, or for a mode that leaves the level
 * alone (`inherit`) the level from before a mode changed it. Only when Modes set the level now in force (the level was
 * not changed by hand on the draft since): a level picked by hand, or one Modes never set, stays.
 * @param {object} want - the draft.
 * @param {string} want.sandbox - the new mode's sandbox.
 * @param {string} want.level - the level in force.
 * @param {{base: string, set?: string} | undefined} want.known - the stored entry (readBase).
 * @param {string} [want.wrote] - the last level Modes wrote on this draft in this run.
 * @returns {{write?: string}} the level to write, if any.
 */
export function draftAccessStep({ sandbox, level, known, wrote }) {
  const setByModes = wrote !== undefined ? level === wrote : known?.set !== undefined && level === known.set;
  if (!setByModes) return {};
  const target = sandbox && sandbox !== 'inherit' ? sandbox : known?.base;
  if (!target || !LEVEL.test(target) || target === level) return {};
  return { write: target };
}
