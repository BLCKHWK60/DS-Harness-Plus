/**
 * Split Plus, step 2: one folder, safely (the owner's fixed rule 4, "never two writers on one file").
 *
 * - A pane that changes a file with the app's file tools holds it until its step ends (or 2 minutes, if
 *   the pane stops answering). Another pane that wants the same file waits, and says who has it.
 * - Each pane's reads are remembered (the file's time and size when read). A file changed since a pane
 *   read it is "stale" for that pane: it is told before its next step, and a change it tries to make to
 *   the stale file is refused until it reads the file again.
 * - Shell commands cannot be read in advance: what they changed is found right after (the owner's answer:
 *   catch after, and tell).
 * Pure apart from `stat`, which the tests replace.
 */
import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, normalize, resolve } from 'node:path';

/** The app's file tools that change files, and those that read them. */
export const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'apply_patch', 'str_replace_editor']);
export const READ_TOOLS = new Set(['read', 'read_image']);
/** The tools that run commands (Mission's own list). */
export const COMMAND_TOOLS = new Set(['bash', 'terminal', 'shell', 'pwsh']);
/** A pane that stops answering lets go of its files after this long. */
export const LEASE_MS = 120_000;
/**
 * A command's hold on its folder ends when its step ends, its turn ends or it goes away; this is only
 * the backstop for a pane that stops answering (a build or an approval can take long).
 */
export const COMMAND_MS = 30 * 60_000;
/** At most this many remembered reads per pane (the oldest go first). */
const MAX_READS = 600;

/**
 * A path made absolute against the pane's folder, through its real folder (so /tmp/x and /private/tmp/x,
 * or a folder reached through a link, are one file): the nearest folder that exists is resolved, the rest
 * is kept as written.
 */
function absolute(path, cwd) {
  const text = String(path ?? '').trim();
  if (!text || text.startsWith('~')) return '';
  const full = normalize(isAbsolute(text) ? text : resolve(String(cwd || '/'), text));
  let head = dirname(full);
  const tail = [basename(full)];
  for (let depth = 0; depth < 64; depth += 1) {
    try {
      return join(realpathSync.native(head), ...tail);
    } catch {
      const up = dirname(head);
      if (up === head) break;
      tail.unshift(basename(head));
      head = up;
    }
  }
  return full;
}

/**
 * A path's real path: the path itself resolved when it is there, else its nearest folder that is (so a
 * link anywhere on the way is seen through).
 * @param {string} path - an absolute path.
 * @returns {string} '' for an empty path.
 */
export function realPathOf(path) {
  const text = String(path ?? '').trim();
  if (!text) return '';
  try {
    return realpathSync.native(text);
  } catch {
    return absolute(text, '/');
  }
}

/**
 * The files a tool call will change.
 * @param {string} name - the tool.
 * @param {Record<string, unknown>} args - its arguments.
 * @param {string} cwd - the pane's folder.
 * @returns {string[]} absolute paths.
 */
export function writesOf(name, args, cwd) {
  const input = args && typeof args === 'object' ? args : {};
  if (name === 'write' || name === 'edit' || name === 'multi_edit') return [absolute(input.file_path, cwd)].filter(Boolean);
  if (name === 'str_replace_editor') return input.command === 'view' ? [] : [absolute(input.path, cwd)].filter(Boolean);
  if (name === 'apply_patch') {
    const found = [];
    for (const line of String(input.input ?? input.patch ?? '').split('\n')) {
      const match = /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+?)\s*$/.exec(line);
      if (match) found.push(absolute(match[1], cwd));
    }
    return [...new Set(found.filter(Boolean))];
  }
  return [];
}

/**
 * The files a tool call reads.
 * @returns {string[]} absolute paths.
 */
export function readsOf(name, args, cwd) {
  const input = args && typeof args === 'object' ? args : {};
  if (READ_TOOLS.has(name)) return [absolute(input.file_path ?? input.path, cwd)].filter(Boolean);
  if (name === 'str_replace_editor' && input.command === 'view') return [absolute(input.path, cwd)].filter(Boolean);
  return [];
}

/** Whether a path is a folder or inside it. */
function inside(path, folder) {
  const base = String(folder ?? '').replace(/\/+$/, '');
  return Boolean(base) && (path === base || String(path).startsWith(`${base}/`));
}
/** Whether two folders overlap (one holds the other). */
function overlap(a, b) {
  return inside(a, b) || inside(b, a);
}

/** A file's fingerprint: its time and size, or "none" when it is not there. */
function fingerprint(stat, path) {
  try {
    const info = stat(path);
    return `${Math.round(info.mtimeMs)}:${info.size}`;
  } catch {
    return 'none';
  }
}

/** The last part of a path, for messages. */
export function shortName(path) {
  return String(path ?? '').split('/').filter(Boolean).pop() || String(path ?? '');
}

/**
 * @param {{stat?: (path: string) => {mtimeMs: number, size: number}, now?: () => number, leaseMs?: number, labelOf?: (pane: string) => string}} [options]
 */
export function openFileWatch({ stat = statSync, now = Date.now, leaseMs = LEASE_MS, commandMs = COMMAND_MS, labelOf = () => 'another pane' } = {}) {
  /** path → { pane, by, at }: `by` is the conversation or helper that took it */
  const leases = new Map();
  /** pane → Map(path → fingerprint when read or last changed by the pane itself) */
  const reads = new Map();
  /** pane → Map(path → why) */
  const notices = new Map();
  /** path → pane that last changed it with a file tool */
  const lastBy = new Map();
  /** Waiting panes: pane → { what, holder, kind } */
  const waiting = new Map();
  /** agent → { pane, folder, at }: a guarded command (Mission puts back what it changed) holding its folder */
  const folderHolds = new Map();
  /** agent → { pane, folder, at }: any other command running now (a guarded command waits for these) */
  const commandRuns = new Map();
  /** @type {Set<() => void>} */
  const wakers = new Set();

  const fresh = (lease) => lease && now() - lease.at < leaseMs;
  const freshCommand = (hold) => hold && now() - hold.at < commandMs;
  const readsOfPane = (pane) => {
    let map = reads.get(pane);
    if (!map) {
      map = new Map();
      reads.set(pane, map);
    }
    return map;
  };
  const remember = (pane, path) => {
    const map = readsOfPane(pane);
    map.delete(path);
    map.set(path, fingerprint(stat, path));
    while (map.size > MAX_READS) map.delete(map.keys().next().value);
  };
  const notify = (pane, path, why) => {
    let map = notices.get(pane);
    if (!map) {
      map = new Map();
      notices.set(pane, map);
    }
    map.set(path, why);
  };
  const wake = () => {
    for (const waker of [...wakers]) waker();
  };
  /** Who changed a file, in words, for the pane that is told. */
  const whoChanged = (pane, path) => {
    const by = lastBy.get(path);
    if (by && by !== pane) return `the ${labelOf(by)} pane`;
    return 'a command or a program outside this pane';
  };

  return {
    /** The pane holding a file other than `pane`, if its hold is still fresh. */
    holderOf(path, pane) {
      const lease = leases.get(path);
      if (!lease || lease.pane === pane) return '';
      if (!fresh(lease)) {
        leases.delete(path);
        return '';
      }
      return lease.pane;
    },
    /**
     * What keeps a pane from going on, if anything: another pane changing one of the files, another
     * pane's guarded command in a folder that holds them, or (for a command) another pane's guarded
     * command in an overlapping folder; for a guarded command also any other pane's held file in it.
     * @returns {{what: string, holder: string, kind: 'file'|'command'} | null}
     */
    blockerOf(pane, { paths = [], folder = '', exclusive = false } = {}) {
      for (const [by, hold] of folderHolds) {
        if (!freshCommand(hold)) {
          folderHolds.delete(by);
          continue;
        }
        if (hold.pane === pane) continue;
        const held = hold.folder;
        if (paths.some((path) => inside(path, held)) || (folder && overlap(folder, held))) return { what: shortName(held), path: held, holder: hold.pane, kind: 'command' };
      }
      for (const path of paths) {
        const holder = this.holderOf(path, pane);
        if (holder) return { what: shortName(path), path, holder, kind: 'file' };
      }
      if (folder && exclusive) {
        for (const [path] of leases) {
          const holder = this.holderOf(path, pane);
          if (holder && inside(path, folder)) return { what: shortName(path), path, holder, kind: 'file' };
        }
        // Another pane's command running in this folder (any mode): a guarded command waits for it.
        for (const [by, run] of commandRuns) {
          if (!freshCommand(run)) {
            commandRuns.delete(by);
            continue;
          }
          if (run.pane === pane) continue;
          if (overlap(folder, run.folder)) return { what: shortName(run.folder), path: run.folder, holder: run.pane, kind: 'command' };
        }
      }
      return null;
    },
    /**
     * Wait until nothing keeps the pane from going on.
     * @returns {Promise<true|false|{deadlock: true, holder: string}>} false when the turn was stopped;
     *   `deadlock` when the pane it waits for waits for this one.
     */
    async waitClear(pane, request, signal) {
      for (;;) {
        if (signal?.aborted) {
          waiting.delete(pane);
          return false;
        }
        const blocked = this.blockerOf(pane, request);
        if (!blocked) break;
        // Two panes each waiting for what the other holds would wait for the whole lease: refuse instead.
        if (waiting.get(blocked.holder)?.holder === pane) {
          waiting.delete(pane);
          return { deadlock: true, holder: blocked.holder };
        }
        waiting.set(pane, blocked);
        await new Promise((done) => {
          const timer = setTimeout(finish, 1_000);
          function finish() {
            clearTimeout(timer);
            wakers.delete(finish);
            signal?.removeEventListener?.('abort', finish);
            done();
          }
          wakers.add(finish);
          signal?.addEventListener?.('abort', finish, { once: true });
        });
      }
      waiting.delete(pane);
      return true;
    },
    /**
     * Wait until no other pane holds any of the files (or runs a guarded command over them), then hold them all.
     * @returns {Promise<boolean>} false when the turn was stopped while waiting.
     */
    async acquire(pane, paths, signal, by = pane) {
      for (;;) {
        const clear = await this.waitClear(pane, { paths }, signal);
        if (clear !== true) return clear;
        // Checked again in the same instant the files are taken: two panes never both get one file.
        if (this.blockerOf(pane, { paths })) continue;
        for (const path of paths) leases.set(path, { pane, by, at: now() });
        return true;
      }
    },
    /**
     * A conversation or helper begins a step or goes idle: the files it took are free (a helper still at
     * work in the same pane keeps its own).
     */
    releaseBy(by) {
      let freed = false;
      for (const [path, lease] of leases) {
        if ((lease.by ?? lease.pane) === by) {
          leases.delete(path);
          freed = true;
        }
      }
      if (freed) wake();
    },
    /**
     * A command in a pane whose Mission mode puts back what a command changed without the owner's yes
     * (Restricted, Ask-Auto): the folder is held from before Mission's "before" picture until Mission has
     * put files back (the caller lets go when the step ends), so another pane's change in it is never
     * taken for the command's and put back. It waits for other panes' files and commands in the folder.
     * @param {string} by - the conversation or helper running the command.
     */
    async holdFolder(pane, folder, signal, by = pane) {
      if (!folder) return true;
      for (;;) {
        const clear = await this.waitClear(pane, { folder, exclusive: true }, signal);
        if (clear !== true) return clear;
        if (this.blockerOf(pane, { folder, exclusive: true })) continue;
        folderHolds.set(by, { pane, folder, at: now() });
        return true;
      }
    },
    /**
     * Any other command: it waits while another pane's guarded command holds the folder, then counts as
     * running there (a guarded command waits for it), until `endCommands(by)`.
     */
    async beginCommand(pane, folder, signal, by = pane) {
      if (!folder) return true;
      for (;;) {
        const clear = await this.waitClear(pane, { folder }, signal);
        if (clear !== true) return clear;
        if (this.blockerOf(pane, { folder })) continue;
        commandRuns.set(by, { pane, folder, at: now() });
        return true;
      }
    },
    /** The command run by `by` ended (or its step did): its folder hold and its running mark go. */
    endCommands(by) {
      const freed = folderHolds.delete(by) | commandRuns.delete(by);
      if (freed) wake();
    },
    /** Whether `by` holds its folder ('hold') or counts as running a command ('run'). */
    commandOf(by) {
      if (folderHolds.has(by)) return { kind: 'hold', ...folderHolds.get(by) };
      if (commandRuns.has(by)) return { kind: 'run', ...commandRuns.get(by) };
      return null;
    },
    /** The pane's step ended, its turn ended or it went away: its files are free. */
    releaseAll(pane) {
      let freed = false;
      for (const [path, lease] of leases) {
        if (lease.pane === pane) {
          leases.delete(path);
          freed = true;
        }
      }
      if (freed) wake();
    },
    /** Let go of some files only (a change that was refused). */
    releasePaths(pane, paths) {
      let freed = false;
      for (const path of paths) {
        if (leases.get(path)?.pane === pane) {
          leases.delete(path);
          freed = true;
        }
      }
      if (freed) wake();
    },
    /** Why a change the pane wants to make is refused: a file changed since it read it. '' when none. */
    staleWhy(pane, paths) {
      const map = reads.get(pane);
      if (!map) return '';
      for (const path of paths) {
        if (!map.has(path)) continue;
        if (map.get(path) !== fingerprint(stat, path)) return `${shortName(path)} was changed by ${whoChanged(pane, path)} after you read it. Read it again, then make your change.`;
      }
      return '';
    },
    noteRead(pane, path) {
      remember(pane, path);
      notices.get(pane)?.delete(path);
    },
    /** The pane changed files with a file tool: its own copy is current; panes that read them are told. */
    noteWrite(pane, paths) {
      for (const path of paths) {
        lastBy.delete(path);
        lastBy.set(path, pane);
        remember(pane, path);
        const now2 = fingerprint(stat, path);
        for (const [other, map] of reads) {
          if (other === pane || !map.has(path) || map.get(path) === now2) continue;
          notify(other, path, `the ${labelOf(pane)} pane`);
        }
      }
    },
    /**
     * After a command, or before a pane's step: every remembered read that no longer matches the file is a
     * change the pane did not make with its file tools. The pane that ran the command takes its own change.
     * @param {string} [ranBy] - the pane whose command just ran.
     */
    sweep(ranBy = '') {
      for (const [pane, map] of reads) {
        for (const [path, seen] of map) {
          const current = fingerprint(stat, path);
          if (current === seen) continue;
          if (pane === ranBy) {
            map.set(path, current);
            continue;
          }
          if (!notices.get(pane)?.has(path)) notify(pane, path, ranBy ? `a command or tool in the ${labelOf(ranBy)} pane` : whoChanged(pane, path));
        }
      }
    },
    /** The notes waiting for a pane, as one sentence each; taken once. */
    takeNotices(pane) {
      const map = notices.get(pane);
      if (!map || map.size === 0) return [];
      notices.delete(pane);
      return [...map].map(([path, who]) => `${path} was changed by ${who} after you read it. Read it again before you rely on it or change it.`);
    },
    /** What the Split page shows for a waiting pane. */
    waitingOf(pane) {
      const entry = waiting.get(pane);
      return entry ? { what: entry.what, holder: entry.holder, kind: entry.kind } : null;
    },
    /** The files a pane was the last to change with the file tools, newest first (for the watcher). */
    changedBy(pane) {
      return [...lastBy].filter(([, by]) => by === pane).map(([path]) => path).reverse().slice(0, 50);
    },
    /** The files a pane read or changed with the file tools, newest first (for "Send a file"). */
    knownOf(pane) {
      const seen = [...(reads.get(pane)?.keys() ?? [])].reverse();
      return seen.slice(0, 100);
    },
    forget(pane) {
      reads.delete(pane);
      notices.delete(pane);
      waiting.delete(pane);
      this.releaseAll(pane);
      for (const map of [folderHolds, commandRuns]) {
        for (const [by, hold] of map) if (by === pane || hold.pane === pane) map.delete(by);
      }
      wake();
    },
  };
}
