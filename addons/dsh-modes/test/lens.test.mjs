// Lens texts (step 24): written and checked, not sent anywhere yet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { AI_ISMS } from '../../dsh-evolve/lib/packs.js';
import { LENS_FOR, LENS_GUARD, LENS_IDS, LENS_MAX, LENS_NAMES, LENS_PROMPTS, LENS_UNCHECKED, lensId, lensText } from '../lib/lens.js';

test('the Lenses are the owner\'s seven, in his order and with his names; Default adds nothing', () => {
  assert.deepEqual(LENS_IDS.map((id) => LENS_NAMES[id]), ['Default', 'Blunt', 'Scientific', 'Journalistic', 'Data only', 'Skeptic', 'Encouraging']);
  assert.deepEqual(Object.keys(LENS_PROMPTS), LENS_IDS);
  assert.deepEqual(Object.keys(LENS_FOR), LENS_IDS);
  assert.equal(LENS_PROMPTS.default, '');
  assert.equal(lensText('default'), '');
  assert.equal(lensText('nonsense'), '', 'an unknown Lens is Default');
  assert.equal(lensId('BLUNT'), 'blunt');
  assert.equal(lensText('blunt'), LENS_PROMPTS.blunt);
});

test('each Lens keeps the plan\'s words, the guard lines the owner chose, and stays short and plain', () => {
  const plan = {
    blunt: 'The most direct Lens. Answer first, at whatever length the question needs. No softening, euphemism, praise, reassurance or moral commentary, and no concern for whose feelings a fact hurts. Give the most likely explanation, not the most charitable one.',
    scientific: 'Rank the evidence: reviews, trials, single studies, opinion. Give sample sizes, effect sizes and whether it was replicated. Say what would change the conclusion.',
    journalistic: 'Who, what, when, where, and how we know. Every claim attributed. Confirmed kept apart from alleged. Say what is still unknown.',
    'data-only': 'Numbers, tables and charts with sources. No interpretation beyond what the figures show. "No data" said plainly.',
    skeptic: 'Argue the strongest case against it. List what would have to be true, and what breaks first.',
    encouraging: 'The same facts, nothing hidden. Lead with what works and the next step.',
  };
  const banned = AI_ISMS.split(' | ').map((phrase) => phrase.toLowerCase());
  for (const id of LENS_IDS.slice(1)) {
    const text = LENS_PROMPTS[id];
    assert.ok(text.startsWith(`Lens: ${LENS_NAMES[id]}. ${plan[id]}`), `${id}: the plan's words first`);
    // Every Lens: wins on wording, the tab's rules first, a required warning is not softening.
    assert.ok(text.endsWith(LENS_GUARD), `${id}: the guard last`);
    assert.match(LENS_GUARD, /tab's own rules, labels and order of sections come first/);
    assert.match(LENS_GUARD, /A required warning is not softening/);
    assert.ok(text.length <= LENS_MAX, `${id}: ${text.length} characters`);
    for (const phrase of banned) assert.ok(!text.toLowerCase().includes(phrase), `${id}: no "${phrase}"`);
  }
  // The fact-heavy Lenses never switch the web on: unchecked is inference or guess, memory is never a fact.
  for (const id of ['blunt', 'scientific', 'journalistic', 'data-only']) assert.ok(LENS_PROMPTS[id].includes(LENS_UNCHECKED), id);
  for (const id of ['skeptic', 'encouraging']) assert.ok(!LENS_PROMPTS[id].includes(LENS_UNCHECKED), id);
  assert.match(LENS_UNCHECKED, /A figure from memory is never a fact\./);
  // Blunt uses a tab's own labels where it has them.
  assert.match(LENS_PROMPTS.blunt, /Mark each key claim as fact, inference or guess; where this tab already labels claims its own way, use its labels instead\./);
});

test('the Lens goes only into its own section (step 26), never into Modes\' notes; the page never holds its texts', () => {
  assert.doesNotMatch(readFileSync(new URL('../lib/prompt.js', import.meta.url), 'utf8'), /lens\.js|LENS_PROMPTS|lensText/);
  assert.doesNotMatch(readFileSync(new URL('../client.js', import.meta.url), 'utf8'), /LENS_PROMPTS|lensText/);
  assert.match(readFileSync(new URL('../index.js', import.meta.url), 'utf8'), /name: 'modes:lens', order: 73/);
});

test('the chat box: the Lens is the second part of the Depth list (step 28), stored per conversation, with the Web Off hint', async () => {
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const cut = (name) => {
    const start = source.indexOf(`function ${name}(`);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
    }
    throw new Error(name);
  };
  const line = (name) => source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'))[0];
  const { lensNow, settingOps, ids, facts } = new Function(`${cut('readObject')}\n${line('LENS_IDS')}\n${line('FACT_LENSES')}\n${line('LENS_NAMES')}\n${line('OWN_MAX')}\n${line('OWN_NAME_MAX')}\n${line('OWN_TEXT_MAX')}\n${cut('ownSlug')}\n${cut('ownLensProblem')}\n${cut('ownLensesOf')}\n${cut('lensNow')}\n${cut('settingOps')}\nreturn { lensNow, settingOps, ids: LENS_IDS, facts: FACT_LENSES };`)();
  // The same Lenses as Modes sends.
  assert.deepEqual(ids, LENS_IDS);
  assert.deepEqual(facts, ['blunt', 'scientific', 'journalistic', 'data-only']);
  assert.equal(lensNow({}, 's'), 'default');
  assert.equal(lensNow({ sessionLens: JSON.stringify({ s: 'skeptic' }) }, 's'), 'skeptic');
  assert.equal(lensNow({ sessionLens: JSON.stringify({ s: 'nonsense' }) }, 's'), 'default');
  // A pick is for this conversation only; Default stores nothing; never touches Web or Depth.
  assert.deepEqual(settingOps('lens', 'blunt', { sessionLens: JSON.stringify({ x: 'skeptic' }) }, 's'), [{ op: 'set', path: ['sessionLens'], value: JSON.stringify({ x: 'skeptic', s: 'blunt' }) }]);
  assert.deepEqual(settingOps('lens', 'default', { sessionLens: JSON.stringify({ s: 'blunt' }) }, 's'), [{ op: 'set', path: ['sessionLens'], value: '{}' }]);
  // "Depth · Thorough · Blunt"; Default reads as before. The hint only for a fact Lens with Web Off (never in Research or Scout).
  assert.match(source, /lens === 'default' \? `· \$\{name\}` : `· \$\{name\} · \$\{lensName\}`/);
  assert.match(source, /webOff && FACT_LENSES\.includes\(lens\) \? h\('p', \{ className: 'hint', 'data-lens-web': '' \}, t\('lens\.web\.off'\)\) : null/);
  assert.match(source, /lens: lensNow\(state\.view, sessionId\), own: ownLensesOf\(state\.view\.ownLenses\), webOff: !researchTab && !web,/);
  assert.match(source, /onPickLens: \(picked\) => void pickSetting\('lens', picked\)/);
  // Short enough to see without scrolling: chips, and the list may use the room above the button.
  assert.match(source, /h\('div', \{ className: 'chips', role: 'listbox', 'aria-label': t\('lens\.title'\) \}/);
  assert.match(source, /maxHeight: Math\.max\(200, rect\.top - 24\)/);
  for (const key of ['lens.title', 'lens.note', 'lens.web.off', 'depth.open.lens', ...LENS_IDS.flatMap((id) => [`lens.${id}`, `lens.${id}.hint`])]) {
    assert.equal(source.split('\n').filter((text) => text.includes(`'${key}':`)).length, 2, `${key}: English and Chinese`);
  }
  // The English names and uses are the approved ones.
  for (const id of LENS_IDS) assert.ok(source.includes(`'lens.${id}': '${LENS_NAMES[id]}'`), id);
});

test('the texts are exactly as the owner approved them word for word (15 November 2026)', () => {
  assert.deepEqual(LENS_PROMPTS, {
  "default": "",
  "blunt": "Lens: Blunt. The most direct Lens. Answer first, at whatever length the question needs. No softening, euphemism, praise, reassurance or moral commentary, and no concern for whose feelings a fact hurts. Give the most likely explanation, not the most charitable one. Mark each key claim as fact, inference or guess; where this tab already labels claims its own way, use its labels instead. Anything you could not check is an inference or a guess, not a fact. A figure from memory is never a fact. This Lens decides how the answer is worded, over general style preferences. The tab's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening.",
  "scientific": "Lens: Scientific. Rank the evidence: reviews, trials, single studies, opinion. Give sample sizes, effect sizes and whether it was replicated. Say what would change the conclusion. Anything you could not check is an inference or a guess, not a fact. A figure from memory is never a fact. This Lens decides how the answer is worded, over general style preferences. The tab's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening.",
  "journalistic": "Lens: Journalistic. Who, what, when, where, and how we know. Every claim attributed. Confirmed kept apart from alleged. Say what is still unknown. Anything you could not check is an inference or a guess, not a fact. A figure from memory is never a fact. This Lens decides how the answer is worded, over general style preferences. The tab's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening.",
  "data-only": "Lens: Data only. Numbers, tables and charts with sources. No interpretation beyond what the figures show. \"No data\" said plainly. Anything you could not check is an inference or a guess, not a fact. A figure from memory is never a fact. This Lens decides how the answer is worded, over general style preferences. The tab's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening.",
  "skeptic": "Lens: Skeptic. Argue the strongest case against it. List what would have to be true, and what breaks first. This Lens decides how the answer is worded, over general style preferences. The tab's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening.",
  "encouraging": "Lens: Encouraging. The same facts, nothing hidden. Lead with what works and the next step. This Lens decides how the answer is worded, over general style preferences. The tab's own rules, labels and order of sections come first; the Lens changes tone and emphasis inside them. A required warning is not softening."
});
});

test('your own Lenses: the plan\'s limits, no shipped name, the same guard; a removed one is Default again', async () => {
  const { OWN_MAX, OWN_TEXT_MAX, ownLensProblem, ownLensesOf, ownSlug, lensIdIn, lensTextIn } = await import('../lib/lens.js');
  assert.equal(ownSlug('My Calm Voice!'), 'own-my-calm-voice');
  assert.equal(ownLensProblem({ name: '', text: 'x' }), 'needs a name');
  assert.equal(ownLensProblem({ name: 'x'.repeat(41), text: 'x' }), 'has a name longer than 40 characters');
  assert.equal(ownLensProblem({ name: 'blunt', text: 'x' }), 'has the name of a Lens that comes with Plus');
  assert.equal(ownLensProblem({ name: 'Data Only', text: 'x' }), 'has the name of a Lens that comes with Plus');
  assert.equal(ownLensProblem({ name: 'Mine', text: ' ' }), 'needs a text');
  assert.equal(ownLensProblem({ name: 'Mine', text: 'x'.repeat(OWN_TEXT_MAX + 1) }), 'has a text longer than 4000 characters');
  assert.equal(ownLensProblem({ name: 'mine', text: 'x' }, [{ name: 'Mine' }]), 'has the same name as another of your Lenses');
  assert.equal(ownLensProblem({ name: 'Mine', text: 'Short sentences.' }), '');
  const many = Array.from({ length: 45 }, (_, n) => ({ name: `L${n}`, text: 't' }));
  assert.equal(ownLensesOf(many).length, OWN_MAX);
  const own = ownLensesOf(JSON.stringify([{ name: 'Calm', text: 'Short sentences, calm tone.' }, { name: 'Blunt', text: 'x' }, { name: '', text: 'y' }]));
  assert.deepEqual(own, [{ id: 'own-calm', name: 'Calm', text: 'Short sentences, calm tone.' }], 'bad entries are left out');
  assert.equal(lensIdIn('own-calm', own), 'own-calm');
  assert.equal(lensIdIn('own-gone', own), 'default', 'a removed Lens of your own is Default again');
  assert.equal(lensTextIn('own-calm', own), `Lens: Calm. Short sentences, calm tone. ${LENS_GUARD}`);
  assert.equal(lensTextIn('blunt', own), LENS_PROMPTS.blunt);
  assert.equal(lensTextIn('own-gone', own), '');
});

test('the page applies the same rules to your own Lenses as Modes does, and offers them in the Depth list', async () => {
  const lib = await import('../lib/lens.js');
  const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8');
  const cut = (name) => {
    const start = source.indexOf(`function ${name}(`);
    let depth = 0;
    for (let i = source.indexOf('{', start); i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
    }
    throw new Error(name);
  };
  const line = (name) => source.match(new RegExp(`^\\s*const ${name} = .*;$`, 'm'))[0];
  const page = new Function(`${cut('readObject')}\n${line('LENS_IDS')}\n${line('LENS_NAMES')}\n${line('OWN_MAX')}\n${line('OWN_NAME_MAX')}\n${line('OWN_TEXT_MAX')}\n${cut('ownSlug')}\n${cut('ownLensProblem')}\n${cut('ownLensesOf')}\n${cut('lensNow')}\nreturn { ownSlug, ownLensProblem, ownLensesOf, lensNow };`)();
  const cases = [
    [{ name: 'Calm', text: 'Short.' }, { name: 'calm', text: 'dupe' }, { name: 'Skeptic', text: 'x' }, { name: 'Über Klar', text: 'y' }, { name: 'x'.repeat(41), text: 'z' }, { name: 'Long', text: 'x'.repeat(4001) }],
    JSON.stringify([{ name: 'A', text: 'a' }]),
    'not json',
    Array.from({ length: 45 }, (_, n) => ({ name: `L${n}`, text: 't' })),
  ];
  for (const value of cases) assert.deepEqual(page.ownLensesOf(value), lib.ownLensesOf(value));
  for (const entry of cases[0]) assert.equal(page.ownLensProblem(entry), lib.ownLensProblem(entry));
  const view = { ownLenses: [{ name: 'Calm', text: 'Short.' }], sessionLens: JSON.stringify({ a: 'own-calm', b: 'own-gone', c: 'blunt' }) };
  assert.equal(page.lensNow(view, 'a'), 'own-calm');
  assert.equal(page.lensNow(view, 'b'), 'default', 'removed: Default');
  assert.equal(page.lensNow(view, 'c'), 'blunt');
  // The Depth list shows them after the shipped six; Settings → Modes has the section, saved at once.
  assert.match(source, /own\.map\(\(entry\) => h\('button', \{ key: entry\.id, type: 'button', role: 'option'/);
  assert.match(source, /h\(OwnLenses, \{ t, saved: general\.ownLenses \?\? \[\], onSave: \(list\) => saveNow\('ownLenses', list\) \}\)/);
  for (const key of ['own.group', 'own.hint', 'own.name', 'own.text', 'own.add', 'own.remove', 'own.save', 'own.saved', 'own.full', 'own.empty', 'own.problem', 'lens.own.hint']) {
    assert.equal(source.split('\n').filter((text) => text.includes(`'${key}':`)).length, 2, `${key}: English and Chinese`);
  }
});
