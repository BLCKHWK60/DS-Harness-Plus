/**
 * The ladder (plan, "What goes where"): each kind of knowledge goes to its cheapest home, and Tuner Plus
 * tries the lowest rung first, climbing only when that rung has stopped improving on the exam.
 */

export const RUNGS = [
  { n: 0, name: 'Fix the harness', what: 'a tool, a plugin or a setting (a job for Creator Plus)', cost: 'nothing for the model', where: 'Creator Plus' },
  { n: 1, name: 'Instructions', what: 'the words the model is given', cost: 'minutes', where: 'Learned skills and Self-improve' },
  { n: 2, name: 'Example bank', what: 'approved examples, fetched for each request', cost: 'minutes', where: 'the Voice Library for writing; the ladder proposes one elsewhere' },
  { n: 3, name: 'Tuned prompt', what: 'instructions rewritten by a stronger model that reads the traces of failed runs', cost: 'about an hour of model time', where: 'Self-improve' },
  { n: 4, name: 'Adapter', what: 'a small add-on trained on a data set, on this Mac', cost: 'hours, overnight', where: 'Tuner Plus' },
  { n: 5, name: 'Small specialist', what: 'a much smaller model trained for one role', cost: 'a night or more', where: 'Tuner Plus' },
];

/**
 * The skills part's home (step 8; the owner's answer 5): after Instructions, before the Example bank. It has no
 * number: the six rung numbers keep their meaning for the cards and the bar's Method choice. A rule that always
 * applies belongs in instructions; know-how for one kind of job, needed only sometimes, in a skill.
 */
export const SKILL_HOME = Object.freeze({ n: 'skill', name: 'Skill', what: 'know-how for one kind of job, loaded only when that job comes up (works on every model)', cost: 'minutes', where: 'Tuner Plus (Skills on its page, or ask in a thread)' });
/** The homes in the ladder's order; the skill is among them only while the skills part is on. */
export const homes = (skills = false) => (skills ? [RUNGS[0], RUNGS[1], SKILL_HOME, ...RUNGS.slice(2)] : [...RUNGS]);

/** The goals on the bar, with the data sets each starts from. */
export const GOALS = {
  harness: { name: 'Use the harness without mistakes', sets: ['harness'], kind: 'adapter' },
  voice: { name: 'Write in my voice', sets: ['voice'], kind: 'adapter' },
  judge: { name: 'Judge the way I do', sets: ['standings', 'source-grades'], kind: 'adapter' },
  subject: { name: 'Know a subject', sets: [], kind: 'retrieval' },
  fast: { name: 'Do one job fast', sets: ['router'], kind: 'specialist' },
  find: { name: 'Find what would help most', sets: [], kind: 'find' },
};

/** A set needs at least this many rows that may train before an adapter is worth trying. */
export const ADAPTER_MIN = 300;

/**
 * The lowest rung that could fix a weak spot.
 * @param {{failures?: {why: string}[], toolErrors?: number, tried?: (number|string)[], setRows?: number, kind?: string, calls?: number, flat?: number[], skills?: boolean, sometimes?: boolean}} input -
 *   the exam's failures, how many failures were the tool's own error, the rungs tried already, the rows that
 *   may train in the matching set, the kind of work, how often the role is called, the rungs that stopped
 *   improving; whether the skills part is on, and whether the work is one kind of job that comes up only sometimes.
 * @returns {{rung: number, why: string, home?: string}} the rung; `home: 'skill'` when a skill fits better than instructions.
 */
export function proposeRung({ failures = [], toolErrors = 0, tried = [], setRows = 0, kind = '', calls = 0, flat = [], skills = false, sometimes = false } = {}) {
  if (failures.length > 0 && toolErrors >= failures.length / 2) return { rung: 0, why: 'most failures were the tool\'s own error, not the model\'s: fix the tool first (Creator Plus)' };
  const stalled = (n) => flat.includes(n);
  if (!tried.includes(1) && !stalled(1)) {
    // Know-how needed only sometimes: a skill, loaded only then, instead of words on every request.
    if (skills && sometimes && !tried.includes('skill')) return { rung: 1, home: 'skill', why: 'one kind of job that comes up only sometimes: a skill, loaded only when it comes up (instructions suit a rule that always applies)' };
    return { rung: 1, why: 'no instructions were tried for this yet: the cheapest rung' };
  }
  if (kind === 'pair' && !tried.includes(2) && !stalled(2)) return { rung: 2, why: 'writing: the closest approved examples come next (the Voice Library)' };
  if (!tried.includes(3) && !stalled(3)) return { rung: 3, why: 'the failures follow a pattern a stronger model can read: a tuned prompt' };
  if (setRows < ADAPTER_MIN) return { rung: 3, why: `rungs 1 to 3 stopped improving, but the matching set has ${setRows} rows that may train; an adapter needs at least ${ADAPTER_MIN}` };
  if (calls >= 1000 && (kind === 'label' || kind === 'router') && tried.includes(4)) return { rung: 5, why: 'this role is called so often that speed and cost matter: a small specialist' };
  return { rung: 4, why: 'the skill is narrow and repeated, and its set is large enough: an adapter' };
}

/**
 * The run in one sentence, before it starts.
 * @param {{model: string, goal: string, sets: string[], method: string, minutes: number, lookOnly: boolean, setNames?: Record<string, string>}} run
 * @returns {string}
 */
export function runSentence({ model, goal, sets = [], method = 'auto', minutes = 0, lookOnly = false, setNames = {} }) {
  const goalName = GOALS[goal]?.name ?? 'Find what would help most';
  const names = sets.map((id) => setNames[id] ?? id);
  const setText = names.length === 0 ? 'the sets that fit the goal' : names.length === 1 ? `the ${names[0]} set` : `the ${names.slice(0, -1).join(', ')} and ${names.at(-1)} sets`;
  if (lookOnly) return `Look only: report what would help ${model || 'the model'} with "${goalName}" and what the exam says today, from ${setText}. Nothing is trained.`;
  if (GOALS[goal]?.kind === 'retrieval') return `Build retrieval for the subject first, so ${model || 'the model'} looks facts up; an adapter is offered only for working with the subject.`;
  const rung = method === 'auto' ? 'the lowest rung that passes the exam' : (RUNGS.find((step) => String(step.n) === String(method))?.name ?? method).toLowerCase();
  return `Improve ${model || 'the model'} at "${goalName}" with ${rung}, on ${setText}${minutes > 0 ? `, for at most ${minutes >= 60 ? `${Math.round(minutes / 6) / 10} hours` : `${minutes} minutes`}` : ''}, and test it on that set's exam rows before anything is offered to you.`;
}
