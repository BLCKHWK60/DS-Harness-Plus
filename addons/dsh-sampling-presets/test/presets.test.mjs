// Sampling presets (host): the settings, validation of references, which preset a conversation gets
// (its own choice, its mode, the default), what is added to a request and what is never overridden,
// the server-alias model switch at a turn boundary, and /sampling.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Config, apply, pickPreset, validateConfig } from '../index.js';

const CONFIG = () => ({
  enabled: true,
  presets: { precise: { temperature: 0.1, maxTokens: 4000 }, loose: { temperature: 1.2, maxTokens: 800 } },
  categories: { code: 'precise', chat: 'loose' },
  byMode: { coding: 'code' },
  defaultCategory: 'chat',
  perModel: {},
  strategy: 'mixed',
  commandName: 'sampling',
});

test('the settings keep their keys and defaults, and the six live ones are live', () => {
  const config = Config({});
  const live = (v) => (v && typeof v.get === 'function' ? v.get() : v);
  assert.equal(config.enabled, true);
  assert.deepEqual({ ...live(config.presets) }, {});
  assert.equal(live(config.strategy), 'mixed');
  assert.equal(live(config.defaultCategory), '');
  assert.equal(config.commandName, 'sampling');
  for (const key of ['presets', 'categories', 'byMode', 'defaultCategory', 'perModel', 'strategy']) assert.equal(typeof config[key].get, 'function', `${key} is live`);
  assert.throws(() => Config({ presets: { x: { temperature: 3, maxTokens: 10 } } }), undefined, 'temperature above 2 is refused');
  assert.throws(() => Config({ strategy: 'banana' }));
});

test('validateConfig refuses a reference that points nowhere', () => {
  assert.doesNotThrow(() => validateConfig(CONFIG()));
  assert.throws(() => validateConfig({ ...CONFIG(), categories: { code: 'nope' } }), /unknown preset "nope"/);
  assert.throws(() => validateConfig({ ...CONFIG(), byMode: { coding: 'nope' } }), /unknown category "nope"/);
  assert.throws(() => validateConfig({ ...CONFIG(), defaultCategory: 'nope' }), /not a category/);
  assert.throws(() => validateConfig({ ...CONFIG(), perModel: { 'no-slash': {} } }), /<provider>\/<model>/);
  assert.throws(() => validateConfig({ ...CONFIG(), perModel: { 'a/b': { allowedPresets: ['nope'] } } }), /unknown preset "nope"/);
  assert.throws(() => validateConfig({ ...CONFIG(), perModel: { 'a/b': { aliases: { nope: 'x' } } } }), /unknown preset "nope"/);
});

test('pickPreset: nothing without a category, the named preset, a model that does not allow it, and an alias', () => {
  const cfg = { ...CONFIG(), perModel: { 'p/m': { allowedPresets: ['precise'], aliases: { precise: 'm-precise' } } } };
  assert.equal(pickPreset(cfg, null, 'p/m'), null);
  assert.equal(pickPreset(cfg, 'unknown', 'p/m'), null);
  assert.deepEqual(pickPreset(cfg, 'code', 'p/m'), { category: 'code', name: 'precise', preset: cfg.presets.precise, alias: 'm-precise' });
  assert.deepEqual(pickPreset(cfg, 'chat', 'p/m'), { blocked: 'preset "loose" is not allowed for p/m' });
  assert.equal(pickPreset(cfg, 'chat', 'other/model').name, 'loose');
  assert.equal('alias' in pickPreset(cfg, 'chat', 'other/model'), false);
});

/** The app as far as Sampling presets looks at it. */
function fakeApp({ config = CONFIG(), tiers, mode } = {}) {
  const handlers = {};
  const provided = {};
  const warnings = [];
  const commands = {};
  const agents = new Map();
  const services = { agents: { get: (id) => agents.get(id) }, ...(tiers ? { modelTiers: tiers } : {}), modes: { get: () => mode?.current } };
  const ctx = {
    get: (name) => services[name],
    on: (event, handler) => { handlers[event] = handler; },
    logger: { warn: (m) => warnings.push(m), info: () => {} },
    effect: (fn) => fn(),
    provide: (key, value) => { provided[key] = value; },
    inject: (_n, callback) => callback({ effect: (fn) => fn(), commands: { register: (c) => { commands[c.name] = c; } } }),
  };
  apply(ctx, config);
  const open = (id, provider = 'p', model = 'm', status = 'idle') => {
    const agent = { id, status, selected: [], current: { provider, model }, model: { current: () => agent.current, select: (value) => { agent.selected.push(value); agent.current = { provider: value.provider, model: value.model, reasoningEffort: value.reasoningEffort }; } } };
    agents.set(id, agent);
    return agent;
  };
  const request = (agent, base = { temperature: 0.7 }) => handlers['agent/request']({ agent }, async () => base);
  return { handlers, provided, warnings, commands, open, request };
}

test('a conversation with the default category gets that preset\'s temperature and max tokens on each request', async () => {
  const app = fakeApp();
  const agent = app.open('s');
  assert.deepEqual(await app.request(agent, { temperature: 0.7, other: 1 }), { temperature: 1.2, maxTokens: 800, other: 1 });
});

test('the order is: your own /sampling choice, then the mode\'s category, then the default', async () => {
  const mode = { current: 'coding' };
  const app = fakeApp({ mode });
  const agent = app.open('s');
  assert.equal((await app.request(agent)).temperature, 0.1, 'the mode wins over the default');
  app.provided.samplingPresets.setCategory('s', 'chat');
  assert.equal((await app.request(agent)).temperature, 1.2, 'your own choice wins over the mode');
  app.provided.samplingPresets.setCategory('s', null);
  assert.equal((await app.request(agent)).temperature, 0.1);
  mode.current = 'unlisted-mode';
  assert.equal((await app.request(agent)).temperature, 1.2, 'a mode without a category falls back to the default');
});

test('a value you set for the conversation in the chat box is never overridden; the other one still is', async () => {
  const both = fakeApp({ tiers: { sessionSampling: () => ({ temperature: 0.9, maxTokens: 123 }) } });
  assert.deepEqual(await both.request(both.open('s')), { temperature: 0.7 }, 'both are yours: the request is left as it was');
  const one = fakeApp({ tiers: { sessionSampling: () => ({ temperature: 0.9 }) } });
  assert.deepEqual(await one.request(one.open('s'), { temperature: 0.9 }), { temperature: 0.9, maxTokens: 800 });
});

test('no presets, no category, or a model that does not allow the preset: the request is untouched', async () => {
  const none = fakeApp({ config: { ...CONFIG(), presets: {}, categories: {}, byMode: {}, defaultCategory: '' } });
  assert.deepEqual(await none.request(none.open('s')), { temperature: 0.7 });
  const noCategory = fakeApp({ config: { ...CONFIG(), defaultCategory: '' } });
  assert.deepEqual(await noCategory.request(noCategory.open('s')), { temperature: 0.7 });
  const blocked = fakeApp({ config: { ...CONFIG(), perModel: { 'p/m': { allowedPresets: ['precise'] } } } });
  assert.deepEqual(await blocked.request(blocked.open('s')), { temperature: 0.7 });
});

test('strategy server-alias leaves the request alone; in-dsh never switches the model', async () => {
  const alias = fakeApp({ config: { ...CONFIG(), strategy: 'server-alias' } });
  assert.deepEqual(await alias.request(alias.open('s')), { temperature: 0.7 });
  const inDsh = fakeApp({ config: { ...CONFIG(), strategy: 'in-dsh', defaultCategory: 'code', perModel: { 'p/m': { aliases: { precise: 'm-precise' } } } } });
  const agent = inDsh.open('s');
  inDsh.handlers['agent/created']({ agent });
  assert.deepEqual(agent.selected, []);
  assert.equal((await inDsh.request(agent)).temperature, 0.1);
});

test('off: nothing is registered', () => {
  assert.deepEqual(Object.keys(fakeApp({ config: { ...CONFIG(), enabled: false } }).handlers), []);
});

test('server alias: the alias model is selected for the category, switched back, and a model of yours is never touched', () => {
  const config = { ...CONFIG(), strategy: 'server-alias', defaultCategory: 'code', perModel: { 'p/m': { aliases: { precise: 'm-precise' } } } };
  const app = fakeApp({ config });
  const agent = app.open('s');
  app.handlers['agent/created']({ agent });
  assert.deepEqual(agent.selected, [{ provider: 'p', model: 'm-precise' }]);
  // Another category without an alias: back to the base model.
  app.provided.samplingPresets.setCategory('s', 'chat');
  assert.deepEqual(agent.selected.at(-1), { provider: 'p', model: 'm' });
  app.provided.samplingPresets.setCategory('s', 'code');
  assert.equal(agent.current.model, 'm-precise');
  // The person picks a model from another route: it is left alone.
  agent.current = { provider: 'other', model: 'theirs' };
  const before = agent.selected.length;
  app.provided.samplingPresets.setCategory('s', 'chat');
  assert.equal(agent.selected.length, before);
});

test('a switch asked for while a turn is running waits until the conversation is idle; the reasoning effort is kept', () => {
  const config = { ...CONFIG(), strategy: 'server-alias', defaultCategory: 'chat', perModel: { 'p/m': { aliases: { precise: 'm-precise' } } } };
  const app = fakeApp({ config });
  const agent = app.open('s', 'p', 'm', 'running');
  agent.current = { provider: 'p', model: 'm', reasoningEffort: 'high' };
  app.provided.samplingPresets.setCategory('s', 'code');
  assert.deepEqual(agent.selected, [], 'not in the middle of a turn');
  agent.status = 'idle';
  app.handlers['agent/status']({ agent, status: 'idle' });
  assert.deepEqual(agent.selected, [{ provider: 'p', model: 'm-precise', reasoningEffort: 'high' }]);
});

test('the service and /sampling: list, effective, unknown choices refused, and a clear text for each state', async () => {
  const app = fakeApp({ tiers: { sessionSampling: () => ({ maxTokens: 50 }) } });
  const agent = app.open('s');
  const service = app.provided.samplingPresets;
  assert.deepEqual(service.list(), { presets: ['precise', 'loose'], categories: ['code', 'chat'] });
  assert.equal(service.effective('s').preset, 'loose');
  assert.throws(() => service.effective('ghost'), /unknown thread/);
  assert.throws(() => service.setCategory('s', 'nope'), /unknown category/);
  const run = (rawInput) => app.commands.sampling.handler({ agent, rawInput });
  assert.match((await run('')).text, /Category chat: preset loose \(temperature 1.2, max tokens 800\); strategy mixed\. Your chat box sampling for this thread takes precedence\./);
  assert.match((await run('code')).text, /Category code \(set by you\): preset precise/);
  const bad = await run('banana');
  assert.equal(bad.kind, 'error');
  assert.match(bad.text, /Categories: code, chat/);
  assert.match((await run('AUTO')).text, /Category chat: preset loose/);
  const blocked = fakeApp({ config: { ...CONFIG(), perModel: { 'p/m': { allowedPresets: ['precise'] } } } });
  const b = blocked.open('b');
  assert.match((await blocked.commands.sampling.handler({ agent: b, rawInput: '' })).text, /No preset applies \(preset "loose" is not allowed for p\/m\)/);
});

test('a conversation that goes away is forgotten', () => {
  const app = fakeApp();
  const agent = app.open('s');
  app.provided.samplingPresets.setCategory('s', 'code');
  app.handlers['agent/disposed']({ agent });
  assert.equal(app.provided.samplingPresets.effective('s').override, null);
});
