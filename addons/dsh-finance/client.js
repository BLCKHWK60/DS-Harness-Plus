/**
 * Finance, browser half: the drop-downs on the Finance tab's start page (subject, market, focus,
 * period), the same selection in the chat box of a Finance conversation once it has started (a
 * change there is that conversation's own), and the Settings > Finance page. The mode, its
 * instructions and its skills are in the server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-finance',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
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
    const PlainNote = dshKit.makeNote(React);
    const { ask: askInPage } = dshKit;

    const NS = 'finance';
    const DICT = { en: { 'section.title': 'Finance' }, zh: { 'section.title': '财经' } };

    const CSS = `
.dsh-fn-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-fn-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-fn-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-fn-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-fn-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-fn-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-rowtext { flex: 1; min-width: 0; }
.dsh-fn-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-fn-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-fn-btn {
  flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-fn-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-fn-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-fn-btn:disabled { opacity: .5; cursor: default; }
.dsh-fn-add { display: flex; gap: 8px; align-items: center; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-field {
  flex: 1; min-width: 0; box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-fn-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-fn-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-fn-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-fn-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-fn-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-fn-field[data-small="true"] { flex: none; width: 150px; }
select.dsh-fn-field { cursor: pointer; flex: none; width: auto; max-width: 240px; }
.dsh-fn-form { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-fn-form .dsh-fn-field { flex: 1 1 200px; }
.dsh-fn-form select.dsh-fn-field, .dsh-fn-form .dsh-fn-field[data-small="true"] { flex: 0 0 auto; }
.dsh-fn-out { margin: 6px 0 0; padding: 8px 10px; border-radius: 10px; font-size: 11px; line-height: 16px; white-space: pre-wrap; overflow-wrap: anywhere; max-height: 180px; overflow: auto; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-fn-area { box-sizing: border-box; width: 100%; min-height: 150px; margin-top: 10px; padding: 10px 14px; border: 0; border-radius: 12px; resize: vertical; font: inherit; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-fn-area:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-fn-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-fn-side { flex: none; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
.dsh-fn-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }

/* The drop-downs on the start page: only while the Finance tab is selected. */
.dsh-fn-bar { display: none; }
html[data-cws-tab="finance"] .dsh-fn-bar {
  position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px;
}
html[data-cws-tab="finance"] [class*='_composerHero']:has(.dsh-fn-bar) { position: relative; }
/* The buttons below move down by the bar's real height, which changes when the bar wraps. */
html[data-cws-tab="finance"] [class*='_composerHero']:has(.dsh-fn-bar) .cws-chips { margin-top: calc(var(--dsh-fn-bar, 70px) + 36px); }
.dsh-fn-pick {
  box-sizing: border-box; height: 36px; padding: 0 12px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base, transparent); cursor: pointer; max-width: 170px;
}
input.dsh-fn-pick { cursor: text; width: 200px; max-width: 200px; }
.dsh-fn-pick:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-fn-hint { flex-basis: 100%; text-align: center; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }

/* The selection in the chat box of a Finance conversation: one pill, a part for each field. */
/* Kept at its own width, like Research's controls: a squeezed pill cannot be read or clicked. */
.dsh-fn-chat { display: inline-flex; align-items: center; gap: 6px; flex: none; }
.dsh-fn-ctls {
  display: inline-flex; align-items: center; flex: none; box-sizing: border-box; height: 28px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px;
  overflow: hidden; font-size: 13px; color: var(--dsw-alias-label-secondary);
}
.dsh-fn-ctls[data-error="true"] { border-color: var(--dsw-alias-state-error-primary); }
.dsh-fn-seg {
  display: inline-flex; align-items: center; gap: 4px; flex: none; box-sizing: border-box; height: 100%; margin: 0; padding: 0 8px; border: 0;
  border-left: 1px solid var(--dsw-alias-border-l1); border-radius: 0; background: transparent; color: inherit; font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap;
}
.dsh-fn-seg:first-child { border-left: 0; padding-left: 10px; }
.dsh-fn-seg:last-child { padding-right: 10px; }
.dsh-fn-seg:disabled { opacity: .5; cursor: default; }
.dsh-fn-seg:focus-visible { outline: 1px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
@media (hover: hover) { button.dsh-fn-seg:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); } }
.dsh-fn-seg .v { min-width: 0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; color: var(--dsw-alias-label-primary); }
.dsh-fn-seg svg { flex: none; }
input.dsh-fn-seg { width: 9em; max-width: 140px; cursor: text; color: var(--dsw-alias-label-primary); }
input.dsh-fn-seg::placeholder { color: var(--dsw-alias-label-secondary); }
/* The chat box's row has room for the pill only in a wide window: all five parts from 1600 pixels,
   the subject and the market from 1280, and none below that (the start page has the selection),
   so the app's own buttons in the row never overlap. */
@media (max-width: 1599px) { .dsh-fn-seg[data-field="kind"], .dsh-fn-seg[data-field="focus"], .dsh-fn-seg[data-field="period"] { display: none; } input.dsh-fn-seg { padding-left: 10px; } .dsh-fn-seg[data-field="market"] { padding-right: 10px; } .dsh-fn-seg .v { max-width: 96px; } input.dsh-fn-seg { width: 7em; } }
@media (max-width: 1279px) { .dsh-fn-chat { display: none; } }
input.dsh-fn-seg:focus { outline: none; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
@container (max-width: 820px) { .dsh-fn-seg .v { max-width: 64px; } input.dsh-fn-seg { width: 6em; } }
.dsh-fn-err { flex: none; font-size: 12px; color: var(--dsw-alias-state-error-primary); white-space: nowrap; }
.dsh-fn-pop {
  position: fixed; z-index: 1000; box-sizing: border-box; width: 300px; max-width: calc(100vw - 24px); max-height: min(420px, 60vh); overflow: auto; padding: 12px 14px;
  border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)));
  color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent);
}
.dsh-fn-pop .title { font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-fn-pop .opts { display: flex; flex-direction: column; gap: 2px; margin: 8px -6px 0; }
.dsh-fn-pop .opts button { display: block; width: 100%; text-align: left; border: 0; border-radius: 10px; padding: 6px 10px; background: transparent; font: inherit; cursor: pointer; color: var(--dsw-alias-label-primary); }
.dsh-fn-pop .opts button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-fn-pop .opts button[aria-current='true'] { background: color-mix(in srgb, var(--dsw-alias-state-business-primary) 14%, transparent); }
.dsh-fn-pop .opts b { display: block; font-size: 13px; line-height: 18px; font-weight: 500; }
.dsh-fn-pop .opts small { display: block; font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-secondary); }
.dsh-fn-pop .note { margin-top: 8px; color: var(--dsw-alias-label-secondary); }
`;

    const SUBJECT_HINTS = {
      company: 'Company, for example NVIDIA',
      sector: 'Sector, for example chip makers',
      economy: 'Economy, for example Japan',
      market: 'Anything to add (optional)',
    };

    async function readData() {
      const response = await fetch(new URL('dsh-finance/data', document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
      if (!response.ok) throw dshKit.fail(`error ${response.status}`);
      return response.json();
    }

    async function post(body) {
      const response = await fetch(new URL('dsh-finance/data', document.baseURI), {
        method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
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

    // The bar and the page show the same settings; a change in one reaches the other.
    const listeners = new Set();
    const tell = () => { for (const listener of listeners) listener(); };

    function useData() {
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      const alive = useRef(true);
      const load = () => readData()
        .then((next) => { if (alive.current) { setData(next); setError(''); } })
        .catch((problem) => { if (alive.current) setError(problem.message); });
      useEffect(() => {
        alive.current = true;
        load();
        listeners.add(load);
        return () => { alive.current = false; listeners.delete(load); };
      }, []);
      return { data, setData, error, alive, load };
    }

    /** The drop-downs under the message box on the Finance tab's start page. */
    function FinanceBar({ appCtx }) {
      const { data, setData, alive } = useData();
      const [draft, setDraft] = useState(null);
      const [failed, setFailed] = useState('');
      const shown = Boolean(data && data.enabled === true);
      // The one options area under the chat box, shared by every mode (Cowork sidebar, 18 November 2026): its place and look.
      const Area = window.__dshOptionsArea;
      if (!shown || !Area) return h('style', null, CSS);
      const selection = data.selection ?? {};
      const save = async (values) => {
        setData((d) => ({ ...d, selection: { ...d.selection, ...values } }));
        try {
          await setSettings(appCtx, values);
          if (alive.current) setFailed('');
          tell();
        } catch (problem) {
          if (alive.current) setFailed(`Could not save the selection: ${problem.message}`);
        }
      };
      const subject = draft ?? selection.subject ?? '';
      const commitSubject = () => {
        if (draft === null) return;
        const next = draft.trim();
        setDraft(null);
        if (next !== (selection.subject ?? '')) void save({ subject: next });
      };
      const select = (label, value, options, onChange) => h('select', { className: 'dsh-opt-pick', 'aria-label': label, title: label, value, onChange: (event) => onChange(event.target.value) },
        options.map((option) => h('option', { key: option.id, value: option.id }, option.label)));
      const markets = (data.markets ?? []).includes(selection.market) ? data.markets : [...(data.markets ?? []), selection.market];
      const summary = selection.kind === 'market'
        ? `The whole market, ${selection.market}`
        : selection.subject ? `${selection.subject}, ${selection.market}` : `No ${selection.kind} chosen yet: name it here or in your message`;

      return h(Area, { mode: 'finance', place: 'start', label: 'What to research' },
        h('style', null, CSS),
        select('Kind of subject', selection.kind, data.kinds ?? [], (kind) => save({ kind })),
        h('input', {
          className: 'dsh-opt-pick', list: 'dsh-fn-watchlist', value: subject, placeholder: SUBJECT_HINTS[selection.kind] ?? 'Subject', 'aria-label': 'Subject', spellCheck: false, autoCorrect: 'off',
          onChange: (event) => setDraft(event.target.value), onBlur: commitSubject, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); },
        }),
        h('datalist', { id: 'dsh-fn-watchlist' }, (data.watchlist ?? []).map((name) => h('option', { key: name, value: name }))),
        select('Market', selection.market, markets.map((market) => ({ id: market, label: market })), (market) => save({ market })),
        select('Focus', selection.focus, data.focuses ?? [], (focus) => save({ focus })),
        select('Period', selection.period, data.periods ?? [], (period) => save({ period })),
        h('div', { className: 'dsh-opt-hint', 'data-error': String(Boolean(failed)) }, failed || (data.adviser === true ? `${summary}. Adviser on.` : `${summary}. Research, not advice.`)));
    }

    /** What the subject box in the chat box shows while it is empty. */
    const SUBJECT_SHORT = { company: 'Company', sector: 'Sector', economy: 'Economy', market: 'Anything to add', brief: 'Subject' };
    const CHAT_NOTE = 'For this conversation only, from the assistant\'s next step. The drop-downs on the start page set where new conversations start.';

    /** One field of the chat box's selection: its value, and a list of the choices when pressed. */
    function ChatDrop({ label, items, value, busy, field, onPick }) {
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      useEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 312)), bottom: window.innerHeight - rect.top + 8 });
        const away = (event) => {
          if (panel.current?.contains(event.target) || button.current?.contains(event.target)) return;
          setOpen(false);
        };
        const key = (event) => {
          if (event.key !== 'Escape') return;
          // Closing the list is not a press towards stopping the turn.
          event.preventDefault();
          setOpen(false);
          button.current?.focus();
        };
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => {
          document.removeEventListener('pointerdown', away, true);
          document.removeEventListener('keydown', key, true);
        };
      }, [open]);
      const chosen = items.find((item) => item.id === value);
      const shown = chosen?.label ?? value ?? '';
      return h(React.Fragment, null,
        h('button', {
          ref: button, type: 'button', className: 'dsh-fn-seg', 'data-field': field ?? '', 'aria-haspopup': 'dialog', 'aria-expanded': open, disabled: busy,
          'aria-label': `${label}: ${shown}`, title: `${label}: ${shown}`, onClick: () => setOpen(!open),
        },
        h('span', { className: 'v' }, shown),
        h('svg', { width: 10, height: 10, viewBox: '0 0 10 10', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: 'M2 6.5 5 3.5 8 6.5' }))),
        open
          ? ReactDOM.createPortal(
              h('div', { ref: panel, className: 'dsh-fn-pop', role: 'dialog', 'aria-label': label, style: { left: place.left, bottom: place.bottom } },
                h('style', null, CSS),
                h('div', { className: 'title' }, label),
                h('div', { className: 'opts', role: 'listbox', 'aria-label': label },
                  items.map((item) => h('button', {
                    key: item.id, type: 'button', role: 'option', 'aria-selected': item.id === value, 'aria-current': String(item.id === value),
                    onClick: () => { setOpen(false); if (item.id !== value) onPick(item.id); },
                  }, h('b', null, item.label), item.about ? h('small', null, item.about) : null))),
                h('div', { className: 'note' }, CHAT_NOTE)),
              document.body,
            )
          : null);
    }

    /**
     * The selection of a Finance conversation in its chat box: kind, subject, market, focus and
     * period. Shown once the conversation has started; before that the start page's drop-downs are
     * the selection. A change is saved as this conversation's own selection and shown at once.
     */
    /** The selection of a started Finance conversation under the chat box, in the one options area every mode shares. */
    function FinanceStrip({ sessionId }) {
      return h(FinanceControls, { sessionId, strip: true });
    }

    function FinanceControls({ sessionId, strip = false }) {
      const [view, setView] = useState(null);
      const [busy, setBusy] = useState(false);
      const [draft, setDraft] = useState(null);
      const [failed, setFailed] = useState('');
      const alive = useRef(true);
      const pending = useRef(0);
      const refresh = useRef(() => {});
      // Escape leaves the subject box without saving what was typed.
      const dropDraft = useRef(false);
      useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
      }, []);
      useEffect(() => {
        let current = true;
        setView(null);
        setDraft(null);
        setFailed('');
        const tick = async () => {
          // Asked less often while Finance is switched off or not answering; the Finance page's
          // switch calls tell(), which asks at once.
          let wait = 15000;
          try {
            if (sessionId) {
              const response = await fetch(new URL(`dsh-finance/data?session=${encodeURIComponent(sessionId)}`, document.baseURI), { cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
              if (response.ok) {
                const next = await response.json();
                // Another tab's conversation only has to notice when it becomes a Finance one.
                const tab = typeof document?.documentElement?.getAttribute === 'function' ? document.documentElement.getAttribute('data-cws-tab') : null;
                wait = next?.enabled === true ? (tab && tab !== 'finance' ? 20000 : 4000) : 30000;
                // While a change is being saved, an older answer must not undo what it shows.
                if (current && pending.current === 0) setView(next);
              }
            }
          } catch {
            /* tried again shortly */
          }
          return wait;
        };
        // One look at a time; tell() (a switch on the Finance page) looks at once; none while the window is hidden.
        const watcher = dshPoll.loop(tick, { every: 4000 });
        const now = () => watcher.poke();
        refresh.current = now;
        listeners.add(now);
        return () => { current = false; watcher.stop(); listeners.delete(now); };
      }, [sessionId]);
      if (!sessionId || !view || view.enabled !== true || view.session?.shown !== true || view.session.id !== sessionId) return null;
      // With the Cowork sidebar the selected tab is the conversation's mode, known at once: another tab never shows this.
      const tab = typeof document?.documentElement?.getAttribute === 'function' ? document.documentElement.getAttribute('data-cws-tab') : null;
      if (tab && tab !== 'finance') return null;
      const selection = view.session.selection ?? {};
      const pick = async (values) => {
        pending.current += 1;
        setBusy(true);
        setView((v) => ({ ...v, session: { ...v.session, selection: { ...v.session.selection, ...values } } }));
        try {
          const next = await post({ action: 'pin', sessionId, values });
          if (!alive.current) return;
          if (next?.session?.id === sessionId) setView(next);
          setFailed('');
          tell();
        } catch (problem) {
          if (!alive.current) return;
          setFailed(problem.message);
          // The re-read shows what is saved; the mark goes after a while.
          void refresh.current();
          setTimeout(() => { if (alive.current) setFailed((now) => (now === problem.message ? '' : now)); }, 8000);
        } finally {
          pending.current -= 1;
          if (alive.current) setBusy(false);
        }
      };
      const subject = draft ?? selection.subject ?? '';
      const commitSubject = () => {
        const dropped = dropDraft.current;
        dropDraft.current = false;
        if (draft === null || dropped) return;
        const next = draft.trim();
        setDraft(null);
        if (next !== (selection.subject ?? '')) void pick({ subject: next });
      };
      const listId = `dsh-fn-chat-list-${String(sessionId).replace(/[^A-Za-z0-9_-]/g, '')}`;
      const kinds = [...(view.kinds ?? []), ...(selection.kind === 'brief' ? [{ id: 'brief', label: 'Scheduled brief' }] : [])];
      const markets = ((view.markets ?? []).includes(selection.market) ? view.markets : [...(view.markets ?? []), selection.market]).map((market) => ({ id: market, label: market }));
      const field = (label, items, value, key) => h(ChatDrop, { label, items, value, busy, field: key, onPick: (id) => void pick({ [key]: id }) });
      // Under the chat box (the one options area every mode shares): the same fields and look as the start page, for
      // this conversation's own selection. A change counts from the assistant's next step, as in the chat box before.
      const Area = strip ? window.__dshOptionsArea : null;
      if (strip) {
        if (!Area) return null;
        const select = (label, value, items, key) => h('select', { className: 'dsh-opt-pick', 'aria-label': label, title: `${label}. ${CHAT_NOTE}`, value, disabled: busy, 'data-field': key, onChange: (event) => void pick({ [key]: event.target.value }) },
          items.map((item) => h('option', { key: item.id, value: item.id }, item.label)));
        return h(Area, { mode: 'finance', place: 'chat', label: 'What this Finance conversation is about' },
          select('Kind of subject', selection.kind, kinds, 'kind'),
          h('input', {
            className: 'dsh-opt-pick', list: listId, value: subject, placeholder: SUBJECT_SHORT[selection.kind] ?? 'Subject', disabled: busy,
            'aria-label': 'Subject', title: `Subject. ${CHAT_NOTE}`, spellCheck: false, autoCorrect: 'off', maxLength: 80,
            onChange: (event) => setDraft(event.target.value), onBlur: commitSubject,
            onKeyDown: (event) => {
              if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.target.blur(); }
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dropDraft.current = true; setDraft(null); event.target.blur(); }
            },
          }),
          h('datalist', { id: listId }, (view.watchlist ?? []).map((name) => h('option', { key: name, value: name }))),
          select('Market', selection.market, markets, 'market'),
          select('Focus', selection.focus, view.focuses ?? [], 'focus'),
          select('Period', selection.period, view.periods ?? [], 'period'),
          h('div', { className: 'dsh-opt-hint', 'data-error': String(Boolean(failed)) }, failed || 'For this conversation: a change counts from the next answer. The start page sets where new conversations start.'),
          // The adviser is asked to end every answer with this line, but the app gives no way to add text to an answer, so the label is always here too.
          view.adviser === true ? h('div', { className: 'dsh-opt-hint', 'data-dsh-adviser-label': 'true' }, 'Adviser on. AI output, not regulated advice.') : null);
      }
      return h('span', { className: 'dsh-fn-chat' },
        h('style', null, CSS),
        h('span', { className: 'dsh-fn-ctls', role: 'group', 'aria-label': 'What this Finance conversation is about', 'data-error': String(Boolean(failed)) },
          field('Kind of subject', kinds, selection.kind, 'kind'),
          h('input', {
            className: 'dsh-fn-seg', list: listId, value: subject, placeholder: SUBJECT_SHORT[selection.kind] ?? 'Subject', disabled: busy,
            'aria-label': 'Subject', title: subject ? `Subject: ${subject}. ${CHAT_NOTE}` : `Subject: none yet. ${CHAT_NOTE}`, spellCheck: false, autoCorrect: 'off', maxLength: 80,
            onChange: (event) => setDraft(event.target.value), onBlur: commitSubject,
            onKeyDown: (event) => {
              // Neither key reaches the chat box: Enter does not send, Escape does not count towards stopping a turn.
              if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); event.target.blur(); }
              if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dropDraft.current = true; setDraft(null); event.target.blur(); }
            },
          }),
          h('datalist', { id: listId }, (view.watchlist ?? []).map((name) => h('option', { key: name, value: name }))),
          field('Market', markets, selection.market, 'market'),
          field('Focus', view.focuses ?? [], selection.focus, 'focus'),
          field('Period', view.periods ?? [], selection.period, 'period')),
        failed ? h('span', { className: 'dsh-fn-err', role: 'status', title: failed }, 'Not saved') : null);
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-fn-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    /** A list of names with an add box: the watchlist, and your own markets. */
    function NameList({ items, placeholder, label, empty, busy, onChange }) {
      const [text, setText] = useState('');
      const add = () => {
        const name = text.trim();
        if (!name) return;
        setText('');
        if (!items.some((other) => other.toLowerCase() === name.toLowerCase())) onChange([...items, name]);
      };
      return h(React.Fragment, null,
        items.length === 0 ? h('p', { className: 'dsh-fn-desc' }, empty) : null,
        items.map((name) => h('div', { key: name, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' }, h('div', { className: 'dsh-fn-rowtitle' }, name)),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: () => onChange(items.filter((other) => other !== name)) }, 'Remove'))),
        h('div', { className: 'dsh-fn-add' },
          h('input', { className: 'dsh-fn-field', value: text, placeholder, 'aria-label': label, spellCheck: false, onChange: (event) => setText(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter') add(); } }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !text.trim(), onClick: add }, 'Add')));
    }

    const KEY_PLACES = [
      { id: 'query', label: 'Key goes in the address' },
      { id: 'header', label: 'Key goes in a header' },
      { id: 'bearer', label: 'Key is a bearer token' },
      { id: 'none', label: 'No key needed' },
    ];

    /** One data source: its key, a try-out, on and off, remove. */
    function SourceRow({ source, busy, onKey, onForget, onToggle, onRemove, onTry }) {
      const [key, setKey] = useState('');
      const [path, setPath] = useState('');
      const [out, setOut] = useState('');
      const api = source.kind === 'api';
      const needsKey = api && source.keyIn !== 'none';
      const status = !api ? 'A connector: its tools are already available to the assistant. This note tells it what they are good for.'
        : !needsKey ? source.baseUrl
          : source.keySet ? `${source.baseUrl} · key saved${source.keyShown ? ` (${source.keyShown})` : ''}` : `${source.baseUrl} · no key yet, so the assistant cannot use it`;
      return h('div', { style: { borderBottom: '0.5px solid var(--dsw-alias-border-l1)', padding: '14px 0' } },
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 16 } },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, source.name),
            h('div', { className: 'dsh-fn-rowdesc' }, status),
            source.about ? h('div', { className: 'dsh-fn-rowdesc' }, source.about) : null),
          h('div', { className: 'dsh-fn-side' },
            h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: onRemove }, 'Remove'),
            h(Switch, { on: source.on, label: `Use ${source.name}`, onChange: onToggle }))),
        needsKey ? h('div', { className: 'dsh-fn-form', style: { borderBottom: 0, paddingBottom: 0 } },
          h('input', { className: 'dsh-fn-field', type: 'password', value: key, placeholder: source.keySet ? 'Paste a new key to replace the saved one' : 'Paste your key', 'aria-label': `Key for ${source.name}`, autoComplete: 'off', spellCheck: false, onChange: (event) => setKey(event.target.value) }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !key.trim(), onClick: async () => { if (await onKey(key.trim())) setKey(''); } }, 'Save key'),
          source.keySet ? h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: onForget }, 'Forget key') : null) : null,
        api && (!needsKey || source.keySet) ? h('div', { className: 'dsh-fn-form', style: { borderBottom: 0, paddingBottom: 0 } },
          h('input', { className: 'dsh-fn-field', value: path, placeholder: 'A path to try, for example quote?symbol=AAPL', 'aria-label': `Path to try on ${source.name}`, spellCheck: false, onChange: (event) => setPath(event.target.value), onKeyDown: (event) => { if (event.key === 'Enter' && path.trim()) void onTry(path.trim()).then(setOut); } }),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !path.trim(), onClick: () => void onTry(path.trim()).then(setOut) }, 'Try')) : null,
        out ? h('div', { className: 'dsh-fn-out' }, out) : null);
    }

    /** Add a source: a known service, any other web service, or a note about a connector. */
    function AddSource({ presets, taken, busy, onAdd }) {
      const [kind, setKind] = useState('');
      const [form, setForm] = useState({ name: '', baseUrl: '', keyIn: 'query', keyName: '', about: '', docs: '' });
      const set = (key) => (event) => setForm((value) => ({ ...value, [key]: event.target.value }));
      const free = presets.filter((preset) => !taken.includes(preset.id));
      const field = (key, placeholder, small) => h('input', { className: 'dsh-fn-field', 'data-small': String(small === true), value: form[key], placeholder, 'aria-label': placeholder, spellCheck: false, autoCapitalize: 'off', onChange: set(key) });
      const add = async () => {
        const preset = presets.find((item) => item.id === kind);
        const source = preset ? { ...preset, kind: 'api', on: true }
          : kind === 'connector' ? { kind: 'connector', name: form.name.trim(), about: form.about.trim(), on: true }
            : { kind: 'api', name: form.name.trim(), baseUrl: form.baseUrl.trim(), keyIn: form.keyIn, keyName: form.keyName.trim(), about: form.about.trim(), docs: form.docs.trim(), on: true };
        if (await onAdd(source)) { setKind(''); setForm({ name: '', baseUrl: '', keyIn: 'query', keyName: '', about: '', docs: '' }); }
      };
      const custom = kind === 'other';
      const ready = kind && (presets.some((item) => item.id === kind) || (form.name.trim() && (kind === 'connector' || form.baseUrl.trim())));
      return h('div', { className: 'dsh-fn-form' },
        h('select', { className: 'dsh-fn-field', value: kind, 'aria-label': 'Kind of source to add', onChange: (event) => setKind(event.target.value) },
          h('option', { value: '' }, 'Add a source…'),
          free.map((preset) => h('option', { key: preset.id, value: preset.id }, preset.name)),
          h('option', { value: 'other' }, 'Another web service'),
          h('option', { value: 'connector' }, 'A connector I added')),
        custom || kind === 'connector' ? field('name', kind === 'connector' ? 'The connector\'s name' : 'Name') : null,
        custom ? field('baseUrl', 'Address, for example https://api.example.com/v1') : null,
        custom ? h('select', { className: 'dsh-fn-field', value: form.keyIn, 'aria-label': 'Where the key goes', onChange: set('keyIn') }, KEY_PLACES.map((place) => h('option', { key: place.id, value: place.id }, place.label))) : null,
        custom && (form.keyIn === 'query' || form.keyIn === 'header') ? field('keyName', form.keyIn === 'query' ? 'The key\'s name, for example apikey' : 'The header\'s name, for example X-API-Key', true) : null,
        custom || kind === 'connector' ? field('about', 'What it is good for, in one line (the assistant reads this)') : null,
        custom ? field('docs', 'Address of its documentation (optional)') : null,
        kind ? h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !ready, onClick: add }, 'Add') : null);
    }

    /** Schedule a brief: what about, how often, at what hour. */
    function AddBrief({ watchlist, rhythms, busy, onAdd }) {
      const [subject, setSubject] = useState('');
      const [rhythm, setRhythm] = useState('weekdays');
      const [hour, setHour] = useState('8');
      return h('div', { className: 'dsh-fn-form' },
        h('input', { className: 'dsh-fn-field', list: 'dsh-fn-brief-list', value: subject, placeholder: 'What about, for example NVIDIA', 'aria-label': 'Subject of the brief', spellCheck: false, onChange: (event) => setSubject(event.target.value) }),
        h('datalist', { id: 'dsh-fn-brief-list' }, watchlist.map((name) => h('option', { key: name, value: name }))),
        h('select', { className: 'dsh-fn-field', value: rhythm, 'aria-label': 'How often', onChange: (event) => setRhythm(event.target.value) }, rhythms.map((item) => h('option', { key: item.id, value: item.id }, item.label))),
        h('select', { className: 'dsh-fn-field', value: hour, 'aria-label': 'At what hour', onChange: (event) => setHour(event.target.value) }, Array.from({ length: 24 }, (_, value) => h('option', { key: value, value: String(value) }, `at ${String(value).padStart(2, '0')}:00`))),
        h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !subject.trim(), onClick: async () => { if (await onAdd(subject.trim(), rhythm, Number(hour))) setSubject(''); } }, 'Schedule'));
    }

    const PROFILE_MAX = 8000;
    const PROFILE_HINT = 'For example:\nGoals: retire at 60; a house deposit in 4 years.\nTime frame: most money 15+ years; the deposit 4 years.\nRisk: can sit through a 30% fall on the long-term part; none on the deposit.\nHoldings: 60% world index fund, 15% NVDA, 10% cash…\nLimits: no tobacco; no single share above 10%.\nTax and accounts: …';

    /** The profile the adviser reads. The user writes it; the assistant may add dated lines. */
    function Profile({ text, busy, onSave }) {
      const [draft, setDraft] = useState(text);
      const [seen, setSeen] = useState(text);
      // A line the assistant added shows up, unless the user is in the middle of typing.
      if (text !== seen) {
        if (draft === seen) setDraft(text);
        setSeen(text);
      }
      const dirty = draft.trim() !== text.trim();
      return h('div', null,
        h('textarea', { className: 'dsh-fn-area', value: draft, maxLength: PROFILE_MAX, placeholder: PROFILE_HINT, 'aria-label': 'Your profile', spellCheck: true, onChange: (event) => setDraft(event.target.value) }),
        h('div', { className: 'dsh-fn-foot' },
          h('span', null, `${draft.length} of ${PROFILE_MAX} characters${dirty ? ' · not saved' : ''}`),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || !dirty, onClick: () => onSave(draft) }, 'Save profile')));
    }

    /** What the user reads, and the words they type, before the adviser can be switched on. */
    const ADVISER_PHRASE = 'I understand';
    const ADVISER_WARNING = [
      'The adviser is an AI model, not a person, and not a licensed or regulated financial adviser. It can be wrong, out of date or overconfident, and it works only from what it could fetch and what you tell it.',
      'Its buy, sell and hold calls are not personal financial advice. Money you invest can be lost. Check anything important with a qualified professional before you act.',
      'Your profile, and what you ask, is sent to the model you use.',
      `To switch the adviser on, type "${ADVISER_PHRASE}". You are asked only once.`,
    ];

    function FinancePage({ appCtx }) {
      const { data, setData, error, alive, load } = useData();
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [warn, setWarn] = useState(false);
      const [typed, setTyped] = useState('');

      if (!data) {
        return h('div', { className: 'dsh-fn-page' }, h('style', null, CSS), h('h2', { className: 'dsh-fn-title' }, 'Finance'), h('p', { className: 'dsh-fn-desc', 'data-error': String(Boolean(error)) }, error ? `Could not load: ${error}` : 'Loading…'));
      }
      const save = async (values, done = 'Saved.') => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((d) => ({ ...d, ...values }));
          setNote({ text: done, error: false });
          tell();
          // The tab is added or removed a moment later; read back whether that worked.
          setTimeout(() => { if (alive.current) load(); }, 1500);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };

      const sources = Array.isArray(data.sources) ? data.sources : [];
      // What is saved: the description only. Whether a key is saved is the server's to say.
      const stored = (list) => list.map(({ keySet, keyShown, ...source }) => source);
      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await post(body);
          if (!alive.current) return undefined;
          setData(next);
          if (done) setNote({ text: done, error: false });
          tell();
          return next;
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, details: problem.details ?? '', error: true });
          return undefined;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const saveSources = async (list, done) => {
        setBusy(true);
        try {
          await setSettings(appCtx, { sources: JSON.stringify(stored(list)) });
          if (!alive.current) return false;
          setNote({ text: done, error: false });
          await load();
          tell();
          return true;
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
          return false;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const addSource = async (source) => {
        const id = String(source.id ?? source.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        if (!id) { setNote({ text: 'Give the source a name.', error: true }); return false; }
        if (sources.some((other) => other.id === id)) { setNote({ text: 'There is already a source with that name.', error: true }); return false; }
        if (source.kind === 'api') {
          try {
            await post({ action: 'check', baseUrl: source.baseUrl });
          } catch (problem) {
            setNote({ text: problem.message, details: problem.details ?? '', error: true });
            return false;
          }
        }
        return saveSources([...sources, { ...source, id }], source.kind === 'api' && source.keyIn !== 'none' ? 'Added. Now paste its key.' : 'Added.');
      };
      const removeSource = async (source) => {
        if (!(await askInPage({ text: `Remove "${source.name}" from Finance?${source.keySet ? '\n\nIts saved key is forgotten too.' : ''}`, ok: 'Remove', danger: true }))) return;
        if (await saveSources(sources.filter((other) => other.id !== source.id), 'Removed.') && source.kind === 'api') await act({ action: 'forget', id: source.id });
      };
      const trySource = async (source, typed) => {
        const [path, search = ''] = typed.split('?');
        const next = await act({ action: 'test', id: source.id, path, query: Object.fromEntries(new URLSearchParams(search)) });
        return next?.tested ?? '';
      };
      const briefs = Array.isArray(data.briefs) ? data.briefs : [];
      const ownTasks = Array.isArray(data.ownTasks) ? data.ownTasks : [];
      // Marks of tasks that no longer exist are dropped whenever the list is saved.
      const markTask = async (task, on) => {
        const next = ownTasks.map((other) => (other.id === task.id ? { ...other, finance: on } : other));
        await saveMarks(next, task, on);
        if (alive.current) setData((d) => ({ ...d, ownTasks: next }));
      };
      const saveMarks = (next, task, on) => save({ financeTasks: next.filter((other) => other.finance).map((other) => other.id) }, on ? `"${task.title}" will run in Finance from its next run.` : `"${task.title}" will run in Cowork again from its next run.`);

      return h('div', { className: 'dsh-fn-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-fn-title' }, 'Finance'),
        h('p', { className: 'dsh-fn-desc' }, `A fourth tab, beside Chat, Cowork and Code, for researching companies, markets and economies. The assistant puts the reported figures next to what the news says and what people are saying, looks ahead, and gives both sides. ${data.adviser === true ? 'The adviser is on: it ends with a recommendation.' : 'It is research, not advice.'}`),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,
        data.problem ? h('p', { className: 'dsh-fn-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-fn-group' }, 'The tab'),
        h('div', { className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, 'Show the Finance tab'),
            h('div', { className: 'dsh-fn-rowdesc' }, 'On adds the tab, its drop-downs, its instructions and its skills. Off takes all of them away; your watchlist is kept.')),
          h(Switch, { on: data.enabled === true, label: 'Show the Finance tab', onChange: (on) => save({ enabled: on }, on ? 'Switched on. The Finance tab appears in the sidebar in a moment.' : 'Switched off. The Finance tab is taken away in a moment.') })),
        h('div', { className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, 'Selection in the chat box'),
            h('div', { className: 'dsh-fn-rowdesc' }, 'Once a Finance conversation has started, its chat box shows what it is about: kind, subject, market, focus and period. Change them there for that conversation only; it applies from the assistant\'s next step, even in a reply that is still running. The drop-downs on the start page set where new conversations start.'))),

        h('div', { className: 'dsh-fn-group' }, 'Adviser'),
        h('div', { className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, 'Act as my financial adviser'),
            h('div', { className: 'dsh-fn-rowdesc' }, 'On: the assistant researches as an adviser would and ends with a clear call (buy, add, hold, trim, sell, avoid or wait) fitted to your profile. Every answer ends with the line "AI output, not regulated advice." Off: research only, and it does not say buy, sell or hold. Applies from your next message.')),
          h(Switch, {
            on: data.adviser === true,
            label: 'Act as my financial adviser',
            onChange: (on) => {
              if (!on) {
                setWarn(false);
                void save({ adviser: false }, 'Adviser off. Finance is research only again.');
              } else if (data.adviserAccepted === true) {
                void save({ adviser: true }, 'Adviser on. It applies from your next message in a Finance conversation.');
              } else {
                // First time: nothing is switched on until the warning has been accepted by typing.
                setTyped('');
                setWarn(true);
              }
            },
          })),
        warn && data.adviser !== true ? h('div', { className: 'dsh-fn-row', role: 'alertdialog', 'aria-label': 'Before you switch the adviser on' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, 'Read this before you switch the adviser on'),
            h('div', { className: 'dsh-fn-rowdesc' }, ADVISER_WARNING.map((line) => h('p', { key: line, className: 'dsh-fn-desc' }, line))),
            h('div', { className: 'dsh-fn-add' },
              h('input', { className: 'dsh-fn-field', value: typed, placeholder: `Type: ${ADVISER_PHRASE}`, 'aria-label': `Type "${ADVISER_PHRASE}" to accept`, spellCheck: false, autoComplete: 'off', onChange: (event) => setTyped(event.target.value) }),
              h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy || typed.trim().toLowerCase() !== ADVISER_PHRASE.toLowerCase(), onClick: () => { setWarn(false); void save({ adviserAccepted: true, adviser: true }, 'Adviser on. It applies from your next message in a Finance conversation.'); } }, 'Accept and switch on'),
              h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: () => setWarn(false) }, 'Cancel')))) : null,
        data.adviser === true ? h('div', null,
          h('p', { className: 'dsh-fn-desc' }, 'Your profile: what an adviser needs to know about you. It is read in every Finance conversation. You can write it here, and the assistant adds a dated line when you tell it something lasting. It is kept in one file on this Mac and is sent to your model with each Finance message. Leave out account numbers.'),
          h(Profile, { text: typeof data.profile === 'string' ? data.profile : '', busy, onSave: (text) => act({ action: 'profile', text }, 'Profile saved.') })) : null,

        h('div', { className: 'dsh-fn-group' }, 'Watchlist'),
        h('p', { className: 'dsh-fn-desc' }, 'Companies, sectors or economies you follow. They are offered when you type in the subject box on the Finance tab.'),
        h(NameList, { items: data.watchlist ?? [], placeholder: 'A name, for example NVIDIA', label: 'Add to the watchlist', empty: 'Nothing on the watchlist yet.', busy, onChange: (watchlist) => save({ watchlist }) }),

        h('div', { className: 'dsh-fn-group' }, 'Your own markets'),
        h('p', { className: 'dsh-fn-desc' }, `The Market drop-down offers: ${(data.markets ?? []).filter((market) => !(data.moreMarkets ?? []).includes(market)).join(', ')}. Add others here.`),
        h(NameList, { items: data.moreMarkets ?? [], placeholder: 'A market, for example Mexico', label: 'Add a market', empty: 'No market of your own yet.', busy, onChange: (moreMarkets) => save({ moreMarkets }) }),

        h('div', { className: 'dsh-fn-group' }, 'Data sources'),
        h('p', { className: 'dsh-fn-desc' }, 'Built in, with no key: reported company figures and filings from the US securities regulator, yearly economy readings from the World Bank, daily share prices from Yahoo Finance, news from GDELT, and social posts from Hacker News, Mastodon and Lemmy. Add your own below, for estimates, forecasts, news with sentiment or anything else a data service offers. The assistant can only read from a source, never send or change anything, and only at that source\'s own address.'),
        sources.map((source) => h(SourceRow, {
          key: source.id, source, busy,
          onKey: (value) => act({ action: 'key', id: source.id, value }, 'Key saved in the app\'s secret store.').then(Boolean),
          onForget: () => act({ action: 'forget', id: source.id }, 'Key forgotten.'),
          onToggle: (on) => saveSources(sources.map((other) => (other.id === source.id ? { ...other, on } : other)), on ? 'Switched on.' : 'Switched off.'),
          onRemove: () => removeSource(source),
          onTry: (typed) => trySource(source, typed),
        })),
        h(AddSource, { presets: data.presets ?? [], taken: sources.map((source) => source.id), busy, onAdd: addSource }),

        h('div', { className: 'dsh-fn-group' }, 'Scheduled briefs'),
        h('p', { className: 'dsh-fn-desc' }, 'A short update on something you follow, written by itself on a schedule: what changed, what to watch next, with sources. It runs as a task in the app\'s own scheduler, in a new conversation each time. The conversation appears under the Finance tab, and the run shows on the Automation runs page.'),
        briefs.length === 0 ? h('p', { className: 'dsh-fn-desc' }, 'No brief is scheduled.') : null,
        briefs.map((brief) => h('div', { key: brief.id, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, brief.subject),
            h('div', { className: 'dsh-fn-rowdesc' }, brief.status === 'paused' ? 'Paused in Automation tasks' : brief.nextAt ? `Next: ${new Date(brief.nextAt).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : '')),
          h('button', { type: 'button', className: 'dsh-fn-btn', disabled: busy, onClick: () => { void askInPage({ text: `Stop the brief on "${brief.subject}"?`, ok: 'Stop the brief', danger: true }).then((yes) => { if (yes) void act({ action: 'unbrief', id: brief.id }, 'Brief removed.'); }); } }, 'Remove'))),
        h(AddBrief, { watchlist: data.watchlist ?? [], rhythms: data.rhythms ?? [], busy, onAdd: (subject, rhythm, hour) => act({ action: 'brief', subject, rhythm, hour }, 'Scheduled. You can change or pause it on the Automation tasks page.').then(Boolean) }),

        h('div', { className: 'dsh-fn-group' }, 'Your own scheduled tasks'),
        h('p', { className: 'dsh-fn-desc' }, 'Tasks you made yourself on the Automation tasks page start in Cowork. Switch one on here and its conversations open in Finance instead: they appear under the Finance tab and the assistant follows the Finance method.'),
        ownTasks.length === 0 ? h('p', { className: 'dsh-fn-desc' }, 'You have no scheduled tasks of your own.') : null,
        ownTasks.map((task) => h('div', { key: task.id, className: 'dsh-fn-row' },
          h('div', { className: 'dsh-fn-rowtext' },
            h('div', { className: 'dsh-fn-rowtitle' }, task.title),
            h('div', { className: 'dsh-fn-rowdesc' }, `${task.finance ? 'Runs in Finance' : 'Runs in Cowork'}${task.status === 'paused' ? ' · paused' : ''}`)),
          h(Switch, { on: task.finance, label: `Run "${task.title}" in Finance`, onChange: (on) => markTask(task, on) }))),

        h('div', { className: 'dsh-fn-group' }, 'What the assistant is given'),
        h('ul', { className: 'dsh-fn-list' },
          h('li', null, `A method: figures only from sources it fetched, each with its date; facts, claims, opinions and its own reading kept apart; always a look ahead; always both sides; what it could not find; ${data.adviser === true ? 'then a clear recommendation, ending with a note that it is AI output, not regulated advice' : 'no buy or sell advice'}.`),
          h('li', null, 'Your selection from the drop-downs, as it was when the conversation started, or as you changed it since in that conversation\'s chat box.'),
          h('li', null, 'Six data tools that need no key or account: a company\'s reported figures and its filings, from the US securities regulator (US-listed companies and many foreign ones); yearly readings for economies from the World Bank; share prices from Yahoo Finance; news from GDELT; and posts from Hacker News, Mastodon and Lemmy.'),
          h('li', null, `${(data.skills ?? []).length} skills, one for each common task: ${(data.skills ?? []).map((skill) => skill.name.replace(/^finance-/, '').replace(/-/g, ' ')).join(', ')}.`)),

        h('div', { className: 'dsh-fn-group' }, 'Good to know'),
        h('ul', { className: 'dsh-fn-list' },
          h('li', null, data.adviser === true
            ? 'The adviser is on, so the assistant recommends, and ends each answer with "AI output, not regulated advice." It is an AI model working from what it could fetch: it is not a licensed financial adviser and it can be wrong. Decisions are yours.'
            : 'It is research, not advice. The assistant is not a licensed financial adviser, and it is told not to say buy, sell or hold. Decisions are yours. The Adviser switch above changes this.'),
          h('li', null, 'Its own data covers reported company figures, yearly economy readings, daily share prices, news and social posts. It has no estimates and no forecasts: those, and the figures of companies that do not file in the United States, come from what the assistant finds with web search and Deep research, which can be delayed or misread. Each figure should come with its source and date so you can check it.'),
          h('li', null, 'When the assistant uses the data tools, what it looks up is sent to that tool\'s public service: the company or country to the US regulator or the World Bank, share symbols to Yahoo Finance, news search words to GDELT, and social search words or a hashtag to Hacker News (through Algolia), mastodon.social and lemmy.world. No account, no key and nothing about you is sent.'),
          h('li', null, 'With Tools off in a conversation (the Tools button in the chat box), the assistant has no data tools and cannot check a figure. It may still give figures from memory, but it is told to mark each one as from memory and possibly out of date, to say which period it is for when it knows, and never to give it a source or an "as of" date.'),
          h('li', null, 'What people say online is a signal, not a fact, and can be manipulated.'),
          h('li', null, 'Charts come from the Diagram builder, and your own reports can be searched if they are in the Library.'),
          h('li', null, 'A key you paste is kept in the app\'s own secret store on this Mac, not in a settings file. It is sent only to that service, and it is removed from anything the assistant is shown.'),
          h('li', null, 'A scheduled brief runs only while the app is running. It uses your models and counts against the Budget guard like any task.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'finance', order: 111, label: () => t('section.title') }, (props) => h(FinancePage, { ...props, appCtx: ctx }))),
        );
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'finance-bar', order: 40 }, () => h(FinanceBar, { appCtx: ctx }))));
        // After the mode and Web controls of the Modes add-on (orders -22 and -21).
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'finance-selection', order: -19, label: () => 'Finance selection' }, (props) => h(FinanceControls, { ...props, appCtx: ctx }))));
        // The same selection as a strip right above the chat box, under the place chip (order -50), in Finance only.
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'finance-strip', order: -40 }, (props) => h(FinanceStrip, { sessionId: props?.sessionId }))));
      },
    };
  },
});
