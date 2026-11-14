import test from 'node:test';
import assert from 'node:assert/strict';
import { MODE, MODE_ID, METHOD, TOOLS, withRecon } from '../lib/mode.js';
import { mayReceive, openConsent, providerPlace, staysHome, whereOf } from '../lib/model.js';
import { buildTools } from '../lib/tools.js';

test('the mode is isolated and lists only its own tools', () => {
  assert.equal(MODE.isolated, true);
  assert.deepEqual(MODE.tools, TOOLS);
  assert.ok(TOOLS.every((name) => name.startsWith('recon_')));
  assert.ok(METHOD.length <= 4000, 'the method fits the Modes add-on');
  const on = JSON.parse(withRecon('{"data":{"label":"Data"}}', true));
  assert.deepEqual(Object.keys(on), ['data', MODE_ID]);
  assert.equal(withRecon(JSON.stringify(on), true), undefined, 'nothing to change when it is already there');
  assert.deepEqual(JSON.parse(withRecon(JSON.stringify(on), false)), { data: { label: 'Data' } });
  assert.equal(withRecon('{}', false), undefined);
  assert.deepEqual(Object.keys(JSON.parse(withRecon('not json', true))), [MODE_ID]);
});

test('where a model runs', () => {
  assert.equal(whereOf('http://localhost:1234/v1').where, 'local');
  assert.equal(whereOf('http://127.0.0.1:8080').where, 'local');
  assert.equal(whereOf('http://192.168.1.20:1234/v1').where, 'network');
  assert.equal(whereOf('http://studio.local:1234').where, 'network');
  assert.equal(whereOf('https://api.example.com/v1').where, 'cloud');
  assert.equal(whereOf('http://8.8.8.8/v1').where, 'cloud');
  assert.equal(whereOf('nonsense').where, 'unknown');
  const providers = { mine: { baseURL: 'http://localhost:1234/v1', displayName: 'Mine' }, far: { baseURL: 'https://api.example.com' }, bare: {} };
  assert.equal(providerPlace(providers, 'mine').where, 'local');
  assert.equal(providerPlace(providers, 'far').where, 'cloud');
  assert.equal(providerPlace(providers, 'bare').where, 'cloud', 'a provider without an address is a service');
  assert.equal(providerPlace(providers, 'deepseek').where, 'cloud');
  assert.equal(providerPlace(providers, 'other').where, 'unknown');
  assert.equal(staysHome(providerPlace(providers, 'other')), false, 'unknown is treated as cloud');
});

test('content goes to a cloud model only after the user agreed, for that conversation and model', () => {
  const consent = openConsent();
  const local = { where: 'local', host: 'localhost', name: 'Mine' };
  const cloud = { where: 'cloud', host: 'api.example.com', name: 'Far' };
  const route = { provider: 'far', model: 'big' };
  assert.equal(mayReceive({ place: local, route: { provider: 'mine', model: 'm' }, id: 'a', consent }).ok, true);
  assert.equal(mayReceive({ place: local, route: undefined, id: 'a', consent }).ok, false, 'no model, nothing sent');
  const refused = mayReceive({ place: cloud, route, id: 'a', consent });
  assert.equal(refused.ok, false);
  assert.match(refused.why, /\/recon cloud/);
  consent.agree('a', route);
  assert.equal(mayReceive({ place: cloud, route, id: 'a', consent }).ok, true);
  assert.equal(mayReceive({ place: cloud, route, id: 'b', consent }).ok, false, 'another conversation has not agreed');
  assert.equal(mayReceive({ place: cloud, route: { provider: 'far', model: 'other' }, id: 'a', consent }).ok, false, 'another model has not been agreed to');
  assert.equal(mayReceive({ place: { where: 'unknown', host: '', name: 'x' }, route: { provider: 'x', model: 'm' }, id: 'c', consent }).ok, false);
  consent.forget('a');
  assert.equal(mayReceive({ place: cloud, route, id: 'a', consent }).ok, false);
});

test('a tool runs only in a Recon conversation and only past the model gate', async () => {
  const state = { enabled: true, recon: true, room: true, gate: { ok: true, why: '' } };
  const onion = { search: async (id, query) => `searched ${id} ${query}`, read: async () => 'read' };
  const sources = { find: () => undefined, list: () => [], cite: () => '' };
  const tools = buildTools({ enabled: () => state.enabled, inRecon: () => state.recon, inRoom: () => state.room, gate: () => state.gate, onion, usenet: { groups: async () => 'g', search: async () => 's', read: async (id, args) => `article ${args.messageId}` }, sources, idOf: () => 'c1' });
  assert.deepEqual(tools.map((tool) => tool.name), TOOLS);
  const run = async () => (await tools[0].execute({ query: 'x' }, {})).text;
  assert.equal(await run(), 'searched c1 x');
  assert.equal((await tools.find((tool) => tool.name === 'recon_usenet_read').execute({ group: 'a', messageId: '<b>' }, {})).text, 'article <b>');
  assert.match((await tools.find((tool) => tool.name === 'recon_cite').execute({ source: 'S1' }, {})).text, /Nothing was read/);
  state.room = false;
  assert.match(await run(), /runs in a folder of the user's, so its tools are off/);
  state.room = true;
  state.gate = { ok: false, why: 'not agreed' };
  assert.equal(await run(), 'not agreed');
  state.recon = false;
  assert.match(await run(), /only in a conversation of the Recon tab/);
  state.enabled = false;
  assert.match(await run(), /switched off/);
});
