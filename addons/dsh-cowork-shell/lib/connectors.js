/**
 * "Write it for me" for connectors (review H8, CWS-2, UI-02, 18 November 2026).
 *
 * A connector is one `@deepseek-ai/dsh-mcp-client` row in the person's own settings layer, the file
 * `<app home>/profiles/<profile>/cordis.patch.yml`. Until now the person had to quit the app and paste the lines by hand.
 * This file builds the lines from plain fields, checks them with the app's OWN parser (a throwaway copy of the app's home,
 * never the real one), keeps a backup of the file, writes it in one step and says what is left to do (restart).
 *
 * Rules this file keeps:
 *  - The lines are made here from checked fields. Nothing a page sends is ever pasted into the file as it is.
 *  - A key or token is never in the file. It goes to the app's secret store; the file holds only `${credential:NAME}`.
 *  - A file that cannot be read is never written over: the person is told why, in plain words, and nothing changes.
 *  - Every check runs on copies in a throwaway folder before the real file is touched; the real file is copied to the
 *    backup folder first and replaced in one step (write a temporary file, then rename it).
 *
 * No part of this file reaches the real app home on its own: the folder, the profile and the program that runs the app's
 * check are all arguments, so the tests use throwaway ones.
 */
import { execFile } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

export const MCP_CLIENT = '@deepseek-ai/dsh-mcp-client';
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const HEADER_RE = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;
/** The largest settings file this will read and rewrite (a real one is a few kilobytes). */
export const FILE_MAX = 2_000_000;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** @returns {string} the single-quoted YAML text of a string (a quote inside is doubled). */
const quote = (value) => `'${String(value).replace(/'/g, "''")}'`;

/** @returns {string} the name a connector's key is kept under in the app's secret store (a shell-style name). */
export const secretRefOf = (name) => `DSH_CONNECTOR_${String(name).toUpperCase().replace(/[^A-Z0-9]/g, '_')}_KEY`;

/**
 * The used name a new name would clash with. Capitals do not count, and neither does "-" versus "_": both give the same key name
 * in the secret store (`my-db` and `my_db` are both `DSH_CONNECTOR_MY_DB_KEY`), so one connector would take over the other's key.
 * @param {string} name - the new name.
 * @param {string[]} used - names already taken.
 * @returns {string} the taken name it clashes with, or ''.
 */
export function clashingName(name, used) {
  const plain = (text) => String(text).toLowerCase().replace(/[-_]/g, '_');
  return (used ?? []).find((other) => plain(other) === plain(name)) ?? '';
}

/**
 * Check the fields of the form.
 * @param {object} form - `{name, kind: 'stdio'|'http', command, args (one per line), url, keyName, keyValue}`.
 * @param {{taken?: string[]}} [options] - names already used by connectors (loaded or in the file).
 * @returns {{ok: true, value: object} | {ok: false, problems: {field: string, text: string}[]}} plain-words problems, or the cleaned fields.
 */
export function checkForm(form, { taken = [] } = {}) {
  const problems = [];
  const bad = (field, text) => problems.push({ field, text });
  const input = form && typeof form === 'object' ? form : {};
  const name = String(input.name ?? '').trim();
  if (!NAME_RE.test(name)) bad('name', 'Use 1 to 32 letters, digits, - or _ for the name.');
  else {
    const clash = clashingName(name, taken);
    if (clash) bad('name', clash.toLowerCase() === name.toLowerCase() ? `There is already a connector called "${name}". Pick another name.` : `"${clash}" already exists, and "${name}" would share its key (a dash and an underscore count as the same). Pick a name that differs by more than - or _.`);
  }
  const kind = input.kind === 'http' ? 'http' : 'stdio';
  const value = { name, kind, command: '', args: [], url: '', keyName: '', keyValue: '' };
  if (kind === 'http') {
    const url = String(input.url ?? '').trim();
    let parsed = null;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!url || !parsed || !/^https?:$/.test(parsed.protocol) || CONTROL.test(url) || url.includes('${')) bad('url', 'Type the whole web address, starting with https://');
    else if (parsed.protocol === 'http:' && !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(parsed.hostname)) bad('url', 'A web address must start with https://. Plain http:// is only allowed for a program on this Mac, such as http://localhost:3000.');
    else if (parsed.username || parsed.password) bad('url', 'Leave the user name and password out of the address. Put a key in the key box below instead.');
    else if (parsed.search && /(key|token|secret|password|auth)/i.test(parsed.search)) bad('url', 'The address seems to carry a key (after the ?). Take it out and use the key box below, so it is kept in the secret store and not in the file.');
    else value.url = url;
  } else {
    const command = String(input.command ?? '').trim();
    if (!command) bad('command', 'Type the program that starts the connector (for example npx).');
    else if (CONTROL.test(command) || command.length > 300 || command.includes('${')) bad('command', 'The program must be one line of plain text, up to 300 characters, with no ${ in it.');
    else value.command = command;
    const lines = String(input.args ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length > 40 || lines.some((line) => line.length > 500 || CONTROL.test(line) || line.includes('${'))) bad('args', 'Put one argument on each line (at most 40 lines of 500 characters, no ${ in them).');
    else value.args = lines;
  }
  const keyName = String(input.keyName ?? '').trim();
  const keyValue = String(input.keyValue ?? '');
  if (keyName) {
    if (!(kind === 'http' ? HEADER_RE : ENV_RE).test(keyName)) {
      bad('keyName', kind === 'http' ? 'The header name uses letters, digits and - only (usually Authorization).' : 'The variable name uses letters, digits and _ only, and does not start with a digit (for example GITHUB_TOKEN).');
    } else value.keyName = keyName;
    if (keyValue && (CONTROL.test(keyValue) || keyValue.length > 8000)) bad('keyValue', 'The key must be one line of text, up to 8000 characters.');
    else value.keyValue = keyValue;
  } else if (keyValue) bad('keyName', 'Say what the connector calls this key, or clear the key box.');
  return problems.length ? { ok: false, problems } : { ok: true, value };
}

/**
 * The exact lines this adds to the settings file. Only a reference to the key is in them, never the key.
 * @param {object} value - from checkForm.
 * @returns {string} YAML text, ending with a new line.
 */
export function rowText(value) {
  const ref = secretRefOf(value.name);
  const lines = ['- insert:', `    - id: mcp-${value.name}`, `      name: ${quote(MCP_CLIENT)}`, '      config:', `        serverName: ${value.name}`];
  if (value.kind === 'http') {
    lines.push('        transport: streamable-http', `        url: ${quote(value.url)}`);
    if (value.keyName) {
      lines.push('        expandTemplates: true', '        headers:', `          ${value.keyName}: ${quote(`${/^authorization$/i.test(value.keyName) ? 'Bearer ' : ''}\${credential:${ref}}`)}`);
    }
  } else {
    lines.push('        transport: stdio', `        command: ${quote(value.command)}`);
    if (value.args.length) lines.push(`        args: [${value.args.map(quote).join(', ')}]`);
    if (value.keyName) lines.push('        expandTemplates: true', '        env:', `          ${value.keyName}: ${quote(`\${credential:${ref}}`)}`);
  }
  return `${lines.join('\n')}\n`;
}

/** The line put above the new lines in the file, so a person reading it knows where they came from. */
export const noteLine = (name, now = new Date()) => `# Added by Cowork Shell "Write it for me" on ${now.toISOString().slice(0, 10)}: connector ${name}\n`;

/**
 * The file's text with the new lines at the end. The existing text is kept exactly as it was.
 * @param {string} existing - the file's text ('' when there is no file yet).
 * @param {string} row - from rowText.
 * @param {string} note - from noteLine.
 */
export function appendRow(existing, row, note) {
  const base = existing === '' ? '' : existing.endsWith('\n') ? existing : `${existing}\n`;
  return `${base}${base && !base.endsWith('\n\n') ? '\n' : ''}${note}${row}`;
}

/**
 * Names the settings file already uses for connectors (found by reading the lines, no parser needed): `mcp-<name>` ids and
 * `serverName:` values. Used to refuse a name that is taken, and to show connectors that are written but not started yet.
 * @param {string} text - the file's text.
 * @returns {string[]} the server names.
 */
export function namesInFile(text) {
  const names = new Set();
  for (const line of String(text).split('\n')) {
    if (/^\s*#/.test(line)) continue;
    const id = line.match(/^\s*(?:-\s+)?id:\s*['"]?mcp-([A-Za-z0-9_-]{1,32})['"]?\s*(?:#.*)?$/);
    if (id) names.add(id[1]);
    const server = line.match(/^\s*serverName:\s*['"]?([A-Za-z0-9_-]{1,32})['"]?\s*(?:#.*)?$/);
    if (server) names.add(server[1]);
  }
  return [...names];
}

/**
 * Where the running app keeps the person's own settings layer.
 * @param {{argv?: string[], env?: object, home: string}} source - the process's arguments and environment, and the app home.
 * @returns {{dir: string, profile: string, file: string}} the profile folder, its name and the settings file.
 */
export function profileOf({ argv = process.argv, env = process.env, home }) {
  for (const arg of argv) {
    const hit = typeof arg === 'string' ? arg.match(/(?:^|\/)profiles\/([A-Za-z0-9._-]+)\/?$/) : null;
    if (hit) {
      const dir = arg.replace(/\/$/, '');
      return { dir, profile: hit[1], file: join(dir, 'cordis.patch.yml') };
    }
  }
  const at = argv.indexOf('--profile');
  const named = at >= 0 && typeof argv[at + 1] === 'string' ? argv[at + 1] : String(env.DSH_PROFILE ?? '');
  const profile = /^[A-Za-z0-9._-]{1,64}$/.test(named) ? named : 'desktop';
  const dir = join(home, 'profiles', profile);
  return { dir, profile, file: join(dir, 'cordis.patch.yml') };
}

/** The program that runs the app's own commands (`dsh --dump-config`), next to the running app, or '' when it is not there. */
export function dshProgram({ execPath = process.execPath, resourcesPath = process.resourcesPath } = {}) {
  const candidates = [
    resourcesPath ? join(resourcesPath, 'runtime', 'cli', 'bin', 'dsh') : '',
    join(dirname(execPath), '..', 'Resources', 'runtime', 'cli', 'bin', 'dsh'),
  ].filter(Boolean);
  return candidates.find((path) => existsSync(path)) ?? '';
}

/**
 * Turn what the app says about a file it cannot read into one plain sentence.
 * @param {string} raw - the app's message, for example `... YAMLException: unexpected end of the stream (3:1)`.
 * @returns {{text: string, line: number | null}} the sentence, and the line when the message names one.
 */
export function plainParseError(raw) {
  const message = String(raw ?? '');
  const reason = (message.match(/YAMLException:\s*([^\n(]+?)\s*(?:\((\d+):(\d+)\))?\s*(?:\n|$)/) ?? message.match(/failed to parse[^:]*:\s*([^\n]+)/) ?? [])[1];
  const line = Number((message.match(/\((\d+):(\d+)\)/) ?? [])[1]) || null;
  const why = reason ? reason.replace(/\s+/g, ' ').trim() : 'the text is not written the way the app reads it';
  return { text: `${line ? `Line ${line} cannot be read: ` : 'It cannot be read: '}${why}.`, line };
}

/**
 * Run the app's own configuration dump on a text, in a throwaway app home (never the real one).
 * The dump reads the text as the app's settings layer, so it proves the text parses and merges. It does not start any
 * connector.
 * @param {string} text - the settings file's text to try.
 * @param {{dsh: string, run?: Function, root?: string}} options - `dsh`: the program; `run`: a stand-in for tests, called
 *   `(program, args, env) => Promise<{code, stdout, stderr}>`; `root`: where the throwaway folder is made.
 * @returns {Promise<{ok: boolean, stdout: string, error: string}>} the dump's text, or why it failed.
 */
export async function dumpWith(text, { dsh, run = runProgram, root = tmpdir() }) {
  const home = mkdtempSync(join(root, 'dsh-connector-check-'));
  try {
    const env = {
      PATH: '/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin',
      HOME: home,
      LANG: 'C',
      DSH_HOME: home,
      // Recon empties its room whenever it loads; this app home loads nothing, but the room is pointed away from the real one anyway.
      DSH_RECON_ROOM: join(root, 'dsh-recon-connector-check'),
    };
    // The first run makes the throwaway home's profile from the app's own template; then the text goes in as its settings layer.
    const first = await run(dsh, ['--profile', 'web', '--dump-config'], env);
    if (first.code !== 0) return { ok: false, stdout: '', error: `the app's own check could not start (${String(first.stderr).split('\n').find((line) => line.trim()) ?? 'no message'})` };
    writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), text);
    const dump = await run(dsh, ['--profile', 'web', '--dump-config'], env);
    return dump.code === 0 ? { ok: true, stdout: String(dump.stdout), error: '' } : { ok: false, stdout: '', error: String(dump.stderr) };
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** Runs a program and collects what it prints. */
function runProgram(program, args, env) {
  return new Promise((resolve) => {
    execFile(program, args, { env, timeout: 60_000, maxBuffer: 40_000_000, cwd: env.HOME }, (error, stdout, stderr) => {
      resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout ?? ''), stderr: String(stderr ?? error?.message ?? '') });
    });
  });
}

/**
 * Did the dump of the new text contain the new connector, as written?
 * @returns {boolean} true when a section of the dump names the new id and its server name after the settings-file marker.
 */
export function dumpHasRow(stdout, name) {
  const at = String(stdout).lastIndexOf('# == ');
  if (at < 0) return false;
  const section = String(stdout).slice(at);
  return new RegExp(`^- id: mcp-${name}$`, 'm').test(section) && new RegExp(`^\\s+serverName: ${name}$`, 'm').test(section);
}

/**
 * Add a connector to the settings file, safely. Nothing is changed unless every check passes.
 * @param {object} args
 * @param {object} args.value - checked fields (from checkForm).
 * @param {string} args.file - the person's settings file.
 * @param {string} args.backupDir - where the copy of the file goes (made if missing).
 * @param {string} args.dsh - the program for the app's own check ('' = cannot check, so nothing is written).
 * @param {Function} [args.run] - test stand-in for the program.
 * @param {string} [args.tmp] - where throwaway folders are made.
 * @param {string} [args.expect] - the exact lines the person was shown; refused when they differ.
 * @param {Date} [args.now] - the clock (tests).
 * @param {(ref: string, keyValue: string) => Promise<void>} [args.keepKey] - keeps the key in the app's secret store.
 * @param {(ref: string) => Promise<boolean>} [args.hasKey] - whether a key is already kept under the reference.
 * @param {(ref: string) => Promise<void>} [args.forgetKey] - takes a key back out of the secret store (when the write fails after it was kept).
 * @returns {Promise<{ok: true, file: string, backup: string, row: string, checks: object[]} | {ok: false, stage: string, text: string, details?: string, checks: object[]}>}
 */
export async function addConnector({ value, file, backupDir, dsh, run, tmp, expect, now = new Date(), keepKey, hasKey, forgetKey }) {
  const checks = [];
  const refuse = (stage, text, details) => ({ ok: false, stage, text, ...(details ? { details } : {}), checks });
  const row = rowText(value);
  if (expect !== undefined && expect !== row) return refuse('changed', 'The lines changed since you looked at them. Look at them again, then press the button.');
  // 1. Read the file as it is.
  let existing = '';
  let had = false;
  try {
    if (existsSync(file)) {
      had = true;
      if (statSync(file).size > FILE_MAX) return refuse('too-big', 'Your settings file is much bigger than usual, so it was left alone. Nothing was changed.');
      existing = readFileSync(file, 'utf8');
    }
  } catch (error) {
    return refuse('unreadable', 'Your settings file could not be opened, so it was left alone. Nothing was changed.', String(error?.message ?? error));
  }
  const clash = clashingName(value.name, namesInFile(existing));
  if (clash) return refuse('taken', clash.toLowerCase() === value.name.toLowerCase() ? `Your settings file already has a connector called "${value.name}". Nothing was changed.` : `Your settings file already has a connector called "${clash}", and "${value.name}" would share its key (a dash and an underscore count as the same). Pick a name that differs by more than - or _. Nothing was changed.`);
  if (!dsh) return refuse('no-check', 'The app\'s own check program was not found here, so the file was not written (it is never changed without a check). Use the lines above and paste them by hand, as the steps say.');
  // 2. Does the app read the file as it is now? If not, the new lines would not fix it: refuse and say where.
  const before = await dumpWith(existing, { dsh, run, root: tmp });
  if (!before.ok) {
    const plain = plainParseError(before.error);
    checks.push({ name: 'Your settings file can be read', ok: false });
    return refuse('existing-unreadable', `Your settings file already has a problem, so nothing was added and the file was not touched. ${plain.text} Fix it, or put back a copy from the backups folder, and try again.`, before.error);
  }
  checks.push({ name: 'Your settings file can be read', ok: true });
  // 3. The new text, tried in the same way: it must be read, and the new connector must be in what the app makes of it.
  const next = appendRow(existing, row, noteLine(value.name, now));
  const after = await dumpWith(next, { dsh, run, root: tmp });
  if (!after.ok) {
    checks.push({ name: 'The new lines can be read', ok: false });
    return refuse('new-unreadable', `The new lines would break the settings file, so nothing was written. ${plainParseError(after.error).text}`, after.error);
  }
  checks.push({ name: 'The new lines can be read', ok: true });
  if (!dumpHasRow(after.stdout, value.name)) {
    checks.push({ name: 'The app loads the new connector', ok: false });
    return refuse('not-loaded', 'The app read the file but did not show the new connector in it, so nothing was written.', after.stdout.slice(-600));
  }
  checks.push({ name: 'The app loads the new connector', ok: true });
  let stored = false;
  // 4. The key goes to the secret store (never to the file). A key that is already kept stays when no new one was typed.
  if (value.keyName) {
    const ref = secretRefOf(value.name);
    try {
      if (value.keyValue) {
        if (!keepKey) return refuse('no-store', 'The app\'s secret store is not available here, so the key cannot be kept safely and nothing was written.');
        await keepKey(ref, value.keyValue);
        stored = true;
      } else if (!(hasKey && (await hasKey(ref)))) {
        return refuse('no-key', 'Type the key. It is kept in the app\'s secret store, never in the file.');
      }
      checks.push({ name: 'The key is kept in the secret store', ok: true });
    } catch (error) {
      return refuse('store-failed', 'The app\'s secret store did not take the key, so nothing was written.', String(error?.message ?? error).replace(value.keyValue, '…'));
    }
  }
  // 5. Back up, then write in one step.
  let backup = '';
  try {
    if (had) {
      mkdirSync(backupDir, { recursive: true });
      const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
      backup = join(backupDir, `${stamp}-${basename(dirname(file))}-${basename(file)}`);
      copyFileSync(file, backup);
      checks.push({ name: 'A copy of the file was kept', ok: true });
    }
    mkdirSync(dirname(file), { recursive: true });
    const temporary = join(dirname(file), `.${basename(file)}.tmp-${process.pid}`);
    writeFileSync(temporary, next);
    renameSync(temporary, file);
  } catch (error) {
    if (stored) await Promise.resolve(forgetKey?.(secretRefOf(value.name))).catch(() => {});
    return refuse('write-failed', 'The file could not be written, so it was not changed.', String(error?.message ?? error));
  }
  // 6. Read it back: what is on disk must be what was checked.
  if (readFileSync(file, 'utf8') !== next) {
    if (backup) copyFileSync(backup, file);
    else rmSync(file, { force: true });
    if (stored) await Promise.resolve(forgetKey?.(secretRefOf(value.name))).catch(() => {});
    return refuse('verify-failed', 'The file did not read back as written, so the earlier copy was put back.');
  }
  checks.push({ name: 'The file was written and read back', ok: true });
  return { ok: true, file, backup, row, checks };
}
