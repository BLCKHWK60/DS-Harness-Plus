/**
 * Tuner Plus's marks on the Skills page (Tuner Plus's step 13): where each skill came from (Default,
 * Downloaded, Plus, AI-made, Mine, Not sorted), asked from Tuner Plus's service while that add-on and its
 * skills part are on. Without them, the page is exactly as before: no mark, no filter.
 */

/** How long the page waits for Tuner Plus's answer before it shows the list without marks. */
export const MARKS_WAIT_MS = 3000;
const MARK_ID = /^[a-z]{2,16}$/;
const text = (value, size) => (typeof value === 'string' ? value.slice(0, size) : '');

/**
 * Tuner Plus's answer, checked: `{ names: {mark: name}, list: [{name, path, provider, mark}] }`.
 * @returns {{names: Record<string, string>, list: {name: string, path: string, provider: string, mark: string}[]}|undefined}
 */
export function marksFrom(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.list) || !raw.names || typeof raw.names !== 'object') return undefined;
  const names = {};
  for (const [mark, name] of Object.entries(raw.names).slice(0, 16)) if (MARK_ID.test(mark) && typeof name === 'string' && name.trim()) names[mark] = name.slice(0, 40);
  const list = raw.list.slice(0, 5000)
    .filter((one) => one && typeof one === 'object' && typeof one.name === 'string' && typeof one.mark === 'string' && names[one.mark])
    .map((one) => ({ name: text(one.name, 200), path: text(one.path, 2000), provider: text(one.provider, 200), mark: one.mark }));
  return Object.keys(names).length > 0 ? { names, list } : undefined;
}

/**
 * Each listed skill with its mark, matched by name and file (or, for a skill with no file, by name and the
 * part of the app that gives it). A skill Tuner Plus does not know stays without a mark.
 */
export function withMarks(skills, marks) {
  if (!marks) return skills;
  return skills.map((skill) => {
    const found = marks.list.find((one) => one.name === skill.name && (skill.path ? one.path === skill.path : !one.path && one.provider === skill.provider));
    return found ? { ...skill, mark: found.mark, markName: marks.names[found.mark] } : skill;
  });
}

/**
 * Ask Tuner Plus for its marks: undefined when it is absent, off, too slow or answers something else.
 * @param {() => any} getTuning - reads Tuner Plus's service (may throw when there is none).
 */
export async function askMarks(getTuning, wait = MARKS_WAIT_MS) {
  let tuning;
  try {
    tuning = getTuning();
  } catch {
    return undefined;
  }
  if (tuning?.apiVersion !== 1 || typeof tuning.skillMarks !== 'function') return undefined;
  let timer;
  try {
    const raw = await Promise.race([
      Promise.resolve().then(() => tuning.skillMarks()),
      new Promise((resolve) => { timer = setTimeout(() => resolve(undefined), wait); timer.unref?.(); }),
    ]);
    return marksFrom(raw);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}
