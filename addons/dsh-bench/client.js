/**
 * Bench, browser half: the Settings > Bench page, with the switch for the Bench tab, the Bench folder,
 * the devices that have a card, and what Bench does and does not do. The work is in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-bench',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    /**
     * @returns {boolean} the Cowork sidebar shows another tab than this mode's (no sidebar: false, the server decides).
     * Item 4A, stage 6a: with spaces on, the window's space decides: the bar shows for any mode in the devices space.
     */
    const otherTab = (mode, space = 'devices') => {
      const root = typeof document?.documentElement?.getAttribute === 'function' ? document.documentElement : null;
      const inSpace = root ? root.getAttribute('data-cws-space') : null;
      if (inSpace) return inSpace !== space;
      const tab = root ? root.getAttribute('data-cws-tab') : null;
      return Boolean(tab) && tab !== mode;
    };
    const { useCallback, useEffect, useRef, useState } = React;
    // ---- dsh-kit:begin ---- shared small helpers; this block is the same in every add-on page file that uses it.
    // The master copy is docs/shared/dsh-kit.js. Change it there, then run `node scripts/sync-kit.mjs` (it copies the block into
    // every client.js that has the two marker lines, and `bash scripts/check.sh` fails when a copy has drifted).
    // Dependency-free: plain DOM for the question box, React is passed in for the error note.
    const dshKit = (() => {
      const STYLE_ID = 'dsh-kit-style';
      const CSS = `
    .dsh-kit-veil { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px; box-sizing: border-box; background: color-mix(in srgb, #000 32%, transparent); }
    .dsh-kit-box { width: min(420px, 100%); box-sizing: border-box; padding: 16px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent); font: 14px/22px system-ui, sans-serif; }
    .dsh-kit-title { margin: 0 0 4px; font-size: 14px; line-height: 22px; font-weight: 500; }
    .dsh-kit-text { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 50vh; overflow: auto; }
    .dsh-kit-field { display: block; width: 100%; box-sizing: border-box; height: 36px; margin-top: 10px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
    .dsh-kit-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dsh-kit-label { display: block; margin-top: 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    .dsh-kit-label + .dsh-kit-field { margin-top: 2px; }
    .dsh-kit-row { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
    .dsh-kit-btn { height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
    .dsh-kit-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dsh-kit-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dsh-kit-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    .dsh-kit-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
    .dsh-kit-note { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dsh-kit-note[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
    .dsh-kit-more { margin-left: 6px; padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; text-decoration: underline; cursor: pointer; }
    .dsh-kit-detail { display: block; margin-top: 4px; font: 11px/16px ui-monospace, Menlo, monospace; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; user-select: text; }
    `;
      const ensureStyle = () => {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      };

      /** Turns what a failed call says ("error 404", "settings/conflict: ...") into a plain sentence; the raw text goes to `details`. */
      const plain = (raw) => {
        let message = '';
        if (typeof raw === 'string') message = raw;
        else if (raw && typeof raw === 'object') {
          const source = raw.rpcError ?? (raw.error && typeof raw.error === 'object' ? raw.error : raw);
          message = String(source.message ?? raw.error ?? '');
          if (source.code && !message.includes(String(source.code))) message = `${source.code}: ${message}`;
        }
        const existing = raw && typeof raw === 'object' && typeof raw.details === 'string' ? raw.details : '';
        message = message.trim();
        const text = (sentence) => ({ text: sentence, details: existing || (message && message !== sentence ? message : '') });
        const status = /^(?:error|status|http)?\s*(\d{3})\b/i.exec(message)?.[1] ?? /(?:answered|returned)\s+(\d{3})\b/i.exec(message)?.[1] ?? '';
        if (/settings\/conflict/i.test(message)) return text('This setting was changed somewhere else at the same moment. Please try again.');
        if (/not mounted|namespace not mounted|settings unavailable|is switched off|is not running/i.test(message)) return text('This add-on is not running. Switch it on (or restart the app) and try again.');
        if (/failed to fetch|networkerror|load failed|network request failed|econnrefused/i.test(message)) return text('Could not reach the app. Check that it is still running, then try again.');
        if (status === '401' || status === '403') return text('The app did not allow this. Restart the app and try again.');
        if (status === '404') return text('This part of the add-on is not available. It may be switched off, or the app needs a restart after an update.');
        if (status === '408' || status === '504') return text('The app took too long to answer. Try again in a moment.');
        if (status === '409') return text('This changed somewhere else at the same moment. Please try again.');
        if (/^5\d\d$/.test(status)) return text('The add-on ran into a problem. Try again; if it keeps happening, restart the app.');
        if (/^4\d\d$/.test(status)) return text('The app could not use this request. Try again; if it keeps happening, restart the app.');
        // "code/name: message": show the message, keep the code as a detail.
        const coded = /^([a-z][\w-]*(?:\/[\w.-]+)+):\s*(.+)$/is.exec(message);
        if (coded) return { text: coded[2].trim(), details: existing || message };
        // A readable sentence stays as it is.
        if (/^[A-Z"'(].*\s/s.test(message) || /\s/.test(message)) return { text: message, details: existing };
        if (!message) return { text: 'Something went wrong. Try again.', details: existing };
        return text('Something went wrong. Try again; the Details line says what the app reported.');
      };
      /** An Error whose message is the plain sentence and whose `details` keeps the raw text. */
      const fail = (raw) => {
        const found = plain(raw);
        const error = new Error(found.text);
        error.details = found.details;
        return error;
      };

      /**
       * A small question box in the page's own style (window.prompt does nothing in the desktop app, and the native
       * confirm cannot be styled or checked there). Resolves true/false; with `field` the typed text or null; `notice` shows OK only.
       */
      const ask = (options = {}) => new Promise((resolve) => {
        if (typeof document === 'undefined') { resolve(options.field ? null : false); return; }
        ensureStyle();
        const before = document.activeElement;
        const veil = document.createElement('div');
        veil.className = 'dsh-kit-veil';
        const box = document.createElement('div');
        box.className = 'dsh-kit-box';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        const add = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
        if (options.title) { const title = add('p', 'dsh-kit-title', options.title); box.appendChild(title); box.setAttribute('aria-label', options.title); }
        if (options.text) box.appendChild(add('p', 'dsh-kit-text', options.text));
        let input = null;
        if (options.field) {
          if (options.field.label) box.appendChild(add('label', 'dsh-kit-label', options.field.label));
          input = add('input', 'dsh-kit-field');
          input.type = 'text';
          input.value = options.field.value ?? '';
          if (options.field.placeholder) input.placeholder = options.field.placeholder;
          if (options.field.label) input.setAttribute('aria-label', options.field.label);
          box.appendChild(input);
        }
        const row = add('div', 'dsh-kit-row');
        const done = (value) => { document.removeEventListener('keydown', onKey, true); veil.remove(); try { before?.focus?.(); } catch { /* the old control is gone */ } resolve(value); };
        const cancel = options.notice ? null : add('button', 'dsh-kit-btn', options.cancel ?? 'Cancel');
        const ok = add('button', 'dsh-kit-btn', options.ok ?? 'OK');
        ok.type = 'button';
        ok.setAttribute('data-main', 'true');
        if (options.danger) ok.setAttribute('data-danger', 'true');
        const accept = () => done(input ? input.value : true);
        const reject = () => done(input ? null : false);
        function onKey(event) {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (options.notice) accept(); else reject(); }
          else if (event.key === 'Enter' && input && document.activeElement === input) { event.preventDefault(); event.stopPropagation(); accept(); }
          else if (event.key === 'Tab') {
            const stops = [...box.querySelectorAll('input,button')];
            const at = stops.indexOf(document.activeElement);
            if (stops.length > 0) { event.preventDefault(); stops[(at + (event.shiftKey ? stops.length - 1 : 1)) % stops.length].focus(); }
          }
        }
        if (cancel) { cancel.type = 'button'; cancel.addEventListener('click', reject); row.appendChild(cancel); }
        ok.addEventListener('click', accept);
        row.appendChild(ok);
        box.appendChild(row);
        veil.appendChild(box);
        veil.addEventListener('mousedown', (event) => { if (event.target === veil && !options.notice) reject(); });
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(veil);
        // A question that can destroy something starts on Cancel, so a stray Enter never confirms it.
        (input ?? (options.danger && cancel ? cancel : ok)).focus();
        if (input) input.select();
      });

      /** The note to draw under a form or at the top of a page: a plain sentence and a "Details" button. */
      const makeNote = (React) => function PlainNote({ error, text, details, kind }) {
        ensureStyle();
        const [open, setOpen] = React.useState(false);
        const found = error !== undefined && error !== null && error !== '' ? plain(error) : { text: text ?? '', details: details ?? '' };
        if (!found.text) return null;
        const bad = kind ? kind === 'error' : error !== undefined && error !== null && error !== '';
        return React.createElement('div', { className: 'dsh-kit-note', 'data-error': String(bad), role: bad ? 'alert' : 'status' },
          found.text,
          found.details ? React.createElement('button', { type: 'button', className: 'dsh-kit-more', 'aria-expanded': open, onClick: () => setOpen(!open) }, open ? 'Hide details' : 'Details') : null,
          open && found.details ? React.createElement('span', { className: 'dsh-kit-detail' }, found.details) : null);
      };
      return { plain, fail, ask, makeNote };
    })();
    // ---- dsh-kit:end ----
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
    const PlainNote = dshKit.makeNote(React);

    const NS = 'bench';
    const DICT = {
      en: { 'section.title': 'Devices', 'offer.group': 'The mode', 'offer.title': 'Offer the Devices mode', 'offer.desc': 'On adds the Devices mode and the Devices space, its instructions and its tools. Off takes them away (a port being watched is closed). Cards and logbooks stay in the Devices folder.', 'offer.on': 'Switched on. The Devices mode and the Devices space appear in a moment.', 'offer.off': 'Switched off. The Devices mode and the Devices space are taken away in a moment. Cards and logbooks stay in the Devices folder.' },
    };
    const LEVELS = { identify: 'Identify', read: 'Read', adjust: 'Adjust', write: 'Write' };
    const ASKS = { restricted: 'Restricted', 'ask-auto': 'Ask', 'full-auto': 'Auto' };
    const when = (at) => (at ? new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

    const CSS = `
.dsh-bn-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-bn-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-bn-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-bn-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bn-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-bn-group[data-danger="true"] { color: var(--dsw-alias-label-error, #d93025); }
.dsh-bn-danger { border: 1px solid var(--dsw-alias-label-error, #d93025); border-radius: 10px; padding: 4px 12px; }
.dsh-bn-pre { font-family: var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, monospace); font-size: 12px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; background: var(--dsw-alias-fill-secondary, rgba(128,128,128,.12)); border-radius: 8px; padding: 8px 10px; margin: 4px 0 10px; color: var(--dsw-alias-label-primary); user-select: text; }
.dsh-bn-req { font-size: 12px; margin: 2px 0; color: var(--dsw-alias-label-primary); }
.dsh-bn-req[data-found="false"] { color: var(--dsw-alias-label-secondary); }
.dsh-bn-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-bn-rowtext { flex: 1; min-width: 0; }
.dsh-bn-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-bn-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-bn-btn {
  flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-bn-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-bn-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-bn-btn:disabled { opacity: .5; cursor: default; }
.dsh-bn-input {
  width: 100%; box-sizing: border-box; height: 30px; margin-top: 8px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px;
  font: 12px/18px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); background: transparent;
}
.dsh-bn-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-bn-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-bn-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-bn-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-bn-switch:disabled { opacity: .5; cursor: default; }
.dsh-bn-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-bn-perms { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-bn-select { height: 26px; margin-left: 4px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-bn-rowdesc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-bn-rules { margin: 6px 0 0; display: flex; flex-direction: column; gap: 8px; }
.dsh-bn-rule { display: flex; gap: 10px; align-items: flex-start; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-bn-rule b { color: var(--dsw-alias-label-primary); font-weight: 500; }
.dsh-bn-tag { flex: none; min-width: 52px; text-align: center; padding: 0 6px; border-radius: 6px; font-size: 11px; line-height: 18px; font-weight: 600; }
.dsh-bn-tag[data-open="true"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent); }
.dsh-bn-tag[data-open="false"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }
/* "Devices rules" in the chat box, like the app's own buttons there. */
.dsh-bn-ctl { display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font: inherit; font-size: 13px; white-space: nowrap; }
.dsh-bn-ctl:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-bn-ctl:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-bn-pop { position: fixed; z-index: 1000; box-sizing: border-box; width: 360px; max-width: calc(100vw - 24px); padding: 14px 16px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
.dsh-bn-pop .title { font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-bn-pop .note { margin-top: 10px; color: var(--dsw-alias-label-secondary); }
`;

    /** What is open and closed in Bench, as a list with a tag on each line. */
    function RuleList({ rules }) {
      return h('div', { className: 'dsh-bn-rules' }, (Array.isArray(rules) ? rules : []).map((rule) => h('div', { key: rule.what, className: 'dsh-bn-rule' },
        h('span', { className: 'dsh-bn-tag', 'data-open': String(rule.open === true) }, rule.open ? 'Open' : 'Closed'),
        h('span', null, h('b', null, rule.what), ` · ${rule.why}`))));
    }

    /** "Bench rules" in the chat box of a Bench conversation: what is open and closed there, at a click. */
    function BenchRules({ sessionId, appCtx }) {
      const [view, setView] = useState(null);
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      useEffect(() => {
        let alive = true;
        // Another conversation: forget the last one's answer at once (Bench rules lingered on other tabs).
        setView(null);
        setOpen(false);
        // Looks every 5 s only in a conversation that is in Devices mode with Devices on. Anywhere else (or with Devices off)
        // it looks once a minute and when Settings changes (a /mode switch), and not at all while the window is hidden.
        const watcher = dshPoll.loop(async () => {
          try {
            const response = await fetch(new URL(`dsh-bench/data${sessionId ? `?session=${encodeURIComponent(sessionId)}` : ''}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok || !alive) return undefined;
            const data = await response.json();
            setView(data);
            return data?.enabled === true && data?.session?.inBench ? undefined : 'idle';
          } catch {
            return undefined; /* tried again shortly */
          }
        }, { every: 5000, idle: 60000 });
        const off = appCtx ? dshPoll.onChange(appCtx, () => watcher.poke()) : () => {};
        return () => { alive = false; watcher.stop(); off(); };
      }, [sessionId]);
      useEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 372)), bottom: window.innerHeight - rect.top + 8 });
        const away = (event) => {
          if (panel.current?.contains(event.target) || button.current?.contains(event.target)) return;
          setOpen(false);
        };
        const key = (event) => event.key === 'Escape' && setOpen(false);
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', away, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      if (!view || view.enabled !== true || !view.session?.inBench) return null;
      // With the Cowork sidebar the selected tab is the conversation's mode, known at once: another tab never shows this.
      if (otherTab('bench')) return null;
      const rules = Array.isArray(view.closed) ? view.closed : [];
      const shut = rules.filter((rule) => !rule.open).length;
      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', { ref: button, type: 'button', className: 'dsh-bn-ctl', 'aria-haspopup': 'dialog', 'aria-expanded': open, 'aria-label': `Devices rules: ${shut} closed, ${rules.length - shut} open`, onClick: () => setOpen(!open) },
          h('svg', { width: 12, height: 12, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3' })),
          h('span', null, 'Devices rules')),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-bn-pop', role: 'dialog', 'aria-label': 'Devices rules', style: { left: place.left, bottom: place.bottom, maxHeight: typeof place.bottom === 'number' ? `calc(100vh - ${place.bottom + 12}px)` : 'calc(100vh - 24px)', overflowY: 'auto' } },
                h('style', null, CSS),
                h('div', { className: 'title' }, 'What Devices keeps open and closed'),
                h(RuleList, { rules }),
                h('div', { className: 'note' }, 'When something you ask for is closed, the assistant says so. Mission checks can be switched in Settings → Devices; the other lines are fixed in this version.')),
              document.body,
            )
          : null);
    }


    async function call(body) {
      const response = await fetch(new URL('dsh-bench/data', document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }

    /** Which programs Bench can use on this Mac, found or missing, with the install command (Bench never installs). */
    function Programs({ install }) {
      const [rows, setRows] = useState(null);
      const [problem, setProblem] = useState('');
      const [busy, setBusy] = useState(false);
      const check = async () => {
        setBusy(true);
        setProblem('');
        try {
          const response = await fetch(new URL('dsh-bench/data?requirements=1', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
          setRows(Array.isArray(data.rows) ? data.rows : []);
        } catch (error) {
          setProblem(error.message);
        } finally {
          setBusy(false);
        }
      };
      const text = install && typeof install === 'object' ? Object.entries(install).filter(([, value]) => typeof value === 'string' && value.trim()) : [];
      return h('div', null,
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, 'Check what is installed'),
            h('div', { className: 'dsh-bn-rowdesc' }, 'Lists every program Devices\' tools can use, whether it is on this Mac, and the exact command for anything missing. Devices never installs anything: paste a command into Terminal yourself. (In a Devices thread, bench_requirements gives the same list.)')),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => void check() }, busy ? 'Checking…' : 'Check')),
        problem ? h('p', { className: 'dsh-bn-desc', 'data-error': 'true' }, problem) : null,
        rows ? h('div', { style: { margin: '4px 0 10px' } },
          rows.map((row) => h('div', { key: row.name, className: 'dsh-bn-req', 'data-found': String(row.found === true) },
            `${row.found ? '✓' : '✗'} ${row.name}${row.used ? ` — ${row.used}` : ''}${!row.found && row.install ? `: ${row.install}` : ''}`))) : null,
        text.map(([key, value]) => h('pre', { key, className: 'dsh-bn-pre' }, value)));
    }

    async function revision(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return view.revision;
    }

    async function setSettings(ctx, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, await revision(ctx));
      if (!result.ok) throw dshKit.fail(result.error);
    }

    /** One device on the page, with the user's own settings for it (never set by the model). */
    function DeviceRow({ device, busy, onSave, onUnlink }) {
      const [level, setLevel] = useState(device.level);
      const [asks, setAsks] = useState(device.asks);
      const [dryRun, setDryRun] = useState(device.dryRun === true);
      const [ranges, setRanges] = useState(device.ranges ?? '');
      const changed = level !== device.level || asks !== device.asks || dryRun !== (device.dryRun === true) || ranges !== (device.ranges ?? '');
      const select = (value, options, set, label) => h('select', { className: 'dsh-bn-select', value, 'aria-label': `${label} for ${device.name}`, disabled: busy, onChange: (event) => set(event.target.value) },
        Object.entries(options).map(([id, text]) => h('option', { key: id, value: id }, text)));
      return h('div', { className: 'dsh-bn-row' },
        h('div', { className: 'dsh-bn-rowtext' },
          h('div', { className: 'dsh-bn-rowtitle' }, device.name),
          h('div', { className: 'dsh-bn-rowdesc' }, [[device.maker, device.model].filter(Boolean).join(' '), device.connects, `${device.entries} logbook ${device.entries === 1 ? 'entry' : 'entries'}`, device.backups ? `${device.backups} backup${device.backups === 1 ? '' : 's'}` : '', device.undo ? `${device.undo} change${device.undo === 1 ? '' : 's'} on the undo list` : '', device.portAgreed ? 'serial port: agreed' : '', device.updated ? `changed ${when(device.updated)}` : ''].filter(Boolean).join(' · ')),
          h('div', { className: 'dsh-bn-rowdesc' }, `Linked to: ${device.linked || 'no device yet'}`),
          device.lookOnly ? h('div', { className: 'dsh-bn-rowdesc', 'data-error': 'true' }, `Look-only (${device.lookOnly}): Devices reads it and never changes it, whatever is set here.${device.lookOnlyMarked && !device.lookOnlyFromWords ? ' Its card no longer names it so, but the mark stays until you lift it.' : ''}`) : null,
          h('div', { className: 'dsh-bn-perms' },
            h('label', null, 'Highest level ', select(level, LEVELS, setLevel, 'Highest level')),
            h('label', null, 'How it asks ', select(asks, ASKS, setAsks, 'How it asks')),
            h('label', null, h('input', { type: 'checkbox', checked: dryRun, disabled: busy, onChange: (event) => setDryRun(event.target.checked) }), ' Dry run by default')),
          h('input', { className: 'dsh-bn-input', type: 'text', spellCheck: false, placeholder: 'Your own protected parts, e.g. 0x9000-0xF000 (the start of an ESP32\'s flash is always protected)', value: ranges, 'aria-label': `Protected parts for ${device.name}`, disabled: busy, onChange: (event) => setRanges(event.target.value) })),
        h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || !changed, onClick: () => onSave({ name: device.name, level, asks, dryRun, ranges }) }, 'Save'),
        device.isLinked ? h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, title: 'For the same device on a new cable or adapter, or a card that should move to another device. Devices asks you again at the next use.', onClick: () => onUnlink(device.name) }, 'Unlink') : null,
        device.lookOnlyMarked && !device.lookOnlyFromWords ? h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, title: 'Only when this device is not one of the look-only families after all.', onClick: () => onSave({ name: device.name, level: device.level, asks: device.asks, dryRun: device.dryRun === true, ranges: device.ranges ?? '', clearLookOnly: true }) }, 'Lift look-only') : null);
    }

    /** Where a network device is and how Bench signs in: set only here. The password goes straight to the Keychain. */
    function NetSettings({ device, busy, run }) {
      const net = device.net ?? {};
      const [address, setAddress] = useState(net.address ?? '');
      const [port, setPort] = useState(String(net.port ?? 22));
      const [user, setUser] = useState(net.user ?? '');
      const [signIn, setSignIn] = useState(net.signIn ?? 'key');
      const [password, setPassword] = useState('');
      const changed = address !== (net.address ?? '') || port !== String(net.port ?? 22) || user !== (net.user ?? '') || signIn !== (net.signIn ?? 'key');
      const field = (value, set, label, placeholder, width) => h('input', { className: 'dsh-bn-input', style: { width, marginTop: 0 }, type: 'text', spellCheck: false, autoComplete: 'off', value, placeholder, 'aria-label': `${label} for ${device.name}`, disabled: busy, onChange: (event) => set(event.target.value) });
      return h('div', { className: 'dsh-bn-row' },
        h('div', { className: 'dsh-bn-rowtext' },
          h('div', { className: 'dsh-bn-rowtitle' }, `${device.name} on your network`),
          h('div', { className: 'dsh-bn-rowdesc' }, 'Its address (a private address such as 192.168.8.1, or a name ending in .local), the SSH port, the user you sign in with, and how: Devices\' SSH key, or a password kept in the Mac\'s Keychain. Devices goes there only while the Mac is on a network you marked below.'),
          h('div', { className: 'dsh-bn-perms' },
            field(address, setAddress, 'Address', '192.168.8.1', '160px'),
            field(port, setPort, 'Port', '22', '60px'),
            field(user, setUser, 'User', 'root', '120px'),
            h('select', { className: 'dsh-bn-select', value: signIn, 'aria-label': `Sign-in for ${device.name}`, disabled: busy, onChange: (event) => setSignIn(event.target.value) }, h('option', { value: 'key' }, 'SSH key'), h('option', { value: 'password' }, 'Password (Keychain)'))),
          signIn === 'password' ? h('div', { className: 'dsh-bn-perms' },
            h('input', { className: 'dsh-bn-input', style: { width: '220px', marginTop: 0 }, type: 'password', autoComplete: 'new-password', value: password, placeholder: 'Password for this device', 'aria-label': `Password for ${device.name}`, disabled: busy, onChange: (event) => setPassword(event.target.value) }),
            h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || !password || !net.address, title: net.address ? 'Kept in the Mac\'s Keychain; never shown, never in a file or a message.' : 'Save the address first.', onClick: () => { const value = password; setPassword(''); void run(async () => { await call({ action: 'password', name: device.name, password: value }); }, `The password for ${device.name} is in the Keychain.`); } }, 'Save password'),
            h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => run(async () => { await call({ action: 'forgetPassword', name: device.name }); }, `The password for ${device.name} is removed from the Keychain.`) }, 'Forget password')) : null),
        h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || !changed, onClick: () => run(async () => { await call({ action: 'net', name: device.name, address: address.trim(), port: Number(port), user: user.trim(), signIn }); }, `Saved where ${device.name} is.`) }, 'Save'));
    }

    /** A short list the user keeps here (networks, sources): each line with Remove, and inputs to add one. */
    function ListEditor({ items, busy, fields, addLabel, onAdd, onRemove, empty, allowEmpty = false }) {
      const [values, setValues] = useState({});
      return h('div', null,
        items.length === 0 ? h('p', { className: 'dsh-bn-desc' }, empty) : null,
        items.map((item) => h('div', { key: item.key, className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' }, h('div', { className: 'dsh-bn-rowtitle' }, item.title), item.desc ? h('div', { className: 'dsh-bn-rowdesc' }, item.desc) : null),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => onRemove(item.key) }, 'Remove'))),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' }, h('div', { className: 'dsh-bn-perms' }, fields.map((field) => (field.options
            ? h('select', { key: field.id, className: 'dsh-bn-select', value: values[field.id] ?? field.options[0][0], 'aria-label': field.label, disabled: busy, onChange: (event) => setValues({ ...values, [field.id]: event.target.value }) }, field.options.map(([id, text]) => h('option', { key: id, value: id }, text)))
            : h('input', { key: field.id, className: 'dsh-bn-input', style: { width: field.width, marginTop: 0 }, type: 'text', spellCheck: false, autoComplete: 'off', value: values[field.id] ?? '', placeholder: field.placeholder, 'aria-label': field.label, disabled: busy, onChange: (event) => setValues({ ...values, [field.id]: event.target.value }) }))))),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || (!allowEmpty && fields.filter((field) => !field.options).every((field) => !(values[field.id] ?? '').trim())), onClick: () => { const next = { ...Object.fromEntries(fields.filter((field) => field.options).map((field) => [field.id, field.options[0][0]])), ...values }; setValues({}); onAdd(next); } }, addLabel)));
    }

    function BenchPage({ appCtx }) {
      const tw = appCtx.locale.bind(NS);
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [draft, setDraft] = useState(null);
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const next = await call();
          if (alive.current) { setData(next); setError(''); }
        } catch (problem) {
          if (alive.current) setError(dshKit.plain(problem));
        }
      }, []);
      useEffect(() => {
        alive.current = true;
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 5000);
        return () => { alive.current = false; clearInterval(timer); };
      }, [load]);

      if (!data) {
        return h('div', { className: 'dsh-bn-page' }, h('style', null, CSS), h('h2', { className: 'dsh-bn-title' }, 'Devices'), (error ? h(PlainNote, { text: `Could not load: ${error.text}`, details: error.details, kind: 'error' }) : h('p', { className: 'dsh-bn-desc', 'data-error': 'false' }, 'Loading…')));
      }
      const run = async (work, done) => {
        setBusy(true);
        try {
          await work();
          if (alive.current && done) setNote({ text: done, error: false });
          setTimeout(() => { if (alive.current) void load(); }, 800);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const flip = (on) => run(async () => {
        await setSettings(appCtx, { enabled: on });
        if (alive.current) setData((d) => ({ ...d, enabled: on }));
      }, on ? tw('offer.on') : tw('offer.off'));
      const saveFolder = () => {
        const value = String(draft ?? '').trim();
        if (value && !value.startsWith('/')) {
          setNote({ text: 'Give the folder as a full path, starting with / (for example /Users/you/Documents/Devices).', error: true });
          return;
        }
        void run(async () => {
          await setSettings(appCtx, { folder: value });
          if (alive.current) setDraft(null);
        }, value ? 'Saved. New cards and logbooks go there. Cards already made stay where they were: move them yourself if you like.' : 'Saved. Devices uses its own folder again.');
      };
      const reveal = () => run(async () => { await call({ action: 'reveal' }); });
      const devices = Array.isArray(data.devices) ? data.devices : [];

      return h('div', { className: 'dsh-bn-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-bn-title' }, 'Devices'),
        h('p', { className: 'dsh-bn-desc' }, 'A space, with its own mode, for the devices you connect to this Mac: maker boards such as an ESP32 or an Arduino, phones, routers and other gadgets. It finds out what a device is, finds the maker\'s documentation, and keeps a card and a logbook for each device.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,
        data.problem ? h('p', { className: 'dsh-bn-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-bn-group' }, tw('offer.group')),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, tw('offer.title')),
            h('div', { className: 'dsh-bn-rowdesc' }, 'On adds the Devices mode and the Devices space, its instructions and its tools. Off takes them away (a port being watched is closed). Cards and logbooks stay in the Devices folder.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-bn-switch', 'aria-checked': data.enabled === true, 'aria-label': tw('offer.title'), disabled: busy, onClick: () => void flip(data.enabled !== true) })),

        h('div', { className: 'dsh-bn-group' }, 'The Devices folder'),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, data.folder || 'Not set'),
            h('div', { className: 'dsh-bn-rowdesc' }, `Each device gets a folder here with its card (card.md) and its logbook (logbook.md). ${data.ownFolder ? 'This is Devices\' own folder in the app\'s data folder.' : 'This is the folder you set.'} To use another, give its full path and press Save; leave it empty for Devices' own. For the network door the path must not contain %, $ or " (ssh would read them as part of a command).`),
            h('input', { className: 'dsh-bn-input', type: 'text', spellCheck: false, placeholder: data.folder || '/Users/you/Documents/Devices', value: draft ?? '', 'aria-label': 'Devices folder', onChange: (event) => setDraft(event.target.value) })),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || draft === null, onClick: saveFolder }, 'Save'),
          h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy || !data.folder, onClick: () => void reveal() }, 'Show in Finder')),

        h('div', { className: 'dsh-bn-group' }, 'Missions'),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, 'Check the work of a Mission'),
            h('div', { className: 'dsh-bn-rowdesc' }, data.longChecks !== false
              ? 'On: after each step the Mission proves its work with a small check, as in every space. In Devices those checks run with the Mac\'s device ports closed, so a check cannot open a board\'s port (opening one restarts some boards). A check that tries says so in the Mission\'s report.'
              : 'Off: Missions in Devices run no checks. The reviewer judges each step by reading the files, as in a Recon run. Nothing reaches a device either way.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-bn-switch', 'aria-checked': data.longChecks !== false, 'aria-label': 'Check the work of a Mission', disabled: busy, onClick: () => void run(async () => {
            await setSettings(appCtx, { longChecks: data.longChecks === false });
            if (alive.current) setData((d) => ({ ...d, longChecks: d.longChecks === false }));
          }, data.longChecks === false ? 'Mission checks are on again. New Missions in Devices check their work.' : 'Mission checks are off. New Missions in Devices check nothing by themselves.') })),

        h('div', { className: 'dsh-bn-group' }, 'Live dashboard'),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, 'Devices, live'),
            h('div', { className: 'dsh-bn-rowdesc' }, `One card per running monitor (a car over OBD-II, a serial device, this Mac's network, a router over SSH, HID devices), updated every second. Monitors are started and stopped in a Devices thread ("start an OBD monitor on /dev/cu.usbserial-…"). The page only shows; it starts nothing. Running now: ${Number(data.monitors) || 0}.`)),
          h('a', { className: 'dsh-bn-btn', href: new URL(String(data.dashboard || '/dsh-bench/dashboard').replace(/^\//, ''), document.baseURI).href, target: '_blank', rel: 'noreferrer' }, 'Open the dashboard')),

        h('div', { className: 'dsh-bn-group' }, 'Programs Devices uses'),
        h(Programs, { install: data.install }),

        h('div', { className: 'dsh-bn-group' }, 'Open and closed in Devices'),
        h('p', { className: 'dsh-bn-desc' }, 'The same list shows under "Devices rules" in the chat box of a Devices thread, and a Mission\'s settings form says which applies before it starts.'),
        h(RuleList, { rules: data.closed }),

        h('div', { className: 'dsh-bn-group' }, `Devices with a card (${devices.length})`),
        devices.length === 0 ? h('p', { className: 'dsh-bn-desc' }, 'None yet. Plug a device in, open the Devices space and ask "what is plugged in?"') : null,
        devices.length > 0 ? h('p', { className: 'dsh-bn-desc' }, 'Only you set these, never the assistant. A new card starts at Read and Ask. Restricted: Identify and Read only. Ask: each change asks you. Auto: changes on that device without asking, each one logged. A firmware write asks you every time, whatever is set. Dry run by default: each change is shown first and done only when asked again. Each card is linked to one device the first time it is used; Unlink when the device moves to a new cable or adapter.') : null,
        devices.map((device) => h(DeviceRow, { key: `${device.name}-${device.updated}`, device, busy, onSave: (values) => run(async () => { await call({ action: 'permissions', ...values }); }, `Saved for ${values.name}.`), onUnlink: (name) => run(async () => { await call({ action: 'unlink', name }); }, `${name} is unlinked. Devices asks you again the next time it is used.`) })),
        devices.filter((device) => /network/.test(String(device.connects ?? '')) || device.net).map((device) => h(NetSettings, { key: `net-${device.name}-${device.updated}`, device, busy, run })),

        h('div', { className: 'dsh-bn-group' }, 'Your networks'),
        h('p', { className: 'dsh-bn-desc' }, 'Devices looks at and signs in to network devices only while the Mac is on a network you mark here. Mark it while the Mac is on it: Devices records its address range (yours, or the one you give) and the hardware address of its router. macOS may hide the Wi-Fi name from apps, and many networks share a range (every GL.iNet router starts with 192.168.8.0/24), so the range plus the router\'s hardware address is what counts; the Wi-Fi name is only a label. On a hotel\'s network, even one with the same name or range, Devices does nothing.'),
        h(ListEditor, { busy, allowEmpty: true, empty: 'No network is marked yet.', addLabel: 'Mark this network as mine', items: (data.networks ?? []).map((entry) => ({ key: entry.label, title: entry.label, desc: [entry.ssid ? `Wi-Fi "${entry.ssid}"` : '', entry.cidr ? `range ${entry.cidr}` : '', entry.gatewayMac ? `router ${entry.gatewayMac}` : 'no router recorded: mark it again'].filter(Boolean).join(' · ') })), fields: [{ id: 'label', label: 'Name', placeholder: 'Home', width: '120px' }, { id: 'ssid', label: 'Wi-Fi name (a label)', placeholder: 'Wi-Fi name', width: '160px' }, { id: 'cidr', label: 'Address range', placeholder: 'the Mac\'s own range', width: '150px' }], onAdd: (values) => run(async () => { await call({ action: 'network', label: values.label ?? '', ssid: values.ssid ?? '', cidr: values.cidr ?? '' }); }, 'Network marked as yours.'), onRemove: (label) => run(async () => { await call({ action: 'network', remove: label }); }, `${label} is no longer marked.`) }),
        h('div', { className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, 'Devices\' SSH key'),
            h('div', { className: 'dsh-bn-rowdesc' }, data.publicKey ? 'Add this public half to a device once (for a GL.iNet router: its admin page → Advanced (LuCI) → System → Administration → SSH-Keys; for Windows: administrators_authorized_keys). The private half never leaves this Mac.' : 'Not made yet. Devices makes one on this Mac; you add its public half to a device once.'),
            data.publicKey ? h('input', { className: 'dsh-bn-input', type: 'text', readOnly: true, value: data.publicKey, 'aria-label': 'Devices\' public SSH key', onFocus: (event) => event.target.select() }) : null),
          data.publicKey ? null : h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => run(async () => { await call({ action: 'key' }); }, 'Devices\' SSH key is made.') }, 'Make the key')),

        h('div', { className: 'dsh-bn-group' }, 'Firmware sources you added'),
        h('p', { className: 'dsh-bn-desc' }, 'Besides the makers and official projects Devices knows (Espressif, GL.iNet, Google\'s factory images, ESPHome, Tasmota, MicroPython, WLED and others), firmware may come from the sites you add here. Devices still reads the file\'s checksum on that site itself. Each source is for one kind of device, so a router or a phone is never written from another kind\'s source. A GitHub source is one project\'s releases page (github.com/<org>/<project>/releases/). Only you add a source, never the assistant.'),
        h(ListEditor, { busy, empty: 'None added.', addLabel: 'Add source', items: (data.sources ?? []).map((entry) => ({ key: `${entry.host}${entry.path}`, title: `https://${entry.host}${entry.path}`, desc: entry.kind === 'router' ? 'for routers' : entry.kind === 'phone' ? 'for phones' : entry.kind === 'esp32' ? 'for ESP32 boards' : 'for no kind of device: add it again' })), fields: [{ id: 'url', label: 'Source address', placeholder: 'https://firmware.example.com/releases/', width: '320px' }, { id: 'kind', label: 'For which devices', options: [['esp32', 'ESP32 boards'], ['router', 'Routers'], ['phone', 'Phones']] }], onAdd: (values) => run(async () => { await call({ action: 'source', url: values.url ?? '', kind: values.kind ?? 'esp32' }); }, 'Source added.'), onRemove: (key) => run(async () => { await call({ action: 'source', remove: key }); }, 'Source removed.') }),

        (data.recipes ?? []).length > 0 ? h('div', { className: 'dsh-bn-group' }, 'Recipe drafts') : null,
        (data.recipes ?? []).length > 0 ? h('p', { className: 'dsh-bn-desc' }, 'For devices that are not in the catalogue, Devices drafts a recipe at the Read level from the maker\'s pages. It is used only after you approve it; Adjust and Write are never taken from a draft. The draft file is in the Devices folder\'s recipes/drafts.') : null,
        (data.recipes ?? []).map((draft) => h('div', { key: draft.id, className: 'dsh-bn-row' },
          h('div', { className: 'dsh-bn-rowtext' },
            h('div', { className: 'dsh-bn-rowtitle' }, `${draft.title} (${draft.status})`),
            h('div', { className: 'dsh-bn-rowdesc' }, `For ${draft.device}. Reads: ${(draft.read ?? []).join('; ')}. Sources: ${(draft.sources ?? []).map((source) => `${source.url}${source.official ? '' : ' (explains only)'}`).join(', ') || 'none'}`)),
          draft.status === 'draft' ? h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => run(async () => { await call({ action: 'recipe', id: draft.id, approve: true }); }, `${draft.title} is approved at the Read level.`) }, 'Approve') : null,
          draft.status === 'draft' ? h('button', { type: 'button', className: 'dsh-bn-btn', disabled: busy, onClick: () => run(async () => { await call({ action: 'recipe', id: draft.id, approve: false }); }, `${draft.title} is declined.`) }, 'Decline') : null)),

        h('div', { className: 'dsh-bn-group' }, 'How to use it'),
        h('ul', { className: 'dsh-bn-list' },
          h('li', null, 'Plug the device in with a cable that carries data, open the Devices space and ask what it is. Devices reads the Mac\'s own list of USB devices and serial ports, and of paired Bluetooth devices.'),
          h('li', null, 'Watching a board: ask Devices to watch its serial port for some minutes (up to an hour per call; a Mission keeps calling for longer). Every line goes into the device\'s log. Opening a port restarts many boards, so Devices asks you once per device first. It only reads; nothing is sent.'),
          h('li', null, 'An ESP32: Devices reads its chip, MAC and flash size, and makes a backup of the whole flash, read twice and compared. To flash firmware: set the device to Write below, put the file from the maker\'s or the project\'s page in the device\'s firmware folder, and give Devices that page\'s address. Devices reads the page itself and finds the file\'s checksum there. It asks you every time.'),
          h('li', null, 'Your router (a GL.iNet such as the Slate 7, or OpenWrt) and your Windows server: mark your network and set the device\'s address, user and sign-in above, then ask Devices to trust its key. It reads them, keeps a router\'s configuration backup on this Mac, changes a short list of settings with undo, and writes router firmware from GL.iNet\'s download centre by sysupgrade (never its loader or radio calibration). On the server it changes a service only when you name it, after a restore point.'),
          h('li', null, 'Bluetooth: besides the Mac\'s list, Devices can scan for nearby devices and read the battery and device information of one you name. The first time it builds a small reader on this Mac (Apple\'s Command Line Tools needed) and macOS asks you to allow Bluetooth. It never changes a device over Bluetooth.'),
          h('li', null, 'An Android phone (USB debugging on): its details, battery, log and settings. The first time, Devices asks you to link the card to that phone. Only a short list of settings can be changed (brightness, screen timeout, text size, sounds, rotation, animation speed, automatic time), only on a phone you set to Adjust; the old value is saved and "undo last" puts it back exactly. Network, debugging, lock and accessibility settings are never touched. Unlocking its bootloader (which ERASES the phone) needs the phone set to Write, a counted backup of its storage, your own message "unlock <device name>" and your yes; then Devices can write the maker\'s factory image.'),
          h('li', null, 'Tools Devices uses, which you install yourself if you want them: esptool (`brew install esptool` or `pipx install esptool`) and adb (`brew install android-platform-tools`). Devices never installs anything.'),
          h('li', null, 'Devices names the chip and the boards it usually sits on, and with Web on looks up the maker\'s manual, datasheet and pinout. It says how sure it is.'),
          h('li', null, 'Say "make a card for it" and give the device a name. The card holds what it is, how it connects, where its manual and firmware are, and how it is brought back if an update fails. Every action is added to the device\'s logbook.'),
          h('li', null, 'Web, Depth and Start Mission work as in every space. A Mission suits a long look into a device\'s documentation.')),

        h('div', { className: 'dsh-bn-group' }, 'Good to know'),
        h('ul', { className: 'dsh-bn-list' },
          h('li', null, 'A firmware write happens only when all four hold: a checked backup of that chip taken since its last write, the recovery path on its card, firmware from the maker or the official project whose checksum Devices finds published there itself, and your yes on the app\'s own question, every time. After your yes Devices checks again that the file, the chip and the Mac\'s power are as they were. Writing the start of an ESP32\'s flash (its loader, partition table and stored settings) also needs your own message "write protected <device name>". The eFuses, which can never go back, are never touched. After a write Devices reads it back and watches the board start; on a failure it stops and shows the way back, and never tries again by itself.'),
          h('li', null, 'Backups and logs stay on this Mac, in the device\'s folder. Backups are never shown to a model; log lines are, with passwords and keys masked.'),
          h('li', null, 'Only one action at a time on a device or a port.'),
          h('li', null, 'A Devices thread runs Read Only and has no terminal: Devices refuses every command, program and background job in its threads and their helpers, and every tool not on its own list, also during a Mission, whose "Files and commands" switch otherwise gives every tool. A Mission\'s own checks are run by Mission, with the Mac\'s device ports closed to them, no internet, none of the app\'s keys, no reading the app\'s data folder or your home folder, and no hidden files or Git hooks written (switch them off under Missions above). Devices\' own tools write only cards and logbooks, only into the Devices folder, and no file tool may read or write there or a device\'s port.'),
          h('li', null, 'New threads in the Devices space start on the Standard preset by themselves, and the preset menu is greyed there. Under the app\'s PTC preset every tool is called from inside a program, and Devices refuses programs, so a PTC thread here cannot do anything. To change it: Settings → Spaces → Devices → Preset in this space.'),
          h('li', null, 'Only your own devices. A device\'s name, a log line or its admin page is text someone else wrote: the assistant is told never to follow it.'),
          h('li', null, 'Passwords and keys are kept out of cards and logbooks: a named one (password, psk, token, WIFI_PASS and the like) and anything that looks like a key is masked before it is written. Web addresses stay readable. This catches the usual forms, not every one.'),
          h('li', null, 'A new card starts at the level Read with Ask. Only you change that, above, for each device.'),
          h('li', null, 'Look-only where safety is at stake: vehicles and e-bikes, medical devices, batteries and chargers, locks, alarms, smoke detectors, heating. A card whose words name one of these is marked look-only and stays so, even if its words change later; only you lift the mark, above. The assistant is also told never to change speed limits or radio limits (transmit power, region, frequency); Devices has no tool that sets them.'),
          h('li', null, 'A device Devices has no recipe for: it drafts one at the Read level from the maker\'s pages, and you approve it above. Adjust and Write for it are not built.'),
          h('li', null, 'With Ultra Code on in the chat box, a checker (the thread\'s own model, with no tools) reads each write plan before you are asked; its verdict is on the question. Only one write runs at a time, on one device.'),
          h('li', null, 'Not built: changing a Bluetooth device, updating a BIOS (the maker\'s own tool does that), relocking a phone.')),

        h('div', { className: 'dsh-bn-group', 'data-danger': 'true' }, '⚠ Danger zone'),
        h('div', { className: 'dsh-bn-danger' },
          h('div', { className: 'dsh-bn-row' },
            h('div', { className: 'dsh-bn-rowtext' },
              h('div', { className: 'dsh-bn-rowtitle' }, 'Allow risky writes'),
              h('div', { className: 'dsh-bn-rowdesc' }, data.allowRiskyWrites === true
                ? 'ON. Flashing, erasing, programming, resets and commands sent to boards, debug probes, FPGAs, instruments, smart cards and iPhones run when asked. Firmware writes need no backup, source check or recovery path; any router setting (but radio limits and keys), any phone setting (still undoable) and any Windows service may be changed. Each device\'s level above and your yes on each write still apply. Stays on until you switch it off; each change is noted in the Devices folder (danger.jsonl).'
                : 'Off (the default). The device tools\' flash, erase, program, reset and send actions refuse and say where this switch is; firmware writes need a checked backup, the recovery path and a checked source; settings and services are limited to the short lists. Switch it on to take full control: nothing is sent until you do.')),
            h('button', { type: 'button', role: 'switch', className: 'dsh-bn-switch', 'aria-checked': data.allowRiskyWrites === true, 'aria-label': 'Allow risky writes', disabled: busy || data.enabled !== true, onClick: () => void run(async () => {
              await setSettings(appCtx, { allowRiskyWrites: data.allowRiskyWrites !== true });
              if (alive.current) setData((d) => ({ ...d, allowRiskyWrites: d.allowRiskyWrites !== true }));
            }, data.allowRiskyWrites === true ? 'Allow risky writes is off again: the conditions hold.' : 'Allow risky writes is ON. It stays on until you switch it off.') }))));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'bench', order: 116, label: () => t('section.title') }, (props) => h(BenchPage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'bench-rules', order: -18, label: () => 'Devices rules' }, (props) => h(BenchRules, { sessionId: props?.sessionId, appCtx: ctx }))));
      },
    };
  },
});
