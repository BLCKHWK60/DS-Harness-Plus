/**
 * The files of a conversation's folder: which ones Data mode can use, and making sure a path the
 * model names really is inside that folder.
 */
import { execFile } from 'node:child_process';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { TABLE_KINDS, TEXT_ENDINGS, tableKind } from './tables.js';

export const LIST_MAX = 300;
export const DEPTH_MAX = 5;
export const TEXT_CHARS = 8000;
const SKIP = new Set(['node_modules', '.git', '__pycache__', '.venv', 'venv', 'dist', 'build', '.next', '.cache']);

/**
 * A path the model named, as a real file inside the folder.
 * @param {string} root - the conversation's folder.
 * @param {unknown} named - a path, relative to the folder or absolute.
 * @returns {{path: string, shown: string}} the real path, and the path as shown (relative to the folder).
 */
export function inside(root, named) {
  if (!root) throw new Error('This conversation has no folder. Start a conversation in the folder that holds your data (pick the folder on the start page).');
  const text = String(named ?? '').trim();
  if (!text) throw new Error('Name a file.');
  const base = realpathSync(root);
  let path;
  try {
    path = realpathSync(isAbsolute(text) ? text : resolve(base, text));
  } catch {
    throw new Error(`There is no file "${text}" in this conversation's folder. Use data_files to see what is there.`);
  }
  if (path !== base && !path.startsWith(base + sep)) throw new Error(`"${text}" is outside this conversation's folder. Data mode only reads files inside it.`);
  return { path, shown: relative(base, path) || '.' };
}

/**
 * What a file is to Data mode.
 * @param {string} path - the file.
 * @returns {'table' | 'pdf' | 'text' | undefined} table files can be queried; PDFs and text can be read.
 */
export function useOf(path) {
  if (tableKind(path)) return 'table';
  const ending = extname(String(path)).toLowerCase();
  if (ending === '.pdf') return 'pdf';
  return TEXT_ENDINGS.includes(ending) ? 'text' : undefined;
}

/**
 * A file's size and change time as one short text: it changes when the file does.
 * @param {string} path - the file.
 * @returns {string} the fingerprint.
 */
export function print(path) {
  const stat = statSync(path);
  return `${stat.size}-${Math.round(stat.mtimeMs)}`;
}

const sizeText = (bytes) => (bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 102.4) / 10} KB` : `${Math.round(bytes / 1024 / 102.4) / 10} MB`);

/**
 * The data files in a folder and its subfolders.
 * @param {string} root - the conversation's folder.
 * @param {string} [under] - only this subfolder.
 * @returns {{files: {file: string, use: string, size: string, changed: string}[], more: boolean}} the files, newest first.
 */
export function listFiles(root, under = '') {
  const base = realpathSync(root);
  const start = under ? inside(root, under).path : base;
  const found = [];
  let more = false;
  const walk = (folder, depth) => {
    let entries;
    try {
      entries = readdirSync(folder, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        if (depth < DEPTH_MAX) walk(path, depth + 1);
      } else if (entry.isFile()) {
        const use = useOf(path);
        if (!use) continue;
        if (found.length >= LIST_MAX * 4) {
          more = true;
          return;
        }
        try {
          const stat = statSync(path);
          found.push({ file: relative(base, path), use, bytes: stat.size, at: stat.mtimeMs });
        } catch {
          /* gone meanwhile */
        }
      }
    }
  };
  walk(start, 0);
  found.sort((a, b) => b.at - a.at);
  if (found.length > LIST_MAX) more = true;
  return { files: found.slice(0, LIST_MAX).map((entry) => ({ file: entry.file, use: entry.use, size: sizeText(entry.bytes), changed: new Date(entry.at).toISOString().slice(0, 16).replace('T', ' ') })), more };
}

/** macOS's own document converter; replaceable by tests. */
export const hooks = {
  /**
   * @param {string} path - a Word, RTF, OpenDocument or HTML file.
   * @returns {Promise<string>} its text.
   */
  convert(path) {
    return new Promise((done, fail) => {
      execFile('/usr/bin/textutil', ['-convert', 'txt', '-stdout', path], { timeout: 60_000, maxBuffer: 256 * 1024 * 1024 }, (error, stdout) => (error ? fail(new Error('macOS could not convert this document')) : done(String(stdout))));
    });
  },
};

/**
 * A stretch of a text document.
 * @param {string} path - the file.
 * @param {number} [from] - the character to start at.
 * @returns {Promise<{text: string, from: number, to: number, length: number}>} the stretch and where it sits.
 */
export async function readText(path, from = 0) {
  const ending = extname(path).toLowerCase();
  if (statSync(path).size > 50 * 1024 * 1024) throw new Error('it is larger than 50 MB');
  const whole = ['.docx', '.doc', '.rtf', '.odt', '.html', '.htm'].includes(ending) ? await hooks.convert(path) : readFileSync(path, 'utf8');
  const tidy = whole.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\n{3,}/g, '\n\n');
  const start = Math.max(0, Math.min(tidy.length, Math.floor(Number(from)) || 0));
  return { text: tidy.slice(start, start + TEXT_CHARS), from: start, to: Math.min(tidy.length, start + TEXT_CHARS), length: tidy.length };
}

/** Endings Data mode reads, for the settings page. */
export const READS = { tables: Object.values(TABLE_KINDS).flat(), text: TEXT_ENDINGS, pdf: ['.pdf'] };
