/**
 * Measures what the code map saves on a folder, without the app.
 * Usage: node measure.mjs <folder> [file-to-outline] [symbol-to-find]
 * Reads the folder only; writes nothing.
 */
import { resolve } from 'node:path';
import { fileOutline, find, overview, readPart, related } from './lib/query.js';
import { buildIndex, indexStats, linkIndex } from './lib/store.js';

const root = resolve(process.argv[2] ?? '.');
const started = Date.now();
const index = await buildIndex(root, {});
const links = linkIndex(index);
const stats = indexStats(index);
const view = overview(index, links, {});
console.log(view);
console.log('\n---');
const hub = Object.entries(links.importedBy).sort((a, b) => b[1].length - a[1].length)[0]?.[0];
const file = process.argv[3] ?? hub ?? Object.keys(index.files).find((rel) => (index.files[rel].symbols ?? []).length > 3);
const outline = file ? fileOutline(index, links, file) : '';
const symbol = process.argv[4] ?? index.files[file]?.symbols?.find((s) => s.kind === 'function' || s.kind === 'method')?.name ?? index.files[file]?.symbols?.[0]?.name;
const found = symbol ? find(index, links, { query: symbol }) : '';
const uses = symbol ? related(index, links, { target: symbol }) : '';
const body = symbol ? readPart(index, { path: file, symbol }) : '';
const investigation = view.length + outline.length + found.length + uses.length + body.length;
console.log(JSON.stringify({
  folder: root,
  files: stats.files,
  symbols: stats.symbols,
  sourceChars: stats.bytes,
  buildMs: Date.now() - started,
  truncated: index.truncated,
  skipped: index.skipped,
  overviewChars: view.length,
  example: { file, symbol, outlineChars: outline.length, findChars: found.length, relatedChars: uses.length, readChars: body.length },
  investigationChars: investigation,
  investigationShare: `${((investigation / Math.max(1, stats.bytes)) * 100).toFixed(2)}% of the source`,
  indexJsonChars: JSON.stringify(index).length,
}, null, 1));
