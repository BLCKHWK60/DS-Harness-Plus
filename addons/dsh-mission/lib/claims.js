/**
 * One writer per file (Mission stage D, 20 November 2026): which checklist item is changing which file, and the
 * folder lock that keeps file-changing commands apart from file writes. Pure apart from the timers it is given, so
 * it is tested without the app. index.js (the tool guard) and the runner (item checks, checkpoints) share one.
 *
 * Per conversation:
 *   claims  path -> {item, lane, hold}. A write tool claims the files it names for its item; a command's changes are
 *           claimed after it ran. A claim goes when its lane settles, except the files of an item that parked: those
 *           are kept as holds until the item goes on (or is let go).
 *   lock    two modes. Shared: a write tool's call. Exclusive: a command that may change files, an item's check, an
 *           item's or a lap's checkpoint. Exclusive waits for every shared entry but the asking lane's own and blocks
 *           new shared entries while it waits or runs, so it is never starved. Waits are at most `waitMs` (10 minutes)
 *           and end at once when the lane is stopped. An entry older than `staleMs` (15 minutes) no longer counts.
 *
 * Only Missions with more than one helper at once use any of it (pool size 1 runs exactly as stage C).
 */

/** How long a write or a command waits for the folder lock before it is refused (FOLDER_BUSY). */
export const LOCK_WAIT_MS = 10 * 60_000;
/** A lock entry older than this is taken as left behind (a call whose end never came) and no longer counts. */
export const LOCK_STALE_MS = 15 * 60_000;

/**
 * @param {{now?: () => number, setTimer?: Function, clearTimer?: Function, waitMs?: number, staleMs?: number}} [options]
 * @returns {object} the claims and the folder lock of every conversation.
 */
export function createClaims({ now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout, waitMs = LOCK_WAIT_MS, staleMs = LOCK_STALE_MS } = {}) {
  /** conversation -> {claims: Map, shared: Map(key -> {lane, at}), exclusive: {key, lane, at} | null, queue: []} */
  const all = new Map();
  const of = (conv) => {
    const key = String(conv ?? '');
    if (!all.has(key)) all.set(key, { claims: new Map(), shared: new Map(), exclusive: null, queue: [] });
    return all.get(key);
  };
  const fresh = (entry) => entry && now() - entry.at < staleMs;

  /** Let in whoever may enter now, in the order they asked. */
  const grant = (state) => {
    if (state.exclusive && !fresh(state.exclusive)) state.exclusive = null;
    for (const [key, entry] of state.shared) if (!fresh(entry)) state.shared.delete(key);
    for (let progressed = true; progressed;) {
      progressed = false;
      let firstExclusive;
      for (const waiter of state.queue) {
        if (waiter.mode === 'exclusive') {
          if (firstExclusive) continue;
          firstExclusive = waiter;
          const others = [...state.shared.values()].some((entry) => entry.lane !== waiter.lane);
          if (!state.exclusive && !others) {
            state.queue.splice(state.queue.indexOf(waiter), 1);
            state.exclusive = { key: waiter.key, lane: waiter.lane, at: now() };
            waiter.done(true);
            progressed = true;
            break;
          }
          continue;
        }
        // A shared call waits while another lane's command runs or waits ahead of it (exclusive is never starved).
        const held = state.exclusive && state.exclusive.lane !== waiter.lane;
        const ahead = firstExclusive && firstExclusive.lane !== waiter.lane;
        if (!held && !ahead) {
          state.queue.splice(state.queue.indexOf(waiter), 1);
          state.shared.set(waiter.key, { lane: waiter.lane, at: now() });
          waiter.done(true);
          progressed = true;
          break;
        }
      }
    }
  };

  return {
    /** @returns {{item: string, lane: string, hold: boolean} | undefined} who claims or holds a file now. */
    holder(conv, path) {
      const entry = of(conv).claims.get(String(path));
      return entry ? { ...entry } : undefined;
    },
    /**
     * Claim files for an item. Refused, and nothing claimed, when another item claims or holds one of them.
     * @returns {{ok: true} | {ok: false, path: string, by: {item: string, lane: string, hold: boolean}}}
     */
    claim(conv, paths, { item = '', lane = '' } = {}) {
      const state = of(conv);
      const list = [...new Set((paths ?? []).map(String).filter(Boolean))];
      for (const path of list) {
        const entry = state.claims.get(path);
        if (entry && entry.item !== String(item)) return { ok: false, path, by: { ...entry } };
      }
      for (const path of list) {
        const entry = state.claims.get(path);
        // A hold of the same item becomes this lane's claim again (the item went on).
        if (!entry || entry.hold || entry.lane !== lane) state.claims.set(path, { item: String(item), lane: String(lane), hold: false });
      }
      return { ok: true };
    },
    /** A lane settled: its claims go; with `keep` (its item parked) they become the item's holds. */
    settle(conv, lane, { keep = false } = {}) {
      const state = of(conv);
      for (const [path, entry] of state.claims) {
        if (entry.lane !== String(lane) || entry.hold) continue;
        if (keep) state.claims.set(path, { ...entry, lane: '', hold: true });
        else state.claims.delete(path);
      }
      // An entry kept past its lane (a command that went on as a background job) stays until it is left.
      for (const [key, entry] of state.shared) if (entry.lane === String(lane) && !entry.kept) state.shared.delete(key);
      if (state.exclusive?.lane === String(lane) && !state.exclusive.kept) state.exclusive = null;
      for (const waiter of [...state.queue]) if (waiter.lane === String(lane)) {
        state.queue.splice(state.queue.indexOf(waiter), 1);
        waiter.done(false);
      }
      grant(state);
    },
    /** Every claim and hold of an item goes (it went on, was let go, or the Mission ended). */
    releaseItem(conv, item) {
      const state = of(conv);
      for (const [path, entry] of state.claims) if (entry.item === String(item)) state.claims.delete(path);
    },
    /** Holds of parked items again after a restart (from the run). */
    rebuild(conv, entries) {
      const state = of(conv);
      for (const { item, paths } of entries ?? []) for (const path of paths ?? []) if (!state.claims.has(String(path))) state.claims.set(String(path), { item: String(item), lane: '', hold: true });
    },
    /** @returns {{path: string, item: string, hold: boolean}[]} what is claimed or held now. */
    list(conv) {
      return [...of(conv).claims].map(([path, entry]) => ({ path, item: entry.item, hold: entry.hold }));
    },
    /**
     * Enter the folder lock. Resolves true once in, false when it waited `waitMs` or the signal stopped it.
     * @param {string} conv - the conversation.
     * @param {string} key - the call (its call id) or the runner's own use.
     * @param {{lane: string, mode: 'shared' | 'exclusive', signal?: AbortSignal, maxMs?: number}} how - who and how.
     * @returns {Promise<boolean>}
     */
    enter(conv, key, { lane = '', mode = 'shared', signal, maxMs = waitMs } = {}) {
      const state = of(conv);
      return new Promise((resolve) => {
        let timer;
        let onAbort;
        const waiter = {
          key: String(key), lane: String(lane), mode,
          done: (ok) => {
            clearTimer(timer);
            signal?.removeEventListener?.('abort', onAbort);
            resolve(ok);
          },
        };
        if (signal?.aborted) {
          resolve(false);
          return;
        }
        state.queue.push(waiter);
        timer = setTimer(() => {
          const at = state.queue.indexOf(waiter);
          if (at >= 0) state.queue.splice(at, 1);
          waiter.done(false);
          grant(state);
        }, maxMs);
        timer?.unref?.();
        onAbort = () => {
          const at = state.queue.indexOf(waiter);
          if (at >= 0) {
            state.queue.splice(at, 1);
            waiter.done(false);
            grant(state);
          }
        };
        signal?.addEventListener?.('abort', onAbort, { once: true });
        grant(state);
      });
    },
    /** Keep a held entry fresh (a command that still runs in the background holds the lock longer than `staleMs`). */
    touch(conv, key) {
      const state = of(conv);
      if (state.exclusive?.key === String(key)) state.exclusive.at = now();
      const shared = state.shared.get(String(key));
      if (shared) shared.at = now();
    },
    /**
     * Keep a held entry past its lane: a command that went on as a background job keeps the folder lock after its
     * helper stopped, until `leave` (the job ended, the Mission stopped, or its time ran out).
     */
    keep(conv, key) {
      const state = of(conv);
      if (state.exclusive?.key === String(key)) state.exclusive.kept = true;
      const shared = state.shared.get(String(key));
      if (shared) shared.kept = true;
    },
    /** Leave the folder lock (the call ended). */
    leave(conv, key) {
      const state = of(conv);
      state.shared.delete(String(key));
      if (state.exclusive?.key === String(key)) state.exclusive = null;
      grant(state);
    },
    /** @returns {{shared: number, exclusive: string, waiting: number}} the lock as it stands (tests, status). */
    lockOf(conv) {
      const state = of(conv);
      return { shared: state.shared.size, exclusive: state.exclusive?.key ?? '', waiting: state.queue.length };
    },
    /** Forget a conversation (its Mission ended). Waiters are let go with false. */
    clear(conv) {
      const state = all.get(String(conv ?? ''));
      if (!state) return;
      for (const waiter of state.queue.splice(0)) waiter.done(false);
      all.delete(String(conv ?? ''));
    },
  };
}
