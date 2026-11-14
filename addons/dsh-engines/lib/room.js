/**
 * The place an engine works in for one conversation: a copy of the project (`work`) and a copy of
 * how the project looked when the engine last started from it (`base`). While changes are waiting
 * to be put into the project, the copy is kept, so a follow-up message carries on from them. Once
 * nothing is waiting, the copy is made anew from the project, so it picks up what the user changed.
 */
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pending } from './apply.js';
import { copyProject } from './copy.js';

/**
 * @param {string} root - the folder for this conversation's copies.
 * @param {string} project - the project.
 * @returns {Promise<{work: string, base: string, undo: string, fresh: boolean}>} `fresh` says the copy was made anew.
 */
export async function prepareRoom(root, project) {
  const work = join(root, 'work');
  const base = join(root, 'base');
  const undo = join(root, 'undo');
  const keep = existsSync(work) && existsSync(base) && pending(base, work).length > 0;
  if (!keep) {
    rmSync(work, { recursive: true, force: true });
    rmSync(base, { recursive: true, force: true });
    await copyProject(project, base);
    await copyProject(project, work);
  }
  return { work, base, undo, fresh: !keep };
}

/** Drop what is waiting: the copies go, and the next message starts from the project as it is. */
export function clearRoom(root) {
  rmSync(join(root, 'work'), { recursive: true, force: true });
  rmSync(join(root, 'base'), { recursive: true, force: true });
}
