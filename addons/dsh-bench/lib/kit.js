import { existsSync } from 'node:fs';
import { join } from 'node:path';
/**
 * The small helpers every Bench tool shares: the answer's shape, "switched off", one action per device
 * and one write at a time (a lock shared by all tools), the card a name means, the user's yes through the
 * app's approval card, and the dry run first when the user set a device so.
 */
import { gate } from './gate.js';
import { PROGRAMS } from './run.js';

/**
 * A file or folder name in a folder that is not taken yet: the stem, else the stem with -2, -3… (two
 * backups in the same moment never share a name, and one never replaces another).
 * @returns {string} the free name (stem + suffix).
 */
export function freeName(folder, stem, suffix = '', also = []) {
  for (let n = 1; n < 1000; n += 1) {
    const name = `${stem}${n === 1 ? '' : `-${n}`}`;
    if (![`${name}${suffix}`, ...also.map((extra) => extra(name))].some((candidate) => existsSync(join(folder, candidate)))) return `${name}${suffix}`;
  }
  throw new Error('Too many files with the same time in this folder.');
}

export const DRY_RUN_FOR_MS = 30 * 60_000;
export const DRY_NOTE = 'The user set this device to show a dry run first: this is it. Ask again with the same values to do it.';

/** @param {{enabled: Function, bench: object, find: Function, run: Function, approve: Function, isHelper: Function, seen: Function, busy: Set<string>}} options - what Bench gives every tool. */
export function makeKit({ enabled, bench, find, run, approve, isHelper, seen, busy }) {
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  const common = { output, isConcurrencySafe: () => false, timeoutMs: 40 * 60_000 };
  const safely = (work) => async (args, exec) => {
    if (!enabled()) return { text: 'Bench is switched off in Settings → Bench.' };
    try {
      return { text: await work(args ?? {}, exec) };
    } catch (error) {
      const reason = String(error?.message ?? error).slice(0, 900);
      return { text: `It did not work: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}` };
    }
  };
  const exclusive = async (keys, work) => {
    const taken = keys.filter(Boolean);
    const clash = taken.find((key) => busy.has(key));
    if (clash) throw new Error(clash === 'write:all' ? 'Another write is running on a device right now. Only one write at a time, on one device; wait for it to finish.' : 'Another action is using this device right now. Only one at a time; wait for it to finish.');
    for (const key of taken) busy.add(key);
    try {
      return await work();
    } finally {
      for (const key of taken) busy.delete(key);
    }
  };
  const cardOf = (name) => {
    const card = bench.find(String(name ?? ''));
    if (!card) throw new Error(`There is no card for "${String(name ?? '').slice(0, 80)}". Make one with bench_card first.`);
    return card;
  };
  const refuse = (decision) => {
    if (!decision.ok) throw new Error(decision.why);
    return decision;
  };
  const allowed = (card, need) => refuse(gate({ card, need }));
  const program = async (id) => {
    const path = await find(id);
    if (!path) throw new Error(`${id} is not installed. ${PROGRAMS[id]?.get ?? ''}`.trim());
    return path;
  };
  const yes = async (exec, reason, what) => {
    if (isHelper(exec)) throw new Error(`${what} needs the user's yes, and a helper of a run cannot ask. Only the conversation itself does this, with the user there.`);
    const outcome = await approve(exec, reason);
    if (outcome === 'allowed-once') return;
    if (outcome === 'rejected') throw new Error(`The user said no to ${what}. Do not try it another way.`);
    throw new Error(`${what} needs the user's yes, and they could not be asked just now (${outcome}).`);
  };
  /** Ask as the card says (Ask-Auto), or go on (Full Auto, the conversation itself only). */
  const askAsCard = async (exec, decision, reason, what) => {
    if (decision.ask) await yes(exec, reason, what);
    else if (isHelper(exec)) throw new Error('Only the conversation itself changes a device, not a helper of a run.');
  };
  const dryFirst = (exec, card, args, key) => {
    if (args.dryRun === true) {
      seen(exec).sawDry(key);
      return true;
    }
    if (card.permissions?.dryRun !== true) return false;
    if (seen(exec).hasDry(key, DRY_RUN_FOR_MS)) return false;
    seen(exec).sawDry(key);
    return true;
  };
  const must = async (file, args, options, what) => {
    const result = await run(file, args, options);
    if (result.code !== 0) throw new Error(`${what} (${String(result.stderr || result.stdout || `it ended with ${result.code}`).trim().split('\n').slice(-2).join(' ').slice(0, 300)})`);
    return result;
  };
  return { output, common, safely, exclusive, cardOf, refuse, allowed, program, yes, askAsCard, dryFirst, must };
}
