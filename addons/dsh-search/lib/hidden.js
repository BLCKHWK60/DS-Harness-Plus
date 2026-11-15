/**
 * Which conversations Global Search never shows: isolated ones (Recon). Kept apart from the plugin
 * so it can be tested without the app.
 *
 * A conversation counts as isolated when the Modes add-on's settings say so, or Modes itself does:
 *   - `sessionIsolated` lists every conversation that began in an isolated mode (for good). Modes
 *     writes it at the conversation's first turn, and Rerun's copies carry it too;
 *   - for a conversation that is open in the app, `modes.isolated(id)` answers (it follows a
 *     helper to its conversation). This also covers a new Recon conversation before its mark is
 *     stored.
 * A closed conversation is never asked about through `modes.isolated`: for an id it does not know,
 * that answer follows the tab selected now, not the conversation. Nor does an open conversation
 * count whose mode Modes gives as `isolated-late` (dsh-modes/lib/isolation.js LATE_MODE): it began
 * elsewhere and was only locked when an isolated tab was chosen for it (for example with the Cowork
 * sidebar's "Move to" menu), so it holds nothing from that tab and stays findable.
 * A conversation's stored mode (`sessionModes`) is not counted on its own, for the same reason: a
 * conversation moved into the Recon tab has that mode but holds nothing from Recon.
 */

/** The id Modes gives a conversation that began in another tab and was later given an isolated one. */
export const LATE_MODE_ID = 'isolated-late';

/** @returns {object} a JSON object stored as text, or {} when it is not one. */
export function readObject(text) {
  try {
    const value = typeof text === 'string' ? JSON.parse(text || '{}') : text;
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/**
 * @param {object} from - what is known.
 * @param {object | undefined} from.modes - the Modes add-on's settings (`settings.describe()`, ns `modes`); its
 *   `sessionIsolated` is read.
 * @param {(id: string) => boolean} [from.isolated] - `modes.isolated(id)`.
 * @param {(id: string) => string} [from.modeOf] - `modes.get(id)`, the mode Modes holds the conversation in.
 * @param {(id: string) => boolean} [from.loaded] - whether the conversation is open in the app.
 * @returns {(id: string) => boolean} whether a conversation is isolated.
 */
export function isolatedCheck({ modes, isolated, modeOf, loaded }) {
  const marked = readObject(modes?.sessionIsolated);
  return (id) => {
    if (typeof id !== 'string' || !id) return false;
    if (marked[id] === true) return true;
    try {
      return loaded?.(id) === true && isolated?.(id) === true && modeOf?.(id) !== LATE_MODE_ID;
    } catch {
      // Modes could not answer for an open conversation: keep it out.
      return true;
    }
  };
}
