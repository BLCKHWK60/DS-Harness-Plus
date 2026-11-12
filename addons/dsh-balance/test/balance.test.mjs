import assert from 'node:assert/strict';
import test from 'node:test';
import { accountWallets, hooks, keyWallets, mainWallet, money, readAccount, readKey, viewOf } from '../lib/balance.js';

test('amounts as text', () => {
  assert.equal(money(12.345, 'USD'), '$12.35');
  assert.equal(money(0, 'cny'), '¥0.00');
  assert.equal(money(3, 'EUR'), '3.00 EUR');
  assert.equal(money(Number.NaN, 'USD'), '$0.00');
});

test('a key\'s answer and an account\'s wallets become balances per currency', () => {
  assert.deepEqual(keyWallets({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '12.50' }, { currency: 'CNY', total_balance: 'x' }] }), [{ currency: 'USD', total: 12.5, text: '$12.50' }]);
  assert.deepEqual(keyWallets(undefined), []);
  assert.deepEqual(accountWallets({ status: 'ready', value: [{ currency: 'CNY', balance: '0' }, { currency: 'USD', balance: '10.10' }], bonusWallets: [{ currency: 'USD', balance: '1.15' }] }),
    [{ currency: 'CNY', total: 0, text: '¥0.00' }, { currency: 'USD', total: 11.25, text: '$11.25' }]);
  assert.equal(mainWallet([{ total: 0, text: 'a' }, { total: 2, text: 'b' }]).text, 'b');
  assert.equal(mainWallet([{ total: 0, text: 'a' }]).text, 'a');
});

test('reading a key: a balance, a refusal, an outage, and never the key in a message', async () => {
  const real = hooks.fetchKey;
  try {
    let sent;
    hooks.fetchKey = async (key) => { sent = key; return { status: 200, body: JSON.stringify({ balance_infos: [{ currency: 'USD', total_balance: '5.00' }] }) }; };
    const ok = await readKey('sk-secret-value');
    assert.equal(sent, 'sk-secret-value');
    assert.deepEqual(ok, { id: 'key', label: 'DeepSeek API key', wallets: [{ currency: 'USD', total: 5, text: '$5.00' }], problem: '' });
    hooks.fetchKey = async () => ({ status: 401, body: '{"error":"sk-secret-value is wrong"}' });
    assert.equal((await readKey('sk-secret-value')).problem, 'DeepSeek refused the API key.');
    hooks.fetchKey = async () => ({ status: 503, body: '' });
    assert.equal((await readKey('k')).problem, 'DeepSeek answered with error 503.');
    hooks.fetchKey = async () => ({ status: 200, body: '<html>' });
    assert.equal((await readKey('k')).problem, 'DeepSeek sent something that is not a balance.');
    hooks.fetchKey = async () => { throw new Error('connect failed for sk-secret-value'); };
    const down = await readKey('sk-secret-value');
    assert.equal(down.problem, 'DeepSeek could not be reached.');
    assert.ok(!JSON.stringify(down).includes('sk-secret'));
  } finally {
    hooks.fetchKey = real;
  }
});

test('reading the account: signed out, ready, failed', async () => {
  const client = { version: '0.1.0', locale: 'en-US', timezoneOffsetSeconds: 0 };
  assert.equal(await readAccount({ getState: async () => ({ status: 'signed-out' }), getBalance: async () => { throw new Error('not asked'); } }, client), undefined);
  const ready = await readAccount({ getState: async () => ({ status: 'credential-stored' }), getBalance: async () => ({ status: 'ready', value: [{ currency: 'USD', balance: '7' }], bonusWallets: [] }) }, client);
  assert.deepEqual(ready.wallets, [{ currency: 'USD', total: 7, text: '$7.00' }]);
  const failed = await readAccount({ getState: async () => ({ status: 'credential-stored' }), getBalance: async () => ({ status: 'failed' }) }, client);
  assert.equal(failed.problem, 'The account\'s balance could not be read.');
  assert.equal(await readAccount({ getState: async () => ({ status: 'credential-stored' }), getBalance: async () => null }, client), undefined);
});

test('what the sidebar shows: the account first, the key when the account has nothing, a plain reason otherwise', () => {
  const account = { id: 'account', label: 'DeepSeek account', wallets: [{ currency: 'USD', total: 7, text: '$7.00' }], problem: '' };
  const key = { id: 'key', label: 'DeepSeek API key', wallets: [{ currency: 'USD', total: 5, text: '$5.00' }], problem: '' };
  assert.equal(viewOf([account, key], 1).text, '$7.00');
  assert.equal(viewOf([account, key], 1).from, 'DeepSeek account');
  assert.equal(viewOf([{ ...account, wallets: [], problem: 'x' }, key], 1).text, '$5.00');
  const none = viewOf([], 1);
  assert.equal(none.text, '');
  assert.match(none.problem, /Sign in to your DeepSeek account/);
  assert.equal(viewOf([{ ...key, wallets: [], problem: 'DeepSeek refused the API key.' }], 1).problem, 'DeepSeek refused the API key.');
});
