/**
 * Split Plus, browser half (step 1): the Split page. Two to four conversations side by side in one
 * window. Each pane is the app's own conversation view (the same piece the app uses to show a helper's
 * chat in its sidebar), bound to its own conversation, so each keeps its own mode, chat-box controls and
 * permission mode. A new pane opens in the same folder as the pane it is split from; a Recon pane opens
 * in Recon's own room. The tiling is only this page; the rules are in the server half and lib/panes.js.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-split-plus',
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
    const ui = dshUi.makeParts(React);
    const PlainNote = dshKit.makeNote(React);
    const { ask: askInPage } = dshKit;

    const NS = 'split-plus';
    const DICT = { en: { 'section.title': 'Split Plus', 'page.title': 'Split' } };
    const STORE_KEY = 'dsh-split-plus.panes.v1';
    const MAX_PANES = 4;

    const CSS = `
.dsh-sp-page { position: relative; display: flex; flex-direction: column; height: 100%; min-height: 0; color: var(--dsw-alias-label-primary); font-size: 13px; }
.dsh-sp-bar { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); flex: none; }
.dsh-sp-bar .title { font-size: 14px; font-weight: 600; margin-right: 4px; }
.dsh-sp-bar .hint { color: var(--dsw-alias-label-secondary); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sp-grid { flex: 1; min-height: 0; display: grid; gap: 6px; padding: 6px; }
.dsh-sp-pane { display: flex; flex-direction: column; min-width: 0; min-height: 0; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; overflow: hidden; background: var(--dsw-alias-bg-base); container-type: inline-size; }
.dsh-sp-pane[data-focused="true"] { border-color: var(--dsw-alias-brand-primary); }
.dsh-sp-head { display: flex; align-items: center; gap: 6px; height: 32px; padding: 0 6px 0 8px; border-bottom: 0.5px solid var(--dsw-alias-border-l1); flex: none; min-width: 0; }
.dsh-sp-abbr { flex: none; min-width: 22px; height: 20px; padding: 0 5px; box-sizing: border-box; border-radius: 6px; font-size: 11px; line-height: 20px; font-weight: 600; text-align: center; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); }
.dsh-sp-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.dsh-sp-folder { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.dsh-sp-state { flex: none; font-size: 11px; line-height: 18px; padding: 0 6px; border-radius: 9px; color: var(--dsw-alias-label-secondary); border: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-sp-state[data-state="working"] { color: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
.dsh-sp-state[data-state="blocked"] { color: var(--dsw-alias-label-primary); border-style: dashed; max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sp-state[data-state="queued"] { color: var(--dsw-alias-label-primary); border-style: dashed; }
.dsh-sp-state[data-ask="true"]::before { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: currentColor; vertical-align: 1px; }
.dsh-sp-state[data-state="waiting"] { color: var(--dsw-alias-state-warning-primary, #b26b00); border-color: currentColor; }
.dsh-sp-grow { flex: 1; }
.dsh-sp-icon { flex: none; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; padding: 0; }
.dsh-sp-icon:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-sp-body { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dsh-sp-body > * { flex: 1; min-height: 0; }
@container (max-width: 300px) { .dsh-sp-name, .dsh-sp-folder { display: none; } }
@container (max-width: 200px) { .dsh-sp-state { display: none; } }
.dsh-sp-btn { height: 28px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 9px; cursor: pointer; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-sp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-sp-btn:disabled { opacity: .5; cursor: default; }
.dsh-sp-btn[data-main="true"] { color: var(--dsw-alias-bg-base); background: var(--dsw-alias-brand-primary); border-color: transparent; }
.dsh-sp-pop { position: absolute; z-index: 50; top: 44px; left: 12px; width: 360px; max-width: calc(100% - 24px); box-sizing: border-box; padding: 14px 16px; border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); box-shadow: 0 8px 28px rgba(0,0,0,.18); display: flex; flex-direction: column; gap: 10px; }
.dsh-sp-pop label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-sp-pop select, .dsh-sp-pop input, .dsh-sp-input { height: 30px; padding: 0 8px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-sp-row { display: flex; gap: 8px; justify-content: flex-end; }
.dsh-sp-note { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-sp-note[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-sp-empty { margin: auto; max-width: 460px; padding: 24px; text-align: center; display: flex; flex-direction: column; gap: 12px; align-items: center; }
.dsh-sp-empty h2 { margin: 0; font-size: 18px; }
.dsh-sp-send { gap: 8px; }
.dsh-sp-choice { display: flex !important; flex-direction: row !important; align-items: center; gap: 6px; font-size: 13px !important; color: var(--dsw-alias-label-primary) !important; }
.dsh-sp-choice select { flex: 1; min-width: 0; }
.dsh-sp-tray { display: flex; flex-direction: column; gap: 6px; margin: 0 0 6px; }
.dsh-sp-card { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 6%, var(--dsw-alias-bg-base)); }
.dsh-sp-cardhead { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; }
.dsh-sp-cardname { min-width: 0; font-size: 12px; line-height: 16px; color: var(--dsw-alias-label-primary); overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.dsh-sp-cardrow { flex-wrap: wrap; justify-content: flex-end; }
.dsh-sp-preview { font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.dsh-sp-float { position: fixed; z-index: 60; display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 10px; border-radius: 13px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18); }
.dsh-sp-files { display: flex; flex-direction: column; max-height: 200px; overflow-y: auto; }
.dsh-sp-fileitem { text-align: left; border: 0; background: transparent; padding: 4px 6px; border-radius: 6px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary); cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-sp-fileitem span { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.dsh-sp-fileitem:hover { background: var(--dsw-alias-interactive-bg-hover); }
`;

    /** Talk to the server half. */
    async function call(body, query = '') {
      const url = new URL(`dsh-split-plus/data${query}`, document.baseURI);
      // Item 4A, stage 6b: the page's language, so space names come in it.
      if (!body) url.searchParams.set('lang', pageLang());
      const response = await fetch(url, {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }

    /** Save one of Split Plus's settings, once more after a clash with another save. */
    async function saveSetting(appCtx, path, value) {
      const settings = appCtx.remote.settings;
      const rowOf = async () => {
        const result = await settings.describe();
        return result.ok ? result.value.namespaces.find((entry) => entry.ns === NS) : undefined;
      };
      const row = await rowOf();
      if (!row) throw new Error('Split Plus is not running.');
      let done = await settings.mutate(NS, [{ op: 'set', path: [path], value }], row.revision);
      if (!done.ok && done.error.code === 'settings/conflict') done = await settings.mutate(NS, [{ op: 'set', path: [path], value }], (await rowOf())?.revision);
      if (!done.ok) throw new Error(done.error?.message ?? 'not saved');
    }

    /**
     * The panes of the Split page, owned by this plugin (so they stay while you look at another page)
     * and kept in this window's storage (so a reload brings them back).
     */
    function openPaneStore() {
      const listeners = new Set();
      let state = { panes: [], focus: '' };
      try {
        const saved = JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) ?? 'null');
        if (saved && Array.isArray(saved.panes)) {
          state = {
            panes: saved.panes.filter((pane) => pane && typeof pane.id === 'string' && typeof pane.sessionId === 'string').slice(0, MAX_PANES).map((pane) => ({ id: pane.id, sessionId: pane.sessionId })),
            focus: typeof saved.focus === 'string' ? saved.focus : '',
          };
        }
      } catch { /* a damaged saved list starts empty */ }
      const set = (next) => {
        state = next;
        try { globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* storage full or off: the panes stay for this window */ }
        for (const listener of listeners) listener();
      };
      return {
        subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
        get: () => state,
        add(sessionId) {
          if (state.panes.some((pane) => pane.sessionId === sessionId)) { set({ ...state, focus: state.panes.find((pane) => pane.sessionId === sessionId).id }); return; }
          if (state.panes.length >= MAX_PANES) throw new Error(`A Split page holds at most ${MAX_PANES} panes.`);
          const id = `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
          set({ panes: [...state.panes, { id, sessionId }], focus: id });
        },
        remove(id) {
          const panes = state.panes.filter((pane) => pane.id !== id);
          set({ panes, focus: state.focus === id ? (panes[0]?.id ?? '') : state.focus });
        },
        focus(id) { if (state.focus !== id) set({ ...state, focus: id }); },
        /** Put these conversations in the panes, in this order (a pane set coming back). */
        replace(sessionIds) {
          const panes = [...new Set(sessionIds)].slice(0, MAX_PANES).map((sessionId, index) => ({ id: `p${Date.now().toString(36)}${index}`, sessionId }));
          set({ panes, focus: panes[0]?.id ?? '' });
        },
        replaceSession(oldId, newId) {
          set({ ...state, panes: state.panes.map((pane) => (pane.sessionId === oldId ? { ...pane, sessionId: newId } : pane)) });
        },
      };
    }

    /** A snapshot source as a React value. */
    function useSource(source, fallback) {
      const subscribe = useCallback((listener) => (source?.subscribe ? source.subscribe(listener) : () => {}), [source]);
      const read = useCallback(() => (source?.getSnapshot ? source.getSnapshot() : fallback), [source, fallback]);
      return useSyncExternalStore(subscribe, read);
    }

    const EMPTY_LIST = { ids: [], byId: {} };
    const EMPTY_STATUS = new Map();

    function Icon({ d, size = 14 }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d }));
    }
    const ICON_SPLIT = 'M4 5h16v14H4zM12 5v14';
    const ICON_CLOSE = 'M6 6l12 12M18 6L6 18';
    const ICON_OPEN = 'M14 4h6v6M20 4l-8 8M18 14v5H5V6h5';
    const ICON_WATCH = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM12 9.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 0 0 0-5z';
    const ICON_UNWATCH = 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12zM4 4l16 16';

    /** The conversation itself, inside its pane: the app's own view, as the app shows a helper's chat. */
    function FixedChat(props) {
      return props.renderSlot('conversation.session', { view: 'chat' });
    }
    function PaneConversation({ sessionId, useSession, useConversation, useSessions, renderFactorySlot }) {
      const session = useSession((value) => value);
      const conversation = useConversation((value) => value);
      const active = conversation.activeTargets.size > 0 || (!session.blank && !session.awaitingFirstTurn) || session.running;
      const shellPhase = active ? 'active' : session.promptAttempted ? 'engaging' : 'blank';
      const summaryBlank = useSessions((state) => state.byId[sessionId]?.blank);
      const settling = shellPhase === 'blank' && session.openState === 'loading' && summaryBlank !== true;
      const hero = shellPhase === 'blank' && (session.openState === 'open' || summaryBlank === true);
      const phase = settling ? 'settling' : hero ? 'hero' : 'active';
      return renderFactorySlot('conversation.content', { variant: 'embedded', phase, hero }, { slots: { views: FixedChat } });
    }

    /** One pane: its title (mode, folder, state) and its live conversation. */
    function Pane({ appCtx, store, pane, facts, summary, status, localWait, fileWait, focused, onFocus, onClose, SessionProvider, renderSlot }) {
      const [reference, setReference] = useState(null);
      const [error, setError] = useState('');
      useEffect(() => {
        const sessions = appCtx.get('sessions');
        if (!sessions?.retain) { setError('This version of the app cannot show a thread here.'); return undefined; }
        const controller = new AbortController();
        let held;
        try {
          held = sessions.retain(pane.sessionId, { source: 'splitPlus', signal: controller.signal });
          setReference(held);
          held.ready?.catch?.((problem) => setError(`This thread could not be opened: ${problem?.message ?? problem}`));
        } catch (problem) {
          setError(`This thread could not be opened: ${problem?.message ?? problem}`);
        }
        return () => { controller.abort(); try { held?.release(); } catch { /* already released */ } setReference(null); };
      }, [appCtx, pane.sessionId]);
      // The AI asking for a tool (Tool access): its card sits inside this pane; the header shows a dot and says so.
      const [, bumpAsk] = useState(0);
      useEffect(() => window.__dshToolCard?.subscribe?.(() => bumpAsk((n) => n + 1)), []);
      const toolAsk = window.__dshToolCard?.waiting?.(pane.sessionId) === true;
      const state = status?.pendingInteraction || toolAsk ? 'waiting' : fileWait ? 'blocked' : localWait ? 'queued' : (status?.running ?? summary?.running) ? 'working' : summary?.blank ? 'new' : 'done';
      const stateText = { waiting: 'Waiting for you', blocked: fileWait ? (fileWait.kind === 'command' ? `Waiting: the ${fileWait.holder} pane is running a command in ${fileWait.file}` : `Waiting: the ${fileWait.holder} pane is changing ${fileWait.file}`) : '', queued: 'Waiting for the local model', working: 'Working', new: 'New', done: 'Done' }[state];
      const label = facts?.label ?? '…';
      // Item 4A, stage 6b (J19): "{mode} · {space}" when the pane's space is not the window's (a pane brought back from another).
      const chip = paneChip(facts, windowSpace());
      const title = `${chip}${facts?.folder ? ` · ${facts.folder}` : ''} · ${stateText}${summary?.displayTitle ? `\n${summary.displayTitle}` : ''}${summary?.cwd ? `\n${summary.cwd}` : ''}`;
      return h('section', { className: 'dsh-sp-pane', 'data-focused': focused ? 'true' : 'false', 'data-split-pane': pane.id, onMouseDownCapture: onFocus, onFocusCapture: onFocus },
        h('div', { className: 'dsh-sp-head', title },
          h('span', { className: 'dsh-sp-abbr', 'aria-label': chip }, facts?.abbr ?? '…'),
          h('span', { className: 'dsh-sp-name' }, summary?.displayTitle || label),
          chip !== label ? h('span', { className: 'dsh-sp-folder', 'data-pane-space': facts?.space ?? '' }, `· ${chip}`) : null,
          facts?.folder ? h('span', { className: 'dsh-sp-folder' }, `· ${facts.folder}`) : null,
          h('span', { className: 'dsh-sp-grow' }),
          h('span', { className: 'dsh-sp-state', 'data-state': state, 'data-ask': toolAsk ? 'true' : undefined, title: toolAsk ? 'The AI asks to use a tool. Answer on the card in this pane.' : undefined }, stateText),
          facts?.watching ? h('span', { className: 'dsh-sp-folder', title: 'This pane only reads the other pane and answers you; it cannot change, message or stop it' }, `· watching ${facts.watchingLabel}`) : null,
          facts?.watching ? h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Stop watching (the thread stays)', 'aria-label': 'Stop watching', onClick: () => void call({ action: 'unwatch', watcher: pane.sessionId }).catch(() => {}) }, h(Icon, { d: ICON_UNWATCH })) : null,
          !facts?.watching && facts && !facts.sealed ? h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Watch this pane from a Chat pane beside it: ask what it is doing, without touching it', 'aria-label': 'Watch this pane', onClick: () => void startWatcher(appCtx, store, pane.sessionId).catch((error) => askInPage({ notice: true, title: 'Split Plus', text: error.message })) }, h(Icon, { d: ICON_WATCH })) : null,
          h(FileSend, { appCtx, store, sessionId: pane.sessionId }),
          h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Open this thread on its own (it stays in the Split page too)', 'aria-label': 'Open on its own', onClick: () => appCtx.get('uiWorkspace')?.openSession?.(pane.sessionId) }, h(Icon, { d: ICON_OPEN })),
          h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Take this pane out of the Split page (the thread is kept)', 'aria-label': 'Close pane', onClick: onClose }, h(Icon, { d: ICON_CLOSE }))),
        h('div', { className: 'dsh-sp-body' },
          error ? h('p', { className: 'dsh-sp-note', 'data-error': 'true', style: { padding: 12 } }, error)
            : reference ? h(SessionProvider, { session: reference }, renderSlot('splitplus.pane', {})) : null));
    }

    /** The folders the app knows from its conversations (no folder picker: you choose from these or type one). */
    function knownFolders(list) {
      const seen = new Map();
      for (const id of list.ids ?? []) {
        const row = list.byId?.[id];
        if (!row?.cwd || row.parentId || row.origin === 'subagent') continue;
        if (/\/scratch\/[^/]+\/?$/.test(row.cwd) || /dsh-recon/.test(row.cwd)) continue;
        if (!seen.has(row.cwd)) seen.set(row.cwd, row.updatedAt ?? 0);
      }
      return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([cwd]) => cwd).slice(0, 30);
    }

    /** A folder of the owner's (not Scratch, not Recon's room): the folders pane sets are kept for. */
    function realFolder(cwd) {
      const path = String(cwd ?? '');
      if (!path.startsWith('/') || /\/scratch(\/|$)/.test(path) || /\/dsh-recon[^/]*(\/|$)/.test(path)) return '';
      return path;
    }

    /** Pane sets: save these panes under a name, open a named set here, remove one. */
    function PaneSets({ appCtx, store, data, list, from, onClose }) {
      const state = useSyncExternalStore(store.subscribe, store.get);
      const [named, setNamed] = useState(null);
      const [name, setName] = useState('');
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const read = useCallback(() => call(null, '?sets=1').then((value) => setNamed(value.named ?? []), (error) => setNote(error.message)), []);
      useEffect(() => { void read(); }, [read]);
      useEffect(() => {
        const labels = state.panes.map((pane) => data?.panes?.[pane.sessionId]?.label).filter(Boolean);
        if (!name) setName(labels.join(', '));
      }, [state.panes, data]);
      const run = async (work) => {
        setBusy(true);
        setNote('');
        try { await work(); } catch (error) { setNote(error.message); } finally { setBusy(false); }
      };
      const open = (set) => run(async () => {
        // New conversations of these tabs, in the selected pane's folder (a sealed tab only in its room).
        // Item 4A, stage 6b (Revision 2 G9): each pane in the space it was saved in; an older set's panes in this window's
        // space when it offers the mode, else in Chat when Chat does, else in the mode's own space as before 6b. Where each
        // one goes is shown before anything opens.
        const plan = restorePlan(set.panes, windowSpace(), data.spaces);
        if (data.spaces) {
          const where = plan.map((one) => {
            const label = data.modes?.find((row) => row.id === one.mode)?.label ?? one.mode;
            const space = one.space || one.shown || '';
            return space ? `${label} · ${data.spaceNames?.[space] || space}` : label;
          }).join(', ');
          const yes = await askInPage({ title: words6b('restoreTitle', {}, pageLang()), text: words6b('restoreWhere', { list: where }, pageLang()), ok: words6b('restoreOk', {}, pageLang()) });
          if (!yes) return;
        }
        const ids = [];
        for (const one of plan) ids.push(await startConversation(appCtx, data, { mode: one.mode, choice: from?.cwd ? 'same' : 'scratch', from, ...(one.space ? { space: one.space } : {}) }));
        store.replace(ids);
        onClose();
      });
      return h('div', { className: 'dsh-sp-pop', role: 'dialog', 'aria-label': 'Pane sets' },
        h('strong', null, 'Pane sets'),
        h('p', { className: 'dsh-sp-note' }, 'A pane set keeps modes and their order (never a permission or a sign-in). Opening one starts new threads in those modes in the selected pane\'s folder. The panes open for a folder come back by themselves when you open that folder again.'),
        state.panes.length > 0 ? h('label', null, 'Save these panes as',
          h('div', { className: 'dsh-sp-row' },
            h('input', { className: 'dsh-sp-input', style: { flex: 1 }, value: name, onChange: (event) => setName(event.target.value) }),
            h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', disabled: busy || !name.trim(), onClick: () => void run(async () => { await call({ action: 'saveSet', name, sessionIds: state.panes.map((pane) => pane.sessionId) }); await read(); setNote('Saved.'); }) }, 'Save'))) : null,
        named === null ? h('p', { className: 'dsh-sp-note' }, 'Loading…')
          : named.length === 0 ? h('p', { className: 'dsh-sp-note' }, 'No pane set yet.')
            : h('div', { className: 'dsh-sp-files' }, named.map((set) => h('div', { key: set.name, className: 'dsh-sp-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
              h('span', { className: 'dsh-sp-cardname' }, `${set.name} (${set.panes.map((pane) => data?.modes?.find((row) => row.id === pane.mode)?.label ?? pane.mode).join(', ')})`),
              h('span', { className: 'dsh-sp-row' },
                h('button', { type: 'button', className: 'dsh-sp-btn', disabled: busy, onClick: () => void run(async () => { await call({ action: 'dropSet', name: set.name }); await read(); }) }, 'Remove'),
                h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', disabled: busy, onClick: () => void open(set) }, 'Open here'))))),
        note ? h('p', { className: 'dsh-sp-note' }, note) : null,
        h('div', { className: 'dsh-sp-row' }, h('button', { type: 'button', className: 'dsh-sp-btn', onClick: onClose }, 'Close')));
    }

    /** The same folder, ignoring a trailing slash and macOS's /private prefix for /tmp. */
    function sameFolder(a, b) {
      const plain = (path) => String(path ?? '').replace(/^\/private(?=\/(tmp|var)\/)/, '').replace(/\/+$/, '');
      return plain(a) !== '' && plain(a) === plain(b);
    }
    /** The project (the app's workspace) a conversation belongs to, if any. */
    function workspaceOf(appCtx, sessionId) {
      const items = appCtx.get('workspaces')?.list?.getSnapshot?.()?.items ?? [];
      return items.find((item) => (item.sessionIds ?? []).includes(sessionId));
    }
    /** The project of a folder: the one the app has, or a new one (named, for a scratch place or a room). */
    async function projectFor(appCtx, path, title = '') {
      const workspaces = appCtx.get('workspaces');
      if (!workspaces?.create) throw new Error('This version of the app cannot add a project from here.');
      const found = (workspaces.list?.getSnapshot?.()?.items ?? []).find((item) => sameFolder(item.path, path));
      if (found?.workspaceId) return found.workspaceId;
      const made = await workspaces.create({ path });
      if (title) {
        try { await workspaces.rename(made.workspaceId, title); } catch { /* the folder's own name is fine */ }
      }
      return made.workspaceId;
    }

    /**
     * Start a new conversation in a tab and a place: the same folder as `from`, a scratch thread, or another
     * folder; a sealed tab (Recon) only in its own room. Made in its folder's project, then given its tab.
     * Item 4A, stage 6a: `space` is the window's space (Add pane only; a watcher claims Chat). In a Recon window any mode
     * is sealed, so the pane opens in Recon's room; the claim carries the space so its rules hold for any mode.
     * @returns {Promise<string>} the new conversation.
     */
    async function startConversation(appCtx, data, { mode, choice, folder = '', from = null, space = '' }) {
      const sealed = space === 'recon' || data.modes?.find((row) => row.id === mode)?.sealed === true;
      const sessions = appCtx.get('sessions');
      if (!sessions?.create) throw new Error('This version of the app cannot start a thread from here.');
      // Every sealed tab's room (Recon's): its own pane opens there, and no other pane ever does.
      const rooms = {};
      const roomTabs = (data.modes ?? []).filter((one) => one.sealed).map((one) => one.id);
      if (space === 'recon' && !roomTabs.includes('recon')) roomTabs.push('recon');
      for (const id of roomTabs) {
        try {
          const response = await fetch(new URL(`dsh-${id}/state`, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
          const place = response.ok ? String((await response.json()).room ?? '') : '';
          if (place) rooms[id] = place;
        } catch { /* that tab is off: it has no room to keep others out of */ }
      }
      // In a Recon window the room is Recon's, whatever the mode.
      const room = !sealed ? '' : space === 'recon' ? (rooms.recon ?? '') : (rooms[mode] ?? '');
      const placed = (await call({ action: 'place', mode, choice, folder, fromCwd: from?.cwd ?? '', fromSessionId: from?.sessionId ?? '', room, rooms: Object.values(rooms), ...(space ? { space } : {}) })).place;
      if (placed.kind === 'refused') throw new Error(placed.why);
      let cwd = placed.cwd;
      let title = '';
      if (placed.kind === 'scratch') {
        const response = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
        const answer = response.ok ? await response.json() : {};
        cwd = String(answer.place ?? '');
        title = String(answer.title || 'Scratch');
        if (!cwd) throw new Error('Scratch is not available here (it needs the Left panel add-on). Pick a folder instead.');
      } else if (sealed) {
        title = space === 'recon' ? 'Recon room' : `${data.modes.find((row) => row.id === mode)?.label ?? mode} room`;
      }
      // The app lets you type in a new conversation once it belongs to a project, so it is made in the
      // project of its folder: the same project as the pane it is split from, or the folder's own.
      const sameProject = placed.kind === 'cwd' && choice === 'same' && !sealed && from?.sessionId ? workspaceOf(appCtx, from.sessionId) : undefined;
      const workspaceId = sameProject && sameFolder(sameProject.path, cwd) ? sameProject.workspaceId : await projectFor(appCtx, cwd, title);
      const child = await sessions.create({ workspaceId });
      await call({ action: 'claim', sessionId: child, mode, ...(space ? { space } : {}) });
      return child;
    }

    /**
     * A watcher for a pane: a new Chat conversation (in Scratch) that reads the watched pane's run and
     * answers about it; it starts on the Watcher model from Settings → Split Plus, which its own model
     * menu can change. A sealed pane (Recon) is never watched.
     */
    async function startWatcher(appCtx, store, watched) {
      const data = await call(null, `?sessions=${encodeURIComponent(watched)}`);
      if (data.panes?.[watched]?.sealed) throw new Error('A sealed thread (Recon) cannot be watched.');
      // Item 4A, stage 6a: a watcher is a Chat pane in any window, so it claims the Chat space (never Recon's or Devices'),
      // in the Chat mode when the Chat space offers it, else in that space's start mode (watcherClaim).
      const claim = watcherClaim(data);
      const child = await startConversation(appCtx, data, { mode: claim.mode, choice: 'scratch', space: claim.space });
      await call({ action: 'watch', watcher: child, watched });
      const chosen = String(data.watcherModel ?? '').trim();
      if (chosen.includes('/')) {
        const at = chosen.indexOf('/');
        const remote = appCtx.get('remote.session');
        try {
          const done = await remote?.selectModel?.({ sessionId: child, provider: chosen.slice(0, at), model: chosen.slice(at + 1) });
          if (done && done.ok === false) throw new Error(done.error?.message ?? 'not chosen');
        } catch (error) {
          // The watcher still works on the app's usual model; the pane's model menu can change it.
          console.warn(`split-plus: the watcher model ${chosen} was not chosen (${error?.message ?? error})`);
        }
      }
      try { store.add(child); } catch { appCtx.get('uiWorkspace')?.openSession?.(child); }
      return child;
    }

    /**
     * Item 4A, final fix round: the modes a new pane may take. With spaces on, the window's space's (the Cowork sidebar
     * marks it on the page as data-cws-space), its start mode first; else every mode, as before.
     */
    const offeredModes = (data) => {
      const all = data?.modes ?? [];
      const space = document.documentElement.getAttribute('data-cws-space') || '';
      const here = data?.spaces?.[space];
      // `fromSpace`: the list is the space's own offered rows (item 4A, stage 6a: only then does the claim carry the space).
      if (!here || !Array.isArray(here.modes)) return { rows: all, start: all[0]?.id ?? 'chat', fromSpace: false };
      const rows = all.filter((row) => here.modes.includes(row.id));
      const ordered = [...rows.filter((row) => row.id === here.start), ...rows.filter((row) => row.id !== here.start)];
      return ordered.length > 0 ? { rows: ordered, start: ordered[0].id, fromSpace: true } : { rows: all, start: all[0]?.id ?? 'chat', fromSpace: false };
    };
    // ---- split-plus:claim-helpers:begin ---- dependency-free (test/space-claim.test.mjs runs them).
    /**
     * Item 4A, stage 6a: what a watcher claims. Always the Chat space; the Chat mode when the Chat space offers it (not
     * greyed), else the space's start mode, else its first offered mode. Without spaces data: the Chat mode, as before.
     */
    function watcherClaim(data) {
      const here = data && data.spaces ? data.spaces.chat : undefined;
      const offered = here && Array.isArray(here.modes) ? here.modes.map(String) : null;
      if (!offered || offered.length === 0 || offered.includes('chat')) return { mode: 'chat', space: 'chat' };
      const start = String(here.start || '');
      return { mode: offered.includes(start) ? start : offered[0], space: 'chat' };
    }
    /**
     * Item 4A, stage 6a: the space an Add pane claim carries. The window's space when the mode list came from that
     * space's offered rows; when the list fell back to every mode, only a guarded space (Recon, Devices, Workshop) is
     * still sent (Modes then refuses a mode it does not offer there, which keeps its rules); else none.
     */
    function claimSpace(offered, space) {
      const name = String(space || '');
      if (!name) return '';
      if (offered && offered.fromSpace === true) return name;
      return ['recon', 'devices', 'workshop'].includes(name) ? name : '';
    }
    /**
     * Lab fix (6a): the note an Add pane shows instead of the folder choices when the pane can only open in Recon's room:
     * a Recon window (any mode in Recon is sealed, and Recon's panes open in its room whatever was picked) or a sealed
     * mode. '' when the folder can be chosen. English only (decision 28): `lang` is accepted and ignored.
     */
    function roomOnlyNote(sealed, space, lang) { // eslint-disable-line no-unused-vars
      if (String(space || '') === 'recon') return 'In Recon, a new pane always opens in its own room folder, so no folder can be picked here.';
      if (sealed === true) return 'A sealed mode works only in its own room, never in a shared folder.';
      return '';
    }

    // Item 4A, stage 6b, Part C (STAGE6B-DESIGN.md J19, 7.3, Revision 2 G9): Split follows the window's space.
    /** The page's words for stage 6b (English only, decision 28). */
    const SPLIT_6B_WORDS = {
      en: {
        thisSpace: 'This space ({space})',
        unsorted: 'Some threads are not listed because their space could not be read. Close this and open it again.',
        sendNewRecon: 'In a Recon window, Send to cannot start a new thread. Start one with Recon\'s New button, or use Send to from a window of another space.',
        continueSealed: 'This pane is sealed (Recon), so its text cannot start a thread outside it. Copy what you need inside Recon, or start the Research thread from a Recon window.',
        continueInChat: 'Research is not offered in {space}, so the thread beside starts in Chat.',
        continueReconWindow: 'In a Recon window, the thread beside starts in Chat: nothing goes into Recon this way.',
        restoreWhere: 'These panes open in: {list}.',
        restoreTitle: 'Open this pane set here?',
        restoreOk: 'Open here',
      },
    };
    /** One of those sentences, with `{name}` filled in. `lang` is accepted and ignored: Plus is English only. */
    function words6b(key, vars, lang) { // eslint-disable-line no-unused-vars
      let text = SPLIT_6B_WORDS.en[key] || '';
      for (const name of Object.keys(vars || {})) text = text.split(`{${name}}`).join(String(vars[name]));
      return text;
    }
    /** The spaces in the order headings come after the window's own (Recon last: it is listed only in a Recon window). */
    const PICK_ORDER = ['chat', 'code', 'devices', 'workshop', 'recon'];
    /**
     * The "thread I already have" pickers (J19): the window's space first, then other spaces under their names. Recon
     * threads (and any sealed thread) only in a Recon window, where they come first. A row whose space the server could
     * not give is left out (`left` counts them; the page says so). Without Modes' spaces (`live: false`): today's list
     * without sealed rows. `answer` null: not known yet (nothing listed).
     * @param {{id: string}[]} rows - the threads, newest first.
     * @param {{live?: boolean, spaces?: object, names?: object} | null} answer - the server's `spacesOf`.
     * @returns {{groups: {space: string, label: string, rows: object[]}[], left: number}}
     */
    function pickerGroups(rows, answer, windowSpace, lang, max) {
      const cap = Number(max) > 0 ? Number(max) : 40;
      if (!answer || typeof answer !== 'object') return { groups: [], left: 0 };
      const facts = answer.spaces && typeof answer.spaces === 'object' ? answer.spaces : {};
      const list = Array.isArray(rows) ? rows : [];
      let left = 0;
      if (answer.live !== true) {
        const kept = [];
        for (const row of list) {
          const one = facts[row.id];
          if (!one) { left += 1; continue; }
          if (one.sealed !== true && kept.length < cap) kept.push(row);
        }
        return { groups: kept.length > 0 ? [{ space: '', label: '', rows: kept }] : [], left };
      }
      const win = String(windowSpace || '');
      const inRecon = win === 'recon';
      const names = answer.names && typeof answer.names === 'object' ? answer.names : {};
      const buckets = {};
      let count = 0;
      for (const row of list) {
        const one = facts[row.id];
        const space = one && typeof one.space === 'string' ? one.space : '';
        if (!one || !space) { left += 1; continue; }
        if ((space === 'recon' || one.sealed === true) && !inRecon) continue;
        if (count >= cap) continue;
        (buckets[space] = buckets[space] || []).push(row);
        count += 1;
      }
      const order = [...(win ? [win] : []), ...PICK_ORDER.filter((id) => id !== win), ...Object.keys(buckets).filter((id) => id !== win && PICK_ORDER.indexOf(id) < 0)];
      const groups = [];
      for (const space of order) {
        if (!buckets[space]) continue;
        const name = String(names[space] || space);
        groups.push({ space, label: space === win ? words6b('thisSpace', { space: name }, lang) : name, rows: buckets[space] });
      }
      return { groups, left };
    }
    /**
     * Revision 2 G9: where each pane of a pane set opens. A pane saved with its space opens there (Modes refuses with its
     * sentence if that space cannot take it; it is never moved). An older pane (no space) opens in the window's space when
     * the mode is offered there, else in Chat when Chat offers it, else with no space, exactly as before 6b (Modes puts it
     * in its mode's own space; review finding: a Devices pane of an older set must still open). `shown`: the space named
     * in the confirm line for such a pane (the first that offers the mode, '' when none says). Without spaces data: no
     * space, as before.
     * @returns {{mode: string, space: string, shown?: string}[]}
     */
    function restorePlan(panes, windowSpace, spaces) {
      const win = String(windowSpace || '');
      const offers = (space, mode) => Boolean(space && spaces[space] && Array.isArray(spaces[space].modes) && spaces[space].modes.indexOf(mode) >= 0);
      return (Array.isArray(panes) ? panes : []).map((pane) => {
        const mode = String((pane && pane.mode) || '');
        if (!spaces || typeof spaces !== 'object') return { mode, space: '' };
        if (pane && typeof pane.space === 'string' && pane.space) return { mode, space: pane.space };
        if (offers(win, mode)) return { mode, space: win };
        if (offers('chat', mode)) return { mode, space: 'chat' };
        const shown = ['code', 'devices', 'workshop', 'recon'].find((space) => offers(space, mode)) || '';
        return { mode, space: '', shown };
      });
    }
    /**
     * J19: where "Start in Research beside" opens. The window's space when it offers Research; else Chat, with a line
     * (`note`: 'chat', or 'recon' in a Recon window: nothing goes into Recon this way). Without spaces data: as before.
     * @returns {{space: string, note: string}}
     */
    function continuePlace(spaces, windowSpace) {
      const win = String(windowSpace || '');
      if (!spaces || typeof spaces !== 'object' || !win) return { space: '', note: '' };
      if (win === 'recon') return { space: 'chat', note: 'recon' };
      const here = spaces[win];
      if (here && Array.isArray(here.modes) && here.modes.indexOf('research') >= 0) return { space: win, note: '' };
      return { space: 'chat', note: 'chat' };
    }
    /** J19: "Send to → A new chat in…" claims the window's space (as Add pane does); null in a Recon window (refused). */
    function sendNewSpace(offered, windowSpace) {
      if (String(windowSpace || '') === 'recon') return null;
      return claimSpace(offered, windowSpace);
    }
    /** J19: a pane's chip, "{mode} · {space}" only when its space differs from the window's. */
    function paneChip(facts, windowSpace) {
      const label = (facts && facts.label) || '…';
      const space = facts && typeof facts.space === 'string' ? facts.space : '';
      const win = String(windowSpace || '');
      return space && win && space !== win ? `${label} · ${(facts && facts.spaceName) || space}` : label;
    }
    // ---- split-plus:claim-helpers:end ----

    /**
     * Item 4A, stage 6b: the window's space (the left panel marks it on the page). The page's language is always 'en':
     * Plus is English only (decision 28), even when the app is set to Chinese; the server still accepts `lang`.
     */
    const windowSpace = () => document.documentElement.getAttribute('data-cws-space') || '';
    const pageLang = () => 'en';
    /**
     * Item 4A, stage 6b (J19): the server's answer for the threads a picker lists (their space, sealed when unsure).
     * null while it is asked; a failed ask lists nothing (each row left out, with the note).
     */
    function useSpacesOf(ids) {
      const key = ids.join(',');
      const [answer, setAnswer] = useState(null);
      useEffect(() => {
        let alive = true;
        setAnswer(null);
        if (ids.length === 0) { setAnswer({ live: false, spaces: {}, names: {} }); return undefined; }
        call({ action: 'spacesOf', ids, lang: pageLang() }).then((value) => { if (alive) setAnswer(value); }, () => { if (alive) setAnswer({ live: true, spaces: {}, names: {} }); });
        return () => { alive = false; };
      }, [key]);
      return answer;
    }
    /** The options of a grouped picker (headings as option groups). */
    function pickerOptions(grouped, label) {
      return grouped.groups.map((group) => (group.label
        ? h('optgroup', { key: group.space, label: group.label }, group.rows.map((row) => h('option', { key: row.id, value: row.id }, label(row))))
        : group.rows.map((row) => h('option', { key: row.id, value: row.id }, label(row)))));
    }

    /** The Add pane window: a new thread in a mode and a place, or a thread you already have. */
    function AddPane({ appCtx, data, list, panes, from, onDone, onCancel }) {
      const offered = useMemo(() => offeredModes(data), [data]);
      const [kind, setKind] = useState('new');
      const [mode, setMode] = useState(offered.start);
      const [choice, setChoice] = useState(from ? 'same' : 'scratch');
      const [folder, setFolder] = useState('');
      const [existing, setExisting] = useState('');
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState('');
      const folders = useMemo(() => knownFolders(list), [list]);
      const recent = useMemo(() => (list.ids ?? []).map((id) => list.byId[id]).filter((row) => row && !row.parentId && row.origin !== 'subagent' && !row.blank && !panes.some((pane) => pane.sessionId === row.id)).slice(0, 80), [list, panes]);
      // Item 4A, stage 6b (J19): this space's threads first, then others under their names; Recon only in a Recon window.
      const known = useSpacesOf(kind === 'existing' ? recent.map((row) => row.id) : []);
      const grouped = useMemo(() => pickerGroups(recent, known, windowSpace(), pageLang(), 40), [recent, known]);
      const listed = grouped.groups.reduce((sum, group) => sum + group.rows.length, 0);
      // Lab fix (6a): in a Recon window every mode opens in the room, so the folder choices are not offered there either.
      const roomNote = roomOnlyNote(data.modes?.find((row) => row.id === mode)?.sealed === true, document.documentElement.getAttribute('data-cws-space') || '', document.documentElement.getAttribute('lang') || '');
      const sealed = roomNote !== '';
      const go = async () => {
        setBusy(true);
        setError('');
        try {
          if (kind === 'existing') {
            if (!existing) throw new Error('Pick a thread.');
            // Only a thread the grouped list shows (the server gave its space, and Recon only in a Recon window).
            if (!grouped.groups.some((group) => group.rows.some((row) => row.id === existing))) throw new Error('Pick a thread from the list.');
            onDone(existing);
            return;
          }
          // Item 4A, stage 6a: the window's space goes with the claim (and a Recon window's pane opens in the room).
          const space = claimSpace(offered, document.documentElement.getAttribute('data-cws-space') || '');
          const child = await startConversation(appCtx, data, { mode, choice, folder, from, space });
          onDone(child);
        } catch (problem) {
          setError(problem?.message ?? String(problem));
        } finally {
          setBusy(false);
        }
      };
      return h('div', { className: 'dsh-sp-pop', role: 'dialog', 'aria-label': 'Add a pane' },
        h('label', null, 'What',
          h('select', { value: kind, onChange: (event) => setKind(event.target.value) },
            h('option', { value: 'new' }, 'A new thread'),
            h('option', { value: 'existing' }, 'A thread I already have'))),
        kind === 'existing'
          ? h(React.Fragment, null,
            h('label', null, 'Thread',
              h('select', { value: existing, onChange: (event) => setExisting(event.target.value) },
                h('option', { value: '' }, known === null ? 'Loading…' : listed ? 'Choose…' : 'None to choose from'),
                pickerOptions(grouped, (row) => row.displayTitle || row.id))),
            grouped.left > 0 ? h('p', { className: 'dsh-sp-note', 'data-unsorted': '' }, words6b('unsorted', {}, pageLang())) : null)
          : [
            h('label', { key: 'mode' }, 'Mode',
              h('select', { value: mode, onChange: (event) => setMode(event.target.value) }, offered.rows.map((row) => h('option', { key: row.id, value: row.id }, row.label)))),
            sealed
              ? h('p', { key: 'room', className: 'dsh-sp-note', 'data-room-only': '' }, roomNote)
              : h('label', { key: 'place' }, 'Folder',
                h('select', { value: choice, onChange: (event) => setChoice(event.target.value) },
                  from ? h('option', { value: 'same' }, `Same folder as the selected pane${from.cwd ? ` (${from.cwd.split('/').pop()})` : ''}`) : null,
                  h('option', { value: 'scratch' }, 'A scratch thread (its own new folder)'),
                  h('option', { value: 'folder' }, 'Another folder…'))),
            !sealed && choice === 'folder'
              ? h('label', { key: 'folder' }, 'Which folder',
                h('input', { list: 'dsh-sp-folders', value: folder, placeholder: '/Users/you/Projects/…', onChange: (event) => setFolder(event.target.value) }),
                h('datalist', { id: 'dsh-sp-folders' }, folders.map((path) => h('option', { key: path, value: path }))))
              : null,
          ],
        error ? h('p', { className: 'dsh-sp-note', 'data-error': 'true' }, error) : null,
        h('div', { className: 'dsh-sp-row' },
          h('button', { type: 'button', className: 'dsh-sp-btn', onClick: onCancel, disabled: busy }, 'Cancel'),
          h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', onClick: () => void go(), disabled: busy }, busy ? 'Opening…' : 'Add pane')));
    }

    /** The Split page. */
    function SplitPage({ appCtx, store, SessionProvider, renderSlot }) {
      const state = useSyncExternalStore(store.subscribe, store.get);
      const list = useSource(appCtx.get('sessions')?.list, EMPTY_LIST);
      const status = useSource(appCtx.get('uiSession')?.sessionStatus, EMPTY_STATUS);
      const [data, setData] = useState(null);
      const [adding, setAdding] = useState(false);
      const [error, setError] = useState('');
      const seeded = useRef(false);

      const [setsOpen, setSetsOpen] = useState(false);
      const [offer, setOffer] = useState(null);
      const selected = appCtx.get('uiWorkspace')?.selection?.getSnapshot?.()?.sessionId ?? '';
      const selectedFolder = realFolder(list.byId?.[selected]?.cwd);
      const paneFolder = useMemo(() => {
        for (const pane of state.panes) {
          const folder = realFolder(list.byId?.[pane.sessionId]?.cwd);
          if (folder) return folder;
        }
        return '';
      }, [state.panes, list]);
      // An empty Split page starts with the panes last open for the folder you were in, else that conversation.
      useEffect(() => {
        if (seeded.current || state.panes.length > 0 || !list.ids?.length) return;
        seeded.current = true;
        void (async () => {
          if (selectedFolder) {
            const saved = await call(null, `?sets=1&folder=${encodeURIComponent(selectedFolder)}`).catch(() => null);
            const ids = (saved?.folder?.panes ?? []).map((pane) => pane.sessionId).filter((id) => list.byId?.[id]);
            if (ids.length > 0) { store.replace(ids); return; }
          }
          if (selected) {
            try { store.add(selected); } catch { /* full */ }
          }
        })();
      }, [appCtx, store, state.panes.length, list, selected, selectedFolder]);
      // The panes open for a folder are kept for it.
      const paneKey = state.panes.map((pane) => pane.sessionId).join(',');
      useEffect(() => {
        if (!paneFolder || data?.enabled !== true) return;
        call({ action: 'saveFolder', folder: paneFolder, sessionIds: state.panes.map((pane) => pane.sessionId) }).catch(() => {});
      }, [paneFolder, paneKey, data?.enabled]);
      // You came from a conversation in another folder that has panes kept: offer to bring them back.
      useEffect(() => {
        let alive = true;
        if (!selectedFolder || selectedFolder === paneFolder) { setOffer(null); return undefined; }
        call(null, `?sets=1&folder=${encodeURIComponent(selectedFolder)}`).then((value) => {
          const ids = (value.folder?.panes ?? []).map((pane) => pane.sessionId).filter((id) => list.byId?.[id]);
          if (alive) setOffer(ids.length > 0 ? { folder: selectedFolder, ids } : null);
        }, () => {});
        return () => { alive = false; };
      }, [selectedFolder, paneFolder]);

      const query = useMemo(() => {
        const ids = state.panes.map((pane) => pane.sessionId);
        const cwds = Object.fromEntries(ids.map((id) => [id, list.byId?.[id]?.cwd ?? '']));
        return `?sessions=${encodeURIComponent(ids.join(','))}&cwds=${encodeURIComponent(JSON.stringify(cwds))}`;
      }, [state.panes, list]);
      useEffect(() => {
        let alive = true;
        const read = () => call(null, query).then((value) => { if (alive) { setData(value); setError(''); } }, (problem) => { if (alive) setError(problem.message); });
        read();
        // A pane's mode can change from its own mode button: read again now and then.
        const timer = dshPoll.loop(() => read(), { every: 5000, immediate: false });
        return () => { alive = false; timer.stop(); };
      }, [query]);

      if (data && data.enabled !== true) {
        return h('div', { className: 'dsh-sp-page' }, h('style', null, CSS),
          h('div', { className: 'dsh-sp-empty' }, h('h2', null, 'Split Plus is off'), h('p', { className: 'dsh-sp-note' }, 'Switch it on in Settings → Split Plus to put threads side by side.')));
      }
      const focusedPane = state.panes.find((pane) => pane.id === state.focus) ?? state.panes[0];
      const from = focusedPane ? { sessionId: focusedPane.sessionId, cwd: list.byId?.[focusedPane.sessionId]?.cwd ?? '' } : null;
      const full = state.panes.length >= MAX_PANES;
      return h('div', { className: 'dsh-sp-page' },
        h('style', null, CSS),
        h('div', { className: 'dsh-sp-bar' },
          h('span', { className: 'title' }, 'Split'),
          h('button', { type: 'button', className: 'dsh-sp-btn', disabled: full || !data, title: full ? `At most ${MAX_PANES} panes` : 'Open another thread beside these', onClick: () => { setAdding(!adding); setSetsOpen(false); } }, '+ Add pane'),
          h('button', { type: 'button', className: 'dsh-sp-btn', disabled: !data, onClick: () => { setSetsOpen(!setsOpen); setAdding(false); } }, 'Pane sets'),
          offer ? h('button', { type: 'button', className: 'dsh-sp-btn', title: offer.folder, onClick: () => { store.replace(offer.ids); setOffer(null); } }, `Bring back the ${offer.ids.length} pane${offer.ids.length === 1 ? '' : 's'} of ${offer.folder.split('/').pop()}`) : null,
          (data?.danger ?? []).length > 0 ? h('span', { className: 'dsh-sp-state', 'data-danger': 'true', style: { color: 'var(--dsw-alias-state-error-primary)', borderColor: 'currentColor' }, title: data.danger.map((one) => one.what).join('\n') }, `Careful: ${data.danger.length} safety rule${data.danger.length === 1 ? '' : 's'} switched off`) : null,
          h('span', { className: 'hint' }, error ? `Split Plus: ${error}` : state.panes.length ? 'Each pane is a full thread: its own mode, its own buttons, its own access level.' : '')),
        setsOpen && data ? h(PaneSets, { appCtx, store, data, list, from, onClose: () => setSetsOpen(false) }) : null,
        adding && data ? h(AddPane, {
          appCtx, data, list, panes: state.panes, from,
          onCancel: () => setAdding(false),
          onDone: (sessionId) => {
            try { store.add(sessionId); setAdding(false); } catch (problem) { setError(problem.message); }
          },
        }) : null,
        state.panes.length === 0
          ? h('div', { className: 'dsh-sp-empty' },
            h('h2', null, 'Threads side by side'),
            h('p', { className: 'dsh-sp-note' }, 'Add a pane to start. A pane opened from another one works in the same folder, so Code can work while you research or ask beside it.'),
            h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', disabled: !data, onClick: () => setAdding(true) }, '+ Add pane'))
          : h('div', { className: 'dsh-sp-grid', style: { gridTemplateColumns: `repeat(${state.panes.length}, minmax(0, 1fr))` } },
            state.panes.map((pane) => h(Pane, {
              key: pane.id, appCtx, store, pane,
              facts: data?.panes?.[pane.sessionId],
              summary: list.byId?.[pane.sessionId],
              status: status?.get?.(pane.sessionId),
              localWait: (data?.waitingLocal ?? []).includes(pane.sessionId),
              fileWait: data?.waitingFile?.[pane.sessionId] ?? null,
              focused: state.panes.length > 1 && pane.id === focusedPane?.id,
              onFocus: () => store.focus(pane.id),
              onClose: () => store.remove(pane.id),
              SessionProvider, renderSlot,
            }))));
    }

    // ---- Send to (step 3) -------------------------------------------------------------------------

    /**
     * Send a message into a conversation. 'queue' starts it now, or holds it until its running turn ends
     * (the app's own queue, with its own Steer); 'steer' hands it to the running turn at its next step.
     */
    async function promptInto(appCtx, sessionId, text, mode = 'queue') {
      const remote = appCtx.get('remote.session');
      if (!remote?.prompt) throw new Error('This version of the app cannot send a message from here.');
      const sent = await remote.prompt({ requestId: globalThis.crypto?.randomUUID?.() ?? `split-${Date.now()}`, sessionId, mode, content: [{ type: 'text', text }] });
      if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'the message was not sent');
    }

    /** Where a floating window opens: near a rectangle, inside the window. */
    function placeNear(rect, width = 380, height = 360) {
      const left = Math.max(8, Math.min((rect?.left ?? 40), window.innerWidth - width - 8));
      const below = (rect?.bottom ?? 40) + 6;
      const top = below + height > window.innerHeight ? Math.max(8, (rect?.top ?? 40) - height - 6) : below;
      return { left, top };
    }

    const KIND_WORDS = { selection: 'the selection', message: 'this answer', error: 'this error', file: 'this file', result: 'this result' };

    /**
     * The Send to window: the open panes by name, a new chat in a tab, or a conversation you already
     * have; "Send" puts a card in its chat box, "Send and start" sends it there at once. Nothing is sent
     * without one of these two clicks (the owner's fixed rule 1).
     */
    function SendMenu({ appCtx, store, fromSessionId, kind, file = '', getText, place, onClose }) {
      const list = useSource(appCtx.get('sessions')?.list, EMPTY_LIST);
      const state = useSyncExternalStore(store.subscribe, store.get);
      const others = state.panes.map((pane) => pane.sessionId).filter((id) => id !== fromSessionId);
      const [data, setData] = useState(null);
      const [target, setTarget] = useState('');
      const [mode, setMode] = useState('');
      const [existing, setExisting] = useState('');
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState('');
      const [error, setError] = useState(false);
      const key = others.join(',');
      useEffect(() => {
        let alive = true;
        call(null, `?sessions=${encodeURIComponent([fromSessionId, ...others].join(','))}`).then((value) => {
          if (!alive) return;
          setData(value);
          setMode(offeredModes(value).rows.find((row) => !row.sealed)?.id ?? '');
          const firstPane = others.find((id) => value.panes?.[id] && !value.panes[id].sealed);
          setTarget(firstPane ? `pane:${firstPane}` : 'new');
        }, (problem) => { if (alive) { setNote(problem.message); setError(true); } });
        return () => { alive = false; };
      }, [fromSessionId, key]);
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
      }, [onClose]);
      const recent = useMemo(() => (list.ids ?? []).map((id) => list.byId[id]).filter((row) => row && row.id !== fromSessionId && !row.parentId && row.origin !== 'subagent' && !row.blank && !/\/dsh-recon[^/]*(\/|$)/.test(row.cwd ?? '')).slice(0, 80), [list, fromSessionId]);
      // Item 4A, stage 6b (J19): grouped by space, this window's first; Recon (and sealed threads) only in a Recon window.
      const known = useSpacesOf(recent.map((row) => row.id));
      const grouped = useMemo(() => pickerGroups(recent, known, windowSpace(), pageLang(), 40), [recent, known]);
      const listed = grouped.groups.reduce((sum, group) => sum + group.rows.length, 0);
      const sealedFrom = data?.panes?.[fromSessionId]?.sealed === true;
      // Research to Content travels as a research packet (Content's own "bring": the claims with their sources and grades).
      const toPane = target.startsWith('pane:') ? target.slice(5) : '';
      const packetDoor = data?.panes?.[fromSessionId]?.mode === 'research' && Boolean(toPane) && data?.panes?.[toPane]?.mode === 'content';
      const [reports, setReports] = useState(null);
      const [report, setReport] = useState('');
      useEffect(() => {
        if (!packetDoor || reports !== null) return undefined;
        let alive = true;
        fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'reports' }) })
          .then((response) => (response.ok ? response.json() : {})).then((value) => { if (alive) { setReports(value.reports ?? []); setReport(value.reports?.[0]?.name ?? ''); } }, () => { if (alive) setReports([]); });
        return () => { alive = false; };
      }, [packetDoor, reports]);
      const go = async (start) => {
        setBusy(true);
        setNote('');
        setError(false);
        try {
          let to = '';
          if (target.startsWith('pane:')) to = target.slice(5);
          else if (target === 'existing') {
            if (existing && !grouped.groups.some((group) => group.rows.some((row) => row.id === existing))) throw new Error('Pick a thread from the list.');
            to = existing;
          } else if (target === 'new') {
            if (!mode) throw new Error('Pick a mode.');
            // Item 4A, stage 6b (J19): the new thread is in the window's space, under its rules; never out of a Recon window.
            const space = sendNewSpace(offeredModes(data), windowSpace());
            if (space === null) throw new Error(words6b('sendNewRecon', {}, pageLang()));
            to = await startConversation(appCtx, data, { mode, choice: 'scratch', space });
          }
          if (!to) throw new Error('Pick where it goes.');
          if (packetDoor && report) {
            // Content brings the packet in (new dated files, the claims in its ledger with origin "research"),
            // then the Content conversation gets a card saying so.
            const response = await fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'receive', sessionId: to, report }) });
            const answer = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(answer.error || `Content said no (${response.status})`);
            const title = list.byId?.[fromSessionId]?.displayTitle ?? '';
            const done = await call({ action: 'send', fromSessionId, fromTitle: title, toSessionId: to, kind: 'result', text: `The user sent the Research report ${report} as a research packet. ${answer.received?.text ?? ''}`, file: report, start });
            if (start && done.text) await promptInto(appCtx, to, done.text, 'queue');
            setNote(start ? 'The packet is in Content\'s ledger, and that thread goes on.' : 'The packet is in Content\'s ledger; a card in that thread\'s chat box says so.');
            setTimeout(onClose, 1800);
            return;
          }
          const text = await getText();
          const title = list.byId?.[fromSessionId]?.displayTitle ?? '';
          const done = await call({ action: 'send', fromSessionId, fromTitle: title, toSessionId: to, kind, text, file, start });
          if (start && done.text) await promptInto(appCtx, to, done.text, 'queue');
          if (target === 'new' || target === 'existing') {
            // Show where it went: a pane when there is room, else that conversation itself.
            try { store.add(to); } catch { appCtx.get('uiWorkspace')?.openSession?.(to); }
          }
          setNote(start ? 'Sent: that thread has it and goes on (after its running turn, if one is running).' : 'Sent: the card waits in that thread\'s chat box until you send it there.');
          setTimeout(onClose, 1600);
        } catch (problem) {
          setNote(problem?.message ?? String(problem));
          setError(true);
        } finally {
          setBusy(false);
        }
      };
      const option = (value, label, extra = null) => h('label', { key: value, className: 'dsh-sp-choice' },
        h('input', { type: 'radio', name: 'dsh-sp-target', checked: target === value, onChange: () => setTarget(value) }),
        h('span', null, label), extra);
      return ReactDOM.createPortal(h('div', { className: 'dsh-sp-pop dsh-sp-send', role: 'dialog', 'aria-label': 'Send to', style: { position: 'fixed', left: place.left, top: place.top } },
        h('style', null, CSS),
        h('div', { className: 'dsh-sp-row', style: { justifyContent: 'space-between', alignItems: 'center' } },
          h('strong', null, `Send ${KIND_WORDS[kind] ?? 'this'} to…`),
          h('button', { type: 'button', className: 'dsh-sp-icon', 'aria-label': 'Close', onClick: onClose }, h(Icon, { d: ICON_CLOSE }))),
        !data && !note ? h('p', { className: 'dsh-sp-note' }, 'Loading…') : null,
        data && sealedFrom ? [
          h('p', { key: 'sealed', className: 'dsh-sp-note' }, 'This thread is sealed (Recon). Nothing leaves it except through its own Export window, after its run.'),
          h('div', { key: 'door', className: 'dsh-sp-row' }, h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', onClick: () => { window.dispatchEvent(new CustomEvent('dsh-split-plus:recon-export', { detail: { sessionId: fromSessionId } })); onClose(); } }, 'Open Recon\'s Export…')),
        ] : null,
        data && !sealedFrom ? [
          ...others.filter((id) => data.panes?.[id] && !data.panes[id].sealed).map((id) => option(`pane:${id}`, `The ${data.panes[id].label} pane${list.byId?.[id]?.displayTitle ? ` — ${list.byId[id].displayTitle.slice(0, 48)}${list.byId[id].displayTitle.length > 48 ? '…' : ''}` : ''}`)),
          option('new', 'A new thread in', h('select', { value: mode, onChange: (event) => { setMode(event.target.value); setTarget('new'); } }, offeredModes(data).rows.filter((row) => !row.sealed).map((row) => h('option', { key: row.id, value: row.id }, row.label)))),
          option('existing', 'A thread I have', h('select', { value: existing, onChange: (event) => { setExisting(event.target.value); setTarget('existing'); } },
            h('option', { value: '' }, known === null ? 'Loading…' : listed ? 'Choose…' : 'None'),
            pickerOptions(grouped, (row) => (row.displayTitle || row.id).slice(0, 60)))),
          grouped.left > 0 ? h('p', { key: 'unsorted', className: 'dsh-sp-note', 'data-unsorted': '' }, words6b('unsorted', {}, pageLang())) : null,
          packetDoor ? h('label', { key: 'packet', className: 'dsh-sp-choice' }, h('span', null, 'As a research packet:'),
            h('select', { value: report, onChange: (event) => setReport(event.target.value) },
              h('option', { value: '' }, reports === null ? 'Loading…' : reports.length ? `No: send ${KIND_WORDS[kind] ?? 'it'} as it is` : 'No saved report'),
              (reports ?? []).map((one) => h('option', { key: one.name, value: one.name }, (one.title || one.name).slice(0, 60))))) : null,
          h('p', { key: 'rule', className: 'dsh-sp-note' }, packetDoor && report ? 'Content brings the report in with its claims, sources and grades, marked as from Research; you rule on each claim there.' : 'It goes as material with its source, never as your instruction. Add your own sentence in the receiving chat box.'),
          h('div', { key: 'buttons', className: 'dsh-sp-row' },
            h('button', { type: 'button', className: 'dsh-sp-btn', disabled: busy, onClick: () => void go(true), title: 'Send it there and start that thread at once' }, 'Send and start'),
            h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', disabled: busy, onClick: () => void go(false), title: 'Put it in that thread\'s chat box; you send it from there' }, busy ? 'Sending…' : 'Send')),
        ] : null,
        note ? h('p', { className: 'dsh-sp-note', 'data-error': error ? 'true' : 'false' }, note) : null), document.body);
    }

    const ICON_SEND = 'M4 12l16-8-6 16-3-7-7-1z';

    /** "Send to…" under every answer. */
    function AnswerSend({ appCtx, store, flags, sessionId, messageId }) {
      const on = useSyncExternalStore(flags.subscribe, flags.get);
      const [place, setPlace] = useState(null);
      if (!on || !sessionId || !messageId) return null;
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Send this answer to another pane or thread', 'aria-label': 'Send to', onClick: (event) => setPlace(placeNear(event.currentTarget.getBoundingClientRect())) }, h(Icon, { d: ICON_SEND })),
        place ? h(SendMenu, { appCtx, store, fromSessionId: sessionId, kind: 'message', getText: async () => (await call({ action: 'message', sessionId, messageId })).text, place, onClose: () => setPlace(null) }) : null);
    }

    /**
     * Above each chat box: the tray (cards sent to this conversation, waiting for you), and "Send to…"
     * for text you select in this conversation (also ⌘⇧S / Ctrl+Shift+S).
     */
    function ChatDock({ appCtx, store, flags, sessionId }) {
      const on = useSyncExternalStore(flags.subscribe, flags.get);
      const status = useSource(appCtx.get('uiSession')?.sessionStatus, EMPTY_STATUS);
      const running = status?.get?.(sessionId)?.running === true;
      const [tray, setTray] = useState([]);
      const [sentences, setSentences] = useState({});
      const [problem, setProblem] = useState('');
      const [pick, setPick] = useState(null);
      const [menu, setMenu] = useState(null);
      const [tick, setTick] = useState(0);
      const [beside, setBeside] = useState(null);
      // The starting text, shown whole and editable: nothing a model wrote goes out unseen.
      const [besideDraft, setBesideDraft] = useState('');
      useEffect(() => { setBesideDraft(beside?.text ?? ''); }, [beside?.at]);
      const [hiddenAt, setHiddenAt] = useState(0);
      useEffect(() => {
        if (!on || !sessionId) return undefined;
        let alive = true;
        const read = () => call(null, `?tray=${encodeURIComponent(sessionId)}`).then((value) => {
          if (!alive) return;
          setTray(value.tray ?? []);
          // A Content conversation: its newest "Continue in Research", offered for the pane beside.
          if (value.mode === 'content') {
            fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'continued', sessionId }) })
              .then((response) => (response.ok ? response.json() : {})).then((answer) => { if (alive) setBeside(answer.continued ?? null); }, () => {});
          } else setBeside(null);
        }, () => {});
        read();
        // One look every 3 s per pane, none while the window is hidden.
        const timer = dshPoll.loop(() => read(), { every: 3000, immediate: false });
        return () => { alive = false; timer.stop(); };
      }, [on, sessionId, tick]);
      // Text selected inside this conversation (not in its chat box) offers "Send to…".
      useEffect(() => {
        if (!on || !sessionId) return undefined;
        const mine = () => {
          const selection = window.getSelection?.();
          const text = selection?.toString?.().trim() ?? '';
          if (!text || selection.rangeCount === 0) return null;
          const node = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement;
          const box = node?.closest?.('[data-conversation-session]');
          if (!box || box.getAttribute('data-conversation-session') !== sessionId || node.closest('[data-composer-seat]')) return null;
          const isError = Boolean(node.closest('[data-tool-error], [data-error="true"], [role="alert"]'));
          return { text, kind: isError ? 'error' : 'selection', rect: selection.getRangeAt(0).getBoundingClientRect() };
        };
        const onUp = () => setTimeout(() => { const found = mine(); setPick(found); }, 0);
        const onKey = (event) => {
          if ((event.metaKey || event.ctrlKey) && event.shiftKey && (event.key === 's' || event.key === 'S')) {
            const found = mine();
            if (!found) return;
            event.preventDefault();
            setPick(null);
            setMenu({ ...found, place: placeNear(found.rect) });
          }
        };
        const onChange = () => { if (!window.getSelection?.()?.toString?.().trim()) setPick(null); };
        // Artifacts' "Send to…" on a file this conversation made.
        const onFile = (event) => {
          const detail = event?.detail ?? {};
          if (detail.sessionId !== sessionId || !detail.path) return;
          setMenu({ kind: 'file', file: String(detail.path), place: placeNear({ left: window.innerWidth / 2 - 190, top: 80, bottom: 80 }) });
        };
        window.addEventListener('dsh-split-plus:send-file', onFile);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('keydown', onKey);
        document.addEventListener('selectionchange', onChange);
        return () => { document.removeEventListener('mouseup', onUp); document.removeEventListener('keydown', onKey); document.removeEventListener('selectionchange', onChange); window.removeEventListener('dsh-split-plus:send-file', onFile); };
      }, [on, sessionId]);
      if (!on || !sessionId) return null;
      const deliver = async (card, how) => {
        setProblem('');
        try {
          const done = await call({ action: 'deliver', sessionId, id: card.id, sentence: sentences[card.id] ?? '', how });
          await promptInto(appCtx, sessionId, done.text, how === 'handover' ? 'steer' : 'queue');
          setTick((value) => value + 1);
        } catch (error) {
          setProblem(error.message);
        }
      };
      const drop = async (card) => {
        await call({ action: 'drop', sessionId, id: card.id }).catch(() => {});
        setTick((value) => value + 1);
      };
      const when = (at) => new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const continueBeside = async () => {
        setProblem('');
        try {
          const text = besideDraft.trim();
          if (!text) throw new Error('The starting text is empty.');
          // Item 4A, stage 6b (J19): never out of a sealed pane; else in the window's space when it offers Research, else Chat.
          // Asked before the starting text is taken, so a refusal leaves it offered.
          const data = await call(null, `?sessions=${encodeURIComponent(sessionId)}`);
          if (data.panes?.[sessionId]?.sealed !== false) throw new Error(words6b('continueSealed', {}, pageLang()));
          const where = continuePlace(data.spaces, windowSpace());
          const taken = await fetch(new URL('dsh-content/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'continued', sessionId, taken: true }) }).then((response) => response.json());
          if (!taken?.continued?.text) throw new Error('That starting text is not there any more.');
          const child = await startConversation(appCtx, data, { mode: 'research', choice: 'scratch', ...(where.space ? { space: where.space } : {}) });
          try { store.add(child); } catch { appCtx.get('uiWorkspace')?.openSession?.(child); }
          await promptInto(appCtx, child, text, 'queue');
          setBeside(null);
          if (where.note) void askInPage({ notice: true, title: 'Split Plus', text: where.note === 'recon' ? words6b('continueReconWindow', {}, pageLang()) : words6b('continueInChat', { space: data.spaceNames?.[windowSpace()] || windowSpace() }, pageLang()) });
        } catch (error) {
          setProblem(error.message);
        }
      };
      return h(React.Fragment, null,
        h('style', null, CSS),
        beside && beside.at !== hiddenAt ? h('div', { className: 'dsh-sp-card' },
          h('div', { className: 'dsh-sp-cardname' }, 'Continue in Research: this thread\'s model wrote a starting text for a Research thread. Read it, change it if you like; it goes as your message.'),
          h('textarea', { className: 'dsh-sp-input', 'aria-label': 'Starting text for the Research thread', rows: 8, style: { width: '100%', minHeight: 120, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }, value: besideDraft, onChange: (event) => setBesideDraft(event.target.value) }),
          h('div', { className: 'dsh-sp-row dsh-sp-cardrow' },
            h('button', { type: 'button', className: 'dsh-sp-btn', onClick: () => setHiddenAt(beside.at), title: 'Hide it; you can still paste the text yourself' }, 'Not now'),
            h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', onClick: () => void continueBeside(), title: 'Start a Research thread in the pane beside with this text' }, 'Start in Research beside')),
          problem && !tray.length ? h('p', { className: 'dsh-sp-note', 'data-error': 'true' }, problem) : null) : null,
        tray.length > 0 ? h('div', { className: 'dsh-sp-tray', 'aria-label': 'Sent to this thread' },
          tray.map((card) => h('div', { key: card.id, className: 'dsh-sp-card' },
            h('div', { className: 'dsh-sp-cardhead' },
              h('span', { className: 'dsh-sp-abbr' }, '↘'),
              h('span', { className: 'dsh-sp-cardname', title: card.from?.title ?? '' }, `${(KIND_WORDS[card.kind] ?? 'material').replace(/^(the|this) /, '').replace(/^./, (c) => c.toUpperCase())} from the ${card.from?.label ?? 'other'} thread · ${when(card.at)}${card.sources ? ` · ${card.sources} source${card.sources === 1 ? '' : 's'}` : ''}`)),
            h('div', { className: 'dsh-sp-preview' }, card.file ? `${card.file}\n${card.preview}` : card.preview),
            h('div', { className: 'dsh-sp-row dsh-sp-cardrow' },
              h('input', { className: 'dsh-sp-input', style: { flex: '1 1 160px', minWidth: 0 }, placeholder: 'Your sentence (optional)', value: sentences[card.id] ?? '', onChange: (event) => setSentences({ ...sentences, [card.id]: event.target.value }) }),
              h('button', { type: 'button', className: 'dsh-sp-btn', onClick: () => void drop(card), title: 'Take it out; nothing is sent' }, 'Remove'),
              running ? h('button', { type: 'button', className: 'dsh-sp-btn', onClick: () => void deliver(card, 'handover'), title: 'The running job reads it at its next step, without stopping' }, 'Hand over now') : null,
              h('button', { type: 'button', className: 'dsh-sp-btn', 'data-main': 'true', onClick: () => void deliver(card, 'send'), title: running ? 'Held until the running job ends, then sent' : 'Send it into this thread' }, running ? 'Send when done' : 'Send')))),
          problem ? h('p', { className: 'dsh-sp-note', 'data-error': 'true' }, problem) : null) : null,
        pick && !menu ? ReactDOM.createPortal(h('button', { type: 'button', className: 'dsh-sp-float', style: { left: Math.min(pick.rect.right, window.innerWidth - 110), top: Math.max(4, pick.rect.top - 34) }, onMouseDown: (event) => event.preventDefault(), onClick: () => { setMenu({ ...pick, place: placeNear(pick.rect) }); setPick(null); } }, h(Icon, { d: ICON_SEND, size: 12 }), ' Send to…'), document.body) : null,
        menu ? h(SendMenu, { appCtx, store, fromSessionId: sessionId, kind: menu.kind, file: menu.file ?? '', getText: async () => (menu.file ? (await call({ action: 'file', sessionId, path: menu.file })).text : menu.text), place: menu.place, onClose: () => setMenu(null) }) : null);
    }

    /** "Send a file" in a pane's title: the files this pane read or changed. */
    function FileSend({ appCtx, store, sessionId }) {
      const [open, setOpen] = useState(null);
      const [files, setFiles] = useState(null);
      const [menu, setMenu] = useState(null);
      useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        call(null, `?files=${encodeURIComponent(sessionId)}`).then((value) => { if (alive) setFiles(value.files ?? []); }, () => { if (alive) setFiles([]); });
        return () => { alive = false; };
      }, [open, sessionId]);
      return h(React.Fragment, null,
        h('button', { type: 'button', className: 'dsh-sp-icon', title: 'Send a file this pane read or changed', 'aria-label': 'Send a file', onClick: (event) => setOpen(open ? null : placeNear(event.currentTarget.getBoundingClientRect(), 360, 300)) }, h(Icon, { d: ICON_SEND })),
        open && !menu ? ReactDOM.createPortal(h('div', { className: 'dsh-sp-pop', role: 'dialog', 'aria-label': 'Send a file', style: { position: 'fixed', left: open.left, top: open.top } },
          h('style', null, CSS),
          h('strong', null, 'Send a file'),
          files === null ? h('p', { className: 'dsh-sp-note' }, 'Loading…')
            : files.length === 0 ? h('p', { className: 'dsh-sp-note' }, 'This pane has not read or changed a file yet.')
              : h('div', { className: 'dsh-sp-files' }, files.map((path) => h('button', { key: path, type: 'button', className: 'dsh-sp-fileitem', title: path, onClick: () => setMenu({ path, place: open }) }, path.split('/').pop(), h('span', null, ` ${path}`)))),
          h('div', { className: 'dsh-sp-row' }, h('button', { type: 'button', className: 'dsh-sp-btn', onClick: () => setOpen(null) }, 'Close'))), document.body) : null,
        menu ? h(SendMenu, { appCtx, store, fromSessionId: sessionId, kind: 'file', file: menu.path, getText: async () => (await call({ action: 'file', sessionId, path: menu.path })).text, place: menu.place, onClose: () => { setMenu(null); setOpen(null); } }) : null);
    }

    function SplitIcon({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 5h16v14H4zM12 5v14' }));
    }

    /** The Danger zone's switches (the server half's DANGERS), in the order Settings shows them. */
    const DANGER_SWITCHES = [
      ['dangerFileHolds', 'Let panes change the same file at once', 'No waiting for a file another pane is changing, and a change to a file that changed since the pane read it is no longer refused.'],
      ['dangerSealedSends', 'Send out of and into Recon panes', 'Send to works out of and into Recon panes, without Recon\'s Export window. What Recon read can then reach other threads.'],
      ['dangerWatchSealed', 'Watch Recon panes', 'A watcher may read a Recon pane\'s run. What Recon read then reaches the watcher\'s model.'],
      ['dangerWatcherTools', 'Let watchers use every tool', 'A watcher may change files and run commands like any thread in its mode, not only read.'],
      ['dangerUnmarked', 'Send without the card', 'Sends go as plain text, without the "material, not instructions" card: the receiving thread, Devices, Content and Creator Plus read it as your own words.'],
    ];

    /** Settings → Split Plus. */
    function SettingsPage({ appCtx, onChanged }) {
      const [data, setData] = useState(null);
      const [draft, setDraft] = useState({ localAtOnce: '', watcherModel: '' });
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState({ text: '', details: '', error: false });
      const say = (text) => setNote({ text, details: '', error: false });
      const read = useCallback(() => call().then((value) => { setData(value); setDraft({ localAtOnce: String(value.localAtOnce), watcherModel: value.watcherModel ?? '' }); }, (problem) => setNote({ text: problem.message, details: problem.details ?? '', error: true })), []);
      useEffect(() => { void read(); }, [read]);
      const run = async (work, done) => {
        setBusy(true);
        say('');
        try { await work(); say(done); await read(); onChanged(); } catch (problem) { setNote({ text: `Not saved: ${problem.message}`, details: problem.details ?? '', error: true }); } finally { setBusy(false); }
      };
      if (!data) return h(ui.Page, { title: 'Split Plus' }, note.text ? h(PlainNote, { text: note.text, details: note.details, kind: 'error' }) : h(ui.Wait, null, 'Loading…'));
      const on = data.enabled === true;
      return h(ui.Page, { title: 'Split Plus', desc: 'Two to four threads side by side in one window, each in any mode with its own buttons and access level.' },
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,
        h(ui.Row, { title: 'Split page', desc: 'A pane opened from another works in the same folder; a Recon pane works only in Recon\'s own room.' },
          h(ui.Switch, { on, label: 'Show the Split page', disabled: busy, onChange: () => void run(() => saveSetting(appCtx, 'enabled', !on), on ? 'Switched off.' : 'Switched on: the Split page is in the left panel.') })),
        on ? h(React.Fragment, null,
          h(ui.Group, null, 'Local models'),
          h(ui.Row, { title: 'Panes on a local model at once', desc: 'How many panes may use a model on this Mac or your own server at the same time (1 to 4). A pane over the limit waits and says so. Online models never count.' },
            h(ui.Field, { style: { width: 60, flex: 'none' }, type: 'number', min: 1, max: 4, value: draft.localAtOnce, 'aria-label': 'Panes on a local model at once', onChange: (event) => setDraft({ ...draft, localAtOnce: event.target.value }) }),
            h(ui.Button, { disabled: busy || Number(draft.localAtOnce) === data.localAtOnce, onClick: () => void run(() => saveSetting(appCtx, 'localAtOnce', Math.max(1, Math.min(4, Math.round(Number(draft.localAtOnce) || 4)))), 'Saved.') }, 'Save')),
          h(ui.Group, null, 'Watching'),
          h(ui.Row, { title: 'Watcher model', desc: 'The model a watching pane starts with. It shows first in that pane\'s model menu, and you can change it there for that pane. Empty: the app\'s usual model.' },
            h(ui.Field, { style: { width: 220, flex: 'none' }, value: draft.watcherModel, placeholder: 'provider/model', 'aria-label': 'Watcher model', onChange: (event) => setDraft({ ...draft, watcherModel: event.target.value }) }),
            h(ui.Button, { disabled: busy || draft.watcherModel === data.watcherModel, onClick: () => void run(() => saveSetting(appCtx, 'watcherModel', draft.watcherModel.trim()), 'Saved.') }, 'Save')),
          h(ui.Group, null, 'Careful: safety rules'),
          h(ui.Desc, null, 'Each rule below starts on. Switch one off only when you need to: it stays off until you switch it back, the Split page shows a warning, and each change is noted in Split Plus\'s log.'),
          DANGER_SWITCHES.map(([key, name, desc]) => {
            const off = (data.danger ?? []).some((one) => one.name === key);
            return h(ui.Row, { key, title: name, desc }, h(ui.Switch, { on: off, danger: true, label: name, disabled: busy, onChange: () => void run(() => saveSetting(appCtx, key, !off), off ? 'Back on: the rule holds again.' : 'Switched off. It stays off until you switch it back.') }));
          })) : null);
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        const store = openPaneStore();
        // Whether Split Plus is on, for the buttons shown in every conversation.
        const flags = (() => {
          let on = false;
          const listeners = new Set();
          return {
            get: () => on,
            set(value) { if (on !== value) { on = value; for (const listener of listeners) listener(); } },
            subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
          };
        })();
        ctx.effect(() => ctx.slots.inject('conversation.chat.assistant-actions', () => ctx.slots.register(
          { name: 'conversation.chat.assistant-actions', id: 'split-plus-send', order: 25, inject: (sessionId) => ({ sessionId }) },
          (props) => h(AnswerSend, { ...props, appCtx: ctx, store, flags }),
        )), 'split-plus: send an answer');
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register(
          { name: 'conversation.input.dock', id: 'split-plus-tray', order: 1 },
          (props) => h(ChatDock, { appCtx: ctx, store, flags, sessionId: props?.sessionId ?? props?.session?.id ?? '' }),
        )), 'split-plus: tray and selection');

        // The conversation inside a pane: a slot of the Split page's own, in the scope of that pane's conversation.
        ctx.effect(() => ctx.slots.inject('splitplus.pane', () => ctx.slots.register({ name: 'splitplus.pane' }, PaneConversation)), 'split-plus: pane conversation');

        // The page and its sidebar row, only while Split Plus is on.
        let pageOff = null;
        const sync = async () => {
          let on = false;
          try { on = (await call()).enabled === true; } catch { on = false; }
          flags.set(on);
          if (on && !pageOff) {
            // A reload may have replaced this copy of the plugin while it asked: then it adds nothing.
            try {
              const main = ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({
                name: 'main', key: 'split',
                children: { 'splitplus.pane': { kind: 'single', scope: 'session' } },
              }, (props) => h(SplitPage, { ...props, appCtx: ctx, store }))), 'split-plus: page');
              const row = ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'split', order: 21, label: () => t('page.title') }, SplitIcon)), 'split-plus: sidebar row');
              pageOff = () => { row(); main(); };
            } catch (error) {
              if (!/inactive context/.test(String(error?.message ?? error))) throw error;
            }
          } else if (!on && pageOff) {
            pageOff();
            pageOff = null;
          }
        };
        // The server counts only conversations the Split page holds toward the local-model limit: say which, now and then.
        const report = () => {
          if (!pageOff) return;
          call({ action: 'panes', panes: store.get().panes }).catch(() => { /* said again in a moment */ });
        };
        ctx.effect(() => store.subscribe(report), 'split-plus: report panes');
        const heartbeat = dshPoll.loop(() => report(), { every: 20_000, immediate: false });
        ctx.effect(() => () => heartbeat.stop(), 'split-plus: report panes now and then');
        void sync().then(report).catch(() => { /* this copy of the plugin was replaced while it started */ });
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'split-plus', order: 118, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx, onChanged: () => void sync().then(report).catch(() => {}) }))), 'split-plus: settings');
        ctx.effect(() => () => { pageOff?.(); pageOff = null; });
      },
    };
  },
});
