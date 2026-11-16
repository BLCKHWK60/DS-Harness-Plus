/**
 * Source grades in a research report (the owner's plan, Long run part, step 64; decision 6: pass with a
 * label). Each source gets a grade beside its read label:
 *   Primary    the writer model judged it the original document behind a claim (its judgement, said so);
 *   Confirmed  every claim that cites it also cites a source at another address (worked out by code);
 *   Single     at least one claim rests on it alone, or only on sources at the same address.
 * Claims resting on one source are listed near the top of the report, so the reader knows which to check.
 * The read labels (research-4) are not changed.
 */

/** The heading the writer gives its list of primary sources; the section is taken out of the report. */
export const PRIMARY_HEADING = 'Primary sources';
/** At most this many single-source claims are listed at the top. */
export const SINGLE_MAX = 8;

/** @returns {string} a source's address for "independent": its host without `www.` ('' when not a web address). */
export function hostOf(url) {
  try {
    return new URL(String(url)).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * The writer's list of primary sources, and the report without it.
 * @param {string} text - the report as the writer gave it.
 * @returns {{primary: Set<number>, text: string}} the numbers it named, and the report without the section.
 */
export function primaryOf(text) {
  const source = String(text ?? '');
  const match = source.match(new RegExp(`^##\\s*${PRIMARY_HEADING}\\s*$`, 'im'));
  if (!match) return { primary: new Set(), text: source };
  const start = match.index;
  const rest = source.slice(start + match[0].length);
  const next = rest.search(/^##\s/m);
  const block = next < 0 ? rest : rest.slice(0, next);
  const primary = new Set([...block.matchAll(/\[(\d+)\]/g)].map((found) => Number(found[1])));
  const without = `${source.slice(0, start).replace(/\s+$/, '')}${next < 0 ? '' : `\n\n${rest.slice(next).replace(/^\s+/, '')}`}`;
  return { primary, text: without };
}

/**
 * The claims of a report: each sentence (or list line) that cites sources, with the numbers it cites.
 * Headings, the follow-up questions and anything after them are left out.
 * @returns {{text: string, ns: number[]}[]} the claims in order.
 */
export function claimsOf(text) {
  const body = String(text ?? '').split(/^##\s*Follow-up questions\s*$/im)[0];
  const claims = [];
  for (const line of body.split('\n')) {
    if (/^\s*#/.test(line)) continue;
    for (const sentence of line.split(/(?<=[.!?])\s+(?=[A-Z0-9"“(])/)) {
      const ns = [...new Set([...sentence.matchAll(/\[(\d+)\]/g)].map((found) => Number(found[1])))];
      if (ns.length > 0) claims.push({ text: sentence.replace(/^\s*[-*]\s+/, '').trim(), ns });
    }
  }
  return claims;
}

/**
 * Grade the sources of a report.
 * @param {object} input
 * @param {string} input.text - the report (without the primary section).
 * @param {{n: number, url: string}[]} input.sources - the sources by number.
 * @param {Set<number>} [input.primary] - the writer's primary sources.
 * @returns {{grades: Map<number, 'Primary' | 'Confirmed' | 'Single'>, single: {text: string, ns: number[]}[]}} the grades and the single-source claims.
 */
export function gradeSources({ text, sources, primary = new Set() }) {
  const hostByN = new Map(sources.map((source) => [source.n, hostOf(source.url) || `#${source.n}`]));
  const claims = claimsOf(text).map((claim) => {
    const known = claim.ns.filter((n) => hostByN.has(n));
    const hosts = new Set(known.map((n) => hostByN.get(n)));
    return { ...claim, ns: known, confirmed: hosts.size >= 2, primary: known.some((n) => primary.has(n)) };
  }).filter((claim) => claim.ns.length > 0);
  const grades = new Map();
  for (const source of sources) {
    const citing = claims.filter((claim) => claim.ns.includes(source.n));
    if (citing.length === 0) continue;
    if (primary.has(source.n)) grades.set(source.n, 'Primary');
    else grades.set(source.n, citing.every((claim) => claim.confirmed) ? 'Confirmed' : 'Single');
  }
  // A claim backed only by one address and by no primary source: listed for the reader to check.
  const single = claims.filter((claim) => !claim.confirmed && !claim.primary).slice(0, SINGLE_MAX).map(({ text: claimText, ns }) => ({ text: claimText.length > 160 ? `${claimText.slice(0, 157)}…` : claimText, ns }));
  return { grades, single };
}

/** @returns {string} the block listed near the top: the claims that rest on one source ('' when none). */
export function singleBlock(single) {
  if (!single || single.length === 0) return '';
  return [`**Resting on one source** (check these before relying on them; grades are explained under Checks):`, ...single.map((claim) => `- ${claim.text}`)].join('\n');
}

/** @returns {string} the report with the single-source block after its first paragraph (the answer). */
export function withSingleBlock(text, block) {
  if (!block) return text;
  const source = String(text ?? '');
  const at = source.search(/\n\s*\n/);
  return at < 0 ? `${source}\n\n${block}` : `${source.slice(0, at)}\n\n${block}${source.slice(at)}`;
}

/** The note under Checks that says what the grades are. */
export const GRADES_NOTE = 'Grades beside each source: Primary is the writer model\'s judgement that the source is the original document behind a claim; Confirmed means every claim citing it also cites a source at another address; Single means at least one claim rests on it alone. Grades are a guide, not a check of the pages.';
