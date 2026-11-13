/**
 * Checkpoints: copies of the conversation's folder that the user can go back to. They are kept
 * with git, in a store of its own inside the folder (`.dsh-mission/checkpoints.git`). The
 * project's own git repository, when it has one, is never touched, apart from one line in its
 * local, uncommitted ignore list so the store does not show up as a change.
 *
 * What the project itself ignores (.gitignore) is not kept: build output, node_modules and the
 * like are neither copied nor put back.
 */
import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OWN_FOLDER } from './paths.js';

export const GIT_CANDIDATES = ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'];
/** Never kept, whatever the project says. */
const ALWAYS_OUT = [`/${OWN_FOLDER}/`, 'node_modules/', '.venv/', 'venv/', '__pycache__/', '.DS_Store'];
const LABEL_MAX = 120;

/**
 * @param {string} root - the conversation's folder.
 * @param {object} [hooks] - for tests.
 * @returns {object} taking, listing and going back to checkpoints.
 */
export function openCheckpoints(root, hooks = {}) {
  const store = join(root, OWN_FOLDER, 'checkpoints.git');
  const git = hooks.git ?? GIT_CANDIDATES.find((path) => existsSync(path));
  let ready;
  // One git command at a time: two at once would fight over the store's lock.
  let queue = Promise.resolve();

  const run = (args, { input, allowFail = false } = {}) =>
    new Promise((resolve, reject) => {
      const child = execFile(git, ['-c', 'core.hooksPath=/dev/null', '-c', 'gc.auto=0', '-c', 'core.fsmonitor=false', ...args], {
        cwd: root,
        timeout: 120_000,
        maxBuffer: 32 * 1024 * 1024,
        env: { PATH: '/usr/bin:/bin:/opt/homebrew/bin', HOME: join(root, OWN_FOLDER), GIT_DIR: store, GIT_WORK_TREE: root, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0', LANG: 'C', GIT_AUTHOR_NAME: 'Mission', GIT_AUTHOR_EMAIL: 'mission@localhost', GIT_COMMITTER_NAME: 'Mission', GIT_COMMITTER_EMAIL: 'mission@localhost' },
      }, (error, stdout, stderr) => {
        if (error && !allowFail) reject(new Error(`checkpoint store: ${String(stderr || error.message).trim().slice(0, 300)}`));
        else resolve({ ok: !error, out: String(stdout ?? '') });
      });
      if (input !== undefined) child.stdin?.end(input);
    });
  const serial = (work) => {
    const next = queue.then(work, work);
    queue = next.catch(() => {});
    return next;
  };

  const prepare = async () => {
    if (!git) throw new Error('git was not found on this Mac, so checkpoints cannot be kept. Install Apple\'s command line tools (xcode-select --install).');
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error('the conversation\'s folder is not there');
    if (!existsSync(join(store, 'HEAD'))) {
      mkdirSync(join(root, OWN_FOLDER), { recursive: true });
      await run(['init', '--quiet', '--initial-branch=checkpoints']);
      writeFileSync(join(root, OWN_FOLDER, 'README.txt'), 'This folder holds the checkpoints that DeepSeek Harness Plus takes of this folder while a Mission mode is on.\nYou can go back to one with /mission back <number> in the conversation.\nDeleting this folder deletes the checkpoints and nothing else.\n');
    }
    mkdirSync(join(store, 'info'), { recursive: true });
    writeFileSync(join(store, 'info', 'exclude'), `${ALWAYS_OUT.join('\n')}\n`);
    // Keep the store out of the project's own git status, without touching a file the project shares.
    try {
      const own = join(root, '.git', 'info');
      if (existsSync(join(root, '.git', 'HEAD'))) {
        mkdirSync(own, { recursive: true });
        const file = join(own, 'exclude');
        const now = existsSync(file) ? readFileSync(file, 'utf8') : '';
        if (!now.split('\n').some((line) => line.trim() === `/${OWN_FOLDER}/`)) appendFileSync(file, `${now && !now.endsWith('\n') ? '\n' : ''}/${OWN_FOLDER}/\n`);
      }
    } catch {
      /* a convenience only */
    }
  };
  const ensure = () => {
    ready ??= prepare().catch((error) => {
      ready = undefined;
      throw error;
    });
    return ready;
  };
  const head = async () => {
    const found = await run(['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
    return found.ok ? found.out.trim() : '';
  };
  const count = async () => Number((await run(['rev-list', '--count', 'HEAD'], { allowFail: true })).out.trim() || 0);
  const clean = (label) => String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX) || 'Checkpoint';

  const takeNow = async (label) => {
    await ensure();
    await run(['add', '-A', '--', '.']);
    const before = await head();
    if (before) {
      // Nothing changed since the last one: that one stands for this moment too.
      const same = await run(['diff', '--cached', '--quiet', 'HEAD'], { allowFail: true });
      if (same.ok) return { id: before, number: await count(), fresh: false };
    }
    await run(['commit', '--quiet', '--allow-empty', '--no-verify', '-m', clean(label)]);
    return { id: await head(), number: await count(), fresh: true };
  };

  return {
    available: Boolean(git),
    store,
    /**
     * Take a checkpoint of the folder as it is now.
     * @param {string} label - what it is taken before or after.
     * @returns {Promise<{id: string, number: number, fresh: boolean}>} the checkpoint; `fresh` is false when nothing changed since the last one.
     */
    take: (label) => serial(() => takeNow(label)),
    /**
     * What changed in the folder since a checkpoint.
     * @param {string} id - the checkpoint.
     * @returns {Promise<{changed: string[], deleted: string[], added: string[]}>} paths relative to the folder.
     */
    since: (id) => serial(async () => {
      await ensure();
      await run(['add', '-A', '--', '.']);
      const out = (await run(['diff', '--cached', '--name-status', '--no-renames', '-z', id])).out.split('\0');
      const result = { changed: [], deleted: [], added: [] };
      for (let index = 0; index + 1 < out.length; index += 2) {
        const [status, file] = [out[index], out[index + 1]];
        if (status === 'M' || status === 'T') result.changed.push(file);
        else if (status === 'D') result.deleted.push(file);
        else if (status === 'A') result.added.push(file);
      }
      return result;
    }),
    /**
     * Put single files back as they were at a checkpoint.
     * @param {string} id - the checkpoint.
     * @param {string[]} files - paths relative to the folder.
     * @returns {Promise<void>}
     */
    putBack: (id, files) => serial(async () => {
      if (files.length === 0) return;
      await ensure();
      await run(['checkout', id, '--pathspec-from-file=-', '--pathspec-file-nul'], { input: files.join('\0') });
    }),
    /**
     * The checkpoints, newest first.
     * @param {number} [max] - most returned.
     * @returns {Promise<{number: number, id: string, at: number, label: string}[]>} the list.
     */
    list: (max = 30) => serial(async () => {
      await ensure();
      const total = await count();
      if (total === 0) return [];
      const out = (await run(['log', `--max-count=${max}`, '--format=%H%x1f%ct%x1f%s'])).out.trim().split('\n').filter(Boolean);
      return out.map((line, index) => {
        const [id, at, label] = line.split('\x1f');
        return { number: total - index, id, at: Number(at) * 1000, label };
      });
    }),
    /**
     * Put the whole folder back as it was at a checkpoint. The state before going back is kept as
     * a checkpoint of its own, so going back can itself be undone. Files the project ignores are
     * left as they are.
     * @param {number} number - the checkpoint's number, as `list` gives it.
     * @returns {Promise<{number: number, label: string, saved: number, now: number}>} what was restored, and the numbers of the two new checkpoints.
     */
    back: (number) => serial(async () => {
      await ensure();
      const total = await count();
      if (!Number.isInteger(number) || number < 1 || number > total) throw new Error(`There is no checkpoint ${number}. They run from 1 to ${total}.`);
      const target = (await run(['rev-parse', `HEAD~${total - number}`])).out.trim();
      const label = (await run(['log', '-1', '--format=%s', target])).out.trim();
      const saved = await takeNow(`Before going back to checkpoint ${number}`);
      const tip = await head();
      // The folder becomes the old state; the list of checkpoints stays whole and grows by one.
      await run(['reset', '--hard', '--quiet', target]);
      await run(['reset', '--soft', '--quiet', tip]);
      await run(['commit', '--quiet', '--allow-empty', '--no-verify', '-m', clean(`Went back to checkpoint ${number}: ${label}`)]);
      return { number, label, saved: saved.number, now: await count() };
    }),
  };
}
