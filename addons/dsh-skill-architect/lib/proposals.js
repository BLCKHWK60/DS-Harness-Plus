/**
 * Proposals waiting for your yes (Skill architect, step 79), and who sees a learned skill (step 71).
 * A proposal keeps the excerpts it came from only until you decide, or until that conversation is deleted
 * for good (the owner's choice): the record of the decision stays, without quotes.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

export const KEEP = 200;

/**
 * Whether a learned skill reaches a conversation (step 71). Recon is left out before this is asked.
 * @param {{deleted?: boolean, reach: {kind: string, tab?: string, folder?: string}}} skill
 * @param {{cwd: string, tab: string}} where - the conversation's folder and tab ('' when not known).
 * @returns {boolean} true when it is offered there.
 */
export function visibleTo(skill, { cwd = '', tab = '' } = {}) {
  if (!skill || skill.deleted) return false;
  const reach = skill.reach ?? { kind: 'all' };
  if (reach.kind === 'project') return Boolean(cwd) && String(reach.folder).replace(/\/+$/, '') === String(cwd).replace(/\/+$/, '');
  // A tab-only skill is offered only where the tab is known to be that tab.
  if (reach.kind === 'tab') return Boolean(tab) && reach.tab === tab;
  return true;
}

/** @param {string} file - the JSON file ('' keeps proposals in memory, for tests). */
export function openProposals(file) {
  let list = [];
  if (file) {
    try {
      const read = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(read)) list = read;
    } catch {
      list = [];
    }
  }
  const save = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(list.slice(-KEEP), null, 1), { mode: 0o600 });
    renameSync(temp, file);
  };
  return {
    /** @returns {object[]} proposals, waiting ones first, newest first. */
    list: () => [...list].sort((a, b) => (a.state === 'waiting' ? 0 : 1) - (b.state === 'waiting' ? 0 : 1) || b.at - a.at),
    get: (id) => list.find((item) => item.id === id && item.state === 'waiting'),
    /** Add new proposals (they wait for your yes). @returns {object[]} the ones added. */
    add(found, at = Date.now()) {
      const added = found.map((proposal) => ({ id: randomUUID(), at, state: 'waiting', ...proposal, quotes: (proposal.quotes ?? []).map((quote) => String(quote).slice(0, 1200)) }));
      list.push(...added);
      if (list.length > KEEP) list = list.slice(-KEEP);
      save();
      return added;
    },
    /** Accepted or rejected: the quotes go, the decision stays. */
    decide(id, state) {
      const item = list.find((entry) => entry.id === id);
      if (!item) return false;
      item.state = state === 'accepted' ? 'accepted' : 'rejected';
      item.decidedAt = Date.now();
      item.quotes = [];
      save();
      return true;
    },
    /** A conversation was deleted for good: quotes taken from it go. */
    dropQuotes(ids) {
      const gone = new Set(ids);
      let changed = false;
      for (const item of list) {
        if ((item.conversations ?? []).some((id) => gone.has(id)) && (item.quotes ?? []).length > 0) {
          item.quotes = [];
          item.quotesGone = true;
          changed = true;
        }
      }
      if (changed) save();
      return changed;
    },
  };
}
