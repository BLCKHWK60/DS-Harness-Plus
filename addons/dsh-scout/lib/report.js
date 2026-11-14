/**
 * A run's report, saved as two files in the Scout folder's `reports` folder: the report as
 * Markdown, and the ranked opportunities as a table (CSV) to sort and keep notes in.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const COLUMNS = ['rank', 'title', 'company', 'location', 'pay', 'posted', 'link', 'fit', 'freshness', 'pay_score', 'legitimacy', 'flags', 'reason', 'next_step'];

const cell = (value) => {
  const text = String(value ?? '').replace(/\r?\n/g, ' ').trim().slice(0, 1000);
  // A cell that a spreadsheet would read as a formula is written as text.
  const safe = /^[=+\-@\t]/.test(text) ? `'${text}` : text;
  return /[",]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/** The table as CSV text. */
export function csv(rows) {
  return [COLUMNS.join(','), ...rows.map((row) => COLUMNS.map((column) => cell(row?.[column])).join(','))].join('\n');
}

/** A file name from a title and a time: `2026-11-14-2105-data-engineer-berlin`. */
export function stem(title, at = new Date()) {
  const iso = at.toISOString();
  const stamp = `${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
  const slug = String(title ?? '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'scout-run';
  return `${stamp}-${slug}`;
}

/**
 * @param {string} folder - the Scout folder.
 * @param {{title: string, markdown: string, opportunities: object[]}} report - from the model.
 * @returns {{markdown: string, table: string}} the two files written.
 */
export function writeReport(folder, { title, markdown, opportunities }, at = new Date()) {
  const text = String(markdown ?? '').trim();
  if (text.length < 40) throw new Error('the report is empty; write it first, then save it');
  const rows = Array.isArray(opportunities) ? opportunities.slice(0, 300) : [];
  const dir = join(folder, 'reports');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = stem(title, at);
  const head = `# ${String(title ?? 'Scout run').replace(/\s+/g, ' ').trim().slice(0, 200)}\n\nSaved ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC by Scout. Postings, titles and companies are as the sources gave them; check each before acting.\n\n`;
  const markdownFile = join(dir, `${name}.md`);
  const tableFile = join(dir, `${name}.csv`);
  writeFileSync(markdownFile, `${head}${text}\n`, { mode: 0o600 });
  writeFileSync(tableFile, `${csv(rows)}\n`, { mode: 0o600 });
  return { markdown: markdownFile, table: tableFile, rows: rows.length };
}
