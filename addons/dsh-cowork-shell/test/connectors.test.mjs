// "Write it for me" for connectors: the fields, the exact lines, the checks and the safe write. Every file here is a throwaway
// file in a temporary folder; the real app home is never touched. One test runs the app's OWN configuration dump (the real
// check) in a throwaway home when the app is installed here, and is skipped when it is not.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { addConnector, appendRow, checkForm, clashingName, dshProgram, dumpHasRow, namesInFile, noteLine, plainParseError, profileOf, rowText, secretRefOf } from '../lib/connectors.js';

const scratch = () => mkdtempSync(join(tmpdir(), 'cws-connectors-test-'));
const stdio = (extra = {}) => ({ name: 'notes', kind: 'stdio', command: 'npx', args: '-y\nnotes-server', ...extra });
const valueOf = (form, options) => {
  const checked = checkForm(form, options);
  assert.equal(checked.ok, true, JSON.stringify(checked.problems));
  return checked.value;
};

/** A stand-in for the app's own dump: reads the text as the app would, and prints a dump that names the added row. */
function standIn({ broken = new Set(), ignoreRow = false } = {}) {
  const seen = [];
  return {
    seen,
    run: async (_program, args, env) => {
      const { readFileSync: read, existsSync: exists, mkdirSync: make } = await import('node:fs');
      const dir = join(env.DSH_HOME, 'profiles', 'web');
      if (!exists(dir)) { make(dir, { recursive: true }); return { code: 0, stdout: '', stderr: '' }; }
      const text = read(join(dir, 'cordis.patch.yml'), 'utf8');
      seen.push({ text, args, home: env.DSH_HOME, room: env.DSH_RECON_ROOM });
      for (const word of broken) if (text.includes(word)) return { code: 1, stdout: '', stderr: `Error: dsh: failed to parse overlay x/cordis.patch.yml: YAMLException: bad indentation of a mapping entry (7:3)\n\n 5 | ...` };
      const rows = [...text.matchAll(/^\s+- id: (mcp-[A-Za-z0-9_-]+)$/gm)].map((m) => m[1]);
      const names = [...text.matchAll(/^\s+serverName: ([A-Za-z0-9_-]+)$/gm)].map((m) => m[1]);
      const dump = '# == base\n- id: base\n# == x/cordis.patch.yml\n' + (ignoreRow ? '' : rows.map((id, i) => `- id: ${id}\n  config:\n    serverName: ${names[i]}\n`).join(''));
      return { code: 0, stdout: dump, stderr: '' };
    },
  };
}

test('the form: plain problems for a bad name, a bad address and a bad key, and the cleaned fields when it is right', () => {
  const problems = (form, options) => checkForm(form, options).problems?.map((p) => `${p.field}: ${p.text}`) ?? [];
  assert.match(problems(stdio({ name: 'has space' })).join('\n'), /name: Use 1 to 32 letters/);
  assert.match(problems(stdio({ name: 'Notes' }), { taken: ['notes'] }).join('\n'), /already a connector called "Notes"/);
  assert.match(problems(stdio({ command: '' })).join('\n'), /command: Type the program/);
  assert.match(problems(stdio({ command: 'npx ${HOME}' })).join('\n'), /command:/);
  assert.match(problems(stdio({ args: 'a\n${credential:X}' })).join('\n'), /args:/);
  assert.match(problems({ name: 'web', kind: 'http', url: 'ftp://x' }).join('\n'), /url: Type the whole web address/);
  assert.match(problems({ name: 'web', kind: 'http', url: 'http://example.com/mcp' }).join('\n'), /must start with https/);
  assert.match(problems({ name: 'web', kind: 'http', url: 'https://user:pw@example.com/mcp' }).join('\n'), /Leave the user name and password out/);
  assert.match(problems({ name: 'web', kind: 'http', url: 'https://example.com/mcp?api_key=abc' }).join('\n'), /carry a key/);
  assert.match(problems(stdio({ keyName: '1bad' })).join('\n'), /keyName: The variable name/);
  assert.match(problems({ name: 'web', kind: 'http', url: 'https://example.com/mcp', keyName: 'Bad Header' }).join('\n'), /header name/);
  assert.match(problems(stdio({ keyValue: 'secret' })).join('\n'), /keyName: Say what the connector calls this key/);
  assert.match(problems(stdio({ keyName: 'TOKEN', keyValue: 'a\nb' })).join('\n'), /keyValue: The key must be one line/);
  assert.equal(checkForm({ name: 'local', kind: 'http', url: 'http://localhost:3000/mcp' }).ok, true, 'a program on this Mac may use http');
  const ok = valueOf(stdio({ name: ' notes ', args: ' -y \n\n notes-server ' }));
  assert.deepEqual([ok.name, ok.command, ok.args], ['notes', 'npx', ['-y', 'notes-server']]);
});

test('the exact lines: a program, a web address, a key by reference only, quotes doubled', () => {
  assert.equal(rowText(valueOf(stdio())), [
    '- insert:', '    - id: mcp-notes', "      name: '@deepseek-ai/dsh-mcp-client'", '      config:', '        serverName: notes',
    '        transport: stdio', "        command: 'npx'", "        args: ['-y', 'notes-server']", '',
  ].join('\n'));
  const key = rowText(valueOf(stdio({ keyName: 'NOTES_TOKEN', keyValue: 'sk-live-123' })));
  assert.match(key, /expandTemplates: true\n {8}env:\n {10}NOTES_TOKEN: '\$\{credential:DSH_CONNECTOR_NOTES_KEY\}'/);
  assert.doesNotMatch(key, /sk-live-123/, 'the key itself is never in the lines');
  const web = rowText(valueOf({ name: 'my-web', kind: 'http', url: 'https://example.com/mcp', keyName: 'Authorization', keyValue: 'k' }));
  assert.match(web, /transport: streamable-http\n {8}url: 'https:\/\/example.com\/mcp'/);
  assert.match(web, /headers:\n {10}Authorization: 'Bearer \$\{credential:DSH_CONNECTOR_MY_WEB_KEY\}'/);
  assert.match(rowText(valueOf({ name: 'w', kind: 'http', url: 'https://example.com/mcp', keyName: 'x-api-key', keyValue: 'k' })), /x-api-key: '\$\{credential:DSH_CONNECTOR_W_KEY\}'/, 'a header other than Authorization has no Bearer');
  assert.match(rowText(valueOf(stdio({ command: "it's", args: "a'b" }))), /command: 'it''s'[\s\S]*args: \['a''b'\]/);
  assert.equal(secretRefOf('my-web'), 'DSH_CONNECTOR_MY_WEB_KEY');
});

test('the new lines go at the end and the file is kept exactly as it was', () => {
  const note = noteLine('notes', new Date('2026-11-18T10:00:00Z'));
  assert.equal(note, '# Added by Cowork Shell "Write it for me" on 2026-11-18: connector notes\n');
  const row = rowText(valueOf(stdio()));
  const original = '# my settings\n- id: budget\n  config:\n    max: !!js "1+1"\n';
  const next = appendRow(original, row, note);
  assert.ok(next.startsWith(original), 'every old byte is still first');
  assert.equal(next.slice(original.length), `\n${note}${row}`);
  assert.equal(appendRow('', row, note), `${note}${row}`);
  assert.equal(appendRow('- id: a', row, note).startsWith('- id: a\n\n# Added'), true, 'a missing last new line is added');
});

test('names already in the file are found, comments are ignored', () => {
  const text = "# - id: mcp-old\n- insert:\n    - id: mcp-github\n      config:\n        serverName: github\n    - id: 'mcp-two'\n      config:\n        serverName: \"two\" # note\n- id: budget\n";
  assert.deepEqual(namesInFile(text).sort(), ['github', 'two']);
});

test('where the settings file is: the folder the desktop host was given, --profile, or the default', () => {
  const home = '/x/home';
  assert.deepEqual(profileOf({ argv: ['app', 'lib/index.js', '/x/home/profiles/desktop', '/r'], env: {}, home }), { dir: '/x/home/profiles/desktop', profile: 'desktop', file: '/x/home/profiles/desktop/cordis.patch.yml' });
  assert.equal(profileOf({ argv: ['cli.js', '--profile', 'web', '--port', '1'], env: {}, home }).file, '/x/home/profiles/web/cordis.patch.yml');
  assert.equal(profileOf({ argv: [], env: { DSH_PROFILE: 'work' }, home }).profile, 'work');
  assert.equal(profileOf({ argv: ['--profile', '../evil'], env: {}, home }).profile, 'desktop', 'a odd profile name is not used');
});

test('the app\'s message about a bad file becomes one plain sentence with its line', () => {
  const plain = plainParseError('Error: dsh: failed to parse overlay /a/cordis.patch.yml: YAMLException: unexpected end of the stream within a flow collection (3:1)\n\n 1 | - insert:');
  assert.equal(plain.line, 3);
  assert.equal(plain.text, 'Line 3 cannot be read: unexpected end of the stream within a flow collection.');
  assert.match(plainParseError('something else').text, /cannot be read/);
});

test('dumpHasRow only counts the settings-file part of the dump', () => {
  const dump = '# == base\n- id: mcp-notes\n  config:\n    serverName: notes\n# == x/cordis.patch.yml\n- id: other\n';
  assert.equal(dumpHasRow(dump, 'notes'), false);
  assert.equal(dumpHasRow(`${dump}- id: mcp-notes\n  config:\n    serverName: notes\n`, 'notes'), true);
});

/** One throwaway setup: a settings file, a backups folder, the stand-in program. */
function setup(text) {
  const root = scratch();
  const file = join(root, 'profiles', 'desktop', 'cordis.patch.yml');
  mkdirSync(join(root, 'profiles', 'desktop'), { recursive: true });
  if (text !== undefined) writeFileSync(file, text);
  return { root, file, backupDir: join(root, 'backups', 'connectors'), tmp: join(root, 'tmp') };
}

test('a good connector: checked, backed up, written, read back; the file keeps every old byte', async () => {
  const env = setup('# mine\n- id: budget\n  config:\n    max: !!js "1+1"\n');
  mkdirSync(env.tmp);
  const fake = standIn();
  const before = readFileSync(env.file, 'utf8');
  const result = await addConnector({ value: valueOf(stdio()), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: fake.run, tmp: env.tmp, now: new Date('2026-11-18T10:20:30Z') });
  assert.equal(result.ok, true);
  assert.deepEqual(result.checks.map((c) => c.name), ['Your settings file can be read', 'The new lines can be read', 'The app loads the new connector', 'A copy of the file was kept', 'The file was written and read back']);
  const after = readFileSync(env.file, 'utf8');
  assert.ok(after.startsWith(before));
  assert.match(after.slice(before.length), /# Added by Cowork Shell "Write it for me" on 2026-11-18: connector notes\n- insert:\n {4}- id: mcp-notes/);
  assert.equal(readFileSync(result.backup, 'utf8'), before, 'the backup is the file as it was');
  assert.match(result.backup, /20261118-102030-desktop-cordis\.patch\.yml$/);
  // Both checks ran in a throwaway home, never the real folder, with Recon's room pointed away.
  assert.ok(fake.seen.length >= 2);
  for (const run of fake.seen) {
    assert.ok(run.home.startsWith(env.tmp), 'the check home is made inside the temporary folder');
    assert.notEqual(run.home, env.root);
    assert.match(run.room, /dsh-recon-connector-check$/);
    assert.deepEqual(run.args, ['--profile', 'web', '--dump-config']);
  }
  assert.deepEqual(readdirSync(env.tmp), [], 'the throwaway homes are removed');
  rmSync(env.root, { recursive: true, force: true });
});

test('a file with a parse error is never written over, and the reason is in plain words', async () => {
  const bad = '- insert:\n    - id: [broken\n';
  const env = setup(bad);
  const fake = standIn({ broken: new Set(['[broken']) });
  const result = await addConnector({ value: valueOf(stdio()), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: fake.run, tmp: tmpdir() });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'existing-unreadable');
  assert.match(result.text, /already has a problem.*Line 7 cannot be read: bad indentation of a mapping entry\./);
  assert.match(result.text, /nothing was added and the file was not touched/);
  assert.equal(readFileSync(env.file, 'utf8'), bad, 'byte for byte the same');
  assert.equal(existsSync(env.backupDir), false, 'no backup was made for a write that did not happen');
  rmSync(env.root, { recursive: true, force: true });
});

test('new lines the app cannot read, or does not show, are not written', async () => {
  const text = '- id: budget\n';
  let env = setup(text);
  let result = await addConnector({ value: valueOf(stdio()), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn({ broken: new Set(['mcp-notes']) }).run, tmp: tmpdir() });
  assert.equal(result.stage, 'new-unreadable');
  assert.equal(readFileSync(env.file, 'utf8'), text);
  assert.deepEqual(result.checks.map((c) => [c.name, c.ok]), [['Your settings file can be read', true], ['The new lines can be read', false]]);
  env = setup(text);
  result = await addConnector({ value: valueOf(stdio()), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn({ ignoreRow: true }).run, tmp: tmpdir() });
  assert.equal(result.stage, 'not-loaded');
  assert.equal(readFileSync(env.file, 'utf8'), text);
});

test('without the app\'s own check program nothing is written; a taken name, a changed preview and a missing file are handled', async () => {
  let env = setup('- id: budget\n');
  let result = await addConnector({ value: valueOf(stdio()), file: env.file, backupDir: env.backupDir, dsh: '', run: standIn().run });
  assert.equal(result.stage, 'no-check');
  assert.equal(readFileSync(env.file, 'utf8'), '- id: budget\n');
  env = setup('- insert:\n    - id: mcp-notes\n      config:\n        serverName: notes\n');
  result = await addConnector({ value: valueOf(stdio()), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run });
  assert.equal(result.stage, 'taken');
  result = await addConnector({ value: valueOf(stdio({ name: 'other' })), expect: 'not the lines', file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run });
  assert.equal(result.stage, 'changed');
  // No file yet: it is made, and there is nothing to back up.
  env = setup(undefined);
  result = await addConnector({ value: valueOf(stdio()), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run, tmp: tmpdir() });
  assert.equal(result.ok, true);
  assert.equal(result.backup, '');
  assert.match(readFileSync(env.file, 'utf8'), /^# Added by Cowork Shell/);
});

test('a key goes to the secret store only: never into the file, the answer or an error', async () => {
  const secret = 'sk-test-SECRET-VALUE-123';
  const kept = new Map();
  const store = { keepKey: async (ref, value) => { kept.set(ref, value); }, hasKey: async (ref) => kept.has(ref), forgetKey: async (ref) => { kept.delete(ref); } };
  let env = setup('- id: budget\n');
  const form = stdio({ keyName: 'NOTES_TOKEN', keyValue: secret });
  const result = await addConnector({ value: valueOf(form), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run, tmp: tmpdir(), ...store });
  assert.equal(result.ok, true);
  assert.equal(kept.get('DSH_CONNECTOR_NOTES_KEY'), secret);
  assert.ok(result.checks.some((c) => c.name === 'The key is kept in the secret store'));
  assert.doesNotMatch(readFileSync(env.file, 'utf8'), /SECRET-VALUE/);
  assert.doesNotMatch(readFileSync(result.backup, 'utf8'), /SECRET-VALUE/);
  assert.doesNotMatch(JSON.stringify(result), /SECRET-VALUE/);
  assert.match(readFileSync(env.file, 'utf8'), /NOTES_TOKEN: '\$\{credential:DSH_CONNECTOR_NOTES_KEY\}'/);
  // Nothing typed, nothing kept: refused. Nothing typed but already kept: fine.
  env = setup('- id: budget\n');
  const empty = new Map();
  let again = await addConnector({ value: valueOf(stdio({ keyName: 'NOTES_TOKEN' })), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run, tmp: tmpdir(), keepKey: async () => {}, hasKey: async (ref) => empty.has(ref) });
  assert.equal(again.stage, 'no-key');
  assert.equal(readFileSync(env.file, 'utf8'), '- id: budget\n');
  empty.set('DSH_CONNECTOR_NOTES_KEY', 'x');
  again = await addConnector({ value: valueOf(stdio({ keyName: 'NOTES_TOKEN' })), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run, tmp: tmpdir(), keepKey: async () => { throw new Error('should not be called'); }, hasKey: async (ref) => empty.has(ref) });
  assert.equal(again.ok, true);
  // A store that fails: nothing is written and the error does not repeat the key.
  env = setup('- id: budget\n');
  const failed = await addConnector({ value: valueOf(form), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run, tmp: tmpdir(), keepKey: async (_r, value) => { throw new Error(`denied for ${value}`); }, hasKey: async () => false });
  assert.equal(failed.stage, 'store-failed');
  assert.doesNotMatch(JSON.stringify(failed), /SECRET-VALUE/);
  assert.equal(readFileSync(env.file, 'utf8'), '- id: budget\n');
});

test('a failed write puts the key back out of the store and leaves the file as it was', async () => {
  const kept = new Map();
  const env = setup('- id: budget\n');
  // The backup folder cannot be made (a file is in the way), so the write step fails after the key was kept.
  writeFileSync(join(env.root, 'backups'), 'a file, not a folder');
  const result = await addConnector({ value: valueOf(stdio({ keyName: 'NOTES_TOKEN', keyValue: 'k-1' })), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run, tmp: tmpdir(), keepKey: async (ref, value) => { kept.set(ref, value); }, hasKey: async () => false, forgetKey: async (ref) => { kept.delete(ref); } });
  assert.equal(result.stage, 'write-failed');
  assert.equal(kept.size, 0, 'the key was taken back out');
  assert.equal(readFileSync(env.file, 'utf8'), '- id: budget\n');
});

test('with the real app check: a file with !!js is accepted, a broken one is refused with its line, the real file is only changed when all is well', async (t) => {
  const dsh = dshProgram();
  if (!dsh) return t.skip('the app is not installed here');
  const env = setup('# mine\n- id: budget\n  name: "@local/dsh-budget"\n  config:\n    maxTokens: !!js "1000 * 5"\n');
  const good = await addConnector({ value: valueOf(stdio({ keyName: 'NOTES_TOKEN', keyValue: 'k' })), file: env.file, backupDir: env.backupDir, dsh, tmp: tmpdir(), keepKey: async () => {}, hasKey: async () => true });
  assert.equal(good.ok, true, JSON.stringify(good));
  assert.match(readFileSync(env.file, 'utf8'), /!!js "1000 \* 5"/, 'the old lines are kept');
  const web = await addConnector({ value: valueOf({ name: 'site', kind: 'http', url: 'https://example.com/mcp' }), file: env.file, backupDir: env.backupDir, dsh, tmp: tmpdir() });
  assert.equal(web.ok, true, JSON.stringify(web));
  // Now break the file by hand and try again.
  const broken = `${readFileSync(env.file, 'utf8')}\n- id: [oops\n`;
  writeFileSync(env.file, broken);
  const refused = await addConnector({ value: valueOf(stdio({ name: 'third' })), file: env.file, backupDir: env.backupDir, dsh, tmp: tmpdir() });
  assert.equal(refused.ok, false);
  assert.equal(refused.stage, 'existing-unreadable');
  assert.match(refused.text, /Line \d+ cannot be read/);
  assert.equal(readFileSync(env.file, 'utf8'), broken, 'a file that cannot be read is left exactly as it is');
  rmSync(env.root, { recursive: true, force: true });
});

test('names that differ only by - or _ (or capitals) share one key name, so they are refused with a plain message', async () => {
  assert.equal(secretRefOf('my-db'), secretRefOf('my_db'), 'the two really would share a key');
  assert.equal(clashingName('my_db', ['other', 'my-db']), 'my-db');
  assert.equal(clashingName('MY-DB', ['my_db']), 'my_db');
  assert.equal(clashingName('my-db2', ['my-db']), '');
  const form = checkForm(stdio({ name: 'my_db' }), { taken: ['my-db'] });
  assert.equal(form.ok, false);
  assert.match(form.problems[0].text, /"my-db" already exists.*share its key/);
  assert.equal(checkForm(stdio({ name: 'my_db2' }), { taken: ['my-db'] }).ok, true);
  // The write itself refuses too, and leaves the file and the key store alone.
  const env = setup('- insert:\n    - id: mcp-my-db\n      config:\n        serverName: my-db\n');
  const before = readFileSync(env.file, 'utf8');
  const kept = [];
  const result = await addConnector({ value: valueOf(stdio({ name: 'my_db', keyName: 'TOKEN', keyValue: 'abc' })), file: env.file, backupDir: env.backupDir, dsh: '/fake/dsh', run: standIn().run, keepKey: async (ref) => { kept.push(ref); } });
  assert.equal(result.ok, false);
  assert.equal(result.stage, 'taken');
  assert.match(result.text ?? result.message ?? JSON.stringify(result), /would share its key/);
  assert.equal(readFileSync(env.file, 'utf8'), before);
  assert.deepEqual(kept, []);
});
