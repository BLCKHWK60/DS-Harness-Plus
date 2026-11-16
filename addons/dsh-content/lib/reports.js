/**
 * Research reports as material (step C2, Content's side only): the reports the Research tab saved as
 * Markdown, listed, and one copied as it is into the subject's research part, with its numbered
 * sources taken into the ledger. The Research tab itself is not changed.
 */
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** The newest reports in a folder: name, date, title. */
export function listReports(folder, most = 40) {
  if (!folder) return [];
  let names = [];
  try {
    names = readdirSync(folder).filter((name) => name.endsWith('.md'));
  } catch {
    return [];
  }
  return names
    .map((name) => {
      try {
        const path = join(folder, name);
        const stat = lstatSync(path);
        if (!stat.isFile()) return undefined;
        const title = (readFileSync(path, 'utf8').split('\n').find((line) => line.startsWith('# ')) ?? '').slice(2).trim();
        return { name, at: stat.mtimeMs, title: title || name };
      } catch {
        return undefined;
      }
    })
    .filter(Boolean)
    .sort((a, b) => b.at - a.at)
    .slice(0, most);
}

const GRADE = /·\s*(Primary|Confirmed|Single)\s*$/i;

/**
 * The numbered sources of a report's "## Sources" list: `[3] https://… (read · Confirmed)`.
 * @param {string} text - the report.
 * @returns {{n: number, url: string, status: string, grade: string}[]} the sources.
 */
export function reportSources(text) {
  const lines = String(text ?? '').split('\n');
  const start = lines.findIndex((line) => /^##\s+Sources\b/i.test(line));
  if (start < 0) return [];
  const out = [];
  for (const line of lines.slice(start + 1)) {
    if (/^##\s/.test(line)) break;
    const found = /^\[(\d+)\]\s+(\S+)(?:\s+\((.*)\))?\s*$/.exec(line.trim());
    if (!found) continue;
    const inner = found[3] ?? '';
    const grade = GRADE.exec(inner)?.[1]?.toLowerCase() ?? '';
    out.push({ n: Number(found[1]), url: found[2], status: inner.replace(GRADE, '').trim(), grade });
  }
  return out;
}

/** The host of an address, for telling sources apart. */
export const hostOf = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};
