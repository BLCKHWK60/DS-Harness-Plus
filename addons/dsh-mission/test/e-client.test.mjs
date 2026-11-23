// Stage E (Requirements 1, item 1; 20 November 2026), the browser half: what the assistant may do while a Mission is paused
// (Settings → Mission and Mission settings), Carry on by itself after a restart, Try again by itself's new words, the
// Settings notes for every tab, the 'down' strip (waiting for the model server, Try now), the repair helper's line and the
// Checklist's Repairs block, the note after it carried on by itself, the paused and restart words, the Budget fix, and
// the approvals the repair helper and other add-ons ask for. Pure blocks run on their own; the page parts are drawn with
// the stand-in in test/client-stand-in.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { client, loadPage, pureBlock, textOf, findAll, byClass, buttonsOf, tick, cardWith, runAt, stripOf, posts, drawPart, redrawPart, buttonText, clockOf } from './client-stand-in.mjs';

const S = pureBlock('mission-strip', ['ASSISTANT_CHOICES', 'readAssistantShown', 'assistantDesc', 'carryOnDesc', 'RETRY_FORM_TEXT', 'SETTINGS_NOTES_E', 'stripWords', 'problemFix', 'nowWords', 'repairWords', 'repairRows', 'carriedWords', 'pausedTail', 'DOWN_NEXT', 'STATE_SAID', 'INFO']);
const Q = pureBlock('mission-questions', ['questionsShown', 'approvalAsked', 'askedWords', 'choiceInfo', 'ADDON_CHANGE', 'INFO_Q']);

const NOW = 1_800_000_000_000;
const card = (state, run, strip = {}) => ({ run, strip: stripOf(state, strip) });

// ---- the setting: While a Mission runs, the assistant can ----
test('the assistant choices: Talk and look things up first (the default), Only talk; anything unknown reads as look', () => {
  assert.deepEqual(S.ASSISTANT_CHOICES.map((c) => [c.id, c.label]), [['look', 'Talk and look things up'], ['talk', 'Only talk']]);
  assert.equal(S.readAssistantShown('talk'), 'talk');
  assert.equal(S.readAssistantShown(undefined), 'look');
  assert.equal(S.readAssistantShown('zzz'), 'look');
  assert.equal(S.assistantDesc('talk'), 'It only talks: no tools.');
  assert.equal(S.assistantDesc('look'), 'It talks and may read and search, but changes nothing.');
  assert.equal(S.carryOnDesc(true), 'On: it carries on by itself after a restart.');
  assert.equal(S.carryOnDesc(false), 'Off: it comes back paused after a restart.');
  for (const key of ['assistantSettings', 'carryOn', 'retry', 'tryNow', 'repair']) {
    const info = S.INFO[key];
    assert.ok(info?.title && info.what && info.when && info.change, key);
  }
  assert.match(S.INFO.assistantSettings.change, /never changes files, runs commands or programs, or starts helpers\. The Mission's own helpers are not affected\./);
  assert.match(S.INFO.assistantSettings.what, /while its Mission works, waits, or is paused \(by you, a problem or a restart\)/, 'review of stage E: not only while paused');
  assert.match(S.INFO.carryOn.change, /Missions started before this setting existed come back paused\./);
  assert.equal(S.INFO.retry.change, 'Off: it pauses and waits for you instead.');
  assert.match(S.INFO.repair.change, /At most twice for the same cause and six times in one Mission\./);
});

test('Settings → Mission: the two new rows sit among the Mission defaults, Try again by itself has its new words', () => {
  const fields = client.slice(client.indexOf('const LONG_FIELDS = ['), client.indexOf('const parse = '));
  const ids = [...fields.matchAll(/\{ id: '(\w+)', kind: '(\w+)'/g)].map((m) => `${m[1]}:${m[2]}`);
  assert.ok(ids.includes('longAssistant:select'));
  assert.ok(ids.includes('longCarryOn:switch'));
  assert.match(fields, /label: 'While a Mission runs, the assistant can', text: 'What a thread\\'s assistant may do while its Mission works, waits or is paused\. Talk and look things up unless you change it\.'/);
  assert.match(fields, /label: 'Carry on by itself after a restart', text: 'After the app restarts, a Mission that was working carries on by itself\. Off: it comes back paused\.', fallback: true/);
  assert.match(fields, /label: 'Try again by itself', text: 'When your model server does not answer, it waits and tries again by itself for up to 2 hours, then ends with its report; that time does not count\. When the app stops giving it rounds for another reason, it tries again 2, 5 and 10 minutes later\. Never after you paused it\. After an app restart, Carry on by itself after a restart decides\.'/);
  assert.doesNotMatch(fields, /never after the app restarted: then it waits for you/);
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
const selectBy = (tree, label) => findAll(tree, (node) => node.type === 'select' && node.props['aria-label'] === label)[0];
const switchBy = (tree, label) => findAll(tree, (node) => node.type === 'button' && node.props.role === 'switch' && node.props['aria-label'] === label)[0];

test('drawn: Settings → Mission shows the assistant choice and Carry on (on when never set), each with its (i), and saves them', async () => {
  const { mutated, draw } = await drawSettings({ enabled: true });
  let tree = draw();
  const select = selectBy(tree, 'While a Mission runs, the assistant can');
  assert.equal(select.props.value, 'look', 'never set: Talk and look things up');
  assert.deepEqual(findAll(select, (n) => n.type === 'option').map(textOf), ['Talk and look things up', 'Only talk']);
  assert.equal(switchBy(tree, 'Carry on by itself after a restart').props['aria-checked'], true);
  for (const label of ['While a Mission runs, the assistant can', 'Carry on by itself after a restart', 'Try again by itself']) {
    assert.ok(buttonsOf(tree).some((b) => b.label === `About ${label}`), label);
  }
  select.props.onChange({ target: { value: 'talk' } });
  await tick(30);
  assert.deepEqual(JSON.parse(JSON.stringify(mutated.at(-1).ops)), [{ op: 'set', path: ['longAssistant'], value: 'talk' }]);
  tree = draw();
  switchBy(tree, 'Carry on by itself after a restart').props.onClick();
  await tick(30);
  assert.deepEqual(JSON.parse(JSON.stringify(mutated.at(-1).ops)), [{ op: 'set', path: ['longCarryOn'], value: false }]);
  const saved = await drawSettings({ enabled: true, longAssistant: 'talk', longCarryOn: false });
  tree = saved.draw();
  assert.equal(selectBy(tree, 'While a Mission runs, the assistant can').props.value, 'talk');
  assert.equal(switchBy(tree, 'Carry on by itself after a restart').props['aria-checked'], false);
});

test('drawn: Settings → Mission says what the assistant does while paused, and where a Mission works in each tab', async () => {
  const { draw } = await drawSettings({ enabled: true });
  const text = textOf(draw());
  assert.equal(S.SETTINGS_NOTES_E.length, 5);
  for (const line of S.SETTINGS_NOTES_E) assert.ok(text.includes(line), line.slice(0, 50));
  assert.doesNotMatch(text, /Pause the run to work with it yourself\./);
  assert.match(text, /While it is paused, the assistant only talks, or talks and looks things up, as the Mission settings say/);
  assert.match(text, /In Creator Plus a Mission works inside Creator Plus's rules/);
  assert.match(text, /In Devices a Mission's helpers may read devices; a step that needs your yes waits in the Mission's card\. Changing or writing a device stays with the thread itself\./);
  assert.match(text, /A Recon Mission does not come back after the app restarts\./);
});

// ---- Mission settings (Depth → Mission settings…) ----
async function openSetup(cardShown, route) {
  const page = loadPage(route ?? ((method) => (method === 'POST' ? { json: { ok: true } } : { json: cardShown })));
  const overlay = () => page.fake.React.createElement(page.parts['mission-long'], {});
  page.fake.render(overlay());
  page.win.dispatchEvent(new CustomEvent('dsh-mission:long', { detail: { sessionId: 's1' } }));
  page.fake.render(overlay());
  await tick(30);
  return { page, draw: () => page.fake.render(overlay()) };
}

test('drawn: Mission settings — the assistant choice and Carry on, with their words and (i), and Save sends both', async () => {
  const shown = { ...cardWith('none', null), saved: { minutes: 60, laps: 0, steps: 0, mode: 'auto', tools: { files: true }, assistant: 'talk', carryOn: false }, defaults: { needs: 'ask', waitAsk: 30, waitHold: 0, assistant: 'look', carryOn: true } };
  const { page, draw } = await openSetup(shown);
  let tree = draw();
  assert.equal(selectBy(tree, 'While a Mission runs, the assistant can').props.value, 'talk');
  assert.equal(switchBy(tree, 'Carry on by itself after a restart').props['aria-checked'], false);
  assert.match(textOf(tree), /It only talks: no tools\./);
  assert.match(textOf(tree), /Off: it comes back paused after a restart\./);
  assert.match(textOf(tree), /When your model server does not answer, it waits up to 2 hours and tries again by itself; that time does not count\./);
  assert.doesNotMatch(textOf(tree), /Up to three times if your model server stops answering\./);
  for (const label of ['While a Mission runs, the assistant can', 'Carry on by itself after a restart', 'Try again by itself']) {
    assert.ok(buttonsOf(tree).some((b) => b.label === `About ${label}`), label);
  }
  selectBy(tree, 'While a Mission runs, the assistant can').props.onChange({ target: { value: 'look' } });
  tree = draw();
  switchBy(tree, 'Carry on by itself after a restart').props.onClick();
  tree = draw();
  assert.match(textOf(tree), /It talks and may read and search, but changes nothing\./);
  assert.match(textOf(tree), /On: it carries on by itself after a restart\./);
  await buttonText(tree, 'Save').node.props.onClick();
  await tick(30);
  const body = posts(page)[0];
  assert.equal(body.action, 'save');
  assert.equal(body.assistant, 'look');
  assert.equal(body.carryOn, true);
  assert.equal(findAll(draw(), (n) => n.props?.role === 'dialog').length, 0, 'no Mission on: it closes as before');
});

test('drawn: Mission settings — a chat that never chose shows the defaults; while a Mission is on, the server\'s words stay shown', async () => {
  const said = 'Saved for this thread. The assistant\'s choice and Carry on by itself after a restart apply to the Mission that is on now too; the rest applies to the next Mission.';
  const shown = { ...cardWith('paused', runAt(NOW, { status: 'paused', pausedAt: NOW })), saved: { minutes: 60, laps: 0, steps: 0, mode: 'auto', tools: { files: true } }, defaults: { needs: 'ask', waitAsk: 30, waitHold: 0, assistant: 'talk', carryOn: false } };
  const { page, draw } = await openSetup(shown, (method) => (method === 'POST' ? { json: { ...shown, said } } : { json: shown }));
  let tree = draw();
  assert.equal(selectBy(tree, 'While a Mission runs, the assistant can').props.value, 'talk', 'the default from Settings');
  assert.equal(switchBy(tree, 'Carry on by itself after a restart').props['aria-checked'], false);
  await buttonText(tree, 'Save').node.props.onClick();
  await tick(30);
  assert.equal(posts(page)[0].assistant, 'talk');
  assert.equal(posts(page)[0].carryOn, false);
  tree = draw();
  assert.equal(findAll(tree, (n) => n.props?.role === 'dialog').length, 1, 'stays open to show what the server said');
  assert.ok(textOf(tree).includes(said));
  assert.ok(buttonText(tree, 'Close'));
  buttonText(tree, 'Close').node.props.onClick();
  assert.equal(findAll(draw(), (n) => n.props?.role === 'dialog').length, 0);
});

// ---- the model server does not answer ('down') ----
test('down: the strip\'s words, the next line (also on another day), and what screen readers hear', () => {
  const run = runAt(NOW, { deadline: NOW + 3600000 });
  const down = (extra) => S.stripWords(card('down', run, { down: { since: NOW - 60000, endsAt: NOW + 7140000, nextAt: NOW + 4 * 60000, tries: 2, last: 'ECONNREFUSED', ...extra } }), NOW);
  const said = down({});
  assert.equal(said.dot, 'warn');
  assert.equal(said.words, 'Waiting for your model server · tried 2 times · time limit paused');
  assert.equal(said.next, `It tries again by itself at ${clockOf(NOW + 4 * 60000)}. If the server is not back by ${clockOf(NOW + 7140000)}, it ends with its report.`);
  assert.equal(down({ tries: 1 }).words, 'Waiting for your model server · tried 1 time · time limit paused');
  assert.equal(down({ tries: 0 }).words, 'Waiting for your model server · time limit paused');
  assert.equal(S.stripWords(card('down', { ...run, deadline: 0 }, { down: { tries: 0, nextAt: NOW + 60000, endsAt: NOW + 7200000 } }), NOW).words, 'Waiting for your model server', 'no time limit: nothing to pause');
  assert.match(down({ nextAt: 0 }).next, /^It tries again by itself now\./);
  const evening = new Date(2026, 10, 20, 23, 0).getTime();
  assert.match(S.DOWN_NEXT(evening + 60000, evening + 7200000, evening), /If the server is not back by 01:00 tomorrow, it ends with its report\.$/);
  assert.equal(S.STATE_SAID.down, 'The Mission is waiting for your model server.');
});

test('drawn: down — the error note with what it last said behind Details, Try now posts try-now, Pause, Finish this lap and End stay', async () => {
  const run = runAt(NOW, { deadline: NOW + 3600000 });
  const shown = cardWith('down', run, { main: 'note', canFinishLap: true, down: { since: Date.now() - 60000, endsAt: Date.now() + 7140000, nextAt: Date.now() + 120000, tries: 1, last: 'fetch failed: ECONNREFUSED 127.0.0.1' } });
  const page = loadPage((method, body) => (method === 'POST' && body.action === 'try-now' ? { json: { ...shown, said: 'It tries your model server again now.' } } : { json: shown }));
  let tree = await drawPart(page, 'mission-run');
  const text = textOf(tree);
  assert.match(text, /Waiting for your model server · tried 1 time · time limit paused/);
  assert.match(text, /Your model server does not answer\./);
  assert.match(text, /Start it or check its connection\. The Mission tries again by itself; Try now tries at once\./);
  assert.doesNotMatch(text, /ECONNREFUSED/, 'raw details only behind Details');
  for (const label of ['Try now', 'Pause', 'Finish this lap', 'End']) assert.ok(buttonText(tree, label), label);
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Try now'));
  assert.match(textOf(tree), /The Mission is waiting for your model server\./);
  buttonText(tree, 'Details').node.props.onClick();
  tree = redrawPart(page, 'mission-run');
  assert.match(textOf(tree), /fetch failed: ECONNREFUSED/);
  await buttonText(tree, 'Try now').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page).map((b) => b.action), ['try-now']);
  assert.match(textOf(redrawPart(page, 'mission-run')), /It tries your model server again now\./);
  assert.equal(page.seat.getAttribute('data-dsh-mission'), null, 'the strip alone sets no seat attribute');
});

test('owner point 19: Try now\'s line shows only while it still waits for the server; once the server is back and work goes on, it is gone', async () => {
  const run = runAt(NOW, { deadline: NOW + 3600000 });
  const down = cardWith('down', run, { main: 'note', canFinishLap: true, down: { since: Date.now() - 60000, endsAt: Date.now() + 7140000, nextAt: Date.now() + 120000, tries: 1, last: '' } });
  const back = cardWith('running', run, { main: 'note', canFinishLap: true });
  // The server answers at once: the card after Try now is already 'running'.
  let shown = down;
  const page = loadPage((method, body) => (method === 'POST' && body.action === 'try-now' ? { json: { ...back, said: 'It tries your model server again now.' } } : { json: shown }));
  const tree = await drawPart(page, 'mission-run');
  shown = back;
  await buttonText(tree, 'Try now').node.props.onClick();
  await tick(30);
  assert.match(textOf(redrawPart(page, 'mission-run')), /Running/);
  assert.doesNotMatch(textOf(redrawPart(page, 'mission-run')), /It tries your model server again now\./, 'gone once work goes on');
  // While the try is still in flight (the card still 'down'), the line shows: the test above.
});

test('owner point 19, review: Try now\'s line does not come back when the server is back and later goes down again', async () => {
  const run = runAt(NOW, { deadline: NOW + 3600000 });
  const down = cardWith('down', run, { main: 'note', canFinishLap: true, down: { since: Date.now() - 60000, endsAt: Date.now() + 7140000, nextAt: Date.now() + 120000, tries: 1, last: '' } });
  const back = cardWith('running', run, { main: 'note', canFinishLap: true });
  let shown = down;
  // The try is still in flight: the card after Try now is still 'down', so the line shows.
  const page = loadPage((method, body) => (method === 'POST' && body.action === 'try-now' ? { json: { ...down, said: 'It tries your model server again now.' } } : { json: shown }));
  const tree = await drawPart(page, 'mission-run');
  await buttonText(tree, 'Try now').node.props.onClick();
  await tick(30);
  assert.match(textOf(redrawPart(page, 'mission-run')), /It tries your model server again now\./);
  const look = async (card) => {
    shown = card;
    page.win.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId: 's1' } }));
    await tick(30);
    redrawPart(page, 'mission-run');
    return textOf(redrawPart(page, 'mission-run'));
  };
  assert.match(await look(back), /Running/);
  // A new outage later: nobody pressed Try now in it.
  const later = await look(cardWith('down', run, { main: 'note', canFinishLap: true, down: { since: Date.now(), endsAt: Date.now() + 7200000, nextAt: Date.now() + 60000, tries: 0, last: '' } }));
  assert.match(later, /Waiting for your model server/);
  assert.doesNotMatch(later, /It tries your model server again now\./);
});

test('down is an on state: the questions card shows its approvals, and the main button stays Add note', async () => {
  const appr = { id: 'a1', kind: 'repair', by: 'repair', fix: 'model', what: 'Let this Mission\'s helpers use the next model', items: [], choices: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }] };
  assert.equal(Q.questionsShown({ run: runAt(NOW), strip: stripOf('down', { approvals: [appr] }) }, new Set(), NOW), true);
  const shown = cardWith('down', runAt(Date.now()), { main: 'note', down: { tries: 0, nextAt: Date.now() + 60000, endsAt: Date.now() + 7200000 } });
  const page = loadPage(() => ({ json: shown }));
  page.seat.setAttribute('data-composer-seat', '');
  const tree = await drawPart(page, 'mission-run-button');
  assert.equal(textOf(byClass(tree, 'dsh-ms-main')[0]), 'Add note');
  assert.equal(page.seat.getAttribute('data-dsh-mission'), 'down', 'the goal bar stays hidden while it waits for the server');
});

// ---- the repair helper ----
test('the repair line: working, next, its last fix for 30 minutes; nowWords names it', () => {
  assert.equal(S.repairWords({ repair: { working: true, cause: 'helpers came back with empty answers' } }, NOW), 'The repair helper is looking at why helpers came back with empty answers.');
  assert.equal(S.repairWords({ repair: { working: false, cause: 'the same step failed 3 times in a row' } }, NOW), 'The repair helper looks at why the same step failed 3 times in a row next.');
  const repairs = [{ id: 'r1', at: NOW - 40 * 60000, text: 'Old.', status: 'fixed' }, { id: 'r2', at: NOW - 5 * 60000, text: 'Item 3 is split into items 3, 7.', status: 'fixed' }];
  assert.equal(S.repairWords({ repair: null, repairs }, NOW), 'Repair: Item 3 is split into items 3, 7.');
  assert.equal(S.repairWords({ repair: null, repairs }, NOW + 26 * 60000), '', 'gone after 30 minutes');
  assert.equal(S.repairWords({ repair: null, repairs: [] }, NOW), '');
  assert.equal(S.nowWords({ workingKind: 'repair', workingItem: '3' }), 'the repair helper');
  assert.equal(S.stripWords(card('running', runAt(NOW, { workingKind: 'repair', workingItem: '', steps: 4, stepsAbout: 0, deadline: 0 })), NOW).words, 'Running · no time limit · step 4 · now: the repair helper');
  assert.deepEqual(S.repairRows({ repairs: [{ at: NOW, cause: 'item 3 was not finished after all its tries', text: 'Item 3 is split into items 3, 7.', point: 12 }, { at: NOW, cause: 'an overall check could not run', text: 'Told the helpers: use npm test.', point: 0 }] }), [
    `${clockOf(NOW)} · why item 3 was not finished after all its tries · Item 3 is split into items 3, 7. · Undo: /mission back 12`,
    `${clockOf(NOW)} · why an overall check could not run · Told the helpers: use npm test.`,
  ]);
});

test('drawn: the repair line with its (i) on the strip, and the Repairs block in the Checklist', async () => {
  const now = Date.now();
  const run = runAt(now, { repairs: [{ id: 'r1', at: now - 60000, cause: 'helpers came back with empty answers', text: 'Think by role is off for this Mission now: its helpers use the tier\'s thinking level.', status: 'fixed', point: 9 }] });
  const shown = cardWith('running', run, { main: 'note', repair: null, repairs: [{ id: 'r1', at: now - 60000, text: 'Think by role is off for this Mission now: its helpers use the tier\'s thinking level.', status: 'fixed' }] });
  const page = loadPage(() => ({ json: shown }));
  let tree = await drawPart(page, 'mission-run');
  assert.match(textOf(tree), /Repair: Think by role is off for this Mission now/);
  assert.ok(buttonsOf(tree).some((b) => b.label === 'About Repair helper'));
  assert.doesNotMatch(textOf(tree), /Undo: \/mission back 9/, 'the block only in the Checklist');
  buttonText(tree, 'Checklist (1)').node.props.onClick();
  tree = redrawPart(page, 'mission-run');
  const block = findAll(tree, (n) => n.props?.['aria-label'] === 'Repairs')[0];
  assert.ok(block);
  assert.match(textOf(block), /^Repairs/);
  assert.match(textOf(block), /why helpers came back with empty answers · Think by role is off/);
  assert.match(textOf(block), /Undo: \/mission back 9/);
});

// ---- carried on after a restart; paused words ----
test('the note after it carried on by itself shows for 10 minutes while running', () => {
  assert.equal(S.carriedWords({ state: 'running', carriedOn: NOW - 60000 }, NOW), 'Carried on by itself after the app restarted. Items a helper was working on go on from where they stopped.');
  assert.equal(S.carriedWords({ state: 'running', carriedOn: NOW - 11 * 60000 }, NOW), '');
  assert.equal(S.carriedWords({ state: 'paused', carriedOn: NOW - 60000 }, NOW), '');
  assert.equal(S.carriedWords({ state: 'running', carriedOn: 0 }, NOW), '');
});

test('drawn: the carried-on note on the strip', async () => {
  const shown = cardWith('running', runAt(Date.now()), { main: 'note', carriedOn: Date.now() - 30000 });
  const tree = await drawPart(loadPage(() => ({ json: shown })), 'mission-run');
  assert.match(textOf(tree), /Carried on by itself after the app restarted\./);
});

test('paused: Enter talks to the assistant as its setting says; after a restart it says why it did not carry on', () => {
  const run = runAt(NOW, { status: 'paused', pausedAt: NOW, deadline: 0 });
  const next = (strip) => S.stripWords(card('paused', run, strip), NOW).next;
  assert.equal(next({ pausedBy: 'you', assistant: 'look' }), 'Press Resume to carry on. Meanwhile Enter talks to the assistant; it can look things up but changes nothing.');
  assert.equal(next({ pausedBy: 'you', assistant: 'talk' }), 'Press Resume to carry on. Meanwhile Enter talks to the assistant; it only talks.');
  assert.equal(next({ pausedBy: 'you', assistant: '' }), 'Press Resume to carry on. Meanwhile Enter talks to the assistant as usual.', 'an older card');
  assert.equal(next({ pausedBy: 'restart', carryOn: false, assistant: 'look' }), 'Press Resume to carry on. Carry on by itself after a restart is off for this Mission (Depth → Mission settings…). Meanwhile Enter talks to the assistant; it can look things up but changes nothing.');
  assert.equal(next({ pausedBy: 'restart', carryOn: null, assistant: 'talk' }), 'Press Resume to carry on. This Mission started before it could carry on by itself. Meanwhile Enter talks to the assistant; it only talks.');
  assert.equal(next({ pausedBy: 'restart', carryOn: true, assistant: 'look' }), 'Press Resume to carry on. Meanwhile Enter talks to the assistant; it can look things up but changes nothing.', 'carry-on on but it could not: the server\'s own words say why');
  assert.equal(next({ pausedBy: 'restart', carryOn: undefined }), 'Press Resume to carry on. Meanwhile Enter talks to the assistant as usual.', 'an older card');
  // Stopped by a problem: the same sentence after what to fix.
  assert.equal(S.problemFix({ problem: { text: 'The checks could not run.' }, retryAt: 0, assistant: 'talk' }, NOW), 'Fix it if you can, then press Resume. Resume checks the problem first. Meanwhile Enter talks to the assistant; it only talks.');
});

test('a Budget stop with its higher limit in the card says where to allow it; Full auto keeps the server\'s words', () => {
  const ask = 'Paused by the Budget guard: this Mission reached its own limit of 5,000 steps. Allow the higher limit in the card above the chat box, or raise it in Settings → Budget guard, then press Resume.';
  const raise = { id: 'a2', kind: 'repair', by: 'repair', fix: 'budget', what: 'Raise …', choices: [] };
  assert.equal(S.problemFix({ problem: { text: ask }, approvals: [raise], retryAt: 0 }, NOW), 'Allow the higher limit in the card below, or raise "Steps in a Mission" in Settings → Budget guard, then press Resume.');
  const auto = 'Paused by the Budget guard: this Mission reached its own limit of 5,000 steps. Full auto does not ask to raise it: raise it in Settings → Budget guard, then press Resume.';
  assert.equal(S.problemFix({ problem: { text: auto }, approvals: [], retryAt: 0 }, NOW), '');
});

// ---- approvals the repair helper and other add-ons ask for ----
test('approvals: who asked (the repair helper, an item through an add-on, an add-on alone) and the (i) beside Allow', () => {
  assert.equal(Q.approvalAsked({ by: 'repair', kind: 'repair', items: [] }), 'Asked by the repair helper');
  assert.equal(Q.approvalAsked({ kind: 'addon', addon: 'bench', addonName: 'Devices', items: ['4'], askedBy: [{ id: '4', title: 'Read the sensor' }] }), 'Asked by item 4: Read the sensor · through Devices');
  assert.equal(Q.approvalAsked({ kind: 'addon', addon: 'creatorPlus', addonName: 'Creator Plus', items: [] }), 'Asked through Creator Plus');
  assert.equal(Q.approvalAsked({ kind: 'file', items: [] }), 'Asked by the plan or the review', 'stage D words unchanged');
  assert.equal(Q.askedWords({ from: 'repair', items: [] }), 'Asked by the repair helper');
  for (const addon of ['bench', 'recon', 'creatorPlus', 'tuning']) {
    const info = Q.choiceInfo({ kind: 'addon', addon, addonName: 'X' }, { id: 'allow' });
    assert.equal(info.what, 'Gives the yes X asks for, once, for exactly this step.');
    assert.equal(info.change, Q.ADDON_CHANGE[addon]);
  }
  assert.match(Q.ADDON_CHANGE.bench, /a Mission's helpers may read devices but never change or write them\./);
  assert.match(Q.ADDON_CHANGE.recon, /Onion addresses are never opened outside Recon\./);
  assert.match(Q.ADDON_CHANGE.creatorPlus, /Read the code on that card first \(Show the code\)\./);
  assert.equal(Q.choiceInfo({ kind: 'repair' }, { id: 'allow' }), Q.INFO_Q.repairAllow);
  assert.equal(Q.choiceInfo({ kind: 'repair' }, { id: 'deny' }), Q.INFO_Q.deny);
  assert.equal(Q.choiceInfo({ kind: 'file' }, { id: 'allow' }), Q.INFO_Q.allow);
  const info = Q.INFO_Q.repairAllow;
  assert.ok(info.title && info.what && info.when && info.change);
});

test('drawn: the card shows the add-on\'s and repair helper\'s asks with the server\'s labels; a refused Allow shows what went wrong, raw text behind Details', async () => {
  const bench = { id: 'a3', kind: 'addon', addon: 'bench', addonName: 'Devices', act: false, fix: '', what: 'Opening the serial port of Board A', items: ['2'], askedBy: [{ id: '2', title: 'Read the log' }], choices: [{ id: 'allow', label: 'Allow once' }, { id: 'deny', label: 'Deny' }] };
  const raise = { id: 'a4', kind: 'repair', by: 'repair', fix: 'budget', addon: '', addonName: '', act: false, what: 'Raise the Budget guard\'s Mission allowance from 5000 to 7500 steps (Settings → Budget guard)', items: [], choices: [{ id: 'allow', label: 'Allow' }, { id: 'deny', label: 'Deny' }] };
  const shown = cardWith('running', runAt(Date.now()), { main: 'note', approvals: [bench, raise] });
  const page = loadPage((method, body) => (method === 'POST' && body.action === 'approve'
    ? { status: 400, json: { error: 'Budget guard is switched off or not installed, so this cannot be done from here. Nothing was changed.', details: 'budgetGuard.raiseMission: not found' } }
    : { json: shown }));
  let tree = await drawPart(page, 'mission-questions');
  const text = textOf(tree);
  assert.match(text, /Asked by item 2: Read the log · through Devices/);
  assert.match(text, /Asked by the repair helper/);
  assert.ok(buttonText(tree, 'Allow once'), 'the server\'s label');
  const infos = buttonsOf(tree).filter((b) => b.label === 'About Allow once' || b.label === 'About Allow');
  assert.equal(infos.length, 2);
  buttonText(tree, 'Allow').node.props.onClick();
  await tick(30);
  assert.deepEqual(posts(page).at(-1).approvals, [{ id: 'a4', choice: 'allow' }]);
  tree = redrawPart(page, 'mission-questions');
  assert.match(textOf(tree), /Budget guard is switched off or not installed, so this cannot be done from here\. Nothing was changed\./);
  assert.doesNotMatch(textOf(tree), /raiseMission: not found/);
  buttonText(tree, 'Details').node.props.onClick();
  assert.match(textOf(redrawPart(page, 'mission-questions')), /budgetGuard\.raiseMission: not found/);
});
