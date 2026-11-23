/**
 * The health list (step 10; the owner's prompt, part 6): for each skill, how often it was loaded, how often
 * the turn it was loaded in ended well, when it was last used, how much room it takes, what it clashes
 * with, and whether it is hidden behind another. Uses are counted from the threads Tuner Plus may read
 * (the harvest's rules: never Recon), from the app's own log: the model's `skill` tool call that worked, or
 * the owner's typed /name (a "skill-invocation" message).
 */
import { CORRECTION } from '../harvest.js';
import { catalogDescription } from './exam.js';

/** Days without a use before a skill counts as unused (for "Retire unused"). */
export const UNUSED_DAYS = 30;

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

/**
 * The skill uses in one thread's own events (a fork's copied turns are its parent's, counted there).
 * @param {object[]} events - the thread's events.
 * @param {number} [inherited] - how many of them a fork copied in.
 * @returns {{name: string, at: number, how: 'model'|'owner', well: boolean}[]}
 */
export function usesIn(events, inherited = 0) {
  const own = (Array.isArray(events) ? events : []).slice(Math.max(0, Number(inherited) || 0));
  const uses = [];
  const calls = new Map();
  let turn = -1;
  const turns = [];
  // The app writes turn/start first and the turn's messages inside it (dsh-agent-loop: the step delivers
  // them); older logs had them just before. A message belongs to the open turn until that turn has done any
  // work, else to the next turn (the review of step 10).
  let pending = '';
  let pendingOwner = [];
  for (const event of own) {
    const data = event?.data ?? {};
    switch (event?.type) {
      case 'user/message': {
        const source = data.source ?? data.message?.source ?? {};
        const open = turn >= 0 && turns[turn] && !turns[turn].worked && !turns[turn].ended ? turns[turn] : undefined;
        if (source.kind === 'skill-invocation' && typeof source.name === 'string') {
          if (open) open.uses.push({ name: source.name, at: timeOf(event), how: 'owner' });
          else pendingOwner.push({ name: source.name, at: timeOf(event) });
        } else if ((source.kind ?? 'user') === 'user') {
          if (open) open.request = textOf(data.message);
          else pending = textOf(data.message);
        }
        break;
      }
      case 'turn/start':
        turn += 1;
        turns[turn] = { request: pending, at: timeOf(event), uses: pendingOwner.map((one) => ({ ...one, how: 'owner' })) };
        pending = '';
        pendingOwner = [];
        break;
      case 'assistant/message':
        if (turns[turn]) turns[turn].worked = true;
        break;
      case 'tool/call':
        if (turns[turn]) turns[turn].worked = true;
        if (String(data.name ?? '') === 'skill' && turn >= 0) {
          let args = data.arguments;
          if (typeof args === 'string') {
            try {
              args = JSON.parse(args);
            } catch {
              args = {};
            }
          }
          if (typeof args?.name === 'string') calls.set(String(data.callId ?? ''), { name: args.name, at: timeOf(event), turn });
        }
        break;
      case 'tool/result': {
        const id = String(data.message?.toolCallId ?? data.message?.source?.callId ?? '');
        const call = calls.get(id);
        if (call && data.message?.isError !== true && !data.error) {
          const slot = turns[call.turn] ?? (turns[call.turn] = { request: '', at: call.at });
          slot.uses = [...(slot.uses ?? []), { name: call.name, at: call.at, how: 'model' }];
        }
        break;
      }
      case 'turn/end':
        if (turns[turn]) {
          turns[turn].end = String(data.reason?.kind ?? '');
          turns[turn].ended = true;
        }
        break;
      default:
    }
  }
  // A turn ended well when it completed and the owner's next message did not correct it.
  turns.forEach((one, index) => {
    const next = turns[index + 1];
    const well = one.end === 'completed' && !(next && CORRECTION.test(String(next.request ?? '').trim()));
    for (const use of one.uses ?? []) uses.push({ name: use.name, at: use.at, how: use.how, well });
  });
  return uses;
}

/**
 * Every skill's uses, from the uses of every thread (each with its tab).
 * @param {{mode: string, uses: object[]}[]} sessions
 * @returns {Map<string, {loads: number, well: number, owner: number, last: number, byMode: Record<string, number>}>}
 */
export function tallyUses(sessions) {
  const out = new Map();
  for (const { mode = '', uses = [] } of Array.isArray(sessions) ? sessions : []) {
    for (const use of uses) {
      const slot = out.get(use.name) ?? { loads: 0, well: 0, owner: 0, last: 0, byMode: {} };
      slot.loads += 1;
      if (use.well) slot.well += 1;
      if (use.how === 'owner') slot.owner += 1;
      slot.last = Math.max(slot.last, Number(use.at) || 0);
      const tab = mode || 'other';
      slot.byMode[tab] = (slot.byMode[tab] ?? 0) + 1;
      out.set(use.name, slot);
    }
  }
  return out;
}

/** The room a skill takes in the list every request carries: its line, in characters and about how many tokens. */
export function roomOf(name, description) {
  const line = `- \`${name}\`: ${catalogDescription(description)}`;
  return { chars: line.length + 1, tokens: Math.ceil((line.length + 1) / 4) };
}

/**
 * The list's cost per tab: the whole list goes with every request in every tab that offers skills (the app
 * cannot give a tab only some of them; choosing per tab is a later step), and the skills never loaded there.
 * @param {{name: string, description: string}[]} catalog - the list the model gets.
 * @param {Map<string, object>} tally - the uses.
 * @param {string[]} tabs - the tabs seen in the threads read.
 */
export function listCost(catalog, tally, tabs) {
  const lines = catalog.map((one) => roomOf(one.name, one.description));
  const chars = lines.reduce((sum, one) => sum + one.chars, 0) + 600;
  const perTab = tabs.map((tab) => ({ tab, never: catalog.filter((one) => !(tally.get(one.name)?.byMode?.[tab] > 0)).map((one) => one.name) }));
  return { skills: catalog.length, chars, tokens: Math.ceil(chars / 4), perTab };
}
