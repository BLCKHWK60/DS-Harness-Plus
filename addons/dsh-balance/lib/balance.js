/**
 * Reading a DeepSeek balance, from the two places it can come from: the account you are signed in
 * to in the app, and a DeepSeek API key. Kept apart from the plugin so it can be tested without
 * the app or the network.
 */

/** Where a key's balance is asked for, and the name the app keeps a DeepSeek key under. */
export const BALANCE_URL = 'https://api.deepseek.com/user/balance';
export const KEY_NAME = 'DEEPSEEK_API_KEY';
export const TIMEOUT_MS = 15000;
/** How long an answer is reused before the service is asked again. */
export const KEEP_MS = 60000;

const SIGNS = { USD: '$', CNY: '¥' };

/**
 * An amount as text.
 * @param {number} total - the amount.
 * @param {string} currency - USD, CNY or another code.
 * @returns {string} for example "$12.34" or "12.34 EUR".
 */
export function money(total, currency) {
  const amount = (Number.isFinite(total) ? total : 0).toFixed(2);
  const sign = SIGNS[String(currency).toUpperCase()];
  return sign ? `${sign}${amount}` : `${amount} ${String(currency).toUpperCase().slice(0, 6)}`;
}

/** Amounts per currency, added up; anything that is not a number is left out. */
function add(into, currency, amount) {
  const code = String(currency ?? '').toUpperCase().slice(0, 6);
  const value = Number(amount);
  if (!code || !Number.isFinite(value)) return;
  into.set(code, (into.get(code) ?? 0) + value);
}

const listOf = (map) => [...map].map(([currency, total]) => ({ currency, total: Math.round(total * 100) / 100, text: money(total, currency) }));

/**
 * The balances in a key's answer (`GET /user/balance`).
 * @param {unknown} raw - the parsed answer.
 * @returns {{currency: string, total: number, text: string}[]} one entry per currency.
 */
export function keyWallets(raw) {
  const map = new Map();
  for (const item of Array.isArray(raw?.balance_infos) ? raw.balance_infos : []) add(map, item?.currency, item?.total_balance);
  return listOf(map);
}

/**
 * The balances of a signed-in account: paid and bonus wallets added per currency.
 * @param {unknown} result - what the app's account service returned.
 * @returns {{currency: string, total: number, text: string}[]} one entry per currency.
 */
export function accountWallets(result) {
  const map = new Map();
  for (const wallet of [...(Array.isArray(result?.value) ? result.value : []), ...(Array.isArray(result?.bonusWallets) ? result.bonusWallets : [])]) add(map, wallet?.currency, wallet?.balance);
  return listOf(map);
}

/**
 * The balance to show first: the first one with money in it, else the first.
 * @param {{total: number}[]} wallets - balances.
 * @returns {object | undefined} the one to show.
 */
export const mainWallet = (wallets) => wallets.find((wallet) => wallet.total > 0) ?? wallets[0];

/** The network; replaceable by tests. */
export const hooks = {
  /**
   * Ask DeepSeek for a key's balance.
   * @param {string} key - the API key.
   * @returns {Promise<{status: number, body: string}>} the answer.
   */
  async fetchKey(key) {
    const response = await fetch(BALANCE_URL, { headers: { authorization: `Bearer ${key}`, accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
    return { status: response.status, body: (await response.text()).slice(0, 20000) };
  },
};

/**
 * A key's balance.
 * @param {string} key - the API key.
 * @returns {Promise<{id: string, label: string, wallets: object[], problem: string}>} the balance, or why there is none.
 */
export async function readKey(key) {
  const source = { id: 'key', label: 'DeepSeek API key', wallets: [], problem: '' };
  try {
    const answer = await hooks.fetchKey(key);
    if (answer.status === 401 || answer.status === 403) source.problem = 'DeepSeek refused the API key.';
    else if (answer.status !== 200) source.problem = `DeepSeek answered with error ${answer.status}.`;
    else {
      source.wallets = keyWallets(JSON.parse(answer.body));
      if (source.wallets.length === 0) source.problem = 'DeepSeek sent no balance.';
    }
  } catch (error) {
    // Never the key: only what went wrong.
    source.problem = error?.name === 'TimeoutError' ? 'DeepSeek did not answer in time.' : error instanceof SyntaxError ? 'DeepSeek sent something that is not a balance.' : 'DeepSeek could not be reached.';
  }
  return source;
}

/**
 * The signed-in account's balance.
 * @param {object} service - the app's account service.
 * @param {object} client - version, locale and time zone offset, as the service asks.
 * @returns {Promise<object | undefined>} the balance or why there is none; undefined when not signed in.
 */
export async function readAccount(service, client) {
  if ((await service.getState())?.status !== 'credential-stored') return undefined;
  const source = { id: 'account', label: 'DeepSeek account', wallets: [], problem: '' };
  try {
    const result = await service.getBalance(client);
    if (result === null) return undefined;
    if (result?.status !== 'ready') source.problem = 'The account\'s balance could not be read.';
    else {
      source.wallets = accountWallets(result);
      if (source.wallets.length === 0) source.problem = 'The account has no balance to show.';
    }
  } catch {
    source.problem = 'The account\'s balance could not be read.';
  }
  return source;
}

/**
 * Everything the sidebar shows.
 * @param {object[]} sources - from `readAccount` and `readKey`, account first.
 * @param {number} at - when it was read.
 * @returns {{at: number, text: string, problem: string, sources: object[]}} the view.
 */
export function viewOf(sources, at) {
  const shown = sources.find((source) => source.wallets.length > 0);
  return {
    at,
    text: shown ? mainWallet(shown.wallets).text : '',
    from: shown ? shown.label : '',
    problem: shown ? '' : sources[0]?.problem ?? 'Sign in to your DeepSeek account, or add a DeepSeek API key in Settings → Models.',
    sources: sources.map(({ id, label, wallets, problem }) => ({ id, label, problem, wallets: wallets.map(({ currency, total, text }) => ({ currency, total, text })) })),
  };
}
