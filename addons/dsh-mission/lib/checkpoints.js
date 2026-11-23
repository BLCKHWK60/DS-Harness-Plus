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
import { appendFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { OWN_FOLDER } from './paths.js';

export const GIT_CANDIDATES = ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'];
/** Never kept, whatever the project says. */
const ALWAYS_OUT = [`/${OWN_FOLDER}/`, 'node_modules/', '.venv/', 'venv/', '__pycache__/', '.DS_Store'];
const LABEL_MAX = 120;
/** A folder with more files than this, or more bytes (2 GB), is not copied. */
export const MAX_FILES = 20_000;
export const MAX_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Whether a folder is a home, personal-collection or system folder: not one project. The same rule as
 * Code map's (dsh-code-map/lib/scan.js), kept here because add-ons cannot import each other. iCloud's
 * and the cloud drives' own top folders count too, since the store would be copied to the cloud.
 * @param {string} root - absolute folder.
 * @param {string} [homeDir] - the home folder (for tests).
 * @returns {boolean} true when checkpoints must not be kept of it.
 */
export function tooBroad(root, homeDir = homedir()) {
  const path = resolve(root);
  const home = resolve(homeDir);
  if (path === sep || path === home) return true;
  if (home.startsWith(`${path}${sep}`)) return true; // a parent of the home folder
  // The personal folders, the cloud drives' own top folders (the store would be copied to the cloud) and a drive's top folder.
  const tops = ['Documents', 'Desktop', 'Downloads', 'Pictures', 'Music', 'Movies', 'Library', 'Library/Mobile Documents', 'Library/Mobile Documents/com~apple~CloudDocs', 'Library/CloudStorage', 'Dropbox', 'Google Drive', 'GoogleDrive', 'OneDrive', 'Dropbox (Personal)', 'Dropbox (Business)'];
  if (tops.some((name) => path === resolve(home, name))) return true;
  // One level down in CloudStorage is a whole drive (GoogleDrive-name, OneDrive-name, Dropbox, iCloud...). Its own top folder, not a project inside.
  const storage = resolve(home, 'Library/CloudStorage');
  if (path.startsWith(`${storage}${sep}`) && !path.slice(storage.length + 1).includes(sep)) return true;
  // An external disk's top folder (/Volumes/Name). A folder inside one is a project like any other.
  if (path === '/Volumes' || (path.startsWith('/Volumes/') && !path.slice('/Volumes/'.length).includes(sep))) return true;
  return ['/System', '/Library', '/usr', '/bin', '/sbin', '/etc', '/var', '/private', '/Applications', '/Volumes'].some((system) => path === system);
}

/** A reason checkpoints are not kept of a folder. It is said to the user, so it is plain words. */
class Refusal extends Error {}
const NO_POINT = (reason) => ({ id: '', number: 0, fresh: false, skipped: true, reason });

/**
 * Settings git may never take from the store (or anywhere else): each could run a program outside a
 * check's fence the next time the host runs git (a filter, an external diff, a text converter, a signer,
 * a file monitor, hooks, an alias). The store's config holds only what `git init` writes.
 */
const STORE_KEYS = new Set(['core.repositoryformatversion', 'core.filemode', 'core.bare', 'core.logallrefupdates', 'core.ignorecase', 'core.precomposeunicode', 'core.symlinks']);
/** Every git call: no system or user config, no attributes file, no hooks, no signing, no file monitor, no external diff. */
export const GIT_SAFE = ['-c', 'core.hooksPath=/dev/null', '-c', 'gc.auto=0', '-c', 'core.fsmonitor=false', '-c', 'core.attributesFile=/dev/null', '-c', 'commit.gpgSign=false', '-c', 'diff.external=', '-c', 'core.pager=cat'];
/** Diffs: never an external diff tool or a text converter. */
const DIFF_SAFE = ['--no-ext-diff', '--no-textconv'];

/**
 * What in a store's config is not one of git init's own settings (a planted filter, diff, signer…).
 * @param {string} text - the store's config file.
 * @param {string[]} [worktrees] - the folder's own spellings: `core.worktree` (git init writes it) may name only these.
 * @returns {string[]} the settings found that are not allowed ('' list: clean).
 */
export function unsafeStoreConfig(text, worktrees = []) {
  const found = [];
  let section = '';
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.replace(/^\s+|\s+$/g, '');
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    const head = /^\[([A-Za-z0-9.-]+)(?:\s+"[^"]*")?\]\s*(?:[#;].*)?$/.exec(line);
    if (head) {
      section = head[1].toLowerCase();
      if (section !== 'core') found.push(`[${line.slice(1, -1).slice(0, 60)}]`);
      continue;
    }
    const key = /^([A-Za-z][A-Za-z0-9-]*)\s*(?:=\s*(.*))?$/.exec(line);
    const name = key ? `${section}.${key[1].toLowerCase()}` : '';
    const value = String(key?.[2] ?? '').replace(/^"|"$/g, '');
    if (name === 'core.worktree' && worktrees.includes(value)) continue;
    if (!key || !STORE_KEYS.has(name)) found.push(name || line.slice(0, 60));
  }
  return found;
}

/**
 * @param {string} root - the conversation's folder.
 * @param {object} [hooks] - for tests.
 * @returns {object} taking, listing and going back to checkpoints.
 */
export function openCheckpoints(root, hooks = {}) {
  const store = join(root, OWN_FOLDER, 'checkpoints.git');
  const git = hooks.git ?? GIT_CANDIDATES.find((path) => existsSync(path));
  /** Why checkpoints are off for this folder ('' while they are on or not yet known). */
  let refusal = '';
  /** A folder now judged too broad that still has old checkpoints: they can be read and gone back to, none is added. */
  let readOnly = false;
  const homeDir = hooks.homeDir ?? homedir();
  /**
   * Apple's /usr/bin/git is only a stand-in until the Command Line Tools are installed; running it
   * then opens an install window. `xcode-select -p` says whether they are there without that.
   */
  const gitUsable = () =>
    new Promise((resolveUsable) => {
      if (!git) return resolveUsable(false);
      if (git !== '/usr/bin/git') return resolveUsable(true);
      execFile(hooks.xcodeSelect ?? '/usr/bin/xcode-select', ['-p'], { timeout: 10_000 }, (error) => resolveUsable(!error));
    });
  // git's HOME: an empty folder of the host's own, never inside the conversation's folder.
  let gitHome = hooks.gitHome ?? '';
  const homeOf = () => {
    if (!gitHome) gitHome = mkdtempSync(join(tmpdir(), 'mission-git-home-'));
    mkdirSync(gitHome, { recursive: true, mode: 0o700 });
    return gitHome;
  };
  /** Refuse to run git while the store's config holds anything git init did not write there. */
  const checkStore = () => {
    let text = '';
    try {
      text = readFileSync(join(store, 'config'), 'utf8');
    } catch {
      return;
    }
    let realRoot = root;
    try {
      realRoot = realpathSync(root);
    } catch {
      realRoot = root;
    }
    const bad = unsafeStoreConfig(text, [root, realRoot]);
    if (bad.length > 0) throw new Error(`checkpoint store: its settings were changed (${bad.slice(0, 4).join(', ')}), which could run a program; nothing was run. Delete the folder ${OWN_FOLDER} to start the checkpoints afresh.`);
  };
  let ready;
  // One git command at a time: two at once would fight over the store's lock.
  let queue = Promise.resolve();

  const run = (args, { input, allowFail = false } = {}) =>
    new Promise((resolve, reject) => {
      try {
        checkStore();
      } catch (error) {
        reject(error);
        return;
      }
      const home = homeOf();
      const safeArgs = args[0] === 'diff' ? ['diff', ...DIFF_SAFE, ...args.slice(1)] : args;
      const child = execFile(git, [...GIT_SAFE, ...safeArgs], {
        cwd: root,
        timeout: 120_000,
        maxBuffer: 32 * 1024 * 1024,
        // A clean environment: no system or user config, HOME an empty folder of the host's own.
        env: { PATH: '/usr/bin:/bin:/opt/homebrew/bin', HOME: home, XDG_CONFIG_HOME: home, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_DIR: store, GIT_WORK_TREE: root, GIT_TERMINAL_PROMPT: '0', GIT_ATTR_NOSYSTEM: '1', LANG: 'C', GIT_AUTHOR_NAME: 'Mission', GIT_AUTHOR_EMAIL: 'mission@localhost', GIT_COMMITTER_NAME: 'Mission', GIT_COMMITTER_EMAIL: 'mission@localhost' },
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

  /** @returns {Promise<string>} what is too big about the folder, '' when it is fine. */
  const sizeProblem = async () => {
    let files;
    try {
      files = (await run(['ls-files', '-z', '--cached', '--others', '--exclude-standard'])).out.split('\0').filter(Boolean);
    } catch {
      return `it holds more than ${(hooks.maxFiles ?? MAX_FILES).toLocaleString('en-US')} files`; // the list itself was too long to read
    }
    const maxFiles = hooks.maxFiles ?? MAX_FILES;
    const maxBytes = hooks.maxBytes ?? MAX_BYTES;
    if (files.length > maxFiles) return `it holds ${files.length.toLocaleString('en-US')} files (the limit is ${maxFiles.toLocaleString('en-US')})`;
    let bytes = 0;
    for (const file of files) {
      try {
        bytes += lstatSync(join(root, file)).size;
      } catch {
        // Gone meanwhile.
      }
      if (bytes > maxBytes) return `it holds more than ${(maxBytes / 1024 ** 3).toFixed(maxBytes >= 1024 ** 3 ? 0 : 3)} GB`;
    }
    return '';
  };

  const prepare = async () => {
    if (!(await gitUsable())) {
      throw new Refusal('Checkpoints are off: this Mac does not have Apple\'s Git command-line tools yet. To get them, open Terminal, run xcode-select --install and let macOS install them, then switch Mission access on again. Everything else works without checkpoints.');
    }
    if (!existsSync(root) || !statSync(root).isDirectory()) throw new Error('the thread\'s folder is not there');
    const hasStore = existsSync(join(store, 'HEAD'));
    if (tooBroad(root, homeDir)) {
      // Checkpoints kept before this rule stay reachable, read only: they can be listed and gone back to, but no new one
      // is taken (that would copy the whole folder).
      if (hasStore) {
        readOnly = true;
        return;
      }
      throw new Refusal('Checkpoints are off for this folder: it is too broad (a home, Documents, Desktop, Downloads, Pictures, Music, Movies, cloud-drive, external-disk or system folder), so copying it would fill the disk and take very long. Open a project folder to get checkpoints. Everything else, including a Mission, works without them.');
    }
    const fresh = !hasStore;
    const madeFolder = !existsSync(join(root, OWN_FOLDER));
    if (fresh) {
      mkdirSync(join(root, OWN_FOLDER), { recursive: true });
      await run(['init', '--quiet', '--initial-branch=checkpoints']);
      writeFileSync(join(root, OWN_FOLDER, 'README.txt'), 'This folder holds the checkpoints that DeepSeek Harness Plus takes of this folder while Mission access is on.\nYou can go back to one with /mission back <number> in the thread.\nDeleting this folder deletes the checkpoints and nothing else.\n');
    }
    mkdirSync(join(store, 'info'), { recursive: true });
    writeFileSync(join(store, 'info', 'exclude'), `${ALWAYS_OUT.join('\n')}\n`);
    // A store with no checkpoint yet is as good as new: count what would be copied (what the project ignores is not).
    if (fresh || (await count()) === 0) {
      const tooMuch = await sizeProblem();
      if (tooMuch) {
        // The store made a moment ago goes too, whether or not the folder around it existed: otherwise the next start would
        // find a store and skip this check, and copy the folder in full.
        rmSync(store, { recursive: true, force: true });
        rmSync(join(root, OWN_FOLDER, 'README.txt'), { force: true });
        if (madeFolder) rmSync(join(root, OWN_FOLDER), { recursive: true, force: true });
        throw new Refusal(`Checkpoints are off for this folder: ${tooMuch}, too much to copy. Open a smaller project folder to get checkpoints. Everything else, including a Mission, works without them.`);
      }
    }
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
  /** Whether checkpoints work for this folder; when not, says why in `refusal`. */
  const usable = async () => {
    if (refusal) return false;
    try {
      await ensure();
      return true;
    } catch (error) {
      if (!(error instanceof Refusal)) throw error;
      refusal = error.message;
      return false;
    }
  };
  const head = async () => {
    const found = await run(['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true });
    return found.ok ? found.out.trim() : '';
  };
  const count = async () => Number((await run(['rev-list', '--count', 'HEAD'], { allowFail: true })).out.trim() || 0);
  const clean = (label) => String(label ?? '').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX) || 'Checkpoint';

  const READ_ONLY_TEXT = 'No new checkpoints are taken here: this folder is too broad to copy. Checkpoints kept earlier can still be listed and gone back to; a change made now cannot be undone.';
  /** Usable for writing a new checkpoint (not a read-only store of an old one). */
  const writable = async () => (await usable()) && !readOnly;

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
     * Why no checkpoints are kept of this folder.
     * @returns {Promise<string>} the reason in plain words; '' when checkpoints work.
     */
    why: () => serial(async () => ((await usable()) ? (readOnly ? READ_ONLY_TEXT : '') : refusal)),
    /**
     * What is known now, without running anything: why no new checkpoint is taken ('' while they are, or not known yet).
     * Judged by what can be told at once (a refusal already found, a folder too broad, no git program), so a conversation's rules can say it from its first turn.
     * @returns {string} the reason in plain words.
     */
    peek: () => {
      if (refusal) return refusal;
      if (readOnly) return READ_ONLY_TEXT;
      if (!git) return 'Checkpoints are off: this Mac does not have Apple\'s Git command-line tools.';
      if (tooBroad(root, homeDir)) return existsSync(join(store, 'HEAD')) ? READ_ONLY_TEXT : 'Checkpoints are off for this folder: it is too broad.';
      return '';
    },
    /**
     * Take a checkpoint of the folder as it is now.
     * @param {string} label - what it is taken before or after.
     * @returns {Promise<{id: string, number: number, fresh: boolean, skipped?: boolean, reason?: string}>} the checkpoint; `fresh` is false when nothing changed since the last one. For a folder that gets no checkpoints it is `{id: '', number: 0, skipped: true, reason}`, never an error.
     */
    take: (label) => serial(async () => ((await writable()) ? takeNow(label) : NO_POINT(readOnly ? READ_ONLY_TEXT : refusal))),
    /**
     * What changed in the folder since a checkpoint.
     * @param {string} id - the checkpoint.
     * @returns {Promise<{changed: string[], deleted: string[], added: string[]}>} paths relative to the folder.
     */
    since: (id) => serial(async () => {
      if (!(await writable())) return { changed: [], deleted: [], added: [] };
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
      if (!(await writable())) return undefined;
      await run(['checkout', id, '--pathspec-from-file=-', '--pathspec-file-nul'], { input: files.join('\0') });
    }),
    /**
     * The files a checkpoint would hold now, as paths relative to the folder.
     * @param {number} [max] - most returned.
     * @returns {Promise<{files: string[], more: boolean}>} the list.
     */
    files: (max = 300) => serial(async () => {
      if (!(await writable())) return { files: [], more: false };
      await run(['add', '-A', '--', '.']);
      const all = (await run(['ls-files', '-z'])).out.split('\0').filter(Boolean);
      return { files: all.slice(0, max), more: all.length > max };
    }),
    /**
     * What changed in the folder since a checkpoint, as a reader would want it: the list of files
     * with line counts, then the changes themselves, cut to a length.
     * @param {string} id - the checkpoint.
     * @param {number} [maxChars] - most characters of changes.
     * @returns {Promise<string>} the text; '' when nothing changed.
     */
    changes: (id, maxChars = 40000) => serial(async () => {
      if (!(await writable())) return '';
      await run(['add', '-A', '--', '.']);
      const stat = (await run(['diff', '--cached', '--stat=120', '--no-renames', id])).out.trim();
      if (!stat) return '';
      const patch = (await run(['diff', '--cached', '--no-renames', '--no-color', '-U2', id])).out;
      return `${stat}\n\n${patch.length > maxChars ? `${patch.slice(0, maxChars)}\n… (the rest of the changes is cut; read the files)` : patch}`;
    }),
    /**
     * The id of a checkpoint by its number.
     * @param {number} number - as `list` gives it.
     * @returns {Promise<string>} the id; '' when there is none.
     */
    idOf: (number) => serial(async () => {
      if (!(await usable())) return '';
      const total = await count();
      if (!Number.isInteger(number) || number < 1 || number > total) return '';
      return (await run(['rev-parse', `HEAD~${total - number}`])).out.trim();
    }),
    /**
     * The checkpoints, newest first.
     * @param {number} [max] - most returned.
     * @returns {Promise<{number: number, id: string, at: number, label: string}[]>} the list.
     */
    list: (max = 30) => serial(async () => {
      if (!(await usable())) return [];
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
      if (!(await usable())) throw new Error(refusal);
      const total = await count();
      if (!Number.isInteger(number) || number < 1 || number > total) throw new Error(`There is no checkpoint ${number}. They run from 1 to ${total}.`);
      const target = (await run(['rev-parse', `HEAD~${total - number}`])).out.trim();
      const label = (await run(['log', '-1', '--format=%s', target])).out.trim();
      if (readOnly) {
        // An old store in a folder now too broad: the files of that checkpoint come back, nothing else is touched, and no
        // checkpoint of the state before is taken (that would copy the whole folder), so this cannot be undone.
        await run(['checkout', target, '--', '.']);
        return { number, label, saved: 0, now: total, readOnly: true };
      }
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
