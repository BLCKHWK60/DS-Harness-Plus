/**
 * Keep-awake for Long runs (the owner's plan, Long run part, step 57): while a Long run is on, macOS's own
 * `caffeinate` keeps the Mac from sleeping when idle (the screen may still turn off; closing a laptop's lid
 * still puts it to sleep). On battery only when the run allows it. One process at most, tied to the app's
 * own process (`-w`), so it ends with the app even if this add-on cannot stop it.
 */
import { execFile, spawn as spawnProcess } from 'node:child_process';

export const CAFFEINATE = '/usr/bin/caffeinate';

/** @returns {Promise<boolean | undefined>} whether the Mac runs on power (undefined: cannot tell). */
export function onPower(exec = execFile) {
  return new Promise((resolve) => {
    try {
      exec('/usr/bin/pmset', ['-g', 'batt'], { timeout: 5000 }, (error, stdout) => {
        if (error) return resolve(undefined);
        const text = String(stdout ?? '');
        if (/AC Power/.test(text)) return resolve(true);
        if (/Battery Power/.test(text)) return resolve(false);
        return resolve(undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

/**
 * @param {object} [deps] - for tests.
 * @param {(command: string, args: string[], options: object) => {kill: () => void, on: Function, pid?: number}} [deps.spawn]
 * @param {() => Promise<boolean | undefined>} [deps.power] - on power?
 * @param {number} [deps.pid] - the process to tie caffeinate to.
 * @param {(text: string) => void} [deps.warn]
 * @returns {{want: (id: string, on: boolean, battery?: boolean) => Promise<boolean>, stop: () => void, running: () => boolean}} the keeper.
 */
export function createAwake({ spawn = spawnProcess, power = onPower, pid = process.pid, warn = () => {} } = {}) {
  /** Conversation id -> whether its run allows battery. */
  const wanted = new Map();
  let child;
  const stopChild = () => {
    if (!child) return;
    try {
      child.kill();
    } catch {
      /* already gone */
    }
    child = undefined;
  };
  const startChild = () => {
    if (child) return;
    try {
      const spawned = spawn(CAFFEINATE, ['-i', '-w', String(pid)], { stdio: 'ignore' });
      child = spawned;
      // Only this process's own end clears it: an older one ending late must not hide a newer one.
      spawned.on?.('exit', () => { if (child === spawned) child = undefined; });
      spawned.on?.('error', (error) => { warn(`could not keep the Mac awake: ${String(error?.message ?? error)}`); if (child === spawned) child = undefined; });
    } catch (error) {
      warn(`could not keep the Mac awake: ${String(error?.message ?? error)}`);
      child = undefined;
    }
  };
  const settle = async () => {
    if (wanted.size === 0) {
      stopChild();
      return false;
    }
    const plugged = await power();
    // Asking about power takes a moment: a run may have ended meanwhile (then nothing is kept awake).
    if (wanted.size === 0) {
      stopChild();
      return false;
    }
    // On battery only when every run that wants it allows battery: a run that does not would drain it.
    const allowed = plugged !== false || [...wanted.values()].every(Boolean);
    if (allowed) startChild();
    else stopChild();
    return allowed && Boolean(child);
  };
  return {
    async want(id, on, battery = false) {
      if (on) wanted.set(String(id), battery === true);
      else wanted.delete(String(id));
      return settle();
    },
    stop() {
      wanted.clear();
      stopChild();
    },
    running: () => Boolean(child),
  };
}
