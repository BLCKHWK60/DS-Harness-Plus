/**
 * Tests for the Usenet accounts as the app sees them: the configuration it accepts, and the data
 * the Settings page is given. No network and no news server; the app's own services are stand-ins.
 * Run with `node test/settings.test.mjs` in the add-on's folder.
 */
import { join } from 'node:path';
import { loadRecon } from './fixtures/room.mjs';

// Never the real room: apply() empties it.
const { apply, Config, ROOM, STATE_PATH } = await loadRecon();

let fails = 0;
let ran = 0;
const check = (name, ok, detail = '') => {
  ran += 1;
  if (ok) {
    console.log('ok   ', name);
  } else {
    fails += 1;
    console.log('FAIL ', name, detail);
  }
};
const plain = (value) => (value && typeof value.get === 'function' ? value.get() : value);

// ---- what the configuration takes ------------------------------------------------------------

const older = Config({ enabled: true, usenetRoute: 'direct', usenetHost: 'news.provider.example' });
check('an older single server is still read', plain(older.usenetHost) === 'news.provider.example');
check('it starts with no list of accounts', Array.isArray(plain(older.usenetAccounts)) && plain(older.usenetAccounts).length === 0, JSON.stringify(plain(older.usenetAccounts)));
check('the list of accounts is live, without a restart', typeof older.usenetAccounts?.get === 'function');

const saved = [
  { id: 'default', label: '', host: 'news.provider.example', port: 563 },
  { id: 'a1', label: 'Work', host: 'news.work.example', port: 119 },
];
const two = Config({ enabled: true, usenetRoute: 'direct', usenetAccounts: saved, usenetDefaultAccount: 'a1' });
check('it takes two accounts', plain(two.usenetAccounts).length === 2 && plain(two.usenetAccounts)[1].host === 'news.work.example', JSON.stringify(plain(two.usenetAccounts)));
check('it keeps the default account', plain(two.usenetDefaultAccount) === 'a1');
check('a missing port falls back to 563', Config({ usenetAccounts: [{ id: 'a1', label: 'Work', host: 'news.work.example' }] }).usenetAccounts.get()[0].port === 563, JSON.stringify(Config({ usenetAccounts: [{ id: 'a1' }] }).usenetAccounts.get()));

// ---- what the Settings page is given ---------------------------------------------------------

/** The app's services, as stand-ins, and the page's route. `extra` replaces some of them. */
const start = (config, extra = {}) => {
  const routes = new Map();
  const disposers = [];
  let command;
  const services = {
    dshHomePath: (...parts) => join('/private/tmp/dsh-recon-test-home', ...parts),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', sessionIsolated: '{}', defaultMode: 'cowork' } }, { ns: 'llm-pi-ai', value: { providers: { mine: { baseURL: 'http://localhost:1234/v1', displayName: 'Mine' } } } }], mutate: async () => {} },
    modes: { get: () => undefined, isolated: () => false },
    tools: { register: () => () => {} },
    webServer: { register: (route) => { routes.set(route.path, route); return () => {}; } },
    connection: { requestRejection: () => undefined },
    commands: { register: (spec) => { command = spec; return () => {}; } },
    sessionPersistence: { list: async () => [] },
    sessions: { get: () => undefined },
    workspaceRegistry: { archiveSession: async () => {} },
    ...extra,
  };
  const ctx = {
    ...services,
    logger: { warn: () => {}, info: () => {}, error: () => {} },
    effect: (fn) => {
      const done = fn();
      if (typeof done === 'function') disposers.push(done);
    },
    get: (name) => services[name],
    inject: (_names, callback) => callback(ctx),
    on: () => {},
  };
  apply(ctx, config);
  return { route: routes.get(STATE_PATH), say: (agent, rawInput) => command.handler({ agent, rawInput }), dispose: () => { for (const done of disposers) done(); } };
};

/** Ask the page's route for its data, as the browser does. `url` may name a conversation (`?session=`). */
const stateOf = async (route, url = STATE_PATH) => {
  const answer = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
  await route.handler({ method: 'GET', url, headers: {}, socket: {} }, answer);
  return JSON.parse(answer.body);
};

{
  const app = start(Config({ enabled: true, usenetRoute: 'direct', usenetHost: 'news.provider.example' }));
  check('the page has its route', typeof app.route?.handler === 'function');
  const first = await stateOf(app.route);
  check('the older server shows up as the first account', first.usenet.accounts.length === 1 && first.usenet.accounts[0].host === 'news.provider.example' && first.usenet.accounts[0].id === 'default', JSON.stringify(first.usenet));
  check('it is the default account when none is set', first.usenet.defaultAccount === '');
  check('its Keychain item is the original one', first.usenet.accounts[0].storeCommand.includes('-s dsh-recon-usenet -a'), first.usenet.accounts[0].storeCommand);
  check('the remove command names the same item', first.usenet.accounts[0].removeCommand.endsWith('-s dsh-recon-usenet'), first.usenet.accounts[0].removeCommand);
  check('the route stays what it was', first.usenet.route === 'direct');
  // The Keychain is looked up after the page is answered.
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const second = await stateOf(app.route);
  check('the Keychain is looked up, and only the fact is reported', typeof second.usenet.accounts[0].hasLogin === 'boolean', JSON.stringify(second.usenet.accounts[0]));
  if (second.usenet.accounts[0].hasLogin) console.log('     (this Mac has a login stored for that account, and it was found)');
  app.dispose();
}

{
  const app = start(Config({ enabled: true, usenetRoute: 'direct', usenetAccounts: saved, usenetDefaultAccount: 'a1' }));
  const state = await stateOf(app.route);
  check('both accounts reach the page', state.usenet.accounts.length === 2 && state.usenet.accounts[1].label === 'Work', JSON.stringify(state.usenet.accounts));
  check('each account has its own Keychain item', state.usenet.accounts[1].storeCommand.includes('-s dsh-recon-usenet-a1 '), state.usenet.accounts[1].storeCommand);
  check('the default account reaches the page', state.usenet.defaultAccount === 'a1');
  const carried = JSON.stringify(state);
  check('the page carries no login of the Keychain', !/"(pass|password|user|secret)"\s*:/i.test(carried) && typeof state.usenet.accounts[0].hasLogin === 'boolean', 'the page data carries a login');
  app.dispose();
}

// ---- the Internet Archive's route, and the start page's status bar ------------------------------

check('the Internet Archive is read directly unless that is switched off', plain(Config({}).archiveDirect) === true);
check('that switch is live, without a restart', typeof Config({}).archiveDirect?.get === 'function');
check('it can be switched off', plain(Config({ archiveDirect: false }).archiveDirect) === false);

{
  const agentOf = (id, provider, model, cwd = ROOM) => ({ id, session: { header: { cwd } }, model: { current: () => ({ provider, model }) } });
  const agents = { r1: agentOf('r1', 'mine', 'small'), r2: agentOf('r2', 'deepseek', 'big'), r3: agentOf('r3', 'mine', 'small', '/private/tmp') };
  const extra = { agents: { get: (id) => agents[id] }, modes: { get: () => 'recon', isolated: () => true } };
  const app = start(Config({ enabled: true, archiveOn: true, newsOn: true }), extra);
  const plainState = await stateOf(app.route);
  check('the page is told the Archive\'s route', plainState.more.archive === true && plainState.more.archiveDirect === true, JSON.stringify(plainState.more));
  check('without a conversation named, the page gets none', plainState.conversation === undefined);
  const local = (await stateOf(app.route, `${STATE_PATH}?session=r1`)).conversation;
  check('the status bar is told the conversation\'s model and that it may receive findings', local?.known === true && local.model === 'small' && local.provider === 'Mine' && local.where === 'local' && local.may === true && local.agreed === false && local.inRoom === true && local.recon === true, JSON.stringify(local));
  const cloud = (await stateOf(app.route, `${STATE_PATH}?session=r2`)).conversation;
  check('a cloud model is shown as held back until the user agrees', cloud?.where === 'cloud' && cloud.may === false, JSON.stringify(cloud));
  await app.say(agents.r2, 'cloud');
  const agreed = (await stateOf(app.route, `${STATE_PATH}?session=r2`)).conversation;
  check('after /recon cloud it may receive findings, as agreed', agreed?.may === true && agreed.agreed === true, JSON.stringify(agreed));
  check('a conversation outside Recon\'s folder is shown as such', (await stateOf(app.route, `${STATE_PATH}?session=r3`)).conversation?.inRoom === false);
  check('an unknown conversation is said to be unknown', (await stateOf(app.route, `${STATE_PATH}?session=nobody`)).conversation?.known === false);
  const said = (await app.say(agents.r1, '')).text;
  check('/recon shows the Archive read directly', said.includes('Internet Archive on, read directly, not through Tor (the Archive sees this Mac\'s internet address); GDELT news on, through Tor.'), said);
  app.dispose();
  const viaTor = start(Config({ enabled: true, archiveOn: true, archiveDirect: false }), extra);
  const saidTor = (await viaTor.say(agents.r1, 'status')).text;
  check('/recon shows the Archive through Tor when that is chosen', saidTor.includes('Internet Archive on, through Tor; GDELT news off.'), saidTor);
  check('the page is told so too', (await stateOf(viaTor.route)).more.archiveDirect === false);
  viaTor.dispose();
}

console.log(fails === 0 ? `ALL OK (${ran})` : `${fails} of ${ran} FAILED`);
process.exitCode = fails === 0 ? 0 : 1;
