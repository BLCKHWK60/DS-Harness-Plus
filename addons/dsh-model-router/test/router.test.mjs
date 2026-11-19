// Model router: the pure decision pieces, and the whole add-on against a stand-in app, including
// the starter-tier case (tiers that have no model of their own) that used to switch routing off after one turn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, apply, decide, parseRoute, textOf, validateCandidates } from '../index.js';

const msg = (text) => [{ role: 'user', content: [{ type: 'text', text }] }];

test('the settings keep their keys and defaults', () => {
  const config = Config({});
  assert.equal(config.enabled, true);
  assert.deepEqual([...config.candidates], []);
  assert.equal(config.policy.stickyTurns, 2);
  assert.equal(config.policy.minConfidence, 0.6);
  assert.equal(config.policy.respectHealth, true);
  assert.equal(config.routingModel.timeoutMs, 4000);
  assert.equal(config.commandName, 'router');
});

test('validateCandidates: none is fine, 1 or 6 is refused, ids must be unique and plain, each needs a tier or a route', () => {
  const c = (id, extra = { tier: 't' }) => ({ id, ...extra });
  assert.deepEqual(validateCandidates([]), []);
  assert.throws(() => validateCandidates([c('a')]), /2 to 5/);
  assert.throws(() => validateCandidates(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => c(id))), /2 to 5/);
  assert.throws(() => validateCandidates([c('a'), c('a')]), /duplicate/);
  assert.throws(() => validateCandidates([c('a b'), c('b')]), /invalid candidate id/);
  assert.throws(() => validateCandidates([c('a'), { id: 'b' }]), /needs a tier or a provider and model/);
  assert.equal(validateCandidates([c('a'), c('b', { provider: 'p', model: 'm' })]).length, 2);
});

test('textOf joins only the text blocks of the messages', () => {
  assert.equal(textOf([{ content: [{ type: 'text', text: 'one' }, { type: 'image' }] }, { content: [{ type: 'text', text: 'two' }] }]), 'one\ntwo');
  assert.equal(textOf(undefined), '');
  assert.equal(textOf([{ content: 'plain string' }]), '');
});

test('parseRoute takes the last JSON object with a route, clamps confidence, and gives null for rubbish', () => {
  assert.deepEqual(parseRoute('Sure! {"route":"fast","reason":"easy","confidence":0.9}'), { route: 'fast', reason: 'easy', confidence: 0.9 });
  assert.equal(parseRoute('{"route":"a","confidence":7}').confidence, 1);
  assert.equal(parseRoute('{"route":"a","confidence":"high"}').confidence, 0);
  assert.equal(parseRoute('{"route":"a"} then {"route":"b","confidence":0.8}').route, 'b');
  assert.equal(parseRoute('{"route":"a","confidence":0.5} {not json}').route, 'a');
  assert.equal(parseRoute('no json here'), null);
  assert.equal(parseRoute('{"other":1}'), null);
  assert.equal(parseRoute(undefined), null);
  assert.equal(parseRoute('{"route":"a","reason":"' + 'x'.repeat(500) + '"}').reason.length, 300);
});

test('decide: sticky, no answer, unknown route, low confidence, default, and a good answer', () => {
  const candidates = [{ id: 'a' }, { id: 'b' }];
  const base = { candidates, currentId: 'a', turnsSinceSwitch: 5, stickyTurns: 2, minConfidence: 0.6, defaultId: '' };
  const good = { route: 'b', reason: 'because', confidence: 0.9 };
  assert.deepEqual(decide({ ...base, turnsSinceSwitch: 1, answer: good }), { id: 'a', why: 'sticky' });
  assert.deepEqual(decide({ ...base, answer: good }), { id: 'b', why: 'because' });
  assert.equal(decide({ ...base, answer: null }).id, 'a');
  assert.match(decide({ ...base, answer: null }).why, /no usable routing answer/);
  assert.match(decide({ ...base, answer: { ...good, route: 'zzz' } }).why, /unknown or unusable route "zzz"/);
  assert.match(decide({ ...base, answer: { ...good, confidence: 0.2 } }).why, /below 0.6/);
  assert.equal(decide({ ...base, answer: null, defaultId: 'b' }).id, 'b');
  assert.equal(decide({ ...base, currentId: undefined, answer: null }).id, 'a');
  assert.deepEqual(decide({ ...base, candidates: [], answer: good }), { id: undefined, why: 'no usable candidate' });
});

/**
 * A stand-in app. Tier candidates use `tiers` (a starter tier has empty provider and model: its rules apply to
 * whatever model the conversation is on). `answer(prompt)` is what the routing model says.
 */
function fakeApp({ config, tiers = [], answer = () => '', health, modes } = {}) {
  const handlers = {};
  const provided = {};
  const warnings = [];
  const commands = {};
  const sessions = new Map();
  const tierOfSession = new Map();
  const prompts = [];
  const services = {
    llm: { stream: async function* (request) { prompts.push(request.messages[0].content[0].text); yield { type: 'text-delta', text: answer(request.messages[0].content[0].text) }; } },
    modelTiers: {
      listTiers: () => tiers,
      resolveTier: (id) => tiers.find((tier) => tier.id === tierOfSession.get(id)) ?? null,
      setSessionTier: async (id, tierId) => {
        tierOfSession.set(id, tierId);
        const tier = tiers.find((item) => item.id === tierId);
        const agent = sessions.get(id);
        // A tier with no model keeps the conversation's own; a tier with one selects it.
        if (tier.provider && tier.model) agent.selection = { provider: tier.provider, model: tier.model };
      },
    },
    ...(health ? { routeHealth: health } : {}),
    ...(modes ? { modes } : {}),
  };
  const ctx = {
    get: (name) => services[name],
    on: (event, handler) => { handlers[event] = handler; },
    logger: { warn: (m) => warnings.push(m), info: () => {} },
    effect: (fn) => fn(),
    provide: (key, value) => { provided[key] = value; },
    inject: (_names, callback) => callback({ effect: (fn) => fn(), commands: { register: (command) => { commands[command.name] = command; } } }),
  };
  apply(ctx, config);
  const selects = [];
  /** A conversation on `provider/model`. */
  const open = (id, provider = 'cloud', model = 'big') => {
    const agent = { id, selection: { provider, model }, model: { select: (value) => { agent.selection = { provider: value.provider, model: value.model }; selects.push({ id, ...value }); } } };
    sessions.set(id, agent);
    return agent;
  };
  /** One turn's first step. */
  const turn = async (agent, text, turnNumber = 1) => handlers['agent/pre-step']({ step: 1, agent, messages: msg(text), modelSelection: { ...agent.selection }, turn: turnNumber, signal: new AbortController().signal }, async () => 'loop');
  return { handlers, provided, warnings, commands, prompts, selects, open, turn, tierOfSession };
}

const baseConfig = (candidates, policy = {}) => ({
  enabled: true,
  candidates,
  routingModel: { provider: 'rp', model: 'rm', timeoutMs: 4000, maxTokens: 200 },
  policy: { stickyTurns: 0, minConfidence: 0.6, defaultCandidate: '', respectHealth: true, ...policy },
  prompt: { systemText: '', includeLastN: 3 },
  commandName: 'router',
});
const reply = (route, confidence = 0.9) => () => JSON.stringify({ route, reason: 'test', confidence });

test('off, or no candidates: nothing is registered', () => {
  assert.deepEqual(Object.keys(fakeApp({ config: baseConfig([]) }).handlers), []);
  const off = fakeApp({ config: { ...baseConfig([{ id: 'a', provider: 'p', model: 'm' }, { id: 'b', provider: 'p', model: 'n' }]), enabled: false } });
  assert.deepEqual(Object.keys(off.provided), []);
});

test('candidates without a routing model stop the add-on loading', () => {
  assert.throws(() => fakeApp({ config: { ...baseConfig([{ id: 'a', provider: 'p', model: 'm' }, { id: 'b', provider: 'p', model: 'n' }]), routingModel: {} } }), /routingModel/);
});

test('explicit routes: the routing answer switches the model, with its effort', async () => {
  const app = fakeApp({
    config: baseConfig([{ id: 'big', provider: 'cloud', model: 'big' }, { id: 'small', provider: 'local', model: 'small', reasoningEffort: 'low' }]),
    answer: reply('small'),
  });
  const agent = app.open('s1');
  await app.turn(agent, 'say hi');
  assert.deepEqual(app.selects, [{ id: 's1', provider: 'local', model: 'small', reasoningEffort: 'low' }]);
  const status = app.provided.modelRouter.status('s1');
  assert.equal(status.applied, 'small');
  assert.equal(status.decisions[0].switched, true);
});

test('a routing model that fails or answers below the confidence keeps the current route', async () => {
  const candidates = [{ id: 'big', provider: 'cloud', model: 'big' }, { id: 'small', provider: 'local', model: 'small' }];
  const weak = fakeApp({ config: baseConfig(candidates), answer: reply('small', 0.1) });
  await weak.turn(weak.open('s'), 'x');
  assert.deepEqual(weak.selects, []);
  const garbage = fakeApp({ config: baseConfig(candidates), answer: () => 'I cannot say' });
  await garbage.turn(garbage.open('s'), 'x');
  assert.deepEqual(garbage.selects, []);
});

test('a turn with no user text is not routed, and an isolated conversation is left alone', async () => {
  const candidates = [{ id: 'big', provider: 'cloud', model: 'big' }, { id: 'small', provider: 'local', model: 'small' }];
  const app = fakeApp({ config: baseConfig(candidates), answer: reply('small'), modes: { isolated: (id) => id === 'iso' } });
  await app.turn(app.open('s'), '   ');
  await app.turn(app.open('iso'), 'hello');
  assert.deepEqual(app.selects, []);
  assert.equal(app.prompts.length, 0);
});

test('steps after the first are never routed', async () => {
  const app = fakeApp({ config: baseConfig([{ id: 'big', provider: 'cloud', model: 'big' }, { id: 'small', provider: 'local', model: 'small' }]), answer: reply('small') });
  const agent = app.open('s');
  const loop = await app.handlers['agent/pre-step']({ step: 2, agent, messages: msg('hi'), modelSelection: agent.selection, turn: 1, signal: new AbortController().signal }, async () => 'loop');
  assert.equal(loop, 'loop');
  assert.equal(app.prompts.length, 0);
});

test('a manual model choice that is not a candidate switches routing off for that conversation', async () => {
  const app = fakeApp({ config: baseConfig([{ id: 'big', provider: 'cloud', model: 'big' }, { id: 'small', provider: 'local', model: 'small' }]), answer: reply('small') });
  const agent = app.open('s');
  await app.turn(agent, 'one');
  agent.selection = { provider: 'other', model: 'thing' }; // the person picks something else
  await app.turn(agent, 'two', 2);
  const kinds = app.provided.modelRouter.status('s').decisions.map((d) => d.kind);
  assert.deepEqual(kinds, ['decision', 'stand-down']);
  assert.equal(app.provided.modelRouter.status('s').off, true);
});

test('starter tiers (no model of their own): routing keeps working on the turns after the first', async () => {
  const tiers = [
    { id: 'quick', provider: '', model: '' },
    { id: 'deep', provider: '', model: '' },
  ];
  const app = fakeApp({
    config: baseConfig([{ id: 'q', tier: 'quick' }, { id: 'd', tier: 'deep' }]),
    tiers,
    answer: (prompt) => (/hard/.test(prompt.split('Current request:')[1]) ? JSON.stringify({ route: 'd', reason: 'hard', confidence: 0.9 }) : JSON.stringify({ route: 'q', reason: 'easy', confidence: 0.9 })),
  });
  const agent = app.open('s');
  await app.turn(agent, 'an easy question', 1);
  await app.turn(agent, 'a hard problem', 2);
  await app.turn(agent, 'another easy one', 3);
  const status = app.provided.modelRouter.status('s');
  assert.equal(status.off, false, 'routing must not have switched itself off');
  assert.deepEqual(status.decisions.map((d) => d.kind), ['decision', 'decision', 'decision']);
  assert.deepEqual(status.decisions.map((d) => d.chosen), ['q', 'd', 'q']);
  assert.equal(app.tierOfSession.get('s'), 'quick');
  assert.deepEqual(app.warnings, []);
});

test('a candidate that is on a tier with its own model is followed by that model', async () => {
  const tiers = [{ id: 'quick', provider: 'local', model: 'small' }, { id: 'deep', provider: 'cloud', model: 'big' }];
  const app = fakeApp({ config: baseConfig([{ id: 'q', tier: 'quick' }, { id: 'd', tier: 'deep' }]), tiers, answer: reply('q') });
  const agent = app.open('s', 'cloud', 'big');
  await app.turn(agent, 'one');
  assert.deepEqual(agent.selection, { provider: 'local', model: 'small' });
  await app.turn(agent, 'two', 2);
  assert.equal(app.provided.modelRouter.status('s').off, false);
});

test('a route that route health reports as down is not offered to the routing model', async () => {
  const app = fakeApp({
    config: baseConfig([{ id: 'big', provider: 'cloud', model: 'big' }, { id: 'small', provider: 'local', model: 'small' }]),
    health: { state: (provider) => ({ state: provider === 'local' ? 'down' : 'up' }) },
    answer: reply('big'),
  });
  await app.turn(app.open('s'), 'hi');
  assert.doesNotMatch(app.prompts[0], /- small/);
  assert.match(app.prompts[0], /- big/);
});

test('/router shows the state, switches routing off and on, and refuses other words', async () => {
  const app = fakeApp({ config: baseConfig([{ id: 'big', provider: 'cloud', model: 'big' }, { id: 'small', provider: 'local', model: 'small' }]), answer: reply('small') });
  const agent = app.open('s');
  const run = (rawInput) => app.commands.router.handler({ agent, rawInput });
  assert.match((await run('')).text, /Router on; in use: none yet/);
  assert.match((await run('off')).text, /Routing off/);
  await app.turn(agent, 'hi');
  assert.deepEqual(app.selects, [], 'off means the model is left alone');
  assert.match((await run('on')).text, /Routing on/);
  assert.equal((await run('maybe')).kind, 'error');
});
