// Colour schemes: the browser half. A scheme is a set of colour overrides laid over the app's own
// light or dark palette through the theme service (`theme.overrideTokens`). "Stock" adds nothing,
// so the app looks exactly as shipped. The choice lives in this add-on's settings (Settings > Colours).
window.__ModuleLoader__.load({
  id: '@local/dsh-color-schemes',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useState, useSyncExternalStore } = React;
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

    const NS = 'colorSchemes';
    const SETTINGS_NS = 'color-schemes';
    const SOURCE = 'dsh-color-schemes';
    const LOCAL_KEY = 'dsh-color-schemes.choice';

    const DICT = {
      en: {
        'section.title': 'Colours',
        'head.hint': 'Colours for the whole app. Each scheme has a light and a dark version and follows Settings → General → Appearance. Stock is DeepSeek Harness as shipped.',
        'in.use': 'In use',
        'use': 'Use',
        'light': 'Light',
        'dark': 'Dark',
        'mac.opaque': 'Solid left panel on the Mac',
        'mac.opaque.hint': 'On the Mac desktop app, paint the left panel in the scheme\'s colour instead of see-through. Stock keeps the app\'s own look.',
        'custom.title': 'Custom scheme',
        'custom.hint': 'For advanced use: JSON with "label", "dark" and "light" maps of colour names (for example "--dsw-alias-bg-base") to colours. Names you leave out keep the app\'s value.',
        'custom.save': 'Save custom scheme',
        'custom.bad': 'Not valid: {message}',
        'custom.saved': 'Saved.',
        'failed': 'Could not save: {message}',
        'loading': 'Loading…',
        'unavailable': 'The settings for colour schemes could not be read.',
        'scheme.stock': 'DeepSeek Harness',
        'scheme.stock.d': 'The app\'s own colours, exactly as shipped.',
        'scheme.harbor': 'Harbor',
        'scheme.harbor.d': 'Deep navy with teal accents.',
        'scheme.graphite': 'Graphite',
        'scheme.graphite.d': 'Neutral greys with amber accents.',
        'scheme.forest': 'Forest',
        'scheme.forest.d': 'Deep green with mint accents.',
        'scheme.custom': 'Custom',
        'scheme.custom.d': 'Your own colours (below).',
      },
    };

    /** The app's own values (DeepSeek Harness 0.2.2-rc.1) for every colour a built-in scheme changes. */
    const S = (n) => `var(--dsw-static-neutral-bluish-${n})`;
    const STOCK = {
      '--dsw-alias-bg-base': [S('00'), S('950')],
      '--dsw-specific-sidebar-fill': [S('50'), S('900')],
      '--dsw-alias-bg-layer-1': [S('00'), S('875')],
      '--dsw-alias-bg-layer-2': [S('00'), S('850')],
      '--dsw-alias-bg-layer-3': [S('00'), S('800')],
      '--dsw-alias-bg-overlay': [S('150'), S('700')],
      '--dsw-alias-bg-module-platform': [S('60'), S('800')],
      '--dsw-specific-input-major': [S('00'), S('850')],
      '--dsw-alias-markdown-code-block': [S('50'), S('900')],
      '--dsw-alias-border-l1': ['#0000000a', '#ffffff0f'],
      '--dsw-alias-border-l2': ['#0000001a', '#ffffff1f'],
      '--dsw-alias-border-l3': ['#0000001f', '#ffffff29'],
      '--dsw-alias-border-l4': ['#00000029', '#fff3'],
      '--dsw-alias-label-primary': [S('1000'), S('50')],
      '--dsw-alias-label-secondary': [S('700'), S('300')],
      '--dsw-alias-label-primary-inverted': [S('00'), S('800')],
      '--dsw-alias-button-elevated-fill': [S('00'), S('750')],
      '--dsw-alias-button-floating-fill': [S('00'), S('850')],
      '--dsw-alias-button-floating-hover': [S('75'), S('800')],
      '--dsw-alias-button-primary-dimmed': [S('100'), S('750')],
      '--dsw-alias-button-ghost-active-fill': [S('100'), S('750')],
      '--dsw-alias-interactive-bg-hover': ['#2631480f', '#ffffff14'],
      '--dsw-alias-interactive-bg-active': ['#2631481a', '#ffffff24'],
      '--dsw-alias-interactive-bg-hover-solid': [S('75'), S('800')],
      '--dsw-alias-state-business-primary': ['var(--dsw-static-deepseek-500)', 'var(--dsw-static-deepseek-400)'],
      '--dsw-alias-state-business-tertiary': ['var(--dsw-static-deepseek-100)', 'var(--dsw-static-deepseek-800)'],
      '--dsw-alias-brand-primary': [S('1000'), S('50')],
      '--dsw-alias-button-primary-hover': [S('750'), S('100')],
      '--dsw-alias-button-info-fill': ['var(--dsw-static-deepseek-500)', 'var(--dsw-static-deepseek-400)'],
      '--dsw-alias-tooltip-bg': [S('850'), S('750')],
      '--dsw-alias-toast-bg': [S('800'), S('750')],
      '--dsw-menu-surface-fill': ['#fcfdfeb3', '#303136a3'],
      '--dsw-specific-bubble': ['var(--dsw-static-deepseek-50)', S('850')],
      '--dsw-specific-bubble-highlight': ['var(--dsw-static-deepseek-200)', S('750')],
      '--dsw-specific-selector': [S('60'), S('800')],
      '--dsw-specific-sidebar-nav-item-active': [S('100'), S('750')],
      '--dsw-specific-sidebar-nav-item-active-accent': ['var(--dsw-static-deepseek-100)', S('800')],
      '--dsw-specific-tip': [S('60'), S('800')],
      '--dsw-specific-login-input': [S('50'), S('900')],
    };

    /**
     * Built-in schemes. Each lists only what it changes; everything else keeps the app's value.
     * Harbor is deep navy with teal accents.
     */
    /** Id this scheme was saved under in earlier versions; old saved choices still resolve to it. */
    const LEGACY_IDS = { mindshub: 'harbor' };
    const canonicalId = (id) => LEGACY_IDS[id] ?? id;

    const SCHEMES = [
      { id: 'stock', light: {}, dark: {} },
      {
        id: 'harbor',
        dark: {
          '--dsw-alias-bg-base': '#091425',
          '--dsw-specific-sidebar-fill': '#0e1b2e',
          '--dsw-alias-bg-layer-1': '#0d1828',
          '--dsw-alias-bg-layer-2': '#111e32',
          '--dsw-alias-bg-layer-3': '#16243b',
          '--dsw-alias-bg-overlay': '#1a2a45',
          '--dsw-alias-bg-module-platform': '#16243b',
          '--dsw-specific-input-major': '#0d1828',
          '--dsw-alias-markdown-code-block': '#0e1b2e',
          '--dsw-alias-border-l1': '#9fc3ff12',
          '--dsw-alias-border-l2': '#9fc3ff1f',
          '--dsw-alias-border-l3': '#9fc3ff2b',
          '--dsw-alias-border-l4': '#9fc3ff3d',
          '--dsw-alias-label-primary': '#e6eef8',
          '--dsw-alias-label-secondary': '#909daf',
          '--dsw-alias-label-primary-inverted': '#091425',
          '--dsw-alias-button-elevated-fill': '#1a263f',
          '--dsw-alias-button-floating-fill': '#0d1828',
          '--dsw-alias-button-floating-hover': '#16243b',
          '--dsw-alias-button-primary-dimmed': '#16243b',
          '--dsw-alias-button-ghost-active-fill': '#16243b',
          '--dsw-alias-interactive-bg-hover': '#9fc3ff12',
          '--dsw-alias-interactive-bg-active': '#9fc3ff1f',
          '--dsw-alias-interactive-bg-hover-solid': '#16243b',
          '--dsw-alias-state-business-primary': '#5cc1da',
          '--dsw-alias-state-business-tertiary': '#112e42',
          '--dsw-alias-brand-primary': '#5cc1da',
          '--dsw-alias-button-primary-hover': '#7fd0e4',
          '--dsw-alias-button-info-fill': '#5cc1da',
          '--dsw-alias-tooltip-bg': '#1a2a45',
          '--dsw-alias-toast-bg': '#1a2a45',
          '--dsw-menu-surface-fill': '#13203af2',
          '--dsw-specific-bubble': '#16243b',
          '--dsw-specific-bubble-highlight': '#1e3150',
          '--dsw-specific-selector': '#16243b',
          '--dsw-specific-sidebar-nav-item-active': '#1a263f',
          '--dsw-specific-sidebar-nav-item-active-accent': '#112e42',
          '--dsw-specific-tip': '#16243b',
          '--dsw-specific-login-input': '#0e1b2e',
          '--dsh-cs-dot': '#9fc3ff2e',
        },
        light: {
          '--dsw-alias-bg-base': '#f7fafc',
          '--dsw-specific-sidebar-fill': '#eef3f8',
          '--dsw-alias-bg-overlay': '#e3eaf2',
          '--dsw-alias-label-primary': '#0f1d30',
          '--dsw-alias-label-secondary': '#4e5d73',
          '--dsw-alias-state-business-primary': '#0e8ca6',
          '--dsw-alias-state-business-tertiary': '#d9f1f6',
          '--dsw-alias-brand-primary': '#0e7f96',
          '--dsw-alias-button-primary-hover': '#0b6d81',
          '--dsw-alias-button-info-fill': '#0e8ca6',
          '--dsw-alias-interactive-bg-hover': '#0e3a5a0f',
          '--dsw-alias-interactive-bg-active': '#0e3a5a1a',
          '--dsw-specific-bubble': '#e3f1f6',
          '--dsw-specific-bubble-highlight': '#c9e7f0',
          '--dsw-specific-sidebar-nav-item-active-accent': '#d9f1f6',
          '--dsh-cs-dot': '#0e3a5a29',
        },
        pattern: 'dots',
        swatch: ['#091425', '#0e1b2e', '#111e32', '#5cc1da', '#e6eef8'],
        swatchLight: ['#f7fafc', '#eef3f8', '#ffffff', '#0e8ca6', '#0f1d30'],
      },
      {
        id: 'graphite',
        dark: {
          '--dsw-alias-bg-base': '#141414',
          '--dsw-specific-sidebar-fill': '#1b1b1b',
          '--dsw-alias-bg-layer-1': '#1d1d1d',
          '--dsw-alias-bg-layer-2': '#222222',
          '--dsw-alias-bg-layer-3': '#2a2a2a',
          '--dsw-alias-bg-overlay': '#303030',
          '--dsw-alias-bg-module-platform': '#2a2a2a',
          '--dsw-specific-input-major': '#1d1d1d',
          '--dsw-alias-markdown-code-block': '#1b1b1b',
          '--dsw-alias-label-primary': '#ececec',
          '--dsw-alias-label-secondary': '#a3a3a3',
          '--dsw-alias-label-primary-inverted': '#141414',
          '--dsw-alias-button-elevated-fill': '#2e2e2e',
          '--dsw-alias-button-floating-fill': '#1d1d1d',
          '--dsw-alias-button-floating-hover': '#2a2a2a',
          '--dsw-alias-interactive-bg-hover-solid': '#2a2a2a',
          '--dsw-alias-state-business-primary': '#f2a93b',
          '--dsw-alias-state-business-tertiary': '#3a2c14',
          '--dsw-alias-brand-primary': '#f2a93b',
          '--dsw-alias-button-primary-hover': '#f5bc66',
          '--dsw-alias-button-info-fill': '#f2a93b',
          '--dsw-menu-surface-fill': '#262626f2',
          '--dsw-specific-bubble': '#262626',
          '--dsw-specific-bubble-highlight': '#333333',
          '--dsw-specific-selector': '#2a2a2a',
          '--dsw-specific-sidebar-nav-item-active': '#2e2e2e',
          '--dsw-specific-sidebar-nav-item-active-accent': '#3a2c14',
          '--dsw-specific-tip': '#2a2a2a',
          '--dsw-specific-login-input': '#1b1b1b',
        },
        light: {
          '--dsw-alias-bg-base': '#fafafa',
          '--dsw-specific-sidebar-fill': '#f1f1f1',
          '--dsw-alias-label-primary': '#1a1a1a',
          '--dsw-alias-label-secondary': '#5c5c5c',
          '--dsw-alias-state-business-primary': '#b86e00',
          '--dsw-alias-state-business-tertiary': '#fbeed8',
          '--dsw-alias-brand-primary': '#a86400',
          '--dsw-alias-button-primary-hover': '#8c5300',
          '--dsw-alias-button-info-fill': '#b86e00',
          '--dsw-specific-bubble': '#f3ede3',
          '--dsw-specific-bubble-highlight': '#ead9bd',
          '--dsw-specific-sidebar-nav-item-active-accent': '#fbeed8',
        },
        swatch: ['#141414', '#1b1b1b', '#222222', '#f2a93b', '#ececec'],
        swatchLight: ['#fafafa', '#f1f1f1', '#ffffff', '#b86e00', '#1a1a1a'],
      },
      {
        id: 'forest',
        dark: {
          '--dsw-alias-bg-base': '#0d1512',
          '--dsw-specific-sidebar-fill': '#121d18',
          '--dsw-alias-bg-layer-1': '#131f1a',
          '--dsw-alias-bg-layer-2': '#182620',
          '--dsw-alias-bg-layer-3': '#1e3028',
          '--dsw-alias-bg-overlay': '#24382e',
          '--dsw-alias-bg-module-platform': '#1e3028',
          '--dsw-specific-input-major': '#131f1a',
          '--dsw-alias-markdown-code-block': '#121d18',
          '--dsw-alias-border-l1': '#b4ffd412',
          '--dsw-alias-border-l2': '#b4ffd41f',
          '--dsw-alias-border-l3': '#b4ffd42b',
          '--dsw-alias-border-l4': '#b4ffd43d',
          '--dsw-alias-label-primary': '#e5efe9',
          '--dsw-alias-label-secondary': '#93a89c',
          '--dsw-alias-label-primary-inverted': '#0d1512',
          '--dsw-alias-button-elevated-fill': '#22362c',
          '--dsw-alias-button-floating-fill': '#131f1a',
          '--dsw-alias-button-floating-hover': '#1e3028',
          '--dsw-alias-interactive-bg-hover': '#b4ffd412',
          '--dsw-alias-interactive-bg-active': '#b4ffd41f',
          '--dsw-alias-interactive-bg-hover-solid': '#1e3028',
          '--dsw-alias-state-business-primary': '#6fcf97',
          '--dsw-alias-state-business-tertiary': '#183626',
          '--dsw-alias-brand-primary': '#6fcf97',
          '--dsw-alias-button-primary-hover': '#8fdbae',
          '--dsw-alias-button-info-fill': '#6fcf97',
          '--dsw-menu-surface-fill': '#18261ff2',
          '--dsw-specific-bubble': '#1c2c24',
          '--dsw-specific-bubble-highlight': '#24382e',
          '--dsw-specific-selector': '#1e3028',
          '--dsw-specific-sidebar-nav-item-active': '#22362c',
          '--dsw-specific-sidebar-nav-item-active-accent': '#183626',
          '--dsw-specific-tip': '#1e3028',
          '--dsw-specific-login-input': '#121d18',
        },
        light: {
          '--dsw-alias-bg-base': '#f6faf7',
          '--dsw-specific-sidebar-fill': '#ecf3ee',
          '--dsw-alias-label-primary': '#13261b',
          '--dsw-alias-label-secondary': '#4c6155',
          '--dsw-alias-state-business-primary': '#1f8a4c',
          '--dsw-alias-state-business-tertiary': '#dcf2e5',
          '--dsw-alias-brand-primary': '#1f7a45',
          '--dsw-alias-button-primary-hover': '#18653a',
          '--dsw-alias-button-info-fill': '#1f8a4c',
          '--dsw-specific-bubble': '#e3f1e8',
          '--dsw-specific-bubble-highlight': '#c6e5d2',
          '--dsw-specific-sidebar-nav-item-active-accent': '#dcf2e5',
        },
        swatch: ['#0d1512', '#121d18', '#182620', '#6fcf97', '#e5efe9'],
        swatchLight: ['#f6faf7', '#ecf3ee', '#ffffff', '#1f8a4c', '#13261b'],
      },
    ];
    const STOCK_SWATCH = {
      dark: [S('950'), S('900'), S('850'), 'var(--dsw-static-deepseek-400)', S('50')],
      light: [S('00'), S('50'), S('00'), 'var(--dsw-static-deepseek-500)', S('1000')],
    };

    function readObject(value) {
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
      if (typeof value !== 'string' || value.trim() === '') return {};
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected a JSON object');
      return parsed;
    }

    const COLOUR = /^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla|oklch|oklab|color-mix|var)\([^;{}<>]*\)|transparent)$/;
    const NAME = /^--[a-z0-9-]{3,80}$/;
    /** A colour value only: no url(), images, comments or escapes, and the browser must accept it as a colour. */
    function isColour(value) {
      if (!COLOUR.test(value) || /url\(|image|\/\*|\\/i.test(value)) return false;
      if (value.startsWith('var(')) return true; // resolved later; the name pattern above keeps it a plain reference
      try {
        // `window.CSS`: the name CSS alone is this page's own style text further down.
        const supports = typeof window !== 'undefined' && window.CSS && typeof window.CSS.supports === 'function' ? window.CSS.supports.bind(window.CSS) : null;
        return supports === null || supports('color', value);
      } catch {
        return false;
      }
    }

    /** Validate a custom scheme; throws with a readable message. */
    function parseCustom(text) {
      const raw = readObject(text);
      const out = { id: 'custom', label: typeof raw.label === 'string' ? raw.label.slice(0, 40) : '', light: {}, dark: {} };
      for (const mode of ['light', 'dark']) {
        const map = raw[mode] === undefined ? {} : raw[mode];
        if (!map || typeof map !== 'object' || Array.isArray(map)) throw new Error(`"${mode}" must be an object`);
        for (const [name, value] of Object.entries(map)) {
          if (!NAME.test(name)) throw new Error(`"${name}" is not a colour name`);
          if (typeof value !== 'string' || !isColour(value.trim())) throw new Error(`"${name}": "${value}" is not a colour`);
          out[mode][name] = value.trim();
        }
      }
      if (typeof raw.opaqueMacSidebar === 'boolean') out.opaqueMacSidebar = raw.opaqueMacSidebar;
      if (raw.pattern === 'dots') out.pattern = 'dots';
      return out;
    }

    /** Overrides for the theme service: every changed name gets a { light, dark } pair. */
    function tokensOf(scheme) {
      const names = new Set([...Object.keys(scheme.light ?? {}), ...Object.keys(scheme.dark ?? {})]);
      const tokens = {};
      for (const name of names) {
        const stock = STOCK[name];
        const light = scheme.light?.[name] ?? stock?.[0];
        const dark = scheme.dark?.[name] ?? stock?.[1];
        if (light === undefined || dark === undefined) continue; // an unknown name set for one mode only
        tokens[name] = { light, dark };
      }
      return tokens;
    }

    /** A subtle dot grid on the main area, (schemes with `pattern: 'dots'`). */
    const DOTS_CSS = `body [class*='_centerCol']{background-image:radial-gradient(circle,var(--dsh-cs-dot,transparent) 1.1px,transparent 1.7px)!important;background-size:22px 22px!important;background-position:11px 11px!important}`;
    const MAC_CSS = `html[data-platform='darwin'] body [class*='_sidebarCol']{background:var(--dsw-specific-sidebar-fill)!important}`;

    /**
     * The applied state, shared by the page and the applier. One override layer at a time.
     */
    function createApplier(ctx) {
      let choice = readLocal();
      let theme = null;
      let dispose = null;
      const macStyle = document.createElement('style');
      macStyle.setAttribute('data-color-schemes-mac', '');
      const listeners = new Set();
      const emit = () => { for (const l of listeners) l(); };

      function readLocal() {
        try {
          const v = JSON.parse(window.localStorage.getItem(LOCAL_KEY) || 'null');
          if (v && typeof v.scheme === 'string') return { scheme: canonicalId(v.scheme), custom: String(v.custom ?? ''), opaque: v.opaque !== false };
        } catch {
          // ignore
        }
        return { scheme: 'stock', custom: '', opaque: true };
      }

      function resolve(next) {
        if (next.scheme === 'custom') {
          try {
            return parseCustom(next.custom);
          } catch {
            return SCHEMES[0];
          }
        }
        return SCHEMES.find((s) => s.id === next.scheme) ?? SCHEMES[0];
      }

      function apply() {
        dispose?.();
        dispose = null;
        const scheme = resolve(choice);
        if (theme && scheme.id !== 'stock') {
          try {
            dispose = theme.overrideTokens(SOURCE, tokensOf(scheme));
          } catch (error) {
            console.warn('color-schemes: could not apply', error);
          }
        }
        const opaque = scheme.id !== 'stock' && (scheme.opaqueMacSidebar ?? choice.opaque);
        macStyle.textContent = (opaque ? MAC_CSS : '') + (scheme.pattern === 'dots' ? DOTS_CSS : '');
        if (!macStyle.isConnected) document.head.appendChild(macStyle);
      }

      return {
        get: () => choice,
        subscribe: (l) => { listeners.add(l); return () => listeners.delete(l); },
        attachTheme(service) {
          theme = service;
          apply();
          return () => {
            dispose?.();
            dispose = null;
            theme = null;
          };
        },
        set(next) {
          const same = next.scheme === choice.scheme && next.custom === choice.custom && next.opaque === choice.opaque;
          choice = next;
          try {
            window.localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
          } catch {
            // private mode
          }
          if (!same) {
            apply();
            emit();
          }
        },
        remove() {
          dispose?.();
          dispose = null;
          macStyle.remove();
        },
      };
    }

    // `fresh`: the read before a save asks the app itself, so a stale revision cannot cause a conflict.
    async function describe(ctx, fresh = false) {
      const result = await dshPoll.settings(ctx, { fresh });
      if (!result.ok) throw dshKit.fail(result.error);
      return result.value.namespaces.find((item) => item.ns === SETTINGS_NS);
    }

    async function write(ctx, ops) {
      let entry = await describe(ctx, true);
      if (!entry) throw dshKit.fail('settings namespace not mounted');
      let result = await ctx.remote.settings.mutate(SETTINGS_NS, ops, entry.revision);
      if (!result.ok && result.error.code === 'settings/conflict') {
        entry = await describe(ctx, true);
        result = await ctx.remote.settings.mutate(SETTINGS_NS, ops, entry.revision);
      }
      if (!result.ok) throw dshKit.fail(result.error);
      return result.value;
    }

    function fromValue(value) {
      return {
        scheme: typeof value?.scheme === 'string' ? canonicalId(value.scheme) : 'stock',
        custom: typeof value?.custom === 'string' ? value.custom : '',
        opaque: value?.opaqueMacSidebar !== false,
      };
    }

    const CSS = `
.dsh-cs-page { display: flex; flex-direction: column; gap: 16px; padding: 0 0 36px; color: var(--dsw-alias-label-primary); }
.dsh-cs-head h2 { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.dsh-cs-head p { margin: 2px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); max-width: 72ch; }
.dsh-cs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
.dsh-cs-card { all: unset; box-sizing: border-box; display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 20px; cursor: pointer; background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1)); color: var(--dsw-alias-label-primary); }
.dsh-cs-card:hover:not(:disabled) { border-color: var(--dsw-alias-label-secondary); }
.dsh-cs-card[aria-checked='true'] { border-color: var(--dsw-alias-brand-primary); box-shadow: 0 0 0 1px var(--dsw-alias-brand-primary); }
.dsh-cs-card:disabled { opacity: .5; cursor: default; }
.dsh-cs-card:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-cs-name { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 14px; line-height: 22px; font-weight: 500; }
.dsh-cs-chip { font-size: 11px; line-height: 18px; font-weight: 500; padding: 0 8px; border-radius: 12px; border: 0.5px solid currentColor; color: var(--dsw-alias-brand-primary); white-space: nowrap; }
.dsh-cs-desc { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsh-cs-strip { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.dsh-cs-strip span.l { width: 34px; }
.dsh-cs-sw { display: flex; flex: 1; height: 18px; border-radius: 6px; overflow: hidden; border: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-cs-sw i { flex: 1; }
/* A simple on/off setting: a row, like the app's own. */
.dsh-cs-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-top: 0.5px solid var(--dsw-alias-border-l1); border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-cs-row + .dsh-cs-row { border-top: 0; }
.dsh-cs-row .t { flex: 1; min-width: 0; }
.dsh-cs-row .t div:first-child { font-size: 14px; line-height: 22px; color: var(--dsw-alias-label-primary); }
.dsh-cs-row .t div:last-child { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.dsh-cs-switch { position: relative; box-sizing: border-box; width: 36px; height: 20px; flex: none; border: 0; border-radius: 999px; background: var(--dsw-alias-border-l3); cursor: pointer; padding: 0; }
.dsh-cs-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-secondary)); transition: left .15s; }
.dsh-cs-switch[aria-checked='true'] { background: var(--dsw-alias-brand-primary); }
.dsh-cs-switch[aria-checked='true']::after { left: 18px; background: var(--dsw-alias-bg-base); }
.dsh-cs-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-cs-switch:disabled { opacity: .5; cursor: default; }
.dsh-cs-custom { color: var(--dsw-alias-label-primary); }
.dsh-cs-custom textarea { width: 100%; min-height: 120px; box-sizing: border-box; padding: 10px 14px; border: 0; border-radius: 12px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); color: var(--dsw-alias-label-primary); font-family: var(--ds-font-family-code, monospace); font-size: 12px; line-height: 18px; resize: vertical; }
.dsh-cs-custom textarea:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 0; }
.dsh-cs-btn { box-sizing: border-box; height: 28px; padding: 0 10px; border: 0.5px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; line-height: 18px; cursor: pointer; white-space: nowrap; }
.dsh-cs-btn:hover:not([disabled]) { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-cs-btn[disabled] { opacity: .5; cursor: default; }
.dsh-cs-btn:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 1px; }
.dsh-cs-msg { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-cs-msg[data-tone=bad] { color: var(--dsw-alias-state-error-primary); }
`;

    function Swatch({ label, colours }) {
      return h('div', { className: 'dsh-cs-strip' }, h('span', { className: 'l' }, label),
        h('span', { className: 'dsh-cs-sw', 'aria-hidden': true }, colours.map((c, i) => h('i', { key: i, style: { background: c } }))));
    }

    function ColoursPage({ appCtx, applier }) {
      const t = appCtx.locale.bind(NS);
      const choice = useSyncExternalStore(applier.subscribe, applier.get);
      const [status, setStatus] = useState('loading');
      const [busy, setBusy] = useState(false);
      const [msg, setMsg] = useState({ text: '', tone: '' });
      const [draft, setDraft] = useState(null);

      const load = useCallback(async () => {
        try {
          const entry = await describe(appCtx);
          if (!entry) { setStatus('missing'); return; }
          applier.set(fromValue(entry.value));
          setStatus('ready');
        } catch {
          setStatus((prev) => (prev === 'ready' ? prev : 'error'));
        }
      }, [appCtx, applier]);

      useEffect(() => { void load(); }, [load]);

      const save = async (ops, next) => {
        setBusy(true);
        setMsg({ text: '', tone: '' });
        const before = applier.get();
        applier.set(next);
        try {
          await write(appCtx, ops);
          return true;
        } catch (error) {
          applier.set(before);
          setMsg({ text: t('failed').replace('{message}', error.message), tone: 'bad' });
          return false;
        } finally {
          setBusy(false);
        }
      };

      if (status === 'loading') return h('p', null, t('loading'));
      if (status !== 'ready') return h('p', null, t('unavailable'));

      const cards = [...SCHEMES, { id: 'custom' }].map((scheme) => {
        const selected = choice.scheme === scheme.id;
        let custom = null;
        if (scheme.id === 'custom') {
          try { custom = parseCustom(choice.custom); } catch { custom = null; }
        }
        const label = scheme.id === 'custom' && custom?.label ? custom.label : t('scheme.' + scheme.id);
        const dark = scheme.id === 'stock' ? STOCK_SWATCH.dark : scheme.id === 'custom' ? null : scheme.swatch;
        const light = scheme.id === 'stock' ? STOCK_SWATCH.light : scheme.id === 'custom' ? null : scheme.swatchLight;
        const disabled = busy || (scheme.id === 'custom' && !custom);
        return h('button', {
          key: scheme.id, type: 'button', role: 'radio', className: 'dsh-cs-card', 'aria-checked': selected, disabled,
          onClick: () => { if (!selected) void save([{ op: 'set', path: ['scheme'], value: scheme.id }], { ...choice, scheme: scheme.id }); },
        },
        h('div', { className: 'dsh-cs-name' }, h('span', null, label), selected ? h('span', { className: 'dsh-cs-chip' }, t('in.use')) : null),
        h('div', { className: 'dsh-cs-desc' }, t('scheme.' + scheme.id + '.d')),
        light ? h(Swatch, { label: t('light'), colours: light }) : null,
        dark ? h(Swatch, { label: t('dark'), colours: dark }) : null);
      });

      const text = draft ?? choice.custom ?? '';
      return h('div', { className: 'dsh-cs-page' },
        h('div', { className: 'dsh-cs-head' }, h('h2', null, t('section.title')), h('p', null, t('head.hint'))),
        h('div', { className: 'dsh-cs-grid', role: 'radiogroup', 'aria-label': t('section.title') }, cards),
        h('div', { className: 'dsh-cs-row' },
          h('div', { className: 't' }, h('div', null, t('mac.opaque')), h('div', null, t('mac.opaque.hint'))),
          h('button', {
            type: 'button', role: 'switch', className: 'dsh-cs-switch', 'aria-checked': choice.opaque, 'aria-label': t('mac.opaque'), disabled: busy,
            onClick: () => void save([{ op: 'set', path: ['opaqueMacSidebar'], value: !choice.opaque }], { ...choice, opaque: !choice.opaque }),
          })),
        h('div', { className: 'dsh-cs-row dsh-cs-custom', style: { flexDirection: 'column', alignItems: 'stretch' } },
          h('div', { className: 't' }, h('div', null, t('custom.title')), h('div', null, t('custom.hint'))),
          h('textarea', { value: text, spellCheck: false, 'aria-label': t('custom.title'), placeholder: '{ "label": "My scheme", "dark": { "--dsw-alias-bg-base": "#101418" }, "light": {} }', onChange: (e) => setDraft(e.target.value) }),
          h('div', { style: { display: 'flex', gap: 12, alignItems: 'center' } },
            h('button', {
              type: 'button', className: 'dsh-cs-btn', disabled: busy,
              onClick: async () => {
                try {
                  if (text.trim()) parseCustom(text);
                } catch (error) {
                  setMsg({ text: t('custom.bad').replace('{message}', error.message), tone: 'bad' });
                  return;
                }
                if (await save([{ op: 'set', path: ['custom'], value: text }], { ...choice, custom: text })) {
                  setDraft(null);
                  setMsg({ text: t('custom.saved'), tone: '' });
                }
              },
            }, t('custom.save')),
            msg.text ? h('span', { className: 'dsh-cs-msg', 'data-tone': msg.tone, role: 'status' }, msg.text) : null)));
    }

    return {
      inject: ['slots', 'locale', 'remote', 'remote.settings'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, DICT));
        const style = document.createElement('style');
        style.setAttribute('data-color-schemes-style', '');
        style.textContent = CSS;
        document.head.appendChild(style);
        ctx.effect(() => () => style.remove());

        const applier = createApplier(ctx);
        ctx.effect(() => () => applier.remove());
        // The theme service is optional: without it the page still works and nothing is recoloured.
        ctx.inject(['theme'], (inner) => {
          inner.effect(() => applier.attachTheme(inner.theme), 'color-schemes: overrides');
        });

        // Follow the saved choice (also changes made in another window).
        const refresh = async () => {
          try {
            const entry = await describe(ctx);
            if (entry) applier.set(fromValue(entry.value));
          } catch {
            // keep the last known choice
          }
        };
        // One shared read of Settings for the whole page; it looks again the moment Settings changes (also from another
        // window), at most every 30 s as a safety net, and not at all while the window is hidden.
        const watcher = dshPoll.loop(() => refresh(), { every: 30000 });
        const stopListening = dshPoll.onChange(ctx, (ns) => { if (ns === SETTINGS_NS) watcher.poke(); });
        ctx.effect(() => () => { watcher.stop(); stopListening(); });

        const t = ctx.locale.bind(NS);
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'color-schemes', order: 600, label: () => t('section.title') },
              (props) => h(ColoursPage, { ...props, appCtx: ctx, applier }),
            ),
          ),
        );
      },
    };
  },
});
