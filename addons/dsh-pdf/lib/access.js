/**
 * Which PDF files the tools may open. These tools read files themselves, so they
 * keep their own fence: the conversation's folder, folders the owner listed, or,
 * only if the owner switched it on, any PDF on the Mac.
 */
import { realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, relative, resolve, sep } from 'node:path';

export const MAX_PDF_BYTES = 500 * 1024 * 1024;

function inside(root, file) {
  if (!root) return false;
  const rel = relative(root, file);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel) && !rel.split(sep).includes('..'));
}

function real(path) {
  try {
    return realpathSync(path);
  } catch {
    return '';
  }
}

/**
 * @param {string} raw - the path the model gave; may start with `~` or be relative.
 * @param {{cwd?: string, folders?: string[], anywhere?: boolean, home?: string}} rules - where reading is allowed.
 * @returns {{file?: string, error?: string}} the real path of the PDF, or why it was refused.
 */
export function resolvePdf(raw, rules = {}) {
  const home = rules.home ?? homedir();
  let path = typeof raw === 'string' ? raw.trim() : '';
  if (!path || path.includes('\0')) return { error: 'Give the path of a PDF file.' };
  if (path === '~' || path.startsWith('~/')) path = resolve(home, path.slice(2));
  else if (!isAbsolute(path)) {
    if (!rules.cwd) return { error: 'Give the full path of the PDF; this conversation has no folder to look in.' };
    path = resolve(rules.cwd, path);
  }
  if (!/\.pdf$/i.test(path)) return { error: 'Only files that end in .pdf can be read.' };
  const file = real(path);
  if (!file) return { error: `There is no file at ${path}.` };
  let stats;
  try {
    stats = statSync(file);
  } catch {
    return { error: `There is no file at ${path}.` };
  }
  if (!stats.isFile()) return { error: `${path} is not a file.` };
  if (stats.size > MAX_PDF_BYTES) return { error: 'This PDF is larger than 500 MB.' };
  if (!/\.pdf$/i.test(file)) return { error: 'Only files that end in .pdf can be read.' };
  if (rules.anywhere !== true) {
    const roots = [rules.cwd, ...(rules.folders ?? [])]
      .filter((root) => typeof root === 'string' && root.trim() !== '')
      .map((root) => real(root.startsWith('~/') ? resolve(home, root.slice(2)) : root))
      .filter(Boolean);
    if (!roots.some((root) => inside(root, file))) {
      return { error: `${path} is outside this conversation's folder. Copy the PDF into the folder, or allow its folder in Settings → PDF reader.` };
    }
  }
  return { file, size: stats.size, mtime: Math.round(stats.mtimeMs) };
}
