/**
 * The research packet beside a saved report (plan step C2, the Research side): what a run already holds,
 * put in tables for the Content tab. It is made by code from the run's own findings, never by a model:
 *   - claims.md: every finding: the claim, who says it (the site), the passage it rests on, the source
 *     number, the source's grade, and whether its helper read the page;
 *   - contradictions.md: what the review between rounds found disagreeing;
 *   - timeline.md: the findings that carry a date, oldest first;
 *   - leads.md: what was still missing when the run ended (the lead list);
 *   - packet.json: all of it, for programs.
 * The files sit in a folder named after the report (`<report>.md.packet/`), so the report list (which lists
 * `.md` files) is unchanged. Bounded: at most 400 claims, 100 contradictions, 100 leads.
 */
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import { basename, join } from 'node:path';

export const CLAIMS_MAX = 400;
export const LIST_MAX = 100;
export const PACKET_SUFFIX = '.packet';

const cell = (value, max = 400) => String(value ?? '').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim().slice(0, max);
/** Deep research's read status of a page (lib/sources.js there), as people read it. */
const STATUS = { fetched: 'read', 'search result only': 'seen only in search results', 'not fetched': 'not read' };

/** A date in a finding, as a key that sorts: "2023", "2023-04", "2023-04-07"; '' when none can be read. */
export function dateKey(text) {
  const value = String(text ?? '');
  const full = /\b(1[89]\d\d|20\d\d)-(0[1-9]|1[0-2])(?:-(0[1-9]|[12]\d|3[01]))?\b/.exec(value);
  if (full) return [full[1], full[2], full[3]].filter(Boolean).join('-');
  const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const named = /\b(?:(\d{1,2})\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s+(\d{1,2})(?:st|nd|rd|th)?)?,?\s+(1[89]\d\d|20\d\d)\b/i.exec(value);
  if (named) {
    const month = String(months.indexOf(named[2].toLowerCase()) + 1).padStart(2, '0');
    const day = named[1] ?? named[3];
    return `${named[4]}-${month}${day ? `-${String(day).padStart(2, '0')}` : ''}`;
  }
  const year = /\b(1[89]\d\d|20\d\d)\b/.exec(value);
  return year ? year[1] : '';
}

/**
 * The packet's tables from a run's findings.
 * @param {{findings?: object[], conflicts?: string[], gaps?: string[], sources?: object[], grades?: Record<string, string>}} input - what the run holds.
 * @returns {{claims: object[], contradictions: string[], timeline: object[], leads: string[], sources: object[]}} the packet.
 */
export function packetOf(input = {}) {
  const grades = input.grades && typeof input.grades === 'object' ? input.grades : {};
  const sources = (Array.isArray(input.sources) ? input.sources : []).slice(0, 500).map((source) => ({ n: Number(source?.n) || 0, url: cell(source?.url, 600), host: cell(source?.host, 120), read: STATUS[source?.status] ?? 'not known', grade: cell(grades[source?.n] ?? '', 20) })).filter((source) => source.n > 0);
  const hostOf = new Map(sources.map((source) => [source.n, source.host]));
  const claims = (Array.isArray(input.findings) ? input.findings : []).slice(0, CLAIMS_MAX).map((finding, index) => ({
    id: `R${index + 1}`,
    claim: cell(finding?.claim, 600),
    who: cell(finding?.host || hostOf.get(Number(finding?.n)) || '', 120),
    passage: cell(finding?.quote, 400),
    source: Number(finding?.n) || 0,
    grade: cell(grades[finding?.n] ?? '', 20),
    date: cell(finding?.date, 40),
    read: STATUS[finding?.status] ?? 'not known',
  })).filter((claim) => claim.claim);
  const timeline = claims.map((claim) => ({ when: dateKey(claim.date) || dateKey(claim.claim), claim: claim.id, text: claim.claim, source: claim.source })).filter((row) => row.when).sort((a, b) => a.when.localeCompare(b.when));
  const list = (value) => (Array.isArray(value) ? value : []).map((item) => cell(item, 600)).filter(Boolean).slice(0, LIST_MAX);
  return { claims, contradictions: list(input.conflicts), timeline, leads: list(input.gaps), sources };
}

/** The packet's files as text. */
export function packetFiles(packet, { question = '', at = new Date(), reportSha256 = '' } = {}) {
  const head = (title) => `# ${title}\n\nFrom the Research report "${cell(question, 200)}", ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC. Made by the Research tab from the run's own findings; sources are untrusted pages.\n\n`;
  const claims = packet.claims.length === 0 ? 'No claims were kept.\n' : ['| # | Claim | Who says it | Passage | Source | Grade | Date | Read |', '| --- | --- | --- | --- | --- | --- | --- | --- |', ...packet.claims.map((claim) => `| ${claim.id} | ${claim.claim} | ${claim.who} | ${claim.passage} | [${claim.source}] | ${claim.grade} | ${claim.date} | ${claim.read} |`)].join('\n');
  const contradictions = packet.contradictions.length === 0 ? 'The review found no contradiction.\n' : packet.contradictions.map((item, index) => `${index + 1}. ${item}`).join('\n');
  const timeline = packet.timeline.length === 0 ? 'No finding carried a date.\n' : ['| When | Claim | Source |', '| --- | --- | --- |', ...packet.timeline.map((row) => `| ${row.when} | ${row.claim}: ${cell(row.text, 200)} | [${row.source}] |`)].join('\n');
  const leads = packet.leads.length === 0 ? 'Nothing was left open.\n' : packet.leads.map((item) => `- ${item}`).join('\n');
  return {
    'claims.md': `${head('Claims')}${claims}\n`,
    'contradictions.md': `${head('Contradictions')}${contradictions}\n`,
    'timeline.md': `${head('Timeline')}${timeline}\n`,
    'leads.md': `${head('Leads: what was still missing')}${leads}\n`,
    'packet.json': `${JSON.stringify({ question: cell(question, 300), at: at.toISOString(), reportSha256, ...packet }, null, 2)}\n`,
  };
}

/**
 * Write the packet beside a report: a new folder `<report>.packet/`, never through a link, each file new.
 * @param {string} reportFile - the saved report's path.
 * @returns {string} the packet folder.
 */
export function writePacket(reportFile, input, { question = '', at = new Date() } = {}) {
  const folder = `${reportFile}${PACKET_SUFFIX}`;
  // The packet names the very report it was made for (its SHA-256): Content takes no other one.
  const reportSha256 = createHash('sha256').update(readFileSync(reportFile, 'utf8')).digest('hex');
  mkdirSync(folder, { mode: 0o700 });
  if (lstatSync(folder).isSymbolicLink()) throw new Error('the packet folder is a link');
  for (const [name, text] of Object.entries(packetFiles(packetOf(input), { question, at, reportSha256 }))) {
    const fd = openSync(join(folder, name), 'wx', 0o600);
    try {
      writeSync(fd, text);
    } finally {
      closeSync(fd);
    }
  }
  return folder;
}

/** @returns {string} the packet folder's name for a report file name. */
export const packetName = (reportName) => `${basename(String(reportName ?? ''))}${PACKET_SUFFIX}`;
