/**
 * Tests for the Usenet accounts and for the way a request reaches one: no network, no Keychain, no
 * news server. Run with `node test/accounts.test.mjs` in the add-on's folder.
 */
import { pickAccount, readAccounts, removeCommandFor, serviceOf, storeCommandFor, validHost } from '../lib/accounts.js';
import { createUsenet } from '../lib/usenet.js';

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

// ---- reading the saved list -------------------------------------------------------------------

const saved = [
  { id: 'a1b2c3d4e5f6', label: 'Work', host: 'news.work.example', port: 563 },
  { id: 'f6e5d4c3b2a1', label: '', host: 'news.home.example', port: 119 },
];
check('a saved list is read back as it was saved', JSON.stringify(readAccounts(saved, {})) === JSON.stringify(saved), JSON.stringify(readAccounts(saved, {})));

const legacy = readAccounts([], { host: 'news.provider.example', port: 563 });
check('an older single server becomes the first account', legacy.length === 1 && legacy[0].id === 'default' && legacy[0].host === 'news.provider.example');
check('and keeps the original Keychain item', serviceOf('default') === 'dsh-recon-usenet', serviceOf('default'));
check('a later account gets its own Keychain item', serviceOf('a1b2c3d4e5f6') === 'dsh-recon-usenet-a1b2c3d4e5f6', serviceOf('a1b2c3d4e5f6'));
check('the store command names that item', storeCommandFor('abc').includes('-s dsh-recon-usenet-abc'));
check('the remove command names that item', removeCommandFor('abc').includes('-s dsh-recon-usenet-abc'));

const odd = readAccounts([{ id: 'My Account!', host: 'a.example' }, { id: 'My Account!', host: 'b.example' }], {});
check('odd ids are made safe, and stay distinct', odd.length === 2 && odd[0].id !== odd[1].id && odd.every((one) => /^[a-z0-9][a-z0-9-]*$/.test(one.id)), JSON.stringify(odd.map((one) => one.id)));
check('a port that is not one becomes 563', readAccounts([{ id: 'x', host: 'a.example', port: 'nonsense' }], {})[0].port === 563);
check('more accounts than allowed are cut off', readAccounts(Array.from({ length: 12 }, (_unused, index) => ({ id: `a${index}`, host: 'a.example' })), {}).length === 8);
check('a valid server is accepted', validHost('news.example.com') && validHost('news.provider.example'));
check('an invalid server is refused', !validHost('') && !validHost('news..com') && !validHost('https://news.example.com'));

// ---- naming the account a request wants -------------------------------------------------------

const accounts = [
  { id: 'default', label: '', host: 'news.provider.example', port: 563 },
  { id: 'a1', label: 'Work', host: 'news.work.example', port: 563 },
];
check('an account is found by its id', pickAccount(accounts, 'a1', '').account?.label === 'Work');
check('an account is found by its name', pickAccount(accounts, 'work', '').account?.id === 'a1');
check('an account is found by its server', pickAccount(accounts, 'news.provider.example', '').account?.id === 'default');
check('the name is matched without case or spaces', pickAccount(accounts, ' NEWS.Work.Example ', '').account?.id === 'a1');
check('the default account is used when none is named', pickAccount(accounts, '', 'a1').account?.id === 'a1');
check('the first account is used when there is no default', pickAccount(accounts, '', '').account?.id === 'default');
const unknown = pickAccount(accounts, 'nntp', '');
check('an unknown account is refused, with the accounts named', !unknown.account && unknown.why.includes('Nothing was sent') && unknown.why.includes('Work'), unknown.why);
check('no account at all is refused', !pickAccount([], '', '').account);

// ---- one visit, with stand-ins ----------------------------------------------------------------

/** A sources record that only counts, and keeps what the research log was told. */
const sourcesOf = () => {
  const record = {
    seen: [],
    count: () => 1,
    note: (_id, kind, detail) => record.seen.push(`${kind}: ${detail}`),
    dropped: () => {},
    find: () => undefined,
    keep: () => undefined,
    part: () => ({ part: 1, parts: 1, text: '' }),
    list: () => [],
    log: () => '',
  };
  return record;
};

/** What a stand-in news server answers, with nothing in it. */
const empty = { ok: true, groups: [], hidden: 0, found: [], looked: 10, files: 0, subject: '', text: '', bytes: 0, dropped: 0 };

const setUp = ({ route = () => 'direct', accounts: list = () => accounts, login = async () => ({ user: 'someone', pass: 'secret' }), answer = empty } = {}) => {
  const calls = { forwarded: [], ran: [] };
  const sources = sourcesOf();
  const usenet = createUsenet({
    run: async (request) => { calls.ran.push(request); return answer; },
    route,
    accounts: list,
    defaultAccount: () => '',
    login,
    forward: async (host, port) => { calls.forwarded.push(`${host}:${port}`); return { port: 4567, close() {} }; },
    sources,
  });
  return { usenet, calls, sources };
};

const refused = async (usenet, call) => {
  try {
    const answer = await call(usenet);
    return `no error: ${answer}`;
  } catch (error) {
    return String(error?.message ?? error);
  }
};

{
  const { usenet, calls } = setUp();
  await usenet.groups('c1', 'comp', 'Work');
  check('an account is reached by its name', calls.forwarded[0] === 'news.work.example:563' && calls.ran[0].server === 'news.work.example' && calls.ran[0].user === 'someone', JSON.stringify(calls));
}

{
  const { usenet, calls } = setUp();
  await usenet.groups('c1', 'comp', 'news.provider.example');
  check('an account is reached by its server', calls.forwarded[0] === 'news.provider.example:563', JSON.stringify(calls.forwarded));
}

{
  const { usenet, calls } = setUp();
  await usenet.groups('c1', 'comp');
  check('a request that names none uses the first account', calls.forwarded[0] === 'news.provider.example:563', JSON.stringify(calls.forwarded));
}

{
  const { usenet, calls } = setUp({ route: () => 'off' });
  const said = await refused(usenet, (one) => one.groups('c1', 'comp'));
  check('without a route nothing is sent', said.includes('no route yet') && said.includes('Nothing was sent'), said);
  check('and nothing was forwarded', calls.forwarded.length === 0 && calls.ran.length === 0);
}

{
  const { usenet, calls } = setUp({ route: () => 'direct', accounts: () => [] });
  const said = await refused(usenet, (one) => one.groups('c1', 'comp'));
  check('without an account nothing is sent', said.includes('No Usenet account is set yet'), said);
  check('and nothing was forwarded', calls.forwarded.length === 0);
}

{
  const { usenet } = setUp({ accounts: () => [{ id: 'a1', label: 'Work', host: '', port: 563 }] });
  const said = await refused(usenet, (one) => one.groups('c1', 'comp', 'Work'));
  check('an account with no server is refused', said.includes('is not set yet') && said.includes('Work'), said);
}

{
  const { usenet, calls } = setUp({ login: async () => undefined });
  const said = await refused(usenet, (one) => one.groups('c1', 'comp', 'Work'));
  check('an account with no login is refused, and names it', said.includes('No login is stored') && said.includes('Work'), said);
  check('and nothing was sent', calls.ran.length === 0 && calls.forwarded.length === 0);
}

{
  let asked = '';
  const { usenet } = setUp({ login: async (service) => { asked = service; return { user: 'u', pass: 'p' }; } });
  await usenet.search('c1', { group: 'comp.lang.c', subject: 'stdin' }, undefined);
  check('a search reads the login of the account it uses', asked === 'dsh-recon-usenet', asked);
}

{
  const { usenet, sources } = setUp();
  await usenet.search('c1', { group: 'comp.lang.c', subject: 'stdin', account: 'Work' });
  const noted = sources.seen.join(' | ');
  check('the research log says which server was used', noted.includes('news.work.example'), noted);
}

console.log(fails === 0 ? `ALL OK (${ran})` : `${fails} of ${ran} FAILED`);
process.exitCode = fails === 0 ? 0 : 1;
