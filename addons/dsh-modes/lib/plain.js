/**
 * Item 4A, stage 4: Plain chat (mode id `plain`), the new start mode of the Chat space. It works like the Cowork mode
 * without Cowork's working method, so on an existing install it starts with Cowork's per-mode choices, once:
 * "Load tools as needed" (`trimModes`), the skills switched off (`skillsOff`) and Tool access (`toolAccess`, with its
 * shipped start `_defaults`). Only what Cowork has and Plain chat lacks is copied; nothing else changes, and a choice
 * made for Plain chat afterwards stays (the flag `plainAdded`). A new install gets the same from new-install-defaults.json.
 *
 * Pure, so it is tested without the app.
 */

/** @returns {object | null} the parsed JSON object, or null when it is not one. */
function objectOf(text) {
  if (text && typeof text === 'object' && !Array.isArray(text)) return text;
  if (typeof text !== 'string' || text.trim() === '') return {};
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * The writes that give Plain chat Cowork's per-mode choices, once.
 * @param {{trimModes?: unknown, skillsOff?: unknown, toolAccess?: unknown}} stored - what is stored now.
 * @returns {Array<{op: 'set', path: string[], value: unknown}>} the writes, with `plainAdded` last.
 */
export function plainAddOps({ trimModes, skillsOff, toolAccess } = {}) {
  const ops = [];
  if (Array.isArray(trimModes) && trimModes.includes('cowork') && !trimModes.includes('plain')) {
    ops.push({ op: 'set', path: ['trimModes'], value: [...trimModes, 'plain'] });
  }
  const off = objectOf(skillsOff);
  if (off && Array.isArray(off.cowork) && !Object.hasOwn(off, 'plain')) {
    ops.push({ op: 'set', path: ['skillsOff'], value: JSON.stringify({ ...off, plain: [...off.cowork] }) });
  }
  const access = objectOf(toolAccess);
  if (access) {
    const next = { ...access };
    let changed = false;
    if (access.cowork && typeof access.cowork === 'object' && !Object.hasOwn(access, 'plain')) {
      next.plain = structuredClone(access.cowork);
      changed = true;
    }
    const starts = access._defaults;
    if (starts && typeof starts === 'object' && !Array.isArray(starts) && starts.cowork && typeof starts.cowork === 'object' && !Object.hasOwn(starts, 'plain')) {
      next._defaults = { ...starts, plain: structuredClone(starts.cowork) };
      changed = true;
    }
    if (changed) ops.push({ op: 'set', path: ['toolAccess'], value: JSON.stringify(next) });
  }
  ops.push({ op: 'set', path: ['plainAdded'], value: true });
  return ops;
}

/** @returns {object | null} a dict stored as an object (or JSON text), or null when it is not one. */
function dictOf(value) {
  return objectOf(value);
}

/** @returns {string[] | null} a list stored as JSON text (or an array), or null when it is not one. */
function listOf(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || value.trim() === '') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * The other per-mode settings Plain chat inherits from Cowork (item 4A, fix round 2), each copied once where Cowork has
 * one and Plain chat none, without rewriting the Cowork entry (decided per setting; README "Plain chat and the Cowork
 * switch"). Plain chat works like Cowork without its method, with tools on, so it inherits Cowork's, not Chat's:
 * - Modes `modeStart` (Starting values: Web, Web sources, Depth, Helpers, Tools) and `longTools` (Mission tools);
 * - Mission `loopTabs` (the work loop without Ultra Code): `plain` added where `cowork` is listed;
 * - Sampling presets `byMode` and Agent swarm `defaultSwarmByMode`: Cowork's entry copied.
 * Context saver needs nothing: it already treats every mode other than Chat and Code as Cowork.
 * @param {{modeStart?: unknown, longTools?: unknown}} stored - Modes' own settings.
 * @param {Record<string, object>} [others] - the other add-ons' settings that are there, by namespace (`mission`,
 *   `sampling-presets`, `agent-swarm`); an add-on that is not there is left out.
 * @returns {{modes: Array<{op: 'set', path: string[], value: unknown}>, others: Record<string, Array<{op: 'set', path: string[], value: unknown}>>}}
 *   Modes' writes, with `plainCarried` last, and each other add-on's writes.
 */
export function plainCarryOps({ modeStart, longTools } = {}, others = {}) {
  const modes = [];
  for (const [field, value] of [['modeStart', modeStart], ['longTools', longTools]]) {
    const dict = objectOf(value);
    if (dict && dict.cowork && typeof dict.cowork === 'object' && !Object.hasOwn(dict, 'plain')) {
      modes.push({ op: 'set', path: [field], value: JSON.stringify({ ...dict, plain: structuredClone(dict.cowork) }) });
    }
  }
  const out = {};
  const loop = others.mission ? listOf(others.mission.loopTabs) : null;
  if (loop && loop.includes('cowork') && !loop.includes('plain')) out.mission = [{ op: 'set', path: ['loopTabs'], value: JSON.stringify([...loop, 'plain']) }];
  for (const [ns, field] of [['sampling-presets', 'byMode'], ['agent-swarm', 'defaultSwarmByMode']]) {
    const dict = others[ns] ? dictOf(others[ns][field]) : null;
    if (dict && typeof dict.cowork === 'string' && dict.cowork && !Object.hasOwn(dict, 'plain')) out[ns] = [{ op: 'set', path: [field], value: { ...dict, plain: dict.cowork } }];
  }
  modes.push({ op: 'set', path: ['plainCarried'], value: true });
  return { modes, others: out };
}
