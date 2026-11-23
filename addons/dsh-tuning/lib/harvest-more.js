/**
 * The harvest for the other modes (plan step T12): Research, Finance and Data, Bench, the owner's
 * corrections in any mode, and Creator Plus. Pure functions, as in harvest.js.
 */
import { makeRow } from './rows.js';
import { CORRECTION, maskedCalls, settled } from './harvest.js';

/** Nobody can say which model wrote it (a packet is made by code from a run's findings; Bench's cards). */
const UNKNOWN = { provider: '', model: '' };

/**
 * Research rows from a report's packet (`<report>.md.packet/packet.json`): a passage and the claim it
 * supports, only for a source that was really opened (the proof); a source and its grade.
 * @param {{question?: string, claims?: object[], sources?: object[]}} packet
 * @param {{report: string}} meta
 * @returns {object[]} rows.
 */
export function rowsFromPacket(packet, { report }) {
  const rows = [];
  const sources = new Map((Array.isArray(packet?.sources) ? packet.sources : []).map((source) => [Number(source.n), source]));
  for (const claim of Array.isArray(packet?.claims) ? packet.claims : []) {
    const source = sources.get(Number(claim.source));
    if (!claim?.claim || !claim.passage || claim.read !== 'read' || source?.read !== 'read') continue;
    rows.push(makeRow({ kind: 'answer', mode: 'research', input: `Question: ${packet.question ?? ''}\nPassage from ${claim.who || source.host || 'a source'}: ${claim.passage}\nWhat claim does this passage support?`, output: claim.claim, proof: { check: 'source-opened', detail: source.url ?? '' }, by: UNKNOWN, from: { source: source.url ?? '', subject: report } }));
  }
  for (const source of sources.values()) {
    if (!source.grade || source.read !== 'read') continue;
    rows.push(makeRow({ kind: 'label', mode: 'research', input: `Source: ${source.host ?? ''} (${source.url ?? ''})`, label: source.grade, proof: { check: 'source-opened', detail: 'graded after it was opened' }, by: UNKNOWN, from: { source: source.url ?? '', subject: report } }));
  }
  return rows;
}

/** Data tools whose result answers a question with numbers. */
const QUERY_TOOLS = new Set(['data_query', 'finance_prices', 'finance_company_figures', 'finance_economy']);

/**
 * Finance and Data rows from a thread's turns: a question and the query that answered it, when the
 * analysis was saved and, later, run again with the same numbers (the proof).
 * @param {object[]} turns - from turnsOf.
 * @param {{mode: string, session: string}} meta
 * @returns {object[]} rows.
 */
export function rowsFromData(turns, { mode, session, quiet = false }) {
  const rows = [];
  const allCalls = turns.filter((turn) => !turn.closed).flatMap((turn) => turn.tools);
  const saved = allCalls.some((call) => call.name === 'data_save_analysis' && !call.error);
  const rerun = allCalls.find((call) => call.name === 'data_rerun_analysis' && !call.error);
  const rerunSame = Boolean(rerun) && /\b(?:nothing moved|no change|unchanged|the same)\b/i.test(rerun.result);
  if (!saved && !rerunSame) return rows;
  for (const turn of turns) {
    if (!turn.request || turn.end !== 'completed' || turn.corrected || !settled(turn, quiet)) continue;
    const { calls, unsure } = maskedCalls(turn.tools.filter((call) => QUERY_TOOLS.has(call.name) && !call.error));
    if (calls.length === 0) continue;
    rows.push(makeRow({ kind: 'toolcalls', mode, input: [{ role: 'user', content: turn.request }], output: JSON.stringify({ calls: calls.map((call) => ({ name: call.name, arguments: call.args })), answer: turn.answer.slice(0, 4000) }), proof: { check: rerunSame ? 'rerun' : 'saved', detail: rerunSame ? 'run again, the numbers agreed' : 'the analysis was saved' }, by: turn.by, from: { session }, unsure }));
  }
  return rows;
}

/**
 * Bench rows from device cards: what a device reports and the recipe that fitted, only for a device whose
 * read was checked (a checked backup, or a logbook entry whose check passed). Never a write command:
 * Bench's code runs those.
 * @param {{name: string, maker?: string, model?: string, chip?: string, identifiers?: string, connects?: string, recipe?: string}[]} cards
 * @param {(card: object) => boolean} checked - whether a read of that device was checked.
 * @returns {object[]} rows.
 */
export function rowsFromBench(cards, checked) {
  const rows = [];
  for (const card of Array.isArray(cards) ? cards : []) {
    if (!card?.recipe || !checked(card)) continue;
    const reports = [card.maker && `Maker: ${card.maker}`, card.model && `Model: ${card.model}`, card.chip && `Chip: ${card.chip}`, card.identifiers && `Identifiers: ${card.identifiers}`, card.connects && `Connects: ${card.connects}`].filter(Boolean).join('\n');
    if (!reports) continue;
    rows.push(makeRow({ kind: 'label', mode: 'bench', input: `What the device reports:\n${reports}\nWhich recipe fits?`, label: String(card.recipe).slice(0, 120), proof: { check: 'readback', detail: 'a read of the device was checked' }, by: UNKNOWN, from: { source: card.slug ?? card.name } }));
  }
  return rows;
}

/**
 * The owner's corrections in any mode: the answer before he corrected it, and the answer after, when he
 * did not correct that one too (a preference pair: the answer after chosen).
 * @param {object[]} turns - from turnsOf.
 * @param {{mode: string, session: string}} meta
 * @returns {object[]} rows.
 */
export function rowsFromCorrections(turns, { mode, session, quiet = false }) {
  const rows = [];
  for (let index = 0; index + 1 < turns.length; index += 1) {
    const before = turns[index];
    const after = turns[index + 1];
    if (!before.answer || !after.answer || !CORRECTION.test(after.request.trim()) || after.corrected || after.end !== 'completed') continue;
    if (!before.request || before.closed || !settled(after, quiet)) continue;
    rows.push(makeRow({ kind: 'pair', mode, input: [{ role: 'user', content: before.request }, { role: 'assistant', content: before.answer }, { role: 'user', content: after.request }], output: after.answer, rejected: before.answer, proof: { check: 'owner-correct', detail: after.request.slice(0, 200) }, by: after.by, rejectedBy: before.by, from: { session } }));
  }
  return rows;
}

/**
 * Creator Plus rows from its finished builds, when it keeps them: a brief and the plugin that passed all
 * four checks; an error, its cause and its fix. Read leniently: a build record that does not say its checks
 * passed is not a row.
 * @param {object[]} builds - Creator Plus's build records.
 * @returns {object[]} rows.
 */
export function rowsFromCreator(builds) {
  const rows = [];
  for (const build of Array.isArray(builds) ? builds : []) {
    const checks = build?.checks;
    const passed = checks && typeof checks === 'object' && ['loads', 'tests', 'fit', 'trial'].every((name) => checks[name] === true || checks[name]?.ok === true);
    if (passed && build.brief && (build.summary || build.plan)) {
      rows.push(makeRow({ kind: 'answer', mode: 'creator', input: `Brief: ${String(build.brief).slice(0, 6000)}`, output: String(build.summary ?? build.plan).slice(0, 12000), proof: { check: 'checks-passed', detail: 'loads, tests, fit check, trial install' }, by: { provider: String(build.provider ?? ''), model: String(build.model ?? '') }, from: { source: String(build.id ?? '') } }));
    }
    for (const fix of Array.isArray(build?.fixes) ? build.fixes : []) {
      if (!fix?.error || !fix.fix || fix.passed !== true) continue;
      rows.push(makeRow({ kind: 'answer', mode: 'creator', input: `Error: ${String(fix.error).slice(0, 3000)}`, output: `Cause: ${String(fix.cause ?? '').slice(0, 2000)}\nFix: ${String(fix.fix).slice(0, 6000)}`, proof: { check: 'checks-passed', detail: 'the fix made the checks pass' }, by: { provider: String(build.provider ?? ''), model: String(build.model ?? '') }, from: { source: String(build.id ?? '') } }));
    }
  }
  return rows;
}
