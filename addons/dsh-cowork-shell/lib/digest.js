/**
 * A digest of a project's folder for the model that writes its instructions: the list of files,
 * and the start of the text files among them. The digest is built here, by reading only; the
 * model gets this text and no tools, so it cannot change or read anything itself.
 *
 * What never goes in, whatever the user chose: files that look like secrets (keys, passwords,
 * `.env`), hidden folders, dependency and build folders, and anything that is not text.
 */
import { createHash } from 'node:crypto';
import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, sep } from 'node:path';

export const LIMITS = { files: 400, listed: 250, excerpts: 40, perFile: 2500, total: 36000, guide: 6000, depth: 5 };
const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'data-output', 'dist', 'build', 'out', 'target', 'vendor', 'venv', 'coverage']);
const TEXT = new Set(['.md', '.markdown', '.txt', '.rst', '.org', '.csv', '.tsv', '.json', '.jsonl', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.xml', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.rb', '.go', '.rs', '.java', '.kt', '.swift', '.c', '.h', '.cpp', '.hpp', '.cs', '.php', '.sh', '.zsh', '.sql', '.r', '.tex', '.bib', '.srt', '.vtt', '.log', '.gradle', '.lua', '.pl', '.dart', '.vue', '.svelte', '']);
const SECRET = [/^\.env/i, /\.(pem|key|p12|pfx|kdbx|keystore|jks|asc|gpg)$/i, /^id_(rsa|dsa|ecdsa|ed25519)/i, /(secret|credential|password|passwd|token|apikey|api_key|private[-_]?key)/i, /^\.npmrc$/i, /^\.netrc$/i, /\.(sqlite|db)$/i];
/** The files the app itself reads as instructions in every tab. */
const GUIDES = ['AGENTS.md', 'CLAUDE.md'];

/** @returns {boolean} whether a file's name says it may hold a secret. */
export const looksSecret = (name) => SECRET.some((pattern) => pattern.test(name));

const startOf = (path, max) => {
  const buffer = Buffer.alloc(max * 4);
  let handle;
  try {
    handle = openSync(path, 'r');
    const read = readSync(handle, buffer, 0, buffer.length, 0);
    const bytes = buffer.subarray(0, read);
    // A zero byte means it is not text, whatever its name says.
    if (bytes.includes(0)) return undefined;
    return bytes.toString('utf8').replace(/�+$/, '').replace(/\r/g, '').slice(0, max);
  } catch {
    return undefined;
  } finally {
    if (handle !== undefined) closeSync(handle);
  }
};

/**
 * Walk the folder and say what is there.
 * @param {string} root - the project's folder, in its real spelling.
 * @returns {{files: {name: string, size: number, modified: number, secret: boolean, text: boolean}[], more: boolean}} the files, newest first.
 */
export function scan(root) {
  const files = [];
  let more = false;
  const walk = (dir, depth) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const guide = GUIDES.includes(entry.name);
      if ((entry.name.startsWith('.') && !/^\.env/i.test(entry.name)) && !guide) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && depth < LIMITS.depth) walk(full, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      if (files.length >= LIMITS.files) {
        more = true;
        return;
      }
      try {
        const info = statSync(full);
        const name = relative(root, full).split(sep).join('/');
        files.push({ name, size: info.size, modified: info.mtimeMs, secret: looksSecret(entry.name), text: TEXT.has(extname(entry.name).toLowerCase()) });
      } catch {
        /* gone in the meantime */
      }
    }
  };
  walk(root, 0);
  files.sort((a, b) => b.modified - a.modified);
  return { files, more };
}

/**
 * A short mark of what the folder holds, to tell later whether it changed.
 * @param {{name: string, size: number}[]} files - the scanned files.
 * @returns {{count: number, mark: string, names: string[]}} the mark, and the names for comparing.
 */
export function fingerprint(files) {
  const names = files.map((file) => file.name).sort();
  const mark = createHash('sha256').update(files.map((file) => `${file.name}\0${file.size}`).sort().join('\n')).digest('hex').slice(0, 16);
  return { count: files.length, mark, names: names.slice(0, 1000) };
}

/**
 * How much the folder moved since a mark was taken.
 * @param {{count: number, mark: string, names: string[]} | undefined} before - the earlier mark.
 * @param {{count: number, mark: string, names: string[]}} now - the folder now.
 * @returns {{changed: boolean, much: boolean, added: number, removed: number}} `much` when a regeneration is worth offering.
 */
export function drift(before, now) {
  if (!before || before.mark === now.mark) return { changed: false, much: false, added: 0, removed: 0 };
  const old = new Set(before.names ?? []);
  const cur = new Set(now.names);
  const added = now.names.filter((name) => !old.has(name)).length;
  const removed = (before.names ?? []).filter((name) => !cur.has(name)).length;
  // A few files more or less is everyday work; a fifth of the folder, or five files, is a different folder.
  const much = added + removed >= Math.max(5, Math.ceil(Math.max(before.count, now.count) * 0.2));
  return { changed: true, much, added, removed };
}

/**
 * Build what would be sent to the model.
 * @param {string} root - the project's folder, in its real spelling.
 * @param {{contents?: boolean}} [options] - `contents: false` sends file names only.
 * @returns {{text: string, summary: object, mark: object}} the digest, a summary for the user to see first, and the folder's mark.
 */
export function buildDigest(root, { contents = true } = {}) {
  const { files, more } = scan(root);
  const secrets = files.filter((file) => file.secret);
  const open = files.filter((file) => !file.secret);
  const guides = open.filter((file) => GUIDES.includes(file.name));
  const listed = open.slice(0, LIMITS.listed);
  const lines = [];
  lines.push(open.length === 0 ? 'The folder is empty.' : `The folder holds ${open.length}${more ? ' or more' : ''} file${open.length === 1 ? '' : 's'}. Newest first:`);
  for (const file of listed) lines.push(`- ${file.name} (${file.size.toLocaleString('en-US')} bytes)`);
  if (open.length > listed.length) lines.push(`… and ${open.length - listed.length} more.`);

  const included = [];
  let used = lines.join('\n').length;
  const add = (file, max, label) => {
    const text = startOf(join(root, file.name), max);
    if (text === undefined || !text.trim()) return;
    const cut = file.size > text.length * 1.05;
    const block = `\n--- ${label}${file.name}${cut ? ' (the start only)' : ''} ---\n${text.trimEnd()}\n`;
    if (used + block.length > LIMITS.total) return;
    lines.push(block);
    used += block.length;
    included.push({ name: file.name, chars: text.length, cut });
  };
  // The instruction files the app already reads go in whole (to a limit) even for "names only":
  // the new instructions must fit beside them, and they are instructions, not the user's data.
  for (const file of guides) add(file, LIMITS.guide, 'Existing instruction file: ');
  if (contents) {
    const rank = (file) => (/^readme/i.test(file.name) ? 0 : /(^|\/)(package\.json|pyproject\.toml|outline\.md|plan\.md|progress\.md|style\.md|bible\.md)$/i.test(file.name) ? 1 : 2);
    const candidates = open.filter((file) => file.text && !GUIDES.includes(file.name) && file.size > 0).sort((a, b) => rank(a) - rank(b) || b.modified - a.modified);
    for (const file of candidates) {
      if (included.length >= LIMITS.excerpts) break;
      add(file, LIMITS.perFile, '');
    }
  }
  return {
    text: lines.join('\n'),
    summary: {
      files: open.length,
      more,
      contents,
      included,
      chars: used,
      guides: guides.map((file) => file.name),
      // Named so the user sees they were found and left out.
      secrets: secrets.map((file) => file.name).slice(0, 30),
      names: listed.map((file) => file.name),
    },
    mark: fingerprint(open),
  };
}
