/**
 * What a conversation found: every posting gets a short number (P1, P2, ...) so the model can
 * read, compare and cite it. Duplicates from different sources are merged. Each conversation's
 * list is also kept in a small file, so a conversation reopened after a restart goes on with the
 * same numbers instead of giving P1 to a different job.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonStore } from './json-store.js';

const PER_CONVERSATION = 1500;
const CONVERSATIONS = 50;
const REQUESTS = 400;
/** Files kept on disk: the newest ones; older conversations start their numbering afresh. */
const FILES = 200;
/** Report names a conversation saved, remembered so they are not its own "earlier reports". */
const REPORTS = 50;
/** Other posting dates kept for one job found again. */
const DATES = 10;

const norm = (text) => String(text ?? '').toLowerCase().normalize('NFKD').replace(/\(?[mwfd]\s*\/\s*[mwfd](\s*\/\s*[mwfd])?\)?/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** The key two postings share when they are the same job. */
export function sameJob(posting) {
  const city = norm(posting.location).split(' ')[0] ?? '';
  return `${norm(posting.title)}|${norm(posting.company)}|${city}`;
}

/** The postings a conversation found, as kept in its file, with the lookup rebuilt. */
function fromSaved(saved) {
  const list = Array.isArray(saved?.list) ? saved.list.filter((posting) => posting && Number.isInteger(posting.n)).slice(0, PER_CONVERSATION) : [];
  const byKey = new Map();
  for (const posting of list) {
    if (posting.url) byKey.set(posting.url, posting);
    if (norm(posting.title)) byKey.set(sameJob(posting), posting);
  }
  const reports = Array.isArray(saved?.reports) ? saved.reports.filter((name) => typeof name === 'string').slice(-REPORTS) : [];
  return { list, byKey, requests: Number.isInteger(saved?.requests) ? saved.requests : 0, reports };
}

/**
 * @param {string} [folder] - where each conversation's postings are kept. Empty: memory only.
 */
export function openStore(folder = '') {
  /** conversation id -> { list, byKey, requests } */
  const all = new Map();
  // The file name is a hash of the conversation id, so no id can point outside the folder.
  const fileOf = (id) => (folder ? join(folder, `${createHash('sha256').update(String(id)).digest('hex').slice(0, 32)}.json`) : '');
  const load = (id) => {
    try {
      const file = fileOf(id);
      const saved = file ? readJsonStore(file, () => undefined, { label: 'what Scout kept for a conversation' }) : undefined;
      if (saved !== undefined) return fromSaved(saved);
    } catch {
      /* a record that cannot be turned into a list: start afresh */
    }
    return { list: [], byKey: new Map(), requests: 0, reports: [] };
  };
  const save = (id, entry) => {
    const file = fileOf(id);
    if (!file) return;
    try {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      // Written beside it and then moved over it, so a crash mid-write never leaves a broken file.
      const part = `${file}.part`;
      writeFileSync(part, JSON.stringify({ list: entry.list, requests: entry.requests, reports: entry.reports }), { mode: 0o600 });
      renameSync(part, file);
    } catch {
      /* the numbers still hold for this run */
    }
  };
  // Only the newest files are kept.
  try {
    if (folder && existsSync(folder)) {
      const files = readdirSync(folder).filter((name) => name.endsWith('.json')).map((name) => ({ path: join(folder, name), at: statSync(join(folder, name)).mtimeMs })).sort((a, b) => b.at - a.at);
      for (const old of files.slice(FILES)) unlinkSync(old.path);
    }
  } catch {
    /* tidying is a convenience */
  }
  const of = (id) => {
    let entry = all.get(id);
    if (!entry) {
      if (all.size >= CONVERSATIONS) all.delete(all.keys().next().value);
      entry = load(id);
      all.set(id, entry);
    }
    return entry;
  };
  return {
    /** The file a conversation's postings are kept in ('' in memory only). */
    fileOf,
    /** Remove a conversation's postings for good (Scratch: deleted for good). */
    remove(id) {
      all.delete(id);
      const file = fileOf(id);
      try {
        if (file && existsSync(file)) unlinkSync(file);
      } catch {
        /* nothing more to do */
      }
    },
    /** Count one request; throws when the conversation reached its limit. */
    request(id) {
      const entry = of(id);
      if (entry.requests >= REQUESTS) throw new Error(`this conversation made ${REQUESTS} requests, which is its limit. Start a new Scout conversation to go on`);
      entry.requests += 1;
      // Saved at once, so the count holds after a restart even when nothing new was kept.
      save(id, entry);
    },
    /**
     * Keep postings and give each its number. A posting already known (same address, or same
     * title, company and town) keeps its number and gains the other source; another posting date
     * it is found with is kept in `dates`, so a real repost can be told.
     * @returns {{posting: object, fresh: boolean}[]} in the given order.
     */
    add(id, source, postings) {
      const entry = of(id);
      const kept = postings.map((raw) => {
        const key = sameJob(raw);
        const known = entry.byKey.get(raw.url) ?? entry.byKey.get(key);
        if (known) {
          if (!known.sources.includes(source)) known.sources.push(source);
          const date = typeof raw.posted === 'string' ? raw.posted.slice(0, 30) : '';
          if (date && date !== known.posted && !(known.dates ?? []).includes(date)) known.dates = [...(known.dates ?? []), date].slice(-DATES);
          return { posting: known, fresh: false };
        }
        if (entry.list.length >= PER_CONVERSATION) return undefined;
        const posting = { ...raw, n: entry.list.length + 1, source, sources: [source] };
        entry.list.push(posting);
        if (raw.url) entry.byKey.set(raw.url, posting);
        if (norm(raw.title)) entry.byKey.set(key, posting);
        return { posting, fresh: true };
      }).filter(Boolean);
      if (kept.length > 0) save(id, entry);
      return kept;
    },
    /** A posting by its number ("P12", "12"). */
    get(id, ref) {
      const n = Number(String(ref ?? '').replace(/^p/i, ''));
      return Number.isInteger(n) && n > 0 ? of(id).list[n - 1] : undefined;
    },
    /** Add what was learned about a posting (for example the checks on its text) and keep it. */
    note(id, ref, fields) {
      const posting = this.get(id, ref);
      if (!posting) return undefined;
      Object.assign(posting, fields);
      save(id, of(id));
      return posting;
    },
    /** The same fields for several postings, kept with one write. @returns {number} how many were found. */
    noteAll(id, refs, fields) {
      const found = refs.map((ref) => this.get(id, ref)).filter(Boolean);
      for (const posting of found) Object.assign(posting, fields);
      if (found.length > 0) save(id, of(id));
      return found.length;
    },
    /** Remember a report this conversation saved. */
    saved(id, name) {
      const entry = of(id);
      entry.reports = [...entry.reports.filter((item) => item !== name), String(name)].slice(-REPORTS);
      save(id, entry);
    },
    /** The reports this conversation saved: never its own "earlier reports". */
    reports: (id) => [...of(id).reports],
    count: (id) => of(id).list.length,
    /** Every posting found in a conversation, in order. */
    all: (id) => [...of(id).list],
    /** Drop a conversation from memory; its file stays, for when it is reopened. */
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
    `   ${[posting.location, posting.remote, posting.type, posting.pay ? `pay: ${posting.pay}` : posting.value ? `contract value: ${posting.value}` : 'no pay given', `${when}${first}`, posting.closes ? `closes ${posting.closes}` : ''].filter(Boolean).join(' · ')}`,
    `   ${posting.url}${posting.sources.length > 1 ? `  (also on: ${posting.sources.slice(1).join(', ')})` : ''}`,
    posting.snippet ? `   ${posting.snippet}` : '',
  ].filter(Boolean).join('\n');
}

/** Untrusted text from a source, marked as such. */
export const fence = (text) => `<<<UNTRUSTED SOURCE TEXT\n${String(text).replace(/<<<UNTRUSTED SOURCE TEXT|UNTRUSTED SOURCE TEXT>>>/g, '[removed]')}\nUNTRUSTED SOURCE TEXT>>>`;
