/**
 * What a conversation found: every posting gets a short number (P1, P2, ...) so the model can
 * read, compare and cite it. Duplicates from different sources are merged. Kept in memory only;
 * the report file is what stays.
 */

const PER_CONVERSATION = 1500;
const CONVERSATIONS = 50;
const REQUESTS = 400;

const norm = (text) => String(text ?? '').toLowerCase().normalize('NFKD').replace(/\(?[mwfd]\s*\/\s*[mwfd](\s*\/\s*[mwfd])?\)?/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The key two postings share when they are the same job. */
export function sameJob(posting) {
  const city = norm(posting.location).split(' ')[0] ?? '';
  return `${norm(posting.title)}|${norm(posting.company)}|${city}`;
}

export function openStore() {
  /** conversation id -> { list, byKey, requests } */
  const all = new Map();
  const of = (id) => {
    let entry = all.get(id);
    if (!entry) {
      if (all.size >= CONVERSATIONS) all.delete(all.keys().next().value);
      entry = { list: [], byKey: new Map(), requests: 0 };
      all.set(id, entry);
    }
    return entry;
  };
  return {
    /** Count one request; throws when the conversation reached its limit. */
    request(id) {
      const entry = of(id);
      if (entry.requests >= REQUESTS) throw new Error(`this conversation made ${REQUESTS} requests, which is its limit. Start a new Scout conversation to go on`);
      entry.requests += 1;
    },
    /**
     * Keep postings and give each its number. A posting already known (same address, or same
     * title, company and town) keeps its number and gains the other source.
     * @returns {{posting: object, fresh: boolean}[]} in the given order.
     */
    add(id, source, postings) {
      const entry = of(id);
      return postings.map((raw) => {
        const key = sameJob(raw);
        const known = entry.byKey.get(raw.url) ?? entry.byKey.get(key);
        if (known) {
          if (!known.sources.includes(source)) known.sources.push(source);
          return { posting: known, fresh: false };
        }
        if (entry.list.length >= PER_CONVERSATION) return undefined;
        const posting = { ...raw, n: entry.list.length + 1, source, sources: [source] };
        entry.list.push(posting);
        if (raw.url) entry.byKey.set(raw.url, posting);
        if (norm(raw.title)) entry.byKey.set(key, posting);
        return { posting, fresh: true };
      }).filter(Boolean);
    },
    /** A posting by its number ("P12", "12"). */
    get(id, ref) {
      const n = Number(String(ref ?? '').replace(/^p/i, ''));
      return Number.isInteger(n) && n > 0 ? of(id).list[n - 1] : undefined;
    },
    count: (id) => of(id).list.length,
    /** Every posting found in a conversation, in order. */
    all: (id) => [...of(id).list],
    forget: (id) => all.delete(id),
  };
}

/** One posting as a line in a result list. */
export function line(posting, today = Date.now()) {
  const age = posting.posted ? Math.round((today - Date.parse(posting.posted)) / 86_400_000) : NaN;
  const when = posting.posted ? `posted ${posting.posted}${Number.isFinite(age) && age >= 0 ? ` (${age} day${age === 1 ? '' : 's'} ago)` : ''}` : 'posting date not given';
  const first = posting.firstPosted && posting.firstPosted !== posting.posted ? `, first posted ${posting.firstPosted}` : '';
  return [
    `P${posting.n} · ${posting.title || '(no title)'}${posting.company ? ` — ${posting.company}` : ''}`,
    `   ${[posting.location, posting.remote, posting.type, posting.pay ? `pay: ${posting.pay}` : 'no pay given', `${when}${first}`].filter(Boolean).join(' · ')}`,
    `   ${posting.url}${posting.sources.length > 1 ? `  (also on: ${posting.sources.slice(1).join(', ')})` : ''}`,
    posting.snippet ? `   ${posting.snippet}` : '',
  ].filter(Boolean).join('\n');
}

/** Untrusted text from a source, marked as such. */
export const fence = (text) => `<<<UNTRUSTED SOURCE TEXT\n${String(text).replace(/<<<UNTRUSTED SOURCE TEXT|UNTRUSTED SOURCE TEXT>>>/g, '[removed]')}\nUNTRUSTED SOURCE TEXT>>>`;
