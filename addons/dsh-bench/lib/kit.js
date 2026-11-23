import { createHash } from 'node:crypto';
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

/** A sentence's first letter in capitals, for the line in Mission's card. */
export const upperFirst = (text) => {
  const line = String(text ?? '');
  return line ? `${line[0].toUpperCase()}${line.slice(1)}` : line;
};

/**
 * Mission stage E: a yes a helper of a Mission needs goes to the Mission's card instead of being refused at once.
 * `missionYes(exec, request)` is Bench's bridge to `mission.askYes` (index.js); any failure or no Mission reads as
 * undefined, so Bench's own refusal holds.
 * @returns {(exec: object, request: object) => Promise<object | undefined>}
 */
export function missionAsker(missionYes) {
  return async (exec, request) => {
    if (typeof missionYes !== 'function') return undefined;
    try {
      const said = await missionYes(exec, request);
      return said && typeof said === 'object' ? said : undefined;
    } catch {
      return undefined;
    }
  };
}

/**
 * The key a helper's yes is kept under in the Mission's card: the tool and the readable line, and (review of stage E) a
 * short fingerprint of exactly what is asked, so it is never cut off and two different requests never share a key.
 * @returns {string} at most 300 characters.
 */
export function yesKey(exec, what, exact = '') {
  const base = `${String(exec?.name ?? '')}:${what}`;
  const given = String(exact ?? '');
  if (!given) return base.slice(0, 300);
  const tag = createHash('sha256').update(given).digest('hex').slice(0, 16);
  return `${base.slice(0, 300 - tag.length - 1)}#${tag}`;
}

/**
 * A helper of a run asked for a yes. Devices' rule stays: a Mission's helpers may identify, read and watch;
 * only the conversation itself adjusts or writes. So only read-level yeses (`helperMay`: the first open of a
 * serial port, linking a card to a phone, trusting a device's key) can wait in the Mission's card and be allowed
 * there, once, for exactly this step. Every other yes is noted with Mission as not possible for a helper
 * (`cannot`), and refused as before. A helper that is not a Mission's is refused as before.
 * Review of stage E: `exact` is what the yes is about (the address, port and key fingerprints; the serial port and the
 * device on it; the phone): it is part of the key Mission matches an Allow on, so an Allow covers only the identical
 * request the owner was shown, never another key, port, device or phone on the same card.
 * @param {(exec: object, request: object) => Promise<object | undefined>} ask - from missionAsker.
 * @returns {Promise<void>} when the owner allowed it in the Mission's card (this one time); else it throws.
 */
export async function helperYes(ask, exec, reason, what, helperMay = false, exact = '') {
  const said = await ask(exec, { key: yesKey(exec, what, exact), what: upperFirst(what).slice(0, 300), reason: String(reason ?? '').slice(0, 600), ...(helperMay ? {} : { cannot: true }) });
  if (helperMay && said?.granted === true) return;
  if (helperMay && typeof said?.text === 'string' && said.text.trim()) throw new Error(said.text);
  throw new Error(`${what} needs the user's yes, and a helper of a run cannot ask. Only the thread itself does this, with the user there.`);
}

export const DRY_RUN_FOR_MS = 30 * 60_000;
export const DRY_NOTE = 'The user set this device to show a dry run first: this is it. Ask again with the same values to do it.';

/** @param {{enabled: Function, bench: object, find: Function, run: Function, approve: Function, isHelper: Function, seen: Function, busy: Set<string>}} options - what Bench gives every tool. */
export function makeKit({ enabled, bench, find, run, approve, isHelper, seen, busy, missionYes }) {
  const askMission = missionAsker(missionYes);
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  const common = { output, isConcurrencySafe: () => false, timeoutMs: 40 * 60_000 };
  const safely = (work) => async (args, exec) => {
    if (!enabled()) return { text: 'Devices is switched off in Settings → Devices.' };
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
  /**
   * `helperMay` (Mission stage E): a read-level yes a Mission's helper may get through the Mission's card; `exact` what
   * exactly it is about (an Allow there covers only that).
   */
  const yes = async (exec, reason, what, { helperMay = false, exact = '' } = {}) => {
    if (isHelper(exec)) return helperYes(askMission, exec, reason, what, helperMay, exact);
    const outcome = await approve(exec, reason);
    if (outcome === 'allowed-once') return;
    if (outcome === 'rejected') throw new Error(`The user said no to ${what}. Do not try it another way.`);
    throw new Error(`${what} needs the user's yes, and they could not be asked just now (${outcome}).`);
  };
  /** Ask as the card says (Ask-Auto), or go on (Full Auto, the conversation itself only). */
  const askAsCard = async (exec, decision, reason, what) => {
    if (decision.ask) await yes(exec, reason, what);
    else if (isHelper(exec)) {
      await askMission(exec, { key: `${String(exec?.name ?? '')}:${what}`.slice(0, 300), what: upperFirst(what).slice(0, 300), reason: String(reason ?? '').slice(0, 600), cannot: true });
      throw new Error('Only the thread itself changes a device, not a helper of a run.');
    }
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
