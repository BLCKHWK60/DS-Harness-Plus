/**
 * The Library's index: which folders, which documents, and their words, searchable.
 *
 * One SQLite file with a full-text table (FTS5), using the database built into the app's runtime.
 * Words are matched by their stem, so "cars" finds "car", and without accents, so "economie" finds
 * "économie". Kept apart from the plugin so it can be tested without the app.
 */
import { mkdirSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, resolve, sep } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/** Most passages one search returns, and most from one document. */
export const SEARCH_MAX = 20;
export const PER_FILE = 3;
/** About how much text one "read more" returns, in characters. */
export const READ_CHARS = 6000;

/**
 * A search typed by a person or a model, as a full-text query.
 * Words are joined with AND (`all` true) or OR; text in double quotes stays a phrase.
 * @param {unknown} text - the search.
 * @param {boolean} [all] - whether every word must be present.
 * @returns {string} the query; '' when there is nothing to search for.
 */
export function ftsQuery(text, all = true) {
  const terms = [];
  for (const match of String(text ?? '').matchAll(/"([^"]+)"|([\p{L}\p{N}]+)/gu)) {
    const words = (match[1] ?? match[2]).match(/[\p{L}\p{N}]+/gu) ?? [];
    if (words.length > 0) terms.push(`"${words.join(' ')}"`);
    if (terms.length >= 16) break;
  }
  return terms.join(all ? ' ' : ' OR ');
}

/**
 * A folder the owner typed or picked, checked.
 * @param {unknown} raw - the path; may start with `~`.
 * @param {{existing?: string[], home?: string, forbidden?: string[]}} [rules] - folders already in the Library, the home folder, and folders that may not be added.
 * @returns {{path: string} | {error: string}} the real path, or why not.
 */
export function checkFolder(raw, rules = {}) {
  const home = rules.home ?? homedir();
  let text = String(raw ?? '').trim();
  if (!text) return { error: 'Type or choose a folder.' };
  if (text === '~') text = home;
  else if (text.startsWith('~/')) text = home + text.slice(1);
  if (!text.startsWith('/')) return { error: 'Give the folder\'s full path, starting with / or ~.' };
  let path;
  try {
    path = realpathSync(resolve(text));
    if (!statSync(path).isDirectory()) return { error: 'That is a file, not a folder.' };
  } catch {
    return { error: 'That folder does not exist.' };
  }
  const inside = (child, parent) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
  let realHome = home;
  try {
    realHome = realpathSync(home);
  } catch {
    /* keep the given home */
  }
  if (path === '/' || path === realHome || inside(realHome, path)) return { error: 'That is too much: choose a folder inside your home folder, such as Documents or a course folder.' };
  for (const no of rules.forbidden ?? []) if (inside(path, no) || inside(no, path)) return { error: 'That folder belongs to the app itself and cannot be added.' };
  for (const other of rules.existing ?? []) {
    if (path === other) return { error: 'That folder is already in the Library.' };
    if (inside(path, other)) return { error: `That folder is already covered: it is inside ${other}.` };
    if (inside(other, path)) return { error: `It contains a folder that is already in the Library (${other}). Remove that one first.` };
  }
  return { path };
}

/**
 * Open the index.
 * @param {string} file - the SQLite file, or ':memory:'.
 * @returns {object} the index.
 */
export function openLibrary(file) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS folders (path TEXT PRIMARY KEY, added_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY, folder TEXT NOT NULL, path TEXT NOT NULL UNIQUE, mtime INTEGER NOT NULL, size INTEGER NOT NULL,
      state TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', pieces INTEGER NOT NULL DEFAULT 0, indexed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS files_folder ON files (folder);
    CREATE VIRTUAL TABLE IF NOT EXISTS passages USING fts5 (text, file_id UNINDEXED, seq UNINDEXED, place UNINDEXED, tokenize = 'porter unicode61 remove_diacritics 2');
  `);
  const q = {
    folders: db.prepare('SELECT path, added_at AS addedAt FROM folders ORDER BY added_at, path'),
    addFolder: db.prepare('INSERT OR IGNORE INTO folders (path, added_at) VALUES (?, ?)'),
    dropFolder: db.prepare('DELETE FROM folders WHERE path = ?'),
    known: db.prepare('SELECT path, mtime, size FROM files WHERE folder = ?'),
    fileByPath: db.prepare('SELECT id, folder, path, state, pieces FROM files WHERE path = ?'),
    dropPieces: db.prepare('DELETE FROM passages WHERE file_id = ?'),
    dropFile: db.prepare('DELETE FROM files WHERE id = ?'),
    putFile: db.prepare('INSERT INTO files (folder, path, mtime, size, state, note, pieces, indexed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
    putPiece: db.prepare('INSERT INTO passages (text, file_id, seq, place) VALUES (?, ?, ?, ?)'),
    folderIds: db.prepare('SELECT id FROM files WHERE folder = ?'),
    stats: db.prepare('SELECT folder, state, COUNT(*) AS files, COALESCE(SUM(pieces), 0) AS pieces, MAX(indexed_at) AS at FROM files GROUP BY folder, state'),
    problems: db.prepare("SELECT path, state, note FROM files WHERE state != 'ok' ORDER BY indexed_at DESC LIMIT ?"),
    search: db.prepare(`
      SELECT files.path AS path, files.folder AS folder, passages.place AS place, passages.seq AS seq, passages.text AS text, bm25(passages) AS score
      FROM passages JOIN files ON files.id = passages.file_id
      WHERE passages MATCH ? AND files.path LIKE ? ESCAPE '\\'
      ORDER BY score LIMIT 200`),
    read: db.prepare('SELECT seq, place, text FROM passages WHERE file_id = ? AND seq >= ? ORDER BY seq LIMIT 40'),
  };

  const drop = (path) => {
    const row = q.fileByPath.get(path);
    if (!row) return;
    q.dropPieces.run(row.id);
    q.dropFile.run(row.id);
  };
  const inTransaction = (work) => {
    db.exec('BEGIN');
    try {
      const value = work();
      db.exec('COMMIT');
      return value;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  const like = (prefix) => `${String(prefix).replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

  return {
    /** The folders in the Library. */
    folders: () => q.folders.all().map((row) => ({ path: String(row.path), addedAt: Number(row.addedAt) })),

    addFolder(path, now = Date.now()) {
      q.addFolder.run(path, now);
    },

    /** Take a folder out, with everything indexed from it. The folder itself is not touched. */
    removeFolder(path) {
      inTransaction(() => {
        for (const row of q.folderIds.all(path)) q.dropPieces.run(row.id);
        db.prepare('DELETE FROM files WHERE folder = ?').run(path);
        q.dropFolder.run(path);
      });
    },

    /**
     * What is indexed from a folder.
     * @param {string} folder - the folder.
     * @returns {Map<string, {mtime: number, size: number}>} by path.
     */
    known(folder) {
      return new Map(q.known.all(folder).map((row) => [String(row.path), { mtime: Number(row.mtime), size: Number(row.size) }]));
    },

    /**
     * Index a document, replacing what was there.
     * @param {{folder: string, path: string, mtime: number, size: number}} file - the document.
     * @param {{where: string, text: string}[]} parts - its pieces; empty means it has no words.
     * @param {number} [now] - the current time.
     */
    put(file, parts, now = Date.now()) {
      inTransaction(() => {
        drop(file.path);
        const state = parts.length > 0 ? 'ok' : 'empty';
        const note = parts.length > 0 ? '' : 'No words found: probably a scan without a text layer.';
        const { lastInsertRowid } = q.putFile.run(file.folder, file.path, Math.round(file.mtime), file.size, state, note, parts.length, now);
        parts.forEach((part, seq) => q.putPiece.run(part.text, Number(lastInsertRowid), seq, part.where));
      });
    },

    /** Record that a document could not be read, so it is not tried again until it changes. */
    fail(file, reason, now = Date.now()) {
      inTransaction(() => {
        drop(file.path);
        q.putFile.run(file.folder, file.path, Math.round(file.mtime), file.size, 'failed', String(reason).slice(0, 200), 0, now);
      });
    },

    /** Forget a document that is gone. */
    drop(path) {
      inTransaction(() => drop(path));
    },

    /**
     * Search.
     * @param {unknown} text - the search.
     * @param {{folder?: string, limit?: number}} [options] - limit to one folder; how many passages.
     * @returns {{hits: object[], loose: boolean}} passages, best first; `loose` is true when not every word was found together.
     */
    search(text, options = {}) {
      const limit = Math.min(SEARCH_MAX, Math.max(1, Math.floor(Number(options.limit) || 8)));
      const prefix = like(options.folder ? String(options.folder) : '');
      const run = (query) => {
        if (!query) return [];
        const perFile = new Map();
        const hits = [];
        for (const row of q.search.all(query, prefix)) {
          const count = perFile.get(row.path) ?? 0;
          if (count >= PER_FILE) continue;
          perFile.set(row.path, count + 1);
          hits.push({ path: String(row.path), name: basename(String(row.path)), folder: String(row.folder), where: String(row.place), position: Number(row.seq), text: String(row.text) });
          if (hits.length >= limit) break;
        }
        return hits;
      };
      const strict = run(ftsQuery(text, true));
      if (strict.length > 0) return { hits: strict, loose: false };
      return { hits: run(ftsQuery(text, false)), loose: true };
    },

    /**
     * More of one document, from a position on.
     * @param {string} path - the document, as a search gave it.
     * @param {number} [position] - the piece to start at.
     * @returns {{text: string, next?: number, pieces: number} | undefined} the text; undefined when the document is not in the Library.
     */
    read(path, position = 0) {
      const file = q.fileByPath.get(String(path));
      if (!file || file.state !== 'ok') return undefined;
      const from = Math.max(0, Math.floor(Number(position) || 0));
      const lines = [];
      let size = 0;
      let next;
      let place = '';
      for (const row of q.read.all(file.id, from)) {
        if (size > 0 && size + String(row.text).length > READ_CHARS) {
          next = Number(row.seq);
          break;
        }
        if (row.place !== place) {
          place = String(row.place);
          lines.push(`[${place}]`);
        }
        lines.push(String(row.text), '');
        size += String(row.text).length;
        next = Number(row.seq) + 1;
      }
      if (next !== undefined && next >= Number(file.pieces)) next = undefined;
      return { text: lines.join('\n').trim(), next, pieces: Number(file.pieces) };
    },

    /**
     * Counts for the page.
     * @returns {Record<string, {ok: number, empty: number, failed: number, pieces: number, at: number}>} by folder.
     */
    stats() {
      const out = {};
      for (const row of q.stats.all()) {
        const entry = (out[row.folder] ??= { ok: 0, empty: 0, failed: 0, pieces: 0, at: 0 });
        entry[row.state] = Number(row.files);
        entry.pieces += Number(row.pieces);
        entry.at = Math.max(entry.at, Number(row.at) || 0);
      }
      return out;
    },

    /** Documents that could not be searched, newest first. */
    problems: (limit = 30) => q.problems.all(limit).map((row) => ({ path: String(row.path), state: String(row.state), note: String(row.note) })),

    close() {
      db.close();
    },
  };
}
