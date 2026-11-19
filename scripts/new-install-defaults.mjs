// Writes the safer starting values of a FIRST install into the person's own setup file.
//   node new-install-defaults.mjs apply <cordis.patch.yml> <new-install-defaults.json>
// Run by the installer only when no Plus add-on was installed before. It adds a row for an id that
// is not in the file yet and leaves every id that is already there alone, so it never changes a
// value a person has. Prints the ids it wrote, one per line. Run with the Node.js inside the app.
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const quote = (text) => `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const scalar = (value) => (typeof value === 'string' ? quote(value) : String(value));

/** Indented YAML lines for a plain object (strings, numbers, booleans, nested objects). */
export function yamlLines(object, indent) {
  const pad = ' '.repeat(indent);
  const lines = [];
  for (const [key, value] of Object.entries(object)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      lines.push(`${pad}${key}:`, ...yamlLines(value, indent + 2));
    } else {
      lines.push(`${pad}${key}: ${scalar(value)}`);
    }
  }
  return lines;
}

/** Ids of the rows already in a setup file. */
export function idsIn(text) {
  return new Set([...String(text).matchAll(/^\s*-\s+id:\s*["']?([^"'\s#]+)["']?/gm)].map((m) => m[1]));
}

/**
 * @param {string} text - the current setup file ('' when there is none).
 * @param {{rows: {id: string, name: string, config: object}[]}} defaults - from new-install-defaults.json.
 * @returns {{text: string, wrote: string[]}} the new text and the ids written.
 */
export function withDefaults(text, defaults) {
  const have = idsIn(text);
  const wrote = [];
  const blocks = [];
  for (const row of defaults.rows ?? []) {
    if (!row?.id || have.has(row.id)) continue;
    wrote.push(row.id);
    blocks.push([`- id: ${row.id}`, `  name: ${quote(row.name)}`, '  config:', ...yamlLines(row.config ?? {}, 4)].join('\n'));
  }
  if (blocks.length === 0) return { text, wrote };
  // An empty list ("[]") or an empty file becomes the rows; otherwise the rows are added at the end of the list.
  const body = String(text).replace(/^\s*\[\s*\]\s*$/m, '');
  const base = body.replace(/\s+$/, '');
  return { text: `${base}${base ? '\n' : ''}${blocks.join('\n')}\n`, wrote };
}

export function main(argv) {
  const [cmd, file, data] = argv;
  if (cmd !== 'apply' || !file || !data) {
    console.error('usage: new-install-defaults.mjs apply <cordis.patch.yml> <new-install-defaults.json>');
    return 2;
  }
  const defaults = JSON.parse(readFileSync(data, 'utf8'));
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const result = withDefaults(text, defaults);
  if (result.wrote.length === 0) return 0;
  writeFileSync(`${file}.tmp`, result.text);
  renameSync(`${file}.tmp`, file);
  for (const id of result.wrote) console.log(id);
  return 0;
}

const real = (path) => { try { return realpathSync(path); } catch { return path; } };
if (import.meta.url === pathToFileURL(real(process.argv[1] ?? '')).href) process.exit(main(process.argv.slice(2)));
