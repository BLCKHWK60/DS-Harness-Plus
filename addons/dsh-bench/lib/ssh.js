/**
 * Signing in to the owner's own network devices over SSH (plan B6 and B8), the way he picks per device
 * on Settings → Bench:
 * - a key: Bench makes one (`ssh-keygen -t ed25519`) in the Bench folder's `network/` part, readable
 *   only by the user; he adds its public half to the device once;
 * - a password: he types it on Settings → Bench; it goes straight into the macOS Keychain (service
 *   `DeepSeekHarnessBench`, account = the device's folder name) through `security -i`, so it is never
 *   in an argument list. ssh gets it from a fixed helper script that reads the Keychain itself.
 * The password never reaches a card, a logbook, a message, a model or a command line.
 * A device's host key is trusted only after the owner's yes on its fingerprint, and kept in Bench's own
 * known_hosts; ssh then refuses any other key. Every remote command is a fixed string Bench builds.
 */
import { chmodSync, closeSync, constants as fsConstants, existsSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { join } from 'node:path';

export const SSH = '/usr/bin/ssh';
export const KEYGEN = '/usr/bin/ssh-keygen';
export const KEYSCAN = '/usr/bin/ssh-keyscan';
export const SECURITY = '/usr/bin/security';
/** The Keychain service (no spaces, so nothing needs quoting in `security -i`). */
export const KEYCHAIN_SERVICE = 'DeepSeekHarnessBench';
export const ACCOUNT = /^[a-z0-9][a-z0-9-]{0,79}$/;
export const USER = /^[A-Za-z0-9_][A-Za-z0-9 ._@-]{0,63}$/;
export const PASSWORD_MAX = 256;

/** Characters ssh expands in file names (%h, ${HOME}) or that end a quoted value: refused in the Bench folder's path. */
export const PATH_REFUSED = /[%$"\n\r\0]/;

/** Bench's network files, in the Bench folder's `network/` part. */
export function networkFiles(folder) {
  if (PATH_REFUSED.test(String(folder))) throw new Error('The Bench folder\'s path has a %, $ or " in it, which ssh would read as part of a command. Pick a folder without them on Settings → Bench to use the network door.');
  return { key: join(folder, 'id_ed25519'), pub: join(folder, 'id_ed25519.pub'), knownHosts: join(folder, 'known_hosts'), askpass: join(folder, 'askpass.sh') };
}

/** The helper ssh runs to get a saved password: it reads the Keychain itself, for one checked account. */
export const ASKPASS = `#!/bin/sh
# DeepSeek Harness Bench: gives ssh the password the user saved in the Keychain for one device. Nothing else.
case "$BENCH_KEYCHAIN_ACCOUNT" in ''|*[!a-z0-9-]*) exit 1;; esac
exec /usr/bin/security find-generic-password -s '${KEYCHAIN_SERVICE}' -a "$BENCH_KEYCHAIN_ACCOUNT" -w
`;

/** Write the helper once (and again if it is not the fixed text), readable and runnable only by the user. */
export function writeAskpass(path) {
  if (existsSync(path) && readFileSync(path, 'utf8') === ASKPASS) return path;
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, ASKPASS, { mode: 0o700, flag: 'wx' });
  renameSync(temp, path);
  chmodSync(path, 0o700);
  return path;
}

/**
 * Bench's key: made once, never replaced.
 * @returns {Promise<string>} its public half.
 */
export async function ensureKey({ run, files }) {
  if (!existsSync(files.key)) {
    const made = await run(KEYGEN, ['-q', '-t', 'ed25519', '-N', '', '-C', 'DeepSeek Harness Bench', '-f', files.key], { timeoutMs: 20_000 });
    if (made.code !== 0) throw new Error(`ssh-keygen could not make Bench's key (${String(made.stderr).trim().slice(0, 160)})`);
  }
  chmodSync(files.key, 0o600);
  return readFileSync(files.pub, 'utf8').trim();
}

/** @returns {string} the text `security -i` reads: the password as hexadecimal, never quoted, never an argument. */
export function keychainInput(account, password) {
  if (!ACCOUNT.test(account)) throw new Error('not a device folder name');
  const text = String(password ?? '');
  if (!text || text.length > PASSWORD_MAX || /[\0\n\r]/.test(text)) throw new Error('Give the password as one line (at most 256 characters).');
  return `add-generic-password -U -s ${KEYCHAIN_SERVICE} -a ${account} -l ${KEYCHAIN_SERVICE}-${account} -X ${Buffer.from(text, 'utf8').toString('hex')}\n`;
}

/** Save a device's password in the Keychain; then check it is there. */
export async function savePassword({ run, account, password }) {
  await run(SECURITY, ['-i'], { input: keychainInput(account, password), timeoutMs: 20_000 });
  if (!(await hasPassword({ run, account }))) throw new Error('The Keychain did not take the password.');
}

/** Whether a device has a saved password (the password itself is not read). */
export async function hasPassword({ run, account }) {
  if (!ACCOUNT.test(account)) return false;
  return (await run(SECURITY, ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account], { timeoutMs: 10_000 })).code === 0;
}

export async function forgetPassword({ run, account }) {
  if (!ACCOUNT.test(account)) return;
  await run(SECURITY, ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', account], { timeoutMs: 10_000 });
}

/** @returns {{lines: string[], fingerprints: string[]}} the device's host keys, read without signing in. */
export async function hostKeys({ run, host, port }) {
  const scan = await run(KEYSCAN, ['-T', '8', '-p', String(port), '-t', 'ed25519,ecdsa,rsa', host], { timeoutMs: 20_000 });
  const lines = String(scan.stdout ?? '').split('\n').map((line) => line.trim()).filter((line) => /^\S+ (ssh-ed25519|ecdsa-sha2-nistp\d+|ssh-rsa) [A-Za-z0-9+/=]+$/.test(line));
  if (lines.length === 0) throw new Error(`${host} did not answer on port ${port} with an SSH key. Is SSH switched on there?`);
  const printed = await run(KEYGEN, ['-l', '-E', 'sha256', '-f', '-'], { input: `${lines.join('\n')}\n`, timeoutMs: 10_000 });
  const fingerprints = [...String(printed.stdout ?? '').matchAll(/SHA256:[A-Za-z0-9+/]{43}/g)].map((found) => found[0]);
  if (fingerprints.length === 0) throw new Error('Bench could not read the device\'s key fingerprint.');
  return { lines, fingerprints };
}

/** The name a card's host keys are kept under: per card, so trusting another card never re-points this one. */
export const aliasOf = (slug) => {
  if (!ACCOUNT.test(String(slug))) throw new Error('not a device folder name');
  return `bench-${slug}`;
};

/** Keep a trusted device's host keys in Bench's own known_hosts under the card's own name (added, never through a link). */
export function trustKeys(file, lines, alias) {
  const fd = openSync(file, fsConstants.O_WRONLY | fsConstants.O_APPEND | fsConstants.O_CREAT | fsConstants.O_NOFOLLOW, 0o600);
  try {
    writeSync(fd, `${lines.map((line) => `${alias} ${line.split(' ').slice(1).join(' ')}`).join('\n')}\n`);
  } finally {
    closeSync(fd);
  }
}

/** Drop a card's lines from Bench's known_hosts (when the user unlinks it, moves it or re-trusts it). */
export function forgetKeys(file, alias) {
  if (!existsSync(file)) return;
  const kept = readFileSync(file, 'utf8').split('\n').filter((line) => line.trim() && line.split(' ')[0] !== alias);
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, kept.length ? `${kept.join('\n')}\n` : '', { mode: 0o600, flag: 'wx' });
  renameSync(temp, file);
}

/**
 * ssh's arguments: fixed options, the owner's user, address and port, and one command Bench built.
 * @param {{net: {address: string, port: number, user: string, signIn: 'key' | 'password'}, files: object, command: string}} input - the device and the command.
 */
export function sshArgs({ net, files, command, alias }) {
  if (!/^bench-[a-z0-9-]{1,80}$/.test(String(alias))) throw new Error('not a card\'s key name');
  const common = ['-T', '-F', '/dev/null', '-o', 'ConnectTimeout=10', '-o', 'StrictHostKeyChecking=yes', '-o', `HostKeyAlias=${alias}`, '-o', `UserKnownHostsFile="${files.knownHosts}"`, '-o', 'GlobalKnownHostsFile=/dev/null', '-o', 'CheckHostIP=no', '-o', 'ForwardAgent=no', '-o', 'ForwardX11=no', '-o', 'ClearAllForwardings=yes', '-o', 'PermitLocalCommand=no', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-o', 'LogLevel=ERROR'];
  const auth = net.signIn === 'password'
    ? ['-o', 'BatchMode=no', '-o', 'PreferredAuthentications=password,keyboard-interactive', '-o', 'PubkeyAuthentication=no', '-o', 'NumberOfPasswordPrompts=1']
    : ['-o', 'BatchMode=yes', '-o', 'PreferredAuthentications=publickey', '-o', 'IdentitiesOnly=yes', '-i', files.key];
  return [...common, ...auth, '-p', String(net.port), '-l', net.user, net.address, command];
}

/** The names ssh needs for a password sign-in (the account name only: the password stays in the Keychain). */
export function sshEnv({ net, account, files }) {
  return net.signIn === 'password' ? { SSH_ASKPASS: files.askpass, SSH_ASKPASS_REQUIRE: 'force', DISPLAY: 'bench:0', BENCH_KEYCHAIN_ACCOUNT: account } : {};
}

/** A word for a POSIX shell on the device, in single quotes. */
export const shq = (value) => `'${String(value).replace(/'/g, "'\\''")}'`;
