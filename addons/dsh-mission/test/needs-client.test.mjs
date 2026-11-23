// Point 17 (owner, 20 November 2026), the browser half of "When it needs you" and "Wait for me": the choices and their
// words, the migration of the old wait setting as the page shows it, the Settings → Mission rows, the Mission settings
// dialog, and the Start Mission question for each choice. Pure blocks run on their own; the page parts are drawn with the
// stand-in in test/client-stand-in.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { client, loadPage, pureBlock, textOf, findAll, buttonsOf, tick, cardWith, posts, drawPart, buttonText } from './client-stand-in.mjs';

const S = pureBlock('mission-strip', ['NEEDS_CHOICES', 'WAIT_CHOICES', 'readNeedsShown', 'readWaitShown', 'waitAskShown', 'waitOptions', 'waitWords', 'waitDefaultLabel', 'waitDesc', 'needsWords', 'needsMeta', 'missionWords', 'INFO']);

// ---- pure ----
test('the three choices, in order, with Ask, keep working as the fallback for anything unknown', () => {
  assert.deepEqual(S.NEEDS_CHOICES.map((c) => [c.id, c.label]), [['decide', 'Full auto'], ['ask', 'Ask, keep working'], ['wait', 'Ask and wait']]);
  for (const choice of S.NEEDS_CHOICES) assert.ok(choice.desc.length > 40, choice.id);
  assert.match(S.NEEDS_CHOICES[0].desc, /It never gives itself permission: steps that need your yes are skipped and listed\./);
  assert.equal(S.readNeedsShown('wait'), 'wait');
  assert.equal(S.readNeedsShown('auto'), 'ask', "'auto' is a Mission access level, never a choice here");
  assert.equal(S.readNeedsShown(undefined), 'ask');
  assert.equal(S.needsWords('decide'), 'Full auto');
  assert.equal(S.needsWords('nope'), '');
});

test('Wait for me: the list, a saved value not in it, and the words', () => {
  assert.deepEqual(S.WAIT_CHOICES.map((c) => c.value), [10, 30, 60, 120, 240, 480, 720, 0]);
  assert.deepEqual(S.WAIT_CHOICES.map((c) => c.label), ['10 min', '30 min', '1 hour', '2 hours', '4 hours', '8 hours', '12 hours', 'Until I answer']);
  assert.deepEqual(S.waitOptions(45).map((c) => c.label), ['10 min', '30 min', '45 min', '1 hour', '2 hours', '4 hours', '8 hours', '12 hours', 'Until I answer']);
  assert.equal(S.waitOptions(30), S.WAIT_CHOICES);
  assert.equal(S.readWaitShown(null), null);
  assert.equal(S.readWaitShown(''), null);
  assert.equal(S.readWaitShown(-5), 0);
  assert.equal(S.readWaitShown(9999), 720);
  assert.equal(S.readWaitShown(0.4), 1);
  assert.equal(S.waitWords(0), 'until you answer');
  assert.equal(S.waitWords(30), '30 minutes');
  assert.equal(S.waitWords(60), '1 hour');
  assert.equal(S.waitWords(1), '1 minute');
  assert.equal(S.waitDefaultLabel('ask', { waitAsk: 30, waitHold: 0 }), 'Default (30 min)');
  assert.equal(S.waitDefaultLabel('wait', { waitAsk: 30, waitHold: 0 }), 'Default (until I answer)');
  assert.equal(S.waitDefaultLabel('wait', { waitHold: 120 }), 'Default (2 hours)');
  assert.equal(S.waitDefaultLabel('ask', undefined), 'Default (30 min)', 'an older card without defaults');
  assert.equal(S.waitDesc('decide', 30), 'Full auto never waits.');
  assert.match(S.waitDesc('ask', 0), /it waits until you answer\. Its time limit does not run while it waits\.$/);
  assert.match(S.waitDesc('wait', 60), /it waits this long, then ends with its report\./);
});

test('the old wait setting as the page shows it: its old default 3 becomes 30 minutes, 0 stays until you answer, others kept', () => {
  assert.equal(S.waitAskShown(undefined, undefined), 30, 'nothing saved');
  assert.equal(S.waitAskShown(-1, 3), 30, 'not set yet, the old default');
  assert.equal(S.waitAskShown(-1, 3.2), 30);
  assert.equal(S.waitAskShown(-1, 0), 0, 'it waited until you answered before');
  assert.equal(S.waitAskShown(-1, 15), 15);
  assert.equal(S.waitAskShown(-1, 60), 60);
  assert.equal(S.waitAskShown(45, 3), 45, 'a value set for Wait for me wins');
  assert.equal(S.waitAskShown(0, 15), 0);
  assert.equal(S.waitAskShown(900, 3), 720);
});

test('the checklist line says the choice and its wait (Full auto: the choice only); a run that does not say shows nothing', () => {
  assert.equal(S.needsMeta({ needs: 'ask', waitFor: 30 }), 'When it needs you: Ask, keep working · Wait for me: 30 minutes');
  assert.equal(S.needsMeta({ needs: 'wait', waitFor: 0 }), 'When it needs you: Ask and wait · Wait for me: until you answer');
  assert.equal(S.needsMeta({ needs: 'decide', waitFor: 0 }), 'When it needs you: Full auto');
  assert.equal(S.needsMeta({}), '');
});

test('every new control has an (i) with what, when and what changes; the dialog and the Settings page say who wins', () => {
  for (const key of ['needs', 'needsSettings', 'wait', 'waitSettings', 'finish']) {
    const info = S.INFO[key];
    assert.ok(info?.title && info.what && info.when && info.change, key);
  }
  assert.match(S.INFO.needs.change, /This is not Auto under Mission access\./);
  assert.match(S.INFO.needs.change, /with Full auto and Mission access on Restricted or Ask it does not change files that already exist/);
  assert.match(S.INFO.needsSettings.change, /a thread's own choice \(Depth → Mission settings…\) wins, also for a typed \/mission/);
  assert.match(S.INFO.waitSettings.change, /A thread's own choice wins\.$/);
  assert.match(S.INFO.start.change, /what it does when it needs you in Depth → Mission settings…/);
});

// ---- the Start Mission question ----
test('the start question says what it does when it needs you, for each choice and wait', () => {
  const words = (saved) => S.missionWords({ minutes: 60, laps: 0, tools: { files: true }, ...saved });
  const auto = words({ needs: 'decide', waitFor: 0, mode: 'auto' }).confirm;
  assert.match(auto, /\n\nWhen it needs you: Full auto\. It never asks you: it decides questions itself and lists what it chose\. It never gives itself permission: steps that need your yes are skipped and listed in the report\. Change this in Depth → Mission settings\.\n\nIt can use many tokens\./);
  assert.doesNotMatch(auto, /With Mission access on/, 'Mission access Auto: no warning');
  assert.match(words({ needs: 'decide', mode: 'restricted' }).confirm, / With Mission access on Restricted it will not change files that already exist \(that needs your yes\); choose Auto under Mission access if it should\. Change this/);
  assert.match(words({ needs: 'decide', mode: 'ask' }).confirm, / With Mission access on Ask it will not change files that already exist/);
  assert.doesNotMatch(words({ needs: 'decide', mode: 'restricted', tools: { files: false } }).confirm, /With Mission access on/, 'no file tools: nothing to warn about');
  assert.match(words({ needs: 'ask', waitFor: 30 }).confirm, /When it needs you: Ask, keep working\. Only questions that truly need you wait; the rest goes on\. If only waiting is left, it waits for 30 minutes, then ends with its report\. Change this/);
  assert.match(words({ needs: 'ask', waitFor: 0 }).confirm, /If only waiting is left, it waits until you answer\. Change this/);
  assert.match(words({ needs: 'wait', waitFor: 0 }).confirm, /When it needs you: Ask and wait\. Every question and every request for your yes waits for you; other items go on\. When only waiting is left, it waits until you answer\. Change this/);
  assert.match(words({ needs: 'wait', waitFor: 120 }).confirm, /When only waiting is left, it waits up to 2 hours, then ends with its report\./);
  // An older card (no choice): nothing added, the stage D question as it was.
  assert.equal(words({}).confirm, 'What you typed and this thread so far become its brief. It then works by itself for up to 1 hour. It may change files in the folder.\n\nIt can use many tokens. You can pause or end it at any time, above the chat box.');
  assert.equal(words({ needs: 'decide' }).summary, '1 h, files, Full auto');
  assert.equal(words({ needs: 'wait' }).summary, '1 h, files, Ask and wait');
  assert.equal(words({ needs: 'ask' }).summary, '1 h, files', 'the default is not named');
});

test('drawn: Start Mission asks with this chat\'s choice, or the default from Settings when the chat never chose', async () => {
  for (const [saved, defaults, want] of [
    [{ minutes: 60, laps: 0, steps: 0, mode: 'restricted', tools: { files: true } }, { helpers: 4, needs: 'decide', waitAsk: 30, waitHold: 0 }, /When it needs you: Full auto\.[^\n]* With Mission access on Restricted/],
    [{ minutes: 60, laps: 0, steps: 0, tools: { files: true } }, { helpers: 4, needs: 'ask', waitAsk: 45, waitHold: 0 }, /it waits for 45 minutes, then ends with its report/],
    [{ minutes: 60, laps: 0, steps: 0, tools: { files: true }, needs: 'wait', wait: null }, { helpers: 4, needs: 'ask', waitAsk: 30, waitHold: 0 }, /When it needs you: Ask and wait\.[^\n]*it waits until you answer/],
    [{ minutes: 60, laps: 0, steps: 0, tools: { files: true }, needs: 'ask', wait: 10, waitFor: 10 }, { helpers: 4, needs: 'wait', waitAsk: 30, waitHold: 0 }, /it waits for 10 minutes/],
  ]) {
    const card = { ...cardWith('none', null), saved, defaults };
    const page = loadPage((method) => (method === 'POST' ? { json: { ...card, armed: true } } : { json: card }));
    page.editor.innerText = 'make every test pass and add a --json option';
    const tree = await drawPart(page, 'mission-run-button');
    await buttonText(tree, 'Start Mission').node.props.onClick();
    await tick(50);
    assert.equal(page.asked.length, 1);
    assert.match(page.asked[0], want);
  }
});

// ---- Settings → Mission ----
test('Settings → Mission: the old wait row is gone from the limits; the new rows are selects among the Mission defaults', () => {
  const limits = client.slice(client.indexOf('const LIMITS = ['), client.indexOf('const LONG_FIELDS = ['));
  assert.doesNotMatch(limits, /id: 'waitMinutes'/);
  const fields = client.slice(client.indexOf('const LONG_FIELDS = ['), client.indexOf('const parse = '));
  const ids = [...fields.matchAll(/\{ id: '(\w+)', kind: '(\w+)'/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.deepEqual(ids.slice(0, 6), ['longMinutes:number', 'longLaps:number', 'longHelpers:number', 'longNeeds:select', 'longWaitAsk:select', 'longWaitHold:select']);
  assert.match(fields, /label: 'When it needs you', text: 'What a new Mission does when it has a question for you or needs your yes\. Ask, keep working unless you change it\.'/);
  assert.match(fields, /label: 'Wait for me \(Ask, keep working\)', text: 'How long it waits when only your answers can move it on, then it ends with its report\. 30 minutes unless you change it\.'/);
  assert.match(fields, /label: 'Wait for me \(Ask and wait\)', text: 'The same for Ask and wait\. Until I answer unless you change it\.'/);
});

const settingsCtx = (value, mutated) => ({
  remote: {
    settings: {
      describe: async () => ({ ok: true, value: { namespaces: [{ ns: 'mission', revision: 1, value }] } }),
      mutate: async (ns, ops) => { mutated.push({ ns, ops }); return { ok: true }; },
    },
  },
});
async function drawSettings(value) {
  const mutated = [];
  const page = loadPage(() => ({ json: {} }), new Map(), settingsCtx(value, mutated));
  const element = page.fake.React.createElement(page.parts.mission, {});
  page.fake.render(element);
  await tick(30);
  return { page, mutated, draw: () => page.fake.render(element) };
}

test('drawn: Settings → Mission shows the three rows with their (i), the old waitMinutes read as Wait for me, and saves a choice', async () => {
  const { mutated, draw } = await drawSettings({ enabled: true, waitMinutes: 3, longWaitAsk: -1, longWaitHold: 0, longNeeds: 'ask' });
  let tree = draw();
  const select = (label) => findAll(tree, (node) => node.type === 'select' && node.props['aria-label'] === label)[0];
  assert.equal(select('When it needs you').props.value, 'ask');
  assert.deepEqual(findAll(select('When it needs you'), (n) => n.type === 'option').map((o) => textOf(o)), ['Full auto', 'Ask, keep working', 'Ask and wait']);
  assert.equal(select('Wait for me (Ask, keep working)').props.value, '30', 'the old default 3 shows as 30 minutes');
  assert.equal(select('Wait for me (Ask and wait)').props.value, '0', 'Until I answer');
  assert.equal(textOf(findAll(select('Wait for me (Ask and wait)'), (n) => n.type === 'option' && n.props.value === '0')[0]), 'Until I answer');
  for (const label of ['When it needs you', 'Wait for me (Ask, keep working)', 'Wait for me (Ask and wait)']) {
    assert.ok(buttonsOf(tree).some((b) => b.label === `About ${label}`), label);
  }
  assert.doesNotMatch(textOf(tree), /Wait for you \(minutes\)/);
  select('When it needs you').props.onChange({ target: { value: 'decide' } });
  await tick(30);
  assert.deepEqual(JSON.parse(JSON.stringify(mutated.at(-1).ops)), [{ op: 'set', path: ['longNeeds'], value: 'decide' }]);
  tree = draw();
  assert.match(textOf(tree), /Saved\. It applies to the next Mission\./);
  select('Wait for me (Ask and wait)').props.onChange({ target: { value: '120' } });
  await tick(30);
  assert.deepEqual(JSON.parse(JSON.stringify(mutated.at(-1).ops)), [{ op: 'set', path: ['longWaitHold'], value: 120 }]);
});

test('drawn: Settings → Mission keeps a waitMinutes from before (15) as Wait for me, with its own entry in the list', async () => {
  const { draw } = await drawSettings({ enabled: true, waitMinutes: 15, longWaitAsk: -1 });
  const tree = draw();
  const select = findAll(tree, (node) => node.type === 'select' && node.props['aria-label'] === 'Wait for me (Ask, keep working)')[0];
  assert.equal(select.props.value, '15');
  assert.ok(findAll(select, (n) => n.type === 'option').some((o) => textOf(o) === '15 min'));
  const needs = findAll(tree, (node) => node.type === 'select' && node.props['aria-label'] === 'When it needs you')[0];
  assert.equal(needs.props.value, 'ask', 'never set: Ask, keep working');
});

// ---- Mission settings (Depth → Mission settings…) ----
async function openSetup(card, route) {
  const page = loadPage(route ?? ((method) => (method === 'POST' ? { json: { ok: true } } : { json: card })));
  const overlay = () => page.fake.React.createElement(page.parts['mission-long'], {});
  page.fake.render(overlay());
  page.win.dispatchEvent(new CustomEvent('dsh-mission:long', { detail: { sessionId: 's1' } }));
  page.fake.render(overlay());
  await tick(30);
  return { page, draw: () => page.fake.render(overlay()) };
}
const selectOf = (tree, label) => findAll(tree, (node) => node.type === 'select' && node.props['aria-label'] === label)[0];

test('drawn: Mission settings — When it needs you and Wait for me, Default first, Full auto greys the wait, and Save sends both', async () => {
  const card = { ...cardWith('none', null), saved: { minutes: 60, laps: 0, steps: 0, mode: 'auto', tools: { files: true, web: false } }, defaults: { minutes: 120, laps: 10, helpers: 4, needs: 'ask', waitAsk: 30, waitHold: 0 } };
  const { page, draw } = await openSetup(card);
  let tree = draw();
  const needs = selectOf(tree, 'When it needs you');
  assert.equal(needs.props.value, 'ask', 'the chat never chose: the default');
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About When it needs you'));
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Wait for me'));
  let wait = selectOf(tree, 'Wait for me');
  assert.equal(wait.props.value, '', 'Default');
  assert.equal(textOf(findAll(wait, (n) => n.type === 'option')[0]), 'Default (30 min)');
  assert.match(textOf(tree), /Questions with a safe default go on with it; only what truly needs you waits\. Other work goes on\./);
  needs.props.onChange({ target: { value: 'wait' } });
  tree = draw();
  wait = selectOf(tree, 'Wait for me');
  assert.equal(textOf(findAll(wait, (n) => n.type === 'option')[0]), 'Default (until I answer)');
  assert.match(textOf(tree), /When only your answers can move it on, it waits until you answer\. Its time limit does not run while it waits\./);
  needs.props.onChange({ target: { value: 'decide' } });
  tree = draw();
  wait = selectOf(tree, 'Wait for me');
  assert.equal(wait.props.disabled, true);
  assert.match(textOf(tree), /Full auto never waits\./);
  await buttonText(tree, 'Save').node.props.onClick();
  await tick(30);
  const saved = posts(page)[0];
  assert.equal(saved.action, 'save');
  assert.equal(saved.needs, 'decide');
  assert.equal(saved.wait, null, 'Default: the Settings value for that choice');
  assert.ok(Object.hasOwn(saved, 'wait'), 'sent as null, not left out');
});

test('drawn: Mission settings — this chat\'s own wait shows and a picked time is saved as minutes', async () => {
  const card = { ...cardWith('none', null), saved: { minutes: 60, laps: 0, steps: 0, mode: 'auto', tools: { files: true }, needs: 'ask', wait: 45, waitFor: 45 }, defaults: { needs: 'ask', waitAsk: 30, waitHold: 0 } };
  const { page, draw } = await openSetup(card);
  let tree = draw();
  const wait = selectOf(tree, 'Wait for me');
  assert.equal(wait.props.value, '45');
  assert.ok(findAll(wait, (n) => n.type === 'option').some((o) => textOf(o) === '45 min'));
  // Review of point 17: Full auto shows one option that says it never waits; the chat's own wait comes back after.
  selectOf(tree, 'When it needs you').props.onChange({ target: { value: 'decide' } });
  tree = draw();
  assert.deepEqual(findAll(selectOf(tree, 'Wait for me'), (n) => n.type === 'option').map(textOf), ['Never waits']);
  selectOf(tree, 'When it needs you').props.onChange({ target: { value: 'ask' } });
  tree = draw();
  assert.equal(selectOf(tree, 'Wait for me').props.value, '45', 'kept');
  wait.props.onChange({ target: { value: '0' } });
  tree = draw();
  assert.equal(selectOf(tree, 'Wait for me').props.value, '0');
  await buttonText(tree, 'Save').node.props.onClick();
  await tick(30);
  assert.equal(posts(page)[0].wait, 0);
  assert.equal(posts(page)[0].needs, 'ask');
  assert.equal(Object.hasOwn(posts(page)[0], 'waitFor'), false, 'the worked-out value is never saved back');
});
