/**
 * Split Plus: how many panes may use a model on this Mac or the owner's own server at the same time.
 * A pane takes a place when its turn (or one of its helpers) first calls such a model; the place is
 * given back when the last of them goes idle, so a helper still at work after its conversation's turn
 * keeps the place, and a pane never waits for itself. A pane over the limit waits, first come first
 * served, and says so (the Split page reads `waiting()`). Online models never count.
 */

/**
 * @param {() => number} limitOf - the current limit (the setting, read at every decision).
 */
export function openLocalGate(limitOf) {
  /** pane → the conversation and helpers using its place now */
  const holders = new Map();
  /** @type {{pane: string, waiters: {agent: string, resolve: (got: boolean) => void}[]}[]} */
  const queue = [];
  const limit = () => {
    const value = Math.round(Number(limitOf()));
    return Number.isFinite(value) && value >= 1 ? value : 1;
  };
  const admit = () => {
    while (queue.length > 0 && holders.size < limit()) {
      const next = queue.shift();
      holders.set(next.pane, new Set(next.waiters.map((waiter) => waiter.agent)));
      for (const waiter of next.waiters) waiter.resolve(true);
    }
  };
  /** Take one waiter out of the queue (its turn stopped or it went away). */
  const dropWaiter = (entry, waiter) => {
    const at = entry.waiters.indexOf(waiter);
    if (at < 0) return false;
    entry.waiters.splice(at, 1);
    if (entry.waiters.length === 0) {
      const index = queue.indexOf(entry);
      if (index >= 0) queue.splice(index, 1);
    }
    waiter.resolve(false);
    return true;
  };
  return {
    /**
     * Wait for a place. Resolves true with a place, false when the wait was called off.
     * @param {string} pane - the pane's conversation.
     * @param {AbortSignal} [signal] - this agent's signal: a stopped turn stops waiting (its own wait only).
     * @param {string} [agent] - the conversation or helper asking (the pane itself when not given).
     */
    acquire(pane, signal, agent = pane) {
      const using = holders.get(pane);
      if (using) {
        using.add(agent);
        return Promise.resolve(true);
      }
      if (signal?.aborted) return Promise.resolve(false);
      if (holders.size < limit() && queue.length === 0) {
        holders.set(pane, new Set([agent]));
        return Promise.resolve(true);
      }
      return new Promise((resolve) => {
        let entry = queue.find((row) => row.pane === pane);
        if (!entry) {
          entry = { pane, waiters: [] };
          queue.push(entry);
        }
        const waiter = { agent, resolve };
        entry.waiters.push(waiter);
        signal?.addEventListener?.('abort', () => {
          if (dropWaiter(entry, waiter)) admit();
        }, { once: true });
      });
    },
    /**
     * An agent went idle or away: it no longer uses its pane's place (nor waits for one). The place is
     * given back when nobody in the pane uses it, and the next pane comes in.
     */
    release(agent) {
      for (const [pane, using] of holders) {
        using.delete(agent);
        if (using.size === 0) holders.delete(pane);
      }
      for (const entry of [...queue]) {
        for (const waiter of entry.waiters.filter((row) => row.agent === agent)) dropWaiter(entry, waiter);
      }
      admit();
    },
    /** The pane's conversation went away: its place goes, whoever still used it. */
    releasePane(pane) {
      holders.delete(pane);
      const entry = queue.find((row) => row.pane === pane);
      if (entry) for (const waiter of [...entry.waiters]) dropWaiter(entry, waiter);
      admit();
    },
    /** A raised limit lets waiting panes in at once. */
    recheck: admit,
    holding: () => [...holders.keys()],
    waiting: () => queue.map((entry) => entry.pane),
  };
}
