/**
 * The loop itself, kept free of the app so it can be tested on its own.
 * The caller supplies how to run the model under test, the reviewer and the judge.
 *
 *   measure   run tasks with one version of the instructions, several times each
 *   improve   measure the version in use, show the reviewer what fails on the
 *             "learn" tasks, test each proposed change on the "check" and
 *             "guard" tasks, and keep the ones that clear every gate for the
 *             owner to approve
 */
import { isSolid, judgeCandidate, summarize } from './gates.js';
import { applyEdit, describeEdit, leakOf, nextVersion, renderPolicy, validateEdit } from './policy.js';
import { buildPacket, parseReview } from './review.js';
import { fingerprint } from './store.js';
import { verdictOf } from './verify.js';

/** Thrown to stop a job that has used up its allowance. */
export class BudgetError extends Error {}

/**
 * A token allowance shared by every model call of one job.
 * @param {number} limit - most tokens (input plus output); 0 means no limit.
 * @returns {{used: number, limit: number, add: (tokens: number) => void, check: () => void}} allowance.
 */
export function makeBudget(limit) {
  const budget = {
    used: 0,
    limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
    add(tokens) {
      budget.used += Math.max(0, Number(tokens) || 0);
    },
    check() {
      if (budget.limit > 0 && budget.used >= budget.limit) {
        throw new BudgetError(`The token allowance for this run (${budget.limit.toLocaleString('en-US')}) is used up.`);
      }
    },
  };
  return budget;
}

/**
 * Run tasks with one version of the instructions.
 * @param {object} input - what to run.
 * @param {object[]} input.tasks - tasks to run.
 * @param {object} input.policy - the instructions under test.
 * @param {number} input.repeats - runs per task.
 * @param {(task: object, notes: string, signal?: AbortSignal) => Promise<{answer: string, inTokens?: number, outTokens?: number, folder?: string}>} input.run - runs the model under test.
 * @param {(task: object, rubric: string, answer: string, signal?: AbortSignal) => Promise<{status: string, detail: string, tokens?: number}>} [input.judge] - grades with a judge model.
 * @param {ReturnType<typeof makeBudget>} input.budget - shared allowance.
 * @param {(done: number, total: number, taskId: string) => void} [input.onProgress] - called after each run.
 * @param {AbortSignal} [input.signal] - stops the job.
 * @returns {Promise<object[]>} one result per task: `{taskId, split, family, passes, runs, outTokens, details, sample}`.
 */
export async function measure({ tasks, policy, repeats, run, judge, budget, onProgress, signal }) {
  const results = [];
  const total = tasks.length * repeats;
  let done = 0;
  for (const task of tasks) {
    const result = { taskId: task.id, split: task.split, family: task.family, passes: 0, runs: 0, outTokens: 0, details: [], sample: '' };
    const notes = renderPolicy(policy, task.family);
    for (let attempt = 0; attempt < repeats; attempt += 1) {
      signal?.throwIfAborted();
      budget.check();
      let verdict;
      let answer = '';
      try {
        const outcome = await run(task, notes, signal);
        answer = String(outcome.answer ?? '');
        budget.add((outcome.inTokens ?? 0) + (outcome.outTokens ?? 0));
        result.outTokens += outcome.outTokens ?? 0;
        let judged;
        const rubric = task.checks.find((check) => check.type === 'judge');
        if (rubric && judge) {
          budget.check();
          judged = await judge(task, rubric.value, answer, signal);
          budget.add(judged.tokens ?? 0);
        }
        verdict = verdictOf(task.checks, { answer, folder: outcome.folder, judge: judged });
      } catch (error) {
        if (signal?.aborted || error instanceof BudgetError) throw error;
        // A run that failed to produce an answer is a failed run, never a skipped one.
        verdict = { status: 'FAIL', detail: `The run failed: ${String(error?.message ?? error).slice(0, 160)}` };
      }
      result.runs += 1;
      if (verdict.status === 'PASS') result.passes += 1;
      else {
        if (verdict.detail && !result.details.includes(verdict.detail)) result.details.push(verdict.detail);
        if (!result.sample) result.sample = answer;
      }
      done += 1;
      onProgress?.(done, total, task.id);
    }
    results.push(result);
  }
  return results;
}

/**
 * Results of the version in use, measured now or taken from the last measurement
 * when nothing they depend on has changed.
 * @param {object} input - see `measure`; plus `store`, `model` and `force`.
 * @returns {Promise<{results: object[], fresh: boolean}>} results, and whether they were measured now.
 */
export async function baseline({ store, policy, tasks, model, repeats, force, ...rest }) {
  const print = fingerprint(tasks, model, repeats);
  const kept = store.results(policy.version);
  if (!force && kept?.fingerprint === print && Array.isArray(kept.results)) return { results: kept.results, fresh: false };
  const results = await measure({ tasks, policy, repeats, ...rest });
  store.saveResults(policy.version, { version: policy.version, at: new Date().toISOString(), fingerprint: print, model, repeats, results });
  return { results, fresh: true };
}

/**
 * One improvement cycle.
 * @param {object} input - the cycle's parts.
 * @param {object} input.store - the data store.
 * @param {{provider: string, model: string}} input.model - the model under test.
 * @param {number} input.repeats - runs per task.
 * @param {number} input.maxEdits - most changes tried.
 * @param {{costCeiling?: number}} input.thresholds - gate thresholds.
 * @param {Function} input.run - see `measure`.
 * @param {Function} [input.judge] - see `measure`.
 * @param {(packet: string, signal?: AbortSignal) => Promise<{text: string, tokens?: number}>} input.review - asks the reviewer model.
 * @param {ReturnType<typeof makeBudget>} input.budget - shared allowance.
 * @param {(phase: string, done?: number, total?: number) => void} [input.onPhase] - progress.
 * @param {AbortSignal} [input.signal] - stops the cycle.
 * @returns {Promise<{summary: string, candidates: object[], diagnosis: object[]}>} what happened, in one sentence, and the proposals.
 */
export async function improve({ store, model, repeats, maxEdits, thresholds, run, judge, review, budget, onPhase, signal }) {
  const tasks = store.tasks().filter((task) => task.enabled && task.checks.length > 0);
  const learn = tasks.filter((task) => task.split === 'learn');
  const proof = tasks.filter((task) => task.split !== 'learn');
  if (learn.length === 0) return { summary: 'There are no "learn" tasks to study yet.', candidates: [], diagnosis: [] };
  if (!proof.some((task) => task.split === 'check') || !proof.some((task) => task.split === 'guard')) {
    return { summary: 'A change can only be proven with at least one "check" task and one "guard" task. Add them first.', candidates: [], diagnosis: [] };
  }
  const policy = store.active();

  onPhase?.('Measuring the instructions in use', 0, tasks.length * repeats);
  const { results } = await baseline({
    store, policy, tasks, model, repeats, run, judge, budget, signal,
    onProgress: (done, total) => onPhase?.('Measuring the instructions in use', done, total),
  });
  const byId = new Map(results.map((result) => [result.taskId, result]));
  const failures = learn
    .map((task) => ({ task, result: byId.get(task.id) }))
    .filter((item) => item.result && !isSolid(item.result))
    .sort((a, b) => a.result.passes - b.result.passes)
    .slice(0, 12)
    .map((item) => ({ ...item, sample: item.result.sample }));
  if (failures.length === 0) {
    return { summary: 'Every "learn" task passes reliably, so there is nothing for the reviewer to work on. Add harder tasks to go further.', candidates: [], diagnosis: [] };
  }

  onPhase?.('Asking the reviewer');
  budget.check();
  const packet = buildPacket({
    policy,
    failures,
    passing: learn.filter((task) => byId.get(task.id) && isSolid(byId.get(task.id))).map((task) => task.id),
    history: store.history(),
    maxEdits,
  });
  const answer = await review(packet, signal);
  budget.add(answer.tokens ?? 0);
  const parsed = parseReview(answer.text, maxEdits);
  if (parsed.error) return { summary: parsed.error, candidates: [], diagnosis: parsed.diagnosis };

  const before = proof.map((task) => byId.get(task.id)).filter(Boolean);
  const candidates = [];
  let version = store.versions().at(-1) ?? policy.version;
  for (const [index, raw] of parsed.edits.entries()) {
    signal?.throwIfAborted();
    const checked = validateEdit(raw, policy);
    const id = `c${Date.now().toString(36)}${index}`;
    if (checked.error) {
      const note = checked.error;
      candidates.push({ id, at: new Date().toISOString(), parent: policy.version, description: String(raw.text ?? raw.op).slice(0, 300), rationale: '', outcome: 'rejected', note, gates: [] });
      store.addHistory({ description: String(raw.text ?? raw.op).slice(0, 200), outcome: 'refused', note });
      continue;
    }
    const edit = checked.edit;
    const description = describeEdit(edit, policy);
    const leak = leakOf(edit, tasks);
    let after = [];
    if (!leak) {
      version = nextVersion(version);
      const trial = applyEdit(policy, edit, version);
      onPhase?.(`Testing change ${index + 1} of ${parsed.edits.length}`, 0, proof.length * repeats);
      after = await measure({
        tasks: proof, policy: trial, repeats, run, judge, budget, signal,
        onProgress: (done, total) => onPhase?.(`Testing change ${index + 1} of ${parsed.edits.length}`, done, total),
      });
    }
    const judged = judgeCandidate({ before, after, leak, thresholds });
    const note = judged.gates.find((gate) => !gate.pass)?.note ?? '';
    candidates.push({
      id,
      at: new Date().toISOString(),
      parent: policy.version,
      edit,
      description,
      rationale: edit.rationale,
      outcome: judged.outcome,
      note,
      gates: judged.gates,
      before: summarize(before),
      after: summarize(after),
    });
    if (judged.outcome === 'rejected') store.addHistory({ description, outcome: 'rejected by the gates', note });
  }
  store.saveCandidates([...candidates, ...store.candidates()]);
  const waiting = candidates.filter((candidate) => candidate.outcome === 'awaitingApproval').length;
  return {
    summary:
      waiting > 0
        ? `${waiting} change${waiting === 1 ? '' : 's'} cleared every gate and wait${waiting === 1 ? 's' : ''} for your approval.`
        : `The reviewer proposed ${candidates.length} change${candidates.length === 1 ? '' : 's'}; none cleared the gates, so nothing changed.`,
    candidates,
    diagnosis: parsed.diagnosis,
  };
}

/**
 * Put an approved change into use as a new version.
 * @param {object} store - the data store.
 * @param {string} candidateId - the candidate to approve.
 * @returns {{version?: string, error?: string}} the new version, or why it could not be done.
 */
export function approve(store, candidateId) {
  const list = store.candidates();
  const candidate = list.find((item) => item.id === candidateId);
  if (!candidate || candidate.outcome !== 'awaitingApproval' || !candidate.edit) return { error: 'That change is not waiting for approval.' };
  const policy = store.active();
  if (candidate.parent !== policy.version) {
    candidate.outcome = 'outdated';
    candidate.note = 'The instructions changed after this was tested. Run a new cycle.';
    store.saveCandidates(list);
    return { error: candidate.note };
  }
  const checked = validateEdit(candidate.edit, policy);
  if (checked.error) return { error: checked.error };
  const version = nextVersion(store.versions().at(-1) ?? policy.version);
  store.savePolicy(applyEdit(policy, checked.edit, version));
  store.activate(version);
  candidate.outcome = 'approved';
  candidate.version = version;
  // The other proposals were tested against the old version.
  for (const other of list) {
    if (other !== candidate && other.outcome === 'awaitingApproval') {
      other.outcome = 'outdated';
      other.note = 'Another change was approved first. Run a new cycle to test this one again.';
    }
  }
  store.saveCandidates(list);
  store.addHistory({ description: candidate.description, outcome: 'approved', note: `Became ${version}.` });
  return { version };
}

/**
 * Turn down a change that was waiting for approval.
 * @param {object} store - the data store.
 * @param {string} candidateId - the candidate.
 * @returns {boolean} true when it was turned down.
 */
export function decline(store, candidateId) {
  const list = store.candidates();
  const candidate = list.find((item) => item.id === candidateId);
  if (!candidate || candidate.outcome !== 'awaitingApproval') return false;
  candidate.outcome = 'declined';
  store.saveCandidates(list);
  store.addHistory({ description: candidate.description, outcome: 'declined by you', note: '' });
  return true;
}
