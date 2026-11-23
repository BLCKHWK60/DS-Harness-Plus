/**
 * Skills switched off per tab (Tuner Plus's step 14): the list the app hands a conversation leaves them out,
 * a list the model already sees is not sent again, a call for one is refused, the owner's /name still
 * works, Recon still gets no list at all, and with nothing switched off every step is exactly as before.
 * The list messages are made in the app's own form (dsh-tool-skill 0.2.2-rc.2).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogLine, lastSeenCatalog, offIn, sameCatalog, trimCatalog, withOff, withoutOffSkills } from '../lib/skilloff.js';

const ENTRIES = [
  { name: 'draw-diagram', description: 'Draw a <diagram> & more' },
  { name: 'office', description: 'Office files' },
  { name: 'read-pdf', description: 'Read a PDF' },
];
/** The app's first list (`renderCatalogMessage`), or its replacement (`renderCatalogUpdate`). */
const catalog = (entries, { update = false, id = 'm1' } = {}) => ({
  id,
  role: 'user',
  content: [{
    type: 'text',
    text: [
      '<system-reminder>',
      update ? 'The available skill catalog changed. This complete catalog replaces every earlier available-skills list in this thread:' : 'A skill is a reusable set of task-specific instructions. The following skills are available in this session:',
      '',
      '<available_skills>',
      ...entries.map(catalogLine),
      '</available_skills>',
      '',
      "If the user names a skill, or the task clearly matches a skill's description, call the `skill` tool with the exact skill name before taking task actions.",
      '</system-reminder>',
    ].join('\n'),
  }],
  source: { kind: 'skill-catalog', form: 'catalog', ...(update ? { update: true } : {}), entries },
});

test('one list without the switched-off skills: their lines and entries go, every other word stays; another form is left whole', () => {
  const message = catalog(ENTRIES);
  const { message: out, changed } = trimCatalog(message, new Set(['office']));
  assert.equal(changed, true);
  assert.deepEqual(out.source.entries.map((one) => one.name), ['draw-diagram', 'read-pdf']);
  assert.equal(out.content[0].text, message.content[0].text.replace('- `office`: Office files\n', ''));
  assert.match(out.content[0].text, /- `draw-diagram`: Draw a &lt;diagram&gt; &amp; more/);
  assert.equal(out.id, 'm1', 'the same message, so the app keeps its place');
  assert.equal(trimCatalog(message, new Set(['other'])).message, message, 'nothing of it switched off: the very same message');
  assert.equal(trimCatalog(message, new Set(ENTRIES.map((one) => one.name))).message, null, 'none left: no list');
  const odd = { ...message, content: [{ type: 'text', text: message.content[0].text.replace('- `office`', '* `office`') }] };
  assert.deepEqual(trimCatalog(odd, new Set(['office'])), { message: odd, changed: false, unknown: true });
  assert.equal(trimCatalog({ ...message, source: { kind: 'skill-catalog', entries: 'x' } }, new Set(['office'])).unknown, true);
});

test('the app sends the whole list again after the model saw the shorter one: Modes drops it, so nothing is sent twice; a real change still goes', () => {
  const off = new Set(['office']);
  const shorter = ENTRIES.filter((one) => one.name !== 'office');
  const step = (messages, seen) => withoutOffSkills(messages, off, () => seen);
  // The first list: shortened and sent.
  const first = step([{ source: { kind: 'user' } }, catalog(ENTRIES)], undefined);
  assert.deepEqual(first.messages.map((one) => one.source.kind), ['user', 'skill-catalog']);
  // The app's replacement with the whole list (it compares with the whole list): dropped.
  const again = step([catalog(ENTRIES, { update: true, id: 'm2' })], { entries: shorter, incomplete: false });
  assert.deepEqual(again.messages, []);
  // A new skill: the replacement goes, without the switched-off one.
  const more = [...ENTRIES, { name: 'write-notes', description: 'Notes' }];
  const changedList = step([catalog(more, { update: true, id: 'm3' })], { entries: shorter, incomplete: false });
  assert.deepEqual(changedList.messages[0].source.entries.map((one) => one.name), ['draw-diagram', 'read-pdf', 'write-notes']);
  // Nothing switched off: the very same array.
  const messages = [catalog(ENTRIES)];
  assert.equal(withoutOffSkills(messages, new Set(), () => undefined).messages, messages);
  assert.equal(sameCatalog({ entries: shorter, incomplete: false }, { entries: shorter, incomplete: true }), false);
});

test('the list the model sees now: the newest stored list still in view, as the app reads it', () => {
  const events = [
    { seq: 0, type: 'user/message', data: { source: { kind: 'skill-catalog', entries: ENTRIES } } },
    { seq: 1, type: 'user/message', data: { source: { kind: 'user' } } },
    { seq: 2, type: 'user/message', data: { source: { kind: 'skill-catalog', entries: ENTRIES.slice(1) } } },
  ];
  const session = (visible) => ({ seq: events.length, surface: { nodes: visible }, eventAt: (i) => events[i] });
  assert.deepEqual(lastSeenCatalog(session([0, 1, 2])).entries.map((one) => one.name), ['office', 'read-pdf']);
  assert.deepEqual(lastSeenCatalog(session([0, 1])).entries.map((one) => one.name), ['draw-diagram', 'office', 'read-pdf'], 'a list folded out of view does not count');
  assert.equal(lastSeenCatalog(undefined), undefined);
  assert.deepEqual([...offIn({ code: ['a', 'bad name', 3, 'b'] }, 'code')], ['a', 'b']);
  assert.deepEqual(withOff({ code: ['a'], cowork: ['x'] }, 'code', []), { cowork: ['x'] });
  assert.deepEqual(withOff({}, 'code', ['b', 'a', 'a']), { code: ['a', 'b'] });
});

test('in the app: only the tab with skills switched off changes; Recon still gets no list; a call for one is refused there; your /name still works', async () => {
  const { boot, makeWorld, settle } = await import('./app.mjs');
  const RECON = { label: 'Recon', tools: ['recon_cite'], sandbox: 'read-only', prompt: 'Recon method.', isolated: true };
  const world = makeWorld({ pruneStaleSessions: false, extraModes: JSON.stringify({ recon: RECON }), sessionModes: JSON.stringify({ c1: 'cowork', k1: 'code', r1: 'recon' }) });
  const app = boot(world, { known: ['recon_cite', 'bash', 'skill'] });
  try {
    const c1 = (await app.open('c1')).agent;
    const k1 = (await app.open('k1')).agent;
    const r1 = (await app.open('r1')).agent;
    const typed = { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '/office make a table' }] };
    const inserted = { role: 'user', source: { kind: 'skill-invocation', name: 'office', form: 'instructions' }, content: [{ type: 'text', text: '<skill_content name="office">Steps</skill_content>' }] };
    const step = (agent) => app.waterfall('agent/pre-step', { agent }, () => ({ kind: 'enter', messages: [typed, inserted, catalog(ENTRIES)] }));
    const call = (agent, name) => app.waterfall('tools/pre-execute', { agent, name: 'skill', arguments: { name } }, () => ({ kind: 'allow' }));
    // Nothing switched off: every step exactly as before.
    const before = await step(c1);
    assert.deepEqual(before.messages.map((one) => one.source.kind), ['user', 'skill-invocation', 'skill-catalog']);
    assert.deepEqual(before.messages[2].source.entries, ENTRIES);
    assert.equal((await call(c1, 'office')).kind, 'allow');
    // Switched off in Cowork (as Tuner Plus's button does it).
    assert.deepEqual(await app.service().setSkillsOff('cowork', ['office']), ['office']);
    await settle();
    assert.deepEqual(app.service().skillsOff(), { cowork: ['office'] });
    const cowork = await step(c1);
    assert.deepEqual(cowork.messages.map((one) => one.source.kind), ['user', 'skill-invocation', 'skill-catalog'], 'your typed /office still brings its text');
    assert.deepEqual(cowork.messages[2].source.entries.map((one) => one.name), ['draw-diagram', 'read-pdf']);
    const denied = await call(c1, 'office');
    assert.equal(denied.kind, 'deny');
    assert.match(denied.reason, /switched off in the Cowork mode/);
    assert.equal((await call(c1, 'read-pdf')).kind, 'allow');
    // Code is untouched; Recon still gets no list at all.
    assert.deepEqual((await step(k1)).messages[2].source.entries, ENTRIES);
    assert.equal((await call(k1, 'office')).kind, 'allow');
    assert.deepEqual((await step(r1)).messages.map((one) => one.source.kind), ['user']);
    await assert.rejects(app.service().setSkillsOff('recon', ['office']), /sealed mode/);
    await assert.rejects(app.service().setSkillsOff('nowhere', ['office']), /no mode "nowhere"/);
    // Back on: as before.
    assert.deepEqual(await app.service().setSkillsOff('cowork', []), []);
    await settle();
    assert.deepEqual((await step(c1)).messages[2].source.entries, ENTRIES);
    assert.equal(world.config.skillsOff, '{}');
  } finally {
    app.stop();
  }
});

test('review of step 14: an open conversation that still sees a switched-off skill gets a replacement list once; with none left the model is told so; then nothing is sent again', async () => {
  const { catalogUpdate } = await import('../lib/skilloff.js');
  const off = new Set(['office']);
  const full = { entries: ENTRIES, incomplete: false };
  // The app sends nothing (its list did not change); the model still sees office: a replacement without it.
  const first = withoutOffSkills([{ source: { kind: 'user' } }], off, () => full);
  assert.equal(first.changed, true);
  const update = first.messages[1];
  assert.deepEqual(update.source, { kind: 'skill-catalog', form: 'catalog', update: true, entries: ENTRIES.filter((one) => one.name !== 'office') });
  assert.equal(update.content[0].text, catalogUpdate(ENTRIES.filter((one) => one.name !== 'office')).content[0].text);
  assert.match(update.content[0].text, /^<system-reminder>\nThe available skill catalog changed\./);
  assert.doesNotMatch(update.content[0].text, /office/);
  assert.ok(Object.isFrozen(update) && Object.isFrozen(update.source.entries[0]) && typeof update.id === 'string');
  // Next step: the model sees the shorter list; the app's whole list again is dropped, nothing new is added.
  const seen = { entries: update.source.entries, incomplete: false };
  assert.deepEqual(withoutOffSkills([catalog(ENTRIES, { update: true })], off, () => seen).messages, []);
  assert.equal(withoutOffSkills([{ source: { kind: 'user' } }], off, () => seen).changed, false);
  // Every skill switched off after the model saw a list: told there are none now (the app's own words), once.
  const all = new Set(ENTRIES.map((one) => one.name));
  const none = withoutOffSkills([catalog(ENTRIES, { update: true })], all, () => full).messages;
  assert.equal(none.length, 1);
  assert.deepEqual(none[0].source.entries, []);
  assert.match(none[0].content[0].text, /No skills are currently available through the `skill` tool\. Do not use names from earlier skill catalogs\./);
  assert.deepEqual(withoutOffSkills([catalog(ENTRIES, { update: true })], all, () => ({ entries: [], incomplete: false })).messages, [], 'already told');
  assert.deepEqual(withoutOffSkills([catalog(ENTRIES)], all, () => undefined).messages, [], 'never had a list: none is sent');
  // The replacement Modes makes is in the app's form: trimming it again works.
  assert.equal(trimCatalog(catalogUpdate(ENTRIES), off).changed, true);
});

test('review of step 14: the refusal is a guard too, so it holds whatever another add-on answers', async () => {
  const { boot, makeWorld, settle } = await import('./app.mjs');
  const world = makeWorld({ pruneStaleSessions: false, sessionModes: JSON.stringify({ c1: 'cowork' }) });
  const app = boot(world, { known: ['bash', 'skill'] });
  try {
    const c1 = (await app.open('c1')).agent;
    assert.equal(app.guard({ agent: c1, name: 'skill', arguments: { name: 'office' } }), undefined);
    await app.service().setSkillsOff('cowork', ['office']);
    await settle();
    assert.match(app.guard({ agent: c1, name: 'skill', arguments: { name: 'office' } }), /switched off in the Cowork mode/);
    assert.equal(app.guard({ agent: c1, name: 'skill', arguments: { name: 'read-pdf' } }), undefined);
    assert.equal(app.guard({ agent: c1, name: 'bash', arguments: { name: 'office' } }), undefined);
    // Another add-on asks the user first: still refused.
    const asked = await app.waterfall('tools/pre-execute', { agent: c1, name: 'skill', arguments: { name: 'office' } }, () => ({ kind: 'ask', reason: 'another add-on asks' }));
    assert.equal(asked.kind, 'ask', 'the listener leaves another answer alone; the guard refuses before the call runs');
  } finally {
    app.stop();
  }
});

test('review of step 14: Modes sees the list the app\'s skill add-on adds inside the step (a reload of Modes, where only "prepend" keeps it outermost, is not shown by this stand-in)', async () => {
  const { boot, makeWorld, settle } = await import('./app.mjs');
  const world = makeWorld({ pruneStaleSessions: false, sessionModes: JSON.stringify({ c1: 'cowork' }) });
  const app = boot(world, { known: ['bash', 'skill'] });
  try {
    const c1 = (await app.open('c1')).agent;
    await app.service().setSkillsOff('cowork', ['office']);
    await settle();
    // The app's catalog listener, registered later: it adds the list after the inner step.
    app.listen('agent/pre-step', async (_args, next) => {
      const decision = await next();
      return { ...decision, messages: [...decision.messages, catalog(ENTRIES)] };
    });
    const out = await app.waterfall('agent/pre-step', { agent: c1 }, () => ({ kind: 'enter', messages: [] }));
    assert.deepEqual(out.messages.map((one) => one.source.entries.map((entry) => entry.name)), [['draw-diagram', 'read-pdf']]);
  } finally {
    app.stop();
  }
});
