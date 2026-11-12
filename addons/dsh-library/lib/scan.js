/**
 * Walking a Library folder: which documents are there now, and what changed since last time.
 * Kept apart from the plugin so it can be tested without the app.
 */
import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_FILE_BYTES, MAX_TEXT_BYTES, kindOf } from './extract.js';

/** Most documents taken from one folder, and how deep the walk goes. */
export const FILES_MAX = 20000;
export const DEPTH_MAX = 12;

/** Folders that are programs or libraries, not documents. */
const SKIP_DIRS = new Set(['node_modules', '__pycache__', 'venv']);
const SKIP_ENDINGS = ['.app', '.photoslibrary', '.bundle', '.framework', '.xcodeproj', '.git'];

/**
 * The documents in a folder and its subfolders.
 * Hidden files and folders, links, programs and files that are too big are left out.
 * @param {string} folder - where to start.
 * @returns {{files: {path: string, mtime: number, size: number, kind: string}[], full: boolean, missing: boolean}} what was found; `full` when the limit was reached.
 */
export function walk(folder) {
  const files = [];
  let full = false;
  const visit = (dir, depth) => {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names.sort()) {
      if (full) return;
      if (name.startsWith('.') || name.startsWith('~$')) continue;
      const path = join(dir, name);
      let stat;
      try {
        stat = lstatSync(path);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      if (stat.isDirectory()) {
        if (depth >= DEPTH_MAX || SKIP_DIRS.has(name) || SKIP_ENDINGS.some((ending) => name.toLowerCase().endsWith(ending))) continue;
        visit(path, depth + 1);
        continue;
      }
      if (!stat.isFile()) continue;
      const kind = kindOf(path);
      if (!kind || stat.size === 0) continue;
      if (stat.size > (kind === 'text' ? MAX_TEXT_BYTES : MAX_FILE_BYTES)) continue;
      if (files.length >= FILES_MAX) {
        full = true;
        return;
      }
      files.push({ path, mtime: Math.round(stat.mtimeMs), size: stat.size, kind });
    }
  };
  let missing = false;
  try {
    missing = !lstatSync(folder).isDirectory();
  } catch {
    missing = true;
  }
  if (!missing) visit(folder, 0);
  return { files, full, missing };
}

/**
 * What to do so the index matches the folder.
 * @param {Map<string, {mtime: number, size: number}>} known - what is indexed.
 * @param {{path: string, mtime: number, size: number}[]} found - what is there now.
 * @returns {{add: object[], remove: string[]}} documents to read (new or changed) and paths to forget.
 */
export function plan(known, found) {
  const present = new Set();
  const add = [];
  for (const file of found) {
    present.add(file.path);
    const old = known.get(file.path);
    if (!old || old.mtime !== file.mtime || old.size !== file.size) add.push(file);
  }
  const remove = [...known.keys()].filter((path) => !present.has(path));
  return { add, remove };
}
