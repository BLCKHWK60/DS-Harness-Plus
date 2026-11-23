/**
 * What the planner, the workers and the reviewer are told, and how their answers are read.
 * Each prompt starts with a one-word label line; it tells a reader of the logs which role it is.
 */

const clip = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `${text.slice(0, max)}\n… (cut)` : text;
};
/** The newest part of a text (the end of a conversation), at most `max` characters. */
const newest = (value, max) => {
  const text = String(value ?? '').trim();
  return text.length > max ? `(earlier part left out) …${text.slice(-max)}` : text;
};

/** The planner gets the whole brief (lib/run.js keeps at most CONTEXT_MAX of it), the reviewer its last REVIEW_CONTEXT_MAX. */
export const PLAN_CONTEXT_MAX = 16000;
export const REVIEW_CONTEXT_MAX = 4000;
/** The heading of the user's notes and answers in every helper's task (lib/run.js userNotes). */
export const USER_NOTES_HEADING = 'The user wrote to the Mission while it worked (follow it where it changes the work):';
const userBlock = (userNotes) => (userNotes ? [`${USER_NOTES_HEADING}\n${clip(userNotes, 3000)}`] : []);

/**
 * The first JSON object in a model's answer, whatever is written around it.
 * @param {unknown} text - the answer.
 * @param {(value: object) => boolean} [accept] - when given, the first object it accepts (a quoted snippet before the real answer is skipped).
 * @returns {object | undefined} the object; undefined when there is none.
 */
export function jsonOf(text, accept) {
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
            if (value && typeof value === 'object' && !Array.isArray(value) && (!accept || accept(value))) return value;
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

/**
 * A BLOCKED status that says there is nothing in the way: not a failure. Only the word on its own ("BLOCKED: none",
 * "BLOCKED: n/a.") or followed by a clause that says the work is done ("BLOCKED: none, item 3 is done"). A reason that
 * merely starts with such a word ("BLOCKED: no write permission", "BLOCKED: None of the tests can run") is a block,
 * and so is one whose clause after it says something is wrong ("BLOCKED: no, but the build fails").
 */
const NOT_BLOCKED = /^(?:no|none|nothing|n\/?a|not needed|not blocked|no blockers?|-)\s*[.!)]*\s*(?:$|[,;:.!\-–]\s*(?!.*\b(?:but|not|cannot|can't|fails?|failed|missing|denied|without)\b).*\b(?:done|finished|complete|completed|works|passes|passed|fine|ok|okay)\b.*$)/i;

/**
 * The status a worker's report starts with: `DONE:`, `PARTLY:`, `BLOCKED:` or `QUESTION:` on its first line.
 * `BLOCKED: none` (and no, n/a, not needed) counts as done. A QUESTION may carry `| ASSUMING: …` (or an
 * ASSUMING: line), the default the worker finished the item on. A report without a status is read the old
 * way: blocked only when it starts with the word BLOCKED and something is really in the way.
 * @param {unknown} text - the worker's report.
 * @returns {{kind: 'done' | 'partly' | 'blocked' | 'question' | 'none', text: string, question?: string, assume?: string}} what it says.
 */
export function statusOf(text) {
  const all = String(text ?? '');
  const first = all.split('\n').map((row) => row.trim()).find((row) => row !== '') ?? '';
  const plain = first.replace(/^[#>*_`\s-]+/, '').replace(/[*_`]+/g, '');
  // Stage D: a Mission's worker that stops to wait (NEEDS ANSWER, NEEDS YES) or for a file another helper holds.
  const waits = /^(NEEDS\s+ANSWER|NEEDS\s+YES|WAITING\s+FOR\s+FILE)\s*[:\-–]\s*(.*)$/i.exec(plain);
  if (waits) {
    const word = waits[1].toUpperCase().replace(/\s+/g, ' ');
    const rest = String(waits[2] ?? '').trim();
    if (word === 'NEEDS YES') return { kind: 'needs-yes', text: rest.slice(0, 600) };
    if (word === 'WAITING FOR FILE') return { kind: 'waiting-file', text: rest.slice(0, 600), file: rest.replace(/^[`'"]+|[`'".]+$/g, '').split(/\s+/)[0]?.slice(0, 400) ?? '' };
    const inline = /^(.*?)\s*\|\s*IF\s+NO\s+ANSWER\s*:\s*(.*)$/i.exec(rest);
    const below = /^\s*\**IF\s+NO\s+ANSWER\**\s*:\s*(.+)$/im.exec(all.slice(all.indexOf(first) + first.length));
    return { kind: 'needs-answer', text: rest, question: (inline ? inline[1] : rest).trim().slice(0, 600), assume: (inline ? inline[2] : below ? below[1] : '').trim().slice(0, 400) };
  }
  const token = /^(DONE|PARTLY|PARTIAL|BLOCKED|QUESTION)\s*[:\-–]\s*(.*)$/i.exec(plain) ?? /^(DONE|PARTLY|PARTIAL|BLOCKED|QUESTION)\s*$/i.exec(plain);
  if (!token) {
    // No status: the old reading, without its false alarms.
    const old = /^\s*\**\s*BLOCKED\b\**\s*[:\-–]?\s*(.*)$/i.exec(all.trimStart());
    if (old && !NOT_BLOCKED.test(old[1].trim())) return { kind: 'blocked', text: all.replace(/\s+/g, ' ').trim().slice(0, 300) };
    return { kind: 'none', text: '' };
  }
  const word = token[1].toUpperCase();
  const rest = String(token[2] ?? '').trim();
  if (word === 'DONE') return { kind: 'done', text: rest };
  if (word === 'PARTLY' || word === 'PARTIAL') return { kind: 'partly', text: rest };
  if (word === 'BLOCKED') return NOT_BLOCKED.test(rest) ? { kind: 'done', text: rest } : { kind: 'blocked', text: `BLOCKED: ${rest}`.replace(/\s+/g, ' ').slice(0, 300) };
  // QUESTION: the question, then what the worker assumed instead.
  const inline = /^(.*?)\s*\|\s*ASSUM(?:ING|ED|E)\s*:\s*(.*)$/i.exec(rest);
  const below = /^\s*\**ASSUM(?:ING|ED|E)\**\s*:\s*(.+)$/im.exec(all.slice(all.indexOf(first) + first.length));
  const question = (inline ? inline[1] : rest).trim().slice(0, 600);
  const assume = (inline ? inline[2] : below ? below[1] : '').trim().slice(0, 400);
  return { kind: 'question', text: rest, question, assume };
}

/**
 * A worker's status read for its Mission's When it needs you (point 17):
 *   decide  NEEDS ANSWER counts as QUESTION (the item finishes on its IF NO ANSWER, noted as assumed); NEEDS YES as PARTLY
 *   wait    QUESTION counts as NEEDS ANSWER (its ASSUMING is only a suggestion: nothing is decided on a guess)
 *   ask     as said
 * @param {ReturnType<typeof statusOf>} said - statusOf's reading.
 * @param {string} [needs] - the run's When it needs you.
 * @returns {ReturnType<typeof statusOf>}
 */
export function statusFor(said, needs = 'ask') {
  if (!said || typeof said !== 'object') return said;
  if (needs === 'decide') {
    if (said.kind === 'needs-answer') return { ...said, kind: 'question' };
    if (said.kind === 'needs-yes') return { kind: 'partly', text: said.text };
  }
  if (needs === 'wait' && said.kind === 'question') return { ...said, kind: 'needs-answer' };
  return said;
}

/** The first line every worker's report starts with (read by statusOf). */
export const STATUS_RULE = [
  'Start your report with exactly one status on its first line:',
  '  DONE: <one sentence>  when the item is done;',
  '  PARTLY: <what is left>  when part of it is done;',
  '  BLOCKED: <the reason>  only when you could not do it at all;',
  '  QUESTION: <your question for the user> | ASSUMING: <the default you used>  when the item needs the user\'s answer: do not wait for one, choose a sensible default, finish the item on it, and say which default you chose.',
  'If the notes leave a question to your judgement and this item decides it, add a line: CHOSE <question id>: <what you chose>.',
  'Then: what you changed (files), what you ran and what it said, and anything left undone.',
].join('\n');

/**
 * The status rule for a Mission's workers (stage D, 20 November 2026): stage C's lines, the QUESTION line rewritten
 * (only when a default is safe), and three lines for stopping to wait. Kind 'mission' runs keep STATUS_RULE.
 */
export const STATUS_RULE_LONG = [
  'Start your report with exactly one status on its first line:',
  '  DONE: <one sentence>  when the item is done;',
  '  PARTLY: <what is left>  when part of it is done;',
  '  BLOCKED: <the reason>  only when you could not do it at all;',
  '  QUESTION: <your question for the user> | ASSUMING: <the default you used>  when the user\'s answer would help but a sensible default is safe (it can be changed later without loss): do not wait, finish the item on it, and say which default you chose;',
  '  NEEDS ANSWER: <your question for the user> | IF NO ANSWER: <what you would do>  only when the item cannot be done without the answer, or a guess would mean redoing or undoing real work: stop there; what you did so far is kept, and the item goes on when the user answers;',
  '  NEEDS YES: <what waits for the user\'s yes>  when a step of yours was put to the user and the item cannot be finished without it;',
  '  WAITING FOR FILE: <file>  when another helper is changing a file you need.',
  'If the notes leave a question to your judgement and this item decides it, add a line: CHOSE <question id>: <what you chose>.',
  'Then: what you changed (files), what you ran and what it said, and anything left undone.',
].join('\n');

/** What a Mission's worker is told about the others and about answers (stage D; planner and reviewer keep COMMON). */
export const COMMON_LONG = [
  'You are one of several models working on this goal, some of them at the same time. Nobody answers while you work: what only the user can tell, you either assume and say so, or, when a guess would waste the work, ask and stop, as the status rules below say.',
  'Stay inside the working folder. The permission rules you were given apply to you.',
];

/** A Mission's worker on a step that needs the user's yes (replaces the stage C line for Missions). */
export const APPROVAL_RULE = 'If a change needs the user\'s yes, it is put to them for you and your item waits for the answer. Never try another way to get the same result (another tool, a command, a copy of the file, another path). Finish the parts that do not need it, then start your report with NEEDS YES: and say what waits.';

// ---- Point 17 (20 November 2026): what the helpers are told for Full auto and for Ask and wait ------------------

/** Full auto: nobody answers, and nothing needing the user's yes is ever asked. */
export const COMMON_LONG_DECIDE = [
  'You are one of several models working on this goal, some of them at the same time. Nobody answers during this Mission (Full auto): what only the user could tell, you decide on your best judgement and say what you decided.',
  COMMON_LONG[1],
];
export const APPROVAL_RULE_DECIDE = 'This Mission never gets the user\'s yes during its work (Full auto): a step that needs it is refused at once. Never try another way to get the same result (another tool, a command, a copy of the file, another path). Finish what you can without it, then start your report with PARTLY: and say exactly what you would have done with the user\'s yes.';
export const STATUS_RULE_LONG_DECIDE = [
  'Start your report with exactly one status on its first line:',
  '  DONE: <one sentence>  when the item is done;',
  '  PARTLY: <what is left, and what you would have done with the user\'s yes>  when part of it is done;',
  '  BLOCKED: <the reason>  only when you could not do it at all;',
  '  QUESTION: <what you would have asked the user> | ASSUMING: <what you decided>  whenever the user\'s answer would matter: nobody answers during this Mission (Full auto), so decide on your best judgement, finish the item on it, and say what you decided;',
  '  WAITING FOR FILE: <file>  when another helper is changing a file you need.',
  'This Mission never waits for the user: do not use NEEDS ANSWER or NEEDS YES.',
  'If the notes leave a question to your judgement and this item decides it, add a line: CHOSE <question id>: <what you chose>.',
  'Then: what you changed (files), what you ran and what it said, and anything left undone.',
].join('\n');
/** The planner and the reviewer of a Full auto Mission. */
export const DECIDE_RULE = 'Nobody answers during this Mission (Full auto). Decide what only the user could tell on your best judgement, and still list each such point in "questions", with what you decided as its "default": the report shows them, and the user can change them later.';
/** The heading of Full auto's own decisions in every helper's notes (lib/run.js userNotes). */
export const DECIDED_FOR_AUTO = 'Decided for the user, because nobody answers during this Mission (keep to these, so the items agree):';

/** Ask and wait: every question waits for the user; nothing is decided on a guess. */
export const COMMON_LONG_WAIT = [
  'You are one of several models working on this goal, some of them at the same time. Nobody answers while you work, but the user answers later, and nothing is to be decided on a guess: whenever their answer would matter, ask and stop, as the status rules below say.',
  COMMON_LONG[1],
];
export const STATUS_RULE_LONG_WAIT = [
  'Start your report with exactly one status on its first line:',
  '  DONE: <one sentence>  when the item is done;',
  '  PARTLY: <what is left>  when part of it is done;',
  '  BLOCKED: <the reason>  only when you could not do it at all;',
  '  NEEDS ANSWER: <your question for the user> | IF NO ANSWER: <what you would suggest>  whenever the user\'s answer would matter: do not decide it on a guess; stop there. What you did so far is kept, and the item goes on when the user answers. If your item depends on one of the open questions listed above, write its id instead (NEEDS ANSWER: q3);',
  '  NEEDS YES: <what waits for the user\'s yes>  when a step of yours was put to the user and the item cannot be finished without it;',
  '  WAITING FOR FILE: <file>  when another helper is changing a file you need.',
  'If the notes leave a question to your judgement and this item decides it, add a line: CHOSE <question id>: <what you chose>.',
  'Then: what you changed (files), what you ran and what it said, and anything left undone.',
].join('\n');
/** The heading of Ask and wait's open questions in every helper's notes (lib/run.js userNotes). */
export const OPEN_FOR_WAIT = 'Questions the user has not answered yet (if your item depends on one, stop with NEEDS ANSWER: and its id):';
export const WAIT_PLAN_RULE = 'Ask now, in "questions", everything you need from the user that the work depends on, each with what you would suggest without an answer and, in "items", the numbers of the checklist items that depend on it. Those items wait for the answer; the others go on. Nothing is decided on a guess.';
export const WAIT_REVIEW_RULE = 'A question you ask here keeps the Mission from ending until the user answers it: ask only what really matters.';

/** The lines a Mission's worker gets for its When it needs you. */
const workerRules = (needs) => (needs === 'decide'
  ? { common: COMMON_LONG_DECIDE, approval: APPROVAL_RULE_DECIDE, status: STATUS_RULE_LONG_DECIDE }
  : needs === 'wait' ? { common: COMMON_LONG_WAIT, approval: APPROVAL_RULE, status: STATUS_RULE_LONG_WAIT } : { common: COMMON_LONG, approval: APPROVAL_RULE, status: STATUS_RULE_LONG });

/** The other helpers at work, for a worker of a Mission with more than one helper. */
export const OTHERS_WORKING = (items, files) => `Other helpers work at the same time on: ${items}. Files they are changing now: ${files || 'none yet'}. Leave those files alone: a change to one of them is refused.`;

/** What a helper that takes up an item again is told (stage D). */
export const RESUME_TEXTS = Object.freeze({
  head: (report, files) => `A helper started this item and stopped to wait for the user. It reported: ${report ? (/[.!?:]$/.test(String(report).trim()) ? String(report).trim() : `${String(report).trim()}.`) : '(no report).'} ${files ? `Files it changed: ${files}.` : 'Look at the folder for what it changed.'}`,
  answer: (question, answer) => `The user's answer to "${question}": ${String(answer).trim().replace(/[.!?]$/, '')}. Carry on from where it stopped: read what it changed first; do not start over.`,
  skip: (question, id) => `The user left "${question}" to your judgement: decide it yourself, carry on from where it stopped, and add a line CHOSE ${id}: <what you chose>.`,
  allowed: (what) => `The user allowed: ${what}. Do it now and finish the item.`,
  allowedTool: (tool) => `The user allowed ${tool} for this item. Use it now and finish the item.`,
  redo: (what) => `The item was done, except one step that waited for the user's yes. The user allowed: ${what}. Do only that step now.`,
  denied: (what) => `The user said no to: ${what}. Finish the item without it. Do not do it another way.`,
  file: (file) => `It waited for ${file}, which another item was changing; that file is free now. Read it again before you change it.`,
  undone: () => 'The folder was put back to an earlier checkpoint since then, so the work it reported may be gone: check the files first.',
  interrupted: () => 'A helper worked on this item before and was stopped part way (a pause, End, the time or an app restart). The folder may hold its unfinished changes: look at the files first, then finish or correct them. Do not start over blindly.',
  command: (command) => `The command the user allowed, exactly (run it as written, unchanged): ${command}`,
  toolGone: (tool) => `${tool} could not be allowed any more, so carry on without it and say what you could not do.`,
  // Point 17: an item that waited for the user before it was started (Ask and wait).
  before: 'This item waited for the user before it was started. Their answers:',
  beforeAnswer: (question, answer) => `"${question}": ${String(answer).trim().replace(/[.!?]$/, '')}. Do the item with it.`,
  beforeSkip: (question, id) => `The user left "${question}" to your judgement: decide it yourself and add a line CHOSE ${id}: <what you chose>.`,
});

/** The question pass of a Mission with several helpers (stage D): everything foreseeable, asked in the first minute. */
export function questionsPassPrompt({ goal, context = '', files = '', needs = 'ask' }) {
  return [
    'MISSION_ASK',
    `You ask the user, before the work starts, only what the Mission cannot decide without them. Change nothing and do not explore: the goal, the brief and the list of files below are enough. At most 6 questions, ${needs === 'wait' ? 'each with what the Mission would suggest without an answer' : 'each with the default the Mission uses if they do not answer'}. Answer with one JSON object and nothing else: {"questions": [{"question": "…", "default": "…"}]}. No questions: {"questions": []}.`,
    '',
    `Goal: ${clip(goal, 4000)}`,
    ...(context ? [`What was said in the thread before the Mission (its brief):\n${newest(context, 6000)}`] : []),
    files ? `Files in the folder (a sample):\n${clip(files, 3000)}` : 'The folder is empty or could not be listed.',
  ].join('\n');
}

/** The tool guard's words to a Mission's helper (stage D). */
export const GUARD_TEXTS = Object.freeze({
  parked: 'This needs the user\'s yes, so it waits in the Mission\'s card; the other helpers carry on. Do not do the same thing another way (another tool, a command, a copy or another path): that is not allowed. Finish what you can without it, then start your report with NEEDS YES: and say what waits.',
  saidNo: 'The user said no to this earlier in this Mission. Do not do it another way. Carry on without it, and say in your report what you could not do.',
  fileHeld: (file, n) => `${file} is being changed by another helper (item ${n}) right now. Do not change it another way. Finish what you can without it, then start your report with WAITING FOR FILE: ${file}. Your item goes on when that file is free.`,
  folderBusy: 'Another helper\'s command was changing files for more than 10 minutes, so this change was not made. Nothing is lost: try it again in a moment.',
  putBack: (files, file) => `This command changed files another helper's item is working on: ${files}. They were put back. Do not change them another way; finish without them, then start your report with WAITING FOR FILE: ${file}.`,
  namedFileWaits: (file) => `This command would change ${file}, which waits for the user's yes (or they said no). Do not change it another way; carry on without it.`,
  outsideChange: 'A Mission\'s helpers cannot change anything outside the thread\'s folder: the app does not let a helper ask for that. Do not try another way. Finish without it, and say in your report what should be changed there.',
  itemTool: (tool, n) => { const list = (Array.isArray(n) ? n : [n]).map(String); return `${tool} was allowed for ${list.length === 1 ? `item ${list[0]}` : `items ${list.join(', ')}`} only. Carry on without it.`; },
  tooMany: 'Too many things wait for the user\'s yes already. Carry on without this, and say in your report what waits.',
  background: 'Several helpers work at once, so a command that may change files must run in the foreground (without run_in_background): its changes are checked when it ends. Run it again in the foreground.',
  stillRunning: 'Mission: this command still runs in the background. No other helper changes files until it ends, and what it changes is checked then (changes to another item\'s files are put back).',
  ended: 'The Mission has ended; nothing is asked any more. Stop here.',
  notAsked: 'This needs the user\'s yes, and this Mission runs on Full auto: it never asks and never gives itself permission, so this step was not taken. Do not try another way to get the same result (another tool, a command, a copy or another path). Finish what you can without it, and say in your report exactly what you would have done with the user\'s yes.',
});

/** Stage C: the planner asks everything it can foresee at once, while the user is still at the screen. */
export const ASK_NOW_RULE = 'Ask now, in "questions", everything you can foresee needing from the user, each with its default: they read them in the first minute while still at the screen. Questions found later are only answered at the end.';
/** Stage C: the time default ("the most important items first") holds only when the plan is in that order. */
export const IMPORTANT_FIRST_RULE = 'List the items most important first: if time runs short, the last ones are left and listed in the report.';
/** Stage C: the planner is told the lap and step limits too. */
export const LAPS_RULE = (laps) => `It works in laps (the items, then the overall commands, then a review) and has at most ${laps} lap${laps === 1 ? '' : 's'}.`;
export const STEPS_RULE = (steps) => `It may take at most ${steps} steps in all (the plan, each try of an item, each run of the overall commands, each review): keep the list well under that.`;

/**
 * What a helper decided for questions the user left to its judgement: `CHOSE <id>: <what>` lines (stage C).
 * @param {unknown} text - the helper's answer.
 * @returns {{id: string, text: string}[]} each choice, first one per question.
 */
export function choicesOf(text) {
  const out = [];
  for (const found of String(text ?? '').matchAll(/^\s*[*_`]*CHOSE\s+(q\d+)\s*[*_`]*\s*:\s*(.+)$/gim)) {
    const id = found[1].toLowerCase();
    const chosen = found[2].trim().slice(0, 400);
    if (chosen && !out.some((entry) => entry.id === id)) out.push({ id, text: chosen });
  }
  return out;
}

/** What the planner and the reviewer are told about work only the user can do. */
export const OWNER_ONLY_RULE = 'Never make an item, or an overall check, that only the user can do or prove (their answers, their approval, their accounts, a decision of theirs): no helper can finish it. Put each such need in "questions" instead, with the default the run goes on with.';

const COMMON = [
  'You are one of several models working on this goal in turn. You work alone on your part: nobody answers during the run, so never wait for an answer. What only the user can tell goes down as a question with the default you use, and the work goes on.',
  'Stay inside the working folder. The permission rules you were given apply to you.',
];

/**
 * @param {object} input - the goal and what the folder holds.
 * @returns {string} the planner's task.
 */
export function planPrompt({ goal, root, files, maxItems, notes = '', context = '', noCommands = false, offline = false, minutes = 0, laps = 0, steps = 0, userNotes = '', helpers = 1, needs = 'ask' }) {
  return [
    'MISSION_PLAN',
    `You are the planner. Turn the goal into a short checklist that other models will work through ${helpers > 1 ? 'item by item, several items at the same time' : 'one item at a time'}. Change nothing: only read.`,
    ...COMMON,
    '',
    `Goal: ${clip(goal, 4000)}`,
    ...(context ? [`What was said in the thread before the Mission (its brief: the goal and this together say what to do):\n${newest(context, PLAN_CONTEXT_MAX)}`] : []),
    `Working folder: ${root}`,
    files ? `Files in it (a sample):\n${clip(files, 6000)}` : 'The folder is empty or could not be listed.',
    ...(notes ? [`Notes kept by the run so far:\n${clip(notes, 2000)}`] : []),
    ...userBlock(userNotes),
    '',
    'First look around: read the files that matter (README, package or build files, the tests, the code the goal touches) and find out how this project is tested and built.',
    `Then answer with one JSON object and nothing else:`,
    '{"summary": "the approach in two or three sentences",',
    helpers > 1
      ? ' "items": [{"title": "short name", "detail": "what to do, with file names", "done_when": "what must be true when it is done", "check": "one shell command that exits 0 only when it is done, or empty", "minutes": "about how many minutes a worker needs for it", "after": [numbers of items that must be done first, or empty]}],'
      : ' "items": [{"title": "short name", "detail": "what to do, with file names", "done_when": "what must be true when it is done", "check": "one shell command that exits 0 only when it is done, or empty", "minutes": "about how many minutes a worker needs for it"}],',
    ' "checks": ["commands that must pass at the very end, such as the test suite and the build"],',
    needs === 'wait'
      ? ' "questions": [{"question": "what only the user can answer", "default": "what you would suggest without an answer", "items": [numbers of the items that depend on it]}]}'
      : needs === 'decide'
        ? ' "questions": [{"question": "what only the user could answer", "default": "what you decided", "items": [numbers of the items that depend on it]}]}'
        : ' "questions": [{"question": "what only the user can answer", "default": "what the run assumes if they do not answer"}]}',
    '',
    'Rules for the checklist:',
    `- At most ${maxItems} items, in the order they should be done. Each one small enough for one model in one sitting.`,
    ...(minutes > 0 ? [`- This run has about ${minutes} minutes in all. Size the plan to fit that time: an item usually takes a worker about five minutes, plus its check and a review. Put the most important items first, and leave out what will not fit.`] : []),
    ...(laps > 0 ? [`- ${LAPS_RULE(laps)}`] : []),
    ...(steps > 0 ? [`- ${STEPS_RULE(steps)}`] : []),
    ...(helpers > 1 ? [`- Up to ${helpers} helpers work at once, each on its own item. Give each item, in "after", the numbers of the items it needs done first. Items that change the same files go one after the other.`] : []),
    `- ${IMPORTANT_FIRST_RULE}`,
    `- ${needs === 'decide' ? DECIDE_RULE : needs === 'wait' ? WAIT_PLAN_RULE : ASK_NOW_RULE}`,
    `- ${OWNER_ONLY_RULE}`,
    '- A check is a real command, run in the working folder, that proves the item: a test file, a script, a grep for what must exist. Leave it empty rather than invent a command that proves nothing.',
    `- ${CHECK_RULE}`,
    '- Use commands this project already has. Do not name a tool that is not installed.',
    '- If the goal needs tests that do not exist, make writing them an item of its own, before the code they test.',
    ...(noCommands ? [NO_COMMANDS_PLAN] : []),
    ...(offline ? [OFFLINE_CHECKS_PLAN] : []),
  ].join('\n');
}

/**
 * @param {object} input - the item and what happened before.
 * @returns {string} the worker's task.
 */
export function workPrompt({ goal, summary, item, others, senior, notes = '', root = '', noCommands = false, userNotes = '', brief = '', long = false, working = '', resume = '', needs = 'ask' }) {
  const rules = workerRules(needs);
  return [
    'MISSION_WORK',
    senior
      ? 'You are the senior worker. Two attempts at this item did not get it done. Read what went wrong below, find the real cause, and finish it.'
      : 'You are a worker. Do this one item and nothing else.',
    ...(long ? rules.common : COMMON),
    '',
    `The overall goal: ${clip(goal, 2000)}`,
    brief ? `The end of what was said in the thread before the Mission (its brief; the goal and this together say what to do):\n${newest(brief, 2000)}` : '',
    root ? `Working folder: ${root}. Keep every file you write inside it.` : '',
    noCommands ? NO_COMMANDS_WORK : '',
    summary ? `The plan: ${clip(summary, 800)}` : '',
    others ? `The other items, for context only (do not do them):\n${clip(others, 1500)}` : '',
    working ? clip(working, 1500) : '',
    notes ? `Notes the run keeps between laps (what passed, what failed, what to avoid):\n${clip(notes, 2000)}` : '',
    ...userBlock(userNotes),
    '',
    `ITEM ${item.id}: ${item.title}`,
    item.detail ? `What to do: ${item.detail}` : '',
    item.doneWhen ? `Done when: ${item.doneWhen}` : '',
    item.check ? `It will be proved by running: ${item.check}\nRun that command yourself before you finish, and keep working until it passes.` : 'No command proves this item, so a reviewer will read your changes. Leave them easy to check.',
    item.tries > 0 ? `\nEarlier attempt${item.tries === 1 ? '' : 's'}: ${item.tries}. ${item.note}` : '',
    item.tries > 0 && item.evidence ? `What the command said last time:\n${clip(item.evidence, 2500)}` : '',
    item.tries > 0 && item.report && !resume ? `What the last worker reported:\n${clip(item.report, 800)}` : '',
    resume ? `\nGOING ON FROM WHERE IT STOPPED:\n${clip(resume, 3000)}` : '',
    '',
    'Read before you change. Make the smallest change that does it. Never weaken or delete a test to make it pass.',
    long ? rules.approval : 'If a file change is refused because the user has to approve it and they do not answer, do not look for a way round it: finish what you can and say so.',
    long ? rules.status : STATUS_RULE,
  ].filter((part) => part !== '').join('\n');
}

/**
 * @param {object} input - the goal, the checklist and the changes.
 * @returns {string} the reviewer's task.
 */
export function reviewPrompt({ goal, list, checks, changes, last, notes = '', hunt = false, context = '', userNotes = '', parked = false, needs = 'ask' }) {
  return [
    'MISSION_REVIEW',
    'You are the reviewer. Other models worked through the checklist below. Judge the result against the goal. Change nothing: only read and run read-only commands.',
    ...COMMON,
    '',
    `Goal: ${clip(goal, 4000)}`,
    context ? `What was said before the Mission (its brief, with the goal):\n${newest(context, REVIEW_CONTEXT_MAX)}` : '',
    '',
    `Checklist as it stands:\n${clip(list, 5000)}`,
    checks ? `\nOverall commands, run just now:\n${clip(checks, 3000)}` : '',
    `\nWhat changed in the folder since the start:\n${changes ? clip(changes, 40000) : '(nothing changed)'}`,
    '',
    notes ? `\nNotes from the earlier laps of this Mission:\n${clip(notes, 2000)}` : '',
    ...userBlock(userNotes),
    'Look at the real files, not only at this summary. For each item marked NOT VERIFIED decide whether it is truly done. For items marked PASSED, object only if the change is wrong in a way its command does not catch, or a test was weakened to pass.',
    hunt
      ? 'Every item is done and the commands pass. This is an extra lap of a Mission: look for real weak spots against the goal (a missed case, an error not handled, a check that proves too little) and add them as new items (at most four), each with a command that proves it where possible. Add nothing for style or taste. If you find nothing worth doing, add no items.'
      : last ? 'This is the last review: no further work will follow it, so do not ask for new items.' : 'If the goal is not met although every item is done, add the missing work as new items (at most four).',
    OWNER_ONLY_RULE,
    needs === 'decide' ? DECIDE_RULE : needs === 'wait' ? WAIT_REVIEW_RULE : '',
    parked ? 'Items marked WAITS FOR YOU wait for the user\'s answer or yes: do not add items that do their work.' : '',
    'If an item\'s note says its check may be inverted, look at the check: when it proves the opposite of its done-when, give a corrected command as that item\'s "check".',
    'Answer with one JSON object and nothing else:',
    '{"verdict": "approve" or "changes", "note": "two or three sentences for the user",',
    ' "items": [{"id": "the item number", "ok": true or false, "note": "why, with file names", "check": "only for an inverted check: the corrected command"}],',
    ' "new_items": [{"title": "...", "detail": "...", "done_when": "...", "check": "a command or empty"}],',
    ' "questions": [{"question": "what only the user can answer", "default": "what the run assumes"}]}',
    `For a new item's check: ${CHECK_RULE}`,
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
    `A mission run is on in this thread (goal: ${clip(run.goal, 300)}).`,
    'The run is driven by the mission_step tool: it plans, hands each checklist item to a worker model, runs the commands that prove the work, and has a reviewer model check the result. You are the conductor, not a worker.',
    viaProgram
      ? 'In every round do exactly this: run one program whose whole code is  return await tools.mission_step({})  and nothing else in it (a direct call to mission_step fails here; it is reached only from inside run_code). Then tell the user in one or two plain sentences what that step did, using what it returned. Do not read, write or run anything else yourself, and do not call goal tools: the run looks after the goal.'
      : 'In every round do exactly this: call mission_step once, with no other tool before or after it; then tell the user in one or two plain sentences what that step did, using what the tool returned. Do not read, write or run anything yourself, and do not call goal tools: the run looks after the goal.',
    'A step can take many minutes. When mission_step answers that it is still working, that is not an error: say so in a few words and call it again in the next round.',
    'When mission_step returns the final report, give the user that report in full, as it is. Do not add claims that are not in it.',
    'If the user writes to you during the run, answer them briefly. To pause it they press Pause above the chat box or type /mission stop.',
    ...((Number(run?.long?.helpers) || 1) > 1 ? ['Several helpers may work at once, so one call may report more than one item.'] : []),
    // Point 17: for every Mission (a quiet wait asks for no more calls; stage D's wait asks for the next round's).
    ...(run?.kind === 'long' ? ['When mission_step says the Mission waits for the user, tell them in one line and do what it says about calling it again.'] : []),
  ].join('\n');
}

/**
 * How a check proves that something is gone: grep (also grep -c) succeeds when it finds the text, so a
 * check meant to prove "removed" passed while the text was there and failed once it was gone (owner's
 * run, 16 November 2026).
 */
export const CHECK_RULE = 'a check must exit 0 only when the item is done. grep and grep -c exit 0 when they FIND the text, so to prove that something was removed or no longer appears use `! grep -q \'text\' file` (and `! grep -qE \'pattern\' file` for a pattern). A pipeline exits as its last command does, so one that ends in wc, head, sort or echo always passes and proves nothing: end it in a test, such as `grep -q`, or `test $(… | wc -l) -ge 1`.';

/** The JSON the planner and the reviewer answer with, for a second ask when one answered in prose. */
export const SHAPES = Object.freeze({
  plan: '{"summary": "...", "items": [{"title": "...", "detail": "...", "done_when": "...", "check": "a command or empty", "minutes": 5}], "checks": ["..."], "questions": [{"question": "...", "default": "..."}]}',
  review: '{"verdict": "approve" or "changes", "note": "...", "items": [{"id": "the item number", "ok": true or false, "note": "..."}], "new_items": [{"title": "...", "detail": "...", "done_when": "...", "check": "a command or empty"}]}',
  // Stage E: the repair helper.
  repair: '{"cause": "what went wrong, in one plain sentence", "fixed": true or false, "own": [{"kind": "effort", "to": "off" or "on"} or {"kind": "split", "item": "3", "into": [{"title": "...", "done_when": "...", "check": "a command or empty"}]} or {"kind": "check", "item": "3" or "overall": "the old command", "check": "the new command, or empty"} or {"kind": "recipe", "to": "code"} or {"kind": "retry", "minutes": 5} or {"kind": "fewer", "helpers": 2} or {"kind": "note", "text": "..."}], "ask": [{"kind": "calls", "to": 1, "why": "..."} or {"kind": "model", "why": "..."} or {"kind": "setting", "field": "the id from the list", "to": "the new value", "why": "..."} or {"kind": "setting", "where": "Settings → ...", "change": "...", "why": "..."}]}',
});

/**
 * A second ask for a planner or reviewer that answered in prose (small local models often do, or write
 * the plan into a file instead): a model turns that answer into the JSON, with nothing added.
 * @param {'plan' | 'review'} kind - whose answer.
 * @param {string} text - the answer.
 * @returns {string} the instruction.
 */
export function formatPrompt(kind, text) {
  return [
    'MISSION_FORMAT',
    `Another model answered as the ${kind === 'plan' ? 'planner' : kind === 'repair' ? 'repair helper' : 'reviewer'} of a run, but in prose. Turn its answer into JSON and add nothing: use only what the text says. Do not read, change or run anything.`,
    kind === 'plan' ? `Where the text gives a check command for an item, keep it as it is. ${CHECK_RULE}` : kind === 'repair' ? 'Keep only the fixes and asks the text really names; with none, "own" and "ask" are empty lists.' : 'If the text approves the work and asks for nothing more, the verdict is "approve"; if it asks for more work, "changes".',
    `Answer with ONLY this JSON: ${SHAPES[kind]}`,
    '',
    'The answer:',
    clip(String(text ?? ''), 20000),
  ].join('\n');
}

/** A Recon conversation's run (no programs or commands there): what the planner is told. */
export const NO_COMMANDS_PLAN = 'This run can run no commands at all: leave every "check" empty and "checks" an empty list. The reviewer judges each item by reading the files. Plan research items: each one searches and reads with the tools the workers have, and writes what it found, with its sources, into a file in the working folder.';
/** What the planner of a Recon run with checks switched on is told. */
export const OFFLINE_CHECKS_PLAN = 'Checks here run with no internet, see only the working folder, and can start only the usual check programs (grep, wc, test, node, python3 and the like): give only checks on the files in it (test -f, grep -q, wc), or leave a check empty. Plan research items: each one searches and reads with the tools the workers have, and writes what it found, with its sources, into a file in the working folder.';
/** What a worker is told there. */
export const NO_COMMANDS_WORK = 'You have no programs or commands here: search and read with your tools, and write what you found, with its sources, into a file in the working folder.';

/** Stage E: what the repair helper may and may not do (its guard says the same when it tries). */
export const REPAIR_RULES = Object.freeze({
  guard: 'You are the Mission\'s repair helper. You may not ask for more tools or access, start helpers or run anything in the background. Change files only inside the folder; put anything else the user should allow in "ask" in your answer.',
  noPoint: 'This folder keeps no checkpoints, so the repair helper changes no files here. Put the fix in your answer instead.',
});
/** Stage E: the heading of the repair helper's note in every helper's prompt. */
export const REPAIR_NOTE_HEADING = 'From the Mission\'s repair helper:';

/**
 * The repair helper's prompt (stage E): the cause in plain words, the evidence, the Mission's own settings, and what it
 * may do itself, what it may only ask, and that it never gets more access.
 * @param {object} given - what it is told.
 * @returns {string}
 */
export function repairPrompt({ goal, cause, evidence = '', settings = '', point = true, noCommands = false, appSettings = '' }) {
  return [
    `You are the repair helper of a Mission (a long task other helper models work on). Goal of the Mission: ${clip(goal, 600)}`,
    `What went wrong: ${cause}. Find the cause, and fix what you may.`,
    '',
    'What you may do yourself:',
    point
      ? `- Fix things inside the Mission's folder (a save point was taken just before you started; the user can undo your changes with /mission back).${noCommands ? '' : ' Read files and run commands that look; change files only where that is the fix.'}`
      : `- ${REPAIR_RULES.noPoint}`,
    '- Change the Mission\'s own settings, by listing them in "own": its thinking level by role (effort), split an item that is too big (split), give an item or an overall check that runs, turn a backwards check the right way round, or leave it empty so the reviewer judges (check), the work loop\'s recipe (recipe), how long a failed item waits (retry, 1 to 30 minutes), fewer helpers at once (fewer), or a note every helper reads (note).',
    'What you may only ask the user for, in "ask": fewer requests at a time to the model server (calls), the next model in the tier\'s fallback list for this Mission\'s helpers (model), or a change to another setting of the app or its add-ons (setting). Never ask for more access, permissions, tools, keys or the internet: that is refused.',
    appSettings
      ? 'To ask for a setting, name it by its id from the list below and give the new value exactly as the list allows: {"kind": "setting", "field": "the id", "to": the new value, "why": "..."}. The user only has to press Allow, and the app changes it. For a setting that is not in the list, give "where" (Settings → page → setting) and "change" instead; the user then changes it by hand.'
      : 'To ask for a setting, give "where" (Settings → page → setting) and "change"; the user changes it by hand.',
    REPAIR_RULES.guard,
    '',
    'What you know:',
    clip(evidence, 9000),
    '',
    settings ? `The Mission's own settings now:\n${clip(settings, 1500)}` : '',
    appSettings ? `\nSettings you may ask to change (id | page → setting | value now | values it takes):\n${clip(appSettings, 9000)}` : '',
    '',
    `End with ONE JSON object and nothing after it: ${SHAPES.repair}`,
  ].filter((part) => part !== undefined).join('\n');
}
