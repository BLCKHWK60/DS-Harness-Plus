/**
 * Skill first, adapter later (step 15; the owner's prompt: "When a skill has passed its exam and been used
 * often, its checked runs can become rows for the harness adapter … The local model then does the job without
 * loading the skill, and the skill stays for the other models").
 *
 * A gathered tool-call row keeps the model's calls, the `skill` call among them, never the skill's text. For a
 * skill you agreed to teach, the harness set's rows are handed to the trainer and the exam without that
 * skill's call: the adapter learns to do the job without loading it. The stored rows are never changed, the
 * "may train" rules apply as before, and nothing changes for the skill itself.
 */

/** A skill is proposed after this many loads, mostly ending well, with this many checked runs. */
export const TEACH_LOADS = 20;
export const TEACH_WELL = 0.8;
export const TEACH_ROWS = 10;

/** The calls of a tool-call row's (or a lesson's) answer, or undefined when it cannot be read. */
const callsOf = (row) => {
  if (!['toolcalls', 'lesson'].includes(row?.kind) || typeof row.output !== 'string') return undefined;
  try {
    const value = JSON.parse(row.output);
    return value && Array.isArray(value.calls) ? value : undefined;
  } catch {
    return undefined;
  }
};
const loadedName = (call) => (call?.name === 'skill' && typeof call.arguments?.name === 'string' ? call.arguments.name : '');

/** The skills a row's run loaded (its `skill` calls). */
export function skillsLoadedIn(row) {
  const value = callsOf(row);
  return value ? [...new Set(value.calls.map(loadedName).filter(Boolean))] : [];
}

/**
 * A row as the trainer and the exam get it: without the loading of the skills being taught. Undefined when
 * nothing would be left to learn (no other call and no answer).
 * @param {object} row
 * @param {Set<string>} taught - the skills you agreed to teach.
 */
export function withoutTaught(row, taught) {
  if (taught.size === 0) return row;
  // A failed call beside the one that worked: when the one that worked loads a taught skill, it is left out
  // whole (its answer is that one call).
  if (row?.kind === 'toolfix') {
    try {
      return taught.has(loadedName(JSON.parse(row.output))) ? undefined : row;
    } catch {
      return row;
    }
  }
  const value = callsOf(row);
  if (!value) return row;
  const gone = value.calls.filter((call) => taught.has(loadedName(call))).map(loadedName);
  if (gone.length === 0) return row;
  const calls = value.calls.filter((call) => !taught.has(loadedName(call)));
  if (calls.length === 0 && !String(value.answer ?? '').trim()) return undefined;
  return { ...row, output: JSON.stringify({ ...value, calls }), from: { ...row.from, taughtWithout: [...new Set(gone)] } };
}

/** Rows for the trainer or the exam, with the taught skills' loading left out. */
export const rowsWithoutTaught = (rows, taught) => (taught.size === 0 ? rows : rows.map((row) => withoutTaught(row, taught)).filter(Boolean));

/**
 * The skills worth proposing: loaded often, mostly ending well, its last loading check found nothing, and
 * enough checked runs that loaded it.
 * @param {{rows: object[], uses: Map<string, {loads: number, well: number}>, checks: Record<string, {found?: string[]}>, skills: {key: string, name: string}[], taught: Set<string>, skip: Set<string>}} input
 * @returns {{name: string, key: string, loads: number, well: number, rows: number}[]}
 */
/** How many rows loaded each skill (one pass). */
export function runsBySkill(rows) {
  const runs = new Map();
  for (const row of rows) if (row?.kind === 'toolcalls') for (const name of skillsLoadedIn(row)) runs.set(name, (runs.get(name) ?? 0) + 1);
  return runs;
}

export function teachable({ rows, uses, checks, skills, taught, skip }) {
  const runs = runsBySkill(rows);
  const out = [];
  for (const skill of skills) {
    if (taught.has(skill.name) || skip.has(skill.name) || out.some((one) => one.name === skill.name)) continue;
    const use = uses.get(skill.name);
    const check = checks[skill.key];
    if (!use || use.loads < TEACH_LOADS || use.well / use.loads < TEACH_WELL) continue;
    if (!check || (Array.isArray(check.found) && check.found.length > 0)) continue;
    const count = runs.get(skill.name) ?? 0;
    if (count < TEACH_ROWS) continue;
    out.push({ name: skill.name, key: skill.key, loads: use.loads, well: use.well, rows: count });
  }
  return out;
}
