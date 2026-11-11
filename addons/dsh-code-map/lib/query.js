/**
 * The five answers the model can ask the code map for. Every answer is compact
 * plain text, built in a fixed order, and ends by saying how to go deeper.
 */
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, posix, resolve, sep } from 'node:path';
import { CODE_LANGS } from './parse.js';
import { indexStats } from './store.js';

/** Roughly four characters per token. */
const CHARS_PER_TOKEN = 4;

/** @param {number} bytes @returns {string} a short size. */
export function size(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** @param {number} n @returns {string} a number with thousands separators. */
function count(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** @param {number} at - epoch milliseconds. @returns {string} how long ago. */
function ago(at) {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 90) return 'just now';
  if (seconds < 5400) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 129600) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} days ago`;
}

/**
 * Turn what the model typed into a path inside the map, or refuse.
 * Absolute paths, `..` and anything outside the folder are refused.
 * @param {object} index - the index.
 * @param {unknown} input - path as given.
 * @returns {{rel: string} | {error: string}} a path relative to the root, or a refusal.
 */
export function safeRel(index, input) {
  let text = typeof input === 'string' ? input.trim().replace(/\\/g, '/') : '';
  if (text === '') return { error: 'Give a path inside the project.' };
  if (text.includes('\0')) return { error: 'That path is not valid.' };
  const root = index.root.split(sep).join('/');
  if (text === root) return { rel: '' };
  if (text.startsWith(`${root}/`)) text = text.slice(root.length + 1);
  if (isAbsolute(text) || /^[A-Za-z]:/.test(text) || text.startsWith('~')) return { error: 'Only paths inside the project folder can be used.' };
  const clean = posix.normalize(text).replace(/^\.\//, '').replace(/\/$/, '');
  if (clean === '..' || clean.startsWith('../')) return { error: 'Only paths inside the project folder can be used.' };
  return { rel: clean === '.' ? '' : clean };
}

/**
 * Read an indexed file from disk, refusing anything that is not a plain file inside the folder.
 * @param {object} index - the index.
 * @param {string} rel - a path that is in the index.
 * @returns {string | null} its text, or null when it cannot be read safely.
 */
export function readIndexed(index, rel) {
  if (!Object.hasOwn(index.files, rel)) return null;
  try {
    const path = join(index.root, rel);
    if (!lstatSync(path).isFile()) return null;
    // A folder on the way may have been swapped for a link since the map was built.
    const real = realpathSync(path);
    const realRoot = realpathSync(index.root);
    if (real !== resolve(realRoot, rel) && !real.startsWith(`${realRoot}${sep}`)) return null;
    const text = readFileSync(real, 'utf8');
    return text.length > 2_000_000 ? null : text;
  } catch {
    return null;
  }
}

/** @param {object} symbol @returns {string} one outline line. */
function symbolLine(symbol) {
  const span = symbol.end > symbol.line ? `L${symbol.line}-${symbol.end}` : `L${symbol.line}`;
  return `${span.padEnd(11)} ${symbol.parent ? '· ' : ''}${symbol.sig || `${symbol.kind} ${symbol.name}`}`;
}

/** Notes shown when the map is not complete. */
function stateNotes(index, running) {
  const notes = [];
  if (running) notes.push(`The map is still being built (${count(Object.keys(index.files).length)} files so far); ask again in a few seconds for the rest.`);
  if (index.truncated === 'files') notes.push('The folder has more files than the limit; only the first ones are mapped.');
  else if (index.truncated === 'bytes') notes.push('The folder is larger than the size limit; only part of it is mapped.');
  else if (index.truncated === 'time') notes.push('Mapping ran out of time; only part of the folder is mapped.');
  return notes;
}

/** Files that usually start a program, by name. */
const ENTRY_NAMES = /^(main|index|app|server|cli|manage|__main__|setup|program|mod)\.[a-z]+$|^(Makefile|Dockerfile|docker-compose\.ya?ml|package\.json|pyproject\.toml|Cargo\.toml|go\.mod|pom\.xml|build\.gradle(\.kts)?|Gemfile|composer\.json|CMakeLists\.txt|Package\.swift|README\.md)$/i;

/**
 * The whole project in one screen: sizes, languages, folders, entry points and the most connected files.
 * @param {object} index - the index.
 * @param {object} links - from `linkIndex`.
 * @param {{budget?: number, path?: string, running?: boolean}} [options] - token budget (300–6000, default 1500) and an optional sub-folder.
 * @returns {string} the overview.
 */
export function overview(index, links, options = {}) {
  const budget = Math.min(6000, Math.max(300, Math.round(Number(options.budget) || 1500))) * CHARS_PER_TOKEN;
  let scope = '';
  if (options.path) {
    const safe = safeRel(index, options.path);
    if (safe.error) return safe.error;
    scope = safe.rel;
  }
  const inScope = (rel) => scope === '' || rel === scope || rel.startsWith(`${scope}/`);
  const rels = Object.keys(index.files).filter(inScope).sort();
  if (rels.length === 0) {
    return scope
      ? `Nothing is mapped under "${scope}". Call code_map_overview with no path for the whole project.`
      : ['No files are mapped in this folder (it may be empty, or everything in it is ignored).', ...stateNotes(index, options.running)].join('\n');
  }
  const stats = indexStats({ files: Object.fromEntries(rels.map((rel) => [rel, index.files[rel]])) });
  const name = posix.basename(index.root.split(sep).join('/')) || index.root;
  const out = [];
  out.push(`Code map of ${name}${scope ? `/${scope}` : ''}: ${count(stats.files)} files, ${count(stats.symbols)} symbols, ${size(stats.bytes)}, ${count(stats.lines)} lines (mapped ${ago(index.builtAt)}).`);
  out.push(...stateNotes(index, options.running));
  out.push(`Languages: ${stats.languages.slice(0, 8).map(([lang, n]) => `${lang} ${n}`).join(', ')}${stats.languages.length > 8 ? ', …' : ''}`);

  // Most connected files: imported by many, or importing many.
  const scored = rels
    .map((rel) => ({ rel, inbound: links.importedBy[rel]?.length ?? 0, outbound: links.local[rel]?.length ?? 0, symbols: index.files[rel].symbols?.length ?? 0 }))
    .filter((row) => CODE_LANGS.has(index.files[row.rel].lang));
  const hubs = [...scored].sort((a, b) => b.inbound * 3 + b.outbound - (a.inbound * 3 + a.outbound) || (a.rel < b.rel ? -1 : 1)).filter((row) => row.inbound + row.outbound > 0).slice(0, 12);

  const entries = [];
  for (const path of rels) {
    const depth = path.split('/').length - (scope ? scope.split('/').length : 0);
    const base = posix.basename(path);
    // Close to the top only; a README counts only at the top itself.
    if (depth <= 2 && ENTRY_NAMES.test(base) && (depth === 1 || !/^README/i.test(base))) entries.push(path);
  }
  const isTest = (path) => /(^|\/)(tests?|spec|__tests__)\/|[._-](test|spec)\.[a-z]+$/i.test(path);
  const roots = scored.filter((row) => row.inbound === 0 && row.outbound >= 3 && !isTest(row.rel)).sort((a, b) => b.outbound - a.outbound || (a.rel < b.rel ? -1 : 1)).slice(0, 5).map((row) => row.rel);
  const starts = [...new Set([...entries.sort((a, b) => a.split('/').length - b.split('/').length || (a < b ? -1 : 1)).slice(0, 8), ...roots])];
  if (starts.length > 0) out.push(`Likely starting points: ${starts.join(', ')}`);

  // Folder tree, widened level by level until the budget is used.
  const folders = new Map();
  for (const path of rels) {
    const inner = scope ? path.slice(scope.length + 1) : path;
    const parts = inner.split('/');
    for (let depth = 0; depth < parts.length; depth += 1) {
      const key = parts.slice(0, depth).join('/');
      const row = folders.get(key) ?? { files: 0, symbols: 0, direct: [] };
      row.files += 1;
      row.symbols += index.files[path].symbols?.length ?? 0;
      if (depth === parts.length - 1) row.direct.push(parts[depth]);
      folders.set(key, row);
    }
  }
  const treeBudget = Math.max(600, budget - out.join('\n').length - hubs.length * 110 - 260);
  const shown = [];
  let used = 0;
  let depthShown = 0;
  for (let depth = 1; depth <= 6; depth += 1) {
    const level = [...folders.keys()].filter((key) => key !== '' && key.split('/').length === depth).sort();
    const cost = level.reduce((sum, key) => sum + key.length + 60, 0);
    if (depth > 1 && used + cost > treeBudget) break;
    used += cost;
    depthShown = depth;
    if (level.length === 0) break;
  }
  const rootRow = folders.get('');
  const fileList = (names) => {
    const sorted = [...names].sort();
    return sorted.length <= 6 ? sorted.join(', ') : `${sorted.slice(0, 5).join(', ')}, … +${sorted.length - 5}`;
  };
  out.push('Folders (files, symbols):');
  if (rootRow?.direct.length) shown.push(`  ./  ${fileList(rootRow.direct)}`);
  const keys = [...folders.keys()].filter((key) => key !== '' && key.split('/').length <= depthShown).sort();
  for (const key of keys) {
    const row = folders.get(key);
    const depth = key.split('/').length;
    const leaf = depth === depthShown || ![...folders.keys()].some((other) => other.startsWith(`${key}/`));
    const line = `${'  '.repeat(depth)}${posix.basename(key)}/ (${row.files}, ${row.symbols})${leaf && row.direct.length ? `  ${fileList(row.direct)}` : ''}`;
    if (shown.join('\n').length + line.length > treeBudget) {
      shown.push(`${'  '.repeat(depth)}… more folders: pass path=<folder> to see inside one`);
      break;
    }
    shown.push(line);
  }
  out.push(...shown);

  if (hubs.length > 0) {
    out.push('Most connected files (used by N files / uses M):');
    for (const row of hubs) {
      const names = (index.files[row.rel].symbols ?? []).filter((s) => !s.parent).slice(0, 4).map((s) => s.name).join(', ');
      out.push(`  ${row.rel}  ←${row.inbound} →${row.outbound}${names ? `  ${names}` : ''}`);
    }
  }
  out.push('Next: code_map_file path=<file> for a file\'s outline; code_map_find query=<name>; code_map_related target=<file or symbol>; code_map_read to read one symbol.');
  const text = out.join('\n');
  return text.length > budget ? `${text.slice(0, budget - 80)}\n… cut to the budget; pass path=<folder> or a larger budget.` : text;
}

/**
 * One file's outline, without its body.
 * @param {object} index - the index.
 * @param {object} links - from `linkIndex`.
 * @param {string} path - file path as given.
 * @returns {string} the outline.
 */
export function fileOutline(index, links, path) {
  const safe = safeRel(index, path);
  if (safe.error) return safe.error;
  const file = index.files[safe.rel];
  if (!file) {
    const inside = Object.keys(index.files).filter((rel) => rel.startsWith(`${safe.rel}/`));
    if (inside.length > 0) return `"${safe.rel}" is a folder with ${inside.length} mapped files. Call code_map_overview path=${safe.rel}.`;
    const base = posix.basename(safe.rel);
    const near = Object.keys(index.files).filter((rel) => posix.basename(rel) === base).slice(0, 5);
    return `"${safe.rel}" is not in the map${near.length ? `. Did you mean: ${near.join(', ')}` : ' (it may be ignored, binary, too large or new: use code_map_find)'}.`;
  }
  const out = [`${safe.rel}: ${file.lang}, ${count(file.lines)} lines, ${size(file.size)}`];
  if (file.note) out.push(`Note: ${file.note}`);
  const local = links.local[safe.rel] ?? [];
  const external = links.external[safe.rel] ?? [];
  const users = links.importedBy[safe.rel] ?? [];
  if (local.length) out.push(`Uses (local): ${local.slice(0, 25).join(', ')}${local.length > 25 ? `, … +${local.length - 25}` : ''}`);
  if (external.length) out.push(`Uses (outside): ${external.slice(0, 20).join(', ')}${external.length > 20 ? `, … +${external.length - 20}` : ''}`);
  if (users.length) out.push(`Used by (${users.length}): ${users.slice(0, 25).join(', ')}${users.length > 25 ? ', …' : ''}`);
  const symbols = file.symbols ?? [];
  if (symbols.length === 0) out.push('No symbols were found in this file (it may hold data, markup or text).');
  else {
    out.push(`Symbols (${symbols.length}):`);
    const cap = 160;
    for (const symbol of symbols.slice(0, cap)) out.push(`  ${symbolLine(symbol)}`);
    if (symbols.length > cap) out.push(`  … +${symbols.length - cap} more: narrow with code_map_find query=<name> path=${safe.rel}`);
  }
  out.push(`Next: code_map_read path=${safe.rel} symbol=<name> reads just that symbol; code_map_related target=${safe.rel} shows what depends on it.`);
  return out.join('\n');
}

/**
 * Find symbols and files by name.
 * @param {object} index - the index.
 * @param {object} links - from `linkIndex`.
 * @param {{query?: string, kind?: string, path?: string, limit?: number}} args - what to find.
 * @returns {string} ranked matches.
 */
export function find(index, links, args = {}) {
  const query = String(args.query ?? '').trim();
  if (query.length < 2) return 'Give at least two characters to search for.';
  const needle = query.toLowerCase();
  const limit = Math.min(60, Math.max(1, Math.round(Number(args.limit) || 20)));
  let scope = '';
  if (args.path) {
    const safe = safeRel(index, args.path);
    if (safe.error) return safe.error;
    scope = safe.rel;
  }
  const kind = typeof args.kind === 'string' ? args.kind.toLowerCase() : '';
  const hits = [];
  for (const rel of Object.keys(index.files).sort()) {
    if (scope && rel !== scope && !rel.startsWith(`${scope}/`)) continue;
    const file = index.files[rel];
    const base = posix.basename(rel).toLowerCase();
    if (!kind || kind === 'file') {
      const lower = rel.toLowerCase();
      let score = 0;
      if (base === needle || base.replace(/\.[^.]+$/, '') === needle) score = 70;
      else if (base.includes(needle)) score = 45;
      else if (lower.includes(needle)) score = 25;
      if (score) hits.push({ score, text: `${rel}  file, ${file.lang}, ${count(file.lines)} lines` });
    }
    if (kind === 'file') continue;
    for (const symbol of file.symbols ?? []) {
      if (kind && symbol.kind !== kind && !(kind === 'function' && symbol.kind === 'method')) continue;
      const name = symbol.name.toLowerCase();
      let score = 0;
      if (name === needle) score = 100;
      else if (name.startsWith(needle)) score = 80;
      else if (name.includes(needle)) score = 60;
      else if (symbol.sig && symbol.sig.toLowerCase().includes(needle)) score = 30;
      if (!score) continue;
      if (symbol.name === query) score += 5;
      if (!symbol.parent) score += 2;
      hits.push({ score, text: `${rel}:${symbol.line}  ${symbol.kind} ${symbol.parent ? `${symbol.parent}.` : ''}${symbol.name}${symbol.sig && symbol.sig.length < 110 ? `  ${symbol.sig}` : ''}` });
    }
  }
  if (hits.length === 0) {
    return `Nothing in the map is named like "${query}". The map holds names and signatures, not file contents: use grep for text inside files.`;
  }
  hits.sort((a, b) => b.score - a.score || (a.text < b.text ? -1 : 1));
  const out = [`${hits.length} match${hits.length === 1 ? '' : 'es'} for "${query}"${hits.length > limit ? `, best ${limit} shown` : ''}:`];
  for (const hit of hits.slice(0, limit)) out.push(`  ${hit.text}`);
  out.push('Next: code_map_read path=<file> symbol=<name>; code_map_related target=<name> for where it is used.');
  return out.join('\n');
}

/**
 * What a file or symbol depends on, and what depends on it.
 * @param {object} index - the index.
 * @param {object} links - from `linkIndex`.
 * @param {{target?: string, depth?: number}} args - a file path or a symbol name, and how far to follow (1–3).
 * @returns {string} the relations.
 */
export function related(index, links, args = {}) {
  const target = String(args.target ?? '').trim();
  if (!target) return 'Give a file path or a symbol name.';
  const depth = Math.min(3, Math.max(1, Math.round(Number(args.depth) || 1)));
  const safe = safeRel(index, target);
  const out = [];
  if (!safe.error && index.files[safe.rel]) {
    const start = safe.rel;
    /** @param {Record<string, string[]>} graph @returns {string[]} lines of a breadth-first walk. */
    const spread = (graph) => {
      const seen = new Set([start]);
      let level = [start];
      const lines = [];
      for (let d = 1; d <= depth && level.length > 0; d += 1) {
        const next = [];
        for (const rel of level) for (const other of graph[rel] ?? []) if (!seen.has(other)) {
          seen.add(other);
          next.push(other);
        }
        next.sort();
        if (next.length > 0) lines.push(`  ${d === 1 ? 'directly' : `${d} steps away`} (${next.length}): ${next.slice(0, 40).join(', ')}${next.length > 40 ? ', …' : ''}`);
        level = next;
      }
      return lines;
    };
    const uses = spread(links.local);
    const users = spread(links.importedBy);
    out.push(`${start}`);
    out.push(uses.length ? 'It uses:' : 'It uses no other mapped file.');
    out.push(...uses);
    const external = links.external[start] ?? [];
    if (external.length) out.push(`  outside the project: ${external.slice(0, 20).join(', ')}`);
    out.push(users.length ? 'It is used by:' : 'No mapped file imports it (it may be a starting point, or loaded by name).');
    out.push(...users);
    out.push(`Next: code_map_file path=<file> for an outline; pass a symbol name as target to see where that symbol is used.`);
    return out.join('\n');
  }

  // A symbol: where it is defined, then where its name appears in files that could see it.
  const name = target.includes('.') ? target.slice(target.lastIndexOf('.') + 1) : target;
  const defs = links.byName.get(name) ?? [];
  if (defs.length === 0) return `"${target}" is neither a mapped file nor a known symbol. Try code_map_find query=${name}.`;
  out.push(`${name} is defined in ${defs.length} place${defs.length === 1 ? '' : 's'}:`);
  for (const def of defs.slice(0, 8)) out.push(`  ${def.rel}:${def.symbol.line}  ${def.symbol.sig || def.symbol.kind}`);
  const candidates = new Set();
  for (const def of defs.slice(0, 8)) {
    candidates.add(def.rel);
    for (const user of links.importedBy[def.rel] ?? []) candidates.add(user);
    const dir = posix.dirname(def.rel) === '.' ? '' : posix.dirname(def.rel);
    const lang = index.files[def.rel].lang;
    for (const sibling of links.byDir.get(dir) ?? []) if (index.files[sibling].lang === lang) candidates.add(sibling);
  }
  let pattern;
  try {
    pattern = new RegExp(`(^|[^\\w$])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w$]|$)`);
  } catch {
    return out.join('\n');
  }
  const uses = [];
  let bytes = 0;
  let files = 0;
  for (const rel of [...candidates].sort()) {
    if (files >= 200 || bytes > 4_000_000 || uses.length >= 60) break;
    const text = readIndexed(index, rel);
    if (text === null) continue;
    files += 1;
    bytes += text.length;
    const lines = text.split('\n');
    let perFile = 0;
    for (let i = 0; i < lines.length && perFile < 5 && uses.length < 60; i += 1) {
      if (!pattern.test(lines[i])) continue;
      if (defs.some((def) => def.rel === rel && def.symbol.line === i + 1)) continue;
      uses.push(`  ${rel}:${i + 1}  ${lines[i].trim().slice(0, 120)}`);
      perFile += 1;
    }
  }
  out.push(uses.length ? `Its name appears in (files that import the defining file, or sit beside it; matched by name, so check the lines):` : 'Its name was not found in the files that import the defining file or sit beside it. It may be used through another name, or only by text: use grep to be sure.');
  out.push(...uses);
  out.push(`Next: code_map_read path=<file> symbol=${name} to read it; code_map_read path=<file> line=<n> to read around a use.`);
  return out.join('\n');
}

/**
 * Read one symbol, or the lines around one line, instead of the whole file.
 * @param {object} index - the index.
 * @param {{path?: string, symbol?: string, line?: number, context?: number}} args - what to read.
 * @returns {string} numbered lines.
 */
export function readPart(index, args = {}) {
  const safe = safeRel(index, args.path);
  if (safe.error) return safe.error;
  const file = index.files[safe.rel];
  if (!file) return `"${safe.rel}" is not in the map. Use code_map_find to locate it, or the read tool if it is not source code.`;
  const text = readIndexed(index, safe.rel);
  if (text === null) return `"${safe.rel}" can no longer be read (it was removed, replaced by a link, or grew too large).`;
  const lines = text.split('\n');
  let from;
  let to;
  let title;
  const wanted = typeof args.symbol === 'string' ? args.symbol.trim() : '';
  if (wanted) {
    const name = wanted.includes('.') ? wanted.slice(wanted.lastIndexOf('.') + 1) : wanted;
    const parent = wanted.includes('.') ? wanted.slice(0, wanted.lastIndexOf('.')) : undefined;
    const matches = (file.symbols ?? []).filter((symbol) => symbol.name === name && (!parent || symbol.parent === parent));
    if (matches.length === 0) {
      const near = (file.symbols ?? []).filter((symbol) => symbol.name.toLowerCase().includes(name.toLowerCase())).slice(0, 8).map((symbol) => symbol.name);
      return `No symbol named "${wanted}" in ${safe.rel}${near.length ? `. Close: ${near.join(', ')}` : ''}. Call code_map_file path=${safe.rel} for its outline.`;
    }
    const symbol = matches[0];
    from = symbol.line;
    to = symbol.end;
    title = `${safe.rel}  ${symbol.kind} ${symbol.parent ? `${symbol.parent}.` : ''}${symbol.name}${matches.length > 1 ? `  (first of ${matches.length} with this name; others at lines ${matches.slice(1).map((s) => s.line).join(', ')})` : ''}`;
  } else if (Number.isFinite(Number(args.line)) && Number(args.line) >= 1) {
    const around = Math.min(120, Math.max(3, Math.round(Number(args.context) || 20)));
    const line = Math.min(lines.length, Math.round(Number(args.line)));
    from = Math.max(1, line - around);
    to = Math.min(lines.length, line + around);
    title = `${safe.rel}  around line ${line}`;
  } else if (lines.length <= 120) {
    from = 1;
    to = lines.length;
    title = `${safe.rel}  (whole file, it is short)`;
  } else {
    return `${safe.rel} has ${count(lines.length)} lines. Name a symbol (symbol=<name>) or a line (line=<n>) to read part of it; code_map_file path=${safe.rel} lists its symbols.`;
  }
  const maxLines = 400;
  const cut = to - from + 1 > maxLines;
  if (cut) to = from + maxLines - 1;
  const width = String(to).length;
  let body = '';
  let shownTo = from - 1;
  for (let n = from; n <= to; n += 1) {
    const row = `${String(n).padStart(width)}  ${lines[n - 1] ?? ''}\n`;
    if (body.length + row.length > 24_000) break;
    body += row;
    shownTo = n;
  }
  const tail = shownTo < to || cut ? `… stopped at line ${shownTo}; continue with code_map_read path=${safe.rel} line=${shownTo + 20} context=40.` : '';
  return `${title}  L${from}-${shownTo} of ${lines.length}\n${body}${tail}`.trimEnd();
}
