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
import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
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

/**
 * Whether a tab id is safe to keep with a deleted conversation (each tab lists only its own).
 * @param {unknown} tab - candidate.
 * @returns {boolean} true when it is.
 */
export function safeTab(tab) {
  return typeof tab === 'string' && /^[A-Za-z0-9][\w-]{0,127}$/.test(tab);
}

/** `{ tab }` when the tab is safe, else nothing; likewise the fallback tab (from its folder). */
const tabField = (tab) => (safeTab(tab) ? { tab } : {});
const fallbackField = (fallbackTab) => (safeTab(fallbackTab) ? { fallbackTab } : {});

/** An add-on that puts things in the trash (the shared trash service): lower case, 2 to 40 characters. */
export function safeOwner(owner) {
  return typeof owner === 'string' && /^[a-z][a-z0-9-]{1,39}$/.test(owner);
}

/**
 * The label that makes several records one Trash row: `group.<owner>.<key>` (for example every old
 * run of one automation). Empty when the owner or key is not safe.
 * @param {string} owner - the owning add-on.
 * @param {string} key - its own key for the row.
 * @returns {string} the label, or ''.
 */
export function groupLabel(owner, key) {
  if (!safeOwner(owner) || !safeId(key) || key.length > 100) return '';
  const label = `group.${owner}.${key}`;
  return safeId(label) ? label : '';
}

/** Whether a record's group label and owner belong together. */
function validGroup(src) {
  if (!src || typeof src.group !== 'string' || !safeOwner(src.owner)) return false;
  const prefix = `group.${src.owner}.`;
  return src.group.startsWith(prefix) && groupLabel(src.owner, src.group.slice(prefix.length)) === src.group;
}

/** Bytes of a value as JSON (Infinity when it cannot be written as JSON). */
export function jsonSize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value) ?? '');
  } catch {
    return Infinity;
  }
}

/**
 * The group fields kept with one conversation record or waiting entry, checked: nothing at all when
 * the group is malformed, so such a record is an ordinary conversation, as before.
 * @param {object} src - a record, a waiting entry or a request.
 * @returns {object} `{group, owner, ownerLabel?, groupTitle?, archivedBy?, back?, ownerData?}` or `{}`.
 */
export function groupFields(src) {
  if (!validGroup(src)) return {};
  const out = { group: src.group, owner: src.owner };
  if (typeof src.ownerLabel === 'string' && src.ownerLabel.trim()) out.ownerLabel = cleanTitle(src.ownerLabel).slice(0, 60);
  if (typeof src.groupTitle === 'string' && src.groupTitle.trim()) out.groupTitle = cleanTitle(src.groupTitle);
  if (src.archivedBy === 'plus' || src.archivedBy === 'user') out.archivedBy = src.archivedBy;
  if (src.back === 'list' || src.back === 'archived') out.back = src.back;
  if (src.ownerData !== undefined && jsonSize(src.ownerData) <= 4096) out.ownerData = src.ownerData;
  return out;
}

/** Temp files of the trash's own writes: `<file>.<pid>.<n>.tmp`. */
const TEMP = /\.json\.\d+\.\d+\.tmp$/;
let tempCount = 0;
/** Write JSON through a temp file and a rename, so a half-written record is never read. */
function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  tempCount += 1;
  const temp = `${file}.${process.pid}.${tempCount}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2));
  renameSync(temp, file);
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
 * One Trash row for the records and pieces that share a group label: its title and tab come from the
 * newest one; days left count from the oldest (each run is removed by its own date).
 */
function groupRow(group, members, pieces, registered) {
  const all = [
    ...members.map((m) => ({ at: Number(m.src.deletedAt) || 0, src: m.src })),
    ...pieces.map((piece) => ({ at: Number(piece.deletedAt) || 0, src: piece })),
  ];
  const newest = all.reduce((a, b) => (b.at > a.at ? b : a));
  const owner = newest.src.owner;
  const ownerLabel = typeof newest.src.ownerLabel === 'string' && newest.src.ownerLabel.trim() ? cleanTitle(newest.src.ownerLabel).slice(0, 60) : owner;
  const titled = all.slice().sort((a, b) => b.at - a.at).find((x) => typeof x.src.groupTitle === 'string' && x.src.groupTitle.trim());
  const row = {
    id: group, kind: 'group', owner, ownerLabel,
    title: titled ? cleanTitle(titled.src.groupTitle) : ownerLabel,
    deletedAt: newest.at, firstAt: Math.min(...all.map((x) => x.at)),
    // Kept data (a recipe) and, from a later version, moved folders are counted apart; `pieces` names
    // them all, so a Delete can name exactly what the list showed.
    count: members.length, ids: members.map((m) => m.src.id),
    data: pieces.filter((piece) => piece.kind === 'data').length, folders: pieces.filter((piece) => piece.kind === 'folder').length,
    pieces: pieces.map((piece) => piece.item),
    pending: members.length > 0 && members.every((m) => m.pending),
    ...tabField(newest.src.tab), ...fallbackField(newest.src.fallbackTab),
  };
  if (members.length > 0 && pieces.length === 0 && members.every((m) => m.src.erase === true)) row.erasing = true;
  const error = pieces.map((piece) => piece.lastError).find((text) => typeof text === 'string' && text.trim());
  if (error) row.lastError = cleanTitle(error);
  if (pieces.some((piece) => piece.kind === 'folder')) row.newer = true;
  if (pieces.length > 0 && typeof registered === 'function' && !registered(owner)) row.putBackNeeds = ownerLabel;
  return row;
}

/**
 * Open the trash kept in one folder.
 * @param {string} dir - absolute trash folder; created when first needed.
 * @returns {object} the trash.
 */
export function openTrash(dir, { wiping = () => false } = {}) {
  if (!dir || !isAbsolute(dir)) throw new Error('the trash needs an absolute folder');
  // A Recon conversation ended with End and wipe never goes to the trash: it is deleted for good.
  const wiped = (id) => {
    try {
      return wiping(id) === true;
    } catch {
      return false;
    }
  };
  const WIPED = 'This Recon conversation was ended with End and wipe: it is being deleted for good, not moved to the trash.';
  const ERASING = 'This conversation is being deleted permanently: it cannot be put back.';
  const PARTIAL = 'Its files did not all reach the trash, so it cannot be deleted permanently: put it back, then delete it again.';
  const pendingFile = join(dir, 'pending.json');
  const entryDir = (id) => join(dir, id);

  const readPending = () => {
    const value = readJson(pendingFile, []);
    return Array.isArray(value) ? value.filter((item) => item && safeId(item.id)) : [];
  };
  const writePending = (items) => writeJsonAtomic(pendingFile, items);
  // A conversation record has no `format`; anything else (a piece, a later format) is not one.
  const readInfo = (id) => {
    const info = readJson(join(entryDir(id), 'info.json'), null);
    return info && info.format === undefined && info.id === id && Array.isArray(info.parts) ? info : null;
  };
  /** A piece: data (or, from a later version, a folder) kept in the trash for an owning add-on. */
  const readPiece = (name) => {
    if (typeof name !== 'string' || !name.startsWith('piece-') || !safeId(name)) return null;
    try {
      if (!lstatSync(entryDir(name)).isDirectory()) return null;
    } catch {
      return null;
    }
    const info = readJson(join(entryDir(name), 'info.json'), null);
    return info && info.format === 2 && info.item === name && (info.kind === 'data' || info.kind === 'folder') && validGroup(info) ? info : null;
  };
  const pieceEntries = () => {
    let names = [];
    try {
      names = readdirSync(dir);
    } catch {
      return [];
    }
    return names.filter((name) => name.startsWith('piece-')).map(readPiece).filter(Boolean);
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
     * What is in the trash, newest first. `pending` marks one whose files have not moved yet; `tab` is
     * the sidebar tab it was deleted from (none for one deleted before 0.58.0).
     * @returns {{id: string, title: string, deletedAt: number, pending: boolean, tab?: string, erasing?: true}[]} the items.
     */
    list({ registered } = {}) {
      const plain = (src, pending) => ({ id: src.id, title: cleanTitle(src.title), deletedAt: Number(src.deletedAt) || 0, pending, ...tabField(src.tab), ...fallbackField(src.fallbackTab), ...(src.erase === true ? { erasing: true } : {}), ...(Array.isArray(src.folders) && src.folders.length > 0 ? { files: true } : {}) });
      const rows = [];
      // Records that share a group label are one row (each still its own record underneath).
      const groups = new Map();
      const slot = (group) => groups.get(group) ?? groups.set(group, { members: [], pieces: [] }).get(group);
      const records = entries().filter((info) => !wiped(info.id));
      const movedIds = new Set(records.map((info) => info.id));
      for (const info of records) {
        if (groupFields(info).group) slot(info.group).members.push({ src: info, pending: false });
        else rows.push(plain(info, false));
      }
      for (const item of readPending().filter((entry) => !movedIds.has(entry.id) && !wiped(entry.id))) {
        if (groupFields(item).group) slot(item.group).members.push({ src: item, pending: true });
        else rows.push(plain(item, true));
      }
      for (const piece of pieceEntries()) slot(piece.group).pieces.push(piece);
      for (const [group, { members, pieces }] of groups) rows.push(groupRow(group, members, pieces, registered));
      return rows.sort((a, b) => b.deletedAt - a.deletedAt);
    },

    /**
     * Where conversations are in the trash: for each id (a conversation or one of its helpers), its
     * row (the group label, or its own id), moved or waiting, and whether it is being erased.
     * @param {string[]} ids - conversation ids.
     * @returns {Record<string, {row: string, state: 'moved'|'waiting', erasing: boolean, owner?: string, key?: string}>} found ones.
     */
    locate(ids) {
      const want = new Set((Array.isArray(ids) ? ids : []).filter(safeId));
      const out = {};
      const where = (src, state) => {
        const g = groupFields(src);
        return { row: g.group || src.id, state, erasing: src.erase === true, ...(g.group ? { owner: g.owner, key: g.group.slice(`group.${g.owner}.`.length) } : {}) };
      };
      for (const info of entries()) {
        for (const part of info.parts) if (want.has(part?.id) && !out[part.id]) out[part.id] = where(info, 'moved');
        if (want.has(info.id) && !out[info.id]) out[info.id] = where(info, 'moved');
      }
      for (const item of readPending()) if (want.has(item.id) && !out[item.id]) out[item.id] = where(item, 'waiting');
      return out;
    },

    /** Everything one group row holds: its moved records, waiting entries and pieces. */
    groupParts(group) {
      const records = entries().filter((info) => groupFields(info).group === group);
      const movedIds = new Set(records.map((info) => info.id));
      return {
        records,
        waiting: readPending().filter((item) => !movedIds.has(item.id) && groupFields(item).group === group),
        pieces: pieceEntries().filter((piece) => piece.group === group),
      };
    },

    /**
     * Keep data for an owning add-on (for example a deleted automation's recipe) as a piece of a
     * group row: no files, put back by that add-on. Written with no `id` and no `parts`, so older
     * versions of this add-on and the other trash readers never take it for a conversation.
     * @returns {string} the piece id (`piece-<uuid>`).
     */
    addPiece({ group, owner, ownerLabel, groupTitle, title, deletedAt = Date.now(), tab, fallbackTab, with: withIds = [], ownerData }) {
      if (!validGroup({ group, owner })) throw new Error('not a row key');
      if (jsonSize(ownerData ?? null) > 65536) throw new Error('The kept data is too large (at most 64 KB).');
      let item;
      do item = `piece-${randomUUID()}`; while (existsSync(entryDir(item)));
      const info = {
        format: 2, item, kind: 'data', group, owner,
        ...(typeof ownerLabel === 'string' && ownerLabel.trim() ? { ownerLabel: cleanTitle(ownerLabel).slice(0, 60) } : {}),
        ...(typeof groupTitle === 'string' && groupTitle.trim() ? { groupTitle: cleanTitle(groupTitle) } : {}),
        title: cleanTitle(title), deletedAt, ...tabField(tab), ...fallbackField(fallbackTab),
        with: (Array.isArray(withIds) ? withIds : []).filter(safeId).slice(0, 500),
        ownerData: ownerData ?? null,
      };
      mkdirSync(entryDir(item), { recursive: true });
      writeJsonAtomic(join(entryDir(item), 'info.json'), info);
      return item;
    },

    /** @returns {object | null} one piece's record. */
    piece(item) {
      return readPiece(item);
    },

    /** @returns {boolean} whether this id names a piece folder (never a conversation). */
    isPiece(id) {
      if (typeof id !== 'string' || !id.startsWith('piece-') || !safeId(id)) return false;
      try {
        return lstatSync(entryDir(id)).isDirectory();
      } catch {
        return false;
      }
    },

    /** Remove one piece (only its folder inside the trash). @returns {boolean} true when it was there. */
    removePiece(item) {
      if (!readPiece(item)) return false;
      rmSync(entryDir(item), { recursive: true, force: true });
      return true;
    },

    /** Note why a piece could not be put back; shown under its row. */
    setPieceError(item, text) {
      const piece = readPiece(item);
      if (!piece) return;
      writeJsonAtomic(join(entryDir(item), 'info.json'), { ...piece, lastError: cleanTitle(text).slice(0, 300) });
    },

    /** Remove the trash's own temp files older than an hour (left by a write that was cut off). */
    sweepTemp(now = Date.now()) {
      const sweep = (folder) => {
        let names = [];
        try {
          names = readdirSync(folder);
        } catch {
          return;
        }
        for (const name of names) {
          if (!TEMP.test(name)) continue;
          const file = join(folder, name);
          try {
            const st = lstatSync(file);
            if (st.isFile() && now - st.mtimeMs > 60 * 60 * 1000) unlinkSync(file);
          } catch { /* gone already */ }
        }
      };
      sweep(dir);
      let names = [];
      try {
        names = readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
      } catch {
        names = [];
      }
      for (const name of names) if (safeId(name)) sweep(entryDir(name));
    },

    /**
     * Move a conversation's files into the trash.
     * @param {object} what - the conversation.
     * @param {string} what.id - its id.
     * @param {string} [what.title] - its title, for the trash list.
     * @param {{id: string, folder: string, cache?: string}[]} what.parts - the conversation itself
     *   first, then its helper conversations: each one's folder and, when there is one, its list entry file.
     * @param {number} [what.deletedAt] - when it was deleted; now when left out.
     * @param {string} [what.tab] - the sidebar tab it was deleted from; its Trash list shows it.
     * @param {string} [what.fallbackTab] - the tab its folder gives, used while `tab` is not shown.
     */
    add(what) {
      const { id, title, parts, deletedAt = Date.now(), tab, fallbackTab } = what;
      if (!safeId(id)) throw new Error('not a conversation id');
      if (wiped(id)) throw new Error(WIPED);
      if (!Array.isArray(parts) || parts.length === 0 || parts[0].id !== id) throw new Error('nothing to move');
      for (const part of parts) {
        if (!safeId(part.id)) throw new Error('not a conversation id');
        if (!isAbsolute(String(part.folder)) || !isSessionFolder(part.folder)) throw new Error(`not a stored conversation: ${part.id}`);
      }
      // A Scratch thread's own files (its sub-folder of the Scratch place) go with it: a real folder, never a link.
      const folders = (Array.isArray(what.folders) ? what.folders : []).filter((folder) => {
        if (!isAbsolute(String(folder))) return false;
        try {
          return lstatSync(folder).isDirectory();
        } catch {
          return false;
        }
      });
      const target = entryDir(id);
      if (existsSync(target)) throw new Error('already in the trash');
      mkdirSync(target, { recursive: true });
      // Marked "delete permanently" while it waited: the mark is read now, when its files move, and kept
      // in the record, so the tidy-up erases it right after (also after a crash in between).
      const waitingEntry = readPending().find((item) => item.id === id);
      const marked = waitingEntry?.erase === true;
      // A run of a group row keeps its group (given now, or kept with it while it waited).
      const group = groupFields(what).group ? groupFields(what) : groupFields(waitingEntry);
      const info = { id, title: cleanTitle(title), deletedAt, ...tabField(tab), ...fallbackField(fallbackTab), ...group, ...(marked ? { erase: true } : {}), parts: parts.map((p) => ({ id: p.id, from: p.folder, cacheFrom: p.cache && existsSync(p.cache) ? p.cache : null })), ...(folders.length > 0 ? { folders: folders.map((from, index) => ({ from, name: `files-${index}` })) } : {}) };
      // Written first: an interrupted move can still be put back from this record.
      writeJsonAtomic(join(target, 'info.json'), info);
      for (const part of info.parts) {
        move(part.from, join(target, part.id, 'session'));
        if (part.cacheFrom) move(part.cacheFrom, join(target, part.id, 'cache.json'));
      }
      for (const folder of info.folders ?? []) move(folder.from, join(target, folder.name));
      writePending(readPending().filter((item) => item.id !== id));
    },

    /**
     * Remember a conversation whose files cannot move yet (the app has it open in memory). Asked again
     * for one already waiting (each tidy-up), it keeps its tab and its "delete permanently" mark with
     * the mark's change token.
     * @param {{id: string, title?: string, deletedAt?: number, tab?: string, fallbackTab?: string}} what - the conversation.
     */
    addPending(what) {
      const { id, title, deletedAt = Date.now(), tab, fallbackTab } = what;
      if (!safeId(id)) throw new Error('not a conversation id');
      if (wiped(id)) throw new Error(WIPED);
      if (existsSync(entryDir(id))) return;
      const waiting = readPending();
      const prior = waiting.find((item) => item.id === id);
      const group = groupFields(what).group ? groupFields(what) : groupFields(prior);
      const entry = { id, title: cleanTitle(title), deletedAt, ...tabField(safeTab(tab) ? tab : prior?.tab), ...fallbackField(safeTab(fallbackTab) ? fallbackTab : prior?.fallbackTab), ...group, ...(prior?.erase === true ? { erase: true, ...(typeof prior.markedStamp === 'string' ? { markedStamp: prior.markedStamp } : {}) } : {}) };
      writePending([...waiting.filter((item) => item.id !== id), entry]);
    },

    /**
     * Forget a conversation that was waiting to move, without putting anything back (its files are gone).
     * @param {string} id - its id.
     * @returns {boolean} true when it was waiting.
     */
    dropPending(id) {
      if (!safeId(id)) throw new Error('not a conversation id');
      const waiting = readPending();
      if (!waiting.some((item) => item.id === id)) return false;
      writePending(waiting.filter((item) => item.id !== id));
      return true;
    },

    /** @returns {{id: string, title: string, deletedAt: number}[]} the conversations still waiting to move (none that is being wiped). */
    pending() {
      return readPending().filter((item) => !wiped(item.id));
    },

    /** @returns {boolean} whether the conversation still waits to move (not put back or taken out meanwhile). */
    isWaiting(id) {
      return safeId(id) && readPending().some((item) => item.id === id);
    },

    /** @returns {boolean} whether it is marked "delete permanently", in the waiting list or in its record. */
    marked(id) {
      if (!safeId(id)) return false;
      return readPending().some((item) => item.id === id && item.erase === true) || readInfo(id)?.erase === true;
    },

    /** @returns {string | undefined} the change token saved when it was marked, for one still waiting. */
    markStamp(id) {
      const item = safeId(id) ? readPending().find((entry) => entry.id === id && entry.erase === true) : undefined;
      return typeof item?.markedStamp === 'string' ? item.markedStamp : undefined;
    },

    /** @returns {string[]} conversations in the trash that are marked but not erased yet (an interrupted tidy-up). */
    markedMoved() {
      return entries().filter((info) => info.erase === true).map((info) => info.id);
    },

    /**
     * Take the "delete permanently" mark off again, when erasing it failed: it is back in the Trash list
     * with Put back, and can be deleted permanently again.
     * @returns {boolean} true when there was a mark.
     */
    unmark(id) {
      if (!safeId(id)) return false;
      let found = false;
      const waiting = readPending();
      if (waiting.some((item) => item.id === id && item.erase === true)) {
        writePending(waiting.map((item) => (item.id === id ? (({ erase, markedStamp, ...rest }) => rest)(item) : item)));
        found = true;
      }
      const info = readInfo(id);
      if (info?.erase === true) {
        const { erase, ...rest } = info;
        writeJsonAtomic(join(entryDir(id), 'info.json'), rest);
        found = true;
      }
      return found;
    },

    /**
     * Put a conversation back where it was. Nothing moves when anything is in the way.
     * @param {string} id - its id.
     * @returns {boolean} true when it was in the trash.
     */
    restore(id) {
      if (!safeId(id)) throw new Error('not a conversation id');
      if (wiped(id)) throw new Error(WIPED);
      const waiting = readPending();
      if (waiting.some((item) => item.id === id && item.erase === true)) throw new Error(ERASING);
      const info = readInfo(id);
      if (info?.erase === true) throw new Error(ERASING);
      if (waiting.some((item) => item.id === id)) writePending(waiting.filter((item) => item.id !== id));
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
      // Its files: back where they were. An empty folder made there meanwhile gives way; one with files
      // in it does not (nothing is ever mixed or overwritten), and then nothing moves at all.
      const emptied = [];
      for (const folder of Array.isArray(info.folders) ? info.folders : []) {
        if (!isAbsolute(String(folder?.from)) || !/^files-\d+$/.test(String(folder?.name))) throw new Error('the trash record is damaged');
        const kept = join(target, folder.name);
        if (!existsSync(kept)) continue;
        if (existsSync(folder.from)) {
          let names;
          try {
            names = lstatSync(folder.from).isDirectory() ? readdirSync(folder.from) : null;
          } catch {
            names = null;
          }
          if (!names || names.length > 0) throw new Error(`its files cannot go back: ${folder.from} holds other files now`);
          emptied.push(folder.from);
        }
        moves.push([kept, folder.from]);
      }
      for (const folder of emptied) rmdirSync(folder);
      for (const [from, to] of moves) move(from, to);
      rmSync(target, { recursive: true, force: true });
      return true;
    },

    /**
     * Delete one conversation in the trash for good. One whose files are in the trash is erased now
     * (only that folder inside the trash); one still waiting to move (the app holds it open) is
     * marked and erased when it moves, at the latest at the next start.
     * @param {string} id - its id.
     * @param {{stamp?: string}} [options] - for one still waiting: the app's change token of its file
     *   now; it is erased only if the file is unchanged when it moves (not taken back meanwhile).
     * @returns {'erased' | 'marked' | 'absent'} what happened.
     */
    erase(id, { stamp } = {}) {
      if (!safeId(id)) throw new Error('not a conversation id');
      const target = entryDir(id);
      let entry = null;
      try {
        entry = lstatSync(target);
      } catch {
        entry = null;
      }
      // Only a conversation's folder (or a stray link, which alone goes): never the trash's own files.
      if (entry && !entry.isDirectory() && !entry.isSymbolicLink()) throw new Error('not a conversation id');
      if (entry) {
        const info = entry.isDirectory() ? readInfo(id) : null;
        // A move that broke off half-way: some files are still in the app's store. Erasing the record
        // alone would bring the conversation back to the list.
        if (info && info.parts.some((part) => isAbsolute(String(part.from)) && existsSync(part.from) && !existsSync(join(target, part.id, 'session')))) throw new Error(PARTIAL);
        if (info && (Array.isArray(info.folders) ? info.folders : []).some((folder) => isAbsolute(String(folder?.from)) && existsSync(folder.from) && !existsSync(join(target, String(folder.name))))) throw new Error(PARTIAL);
        rmSync(target, { recursive: true, force: true });
        writePending(readPending().filter((item) => item.id !== id));
        return 'erased';
      }
      const waiting = readPending();
      if (!waiting.some((item) => item.id === id)) return 'absent';
      // Marked again (Empty trash): the token from the first mark stays, so a take-back since still counts.
      const keep = (item) => (typeof item.markedStamp === 'string' ? item.markedStamp : (typeof stamp === 'string' && stamp ? stamp : undefined));
      writePending(waiting.map((item) => (item.id === id ? { ...item, erase: true, ...(keep(item) ? { markedStamp: keep(item) } : {}) } : item)));
      return 'marked';
    },

    /**
     * Remove for good everything deleted longer ago than the keeping time: each conversation (also
     * each run of a group row) and each piece by its own date.
     * @param {number} [now] - the current time.
     * @param {(gone: {id?: string, item?: string, group: string, owner: string, ownerData?: unknown}) => void} [onGone] - told of each grouped record and piece removed.
     * @returns {string[]} the conversation ids removed.
     */
    purge(now = Date.now(), onGone) {
      const tell = (what) => {
        try { onGone?.(what); } catch { /* the owner's notice never stops the purge */ }
      };
      const old = (src) => Number(src.deletedAt) > 0 && now - Number(src.deletedAt) >= KEEP_MS;
      const gone = [];
      for (const info of entries()) {
        if (!old(info)) continue;
        rmSync(entryDir(info.id), { recursive: true, force: true });
        gone.push(info.id);
        const g = groupFields(info);
        if (g.group) tell({ id: info.id, group: g.group, owner: g.owner, ...(g.ownerData !== undefined ? { ownerData: g.ownerData } : {}) });
      }
      for (const piece of pieceEntries()) {
        if (!old(piece)) continue;
        rmSync(entryDir(piece.item), { recursive: true, force: true });
        tell({ item: piece.item, group: piece.group, owner: piece.owner, ownerData: piece.ownerData });
      }
      return gone;
    },
  };
}

/**
 * Deal with the conversations waiting to move into the trash: one taken out of the archive is put
 * back in the lists; one whose files are gone (neither open nor stored, checked twice a moment apart)
 * is forgotten, so it does not stay in the Trash list for ever; the rest move. Never throws: every
 * problem is reported in `failed`.
 * @param {ReturnType<typeof openTrash>} trash - the trash.
 * @param {object} host - what the app knows.
 * @param {(id: string) => boolean} host.isArchived - whether the conversation is archived.
 * @param {(id: string) => boolean} host.inMemory - whether the app holds it open.
 * @param {(id: string) => Promise<boolean>} host.isStored - whether the app still has its files.
 * @param {(item: {id: string, title: string, deletedAt: number}) => Promise<unknown>} host.move - move it.
 * @param {(id: string) => Promise<string | undefined>} [host.stampOf] - the app's change token of its file now.
 * @param {(ms: number) => Promise<void>} [host.wait] - wait between the two checks.
 * @returns {Promise<{restored: string[], moved: string[], erased: string[], dropped: string[], failed: {id: string, error: string}[], unmarked: string[], kept: string[]}>} what happened.
 */
export async function tidyPending(trash, { isArchived, inMemory, isStored, move, stampOf, wait = (ms) => new Promise((done) => setTimeout(done, ms)) }) {
  const out = { restored: [], moved: [], erased: [], dropped: [], failed: [], unmarked: [], kept: [] };
  const fail = (id, error) => out.failed.push({ id, error: String(error?.message ?? error) });
  // Taking a mark off writes files too; that may fail as well, and must not stop the tidy-up.
  const unmarkSafely = (id, into) => {
    try {
      if (trash.unmark(id)) into.push(id);
    } catch (error) {
      fail(id, error);
    }
  };
  const gone = async (id) => !inMemory(id) && !(await isStored(id));
  try {
    // Marked ones whose files moved but which were not erased yet (the app stopped in between).
    for (const id of trash.markedMoved()) {
      try {
        if (trash.erase(id) === 'erased') out.erased.push(id);
      } catch (error) {
        fail(id, error);
        unmarkSafely(id, out.unmarked);
      }
    }
    for (const item of trash.pending()) {
      // Put back, taken out of the archive or erased while this tidy-up was busy with others: skip it.
      if (!trash.isWaiting(item.id)) continue;
      try {
        if (!isArchived(item.id)) {
          // Taken out of the archive by hand: it stays, also when it was marked to be deleted
          // permanently (read now, not from the list taken at the start). Its files never moved.
          trash.unmark(item.id);
          trash.restore(item.id);
          out.restored.push(item.id);
          continue;
        }
        if (await gone(item.id)) {
          // Checked again a moment later: a conversation may be unlisted only briefly.
          await wait(1500);
          if (await gone(item.id)) {
            trash.dropPending(item.id);
            out.dropped.push(item.id);
            continue;
          }
        }
        // Marked, but its file changed since: it was taken back and used at some point (for example
        // while this add-on was off), so it is not erased; it goes to the trash with Put back.
        const stamp = trash.markStamp(item.id);
        if (stamp !== undefined && typeof stampOf === 'function') {
          const now = await stampOf(item.id);
          if (typeof now === 'string' && now !== stamp) unmarkSafely(item.id, out.kept);
        }
        await move(item);
        // Deleted permanently while it was still open: it is erased as soon as it has moved. The mark is
        // read now, not from the list taken at the start, so a click made meanwhile counts.
        if (trash.marked(item.id) && trash.erase(item.id) === 'erased') out.erased.push(item.id);
        else out.moved.push(item.id);
      } catch (error) {
        fail(item.id, error);
        // It could not be moved or erased: rather than "Being deleted" for ever, it is back with Put back.
        unmarkSafely(item.id, out.unmarked);
      }
    }
  } catch (error) {
    fail('', error);
  }
  return out;
}
