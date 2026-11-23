/**
 * Automations, browser half: the Automation runs page (how each scheduled run ended, and what
 * waits for you) and the Settings > Alerts page. The watching and the alerting happen in the
 * server half.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-automations',
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
    // ReactDOM lets an (i) draw its pop-up in the page body (the Schedule form's popover clips otherwise).
    const ui = dshUi.makeParts(React, ReactDOM);
    dshUi.ensureStyle();
    const PlainNote = dshKit.makeNote(React);
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
    const { ask: askInPage } = dshKit;

    const NS = 'automations';
    const DICT = {
      en: { 'panel.title': 'Automations', 'section.title': 'Alerts' },
    };

    const CSS = `
.dsh-au-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-au-head { display: flex; align-items: flex-start; gap: 16px; }
.dsh-au-headtext { flex: 1; min-width: 0; }
.dsh-au-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-au-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-au-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-au-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-au-row { display: flex; align-items: center; gap: 16px; padding: 14px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-au-row[data-top="true"] { align-items: flex-start; }
.dsh-au-rowtext { flex: 1; min-width: 0; }
.dsh-au-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-au-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-au-rowdesc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-au-words {
  margin: 6px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); white-space: pre-wrap; overflow-wrap: anywhere;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden;
}
.dsh-au-words[data-open="true"] { display: block; }
.dsh-au-btns { flex: none; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
.dsh-au-btn {
  flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; cursor: pointer; font: inherit; font-size: 12px;
  color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap;
}
.dsh-au-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-au-btn:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-au-btn:disabled { opacity: .5; cursor: default; }
.dsh-au-link { padding: 0; border: 0; background: none; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-secondary); text-decoration: underline; }
.dsh-au-badge {
  flex: none; display: inline-block; min-width: 68px; box-sizing: border-box; padding: 2px 8px; border-radius: 999px; font-size: 12px; line-height: 18px; text-align: center;
  color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-au-badge[data-state="ok"] { color: var(--dsw-alias-state-success-primary, #2e9e5b); background: color-mix(in srgb, var(--dsw-alias-state-success-primary, #2e9e5b) 12%, transparent); }
.dsh-au-badge[data-state="failed"] { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
.dsh-au-badge[data-state="stopped"], .dsh-au-badge[data-state="waiting"] { color: var(--dsw-alias-state-warn-primary, #d9822b); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d9822b) 12%, transparent); }
.dsh-au-badge[data-state="running"] { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-au-card {
  display: flex; align-items: center; gap: 16px; margin: 0 0 8px; padding: 10px 12px; border-radius: 12px; font-size: 13px; line-height: 20px;
  border: 0.5px solid var(--dsw-alias-state-warn-primary, var(--dsw-alias-border-l2)); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d9822b) 8%, transparent);
}
.dsh-au-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-au-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-au-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-au-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-au-field {
  flex: none; box-sizing: border-box; width: 240px; max-width: 50%; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-au-field[data-small="true"] { width: 90px; text-align: right; }
.dsh-au-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-au-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-au-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; margin: 18px 0 4px; }
.dsh-au-tile { padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-au-tilenum { font-size: 20px; line-height: 28px; font-weight: 500; }
.dsh-au-tilenum[data-warn="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-au-tilelabel { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-au-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.dsh-au-chip { height: 26px; padding: 0 10px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; font: inherit; font-size: 12px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.dsh-au-chip[aria-pressed="true"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.dsh-au-detail { margin: 0 0 8px; padding: 12px 14px; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, transparent); display: flex; flex-direction: column; gap: 10px; font-size: 13px; }
.dsh-au-detail label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.dsh-au-detail textarea, .dsh-au-detail input[type=text], .dsh-au-detail input[type=number], .dsh-au-detail select {
  box-sizing: border-box; width: 100%; padding: 8px 10px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-au-detail input[type=number] { width: 90px; }
.dsh-au-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-au-lane { display: flex; align-items: center; gap: 10px; height: 26px; }
.dsh-au-lanename { flex: none; width: 160px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-au-track { position: relative; flex: 1; height: 100%; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-au-mark { position: absolute; top: 50%; width: 8px; height: 8px; margin: -4px 0 0 -4px; border-radius: 50%; background: var(--dsw-alias-label-secondary); }
.dsh-au-mark[data-kind="done"] { background: var(--dsw-alias-state-success-primary, #2e9e5b); }
.dsh-au-mark[data-kind="failed"] { background: var(--dsw-alias-state-error-primary); }
.dsh-au-mark[data-kind="missed"] { background: transparent; border: 1.5px solid var(--dsw-alias-state-warn-primary, #d9822b); box-sizing: border-box; }
.dsh-au-mark[data-kind="upcoming"] { background: transparent; border: 1.5px solid var(--dsw-alias-label-secondary); box-sizing: border-box; }
.dsh-au-mark[data-kind="running"], .dsh-au-mark[data-kind="waiting"] { background: var(--dsw-alias-brand-primary); }
.dsh-au-now { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--dsw-alias-brand-primary); }
.dsh-au-axis { display: flex; justify-content: space-between; margin-left: 170px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-au-bar { display: flex; flex-direction: column; gap: 10px; }
.dsh-au-bar .dsh-au-tiles { grid-template-columns: none; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); }
.dsh-au-bar .dsh-au-tilenum { font-size: 16px; line-height: 22px; }
html[data-cws-tab="automations"] .dsh-au-bar { position: absolute; top: 100%; left: 0; right: 0; margin-top: 20px; }
html[data-cws-tab="automations"] [class*='_composerHero']:has(.dsh-au-bar) { position: relative; }
.dsh-au-tag { font-size: 11px; line-height: 16px; padding: 1px 6px; border-radius: 6px; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 6%, transparent); }
.dsh-au-preset { display: inline-flex; align-items: center; white-space: nowrap; }
.dsh-au-tag[data-preset="ptc"] { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
`;

    const STATE_WORDS = { ok: 'Finished', failed: 'Failed', stopped: 'Stopped', cancelled: 'Cancelled', running: 'Running', waiting: 'Needs you', held: 'Did not start' };
    const WAIT_WORDS = { approval: 'wants your approval', question: 'has a question for you', 'plan-review': 'wants its plan reviewed' };
    const TASK_WORDS = { active: 'On', paused: 'Paused', ended: 'Ended' };

    const num = (value) => Number(value || 0).toLocaleString('en-US');

    /** "Today 09:00", "Yesterday 18:30", or the date and time. */
    function when(value) {
      const at = typeof value === 'number' ? value : Date.parse(value);
      if (!Number.isFinite(at)) return '';
      const date = new Date(at);
      const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diff = Math.round((day(date) - day(new Date())) / 86400000);
      if (diff === 0) return `Today ${time}`;
      if (diff === -1) return `Yesterday ${time}`;
      if (diff === 1) return `Tomorrow ${time}`;
      const sameYear = date.getFullYear() === new Date().getFullYear();
      return `${date.toLocaleDateString('en-GB', sameYear ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' })} ${time}`;
    }

    /** "42 s", "3 min", "1 h 5 min". */
    function took(ms) {
      const seconds = Math.max(0, Math.round(ms / 1000));
      if (seconds < 60) return `${seconds} s`;
      const minutes = Math.round(seconds / 60);
      if (minutes < 60) return `${minutes} min`;
      return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
    }

    const runName = (run) => run.tasks.map((task) => task.title).filter(Boolean).join(', ') || 'An automation';

    /** The page's language for the server's words (the preset words): set when the add-on starts. */
    let pageLangOf = () => 'en';
    async function call(body) {
      const lang = pageLangOf();
      const response = await fetch(new URL('dsh-automations/data', document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json', 'x-dsh-locale': lang } : { accept: 'application/json', 'x-dsh-locale': lang },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.details ? { error: data.error, details: data.details } : data.error || `error ${response.status}`);
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

    /** The page's data, read now and every few seconds while the page is shown. */
    function useData(everyMs) {
      const [data, setData] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const alive = useRef(true);
      const load = () => call()
        .then((next) => { if (alive.current) setData(next); })
        .catch((error) => { if (alive.current) setNote({ text: `Could not load: ${error.message}`, details: error.details ?? '', error: true }); });
      useEffect(() => {
        alive.current = true;
        load();
        // Looks again every few seconds while the page is shown, never while the window is hidden.
        const timer = everyMs ? dshPoll.loop(() => load(), { every: everyMs, immediate: false }) : null;
        return () => { alive.current = false; if (timer) timer.stop(); };
      }, []);
      return { data, setData, note, setNote, alive, load };
    }

    function openPanel(appCtx, id) {
      try {
        appCtx.get('layout').selectPanel(id);
      } catch {
        /* the app has no such page */
      }
    }

    function openConversation(appCtx, sessionId) {
      openPanel(appCtx, null);
      try {
        appCtx.get('uiWorkspace').openSession(sessionId);
      } catch {
        /* it may have been deleted */
      }
    }

    function Badge({ state }) {
      return h('span', { className: 'dsh-au-badge', 'data-state': state }, STATE_WORDS[state] ?? state);
    }

    function RunRow({ run, appCtx, busy, onAgain }) {
      const [open, setOpen] = useState(false);
      const live = run.state === 'running' || run.state === 'waiting';
      const facts = [`Started ${when(run.startedAt)}`];
      // Step A2: a run that came long after its time says so, and why only when Plus knows.
      const late = run.late && run.dueAt ? `Ran late: due ${when(run.dueAt)}${run.whenOpened ? ', ran when the app opened' : ''}.` : '';
      if (!live && run.endedAt) facts.push(`took ${took(run.endedAt - run.startedAt)}`);
      if (run.steps) facts.push(`${num(run.steps)} ${run.steps === 1 ? 'step' : 'steps'}`);
      if (run.tokens) facts.push(`${num(run.tokens)} tokens`);
      const again = (run.state === 'failed' || run.state === 'stopped') && run.tasks.length === 1;
      return h('div', { className: 'dsh-au-row', 'data-top': 'true' },
        h(Badge, { state: run.held && !live ? 'held' : run.state }),
        h('div', { className: 'dsh-au-rowtext' },
          h('div', { className: 'dsh-au-rowtitle' }, runName(run)),
          h('div', { className: 'dsh-au-rowdesc' }, facts.join(' · ')),
          late ? h('div', { className: 'dsh-au-rowdesc' }, late) : null,
          run.state === 'waiting' ? h('div', { className: 'dsh-au-rowdesc' }, `It ${WAIT_WORDS[run.waiting] ?? 'is waiting for you'}.`) : null,
          run.detail ? h('div', { className: 'dsh-au-rowdesc', 'data-error': String(run.state === 'failed') }, run.detail) : null,
          run.text ? h('div', { className: 'dsh-au-words', 'data-open': String(open), onClick: () => setOpen((value) => !value), title: open ? 'Show less' : 'Show more' }, run.text) : null),
        h('div', { className: 'dsh-au-btns' },
          again ? h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: () => onAgain(run.tasks[0].id) }, 'Run again') : null,
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openConversation(appCtx, run.sessionId) }, 'Open')));
    }

    const TARGET_WORDS = {
      session: 'Writes every run into one thread.',
      new_once: 'Opens one thread at its first run, then reuses it.',
      new: 'Opens a new thread at every run.',
    };
    /** Known mode names (a mode id is never shown raw: 'creator-plus' reads Creator Plus, 'bench' reads Devices). */
    const MODE_NAMES = { plain: 'Plain chat', chat: 'Chat', cowork: 'Cowork', code: 'Code', research: 'Research', scout: 'Scout', finance: 'Finance', data: 'Data', content: 'Content', automations: 'Automations', bench: 'Devices', recon: 'Recon', 'creator-plus': 'Creator Plus' };
    const tabName = (id) => (id ? MODE_NAMES[id] ?? id.split('-').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ') : '');

    /**
     * An automation's preset as a small label with an (i) (item 7, point 22): Standard, PTC, Creator or another one.
     * The (i) says what the preset does, where it comes from and how to change it; the words come from the server.
     */
    /** The preset part's own words. */
    const PRESET_UI = {
      en: { unknown: 'Preset not known', about: (name) => `preset ${name}`, label: 'Preset: ', change: 'Change', fixed: 'It follows its thread, so it cannot be changed here.', none: 'The app lists no presets right now, so it cannot be changed. Try again in a minute.', pickFor: (title) => `Preset for ${title || 'this automation'}`, use: 'Use it', cancel: 'Cancel', saved: (name) => `Saved. Its next run uses ${name}.` },
    };
    // Plus is English only (decision 28): `lang` stays accepted.
    const presetUiWords = () => PRESET_UI.en;

    function PresetTag({ preset, lang }) {
      if (!preset) return null;
      const words = presetUiWords(lang);
      const name = preset.name || words.unknown;
      return h('span', { className: 'dsh-au-preset' },
        h('span', { className: 'dsh-au-tag', 'data-preset': preset.kind || 'other' }, name),
        h(ui.Info, { label: words.about(name), ...(preset.info ?? { title: name }) }));
    }

    /**
     * Details → Preset: the label, and Change (only for an automation that opens its own thread). The first
     * choice, App default, stores no preset, so an automation can go back to following the app's default.
     */
    function PresetPart({ task, data, busy, act }) {
      const preset = task.preset;
      const words = presetUiWords(data.lang);
      const [picking, setPicking] = useState(false);
      const choices = Array.isArray(data.presets?.choices) ? data.presets.choices : [];
      const followDefault = typeof data.presets?.defaultChoice === 'string' ? data.presets.defaultChoice : ':default';
      const [pick, setPick] = useState('');
      if (!preset) return null;
      // What the automation has now: App default when none is stored, else its own preset.
      const current = preset.from === 'default' ? followDefault : preset.from === 'own' ? preset.id : '';
      const chosen = choices.find((choice) => choice.id === pick);
      const start = () => { setPick(current && choices.some((choice) => choice.id === current) ? current : (preset.id && choices.some((choice) => choice.id === preset.id) ? preset.id : (choices[0]?.id ?? ''))); setPicking(true); };
      const use = () => act({ action: 'preset', id: task.id, preset: pick, expectedUpdatedAt: task.updatedAt }, words.saved(chosen?.name ?? pick)).then((ok) => { if (ok) setPicking(false); });
      return h('div', null,
        h('div', { className: 'dsh-au-inline' },
          h('b', null, words.label), h(PresetTag, { preset, lang: data.lang }),
          preset.changeable && !picking ? h('button', { type: 'button', className: 'dsh-au-link', disabled: busy || choices.length === 0, onClick: start }, words.change) : null),
        !preset.changeable ? h('div', { className: 'dsh-au-rowdesc' }, words.fixed) : null,
        preset.changeable && choices.length === 0 ? h('div', { className: 'dsh-au-rowdesc' }, words.none) : null,
        picking ? h('div', { className: 'dsh-au-inline', style: { marginTop: 6 } },
          h('select', { value: pick, disabled: busy, 'aria-label': words.pickFor(task.title), onChange: (e) => setPick(e.target.value), style: { width: 'auto' } },
            choices.map((choice) => h('option', { key: choice.id, value: choice.id }, choice.name))),
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || !pick || pick === current, onClick: use }, words.use),
          h('button', { type: 'button', className: 'dsh-au-link', disabled: busy, onClick: () => setPicking(false) }, words.cancel)) : null,
        picking && preset.notes?.[pick] ? h('div', { className: 'dsh-au-rowdesc' }, preset.notes[pick]) : null);
    }
    /**
     * Stage 7 (point 29): the line of a one-time automation that ended with no recorded run: what happened, why when
     * known, and what to do next.
     */
    function notStartedLine(info) {
      const due = Number.isFinite(info?.at) ? ` (it was due ${when(info.at)})` : '';
      const why = info?.reason ? ` ${info.reason}` : ' No run was recorded for it.';
      return `Did not start${due}.${why} It stays here until you delete it (Details → Delete…). To try again, make a new one with New.`;
    }
    const ALERT_KEYS = [['failed', 'Fails or is stopped'], ['needs', 'Needs you'], ['finished', 'Finishes']];

    /** One automation's details (step A7): what the app stores, its runs, its own alerts and keep rule. */
    function Detail({ task, runs, data, busy, act, appCtx }) {
      const [title, setTitle] = useState(task.title);
      const [prompt, setPrompt] = useState(task.prompt);
      // The version the drafts started from: Save sends it, so a change made elsewhere meanwhile is refused
      // instead of undone (review finding 6). Untouched drafts follow the latest version.
      const [base, setBase] = useState({ updatedAt: task.updatedAt, title: task.title, prompt: task.prompt });
      useEffect(() => {
        if (task.updatedAt === base.updatedAt) return;
        if (title === base.title && prompt === base.prompt) {
          setTitle(task.title);
          setPrompt(task.prompt);
          setBase({ updatedAt: task.updatedAt, title: task.title, prompt: task.prompt });
        }
      }, [task.updatedAt]);
      const keep = task.keep ?? task.keepDefault ?? { days: 31, count: 0 };
      const [days, setDays] = useState(String(keep.days));
      const [count, setCount] = useState(String(keep.count));
      const own = runs.filter((run) => run.tasks.some((item) => item.id === task.id)).slice(0, 10);
      const changed = title.trim() !== base.title || prompt.trim() !== base.prompt;
      const saveText = () => act({
        action: 'edit', id: task.id, expectedUpdatedAt: base.updatedAt,
        ...(title.trim() !== base.title ? { title } : {}), ...(prompt.trim() !== base.prompt ? { prompt } : {}),
      }, 'Saved.').then((ok) => { if (ok) setBase({ updatedAt: undefined, title: title.trim(), prompt: prompt.trim() }); });
      // An ended automation never goes to the trash (it would never run again), so its Delete is for good.
      const toTrash = data.settings?.deletedToTrash !== false && data.trash && task.status !== 'ended';
      const remove = () => {
        const text = toTrash
          ? `Delete "${task.title || 'this automation'}"?\n\nIt goes to the trash for 30 days, where Put back makes it again. Its list of past deliveries in the app is deleted for good.`
          : `Delete "${task.title || 'this automation'}" for good?\n\nIt cannot be put back, and its list of past deliveries is deleted too.`;
        void askInPage({ text, ok: 'Delete', danger: true }).then((yes) => { if (yes) act({ action: 'delete', id: task.id, expectedUpdatedAt: task.updatedAt }, 'Deleted.'); });
      };
      return h('div', { className: 'dsh-au-detail' },
        h('label', null, 'Name', h('input', { type: 'text', value: title, maxLength: 120, onChange: (e) => setTitle(e.target.value) })),
        h('label', null, 'Instruction (sent at every run)', h('textarea', { rows: 5, value: prompt, onChange: (e) => setPrompt(e.target.value) })),
        h('div', { className: 'dsh-au-inline' },
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || !changed, onClick: saveText }, 'Save'),
          changed ? h('button', { type: 'button', className: 'dsh-au-link', onClick: () => { setTitle(task.title); setPrompt(task.prompt); setBase({ updatedAt: task.updatedAt, title: task.title, prompt: task.prompt }); } }, 'Undo changes') : null),
        h('div', null,
          h('div', null, h('b', null, 'When: '), task.rule || 'A custom rule'),
          h('div', null, h('b', null, 'Where: '), TARGET_WORDS[task.target] ?? 'Its thread.', task.cwd ? ` Folder: ${task.cwd}` : ''),
          h('div', null, h('b', null, 'Mode: '), tabName(task.tab), task.createdIn ? ` (created in ${tabName(task.createdIn)})` : ' (where it was created is not known)')),
        h(RunsInPart, { task, data, busy, act, appCtx }),
        task.didNotStart && own.length === 0 ? h('div', { className: 'dsh-au-rowdesc', 'data-error': 'true' }, notStartedLine(task.didNotStart)) : task.ranUnrecorded && own.length === 0 ? h('div', { className: 'dsh-au-rowdesc' }, task.ranUnrecorded.line) : task.pausedNote ? h('div', { className: 'dsh-au-rowdesc', 'data-error': 'true' }, task.pausedNote) : null,
        h(PresetPart, { task, data, busy, act }),
        // Stage 7 lab (bug C): a one-time automation the app ran alone opens the thread of that delivery.
        task.sessionId || task.ranUnrecorded?.sessionId ? h('div', null, h('button', { type: 'button', className: 'dsh-au-link', onClick: () => openConversation(appCtx, task.sessionId || task.ranUnrecorded.sessionId) }, 'Open its thread')) : null,
        h('div', null, h('b', null, 'Alerts for this automation'), h('div', { className: 'dsh-au-rowdesc' }, 'Default follows Settings → Alerts.')),
        h('div', { className: 'dsh-au-inline' }, ALERT_KEYS.map(([key, label]) => h('label', { key, style: { flexDirection: 'row', alignItems: 'center' } }, `${label}: `,
          h('select', {
            value: task.alerts?.[key] === true ? 'on' : task.alerts?.[key] === false ? 'off' : 'default',
            disabled: busy,
            onChange: (e) => {
              const next = { ...(task.alerts ?? {}) };
              if (e.target.value === 'default') delete next[key];
              else next[key] = e.target.value === 'on';
              act({ action: 'alerts', id: task.id, alerts: next }, 'Saved.');
            },
            style: { width: 'auto' },
          }, h('option', { value: 'default' }, 'Default'), h('option', { value: 'on' }, 'Alert'), h('option', { value: 'off' }, 'No alert'))))),
        h('div', null, h('b', null, 'Keep past runs'), h('div', { className: 'dsh-au-rowdesc' },
          task.target === 'new' && data.settings?.oldRunsToTrash !== false
            ? 'Older runs leave the list, and their threads go to the trash for 30 days.'
            : 'Older runs leave this list. Its thread is never touched.',
          task.keep ? '' : ' Starting values, from how often it runs.')),
        h('div', { className: 'dsh-au-inline' },
          h('label', { style: { flexDirection: 'row', alignItems: 'center' } }, 'Days ', h('input', { type: 'number', min: 0, max: 3650, value: days, onChange: (e) => setDays(e.target.value) })),
          h('label', { style: { flexDirection: 'row', alignItems: 'center' } }, 'Runs ', h('input', { type: 'number', min: 0, max: 1000, value: count, onChange: (e) => setCount(e.target.value) })),
          h('span', { className: 'dsh-au-rowdesc' }, '0 = no limit'),
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: () => act({ action: 'keep', id: task.id, keep: { days: Number(days) || 0, count: Number(count) || 0 } }, 'Saved.') }, 'Save'),
          task.keep ? h('button', { type: 'button', className: 'dsh-au-link', disabled: busy, onClick: () => act({ action: 'keep', id: task.id, keep: null }, 'Back to the starting values.') }, 'Starting values') : null),
        own.length > 0 ? h('div', null, h('b', null, 'Its last runs'), own.map((run) => h(RunRow, { key: run.id, run, appCtx, busy, onAgain: () => act({ action: 'run', id: task.id }, 'Started.') }))) : null,
        h('div', { className: 'dsh-au-inline' },
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openPanel(appCtx, 'schedules') }, "Open in the app's editor"),
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: remove }, 'Delete…')));
    }

    const MARK_WORDS = { done: 'Finished', failed: 'Failed or stopped', missed: 'Missed', upcoming: 'Coming', running: 'Running', waiting: 'Needs you', held: 'Did not start (nothing ran)' };
    /** The timeline (step A16): one lane per automation; runs, missed times and times to come. */
    function Timeline() {
      const [span, setSpan] = useState('week');
      const [data, setData] = useState(null);
      const [error, setError] = useState('');
      useEffect(() => {
        let live = true;
        const load = () => call({ action: 'timeline', span })
          .then((next) => { if (live) { setData(next.timeline); setError(''); } })
          .catch((e) => { if (live) setError(`Could not load: ${e.message}`); });
        load();
        const timer = dshPoll.loop(() => load(), { every: 60000, immediate: false });
        return () => { live = false; timer.stop(); };
      }, [span]);
      const pos = (at) => `${Math.max(0, Math.min(100, ((at - data.from) / (data.to - data.from)) * 100))}%`;
      const label = (at) => {
        const d = new Date(at);
        return span === 'day' ? d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      };
      return h('div', null,
        h('div', { className: 'dsh-au-chips' }, ['day', 'week', 'month'].map((id) => h('button', { key: id, type: 'button', className: 'dsh-au-chip', 'aria-pressed': String(span === id), onClick: () => setSpan(id) }, id === 'day' ? 'Day' : id === 'week' ? 'Week' : 'Month'))),
        error ? h('p', { className: 'dsh-au-desc', 'data-error': 'true' }, error) : null,
        !data ? h('p', { className: 'dsh-au-desc' }, 'Loading…') : data.lanes.length === 0 ? h('p', { className: 'dsh-au-desc' }, 'Nothing ran or is due in this time.') : h('div', null,
          data.lanes.map((lane) => h('div', { key: lane.id, className: 'dsh-au-lane' },
            h('div', { className: 'dsh-au-lanename', title: lane.title }, lane.title || 'Untitled'),
            h('div', { className: 'dsh-au-track' },
              h('div', { className: 'dsh-au-now', style: { left: pos(data.now) }, title: 'Now' }),
              lane.marks.map((mark, index) => h('span', { key: index, className: 'dsh-au-mark', 'data-kind': mark.kind, style: { left: pos(mark.at) }, title: `${MARK_WORDS[mark.kind] ?? mark.kind}${mark.late ? ', late' : ''}: ${when(mark.at)}` }))))),
          h('div', { className: 'dsh-au-axis' }, h('span', null, label(data.from)), h('span', null, 'now'), h('span', null, label(data.to))),
          h('p', { className: 'dsh-au-desc' }, 'Filled green: finished. Red: failed or stopped. Grey: did not start (nothing ran). Orange ring: missed. Grey ring: coming. Point at a mark for its time.')));
    }

    /** When a saved Creator Plus run repeats: every day, every weekday, or one day of the week (ISO: 1 = Monday). */
    const CREATOR_DAYS = [['', 'Every day', []], ['weekdays', 'Every weekday', [1, 2, 3, 4, 5]], ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => [String(index + 1), `Every ${day}`, [index + 1]])];

    /**
     * Creator Plus's saved runs, offered here (Creator Plus, the owner's answer of 16 November): Schedule makes
     * a Creator Plus thread in Scratch for the run and an automation that sends the run there. The run
     * changes nothing in the real setup without the user's yes: Creator Plus's own rules hold in that thread.
     */
    function CreatorRuns({ runs, busy, act, appCtx }) {
      const [plan, setPlan] = useState({});
      const [working, setWorking] = useState('');
      const [problem, setProblem] = useState('');
      const of = (name) => plan[name] ?? { time: '09:00', days: '' };
      const schedule = async (run) => {
        setWorking(run.name);
        setProblem('');
        try {
          const sessions = appCtx.get('sessions');
          if (!sessions?.create) throw new Error('this version of the app cannot make a thread from here');
          const scratch = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } });
          const place = scratch.ok ? String((await scratch.json()).place ?? '') : '';
          if (!place) throw new Error('Scratch is not available here (it needs the left panel with spaces)');
          const sessionId = await sessions.create({ cwd: place });
          const claim = await fetch(new URL('dsh-creator-plus/data', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ action: 'claim', sessionId, run: run.name }) });
          if (!claim.ok) throw new Error((await claim.json().catch(() => ({}))).error || 'the thread could not become a Creator Plus one');
          const chosen = of(run.name);
          const days = CREATOR_DAYS.find(([id]) => id === chosen.days)?.[2] ?? [];
          await act({ action: 'creatorRun', name: run.name, sessionId, time: chosen.time, weekdays: days, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }, `Scheduled "${run.name}". It runs in its own Creator Plus thread and changes nothing without your yes.`);
        } catch (error) {
          setProblem(`It did not work: ${error.message}`);
        } finally {
          setWorking('');
        }
      };
      return h(React.Fragment, null,
        h('div', { className: 'dsh-au-group' }, 'Creator Plus saved runs'),
        h('p', { className: 'dsh-au-desc' }, 'Runs you saved on the Creator Plus bar. A scheduled one works in a Creator Plus thread of its own, as a Mission would: it prepares changes in the trial copy only and lists them, with its questions, for you. Nothing in your setup changes without your yes.'),
        problem ? h('p', { className: 'dsh-au-desc', 'data-error': 'true', role: 'status' }, problem) : null,
        runs.map((run) => h('div', { key: run.name, className: 'dsh-au-row' },
          h('div', { className: 'dsh-au-rowtext' }, h('div', { className: 'dsh-au-rowtitle' }, run.name, ' ', h('span', { className: 'dsh-au-tag' }, 'Creator Plus')), h('div', { className: 'dsh-au-rowdesc' }, run.sentence)),
          h('div', { className: 'dsh-au-btns' },
            h('select', { value: of(run.name).days, disabled: busy || Boolean(working), 'aria-label': `When ${run.name} runs`, onChange: (e) => setPlan({ ...plan, [run.name]: { ...of(run.name), days: e.target.value } }) }, CREATOR_DAYS.map(([id, label]) => h('option', { key: id, value: id }, label))),
            h('input', { type: 'time', value: of(run.name).time, disabled: busy || Boolean(working), 'aria-label': `Time for ${run.name}`, onChange: (e) => setPlan({ ...plan, [run.name]: { ...of(run.name), time: e.target.value } }) }),
            h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || Boolean(working) || !/^\d\d:\d\d$/.test(of(run.name).time), onClick: () => void schedule(run) }, working === run.name ? 'Scheduling…' : 'Schedule')))));
    }

    // ---- item 6: "Schedule this…" in every chat box, and New on this page ------------------------------------------

    /** Every word of the Schedule form, in English and Chinese (the server's words come in the page's language too). */
    const FORM_UI = {
      en: {
        button: 'Schedule this…',
        checking: 'Checking this thread…',
        readFailed: 'Could not read this thread. Close and try again.',
        title: 'Schedule this',
        newTitle: 'New automation',
        instruction: 'Instruction',
        instructionInfo: { what: 'Sent as your message at every run.', when: 'Write it as you would type it in the chat box.' },
        instructionHint: 'What should happen at each run?',
        name: 'Name',
        nameInfo: { what: 'How it is listed in Automations and in alerts.', change: 'You can rename it later under Details.' },
        when: 'When',
        whenInfo: { what: 'When it runs, in your time zone.', when: 'The app must be open at that time. If it was closed, only the latest missed run happens when it opens.' },
        kinds: { once: 'Once', daily: 'Every day', weekdays: 'Every weekday', days: 'On chosen days', hours: 'Every few hours' },
        days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        dayNames: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        date: 'Date',
        time: 'Time',
        hours: 'Hours',
        zone: (zone) => `Time zone: ${zone}`,
        checkingTime: 'Checking the time…',
        where: 'Where it runs',
        whereInfo: { what: 'Which thread each run writes into.', when: 'A new thread keeps each run apart from what you are doing here.', change: 'One new thread, reused: the first run opens it, later runs go on there.' },
        wheres: { session: 'In this thread', new_once: 'In one new thread, reused', new: 'In a new thread each time' },
        opensIn: (tab, folder, preset) => `Opens in ${tab} mode${folder ? `, folder ${folder}` : ''}, preset ${preset}`,
        change: 'Change',
        hide: 'Hide',
        tab: 'Mode',
        tabInfo: { what: 'The mode its new threads open in, with that mode\'s tools and rules.', change: 'Change it later under Details → Runs in.' },
        tabSetting: (tab) => `New threads open in the mode for automations, ${tab} (Settings → Alerts → New threads use the automation's mode is off).`,
        folder: 'Folder',
        folderInfo: { what: 'The folder its new threads work in.', when: 'Scratch is a throwaway folder Plus keeps for you.' },
        scratch: 'Scratch',
        otherFolder: 'Another folder',
        folderHint: '/Users/you/Projects/…',
        preset: 'Preset',
        presetInfo: { what: 'The preset its new threads start in.', when: 'By default the same as this thread. A mode with a preset lock always uses its lock.' },
        sameAsChat: (name) => `Same as this thread${name ? ` (${name})` : ''}`,
        appDefault: 'App default',
        lockNote: (name) => `This mode always uses ${name}. Change it in Settings → Modes.`,
        schedule: 'Schedule',
        create: 'Create',
        cancel: 'Cancel',
        working: 'Scheduling…',
        done: (name, next) => `Scheduled: ${String(name ?? '').replace(/[.!?…]+$/, '')}.${next ? ` Next run: ${next}.` : ''} Change or delete it in Automations.`,
        openIt: 'Open in Automations',
        close: 'Close',
        unsure: 'Not sure it was saved. Open Automations to check before trying again.',
        openSetting: 'Open that setting',
        recon: 'Recon',
        created: (next) => `Created.${next ? ` Next run: ${next}.` : ''}`,
        newButton: 'New automation',
        noScratch: 'Scratch is not available here (it needs the left panel with spaces). Pick Another folder.',
        fullPath: 'Type the full folder path, starting with /.',
        previewFailed: 'Could not check the time. Check that the app is running, then change the time to try again.',
        newFailed: 'Could not open the form. Close it and try again.',
        settingNotOpened: 'Open Settings → Alerts → Scheduling from Recon.',
        runsIn: 'Runs in',
        // Item 4A, stage 6b (7.2): "Runs in: space · mode".
        runsInInfo: { what: 'The space and mode its new threads open in, with that space\'s rules and that mode\'s tools.', change: 'Its next new thread opens there.' },
        opensInPlace: (place, folder, preset) => `Opens in ${place}${folder ? `, folder ${folder}` : ''}, preset ${preset}`,
        placeLabel: 'Space and mode',
        placeInfo: { what: 'The space and mode its new threads open in, with that space\'s rules and that mode\'s tools.', change: 'Change it later under Details → Runs in.' },
        guestFolder: 'Folder for those runs',
        guestFolderInfo: { what: 'The folder its new threads work in, in the space you picked.', when: 'Never the Devices folder, /dev or Recon\'s room. Pick a project folder.' },
        presetWillBe: (preset, space) => `After this change its new threads use ${preset} (the lock of ${space}).`,
        useIt: 'Use it',
        runsInSaved: 'Saved. Its next new thread opens there.',
        runsInScheduled: 'Its new threads open in the mode set in Settings → Modes → Mode for automations.',
        runsInOff: 'Its own mode is not used now: Settings → Alerts → "New threads use the automation\'s mode" is off.',
        runsInFinance: 'Finance opens its briefs in a Chat · Finance thread itself.',
        runsInReused: 'Its thread is already made, and every run goes on there.',
        openAlerts: 'Open Alerts',
      },
    };
    const formWords = () => FORM_UI.en;
    const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };
    const todayIso = () => { const d = new Date(Date.now() + 86400000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    /** The first words of an instruction, up to 60 characters, as a starting name (the server checks again). */
    const nameFrom = (text) => {
      const clean = String(text ?? '').replace(/\s+/g, ' ').trim();
      if (clean.length <= 60) return clean;
      const cut = clean.slice(0, 60);
      const space = cut.lastIndexOf(' ');
      return `${(space > 30 ? cut.slice(0, space) : cut).trim()}…`;
    };
    /** A POST to this add-on's route that tells a refusal of the server from a request that may not have arrived. */
    async function post(body) {
      let response;
      try {
        response = await fetch(new URL('dsh-automations/data', document.baseURI), {
          method: 'POST', cache: 'no-store', credentials: 'same-origin',
          headers: { accept: 'application/json', 'content-type': 'application/json', 'x-dsh-locale': pageLangOf() },
          body: JSON.stringify(body),
        });
      } catch (error) {
        throw Object.assign(new Error(String(error?.message ?? error)), { unsure: true });
      }
      const data = await response.json().catch(() => null);
      if (!data) throw Object.assign(new Error(`error ${response.status}`), { unsure: response.status >= 500 || response.status === 0 });
      if (!response.ok) throw Object.assign(new Error(data.error || `error ${response.status}`), { details: data.details ?? '' });
      return data;
    }
    /** Ask the page to show one automation when it opens (from the popover's link). */
    const showTask = (appCtx, id) => {
      try { window.__dshAutomationsShow = id; } catch { /* no window */ }
      openPanel(appCtx, 'automations');
    };

    const FORM_CSS = `
.dsh-au-form { display: flex; flex-direction: column; gap: 10px; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-primary); }
.dsh-au-form-row { display: flex; flex-direction: column; gap: 4px; }
.dsh-au-form-label { display: flex; align-items: center; gap: 2px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-au-form textarea, .dsh-au-form input[type=text], .dsh-au-form input[type=date], .dsh-au-form input[type=time], .dsh-au-form input[type=number], .dsh-au-form select {
  box-sizing: border-box; width: 100%; padding: 6px 10px; border: 0; border-radius: 10px; font: inherit; font-size: 13px; color: var(--dsw-alias-label-primary);
  background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-au-form textarea { resize: vertical; min-height: 64px; }
.dsh-au-form input:focus, .dsh-au-form textarea:focus, .dsh-au-form select:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-au-form-inline { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.dsh-au-form-inline > input, .dsh-au-form-inline > select { width: auto; }
.dsh-au-form-grey { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-au-form-grey[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-au-form-warn { padding: 6px 10px; border-radius: 10px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, #d9822b) 14%, transparent); }
.dsh-au-form-radio { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
.dsh-au-form-btns { display: flex; justify-content: flex-end; gap: 8px; }
.dsh-au-form-chip { height: 26px; min-width: 34px; padding: 0 8px; border-radius: 999px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent; font: inherit; font-size: 12px; cursor: pointer; color: var(--dsw-alias-label-secondary); }
.dsh-au-form-chip[aria-pressed="true"] { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent); border-color: var(--dsw-alias-brand-primary); }
.dsh-au-clock { display: inline-flex; align-items: center; justify-content: center; flex: none; box-sizing: border-box; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 14px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.dsh-au-clock:hover, .dsh-au-clock[aria-expanded="true"] { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-au-clock:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-au-popover { position: fixed; z-index: 2147481000; box-sizing: border-box; width: min(400px, calc(100vw - 16px)); max-height: min(78vh, 680px); overflow: auto; padding: 14px 16px;
  border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary);
  box-shadow: 0 14px 36px color-mix(in srgb, #000 28%, transparent); font: 13px/20px system-ui, sans-serif; }
.dsh-au-popover-title { margin: 0 0 8px; font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-au-popover .dsh-au-form-btns { position: sticky; bottom: -14px; margin: 0 -16px -14px; padding: 8px 16px 14px; background: var(--dsw-alias-bg-overlay, var(--dsw-alias-bg-base)); }
.dsh-au-detail .dsh-au-form-label { flex-direction: row; align-items: center; gap: 2px; }
.dsh-au-detail .dsh-au-form-radio { flex-direction: row; align-items: center; gap: 6px; font-size: 13px; color: var(--dsw-alias-label-primary); }
`;

    const DAY_IDS = [1, 2, 3, 4, 5, 6, 7];

    /** A label with its (i). */
    function Label({ text, info, lang, htmlFor }) {
      return h('label', { className: 'dsh-au-form-label', htmlFor }, text, info ? h(ui.Info, { title: text, ...info, lang, portal: true }) : null);
    }

    /** Item 4A, stage 6b: the options of a space · mode select, grouped under each space's name. */
    function placeGroups(list, keyOf) {
      const groups = [];
      for (const one of Array.isArray(list) ? list : []) {
        const name = String(one.spaceName ?? one.space ?? '');
        let group = groups.find((entry) => entry.name === name);
        if (!group) groups.push(group = { name, rows: [] });
        group.rows.push(one);
      }
      return groups.map((group) => h('optgroup', { key: group.name, label: group.name },
        group.rows.map((one) => h('option', { key: keyOf(one), value: keyOf(one) }, one.label))));
    }

    /**
     * The Schedule form, shared by the chat box's popover (`context.form` 'chat') and New on this page ('new').
     * The server decides what may be offered (`context`) and checks everything again when it is sent.
     */
    function ScheduleForm({ context, lang, draft, appCtx, onDone, onCancel, sessionId }) {
      const words = formWords(lang);
      const chat = context.form === 'chat';
      // Never prefilled from a Recon box: the text would be shown outside Recon.
      const start = chat && !context.recon ? String(draft ?? '').trim() : '';
      const [prompt, setPrompt] = useState(start);
      const [title, setTitle] = useState(nameFrom(start));
      const [named, setNamed] = useState(false);
      const [kind, setKind] = useState('weekdays');
      const [time, setTime] = useState('09:00');
      const [date, setDate] = useState(todayIso());
      const [days, setDays] = useState([1, 2, 3, 4, 5]);
      const [hours, setHours] = useState('3');
      const [where, setWhere] = useState(context.where || context.wheres?.[0] || 'new_once');
      const [tab, setTab] = useState(context.tab || '');
      // Item 4A, stage 6b: New picks a space · mode pair; a guest in Devices or Workshop picks this space or another one
      // (with a folder it picks, never pre-filled).
      const keyOf = (one) => (one ? `${one.space}|${one.mode}` : '');
      const places = !chat && Array.isArray(context.places) ? context.places : null;
      const [placeKey, setPlaceKey] = useState(keyOf(context.place));
      const placeRow = places ? places.find((one) => keyOf(one) === placeKey) : null;
      const guest = chat && context.guest && typeof context.guest === 'object' ? context.guest : null;
      const guestOthers = guest && Array.isArray(guest.other) ? guest.other : [];
      const [guestOther, setGuestOther] = useState(false);
      const [guestKey, setGuestKey] = useState(keyOf(guestOthers[0]));
      const [guestFolder, setGuestFolder] = useState('');
      const guestRow = guest && guestOther ? guestOthers.find((one) => keyOf(one) === guestKey) ?? null : null;
      const guestFolderTrim = guestFolder.trim();
      const ownFolder = String(guest?.ownFolder ?? '').replace(/\/+$/, '');
      const inOwnFolder = Boolean(guestRow && ownFolder && guestFolderTrim && (guestFolderTrim.replace(/\/+$/, '') === ownFolder || guestFolderTrim.startsWith(`${ownFolder}/`)));
      const [folderKind, setFolderKind] = useState('scratch');
      const [folder, setFolder] = useState('');
      const [preset, setPreset] = useState('');
      const [showPreset, setShowPreset] = useState(false);
      const [preview, setPreview] = useState({ line: '', problem: '', pending: true });
      const [working, setWorking] = useState(false);
      const [problem, setProblem] = useState(null);
      // Stage 6b lab fix: a refusal is scrolled into view in the clock's pop-up (it sits low in a tall form), and goes
      // away once a folder is edited (it was about the folder sent).
      const problemAt = useRef(null);
      useEffect(() => {
        if (!problem) return;
        try { problemAt.current?.scrollIntoView?.({ block: 'nearest' }); } catch { /* the form is gone */ }
      }, [problem]);
      const editFolder = (set) => (event) => { set(event.target.value); setProblem(null); };
      const zone = browserZone();
      const when = kind === 'once' ? { kind, date, time } : kind === 'hours' ? { kind, hours: Number(hours) } : kind === 'days' ? { kind, time, days } : { kind, time };
      const whenKey = JSON.stringify(when);
      useEffect(() => {
        let live = true;
        setPreview((now) => ({ ...now, pending: true }));
        // One look at the server 300 ms after the last change.
        const timer = setTimeout(() => {
          post({ action: 'preview', when, timeZone: zone })
            .then((answer) => { if (live) setPreview({ line: answer.line ?? '', problem: answer.problem ?? '', pending: false }); })
            .catch((error) => { if (live) setPreview({ line: words.previewFailed, problem: 'call', details: error.details || error.message, pending: false }); });
        }, 300);
        return () => { live = false; clearTimeout(timer); };
      }, [whenKey]);
      const newChat = where === 'new' || where === 'new_once';
      const tabs = Array.isArray(context.tabs) ? context.tabs : [];
      const tabRow = tabs.find((entry) => entry.id === tab);
      const locked = chat ? (guestRow ? guestRow.locked : context.locked) : placeRow ? placeRow.locked : tabRow?.locked ?? '';
      const lockedName = chat ? (guestRow ? guestRow.lockedName : context.lockedName) : placeRow ? placeRow.lockedName : tabRow?.lockedName ?? '';
      const presets = Array.isArray(context.presets) ? context.presets : [];
      const presetLabel = locked ? lockedName : preset ? presets.find((entry) => entry.id === preset)?.name ?? preset : chat ? words.sameAsChat(context.presetNowName) : words.appDefault;
      const runTabName = chat ? (guestRow ? guestRow.label : context.placeName || context.runTabName) : placeRow ? placeRow.label : context.ownTab === false ? context.scheduledTabName : tabRow?.label ?? tab;
      const placeShown = chat ? Boolean(guestRow || context.place) : Boolean(placeRow);
      const cwd = folderKind === 'scratch' ? '' : folder.trim();
      const ready = prompt.trim() && title.trim() && title.trim().length <= 120 && !preview.pending && !preview.problem && (!newChat || chat || (places ? placeRow : tab)) && (chat || folderKind === 'scratch' || cwd.startsWith('/')) && (!newChat || !guestRow || guestFolderTrim.startsWith('/'));
      const onPrompt = (value) => { setPrompt(value); if (!named) setTitle(nameFrom(value)); };
      const send = async () => {
        setWorking(true);
        setProblem(null);
        try {
          let place = cwd;
          if (!chat && folderKind === 'scratch') {
            const scratch = await fetch(new URL('dsh-cowork-shell/scratch', document.baseURI), { method: 'POST', cache: 'no-store', credentials: 'same-origin', headers: { accept: 'application/json' } }).catch(() => null);
            place = scratch?.ok ? String((await scratch.json().catch(() => ({}))).place ?? '') : '';
            if (!place) throw Object.assign(new Error(words.noScratch), {});
          }
          const guestPlace = guest && newChat ? (guestRow ? { place: { space: guestRow.space, mode: guestRow.mode }, cwd: guestFolderTrim } : { place: { space: guest.space, mode: guest.here?.mode } }) : {};
          const newPlace = placeRow ? { place: { space: placeRow.space, mode: placeRow.mode }, tab: placeRow.mode, cwd: place } : { tab, cwd: place };
          const body = { action: 'create', title: title.trim(), prompt: prompt.trim(), when, timeZone: zone, where, ...(chat ? { sessionId, ...guestPlace } : newPlace), ...(newChat && preset && !locked ? { preset } : {}) };
          const answer = await post(body);
          onDone(answer.made ?? {}, answer, prompt.trim());
        } catch (error) {
          setProblem(error);
        } finally {
          setWorking(false);
        }
      };
      const row = (label, info, ...children) => h('div', { className: 'dsh-au-form-row' }, h(Label, { text: label, info, lang }), ...children);
      return h('div', { className: 'dsh-au-form' },
        chat && context.reconWarn ? h('div', { className: 'dsh-au-form-warn', role: 'note' }, context.reconWarn) : null,
        row(words.instruction, words.instructionInfo,
          h('textarea', { rows: 3, value: prompt, disabled: working, placeholder: words.instructionHint, 'aria-label': words.instruction, onChange: (e) => onPrompt(e.target.value) })),
        row(words.name, words.nameInfo,
          h('input', { type: 'text', value: title, maxLength: 120, disabled: working, 'aria-label': words.name, onChange: (e) => { setTitle(e.target.value); setNamed(true); } })),
        row(words.when, words.whenInfo,
          h('div', { className: 'dsh-au-form-inline' },
            h('select', { value: kind, disabled: working, 'aria-label': words.when, onChange: (e) => setKind(e.target.value) },
              Object.entries(words.kinds).map(([id, label]) => h('option', { key: id, value: id }, label))),
            kind === 'once' ? h('input', { type: 'date', value: date, disabled: working, 'aria-label': words.date, onChange: (e) => setDate(e.target.value) }) : null,
            kind === 'hours'
              ? h('input', { type: 'number', min: 1, max: 24, value: hours, disabled: working, 'aria-label': words.hours, style: { width: 72 }, onChange: (e) => setHours(e.target.value) })
              : h('input', { type: 'time', value: time, disabled: working, 'aria-label': words.time, onChange: (e) => setTime(e.target.value) })),
          kind === 'days' ? h('div', { className: 'dsh-au-form-inline', role: 'group', 'aria-label': words.kinds.days },
            DAY_IDS.map((day) => h('button', { key: day, type: 'button', className: 'dsh-au-form-chip', disabled: working, 'aria-pressed': String(days.includes(day)), 'aria-label': words.dayNames[day - 1], onClick: () => setDays(days.includes(day) ? days.filter((one) => one !== day) : [...days, day].sort()) }, words.days[day - 1]))) : null,
          preview.problem === 'call'
            ? h(ui.ErrorNote, { what: preview.line, details: preview.details || '' })
            : h('div', { className: 'dsh-au-form-grey', 'data-error': String(Boolean(preview.problem)), role: 'status' }, preview.pending && !preview.line ? words.checkingTime : preview.line),
          h('div', { className: 'dsh-au-form-grey' }, words.zone(zone))),
        !chat && places ? row(words.placeLabel, words.placeInfo,
          h('select', { value: placeKey, disabled: working, 'aria-label': words.placeLabel, onChange: (e) => { setPlaceKey(e.target.value); setPreset(''); } },
            placeGroups(places, keyOf))) : null,
        !chat && !places ? row(words.tab, words.tabInfo,
          h('select', { value: tab, disabled: working, 'aria-label': words.tab, onChange: (e) => { setTab(e.target.value); setPreset(''); } },
            tabs.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.label))),
          context.ownTab === false ? h('div', { className: 'dsh-au-form-grey' }, words.tabSetting(context.scheduledTabName)) : null) : null,
        !chat ? row(words.folder, words.folderInfo,
          h('div', { className: 'dsh-au-form-inline' },
            h('label', { className: 'dsh-au-form-radio' }, h('input', { type: 'radio', name: 'dsh-au-folder', checked: folderKind === 'scratch', disabled: working, onChange: () => setFolderKind('scratch') }), words.scratch),
            h('label', { className: 'dsh-au-form-radio' }, h('input', { type: 'radio', name: 'dsh-au-folder', checked: folderKind === 'other', disabled: working, onChange: () => setFolderKind('other') }), words.otherFolder)),
          folderKind === 'other' ? h('input', { type: 'text', value: folder, disabled: working, placeholder: words.folderHint, 'aria-label': words.otherFolder, onChange: editFolder(setFolder) }) : null,
          folderKind === 'other' && !folder.trim().startsWith('/') ? h('div', { className: 'dsh-au-form-grey' }, words.fullPath) : null) : null,
        row(words.where, words.whereInfo,
          (context.wheres ?? []).map((id) => h('label', { key: id, className: 'dsh-au-form-radio' },
            h('input', { type: 'radio', name: `dsh-au-where-${sessionId || 'new'}`, value: id, 'aria-label': words.wheres[id] ?? id, checked: where === id, disabled: working, onChange: () => setWhere(id) }), words.wheres[id] ?? id)),
          chat && context.recon && context.reconNewChat ? h('div', { className: 'dsh-au-form-grey' }, context.reconNewChat) : null,
          // Item 4A, stage 6b (J10): a guest's new threads: this space · this mode, or another space with a folder it picks.
          guest && newChat ? h('div', { className: 'dsh-au-form-row', role: 'radiogroup', 'aria-label': words.runsIn },
            h('div', { className: 'dsh-au-form-grey' }, guest.info),
            h('label', { className: 'dsh-au-form-radio' }, h('input', { type: 'radio', name: `dsh-au-guest-${sessionId}`, checked: !guestOther, disabled: working, onChange: () => { setGuestOther(false); setPreset(''); } }), guest.here?.label ?? ''),
            guestOthers.length > 0 ? h('label', { className: 'dsh-au-form-radio' }, h('input', { type: 'radio', name: `dsh-au-guest-${sessionId}`, checked: guestOther, disabled: working, onChange: () => { setGuestOther(true); setPreset(''); } }), guest.otherLabel) : null,
            guestOther ? h('select', { value: guestKey, disabled: working, 'aria-label': guest.otherLabel, onChange: (e) => { setGuestKey(e.target.value); setPreset(''); } }, placeGroups(guestOthers, keyOf)) : null,
            guestRow ? h('div', { className: 'dsh-au-form-warn', role: 'note' }, guestRow.warn) : null,
            guestRow ? h(Label, { text: words.guestFolder, info: words.guestFolderInfo, lang }) : null,
            guestRow ? h('input', { type: 'text', value: guestFolder, disabled: working, placeholder: words.folderHint, 'aria-label': words.guestFolder, onChange: editFolder(setGuestFolder) }) : null,
            guestRow && !guestFolderTrim ? h('div', { className: 'dsh-au-form-grey' }, guestRow.folderNeeded) : null,
            guestRow && guestFolderTrim && !guestFolderTrim.startsWith('/') ? h('div', { className: 'dsh-au-form-grey' }, words.fullPath) : null,
            inOwnFolder ? h('div', { className: 'dsh-au-form-warn', role: 'note' }, guest.ownFolderWarn) : null) : null,
          newChat ? h('div', { className: 'dsh-au-form-grey' },
            (placeShown ? words.opensInPlace : words.opensIn)(runTabName, chat ? (guestRow ? guestFolderTrim : context.folder) : '', presetLabel), ' · ',
            h('button', { type: 'button', className: 'dsh-au-link', 'aria-expanded': String(showPreset), onClick: () => setShowPreset(!showPreset) }, showPreset ? words.hide : words.change)) : null,
          where === 'session' && chat && context.missionRunning ? h('div', { className: 'dsh-au-form-warn', role: 'note' }, context.missionWarn) : null,
          where === 'session' && chat ? h('div', { className: 'dsh-au-form-grey' }, context.waitingNote) : null),
        newChat && showPreset ? row(words.preset, words.presetInfo,
          locked
            ? h('div', { className: 'dsh-au-form-grey' }, words.lockNote(lockedName))
            : h('select', { value: preset, disabled: working, 'aria-label': words.preset, onChange: (e) => setPreset(e.target.value) },
              h('option', { value: '' }, chat ? words.sameAsChat(context.presetNowName) : words.appDefault),
              presets.filter((entry) => entry.id !== ':default' || chat).map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name))),
          !locked && preset && presets.find((entry) => entry.id === preset)?.note ? h('div', { className: 'dsh-au-form-grey' }, presets.find((entry) => entry.id === preset).note) : null) : null,
        // The scroll margin keeps the refusal above the pop-up's sticky Cancel/Schedule row (lab recheck: `nearest` saw it
        // as in view while that row covered it).
        problem ? h('div', { ref: problemAt, 'data-au-problem': '', style: { scrollMarginBottom: '72px' } }, h(ui.ErrorNote, problem.unsure ? { what: words.unsure, details: problem.message } : { what: problem.message, details: problem.details || '' },
          problem.unsure ? h('button', { type: 'button', className: 'dshu-link', onClick: () => showTask(appCtx, '') }, words.openIt) : null)) : null,
        h('div', { className: 'dsh-au-form-btns' },
          h(ui.Button, { disabled: working, onClick: onCancel }, words.cancel),
          h(ui.Button, { main: true, disabled: working || !ready, onClick: () => void send() }, working ? words.working : chat ? words.schedule : words.create)));
    }

    /** The automations add-on's own settings, read from the app's shared copy (a hidden clock button stays hidden). */
    function useOwnSettings(appCtx) {
      const [value, setValue] = useState(null);
      useEffect(() => {
        let live = true;
        const read = () => dshPoll.entry(appCtx, NS).then((entry) => { if (live) setValue(entry?.value ?? {}); }).catch(() => {});
        read();
        const off = dshPoll.onChange(appCtx, () => read());
        return () => { live = false; off(); };
      }, []);
      return value;
    }

    /**
     * Session id -> whether it is isolated (Recon) and whether it is in a guarded space (Devices, Workshop; item 4A,
     * stage 6a), asked always (the Recon answer counts only while "Scheduling from Recon" is off). A started chat is
     * asked once; a blank draft follows the tab it is shown in (the app reuses it), so it is asked again at each settings
     * change (picking a tab is one).
     */
    /** Stage 7 (lab): the space's name in the clock pop-up's title while its details load (the answer carries its id). */
    const SPACE_TITLE = Object.freeze({ devices: 'Devices', workshop: 'Workshop' });
    const sealedChats = new Map();
    /**
     * Stage 7 (6b lab leftover): a guarded answer can be passing: a space's "Offer" switch was just switched back on and its
     * guard is ready only a moment later (the add-on starts again). The settings change that asked came too early, and
     * nothing else asks again, so the clock stayed hidden until a reload. A guarded answer is asked again after these waits.
     */
    const SEALED_RECHECK_MS = [1500, 4000, 10000, 20000, 40000];
    function useSealed(sessionId, ask, settings) {
      const [value, setValue] = useState(() => (sessionId && sealedChats.has(sessionId) ? sealedChats.get(sessionId) : null));
      useEffect(() => {
        if (!ask || !sessionId) return undefined;
        if (sealedChats.has(sessionId)) { setValue(sealedChats.get(sessionId)); return undefined; }
        let live = true;
        let timer = null;
        let tries = 0;
        const askNow = () => post({ action: 'isolated', sessionId }).then((answer) => {
          // Item 4A, stage 6a: both answers: sealed (Recon) and guarded (Devices, Workshop; not Creator Plus at home in
          // Workshop, which keeps its clock). An answer without a plain `guarded: false` hides the clock (fail closed).
          const sealed = { isolated: answer?.isolated === true, guarded: answer?.guarded !== false };
          // Stage 6b: a guest in Devices or Workshop keeps its clock while its guard is ready (the popover names the space).
          if (typeof answer?.guest === 'string' && answer.guest) sealed.guest = answer.guest;
          // Only a sealed answer is kept for good (a seal never lifts); the guarded answer follows the thread's mode, which
          // can change, so it is asked again at the next settings change (a mode pick is one). Stage 7 (lab): a guest held
          // by its space (its "Offer" switch off) also answers sealed, but only for as long as it is held, so an answer
          // that is guarded too is never kept, and it is asked again like any guarded answer.
          if (answer?.blank !== true && sealed.isolated && !sealed.guarded) {
            sealedChats.set(sessionId, sealed);
            if (sealedChats.size > 300) sealedChats.delete(sealedChats.keys().next().value);
          }
          if (!live) return;
          setValue(sealed);
          if (sealed.guarded && tries < SEALED_RECHECK_MS.length) {
            timer = setTimeout(() => { timer = null; if (live) askNow(); }, SEALED_RECHECK_MS[tries]);
            tries += 1;
          }
        }).catch(() => { if (live) setValue({ isolated: false, guarded: false }); });
        askNow();
        return () => { live = false; if (timer !== null) clearTimeout(timer); };
      }, [sessionId, ask, settings]);
      return value;
    }
    /** Round 2: the Alerts row "New threads use the automation's mode" (setting runsInTheirTab). */
    function ownModeWords() {
      return { title: 'New threads use the automation\'s mode', what: 'An automation made with the clock button or New opens its new threads in the mode it was made in (Plain chat stays Plain chat, Research stays Research).', change: 'Off: they open in Settings → Modes → Mode for automations, as before. Automations the assistant or Finance made are not affected. Runs set to Devices or Workshop always open there; this switch cannot move them out.' };
    }
    /** Open Settings → Alerts and bring a row into view. False when Settings could not be opened. */
    function openAlertsRow(appCtx, title) {
      let opened = false;
      try { opened = window.__dshSettingsPlus?.openPage?.(appCtx, 'alerts', 'Alerts') === true; } catch { opened = false; }
      if (!opened) return false;
      const look = (tries) => {
        const root = document.querySelector('[data-shortcut-modal="settings"]') ?? document.body;
        const want = String(title).trim().toLowerCase();
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          if (String(node.nodeValue).replace(/\s+/g, ' ').trim().toLowerCase() !== want) continue;
          const row = node.parentElement?.closest?.('.dshu-row, [class*="row"]') ?? node.parentElement;
          try { row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }); } catch { /* old browsers */ }
          if (row?.animate) { try { row.animate([{ background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)' }, { background: 'transparent' }], { duration: 1600 }); } catch { /* no animation */ } }
          return;
        }
        if (tries < 12) setTimeout(() => look(tries + 1), 150);
      };
      setTimeout(() => look(0), 150);
      return true;
    }

    /** Below this chat box width the clock steps aside (Send stays in view). */
    const NARROW_PX = 300;

    function ClockIcon() {
      return h('svg', { width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('circle', { cx: 12, cy: 12, r: 8.5 }), h('path', { d: 'M12 7.5V12l3 2' }));
    }

    /**
     * The clock button next to Send (conversation.input.right): "Schedule this…". It opens a small window anchored to it;
     * the server says what this thread may do, the form sends it, and the chat box is cleared only on a confirmed
     * success, and only when its text was used.
     */
    function ScheduleButton({ appCtx, sessionId, useInput, inputActions }) {
      const settings = useOwnSettings(appCtx);
      // "Scheduling from Recon" off: no clock button in Recon (the server still refuses, as the backstop).
      const reconOff = settings !== null && settings.scheduleFromRecon === false;
      // Item 4A, stage 6a: asked always, so a thread in Devices or Workshop shows no clock (no automation from there until 6b).
      const sealedHere = useSealed(sessionId, true, settings);
      const [settingProblem, setSettingProblem] = useState(false);
      const draft = typeof useInput === 'function' ? useInput((state) => state?.draft ?? '') : '';
      const [open, setOpen] = useState(false);
      const [place, setPlace] = useState(null);
      const [context, setContext] = useState(null);
      const [failed, setFailed] = useState(null);
      const [made, setMade] = useState(null);
      const button = useRef(null);
      const pop = useRef(null);
      const anchor = useRef(null);
      // A very narrow chat box (two Split panes beside the sidebar in a small window) already overflows: the clock
      // steps aside there so Send stays in view (lab finding). New on the Automations page still makes automations.
      const [narrow, setNarrow] = useState(false);
      useEffect(() => {
        const card = anchor.current?.closest?.('[class*="_card"]');
        if (!card || typeof ResizeObserver !== 'function') return undefined;
        const check = () => setNarrow(card.getBoundingClientRect().width < NARROW_PX);
        check();
        const watch = new ResizeObserver(check);
        watch.observe(card);
        return () => watch.disconnect();
      }, [settings === null]);
      const lang = pageLangOf();
      const words = formWords(lang);
      const close = () => { setOpen(false); setContext(null); setFailed(null); setMade(null); setSettingProblem(false); try { button.current?.focus(); } catch { /* gone */ } };
      useEffect(() => {
        if (!open) return undefined;
        const measure = () => {
          const rect = button.current?.getBoundingClientRect();
          if (!rect) return;
          const width = Math.min(400, window.innerWidth - 16);
          const left = Math.max(8, Math.min(rect.right - width, window.innerWidth - 8 - width));
          // Above the button (the chat box sits low); never past the top of the window or under its title bar (44 px):
          // the window scrolls instead, and its buttons stay in view. Below the button when there is more room there.
          const above = Math.round(rect.top - 52);
          const below = Math.round(window.innerHeight - rect.bottom - 16);
          if (above < 420 && below > above) setPlace({ left, top: rect.bottom + 8, maxHeight: Math.max(160, below) });
          else setPlace({ left, bottom: Math.max(8, window.innerHeight - rect.top + 8), maxHeight: Math.max(160, above) });
        };
        measure();
        const inside = (node) => Boolean(node) && ((pop.current && pop.current.contains(node)) || (button.current && button.current.contains(node)) || (typeof node.closest === 'function' && node.closest('.dshu-pop, .dsh-kit-veil')));
        const onDown = (event) => { if (!inside(event.target)) close(); };
        const onKey = (event) => { if (event.key === 'Escape' && !(document.activeElement && typeof document.activeElement.closest === 'function' && document.activeElement.closest('.dshu-pop'))) { event.preventDefault(); close(); } };
        document.addEventListener('pointerdown', onDown, true);
        document.addEventListener('keydown', onKey);
        window.addEventListener('resize', measure);
        return () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', measure); };
      }, [open]);
      if (!sessionId || settings === null || settings.scheduleButton === false) return null;
      const place0 = h('span', { ref: anchor, hidden: true });
      if ((reconOff && sealedHere?.isolated !== false && !open) || (sealedHere?.guarded === true && !open) || (narrow && !open)) return place0;
      const press = () => {
        if (open) { close(); return; }
        setOpen(true);
        setContext(null);
        setFailed(null);
        setMade(null);
        post({ action: 'context', sessionId }).then(setContext).catch((error) => setFailed(error));
      };
      const done = (result, _answer, usedPrompt) => {
        setMade(result);
        // Cleared only when the text in the box was what was scheduled.
        if (usedPrompt && String(draft ?? '').trim() === usedPrompt && typeof inputActions?.setDraft === 'function') {
          try { inputActions.setDraft(''); } catch { /* the box keeps its text */ }
        }
      };
      let body;
      if (failed) body = h(ui.ErrorNote, { what: words.readFailed, details: failed.details || failed.message });
      else if (!context) body = h(ui.StateLine, { state: 'busy', words: words.checking });
      else if (made) {
        body = h(React.Fragment, null,
          h(ui.StateLine, { state: 'ok', words: words.done(made.title, made.nextWords) }),
          h('div', { className: 'dsh-au-form-btns' },
            h(ui.Button, { onClick: close }, words.close),
            h(ui.Button, { main: true, onClick: () => { close(); showTask(appCtx, made.id); } }, words.openIt)));
      } else if (!context.allowed) {
        body = h(React.Fragment, null,
          h(ui.StateLine, { state: context.reasonKind === 'reconOff' ? 'off' : 'warn', words: context.reason }),
          settingProblem ? h('div', { className: 'dsh-au-form-grey', role: 'status' }, words.settingNotOpened) : null,
          h('div', { className: 'dsh-au-form-btns' },
            h(ui.Button, { onClick: close }, words.close),
            context.reasonKind === 'reconOff' ? h(ui.Button, { main: true, onClick: () => { if (openAlertsRow(appCtx, 'Scheduling from Recon')) close(); else setSettingProblem(true); } }, words.openSetting) : null));
      } else body = h(ScheduleForm, { context, lang, draft, appCtx, sessionId, onDone: done, onCancel: close });
      const panel = open ? h('div', {
        ref: pop, className: 'dsh-au-popover', role: 'dialog', 'aria-label': words.title,
        style: place ? { left: place.left, ...(place.top !== undefined ? { top: place.top } : { bottom: place.bottom }), maxHeight: place.maxHeight } : { visibility: 'hidden' },
      }, h('style', null, CSS + FORM_CSS), h('p', { className: 'dsh-au-popover-title' }, words.title, context?.recon ? ` · ${words.recon}` : context?.guest?.spaceName ? ` · ${context.guest.spaceName}` : sealedHere?.guest ? ` · ${SPACE_TITLE[sealedHere.guest] ?? sealedHere.guest}` : ''), body) : null;
      return h(React.Fragment, null,
        place0,
        h('style', null, FORM_CSS),
        h('button', { ref: button, type: 'button', className: 'dsh-au-clock', 'data-dsh-schedule': '', title: words.button, 'aria-label': words.button, 'aria-haspopup': 'dialog', 'aria-expanded': String(open), onClick: press }, h(ClockIcon)),
        panel ? (ReactDOM && typeof ReactDOM.createPortal === 'function' ? ReactDOM.createPortal(panel, document.body) : panel) : null);
    }

    /** New on this page: the same form in a card, for new threads in a tab you pick. */
    function NewCard({ appCtx, onDone, onCancel }) {
      const lang = pageLangOf();
      const words = formWords(lang);
      const [context, setContext] = useState(null);
      const [failed, setFailed] = useState(null);
      useEffect(() => { post({ action: 'context' }).then(setContext).catch(setFailed); }, []);
      return h('div', { className: 'dsh-au-detail' },
        h('style', null, FORM_CSS),
        h('b', null, words.newTitle),
        failed ? h(ui.ErrorNote, { what: words.newFailed, details: failed.details || failed.message }, h('button', { type: 'button', className: 'dshu-link', onClick: onCancel }, words.close)) : !context ? h(ui.StateLine, { state: 'busy', words: words.checking }) : !context.allowed ? h(ui.StateLine, { state: 'warn', words: context.reason }) : h(ScheduleForm, { context, lang, draft: '', appCtx, onDone, onCancel }));
    }

    /** Details → Runs in: the tab an automation's new threads really open in, and Change (only where a pick takes effect). */
    function RunsInPart({ task, data, busy, act, appCtx }) {
      const lang = 'en';
      const words = formWords(lang);
      const [picking, setPicking] = useState(false);
      const keyOf = (one) => (one ? `${one.space}|${one.mode}` : '');
      const places = Array.isArray(data.places) ? data.places : null;
      const [pick, setPick] = useState(places ? keyOf(task.runsInPlace) : task.runTab || task.runsIn || '');
      const [folder, setFolder] = useState('');
      // Item 4A, stage 6b: with spaces, "Runs in: Code · Research" (or "this thread (Recon · Research)"), Change by pair.
      if (places) {
        if (!task.runsInLine) return null;
        const fixed = task.runsInFixed || '';
        const thread = task.target === 'session';
        const changeable = !task.sealed && !fixed && !thread;
        const why = fixed === 'finance' ? words.runsInFinance : fixed === 'reused' ? words.runsInReused : fixed === 'off' ? words.runsInOff : '';
        const row = places.find((one) => keyOf(one) === pick);
        const guarded = task.createdSpace === 'devices' || task.createdSpace === 'workshop';
        const needsFolder = Boolean(row) && guarded && row.space !== task.createdSpace;
        return h('div', null,
          h('div', { className: 'dsh-au-inline' },
            h('span', null, task.runsInLine), h(ui.Info, { title: words.runsIn, ...words.runsInInfo, lang, portal: true }),
            changeable && !picking ? h('button', { type: 'button', className: 'dsh-au-link', disabled: busy || places.length === 0, onClick: () => setPicking(true) }, words.change) : null),
          task.placeNote ? h('div', { className: 'dsh-au-rowdesc', role: 'note' }, task.placeNote) : null,
          why ? h('div', { className: 'dsh-au-rowdesc' }, why,
            fixed === 'off' ? h(React.Fragment, null, ' ', h('button', { type: 'button', className: 'dsh-au-link', onClick: () => openAlertsRow(appCtx, ownModeWords(pageLangOf()).title) }, words.openAlerts)) : null) : null,
          picking ? h('div', { className: 'dsh-au-inline', style: { marginTop: 6, flexWrap: 'wrap' } },
            h('select', { value: pick, disabled: busy, 'aria-label': words.runsIn, onChange: (e) => setPick(e.target.value), style: { width: 'auto' } }, placeGroups(places, keyOf)),
            needsFolder ? h('input', { type: 'text', value: folder, disabled: busy, placeholder: words.folderHint, 'aria-label': words.guestFolder, onChange: (e) => setFolder(e.target.value) }) : null,
            h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || !row || (needsFolder && !folder.trim().startsWith('/')), onClick: () => act({ action: 'runPlace', id: task.id, space: row.space, mode: row.mode, ...(needsFolder ? { cwd: folder.trim() } : {}), expectedUpdatedAt: task.updatedAt }, words.runsInSaved).then((ok) => { if (ok) setPicking(false); }) }, words.useIt),
            h('button', { type: 'button', className: 'dsh-au-link', disabled: busy, onClick: () => setPicking(false) }, words.cancel)) : null,
          // D11, section 5: the preset the new place will use, shown before saving.
          picking && row?.lockedName ? h('div', { className: 'dsh-au-rowdesc' }, words.presetWillBe(row.lockedName, row.spaceName)) : null);
      }
      if (!task.runsIn) return null;
      const tabs = Array.isArray(data.runTabs) ? data.runTabs : [];
      const fixed = task.runsInFixed || '';
      // Change only where the pick is used: not for a Finance brief, a reused chat that exists, or with the setting off.
      const changeable = !task.sealed && !fixed;
      const why = fixed === 'finance' ? words.runsInFinance : fixed === 'reused' ? words.runsInReused : fixed === 'off' ? words.runsInOff : !task.runTab ? words.runsInScheduled : '';
      return h('div', null,
        h('div', { className: 'dsh-au-inline' },
          h('b', null, words.runsIn), h(ui.Info, { title: words.runsIn, ...words.runsInInfo, lang, portal: true }), ' ', task.runsInName || tabName(task.runsIn),
          changeable && !picking ? h('button', { type: 'button', className: 'dsh-au-link', disabled: busy || tabs.length === 0, onClick: () => setPicking(true) }, words.change) : null),
        why ? h('div', { className: 'dsh-au-rowdesc' }, why,
          fixed === 'off' ? h(React.Fragment, null, ' ', h('button', { type: 'button', className: 'dsh-au-link', onClick: () => openAlertsRow(appCtx, ownModeWords(pageLangOf()).title) }, words.openAlerts)) : null) : null,
        picking ? h('div', { className: 'dsh-au-inline', style: { marginTop: 6 } },
          h('select', { value: pick, disabled: busy, 'aria-label': words.runsIn, onChange: (e) => setPick(e.target.value), style: { width: 'auto' } }, tabs.map((tab) => h('option', { key: tab.id, value: tab.id }, tab.label))),
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || !pick, onClick: () => act({ action: 'runTab', id: task.id, tab: pick, expectedUpdatedAt: task.updatedAt }, words.runsInSaved).then((ok) => { if (ok) setPicking(false); }) }, words.useIt),
          h('button', { type: 'button', className: 'dsh-au-link', disabled: busy, onClick: () => setPicking(false) }, words.cancel)) : null);
    }

    /**
     * Item 4A, stage 3b: the "Ask about automations" button's words. With spaces there is no Automations tab: the chat
     * about your automations (the Automations mode) opens from this page, as a new thread in Chat.
     */
    const ASK_UI = {
      en: {
        button: 'Ask about automations',
        info: { title: 'Ask about automations', what: 'Opens a new thread in Chat, in the Automations mode: ask about your automations, make one, or change one in plain words.', when: 'Use it to talk with the assistant about your automations from this page.', change: 'The mode can also be picked from the Mode list under the chat box in Chat.' },
        off: 'The Automations mode is switched off, so this button cannot open it. Switch on "Offer the Automations mode" on Settings → Alerts.',
        row: { title: 'Offer the Automations mode', hint: 'Offers the Automations mode in Chat\'s Mode list under the chat box; "Ask about automations" on the Automations page opens a new thread in it. Off takes the mode away.' },
        failed: 'The thread could not be opened in the Automations mode.',
        noSidebar: 'This needs the left panel with spaces. Pick the Automations mode from the Mode list under the chat box instead.',
      },
    };
    const askWords = () => ASK_UI.en;
    /** @returns {boolean} whether the Cowork sidebar shows spaces in this window (it marks the page with data-cws-space). */
    const spacesShown = () => typeof document !== 'undefined' && document.documentElement.hasAttribute('data-cws-space');

    /** Item 4A, stage 3b: "Ask about automations": a new thread in Chat, Automations mode (the Cowork sidebar opens it). */
    function AskButton({ data, onNote }) {
      const words = askWords(data?.lang);
      if (!spacesShown()) return null;
      const modeOff = data?.settings?.tab === false;
      const ask = () => {
        if (modeOff) { onNote({ text: words.off, error: true }); return; }
        const taken = !window.dispatchEvent(new CustomEvent('dsh-cowork-shell:start', {
          cancelable: true,
          detail: { space: 'chat', mode: 'automations', onError: (why) => onNote({ text: words.failed, details: String(why ?? ''), error: true }) },
        }));
        if (!taken) onNote({ text: words.noSidebar, error: true });
      };
      return h('span', { className: 'dsh-au-inline', style: { gap: '4px' } },
        h('button', { type: 'button', className: 'dsh-au-btn', 'data-dsh-au-ask': '', 'aria-disabled': modeOff ? 'true' : undefined, title: modeOff ? words.off : undefined, onClick: ask }, words.button),
        h(ui.Info, { ...words.info, lang: data?.lang, portal: true }));
    }

    function RunsPage({ appCtx }) {
      const { data, setData, note, setNote, alive } = useData(5000);
      const [busy, setBusy] = useState(false);
      const [all, setAll] = useState(false);
      const [open, setOpen] = useState(() => {
        // Opened from the clock button's "Open in Automations": that automation's details.
        const wanted = typeof window !== 'undefined' ? window.__dshAutomationsShow : '';
        if (typeof window !== 'undefined') window.__dshAutomationsShow = '';
        return typeof wanted === 'string' ? wanted : '';
      });
      const [tab, setTab] = useState('');
      // Item 6: New automation, the same form as the clock button's.
      const [making, setMaking] = useState(() => {
        // Opened from the Automations tab's New button.
        const wanted = typeof window !== 'undefined' && window.__dshAutomationsNew === true;
        if (typeof window !== 'undefined') window.__dshAutomationsNew = false;
        return wanted;
      });
      const [created, setCreated] = useState('');

      if (!data) {
        return h('div', { className: 'dsh-au-page' }, h('style', null, CSS), h('h2', { className: 'dsh-au-title' }, 'Automations'), h('p', { className: 'dsh-au-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      /** Send one change, show the answer, refresh. */
      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await call(body);
          if (!alive.current) return;
          setData(next);
          setNote({ text: done, error: false });
          setTimeout(() => { if (alive.current) setNote((now) => (now.error ? now : { text: '', error: false })); }, 6000);
          return true;
        } catch (error) {
          if (alive.current) setNote({ text: `It did not work: ${error.message}`, details: error.details ?? '', error: true });
          return false;
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const runNow = (id) => act({ action: 'run', id }, 'Started. It appears under Last runs in a moment.');

      const runs = Array.isArray(data.runs) ? data.runs : [];
      const waiting = runs.filter((run) => run.state === 'waiting');
      const lastOf = (taskId) => runs.find((run) => run.tasks.some((task) => task.id === taskId));
      // A task that has ended and has no recorded run has nothing to show here, except a one-time automation that did
      // not start (stage 7, point 29): it stays listed as "Did not start" until you delete it.
      // Stage 7 lab (bug C): one the app ran with no run recorded here (the add-on was off) is listed like one that ran.
      const every = (Array.isArray(data.tasks) ? data.tasks : []).filter((task) => task.status !== 'ended' || lastOf(task.id) || task.didNotStart || task.ranUnrecorded);
      const tabs = [...new Set(every.map((task) => task.tab).filter(Boolean))];
      const tasks = tab ? every.filter((task) => task.tab === tab) : every;
      const missed = every.flatMap((task) => (task.missed ?? []).map((at) => ({ task, at }))).sort((a, b) => b.at - a.at);
      const shown = all ? runs : runs.slice(0, 20);
      const alerts = data.alerts ?? {};
      const where = [alerts.mac ? 'on this Mac' : '', alerts.phone && !alerts.phoneProblem ? 'on your phone' : ''].filter(Boolean).join(' and ');
      const tiles = data.tiles ?? {};
      const tile = (n, label, warn) => h('div', { className: 'dsh-au-tile' }, h('div', { className: 'dsh-au-tilenum', 'data-warn': String(Boolean(warn)) }, n), h('div', { className: 'dsh-au-tilelabel' }, label));

      return h('div', { className: 'dsh-au-page' },
        h('style', null, CSS),
        h('div', { className: 'dsh-au-head' },
          h('div', { className: 'dsh-au-headtext' },
            h('h2', { className: 'dsh-au-title' }, 'Automations'),
            h('p', { className: 'dsh-au-desc' }, 'Your automations, how each run ended, and what needs you. To make a new one, ask the assistant ("do this every weekday at 9"), use the app\'s editor, or New.')),
          h('div', { className: 'dsh-au-btns' },
            h(ui.Button, { main: true, 'aria-expanded': String(making), onClick: () => { setMaking(!making); setCreated(''); } }, formWords(data.lang).newButton),
            h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openPanel(appCtx, 'schedules') }, "App's editor"),
            h(AskButton, { data, onNote: setNote }))),
        making ? h(NewCard, {
          appCtx,
          onCancel: () => setMaking(false),
          onDone: (made, answer) => {
            if (!alive.current) return;
            if (answer && Array.isArray(answer.tasks)) setData(answer);
            setMaking(false);
            setTab('');
            if (made?.id) setOpen(made.id);
            setCreated(formWords(data.lang).created(made?.nextWords));
          },
        }) : null,
        created ? h(ui.StateLine, { state: 'ok', words: created }) : null,
        data.enabled === false ? h('p', { className: 'dsh-au-desc', 'data-error': 'true' }, 'Recording is switched off in Settings → Alerts, so new runs do not appear here.') : null,
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        // Item 4A, stage 3b: the Automations tab's start-page tiles (with "Need you") show here, now that the tab is gone.
        h('div', { className: 'dsh-au-tiles' },
          tile(num(tiles.on), 'Switched on'),
          tile(num(tiles.ranToday), 'Ran today'),
          tile(num(waiting.length), 'Need you', waiting.length > 0),
          tile(num(tiles.missed), 'Missed (7 days)', tiles.missed > 0),
          tile(num(tiles.failed), 'Failed (7 days)', tiles.failed > 0),
          tiles.held > 0 ? tile(num(tiles.held), 'Did not start (7 days)') : null,
          tile(tiles.nextAt ? when(tiles.nextAt) : '—', 'Next run')),

        waiting.length > 0 ? h('div', { className: 'dsh-au-group' }, `Needs you (${waiting.length})`) : null,
        waiting.map((run) => h('div', { key: run.id, className: 'dsh-au-card', role: 'status' },
          h('div', { className: 'dsh-au-rowtext' }, h('b', null, runName(run)), ` ${WAIT_WORDS[run.waiting] ?? 'is waiting for you'}. Started ${when(run.startedAt)}.`),
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openConversation(appCtx, run.sessionId) }, 'Open'))),

        missed.length > 0 ? h('div', { className: 'dsh-au-group' }, `Missed while the app was closed (${missed.length})`) : null,
        missed.length > 0 ? h('p', { className: 'dsh-au-desc' }, 'When the app opens, it runs each automation once for its latest missed time. These earlier times did not run. Run now runs the instruction now, not for the missed time.') : null,
        missed.slice(0, 20).map(({ task, at }) => h('div', { key: `${task.id}-${at}`, className: 'dsh-au-row' },
          h('span', { className: 'dsh-au-badge', 'data-state': 'stopped' }, 'Missed'),
          h('div', { className: 'dsh-au-rowtext' }, h('div', { className: 'dsh-au-rowtitle' }, task.title || 'Untitled'), h('div', { className: 'dsh-au-rowdesc' }, `Was due ${when(at)}`)),
          h('div', { className: 'dsh-au-btns' }, h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || task.running || task.status !== 'active', onClick: () => runNow(task.id) }, 'Run now')))),

        h('div', { className: 'dsh-au-group' }, 'Your automations'),
        tabs.length > 1 ? h('div', { className: 'dsh-au-chips' },
          h('button', { type: 'button', className: 'dsh-au-chip', 'aria-pressed': String(!tab), onClick: () => setTab('') }, 'All modes'),
          tabs.map((id) => h('button', { key: id, type: 'button', className: 'dsh-au-chip', 'aria-pressed': String(tab === id), onClick: () => setTab(id) }, tabName(id)))) : null,
        tasks.length === 0
          ? h('p', { className: 'dsh-au-desc' }, data.scheduler === false ? 'The app\'s scheduler is not running, so there are no automations to show.' : 'No automations yet. Ask the assistant to "do this every weekday at 9", use the clock button next to Send in any chat box, or ',
            data.scheduler === false ? null : h('button', { type: 'button', className: 'dsh-au-link', onClick: () => setMaking(true) }, formWords(data.lang).newButton), data.scheduler === false ? null : '.')
          : tasks.map((task) => {
            const last = lastOf(task.id);
            const notStarted = !last && task.didNotStart ? task.didNotStart : null;
            const ranAlone = !last && !notStarted && task.ranUnrecorded ? task.ranUnrecorded : null;
            const lines = [task.rule || 'A custom rule'];
            if (notStarted) lines.push(notStartedLine(notStarted));
            else if (ranAlone) lines.push(`Ended. ${ranAlone.line}`);
            else if (task.status === 'active' && task.nextAt) lines.push(`next ${when(task.nextAt)}`);
            else if (task.pausedNote) lines.push(task.pausedNote);
            else if (task.status !== 'active') lines.push(TASK_WORDS[task.status] ?? task.status);
            // Stage 7 (lab): a held run says "Did not start" here too, as under Last runs (not "Stopped").
            const lastState = last ? (last.held === true && last.state !== 'running' && last.state !== 'waiting' ? 'held' : last.state) : '';
            if (!notStarted) lines.push(last ? `last: ${STATE_WORDS[lastState] ?? lastState}, ${when(last.startedAt)}` : ranAlone ? `ran ${when(ranAlone.at)}` : task.deliveredAt ? `last started ${when(task.deliveredAt)}` : 'no run yet');
            const on = task.status === 'active';
            return h(React.Fragment, { key: task.id },
              h('div', { className: 'dsh-au-row' },
                task.status === 'ended' ? h('span', { className: 'dsh-au-badge' }, 'Ended') : h('button', {
                  type: 'button', role: 'switch', className: 'dsh-au-switch', 'aria-checked': String(on), disabled: busy,
                  'aria-label': on ? `Pause ${task.title}` : `Switch on ${task.title}`,
                  title: on ? 'On. Click to pause.' : 'Paused. Switching it on moves it to its next time; missed times do not run.',
                  onClick: () => act({ action: on ? 'pause' : 'resume', id: task.id, expectedUpdatedAt: task.updatedAt }, on ? 'Paused.' : 'Switched on. It runs next at its next time.'),
                }),
                h('div', { className: 'dsh-au-rowtext' },
                  h('div', { className: 'dsh-au-rowtitle' }, task.title || 'Untitled', ' ', task.tab ? h('span', { className: 'dsh-au-tag' }, tabName(task.tab)) : null, task.preset ? ' ' : null, h(PresetTag, { preset: task.preset, lang: data?.lang })),
                  h('div', { className: 'dsh-au-rowdesc' }, lines.join(' · '))),
                h('div', { className: 'dsh-au-btns' },
                  last ? h(Badge, { state: lastState }) : notStarted ? h(Badge, { state: 'held' }) : null,
                  h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy || task.running || task.status === 'ended', onClick: () => runNow(task.id) }, task.running ? 'Running…' : 'Run now'),
                  h('button', { type: 'button', className: 'dsh-au-btn', 'aria-expanded': String(open === task.id), onClick: () => setOpen(open === task.id ? '' : task.id) }, open === task.id ? 'Close' : 'Details'))),
              open === task.id ? h(Detail, { task, runs, data, busy, act, appCtx }) : null);
          }),

        Array.isArray(data.creatorRuns) && data.creatorRuns.length > 0 ? h(CreatorRuns, { runs: data.creatorRuns, busy, act, appCtx }) : null,

        h('div', { className: 'dsh-au-group' }, 'Timeline'),
        h(Timeline),

        h('div', { className: 'dsh-au-group' }, 'Last runs'),
        runs.length === 0
          ? h('p', { className: 'dsh-au-desc' }, 'No run recorded yet. Runs appear here from now on; ones from before this add-on was installed are not listed.')
          : shown.map((run) => h(RunRow, { key: run.id, run, appCtx, busy, onAgain: runNow })),
        runs.length > shown.length ? h('p', { className: 'dsh-au-desc' }, h('button', { type: 'button', className: 'dsh-au-link', onClick: () => setAll(true) }, `Show all ${runs.length}`)) : null,

        h('div', { className: 'dsh-au-group' }, 'Good to know'),
        h('ul', { className: 'dsh-au-list' },
          h('li', null, where ? `You are alerted ${where} when a run fails or needs you. Change this in Settings → Alerts, or for one automation under Details.` : 'Alerts are switched off. Switch them on in Settings → Alerts.'),
          h('li', null, 'Automations run only while the app is running. When the window is closed, the app stays in the Dock. Nothing runs while the Mac sleeps.'),
          h('li', null, 'When the app opens after being closed, it runs each automation once for its latest missed time, marked "Ran late". Earlier missed times are listed under Missed.'),
          h('li', null, '"Stopped" means a limit or a rule ended the run before it finished, for example the Budget guard.'),
          h('li', null, data.trash && data.settings?.deletedToTrash !== false ? 'A deleted automation, on any page or by archiving its thread, stays in the trash for 30 days.' : 'Deleting an automation is final.'),
          h('li', null, 'Past runs are kept per automation (Details → Keep past runs).')));
    }

    /** The open sidebar tab, from the Cowork sidebar's mark on the page. */
    function useOpenTab() {
      const read = () => document.documentElement.getAttribute('data-cws-tab') || '';
      const [tab, setTab] = useState(read);
      useEffect(() => {
        const watch = new MutationObserver(() => setTab(read()));
        watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-cws-tab'] });
        return () => watch.disconnect();
      }, []);
      return tab;
    }

    /** The Automations tab's start page (step A5): its tiles, and the way to the full page. */
    function TabTiles({ appCtx }) {
      const { data } = useData(15000);
      const tiles = data?.tiles ?? {};
      const waiting = (data?.runs ?? []).filter((run) => run.state === 'waiting').length;
      const tile = (n, label, warn) => h('div', { className: 'dsh-au-tile' }, h('div', { className: 'dsh-au-tilenum', 'data-warn': String(Boolean(warn)) }, n), h('div', { className: 'dsh-au-tilelabel' }, label));
      return h('div', { className: 'dsh-au-bar' },
        h('style', null, CSS),
        h('div', { className: 'dsh-au-tiles', style: { margin: 0 } },
          tile(data ? num(tiles.on) : '…', 'Switched on'),
          tile(data ? num(tiles.ranToday) : '…', 'Ran today'),
          tile(data ? num(waiting) : '…', 'Need you', waiting > 0),
          tile(data ? num(tiles.missed) : '…', 'Missed (7 days)', tiles.missed > 0),
          tile(data ? num(tiles.failed) : '…', 'Failed (7 days)', tiles.failed > 0),
          data && tiles.held > 0 ? tile(num(tiles.held), 'Did not start (7 days)') : null,
          tile(data && tiles.nextAt ? when(tiles.nextAt) : '—', 'Next run')),
        h('div', { className: 'dsh-au-inline', style: { justifyContent: 'center' } },
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => openPanel(appCtx, 'automations') }, 'Open Automations'),
          h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => { try { window.__dshAutomationsNew = true; } catch { /* no window */ } openPanel(appCtx, 'automations'); } }, formWords(data?.lang).newButton),
          h('span', { className: 'dsh-au-rowdesc' }, 'Or ask here: "every weekday at 8, summarise my inbox", "what did the morning brief say on Monday?"')));
    }
    function TabStart({ appCtx }) {
      return useOpenTab() === 'automations' ? h(TabTiles, { appCtx }) : null;
    }

    /** The same page inside the app's main area, opened from the sidebar. */
    function RunsPanel({ appCtx }) {
      return h('div', { style: { height: '100%', overflowY: 'auto', boxSizing: 'border-box', padding: '28px clamp(16px, 4vw, 48px) 40px' } },
        h('div', { style: { maxWidth: 900, margin: '0 auto' } }, h(RunsPage, { appCtx })));
    }

    function RunsIcon({ size }) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('path', { d: 'M4 6h3M4 12h3M4 18h3' }), h('path', { d: 'M11 6h9M11 12h9M11 18h9' }));
    }

    // ---- Settings > Alerts ---------------------------------------------------------------------

    function Row({ title, hint, children }) {
      return h('div', { className: 'dsh-au-row' },
        h('div', { className: 'dsh-au-rowtext' }, h('div', { className: 'dsh-au-rowtitle' }, title), hint ? h('div', { className: 'dsh-au-rowdesc' }, hint) : null),
        children);
    }

    function Switch({ on, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-au-switch', 'aria-checked': on === true, 'aria-label': label, onClick: () => onChange(!on) });
    }

    /** A text box saved when you leave it. */
    function TextField({ value, label, placeholder, small, clean, onCommit }) {
      const [draft, setDraft] = useState(value);
      useEffect(() => setDraft(value), [value]);
      const commit = () => {
        const next = clean ? clean(draft) : String(draft).trim();
        if (next !== value) onCommit(next);
        else setDraft(value);
      };
      return h('input', {
        className: 'dsh-au-field', 'data-small': String(small === true), value: draft, placeholder, 'aria-label': label, spellCheck: false, autoCapitalize: 'off', autoCorrect: 'off',
        inputMode: small ? 'numeric' : undefined,
        onChange: (event) => setDraft(event.target.value), onBlur: commit, onKeyDown: (event) => { if (event.key === 'Enter') event.target.blur(); },
      });
    }

    /** A topic nobody could guess that is still easy to type on a phone. */
    function madeUpTopic() {
      const letters = 'abcdefghjkmnpqrstuvwxyz23456789';
      const bytes = crypto.getRandomValues(new Uint8Array(12));
      const text = Array.from(bytes, (byte) => letters[byte % letters.length]).join('');
      return `dsh-${text.slice(0, 4)}-${text.slice(4, 8)}-${text.slice(8, 12)}`;
    }

    const SENT_WORDS = (sent) => {
      const parts = [];
      const stop = (text) => (/[.!?]$/.test(text) ? text : `${text}.`);
      if (sent.mac) parts.push(sent.mac === 'ok' ? 'This Mac: sent.' : stop(`This Mac: ${sent.mac}`));
      if (sent.phone) parts.push(sent.phone === 'ok' ? 'Phone: sent.' : stop(`Phone: ${sent.phone}`));
      return parts.join(' ') || 'Nothing was sent: both "On this Mac" and "On my phone" are off.';
    };

    /** A part another add-on adds to this page (Notify); a part that fails to draw leaves the rest of the page alone. */
    class PartBoundary extends React.Component {
      constructor(props) { super(props); this.state = { failed: false }; }
      static getDerivedStateFromError() { return { failed: true }; }
      render() { return this.state.failed ? h('p', { className: 'dsh-au-desc', 'data-error': 'true' }, 'This part could not be shown. Restart the app and try again.') : this.props.children; }
    }

    function AlertsPage({ appCtx }) {
      dshMerge.useTab(React, 'alerts'); // draws the page again when another add-on adds or removes a part
      const { data, setData, note, setNote, alive } = useData(0);
      const [busy, setBusy] = useState(false);

      if (!data) {
        return h('div', { className: 'dsh-au-page' }, h('style', null, CSS), h('h2', { className: 'dsh-au-title' }, 'Alerts'), h('p', { className: 'dsh-au-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }
      const alerts = data.alerts ?? {};
      // The page's names for the settings, and the names they are saved under.
      const KEYS = { failed: 'alertFailed', needs: 'alertNeeds', finished: 'alertFinished', others: 'alertOthers', runs: 'alertRuns' };
      const save = async (values) => {
        try {
          await setSettings(appCtx, Object.fromEntries(Object.entries(values).map(([key, value]) => [KEYS[key] ?? key, value])));
          if (!alive.current) return;
          setData((d) => ({ ...d, ...('enabled' in values ? { enabled: values.enabled } : {}), alerts: { ...d.alerts, ...values } }));
          setNote({ text: 'Saved.', error: false });
          // Read it back, so a problem with the new values shows at once.
          call().then((next) => { if (alive.current) setData(next); }).catch(() => {});
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, details: error.details ?? '', error: true });
        }
      };
      /** This add-on's own switches (not alerts). */
      const saveOwn = async (values) => {
        try {
          await setSettings(appCtx, values);
          if (!alive.current) return;
          setData((d) => ({ ...d, settings: { ...d.settings, ...values } }));
          setNote({ text: 'Saved.', error: false });
          call().then((next) => { if (alive.current) setData(next); }).catch(() => {});
        } catch (error) {
          if (alive.current) setNote({ text: `Could not save: ${error.message}`, details: error.details ?? '', error: true });
        }
      };
      const test = async () => {
        setBusy(true);
        try {
          const next = await call({ action: 'test' });
          if (!alive.current) return;
          setData(next);
          const sent = next.sent ?? {};
          setNote({ text: SENT_WORDS(sent), error: [sent.mac, sent.phone].some((value) => value && value !== 'ok') });
        } catch (error) {
          if (alive.current) setNote({ text: `Could not send the test: ${error.message}`, details: error.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };

      return h('div', { className: 'dsh-au-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-au-title' }, 'Alerts'),
        h('p', { className: 'dsh-au-desc' }, 'A short line when an automation, a Mission or a thread fails, needs you or finishes, so you can walk away. The line has its name and what happened, for example "Morning brief failed". It never has your instruction or the answer in it.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,

        h('div', { className: 'dsh-au-group' }, 'Alert me when'),
        h(Row, { title: 'A run failed or was stopped' }, h(Switch, { on: alerts.failed, label: 'A run failed or was stopped', onChange: (on) => save({ failed: on }) })),
        h(Row, { title: 'A run needs me', hint: 'It waits for your approval, your answer to a question, or your review of its plan.' }, h(Switch, { on: alerts.needs, label: 'A run needs me', onChange: (on) => save({ needs: on }) })),
        h(Row, { title: 'A run finished' }, h(Switch, { on: alerts.finished, label: 'A run finished', onChange: (on) => save({ finished: on }) })),

        h('div', { className: 'dsh-au-group' }, 'For which runs'),
        h(Row, { title: 'Automations', hint: 'Always, when alerts are on. The alert names the automation; a Recon automation\'s alert says only "A Recon automation".' }, null),
        h(Row, { title: 'Missions', hint: 'When a Mission ends, waits for you, needs your yes, or stops by itself (also after the app closed during a Mission). Never for each round. The alert names the project folder, never the Mission\'s goal.' }, h(Switch, { on: alerts.runs !== false, label: 'Missions', onChange: (on) => save({ runs: on }) })),
        h(Row, { title: 'Also threads I start myself', hint: 'The alert names the project folder, not the thread. The rounds of a running Mission never alert one by one.' }, h(Switch, { on: alerts.others, label: 'Also threads I start myself', onChange: (on) => save({ others: on }) })),
        alerts.others ? h(Row, { title: 'Only when the thread has run at least this many minutes', hint: 'So that quick answers you are waiting for at your desk stay quiet. 0 alerts every time.' },
          h(TextField, { value: String(alerts.othersMinutes ?? 2), label: 'Minutes', small: true, clean: (text) => String(Math.max(0, Math.floor(Number(text) || 0))), onCommit: (next) => save({ othersMinutes: Number(next) }) })) : null,

        h('div', { className: 'dsh-au-group' }, 'Where'),
        h(Row, { title: 'On this Mac', hint: alerts.macError ? `Last try failed: ${alerts.macError}` : 'A normal notification. The first time, macOS may ask whether "Script Editor" may show notifications: allow it.' }, h(Switch, { on: alerts.mac, label: 'On this Mac', onChange: (on) => save({ mac: on }) })),
        h(Row, { title: 'On my phone', hint: alerts.phone && (alerts.phoneProblem || alerts.phoneError) ? `Not working: ${alerts.phoneProblem || alerts.phoneError}` : alerts.phone ? 'Through the free ntfy app.' : 'Through the free ntfy app. Set it up below first.' }, h(Switch, { on: alerts.phone, label: 'On my phone', onChange: (on) => save({ phone: on }) })),
        h(Row, { title: 'Topic', hint: 'The name your phone listens to. Anyone who knows it can read your alerts, so it must be hard to guess.' },
          h('div', { className: 'dsh-au-btns' },
            alerts.ntfyTopic ? null : h('button', { type: 'button', className: 'dsh-au-btn', onClick: () => save({ ntfyTopic: madeUpTopic() }) }, 'Make one up'),
            h(TextField, { value: alerts.ntfyTopic ?? '', label: 'Topic', placeholder: 'No topic yet', onCommit: (next) => save({ ntfyTopic: next }) }))),
        h(Row, { title: 'Server', hint: 'Leave this as it is unless you run your own ntfy server.' },
          h(TextField, { value: alerts.ntfyServer ?? '', label: 'Server', placeholder: 'https://ntfy.sh', onCommit: (next) => save({ ntfyServer: next || 'https://ntfy.sh' }) })),
        h(Row, { title: 'Try it', hint: 'Sends one sample alert to every place that is switched on.' },
          h('button', { type: 'button', className: 'dsh-au-btn', disabled: busy, onClick: test }, busy ? 'Sending…' : 'Send a test alert')),

        h('div', { className: 'dsh-au-group' }, 'Set up your phone'),
        h('ol', { className: 'dsh-au-list' },
          h('li', null, 'Install the free app "ntfy" from the App Store or Google Play. It needs no account.'),
          h('li', null, 'Here, press "Make one up" next to Topic (or type your own long, odd name).'),
          h('li', null, 'In the app, tap +, type exactly the same topic, and subscribe.'),
          h('li', null, 'Here, switch on "On my phone" and press "Send a test alert". Your phone should show it within a few seconds.')),

        dshMerge.parts('alerts').map((part) => h(React.Fragment, { key: part.id },
          h('div', { className: 'dsh-au-group' }, typeof part.label === 'function' ? part.label() : String(part.label ?? part.id)),
          h(PartBoundary, null, part.render({ appCtx })))),

        h('div', { className: 'dsh-au-group' }, 'Everything'),
        h(Row, { title: 'Record runs and send alerts', hint: 'Off records no runs on the Automations page and sends no alerts.' }, h(Switch, { on: data.enabled !== false, label: 'Record runs and send alerts', onChange: (on) => save({ enabled: on }) })),

        h('div', { className: 'dsh-au-group' }, 'Automations'),
        // Item 4A fix round: with spaces there is no tab; the same switch (field `tab`) offers the Automations mode.
        spacesShown()
          ? h(Row, { title: askWords(pageLangOf()).row.title, hint: data.tabProblem || askWords(pageLangOf()).row.hint }, h(Switch, { on: data.settings?.tab !== false, label: askWords(pageLangOf()).row.title, onChange: (on) => saveOwn({ tab: on }) }))
          : h(Row, { title: 'The Automations mode', hint: data.tabProblem || 'A mode of its own, whose thread makes and changes automations and answers questions about their results.' }, h(Switch, { on: data.settings?.tab !== false, label: 'The Automations mode', onChange: (on) => saveOwn({ tab: on }) })),
        h(Row, { title: 'Keep deleted automations in the trash', hint: 'For 30 days, with Put back. Off: deleting an automation is final, as in the app.' }, h(Switch, { on: data.settings?.deletedToTrash !== false, label: 'Keep deleted automations in the trash', onChange: (on) => saveOwn({ deletedToTrash: on }) })),
        h(Row, { title: 'Old runs\' threads to the trash', hint: 'For an automation that opens a new thread at every run: runs older than its keep rule go to the trash. A shared thread is never touched.' }, h(Switch, { on: data.settings?.oldRunsToTrash !== false, label: 'Old runs\' threads to the trash', onChange: (on) => saveOwn({ oldRunsToTrash: on }) })),
        // Item 6: the clock button, where its new threads open, and Recon.
        h(ui.Row, { title: 'Clock button in the chat box', info: { what: 'A clock next to Send in every chat box: "Schedule this…" makes an automation from that thread.', change: 'Off hides the button. New on the Automations page and the assistant still make automations.' } },
          h(ui.Switch, { on: data.settings?.scheduleButton !== false, label: 'Clock button in the chat box', onChange: (on) => saveOwn({ scheduleButton: on }) })),
        // Round 2: "thread" and "mode" (spaces replace tabs); the same setting (runsInTheirTab).
        h(ui.Row, { title: ownModeWords(pageLangOf()).title, info: { what: ownModeWords(pageLangOf()).what, change: ownModeWords(pageLangOf()).change, lang: pageLangOf() } },
          h(ui.Switch, { on: data.settings?.runsInTheirTab !== false, label: ownModeWords(pageLangOf()).title, onChange: (on) => saveOwn({ runsInTheirTab: on }) })),
        h(ui.Row, { title: 'Scheduling from Recon', desc: data.settings?.scheduleFromRecon !== false ? 'On: an automation\'s name and instruction can be seen outside Recon.' : 'Off: no clock button and no schedule tools in Recon and in threads of your own sealed modes.', info: { what: 'Lets you schedule from Recon and from threads of your own sealed modes, with the clock button and with the assistant\'s schedule tools there (when Tool access gives them).', when: 'An automation\'s name and instruction can be seen outside Recon: in the Automations list, and by the assistant\'s schedule tools in other threads. Alerts and phone pushes say only "A Recon automation".', change: 'Off takes both away in Recon and in your own sealed modes. There an automation runs only in its own thread.' } },
          h(ui.Switch, { on: data.settings?.scheduleFromRecon !== false, label: 'Scheduling from Recon', danger: data.settings?.scheduleFromRecon !== false, onChange: (on) => saveOwn({ scheduleFromRecon: on }) })),

        h('div', { className: 'dsh-au-group' }, 'Good to know'),
        h('ul', { className: 'dsh-au-list' },
          h('li', null, 'Phone alerts travel through the ntfy service, which can read them. That is why they carry only a name and what happened.'),
          h('li', null, 'The free service allows 250 alerts a day. This add-on sends at most 10 a minute.'),
          h('li', null, 'Alerts are sent only while the app is running, and the phone alert needs the Mac to be online.'),
          h('li', null, 'You cannot answer from the phone yet. Open the app to approve or reply.'),
          h('li', null, 'The topic is saved with the app\'s other settings on this Mac, as plain text.')));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        // Plus is English only (decision 28): the page always asks the server for English, also when the app is in Chinese.
        pageLangOf = () => 'en';
        // The Alerts page shows the parts other add-ons offer it (Notify); with none it is as before.
        ctx.effect(() => dshMerge.host('alerts'));
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'alerts', order: 430, label: () => t('section.title') }, (props) => h(AlertsPage, { ...props, appCtx: ctx }))),
        );
        // A full page with its own sidebar row (the Cowork sidebar lists it under the Cowork tab).
        ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'automations' }, () => h(RunsPanel, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'automations-start', order: 44 }, () => h(TabStart, { appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'automations', order: 21, label: () => t('panel.title') }, RunsIcon)));
        // Item 6: "Schedule this…" next to Send in every chat box (before Plus Export 870, the gear 880, activity 890).
        ctx.effect(() => ctx.slots.inject('conversation.input.right', () => ctx.slots.register({ name: 'conversation.input.right', id: 'automations-schedule', order: 860 }, (props) => h(ScheduleButton, { appCtx: ctx, sessionId: props?.sessionId, useInput: props?.useInput, inputActions: props?.inputActions }))));
      },
    };
  },
});
