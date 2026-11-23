/**
 * Creator Plus, browser half: Settings → Creator Plus (the switch, the fixed rules, the result cards with
 * their buttons, what it learned, the settings, saved runs, the self-test) and the bar in the chat box of a
 * Creator Plus conversation (which plugins, what to do, Look only, Logs from, the run in one sentence).
 * The real setup changes only from this page's buttons, which only the user can press.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-creator-plus',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    /**
     * @returns {boolean} the Cowork sidebar shows another tab than this mode's (no sidebar: false, the server decides).
     * Item 4A, stage 6a: with spaces on, the window's space decides: the bar shows for any mode in the workshop space.
     */
    const otherTab = (mode, space = 'workshop') => {
      const root = typeof document?.documentElement?.getAttribute === 'function' ? document.documentElement : null;
      const inSpace = root ? root.getAttribute('data-cws-space') : null;
      if (inSpace) return inSpace !== space;
      const tab = root ? root.getAttribute('data-cws-tab') : null;
      return Boolean(tab) && tab !== mode;
    };
    const { useEffect, useLayoutEffect, useRef, useState } = React;
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

    const NS = 'creator-plus';
    const DICT = {
      en: { 'section.title': 'Creator Plus', 'offer.group': 'The mode', 'offer.title': 'Offer the Creator Plus mode', 'offer.desc': 'On adds the mode, the Workshop space and its tools. Off takes them away; its folder (backups, cards, what it learned) stays. New threads in the Workshop space start on the app\'s Creator preset, the only one with its two inspection tools; it does not work in PTC. To change the preset: Settings → Spaces → Workshop → Preset in this space.', 'offer.on': 'Switched on: the mode and the Workshop space appear in a few seconds.', 'offer.off': 'Switched off: the mode, the Workshop space (unless Tuner Plus keeps it), its tools and its saved runs are off (scheduled saved runs are paused; switch them on again on the Automations page). Switch it on to see the results, what it learned, the settings and the backups.' },
    };
    const when = (at) => (at ? new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

    const CSS = `
.dsh-cp-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-cp-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-cp-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-cp-desc[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-cp-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); }
.dsh-cp-row { display: flex; align-items: flex-start; gap: 16px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cp-rowtext { flex: 1; min-width: 0; }
.dsh-cp-rowtitle { font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-cp-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; white-space: pre-wrap; }
.dsh-cp-btns { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.dsh-cp-btn { flex: none; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 10px; cursor: pointer; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; white-space: nowrap; }
.dsh-cp-btn:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cp-btn:disabled { opacity: .5; cursor: default; }
.dsh-cp-input, .dsh-cp-area, .dsh-cp-select { box-sizing: border-box; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; font: inherit; font-size: 12px; color: var(--dsw-alias-label-primary); background: transparent; }
.dsh-cp-input { width: 100%; height: 30px; margin-top: 6px; padding: 0 10px; }
.dsh-cp-area { width: 100%; min-height: 60px; margin-top: 6px; padding: 6px 10px; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
.dsh-cp-select { height: 28px; }
.dsh-cp-switch { flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer; background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); }
.dsh-cp-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-cp-switch::after { content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease; }
.dsh-cp-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-cp-list { margin: 6px 0 0; padding-left: 18px; font-size: 12px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.dsh-cp-tag { display: inline-block; padding: 0 6px; margin-right: 6px; border-radius: 6px; font-size: 11px; line-height: 18px; font-weight: 600; color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 9%, transparent); }
.dsh-cp-ctl { display: inline-flex; align-items: center; gap: 5px; height: 28px; max-width: 240px; padding: 0 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 14px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font: inherit; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-cp-ctl:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-cp-pop { position: fixed; z-index: 1000; box-sizing: border-box; width: 420px; max-width: calc(100vw - 24px); padding: 14px 16px; border-radius: 16px; border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1, var(--dsw-alias-bg-base)); color: var(--dsw-alias-label-primary); font-size: 12px; line-height: 18px; box-shadow: 0 8px 28px rgba(0,0,0,.28); }
.dsh-cp-pop .title { font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-cp-plugins { max-height: 180px; overflow-y: auto; margin-top: 6px; padding: 4px 0; border-top: 0.5px solid var(--dsw-alias-border-l1); border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cp-plugins label { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
.dsh-cp-sentence { margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
`;

    async function call(body, session = '') {
      const response = await fetch(new URL(`dsh-creator-plus/data${session ? `?session=${encodeURIComponent(session)}` : ''}`, document.baseURI), {
        method: body ? 'POST' : 'GET', cache: 'no-store', credentials: 'same-origin',
        headers: body ? { accept: 'application/json', 'content-type': 'application/json' } : { accept: 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `error ${response.status}`);
      return data;
    }
    async function setEnabled(appCtx, on) {
      const result = await appCtx.remote.settings.describe();
      const row = result.ok ? result.value.namespaces.find((entry) => entry.ns === NS) : undefined;
      if (!row) throw new Error('Creator Plus is not running.');
      let done = await appCtx.remote.settings.mutate(NS, [{ op: 'set', path: ['enabled'], value: on }], row.revision);
      if (!done.ok && done.error.code === 'settings/conflict') {
        const again = await appCtx.remote.settings.describe();
        const fresh = again.ok ? again.value.namespaces.find((entry) => entry.ns === NS) : undefined;
        done = await appCtx.remote.settings.mutate(NS, [{ op: 'set', path: ['enabled'], value: on }], fresh?.revision);
      }
      if (!done.ok) throw new Error(done.error?.message ?? 'not saved');
    }

    /** The run in one sentence, as the page shows it before the run starts (the server says the same). */
    function sentenceOf(state, runs) {
      const run = runs.find((entry) => entry.id === state.run) ?? runs[0];
      if (!run) return '';
      const short = (name) => name.replace(/^@local\/dsh-/, '');
      const which = state.all ? 'every add-on' : state.selection.length === 0 ? 'a new add-on' : `${state.selection.slice(0, 4).map(short).join(', ')}${state.selection.length > 4 ? ` and ${state.selection.length - 4} more` : ''}`;
      const logs = run.logs ? ` from the logs of ${{ last: 'since the last run', 7: 'the last 7 days', 30: 'the last 30 days', all: 'everything' }[state.logsFrom] ?? 'the last 30 days'}` : '';
      const how = state.lookOnly ? ', looking only (nothing is prepared, not even in the trial copy)' : run.changes ? ', with changes prepared in the trial copy and nothing changed in your setup without your yes' : ', reporting only';
      return `${run.label}: ${which}${logs}${how}.`;
    }

    /** The bar: what to work on, and what to do (only in a Creator Plus conversation). */
    function CreatorBar({ sessionId, appCtx, strip = false }) {
      const [view, setView] = useState(null);
      const [open, setOpen] = useState(false);
      const [state, setState] = useState(null);
      const [note, setNote] = useState('');
      const [runName, setRunName] = useState('');
      const [place, setPlace] = useState({ left: 12, bottom: 80 });
      const button = useRef(null);
      const panel = useRef(null);
      useEffect(() => {
        let alive = true;
        // Another conversation: forget the last one's answer at once, so its bar never shows here while the
        // next answer is on its way (it lingered up to 20 s on other tabs).
        setView(null);
        setState(null);
        setOpen(false);
        const tick = async () => {
          let mine = false;
          try {
            const data = await call(undefined, sessionId);
            mine = data?.enabled === true && data?.session?.inCreator === true;
            if (alive) setView(data);
          } catch {
            /* tried again shortly */
          }
          // A conversation of another tab asks seldom: it only has to notice when it becomes a Creator Plus one.
          // The Creator Plus tab is open but the answer says otherwise: a new conversation whose mode the server has not
          // caught up with yet (a second or two). Ask again soon, so the options under the box come at once, not in 20 s.
          // Item 4A, stage 6a: the Workshop space counts too (any mode there gets the bar's answer).
          const catchingUp = !mine && (document.documentElement?.getAttribute?.('data-cws-tab') === 'creator-plus' || document.documentElement?.getAttribute?.('data-cws-space') === 'workshop');
          return mine ? 8000 : catchingUp ? 1500 : 20000;
        };
        // One look at a time; none while the window is hidden (it looks at once when shown again).
        const watcher = sessionId ? dshPoll.loop(tick, { every: 8000 }) : null;
        return () => { alive = false; watcher?.stop(); };
      }, [sessionId]);
      useEffect(() => {
        if (view?.session?.bar && !open) setState(view.session.bar);
      }, [view, open]);
      useLayoutEffect(() => {
        if (!open) return undefined;
        const rect = button.current?.getBoundingClientRect();
        if (rect) setPlace({ left: Math.max(12, Math.min(rect.left - 20, window.innerWidth - 432)), bottom: window.innerHeight - rect.top + 8 });
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
      if (!view || view.enabled !== true || !view.session?.inCreator || !state) return null;
      // With the Cowork sidebar the selected tab is the conversation's mode, known at once (the server's answer can be a
      // moment behind for a new conversation): another tab never shows this bar.
      if (otherTab('creator-plus')) return null;
      const runs = Array.isArray(view.runs) ? view.runs : [];
      const run = runs.find((entry) => entry.id === state.run) ?? runs[0];
      const plugins = view.map?.plugins ?? [];
      const save = async (next) => {
        setState(next);
        try {
          const data = await call({ action: 'bar', sessionId, state: next }, sessionId);
          setNote(data.note ?? '');
        } catch (problem) {
          setNote(problem.message);
        }
      };
      const start = async () => {
        try {
          const data = await call({ action: 'start', sessionId, state }, sessionId);
          await call({ action: 'bar', sessionId, state }, sessionId);
          const remote = appCtx.get('remote.session');
          if (!remote?.prompt) throw new Error('This version of the app cannot send the run from here: copy the sentence into the chat box and send it.');
          const sent = await remote.prompt({ requestId: globalThis.crypto?.randomUUID?.() ?? `creator-${Date.now()}`, sessionId, mode: 'queue', content: [{ type: 'text', text: `Run: ${data.note}` }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone });
          if (sent && sent.ok === false) throw new Error(sent.error?.message ?? 'not sent');
          setOpen(false);
        } catch (problem) {
          setNote(problem.message);
        }
      };
      const toggle = (name) => save({ ...state, all: false, selection: state.selection.includes(name) ? state.selection.filter((item) => item !== name) : [...state.selection, name] });
      const reconPicked = state.selection.some((name) => /dsh-recon$/.test(name));
      const window_ = open ? ReactDOM.createPortal(
          h('div', { ref: panel, className: 'dsh-cp-pop', role: 'dialog', 'aria-label': 'Creator Plus bar', style: { left: place.left, bottom: place.bottom, maxHeight: `calc(100vh - ${place.bottom + 12}px)`, overflowY: 'auto' } },
            h('style', null, CSS),
            h('div', { className: 'title' }, 'What to do'),
            h('select', { className: 'dsh-cp-select', value: state.run, 'aria-label': 'Kind of run', onChange: (event) => void save({ ...state, run: event.target.value }) }, runs.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.label))),
            h('div', { className: 'dsh-cp-desc' }, run?.does ?? ''),
            h('div', { className: 'title', style: { marginTop: 10 } }, 'Which add-ons'),
            h('label', { style: { display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 } },
              h('input', { type: 'checkbox', checked: state.all === true, onChange: (event) => void save({ ...state, all: event.target.checked, selection: event.target.checked ? plugins.map((plugin) => plugin.name) : [] }) }), 'All (on purpose)'),
            h('div', { className: 'dsh-cp-plugins' }, plugins.map((plugin) => h('label', { key: plugin.name, title: plugin.locked ? 'Locked: read, explained and checked, never edited' : '' },
              h('input', { type: 'checkbox', checked: state.selection.includes(plugin.name), onChange: () => void toggle(plugin.name) }),
              h('span', null, `${plugin.locked ? '🔒 ' : ''}${plugin.name.replace(/^@local\//, '').replace(/^@deepseek-ai\//, '')}${plugin.enabled ? '' : ' (off)'}`)))),
            reconPicked ? h('div', { className: 'dsh-cp-desc' }, 'Recon: Creator Plus reads only which step failed and why, without the thread\'s text. Reading the text needs your yes first, names the model that would read it, and is done by a reader with no tools.') : null,
            h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 } },
              h('button', { type: 'button', role: 'switch', className: 'dsh-cp-switch', 'aria-checked': state.lookOnly === true, 'aria-label': 'Look only', onClick: () => void save({ ...state, lookOnly: !state.lookOnly }) }), 'Look only: read and report; prepare no change, not even in the trial copy'),
            run?.logs ? h('label', { style: { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 } }, 'Logs from',
              h('select', { className: 'dsh-cp-select', value: state.logsFrom, onChange: (event) => void save({ ...state, logsFrom: event.target.value }) },
                [['last', 'since the last run'], ['7', 'the last 7 days'], ['30', 'the last 30 days'], ['all', 'everything']].map(([id, label]) => h('option', { key: id, value: id }, label)))) : null,
            h('div', { className: 'dsh-cp-sentence' }, sentenceOf(state, runs)),
            h('div', { className: 'dsh-cp-btns' },
              h('button', { type: 'button', className: 'dsh-cp-btn', onClick: () => void start() }, 'Start this run'),
              h('input', { className: 'dsh-cp-input', style: { width: 150, marginTop: 0 }, placeholder: 'Name to save it', value: runName, onChange: (event) => setRunName(event.target.value) }),
              h('button', { type: 'button', className: 'dsh-cp-btn', disabled: !runName.trim(), onClick: async () => { try { const data = await call({ action: 'saveRun', name: runName, state }, sessionId); setNote(data.note ?? ''); setRunName(''); } catch (problem) { setNote(problem.message); } } }, 'Save run')),
            (view.savedRuns ?? []).length ? h('div', { className: 'dsh-cp-desc', style: { marginTop: 8 } }, 'Saved runs: ', (view.savedRuns ?? []).map((saved) => h('button', { key: saved.name, type: 'button', className: 'dsh-cp-btn', style: { marginRight: 4 }, onClick: () => void save({ ...state, ...saved.state }) }, saved.name))) : null,
            note ? h('div', { className: 'dsh-cp-desc', role: 'status' }, note) : null),
          document.body) : null;
      if (strip) {
        // Under the chat box, in the one options area every mode shares (the owner's rule of 18 November 2026): on the
        // start page and in a started conversation, with the same field, drop-down and chip look as Scout and Finance.
        // The same choices as before; "Start or save…" opens the same window as the bar in the chat box.
        const Area = window.__dshOptionsArea;
        if (!Area) return null;
        const short = (name) => name.replace(/^@local\//, '').replace(/^@deepseek-ai\//, '');
        const others = plugins.filter((plugin) => !state.selection.includes(plugin.name));
        return h(Area, { mode: 'creator-plus', place: strip === 'start' ? 'start' : 'chat', label: 'What Creator Plus does in this thread' },
          h('style', null, CSS),
          h('select', { className: 'dsh-opt-pick', value: state.run, 'aria-label': 'What to do', title: run?.does ?? 'What to do', onChange: (event) => void save({ ...state, run: event.target.value }) }, runs.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.label))),
          state.all === true
            ? h('span', { className: 'dsh-opt-chip' }, 'All add-ons', h('button', { type: 'button', 'aria-label': 'Remove all add-ons', title: 'Remove all add-ons', onClick: () => void save({ ...state, all: false, selection: [] }) }, '×'))
            : state.selection.map((name) => h('span', { key: name, className: 'dsh-opt-chip' }, short(name), h('button', { type: 'button', 'aria-label': `Remove ${short(name)}`, title: `Remove ${short(name)}`, onClick: () => void toggle(name) }, '×'))),
          state.all === true ? null : h('select', { className: 'dsh-opt-pick', 'aria-label': 'Add an add-on', value: '', onChange: (event) => { const picked = event.target.value; if (picked === '*all') void save({ ...state, all: true, selection: plugins.map((plugin) => plugin.name) }); else if (picked) void toggle(picked); } },
            h('option', { value: '' }, '+ Add-on'),
            h('option', { value: '*all' }, 'All add-ons (on purpose)'),
            others.map((plugin) => h('option', { key: plugin.name, value: plugin.name }, `${plugin.locked ? '🔒 ' : ''}${short(plugin.name)}${plugin.enabled ? '' : ' (off)'}`))),
          h('button', { type: 'button', className: 'dsh-opt-pick', 'aria-pressed': state.lookOnly === true, title: 'Look only: read and report; prepare no change, not even in the trial copy', onClick: () => void save({ ...state, lookOnly: !state.lookOnly }) }, 'Look only'),
          run?.logs ? h('select', { className: 'dsh-opt-pick', 'aria-label': 'Logs from', title: 'Logs from', value: state.logsFrom, onChange: (event) => void save({ ...state, logsFrom: event.target.value }) },
            [['last', 'Logs since the last run'], ['7', 'Logs of 7 days'], ['30', 'Logs of 30 days'], ['all', 'All logs']].map(([id, label]) => h('option', { key: id, value: id }, label))) : null,
          h('button', { ref: button, type: 'button', className: 'dsh-opt-pick', 'aria-haspopup': 'dialog', 'aria-expanded': open, onClick: () => setOpen(!open) }, 'Start or save…'),
          h('div', { className: 'dsh-opt-hint' }, note || sentenceOf(state, runs)),
          window_);
      }
      return h(React.Fragment, null,
        h('style', null, CSS),
        h('button', { ref: button, type: 'button', className: 'dsh-cp-ctl', 'aria-haspopup': 'dialog', 'aria-expanded': open, title: sentenceOf(state, runs), onClick: () => setOpen(!open) }, `Creator Plus · ${run?.label ?? ''}`),
        window_);
    }

    /** One result card with its buttons. */
    const PRE = { margin: '6px 0 0', padding: '8px 10px', maxHeight: 360, overflow: 'auto', whiteSpace: 'pre-wrap', borderRadius: 8, fontSize: 11, background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)' };
    /** The code behind a card, in full: a ready plugin's files, or a change line by line and its new files as Apply writes them. */
    function CodeView({ code }) {
      if (code.kind === 'change') {
        return h('div', null,
          code.cut ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, 'Too long to show in full: it cannot be applied from here.') : null,
          h('div', { className: 'dsh-cp-rowdesc' }, 'The change, line by line (- taken out, + put in):'),
          h('pre', { style: PRE }, code.diff),
          (code.files ?? []).map((file) => h('details', { key: file.path, className: 'dsh-cp-rowdesc' }, h('summary', { style: { cursor: 'pointer' } }, `${file.path}, as Apply writes it`), h('pre', { style: PRE }, file.text))));
      }
      return h('div', null,
        (code.binary ?? []).length ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, `Files that cannot be shown (so it is not installed from here): ${code.binary.join(', ')}`) : null,
        (code.modules ?? []).length ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, `Modules that are not Creator Plus's own (so it is not installed from here): ${code.modules.slice(0, 10).join(', ')}`) : null,
        code.tooLong ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, 'Too much code to show in full: it is not installed from here.') : null,
        h('div', { className: 'dsh-cp-rowdesc' }, `${(code.files ?? []).length} files; its modules are Creator Plus's own.`),
        (code.files ?? []).map((file) => h('details', { key: file.path, className: 'dsh-cp-rowdesc' }, h('summary', { style: { cursor: 'pointer' } }, file.path), h('pre', { style: PRE }, file.text))));
    }

    function Card({ card, busy, act }) {
      const canTry = card.kind === 'change' || card.kind === 'new-plugin';
      const [code, setCode] = useState(null);
      const [problem, setProblem] = useState('');
      const show = async () => {
        if (code) return setCode(null);
        try {
          setCode((await call({ action: 'code', id: card.id })).code);
          setProblem('');
        } catch (error) {
          setProblem(error.message);
        }
        return undefined;
      };
      return h('div', { className: 'dsh-cp-row' },
        h('div', { className: 'dsh-cp-rowtext' },
          h('div', { className: 'dsh-cp-rowtitle' }, h('span', { className: 'dsh-cp-tag' }, card.status), card.title),
          h('div', { className: 'dsh-cp-rowdesc' }, card.text),
          canTry ? h('button', { type: 'button', className: 'dsh-cp-btn', style: { marginTop: 6 }, onClick: () => void show() }, code ? 'Hide' : card.kind === 'change' ? 'Show the change' : 'Show the code') : null,
          problem ? h('div', { className: 'dsh-cp-rowdesc', 'data-error': 'true' }, problem) : null,
          code ? h(CodeView, { code }) : null,
          h('div', { className: 'dsh-cp-rowdesc' }, when(card.at)),
          h('div', { className: 'dsh-cp-btns' },
            canTry && card.status !== 'applied' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'try') }, 'Try it in the trial copy') : null,
            canTry && card.status !== 'applied' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'apply') }, 'Apply to my setup') : null,
            card.status === 'applied' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'undo') }, card.kind === 'new-plugin' ? 'Remove' : 'Undo') : null,
            card.status === 'open' || card.status === 'tried' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'later') }, 'Not now') : null,
            card.status !== 'never' && card.status !== 'applied' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => act(card, 'never') }, 'Do not suggest this again') : null)));
    }

    function CreatorPage({ appCtx }) {
      const tw = appCtx.locale.bind(NS);
      const [data, setData] = useState(null);
      const [busy, setBusy] = useState(false);
      const [note, setNote] = useState({ text: '', error: false });
      const [draft, setDraft] = useState(null);
      const alive = useRef(true);
      const load = async () => {
        try {
          const next = await call();
          if (alive.current) setData(next);
        } catch (problem) {
          if (alive.current) setNote({ text: `Could not load: ${problem.message}`, details: problem.details ?? '', error: true });
        }
      };
      useEffect(() => {
        alive.current = true;
        void load();
        const timer = setInterval(() => { if (!document.hidden) void load(); }, 8000);
        return () => { alive.current = false; clearInterval(timer); };
      }, []);
      useEffect(() => {
        if (data && data.enabled === true && draft === null) setDraft({ strongModels: data.strongModels, plusFolder: data.plusFolder });
      }, [data, draft]);
      if (!data) return h('div', { className: 'dsh-cp-page' }, h('style', null, CSS), h('h2', { className: 'dsh-cp-title' }, 'Creator Plus'), h('p', { className: 'dsh-cp-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      const run = async (work, done) => {
        setBusy(true);
        try {
          const answer = await work();
          if (alive.current) setNote({ text: answer?.note || done || '', error: false });
          await load();
        } catch (problem) {
          if (alive.current) setNote({ text: problem.message, details: problem.details ?? '', error: true });
        } finally {
          if (alive.current) setBusy(false);
        }
      };
      const act = (card, what) => run(() => call({ action: 'card', id: card.id, act: what }), what === 'apply' ? 'Applied.' : what === 'try' ? 'Tried in the trial copy.' : 'Done.');
      const openCards = (data.cards ?? []).filter((card) => card.status !== 'never' && card.status !== 'undone');
      // The top of the page: its title, its words, the switch.
      const top = [
        h('style', null, CSS),
        h('h2', { className: 'dsh-cp-title' }, 'Creator Plus'),
        h('p', { className: 'dsh-cp-desc' }, 'A mode, run in the Workshop space, that builds and improves add-ons so they fit everything you have, tries every change in a trial copy first, and keeps your add-ons working after updates. It never changes your real setup by itself: the buttons on this page do, and only you press them.'),
        note.text ? h(PlainNote, { text: note.text, details: note.details, kind: note.error ? 'error' : 'info' }) : null,
        data.problem ? h('p', { className: 'dsh-cp-desc', 'data-error': 'true' }, data.problem) : null,

        h('div', { className: 'dsh-cp-group' }, 'The mode'),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' }, h('div', { className: 'dsh-cp-rowtitle' }, tw('offer.title')), h('div', { className: 'dsh-cp-rowdesc' }, tw('offer.desc'))),
          h('button', { type: 'button', role: 'switch', className: 'dsh-cp-switch', 'aria-checked': data.enabled === true, 'aria-label': tw('offer.title'), disabled: busy, onClick: () => void run(() => setEnabled(appCtx, data.enabled !== true), data.enabled ? 'Switched off.' : tw('offer.on')) })),
      ];
      // Switched off, the page shows the switch alone (the server gives nothing else).
      if (data.enabled !== true) return h('div', { className: 'dsh-cp-page' }, ...top, h('p', { className: 'dsh-cp-desc' }, tw('offer.off')));
      return h('div', { className: 'dsh-cp-page' },
        ...top,

        h('div', { className: 'dsh-cp-group' }, 'Rules that never bend'),
        h('ul', { className: 'dsh-cp-list' }, (data.rules ?? []).map((rule) => h('li', { key: rule.id }, h('b', null, rule.text), ` ${rule.enforced}`))),

        h('div', { className: 'dsh-cp-group' }, `Results (${openCards.length})`),
        openCards.length === 0 ? h('p', { className: 'dsh-cp-desc' }, 'Nothing yet. Findings, prepared changes, questions and ready add-ons from Creator Plus threads appear here.') : null,
        openCards.slice(0, 60).map((card) => h(Card, { key: card.id, card, busy, act })),

        h('div', { className: 'dsh-cp-group' }, 'What Creator Plus learned'),
        (data.learning ?? []).length === 0 ? h('p', { className: 'dsh-cp-desc' }, 'Nothing yet. It proposes your usual answers, how things are built here and mistakes not to repeat; each is kept only when you press Keep, and can be undone.') : null,
        (data.learning ?? []).filter((item) => item.status !== 'undone').slice(0, 40).map((item) => h('div', { key: item.id, className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' },
            h('div', { className: 'dsh-cp-rowtitle' }, h('span', { className: 'dsh-cp-tag' }, `${item.kind} · ${item.status}`), item.text),
            h('div', { className: 'dsh-cp-rowdesc' }, `Why: ${item.reason} · ${when(item.at)}${item.thirdParty ? ' · from a third-party add-on' : ''}`),
            h('div', { className: 'dsh-cp-btns' },
              item.thirdParty && !item.read ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'learn', id: item.id, act: 'read' })) }, 'I read it') : null,
              item.status === 'proposed' ? h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'learn', id: item.id, act: 'keep' }), 'Kept.') }, 'Keep') : null,
              h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'learn', id: item.id, act: 'undo' }), 'Undone.') }, 'Undo'))))),

        h('div', { className: 'dsh-cp-group' }, 'Settings'),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' },
            h('div', { className: 'dsh-cp-rowtitle' }, 'Who may read your thread logs'),
            h('div', { className: 'dsh-cp-rowdesc' }, 'To improve your add-ons, Creator Plus reads what went wrong in past threads (masked; Recon only as which step failed). Choose which models may read them.')),
          h('select', { className: 'dsh-cp-select', value: data.logReaders, disabled: busy, onChange: (event) => void run(() => call({ action: 'settings', logReaders: event.target.value }), 'Saved.') }, (data.logReaderChoices ?? []).map((choice) => h('option', { key: choice.id, value: choice.id }, choice.label)))),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' },
            h('div', { className: 'dsh-cp-rowtitle' }, 'Strong models'),
            h('div', { className: 'dsh-cp-rowdesc' }, 'Models you trust to improve on a recipe\'s default steps (they still follow every "must" step and pass every check). One per line, as provider/model.'),
            h('textarea', { className: 'dsh-cp-area', value: draft?.strongModels ?? '', placeholder: '<provider>/<model>', onChange: (event) => setDraft({ ...draft, strongModels: event.target.value }) })),
          h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy || draft?.strongModels === data.strongModels, onClick: () => void run(() => call({ action: 'settings', strongModels: draft.strongModels }), 'Saved.') }, 'Save')),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' },
            h('div', { className: 'dsh-cp-rowtitle' }, 'Plus folder with its tests'),
            h('div', { className: 'dsh-cp-rowdesc' }, 'An installed copy carries no tests. Give the full path of a Plus folder (the download or a copy of the project) and Creator Plus runs each add-on\'s tests after an update and with a change. Empty: tests are not run.'),
            h('input', { className: 'dsh-cp-input', value: draft?.plusFolder ?? '', placeholder: '/Users/you/…/deepseek-harness-plus', onChange: (event) => setDraft({ ...draft, plusFolder: event.target.value }) })),
          h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy || draft?.plusFolder === data.plusFolder, onClick: () => void run(() => call({ action: 'settings', plusFolder: draft.plusFolder }), 'Saved.') }, 'Save')),

        h('div', { className: 'dsh-cp-group' }, 'Saved runs'),
        (data.savedRuns ?? []).length === 0 ? h('p', { className: 'dsh-cp-desc' }, 'None yet. Save a run from the bar in a Creator Plus thread; saved runs are also offered on the Automations page, to run on a schedule (a scheduled run changes nothing without your yes).') : null,
        (data.savedRuns ?? []).map((saved) => h('div', { key: saved.name, className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' }, h('div', { className: 'dsh-cp-rowtitle' }, saved.name), h('div', { className: 'dsh-cp-rowdesc' }, saved.sentence)),
          h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'deleteRun', name: saved.name }), 'Deleted.') }, 'Delete'))),

        h('div', { className: 'dsh-cp-group' }, 'Self-test'),
        h('div', { className: 'dsh-cp-row' },
          h('div', { className: 'dsh-cp-rowtext' }, h('div', { className: 'dsh-cp-rowtitle' }, 'The eight tests'), h('div', { className: 'dsh-cp-rowdesc' }, 'Runs the parts code can check by itself in a throwaway folder: Collision, Change, Update, Mission, Scope and part of Improve. Rebuild, Look and the rest of Improve need a model: in a Creator Plus thread, ask it to run its self-test (creator_selftest) on the model you want scored.')),
          h('button', { type: 'button', className: 'dsh-cp-btn', disabled: busy, onClick: () => void run(() => call({ action: 'selftest' })) }, 'Run')),

        h('div', { className: 'dsh-cp-group' }, `Backups (${(data.backups ?? []).length})`),
        h('p', { className: 'dsh-cp-desc' }, (data.backups ?? []).length ? `Every change and install keeps the version before it. Newest: ${(data.backups ?? []).slice(0, 5).join(', ')}. Undo on a card puts one back.` : 'None yet. Every change and install keeps the version before it here.'));
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const t = ctx.locale.bind(NS);
        ctx.effect(() => ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'creator-plus', order: 117, label: () => t('section.title') }, (props) => h(CreatorPage, { ...props, appCtx: ctx }))));
        ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: 'creator-plus-bar', order: -16, label: () => 'Creator Plus' }, (props) => h(CreatorBar, { sessionId: props?.sessionId, appCtx: ctx }))));
        // The same choices under the chat box, in the one options area every mode shares (Cowork sidebar): on the start
        // page (beside Scout's and Finance's fields) and in a started conversation. The box's row stays the same in every mode.
        ctx.effect(() => ctx.slots.inject('conversation.hero.options', () => ctx.slots.register({ name: 'conversation.hero.options', id: 'creator-plus-options', order: 45 }, (props) => h(CreatorBar, { sessionId: props?.sessionId, appCtx: ctx, strip: 'start' }))));
        ctx.effect(() => ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'creator-plus-strip', order: -40 }, (props) => h(CreatorBar, { sessionId: props?.sessionId, appCtx: ctx, strip: 'chat' }))));
      },
    };
  },
});
