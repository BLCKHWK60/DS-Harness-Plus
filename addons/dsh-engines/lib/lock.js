/**
 * The lock an outside engine runs in (the macOS sandbox). Whatever the engine's own settings and
 * prompts say, it can change files only in its copy of the project, in its own settings folders
 * and in the system's temporary folders. It cannot read the rest of the user's home.
 * It can use the network: it has to reach its model, and the lock cannot tell one site from another.
 */
import { homedir } from 'node:os';

const q = (path) => `"${String(path).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * @param {object} input - `work` (the engine's copy of the project), `own` (the engine's own folders, read and write),
 *   `readable` (more folders it may read, such as where its program is), `home` (the user's home; for tests).
 * @returns {string} the profile for sandbox-exec.
 */
export function lockProfile({ work, own = [], readable = [], home = homedir() }) {
  const list = (paths) => paths.filter(Boolean).map((path) => `(subpath ${q(path)})`).join(' ');
  return [
    '(version 1)',
    '(allow default)',
    `(deny file-read-data (subpath ${q(home)}) (subpath "/Volumes"))`,
    `(allow file-read-data ${list([work, ...own, ...readable])})`,
    // Looking at a folder's name on the way to an allowed one is not reading its content.
    `(allow file-read-metadata (subpath ${q(home)}))`,
    '(deny file-write*)',
    `(allow file-write* ${list([work, ...own])} (subpath "/private/tmp") (subpath "/private/var/folders") (subpath "/dev"))`,
  ].join('\n');
}
