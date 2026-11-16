/**
 * Content's path from material to a final piece (C2 Content's side, C3 to C7, C9, C11, C12, C13, C15),
 * with stand-ins: the user's messages, the writer and the checker are given, never a real model.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPieceTools } from '../lib/piece-tools.js';
import { openFormats, parseCard, BUILT_IN } from '../lib/formats.js';
import { openIndex, approvalGaps } from '../lib/final.js';
import { DECISION_WORDS, MARK, openSubject, ownerDecision, ownerSaid, writeOwnCopy } from '../lib/subject.js';
import { proposeStanding } from '../lib/standing.js';
import { finalText, mechanicalCheck, parseChecker, sentencesOf, writerPrompt } from '../lib/writing.js';
import { reportSources } from '../lib/reports.js';
import { folderNote, statusOf, METHOD } from '../lib/mode.js';

const scratch = (name = 'content-piece-') => mkdtempSync(join(tmpdir(), name));

test('the first standing follows the plan\'s rules', () => {
  const sources = new Map([
    ['S1', { id: 'S1', grade: 'confirmed', publisher: 'a' }],
    ['S2', { id: 'S2', kind: 'outlet', publisher: 'Daily' }],
    ['S3', { id: 'S3', kind: 'person', publisher: 'blog of X' }],
    ['S4', { id: 'S4', kind: 'outlet', publisher: 'Other' }],
  ]);
  assert.equal(proposeStanding({ sources: ['S1'] }, sources), 'established');
  assert.equal(proposeStanding({ sources: ['S2'] }, sources), 'reported');
  assert.equal(proposeStanding({ sources: ['S3'] }, sources), 'claimed');
  assert.equal(proposeStanding({ sources: [] }, sources), 'unsubstantiated');
  assert.equal(proposeStanding({ sources: ['S2'], disputed: true }, sources), 'disputed');
  assert.equal(proposeStanding({ sources: ['S2', 'S4'] }, sources), 'established', 'two independent outlets');
  assert.equal(proposeStanding({ origin: 'owner', kind: 'experience' }, sources), 'own-experience');
  assert.equal(proposeStanding({ origin: 'owner', kind: 'view' }, sources), 'own-view');
});

test("a decision: the user's newest message, whole words, no 'not', words that say the decision (the review's cases)", () => {
  const said = (...texts) => texts.map((text) => ({ text }));
  const ok = (messages, quote, needs = []) => ownerDecision(messages, quote, { needs }).ok;
  assert.equal(ok(said('Look at the heat pump report.'), 'the'), false, 'one word picked out of a message');
  assert.equal(ok(said('Do not approve the brief yet.'), 'approve the brief', DECISION_WORDS.brief), false, 'a "not" just before');
  assert.equal(ok(said('Approve the brief.', 'Change the audience.'), 'Approve the brief', DECISION_WORDS.brief), false, 'old words, not the newest message');
  assert.equal(ok(said('Approve the brief.'), 'approve the brief', DECISION_WORDS.brief), true);
  assert.equal(ok(said('Yes'), 'Yes', DECISION_WORDS.brief), true, 'a whole short yes');
  assert.equal(ok(said('yes I think it is too long'), 'yes', DECISION_WORDS.brief), false, 'a yes picked out of a longer message');
  assert.equal(ok(said('C1 established, C2 claimed'), 'C1 established', DECISION_WORDS.claimed), false, 'words that say another decision');
  assert.equal(ok(said('C1 established, C2 claimed'), 'C2 claimed', DECISION_WORDS.claimed), true);
  // Own experience: the user's own account, at least four words, in a recent message.
  assert.equal(ownerSaid(said('I switched in 2022 and my bills fell.'), 'I switched in 2022'), true);
  assert.equal(ownerSaid(said('I switched in 2022 and my bills fell.'), 'e'), false);
  assert.equal(ownerSaid(said('I switched in 2022 and my bills fell.'), 'my bills'), false, 'fewer than four words');
});

test('the readable copies carry the tab\'s mark; a file of the user\'s with that name is left alone', () => {
  const root = scratch();
  try {
    writeFileSync(join(root, 'ledger.md'), 'my own ledger');
    const store = openSubject(root);
    const state = store.read();
    state.claims.push({ id: 'C1', text: 'x', standing: 'reported', history: [] });
    assert.deepEqual(store.write(state), ['ledger.md']);
    assert.equal(readFileSync(join(root, 'ledger.md'), 'utf8'), 'my own ledger');
    assert.ok(readFileSync(join(root, 'brief.md'), 'utf8').startsWith(MARK));
    assert.equal(store.read().claims[0].id, 'C1');
    assert.equal(writeOwnCopy(root, 'brief.md', 'again'), true, 'its own copy is rewritten');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a Research report\'s numbered sources and their grades are read', () => {
  const text = '# Q\n\nBody [1] [2].\n\n## Sources\n[1] https://a.example/x (read · Confirmed)\n[2] https://b.example/y (seen only in search results, not read)\n[3] https://gov.example/doc (read · Primary)\n\n## Checks\n- x';
  assert.deepEqual(reportSources(text), [
    { n: 1, url: 'https://a.example/x', status: 'read', grade: 'confirmed' },
    { n: 2, url: 'https://b.example/y', status: 'seen only in search results, not read', grade: '' },
    { n: 3, url: 'https://gov.example/doc', status: 'read', grade: 'primary' },
  ]);
});

test('format cards: the built-ins become files once; a card the owner changed is kept; parseCard', () => {
  const dir = join(scratch(), 'formats');
  try {
    const formats = openFormats(() => dir);
    assert.equal(formats.list().length, BUILT_IN.length);
    writeFileSync(join(dir, 'blog-post.md'), '# My blog\nid: blog-post\nsources: page\nspoken: no\n---\nShort and funny.\n');
    assert.equal(openFormats(() => dir).get('blog-post').shape, 'Short and funny.', 'not written over');
    assert.throws(() => formats.save({ title: 'Blog post', shape: 'x' }), /already there/);
    assert.match(formats.save({ title: 'Newsletter', shape: 'A greeting, three items, a sign-off.', sources: 'links' }), /newsletter\.md$/);
    assert.equal(parseCard('no shape'), undefined);
  } finally {
    rmSync(join(dir, '..'), { recursive: true, force: true });
  }
});

test('sentences and claim marks; the checks code can do', () => {
  const claims = [
    { id: 'C1', text: 'Sales rose 34% in 2023', passage: 'sales rose by 34% in 2023, the agency said', standing: 'reported', about: [], sources: ['S1'] },
    { id: 'C2', text: 'X took money from Y', passage: 'X took money', standing: 'claimed', about: ['X Person'], accuses: true, sources: [] },
    { id: 'C3', text: 'Ruled out', standing: 'reported', sources: [] },
  ];
  const text = '# Heat pumps\n\nSales rose 34% in 2023, the agency says [C1]. They rose 50% in 2024 [C1]. "This is a quote that nobody said at all" [C1].\nX Person took money, according to a rival [C2]. Something [C3]. Also [C9]. [GAP: the 2025 figure]';
  const sentences = sentencesOf(text);
  assert.deepEqual(sentences.slice(0, 3).map((one) => one.marks), [[], ['C1'], ['C1']]);
  const { flags, used, named } = mechanicalCheck({ text, claims, out: ['C3'] });
  const kinds = flags.map((flag) => flag.kind).sort();
  assert.deepEqual(kinds, ['gap', 'no-response', 'number', 'number', 'quote', 'ruled-out', 'unknown-claim'], '50% and 2024 are in none of the material; the gap\'s 2025 is not a claim');
  assert.ok(flags.filter((flag) => flag.kind === 'number').every((flag) => flag.sentence.includes('50%')));
  assert.deepEqual(used.sort(), ['C1', 'C2', 'C3', 'C9']);
  assert.equal(named.length, 1);
  assert.equal(named[0].person, 'X Person');
  assert.equal(named[0].statements[0].risky, true);
  assert.deepEqual(parseChecker('Sure! {"flags": [{"n": 2, "kind": "too-strong", "claim": "C1", "why": "x", "fix": "y"}, {"n": 99}]}', sentences).map((flag) => [flag.n, flag.kind]), [[2, 'too-strong']]);
  assert.equal(parseChecker('no json', sentences), null);
  const sources = [{ id: 'S1', url: 'https://agency.example/report', publisher: 'Agency' }, { id: 'S9', url: 'http://abc.onion/x', origin: 'recon' }];
  assert.equal(finalText('Up 34% [C1].', { claims, sources, links: true }), 'Up 34% ([Agency](https://agency.example/report)).');
  assert.equal(finalText('Up 34% [C1]. Mine [view].', { claims, sources, links: false }), 'Up 34%. Mine.');
});

test('the writer\'s task: the claims with their standing and passages, the ruled-out claims named as such, the rules', () => {
  const piece = { brief: { angle: 'Growth', audience: 'homeowners' }, outline: { points: [{ text: 'The growth', claims: ['C1'], kind: 'claims' }, { text: 'What is missing', claims: [], kind: 'gap' }] }, out: ['C3'] };
  const claims = [{ id: 'C1', text: 'Sales rose', standing: 'reported', passage: 'sales rose', sources: [] }, { id: 'C3', text: 'Secret thing', standing: 'claimed', sources: [] }];
  const prompt = writerPrompt({ piece, card: BUILT_IN[0], claims, sources: [] });
  assert.match(prompt, /You have no tools/);
  assert.match(prompt, /C1 \[Reported\] Sales rose\n  passage: "sales rose"/);
  assert.match(prompt, /Ruled out of this piece by the owner \(never use them\):\n- C3: Secret thing/);
  assert.match(prompt, /\[GAP: what is missing\]/);
  assert.match(prompt, /Nothing is invented/);
});

/** Content's piece tools on a throwaway subject, with stand-ins for the user, the writer and the checker. */
function desk({ said = [], writer = 'Draft.', checker = '{"flags": []}' } = {}) {
  const root = scratch();
  const home = scratch('content-home-');
  const reports = join(home, 'research', 'reports');
  mkdirSync(reports, { recursive: true });
  const messages = [...said];
  const jobs = [];
  const tools = buildPieceTools({
    enabled: () => true,
    rootOf: () => root,
    ownerMessages: () => messages.map((text) => ({ text })),
    helper: async (_exec, job) => {
      jobs.push(job);
      return job.role === 'writer' ? (typeof writer === 'function' ? writer(job) : writer) : (typeof checker === 'function' ? checker(job) : checker);
    },
    formats: openFormats(() => join(home, 'content', 'formats')),
    index: openIndex(() => join(home, 'content', 'where-used.json')),
    reportsFolder: () => reports,
    now: () => new Date(Date.UTC(2026, 10, 17, 9)),
  });
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const call = async (name, args) => (await byName.get(name).execute(args, { agent: { id: 'c1' } })).text;
  return { root, home, reports, jobs, call, say: (text) => messages.push(text), state: () => openSubject(root).read(), close: () => { rmSync(root, { recursive: true, force: true }); rmSync(home, { recursive: true, force: true }); } };
}

test('end to end: a Research report in, claims, rulings, angles, brief, outline, draft, check, approval, sources page, kit, where-used, correction', async () => {
  const draft = '# Heat pumps are taking over\n\nSales rose 34% in 2023, according to the Agency [C1]. The installer says demand doubled [C2]. I switched in 2022 and my bills fell [C3].';
  const app = desk({ writer: draft, checker: '{"flags": []}' });
  try {
    writeFileSync(join(app.reports, '2026-11-14-2227-how-fast-are-heat-pumps-growing.md'), '# How fast are heat pumps growing?\n\nBody [1] [2].\n\n## Sources\n[1] https://agency.example/report (read · Confirmed)\n[2] https://installer.example/blog (read)\n');
    assert.match(await app.call('content_reports', { action: 'list' }), /how-fast-are-heat-pumps-growing\.md: How fast are heat pumps growing\?/);
    const brought = await app.call('content_reports', { action: 'bring', name: '2026-11-14-2227-how-fast-are-heat-pumps-growing.md' });
    assert.match(brought, /Brought in as research\/reports\/\d{4}-\d\d-\d\d-how-fast-are-heat-pumps-growing\.md\. 2 sources in the ledger: \[1\] → S1, \[2\] → S2/);
    assert.match(await app.call('content_reports', { action: 'bring', name: '../../etc/passwd' }), /no saved report/);
    await app.call('content_ledger', { action: 'source', sources: [{ id: 'S1', title: 'Heat pump report 2024', publisher: 'Agency', kind: 'outlet' }, { id: 'S2', title: 'Our year', publisher: 'Installer Co', kind: 'person' }] });
    // Own experience needs the user's own words.
    const refused = await app.call('content_ledger', { action: 'add', claims: [{ text: 'I switched in 2022 and my bills fell', origin: 'owner', kind: 'experience', fromOwner: 'I switched in 2022' }] });
    assert.match(refused, /Nothing was recorded[\s\S]*needs their own words/);
    app.say('I switched in 2022 and my bills fell by a third.');
    const added = await app.call('content_ledger', { action: 'add', claims: [
      { text: 'Heat pump sales rose 34% in 2023', who: 'the Agency', sources: ['S1'], passage: 'Sales of heat pumps rose by 34% in 2023.' },
      { text: 'Demand doubled', who: 'Installer Co', sources: ['S2'], passage: 'demand doubled this year', about: ['Installer Co'] },
      { text: 'I switched in 2022 and my bills fell', origin: 'owner', kind: 'experience', fromOwner: 'I switched in 2022 and my bills fell' },
    ] });
    assert.match(added, /C1 \[Established, proposed\]/, 'the Agency source is graded Confirmed');
    assert.match(added, /C2 \[Claimed, proposed\]/);
    assert.match(added, /C3 \[Own experience, proposed\]/);
    // Rulings need the user's words.
    assert.match(await app.call('content_rule', { action: 'standing', claims: ['C2'], standing: 'reported', quote: 'C2 is reported' }), /not in the user's newest message/);
    app.say('C1 established, C2 is claimed, C3 is my experience.');
    assert.match(await app.call('content_rule', { action: 'standing', claims: ['C1'], standing: 'established', quote: 'C1 established' }), /Ruled: C1 Established/);
    assert.match(await app.call('content_rule', { action: 'standing', claims: ['C2'], standing: 'claimed', quote: 'C2 is claimed' }), /Ruled: C2 Claimed/);
    assert.match(await app.call('content_rule', { action: 'standing', claims: ['C3'], standing: 'own-experience', quote: 'C3 is my experience' }), /Ruled: C3 Own experience/);
    assert.match(await app.call('content_rule', { action: 'standing', claims: ['C2'], standing: 'established', quote: 'C1 established' }), /name C1, not C2/, 'words about C1 do not rule C2');
    app.say('C1 is my view.');
    assert.match(await app.call('content_rule', { action: 'standing', claims: ['C1'], standing: 'own-view', quote: 'C1 is my view' }), /are for the user's own words only/);
    // Angles, brief, outline.
    assert.match(await app.call('content_plan', { action: 'angles', angles: [{ point: 'Heat pumps are taking over', claims: ['C1', 'C2'] }, { point: 'What switching did for me', claims: ['C3'] }] }), /A1 Heat pumps are taking over \| A2/);
    assert.match(await app.call('content_plan', { action: 'brief', title: 'Heat pumps are taking over', format: 'blog-post', angle: 'A1 with my own switch', audience: 'homeowners', length: '600 words' }), /Brief of P1 .* Ask the user to approve it/);
    assert.match(await app.call('content_plan', { action: 'outline', piece: 'P1', points: [{ text: 'x', claims: ['C1'] }] }), /not approved yet/);
    app.say('Approve the brief.');
    assert.match(await app.call('content_rule', { action: 'brief', piece: 'P1', quote: 'Approve the brief' }), /approved the brief of P1/);
    assert.match(await app.call('content_plan', { action: 'outline', piece: 'P1', points: [{ text: 'The growth', claims: ['C1', 'C2', 'C99'] }, { text: 'My switch', claims: ['C3'], kind: 'own-experience' }] }), /2 points\. Not in the ledger, left out: C99/);
    // Draft by the writer (no tools), check, approval gates.
    assert.match(await app.call('content_draft', { piece: 'P1' }), /Draft saved as drafts\/001-heat-pumps-are-taking-over\.md .* 3 sentences marked/);
    assert.equal(app.jobs[0].role, 'writer');
    assert.match(app.jobs[0].prompt, /C1 \[Established\] Heat pump sales rose 34% in 2023/);
    assert.match(app.jobs[0].prompt, /C3 \[Own experience\] I switched in 2022 and my bills fell\n  the owner's own words: "I switched in 2022 and my bills fell"/, 'the user\'s own words go with the claim');
    assert.match(app.jobs[0].prompt, /2\. My switch — C3, the owner's own experience/);
    app.say('Make it final.');
    assert.match(await app.call('content_approve', { piece: 'P1', quote: 'Make it final' }), /has not been checked yet/);
    const checked = await app.call('content_check', { piece: 'P1' });
    assert.match(checked, /Checked drafts\/001-heat-pumps-are-taking-over\.md: 0 flags/);
    assert.match(checked, /Named people with unproven statements that need the user's yes: Installer Co/);
    assert.ok(existsSync(join(app.root, 'drafts', '001-heat-pumps-are-taking-over.check.md')));
    assert.match(await app.call('content_approve', { piece: 'P1', quote: 'Make it final' }), /need the owner's yes one by one: Installer Co/);
    app.say('Yes for Installer Co, sentence 4.');
    assert.match(await app.call('content_rule', { action: 'named', piece: 'P1', person: 'Installer Co', quote: 'Yes for Installer Co' }), /Give the sentence numbers/);
    const waiting = app.state().pieces[0].named.find((entry) => entry.person === 'Installer Co').statements.filter((statement) => statement.risky).map((statement) => statement.n);
    assert.match(await app.call('content_rule', { action: 'named', piece: 'P1', person: 'Installer Co', quote: 'Yes for Installer Co', sentences: waiting }), /said yes to 1 unproven statement about Installer Co in P1/);
    app.say('Make it final.');
    const final = await app.call('content_approve', { piece: 'P1', quote: 'Make it final', titles: ['Heat pumps are taking over'], description: 'Why sales are rising.' });
    assert.match(final, /P1 "Heat pumps are taking over" is final: final\/heat-pumps-are-taking-over\.md\. Sources page: final\/heat-pumps-are-taking-over\.sources\.md and final\/heat-pumps-are-taking-over\.sources\.html \(2 sources\)/);
    const piece = readFileSync(join(app.root, 'final', 'heat-pumps-are-taking-over.md'), 'utf8');
    assert.match(piece, /according to the Agency \(\[Agency\]\(https:\/\/agency\.example\/report\)\)\./, 'a blog post links its sources in the text');
    assert.doesNotMatch(piece, /\[C\d\]/);
    const page = readFileSync(join(app.root, 'final', 'heat-pumps-are-taking-over.sources.md'), 'utf8');
    assert.match(page, /\[Heat pump report 2024\]\(https:\/\/agency\.example\/report\) — Agency/);
    assert.match(page, /Supports: Heat pump sales rose 34% in 2023 \(Established\)\. Passage: "Sales of heat pumps rose by 34% in 2023\."/);
    assert.match(page, /## The author's own experience and views\n\n- Own experience: I switched in 2022/);
    assert.match(readFileSync(join(app.root, 'final', 'heat-pumps-are-taking-over.sources.html'), 'utf8'), /^<!doctype html>/);
    const kit = readdirSync(join(app.root, 'publish'))[0];
    assert.match(readFileSync(join(app.root, 'publish', kit), 'utf8'), /## Chapters \(from the outline\)\n1\. The growth\n2\. My switch[\s\S]*## Sign-up offer/);
    const index = JSON.parse(readFileSync(join(app.home, 'content', 'where-used.json'), 'utf8'));
    const key = Object.keys(index.claims).find((one) => one.endsWith('#C1'));
    assert.match(index.claims[key].uses[0].wording[0], /^Sales rose 34% in 2023, according to the Agency\.$/);
    assert.match(await app.call('content_approve', { piece: 'P1', quote: 'Make it final' }), /final already/);
    // A correction: the standing changes, the final pieces that used it are listed, a note and a new version.
    app.say('C2 is now disputed: the installer withdrew it.');
    const listed = await app.call('content_correct', { action: 'standing', claim: 'C2', standing: 'disputed', reason: 'the installer withdrew it', quote: 'C2 is now disputed' });
    assert.match(listed, /C2 is now Disputed \(was Claimed\)\.\nFinal pieces that used it[\s\S]*wording: The installer says demand doubled\./);
    app.say('Add the correction.');
    const corrected = await app.call('content_correct', { action: 'note', piece: 'P1', claim: 'C2', note: 'The installer withdrew the figure.', text: piece.replace('The installer says demand doubled.', ''), quote: 'Add the correction' });
    assert.match(corrected, /corrected version saved as final\/heat-pumps-are-taking-over-v2\.md \(the earlier final stays\)/);
    assert.equal(readFileSync(join(app.root, 'final', 'heat-pumps-are-taking-over.md'), 'utf8'), piece, 'the final piece is never changed');
    assert.match(readFileSync(join(app.root, 'final', 'heat-pumps-are-taking-over.corrections.md'), 'utf8'), /Standing: Claimed → Disputed\n- Note: The installer withdrew the figure\.\n- Corrected version: final\/heat-pumps-are-taking-over-v2\.md/);
    // Where the work stands, for the note.
    assert.match(statusOf(app.state()), /P1 "Heat pumps are taking over" \(blog-post\): final\./);
  } finally {
    app.close();
  }
});

test('a check that finds flags: approval waits until each is fixed in a new draft or overridden by the user', async () => {
  let n = 0;
  const app = desk({ writer: () => (n++ === 0 ? 'Sales tripled in 2023 [C1].' : 'Sales rose 34% in 2023, according to the Agency [C1].'), checker: (job) => (job.prompt.includes('tripled') ? '{"flags": [{"n": 1, "kind": "too-strong", "claim": "C1", "why": "tripled is not 34%", "fix": "Sales rose 34%"}]}' : '{"flags": []}') });
  try {
    await app.call('content_ledger', { action: 'source', sources: [{ title: 'Report', url: 'https://agency.example/r', publisher: 'Agency', grade: 'confirmed' }] });
    await app.call('content_ledger', { action: 'add', claims: [{ text: 'Sales rose 34% in 2023', sources: ['S1'], passage: 'rose by 34% in 2023' }] });
    app.say('C1 established.');
    await app.call('content_rule', { action: 'standing', claims: ['C1'], standing: 'established', quote: 'C1 established' });
    await app.call('content_plan', { action: 'brief', title: 'Sales', format: 'article', angle: 'growth' });
    app.say('Approve the brief.');
    await app.call('content_rule', { action: 'brief', piece: 'P1', quote: 'Approve the brief' });
    app.say('Make it final.');
    await app.call('content_plan', { action: 'outline', piece: 'P1', points: [{ text: 'Growth', claims: ['C1'] }] });
    await app.call('content_draft', { piece: 'P1' });
    const checked = await app.call('content_check', { piece: 'P1' });
    assert.match(checked, /F\d sentence 1, too-strong \(C1\): tripled is not 34% Fix: Sales rose 34%/);
    assert.match(await app.call('content_approve', { piece: 'P1', quote: 'Make it final' }), /1 flag is open/);
    // A new draft, checked again: no flags.
    await app.call('content_draft', { piece: 'P1', note: 'use the 34%' });
    assert.match(await app.call('content_approve', { piece: 'P1', quote: 'Make it final' }), /latest draft \(drafts\/002-sales\.md\) has not been checked/);
    assert.match(await app.call('content_check', { piece: 'P1' }), /0 flags/);
    // Edited after its check (the review's case): approval waits for a new check.
    const draftFile = join(app.root, 'drafts', '002-sales.md');
    const checkedText = readFileSync(draftFile, 'utf8');
    writeFileSync(draftFile, `${checkedText}\nJohn Doe stole 9,000,000 dollars [C1].\n`);
    assert.match(await app.call('content_approve', { piece: 'P1', quote: 'Make it final' }), /changed after it was checked/);
    writeFileSync(draftFile, checkedText);
    assert.match(await app.call('content_approve', { piece: 'P1', quote: 'Make it final' }), /is final/);
    // An article: the format puts links in the text too.
    assert.match(readFileSync(join(app.root, 'final', 'sales.md'), 'utf8'), /\[Agency\]\(https:\/\/agency\.example\/r\)/);
  } finally {
    app.close();
  }
});

test('an override is the user\'s, recorded; a checker that gives no usable answer is a flag of its own', async () => {
  const app = desk({ writer: 'Sales tripled [C1].', checker: 'I cannot.' });
  try {
    await app.call('content_ledger', { action: 'add', claims: [{ text: 'Sales rose', passage: 'rose' }] });
    app.say('C1 established.');
    await app.call('content_rule', { action: 'standing', claims: ['C1'], standing: 'established', quote: 'C1 established' });
    await app.call('content_plan', { action: 'brief', title: 'Sales', format: 'talking-podcast' });
    app.say('Approve the brief.');
    await app.call('content_rule', { action: 'brief', piece: 'P1', quote: 'Approve the brief' });
    await app.call('content_plan', { action: 'outline', piece: 'P1', points: [{ text: 'Growth', claims: ['C1'] }] });
    await app.call('content_draft', { piece: 'P1' });
    const checked = await app.call('content_check', { piece: 'P1' });
    assert.match(checked, /checker: The checker gave no usable answer/);
    assert.equal(app.jobs.filter((job) => job.role === 'checker').length, 2, 'asked once more for the JSON');
    const ids = app.state().pieces[0].flags.map((flag) => flag.id);
    app.say('Keep F1 and F2 anyway.');
    assert.match(await app.call('content_rule', { action: 'override', piece: 'P1', flags: ids, quote: 'Keep it anyway' }), /not in the user's newest message/);
    assert.match(await app.call('content_rule', { action: 'override', piece: 'P1', flags: ids, quote: 'Keep F1 and F2 anyway' }), /Overridden by the user \(recorded\)/);
    assert.equal(app.state().pieces[0].flags.every((flag) => flag.override?.quote === 'Keep F1 and F2 anyway'), true);
  } finally {
    app.close();
  }
});

test('the ledger: a reworded claim needs a new ruling; a response to an accusation; sources change unruled proposals; ruled-out claims stay in the ledger', async () => {
  const app = desk();
  try {
    await app.call('content_ledger', { action: 'add', claims: [{ text: 'A said B', who: 'A' }, { text: 'X stole', accuses: true, about: ['X'] }] });
    assert.equal(app.state().claims[0].standing, 'unsubstantiated');
    await app.call('content_ledger', { action: 'source', sources: [{ title: 'Paper', url: 'https://paper.example/a', kind: 'outlet', publisher: 'Paper' }] });
    await app.call('content_ledger', { action: 'update', claim: 'C1', changes: { sources: ['S1'] } });
    assert.equal(app.state().claims[0].standing, 'reported');
    app.say('C1 is reported.');
    await app.call('content_rule', { action: 'standing', claims: ['C1'], standing: 'reported', quote: 'C1 is reported' });
    assert.match(await app.call('content_ledger', { action: 'update', claim: 'C1', changes: { text: 'A said B loudly' } }), /ruling on it is open again/);
    assert.equal(app.state().claims[0].ruled, null);
    assert.match(await app.call('content_ledger', { action: 'response', claim: 'C2' }), /Give what they said/);
    assert.match(await app.call('content_ledger', { action: 'response', claim: 'C2', searched: 'X\'s website, two news searches' }), /none found \(looked in X's website/);
    await app.call('content_plan', { action: 'brief', title: 'T' });
    app.say('Leave C2 out of this piece.');
    assert.match(await app.call('content_rule', { action: 'use', piece: 'P1', claims: ['C2'], use: 'out', quote: 'Leave C2 out of this piece' }), /ruled out of this piece \(still in the ledger\)/);
    assert.equal(app.state().claims.length, 2);
    assert.match(readFileSync(join(app.root, 'ledger.md'), 'utf8'), /## Unsubstantiated[\s\S]*\*\*C2\*\* X stole _\(proposed, added in Content, accuses\)_[\s\S]*Response: none found/);
  } finally {
    app.close();
  }
});

test('custom format cards and the continue text', async () => {
  const app = desk();
  try {
    assert.match(await app.call('content_formats', { action: 'list' }), /talking-video: Talking outline, video \(spoken\)/);
    assert.match(await app.call('content_formats', { action: 'save', title: 'Newsletter', shape: 'Hi, three items, bye.', quote: 'save it' }), /user's to decide/);
    app.say('Yes, save that newsletter card.');
    assert.match(await app.call('content_formats', { action: 'save', title: 'Newsletter', shape: 'Hi, three items, bye.', quote: 'save that newsletter card' }), /Saved the card .*newsletter\.md/);
    await app.call('content_ledger', { action: 'source', sources: [{ title: 'Onion page', url: 'http://abcdefghijklmnop.onion/x', origin: 'recon' }] });
    await app.call('content_ledger', { action: 'add', claims: [{ text: 'X was there', sources: ['S1'] }] });
    const research = await app.call('content_continue', { to: 'research', question: 'Was X there?', claim: 'C1' });
    assert.match(research, /new Research conversation[\s\S]*Was X there\?[\s\S]*The claim: X was there/);
    assert.doesNotMatch(research, /onion/, 'a Recon source is not carried into Research');
  } finally {
    app.close();
  }
});

test('approval gates in plain words; the note says where the work stands', () => {
  const state = { claims: [{ id: 'C1', ruled: null, pinned: false, standing: 'reported' }], pieces: [] };
  const piece = { brief: { approved: null }, drafts: [], checks: [], flags: [], named: [] };
  assert.deepEqual(approvalGaps(state, piece), ['The brief is not approved by the owner yet.', 'There is no draft yet.']);
  assert.match(folderNote({ folder: '/x', scratch: false, status: 'Where the work stands: 1 claims' }), /subject folder of this conversation is \/x\.[\s\S]*\nWhere the work stands/);
  assert.equal(statusOf({ claims: [], pieces: [], angles: [], sources: [] }), 'Nothing is recorded yet: start with step 1.');
  assert.ok(METHOD.length < 4000, `${METHOD.length}`);
});

test('review fixes: own experience only from the user, the sources page hides Recon addresses everywhere, one-digit numbers, named people found in the text, a changed source reopens a ruling', async () => {
  const app = desk();
  try {
    // A note the assistant saved is not the user's words; one word is not a quote; the claim must say what the words say.
    mkdirSync(join(app.root, 'notes'));
    writeFileSync(join(app.root, 'notes', 'assistant.md'), '<!-- Written by the assistant from the conversation: not the user\'s own file. -->\nI saw the CEO take a bribe in 2019.');
    let out = await app.call('content_ledger', { action: 'add', claims: [{ text: 'I saw the CEO take a bribe', origin: 'owner', kind: 'experience', fromOwner: 'I saw the CEO take a bribe in 2019' }] });
    assert.match(out, /Nothing was recorded/, 'a note the assistant wrote does not count');
    writeFileSync(join(app.root, 'notes', 'mine.md'), 'Last spring I visited the plant and the line was idle for two weeks.');
    out = await app.call('content_ledger', { action: 'add', claims: [{ text: 'The CEO took a bribe', origin: 'owner', fromOwner: 'e' }] });
    assert.match(out, /Nothing was recorded/);
    out = await app.call('content_ledger', { action: 'add', claims: [{ text: 'The CEO took a bribe', origin: 'owner', fromOwner: 'I visited the plant and the line was idle' }] });
    assert.match(out, /the claim must say what the user's words say/);
    out = await app.call('content_ledger', { action: 'add', claims: [{ text: 'I visited the plant and the line was idle for two weeks', origin: 'owner', fromOwner: 'I visited the plant and the line was idle for two weeks' }] });
    assert.match(out, /C1 \[Own experience, proposed\]/);
    // A research claim cannot become own experience through a correction either.
    await app.call('content_ledger', { action: 'add', claims: [{ text: 'The plant closed', sources: [] }] });
    app.say('C2 is now my experience, change it.');
    assert.match(await app.call('content_correct', { action: 'standing', claim: 'C2', standing: 'own-experience', quote: 'C2 is now my experience' }), /for the user's own words only/);
    // A changed source reopens a ruling.
    await app.call('content_ledger', { action: 'source', sources: [{ title: 'Paper', url: 'https://paper.example/a', kind: 'outlet' }, { title: 'Hidden', url: 'http://zzzzzzzzzzzzzzzz.onion/x', origin: 'recon', archived: 'https://web.archive.org/web/1/http://zzzzzzzzzzzzzzzz.onion/x' }, { title: 'Bad link', url: 'javascript:alert(1)' }] });
    app.say('C2 is reported.');
    await app.call('content_rule', { action: 'standing', claims: ['C2'], standing: 'reported', quote: 'C2 is reported' });
    assert.match(await app.call('content_ledger', { action: 'update', claim: 'C2', changes: { sources: ['S1'] } }), /ruling on it is open again/);
  } finally {
    app.close();
  }
  // The sources page: no onion host as a name, no archived copy of a hidden source, no javascript: link.
  const { sourcesPage } = await import('../lib/final.js');
  const page = sourcesPage({ title: 'T', used: ['C1'], claims: [{ id: 'C1', text: 'x', standing: 'reported', sources: ['S1', 'S2', 'S3'] }], sources: [
    { id: 'S1', url: 'http://zzzzzzzzzzzzzzzz.onion/x', publisher: 'zzzzzzzzzzzzzzzz.onion', origin: 'research' },
    { id: 'S2', url: 'https://a.example/x', title: 'A', archived: 'https://web.archive.org/web/1/http://yyyy.onion/', origin: 'research' },
    { id: 'S3', url: 'javascript:alert(1)', title: 'Bad' },
  ] });
  assert.doesNotMatch(page.markdown + page.html, /\.onion/);
  assert.doesNotMatch(page.html, /href="javascript/);
  // One-digit numbers; a named person found in the sentence itself.
  const claims = [{ id: 'C1', text: 'Three people died', passage: '3 people died', standing: 'claimed', sources: [] }];
  const checked = mechanicalCheck({ text: '1. Seven people died, John Doe says: 7 people died [C1].', claims });
  assert.ok(checked.flags.some((flag) => flag.kind === 'number' && /7/.test(flag.fix)), 'a one-digit number is checked; the list number is not');
  assert.ok(!checked.flags.some((flag) => flag.kind === 'number' && /Check 1 /.test(flag.fix)));
  assert.equal(checked.named[0].person, 'John Doe', 'found without about on the claim');
});

test('the where-used index finds the same claim in another subject by its words', () => {
  const home = scratch('content-index-');
  try {
    const index = openIndex(() => join(home, 'where-used.json'));
    const claims = [{ id: 'C4', text: 'Sales rose 34%', standing: 'reported', sources: [] }];
    index.add({ subject: '/a', piece: 'P1 A', file: '/a/final/a.md', at: '2026-11-17T09:00:00Z', uses: { C4: ['Sales rose 34%.'] }, claims, sources: [] });
    assert.equal(index.usesOf('/b', 'C1', 'sales rose  34%').length, 1);
    assert.equal(index.usesOf('/b', 'C1', 'something else').length, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
