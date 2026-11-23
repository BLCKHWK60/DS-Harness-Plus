/**
 * A training row: one checked step (the plan's "harvest"). What the model was given, what it produced,
 * and the proof that it was right; who made it; where it came from; and whether it may train, a flag set
 * here by code, never by a model.
 *
 * Kinds:
 *   - toolcalls: a request and the tool calls (and answer) that solved it;
 *   - toolfix: a tool call that failed, with its error, beside the call that then worked;
 *   - answer: a request and an answer that passed its check;
 *   - pair: two answers to the same request, the chosen one (the owner's version, his pick) and the rejected;
 *   - label: a text and the label the owner or a check gave it (a standing, a grade, a recipe);
 *   - router: a step and the cheapest model that passed it;
 *   - qa: a question built from reference material and its answer, checked against the source;
 *   - lesson: a worked example of calling one plugin's tool correctly;
 *   - failure: a step the small model failed (for finding the weakest spot; never trains).
 */
import { createHash } from 'node:crypto';
import { mask, maskDeep } from './mask.js';

export const KINDS = ['toolcalls', 'toolfix', 'answer', 'pair', 'label', 'router', 'qa', 'lesson', 'failure'];
/** The kinds of proof a row may carry: which check passed, or which ruling the owner gave. */
export const PROOFS = ['tests', 'command', 'finished', 'ruling', 'owner-edit', 'approval', 'source-opened', 'rerun', 'saved', 'agreement', 'readback', 'owner-correct', 'owner-pick', 'schema', 'checked-against-source', 'checks-passed'];
/** Kinds whose text is open-ended writing (the harness and voice adapters train on these). */
export const OPEN_ENDED = new Set(['toolcalls', 'toolfix', 'answer', 'pair', 'qa', 'lesson']);
const TEXT_MAX = 60_000;

const sha = (value) => createHash('sha256').update(String(value)).digest('hex');

/** @returns {boolean} whether a provider or model is Anthropic's (its terms name training on its outputs). */
export function isAnthropic(by) {
  const provider = String(by?.provider ?? '').toLowerCase();
  const model = String(by?.model ?? '').toLowerCase();
  return /anthropic|claude/.test(provider) || /^claude|\bclaude\b|anthropic\//.test(model);
}

/** Who wrote a text: a provider and a model, as the app names them ('' when nobody can say). */
const writer = (by = {}) => ({ provider: String(by?.provider ?? '').slice(0, 120), model: String(by?.model ?? '').slice(0, 200), ...(by?.depth ? { depth: String(by.depth).slice(0, 30) } : {}) });

/**
 * A row, with its text masked and its id fixed by its content (the mode is not part of it: the same work
 * seen from two tabs is one row, on one side of the exam).
 * @param {object} input - the row's parts; `by` is who wrote the output, `rejectedBy` who wrote the rejected
 *   answer of a pair; `unsure` marks a row whose secrets could not all be judged (it may not train).
 * @returns {object} the row.
 */
export function makeRow({ kind, mode, input, output = '', rejected = '', label = '', proof, by = {}, rejectedBy, from = {}, at = Date.now(), signedIn = false, unsure: unsureFrom = false }) {
  if (!KINDS.includes(kind)) throw new Error(`not a kind of row: ${kind}`);
  let unsure = unsureFrom === true;
  const clean = (value) => {
    // Not text (arguments, an object): every string inside is masked before it is written as JSON.
    let text = value;
    if (typeof value !== 'string') {
      const deep = maskDeep(value ?? '');
      if (deep.unsure) unsure = true;
      text = JSON.stringify(deep.value ?? '');
    }
    if (text.length > TEXT_MAX) unsure = true;
    const result = mask(text.slice(0, TEXT_MAX));
    if (result.unsure) unsure = true;
    return result.text;
  };
  const messages = (Array.isArray(input) ? input : [{ role: 'user', content: String(input ?? '') }])
    .filter((message) => message && ['system', 'user', 'assistant', 'tool'].includes(message.role))
    .slice(-40)
    .map((message) => ({ role: message.role, content: clean(message.content) }));
  const row = {
    kind,
    mode: String(mode ?? '').slice(0, 40),
    input: messages,
    output: clean(output),
    ...(rejected ? { rejected: clean(rejected) } : {}),
    ...(label ? { label: String(label).slice(0, 200) } : {}),
    proof: { check: PROOFS.includes(proof?.check) ? proof.check : 'finished', detail: clean(String(proof?.detail ?? '').slice(0, 1000)) },
    by: writer(by),
    ...(rejected && rejectedBy ? { rejectedBy: writer(rejectedBy) } : {}),
    from: Object.fromEntries(Object.entries({ mode, session: from.session, run: from.run, source: from.source, licence: from.licence, tool: from.tool, plugin: from.plugin, subject: from.subject }).filter(([, value]) => value !== undefined && value !== '').map(([key, value]) => [key, String(value).slice(0, 400)])),
    signedIn: signedIn === true,
    unsure,
    at: typeof at === 'number' ? at : Date.parse(at) || Date.now(),
  };
  row.id = sha(JSON.stringify([row.kind, row.input, row.output, row.rejected ?? '', row.label ?? ''])).slice(0, 20);
  return row;
}

/** Labels earlier versions used instead of a writer; they say nothing about who wrote the text. */
const NOT_A_WRITER = new Set(['', 'research', 'bench', 'teacher', 'made-up']);
/** @returns {boolean} whether nobody can say who wrote a text. */
export const unknownWriter = (by) => NOT_A_WRITER.has(String(by?.provider ?? '').trim().toLowerCase());

/**
 * Whether a row may train, decided by code (the plan's "May it train?"). Never for Recon (whose rows are
 * never made) or a row from the Recon or Devices space, for a signed-in source, for a row whose secrets could not be masked, or for a failure.
 * Each provider has a switch (all start at yes); text written by Anthropic's models may not train an
 * adapter that writes open-ended text unless the owner switched that on (it starts at off).
 * @param {object} row - the row.
 * @param {{providers?: Record<string, boolean>, anthropicOpenEnded?: boolean, purpose?: 'open' | 'narrow'}} rules
 * @returns {{ok: boolean, why: string}} the decision and the reason when it is no.
 */
export function mayTrain(row, { providers = {}, anthropicOpenEnded = false, purpose, withRejected = false } = {}) {
  if (!row || row.mode === 'recon') return { ok: false, why: 'Recon is never harvested' };
  // Item 4A, stage 6a: by space too: a row from the Recon or the Devices space (any mode) never trains.
  if (row.space === 'recon') return { ok: false, why: 'Recon is never harvested' };
  if (row.space === 'devices') return { ok: false, why: 'the Devices space is never harvested' };
  if (row.kind === 'failure') return { ok: false, why: 'a failure is kept to find the weakest spot, not to train' };
  if (row.signedIn) return { ok: false, why: 'it came from a signed-in source' };
  if (row.unsure) return { ok: false, why: 'its secrets could not all be masked' };
  const open = (purpose ?? (OPEN_ENDED.has(row.kind) ? 'open' : 'narrow')) === 'open';
  // Every writer whose text would train: the answer's, and for a preference pair also the rejected one's.
  const writers = [row.by, ...(withRejected && row.rejected ? [row.rejectedBy ?? {}] : [])];
  for (const by of writers) {
    const provider = String(by?.provider ?? '');
    if (provider && providers[provider] === false) return { ok: false, why: `training on text from ${provider} is switched off` };
    if (open && unknownWriter(by)) return { ok: false, why: 'nobody can say which model wrote it, so it does not train adapters that write open-ended text' };
    if (open && isAnthropic(by) && anthropicOpenEnded !== true) return { ok: false, why: 'text written by Anthropic\'s models does not train adapters that write open-ended text (switched off)' };
  }
  return { ok: true, why: '' };
}

/**
 * One row in five goes to the exam, chosen by code from the row's id and this install's own salt, so the
 * same row always goes the same way and nobody can pick which rows are examined.
 * @returns {boolean} whether the row belongs to the exam.
 */
export function forExam(rowId, salt) {
  return parseInt(sha(`${salt}:${rowId}`).slice(0, 8), 16) % 5 === 0;
}

/** The text of a row for comparing two rows (near repeats). */
export const rowText = (row) => `${(row.input ?? []).map((message) => message.content).join('\n')}\n${row.output ?? ''}\n${row.label ?? ''}`;
