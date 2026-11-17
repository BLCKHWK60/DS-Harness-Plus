/**
 * What one add-on touches, read from its own files by code (the map's static half; the running app
 * gives the other half). Only the add-on's package, patch, code and README are read, never its data.
 * Every name found is a hint for the fit check, not proof: the running app is the authority.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const MAX_FILE = 2_000_000;

/** @returns {string} a file's text, or '' when it is missing or too large. */
function readText(path) {
  try {
    if (statSync(path).size > MAX_FILE) return '';
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

/** @returns {string[]} unique matches of a pattern's first group, in order. */
function all(text, pattern, group = 1) {
  const out = [];
  for (const found of text.matchAll(pattern)) if (found[group] && !out.includes(found[group])) out.push(found[group]);
  return out;
}

/** The code files of an add-on: index.js, client.js and lib/*.js (never its tests or its modules). */
export function codeFiles(dir) {
  const files = [];
  for (const name of ['index.js', 'client.js']) if (existsSync(join(dir, name))) files.push(name);
  try {
    for (const name of readdirSync(join(dir, 'lib')).sort()) if (/\.(m?js)$/.test(name)) files.push(`lib/${name}`);
  } catch {
    /* no lib folder */
  }
  return files;
}

/** The keys of the add-on's Config object (`export const Config = z.object({ … })`). */
export function configKeys(text) {
  const start = text.indexOf('export const Config = z.object({');
  if (start < 0) return [];
  let depth = 0;
  let end = text.length;
  for (let index = text.indexOf('{', start); index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    else if (text[index] === '}' && (depth -= 1) === 0) {
      end = index;
      break;
    }
  }
  return all(text.slice(start, end), /^\s{2}([A-Za-z_][\w]*):\s*z\b/gm);
}

/**
 * A new plugin's setup file (cordis.patch.yml), read strictly: only the shape Creator Plus makes is accepted,
 * one `- insert:` with rows of `id`, `name`, `config` (and `disabled`). Anything else (another operation, a row
 * that changes or switches off another plugin, a tag such as !!js, an anchor, an alias, flow style, tabs) is a
 * problem. A strict check, not a parser: what it does not know is refused.
 * @param {string} text - the file.
 * @returns {{rows: {id: string, name: string}[], problems: string[]}} the rows it inserts and the problems.
 */
export function patchRows(text) {
  const rows = [];
  const problems = [];
  const lines = String(text ?? '').split(/\r?\n/);
  let started = false;
  let inConfig = false;
  let row;
  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+$/, '');
    const at = `line ${index + 1}`;
    if (/^\s*(#.*)?$/.test(line)) return;
    if (/\t/.test(line)) return void problems.push(`${at}: a tab character`);
    const indent = /^ */.exec(line)[0].length;
    const body = line.slice(indent);
    const value = body.replace(/^-\s*/, '').replace(/^[\w.-]+:\s*/, '');
    if (/(^|\s)(!|&|\*)\S/.test(value) || /<<\s*:/.test(body) || /^[[{]/.test(value)) return void problems.push(`${at}: a YAML tag, anchor, alias or flow value`);
    if (!started) {
      if (indent === 0 && body === '- insert:') started = true;
      else problems.push(`${at}: the file must start with "- insert:" (only new rows are added)`);
      return;
    }
    if (indent < 4) return void problems.push(`${at}: only one "- insert:" is allowed; "${body.slice(0, 40)}" would change the setup`);
    if (indent === 4) {
      const id = /^- id:\s*['"]?([\w.-]+)['"]?$/.exec(body);
      if (!id) return void problems.push(`${at}: a row starts with "- id:"`);
      row = { id: id[1], name: '' };
      rows.push(row);
      inConfig = false;
      return;
    }
    if (indent === 6) {
      if (!row) return void problems.push(`${at}: a key before any row`);
      const key = /^([\w.-]+):\s*(.*)$/.exec(body);
      if (!key || !['name', 'config', 'disabled'].includes(key[1])) return void problems.push(`${at}: "${body.slice(0, 30)}" is not a key a new row may have`);
      if (key[1] === 'name') row.name = key[2].replace(/^['"]|['"]$/g, '');
      if (key[1] === 'disabled' && !/^(true|false)$/.test(key[2])) return void problems.push(`${at}: disabled is true or false`);
      inConfig = key[1] === 'config' && key[2] === '';
      return;
    }
    if (!inConfig) problems.push(`${at}: a deeper line outside config`);
  });
  if (!started && problems.length === 0) problems.push('The file has no "- insert:".');
  for (const one of rows) if (!one.name) problems.push(`The row ${one.id} has no name.`);
  return { rows, problems };
}

/**
 * Read one add-on folder.
 * @param {string} dir - the add-on's folder.
 * @returns {object} what it is and what it touches.
 */
export function scanAddon(dir) {
  let pkg = {};
  try {
    pkg = JSON.parse(readText(join(dir, 'package.json')) || '{}');
  } catch {
    pkg = {};
  }
  const patch = readText(join(dir, 'cordis.patch.yml'));
  const files = codeFiles(dir);
  const texts = Object.fromEntries(files.map((file) => [file, readText(join(dir, file))]));
  const server = files.filter((file) => file !== 'client.js').map((file) => texts[file]).join('\n');
  const client = texts['client.js'] ?? '';
  const code = `${server}\n${client}`;
  const injectList = (/export const inject = \[([^\]]*)\]/.exec(server)?.[1] ?? '').match(/'([\w.-]+)'/g)?.map((item) => item.slice(1, -1)) ?? [];
  const toolNames = [];
  for (const found of server.matchAll(/name:\s*'([a-z][a-z0-9_]{2,})'/g)) {
    const after = server.slice(found.index, found.index + 6000);
    // A tool is an object with a description, parameters and an execute function (a name without "_" needs both).
    const tool = /description\s*:/.test(after) && (found[1].includes('_') ? /(parameters|execute)\s*:/.test(after) : /parameters\s*:/.test(after) && /execute\s*:/.test(after));
    if (tool && !toolNames.includes(found[1])) toolNames.push(found[1]);
  }
  // Tools named in a list the add-on owns (`export const TOOLS = ['recon_…']`), by its own prefix.
  const prefix = `${String(dir.split('/').filter(Boolean).pop() ?? '').replace(/^dsh-/, '').replace(/-/g, '_')}_`;
  for (const list of server.matchAll(/export const [A-Z_]*TOOLS\s*=\s*\[([^\]]*)\]/g)) {
    for (const item of list[1].matchAll(/'([a-z][a-z0-9_]+)'/g)) if (item[1].startsWith(prefix) && !toolNames.includes(item[1])) toolNames.push(item[1]);
  }
  const method = /export const METHOD = `([\s\S]*?)`;/.exec(server)?.[1] ?? '';
  const testDir = join(dir, 'test');
  let tests = [];
  try {
    tests = readdirSync(testDir).filter((name) => /\.test\.mjs$/.test(name)).sort();
  } catch {
    tests = [];
  }
  const testCount = tests.reduce((sum, name) => sum + (readText(join(testDir, name)).match(/^test\(/gm)?.length ?? 0), 0);
  const cssVars = {};
  for (const found of client.matchAll(/var\((--dsw-[\w-]+)/g)) cssVars[found[1]] = (cssVars[found[1]] ?? 0) + 1;
  return {
    folder: dir.split('/').filter(Boolean).pop(),
    name: String(pkg.name ?? ''),
    version: String(pkg.version ?? ''),
    description: String(pkg.description ?? ''),
    engines: String(pkg.engines?.dsh ?? ''),
    // Every row id the file names, wherever it stands (a row that only changes another one names it too).
    rows: all(patch, /^\s*(?:-\s*)?id:\s*['"]?([\w.-]+)/gm),
    patch,
    config: configKeys(server),
    provides: all(server, /ctx\.provide\(\s*'([\w.-]+)'/g),
    uses: [...new Set([...all(code, /\bget\(\s*'([\w.-]+)'\s*\)/g), ...injectList])].sort(),
    inject: injectList,
    events: all(server, /\bctx\.on\(\s*'([\w./:-]+)'/g),
    tools: toolNames,
    commands: all(server, /commands\.register\(\{\s*name:\s*'([\w-]+)'/g),
    routes: [...new Set([...all(code, /'(\/dsh-[\w-]+(?:\/[\w.-]+)*)'/g), ...all(client, /'(dsh-[\w-]+\/[\w.-]+)'/g).map((path) => `/${path}`)])],
    slots: [...client.matchAll(/slots\.register\(\s*\{\s*name:\s*'([\w.-]+)',\s*id:\s*'([\w-]+)'/g)].map((found) => ({ name: found[1], id: found[2] })),
    settingsNs: all(code, /const (?:NS|[A-Z_]*_NS)\s*=\s*'([\w-]+)'/g),
    sections: all(server, /section\(\{\s*name:\s*'([\w:.-]+)'/g),
    modes: all(server, /export const MODE_ID\s*=\s*'([\w-]+)'/g),
    storage: all(server, /(?:dshHomePath'\)\??\.?\(?|\bhome\()\s*'([\w.-]+)'\s*\)/g),
    methodChars: method.length,
    cssVars,
    files,
    tests,
    testCount,
    readme: readText(join(dir, 'README.md')),
  };
}

/**
 * Read every add-on in a folder (the Plus folder, installed or the repository).
 * @param {string} root - the folder holding the add-on folders.
 * @returns {object[]} one scan per add-on with a package.json.
 */
export function scanAddons(root) {
  let names = [];
  try {
    names = readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith('.')).map((entry) => entry.name).sort();
  } catch {
    names = [];
  }
  return names.filter((name) => existsSync(join(root, name, 'package.json'))).map((name) => scanAddon(join(root, name)));
}
