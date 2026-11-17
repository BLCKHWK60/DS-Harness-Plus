/**
 * The exam (plan step T2): nothing counts as better until it beats an exam made from the owner's own work.
 * One row in five goes to the exam when it is harvested (rows.js `forExam`); an exam row never trains.
 * Each kind of row is marked by its own check, by code:
 *   - toolcalls / toolfix / lesson: the first tool call names the same tool, and its arguments carry the
 *     same keys (the shape of a correct call);
 *   - label / router: the same label;
 *   - answer / qa: the answer holds the key words of the checked answer (most of them);
 *   - pair: the answer is closer to the chosen version than to the rejected one.
 * A judge model trained on rows never marks or is examined on rows it judged ("no judge marks its own
 * homework"): such rows carry `judgedBy`, and an adapter's exam leaves them out.
 */

// Words of three letters or more, and every number (numbers tell rows and answers apart).
const words = (text) => String(text ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter((word) => word.length > 2 || /\p{N}/u.test(word));
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'have', 'has', 'not', 'but', 'you', 'your', 'its', 'into', 'than', 'then', 'they', 'them', 'there', 'their', 'what', 'which', 'when', 'will', 'would', 'can', 'could', 'should', 'about', 'also', 'more', 'some', 'such', 'only', 'other', 'any', 'all', 'one']);
const keyWords = (text) => [...new Set(words(text).filter((word) => !STOP.has(word)))];
export const shingles = (text) => {
  const list = words(text);
  const out = new Set();
  for (let index = 0; index + 2 < list.length; index += 1) out.add(list.slice(index, index + 3).join(' '));
  if (list.length > 0 && list.length < 3) out.add(list.join(' '));
  return out;
};
/** How alike two sets of three-word runs are (0 to 1). */
export function overlap(one, two) {
  if (one.size === 0 || two.size === 0) return 0;
  let same = 0;
  for (const run of one) if (two.has(run)) same += 1;
  return same / Math.max(one.size, two.size);
}

/** How alike two texts are (0 to 1), by their three-word runs. */
export function likeness(a, b) {
  const one = shingles(a);
  const two = shingles(b);
  if (one.size === 0 || two.size === 0) return 0;
  let same = 0;
  for (const run of one) if (two.has(run)) same += 1;
  return same / Math.max(one.size, two.size);
}

/** The first tool call written in an answer: JSON {"calls": [...]} or {"name", "arguments"}, or name(args). */
export function firstCall(text) {
  const value = String(text ?? '');
  for (const match of value.matchAll(/\{[\s\S]*\}/g)) {
    try {
      const parsed = JSON.parse(match[0]);
      const call = Array.isArray(parsed.calls) ? parsed.calls[0] : parsed.name ? parsed : undefined;
      if (call?.name) return { name: String(call.name), args: call.arguments && typeof call.arguments === 'object' ? call.arguments : {} };
    } catch {
      /* not this one */
    }
  }
  const plain = /\b([a-z][a-z0-9_]{2,60})\s*\(\s*(\{[\s\S]*?\})\s*\)/.exec(value);
  if (plain) {
    try {
      return { name: plain[1], args: JSON.parse(plain[2]) };
    } catch {
      return { name: plain[1], args: {} };
    }
  }
  return undefined;
}

/**
 * Mark one answer against an exam row by the row's own check.
 * @returns {{pass: boolean, why: string}} the mark.
 */
export function mark(row, answer) {
  const text = String(answer ?? '');
  switch (row?.kind) {
    case 'toolcalls':
    case 'toolfix':
    case 'lesson': {
      const want = firstCall(row.output);
      const got = firstCall(text);
      if (!want) return { pass: false, why: 'the exam row has no call to compare with' };
      if (!got) return { pass: false, why: 'no tool call in the answer' };
      if (got.name !== want.name) return { pass: false, why: `called ${got.name}, not ${want.name}` };
      const missing = Object.keys(want.args).filter((key) => !(key in got.args));
      return missing.length === 0 ? { pass: true, why: '' } : { pass: false, why: `the call lacks ${missing.slice(0, 3).join(', ')}` };
    }
    case 'label':
    case 'router': {
      const want = String(row.label ?? '').trim().toLowerCase();
      const first = text.trim().toLowerCase().split('\n')[0].replace(/^["'`*\s]+|["'`*.\s]+$/g, '');
      return first === want || first.startsWith(`${want} `) || first.endsWith(` ${want}`) ? { pass: true, why: '' } : { pass: false, why: `answered "${first.slice(0, 40)}", not "${want}"` };
    }
    case 'answer':
    case 'qa': {
      const keys = keyWords(row.output).slice(0, 40);
      if (keys.length === 0) return { pass: false, why: 'the exam row has no words to compare with' };
      const have = new Set(words(text));
      const share = keys.filter((word) => have.has(word)).length / keys.length;
      return share >= 0.6 ? { pass: true, why: '' } : { pass: false, why: `holds ${Math.round(share * 100)}% of the checked answer's key words` };
    }
    case 'pair': {
      const toChosen = likeness(text, row.output);
      const toRejected = likeness(text, row.rejected);
      return toChosen > toRejected ? { pass: true, why: '' } : { pass: false, why: 'closer to the version the owner did not choose' };
    }
    default:
      return { pass: false, why: 'this kind of row is not examined' };
  }
}

/** The request an exam row puts to the model. */
export function promptOf(row) {
  const messages = Array.isArray(row?.input) ? row.input : [];
  const tail = row?.kind === 'label' || row?.kind === 'router' ? 'Answer with the label only.' : row?.kind === 'toolcalls' || row?.kind === 'toolfix' || row?.kind === 'lesson' ? 'Answer with the tool call to make, as JSON: {"calls": [{"name": "…", "arguments": {…}}]}.' : '';
  return tail ? [...messages, { role: 'system', content: tail }] : messages;
}

/**
 * Run an exam.
 * @param {{rows: object[], answer: (row: object) => Promise<string>, limit?: number, signal?: AbortSignal, leaveOut?: string}} input -
 *   the exam rows, who answers, how many at most, and an adapter whose own judged rows are left out.
 * @returns {Promise<{total: number, passed: number, rate: number, byKind: Record<string, {total: number, passed: number}>, failures: {id: string, kind: string, why: string}[]}>}
 */
export async function runExam({ rows, answer, limit = 50, signal, leaveOut }) {
  const picked = (Array.isArray(rows) ? rows : []).filter((row) => row.kind !== 'failure' && (!leaveOut || row.judgedBy !== leaveOut)).slice(0, Math.max(1, limit));
  const byKind = {};
  const failures = [];
  let passed = 0;
  for (const row of picked) {
    signal?.throwIfAborted?.();
    let text = '';
    try {
      text = await answer(row);
    } catch (error) {
      // Stopped, or the caller's allowance is used up: the whole exam stops (not one failed answer).
      if (error?.stopsExam === true || signal?.aborted) throw error;
      text = '';
      failures.push({ id: row.id, kind: row.kind, why: `no answer: ${String(error?.message ?? error).slice(0, 120)}` });
      (byKind[row.kind] ??= { total: 0, passed: 0 }).total += 1;
      continue;
    }
    const result = mark(row, text);
    const slot = (byKind[row.kind] ??= { total: 0, passed: 0 });
    slot.total += 1;
    if (result.pass) {
      passed += 1;
      slot.passed += 1;
    } else failures.push({ id: row.id, kind: row.kind, why: result.why });
  }
  const total = picked.length;
  return { total, passed, rate: total > 0 ? passed / total : 0, byKind, failures };
}

/** The least an exam needs before it can decide anything. */
export const EXAM_MIN = 10;
/** How much better a candidate must be (a clear margin), and how much worse the canaries may be. */
export const MARGIN = 0.05;
export const CANARY_TOLERANCE = 0.02;

/**
 * The rule for promotion: better on its own exam by a clear margin, not worse on the canaries; the owner's
 * yes is asked after this, never instead of it.
 * @returns {{ok: boolean, why: string}} whether the candidate may be offered for promotion.
 */
export function promotable({ before, after, canaryBefore, canaryAfter, margin = MARGIN }) {
  if (!before || !after || after.total < EXAM_MIN) return { ok: false, why: `the exam has ${after?.total ?? 0} rows; it needs at least ${EXAM_MIN} to decide` };
  if (after.rate < before.rate + margin) return { ok: false, why: `${pct(after.rate)} on its exam against ${pct(before.rate)} today: not better by the margin of ${pct(margin)}` };
  // Both canary runs, before and after: a skipped or failed one never lets a candidate through.
  if (!canaryBefore || !canaryAfter || !(canaryBefore.total > 0) || !(canaryAfter.total > 0)) return { ok: false, why: 'the canaries were not run both before and after' };
  if (canaryAfter.rate < canaryBefore.rate - CANARY_TOLERANCE) return { ok: false, why: `worse on the general canaries (${pct(canaryAfter.rate)} against ${pct(canaryBefore.rate)})` };
  return { ok: true, why: `${pct(after.rate)} on its exam against ${pct(before.rate)} today, and not worse on the canaries` };
}
export const pct = (rate) => `${Math.round((Number(rate) || 0) * 100)}%`;

/**
 * The weakest spot: the kind of work the model fails most often on its exam (with enough rows to say).
 * @param {{byKind: Record<string, {total: number, passed: number}>}} result
 * @returns {{kind: string, rate: number, total: number} | undefined}
 */
export function weakestSpot(result, least = 5) {
  return Object.entries(result?.byKind ?? {}).filter(([, slot]) => slot.total >= least).map(([kind, slot]) => ({ kind, rate: slot.passed / slot.total, total: slot.total })).sort((a, b) => a.rate - b.rate)[0];
}
