/**
 * Which conversations have a permission mode on, and what the user has said yes to in each.
 * Kept in one JSON file so it holds across restarts.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { MODES } from './guard.js';

export const CONVERSATIONS_MAX = 300;
export const APPROVED_MAX = 5000;

/**
 * @param {string} file - JSON file; '' keeps everything in memory.
 * @returns {object} the record.
 */
export function openState(file) {
  /** @type {Map<string, {mode: string, root: string, approved: Set<string>, outside: Set<string>, preset: string, at: number}>} */
  const table = new Map();
  if (file) {
    try {
      const read = JSON.parse(readFileSync(file, 'utf8'));
      for (const [id, entry] of Object.entries(read && typeof read === 'object' ? read : {})) {
        if (!MODES.includes(entry?.mode) || typeof entry.root !== 'string' || !entry.root) continue;
        const list = (value) => new Set((Array.isArray(value) ? value : []).filter((item) => typeof item === 'string'));
        table.set(id, { mode: entry.mode, root: entry.root, approved: list(entry.approved), outside: list(entry.outside), preset: typeof entry.preset === 'string' ? entry.preset : '', at: Number(entry.at) || 0 });
      }
    } catch {
      table.clear();
    }
  }
  let timer;
  const write = () => {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    const plain = Object.fromEntries([...table].map(([id, entry]) => [id, { mode: entry.mode, root: entry.root, approved: [...entry.approved], outside: [...entry.outside], preset: entry.preset, at: entry.at }]));
    const temp = `${file}.${process.pid}.tmp`;
    writeFileSync(temp, JSON.stringify(plain));
    renameSync(temp, file);
  };
  /** Approvals arrive in bursts; one write shortly after is enough. */
  const later = () => {
    if (!file || timer) return;
    timer = setTimeout(() => {
      timer = undefined;
      try {
        write();
      } catch {
        /* written at the next change */
      }
    }, 300);
    timer.unref?.();
  };
  return {
    /** @param {string} id @returns {object | undefined} the conversation's entry. */
    get: (id) => table.get(id),
    /** @returns {string[]} ids of conversations with a mode on. */
    ids: () => [...table.keys()],
    /** Switch a mode on, or change it. What was approved before stays approved. */
    set(id, { mode, root, preset }) {
      if (!MODES.includes(mode)) throw new Error(`unknown mode ${mode}`);
      const before = table.get(id);
      const same = before && before.root === root;
      table.set(id, { mode, root, approved: same ? before.approved : new Set(), outside: same ? before.outside : new Set(), preset: before?.preset || preset || '', at: Date.now() });
      // The oldest conversations make room.
      if (table.size > CONVERSATIONS_MAX) for (const [old] of [...table].sort((a, b) => a[1].at - b[1].at).slice(0, table.size - CONVERSATIONS_MAX)) table.delete(old);
      write();
      return table.get(id);
    },
    /** Switch the mode off. @returns {object | undefined} the entry that was there. */
    clear(id) {
      const before = table.get(id);
      if (before) {
        table.delete(id);
        write();
      }
      return before;
    },
    /** The user said yes to changing these files inside the folder, or the assistant made them itself. */
    approve(id, paths) {
      const entry = table.get(id);
      if (!entry) return;
      for (const path of paths) if (entry.approved.size < APPROVED_MAX) entry.approved.add(path);
      later();
    },
    /** The user said yes to these places outside the folder. */
    allowOutside(id, paths) {
      const entry = table.get(id);
      if (!entry) return;
      for (const path of paths) if (entry.outside.size < APPROVED_MAX) entry.outside.add(path);
      later();
    },
    /** Write now; for shutdown and tests. */
    flush() {
      clearTimeout(timer);
      timer = undefined;
      write();
    },
  };
}

/**
 * Whether a place outside the folder is covered by an earlier yes: the place itself, or a folder
 * above it that was allowed.
 * @param {Set<string>} allowed - the places the user said yes to.
 * @param {string} path - the place asked about.
 * @returns {boolean}
 */
export function covered(allowed, path) {
  if (allowed.has(path)) return true;
  for (const place of allowed) if (path.startsWith(`${place}/`)) return true;
  return false;
}
