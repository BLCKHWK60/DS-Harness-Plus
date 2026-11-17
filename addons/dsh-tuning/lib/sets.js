/**
 * Data sets (plan step T3): rows grouped into named sets that build up over time, by task and by subject.
 * Exam rows never enter a set (they are in their own files); near repeats are left out; each set shows its
 * rows, its dates, how many may train, and what it has been used for. A set is written out in the format
 * the trainer reads (chat rows, and preference pairs for trainers that take them).
 */
import { overlap, shingles } from './exam.js';
import { mayTrain, rowText } from './rows.js';

/** The sets by task, and which rows go into each. */
export const TASK_SETS = {
  harness: { name: 'Harness tool calls', about: 'Calling the harness\'s tools correctly and with few wasted steps: tool calls that solved a request, failed calls beside the call that worked, and each plugin\'s lessons', purpose: 'open', takes: (row) => ['toolcalls', 'toolfix', 'lesson'].includes(row.kind) },
  standings: { name: 'Standings', about: 'A claim and the standing the owner ruled (Content)', purpose: 'narrow', takes: (row) => row.kind === 'label' && row.mode === 'content' },
  'source-grades': { name: 'Source grades', about: 'A source that was opened and its grade (Research)', purpose: 'narrow', takes: (row) => row.kind === 'label' && row.mode === 'research' },
  router: { name: 'Router', about: 'A step and the cheapest model that passed it (the work loop)', purpose: 'narrow', takes: (row) => row.kind === 'router' },
  voice: { name: 'Voice', about: 'The writer\'s draft beside your version, and your corrections (preference pairs)', purpose: 'open', takes: (row) => row.kind === 'pair' },
  'device-recipes': { name: 'Device recipes', about: 'What a device reports and the recipe that fitted (Bench)', purpose: 'narrow', takes: (row) => row.kind === 'label' && row.mode === 'bench' },
  answers: { name: 'Checked answers', about: 'A request and an answer that passed its check (Mission items, Research passages, Creator Plus builds)', purpose: 'open', takes: (row) => row.kind === 'answer' },
  qa: { name: 'Subject questions', about: 'Questions built from reference material, each checked against its source', purpose: 'open', takes: (row) => row.kind === 'qa' },
};

/** The near-repeat threshold: rows this alike are one row. */
export const REPEAT = 0.9;

const TEXT_LIMIT = 20_000;
const cache = new Map();
/** A row's three-word runs, worked out once per row id (the id is fixed by the row's text). */
function runsOf(row) {
  const had = row.id ? cache.get(row.id) : undefined;
  if (had) return had;
  const runs = shingles(rowText(row).slice(0, TEXT_LIMIT));
  if (row.id) {
    cache.set(row.id, runs);
    if (cache.size > 200_000) cache.delete(cache.keys().next().value);
  }
  return runs;
}

/**
 * Near repeats without comparing every pair (prefix filtering): runs are put in one order for the whole
 * batch, rarest first; two rows that share 90% of their runs must share one of the first few runs of
 * each, so only rows that do are compared. Runs every row has (a template) are never used to look up.
 * @param {object[]} batch - every row that will be looked up or added (it fixes the order).
 */
function repeatIndex(batch) {
  const seenIn = new Map();
  for (const row of batch) for (const run of runsOf(row)) seenIn.set(run, (seenIn.get(run) ?? 0) + 1);
  const prefixes = new Map();
  const prefixOf = (row) => {
    const had = prefixes.get(row);
    if (had) return had;
    const sorted = [...runsOf(row)].sort((a, b) => (seenIn.get(a) ?? 0) - (seenIn.get(b) ?? 0) || (a < b ? -1 : a > b ? 1 : 0));
    const prefix = sorted.slice(0, sorted.length - Math.ceil(REPEAT * sorted.length) + 1);
    prefixes.set(row, prefix);
    return prefix;
  };
  const index = new Map();
  return {
    add(row) {
      for (const run of prefixOf(row)) {
        const key = `${row.kind}\u0000${run}`;
        const list = index.get(key);
        if (list) list.push(row);
        else index.set(key, [row]);
      }
    },
    /** @returns {object | undefined} an added row this one repeats (90% of its runs or more). */
    find(row) {
      const runs = runsOf(row);
      const compared = new Set();
      for (const run of prefixOf(row)) {
        for (const other of index.get(`${row.kind}\u0000${run}`) ?? []) {
          if (compared.has(other)) continue;
          compared.add(other);
          if (overlap(runsOf(other), runs) >= REPEAT) return other;
        }
      }
      return undefined;
    },
  };
}

/**
 * Leave out exact and near repeats, keeping the first (the oldest).
 * @returns {{kept: object[], dropped: number}}
 */
export function dropRepeats(rows) {
  const kept = [];
  const seen = new Set();
  const index = repeatIndex(rows);
  let dropped = 0;
  for (const row of rows) {
    if (seen.has(row.id) || index.find(row)) {
      dropped += 1;
      continue;
    }
    seen.add(row.id);
    index.add(row);
    kept.push(row);
  }
  return { kept, dropped };
}

/**
 * The exam apart from what trains: exam rows that are the same as, or a near repeat of, a pool row (in
 * either mode, from either harvest) are left out of the exam, so the exam never tests what was learned.
 * @returns {object[]} the exam rows that are not in the pool.
 */
export function examApart(exam, pool) {
  const ids = new Set(pool.map((row) => row.id));
  const index = repeatIndex([...pool, ...exam]);
  for (const row of pool) index.add(row);
  return exam.filter((row) => !ids.has(row.id) && !index.find(row));
}

/**
 * The sets from the pool: one per task, and one per subject for Research and Content.
 * @param {object[]} pool - every pool row (never exam rows).
 * @param {{providers?: object, anthropicOpenEnded?: boolean, used?: Record<string, string[]>}} rules
 * @returns {Record<string, {name: string, about: string, purpose: string, ids: string[], rows: number, mayTrain: number, notTrain: Record<string, number>, first: number, last: number, usedFor: string[]}>}
 */
export function buildSets(pool, { providers = {}, anthropicOpenEnded = false, used = {} } = {}) {
  const sets = {};
  const { kept } = dropRepeats([...pool].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)));
  const add = (id, spec, row) => {
    const set = (sets[id] ??= { name: spec.name, about: spec.about, purpose: spec.purpose, ids: [], rows: 0, mayTrain: 0, notTrain: {}, first: 0, last: 0, usedFor: used[id] ?? [] });
    set.ids.push(row.id);
    set.rows += 1;
    const decision = mayTrain(row, { providers, anthropicOpenEnded, purpose: spec.purpose });
    if (decision.ok) set.mayTrain += 1;
    else set.notTrain[decision.why] = (set.notTrain[decision.why] ?? 0) + 1;
    set.first = set.first ? Math.min(set.first, row.at) : row.at;
    set.last = Math.max(set.last, row.at);
  };
  for (const row of kept) {
    if (row.kind === 'failure') continue;
    for (const [id, spec] of Object.entries(TASK_SETS)) if (spec.takes(row)) add(id, spec, row);
    const subject = String(row.from?.subject ?? '').trim();
    if (subject && (row.mode === 'research' || row.mode === 'content')) {
      const key = `subject-${subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'unnamed'}`;
      add(key, { name: `Subject: ${subject.slice(0, 60)}`, about: 'Everything gathered about one subject', purpose: 'open' }, row);
    }
  }
  return sets;
}

/** A row as one chat example for the trainer: the request, and the answer to learn. */
export function chatRow(row) {
  const messages = (Array.isArray(row.input) ? row.input : []).map((message) => ({ role: message.role === 'tool' ? 'user' : message.role, content: message.content }));
  let answer = row.output;
  if (row.kind === 'label' || row.kind === 'router') {
    messages.push({ role: 'system', content: 'Answer with the label only.' });
    answer = row.label;
  }
  if (!answer) return undefined;
  // Every training example ends with the assistant's turn; a system note goes first.
  const system = messages.filter((message) => message.role === 'system');
  const rest = messages.filter((message) => message.role !== 'system');
  return { messages: [...system, ...rest, { role: 'assistant', content: String(answer) }] };
}

/** A pair row as a preference example. */
export const pairRow = (row) => (row.kind === 'pair' || row.kind === 'toolfix') && row.rejected ? { prompt: (row.input ?? []).map((message) => message.content).join('\n\n'), chosen: row.output, rejected: row.rejected } : undefined;

/**
 * A set written out for the trainer: train and valid (one in ten) as chat rows, and the pairs as
 * preference rows. Only rows that may train for the set's purpose.
 * @returns {{train: object[], valid: object[], pairs: object[], left: number}} the rows to write.
 */
export function trainerRows(rows, { purpose = 'open', providers = {}, anthropicOpenEnded = false } = {}) {
  const usable = rows.filter((row) => mayTrain(row, { providers, anthropicOpenEnded, purpose }).ok);
  const chat = usable.map(chatRow).filter(Boolean);
  const valid = chat.filter((_row, index) => index % 10 === 9);
  const train = chat.filter((_row, index) => index % 10 !== 9);
  // A preference pair also trains on its rejected answer: that writer's rules apply too.
  const pairs = usable.filter((row) => mayTrain(row, { providers, anthropicOpenEnded, purpose, withRejected: true }).ok).map(pairRow).filter(Boolean);
  return { train, valid: valid.length > 0 ? valid : train.slice(0, 1), pairs, left: rows.length - usable.length };
}
