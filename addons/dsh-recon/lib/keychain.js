/**
 * The Usenet login, kept in the macOS Keychain and nowhere else. The user puts it there with one
 * command in the Terminal; Recon only reads it, at the moment a connection is opened, and hands it
 * to the locked process that signs in. It is never written to a file, a setting, a log or the
 * conversation, and no tool or command shows it.
 */
import { execFile } from 'node:child_process';

/** The name the login is kept under in the Keychain. */
export const SERVICE = 'dsh-recon-usenet';
const SECURITY = '/usr/bin/security';

const run = (args) =>
  new Promise((resolve) => {
    execFile(SECURITY, args, { timeout: 15_000, env: { PATH: '/usr/bin:/bin', LANG: 'C' }, maxBuffer: 200_000 }, (error, stdout) => resolve({ ok: !error, out: String(stdout ?? '') }));
  });

/**
 * @param {string} [service] - the Keychain item's name.
 * @returns {Promise<string>} the account name of the stored login, '' when there is none. Not the password.
 */
export async function loginName(service = SERVICE) {
  const found = await run(['find-generic-password', '-s', service]);
  if (!found.ok) return '';
  return /"acct"<blob>="((?:[^"\\]|\\.)*)"/.exec(found.out)?.[1] ?? '';
}

/**
 * @param {string} [service] - the Keychain item's name.
 * @returns {Promise<{user: string, pass: string} | undefined>} the login, for the connection only.
 */
export async function login(service = SERVICE) {
  const user = await loginName(service);
  if (!user) return undefined;
  const found = await run(['find-generic-password', '-s', service, '-a', user, '-w']);
  if (!found.ok) return undefined;
  const pass = found.out.replace(/\r?\n$/, '');
  return pass ? { user, pass } : undefined;
}

/** What the user types in the Terminal to store the login. The password is asked for there, hidden. */
export const STORE_COMMAND = `security add-generic-password -U -s ${SERVICE} -a YOUR_USERNAME -w`;
/** What removes it again. */
export const REMOVE_COMMAND = `security delete-generic-password -s ${SERVICE}`;
