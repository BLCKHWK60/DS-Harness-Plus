/**
 * Artifacts: the index of every file a conversation made or changed, and its versions.
 *
 * - **One copy:** the file in its folder is the artifact; the index points to it. Older versions are copies
 *   kept in Artifacts' own folder (`versions/<id>/<n>`), never beside the file (the owner's answer: keep
 *   everything, no limit; a clean-up view removes what he picks).
 * - **A version** is made each time the file's content changes (same content: no new version).
 * - **Sealed (Recon) artifacts** are kept for their own conversation only and never listed: made in a sealed
 *   conversation, or lying in one of Recon's rooms (any folder named `dsh-recon…`, by its real path too).
 * - **Bench backups** are listed and never shown (they can hold passwords and keys), never picked by a clean-up.
 * - **Clean-up** moves kept versions, list entries and (when asked) the current files into Artifacts' trash
 *   folder (`trash/<stamp>/`, with what was moved written down in `manifest.json` there), from where Put back
 *   in the app's trash brings them back. A clean-up that fails half-way puts back what it had moved.
 */
import { createHash, randomBytes } from 'node:crypto';
import { constants, copyFileSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, rmdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';
import { kindOf } from './kinds.js';

/** A Bench backup: listed, never shown. */
export const BENCH_BACKUP = /\/devices\/[^/]+\/backups\//;
/** One of Recon's rooms: any folder whose name starts with "dsh-recon", without regard to capitals. */
export const RECON_ROOM = /(^|\/)dsh-recon[^/]*(\/|$)/i;
/** A clean-up's name in the trash folder. */
export const STAMP = /^\d{14}-[a-z0-9]{4,8}$/;
/** An artifact's id as this add-on makes it: 16 hex letters. Anything else read from a file is never used as a folder name. */
export const ID_FORM = /^[0-9a-f]{16}$/;
/** Files this big are fingerprinted by size and time instead of being read whole (reading blocks the app). */
export const HASH_MAX = 50_000_000;

const idOf = (path) => createHash('sha256').update(String(path)).digest('hex').slice(0, 16);

function fingerprint(path, info) {
  if (info.size > HASH_MAX) return `size:${info.size}:${Math.round(info.mtimeMs)}`;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Is anything at this path (a dangling link counts)? */
function there(path) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

/** A plain file at this path (not a link, not a folder)? */
function plainFile(path) {
  try {
    return lstatSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Is this path in one of Recon's rooms? By its name, and by the real folder it lies in (through links).
 * @param {string} path - a file or folder (it need not be there yet).
 */
export function inReconRoom(path) {
  const text = String(path ?? '');
  if (RECON_ROOM.test(text)) return true;
  let probe = text;
  while (probe && probe !== '/' && probe !== '.') {
    try {
      return RECON_ROOM.test(realpathSync(probe));
    } catch {
      probe = dirname(probe);
    }
  }
  return false;
}

/** Move a file or folder, across disks too (a file). Never over something already there. */
function move(from, to) {
  if (there(to)) throw new Error(`${basename(to)} is already there; nothing was overwritten.`);
  mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
  try {
    renameSync(from, to);
  } catch (error) {
    if (error?.code !== 'EXDEV') throw error;
    copyFileSync(from, to, constants.COPYFILE_EXCL);
    rmSync(from, { force: true });
  }
}

/** Move a file to a place that must be free, without a moment where something there could be replaced. */
function moveFresh(from, to) {
  mkdirSync(dirname(to), { recursive: true });
  try {
    linkSync(from, to);
    unlinkSync(from);
  } catch (error) {
    if (error?.code === 'EEXIST') throw new Error(`${basename(to)} is already there; nothing was overwritten.`);
    if (error?.code !== 'EXDEV' && error?.code !== 'EPERM' && error?.code !== 'ENOTSUP') throw error;
    copyFileSync(from, to, constants.COPYFILE_EXCL);
    rmSync(from, { force: true });
  }
}

/** "name (restored).ext", "name (restored 2).ext"…: the first that is free beside the file. */
function freeName(path) {
  const ext = extname(path);
  const stem = basename(path, ext);
  for (let n = 1; n < 1000; n += 1) {
    const candidate = join(dirname(path), `${stem} (restored${n === 1 ? '' : ` ${n}`})${ext}`);
    if (!there(candidate)) return candidate;
  }
  throw new Error(`no free name beside ${basename(path)}`);
}

/** Is `path` inside `folder`? */
const inside = (folder, path) => String(path ?? '').startsWith(`${String(folder).replace(/\/+$/, '')}/`);

/**
 * @param {{home?: string, now?: () => number, scratchRoot?: string}} [options] - `home`: Artifacts' folder
 *   ('' keeps the index in memory and versions nowhere: for tests of the index only).
 */
export function openArtifacts({ home = '', now = Date.now, scratchRoot = '', isolated = () => null } = {}) {
  const indexFile = home ? join(home, 'index.json') : '';
  /** @type {Record<string, any>} */
  let items = {};
  /** What the owner should be told in plain words (a damaged index kept aside); '' when all is well. */
  let notice = '';
  const versionsRoot = home ? join(home, 'versions') : '';
  /** Artifacts' own versions folder for one artifact: '' unless the id is well formed and the folder lies inside the store. */
  const folderOf = (id) => {
    if (!versionsRoot || !ID_FORM.test(String(id ?? ''))) return '';
    const folder = resolve(versionsRoot, String(id));
    return folder.startsWith(`${resolve(versionsRoot)}${sep}`) ? folder : '';
  };
  /** One kept version's file: '' unless the id and number are well formed and the file lies inside the store. */
  const fileOf = (id, n) => {
    const folder = folderOf(id);
    if (!folder || !Number.isInteger(Number(n)) || Number(n) < 1) return '';
    const file = resolve(folder, String(Number(n)));
    return file.startsWith(`${folder}${sep}`) ? file : '';
  };
  let frozen = false;
  const keepAside = (why) => {
    const aside = join(home, `index.damaged-${new Date(now()).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(2).toString('hex')}.json`);
    try {
      copyFileSync(indexFile, aside, constants.COPYFILE_EXCL);
      notice = `Artifacts' list could not be read (${why}). It was kept untouched as ${basename(aside)} in Artifacts' folder and a new list was started; the saved versions of your files were not touched.`;
    } catch {
      notice = `Artifacts' list could not be read (${why}) and could not be copied aside; it was left as it is and nothing new is saved until that is fixed.`;
      frozen = true;
    }
  };
  if (indexFile && existsSync(indexFile)) {
    try {
      const read = JSON.parse(readFileSync(indexFile, 'utf8')).artifacts ?? {};
      if (!read || typeof read !== 'object' || Array.isArray(read)) throw new Error('not a list');
      const good = {};
      let odd = 0;
      for (const [key, entry] of Object.entries(read)) {
        if (ID_FORM.test(key) && entry?.id === key && typeof entry.path === 'string' && Array.isArray(entry.versions) && Array.isArray(entry.sessions)) good[key] = entry;
        else odd += 1;
      }
      items = good;
      if (odd > 0) keepAside(`${odd} of its entries were not in the expected form`);
    } catch (error) {
      items = {};
      keepAside(error?.message ?? 'damaged');
    }
  }
  const save = () => {
    if (!indexFile || frozen) return;
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const temp = `${indexFile}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify({ artifacts: items }), { mode: 0o600 });
    renameSync(temp, indexFile);
  };
  const versionPath = (id, n) => fileOf(id, n);
  /** Delete one artifact's whole versions folder (never outside Artifacts' own folder). */
  const dropFolder = (id) => {
    const folder = folderOf(id);
    if (folder) rmSync(folder, { recursive: true, force: true });
  };
  const inScratch = (path) => Boolean(scratchRoot) && (path === scratchRoot || path.startsWith(`${scratchRoot.replace(/\/+$/, '')}/`));
  const view = (entry) => {
    const last = entry.versions.at(-1);
    let exists = false;
    try {
      exists = statSync(entry.path).isFile();
    } catch {
      exists = false;
    }
    return { id: entry.id, path: entry.path, name: basename(entry.path), kind: entry.kind, sealed: entry.sealed === true, noRender: entry.noRender === true, scratch: entry.scratch === true, star: entry.star === true, exists, versions: entry.versions.length, size: last?.size ?? 0, firstAt: entry.firstAt, lastAt: entry.lastAt, sessions: [...entry.sessions], modes: [...new Set(entry.versions.map((one) => one.mode).filter(Boolean))], folder: dirname(entry.path), lastSession: last?.sessionId ?? '', lastMode: last?.mode ?? '' };
  };
  const manifestFile = (trashDir, stamp) => join(trashDir, stamp, 'manifest.json');
  const writeManifest = (trashDir, manifest) => {
    mkdirSync(join(trashDir, manifest.stamp), { recursive: true, mode: 0o700 });
    const file = manifestFile(trashDir, manifest.stamp);
    writeFileSync(`${file}.tmp`, JSON.stringify(manifest), { mode: 0o600 });
    renameSync(`${file}.tmp`, file);
  };
  const readManifest = (trashDir, stamp) => {
    if (!trashDir || !STAMP.test(String(stamp ?? ''))) return null;
    try {
      const manifest = JSON.parse(readFileSync(manifestFile(trashDir, stamp), 'utf8'));
      return manifest && manifest.stamp === stamp && Array.isArray(manifest.moved) ? manifest : null;
    } catch {
      return null;
    }
  };

  /**
   * An artifact made again since a clean-up took it: its older history goes back in front of it, numbered
   * first, and the newer versions follow.
   */
  const mergeHistory = (current, old, fromDir) => {
    const dir = join(home, 'versions', current.id);
    const shift = Math.max(0, ...old.versions.map((one) => Number(one.n) || 0));
    const mine = new Set(current.versions.map((one) => one.n));
    // Look first: nothing is moved unless every place it goes to is free.
    for (const one of current.versions) if (home && there(join(dir, String(one.n + shift))) && !mine.has(one.n + shift)) throw new Error('its kept versions are not as expected; nothing was changed');
    for (const one of old.versions) if (home && there(join(dir, String(one.n))) && !mine.has(one.n)) throw new Error('its kept versions are not as expected; nothing was changed');
    if (home && shift > 0) {
      for (const one of [...current.versions].sort((a, b) => b.n - a.n)) {
        if (there(join(dir, String(one.n)))) renameSync(join(dir, String(one.n)), join(dir, String(one.n + shift)));
      }
    }
    for (const one of current.versions) one.n += shift;
    for (const one of old.versions) {
      const from = fromDir ? join(fromDir, String(one.n)) : '';
      if (home && from && there(from)) {
        mkdirSync(dir, { recursive: true, mode: 0o700 });
        renameSync(from, join(dir, String(one.n)));
      } else one.stored = false;
    }
    current.versions = [...old.versions, ...current.versions];
    current.sessions = [...new Set([...old.sessions, ...current.sessions])];
    current.firstAt = Math.min(old.firstAt, current.firstAt);
    current.star = current.star === true || old.star === true;
    current.sealed = current.sealed === true || old.sealed === true;
    current.noRender = current.noRender === true || old.noRender === true;
  };

  /** Put one moved artifact back. @returns {string} a note for the owner, or ''. */
  const restoreOne = (record) => {
    let note = '';
    if (record.file?.to && there(record.file.to)) {
      // Its place may be taken again (the file was made anew): then it comes back beside it, never over it.
      const target = there(record.file.from) ? freeName(record.file.from) : record.file.from;
      moveFresh(record.file.to, target);
      if (target !== record.file.from) note = `${basename(record.file.from)} was made again since the clean-up, so the one from the trash is back beside it as ${basename(target)}.`;
    }
    const current = items[record.id];
    if (current) {
      mergeHistory(current, record.entry, record.versionsTo);
      if (!note) note = `${basename(record.entry.path)} was made again since the clean-up; its older versions are back in front of the new ones.`;
    } else {
      const versionsHome = home ? join(home, 'versions', record.id) : '';
      if (record.versionsTo && there(record.versionsTo)) {
        if (versionsHome && there(versionsHome)) throw new Error('its kept versions are not as expected; nothing was changed');
        move(record.versionsTo, versionsHome);
      }
      items[record.id] = record.entry;
    }
    return note;
  };

  const store = {
    /** What the owner should be told about the list (a damaged one kept aside), in plain words; '' for nothing. */
    notice: () => notice,
    /**
     * Review B2 and #4: copies an older build kept of a sealed (Recon) artifact are deleted, one version at a
     * time, and only a version a Recon (isolated) conversation made. A version whose maker is not known to be
     * a Recon conversation (ordinary, unknown, or Modes not answering) is never touched.
     * @returns {{ran: boolean, deleted: number}} `ran` false: Modes could not say, so nothing was looked at.
     */
    purgeReconCopies() {
      if (!home) return { ran: false, deleted: 0 };
      let probe;
      try {
        probe = isolated('');
      } catch {
        probe = undefined;
      }
      // `undefined` means "Modes is not answering"; true/false/null is an answer.
      if (probe === undefined) return { ran: false, deleted: 0 };
      let deleted = 0;
      let changed = false;
      for (const [id, entry] of Object.entries(items)) {
        if (entry?.sealed !== true) continue;
        for (const version of entry.versions ?? []) {
          if (version?.stored !== true) continue;
          let verdict;
          try {
            verdict = isolated(String(version.sessionId ?? ''));
          } catch {
            verdict = undefined;
          }
          if (verdict !== true) continue;
          const file = fileOf(id, version.n);
          if (!file) continue;
          try {
            if (plainFile(file)) { unlinkSync(file); deleted += 1; }
            version.stored = false;
            changed = true;
          } catch { /* it stays; the next start tries again */ }
        }
        const folder = folderOf(id);
        if (folder) { try { rmdirSync(folder); } catch { /* not empty or not there: left as it is */ } }
      }
      if (changed) save();
      return { ran: true, deleted };
    },
    /** A fresh name for a clean-up in the trash folder. */
    newStamp() {
      return `${new Date(now()).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${randomBytes(3).toString('hex')}`;
    },
    /**
     * A conversation made or changed a file: a new version when its content changed.
     * @param {{path: string, sessionId: string, mode?: string, sealed?: boolean}} made
     * @returns {{id: string, version: number, isNew: boolean} | null} null when it is not a file (gone, a link, a folder).
     */
    record({ path, sessionId, mode = '', sealed = false }) {
      const file = String(path ?? '');
      if (!file.startsWith('/')) return null;
      let info;
      try {
        info = lstatSync(file);
      } catch {
        return null;
      }
      if (!info.isFile()) return null;
      const id = idOf(file);
      const at = now();
      const session = String(sessionId ?? '');
      let changed = false;
      let entry = items[id];
      if (!entry) {
        entry = items[id] = { id, path: file, kind: kindOf(file), sealed: false, noRender: BENCH_BACKUP.test(file), scratch: inScratch(file), star: false, firstAt: at, lastAt: at, versions: [], sessions: [] };
        changed = true;
      }
      // Once any version was made in a sealed conversation or in Recon's room, the artifact stays out of the list.
      if ((sealed || inReconRoom(file)) && entry.sealed !== true) {
        entry.sealed = true;
        changed = true;
      }
      if (!entry.sessions.includes(session)) {
        entry.sessions.push(session);
        changed = true;
      }
      const hash = fingerprint(file, info);
      const last = entry.versions.at(-1);
      if (last && last.hash === hash) {
        if (changed) save();
        return { id, version: last.n, isNew: false };
      }
      const n = (last?.n ?? 0) + 1;
      let stored = false;
      // A sealed artifact (a Recon conversation's, or a file in Recon's room) keeps no content: only the fact it was made.
      if (home && !entry.noRender && entry.sealed !== true) {
        try {
          mkdirSync(dirname(versionPath(id, n)), { recursive: true, mode: 0o700 });
          copyFileSync(file, versionPath(id, n), constants.COPYFILE_EXCL);
          stored = true;
        } catch {
          stored = false;
        }
      }
      entry.versions.push({ n, at, size: info.size, hash, sessionId: session, mode: String(mode ?? ''), stored });
      entry.lastAt = at;
      save();
      return { id, version: n, isNew: true };
    },
    /**
     * The versions a conversation made, as cards (in a window of time: one turn).
     * @returns {{id: string, name: string, path: string, kind: string, version: number, versions: number, at: number, noRender: boolean, sealed: boolean}[]}
     */
    cardsOf(sessionId, from = 0, to = Number.MAX_SAFE_INTEGER) {
      const out = [];
      for (const entry of Object.values(items)) {
        for (const version of entry.versions) {
          if (version.sessionId !== sessionId || version.at < from || version.at > to) continue;
          out.push({ id: entry.id, name: basename(entry.path), path: entry.path, kind: entry.kind, version: version.n, versions: entry.versions.length, at: version.at, noRender: entry.noRender === true, sealed: entry.sealed === true });
        }
      }
      return out.sort((a, b) => a.at - b.at);
    },
    /**
     * The Artifacts list: never a sealed artifact. Filters: mode, folder (starts with), kind, from/to (time), session.
     */
    list({ mode = '', folder = '', kind = '', from = 0, to = Number.MAX_SAFE_INTEGER, session = '' } = {}) {
      return Object.values(items)
        .filter((entry) => entry.sealed !== true)
        // A Scratch thread that was deleted took its artifacts to the trash with it: they leave the list (and
        // come back if the thread is put back).
        .filter((entry) => !(entry.scratch && !existsSync(entry.path)))
        .filter((entry) => !mode || entry.versions.some((one) => one.mode === mode))
        .filter((entry) => !folder || entry.path.startsWith(folder.replace(/\/+$/, '') + '/'))
        .filter((entry) => !kind || entry.kind === kind)
        .filter((entry) => entry.lastAt >= from && entry.firstAt <= to)
        .filter((entry) => !session || entry.sessions.includes(session))
        .sort((a, b) => b.lastAt - a.lastAt)
        .map(view);
    },
    /** Recon's artifacts, for the Danger zone's "show them outside Recon" only. */
    listSealed() {
      return Object.values(items).filter((entry) => entry.sealed === true).sort((a, b) => b.lastAt - a.lastAt).map(view);
    },
    /** One artifact with all its versions. */
    get(id) {
      const entry = items[String(id ?? '')];
      return entry ? { ...view(entry), versionList: entry.versions.map((one) => ({ ...one })) } : null;
    },
    /**
     * Where a version's content is: the kept copy, or the file itself for the newest when no copy was kept
     * (only while it is still a plain file there: never through a link put in its place).
     */
    versionFile(id, n) {
      const entry = items[String(id ?? '')];
      if (!entry) return '';
      const version = entry.versions.find((one) => one.n === Number(n)) ?? entry.versions.at(-1);
      if (!version) return '';
      if (version.stored && plainFile(versionPath(entry.id, version.n))) return versionPath(entry.id, version.n);
      return version === entry.versions.at(-1) && plainFile(entry.path) ? entry.path : '';
    },
    star(id, on) {
      const entry = items[String(id ?? '')];
      if (!entry) return false;
      entry.star = on === true;
      save();
      return true;
    },
    /**
     * The artifacts a clean-up filter picks: never a starred one, never a sealed one, never a Bench backup.
     * @param {{kinds?: string[], minBytes?: number, maxBytes?: number, olderThanDays?: number, newerThanDays?: number, mode?: string}} filter
     */
    matching({ kinds = [], minBytes = 0, maxBytes = Number.MAX_SAFE_INTEGER, olderThanDays = 0, newerThanDays = 0, mode = '' } = {}) {
      const day = 86_400_000;
      const t = now();
      return store.list({ mode })
        .filter((one) => !one.star && !one.noRender)
        .filter((one) => kinds.length === 0 || kinds.includes(one.kind))
        .filter((one) => one.size >= minBytes && one.size <= maxBytes)
        .filter((one) => !olderThanDays || one.lastAt <= t - olderThanDays * day)
        .filter((one) => !newerThanDays || one.lastAt >= t - newerThanDays * day)
        .map((one) => one.id);
    },
    /**
     * Move artifacts into the trash folder: their list entries and kept versions, and (when asked) the current
     * files from their folders. Never a starred, sealed or Bench backup one. What was moved is written down
     * in `<trashDir>/<stamp>/manifest.json`. If anything fails, all that was moved goes back and it throws.
     * @param {string[]} ids - the artifacts.
     * @param {{alsoFiles?: boolean, trashDir: string, stamp?: string}} options
     * @returns {{stamp: string, moved: {id: string, entry: object, versionsTo: string, file?: {from: string, to: string}}[]}}
     */
    remove(ids, { alsoFiles = false, trashDir, stamp = store.newStamp() }) {
      if (!trashDir) throw new Error('No trash folder.');
      if (!STAMP.test(String(stamp))) throw new Error('Not a clean-up name.');
      const room = join(trashDir, stamp);
      const moved = [];
      try {
        for (const id of [...new Set(ids)]) {
          const entry = items[id];
          if (!entry || entry.star === true || entry.sealed === true || entry.noRender === true) continue;
          const record = { id, entry: JSON.parse(JSON.stringify(entry)), versionsTo: '' };
          moved.push(record);
          const versions = folderOf(id);
          if (versions && existsSync(versions)) {
            move(versions, join(room, 'versions', id));
            record.versionsTo = join(room, 'versions', id);
          }
          if (alsoFiles && plainFile(entry.path)) {
            const to = join(room, 'files', id, basename(entry.path));
            move(entry.path, to);
            record.file = { from: entry.path, to };
          }
          delete items[id];
        }
        if (moved.length > 0) writeManifest(trashDir, { stamp, at: now(), inTrash: false, moved });
      } catch (error) {
        // Half a clean-up is none: what was moved goes back where it was.
        const stuck = [];
        for (const record of [...moved].reverse()) {
          try {
            if (record.file && there(record.file.to) && !there(record.file.from)) move(record.file.to, record.file.from);
            if (record.versionsTo && there(record.versionsTo) && !there(join(home, 'versions', record.id))) move(record.versionsTo, join(home, 'versions', record.id));
          } catch {
            stuck.push(record);
          }
          items[record.id] = record.entry;
        }
        // What could not go back stays written down, so the next tidy of the trash folder puts it back.
        if (stuck.length > 0) {
          try {
            writeManifest(trashDir, { stamp, at: now(), inTrash: false, moved: stuck });
          } catch { /* the files are still in the trash folder */ }
        } else if (there(room)) rmSync(room, { recursive: true, force: true });
        save();
        throw error;
      }
      save();
      return { stamp, moved };
    },
    /** The app's trash took this clean-up: from now on, its row going means it was erased for good. */
    markInTrash(trashDir, stamp) {
      const manifest = readManifest(trashDir, stamp);
      if (!manifest) return false;
      writeManifest(trashDir, { ...manifest, inTrash: true });
      return true;
    },
    /** What a clean-up moved, as written down in the trash folder (null when there is none). */
    readManifest,
    /**
     * Put back what a clean-up moved. A file whose place is taken again comes back beside it under a free
     * name, never over it; an artifact made again since gets its older versions back in front of the new.
     * @param {{moved?: object[]}} manifest
     * @param {{room?: string}} [options] - the clean-up's folder: every path must lie inside it.
     * @returns {{done: string[], left: object[], notes: string[]}}
     */
    putBack({ moved = [] } = {}, { room = '' } = {}) {
      const done = [];
      const left = [];
      const notes = [];
      for (const record of moved) {
        if (!ID_FORM.test(String(record?.id ?? '')) || !record.entry || !Array.isArray(record.entry.versions)) continue;
        try {
          if (room && ((record.versionsTo && !inside(room, record.versionsTo)) || (record.file?.to && !inside(room, record.file.to)))) throw new Error('its paths are not in its own trash folder');
          const note = restoreOne(record);
          if (note) notes.push(note);
          done.push(record.id);
        } catch (error) {
          left.push(record);
          notes.push(`${basename(record.entry.path ?? '')} could not be put back (${error?.message ?? error}).`);
        }
      }
      save();
      return { done, left, notes };
    },
    /** Put back a clean-up from its manifest in the trash folder (Put back in the app's trash). */
    putBackStamp(trashDir, stamp) {
      const manifest = readManifest(trashDir, stamp);
      if (!manifest) throw new Error('That clean-up is not in Artifacts\' trash folder any more.');
      const room = join(trashDir, stamp);
      const result = store.putBack(manifest, { room });
      if (result.left.length === 0) rmSync(room, { recursive: true, force: true });
      else writeManifest(trashDir, { ...manifest, moved: result.left });
      return result;
    },
    /** The clean-ups in the trash folder, by name. */
    stamps(trashDir) {
      try {
        return readdirSync(trashDir).filter((name) => STAMP.test(name));
      } catch {
        return [];
      }
    },
    /**
     * Conversations deleted for good (the trash's Delete permanently, Empty trash or its 30 days): the Scratch
     * artifacts that only they made, and whose files are gone with them, are removed with their versions.
     * @param {string[]} sessionIds - the conversations.
     * @returns {number} how many artifacts went.
     */
    /**
     * Recon's End and wipe (review B2): everything these conversations made is forgotten: the artifacts only
     * they made go with their versions; a file other conversations made too only loses the wiped ones.
     * @param {string[]} sessionIds - the wiped conversations.
     * @returns {number} how many artifacts went.
     */
    forgetSessions(sessionIds) {
      const gone = new Set((Array.isArray(sessionIds) ? sessionIds : []).map(String).filter(Boolean));
      if (gone.size === 0) return 0;
      let count = 0;
      let changed = false;
      for (const [id, entry] of Object.entries(items)) {
        if (!(entry.sessions ?? []).some((one) => gone.has(one))) continue;
        changed = true;
        if (entry.sessions.every((one) => gone.has(one))) {
          dropFolder(id);
          delete items[id];
          count += 1;
        } else {
          entry.sessions = entry.sessions.filter((one) => !gone.has(one));
          entry.versions = entry.versions.filter((one) => !gone.has(one.sessionId));
        }
      }
      if (changed) save();
      return count;
    },
    erased(sessionIds) {
      const gone = new Set((Array.isArray(sessionIds) ? sessionIds : []).map(String));
      let count = 0;
      for (const [id, entry] of Object.entries(items)) {
        if (!entry.scratch || existsSync(entry.path) || !entry.sessions.every((one) => gone.has(one))) continue;
        dropFolder(id);
        delete items[id];
        count += 1;
      }
      if (count) save();
      return count;
    },
  };
  return store;
}
