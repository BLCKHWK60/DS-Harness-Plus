/**
 * Keeps one code map per folder: loads it from disk, builds it on first use,
 * refreshes it when files changed, and never makes a caller wait long.
 */
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tooBroad } from './scan.js';
import { buildIndex, folderId, indexBytes, indexStats, linkIndex, loadIndex, removeIndex, saveIndex } from './store.js';

/** Files and folders that mark a folder as a code project. */
const PROJECT_MARKS = [
  '.git', 'package.json', 'pyproject.toml', 'requirements.txt', 'setup.py', 'go.mod', 'Cargo.toml', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'Gemfile', 'composer.json', 'CMakeLists.txt', 'Makefile', 'Package.swift',
  'tsconfig.json', 'deno.json', 'src',
];

/**
 * @param {object} options - where data lives and how limits are read.
 * @param {string} options.dataDir - folder that holds one sub-folder per mapped project.
 * @param {() => {maxFiles?: number, maxFileBytes?: number, extraIgnore?: string}} [options.limits] - current limits.
 * @param {number} [options.refreshMs] - how long a map is trusted before files are checked again.
 * @param {(message: string) => void} [options.warn] - logger.
 * @returns {object} the manager.
 */
export function createManager(options) {
  const dataDir = resolve(options.dataDir);
  const refreshMs = options.refreshMs ?? 20_000;
  /** Folder -> { index, links, building, progress, checkedAt, error }. */
  const states = new Map();
  /** Folder -> { at, value } for the "is this a code project" check. */
  const projectCache = new Map();

  /** @param {string} root @returns {object} the state of one folder. */
  function stateOf(root) {
    const key = resolve(root);
    let state = states.get(key);
    if (!state) {
      state = { root: key, id: folderId(key), index: null, links: null, building: null, progress: null, checkedAt: 0, error: null };
      const saved = loadIndex(join(dataDir, state.id));
      if (saved && resolve(saved.root) === key) {
        state.index = saved;
        state.links = linkIndex(saved);
      }
      states.set(key, state);
    }
    return state;
  }

  /**
   * Start building or refreshing a folder's map, unless that is already running.
   * @param {object} state - folder state.
   * @param {boolean} fresh - ignore the earlier map and read every file again.
   * @returns {Promise<void>} settles when the build ends; never rejects.
   */
  function start(state, fresh) {
    if (state.building) return state.building;
    const limits = options.limits?.() ?? {};
    const first = state.index === null;
    state.progress = { done: 0, total: 0, startedAt: Date.now() };
    state.building = buildIndex(state.root, {
      previous: fresh ? undefined : state.index ?? undefined,
      maxFiles: limits.maxFiles,
      maxFileBytes: limits.maxFileBytes,
      extraIgnore: limits.extraIgnore,
      onProgress: ({ files, done, total }) => {
        state.progress = { ...state.progress, done, total };
        // During the very first build, answers come from what has been read so far.
        if (first) state.partial = files;
      },
    })
      .then((index) => {
        state.index = index;
        state.links = linkIndex(index);
        state.error = null;
        try {
          saveIndex(join(dataDir, state.id), index);
        } catch (error) {
          options.warn?.(`code-map: could not save the map of ${state.root}: ${error?.message ?? error}`);
        }
      })
      .catch((error) => {
        state.error = String(error?.message ?? error);
        options.warn?.(`code-map: could not map ${state.root}: ${state.error}`);
      })
      .finally(() => {
        state.building = null;
        state.partial = null;
        state.partialView = null;
        state.checkedAt = Date.now();
      });
    return state.building;
  }

  return {
    dataDir,

    /**
     * Whether a folder may be mapped at all.
     * @param {string} root - absolute folder.
     * @returns {string | null} a plain reason when it may not, otherwise null.
     */
    refusal(root) {
      if (typeof root !== 'string' || root.trim() === '') return 'This conversation has no folder to map.';
      if (tooBroad(root)) return 'This folder is too broad to map (a home or system folder). Open a project folder instead.';
      if (!existsSync(root)) return 'The folder of this conversation no longer exists.';
      return null;
    },

    /**
     * Whether a folder looks like a code project (cheap, cached for a minute).
     * @param {string} root - absolute folder.
     * @returns {boolean} true when it has a saved map or a project file.
     */
    looksLikeProject(root) {
      if (typeof root !== 'string' || root === '' || tooBroad(root)) return false;
      const key = resolve(root);
      const cached = projectCache.get(key);
      if (cached && Date.now() - cached.at < 60_000) return cached.value;
      let value = false;
      try {
        value = states.get(key)?.index != null || existsSync(join(dataDir, folderId(key), 'index.json')) || PROJECT_MARKS.some((mark) => existsSync(join(key, mark)));
      } catch {
        value = false;
      }
      projectCache.set(key, { at: Date.now(), value });
      return value;
    },

    /**
     * The map of a folder, built or refreshed as needed, waiting at most `waitMs`.
     * @param {string} root - absolute folder.
     * @param {number} [waitMs] - longest wait; the build goes on in the background after it.
     * @returns {Promise<{index: object, links: object, running: boolean} | {error: string}>} the map, possibly partial.
     */
    async ensure(root, waitMs = 4000) {
      const reason = this.refusal(root);
      if (reason) return { error: reason };
      const state = stateOf(root);
      const stale = state.index === null || Date.now() - state.checkedAt > refreshMs;
      if (stale || state.building) {
        const work = start(state, false);
        let timer;
        await Promise.race([work, new Promise((done) => { timer = setTimeout(done, waitMs); })]);
        clearTimeout(timer);
      }
      if (state.building) {
        if (state.index) return { index: state.index, links: state.links, running: true };
        // First build still running: answer from the files read so far.
        const files = state.partial ?? {};
        const count = Object.keys(files).length;
        if (!state.partialView || state.partialView.count !== count) {
          const index = { version: 1, root: state.root, builtAt: Date.now(), truncated: null, skipped: {}, files: { ...files } };
          state.partialView = { count, index, links: linkIndex(index) };
        }
        return { index: state.partialView.index, links: state.partialView.links, running: true };
      }
      if (!state.index) return { error: state.error ? `The folder could not be mapped: ${state.error}` : 'The folder could not be mapped.' };
      return { index: state.index, links: state.links, running: false };
    },

    /**
     * Build a folder's map again from nothing.
     * @param {string} root - absolute folder.
     * @returns {Promise<{index: object} | {error: string}>} the new map.
     */
    async rebuild(root) {
      const reason = this.refusal(root);
      if (reason) return { error: reason };
      const state = stateOf(root);
      if (state.building) await state.building;
      await start(state, true);
      return state.index ? { index: state.index } : { error: state.error ?? 'The folder could not be mapped.' };
    },

    /**
     * Forget a folder's map, in memory and on disk.
     * @param {string} id - folder id (16 hex characters).
     * @returns {boolean} true when something was removed.
     */
    clear(id) {
      if (!/^[a-f0-9]{16}$/.test(String(id))) return false;
      let removed = false;
      for (const [key, state] of states) {
        if (state.id === id) {
          states.delete(key);
          projectCache.delete(key);
          removed = true;
        }
      }
      const dir = join(dataDir, id);
      if (existsSync(dir)) {
        removeIndex(dir);
        removed = true;
      }
      return removed;
    },

    /**
     * Every folder that has a saved or live map, with its numbers.
     * @returns {Array<object>} one row per folder, newest first.
     */
    list() {
      const rows = new Map();
      let ids = [];
      try {
        ids = readdirSync(dataDir).filter((name) => /^[a-f0-9]{16}$/.test(name));
      } catch {
        ids = [];
      }
      for (const id of ids) {
        const live = [...states.values()].find((state) => state.id === id);
        const index = live?.index ?? loadIndex(join(dataDir, id));
        if (!index) continue;
        rows.set(id, { id, folder: index.root, builtAt: index.builtAt, truncated: index.truncated ?? null, diskBytes: indexBytes(join(dataDir, id)), building: Boolean(live?.building), ...indexStats(index) });
      }
      for (const state of states.values()) {
        if (state.building && !rows.has(state.id)) {
          rows.set(state.id, { id: state.id, folder: state.root, builtAt: 0, truncated: null, diskBytes: 0, building: true, files: state.progress?.done ?? 0, symbols: 0, bytes: 0, lines: 0, languages: [] });
        }
      }
      return [...rows.values()].sort((a, b) => b.builtAt - a.builtAt);
    },

    /** @param {string} root @returns {string} the id of a folder. */
    idOf(root) {
      return folderId(root);
    },

    /** @param {string} id @returns {string | null} the folder with that id, if it has a map. */
    folderOf(id) {
      if (!/^[a-f0-9]{16}$/.test(String(id))) return null;
      for (const state of states.values()) if (state.id === id) return state.root;
      return loadIndex(join(dataDir, id))?.root ?? null;
    },
  };
}
