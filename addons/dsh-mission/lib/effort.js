/**
 * Which thinking level a helper is sent. A model that lists no levels gets none, a conversation whose tier
 * has its effort set to off gets none, and otherwise the level asked for, or the nearest one the model lists.
 * The same preferences as Model Tiers' own chooseEffort (copied: add-ons cannot import each other).
 */

const PREFERENCES = {
  off: ['off', 'none', 'disabled', 'minimal'],
  low: ['low', 'minimal', 'light'],
  medium: ['medium', 'mid', 'moderate', 'default'],
  high: ['high', 'deep', 'extended'],
  'extra-high': ['xhigh', 'extra-high', 'extra_high', 'very-high', 'max'],
  ultra: ['ultra', 'max', 'xhigh', 'extra-high', 'high'],
};
/** The levels from lowest to highest, for "the nearest one". */
const ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
const rankOf = (id) => {
  const key = String(id).toLowerCase();
  const found = Object.entries(PREFERENCES).find(([, names]) => names.includes(key));
  const level = found?.[0] === 'extra-high' || found?.[0] === 'ultra' ? 'xhigh' : found?.[0] === 'off' ? 'minimal' : found?.[0];
  const index = ORDER.indexOf(level ?? key);
  return index;
};

/**
 * @param {string[] | undefined} listed - the levels the model lists (undefined: not known).
 * @param {string | undefined} wanted - the level asked for (planner and reviewer 'high', workers 'medium').
 * @param {string | undefined} tierEffort - the conversation's tier effort ('off' means none).
 * @returns {string | undefined} the level to send; undefined sends none.
 */
export function pickEffort(listed, wanted, tierEffort) {
  if (!wanted) return undefined;
  if (String(tierEffort ?? '').toLowerCase() === 'off') return undefined;
  // Not known (no model information): asked for as before; the retry without a level is the safety net.
  if (!Array.isArray(listed)) return wanted;
  const ids = listed.map(String).filter(Boolean);
  if (ids.length === 0) return undefined;
  const lower = ids.map((id) => ({ id, key: id.toLowerCase() }));
  for (const candidate of PREFERENCES[wanted] ?? [wanted]) {
    const hit = lower.find((entry) => entry.key === candidate);
    if (hit) return hit.id;
  }
  // The nearest listed level by rank; a level with no known rank is never guessed.
  const want = rankOf(wanted);
  const ranked = ids.map((id) => ({ id, rank: rankOf(id) })).filter((entry) => entry.rank >= 0 && !['none', 'off', 'disabled'].includes(entry.id.toLowerCase()));
  if (want < 0 || ranked.length === 0) return undefined;
  // On a tie the lower level: it is the one a small model is likelier to take.
  ranked.sort((a, b) => Math.abs(a.rank - want) - Math.abs(b.rank - want) || a.rank - b.rank);
  return ranked[0].id;
}
