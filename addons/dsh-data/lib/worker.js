/**
 * The helper process that holds the loaded files and runs the queries, so a heavy query cannot
 * freeze the app. The app ends it when a job takes too long, and it ends itself when the app goes.
 */
import { DatabaseSync } from 'node:sqlite';
import { build, fileTables, profileTable, profileText, resultText, runQuery } from './db.js';

/** Loaded sets of files, newest last. The key holds each file's path, size and change time. */
const loaded = new Map();
const KEEP = 3;

async function open(files) {
  const key = files.map((file) => `${file.path}|${file.print}|${file.name ?? ''}`).sort().join('\n');
  const hit = loaded.get(key);
  if (hit) {
    loaded.delete(key);
    loaded.set(key, hit);
    return hit;
  }
  const tables = [];
  for (const file of files) {
    try {
      tables.push(...(await fileTables(file.path, file.name)).map((table) => ({ ...table, file: file.shown })));
    } catch (error) {
      throw new Error(`${file.shown} could not be read: ${String(error?.message ?? error)}`);
    }
  }
  const names = new Set();
  for (const table of tables) {
    // Files are named apart before they get here; this catches what is left, such as a workbook's
    // file__sheet table meeting a file of that name. The user's files are never to be renamed.
    if (names.has(table.name)) throw new Error(`Two tables are named "${table.name}". Query these files one at a time.`);
    names.add(table.name);
  }
  const entry = { db: build(DatabaseSync, tables), tables: tables.map(({ rows, ...rest }) => ({ ...rest, rowCount: rows.length })) };
  loaded.set(key, entry);
  while (loaded.size > KEEP) {
    const oldest = loaded.keys().next().value;
    try {
      loaded.get(oldest).db.close();
    } catch {
      /* already closed */
    }
    loaded.delete(oldest);
  }
  return entry;
}

const reply = (message) => {
  try {
    process.send?.(message);
  } catch {
    /* the app is gone */
  }
};
process.on('disconnect', () => process.exit(0));
process.on('message', async (job) => {
  try {
    const entry = await open(job.files);
    const tables = entry.tables.map((table) => ({ name: table.name, file: table.file, sheet: table.sheet, rows: table.rowCount, columns: table.columns.map((column) => column.name) }));
    if (job.op === 'profile') {
      reply({ id: job.id, ok: true, value: { tables, text: entry.tables.map((table) => profileText(profileTable(entry.db, table))).join('\n\n') } });
    } else {
      const result = runQuery(entry.db, job.sql, job.limit);
      reply({ id: job.id, ok: true, value: { tables, result, text: resultText(result) } });
    }
  } catch (error) {
    reply({ id: job.id, ok: false, error: String(error?.message ?? error).slice(0, 600) });
  }
});
