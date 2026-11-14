/**
 * The comparisons that were run: kept in one small file so the page can show them after a restart.
 * A comparison keeps each pane's figures, the end of what it said, and what it changed.
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const KEEP = 20;

/**
 * @param {string} file - where they are kept; '' keeps them in memory.
 * @returns {object} the record.
 */
export function openRuns(file) {
  let runs = [];
  if (file) {
    try {
      const read = JSON.parse(readFileSync(file, 'utf8'));
      if (Array.isArray(read)) runs = read.filter((run) => run && typeof run.id === 'string' && Array.isArray(run.panes));
    } catch {
      runs = [];
    }
    // A comparison that was running when the app closed did not finish.
    for (const run of runs) {
      for (const pane of run.panes) {
        if (pane.status === 'running' || pane.status === 'waiting') {
          pane.status = 'stopped';
          pane.error = 'The app was closed while this was running.';
          pane.endedAt = pane.endedAt || Date.now();
        }
      }
    }
  }
  const save = () => {
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const temp = `${file}.${process.pid}.tmp`;
      writeFileSync(temp, JSON.stringify(runs));
      renameSync(temp, file);
    } catch {
      /* the page still has them in memory */
    }
  };
  return {
    list: () => runs,
    get: (id) => runs.find((run) => run.id === id),
    /** Add a comparison. @returns {string[]} the ids of old comparisons that were dropped to make room. */
    add(run) {
      runs = [run, ...runs];
      const dropped = runs.slice(KEEP).map((old) => old.id);
      runs = runs.slice(0, KEEP);
      save();
      return dropped;
    },
    remove(id) {
      const had = runs.some((run) => run.id === id);
      runs = runs.filter((run) => run.id !== id);
      if (had) save();
      return had;
    },
    save,
  };
}

/** @returns {boolean} whether every pane of a comparison has ended. */
export const ended = (run) => run.panes.every((pane) => pane.status !== 'running' && pane.status !== 'waiting');
