/**
 * Content's tools for the path from material to a final piece: Research reports, the ledger, the
 * owner's rulings, angles, brief and outline, format cards, the writer, the check, approval,
 * corrections, and a starting text for more research.
 *
 * What is the owner's stays the owner's: a ruling, an approval, an override or a custom card is taken
 * only with words the owner wrote in the conversation (`quote`), checked against his messages.
 */
import { readFileSync, readdirSync, lstatSync } from 'node:fs';
import { basename, join } from 'node:path';
import { STANDING_IDS, SOURCE_KINDS, labelOf, proposeStanding, standingOf } from './standing.js';
import { DECISION_WORDS, nextId, openSubject, ownerDecision, ownerSaid, plainWords } from './subject.js';
import { partFolder, realRoot, saveFile, slugOf } from './folder.js';
import { checkerPrompt, finalText, mechanicalCheck, parseChecker, sentencesOf, writerPrompt } from './writing.js';
import { addCorrection, approvalGaps, fingerprint, kitText, sourcesPage, wordingByClaim, writeVersion } from './final.js';
import { hostOf, listReports, reportSources } from './reports.js';

const CLAIMS_MAX = 30;
const OWN_MAX = 200_000;

/** The first line of a note the assistant saved: such a note is not the user's own words. */
export const ASSISTANT_NOTE = '<!-- Written by the assistant from the conversation: not the user\'s own file. -->';

/** The user's own words in the subject's notes (files the assistant saved are left out), for own experience and for the writer. */
export function ownWords(root) {
  let text = '';
  try {
    const dir = join(root, 'notes');
    if (lstatSync(dir).isSymbolicLink()) return '';
    for (const name of readdirSync(dir).sort()) {
      const path = join(dir, name);
      if (!/\.(md|txt)$/i.test(name) || !lstatSync(path).isFile()) continue;
      const body = readFileSync(path, 'utf8');
      if (body.startsWith(ASSISTANT_NOTE)) continue;
      text += `\n--- ${name} ---\n${body}`;
      if (text.length > OWN_MAX) break;
    }
  } catch {
    return text;
  }
  return text.slice(0, OWN_MAX);
}

/**
 * @param {object} deps - what the tools need.
 * @param {() => boolean} deps.enabled - Content switched on.
 * @param {(exec: object) => string} deps.rootOf - the subject folder of the call.
 * @param {(exec: object) => {text: string}[]} deps.ownerMessages - the user's own messages in the conversation.
 * @param {(exec: object, job: {role: string, label: string, prompt: string}) => Promise<string>} deps.helper - runs a helper model with no tools.
 * @param {object} deps.formats - from openFormats.
 * @param {object} deps.index - from openIndex.
 * @param {() => string} deps.reportsFolder - where the Research tab saves its reports.
 * @returns {object[]} tool definitions.
 */
export function buildPieceTools({ enabled, rootOf, ownerMessages, helper, formats, index, reportsFolder, now = () => new Date() }) {
  const output = {
    schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    render: (_args, value) => [{ type: 'text', text: typeof value?.text === 'string' ? value.text : '' }],
  };
  const safely = (work) => async (args, exec) => {
    if (!enabled()) return { text: 'Content mode is switched off in Settings → Content.' };
    try {
      return { text: await work(args ?? {}, exec) };
    } catch (error) {
      const reason = String(error?.message ?? error).slice(0, 700);
      return { text: `It did not work: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}` };
    }
  };
  const common = { output, isConcurrencySafe: () => false, timeoutMs: 120_000 };
  const str = (value, max = 2000) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
  const list = (value, max = 40) => (Array.isArray(value) ? value : value ? [value] : []).map((item) => str(item, 200)).filter(Boolean).slice(0, max);
  /** The subject: its folder and its record. */
  const subject = (exec) => {
    const root = realRoot(rootOf(exec));
    return { root, store: openSubject(root) };
  };
  const save = (store, state) => {
    const skipped = store.write(state);
    return skipped.length > 0 ? ` (${skipped.join(', ')} ${skipped.length === 1 ? 'is a file' : 'are files'} of yours, so the readable copy was not written; the record is kept)` : '';
  };
  /** The owner's own words for a decision, from their newest message, or a refusal that says why. */
  const needOwner = (exec, quote, what, needs = []) => {
    const words = str(quote, 600);
    if (!words) throw new Error(`${what} is the user's to decide. Ask the user, then pass their own words as "quote".`);
    const said = ownerDecision(ownerMessages(exec), words, { needs });
    if (!said.ok) throw new Error(`Not taken: ${said.why}. ${what} is the user's to decide: ask, and pass their exact words from their answer.`);
    return words;
  };
  /** Claim ids named in the owner's words must cover the claims ruled on. */
  const coversClaims = (quote, ids) => {
    const named = new Set((String(quote).toUpperCase().match(/\bC\d+\b/g) ?? []));
    if (named.size === 0) return;
    const missing = ids.filter((id) => !named.has(id));
    if (missing.length > 0) throw new Error(`The user's words name ${[...named].join(', ')}, not ${missing.join(', ')}. Ask about those too.`);
  };
  const pieceOf = (state, id) => {
    const piece = state.pieces.find((one) => one.id === String(id ?? '').toUpperCase());
    if (!piece) throw new Error(`There is no piece ${id || ''}. ${state.pieces.length > 0 ? `The pieces: ${state.pieces.map((one) => `${one.id} ${one.title}`).join(', ')}.` : 'Make one with content_plan (action brief).'}`);
    return piece;
  };
  const sourceMap = (state) => new Map(state.sources.map((source) => [source.id, source]));
  const claimLine = (claim) => `${claim.id} [${labelOf(claim.standing)}${claim.ruled ? '' : ', proposed'}${claim.pinned ? ', pinned' : ''}] ${claim.text}${(claim.sources ?? []).length ? ` (${claim.sources.join(', ')})` : ''}`;

  const tools = [];

  // ---- Research reports -------------------------------------------------------------------------
  tools.push({
    name: 'content_reports',
    description: 'Research reports the Research tab saved. action "list": the newest, with their titles. action "bring": copy one, as it is, into the subject\'s research/reports, and take its numbered sources into the ledger (with their grades). Then read it and record its claims with content_ledger.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'bring'] }, name: { type: 'string', maxLength: 300, description: 'The report\'s file name, from the list.' } }, required: ['action'], additionalProperties: false },
    ...common,
    execute: safely(async (args, exec) => {
      const folder = reportsFolder();
      const reports = listReports(folder);
      if (args.action === 'list') {
        if (reports.length === 0) return folder ? `No saved Research report in ${folder}.` : 'The Research tab has no report folder here.';
        return ['Saved Research reports, newest first:', ...reports.map((report) => `- ${report.name}: ${report.title}`)].join('\n');
      }
      const name = basename(str(args.name, 300));
      if (!reports.some((report) => report.name === name)) throw new Error(`There is no saved report ${name || '(no name)'}; use action "list".`);
      const text = readFileSync(join(folder, name), 'utf8');
      const { root, store } = subject(exec);
      const file = saveFile(root, { part: 'research/reports', name: name.replace(/^\d{4}-\d\d-\d\d-\d{4}-/, '').replace(/\.md$/, ''), text });
      const state = store.read();
      const mapping = [];
      for (const found of reportSources(text)) {
        let source = state.sources.find((one) => one.url === found.url);
        if (!source) {
          const host = hostOf(found.url);
          source = { id: nextId(state, 'source'), title: '', url: found.url, host, publisher: /\.onion$/i.test(host) ? '' : host, date: '', opened: '', grade: found.grade, kind: found.grade === 'primary' ? 'record' : 'unknown', lane: 'web', origin: 'research', note: `[${found.n}] in ${file}${found.status ? `, ${found.status}` : ''}` };
          state.sources.push(source);
        }
        mapping.push(`[${found.n}] → ${source.id}`);
      }
      const skipped = save(store, state);
      return `Brought in as ${file}. ${mapping.length} source${mapping.length === 1 ? '' : 's'} in the ledger: ${mapping.join(', ') || 'none listed'}${skipped}. Read the report, then record its claims with content_ledger (action add), citing these source ids, with the passage each rests on.`;
    }),
  });

  // ---- the ledger -------------------------------------------------------------------------------
  const claimShape = {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'The claim in one sentence.' },
      who: { type: 'string', description: 'Who says it.' },
      where: { type: 'string', description: 'Where it was said.' },
      when: { type: 'string', description: 'When it was first seen.' },
      sources: { type: 'array', items: { type: 'string' }, description: 'Source ids (S3).' },
      passage: { type: 'string', description: 'The passage of the source it rests on, word for word.' },
      evidenceFor: { type: 'string' },
      evidenceAgainst: { type: 'string' },
      about: { type: 'array', items: { type: 'string' }, description: 'Named people or organisations it is about.' },
      accuses: { type: 'boolean', description: 'It accuses a named person or organisation of something.' },
      disputed: { type: 'boolean', description: 'Sources contradict each other on it.' },
      origin: { type: 'string', enum: ['research', 'recon', 'content', 'owner'], description: 'research: from a Research report; content: you found it in this conversation; owner: the user\'s own experience or view.' },
      kind: { type: 'string', enum: ['experience', 'view'], description: 'For origin owner.' },
      fromOwner: { type: 'string', description: 'For origin owner: the user\'s own words it comes from, as they wrote them in the conversation or in notes/.' },
    },
    required: ['text'],
  };
  tools.push({
    name: 'content_ledger',
    description: [
      'The ledger: every claim, how sure it is (its standing), and its sources. No claim is dropped for being unproven: each gets a standing, and the piece words it that way.',
      'action "show": the claims (optionally of one standing) and the sources.',
      'action "add": record claims (up to 30); the standing is proposed from their sources; the user rules on it later. A claim of origin "owner" (the user\'s own experience or view) needs "fromOwner": the user\'s own words.',
      'action "update": change a claim\'s details (a changed text needs a new ruling).',
      'action "source": add or update sources (title, url, publisher, date, opened, grade primary|confirmed|single, kind record|outlet|person|unknown).',
      'action "response": for a claim that accuses someone, what they said about it (text and source), or that none was found and where you looked.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['show', 'add', 'update', 'source', 'response'] },
        standing: { type: 'string', enum: STANDING_IDS },
        claims: { type: 'array', maxItems: CLAIMS_MAX, items: claimShape },
        claim: { type: 'string', description: 'A claim id (C4), for update and response.' },
        changes: claimShape,
        sources: { type: 'array', maxItems: 40, items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' }, publisher: { type: 'string' }, date: { type: 'string' }, opened: { type: 'string' }, grade: { type: 'string' }, kind: { type: 'string', enum: SOURCE_KINDS }, lane: { type: 'string' }, origin: { type: 'string' }, archived: { type: 'string' }, note: { type: 'string' } } } },
        text: { type: 'string', description: 'For response: what they said.' },
        source: { type: 'string', description: 'For response: its source id.' },
        searched: { type: 'string', description: 'For response: where you looked.' },
      },
      required: ['action'],
      additionalProperties: false,
    },
    ...common,
    execute: safely(async (args, exec) => {
      const { root, store } = subject(exec);
      const state = store.read();
      const sources = sourceMap(state);
      if (args.action === 'show') {
        const want = standingOf(args.standing);
        const claims = state.claims.filter((claim) => !want || claim.standing === want).slice(0, 120);
        const unruled = state.claims.filter((claim) => !claim.ruled && !claim.pinned).length;
        return [
          `${state.claims.length} claim${state.claims.length === 1 ? '' : 's'}, ${unruled} not yet ruled on by the user.${want ? ` Showing ${labelOf(want)}.` : ''}`,
          ...claims.map(claimLine),
          ...(state.sources.length > 0 ? ['', 'Sources:', ...state.sources.slice(0, 120).map((source) => `${source.id}: ${source.title || source.url || 'untitled'}${source.publisher ? `, ${source.publisher}` : ''}${source.grade ? ` (${source.grade})` : ''}`)] : []),
        ].join('\n');
      }
      if (args.action === 'source') {
        const lines = [];
        for (const given of (Array.isArray(args.sources) ? args.sources : []).slice(0, 40)) {
          const url = str(given.url, 2000);
          let source = given.id ? state.sources.find((one) => one.id === str(given.id, 20).toUpperCase()) : url ? state.sources.find((one) => one.url === url) : undefined;
          const made = !source;
          if (!source) {
            source = { id: nextId(state, 'source'), origin: 'content' };
            state.sources.push(source);
          }
          for (const key of ['title', 'publisher', 'date', 'opened', 'lane', 'archived', 'note']) if (given[key] !== undefined) source[key] = str(given[key], 500);
          if (url) {
            source.url = url;
            source.host = hostOf(url);
          }
          if (given.grade !== undefined) source.grade = ['primary', 'confirmed', 'single'].includes(String(given.grade).toLowerCase()) ? String(given.grade).toLowerCase() : '';
          if (given.kind !== undefined) source.kind = SOURCE_KINDS.includes(given.kind) ? given.kind : 'unknown';
          if (given.origin !== undefined && made) source.origin = ['research', 'recon', 'content', 'owner'].includes(given.origin) ? given.origin : 'content';
          lines.push(`${made ? 'Added' : 'Updated'} ${source.id}: ${source.title || source.url || 'untitled'}`);
        }
        // A changed source can change the proposed standing of claims nobody has ruled on.
        for (const claim of state.claims) if (!claim.ruled) claim.standing = claim.proposed = proposeStanding(claim, sourceMap(state));
        return `${lines.join('\n') || 'No source given.'}${save(store, state)}`;
      }
      if (args.action === 'response') {
        const claim = state.claims.find((one) => one.id === str(args.claim, 20).toUpperCase());
        if (!claim) throw new Error(`There is no claim ${args.claim ?? ''}.`);
        const source = str(args.source, 20).toUpperCase();
        if (source && !sources.has(source)) throw new Error(`There is no source ${source}; add it first (action source).`);
        if (!str(args.text) && !str(args.searched)) throw new Error('Give what they said (text and source), or where you looked when nothing was found (searched).');
        claim.response = { text: str(args.text, 3000), source, searched: str(args.searched, 600), at: now().getTime() };
        return `Recorded the response for ${claim.id}: ${claim.response.text ? claim.response.text.slice(0, 160) : `none found (looked in ${claim.response.searched})`}.${save(store, state)}`;
      }
      if (args.action === 'update') {
        const claim = state.claims.find((one) => one.id === str(args.claim, 20).toUpperCase());
        if (!claim) throw new Error(`There is no claim ${args.claim ?? ''}.`);
        const changes = args.changes ?? {};
        const lines = [];
        const before = JSON.stringify([claim.text, claim.sources, claim.passage, claim.about, claim.accuses, claim.disputed]);
        for (const key of ['who', 'where', 'when', 'passage', 'evidenceFor', 'evidenceAgainst']) if (changes[key] !== undefined) claim[key] = str(changes[key], key === 'passage' ? 4000 : 2000);
        if (changes.sources !== undefined) claim.sources = list(changes.sources).map((id) => id.toUpperCase()).filter((id) => sources.has(id));
        if (changes.about !== undefined) claim.about = list(changes.about, 10);
        if (changes.accuses !== undefined) claim.accuses = changes.accuses === true;
        if (changes.disputed !== undefined) claim.disputed = changes.disputed === true;
        if (changes.text !== undefined && str(changes.text)) claim.text = str(changes.text);
        // What the ruling rested on changed (text, sources, passage, who it is about, accusation, dispute): it is open again.
        if (claim.ruled && JSON.stringify([claim.text, claim.sources, claim.passage, claim.about, claim.accuses, claim.disputed]) !== before) {
          lines.push('What the user ruled on changed, so their ruling on it is open again.');
          claim.history.push({ at: now().getTime(), standing: claim.standing, reason: 'the claim, its sources, its passage, or who it is about changed; it needs a new ruling', by: 'tab' });
          claim.ruled = null;
        }
        if (!claim.ruled) claim.standing = claim.proposed = proposeStanding(claim, sources);
        return `Updated ${claimLine(claim)}. ${lines.join(' ')}${save(store, state)}`;
      }
      // add
      const given = (Array.isArray(args.claims) ? args.claims : []).slice(0, CLAIMS_MAX);
      if (given.length === 0) throw new Error('Give at least one claim.');
      const notes = ownWords(root);
      const added = [];
      const refused = [];
      for (const item of given) {
        const text = str(item.text, 1500);
        if (!text) continue;
        const origin = ['research', 'recon', 'content', 'owner'].includes(item.origin) ? item.origin : 'content';
        if (origin === 'owner') {
          const words = str(item.fromOwner, 2000);
          const plain = plainWords(words);
          const inNotes = plain.split(' ').length >= 4 && ` ${plainWords(notes)} `.includes(` ${plain} `);
          const claimWords = plainWords(text).split(' ').filter((word) => word.length >= 4);
          const covered = claimWords.length === 0 ? 0 : claimWords.filter((word) => ` ${plain} `.includes(` ${word} `)).length / claimWords.length;
          if (!words || (!inNotes && !ownerSaid(ownerMessages(exec), words, 40))) {
            refused.push(`"${text.slice(0, 80)}": the user's own experience or view needs their own words (fromOwner, at least four words), as they wrote them in the conversation or in a notes file of theirs. Ask them.`);
            continue;
          }
          if (covered < 0.5) {
            refused.push(`"${text.slice(0, 80)}": the claim must say what the user's words say; most of it is not in "${words.slice(0, 80)}".`);
            continue;
          }
        }
        const claim = {
          id: nextId(state, 'claim'),
          text,
          who: str(item.who, 300),
          where: str(item.where, 300),
          when: str(item.when, 100),
          sources: list(item.sources).map((id) => id.toUpperCase()).filter((id) => sources.has(id)),
          passage: str(item.passage, 4000),
          evidenceFor: str(item.evidenceFor),
          evidenceAgainst: str(item.evidenceAgainst),
          about: list(item.about, 10),
          accuses: item.accuses === true,
          disputed: item.disputed === true,
          origin,
          ...(origin === 'owner' ? { kind: item.kind === 'view' ? 'view' : 'experience', fromOwner: str(item.fromOwner, 2000) } : {}),
          addedInContent: origin === 'content',
          ruled: null,
          pinned: false,
          response: null,
          history: [],
          created: now().getTime(),
        };
        claim.standing = claim.proposed = proposeStanding(claim, sources);
        claim.history.push({ at: claim.created, standing: claim.standing, reason: 'proposed from its sources', by: 'tab' });
        state.claims.push(claim);
        added.push(claimLine(claim));
      }
      const skipped = save(store, state);
      return [added.length > 0 ? `Recorded ${added.length} claim${added.length === 1 ? '' : 's'} (standings proposed; the user rules on them):` : 'Nothing was recorded.', ...added, ...(refused.length > 0 ? ['Not recorded:', ...refused] : []), skipped].filter(Boolean).join('\n');
    }),
  });

  // ---- the owner's rulings ----------------------------------------------------------------------
  tools.push({
    name: 'content_rule',
    description: [
      'Record what the user decided, with their own words as "quote" (checked against their messages: never answer for them).',
      'action "standing": the standing of claims (and why). "use": a claim in or out of a piece ("out" never drops it from the ledger). "pin": reuse the ruling in every later piece.',
      '"brief": the user approves a piece\'s brief. "override": the user keeps sentences the check flagged. "named": the user says yes to unproven statements about a named person.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['standing', 'use', 'pin', 'brief', 'override', 'named'] },
        quote: { type: 'string', description: 'The user\'s own words that say so.' },
        claims: { type: 'array', items: { type: 'string' } },
        standing: { type: 'string', enum: STANDING_IDS },
        use: { type: 'string', enum: ['in', 'out'] },
        pin: { type: 'boolean' },
        reason: { type: 'string' },
        piece: { type: 'string' },
        flags: { type: 'array', items: { type: 'string' } },
        person: { type: 'string' },
        sentences: { type: 'array', items: { type: 'integer' }, description: 'For named: the sentence numbers (from the check) the user said yes to.' },
      },
      required: ['action', 'quote'],
      additionalProperties: false,
    },
    ...common,
    execute: safely(async (args, exec) => {
      const needs = args.action === 'standing' ? DECISION_WORDS[standingOf(args.standing)] ?? [] : args.action === 'named' ? str(args.person, 200).split(/\s+/).filter((word) => word.length > 1) : DECISION_WORDS[args.action] ?? [];
      const quote = needOwner(exec, args.quote, 'This', needs);
      const { store } = subject(exec);
      const state = store.read();
      const at = now().getTime();
      const ids = list(args.claims).map((id) => id.toUpperCase());
      const claims = ids.map((id) => state.claims.find((claim) => claim.id === id)).filter(Boolean);
      if (['standing', 'use', 'pin'].includes(args.action) && claims.length === 0) throw new Error('Name the claims (C3).');
      if (['standing', 'use', 'pin'].includes(args.action)) coversClaims(quote, claims.map((claim) => claim.id));
      if (args.action === 'standing') {
        const standing = standingOf(args.standing);
        if (!standing) throw new Error('Give the standing.');
        if ((standing === 'own-experience' || standing === 'own-view') && claims.some((claim) => claim.origin !== 'owner')) throw new Error('Own experience and own view are for the user\'s own words only (claims of origin owner).');
        for (const claim of claims) {
          claim.history.push({ at, standing, reason: str(args.reason, 400), by: 'owner', quote });
          claim.standing = standing;
          claim.ruled = { standing, at, quote };
        }
        return `Ruled: ${claims.map((claim) => `${claim.id} ${labelOf(standing)}`).join(', ')}.${save(store, state)}`;
      }
      if (args.action === 'pin') {
        for (const claim of claims) claim.pinned = args.pin !== false;
        return `${args.pin === false ? 'Unpinned' : 'Pinned'}: ${claims.map((claim) => claim.id).join(', ')}.${save(store, state)}`;
      }
      const piece = pieceOf(state, args.piece);
      if (args.action === 'use') {
        const out = new Set(piece.out ?? []);
        for (const claim of claims) (args.use === 'out' ? out.add(claim.id) : out.delete(claim.id));
        piece.out = [...out];
        return `${piece.id}: ${claims.map((claim) => claim.id).join(', ')} ${args.use === 'out' ? 'ruled out of this piece (still in the ledger)' : 'in this piece'}.${save(store, state)}`;
      }
      if (args.action === 'brief') {
        if (!piece.brief) throw new Error('This piece has no brief yet.');
        piece.brief.approved = { at, quote, rev: piece.brief.rev };
        return `The user approved the brief of ${piece.id}. Next: the ledger review of the claims the angle needs, then the outline.${save(store, state)}`;
      }
      if (args.action === 'override') {
        const wanted = list(args.flags).map((id) => id.toUpperCase());
        const done = [];
        for (const flag of piece.flags ?? []) if (wanted.includes(flag.id) && flag.status === 'open') {
          flag.status = 'overridden';
          flag.override = { at, quote };
          done.push(flag.id);
        }
        return done.length > 0 ? `Overridden by the user (recorded): ${done.join(', ')}.${save(store, state)}` : 'No open flag of that id.';
      }
      // named: one by one, each statement by its sentence number from the check
      const person = str(args.person, 200);
      const entry = (piece.named ?? []).find((one) => one.person.toLowerCase() === person.toLowerCase());
      if (!entry) throw new Error(`No statement about "${person}" is waiting. The people: ${(piece.named ?? []).map((one) => one.person).join(', ') || 'none'}.`);
      const numbers = (Array.isArray(args.sentences) ? args.sentences : []).map(Number).filter(Number.isInteger);
      const waiting = entry.statements.filter((statement) => statement.risky && !statement.yes);
      const chosen = waiting.filter((statement) => numbers.includes(statement.n));
      if (chosen.length === 0) throw new Error(`Give the sentence numbers the user said yes to, one by one. Waiting about ${entry.person}: ${waiting.map((statement) => `sentence ${statement.n} (${labelOf(statement.standing)}): ${statement.sentence.slice(0, 120)}`).join(' | ') || 'none'}.`);
      for (const statement of chosen) statement.yes = { at, quote };
      return `The user said yes to ${chosen.length} unproven statement${chosen.length === 1 ? '' : 's'} about ${entry.person} in ${piece.id} (sentence ${chosen.map((statement) => statement.n).join(', ')}).${save(store, state)}`;
    }),
  });

  // ---- angles, brief and outline ----------------------------------------------------------------
  tools.push({
    name: 'content_plan',
    description: [
      'What the piece is about, before a word of it is written.',
      'action "angles": propose 3 to 5 angles (point in one sentence, audience, opening, the claims each leans on, what is weak or missing); this replaces the earlier proposals.',
      'action "brief": the brief of a piece (a new piece when "piece" is left out): title, format (a card id from content_formats), angle, audience, purpose, length, what is in and out. A changed brief needs the user\'s approval again.',
      'action "outline": the points of an approved brief\'s piece, in order, each with the claims it rests on, or marked own-view, own-experience or gap.',
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['angles', 'brief', 'outline'] },
        angles: { type: 'array', maxItems: 6, items: { type: 'object', properties: { point: { type: 'string' }, audience: { type: 'string' }, opening: { type: 'string' }, claims: { type: 'array', items: { type: 'string' } }, weak: { type: 'string' } }, required: ['point'] } },
        piece: { type: 'string' },
        title: { type: 'string' },
        format: { type: 'string' },
        angle: { type: 'string' },
        audience: { type: 'string' },
        purpose: { type: 'string' },
        length: { type: 'string' },
        in: { type: 'string' },
        out: { type: 'string' },
        points: { type: 'array', maxItems: 60, items: { type: 'object', properties: { text: { type: 'string' }, claims: { type: 'array', items: { type: 'string' } }, kind: { type: 'string', enum: ['claims', 'own-view', 'own-experience', 'gap'] } }, required: ['text'] } },
      },
      required: ['action'],
      additionalProperties: false,
    },
    ...common,
    execute: safely(async (args, exec) => {
      const { store } = subject(exec);
      const state = store.read();
      const known = new Set(state.claims.map((claim) => claim.id));
      if (args.action === 'angles') {
        const angles = (Array.isArray(args.angles) ? args.angles : []).slice(0, 6).filter((angle) => str(angle.point));
        if (angles.length === 0) throw new Error('Give the angles.');
        state.angles = angles.map((angle) => ({ id: nextId(state, 'angle'), point: str(angle.point, 400), audience: str(angle.audience, 200), opening: str(angle.opening, 300), claims: list(angle.claims).map((id) => id.toUpperCase()).filter((id) => known.has(id)), weak: str(angle.weak, 400) }));
        return `Angles saved (brief.md): ${state.angles.map((angle) => `${angle.id} ${angle.point}`).join(' | ')}. Ask the user to pick one, mix them, or give their own.${save(store, state)}`;
      }
      if (args.action === 'brief') {
        let piece = args.piece ? pieceOf(state, args.piece) : undefined;
        if (!piece) {
          const title = str(args.title, 160);
          if (!title) throw new Error('A new piece needs a title.');
          piece = { id: nextId(state, 'piece'), title, slug: slugOf(title, 'piece'), format: '', brief: { rev: 0 }, outline: { rev: 0, points: [] }, out: [], drafts: [], checks: [], flags: [], named: [], status: 'draft', corrections: [] };
          state.pieces.push(piece);
        }
        if (args.title) {
          piece.title = str(args.title, 160);
          piece.slug = slugOf(piece.title, 'piece');
        }
        if (args.format !== undefined) {
          const card = formats.get(args.format);
          if (!card) throw new Error(`There is no format "${args.format}". The cards: ${formats.list().map((one) => one.id).join(', ')}.`);
          piece.format = card.id;
        }
        const brief = piece.brief ?? { rev: 0 };
        let changed = false;
        for (const key of ['angle', 'audience', 'purpose', 'length', 'in', 'out']) if (args[key] !== undefined && str(args[key], 1500) !== (brief[key] ?? '')) {
          brief[key] = str(args[key], 1500);
          changed = true;
        }
        if (changed || args.format !== undefined) {
          brief.rev = (brief.rev ?? 0) + 1;
          brief.approved = null;
        }
        piece.brief = brief;
        if (!piece.format) piece.format = 'article';
        return `Brief of ${piece.id} "${piece.title}" (${piece.format}) saved in brief.md. ${brief.approved ? '' : 'Ask the user to approve it (content_rule, action brief).'}${save(store, state)}`;
      }
      // outline
      const piece = pieceOf(state, args.piece);
      if (!piece.brief?.approved) throw new Error(`The brief of ${piece.id} is not approved yet: the outline comes after the user approved the brief.`);
      const points = (Array.isArray(args.points) ? args.points : []).slice(0, 60).filter((point) => str(point.text));
      if (points.length === 0) throw new Error('Give the points.');
      const unknown = [];
      piece.outline = {
        rev: (piece.outline?.rev ?? 0) + 1,
        points: points.map((point) => {
          const claims = list(point.claims).map((id) => id.toUpperCase());
          for (const id of claims) if (!known.has(id)) unknown.push(id);
          const ok = claims.filter((id) => known.has(id));
          const kind = ['own-view', 'own-experience', 'gap'].includes(point.kind) ? point.kind : ok.length > 0 ? 'claims' : 'gap';
          return { text: str(point.text, 600), claims: ok, kind };
        }),
      };
      const out = piece.outline.points.flatMap((point) => point.claims).filter((id) => (piece.out ?? []).includes(id));
      const gaps = piece.outline.points.filter((point) => point.kind === 'gap').length;
      return `Outline of ${piece.id} saved in outline.md: ${piece.outline.points.length} points${gaps ? `, ${gaps} marked as gaps to fill` : ''}.${unknown.length ? ` Not in the ledger, left out: ${[...new Set(unknown)].join(', ')}.` : ''}${out.length ? ` Ruled out of this piece but in the outline: ${[...new Set(out)].join(', ')}.` : ''} The user can reorder, cut and add.${save(store, state)}`;
    }),
  });

  // ---- format cards -----------------------------------------------------------------------------
  tools.push({
    name: 'content_formats',
    description: 'Format cards: the shape of each kind of piece (blog post, article, story, talking outline for video or podcast, full script, and the user\'s own). action "list"; "show" one; "save" a new card the user described and approved (their words as quote). Spoken formats default to the talking outline; a full script only when the user asks.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['list', 'show', 'save'] }, id: { type: 'string' }, title: { type: 'string' }, sources: { type: 'string', enum: ['links', 'page', 'notes', 'description'] }, spoken: { type: 'boolean' }, shape: { type: 'string' }, quote: { type: 'string' } }, required: ['action'], additionalProperties: false },
    ...common,
    execute: safely(async (args, exec) => {
      if (args.action === 'list') return ['Format cards:', ...formats.list().map((card) => `- ${card.id}: ${card.title}${card.spoken ? ' (spoken)' : ''}`)].join('\n');
      if (args.action === 'show') {
        const card = formats.get(args.id);
        if (!card) throw new Error(`There is no card "${args.id ?? ''}".`);
        return `${card.title} (${card.id}), sources: ${card.sources}${card.spoken ? ', spoken' : ''}${card.file ? `, file ${card.file}` : ''}\n${card.shape}`;
      }
      needOwner(exec, args.quote, 'A new format card', DECISION_WORDS.card);
      const file = formats.save({ title: args.title, id: args.id || args.title, sources: args.sources, spoken: args.spoken, shape: args.shape });
      return `Saved the card ${file}. It is the user's to edit.`;
    }),
  });

  // ---- the writer -------------------------------------------------------------------------------
  tools.push({
    name: 'content_draft',
    description: 'Have a writer with no tools write the next draft of a piece from its approved brief, its outline, its claims (with their standing and passages), its format card and the user\'s notes. Saved as a new numbered file in drafts/; nothing is replaced. Takes a few minutes. Then check it with content_check.',
    parameters: { type: 'object', properties: { piece: { type: 'string' }, note: { type: 'string', description: 'What the user asked for in this draft (from their words).' } }, required: ['piece'], additionalProperties: false },
    ...common,
    timeoutMs: 20 * 60_000,
    execute: safely(async (args, exec) => {
      const { root, store } = subject(exec);
      const state = store.read();
      const piece = pieceOf(state, args.piece);
      if (!piece.brief?.approved) throw new Error(`The brief of ${piece.id} is not approved yet.`);
      if ((piece.outline?.points ?? []).length === 0) throw new Error(`${piece.id} has no outline yet (content_plan, action outline).`);
      const card = formats.get(piece.format) ?? formats.get('article');
      const prompt = writerPrompt({ piece, card, claims: state.claims, sources: state.sources, ownText: ownWords(root), note: str(args.note, 1500) });
      const text = str(await helper(exec, { role: 'writer', label: `Content: writer of ${piece.id}`, prompt }), 400_000);
      if (!text) throw new Error('The writer gave no text.');
      const file = saveFile(root, { part: 'drafts', name: piece.slug, text });
      const fresh = store.read();
      const same = pieceOf(fresh, piece.id);
      same.drafts.push({ file, at: now().getTime(), by: 'writer' });
      const marks = sentencesOf(text).filter((sentence) => sentence.marks.length > 0).length;
      return `Draft saved as ${file} (${text.split(/\s+/).length.toLocaleString('en-US')} words, ${marks} sentences marked with their claims). Next: content_check ${piece.id}.${save(store, fresh)}`;
    }),
  });

  // ---- the check --------------------------------------------------------------------------------
  tools.push({
    name: 'content_check',
    description: 'Check the latest draft of a piece against the ledger, sentence by sentence: in code (numbers and quotes against the material, claim marks, claims ruled out, gaps, accusations with no response sought, named people) and by a separate checker model with no tools (statements without a claim, wording stronger than the standing, mismatches, things from a model\'s own knowledge, own experience not in the user\'s words). "file": check a draft the user edited (a file in drafts/) as the latest.',
    parameters: { type: 'object', properties: { piece: { type: 'string' }, file: { type: 'string', description: 'A draft file in drafts/, when the user edited one.' } }, required: ['piece'], additionalProperties: false },
    ...common,
    timeoutMs: 15 * 60_000,
    execute: safely(async (args, exec) => {
      const { root, store } = subject(exec);
      let state = store.read();
      let piece = pieceOf(state, args.piece);
      if (args.file) {
        const name = basename(str(args.file, 300));
        const path = join(partFolder(root, 'drafts', { make: false }), name);
        if (!lstatSync(path).isFile()) throw new Error(`${args.file} is not a draft file.`);
        piece.drafts.push({ file: join('drafts', name), at: now().getTime(), by: 'user' });
        store.write(state);
      }
      const draft = piece.drafts.at(-1);
      if (!draft) throw new Error(`${piece.id} has no draft yet.`);
      const text = readFileSync(join(root, draft.file), 'utf8');
      const hash = fingerprint(text);
      const ownText = ownWords(root);
      const sentences = sentencesOf(text);
      const code = mechanicalCheck({ text, claims: state.claims, out: piece.out ?? [], ownText });
      let checked = null;
      let checkerNote = '';
      try {
        const prompt = checkerPrompt({ piece, sentences, claims: state.claims, ownText });
        checked = parseChecker(await helper(exec, { role: 'checker', label: `Content: checker of ${piece.id}`, prompt }), sentences);
        if (!checked) checked = parseChecker(await helper(exec, { role: 'checker', label: `Content: checker of ${piece.id} (format)`, prompt: `${prompt}\n\nYour last answer was not the JSON asked for. Answer with the JSON object only.` }), sentences);
      } catch (error) {
        checkerNote = String(error?.message ?? error).slice(0, 200);
      }
      const flags = [...code.flags, ...(checked ?? [{ n: 0, sentence: '', kind: 'checker', claim: '', why: `The checker gave no usable answer${checkerNote ? ` (${checkerNote})` : ''}.`, fix: 'Run the check again.', by: 'code' }])];
      state = store.read();
      piece = pieceOf(state, args.piece);
      // A yes counts for the very statement it was given to: an edited sentence needs a new one.
      const yesKey = (person, sentence) => `${person}|${plainWords(String(sentence).replace(/\[[^\]]*\]/g, ''))}`;
      const before = new Map((piece.named ?? []).flatMap((entry) => entry.statements.filter((statement) => statement.yes).map((statement) => [yesKey(entry.person, statement.sentence), statement.yes])));
      // Checking the same draft again does not wash away what the checker found before.
      const last = piece.checks.at(-1);
      const kept = last?.hash === hash ? (piece.flags ?? []).filter((flag) => flag.status === 'open' && flag.by === 'checker' && !flags.some((one) => one.n === flag.n && one.kind === flag.kind)) : [];
      piece.flags = [...flags.map((flag) => ({ id: nextId(state, 'flag'), ...flag, status: 'open', draft: draft.file })), ...kept];
      piece.named = code.named.map((entry) => ({ ...entry, statements: entry.statements.map((statement) => ({ ...statement, yes: before.get(yesKey(entry.person, statement.sentence)) ?? null })) }));
      const standings = Object.fromEntries(code.used.filter((id) => state.claims.some((claim) => claim.id === id)).map((id) => {
        const claim = state.claims.find((one) => one.id === id);
        return [id, `${claim.standing}|${claim.ruled ? 'ruled' : ''}|${(claim.about ?? []).join(',')}|${claim.accuses ? 'accuses' : ''}`];
      }));
      piece.checks.push({ draft: draft.file, hash, at: now().getTime(), used: code.used, standings, flags: piece.flags.length });
      const report = [
        `# Check of ${draft.file}`,
        '',
        piece.flags.length === 0 ? 'No flags.' : `${piece.flags.length} flag${piece.flags.length === 1 ? '' : 's'}:`,
        ...piece.flags.map((flag) => `- ${flag.id} sentence ${flag.n} (${flag.kind}${flag.claim ? `, ${flag.claim}` : ''}): ${flag.why}\n  > ${flag.sentence}${flag.fix ? `\n  Fix: ${flag.fix}` : ''}`),
        '',
        ...(piece.named.length > 0 ? ['## Named people', ...piece.named.map((entry) => `- ${entry.person}: ${entry.statements.map((statement) => `sentence ${statement.n} ${labelOf(statement.standing)}${statement.risky ? (statement.yes ? ' (yes given)' : ' (needs the user\'s yes)') : ''}`).join('; ')}`)] : []),
      ].join('\n');
      const reportFile = writeVersion(partFolder(root, 'drafts'), draft.file.replace(/^drafts\//, '').replace(/\.md$/, '.check'), '.md', report);
      const skipped = save(store, state);
      const waiting = piece.named.flatMap((entry) => entry.statements.filter((statement) => statement.risky && !statement.yes).map(() => entry.person));
      return [
        `Checked ${draft.file}: ${piece.flags.length} flag${piece.flags.length === 1 ? '' : 's'} (report ${reportFile.slice(root.length + 1)}).`,
        ...piece.flags.slice(0, 40).map((flag) => `- ${flag.id} sentence ${flag.n}, ${flag.kind}${flag.claim ? ` (${flag.claim})` : ''}: ${flag.why}${flag.fix ? ` Fix: ${flag.fix}` : ''}`),
        waiting.length > 0 ? `Named people with unproven statements that need the user's yes: ${[...new Set(waiting)].join(', ')}.` : '',
        'Show the flags to the user: each is fixed in a new draft, or the user overrides it (content_rule, action override).',
        skipped,
      ].filter(Boolean).join('\n');
    }),
  });

  // ---- approval ---------------------------------------------------------------------------------
  tools.push({
    name: 'content_approve',
    description: 'Make a piece final, only when the user says so (their words as quote) and nothing stands in the way: an approved brief, a checked latest draft, no open flag, a ruling on every claim it uses, and a yes for each unproven statement about a named person. Writes final/<piece>.md (claim marks turned into links or taken out, as the format says), the sources page (Markdown and a web page file), the corrections log, the publish kit (titles, description, chapters, show notes, sign-up offer) and the where-used index. Nothing is posted or sent.',
    parameters: { type: 'object', properties: { piece: { type: 'string' }, quote: { type: 'string' }, reconShown: { type: 'string', enum: ['description', 'address'], description: 'How a source from Recon appears on the sources page: a description (the default) or its address, as the user chose.' }, titles: { type: 'array', maxItems: 8, items: { type: 'string' } }, description: { type: 'string' }, showNotes: { type: 'string' } }, required: ['piece', 'quote'], additionalProperties: false },
    ...common,
    execute: safely(async (args, exec) => {
      const quote = needOwner(exec, args.quote, 'Making a piece final', DECISION_WORDS.final);
      if (args.reconShown === 'address' && !/\baddress(es)?\b/i.test(quote)) throw new Error('Printing the addresses of sources from Recon is the user\'s choice: their words must say so ("show the addresses").');
      const { root, store } = subject(exec);
      const state = store.read();
      const piece = pieceOf(state, args.piece);
      if (piece.status === 'final') throw new Error(`${piece.id} is final already. A change is a correction (content_correct).`);
      const draft = piece.drafts.at(-1);
      const text = draft ? readFileSync(join(root, draft.file), 'utf8') : '';
      const gaps = approvalGaps(state, piece, draft ? { hash: fingerprint(text), used: mechanicalCheck({ text, claims: state.claims, out: piece.out ?? [] }).used } : {});
      if (gaps.length > 0) throw new Error(`Not yet: ${gaps.join(' ')}`);
      const card = formats.get(piece.format) ?? formats.get('article');
      const sentences = sentencesOf(text);
      // final/ takes only what approval writes: content_save cannot write there.
      const finalFolder = partFolder(root, 'final', { allow: ['final'] });
      const at = now();
      const finalFile = writeVersion(finalFolder, piece.slug, '.md', finalText(text, { claims: state.claims, sources: state.sources, links: card.sources === 'links' }));
      const stem = basename(finalFile).replace(/\.md$/, '');
      const used = mechanicalCheck({ text, claims: state.claims, out: piece.out ?? [] }).used;
      const page = sourcesPage({ title: piece.title, used, claims: state.claims, sources: state.sources, reconShown: args.reconShown === 'address' ? 'address' : 'description', at });
      const sourcesMd = writeVersion(finalFolder, `${stem}.sources`, '.md', page.markdown);
      const sourcesHtml = writeVersion(finalFolder, `${stem}.sources`, '.html', page.html);
      const log = writeVersion(finalFolder, `${stem}.corrections`, '.md', `# Corrections log: ${piece.title}\n\nThe final piece is never changed: a corrected version is saved beside it, and each correction is added here.\n`);
      const kit = writeVersion(partFolder(root, 'publish'), `${at.toISOString().slice(0, 10)}-${piece.slug}-kit`, '.md', kitText({ piece, titles: list(args.titles, 8), description: str(args.description, 3000), showNotes: str(args.showNotes, 6000), sourcesFile: sourcesMd.slice(root.length + 1) }));
      const rel = (path) => path.slice(root.length + 1);
      piece.status = 'final';
      piece.final = { file: rel(finalFile), sources: [rel(sourcesMd), rel(sourcesHtml)], log: rel(log), kit: rel(kit), at: at.getTime(), quote, draft: draft.file };
      index.add({ subject: root, piece: `${piece.id} ${piece.title}`, file: join(root, piece.final.file), at: at.toISOString(), uses: wordingByClaim(sentences), claims: state.claims, sources: state.sources });
      return `${piece.id} "${piece.title}" is final: ${piece.final.file}. Sources page: ${piece.final.sources.join(' and ')} (${page.sources.length} sources). Corrections log: ${piece.final.log}. Publish kit: ${piece.final.kit}. Nothing was posted or sent.${save(store, state)}`;
    }),
  });

  // ---- corrections ------------------------------------------------------------------------------
  tools.push({
    name: 'content_correct',
    description: 'When a claim\'s standing changes after a piece is final. action "standing": record the new standing with the user\'s words and the reason, and list every final piece (in any subject) that used it, with its wording, so you can draft a correction note for each. action "note": add a correction note to a final piece\'s log, and save a corrected version beside it (never replacing it), with the user\'s words.',
    parameters: { type: 'object', properties: { action: { type: 'string', enum: ['standing', 'note'] }, claim: { type: 'string' }, standing: { type: 'string', enum: STANDING_IDS }, reason: { type: 'string' }, quote: { type: 'string' }, piece: { type: 'string' }, note: { type: 'string' }, text: { type: 'string', description: 'The corrected piece, whole.' } }, required: ['action', 'quote'], additionalProperties: false },
    ...common,
    execute: safely(async (args, exec) => {
      const quote = needOwner(exec, args.quote, 'A correction', args.action === 'standing' ? [...DECISION_WORDS.correct, ...(DECISION_WORDS[standingOf(args.standing)] ?? [])] : DECISION_WORDS.correct);
      const { root, store } = subject(exec);
      const state = store.read();
      const claim = state.claims.find((one) => one.id === str(args.claim, 20).toUpperCase());
      if (args.action === 'standing') {
        if (!claim) throw new Error(`There is no claim ${args.claim ?? ''}.`);
        const standing = standingOf(args.standing);
        if (!standing) throw new Error('Give the new standing.');
        if ((standing === 'own-experience' || standing === 'own-view') && claim.origin !== 'owner') throw new Error('Own experience and own view are for the user\'s own words only (claims of origin owner).');
        const from = claim.standing;
        claim.history.push({ at: now().getTime(), standing, reason: str(args.reason, 400), by: 'owner', quote });
        claim.standing = standing;
        claim.ruled = { standing, at: now().getTime(), quote };
        claim.changedFrom = from;
        const uses = index.usesOf(root, claim.id, claim.text);
        return [`${claim.id} is now ${labelOf(standing)} (was ${labelOf(from)}).`, uses.length === 0 ? 'No final piece used it.' : `Final pieces that used it (draft a correction note for each, and let the user decide):`, ...uses.map((use) => `- ${use.piece}: ${use.file}\n  wording: ${use.wording.join(' / ').slice(0, 500)}`), save(store, state)].filter(Boolean).join('\n');
      }
      const piece = pieceOf(state, args.piece);
      if (piece.status !== 'final') throw new Error(`${piece.id} is not final: change its draft instead.`);
      if (!str(args.note)) throw new Error('Give the correction note.');
      const finalFolder = partFolder(root, 'final', { allow: ['final'] });
      let version = '';
      if (str(args.text, 400_000)) version = writeVersion(finalFolder, basename(piece.final.file).replace(/\.md$/, ''), '.md', str(args.text, 400_000)).slice(root.length + 1);
      addCorrection(join(root, piece.final.log), { at: now(), claim: claim ? `${claim.id} ${claim.text.slice(0, 120)}` : 'correction', from: claim?.changedFrom ?? claim?.standing ?? '', to: claim?.standing ?? '', reason: str(args.reason, 400), note: str(args.note, 3000), version });
      piece.corrections.push({ at: now().getTime(), claim: claim?.id ?? '', note: str(args.note, 3000), version, quote });
      return `Added to ${piece.final.log}${version ? `; corrected version saved as ${version} (the earlier final stays)` : ''}.${save(store, state)}`;
    }),
  });

  // ---- more research ----------------------------------------------------------------------------
  tools.push({
    name: 'content_continue',
    description: 'A starting text for a new Research or Recon conversation about a subject that needs more, or one claim: the question, the claim and what is known. The user starts that conversation and pastes it. What Recon finds comes back only through Recon\'s own way out.',
    parameters: { type: 'object', properties: { to: { type: 'string', enum: ['research', 'recon'] }, question: { type: 'string' }, claim: { type: 'string' } }, required: ['to', 'question'], additionalProperties: false },
    ...common,
    isConcurrencySafe: () => true,
    execute: safely(async (args, exec) => {
      const { store } = subject(exec);
      const state = store.read();
      const claim = args.claim ? state.claims.find((one) => one.id === str(args.claim, 20).toUpperCase()) : undefined;
      const sources = sourceMap(state);
      const known = claim ? (claim.sources ?? []).map((id) => sources.get(id)).filter(Boolean).filter((source) => args.to === 'recon' || source.origin !== 'recon') : [];
      const text = [
        str(args.question, 1500),
        ...(claim ? ['', `The claim: ${claim.text} (now ${labelOf(claim.standing)}).`, claim.who ? `Said by ${claim.who}${claim.where ? ` in ${claim.where}` : ''}${claim.when ? `, ${claim.when}` : ''}.` : '', claim.evidenceAgainst ? `Against it: ${claim.evidenceAgainst}` : ''] : []),
        ...(known.length > 0 ? ['', 'What is known so far:', ...known.map((source) => `- ${source.title || source.publisher || source.url}${source.url && !/\.onion\b/i.test(source.url) ? ` ${source.url}` : ''}`)] : []),
      ].filter((line) => line !== undefined).join('\n');
      return `Starting text for a new ${args.to === 'recon' ? 'Recon' : 'Research'} conversation (the user opens it in that tab and pastes this):\n\n${text}`;
    }),
  });

  return tools;
}
