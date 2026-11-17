/**
 * The record behind the marks: one line per event, only added to, in Tuner Plus's own folder, beside
 * the skills and never inside a skill file (a downloaded skill stays exactly as it came). Each line
 * carries the fingerprint of the line before it (the first line: none), and the seal kept apart holds
 * the number of lines, the first line's fingerprint and the last one's. A line changed, removed or added
 * by anyone but Tuner Plus breaks the chain; the doors' stamps and the owner's sortings are then not
 * trusted, so those skills show Not sorted: a tampered record only loses a mark, never gains a better one
 * (the owner's fixed rule 2). A broken record stays broken: Tuner Plus writes nothing more on top of it
 * (that would make the change look like its own) until the owner starts a new one.
 *
 * Events:
 *   seen   - a skill was first seen (or seen again after it moved): its key, name, place, fingerprint, mark.
 *   stamp  - a door wrote it at that moment: which door, which model, the fingerprint of what was written.
 *   sorted - the owner sorted skills by hand on the page: their keys and the mark he chose.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { appendLines } from '../store.js';

export const EVENT_KINDS = Object.freeze(['seen', 'stamp', 'sorted']);
/** The most lines read back (the newest); far more than one person's skills make. */
export const RECORD_MAX = 100_000;

export const hashOf = (text) => createHash('sha256').update(String(text)).digest('hex');
/** The fingerprint of a skill's text. */
export const fingerprint = (text) => hashOf(text).slice(0, 32);
/** The key a skill's records hang on: its name and its place (a folder, or the provider that serves it). */
export const keyOf = (name, where) => `${String(name ?? '')}|${String(where ?? '')}`;

/** The seal: the number of lines, the first line's fingerprint and the last one's. */
export const sealOf = (count, first, last) => (count > 0 ? `${count}:${first}:${last}` : '');

/**
 * @param {{file: string, readSeal: () => string, writeSeal: (seal: string) => void, isBroken?: () => boolean, markBroken?: () => void, now?: () => number}} options
 *   `file`: records.jsonl in Tuner Plus's folder; the seal and the broken flag are kept in Tuner Plus's state.
 */
export function openRecords({ file, readSeal, writeSeal, isBroken = () => false, markBroken = () => {}, now = () => Date.now() }) {
  /** @returns {{events: object[], intact: boolean, count: number, first: string, last: string}} every event, whether the record holds, its seal parts. */
  const read = () => {
    let text = '';
    try {
      text = existsSync(file) ? readFileSync(file, 'utf8') : '';
    } catch {
      return { events: [], intact: false, count: 0, first: '', last: '' };
    }
    const seal = String(readSeal() ?? '');
    const all = text.split('\n').filter((line) => line.length > 0);
    const lines = all.slice(-RECORD_MAX);
    const events = [];
    let previous = '';
    let intact = !isBroken();
    lines.forEach((line, index) => {
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        intact = false;
        return;
      }
      // Every line links to the one before it; the very first line to none (only lines cut by the limit leave a gap).
      if ((index > 0 || all.length <= RECORD_MAX) && event?.prev !== previous) intact = false;
      if (!event || !EVENT_KINDS.includes(event.kind)) intact = false;
      else events.push(event);
      previous = hashOf(line);
    });
    const first = all.length > 0 ? hashOf(all[0]) : '';
    if (sealOf(all.length, first, previous) !== seal) intact = false;
    if (!intact) markBroken();
    return { events, intact, count: all.length, first, last: previous };
  };
  /**
   * Add events (Tuner Plus alone writes here). Nothing is added to a broken record: writing on would make
   * the change look like Tuner Plus's own. `added` is 0 then; the owner starts a new record on the page.
   * @returns {number} the lines added.
   */
  const add = (events) => {
    const list = (Array.isArray(events) ? events : [events]).filter((event) => EVENT_KINDS.includes(event?.kind));
    if (list.length === 0) return 0;
    const now_ = read();
    if (!now_.intact) return 0;
    let previous = now_.last;
    const lines = list.map((event) => {
      const line = JSON.stringify({ ...event, at: event.at ?? now(), prev: previous });
      previous = hashOf(line);
      return line;
    });
    appendLines(file, lines);
    writeSeal(sealOf(now_.count + lines.length, now_.count > 0 ? now_.first : hashOf(lines[0]), previous));
    return lines.length;
  };
  return { read, add };
}

/**
 * What the records say about each key: when it was first seen and with which fingerprint, its newest
 * stamp, and the owner's newest sorting. With a broken chain, stamps and sortings are left out.
 * @param {{events: object[], intact: boolean}} records - from read().
 * @returns {Map<string, {first?: object, stamp?: object, sorted?: object, fps: Set<string>}>}
 */
export function indexRecords({ events, intact }) {
  const byKey = new Map();
  const slot = (key) => {
    if (!byKey.has(key)) byKey.set(key, { fps: new Set() });
    return byKey.get(key);
  };
  for (const event of events) {
    if (event.kind === 'seen' && typeof event.key === 'string') {
      const one = slot(event.key);
      if (!one.first) one.first = { fp: event.fp, at: event.at, from: event.from, by: event.by };
      if (event.fp) one.fps.add(event.fp);
      // A skill that moved or was renamed keeps what its old place's record said.
      const old = typeof event.from === 'string' ? byKey.get(event.from) : undefined;
      if (old && old !== one) {
        if (intact && old.stamp && !one.stamp) one.stamp = old.stamp;
        if (intact && old.sorted && !one.sorted) one.sorted = old.sorted;
        for (const fp of old.fps) one.fps.add(fp);
      }
    } else if (event.kind === 'stamp' && intact && typeof event.key === 'string') {
      const one = slot(event.key);
      one.stamp = event;
      if (event.fp) one.fps.add(event.fp);
    } else if (event.kind === 'sorted' && intact && Array.isArray(event.keys)) {
      for (const key of event.keys) {
        if (typeof key !== 'string') continue;
        const fp = typeof event.fps?.[key] === 'string' ? event.fps[key] : undefined;
        slot(key).sorted = { mark: event.mark, at: event.at, fp };
        if (fp) slot(key).fps.add(fp);
      }
    }
  }
  return byKey;
}
