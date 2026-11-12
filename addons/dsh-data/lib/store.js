/**
 * What Data mode remembers: the queries of each conversation (so a number can be traced to the
 * query that produced it) and the saved analyses (so they can be run again and compared).
 * Kept apart from the plugin so it can be tested without the app.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const QUERIES_PER_CONVERSATION = 200;
export const CONVERSATIONS_MAX = 300;
export const ANALYSES_MAX = 100;
/** Most rows of a result kept for comparing later. */
export const SNAPSHOT_ROWS = 200;
/** Most lines one comparison reports. */
export const CHANGES_MAX = 40;

function load(file) {
  try {
    const read = JSON.parse(readFileSync(file, 'utf8'));
    return read && typeof read === 'object' && !Array.isArray(read) ? read : {};
  } catch {
    return {};
  }
}

function save(file, value) {
  if (!file) return;
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value));
  renameSync(temp, file);
}

/**
 * A name as one plain line.
 * @param {unknown} value - what was given.
 * @returns {string} the cleaned name.
 */
export const cleanName = (value) => String(value ?? '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/**
 * @param {string} queriesFile - JSON file for the queries; '' keeps them in memory.
 * @param {string} analysesFile - JSON file for the saved analyses; '' keeps them in memory.
 * @returns {object} the store.
 */
export function openStore(queriesFile, analysesFile) {
  const queries = load(queriesFile);
  const analyses = load(analysesFile);
  return {
    /**
     * Record a query and give it its number in the conversation.
     * @param {string} conversation - the conversation's id.
     * @param {{sql: string, files: string[], total: number}} query - what ran.
     * @param {number} [now] - the time.
     * @returns {string} the id, such as `Q7`.
     */
    record(conversation, query, now = Date.now()) {
      const key = String(conversation);
      const entry = queries[key] ?? { next: 1, list: [] };
      delete queries[key];
      queries[key] = entry;
      const id = `Q${entry.next}`;
      entry.next += 1;
      entry.list.push({ id, sql: String(query.sql), files: [...query.files], rows: Number(query.total) || 0, at: now });
      if (entry.list.length > QUERIES_PER_CONVERSATION) entry.list.splice(0, entry.list.length - QUERIES_PER_CONVERSATION);
      const keys = Object.keys(queries);
      for (const old of keys.slice(0, Math.max(0, keys.length - CONVERSATIONS_MAX))) delete queries[old];
      save(queriesFile, queries);
      return id;
    },
    /** @returns {object | undefined} a conversation's query by its id (case does not matter). */
    query(conversation, id) {
      const wanted = String(id ?? '').trim().toUpperCase();
      return queries[String(conversation)]?.list.find((entry) => entry.id === wanted);
    },
    /** @returns {object[]} a conversation's queries, oldest first. */
    queries(conversation) {
      return [...(queries[String(conversation)]?.list ?? [])];
    },
    /** @returns {object[]} the saved analyses, newest first. */
    analyses() {
      return Object.values(analyses).sort((a, b) => (b.ranAt ?? 0) - (a.ranAt ?? 0));
    },
    /** @returns {object | undefined} a saved analysis by name (case does not matter). */
    analysis(name) {
      return analyses[cleanName(name).toLowerCase()];
    },
    /**
     * Save or replace an analysis.
     * @param {object} analysis - `{ name, folder, steps: [{ label, sql, files, result }], prints, ranAt }`.
     */
    put(analysis) {
      const name = cleanName(analysis.name);
      if (!name) throw new Error('Give the analysis a name.');
      const key = name.toLowerCase();
      if (!analyses[key] && Object.keys(analyses).length >= ANALYSES_MAX) throw new Error(`There are already ${ANALYSES_MAX} saved analyses. Remove one in Settings → Data first.`);
      analyses[key] = { ...analysis, name };
      save(analysesFile, analyses);
      return analyses[key];
    },
    /** @returns {boolean} whether there was one to remove. */
    remove(name) {
      const key = cleanName(name).toLowerCase();
      if (!analyses[key]) return false;
      delete analyses[key];
      save(analysesFile, analyses);
      return true;
    },
  };
}

/**
 * A result cut down to what is kept for comparing later.
 * @param {{columns: string[], rows: any[][], total: number}} result - a query's result.
 * @returns {{columns: string[], rows: any[][], total: number}} the snapshot.
 */
export const snapshot = (result) => ({ columns: [...result.columns], rows: result.rows.slice(0, SNAPSHOT_ROWS).map((row) => [...row]), total: result.total });

const text = (value) => (value === null || value === undefined ? '(empty)' : typeof value === 'number' ? String(Math.round(value * 1e6) / 1e6) : String(value).slice(0, 60));

function moved(before, after) {
  if (typeof before !== 'number' || typeof after !== 'number') return `${text(before)} → ${text(after)}`;
  const delta = after - before;
  const share = before !== 0 ? ` (${delta >= 0 ? '+' : ''}${Math.round((delta / Math.abs(before)) * 1000) / 10}%)` : '';
  return `${text(before)} → ${text(after)}, ${delta >= 0 ? '+' : ''}${text(delta)}${share}`;
}

/**
 * What changed between two results of the same query.
 * Rows are matched by their first column when its values are unique in both results, else by position.
 * @param {{columns: string[], rows: any[][], total: number}} before - the earlier snapshot.
 * @param {{columns: string[], rows: any[][], total: number}} after - the new snapshot.
 * @returns {string[]} one line per change; empty when nothing changed.
 */
export function compare(before, after) {
  const lines = [];
  if (before.columns.join('\u0001') !== after.columns.join('\u0001')) {
    return [`The columns changed: ${before.columns.join(', ') || '(none)'} → ${after.columns.join(', ') || '(none)'}. The rows are not compared.`];
  }
  if (before.total !== after.total) lines.push(`Rows: ${moved(before.total, after.total)}`);
  const keyed = (rows) => {
    const keys = rows.map((row) => text(row[0]));
    return new Set(keys).size === keys.length && after.columns.length > 1 ? new Map(rows.map((row, index) => [keys[index], row])) : undefined;
  };
  const was = keyed(before.rows);
  const now = keyed(after.rows);
  let hidden = 0;
  const add = (line) => {
    if (lines.length < CHANGES_MAX) lines.push(line);
    else hidden += 1;
  };
  if (was && now) {
    for (const [key, row] of now) {
      const old = was.get(key);
      if (!old) {
        add(`New: ${key} (${after.columns.slice(1).map((column, index) => `${column} ${text(row[index + 1])}`).join(', ')})`);
        continue;
      }
      for (let index = 1; index < after.columns.length; index += 1) {
        if (text(old[index]) !== text(row[index])) add(`${key}, ${after.columns[index]}: ${moved(old[index], row[index])}`);
      }
    }
    for (const key of was.keys()) if (!now.has(key)) add(`Gone: ${key}`);
  } else {
    const most = Math.max(before.rows.length, after.rows.length);
    for (let at = 0; at < most; at += 1) {
      const old = before.rows[at];
      const row = after.rows[at];
      if (!old) add(`New row ${at + 1}: ${row.map(text).join(', ')}`);
      else if (!row) add(`Row ${at + 1} is gone: ${old.map(text).join(', ')}`);
      else {
        for (let index = 0; index < after.columns.length; index += 1) {
          if (text(old[index]) !== text(row[index])) add(`Row ${at + 1}, ${after.columns[index]}: ${moved(old[index], row[index])}`);
        }
      }
    }
  }
  if (hidden > 0) lines.push(`…and ${hidden} more changes.`);
  return lines;
}
