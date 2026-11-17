/**
 * Split Plus, step 6: pane sets (the owner's answer: "Pane sets", since "saved layout" already means Cowork
 * shell's layouts). Two kinds, kept in Split Plus's folder (`sets.json`):
 *
 * - **A folder's panes:** the panes last open for a folder (their conversations, tabs and order), so opening
 *   that folder again brings them back.
 * - **A named pane set:** tabs and their order only (no conversation), e.g. "Code, Research, Chat", opened in
 *   any folder as new conversations.
 *
 * A pane set holds no signed-in switch and no permission (the owner's rule): only conversation ids, tabs and
 * order. New conversations from a named set start at their tab's starting permission.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_PANES } from './panes.js';

/** At most this many named pane sets, and this many folders remembered. */
export const MAX_NAMED = 30;
export const MAX_FOLDERS = 200;
const MODE_ID = /^[a-z0-9][a-z0-9_-]{0,40}$/i;
const SESSION_ID = /^[A-Za-z0-9._:-]{1,200}$/;

/** A pane of a saved set, cleaned: only a conversation id (for a folder's panes) and a tab. */
function cleanPane(row, withSession) {
  if (!row || typeof row !== 'object') return null;
  const mode = String(row.mode ?? '');
  if (!MODE_ID.test(mode)) return null;
  if (!withSession) return { mode };
  const sessionId = String(row.sessionId ?? '');
  return SESSION_ID.test(sessionId) ? { sessionId, mode } : null;
}

/** A pane set's name: plain words, at most 60 characters. */
export function cleanName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (!name) throw new Error('Give the pane set a name.');
  return name;
}

/**
 * @param {{home?: string, now?: () => number}} [options] - `home`: the folder for sets.json ('' in memory).
 */
export function openSets({ home = '', now = Date.now } = {}) {
  const file = home ? join(home, 'sets.json') : '';
  // Keyed by folder and by name: objects without a prototype, so no key (`__proto__`, say) is special.
  const bare = (value) => Object.assign(Object.create(null), value && typeof value === 'object' && !Array.isArray(value) ? value : {});
  let state = { folders: bare(), named: bare() };
  if (file && existsSync(file)) {
    try {
      const saved = JSON.parse(readFileSync(file, 'utf8'));
      state = { folders: bare(saved?.folders), named: bare(saved?.named) };
    } catch { /* a damaged file starts empty */ }
  }
  const save = () => {
    if (!file) return;
    mkdirSync(home, { recursive: true, mode: 0o700 });
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    renameSync(temp, file);
  };
  return {
    /** Remember the panes open for a folder (its conversations, tabs and order). */
    saveFolder(folder, panes) {
      const path = String(folder ?? '');
      if (!path.startsWith('/')) return false;
      const rows = (Array.isArray(panes) ? panes : []).map((row) => cleanPane(row, true)).filter(Boolean).slice(0, MAX_PANES);
      if (rows.length === 0) return false;
      delete state.folders[path];
      state.folders[path] = { panes: rows, at: now() };
      const keys = Object.keys(state.folders);
      for (const key of keys.slice(0, Math.max(0, keys.length - MAX_FOLDERS))) delete state.folders[key];
      save();
      return true;
    },
    /** The panes last open for a folder, or null. */
    folderPanes(folder) {
      const entry = state.folders[String(folder ?? '')];
      return entry ? { panes: entry.panes.map((row) => ({ ...row })), at: entry.at } : null;
    },
    /** Save tabs and their order under a name (a name already there is replaced). */
    saveNamed(name, panes) {
      const key = cleanName(name);
      const rows = (Array.isArray(panes) ? panes : []).map((row) => cleanPane(row, false)).filter(Boolean).slice(0, MAX_PANES);
      if (rows.length === 0) throw new Error('A pane set needs at least one pane.');
      if (!state.named[key] && Object.keys(state.named).length >= MAX_NAMED) throw new Error(`At most ${MAX_NAMED} pane sets: remove one first.`);
      state.named[key] = { panes: rows, at: now() };
      save();
      return { name: key, panes: rows };
    },
    dropNamed(name) {
      const key = String(name ?? '');
      if (!state.named[key]) return false;
      delete state.named[key];
      save();
      return true;
    },
    named() {
      return Object.entries(state.named).sort((a, b) => b[1].at - a[1].at).map(([name, entry]) => ({ name, panes: entry.panes.map((row) => ({ ...row })) }));
    },
    namedSet(name) {
      const entry = state.named[String(name ?? '')];
      return entry ? entry.panes.map((row) => ({ ...row })) : null;
    },
    /** A conversation was deleted for good: it leaves every folder's panes. */
    forgetSession(sessionId) {
      const id = String(sessionId ?? '');
      let changed = false;
      for (const [path, entry] of Object.entries(state.folders)) {
        const left = (entry?.panes ?? []).filter((row) => row.sessionId !== id);
        if (left.length === (entry?.panes ?? []).length) continue;
        changed = true;
        if (left.length === 0) delete state.folders[path];
        else state.folders[path] = { ...entry, panes: left };
      }
      if (changed) save();
      return changed;
    },
  };
}
