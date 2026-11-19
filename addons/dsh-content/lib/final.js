/**
 * A piece made final, and what comes with it: the gates before approval, the final file, the sources
 * page (Markdown and a web page file), the publish kit, the where-used index across subjects, and
 * corrections. A final piece is never changed: a corrected version is a new file beside it, and its
 * corrections log is only added to.
 */
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { join, relative } from 'node:path';
import { RISKY, labelOf } from './standing.js';
import { readJsonStore } from './json-store.js';

/** Write a new file and never replace one; a taken name gets -v2, -v3. @returns {string} the path written. */
export function writeVersion(folder, stem, ending, text) {
  for (let n = 1; n < 200; n += 1) {
    const path = join(folder, `${stem}${n === 1 ? '' : `-v${n}`}${ending}`);
    let fd;
    try {
      fd = openSync(path, 'wx', 0o600);
    } catch (error) {
      if (error?.code === 'EEXIST') continue;
      throw error;
    }
    try {
      writeSync(fd, text.endsWith('\n') ? text : `${text}\n`);
    } finally {
      closeSync(fd);
    }
    return path;
  }
  throw new Error('No free file name was found.');
}

/** A draft's fingerprint: approval checks the draft is still the one that was checked. */
export const fingerprint = (text) => createHash('sha256').update(String(text ?? '')).digest('hex');

/**
 * What still stands between a piece and approval.
 * @param {object} state - the subject's record.
 * @param {object} piece - the piece.
 * @param {{hash?: string, used?: string[]}} [current] - the latest draft as it is now: its fingerprint and the claims it uses.
 * @returns {string[]} the reasons, in plain words; none when it may be approved.
 */
export function approvalGaps(state, piece, current = {}) {
  const gaps = [];
  if (!piece.brief?.approved) gaps.push('The brief is not approved by the owner yet.');
  const draft = piece.drafts?.at(-1);
  if (!draft) return [...gaps, 'There is no draft yet.'];
  const check = piece.checks?.at(-1);
  if (!check || check.draft !== draft.file) return [...gaps, `The latest draft (${draft.file}) has not been checked yet.`];
  if (current.hash && check.hash !== current.hash) return [...gaps, `The latest draft (${draft.file}) changed after it was checked: check it again.`];
  const ruledNow = new Map(state.claims.map((claim) => [claim.id, `${claim.standing}|${claim.ruled ? 'ruled' : ''}|${(claim.about ?? []).join(',')}|${claim.accuses ? 'accuses' : ''}`]));
  const changed = Object.entries(check.standings ?? {}).filter(([id, was]) => ruledNow.get(id) !== was).map(([id]) => id);
  if (changed.length > 0) return [...gaps, `A ruling or a claim the draft rests on changed after the check (${changed.join(', ')}): check it again.`];
  const open = (piece.flags ?? []).filter((flag) => flag.status === 'open');
  if (open.length > 0) gaps.push(`${open.length} flag${open.length === 1 ? ' is' : 's are'} open: ${open.slice(0, 8).map((flag) => `${flag.id} (sentence ${flag.n}, ${flag.kind})`).join(', ')}. Fix the draft and check it again, or the owner overrides each one.`);
  const claims = new Map(state.claims.map((claim) => [claim.id, claim]));
  const unruled = (current.used ?? check.used ?? []).filter((id) => claims.has(id) && !claims.get(id).ruled && !claims.get(id).pinned);
  if (unruled.length > 0) gaps.push(`The owner has not ruled on ${unruled.length} claim${unruled.length === 1 ? '' : 's'} the piece uses: ${unruled.join(', ')}.`);
  const waiting = (piece.named ?? []).flatMap((entry) => entry.statements.filter((statement) => statement.risky && !statement.yes).map((statement) => `${entry.person} (sentence ${statement.n}, ${labelOf(statement.standing)})`));
  if (waiting.length > 0) gaps.push(`These statements about named people are not proven and need the owner's yes one by one: ${waiting.slice(0, 10).join('; ')}.`);
  return gaps;
}

const escape = (text) => String(text ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The sources page of a piece: every source it used, what each supported and how sure that is.
 * @param {object} input - the piece and the ledger.
 * @param {'description' | 'address'} [input.reconShown] - how a source from Recon is shown (the owner decides).
 * @returns {{markdown: string, html: string, sources: object[]}} the page in both forms, and the sources listed.
 */
export function sourcesPage({ title, used, claims, sources, reconShown = 'description', at = new Date() }) {
  const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
  const sourceMap = new Map(sources.map((source) => [source.id, source]));
  const usedClaims = used.map((id) => claimMap.get(id)).filter(Boolean);
  const listed = [];
  for (const claim of usedClaims) for (const id of claim.sources ?? []) if (sourceMap.has(id) && !listed.includes(id)) listed.push(id);
  // A source from Recon, or with an onion address, is shown as a description unless the owner chose the
  // address: then no part of the address appears under another name either (its title, its publisher
  // taken from the host, its archived copy). Only web addresses become links.
  const onion = (text) => /\.onion\b/i.test(String(text ?? ''));
  const hiddenSource = (source) => (source.origin === 'recon' || onion(source.url) || onion(source.archived)) && reconShown !== 'address';
  const webLink = (url) => (/^https?:\/\//i.test(String(url ?? '')) ? String(url) : '');
  const shownUrl = (source) => (hiddenSource(source) ? '' : webLink(source.url));
  const nameOf = (source) => {
    if (hiddenSource(source)) return source.title && !onion(source.title) && !onion(source.publisher) ? source.title : 'A source';
    return source.title || source.publisher || source.url || 'A source';
  };
  const own = usedClaims.filter((claim) => claim.standing === 'own-experience' || claim.standing === 'own-view');
  const md = [`# Sources: ${title}`, '', `Made ${at.toISOString().slice(0, 10)}. Every statement of fact in the piece traces back to a claim below, its source, and the passage it rests on.`, ''];
  const html = [`<!doctype html><html><head><meta charset="utf-8"><title>Sources: ${escape(title)}</title></head><body>`, `<h1>Sources: ${escape(title)}</h1>`, `<p>Made ${at.toISOString().slice(0, 10)}. Every statement of fact in the piece traces back to a claim below, its source, and the passage it rests on.</p>`, '<ol>'];
  for (const id of listed) {
    const source = sourceMap.get(id);
    const url = shownUrl(source);
    const name = nameOf(source);
    const hidden = hiddenSource(source);
    const facts = [hidden ? '' : source.publisher, source.date ? `published ${source.date}` : '', source.opened ? `opened ${source.opened}` : '', !hidden && webLink(source.archived) ? `archived copy: ${source.archived}` : ''].filter(Boolean).join(' · ');
    const supported = usedClaims.filter((claim) => (claim.sources ?? []).includes(id));
    md.push(`${listed.indexOf(id) + 1}. ${url ? `[${name.replace(/[[\]]/g, '')}](${url})` : name}${facts ? ` — ${facts}` : ''}${hidden ? ' — a source found in Recon research; its address is not printed' : ''}`);
    for (const claim of supported) md.push(`   - Supports: ${claim.text} (${labelOf(claim.standing)})${claim.passage ? `. Passage: "${String(claim.passage).slice(0, 300)}"` : ''}`);
    html.push(`<li>${url ? `<a href="${escape(url)}">${escape(name)}</a>` : escape(name)}${facts ? ` — ${escape(facts)}` : ''}<ul>${supported.map((claim) => `<li>Supports: ${escape(claim.text)} (${escape(labelOf(claim.standing))})</li>`).join('')}</ul></li>`);
  }
  html.push('</ol>');
  if (own.length > 0) {
    md.push('', '## The author\'s own experience and views', '', ...own.map((claim) => `- ${labelOf(claim.standing)}: ${claim.text}`));
    html.push('<h2>The author\'s own experience and views</h2><ul>', ...own.map((claim) => `<li>${escape(labelOf(claim.standing))}: ${escape(claim.text)}</li>`), '</ul>');
  }
  if (listed.length === 0 && own.length === 0) md.push('This piece rests on no listed source.');
  html.push('</body></html>');
  return { markdown: `${md.join('\n')}\n`, html: `${html.join('\n')}\n`, sources: listed.map((id) => sourceMap.get(id)) };
}

/** The sign-up offer: a block the owner puts on his own site or email service. The tab runs no list and sends nothing. */
export const SIGN_UP = 'Want every source behind this piece? Join my list and you will get the full source file, with every link and the passage each claim rests on.';

/**
 * The publish kit: titles, a description, chapters from the outline, show notes, the sign-up offer.
 * @returns {string} the kit's text.
 */
export function kitText({ piece, titles = [], description = '', showNotes = '', sourcesFile = '' }) {
  const points = piece.outline?.points ?? [];
  return [
    `# Publish kit: ${piece.title}`,
    '',
    'Nothing here is posted or sent: the kit is for the owner to use where he publishes.',
    '',
    '## Titles',
    ...(titles.length > 0 ? titles.map((title) => `- ${title}`) : ['- (none proposed yet)']),
    '',
    '## Description',
    description || '(none yet)',
    '',
    '## Chapters (from the outline)',
    ...points.map((point, index) => `${index + 1}. ${point.text}`),
    '',
    ...(showNotes ? ['## Show notes', showNotes, ''] : []),
    '## Sources',
    sourcesFile ? `The sources page: ${sourcesFile}` : 'The sources page comes with the final piece.',
    '',
    '## Sign-up offer',
    SIGN_UP,
    '',
  ].join('\n');
}

/**
 * The where-used index across subjects: for each claim and each source, every final piece that used
 * it and the wording it used. Kept in Content's own folder.
 */
export function openIndex(fileOf) {
  const file = () => String(fileOf() ?? '');
  const read = () => {
    const value = readJsonStore(file(), () => ({}), { label: 'the Content claims ledger', valid: (found) => found && typeof found === 'object' && !Array.isArray(found) });
    return { claims: value.claims ?? {}, sources: value.sources ?? {} };
  };
  const write = (index) => {
    const path = file();
    if (!path) return;
    mkdirSync(join(path, '..'), { recursive: true, mode: 0o700 });
    const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(temp, `${JSON.stringify(index, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temp, path);
    const lines = ['# Where used', '', 'For each claim and source: every final piece that used it, and the wording it used.', ''];
    for (const [key, entry] of Object.entries(index.claims)) {
      lines.push(`- Claim ${key}: ${entry.text} (${labelOf(entry.standing)})`);
      for (const use of entry.uses) lines.push(`  - ${use.file} (${use.at.slice(0, 10)}): ${use.wording.join(' / ').slice(0, 400)}`);
    }
    for (const [key, entry] of Object.entries(index.sources)) lines.push(`- Source ${key}: ${entry.title}`, ...entry.uses.map((use) => `  - ${use.file}`));
    const temp2 = `${path.replace(/\.json$/, '.md')}.${process.pid}.tmp`;
    writeFileSync(temp2, `${lines.join('\n')}\n`, { mode: 0o600 });
    renameSync(temp2, path.replace(/\.json$/, '.md'));
  };
  return {
    read,
    /** Add a final piece's uses. */
    add({ subject, piece, file: pieceFile, at, uses, claims, sources }) {
      const index = read();
      const claimMap = new Map(claims.map((claim) => [claim.id, claim]));
      const sourceMap = new Map(sources.map((source) => [source.id, source]));
      for (const [id, wording] of Object.entries(uses)) {
        const claim = claimMap.get(id);
        if (!claim) continue;
        const key = `${subject}#${id}`;
        const entry = index.claims[key] ?? { subject, claim: id, text: claim.text, standing: claim.standing, uses: [] };
        entry.text = claim.text;
        entry.standing = claim.standing;
        entry.uses.push({ piece, file: pieceFile, at, wording });
        index.claims[key] = entry;
        for (const sid of claim.sources ?? []) {
          const source = sourceMap.get(sid);
          if (!source) continue;
          const skey = source.url || `${subject}#${sid}`;
          const sentry = index.sources[skey] ?? { title: source.title || source.publisher || skey, uses: [] };
          if (!sentry.uses.some((use) => use.file === pieceFile)) sentry.uses.push({ piece, file: pieceFile, at });
          index.sources[skey] = sentry;
        }
      }
      write(index);
    },
    /** The final pieces that used a claim: of this subject by its id, and of any other subject by the same claim text. */
    usesOf(subject, claimId, text = '') {
      const index = read();
      const own = index.claims[`${subject}#${claimId}`]?.uses ?? [];
      const same = String(text).toLowerCase().replace(/\s+/g, ' ').trim();
      const others = same ? Object.entries(index.claims).filter(([key, entry]) => key !== `${subject}#${claimId}` && String(entry.text).toLowerCase().replace(/\s+/g, ' ').trim() === same).flatMap(([, entry]) => entry.uses) : [];
      return [...own, ...others];
    },
  };
}

/** Add an entry to a piece's corrections log; the log is only ever added to. */
export function addCorrection(logFile, { at, claim, from, to, reason, note, version }) {
  if (existsSync(logFile) && lstatSync(logFile).isSymbolicLink()) throw new Error('The corrections log is a link; Content does not write through links.');
  appendFileSync(logFile, `\n## ${at.toISOString().slice(0, 16).replace('T', ' ')} UTC: ${claim}\n\n- Standing: ${labelOf(from)} → ${labelOf(to)}${reason ? ` (${reason})` : ''}\n${note ? `- Note: ${note}\n` : ''}${version ? `- Corrected version: ${version}\n` : ''}`, { mode: 0o600 });
}

/** The words of each sentence that rests on each claim, for the index. */
export function wordingByClaim(sentences) {
  const uses = {};
  for (const sentence of sentences) for (const mark of sentence.marks) if (mark !== 'view') (uses[mark] ??= []).push(sentence.text.replace(/\s*\[[^\]]*\]/g, '').slice(0, 300));
  return uses;
}

export const relativeTo = (root, path) => relative(root, path);
export { RISKY };
