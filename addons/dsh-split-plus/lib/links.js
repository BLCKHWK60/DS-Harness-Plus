/**
 * Split Plus, step 7: linked logs. Which conversations were open side by side, and when, kept beside the
 * send ledger (`links.jsonl`), so the logs of conversations that worked together can be read together
 * (Creator Plus and Tuning Plus, through the `splitLinks` service). The app's own session logs take no
 * entry from an add-on that the model would not see, so the link lives here and names the conversations.
 */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tailLines } from './sendroom.js';

/** At most this many lines are read back. */
const READ_MAX = 5000;

/**
 * @param {{home?: string, now?: () => number}} [options] - `home`: the folder for links.jsonl ('' in memory).
 */
export function openLinks({ home = '', now = Date.now } = {}) {
  const file = home ? join(home, 'links.jsonl') : '';
  const memory = [];
  let last = '';
  const rows = () => {
    if (!file) return memory;
    if (!existsSync(file)) return [];
    return tailLines(file, 2_000_000).slice(-READ_MAX).map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  };
  try {
    const previous = rows().at(-1);
    if (previous) last = (previous.panes ?? []).join(',');
  } catch { /* a damaged file: the next change starts it again */ }
  return {
    /**
     * The Split page shows these conversations now (written only when the set changes).
     * @param {string[]} panes - conversation ids, in order.
     */
    note(panes) {
      const ids = [...new Set((Array.isArray(panes) ? panes : []).map(String).filter(Boolean))].slice(0, 8);
      const key = ids.join(',');
      if (key === last) return false;
      last = key;
      const row = { at: now(), panes: ids };
      if (!file) memory.push(row);
      else {
        mkdirSync(home, { recursive: true, mode: 0o700 });
        appendFileSync(file, `${JSON.stringify(row)}\n`, { mode: 0o600 });
      }
      return true;
    },
    /**
     * The conversations that were open beside one, with from when to when (until the set changed).
     * @param {string} sessionId - a conversation.
     * @returns {{sessionId: string, from: number, to: number | null}[]}
     */
    besideOf(sessionId) {
      const id = String(sessionId ?? '');
      const list = rows();
      const out = [];
      list.forEach((row, index) => {
        if (!(row.panes ?? []).includes(id)) return;
        const to = list[index + 1]?.at ?? null;
        for (const other of row.panes) if (other !== id) out.push({ sessionId: other, from: row.at, to });
      });
      return out;
    },
    /** Every change of the Split page's panes, oldest first. */
    all: rows,
  };
}
