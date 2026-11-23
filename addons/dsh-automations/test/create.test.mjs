/**
 * Item 6: the rules of the Schedule form (where it may be made, where it runs, which preset) and the plain words
 * for the app's refusals.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { CREATE_WORDS, checkText, createWords, guardWatch, guardedRefusal, guestOf, nameFrom, placePolicy, presetFor, runPlaceOf, runTabFor, scheduleProblem, scheduledIds, sealedOf } from '../lib/create.js';
import { alertText } from '../lib/alerts.js';

const thrown = (code, message = 'm') => Object.assign(new Error(message), { name: 'ScheduleInputError', code });

test('each refusal of the app is a plain sentence, the code and message only behind Details', () => {
  const cases = [
    ['invalid_rule', 'not a rule', /That time does not work/],
    ['not_future', 'x', /That time does not work/],
    ['time_out_of_range', 'x', /That time does not work/],
    ['frequency_too_high', 'x', /at most one run a minute/],
    ['invalid_time_zone', 'x', /time zone was not recognised/],
    ['subagent_session', 'x', /can't receive automations/],
    ['invalid_rule', 'target Session "s" is archived.', /can't receive automations/],
    ['invalid_rule', 'This Host cannot create Sessions; choose an existing Session target.', /New threads cannot be made here/],
    ['invalid_rule', 'target create cwd and agentPreset must be non-empty when present.', /did not accept it/],
    ['invalid_rule', 'The local at time does not exist in the selected time zone.', /That time does not work/],
    ['invalid_prompt', 'x', /instruction is empty/],
    ['internal_error', 'boom', /did not accept it/],
  ];
  for (const [code, message, words] of cases) {
    const error = scheduleProblem(thrown(code, message));
    assert.match(error.message, words, code);
    assert.equal(error.details, `${code}: ${message}`);
  }
  assert.equal(scheduleProblem(thrown('frequency_too_high'), 'zh').message, scheduleProblem(thrown('frequency_too_high')).message, 'a Chinese page gets English');
});

test('where an automation may be made', () => {
  assert.deepEqual(placePolicy({ tab: 'chat', isolated: false, helper: false, reconAllowed: true }), { allowed: true, wheres: ['session', 'new_once', 'new'], recon: false });
  assert.deepEqual(placePolicy({ tab: 'automations', isolated: false, helper: false, reconAllowed: true }).wheres, ['new_once', 'new']);
  assert.deepEqual(placePolicy({ tab: 'recon', isolated: true, helper: false, reconAllowed: true }), { allowed: true, wheres: ['session'], recon: true });
  assert.equal(placePolicy({ tab: 'recon', isolated: true, helper: false, reconAllowed: false }).reason, 'reconOff');
  assert.equal(placePolicy({ tab: 'cowork', isolated: false, helper: true, reconAllowed: true }).reason, 'helper');
});

test('where new chats open, and with which preset', () => {
  assert.equal(runTabFor({ tab: 'chat', ownTab: true, scheduledTab: 'cowork' }), 'chat');
  assert.equal(runTabFor({ tab: 'chat', ownTab: false, scheduledTab: 'cowork' }), 'cowork');
  assert.equal(runTabFor({ tab: 'automations', ownTab: true, scheduledTab: 'cowork' }), 'cowork');
  const known = ['standard', 'ptc', 'cordis'];
  assert.equal(presetFor({ locked: 'standard', picked: 'ptc', chat: 'ptc', known }), 'standard', 'a lock always wins');
  assert.equal(presetFor({ locked: '', picked: '', chat: 'ptc', known }), 'ptc', 'the chat\'s preset by default');
  assert.equal(presetFor({ locked: '', picked: ':default', chat: 'ptc', known }), '', 'App default stores none');
  assert.equal(presetFor({ locked: '', picked: 'cordis', chat: 'ptc', known }), 'cordis');
  assert.throws(() => presetFor({ locked: '', picked: 'gone', chat: '', known }), /not in the app now/);
});

test('names, instructions and the starting name', () => {
  assert.deepEqual(checkText({ title: ' a ', prompt: ' b ' }), { title: 'a', prompt: 'b' });
  assert.throws(() => checkText({ title: 'x'.repeat(121), prompt: 'b' }), /1 to 120/);
  assert.throws(() => checkText({ title: 'a', prompt: 'x'.repeat(20001) }), /too long/);
  assert.equal(nameFrom('Summarise my inbox'), 'Summarise my inbox');
  const long = nameFrom('Read every new message in the support inbox and write a short summary of the urgent ones');
  assert.ok(long.length <= 61 && long.endsWith('…'), long);
});

test('the task ids of a scheduled message, and which automations are Recon\'s', () => {
  const text = '[SCHEDULE REMINDER]\nschedule_id_json: "t1"\nreminders_json: [{"schedule_id":"t2"}]';
  assert.deepEqual(scheduledIds([{ message: { source: { kind: 'schedule' }, content: [{ type: 'text', text }] } }]), ['t1', 't2']);
  assert.deepEqual(scheduledIds([{ source: { kind: 'user' }, content: [{ type: 'text', text }] }]), []);
  const isolated = (id) => id === 'r1';
  const isolatedTab = (tab) => tab === 'recon';
  assert.equal(sealedOf({ entry: { target: { kind: 'session', sessionId: 'r1' } }, createdIn: 'cowork', isolated, isolatedTab }), true);
  assert.equal(sealedOf({ entry: { target: { kind: 'new', create: {} } }, createdIn: 'recon', isolated, isolatedTab }), true, 'made in Recon by the assistant');
  assert.equal(sealedOf({ entry: { target: { kind: 'session', sessionId: 'c1' } }, createdIn: 'chat', isolated, isolatedTab }), false);
});

test('a Recon automation\'s alert never names it', () => {
  assert.equal(alertText({ event: 'failed', scheduled: true, name: 'Onion watch', sealed: true }), 'A Recon automation failed');
  assert.equal(alertText({ event: 'needs', scheduled: true, name: 'Onion watch', sealed: true, waiting: 'approval' }).startsWith('A Recon automation'), true);
  assert.equal(alertText({ event: 'finished', scheduled: true, name: 'Brief' }), 'Brief finished');
});

test('the form\'s words are English only, also for a page that reports Chinese (decision 28)', () => {
  assert.deepEqual(Object.keys(CREATE_WORDS), ['en']);
  assert.equal(createWords('zh'), CREATE_WORDS.en);
  assert.equal(createWords('zh-CN'), CREATE_WORDS.en);
});

// Stage 6b (7.5): updated: without `ready` (Modes cannot say) every guest still refuses; the ready cases are below.
test('guardedRefusal: Creator Plus at home in Workshop may make automations; every other guarded case refuses (fail closed)', () => {
  const guard = (over) => ({ top: 't', space: 'workshop', mode: 'creator-plus', guardedBy: 'workshop', homeMode: true, unknownTop: false, ...over });
  assert.equal(guardedRefusal(guard({})), '', 'Creator Plus at home in Workshop');
  assert.equal(guardedRefusal(guard({ mode: 'research', homeMode: false })), 'workshop', 'a guest in Workshop');
  assert.equal(guardedRefusal(guard({ homeMode: false })), 'workshop', 'home not plainly said');
  assert.equal(guardedRefusal(guard({ homeMode: undefined })), 'workshop');
  assert.equal(guardedRefusal(guard({ unknownTop: true })), 'workshop');
  assert.equal(guardedRefusal(guard({ space: 'devices', guardedBy: 'devices' })), 'devices', 'Creator Plus visiting Devices');
  assert.equal(guardedRefusal(guard({ space: 'devices', guardedBy: 'devices', mode: 'bench' })), 'devices', 'Devices mode: no change');
  assert.equal(guardedRefusal(guard({ space: '', guardedBy: 'unknown', mode: '', homeMode: false, unknownTop: true })), 'unknown', 'Modes could not read it');
  assert.equal(guardedRefusal(null), 'unknown');
  assert.equal(guardedRefusal('workshop'), 'unknown');
  assert.equal(guardedRefusal(guard({ space: 'chat', guardedBy: '', mode: 'chat', homeMode: false })), '', 'not guarded');
  assert.equal(guardedRefusal(guard({ space: 'recon', guardedBy: '', mode: 'research', homeMode: false })), '', 'Recon is decided by sealing, not here');
});

// ---- Item 4A, stage 6b (STAGE6B-DESIGN.md Part B) ----------------------------------------------------------------

test('guardedRefusal (6b): guests pass while their guard is ready; the unknown guard, an unknown top and the Devices mode at home refuse', () => {
  const ready = { devices: true, workshop: true, recon: true };
  const guard = (over) => ({ top: 't', space: 'devices', mode: 'research', guardedBy: 'devices', homeMode: false, unknownTop: false, ...over });
  assert.equal(guardedRefusal(guard({}), ready), '', 'a guest in Devices');
  assert.equal(guardedRefusal(guard({ space: 'workshop', guardedBy: 'workshop' }), ready), '', 'a guest in Workshop');
  assert.equal(guardedRefusal(guard({}), { ...ready, devices: false }), 'devices', 'its guard is not ready');
  assert.equal(guardedRefusal(guard({}), {}), 'devices', 'Modes cannot say: not ready');
  assert.equal(guardedRefusal(guard({ unknownTop: true }), ready), 'devices');
  assert.equal(guardedRefusal(guard({ guardedBy: 'unknown', space: '' }), ready), 'unknown');
  assert.equal(guardedRefusal(guard({ mode: 'bench', homeMode: true }), ready), 'devices', 'G4: the Devices mode at home has no clock');
  assert.equal(guardedRefusal(guard({ space: 'workshop', guardedBy: 'workshop', mode: 'creator-plus', homeMode: true }), {}), '', 'G3: Creator Plus at home as before');
  assert.equal(guestOf(guard({})), 'devices');
  assert.equal(guestOf(guard({ mode: 'bench', homeMode: true })), '', 'a home mode is no guest');
  assert.equal(guestOf(guard({ guardedBy: 'unknown' })), '');
  assert.equal(guestOf(null), '');
});

test('placePolicy (6b): a guest gets all three places and the other spaces it may pick; sealed threads as before', () => {
  assert.deepEqual(placePolicy({ tab: 'research', isolated: false, helper: false, reconAllowed: true, guest: 'devices' }), { allowed: true, wheres: ['session', 'new_once', 'new'], recon: false, guest: 'devices', otherSpaces: ['chat', 'code'] });
  assert.deepEqual(placePolicy({ tab: 'recon', isolated: true, helper: false, reconAllowed: true, guest: '' }).wheres, ['session']);
  assert.equal(placePolicy({ tab: 'research', isolated: false, helper: true, reconAllowed: true, guest: 'devices' }).reason, 'helper');
});

test('runPlaceOf: stored place as it is; derived when read (J5); a thread target; Finance, reused and the setting off', () => {
  const ofMode = (mode) => ({ bench: 'devices', code: 'code' }[mode] ?? 'chat');
  const scheduledPlace = () => ({ space: 'chat', mode: 'cowork' });
  const base = { ofMode, scheduledPlace, ownTab: true, isFinanceBrief: (t) => String(t?.title ?? '').startsWith('Finance brief: '), threadPlace: (id) => ({ space: id === 'r1' ? 'recon' : 'chat', mode: 'research' }) };
  const fresh = { target: { kind: 'new', create: {} } };
  assert.deepEqual(runPlaceOf({ ...base, task: fresh, note: { runTab: 'research', runSpace: 'code' } }), { space: 'code', mode: 'research', stored: true, fixed: '', note: '' });
  assert.deepEqual(runPlaceOf({ ...base, task: fresh, note: { runTab: 'research' } }), { space: 'chat', mode: 'research', stored: false, fixed: '', note: '' }, 'derived: where it ran before 6b');
  assert.deepEqual(runPlaceOf({ ...base, task: fresh, note: {} }), { space: 'chat', mode: 'cowork', stored: false, fixed: '', note: '' }, 'no run mode: the scheduled place');
  assert.equal(runPlaceOf({ ...base, task: fresh, note: { runTab: 'research' }, ownTab: false }).fixed, 'off');
  assert.deepEqual(runPlaceOf({ ...base, task: fresh, note: { runTab: 'research', runSpace: 'devices' }, ownTab: false }), { space: 'devices', mode: 'research', stored: true, fixed: '', note: '' }, 'C2: a guarded place also with the setting off');
  assert.equal(runPlaceOf({ ...base, task: { ...fresh, title: 'Finance brief: x' }, note: {} }).fixed, 'finance');
  assert.deepEqual(runPlaceOf({ ...base, task: { target: { kind: 'session', sessionId: 'r1' } }, note: {} }), { space: 'recon', mode: 'research', stored: false, fixed: 'thread', note: '' });
  assert.equal(runPlaceOf({ ...base, task: { target: { kind: 'new_once', sessionId: 'c9' }, lastDelivery: {} }, note: { runTab: 'research' } }).fixed, 'reused');
});

test('guardWatch: mode gone as before; a guarded place by its space; a Chat or Code place only a note (J8, J9, J17, C3)', () => {
  const inputs = (over = {}) => ({
    task: { target: { kind: 'new', create: {} } }, note: {}, legacyWatch: '', modeThere: () => true, guardState: () => 'ready',
    offered: () => true, available: () => true, shown: () => true, ownTab: true, ...over,
  });
  assert.deepEqual(guardWatch(inputs({ legacyWatch: 'research', modeThere: (id) => id !== 'research' })), { watch: 'research', missing: true, reason: 'modeGone', placeNote: '', space: '', mode: 'research' }, 'pre-6b: the mode, exactly as before');
  const guest = { runTab: 'research', runSpace: 'devices' };
  assert.equal(guardWatch(inputs({ note: guest })).missing, false);
  assert.deepEqual(guardWatch(inputs({ note: guest, guardState: () => 'off' })), { watch: 'space:devices', missing: true, reason: 'devicesOff', placeNote: '', space: 'devices', mode: 'research' });
  assert.equal(guardWatch(inputs({ note: guest, guardState: () => 'old' })).reason, 'devicesOld');
  assert.equal(guardWatch(inputs({ note: guest, offered: () => false })).reason, 'unticked');
  assert.equal(guardWatch(inputs({ note: guest, available: () => false })).reason, 'unavailable');
  assert.deepEqual(guardWatch(inputs({ note: guest, modeThere: () => false })).watch, 'research', 'C3: a mode whose add-on is off pauses as a mode');
  const code = { runTab: 'research', runSpace: 'code' };
  assert.deepEqual(guardWatch(inputs({ note: code, offered: () => false })), { watch: 'research', missing: false, reason: '', placeNote: 'unticked', space: 'code', mode: 'research' });
  assert.equal(guardWatch(inputs({ note: code, shown: () => false })).placeNote, 'hidden');
  assert.equal(guardWatch(inputs({ note: { createdIn: 'devices' }, guardState: () => 'off' })).watch, 'space:devices', 'J17: legacy createdIn devices is a space');
  assert.equal(guardWatch(inputs({ task: { target: { kind: 'session', sessionId: 's' } }, note: { createdIn: 'research', createdSpace: 'workshop' }, guardState: () => 'off' })).reason, 'workshopOff', 'a thread target made by a guest');
});

test('sealedOf (6b): made in the Recon space (any mode) is sealed', () => {
  const isolated = () => false;
  const isolatedTab = () => false;
  assert.equal(sealedOf({ entry: { target: { kind: 'new' } }, createdIn: 'research', createdSpace: 'recon', isolated, isolatedTab }), true);
  assert.equal(sealedOf({ entry: { target: { kind: 'new' } }, createdIn: 'research', createdSpace: 'code', isolated, isolatedTab }), false);
});

test('the stage 6b words: every key is there, the reasons in pairs', () => {
  for (const key of ['runsIn', 'runsInThread', 'runsInScheduled', 'placeUnticked', 'placeHidden', 'pausedSpace', 'pausedSpaceBack', 'automationsOff', 'guestHere', 'guestOther', 'guestInfo', 'otherWarn', 'guestFolderNeeded', 'guestFolderRefused', 'guestFolderUnchecked', 'guestOwnFolder', 'needsNewerModes', 'presetLockedSpace', 'presetWillBe', 'wrapperPaused', 'guardNotReady', 'benchHome']) {
    assert.ok(CREATE_WORDS.en[key] !== undefined, key);
  }
  for (const pair of Object.values(CREATE_WORDS.en.reasons)) assert.equal(pair.length, 2);
  assert.equal(CREATE_WORDS.en.runsIn('Code', 'Research'), 'Runs in: Code · Research');
  assert.equal(CREATE_WORDS.en.guardedSpace, undefined, '6a\'s "yet" sentence is gone');
});
