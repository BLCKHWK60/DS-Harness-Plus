/**
 * Tests for the Usenet accounts as the app sees them: the configuration it accepts, and the data
 * the Settings page is given. No network and no news server; the app's own services are stand-ins.
 * Run with `node test/settings.test.mjs` in the add-on's folder.
 */
import { join } from 'node:path';
import { apply, Config, STATE_PATH } from '../index.js';

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

/** The app's services, as stand-ins, and the page's route. */
const start = (config) => {
  const routes = new Map();
  const disposers = [];
  const services = {
    dshHomePath: (...parts) => join('/private/tmp/dsh-recon-test-home', ...parts),
    settings: { describe: () => [{ ns: 'modes', value: { extraModes: '{}', sessionIsolated: '{}', defaultMode: 'cowork' } }], mutate: async () => {} },
    modes: { get: () => undefined, isolated: () => false },
    tools: { register: () => () => {} },
    webServer: { register: (route) => { routes.set(route.path, route); return () => {}; } },
    connection: { requestRejection: () => undefined },
    commands: { register: () => () => {} },
    sessionPersistence: { list: async () => [] },
    sessions: { get: () => undefined },
    workspaceRegistry: { archiveSession: async () => {} },
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
  return { route: routes.get(STATE_PATH), dispose: () => { for (const done of disposers) done(); } };
};

/** Ask the page's route for its data, as the browser does. */
const stateOf = async (route) => {
  const answer = { statusCode: 200, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(body) { this.body = body; } };
  await route.handler({ method: 'GET', headers: {}, socket: {} }, answer);
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

console.log(fails === 0 ? `ALL OK (${ran})` : `${fails} of ${ran} FAILED`);
process.exitCode = fails === 0 ? 0 : 1;
