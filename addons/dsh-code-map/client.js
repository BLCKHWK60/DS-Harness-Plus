/**
 * Browser half of Code map: the Settings → Code map page.
 *
 * Switches and limits are saved through the app's settings channel. Folder numbers
 * come from the fenced `GET dsh-code-map/status` route; Rebuild and Delete go to the
 * fenced `POST dsh-code-map/action` route, which only accepts a folder that already
 * has a map or the app's default folder. The page follows docs/UI-STYLE.md: colours
 * come only from the app's variables, so it follows every colour scheme.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-code-map',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState } = React;
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
    dshUi.ensureStyle();

    /* dsh-merge:begin */
    /* Shared by the add-ons whose settings pages are merged (host page shows partner parts). Keep every copy identical. */
    const dshMerge = (() => {
      const reg = (window.__dshMerge = window.__dshMerge || { hosts: {}, parts: {}, want: {}, subs: new Set() });
      const tell = () => { for (const fn of [...reg.subs]) { try { fn(); } catch {} } };
      const api = {
        /** A host page announces itself; the returned function withdraws it. */
        host(hostId) {
          reg.hosts[hostId] = (reg.hosts[hostId] || 0) + 1;
          tell();
          let done = false;
          return () => { if (done) return; done = true; reg.hosts[hostId] -= 1; if (!reg.hosts[hostId]) delete reg.hosts[hostId]; tell(); };
        },
        hasHost: (hostId) => Boolean(reg.hosts[hostId]),
        /** A partner offers a part ({label: () => string, order, render: (props) => element}) to a host page. */
        part(hostId, partId, spec) {
          const list = (reg.parts[hostId] = reg.parts[hostId] || {});
          list[partId] = spec;
          tell();
          return () => { if (list[partId] === spec) { delete list[partId]; tell(); } };
        },
        parts: (hostId) => Object.entries(reg.parts[hostId] || {}).map(([id, spec]) => ({ id, ...spec })).sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
        subscribe(fn) { reg.subs.add(fn); return () => reg.subs.delete(fn); },
        /** Settings search asks a host page to show one tab ('main' or a part id). */
        openTab(hostId, tabId) { reg.want[hostId] = tabId; tell(); },
        /** React hook: the host's current tab ('main' first), and a setter. Re-renders when parts or hosts change. */
        useTab(React, hostId, first = 'main') {
          const [tab, setTab] = React.useState(first);
          const [, bump] = React.useState(0);
          React.useEffect(() => api.subscribe(() => {
            const wanted = reg.want[hostId];
            if (wanted) { delete reg.want[hostId]; setTab(wanted); }
            bump((n) => n + 1);
          }), []);
          React.useEffect(() => { const wanted = reg.want[hostId]; if (wanted) { delete reg.want[hostId]; setTab(wanted); } }, []);
          const ids = ['main', ...api.parts(hostId).map((p) => p.id)];
          return [ids.includes(tab) ? tab : 'main', setTab];
        },
        /** A partner shows its own page only while no host page shows it. `register()` registers the page and returns its remover. */
        ownPageUnlessHosted(hostId, register) {
          let off;
          const sync = () => {
            const need = !api.hasHost(hostId);
            if (need && !off) off = register();
            else if (!need && off) { off(); off = undefined; }
          };
          sync();
          const unsub = api.subscribe(sync);
          return () => { unsub(); if (off) { off(); off = undefined; } };
        },
      };
      return api;
    })();
    /* dsh-merge:end */

    const NS = 'code-map';

    const DICT = {
      en: {
        'section.title': 'Code tools',
        'head.title': 'Code tools',
        'head.hint': 'Tools for working on code: a map of your project, and (when Code power is installed) reviews and fixes.',
        'tab.map': 'Code map',
        'tabs.label': 'Code tools sections',
        'map.hint':
          'A compact map of your project: its files, the functions and classes in them, and what uses what. The assistant looks things up in the map and reads one function at a time, instead of reading whole files. That uses far fewer tokens on a large project. Nothing is installed and nothing is written into your project.',
        'row.enabled': 'Use the code map',
        'row.enabled.hint': 'Gives the assistant five look-up tools in threads that have tools (Cowork and Code). When it is off they are not offered at all.',
        'row.hint': 'Tell the assistant about it',
        'row.hint.hint': 'Adds three lines to its instructions in code projects, so it uses the map before reading files.',
        'group.folders': 'Mapped folders',
        'folders.empty': 'No folder is mapped yet. A map is made the first time the assistant uses it in a project.',
        'folder.default': 'Default folder',
        'folder.unmapped': 'Not mapped yet.',
        'folder.numbers': '{files} files · {symbols} functions, classes and other names · {source} of source',
        'folder.saving': 'About {tokens} tokens to read in full. An overview from the map is at most about 1,500 tokens.',
        'folder.disk': 'The map takes {disk} on this Mac · made {when}',
        'folder.partial': 'Only part of this folder is mapped, because a limit below was reached.',
        'folder.building': 'Mapping…',
        'action.rebuild': 'Map again',
        'action.build': 'Map this folder now',
        'action.clear': 'Delete map',
        'group.limits': 'Limits',
        'limit.files': 'Most files in one folder',
        'limit.files.hint': 'A bigger folder is mapped up to this many files. 100 to 50,000.',
        'limit.kb': 'Largest file (KB)',
        'limit.kb.hint': 'Bigger files are skipped. 16 to 4,096.',
        'limit.ignore': 'Also leave out',
        'limit.ignore.hint': 'One pattern per line, written like a line in a .gitignore file, for example docs/ or *.generated.ts. Dependency and build folders, binaries, lock files and anything your .gitignore lists are always left out.',
        'group.skills': 'Reverse-engineer skills',
        'skills.hint': 'Four step-by-step guides the assistant can follow. Type / in the chat box and pick one, or just ask.',
        'skill.reverse-codebase': 'A code base: how it works, written as an architecture document.',
        'skill.reverse-website': 'A website or web app: a specification to rebuild it from.',
        'skill.reverse-api-format': 'An API or file format: documentation from examples.',
        'skill.reverse-app-binary': 'An installed app or program file: what it is made of and what it does. For software you own or may analyse; it does not remove protections.',
        'group.how': 'Good to know',
        'how.1': 'The map lists names, line numbers and connections. It does not hold your code, and it is kept in the app\'s own data folder.',
        'how.2': 'Connections are found by reading the text, not by compiling. They are right for ordinary code and can miss unusual constructs.',
        'how.3': 'Only the folder a thread works in is mapped. Links to other folders are never followed.',
        'saved': 'Saved',
        'saving': 'Saving…',
        'loading': 'Loading…',
        'unavailable': 'The Code map page could not load its data. Restart the app once after installing.',
        'when.now': 'just now',
        'when.min': '{n} min ago',
        'when.hour': '{n} h ago',
        'when.day': '{n} days ago',
      },
    };

    const CSS = `
.dsh-cm-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cm-row[data-stack="true"] { flex-direction: column; align-items: stretch; gap: 8px; }
.dsh-cm-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-cm-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-cm-num { flex: none; width: 120px; }
textarea.dsh-cm-field { width: 100%; height: auto; min-height: 84px; padding: 9px 14px; line-height: 20px; resize: vertical; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.dsh-cm-card {
  display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; padding: 12px 14px; border-radius: 20px;
  border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));
}
.dsh-cm-cardhead { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsh-cm-folder { flex: 1; min-width: 0; font-size: 14px; line-height: 22px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; direction: rtl; text-align: left; }
.dsh-cm-tag { flex: none; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 11px; line-height: 24px; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-cm-line { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cm-line[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-cm-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
.dsh-cm-btn {
  height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer;
}
.dsh-cm-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-cm-btn[disabled] { opacity: .5; cursor: default; }
.dsh-cm-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-cm-list { margin: 0; padding: 0; list-style: none; }
.dsh-cm-list li { padding: 10px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cm-list li b { display: block; font-size: 14px; line-height: 22px; font-weight: 400; color: var(--dsw-alias-label-primary); }
.dsh-cm-tabs { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 12px 0 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cm-tab { height: 32px; padding: 0; border: 0; border-bottom: 2px solid transparent; background: transparent; font: inherit; font-size: 13px; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-cm-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); border-bottom-color: var(--dsw-alias-brand-primary); }
.dsh-cm-tab:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-cm-status { margin-top: 16px; min-height: 18px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cm-status[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
`;

    /** @param {number} bytes @returns {string} a short size. */
    function size(bytes) {
      if (!(bytes > 0)) return '0 KB';
      if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
      return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    }

    /** @param {number} n @returns {string} a number with thousands separators. */
    function count(n) {
      return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    /** Load this add-on's settings through the app's settings channel. */
    async function loadSettings(ctx) {
      if (!ctx.remote?.settings) throw dshKit.fail('settings unavailable');
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    /** Write settings; on a conflict, reload once and try again. */
    async function mutateSettings(ctx, ops, revision) {
      let result = await ctx.remote.settings.mutate(NS, ops, revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw dshKit.fail(result.error);
      return { value: result.value.value ?? {}, revision: result.value.revision };
    }

    /** Read the folder numbers. */
    async function loadStatus() {
      const response = await fetch(new URL('dsh-code-map/status', document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw dshKit.fail(`status ${response.status}`);
      return response.json();
    }

    /** Ask the host to map a folder again or delete its map. */
    async function sendAction(action, id) {
      const response = await fetch(new URL('dsh-code-map/action', document.baseURI), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-dsh-code-map': '1' },
        body: JSON.stringify({ action, id }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(body.error || `status ${response.status}`);
      return body;
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dshu-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    /** A number field that saves when you leave it or press Enter. */
    function NumberField({ value, min, max, label, onCommit }) {
      const [draft, setDraft] = useState(String(value));
      useEffect(() => setDraft(String(value)), [value]);
      const commit = () => {
        const number = Math.round(Number(draft));
        if (!Number.isFinite(number)) return setDraft(String(value));
        const next = Math.min(max, Math.max(min, number));
        setDraft(String(next));
        if (next !== value) onCommit(next);
      };
      return h('input', {
        className: 'dsh-cm-field dsh-cm-num',
        type: 'number',
        min,
        max,
        step: 1,
        value: draft,
        'aria-label': label,
        onChange: (event) => setDraft(event.target.value),
        onBlur: commit,
        onKeyDown: (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.target.blur();
          }
        },
      });
    }

    function CodeMapPage({ appCtx }) {
      const t = appCtx.locale.bind('codeMap');
      const [settings, setSettings] = useState(null);
      const [status, setStatus] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState('');
      const [ignore, setIgnore] = useState('');

      const refresh = useCallback(async () => {
        try {
          setStatus(await loadStatus());
        } catch {
          setStatus((prev) => prev ?? { error: true });
        }
      }, []);

      useEffect(() => {
        let alive = true;
        (async () => {
          try {
            const loaded = await loadSettings(appCtx);
            if (!alive) return;
            setSettings(loaded);
            setIgnore(typeof loaded.value.extraIgnore === 'string' ? loaded.value.extraIgnore : '');
          } catch {
            if (alive) setNote({ text: t('unavailable'), error: true });
          }
        })();
        refresh();
        return () => {
          alive = false;
        };
      }, [appCtx, refresh]);

      // While a folder is being mapped, look again every two seconds.
      const building = Boolean(status?.folders?.some((row) => row.building));
      useEffect(() => {
        if (!building) return undefined;
        const timer = dshPoll.loop(() => refresh(), { every: 2000, immediate: false });
        return () => timer.stop();
      }, [building, refresh]);

      const save = async (field, value) => {
        if (!settings) return;
        setNote({ text: t('saving'), error: false });
        try {
          const next = await mutateSettings(appCtx, [{ op: 'set', path: [field], value }], settings.revision);
          setSettings(next);
          setNote({ text: t('saved'), error: false });
          refresh();
        } catch (error) {
          setNote({ text: String(error?.message ?? error), error: true });
        }
      };

      const act = async (action, id) => {
        setBusy(`${action}:${id}`);
        setNote({ text: '', error: false });
        try {
          setStatus(await sendAction(action, id));
        } catch (error) {
          setNote({ text: String(error?.message ?? error), error: true });
        }
        setBusy('');
      };

      const when = (at) => {
        const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
        if (seconds < 90) return t('when.now');
        if (seconds < 5400) return t('when.min').replace('{n}', String(Math.round(seconds / 60)));
        if (seconds < 129600) return t('when.hour').replace('{n}', String(Math.round(seconds / 3600)));
        return t('when.day').replace('{n}', String(Math.round(seconds / 86400)));
      };

      const value = settings?.value ?? {};
      const enabled = value.enabled !== false;
      const hint = value.promptHint !== false;
      const maxFiles = Number.isFinite(Number(value.maxFiles)) ? Number(value.maxFiles) : 5000;
      const maxKb = Number.isFinite(Number(value.maxFileKb)) ? Number(value.maxFileKb) : 400;
      const folders = status?.folders ?? [];
      const preset = status?.defaultFolder;
      const presetMapped = preset && folders.some((row) => row.id === preset.id);

      const folderCard = (row) =>
        h(
          'div',
          { className: 'dsh-cm-card', key: row.id },
          h(
            'div',
            { className: 'dsh-cm-cardhead' },
            h('span', { className: 'dsh-cm-folder', title: row.folder }, h('bdi', null, row.folder)),
            preset && preset.id === row.id ? h('span', { className: 'dsh-cm-tag' }, t('folder.default')) : null,
          ),
          h(
            'div',
            { className: 'dsh-cm-line' },
            row.building && !row.builtAt
              ? t('folder.building')
              : t('folder.numbers').replace('{files}', count(row.files)).replace('{symbols}', count(row.symbols)).replace('{source}', size(row.bytes)),
          ),
          row.builtAt
            ? h(
                'div',
                { className: 'dsh-cm-line' },
                t('folder.saving').replace('{tokens}', count(row.bytes / 4)),
              )
            : null,
          row.builtAt
            ? h('div', { className: 'dsh-cm-line' }, t('folder.disk').replace('{disk}', size(row.diskBytes)).replace('{when}', row.building ? t('folder.building') : when(row.builtAt)))
            : null,
          row.languages?.length
            ? h('div', { className: 'dsh-cm-line' }, row.languages.slice(0, 6).map(([lang, n]) => `${lang} ${count(n)}`).join(' · '))
            : null,
          row.truncated ? h('div', { className: 'dsh-cm-line', 'data-warn': 'true' }, t('folder.partial')) : null,
          h(
            'div',
            { className: 'dsh-cm-actions' },
            h('button', { type: 'button', className: 'dsh-cm-btn', disabled: busy !== '' || row.building || !enabled, onClick: () => act('rebuild', row.id) }, busy === `rebuild:${row.id}` ? t('folder.building') : t('action.rebuild')),
            h('button', { type: 'button', className: 'dsh-cm-btn', disabled: busy !== '' || row.building, onClick: () => act('clear', row.id) }, t('action.clear')),
          ),
        );

      return h(
        'div',
        { className: 'dshu-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('p', { className: 'dshu-desc' }, t('map.hint')),

        h(
          'div',
          { className: 'dsh-cm-row' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, t('row.enabled')), h('div', { className: 'dshu-rowdesc' }, t('row.enabled.hint'))),
          h(Switch, { checked: enabled, label: t('row.enabled'), onChange: (next) => save('enabled', next) }),
        ),
        h(
          'div',
          { className: 'dsh-cm-row' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, t('row.hint')), h('div', { className: 'dshu-rowdesc' }, t('row.hint.hint'))),
          h(Switch, { checked: hint, label: t('row.hint'), onChange: (next) => save('promptHint', next) }),
        ),

        h('div', { className: 'dshu-group' }, t('group.folders')),
        preset && !presetMapped && !preset.refusal
          ? h(
              'div',
              { className: 'dsh-cm-card' },
              h('div', { className: 'dsh-cm-cardhead' }, h('span', { className: 'dsh-cm-folder', title: preset.folder }, h('bdi', null, preset.folder)), h('span', { className: 'dsh-cm-tag' }, t('folder.default'))),
              h('div', { className: 'dsh-cm-line' }, t('folder.unmapped')),
              h(
                'div',
                { className: 'dsh-cm-actions' },
                h('button', { type: 'button', className: 'dsh-cm-btn', 'data-main': 'true', disabled: busy !== '' || !enabled, onClick: () => act('rebuild', preset.id) }, busy === `rebuild:${preset.id}` ? t('folder.building') : t('action.build')),
              ),
            )
          : null,
        folders.length > 0 ? folders.map(folderCard) : h('div', { className: 'dsh-cm-line' }, status ? t('folders.empty') : t('loading')),

        h('div', { className: 'dshu-group' }, t('group.limits')),
        h(
          'div',
          { className: 'dsh-cm-row' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, t('limit.files')), h('div', { className: 'dshu-rowdesc' }, t('limit.files.hint'))),
          h(NumberField, { value: maxFiles, min: 100, max: 50000, label: t('limit.files'), onCommit: (next) => save('maxFiles', next) }),
        ),
        h(
          'div',
          { className: 'dsh-cm-row' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, t('limit.kb')), h('div', { className: 'dshu-rowdesc' }, t('limit.kb.hint'))),
          h(NumberField, { value: maxKb, min: 16, max: 4096, label: t('limit.kb'), onCommit: (next) => save('maxFileKb', next) }),
        ),
        h(
          'div',
          { className: 'dsh-cm-row', 'data-stack': 'true' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, t('limit.ignore')), h('div', { className: 'dshu-rowdesc' }, t('limit.ignore.hint'))),
          h('textarea', {
            className: 'dsh-cm-field',
            rows: 3,
            maxLength: 4000,
            spellCheck: false,
            value: ignore,
            'aria-label': t('limit.ignore'),
            onChange: (event) => setIgnore(event.target.value),
            onBlur: () => {
              if (ignore !== (typeof value.extraIgnore === 'string' ? value.extraIgnore : '')) save('extraIgnore', ignore);
            },
          }),
        ),

        h('div', { className: 'dshu-group' }, t('group.skills')),
        h('p', { className: 'dshu-desc', style: { marginTop: 0 } }, t('skills.hint')),
        h(
          'ul',
          { className: 'dsh-cm-list' },
          ['reverse-codebase', 'reverse-website', 'reverse-api-format', 'reverse-app-binary'].map((id) => h('li', { key: id }, h('b', null, `/${id}`), t(`skill.${id}`))),
        ),

        h('div', { className: 'dshu-group' }, t('group.how')),
        h('ul', { className: 'dsh-cm-list' }, ['how.1', 'how.2', 'how.3'].map((key) => h('li', { key }, t(key)))),

        h('div', { className: 'dsh-cm-status', role: 'status', 'aria-live': 'polite', 'data-error': String(note.error) }, note.text),
      );
    }

    // ---- where the skills are offered (Modes' per-tab "skills off" list, `modes.skillsOff`) ----------------
    /** The eight guides of Code map (reverse-*) and Code power (pr-review, ci-fix-loop, best-of-n, hunk-review). */
    const SKILL_NAMES = ['reverse-codebase', 'reverse-website', 'reverse-api-format', 'reverse-app-binary', 'pr-review', 'ci-fix-loop', 'best-of-n', 'hunk-review'];
    const PLACES = [['chat', 'Chat'], ['cowork', 'Cowork'], ['code', 'Code']];
    const readTable = (value) => {
      try {
        const parsed = JSON.parse(typeof value === 'string' ? value : '{}');
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      } catch {
        return {};
      }
    };
    /** Whether none of the guides is switched off in a tab. */
    const offeredIn = (table, tab) => !(Array.isArray(table[tab]) ? table[tab] : []).some((name) => SKILL_NAMES.includes(name));
    /** Whether one guide is switched on in a tab. */
    const guideOffered = (table, tab, name) => !(Array.isArray(table[tab]) ? table[tab] : []).includes(name);
    /** The table with some guides (all eight unless `only` names them) switched on or off in one tab; other skills in the list are left as they are. */
    function withPlace(table, tab, offered, only = SKILL_NAMES) {
      const current = Array.isArray(table[tab]) ? table[tab].filter((name) => typeof name === 'string') : [];
      const rest = current.filter((name) => !only.includes(name));
      const next = offered ? rest : [...new Set([...rest, ...only])].sort();
      const out = { ...table };
      if (next.length > 0) out[tab] = next;
      else delete out[tab];
      return out;
    }
    async function loadModes(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === 'modes');
      return view ? { table: readTable(view.value?.skillsOff), revision: view.revision } : null;
    }
    /**
     * Change the list from what the app holds right now, never from the copy this page loaded earlier (Modes may have changed it
     * meanwhile, for example a skill switched off in a tab). On a conflict the change is worked out again from the fresh list.
     * @param {object} ctx - the page's app context.
     * @param {(table: object) => object} change - gives the new list from the current one.
     * @returns {Promise<{table: object, revision: unknown}>} the list as saved.
     */
    async function changeModes(ctx, change) {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const fresh = await loadModes(ctx);
        if (!fresh) throw new Error('The Modes add-on is not installed.');
        const result = await ctx.remote.settings.mutate('modes', [{ op: 'set', path: ['skillsOff'], value: JSON.stringify(change(fresh.table)) }], fresh.revision);
        if (result.ok) return { table: readTable(result.value?.value?.skillsOff), revision: result.value?.revision };
        if (result.error?.code !== 'settings/conflict') throw dshKit.fail(result.error);
      }
      throw new Error('The list kept changing under this page. Try again.');
    }
    const GUIDE_TEXT = {
      'reverse-codebase': 'Reverse-engineer a code base',
      'reverse-website': 'Reverse-engineer a website',
      'reverse-api-format': 'Reverse-engineer an API or file format',
      'reverse-app-binary': 'Reverse-engineer an installed app',
      'pr-review': 'Review a pull request',
      'ci-fix-loop': 'Fix a failing check',
      'best-of-n': 'Try several answers and keep the best',
      'hunk-review': 'Review changes piece by piece',
    };

    /** "Where these guides are offered": one switch each for Chat, Cowork and Code, and each guide on its own below. */
    function SkillPlaces({ appCtx }) {
      const [state, setState] = useState({ table: undefined, missing: false });
      const [note, setNote] = useState('');
      useEffect(() => {
        let alive = true;
        loadModes(appCtx).then((loaded) => { if (alive) setState(loaded ? { table: loaded.table, missing: false } : { table: undefined, missing: true }); }).catch((error) => { if (alive) setNote((error instanceof Error ? error.message : String(error))); });
        return () => { alive = false; };
      }, []);
      if (state.missing) return h('p', { className: 'dshu-desc' }, 'The Modes add-on is not installed, so every mode is offered these guides.');
      if (!state.table) return h('p', { className: 'dshu-desc' }, note || 'Loading…');
      const flip = async (tab, on, only) => {
        setNote('');
        try {
          const saved = await changeModes(appCtx, (table) => withPlace(table, tab, on, only));
          setState({ table: saved.table, missing: false });
        } catch (error) {
          setNote((error instanceof Error ? error.message : String(error)));
        }
      };
      return h(
        React.Fragment,
        null,
        h('div', { className: 'dshu-group' }, 'Where these guides are offered'),
        h('p', { className: 'dshu-desc', style: { marginTop: 0 } }, 'The reverse-engineer guides and the review and fix guides. A new install offers them only in Code mode. The first three switches turn all eight guides on or off in a mode; the list below switches each guide on its own. Guides you type yourself with / always work.'),
        PLACES.map(([tab, label]) =>
          h('div', { className: 'dsh-cm-row', key: tab },
            h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, `Offer all of them in ${label}`)),
            h(Switch, { checked: offeredIn(state.table, tab), label: `Offer all guides in ${label}`, onChange: (on) => flip(tab, on) })),
        ),
        SKILL_NAMES.map((name) =>
          h('div', { className: 'dsh-cm-row', key: name },
            h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, GUIDE_TEXT[name]), h('div', { className: 'dshu-rowdesc' }, `/${name}`)),
            PLACES.map(([tab, label]) =>
              h('label', { key: tab, style: { display: 'flex', alignItems: 'center', gap: 6 } }, h('span', { className: 'dshu-rowdesc' }, label),
                h(Switch, { checked: guideOffered(state.table, tab, name), label: `Offer ${name} in ${label}`, onChange: (on) => flip(tab, on, [name]) })))),
        ),
        note ? h('div', { className: 'dsh-cm-status', role: 'status', 'data-error': 'true' }, note) : null,
      );
    }

    /** The one "Code tools" page: Code map, and a tab for each partner part (Code power) that is installed. */
    function CodeToolsPage(props) {
      const t = props.appCtx.locale.bind('codeMap');
      const [tab, setTab] = dshMerge.useTab(React, 'code-map');
      const parts = dshMerge.parts('code-map');
      const current = parts.find((part) => part.id === tab);
      return h(
        'div',
        { className: 'dshu-page' },
        h('style', { dangerouslySetInnerHTML: { __html: CSS } }),
        h('h2', { className: 'dshu-title' }, t('head.title')),
        h('p', { className: 'dshu-desc' }, t('head.hint')),
        parts.length > 0
          ? h(
              'div',
              { className: 'dsh-cm-tabs', role: 'tablist', 'aria-label': t('tabs.label') },
              [{ id: 'main', label: () => t('tab.map') }, ...parts].map((one) =>
                h('button', { key: one.id, type: 'button', role: 'tab', className: 'dsh-cm-tab', 'aria-selected': tab === one.id, onClick: () => setTab(one.id) }, one.label()),
              ),
            )
          : null,
        current ? current.render(props) : h(CodeMapPage, props),
        h(SkillPlaces, { appCtx: props.appCtx }),
      );
    }

    return {
      skillPlaces: { SKILL_NAMES, offeredIn, withPlace, guideOffered, changeModes },
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('codeMap', DICT));
        const t = ctx.locale.bind('codeMap');
        // Tells Code power (and any other partner) that this page shows its settings as a tab.
        ctx.effect(() => dshMerge.host('code-map'));
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'code-map', order: 530, label: () => t('section.title') },
              (props) => h(CodeToolsPage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
