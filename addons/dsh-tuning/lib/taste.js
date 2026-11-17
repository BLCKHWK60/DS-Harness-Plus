/**
 * The taste test (plan step T11): the owner's recent real requests are answered twice, by the model in use
 * and by the candidate, with the names hidden; he picks. His picks decide the promotion together with the
 * exam, and each pick becomes a preference pair (the answer he picked chosen).
 *
 * Decided for the owner: his *recent* requests (from the logs, never Recon's or an export's) are answered
 * again; answering his next live requests twice would change how the chat sends a turn, which is not additive.
 */
import { randomBytes } from 'node:crypto';
import { makeRow } from './rows.js';

/**
 * A taste round: each request with its two answers in a hidden order.
 * @param {{requests: {id: string, text: string, mode: string}[], current: string[], candidate: string[], entry: string}} input
 * @returns {{id: string, entry: string, items: object[], at: number}}
 */
export function newRound({ requests, current, candidate, entry, at = Date.now(), writers = {} }) {
  const items = requests.map((request, index) => {
    const candidateFirst = randomBytes(1)[0] % 2 === 1;
    return {
      n: index + 1,
      request: request.text.slice(0, 4000),
      mode: request.mode,
      a: (candidateFirst ? candidate[index] : current[index]) ?? '',
      b: (candidateFirst ? current[index] : candidate[index]) ?? '',
      // Kept hidden from the page until the owner picked.
      key: candidateFirst ? 'a' : 'b',
      pick: '',
    };
  });
  // Who wrote each side: the model in use, and the candidate (the base model with the adapter, on this Mac).
  return { id: `T${at.toString(36)}`, entry, items, at, writers: { current: writers.current ?? {}, candidate: writers.candidate ?? {} } };
}

/** The page's view of a round: the answers, never which one is the candidate (until all are picked). */
export function roundView(round) {
  const done = round.items.every((item) => item.pick);
  return { id: round.id, entry: round.entry, done, items: round.items.map(({ key, ...item }) => (done ? { ...item, candidate: key } : item)) };
}

/** Record a pick ('a', 'b' or 'same'). */
export function recordPick(round, n, pick) {
  if (!['a', 'b', 'same'].includes(pick)) throw new Error('Pick a, b or same.');
  const item = round.items.find((one) => one.n === Number(n));
  if (!item) throw new Error('There is no such request in this round.');
  item.pick = pick;
  return item;
}

/** The tally: how often the candidate was picked over the model in use. */
export function tally(round) {
  let candidate = 0;
  let current = 0;
  let same = 0;
  for (const item of round.items) {
    if (!item.pick) continue;
    if (item.pick === 'same') same += 1;
    else if (item.pick === item.key) candidate += 1;
    else current += 1;
  }
  return { candidate, current, same, picked: candidate + current + same, total: round.items.length, prefers: candidate > current ? 'candidate' : current > candidate ? 'current' : 'neither' };
}

/** Preference pairs from a finished round (the picked answer chosen). */
export function pairsOf(round) {
  // The owner picked; the texts were written by the models: each side keeps its real writer.
  const writerOf = (item, side) => (side === item.key ? round.writers?.candidate : round.writers?.current) ?? {};
  return round.items.filter((item) => item.pick === 'a' || item.pick === 'b').map((item) => {
    const other = item.pick === 'a' ? 'b' : 'a';
    return makeRow({ kind: 'pair', mode: item.mode || 'any', input: item.request, output: item[item.pick], rejected: item[other], proof: { check: 'owner-pick', detail: 'the owner picked it in a taste test, names hidden' }, by: writerOf(item, item.pick), rejectedBy: writerOf(item, other), from: { source: round.id } });
  });
}
