// Cowork sidebar: the browser half. It fills the layout's `sidebar` seat (the app's own sidebar is
// switched off by this bundle's patch while this row is on) and declares the same child seats, so
// the app's Projects list (`sidebar.workspaces`), Settings (`sidebar.settings`), footer actions,
// brand, More menu actions and every plugin's page row (`sidebar.panellist`) keep working inside it.
window.__ModuleLoader__.load({
  id: '@local/dsh-cowork-shell',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;
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
    // ---- dsh-ui:begin ---- shared page parts (switch, button, row, heading, empty state, chips, (i) pop-up, state line, error note); the same block in every page file that uses it.
    // The master copy is docs/shared/dsh-ui.js. Change it there, then run `node scripts/sync-kit.mjs`; `bash scripts/check.sh` fails when a copy has drifted.
    // All classes start with "dshu-" and belong to this block only: no add-on defines or restyles them. The look follows docs/UI-STYLE.md.
    // React is passed in: `const ui = dshUi.makeParts(React);` then `h(ui.Switch, { on, label, onChange })`, `h(ui.Row, { title, desc }, control)` and so on.
    // Pass ReactDOM too (`dshUi.makeParts(React, ReactDOM)`) where an (i) needs `portal: true` (its pop-up then goes to the page body).
    const dshUi = (() => {
      const STYLE_ID = 'dsh-ui-style';
      const CSS = `
    .dshu-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
    .dshu-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
    .dshu-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dshu-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
    .dshu-group { margin: 24px 0 8px; font-size: 12px; line-height: 18px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
    .dshu-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
    .dshu-rowtext { flex: 1; min-width: 0; }
    .dshu-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
    .dshu-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
    .dshu-side { flex: none; display: flex; align-items: center; gap: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    @media (max-width: 560px) { .dshu-row { flex-wrap: wrap; } .dshu-side { margin-left: auto; } }
    .dshu-btn { flex: none; height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; white-space: nowrap; cursor: pointer; }
    .dshu-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dshu-btn:disabled { opacity: .5; cursor: default; }
    .dshu-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
    .dshu-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
    .dshu-field { flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
    .dshu-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
    .dshu-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
    .dshu-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); }
    .dshu-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
    .dshu-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
    .dshu-switch[data-danger="true"][aria-checked="true"] { background: var(--dsw-alias-state-error-primary); }
    .dshu-switch:disabled { opacity: .5; cursor: default; }
    @media (prefers-reduced-motion: no-preference) { .dshu-switch { transition: background .12s ease; } .dshu-switch::after { transition: transform .12s ease; } }
    .dshu-btn:focus-visible, .dshu-switch:focus-visible, .dshu-chip:focus-visible, .dshu-link:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
    .dshu-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; margin: 16px 0 0; padding: 16px; border-radius: 20px; border: 0.5px dashed var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
    .dshu-empty-title { margin: 0; font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); }
    .dshu-empty-text { margin: 0; overflow-wrap: anywhere; }
    .dshu-empty .dshu-chips { margin-top: 8px; }
    .dshu-chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .dshu-chip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
    .dshu-chip:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dshu-link { padding: 0; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; text-decoration: underline; cursor: pointer; }
    .dshu-wait { margin: 16px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
    .dshu-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
    .dshu-infowrap { display: inline-flex; vertical-align: middle; margin-left: 4px; }
    .dshu-info { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
    .dshu-info:hover, .dshu-info[aria-expanded="true"] { color: var(--dsw-alias-label-primary); background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
    .dshu-info svg { display: block; width: 12px; height: 12px; }
    .dshu-info:focus-visible, .dshu-pop:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
    .dshu-pop { position: fixed; z-index: 2147482000; box-sizing: border-box; width: max-content; max-width: min(320px, calc(100vw - 16px)); overflow: auto; padding: 10px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent); font-size: 12px; line-height: 18px; font-weight: 400; text-align: left; text-transform: none; white-space: normal; overflow-wrap: anywhere; cursor: auto; }
    .dshu-pop:focus:not(:focus-visible) { outline: none; }
    .dshu-pop-title { margin: 0 0 4px; font-size: 13px; line-height: 20px; font-weight: 600; }
    .dshu-pop-line { margin: 6px 0 0; }
    .dshu-pop-title + .dshu-pop-line { margin-top: 0; }
    .dshu-pop-head { display: block; font-weight: 600; color: var(--dsw-alias-label-secondary); }
    .dshu-state { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); overflow-wrap: anywhere; }
    .dshu-state-dot { flex: none; align-self: center; width: 8px; height: 8px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
    .dshu-state[data-state="ok"] .dshu-state-dot { background: var(--dsw-alias-state-success-primary); }
    .dshu-state[data-state="busy"] .dshu-state-dot { background: var(--dsw-alias-brand-primary); }
    .dshu-state[data-state="warn"] .dshu-state-dot { background: var(--dsw-alias-state-warn-primary); }
    .dshu-state[data-state="error"] .dshu-state-dot { background: var(--dsw-alias-state-error-primary); }
    .dshu-state[data-state="off"] .dshu-state-dot { background: transparent; box-shadow: inset 0 0 0 1px var(--dsw-alias-label-secondary); }
    .dshu-state-next { color: var(--dsw-alias-label-secondary); }
    .dshu-errnote { margin: 8px 0 0; font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
    .dshu-errnote-what { margin: 0; color: var(--dsw-alias-state-error-primary); }
    .dshu-errnote-fix { margin: 2px 0 0; color: var(--dsw-alias-label-primary); }
    .dshu-errnote-act { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px; }
    .dshu-errnote-act .dshu-link { font-size: 12px; }
    .dshu-errnote-details { margin: 6px 0 0; padding: 8px 10px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-secondary); font: 11px/16px ui-monospace, Menlo, monospace; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 240px; overflow: auto; user-select: text; }
    `;
      const ensureStyle = () => {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
      };

      /** Copies text and says so. Resolves true when it worked. */
      const copyText = async (text) => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(String(text)); return true; }
        } catch { /* fall through to the old way */ }
        try {
          const area = document.createElement('textarea');
          area.value = String(text);
          area.setAttribute('readonly', '');
          area.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(area);
          area.select();
          const done = document.execCommand('copy');
          area.remove();
          return done === true;
        } catch { return false; }
      };

      /** The three fixed heads of an (i) pop-up, in this order. `changes` is accepted as another name for `change`. */
      const INFO_HEADS = [['what', 'What it does'], ['when', 'When to use it'], ['change', 'If you change it']];
      /** The same heads, and the button's "About". Plus is English only: every page gets these words. */
      const INFO_WORDS = {
        en: { what: 'What it does', when: 'When to use it', change: 'If you change it', about: (name) => (name ? `About ${name}` : 'About this') },
      };
      /** @returns {object} the (i)'s fixed words. `lang` is still accepted (older callers pass it) but every language gets English. */
      const infoWords = () => INFO_WORDS.en;
      /** What an (i) pop-up shows: the title and only the lines that were given. `lang` is accepted and ignored (English only). */
      const infoLines = ({ title, label, what, when, change, changes } = {}) => {
        const given = { what, when, change: change ?? changes };
        const words = infoWords();
        const blank = (v) => v == null || v === false || (typeof v === 'string' && v.trim() === '');
        return {
          title: blank(title) ? (blank(label) ? '' : label) : title,
          lines: INFO_HEADS.filter(([key]) => !blank(given[key])).map(([key]) => ({ key, head: words[key], text: given[key] })),
        };
      };

      /**
       * Where a pop-up goes: below its button, or above when there is more room there; its left edge follows the button
       * and is pulled in so the whole panel stays on screen. Sizes in pixels; returns { top, left, side, maxHeight }.
       */
      const placePop = ({ anchor, pop, view, gap = 6, margin = 8 }) => {
        const below = view.height - anchor.bottom - gap - margin;
        const above = anchor.top - gap - margin;
        const side = pop.height <= below || below >= above ? 'below' : 'above';
        const maxHeight = Math.max(80, Math.floor(side === 'below' ? below : above));
        const height = Math.min(pop.height, maxHeight);
        const top = side === 'below' ? anchor.bottom + gap : Math.max(margin, anchor.top - gap - height);
        const left = Math.max(margin, Math.min(anchor.left, view.width - margin - pop.width));
        return { top: Math.round(top), left: Math.round(left), side, maxHeight };
      };

      /**
       * A failed call as { text, details }: the plain sentence and the raw text. Uses the error helper's wording
       * (dshKit.plain) when the page also carries the dsh-kit block, so the two never say different things.
       */
      const explainError = (raw) => {
        try {
          // eslint-disable-next-line no-undef
          if (typeof dshKit !== 'undefined' && dshKit && typeof dshKit.plain === 'function') return dshKit.plain(raw);
        } catch { /* no error helper on this page */ }
        const message = typeof raw === 'string' ? raw : String(raw?.message ?? raw?.error ?? '');
        const details = raw && typeof raw === 'object' && typeof raw.details === 'string' ? raw.details : message;
        // A message that reads as a sentence is said as it is (as the error helper does); a bare code is not.
        const said = message.trim();
        if (/\s/.test(said) && !/^[a-z][\w-]*(?:\/[\w.-]+)+:/i.test(said)) return { text: said, details: details === message ? '' : details };
        return { text: 'Something went wrong. Try again; the Details say what the app reported.', details };
      };

      /** Raw details as text to show behind Details. */
      const detailText = (details) => {
        if (details == null || details === '') return '';
        if (typeof details === 'string') return details;
        if (details instanceof Error) return details.stack || String(details.message);
        try { return JSON.stringify(details, null, 2); } catch { return String(details); }
      };

      let infoCount = 0;

      /**
       * The words of a row title for its (i): the text itself, or the text written directly inside a simple element
       * title (`h('span', null, 'Keep awake', badge)` gives "Keep awake"; the badge is left out). Anything else gives
       * undefined: then pass `info.label`, or the (i) is only "About this".
       */
      const plainTitle = (title) => {
        if (typeof title === 'string') return title;
        if (typeof title === 'number') return String(title);
        if (!title || typeof title !== 'object') return undefined;
        const kids = [].concat(title.props?.children ?? title.children ?? []);
        const text = kids.filter((kid) => typeof kid === 'string' || typeof kid === 'number').join(' ').replace(/\s+/g, ' ').trim();
        return text || undefined;
      };

      const makeParts = (React, ReactDOM) => {
        ensureStyle();
        // The pop-up of an (i) with `portal: true` is drawn in the page body, out of a box that clips it or moves fixed
        // children (a header with container-type, say). Without ReactDOM it stays where it is, as before.
        const portalTo = (node) => (ReactDOM && typeof ReactDOM.createPortal === 'function' && typeof document !== 'undefined' && document.body ? ReactDOM.createPortal(node, document.body) : node);
        const h = React.createElement;
        /** The page frame: a title, one sentence under it, then the page. */
        const Page = ({ title, desc, children }) => h('div', { className: 'dshu-page' },
          title ? h('h2', { className: 'dshu-title' }, title) : null,
          desc ? h('p', { className: 'dshu-desc' }, desc) : null,
          children);
        const Group = ({ children }) => h('div', { className: 'dshu-group' }, children);
        /** A short line in the page's description style; `error` draws it in the error colour. */
        const Desc = ({ error, children, role }) => h('p', { className: 'dshu-desc', 'data-error': String(error === true), role: role ?? (error ? 'alert' : undefined) }, children);
        /** One setting: text on the left, the control(s) on the right. `info` ({ what, when, change }) adds an (i) after the title. */
        const Row = ({ title, desc, info, children }) => h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' },
            h('div', { className: 'dshu-rowtitle' }, title, info ? h(Info, { title: plainTitle(title), ...info }) : null),
            desc ? h('div', { className: 'dshu-rowdesc' }, desc) : null),
          children);
        const Side = ({ children }) => h('div', { className: 'dshu-side' }, children);
        /** `danger`: when it is on, the switch is drawn in the error colour (a safety rule that has been turned off). */
        const Switch = ({ on, label, onChange, disabled, danger }) => h('button', {
          type: 'button', role: 'switch', className: 'dshu-switch', 'data-danger': danger ? 'true' : undefined, 'aria-checked': on === true, 'aria-label': label, disabled: disabled === true, onClick: () => onChange(!on),
        });
        const Button = ({ main, danger, children, ...rest }) => h('button', { type: 'button', className: 'dshu-btn', 'data-main': main ? 'true' : undefined, 'data-danger': danger ? 'true' : undefined, ...rest }, children);
        const Field = (props) => h('input', { className: 'dshu-field', spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off', ...props });
        /** A button that copies `text` and shows "Copied" for a moment (a timer only while it is showing). */
        const CopyButton = ({ text, label = 'Copy', ...rest }) => {
          const [done, setDone] = React.useState(false);
          const timer = React.useRef(0);
          React.useEffect(() => () => clearTimeout(timer.current), []);
          return h(Button, { ...rest, 'aria-live': 'polite', onClick: async () => {
            if (await copyText(typeof text === 'function' ? text() : text)) { setDone(true); clearTimeout(timer.current); timer.current = setTimeout(() => setDone(false), 1500); }
          } }, done ? 'Copied' : label);
        };
        /** A row of small choices (starter chips). `items` are strings or { label, value }; `onPick(value)`. */
        const Chips = ({ items, onPick, label }) => h('div', { className: 'dshu-chips', role: 'group', 'aria-label': label ?? 'Suggestions' },
          items.map((item) => { const entry = typeof item === 'string' ? { label: item, value: item } : item; return h('button', { key: entry.label, type: 'button', className: 'dshu-chip', onClick: () => onPick(entry.value ?? entry.label) }, entry.label); }));
        /** What a list shows when it has nothing yet: what it is for, then what to do first (optionally as starter chips). */
        const Empty = ({ title, text, chips, onPick, children }) => h('div', { className: 'dshu-empty', role: 'status' },
          title ? h('p', { className: 'dshu-empty-title' }, title) : null,
          text ? h('p', { className: 'dshu-empty-text' }, text) : null,
          chips && chips.length > 0 ? h(Chips, { items: chips, onPick: onPick ?? (() => {}) }) : null,
          children);
        const Wait = ({ children }) => h('p', { className: 'dshu-wait', role: 'status' }, children ?? 'Loading…');

        const useLayout = React.useLayoutEffect ?? React.useEffect;
        // The (i) drawn as a ring with an "i" in the text colour, like the app's own info icon.
        const infoIcon = () => h('svg', { viewBox: '0 0 16 16', 'aria-hidden': 'true', focusable: 'false', fill: 'none', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' },
          h('circle', { cx: 8, cy: 8, r: 6.6 }),
          h('path', { d: 'M8 7.3v4' }),
          h('circle', { cx: 8, cy: 4.9, r: 0.45, fill: 'currentColor' }));
        /**
         * A small (i) button that opens a pop-up saying what a control does, when to use it and what changes if you change it.
         * `title` is the bold first line, `label` names the control for screen readers ("About <label>"; defaults to the title).
         * Opens on click, Enter or Space; Esc, a click outside or Tab away closes it; Esc puts the focus back on the (i).
         * `more` is one last line, or a list of lines. `portal: true` draws the pop-up in the page body (needs ReactDOM in makeParts).
         * `lang` is accepted and ignored: the heads and button name are always English.
         */
        const Info = (props) => {
          const { label, more, side, portal } = props;
          const extra = (Array.isArray(more) ? more : [more]).filter((line) => line != null && line !== false && line !== '');
          const { title, lines } = infoLines(props);
          const [open, setOpen] = React.useState(false);
          const [place, setPlace] = React.useState(null);
          const wrap = React.useRef(null);
          const button = React.useRef(null);
          const pop = React.useRef(null);
          const autoId = React.useId ? React.useId() : null;
          const fallbackId = React.useRef(null);
          if (!autoId && fallbackId.current == null) { infoCount += 1; fallbackId.current = `dshu-info-${infoCount}`; }
          const id = `dshu-pop-${String(autoId ?? fallbackId.current).replace(/[^\w-]/g, '')}`;
          const name = label ?? (typeof title === 'string' ? title : '');
          const about = infoWords().about;
          const measure = () => {
            const b = button.current; const p = pop.current;
            if (!b || !p || typeof window === 'undefined') return;
            const r = b.getBoundingClientRect();
            const found = placePop({ anchor: r, pop: { width: p.offsetWidth, height: p.scrollHeight }, view: { width: window.innerWidth, height: window.innerHeight } });
            // `side: 'above'` asks for the top first; it still flips when it does not fit.
            setPlace(side === 'above' && r.top - 6 - 8 >= p.scrollHeight ? { ...found, side: 'above', top: Math.round(r.top - 6 - p.scrollHeight) } : found);
          };
          useLayout(() => {
            if (!open) { setPlace(null); return undefined; }
            measure();
            try { pop.current?.focus({ preventScroll: true }); } catch { /* the panel is gone */ }
            return undefined;
          }, [open]);
          React.useEffect(() => {
            if (!open || typeof document === 'undefined') return undefined;
            // The pop-up may sit in the page body (portal): a click in it is not outside.
            const inPop = (node) => Boolean(pop.current) && typeof pop.current.contains === 'function' && pop.current.contains(node);
            const inside = (node) => Boolean(node) && ((wrap.current && wrap.current.contains(node)) || inPop(node));
            const onDown = (event) => { if (wrap.current && !inside(event.target)) setOpen(false); };
            const onKey = (event) => {
              if (event.key !== 'Escape') return;
              // Only while the focus is in the (i) or its pop-up; then only the pop-up closes, not the dialog or menu
              // around it. On the window, first in the capture phase, so it runs before the panels' own Esc listeners
              // on the document; stopImmediatePropagation keeps every later listener from seeing it.
              const focused = typeof document !== 'undefined' ? document.activeElement : null;
              if (!wrap.current || !focused || !inside(focused)) return;
              event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
              setOpen(false);
              try { button.current?.focus(); } catch { /* the button is gone */ }
            };
            const onMove = () => measure();
            document.addEventListener('pointerdown', onDown, true);
            window.addEventListener('keydown', onKey, true);
            window.addEventListener('resize', onMove);
            window.addEventListener('scroll', onMove, true);
            return () => {
              document.removeEventListener('pointerdown', onDown, true);
              window.removeEventListener('keydown', onKey, true);
              window.removeEventListener('resize', onMove);
              window.removeEventListener('scroll', onMove, true);
            };
          }, [open]);
          // Clicks inside never reach a row or menu item the (i) sits in; nor do the keys such a row or menu acts on.
          const stop = (event) => { event.stopPropagation(); };
          const stopKeys = (event) => { if (['Enter', ' ', 'Spacebar', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) event.stopPropagation(); };
          return h('span', {
            ref: wrap, className: 'dshu-infowrap', onClick: stop, onPointerDown: stop, onMouseDown: stop, onKeyDown: stopKeys,
            onBlur: (event) => { if (open && wrap.current && event.relatedTarget && !wrap.current.contains(event.relatedTarget) && !(pop.current && typeof pop.current.contains === 'function' && pop.current.contains(event.relatedTarget))) setOpen(false); },
          },
          h('button', {
            ref: button, type: 'button', className: 'dshu-info', 'aria-label': about(name), 'aria-expanded': open,
            'aria-haspopup': 'dialog', 'aria-controls': open ? id : undefined, onClick: () => setOpen(!open),
          }, infoIcon()),
          open ? (portal ? portalTo : (node) => node)(h('div', {
            ref: pop, id, className: 'dshu-pop', role: 'dialog', tabIndex: -1, 'data-side': place?.side,
            'aria-label': title ? undefined : about(name), 'aria-labelledby': title ? `${id}-t` : undefined,
            style: place ? { top: place.top, left: place.left, maxHeight: place.maxHeight } : { top: 0, left: 0, visibility: 'hidden' },
          },
          title ? h('p', { id: `${id}-t`, className: 'dshu-pop-title' }, title) : null,
          lines.map((line) => h('p', { key: line.key, className: 'dshu-pop-line' }, h('span', { className: 'dshu-pop-head' }, line.head), line.text)),
          extra.map((line, index) => h('p', { key: `more-${index}`, className: 'dshu-pop-line' }, line)))) : null);
        };

        const STATES = ['ok', 'busy', 'idle', 'off', 'warn', 'error'];
        /**
         * One line that says in words what is happening and what to do next: a coloured dot, `words`, then `next`
         * (text or a button). `state` is ok, busy, idle, off, warn or error; anything else counts as idle.
         * `live: false` keeps the line out of screen readers' announcements (for words that change every few
         * seconds, such as a step count); then announce only the changes that matter somewhere else.
         */
        const StateLine = ({ state, words, next, live = true, children }) => {
          const shown = STATES.includes(state) ? state : 'idle';
          return h('p', { className: 'dshu-state', 'data-state': shown, role: live === false ? undefined : shown === 'error' ? 'alert' : 'status' },
            h('span', { className: 'dshu-state-dot', 'aria-hidden': 'true' }),
            words ? h('span', { className: 'dshu-state-words' }, words) : null,
            next ? h('span', { className: 'dshu-state-next' }, next) : null,
            children);
        };

        /**
         * An error in plain words: what went wrong (`what`), what to do or click (`fix`, and any buttons as children),
         * and the raw text only behind a Details toggle. Give `error` instead of `what` to word a failed call the way
         * the error helper does; `details` (text or an object) wins over the raw text it keeps.
         */
        const ErrorNote = ({ what, fix, details, error, children }) => {
          const [open, setOpen] = React.useState(false);
          const hasError = error !== undefined && error !== null && error !== '';
          const fromError = hasError ? explainError(error) : { text: '', details: '' };
          // With your own `what`, the raw error itself goes behind Details.
          const rawError = hasError ? (fromError.details || (typeof error === 'string' ? error : error.details || error.message || error)) : '';
          const text = what || fromError.text;
          const raw = detailText(details ?? (what ? rawError : fromError.details));
          if (!text && !fix && !raw) return null;
          return h('div', { className: 'dshu-errnote', role: 'alert' },
            h('p', { className: 'dshu-errnote-what' }, text || 'Something went wrong.'),
            fix ? h('p', { className: 'dshu-errnote-fix' }, fix) : null,
            children || raw ? h('div', { className: 'dshu-errnote-act' },
              children,
              raw ? h('button', { type: 'button', className: 'dshu-link', 'aria-expanded': open, onClick: () => setOpen(!open) }, open ? 'Hide details' : 'Details') : null) : null,
            open && raw ? h('pre', { className: 'dshu-errnote-details' }, raw) : null);
        };
        return { Page, Group, Desc, Row, Side, Switch, Button, Field, CopyButton, Chips, Empty, Wait, Info, StateLine, ErrorNote };
      };
      return { makeParts, ensureStyle, copyText, infoLines, placePop, explainError };
    })();
    // ---- dsh-ui:end ----
    // The shared (i) pop-up and parts (item 4A: the (i) about spaces).
    const ui = dshUi.makeParts(React, ReactDOM);
    const { ask: askInPage } = dshKit;
    // Before the first paint where the page has it (tab names), so a cut name never flashes.
    const useLayoutEffectSafe = React.useLayoutEffect ?? useEffect;

    /** The app's UI library when the page exposes it; every use has a plain fallback. */
    let UI = {};
    try {
      UI = require('@deepseek-ai/dsh-client-ui-primitives') || {};
    } catch {
      UI = {};
    }

    const NS = 'coworkShell';
    const SETTINGS_NS = 'cowork-shell';
    const MODES_NS = 'modes';
    const LOCAL_KEY = 'dsh-cowork-shell.tab';

    const DICT = {
      en: {
        'tabs.label': 'Spaces',
        // Item 4A, stage 3a: the five space buttons.
        'spaces.label': 'Spaces',
        'space.chat': 'Chat',
        'space.code': 'Code',
        'space.devices': 'Devices',
        'space.recon': 'Recon',
        'space.workshop': 'Workshop',
        // Item 4A, stage 6a: Modes kept a reused draft in another space, so the window opened a new one.
        'draft.kept': 'That draft belongs to {space}, so a new draft was opened here.',
        // Lab re-check 2 (6a, problem 2): no new draft could open here (Recon opens only in its room), so the window went along.
        'draft.followed': 'That draft belongs to {space}, so the window went there. To start a new thread in {from}, click its button, then New.',
        // Stage 7 (point 29): New clicked in a thread that has run, then a send at once: it goes to the new draft.
        'send.newNotOpen': 'The new thread did not open in time, so your message was not sent. It is still in the chat box: press Send to send it in this thread, or click New again.',
        'send.notMoved': 'Your message was not sent: it could not be moved into the new thread. It is still in the chat box of the thread you were in; copy it here and press Send.',
        'send.waiting': 'Waiting for the new thread to open, then sending your message there.',
        // Stage 7 lab (bug D): the old thread's chat box still held the moved message; it was cleared (or Enter there asks).
        'send.alreadySent': 'This message was already sent in the new thread.',
        'send.alreadyAsk': 'This message was already sent in the new thread. Send it here too?',
        'send.alreadyYes': 'Send here too',
        'send.alreadyNo': "Don't send",
        'spaces.arrange': 'Arrange spaces',
        'spaces.arrange.hint': 'Drag a space to move it, or use the arrow keys on it.',
        'new.space.chat': 'New chat',
        'new.space.code': 'New code task',
        'new.space.devices': 'New device task',
        'new.space.recon': 'New Recon search',
        'new.space.workshop': 'New workshop task',
        'workshop.off': 'Switch on Creator Plus to start Workshop threads.',
        'workshop.off.open': 'Open Creator Plus settings',
        'spaces.info.title': 'Spaces',
        'spaces.info.what': 'A space is where a thread lives: Chat, Code, Devices, Recon or Workshop. Each space has its own list, New button, Archived and Trash.',
        'spaces.info.when': 'Pick a space to see its threads and to start new ones there. The Mode list under the chat box sets how a thread works; changing the mode never moves the thread.',
        'spaces.info.change': 'Devices, Recon and Workshop show while their add-on is on and its Offer switch (Offer the Devices, Recon or Creator Plus mode) is on too. A thread whose space is hidden is kept: find it with Show all or ⌘K. Change the order with the pencil; move a thread with Move to in its ⋯ menu.',
        'move.label.space': 'Move "{title}" to another space',
        'rows.projects': 'Projects',
        'rows.settings.hint': 'Opens Settings → {page}',
        'lib.chats': 'Chats',
        'lib.chats.info.title': 'Chats and Projects',
        'lib.chats.info.what': 'Chats are threads that live on their own: each keeps its own files in a private folder, and deleting it moves those files to the trash with it (you can put them back for 30 days). Projects are folders of yours; a thread in a project works in that folder.',
        'lib.chats.info.when': 'New chat starts where Settings → Spaces says (standalone by default). Flip the Cowork switch under the chat box to work in a project, or use + on a project\'s row.',
        'lib.chats.info.change': 'A grey tag on a thread names its mode when it is not the usual one. Older Chat-mode threads of the default workspace show under Chats, as they did before spaces.',
        'lib.projects': 'Projects',
        'lib.chats.empty': 'No chats yet. Click New chat to start one.',
        'projects.title': 'Projects',
        'projects.hint': 'Your project folders. Pick one to see its instructions and files. To add a folder, use + New in the left panel\'s list.',
        'projects.info.what': 'A project is a folder on this Mac. Threads in a project work in that folder and get its instructions.',
        'projects.info.when': 'Open a project to change its instructions or add files. Start a thread in it with + on its row in the left panel.',
        'projects.info.change': 'To add a project, use + New under Projects in the left panel. To open one, click Open. To remove one from the app, use ⋯ on its row; its folder and files stay on this Mac.',
        'projects.none': 'No projects yet. Use + New in the left panel\'s list to add a folder.',
        'projects.threads': '{n} threads',
        'projects.threads.one': '1 thread',
        'projects.default': 'Default workspace',
        'projects.all': 'All projects',
        'row.mode': 'Mode: {mode}',
        'projects.open': 'Open',
        'start.mode.none': 'The new thread did not open in time. Click New chat, then pick the mode from the Mode list under the chat box.',
        // Item 4A, stage 4: the Cowork switch (a new Chat thread) and the place label (a started one), under the chat box.
        'cowork.label': 'Cowork',
        'cowork.on': 'Cowork on: works in a project folder',
        'cowork.off': 'Cowork off: a standalone thread with its own files',
        'cowork.info.what': 'Off: this thread keeps its own files in a private folder; deleting it moves them to the trash with it (you can put them back for 30 days). On: it works in a project folder you choose.',
        'cowork.info.when': 'Switch it on to work on files you keep, or to group threads in a project. Leave it off for a quick question.',
        'cowork.info.change': 'Only before the first message. Switching on shows the folder picker above the chat box with the default workspace chosen; pick another project there. A started thread cannot move to another folder.',
        'cowork.busy': 'Switching…',
        'cowork.close': 'Close',
        'cowork.failed.on': 'The thread could not move to a project folder, so it stays standalone.',
        'cowork.failed.off': 'The thread could not become standalone, so it stays in its project folder.',
        'cowork.failed.fix': 'Click the Cowork switch again. If it keeps failing, click New chat and switch before you type.',
        'cowork.noproject': 'There is no project folder to work in yet. Make one with Projects → + New, then switch Cowork on.',
        'place.standalone': 'Standalone',
        'place.info.title': 'Where this thread works',
        'place.info.what': 'Standalone: this thread keeps its own files in a private folder; deleting it moves them to the trash with it (you can put them back for 30 days). A project name: it works in that project\'s folder, and deleting the thread leaves the project\'s files alone.',
        'place.info.when': 'Set with the Cowork switch before the first message.',
        'place.info.change': 'A started thread cannot move to another folder. To work in a project, start a New chat and switch Cowork on.',
        'new.chat': 'New chat',
        'new.cowork': 'New task',
        'new.code': 'New code task',
        'new.other': 'New thread',
        'new.research': 'New research',
        'new.scout': 'New search',
        'pages.label': '{tab} sections',
        'more': 'More',
        'look.logos.hide': 'Hide DeepSeek logos',
        'look.logos.show': 'Show DeepSeek logos',
        'look.title.date': 'Show the date as the title',
        'look.title.greeting': 'Show the greeting as the title',
        'look.chat.wide': 'Wide chat area',
        'look.chat.normal': 'Normal chat area',
        'look.tabs.icons': 'Icon alone when a name does not fit',
        'look.tabs.names': 'Always show names',
        'look.failed': 'Could not save that setting.',
        'tabs.arrange': 'Arrange tabs',
        'tabs.arrange.hint': 'Drag a tab to move it, or use the arrow keys on it.',
        'tabs.arrange.move': 'Move {tab}',
        'tabs.arrange.reset': 'Reset order',
        'tabs.arrange.done': 'Done',
        'toggle.open': 'Open the left panel',
        'toggle.collapse': 'Collapse the left panel',
        'brand': 'DeepSeek Harness',
        'tab.failed': 'Could not switch to {tab}. Click its button again; if it keeps failing, restart the app.',
        'connectors.title': 'Connectors',
        'connectors.hint': 'Apps and data sources the assistant can use, through MCP servers. A switched-off connector keeps its settings.',
        'connectors.empty': 'No connectors yet. Add one below, or copy one from the MCP starter pack (templates/mcp-starter in DeepSeek Harness Plus).',
        'connectors.unavailable': 'The connector list could not be read. Click Refresh to try again.',
        'connectors.on': 'On',
        'connectors.noSwitch': 'The on/off switch is not available here; use the Plugins page.',
        'connectors.failed': 'Could not switch: {message}',
        'connectors.restartNeeded': 'Saved. Restart DeepSeek Harness for this to take effect.',
        'connectors.switchFailed': 'The app could not apply the switch.',
        'connectors.overridden': 'Your settings file overrides this switch.',
        'status.connected': 'Connected · {n} tools',
        'status.connected.one': 'Connected · 1 tool',
        'status.notConnected': 'No tools yet',
        'status.notConnected.hint': 'Still starting, or it failed to start. Check the program or address, and any key it needs.',
        'status.disabled': 'Off',
        'add.title': 'Add a connector',
        'add.name': 'Name (letters, digits, - or _)',
        'add.kind': 'Type',
        'add.kind.stdio': 'Program on this Mac',
        'add.kind.http': 'Web address',
        'add.command': 'Program to run (for example npx)',
        'add.args': 'Arguments, one per line',
        'add.url': 'Address (https://…)',
        'add.copy': 'Copy',
        'add.copied': 'Copied.',
        'add.note': 'A key or token you type here goes into the app\'s secret store, never into the settings file. The file only holds a reference to it.',
        'add.keyName.stdio': 'Key it needs: its name (optional, for example GITHUB_TOKEN)',
        'add.keyName.http': 'Key it needs: the header name (optional, usually Authorization)',
        'add.keyValue': 'The key itself (kept in the app\'s secret store, never in the file)',
        'add.show': 'Show what will be added',
        'add.checking': 'Checking…',
        'add.preview.title': 'This will be added at the end of {file}:',
        'add.preview.same': 'Nothing else in the file changes. Before it writes, a copy of the file is kept, the app\'s own check reads the new file in a throwaway copy of its home, and the file is written only if all of that works.',
        'add.preview.key': 'The key is kept in the app\'s secret store under the name {ref}. The file only says ${credential:{ref}}, so the key itself is never in it.',
        'add.preview.keyKept': 'A key is already kept under that name, so leaving the key box empty keeps it.',
        'add.preview.nocheck': 'The app\'s own check program was not found here, so Write it for me is off (the file is never changed without that check). Copy the lines, quit DeepSeek Harness, paste them at the end of {file} (keep a copy of the file first), and open the app again.',
        'add.write': 'Write it for me',
        'add.writing': 'Writing…',
        'add.change': 'Change something',
        'add.back': 'Back to the lines',
        'add.problems': 'Please fix this first:',
        'add.failed': 'Could not reach the app. Nothing was changed.',
        'add.done.title': 'Added: {name}',
        'add.done.file': 'Written to {file}.',
        'add.done.backup': 'A copy of the old file is kept at {backup}.',
        'add.done.nobackup': 'There was no settings file yet, so there was nothing to copy first.',
        'add.restart.title': 'Restart needed',
        'add.restart.body': 'DeepSeek Harness reads this file only when it starts. Quit it (press Cmd+Q) and open it again. The connector then shows in the list above, with its own switch.',
        'add.restart.why': 'The app gives add-ons no Restart button, so this step is yours.',
        'add.refused.title': 'Nothing was changed.',
        'add.refused.details': 'Details',
        'add.another': 'Add another',
        'connectors.waiting': 'Added, starts after a restart',
        'skills.title': 'Skills',
        'skills.hint': 'Instructions the assistant can load for a kind of work. You can also start one by typing / in the chat box. These are the skills found for your default folder; a project can add its own.',
        'skills.search': 'Search skills',
        'skills.empty': 'No skills found.',
        'skills.unavailable': 'The skill list could not be read. Click Refresh to try again.',
        'skills.model': 'assistant can use',
        'skills.user': '/ command',
        'skills.allMarks': 'All marks',
        'skills.markFilter': 'Show skills by where they came from',
        'skills.markHint': 'Where this skill came from, as Tuner Plus sorted it',
        'skills.mark.default': 'Default',
        'skills.mark.downloaded': 'Downloaded',
        'skills.mark.plus': 'Plus',
        'skills.mark.ai': 'AI-made',
        'skills.mark.mine': 'Mine',
        'skills.mark.unsorted': 'Not sorted',
        'refresh': 'Refresh',
        'chips.label': 'Suggestions',
        'place.label': 'Where this thread works',
        'place.scratch': 'Scratch',
        'place.folder': 'Folder',
        'place.failed': 'Could not start in Scratch. Try again; if it keeps failing, restart the app.',
        'place.scratch.hint': 'Scratch: the thread works in a private folder of its own, never in one of your folders. Deleting it removes its files too.',
        'place.folder.hint': 'Folder: the thread works in one of your project folders (pick it on the left).',
        'untitled': 'New thread',
        'running': 'Running',
        'needs.title': 'Needs you ({n})',
        'needs.approval': 'Waiting for your approval',
        'needs.plan-review': 'Plan waiting for your review',
        'needs.question': 'Waiting for your answer',
        'needs.permission': 'The AI asks to use a tool',
        'move.to': 'Move to {tab}',
        'move.label': 'Move "{title}" to another tab',
        'move.failed': 'Could not move the thread.',
        'move.failed.fix': 'Try again. If it keeps failing, restart the app.',
        'move.recon': 'Opened as a new {tab} thread; the Recon original stays in Recon.',
        'move.reconFiles': 'Opened as a new {tab} thread, with its {n} file(s) copied out of Recon; the Recon original stays in Recon.',
        'move.reconFailed': 'Could not move it out of Recon: {why}',
        'move.reconDraft': 'Opened as a new {tab} thread. A first message is ready in the chat box: read it, then press Send. Nothing has gone to the model yet.',
        'move.reconDraftFiles': 'Opened as a new {tab} thread, with its {n} file(s) you ticked copied out of Recon. A first message is ready in the chat box: read it, then press Send. Nothing has gone to the model yet.',
        'move.reconCancelled': 'Nothing was moved.',
        'move.reconProject': 'A whole project of Recon threads is not moved. Move one thread at a time: each one gets its own preview of what leaves Recon.',
        'archive': 'Archive',
        'find.placeholder': 'Search {tab}…',
        'find.hint': 'Titles as you type. Press Enter to search the text of messages too.',
        'find.text': 'Showing threads whose title or messages match.',
        'find.failed': 'The text of messages could not be searched; titles were.',
        'find.none': 'Nothing in {tab} matches.',
        'find.clear': 'Clear the search',
        'find.global': 'Search everything',
        'ctx.open': 'Open',
        'ctx.rename': 'Rename',
        'ctx.rename.save': 'Save',
        'ctx.reveal': 'Show in Finder',
        'reveal.failed': 'Could not show it in Finder. Try again; if it keeps failing, restart the app.',
        'proj.remove': 'Remove project',
        'proj.remove.sure': 'Remove the project "{name}" from the list?\n\nOnly its entry goes. The folder and its files are not touched, and any threads left in it appear under Ungrouped.',
        'proj.remove.failed': 'Could not remove the project: {message}',
        'ctx.archive.n': 'Archive {n} threads',
        'ctx.delete.n': 'Delete {n} threads',
        'ctx.restore': 'Put back in the list',
        'ctx.restore.n': 'Put {n} back in the list',
        'pick.count': '{n} selected',
        'pick.clear': 'Clear',
        'pick.hint': 'Cmd-click or Shift-click selects several. Right-click for more.',
        'delete.confirm.n': 'Delete {n} threads?\n\nThey go to the trash. You can put them back for 30 days. After that they are gone for good.',
        'rename.failed': 'Could not rename the thread. Try again; if it keeps failing, restart the app.',
        'archive.failed': 'Could not archive the thread. Try again; if it keeps failing, restart the app.',
        'archive.running': 'This thread is still working. Stop it and archive it?',
        'archived.title': 'Archived ({n})',
        'archived.restore': 'Restore',
        'archived.restore.label': 'Restore "{title}"',
        'archived.restore.failed': 'Could not restore the thread. Try again; if it keeps failing, restart the app.',
        'delete': 'Delete',
        'delete.label': 'Delete "{title}"',
        'delete.confirm': 'Delete "{title}"?\n\nIt goes to the trash. You can put it back for 30 days. After that it is gone for good.',
        'delete.confirm.scratch': 'Delete "{title}"?\n\nIt goes to the trash together with the files it made in Scratch (a copy of it that still works there keeps them until it is deleted too). You can put both back for 30 days. After that they are gone for good.',
        'trash.files': 'with its files',
        'delete.running': 'This thread is still working. Stop it and delete it?',
        'stop.automation.one': 'An automation delivers into this thread: {names}. To go on, the app deletes that automation and its list of past runs for good. It cannot be put back, even if the thread is. Go on?',
        'stop.automation.many': '{n} automations deliver into this thread: {names}. To go on, the app deletes them and their lists of past runs for good. They cannot be put back, even if the thread is. Go on?',
        'stop.automation.unnamed': 'An automation delivers into this thread. To go on, the app deletes it and its list of past runs for good. It cannot be put back, even if the thread is. Go on?',
        'delete.failed': 'Could not delete the thread. Try again; if it keeps failing, restart the app.',
        'trash.title': 'Trash ({n})',
        'trash.left': '{n}d left',
        'trash.back': 'Put back',
        'trash.erase': 'Delete permanently',
        'trash.erase.label': 'Delete "{title}" permanently',
        'trash.erase.confirm': 'Delete "{title}" permanently?\n\nIt is erased from this Mac and cannot be put back. A copy may remain in a backup, such as Time Machine, or, if you use Sync, in your sync repository\'s history.',
        'trash.erase.failed': 'It could not be deleted permanently. Try again; if it keeps failing, restart the app.',
        'trash.empty': 'Empty trash',
        'trash.empty.label': 'Empty this space\'s trash: delete its {n} threads permanently',
        'trash.empty.label.one': 'Empty this space\'s trash: delete its 1 thread permanently',
        'trash.empty.confirm': 'Delete all {n} threads in this space\'s Trash permanently?\n\nThey are erased from this Mac and cannot be put back. Any the app still holds open are erased as soon as it lets go of them, at the latest at the next start. The Trash of other spaces is not touched. A copy may remain in a backup, such as Time Machine, or, if you use Sync, in your sync repository\'s history.',
        'trash.empty.confirm.one': 'Delete the 1 thread in this space\'s Trash permanently?\n\nIt is erased from this Mac and cannot be put back. If the app still holds it open, it is erased as soon as it lets go of it, at the latest at the next start. The Trash of other spaces is not touched. A copy may remain in a backup, such as Time Machine, or, if you use Sync, in your sync repository\'s history.',
        'trash.empty.busy': 'Emptying…',
        'trash.empty.confirm.rows': 'Delete all {n} rows in this space\'s Trash permanently ({what})?\n\nThey are erased from this Mac and cannot be put back. Any the app still holds open are erased as soon as it lets go of them, at the latest at the next start. The Trash of other spaces is not touched. A copy may remain in a backup, such as Time Machine, or, if you use Sync, in your sync repository\'s history.',
        'trash.empty.confirm.rows.one': 'Delete the 1 row in this space\'s Trash permanently ({what})?\n\nThey are erased from this Mac and cannot be put back. Any the app still holds open are erased as soon as it lets go of them, at the latest at the next start. The Trash of other spaces is not touched. A copy may remain in a backup, such as Time Machine, or, if you use Sync, in your sync repository\'s history.',
        'trash.erase.confirm.group': 'Delete "{title}" permanently ({what})?\n\nThey are erased from this Mac and cannot be put back. Any the app still holds open are erased as soon as it lets go of them, at the latest at the next start. A copy may remain in a backup, such as Time Machine, or, if you use Sync, in your sync repository\'s history.',
        'trash.count': '{n} threads',
        'trash.count.one': '1 thread',
        'trash.data': 'saved settings',
        'trash.data.its': 'its saved settings',
        'trash.folder': 'a folder',
        'trash.folder.its': 'its folder',
        'trash.erase.partly': '{n} could not be deleted permanently: {reason}',
        'trash.and': ' and ',
        'trash.empty.label.rows': 'Empty this space\'s trash: delete its {n} rows permanently',
        'trash.left.oldest': 'oldest: {n}d left',
        'trash.back.needs': 'Put back needs {label}, which is off now. Switch it on, then try again.',
        'trash.back.newer': 'Put back needs a newer version of the Left panel add-on. Update Plus, then try again.',
        'trash.back.partly': '{back} came back, {left} did not: {reason}',
        'trash.empty.untold': '{n} older threads, deleted before their space was kept, show in every space\'s Trash: Empty trash leaves them. Delete them one at a time if you want them gone now.',
        'trash.empty.untold.one': '1 older thread, deleted before its space was kept, shows in every space\'s Trash: Empty trash leaves it. Delete it on its own if you want it gone now.',
        'trash.empty.failed': '{n} could not be deleted permanently and stay in the Trash.',
        'trash.erasing': 'Being deleted',
        'trash.erasing.hint': 'Deleted permanently while it was still open: it is erased as soon as the app lets go of it, at the latest at the next start.',
        'archived.wiping': 'Being deleted',
        'archived.wiping.hint': 'Ended with /recon end: it is deleted for good as soon as the app lets go of it, at the latest at the next start. It cannot be restored or put in the trash.',
        'trash.back.label': 'Put "{title}" back',
        'trash.back.failed': 'Could not put the thread back. Try again; if it keeps failing, restart the app.',
        'promote.to': 'Promote to {tab}',
        'promote.label': 'Promote or continue "{title}"',
        'continue.open': 'Continue in a project…',
        'continue.title': 'Continue in a project',
        'continue.as': 'Start as',
        'continue.none': 'No projects yet. Add one with + New under Projects in the left panel.',
        'continue.back': 'Back',
        'continue.prompt': 'Continue from my thread {mention}. ',
        'continue.failed': 'Could not start the new thread. Try again; if it keeps failing, restart the app.',
        'keep.open': 'Keep in a project…',
        'keep.title': 'Keep in a project',
        'keep.hint': 'Copies the files this Scratch thread made into a new folder in the project (nothing there is replaced), then continues there. This thread stays until you delete it.',
        'keep.prompt': 'Continue from my Scratch thread {mention}. Its files are now in the folder "{folder}" of this project. ',
        'keep.prompt.none': 'Continue from my Scratch thread {mention}. ',
        'keep.failed': 'Could not keep it in the project: {message}',
        'proj.move': 'Move all threads of "{title}" to another tab',
        'proj.move.space': 'Move all threads of "{title}" to another space',
        'proj.new': 'New thread in this project',
        'proj.add': 'New',
        'proj.add.path': 'The full path of the project\'s folder:',
        'proj.add.hint': 'Pick a folder. It becomes a project with its own files, instructions and threads.',
        'proj.add.failed': 'The project could not be added: {message}',
        'proj.open': 'Project page: files and instructions',
        'proj.page.none': 'Pick a project in the left panel, or add one with + New.',
        'proj.page.folder': 'Folder',
        'proj.page.newconv': 'New thread',
        'proj.page.name': 'Name',
        'proj.page.rename': 'Rename',
        'proj.page.tab': 'Shows under',
        'proj.page.instr': 'Instructions',
        'proj.page.instr.hint': 'What the assistant should know and do in every thread of this project. A file named AGENTS.md or CLAUDE.md in the folder is read as well.',
        'proj.page.instr.place': 'For example: who this work is for, the tone to write in, what to check before finishing.',
        'proj.page.save': 'Save',
        'proj.page.saved': 'Saved. New messages in this project use it.',
        'proj.page.failed': 'That did not work: {message}',
        'proj.page.files': 'Files',
        'proj.page.files.hint': 'The files in the project folder. Files you add are copied into that folder; your originals stay where they are.',
        'proj.page.files.add': 'Add files',
        'proj.page.files.none': 'The folder has no files yet.',
        'proj.page.files.more': 'Only the newest {n} files are listed.',
        'proj.page.files.added': 'Added: {names}',
        'proj.page.files.busy': 'Copying…',
        'proj.page.convs': 'Threads',
        'proj.page.convs.none': 'No threads in this project yet.',
        'type.title': 'Type',
        'type.title.new': 'What kind of project is this?',
        'type.hint': 'A type gives the project ready-made instructions for that kind of work. They are a starting point: change them as you like. Blank adds nothing.',
        'type.applied': '{name}: its instructions are in place. Change them below as you like.',
        'type.blank': 'Blank: no instructions from a type.',
        'type.only': 'The type is now {name}. Your instructions were left as they are.',
        'type.preview': 'The instructions of "{name}". You already have instructions of your own:',
        'type.replace': 'Replace mine with these',
        'type.keep': 'Keep mine, only change the type',
        'type.cancel': 'Cancel',
        'type.own': 'yours',
        'type.remove': 'Remove this preset',
        'type.remove.sure': 'Remove your preset "{name}"?\n\nProjects that use it keep their instructions.',
        'type.removed': 'Preset removed.',
        'type.keepas': 'Save as my preset…',
        'type.keepas.name': 'A name for the preset',
        'type.keepas.save': 'Save preset',
        'type.keepas.done': 'Saved as your preset "{name}". It is offered for every new project.',
        'type.keepas.hint': 'Keeps these instructions as a type of your own, for other projects.',
        'type.tool.data.on': 'This type uses the Data tools for tables (CSV, Excel). They are available.',
        'type.tool.data.off': 'This type can use the Data tools for tables (CSV, Excel). They are switched off: Settings → Data → Offer the Data mode.',
        'type.tool.finance.on': 'This type uses the Finance tools for company and economy figures. They are available.',
        'type.tool.finance.off': 'This type can use the Finance tools for company and economy figures. They are switched off: Settings → Finance → Offer the Finance mode.',
        'type.search.off': 'New threads in this project start with Web set to Off, so your papers do not turn into web queries. You can switch Web on in the chat box.',
        'gen.open': 'Generate with a model…',
        'gen.title': 'Write the instructions with a model',
        'gen.hint': 'A model reads a summary of this folder and the project\'s type, and writes instructions for this project. It gets no tools: it cannot open, change or delete anything. You see the result before anything is saved.',
        'gen.model': 'Model',
        'gen.model.none': 'Pick a model…',
        'gen.what.full': 'File names and the start of text files',
        'gen.what.names': 'File names only',
        'gen.sent': 'What would be sent: the names of {files} files{more}, and the start of {included} text files. About {chars} characters in all.',
        'gen.sent.names': 'What would be sent: the names of {files} files{more}. No contents. About {chars} characters in all.',
        'gen.sent.empty': 'The folder is empty. The instructions will be written from the project\'s type alone.',
        'gen.sent.more': ' (and more)',
        'gen.sent.files': 'Text taken from: {names}',
        'gen.secrets': 'Left out because they look like secrets: {names}',
        'gen.guides': '{names} is in the folder. The app already gives it to the assistant; it is sent along so the new instructions fit beside it.',
        'gen.where.local': 'This model runs on this computer. Nothing leaves it.',
        'gen.where.network': 'This model runs at {host}, in your own network.',
        'gen.where.cloud': 'This model runs on the internet ({host}). Everything listed above will be sent to it.',
        'gen.where.unknown': 'Plus cannot tell where this model runs. Treat it as a service on the internet: everything listed above may leave this computer.',
        'gen.agree': 'Yes, send this to {name}',
        'gen.run': 'Generate',
        'gen.running': 'The model is writing… this can take a minute.',
        'gen.close': 'Close',
        'gen.result': 'What {model} wrote. Lines marked + are new, lines marked − would go. Nothing is saved yet.',
        'gen.result.first': 'What {model} wrote. Nothing is saved yet.',
        'gen.same': 'The model wrote the same instructions you already have.',
        'gen.ideas': 'Ideas for this project',
        'gen.use': 'Use these instructions',
        'gen.used': 'The new instructions are in the box. Change them if you like, then press Save.',
        'gen.discard': 'Discard',
        'gen.drift': 'The folder has changed since these instructions were generated ({added} files new, {removed} gone). You may want to generate them again.',
        'ver.open': 'Earlier versions ({n})',
        'ver.title': 'Earlier versions',
        'ver.by.you': 'You',
        'ver.by.type': 'Type',
        'ver.by.model': 'Model',
        'ver.current': 'in use',
        'ver.back': 'Put back',
        'ver.backed': 'That version is in the box. Press Save to use it.',
        'proj.title': 'Project',
        'show.more': 'Show {n} more',
        'lib.title.chat': 'Recent threads',
        'lib.title.cowork': 'Projects',
        'lib.title.code': 'Code projects',
        'lib.title.other': '{tab}',
        'lib.all': 'Show all',
        'lib.all.hint': 'Show every project and thread, with search and the app\'s menus',
        'lib.showingAll': 'All threads',
        'lib.mine': '{tab} only',
        'lib.empty': 'Nothing in {tab} yet. New threads you start here show up in this list.',
        'lib.loose': 'Other threads',
        'lib.scratch': 'Scratch',
        'start.title': 'Start places',
        'start.hint.spaces': 'Where a new thread of each space starts. Scratch: a folder of its own, never one of yours, and no project instructions (in Chat: Cowork off). Folder: the open or last used project, with its instructions (in Chat: Cowork on). The same setting as each space\'s card on Settings → Spaces.',
        'start.hint': 'Where a new thread of each space starts. Scratch: a private folder of its own, never one of yours, and no project instructions. Folder: the open or last used project, with its instructions. In Chat, the Cowork switch on a new thread still lets you start the other way.',
        'start.for': 'Start place of {tab}',
        'start.folder.hint': 'Folder: the open or last used project, with its instructions.',
        'start.recon': 'Recon',
        'start.recon.room': 'always its own room',
        'start.newkey': 'Cmd-N starts in the open space\'s start place (off: the app\'s own choice, the open or last used project)',
        'cleanup': 'Clean up…',
        'cleanup.hint': 'Move Scratch threads you have not used for a while to the trash (all spaces).',
        'cleanup.ask': 'Move Scratch threads (in every space) not used for how many days to the trash? They can be put back for 30 days.',
        'cleanup.bad': 'Give a number of days from 1 to 3650.',
        'cleanup.none': 'No Scratch thread was last used before {date}.',
        'cleanup.confirm': 'Move {n} Scratch threads last used before {date} to the trash, with their files? You can put them back for 30 days.',
        'cleanup.confirm.one': 'Move 1 Scratch thread last used before {date} to the trash, with its files? You can put it back for 30 days.',
        'cleanup.kept': 'Left alone:',
        'cleanup.automation': 'Left alone because an automation still uses it (delete it by hand if you mean to; you will be asked first):',
        'cleanup.why.running': 'still working',
        'cleanup.why.open': 'open now',
        'cleanup.why.pinned': 'pinned',
        'ago.now': 'now',
        'ago.m': '{n}m',
        'ago.h': '{n}h',
        'ago.d': '{n}d',
      },
    };

    /** The tabs in the usual order: the first modes up to the limit, then the modes other add-ons added. */
    const usualTabsOf = (state) => [...state.modes.slice(0, state.maxTabs), ...(state.extra ?? [])];
    /**
     * The tabs as they show: the usual tabs in your own order. Which tab a conversation belongs to
     * (its fallback is the first tab) is decided on the usual order, so arranging changes only the order.
     */
    const tabsOf = (state) => orderTabs(usualTabsOf(state), state.tabOrder);

    /** A saved tab order, checked: tab ids only, each once, at most 50. */
    function readOrder(value) {
      const seen = new Set();
      for (const id of Array.isArray(value) ? value : []) {
        if (typeof id === 'string' && /^[A-Za-z0-9][\w-]{0,127}$/.test(id) && seen.size < 50) seen.add(id);
      }
      return [...seen];
    }

    /**
     * The tabs in your own order: those the saved order names come first, in that order; a tab it does
     * not name (new since) follows, in the usual order. Names of tabs not here (switched off, or only
     * on another Mac) are skipped. Which tabs there are never changes.
     * @param {{id: string}[]} tabs - the tabs in the usual order.
     * @param {unknown} order - the saved order (tab ids).
     * @returns {{id: string}[]} the same tabs, reordered.
     */
    function orderTabs(tabs, order) {
      const list = Array.isArray(tabs) ? tabs : [];
      const ids = readOrder(order);
      if (ids.length === 0) return list;
      const rank = new Map(ids.map((id, i) => [id, i]));
      const named = list.filter((tab) => rank.has(tab.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
      return [...named, ...list.filter((tab) => !rank.has(tab.id))];
    }

    /**
     * The order to save after you rearrange the tabs: the order you see, with every tab not shown now
     * (an add-on switched off, a tab only another Mac has) kept right after the tab it followed before,
     * so it comes back in its place.
     * @param {string[]} visible - the tab ids in the order you see.
     * @param {unknown} previous - the saved order before.
     * @returns {string[]} the order to save.
     */
    function mergeOrder(visible, previous) {
      const out = readOrder(visible);
      const before = readOrder(previous);
      before.forEach((id, i) => {
        if (out.includes(id)) return;
        let j = i - 1;
        while (j >= 0 && !out.includes(before[j])) j -= 1;
        out.splice(j < 0 ? 0 : out.indexOf(before[j]) + 1, 0, id);
      });
      return out.slice(0, 50);
    }

    /** The ids with one moved to a new place (clamped to the list). */
    function moveId(ids, id, to) {
      const rest = ids.filter((other) => other !== id);
      if (rest.length === ids.length) return ids;
      const at = Math.max(0, Math.min(rest.length, to));
      return [...rest.slice(0, at), id, ...rest.slice(at)];
    }

    // ---- Item 4A, stage 3a: the five space buttons ------------------------------------------------------------------
    // With spaces live (the Modes add-on says so), five space buttons replace the mode tabs: Chat, Code, Devices, Recon,
    // Workshop. A thread is listed under its space (Modes' `sessionSpaces`, else its mode's space, else its folder), never
    // under its mode: a mode change does not move it. The tab layout, `tabOrder`, the stored tab and `lastOpen` stay as
    // they are (read through the maps below, never rewritten). Copies of Modes' lib/spaces.js; a test checks they match.

    /** The five spaces, in their first order. */
    const SPACE_IDS = ['chat', 'code', 'devices', 'recon', 'workshop'];
    /** The space of each known mode id (Modes' lib/spaces.js MODE_SPACE); every other mode lives in Chat. */
    const MODE_SPACE = { plain: 'chat', chat: 'chat', cowork: 'chat', research: 'chat', scout: 'chat', finance: 'chat', data: 'chat', content: 'chat', automations: 'chat', code: 'code', bench: 'devices', recon: 'recon', 'creator-plus': 'workshop' };
    /** Built-in modes Modes adds to every list but gives no tab (item 4A, stage 4: Plain chat), for their names. */
    const ADDED_MODES = [{ id: 'plain', label: 'Plain chat' }];
    /** A mode's shown name: its own label, else its id. Plus shows English only (owner decision 28). @returns {string} */
    function modeNameIn(mode) {
      return String(mode?.label ?? mode?.id ?? '');
    }

    /** The tab id that stands for each space where a tab id is stored or read (trash, projects, start places, preset locks, the tab layout). */
    const SPACE_TAB = { chat: 'chat', code: 'code', devices: 'bench', recon: 'recon', workshop: 'creator-plus' };
    const SPACE_KEY = 'dsh-cowork-shell.space';
    const LAST_SPACE_KEY = 'dsh-cowork-shell.lastOpenSpace';
    const SPACES_ON_KEY = 'dsh-cowork-shell.spacesOn';
    /** Fix round: how long the sidebar waits before claiming an open blank draft for the window's space. */
    const CLAIM_WAIT_MS = 350;
    const isSpaceId = (id) => SPACE_IDS.includes(id);
    /** @returns {string} the space a mode (or a stored tab) gives: its own, Chat for every other. */
    function spaceOfModeId(modeId) {
      return Object.prototype.hasOwnProperty.call(MODE_SPACE, String(modeId ?? '')) ? MODE_SPACE[modeId] : 'chat';
    }
    /** @returns {string | undefined} the space of a stored tab id; undefined for none. */
    function spaceOfTabId(tabId) {
      return typeof tabId === 'string' && tabId !== '' ? spaceOfModeId(tabId) : undefined;
    }
    /** The space order read from today's tab order, without changing it: each space where its first tab was. */
    function spaceOrderFrom(tabOrder) {
      const out = [];
      for (const tab of Array.isArray(tabOrder) ? tabOrder : []) {
        const space = spaceOfTabId(tab);
        if (space && !out.includes(space)) out.push(space);
      }
      for (const space of SPACE_IDS) if (!out.includes(space)) out.push(space);
      return out;
    }
    /** Each space's last open thread from the stored `lastOpen` (tab -> thread), the space's own tab first. */
    function lastOpenBySpace(lastOpen, tabOrder = []) {
      const stored = lastOpen && typeof lastOpen === 'object' && !Array.isArray(lastOpen) ? lastOpen : {};
      const order = [...Object.values(SPACE_TAB), ...(Array.isArray(tabOrder) ? tabOrder : []), ...Object.keys(stored)];
      const out = {};
      for (const tab of order) {
        const id = stored[tab];
        const space = spaceOfTabId(tab);
        if (space && typeof id === 'string' && id !== '' && out[space] === undefined) out[space] = id;
      }
      return out;
    }
    /** The space of a trash entry from what it stores (`space`, else its `tab`, else its `fallbackTab`), not rewritten. */
    function spaceOfTrashItem(item) {
      if (isSpaceId(item?.space)) return item.space;
      return spaceOfTabId(item?.tab) ?? spaceOfTabId(item?.fallbackTab);
    }
    /** Item 4A, stage 6a: the spaces whose own rules hold for every mode (a copy of Modes' GUARDED, lib/spaces.js). */
    const GUARDED_SPACE_IDS = ['devices', 'recon', 'workshop'];
    /**
     * Which space a thread is listed in: its recorded space; an empty new thread follows the window's space; then its
     * mode's space; then its folder (none: Chat; the default workspace: Chat; any other: Code).
     * Item 4A, stage 6a: first a guarded space Modes holds but has not written yet (`pendingSpaces`, it wins over a stale
     * record, as in Modes); and a thread Modes marked as Recon's (`sessionIsolated`) with no recorded space is listed in
     * Recon, unless its mode is an owner's own isolated mode (`ownIsolatedModes`: then its mode's space).
     */
    function spaceOfSession(id, session, workspace, state) {
      const pending = state.pendingSpaces?.[id];
      if (GUARDED_SPACE_IDS.includes(pending)) return pending;
      const recorded = state.sessionSpaces?.[id];
      if (isSpaceId(recorded)) return recorded;
      if (session?.blank) return state.space;
      const mode = state.sessionModes?.[id];
      if (state.sessionIsolated?.[id] === true && !(typeof mode === 'string' && Array.isArray(state.ownIsolatedModes) && state.ownIsolatedModes.includes(mode))) return 'recon';
      if (typeof mode === 'string' && mode !== '') return spaceOfModeId(mode);
      return guessTab(workspace) === 'code' ? 'code' : 'chat';
    }
    /**
     * The space the window moves to when a thread opens from outside its list (⌘K): the thread's space, when that space
     * is shown and is not the window's own; else null (the window stays).
     * @returns {string|null}
     */
    function threadSpaceToShow(id, session, workspace, state, shownIds) {
      if (!state?.spacesOn || !id || !session || session.blank) return null;
      const space = spaceOfSession(id, session, workspace, state);
      if (!isSpaceId(space) || space === state.space) return null;
      return Array.isArray(shownIds) && shownIds.includes(space) ? space : null;
    }
    /**
     * Which space's Trash list shows a deleted thread: the space it was deleted from (or, for one deleted earlier, the
     * space of its recorded tab or thread); while that space is not shown, the space its folder gives, else the first
     * one. Every space (null) when it cannot be told, so nothing deleted is out of reach.
     */
    function trashSpace(item, state, spaceIds) {
      const recorded = state?.sessionSpaces?.[item?.id];
      const known = (isSpaceId(item?.space) ? item.space : undefined) ?? spaceOfTabId(item?.tab) ?? (isSpaceId(recorded) ? recorded : undefined) ?? spaceOfTabId(state?.sessionModes?.[item?.id]);
      if (known === undefined) return null;
      if (spaceIds.includes(known)) return known;
      const fallback = spaceOfTabId(item?.fallbackTab);
      if (fallback && spaceIds.includes(fallback)) return fallback;
      return spaceIds[0] ?? null;
    }
    /** The space of a project entry (`projects.json`): its `space` once saved, else its tab's space. */
    function spaceOfProjectEntry(entry) {
      return isSpaceId(entry?.space) ? entry.space : spaceOfTabId(entry?.tab);
    }
    /**
     * The space buttons as they show: the spaces Modes says are shown now (Chat always; Code unless hidden; Devices,
     * Recon and Workshop while their add-on is on), in your own order, else the order your tabs had.
     * @returns {{id: string, label: string}[]}
     */
    function spacesOf(state, t) {
      const rows = Array.isArray(state.spaceRows) && state.spaceRows.length > 0 ? state.spaceRows : [{ id: 'chat', shown: true }];
      const shown = rows.filter((row) => row && row.shown === true && isSpaceId(row.id)).map((row) => row.id);
      if (!shown.includes('chat')) shown.unshift('chat');
      const order = readOrder(state.spaceOrder).length > 0 ? readOrder(state.spaceOrder) : spaceOrderFrom(state.tabOrder);
      const named = (id) => (t ? t('space.' + id) : id);
      return orderTabs(SPACE_IDS.filter((id) => shown.includes(id)).map((id) => ({ id, label: named(id) })), order);
    }
    /** @returns {boolean} whether Workshop shows only through Tuner Plus (no Creator Plus mode: rows, but no New button). */
    function workshopWithoutCreator(state) {
      return ![...(state.modes ?? []), ...(state.extra ?? [])].some((mode) => mode.id === 'creator-plus');
    }
    /**
     * The tab the open view stands for, for everything that still reads a tab (greeting, chips, start places, preset
     * locks, the New button's start): with spaces, the selected space's own tab id (SPACE_TAB); else the selected tab.
     * @returns {{id: string, label: string, space?: string}}
     */
    function selectedTab(state, t) {
      if (state.spacesOn) {
        const spaces = spacesOf(state, t);
        const space = spaces.find((one) => one.id === state.space) ?? spaces[0];
        return { id: SPACE_TAB[space.id], label: space.label, space: space.id };
      }
      const tabs = tabsOf(state);
      return tabs.find((m) => m.id === state.selected) ?? tabs[0];
    }
    /** Each window's own space: this window's choice first (sessionStorage), else the last one chosen, else the old tab's space. */
    function readSpaceLocal() {
      try {
        const own = window.sessionStorage.getItem(SPACE_KEY);
        if (isSpaceId(own)) return own;
      } catch { /* no window storage */ }
      try {
        const last = window.localStorage.getItem(SPACE_KEY);
        if (isSpaceId(last)) return last;
        return spaceOfTabId(window.localStorage.getItem(LOCAL_KEY)) ?? 'chat';
      } catch {
        return 'chat';
      }
    }
    function writeSpaceLocal(id) {
      try { window.sessionStorage.setItem(SPACE_KEY, id); } catch { /* no window storage */ }
      try { window.localStorage.setItem(SPACE_KEY, id); } catch { /* private mode */ }
    }
    /** Each space's last open thread: kept under its own key, over what the old per-tab memory says (read, never rewritten). */
    function readLastSpace(tabOrder) {
      let own = {};
      try {
        const value = JSON.parse(window.localStorage.getItem(LAST_SPACE_KEY) || '{}');
        if (value && typeof value === 'object' && !Array.isArray(value)) own = value;
      } catch { own = {}; }
      const kept = Object.fromEntries(Object.entries(own).filter(([space, id]) => isSpaceId(space) && typeof id === 'string' && id !== ''));
      return { ...lastOpenBySpace(readLast(), tabOrder), ...kept };
    }
    function writeLastSpace(space, id) {
      if (!isSpaceId(space)) return;
      try {
        const value = JSON.parse(window.localStorage.getItem(LAST_SPACE_KEY) || '{}');
        const all = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
        if (all[space] === id) return;
        window.localStorage.setItem(LAST_SPACE_KEY, JSON.stringify({ ...all, [space]: id }));
      } catch { /* private mode: spaces then open their start page */ }
    }
    /** Whether spaces were live at the last look (so the first paint shows the right panel, not the old tabs for a moment). */
    function readSpacesOn() {
      try { return window.localStorage.getItem(SPACES_ON_KEY) === '1'; } catch { return false; }
    }
    /** What the Modes add-on says about spaces (its route): live, and the five with `available` and `shown`. */
    async function readSpaces(locale) {
      const response = await fetch(new URL('dsh-modes/mode', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'x-dsh-locale': String(locale ?? 'en') } });
      if (!response.ok) throw new Error(`error ${response.status}`);
      const data = await response.json();
      if (!data?.ok) throw new Error(String(data?.error ?? 'refused'));
      return { live: data.value?.live === true, spaces: Array.isArray(data.value?.spaces) ? data.value.spaces : [] };
    }
    /**
     * Item 4A, stage 6a: the guarded spaces Modes holds in memory and has not written to `sessionSpaces` yet (this add-on's
     * route asks Modes' `spaces.pending`), so a Devices thread is listed under Devices at once.
     * @returns {Promise<Record<string, string>>}
     */
    async function readPendingSpaces() {
      const response = await fetch(new URL('dsh-cowork-shell/pending-spaces', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`error ${response.status}`);
      const data = await response.json();
      const out = {};
      for (const [id, space] of Object.entries(data?.pendingSpaces && typeof data.pendingSpaces === 'object' ? data.pendingSpaces : {})) {
        if (GUARDED_SPACE_IDS.includes(space)) out[id] = space;
      }
      return out;
    }
    /** Open the Settings window on a page (Creator Plus's, for Workshop without it). */
    function openSettingsPage(appCtx, id) {
      try {
        const store = appCtx.slots.entries('sidebar.settings').find((item) => item.store)?.store?.create?.();
        const actions = store?.actions;
        if (typeof actions?.openSection === 'function') return void actions.openSection(id);
        if (typeof actions?.open === 'function') actions.open();
        if (typeof actions?.select === 'function') actions.select(id);
      } catch {
        /* the Settings window cannot be opened from here: the note's words name the page */
      }
    }
    /** Spaces live at the moment: read where a conversation starts (the page model keeps it). */
    const spaceMode = { on: false };
    /** @returns {string} the tab id for a start, a preset lock or a start place: a space's own tab with spaces, else the id itself. */
    function tabKeyOf(id) {
      return spaceMode.on && isSpaceId(id) ? SPACE_TAB[id] : id;
    }

    const FALLBACK_MODES = [
      { id: 'chat', label: 'Chat' },
      { id: 'cowork', label: 'Cowork' },
      { id: 'code', label: 'Code' },
    ];
    const DEFAULT_TABS = {
      "chat": {
        "newLabel": "New chat",
        "pages": [
          "model-arena"
        ],
        "greeting": "Let's knock something off your list",
        "chips": []
      },
      "plain": {
        "newLabel": "New chat",
        "pages": [],
        "greeting": "Let's knock something off your list",
        "chips": [
          {
            "label": "Create slides",
            "icon": "slides",
            "prompt": "Create a slide deck about: "
          },
          {
            "label": "Build website",
            "icon": "website",
            "prompt": "Build a website for: "
          },
          {
            "label": "Spreadsheet",
            "icon": "spreadsheet",
            "prompt": "Make a spreadsheet that: "
          },
          {
            "label": "Visualization",
            "icon": "chart",
            "prompt": "Make a chart or visual that shows: "
          },
          {
            "label": "Write",
            "icon": "spark",
            "prompt": "Help me write: "
          },
          {
            "label": "Explain",
            "icon": "research",
            "prompt": "Explain simply: "
          }
        ]
      },
      "cowork": {
        "newLabel": "New task",
        "pages": [
          "connectors",
          "skills"
        ],
        "greeting": "Let's knock something off your list",
        "chips": [
          {
            "label": "Create slides",
            "icon": "slides",
            "prompt": "Create a slide deck about: "
          },
          {
            "label": "Build website",
            "icon": "website",
            "prompt": "Build a website for: "
          },
          {
            "label": "Develop apps",
            "icon": "app",
            "prompt": "Help me develop an app that: "
          },
          {
            "label": "Spreadsheet",
            "icon": "spreadsheet",
            "prompt": "Make a spreadsheet that: "
          },
          {
            "label": "Visualization",
            "icon": "chart",
            "prompt": "Make a chart or visual that shows: "
          },
          {
            "label": "Wide research",
            "icon": "research",
            "prompt": "Research a list of items and put the findings in a table: "
          },
          {
            "label": "Create games",
            "icon": "game",
            "prompt": "Create a small game: "
          }
        ]
      },
      "code": {
        "newLabel": "New code task",
        "pages": [
          "connectors",
          "skills"
        ],
        "greeting": "What should we build?",
        "chips": [
          {
            "label": "Create slides",
            "icon": "slides",
            "prompt": "Create a slide deck about: "
          },
          {
            "label": "Build website",
            "icon": "website",
            "prompt": "Build a website for: "
          },
          {
            "label": "Develop apps",
            "icon": "app",
            "prompt": "Help me develop an app that: "
          },
          {
            "label": "Spreadsheet",
            "icon": "spreadsheet",
            "prompt": "Make a spreadsheet that: "
          },
          {
            "label": "Visualization",
            "icon": "chart",
            "prompt": "Make a chart or visual that shows: "
          },
          {
            "label": "Wide research",
            "icon": "research",
            "prompt": "Research a list of items and put the findings in a table: "
          },
          {
            "label": "Create games",
            "icon": "game",
            "prompt": "Create a small game: "
          }
        ]
      },
      "data": {
        "newLabel": "New analysis",
        "pages": [],
        "greeting": "What do you want to find out from your data?",
        "chips": [
          {
            "label": "What is here",
            "icon": "folder",
            "prompt": "List the data files in this folder and profile the tables: what each holds, how many rows, and anything that looks wrong."
          },
          {
            "label": "Summarise",
            "icon": "spreadsheet",
            "prompt": "Summarise the main table in this folder: the key figures, how they are spread, and what stands out."
          },
          {
            "label": "Trends",
            "icon": "chart",
            "prompt": "Show how the main figures in this data change over time, with a chart."
          },
          {
            "label": "Compare groups",
            "icon": "chart",
            "prompt": "Compare the main groups in this data with each other and say which differences matter."
          },
          {
            "label": "Check quality",
            "icon": "spark",
            "prompt": "Check this data for problems: empty cells, duplicates, outliers, odd formats and values that cannot be right."
          },
          {
            "label": "Run saved",
            "icon": "research",
            "prompt": "Run my saved analyses for this folder again and tell me what moved."
          }
        ]
      },
      "finance": {
        "newLabel": "New research",
        "pages": [],
        "greeting": "What do you want to look into?",
        "chips": [
          {
            "label": "Deep dive",
            "icon": "research",
            "prompt": "Do a full deep dive on the selected subject."
          },
          {
            "label": "Earnings review",
            "icon": "spreadsheet",
            "prompt": "Review the latest earnings of the selected company."
          },
          {
            "label": "News and mood",
            "icon": "spark",
            "prompt": "What are the news and social media saying about the selected subject right now?"
          },
          {
            "label": "Compare",
            "icon": "chart",
            "prompt": "Compare the selected company with its closest competitors."
          },
          {
            "label": "Sector scan",
            "icon": "research",
            "prompt": "Scan the sector of the selected subject: who is gaining, who is losing, and why?"
          },
          {
            "label": "Economy brief",
            "icon": "chart",
            "prompt": "Give me an economy brief for the selected market."
          },
          {
            "label": "What changed",
            "icon": "spark",
            "prompt": "What has changed for the selected subject in the last month?"
          }
        ]
      },
      "research": {
        "newLabel": "New research",
        "pages": [],
        "greeting": "What do you want to find out?",
        "chips": [
          {
            "label": "Explain a topic",
            "icon": "research",
            "prompt": "Research and explain, with sources: "
          },
          {
            "label": "Compare options",
            "icon": "chart",
            "prompt": "Research and compare these options, with the evidence for each: "
          },
          {
            "label": "Latest developments",
            "icon": "spark",
            "prompt": "What are the latest developments on: "
          },
          {
            "label": "Check a claim",
            "icon": "research",
            "prompt": "Check this claim against the evidence and tell me how well it holds up: "
          }
        ]
      },
      "scout": {
        "newLabel": "New search",
        "pages": [],
        "greeting": "What work are you looking for?",
        "chips": [
          {
            "label": "Find opportunities",
            "icon": "research",
            "prompt": "Find the best opportunities for the work I selected, across my markets."
          },
          {
            "label": "Market brief",
            "icon": "chart",
            "prompt": "Give me a market brief for the work I selected: the titles used, pay and demand in each of my markets. Do not search for postings yet."
          },
          {
            "label": "Hidden market",
            "icon": "spark",
            "prompt": "Look beyond the job boards for the work I selected: company boards, community hiring threads, and companies showing hiring signals."
          },
          {
            "label": "Make my profile",
            "icon": "spreadsheet",
            "prompt": "Read my files in the Scout folder and write my anonymous profile. Show it to me before you save it."
          }
        ]
      },
      "content": {
        "pages": [],
        "chips": [
          {
            "label": "Write a blog post",
            "icon": "research",
            "prompt": "Write a blog post about: "
          },
          {
            "label": "Draft an email",
            "icon": "spark",
            "prompt": "Draft an email to: "
          },
          {
            "label": "Make an outline",
            "icon": "chart",
            "prompt": "Make an outline for a talk or video about: "
          },
          {
            "label": "Tidy my notes",
            "icon": "spreadsheet",
            "prompt": "Turn my notes in this folder into a clear summary."
          }
        ]
      },
      "bench": {
        "pages": [],
        "chips": [
          {
            "label": "What is connected?",
            "icon": "spark",
            "prompt": "What devices are connected to this Mac right now?"
          },
          {
            "label": "Check an Android phone",
            "icon": "research",
            "prompt": "Read the details of my Android phone and tell me what you see."
          },
          {
            "label": "Look at a board",
            "icon": "chart",
            "prompt": "Identify the board on my USB port and tell me what it is."
          }
        ]
      },
      "creator-plus": {
        "pages": [],
        "chips": [
          {
            "label": "Build an add-on",
            "icon": "spark",
            "prompt": "Build a new add-on that: "
          },
          {
            "label": "Improve an add-on",
            "icon": "research",
            "prompt": "Improve this add-on and show me the change first: "
          },
          {
            "label": "What went wrong?",
            "icon": "chart",
            "prompt": "Look at my recent threads and tell me what went wrong most often."
          }
        ]
      },
      "recon": {
        "pages": [],
        "greeting": "What should Recon look into?",
        "chips": [
          {
            "label": "Search .onion sites",
            "icon": "research",
            "prompt": "Search .onion sites for this and read the most relevant pages, with sources: "
          },
          {
            "label": "Search Usenet",
            "icon": "spreadsheet",
            "prompt": "Find text newsgroups about this, search their recent articles and read the most relevant ones: "
          },
          {
            "label": "News coverage",
            "icon": "chart",
            "prompt": "Find where this was reported in the news and read archived copies of the main articles: "
          },
          {
            "label": "Old web page",
            "icon": "website",
            "prompt": "List the Internet Archive's copies of this page and read the latest one: "
          },
          {
            "label": "Check a claim",
            "icon": "spark",
            "prompt": "Look for sources that confirm or contradict this claim, and say how far it can be trusted: "
          }
        ]
      }
    };
    /** Item 4A, stage 3b: the rows of each space (the same as index.js DEFAULT_SPACES; a test checks they match). */
    const DEFAULT_SPACES = {
      "fixed": ["projects", "artifacts", "automations", "plugins"],
      "chat": { "pages": ["model-arena", "connectors", "skills"], "settings": [] },
      "code": { "pages": ["connectors", "skills"], "settings": [] },
      "devices": { "pages": [], "settings": [] },
      "recon": { "pages": [], "settings": [] },
      "workshop": { "pages": ["model-arena", "benchlab"], "settings": ["tuning", "benchmark"] }
    };

    /**
     * The rows layout of the spaces: the saved `spaceLayout` (JSON) over DEFAULT_SPACES, field by field. A bad value
     * keeps the built-in one.
     * @param {unknown} saved - the setting (text or object).
     * @returns {{fixed: string[], [space: string]: unknown}} the layout.
     */
    function spaceLayoutOf(saved) {
      const mine = readObject(saved);
      const ids = (value, fallback) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string' && id.trim()).map((id) => id.trim()) : fallback);
      const layout = { fixed: ids(mine.fixed, DEFAULT_SPACES.fixed) };
      for (const space of SPACE_IDS) {
        const own = readObject(mine[space]);
        layout[space] = { pages: ids(own.pages, DEFAULT_SPACES[space].pages), settings: ids(own.settings, DEFAULT_SPACES[space].settings) };
      }
      return layout;
    }

    /**
     * Item 4A, stage 3b: the rows a space shows, in order. First the fixed rows (Projects, Artifacts, Automations,
     * Plugins), then the space's own page rows, then its Settings rows (Workshop: Tuner Plus, Benchmark), then the pages
     * no space lists (Split, Compare, a plugin's own row), as pages no tab listed showed under every tab. A row whose
     * page or Settings page is not there (its add-on off or not installed) is left out; the app's task editor
     * (`schedules`) has no row of its own (it is one click away on the Automations page).
     * @param {string} space - the space id.
     * @param {Array<{id: string, label: string}>} pages - the page rows registered now.
     * @param {object} layout - spaceLayoutOf's answer.
     * @param {Array<{id: string, label: string}>} sections - the Settings pages registered now.
     * @param {string[]} [off] - the space's add-ons that are switched off now (Workshop: Tuner Plus while off); their
     *   Settings rows are left out, as the owner chose.
     * @returns {{fixed: Array<object>, own: Array<object>, settings: Array<object>, shared: Array<object>}}
     */
    function spaceRows(space, pages, layout, sections, off = []) {
      const list = Array.isArray(pages) ? pages : [];
      const byId = (id) => list.find((page) => page.id === id);
      const fixedIds = Array.isArray(layout?.fixed) ? layout.fixed : [];
      // `projects` is not a page row of its own (the project page has none): the sidebar draws it.
      const fixed = fixedIds.map((id) => (id === 'projects' ? { id: 'projects', label: '', projects: true } : byId(id))).filter(Boolean);
      const claimed = new Set([...fixedIds, 'schedules']);
      for (const one of SPACE_IDS) for (const id of layout?.[one]?.pages ?? []) claimed.add(id);
      const own = (layout?.[space]?.pages ?? []).filter((id) => !fixedIds.includes(id)).map(byId).filter(Boolean);
      const known = Array.isArray(sections) ? sections : [];
      const settings = (layout?.[space]?.settings ?? []).filter((id) => !(Array.isArray(off) && off.includes(id))).map((id) => known.find((section) => section.id === id)).filter(Boolean).map((section) => ({ id: section.id, label: section.label, settings: true }));
      const shared = list.filter((page) => !claimed.has(page.id));
      return { fixed, own, settings, shared };
    }

    /**
     * Item 4A, stage 3b: the Chat space's list. "Chats" (standalone threads: Scratch and those outside any project)
     * first, sorted once (pinned first, then newest); then "Projects" as folders, the default workspace among them
     * (always listed, as Chat's own project, even before its first thread).
     * @param {(ids: string[]) => string[]} sortRows - the list's sort and filter.
     * @param {Array<{ws: object, ids: string[], latest: number}>} projects - the projects with this space's threads.
     * @param {string[]} scratchRows - the Scratch threads.
     * @param {string[]} loose - the threads outside any project.
     * @param {object | null} home - the default workspace, when there is one.
     * @returns {{chats: string[], projects: Array<{ws: object, ids: string[], latest: number}>}}
     */
    function chatGroups(sortRows, projects, scratchRows, loose, home) {
      const chats = sortRows([...scratchRows, ...loose]);
      const folders = [...projects];
      if (home && !folders.some((p) => p.ws.workspaceId === home.workspaceId)) folders.push({ ws: home, ids: [], all: [], latest: Date.parse(home.updatedAt ?? '') || 0 });
      return { chats, projects: folders.sort((a, b) => b.latest - a.latest) };
    }

    /** Modes that get no grey tag in a space besides its start mode (the old Chat and Cowork tabs' own modes in Chat). */
    const QUIET_TAGS = { chat: ['chat', 'cowork'] };
    /**
     * Item 4A, stage 3b: the small grey tag on a thread's row: its mode's name when it is not the space's start mode
     * (so a Research thread in Chat says so). None for a new thread or a mode that cannot be named.
     * @returns {string} the tag, or ''.
     */
    function modeTagOf(id, state, space) {
      const mode = state?.sessionModes?.[id];
      if (typeof mode !== 'string' || !mode) return '';
      // Fix round: in Chat, the modes the Chat and Cowork tabs used (Chat, Cowork) get no tag either, so the threads
      // made before spaces do not all carry one; the Mode button still names their mode.
      if ((QUIET_TAGS[space] ?? []).includes(mode)) return '';
      const start = (state.spaceRows ?? []).find((row) => row?.id === space)?.startMode;
      if (mode === (typeof start === 'string' && start ? start : SPACE_TAB[space])) return '';
      const named = [...(state.modes ?? []), ...(state.extra ?? []), ...ADDED_MODES].find((m) => m.id === mode);
      return named ? modeNameIn(named) : '';
    }

    const CSS = `
.cws-root{--cws-pad:8px;display:flex;flex-direction:column;height:100%;padding:6px var(--cws-pad);box-sizing:border-box;background:var(--dsw-specific-sidebar-fill);color:var(--dsw-alias-label-primary);font-size:14px;overflow:hidden;--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
html[data-platform='darwin'] .cws-root{background:transparent}
.cws-strip{flex:none;display:flex;align-items:center;justify-content:flex-end;height:52px;box-sizing:border-box;margin:-6px calc(-1 * var(--cws-pad)) 0;padding:0 12px 2px}
html[data-fullscreen] .cws-strip{justify-content:flex-start}
.cws-icon{flex:none;display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit}
.cws-brand{display:flex;align-items:center;gap:8px;min-height:28px;padding:0 6px 10px;font-weight:600;font-size:13px;letter-spacing:.02em;color:var(--dsw-alias-label-secondary)}
.cws-strip + .cws-brand{margin-top:-8px}
.cws-tabs{display:flex;gap:2px;padding:3px;margin:0 0 10px;border:1px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md)}
.cws-tab{flex:1 1 0;min-width:0;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 6px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:13px;white-space:nowrap}
.cws-tab > span{overflow:hidden;text-overflow:ellipsis}
/* Wide chat: the app keeps messages and the message box in a centred column; this lets both use the window's width. The start page keeps its own size. */
html[data-cws-wide] [class*='_scrollBody'] [class*='_column']{max-width:calc(100% - 64px) !important}
html[data-cws-wide] [class*='_composerStack']:not([class*='_composerHero'] *) [class*='_card']{max-width:calc(100% - 32px) !important}
/* More than three tabs: rows of three, so every name has room. */
.cws-tabs[data-many='true']{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}
.cws-tabs[data-many='true'] .cws-tab{gap:5px;padding:0 4px}
/* Names always shown (default): each tab is as wide as its icon and name and the rows wrap, so no name is ever cut or hidden. */
.cws-tabs[data-wrap='true']{flex-wrap:wrap}
.cws-tabs[data-wrap='true'] .cws-tab{flex:1 1 auto;min-width:max-content;max-width:100%;gap:5px;padding:0 8px}
.cws-tabs[data-editing='true']{border-style:dashed}
.cws-tabs[data-editing='true'] .cws-tab{cursor:grab;user-select:none;-webkit-user-select:none;touch-action:none;outline:1px dashed var(--dsw-alias-border-l3);outline-offset:-3px}
.cws-tabs[data-editing='true'] .cws-tab[data-dragging='true']{cursor:grabbing;opacity:.55}
.cws-arrange{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:-6px 0 10px;padding:0 4px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.cws-arrange-hint{flex:1 1 100%}
.cws-arrange .cws-link{font-size:11px;padding:1px 4px}
.cws-icon[data-on='true']{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.cws-tab[aria-selected='true']{background:var(--dsw-alias-button-elevated-fill);color:var(--dsw-alias-label-primary);font-weight:500}
.cws-new{display:flex;align-items:center;gap:8px;width:100%;min-height:36px;margin:0 0 8px;padding:0 8px 0 12px;box-sizing:border-box;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 45%,transparent);border-radius:var(--dsw-radius-md);background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 10%,transparent);color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;font-weight:500;text-align:left}
.cws-new .cws-glyph{color:inherit}
.cws-new-off{display:flex;flex-direction:column;align-items:flex-start;gap:2px;margin:0 0 8px;padding:8px 12px;border:0.5px dashed var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.cws-new-off .cws-link{padding:0;margin-left:-1px}
.cws-info{display:inline-flex;align-items:center}
.cws-lib-title{display:inline-flex;align-items:center;gap:4px;min-width:0}
.cws-kbd{flex:none;display:inline-flex;align-items:center;gap:1px;padding:1px 5px;border:1px solid color-mix(in srgb,var(--dsw-alias-state-business-primary) 40%,transparent);border-radius:5px;font-size:11px;line-height:16px;opacity:.9}
.cws-pages{display:flex;flex-direction:column;gap:2px;margin:0 0 6px}
.cws-row{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:5px 9px;box-sizing:border-box;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left}
.cws-row[aria-current='page']{background:var(--dsw-alias-interactive-bg-hover);font-weight:500}
.cws-glyph{flex:none;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;color:var(--dsw-alias-label-secondary)}
.cws-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;margin:0 calc(-1 * var(--cws-pad));padding:0 var(--cws-pad)}
.cws-foot{flex:none;display:flex;flex-direction:column;gap:2px;padding-top:6px}
.cws-rail{align-items:center;padding:6px 10px}
.cws-rail .cws-strip{justify-content:center;margin:-6px -10px 0;padding:0}
.cws-rail .cws-icon{width:36px;height:36px;margin-bottom:12px}
.cws-rail .cws-tabs{flex-direction:column;border:0;padding:0;margin:0 0 12px;gap:6px}
.cws-rail .cws-tab{flex:none;width:36px;height:36px;padding:0}
.cws-rail .cws-row{width:36px;justify-content:center;padding:0;min-height:36px}
.cws-rail .cws-scroll{margin:0;padding:0;width:100%;display:flex;flex-direction:column;align-items:center}
.cws-rail .cws-foot{align-items:center}
.cws-more{position:relative}
.cws-pop{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;padding:4px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay,var(--dsw-specific-sidebar-fill));box-shadow:0 14px 36px color-mix(in srgb,#000 28%,transparent)}
.cws-lead{display:flex;align-items:center;gap:8px}
.cws-page{height:100%;overflow-y:auto;box-sizing:border-box;padding:28px clamp(16px,4vw,48px) 48px;color:var(--dsw-alias-label-primary);font-size:14px}
.cws-page-in{max-width:880px;margin:0 auto;display:flex;flex-direction:column;gap:16px}
.cws-page h1{margin:0;font-size:16px;line-height:24px;font-weight:500}
.cws-page .cws-hint{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;max-width:72ch}
.cws-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.cws-card{border:0.5px solid var(--dsw-alias-border-l2);border-radius:20px;padding:4px 16px;background:var(--dsw-alias-settings-card-fill,var(--dsw-alias-bg-layer-1))}
.cws-item{display:flex;align-items:center;gap:12px;padding:14px 0;border-top:0.5px solid var(--dsw-alias-border-l1)}
.cws-item:first-child{border-top:0}
.cws-item-main{flex:1;min-width:0}
.cws-item-name{font-size:14px;line-height:22px;font-weight:400;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-item-sub{margin-top:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.cws-chip{display:inline-flex;align-items:center;height:24px;box-sizing:border-box;padding:0 9px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.cws-chip[data-tone=good]{color:var(--dsw-alias-state-success-primary,inherit);border-color:currentColor}
.cws-chip[data-tone=bad]{color:var(--dsw-alias-state-error-primary,inherit);border-color:currentColor}
.cws-btn{box-sizing:border-box;height:28px;padding:0 10px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12px;line-height:18px;white-space:nowrap}
@media (hover:hover){.cws-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,var(--dsw-alias-bg-layer-2))}}
.cws-btn:disabled{opacity:.5;cursor:default}
.cws-switch{position:relative;box-sizing:border-box;width:36px;height:20px;flex:none;border:0;border-radius:999px;background:var(--dsw-alias-border-l3);cursor:pointer;padding:0}
.cws-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:var(--dsw-alias-switch-thumb,var(--dsw-alias-label-secondary));transition:left .15s}
.cws-switch[aria-checked=true]{background:var(--dsw-alias-brand-primary)}
.cws-switch[aria-checked=true]::after{left:18px;background:var(--dsw-alias-bg-base)}
.cws-switch:disabled{opacity:.5;cursor:default}
.cws-form{display:grid;grid-template-columns:minmax(120px,180px) 1fr;gap:10px 12px;align-items:center;padding:12px 0}
.cws-form label{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cws-form input,.cws-form textarea,.cws-form select,.cws-search{width:100%;box-sizing:border-box;height:36px;padding:0 14px;border:0;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:14px}
.cws-form input:focus-visible,.cws-form textarea:focus-visible,.cws-form select:focus-visible,.cws-search:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:0}
.cws-form textarea{height:auto;min-height:72px;padding:8px 14px;resize:vertical;font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:18px}
.cws-yaml{margin:0;padding:10px 14px;border:0;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);font-family:var(--ds-font-family-code,monospace);font-size:12px;line-height:18px;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text}
.cws-clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.cws-area{width:100%;box-sizing:border-box;min-height:140px;padding:10px 14px;border:0;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;resize:vertical}
.cws-area:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:0}
.cws-sec{display:flex;flex-direction:column;gap:8px;padding:12px 0}
.cws-sec-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.cws-sec-head h2{margin:0;font-size:14px;line-height:20px;font-weight:500}
.cws-inline{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.cws-inline input,.cws-inline select{height:32px;padding:0 12px;border:0;border-radius:10px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;min-width:0}
.cws-inline input{flex:1 1 220px}
.cws-filelist{display:flex;flex-direction:column;max-height:320px;overflow-y:auto}
.cws-file{display:flex;gap:12px;align-items:baseline;padding:5px 0;border-top:0.5px solid var(--dsw-alias-border-l1);font-size:13px}
.cws-file:first-child{border-top:0}
.cws-file > :first-child{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-file > span + span{flex:none;color:var(--dsw-alias-label-secondary);font-size:12px}
.cws-file button{flex:1;min-width:0;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-drop[data-over='true']{outline:1px dashed var(--dsw-alias-brand-primary);outline-offset:2px}
.cws-lib-links{display:inline-flex;gap:2px;align-items:center;flex:none;white-space:nowrap}
.cws-note{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cws-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px}
.cws-type{display:flex;flex-direction:column;gap:2px;align-items:flex-start;text-align:left;padding:10px 12px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;min-width:0}
.cws-type:hover{background:var(--dsw-alias-interactive-bg-hover)}
.cws-type:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.cws-type[aria-pressed=true]{border-color:var(--dsw-alias-brand-primary);background:color-mix(in srgb,var(--dsw-alias-brand-primary) 9%,transparent)}
.cws-type b{font-size:13px;line-height:20px;font-weight:500}
.cws-type b i{font-style:normal;font-weight:400;font-size:11px;color:var(--dsw-alias-label-secondary);margin-left:6px}
.cws-type span{font-size:12px;line-height:17px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.cws-preview{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)}
.cws-warn{padding:8px 10px;border-radius:10px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-primary);background:color-mix(in srgb,var(--dsw-alias-state-warning-primary,#d98a00) 16%,transparent)}
.cws-check{display:flex;gap:8px;align-items:center;font-size:12px;line-height:18px;cursor:pointer}
.cws-diff{margin:0;max-height:320px;overflow:auto;font:inherit;font-size:12px;line-height:18px}
.cws-diff div{white-space:pre-wrap;overflow-wrap:anywhere;padding:0 6px;border-radius:4px}
.cws-diff div[data-k="+"]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#2e9e5b) 18%,transparent)}
.cws-diff div[data-k="-"]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#d9534f) 16%,transparent);text-decoration:line-through;color:var(--dsw-alias-label-secondary)}
.cws-diff div[data-k=" "]{color:var(--dsw-alias-label-secondary)}
.cws-ideas{margin:0;padding-left:18px;font-size:12px;line-height:19px;color:var(--dsw-alias-label-primary)}
.cws-ver{display:flex;gap:10px;align-items:center;font-size:12px;line-height:18px;padding:4px 0}
.cws-ver span:first-child{flex:none;color:var(--dsw-alias-label-secondary);width:150px}
.cws-ver span:nth-child(2){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cws-preview pre{margin:0;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.cws-msg{font-size:12px;color:var(--dsw-alias-label-secondary)}
.cws-msg[data-tone=bad]{color:var(--dsw-alias-state-error-primary,inherit)}
@media (max-width:640px){.cws-form{grid-template-columns:1fr}.cws-item{flex-wrap:wrap}}
[class*='_fishHitbox']:has([data-cws-hero]){width:auto;height:auto;display:inline-flex;align-items:center}
[class*='_fishHitbox']:has([data-cws-hero]) + [class*='_titleGroup']{display:none}
.cws-hero{display:inline-flex;align-items:center;gap:14px;white-space:normal;max-width:100%}
.cws-hero-text{font:inherit;color:var(--dsw-alias-label-primary);font-weight:600;min-width:0;overflow-wrap:anywhere;text-align:left}
[class*='_headline']:has([data-cws-hero]){max-width:100%;flex-wrap:wrap;justify-content:center}
[class*='_composerHero']:has(.cws-chips){position:relative}
.cws-chips{position:absolute;top:100%;left:0;right:0;margin-top:22px;display:flex;flex-wrap:wrap;justify-content:center;gap:10px}
.cws-chip-btn{display:inline-flex;align-items:center;gap:8px;box-sizing:border-box;height:36px;padding:0 16px 0 13px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:18px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:14px}
@media (hover:hover){.cws-chip-btn:hover{background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}}
.cws-chip-btn svg{color:var(--dsw-alias-label-secondary)}
.cws-chip-btn:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.cws-place{display:inline-flex;align-items:center;height:28px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:14px;overflow:hidden}
.cws-place button{height:100%;padding:0 10px;border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px}
.cws-place button[aria-pressed='true']{background:var(--dsw-alias-fill-l2,rgba(127,127,127,.16));color:var(--dsw-alias-label-primary)}
.cws-place button:focus-visible{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.cws-start-page{padding:8px 0;max-width:640px}
.cws-start-page h2{font-size:16px;margin:0 0 6px}
.cws-start-list{display:flex;flex-direction:column;gap:6px;margin:10px 0}
.cws-start-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:4px 0;border-bottom:0.5px solid var(--dsw-alias-border-l1,rgba(127,127,127,.2))}
.cws-start-key{display:flex;align-items:center;gap:6px;font-size:13px}
.cws-scratch-mark{display:inline-flex;align-items:center;height:24px;padding:0 8px;border:0.5px dashed var(--dsw-alias-border-l2);border-radius:12px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}
html[data-dsh-uniform="true"] [data-slot="conversation.input.left"] .cws-scratch-mark{display:none}
.cws-place-strip{display:flex;justify-content:flex-start;padding:0 4px 6px}
html:not([data-dsh-uniform="true"]) .cws-place-strip{display:none}
.cws-place-folder{max-width:240px;overflow:hidden;text-overflow:ellipsis;border-style:solid !important}
.cws-lib{display:flex;flex-direction:column;gap:1px;padding-bottom:8px}
.cws-lib-head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 6px 4px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500}
.cws-lib-allbar{padding-top:4px}
.cws-link{border:0;background:transparent;color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;font-size:12px;padding:2px 4px;border-radius:4px}
.cws-lib-empty{margin:6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.5}
.cws-proj-row,.cws-conv{display:flex;align-items:center;border-radius:var(--dsw-radius-sm);position:relative}
.cws-proj-main,.cws-conv-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px;min-height:30px;padding:4px 6px 4px 9px;border:0;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;text-align:left;border-radius:var(--dsw-radius-sm)}
.cws-conv-main{padding-left:12px;color:var(--dsw-alias-label-primary)}
.cws-conv[data-picked="true"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)}
.cws-find{display:flex;align-items:center;gap:6px;padding:6px 6px 2px}
.cws-find input{flex:1;min-width:0;height:28px;padding:0 9px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:8px;font:inherit;font-size:12px;color:var(--dsw-alias-label-primary);background:transparent}
.cws-find input:focus{outline:1px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.cws-find-note{padding:2px 8px 4px;font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}
.cws-pickbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 8px;font-size:11px;color:var(--dsw-alias-label-secondary)}
.cws-ctx{position:fixed;z-index:300;min-width:200px;max-width:280px;max-height:calc(100vh - 16px);overflow-y:auto;padding:5px;border-radius:10px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));box-shadow:0 10px 34px rgba(0,0,0,.3)}
.cws-ctx button{display:block;width:100%;padding:6px 10px;border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;text-align:left;cursor:pointer}
.cws-ctx button:hover{background:var(--dsw-alias-interactive-bg-hover)}
.cws-ctx button[data-danger="true"]{color:var(--dsw-alias-state-error-primary)}
.cws-ctx button[disabled]{opacity:.45;cursor:default}.cws-ctx button[disabled]:hover{background:transparent}
.cws-ctx input{width:100%;box-sizing:border-box;height:28px;margin:2px 0 4px;padding:0 8px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:7px;font:inherit;font-size:13px;color:var(--dsw-alias-label-primary);background:transparent}
.cws-ctx hr{margin:4px 2px;border:0;border-top:0.5px solid var(--dsw-alias-border-l1)}
.cws-proj-list .cws-conv-main{padding-left:34px}
.cws-conv[aria-current='page']{background:var(--dsw-alias-interactive-bg-hover)}
.cws-conv[aria-current='page'] .cws-conv-main{font-weight:500}
.cws-count,.cws-time{flex:none;color:var(--dsw-alias-label-secondary);font-size:11px}
.cws-mode-tag{flex:none;max-width:40%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 6px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-secondary);font-size:11px;line-height:18px}
.cws-rowsep{height:1px;margin:4px 9px;background:var(--dsw-alias-border-l1)}
.cws-rail .cws-rowsep{width:20px;margin:4px auto}
.cws-dot{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-business-primary)}
.cws-pin{flex:none;color:var(--dsw-alias-label-secondary)}
.cws-mini{flex:none;width:24px;height:24px;border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:14px;line-height:1;opacity:0}
.cws-proj-row:hover .cws-mini,.cws-conv:hover .cws-mini,.cws-mini:focus-visible,.cws-mini[aria-expanded='true']{opacity:1}
@media (hover:none){.cws-mini{opacity:1}}
.cws-move{position:relative;display:inline-flex}
.cws-movepop{position:absolute;right:0;top:calc(100% + 2px);z-index:300;box-sizing:border-box;min-width:150px;padding:4px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-overlay);box-shadow:0 14px 36px color-mix(in srgb,#000 28%,transparent)}
.cws-moveitem{display:block;box-sizing:border-box;width:100%;padding:6px 10px;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:13px;text-align:left;white-space:nowrap}
.cws-movehead{display:flex;align-items:center;gap:6px;padding:4px 6px 6px;color:var(--dsw-alias-label-secondary);font-size:12px;font-weight:500;white-space:nowrap}
.cws-movehead .cws-link{padding:2px 6px}
.cws-moveas{display:flex;align-items:center;gap:4px;padding:0 6px 6px;color:var(--dsw-alias-label-secondary);font-size:12px;white-space:nowrap}
.cws-moveas button{box-sizing:border-box;height:24px;border:0.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:0 10px}
.cws-moveas button[aria-pressed='true']{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 12%,transparent);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-brand-primary)}
.cws-movelist{max-height:220px;overflow-y:auto;max-width:230px}
.cws-movelist .cws-moveitem{overflow:hidden;text-overflow:ellipsis}
.cws-archived .cws-label{color:var(--dsw-alias-label-secondary)}
.cws-trashed{cursor:default}
.cws-trash-row{flex-direction:column;align-items:stretch;padding-bottom:4px}
.cws-trash-row .cws-conv-main{min-height:24px;padding-bottom:0}
.cws-trash-meta{display:flex;align-items:center;flex-wrap:wrap;gap:2px;padding:0 6px 0 12px}
.cws-trash-meta .cws-link{font-size:11px;padding:1px 3px}
.cws-trash-dot{color:var(--dsw-alias-label-secondary);font-size:11px}
.cws-trash-note{font-size:11px;color:var(--dsw-alias-label-secondary)}
.cws-trash-empty{display:flex;justify-content:flex-end;padding:2px 8px 6px}
.cws-trash-empty .cws-link[disabled],.cws-trash-meta .cws-link[disabled]{opacity:.6;cursor:default}
.cws-dot-wait{background:var(--dsw-alias-state-warn-primary,#d9822b) !important;animation:none !important}
.cws-needs{margin-bottom:6px;border-radius:var(--dsw-radius-sm);background:color-mix(in srgb,var(--dsw-alias-state-warn-primary,#d9822b) 9%,transparent)}
.cws-needs-head{color:var(--dsw-alias-label-primary);padding-top:8px}
.cws-needs-row{align-items:flex-start}
.cws-needs-row .cws-dot{margin-top:6px}
.cws-needs-text{display:flex;flex-direction:column;min-width:0;flex:1;text-align:left}
.cws-needs-why{color:var(--dsw-alias-label-secondary);font-size:11px}
.cws-archived-head{display:block;width:100%;margin-top:8px}
.cws-movesep{height:0.5px;margin:4px 6px;background:var(--dsw-alias-border-l2)}
html[data-cws-plain-chat] [class*='_heroWorkspaceRow'] > button[aria-haspopup='menu'],html[data-cws-plain-chat] [data-slot='conversation.hero.workspace']{display:none !important}
.cws-more-btn{border:0;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;padding:4px 12px;text-align:left}
@media (hover:hover){.cws-proj-main:hover,.cws-conv-main:hover,.cws-mini:hover,.cws-moveitem:hover,.cws-link:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.cws-error{margin:0 4px 8px;color:var(--dsw-alias-state-error-primary, inherit);font-size:12px}
.cws-notice{margin:0 4px 8px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.cws-send-wait{padding:0 4px 6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
@media (hover:hover){.cws-icon:hover,.cws-tab:hover:not([aria-selected='true']),.cws-row:hover{background:var(--dsw-alias-interactive-bg-hover)}.cws-new:hover{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 18%,transparent)}}
.cws-root :is(button):focus-visible,.cws-lead button:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,currentColor);outline-offset:-2px}
`;

    /** Plain line icons used when the app's icon set is not reachable. */
    const PATHS = {
      chat: 'M4 5h16v10H9l-5 4z',
      cowork: 'M4 7h16v12H4zM9 7V5h6v2',
      code: 'M9 8l-4 4 4 4M15 8l4 4-4 4',
      finance: 'M4 18l5-6 4 3 7-9M15 6h5v5',
      recon: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM16 16l4.5 4.5',
      scout: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM15.5 8.5l-2 5-5 2 2-5z',
      research: 'M10 4a6 6 0 1 0 0 12a6 6 0 0 0 0-12zM14.5 14.5L20 20M7 10h6M10 7v6',
      automations: 'M12 4a8 8 0 1 0 0 16a8 8 0 0 0 0-16zM12 8v4l3 2',
      content: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4M12 20h8',
      bench: 'M8 8h8v8H8zM10 8V4M14 8V4M10 20v-4M14 20v-4M8 10H4M8 14H4M20 10h-4M20 14h-4',
      'creator-plus': 'M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17v3h3l5.3-5.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4zM18 3v4M16 5h4',
      data: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
      plus: 'M12 5v14M5 12h14',
      search: 'M11 4a7 7 0 1 0 0 14a7 7 0 0 0 0-14zM16 16l4.5 4.5',
      panel: 'M4 5h16v14H4zM9 5v14',
      grid: 'M5 5h5v5H5zM14 5h5v5h-5zM5 14h5v5H5zM14 14h5v5h-5z',
      dot: 'M12 11.5a.5.5 0 1 0 0 1 .5.5 0 1 0 0-1',
      edit: 'M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4',
      link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
      sparkle: 'M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z',
      folder: 'M3 7h6l2 2h10v10H3z',
      folderOpen: 'M3 7h6l2 2h10v3M3 7v12h15l3-7H6l-3 7',
      tune: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
      gauge: 'M4 18a8 8 0 1 1 16 0M12 18l4-5',
    };
    /** Item 4A, stage 3b: the icon of a row that opens a Settings page. */
    const SETTINGS_ROW_GLYPH = { tuning: 'tune', benchmark: 'gauge' };
    function Glyph({ name, size = 16 }) {
      const map = {
        chat: 'IconNewChatOutlineRegular',
        code: 'IconCodeOutlineRegular',
        cowork: 'IconWorkspaceTreeOutlineRegular',
        plus: 'IconNewChatOutlineRegular',
        panel: 'IconPanelLeftOutlineRegular',
        grid: 'IconAppsAddOutlineRegular',
        link: 'IconLinkOutlineRegular',
        sparkle: 'IconSparkleRegular',
        folder: 'IconFolderCloseRegular',
        folderOpen: 'IconFolderOpenRegular',
        edit: 'IconEditOutlineRegular',
      };
      const Native = UI[map[name]];
      if (typeof Native === 'function' || (Native && typeof Native === 'object')) return h(Native, { size });
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: PATHS[name] || PATHS.dot }));
    }

    function readObject(value) {
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value !== 'string' || value.trim() === '') return {};
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    }

    /**
     * Whether a tab's name fits beside its icon: the room the button gives against the name's width,
     * the icon, the gap between them and the button's padding (all in pixels).
     */
    function nameFits(sizes) {
      const { room, name, icon, gap, padding } = sizes;
      // On the safe side: a name a fraction too wide would already be cut ("Researc…").
      return name + icon + gap + padding <= room - 0.25;
    }

    /**
     * Which tabs show their icon alone in the wide sidebar: those with an icon of their own whose name
     * does not fit. Each name is measured as if its tab were selected (weight 500 or more), so selecting
     * a tab never changes its look.
     * @param {{id: string, label: string}[]} tabs - the tabs, in order.
     * @param {ArrayLike<Element>} buttons - their buttons, in the same order.
     * @param {(el: Element) => CSSStyleDeclaration} styleOf - the computed style of a button.
     * @param {CanvasRenderingContext2D | null} pen - a canvas to measure text with.
     * @returns {string[]} the ids that show their icon alone.
     */
    function iconOnlyIds(tabs, buttons, styleOf, pen) {
      const ids = [];
      tabs.forEach((m, i) => {
        const button = buttons[i];
        if (!button || !pen || glyphFor(m.id) === 'dot') return;
        const css = styleOf(button);
        pen.font = `${css.fontStyle} ${Math.max(500, Number(css.fontWeight) || 400)} ${css.fontSize} ${css.fontFamily}`;
        const fits = nameFits({
          room: button.getBoundingClientRect().width,
          name: pen.measureText(m.label).width,
          icon: button.firstElementChild?.getBoundingClientRect().width || 15,
          gap: parseFloat(css.columnGap) || 0,
          padding: (parseFloat(css.paddingLeft) || 0) + (parseFloat(css.paddingRight) || 0),
        });
        if (!fits) ids.push(m.id);
      });
      return ids;
    }

    function glyphFor(modeId) {
      return modeId === 'chat' || modeId === 'code' || modeId === 'cowork' || modeId === 'finance' || modeId === 'data' || modeId === 'recon' || modeId === 'scout' || modeId === 'research' || modeId === 'automations' || modeId === 'content' || modeId === 'bench' || modeId === 'creator-plus' ? modeId : 'dot';
    }

    /**
     * Shared state: the modes (from the Modes add-on's settings), the selected tab and this add-on's
     * tab layout. One store for the whole page, refreshed on demand and every 10 seconds.
     */
    function createModel(ctx) {
      // Item 4A, stage 3a: `spacesOn` (the space buttons show), `space` (this window's space), `spaceRows` (Modes' list of
      // the five), `spaceOrder` (your own order of the buttons) and `sessionSpaces` (each thread's space).
      const firstSpace = readSpaceLocal();
      const spacesAtStart = readSpacesOn();
      let state = { modes: FALLBACK_MODES, extra: [], selected: spacesAtStart ? SPACE_TAB[firstSpace] : readLocal(), tabs: DEFAULT_TABS, maxTabs: 3, hideLogos: false, dateTitle: false, wideChat: false, iconOnlyTabs: false, tabOrder: [], startPlaces: '', newKeyFollows: true, modesOn: false, error: '', notice: '', sessionModes: {}, sessionIsolated: {}, ownIsolatedModes: [], pendingSpaces: {}, presetLock: '{}', spacesOn: spacesAtStart, space: firstSpace, spaceRows: [], spaceOrder: [], sessionSpaces: {}, spaceLayout: '', errorFix: '', errorDetails: '' };
      spaceMode.on = spacesAtStart;
      const listeners = new Set();
      const emit = () => { for (const l of listeners) l(); };
      const set = (patch) => {
        // A changed "Preset in this tab" setting is read again at the next start.
        if (typeof patch.presetLock === 'string' && patch.presetLock !== state.presetLock) forgetPresetTable();
        // A new error (or none) without its own what-to-do and details drops the ones of the error before it.
        if (Object.prototype.hasOwnProperty.call(patch, 'error') && !Object.prototype.hasOwnProperty.call(patch, 'errorDetails')) patch = { ...patch, errorFix: '', errorDetails: '' };
        state = { ...state, ...patch };
        spaceMode.on = state.spacesOn === true;
        startPlaceTable.value = startPlacesOf(state.startPlaces);
        startPlaceTable.newKey = state.newKeyFollows !== false;
        emit();
      };

      function readLocal() {
        try { return window.localStorage.getItem(LOCAL_KEY) || 'chat'; } catch { return 'chat'; }
      }
      function writeLocal(id) {
        try { window.localStorage.setItem(LOCAL_KEY, id); } catch { /* private mode */ }
      }

      // `fresh`: a read that a save follows asks the app itself, never the page's shared copy.
      async function describe(fresh = false) {
        const result = await dshPoll.settings(ctx, { fresh });
        if (!result.ok) throw new Error(result.error.code);
        return result.value.namespaces;
      }

      // Bumped by every tab click: a refresh that started before a click must not undo it.
      let clicks = 0;
      // While a tab click is being saved, the stored tab is still the old one: a refresh must not read it.
      let selecting = 0;
      let saving = Promise.resolve();
      // The same for this add-on's own settings (setOption): saves in order, and a refresh that began
      // before or during a save keeps the value shown.
      let optionSaving = Promise.resolve();
      let optionWrites = 0;
      let optionPending = 0;
      async function refresh() {
        const started = clicks;
        const startedWrites = optionWrites;
        try {
          const spaces = await describe();
          const modesNs = spaces.find((item) => item.ns === MODES_NS);
          const mine = spaces.find((item) => item.ns === SETTINGS_NS);
          const patch = {};
          if (mine) {
            const tabs = readObject(mine.value?.tabs);
            if (Object.keys(tabs).length > 0) patch.tabs = tabs;
            if (Number.isFinite(mine.value?.maxTabs)) patch.maxTabs = mine.value.maxTabs;
            // Item 4A, stage 3b: the rows of each space (empty: the built-in layout).
            patch.spaceLayout = typeof mine.value?.spaceLayout === 'string' ? mine.value.spaceLayout : '';
            if (optionPending === 0 && startedWrites === optionWrites) {
              patch.hideLogos = mine.value?.hideLogos === true;
              patch.dateTitle = mine.value?.dateTitle === true;
              patch.wideChat = mine.value?.wideChat === true;
              patch.iconOnlyTabs = mine.value?.iconOnlyTabs === true;
              patch.tabOrder = readOrder(mine.value?.tabOrder);
              patch.spaceOrder = readOrder(mine.value?.spaceOrder);
              patch.startPlaces = typeof mine.value?.startPlaces === 'string' ? mine.value.startPlaces : '';
              patch.newKeyFollows = mine.value?.newKeyFollows !== false;
            }
          }
          if (modesNs) {
            const defined = Object.entries(readObject(modesNs.value?.modes)).map(([id, value]) => ({
              id,
              label: value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id,
            }));
            patch.modes = defined.length > 0 ? defined : FALLBACK_MODES;
            // Modes that other add-ons add: each gets a tab after the usual ones, whatever the tab limit.
            patch.extra = Object.entries(readObject(modesNs.value?.extraModes))
              .filter(([id]) => !patch.modes.some((m) => m.id === id))
              .map(([id, value]) => ({ id, label: value && typeof value.label === 'string' && value.label.trim() ? value.label.trim() : id }));
            patch.modesOn = true;
            if (started === clicks) patch.sessionModes = readObject(modesNs.value?.sessionModes);
            if (started === clicks) patch.sessionSpaces = readObject(modesNs.value?.sessionSpaces);
            // Which conversations began in Recon (Modes keeps it for good): Move to opens those as new ones.
            patch.sessionIsolated = readObject(modesNs.value?.sessionIsolated);
            // Item 4A, stage 6a: an owner's own isolated modes (not Recon's) keep their own space in the list.
            patch.ownIsolatedModes = Object.entries({ ...readObject(modesNs.value?.modes), ...readObject(modesNs.value?.extraModes) })
              .filter(([id, value]) => id !== 'recon' && value && value.isolated === true).map(([id]) => id);
            // Item 4A, stage 6a: guarded spaces Modes holds but has not written yet (a Devices draft claimed a moment ago).
            try { patch.pendingSpaces = await readPendingSpaces(); } catch { /* an older Cowork or Modes, or busy: keep what we have */ }
            patch.presetLock = typeof modesNs.value?.presetLock === 'string' ? modesNs.value.presetLock : '{}';
            // Item 4A, stage 3a: are spaces live? Asked of Modes itself (its route). Without an answer, as last time.
            try {
              const spaces = await readSpaces('en');
              patch.spacesOn = spaces.live;
              patch.spaceRows = spaces.spaces;
              try { window.localStorage.setItem(SPACES_ON_KEY, spaces.live ? '1' : '0'); } catch { /* private mode */ }
            } catch { /* an older Modes, or busy: keep what we have */ }
            const current = modesNs.value?.defaultMode;
            // With the space buttons each window keeps its own space; the stored tab (defaultMode) no longer decides it.
            const spacesNow = patch.spacesOn ?? state.spacesOn;
            if (spacesNow) {
              if (!state.spacesOn) patch.selected = SPACE_TAB[state.space] ?? 'chat';
            } else if (started === clicks && selecting === 0 && typeof current === 'string' && [...patch.modes, ...patch.extra].some((m) => m.id === current)) {
              patch.selected = current;
              writeLocal(current);
            }
          } else {
            // Without Modes there are no spaces: the tabs as before.
            patch.spacesOn = false;
          }
          set(patch);
        } catch {
          // Keep what we have; the tabs still switch sections locally.
        }
      }

      /**
       * Select a tab: with the Modes add-on, it becomes the mode new conversations start in. With the space buttons
       * (item 4A) it selects a space for this window only (a mode id selects its space): nothing is written to Modes,
       * so `defaultMode` and the old stored tab stay as they are.
       */
      async function select(id, label) {
        if (state.spacesOn) {
          const space = isSpaceId(id) ? id : spaceOfTabId(id) ?? 'chat';
          clicks += 1;
          writeSpaceLocal(space);
          // Stage 7 (6b lab leftover): a line about a draft another space keeps ("That draft belongs to Devices … To start
          // a new thread in Recon …") is about the window's space then; it goes when the window's space changes (a click on
          // the space already shown keeps it).
          set({ space, selected: SPACE_TAB[space], error: '', ...(space !== state.space ? { notice: '' } : {}) });
          return;
        }
        const before = state.selected;
        clicks += 1;
        writeLocal(id);
        set({ selected: id, error: '' });
        if (!state.modesOn) return;
        selecting += 1;
        // One save at a time and in click order, so the stored tab ends as the last one clicked.
        const turn = saving;
        let done;
        saving = new Promise((resolve) => { done = resolve; });
        await turn;
        try {
          if (state.selected !== id) return;
          const op = [{ op: 'set', path: ['defaultMode'], value: id }];
          let spaces = await describe(true);
          let entry = spaces.find((item) => item.ns === MODES_NS);
          let result = await ctx.remote.settings.mutate(MODES_NS, op, entry.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            spaces = await describe(true);
            entry = spaces.find((item) => item.ns === MODES_NS);
            result = await ctx.remote.settings.mutate(MODES_NS, op, entry.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
        } catch {
          writeLocal(before);
          set({ selected: before, error: ctx.locale.bind(NS)('tab.failed', { tab: label }) });
        } finally {
          done();
          selecting -= 1;
          // Refreshes that began before the save finished carry the old tab.
          clicks += 1;
        }
      }

      /**
       * Move conversations to a tab: their recorded mode becomes the tab's mode (the Modes add-on applies
       * it at the next turn), so they show under that tab from now on.
       */
      async function move(sessionIds, modeId) {
        if (!state.modesOn || sessionIds.length === 0) return false;
        if (state.spacesOn) return moveSpace(sessionIds, modeId);
        clicks += 1;
        const before = state.sessionModes;
        const optimistic = { ...before };
        for (const id of sessionIds) optimistic[id] = modeId;
        set({ sessionModes: optimistic, error: '' });
        try {
          let spaces = await describe(true);
          let entry = spaces.find((item) => item.ns === MODES_NS);
          const build = (value) => {
            const next = { ...readObject(value?.sessionModes) };
            for (const id of sessionIds) next[id] = modeId;
            return [{ op: 'set', path: ['sessionModes'], value: JSON.stringify(next) }];
          };
          let result = await ctx.remote.settings.mutate(MODES_NS, build(entry.value), entry.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            spaces = await describe(true);
            entry = spaces.find((item) => item.ns === MODES_NS);
            result = await ctx.remote.settings.mutate(MODES_NS, build(entry.value), entry.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
          return true;
        } catch {
          set({ sessionModes: before, error: ctx.locale.bind(NS)('move.failed') });
          return false;
        }
      }

      /**
       * Item 4A, stage 3a: move threads to another space, through Modes (its route), which checks the move and says why
       * when it refuses (a sealed thread, into Recon). Each keeps its mode where the new space offers it.
       */
      async function moveSpace(sessionIds, space) {
        clicks += 1;
        const before = state.sessionSpaces;
        const optimistic = { ...before };
        for (const id of sessionIds) optimistic[id] = space;
        set({ sessionSpaces: optimistic, error: '' });
        try {
          const response = await fetch(new URL('dsh-modes/mode', document.baseURI), {
            method: 'POST', cache: 'no-store', credentials: 'same-origin',
            headers: { accept: 'application/json', 'content-type': 'application/json', 'x-dsh-locale': 'en' },
            body: JSON.stringify({ action: 'move', sessionId: sessionIds[0], sessionIds, space }),
          });
          const data = await response.json().catch(() => null);
          if (typeof data?.error === 'string' && data.error) {
            // Modes' own sentence: what went wrong and what to do.
            set({ sessionSpaces: before, error: data.error.slice(0, 400), errorFix: '', errorDetails: '' });
            return false;
          }
          if (!data?.ok) throw new Error(`error ${response.status}`);
          void refresh();
          return true;
        } catch (error) {
          // Fix round: a network or reply problem says what to click; the raw text only behind Details.
          const t = ctx.locale.bind(NS);
          set({ sessionSpaces: before, error: t('move.failed'), errorFix: t('move.failed.fix'), errorDetails: String(error?.message ?? error).slice(0, 400) });
          return false;
        }
      }

      /** Switch one of this add-on's own on/off settings (`hideLogos`, `dateTitle`, `wideChat`, `iconOnlyTabs`). */
      async function setOption(key, value) {
        const before = state[key];
        optionWrites += 1;
        optionPending += 1;
        set({ [key]: value, error: '' });
        // One save at a time and in order (fast arrow presses while arranging the tabs), each with a
        // fresh revision; a save that a later change of the same setting replaced is skipped.
        const turn = optionSaving;
        let done;
        optionSaving = new Promise((resolve) => { done = resolve; });
        await turn;
        try {
          if (state[key] !== value) return;
          const op = [{ op: 'set', path: [key], value }];
          let entry = (await describe(true)).find((item) => item.ns === SETTINGS_NS);
          let result = await ctx.remote.settings.mutate(SETTINGS_NS, op, entry.revision);
          if (!result.ok && result.error.code === 'settings/conflict') {
            entry = (await describe(true)).find((item) => item.ns === SETTINGS_NS);
            result = await ctx.remote.settings.mutate(SETTINGS_NS, op, entry.revision);
          }
          if (!result.ok) throw new Error(result.error.code);
        } catch {
          // Put back only this change, not a later one.
          if (state[key] === value) set({ [key]: before, error: ctx.locale.bind(NS)('look.failed') });
        } finally {
          done();
          optionPending -= 1;
          // Refreshes that began before the save finished carry the old value.
          optionWrites += 1;
        }
      }

      return {
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        get: () => state,
        refresh,
        select,
        move,
        setOption,
        fail: (message) => set({ error: String(message) }),
        /** Lab fix (6a): take a line away once it no longer holds (only when it is still the one shown). */
        clearFail: (message) => { if (message && state.error === String(message)) set({ error: '' }); },
        /** A plain line under the tabs for a while (what a move out of Recon did). */
        note: (message) => {
          set({ notice: String(message) });
          setTimeout(() => { if (state.notice === String(message)) set({ notice: '' }); }, 15000);
        },
      };
    }

    /** Snapshot of every plugin's sidebar page row, ordered like the app's own sidebar. */
    function createPages(ctx) {
      let snapshot = [];
      const read = () => ctx.slots.entriesOfSlot('sidebar.panellist').map(({ options }) => ({
        id: options.id,
        order: options.order ?? 0,
        label: typeof options.label === 'function' ? String(options.label()) : String(options.label ?? options.id),
      })).filter((page) => page.id !== 'project').sort((a, b) => a.order - b.order);
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          snapshot = read();
          const off = ctx.slots.subscribe('sidebar.panellist', () => { snapshot = read(); listener(); });
          const offLocale = ctx.locale.subscribe?.(() => { snapshot = read(); listener(); });
          return () => { off?.(); offLocale?.(); };
        },
      };
    }

    /**
     * Item 4A, stage 3b: the Settings pages registered now (id and label), for the rows that open one (Workshop: Tuner
     * Plus, Benchmark). A page whose add-on is off is not registered, so its row is left out.
     */
    function createSections(ctx) {
      let snapshot = [];
      const read = () => {
        try {
          return ctx.slots.entriesOfSlot('settings.section').map(({ options }) => ({
            id: String(options?.id ?? ''),
            label: typeof options?.label === 'function' ? String(options.label()) : String(options?.label ?? options?.id ?? ''),
          })).filter((section) => section.id);
        } catch {
          return [];
        }
      };
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          snapshot = read();
          let off;
          try { off = ctx.slots.subscribe('settings.section', () => { snapshot = read(); listener(); }); } catch { off = null; }
          const offLocale = ctx.locale.subscribe?.(() => { snapshot = read(); listener(); });
          return () => { off?.(); offLocale?.(); };
        },
      };
    }

    /**
     * The app's own tooltip (half a second after pointing). `side` is where it opens; `portal` lets it
     * leave the sidebar instead of being cut off at its edge.
     */
    function Tooltip(props) {
      const { label, show, side = 'right', portal = false, disabled = false, children } = props;
      // `disabled` keeps the app's tooltip around the element but silent, so the element is not
      // replaced (and does not lose keyboard focus) when the tooltip is switched off for a while.
      if (show && UI.Tooltip) return h(UI.Tooltip, { label, delayMs: 500, side, ...(portal ? { portal: true } : {}), ...(disabled ? { disabled: true } : {}) }, children);
      return children;
    }

    /** The More launcher: the rows other plugins register (`sidebar.panellist.actions`). */
    function MoreMenu({ wide, label, entries, onOpen, renderSlot, extra }) {
      const [open, setOpen] = useState(false);
      const onDismiss = () => setOpen(false);
      const button = h('button', {
        type: 'button', className: 'cws-row', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': open,
        onClick: () => setOpen((v) => !v),
      }, h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'grid', size: wide ? 16 : 18 })),
      wide ? h('span', { className: 'cws-label' }, label) : null);
      const rows = h(React.Fragment, null,
        renderSlot('sidebar.panellist.actions', { entries, onOpen: (id) => { onDismiss(); onOpen(id); }, onPinnedChange: () => {}, onDismiss }),
        (extra ?? []).length > 0 ? h('div', { className: 'cws-movesep', role: 'separator' }) : null,
        (extra ?? []).map((item) => h('button', {
          key: item.key, type: 'button', role: 'menuitem', className: 'cws-moveitem',
          onClick: () => { onDismiss(); item.run(); },
        }, item.label)));
      if (UI.Menu) {
        return h(UI.Menu, { open, onClose: onDismiss, portal: true, autoFocus: true, anchor: h(Tooltip, { label, show: !wide }, button) }, rows);
      }
      return h('div', { className: 'cws-more' }, button, open ? h('div', { className: 'cws-pop', role: 'menu' }, rows) : null);
    }

    /** The app's own New Session shortcut (shown as a badge), or null when the app does not expose it. */
    function useNewSessionShortcut(appCtx) {
      const catalog = (() => {
        try {
          return appCtx.get?.('shortcuts')?.catalog ?? null;
        } catch {
          return null;
        }
      })();
      const subscribe = useCallback((listener) => (catalog?.subscribe ? catalog.subscribe(listener) : () => {}), [catalog]);
      const rows = useSyncExternalStore(subscribe, () => (catalog?.getSnapshot ? catalog.getSnapshot() : null));
      const row = Array.isArray(rows) ? rows.find((r) => r && r.id === 'session.new') : null;
      return row && Array.isArray(row.keys) && row.keys.length > 0 ? row : null;
    }

    const SCROLLER = { bindScrollerRef: () => {} };
    const HOOK_CONTEXT = { useSectionScroller: () => SCROLLER };


    /**
     * The app's own project and conversation lists (read-only views of its client services), kept as
     * one snapshot. Missing services make `ok` false; the sidebar then shows the app's own list.
     */
    function createLibrary(ctx) {
      const get = (name) => { try { return ctx.get(name) ?? null; } catch { return null; } };
      let snapshot = { ok: false, workspaces: [], byId: {}, pinned: [], archived: [], currentId: null, waiting: {} };
      let version = 0;
      const read = () => {
        const ws = get('workspaces')?.list?.getSnapshot?.();
        const ss = get('sessions')?.list?.getSnapshot?.();
        if (!ws || !ss || ws.phase !== 'ready' || ss.phase !== 'ready') return { ...snapshot, ok: false };
        let currentId = null;
        try { currentId = get('uiWorkspace')?.selection?.getSnapshot?.()?.sessionId ?? null; } catch { currentId = null; }
        // Which conversations wait for the user, and for what: the app's own status, as its sidebar reads it.
        const waiting = {};
        try {
          const statuses = get('uiSession')?.sessionStatus?.getSnapshot?.();
          if (statuses && typeof statuses.forEach === 'function') {
            statuses.forEach((status, id) => {
              const kind = status?.pendingInteraction?.kind;
              if (kind === 'approval' || kind === 'plan-review' || kind === 'question') waiting[id] = kind;
            });
          }
        } catch { /* no status service: nothing is shown as waiting */ }
        // The AI asking for a tool (Tool access): the card sits in that conversation; the sidebar says so while it is not on screen.
        try {
          for (const id of window.__dshToolCard?.ids?.() ?? []) if (!waiting[id]) waiting[id] = 'permission';
        } catch { /* no permission card here */ }
        return {
          ok: true,
          workspaces: Array.isArray(ws.items) ? ws.items : [],
          byId: ss.byId ?? {},
          pinned: Array.isArray(ws.pinnedSessionIds) ? ws.pinnedSessionIds : [],
          archived: Array.isArray(ws.archivedSessionIds) ? ws.archivedSessionIds : [],
          currentId,
          waiting,
        };
      };
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          const update = () => { version += 1; snapshot = read(); listener(); };
          snapshot = read();
          const offs = [
            get('workspaces')?.list?.subscribe?.(update),
            get('sessions')?.list?.subscribe?.(update),
            get('uiWorkspace')?.selection?.subscribe?.(update),
            get('uiSession')?.sessionStatus?.subscribe?.(update),
            window.__dshToolCard?.subscribe?.(update),
          ];
          // Titles and times change without always notifying; refresh gently.
          // Looks again every 5 s while the window is shown, none while it is hidden.
          const timer = dshPoll.loop(() => update(), { every: 5000, immediate: false });
          return () => { timer.stop(); for (const off of offs) { try { off?.(); } catch { /* ignore */ } } };
        },
      };
    }

    /** What Plus keeps about projects (tab, instructions), and the project page's file calls. */
    function createProjects() {
      const url = (query) => {
        const u = new URL('dsh-cowork-shell/projects', document.baseURI);
        for (const [key, value] of Object.entries(query ?? {})) u.searchParams.set(key, String(value));
        return u;
      };
      let snapshot = { projects: [], presets: [], shared: {}, focus: null };
      const listeners = new Set();
      const emit = () => { for (const listener of listeners) listener(); };
      const call = async (query, init) => {
        const response = await fetch(url(query), { headers: { accept: 'application/json' }, ...init });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data?.error ?? response.status));
        if (Array.isArray(data?.projects)) { snapshot = { ...snapshot, projects: data.projects, presets: Array.isArray(data.presets) ? data.presets : snapshot.presets, shared: data.shared && typeof data.shared === 'object' ? data.shared : snapshot.shared }; emit(); }
        return data;
      };
      let timer;
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener);
          if (listeners.size === 1) timer = dshPoll.loop(() => call().catch(() => {}), { every: 20000 });
          return () => { listeners.delete(listener); if (listeners.size === 0) timer?.stop(); };
        },
        refresh: () => call(),
        save: (path, patch) => call(null, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save', path, ...patch }) }),
        files: async (path) => (await call({ files: path })).files ?? { files: [], more: false },
        digest: (path, contents, provider) => call({ digest: path, contents: contents ? '1' : '0', ...(provider ? { provider } : {}) }),
        generate: (body) => call(null, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'generate', ...body }) }),
        presetSave: (preset) => call(null, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preset-save', ...preset }) }),
        presetRemove: (id) => call(null, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify({ action: 'preset-remove', id }) }),
        upload: (path, file) => call({ upload: '1', path, name: file.name }, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/octet-stream' }, body: file }),
        focus: (workspaceId) => { snapshot = { ...snapshot, focus: workspaceId }; emit(); },
      };
    }

    function sizeText(bytes) {
      if (!Number.isFinite(bytes)) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes < 10240 ? 1 : 0) + ' KB';
      return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    }

    /**
     * The lines of two texts side by side: kept (' '), gone ('-') and new ('+').
     * @param {string} before - the text now.
     * @param {string} after - the new text.
     * @returns {{k: string, text: string}[] | null} the lines; null when the texts are too long to compare line by line.
     */
    function lineDiff(before, after) {
      const a = String(before ?? '').split('\n');
      const b = String(after ?? '').split('\n');
      if (a.length > 700 || b.length > 700) return null;
      const width = b.length + 1;
      const table = new Uint16Array((a.length + 1) * width);
      for (let i = a.length - 1; i >= 0; i -= 1) for (let j = b.length - 1; j >= 0; j -= 1) table[i * width + j] = a[i] === b[j] ? table[(i + 1) * width + j + 1] + 1 : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
      const out = [];
      let i = 0;
      let j = 0;
      while (i < a.length && j < b.length) {
        if (a[i] === b[j]) { out.push({ k: ' ', text: a[i] }); i += 1; j += 1; }
        else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) { out.push({ k: '-', text: a[i] }); i += 1; }
        else { out.push({ k: '+', text: b[j] }); j += 1; }
      }
      for (; i < a.length; i += 1) out.push({ k: '-', text: a[i] });
      for (; j < b.length; j += 1) out.push({ k: '+', text: b[j] });
      return out;
    }

    /** The panel that writes a project's instructions with a model: choose, see what would be sent, agree, read the result. */
    function GeneratePanel({ t, gen, setGen, catalog, current, onRun, onUse }) {
      const groups = catalog?.groups ?? [];
      const value = gen.provider && gen.model ? `${gen.provider}\u0000${gen.model}` : '';
      const digest = gen.digest;
      const where = gen.where?.where;
      const outside = where === 'cloud' || where === 'unknown';
      const made = gen.result;
      const set = (patch) => setGen((now) => (now ? { ...now, ...patch } : now));
      if (made) {
        const diff = current.trim() ? lineDiff(current.trim(), made.instructions) : null;
        const same = current.trim() === made.instructions.trim();
        return h('div', { className: 'cws-preview' },
          h('div', { className: 'cws-note' }, same ? t('gen.same') : t(diff ? 'gen.result' : 'gen.result.first', { model: made.model })),
          same ? null : diff
            ? h('div', { className: 'cws-diff' }, diff.map((line, index) => h('div', { key: index, 'data-k': line.k }, `${line.k === ' ' ? ' ' : line.k === '+' ? '+' : '−'} ${line.text}`)))
            : h('pre', null, made.instructions),
          made.ideas.length > 0 ? h('div', { className: 'cws-note' }, t('gen.ideas')) : null,
          made.ideas.length > 0 ? h('ul', { className: 'cws-ideas' }, made.ideas.map((idea, index) => h('li', { key: index }, idea))) : null,
          h('div', { className: 'cws-inline' },
            same ? null : h('button', { type: 'button', className: 'cws-btn', onClick: onUse }, t('gen.use')),
            h('button', { type: 'button', className: 'cws-btn', onClick: () => setGen(null) }, t(same ? 'gen.close' : 'gen.discard'))));
      }
      return h('div', { className: 'cws-preview' },
        h('div', { className: 'cws-sec-head' }, h('h2', null, t('gen.title'))),
        h('div', { className: 'cws-note' }, t('gen.hint')),
        h('div', { className: 'cws-inline' },
          h('select', {
            value, 'aria-label': t('gen.model'), disabled: gen.busy,
            onChange: (event) => { const [provider, model] = event.target.value.split('\u0000'); set({ provider: provider || '', model: model || '', agreed: false, where: null, error: '' }); },
          },
          h('option', { value: '' }, t('gen.model.none')),
          groups.map((group) => h('optgroup', { key: group.id, label: group.name }, group.models.map((item) => h('option', { key: `${group.id}:${item.id}`, value: `${group.id}\u0000${item.id}` }, item.name))))),
          h('select', { value: gen.contents ? '1' : '0', 'aria-label': t('gen.what.full'), disabled: gen.busy, onChange: (event) => set({ contents: event.target.value === '1', agreed: false, digest: null }) },
            h('option', { value: '1' }, t('gen.what.full')),
            h('option', { value: '0' }, t('gen.what.names')))),
        digest ? h('div', { className: 'cws-note' }, digest.files === 0 ? t('gen.sent.empty')
          : t(digest.contents ? 'gen.sent' : 'gen.sent.names', { files: digest.files, more: digest.more ? t('gen.sent.more') : '', included: digest.included.length, chars: digest.chars.toLocaleString('en-US') })) : null,
        digest && digest.included.length > 0 ? h('div', { className: 'cws-note' }, t('gen.sent.files', { names: digest.included.map((file) => file.name).join(', ') })) : null,
        digest && digest.guides.length > 0 ? h('div', { className: 'cws-note' }, t('gen.guides', { names: digest.guides.join(', ') })) : null,
        digest && digest.secrets.length > 0 ? h('div', { className: 'cws-note' }, t('gen.secrets', { names: digest.secrets.join(', ') })) : null,
        gen.provider && where === 'local' ? h('div', { className: 'cws-note' }, t('gen.where.local')) : null,
        gen.provider && where === 'network' ? h('div', { className: 'cws-note' }, t('gen.where.network', { host: gen.where.host })) : null,
        gen.provider && outside ? h('div', { className: 'cws-warn', role: 'alert' }, where === 'cloud' ? t('gen.where.cloud', { host: gen.where.host || gen.where.name }) : t('gen.where.unknown')) : null,
        gen.provider && outside ? h('label', { className: 'cws-check' },
          h('input', { type: 'checkbox', checked: gen.agreed, disabled: gen.busy, onChange: (event) => set({ agreed: event.target.checked }) }),
          t('gen.agree', { name: gen.where.name || gen.model })) : null,
        gen.error ? h('div', { className: 'cws-msg', 'data-tone': 'bad', role: 'status' }, gen.error) : null,
        gen.busy ? h('div', { className: 'cws-note', role: 'status' }, t('gen.running')) : null,
        h('div', { className: 'cws-inline' },
          h('button', { type: 'button', className: 'cws-btn', disabled: gen.busy || !gen.provider || !gen.model || !gen.where || !digest || (outside && !gen.agreed), onClick: onRun }, t('gen.run')),
          h('button', { type: 'button', className: 'cws-btn', disabled: gen.busy, onClick: () => setGen(null) }, t('gen.close'))));
    }

    /** A project's page: its name, the tab it shows under, its instructions, its files, its conversations. */
    /**
     * Item 4A, stage 3b: the Projects row's page: every project the app knows (not Scratch, not Recon's room), the
     * default workspace among them, newest first. Picking one opens its project page. The card grid is Part C.
     */
    function ProjectList({ appCtx, lib, projects }) {
      const t = appCtx.locale.bind(NS);
      const archived = new Set(lib.archived ?? []);
      const threads = (ws) => (ws.sessionIds ?? []).filter((id) => lib.byId[id] && !lib.byId[id].blank && lib.byId[id].origin !== 'subagent' && !archived.has(id));
      const latest = (ws) => Math.max(Date.parse(ws.updatedAt ?? '') || 0, ...threads(ws).map((id) => lib.byId[id].updatedAt ?? 0));
      const home = defaultWorkspace(lib.workspaces);
      const list = (lib.workspaces ?? []).filter((ws) => ws?.workspaceId && !hidden.has(roomKey(ws.path)) && !rooms.has(roomKey(ws.path)))
        .sort((a, b) => latest(b) - latest(a));
      const info = h(ui.Info, { title: t('projects.title'), what: t('projects.info.what'), when: t('projects.info.when'), change: t('projects.info.change'), portal: true });
      return h(PageFrame, { title: h('span', { className: 'cws-lib-title' }, t('projects.title'), info), hint: t('projects.hint') },
        list.length === 0
          ? h('p', { className: 'cws-note', role: 'status' }, t('projects.none'))
          : h('div', { className: 'cws-card', 'data-cws-projects': '' }, list.map((ws) => {
            const n = threads(ws).length;
            return h('div', { key: ws.workspaceId, className: 'cws-item' },
              h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'folder', size: 18 })),
              h('div', { className: 'cws-item-main' },
                h('div', { className: 'cws-item-name' }, ws.title || ws.path || t('untitled')),
                h('div', { className: 'cws-item-sub' }, [home?.workspaceId === ws.workspaceId ? t('projects.default') : '', n === 1 ? t('projects.threads.one') : t('projects.threads', { n }), ws.path || ''].filter(Boolean).join(' · '))),
              h('button', { type: 'button', className: 'cws-btn', 'aria-label': t('proj.open') + ': ' + (ws.title || ws.path || ''), onClick: () => projects.focus(ws.workspaceId) }, t('projects.open')));
          })));
    }

    function ProjectPage({ appCtx, model, library, projects }) {
      const t = appCtx.locale.bind(NS);
      const state = useSyncExternalStore(model.subscribe, model.get);
      const lib = useSyncExternalStore(library.subscribe, library.get);
      const meta = useSyncExternalStore(projects.subscribe, projects.get);
      const ws = lib.workspaces.find((item) => item.workspaceId === meta.focus) ?? null;
      const record = meta.projects.find((item) => item.workspaceId === meta.focus) ?? null;
      const [text, setText] = useState('');
      const [name, setName] = useState('');
      const [note, setNote] = useState({ text: '', tone: '' });
      const [files, setFiles] = useState({ files: [], more: false });
      const [busy, setBusy] = useState(false);
      const [over, setOver] = useState(false);
      // A type that was picked while the project already has instructions of its own: shown first, applied on a yes.
      const [pending, setPending] = useState(null);
      const [keepName, setKeepName] = useState(null);
      // The generate panel: closed (null), or what is chosen in it and what came back.
      const [gen, setGen] = useState(null);
      const [catalog, setCatalog] = useState(null);
      const [versions, setVersions] = useState([]);
      const [showVersions, setShowVersions] = useState(false);
      const [drifted, setDrifted] = useState(null);
      // Where the text in the box came from, so a save can say so: the model, a type, or the user.
      const origin = useRef({ by: 'you', note: '', text: '', mark: undefined });
      const picker = useRef(null);
      const path = ws?.path ?? '';
      const loadedFor = useRef('');
      useEffect(() => {
        // Fill the boxes once per project, when its record has arrived; later refreshes must not undo typing.
        if (!ws || !record || loadedFor.current === ws.workspaceId) return;
        loadedFor.current = ws.workspaceId;
        setText(record.instructions ?? '');
        setName(ws.title ?? '');
        setNote({ text: '', tone: '' });
        setPending(null);
        setKeepName(null);
        setGen(null);
        setShowVersions(false);
        origin.current = { by: 'you', note: '', text: '', mark: undefined };
      }, [ws?.workspaceId, record !== null]);
      // The versions kept for this project, and whether the folder moved since instructions were last generated.
      useEffect(() => {
        setVersions([]);
        setDrifted(null);
        if (!path) return undefined;
        let live = true;
        projects.digest(path, false).then((data) => {
          if (!live) return;
          if (Array.isArray(data?.versions)) setVersions(data.versions);
          if (data?.digest?.generatedBefore && data.digest.drift?.much) setDrifted(data.digest.drift);
        }).catch(() => {});
        return () => { live = false; };
      }, [path, projects]);
      // The look at "what would be sent" follows the choices in the panel.
      const genKey = gen ? `${gen.provider}\u0000${gen.contents}` : '';
      useEffect(() => {
        if (!gen || !path) return undefined;
        let live = true;
        projects.digest(path, gen.contents, gen.provider).then((data) => {
          if (live) setGen((now) => (now ? { ...now, digest: data?.digest ?? null, where: data?.where ?? null } : now));
        }).catch((error) => { if (live) setGen((now) => (now ? { ...now, error: String(error?.message ?? error) } : now)); });
        return () => { live = false; };
      }, [genKey, path, projects]);
      useEffect(() => {
        if (!gen || catalog) return;
        (async () => {
          try {
            const result = await appCtx.get('remote.session')?.modelCatalog?.();
            if (result?.ok) setCatalog(result.value);
          } catch { /* the picker stays empty */ }
        })();
      }, [gen !== null, catalog, appCtx]);
      const loadFiles = useCallback(async () => {
        if (!path) return;
        try { setFiles(await projects.files(path)); } catch { setFiles({ files: [], more: false }); }
      }, [path, projects]);
      useEffect(() => { setFiles({ files: [], more: false }); void loadFiles(); }, [loadFiles]);
      useEffect(() => { if (meta.focus && !record) void projects.refresh().catch(() => {}); }, [meta.focus, record === null]);
      // Item 4A, stage 3b: no project picked (the Projects row): the list of projects to pick from.
      if (!ws) return h(ProjectList, { appCtx, lib, projects });

      const fail = (error) => setNote({ text: t('proj.page.failed', { message: String(error?.message ?? error) }), tone: 'bad' });
      const saveText = async () => {
        try {
          // Text that came from the model or a type and was not changed since is recorded as theirs.
          const from = origin.current.text && origin.current.text === text ? origin.current : { by: 'you', note: '' };
          const data = await projects.save(path, { instructions: text, by: from.by, note: from.note, ...(from.by === 'model' ? { mark: from.mark } : {}) });
          if (Array.isArray(data?.versions)) setVersions(data.versions);
          if (from.by === 'model') setDrifted(null);
          origin.current = { by: 'you', note: '', text: '', mark: undefined };
          setNote({ text: t('proj.page.saved'), tone: '' });
        } catch (error) { fail(error); }
      };
      const openGen = () => {
        // The conversation's usual model is not known here; the user picks one.
        setGen({ provider: '', model: '', contents: true, agreed: false, busy: false, digest: null, where: null, result: null, error: '' });
        setShowVersions(false);
      };
      const runGen = async () => {
        if (!gen?.provider || !gen.model || gen.busy) return;
        setGen((now) => ({ ...now, busy: true, error: '', result: null }));
        try {
          const data = await projects.generate({ path, provider: gen.provider, model: gen.model, contents: gen.contents, agreed: gen.agreed, current: text });
          setGen((now) => (now ? { ...now, busy: false, result: data?.generated ?? null } : now));
        } catch (error) {
          setGen((now) => (now ? { ...now, busy: false, error: String(error?.message ?? error) } : now));
        }
      };
      const useGen = () => {
        const made = gen?.result;
        if (!made) return;
        setText(made.instructions);
        origin.current = { by: 'model', note: made.model, text: made.instructions, mark: made.mark };
        setGen(null);
        setNote({ text: t('gen.used'), tone: '' });
      };
      const putBack = (version) => {
        setText(version.text);
        origin.current = { by: version.by, note: version.note, text: version.text, mark: undefined };
        setShowVersions(false);
        setNote({ text: t('ver.backed'), tone: '' });
      };
      const rename = async () => {
        const next = name.trim();
        if (!next || next === ws.title) return;
        try { await appCtx.get('workspaces').rename(ws.workspaceId, next); setNote({ text: '', tone: '' }); } catch (error) { fail(error); }
      };
      const setTab = async (tab) => {
        try { await projects.save(path, { tab }); } catch (error) { fail(error); }
      };
      const add = async (list) => {
        const picked = Array.from(list ?? []).filter((file) => file && typeof file.name === 'string');
        if (picked.length === 0) return;
        setBusy(true);
        const done = [];
        try {
          for (const file of picked) {
            const data = await projects.upload(path, file);
            if (data?.saved) done.push(data.saved);
            if (data?.files) setFiles(data.files);
          }
          setNote({ text: t('proj.page.files.added', { names: done.join(', ') }), tone: '' });
        } catch (error) {
          fail(error);
        } finally {
          setBusy(false);
          void loadFiles();
        }
      };
      const start = (prompt) => {
        try { appCtx.layout.selectPanel(null); } catch { /* already there */ }
        const tab = record?.tab;
        if (tab && tab !== state.selected) {
          const mode = tabsOf(state).find((m) => m.id === tab);
          if (mode) void model.select(mode.id, mode.label);
        }
        startLocked(appCtx, tab || state.selected, ws.workspaceId, prompt ? { prompt, whenDraftExists: 'replace' } : undefined);
      };
      const archived = new Set(lib.archived);
      const convs = (ws.sessionIds ?? [])
        .filter((id) => lib.byId[id] && lib.byId[id].origin !== 'subagent' && !lib.byId[id].blank && !archived.has(id))
        .sort((a, b) => (lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0));
      const tabChoices = tabsOf(state).filter((m) => m.id !== 'chat');

      // Types are Cowork's: the other tabs have their own instructions and tools.
      const presets = Array.isArray(meta.presets) ? meta.presets : [];
      const typed = (record?.tab || state.selected) === 'cowork' && presets.length > 0;
      const currentType = presets.find((preset) => preset.id === (record?.preset || 'blank')) ?? presets[0];
      const fresh = !record?.preset && !(record?.instructions ?? '').trim();
      const applyType = async (preset, withText) => {
        try {
          const data = await projects.save(path, withText ? { preset: preset.id, instructions: preset.instructions, by: 'type', note: preset.name } : { preset: preset.id });
          if (Array.isArray(data?.versions)) setVersions(data.versions);
          if (withText) setText(preset.instructions);
          setPending(null);
          setNote({ text: withText ? (preset.instructions ? t('type.applied', { name: preset.name }) : t('type.blank')) : t('type.only', { name: preset.name }), tone: '' });
        } catch (error) { fail(error); }
      };
      const pickType = (preset) => {
        if (preset.id === currentType?.id && record?.preset) { setPending(null); return; }
        // Nothing of the user's own would be lost: no instructions yet, or the current type's, untouched.
        const mine = text.trim();
        const untouched = mine === '' || (mine === (currentType?.instructions ?? '').trim() && mine === (record?.instructions ?? '').trim());
        if (untouched) void applyType(preset, true);
        else setPending(preset);
      };
      const removeType = async (preset) => {
        if (!(await askInPage({ text: t('type.remove.sure', { name: preset.name }), ok: 'Remove', danger: true }))) return;
        try { await projects.presetRemove(preset.id); setPending(null); setNote({ text: t('type.removed'), tone: '' }); } catch (error) { fail(error); }
      };
      const keepAs = async () => {
        const label = (keepName ?? '').trim();
        if (!label || !text.trim()) return;
        try {
          const data = await projects.presetSave({ name: label, description: '', tools: currentType?.tools ?? [], searchOff: currentType?.searchOff === true, instructions: text });
          // The project is of that type from now on, and its instructions are saved with it.
          await projects.save(path, { preset: data?.saved, instructions: text });
          setKeepName(null);
          setNote({ text: t('type.keepas.done', { name: label }), tone: '' });
        } catch (error) { fail(error); }
      };

      return h(PageFrame, {
        title: ws.title || t('untitled'), hint: path,
        actions: h('span', { className: 'cws-inline' },
          h('button', { type: 'button', className: 'cws-btn', 'data-cws-all-projects': '', onClick: () => projects.focus(null) }, '‹ ' + t('projects.all')),
          h('button', { type: 'button', className: 'cws-btn', onClick: () => start('') }, t('proj.page.newconv'))),
      },
      note.text ? h('div', { className: 'cws-msg', 'data-tone': note.tone, role: 'status' }, note.text) : null,
      h('div', { className: 'cws-card' },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-inline' },
            h('input', { value: name, 'aria-label': t('proj.page.name'), onChange: (e) => setName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') void rename(); } }),
            h('button', { type: 'button', className: 'cws-btn', onClick: () => void rename(), disabled: !name.trim() || name.trim() === ws.title }, t('proj.page.rename')),
            h('span', { className: 'cws-note' }, t('proj.page.tab')),
            h('select', { value: record?.tab || state.selected, 'aria-label': t('proj.page.tab'), onChange: (e) => void setTab(e.target.value) },
              tabChoices.map((m) => h('option', { key: m.id, value: m.id }, m.label)))))),
      typed ? h('div', { className: 'cws-card' },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-sec-head' }, h('h2', null, fresh ? t('type.title.new') : t('type.title')),
            currentType?.own && !pending ? h('button', { type: 'button', className: 'cws-btn', onClick: () => void removeType(currentType) }, t('type.remove')) : null),
          h('p', { className: 'cws-note', style: { margin: 0 } }, t('type.hint')),
          h('div', { className: 'cws-types', role: 'group', 'aria-label': t('type.title') }, presets.map((preset) => h('button', {
            key: preset.id, type: 'button', className: 'cws-type', 'aria-pressed': (pending ? pending.id : currentType?.id) === preset.id, onClick: () => pickType(preset),
          }, h('b', null, preset.name, preset.own ? h('i', null, t('type.own')) : null), preset.description ? h('span', null, preset.description) : null))),
          pending ? h('div', { className: 'cws-preview' },
            h('div', { className: 'cws-note' }, t('type.preview', { name: pending.name })),
            pending.instructions ? h('pre', null, pending.instructions) : null,
            h('div', { className: 'cws-inline' },
              h('button', { type: 'button', className: 'cws-btn', onClick: () => void applyType(pending, true) }, t('type.replace')),
              h('button', { type: 'button', className: 'cws-btn', onClick: () => void applyType(pending, false) }, t('type.keep')),
              h('button', { type: 'button', className: 'cws-btn', onClick: () => setPending(null) }, t('type.cancel')))) : null,
          !pending ? (currentType?.tools ?? []).map((tool) => h('p', { key: tool, className: 'cws-note', style: { margin: 0 } }, t(`type.tool.${tool}.${meta.shared?.[tool] ? 'on' : 'off'}`))) : null,
          !pending && currentType?.searchOff ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('type.search.off')) : null)) : null,
      h('div', { className: 'cws-card' },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-sec-head' }, h('h2', null, t('proj.page.instr')),
            h('button', { type: 'button', className: 'cws-btn', onClick: () => void saveText(), disabled: text === (record?.instructions ?? '') }, t('proj.page.save'))),
          h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.instr.hint')),
          h('textarea', { className: 'cws-area', value: text, maxLength: 12000, placeholder: t('proj.page.instr.place'), 'aria-label': t('proj.page.instr'), onChange: (e) => setText(e.target.value) }),
          drifted && !gen ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('gen.drift', { added: drifted.added, removed: drifted.removed })) : null,
          keepName === null ? h('div', { className: 'cws-inline' },
            typed && !gen ? h('button', { type: 'button', className: 'cws-btn', onClick: openGen }, t('gen.open')) : null,
            typed && text.trim() ? h('button', { type: 'button', className: 'cws-btn', title: t('type.keepas.hint'), onClick: () => setKeepName('') }, t('type.keepas')) : null,
            versions.length > 1 ? h('button', { type: 'button', className: 'cws-btn', 'aria-expanded': showVersions, onClick: () => setShowVersions(!showVersions) }, t('ver.open', { n: versions.length - 1 })) : null) : null,
          showVersions ? h('div', { className: 'cws-preview' },
            h('div', { className: 'cws-note' }, t('ver.title')),
            versions.map((version, index) => h('div', { key: version.at, className: 'cws-ver' },
              h('span', null, new Date(version.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), ' · ', t(`ver.by.${version.by}`), version.note ? ` (${version.note})` : ''),
              h('span', { title: version.text.slice(0, 600) }, version.text.replace(/\s+/g, ' ').slice(0, 140)),
              index === 0 && version.text === (record?.instructions ?? '').trim() ? h('span', { className: 'cws-note' }, t('ver.current'))
                : h('button', { type: 'button', className: 'cws-btn', onClick: () => putBack(version) }, t('ver.back'))))) : null,
          gen ? h(GeneratePanel, { t, gen, setGen, catalog, current: text, onRun: () => void runGen(), onUse: useGen }) : null,
          typed && text.trim() && keepName !== null ? (
            h('div', { className: 'cws-inline' },
              h('input', { value: keepName, maxLength: 40, placeholder: t('type.keepas.name'), 'aria-label': t('type.keepas.name'), autoFocus: true, onChange: (e) => setKeepName(e.target.value), onKeyDown: (e) => { if (e.key === 'Enter') void keepAs(); if (e.key === 'Escape') setKeepName(null); } }),
              h('button', { type: 'button', className: 'cws-btn', disabled: !keepName.trim(), onClick: () => void keepAs() }, t('type.keepas.save')),
              h('button', { type: 'button', className: 'cws-btn', onClick: () => setKeepName(null) }, t('type.cancel')))) : null)),
      h('div', {
        className: 'cws-card cws-drop', 'data-over': over ? 'true' : undefined,
        onDragOver: (e) => { e.preventDefault(); setOver(true); },
        onDragLeave: () => setOver(false),
        onDrop: (e) => { e.preventDefault(); setOver(false); void add(e.dataTransfer?.files); },
      },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-sec-head' }, h('h2', null, t('proj.page.files')),
            h('button', { type: 'button', className: 'cws-btn', disabled: busy, onClick: () => picker.current?.click() }, busy ? t('proj.page.files.busy') : t('proj.page.files.add'))),
          h('input', { ref: picker, type: 'file', multiple: true, hidden: true, onChange: (e) => { const list = e.target.files; void add(list).then(() => { e.target.value = ''; }); } }),
          h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.files.hint')),
          files.files.length === 0 ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.files.none'))
            : h('div', { className: 'cws-filelist' }, files.files.map((file) => h('div', { key: file.name, className: 'cws-file' },
              h('span', { title: file.name }, file.name), h('span', null, sizeText(file.size)), h('span', null, ago(t, file.modified))))),
          files.more ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.files.more', { n: files.files.length })) : null)),
      h('div', { className: 'cws-card' },
        h('div', { className: 'cws-sec' },
          h('div', { className: 'cws-sec-head' }, h('h2', null, t('proj.page.convs'))),
          convs.length === 0 ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('proj.page.convs.none'))
            : h('div', { className: 'cws-filelist' }, convs.map((id) => {
              const title = (lib.byId[id].displayTitle && String(lib.byId[id].displayTitle).trim()) || t('untitled');
              return h('div', { key: id, className: 'cws-file' },
                h('button', { type: 'button', title, onClick: () => { try { appCtx.layout.selectPanel(null); } catch { /* */ } appCtx.get('uiWorkspace').openSession(id); } }, title),
                h('span', null, ago(t, lib.byId[id].updatedAt)));
            })))));
    }

    /** The trash of deleted conversations, read from and changed through this add-on's host route. */
    function createTrash() {
      const url = () => new URL('dsh-cowork-shell/trash', document.baseURI);
      let snapshot = { items: [], keepMs: 0, wiping: [] };
      const listeners = new Set();
      const install = (data) => {
        snapshot = { items: Array.isArray(data?.items) ? data.items : [], keepMs: Number(data?.keepMs) || 0, wiping: Array.isArray(data?.wiping) ? data.wiping.map(String) : [] };
        for (const listener of listeners) listener();
      };
      const call = async (init) => {
        const response = await fetch(url(), { headers: { accept: 'application/json', ...(init ? { 'content-type': 'application/json' } : {}) }, ...init });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(String(data?.error ?? response.status));
        install(data);
        return data;
      };
      const post = (action, sessionId, title, where) => call({ method: 'POST', body: JSON.stringify({ action, sessionId, title, ...(where?.tab ? { tab: where.tab } : {}), ...(where?.fallbackTab ? { fallbackTab: where.fallbackTab } : {}), ...(where?.back === 'list' ? { back: 'list' } : {}) }) });
      let timer;
      return {
        get: () => snapshot,
        subscribe: (listener) => {
          listeners.add(listener);
          if (listeners.size === 1) timer = dshPoll.loop(() => call().catch(() => {}), { every: 60000 });
          return () => { listeners.delete(listener); if (listeners.size === 0) timer?.stop(); };
        },
        /** `where`: `{tab, fallbackTab}`, the tab it is deleted from (only that tab's Trash list shows it) and the tab its folder gives. */
        remove: (id, title, where) => post('delete', id, title, where),
        /** Put back or delete permanently one row: a conversation, or a whole group row (`row.kind === 'group'`). */
        restore: (row) => (row?.kind === 'group' ? call({ method: 'POST', body: JSON.stringify({ action: 'restore', itemId: row.id }) }) : post('restore', row?.id ?? row)),
        // A row is erased as the list showed it (its runs and pieces then), never what came in since.
        erase: (row) => (row?.kind === 'group' ? call({ method: 'POST', body: JSON.stringify({ action: 'erase', itemId: row.id, ids: row.ids ?? [], pieces: row.pieces ?? [] }) }) : post('erase', row?.id ?? row)),
        /** Empty trash: delete permanently the rows one tab's list showed (conversations and group rows). */
        empty: (ids) => {
          const rows = new Map(snapshot.items.filter((item) => item?.kind === 'group').map((item) => [item.id, item]));
          const sessionIds = ids.filter((id) => !rows.has(id));
          const itemIds = ids.filter((id) => rows.has(id));
          const shown = Object.fromEntries(itemIds.map((id) => [id, { ids: rows.get(id).ids ?? [], pieces: rows.get(id).pieces ?? [] }]));
          return call({ method: 'POST', body: JSON.stringify({ action: 'empty', ...(sessionIds.length ? { sessionIds } : {}), ...(itemIds.length ? { itemIds, shown } : {}) }) });
        },
        /** Ask again now, for example when a conversation was just archived (Recon's End and wipe). */
        refresh: () => call(),
      };
    }

    const LIST_KEY = 'dsh-cowork-shell.listAll';
    const LAST_KEY = 'dsh-cowork-shell.lastOpen';
    /** Tab id -> the conversation last open in that tab. Kept in this browser only. */
    function readLast() {
      try {
        const value = JSON.parse(window.localStorage.getItem(LAST_KEY) || '{}');
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
      } catch { return {}; }
    }
    function writeLast(tab, id) {
      try {
        const all = readLast();
        if (all[tab] === id) return;
        window.localStorage.setItem(LAST_KEY, JSON.stringify({ ...all, [tab]: id }));
      } catch { /* private mode: tabs then open their start page */ }
    }
    /**
     * Whether a tab may open again the conversation it remembers: only one of its own. Tabs that start
     * in the same place share the app's one empty draft there, so the draft one tab remembers can get
     * its first message in another tab (a Scout research run stayed on screen in Chat and Finance).
     * An empty draft, or one whose mode is not recorded or not a shown tab, opens as before.
     */
    function reopensIn(tabId, id, session, state, tabIds) {
      if (!session) return false;
      if (session.blank) return true;
      const recorded = state?.sessionModes?.[id];
      return !(typeof recorded === 'string' && tabIds.includes(recorded) && recorded !== tabId);
    }

    function ago(t, ms) {
      if (!Number.isFinite(ms)) return '';
      const s = Math.max(0, (Date.now() - ms) / 1000);
      if (s < 60) return t('ago.now');
      if (s < 3600) return t('ago.m', { n: Math.floor(s / 60) });
      if (s < 86400) return t('ago.h', { n: Math.floor(s / 3600) });
      return t('ago.d', { n: Math.floor(s / 86400) });
    }

    /**
     * Which tab a conversation belongs to: its recorded mode when there is one; an empty new conversation
     * follows the open tab; otherwise a guess from where it lives: no project = Chat, the app's default
     * workspace = Cowork, any other project folder = Code.
     */
    function tabOfSession(id, session, workspace, state, tabIds) {
      const recorded = state.sessionModes?.[id];
      if (typeof recorded === 'string' && tabIds.includes(recorded)) return recorded;
      if (session?.blank) return state.selected;
      const guess = guessTab(workspace);
      return tabIds.includes(guess) ? guess : tabIds[0];
    }

    /**
     * The Chat tab's one list: the tab's conversations in its projects, in Scratch and anywhere else, sorted
     * once (pinned first, then newest). Scratch is where a new chat starts, so it must be in the list.
     */
    function chatListIds(sortRows, projects, scratchRows, loose) {
      return sortRows([...projects.flatMap((p) => p.ids), ...scratchRows, ...loose]);
    }

    /** The tab a conversation's folder suggests: no project = Chat, the app's default workspace = Cowork, any other = Code. */
    function guessTab(workspace) {
      if (!workspace) return 'chat';
      if (/(^|\/)default-workspace\/?$/.test(String(workspace.path ?? '')) || workspace.title === 'default-workspace') return 'cowork';
      return 'code';
    }

    /**
     * Which tab's Trash list shows a deleted conversation: the tab it was deleted from (or, for one
     * deleted before 0.58.0, its recorded tab). While that tab is not shown, the tab its folder gives,
     * else the first tab, as the Archived list does. Every tab (null) when its tab cannot be told, so
     * nothing deleted is out of reach.
     */
    function trashTab(item, state, tabIds) {
      // Item 4A, stage 3a: with the space buttons, `tabIds` are the shown spaces and the space decides.
      if (state?.spacesOn) return trashSpace(item, state, tabIds);
      const known = [item?.tab, state?.sessionModes?.[item?.id]].find((tab) => typeof tab === 'string' && tab !== '');
      if (known === undefined) return null;
      if (tabIds.includes(known)) return known;
      if (typeof item?.fallbackTab === 'string' && tabIds.includes(item.fallbackTab)) return item.fallbackTab;
      return tabIds[0] ?? null;
    }

    /**
     * What one or more Trash rows hold, in words for a question: "3 conversations", "1 conversation",
     * "its saved settings", or both. An ordinary row counts as one conversation.
     */
    function rowContents(items, t) {
      const list = Array.isArray(items) ? items : [items];
      const conversations = list.reduce((sum, item) => sum + (item?.kind === 'group' ? Number(item.count) || 0 : 1), 0);
      const saved = list.some((item) => Number(item?.data) > 0);
      const folders = list.some((item) => Number(item?.folders) > 0);
      const parts = [];
      if (conversations > 0) parts.push(conversations === 1 ? t('trash.count.one') : t('trash.count', { n: conversations }));
      if (saved) parts.push(t('trash.data.its'));
      if (folders) parts.push(t('trash.folder.its'));
      return parts.join(t('trash.and'));
    }

    /** A group row's second line: how many conversations, the dates they span, and saved settings. */
    function groupSummary(item, t) {
      const n = Number(item?.count) || 0;
      const parts = [];
      if (n > 0) parts.push(n === 1 ? t('trash.count.one') : t('trash.count', { n }));
      const day = (ms) => (Number(ms) > 0 ? new Date(Number(ms)).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }) : '');
      const from = day(item?.firstAt);
      const to = day(item?.deletedAt);
      if (from && to) parts.push(from === to ? from : `${from} – ${to}`);
      if (Number(item?.data) > 0) parts.push(t('trash.data'));
      if (Number(item?.folders) > 0) parts.push(t('trash.folder'));
      return parts.join(' · ');
    }

    /**
     * What Empty trash erases from a tab's Trash list: the rows that belong to this tab, except those
     * already being deleted. Rows whose tab is not known show in every tab and are left (one at a time).
     */
    function emptyIds(items, state, tabIds, selectedId) {
      return (Array.isArray(items) ? items : [])
        .filter((item) => item && item.erasing !== true && item.newer !== true && typeof item.id === 'string' && trashTab(item, state, tabIds) === selectedId)
        .map((item) => item.id);
    }

    /**
     * Empty trash for one tab: one question that names how many (and how many older rows, listed in
     * every tab, it leaves), then the ids in parts of at most `batch`. Never throws.
     * @returns {Promise<{asked: boolean, sent: string[], failed: number}>} what happened.
     */
    async function runEmpty(options) {
      const { items, state, tabIds, selectedId, ask, send, start, t, batch = 2000 } = options;
      const ids = emptyIds(items, state, tabIds, selectedId);
      if (ids.length === 0) return { asked: false, sent: [], failed: 0 };
      const untold = (Array.isArray(items) ? items : []).filter((item) => item && item.erasing !== true && trashTab(item, state, tabIds) === null).length;
      // With a group row among them (old runs of an automation, for example) the question counts rows
      // and the conversations in them; otherwise today's words.
      const chosen = (Array.isArray(items) ? items : []).filter((item) => item && ids.includes(item.id));
      const grouped = chosen.some((item) => item.kind === 'group');
      let question = grouped
        ? t(ids.length === 1 ? 'trash.empty.confirm.rows.one' : 'trash.empty.confirm.rows', { n: ids.length, what: rowContents(chosen, t) })
        : t(ids.length === 1 ? 'trash.empty.confirm.one' : 'trash.empty.confirm', { n: ids.length });
      if (untold > 0) question += '\n\n' + t(untold === 1 ? 'trash.empty.untold.one' : 'trash.empty.untold', { n: untold });
      if (!(await ask(question))) return { asked: true, sent: [], failed: 0 };
      start?.();
      const sent = [];
      let failed = 0;
      for (let at = 0; at < ids.length; at += batch) {
        const part = ids.slice(at, at + batch);
        try {
          const data = await send(part);
          sent.push(...part);
          failed += Number(data?.emptied?.failed) || 0;
        } catch {
          // This part and the rest were not erased.
          failed += ids.length - at;
          break;
        }
      }
      return { asked: true, sent, failed };
    }

    /** Whether the open tab's Trash list shows this deleted conversation (one with no known tab shows everywhere). */
    function inTabTrash(item, state, tabIds, selectedId) {
      const tab = trashTab(item, state, tabIds);
      return tab === null || tab === selectedId;
    }

    /** The app's default workspace (the folder Chat lives in), or null when there is none. */
    function defaultWorkspace(workspaces) {
      return (Array.isArray(workspaces) ? workspaces : []).find((ws) => ws
        && (/(^|[\\/])default-workspace[\\/]?$/.test(String(ws.path ?? '')) || ws.title === 'default-workspace')) ?? null;
    }

    /** The app's own mention of another conversation, as its chat box and server read it. */
    function sessionMention(id, title) {
      const bytes = new TextEncoder().encode(JSON.stringify(String(id)));
      let binary = '';
      for (const b of bytes) binary += String.fromCharCode(b);
      const payload = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      // The chat box only shows a mention as a chip when its label has no brackets.
      const label = String(title).replace(/[\[\]\\\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'chat';
      return `@[${label}](dsh-session:${payload})`;
    }

    /**
     * The `⋯` menu of a conversation or project: move it to another tab. On the Chat tab (`promote`) the
     * entries read "Promote to …", and `onContinue` adds "Continue in a project…", a second pane that
     * lists the projects and starts a new conversation there.
     */
    /**
     * Round 2: where a row's ⋯ menu goes so it is always whole on screen. It is drawn in the page body (fixed), so the
     * scroll box cannot clip it: below the button when it fits above the lower edge of the scroll box and of the window,
     * else above it when that fits, else on the side with more room, made shorter to fit (it scrolls inside). Its right
     * edge lines up with the button's, kept inside the window.
     * @param {{top: number, bottom: number, left: number, right: number}} button - the ⋯ button's box.
     * @param {{width: number, height: number}} pop - the menu's size.
     * @param {{top: number, bottom: number} | null} box - the scroll box's box (null: the window alone).
     * @param {{width: number, height: number}} win - the window's size.
     * @returns {{top?: number, bottom?: number, left: number, maxHeight: number, up: boolean}}
     */
    function menuPlace(button, pop, box, win) {
      const gap = 4;
      const edge = 8;
      const low = Math.min(win.height - edge, box ? Math.max(box.bottom, button.bottom + gap) : win.height - edge);
      const high = Math.max(edge, box ? Math.min(box.top, button.top - gap) : edge);
      const below = low - (button.bottom + gap);
      const above = (button.top - gap) - high;
      const left = Math.max(edge, Math.min(button.right - pop.width, win.width - edge - pop.width));
      if (pop.height <= below) return { top: button.bottom + gap, left, maxHeight: Math.max(120, win.height - edge - button.bottom - gap), up: false };
      if (pop.height <= above || above > below) {
        const room = Math.max(120, button.top - gap - edge);
        return { bottom: win.height - button.top + gap, left, maxHeight: room, up: true };
      }
      return { top: button.bottom + gap, left, maxHeight: Math.max(120, win.height - edge - button.bottom - gap), up: false };
    }

    function MoveMenu({ t, tabs, current, onMove, label, promote, projects, onContinue, extra, keep = false }) {
      const [open, setOpen] = useState(false);
      const [pane, setPane] = useState('root');
      const buttonRef = useRef(null);
      const popRef = useRef(null);
      const [place, setPlace] = useState(null);
      // Round 2: measured after each draw (the projects pane is taller), so the menu never runs off the scroll box or window.
      useLayoutEffectSafe(() => {
        if (!open) { setPlace(null); return undefined; }
        const measure = () => {
          const button = buttonRef.current?.getBoundingClientRect();
          const pop = popRef.current;
          if (!button || !pop) return;
          const scroller = buttonRef.current.closest('.cws-scroll');
          const next = menuPlace(button, { width: pop.offsetWidth, height: pop.scrollHeight }, scroller ? scroller.getBoundingClientRect() : null, { width: window.innerWidth, height: window.innerHeight });
          setPlace((was) => (was && was.top === next.top && was.bottom === next.bottom && was.left === next.left && was.maxHeight === next.maxHeight ? was : next));
        };
        measure();
        // The list scrolls under a fixed menu: close it rather than leave it beside the wrong row.
        const scroller = buttonRef.current?.closest('.cws-scroll');
        const close = () => setOpen(false);
        scroller?.addEventListener('scroll', close, { passive: true });
        window.addEventListener('resize', close);
        return () => { scroller?.removeEventListener('scroll', close); window.removeEventListener('resize', close); };
      }, [open, pane, (projects ?? []).length]);
      const targets = tabs.filter((m) => m.id !== current);
      const [as, setAs] = useState(() => (targets.find((m) => m.id === 'code') ?? targets[targets.length - 1])?.id);
      useEffect(() => {
        if (!open) { setPane('root'); return undefined; }
        const close = () => setOpen(false);
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('pointerdown', close);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', onKey); };
      }, [open]);
      const asMode = targets.find((m) => m.id === as) ?? targets[targets.length - 1];
      const root = () => h(React.Fragment, null,
        targets.map((m) => h('button', {
          key: m.id, type: 'button', role: 'menuitem', className: 'cws-moveitem',
          onClick: (e) => { e.stopPropagation(); setOpen(false); onMove(m.id); },
        }, t(promote ? 'promote.to' : 'move.to', { tab: m.label }))),
        onContinue && asMode ? h(React.Fragment, null,
          h('div', { className: 'cws-movesep', role: 'separator' }),
          h('button', { type: 'button', role: 'menuitem', className: 'cws-moveitem', 'aria-haspopup': 'menu', title: keep ? t('keep.hint') : undefined, onClick: (e) => { e.stopPropagation(); setPane('projects'); } }, t(keep ? 'keep.open' : 'continue.open'))) : null,
        (extra ?? []).length > 0 ? h(React.Fragment, null,
          h('div', { className: 'cws-movesep', role: 'separator' }),
          extra.map((item) => h('button', {
            key: item.key, type: 'button', role: 'menuitem', className: 'cws-moveitem',
            onClick: (e) => { e.stopPropagation(); setOpen(false); item.run(); },
          }, item.label))) : null);
      const projectPane = () => h(React.Fragment, null,
        h('div', { className: 'cws-movehead' },
          h('button', { type: 'button', className: 'cws-link', onClick: (e) => { e.stopPropagation(); setPane('root'); } }, '‹ ' + t('continue.back')),
          h('span', null, t(keep ? 'keep.title' : 'continue.title'))),
        targets.length > 1 ? h('div', { className: 'cws-moveas', role: 'group', 'aria-label': t('continue.as') },
          h('span', null, t('continue.as')),
          targets.map((m) => h('button', { key: m.id, type: 'button', 'aria-pressed': m.id === asMode.id, onClick: (e) => { e.stopPropagation(); setAs(m.id); } }, m.label))) : null,
        h('div', { className: 'cws-movelist' },
          (projects ?? []).length === 0 ? h('p', { className: 'cws-lib-empty' }, t('continue.none')) : null,
          (projects ?? []).map((ws) => h('button', {
            key: ws.workspaceId, type: 'button', role: 'menuitem', className: 'cws-moveitem', title: ws.path || ws.title || '',
            onClick: (e) => { e.stopPropagation(); setOpen(false); onContinue(ws, asMode); },
          }, ws.title || ws.path || t('untitled')))));
      const popStyle = place
        ? { position: 'fixed', top: place.top ?? 'auto', bottom: place.bottom ?? 'auto', left: place.left, right: 'auto', maxHeight: place.maxHeight, overflowY: 'auto', visibility: 'visible' }
        : { position: 'fixed', top: 0, left: 0, right: 'auto', visibility: 'hidden' };
      const pop = h('div', { ref: popRef, className: 'cws-movepop', role: 'menu', 'data-up': place?.up ? 'true' : undefined, style: popStyle, onPointerDown: (e) => e.stopPropagation() }, pane === 'projects' ? projectPane() : root());
      return h('span', { className: 'cws-move', onPointerDown: (e) => e.stopPropagation() },
        h('button', {
          ref: buttonRef, type: 'button', className: 'cws-mini', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': open, title: label,
          onClick: (e) => { e.stopPropagation(); setOpen((v) => !v); },
        }, '⋯'),
        open ? (ReactDOM && typeof ReactDOM.createPortal === 'function' && document.body ? ReactDOM.createPortal(pop, document.body) : pop) : null);
    }

    /** The open tab's conversations: one flat list on the Chat tab, grouped under their projects elsewhere. */
    function TabLibrary({ appCtx, model, library, trash, projectStore, tabs, selected, onShowAll }) {
      const t = appCtx.locale.bind(NS);
      const meta = useSyncExternalStore(projectStore.subscribe, projectStore.get);
      const state = useSyncExternalStore(model.subscribe, model.get);
      // Item 4A, stage 3a: with the space buttons `selected` is a space; `key` is the tab it stands for (starts, locks).
      const spacesOn = state.spacesOn === true;
      const key = spacesOn ? SPACE_TAB[selected.id] : selected.id;
      // Projects that were given to this tab (space) show here even before their first conversation.
      // Item 4A, stage 3b: with spaces Chat lists its projects as folders too, so projects given to it show here as well.
      const assigned = new Set(selected.id === 'chat' && !spacesOn ? [] : meta.projects.filter((item) => (spacesOn ? spaceOfProjectEntry(item) : item.tab) === selected.id).map((item) => item.workspaceId));
      const lib = useSyncExternalStore(library.subscribe, library.get);
      const bin = useSyncExternalStore(trash.subscribe, trash.get);
      // When the archived list changes (Recon's End and wipe archives the conversation it ends), ask the
      // trash again at once, so that conversation shows "Being deleted" instead of Restore and Delete.
      const archivedKey = (lib.archived ?? []).join(',');
      useEffect(() => { void trash.refresh?.().catch(() => {}); }, [archivedKey]);
      // A deleted conversation is hidden at once, also while its files have not moved yet.
      const deleted = new Set(bin.items.flatMap((item) => [item.id, ...(Array.isArray(item.ids) ? item.ids : [])]));
      const [open, setOpen] = useState({});
      const [more, setMore] = useState({});
      // Empty trash is running (the button waits).
      const [emptying, setEmptying] = useState(false);
      // Search inside this tab: titles as the user types, and the text of messages after Enter.
      const [find, setFind] = useState('');
      const [textHits, setTextHits] = useState(null);
      const [findNote, setFindNote] = useState('');
      // Several conversations picked with Cmd-click or Shift-click, and the right-click menu.
      const [picked, setPicked] = useState(() => new Set());
      const [menu, setMenu] = useState(null);
      const lastPick = useRef(null);
      const [hasGlobal, setHasGlobal] = useState(() => window.__dshGlobalSearch === true);
      useEffect(() => {
        const update = () => setHasGlobal(window.__dshGlobalSearch === true);
        window.addEventListener('dsh-search:ready', update);
        return () => window.removeEventListener('dsh-search:ready', update);
      }, []);
      // Another tab starts clean.
      useEffect(() => { setFind(''); setTextHits(null); setFindNote(''); setPicked(new Set()); setMenu(null); }, [selected.id]);
      useEffect(() => {
        if (!menu) return undefined;
        const close = (event) => { if (!(event.target instanceof Element) || !event.target.closest('.cws-ctx')) setMenu(null); };
        const onKey = (event) => { if (event.key === 'Escape') setMenu(null); };
        window.addEventListener('mousedown', close, true);
        window.addEventListener('keydown', onKey, true);
        return () => { window.removeEventListener('mousedown', close, true); window.removeEventListener('keydown', onKey, true); };
      }, [menu]);
      const findWords = find.toLowerCase().split(/\s+/).filter(Boolean);
      const titleOfId = (id) => String(lib.byId[id]?.displayTitle ?? '').toLowerCase();
      const shows = (id) => findWords.length === 0 || findWords.every((word) => titleOfId(id).includes(word)) || (textHits ? textHits.has(id) : false);
      // Which tab a conversation belongs to is decided on the usual order (see usualTabsOf); with spaces, by its space.
      const tabIds = spacesOn ? tabs.map((m) => m.id) : usualTabsOf(state).map((m) => m.id);
      /** Where a thread is listed: its space (item 4A), else its tab. */
      const placeOf = (id, sess, ws) => (spacesOn ? spaceOfSession(id, sess, ws, state) : tabOfSession(id, sess, ws, state, tabIds));
      const uw = (() => { try { return appCtx.get('uiWorkspace'); } catch { return null; } })();

      const archived = new Set(lib.archived);
      const pinned = new Set(lib.pinned);
      const placed = new Set();
      // An empty new conversation shows only while it is the open one.
      const sortRows = (ids) => ids
        .filter((id) => lib.byId[id] && lib.byId[id].origin !== 'subagent' && !archived.has(id) && !deleted.has(id) && (!lib.byId[id].blank || id === lib.currentId) && shows(id))
        .sort((a, b) => (pinned.has(b) - pinned.has(a)) || ((lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0)));

      /** Each conversation's project, for Show in Finder. */
      const homeOf = {};
      for (const ws of lib.workspaces) for (const id of ws.sessionIds ?? []) homeOf[id] = ws;
      /** The tab a conversation shows in now and the tab its folder gives: kept with it when it is deleted. */
      // With spaces, the space is kept as the tab that stands for it (SPACE_TAB), so the trash file keeps tab ids.
      const tabOf = (id) => {
        const place = placeOf(id, lib.byId[id], homeOf[id] ?? null);
        return { tab: spacesOn ? SPACE_TAB[place] ?? place : place, fallbackTab: guessTab(homeOf[id] ?? null) };
      };
      /**
       * Move to: a conversation that began in Recon opens as a new conversation of the picked tab, with the
       * Recon one and its own files (moveOutOfRecon); the original stays in Recon. Any other moves as before.
       */
      const moveTo = async (ids, modeId, whole) => {
        const fromRecon = modeId === 'recon' ? [] : ids.filter((id) => fromReconRow(id, lib.byId[id], state));
        // With spaces, a thread out of Recon opens anew in the space's own tab (its start place, its preset lock).
        const outTab = spacesOn ? SPACE_TAB[modeId] ?? modeId : modeId;
        // Review B1: a whole project of Recon conversations is never moved at once; each needs its own preview.
        if (fromRecon.length > 1 || (whole === true && fromRecon.length > 0)) { model.fail(t('move.reconProject')); return; }
        const rest = ids.filter((id) => !fromRecon.includes(id));
        if (rest.length > 0) await model.move(rest, modeId);
        for (const id of fromRecon) {
          try {
            const done = await moveOutOfRecon(appCtx, library, model, id, outTab);
            if (done.cancelled) { model.note(t('move.reconCancelled')); continue; }
            model.note(t(done.drafted ? (done.files > 0 ? 'move.reconDraftFiles' : 'move.reconDraft') : done.files > 0 ? 'move.reconFiles' : 'move.recon', { tab: done.label, n: done.files }));
          } catch (problem) {
            model.fail(t('move.reconFailed', { why: String(problem?.message ?? problem).slice(0, 200) }));
          }
        }
      };
      // This tab's own Trash list (each tab lists only what was deleted from it).
      const binHere = bin.items.filter((item) => inTabTrash(item, state, tabIds, selected.id));
      const projects = [];
      for (const ws of lib.workspaces) {
        // The Scratch project is not listed; its threads show under 'Other conversations' of their tab.
        if (hidden.has(roomKey(ws.path))) continue;
        const ids = sortRows(ws.sessionIds ?? []);
        for (const id of ws.sessionIds ?? []) placed.add(id);
        const mine = ids.filter((id) => placeOf(id, lib.byId[id], ws) === selected.id);
        if (mine.length > 0 || assigned.has(ws.workspaceId)) projects.push({ ws, ids: mine, all: ids, latest: mine.length > 0 ? Math.max(...mine.map((id) => lib.byId[id].updatedAt ?? 0)) : (Date.parse(ws.updatedAt ?? '') || 0) });
      }
      projects.sort((a, b) => b.latest - a.latest);
      const unplaced = sortRows(Object.keys(lib.byId).filter((id) => !placed.has(id)))
        .filter((id) => placeOf(id, lib.byId[id], null) === selected.id);
      // Scratch (step 37): its own group, in place of 'Other conversations' for Scratch threads (and copies
      // that work in a thread's folder). Decided by folder, so a Rerun copy of a project conversation stays apart.
      const isScratchRow = (id) => hidden.has(roomKey(homeOf[id]?.path)) || inScratch(lib.byId[id]?.cwd);
      const scratchRows = unplaced.filter(isScratchRow);
      const loose = unplaced.filter((id) => !isScratchRow(id));

      // A conversation's tab is recorded at its first message; read it right away, so the row does not
      // drop out of its tab until the next 10-second refresh.
      const openBlank = lib.currentId ? !!lib.byId[lib.currentId]?.blank : null;
      useEffect(() => {
        if (openBlank !== false) return undefined;
        void model.refresh();
        const timer = setTimeout(() => void model.refresh(), 1500);
        return () => clearTimeout(timer);
      }, [lib.currentId, openBlank, model]);

      // Chat is not about projects: one list, pinned first, then newest first. It holds every chat of the tab,
      // including the ones started in Scratch (Chat's default start place): leaving them out hid most new chats.
      const flat = selected.id === 'chat';
      const wsOf = {};
      if (flat) for (const p of projects) for (const id of p.ids) wsOf[id] = p.ws;
      const flatIds = flat && !spacesOn ? chatListIds(sortRows, projects, scratchRows, loose) : [];
      // Item 4A, stage 3b: the Chat space lists "Chats" (standalone threads: Scratch and those outside any project) first,
      // then "Projects" as folders, the default workspace among them. Chat-mode threads of the default workspace (the
      // Chat tab's chats from before Scratch) stay with the Chats, as they were on the Chat tab.
      const chatHome = flat && spacesOn ? defaultWorkspace(lib.workspaces) : null;
      const homeChats = chatHome ? (projects.find((p) => p.ws.workspaceId === chatHome.workspaceId)?.ids ?? []).filter((id) => state.sessionModes?.[id] === 'chat') : [];
      // A room (Recon's, emptied at every start) is no project of yours: its threads listed here are with the Chats.
      const roomChats = flat && spacesOn ? projects.filter((p) => rooms.has(roomKey(p.ws.path))).flatMap((p) => p.ids) : [];
      const groups = flat && spacesOn
        ? chatGroups(sortRows, projects.filter((p) => !rooms.has(roomKey(p.ws.path))).map((p) => (p.ws.workspaceId === chatHome?.workspaceId && homeChats.length > 0
          ? { ...p, ids: p.ids.filter((id) => !homeChats.includes(id)) }
          : p)), scratchRows, [...loose, ...homeChats, ...roomChats], chatHome)
        : null;

      const openSession = (id) => {
        try { appCtx.layout.selectPanel(null); } catch { /* already there */ }
        uw?.openSession?.(id);
      };

      const openProject = (workspaceId) => {
        projectStore.focus(workspaceId);
        try { appCtx.layout.selectPanel('project'); } catch { /* the page is not there */ }
      };
      /** New project: pick a folder; the app lists it as a project and Plus files it under this tab. */
      const addProject = async () => {
        try {
          const desktop = globalThis.__DSH_DIRECTORY_PICKER__;
          const native = desktop && typeof desktop.pick === 'function';
          let picked = null;
          try { picked = native ? await desktop.pick() : await uw.pickDirectory(); } catch (error) { if (native) throw error; }
          // In a web browser there may be no folder chooser: ask for the path instead.
          if (!picked && !native) picked = await askInPage({ text: t('proj.add.path'), field: { label: 'Folder path', placeholder: '/Users/you/Projects/my-project' }, ok: 'Add' });
          const path = (typeof picked === 'string' ? picked : picked?.path ?? '').trim();
          if (!path) return;
          const ws = await appCtx.get('workspaces').create({ path });
          await projectStore.save(ws?.path ?? path, { tab: key });
          if (ws?.workspaceId) openProject(ws.workspaceId);
        } catch (error) {
          model.fail(t('proj.add.failed', { message: String(error?.message ?? error) }));
        }
      };

      /** A new conversation in a project, with this chat attached the app's own way (an @ mention). */
      /**
       * Keep in a project (step 38): the thread's files are copied into a new sub-folder of the project,
       * named after the thread (never over anything), then a new conversation starts there with a mention
       * of the thread. The Scratch thread stays until you delete it.
       */
      const keepIn = async (id, title, ws, mode) => {
        let kept;
        try {
          const response = await fetch(new URL('dsh-cowork-shell/scratch/keep', document.baseURI), { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ sessionId: id, title, workspaceId: ws.workspaceId }) });
          kept = await response.json();
          if (!response.ok) throw new Error(kept?.error ?? 'refused');
        } catch (error) {
          model.fail(t('keep.failed', { message: String(error?.message ?? error) }));
          return;
        }
        try {
          if (spacesOn ? mode.id !== state.space : mode.id !== state.selected) await model.select(mode.id, mode.label);
          try { appCtx.layout.selectPanel(null); } catch { /* already there */ }
          const folder = kept?.folder ? String(kept.folder).split('/').pop() : '';
          const prompt = folder ? t('keep.prompt', { mention: sessionMention(id, title), folder }) : t('keep.prompt.none', { mention: sessionMention(id, title) });
          startLocked(appCtx, tabKeyOf(mode.id), ws.workspaceId, { prompt, whenDraftExists: 'replace' });
        } catch {
          model.fail(t('continue.failed'));
        }
      };
      const continueIn = async (id, title, ws, mode) => {
        try {
          if (spacesOn ? mode.id !== state.space : mode.id !== state.selected) await model.select(mode.id, mode.label);
          try { appCtx.layout.selectPanel(null); } catch { /* already there */ }
          startLocked(appCtx, tabKeyOf(mode.id), ws.workspaceId, { prompt: t('continue.prompt', { mention: sessionMention(id, title) }), whenDraftExists: 'replace' });
        } catch {
          model.fail(t('continue.failed'));
        }
      };

      /**
     * The question before the app stops a conversation's work to archive or delete it. When an
     * automation delivers into the conversation, stopping deletes that automation for good (the
     * app's scheduler does so), so the question names it and says so; otherwise the plain question.
     * @param {unknown} activity - the refusal's `details.activity`: [{kind, items: [{id, label}]}].
     * @param {string} plain - the question for a conversation that is only still working.
     * @param {(key: string, values?: object) => string} t - the texts.
     * @returns {string} the question.
     */
    function stopQuestion(activity, plain, t) {
      const list = Array.isArray(activity) ? activity : [];
      const tasks = list.filter((entry) => entry?.kind === 'schedule').flatMap((entry) => (Array.isArray(entry.items) ? entry.items : []));
      if (tasks.length === 0) return plain;
      const names = tasks.map((item) => String(item?.label ?? '').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean);
      const key = names.length === 0 ? 'stop.automation.unnamed' : tasks.length === 1 ? 'stop.automation.one' : 'stop.automation.many';
      const about = t(key, { names: names.map((name) => `\u201c${name}\u201d`).join(', '), n: tasks.length });
      // Its own turn, a helper or a job may be running too.
      return list.some((entry) => entry?.kind !== 'schedule') ? `${about}\n\n${plain}` : about;
    }

    /** Archive a conversation the app's own way. One that is still working asks first. */
      const archiveQuietly = async (id, question, { busy } = {}) => {
        const service = (() => { try { return appCtx.get('workspaces'); } catch { return null; } })();
        try {
          await service.archiveSession(id);
        } catch (error) {
          if (error?.rpcError?.code !== 'workspace/session-active') throw error;
          // The clean-up never stops anything: it leaves a conversation that is still in use and says why.
          if (typeof busy === 'function') { busy(error?.rpcError?.details?.activity); return false; }
          if (!(await askInPage({ text: stopQuestion(error?.rpcError?.details?.activity, question, t), ok: 'Stop it and continue', danger: true }))) return false;
          await service.archiveSession(id, { stopActivity: true });
        }
        if (id === lib.currentId) startNew(appCtx, library, key);
        return true;
      };
      const archive = async (id) => {
        try {
          await archiveQuietly(id, t('archive.running'));
        } catch {
          model.fail(t('archive.failed'));
        }
      };
      /** Delete: archive it (the app then stops using it), then move its files to the trash. */
      const remove = async (id, title) => {
        if (!(await askInPage({ text: t(inScratch(lib.byId[id]?.cwd) ? 'delete.confirm.scratch' : 'delete.confirm', { title }), ok: 'Delete', danger: true }))) return;
        try {
          const wasArchived = archived.has(id);
          if (wasArchived) {
            if (id === lib.currentId) startNew(appCtx, library, key);
          } else if (!(await archiveQuietly(id, t('delete.running')))) return;
          // Final fix round (lab): archived here only to delete it, so Put back brings it back to the list.
          const where = wasArchived ? tabOf(id) : { ...tabOf(id), back: 'list' };
          await trash.remove(id, title, where);
        } catch {
          model.fail(t('delete.failed'));
        }
      };
      const putBack = async (row) => {
        try {
          const data = await trash.restore(row);
          // A group row may come back in part: say what stayed and why.
          const done = data?.restored;
          const lines = [];
          if (done && ((done.left?.length ?? 0) > 0 || (done.data?.failed?.length ?? 0) > 0)) {
            const reason = done.left?.[0]?.reason ?? done.data?.failed?.[0]?.reason ?? '';
            lines.push(t('trash.back.partly', { back: (done.back?.length ?? 0) + (done.data?.done?.length ?? 0), left: (done.left?.length ?? 0) + (done.data?.failed?.length ?? 0), reason }));
          }
          // What the owning add-on says could not come back (an automation's old run list, for example).
          for (const note of Array.isArray(done?.notes) ? done.notes : []) if (typeof note === 'string' && note) lines.push(note);
          if (lines.length > 0) model.fail(lines.join(' '));
        } catch (error) {
          model.fail(row?.kind === 'group' && error?.message ? String(error.message) : t('trash.back.failed'));
        }
      };
      /**
       * Empty trash: every conversation this tab's Trash list shows (not those already being deleted),
       * after one question that names how many. Other tabs' lists are not touched.
       */
      const emptyHere = async () => {
        if (emptying) return;
        try {
          const done = await runEmpty({
            items: binHere, state, tabIds, selectedId: selected.id, t,
            ask: (question) => askInPage({ text: question, ok: 'Empty the trash', danger: true }),
            send: (ids) => trash.empty(ids),
            start: () => setEmptying(true),
          });
          if (done.failed > 0) model.fail(t('trash.empty.failed', { n: done.failed }));
        } finally {
          setEmptying(false);
        }
      };
      /** Delete permanently: no way back, so it always asks first. */
      const erase = async (row, title) => {
        const question = row?.kind === 'group' ? t('trash.erase.confirm.group', { title, what: rowContents(row, t) }) : t('trash.erase.confirm', { title });
        if (!(await askInPage({ text: question, ok: 'Delete for good', danger: true }))) return;
        try {
          const data = await trash.erase(row);
          const erased = data?.erased;
          if (erased && Number(erased.failed) > 0) model.fail(t('trash.erase.partly', { n: erased.failed, reason: erased.reasons?.[0] ?? '' }));
        } catch {
          model.fail(t('trash.erase.failed'));
        }
      };
      const restore = async (id) => {
        try {
          await appCtx.get('workspaces').unarchiveSession(id);
        } catch {
          model.fail(t('archived.restore.failed'));
        }
      };

      // ---- several at once, and the right-click menu ---------------------------------------------
      /** The conversations as they are listed now, top to bottom, for Shift-click and for the order of a bulk action. */
      const listed = [];
      const clickRow = (event, id) => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          setPicked((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next; });
          lastPick.current = id;
          return;
        }
        if (event.shiftKey && lastPick.current && listed.includes(lastPick.current) && listed.includes(id)) {
          event.preventDefault();
          const [from, to] = [listed.indexOf(lastPick.current), listed.indexOf(id)].sort((a, b) => a - b);
          setPicked((old) => new Set([...old, ...listed.slice(from, to + 1)]));
          return;
        }
        if (picked.size > 0) setPicked(new Set());
        lastPick.current = id;
        openSession(id);
      };
      const askMenu = (event, id) => {
        event.preventDefault();
        const ids = picked.has(id) && picked.size > 1 ? listed.filter((other) => picked.has(other)) : [id];
        if (!picked.has(id) && picked.size > 0) setPicked(new Set());
        setMenu({ x: Math.min(event.clientX, window.innerWidth - 290), y: Math.min(event.clientY, window.innerHeight - 220), ids, rename: null });
      };
      const archiveMany = async (ids) => {
        setMenu(null);
        for (const id of ids) {
          if (archived.has(id)) continue;
          try {
            await archiveQuietly(id, t('archive.running'));
          } catch {
            model.fail(t('archive.failed'));
            break;
          }
        }
        setPicked(new Set());
      };
      const removeMany = async (ids) => {
        setMenu(null);
        const titleOf = (id) => (lib.byId[id]?.displayTitle && String(lib.byId[id].displayTitle).trim()) || t('untitled');
        if (!(await askInPage({ text: ids.length === 1 ? t(inScratch(lib.byId[ids[0]]?.cwd) ? 'delete.confirm.scratch' : 'delete.confirm', { title: titleOf(ids[0]) }) : t('delete.confirm.n', { n: ids.length }), ok: 'Delete', danger: true }))) return;
        for (const id of ids) {
          try {
            if (archived.has(id)) {
              if (id === lib.currentId) startNew(appCtx, library, key);
            } else if (!(await archiveQuietly(id, t('delete.running')))) continue;
            await trash.remove(id, titleOf(id), tabOf(id));
          } catch {
            model.fail(t('delete.failed'));
            break;
          }
        }
        setPicked(new Set());
      };
      /** Clean up (step 43): every tab's Scratch conversations not used for a number of days, after one question. */
      const cleanUp = async () => {
        const answer = await askInPage({ text: t('cleanup.ask'), field: { label: 'Days', value: '30' }, ok: 'Continue' });
        if (answer === null) return;
        const days = Math.floor(Number(String(answer).trim()));
        if (!Number.isFinite(days) || days < 1 || days > 3650) { model.fail(t('cleanup.bad')); return; }
        const all = Object.keys(lib.byId).filter((id) => !deleted.has(id) && (hidden.has(roomKey(homeOf[id]?.path)) || inScratch(lib.byId[id]?.cwd)));
        const now = Date.now();
        const plan = cleanupPlan(all, lib, { days, now, pinned });
        // Threads an automation writes into, also a paused one (the app refuses to archive only for active
        // ones): read from the Automations add-on when it runs; without it, the app's refusal below still holds.
        const used = new Map();
        try {
          const answer = await fetch(new URL('dsh-automations/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
          if (answer.ok) {
            const data = await answer.json();
            for (const task of Array.isArray(data?.tasks) ? data.tasks : []) {
              if (task?.status !== 'ended' && task?.sessionId) used.set(task.sessionId, [...(used.get(task.sessionId) ?? []), String(task.title ?? '')]);
            }
          }
        } catch { /* the Automations add-on is off */ }
        const take = plan.take.filter((id) => !used.has(id));
        const skipped = plan.skipped;
        const usedLines = plan.take.filter((id) => used.has(id)).map((id) => `• ${(lib.byId[id]?.displayTitle && String(lib.byId[id].displayTitle).trim()) || t('untitled')} (\u201c${used.get(id).filter(Boolean).join('\u201d, \u201c')}\u201d)`);
        let date;
        try { date = new Date(now - days * 86400000).toLocaleDateString('en-GB'); } catch { date = new Date(now - days * 86400000).toISOString().slice(0, 10); }
        const titleOf = (id) => (lib.byId[id]?.displayTitle && String(lib.byId[id].displayTitle).trim()) || t('untitled');
        const kept = skipped.map((item) => `• ${titleOf(item.id)} (${t(`cleanup.why.${item.why}`)})`).join('\n');
        if (take.length === 0) {
          await askInPage({ notice: true, text: `${t('cleanup.none', { date })}${kept ? `\n\n${t('cleanup.kept')}\n${kept}` : ''}${usedLines.length > 0 ? `\n\n${t('cleanup.automation')}\n${usedLines.join('\n')}` : ''}` });
          return;
        }
        if (!(await askInPage({ text: `${t(take.length === 1 ? 'cleanup.confirm.one' : 'cleanup.confirm', { n: take.length, date })}${kept ? `\n\n${t('cleanup.kept')}\n${kept}` : ''}`, ok: 'Move to the trash', danger: true }))) return;
        // Step 42 (Automations part, question 9): a thread an automation still writes into is left alone,
        // and named with the automation, instead of asking once per thread.
        const inUse = [...usedLines];
        for (const id of take) {
          try {
            const busy = (activity) => {
              const names = (Array.isArray(activity) ? activity : []).filter((entry) => entry?.kind === 'schedule')
                .flatMap((entry) => (Array.isArray(entry.items) ? entry.items : [])).map((item) => String(item?.label ?? '').trim()).filter(Boolean);
              inUse.push(`• ${titleOf(id)}${names.length > 0 ? ` (\u201c${names.join('\u201d, \u201c')}\u201d)` : ''}`);
            };
            if (!archived.has(id) && !(await archiveQuietly(id, t('delete.running'), { busy }))) continue;
            await trash.remove(id, titleOf(id), tabOf(id));
          } catch {
            model.fail(t('delete.failed'));
            break;
          }
        }
        if (inUse.length > 0) await askInPage({ notice: true, text: `${t('cleanup.automation')}\n${inUse.join('\n')}` });
      };
      const restoreMany = async (ids) => {
        setMenu(null);
        for (const id of ids) await restore(id);
        setPicked(new Set());
      };
      const renameOne = async (id, title) => {
        setMenu(null);
        const next = String(title ?? '').trim().slice(0, 200);
        if (!next) return;
        try {
          const done = await appCtx.get('remote.session').rename({ sessionId: id, title: next });
          if (done && done.ok === false) throw new Error(done.error?.message ?? 'refused');
          void model.refresh();
        } catch {
          model.fail(t('rename.failed'));
        }
      };
      /** The folder Show in Finder opens: a Scratch thread's own folder, else its project's folder. */
      const revealPathOf = (id) => scratchFolderOfRow(id, lib.byId[id]?.cwd, homeOf[id]?.path) || (hidden.has(roomKey(homeOf[id]?.path)) ? '' : homeOf[id]?.path ?? '');
      /** Show a project's folder in Finder, through the app's own request for that. */
      const reveal = async (path) => {
        setMenu(null);
        try {
          const done = await appCtx.get('remote.session').openWorkspacePath({ path, action: 'reveal' });
          if (!done?.ok) throw new Error('refused');
        } catch {
          model.fail(t('reveal.failed'));
        }
      };
      const askProjectMenu = (event, ws) => {
        event.preventDefault();
        if (!ws?.path) return;
        setMenu({ x: Math.min(event.clientX, window.innerWidth - 290), y: Math.min(event.clientY, window.innerHeight - 120), ids: [], project: ws, rename: null });
      };
      /**
       * Take a project off the app's list (the app's own workspace delete). Only its entry goes: the folder and
       * its files are never touched (the owner's choice). The default workspace, Scratch and Recon's room stay.
       */
      const projectRemovable = (ws) => !!ws?.workspaceId && !hidden.has(roomKey(ws.path)) && !rooms.has(roomKey(ws.path))
        && defaultWorkspace([ws]) === null;
      const removeProject = async (ws) => {
        setMenu(null);
        if (!(await askInPage({ text: t('proj.remove.sure', { name: ws.title || ws.path || t('untitled') }), ok: 'Remove project', danger: true }))) return;
        try {
          await appCtx.get('workspaces').delete(ws.workspaceId);
          void model.refresh();
        } catch (error) {
          model.fail(t('proj.remove.failed', { message: String(error?.message ?? error) }));
        }
      };
      const keepOnScreen = (node) => {
        if (!node) return;
        const box = node.getBoundingClientRect();
        if (box.bottom > window.innerHeight - 8) node.style.top = `${Math.max(8, window.innerHeight - 8 - box.height)}px`;
      };
      const menuView = () => {
        if (!menu) return null;
        if (menu.project) {
          return h('div', { className: 'cws-ctx', role: 'menu', style: { left: menu.x, top: menu.y } },
            h('button', { type: 'button', role: 'menuitem', title: menu.project.path, onClick: () => void reveal(menu.project.path) }, t('ctx.reveal')),
            projectRemovable(menu.project)
              ? h('button', { type: 'button', role: 'menuitem', 'data-danger': 'true', title: menu.project.path, onClick: () => void removeProject(menu.project) }, t('proj.remove'))
              : null);
        }
        const ids = menu.ids.filter((id) => lib.byId[id]);
        if (ids.length === 0) return null;
        const one = ids.length === 1 ? ids[0] : null;
        const allArchived = ids.every((id) => archived.has(id));
        const noneArchived = ids.every((id) => !archived.has(id));
        // Ended with Recon's End and wipe: neither restored nor put in the trash, from this menu either.
        const wipingIds = new Set(bin.wiping ?? []);
        const usable = ids.filter((id) => !wipingIds.has(id));
        // Fix round: a menu opened low in the list moves up so its last item (Delete) stays on screen.
        return h('div', { className: 'cws-ctx', role: 'menu', style: { left: menu.x, top: menu.y }, ref: keepOnScreen },
          menu.rename !== null
            ? h('form', { onSubmit: (event) => { event.preventDefault(); void renameOne(one, menu.rename); } },
              h('input', { autoFocus: true, value: menu.rename, 'aria-label': t('ctx.rename'), onChange: (event) => setMenu({ ...menu, rename: event.target.value }) }),
              h('button', { type: 'submit' }, t('ctx.rename.save')))
            : h(React.Fragment, null,
              one ? h('button', { type: 'button', role: 'menuitem', onClick: () => { setMenu(null); openSession(one); } }, t('ctx.open')) : null,
              one && !archived.has(one) ? h('button', { type: 'button', role: 'menuitem', onClick: () => setMenu({ ...menu, rename: String(lib.byId[one]?.displayTitle ?? '') }) }, t('ctx.rename')) : null,
              one && revealPathOf(one) ? h('button', { type: 'button', role: 'menuitem', title: revealPathOf(one), onClick: () => void reveal(revealPathOf(one)) }, t('ctx.reveal')) : null,
              one ? h('hr') : null,
              noneArchived ? h('button', { type: 'button', role: 'menuitem', onClick: () => void archiveMany(ids) }, one ? t('archive') : t('ctx.archive.n', { n: ids.length })) : null,
              allArchived && usable.length > 0 ? h('button', { type: 'button', role: 'menuitem', onClick: () => void restoreMany(usable) }, usable.length === 1 ? t('ctx.restore') : t('ctx.restore.n', { n: usable.length })) : null,
              usable.length > 0 ? h('button', { type: 'button', role: 'menuitem', 'data-danger': 'true', onClick: () => void removeMany(usable) }, usable.length === 1 ? t('delete') : t('ctx.delete.n', { n: usable.length })) : null,
              usable.length < ids.length ? h('span', { className: 'cws-time', role: 'note', title: t('archived.wiping.hint') }, t('archived.wiping')) : null));
      };
      /** The tab's own search field, the search-everything button, and the count of picked conversations. */
      const searchText = async () => {
        const text = find.trim();
        if (text.length < 2) return;
        try {
          // The Global Search add-on searches deeper and leaves out the app's own notes; without it, the app's search is used.
          let ids;
          const better = await fetch(new URL('dsh-search/match', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: text, text: true }) }).catch(() => null);
          if (better?.ok) {
            const found = await better.json();
            if (found.note) throw new Error(found.note);
            ids = found.hitIds ?? [];
          } else {
            const answer = await appCtx.get('remote.session').search({ query: text });
            if (!answer?.ok) throw new Error('refused');
            ids = (answer.value?.items ?? []).map((item) => item.sessionId);
          }
          setTextHits(new Set(ids));
          setFindNote(t('find.text'));
        } catch {
          setTextHits(null);
          setFindNote(t('find.failed'));
        }
      };
      const findField = () => h(React.Fragment, null,
        h('div', { className: 'cws-find' },
          h('input', { type: 'search', value: find, placeholder: t('find.placeholder', { tab: selected.label }), title: t('find.hint'), 'aria-label': t('find.placeholder', { tab: selected.label }), spellCheck: false,
            onChange: (event) => { setFind(event.target.value); setTextHits(null); setFindNote(''); },
            onKeyDown: (event) => { if (event.key === 'Enter') void searchText(); else if (event.key === 'Escape') { setFind(''); setTextHits(null); setFindNote(''); } } }),
          hasGlobal ? h('button', { type: 'button', className: 'cws-link', title: t('find.global') + ' (⌘K)', 'aria-label': t('find.global'), onClick: () => window.dispatchEvent(new Event('dsh-search:open')) }, '⌘K') : null),
        findNote ? h('div', { className: 'cws-find-note' }, findNote) : null,
        picked.size > 0 ? h('div', { className: 'cws-pickbar' }, h('span', { title: t('pick.hint') }, t('pick.count', { n: picked.size })), h('button', { type: 'button', className: 'cws-link', onClick: () => setPicked(new Set()) }, t('pick.clear'))) : null);

      // Archived conversations of this tab, newest first.
      const wsById = {};
      for (const ws of lib.workspaces) for (const id of ws.sessionIds ?? []) wsById[id] = ws;
      const archivedIds = lib.archived
        .filter((id) => lib.byId[id] && lib.byId[id].origin !== 'subagent' && !lib.byId[id].blank && !deleted.has(id)
          && placeOf(id, lib.byId[id], wsById[id] ?? null) === selected.id && shows(id))
        .sort((a, b) => (lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0));
      // Every conversation that waits for the user, from all tabs: an approval, a plan review or a question.
      const needsIds = Object.keys(lib.waiting)
        .filter((id) => lib.byId[id] && !archived.has(id) && !deleted.has(id))
        .sort((a, b) => (lib.byId[b].updatedAt ?? 0) - (lib.byId[a].updatedAt ?? 0));
      const needsSection = () => {
        if (needsIds.length === 0) return null;
        return h('div', { className: 'cws-needs', role: 'region', 'aria-label': t('needs.title', { n: needsIds.length }) },
          h('div', { className: 'cws-lib-head cws-needs-head' }, h('span', null, t('needs.title', { n: needsIds.length }))),
          needsIds.map((id) => {
            const sess = lib.byId[id];
            const title = (sess.displayTitle && String(sess.displayTitle).trim()) || t('untitled');
            const why = t('needs.' + lib.waiting[id]);
            return h('div', { key: id, className: 'cws-conv', 'aria-current': lib.currentId === id ? 'page' : undefined },
              h('button', { type: 'button', className: 'cws-conv-main cws-needs-row', onClick: () => openSession(id), title: title + ' · ' + why },
                h('span', { className: 'cws-dot cws-dot-wait', 'aria-hidden': true }),
                h('span', { className: 'cws-needs-text' },
                  h('span', { className: 'cws-label' }, title),
                  h('span', { className: 'cws-needs-why' }, why))));
          }));
      };
      const trashSection = () => {
        if (binHere.length === 0) return null;
        const shown = !!open.__trash;
        return h(React.Fragment, null,
          h('button', { type: 'button', className: 'cws-more-btn cws-archived-head', 'aria-expanded': shown, onClick: () => setOpen((o) => ({ ...o, __trash: !shown })) },
            (shown ? '▾ ' : '▸ ') + t('trash.title', { n: binHere.length })),
          shown ? binHere.map((item) => {
            const title = item.title || t('untitled');
            const group = item.kind === 'group';
            // A group row (old runs of an automation, for example): days left of its oldest run.
            const left = Math.max(0, Math.ceil(((group ? item.firstAt : item.deletedAt) + bin.keepMs - Date.now()) / 86400000));
            // Two lines: the whole width for the title, then the days left and the buttons below it.
            const dot = (key) => h('span', { key, className: 'cws-trash-dot', 'aria-hidden': true }, '·');
            const blocked = group && (item.putBackNeeds || item.newer)
              ? (item.newer ? t('trash.back.newer') : t('trash.back.needs', { label: item.putBackNeeds }))
              : '';
            return h('div', { key: item.id, className: 'cws-conv cws-archived cws-trash-row' },
              h('span', { className: 'cws-conv-main cws-trashed', title },
                h('span', { className: 'cws-label' }, title)),
              group ? h('div', { className: 'cws-trash-meta cws-trash-sub' },
                h('span', { className: 'cws-time' }, groupSummary(item, t))) : null,
              h('div', { className: 'cws-trash-meta' },
                h('span', { className: 'cws-time' }, t(group ? 'trash.left.oldest' : 'trash.left', { n: left })),
                ...(item.files ? [dot('d0'), h('span', { key: 'files', className: 'cws-time' }, t('trash.files'))] : []),
                ...(item.erasing
                  ? [dot('d1'), h('span', { key: 'erasing', className: 'cws-time', title: t('trash.erasing.hint') }, t('trash.erasing'))]
                  : [
                    dot('d1'),
                    // While Empty trash runs, a row may be erased any moment: no Put back or erase then.
                    h('button', { key: 'back', type: 'button', className: 'cws-link', disabled: emptying || Boolean(blocked), title: blocked || undefined, 'aria-label': t('trash.back.label', { title }), onClick: () => void putBack(item) }, t('trash.back')),
                    dot('d2'),
                    h('button', { key: 'erase', type: 'button', className: 'cws-link', disabled: emptying || item.newer === true, title: item.newer ? t('trash.back.newer') : undefined, 'aria-label': t('trash.erase.label', { title }), onClick: () => void erase(item, title) }, t('trash.erase')),
                  ])),
              group && (blocked || item.lastError) ? h('div', { className: 'cws-trash-meta cws-trash-note' }, blocked || item.lastError) : null);
          }) : null,
          shown && emptyIds(binHere, state, tabIds, selected.id).length > 0
            ? h('div', { className: 'cws-trash-empty' },
              h('button', { type: 'button', className: 'cws-link', disabled: emptying, 'aria-label': ((n) => (binHere.some((item) => item.kind === 'group') ? t('trash.empty.label.rows', { n }) : t(n === 1 ? 'trash.empty.label.one' : 'trash.empty.label', { n })))(emptyIds(binHere, state, tabIds, selected.id).length), onClick: () => void emptyHere() }, emptying ? t('trash.empty.busy') : t('trash.empty')))
            : null);
      };
      const archivedSection = () => {
        if (archivedIds.length === 0) return trashSection();
        const shown = !!open.__archived;
        return h(React.Fragment, null,
          h('button', { type: 'button', className: 'cws-more-btn cws-archived-head', 'aria-expanded': shown, onClick: () => setOpen((o) => ({ ...o, __archived: !shown })) },
            (shown ? '▾ ' : '▸ ') + t('archived.title', { n: archivedIds.length })),
          shown ? archivedIds.map((id) => {
            const sess = lib.byId[id];
            const title = (sess.displayTitle && String(sess.displayTitle).trim()) || t('untitled');
            listed.push(id);
            return h('div', { key: id, className: 'cws-conv cws-archived', 'aria-current': lib.currentId === id ? 'page' : undefined, 'data-picked': String(picked.has(id)), onContextMenu: (event) => askMenu(event, id) },
              h('button', { type: 'button', className: 'cws-conv-main', onClick: (event) => clickRow(event, id), title },
                h('span', { className: 'cws-label' }, title),
                h('span', { className: 'cws-time' }, ago(t, sess.updatedAt))),
              // Ended with Recon's End and wipe: it is being deleted for good, so it can be neither restored nor put in the trash.
              ...((bin.wiping ?? []).includes(id)
                ? [h('span', { key: 'wiping', className: 'cws-time', title: t('archived.wiping.hint') }, t('archived.wiping'))]
                : [
                  h('button', { key: 'restore', type: 'button', className: 'cws-link', 'aria-label': t('archived.restore.label', { title }), onClick: () => void restore(id) }, t('archived.restore')),
                  h('button', { key: 'delete', type: 'button', className: 'cws-link', 'aria-label': t('delete.label', { title }), onClick: () => void remove(id, title) }, t('delete')),
                ]));
          }) : null,
          trashSection());
      };

      /** The spaces a thread can move to: not Recon (a thread out of Recon opens anew elsewhere; into Recon none). */
      const moveTargets = () => tabs.filter((m) => m.id !== 'recon');
      const row = (id, ws) => {
        const sess = lib.byId[id];
        const title = (!sess.blank && sess.displayTitle && String(sess.displayTitle).trim()) || t('untitled');
        const current = lib.currentId === id;
        // Item 4A, stage 3b: a small grey tag with the thread's mode when it is not the space's usual one.
        const modeTag = spacesOn && !sess.blank ? modeTagOf(id, state, selected.id) : '';
        listed.push(id);
        return h('div', { key: id, className: 'cws-conv', 'aria-current': current ? 'page' : undefined, 'data-picked': String(picked.has(id)), onContextMenu: sess.blank ? undefined : (event) => askMenu(event, id) },
          h('button', { type: 'button', className: 'cws-conv-main', onClick: (event) => (sess.blank ? openSession(id) : clickRow(event, id)), title },
            lib.waiting[id]
              ? h('span', { className: 'cws-dot cws-dot-wait', role: 'img', 'aria-label': t('needs.' + lib.waiting[id]), title: t('needs.' + lib.waiting[id]) })
              : sess.running ? h('span', { className: 'cws-dot', role: 'img', 'aria-label': t('running'), title: t('running') }) : null,
            pinned.has(id) ? h('span', { className: 'cws-pin', 'aria-hidden': true }, '•') : null,
            h('span', { className: 'cws-label' }, title),
            modeTag ? h('span', { className: 'cws-mode-tag', title: t('row.mode', { mode: modeTag }) }, modeTag) : null,
            h('span', { className: 'cws-time' }, ago(t, sess.updatedAt))),
          sess.blank ? null : h(MoveMenu, {
            // With spaces: Move to another space (never into Recon: its threads start there, sealed). "Promote to" is gone.
            t, tabs: spacesOn ? moveTargets(id) : tabs, current: placeOf(id, sess, ws),
            label: t(spacesOn ? 'move.label.space' : flat ? 'promote.label' : 'move.label', { title }),
            onMove: (modeId) => void moveTo([id], modeId),
            promote: flat && !spacesOn,
            // Never a room (Recon's is emptied at every start) or Scratch itself.
            projects: flat || isScratchRow(id) ? lib.workspaces.filter((ws) => !rooms.has(roomKey(ws.path)) && !hidden.has(roomKey(ws.path))) : undefined,
            // A Scratch thread (any tab): Keep in a project copies its files there first.
            keep: isScratchRow(id),
            onContinue: typeof uw?.startSession !== 'function' ? undefined
              : isScratchRow(id) ? (target, mode) => void keepIn(id, title, target, mode)
                : flat ? (target, mode) => void continueIn(id, title, target, mode) : undefined,
            extra: [{ key: 'archive', label: t('archive'), run: () => void archive(id) }, { key: 'delete', label: t('delete'), run: () => void remove(id, title) }],
          }));
      };

      const list = (ids, key, ws) => {
        const limit = more[key] ? ids.length : 8;
        return h(React.Fragment, null, ids.slice(0, limit).map((id) => row(id, ws)),
          ids.length > limit ? h('button', { type: 'button', className: 'cws-more-btn', onClick: () => setMore((m) => ({ ...m, [key]: true })) }, t('show.more', { n: ids.length - limit })) : null);
      };

      /** A project as a folder: open or closed, its threads of this space, + (a new thread in it), ⚙ (its page), ⋯. */
      const projectFolder = ({ ws, ids, all = [] }) => {
        // A search opens every project that holds a match.
        const isOpen = findWords.length > 0 ? ids.length > 0 : open[ws.workspaceId] ?? ids.includes(lib.currentId);
        return h('div', { key: ws.workspaceId, className: 'cws-proj' },
          h('div', { className: 'cws-proj-row', onContextMenu: (event) => askProjectMenu(event, ws) },
            h('button', { type: 'button', className: 'cws-proj-main', 'aria-expanded': isOpen, onClick: () => setOpen((o) => ({ ...o, [ws.workspaceId]: !isOpen })) },
              h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: isOpen ? 'folderOpen' : 'folder', size: 16 })),
              h('span', { className: 'cws-label' }, ws.title || ws.path || t('untitled')),
              h('span', { className: 'cws-count' }, String(ids.length))),
            h('button', { type: 'button', className: 'cws-mini', title: t('proj.new'), 'aria-label': t('proj.new'), onClick: () => { try { appCtx.layout.selectPanel(null); } catch { /* */ } if (uw?.startSession) startLocked(appCtx, key, ws.workspaceId); } }, '+'),
            h('button', { type: 'button', className: 'cws-mini', title: t('proj.open'), 'aria-label': t('proj.open'), onClick: () => openProject(ws.workspaceId) }, '⚙'),
            all.some((id) => !lib.byId[id]?.blank)
              ? h(MoveMenu, { t, tabs: spacesOn ? tabs.filter((m) => m.id !== 'recon') : tabs, current: selected.id, label: t(spacesOn ? 'proj.move.space' : 'proj.move', { title: ws.title || '' }), onMove: (modeId) => void moveTo(all.filter((id) => !lib.byId[id]?.blank), modeId, true) })
              : null),
          isOpen ? h('div', { className: 'cws-proj-list' }, list(ids, ws.workspaceId, ws)) : null);
      };

      const empty = projects.length === 0 && loose.length === 0 && scratchRows.length === 0;
      if (groups) {
        // Item 4A, stage 3b: the Chat space: Chats first, then Projects as folders (the default workspace among them).
        const chatsInfo = h(ui.Info, { title: t('lib.chats.info.title'), what: t('lib.chats.info.what'), when: t('lib.chats.info.when'), change: t('lib.chats.info.change'), portal: true });
        return h('div', { className: 'cws-lib', 'data-cws-list': 'chat-groups' },
          needsSection(),
          findField(),
          h('div', { className: 'cws-lib-head' },
            h('span', { className: 'cws-lib-title' }, t('lib.chats'), chatsInfo),
            h('button', { type: 'button', className: 'cws-link', onClick: onShowAll, title: t('lib.all.hint') }, t('lib.all'))),
          groups.chats.length === 0
            ? h('p', { className: 'cws-lib-empty' }, findWords.length > 0 ? t('find.none', { tab: selected.label }) : t('lib.chats.empty'))
            : h(React.Fragment, null, groups.chats.slice(0, more.__flat ? groups.chats.length : 30).map((id) => row(id, wsOf[id] ?? null)),
              groups.chats.length > 30 && !more.__flat ? h('button', { type: 'button', className: 'cws-more-btn', onClick: () => setMore((m) => ({ ...m, __flat: true })) }, t('show.more', { n: groups.chats.length - 30 })) : null),
          h('div', { className: 'cws-lib-head' },
            h('span', null, t('lib.projects')),
            h('button', { type: 'button', className: 'cws-link', onClick: () => void addProject(), title: t('proj.add.hint') }, '+ ' + t('proj.add'))),
          groups.projects.map(projectFolder),
          archivedSection(),
          menuView());
      }
      if (flat) {
        return h('div', { className: 'cws-lib' },
          needsSection(),
          findField(),
          h('div', { className: 'cws-lib-head' },
            h('span', null, t('lib.title.chat', { tab: selected.label })),
            h('button', { type: 'button', className: 'cws-link', onClick: onShowAll, title: t('lib.all.hint') }, t('lib.all'))),
          empty ? h('p', { className: 'cws-lib-empty' }, findWords.length > 0 ? t('find.none', { tab: selected.label }) : t('lib.empty', { tab: selected.label })) : null,
          h(React.Fragment, null, flatIds.slice(0, more.__flat ? flatIds.length : 30).map((id) => row(id, wsOf[id] ?? null)),
            flatIds.length > 30 && !more.__flat ? h('button', { type: 'button', className: 'cws-more-btn', onClick: () => setMore((m) => ({ ...m, __flat: true })) }, t('show.more', { n: flatIds.length - 30 })) : null),
          archivedSection(),
          menuView());
      }
      return h('div', { className: 'cws-lib' },
        needsSection(),
        findField(),
        h('div', { className: 'cws-lib-head' },
          h('span', null, t('lib.title.' + (['chat', 'cowork', 'code'].includes(selected.id) ? selected.id : 'other'), { tab: selected.label })),
          h('span', { className: 'cws-lib-links' },
            h('button', { type: 'button', className: 'cws-link', onClick: () => void addProject(), title: t('proj.add.hint') }, '+ ' + t('proj.add')),
            h('button', { type: 'button', className: 'cws-link', onClick: onShowAll, title: t('lib.all.hint') }, t('lib.all')))),
        empty ? h('p', { className: 'cws-lib-empty' }, findWords.length > 0 ? t('find.none', { tab: selected.label }) : t('lib.empty', { tab: selected.label })) : null,
        projects.map(projectFolder),
        scratchRows.length ? h(React.Fragment, null,
          h('div', { className: 'cws-lib-head', title: t('place.scratch.hint') }, h('span', null, t('lib.scratch')),
            h('button', { type: 'button', className: 'cws-link', title: t('cleanup.hint'), onClick: () => void cleanUp() }, t('cleanup'))),
          list(scratchRows, '__scratch', null)) : null,
        loose.length ? h(React.Fragment, null,
          h('div', { className: 'cws-lib-head' }, h('span', null, t('lib.loose'))),
          list(loose, '__loose', null)) : null,
        archivedSection(),
        menuView());
    }

    // ---- Preset in this tab (item 7) -------------------------------------------------------------------------
    // A tab set to Standard only or Creator only (Settings → Modes → Preset in this tab) starts its new conversations
    // in that preset: { agentPreset } goes with the app's start, so the conversation is made in it before it exists,
    // with no race, and a reused blank cannot flip back to the default. Which tab is locked, and which presets the app
    // has, comes from the Modes add-on (its route), so the two never disagree. A missing preset, or no answer in time,
    // starts as usual (Modes' backstop and its (i) take over); a start never waits more than a moment.

    /** The Modes add-on's answer: each tab's choice and which presets the app has. */
    const PRESET_ROUTE = 'dsh-modes/preset';
    /** `gen` goes up when the setting changes, so an answer asked before the change is never kept (it would start new chats on the old lock). */
    const presetCache = { at: 0, value: null, pending: null, gen: 0 };
    /** The setting changed: drop the kept answer, and one still on its way (asked before the change) is not kept either. */
    function forgetPresetTable() {
      presetCache.at = 0;
      presetCache.value = null;
      presetCache.gen += 1;
      presetCache.pending = null;
    }
    /**
     * @param {number} [maxAgeMs] - how old a kept answer may be.
     * @param {number} [waitMs] - how long a start waits for a fresh one at most.
     * @returns {Promise<object | null>} the answer, or null when there is none.
     */
    async function presetTable(maxAgeMs = 4000, waitMs = 1500) {
      if (presetCache.value && Date.now() - presetCache.at < maxAgeMs) return presetCache.value;
      if (!presetCache.pending) {
        const gen = presetCache.gen;
        const pending = fetch(new URL(PRESET_ROUTE, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
          .then((value) => {
            if (presetCache.pending === pending) presetCache.pending = null;
            if (gen !== presetCache.gen) return null;
            if (value && Array.isArray(value.tabs)) { presetCache.value = value; presetCache.at = Date.now(); }
            return presetCache.value;
          });
        presetCache.pending = pending;
      }
      let timer;
      const late = new Promise((resolve) => { timer = setTimeout(() => resolve(presetCache.value), waitMs); });
      try {
        return await Promise.race([presetCache.pending, late]);
      } finally {
        clearTimeout(timer);
      }
    }
    /**
     * The app's preset a tab's new conversations start in: '' for Any, for a preset the app does not have now, and when
     * Modes cannot say (then nothing is forced here).
     * @param {object | null} table - from presetTable.
     * @param {string} tabId - the tab.
     * @returns {string} 'standard', 'cordis' (Creator) or ''.
     */
    function lockedPresetIn(table, tabId, spacesOn = spaceMode.on) {
      // Item 4A, stage 6a: with spaces on, the space's own lock row first (its id is the lock key: `creator-plus` for
      // Workshop), so a space shown without its home mode (Workshop with Tuner Plus only) still starts on its preset.
      const spaceRow = spacesOn && Array.isArray(table?.spaces) ? table.spaces.find((entry) => entry && entry.id === tabId) : undefined;
      const tab = spaceRow ?? (Array.isArray(table?.tabs) ? table.tabs.find((entry) => entry && entry.id === tabId) : undefined);
      if (!tab || (tab.lock !== 'standard' && tab.lock !== 'creator')) return '';
      const has = tab.lock === 'creator' ? table.presets?.creator : table.presets?.standard;
      if (has !== true) return '';
      return tab.lock === 'creator' ? 'cordis' : 'standard';
    }
    /**
     * The preset an Any tab's new chat starts on: the app's default preset, when Modes names it. The app then reuses only
     * a blank on that preset (or one listing none), never one another tab left on Creator or PTC (lab, item 7). '' when
     * the tab is locked or Modes cannot say.
     */
    function anyTabPresetIn(table, tabId) {
      const tab = Array.isArray(table?.tabs) ? table.tabs.find((entry) => entry && entry.id === tabId) : undefined;
      if (!tab || tab.lock !== 'any') return '';
      const id = typeof table.defaultPreset === 'string' ? table.defaultPreset.trim() : '';
      return /^[\w.-]{1,80}$/.test(id) ? id : '';
    }
    /** @returns {Promise<object | undefined>} the start's options with the tab's preset added: its lock, else the app's default. */
    async function withTabPreset(tabId, options) {
      let id = '';
      try {
        const table = await presetTable();
        id = lockedPresetIn(table, tabId) || anyTabPresetIn(table, tabId);
      } catch { id = ''; }
      return id ? { ...(options ?? {}), agentPreset: id } : options;
    }
    /** Start a conversation in a folder (or the app's choice), in the tab's locked preset when it has one. */
    function startLocked(appCtx, tabId, workspaceId, options) {
      const go = (opts) => appCtx.uiWorkspace.startSession(workspaceId, opts);
      withTabPreset(tabId, options).then(go, () => go(options));
    }

    /** The New button: on the Chat tab it always starts in the app's default workspace, when there is one. */
    /**
     * A new conversation of an isolated tab that has a folder of its own (Recon): it starts in that
     * folder, never in one of the user's, so the model is told no path of theirs. The add-on names
     * its folder at `<tab id>/state` as `room`. Falls back to the usual start when it has none.
     */
    async function startInRoom(appCtx, library, tabId, options) {
      const response = await fetch(new URL(`dsh-${tabId}/state`, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      const room = response.ok ? String((await response.json()).room ?? '') : '';
      if (!room) return false;
      rooms.add(roomKey(room));
      isolatedRooms.add(roomKey(room));
      const same = (path) => String(path ?? '').replace(/^\/private(?=\/tmp\/)/, '').replace(/\/+$/, '') === room.replace(/^\/private(?=\/tmp\/)/, '').replace(/\/+$/, '');
      let ws = (library.get().workspaces ?? []).find((entry) => entry && same(entry.path));
      if (!ws) {
        ws = await appCtx.get('workspaces').create({ path: room });
        try { await appCtx.get('workspaces').rename(ws.workspaceId, 'Recon room'); } catch { /* the folder's own name is fine */ }
      }
      if (!ws?.workspaceId) return false;
      appCtx.uiWorkspace.startSession(ws.workspaceId, await withTabPreset(tabId, options));
      return true;
    }

    /**
     * Folders of isolated tabs (Recon's room). The app empties them at every start, so no other tab
     * may start a conversation there. Recon's room is known up front, so it is skipped even before
     * the Recon tab is opened in this window; startInRoom adds any other room it is told about.
     */
    /**
     * Start places (Scratch step 44): where a new conversation of each tab starts. As decided on 15
     * November: every tab but Code starts in Scratch; Code in a folder (the open or last used project);
     * Recon always in its room. A tab another add-on brings starts in a folder unless set. Each can be
     * changed in Settings → Start places.
     */
    const DEFAULT_START_PLACES = { chat: 'scratch', cowork: 'scratch', finance: 'scratch', data: 'scratch', research: 'scratch', scout: 'scratch', code: 'folder' };
    /** @returns {Record<string, 'scratch'|'folder'>} the saved start places over the defaults. */
    function startPlacesOf(text) {
      let saved = {};
      try {
        const value = typeof text === 'string' && text ? JSON.parse(text) : {};
        if (value && typeof value === 'object' && !Array.isArray(value)) saved = value;
      } catch { saved = {}; }
      const out = { ...DEFAULT_START_PLACES };
      for (const [tab, place] of Object.entries(saved)) if (place === 'scratch' || place === 'folder') out[tab] = place;
      return out;
    }
    /** The start places in force (kept by the page model; read where a conversation starts). */
    const startPlaceTable = { value: { ...DEFAULT_START_PLACES }, newKey: true };
    /** @returns {'scratch'|'folder'|'room'} where a new conversation of this tab starts. */
    function startPlaceOf(tabId, table = startPlaceTable.value) {
      if (tabId === 'recon') return 'room';
      return table[tabId] === 'scratch' ? 'scratch' : 'folder';
    }
    const roomKey = (path) => String(path ?? '').replace(/^\/private(?=\/tmp\/)/, '').replace(/\/+$/, '');
    const rooms = new Set([roomKey('/tmp/dsh-recon-room')]);
    /** Isolated tabs' own rooms only (Recon's), not Scratch: a conversation there belongs to that tab alone. */
    const isolatedRooms = new Set([roomKey('/tmp/dsh-recon-room')]);
    /** Whether a folder is an isolated room or inside one (by its path). */
    function inIsolatedRoom(cwd) {
      const here = roomKey(cwd);
      return Boolean(here) && [...isolatedRooms].some((room) => here === room || here.startsWith(`${room}/`));
    }
    /**
     * Stage 7 (6b lab leftover; 6a decision: no Recon text reaches other spaces). The sidebar's Show all and the chat box's
     * "Choose workspace" list are drawn by the app itself, from every workspace: this add-on cannot filter their data. It
     * hides, outside Recon (html[data-cws-space] not "recon"; never without spaces), Recon's room and its threads there:
     * the app's own list rows by their `data-row-key` (CSS), and the workspace list's rows by their name or path (they carry
     * no id; a row is hidden, never removed). In Recon nothing is hidden.
     */
    const SAFE_KEY = /^[\w.:@-]{1,200}$/;
    /** @returns {{ids: string[], sessions: string[], labels: string[], paths: string[]}} Recon's room workspaces and threads. */
    function reconPlaces(lib, state) {
      const rooms = (Array.isArray(lib?.workspaces) ? lib.workspaces : []).filter((ws) => ws?.workspaceId && inIsolatedRoom(ws.path));
      const sessions = new Set(rooms.flatMap((ws) => (Array.isArray(ws.sessionIds) ? ws.sessionIds : [])));
      for (const [id, space] of Object.entries(state?.sessionSpaces ?? {})) if (space === 'recon') sessions.add(id);
      // Marked as Recon's (an owner's own isolated mode is not Recon: as spaceOfSession).
      const own = Array.isArray(state?.ownIsolatedModes) ? state.ownIsolatedModes : [];
      for (const [id, sealed] of Object.entries(state?.sessionIsolated ?? {})) if (sealed === true && !own.includes(state?.sessionModes?.[id])) sessions.add(id);
      const base = (path) => String(path ?? '').replace(/\/+$/, '').split('/').pop() ?? '';
      return {
        ids: rooms.map((ws) => String(ws.workspaceId)).filter((id) => SAFE_KEY.test(id)),
        sessions: [...sessions].map(String).filter((id) => SAFE_KEY.test(id)),
        labels: [...new Set(rooms.map((ws) => String(ws.title || base(ws.path)).trim()).filter(Boolean))],
        paths: [...new Set(rooms.flatMap((ws) => [String(ws.path ?? ''), roomKey(ws.path)]).filter(Boolean))],
      };
    }
    /** @returns {string} the CSS that hides those rows of the app's own list outside Recon ('' for none). */
    function reconHideCss(places) {
      const outside = 'html[data-cws-space]:not([data-cws-space="recon"])';
      const rules = [];
      for (const id of places.ids) {
        const row = `[data-row-key="workspace:${id}"]`;
        rules.push(`${outside} [class*='groupSection']:has(> ${row}, > * > ${row}){display:none !important}`);
      }
      if (places.sessions.length > 0) rules.push(`${places.sessions.map((id) => `${outside} [data-row-key="session:${id}"]`).join(',\n')}{display:none !important}`);
      return rules.join('\n');
    }
    /** Hides (outside Recon) or shows again the workspace list's rows that name Recon's room. */
    function hideRoomMenuRows(doc, places) {
      const outside = doc.documentElement?.getAttribute?.('data-cws-space');
      const hide = typeof outside === 'string' && outside !== '' && outside !== 'recon';
      for (const row of doc.querySelectorAll('[role="menu"] [role="menuitem"]')) {
        const label = String(row.textContent ?? '').replace(/\s+/g, ' ').trim();
        const titled = [...row.querySelectorAll('[title]')].map((one) => one.getAttribute('title'));
        const room = places.labels.includes(label) || titled.some((path) => places.paths.includes(path) || places.paths.includes(roomKey(path)));
        // Review: the app's menu rows set `display: flex` in their own CSS, which beats the `hidden` attribute, so the row
        // is also hidden inline.
        if (hide && room) {
          if (!row.hasAttribute('data-cws-room-hidden')) {
            row.hidden = true;
            row.style?.setProperty?.('display', 'none', 'important');
            row.setAttribute('data-cws-room-hidden', '');
          }
        } else if (row.hasAttribute('data-cws-room-hidden')) {
          row.hidden = false;
          row.style?.removeProperty?.('display');
          row.removeAttribute('data-cws-room-hidden');
        }
      }
    }
    /** Keeps both up to date (the library, the spaces, menus that open). @returns {() => void} stops. */
    function watchReconElsewhere(doc, library, model) {
      const style = doc.createElement('style');
      style.setAttribute('data-cws-recon-elsewhere', '');
      doc.head.appendChild(style);
      let places = { ids: [], sessions: [], labels: [], paths: [] };
      let queued = false;
      const rows = () => {
        if (queued) return;
        queued = true;
        Promise.resolve().then(() => { queued = false; try { hideRoomMenuRows(doc, places); } catch { /* a menu that went away */ } });
      };
      const update = () => {
        try { places = reconPlaces(library.get(), model.get()); } catch { return; }
        const css = reconHideCss(places);
        if (style.textContent !== css) style.textContent = css;
        rows();
      };
      update();
      const offLib = library.subscribe(update);
      const offModel = model.subscribe(update);
      // Only what can be a menu: a space change, or nodes added in or as a menu (not every streamed word of an answer).
      const menuIn = (node) => node?.nodeType === 1 && (node.matches?.('[role="menu"], [role="menuitem"]') || node.closest?.('[role="menu"]') || node.querySelector?.('[role="menu"]'));
      const seen = (records) => {
        if (records.some((record) => record.type === 'attributes' || menuIn(record.target) || [...(record.addedNodes ?? [])].some(menuIn))) rows();
      };
      const watch = typeof MutationObserver === 'function' ? new MutationObserver(seen) : null;
      watch?.observe(doc.body, { childList: true, subtree: true });
      watch?.observe(doc.documentElement, { attributes: true, attributeFilter: ['data-cws-space'] });
      return () => { offLib?.(); offModel?.(); watch?.disconnect(); style.remove(); };
    }
    /**
     * Whether a tab may open a remembered conversation by its folder: the room tab (Recon) only one in its
     * room, every other tab none there. Tabs share the app's empty draft of a folder, so without this a
     * Recon start page could open a draft of Code's folder, or Code one in Recon's room (18 November 2026).
     */
    function placeFits(tabId, session) {
      return (startPlaceOf(tabId) === 'room') === inIsolatedRoom(session?.cwd);
    }
    /**
     * Learn Recon's room once, up front: a test copy's room is not the usual one, and until it is known
     * another tab could start a conversation there. Without an answer the usual room stays the only one.
     */
    async function learnRoom() {
      try {
        const response = await fetch(new URL('dsh-recon/state?session=-', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
        const room = response.ok ? String((await response.json()).room ?? '') : '';
        if (!room) return;
        rooms.add(roomKey(room));
        isolatedRooms.add(roomKey(room));
      } catch { /* Recon is not there: nothing to learn */ }
    }
    /**
     * Start a conversation of the room tab (Recon), only in its room: asked again twice when the room
     * cannot be reached, and never in another folder (the app's own choice is the open conversation's
     * folder, where it would share that folder's draft). Without the room nothing starts.
     */
    function startRecon(appCtx, library, tabId, options) {
      const attempt = (left) => startInRoom(appCtx, library, tabId, options).then(
        (done) => { if (!done && left > 0) setTimeout(() => attempt(left - 1), 1000); },
        () => { if (left > 0) setTimeout(() => attempt(left - 1), 1000); },
      );
      void attempt(2);
    }
    /** Whether a conversation began in Recon (Modes marks it for good) and has run: Move to opens it as a new one. */
    function fromReconRow(id, session, state) {
      return state?.sessionIsolated?.[id] === true && !session?.blank;
    }
    /**
     * Move a conversation that began in Recon to another tab (the owner's choice, 18 November 2026). A
     * conversation cannot change its folder, and Recon's room is shared and emptied at every start, so a
     * NEW conversation of the tab opens in that tab's usual place (Scratch, or its project; never a room).
     * Recon copies the conversation's own files out of the room beside it and writes the whole
     * conversation there; the new one gets it as its first message. The original stays in Recon.
     * @returns {Promise<{label: string, files: number}>} the tab's name and how many files were copied.
     */
    async function moveOutOfRecon(appCtx, library, model, id, tabId) {
      const sessions = appCtx.get('sessions');
      const remote = appCtx.get('remote.session');
      const workspace = appCtx.get('uiWorkspace');
      if (!sessions?.create || !remote?.prompt || !workspace?.openSession) throw new Error('this version of the app cannot open a thread from here');
      const label = tabsOf(model.get()).find((m) => m.id === tabId)?.label ?? tabId;
      // Review B1: the same window as Recon's export door first (what leaves, warnings, files none ticked);
      // nothing is made, copied or sent before the user says yes.
      const consent = await askMoveConsent(id, label);
      if (!consent) return { cancelled: true, label, files: 0 };
      let cwd = '';
      let scratch = false;
      // Fix round: the project the new thread belongs to. Made in it (not only in its folder), so the app knows its
      // project and the chat box is not left waiting for a folder to be picked (spaces hide that picker in Chat).
      let workspaceId = '';
      if (startPlaceOf(tabId) === 'scratch') {
        try {
          const response = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
          const answer = response.ok ? await response.json() : {};
          cwd = String(answer.place ?? '');
          if (cwd) {
            scratchPlace.path = cwd;
            rooms.add(roomKey(cwd));
            hidden.add(roomKey(cwd));
            scratch = true;
            const known = (library.get().workspaces ?? []).find((entry) => entry && roomKey(entry.path) === roomKey(cwd));
            if (known) workspaceId = String(known.workspaceId ?? '');
            else {
              const made = await appCtx.get('workspaces').create({ path: cwd });
              workspaceId = String(made?.workspaceId ?? '');
              try { await appCtx.get('workspaces').rename(made.workspaceId, String(answer.title || 'Scratch')); } catch { /* the folder's own name is fine */ }
            }
          }
        } catch { cwd = ''; }
      }
      if (!cwd) {
        const home = homeFor(library.get(), tabId);
        cwd = home && !inIsolatedRoom(home.path) ? String(home.path ?? '') : '';
        workspaceId = cwd ? String(home.workspaceId ?? '') : '';
      }
      if (!cwd || inIsolatedRoom(cwd)) throw new Error('there is no folder to open it in');
      // In the tab's locked preset (Preset in this tab), when it has one: made in it from the start, so nothing depends on Modes' backstop.
      let preset = '';
      try { preset = lockedPresetIn(await presetTable(), tabId); } catch { preset = ''; }
      const where = workspaceId ? { workspaceId } : { cwd };
      const child = preset ? await sessions.create({ ...where, agentPreset: preset }) : await sessions.create(where);
      const title = String(library.get().byId?.[id]?.displayTitle ?? '').trim();
      const response = await fetch(new URL('dsh-recon/door', document.baseURI), {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'move', session: id, tab: tabId, sessionId: child, folder: scratch ? `${cwd}/${child}` : cwd, title, consent: true, files: consent.files, full: consent.full, agreeCloud: consent.agreeCloud }),
      });
      const done = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Refused (a cloud model Recon says Never to, for one): the empty conversation made for it is put away.
        try { await appCtx.get('workspaces').archiveSession(child); } catch { /* an empty conversation is harmless */ }
        throw new Error(done.error || `error ${response.status}`);
      }
      // Named after the original (the first line of the message is the export mark, not a title).
      try { await remote.rename?.({ sessionId: child, title: `From Recon: ${title || 'Untitled thread'}`.slice(0, 80) }); } catch { /* the app's own title stays */ }
      void model.select(tabId, label);
      try { appCtx.layout.selectPanel(null); } catch { /* already on the conversation */ }
      workspace.openSession(child);
      // The first message is a DRAFT: put in the chat box for the user to read and send, never sent here.
      void fillDraft(String(done.draft ?? ''));
      return { label: done.label || label, files: Number(done.files) || 0, drafted: true };
    }
    /** Put text in the chat box (once the new conversation shows it), without sending it. */
    async function fillDraft(text, { onlyEmpty = false } = {}) {
      if (!text) return;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        await new Promise((done) => setTimeout(done, 250));
        const boxes = [...document.querySelectorAll('[contenteditable="true"]')].filter((box) => box.offsetParent !== null && !box.closest('.cws-form'));
        const box = boxes[boxes.length - 1];
        if (!box) continue;
        if (onlyEmpty && String(box.innerText ?? '').trim() !== '') return;
        box.focus();
        if (putText(box, text)) return;
      }
    }
    /**
     * Round 2: text with its paragraph breaks kept. The app's editor drops the line breaks of one insertText, so the text
     * goes in as a paste (the editor makes its own paragraphs); when the editor does not take a paste, line by line
     * with a new paragraph between lines.
     * @returns {boolean} whether the text went in.
     */
    function putText(box, text) {
      try {
        const data = new DataTransfer();
        data.setData('text/plain', text);
        const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
        box.dispatchEvent(event);
        // The editor took the paste (it may draw it a moment later): done, never put in twice.
        if (event.defaultPrevented) return true;
      } catch { /* no DataTransfer here: line by line */ }
      const lines = String(text).split('\n');
      let went = false;
      lines.forEach((line, index) => {
        if (index > 0 && !document.execCommand('insertParagraph')) document.execCommand('insertLineBreak');
        if (line) went = document.execCommand('insertText', false, line) || went;
      });
      return went;
    }
    /**
     * The Move preview window (review B1): what leaves Recon, the warnings, the room's files (none ticked), and
     * the agreement for a cloud model when Settings → Recon → Models says Ask. Resolves what was chosen, or
     * null when cancelled (or the preview could not be read: then nothing moves).
     */
    function askMoveConsent(sessionId, label) {
      return new Promise((resolve) => {
        const style = (el, css) => { el.style.cssText = css; return el; };
        const node = (tag, css, text) => { const el = style(document.createElement(tag), css || ''); if (text !== undefined) el.textContent = text; return el; };
        const overlay = node('div', 'position:fixed;inset:0;z-index:2000;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35)');
        overlay.setAttribute('data-dsh-move-door', '');
        const box = node('div', 'box-sizing:border-box;width:460px;max-width:calc(100vw - 24px);max-height:calc(100vh - 48px);overflow-y:auto;padding:14px 16px;border-radius:16px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;box-shadow:0 8px 28px rgba(0,0,0,.28)');
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'Move out of Recon');
        overlay.appendChild(box);
        const done = (value) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(value); };
        const onKey = (event) => { if (event.key === 'Escape') { event.stopPropagation(); done(null); } };
        document.addEventListener('keydown', onKey, true);
        box.appendChild(node('h3', 'margin:0 0 6px;font-size:14px;line-height:22px;font-weight:500', 'Move out of Recon'));
        const status = node('div', '', 'Reading what would leave…');
        box.appendChild(status);
        document.body.appendChild(overlay);
        const address = new URL('dsh-recon/door', document.baseURI);
        address.searchParams.set('session', sessionId);
        address.searchParams.set('move', '1');
        fetch(address, { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } })
          .then(async (response) => { const data = await response.json().catch(() => ({})); if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`); return data; })
          .then((preview) => {
            status.remove();
            const section = (title, lines, warn) => {
              box.appendChild(node('div', 'font-weight:600;margin-top:8px', title));
              const list = node('ul', `margin:4px 0 0;padding-left:18px;color:var(${warn ? '--dsw-alias-state-warn-primary,var(--dsw-alias-label-secondary)' : '--dsw-alias-label-secondary'})`);
              for (const line of lines) list.appendChild(node('li', '', line));
              box.appendChild(list);
            };
            box.appendChild(node('div', '', `A new ordinary ${label} thread opens and the Recon original stays in Recon. Only what is listed here goes, and no message is sent until you press Send yourself.`));
            section('What leaves Recon', [...(preview.leaves ?? []), 'It is saved as summary.md in the new thread\'s folder; the first message in the chat box only names it.']);
            const files = Array.isArray(preview.files) ? preview.files : [];
            const ticks = new Map();
            if (files.length > 0) {
              box.appendChild(node('div', 'font-weight:600;margin-top:8px', `Files in Recon's room (${files.length}), none ticked`));
              for (const file of files) {
                const row = node('label', 'display:flex;gap:6px;align-items:baseline;margin:2px 0');
                const tick = node('input'); tick.type = 'checkbox'; tick.checked = false;
                ticks.set(file.path, tick);
                row.appendChild(tick);
                row.appendChild(node('span', '', `${file.path} (${file.text ? 'text' : 'not text, copied unopened'}, ${Math.ceil((file.size || 0) / 1024)} KB)`));
                box.appendChild(row);
              }
            }
            const fullRow = node('label', 'display:flex;gap:6px;align-items:baseline;margin-top:8px');
            const fullTick = node('input'); fullTick.type = 'checkbox'; fullTick.checked = false;
            fullRow.appendChild(fullTick);
            fullRow.appendChild(node('span', '', 'Also save the whole thread as conversation.md (every page it read, in full). The new thread\'s model can read it.'));
            box.appendChild(fullRow);
            let cloudTick;
            if (preview.cloudModels === 'ask') {
              const row = node('label', 'display:flex;gap:6px;align-items:baseline;margin-top:6px');
              cloudTick = node('input'); cloudTick.type = 'checkbox'; cloudTick.checked = false;
              row.appendChild(cloudTick);
              row.appendChild(node('span', '', 'If the new thread\'s model is a cloud model, I agree that what is listed above may go to it.'));
              box.appendChild(row);
            } else if (preview.cloudModels === 'never') {
              box.appendChild(node('div', 'margin-top:6px', 'Cloud models are switched off for Recon (Settings → Recon → Models): if the new thread\'s model is in the cloud, the move is refused and nothing is made.'));
            } else box.appendChild(node('div', 'margin-top:6px', 'Settings → Recon → Models allows cloud models: the summary may go to a cloud model once you press Send.'));
            if (preview.notKept) box.appendChild(node('div', 'margin-top:6px;color:var(--dsw-alias-label-secondary)', preview.notKept));
            section('What never leaves', preview.never ?? []);
            section('Once it is out, Recon\'s rules no longer hold for the copy', preview.warnings ?? [], true);
            if (preview.running) box.appendChild(node('div', 'margin-top:8px;color:var(--dsw-alias-state-error-primary)', 'Recon is running in this thread: move it when the run is done.'));
            const row = node('div', 'display:flex;gap:8px;justify-content:flex-end;margin-top:12px');
            const cancel = node('button', 'cursor:pointer', 'Cancel'); cancel.type = 'button'; cancel.className = 'dsh-rc-btn';
            const go = node('button', 'cursor:pointer', 'Move'); go.type = 'button'; go.className = 'dsh-rc-btn'; go.disabled = preview.running === true;
            cancel.onclick = () => done(null);
            go.onclick = () => done({ files: [...ticks].filter(([, tick]) => tick.checked).map(([path]) => path), full: fullTick.checked, agreeCloud: cloudTick ? cloudTick.checked : false });
            row.appendChild(cancel); row.appendChild(go); box.appendChild(row);
            cancel.focus();
          })
          .catch((problem) => {
            status.textContent = `Nothing was moved: the preview could not be read (${String(problem?.message ?? problem).slice(0, 160)}).`;
            const close = node('button', 'margin-top:10px;cursor:pointer', 'Close'); close.type = 'button'; close.className = 'dsh-rc-btn';
            close.onclick = () => done(null); box.appendChild(close);
          });
      });
    }
    /** Projects Plus keeps out of its own project lists: the hidden Scratch place (learnScratch). */
    const hidden = new Set();

    /**
     * Scratch (step 32, no button yet): one hidden project in the app's home with a sub-folder per
     * thread, which the add-on's host side looks after. The page learns where it is, once, so no
     * other tab starts a conversation there by 'last used' and Plus's project lists leave it out.
     * Asking makes no folder. Without an answer nothing changes.
     */
    const scratchPlace = { path: '' };
    /**
     * A Scratch conversation's own folder (where its files are): `<place>/<its id>` for a thread recorded
     * at the place, else the thread folder its folder is in. '' for anything else.
     */
    function scratchFolderOfRow(id, cwd, projectPath) {
      const place = roomKey(scratchPlace.path);
      if (!place) return '';
      const here = roomKey(cwd || projectPath);
      if (here === place) return /^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$/.test(String(id)) ? `${place}/${id}` : '';
      if (!here.startsWith(`${place}/`)) return '';
      const first = here.slice(place.length + 1).split('/')[0];
      return first ? `${place}/${first}` : '';
    }
    /**
     * Scratch clean-up (step 43): which Scratch conversations not used for `days` days go to the trash.
     * Never one that is working, open or pinned: those are named instead. Helpers go with their conversation.
     * @returns {{take: string[], skipped: {id: string, why: 'running'|'open'|'pinned'}[]}} the plan.
     */
    function cleanupPlan(ids, lib, options) {
      const { days, now, pinned } = options;
      const cutoff = now - days * 86400000;
      const take = [];
      const skipped = [];
      for (const id of ids) {
        const row = lib?.byId?.[id];
        if (!row || row.origin === 'subagent' || row.blank) continue;
        if (!(Number(row.updatedAt) <= cutoff)) continue;
        if (row.running === true) skipped.push({ id, why: 'running' });
        else if (id === lib.currentId) skipped.push({ id, why: 'open' });
        else if (pinned.has(id)) skipped.push({ id, why: 'pinned' });
        else take.push(id);
      }
      return { take, skipped };
    }

    /** Whether a conversation's folder is the Scratch place or inside it (as far as the page can tell: by its path). */
    function inScratch(cwd) {
      const place = roomKey(scratchPlace.path);
      const here = roomKey(cwd);
      return Boolean(place) && Boolean(here) && (here === place || here.startsWith(`${place}/`));
    }
    async function learnScratch() {
      try {
        const response = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
        const place = response.ok ? String((await response.json()).place ?? '') : '';
        if (!place) return '';
        scratchPlace.path = place;
        rooms.add(roomKey(place));
        hidden.add(roomKey(place));
        return place;
      } catch {
        return '';
      }
    }

    /**
     * Start a Scratch thread (no button calls this yet): the place is made, registered as the project
     * 'Scratch' the first time, and the app starts a conversation there. The app reuses an unsent
     * conversation of that project instead of making another (its createInWorkspace), so clicking
     * twice leaves no empty thread. Returns false when it could not, so the caller can start as usual.
     */
    async function startInScratch(appCtx, library, options, tabId) {
      const response = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      const answer = response.ok ? await response.json() : {};
      const place = String(answer.place ?? '');
      if (!place) return false;
      scratchPlace.path = place;
      rooms.add(roomKey(place));
      hidden.add(roomKey(place));
      let ws = (library.get().workspaces ?? []).find((entry) => entry && roomKey(entry.path) === roomKey(place));
      if (!ws) {
        ws = await appCtx.get('workspaces').create({ path: place });
        try { await appCtx.get('workspaces').rename(ws.workspaceId, String(answer.title || 'Scratch')); } catch { /* the folder's own name is fine */ }
      }
      if (!ws?.workspaceId) return false;
      appCtx.uiWorkspace.startSession(ws.workspaceId, tabId ? await withTabPreset(tabId, options) : options);
      return true;
    }

    /**
     * The project a new conversation of an ordinary tab starts in. The app's own choice is the open
     * conversation's project, else the most recently used one; this makes the same choice but skips
     * isolated rooms, so files of a Cowork or Code conversation are never put where they get deleted.
     * Chat keeps its default workspace. Returns null when the app may choose (nothing is ready yet).
     */
    function homeFor(lib, tabId) {
      // Chat keeps the default workspace; without one it chooses as the other tabs do, so it never lands in Recon's room
      // (where the app would reuse the room's blank draft).
      const chatHome = tabId === 'chat' ? defaultWorkspace(lib?.workspaces) : null;
      if (chatHome) return chatHome;
      if (!lib || !lib.ok) return null;
      const workspaces = (Array.isArray(lib.workspaces) ? lib.workspaces : []).filter((ws) => ws && ws.workspaceId);
      const usable = workspaces.filter((ws) => !rooms.has(roomKey(ws.path)));
      if (usable.length === workspaces.length) return null; // no room among them: the app's own choice is safe
      const current = lib.currentId ? usable.find((ws) => (ws.sessionIds ?? []).includes(lib.currentId)) : null;
      if (current) return current;
      // The most recently used project, timed the way the app times it.
      let best = null;
      let bestTime = Number.NEGATIVE_INFINITY;
      for (const ws of usable) {
        let latest = Number.NEGATIVE_INFINITY;
        for (const id of ws.sessionIds ?? []) {
          const at = Number(lib.byId?.[id]?.updatedAt);
          if (Number.isFinite(at)) latest = Math.max(latest, at);
        }
        if (latest === Number.NEGATIVE_INFINITY) latest = Date.parse(ws.createdAt);
        if (!Number.isFinite(latest)) latest = Number.NEGATIVE_INFINITY;
        if (best === null || latest > bestTime) { best = ws; bestTime = latest; }
      }
      return best ?? defaultWorkspace(workspaces);
    }

    /**
     * The New button's text: the saved layout's own, else the app's translated text for its own
     * tabs, else the built-in copy for a tab another add-on brings (Research, Scout), else the
     * generic text. The saved layout may lack such a tab, as tabEntry allows for the greeting.
     */
    function newLabelFor(layout, tabId, t, defaults) {
      const own = layout?.[tabId]?.newLabel;
      if (typeof own === 'string' && own.trim()) return own.trim();
      if (['chat', 'cowork', 'code', 'research', 'scout'].includes(tabId)) return t('new.' + tabId);
      const builtIn = defaults?.[tabId]?.newLabel;
      if (typeof builtIn === 'string' && builtIn.trim()) return builtIn.trim();
      return t('new.other');
    }

    /**
     * Fix round: with spaces, a New click claims the thread it opens for its space with `reset`, so a blank draft the app
     * reuses (one per folder) starts in the space's start mode, not in a mode picked for it before (the Automations
     * mode, or a mode the Cowork switch carried).
     * @returns {Promise<string>} the thread's id ('' when none opened in time, or without spaces).
     */
    async function claimNew(library, before, tabId, appCtx) {
      if (!spaceMode.on) return '';
      const id = await waitForBlank(library, before);
      if (!id) return '';
      const space = isSpaceId(tabId) ? tabId : spaceOfTabId(tabId) ?? 'chat';
      // Item 4A, stage 6a: through startForSpace, so a draft Modes keeps in another space opens a fresh one here.
      try { await startForSpace(appCtx, library, id, space, { reset: true }); } catch { /* the sidebar and the chat box claim it too */ }
      return id;
    }

    function startNew(appCtx, library, tabId) {
      try { appCtx.layout.selectPanel(null); } catch { /* already on the conversation */ }
      let before = '';
      try { before = library.get()?.currentId ?? ''; } catch { before = ''; }
      const claimed = claimNew(library, before, tabId, appCtx).catch(() => '');
      holdForNew(claimed);
      const inFolder = () => {
        let home = null;
        try { home = homeFor(library.get(), tabId); } catch { home = null; }
        startLocked(appCtx, tabId, home ? home.workspaceId : undefined);
      };
      const place = startPlaceOf(tabId);
      if (place === 'room') {
        startRecon(appCtx, library, tabId);
        return claimed;
      }
      // Scratch, when the page can reach it; otherwise the usual folder, so a New click always starts something.
      if (place === 'scratch') {
        startInScratch(appCtx, library, undefined, tabId).then((done) => { if (!done) inFolder(); }, inFolder);
        return claimed;
      }
      inFolder();
      return claimed;
    }

    /**
     * Item 4A, stage 3b: wait for the new thread a start opens (the app opens it a moment later and may reuse a blank
     * one). The open thread counts once it is blank, has stayed the same for two looks, and is a new one (or the old
     * blank, after a second and a half).
     * @returns {Promise<string>} its id, or '' when none opened in time.
     */
    async function waitForBlank(library, before, { every = 150, limit = 8000, sleep = (ms) => new Promise((done) => setTimeout(done, ms)), now = () => Date.now() } = {}) {
      const start = now();
      let seen = '';
      while (now() - start < limit) {
        await sleep(every);
        const snap = library.get();
        const id = snap?.currentId ?? '';
        const blank = Boolean(id && snap.byId?.[id]?.blank);
        if (!blank) { seen = ''; continue; }
        if (id === seen && (id !== before || now() - start > 1500)) return id;
        seen = id;
      }
      return '';
    }

    /** One call to Modes' Mode route; throws its sentence. */
    async function modeCall(body, lang = 'en') {
      const response = await fetch(new URL('dsh-modes/mode', document.baseURI), {
        method: 'POST', cache: 'no-store', credentials: 'same-origin',
        headers: { accept: 'application/json', 'content-type': 'application/json', 'x-dsh-locale': lang },
        body: JSON.stringify(body),
      });
      let data = null;
      try { data = await response.json(); } catch { data = null; }
      if (!data || data.ok === false) throw new Error(data?.error || `error ${response.status}`);
      return data.value;
    }

    /** Item 4A, stage 6a: the window's model (set once at start), so a start's answer can show a line under the tabs. */
    const shellModel = { current: null };
    /**
     * Item 4A, stage 6a: drafts Modes answered with `keptIn` (a fresh draft was opened once for each; again only for a New
     * click that lands on it once more, stage 7).
     */
    const keptDrafts = new Set();
    /** Stage 7 (6b lab leftover): kept drafts whose fresh draft is being opened now (never two at once for one). */
    const freshOpening = new Set();
    /** Item 4A, stage 6a: guarded starts not answered yet, by draft id; the first send waits for them (at most SEND_WAIT_MS). */
    const pendingStarts = new Map();
    const SEND_WAIT_MS = 2000;
    /**
     * Stage 7 lab re-check (bug A): New clicks whose draft is not open and claimed yet. Held from the click on, so a
     * message sent at once into the blank draft still open (before the app's delayed start lands) is not run there while
     * the window then moves to another, empty draft. A send waits at most NEW_SEND_WAIT_MS (longer than waitForBlank's
     * 8 s, so a New that finds nothing in time still gives the send back).
     */
    const newStarts = new Set();
    const NEW_SEND_WAIT_MS = 9000;
    /** Stage 7 lab re-check (bug A): hold first sends while a New click's draft is being opened and claimed (spaces on). */
    function holdForNew(claimed) {
      if (!spaceMode.on) return;
      const settled = Promise.resolve(claimed).then(() => undefined, () => undefined);
      newStarts.add(settled);
      void settled.then(() => { newStarts.delete(settled); });
    }
    /** Lab fix (6a): the last refusal a Recon start showed (taken away when a Recon start works). */
    let lastReconRefusal = '';

    /**
     * Item 4A, stage 6a: claim a draft for a space through Modes' start and act on its answer. `{claimed: false, keptIn}`
     * (the draft is recorded in another space; the app reuses one blank draft per folder) opens a fresh draft here and
     * says so (DRAFT_KEPT); a refusal in Recon (a Recon thread outside Recon's room) shows Modes' sentence. A start for a
     * guarded space is remembered until it is answered, so a first message sent at once waits for it.
     * @returns {Promise<object>} Modes' answer (throws its sentence).
     */
    async function startForSpace(appCtx, library, id, space, extra = {}) {
      // Stage 7 (6b lab leftover): a New click (`reset`) never leaves another space's draft open under this space's button.
      const forNew = extra?.reset === true;
      const work = startForSpaceNow(appCtx, library, id, space, extra, forNew);
      // A first message waits for a guarded start, and for a New click's start (until its fresh draft is open), so it
      // runs in the space whose New was clicked.
      if (GUARDED_SPACE_IDS.includes(space) || forNew) {
        const settled = work.then(() => undefined, () => undefined);
        pendingStarts.set(id, settled);
        void settled.then(() => { if (pendingStarts.get(id) === settled) pendingStarts.delete(id); });
      }
      return work;
    }
    async function startForSpaceNow(appCtx, library, id, space, extra, forNew) {
      const call = modeCall({ action: 'start', sessionId: id, space, ...extra });
      let value;
      try {
        value = await call;
      } catch (error) {
        const text = String(error?.message ?? error);
        if (space === 'recon' && !/unknown session|not open|no thread/i.test(text)) {
          shellModel.current?.fail?.(text);
          lastReconRefusal = text;
        }
        throw error;
      }
      // Lab fix (6a): a Recon start that worked takes Recon's earlier "work only in Recon's room" line away.
      if (space === 'recon' && lastReconRefusal) {
        shellModel.current?.clearFail?.(lastReconRefusal);
        lastReconRefusal = '';
      }
      const started = value?.started ?? value;
      const keptIn = started?.keptIn;
      // Stage 7 (6b lab leftover): a New click that lands on a kept draft again (the app reuses one blank draft per folder)
      // opens a fresh one again, unless the window already left it or one is being opened for it.
      let openNow = false;
      try { openNow = library.get()?.currentId === id; } catch { openNow = false; }
      const again = forNew && keptDrafts.has(id) && !freshOpening.has(id) && openNow;
      if (started?.claimed === false && isSpaceId(keptIn) && keptIn !== space && (!keptDrafts.has(id) || again)) {
        keptDrafts.add(id);
        freshOpening.add(id);
        const t = appCtx.locale.bind(NS);
        let fresh = '';
        try { fresh = await openFreshDraft(appCtx, library, id, space); } catch { fresh = ''; } finally { freshOpening.delete(id); }
        // Lab re-check 2 (6a, problem 2): no fresh draft could open here (a Recon window and a folder outside its room),
        // so the window follows the draft to its own space instead of showing another space's draft under this button.
        // Never into Recon: a draft kept there is left as before.
        const follow = !fresh && keptIn !== 'recon' && typeof shellModel.current?.select === 'function';
        // Stage 7: the window moves first, then the line is shown (a space change takes such lines away).
        if (follow) {
          try { await shellModel.current.select(keptIn); } catch { /* the line says what happened; the space button still works */ }
        }
        shellModel.current?.note?.(t(follow ? 'draft.followed' : 'draft.kept', { space: t(`space.${keptIn}`), from: t(`space.${space}`) }));
      }
      return value;
    }

    /**
     * Item 4A, stage 6a: a new blank draft in the kept draft's project (made with the app's create, which never reuses a
     * blank), opened and claimed for the window's space. Never in Recon's room for another space, and for Recon only in
     * its room; otherwise nothing opens (the line still says why, and New starts one).
     * @returns {Promise<string>} the new draft's id ('' when none was opened).
     */
    async function openFreshDraft(appCtx, library, keptId, space) {
      const sessions = appCtx.get('sessions');
      const workspace = appCtx.get('uiWorkspace');
      if (!sessions?.create || !workspace?.openSession) return '';
      const ws = (library.get()?.workspaces ?? []).find((item) => (item?.sessionIds ?? []).includes(keptId)) ?? null;
      if (!ws?.workspaceId || (space === 'recon') !== inIsolatedRoom(ws.path)) return '';
      let preset = '';
      try { preset = lockedPresetIn(await presetTable(), SPACE_TAB[space] ?? space); } catch { preset = ''; }
      const child = await sessions.create(preset ? { workspaceId: ws.workspaceId, agentPreset: preset } : { workspaceId: ws.workspaceId });
      if (!child) return '';
      workspace.openSession(child);
      try { await startForSpace(appCtx, library, child, space); } catch { /* the sidebar claims it again when it shows */ }
      return child;
    }

    /**
     * Item 4A, stage 6a (LEAK 10): a first message sent before a guarded draft's start is answered waits for it (at most
     * SEND_WAIT_MS), so the thread's first turn already has its space (Modes holds the turn too). Enter in the chat box
     * and its Send button are held, then given back once. Nothing is held for a thread that has run, or once answered.
     * Stage 7 lab re-check (bug A): from a New click on (newStarts), a send into a blank draft waits until the New's own
     * draft is open and claimed (at most NEW_SEND_WAIT_MS), so it runs there and the window stays on it.
     * Stage 7 (point 29): the same for a send in a thread that has run, while a New click's draft is being opened: it waits,
     * then goes to the new draft. The typed text goes along when the new chat box is empty (the app keeps a draft per
     * thread); when that cannot be done, or the new draft never opened, nothing is sent and `say` tells what to do. With
     * no New click pending, a send in a thread that has run is never held.
     * Point 29 (lead): while a send waits for a New click's draft, `waitLine('send.waiting')` shows a line above the chat
     * box; `waitLine('')` takes it away once the send goes out or the wait ends (then `say`'s lines take over).
     * Stage 7 lab (bug D): the app keeps the moved text in the old thread's chat box too. It is remembered per old thread
     * (in memory and in `store`, the window's sessionStorage); when that thread's chat box is shown again holding exactly
     * that text, the box is cleared and `say('send.alreadySent')` shows once. Text the owner changed is left alone. An Enter
     * or Send there with exactly that text before it could be cleared is held, and `askAgain()` decides (true: sent here too).
     * @returns {() => void} removes the listeners.
     */
    function holdSendsForStarts(doc, library, { wait = SEND_WAIT_MS, newWait = NEW_SEND_WAIT_MS, say = () => {}, settle = 60, waitLine = () => {}, askAgain = async () => false, store = null, recheck = [0, 150, 400, 1000, 2000] } = {}) {
      let passing = false;
      // How many sends wait for a New click's draft now: the line stays while one does.
      let newWaits = 0;
      const line = (on) => {
        newWaits = Math.max(0, newWaits + (on ? 1 : -1));
        try { waitLine(newWaits > 0 ? 'send.waiting' : ''); } catch { /* only a line; the send goes on either way */ }
      };
      const openDraft = () => {
        try {
          const snap = library.get();
          const id = snap?.currentId ?? '';
          return id && snap.byId?.[id]?.blank ? id : '';
        } catch { return ''; }
      };
      const held = () => {
        const id = openDraft();
        if (!id) return null;
        const waits = [];
        if (pendingStarts.has(id)) waits.push(Promise.race([pendingStarts.get(id), new Promise((done) => setTimeout(done, wait))]));
        // Stage 7 lab re-check (bug A): a New click not settled yet holds a send into any blank draft open now (the one
        // shown at the click, before the app's start lands), until its own draft is open and claimed.
        if (newStarts.size > 0) waits.push(Promise.race([Promise.all([...newStarts]), new Promise((done) => setTimeout(done, newWait))]));
        if (waits.length === 0) return null;
        // Then the draft open by now (the New's, or one the app reused) is waited for too, when its start is pending.
        return Promise.all(waits).then(() => {
          const now = openDraft();
          return now && now !== id && pendingStarts.has(now) ? Promise.race([pendingStarts.get(now), new Promise((done) => setTimeout(done, wait))]) : undefined;
        });
      };
      const giveBack = (send) => { passing = true; try { send(); } finally { passing = false; } };
      // Stage 7 lab (bug D): moved texts by the thread they were typed in (kept for this window's session).
      const MOVED_KEY = 'cws-moved-sends';
      const moved = new Map();
      try {
        const kept = JSON.parse(store?.getItem?.(MOVED_KEY) ?? '{}');
        for (const [id, text] of Object.entries(kept && typeof kept === 'object' ? kept : {})) if (typeof text === 'string' && text) moved.set(id, text);
      } catch { /* nothing kept */ }
      const keepMoved = () => {
        try {
          const small = [...moved].slice(-20).filter(([, text]) => text.length <= 20000);
          if (small.length === 0) store?.removeItem?.(MOVED_KEY); else store?.setItem?.(MOVED_KEY, JSON.stringify(Object.fromEntries(small)));
        } catch { /* memory only */ }
      };
      const remember = (from, text) => { if (!from || !text) return; moved.delete(from); moved.set(from, text); keepMoved(); };
      const forget = (from) => { if (moved.delete(from)) keepMoved(); };
      const currentId = () => { try { return library.get()?.currentId ?? ''; } catch { return ''; } };
      // The app may have drawn a new chat box meanwhile: the send goes to the one shown now (with what it holds).
      const shownNow = (element, find) => (element?.isConnected === false ? find() ?? null : element);
      const textOf = (editor) => String(editor?.value ?? editor?.innerText ?? editor?.textContent ?? '').trim();
      const shownEditor = () => doc.querySelector?.('[data-composer-input]') ?? null;
      /** Stage 7 lab (bug D): whether a send in the open thread would send again what was moved from it. */
      const sentBefore = (editor) => {
        // Spaces off: no message is ever moved, and nothing here changes a send.
        if (!spaceMode.on || !editor) return '';
        const id = currentId();
        const text = id ? moved.get(id) : undefined;
        return text !== undefined && textOf(editor) === text ? id : '';
      };
      /** Empties the shown chat box the way the owner would (a text field, or the app's editor). */
      const clearBox = (editor) => {
        try {
          editor.focus?.();
          if (typeof editor.value === 'string') {
            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editor), 'value')?.set;
            if (setter) setter.call(editor, ''); else editor.value = '';
            editor.dispatchEvent?.(new Event('input', { bubbles: true }));
          } else {
            // Only inside the chat box: never select and delete anything else that has the focus.
            const focused = doc.activeElement;
            if (focused !== undefined && focused !== editor && !editor.contains?.(focused)) return;
            doc.execCommand?.('selectAll', false);
            // The app's chat box is a Lexical editor, which ignores execCommand('delete') but takes a delete as a
            // beforeinput event (stage 7 lab). A plain editable box does not take that event: execCommand deletes there.
            const InputEventOf = doc.defaultView?.InputEvent ?? globalThis.InputEvent;
            const del = typeof InputEventOf === 'function' ? new InputEventOf('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }) : null;
            const taken = del ? editor.dispatchEvent?.(del) === false || del.defaultPrevented === true : false;
            if (!taken) doc.execCommand?.('delete', false);
          }
        } catch { /* checked by the caller */ }
      };
      /** The old thread is shown again: clear its box once when it holds exactly the moved text (never other text). */
      let visit = 0;
      // Clears whose result is not looked at yet: no other check runs meanwhile.
      let clearing = 0;
      const lookAgain = () => {
        const id = currentId();
        if (!spaceMode.on || !id || !moved.has(id)) return;
        const mine = ++visit;
        const check = (last) => {
          if (mine !== visit || currentId() !== id || movePending || passing || asking || clearing > 0) return;
          const text = moved.get(id);
          const box = shownEditor();
          // Still empty at the last look: the app kept no copy here, so there is nothing to clear or ask about.
          if (last && box && !textOf(box)) { forget(id); return; }
          // Not drawn yet, still empty while the app puts the thread's draft back, or another text (the owner's edit, or
          // the box of the thread shown before): left alone, and looked at again on the next check.
          if (text === undefined || !box || textOf(box) !== text) return;
          clearBox(box);
          // The editor may draw its change a moment later: looked at after `settle`. Not cleared: the text stays, and an
          // Enter or Send with it still asks first.
          clearing += 1;
          setTimeout(() => {
            clearing -= 1;
            if (!moved.has(id) || currentId() !== id || textOf(shownNow(box, shownEditor)) !== '') return;
            forget(id);
            say('send.alreadySent');
          }, settle);
        };
        recheck.forEach((after, index) => setTimeout(() => check(index === recheck.length - 1), after));
      };
      let seen = currentId();
      const offLibrary = typeof library.subscribe === 'function' ? library.subscribe(() => {
        const id = currentId();
        if (id === seen) return;
        seen = id;
        visit += 1;
        lookAgain();
      }) : null;
      if (seen) lookAgain();
      /** Another message sent in that thread: the moved copy is no longer in its box, so nothing is asked later. */
      const otherSend = (editor) => { const id = currentId(); if (id && moved.has(id) && textOf(editor)) forget(id); };
      /** Enter or Send with exactly the moved text before it was cleared: held, and asked. */
      let asking = false;
      const askFirst = (id, send) => {
        if (asking) return;
        asking = true;
        void Promise.resolve().then(() => askAgain()).catch(() => false).then((yes) => {
          asking = false;
          if (yes !== true) return;
          forget(id);
          if (currentId() === id) giveBack(send);
        }).catch(() => { /* the text stays in the chat box */ });
      };
      /** Stage 7 (point 29): a send in a thread that has run while a New click's draft opens: the thread, and the wait. */
      // One move at a time: any other Enter or Send while one waits is swallowed (the text is sent once, by the move).
      let movePending = false;
      const swallow = (event) => { event.preventDefault(); event.stopImmediatePropagation(); };
      const heldForNew = () => {
        if (newStarts.size === 0 || openDraft()) return null;
        let from = '';
        try { from = library.get()?.currentId ?? ''; } catch { from = ''; }
        if (!from) return null;
        return { from, wait: Promise.race([Promise.all([...newStarts]), new Promise((done) => setTimeout(done, newWait))]) };
      };
      /** Puts the typed text into an empty chat box the way typing does (a text field, or the app's editor). */
      const putText = (editor, text) => {
        try {
          editor.focus?.();
          if (typeof editor.value === 'string') {
            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(editor), 'value')?.set;
            if (setter) setter.call(editor, text); else editor.value = text;
            editor.dispatchEvent?.(new Event('input', { bubbles: true }));
          } else doc.execCommand?.('insertText', false, text);
        } catch { /* checked below: the send is not given back unless the text is there */ }
      };
      /** After the wait: send in the New's draft, with the typed text moved there; else keep it and say what to do. */
      const moveAndSend = async (from, text, send) => {
        const now = openDraft();
        if (!now || now === from) { say('send.newNotOpen'); return; }
        const box = shownEditor();
        if (!box) { say('send.notMoved'); return; }
        if (text && textOf(box) !== text) {
          // Never over what the new box already holds.
          if (textOf(box)) { say('send.notMoved'); return; }
          putText(box, text);
          await new Promise((done) => setTimeout(done, settle));
          if (textOf(box) !== text) { say('send.notMoved'); return; }
        }
        giveBack(() => send(box));
        // Stage 7 lab (bug D): the old thread's box keeps a copy; it is cleared when that thread is shown again (the window
        // shows the new thread now, so showing the old one is a change even if the list did not report this one).
        remember(from, text);
        seen = currentId();
      };
      const pressEnter = (editor) => editor?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
      const onKey = (event) => {
        if (passing || event.key !== 'Enter' || event.shiftKey || event.isComposing === true) return;
        const editor = event.target?.closest?.('[data-composer-input]');
        if (!editor) return;
        if (movePending) { swallow(event); return; }
        const forNew = newStarts.size > 0;
        const waiting = held();
        if (!waiting) {
          const moving = heldForNew();
          if (!moving) {
            // Stage 7 lab (bug D): the moved text again, in the thread it was moved from: asked first.
            const again = sentBefore(editor);
            if (!again) { otherSend(editor); return; }
            swallow(event);
            askFirst(again, () => pressEnter(shownNow(editor, shownEditor)));
            return;
          }
          event.preventDefault();
          event.stopImmediatePropagation();
          const text = textOf(editor);
          movePending = true;
          line(true);
          void moving.wait.then(() => moveAndSend(moving.from, text, pressEnter)).catch(() => { /* the text stays in the chat box */ }).finally(() => { movePending = false; line(false); });
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (forNew) line(true);
        void waiting.then(() => giveBack(() => pressEnter(shownNow(editor, () => doc.querySelector?.('[data-composer-input]'))))).finally(() => { if (forNew) line(false); });
      };
      const onClick = (event) => {
        if (passing) return;
        const button = event.target?.closest?.('button');
        if (!button || !button.closest?.('[data-composer-seat]')) return;
        // Input matching, kept on purpose (owner decision 28): when the app is set to Chinese, its Send button has a Chinese label.
        if (!/send|发送/i.test(`${button.getAttribute?.('aria-label') ?? ''} ${button.getAttribute?.('title') ?? ''}`)) return;
        const label = button.getAttribute?.('aria-label') ?? '';
        const sendButton = () => [...(doc.querySelectorAll?.('[data-composer-seat] button') ?? [])].find((item) => (item.getAttribute?.('aria-label') ?? '') === label);
        if (movePending) { swallow(event); return; }
        const forNew = newStarts.size > 0;
        const waiting = held();
        if (!waiting) {
          const moving = heldForNew();
          if (!moving) {
            // Stage 7 lab (bug D): as for Enter.
            const box = button.closest?.('[data-composer-seat]')?.querySelector?.('[data-composer-input]') ?? shownEditor();
            const again = sentBefore(box);
            if (!again) { otherSend(box); return; }
            swallow(event);
            askFirst(again, () => shownNow(button, sendButton)?.click());
            return;
          }
          event.preventDefault();
          event.stopImmediatePropagation();
          const text = textOf(button.closest?.('[data-composer-seat]')?.querySelector?.('[data-composer-input]') ?? shownEditor());
          movePending = true;
          line(true);
          void moving.wait.then(() => moveAndSend(moving.from, text, () => sendButton()?.click())).catch(() => { /* the text stays in the chat box */ }).finally(() => { movePending = false; line(false); });
          return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (forNew) line(true);
        void waiting.then(() => giveBack(() => shownNow(button, sendButton)?.click())).finally(() => { if (forNew) line(false); });
      };
      doc.addEventListener('keydown', onKey, true);
      doc.addEventListener('click', onClick, true);
      return () => { visit += 1; try { offLibrary?.(); } catch { /* gone */ } doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('click', onClick, true); };
    }

    /**
     * Item 4A, stage 3b: open a new thread in a space, in a given mode (the Automations page's "Ask about automations":
     * Chat, Automations mode). The window switches to the space, the space's New starts the thread, and the mode is
     * picked through Modes itself, so a refusal comes back as Modes' sentence.
     * @returns {Promise<string>} the new thread's id.
     */
    async function startInMode(appCtx, library, model, space, mode) {
      const t = appCtx.locale.bind(NS);
      await model.select(space);
      const before = library.get()?.currentId ?? '';
      // The New's own claim (with `reset`) lands first, so the mode picked below is the one that stays.
      const opened = await startNew(appCtx, library, SPACE_TAB[space]);
      const id = opened || await waitForBlank(library, before);
      if (!id) throw new Error(t('start.mode.none'));
      await startForSpace(appCtx, library, id, space);
      if (mode) await modeCall({ action: 'pick', sessionId: id, modeId: mode });
      void model.refresh();
      return id;
    }

    function CoworkSidebar(props) {
      const { collapsed, width, drawer, renderSlot, renderFactorySlot, usePanelInfo, appCtx, model, pages, sections, library, trash, projects } = props;
      const libSnap = useSyncExternalStore(library.subscribe, library.get);
      const libReady = libSnap.ok && model.get().modesOn;
      const [showAll, setShowAllState] = useState(() => { try { return window.localStorage.getItem(LIST_KEY) === '1'; } catch { return false; } });
      const setShowAll = (value) => { setShowAllState(value); try { window.localStorage.setItem(LIST_KEY, value ? '1' : '0'); } catch { /* private mode */ } };
      const t = appCtx.locale.bind(NS);
      // The search icon shows while the Global Search add-on is there.
      const [hasGlobal, setHasGlobal] = useState(() => window.__dshGlobalSearch === true);
      useEffect(() => {
        const update = () => setHasGlobal(window.__dshGlobalSearch === true);
        window.addEventListener('dsh-search:ready', update);
        update();
        return () => window.removeEventListener('dsh-search:ready', update);
      }, []);
      const state = useSyncExternalStore(model.subscribe, model.get);
      const allPages = useSyncExternalStore(pages.subscribe, pages.get);
      const active = typeof usePanelInfo === 'function' ? usePanelInfo((info) => info.activePanelId) : null;
      const entryActions = useSyncExternalStore(
        useCallback((l) => appCtx.slots.subscribe('sidebar.panellist.actions', l), []),
        () => appCtx.slots.entriesOfSlot('sidebar.panellist.actions').length > 0,
      );
      const tabsRef = useRef(null);
      const shortcut = useNewSessionShortcut(appCtx);

      useEffect(() => {
        // Read when Settings changes (another window, the /mode command, Settings → Modes), every 30 s as a safety net, never while hidden.
        const watcher = dshPoll.loop(() => model.refresh(), { every: 30000 });
        const off = dshPoll.onChange(appCtx, () => watcher.poke());
        // Tuner Plus switched on or off: Workshop and its Tuner Plus row follow at once.
        const onTuner = () => watcher.poke();
        window.addEventListener('dsh-tuning:switched', onTuner);
        return () => { watcher.stop(); off(); window.removeEventListener('dsh-tuning:switched', onTuner); };
      }, [model]);

      const wide = drawer || !collapsed;
      const darwin = document.documentElement.getAttribute('data-platform') === 'darwin';
      // Item 4A, stage 3a: with spaces live the buttons are the five spaces (this window's own choice); else the mode tabs.
      const spacesOn = state.spacesOn === true;
      const tabs = spacesOn ? spacesOf(state, t) : tabsOf(state);
      const selected = (spacesOn ? tabs.find((m) => m.id === state.space) : tabs.find((m) => m.id === state.selected)) ?? tabs[0];
      // The tab the selected button stands for (start places, preset locks, the tab layout): a space's own tab with spaces.
      const key = spacesOn ? SPACE_TAB[selected.id] : selected.id;
      // Arranging the tabs (wide sidebar only): `preview` is the order while a tab is being dragged.
      const [editing, setEditing] = useState(false);
      const [preview, setPreview] = useState(null);
      const dragRef = useRef(null);
      const endDragRef = useRef(null);
      const arranging = editing && wide;
      /** End a drag at once: its window listeners go, nothing is saved. */
      const stopDrag = () => {
        endDragRef.current?.();
        endDragRef.current = null;
        dragRef.current = null;
      };
      // Arranging ended (Escape, Done, the sidebar folded): any drag ends with it, unsaved.
      useEffect(() => {
        if (arranging) return undefined;
        stopDrag();
        setPreview(null);
        return undefined;
      }, [arranging]);
      useEffect(() => () => stopDrag(), []);
      const shownTabs = arranging && preview ? orderTabs(tabs, preview) : tabs;
      // Wide sidebar: tabs with an icon of their own whose name does not fit show the icon alone (the
      // name shows on pointing). A tab's width does not depend on its text, so this cannot flicker.
      const [iconOnly, setIconOnly] = useState(() => ({ key: '', ids: new Set() }));
      const tabsKey = shownTabs.map((m) => `${m.id}:${m.label}`).join('|');
      useLayoutEffectSafe(() => {
        const list = tabsRef.current;
        const keep = (ids) => setIconOnly((prev) => (prev.key === ids.join(',') ? prev : { key: ids.join(','), ids: new Set(ids) }));
        if (!wide || !state.iconOnlyTabs || !list || typeof ResizeObserver !== 'function') { keep([]); return undefined; }
        const pen = document.createElement('canvas').getContext('2d');
        const measure = () => keep(iconOnlyIds(shownTabs, list.querySelectorAll('[role=tab]'), (el) => getComputedStyle(el), pen));
        measure();
        const watch = new ResizeObserver(() => measure());
        watch.observe(list);
        void document.fonts?.ready?.then(measure, () => {});
        return () => watch.disconnect();
      }, [wide, tabsKey, state.iconOnlyTabs]);
      const layout = state.tabs;
      const claimed = new Set(Object.values(layout).flatMap((tab) => (Array.isArray(tab?.pages) ? tab.pages : [])));
      // With spaces, a space shows the pages of every tab that is now in it (Chat: Chat's and Cowork's, and those of the
      // tabs that became modes), so no page that a tab listed is out of reach.
      const ownIds = spacesOn
        ? [...new Set(Object.entries(layout).filter(([tabId]) => spaceOfTabId(tabId) === selected.id).flatMap(([, tab]) => (Array.isArray(tab?.pages) ? tab.pages : [])))]
        : (Array.isArray(layout[selected.id]?.pages) ? layout[selected.id].pages : []);
      const own = ownIds.map((id) => allPages.find((p) => p.id === id)).filter(Boolean);
      // Automations part, step A8: Plus's Automations page is listed by no tab, so it shows under every tab;
      // the app's own task editor has no row of its own any more (it is one click away on that page),
      // unless a layout you edited by hand still lists it under a tab.
      const shared = allPages.filter((p) => !claimed.has(p.id) && p.id !== 'schedules');
      // Item 4A, stage 3b: with spaces, the fixed rows first (Projects, Artifacts, Automations, Plugins), a thin line, then
      // the space's own rows (and Settings rows: Workshop's Tuner Plus and Benchmark), then the pages no space lists.
      const allSections = useSyncExternalStore(sections.subscribe, sections.get);
      const spaceSet = spacesOn ? spaceRows(selected.id, allPages, spaceLayoutOf(state.spaceLayout), allSections, (state.spaceRows ?? []).find((row) => row?.id === selected.id)?.addonsOff ?? []) : null;
      const rows = spacesOn ? [...spaceSet.fixed, ...spaceSet.own, ...spaceSet.settings, ...spaceSet.shared] : [...own, ...shared];
      const lineAfter = spacesOn && spaceSet.fixed.length > 0 && rows.length > spaceSet.fixed.length ? spaceSet.fixed[spaceSet.fixed.length - 1].id : '';
      // The saved layout may lack a tab another add-on brings (Research, Scout): fall back to the
      // built-in copy before the generic text, as tabEntry does for the greeting and chips.
      const newLabel = spacesOn ? t('new.space.' + selected.id) : newLabelFor(layout, selected.id, t, DEFAULT_TABS);
      // Workshop shown only through Tuner Plus (Creator Plus is off): its list, but no New button.
      const noNew = spacesOn && selected.id === 'workshop' && workshopWithoutCreator(state);
      const toggleLabel = collapsed ? t('toggle.open') : t('toggle.collapse');

      const startSession = () => { if (!noNew) startNew(appCtx, library, key); };
      // Chat does not choose a folder: while the open tab is Chat and the open conversation lives in the
      // app's default workspace (or nothing is open), the start page's folder picker is hidden by CSS.
      // The preset picker (Standard, PTC, ...) stays: it changes how the model calls tools, so it must be visible.
      const home = defaultWorkspace(libSnap.workspaces);
      const currentWs = libSnap.currentId ? libSnap.workspaces.find((ws) => (ws.sessionIds ?? []).includes(libSnap.currentId)) : null;
      // Owner's answer (22 Nov): a thread opened from outside this list (⌘K, a card, a link) brings the window to its
      // space, so the buttons, rows and Mode list match it. Only when the open thread changes, never for a blank draft,
      // and only to a space that is shown; the thread the window opened with does not move it.
      const followed = useRef(libSnap.currentId);
      useEffect(() => {
        if (!libSnap.ok) return;
        const id = libSnap.currentId;
        if (followed.current === id) return;
        followed.current = id;
        const now = model.get();
        if (!now.spacesOn || !id) return;
        const sess = libSnap.byId[id];
        if (!sess || sess.blank) return;
        const space = threadSpaceToShow(id, sess, currentWs, now, spacesOf(now, t).map((one) => one.id));
        if (space) void model.select(space);
      }, [libSnap.ok, libSnap.currentId]);
      // Scratch is no folder of yours either: the picker is hidden there too.
      // Item 4A, stage 4: with spaces, a Chat thread with Cowork on works in a project folder, so the picker shows; it is
      // hidden only for a standalone (Scratch) thread.
      const plainChat = spacesOn
        ? selected.id === 'chat' && libSnap.ok && (!currentWs || hidden.has(roomKey(currentWs.path)))
        : selected.id === 'chat' && libSnap.ok && ((!!home && (!currentWs || currentWs.workspaceId === home.workspaceId)) || (!!currentWs && hidden.has(roomKey(currentWs.path))));
      useEffect(() => {
        const root = document.documentElement;
        if (plainChat) root.setAttribute('data-cws-plain-chat', '');
        else root.removeAttribute('data-cws-plain-chat');
        return () => root.removeAttribute('data-cws-plain-chat');
      }, [plainChat]);
      // Wide chat: the conversation and the message box use the window's width.
      useEffect(() => {
        const root = document.documentElement;
        if (state.wideChat) root.setAttribute('data-cws-wide', '');
        else root.removeAttribute('data-cws-wide');
        return () => root.removeAttribute('data-cws-wide');
      }, [state.wideChat]);
      // Other add-ons show or hide their start-page parts by the selected tab. With spaces (item 4A) data-cws-tab is the
      // open thread's mode (a new thread's: the mode it was given or picked; none yet: its space's start mode), so the
      // Finance, Research and Recon bars keep working; data-cws-space is the window's space.
      const openMode = libSnap.currentId ? state.sessionModes?.[libSnap.currentId] : undefined;
      const spaceStart = (state.spaceRows ?? []).find((row) => row?.id === selected.id)?.startMode;
      const shownTabId = spacesOn ? (typeof openMode === 'string' && openMode ? openMode : (typeof spaceStart === 'string' && spaceStart ? spaceStart : key)) : selected.id;
      useEffect(() => {
        const root = document.documentElement;
        root.setAttribute('data-cws-tab', shownTabId);
        return () => root.removeAttribute('data-cws-tab');
      }, [shownTabId]);
      useEffect(() => {
        const root = document.documentElement;
        if (spacesOn) root.setAttribute('data-cws-space', selected.id);
        else root.removeAttribute('data-cws-space');
        return () => root.removeAttribute('data-cws-space');
      }, [spacesOn, selected.id]);
      // Each tab remembers the conversation that was open in it. Coming back to a tab opens that
      // conversation again; a tab with nothing to come back to opens its start page.
      const selectedRef = useRef(selected.id);
      selectedRef.current = selected.id;
      useEffect(() => {
        const id = libSnap.currentId;
        if (!id || !libSnap.ok) return;
        const sess = libSnap.byId[id];
        if (!sess || sess.origin === 'subagent') return;
        const ws = libSnap.workspaces.find((item) => (item.sessionIds ?? []).includes(id)) ?? null;
        const now = model.get();
        if (now.spacesOn) {
          // Each space remembers its own last thread (a new key; the old per-tab memory is only read).
          writeLastSpace(sess.blank ? selectedRef.current : spaceOfSession(id, sess, ws, now), id);
        } else {
          const tab = tabOfSession(id, sess, ws, now, usualTabsOf(now).map((m) => m.id));
          // A conversation opened from another tab's list (Needs you, Show all) is remembered for its own tab.
          writeLast(sess.blank ? selectedRef.current : tab, id);
        }
        // Asked again once the draft has its first message and its mode (its space) is recorded, so the tab it now
        // belongs to remembers it (the draft may have been opened from another tab). Its mode is learnt
        // at once, not at the next 10-second refresh, so no other tab reopens it in the meantime.
        if (!sess.blank && (now.spacesOn ? now.sessionSpaces?.[id] : now.sessionModes?.[id]) === undefined) {
          const timer = setTimeout(() => void model.refresh(), 700);
          return () => clearTimeout(timer);
        }
        return undefined;
      }, [libSnap.currentId, libSnap.ok, libSnap.currentId ? !!libSnap.byId[libSnap.currentId]?.blank : null, libSnap.currentId ? state.sessionModes?.[libSnap.currentId] : undefined, libSnap.currentId ? state.sessionSpaces?.[libSnap.currentId] : undefined, spacesOn]);
      // Item 4A, stage 3a: a new thread opened in a space is given that space's start mode at once (Modes' route; the
      // chat box asks too, whichever comes first), so a first message sent quickly already runs in the right mode.
      // Fix round: at start the app may reopen its last thread before the window's space is known; a started thread of
      // another shown space (a sealed Recon thread under the Code button, say) switches the window to its space, once.
      const firstLook = useRef(false);
      useEffect(() => {
        if (firstLook.current || !spacesOn || !libSnap.ok || !model.get().modesOn) return;
        const id = libSnap.currentId;
        const sess = id ? libSnap.byId[id] : null;
        if (!id) return;
        firstLook.current = true;
        if (!sess || sess.blank || sess.origin === 'subagent') return;
        const now = model.get();
        const ws = libSnap.workspaces.find((item) => (item.sessionIds ?? []).includes(id)) ?? null;
        const own = spaceOfSession(id, sess, ws, now);
        if (own !== selected.id && tabs.some((m) => m.id === own)) void model.select(own);
      }, [spacesOn, libSnap.ok, libSnap.currentId, state.modesOn]);
      // Fix round: asked again when the window's space changes while the same blank draft stays open (the app reuses one
      // blank draft per folder, so Code and Devices may show the same one): the draft follows the space it is shown in.
      // A short wait first, so a draft only passed through on the way to another thread is not claimed.
      const openBlankId = spacesOn && libSnap.currentId && libSnap.byId[libSnap.currentId]?.blank ? libSnap.currentId : '';
      useEffect(() => {
        if (!openBlankId) return undefined;
        const timer = setTimeout(() => {
          // Item 4A, stage 6a: through startForSpace (a draft kept in another space opens a fresh one; the send waits).
          void startForSpace(appCtx, library, openBlankId, selectedRef.current).then(() => model.refresh(), () => {});
        }, CLAIM_WAIT_MS);
        return () => clearTimeout(timer);
      }, [openBlankId, selected.id]);
      const switchSpace = (m) => {
        void model.select(m.id, m.label);
        const snap = library.get();
        if (!snap.ok) return;
        const now = model.get();
        const last = readLastSpace(now.tabOrder)[m.id];
        const sess = last ? snap.byId[last] : null;
        const ws = sess ? snap.workspaces.find((item) => (item.sessionIds ?? []).includes(last)) ?? null : null;
        const gone = !sess || snap.archived.includes(last) || trash.get().items.some((item) => item.id === last || (Array.isArray(item.ids) && item.ids.includes(last)))
          // Another space's thread (also when it is the open one) is not reopened here: the start page is. A blank draft
          // is reopened whatever mode it was given meanwhile: Modes claims it again for this space (fix round), and a
          // mode picked for it comes back where this space offers it.
          || (!sess.blank && spaceOfSession(last, sess, ws, now) !== m.id)
          // Recon opens only a thread in its room, and no other space one there.
          || !placeFits(SPACE_TAB[m.id], sess);
        try { appCtx.layout.selectPanel(null); } catch { /* already on the conversation */ }
        if (!gone && last !== snap.currentId) {
          try { appCtx.get('uiWorkspace').openSession(last); return; } catch { /* fall through to a new one */ }
        }
        if (gone && !(m.id === 'workshop' && workshopWithoutCreator(now))) startNew(appCtx, library, SPACE_TAB[m.id]);
      };
      const switchTab = (m) => {
        if (spacesOn) { switchSpace(m); return; }
        void model.select(m.id, m.label);
        const snap = library.get();
        if (!snap.ok) return;
        const last = readLast()[m.id];
        const sess = last ? snap.byId[last] : null;
        const gone = !sess || snap.archived.includes(last) || trash.get().items.some((item) => item.id === last || (Array.isArray(item.ids) && item.ids.includes(last)))
          // Another tab's conversation (also when it is the open one) is not reopened here: the start page is.
          || !reopensIn(m.id, last, sess, model.get(), usualTabsOf(model.get()).map((x) => x.id))
          // Recon opens only a conversation in its room, and no other tab one there.
          || !placeFits(m.id, sess);
        try { appCtx.layout.selectPanel(null); } catch { /* already on the conversation */ }
        if (!gone && last !== snap.currentId) {
          try { appCtx.get('uiWorkspace').openSession(last); return; } catch { /* fall through to a new one */ }
        }
        if (gone) startNew(appCtx, library, m.id);
      };
      /** Save a new order (the order you see, keeping the places of tabs not shown now). */
      const saveOrder = (ids) => {
        setPreview(null);
        // The space buttons keep their own order; `tabOrder` stays as it is.
        if (spacesOn) void model.setOption('spaceOrder', mergeOrder(ids, readOrder(state.spaceOrder).length > 0 ? state.spaceOrder : spaceOrderFrom(state.tabOrder)));
        else void model.setOption('tabOrder', mergeOrder(ids, state.tabOrder));
      };
      const focusTab = (id) => setTimeout(() => tabsRef.current?.querySelector(`[data-tab-id="${CSS.escape(id)}"]`)?.focus(), 0);
      /** While arranging: arrow keys move the focused tab; Escape ends arranging. */
      const onArrangeKey = (event) => {
        const id = event.target?.closest?.('[role=tab]')?.getAttribute('data-tab-id');
        if (event.key === 'Escape') { event.preventDefault(); setPreview(null); setEditing(false); return; }
        const ids = shownTabs.map((m) => m.id);
        const index = ids.indexOf(id);
        if (index < 0) return;
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = index + 1;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = index - 1;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = ids.length - 1;
        if (next < 0 || next >= ids.length || next === index) return;
        event.preventDefault();
        saveOrder(moveId(ids, id, next));
        focusTab(id);
      };
      /**
       * While arranging: a tab follows the pointer. Pointer events on the window (not the page's drag
       * and drop, which brings up the app's file-drop cover; not pointer capture, which is lost when
       * the moving tab's button is put elsewhere in the list). A release the page never sees (outside
       * the window) ends the drag unsaved; it is saved only when the order really changed.
       */
      const onTabPointerDown = (event, id) => {
        if (!arranging || event.button !== 0) return;
        event.preventDefault();
        stopDrag();
        const start = shownTabs.map((m) => m.id);
        const drag = { id, x: event.clientX, y: event.clientY, moved: false, start, order: start };
        dragRef.current = drag;
        const cancel = () => {
          if (dragRef.current !== drag) return;
          stopDrag();
          setPreview(null);
        };
        const move = (e) => {
          if (dragRef.current !== drag) return;
          if (e.buttons === 0) { cancel(); return; }
          if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
          drag.moved = true;
          const over = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[role=tab]');
          const target = over && tabsRef.current?.contains(over) ? over.getAttribute('data-tab-id') : null;
          if (!target || target === drag.id) return;
          drag.order = moveId(drag.order, drag.id, drag.order.indexOf(target));
          setPreview(drag.order);
        };
        const up = () => {
          if (dragRef.current !== drag) return;
          stopDrag();
          if (drag.moved && drag.order.join('\u0000') !== drag.start.join('\u0000')) saveOrder(drag.order);
          else setPreview(null);
        };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('pointerup', up, true);
        window.addEventListener('pointercancel', cancel, true);
        window.addEventListener('blur', cancel);
        endDragRef.current = () => {
          window.removeEventListener('pointermove', move, true);
          window.removeEventListener('pointerup', up, true);
          window.removeEventListener('pointercancel', cancel, true);
          window.removeEventListener('blur', cancel);
        };
      };
      const onTabKey = (event) => {
        if (arranging) { onArrangeKey(event); return; }
        const index = tabs.findIndex((m) => m.id === selected.id);
        let next = -1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index - 1 + tabs.length) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (next < 0) return;
        event.preventDefault();
        switchTab(tabs[next]);
        tabsRef.current?.querySelectorAll('[role=tab]')[next]?.focus();
      };

      const searchAll = hasGlobal ? h(Tooltip, { key: 'search', label: `${t('find.global')} (⌘K)`, show: true },
        h('button', { type: 'button', className: 'cws-icon', 'aria-label': t('find.global'), onClick: () => window.dispatchEvent(new Event('dsh-search:open')) },
          h(Glyph, { name: 'search', size: wide ? 16 : 18 }))) : null;
      const arrangeLabel = t(spacesOn ? 'spaces.arrange' : 'tabs.arrange');
      const arrange = wide && tabs.length > 1 ? h(Tooltip, { key: 'arrange', label: arrangeLabel, show: true },
        h('button', { type: 'button', className: 'cws-icon', 'data-cws-arrange': '', 'aria-label': arrangeLabel, 'aria-pressed': arranging, 'data-on': arranging ? 'true' : undefined, onClick: () => { setPreview(null); setEditing(!arranging); } },
          h(Glyph, { name: 'edit', size: 16 }))) : null;
      // Item 4A: what a space is, in the owner's words (the (i) beside the strip's buttons, wide sidebar only).
      const spacesInfo = spacesOn && wide ? h('span', { key: 'spaces-info', className: 'cws-info' }, h(ui.Info, { title: t('spaces.info.title'), what: t('spaces.info.what'), when: t('spaces.info.when'), change: t('spaces.info.change'), portal: true })) : null;
      const toggle = h(React.Fragment, null, spacesInfo, arrange, searchAll, h(Tooltip, { key: 'toggle', label: toggleLabel, show: true },
        h('button', { type: 'button', className: 'cws-icon', 'data-sidebar-toggle': '', 'aria-label': toggleLabel, onClick: () => appCtx.layout.toggleSidebar() },
          h(Glyph, { name: 'panel', size: wide ? 16 : 18 }))));

      const oneRow = (p) => {
        // Item 4A, stage 3b: the Projects row opens the project page on its list of projects; a Settings row opens that
        // Settings page (Workshop: Tuner Plus, Benchmark); every other row opens its page, as before.
        const label = p.projects ? t('rows.projects') : p.label;
        const current = p.projects ? active === 'project' : !p.settings && active === p.id;
        const open = p.projects
          ? () => { projects.focus(null); appCtx.layout.selectPanel('project'); }
          : p.settings ? () => openSettingsPage(appCtx, p.id) : () => appCtx.layout.selectPanel(p.id);
        const icon = p.projects ? h(Glyph, { name: 'folder', size: wide ? 16 : 18 })
          : p.settings ? h(Glyph, { name: SETTINGS_ROW_GLYPH[p.id] ?? 'sparkle', size: wide ? 16 : 18 })
            : renderFactorySlot('sidebar.panel.icon', { id: p.id, size: wide ? 16 : 18, active: current });
        return h(Tooltip, { key: (p.settings ? 'settings:' : '') + p.id, label: p.settings ? t('rows.settings.hint', { page: label }) : label, show: !wide || p.settings === true },
          h('button', {
            type: 'button', className: 'cws-row', 'aria-label': p.settings ? t('rows.settings.hint', { page: label }) : label,
            'aria-current': current ? 'page' : undefined, onClick: open, 'data-cws-row': p.projects ? 'projects' : p.settings ? 'settings:' + p.id : p.id,
          },
          h('span', { className: 'cws-glyph', 'aria-hidden': true }, icon),
          wide ? h('span', { className: 'cws-label' }, label) : null));
      };
      const pageRow = (p) => (p.id === lineAfter && !p.settings
        ? h(React.Fragment, { key: p.id }, oneRow(p), h('div', { className: 'cws-rowsep', role: 'separator', 'aria-hidden': true }))
        : oneRow(p));

      const tabList = h('div', { ref: tabsRef, className: 'cws-tabs', 'data-spaces': spacesOn ? 'true' : undefined, 'data-many': wide && tabs.length > 3 && state.iconOnlyTabs ? 'true' : undefined, 'data-wrap': wide && tabs.length > 3 && !state.iconOnlyTabs ? 'true' : undefined, 'data-editing': arranging ? 'true' : undefined, role: 'tablist', 'aria-label': t(spacesOn ? 'spaces.label' : 'tabs.label'), 'aria-orientation': wide ? 'horizontal' : 'vertical', 'aria-describedby': arranging ? 'cws-arrange-hint' : undefined, onKeyDown: onTabKey },
        // Every tab shows its full name when pointed at: in the folded rail to its right, in the wide
        // sidebar above it, so it never covers the tabs below (rows of three). Not while arranging.
        shownTabs.map((m) => h(Tooltip, { key: m.id, label: m.label, show: true, disabled: arranging, side: wide ? 'top' : 'right', portal: wide },
          h('button', {
            type: 'button', role: 'tab', className: 'cws-tab', 'aria-selected': m.id === selected.id, 'data-tab-id': m.id,
            tabIndex: arranging || m.id === selected.id ? 0 : -1,
            'aria-label': arranging ? t('tabs.arrange.move', { tab: m.label }) : m.label,
            'data-icon-only': wide && iconOnly.ids.has(m.id) ? 'true' : undefined,
            'data-dragging': arranging && preview && dragRef.current?.id === m.id ? 'true' : undefined,
            // While arranging, a click does not switch tabs (a drag ends with one).
            onClick: () => { if (!arranging && m.id !== selected.id) switchTab(m); },
            onPointerDown: (event) => onTabPointerDown(event, m.id),
          }, h(Glyph, { name: glyphFor(spacesOn ? SPACE_TAB[m.id] : m.id), size: wide ? 15 : 18 }), wide && !iconOnly.ids.has(m.id) ? h('span', null, m.label) : null))));
      const arrangeBar = arranging
        ? h('div', { className: 'cws-arrange' },
          h('span', { id: 'cws-arrange-hint', className: 'cws-arrange-hint' }, t(spacesOn ? 'spaces.arrange.hint' : 'tabs.arrange.hint')),
          (spacesOn ? state.spaceOrder ?? [] : state.tabOrder ?? []).length > 0 ? h('button', { type: 'button', className: 'cws-link', onClick: () => { setPreview(null); void model.setOption(spacesOn ? 'spaceOrder' : 'tabOrder', []); } }, t('tabs.arrange.reset')) : null,
          h('button', { type: 'button', className: 'cws-link', onClick: () => { setPreview(null); setEditing(false); setTimeout(() => document.querySelector('[data-cws-arrange]')?.focus(), 0); } }, t('tabs.arrange.done')))
        : null;

      const more = entryActions
        ? h(MoreMenu, {
          wide, label: t('more'), renderSlot,
          entries: allPages.filter((p) => p.id !== 'plugins').map((p) => ({ id: p.id, label: p.label, pinned: true, active: p.id === active })),
          onOpen: (id) => appCtx.layout.selectPanel(id),
          extra: [
            { key: 'logos', label: t(state.hideLogos ? 'look.logos.show' : 'look.logos.hide'), run: () => void model.setOption('hideLogos', !state.hideLogos) },
            { key: 'title', label: t(state.dateTitle ? 'look.title.greeting' : 'look.title.date'), run: () => void model.setOption('dateTitle', !state.dateTitle) },
            { key: 'tabnames', label: t(state.iconOnlyTabs ? 'look.tabs.names' : 'look.tabs.icons'), run: () => void model.setOption('iconOnlyTabs', !state.iconOnlyTabs) },
            { key: 'wide', label: t(state.wideChat ? 'look.chat.normal' : 'look.chat.wide'), run: () => void model.setOption('wideChat', !state.wideChat) },
          ],
        })
        : null;

      if (!wide) {
        return h('div', { className: 'cws-root cws-rail', 'data-cowork-shell': 'rail' },
          h('div', { className: 'cws-strip' }, toggle),
          noNew ? null : h(Tooltip, { label: newLabel, show: true },
            h('button', { type: 'button', className: 'cws-icon', 'aria-label': newLabel, onClick: startSession }, h(Glyph, { name: 'plus', size: 18 }))),
          tabList,
          h('div', { className: 'cws-scroll' }, h('nav', { className: 'cws-pages', 'aria-label': t('pages.label', { tab: selected.label }) }, rows.map(pageRow), more)),
          h('div', { className: 'cws-foot' }, renderSlot('sidebar.footer.action', { wide: false }), renderSlot('sidebar.settings', { wide: false })));
      }

      return h('div', { className: 'cws-root', 'data-cowork-shell': 'wide', style: { width } },
        h('div', { className: 'cws-strip', 'data-window-drag': darwin ? '' : undefined }, toggle),
        state.hideLogos ? null : h('div', { className: 'cws-brand', 'data-window-drag': darwin ? '' : undefined },
          renderSlot('sidebar.brand.mark', { size: 20 }, { fallback: UI.FishLogo ? h(UI.FishLogo, { size: 20 }) : null }),
          renderSlot('sidebar.brand.name', {}, { fallback: h('span', null, t('brand')) })),
        tabList,
        arrangeBar,
        state.error
          ? (state.errorDetails || state.errorFix
              ? h('div', { className: 'cws-error', role: 'status' }, h(ui.ErrorNote, { what: state.error, fix: state.errorFix || undefined, details: state.errorDetails || undefined }))
              : h('div', { className: 'cws-error', role: 'status' }, state.error))
          : null,
        // Round 2: a notice (a done move, say) is a normal note, never the error red.
        state.notice ? h('div', { className: 'cws-notice', role: 'status' }, state.notice) : null,
        noNew
          // Workshop shown only through Tuner Plus: say why there is no New button and where to switch Creator Plus on.
          ? h('div', { className: 'cws-new-off', role: 'note', 'data-cws-new-off': '' },
            h('span', null, t('workshop.off')),
            h('button', { type: 'button', className: 'cws-link', onClick: () => openSettingsPage(appCtx, 'creator-plus') }, t('workshop.off.open')))
          : h('button', { type: 'button', className: 'cws-new', onClick: startSession, 'aria-keyshortcuts': shortcut?.aria },
            h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'plus', size: 16 })), h('span', { className: 'cws-label' }, newLabel),
            shortcut ? h('span', { className: 'cws-kbd', 'aria-hidden': true }, UI.ShortcutKeys ? h(UI.ShortcutKeys, { keys: shortcut.keys }) : shortcut.keys.join('')) : null),
        h('div', { className: 'cws-scroll', 'data-sidebar-scrollport': '' },
          rows.length > 0 || more ? h('nav', { className: 'cws-pages', 'aria-label': t('pages.label', { tab: selected.label }) }, rows.map(pageRow), more) : null,
          libReady && !showAll
            ? h(TabLibrary, { appCtx, model, library, trash, projectStore: projects, tabs, selected, onShowAll: () => setShowAll(true) })
            : h(React.Fragment, null,
              libReady ? h('div', { className: 'cws-lib-head cws-lib-allbar' },
                h('span', null, t('lib.showingAll')),
                h('button', { type: 'button', className: 'cws-link', onClick: () => setShowAll(false) }, t('lib.mine', { tab: selected.label }))) : null,
              renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => { if (collapsed) appCtx.layout.toggleSidebar(); } }, { hookContext: HOOK_CONTEXT }))),
        h('div', { className: 'cws-foot' }, renderSlot('sidebar.footer.action', { wide: true }), renderSlot('sidebar.settings', { wide: true })));
    }

    /** Same job as the app's: a page row's icon comes from that page's own registration. */
    function PanelIcon({ id, size, active, renderSlot }) {
      return renderSlot('sidebar.panellist', { size, active }, { only: id });
    }

    /** macOS desktop: while the sidebar is hidden, the frame shows these beside the traffic lights. */
    function Leading({ appCtx, model, library }) {
      const t = appCtx.locale.bind(NS);
      const state = useSyncExternalStore(model.subscribe, model.get);
      useSyncExternalStore(library.subscribe, library.get); // keeps the project list fresh for the New button
      const key = state.spacesOn ? 'new.space.' + selectedTab(state, t).space : ['chat', 'cowork', 'code', 'research', 'scout'].includes(state.selected) ? 'new.' + state.selected : 'new.other';
      // Workshop shown only through Tuner Plus has no New button here either.
      const noNew = state.spacesOn && selectedTab(state, t).space === 'workshop' && workshopWithoutCreator(state);
      return h('div', { className: 'cws-lead' },
        h('button', { type: 'button', className: 'cws-icon', 'data-sidebar-opener': '', 'aria-label': t('toggle.open'), onClick: () => appCtx.layout.toggleSidebar() }, h(Glyph, { name: 'panel', size: 16 })),
        noNew ? null : h('button', { type: 'button', className: 'cws-icon', 'aria-label': t(key), onClick: () => startNew(appCtx, library, selectedTab(state, t).id) }, h(Glyph, { name: 'plus', size: 16 })),
        window.__dshGlobalSearch === true ? h('button', { type: 'button', className: 'cws-icon', 'aria-label': t('find.global'), title: `${t('find.global')} (⌘K)`, onClick: () => window.dispatchEvent(new Event('dsh-search:open')) }, h(Glyph, { name: 'search', size: 16 })) : null);
    }


    /** Unwrap a remote result envelope `{ ok, value | error }`; pass plain values through. */
    function unwrap(result) {
      if (result && typeof result === 'object' && typeof result.ok === 'boolean' && ('value' in result || 'error' in result)) {
        if (!result.ok) throw new Error(`${result.error?.code ?? 'error'}: ${result.error?.message ?? ''}`);
        return result.value;
      }
      return result;
    }

    function fill(text, values) {
      return String(text).replace(/\{(\w+)\}/g, (_, key) => (values[key] === undefined ? '' : String(values[key])));
    }

    function PageFrame({ title, hint, actions, children }) {
      return h('div', { className: 'cws-page' },
        h('div', { className: 'cws-page-in' },
          h('div', { className: 'cws-head' },
            h('div', null, h('h1', null, title), hint ? h('p', { className: 'cws-hint' }, hint) : null),
            actions || null),
          children));
    }

    const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/;
    /**
     * The app's plugin on/off switch, filled in only when the page can reach the plugin manager.
     * It is an optional dependency on purpose: the sidebar itself must load even without it.
     */
    const PLUGIN_SWITCH = { set: null };

    function ConnectorsPage({ appCtx }) {
      const t = appCtx.locale.bind(NS);
      const [state, setState] = useState({ status: 'loading', servers: [], waiting: [] });
      const [busy, setBusy] = useState('');
      const [notes, setNotes] = useState({});
      const blank = { name: '', kind: 'stdio', command: '', args: '', url: '', keyName: '', keyValue: '' };
      const [form, setForm] = useState(blank);
      // phase: edit (typing), preview (the exact lines shown), working, done (written: restart needed), refused (nothing changed).
      const [flow, setFlow] = useState({ phase: 'edit', problems: [], preview: null, answer: null, copied: false });

      const load = useCallback(async () => {
        try {
          const response = await fetch(new URL('dsh-cowork-shell/connectors', document.baseURI), { headers: { accept: 'application/json' } });
          if (!response.ok) throw dshKit.fail(String(response.status));
          const data = await response.json();
          setState({ status: 'ready', servers: Array.isArray(data.servers) ? data.servers : [], waiting: Array.isArray(data.waiting) ? data.waiting : [] });
        } catch {
          setState((prev) => (prev.status === 'ready' ? prev : { status: 'error', servers: [], waiting: [] }));
        }
      }, []);

      useEffect(() => {
        // Every 5 s while the page is shown, never while the window is hidden.
        const timer = dshPoll.loop(() => load(), { every: 5000 });
        return () => timer.stop();
      }, [load]);

      const note = (id, text, tone) => setNotes((prev) => ({ ...prev, [id]: { text, tone } }));

      /** On/off goes through the app's own plugin switch (the same one the Plugins page uses). */
      const toggle = async (server, on) => {
        setBusy(server.entryId);
        try {
          if (!PLUGIN_SWITCH.set) throw new Error(t('connectors.noSwitch'));
          const result = unwrap(await PLUGIN_SWITCH.set(server.entryId, on));
          if (result?.application === 'restart-required' || result?.restartRequired) note(server.entryId, t('connectors.restartNeeded'), '');
          else if (result?.application === 'failed') note(server.entryId, t('connectors.switchFailed'), 'bad');
          else if (result?.application === 'overridden') note(server.entryId, t('connectors.overridden'), 'bad');
          else note(server.entryId, '', '');
          setTimeout(() => void load(), 1500);
          await load();
        } catch (error) {
          note(server.entryId, fill(t('connectors.failed'), { message: error.message }), 'bad');
        } finally {
          setBusy('');
        }
      };

      /** Ask the page's route to check the fields (`preview`) or to write the connector (`write`). Answers are in plain words. */
      const ask = async (action) => {
        const response = await fetch(new URL('dsh-cowork-shell/connectors/write', document.baseURI), {
          method: 'POST', cache: 'no-store', credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify({ action, form, ...(action === 'write' && flow.preview ? { expect: flow.preview.text } : {}) }),
        });
        return response.json().catch(() => ({ ok: false, text: t('add.failed') }));
      };

      const preview = async () => {
        setFlow((prev) => ({ ...prev, phase: 'working', problems: [], copied: false }));
        try {
          const data = await ask('preview');
          if (data.ok) setFlow({ phase: 'preview', problems: [], preview: data, answer: null, copied: false });
          else setFlow({ phase: 'edit', problems: Array.isArray(data.problems) ? data.problems.map((p) => p.text) : [data.text ?? t('add.failed')], preview: null, answer: null, copied: false });
        } catch {
          setFlow({ phase: 'edit', problems: [t('add.failed')], preview: null, answer: null, copied: false });
        }
      };

      const write = async () => {
        setFlow((prev) => ({ ...prev, phase: 'working' }));
        try {
          const data = await ask('write');
          if (data.ok) {
            setFlow({ phase: 'done', problems: [], preview: null, answer: data, copied: false });
            setForm(blank);
            void load();
          } else setFlow((prev) => ({ ...prev, phase: 'refused', answer: data }));
        } catch {
          setFlow((prev) => ({ ...prev, phase: 'refused', answer: { ok: false, text: t('add.failed') } }));
        }
      };

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(flow.preview?.text ?? '');
          setFlow((prev) => ({ ...prev, copied: true }));
        } catch {
          setFlow((prev) => ({ ...prev, copied: false }));
        }
      };

      const rows = state.servers.map((server) => {
        const n = notes[server.entryId];
        const chip = !server.enabled
          ? h('span', { className: 'cws-chip' }, t('status.disabled'))
          : server.toolCount > 0
            ? h('span', { className: 'cws-chip', 'data-tone': 'good' }, server.toolCount === 1 ? t('status.connected.one') : fill(t('status.connected'), { n: server.toolCount }))
            : h('span', { className: 'cws-chip', 'data-tone': 'bad', title: t('status.notConnected.hint') }, t('status.notConnected'));
        return h('div', { key: server.entryId, className: 'cws-item' },
          h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'link', size: 16 })),
          h('div', { className: 'cws-item-main' },
            h('div', { className: 'cws-item-name' }, server.serverName),
            h('div', { className: 'cws-item-sub' }, [server.transport === 'streamable-http' ? t('add.kind.http') : t('add.kind.stdio'), server.target].filter(Boolean).join(' · ')),
            n && n.text ? h('div', { className: 'cws-msg', 'data-tone': n.tone, role: 'status' }, n.text) : null),
          chip,
          h('button', {
            type: 'button', role: 'switch', className: 'cws-switch', 'aria-checked': server.enabled,
            'aria-label': `${t('connectors.on')}: ${server.serverName}`, disabled: busy === server.entryId,
            onClick: () => void toggle(server, !server.enabled),
          }));
      });

      // Written to the settings file but not started yet (the app reads the file when it starts).
      const waitingRows = state.waiting.map((name) => h('div', { key: `waiting-${name}`, className: 'cws-item' },
        h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'link', size: 16 })),
        h('div', { className: 'cws-item-main' }, h('div', { className: 'cws-item-name' }, name)),
        h('span', { className: 'cws-chip' }, t('connectors.waiting'))));

      const field = (label, input) => [h('label', { key: label + 'l' }, label), h('div', { key: label + 'i' }, input)];
      const set = (patch) => { setForm((prev) => ({ ...prev, ...patch })); setFlow((prev) => (prev.phase === 'working' ? prev : { phase: 'edit', problems: [], preview: null, answer: null, copied: false })); };
      const working = flow.phase === 'working';
      const column = { paddingBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 };
      const previewBox = flow.phase === 'preview' || (working && flow.preview) ? h('div', { style: column },
        h('p', { className: 'cws-note', style: { margin: 0 } }, fill(t('add.preview.title'), { file: flow.preview.file })),
        h('pre', { className: 'cws-yaml' }, flow.preview.text),
        flow.preview.key ? h('p', { className: 'cws-note', style: { margin: 0 } }, fill(t('add.preview.key'), { ref: flow.preview.key.ref })) : null,
        flow.preview.key && flow.preview.key.kept ? h('p', { className: 'cws-note', style: { margin: 0 } }, t('add.preview.keyKept')) : null,
        h('p', { className: 'cws-note', style: { margin: 0 } }, flow.preview.canCheck ? t('add.preview.same') : fill(t('add.preview.nocheck'), { file: flow.preview.file })),
        h('div', { style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } },
          flow.preview.canCheck ? h('button', { type: 'button', className: 'cws-btn', 'data-main': 'true', disabled: working, onClick: () => void write() }, working ? t('add.writing') : t('add.write')) : null,
          h('button', { type: 'button', className: 'cws-btn', disabled: working, onClick: () => void copy() }, t('add.copy')),
          h('button', { type: 'button', className: 'cws-btn', disabled: working, onClick: () => set({}) }, t('add.change')),
          flow.copied ? h('span', { className: 'cws-msg', role: 'status' }, t('add.copied')) : null)) : null;
      const checkList = (answer) => (Array.isArray(answer?.checks) ? answer.checks.map((check) => h('div', { key: check.name, className: 'cws-msg', 'data-tone': check.ok ? undefined : 'bad', role: 'status' }, `${check.ok ? '✓' : '✗'} ${check.name}`)) : []);
      const doneBox = flow.phase === 'done' ? h('div', { style: column, role: 'status' },
        h('div', { className: 'cws-item-name' }, fill(t('add.done.title'), { name: flow.answer.added })),
        ...checkList(flow.answer),
        h('p', { className: 'cws-note', style: { margin: 0 } }, fill(t('add.done.file'), { file: flow.answer.file })),
        h('p', { className: 'cws-note', style: { margin: 0 } }, flow.answer.backup ? fill(t('add.done.backup'), { backup: flow.answer.backup }) : t('add.done.nobackup')),
        h('div', { className: 'cws-item-name' }, t('add.restart.title')),
        h('p', { className: 'cws-note', style: { margin: 0 } }, t('add.restart.body')),
        h('p', { className: 'cws-note', style: { margin: 0 } }, t('add.restart.why')),
        h('div', null, h('button', { type: 'button', className: 'cws-btn', onClick: () => setFlow({ phase: 'edit', problems: [], preview: null, answer: null, copied: false }) }, t('add.another')))) : null;
      const refusedBox = flow.phase === 'refused' ? h('div', { style: column, role: 'alert' },
        h('div', { className: 'cws-msg', 'data-tone': 'bad' }, t('add.refused.title')),
        h('p', { className: 'cws-note', style: { margin: 0 } }, flow.answer?.text ?? t('add.failed')),
        ...checkList(flow.answer),
        flow.answer?.details ? h('details', null, h('summary', { className: 'cws-note' }, t('add.refused.details')), h('pre', { className: 'cws-yaml' }, flow.answer.details)) : null,
        h('div', { style: { display: 'flex', gap: 12 } },
          flow.preview ? h('button', { type: 'button', className: 'cws-btn', onClick: () => setFlow((prev) => ({ ...prev, phase: 'preview', answer: null })) }, t('add.back')) : null,
          h('button', { type: 'button', className: 'cws-btn', onClick: () => set({}) }, t('add.change')))) : null;
      const showForm = flow.phase === 'edit' || working || flow.phase === 'preview';
      const addForm = h('div', { className: 'cws-card' },
        h('div', { className: 'cws-item-name', style: { paddingTop: 12 } }, t('add.title')),
        showForm ? h('div', { className: 'cws-form' },
          ...field(t('add.name'), h('input', { value: form.name, onChange: (e) => set({ name: e.target.value }), 'aria-label': t('add.name') })),
          ...field(t('add.kind'), h('select', { value: form.kind, onChange: (e) => set({ kind: e.target.value }), 'aria-label': t('add.kind') },
            h('option', { value: 'stdio' }, t('add.kind.stdio')), h('option', { value: 'http' }, t('add.kind.http')))),
          ...(form.kind === 'http'
            ? field(t('add.url'), h('input', { value: form.url, placeholder: 'https://', onChange: (e) => set({ url: e.target.value }), 'aria-label': t('add.url') }))
            : [...field(t('add.command'), h('input', { value: form.command, onChange: (e) => set({ command: e.target.value }), 'aria-label': t('add.command') })),
              ...field(t('add.args'), h('textarea', { value: form.args, onChange: (e) => set({ args: e.target.value }), 'aria-label': t('add.args') }))]),
          ...field(form.kind === 'http' ? t('add.keyName.http') : t('add.keyName.stdio'), h('input', { value: form.keyName, onChange: (e) => set({ keyName: e.target.value }), 'aria-label': t(form.kind === 'http' ? 'add.keyName.http' : 'add.keyName.stdio'), spellCheck: false, autoComplete: 'off' })),
          ...field(t('add.keyValue'), h('input', { type: 'password', value: form.keyValue, onChange: (e) => set({ keyValue: e.target.value }), 'aria-label': t('add.keyValue'), autoComplete: 'off', spellCheck: false })),
          h('div', { key: 'go-l' }),
          h('div', { key: 'go-i', style: { display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' } },
            h('button', { type: 'button', className: 'cws-btn', disabled: working, onClick: () => void preview() }, working && !flow.preview ? t('add.checking') : t('add.show')))) : null,
        flow.problems.length ? h('div', { style: column, role: 'alert' }, h('div', { className: 'cws-msg', 'data-tone': 'bad' }, t('add.problems')), ...flow.problems.map((text) => h('div', { key: text, className: 'cws-msg', 'data-tone': 'bad' }, text))) : null,
        previewBox,
        doneBox,
        refusedBox,
        h('p', { className: 'cws-note', style: { margin: '0 0 12px' } }, t('add.note')));

      return h(PageFrame, {
        title: t('connectors.title'), hint: t('connectors.hint'),
        actions: h('button', { type: 'button', className: 'cws-btn', onClick: () => void load() }, t('refresh')),
      },
      state.status === 'error' ? h('p', { className: 'cws-note' }, t('connectors.unavailable')) : null,
      state.status === 'ready' ? h('div', { className: 'cws-card' }, rows.length + waitingRows.length ? [...rows, ...waitingRows] : h('p', { className: 'cws-note', style: { margin: '12px 0' } }, t('connectors.empty'))) : null,
      addForm);
    }

    /** Tuner Plus's six marks (where a skill came from), named in this page's own words. */
    const MARK_IDS = ['default', 'downloaded', 'plus', 'ai', 'mine', 'unsorted'];
    function SkillsPage({ appCtx }) {
      const t = appCtx.locale.bind(NS);
      const [state, setState] = useState({ status: 'loading', data: null });
      const [query, setQuery] = useState('');
      const [markFilter, setMarkFilter] = useState('');
      const load = useCallback(async () => {
        try {
          const response = await fetch(new URL('dsh-cowork-shell/skills', document.baseURI), { headers: { accept: 'application/json' } });
          if (!response.ok) throw dshKit.fail(String(response.status));
          setState({ status: 'ready', data: await response.json() });
        } catch {
          setState((prev) => (prev.data ? prev : { status: 'error', data: null }));
        }
      }, []);
      useEffect(() => { void load(); }, [load]);
      const words = query.trim().toLowerCase();
      // Tuner Plus's marks, only while it sends them: a filter by mark and a mark beside each name.
      // A mark's name in the page's language when it is one of Tuner Plus's six, else as Tuner Plus sent it.
      const markName = (id, sent) => (MARK_IDS.includes(id) ? t(`skills.mark.${id}`) : String(sent ?? id));
      const marks = state.data?.marks && typeof state.data.marks === 'object' ? Object.entries(state.data.marks).filter(([, name]) => typeof name === 'string').map(([id, name]) => [id, markName(id, name)]) : [];
      const markOn = marks.some(([id]) => id === markFilter) ? markFilter : '';
      const skills = (state.data?.skills ?? []).filter((skill) => (!words
        || `${skill.name} ${skill.description} ${skill.whenToUse}`.toLowerCase().includes(words))
        && (!markOn || skill.mark === markOn));
      return h(PageFrame, {
        title: t('skills.title'), hint: t('skills.hint'),
        actions: h('button', { type: 'button', className: 'cws-btn', onClick: () => void load() }, t('refresh')),
      },
      h('input', { className: 'cws-search', type: 'search', placeholder: t('skills.search'), 'aria-label': t('skills.search'), value: query, onChange: (e) => setQuery(e.target.value) }),
      marks.length > 0 ? h('select', { className: 'cws-search', 'aria-label': t('skills.markFilter'), value: markOn, onChange: (e) => setMarkFilter(e.target.value) },
        h('option', { value: '' }, t('skills.allMarks')),
        marks.map(([id, name]) => h('option', { key: id, value: id }, `${name} (${(state.data?.skills ?? []).filter((skill) => skill.mark === id).length})`))) : null,
      state.status === 'error' ? h('p', { className: 'cws-note' }, t('skills.unavailable')) : null,
      state.status === 'ready' ? h('div', { className: 'cws-card' },
        skills.length ? skills.map((skill) => h('div', { key: skill.name, className: 'cws-item' },
          h('span', { className: 'cws-glyph', 'aria-hidden': true }, h(Glyph, { name: 'sparkle', size: 16 })),
          h('div', { className: 'cws-item-main' },
            h('div', { className: 'cws-item-name' }, skill.name, skill.markName ? h('span', { className: 'cws-chip', style: { marginLeft: 8 }, title: t('skills.markHint') }, markName(skill.mark, skill.markName)) : null),
            skill.description ? h('div', { className: 'cws-item-sub cws-clamp', title: skill.description }, skill.description) : null,
            skill.path ? h('div', { className: 'cws-item-sub', title: skill.path }, skill.path) : null),
          skill.userInvocable ? h('span', { className: 'cws-chip' }, t('skills.user')) : null,
          skill.modelInvocable ? h('span', { className: 'cws-chip' }, t('skills.model')) : null))
          : h('p', { className: 'cws-note', style: { margin: '12px 0' } }, t('skills.empty'))) : null);
    }

    /** Today's date as a title, in English whatever the app's language ("11 November, 2026"; owner decision 28). */
    function todayTitle(appCtx, now = new Date()) {
      try {
        return `${now.getDate()} ${now.toLocaleDateString('en', { month: 'long' })}, ${now.getFullYear()}`;
      } catch {
        return now.toDateString();
      }
    }

    /** The tab's layout entry with defaults filled in field by field. */
    function tabEntry(state, id) {
      const own = state.tabs?.[id] ?? {};
      const base = DEFAULT_TABS[id] ?? {};
      return {
        greeting: typeof own.greeting === 'string' ? own.greeting : (base.greeting ?? ''),
        chips: Array.isArray(own.chips) ? own.chips : (base.chips ?? []),
      };
    }

    /**
     * Start page greeting. It fills the start page's logo seat and, while it shows a greeting, the
     * stock title next to it is hidden by CSS, so switching the add-on off restores the stock title.
     */
    function HeroGreeting({ size, appCtx, model }) {
      const state = useSyncExternalStore(model.subscribe, model.get);
      const selected = selectedTab(state);
      // The date changes at midnight; look again once a minute while it is the title.
      const [, tick] = useState(0);
      useEffect(() => {
        if (!state.dateTitle) return undefined;
        const timer = setInterval(() => tick((n) => n + 1), 60000);
        return () => clearInterval(timer);
      }, [state.dateTitle]);
      const greeting = state.dateTitle ? todayTitle(appCtx) : String(tabEntry(state, selected.id).greeting || '').slice(0, 120);
      const mark = !state.hideLogos && UI.FishLogo ? h(UI.FishLogo, { size: size ?? 34 }) : null;
      if (!greeting) return mark;
      return h('span', { className: 'cws-hero', 'data-cws-hero': '' }, mark, h('span', { className: 'cws-hero-text' }, greeting));
    }

    /** The new thread's mode as the Modes add-on puts it on the page (html[data-dsh-draft-mode]); '' when none shows. */
    const readDraftMode = () => (typeof document === 'undefined' ? '' : document.documentElement.getAttribute('data-dsh-draft-mode') ?? '');
    function watchDraftMode(onChange) {
      if (typeof MutationObserver === 'undefined' || typeof document === 'undefined') return () => {};
      const watcher = new MutationObserver(onChange);
      watcher.observe(document.documentElement, { attributes: true, attributeFilter: ['data-dsh-draft-mode'] });
      return () => watcher.disconnect();
    }
    /**
     * Round 2 (plan 2.5): with spaces, the starter chips follow the mode picked for the new thread (Research shows
     * Research's chips in any space); the greeting and the New label stay the space's. Before Modes has named the mode,
     * the space's own start: Plain chat in Chat, the space's tab elsewhere. Without spaces, the tab's chips as before.
     * @returns {Array<object>} the chips to show.
     */
    function heroChipsOf(state, selected, draftMode) {
      const key = !state.spacesOn ? selected.id : (draftMode || (selected.space === 'chat' ? 'plain' : selected.id));
      return tabEntry(state, key).chips
        .filter((chip) => chip && typeof chip.label === 'string' && chip.label.trim())
        .slice(0, 12);
    }

    /** Suggestion chips: each fills the chat box with a starter prompt. */
    function HeroChips({ appCtx, model, library }) {
      const state = useSyncExternalStore(model.subscribe, model.get);
      const draftMode = useSyncExternalStore(watchDraftMode, readDraftMode, () => '');
      const selected = selectedTab(state);
      const chips = heroChipsOf(state, selected, draftMode);
      if (chips.length === 0) return null;
      return h('div', { className: 'cws-chips', role: 'group', 'aria-label': appCtx.locale.bind(NS)('chips.label') },
        chips.map((chip) => h('button', {
          key: chip.label, type: 'button', className: 'cws-chip-btn',
          onClick: () => {
            const options = { prompt: String(chip.prompt ?? chip.label), whenDraftExists: 'replace' };
            // In Scratch, the chips stay in Scratch.
            if (selected.id !== 'recon' && inScratchNow(library.get())) {
              startInScratch(appCtx, library, options, selected.id).then((done) => { if (!done) startLocked(appCtx, selected.id, undefined, options); }, () => startLocked(appCtx, selected.id, undefined, options));
              return;
            }
            // Recon's chips start in its room, like its New button.
            if (selected.id === 'recon') {
              startRecon(appCtx, library, selected.id, options);
              return;
            }
            let home = null;
            try { home = homeFor(library.get(), selected.id); } catch { home = null; }
            startLocked(appCtx, selected.id, home ? home.workspaceId : undefined, options);
          },
        }, h(ChipIcon, { name: typeof chip.icon === 'string' ? chip.icon : 'spark' }), chip.label)));
    }

    /** Settings → Start places (step 44): where each tab's new conversations start, and whether Cmd-N follows. */
    function StartPlacesPage({ appCtx, model }) {
      const state = useSyncExternalStore(model.subscribe, model.get);
      const t = appCtx.locale.bind(NS);
      useEffect(() => { void model.refresh(); }, [model]);
      const table = startPlacesOf(state.startPlaces);
      // Item 4A, stage 5: with the space buttons, one row per space (by the space's own tab id, the same stored keys as
      // each space's card on Settings → Spaces, so the two pages always agree).
      const tabs = state.spacesOn
        ? SPACE_IDS.filter((id) => id !== 'recon').map((id) => ({ id: SPACE_TAB[id], label: t('space.' + id) }))
        : tabsOf(state).filter((tab) => tab.id !== 'recon');
      const pick = (tabId, place) => {
        let saved = {};
        try { saved = state.startPlaces ? JSON.parse(state.startPlaces) : {}; } catch { saved = {}; }
        void model.setOption('startPlaces', JSON.stringify({ ...saved, [tabId]: place }));
      };
      return h('div', { className: 'cws-start-page' },
        h('h2', null, t('start.title')),
        h('p', { className: 'cws-lib-empty' }, t(state.spacesOn ? 'start.hint.spaces' : 'start.hint')),
        h('div', { className: 'cws-start-list' },
          tabs.map((tab) => h('div', { key: tab.id, className: 'cws-start-row' },
            h('span', null, tab.label),
            h('span', { className: 'cws-place', role: 'group', 'aria-label': t('start.for', { tab: tab.label }) },
              h('button', { type: 'button', 'aria-pressed': startPlaceOf(tab.id, table) === 'scratch', title: t('place.scratch.hint'), onClick: () => pick(tab.id, 'scratch') }, t('place.scratch')),
              h('button', { type: 'button', 'aria-pressed': startPlaceOf(tab.id, table) === 'folder', title: t('start.folder.hint'), onClick: () => pick(tab.id, 'folder') }, t('place.folder'))))),
          h('div', { className: 'cws-start-row' }, h('span', null, t('start.recon')), h('span', { className: 'cws-time' }, t('start.recon.room')))),
        h('label', { className: 'cws-start-key' },
          h('input', { type: 'checkbox', checked: state.newKeyFollows !== false, onChange: (event) => void model.setOption('newKeyFollows', event.target.checked) }),
          ' ', t('start.newkey')),
        state.error ? h('p', { className: 'cws-lib-empty', role: 'alert' }, state.error) : null);
    }

    /** @returns {boolean} whether the open conversation is in the Scratch project (by its project's folder). */
    function inScratchNow(lib) {
      if (!lib?.ok || !lib.currentId) return false;
      const ws = (lib.workspaces ?? []).find((item) => (item.sessionIds ?? []).includes(lib.currentId));
      return Boolean(ws) && hidden.has(roomKey(ws.path));
    }

    /**
     * Scratch (step 36): a 'Scratch / Folder' switch beside the start page's folder picker, in every
     * tab but Recon (which has its room). It starts a new conversation in Scratch, or back in a folder,
     * without changing any tab's start place. Shown only once the page knows where Scratch is.
     */
    function PlaceSwitch({ appCtx, model, library }) {
      const state = useSyncExternalStore(model.subscribe, model.get);
      const lib = useSyncExternalStore(library.subscribe, library.get);
      const [, bump] = useState(0);
      useEffect(() => {
        if (scratchPlace.path) return undefined;
        let live = true;
        learnScratch().then(() => { if (live) bump((n) => n + 1); });
        return () => { live = false; };
      }, []);
      const selected = selectedTab(state);
      if (!scratchPlace.path || !selected || selected.id === 'recon') return null;
      // Item 4A, stage 4: in the Chat space the Cowork switch under the chat box does this.
      if (state.spacesOn && selected.space === 'chat') return null;
      const t = appCtx.locale.bind(NS);
      const here = inScratchNow(lib);
      const toScratch = () => {
        if (here) return;
        startInScratch(appCtx, library, undefined, selected.id).then((done) => { if (!done) model.fail(t('place.failed')); }, () => model.fail(t('place.failed')));
      };
      const toFolder = () => {
        if (!here) return;
        let home = null;
        try { home = homeFor(library.get(), selected.id); } catch { home = null; }
        startLocked(appCtx, selected.id, home ? home.workspaceId : undefined);
      };
      return h('span', { className: 'cws-place', role: 'group', 'aria-label': t('place.label') },
        h('button', { type: 'button', 'aria-pressed': here, title: t('place.scratch.hint'), onClick: toScratch }, t('place.scratch')),
        h('button', { type: 'button', 'aria-pressed': !here, title: t('place.folder.hint'), onClick: toFolder }, t('place.folder')));
    }

    /**
     * Where this conversation lives: "Scratch", or the project's name (not in Chat, which has no folders,
     * and not in Recon's room). With the same chat box in every mode (Modes → Chat box, on by default) it
     * is a chip ABOVE the chat box at the top left (`PlaceStrip`, in the input dock), never inside the box.
     * With the switch off the old small "Scratch" mark is back in the box, only for a Scratch conversation.
     */
    function placeOf({ appCtx, library, sessionId, anyPlace = false }) {
      const lib = library.get();
      const id = sessionId ?? lib.currentId;
      if (!id) return null;
      const t = appCtx.locale.bind(NS);
      const ws = (lib.workspaces ?? []).find((item) => (item.sessionIds ?? []).includes(id));
      const scratch = Boolean(scratchPlace.path) && ((ws && hidden.has(roomKey(ws.path))) || inScratch(lib.byId?.[id]?.cwd));
      if (scratch) return { scratch: true, name: t('place.scratch'), title: t('place.scratch.hint') };
      // `anyPlace` (the place label under the chat box): the project's name in Chat too.
      if (!ws || rooms.has(roomKey(ws.path)) || (!anyPlace && document.documentElement.hasAttribute('data-cws-plain-chat'))) return null;
      const path = String(ws.path ?? '');
      return { scratch: false, name: String(ws.title ?? '').trim() || path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || path, title: path };
    }

    /** The old small mark in the chat box (only a Scratch conversation, and only with the switch off). */
    function ScratchMark(props) {
      useSyncExternalStore(props.library.subscribe, props.library.get);
      const place = placeOf(props);
      return place?.scratch ? h('span', { className: 'cws-scratch-mark', title: place.title }, place.name) : null;
    }

    /** Whether a thread's place shows under the chat box instead (spaces live, a Chat thread): see CoworkPlace. */
    function chatPlaceUnder({ model, library, sessionId }) {
      const state = model.get();
      if (!state.spacesOn) return false;
      const lib = library.get();
      const id = sessionId ?? lib.currentId;
      if (!id) return false;
      const ws = (lib.workspaces ?? []).find((item) => (item.sessionIds ?? []).includes(id));
      return spaceOfSession(id, lib.byId?.[id], ws, state) === 'chat';
    }

    /**
     * Point 29 (lead): the line above the chat box while a send waits for a New click's draft ('' shows nothing). In the
     * input dock, so it shows above the old thread's box and the new draft's box alike.
     */
    function createSendWait() {
      let text = '';
      const listeners = new Set();
      return {
        subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        get: () => text,
        set: (next) => {
          const value = String(next ?? '');
          if (value === text) return;
          text = value;
          for (const listener of [...listeners]) listener();
        },
      };
    }
    function SendWaitLine(props) {
      const text = useSyncExternalStore(props.sendWait.subscribe, props.sendWait.get);
      if (!text) return null;
      return h('div', { className: 'cws-send-wait', role: 'status', 'data-cws-send-wait': '' }, text);
    }

    /** The place chip above the chat box, top left. Not on the start page: there the app's own folder chip is. */
    function PlaceStrip(props) {
      useSyncExternalStore(props.model.subscribe, props.model.get);
      useSyncExternalStore(props.library.subscribe, props.library.get);
      const ref = useRef(null);
      const [start, setStart] = useState(false);
      useEffect(() => {
        const stack = ref.current?.closest('[data-slot="conversation.input.dock"]')?.parentElement;
        const onStart = Boolean(stack?.querySelector('[data-slot="conversation.hero.workspace"]'));
        if (onStart !== start) setStart(onStart);
        // The chip lines up with the left edge of the chat box, whatever the window's width.
        const align = () => {
          const card = stack?.querySelector('[data-composer-card]');
          const mine = ref.current;
          if (!card || !mine) return;
          const inset = Math.max(0, Math.round(card.getBoundingClientRect().left - mine.getBoundingClientRect().left));
          mine.style.paddingLeft = `${inset}px`;
        };
        align();
        window.addEventListener('resize', align);
        return () => window.removeEventListener('resize', align);
      });
      const place = placeOf(props);
      // Item 4A, stage 4: a Chat thread's place is the label under the chat box (CoworkPlace), not this chip.
      if (!place || start || chatPlaceUnder(props)) return h('span', { ref, hidden: true });
      return h('div', { ref, className: 'cws-place-strip', 'data-cws-place-strip': '' },
        h('span', { className: `cws-scratch-mark${place.scratch ? '' : ' cws-place-folder'}`, title: place.title }, place.name));
    }

    // ---- Item 4A, stage 4: the Cowork switch and the place label ----------------------------------------------------
    // With spaces live, a Chat thread's place is set under the chat box, right after the Mode list (Modes leaves a seat
    // there, [data-dsh-seat="place"]): on a new thread the Cowork switch (off: standalone, its own Scratch folder; on: a
    // project folder, the default workspace first, with the app's folder picker shown to pick another); once the thread
    // has started, a small read-only label ("Standalone" or the project's name). Other spaces keep the place chip above
    // the box and the start page's Scratch / Folder switch, as before.

    /**
     * What the seat shows for a thread.
     * @param {{spacesOn: boolean, space: string, blank: boolean, scratchKnown: boolean, place: {scratch: boolean, name: string, title: string} | null}} input
     *   `space`: the thread's space; `blank`: no message yet; `place`: placeOf's answer (null: nowhere to name).
     * @returns {{kind: 'switch', on: boolean} | {kind: 'label', standalone: boolean, name: string, title: string} | null}
     */
    function coworkPlace({ spacesOn, space, blank, scratchKnown, place }) {
      if (!spacesOn || space !== 'chat') return null;
      if (blank) return scratchKnown ? { kind: 'switch', on: !(place?.scratch === true) } : null;
      if (!place) return null;
      return { kind: 'label', standalone: place.scratch === true, name: place.name, title: place.title };
    }

    /** The text typed into the open chat box ('' when none), so a switch keeps it. */
    function draftText() {
      const boxes = [...document.querySelectorAll('[contenteditable="true"]')].filter((box) => box.offsetParent !== null && !box.closest('.cws-form'));
      return String(boxes[boxes.length - 1]?.innerText ?? '').trim();
    }

    /** The mode a thread has now, as Modes says it ('' when it cannot say). */
    async function modeNow(sessionId) {
      try {
        const response = await fetch(new URL('dsh-modes/mode', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'x-dsh-session': sessionId } });
        const data = response.ok ? await response.json() : null;
        return typeof data?.value?.current === 'string' ? data.value.current : '';
      } catch {
        return '';
      }
    }

    /**
     * Switch a new Chat thread between standalone (Scratch) and a project folder. The app cannot move a thread, so a new
     * draft opens in the other place; the mode picked and the text typed go with it.
     * @returns {Promise<string>} the new thread's id.
     */
    async function switchCowork(appCtx, library, model, on) {
      const t = appCtx.locale.bind(NS);
      const before = library.get()?.currentId ?? '';
      const [mode, text] = [before ? await modeNow(before) : '', draftText()];
      try { appCtx.layout.selectPanel(null); } catch { /* already on the conversation */ }
      if (on) {
        const home = homeFor(library.get(), 'chat');
        if (!home?.workspaceId || inIsolatedRoom(home.path) || hidden.has(roomKey(home.path))) throw new Error(t('cowork.noproject'));
        startLocked(appCtx, 'chat', home.workspaceId);
      } else if (!(await startInScratch(appCtx, library, undefined, 'chat'))) {
        throw new Error(t('cowork.failed.off'));
      }
      const id = await waitForBlank(library, before);
      if (!id) throw new Error(t(on ? 'cowork.failed.on' : 'cowork.failed.off'));
      const started = await modeCall({ action: 'start', sessionId: id, space: 'chat', tab: mode }).catch(() => null);
      if (mode && started?.current !== mode) await modeCall({ action: 'pick', sessionId: id, modeId: mode }).catch(() => {});
      // The app keeps each draft's own text: a draft it reuses may already hold it, so the text is put in only an empty box.
      if (text) void fillDraft(text, { onlyEmpty: true });
      void model.refresh();
      return id;
    }

    /** The Cowork switch's own little icon (a folder). */
    function CoworkGlyph() {
      return h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }));
    }

    /**
     * The Cowork switch or the place label, drawn into Modes' seat after the Mode list (found next to this entry's own
     * hidden anchor in the same chat box). Nothing shows without spaces, outside Chat, or before the seat is there.
     */
    function CoworkPlace(props) {
      const { appCtx, model, library } = props;
      const state = useSyncExternalStore(model.subscribe, model.get);
      const lib = useSyncExternalStore(library.subscribe, library.get);
      const anchor = useRef(null);
      const [seat, setSeat] = useState(null);
      const [busy, setBusy] = useState(false);
      const [problem, setProblem] = useState(null);
      const [, bump] = useState(0);
      const t = appCtx.locale.bind(NS);
      useEffect(() => {
        if (scratchPlace.path) return undefined;
        let live = true;
        learnScratch().then(() => { if (live) bump((n) => n + 1); });
        return () => { live = false; };
      }, []);
      // Modes' seat appears with its row and can be drawn anew: looked for again while it is not there or was replaced.
      useEffect(() => {
        if (!state.spacesOn) { setSeat(null); return undefined; }
        const look = () => {
          const slot = anchor.current?.closest('[data-slot="conversation.input.left"]');
          const found = slot?.querySelector('[data-dsh-seat="place"]') ?? null;
          setSeat((old) => (old === found ? old : found));
        };
        look();
        const timer = dshPoll.loop(look, { every: 700 });
        return () => timer.stop();
      }, [state.spacesOn]);
      useEffect(() => { setProblem(null); }, [lib.currentId]);
      const id = props.sessionId ?? lib.currentId;
      const session = id ? lib.byId?.[id] : null;
      const ws = id ? (lib.workspaces ?? []).find((item) => (item.sessionIds ?? []).includes(id)) : null;
      const space = id ? spaceOfSession(id, session, ws, state) : state.space;
      const view = id && lib.ok ? coworkPlace({ spacesOn: state.spacesOn, space, blank: session?.blank === true, scratchKnown: Boolean(scratchPlace.path), place: placeOf({ appCtx, library, sessionId: id, anyPlace: true }) }) : null;
      const mark = h('span', { ref: anchor, hidden: true, 'data-cws-place-anchor': '' });
      if (!view || !seat) return mark;
      const flip = async (on) => {
        if (busy) return;
        setBusy(true);
        setProblem(null);
        try {
          await switchCowork(appCtx, library, model, on);
        } catch (error) {
          setProblem({ on, error });
        } finally {
          setBusy(false);
        }
      };
      const said = String(problem?.error?.message ?? '');
      const ours = [t('cowork.noproject'), t('cowork.failed.on'), t('cowork.failed.off')].includes(said);
      // What went wrong and what to click; anything raw only behind Details.
      const note = problem
        ? h('div', { className: 'cws-cowork-err' },
            h(ui.ErrorNote, { what: ours ? said : t(problem.on ? 'cowork.failed.on' : 'cowork.failed.off'), fix: said === t('cowork.noproject') ? undefined : t('cowork.failed.fix'), details: ours ? undefined : said || undefined },
              h('button', { type: 'button', className: 'cws-link', onClick: () => setProblem(null) }, t('cowork.close'))))
        : null;
      const body = view.kind === 'switch'
        ? h('span', { className: 'cws-cowork', 'data-on': String(view.on) },
            h('button', {
              type: 'button', role: 'switch', className: 'cws-cowork-btn', 'aria-checked': view.on, disabled: busy,
              'aria-label': t('cowork.label'), title: busy ? t('cowork.busy') : t(view.on ? 'cowork.on' : 'cowork.off'),
              onClick: () => void flip(!view.on),
            }, h(CoworkGlyph), h('span', { className: 'cws-cowork-lbl' }, t('cowork.label')), h('span', { className: 'cws-cowork-track', 'aria-hidden': 'true' })),
            h(ui.Info, { title: t('cowork.label'), what: t('cowork.info.what'), when: t('cowork.info.when'), change: t('cowork.info.change'), portal: true }),
            note)
        : h('span', { className: 'cws-cowork', 'data-place': view.standalone ? 'standalone' : 'project' },
            h('span', { className: 'cws-place-label', title: view.title }, h(CoworkGlyph), h('span', { className: 'cws-cowork-lbl' }, view.standalone ? t('place.standalone') : view.name)),
            h(ui.Info, { title: t('place.info.title'), what: t('place.info.what'), when: t('place.info.when'), change: t('place.info.change'), portal: true }));
      return h(React.Fragment, null, mark, ReactDOM.createPortal(h(React.Fragment, null, h('style', null, COWORK_CSS), body), seat));
    }

    /** The switch and the label in the row's look (a 28 px pill, like Mode and Depth); app variables only. */
    const COWORK_CSS = `
.cws-cowork{display:inline-flex;align-items:center;gap:2px;position:relative}
.cws-cowork-btn,.cws-place-label{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 8px 0 10px;border:1px solid var(--dsw-alias-border-l2);border-radius:14px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;white-space:nowrap;box-sizing:border-box}
.cws-cowork-btn{cursor:pointer}
.cws-cowork-btn:disabled{opacity:.5;cursor:default}
.cws-cowork-btn[aria-checked='true']{color:var(--dsw-alias-label-primary)}
.cws-place-label{padding:0 10px;border-style:dashed;max-width:14em}
.cws-place-label .cws-cowork-lbl{overflow:hidden;text-overflow:ellipsis}
.cws-cowork-track{position:relative;flex:none;width:26px;height:16px;border-radius:999px;background:var(--dsw-alias-border-l3,var(--dsw-alias-border-l2))}
.cws-cowork-track::after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:var(--dsw-alias-switch-thumb,var(--dsw-alias-label-primary))}
.cws-cowork-btn[aria-checked='true'] .cws-cowork-track{background:var(--dsw-alias-brand-primary)}
.cws-cowork-btn[aria-checked='true'] .cws-cowork-track::after{left:12px;background:var(--dsw-alias-bg-base)}
@media (prefers-reduced-motion:no-preference){.cws-cowork-track,.cws-cowork-track::after{transition:all .12s ease}}
@media (hover:hover){.cws-cowork-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}
.cws-cowork-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
/* Round 2: the Cowork switch's name goes last (step 5, with Depth's and the mode's), so it stays readable at 1280 px. */
.dsh-me-tools[data-f5] .cws-cowork-lbl{display:none}
.dsh-me-tools[data-f5] .cws-place-label{padding:0 8px}
@media (max-width:760px){.cws-cowork-lbl{display:none}}
.cws-cowork-err{position:absolute;bottom:calc(100% + 8px);left:0;z-index:20;box-sizing:border-box;width:320px;max-width:calc(100vw - 24px);padding:10px 12px;border-radius:12px;border:0.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1,var(--dsw-alias-bg-base));box-shadow:0 8px 28px rgba(0,0,0,.28);white-space:normal;font-size:12px;line-height:18px}
`;

    const CHIP_ICONS = {"slides": "M4 5h16v11H4zM12 16v4M8 20h8", "website": "M4 5h16v14H4zM4 9h16M7 7h.01M9 7h.01", "app": "M8 3h8v18H8zM11 18h2", "spreadsheet": "M4 5h16v14H4zM4 10h16M4 15h16M10 5v14", "chart": "M5 19V9M10 19V5M15 19v-7M20 19v-4M4 19h17", "research": "M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.3 15.3 20 20", "game": "M6 9h12a3 3 0 0 1 3 3v2a3 3 0 0 1-5.4 1.8L14 14h-4l-1.6 1.8A3 3 0 0 1 3 14v-2a3 3 0 0 1 3-3zM8 11v2M7 12h2M16 12h.01M18 12h.01", "spark": "M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"};
    function ChipIcon({ name }) {
      const d = CHIP_ICONS[name] ?? CHIP_ICONS.spark;
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d }));
    }

    function LinkIcon({ size }) { return h(Glyph, { name: 'link', size }); }
    function SparkleIcon({ size }) { return h(Glyph, { name: 'sparkle', size }); }

    // ---- One options area for every mode (the owner's rule of 18 November 2026) ----------------------------
    // A mode's own options (Scout's fields, Finance's selection, Creator Plus's run and plugins) sit UNDER the chat
    // box, in the same place and with the same look in every mode: on the start page and in a started conversation.
    // The add-ons render their fields inside this one component (window.__dshOptionsArea) with these classes:
    // dsh-opt-pick (a field, drop-down or button), dsh-opt-chip (a chip with ×), dsh-opt-break (a new line),
    // dsh-opt-hint (the one-line summary). Each mode keeps its own behaviour; only the place and the look are shared.
    const OPTIONS_CSS = `
.dsh-opt-area { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; box-sizing: border-box; }
.dsh-opt-area[data-place="start"] { position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; }
[class*='_composerHero']:has(.dsh-opt-area[data-place="start"]) { position: relative; }
[class*='_composerHero']:has(.dsh-opt-area[data-place="start"]) .cws-chips { margin-top: calc(var(--dsh-opt-area, 110px) + 36px); }
.dsh-opt-area[data-place="chat"] { order: 2; width: 100%; margin-top: 10px; padding: 0 4px 12px; }
/* In a started conversation the area is there only while the chat box is the same in every mode and the modes' own
   buttons have left the box (Modes' switch, Settings helper's gear); otherwise those buttons are in the box as before. */
html:not([data-dsh-uniform="true"][data-dsh-gear="on"][data-dsh-extras="on"]) .dsh-opt-area[data-place="chat"] { display: none !important; }
.dsh-opt-pick {
  box-sizing: border-box; height: 36px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base, transparent); cursor: pointer; max-width: 220px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
input.dsh-opt-pick { cursor: text; width: 190px; max-width: 190px; }
button.dsh-opt-pick { display: inline-flex; align-items: center; gap: 6px; }
button.dsh-opt-pick[aria-pressed="true"] { border-color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-opt-pick:disabled { opacity: .5; cursor: default; }
.dsh-opt-pick:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-opt-chip { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 6px 0 12px; border-radius: 15px; font-size: 13px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-opt-chip button { width: 20px; height: 20px; border: 0; border-radius: 50%; padding: 0; cursor: pointer; font: inherit; line-height: 20px; color: var(--dsw-alias-label-secondary); background: transparent; }
.dsh-opt-chip button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-opt-break { flex-basis: 100%; height: 0; }
.dsh-opt-hint { flex-basis: 100%; text-align: center; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-opt-hint[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
`;

    /** The sidebar's selected tab, kept up to date (html[data-cws-tab]). */
    function useShownTab() {
      const read = () => document.documentElement.getAttribute('data-cws-tab') ?? '';
      const [tab, setTab] = useState(read);
      useEffect(() => {
        const watch = new MutationObserver(() => setTab(read()));
        watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cws-tab'] });
        setTab(read());
        return () => watch.disconnect();
      }, []);
      return tab;
    }

    /**
     * The options area under the chat box. `mode`: the tab it belongs to (nothing on another tab). `place`: 'start'
     * (the start page, slot conversation.hero.options) or 'chat' (a started conversation, slot conversation.input.dock,
     * drawn after the box). A 'chat' area shows nothing on a start page, so the two never show together.
     */
    function OptionsArea({ mode, place = 'start', label, children }) {
      const tab = useShownTab();
      const ref = useRef(null);
      const [onStart, setOnStart] = useState(false);
      // A 'chat' area: is this the start page? (checked after every drawing, as the place chip does)
      useEffect(() => {
        const node = ref.current;
        if (!node || place !== 'chat') return;
        const stack = node.closest('[data-slot="conversation.input.dock"]')?.parentElement;
        const start = Boolean(stack?.querySelector('[data-slot="conversation.hero.workspace"]'));
        if (start !== onStart) setOnStart(start);
      });
      const showing = tab === mode && !(place === 'chat' && onStart);
      useEffect(() => {
        const node = ref.current;
        if (!node || place !== 'start') return undefined;
        // Only the area that shows tells the start page how much room to keep (the other tabs' areas are hidden).
        if (node.hidden || typeof ResizeObserver !== 'function') return undefined;
        const root = document.documentElement;
        const watch = new ResizeObserver(() => root.style.setProperty('--dsh-opt-area', `${Math.round(node.getBoundingClientRect().height)}px`));
        watch.observe(node);
        return () => { watch.disconnect(); root.style.removeProperty('--dsh-opt-area'); };
      }, [showing, place]);
      if (!showing) return h('span', { ref, hidden: true });
      return h('div', { ref, className: 'dsh-opt-area', 'data-place': place, 'data-mode': mode, role: 'group', 'aria-label': label },
        h('style', null, OPTIONS_CSS), children);
    }

    // What the chat box says before you type, by tab. The app's own line fits Code only and says "sessions", so every
    // tab, Code too, gets a plain line of its own that says "threads".
    // CSS only (no script, no watching): the app's line is hidden and ours is drawn in the same place and look.
    const PLACEHOLDERS = {
      chat: 'Ask anything',
      plain: 'Ask anything',
      code: 'Describe what you want to build, / commands, @ files or threads',
      cowork: 'Describe what you want done',
      research: 'What do you want to find out?',
      finance: 'Ask about your money or numbers',
      data: 'Ask a question about your data',
      recon: 'Ask in the private room',
      scout: 'What are you looking for?',
      content: 'What do you want to write or make?',
      automations: 'Describe what should run, and when',
      bench: 'Ask about a device',
      'creator-plus': 'What should be built or improved?',
    };
    const PLACEHOLDER_CSS = Object.entries(PLACEHOLDERS).map(([tab, line]) => {
      const where = `html[data-cws-tab="${tab}"] [class*='_grow']:has([data-composer-input]) > [class*='_placeholder']`;
      return `${where}{font-size:0 !important}\n${where}::before{content:${JSON.stringify(line)};font-size:15px;line-height:25px}`;
    }).join('\n');

    return {
      OptionsArea,
      OPTIONS_CSS,
      inject: ['slots', 'layout', 'uiWorkspace', 'locale', 'remote', 'remote.settings', 'remote.session'],
      apply(ctx) {
        // The one options area, for the modes' add-ons (see OptionsArea).
        window.__dshOptionsArea = OptionsArea;
        ctx.effect(() => () => { if (window.__dshOptionsArea === OptionsArea) delete window.__dshOptionsArea; });
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const style = document.createElement('style');
        style.setAttribute('data-cowork-shell-style', '');
        style.textContent = CSS + '\n' + PLACEHOLDER_CSS;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());

        const model = createModel(ctx);
        const pages = createPages(ctx);
        const sections = createSections(ctx);
        const library = createLibrary(ctx);
        const trash = createTrash();
        const projects = createProjects();
        void learnScratch();
        void learnRoom();
        // Item 4A, stage 6a: a start's answer may show a line under the tabs; a first send waits for a guarded start.
        shellModel.current = model;
        const sendWait = createSendWait();
        ctx.effect(() => holdSendsForStarts(document, library, {
          say: (key) => { try { model.note(ctx.locale.bind(NS)(key)); } catch { /* the box keeps the text either way */ } },
          waitLine: (key) => { try { sendWait.set(key ? ctx.locale.bind(NS)(key) : ''); } catch { sendWait.set(''); } },
          // Stage 7 lab (bug D): a send of a message already moved to the new thread asks first.
          // danger: the question opens on Don't send, so an extra Enter press never sends the message again (stage 7 lab).
          askAgain: () => { const t = ctx.locale.bind(NS); return askInPage({ text: t('send.alreadyAsk'), ok: t('send.alreadyYes'), cancel: t('send.alreadyNo'), danger: true }); },
          store: (() => { try { return window.sessionStorage; } catch { return null; } })(),
        }));
        ctx.effect(() => () => sendWait.set(''));
        // Stage 7 (6b lab leftover): Recon's room and its threads stay out of other spaces' Show all and workspace list.
        ctx.effect(() => watchReconElsewhere(document, library, model));
        const shared = () => ({ appCtx: ctx, model, pages, sections, library, trash, projects, sendWait });
        // Cmd-N (the app's New Session) follows the open tab's start place while that switch is on; the
        // app's own action comes back when it is off or this add-on stops. As Global Search does for Cmd-K.
        ctx.effect(() => {
          let undo;
          let tries = 0;
          const take = () => {
            if (undo) return true;
            let command;
            try {
              const service = ctx.get('shortcuts');
              command = (service?.registry?.commands ?? service?.commands)?.get?.('session.new');
            } catch {
              command = undefined;
            }
            if (!command || typeof command.resolve !== 'function') return false;
            const original = command.resolve;
            command.resolve = (context) => {
              const now = model.get();
              // Workshop shown only through Tuner Plus has no New button: Cmd-N does what the app does.
              if (startPlaceTable.newKey === false || (now.spacesOn && selectedTab(now).space === 'workshop' && workshopWithoutCreator(now))) return original(context);
              return { status: 'handled', run: () => startNew(ctx, library, selectedTab(now).id) };
            };
            undo = () => { command.resolve = original; };
            return true;
          };
          const timer = setInterval(() => { tries += 1; if (take() || tries > 40) clearInterval(timer); }, 500);
          take();
          return () => { clearInterval(timer); undo?.(); };
        }, 'cowork-shell: Cmd-N follows the start place');
        // Item 4A, stage 3b: other add-ons open a thread in a space and a mode with the window event
        // `dsh-cowork-shell:start` ({space, mode, onError}), cancelable: the sidebar cancels it when it takes it (spaces
        // live), so the sender knows. The Automations page's "Ask about automations" uses it (Chat, Automations mode).
        ctx.effect(() => {
          const onStart = (event) => {
            const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
            if (!model.get().spacesOn) return;
            event.preventDefault();
            const space = isSpaceId(detail.space) ? detail.space : 'chat';
            const mode = typeof detail.mode === 'string' ? detail.mode.slice(0, 64) : '';
            startInMode(ctx, library, model, space, mode).catch((error) => {
              const text = String(error?.message ?? error).slice(0, 400);
              model.fail(text);
              try { detail.onError?.(text); } catch { /* the sender is gone */ }
            });
          };
          window.addEventListener('dsh-cowork-shell:start', onStart);
          return () => window.removeEventListener('dsh-cowork-shell:start', onStart);
        }, 'cowork-shell: start a thread in a space and a mode');
        // Item 4A, fix round 2: Modes switches this window to a thread's space without opening anything else, with the
        // window event `dsh-cowork-shell:show-space` ({space}), cancelable: the sidebar cancels it when it takes it. Used
        // when a folder picked through the app's own picker turns out to be Recon's room: the thread is a sealed Recon
        // thread, so the window follows it to Recon instead of losing it from the list it was opened in.
        ctx.effect(() => {
          const onShow = (event) => {
            const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
            if (!model.get().spacesOn || !isSpaceId(detail.space)) return;
            event.preventDefault();
            if (model.get().space !== detail.space) void model.select(detail.space);
          };
          window.addEventListener('dsh-cowork-shell:show-space', onShow);
          return () => window.removeEventListener('dsh-cowork-shell:show-space', onShow);
        }, 'cowork-shell: show a thread\'s space');
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register(
          { name: 'settings.section', id: 'cowork-start', order: 101, label: () => ctx.locale.bind(NS)('start.title') },
          () => h(StartPlacesPage, { appCtx: ctx, model }),
        )), 'cowork-shell: start places settings');

        ctx.effect(() => ctx.slots.inject('sidebar', function* () {
          yield ctx.slots.registerFactory({
            name: 'sidebar.panel.icon', scope: 'root',
            children: { 'sidebar.panellist': { kind: 'list', scope: 'root' } },
          }, PanelIcon);
          yield ctx.slots.register({
            name: 'sidebar',
            locale: NS,
            children: {
              'sidebar.brand.mark': { kind: 'single', scope: 'root' },
              'sidebar.brand.name': { kind: 'single', scope: 'root' },
              'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
              'sidebar.panellist.actions': { kind: 'list', scope: 'root' },
              'sidebar.workspaces': {
                kind: 'single', scope: 'root',
                inject: { hooks: { sectionScroller: (_standard, hookContext) => hookContext.useSectionScroller } },
              },
              'sidebar.settings': { kind: 'single', scope: 'root' },
              'sidebar.footer.action': { kind: 'list', scope: 'root' },
            },
            inject: shared,
          }, CoworkSidebar);
        }, 'cowork-shell: sidebar'));
        ctx.inject(['remote.pluginManager'], (inner) => {
          PLUGIN_SWITCH.set = (entryId, on) => inner.remote.pluginManager.setPluginEnabled(entryId, on);
          inner.effect(() => () => { PLUGIN_SWITCH.set = null; }, 'cowork-shell: plugin switch');
        });
        // Full pages with their own sidebar rows (listed per tab by the tab layout).
        const tPage = ctx.locale.bind(NS);
        for (const page of [
          { key: 'connectors', order: 30, label: () => tPage('connectors.title'), Page: ConnectorsPage, Icon: LinkIcon },
          { key: 'skills', order: 31, label: () => tPage('skills.title'), Page: SkillsPage, Icon: SparkleIcon },
        ]) {
          ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: page.key }, () => h(page.Page, { appCtx: ctx }))), `cowork-shell: ${page.key} page`);
          ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
            name: 'sidebar.panellist', id: page.key, order: page.order, label: page.label,
          }, page.Icon)), `cowork-shell: ${page.key} row`);
        }
        // The project page: opened from a project's row, so it has no row of its own in the page list.
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'project' }, () => h(ProjectPage, { appCtx: ctx, model, library, projects }))), 'cowork-shell: project page');
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'project', order: 99, label: () => tPage('proj.title'),
        }, function ProjectIcon({ size }) { return h(Glyph, { name: 'folder', size }); })), 'cowork-shell: project page entry');
        // Start page: greeting next to the logo and suggestion chips.
        ctx.effect(() => ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({
          name: 'conversation.hero.brand.mark', inject: shared,
        }, HeroGreeting)), 'cowork-shell: start page greeting');
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options', id: 'cowork-chips', order: 50, inject: shared,
        }, HeroChips)), 'cowork-shell: suggestion chips');
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({
          name: 'conversation.hero.options', id: 'cowork-place', order: 5, inject: shared,
        }, PlaceSwitch)), 'cowork-shell: Scratch / Folder switch');
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left', id: 'cowork-scratch-mark', order: -30, inject: shared,
        }, ScratchMark)), 'cowork-shell: Scratch mark');
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock', id: 'cowork-place-strip', order: -50, inject: shared,
        }, PlaceStrip)), 'cowork-shell: place chip above the chat box');
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({
          name: 'conversation.input.dock', id: 'cowork-send-wait', order: -60, inject: shared,
        }, SendWaitLine)), 'cowork-shell: the line while a send waits for New');
        // Item 4A, stage 4: the Cowork switch (a new Chat thread) and the place label (a started one), after the Mode list.
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
          name: 'conversation.input.left', id: 'cowork-switch', order: -20, inject: shared,
        }, CoworkPlace)), 'cowork-shell: Cowork switch and place label');
        ctx.effect(() => ctx.slots.inject('shell.leading', () => ctx.slots.register({
          name: 'shell.leading', locale: NS, inject: shared,
        }, Leading)), 'cowork-shell: macOS hidden-sidebar controls');
      },
    };
  },
});
