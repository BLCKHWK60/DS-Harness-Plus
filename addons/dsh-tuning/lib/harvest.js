/**
 * The harvest (plan step T1, and T12 for the other modes): rows cut by code from what the harness keeps.
 * Only checked steps become rows; a step nobody checked is not a row. Pure functions: the add-on hands
 * them the stored events, run records and files; nothing here reads the disk or the app.
 */
import { maskDeep } from './mask.js';
import { makeRow } from './rows.js';

/** A message the owner typed that corrects the assistant ("no, I said June", "that's wrong", "not what I asked"). */
export const CORRECTION = /^(?:no\b|nope\b|wrong\b|that'?s (?:not|wrong|incorrect)|not what i (?:asked|meant|said)|you (?:missed|forgot|ignored|misunderstood)|i (?:said|asked|meant)\b|incorrect\b|stop\b|undo\b|why did you\b|try again\b|actually[,]? (?:no|i)\b)/i;
/** Commands that run tests. */
export const TEST_COMMAND = /\b(?:npm (?:run )?test|pnpm (?:run )?test|yarn test|pytest|python3? -m pytest|go test|cargo test|node --test|make (?:test|check)|vitest|jest|mocha|swift test|xcodebuild test|rspec|phpunit|mvn test|gradle test|bun test|deno test)\b/;
/** Output of a test run that failed. */
export const FAILED_OUTPUT = /\b(?:\d+ (?:failed|failing|errors?)\b|FAILED\b|FAIL\b|not ok \d|Traceback \(most recent|AssertionError|✖ \S)/;
/** Tools that run a command line. */
export const SHELL_TOOLS = new Set(['bash', 'shell', 'pwsh', 'powershell', 'terminal_send', 'run_command']);
/** A tool that uses a signed-in account (a connector): never trains. */
export const signedInTool = (name) => /^mcp__/.test(String(name ?? ''));
/** Bench's and Recon's own tools: a turn that called one is never a row, whatever the tab says now. */
export const closedTool = (name) => /^(?:bench|recon)_/.test(String(name ?? ''));
/** How long a thread must be quiet before its newest turn counts as not corrected. */
export const QUIET_MS = 6 * 60 * 60_000;
const timeOf = (event) => {
  const value = event?.time ?? event?.data?.time ?? event?.at;
  const at = typeof value === 'number' ? value : Date.parse(String(value ?? ''));
  return Number.isFinite(at) ? at : 0;
};

const textOf = (message) => {
  const content = message?.content;
  if (typeof content === 'string') return content;
  return (Array.isArray(content) ? content : []).map((block) => (block?.type === 'text' ? String(block.text ?? '') : '')).join('\n').trim();
};
const argsOf = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  try {
    const value = JSON.parse(String(raw ?? '{}'));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
};
const commandOf = (args) => String(args?.command ?? args?.cmd ?? args?.script ?? args?.text ?? '');

/**
 * The turns of one thread, from its stored events.
 * @param {{type: string, data?: object}[]} events - oldest first.
 * @param {number} [inherited] - events at the start copied from another thread (a fork): left out.
 * @returns {{turn: number, request: string, tools: {name: string, args: object, error: boolean, result: string}[], answer: string, end: string, by: {provider: string, model: string}}[]} the turns.
 */
export function turnsOf(events, inherited = 0) {
  const own = (Array.isArray(events) ? events : []).slice(Math.max(0, Number(inherited) || 0));
  const turns = [];
  let pending = '';
  let current;
  const calls = new Map();
  for (const event of own) {
    const data = event?.data ?? {};
    switch (event?.type) {
      case 'user/message': {
        const kind = data.message?.source?.kind ?? data.source?.kind ?? 'user';
        // The app writes turn/start first and delivers the owner's message inside that turn (dsh-agent-loop);
        // older logs had it just before. It belongs to the open turn until that turn has done any work, else to
        // the next one (found while building step 10 of the skills part, 17 November).
        if (kind === 'user') {
          if (current && !current.worked && !current.ended) current.request = textOf(data.message);
          else pending = textOf(data.message);
        }
        break;
      }
      case 'turn/start':
        current = { turn: Number(data.turn) || turns.length + 1, request: pending, tools: [], answer: '', end: '', by: { provider: '', model: '' } };
        pending = '';
        turns.push(current);
        break;
      case 'request/header':
        if (current) current.by = { provider: String(data.header?.config?.provider ?? ''), model: String(data.header?.config?.model ?? '') };
        break;
      case 'tool/call':
        if (current) {
          current.worked = true;
          const call = { name: String(data.name ?? ''), args: argsOf(data.arguments), error: false, result: '', callId: String(data.callId ?? '') };
          current.tools.push(call);
          if (call.callId) calls.set(call.callId, call);
        }
        break;
      case 'tool/result': {
        const id = String(data.message?.toolCallId ?? data.message?.source?.callId ?? '');
        const call = calls.get(id);
        if (call) {
          call.error = data.message?.isError === true || Boolean(data.error);
          call.result = textOf(data.message).slice(0, 4000);
        }
        break;
      }
      case 'assistant/message':
        if (current) {
          current.worked = true;
          const text = textOf(data.message);
          if (text) current.answer = text;
        }
        break;
      case 'turn/end':
        if (current) {
          current.end = String(data.reason?.kind ?? '');
          current.at = timeOf(event);
          current.ended = true;
        }
        break;
      default:
    }
  }
  // A turn the owner corrected in the next message did not finish well; a turn that called Bench's or
  // Recon's own tools is closed (never a row).
  for (let index = 0; index < turns.length; index += 1) {
    const next = turns[index + 1];
    turns[index].corrected = Boolean(next && CORRECTION.test(next.request.trim()));
    turns[index].closed = turns[index].tools.some((call) => closedTool(call.name));
    turns[index].last = !next;
  }
  return turns;
}

/** The time of a thread's newest event (0 when the events carry no times). */
export function lastTimeOf(events) {
  const list = Array.isArray(events) ? events : [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const at = timeOf(list[index]);
    if (at) return at;
  }
  return 0;
}

/**
 * The calls of a turn with every string of their arguments masked (before anything is written as JSON),
 * and whether a secret could not be judged.
 */
export function maskedCalls(tools) {
  let unsure = false;
  const calls = tools.map((call) => {
    const deep = maskDeep(call.args ?? {});
    if (deep.unsure) unsure = true;
    return { ...call, args: deep.value && typeof deep.value === 'object' ? deep.value : {} };
  });
  return { calls, unsure };
}
/** Whether a turn may be a row now: finished, not closed, and not the newest turn of a thread still in use. */
export const settled = (turn, quiet) => !turn.closed && (!turn.last || quiet === true);

const callText = (call) => JSON.stringify({ name: call.name, arguments: call.args });
const solution = (turn, tools) => JSON.stringify({ calls: tools.map((call) => ({ name: call.name, arguments: call.args })), answer: turn.answer.slice(0, 8000) });

/**
 * Rows from a thread's turns: tool calls that solved a request (tests passed, or the turn finished
 * with no failed call and the owner did not correct it), and failed calls beside the call that then worked.
 * The newest turn waits until a later turn shows it was not corrected, or the thread was quiet for
 * hours (`quiet`). A turn that called Bench's or Recon's own tools is never a row.
 * @param {object[]} turns - from turnsOf.
 * @param {{mode: string, session: string, depth?: string, quiet?: boolean}} meta - where they came from.
 * @returns {object[]} rows.
 */
export function rowsFromTurns(turns, { mode, session, depth = '', quiet = false }) {
  const rows = [];
  for (const original of turns) {
    if (!original.request || original.tools.length === 0 || original.end !== 'completed' || original.corrected || !settled(original, quiet)) continue;
    const { calls, unsure } = maskedCalls(original.tools);
    const turn = { ...original, tools: calls };
    const signedIn = turn.tools.some((call) => signedInTool(call.name));
    const by = { ...turn.by, depth };
    const from = { session };
    // A failed call followed by a call of the same tool that worked: what to avoid, beside what to do.
    turn.tools.forEach((call, index) => {
      if (!call.error) return;
      const fix = turn.tools.slice(index + 1).find((later) => later.name === call.name && !later.error);
      if (!fix) return;
      rows.push(makeRow({ kind: 'toolfix', mode, input: [{ role: 'user', content: turn.request }], output: callText(fix), rejected: `${callText(call)}\nIt failed: ${call.result.slice(0, 600)}`, proof: { check: 'finished', detail: `${call.name} worked on the next try` }, by, rejectedBy: by, from: { ...from, tool: call.name }, signedIn, unsure }));
    });
    const tests = turn.tools.filter((call) => SHELL_TOOLS.has(call.name) && TEST_COMMAND.test(commandOf(call.args)));
    const lastTest = tests.at(-1);
    const testsPassed = Boolean(lastTest) && !lastTest.error && !FAILED_OUTPUT.test(lastTest.result);
    const clean = turn.tools.every((call) => !call.error);
    // The calls that worked, in order (a failed call is not an example of what to do).
    const worked = turn.tools.filter((call) => !call.error);
    if (testsPassed) rows.push(makeRow({ kind: 'toolcalls', mode, input: [{ role: 'user', content: turn.request }], output: solution(turn, worked), proof: { check: 'tests', detail: commandOf(lastTest.args).slice(0, 300) }, by, from, signedIn, unsure }));
    else if (clean && !lastTest) rows.push(makeRow({ kind: 'toolcalls', mode, input: [{ role: 'user', content: turn.request }], output: solution(turn, worked), proof: { check: 'finished', detail: `${worked.length} tool call${worked.length === 1 ? '' : 's'}, none failed, not corrected` }, by, from, signedIn, unsure }));
  }
  return rows;
}

/**
 * The ids of rows that corrected turns would have made: a turn kept while it was the newest one (after a
 * quiet spell) and corrected later is taken out again.
 */
export function withdrawnIds(turns, meta) {
  const corrected = turns.filter((turn) => turn.corrected).map((turn) => ({ ...turn, corrected: false, last: false }));
  return rowsFromTurns(corrected, { ...meta, quiet: true }).map((row) => row.id);
}

/**
 * Rows from a finished Mission run: an item whose check command passed (a checked row), a try that failed
 * before it (a failure row, for the weakest spot), and the cheapest model that passed each item (router).
 * @param {{run: object, log: object[], mode: string, session: string, models?: Record<string, number>}} input -
 *   run.json, log.jsonl entries, the thread's mode, and a cost rank per model (lower is cheaper).
 * @returns {object[]} rows.
 */
export function rowsFromRun({ run, log, mode, session, models = {} }) {
  const rows = [];
  if (!run || typeof run !== 'object' || run.long?.isolated || run.long?.bench) return rows;
  const items = new Map((Array.isArray(run.items) ? run.items : []).map((item) => [String(item.id), item]));
  const works = (Array.isArray(log) ? log : []).filter((entry) => entry?.kind === 'work' && entry.item);
  const depth = run.kind === 'long' ? 'long run' : 'mission';
  for (const [id, item] of items) {
    const tries = works.filter((entry) => String(entry.item) === id);
    const passed = tries.find((entry) => entry.status === 'verified' && entry.check?.ok === true);
    const task = [`Goal: ${String(run.goal ?? '').slice(0, 1200)}`, `Item: ${item.title ?? ''}`, item.detail ? `Detail: ${item.detail}` : '', item.doneWhen ? `Done when: ${item.doneWhen}` : ''].filter(Boolean).join('\n');
    for (const failed of tries.filter((entry) => entry !== passed && entry.status !== 'verified')) {
      rows.push(makeRow({ kind: 'failure', mode, input: task, output: `Try ${failed.try ?? '?'} by ${failed.model ?? '?'}: ${failed.status ?? 'not finished'}${failed.check ? ` (check ${failed.check.ok ? 'passed' : 'failed'}: ${failed.check.command ?? ''})` : ''}`, proof: { check: 'command', detail: failed.check?.command ?? '' }, by: { model: failed.model ?? '', depth }, from: { session, run: run.id } }));
    }
    if (!passed) continue;
    const report = String(item.report ?? '').trim();
    if (report) rows.push(makeRow({ kind: 'answer', mode, input: task, output: `${report}${item.evidence ? `\n\nEvidence: ${item.evidence}` : ''}`, proof: { check: 'command', detail: passed.check.command ?? '' }, by: { model: passed.model ?? '', depth }, from: { session, run: run.id } }));
    // The cheapest model that passed this kind of step.
    const passers = tries.filter((entry) => entry.status === 'verified' && entry.check?.ok === true && entry.model);
    const cheapest = passers.sort((a, b) => (models[a.model] ?? 99) - (models[b.model] ?? 99))[0];
    if (cheapest) rows.push(makeRow({ kind: 'router', mode, input: task, label: cheapest.model, proof: { check: 'command', detail: cheapest.check.command ?? '' }, by: { model: cheapest.model, depth }, from: { session, run: run.id } }));
  }
  return rows;
}

/**
 * Content rows from one subject's record: each claim the owner ruled on (a claim and its standing).
 * @param {{claims?: object[]}} state - `.content/state.json`.
 * @param {{subject: string}} meta
 * @returns {object[]} rows.
 */
/** Where a claim came from that may be harvested: a Research report, this thread, the owner's own words. */
export const SAFE_ORIGINS = new Set(['research', 'content', 'owner']);

export function rowsFromLedger(state, { subject }) {
  const rows = [];
  // Sources of any other origin (Recon, or none recorded): a claim that cites one is left out.
  const unsafe = new Set((Array.isArray(state?.sources) ? state.sources : []).filter((source) => !SAFE_ORIGINS.has(String(source?.origin ?? '').toLowerCase())).map((source) => source?.id));
  for (const claim of Array.isArray(state?.claims) ? state.claims : []) {
    if (!claim?.ruled || !claim.standing || !claim.text) continue;
    // Only a claim whose origin is known and safe (never Recon, never unknown), citing no source of
    // another origin (a Recon source cited by a claim of this thread).
    if (!SAFE_ORIGINS.has(String(claim.origin ?? '').toLowerCase())) continue;
    if ((Array.isArray(claim.sources) ? claim.sources : []).some((id) => unsafe.has(id))) continue;
    const text = [`Claim: ${claim.text}`, claim.who ? `Who says it: ${claim.who}` : '', claim.passage ? `Passage: ${claim.passage}` : ''].filter(Boolean).join('\n');
    rows.push(makeRow({ kind: 'label', mode: 'content', input: text, label: claim.standing, proof: { check: 'ruling', detail: String(claim.ruled.quote ?? claim.ruled.words ?? '').slice(0, 300) }, by: { provider: 'owner', model: 'owner' }, from: { subject }, at: claim.ruled.at ?? Date.now() }));
  }
  return rows;
}

/** The two halves of an edits file of the Voice Library ("## The writer's draft" / "## The owner's version"). */
export function halvesOf(text) {
  const value = String(text ?? '');
  const writer = /## The writer's draft\s*\n([\s\S]*?)\n## The owner's version/.exec(value)?.[1]?.trim() ?? '';
  const owner = /## The owner's version\s*\n([\s\S]*)$/.exec(value)?.[1]?.trim() ?? '';
  return { writer, owner };
}

/**
 * Content rows from the Voice Library: each approved piece's writer draft beside the owner's version
 * (a preference pair: his version chosen).
 * @param {{pieces?: object[]}} library - library.json.
 * @param {(file: string) => string} readFile - reads an edits file ('' when it cannot).
 * @returns {object[]} rows.
 */
export function rowsFromLibrary(library, readFile) {
  const rows = [];
  for (const piece of Array.isArray(library?.pieces) ? library.pieces : []) {
    if (!piece?.edits) continue;
    const { writer, owner } = halvesOf(readFile(piece.edits));
    if (!writer || !owner || writer === owner) continue;
    // The owner's version is the owner's writing only when most of it is the owner's; the writer's draft was
    // written by a model the library does not name.
    const ownersShare = Number(piece.share) || 0;
    rows.push(makeRow({ kind: 'pair', mode: 'content', input: `Write the ${piece.format || 'piece'} "${piece.title ?? ''}" in the owner's voice (${piece.voice || 'written'}).`, output: owner, rejected: writer, proof: { check: 'owner-edit', detail: `the owner's share ${Math.round(ownersShare * 100)}%` }, by: ownersShare >= 0.5 ? { provider: 'owner', model: 'owner' } : { provider: '', model: '' }, rejectedBy: { provider: '', model: '' }, from: { subject: piece.subject ?? '', source: piece.id ?? '' }, at: piece.at ?? Date.now() }));
  }
  return rows;
}
