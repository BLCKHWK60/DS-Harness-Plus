/**
 * The main side of the query worker: one helper process, started on first use, ended and
 * replaced when a job runs past its time.
 *
 * It is a process, not a thread: a query that never ends sits inside the database, where a thread
 * cannot be interrupted. A process can always be ended.
 */
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const JOB_MS = 90_000;

/**
 * @returns {{run: (job: object, timeoutMs?: number) => Promise<object>, stop: () => void}} the engine.
 */
export function createEngine() {
  let child;
  let next = 1;
  /** Job id -> { done, fail, timer }. */
  const waiting = new Map();
  const drop = (reason) => {
    for (const job of waiting.values()) {
      clearTimeout(job.timer);
      job.fail(new Error(reason));
    }
    waiting.clear();
    const old = child;
    child = undefined;
    if (old) {
      old.removeAllListeners();
      try {
        old.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
  };
  const start = () => {
    // The app runs on Electron's Node; the flag makes the helper a plain Node process too.
    child = fork(fileURLToPath(new URL('./worker.js', import.meta.url)), [], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], execArgv: [] });
    // It must not keep the app from quitting.
    child.unref();
    child.channel?.unref?.();
    const mine = child;
    mine.on('message', (message) => {
      const job = waiting.get(message?.id);
      if (!job) return;
      waiting.delete(message.id);
      clearTimeout(job.timer);
      if (waiting.size === 0) mine.channel?.unref?.();
      if (message.ok) job.done(message.value);
      else job.fail(new Error(message.error));
    });
    mine.on('error', (error) => {
      if (child === mine) drop(`The data engine stopped: ${String(error?.message ?? error).slice(0, 200)}`);
    });
    mine.on('exit', () => {
      if (child === mine) drop('The data engine stopped.');
    });
  };
  return {
    run(job, timeoutMs = JOB_MS) {
      if (!child || !child.connected) {
        if (child) drop('The data engine stopped.');
        start();
      }
      const id = next++;
      return new Promise((done, fail) => {
        const timer = setTimeout(() => {
          // The whole helper goes: a running query cannot be interrupted any other way.
          drop(`It took longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped. Narrow the query (filter, aggregate, fewer joins) or use a smaller file.`);
        }, timeoutMs);
        waiting.set(id, { done, fail, timer });
        // While a job is waiting, the channel keeps the process alive so the answer can arrive.
        child.channel?.ref?.();
        child.send({ ...job, id }, (error) => {
          if (error && waiting.has(id)) {
            clearTimeout(timer);
            waiting.delete(id);
            fail(new Error('The data engine could not be reached.'));
          }
        });
      });
    },
    stop() {
      drop('The data engine was switched off.');
    },
  };
}
