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
 *
 * Item 4A, stage 6a (belt): the Recon space keeps its rules for any mode, so a thread is also hidden when Modes
 * recorded it in the Recon space (`sessionSpaces[id] === 'recon'`; safe, because nothing ever moves into Recon), or
 * when its folder is Recon's room (Recon's `isRoom` says so), which covers a closed thread whose space and mark
 * writes both failed.
 */

/** The id Modes gives a conversation that began in another tab and was later given an isolated one. */
export const LATE_MODE_ID = 'isolated-late';
/** The id of the copy Modes gives a thread its space holds without tools (dsh-modes/lib/isolation.js LOCKED_MODE). */
export const LOCKED_MODE_ID = 'isolated-locked';

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
 * @param {(id: string) => string} [from.folderOf] - item 4A, stage 6a: the conversation's saved folder ('' unknown).
 * @param {(folder: string) => boolean} [from.isRoom] - item 4A, stage 6a: Recon's `isRoom`.
 * @returns {(id: string) => boolean} whether a conversation is isolated.
 */
export function isolatedCheck({ modes, isolated, modeOf, loaded, folderOf, isRoom }) {
  const marked = readObject(modes?.sessionIsolated);
  const spaces = readObject(modes?.sessionSpaces);
  /** Recon's answer per folder, asked once per check. Only a yes hides; a Recon that cannot say hides nothing more. */
  const roomSaid = new Map();
  const inRoom = (id) => {
    if (typeof isRoom !== 'function' || typeof folderOf !== 'function') return false;
    let folder = '';
    try {
      folder = String(folderOf(id) ?? '');
    } catch {
      folder = '';
    }
    if (!folder) return false;
    if (!roomSaid.has(folder)) {
      let yes = false;
      try {
        yes = isRoom(folder) === true;
      } catch {
        yes = false;
      }
      roomSaid.set(folder, yes);
    }
    return roomSaid.get(folder);
  };
  return (id) => {
    if (typeof id !== 'string' || !id) return false;
    if (marked[id] === true) return true;
    if (spaces[id] === 'recon' || inRoom(id)) return true;
    try {
      if (loaded?.(id) !== true || isolated?.(id) !== true) return false;
      const mode = modeOf?.(id);
      if (mode === LATE_MODE_ID) return false;
      // Stage 7 (lab): a thread recorded in Devices or Workshop that never ran sealed (not marked above) is only held
      // there for now (its space is switched off): Modes then answers "isolated" with its locked copy. It holds nothing
      // from Recon, so it stays findable, as the About Spaces (i) says.
      if ((spaces[id] === 'devices' || spaces[id] === 'workshop') && mode === LOCKED_MODE_ID) return false;
      return true;
    } catch {
      // Modes could not answer for an open conversation: keep it out.
      return true;
    }
  };
}
