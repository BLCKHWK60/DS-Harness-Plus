/**
 * Copies of a project for a comparison. Each engine works in its own copy, so two engines cannot
 * get in each other's way and neither touches the project itself. One more copy is kept untouched
 * as the starting point, and what an engine changed is the difference between the two.
 *
 * On a Mac's own disk a copy is a "clone": it is made at once and takes no space until a file
 * changes. Where cloning is not possible, an ordinary copy is made.
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const run = (file, args, options = {}) =>
  new Promise((resolve) => {
    execFile(file, args, { maxBuffer: 64 * 1024 * 1024, timeout: 10 * 60_000, ...options }, (error, stdout, stderr) => resolve({ code: error ? (typeof error.code === 'number' ? error.code : 1) : 0, out: String(stdout ?? ''), err: String(stderr ?? '') }));
  });

/**
 * @param {string} project - the project folder.
 * @param {string} target - where the copy goes; must not exist.
 * @returns {Promise<void>}
 */
export async function copyProject(project, target) {
  if (!existsSync(project) || !statSync(project).isDirectory()) throw new Error('The project folder is not there.');
  if (existsSync(target)) throw new Error('The place for the copy is already taken.');
  mkdirSync(join(target, '..'), { recursive: true });
  // -c: clone where the disk can; -R: the whole folder. Falls back to a plain copy on other disks.
  let done = await run('/bin/cp', ['-cR', project, target]);
  if (done.code !== 0) {
    rmSync(target, { recursive: true, force: true });
    done = await run('/bin/cp', ['-R', project, target]);
  }
  if (done.code !== 0) throw new Error(`The project could not be copied: ${done.err.trim().split('\n').pop()?.slice(0, 200) ?? 'unknown reason'}`);
}

/** Folders that hold nothing an engine wrote by hand; left out of the difference. */
const SKIP = ['.git', 'node_modules', '.dsh-mission', '.venv', '__pycache__', '.DS_Store'];

/**
 * What changed between the starting point and an engine's copy.
 * @param {string} base - the untouched copy.
 * @param {string} work - the engine's copy.
 * @param {number} [max] - most characters of the patch kept.
 * @returns {Promise<{patch: string, cut: boolean, files: number, added: number, removed: number}>}
 */
export async function difference(base, work, max = 300_000) {
  const args = ['-ruN', ...SKIP.flatMap((name) => ['-x', name]), base, work];
  const done = await run('/usr/bin/diff', args, { timeout: 120_000 });
  if (done.code > 1) throw new Error(`The copies could not be compared: ${done.err.trim().split('\n').pop()?.slice(0, 200) ?? 'unknown reason'}`);
  // Paths are shown from the project's top, not from where the copies happen to be.
  const text = done.out.split(`${base}/`).join('a/').split(`${work}/`).join('b/').replace(/^diff -ruN .*? a\//gm, 'diff a/');
  let files = 0;
  let added = 0;
  let removed = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('diff a/')) files += 1;
    else if (line.startsWith('+') && !line.startsWith('+++')) added += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) removed += 1;
  }
  return { patch: text.slice(0, max), cut: text.length > max, files, added, removed };
}
