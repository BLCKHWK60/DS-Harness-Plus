// ---- dsh-poll:begin ---- shared polling helpers; this block is the same in every add-on page file that uses it.
// The master copy is docs/shared/dsh-poll.js. Change it there, then run `node scripts/sync-kit.mjs` (it copies the block into
// every client.js that has the two marker lines, and `bash scripts/check.sh` fails when a copy has drifted).
// Why it exists (review perf-settings-describe, 18 November 2026): every add-on page looked at the app's Settings and at its own
// routes on its own timer, even in a hidden window. This gives all of them ONE shared Settings copy (read once, renewed when
// Settings changes or after 30 seconds at the most) and one kind of polling loop that stops while the window is hidden.
// The first copy of this block to run puts the shared state on `window.__dshPoll`; later copies reuse it, so 30 add-ons share one.
// A newer copy (higher API) replaces an older shared object instead of reusing it, so an older page file that runs first (an
// add-on edited in creator mode, a partly updated install) cannot keep the whole page on an older helper. Raise API with every
// change to how the shared state behaves.
const dshPoll = (() => {
  const API = 2;
  const root = typeof window !== 'undefined' ? window : globalThis;
  if (root.__dshPoll && root.__dshPoll.api >= API) return root.__dshPoll;

  /** How long a read of Settings stays good: with the change event working, 30 s is only a safety net. */
  const SETTINGS_TTL = 30000;
  /** Without the change event (an older app) the copy is only trusted for a moment. */
  const SETTINGS_TTL_NO_EVENTS = 2000;
  const WRITES = ['mutate', 'update', 'replace'];
  const stats = { settingsCalls: 0, settingsHits: 0, settingsInvalidations: 0, runs: 0, errors: 0, changes: 0, repeats: 0, watchers: 0 };
  const cache = { value: undefined, at: 0, inflight: null, gen: 0, events: false };
  const changeListeners = new Set();
  const watched = new WeakSet();
  const wrapped = new WeakSet();
  const loops = new Set();

  const isHidden = () => typeof root.document !== 'undefined' && root.document.hidden === true;
  // The page's timers (a test page without any simply never schedules).
  const setTimer = (fn, ms) => (typeof root.setTimeout === 'function' ? root.setTimeout(fn, ms) : typeof globalThis.setTimeout === 'function' ? globalThis.setTimeout(fn, ms) : null);
  const clearTimer = (id) => { if (id === null) return; if (typeof root.clearTimeout === 'function') root.clearTimeout(id); else if (typeof globalThis.clearTimeout === 'function') globalThis.clearTimeout(id); };

  /** Throw the shared copy away: the next read goes to the app. A read still on its way is not kept. */
  function invalidate() {
    stats.settingsInvalidations += 1;
    cache.value = undefined;
    cache.inflight = null;
    cache.gen += 1;
  }

  /** Changes already handled, `ns + revision` -> when: the same change reaches the page once per add-on that listens. */
  const heard = new Map();
  /** How long a change counts as "the same one" when it arrives again through another add-on's connection. */
  const HEARD_MS = 2000;
  /** The app's own marker for a wrapped service: `ctx.remote` hands out a NEW wrapper object at every read. */
  const ORIGINAL = typeof Symbol === 'function' ? Symbol.for('cordis.original') : '__original';
  /** Marks our own write wrapper, so it is never wrapped a second time. */
  const OURS = '__dshPollWrite';

  /**
   * One "Settings changed" event from the app. Every add-on that listens hears the same event; it is acted on once.
   * Bug of 21 November 2026 (a new chat made the page read Settings 12-17 times a second, the app ran at 100% and the
   * tab crashed): `ctx.remote` is a new object at every read, so the old `watched.has(remote)` never matched and every
   * read added one more listener; one change then woke every listener and each one started its own read.
   */
  function changed(ns, revision) {
    if (typeof revision === 'number' || typeof revision === 'string') {
      const now = Date.now();
      for (const [key, at] of heard) if (now - at > HEARD_MS) heard.delete(key);
      const key = `${String(ns)}\u0000${String(revision)}`;
      if (heard.has(key)) { stats.repeats += 1; return; }
      heard.set(key, now);
    }
    stats.changes += 1;
    invalidate();
    for (const listener of [...changeListeners]) {
      try { listener(ns); } catch { /* one listener's trouble must not stop the others */ }
    }
  }

  /** Listen once per add-on for "Settings changed" (the app sends it after every write, from any window). */
  function watch(ctx) {
    const remote = ctx && ctx.remote;
    if (!remote) return;
    // Keyed on the add-on's own context, which stays the same object (its `remote` does not).
    const key = ctx !== null && (typeof ctx === 'object' || typeof ctx === 'function') ? ctx : (remote[ORIGINAL] || remote);
    if (watched.has(key)) return;
    watched.add(key);
    try {
      if (typeof remote.$on === 'function') {
        remote.$on('settings/document-updated', changed);
        stats.watchers += 1;
        cache.events = true;
      }
    } catch { /* no change event here: the short copy time covers it */ }
    try {
      if (typeof ctx.on === 'function') ctx.on('connection/reset', () => { heard.clear(); invalidate(); });
    } catch { /* optional */ }
    // This page's own writes drop the copy before their answer comes back, so a read that follows a write is never behind it.
    const settings = remote.settings;
    const target = settings && (settings[ORIGINAL] || settings);
    if (settings && !wrapped.has(target)) {
      wrapped.add(target);
      for (const name of WRITES) {
        const original = settings[name];
        // Already ours (put there through another add-on's wrapper object): wrapping it again would stack wrappers.
        // An older copy's wrapper (marked `true`) is wrapped once more: it drops only the older copy's own cache.
        if (typeof original !== 'function' || original[OURS] === API) continue;
        try {
          const write = function (...args) {
            invalidate();
            const done = original.apply(this, args);
            return done && typeof done.then === 'function' ? done.then((out) => { invalidate(); return out; }, (error) => { invalidate(); throw error; }) : done;
          };
          write[OURS] = API;
          settings[name] = write;
        } catch { /* a frozen object keeps the plain call */ }
      }
    }
  }

  /**
   * The app's Settings, the same answer as `ctx.remote.settings.describe()`, but read once for the whole page.
   * @param {object} ctx - the add-on's own context (its `remote.settings` makes the call).
   * @param {{fresh?: boolean}} [options] - `fresh: true` skips the shared copy (use it for the read before a save, so a stale
   *   revision cannot cause a conflict; every write drops the copy anyway).
   * @returns {Promise<object>} `{ok, value: {namespaces}}` or `{ok: false, error}`, never rejected for a bad answer.
   */
  function settings(ctx, options) {
    watch(ctx);
    const fresh = options && options.fresh === true;
    const ttl = cache.events ? SETTINGS_TTL : SETTINGS_TTL_NO_EVENTS;
    if (!fresh && cache.value !== undefined && Date.now() - cache.at < ttl) {
      stats.settingsHits += 1;
      return Promise.resolve(cache.value);
    }
    if (!fresh && cache.inflight) {
      stats.settingsHits += 1;
      return cache.inflight;
    }
    stats.settingsCalls += 1;
    const gen = cache.gen;
    const call = Promise.resolve(ctx.remote.settings.describe()).then((result) => {
      if (gen === cache.gen) {
        cache.inflight = null;
        if (result && result.ok !== false) { cache.value = result; cache.at = Date.now(); }
      }
      return result;
    }, (error) => {
      if (gen === cache.gen) cache.inflight = null;
      throw error;
    });
    if (!fresh) cache.inflight = call;
    return call;
  }

  /** One namespace's entry (`{ns, value, revision}`) from the shared copy, or undefined. */
  async function entry(ctx, ns, options) {
    const result = await settings(ctx, options);
    return result && result.ok !== false ? result.value.namespaces.find((item) => item.ns === ns) : undefined;
  }

  /** Be told when Settings changes (from this window or another). Returns the way to stop listening. */
  function onChange(ctx, listener) {
    watch(ctx);
    changeListeners.add(listener);
    return () => { changeListeners.delete(listener); };
  }

  /**
   * A polling loop that waits for its last run to finish, stops while the window is hidden and starts again, at once, when it
   * is shown. One timer per loop, never an interval.
   * @param {() => (Promise<unknown> | unknown)} run - one look. It may return a number (the wait before the next look, in ms),
   *   'idle' (wait `idle`: nothing to watch for now) or anything else (wait `every`).
   * @param {{every: number | (() => number), idle?: number, hidden?: number | (() => number), immediate?: boolean}} options
   *   `every`: wait while there is something to watch; `idle`: wait when the run says 'idle' (default five times `every`);
   *   `hidden`: wait while the window is hidden (default 0 = no looking at all until it is shown);
   *   `immediate`: look right away (default true).
   * @returns {{stop: () => void, poke: () => void, running: () => boolean}} `poke()` looks now (once, even if called often).
   */
  function loop(run, options) {
    const opts = options || {};
    const read = (value, fallback) => (typeof value === 'function' ? value() : typeof value === 'number' ? value : fallback);
    let timer = null;
    let alive = true;
    let busy = false;
    let again = false;
    let failures = 0;
    let next = null;

    const clear = () => { if (timer !== null) { clearTimer(timer); timer = null; } };
    const schedule = (wait) => {
      clear();
      if (!alive) return;
      if (isHidden()) {
        const away = read(opts.hidden, 0);
        if (!(away > 0)) return; // paused: the visibility event starts it again
        wait = Math.max(wait, away);
      }
      timer = setTimer(tick, wait);
    };
    const waitFor = (result) => {
      const every = read(opts.every, 5000);
      if (typeof result === 'number' && result >= 0) return result;
      if (result === 'idle') return read(opts.idle, every * 5);
      return every;
    };
    async function tick() {
      timer = null;
      if (!alive) return;
      if (busy) { again = true; return; }
      busy = true;
      stats.runs += 1;
      let result;
      try {
        result = await run();
        failures = 0;
      } catch {
        stats.errors += 1;
        failures += 1;
        // A failing look backs off (up to a minute) instead of hammering.
        result = Math.min(60000, read(opts.every, 5000) * 2 ** Math.min(failures, 4));
      }
      busy = false;
      if (!alive) return;
      next = waitFor(result);
      if (again) { again = false; schedule(0); } else schedule(next);
    }
    const handle = {
      stop() { alive = false; clear(); loops.delete(handle); },
      poke() { if (!alive) return; if (busy) { again = true; return; } clear(); if (isHidden() && !(read(opts.hidden, 0) > 0)) return; timer = setTimer(tick, 0); },
      running: () => timer !== null || busy,
      // Called by the page-wide visibility listener.
      shown() { if (alive && !busy) { clear(); timer = setTimer(tick, 0); } },
      hiddenNow() { if (!(read(opts.hidden, 0) > 0)) clear(); },
    };
    loops.add(handle);
    if (opts.immediate === false) schedule(read(opts.every, 5000));
    else if (isHidden()) schedule(0);
    else void tick(); // the first look happens now, before this call returns
    return handle;
  }

  if (typeof root.document !== 'undefined' && typeof root.document.addEventListener === 'function') {
    root.document.addEventListener('visibilitychange', () => {
      for (const handle of [...loops]) {
        if (isHidden()) handle.hiddenNow();
        else handle.shown();
      }
    });
  }

  const shared = {
    api: API,
    settings,
    entry,
    onChange,
    invalidate,
    loop,
    stats: () => ({ ...stats, loops: loops.size, events: cache.events }),
  };
  root.__dshPoll = shared;
  return shared;
})();
// ---- dsh-poll:end ----
