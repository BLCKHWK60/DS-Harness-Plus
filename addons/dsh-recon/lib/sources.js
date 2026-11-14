/**
 * What a Recon conversation has done: every search, every source it read, and the text of those
 * sources for as long as the app runs. Kept in memory only. It gives each source a number ([S3]),
 * hands its text out in parts, and writes citations and the research log.
 */
import { createHash } from 'node:crypto';

export const PART = 12_000;

/** @returns {object} the record of all Recon conversations. */
export function openSources() {
  /** conversation id -> { sources: [], log: [], dropped: number, fetches: number } */
  const all = new Map();
  const of = (id) => {
    const key = String(id);
    if (!all.has(key)) all.set(key, { sources: [], log: [], dropped: 0, fetches: 0 });
    return all.get(key);
  };
  const stamp = (at) => new Date(at).toISOString().replace(/\.\d{3}Z$/, 'Z');
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
    keep(id, { kind, url, title, text, bytes, cut, author = '', date = '', group = '', messageId = '' }, at = Date.now()) {
      const entry = of(id);
      const again = entry.sources.find((source) => source.url === url && source.kind === kind);
      const body = String(text ?? '');
      const made = { n: again?.n ?? entry.sources.length + 1, kind, url, title: String(title ?? '').slice(0, 300), text: body, bytes, cut: Boolean(cut), author, date, group, messageId, at, retrieved: stamp(at), sha256: createHash('sha256').update(body).digest('hex') };
      if (again) entry.sources[entry.sources.indexOf(again)] = made;
      else entry.sources.push(made);
      return made;
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
      const where = source.kind === 'usenet' ? `Usenet, ${source.group}, Message-ID ${source.messageId}` : source.url;
      return [
        `[S${source.n}] ${source.title || '(no title)'}`,
        `Source: ${where}`,
        source.author ? `Author as shown: ${source.author}` : '',
        source.date ? `Date as shown: ${source.date}` : '',
        `Retrieved: ${source.retrieved} (UTC), through ${source.kind === 'usenet' ? 'Usenet' : 'Tor'}`,
        `Text fingerprint (SHA-256): ${source.sha256}${source.cut ? ' (the page was longer; only its first part was read)' : ''}`,
      ].filter(Boolean).join('\n');
    },
    /** @returns {string} the research log: every search and every source, in order. */
    log(id) {
      const entry = of(id);
      if (entry.log.length === 0) return 'Nothing was searched or read in this conversation yet.';
      return [...entry.log.map((line) => `${stamp(line.at)}  ${line.kind}: ${line.detail}`), entry.dropped > 0 ? `Left out by the filters: ${entry.dropped} (not kept, not opened).` : ''].filter(Boolean).join('\n');
    },
    list: (id) => of(id).sources.map((source) => ({ n: source.n, kind: source.kind, url: source.url, title: source.title, retrieved: source.retrieved })),
    forget: (id) => all.delete(String(id)),
  };
}
