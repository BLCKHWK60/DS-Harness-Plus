/**
 * Research reports as material (step C2, Content's side only): the reports the Research tab saved as
 * Markdown, listed, and one copied as it is into the subject's research part, with its numbered
 * sources taken into the ledger. The Research tab itself is not changed.
 */
import { createHash } from 'node:crypto';
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

/** The packet folder the Research tab writes beside a report (`<report>.packet/`), since step C2's Research side. */
export const PACKET_SUFFIX = '.packet';
const PACKET_FILES = ['claims.md', 'contradictions.md', 'timeline.md', 'leads.md', 'packet.json'];
const PACKET_MAX = 2_000_000;

/**
 * A report's packet, when the Research tab wrote one: its files as text and its claims. Never through a
 * link; undefined when there is none (older reports), so bringing a report works as before. A packet is
 * taken only when it was made for this very report (its SHA-256 is in packet.json): a packet left over
 * from another report of the same name is not.
 * @param {string} folder - the Research tab's report folder.
 * @param {string} name - the report's file name.
 * @param {string} reportText - the report's text, as read.
 * @returns {{files: Record<string, string>, claims: object[], sources: object[]} | undefined} the packet.
 */
export function readPacket(folder, name, reportText) {
  const dir = join(folder, `${name}${PACKET_SUFFIX}`);
  try {
    const stat = lstatSync(dir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return undefined;
  } catch {
    return undefined;
  }
  const files = {};
  for (const file of PACKET_FILES) {
    try {
      const path = join(dir, file);
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.size > PACKET_MAX) continue;
      files[file] = readFileSync(path, 'utf8');
    } catch {
      /* a part may be missing */
    }
  }
  let data = {};
  try {
    data = JSON.parse(files['packet.json'] ?? '{}') ?? {};
  } catch {
    data = {};
  }
  const sum = createHash('sha256').update(String(reportText ?? '')).digest('hex');
  if (data.reportSha256 !== sum) return undefined;
  const claims = (Array.isArray(data.claims) ? data.claims : []).filter((claim) => claim && typeof claim.claim === 'string' && claim.claim.trim()).slice(0, 400);
  const sources = (Array.isArray(data.sources) ? data.sources : []).filter((source) => source && Number.isInteger(source.n));
  return Object.keys(files).length > 0 ? { files, claims, sources } : undefined;
}
