/**
 * Learning, browser half: the study bar above the chat box and the progress
 * page in Settings.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-learn',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useEffect, useRef, useState } = React;
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
    const dshPoll = (() => {
      const API = 1;
      const root = typeof window !== 'undefined' ? window : globalThis;
      if (root.__dshPoll && root.__dshPoll.api >= API) return root.__dshPoll;

      /** How long a read of Settings stays good: with the change event working, 30 s is only a safety net. */
      const SETTINGS_TTL = 30000;
      /** Without the change event (an older app) the copy is only trusted for a moment. */
      const SETTINGS_TTL_NO_EVENTS = 2000;
      const WRITES = ['mutate', 'update', 'replace'];
      const stats = { settingsCalls: 0, settingsHits: 0, settingsInvalidations: 0, runs: 0, errors: 0 };
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

      /** Listen once per page connection for "Settings changed" (the app sends it after every write, from any window). */
      function watch(ctx) {
        const remote = ctx && ctx.remote;
        if (!remote || watched.has(remote)) return;
        watched.add(remote);
        try {
          if (typeof remote.$on === 'function') {
            remote.$on('settings/document-updated', (ns) => {
              invalidate();
              for (const listener of [...changeListeners]) {
                try { listener(ns); } catch { /* one listener's trouble must not stop the others */ }
              }
            });
            cache.events = true;
          }
        } catch { /* no change event here: the short copy time covers it */ }
        try {
          if (typeof ctx.on === 'function') ctx.on('connection/reset', invalidate);
        } catch { /* optional */ }
        // This page's own writes drop the copy before their answer comes back, so a read that follows a write is never behind it.
        const settings = remote.settings;
        if (settings && !wrapped.has(settings)) {
          wrapped.add(settings);
          for (const name of WRITES) {
            const original = settings[name];
            if (typeof original !== 'function') continue;
            try {
              settings[name] = function (...args) {
                invalidate();
                const done = original.apply(this, args);
                return done && typeof done.then === 'function' ? done.then((out) => { invalidate(); return out; }, (error) => { invalidate(); throw error; }) : done;
              };
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
    // ---- dsh-ui:begin ---- shared page parts (switch, button, row, heading, empty state, chips); the same block in every page file that uses it.
    // The master copy is docs/shared/dsh-ui.js. Change it there, then run `node scripts/sync-kit.mjs`; `bash scripts/check.sh` fails when a copy has drifted.
    // All classes start with "dshu-" and belong to this block only: no add-on defines or restyles them. The look follows docs/UI-STYLE.md.
    // React is passed in: `const ui = dshUi.makeParts(React);` then `h(ui.Switch, { on, label, onChange })`, `h(ui.Row, { title, desc }, control)` and so on.
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

      const makeParts = (React) => {
        ensureStyle();
        const h = React.createElement;
        /** The page frame: a title, one sentence under it, then the page. */
        const Page = ({ title, desc, children }) => h('div', { className: 'dshu-page' },
          title ? h('h2', { className: 'dshu-title' }, title) : null,
          desc ? h('p', { className: 'dshu-desc' }, desc) : null,
          children);
        const Group = ({ children }) => h('div', { className: 'dshu-group' }, children);
        /** A short line in the page's description style; `error` draws it in the error colour. */
        const Desc = ({ error, children, role }) => h('p', { className: 'dshu-desc', 'data-error': String(error === true), role: role ?? (error ? 'alert' : undefined) }, children);
        /** One setting: text on the left, the control(s) on the right. */
        const Row = ({ title, desc, children }) => h('div', { className: 'dshu-row' },
          h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, title), desc ? h('div', { className: 'dshu-rowdesc' }, desc) : null),
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
        return { Page, Group, Desc, Row, Side, Switch, Button, Field, CopyButton, Chips, Empty, Wait };
      };
      return { makeParts, ensureStyle, copyText };
    })();
    // ---- dsh-ui:end ----
    const PlainNote = dshKit.makeNote(React);
    dshUi.ensureStyle();

    const NS = 'learn';
    const DICT = { en: { 'section.title': 'Learning' }, zh: { 'section.title': '学习' } };
    const LEVELS = [
      ['gentle', 'Gentle'],
      ['firm', 'Firm'],
      ['strict', 'Strict'],
    ];
    const OUTCOME = { alone: 'solved alone', hints: 'solved with hints', shown: 'answer shown' };
    const SOURCE = { pdf: 'PDF', notes: 'Notes', topic: 'Topic', code: 'Code' };

    const CSS = `
.dsh-ln-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; box-sizing: border-box; width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px)); max-width: var(--dsh-composer-card-max-width, 100%); margin: 0 auto 8px; padding: 6px 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); min-width: 0; }
/* As wide as the chat box, also with Cowork's wide chat (which lets the box use the window less 32px). */
html[data-cws-wide] .dsh-ln-bar { max-width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px) - 32px); }
.dsh-ln-what { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 46%; color: var(--dsw-alias-label-primary); }
.dsh-ln-dots { display: inline-flex; gap: 4px; align-items: center; flex: none; }
.dsh-ln-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-ln-dot[data-on="done"] { background: var(--dsw-alias-state-success-primary); }
.dsh-ln-dot[data-on="now"] { background: var(--dsw-alias-brand-primary); }
.dsh-ln-stage { color: var(--dsw-alias-label-primary); font-weight: 500; white-space: nowrap; }
.dsh-ln-space { flex: 1; }
.dsh-ln-note { flex-basis: 100%; color: var(--dsw-alias-state-warn-primary); }
.dsh-ln-btn {
  height: 24px; padding: 0 9px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.dsh-ln-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-ln-btn[disabled] { opacity: .45; cursor: default; }
.dsh-ln-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-ln-select { height: 24px; padding: 0 6px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; }
.dsh-ln-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.dsh-ln-stat { padding: 12px 14px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsh-ln-statvalue { font-size: 22px; line-height: 28px; }
.dsh-ln-line { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ln-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0; max-width: 260px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-ln-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ln-card { padding: 12px 14px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); margin-bottom: 8px; display: flex; flex-direction: column; gap: 4px; }
.dsh-ln-cardhead { display: flex; align-items: center; gap: 8px; min-width: 0; }
.dsh-ln-cardtitle { flex: 1; min-width: 0; font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-ln-tag { flex: none; height: 22px; padding: 0 8px; border-radius: 11px; font-size: 11px; line-height: 22px; white-space: nowrap; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-ln-idea { display: flex; align-items: baseline; gap: 8px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ln-idea > span:first-child { flex: 1; min-width: 0; overflow-wrap: anywhere; color: var(--dsw-alias-label-primary); }
.dsh-ln-strength { flex: none; letter-spacing: 1px; color: var(--dsw-alias-state-success-primary); }
.dsh-ln-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ln-list code { font-size: 12px; color: var(--dsw-alias-label-primary); }
@media (max-width: 720px) { .dsh-ln-stats { grid-template-columns: minmax(0, 1fr); } .dsh-ln-row { flex-wrap: wrap; } }
`;

    async function getJson(path, sessionId) {
      const response = await fetch(new URL(path, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: sessionId ? { 'x-dsh-session': sessionId } : {} });
      if (!response.ok) throw dshKit.fail(`status ${response.status}`);
      return response.json();
    }

    async function postAction(body, sessionId) {
      const response = await fetch(new URL('dsh-learn/action', document.baseURI), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-dsh-learn': '1', ...(sessionId ? { 'x-dsh-session': sessionId } : {}) },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `status ${response.status}`);
      return data;
    }

    /**
     * Send a chat message for the learner, as if they had typed it and pressed Enter.
     * Uses the chat box's own actions when the app hands them over, otherwise types into the box.
     * @param {object} props - what the app gave the study bar.
     * @param {string} text - the message.
     * @returns {boolean} true when it was sent.
     */
    function send(props, text) {
      try {
        const actions = props.inputActions;
        if (actions?.setDraft && actions?.submit) {
          actions.setDraft(text);
          setTimeout(() => {
            try {
              actions.submit();
            } catch {
              // The learner can still press Enter.
            }
          }, 60);
          return true;
        }
      } catch {
        // Fall through to typing into the box.
      }
      const box = document.querySelector('[contenteditable="true"][role="textbox"], [contenteditable="true"]');
      if (!box) return false;
      box.focus();
      document.execCommand('insertText', false, text);
      setTimeout(() => box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true })), 80);
      return true;
    }

    /**
     * Whether a click landed on the chat box's Send button (the label, the title or the test id says send or submit).
     * @param {unknown} target - the clicked element.
     * @returns {boolean} true for a Send click.
     */
    function isSendClick(target) {
      try {
        const button = target?.closest?.('button, [role="button"]');
        if (!button) return false;
        const words = [button.getAttribute?.('aria-label'), button.getAttribute?.('title'), button.getAttribute?.('data-testid'), button.getAttribute?.('data-slot'), button.getAttribute?.('type') === 'submit' ? 'submit' : ''].join(' ');
        return /send|submit/i.test(words);
      } catch {
        return false;
      }
    }

    /**
     * Look at the tutor's state soon after a message is sent, by Enter or by a click on Send, so a /learn or a plan shows its bar within
     * about two seconds. Two looks (0.4 s and 1.6 s after): the tutor's tool may take a moment to answer. No timer runs between sends.
     * @param {Document} doc - the page.
     * @param {() => void} poke - looks now.
     * @param {(fn: () => void, ms: number) => unknown} [later] - timer, replaceable in tests.
     * @returns {() => void} stops watching.
     */
    function watchSend(doc, poke, later = (fn, ms) => setTimeout(fn, ms)) {
      const soon = () => { later(poke, 400); later(poke, 1600); };
      const onKey = (event) => { if (event.key === 'Enter' && !event.shiftKey) soon(); };
      const onClick = (event) => { if (isSendClick(event.target)) soon(); };
      doc.addEventListener('keydown', onKey, true);
      doc.addEventListener('click', onClick, true);
      return () => { doc.removeEventListener('keydown', onKey, true); doc.removeEventListener('click', onClick, true); };
    }

    /** The slim bar above the chat box while a study session is on. */
    function StudyBar(props) {
      const { sessionId } = props;
      const [status, setStatus] = useState(null);
      const [note, setNote] = useState('');
      const alive = useRef(true);
      const load = () =>
        getJson('dsh-learn/status', sessionId)
          .then((data) => { if (alive.current) setStatus(data); return data; })
          .catch(() => null);
      const active = Boolean(status?.session || status?.pending);
      useEffect(() => {
        alive.current = true;
        // While studying, the bar follows the tutor closely. Otherwise it looks only now and then for a /learn (typing one
        // looks at once, below), and when Learning is switched off it hardly looks at all. Nothing while the window is hidden.
        const watcher = dshPoll.loop(async () => {
          const data = await load();
          if (!data) return 6000;
          if (data.session || data.pending) return 1500;
          return data.settings?.enabled === false ? 60000 : 12000;
        }, { every: active ? 1500 : 12000 });
        const unwatch = watchSend(document, () => watcher.poke());
        return () => {
          alive.current = false;
          watcher.stop();
          unwatch();
        };
      }, [sessionId, active]);

      if (!status?.settings?.enabled || !active) return null;
      const act = async (body, message) => {
        setNote('');
        try {
          const next = await postAction(body, sessionId);
          if (!alive.current) return;
          setStatus((now) => ({ ...now, session: next.session, pending: next.pending }));
          if (message && !send(props, message)) setNote(`Type this to the tutor: ${message}`);
        } catch (error) {
          if (alive.current) setNote(error.message);
        }
      };
      const say = (message) => {
        setNote('');
        if (!send(props, message)) setNote(`Type this to the tutor: ${message}`);
        setTimeout(load, 600);
      };
      const levelSelect = (value) =>
        h('select', { className: 'dsh-ln-select', value, 'aria-label': 'Level', title: status.levels?.[value] ?? '', onChange: (event) => act({ action: 'level', value: event.target.value }) }, LEVELS.map(([id, label]) => h('option', { key: id, value: id }, label)));

      if (status.pending) {
        return h(
          'div',
          { className: 'dsh-ln-bar', role: 'region', 'aria-label': 'Study round' },
          h('style', null, CSS),
          h('span', { className: 'dsh-ln-what', title: status.pending.request }, `Ready to study: ${status.pending.request}`),
          h('span', { className: 'dsh-ln-space' }),
          levelSelect(status.pending.level),
          h('button', { type: 'button', className: 'dsh-ln-btn', 'data-main': 'true', onClick: () => say('Let’s start.') }, 'Start'),
          h('button', { type: 'button', className: 'dsh-ln-btn', onClick: () => act({ action: 'end' }) }, 'Cancel'),
          note ? h('span', { className: 'dsh-ln-note' }, note) : null,
        );
      }

      const session = status.session;
      const open = session.stage === 'ask' || session.stage === 'work';
      return h(
        'div',
        { className: 'dsh-ln-bar', role: 'region', 'aria-label': 'Study round' },
        h('style', null, CSS),
        h('span', { className: 'dsh-ln-what', title: `${session.title}: ${session.idea}` }, `${session.title} · ${session.idea}`),
        h(
          'span',
          { className: 'dsh-ln-dots', title: `Idea ${session.at + 1} of ${session.total}` },
          Array.from({ length: session.total }, (_, index) => h('span', { key: index, className: 'dsh-ln-dot', 'data-on': index < session.at ? 'done' : index === session.at ? 'now' : '' })),
        ),
        h('span', { className: 'dsh-ln-stage' }, session.label),
        h('span', { className: 'dsh-ln-space' }),
        levelSelect(session.level),
        open
          ? h('button', { type: 'button', className: 'dsh-ln-btn', disabled: !session.canHint.ok, title: session.canHint.ok ? `Hint ${session.hints + 1} of ${session.maxHints}` : session.canHint.why, onClick: () => say(session.level === 'strict' ? 'I’m stuck. Could I have a hint? Ask me where I am stuck if you need to.' : 'Could I have a hint?') }, 'Hint')
          : null,
        open
          ? h('button', { type: 'button', className: 'dsh-ln-btn', disabled: !session.canGiveUp.ok, title: session.canGiveUp.ok ? 'Giving up brings this idea back tomorrow' : session.canGiveUp.why, onClick: () => act({ action: 'giveup' }, 'I give up on this one. Please show me the answer.') }, 'Show answer')
          : null,
        h('button', { type: 'button', className: 'dsh-ln-btn', title: 'What you finished stays saved', onClick: () => act({ action: 'end' }) }, 'End'),
        note ? h('span', { className: 'dsh-ln-note' }, note) : null,
      );
    }

    async function loadSettings(ctx) {
      if (!ctx.remote?.settings) throw dshKit.fail('settings unavailable');
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw dshKit.fail(result.error);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw dshKit.fail('not mounted');
      return { value: view.value ?? {}, revision: view.revision };
    }

    async function mutateSettings(ctx, ops, revision) {
      let result = await ctx.remote.settings.mutate(NS, ops, revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        const fresh = await loadSettings(ctx);
        result = await ctx.remote.settings.mutate(NS, ops, fresh.revision);
      }
      if (!result.ok) throw dshKit.fail(result.error);
      return { value: result.value.value ?? {}, revision: result.value.revision };
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dshu-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Row({ title, hint, children }) {
      return h('div', { className: 'dshu-row' }, h('div', { className: 'dshu-rowtext' }, h('div', { className: 'dshu-rowtitle' }, title), hint ? h('div', { className: 'dshu-rowdesc' }, hint) : null), children);
    }

    const strength = (step) => '●'.repeat(Math.max(0, step + 1)) + '○'.repeat(Math.max(0, 4 - step));

    function SettingsPage({ appCtx }) {
      const [settings, setSettings] = useState(null);
      const [view, setView] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [confirming, setConfirming] = useState('');
      const alive = useRef(true);
      const refresh = () =>
        getJson('dsh-learn/overview')
          .then((data) => alive.current && setView(data))
          .catch((error) => alive.current && setNote({ text: `Could not load your progress: ${error.message}`, details: error.details ?? '', error: true }));

      useEffect(() => {
        alive.current = true;
        loadSettings(appCtx)
          .then((loaded) => alive.current && setSettings(loaded))
          .catch((error) => alive.current && setNote({ text: `Could not load the settings: ${error.message}`, details: error.details ?? '', error: true }));
        refresh();
        return () => {
          alive.current = false;
        };
      }, [appCtx]);

      if (!settings || !view) {
        return h('div', { className: 'dshu-page' }, h('style', null, CSS), h('h2', { className: 'dshu-title' }, 'Learning'), h('p', { className: 'dshu-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const value = settings.value;
      const set = async (field, next) => {
        try {
          const saved = await mutateSettings(appCtx, [{ op: 'set', path: [field], value: next }], settings.revision);
          if (!alive.current) return;
          setSettings(saved);
          setNote({ text: 'Saved.', error: false });
          refresh();
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, details: error.details ?? '', error: true });
        }
      };
      const remove = async (id) => {
        try {
          const next = await postAction({ action: 'removeTopic', id });
          if (!alive.current) return;
          setView(next);
          setConfirming('');
          setNote({ text: 'Topic removed.', error: false });
        } catch (error) {
          if (alive.current) setNote({ text: `Could not remove it: ${error.message}`, details: error.details ?? '', error: true });
        }
      };
      const stats = view.stats;
      const pct = (n) => (stats.tries > 0 ? `${Math.round((n / stats.tries) * 100)}%` : '–');
      const level = value.level ?? 'firm';

      return h(
        'div',
        { className: 'dshu-page' },
        h('style', null, CSS),
        h('h2', { className: 'dshu-title' }, 'Learning'),
        h('p', { className: 'dshu-desc' }, 'A tutor that makes you do the thinking. It asks before it explains, helps in small steps, gives the answer last, asks you to explain it back, and brings each idea back days later. Trying first is the part that makes it stick.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        h('div', { className: 'dshu-group' }, 'Your progress'),
        h(
          'div',
          { className: 'dsh-ln-stats' },
          h('div', { className: 'dsh-ln-stat' }, h('span', { className: 'dsh-ln-statvalue' }, String(view.due.length)), h('span', { className: 'dsh-ln-line' }, view.due.length === 1 ? 'idea due for review' : 'ideas due for review')),
          h('div', { className: 'dsh-ln-stat' }, h('span', { className: 'dsh-ln-statvalue' }, stats.tries > 0 ? `${Math.round(((stats.alone + stats.hints) / stats.tries) * 100)}%` : '–'), h('span', { className: 'dsh-ln-line' }, stats.tries > 0 ? `solved without the answer (alone ${pct(stats.alone)}, with hints ${pct(stats.hints)})` : 'solved without the answer')),
          h('div', { className: 'dsh-ln-stat' }, h('span', { className: 'dsh-ln-statvalue' }, String(stats.ideas)), h('span', { className: 'dsh-ln-line' }, `idea${stats.ideas === 1 ? '' : 's'} in ${stats.topics} topic${stats.topics === 1 ? '' : 's'}`)),
        ),

        h('div', { className: 'dshu-group' }, 'Due for review'),
        view.due.length === 0
          ? h('p', { className: 'dshu-desc', style: { margin: 0 } }, 'Nothing is due today.')
          : h(
              React.Fragment,
              null,
              view.due.slice(0, 12).map((item, index) => h('div', { className: 'dsh-ln-idea', key: index }, h('span', null, `${item.topic}: ${item.title}`), h('span', null, `due ${item.when}`))),
              view.due.length > 12 ? h('div', { className: 'dsh-ln-line' }, `and ${view.due.length - 12} more`) : null,
              h('p', { className: 'dshu-desc' }, 'Type ', h('code', null, '/learn review'), ' in a conversation to go through them.'),
            ),

        h('div', { className: 'dshu-group' }, 'How to use it'),
        h(
          'ul',
          { className: 'dsh-ln-list' },
          h('li', null, 'In any conversation type ', h('code', null, '/learn'), ' and what you want to learn: a topic ("how compound interest works"), a file ("chapter3.pdf"), or code ("the functions in parser.py").'),
          h('li', null, 'A study bar appears above the chat box. Press Start. The tutor first asks you a question; try it, even with a guess.'),
          h('li', null, 'Hint asks for a small step. Show answer unlocks when the level allows it. End stops; what you finished is saved.'),
          h('li', null, 'Use a strong model as the tutor. A tutor that teaches something wrong is worse than none, and studying from your own PDF or notes is safer than from the model\'s memory.'),
        ),

        h('div', { className: 'dshu-group' }, 'Settings'),
        h(Row, { title: 'Use Learning', hint: 'Off removes the study bar and makes the tutor tools answer that they are switched off.' }, h(Switch, { checked: value.enabled !== false, label: 'Use Learning', onChange: (next) => set('enabled', next) })),
        h(
          Row,
          { title: 'Level for new study rounds', hint: view.levels?.[level] ?? '' },
          h('select', { className: 'dsh-ln-field', value: level, 'aria-label': 'Level for new study rounds', onChange: (event) => set('level', event.target.value) }, LEVELS.map(([id, label]) => h('option', { key: id, value: id }, label))),
        ),
        h(
          Row,
          { title: 'Ideas per review', hint: 'The most ideas one review round goes through.' },
          h('select', { className: 'dsh-ln-field', value: String(value.reviewSize ?? 10), 'aria-label': 'Ideas per review', onChange: (event) => set('reviewSize', Number(event.target.value)) }, [5, 10, 15, 20].map((n) => h('option', { key: n, value: String(n) }, String(n)))),
        ),

        h('div', { className: 'dshu-group' }, `Topics (${view.topics.length})`),
        view.topics.length === 0 ? h('p', { className: 'dshu-desc', style: { margin: 0 } }, 'Nothing studied yet.') : null,
        view.topics.map((topic) =>
          h(
            'div',
            { className: 'dsh-ln-card', key: topic.id },
            h(
              'div',
              { className: 'dsh-ln-cardhead' },
              h('span', { className: 'dsh-ln-cardtitle' }, topic.title),
              h('span', { className: 'dsh-ln-tag', title: topic.source?.ref || '' }, SOURCE[topic.source?.kind] ?? 'Topic'),
              confirming === topic.id
                ? h(React.Fragment, null, h('button', { type: 'button', className: 'dsh-ln-btn', onClick: () => remove(topic.id) }, 'Yes, remove'), h('button', { type: 'button', className: 'dsh-ln-btn', onClick: () => setConfirming('') }, 'Keep'))
                : h('button', { type: 'button', className: 'dsh-ln-btn', onClick: () => setConfirming(topic.id) }, 'Remove'),
            ),
            topic.ideas.map((idea, index) =>
              h(
                'div',
                { className: 'dsh-ln-idea', key: index },
                h('span', null, idea.title),
                h('span', null, idea.last ? `${OUTCOME[idea.last] ?? idea.last}${idea.when ? ` · back ${idea.when}` : ''}` : 'not finished yet'),
                h('span', { className: 'dsh-ln-strength', title: 'How far out its review has moved' }, strength(idea.step)),
              ),
            ),
          ),
        ),
        h('p', { className: 'dshu-desc' }, 'The record holds the questions and how each try went. It is kept on this Mac and does not hold what you wrote.'),
      );
    }

    return {
      studyBar: { isSendClick, watchSend },
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('learn', DICT));
        const t = ctx.locale.bind('learn');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'learn', order: 550, label: () => t('section.title') }, (props) => h(SettingsPage, { ...props, appCtx: ctx }))),
        );
        // Above the chat box, under the activity indicator.
        // Before the Activity monitor (order 5): it pulls itself down onto the chat box, over anything between the two.
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'learn', order: 2 }, (props) => h(StudyBar, props))));
      },
    };
  },
});
