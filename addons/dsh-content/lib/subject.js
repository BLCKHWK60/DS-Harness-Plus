/**
 * A subject's record: the ledger (claims and sources), the angles, and the pieces (brief, outline,
 * drafts, checks, approval). Kept in `.content/state.json` inside the subject folder; the readable
 * copies `ledger.md`, `brief.md` and `outline.md` are written from it. A file of the user's with one of
 * those names is never replaced: the tab's own copies carry a first line that says they are its own.
 *
 * Rulings, approvals and overrides are the owner's: each must quote the owner's newest message, in
 * words that say that decision (`ownerDecision`), so the model cannot make one up or reuse old words.
 */
import { lstatSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STANDINGS, labelOf } from './standing.js';

export const STATE_DIR = '.content';
export const STATE_FILE = 'state.json';
/** The first line of the tab's own Markdown copies. */
export const MARK = '<!-- Kept by the Content tab. Change it through the tab: this file is written again from its record. -->';

/** An empty record. */
export const emptyState = () => ({ version: 1, claims: [], sources: [], angles: [], pieces: [], next: { claim: 1, source: 1, angle: 1, piece: 1, flag: 1 } });

/** @returns {string} words for comparing: small letters, no punctuation, single spaces. */
export const plainWords = (text) => String(text ?? '').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Words that turn a decision around when they come in it or just before it. */
const NEGATIONS = new Set(['not', 'no', 'dont', 'don', 'never', 'without', 'cannot', 'cant', 'neither', 'nor', 'wait', 'hold', 'stop', 'nicht', 'kein', 'keine', 'nein']);
/** A whole short reply that agrees with the question just asked. */
const AGREEMENT = /^(yes|yep|yeah|ok|okay|sure|agreed|agree|approve|approved|confirm|confirmed|correct|right|fine|good|go|go ahead|do it|sounds good|looks good|keep it|keep them|ja|genau)( please| thanks| thank you)?$/;

/**
 * Whether the owner's newest message says this decision. The words must be in the newest message (so
 * old words are not reused after the subject changed), at least two words long unless they are the
 * whole of a short agreement ("yes"), not turned around by a "not" in or just before them, and, when
 * the decision asks for it, hold one of the words that say what was decided.
 * @param {{text: string}[]} said - the user's own messages, oldest first.
 * @param {unknown} quote - the words the model says the owner wrote.
 * @param {{needs?: string[], recent?: number}} [rule] - words of which one must be in the quote (unless it is a whole agreement), and how many of the newest messages count (1).
 * @returns {{ok: boolean, why: string}} whether it holds, and why not.
 */
export function ownerDecision(said, quote, { needs = [], recent = 1 } = {}) {
  const want = plainWords(quote);
  if (!want) return { ok: false, why: 'no words were given' };
  const messages = said.slice(-recent).map((message) => plainWords(message.text));
  const found = messages.find((message) => ` ${message} `.includes(` ${want} `));
  if (found === undefined) return { ok: false, why: `"${String(quote).slice(0, 120)}" is not in the user's newest message` };
  const words = want.split(' ');
  const agreement = found === want && AGREEMENT.test(want);
  if (!agreement && (words.length < 2 || want.length < 6)) return { ok: false, why: 'a decision needs the user\'s words, not one word picked out of a message (a short "yes" counts only as their whole reply)' };
  const before = found.slice(0, ` ${found} `.indexOf(` ${want} `)).trim().split(' ').filter(Boolean).slice(-3);
  if ([...words, ...before].some((word) => NEGATIONS.has(word))) return { ok: false, why: 'the user\'s words say not to (a "not" or "no" in or just before them)' };
  if (!agreement && needs.length > 0 && !needs.some((need) => ` ${want} `.includes(` ${plainWords(need)} `))) return { ok: false, why: `the words do not say this decision (they need one of: ${needs.slice(0, 8).join(', ')})` };
  return { ok: true, why: '' };
}

/**
 * Whether the owner wrote these words in one of his recent messages (for his own experience: his
 * account, not a decision). At least four words.
 */
export function ownerSaid(said, quote, recent = 40) {
  const want = plainWords(quote);
  if (!want || want.split(' ').length < 4) return false;
  return said.slice(-recent).some((message) => ` ${plainWords(message.text)} `.includes(` ${want} `));
}

/** Words that name each decision, for `ownerDecision`'s `needs`. */
export const DECISION_WORDS = {
  established: ['established', 'establish', 'proven', 'confirmed', 'fact', 'true'],
  reported: ['reported', 'report', 'according'],
  claimed: ['claimed', 'claim', 'claims', 'says', 'alleged', 'allegation'],
  unsubstantiated: ['unsubstantiated', 'unverified', 'rumour', 'rumor', 'unproven', 'not proven'],
  disputed: ['disputed', 'dispute', 'contested', 'both sides'],
  'own-experience': ['experience', 'happened to me', 'my own', 'i did', 'i was', 'i saw'],
  'own-view': ['view', 'opinion', 'i think', 'i believe', 'my take'],
  use: ['out', 'in', 'drop', 'leave', 'cut', 'keep', 'include', 'exclude', 'use', 'skip', 'remove'],
  pin: ['pin', 'pinned', 'reuse', 'always'],
  brief: ['approve', 'approved', 'brief', 'go', 'agree', 'agreed', 'confirm', 'good', 'fine', 'ok', 'okay', 'yes'],
  override: ['keep', 'override', 'leave', 'ignore', 'accept', 'fine', 'ok', 'okay', 'yes', 'as is'],
  final: ['final', 'finalise', 'finalize', 'approve', 'approved', 'publish', 'done', 'ready', 'finish'],
  correct: ['correct', 'correction', 'change', 'changed', 'update', 'add', 'fix'],
  card: ['save', 'keep', 'add', 'use', 'yes', 'ok', 'okay', 'good'],
};

const replaceFile = (path, text) => {
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(temp, text, { mode: 0o600, flag: 'wx' });
  renameSync(temp, path);
};

/** The tab's own folder inside the subject folder, never a link. */
function stateDir(root) {
  const dir = join(root, STATE_DIR);
  let stat;
  try {
    stat = lstatSync(dir);
  } catch {
    stat = undefined;
  }
  if (stat?.isSymbolicLink()) throw new Error(`${STATE_DIR} in the subject folder is a link; Content does not write through links.`);
  if (stat && !stat.isDirectory()) throw new Error(`${STATE_DIR} in the subject folder is a file of yours; Content leaves it alone.`);
  if (!stat) mkdirSync(dir, { mode: 0o700 });
  return dir;
}

/**
 * Write one of the tab's Markdown copies, unless a file of the user's has that name.
 * @returns {boolean} whether it was written.
 */
export function writeOwnCopy(root, name, text) {
  const path = join(root, name);
  try {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink() || !stat.isFile()) return false;
    const first = readFileSync(path, 'utf8').split('\n', 1)[0];
    if (first !== MARK) return false;
  } catch (error) {
    if (error?.code !== 'ENOENT') return false;
  }
  replaceFile(path, `${MARK}\n${text.endsWith('\n') ? text : `${text}\n`}`);
  return true;
}

/**
 * @param {string} root - the subject folder (real path, checked by the caller).
 * @returns {{read: () => object, write: (state: object) => string[]}} the record; `write` returns the names of copies it could not write.
 */
export function openSubject(root) {
  const file = () => join(stateDir(root), STATE_FILE);
  return {
    read() {
      try {
        const state = JSON.parse(readFileSync(join(root, STATE_DIR, STATE_FILE), 'utf8'));
        if (!state || typeof state !== 'object') return emptyState();
        const fresh = emptyState();
        return { ...fresh, ...state, next: { ...fresh.next, ...(state.next ?? {}) } };
      } catch {
        return emptyState();
      }
    },
    write(state) {
      replaceFile(file(), `${JSON.stringify(state, null, 2)}\n`);
      const skipped = [];
      for (const [name, text] of [['ledger.md', ledgerText(state)], ['brief.md', briefText(state)], ['outline.md', outlineText(state)]]) {
        if (!writeOwnCopy(root, name, text)) skipped.push(name);
      }
      return skipped;
    },
  };
}

/** A new id of a kind: C1, S1, A1, P1, F1. */
export function nextId(state, kind) {
  const prefix = { claim: 'C', source: 'S', angle: 'A', piece: 'P', flag: 'F' }[kind];
  const n = state.next[kind] ?? 1;
  state.next[kind] = n + 1;
  return `${prefix}${n}`;
}

const day = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : '');
const sourceLine = (source) => `${source.id}: ${source.title || source.url || 'untitled'}${source.publisher ? `, ${source.publisher}` : ''}${source.date ? `, ${source.date}` : ''}${source.url ? ` <${source.url}>` : ''}${source.grade ? ` (${source.grade})` : ''}${source.origin && source.origin !== 'research' ? ` [origin: ${source.origin}]` : ''}`;

/** The ledger as people read it: claims grouped by standing, each with its sources and history. */
export function ledgerText(state) {
  const byId = new Map(state.sources.map((source) => [source.id, source]));
  const lines = ['# Ledger', '', 'Every claim, how sure it is (its standing), and the ruling. "Proposed" means the owner has not ruled yet.', ''];
  for (const standing of STANDINGS) {
    const claims = state.claims.filter((claim) => claim.standing === standing.id);
    if (claims.length === 0) continue;
    lines.push(`## ${standing.label}`, '', `_${standing.when}. In a piece: ${standing.wording}._`, '');
    for (const claim of claims) {
      const tags = [claim.ruled ? `ruled ${day(claim.ruled.at)}` : 'proposed', claim.pinned ? 'pinned' : '', claim.addedInContent ? 'added in Content' : '', claim.accuses ? 'accuses' : ''].filter(Boolean).join(', ');
      lines.push(`- **${claim.id}** ${claim.text} _(${tags})_`);
      if (claim.who || claim.where || claim.when) lines.push(`  - Said by ${claim.who || 'not known'}${claim.where ? `, in ${claim.where}` : ''}${claim.when ? `, first seen ${claim.when}` : ''}`);
      for (const id of claim.sources ?? []) if (byId.has(id)) lines.push(`  - Source ${sourceLine(byId.get(id))}`);
      if (claim.passage) lines.push(`  - Passage: "${String(claim.passage).slice(0, 400)}"`);
      if (claim.evidenceFor) lines.push(`  - For: ${claim.evidenceFor}`);
      if (claim.evidenceAgainst) lines.push(`  - Against: ${claim.evidenceAgainst}`);
      if (claim.response) lines.push(`  - Response: ${claim.response.text || 'none found'}${claim.response.searched ? ` (looked in: ${claim.response.searched})` : ''}`);
      for (const step of (claim.history ?? []).slice(0, -1)) lines.push(`  - Earlier: ${labelOf(step.standing)} (${day(step.at)}${step.reason ? `: ${step.reason}` : ''})`);
    }
    lines.push('');
  }
  if (state.claims.length === 0) lines.push('No claims yet.', '');
  if (state.sources.length > 0) lines.push('## Sources', '', ...state.sources.map((source) => `- ${sourceLine(source)}`), '');
  return lines.join('\n');
}

/** The angles and every piece's brief. */
export function briefText(state) {
  const lines = ['# Brief', ''];
  if (state.angles.length > 0) {
    lines.push('## Angles proposed', '');
    for (const angle of state.angles) lines.push(`- **${angle.id}** ${angle.point}${angle.audience ? ` For: ${angle.audience}.` : ''}${angle.opening ? ` Opens with: ${angle.opening}.` : ''}${angle.claims?.length ? ` Leans on ${angle.claims.join(', ')}.` : ''}${angle.weak ? ` Weak or missing: ${angle.weak}.` : ''}`);
    lines.push('');
  }
  for (const piece of state.pieces) {
    const brief = piece.brief ?? {};
    lines.push(`## ${piece.id}: ${piece.title} (${piece.format})`, '', `Status: ${piece.status}${brief.approved ? `, brief approved ${day(brief.approved.at)}` : ', brief not approved yet'}.`, '');
    for (const [label, value] of [['Angle', brief.angle], ['Audience', brief.audience], ['Purpose', brief.purpose], ['Length', brief.length], ['In', brief.in], ['Out', brief.out]]) if (value) lines.push(`- ${label}: ${value}`);
    if ((piece.out ?? []).length > 0) lines.push(`- Claims ruled out of this piece: ${piece.out.join(', ')}`);
    lines.push('');
  }
  if (state.angles.length === 0 && state.pieces.length === 0) lines.push('No angle or brief yet.', '');
  return lines.join('\n');
}

/** Every piece's outline, each point with the claims it rests on and their standing. */
export function outlineText(state) {
  const claims = new Map(state.claims.map((claim) => [claim.id, claim]));
  const lines = ['# Outline', ''];
  for (const piece of state.pieces) {
    const points = piece.outline?.points ?? [];
    if (points.length === 0) continue;
    lines.push(`## ${piece.id}: ${piece.title}`, '');
    points.forEach((point, index) => {
      const rests = point.kind === 'claims'
        ? (point.claims ?? []).map((id) => `${id} ${labelOf(claims.get(id)?.standing ?? '')}`).join(', ')
        : { 'own-view': 'Own view', 'own-experience': 'Own experience', gap: 'GAP: to fill' }[point.kind] ?? point.kind;
      lines.push(`${index + 1}. ${point.text} — ${rests}`);
    });
    lines.push('');
  }
  if (lines.length === 2) lines.push('No outline yet.', '');
  return lines.join('\n');
}
