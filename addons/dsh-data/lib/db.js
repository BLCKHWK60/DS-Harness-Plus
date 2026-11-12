/**
 * The query side: tables loaded into an in-memory database, profiled, and queried read-only.
 * Everything here takes the database class as an argument, so it can run in the helper process
 * and in tests alike.
 */
import { readFileSync, statSync } from 'node:fs';
import { MAX_FILE_BYTES, baseName, csvTable, excelTables, jsonTables, tableKind } from './tables.js';

/** Most rows one query hands back, and how far a result is counted before it is called "more". */
export const ROWS_MAX = 500;
export const COUNT_MAX = 1_000_000;
/** Most characters of a result shown to the model. */
export const RESULT_CHARS = 14000;

/**
 * The tables of one data file.
 * @param {string} path - the file (already checked to be inside the conversation's folder).
 * @param {string} [name] - the table name to use; the file's base name when left out.
 * @returns {Promise<object[]>} the tables.
 */
export async function fileTables(path, name = baseName(path)) {
  const kind = tableKind(path);
  if (!kind) throw new Error('it is not a table file (CSV, TSV, JSON, JSON Lines or Excel)');
  const size = statSync(path).size;
  if (size > MAX_FILE_BYTES) throw new Error(`it is larger than ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB`);
  if (kind === 'excel') return excelTables(path, name);
  const text = readFileSync(path, 'utf8');
  if (kind === 'csv') return [csvTable(text, name)];
  return jsonTables(text, name, /\.(jsonl|ndjson)$/i.test(path));
}

const quoted = (name) => `"${String(name).replace(/"/g, '""')}"`;

/**
 * A database holding the given tables, switched to read-only once they are in.
 * @param {Function} DatabaseSync - `node:sqlite`'s database class.
 * @param {object[]} tables - from `fileTables`.
 * @returns {object} the database.
 */
export function build(DatabaseSync, tables) {
  const db = new DatabaseSync(':memory:');
  for (const table of tables) {
    const types = { integer: 'INTEGER', real: 'REAL', text: 'TEXT' };
    db.exec(`CREATE TABLE ${quoted(table.name)} (${table.columns.map((column) => `${quoted(column.name)} ${types[column.type]}`).join(', ')})`);
    const insert = db.prepare(`INSERT INTO ${quoted(table.name)} VALUES (${table.columns.map(() => '?').join(', ')})`);
    db.exec('BEGIN');
    for (const row of table.rows) {
      // A whole number is given as a BigInt so it is stored as an integer, not as a real.
      insert.run(...row.map((value, index) => (typeof value === 'number' && table.columns[index].type === 'integer' ? BigInt(value) : value ?? null)));
    }
    db.exec('COMMIT');
  }
  db.exec('PRAGMA query_only = ON');
  return db;
}

/**
 * A query checked to be one read-only statement.
 * @param {unknown} sql - what the model wrote.
 * @returns {string} the statement, without comments or a closing semicolon.
 */
export function validate(sql) {
  const text = String(sql ?? '').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim().replace(/;+\s*$/, '');
  if (!text) throw new Error('The query is empty.');
  if (text.length > 20000) throw new Error('The query is too long.');
  if (!/^(select|with|values)\b/i.test(text)) throw new Error('Only reading is possible: the query must start with SELECT or WITH.');
  // A semicolon outside quotes would start a second statement.
  if (/;/.test(text.replace(/'(?:[^']|'')*'|"(?:[^"]|"")*"/g, ''))) throw new Error('Send one statement at a time.');
  if (/\b(attach|detach|pragma|vacuum|load_extension|readfile|writefile)\b/i.test(text.replace(/'(?:[^']|'')*'/g, ''))) throw new Error('That statement is not allowed here: only SELECT queries over the loaded files.');
  return text;
}

/**
 * Run a query.
 * @param {object} db - from `build`.
 * @param {unknown} sql - the query.
 * @param {number} [limit] - most rows to hand back.
 * @returns {{sql: string, columns: string[], rows: any[][], total: number, more: boolean}} the result.
 */
export function runQuery(db, sql, limit = ROWS_MAX) {
  const text = validate(sql);
  const statement = db.prepare(text);
  const keep = Math.max(1, Math.min(ROWS_MAX, Math.floor(Number(limit)) || ROWS_MAX));
  const rows = [];
  let columns;
  let total = 0;
  let more = false;
  for (const record of statement.iterate()) {
    columns ??= Object.keys(record);
    total += 1;
    if (rows.length < keep) rows.push(columns.map((column) => (typeof record[column] === 'bigint' ? Number(record[column]) : record[column] instanceof Uint8Array ? '[binary]' : record[column])));
    if (total >= COUNT_MAX) {
      more = true;
      break;
    }
  }
  return { sql: text, columns: columns ?? [], rows, total, more };
}

const show = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : String(Math.round(value * 1e6) / 1e6);
  return String(value).replace(/\s+/g, ' ').replace(/\|/g, '/').slice(0, 120);
};

/**
 * A result as a text table.
 * @param {{columns: string[], rows: any[][], total: number, more: boolean}} result - from `runQuery`.
 * @returns {string} the table, cut at `RESULT_CHARS`, with a line saying how much is shown.
 */
export function resultText(result) {
  if (result.columns.length === 0) return 'The query returned no rows.';
  const lines = [result.columns.join(' | '), result.columns.map(() => '---').join(' | ')];
  let size = lines.join('\n').length;
  let shown = 0;
  for (const row of result.rows) {
    const line = row.map(show).join(' | ');
    if (size + line.length + 1 > RESULT_CHARS) break;
    lines.push(line);
    size += line.length + 1;
    shown += 1;
  }
  const count = `${result.more ? 'more than ' : ''}${result.total.toLocaleString('en-US')} row${result.total === 1 ? '' : 's'}`;
  lines.push('', shown < result.total ? `${count} in all; the first ${shown} are shown. Aggregate or filter in the query to see the rest.` : `${count}.`);
  return lines.join('\n');
}

/**
 * What one table holds: its size, and for each column its type, gaps, spread and typical values.
 * @param {object} db - from `build`.
 * @param {object} table - one of the tables it was built from.
 * @returns {object} the profile.
 */
export function profileTable(db, table) {
  const name = quoted(table.name);
  const rows = Number(db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get().n);
  const columns = table.columns.slice(0, 80).map((column) => {
    const col = quoted(column.name);
    const stats = db.prepare(`SELECT COUNT(${col}) AS filled, COUNT(DISTINCT ${col}) AS distinct_values, MIN(${col}) AS low, MAX(${col}) AS high${column.type === 'text' ? '' : `, AVG(${col}) AS mean`} FROM ${name}`).get();
    const out = { name: column.name, title: column.title, type: column.type, empty: rows - Number(stats.filled), distinct: Number(stats.distinct_values), min: stats.low, max: stats.high };
    if (column.type !== 'text' && stats.mean !== null && stats.mean !== undefined) out.mean = Math.round(Number(stats.mean) * 1e4) / 1e4;
    if (column.type === 'text' && out.distinct > 0 && out.distinct <= Math.max(50, rows / 2)) {
      out.top = db.prepare(`SELECT ${col} AS value, COUNT(*) AS n FROM ${name} WHERE ${col} IS NOT NULL GROUP BY ${col} ORDER BY n DESC, value LIMIT 5`).all().map((entry) => `${show(entry.value).slice(0, 40)} (${Number(entry.n)})`);
    }
    return out;
  });
  const sample = runQuery(db, `SELECT * FROM ${name} LIMIT 5`, 5);
  return { name: table.name, sheet: table.sheet, rows, columnCount: table.columns.length, columns, sample };
}

/**
 * A profile as text for the model.
 * @param {object} profile - from `profileTable`.
 * @returns {string} the text.
 */
export function profileText(profile) {
  const lines = [`Table ${profile.name}${profile.sheet ? ` (sheet "${profile.sheet}")` : ''}: ${profile.rows.toLocaleString('en-US')} rows, ${profile.columnCount} columns.`, 'Columns (name, type, empty cells, distinct values, range or typical values):'];
  for (const column of profile.columns) {
    const titled = column.title && column.title !== column.name ? ` ("${show(column.title).slice(0, 60)}")` : '';
    const spread = column.top ? `most common: ${column.top.join(', ')}` : `${show(column.min).slice(0, 40)} to ${show(column.max).slice(0, 40)}${column.mean !== undefined ? `, mean ${column.mean}` : ''}`;
    lines.push(`- ${column.name}${titled}: ${column.type}, ${column.empty} empty, ${column.distinct} distinct, ${spread}`);
  }
  if (profile.columnCount > profile.columns.length) lines.push(`- (${profile.columnCount - profile.columns.length} more columns not profiled)`);
  lines.push('First rows:', resultText(profile.sample).split('\n').slice(0, 7).join('\n'));
  return lines.join('\n');
}
