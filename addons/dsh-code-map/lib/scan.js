/**
 * Walks a project folder and lists the files worth mapping.
 *
 * Safety rules, all enforced here:
 *  - symbolic links are never followed (a link cannot lead out of the folder);
 *  - `.git`, dependency and build folders, binaries, lock files, minified and oversized files are skipped;
 *  - `.gitignore` files are respected (the common subset: comments, negation, directory rules, `*`, `**`, `?`);
 *  - hard limits on files, bytes and time, so a huge folder cannot hang the app.
 */
import { lstat, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

/** Folders never looked into. */
export const SKIP_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', 'bower_components', 'dist', 'build', 'out', 'target', 'vendor',
  '.venv', 'venv', 'env', '__pycache__', '.tox', '.mypy_cache', '.pytest_cache', '.ruff_cache', '.next', '.nuxt',
  '.svelte-kit', '.turbo', '.cache', '.parcel-cache', 'coverage', '.nyc_output', '.idea', '.vscode', '.gradle',
  'Pods', 'DerivedData', '.terraform', '.dart_tool', '.bundle', 'site-packages', '.eggs',
]);

/** File names never mapped: lock files and OS litter. */
export const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'Cargo.lock', 'poetry.lock', 'Pipfile.lock',
  'Gemfile.lock', 'composer.lock', 'go.sum', 'flake.lock', 'uv.lock', '.DS_Store', 'Thumbs.db',
]);

/** Extensions that are never text worth mapping. */
const BINARY_EXT = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'icns', 'tif', 'tiff', 'heic', 'psd', 'ai', 'sketch', 'fig',
  'mp3', 'wav', 'flac', 'ogg', 'm4a', 'aac', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  'zip', 'gz', 'tgz', 'bz2', 'xz', '7z', 'rar', 'tar', 'jar', 'war', 'dmg', 'iso', 'pkg', 'deb', 'rpm', 'asar',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'key', 'pages', 'numbers',
  'exe', 'dll', 'so', 'dylib', 'a', 'o', 'obj', 'lib', 'class', 'pyc', 'pyo', 'wasm', 'node', 'bin', 'dat', 'db',
  'sqlite', 'sqlite3', 'ttf', 'otf', 'woff', 'woff2', 'eot', 'safetensors', 'gguf', 'onnx', 'pt', 'pth', 'npy', 'npz',
  'parquet', 'map', 'snap',
]);

/** Generic default limits. */
export const DEFAULT_LIMITS = Object.freeze({
  maxFiles: 5000,
  maxFileBytes: 400 * 1024,
  maxTotalBytes: 80 * 1024 * 1024,
  maxMillis: 120_000,
});

/**
 * Compile one `.gitignore` line.
 * @param {string} line - raw line.
 * @returns {{negate: boolean, dirOnly: boolean, regex: RegExp} | null} rule, or null for blanks and comments.
 */
export function compileIgnoreLine(line) {
  let pattern = String(line).replace(/\r$/, '');
  if (pattern.trim() === '' || pattern.startsWith('#')) return null;
  pattern = pattern.replace(/(?<!\\)\s+$/, '');
  let negate = false;
  if (pattern.startsWith('!')) {
    negate = true;
    pattern = pattern.slice(1);
  }
  if (pattern.startsWith('\\#') || pattern.startsWith('\\!')) pattern = pattern.slice(1);
  let dirOnly = false;
  if (pattern.endsWith('/')) {
    dirOnly = true;
    pattern = pattern.slice(0, -1);
  }
  if (pattern === '') return null;
  // A slash at the start or in the middle ties the pattern to the folder of the ignore file.
  const anchored = pattern.includes('/');
  if (pattern.startsWith('/')) pattern = pattern.slice(1);
  let body = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        const before = i === 0 || pattern[i - 1] === '/';
        const after = pattern[i + 2];
        if (before && after === '/') {
          body += '(?:.*/)?';
          i += 2;
        } else {
          body += '.*';
          i += 1;
        }
      } else body += '[^/]*';
    } else if (char === '?') body += '[^/]';
    else if (char === '[') {
      const close = pattern.indexOf(']', i + 1);
      if (close < 0) body += '\\[';
      else {
        body += `[${pattern.slice(i + 1, close).replace(/\\/g, '\\\\').replace(/^!/, '^')}]`;
        i = close;
      }
    } else if (char === '\\' && i + 1 < pattern.length) {
      body += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      i += 1;
    } else body += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  let regex;
  try {
    regex = new RegExp(`${anchored ? '^' : '^(?:.*/)?'}${body}$`);
  } catch {
    return null;
  }
  return { negate, dirOnly, regex };
}

/**
 * Compile the text of an ignore file.
 * @param {string} text - file content, one pattern per line.
 * @returns {Array<{negate: boolean, dirOnly: boolean, regex: RegExp}>} rules in file order.
 */
export function compileIgnore(text) {
  return String(text ?? '')
    .split('\n')
    .slice(0, 2000)
    .map(compileIgnoreLine)
    .filter(Boolean);
}

/**
 * Whether a path is ignored by a stack of ignore files (root first). The last matching rule wins.
 * @param {Array<{base: string, rules: object[]}>} stack - ignore files with the folder each one sits in ('' for the root).
 * @param {string} rel - path relative to the root, with forward slashes.
 * @param {boolean} isDir - whether the path is a folder.
 * @returns {boolean} true when ignored.
 */
export function isIgnored(stack, rel, isDir) {
  let ignored = false;
  for (const { base, rules } of stack) {
    if (base && !rel.startsWith(`${base}/`)) continue;
    const local = base ? rel.slice(base.length + 1) : rel;
    for (const rule of rules) {
      if (rule.dirOnly && !isDir) continue;
      if (rule.regex.test(local)) ignored = !rule.negate;
    }
  }
  return ignored;
}

/**
 * Whether a folder is too broad to map (the disk root, the home folder, a whole personal folder such as Documents, or a system folder).
 * @param {string} root - absolute folder.
 * @returns {boolean} true when it must not be mapped.
 */
export function tooBroad(root) {
  const path = resolve(root);
  const home = resolve(homedir());
  if (path === sep || path === home) return true;
  if (home.startsWith(`${path}${sep}`)) return true; // a parent of the home folder
  // Whole personal folders are collections of projects, not one project.
  if (["Documents", "Desktop", "Downloads", "Library"].some((name) => path === resolve(home, name))) return true;
  return ['/System', '/Library', '/usr', '/bin', '/sbin', '/etc', '/var', '/private', '/Applications', '/Volumes']
    .some((system) => path === system);
}

/**
 * List the files of a folder that are worth mapping.
 * @param {string} root - absolute folder.
 * @param {object} [options] - limits and extra rules.
 * @param {number} [options.maxFiles] - most files listed.
 * @param {number} [options.maxFileBytes] - files larger than this are skipped.
 * @param {number} [options.maxTotalBytes] - stop once this many bytes are listed.
 * @param {number} [options.deadline] - epoch milliseconds after which the walk stops.
 * @param {string} [options.extraIgnore] - more ignore patterns, one per line, as in a root `.gitignore`.
 * @param {AbortSignal} [options.signal] - stops the walk.
 * @returns {Promise<{files: Array<{rel: string, size: number, mtimeMs: number}>, skipped: Record<string, number>, truncated: string | null}>}
 *   files in a stable order, counts of what was skipped and why, and the limit that stopped the walk, if any.
 */
export async function walk(root, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...Object.fromEntries(Object.entries(options).filter(([, v]) => v !== undefined)) };
  const deadline = options.deadline ?? Date.now() + limits.maxMillis;
  const files = [];
  const skipped = { ignored: 0, folders: 0, links: 0, binary: 0, large: 0, lock: 0, minified: 0, unreadable: 0 };
  let truncated = null;
  let total = 0;
  let ticks = 0;
  const base = resolve(root);
  const rootRules = compileIgnore(options.extraIgnore ?? '');

  /**
   * @param {string} dir - folder relative to the root ('' for the root).
   * @param {Array<{base: string, rules: object[]}>} stack - ignore files that apply.
   */
  async function visit(dir, stack) {
    if (truncated) return;
    let entries;
    try {
      entries = await readdir(join(base, dir), { withFileTypes: true });
    } catch {
      skipped.unreadable += 1;
      return;
    }
    let here = stack;
    if (entries.some((entry) => entry.name === '.gitignore' && entry.isFile())) {
      try {
        const text = await readFile(join(base, dir, '.gitignore'), 'utf8');
        here = [...stack, { base: dir, rules: compileIgnore(text) }];
      } catch {
        // An unreadable ignore file is treated as empty.
      }
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      if (truncated) return;
      ticks += 1;
      if (ticks % 200 === 0) {
        if (options.signal?.aborted) {
          truncated = 'stopped';
          return;
        }
        if (Date.now() > deadline) {
          truncated = 'time';
          return;
        }
        await new Promise((next) => setImmediate(next));
      }
      const rel = dir ? `${dir}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        skipped.links += 1;
        continue;
      }
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) {
          skipped.folders += 1;
          continue;
        }
        if (isIgnored(here, rel, true)) {
          skipped.ignored += 1;
          continue;
        }
        await visit(rel, here);
        continue;
      }
      if (!entry.isFile()) continue;
      if (SKIP_FILES.has(entry.name)) {
        skipped.lock += 1;
        continue;
      }
      const dot = entry.name.lastIndexOf('.');
      const ext = dot > 0 ? entry.name.slice(dot + 1).toLowerCase() : '';
      if (BINARY_EXT.has(ext)) {
        skipped.binary += 1;
        continue;
      }
      if (/\.min\.(js|css|mjs)$/i.test(entry.name) || /[.-]bundle\.js$/i.test(entry.name)) {
        skipped.minified += 1;
        continue;
      }
      if (isIgnored(here, rel, false)) {
        skipped.ignored += 1;
        continue;
      }
      let info;
      try {
        info = await lstat(join(base, rel));
      } catch {
        skipped.unreadable += 1;
        continue;
      }
      if (!info.isFile()) continue;
      if (info.size > limits.maxFileBytes) {
        skipped.large += 1;
        continue;
      }
      if (files.length >= limits.maxFiles) {
        truncated = 'files';
        return;
      }
      if (total + info.size > limits.maxTotalBytes) {
        truncated = 'bytes';
        return;
      }
      total += info.size;
      files.push({ rel, size: info.size, mtimeMs: Math.round(info.mtimeMs) });
    }
  }

  await visit('', [{ base: '', rules: rootRules }]);
  return { files, skipped, truncated };
}
