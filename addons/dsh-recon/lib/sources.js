/**
 * What a Recon conversation has done: every search, every source it read, and the text of those
 * sources for as long as the app runs. Kept in memory only; after a restart it is rebuilt from the
 * saved conversation (lib/restore.js). It gives each source a number ([S3]), hands its text out in
 * parts, and writes citations and the research log.
 */
import { createHash } from 'node:crypto';

export const PART = 12_000;

/** How a source reached Recon, for its citation. */
const ROUTE = { Tor: 'through Tor', Usenet: 'through Usenet', direct: 'directly from the Internet Archive, not through Tor', wireguard: 'through WireGuard', 'web-direct': 'directly, not through Tor or WireGuard (the user allowed it for the conversation)' };

/** @returns {object} the record of all Recon conversations. */
export function openSources() {
  /** conversation id -> { sources: [], log: [], dropped: number, fetches: number, floor: number } */
  const all = new Map();
  const of = (id) => {
    const key = String(id);
    if (!all.has(key)) all.set(key, { sources: [], log: [], notes: [], dropped: 0, fetches: 0, floor: 0 });
    return all.get(key);
  };
  const stamp = (at) => new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
  /** The next free number: above every source kept and every number the saved conversation used. */
  const next = (entry) => Math.max(entry.floor, 0, ...entry.sources.map((source) => source.n)) + 1;
  return {
    /** One more request went out for this conversation. @returns {number} how many so far. */
    count: (id) => (of(id).fetches += 1),
    /** A line for the research log. */
    note(id, kind, detail, at = Date.now()) {
      const entry = of(id);
      if (entry.log.length < 2000) entry.log.push({ at, kind, detail: String(detail).slice(0, 700) });
    },
    /** Results or pages were left out by the filters. Only the count is kept. */
    dropped(id, n = 1) {
      of(id).dropped += n;
    },
    /**
     * Keep a source that was read.
     * @returns {object} the source, with its number.
     */
    keep(id, { kind, url, title, text, bytes, cut, author = '', date = '', group = '', messageId = '', original = '', captured = '', via = '' }, at = Date.now()) {
      const entry = of(id);
      const again = entry.sources.find((source) => source.url === url && source.kind === kind);
      const body = String(text ?? '');
      const route = ROUTE[via] ? via : kind === 'usenet' ? 'Usenet' : 'Tor';
      const made = { n: again?.n ?? next(entry), kind, url, title: String(title ?? '').slice(0, 300), text: body, bytes, cut: Boolean(cut), author, date, group, messageId, original, captured, via: route, at, retrieved: stamp(at), sha256: createHash('sha256').update(body).digest('hex') };
      if (again) entry.sources[entry.sources.indexOf(again)] = made;
      else entry.sources.push(made);
      return made;
    },
    /**
     * Put back what the saved conversation shows (lib/restore.js) after the app restarted. A source
     * read since then keeps its place; a rebuilt one keeps its number.
     * @param {object} found - `sources` and `floor`, as findingsIn gives them.
     * @returns {number} how many sources were put back.
     */
    restore(id, { sources: found = [], floor = 0, notes = [] } = {}) {
      const entry = of(id);
      let added = 0;
      for (const source of found) {
        if (!Number.isInteger(source?.n) || source.n < 1) continue;
        if (entry.sources.some((one) => one.n === source.n || (one.url === source.url && one.kind === source.kind))) continue;
        entry.sources.push({ ...source, via: ROUTE[source.via] ? source.via : source.kind === 'usenet' ? 'Usenet' : 'Tor', text: String(source.text ?? ''), restored: true });
        added += 1;
      }
      entry.sources.sort((a, b) => a.n - b.n);
      entry.floor = Math.max(entry.floor, Number(floor) || 0);
      // The saved conversation holds everything the assistant wrote, also what was kept since the
      // start; a note kept since then keeps its time. Earlier ones have no time (at 0).
      if (notes.length > 0) {
        const since = new Map(entry.notes.map((note) => [note.text, note]));
        const merged = notes.map((text) => String(text ?? '').trim().slice(0, 60_000)).filter(Boolean).map((text) => since.get(text) ?? { at: 0, text });
        const kept = new Set(merged);
        entry.notes = [...merged, ...entry.notes.filter((note) => !kept.has(note))].slice(-400);
      }
      return added;
    },
    /** @returns {object | undefined} a source by its number ("S3", 3), its address or its Message-ID. */
    find(id, key) {
      const text = String(key ?? '').trim();
      const n = Number(/^\[?s?(\d{1,4})\]?$/i.exec(text)?.[1]);
      const { sources } = of(id);
      return sources.find((source) => (n ? source.n === n : source.url === text || source.url === `${text}/` || (source.messageId && source.messageId === text)));
    },
    /** @returns {{text: string, part: number, parts: number}} one part of a source's text. */
    part(source, part = 1) {
      const parts = Math.max(1, Math.ceil(source.text.length / PART));
      const wanted = Math.min(Math.max(1, Math.floor(Number(part)) || 1), parts);
      return { text: source.text.slice((wanted - 1) * PART, wanted * PART), part: wanted, parts };
    },
    /** @returns {string} the full citation of a source. */
    cite(source) {
      const where = source.kind === 'usenet' ? `Usenet, ${source.group}, Message-ID ${source.messageId}`
        : source.kind === 'archive' ? `${source.original}, as captured by the Internet Archive at timestamp ${source.captured} (${source.url})` : source.url;
      const route = ROUTE[source.via] ?? (source.kind === 'usenet' ? ROUTE.Usenet : ROUTE.Tor);
      const print = source.sha256 ? `Text fingerprint (SHA-256): ${source.sha256}` : `Text fingerprint (SHA-256), its first 16 characters: ${source.prefix ?? ''}…`;
      return [
        `[S${source.n}] ${source.title || '(no title)'}`,
        `Source: ${where}`,
        source.author ? `Author as shown: ${source.author}` : '',
        source.date ? `Date as shown: ${source.date}` : '',
        `Retrieved: ${source.retrieved} (UTC), ${route}`,
        `${print}${source.cut ? ' (the page was longer; only its first part was read)' : ''}`,
        source.restored ? `Rebuilt from the saved conversation after the app restarted${source.partial ? '; not all of its text was in the conversation' : ''}.` : '',
      ].filter(Boolean).join('\n');
    },
    /** @returns {string} the research log: every search and every source, in order. */
    log(id) {
      const entry = of(id);
      if (entry.log.length === 0) return 'Nothing was searched or read in this conversation yet.';
      return [...entry.log.map((line) => `${stamp(line.at)}  ${line.kind}: ${line.detail}`), entry.dropped > 0 ? `Left out by the filters: ${entry.dropped} (not kept, not opened).` : ''].filter(Boolean).join('\n');
    },
    /** Keep something the assistant wrote in this conversation, for the export. */
    say(id, text, at = Date.now(), { helper = false } = {}) {
      const entry = of(id);
      const body = String(text ?? '').trim();
      // A Long run helper's answer is marked: it is kept for /recon export, never for the export door.
      if (body && entry.notes.length < 400) entry.notes.push({ at, text: body.slice(0, 60_000), ...(helper ? { helper: true } : {}) });
    },
    notes: (id) => [...of(id).notes],
    /** @returns {object[]} every source with its text, in the order read. */
    full: (id) => [...of(id).sources],
    /** @returns {boolean} whether anything is kept for the conversation. */
    known: (id) => all.has(String(id)),
    /** @returns {number} how many sources the conversation read; adds no entry for an unknown one. (`count` is the request counter.) */
    readCount: (id) => all.get(String(id))?.sources.length ?? 0,
    /** @returns {boolean} whether the conversation has an entry with nothing in it (no source, log, note or fetch). */
    empty: (id) => {
      const entry = all.get(String(id));
      return Boolean(entry) && entry.sources.length === 0 && entry.log.length === 0 && entry.notes.length === 0 && !entry.fetches && !entry.dropped;
    },
    list: (id) => of(id).sources.map((source) => ({ n: source.n, kind: source.kind, url: source.url, title: source.title, retrieved: source.retrieved })),
    forget: (id) => all.delete(String(id)),
  };
}
