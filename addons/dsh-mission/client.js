/**
 * Mission, browser half: the Settings > Mission page, the status strip above the chat box, Start Mission and
 * the main button beside Send, and the Mission settings card. The Settings page has the switch, the mode that
 * `/mission on` uses, the models for the three roles of a run (for every project, and per
 * project), and a run's limits. Everything else happens through the `/mission` command.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-mission',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
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

    const NS = 'mission';
    /** Recon's room (emptied at every start; a folder named so in the temporary folder), as dsh-search's ROOM_NAME. */
    const RECON_ROOM_PATH = /^\/(?:private\/)?tmp\/dsh-recon-[^/]*\/?$|^\/(?:private\/)?var\/folders\/[^/]+\/[^/]+\/T\/dsh-recon-[^/]*\/?$/i;
    const DICT = { en: { 'section.title': 'Mission' } };
    const MODES = [
      { id: 'restricted', label: 'Restricted', text: 'Nothing outside the thread\'s folder is read or changed, and you are never asked for it. Inside, the assistant creates new files freely and asks you once per existing file before changing it.' },
      { id: 'ask', label: 'Ask', text: 'The same inside the folder. When it needs to read or change something outside, it has to ask you first.' },
      { id: 'auto', label: 'Auto', text: 'Inside the folder it works without asking. For anything outside the folder it must still ask you.' },
    ];

    const ROLES = [
      { id: 'plan', label: 'Planner', text: 'Reads the project and writes the checklist. Also takes over an item that two tries did not finish.' },
      { id: 'implement', label: 'Workers', text: 'Do the checklist items, several at once when Helpers at once is more than 1.' },
      { id: 'review', label: 'Reviewer', text: 'Reads the changes against the goal at the end.' },
    ];
    const LIMITS = [
      { id: 'maxItems', label: 'Checklist items', text: 'Most items a plan may have.', fallback: 12, min: 1, max: 30 },
      { id: 'maxTries', label: 'Tries per item', text: 'The last try goes to the planner\'s model.', fallback: 3, min: 1, max: 8 },
      // maxReviews and maxSteps left the page (stage B): Missions use laps and steps now. Their keys stay for old settings files.
      // waitMinutes left the page (owner's point 17): "Wait for me" under Mission defaults took its place. The key stays on the
      // server for old runs, Tool access and the migration (its old default 3 becomes 30 minutes).
    ];
    const LONG_FIELDS = [
      { id: 'longMinutes', kind: 'number', label: 'Time limit', text: 'Minutes a Mission may take. 0: no time limit, it runs until its checklist is done. With a limit it stops between steps, so it can go over by the step under way.', fallback: 120, min: 0, max: 720, info: { what: 'How long a Mission may work, in minutes.', when: '0: no time limit, it runs until its checklist is done. Set a time when you need it back by then.', change: 'The starting value of each thread\'s Mission settings; a thread\'s own choice (Depth → Mission settings…) wins.' } },
      { id: 'longLaps', kind: 'number', label: 'Laps', text: 'Most laps. A lap is work on the open items, the overall commands and a review. 0: no lap limit.', fallback: 10, min: 0, max: 50, info: { what: 'Most rounds of work, checks and review.', change: '0: no lap limit. A thread\'s own choice (Depth → Mission settings…) wins.' } },
      { id: 'longHelpers', kind: 'number', label: 'Helpers at once', text: 'How many helpers work on the checklist at the same time. 1 works on one item at a time.', fallback: 4, min: 1, max: 8, info: { what: 'How many checklist items are worked on at the same time.', when: 'Lower it for a slow Mac or a model server that takes one request at a time.', change: 'From 1 to 8; 4 unless you change it. Never more than Calls at once allows for your model server, and one at a time in a folder without checkpoints. Helpers never change the same file at once. A thread\'s own choice (Depth → Mission settings…) wins.' } },
      // Point 17: what a new Mission does when it needs you, and how long it waits. The choices and words live in the
      // mission-strip block (read when drawn, so the block may come later in this file).
      { id: 'longNeeds', kind: 'select', label: 'When it needs you', text: 'What a new Mission does when it has a question for you or needs your yes. Ask, keep working unless you change it.', info: () => INFO.needsSettings, choices: () => NEEDS_CHOICES.map((choice) => ({ value: choice.id, label: choice.label })), shown: (data) => readNeedsShown(data?.longNeeds), read: (value) => readNeedsShown(value) },
      { id: 'longWaitAsk', kind: 'select', label: 'Wait for me (Ask, keep working)', text: 'How long it waits when only your answers can move it on, then it ends with its report. 30 minutes unless you change it.', info: () => INFO.waitSettings, choices: (data) => waitOptions(waitAskShown(data?.longWaitAsk, data?.waitMinutes)), shown: (data) => waitAskShown(data?.longWaitAsk, data?.waitMinutes), read: Number },
      { id: 'longWaitHold', kind: 'select', label: 'Wait for me (Ask and wait)', text: 'The same for Ask and wait. Until I answer unless you change it.', info: () => INFO.waitSettings, choices: (data) => waitOptions(readWaitShown(data?.longWaitHold) ?? 0), shown: (data) => readWaitShown(data?.longWaitHold) ?? 0, read: Number },
      // Stage E (point 8): what the conversation's own assistant may do while its Mission is on (working, waiting or paused).
      { id: 'longAssistant', kind: 'select', label: 'While a Mission runs, the assistant can', text: 'What a thread\'s assistant may do while its Mission works, waits or is paused. Talk and look things up unless you change it.', info: () => INFO.assistantSettings, choices: () => ASSISTANT_CHOICES.map((choice) => ({ value: choice.id, label: choice.label })), shown: (data) => readAssistantShown(data?.longAssistant), read: (value) => readAssistantShown(value) },
      // Stage E (point 9): a working Mission carries on by itself after an app restart.
      { id: 'longCarryOn', kind: 'switch', label: 'Carry on by itself after a restart', text: 'After the app restarts, a Mission that was working carries on by itself. Off: it comes back paused.', fallback: true, info: () => INFO.carryOn },
      { id: 'longFullTime', kind: 'switch', label: 'Use the full time', text: 'Off: a run whose list is done stops after two laps in a row find nothing more to do. On: it keeps looking until the time or the laps are up.', fallback: false },
      { id: 'longKeepAwake', kind: 'switch', label: 'Keep the Mac awake', text: 'While a Mission is on and the Mac is on power. The screen may still turn off; closing a laptop\'s lid still puts it to sleep.', fallback: true },
      { id: 'longBattery', kind: 'switch', label: 'Also on battery', text: 'Keep it awake on battery too. That drains the battery.', fallback: false },
      { id: 'longRetry', kind: 'switch', label: 'Try again by itself', text: 'When your model server does not answer, it waits and tries again by itself for up to 2 hours, then ends with its report; that time does not count. When the app stops giving it rounds for another reason, it tries again 2, 5 and 10 minutes later. Never after you paused it. After an app restart, Carry on by itself after a restart decides.', fallback: true, info: () => INFO.retry },
      { id: 'longEffort', kind: 'switch', label: 'Think by role', text: 'Planner and reviewer think hard (High), workers less (Medium). Same model, so nothing more is loaded. Off: every helper uses the tier\'s effort.', fallback: true },
    ];
    const parse = (value) => {
      try {
        const read = typeof value === 'string' ? JSON.parse(value || '{}') : value;
        return read && typeof read === 'object' && !Array.isArray(read) ? read : {};
      } catch {
        return {};
      }
    };
    /** Only whole choices are kept, so an emptied row leaves nothing behind. */
    const tidyRoles = (roles) => Object.fromEntries(ROLES.map((role) => [role.id, roles?.[role.id]]).filter(([, pick]) => pick && pick.provider && pick.model));

    const CSS = `
.dsh-ms-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-ms-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-ms-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ms-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ms-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-ms-row { display: flex; align-items: flex-start; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ms-rowtext { flex: 1; min-width: 0; }
.dsh-ms-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-ms-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ms-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-ms-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ms-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-ms-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-ms-radio { flex: none; width: 18px; height: 18px; margin-top: 2px; padding: 0; border-radius: 50%; cursor: pointer; background: transparent; border: 1.5px solid var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-ms-radio[aria-checked="true"] { border: 5px solid var(--dsw-alias-brand-primary); }
.dsh-ms-radio:focus-visible, .dsh-ms-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ms-field {
  flex: none; box-sizing: border-box; height: 32px; max-width: 260px; padding: 0 10px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; cursor: pointer;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
input.dsh-ms-field { width: 76px; cursor: text; text-align: right; }
.dsh-ms-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ms-row[data-center="true"] { align-items: center; }
.dsh-ms-card { margin-top: 12px; padding: 4px 14px 2px; border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ms-card .dsh-ms-row:last-child { border-bottom: 0; }
.dsh-ms-cardhead { display: flex; align-items: center; gap: 12px; padding: 10px 0 2px; }
.dsh-ms-cardhead b { flex: 1; min-width: 0; font-size: 14px; font-weight: 500; overflow-wrap: anywhere; }
.dsh-ms-cardhead span { display: block; font-size: 11px; font-weight: 400; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ms-btn { flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 9px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-ms-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ms-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-ms-list code { font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--dsw-alias-label-primary); }
.dsh-ms-run { box-sizing: border-box; width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px)); max-width: var(--dsh-composer-card-max-width, 100%); margin: 0 auto 8px; padding: 10px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); }
/* As wide as the chat box, also with Cowork's wide chat (which lets the box use the window less 32px). */
html[data-cws-wide] .dsh-ms-run { max-width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px) - 32px); }
.dsh-ms-run-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.dsh-ms-run-head b { font-weight: 600; }
.dsh-ms-run-meta { color: var(--dsw-alias-label-secondary); }
.dsh-ms-run-actions { margin-left: auto; display: flex; gap: 6px; }
.dsh-ms-run-list { margin: 6px 0 0; padding: 0; list-style: none; max-height: 96px; overflow: auto; }
.dsh-ms-run-list li { display: flex; gap: 6px; }
.dsh-ms-run-mark { flex: none; min-width: 74px; color: var(--dsw-alias-label-secondary); }
.dsh-ms-run-mark[data-ok="true"] { color: var(--dsw-alias-state-success-primary, var(--dsw-alias-brand-primary)); }
.dsh-ms-run-note { margin-top: 6px; color: var(--dsw-alias-state-warning-primary, var(--dsw-alias-label-secondary)); }
.dsh-ms-run-report { margin-top: 6px; white-space: pre-wrap; max-height: 220px; overflow: auto; font: 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace; }
.dsh-ms-modal-back { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.35); }
.dsh-ms-modal { width: min(560px, calc(100vw - 32px)); max-height: calc(100vh - 48px); overflow: auto; padding: 18px 20px; border-radius: 16px; background: var(--dsw-alias-bg-base); border: 0.5px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.dsh-ms-modal textarea { box-sizing: border-box; width: 100%; min-height: 72px; margin-top: 6px; padding: 8px 10px; border-radius: 10px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: inherit; font: inherit; font-size: 13px; resize: vertical; }
.dsh-ms-ticks { margin: 10px 0 0; padding: 0; list-style: none; font-size: 12px; line-height: 18px; }
.dsh-ms-ticks li { display: flex; gap: 6px; }
.dsh-ms-ticks span[data-ok="false"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ms-ticks span[data-ok="null"] { color: var(--dsw-alias-label-secondary); }
.dsh-ms-ticks span[data-ok="warn"] { color: var(--dsw-alias-state-warn-primary); font-weight: 600; }
.dsh-ms-modal-foot { display: flex; justify-content: flex-end; gap: 8px; margin-top: 14px; }
/* The app's goal bar is hidden only in the chat box (Split pane) whose Mission strip shows. */
[data-dsh-mission] [data-goal-bar] { display: none !important; }
/* While the main button (Add note, Answer and continue, Resume) shows, it takes Send's place: the app's primary button is
   hidden as Send, Steer, Queue or Continue, but never as Stop (its square): Stop still pauses the Mission at once. */
[data-dsh-mission-main] [class*="_trailing"] button[aria-busy][class*="_primary"]:not(:has(rect)) { display: none !important; }
.dsh-ms-run .dsh-ms-run-actions { margin: 6px 0 0; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 4px; }
.dsh-ms-qlist { margin: 6px 0 0; padding: 0; list-style: none; max-height: 96px; overflow: auto; color: var(--dsw-alias-label-primary); }
.dsh-ms-qlist li { padding: 1px 0; overflow-wrap: anywhere; }
/* The questions card (stage C), under the strip and as wide. No position, z-index, transform, filter, contain, container-type
   or isolation: the (i) pop-ups are position: fixed and the chat box's own menus must float over the card. Narrow Split Plus
   panes wrap (flex-wrap), no container query. */
.dsh-ms-qcard { box-sizing: border-box; width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px)); max-width: var(--dsh-composer-card-max-width, 100%); max-height: min(45vh, 360px); overflow: auto; margin: 0 auto 8px; padding: 10px 12px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); }
html[data-cws-wide] .dsh-ms-qcard { max-width: calc(100% - 2 * var(--dsh-composer-side-clearance, 0px) - 32px); }
.dsh-ms-qhead { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; }
.dsh-ms-qhead b { font-weight: 600; }
.dsh-ms-qhead .dsh-ms-qfold { margin-left: auto; display: inline-flex; align-items: center; gap: 2px; }
.dsh-ms-qmeta { margin: 2px 0 0; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ms-qitem { min-width: 0; margin: 10px 0 0; padding: 0; border: 0; }
.dsh-ms-qitem legend { padding: 0; font-weight: 500; overflow-wrap: anywhere; }
.dsh-ms-qfield { display: block; box-sizing: border-box; width: 100%; margin: 4px 0 0; padding: 6px 8px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: inherit; font: inherit; font-size: 13px; line-height: 18px; resize: vertical; }
.dsh-ms-qfield:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ms-qfield:disabled { opacity: .5; }
.dsh-ms-qrow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; margin: 4px 0 0; }
.dsh-ms-qskip, .dsh-ms-qchip { display: inline-flex; align-items: center; height: 24px; padding: 0 10px; border-radius: 12px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.dsh-ms-qskip:hover:not(:disabled), .dsh-ms-qchip:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
/* Chosen: the app's primary button colours and a check mark (brand-primary is the label colour in this theme). */
.dsh-ms-qskip[aria-pressed="true"], .dsh-ms-qchip[aria-checked="true"] { border-color: var(--dsw-alias-button-info-fill); background: var(--dsw-alias-button-info-fill); color: var(--dsw-alias-label-on-color); }
.dsh-ms-qskip[aria-pressed="true"]::before, .dsh-ms-qchip[aria-checked="true"]::before { content: "\\2713"; margin-right: 4px; }
.dsh-ms-qskip[aria-pressed="true"]:hover:not(:disabled), .dsh-ms-qchip[aria-checked="true"]:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover); }
.dsh-ms-qskip:focus-visible, .dsh-ms-qchip:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ms-qskip:disabled, .dsh-ms-qchip:disabled, .dsh-ms-qskip[aria-disabled="true"] { opacity: .5; cursor: default; }
.dsh-ms-qlate { margin: 4px 0 0; padding-left: 16px; overflow-wrap: anywhere; }
/* Stage D: one step waiting for your yes; the helper's own words in the secondary colour, as a quote. */
.dsh-ms-qappr { margin: 8px 0 0; padding: 6px 0 0; border-top: 0.5px solid var(--dsw-alias-border-l1); overflow-wrap: anywhere; }
.dsh-ms-qwhat { font-weight: 500; overflow-wrap: anywhere; }
.dsh-ms-qsay { margin: 2px 0 0; color: var(--dsw-alias-label-secondary); font-style: italic; overflow-wrap: anywhere; }
/* Tool access's own warnings (Recon, outside material), as its approval card shows them. */
.dsh-ms-qwarn { margin: 2px 0 0; color: var(--dsw-alias-state-warn-primary); overflow-wrap: anywhere; }
.dsh-ms-qfoot { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; margin: 10px 0 0; }
.dsh-ms-runbtn-wrap { position: relative; display: inline-flex; align-items: center; gap: 2px; }
.dsh-ms-main {
  display: inline-flex; align-items: center; justify-content: center; height: 28px; padding: 0 12px; border: 0; border-radius: 14px; cursor: pointer;
  background: var(--dsw-alias-button-info-fill); color: var(--dsw-alias-label-on-color); font: inherit; font-size: 12px; font-weight: 500; white-space: nowrap;
}
/* The app's own primary button colours, readable in light and dark (brand-primary turns near-white in dark mode). */
.dsh-ms-main:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover); }
.dsh-ms-main:disabled { cursor: default; opacity: .6; }
.dsh-ms-main:focus-visible { outline: 2px solid var(--dsw-alias-button-info-fill); outline-offset: 2px; }
/* Read by screen readers only: the strip's state words (running, waiting, paused, problem, finished). */
.dsh-ms-sr { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
/* A tiny chat box row (Modes' data-dsh-tiny): the short label. */
[data-dsh-tiny] .dsh-ms-main .dsh-ms-main-label { display: none; }
[data-dsh-tiny] .dsh-ms-main::after { content: attr(data-short); font-size: 12px; }
.dsh-ms-runbtn {
  display: inline-flex; align-items: center; gap: 5px; height: 28px; padding: 0 10px; border-radius: 14px; cursor: pointer;
  border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px;
}
.dsh-ms-runbtn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-ms-runbtn:disabled { cursor: default; opacity: .55; }
.dsh-ms-runbtn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ms-runbtn svg { flex: none; }
/* Depth is on Mission (stage D): Start Mission in the app's primary button colours, readable in light and dark. */
.dsh-ms-runbtn[data-chosen="true"] { border-color: var(--dsw-alias-button-info-fill); background: var(--dsw-alias-button-info-fill); color: var(--dsw-alias-label-on-color); font-weight: 500; }
.dsh-ms-runbtn[data-chosen="true"]:hover:not(:disabled) { background: var(--dsw-alias-button-info-hover); }
.dsh-ms-runtip {
  position: absolute; right: 0; bottom: calc(100% + 8px); z-index: 50; width: max-content; max-width: 260px; padding: 6px 9px; border-radius: 9px;
  font-size: 12px; line-height: 17px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-base); border: 0.5px solid var(--dsw-alias-border-l2);
  box-shadow: 0 4px 14px rgba(0,0,0,.18);
}
`;

    /** The tabs where the owner switched the work loop on. */
    function loopTabsOf(text) {
      try {
        const value = JSON.parse(String(text ?? '') || '[]');
        return Array.isArray(value) ? value.map(String) : [];
      } catch {
        return [];
      }
    }

    async function read(ctx) {
      const result = await ctx.remote.settings.describe();
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
      const view = result.value.namespaces.find((entry) => entry.ns === NS);
      if (!view) throw new Error('The Mission add-on is not running.');
      return view;
    }

    async function setSettings(ctx, values) {
      const ops = Object.entries(values).map(([field, value]) => ({ op: 'set', path: [field], value }));
      let result = await ctx.remote.settings.mutate(NS, ops, (await read(ctx)).revision);
      if (!result.ok && result.error.code === 'settings/conflict') result = await ctx.remote.settings.mutate(NS, ops, (await read(ctx)).revision);
      if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
    }

    /** Pick a model from the app's own list; the first entry stands for "not chosen here". */
    function ModelSelect({ catalog, pick, none, label, disabled, onPick }) {
      const groups = catalog?.groups ?? [];
      const value = pick?.provider && pick?.model ? `${pick.provider}\u0000${pick.model}` : '';
      const known = groups.some((group) => group.id === pick?.provider && group.models.some((item) => item.id === pick?.model));
      // A model name that more than one provider offers carries its provider, so the closed menu tells them apart.
      const seen = new Map();
      for (const group of groups) for (const item of group.models) seen.set(item.name, (seen.get(item.name) ?? 0) + 1);
      const shown = (group, item) => (seen.get(item.name) > 1 ? `${item.name} (${group.name})` : item.name);
      return h('select', {
        className: 'dsh-ms-field', value, 'aria-label': label, disabled,
        onChange: (event) => {
          const [provider, model] = event.target.value.split('\u0000');
          onPick(provider && model ? { provider, model } : undefined);
        },
      },
      h('option', { value: '' }, none),
      value && !known ? h('option', { value }, `${pick.model} (not available now)`) : null,
      groups.map((group) => h('optgroup', { key: group.id, label: group.name }, group.models.map((item) => h('option', { key: `${group.id}:${item.id}`, value: `${group.id}\u0000${item.id}` }, shown(group, item))))));
    }

    /** A number that is saved when the field is left, kept inside its range. */
    function NumberField({ value, min, max, label, disabled, onCommit }) {
      const [draft, setDraft] = useState(String(value));
      const [seen, setSeen] = useState(value);
      if (value !== seen) {
        setSeen(value);
        setDraft(String(value));
      }
      const commit = () => {
        const number = Math.round(Number(draft));
        if (!Number.isFinite(number)) { setDraft(String(value)); return; }
        const next = Math.min(max, Math.max(min, number));
        setDraft(String(next));
        if (next !== value) onCommit(next);
      };
      return h('input', { className: 'dsh-ms-field', type: 'number', inputMode: 'numeric', min, max, value: draft, 'aria-label': label, disabled, onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); } });
    }

    function MissionPage({ appCtx }) {
      const [data, setData] = useState(undefined);
      const [error, setError] = useState('');
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [catalog, setCatalog] = useState(null);
      const [folders, setFolders] = useState([]);
      // A project that was added but has no model picked yet; it is not saved until it has one.
      const [drafts, setDrafts] = useState([]);
      // The tabs the app has (from the Modes settings), for the work loop's switches.
      const [tabs, setTabs] = useState([]);
      // Where Benchmark's scorecard showed the loop pays, as you accepted it there (plan step S7).
      const [pays, setPays] = useState({});
      const alive = useRef(true);
      const load = useCallback(async () => {
        try {
          const view = await read(appCtx);
          if (alive.current) { setData(view.value ?? {}); setError(''); }
        } catch (problem) {
          if (alive.current) setError(dshKit.plain(problem));
        }
      }, [appCtx]);
      useEffect(() => {
        alive.current = true;
        void load();
        // The models and the projects the app knows, for the pickers.
        (async () => {
          try {
            const result = await appCtx.get('remote.session')?.modelCatalog?.();
            if (alive.current && result?.ok) setCatalog(result.value);
          } catch {
            /* the pickers then show only what is already chosen */
          }
          try {
            const described = await appCtx.remote.settings.describe();
            const modes = described.ok ? described.value.namespaces.find((entry) => entry.ns === 'modes')?.value : undefined;
            const table = (text) => { try { const value = JSON.parse(String(text ?? '') || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; } };
            const found = { chat: 'Chat', cowork: 'Cowork', code: 'Code' };
            // Research is left out: there only Ultra Code puts the loop on (its Missions).
            for (const [id, mode] of Object.entries({ ...table(modes?.modes), ...table(modes?.extraModes) })) if (/^[a-z0-9-]{1,40}$/.test(id) && !mode?.isolated && id !== 'research') found[id] = String(mode?.label ?? id).slice(0, 40);
            if (alive.current) setTabs(Object.entries(found).map(([id, label]) => ({ id, label })));
            const bench = described.ok ? described.value.namespaces.find((entry) => entry.ns === 'benchmark')?.value : undefined;
            if (alive.current) setPays(table(bench?.acceptedMethods));
          } catch {
            /* no list: the switches already saved still show */
          }
          try {
            const items = appCtx.get('workspaces')?.list?.getSnapshot?.()?.items;
            // Stage 7 (lab; 6a decision): Recon's room is no project of yours, so it is never offered here (as in ⌘K).
            if (alive.current && Array.isArray(items)) setFolders(items.filter((item) => typeof item?.path === 'string' && item.path && !RECON_ROOM_PATH.test(item.path)).map((item) => ({ path: item.path, title: String(item.title || item.path.split('/').pop()) })));
          } catch {
            /* no list: projects already saved still show */
          }
        })();
        return () => { alive.current = false; };
      }, [load, appCtx]);
      const save = useCallback(async (values, done) => {
        setBusy(true);
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((before) => ({ ...before, ...values }));
          setNote({ text: done, error: false });
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not save: ${problem.message}`, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      }, [appCtx]);

      const roles = parse(data?.roles);
      const projects = parse(data?.projects);
      const shownProjects = [...new Set([...Object.keys(projects), ...drafts])];
      const titleOf = (folder) => folders.find((item) => item.path === folder)?.title ?? folder.split('/').pop();
      const setRole = (role, pick) => void save({ roles: JSON.stringify(tidyRoles({ ...roles, [role]: pick })) }, 'Saved. It applies from the next run.');
      const setProjectRole = (folder, role, pick) => {
        const own = tidyRoles({ ...projects[folder], [role]: pick });
        const next = { ...projects };
        if (Object.keys(own).length > 0) next[folder] = own;
        else delete next[folder];
        // An emptied project stays on the page until it is removed, so the pickers do not vanish under the cursor.
        if (Object.keys(own).length === 0 && !drafts.includes(folder)) setDrafts((list) => [...list, folder]);
        void save({ projects: JSON.stringify(next) }, 'Saved. It applies from the next run in that project.');
      };
      const removeProject = (folder) => {
        setDrafts((list) => list.filter((item) => item !== folder));
        if (!projects[folder]) return;
        const { [folder]: _gone, ...rest } = projects;
        void save({ projects: JSON.stringify(rest) }, 'Removed. That project follows the choices above again.');
      };
      const free = folders.filter((item) => !shownProjects.includes(item.path));

      const loaded = Boolean(data);
      const enabled = loaded && data.enabled !== false;
      const chosen = loaded && MODES.some((mode) => mode.id === data.defaultMode) ? data.defaultMode : 'restricted';

      return h('div', { className: 'dsh-ms-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-ms-title' }, 'Mission'),
        h('p', { className: 'dsh-ms-desc' }, 'A Mission works on a goal until its checklist is done or a limit is reached: start one with Start Mission beside Send, or by typing /mission and the goal. Choosing Mission in Depth only selects it; Start Mission starts it. Typing /mission restricted, ask or auto also keeps the assistant inside a thread\'s folder, at one of three Mission access levels, and takes checkpoints of the folder that you can go back to.'),
        !loaded ? (error ? h(PlainNote, { text: `Could not load: ${error.text}`, details: error.details, kind: 'error' }) : h('p', { className: 'dsh-ms-desc', 'data-error': 'false' }, 'Loading…')) : null,
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        loaded ? h('div', { className: 'dsh-ms-row' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, 'Mission'),
            h('div', { className: 'dsh-ms-rowdesc' }, 'Off takes the /mission command away and switches off Mission access wherever it is on. Checkpoints already taken stay in their folders.')),
          h('button', { type: 'button', role: 'switch', className: 'dsh-ms-switch', 'aria-checked': enabled, 'aria-label': 'Mission', disabled: busy, onClick: () => void save({ enabled: !enabled }, enabled ? 'Switched off.' : 'Switched on.') })) : null,

        h('div', { className: 'dsh-ms-group' }, 'Mission access for /mission on'),
        MODES.map((mode) => h('div', { key: mode.id, className: 'dsh-ms-row' },
          h('button', { type: 'button', role: 'radio', className: 'dsh-ms-radio', 'aria-checked': chosen === mode.id, 'aria-label': mode.label, disabled: busy || !loaded, onClick: () => void save({ defaultMode: mode.id }, `/mission on now switches on ${mode.label}.`) }),
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, mode.label),
            h('div', { className: 'dsh-ms-rowdesc' }, mode.text)))),

        h('div', { className: 'dsh-ms-group' }, 'Models for a run'),
        h('p', { className: 'dsh-ms-desc' }, 'A Mission uses three roles. By default all three run on the thread\'s own model, so only one model has to be loaded. The choices below apply only in a thread whose models chip (in the chat box) is set to "Different models". Then: pick a model for a role here, or leave it to Model tiers, which uses the plan, implement or review model of the thread\'s tier.'),
        ROLES.map((role) => h('div', { key: role.id, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, role.label),
            h('div', { className: 'dsh-ms-rowdesc' }, role.text)),
          h(ModelSelect, { catalog, pick: roles[role.id], none: 'Follow Model tiers', label: `Model for the ${role.label.toLowerCase()}`, disabled: busy || !loaded, onPick: (pick) => setRole(role.id, pick) }))),

        h('div', { className: 'dsh-ms-group' }, 'Per project'),
        h('p', { className: 'dsh-ms-desc' }, 'A project can have its own models. What is picked here wins over the choices above, for runs in that project\'s folder only.'),
        shownProjects.map((folder) => h('div', { key: folder, className: 'dsh-ms-card' },
          h('div', { className: 'dsh-ms-cardhead' },
            h('b', null, titleOf(folder), h('span', null, folder)),
            h('button', { type: 'button', className: 'dsh-ms-btn', disabled: busy, onClick: () => removeProject(folder) }, 'Remove')),
          ROLES.map((role) => h('div', { key: role.id, className: 'dsh-ms-row', 'data-center': 'true' },
            h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, role.label)),
            h(ModelSelect, { catalog, pick: projects[folder]?.[role.id], none: 'As above', label: `${role.label} for ${titleOf(folder)}`, disabled: busy, onPick: (pick) => setProjectRole(folder, role.id, pick) }))))),
        loaded ? h('div', { className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowdesc' }, free.length > 0 ? 'Add a project to give it models of its own.' : folders.length === 0 ? 'The app lists no project folders yet. Open a thread in a folder first.' : 'Every project the app knows is listed above.')),
          free.length > 0 ? h('select', { className: 'dsh-ms-field', value: '', 'aria-label': 'Add a project', disabled: busy, onChange: (event) => { const folder = event.target.value; if (folder) setDrafts((list) => [...list, folder]); } },
            h('option', { value: '' }, 'Add a project…'),
            free.map((item) => h('option', { key: item.path, value: item.path }, item.title))) : null) : null,

        h('div', { className: 'dsh-ms-group' }, 'Checklist limits (every Mission)'),
        h('p', { className: 'dsh-ms-desc' }, 'Apply to every Mission, however it starts.'),
        LIMITS.map((limit) => h('div', { key: limit.id, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, limit.label, h(ui.Info, { title: limit.label, what: limit.text, change: 'Applies from the next Mission.' })),
            h('div', { className: 'dsh-ms-rowdesc' }, limit.text)),
          h(NumberField, { value: Number.isFinite(Number(data?.[limit.id])) ? Number(data[limit.id]) : limit.fallback, min: limit.min, max: limit.max, label: limit.label, disabled: busy || !loaded, onCommit: (number) => void save({ [limit.id]: number }, 'Saved. It applies from the next run.') }))),

        h('div', { className: 'dsh-ms-group' }, 'Mission defaults'),
        h('p', { className: 'dsh-ms-desc' }, 'Starting values of each thread\'s Mission settings (Depth → Mission settings… changes them for one thread). A Mission works in laps: work on the open items, the overall commands, a review, and it undoes a lap that breaks a command that passed before. Time limit 0: it runs until its checklist is done. Helpers at once: how many checklist items are worked on at the same time.'),
        LONG_FIELDS.map((field) => h('div', { key: field.id, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' },
            h('div', { className: 'dsh-ms-rowtitle' }, field.label, h(ui.Info, { ...((typeof field.info === 'function' ? field.info() : field.info) ?? { what: field.text }), title: field.label })),
            h('div', { className: 'dsh-ms-rowdesc' }, field.text)),
          field.kind === 'select'
            ? h('select', { className: 'dsh-ms-field', value: String(field.shown(data ?? {})), 'aria-label': field.label, disabled: busy || !loaded, onChange: (event) => void save({ [field.id]: field.read(event.target.value) }, 'Saved. It applies to the next Mission.') },
              field.choices(data ?? {}).map((choice) => h('option', { key: String(choice.value), value: String(choice.value) }, choice.label)))
            : field.kind === 'number'
            ? h(NumberField, { value: Number.isFinite(Number(data?.[field.id])) ? Number(data[field.id]) : field.fallback, min: field.min, max: field.max, label: field.label, disabled: busy || !loaded, onCommit: (number) => void save({ [field.id]: number }, 'Saved. It applies to the next Mission.') })
            : h('button', { type: 'button', role: 'switch', className: 'dsh-ms-switch', 'aria-checked': loaded ? (data[field.id] ?? field.fallback) === true : field.fallback, 'aria-label': field.label, disabled: busy || !loaded, onClick: () => void save({ [field.id]: !((data[field.id] ?? field.fallback) === true) }, 'Saved. It applies to the next Mission.') }))),

        h('div', { className: 'dsh-ms-group' }, 'Work loop (Ultra Code)'),
        h('p', { className: 'dsh-ms-desc' }, 'Off unless switched on. It is on for a run when Ultra Code is switched on in the thread\'s model panel (beside Effort), or for every run in a mode you switch on here. With it on, a run follows a recipe for its kind of task (plain files in the app\'s data folder, mission/recipes, which you can edit; five starters are written once), each step ends in a fixed shape, a separate checker checks it (sources really opened for research, a fixed shape for an extraction, separate tries that agree for a question with one answer, a reader for writing; commands for code and data, as always), a step that fails twice goes to the strongest model of the tier\'s team (Settings → Model tiers), and with Ultra Code several attempts at text work run side by side and a judge picks. Only the worker of an item changes files; the attempts, the judge and the checkers only read. Slower, and more tokens. Recon runs keep their own model and get only the checks the app runs itself.'),
        Object.keys(pays).length > 0
          ? h('p', { className: 'dsh-ms-desc' }, `Benchmark found that the loop pays for: ${Object.entries(pays).map(([kind, way]) => `${kind} (${String(way).replace(/^small-loop-/, '').replace(/-/g, ' ')})`).join(', ')}. You accepted this on Settings → Benchmark; switch the loop on below for the modes where you do that kind of work.`)
          : h('p', { className: 'dsh-ms-desc' }, 'Settings → Benchmark → Compare ways of working runs your own tasks three ways and says where the loop pays. Nothing is switched on by itself.'),
        tabs.map((tab) => {
          const on = loopTabsOf(data?.loopTabs).includes(tab.id);
          return h('div', { key: `loop-${tab.id}`, className: 'dsh-ms-row', 'data-center': 'true' },
            h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, `${tab.label}: the loop for every run`), h('div', { className: 'dsh-ms-rowdesc' }, on ? 'On: every run started in this mode uses the work loop, also with Ultra Code off.' : 'Off: only Ultra Code puts it on here.')),
            h('button', { type: 'button', role: 'switch', className: 'dsh-ms-switch', 'aria-checked': on, 'aria-label': `${tab.label}: the work loop for every run`, disabled: busy || !loaded, onClick: () => { const list = loopTabsOf(data?.loopTabs); void save({ loopTabs: JSON.stringify(on ? list.filter((id) => id !== tab.id) : [...list, tab.id]) }, 'Saved. It applies from the next run.'); } }));
        }),
        h('p', { className: 'dsh-ms-desc' }, 'In Research a Mission uses the loop only when Ultra Code is on in that thread; without it, it runs as before.'),
        (catalog?.groups ?? []).length > 0 ? h('p', { className: 'dsh-ms-desc' }, 'Calls at once, per model server (1 to 16, 4 unless you change it). A server that runs one request at a time: set it to 1, and side by side means one after another there. This also caps how many of a Mission\'s helpers work on that server at the same time.') : null,
        (catalog?.groups ?? []).slice(0, 12).map((group) => h('div', { key: `calls-${group.id}`, className: 'dsh-ms-row', 'data-center': 'true' },
          h('div', { className: 'dsh-ms-rowtext' }, h('div', { className: 'dsh-ms-rowtitle' }, `${group.name ?? group.id}: calls at once`)),
          h(NumberField, { value: Number(parse(data?.callsAtOnce)[group.id] ?? 4), min: 1, max: 16, label: `${group.name ?? group.id}: calls at once`, disabled: busy || !loaded, onCommit: (number) => void save({ callsAtOnce: JSON.stringify({ ...parse(data?.callsAtOnce), [group.id]: number }) }, 'Saved. It applies from the next step.') }))),

        h('div', { className: 'dsh-ms-group' }, 'How to use it'),
        h('ul', { className: 'dsh-ms-list' },
          h('li', null, 'Open a thread in a project folder (in the Code space, or with Cowork in the Chat space) and type ', h('code', null, '/mission restricted'), ', ', h('code', null, '/mission ask'), ' or ', h('code', null, '/mission auto'), '. ', h('code', null, '/mission on'), ' uses the access level chosen above; ', h('code', null, '/mission off'), ' lifts it.'),
          h('li', null, 'Start a Mission with Start Mission beside Send, or by typing /mission and what it should do: what you typed and the thread so far become its brief. Choosing Mission in Depth selects it and makes Start Mission the main button; it starts nothing by itself. Above the chat box a strip says how it stands, and the main button (Add note, Answer and continue, Resume) takes Send\'s place until it ends. The app\'s Stop still pauses it at once.'),
          h('li', null, 'To have several models work on a goal, type ', h('code', null, '/mission'), ' followed by the goal, for example ', h('code', null, '/mission make every test pass and add a --json option'), '. An access level named first applies to the run: ', h('code', null, '/mission auto …'), '. It uses this thread\'s Mission settings. The Mission plans, works through a checklist, proves each item with a real command where it can, has the result reviewed, and ends with a report.'),
          h('li', null, h('code', null, '/mission stop'), ' pauses a run, ', h('code', null, '/mission resume'), ' carries on (also with items that waited for your yes), ', h('code', null, '/mission end'), ' closes it with a report, ', h('code', null, '/mission report'), ' shows how it stands.'),
          h('li', null, 'A question from the assistant appears as the app\'s approval card. During a Mission its helpers\' questions and approvals wait in the Mission\'s card above the chat box instead, and the other helpers carry on. A yes to a file holds for that file for the rest of the thread.'),
          h('li', null, h('code', null, '/mission checkpoints'), ' lists the checkpoints. ', h('code', null, '/mission back 12'), ' puts the folder back as it was at checkpoint 12. Going back is itself kept as a checkpoint, so it can be undone.'),
          h('li', null, h('code', null, '/mission'), ' alone shows the Mission access that is on and the commands.')),

        h('div', { className: 'dsh-ms-group' }, 'Good to know'),
        h('ul', { className: 'dsh-ms-list' },
          h('li', null, 'While Mission access is on, the thread uses the app\'s Workspace Write permission. The app\'s own sandbox then stops any change outside the folder, whatever a command tries.'),
          h('li', null, 'A checkpoint is taken at the start of every turn (while several helpers of a Mission work: after each item instead) and before every terminal command. In Restricted and Ask, if a command changes or deletes an existing file you have not approved, that file is put back at once and the assistant has to ask.'),
          h('li', null, 'Checkpoints live in a hidden folder named .dsh-mission inside the thread\'s folder. They need git, which comes with Apple\'s command line tools. Your project\'s own git history is not touched.'),
          h('li', null, 'Files your project ignores (in .gitignore), and node_modules, are not part of a checkpoint: they are neither protected nor put back.'),
          h('li', null, 'Reading outside the folder is checked from the text of a command. A script could still read a file elsewhere on the Mac without naming it; it cannot change one.'),
          h('li', null, 'In a run, "PASSED" means a command was really run and passed. "REVIEWED" means no command could prove the item and the reviewer model judged it done. Nothing counts as done on a worker\'s word alone.'),
          h('li', null, 'Several helpers can work at once (Helpers at once), each on its own item. They never change the same file at once: a file one helper is changing is refused to the others until it is done, and commands that change files run one at a time. Each run keeps its log and every model\'s answer in .dsh-mission/runs inside the folder.'),
          // Stage E: the assistant while a Mission is paused, and Missions in every tab inside its own rules.
          SETTINGS_NOTES_E.map((line) => h('li', { key: line.slice(0, 24) }, line)),
          h('li', null, 'Changes you make yourself in an editor are never undone by Mission, but a later "go back" returns the folder to the checkpoint, including your changes since then.')));
    }

    // ---- Mission: the status strip above the chat box, the main button beside it and the Mission settings (stage B) ----

    const MARKS = { verified: 'PASSED', reviewed: 'REVIEWED', unverified: 'NOT VERIFIED', stuck: 'NOT FINISHED', aside: 'NEEDS YOU', parked: 'WAITS FOR YOU', open: 'to do' };
    async function longCall(method, body) {
      const url = new URL('dsh-mission/long', document.baseURI);
      if (method === 'GET' && body.defaults) {
        url.searchParams.set('defaults', '1');
        if (body.sessionId) url.searchParams.set('sessionId', body.sessionId);
      } else if (method === 'GET') {
        url.searchParams.set('sessionId', body.sessionId);
        if (body.since) url.searchParams.set('since', body.since);
      }
      const response = await fetch(url, { method, cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        const problem = new Error(json.error || `HTTP ${response.status}`);
        problem.status = response.status;
        problem.details = json.details ?? '';
        throw problem;
      }
      return json;
    }
    const messageOf = (problem) => String(problem?.message ?? problem ?? '');
    /** Runs whose finished strip you closed (kept for this browser). Stage C stores `id:endedAt` (dismissKey); old entries are run ids. */
    const DISMISSED_KEY = 'dsh-mission.dismissed';
    const dismissedRuns = () => { try { return new Set(JSON.parse(window.localStorage.getItem(DISMISSED_KEY) || '[]')); } catch { return new Set(); } };
    const dismissRun = (id) => { try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissedRuns(), id].slice(-200))); } catch { /* private mode */ } };

    // ---- mission-strip:begin (pure: the strip's words, the main button's label, what Enter does; the tests run this block on its own) ----
    /** Time limits offered in Mission settings; 0 runs until the checklist is done. */
    const TIME_CHOICES = [
      { value: 0, label: 'No time limit' }, { value: 10, label: '10 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 hour' },
      { value: 120, label: '2 hours' }, { value: 240, label: '4 hours' }, { value: 480, label: '8 hours' }, { value: 720, label: '12 hours' },
    ];
    /** Point 17 (owner, 20 November): what a Mission does when it needs you. Ids are the server's ('decide' is Full auto). */
    const NEEDS_CHOICES = [
      { id: 'decide', label: 'Full auto', desc: 'It never asks. It decides questions itself and lists them in the report. It never gives itself permission: steps that need your yes are skipped and listed.' },
      { id: 'ask', label: 'Ask, keep working', desc: 'Questions with a safe default go on with it; only what truly needs you waits. Other work goes on.' },
      { id: 'wait', label: 'Ask and wait', desc: 'Every question and every request for your yes waits for you; nothing is decided on a guess. Other items go on; when only waiting is left, it waits.' },
    ];
    /** A choice id as the server reads it: anything else is Ask, keep working. */
    const readNeedsShown = (value) => (NEEDS_CHOICES.some((choice) => choice.id === value) ? value : 'ask');
    /** The choice's label ('' for an unknown one, as an older card may send). */
    const needsWords = (needs) => NEEDS_CHOICES.find((choice) => choice.id === needs)?.label ?? '';
    /** "Wait for me" choices in minutes; 0 waits until you answer. */
    const WAIT_CHOICES = [
      { value: 10, label: '10 min' }, { value: 30, label: '30 min' }, { value: 60, label: '1 hour' }, { value: 120, label: '2 hours' },
      { value: 240, label: '4 hours' }, { value: 480, label: '8 hours' }, { value: 720, label: '12 hours' }, { value: 0, label: 'Until I answer' },
    ];
    /** A wait as the server reads it (lib/run.js readWaitChoice): null when not given, ≤ 0 until you answer, else 1 to 720 minutes. */
    const readWaitShown = (value) => {
      if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
      const number = Number(value);
      if (!Number.isFinite(number)) return null;
      return number <= 0 ? 0 : Math.min(720, Math.max(1, Math.round(number)));
    };
    /**
     * Wait for me with Ask, keep working, as the server works it out (lib/run.js waitAskOf): the saved value when set (≥ 0),
     * else from the old waitMinutes: missing or its old default 3 → 30 minutes, 0 → until you answer, others kept.
     */
    const waitAskShown = (saved, legacy) => {
      const own = Number(saved);
      if (saved !== null && saved !== undefined && saved !== '' && Number.isFinite(own) && own >= 0) return readWaitShown(own);
      const old = Number(legacy);
      if (legacy === null || legacy === undefined || legacy === '' || !Number.isFinite(old) || Math.round(old) === 3) return 30;
      return old <= 0 ? 0 : Math.min(720, Math.max(1, Math.round(old)));
    };
    /** The label of one wait, as in the lists ("<n> min" for a value not in the list). */
    const waitLabel = (minutes) => WAIT_CHOICES.find((choice) => choice.value === minutes)?.label ?? `${minutes} min`;
    /** The wait list, with a saved value not in it added in its place. */
    const waitOptions = (current) => {
      const value = readWaitShown(current);
      if (value === null || WAIT_CHOICES.some((choice) => choice.value === value)) return WAIT_CHOICES;
      return [...WAIT_CHOICES.filter((choice) => choice.value > 0), { value, label: `${value} min` }].sort((a, b) => a.value - b.value).concat(WAIT_CHOICES.filter((choice) => choice.value === 0));
    };
    /** A wait in running text: "30 minutes", "1 hour", or "until you answer". */
    const waitWords = (minutes) => {
      const value = readWaitShown(minutes) ?? 0;
      if (value === 0) return 'until you answer';
      return value === 1 ? '1 minute' : longTime(value);
    };
    /** The default wait for a choice, from the card's defaults (30 minutes and until I answer when an older card has none). */
    const waitDefaultOf = (needs, defaults) => (needs === 'wait' ? readWaitShown(defaults?.waitHold) ?? 0 : readWaitShown(defaults?.waitAsk) ?? 30);
    /** "Default (30 min)" / "Default (until I answer)": the first option of Wait for me in Mission settings. */
    const waitDefaultLabel = (needs, defaults) => {
      const value = waitDefaultOf(needs, defaults);
      return `Default (${value === 0 ? 'until I answer' : waitLabel(value)})`;
    };
    /** The line under Wait for me in Mission settings. */
    const waitDesc = (needs, minutes) => {
      if (needs === 'decide') return 'Full auto never waits.';
      return readWaitShown(minutes) === 0
        ? 'When only your answers can move it on, it waits until you answer. Its time limit does not run while it waits.'
        : 'When only your answers can move it on, it waits this long, then ends with its report. Its time limit does not run while it waits.';
    };
    /** What the start question says about When it needs you ('' for an unknown choice, as an older card sends). */
    const needsConfirm = (saved) => {
      const needs = saved?.needs;
      if (!NEEDS_CHOICES.some((choice) => choice.id === needs)) return '';
      const tail = ' Change this in Depth → Mission settings.';
      if (needs === 'decide') {
        const mode = saved?.mode === 'restricted' ? 'Restricted' : saved?.mode === 'ask' ? 'Ask' : '';
        const warn = mode && saved?.tools?.files !== false ? ` With Mission access on ${mode} it will not change files that already exist (that needs your yes); choose Auto under Mission access if it should.` : '';
        return `When it needs you: Full auto. It never asks you: it decides questions itself and lists what it chose. It never gives itself permission: steps that need your yes are skipped and listed in the report.${warn}${tail}`;
      }
      const known = saved?.waitFor !== null && saved?.waitFor !== undefined && Number.isFinite(Number(saved.waitFor));
      const wait = known ? readWaitShown(saved.waitFor) ?? 0 : -1;
      if (needs === 'ask') {
        const how = wait < 0 ? '' : wait === 0 ? ' If only waiting is left, it waits until you answer.' : ` If only waiting is left, it waits for ${waitWords(wait)}, then ends with its report.`;
        return `When it needs you: Ask, keep working. Only questions that truly need you wait; the rest goes on.${how}${tail}`;
      }
      const how = wait < 0 ? '' : wait === 0 ? ' When only waiting is left, it waits until you answer.' : ` When only waiting is left, it waits up to ${waitWords(wait)}, then ends with its report.`;
      return `When it needs you: Ask and wait. Every question and every request for your yes waits for you; other items go on.${how}${tail}`;
    };
    /** The strip's words for point 17. */
    const RUN_NEXT_AUTO = 'Full auto: it asks nothing and decides questions itself; the report lists them. Type a note and press Add note to steer it.';
    // Review of point 17: the time-limit sentence only for a Mission with a time limit; an end on another day says so.
    const WAIT_NEXT_UNTIL = (until, timed = true, now = Date.now()) => `Answer in the card below. With no answer it ends at ${endsAtWords(until, now)} with its report; Finish it then takes it up again.${timed ? ' Its time limit is paused while it waits.' : ''}`;
    const WAIT_NEXT_FOREVER = (timed = true) => `Answer in the card below. It waits until you answer${timed ? '; its time limit is paused meanwhile' : ''}, and the Mac may sleep.`;
    /** Lab check of point 19: the strip's button for changes that wait for your OK after the end, and the line under it. */
    const okButton = (count) => (count === 1 ? '1 change waits for your OK' : `${count} changes wait for your OK`);
    const okNext = (count) => `Press "${okButton(count)}" to see ${count === 1 ? 'it' : 'them'} and Allow or Deny; nothing runs again.`;
    const FINISHED_NEXT_FINISH = 'Press Finish it to answer what is left or change what it decided; the same Mission then does the rest. Send talks to the assistant again. Start Mission starts a new one.';
    /** The checklist's meta line: "When it needs you: … · Wait for me: …" ('' for a run that does not say). */
    const needsMeta = (run) => {
      const label = needsWords(run?.needs);
      if (!label) return '';
      if (run.needs === 'decide') return `When it needs you: ${label}`;
      const wait = readWaitShown(run?.waitFor);
      return wait === null ? `When it needs you: ${label}` : `When it needs you: ${label} · Wait for me: ${waitWords(wait)}`;
    };
    // ---- Stage E (item 1, 20 November 2026): the assistant while paused, carry on after a restart, the model server, the repair helper ----
    /** Point 8: what the conversation's own assistant may do while its Mission works, waits or is paused. Ids are the server's. */
    const ASSISTANT_CHOICES = [
      { id: 'look', label: 'Talk and look things up', desc: 'It talks and may read and search, but changes nothing.' },
      { id: 'talk', label: 'Only talk', desc: 'It only talks: no tools.' },
    ];
    /** A choice as the server reads it: anything but 'talk' is Talk and look things up. */
    const readAssistantShown = (value) => (value === 'talk' ? 'talk' : 'look');
    const assistantDesc = (value) => ASSISTANT_CHOICES.find((choice) => choice.id === readAssistantShown(value)).desc;
    /** Point 9: the line under Carry on by itself after a restart in Mission settings. */
    const carryOnDesc = (on) => (on === false ? 'Off: it comes back paused after a restart.' : 'On: it carries on by itself after a restart.');
    /** Try again by itself in Mission settings (the row's text; the (i) says the rest). */
    const RETRY_FORM_TEXT = 'When your model server does not answer, it waits up to 2 hours and tries again by itself; that time does not count.';
    /** Settings → Mission, "Good to know": the lines stage E changed or added. */
    const SETTINGS_NOTES_E = [
      'While a Mission works, the thread\'s own model keeps it moving; with Talk and look things up it may also read and search to answer you. While it is paused, the assistant only talks, or talks and looks things up, as the Mission settings say. It never does the Mission\'s work itself.',
      'In Data and Research, which run Read Only by your choice, the /mission access levels are refused. A Mission works there, typed (/mission and what it should do) or with Start Mission: it warns first, may change files in the thread\'s folder while it runs, and puts Read Only back when it ends.',
      'In Recon a Mission works only where Recon\'s settings allow it, typed or with Start Mission, inside Recon\'s rules: in Recon\'s room, with this thread\'s model; the /mission access levels are not available there. A Recon Mission does not come back after the app restarts. A run needs helper models: on a tier with Sub-agents off (Settings → Model tiers), a run does not start or carry on, and one under way is paused.',
      'In Creator Plus a Mission works inside Creator Plus\'s rules: its checks run without the internet and without keys, and installing or changing anything in your real setup waits for your yes in the Mission\'s card.',
      'In Devices a Mission\'s helpers may read devices; a step that needs your yes waits in the Mission\'s card. Changing or writing a device stays with the thread itself.',
    ];
    /** While a Mission is paused or stopped by a problem: what Enter does meanwhile ('' as usual: an older card says nothing). */
    const PAUSED_TAIL_LOOK = ' Meanwhile Enter talks to the assistant; it can look things up but changes nothing.';
    const PAUSED_TAIL_TALK = ' Meanwhile Enter talks to the assistant; it only talks.';
    const PAUSED_TAIL_OLD = ' Meanwhile Enter talks to the assistant as usual.';
    const pausedTail = (strip) => (strip?.assistant === 'talk' ? PAUSED_TAIL_TALK : strip?.assistant === 'look' ? PAUSED_TAIL_LOOK : PAUSED_TAIL_OLD);
    const RESTART_NEXT_OFF = 'Press Resume to carry on. Carry on by itself after a restart is off for this Mission (Depth → Mission settings…).';
    const RESTART_NEXT_OLD = 'Press Resume to carry on. This Mission started before it could carry on by itself.';
    const CARRIED_NOTE = 'Carried on by itself after the app restarted. Items a helper was working on go on from where they stopped.';
    /** The carried-on note, for 10 minutes after the Mission carried on by itself ('' otherwise). */
    const carriedWords = (strip, now) => {
      const at = Number(strip?.carriedOn) || 0;
      return strip?.state === 'running' && at > 0 && now - at >= 0 && now - at < 600000 ? CARRIED_NOTE : '';
    };
    const BUDGET_FIX = 'Allow the higher limit in the card below, or raise "Steps in a Mission" in Settings → Budget guard, then press Resume.';
    /** The model server does not answer: the note under the strip, and the next line. */
    const DOWN_WHAT = 'Your model server does not answer.';
    const DOWN_FIX = 'Start it or check its connection. The Mission tries again by itself; Try now tries at once.';
    const DOWN_NEXT = (nextAt, endsAt, now = Date.now()) => {
      const when = Number(nextAt) > now ? `It tries again by itself at ${clockWords(nextAt)}.` : 'It tries again by itself now.';
      return Number(endsAt) > 0 ? `${when} If the server is not back by ${endsAtWords(endsAt, now)}, it ends with its report.` : when;
    };
    /** The repair helper on the strip: working, next, or its last fix for 30 minutes ('' when nothing to say). */
    const repairWords = (strip, now) => {
      const repair = strip?.repair;
      const cause = String(repair?.cause ?? '').trim().replace(/\.+$/, '');
      if (repair && cause) return repair.working === true ? `The repair helper is looking at why ${cause}.` : `The repair helper looks at why ${cause} next.`;
      const newest = (Array.isArray(strip?.repairs) ? strip.repairs : []).reduce((best, one) => (Number(one?.at) > (Number(best?.at) || 0) ? one : best), null);
      const text = String(newest?.text ?? '').trim();
      return newest && text && now - Number(newest.at) < 1800000 ? `Repair: ${text}` : '';
    };
    /** The Checklist's Repairs block: one line per repair, with the way back when it took a save point. */
    const repairRows = (run) => (Array.isArray(run?.repairs) ? run.repairs : []).map((one) => {
      const cause = String(one?.cause ?? '').trim().replace(/\.+$/, '');
      const text = String(one?.text ?? '').trim();
      const point = Number(one?.point) || 0;
      return [Number(one?.at) > 0 ? clockWords(one.at) : '', cause ? `why ${cause}` : '', text, point > 0 ? `Undo: /mission back ${point}` : ''].filter(Boolean).join(' · ');
    });
    const MAIN_LABELS = { send: ['Start Mission', 'Start'], note: ['Add note', 'Note'], answer: ['Answer and continue', 'Answer'], resume: ['Resume', 'Resume'] };
    /** The main button's words; `short` for a tiny chat box row. */
    const mainLabel = (main, short) => (MAIN_LABELS[main] ?? MAIN_LABELS.send)[short ? 1 : 0];
    const spanWords = (ms) => {
      const minutes = Math.max(0, Math.round(ms / 60000));
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return hours > 0 ? (rest > 0 ? `${hours} h ${rest} m` : `${hours} h`) : `${rest} m`;
    };
    /** Time left in words. A paused Mission's clock stands still (the deadline moves on at resume), so it counts from the pause. */
    const timeWords = (run, now) => {
      if (!run || !(Number(run.deadline) > 0)) return 'no time limit';
      if (Number(run.pausedAt) > 0) {
        const left = run.deadline - run.pausedAt;
        return left >= 30000 ? `${spanWords(left)} left, clock stopped` : 'clock stopped';
      }
      // Point 17: while it waits for you its time limit does not run either (the deadline moves on when the wait ends).
      const since = Number(run.waitingForYou?.since) || 0;
      if (since > 0) {
        const left = run.deadline - since;
        return left >= 30000 ? `${spanWords(left)} left, clock stopped while it waits` : 'clock stopped while it waits';
      }
      const left = run.deadline - now;
      return left >= 30000 ? `${spanWords(left)} left` : 'time is up after this step';
    };
    const nowWords = (run) => {
      if (run?.workingKind === 'repair') return 'the repair helper';
      if (run?.workingItem) return `item ${run.workingItem}`;
      if (run?.hunting === true) return 'an extra lap';
      return { plan: 'making the plan', checks: 'the overall commands', review: 'the review' }[run?.phase] ?? '';
    };
    const retryWords = (retryAt, now) => (Number(retryAt) > now ? ` It tries again by itself in ${Math.max(1, Math.ceil((retryAt - now) / 60000))} min.` : '');
    /** What to do about a problem; a problem text that already says "press Resume." gets only the retry words. */
    const problemFix = (strip, now) => {
      const text = String(strip?.problem?.text ?? '').trim();
      // Stage E: a Budget stop with its higher limit waiting in the card says where to allow it.
      const budget = /^Paused by the Budget guard/i.test(text) && (Array.isArray(strip?.approvals) ? strip.approvals : []).some((a) => a?.fix === 'budget');
      const base = budget ? BUDGET_FIX : /press Resume\.?$/i.test(text) ? '' : 'Fix it if you can, then press Resume. Resume checks the problem first.';
      // Stage E: what Enter does meanwhile, as the Mission's settings say (an older card says nothing).
      const tail = strip?.assistant === 'talk' || strip?.assistant === 'look' ? pausedTail(strip) : '';
      return `${base}${retryWords(strip?.retryAt, now)}${tail}`.trim();
    };
    /**
     * The strip in words: a dot (ui.StateLine state), what is happening, and what pressing the main button does.
     * @returns {{dot: string, words: string, next: string}}
     */
    /** "1 question" / "3 questions", and "… and 2 approvals" when steps wait for a yes ('' when both are 0). */
    const countWords = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;
    const askWords = (questions, approvals) => [questions > 0 ? countWords(questions, 'question') : '', approvals > 0 ? countWords(approvals, 'approval') : ''].filter(Boolean).join(' and ');
    /** A clock time (hh:mm, this Mac's time) for "it ends at …". */
    const clockWords = (ms) => { const at = new Date(Number(ms)); return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`; };
    /** "14:05", "08:00 tomorrow" (Wait for me is at most 12 hours), or the date for anything later. */
    const endsAtWords = (ms, now = Date.now()) => {
      const at = new Date(Number(ms));
      const day = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const today = new Date(Number(now));
      const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      if (day(at) === day(today)) return clockWords(ms);
      if (day(at) === day(tomorrow)) return `${clockWords(ms)} tomorrow`;
      return `${clockWords(ms)} on ${at.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][at.getMonth()]}`;
    };
    /**
     * Stage D: why a Mission works with fewer helpers than asked ('' when it has what was asked).
     * @param {{helpers?: number, helpersAsked?: number, helpersWhy?: string} | null} run
     */
    const helpersWhyWords = (run) => {
      const helpers = Number(run?.helpers) || 1;
      if (!(helpers < (Number(run?.helpersAsked) || 0))) return '';
      if (run?.helpersWhy === 'no-checkpoints') return 'Helpers at once: 1 here, because this folder keeps no checkpoints.';
      if (run?.helpersWhy === 'server') return `Helpers at once: ${helpers} here, because Calls at once for your model server is ${helpers} (Settings → Mission).`;
      return '';
    };
    /** Stage D: what one checklist row says besides its mark ('' when nothing): working, waiting for you or a file, checked again. */
    const itemWords = (item, run) => {
      if (!item) return '';
      if (item.working === true) return 'working now';
      // Point 17: Full auto set it aside because it needs your yes, which Full auto never asks for.
      if (item.status === 'aside' && Array.isArray(item.asideOn) && item.asideOn.length > 0) return 'not done without your yes (Full auto does not ask)';
      const on = Array.isArray(item.parkedOn) ? item.parkedOn.map(String) : [];
      if (on.length > 0 || item.status === 'parked') return on.some((id) => id.startsWith('q')) || on.length === 0 ? 'waits for your answer' : 'waits for your yes';
      if (item.waitFile) {
        const held = (Array.isArray(run?.waitingFile) ? run.waitingFile : []).find((one) => String(one?.item) === String(item.id));
        return held?.heldBy ? `waits for ${item.waitFile}, which item ${held.heldBy} is changing` : `waits for ${item.waitFile}, which another item is changing`;
      }
      if (item.recheck === true) return 'checked again when the other helpers are done';
      return '';
    };
    const stripWords = (card, now) => {
      const strip = card?.strip ?? null;
      const run = card?.run ?? null;
      const state = strip?.state ?? 'none';
      const questions = Array.isArray(strip?.questions) ? strip.questions.length : 0;
      // Stage D: steps a helper needs your yes for, and the helper pool (size, working, parked).
      const approvals = Array.isArray(strip?.approvals) ? strip.approvals.length : 0;
      const pool = strip?.pool ?? null;
      if (state === 'starting') return { dot: 'busy', words: 'Starting the Mission…', next: 'It starts as soon as the thread is done answering.' };
      if (!run || state === 'none') return { dot: 'idle', words: '', next: '' };
      const steps = Number(run.steps) || 0;
      if (state === 'running') {
        const about = Number(run.stepsAbout) > 0 ? ` of ~${run.stepsAbout}` : '';
        const doing = nowWords(run);
        // Several helpers: how many work now; none (the plan, the checks, the review): what is being done, as before.
        const working = Number(pool?.working) || 0;
        const helpers = (Number(pool?.size) || 1) > 1 && working > 0 ? `${working} helper${working === 1 ? '' : 's'} working` : doing ? `now: ${doing}` : '';
        const parked = Number(pool?.parked) || 0;
        const asks = askWords(questions, approvals);
        const forYou = parked > 0 ? `${parked} waiting for you` : asks ? `${asks} for you` : '';
        const auto = (strip?.needs ?? run.needs) === 'decide';
        return {
          dot: 'busy',
          words: ['Running', timeWords(run, now), `step ${steps}${about}`, helpers, forYou, run.finishLap ? 'finishing this lap' : ''].filter(Boolean).join(' · '),
          next: forYou ? 'Answer in the card below; the rest goes on meanwhile. Add note steers it.' : auto ? RUN_NEXT_AUTO : 'Type a note and press Add note: the Mission reads it at its next step and keeps going.',
        };
      }
      if (state === 'waiting') {
        // Stage D: 'waiting' means nothing else can move until you answer (no helper works, nothing is ready).
        // Point 17: its time limit does not run meanwhile; it ends at waitUntil with its report, or waits until you answer.
        const asks = askWords(questions, approvals);
        const until = Number(strip?.waitUntil) || 0;
        // Only a Mission with a time limit has one to pause (review of point 17).
        const timed = Number(run.deadline) > 0;
        return {
          dot: 'warn',
          words: ['Waiting for you', asks, 'nothing else can move', timed ? 'time limit paused' : ''].filter(Boolean).join(' · '),
          next: until > 0 ? WAIT_NEXT_UNTIL(until, timed, now) : WAIT_NEXT_FOREVER(timed),
        };
      }
      if (state === 'down') {
        // Stage E: the model server does not answer. It waits and tries again by itself; the time limit does not run.
        const down = strip?.down ?? {};
        const tries = Number(down.tries) || 0;
        const timed = Number(run.deadline) > 0;
        return {
          dot: 'warn',
          words: ['Waiting for your model server', tries > 0 ? `tried ${tries} time${tries === 1 ? '' : 's'}` : '', timed ? 'time limit paused' : ''].filter(Boolean).join(' · '),
          next: DOWN_NEXT(down.nextAt, down.endsAt, now),
        };
      }
      if (state === 'paused') {
        const by = strip?.pausedBy;
        const head = by === 'restart' ? 'Paused when the app restarted' : by === 'app' ? 'Paused' : `Paused at step ${steps}`;
        const clock = Number(run.deadline) > 0 ? ` · ${timeWords(run, now)}` : '';
        // Stage E: after a restart, why it did not carry on by itself (Carry on off, or a Mission from before stage E).
        const lead = by === 'restart' && strip?.carryOn === false ? RESTART_NEXT_OFF : by === 'restart' && strip?.carryOn === null ? RESTART_NEXT_OLD : 'Press Resume to carry on.';
        return {
          dot: 'idle',
          words: `${head} · nothing lost${clock}`,
          next: `${lead}${pausedTail(strip)}${questions > 0 ? ' Text you type before Resume goes along as a note (lines that start with 1., 2., … answer those questions).' : ''}`,
        };
      }
      if (state === 'problem') {
        return { dot: 'error', words: `Stopped by a problem: ${String(strip?.problem?.text ?? '').trim()}`, next: problemFix(strip, now) };
      }
      // finished
      const items = Array.isArray(run.items) ? run.items : [];
      const done = items.filter((item) => item.status === 'verified' || item.status === 'reviewed').length;
      // Stage C: a Mission that ended with questions left (or answers that came too late) can be continued from the questions card.
      // Stage D: steps that still wait for your yes count too.
      // Point 17: steps Full auto did not ask for count as approvals; what it decided itself and what is not done are said too.
      const can = strip?.canContinue === true;
      const asked = can ? questions + (Array.isArray(strip?.late) ? strip.late.length : 0) : 0;
      const yes = can ? approvals + (Array.isArray(strip?.unasked) ? strip.unasked.length : 0) : 0;
      const decided = can && Array.isArray(strip?.decided) ? strip.decided.length : 0;
      const undone = can && Array.isArray(strip?.undone) ? strip.undone.length : 0;
      const left = asked + yes;
      // Lab check of point 19: the repair helper's changes that wait for your OK after the end (never "left for you").
      const oks = Array.isArray(strip?.oks) ? strip.oks.length : 0;
      const leftWords = `${left > 0 ? ` · ${asked === 1 && yes === 0 ? 'a question' : askWords(asked, yes)} left for you` : ''}${decided > 0 ? ` · it decided ${decided} itself` : ''}${undone > 0 ? ` · ${undone} not done` : ''}${oks > 0 ? ` · ${okButton(oks)}` : ''}`;
      const endKind = strip?.endKind ?? run.endKind;
      // Full auto never waits: its 'noWait' end says only your answers could move it on (review of point 17).
      const waited = endKind === 'waited';
      const words = endKind === 'noWait'
        ? `Ended: only your answers could move it on (Full auto does not wait)${run.status === 'complete' ? '' : ` · ${done} of ${items.length} done`}${leftWords} · report ready`
        : waited
        ? `Ended after waiting for you${run.status === 'complete' ? '' : ` · ${done} of ${items.length} done`}${leftWords} · report ready`
        : run.status === 'complete' ? `Done${leftWords} · report ready` : run.status === 'stopped' ? `Ended${leftWords} · report ready` : `Finished · ${done} of ${items.length} done${leftWords} · report ready`;
      const after = left + decided + undone > 0 ? FINISHED_NEXT_FINISH : 'Send talks to the assistant again. Start Mission starts a new one.';
      const next = oks > 0 ? `${okNext(oks)} ${after}` : after;
      return { dot: run.status === 'complete' ? 'ok' : 'idle', words, next };
    };
    /**
     * A failed button press in plain words: the Mission's own sentence when it gave one; when the request never got a
     * plain answer (no connection, "HTTP 502"), what went wrong and what to click, with the raw text behind Details.
     * @returns {{what: string, fix: string, details: string}}
     */
    const plainFailure = (failure) => {
      const raw = String(failure?.message ?? failure ?? '').trim();
      if (!failure?.status || /^HTTP \d+$/.test(raw) || !raw) {
        return { what: 'The Mission could not be reached.', fix: 'Check that the app is still running, then press the button again.', details: raw };
      }
      return { what: raw, fix: 'Then press the button again, or close this note.', details: String(failure?.details ?? '') };
    };
    /** What screen readers are told when the strip's state changes (only then: never each step or minute). */
    /** Start Mission's title while Depth is on Mission, and the tip after Mission is picked in Depth (stage D: picking only selects). */
    const DEPTH_CHOSEN_TITLE = 'Depth is on Mission: press Start Mission to start it with what you typed and this thread as its brief. Send still talks to the assistant.';
    const PICKED_TIP = 'Mission chosen. Type what it should do, then press Start Mission.';
    const STATE_SAID = { starting: 'Mission starting.', running: 'Mission running.', waiting: 'The Mission is waiting for you.', paused: 'Mission paused.', finished: 'Mission finished. Report ready.', down: 'The Mission is waiting for your model server.' };
    /**
     * What Enter in the chat box does while a Mission runs: 'note', 'answer' or 'pass' (the app handles it as always).
     * Only a real key press (not a synthetic one), plain Enter, no IME composition, no open '@' or '/' pop-up, some
     * text that is not a / command. While paused (main 'resume') Enter always passes: it talks to the assistant.
     */
    const enterDoes = (ev, main, text, popupOpen) => {
      if (main !== 'note' && main !== 'answer') return 'pass';
      if (!ev || ev.isTrusted !== true) return 'pass';
      if (ev.key !== 'Enter' || ev.shiftKey || ev.altKey || ev.metaKey || ev.ctrlKey) return 'pass';
      if (ev.isComposing === true || ev.keyCode === 229) return 'pass';
      if (popupOpen) return 'pass';
      const said = String(text ?? '').trim();
      if (!said || said.startsWith('/')) return 'pass';
      return main;
    };
    /**
     * Lab check of point 19 (F3): the goal of a typed "/mission <goal>" (3 words or more, not one of its own words such as
     * resume, back or a mode); '' for anything else. Only its first message in a conversation is taken by Mission (below).
     */
    const MISSION_WORDS = ['status', 'help', 'report', 'resume', 'go', 'continue', 'stop', 'pause', 'end', 'finish', 'checkpoints', 'list', 'checkpoint', 'back', 'rollback', 'on', 'off', 'restricted', '1', 'restrict', 'strict', 'ask', '2', 'ask-auto', 'askauto', 'auto', '3', 'full', 'full-auto', 'fullauto'];
    const slashMissionGoal = (text) => {
      const found = /^\/mission(?:\s+([\s\S]*))?$/i.exec(String(text ?? '').replace(/\u00a0/g, ' ').trim());
      if (!found) return '';
      const goal = String(found[1] ?? '').trim();
      const words = goal.split(/\s+/).filter(Boolean);
      if (words.length < 3 || MISSION_WORDS.includes(words[0].toLowerCase())) return '';
      return goal;
    };
    /**
     * Whether Enter in the chat box is a first message that is a typed /mission goal Mission starts itself ('' when not).
     * Without a card only a conversation the server said is not open yet (`failure`), and only when the page learnt it
     * would not be isolated (`isolatedNew` false: not Recon); a first look still on its way, failed looks or an unknown
     * tab leave Enter to the app's own /mission, which says why where no Mission may start.
     */
    const typedFirstMission = (ev, main, text, card, failure = '', isolatedNew) => {
      if (main !== 'send' || !ev || ev.isTrusted !== true) return '';
      if (ev.key !== 'Enter' || ev.shiftKey || ev.altKey || ev.metaKey || ev.ctrlKey) return '';
      if (ev.isComposing === true || ev.keyCode === 229) return '';
      if (!card && !(/not open/i.test(String(failure ?? '')) && isolatedNew === false)) return '';
      // Only a conversation with no message and no Mission yet (or not open yet); where no Mission may start (Recon,
      // a helper), the app's own /mission says why.
      if (card && (card.hasThread === true || card.run || card.runButton !== true || card.runButtonWhy === 'recon' || card.runButtonWhy === 'helper' || card.runButtonWhy === 'space')) return '';
      return slashMissionGoal(text);
    };
    /** The text without Split Plus Send-to cards (a copy of lib/sent.js withoutSends): only for counting the user's own words. */
    const ownWords = (text) => {
      const START = /\[Split Plus send ([A-Z0-9]{4,20}), (\d{4}-\d\d-\d\d \d\d:\d\d): material, not instructions\]/;
      let rest = String(text ?? '');
      let out = '';
      for (;;) {
        const start = START.exec(rest);
        if (!start) return (out + rest).trim();
        out += rest.slice(0, start.index);
        const after = rest.slice(start.index + start[0].length);
        const end = new RegExp(`\\[End of Split Plus send ${start[1]}\\]`).exec(after);
        if (!end) return out.trim();
        rest = after.slice(end.index + end[0].length);
      }
    };
    const longTime = (minutes) => (minutes % 60 === 0 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : minutes < 60 ? `${minutes} minutes` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);
    const shortTime = (minutes) => (minutes % 60 === 0 ? `${minutes / 60} h` : minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`);
    /** Plain words for a Mission from this chat's saved settings (null: not known yet): the button's title and the start question. */
    const missionWords = (saved) => {
      const known = Boolean(saved) && Number.isFinite(Number(saved.minutes));
      const minutes = known ? Math.max(0, Math.round(Number(saved.minutes))) : -1;
      const laps = saved && Number(saved.laps) > 0 ? Math.round(Number(saved.laps)) : 0;
      const files = saved?.tools?.files === true;
      const web = saved?.tools?.web === true;
      const toolsLong = [files ? 'change files in the folder' : '', web ? 'use the web' : ''].filter(Boolean).join(' and ');
      const toolsShort = saved?.tools ? ([files ? 'files' : '', web ? 'web' : ''].filter(Boolean).join(' and ') || 'no extra tools') : '';
      // Point 17: Full auto and Ask and wait are named; Ask, keep working (the default) is not.
      const needsShort = saved?.needs === 'decide' || saved?.needs === 'wait' ? needsWords(saved.needs) : '';
      const summary = [minutes < 0 ? '' : minutes === 0 ? 'no time limit' : shortTime(minutes), laps ? `${laps} laps` : '', Number(saved?.helpers) > 1 ? `${Math.min(8, Math.round(Number(saved.helpers)))} helpers at once` : '', toolsShort, needsShort].filter(Boolean).join(', ');
      const how = minutes < 0 ? 'within the time and laps set in Settings → Mission' : minutes === 0 ? 'until its checklist is done' : `for up to ${longTime(minutes)}`;
      // Stage D: helpers at once, when known (this chat's choice, else the default the card sends).
      const helpers = saved && Number(saved.helpers) > 0 ? Math.min(8, Math.round(Number(saved.helpers))) : 0;
      const together = helpers > 1 ? `, with up to ${helpers} helpers at once` : helpers === 1 ? ', one item at a time' : '';
      const confirm = `What you typed and this thread so far become its brief. It then works by itself ${how}${laps ? `, in up to ${laps} laps` : ''}${together}.${toolsLong ? ` It may ${toolsLong}.` : ''}${needsConfirm(saved) ? `\n\n${needsConfirm(saved)}` : ''}\n\nIt can use many tokens. You can pause or end it at any time, above the chat box.`;
      return { minutes, laps, summary, confirm };
    };
    /** The (i) texts of the Mission buttons and settings rows (what / when / change). */
    const INFO = {
      start: { title: 'Start Mission', what: 'Starts a Mission: the assistant works by itself on what you typed, with this whole thread as its brief.', when: 'After you have talked the work through and want it done.', change: 'One question first. It then runs until its checklist is done or a limit is reached. Choosing Mission in Depth only selects it; this button starts it. Change its time, laps, helpers and what it does when it needs you in Depth → Mission settings….' },
      note: { title: 'Add note', what: 'Gives the Mission what you typed as guidance. It keeps going.', when: 'To steer it: a hint, a correction, something it should know.', change: 'It reads the note at its next step. The note is not sent to the thread; the report lists it. A note takes text only. While it has questions for you, a note stays a note; lines that start with 1., 2., … answer those questions (the card above the chat box is the easier way).' },
      answer: { title: 'Answer and continue', what: 'Gives your answers to its open questions. The same Mission goes on with them.', when: 'When it lists questions above the chat box. Number your answers 1., 2., … or write one answer for all.', change: 'Items it finished on a default are done again with your answer, only where it differs from what it did. Unanswered questions keep their default. You can also answer in the card above the chat box.' },
      resume: { title: 'Resume', what: 'Carries on from the last saved step. Nothing is lost.', when: 'When the Mission is paused or stopped by a problem.', change: 'After a problem it checks first and tells you if something still needs fixing. Text you typed goes along as a note or an answer. While it is paused, Enter talks to the assistant as usual.' },
      pause: { title: 'Pause', what: 'Pauses the Mission now. The step under way stops and is done again when you resume. Nothing is lost.', when: 'When you need the computer, or want to read what it did so far.', change: 'Press Resume to carry on. Paused time does not count against its time limit.' },
      finishLap: { title: 'Finish this lap', what: 'Lets the lap under way end, then the Mission writes its report.', when: 'When you have enough, but want the current work finished cleanly.', change: 'It cannot be taken back. While it waits for you, it stops waiting and writes its report now. Hidden when the time is up, on the last lap, or while paused.' },
      end: { title: 'End', what: 'Stops now and writes the report.', when: 'When the Mission is going the wrong way.', change: 'It cannot be continued afterwards, unless it still has questions for you: answering them in the card continues it. The report\'s last line says how to undo its changes.' },
      checklist: { title: 'Checklist', what: 'Shows every item of the plan and how far it is.', when: 'To see what is done and what is left.', change: 'Only shows; changes nothing.' },
      report: { title: 'Report', what: 'What was done and how it was checked, what was not done and why, questions and the defaults used.', when: 'When the Mission has finished.', change: 'Only shows. It is also saved in the thread\'s folder.' },
      time: { title: 'Time limit', what: 'How long the Mission may work.', when: 'No time limit: it runs until its checklist is done. Set a time when you need it back by then.', change: 'Applies to the next Mission in this thread, also one you start by typing /mission.' },
      laps: { title: 'Laps', what: 'Most rounds of work, checks and review.', change: '0: no lap limit.' },
      helpers: { title: 'Helpers at once', what: 'How many checklist items are worked on at the same time.', when: 'Lower it for a slow Mac or a model server that takes one request at a time.', change: 'From 1 to 8; 4 unless you change it. Never more than Calls at once allows for your model server, and one at a time in a folder without checkpoints. Helpers never change the same file at once.' },
      steps: { title: 'Steps', what: 'Most steps in all. A step is one piece of work: the plan, one item, the commands or a review.', change: '0: worked out from the laps. Budget guard counts model requests separately, with its own Mission allowance.' },
      // Point 17.
      needs: { title: 'When it needs you', what: 'What the Mission does when it has a question for you or needs your yes.', when: 'Full auto when you will be away. Ask, keep working when you look in now and then. Ask and wait when nothing should be decided on a guess.', change: 'Applies to the next Mission in this thread, also a typed /mission. A Mission never gives itself permission: with Full auto and Mission access on Restricted or Ask it does not change files that already exist. This is not Auto under Mission access.' },
      needsSettings: { title: 'When it needs you', what: 'What the Mission does when it has a question for you or needs your yes.', when: 'Full auto when you will be away. Ask, keep working when you look in now and then. Ask and wait when nothing should be decided on a guess.', change: 'The starting value of each thread\'s Mission settings; a thread\'s own choice (Depth → Mission settings…) wins, also for a typed /mission. A Mission never gives itself permission. This is not Auto under Mission access.' },
      wait: { title: 'Wait for me', what: 'How long the Mission waits when nothing else can move until you answer.', when: 'Until I answer when you will come back to it; a time when you want the report by then.', change: 'Its time limit does not run while it waits, and the Mac may sleep. You get one alert when it starts waiting. When the wait is over it ends with its report; Finish it takes it up again.' },
      waitSettings: { title: 'Wait for me', what: 'How long the Mission waits when nothing else can move until you answer.', when: 'Until I answer when you will come back to it; a time when you want the report by then.', change: 'Its time limit does not run while it waits, and the Mac may sleep. You get one alert when it starts waiting. When the wait is over it ends with its report; Finish it takes it up again. A thread\'s own choice wins.' },
      // Stage E.
      assistantSettings: { title: 'While a Mission runs, the assistant can', what: 'What the assistant in a thread may do while its Mission works, waits, or is paused (by you, a problem or a restart). While the Mission works, the assistant also keeps it moving.', when: 'Only talk when nothing but the Mission should touch the work. Talk and look things up to ask it about a file or a web page meanwhile.', change: 'Talk and look things up may read files and search, also the web, but never changes files, runs commands or programs, or starts helpers. The Mission\'s own helpers are not affected. A thread\'s own choice (Depth → Mission settings…) wins and applies at once.' },
      carryOn: { title: 'Carry on by itself after a restart', what: 'What a working Mission does after the app restarts.', when: 'Leave it on so a Mission can finish while you are away. Switch it off to look first after every restart.', change: 'On unless you change it. A Mission you paused, one waiting for you and one stopped by a problem stay as they were. Missions started before this setting existed come back paused. A thread\'s own choice (Depth → Mission settings…) wins.' },
      retry: { title: 'Try again by itself', what: 'Whether the Mission tries again by itself when your model server or the app stops it.', when: 'Leave it on for Missions that run while you are away.', change: 'Off: it pauses and waits for you instead.' },
      tryNow: { title: 'Try now', what: 'Tries your model server again now, instead of at the next planned try.', when: 'After you started the server or fixed its connection.', change: 'If it still does not answer, the Mission goes on waiting. The wait does not use up its time limit.' },
      repair: { title: 'Repair helper', what: 'When helpers cannot do their work, a repair helper looks for the cause and fixes what it may.', when: 'It starts by itself; nothing to click.', change: 'It may change this Mission\'s own settings and fix files in its folder, after a save point (/mission back undoes it). A Budget guard limit, Calls at once, a fallback model or another setting wait for your yes in the card. It never asks for more access, and it only suggests a setting it cannot name exactly. At most twice for the same cause and six times in one Mission.' },
      finish: { title: 'Finish it', what: 'Brings back in one card what this Mission left open, the questions it decided itself and what it did not finish.', when: 'After it ended with something left for you.', change: 'You answer, change or allow what you want, choose how much more time, and the same Mission does the rest. Then it waits for you again as Wait for me says.' },
      // Lab check of point 19.
      oks: { title: 'Changes that wait for your OK', what: 'Settings the repair helper asked to change while the Mission worked. A Mission never changes a setting without your Allow.', when: 'After the Mission ended, whenever you like. The strip and this button stay above the chat box until you answer.', change: 'Allow makes the change now; Deny leaves the setting as it is. If you changed the setting yourself since, Allow leaves it as it is and says so. Either way the Mission stays as it ended and nothing runs again. The report says what you chose.' },
    };
    // ---- mission-strip:end ----

    // ---- mission-questions:begin (pure: when the questions card shows, its words and what it sends; the tests run this block on its own) ----
    const DAY_MS = 24 * 3600000;
    /** The longest time a continue takes (the server refuses more: 12 hours). */
    const CONTINUE_MAX_MINUTES = 720;
    const listOf = (value) => (Array.isArray(value) ? value : []);
    /** Where a finished Mission's strip and card count their day from: its end, or a later typed /mission resume (showFrom). */
    const shownFrom = (run) => Math.max(Number(run?.endedAt) || 0, Number(run?.showFrom) || 0);
    /**
     * The key × stores for a finished run: its id and its end, so a continued run that ends again shows again. A typed
     * /mission resume after the × (showFrom later than the end) makes a new key, so the strip and card show again too.
     */
    const dismissKey = (run) => {
      const ended = Number(run?.endedAt) || 0;
      const from = Number(run?.showFrom) || 0;
      return from > ended ? `${run?.id}:${ended}:${from}` : `${run?.id}:${ended}`;
    };
    /** Closed with ×: by its key, or by an id-only entry from before stage C (only for a run never continued nor shown again). */
    const isDismissed = (run, list) => {
      if (!run) return false;
      const seen = list instanceof Set ? list : new Set(listOf(list));
      if (seen.has(dismissKey(run))) return true;
      return seen.has(String(run.id)) && !(Number(run.continues) > 0) && !(Number(run.showFrom) > (Number(run.endedAt) || 0));
    };
    /** A finished run's strip shows for a day after its end (or after showFrom), unless closed with ×. */
    const finishedShown = (run, dismissed, now) => Boolean(run) && !isDismissed(run, dismissed) && now - shownFrom(run) < DAY_MS;
    // Stage E: 'down' (waiting for the model server) is on too.
    const ON_STATES = ['running', 'waiting', 'down', 'paused', 'problem'];
    /**
     * Whether the questions card shows: while on, with open questions, the time question, steps waiting for your yes, or
     * while the Mission waits for you (stage D); when ended, only when it can be continued.
     */
    const questionsShown = (card, dismissed, now) => {
      const strip = card?.strip;
      const run = card?.run;
      if (!strip || !run) return false;
      const asked = listOf(strip.questions).length;
      const approvals = listOf(strip.approvals).length;
      if (ON_STATES.includes(strip.state)) return asked > 0 || approvals > 0 || strip.state === 'waiting' || Boolean(strip.timeQuestion?.id);
      if (strip.state !== 'finished') return false;
      // Point 17: Finish it also brings back steps Full auto did not ask for, the questions it decided itself and undone items.
      return strip.canContinue === true && (asked > 0 || listOf(strip.late).length > 0 || approvals > 0 || listOf(strip.unasked).length > 0 || listOf(strip.decided).length > 0 || listOf(strip.undone).length > 0) && finishedShown(run, dismissed, now);
    };
    /** After the end, how much the Finish card holds: open (questions, late answers, approvals, steps not asked), decided, undone. */
    const finishCounts = (strip) => ({
      open: listOf(strip?.questions).length + listOf(strip?.late).length + listOf(strip?.approvals).length + listOf(strip?.unasked).length,
      decided: listOf(strip?.decided).length,
      undone: listOf(strip?.undone).length,
    });
    /** After the end, a card that holds only questions the Mission decided itself starts folded (they need nothing from you). */
    const foldedAtFirst = (card) => {
      const strip = card?.strip;
      if (strip?.state !== 'finished') return false;
      const counts = finishCounts(strip);
      return counts.decided > 0 && counts.open === 0 && counts.undone === 0;
    };
    /**
     * Whether a 'dsh-mission:finish' (the strip's Finish it) is for this card: the pressed button's chat box when it has one
     * and this card knows its own, else the same conversation (the rule RunButton uses for Depth's pick).
     */
    const finishMine = (detail, mySeat, sessionId) => {
      if (!detail) return false;
      const seatOf = (node) => (typeof node?.closest === 'function' ? node.closest('[data-composer-seat]') ?? node.closest('[data-conversation-session]') : null);
      const fromSeat = seatOf(detail.from);
      if (fromSeat && mySeat) return fromSeat === mySeat;
      return Boolean(sessionId) && String(detail.sessionId ?? '') === String(sessionId);
    };
    /** The set of questions (and approvals) a card holds (a message said about it stays while the set lasts). */
    const questionsKey = (card) => {
      const strip = card?.strip;
      const ended = strip?.state === 'finished';
      const ids = [
        ...listOf(strip?.questions).map((q) => String(q.id)),
        ...(!ended && strip?.timeQuestion?.id ? [String(strip.timeQuestion.id)] : []),
        ...listOf(strip?.approvals).map((a) => String(a.id)),
        ...(ended ? listOf(strip?.unasked).map((a) => String(a.id)) : []),
        ...(ended ? listOf(strip?.decided).map((q) => `d:${q.id}`) : []),
      ];
      return `${card?.run?.id ?? ''}|${ended ? 'ended' : 'on'}|${ids.join(',')}`;
    };
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many ?? `${one}s`}`;
    const hhmm = (ms) => { const at = new Date(Number(ms)); return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`; };
    /** "14:05", or "08:00 tomorrow" when the wait ends on the next day (the date later still). */
    const endsAt = (ms, now = Date.now()) => {
      const at = new Date(Number(ms));
      const today = new Date(Number(now));
      if (at.toDateString() === today.toDateString()) return hhmm(ms);
      const next = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
      return at.toDateString() === next.toDateString() ? `${hhmm(ms)} tomorrow` : `${hhmm(ms)} on ${at.getDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][at.getMonth()]}`;
    };
    /** Stage D: the items waiting for you (parked), from the pool, else from the questions' and approvals' items. */
    const parkedCount = (strip) => {
      const counted = Number(strip?.pool?.parked);
      if (Number.isFinite(counted) && counted >= 0 && strip?.pool) return counted;
      return new Set([...listOf(strip?.questions).flatMap((q) => listOf(q.parks)), ...listOf(strip?.approvals).flatMap((a) => listOf(a.items))].map(String)).size;
    };
    /** Stage D: the line under a question an item waits for ('' when no item waits for it). */
    const parkedWords = (q) => {
      const items = listOf(q?.parks).map(String);
      if (items.length === 0) return '';
      return items.length === 1 ? `Item ${items[0]} waits for this answer.` : `Items ${items.join(', ')} wait for this answer.`;
    };
    /** Under the field of a question an item waits for: it stays undone without an answer, with the helper's suggestion. */
    const parkedDefaultWords = (q) => {
      const assume = String(q?.assume ?? '').trim().replace(/\.+$/, '');
      return assume ? `Without an answer it stays undone. Its suggestion: ${assume}.` : 'Without an answer it stays undone.';
    };
    /** The card's title and the line under it, by what the Mission is doing. */
    const cardTop = (card) => {
      const strip = card?.strip;
      const ended = strip?.state === 'finished';
      const asked = listOf(strip?.questions).length + (ended ? listOf(strip?.late).length : strip?.timeQuestion?.id ? 1 : 0);
      const approvals = listOf(strip?.approvals).length;
      if (ended) {
        // Point 17: one card for everything left after the end; Finish it takes it up in the same Mission.
        const counts = finishCounts(strip);
        if (counts.open === 0 && counts.decided > 0 && counts.undone === 0) return { title: 'Finish the Mission', line: FINISH_LINE_DECIDED };
        if (counts.open === 0 && counts.decided === 0 && counts.undone > 0) return { title: 'Finish the Mission', line: FINISH_LINE_UNDONE };
        return { title: 'Finish the Mission', line: FINISH_LINE };
      }
      if (strip?.state === 'waiting') {
        const until = Number(strip?.waitUntil) || 0;
        return {
          title: 'The Mission waits for you',
          line: until > 0
            ? `Nothing else can move until you answer. With no answer it ends at ${endsAt(until, Number(card?.at) || Date.now())} with its report; Finish it then takes it up again.${Number(card?.run?.deadline) > 0 ? ' Its time limit is paused while it waits.' : ''}`
            : `Nothing else can move until you answer. It waits until you answer${Number(card?.run?.deadline) > 0 ? '; its time limit is paused meanwhile' : ''}.`,
        };
      }
      const title = asked > 0 || approvals === 0 ? 'Questions for you' : 'The Mission needs your yes';
      if (strip?.needs === 'wait') return { title, line: RUN_LINE_WAIT };
      if (parkedCount(strip) > 0 || approvals > 0) return { title, line: 'Items that wait for you stop until you answer; the rest goes on with its defaults.' };
      return { title, line: 'It goes on with its defaults. Answer what you can; empty fields keep their default.' };
    };
    /** The folded card in one line. */
    const foldWords = (card) => {
      const strip = card?.strip;
      const ended = strip?.state === 'finished';
      const asked = listOf(strip?.questions).length + (ended ? listOf(strip?.late).length : strip?.timeQuestion?.id ? 1 : 0);
      const approvals = listOf(strip?.approvals).length;
      const yes = approvals > 0 ? ` · approvals: ${approvals}` : '';
      if (ended) {
        const counts = finishCounts(strip);
        const parts = [counts.open > 0 ? `${counts.open} open` : '', counts.decided > 0 ? `${counts.decided} decided by it` : '', counts.undone > 0 ? `${counts.undone} not done` : ''].filter(Boolean);
        return parts.length > 0 ? `Finish the Mission: ${parts.join(' · ')}` : 'Finish the Mission';
      }
      const parked = parkedCount(strip);
      const how = strip?.state === 'waiting' ? 'it waits for you' : parked > 0 ? `${plural(parked, 'item')} ${parked === 1 ? 'waits' : 'wait'} for you` : 'it goes on with its defaults';
      return `Questions for you: ${asked}${yes} · ${how}`;
    };
    /** Who asked for a yes: the item(s), else the plan or the review (helpers with no item of their own). */
    const approvalAsked = (a) => {
      // Stage E: the repair helper's asks, and yeses another add-on (Devices, Recon, Creator Plus, Tuner Plus) asks for.
      if (a?.by === 'repair') return 'Asked by the repair helper';
      const through = a?.addonName ? ` · through ${String(a.addonName)}` : '';
      const items = listOf(a?.items).map(String);
      if (items.length === 1) {
        const title = listOf(a?.askedBy).find((one) => String(one?.id) === items[0])?.title;
        return `${title ? `Asked by item ${items[0]}: ${title}` : `Asked by item ${items[0]}`}${through}`;
      }
      if (items.length > 1) return `Asked by items ${items.join(', ')}${through}`;
      if (a?.addonName) return `Asked through ${String(a.addonName)}`;
      return 'Asked by the plan or the review';
    };
    /** Stage E: what Allow changes, in each add-on's own words (its own rules still hold). */
    const ADDON_CHANGE = {
      bench: 'It is the same as your yes on Devices\' own card, for this one step. Devices\' rules still hold: a Mission\'s helpers may read devices but never change or write them.',
      recon: 'It is the same as your yes to Recon\'s own question: these addresses from a Recon export may be opened in this thread until the app restarts. Onion addresses are never opened outside Recon.',
      creatorPlus: 'It does what Apply on its card in Settings → Creator Plus does: it installs exactly the checked copy, with a way back there. Read the code on that card first (Show the code).',
      tuning: 'It starts that Tuner Plus run, as your yes on its own card would. It uses this Mac while it runs; the result comes as a card on Settings → Tuner Plus.',
    };
    /** The (i) beside one approval's button: the add-on's or the repair helper's Allow, else by the choice (stage D). */
    const choiceInfo = (a, choice) => {
      if (choice?.id === 'allow' && (a?.kind === 'addon' || Boolean(a?.addon))) return { title: 'Allow', what: `Gives the yes ${String(a.addonName || 'the add-on')} asks for, once, for exactly this step.`, when: 'When the step is fine with you.', change: ADDON_CHANGE[a.addon] ?? 'It is the same as your yes on that add-on\'s own card, for this one step. Its own rules still hold.' };
      if (choice?.id === 'allow' && a?.kind === 'repair') return INFO_Q.repairAllow;
      return { allow: INFO_Q.allow, deny: INFO_Q.deny, item: INFO_Q.allowItem, mission: INFO_Q.allowMission }[choice?.id];
    };
    /** The words on an approval's buttons, by choice id (the server's label wins). */
    const CHOICE_LABELS = { allow: 'Allow', deny: 'Deny', item: 'Allow for this item', mission: 'Allow for this Mission' };
    const choiceLabel = (choice) => String(choice?.label || CHOICE_LABELS[choice?.id] || choice?.id || '');
    /** After the end: the approval choices picked in the card, in the card's order, only choices it offers. */
    const approvalsBody = (picks, approvals) => listOf(approvals)
      .filter((a) => picks?.[a.id] && listOf(a.choices).some((c) => c.id === picks[a.id]))
      .map((a) => ({ id: String(a.id), choice: String(picks[a.id]) }));
    /** Who asked: the item(s) when the question names any (they win over `from`), else the plan or the review. */
    const askedWords = (q) => {
      const items = listOf(q?.items).map(String);
      if (items.length === 1) {
        const title = listOf(q?.askedBy).find((one) => String(one?.id) === items[0])?.title;
        return title ? `Asked by item ${items[0]}: ${title}` : `Asked by item ${items[0]}`;
      }
      if (items.length > 1) return `Asked by items ${items.join(', ')}`;
      if (q?.from === 'repair') return 'Asked by the repair helper';
      return q?.from === 'review' ? 'Asked by the review' : 'Asked by the plan';
    };
    const defaultWords = (q) => {
      const assume = String(q?.assume ?? '').trim();
      return assume ? `If you don't answer: ${assume}` : 'If you don\'t answer: it decides itself.';
    };
    /** Point 17, Ask and wait: under a question no item waits for, nothing is decided on it and it keeps the Mission from ending. */
    const waitDefaultWords = (q) => {
      const assume = String(q?.assume ?? '').trim().replace(/\.+$/, '');
      return `Without an answer nothing is decided on it: the Mission waits for it before it ends.${assume ? ` Its suggestion: ${assume}.` : ''}`;
    };
    /** The card's words for point 17 (When it needs you, Wait for me, Finish it). */
    const RUN_LINE_WAIT = 'Items that need your answer or your yes wait for it; the other items go on. Nothing is decided on a guess.';
    const FINISH_LINE = 'It has ended. Answer what is still open, change what it decided if you like, or allow what it skipped. Then press Finish it: the same Mission does the rest.';
    const FINISH_LINE_DECIDED = 'It has ended and decided these itself. Change any of them, then press Finish it, or leave them as they are.';
    const FINISH_LINE_UNDONE = 'It has ended with work left. Press Finish it to give it more time; the same Mission does the rest.';
    const DECIDED_PLACEHOLDER = 'Your answer (empty keeps its choice)';
    const DECIDED_UNDER = 'Empty keeps its choice. A different answer does the items again with yours.';
    const UNASKED_IF_NONE = 'It went on without this. If you leave it, nothing changes.';
    /** What it chose for a question it decided: on Full auto (self) or because you left it to it. */
    const decidedWords = (q) => {
      const chosen = String(q?.chosen ?? q?.assume ?? '').trim() || 'its own judgement';
      return q?.self === true ? `Full auto did not ask you. It chose: ${chosen}` : `You left it to the Mission. It chose: ${chosen}`;
    };
    /** "Item 3, Docs: <why>", for the Not done yet block. */
    const undoneWords = (one) => {
      const why = String(one?.why ?? '').trim();
      const title = String(one?.title ?? '').trim();
      return `Item ${one?.id}${title ? `, ${title}` : ''}${why ? `: ${why}` : ''}`;
    };
    /**
     * After the end, what Finish it sends: the open answers (as answersBody), then a changed answer for each decided question
     * whose field is not empty, and the choices picked for steps waiting for your yes or not asked (only when any).
     * @param {{approvals?: object[], decided?: object[]}} offered what the card shows
     */
    const finishBody = (drafts, skips, decidedDrafts, picks, order, offered = {}) => {
      const answers = answersBody(drafts, skips, null, order);
      for (const q of listOf(offered.decided)) {
        const id = String(q?.id ?? '');
        const text = String(decidedDrafts?.[id] ?? '').trim().slice(0, 1000);
        if (id && text && !answers.some((one) => one.id === id)) answers.push({ id, text });
      }
      const approvals = approvalsBody(picks, offered.approvals);
      return approvals.length > 0 ? { action: 'continue', answers, approvals } : { action: 'continue', answers };
    };
    /**
     * What the card sends: [{id, text} | {id, skip: true} | {id, time}], in the questions' order. Skip wins over text;
     * an empty or untouched field is left out (that question keeps its default).
     */
    const answersBody = (drafts, skips, timePick, order) => {
      const ids = order ?? [...new Set([...Object.keys(drafts ?? {}), ...Object.keys(skips ?? {})])];
      const out = [];
      for (const id of ids) {
        if (skips?.[id] === true) { out.push({ id: String(id), skip: true }); continue; }
        const text = String(drafts?.[id] ?? '').trim().slice(0, 1000);
        if (text) out.push({ id: String(id), text });
      }
      if (timePick?.id && ['keep', 'more', 'none'].includes(timePick.time)) out.push({ id: String(timePick.id), time: timePick.time });
      return out;
    };
    /** The three answers to "not enough time". */
    const timeChoices = (tq) => [
      { value: 'keep', label: `Keep ${Number(tq?.minutes) || 0} min` },
      { value: 'more', label: `Give it ${Number(tq?.extra) || 0} more min` },
      { value: 'none', label: 'No time limit' },
    ];
    /** The suggestion before a continue, from the server's quote. */
    const extraWords = (quote) => {
      const minutes = Number(quote?.minutes) || 0;
      const units = Number(quote?.units) || 0;
      const per = Math.round((Number(quote?.perItem) || 0) * 10) / 10;
      const base = quote?.measured === true
        ? `Suggested: ${minutes} minutes. It took about ${per} minutes per item so far, and ${units === 1 ? '1 item is' : `${units} items are`} left or changed by your answers.`
        : `Suggested: ${minutes} minutes, 10 minutes for each item to do (its work so far was too short to measure its own pace).`;
      const capped = quote?.capped === true ? ` That is the most it suggests; doing all of it may take about ${Number(quote?.needed) || 0} minutes.` : '';
      const raised = quote?.raised === true ? ` Raised to ${minutes} minutes: one step of this Mission takes about ${Number(quote?.stepMinutes) || 0} minutes.` : '';
      const open = quote?.noLimit === true ? 'It had no time limit, so it goes on without one unless you choose a time. ' : '';
      return `${open}${base}${capped}${raised}`;
    };
    /** The (i) texts of the questions card (what / when / change). */
    /** Under a step still waiting for your yes after the end (review of point 17): nothing waits any more. */
    const APPROVAL_IF_NONE_ENDED = 'If you leave it, it stays undone. Allow, then Finish it, takes it up.';
    const INFO_Q = {
      questions: { title: 'Questions for you', what: 'What the Mission needs to know from you, each with the default it uses or the item it holds up.', when: 'Answer what you can while you are here. It waits only for items that need your answer; the rest goes on.', change: 'Items it finished on a default are done again with your answer; an item that waited goes on from where it stopped. Empty fields keep their default.' },
      parked: { title: 'An item waits for this', what: 'This item stopped to wait for your answer and kept its work.', when: 'While the Mission is on, or after it ended.', change: 'Answer or Skip, and it goes on from where it stopped when a helper is free. Without an answer it stays undone and the report lists it.' },
      approvals: { title: 'Waiting for your yes', what: 'Steps a helper needs your yes for. That helper stopped there and kept its work; the other helpers carry on.', when: 'Answer whenever you like. Nothing is thrown away while it waits.', change: 'Allow: the item goes on with it when a helper is free. Deny: it goes on without it, and the Mission does not try another way. Unanswered ones are listed in the report.' },
      allow: { title: 'Allow', what: 'Lets the Mission do this.', when: 'When the step is fine with you.', change: 'For a file or a place, the yes holds for the rest of this thread, as it always does under Mission access.' },
      allowItem: { title: 'Allow for this item', what: 'Lets the helpers of the items that asked use this tool while they do those items.', when: 'When only those items need the tool.', change: 'Taken back when those items are done. Helpers of other items cannot use it.' },
      allowMission: { title: 'Allow for this Mission', what: 'Lets the helpers of this Mission use this tool.', when: 'When more items may need it.', change: 'Taken back when the Mission ends.' },
      deny: { title: 'Deny', what: 'The item goes on without it.', when: 'When you do not want this done.', change: 'The Mission does not try another way. The report lists it.' },
      skip: { title: 'Skip, use your judgement', what: 'The Mission decides this itself instead of taking the default.', when: 'When you have no preference, or the work will show what fits best.', change: 'The report says what it chose. It cannot be taken back for this question.' },
      late: { title: 'Answered too late before', what: 'Answers that came when no step was left to use them.', when: 'Shown after the Mission ended.', change: 'If you continue, those items are done again with your answer.' },
      send: { title: 'Send answers', what: 'Gives the Mission every answer you filled in, at once.', when: 'While it works, is paused or stopped by a problem.', change: 'It goes on with them from its next step. Empty fields keep their default; an item that waits for an empty field keeps waiting. You can also type numbered answers (1., 2., …) in the chat box and press Add note.' },
      back: { title: 'Back', what: 'Goes back to your answers without continuing.', when: 'To change an answer before the Mission continues.', change: 'Nothing is sent. What you typed stays.' },
      otherTime: { title: 'Other time', what: 'Picks a different time for the continued Mission.', when: 'When the suggested time does not suit you.', change: 'From 10 minutes to 12 hours. Continue the Mission uses the time picked here.' },
      field: { title: 'Your answer', what: 'Your answer to this question, in your own words.', when: 'While the Mission has this question for you.', change: 'Left empty, it keeps the default shown under the field.' },
      // Review of point 17: a question the Mission decided itself is not open and has no default: you change its choice.
      decidedField: { title: 'Your answer', what: 'Your answer, to change what the Mission chose.', when: 'After it ended, when you want this done differently.', change: 'Left empty, it keeps its choice. A different answer does the items done on its choice again with yours.' },
      continue: { title: 'Continue the Mission', what: 'Gives your answers to the Mission that ended, and the same Mission goes on with them.', when: 'After you chose how much more time it gets.', change: 'Items it finished on a default are done again only where your answer differs, and items not done yet are taken up again. Items that waited for your answer or your yes go on from where they stopped.' },
      // Point 17: Finish it, and the blocks only its card shows.
      finish: { title: 'Finish it', what: 'Gives your answers, changes and choices to the Mission that ended; the same Mission then does the rest.', when: 'After it ended with something open, decided by itself, or not done.', change: 'It first asks how much more time to give. Items done on a default are done again only where your answer differs; items not done yet are taken up again; items that waited for you go on from where they stopped. Then it waits for you again as Wait for me says.' },
      finishCard: { title: 'Finish the Mission', what: 'What this Mission left open, the questions it decided itself and what it did not finish, in one card.', when: 'After it ended with something left for you.', change: 'Answer, change or allow what you want, then press Finish it. Closing the strip with × hides this card too.' },
      decided: { title: 'Decided by the Mission', what: 'Questions the Mission answered itself: on Full auto, or because you left them to it.', when: 'When you want something done differently.', change: 'Write your answer to change it: the items done on its choice are done again with yours, only where your answer differs. Empty keeps its choice.' },
      unasked: { title: 'Not asked: it needs your yes', what: 'Steps a helper needed your yes for. Full auto never asks and never gives itself permission, so it went on without them.', when: 'When you want those steps done now.', change: 'Allow: the items that needed it do that step when the Mission goes on. Deny, or no choice: nothing changes. The report lists them either way.' },
      undone: { title: 'Not done yet', what: 'Items this Mission did not finish, with the reason.', when: 'Before you press Finish it.', change: 'Finish it takes them up again, within the time you give it.' },
      extraTime: { title: 'More time', what: 'How long the Mission may go on after your answers.', when: 'Before it continues.', change: 'It suggests its own time per item so far, times the items left or changed by your answers: 1 of 10 items left after 100 minutes gives 10 minutes. If it could not measure, 10 minutes for each item to do. It suggests at least 10 minutes and at least one of its steps, and at most a quarter of its first time limit, never more than 30 minutes. Choose another time or No time limit if you like. The time between the end and now does not count.' },
      timeFit: { title: 'Not enough time', what: 'The plan needs more time than the Mission has.', when: 'Asked right after the plan, in its first minute or so.', change: 'Keep: it does the most important items first and lists the rest in its report. Give it more: the time limit moves on by what it suggests, which covers the plan with some time to spare. No time limit: it runs until its checklist is done.' },
      // Stage E: Allow on a change the repair helper asks for.
      repairAllow: { title: 'Allow', what: 'Makes this change for the Mission.', when: 'When the change is fine with you.', change: 'Budget guard, Calls at once and other settings change on their Settings pages, where you can change them back. A fallback model is used only by this Mission\'s helpers, until it ends.' },
      fold: { title: 'Hide', what: 'Folds the questions into one line.', when: 'When you need the room.', change: 'Show opens them again; what you typed stays.' },
    };
    // ---- mission-questions:end ----

    /** A conversation that was not ready when Start Mission was pressed: its message goes first, then the Mission starts from the same words. */
    // The goal belongs to the chat box where Start Mission was pressed (`owner`) and then to the conversation that box turned into
    // (`id`): no other chat or Split pane takes it, and the server starts a Mission only in a conversation that got those very words.
    // ---- waiting-start:begin (the tests run this block on its own) ----
    const WAIT_MS = 180000;
    const waitingStart = { goal: '', at: 0, owner: null, id: '', orphan: false };
    const clearWaiting = () => { waitingStart.goal = ''; waitingStart.at = 0; waitingStart.owner = null; waitingStart.id = ''; waitingStart.orphan = false; };
    /** What a chat box should do with the waiting goal: 'none', 'drop' (forget it), 'refuse' (no Mission may start there: forget it and say why), 'wait' (not yet) or 'start' (now, in this conversation). */
    const waitingStep = (me, sessionId, got, now) => {
      if (!waitingStart.goal) return 'none';
      if (now - waitingStart.at >= WAIT_MS) return 'drop';
      // Only the chat box where it was pressed (or, if that box went away, whichever conversation really got the words: the server checks).
      if (waitingStart.owner !== me && !waitingStart.orphan) return 'none';
      if (!waitingStart.id && waitingStart.owner === me) waitingStart.id = sessionId;
      if (waitingStart.id && waitingStart.id !== sessionId) return waitingStart.owner === me ? 'drop' : 'none';
      // No Mission may start in the conversation it went to (Recon, a helper's): dropped at once, with the reason.
      // Item 4A, stage 6a: also Devices or Workshop without their add-on's rules ('space').
      if (got.runButton === false && (got.runButtonWhy === 'recon' || got.runButtonWhy === 'helper' || got.runButtonWhy === 'space')) return 'refuse';
      if (got.runButton !== true || got.run?.status === 'running' || got.armed === true || got.busy === true) return 'wait';
      return 'start';
    };
    // ---- waiting-start:end ----

    // ---- one card per conversation, shared by the strip and the button (one polling loop per conversation) ----
    // The server stamps every card; a look sends the last stamp (`since`) and gets `{same: true}` while nothing changed.
    // Every 2 s while a Mission is on (or a start waits), every 4 s otherwise; a full card at least every 30 s.
    const FULL_MS = 30000;
    /** Failed looks in a row before a Mission's card is let go (a definite "switched off" or "not open" lets go at once). */
    const CARD_MISSES = 3;
    const LIVE_STATES = ['starting', 'running', 'waiting', 'down', 'paused', 'problem'];
    const missionCards = new Map();
    const cardEntry = (sessionId) => {
      let entry = missionCards.get(sessionId);
      if (!entry) {
        entry = { card: null, failure: '', fullAt: 0, subs: new Set(), watcher: null, error: null, state: 'none' };
        missionCards.set(sessionId, entry);
      }
      return entry;
    };
    const isLiveCard = (card) => LIVE_STATES.includes(card?.strip?.state) || card?.armed === true || Boolean(waitingStart.goal);
    const tellCard = (entry) => { for (const listener of [...entry.subs]) listener(); };
    /** Says which state each conversation's Mission is in, for Modes (the Mission choice in Depth is greyed while one is on). */
    const publishState = (sessionId, entry) => {
      const state = entry.card?.strip?.state ?? 'none';
      if (state === entry.state) return;
      entry.state = state;
      try {
        window.__dshMissionState = { ...(window.__dshMissionState ?? {}), [sessionId]: state };
        window.dispatchEvent(new CustomEvent('dsh-mission:state', { detail: { sessionId, state } }));
      } catch { /* no window */ }
    };
    const takeCard = (sessionId, entry, card) => {
      entry.card = card;
      entry.fullAt = Date.now();
      entry.failure = '';
      entry.misses = 0;
      publishState(sessionId, entry);
      tellCard(entry);
    };
    async function lookCard(sessionId) {
      const entry = cardEntry(sessionId);
      const since = entry.card?.stamp && Date.now() - entry.fullAt < FULL_MS ? String(entry.card.stamp) : '';
      try {
        let got = await longCall('GET', { sessionId, since });
        if (got?.same === true && entry.card) return entry.card;
        // Lab check of point 19 (F2): "nothing changed" with no card in hand (it was let go while this look was on its way)
        // is never kept as a card: a card without its parts greyed Start Mission with the wrong reason. Look again in full.
        if (got?.same === true) got = await longCall('GET', { sessionId, since: '' });
        if (got?.same === true) return entry.card;
        takeCard(sessionId, entry, got);
        return got;
      } catch (failure) {
        const message = messageOf(failure);
        // One dropped look must not clear a Mission's strip (Send, the goal bar and Start Mission would flash back):
        // the last good card stays through two failures in a row, unless the answer is a definite no.
        entry.misses = (entry.misses ?? 0) + 1;
        if (entry.card && entry.misses < CARD_MISSES && !/switched off|not open/i.test(message)) {
          entry.failure = message;
          tellCard(entry);
          if (!failure?.status) throw failure;
          return null;
        }
        const changed = entry.card !== null || entry.failure !== message;
        entry.card = null;
        entry.failure = message;
        publishState(sessionId, entry);
        if (changed) tellCard(entry);
        if (/switched off/i.test(message)) return { off: true };
        // No answer at all (the app's server is gone): back off. An answer that says no (not open yet): look again as usual.
        if (!failure?.status) throw failure;
        return null;
      }
    }
    const pokeCard = (sessionId) => {
      if (!sessionId) { for (const entry of missionCards.values()) entry.watcher?.poke(); return; }
      missionCards.get(sessionId)?.watcher?.poke();
    };
    let cardEventsOn = false;
    const watchCardEvents = () => {
      if (cardEventsOn || typeof window === 'undefined') return;
      cardEventsOn = true;
      const poke = (event) => pokeCard(String(event?.detail?.sessionId ?? ''));
      window.addEventListener('dsh-mission:changed', poke);
      window.addEventListener('dsh-mission:long', poke);
      window.addEventListener('dsh-mission:start', poke);
    };
    const subscribeCard = (sessionId, listener) => {
      watchCardEvents();
      const entry = cardEntry(sessionId);
      entry.subs.add(listener);
      if (!entry.watcher) {
        entry.watcher = dshPoll.loop(async () => {
          const got = await lookCard(sessionId);
          return got?.off ? 60000 : undefined;
        }, { every: () => (isLiveCard(entry.card) ? 2000 : 4000) });
      }
      return () => {
        entry.subs.delete(listener);
        if (entry.subs.size > 0) return;
        entry.watcher?.stop();
        missionCards.delete(sessionId);
      };
    };
    /** A route action; the answer is the new card (plus `said`), kept at once, and every page hears that it changed. */
    async function actCard(sessionId, body) {
      const entry = cardEntry(sessionId);
      const got = await longCall('POST', { sessionId, ...body });
      const { said: _said, ...card } = got ?? {};
      entry.error = null;
      if (card && (card.stamp !== undefined || card.run !== undefined)) takeCard(sessionId, entry, card);
      else tellCard(entry);
      window.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId } }));
      return got ?? {};
    }
    /** A failed main-button action, shown on the strip in plain words with the raw text behind Details. */
    const setCardError = (sessionId, failure) => {
      const entry = cardEntry(sessionId);
      entry.error = failure ? plainFailure(failure) : null;
      tellCard(entry);
    };
    function useMissionCard(sessionId) {
      const [, bump] = useState(0);
      useEffect(() => {
        if (!sessionId) return undefined;
        return subscribeCard(sessionId, () => bump((n) => n + 1));
      }, [sessionId]);
      const entry = sessionId ? missionCards.get(sessionId) : undefined;
      return {
        card: entry?.card ?? null,
        failure: entry?.failure ?? '',
        // The card shown is the last good one: the latest look failed.
        stale: Boolean(entry?.card) && (entry?.misses ?? 0) > 0,
        error: entry?.error ?? null,
        refresh: () => pokeCard(sessionId),
        act: (body) => actCard(sessionId, body),
      };
    }

    /** The End confirmation: a Mission with open questions, or answers that came too late, can still be continued from the card. */
    const endQuestion = (open) => (open > 0
      ? 'End the Mission now and write its report? Afterwards it can only be continued by answering the questions it still has.'
      : 'End the Mission now and write its report? It cannot be continued afterwards.');

    /**
     * Point 17: the strip's Finish it asks the questions card of the same chat box (Split Plus pane) to unfold and take the
     * focus. A page-only event: `from` is the pressed button, so another pane on the same conversation keeps its card as it is.
     */
    const finishIt = (sessionId, from) => {
      try { window.dispatchEvent(new CustomEvent('dsh-mission:finish', { detail: { sessionId, from } })); } catch { /* no window */ }
    };

    /** The status strip (formerly the run card): how the Mission stands, in words, with Pause, Finish this lap, End, Checklist and Report. */
    function RunCard({ sessionId }) {
      const store = useMissionCard(sessionId);
      const card = store.card;
      // A button's message, with the state it was said in: it goes once the Mission moves on (Resume, a new question, the end).
      const [note, setNote] = useState({ text: '', state: null });
      const [showReport, setShowReport] = useState(false);
      // The strip stays one line high over the chat box; the checklist opens on request.
      const [showList, setShowList] = useState(false);
      // Lab check of point 19: the card of changes that wait for your OK after the end, and a press being sent.
      const [showOks, setShowOks] = useState(false);
      const [okBusy, setOkBusy] = useState(false);
      const [, bump] = useState(0);
      const run = card?.run ?? null;
      const strip = card?.strip ?? null;
      const state = strip?.state ?? 'none';
      const live = LIVE_STATES.includes(state) && state !== 'starting';
      // A button's message belongs to its run: a new run in the same chat starts without the last one's.
      const runId = run?.id;
      // A new run starts with the OK card shut too, so it never opens by itself.
      useEffect(() => { setNote({ text: '', state: null }); setShowOks(false); }, [runId]);
      // A button's message goes once the strip leaves the state it was said in, so it never comes back with a later
      // state of the same kind (Try now's line after the server was back and then went away again).
      useEffect(() => { setNote((now) => (now.state && now.state !== state ? { text: '', state: null } : now)); }, [state]);
      // Before this version the app's goal bar was hidden page-wide; now only in the pane whose Mission is on (the seat attribute).
      useEffect(() => { document.documentElement.removeAttribute('data-dsh-long-run'); }, []);
      // Finish this lap can do nothing once the time is up: the strip redraws at the deadline, without waiting for a new card.
      const deadline = Number(run?.deadline) || 0;
      useEffect(() => {
        if (!deadline || state !== 'running') return undefined;
        const wait = deadline - Date.now();
        if (wait <= 0) return undefined;
        const timer = setTimeout(() => bump((n) => n + 1), Math.min(wait + 50, 2147483000));
        return () => clearTimeout(timer);
      }, [deadline, state]);
      // Time left moves on while nothing else changes: the store fetches a full card (and so redraws) at least every 30 s.
      if (state === 'none') return null;
      // Closed with × (by run and end, so a continued run that ends again shows again), or more than a day old: hidden.
      // Lab check of point 19: while a change waits for your OK the strip stays (also after × and after a day): its button
      // is the only way to answer. Then it holds only that, the report and the checklist (no Finish it, no ×).
      const waitingOks = state === 'finished' && Array.isArray(strip?.oks) && strip.oks.length > 0;
      const onlyOks = state === 'finished' && !finishedShown(run, dismissedRuns(), Date.now());
      // What your last Allow or Deny did stays readable until you close it.
      if (onlyOks && !waitingOks && !note.text) return null;
      const now = Date.now();
      const said = stripWords(card, now);
      const act = async (action) => {
        setNote({ text: '', state: null });
        try {
          const next = await store.act({ action });
          // Try now's line belongs to the wait for the model server: it goes as soon as the server is back (owner point 19).
          if (next.said) setNote({ text: String(next.said).split('\n')[0], state: action === 'try-now' ? 'down' : next.strip?.state ?? null });
        } catch (error) {
          setCardError(sessionId, error);
        }
      };
      const items = Array.isArray(run?.items) ? run.items : [];
      const questions = Array.isArray(strip?.questions) ? strip.questions : [];
      const finished = state === 'finished';
      // Stage E: while it waits for the model server ('down') it can be paused, ended or finished after this lap too.
      const running = state === 'running' || state === 'waiting' || state === 'down';
      const down = state === 'down';
      // The server says whether it can still do something; past the deadline it never can (the card may be up to 30 s old),
      // except while it waits for you or for its model server: its clock stands still then (the deadline moves on afterwards).
      const canFinish = strip?.canFinishLap === true && (state === 'waiting' || down || !(deadline > 0 && now >= deadline));
      const repairLine = live ? repairWords(strip, now) : '';
      const carried = carriedWords(strip, now);
      const repairs = repairRows(run);
      const finishable = finished && strip?.canContinue === true && !onlyOks;
      // Lab check of point 19: changes that wait for your OK after the end (Allow or Deny here; nothing runs again).
      const oks = finished && Array.isArray(strip?.oks) ? strip.oks : [];
      const answerOk = async (id, choice) => {
        if (okBusy) return;
        setOkBusy(true);
        setNote({ text: '', state: null });
        try {
          const next = await store.act({ action: 'ok', id: String(id), choice });
          // Said after the end: it goes once the strip leaves 'finished' (Finish it runs the Mission again).
          if (next.said) setNote({ text: String(next.said).split('\n')[0], state: next.strip?.state ?? 'finished' });
        } catch (error) {
          setCardError(sessionId, error);
        } finally {
          setOkBusy(false);
        }
      };
      const okCard = showOks && oks.length > 0 ? h('div', { className: 'dsh-ms-qitem', role: 'group', 'aria-label': 'Changes that wait for your OK', 'data-oks-card': '' },
        h('div', null, h('b', null, 'Changes that wait for your OK'), h(ui.Info, INFO.oks)),
        oks.map((a) => {
          const reason = String(a.reason ?? '').trim().slice(0, 300);
          const what = String(a.what ?? '');
          return h('div', { key: String(a.id), className: 'dsh-ms-qappr' },
            h('div', { className: 'dsh-ms-qwhat' }, what),
            a.status === 'unasked' ? h('p', { className: 'dsh-ms-qmeta' }, 'Full auto did not ask this while it ran.') : null,
            reason ? h('p', { className: 'dsh-ms-qsay' }, `The repair helper said: “${reason}”`) : null,
            h('p', { className: 'dsh-ms-qmeta' }, 'Allow makes this change now. Deny leaves it as it is. The Mission stays as it ended; nothing runs again.'),
            h('div', { className: 'dsh-ms-qrow', role: 'group', 'aria-label': `Your choice for: ${what}`.slice(0, 160) },
              h('button', { type: 'button', className: 'dsh-ms-qskip', 'data-ok-change': String(a.id), 'aria-busy': okBusy, 'aria-disabled': okBusy, onClick: () => { if (!okBusy) void answerOk(a.id, 'allow'); } }, 'Allow'),
              h('button', { type: 'button', className: 'dsh-ms-qskip', 'data-ok-change': String(a.id), 'aria-busy': okBusy, 'aria-disabled': okBusy, onClick: () => { if (!okBusy) void answerOk(a.id, 'deny'); } }, 'Deny')));
        })) : null;
      return h('div', { className: 'dsh-ms-run', role: 'region', 'aria-label': `Mission: ${said.words}` },
        h('style', null, CSS),
        // The step count and time left change every few seconds: not a live region. Screen readers hear only the state
        // changing (below), and a problem once, from its error note.
        h(ui.StateLine, { state: said.dot, words: state === 'problem' ? 'Stopped by a problem' : said.words, next: state === 'problem' ? '' : said.next, live: false }),
        state === 'problem' ? null : h('span', { className: 'dsh-ms-sr', role: 'status' }, STATE_SAID[state] ?? ''),
        run ? h('div', { className: 'dsh-ms-run-actions' },
          // Point 17: after an end with something left for you, Finish it unfolds this pane's card (never the main button).
          finishable ? h(ui.Button, { main: true, 'data-finish-it': '', onClick: (event) => finishIt(sessionId, event?.currentTarget ?? null) }, 'Finish it') : null,
          finishable ? h(ui.Info, INFO.finish) : null,
          // Lab check of point 19: never the main button next to Finish it; the main one when nothing else is left.
          oks.length > 0 ? h(ui.Button, { main: !finishable, 'data-oks': '', 'aria-expanded': showOks, onClick: () => setShowOks((v) => !v) }, okButton(oks.length)) : null,
          oks.length > 0 ? h(ui.Info, INFO.oks) : null,
          down ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => void act('try-now') }, 'Try now') : null,
          down ? h(ui.Info, INFO.tryNow) : null,
          running ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => void act('pause') }, 'Pause') : null,
          running ? h(ui.Info, INFO.pause) : null,
          canFinish ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => void act('finish-lap') }, 'Finish this lap') : null,
          canFinish ? h(ui.Info, INFO.finishLap) : null,
          live ? h('button', { type: 'button', className: 'dsh-ms-btn', onClick: () => { void askInPage({ text: endQuestion(questions.length + (Array.isArray(run?.lateAnswers) ? run.lateAnswers.length : 0) + (Array.isArray(strip?.approvals) ? strip.approvals.length : 0)), ok: 'End Mission', danger: true }).then((yes) => { if (yes) void act('end'); }); } }, 'End') : null,
          live ? h(ui.Info, INFO.end) : null,
          h('button', { type: 'button', className: 'dsh-ms-btn', 'aria-expanded': showList, onClick: () => setShowList((v) => !v) }, showList ? 'Hide checklist' : `Checklist (${items.length})`),
          h(ui.Info, INFO.checklist),
          finished ? h('button', { type: 'button', className: 'dsh-ms-btn', 'aria-expanded': showReport, onClick: () => setShowReport((v) => !v) }, showReport ? 'Hide report' : 'Report') : null,
          finished ? h(ui.Info, INFO.report) : null,
          finished && oks.length === 0 ? h('button', { type: 'button', className: 'dsh-ms-btn', 'aria-label': 'Close', title: 'Close this strip and its questions', onClick: () => { dismissRun(dismissKey(run)); setNote({ text: '', state: null }); bump((n) => n + 1); tellCard(cardEntry(sessionId)); } }, '×') : null) : null,
        state === 'problem' ? h(ui.ErrorNote, { what: strip?.problem?.text || 'It stopped and could not go on by itself.', fix: problemFix(strip, now), details: strip?.problem?.details || undefined }) : null,
        // Stage E: the model server does not answer; what it last said is behind Details.
        down ? h(ui.ErrorNote, { what: DOWN_WHAT, fix: DOWN_FIX, details: String(strip?.down?.last ?? '').trim() || undefined }) : null,
        // Stage E: the repair helper at work, or its last fix (for 30 minutes), and the note after it carried on by itself.
        repairLine ? h('div', { className: 'dsh-ms-run-meta', 'data-repair': '' }, repairLine, h(ui.Info, INFO.repair)) : null,
        carried ? h('div', { className: 'dsh-ms-run-meta' }, carried) : null,
        okCard,
        // Stage C: the questions are no longer listed here; the questions card under the strip shows them, with a field each.
        // Items set aside by a Mission from before stage D (helpers there waited for a yes, then were set aside).
        finished && run?.hasAside && !finishable ? h('div', { className: 'dsh-ms-run-meta' }, 'Some items were set aside for your yes: type /mission resume to take them up again.') : null,
        // The morning report: the summary line at the top of a finished run.
        finished && run?.report ? h('div', { className: 'dsh-ms-run-meta' }, run.report.split('\n')[0]) : null,
        // Stage D: fewer helpers than asked, and why (no checkpoints in this folder, or Calls at once for the model server).
        showList && run && helpersWhyWords(run) ? h('div', { className: 'dsh-ms-run-meta' }, helpersWhyWords(run)) : null,
        // Point 17: what it does when it needs you, and how long it waits.
        showList && run && needsMeta(run) ? h('div', { className: 'dsh-ms-run-meta' }, needsMeta(run)) : null,
        !showList || !run ? null : h('ul', { className: 'dsh-ms-run-list' },
          items.map((item) => {
            const doing = itemWords(item, run);
            return h('li', { key: item.id },
              h('span', { className: 'dsh-ms-run-mark', 'data-ok': String(item.status === 'verified' || item.status === 'reviewed') }, MARKS[item.status] ?? item.status),
              h('span', null, `${item.id}. ${item.title}`, doing ? h('span', { className: 'dsh-ms-run-meta' }, ` · ${doing}`) : null));
          })),
        // Stage E: the repairs, each with its way back.
        showList && repairs.length > 0 ? h('div', { className: 'dsh-ms-run-meta', role: 'group', 'aria-label': 'Repairs' },
          h('b', null, 'Repairs'), h(ui.Info, INFO.repair),
          h('ul', { className: 'dsh-ms-run-list' }, repairs.map((line, k) => h('li', { key: `r${k}` }, line)))) : null,
        showReport && run?.report ? h('div', { className: 'dsh-ms-run-report' }, run.report) : null,
        store.stale ? h('div', { className: 'dsh-ms-run-meta' }, 'Can\'t reach the Mission right now. This shows how it stood last; it looks again by itself.') : null,
        store.error ? h(ui.ErrorNote, { what: store.error.what, fix: store.error.fix || undefined, details: store.error.details || undefined }, h('button', { type: 'button', className: 'dshu-link', onClick: () => setCardError(sessionId, null) }, 'Close')) : null,
        // Not twice: after End the strip's summary line already says what the button said.
        note.text && (note.state === null || note.state === state) && !(finished && run?.report && run.report.split('\n')[0] === note.text) ? h('div', { className: 'dsh-ms-run-meta', role: 'status' }, note.text) : null);
    }

    /**
     * This chat's Mission settings, opened from Depth → Mission settings…: time limit (or none), laps, steps, helpers at
     * once, file changes, tools and the rest, saved for the chat. Start Mission and a typed /mission use them.
     */
    function LongSetup({ sessionId, onClose }) {
      const [card, setCard] = useState(null);
      const [values, setValues] = useState(null);
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState(null);
      const [saved, setSaved] = useState('');
      useEffect(() => {
        let alive = true;
        longCall('GET', { sessionId }).then((next) => {
          if (!alive) return;
          setCard(next);
          const saved = next.saved ?? { ...next.defaults, mode: next.mode, tools: next.tools };
          // Stage D: helpers at once, this chat's choice, else the default (Settings → Mission); older cards have neither.
          const helpers = Number(saved.helpers ?? next.defaults?.helpers) || 4;
          // Point 17: When it needs you (this chat's, else the default) and Wait for me (null: the default for that choice).
          const needs = readNeedsShown(saved.needs ?? next.defaults?.needs ?? 'ask');
          const wait = next.saved ? readWaitShown(next.saved.wait) : null;
          // Stage E: what the assistant may do while the Mission is paused, and Carry on by itself after a restart (this chat's, else the default).
          const assistant = readAssistantShown(saved.assistant ?? next.defaults?.assistant);
          const carryOn = (saved.carryOn ?? next.defaults?.carryOn) !== false;
          setValues({ steps: 0, ...saved, helpers: Math.min(8, Math.max(1, Math.round(helpers))), files: saved.tools?.files !== false, web: saved.tools?.web === true, needs, wait, assistant, carryOn });
        }).catch((error) => alive && setNote(error));
        return () => { alive = false; };
      }, [sessionId]);
      // Escape closes it, like the app's own dialogs (a pop-up (i) open inside takes its Escape first).
      useEffect(() => {
        const onKey = (event) => { if (event.key === 'Escape' && !event.defaultPrevented) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [onClose]);
      const set = (key, value) => setValues((before) => ({ ...before, [key]: value }));
      const save = async () => {
        setBusy(true);
        setNote(null);
        try {
          const { files, web, tools: _tools, waitFor: _waitFor, ...rest } = values ?? {};
          const got = await longCall('POST', { sessionId, action: 'save', ...rest, needs: readNeedsShown(rest.needs), wait: readWaitShown(rest.wait), assistant: readAssistantShown(rest.assistant), carryOn: rest.carryOn !== false, tools: { files: files !== false, web: web === true } });
          window.dispatchEvent(new CustomEvent('dsh-mission:changed', { detail: { sessionId } }));
          // Stage E: while a Mission is on, two of these apply to it at once; the server says so, and the dialog shows it.
          const on = LIVE_STATES.includes(card?.strip?.state) && card?.strip?.state !== 'starting';
          const said = String(got?.said ?? '').trim();
          if (on && said) setSaved(said);
          else onClose();
        } catch (error) {
          setNote(error);
        } finally {
          setBusy(false);
        }
      };
      const ticks = card?.preflight?.ticks ?? [];
      const number = (key, label, min, max, hint, info) => h(ui.Row, { title: label, desc: hint, info: info ?? { what: hint } },
        h('input', { type: 'number', className: 'dsh-ms-field', min, max, value: values?.[key] ?? '', 'aria-label': label, onChange: (event) => set(key, Number(event.target.value)) }));
      const toggle = (key, label, hint, info) => h(ui.Row, { title: label, desc: hint, info: info ?? { what: hint } },
        h(ui.Switch, { on: values?.[key] === true, label, onChange: (on) => set(key, on) }));
      const minutes = Number(values?.minutes) || 0;
      const times = TIME_CHOICES.some((choice) => choice.value === minutes) ? TIME_CHOICES : [...TIME_CHOICES, { value: minutes, label: `${minutes} min` }].sort((a, b) => a.value - b.value);
      const needs = readNeedsShown(values?.needs);
      const waitShown = readWaitShown(values?.wait) ?? waitDefaultOf(needs, card?.defaults);
      return h('div', { className: 'dsh-ms-modal-back', onClick: (event) => { if (event.target === event.currentTarget) onClose(); } },
        h('div', { className: 'dsh-ms-modal', role: 'dialog', 'aria-label': 'Mission settings' },
          h('style', null, CSS),
          h('h2', { className: 'dsh-ms-title' }, 'Mission settings'),
          h('p', { className: 'dsh-ms-desc' }, 'For this thread. Start Mission (beside Send) and a typed /mission use these.'),
          h('ul', { className: 'dsh-ms-ticks' }, ticks.map((tick) => h('li', { key: tick.key },
            h('span', { 'data-ok': tick.warn ? 'warn' : String(tick.ok) }, tick.ok === true ? '✓' : tick.warn ? '!' : tick.ok === false ? '✗' : '–'),
            h('span', null, tick.text)))),
          values ? h(React.Fragment, null,
            h(ui.Row, { title: 'Time limit', desc: minutes > 0 ? 'It stops between steps, so it can go over by the step under way.' : 'It runs until its checklist is done.', info: INFO.time },
              h('select', { className: 'dsh-ms-field', value: String(minutes), 'aria-label': 'Time limit', onChange: (event) => set('minutes', Number(event.target.value)) },
                times.map((choice) => h('option', { key: choice.value, value: String(choice.value) }, choice.label)))),
            number('laps', 'Laps', 0, 50, 'A lap: work, the overall commands, a review. 0: no lap limit.', INFO.laps),
            number('steps', 'Steps', 0, 2000, '0: worked out from the laps.', INFO.steps),
            h(ui.Row, { title: 'Helpers at once', desc: Number(values.helpers) === 1 ? 'One item at a time.' : 'How many checklist items are worked on at the same time.', info: INFO.helpers },
              h('select', { className: 'dsh-ms-field', value: String(values.helpers ?? 4), 'aria-label': 'Helpers at once', onChange: (event) => set('helpers', Number(event.target.value)) },
                [1, 2, 3, 4, 5, 6, 7, 8].map((n) => h('option', { key: n, value: String(n) }, String(n))))),
            // Point 17: what it does when it needs you, and how long it waits ('' is the default for that choice).
            h(ui.Row, { title: 'When it needs you', desc: NEEDS_CHOICES.find((choice) => choice.id === needs)?.desc ?? '', info: INFO.needs },
              h('select', { className: 'dsh-ms-field', value: needs, 'aria-label': 'When it needs you', onChange: (event) => set('needs', readNeedsShown(event.target.value)) },
                NEEDS_CHOICES.map((choice) => h('option', { key: choice.id, value: choice.id }, choice.label)))),
            h(ui.Row, { title: 'Wait for me', desc: waitDesc(needs, waitShown), info: INFO.wait },
              h('select', { className: 'dsh-ms-field', value: needs === 'decide' || values.wait === null || values.wait === undefined ? '' : String(values.wait), 'aria-label': 'Wait for me', disabled: needs === 'decide', onChange: (event) => set('wait', event.target.value === '' ? null : readWaitShown(event.target.value)) },
                // Full auto never waits: one option that says so (the chat's own wait stays kept for the other choices).
                needs === 'decide' ? h('option', { value: '' }, 'Never waits') : h('option', { value: '' }, waitDefaultLabel(needs, card?.defaults)),
                needs === 'decide' ? null : waitOptions(values.wait).map((choice) => h('option', { key: String(choice.value), value: String(choice.value) }, choice.label)))),
            // Stage E (point 8): what the conversation's own assistant may do while this Mission is paused.
            h(ui.Row, { title: 'While a Mission runs, the assistant can', desc: assistantDesc(values.assistant), info: INFO.assistantSettings },
              h('select', { className: 'dsh-ms-field', value: readAssistantShown(values.assistant), 'aria-label': 'While a Mission runs, the assistant can', onChange: (event) => set('assistant', readAssistantShown(event.target.value)) },
                ASSISTANT_CHOICES.map((choice) => h('option', { key: choice.id, value: choice.id }, choice.label)))),
            // Stage E (point 9).
            h(ui.Row, { title: 'Carry on by itself after a restart', desc: carryOnDesc(values.carryOn), info: INFO.carryOn },
              h(ui.Switch, { on: values.carryOn !== false, label: 'Carry on by itself after a restart', onChange: (on) => set('carryOn', on) })),
            h(ui.Row, { title: 'Mission access', desc: MODES.find((mode) => mode.id === values.mode)?.text ?? '', info: { what: 'How freely the Mission may change files in this thread\'s folder.', change: 'Restricted asks once per existing file; Ask also asks before anything outside the folder; Auto works without asking inside the folder.' } },
              h('select', { className: 'dsh-ms-field', value: values.mode, 'aria-label': 'Mission access', onChange: (event) => set('mode', event.target.value) }, MODES.map((mode) => h('option', { key: mode.id, value: mode.id }, mode.label)))),
            // The Mission's tools in this mode (starting choice: Settings → Modes → Mission tools).
            toggle('files', 'Files and commands', 'The Mission may read and change files in this folder and run commands, whatever this mode allows otherwise.'),
            toggle('web', 'Web', 'The Mission may search and read the web.'),
            minutes > 0 ? toggle('fullTime', 'Use the full time', 'Off: it stops after two laps in a row find nothing more to do.') : null,
            toggle('keepAwake', 'Keep the Mac awake', 'While it runs and the Mac is on power.'),
            toggle('battery', 'Also on battery', 'Drains the battery.'),
            toggle('retry', 'Try again by itself', RETRY_FORM_TEXT, INFO.retry),
            toggle('effort', 'Think by role', 'Planner and reviewer High, workers Medium.'),
            number('tokenCap', 'Token allowance', 0, 10000000000, '0 sets none. With one, the Mission ends with its report once it has used this many tokens. Budget guard still stops a single round that runs away.')) : null,
          note ? h(ui.ErrorNote, { error: note, fix: 'Check the values and press Save again.' }) : null,
          saved ? h(ui.StateLine, { state: 'ok', words: saved, live: true }) : null,
          saved
            ? h('div', { className: 'dsh-ms-modal-foot' }, h('button', { type: 'button', className: 'dsh-ms-btn', onClick: onClose }, 'Close'))
            : h('div', { className: 'dsh-ms-modal-foot' },
              h('button', { type: 'button', className: 'dsh-ms-btn', onClick: onClose }, 'Cancel'),
              h('button', { type: 'button', className: 'dsh-ms-btn', disabled: busy || !values, onClick: () => void save() }, busy ? 'Saving…' : 'Save'))));
    }

    /**
     * The app's own Send button in the same chat box as `from`: the composer's primary button (its CSS
     * module class `…_primary`, with aria-busy; the model menu's button also carries aria-busy).
     * @returns {HTMLButtonElement | null}
     */
    const sendButtonNear = (from) => {
      for (let node = from?.parentElement; node && node !== document.body; node = node.parentElement) {
        const found = [...node.querySelectorAll('button[aria-busy][class*="_primary"]')].filter((button) => !button.closest('.dsh-ms-runbtn-wrap'));
        if (found.length === 0) continue;
        const button = found[found.length - 1];
        // Only a plain Send: never the same button while it is Stop (a square), sending (a circle) or Continue.
        if (button.disabled || button.getAttribute('aria-busy') === 'true' || button.querySelector('rect, circle, [class*="continueIcon"]')) return null;
        // And only with something typed in that chat box.
        const editor = node.querySelector('[contenteditable="true"], textarea');
        if (editor && String(editor.textContent || editor.value || '').trim() === '') return null;
        return button;
      }
      return null;
    };

    /** What a button says when the chat box holds a / command: Enter runs it; a Mission needs words. */
    const SLASH_TIP = 'Press Enter to run a / command, or type what the Mission should do.';
    /** The question before a Mission starts: it works alone, possibly for a long time, and can use many tokens. */
    const askMission = (saved) => askInPage({ title: 'Start a Mission?', text: missionWords(saved).confirm, ok: 'Start Mission' });
    /** This chat's saved Mission settings, with the default helpers at once when the chat never chose (stage D). */
    // Point 17: also When it needs you and its wait, from the defaults, for a card that does not say them for this chat.
    const savedWithHelpers = (got) => {
      const saved = got?.saved;
      if (!saved) return null;
      const defaults = got?.defaults ?? {};
      const fill = {};
      if (saved.helpers === undefined && Number(defaults.helpers) > 0) fill.helpers = defaults.helpers;
      const needs = saved.needs ?? (NEEDS_CHOICES.some((choice) => choice.id === defaults.needs) ? defaults.needs : undefined);
      if (saved.needs === undefined && needs !== undefined) fill.needs = needs;
      if ((saved.waitFor === undefined || saved.waitFor === null) && (needs === 'ask' || needs === 'wait')) {
        const own = readWaitShown(saved.wait);
        const wait = own ?? (needs === 'wait' ? readWaitShown(defaults.waitHold) : readWaitShown(defaults.waitAsk));
        if (wait !== null) fill.waitFor = wait;
      }
      if (saved.waitFor === undefined && needs === 'decide') fill.waitFor = 0;
      return Object.keys(fill).length > 0 ? { ...saved, ...fill } : saved;
    };
    /**
     * A chat that is not open yet has no card: Start Mission's question names the defaults from Settings → Mission (When
     * it needs you and its Wait for me, review of point 17). null when they cannot be read (the question then says less).
     */
    const savedDefaults = async () => {
      try {
        const got = await longCall('GET', { defaults: true });
        const defaults = got?.defaults ?? {};
        if (!NEEDS_CHOICES.some((choice) => choice.id === defaults.needs)) return null;
        return savedWithHelpers({ saved: { mode: got.mode, ...(Number(defaults.minutes) >= 0 ? { minutes: defaults.minutes } : {}), ...(Number(defaults.laps) >= 0 ? { laps: defaults.laps } : {}) }, defaults });
      } catch {
        return null;
      }
    };
    /**
     * Stage D (owner, 20 November, point 16): choosing Mission in Depth only selects it. Modes publishes the choice per
     * conversation (window.__dshDepthMission and the 'dsh-modes:depth-mission' event); Start Mission is then drawn as the
     * main button. Nothing starts and nothing is asked until Start Mission is pressed.
     */
    const depthMissionOf = (sessionId) => {
      try { return Boolean(sessionId) && window.__dshDepthMission?.[sessionId] === true; } catch { return false; }
    };
    function useDepthMission(sessionId) {
      const [chosen, setChosen] = useState(() => depthMissionOf(sessionId));
      useEffect(() => {
        setChosen(depthMissionOf(sessionId));
        const onPick = (event) => { if (String(event?.detail?.sessionId ?? '') === sessionId) setChosen(event.detail.on === true); };
        window.addEventListener('dsh-modes:depth-mission', onPick);
        return () => window.removeEventListener('dsh-modes:depth-mission', onPick);
      }, [sessionId]);
      return chosen;
    }
    /**
     * Why Start Mission is greyed, from the server's reason (lab check of point 19, F2): Recon only in Recon, a helper's
     * conversation only there; a conversation with no message yet says what to do first. Never Recon outside Recon.
     */
    const RUN_BUTTON_RECON = 'A Mission cannot start here: Recon keeps Missions out unless Settings → Recon allows them.';
    const RUN_BUTTON_HELPER = 'A Mission cannot start here: this is a helper\'s thread, and a helper never starts a Mission.';
    const RUN_BUTTON_FIRST = 'Send a first message to start this thread; then Start Mission works here.';
    const RUN_BUTTON_WAIT = 'Start Mission is not ready here yet. Wait a moment, then try again.';
    /** Item 4A, stage 6a: Devices or Workshop whose add-on gives no rules: the server's sentence (stage 7: English only, also on a Chinese page). */
    const RUN_BUTTON_SPACE = 'Mission is not available here: this space\'s rules for a Mission come from its add-on, which is off or too old. Switch it on on the Plugins page (or update it), or start the Mission in the Chat or Code space.';
    const runButtonSpace = (got) => String(got?.runButtonText || RUN_BUTTON_SPACE);
    const runButtonNo = (got) => (got?.runButtonWhy === 'recon' ? RUN_BUTTON_RECON : got?.runButtonWhy === 'helper' ? RUN_BUTTON_HELPER : got?.runButtonWhy === 'space' ? runButtonSpace(got) : got?.hasThread === true ? RUN_BUTTON_WAIT : RUN_BUTTON_FIRST);
    /** Why no Mission starts while Mission is switched off. */
    const OFF_START = 'Mission is switched off in Settings → Mission, so a Mission cannot start here. Switch it on there first.';
    /**
     * Why no Mission can start in this conversation at all ('' when one can, or when that is not known yet): Mission switched
     * off, Recon keeping Missions out, or a pre-flight check that fails (no folder, Creator Plus, helpers off, no git). A
     * Mission already on is not counted: Depth greys its Mission option for that itself.
     */
    const cannotStartHere = (got, off) => {
      if (off) return OFF_START;
      if (!got) return '';
      if (got.runButton !== true) return runButtonNo(got);
      if (got.preflight?.ok === false) return (got.preflight.ticks ?? []).find((tick) => tick.required !== false && tick.ok !== true && tick.key !== 'free')?.text ?? '';
      return '';
    };
    /**
     * Said to Modes per conversation (window.__dshMissionCannot and the 'dsh-mission:cannot' event), so Depth's Mission
     * option is greyed with the reason where no Mission can start, instead of telling the user to press a greyed button.
     */
    const publishCannot = (sessionId, why) => {
      if (!sessionId) return;
      try {
        const all = window.__dshMissionCannot && typeof window.__dshMissionCannot === 'object' ? window.__dshMissionCannot : {};
        if ((all[sessionId] ?? '') === why) return;
        all[sessionId] = why;
        window.__dshMissionCannot = all;
        window.dispatchEvent(new CustomEvent('dsh-mission:cannot', { detail: { sessionId, why } }));
      } catch { /* an older page: Depth keeps its option */ }
    };
    const editorText = (editor) => String(editor?.innerText ?? editor?.textContent ?? editor?.value ?? '').trim();
    /** Empties the chat box after a note, an answer or a Resume: the app's own draft action when it is handed over, else the editor's delete. */
    const clearDraft = async (editor, inputActions) => {
      try {
        if (typeof inputActions?.setDraft === 'function') { inputActions.setDraft(''); return true; }
      } catch { /* fall back to the editor */ }
      if (!editor) return false;
      try {
        editor.focus();
        document.execCommand('selectAll');
        document.execCommand('delete');
      } catch { /* the text stays */ }
      await new Promise((resolve) => setTimeout(resolve, 60));
      return editorText(editor) === '';
    };
    const PLAY_ICON = 'M4.5 2.8v10.4c0 .6.7 1 1.2.6l8-5.2c.5-.3.5-1 0-1.3l-8-5.2c-.5-.3-1.2 0-1.2.7z';

    /**
     * Beside Send. With no Mission in the conversation: Start Mission, which starts one with what is typed and the whole
     * thread as its brief (one question first). While a Mission is on, the main button takes Send's place: Add note
     * (running), Answer and continue (it has questions) or Resume (paused or stopped by a problem). It never presses
     * the app's Send or Stop: notes and answers go to the Mission directly. The app's Stop stays and pauses it at once.
     */
    function RunButton({ sessionId, inputActions }) {
      const store = useMissionCard(sessionId);
      const card = store.card;
      const [tip, setTipText] = useState('');
      // How long the tip stays: 6 s, and 8 s for the one after Mission is picked in Depth.
      const tipMs = useRef(6000);
      const setTip = (text, ms = 6000) => { tipMs.current = ms; setTipText(text); };
      const depthChosen = useDepthMission(sessionId);
      const [busy, setBusy] = useState(false);
      // Mission switched off in its settings: no Mission buttons in any mode (the row stays the same everywhere).
      const [off, setOff] = useState(false);
      useEffect(() => { setOff(/switched off/i.test(String(store.failure ?? ''))); }, [store.failure]);
      const offRef = useRef(off);
      offRef.current = off;
      // Where no Mission can start, Depth's Mission option says so (greyed, with the reason).
      const cannot = cannotStartHere(card, off);
      useEffect(() => { publishCannot(sessionId, cannot); }, [sessionId, cannot]);
      const ref = useRef(null);
      const me = useRef({});
      const [seat, setSeat] = useState(null);
      const seatRef = useRef(null);
      seatRef.current = seat;
      const strip = card?.strip ?? null;
      const state = strip?.state ?? 'none';
      const main = card && card.runButton === true && strip?.main ? strip.main : 'send';
      const mainRef = useRef(main);
      mainRef.current = main;
      const cardRef = useRef(card);
      cardRef.current = card;
      // Lab check of point 19 (F3): a conversation the server says is not open yet. Whether it would be isolated (Recon) is
      // asked once, so Enter on a typed /mission is caught only where a Mission may start (undefined: not known yet).
      const failureRef = useRef('');
      failureRef.current = String(store.failure ?? '');
      const notOpen = !card && /not open/i.test(failureRef.current);
      const isolatedNewRef = useRef(undefined);
      useEffect(() => {
        isolatedNewRef.current = undefined;
        if (!notOpen || !sessionId) return undefined;
        let alive = true;
        longCall('GET', { defaults: true, sessionId }).then((got) => {
          if (alive && typeof got?.isolated === 'boolean') isolatedNewRef.current = got.isolated;
        }).catch(() => { /* not known: Enter goes to the app's own /mission */ });
        return () => { alive = false; };
      }, [notOpen, sessionId]);
      // The chat box this button sits in (one per Split pane): the Mission's attributes go there, not on the page.
      useEffect(() => {
        const node = ref.current;
        const found = node ? (node.closest('[data-composer-seat]') ?? node.closest('[data-conversation-session]')) : null;
        if (found !== seat) setSeat(found);
      });
      useEffect(() => {
        if (!seat) return undefined;
        if (LIVE_STATES.includes(state)) seat.setAttribute('data-dsh-mission', state); else seat.removeAttribute('data-dsh-mission');
        if (main === 'note' || main === 'answer' || main === 'resume') seat.setAttribute('data-dsh-mission-main', main); else seat.removeAttribute('data-dsh-mission-main');
        return () => { seat.removeAttribute('data-dsh-mission'); seat.removeAttribute('data-dsh-mission-main'); };
      }, [seat, state, main]);
      useEffect(() => { document.documentElement.removeAttribute('data-dsh-long-run'); }, []);
      useEffect(() => {
        if (!tip) return undefined;
        const timer = setTimeout(() => setTipText(''), tipMs.current);
        return () => clearTimeout(timer);
      }, [tip]);
      const act = (body) => actCard(sessionId, body);
      const seatEditor = () => seatRef.current?.querySelector('[data-composer-input]') ?? null;
      const hasAttachments = () => Boolean(seatRef.current?.querySelector('[data-slot="conversation.input.attachments"] [class*="_rail"]'));

      // Starts the Mission that waited for this chat's first message, once the conversation is done answering.
      const maybeStartWaiting = async (got) => {
        const step = waitingStep(me.current, sessionId, got, Date.now());
        if (step === 'drop') clearWaiting();
        if (step === 'refuse') { clearWaiting(); setTip(`No Mission was started. ${runButtonNo(got)}`); return; }
        if (step !== 'start') return;
        const goal = waitingStart.goal;
        try {
          await act({ action: 'start', goal, afterMessage: true });
          clearWaiting();
        } catch (problem) {
          // A failed start is dropped, never kept for another conversation. (A claim by a chat that did not get those words changes nothing.)
          const wrongChat = /did not get those words/.test(messageOf(problem));
          if (!(wrongChat && waitingStart.orphan && waitingStart.owner !== me.current)) { clearWaiting(); setTip(`The Mission did not start: ${messageOf(problem)}`); }
        }
      };
      const startRef = useRef(maybeStartWaiting);
      startRef.current = maybeStartWaiting;
      useEffect(() => { if (card) void startRef.current(card); }, [card]);
      useEffect(() => () => { if (waitingStart.owner === me.current) { waitingStart.orphan = true; } }, []);

      // A press whose Mission did not start says why, once.
      const error = card?.startError;
      const [shownError, setShownError] = useState(0);
      useEffect(() => {
        if (error?.at && error.at !== shownError && Date.now() - error.at < 120000) {
          setShownError(error.at);
          setTip(`The Mission did not start: ${error.text}`);
        }
      }, [error?.at]);

      /** Why Start Mission cannot start now ('' when it can). Checked before the question, so a refused start asks nothing. */
      const startBlocked = (got) => {
        if (!got) return '';
        if (got.busy === true) return 'Wait until the answer is done, then press Start Mission.';
        if (got.armed === true || got.strip?.state === 'starting') return 'The Mission is starting…';
        if (got.runButton !== true) return runButtonNo(got);
        if (got.preflight?.ok === false) return (got.preflight.ticks ?? []).find((tick) => tick.required !== false && tick.ok !== true)?.text ?? 'A Mission cannot start here now.';
        return '';
      };
      // A conversation that is not open yet: its message goes first, then the Mission starts from the same words.
      const pressNew = async () => {
        if (busy) return;
        const send = sendButtonNear(ref.current);
        if (!send) { setTip('Type what the Mission should do in the chat box first.'); return; }
        // The chat box's own editor (its seat): Send sits in a row of its own beside it, never around it.
        const goal = editorText(seatEditor() ?? ref.current?.closest?.('[data-composer-seat]')?.querySelector?.('[data-composer-input]'));
        if (goal.startsWith('/')) { setTip(SLASH_TIP); return; }
        if (ownWords(goal).split(/\s+/).filter(Boolean).length < 3) { setTip('Say what the Mission should do in a few words.'); return; }
        setBusy(true);
        try {
          if (!(await askMission(await savedDefaults()))) return;
          const again = sendButtonNear(ref.current) ?? send;
          waitingStart.goal = goal;
          waitingStart.at = Date.now();
          waitingStart.owner = me.current;
          waitingStart.id = '';
          waitingStart.orphan = false;
          again.click();
          setTip('Sending your message first, then the Mission starts…');
        } finally {
          setBusy(false);
        }
      };
      // ---- start-mission:begin ----
      const pressStart = async () => {
        if (busy) return;
        const got = cardRef.current;
        if (!got) { await pressNew(); return; }
        const why = startBlocked(got);
        if (why) { setTip(why); return; }
        const editor = seatEditor() ?? ref.current?.closest('form, div')?.querySelector?.('[contenteditable="true"]');
        const typed = editorText(editor);
        // A / command is the app's, never a Mission's goal: sent through Send it would arm the next message instead.
        if (typed.startsWith('/')) { setTip(SLASH_TIP); return; }
        const own = ownWords(typed);
        const words = own.split(/\s+/).filter(Boolean).length;
        if (!typed && !got.hasThread) { setTip('Type what the Mission should do in the chat box first.'); return; }
        if (typed && words < 3 && !got.hasThread) { setTip('Say what the Mission should do in a few words.'); return; }
        // Only a Split Plus card (no words of your own) and a conversation so far: the conversation is the brief and the
        // card goes along as material. Nothing is sent as chat (a card alone would leave the press waiting).
        const cardOnly = Boolean(typed) && !own;
        const send = typed && !cardOnly ? sendButtonNear(ref.current) : null;
        if (typed && !cardOnly && !send) { setTip('Wait until the answer is done, then press Start Mission.'); return; }
        setBusy(true);
        setTip('');
        try {
          // One click must not start a Mission that works alone for hours: say what it does first.
          if (!(await askMission(savedWithHelpers(got)))) return;
          if (cardOnly) {
            await act({ action: 'start', fromThread: true, material: typed });
            if (!(await clearDraft(editor, inputActions))) setTip('Starting the Mission… (The card stays in the chat box; you can delete it.)');
            else setTip('Starting the Mission…');
            return;
          }
          if (typed) {
            // Your message is the Mission's goal: Mission is told first, then the app's own Send shows it in the chat.
            await act({ action: 'arm' });
            (sendButtonNear(ref.current) ?? send).click();
          } else {
            // Nothing typed: the whole conversation so far is the brief.
            await act({ action: 'start', fromThread: true });
          }
          setTip('Starting the Mission…');
        } catch (failure) {
          setTip(`The Mission did not start: ${messageOf(failure)}`);
        } finally {
          setBusy(false);
        }
      };
      // Lab check of point 19 (F3): a typed "/mission <goal>" as the first message of a conversation starts the Mission with
      // the same confirmation as Start Mission, and is never sent as chat. A conversation that is not open yet gets the
      // goal as its first message (as Start Mission does there); anything that cannot work keeps the text and says why.
      const TYPED_NEW_TIP = 'Press Start Mission to start the Mission with the text in the chat box.';
      const pressTyped = async (goal) => {
        if (busy) return;
        const got = cardRef.current;
        const keep = ' Your text is still in the chat box.';
        if (got && got.runButton === true) {
          const why = startBlocked(got);
          if (why) { setTip(`${why}${keep}`); return; }
          setBusy(true);
          setTip('');
          try {
            if (!(await askMission(savedWithHelpers(got)))) { setTip(`No Mission was started.${keep}`); return; }
            await act({ action: 'start', goal });
            setTip((await clearDraft(seatEditor(), inputActions)) ? 'Starting the Mission…' : 'Starting the Mission… (The text stays in the chat box; you can delete it.)');
          } catch (failure) {
            setTip(`The Mission did not start: ${messageOf(failure)}${keep}`);
          } finally {
            setBusy(false);
          }
          return;
        }
        // A card that says no Mission may start here (Recon, a helper): its reason, and nothing is sent.
        if (got) { setTip(`${runButtonNo(got)}${keep}`); return; }
        const send = sendButtonNear(ref.current);
        if (!send || typeof inputActions?.setDraft !== 'function') { setTip(`This thread is new, so it needs its first message. Remove "/mission" and press Start Mission.${keep}`); return; }
        setBusy(true);
        setTip('');
        try {
          if (!(await askMission(await savedDefaults()))) { setTip(`No Mission was started.${keep}`); return; }
          // The goal, without "/mission", becomes the conversation's first message; the Mission starts from it.
          inputActions.setDraft(goal);
          await new Promise((resolve) => setTimeout(resolve, 60));
          if (editorText(seatEditor()).replace(/\s+/g, ' ') !== goal.replace(/\s+/g, ' ')) { setTip(TYPED_NEW_TIP); return; }
          waitingStart.goal = goal;
          waitingStart.at = Date.now();
          waitingStart.owner = me.current;
          waitingStart.id = '';
          waitingStart.orphan = false;
          (sendButtonNear(ref.current) ?? send).click();
          setTip('Sending your message first, then the Mission starts…');
        } catch (failure) {
          setTip(`The Mission did not start: ${messageOf(failure)}`);
        } finally {
          setBusy(false);
        }
      };
      // ---- start-mission:end ----
      // ---- main-button:begin ----
      const pressMain = async () => {
        if (busy) return;
        const action = mainRef.current;
        if (action !== 'note' && action !== 'answer' && action !== 'resume') return;
        const editor = seatEditor();
        const text = editorText(editor);
        if (text.startsWith('/')) { setTip(SLASH_TIP); return; }
        if (action === 'note' && !text) { setTip('Type a note in the chat box first.'); return; }
        if (action === 'answer' && !text) { setTip('Type your answers first. Unanswered questions keep their default.'); return; }
        setBusy(true);
        setTip('');
        try {
          // Straight to the Mission (server route): never the app's Send, which is Stop during a Mission.
          const got = await act(text ? { action, text } : { action });
          let said = String(got?.said ?? '').split('\n')[0];
          if (text && !(await clearDraft(editor, inputActions))) said += ' (The text stays in the chat box; you can delete it.)';
          if (action !== 'resume' && hasAttachments()) said += ' A note takes text only; the attachment stays in the chat box.';
          setTip(said.trim());
        } catch (failure) {
          setCardError(sessionId, failure);
        } finally {
          setBusy(false);
        }
      };
      // ---- main-button:end ----
      const pressStartRef = useRef(pressStart);
      pressStartRef.current = pressStart;
      const pressMainRef = useRef(pressMain);
      pressMainRef.current = pressMain;
      const pressTypedRef = useRef(pressTyped);
      pressTypedRef.current = pressTyped;
      // Enter in this chat box: a note or the answers while the Mission runs; everything else goes to the app as always.
      // A typed /mission command shows on the strip at once: look again shortly after any Enter here.
      useEffect(() => {
        if (!seat) return undefined;
        const timers = new Set();
        const onKey = (event) => {
          if (event.key !== 'Enter') return;
          if (!event.shiftKey) {
            for (const wait of [300, 1500, 4000]) {
              const timer = setTimeout(() => { timers.delete(timer); pokeCard(sessionId); }, wait);
              timers.add(timer);
            }
          }
          const editor = seat.querySelector('[data-composer-input]');
          if (!editor || !event.target || typeof event.target !== 'object' || !editor.contains(event.target)) return;
          // A typed /mission goal as the first message: Mission starts it (with its confirmation), never as chat.
          const typedGoal = typedFirstMission(event, mainRef.current, editorText(editor), cardRef.current, failureRef.current, isolatedNewRef.current);
          if (typedGoal) {
            event.preventDefault();
            event.stopImmediatePropagation();
            void pressTypedRef.current(typedGoal);
            return;
          }
          const popupOpen = document.querySelector('[data-trigger-menu]') !== null;
          if (enterDoes(event, mainRef.current, editorText(editor), popupOpen) === 'pass') return;
          event.preventDefault();
          event.stopImmediatePropagation();
          void pressMainRef.current();
        };
        seat.addEventListener('keydown', onKey, true);
        return () => { seat.removeEventListener('keydown', onKey, true); for (const timer of timers) clearTimeout(timer); };
      }, [seat, sessionId]);
      // Mission picked in Depth (stage D): it only selects. The chat box whose Depth list was used (its seat; without one,
      // the conversation) shows a tip and gets the keyboard focus; nothing starts and nothing is asked: only Start Mission starts.
      // 'dsh-mission:start' is what an older Modes sends for the same pick: it is answered the same way, never with a start.
      useEffect(() => {
        const mine = (detail) => {
          const fromSeat = typeof detail.from?.closest === 'function' ? detail.from.closest('[data-composer-seat]') : null;
          const seatHasButton = Boolean(fromSeat?.querySelector?.('.dsh-ms-runbtn-wrap'));
          return seatHasButton ? fromSeat === seatRef.current : Boolean(sessionId) && detail.sessionId === sessionId;
        };
        const picked = () => {
          if (mainRef.current !== 'send') { setTip('A Mission is already on in this thread.'); return; }
          // Start Mission cannot start one here (greyed, or not shown): the reason, and no focus move.
          const why = cannotStartHere(cardRef.current, offRef.current) || startBlocked(cardRef.current);
          if (why) { setTip(`Mission chosen, but Start Mission cannot start it now. ${why}`, 8000); return; }
          setTip(PICKED_TIP, 8000);
          // After the Depth list has closed (it gives the focus back to its button), the chat box takes it.
          setTimeout(() => { try { seatRef.current?.querySelector?.('[data-composer-input]')?.focus?.(); } catch { /* the chat box went away */ } }, 60);
        };
        const onStart = (event) => {
          const detail = event?.detail;
          if (!detail || detail.handled) return;
          if (!mine(detail)) return;
          detail.handled = true;
          picked();
        };
        const onDepth = (event) => {
          const detail = event?.detail;
          if (!detail || detail.on !== true || !detail.from || detail.handled) return;
          if (!mine(detail)) return;
          detail.handled = true;
          picked();
        };
        window.addEventListener('dsh-mission:start', onStart);
        window.addEventListener('dsh-modes:depth-mission', onDepth);
        return () => { window.removeEventListener('dsh-mission:start', onStart); window.removeEventListener('dsh-modes:depth-mission', onDepth); };
      }, [sessionId]);

      if (!card || card.runButton !== true) {
        // The same chat box in every mode (Modes, Settings → Modes → Chat box): Start Mission keeps its place in every
        // mode, greyed out where a Mission cannot start, and says why. With that switch off: hidden, as before.
        const uniform = typeof document !== 'undefined' && document.documentElement.getAttribute('data-dsh-uniform') === 'true';
        if (off || !uniform) return null;
        const why = card
          ? runButtonNo(card)
          : 'Start a Mission with what you typed. This thread is new, so your message is sent first and the Mission starts right after it.';
        // Not ready yet (no conversation open on the server): Start Mission still works. Where one can never start, it stays greyed.
        const notReady = !card;
        return h('span', { className: 'dsh-ms-runbtn-wrap', ref, 'data-dsh-run-idle': '', title: why },
          h('style', null, CSS),
          h('button', { type: 'button', className: 'dsh-ms-runbtn', disabled: !notReady || busy, title: why, 'aria-label': notReady ? `Start Mission. ${why}` : `Start Mission (not available here). ${why}`, onMouseDown: notReady ? (event) => event.preventDefault() : undefined, onClick: notReady ? () => void pressNew() : undefined },
            h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true }, h('path', { d: PLAY_ICON, fill: 'currentColor' })),
            'Start Mission'),
          tip ? h('div', { className: 'dsh-ms-runtip', role: 'status' }, tip) : null);
      }
      const live = card.run?.status === 'running';
      if (main !== 'send') {
        const label = mainLabel(main, false);
        return h('span', { className: 'dsh-ms-runbtn-wrap', ref, 'data-main': main },
          h('style', null, CSS),
          h('button', { type: 'button', className: 'dsh-ms-main', 'data-short': mainLabel(main, true), 'aria-label': label, title: INFO[main]?.what ?? label, disabled: busy, onMouseDown: (event) => event.preventDefault(), onClick: () => void pressMain() },
            h('span', { className: 'dsh-ms-main-label' }, label)),
          h(ui.Info, { ...INFO[main], side: 'above' }),
          tip ? h('div', { className: 'dsh-ms-runtip', role: 'status' }, tip) : null);
      }
      const why = startBlocked(card);
      const starting = card.armed === true || state === 'starting';
      // Depth is on Mission: Start Mission is the main-looking button (the app's primary colours) and says so.
      const chosen = depthChosen && !why && !live && !starting;
      const title = why || (chosen ? DEPTH_CHOSEN_TITLE : `Start a Mission with what you typed and this thread as its brief (${missionWords(savedWithHelpers(card)).summary}). Change this in Depth → Mission settings.`);
      return h('span', { className: 'dsh-ms-runbtn-wrap', ref, 'data-main': 'send' },
        h('style', null, CSS),
        h('button', { type: 'button', className: 'dsh-ms-runbtn', 'data-chosen': chosen ? 'true' : undefined, disabled: busy || live || Boolean(why), title, 'aria-label': 'Start Mission', 'aria-description': why || (chosen ? DEPTH_CHOSEN_TITLE : undefined), onMouseDown: (event) => event.preventDefault(), onClick: () => void pressStart() },
          h('svg', { viewBox: '0 0 16 16', width: 12, height: 12, 'aria-hidden': true }, h('path', { d: PLAY_ICON, fill: 'currentColor' })),
          starting ? 'Starting…' : mainLabel('send', false)),
        h(ui.Info, { ...INFO.start, side: 'above' }),
        tip ? h('div', { className: 'dsh-ms-runtip', role: 'status' }, tip) : null);
    }

    /** Opens the setup card when the Depth list asks (the `dsh-mission:long` event names the conversation). */
    function LongOverlay() {
      const [sessionId, setSessionId] = useState('');
      useEffect(() => {
        const open = (event) => setSessionId(String(event?.detail?.sessionId ?? ''));
        window.addEventListener('dsh-mission:long', open);
        window.__dshMissionLong = true;
        window.dispatchEvent(new Event('dsh-mission:ready'));
        return () => {
          window.removeEventListener('dsh-mission:long', open);
          window.__dshMissionLong = false;
          window.dispatchEvent(new Event('dsh-mission:ready'));
        };
      }, []);
      return sessionId ? h(LongSetup, { sessionId, onClose: () => setSessionId('') }) : null;
    }

    /** How long a message said by the questions card stays after its questions are gone. */
    const SAID_MS = 8000;
    /**
     * The questions card (stage C), under the strip in each chat box (each Split Plus pane has its own, with its own drafts).
     * While a Mission is on: a field per open question with its default, a Skip chip, who asked, the time question's three
     * choices, and Send answers. After it ended with questions left (or answers that came too late): Answer and continue,
     * then how much more time, then the same Mission goes on. Typed answers and the main button keep working as in stage B.
     * It reads the shared card store (no polling of its own).
     */
    function QuestionsCard({ sessionId }) {
      const store = useMissionCard(sessionId);
      const card = store.card;
      const [drafts, setDrafts] = useState({});
      const [skips, setSkips] = useState({});
      const [timePick, setTimePick] = useState('');
      // Stage D, after the end: the approval choices picked here, sent with Answer and continue ({ [approval id]: choice id }).
      const [picks, setPicks] = useState({});
      // null: as the card starts (folded when it holds only questions the Mission decided itself); true/false: Hide or Show.
      const [folded, setFolded] = useState(null);
      // Point 17, after the end: changed answers to questions the Mission decided itself ({ [question id]: text }).
      const [decidedDrafts, setDecidedDrafts] = useState({});
      // Point 17: the strip's Finish it was pressed for this card (it unfolds and takes the focus).
      const [finishing, setFinishing] = useState(false);
      // Step two after the end: { answers, quote, pick } ('none' or minutes as text).
      const [step, setStep] = useState(null);
      const [busy, setBusy] = useState(false);
      const [error, setError] = useState(null);
      const [said, setSaid] = useState({ text: '', key: '', until: 0 });
      const [, bump] = useState(0);
      const seen = useRef(new Set());
      const last = useRef({ sessionId, runId: undefined });
      const rootRef = useRef(null);
      const strip = card?.strip ?? null;
      const run = card?.run ?? null;
      const state = strip?.state ?? 'none';
      const ended = state === 'finished';
      const questions = listOf(strip?.questions);
      const late = ended ? listOf(strip?.late) : [];
      const timeQ = !ended && strip?.timeQuestion?.id ? strip.timeQuestion : null;
      const approvals = listOf(strip?.approvals);
      // Point 17: only after the end — steps Full auto did not ask for, questions it decided itself, items not done.
      const unasked = ended ? listOf(strip?.unasked) : [];
      const decided = ended ? listOf(strip?.decided) : [];
      const undone = ended ? listOf(strip?.undone) : [];
      const order = questions.map((q) => String(q.id));
      const key = questionsKey(card);
      const runId = run?.id;
      // Another conversation in this chat box, or another run: start clean.
      useEffect(() => {
        const before = last.current;
        const otherChat = before.sessionId !== sessionId;
        const otherRun = runId !== undefined && before.runId !== undefined && before.runId !== runId;
        last.current = { sessionId, runId: runId ?? (otherChat ? undefined : before.runId) };
        if (!otherChat && !otherRun) return;
        setDrafts({}); setSkips({}); setTimePick(''); setPicks({}); setFolded(null); setStep(null); setError(null); setSaid({ text: '', key: '', until: 0 });
        setDecidedDrafts({}); setFinishing(false);
        seen.current = new Set();
      }, [sessionId, runId]);
      // A question it had not shown before unfolds the card; drafts for questions no longer open are dropped.
      useEffect(() => {
        const open = new Set([...order, ...(timeQ ? [String(timeQ.id)] : []), ...approvals.map((a) => String(a.id)), ...unasked.map((a) => String(a.id))]);
        const fresh = [...open].some((id) => !seen.current.has(id));
        for (const id of open) seen.current.add(id);
        if (fresh && folded === true) setFolded(false);
        const keepOf = (ids) => (before) => {
          const gone = Object.keys(before).filter((id) => !ids.has(id));
          if (gone.length === 0) return before;
          const next = { ...before };
          for (const id of gone) delete next[id];
          return next;
        };
        const keep = keepOf(open);
        setDrafts(keep);
        setSkips(keep);
        setPicks(keep);
        setDecidedDrafts(keepOf(new Set(decided.map((q) => String(q.id)))));
        if (!timeQ) setTimePick('');
        if (!ended) { setStep(null); setFinishing(false); }
      }, [key]);
      // Point 17: the strip's Finish it (in this chat box) unfolds this card and moves the focus into it.
      useEffect(() => {
        const onFinish = (event) => {
          const detail = event?.detail;
          if (!detail || detail.handled) return;
          let mySeat = null;
          try {
            const node = rootRef.current;
            mySeat = typeof node?.closest === 'function' ? node.closest('[data-composer-seat]') ?? node.closest('[data-conversation-session]') : null;
          } catch { /* no node yet */ }
          if (!finishMine(detail, mySeat, sessionId)) return;
          detail.handled = true;
          setFinishing(true);
          setFolded(false);
          setTimeout(() => {
            try {
              const node = rootRef.current;
              const target = node?.querySelector?.('textarea:not([disabled])') ?? node?.querySelector?.('[data-finish-it]');
              target?.focus?.();
            } catch { /* the card went away */ }
          }, 60);
        };
        window.addEventListener('dsh-mission:finish', onFinish);
        return () => window.removeEventListener('dsh-mission:finish', onFinish);
      }, [sessionId]);
      // A message said after the questions are gone stays a few seconds, then goes.
      useEffect(() => {
        const wait = said.until - Date.now();
        if (!said.text || wait <= 0) return undefined;
        const timer = setTimeout(() => bump((n) => n + 1), wait + 50);
        return () => clearTimeout(timer);
      }, [said.until]);
      const primary = useRef(null);

      const now = Date.now();
      const shown = questionsShown(card, dismissedRuns(), now);
      const saidLine = said.text && (said.key === key || said.until > now)
        ? h('div', { className: 'dsh-ms-qmeta', role: 'status' }, said.text)
        : null;
      if (!shown) {
        return saidLine && state !== 'none' ? h('div', { className: 'dsh-ms-qcard', 'data-dsh-mission-questions': '', role: 'region', 'aria-label': 'Questions from the Mission' }, h('style', null, CSS), saidLine) : null;
      }

      const send = async (body) => {
        setBusy(true);
        setError(null);
        try {
          return await actCard(sessionId, body);
        } catch (failure) {
          setError(plainFailure(failure));
          return null;
        } finally {
          setBusy(false);
        }
      };
      const tell = (got) => setSaid({ text: String(got?.said ?? '').split('\n')[0].trim(), key: questionsKey(got), until: Date.now() + SAID_MS });
      const clearSent = (answers, chosen = []) => {
        const ids = new Set([...answers, ...chosen].map((one) => one.id));
        const drop = (before) => Object.fromEntries(Object.entries(before).filter(([id]) => !ids.has(id)));
        setDrafts(drop);
        setSkips(drop);
        setPicks(drop);
        setDecidedDrafts(drop);
        if (answers.some((one) => one.time)) setTimePick('');
      };
      const answers = answersBody(drafts, skips, timeQ && timePick ? { id: timeQ.id, time: timePick } : null, order);
      const filled = answers.length > 0;
      // After the end (point 17), Finish it sends the open answers, changed decided answers and the choices for steps
      // waiting for your yes or not asked (approvals only when any: the body stays as before).
      const finishSent = ended ? finishBody(drafts, skips, decidedDrafts, picks, order, { approvals: [...approvals, ...unasked], decided }) : null;
      const chosen = ended ? finishSent.approvals ?? [] : [];
      const withPicks = (body, list) => (list.length > 0 ? { ...body, approvals: list } : body);
      // While on, an approval's button answers at once.
      const approveNow = async (id, choice) => {
        if (busy) return;
        const card = typeof document !== 'undefined' ? document.activeElement?.closest?.('.dsh-ms-qcard') : null;
        const got = await send({ action: 'approve', approvals: [{ id: String(id), choice: String(choice) }] });
        if (got) tell(got);
        // The answered approval leaves the card: the focus goes to the next one (or to the card), never to the page's top.
        if (card) setTimeout(() => {
          const now = document.activeElement;
          if (now && now !== document.body && now.isConnected) return;
          const next = card.isConnected ? card.querySelector('button[data-approval]') : null;
          if (next) next.focus();
          else if (card.isConnected) card.focus();
        }, 60);
      };

      const sendAnswers = async () => {
        if (busy || !filled) return;
        const sent = answers;
        const got = await send({ action: 'answer', answers: sent });
        if (got) { clearSent(sent); tell(got); }
      };
      // Point 17: Finish it. Always pressable (the server says when there is nothing to finish); first a quote, then the time.
      const answerAndContinue = async () => {
        if (busy) return;
        const sent = finishSent?.answers ?? answers;
        const sentPicks = chosen;
        const got = await send(withPicks({ action: 'continue', answers: sent }, sentPicks));
        if (!got) return;
        const quote = got.quote;
        if (!quote || typeof quote !== 'object') {
          setError({ what: 'The Mission did not say how much time it needs.', fix: 'Press Finish it again.', details: '' });
          return;
        }
        if (quote.run === false) {
          // Nothing needs doing again (only skips, or answers that match what it did): recorded; the Mission stays finished.
          const done = await send(withPicks({ action: 'continue', answers: sent, minutes: 0 }, sentPicks));
          if (done) { clearSent(sent, sentPicks); setFinishing(false); tell(done); }
          return;
        }
        setStep({ answers: sent, approvals: sentPicks, quote, pick: quote.noLimit === true ? 'none' : String(Number(quote.minutes) || 0) });
      };
      const continueNow = async () => {
        if (busy || !step) return;
        const minutes = step.pick === 'none' ? 0 : Number(step.pick) || 0;
        const got = await send(withPicks({ action: 'continue', answers: step.answers, minutes }, step.approvals ?? []));
        if (got) { clearSent(step.answers, step.approvals ?? []); setStep(null); setFinishing(false); tell(got); }
      };
      primary.current = step ? continueNow : ended ? answerAndContinue : sendAnswers;
      // Only Enter is kept in the card (it never reaches the chat box's own Enter handling); Cmd/Ctrl+Enter presses the
      // card's main button. Every other key flows on: the app's shortcuts treat a text field as editable, and Esc must work.
      const onKeyDown = (event) => {
        if (event.key !== 'Enter') return;
        event.stopPropagation();
        if ((event.metaKey || event.ctrlKey) && event.isComposing !== true) {
          event.preventDefault();
          void primary.current?.();
        }
      };

      const top = cardTop(card);
      const title = top.title;
      // Folded: by Hide, or at first when it holds only questions the Mission decided itself (unless Finish it was pressed).
      const isFolded = folded ?? (foldedAtFirst(card) && !finishing);
      const head = h('div', { className: 'dsh-ms-qhead' },
        h('b', null, title),
        h(ui.Info, { ...(ended ? INFO_Q.finishCard : INFO_Q.questions), title }),
        h('span', { className: 'dsh-ms-qfold' },
          h('button', { type: 'button', className: 'dsh-ms-btn', 'aria-expanded': !isFolded, onClick: () => setFolded(!isFolded) }, isFolded ? 'Show' : 'Hide'),
          h(ui.Info, INFO_Q.fold)));
      const errorNote = error ? h(ui.ErrorNote, { what: error.what, fix: error.fix || undefined, details: error.details || undefined }, h('button', { type: 'button', className: 'dshu-link', onClick: () => setError(null) }, 'Close')) : null;
      const root = (...children) => h('div', { className: 'dsh-ms-qcard', 'data-dsh-mission-questions': '', role: 'region', 'aria-label': ended ? 'Finish the Mission' : 'Questions from the Mission', tabIndex: -1, onKeyDown, ref: rootRef }, h('style', null, CSS), ...children);

      if (isFolded) return root(head, h(ui.StateLine, { state: 'warn', words: foldWords(card), live: false }), saidLine, errorNote);

      if (step) {
        const quote = step.quote;
        const suggested = String(Number(quote.minutes) || 0);
        const all = String(Number(quote.needed) || 0);
        const chips = [
          { value: suggested, label: `${suggested} min (suggested)` },
          // The full estimate only when a continue can take it (at most 12 hours); Other time and No time limit stay.
          ...(quote.capped === true && all !== suggested && Number(all) <= CONTINUE_MAX_MINUTES ? [{ value: all, label: `${all} min (all it estimates)` }] : []),
          { value: 'none', label: 'No time limit' },
        ];
        const others = TIME_CHOICES.filter((choice) => choice.value > 0 && !chips.some((chip) => chip.value === String(choice.value)));
        const other = others.some((choice) => String(choice.value) === step.pick) ? step.pick : '';
        return root(head,
          h('div', { className: 'dsh-ms-qitem' },
            h('div', null, h('b', null, 'How much more time?'), h(ui.Info, INFO_Q.extraTime)),
            h('p', { className: 'dsh-ms-qmeta' }, extraWords(quote)),
            h('div', { className: 'dsh-ms-qrow', role: 'radiogroup', 'aria-label': 'How much more time' },
              chips.map((chip) => h('button', { key: chip.value, type: 'button', role: 'radio', className: 'dsh-ms-qchip', 'aria-checked': step.pick === chip.value, disabled: busy, onClick: () => setStep({ ...step, pick: chip.value }) }, chip.label))),
            others.length > 0 ? h('div', { className: 'dsh-ms-qrow' },
              h('select', { className: 'dsh-ms-field', 'aria-label': 'Other time', value: other, disabled: busy, onChange: (event) => { if (event.target.value) setStep({ ...step, pick: event.target.value }); } },
                h('option', { value: '' }, 'Other time'),
                others.map((choice) => h('option', { key: choice.value, value: String(choice.value) }, choice.label))),
              h(ui.Info, INFO_Q.otherTime)) : null),
          h('div', { className: 'dsh-ms-qfoot' },
            h(ui.Button, { main: true, disabled: busy, onClick: () => void continueNow() }, busy ? 'Sending…' : 'Continue the Mission'),
            h(ui.Info, INFO_Q.continue),
            h(ui.Button, { disabled: busy, onClick: () => setStep(null) }, 'Back'),
            h(ui.Info, INFO_Q.back)),
          saidLine, errorNote);
      }

      const fields = questions.map((q) => {
        const id = String(q.id);
        const skipped = skips[id] === true;
        // Screen readers hear who asked and the default with the field (ids unique per pane and question).
        const tag = `dsh-ms-q-${String(sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '')}-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;
        return h('fieldset', { key: id, className: 'dsh-ms-qitem' },
          h('legend', null, `${q.n}. ${q.text}`, h(ui.Info, INFO_Q.field)),
          h('p', { className: 'dsh-ms-qmeta', id: `${tag}-asked` }, askedWords(q)),
          // Stage D: an item stopped to wait for this answer (it kept its work).
          parkedWords(q) ? h('p', { className: 'dsh-ms-qmeta' }, parkedWords(q), h(ui.Info, INFO_Q.parked)) : null,
          h('textarea', {
            className: 'dsh-ms-qfield', rows: 2, maxLength: 1000, placeholder: 'Your answer', 'aria-label': `Your answer to question ${q.n}`, 'aria-describedby': `${tag}-asked ${tag}-default`,
            // While sending the field is read-only, not disabled: the keyboard focus stays where you were typing.
            value: drafts[id] ?? '', disabled: skipped, readOnly: busy, 'aria-busy': busy,
            onChange: (event) => { const value = String(event?.target?.value ?? ''); setDrafts((before) => ({ ...before, [id]: value })); },
          }),
          h('p', { className: 'dsh-ms-qmeta', id: `${tag}-default` }, skipped ? 'The Mission decides itself and says what it chose in the report.' : parkedWords(q) ? parkedDefaultWords(q) : strip?.needs === 'wait' && !ended ? waitDefaultWords(q) : defaultWords(q)),
          h('div', { className: 'dsh-ms-qrow' },
            h('button', { type: 'button', className: 'dsh-ms-qskip', 'aria-pressed': skipped, disabled: busy, onClick: () => setSkips((before) => ({ ...before, [id]: !skipped })) }, 'Skip, use your judgement'),
            h(ui.Info, INFO_Q.skip)));
      });
      const lateBlock = late.length > 0 ? h('div', { className: 'dsh-ms-qitem' },
        h('div', null, h('b', null, 'Answered too late before'), h(ui.Info, INFO_Q.late)),
        h('ul', { className: 'dsh-ms-qlate' }, late.map((one) => h('li', { key: one.id }, `${one.text} · your answer: ${one.answer} · done again if you continue`)))) : null;
      const timeRow = timeQ ? h('div', { className: 'dsh-ms-qitem' },
        h('div', null, timeQ.text, h(ui.Info, INFO_Q.timeFit)),
        h('div', { className: 'dsh-ms-qrow', role: 'radiogroup', 'aria-label': 'Time for this Mission' },
          timeChoices(timeQ).map((choice) => h('button', { key: choice.value, type: 'button', role: 'radio', className: 'dsh-ms-qchip', 'aria-checked': timePick === choice.value, disabled: busy, onClick: () => setTimePick(timePick === choice.value ? '' : choice.value) }, choice.label))),
        h('p', { className: 'dsh-ms-qmeta' }, 'If you don\'t answer: it keeps your limit, does the most important items first and lists the rest.')) : null;
      // Stage D: steps a helper needs your yes for. While on, a choice answers at once; after the end it is picked here
      // and goes with Finish it. The helper's reason is its own words: shown as a quote, never as the card's.
      // Point 17: after the end the same block lists the steps Full auto did not ask for ('unasked').
      const approvalGroup = (list, heading, info, unaskedOnes) => (list.length > 0 ? h('div', { className: 'dsh-ms-qitem', role: 'group', 'aria-label': heading },
        h('div', null, h('b', null, heading), h(ui.Info, { ...info, title: heading })),
        list.map((a) => {
          const id = String(a.id);
          const reason = String(a.reason ?? '').trim().slice(0, 300);
          // Tool access's own words (plain text from Modes, never the AI's): the risk, and its Recon and outside-material
          // warnings, always shown as its card shows them.
          const warns = a.warnings && typeof a.warnings === 'object' ? a.warnings : {};
          return h('div', { key: id, className: 'dsh-ms-qappr' },
            h('div', { className: 'dsh-ms-qwhat' }, String(a.what ?? '')),
            h('p', { className: 'dsh-ms-qmeta' }, approvalAsked(a)),
            warns.risk ? h('p', { className: 'dsh-ms-qmeta' }, `Risk: ${String(warns.risk).slice(0, 40)}.`) : null,
            warns.recon ? h('p', { className: 'dsh-ms-qwarn', role: 'note' }, String(warns.recon).slice(0, 300)) : null,
            warns.outside ? h('p', { className: 'dsh-ms-qwarn', role: 'note' }, String(warns.outside).slice(0, 300)) : null,
            reason ? h('p', { className: 'dsh-ms-qsay' }, `The helper says: “${reason}”`) : null,
            // After the end nothing waits any more: only Finish it takes the step up (review of point 17).
            h('p', { className: 'dsh-ms-qmeta' }, unaskedOnes ? UNASKED_IF_NONE : ended ? APPROVAL_IF_NONE_ENDED : 'If you don\'t answer: it waits; the report lists it.'),
            h('div', { className: 'dsh-ms-qrow', role: ended ? 'radiogroup' : 'group', 'aria-label': `Your choice for: ${String(a.what ?? '')}`.slice(0, 160) },
              listOf(a.choices).map((choice) => {
                const label = choiceLabel(choice);
                const info = choiceInfo(a, choice);
                const picked = picks[id] === choice.id;
                return h(React.Fragment, { key: choice.id },
                  ended
                    ? h('button', { type: 'button', role: 'radio', className: 'dsh-ms-qchip', 'aria-checked': picked, disabled: busy, onClick: () => setPicks((before) => ({ ...before, [id]: picked ? '' : choice.id })) }, label)
                    // aria-disabled, not disabled, while it is sent: the keyboard focus stays on the button.
                    : h('button', { type: 'button', className: 'dsh-ms-qskip', 'data-approval': id, 'aria-busy': busy, 'aria-disabled': busy, onClick: () => { if (!busy) void approveNow(id, choice.id); } }, label),
                  info ? h(ui.Info, { ...info, title: label }) : null);
              })));
        })) : null);
      const approvalBlock = approvalGroup(approvals, ended ? 'Still waiting for your yes' : 'Waiting for your yes', INFO_Q.approvals, false);
      const unaskedBlock = ended ? approvalGroup(unasked, 'Not asked: it needs your yes', INFO_Q.unasked, true) : null;
      // Point 17, after the end: the questions it decided itself (Full auto, or left to it), each changeable.
      const decidedBlock = decided.length > 0 ? h('div', { className: 'dsh-ms-qitem', role: 'group', 'aria-label': 'Decided by the Mission' },
        h('div', null, h('b', null, 'Decided by the Mission'), h(ui.Info, INFO_Q.decided)),
        decided.map((q) => {
          const id = String(q.id);
          const tag = `dsh-ms-d-${String(sessionId ?? '').replace(/[^A-Za-z0-9_-]/g, '')}-${id.replace(/[^A-Za-z0-9_-]/g, '')}`;
          return h('fieldset', { key: `d:${id}`, className: 'dsh-ms-qitem' },
            h('legend', null, String(q.text ?? ''), h(ui.Info, INFO_Q.decidedField)),
            h('p', { className: 'dsh-ms-qmeta', id: `${tag}-asked` }, askedWords(q)),
            h('p', { className: 'dsh-ms-qmeta', id: `${tag}-chose` }, decidedWords(q)),
            h('textarea', {
              className: 'dsh-ms-qfield', rows: 2, maxLength: 1000, placeholder: DECIDED_PLACEHOLDER, 'aria-label': `Change what it chose for: ${String(q.text ?? '')}`.slice(0, 160), 'aria-describedby': `${tag}-asked ${tag}-chose`,
              value: decidedDrafts[id] ?? '', readOnly: busy, 'aria-busy': busy,
              onChange: (event) => { const value = String(event?.target?.value ?? ''); setDecidedDrafts((before) => ({ ...before, [id]: value })); },
            }),
            h('p', { className: 'dsh-ms-qmeta' }, DECIDED_UNDER));
        })) : null;
      // Point 17, after the end: items it did not finish, with why; Finish it takes them up again.
      const undoneBlock = undone.length > 0 ? h('div', { className: 'dsh-ms-qitem', role: 'group', 'aria-label': 'Not done yet' },
        h('div', null, h('b', null, 'Not done yet'), h(ui.Info, INFO_Q.undone)),
        h('ul', { className: 'dsh-ms-qlate' }, undone.map((one) => h('li', { key: String(one.id) }, undoneWords(one))))) : null;
      const foot = ended
        ? h('div', { className: 'dsh-ms-qfoot' },
          h(ui.Button, { main: true, 'data-finish-it': '', disabled: busy, onClick: () => void answerAndContinue() }, busy ? 'Sending…' : 'Finish it'),
          h(ui.Info, INFO_Q.finish))
        : questions.length > 0 || timeQ ? h('div', { className: 'dsh-ms-qfoot' },
          h(ui.Button, { main: true, disabled: busy || !filled, onClick: () => void sendAnswers() }, busy ? 'Sending…' : 'Send answers'),
          h(ui.Info, INFO_Q.send),
          h('span', { className: 'dsh-ms-qmeta' }, 'Empty fields change nothing: an item on a default keeps it, and one that waits keeps waiting. You can also type numbered answers (1., 2., …) in the chat box.')) : null;
      return root(head,
        h('p', { className: 'dsh-ms-qmeta' }, top.line),
        ...fields, decidedBlock, lateBlock, timeRow, approvalBlock, unaskedBlock, undoneBlock, foot, saidLine, errorNote);
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'mission', order: 400, label: () => t('section.title') }, (props) => h(MissionPage, { ...props, appCtx: ctx }))),
        );
        // The status strip. Before the Activity monitor (order 5): it pulls itself down onto the chat box, over anything between the two.
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'mission-run', order: 3 }, (props) => h(RunCard, { sessionId: props?.sessionId }))));
        // The questions card (stage C): under the strip (3), above Activity (5) and the queue (20), so it never covers the strip's words.
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'mission-questions', order: 4 }, (props) => h(QuestionsCard, { sessionId: props?.sessionId }))));
        // Start Mission and the main button (Add note, Answer and continue, Resume), beside Send.
        ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'mission-run-button', order: 50 }, (props) => h(RunButton, { sessionId: props?.sessionId, inputActions: props?.inputActions }))));
        ctx.effect(() => ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'mission-long', order: 81 }, () => h(LongOverlay))));
      },
    };
  },
});
