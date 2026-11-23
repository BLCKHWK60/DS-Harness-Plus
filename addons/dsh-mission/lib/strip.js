/**
 * The status strip's state (stage B, 19 November 2026): the server decides, from the card's run, what the strip
 * shows and what the main button does. Pure, so it is tested without the app.
 *
 *   state     main     when
 *   starting  send     Start Mission was pressed (armed) or a start is under way, and no Mission runs yet
 *   none      send     no Mission in this conversation
 *   finished  send     the Mission has ended (complete, incomplete or stopped)
 *   paused    resume   paused by you, by a restart, or the app's goal is not active
 *   problem   resume   paused by a problem (errors, failing helpers, the Budget guard, a blocked goal, the idle brake,
 *                      the app stopping the rounds by itself)
 *   down      note     stage E: running, and it waits for its model server (it tries again by itself; Try now)
 *   waiting   note     running, and only your answers can move it on (stage D: items wait for you, nothing else can
 *                      move; run.waitingForYou is set). The main button stays Add note: the questions card takes
 *                      the answers; typed numbered lines ("1. …") still answer
 *   running   note     running (also with open questions or approvals while other work goes on)
 *
 * Stage D (20 November 2026) adds `pool` (helpers at once, working, parked, waiting for a file), `approvals` (open
 * ones while on, and after the end while it can be continued), `waitUntil` (when a Mission that waits for you ends by
 * itself; 0: it waits until you answer) and each question's `parks` (the items that stopped for it).
 *
 * Point 17 (20 November 2026) adds `needs` and `waitFor` to every state; 'waiting' is decided before 'paused' (a Mission
 * that waits for you pauses the app's goal itself); after the end `decided`, `unasked`, `undone` and `endKind`, and
 * canContinue also for those (Finish it).
 *
 * Lab check of point 19 (20 November 2026) adds `oks` after the end: the repair helper's changes that wait for your OK
 * (run.oks), answered on the strip's own card; they are left out of `approvals` and `unasked` and never make it continuable.
 */

/** A pause by a restart: stage A-D's words ("Waiting: …") and stage E's ("Paused: the app restarted …"). */
const RESTARTED = /^(Waiting|Paused): the app restarted/;
/** Stage E: how long a Mission waits for its model server at most (lib/down.js DOWN_MAX_MS). */
const DOWN_MAX_MS = 2 * 60 * 60_000;

/**
 * The problem text without its "Paused: " / "Paused by " / "Stopped by itself: " lead, first letter upper case.
 * @param {string} stalled - the run's stalled text.
 * @returns {string}
 */
export function problemText(stalled) {
  // Stage E: a pause saved before the rename (19 November) still says "this Long run"; shown as Mission.
  const text = String(stalled ?? '').trim().replace(/^Paused:\s*/, '').replace(/^Paused by\s+/, '').replace(/^Stopped by itself:\s*/, '').replace(/\bLong run\b/g, 'Mission');
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : '';
}

/**
 * Stage C (20 November 2026) adds, for the questions card: who asked each question (`from`, `askedBy`), the answers that
 * came too late (`late`, only once it has ended), the too-little-time question (`timeQuestion`, only while it runs with a
 * time limit), and whether an ended Mission can be continued by answering (`canContinue`). An ended Mission lists its
 * open questions too; the numbers `n` are stage B's, so typed answers ("1. …") still reach the same questions.
 *
 * @param {object} input - what the card knows.
 * @param {object | null} input.run - runner.view plus goalPhase and activation, or null.
 * @param {boolean} [input.armed] - Start Mission was pressed and waits for its message.
 * @param {boolean} [input.starting] - a start is under way.
 * @param {number} [input.now] - now.
 * @param {number} [input.retryAt] - when the watchdog tries again by itself (0: no retry pending).
 * @returns {{state: string, main: string, questions: {n: number, id: string, text: string, assume: string, items: string[], from: string, askedBy: {id: string, title: string}[]}[], late: object[], timeQuestion: object | null, canContinue: boolean, canFinishLap: boolean, problem: {text: string, details: string} | null, pausedBy: string, retryAt: number, noTimeLimit: boolean}}
 */
export function stripOf({ run = null, armed = false, starting = false, now = Date.now(), retryAt = 0 } = {}) {
  const live = Boolean(run) && run.status === 'running';
  // Point 17: every state says the run's When it needs you and Wait for me ('' and 0 with no run).
  const needs = run && ['decide', 'ask', 'wait'].includes(run.needs) ? run.needs : run ? 'ask' : '';
  const base = { questions: [], late: [], timeQuestion: null, canContinue: false, canFinishLap: false, problem: null, pausedBy: '', retryAt: 0, noTimeLimit: Boolean(run) && run.kind === 'long' && !(run.deadline > 0), pool: null, approvals: [], waitUntil: 0, needs, waitFor: run ? Math.max(0, Number(run.waitFor) || 0) : 0, down: null, repair: null, repairs: [], carriedOn: 0, assistant: '', carryOn: null, oks: [] };
  if ((armed || starting) && !live) return { ...base, state: 'starting', main: 'send' };
  if (!run) return { ...base, state: 'none', main: 'send', noTimeLimit: false };
  const items = Array.isArray(run.items) ? run.items : [];
  const askedBy = (ids) => ids.map((id) => ({ id, title: String(items.find((item) => String(item.id) === id)?.title ?? '') }));
  const all = Array.isArray(run.questions) ? run.questions : [];
  const questions = all
    .filter((question) => question && question.status === 'open' && question.kind !== 'time')
    .map((question, index) => {
      const ids = Array.isArray(question.items) ? question.items.map(String) : [];
      return { n: index + 1, id: String(question.id ?? ''), text: String(question.text ?? ''), assume: String(question.assume ?? ''), items: ids, from: fromOf(question, ids), askedBy: askedBy(ids), parks: Array.isArray(question.parks) ? question.parks.map(String) : [] };
    });
  const working = Array.isArray(run.workingLanes) ? run.workingLanes : [];
  const pool = {
    size: Math.max(1, Number(run.helpers) || 1),
    working: working.filter((lane) => lane && lane.kind === 'work').length,
    parked: (Array.isArray(run.parked) ? run.parked : []).length,
    waitingFile: (Array.isArray(run.waitingFile) ? run.waitingFile : []).length,
  };
  const shapeApproval = (entry, index) => ({
    n: index + 1, id: String(entry.id ?? ''), kind: String(entry.kind ?? ''), what: String(entry.what ?? ''), items: Array.isArray(entry.items) ? entry.items.map(String) : [],
    askedBy: Array.isArray(entry.askedBy) ? entry.askedBy : askedBy(Array.isArray(entry.items) ? entry.items.map(String) : []), choices: Array.isArray(entry.choices) ? entry.choices : [],
    ...(entry.tool ? { tool: String(entry.tool) } : {}), ...(entry.plain ? { plain: String(entry.plain) } : {}), ...(entry.reason ? { reason: String(entry.reason) } : {}),
    ...(entry.warnings && typeof entry.warnings === 'object' ? { warnings: { ...entry.warnings } } : {}),
    // Stage E: who asked (the plan, the review, the repair helper), the add-on whose yes it is, and the repair's change.
    by: String(entry.by ?? ''), addon: String(entry.addon ?? ''), addonName: String(entry.addonName ?? ''), act: entry.act === true, fix: String(entry.fix ?? ''),
  });
  const approvals = (Array.isArray(run.approvals) ? run.approvals : []).filter((entry) => entry && entry.status === 'open').map(shapeApproval);
  if (!live) {
    const late = (Array.isArray(run.lateAnswers) ? run.lateAnswers : []).map((entry) => {
      const ids = Array.isArray(entry.items) ? entry.items.map(String) : [];
      return { id: String(entry.id ?? ''), text: String(entry.text ?? ''), answer: String(entry.answer ?? ''), items: ids, askedBy: askedBy(ids) };
    });
    const can = run.canContinue === true;
    // Lab check of point 19: the repair helper's changes that wait for your OK after the end (a setting, Calls at once,
    // the Budget guard): answered on the strip's own card, whether or not it can be continued; never in Finish it's card.
    const okIds = new Set((Array.isArray(run.oks) ? run.oks : []).map(String));
    const oks = (Array.isArray(run.approvals) ? run.approvals : []).filter((entry) => entry && okIds.has(String(entry.id)) && (entry.status === 'open' || entry.status === 'unasked')).map((entry, index) => ({ ...shapeApproval(entry, index), status: String(entry.status) }));
    const notOk = (entry) => !okIds.has(entry.id);
    // Point 17 (Finish it): what it decided itself, what Full auto did not ask, and the items not done yet.
    const decided = can ? (Array.isArray(run.decided) ? run.decided : []).map((entry) => ({ ...entry, items: Array.isArray(entry.items) ? entry.items.map(String) : [] })) : [];
    const unasked = can ? (Array.isArray(run.approvals) ? run.approvals : []).filter((entry) => entry && entry.status === 'unasked' && !okIds.has(String(entry.id))).map(shapeApproval) : [];
    const shown = approvals.filter(notOk);
    const undone = can ? items.filter((item) => item && item.status === 'open').map((item) => ({ id: String(item.id ?? ''), title: String(item.title ?? ''), mark: item.tried === true ? 'NOT DONE' : 'NOT STARTED', why: String(item.why ?? '') || String(item.note ?? '') || (item.tried === true ? 'Not done yet.' : 'Not started before the Mission ended.') })) : [];
    return {
      ...base, state: 'finished', main: 'send', questions, late, pool, approvals: can ? shown : [], decided, unasked, undone, endKind: String(run.endKind ?? ''), oks,
      canContinue: can && (questions.length > 0 || late.length > 0 || shown.length > 0 || unasked.length > 0 || decided.length > 0 || undone.length > 0),
    };
  }
  const deadline = Number(run.deadline) || 0;
  const time = deadline > 0 ? all.find((question) => question && question.status === 'open' && question.kind === 'time') : undefined;
  const timeQuestion = time
    ? { id: String(time.id ?? ''), text: String(time.text ?? ''), assume: String(time.assume ?? ''), minutes: Number(run.minutes) || 0, needed: Number(time.needed) || 0, left: Number(time.left) || 0, extra: Number(time.extra) || Math.max(10, Number(time.recommend) || 0), recommend: Number(time.recommend) || 0 }
    : null;
  const stalled = String(run.stalled ?? '');
  const laps = Number(run.laps) || 0;
  const wait = run.waitingForYou && typeof run.waitingForYou === 'object' ? run.waitingForYou : null;
  // While it waits for you its clock stands still (the deadline moves on when the wait ends), and nothing else can move:
  // Finish this lap ends it at once with its report, also past the first deadline and at its lap limit (review of point 17).
  const waitingNow = Boolean(wait) && !(Number(run.pausedAt) > 0);
  // Stage E: the repair helper, its last repairs, a carry on after a restart, and this Mission's settings for them.
  const repairs = (Array.isArray(run.repairs) ? run.repairs : []).slice(-3).map((entry) => ({ id: String(entry.id ?? ''), at: Number(entry.at) || 0, text: String(entry.text ?? ''), status: String(entry.status ?? '') }));
  const lived = {
    repair: run.repairing && typeof run.repairing === 'object' ? { working: run.repairing.working === true, cause: String(run.repairing.cause ?? '') } : null,
    repairs,
    carriedOn: Number(run.carriedOnAt) || 0,
    assistant: run.assistant === 'talk' ? 'talk' : run.assistant === 'look' ? 'look' : '',
    carryOn: typeof run.carryOn === 'boolean' ? run.carryOn : null,
  };
  const canFinishLap = run.kind === 'long' && run.finishLap !== true && (waitingNow || ((laps === 0 || (Number(run.lap) || 0) + 1 < laps) && (deadline === 0 || now < deadline)));
  // Point 17: a Mission that waits for you pauses the app's goal itself (a quiet wait): still 'waiting', never 'paused'.
  if (waitingNow) return { ...base, ...lived, state: 'waiting', main: 'note', questions, timeQuestion, canFinishLap, pool, approvals, waitUntil: Number(wait.until) || 0 };
  // Stage E: it waits for its model server (not paused): it tries again by itself; Try now tries at once.
  const down = run.down && typeof run.down === 'object' && !(Number(run.pausedAt) > 0) ? run.down : null;
  if (down) {
    return {
      ...base, ...lived, state: 'down', main: 'note', questions, timeQuestion, pool, approvals,
      canFinishLap: run.kind === 'long' && run.finishLap !== true,
      down: { since: Number(down.since) || 0, endsAt: (Number(down.first) || Number(down.since) || 0) + DOWN_MAX_MS, nextAt: Number(down.nextAt) || 0, tries: Number(down.tries) || 0, last: String(down.last ?? '') },
    };
  }
  const paused = Number(run.pausedAt) > 0 || !run.goalPhase || run.goalPhase !== 'active';
  const pausedBy = run.pausedBy
    ? String(run.pausedBy)
    : RESTARTED.test(stalled) ? 'restart' : stalled ? 'problem' : Number(run.pausedAt) > 0 ? 'you' : 'app';
  if (paused) {
    const problem = pausedBy === 'problem';
    return {
      ...base,
      ...lived,
      state: problem ? 'problem' : 'paused',
      main: 'resume',
      questions,
      pool,
      approvals,
      timeQuestion,
      pausedBy,
      problem: problem ? { text: problemText(stalled) || 'It stopped and could not go on by itself.', details: String(run.stalledDetails ?? '') } : null,
      retryAt: problem && Number(retryAt) > now ? Number(retryAt) : 0,
    };
  }
  return { ...base, ...lived, state: 'running', main: 'note', questions, timeQuestion, canFinishLap, pool, approvals, waitUntil: 0 };
}

/** Who asked (plan, review or item); a question saved before stage C is read from its items. */
const fromOf = (question, ids) => (['plan', 'review', 'item', 'repair'].includes(question.from) ? question.from : ids.length > 0 ? 'item' : 'plan');
