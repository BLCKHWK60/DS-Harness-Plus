/**
 * The gates a change must clear before it may be offered for approval.
 *
 * Results are compared task by task: the same task, run the same number of
 * times, before and after the change. A change is only good when it helps what
 * it was aimed at (the "check" tasks) and breaks nothing it was not shown (the
 * "guard" tasks). This code and its thresholds are outside what the loop can edit.
 */

/**
 * @typedef {{taskId: string, split: string, family: string, passes: number, runs: number, outTokens: number, details: string[]}} TaskResult
 */

/**
 * Summarize a set of task results.
 * @param {TaskResult[]} results - results of one policy.
 * @returns {{tasks: number, runs: number, passes: number, rate: number, solid: number, medianOutTokens: number}} summary;
 *   `solid` counts tasks that passed in most of their runs.
 */
export function summarize(results) {
  const runs = results.reduce((sum, result) => sum + result.runs, 0);
  const passes = results.reduce((sum, result) => sum + result.passes, 0);
  return {
    tasks: results.length,
    runs,
    passes,
    rate: runs > 0 ? passes / runs : 0,
    solid: results.filter((result) => isSolid(result)).length,
    medianOutTokens: median(results.map((result) => (result.runs > 0 ? result.outTokens / result.runs : 0))),
  };
}

/** @param {TaskResult} result - one task. @returns {boolean} true when it passed in at least two thirds of its runs. */
export function isSolid(result) {
  return result.runs > 0 && result.passes >= Math.ceil((2 * result.runs) / 3);
}

/** @param {TaskResult} result - one task. @returns {boolean} true when it passed in at most one third of its runs. */
export function isBroken(result) {
  return result.runs > 0 && result.passes <= Math.floor(result.runs / 3);
}

/**
 * Judge one candidate change against the version it would replace.
 * @param {object} input - what to compare.
 * @param {TaskResult[]} input.before - results of the current version on the check and guard tasks.
 * @param {TaskResult[]} input.after - results of the candidate on the same tasks.
 * @param {string | undefined} input.leak - why the edit leaks a test answer, if it does.
 * @param {{costCeiling?: number}} [input.thresholds] - `costCeiling`: how much longer answers may get (1.5 = 50% more tokens).
 * @returns {{gates: Array<{id: string, name: string, pass: boolean, note: string}>, outcome: 'awaitingApproval' | 'rejected'}}
 *   every gate with its result, and whether the change may be offered to the owner.
 */
export function judgeCandidate({ before, after, leak, thresholds = {} }) {
  const ceiling = Number.isFinite(thresholds.costCeiling) ? Math.max(1, thresholds.costCeiling) : 1.5;
  const byId = new Map(before.map((result) => [result.taskId, result]));
  const paired = after.filter((result) => byId.has(result.taskId));
  const check = paired.filter((result) => result.split === 'check');
  const guard = paired.filter((result) => result.split === 'guard');
  const gates = [];

  gates.push({
    id: 'clean',
    name: 'Does not carry a test answer',
    pass: !leak,
    note: leak ?? 'The change names no test task and none of the expected answers.',
  });

  const checkBefore = sum(check.map((result) => byId.get(result.taskId).passes));
  const checkAfter = sum(check.map((result) => result.passes));
  gates.push({
    id: 'helps',
    name: 'Helps on the check tasks',
    pass: check.length > 0 && checkAfter > checkBefore,
    note:
      check.length === 0
        ? 'There are no check tasks, so an improvement cannot be shown. Mark some tasks as "check".'
        : `Passed runs went from ${checkBefore} to ${checkAfter} of ${sum(check.map((result) => result.runs))}.`,
  });

  const broken = guard.filter((result) => isSolid(byId.get(result.taskId)) && isBroken(result));
  gates.push({
    id: 'harmless',
    name: 'Breaks nothing on the guard tasks',
    pass: guard.length > 0 && broken.length === 0,
    note:
      guard.length === 0
        ? 'There are no guard tasks, so harm cannot be ruled out. Mark some tasks as "guard".'
        : broken.length === 0
          ? `None of the ${guard.length} guard tasks that used to pass now fails.`
          : `${broken.length} guard task${broken.length === 1 ? '' : 's'} that used to pass now fail${broken.length === 1 ? 's' : ''}: ${broken.map((result) => result.taskId).join(', ')}.`,
  });

  const costBefore = summarize(paired.map((result) => byId.get(result.taskId))).medianOutTokens;
  const costAfter = summarize(paired).medianOutTokens;
  const costOk = costBefore === 0 || costAfter <= costBefore * ceiling;
  gates.push({
    id: 'cost',
    name: 'Does not make answers much longer',
    pass: costOk,
    note:
      costBefore === 0
        ? 'No token counts were reported, so this was not measured.'
        : `Typical answer length went from ${Math.round(costBefore)} to ${Math.round(costAfter)} tokens (limit: ${Math.round(ceiling * 100)}% of before).`,
  });

  return { gates, outcome: gates.every((gate) => gate.pass) ? 'awaitingApproval' : 'rejected' };
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
