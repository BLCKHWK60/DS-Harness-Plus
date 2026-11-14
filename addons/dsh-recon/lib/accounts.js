/**
 * The Usenet accounts. Recon may have more than one: each is a news server with its own login in
 * the macOS Keychain. This module is the one place that says which account is which, so the
 * settings page, the tools and the Keychain all agree on it.
 */
import { SERVICE } from './keychain.js';

/**
 * The id of the account that existed before there were several. Its login stays under the first
 * Keychain name, so a login the user stored for it goes on working.
 */
export const LEGACY_ID = 'default';
/** More than this many accounts is a mistake, not a use. */
export const MAX_ACCOUNTS = 8;

const ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
const NAME = 40;
const HOST = 253;

/**
 * @param {unknown} host - a news server's name.
 * @returns {boolean} whether it looks like one: labels of letters, digits and inner dashes.
 */
export function validHost(host) {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i.test(String(host ?? ''));
}

/**
 * @param {unknown} id - an account's id.
 * @returns {string} the Keychain item that holds that account's login and nothing else.
 */
export function serviceOf(id) {
  const key = String(id ?? '');
  return key === LEGACY_ID ? SERVICE : `${SERVICE}-${key}`;
}

/**
 * @param {unknown} id - an account's id.
 * @returns {string} what the user types in the Terminal to store that account's login. The password
 *   is asked for there, hidden.
 */
export function storeCommandFor(id) {
  return `security add-generic-password -U -s ${serviceOf(id)} -a YOUR_USERNAME -w`;
}

/**
 * @param {unknown} id - an account's id.
 * @returns {string} what removes that account's login again.
 */
export function removeCommandFor(id) {
  return `security delete-generic-password -s ${serviceOf(id)}`;
}

/** @returns {number} a port, or the usual one for encrypted news when the value is not one. */
function portOf(value) {
  const port = Math.trunc(Number(value));
  return Number.isFinite(port) && port >= 1 && port <= 65535 ? port : 563;
}

/** @returns {string} an id the Keychain item can carry, made from whatever was saved. */
function idOf(value, index) {
  const given = String(value ?? '').trim().toLowerCase();
  if (ID.test(given)) return given;
  const made = given.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28);
  return made || `account-${index + 1}`;
}

/**
 * The accounts to work with: the saved list, or the one server saved before there were several.
 * @param {unknown} raw - the saved list, as the configuration holds it.
 * @param {{host?: unknown, port?: unknown}} [legacy] - the one server of older versions.
 * @returns {{id: string, label: string, host: string, port: number}[]} the accounts, first one first.
 */
export function readAccounts(raw, legacy = {}) {
  const list = Array.isArray(raw) ? raw : [];
  const used = new Set();
  const accounts = [];
  for (const [index, entry] of list.slice(0, MAX_ACCOUNTS).entries()) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const base = idOf(entry.id, index);
    let id = base;
    let n = 2;
    while (used.has(id)) id = `${base.slice(0, 28)}-${n++}`;
    used.add(id);
    accounts.push({
      id,
      label: String(entry.label ?? '').trim().slice(0, NAME),
      host: String(entry.host ?? '').trim().toLowerCase().slice(0, HOST),
      port: portOf(entry.port),
    });
  }
  if (accounts.length === 0) {
    const host = String(legacy?.host ?? '').trim().toLowerCase().slice(0, HOST);
    if (host) accounts.push({ id: LEGACY_ID, label: '', host, port: portOf(legacy?.port) });
  }
  return accounts;
}

/**
 * @param {object} account - one account.
 * @returns {string} what to call it when talking about it: its name, else its server.
 */
export function nameOf(account) {
  return account?.label || account?.host || 'no server yet';
}

/**
 * The account a request names, or the default one when it names none.
 * @param {object[]} accounts - the accounts, as readAccounts gives them.
 * @param {unknown} [want] - an account's id, its name, or its server.
 * @param {unknown} [preferredId] - the id the user set as the default account.
 * @returns {{account?: object, why?: string}} the account, or why there is none to use.
 */
export function pickAccount(accounts, want, preferredId) {
  const list = Array.isArray(accounts) ? accounts : [];
  if (list.length === 0) return { why: 'No Usenet account is set yet. The user adds one in Settings → Recon → Usenet. Nothing was sent.' };
  const asked = String(want ?? '').trim().toLowerCase();
  if (!asked) {
    const preferred = String(preferredId ?? '').trim().toLowerCase();
    const chosen = (preferred && list.find((one) => one.id.toLowerCase() === preferred)) || list[0];
    return { account: chosen };
  }
  const exact = list.find((one) => one.id.toLowerCase() === asked || one.label.toLowerCase() === asked || (one.host && one.host === asked));
  if (exact) return { account: exact };
  const known = list.map((one) => `${nameOf(one)} (${one.host || 'no server yet'})`).join(', ');
  return { why: `There is no Usenet account called "${asked.slice(0, 60)}". The accounts are: ${known}. Nothing was sent.` };
}
