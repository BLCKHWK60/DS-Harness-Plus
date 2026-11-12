/**
 * The trash for deleted conversations. The app itself cannot delete a conversation, so "delete" here
 * moves the conversation's files out of the app's folders into a trash folder, where they stay for
 * 30 days and can be put back. Plain file moves only; kept apart from the plugin so it can be tested
 * without the app.
 *
 * Layout: `<dir>/<id>/info.json` plus, for the conversation and each of its helper conversations,
 * `<dir>/<id>/<partId>/session` (its folder) and `<dir>/<id>/<partId>/cache.json` (its list entry).
 * `<dir>/pending.json` lists conversations that were in use when deleted; their files move later.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

/** How long a deleted conversation is kept. */
export const KEEP_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Whether a conversation id is safe to use as one folder name.
 * @param {unknown} id - candidate.
 * @returns {boolean} true when it is.
 */
export function safeId(id) {
  return typeof id === 'string' && /^[\w-][\w.-]{0,159}$/.test(id) && !id.includes('..');
}

function move(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    cpSync(from, to, { recursive: true });
    rmSync(from, { recursive: true, force: true });
  }
}

function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function cleanTitle(title) {
  return String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Whether a folder looks like one stored conversation. */
function isSessionFolder(folder) {
  try {
    return statSync(folder).isDirectory() && readdirSync(folder).some((name) => /^session\..*jsonl/.test(name));
  } catch {
    return false;
  }
}

/**
 * Open the trash kept in one folder.
 * @param {string} dir - absolute trash folder; created when first needed.
 * @returns {object} the trash.
 */
export function openTrash(dir) {
  if (!dir || !isAbsolute(dir)) throw new Error('the trash needs an absolute folder');
  const pendingFile = join(dir, 'pending.json');
  const entryDir = (id) => join(dir, id);

  const readPending = () => {
    const value = readJson(pendingFile, []);
    return Array.isArray(value) ? value.filter((item) => item && safeId(item.id)) : [];
  };
  const writePending = (items) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(pendingFile, JSON.stringify(items, null, 2));
  };
  const readInfo = (id) => {
    const info = readJson(join(entryDir(id), 'info.json'), null);
    return info && info.id === id && Array.isArray(info.parts) ? info : null;
  };
  const entries = () => {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return [];
    }
    return names.filter(safeId).map(readInfo).filter(Boolean);
  };

  return {
    /**
     * What is in the trash, newest first. `pending` marks one whose files have not moved yet.
     * @returns {{id: string, title: string, deletedAt: number, pending: boolean}[]} the items.
     */
    list() {
      const moved = entries().map((info) => ({ id: info.id, title: cleanTitle(info.title), deletedAt: Number(info.deletedAt) || 0, pending: false }));
      const waiting = readPending()
        .filter((item) => !moved.some((m) => m.id === item.id))
        .map((item) => ({ id: item.id, title: cleanTitle(item.title), deletedAt: Number(item.deletedAt) || 0, pending: true }));
      return [...moved, ...waiting].sort((a, b) => b.deletedAt - a.deletedAt);
    },

    /**
     * Move a conversation's files into the trash.
     * @param {object} what - the conversation.
     * @param {string} what.id - its id.
     * @param {string} [what.title] - its title, for the trash list.
     * @param {{id: string, folder: string, cache?: string}[]} what.parts - the conversation itself
     *   first, then its helper conversations: each one's folder and, when there is one, its list entry file.
     * @param {number} [what.deletedAt] - when it was deleted; now when left out.
     */
    add({ id, title, parts, deletedAt = Date.now() }) {
      if (!safeId(id)) throw new Error('not a conversation id');
      if (!Array.isArray(parts) || parts.length === 0 || parts[0].id !== id) throw new Error('nothing to move');
      for (const part of parts) {
        if (!safeId(part.id)) throw new Error('not a conversation id');
        if (!isAbsolute(String(part.folder)) || !isSessionFolder(part.folder)) throw new Error(`not a stored conversation: ${part.id}`);
      }
      const target = entryDir(id);
      if (existsSync(target)) throw new Error('already in the trash');
      mkdirSync(target, { recursive: true });
      const info = { id, title: cleanTitle(title), deletedAt, parts: parts.map((p) => ({ id: p.id, from: p.folder, cacheFrom: p.cache && existsSync(p.cache) ? p.cache : null })) };
      // Written first: an interrupted move can still be put back from this record.
      writeFileSync(join(target, 'info.json'), JSON.stringify(info, null, 2));
      for (const part of info.parts) {
        move(part.from, join(target, part.id, 'session'));
        if (part.cacheFrom) move(part.cacheFrom, join(target, part.id, 'cache.json'));
      }
      writePending(readPending().filter((item) => item.id !== id));
    },

    /**
     * Remember a conversation whose files cannot move yet (the app has it open in memory).
     * @param {{id: string, title?: string, deletedAt?: number}} what - the conversation.
     */
    addPending({ id, title, deletedAt = Date.now() }) {
      if (!safeId(id)) throw new Error('not a conversation id');
      if (existsSync(entryDir(id))) return;
      writePending([...readPending().filter((item) => item.id !== id), { id, title: cleanTitle(title), deletedAt }]);
    },

    /** @returns {{id: string, title: string, deletedAt: number}[]} the conversations still waiting to move. */
    pending() {
      return readPending();
    },

    /**
     * Put a conversation back where it was. Nothing moves when anything is in the way.
     * @param {string} id - its id.
     * @returns {boolean} true when it was in the trash.
     */
    restore(id) {
      if (!safeId(id)) throw new Error('not a conversation id');
      const waiting = readPending();
      if (waiting.some((item) => item.id === id)) writePending(waiting.filter((item) => item.id !== id));
      const info = readInfo(id);
      if (!info) return waiting.some((item) => item.id === id);
      const target = entryDir(id);
      const moves = [];
      for (const part of info.parts) {
        if (!safeId(part.id) || !isAbsolute(String(part.from))) throw new Error('the trash record is damaged');
        const session = join(target, part.id, 'session');
        const cache = join(target, part.id, 'cache.json');
        if (existsSync(session)) {
          if (existsSync(part.from)) throw new Error('a conversation is already in its place');
          moves.push([session, part.from]);
        }
        if (part.cacheFrom && isAbsolute(String(part.cacheFrom)) && existsSync(cache) && !existsSync(part.cacheFrom)) moves.push([cache, part.cacheFrom]);
      }
      for (const [from, to] of moves) move(from, to);
      rmSync(target, { recursive: true, force: true });
      return true;
    },

    /**
     * Remove for good everything deleted longer ago than the keeping time.
     * @param {number} [now] - the current time.
     * @returns {string[]} the ids removed.
     */
    purge(now = Date.now()) {
      const gone = [];
      for (const info of entries()) {
        if (!(Number(info.deletedAt) > 0) || now - Number(info.deletedAt) < KEEP_MS) continue;
        rmSync(entryDir(info.id), { recursive: true, force: true });
        gone.push(info.id);
      }
      return gone;
    },
  };
}
