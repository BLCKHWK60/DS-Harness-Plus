/**
 * Builds, links, saves and loads the code map of one folder.
 *
 * The map is one JSON file kept outside the project (in the app's own data
 * folder), so nothing is written into the user's repository.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { parseFile } from './parse.js';
import { walk } from './scan.js';

/** Bump when the stored shape changes; an older file is rebuilt. */
export const INDEX_VERSION = 1;

/**
 * A stable id for a folder, used as the name of its data folder.
 * @param {string} root - absolute folder.
 * @returns {string} 16 hex characters.
 */
export function folderId(root) {
  return createHash('sha1').update(resolve(root)).digest('hex').slice(0, 16);
}

/**
 * Read one file as text, refusing binary content.
 * @param {string} path - absolute file.
 * @param {number} limit - most bytes read.
 * @returns {Promise<string | null>} the text, or null for binary or unreadable files.
 */
async function readText(path, limit) {
  let handle;
  try {
    handle = await open(path, 'r');
    const buffer = Buffer.alloc(limit);
    const { bytesRead } = await handle.read(buffer, 0, limit, 0);
    const data = buffer.subarray(0, bytesRead);
    if (data.subarray(0, 4096).includes(0)) return null;
    return data.toString('utf8');
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * Build or refresh the map of a folder. Files whose size and time are unchanged are reused,
 * and files whose content hash is unchanged keep their outline.
 * @param {string} root - absolute folder.
 * @param {object} [options] - limits and hooks.
 * @param {object} [options.previous] - the earlier index, for an incremental refresh.
 * @param {number} [options.maxFiles] - most files.
 * @param {number} [options.maxFileBytes] - largest file read.
 * @param {number} [options.maxTotalBytes] - most bytes in total.
 * @param {number} [options.maxMillis] - time budget.
 * @param {string} [options.extraIgnore] - more ignore patterns, one per line.
 * @param {AbortSignal} [options.signal] - stops the build.
 * @param {(state: {files: object, done: number, total: number}) => void} [options.onProgress] - called as files are added.
 * @returns {Promise<object>} the index: `{ version, root, builtAt, truncated, skipped, reused, parsed, files }`.
 */
export async function buildIndex(root, options = {}) {
  const base = resolve(root);
  const started = Date.now();
  const deadline = started + (options.maxMillis ?? 120_000);
  const listing = await walk(base, { ...options, deadline });
  const previous = options.previous?.version === INDEX_VERSION ? options.previous.files ?? {} : {};
  const files = {};
  let reused = 0;
  let parsed = 0;
  let truncated = listing.truncated;
  const skipped = { ...listing.skipped };
  const maxBytes = options.maxFileBytes ?? 400 * 1024;
  for (let n = 0; n < listing.files.length; n += 1) {
    const entry = listing.files[n];
    if (n % 50 === 0) {
      if (options.signal?.aborted) {
        truncated = 'stopped';
        break;
      }
      if (Date.now() > deadline) {
        truncated = 'time';
        break;
      }
      options.onProgress?.({ files, done: n, total: listing.files.length });
      await new Promise((next) => setImmediate(next));
    }
    const before = previous[entry.rel];
    if (before && before.size === entry.size && before.mtimeMs === entry.mtimeMs) {
      files[entry.rel] = before;
      reused += 1;
      continue;
    }
    const text = await readText(join(base, entry.rel), maxBytes);
    if (text === null) {
      skipped.binary += 1;
      continue;
    }
    const hash = createHash('sha1').update(text).digest('hex').slice(0, 16);
    if (before && before.hash === hash) {
      files[entry.rel] = { ...before, size: entry.size, mtimeMs: entry.mtimeMs };
      reused += 1;
      continue;
    }
    const outline = parseFile(entry.rel, text);
    // A Go module file names the import path of its folder.
    if (entry.rel === 'go.mod' || entry.rel.endsWith('/go.mod')) {
      const match = /^module\s+(\S+)/m.exec(text);
      if (match) outline.pkg = match[1];
    }
    files[entry.rel] = { size: entry.size, mtimeMs: entry.mtimeMs, hash, ...outline };
    parsed += 1;
  }
  return {
    version: INDEX_VERSION,
    root: base,
    builtAt: Date.now(),
    tookMs: Date.now() - started,
    truncated,
    skipped,
    reused,
    parsed,
    files,
  };
}

const JS_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.d.ts', '.json', '.vue', '.svelte'];

/**
 * Work out, for every file, which local files its imports point at, and the reverse.
 * Kept in memory only; cheap to recompute.
 * @param {object} index - a built index.
 * @returns {{local: Record<string, string[]>, external: Record<string, string[]>, importedBy: Record<string, string[]>, byName: Map<string, Array<{rel: string, symbol: object}>>}} links.
 */
export function linkIndex(index) {
  const files = index.files ?? {};
  const rels = Object.keys(files).sort();
  const has = new Set(rels);
  const byDir = new Map();
  const byBase = new Map();
  const byPkg = new Map();
  const fqn = new Map();
  const goModules = [];
  for (const rel of rels) {
    const dir = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir).push(rel);
    const baseName = posix.basename(rel);
    if (!byBase.has(baseName)) byBase.set(baseName, []);
    byBase.get(baseName).push(rel);
    const file = files[rel];
    if (baseName === 'go.mod' && file.pkg) goModules.push({ dir, module: file.pkg });
    else if (file.pkg) {
      if (!byPkg.has(file.pkg)) byPkg.set(file.pkg, []);
      byPkg.get(file.pkg).push(rel);
      for (const symbol of file.symbols ?? []) {
        if (symbol.kind === 'class' && !symbol.parent) fqn.set(`${file.pkg}.${symbol.name}`, rel);
      }
    }
  }
  const norm = (path) => {
    const clean = posix.normalize(path);
    return clean.startsWith('../') || clean === '..' ? null : clean.replace(/^\.\//, '');
  };
  const first = (candidates) => candidates.map((c) => (c === null ? null : norm(c))).find((c) => c !== null && has.has(c));

  /**
   * @param {string} rel - importing file.
   * @param {object} file - its outline.
   * @param {string} spec - one import as written.
   * @returns {{local?: string[], external?: string}} where it points.
   */
  function resolveOne(rel, file, spec) {
    const dir = posix.dirname(rel) === '.' ? '' : posix.dirname(rel);
    const lang = file.lang;
    if (lang === 'JavaScript' || lang === 'TypeScript' || lang === 'Vue' || lang === 'Svelte') {
      const bases = [];
      if (spec.startsWith('.')) bases.push(posix.join(dir, spec));
      else if (spec.startsWith('@/') || spec.startsWith('~/')) bases.push(`src/${spec.slice(2)}`, spec.slice(2));
      else if (!spec.startsWith('node:')) bases.push(spec, `src/${spec}`);
      for (const b of bases) {
        const swaps = [b];
        if (/\.(js|mjs|cjs)$/.test(b)) swaps.push(b.replace(/\.(js|mjs|cjs)$/, '.ts'), b.replace(/\.(js|mjs|cjs)$/, '.tsx'));
        if (/\.jsx$/.test(b)) swaps.push(b.replace(/\.jsx$/, '.tsx'));
        const hit = first([...swaps, ...JS_EXT.map((ext) => b + ext), ...JS_EXT.map((ext) => `${b}/index${ext}`)]);
        if (hit) return { local: [hit] };
      }
      if (spec.startsWith('.')) return {};
      const parts = spec.replace(/^node:/, '').split('/');
      return { external: spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0] };
    }
    if (lang === 'Python') {
      const dots = /^\.*/.exec(spec)[0].length;
      const rest = spec.slice(dots).replace(/\./g, '/');
      const starts = [];
      if (dots > 0) {
        let up = dir;
        for (let n = 1; n < dots; n += 1) up = posix.dirname(up) === '.' ? '' : posix.dirname(up);
        starts.push(up);
      } else starts.push('', dir, 'src');
      for (const start of starts) {
        const path = rest ? posix.join(start, rest) : start;
        const hit = first([path ? `${path}.py` : null, posix.join(path, '__init__.py'), path ? `${path}.pyi` : null]);
        if (hit && hit !== rel) return { local: [hit] };
      }
      return dots > 0 ? {} : { external: spec.split('.')[0] };
    }
    if (lang === 'Go') {
      for (const { dir: moduleDir, module } of goModules) {
        if (spec === module || spec.startsWith(`${module}/`)) {
          const target = posix.join(moduleDir, spec.slice(module.length + 1)).replace(/^\.$/, '');
          const local = (byDir.get(target) ?? []).filter((r) => r.endsWith('.go') && !r.endsWith('_test.go')).slice(0, 30);
          return local.length > 0 ? { local } : {};
        }
      }
      return { external: spec };
    }
    if (lang === 'Rust') {
      if (spec.startsWith('mod:')) {
        const name = spec.slice(4);
        const stem = posix.basename(rel, '.rs');
        const own = ['mod', 'lib', 'main'].includes(stem) ? dir : posix.join(dir, stem);
        const hit = first([posix.join(dir, `${name}.rs`), posix.join(dir, name, 'mod.rs'), posix.join(own, `${name}.rs`), posix.join(own, name, 'mod.rs')]);
        return hit ? { local: [hit] } : {};
      }
      const parts = spec.split('::').map((part) => part.trim()).filter(Boolean);
      let start = null;
      if (parts[0] === 'crate') {
        let up = dir;
        for (let n = 0; n < 12; n += 1) {
          if (has.has(posix.join(up, 'lib.rs')) || has.has(posix.join(up, 'main.rs'))) {
            start = up;
            break;
          }
          if (up === '') break;
          up = posix.dirname(up) === '.' ? '' : posix.dirname(up);
        }
      } else if (parts[0] === 'self') start = dir;
      else if (parts[0] === 'super') start = posix.dirname(dir) === '.' ? '' : posix.dirname(dir);
      if (start === null) return { external: parts[0] };
      for (let n = parts.length; n > 1; n -= 1) {
        const path = posix.join(start, ...parts.slice(1, n));
        const hit = first([`${path}.rs`, posix.join(path, 'mod.rs')]);
        if (hit && hit !== rel) return { local: [hit] };
      }
      return {};
    }
    if (lang === 'C' || lang === 'C++' || lang === 'Objective-C') {
      if (spec.startsWith('<')) return { external: spec.slice(1, -1) };
      const hit = first([posix.join(dir, spec), spec, `include/${spec}`, `src/${spec}`]);
      if (hit) return { local: [hit] };
      const named = (byBase.get(posix.basename(spec)) ?? []).filter((r) => r === spec || r.endsWith(`/${spec}`));
      return named.length === 1 ? { local: named } : {};
    }
    if (lang === 'Java' || lang === 'Kotlin' || lang === 'Scala' || lang === 'PHP' || lang === 'C#' || lang === 'Dart') {
      if (lang === 'PHP' && /[/.]php$|^\.{0,2}\//.test(spec) && spec.includes('/')) {
        const hit = first([posix.join(dir, spec), spec]);
        return hit ? { local: [hit] } : {};
      }
      const name = spec.replace(/\.$/, '');
      if (fqn.has(name)) return { local: [fqn.get(name)] };
      if (byPkg.has(name)) return { local: byPkg.get(name).filter((r) => r !== rel).slice(0, 30) };
      return { external: name.split('.').slice(0, 2).join('.') };
    }
    if (lang === 'Ruby') {
      const hit = first(spec.startsWith('.') ? [`${posix.join(dir, spec)}.rb`, posix.join(dir, spec)] : [`lib/${spec}.rb`, `${spec}.rb`, `app/${spec}.rb`]);
      return hit ? { local: [hit] } : spec.startsWith('.') ? {} : { external: spec.split('/')[0] };
    }
    if (lang === 'Shell') {
      const clean = spec.replace(/^\$\{?[A-Za-z_]\w*\}?\//, '').replace(/^\$\([^)]*\)\//, '');
      const hit = first([posix.join(dir, clean), clean]);
      if (hit) return { local: [hit] };
      const named = byBase.get(posix.basename(clean)) ?? [];
      return named.length === 1 ? { local: named } : {};
    }
    return { external: spec.split(/[./]/)[0] };
  }

  const local = {};
  const external = {};
  const importedBy = {};
  const byName = new Map();
  for (const rel of rels) {
    const file = files[rel];
    const locals = new Set();
    const externals = new Set();
    for (const spec of file.imports ?? []) {
      let found;
      try {
        found = resolveOne(rel, file, spec);
      } catch {
        found = {};
      }
      for (const target of found.local ?? []) if (target !== rel) locals.add(target);
      if (found.external) externals.add(found.external);
    }
    local[rel] = [...locals].sort();
    external[rel] = [...externals].sort();
    for (const target of locals) (importedBy[target] ??= []).push(rel);
    for (const symbol of file.symbols ?? []) {
      if (!byName.has(symbol.name)) byName.set(symbol.name, []);
      byName.get(symbol.name).push({ rel, symbol });
    }
  }
  return { local, external, importedBy, byName, byDir };
}

/**
 * Save an index next to nothing else, atomically.
 * @param {string} dir - data folder of this project.
 * @param {object} index - the index.
 */
export function saveIndex(dir, index) {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'index.json');
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(index));
  renameSync(temp, file);
}

/**
 * Load a saved index.
 * @param {string} dir - data folder of this project.
 * @returns {object | null} the index, or null when missing, damaged or from another version.
 */
export function loadIndex(dir) {
  try {
    const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
    return index && index.version === INDEX_VERSION && index.files && typeof index.root === 'string' ? index : null;
  } catch {
    return null;
  }
}

/**
 * Delete a saved index.
 * @param {string} dir - data folder of this project.
 */
export function removeIndex(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Size on disk of a saved index.
 * @param {string} dir - data folder of this project.
 * @returns {number} bytes, 0 when missing.
 */
export function indexBytes(dir) {
  try {
    return statSync(join(dir, 'index.json')).size;
  } catch {
    return 0;
  }
}

/**
 * Numbers that describe an index.
 * @param {object} index - the index.
 * @returns {{files: number, symbols: number, bytes: number, lines: number, languages: Array<[string, number]>}} counts.
 */
export function indexStats(index) {
  let symbols = 0;
  let bytes = 0;
  let lines = 0;
  const languages = new Map();
  const entries = Object.values(index?.files ?? {});
  for (const file of entries) {
    symbols += file.symbols?.length ?? 0;
    bytes += file.size ?? 0;
    lines += file.lines ?? 0;
    languages.set(file.lang, (languages.get(file.lang) ?? 0) + 1);
  }
  return {
    files: entries.length,
    symbols,
    bytes,
    lines,
    languages: [...languages.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)),
  };
}
