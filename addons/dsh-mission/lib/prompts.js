/**
 * What the planner, the workers and the reviewer are told, and how their answers are read.
 * Each prompt starts with a one-word label line; it tells a reader of the logs which role it is.
 */

const clip = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}\n… (cut)` : text;
};

/**
 * The first JSON object in a model's answer, whatever is written around it.
 * @param {unknown} text - the answer.
 * @returns {object | undefined} the object; undefined when there is none.
 */
export function jsonOf(text) {
  const source = String(text ?? '');
  for (let start = source.indexOf('{'); start >= 0; start = source.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (inString) {
        if (char === '\\') index += 1;
        else if (char === '"') inString = false;
      } else if (char === '"') inString = true;
      else if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          try {
            const value = JSON.parse(source.slice(start, index + 1));
            if (value && typeof value === 'object' && !Array.isArray(value)) return value;
          } catch {
            /* not this one */
          }
          break;
        }
      }
    }
  }
  return undefined;
}

const COMMON = [
  'You are one of several models working on this goal in turn. You work alone on your part: there is nobody to ask, so do not ask questions and do not wait for an answer.',
  'Stay inside the working folder. The permission rules you were given apply to you.',
];

/**
 * @param {object} input - the goal and what the folder holds.
 * @returns {string} the planner's task.
 */
export function planPrompt({ goal, root, files, maxItems }) {
  return [
    'MISSION_PLAN',
    'You are the planner. Turn the goal into a short checklist that other models will work through one item at a time. Change nothing: only read.',
    ...COMMON,
    '',
    `Goal: ${clip(goal, 4000)}`,
    `Working folder: ${root}`,
    files ? `Files in it (a sample):\n${clip(files, 6000)}` : 'The folder is empty or could not be listed.',
    '',
    'First look around: read the files that matter (README, package or build files, the tests, the code the goal touches) and find out how this project is tested and built.',
    `Then answer with one JSON object and nothing else:`,
    '{"summary": "the approach in two or three sentences",',
    ' "items": [{"title": "short name", "detail": "what to do, with file names", "done_when": "what must be true when it is done", "check": "one shell command that exits 0 only when it is done, or empty"}],',
    ' "checks": ["commands that must pass at the very end, such as the test suite and the build"]}',
    '',
    'Rules for the checklist:',
    `- At most ${maxItems} items, in the order they should be done. Each one small enough for one model in one sitting.`,
    '- A check is a real command, run in the working folder, that proves the item: a test file, a script, a grep for what must exist. Leave it empty rather than invent a command that proves nothing.',
    '- Use commands this project already has. Do not name a tool that is not installed.',
    '- If the goal needs tests that do not exist, make writing them an item of its own, before the code they test.',
  ].join('\n');
}

/**
 * @param {object} input - the item and what happened before.
 * @returns {string} the worker's task.
 */
export function workPrompt({ goal, summary, item, others, senior }) {
  return [
    'MISSION_WORK',
    senior
      ? 'You are the senior worker. Two attempts at this item did not get it done. Read what went wrong below, find the real cause, and finish it.'
      : 'You are a worker. Do this one item and nothing else.',
    ...COMMON,
    '',
    `The overall goal: ${clip(goal, 2000)}`,
    summary ? `The plan: ${clip(summary, 800)}` : '',
    others ? `The other items, for context only (do not do them):\n${clip(others, 1500)}` : '',
    '',
    `ITEM ${item.id}: ${item.title}`,
    item.detail ? `What to do: ${item.detail}` : '',
    item.doneWhen ? `Done when: ${item.doneWhen}` : '',
    item.check ? `It will be proved by running: ${item.check}\nRun that command yourself before you finish, and keep working until it passes.` : 'No command proves this item, so a reviewer will read your changes. Leave them easy to check.',
    item.tries > 0 ? `\nEarlier attempt${item.tries === 1 ? '' : 's'}: ${item.tries}. ${item.note}` : '',
    item.tries > 0 && item.evidence ? `What the command said last time:\n${clip(item.evidence, 2500)}` : '',
    item.tries > 0 && item.report ? `What the last worker reported:\n${clip(item.report, 800)}` : '',
    '',
    'Read before you change. Make the smallest change that does it. Never weaken or delete a test to make it pass.',
    'If a file change is refused because the user has to approve it and they do not answer, do not look for a way round it: finish what you can and say so.',
    'End with a short report: what you changed (files), what you ran and what it said, and anything left undone. If you could not do it, start the report with BLOCKED: and the reason.',
  ].filter((part) => part !== '').join('\n');
}

/**
 * @param {object} input - the goal, the checklist and the changes.
 * @returns {string} the reviewer's task.
 */
export function reviewPrompt({ goal, list, checks, changes, last }) {
  return [
    'MISSION_REVIEW',
    'You are the reviewer. Other models worked through the checklist below. Judge the result against the goal. Change nothing: only read and run read-only commands.',
    ...COMMON,
    '',
    `Goal: ${clip(goal, 4000)}`,
    '',
    `Checklist as it stands:\n${clip(list, 5000)}`,
    checks ? `\nOverall commands, run just now:\n${clip(checks, 3000)}` : '',
    `\nWhat changed in the folder since the start:\n${changes ? clip(changes, 40000) : '(nothing changed)'}`,
    '',
    'Look at the real files, not only at this summary. For each item marked NOT VERIFIED decide whether it is truly done. For items marked PASSED, object only if the change is wrong in a way its command does not catch, or a test was weakened to pass.',
    last ? 'This is the last review: no further work will follow it, so do not ask for new items.' : 'If the goal is not met although every item is done, add the missing work as new items (at most four).',
    'Answer with one JSON object and nothing else:',
    '{"verdict": "approve" or "changes", "note": "two or three sentences for the user",',
    ' "items": [{"id": "the item number", "ok": true or false, "note": "why, with file names"}],',
    ' "new_items": [{"title": "...", "detail": "...", "done_when": "...", "check": "a command or empty"}]}',
  ].filter((part) => part !== '').join('\n');
}

/**
 * What the conversation's own model is told while a run is on. Its only job is to keep the run
 * moving and to tell the user what each step did.
 * @param {object} run - the run.
 * @param {boolean} [viaProgram] - whether this conversation reaches its tools only from inside a `run_code` program (the app's PTC preset).
 * @returns {string} the note.
 */
export function conductorNote(run, viaProgram = false) {
  return [
    `A mission run is on in this conversation (goal: ${clip(run.goal, 300)}).`,
    'The run is driven by the mission_step tool: it plans, hands each checklist item to a worker model, runs the commands that prove the work, and has a reviewer model check the result. You are the conductor, not a worker.',
    viaProgram
      ? 'In every round do exactly this: run one program whose whole code is  return await tools.mission_step({})  and nothing else in it (a direct call to mission_step fails here; it is reached only from inside run_code). Then tell the user in one or two plain sentences what that step did, using what it returned. Do not read, write or run anything else yourself, and do not call goal tools: the run looks after the goal.'
      : 'In every round do exactly this: call mission_step once, with no other tool before or after it; then tell the user in one or two plain sentences what that step did, using what the tool returned. Do not read, write or run anything yourself, and do not call goal tools: the run looks after the goal.',
    'A step can take many minutes. When mission_step answers that it is still working, that is not an error: say so in a few words and call it again in the next round.',
    'When mission_step returns the final report, give the user that report in full, as it is. Do not add claims that are not in it.',
    'If the user writes to you during the run, answer them briefly. To stop the run they type /mission stop.',
  ].join('\n');
}
