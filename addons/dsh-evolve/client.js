/**
 * Browser half of Self-improvement: the Settings → Self-improvement page.
 *
 * Switches, models and limits are saved through the app's settings channel.
 * Tasks, scores, proposed changes and versions come from the fenced
 * `GET dsh-evolve/status` route; every action goes to the fenced
 * `POST dsh-evolve/action` route. The page follows docs/UI-STYLE.md: colours
 * come only from the app's variables, so it follows every colour scheme.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-evolve',
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

    const NS = 'evolve';
    const DICT = { en: { 'section.title': 'Self-improve' }, zh: { 'section.title': '自我改进' } };

    const GROUPS = [
      { id: 'learn', label: 'Learn', help: 'The reviewer studies what goes wrong on these.' },
      { id: 'check', label: 'Check', help: 'Prove that a change helps. The reviewer never sees them.' },
      { id: 'guard', label: 'Guard', help: 'Things that work today and must keep working. The reviewer never sees them.' },
    ];
    const OUTCOMES = {
      awaitingApproval: 'Waiting for you',
      approved: 'Approved',
      declined: 'Declined',
      rejected: 'Stopped by the gates',
      outdated: 'Out of date',
    };

    const CSS = `
.dsh-ev-page { display: flex; flex-direction: column; color: var(--dsw-alias-label-primary); }
.dsh-ev-title { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; }
.dsh-ev-desc { margin: 4px 0 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ev-group { margin: 24px 0 8px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: var(--dsw-alias-label-secondary); display: flex; align-items: center; gap: 8px; }
.dsh-ev-group > span:first-child { flex: 1; }
.dsh-ev-row { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); }
.dsh-ev-rowtext { flex: 1; min-width: 0; }
.dsh-ev-rowtitle { font-size: 14px; line-height: 22px; }
.dsh-ev-rowdesc { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ev-switch {
  flex: none; position: relative; width: 36px; height: 20px; padding: 2px; border: 0; border-radius: 999px; cursor: pointer;
  background: var(--dsw-alias-border-l3, var(--dsw-alias-border-l2)); transition: background .12s ease;
}
.dsh-ev-switch[aria-checked="true"] { background: var(--dsw-alias-brand-primary); }
.dsh-ev-switch::after {
  content: ''; display: block; width: 16px; height: 16px; border-radius: 50%; background: var(--dsw-alias-switch-thumb, var(--dsw-alias-label-primary)); transition: transform .12s ease;
}
.dsh-ev-switch[aria-checked="true"]::after { transform: translateX(16px); background: var(--dsw-alias-bg-base); }
.dsh-ev-switch:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.dsh-ev-field {
  box-sizing: border-box; height: 36px; padding: 0 14px; border: 0; border-radius: 12px; font: inherit; font-size: 14px; min-width: 0;
  color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent);
}
.dsh-ev-field:focus { outline: 1px solid var(--dsw-alias-brand-primary); }
.dsh-ev-field::placeholder { color: var(--dsw-alias-label-secondary); opacity: .75; }
select.dsh-ev-field { max-width: 260px; }
.dsh-ev-num { flex: none; width: 120px; }
textarea.dsh-ev-field { width: 100%; height: auto; min-height: 72px; padding: 9px 14px; line-height: 20px; resize: vertical; }
.dsh-ev-card {
  display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; padding: 14px 16px; border-radius: 20px;
  border: 0.5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-settings-card-fill, var(--dsw-alias-bg-layer-1));
}
.dsh-ev-card[data-main="true"] { border-color: var(--dsw-alias-brand-primary); }
.dsh-ev-cardhead { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
.dsh-ev-cardtitle { flex: 1; min-width: 0; font-size: 14px; line-height: 22px; overflow-wrap: anywhere; }
.dsh-ev-line { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ev-line[data-warn="true"] { color: var(--dsw-alias-state-warn-primary); }
.dsh-ev-line[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
.dsh-ev-tag { flex: none; height: 24px; padding: 0 9px; border-radius: 12px; font-size: 11px; line-height: 24px; white-space: nowrap; color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent); }
.dsh-ev-tag[data-tone="good"] { color: var(--dsw-alias-state-success-primary); background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 12%, transparent); }
.dsh-ev-tag[data-tone="bad"] { color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); }
.dsh-ev-tag[data-tone="accent"] { color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-ev-pack { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); cursor: pointer; }
.dsh-ev-packbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.dsh-ev-check { flex: none; width: 16px; height: 16px; margin: 3px 0 0; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
.dsh-ev-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.dsh-ev-btn {
  height: 28px; padding: 0 10px; border-radius: 8px; border: 0.5px solid var(--dsw-alias-border-l2); background: transparent;
  color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; white-space: nowrap;
}
.dsh-ev-btn:hover { background: var(--dsw-alias-interactive-bg-hover, var(--dsw-alias-bg-layer-2)); }
.dsh-ev-btn[disabled] { opacity: .5; cursor: default; }
.dsh-ev-btn[data-main="true"] { border-color: var(--dsw-alias-brand-primary); color: var(--dsw-alias-brand-primary); }
.dsh-ev-btn[data-danger="true"] { border-color: var(--dsw-alias-state-error-primary); color: var(--dsw-alias-state-error-primary); }
.dsh-ev-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.dsh-ev-grid > .dsh-ev-wide { grid-column: 1 / -1; }
.dsh-ev-label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); min-width: 0; }
.dsh-ev-label > .dsh-ev-field { width: 100%; max-width: none; }
.dsh-ev-checkrow { display: grid; grid-template-columns: 170px minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.dsh-ev-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
.dsh-ev-stat { display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border-radius: 14px; border: 0.5px solid var(--dsw-alias-border-l2); }
.dsh-ev-statvalue { font-size: 18px; line-height: 24px; font-weight: 500; }
.dsh-ev-bar { height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent); overflow: hidden; }
.dsh-ev-bar > span { display: block; height: 100%; background: var(--dsw-alias-brand-primary); transition: width .2s ease; }
.dsh-ev-gates { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.dsh-ev-gates li { display: flex; gap: 8px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ev-gates li > b { flex: none; width: 14px; font-weight: 600; color: var(--dsw-alias-state-success-primary); }
.dsh-ev-gates li[data-pass="false"] > b { color: var(--dsw-alias-state-error-primary); }
.dsh-ev-gates li > span > i { font-style: normal; color: var(--dsw-alias-label-primary); }
.dsh-ev-pre { margin: 0; padding: 12px 14px; border-radius: 12px; font: inherit; font-size: 13px; line-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; background: color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent); }
.dsh-ev-steps { margin: 12px 0 0; padding: 0; list-style: none; counter-reset: step; display: flex; flex-direction: column; gap: 8px; }
.dsh-ev-steps li { counter-increment: step; display: flex; gap: 10px; font-size: 13px; line-height: 20px; }
.dsh-ev-steps li::before { content: counter(step); flex: none; width: 20px; height: 20px; border-radius: 50%; text-align: center; font-size: 11px; line-height: 20px; color: var(--dsw-alias-brand-primary); background: color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent); }
.dsh-ev-steps li[data-done="true"] { color: var(--dsw-alias-label-secondary); }
.dsh-ev-steps li[data-done="true"]::before { content: '✓'; }
.dsh-ev-list { margin: 0; padding: 0; list-style: none; }
.dsh-ev-list li { padding: 10px 0; border-bottom: 0.5px solid var(--dsw-alias-border-l1); font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.dsh-ev-list li b { font-weight: 400; color: var(--dsw-alias-label-primary); }
.dsh-ev-status { margin-top: 16px; min-height: 18px; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-secondary); }
.dsh-ev-status[data-error="true"] { color: var(--dsw-alias-state-error-primary); }
@media (max-width: 720px) {
  .dsh-ev-grid { grid-template-columns: minmax(0, 1fr); }
  .dsh-ev-checkrow { grid-template-columns: minmax(0, 1fr); }
  .dsh-ev-row { flex-wrap: wrap; }
}
`;

    const pct = (rate) => `${Math.round((rate ?? 0) * 100)}%`;
    const count = (n) => String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const when = (iso) => {
      const date = new Date(iso);
      return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
    };

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

    async function loadCatalog(ctx) {
      try {
        const result = await ctx.remote.session.modelCatalog();
        return result.ok ? result.value : null;
      } catch {
        return null;
      }
    }

    async function loadStatus() {
      const response = await fetch(new URL('dsh-evolve/status', document.baseURI), { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw dshKit.fail(`status ${response.status}`);
      return response.json();
    }

    async function sendAction(body) {
      const response = await fetch(new URL('dsh-evolve/action', document.baseURI), {
        method: 'POST',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-dsh-evolve': '1' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw dshKit.fail(data.error || `status ${response.status}`);
      return data;
    }

    function Switch({ checked, label, onChange }) {
      return h('button', { type: 'button', role: 'switch', className: 'dsh-ev-switch', 'aria-checked': checked, 'aria-label': label, onClick: () => onChange(!checked) });
    }

    function Row({ title, hint, children }) {
      return h(
        'div',
        { className: 'dsh-ev-row' },
        h('div', { className: 'dsh-ev-rowtext' }, h('div', { className: 'dsh-ev-rowtitle' }, title), hint ? h('div', { className: 'dsh-ev-rowdesc' }, hint) : null),
        children,
      );
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
        className: 'dsh-ev-field dsh-ev-num', type: 'number', min, max, step: 1, value: draft, 'aria-label': label,
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

    /** Pick a model from the app's model list; the first entry means "none". */
    function ModelSelect({ catalog, provider, model, none, label, onPick }) {
      const groups = catalog?.groups ?? [];
      const value = provider && model ? `${provider}\u0000${model}` : '';
      const known = groups.some((group) => group.id === provider && group.models.some((item) => item.id === model));
      return h(
        'select',
        {
          className: 'dsh-ev-field', value, 'aria-label': label,
          onChange: (event) => {
            const [nextProvider, nextModel] = event.target.value.split('\u0000');
            onPick(nextProvider || '', nextModel || '');
          },
        },
        h('option', { value: '' }, none),
        value && !known ? h('option', { value }, `${model} (not available now)`) : null,
        groups.map((group) =>
          h('optgroup', { key: group.id, label: group.name }, group.models.map((item) => h('option', { key: `${group.id}:${item.id}`, value: `${group.id}\u0000${item.id}` }, item.name))),
        ),
      );
    }

    /** The example sets: tick the kinds of work you want and add only those. */
    function PackPicker({ packs, busy, running, act, onClose }) {
      const [picked, setPicked] = useState([]);
      const chosen = packs.filter((item) => picked.includes(item.id));
      const toAdd = chosen.reduce((sum, item) => sum + (item.count - item.added), 0);
      const toRemove = chosen.reduce((sum, item) => sum + item.added, 0);
      const all = picked.length === packs.length;
      const toggle = (id) => setPicked((now) => (now.includes(id) ? now.filter((item) => item !== id) : [...now, id]));
      return h(
        'div',
        { className: 'dsh-ev-card', 'data-main': 'true' },
        h(
          'div',
          { className: 'dsh-ev-cardhead' },
          h('span', { className: 'dsh-ev-cardtitle' }, 'Example tasks'),
          h('button', { type: 'button', className: 'dsh-ev-btn', onClick: () => setPicked(all ? [] : packs.map((item) => item.id)) }, all ? 'Clear all' : 'Select all'),
        ),
        h('div', { className: 'dsh-ev-line' }, 'Hard, ready-made tasks for each kind of work, with answers that were worked out by code. Tick the sets you want. Each set is spread over Learn, Check and Guard.'),
        packs.map((item) =>
          h(
            'label',
            { className: 'dsh-ev-pack', key: item.id },
            h('input', { type: 'checkbox', className: 'dsh-ev-check', checked: picked.includes(item.id), onChange: () => toggle(item.id) }),
            h(
              'span',
              { className: 'dsh-ev-packbody' },
              h(
                'span',
                { className: 'dsh-ev-cardhead' },
                h('span', { className: 'dsh-ev-cardtitle' }, item.name),
                h('span', { className: 'dsh-ev-tag' }, `${item.count} tasks`),
                item.needsJudge ? h('span', { className: 'dsh-ev-tag', 'data-tone': 'accent' }, 'needs a judge model') : null,
                item.needsTools ? h('span', { className: 'dsh-ev-tag', 'data-tone': 'accent' }, 'uses tools') : null,
                item.added > 0 ? h('span', { className: 'dsh-ev-tag', 'data-tone': 'good' }, item.added === item.count ? 'added' : `${item.added} added`) : null,
              ),
              h('span', { className: 'dsh-ev-line' }, item.description),
            ),
          ),
        ),
        h(
          'div',
          { className: 'dsh-ev-actions', style: { marginTop: 12 } },
          h('span', { className: 'dsh-ev-line', style: { flex: 1 } }, picked.length === 0 ? 'Nothing ticked yet.' : `${picked.length} set${picked.length === 1 ? '' : 's'} ticked.`),
          h('button', { type: 'button', className: 'dsh-ev-btn', onClick: onClose }, 'Close'),
          toRemove > 0
            ? h('button', { type: 'button', className: 'dsh-ev-btn', 'data-danger': 'true', disabled: busy || running, onClick: async () => { if (await act({ action: 'removePacks', packs: picked }, `${toRemove} example task${toRemove === 1 ? ' was' : 's were'} removed.`)) setPicked([]); } }, `Remove ticked (${toRemove})`)
            : null,
          h('button', { type: 'button', className: 'dsh-ev-btn', 'data-main': 'true', disabled: busy || toAdd === 0, onClick: async () => { if (await act({ action: 'addPacks', packs: picked }, `${toAdd} example task${toAdd === 1 ? ' was' : 's were'} added.`)) setPicked([]); } }, `Add ticked (${toAdd} task${toAdd === 1 ? '' : 's'})`),
        ),
      );
    }

    const EMPTY_TASK = { id: '', family: 'general', split: 'learn', kind: 'answer', prompt: '', checks: [{ type: 'contains', value: '' }] };

    /** The form for a new task or an edited one. */
    function TaskForm({ initial, checkTypes, families, busy, onSave, onCancel }) {
      const [task, setTask] = useState(initial);
      const set = (patch) => setTask((prev) => ({ ...prev, ...patch }));
      const setCheck = (index, patch) => set({ checks: task.checks.map((check, at) => (at === index ? { ...check, ...patch } : check)) });
      const usable = task.prompt.trim() && task.checks.some((check) => check.type === 'json' || check.value.trim());
      return h(
        'div',
        { className: 'dsh-ev-card', 'data-main': 'true' },
        h('div', { className: 'dsh-ev-cardtitle' }, initial.id ? 'Edit task' : 'New task'),
        h(
          'div',
          { className: 'dsh-ev-grid' },
          h(
            'label',
            { className: 'dsh-ev-label dsh-ev-wide' },
            'What to ask the model',
            h('textarea', { className: 'dsh-ev-field', rows: 3, maxLength: 8000, value: task.prompt, placeholder: 'A task from your real work, written the way you would ask it.', onChange: (event) => set({ prompt: event.target.value }) }),
          ),
          h(
            'label',
            { className: 'dsh-ev-label' },
            'Kind of work (a name of your choice, such as code, writing, research)',
            h('input', { className: 'dsh-ev-field', list: 'dsh-ev-families', maxLength: 30, value: task.family, onChange: (event) => set({ family: event.target.value }) }),
            h('datalist', { id: 'dsh-ev-families' }, families.map((family) => h('option', { key: family, value: family }))),
          ),
          h(
            'label',
            { className: 'dsh-ev-label' },
            'Group',
            h('select', { className: 'dsh-ev-field', value: task.split, onChange: (event) => set({ split: event.target.value }) }, GROUPS.map((group) => h('option', { key: group.id, value: group.id }, `${group.label}: ${group.help}`))),
          ),
          h(
            'label',
            { className: 'dsh-ev-label dsh-ev-wide' },
            'How it runs',
            h(
              'select',
              { className: 'dsh-ev-field', value: task.kind, onChange: (event) => set({ kind: event.target.value }) },
              h('option', { value: 'answer' }, 'Answer only: the model answers in one go, without tools'),
              h('option', { value: 'agent' }, 'With tools: a helper agent works in an empty temporary folder inside the open conversation\'s folder (needs an open Cowork or Code conversation)'),
            ),
          ),
        ),
        h('div', { className: 'dsh-ev-line' }, 'How to tell a good result. Every check must pass.'),
        task.checks.map((check, index) =>
          h(
            'div',
            { className: 'dsh-ev-checkrow', key: index },
            h('select', { className: 'dsh-ev-field', value: check.type, 'aria-label': 'Kind of check', onChange: (event) => setCheck(index, { type: event.target.value }) }, checkTypes.map((item) => h('option', { key: item.type, value: item.type }, item.type))),
            h('input', { className: 'dsh-ev-field', value: check.value, placeholder: checkTypes.find((item) => item.type === check.type)?.help ?? '', 'aria-label': 'What to look for', onChange: (event) => setCheck(index, { value: event.target.value }) }),
            h('button', { type: 'button', className: 'dsh-ev-btn', disabled: task.checks.length === 1, onClick: () => set({ checks: task.checks.filter((_, at) => at !== index) }) }, 'Remove'),
          ),
        ),
        h(
          'div',
          { className: 'dsh-ev-actions' },
          h('button', { type: 'button', className: 'dsh-ev-btn', disabled: task.checks.length >= 8, onClick: () => set({ checks: [...task.checks, { type: 'contains', value: '' }] }) }, 'Add a check'),
          h('span', { style: { flex: 1 } }),
          h('button', { type: 'button', className: 'dsh-ev-btn', onClick: onCancel }, 'Cancel'),
          h('button', { type: 'button', className: 'dsh-ev-btn', 'data-main': 'true', disabled: busy || !usable, onClick: () => onSave(task) }, 'Save task'),
        ),
      );
    }

    function EvolvePage({ appCtx }) {
      const [settings, setSettings] = useState(null);
      const [status, setStatus] = useState(null);
      const [catalog, setCatalog] = useState(null);
      const [note, setNote] = useState({ text: '', error: false });
      const [busy, setBusy] = useState(false);
      const [editing, setEditing] = useState(null);
      const [lesson, setLesson] = useState({ family: 'all', text: '' });
      const [showAll, setShowAll] = useState(false);
      const [showPacks, setShowPacks] = useState(false);
      const alive = useRef(true);

      const refresh = useCallback(async () => {
        try {
          const next = await loadStatus();
          if (alive.current) setStatus(next);
        } catch {
          if (alive.current) setNote({ text: 'The page could not load its data. Restart the app once after installing.', error: true });
        }
      }, []);

      useEffect(() => {
        alive.current = true;
        (async () => {
          try {
            const [loaded, models] = await Promise.all([loadSettings(appCtx), loadCatalog(appCtx)]);
            if (!alive.current) return;
            setSettings(loaded);
            setCatalog(models);
          } catch {
            if (alive.current) setNote({ text: 'The page could not load its settings. Restart the app once after installing.', error: true });
          }
          refresh();
        })();
        return () => {
          alive.current = false;
        };
      }, [appCtx, refresh]);

      // Follow a run while it is in progress.
      const running = status?.job?.state === 'running';
      useEffect(() => {
        if (!running) return undefined;
        const timer = dshPoll.loop(() => refresh(), { every: 1500, immediate: false });
        return () => timer.stop();
      }, [running, refresh]);

      const save = async (ops) => {
        try {
          const next = await mutateSettings(appCtx, ops, settings.revision);
          setSettings(next);
          setNote({ text: 'Saved.', error: false });
          refresh();
        } catch (error) {
          setNote({ text: `Could not save: ${error.message}`, details: error.details ?? '', error: true });
        }
      };
      const setField = (field, value) => save([{ op: 'set', path: [field], value }]);
      const setModel = (prefix, provider, model) =>
        save([
          { op: 'set', path: [`${prefix}Provider`], value: provider },
          { op: 'set', path: [`${prefix}Model`], value: model },
        ]);

      const act = async (body, done) => {
        setBusy(true);
        try {
          const next = await sendAction(body);
          if (!alive.current) return false;
          setStatus(next);
          setNote({ text: done ?? '', error: false });
          return true;
        } catch (error) {
          if (alive.current) setNote({ text: error.message, details: error.details ?? '', error: true });
          return false;
        } finally {
          if (alive.current) setBusy(false);
        }
      };

      if (!settings || !status) {
        return h('div', { className: 'dsh-ev-page' }, h('style', null, CSS), h('h2', { className: 'dsh-ev-title' }, 'Self-improvement'), h('p', { className: 'dsh-ev-desc', 'data-error': String(note.error) }, note.text || 'Loading…'));
      }

      const value = settings.value;
      const now = status.settings;
      const tasks = status.tasks;
      const usableTasks = tasks.filter((task) => task.enabled && task.checks.length > 0);
      const has = (split) => usableTasks.some((task) => task.split === split);
      const ready = { model: Boolean(now.student), reviewer: Boolean(now.reviewer), tasks: has('learn') && has('check') && has('guard') };
      const job = status.job;
      const measured = status.measured;
      const waiting = status.candidates.filter((candidate) => candidate.outcome === 'awaitingApproval');
      const others = status.candidates.filter((candidate) => candidate.outcome !== 'awaitingApproval');
      const families = [...new Set(tasks.map((task) => task.family))];
      const calls = usableTasks.length * now.repeats;
      const lessons = status.active.playbook.filter((entry) => entry.status === 'active');

      return h(
        'div',
        { className: 'dsh-ev-page' },
        h('style', null, CSS),
        h('h2', { className: 'dsh-ev-title' }, 'Self-improvement'),
        h(
          'p',
          { className: 'dsh-ev-desc' },
          'Makes a model better at your kind of work by improving the instructions it is given, never the model itself. You supply test tasks and how to tell a good result. A reviewer model studies what goes wrong and proposes small changes. Each change is tested on tasks the reviewer never saw, and only reaches you if it measurably helps and breaks nothing. You approve every change, and every version can be put back.',
        ),

        !(ready.model && ready.reviewer && ready.tasks && measured.overall)
          ? h(
              'ol',
              { className: 'dsh-ev-steps' },
              h('li', { 'data-done': String(ready.model && ready.reviewer) }, 'Pick what to improve (a model version or a plain model) and a stronger model as reviewer, under Setup.'),
              h('li', { 'data-done': String(ready.tasks) }, 'Add tasks from your real work to each of the three groups (Learn, Check, Guard), or start with the example tasks.'),
              h('li', { 'data-done': String(Boolean(measured.overall)) }, 'Press Measure to see how the model does today. Then Run a cycle to look for improvements.'),
            )
          : null,

        // ---- run
        h('div', { className: 'dsh-ev-group' }, h('span', null, 'Score and runs')),
        h(
          'div',
          { className: 'dsh-ev-stats' },
          h('div', { className: 'dsh-ev-stat' }, h('span', { className: 'dsh-ev-statvalue' }, measured.overall ? pct(measured.overall.rate) : '–'), h('span', { className: 'dsh-ev-line' }, measured.overall ? `of ${measured.overall.runs} runs passed` : 'not measured yet')),
          GROUPS.map((group) => {
            const part = measured.bySplit?.[group.id] ?? {};
            return h('div', { className: 'dsh-ev-stat', key: group.id, title: group.help }, h('span', { className: 'dsh-ev-statvalue' }, part.runs ? pct(part.rate) : '–'), h('span', { className: 'dsh-ev-line' }, `${group.label} · ${part.tasks ?? 0} task${part.tasks === 1 ? '' : 's'}`));
          }),
        ),
        measured.overall
          ? h('div', { className: 'dsh-ev-line', 'data-warn': String(Boolean(measured.stale)), style: { marginTop: 8 } }, measured.stale ? 'The tasks, the model or the number of runs changed since this was measured. Measure again.' : `Measured ${when(measured.at)} on ${measured.model?.model ?? ''} with ${status.active.version}, ${measured.repeats} run${measured.repeats === 1 ? '' : 's'} per task.`)
          : null,
        h(
          'div',
          { className: 'dsh-ev-actions', style: { marginTop: 12 } },
          h('button', { type: 'button', className: 'dsh-ev-btn', disabled: busy || running || !ready.model || usableTasks.length === 0, title: `${calls} model calls`, onClick: () => act({ action: 'measure' }, 'Measuring.') }, 'Measure'),
          h('button', { type: 'button', className: 'dsh-ev-btn', 'data-main': 'true', disabled: busy || running || !ready.model || !ready.reviewer || !ready.tasks, onClick: () => act({ action: 'improve' }, 'A cycle has started.') }, 'Run a cycle'),
          running ? h('button', { type: 'button', className: 'dsh-ev-btn', 'data-danger': 'true', disabled: busy, onClick: () => act({ action: 'cancel' }, 'Stopping.') }, 'Stop') : null,
          h('span', { className: 'dsh-ev-line' }, usableTasks.length > 0 ? `Measuring makes ${calls} model call${calls === 1 ? '' : 's'}. A cycle adds one review and up to ${now.maxEdits} tests of the Check and Guard tasks.` : ''),
        ),
        job
          ? h(
              'div',
              { className: 'dsh-ev-card', style: { marginTop: 12 } },
              h(
                'div',
                { className: 'dsh-ev-cardhead' },
                h('span', { className: 'dsh-ev-cardtitle' }, running ? job.phase : job.kind === 'improve' ? 'Last cycle' : 'Last measurement'),
                h('span', { className: 'dsh-ev-tag', 'data-tone': job.state === 'done' ? 'good' : job.state === 'failed' ? 'bad' : job.state === 'running' ? 'accent' : undefined }, { running: 'Running', done: 'Finished', failed: 'Failed', cancelled: 'Stopped' }[job.state]),
              ),
              running && job.total > 0 ? h('div', { className: 'dsh-ev-bar' }, h('span', { style: { width: `${Math.round((job.done / job.total) * 100)}%` } })) : null,
              h('div', { className: 'dsh-ev-line', 'data-error': String(job.state === 'failed') }, running ? `${job.total > 0 ? `${job.done} of ${job.total} runs. ` : ''}${count(job.usedTokens)} tokens used so far.` : `${job.summary} ${job.usedTokens ? `(${count(job.usedTokens)} tokens)` : ''}`),
              !running && job.diagnosis?.length > 0 ? h('ul', { className: 'dsh-ev-list' }, job.diagnosis.map((item, index) => h('li', { key: index }, h('b', null, 'What the reviewer found: '), item.cause))) : null,
            )
          : null,

        // ---- changes waiting
        waiting.length > 0 ? h('div', { className: 'dsh-ev-group' }, h('span', null, 'Changes waiting for you')) : null,
        waiting.map((candidate) =>
          h(
            'div',
            { className: 'dsh-ev-card', 'data-main': 'true', key: candidate.id },
            h('div', { className: 'dsh-ev-cardtitle' }, candidate.description),
            candidate.rationale ? h('div', { className: 'dsh-ev-line' }, `Why: ${candidate.rationale}`) : null,
            h('ul', { className: 'dsh-ev-gates' }, candidate.gates.map((gate) => h('li', { key: gate.id, 'data-pass': String(gate.pass) }, h('b', null, gate.pass ? '✓' : '✗'), h('span', null, h('i', null, `${gate.name}. `), gate.note)))),
            h(
              'div',
              { className: 'dsh-ev-actions' },
              h('button', { type: 'button', className: 'dsh-ev-btn', 'data-main': 'true', disabled: busy || running, onClick: () => act({ action: 'approve', id: candidate.id }, 'Approved. It is in use now.') }, 'Approve and use'),
              h('button', { type: 'button', className: 'dsh-ev-btn', disabled: busy, onClick: () => act({ action: 'decline', id: candidate.id }, 'Declined.') }, 'Decline'),
            ),
          ),
        ),

        // ---- setup
        h('div', { className: 'dsh-ev-group' }, h('span', null, 'Setup')),
        h(Row, { title: 'Use self-improvement', hint: 'Off stops runs and adds nothing to any conversation.' }, h(Switch, { checked: value.enabled !== false, label: 'Use self-improvement', onChange: (next) => setField('enabled', next) })),
        h(
          Row,
          {
            title: 'What to improve',
            hint: now.missingTarget
              ? 'The model version chosen before no longer exists. Pick another.'
              : 'A saved model version (from Settings → Model Tiers → Model versions) or a plain model. Each has its own tasks, lessons and history, so "Qwen – Coding" and "Qwen – Writing" improve separately.',
          },
          h(
            'select',
            { className: 'dsh-ev-field', value: now.target ?? '', disabled: running, 'aria-label': 'What to improve', onChange: (event) => setField('target', event.target.value) },
            h('option', { value: '' }, 'A plain model'),
            (status.targets ?? []).map((target) => h('option', { key: target.id, value: target.id }, `${target.name} (${target.model})`)),
          ),
        ),
        now.version
          ? h(Row, { title: 'Model', hint: `Tests run on this version's model, with its sampling settings${now.version.hasInstructions ? ' and its own instructions' : ''}. Approved lessons are used in conversations that are on this version.` }, h('span', { className: 'dsh-ev-tag', 'data-tone': 'accent' }, now.version.model))
          : h(Row, { title: 'Model to improve', hint: 'Usually a local model. The test tasks run on it, and approved lessons are used in every conversation.' }, h(ModelSelect, { catalog, provider: value.studentProvider, model: value.studentModel, none: 'Pick a model', label: 'Model to improve', onPick: (provider, model) => setModel('student', provider, model) })),
        h(Row, { title: 'Reviewer model', hint: 'A stronger model. It sees the Learn tasks, the answers and why they failed, with secrets, addresses and home paths removed. It never sees your conversations.' }, h(ModelSelect, { catalog, provider: value.reviewerProvider, model: value.reviewerModel, none: 'Pick a model', label: 'Reviewer model', onPick: (provider, model) => setModel('reviewer', provider, model) })),
        h(Row, { title: 'Judge model (optional)', hint: 'Only for tasks with a "judge" check. Without it, such a check never counts as passed.' }, h(ModelSelect, { catalog, provider: value.judgeProvider, model: value.judgeModel, none: 'None', label: 'Judge model', onPick: (provider, model) => setModel('judge', provider, model) })),
        h(Row, { title: 'Use approved instructions in real conversations', hint: 'Off keeps them to test runs only, so you can try the loop without changing how the app behaves.' }, h(Switch, { checked: value.applyLive !== false, label: 'Use approved instructions in real conversations', onChange: (next) => setField('applyLive', next) })),
        h(Row, { title: 'Runs per task', hint: 'A model does not answer the same way twice. More runs give a steadier score and cost more. 1 to 5.' }, h(NumberField, { value: now.repeats, min: 1, max: 5, label: 'Runs per task', onCommit: (next) => setField('repeats', next) })),
        h(Row, { title: 'Changes tried per cycle', hint: 'Each one is tested on its own, so a gain can be traced to one change. 1 to 5.' }, h(NumberField, { value: now.maxEdits, min: 1, max: 5, label: 'Changes tried per cycle', onCommit: (next) => setField('maxEdits', next) })),
        h(Row, { title: 'Token allowance per run', hint: 'A run stops when it has used this many tokens, and changes nothing. 0 means no limit.' }, h(NumberField, { value: now.tokenBudget, min: 0, max: 50000000, label: 'Token allowance per run', onCommit: (next) => setField('tokenBudget', next) })),

        // ---- tasks
        h(
          'div',
          { className: 'dsh-ev-group' },
          h('span', null, `Tasks (${tasks.length})`),
          h('button', { type: 'button', className: 'dsh-ev-btn', onClick: () => setShowPacks(!showPacks) }, showPacks ? 'Hide example tasks' : 'Add example tasks'),
          h('button', { type: 'button', className: 'dsh-ev-btn', 'data-main': 'true', disabled: Boolean(editing), onClick: () => setEditing({ ...EMPTY_TASK, family: families[0] ?? 'general' }) }, 'New task'),
        ),
        h('p', { className: 'dsh-ev-desc', style: { margin: '0 0 8px' } }, 'Use tasks from your own work, with a result you can check. Aim for ten or more per kind of work, spread over the three groups. The loop can read these tasks but never change them.'),
        showPacks ? h(PackPicker, { packs: status.packs ?? [], busy, running, act, onClose: () => setShowPacks(false) }) : null,
        editing
          ? h(TaskForm, {
              key: editing.id || 'new',
              initial: editing,
              checkTypes: status.checkTypes,
              families,
              busy,
              onCancel: () => setEditing(null),
              onSave: async (task) => {
                if (await act({ action: 'saveTask', task }, 'Task saved.')) setEditing(null);
              },
            })
          : null,
        (showAll ? tasks : tasks.slice(0, 8)).map((task) =>
          h(
            'div',
            { className: 'dsh-ev-card', key: task.id },
            h(
              'div',
              { className: 'dsh-ev-cardhead' },
              h('span', { className: 'dsh-ev-cardtitle' }, task.prompt.length > 160 ? `${task.prompt.slice(0, 157)}…` : task.prompt),
              task.result ? h('span', { className: 'dsh-ev-tag', 'data-tone': task.result.solid ? 'good' : 'bad', title: task.result.detail }, `${task.result.passes} of ${task.result.runs} passed`) : null,
            ),
            h('div', { className: 'dsh-ev-line' }, `${GROUPS.find((group) => group.id === task.split)?.label} · ${task.family} · ${task.kind === 'agent' ? 'with tools' : 'answer only'} · ${task.checks.length === 0 ? 'no check yet, so it is not run' : task.checks.map((check) => `${check.type}${check.value ? `: ${check.value.length > 40 ? `${check.value.slice(0, 37)}…` : check.value}` : ''}`).join('; ')}`),
            task.result && !task.result.solid && task.result.detail ? h('div', { className: 'dsh-ev-line', 'data-warn': 'true' }, task.result.detail) : null,
            h(
              'div',
              { className: 'dsh-ev-actions' },
              h('button', { type: 'button', className: 'dsh-ev-btn', disabled: Boolean(editing), onClick: () => setEditing({ ...task, checks: task.checks.length > 0 ? task.checks : [{ type: 'contains', value: '' }] }) }, 'Edit'),
              h('button', { type: 'button', className: 'dsh-ev-btn', disabled: busy || running, onClick: () => act({ action: 'deleteTask', id: task.id }, 'Task deleted.') }, 'Delete'),
            ),
          ),
        ),
        tasks.length > 8 ? h('div', { className: 'dsh-ev-actions' }, h('button', { type: 'button', className: 'dsh-ev-btn', onClick: () => setShowAll(!showAll) }, showAll ? 'Show fewer' : `Show all ${tasks.length}`)) : null,

        // ---- instructions in use
        h('div', { className: 'dsh-ev-group' }, h('span', null, `Lessons in use${now.version ? ` for ${now.version.name}` : ''} (${status.active.version})`)),
        status.active.text
          ? h('pre', { className: 'dsh-ev-pre' }, status.active.text)
          : h('p', { className: 'dsh-ev-desc', style: { marginTop: 0 } }, 'Nothing has been added yet. Approved changes appear here, and are given to the model with its other instructions.'),
        h('p', { className: 'dsh-ev-desc' }, `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}. In real conversations the model gets the lessons for "all" and "general" work, plus those whose kind of work is named like the conversation's mode (chat, cowork, code).`),
        h(
          'div',
          { className: 'dsh-ev-actions', style: { marginTop: 8 } },
          h('input', { className: 'dsh-ev-field', style: { width: 130 }, maxLength: 30, value: lesson.family, 'aria-label': 'Kind of work for your lesson', onChange: (event) => setLesson({ ...lesson, family: event.target.value }) }),
          h('input', { className: 'dsh-ev-field', style: { flex: '1 1 220px' }, maxLength: 600, value: lesson.text, placeholder: 'Add a lesson of your own', 'aria-label': 'Your own lesson', onChange: (event) => setLesson({ ...lesson, text: event.target.value }) }),
          h(
            'button',
            {
              type: 'button', className: 'dsh-ev-btn', disabled: busy || running || !lesson.text.trim(),
              onClick: async () => {
                if (await act({ action: 'addLesson', family: lesson.family, text: lesson.text }, 'Your lesson is in use. It was not tested by the gates.')) setLesson({ ...lesson, text: '' });
              },
            },
            'Add',
          ),
        ),

        // ---- versions
        h('div', { className: 'dsh-ev-group' }, h('span', null, 'Versions')),
        h(
          'ul',
          { className: 'dsh-ev-list' },
          status.versions.slice(0, 12).map((version) =>
            h(
              'li',
              { key: version.version },
              h(
                'div',
                { className: 'dsh-ev-cardhead' },
                h('span', { className: 'dsh-ev-cardtitle' }, h('b', null, version.version), ` · ${when(version.createdAt)}${version.score ? ` · ${pct(version.score.rate)} of ${version.score.runs} runs` : ''}`),
                version.active
                  ? h('span', { className: 'dsh-ev-tag', 'data-tone': 'accent' }, 'In use')
                  : h('button', { type: 'button', className: 'dsh-ev-btn', disabled: busy || running, onClick: () => act({ action: 'activate', version: version.version }, `${version.version} is in use again.`) }, 'Use this version'),
              ),
              version.note,
            ),
          ),
        ),

        // ---- earlier proposals
        others.length > 0 ? h('div', { className: 'dsh-ev-group' }, h('span', null, 'Earlier proposals')) : null,
        others.length > 0
          ? h(
              'ul',
              { className: 'dsh-ev-list' },
              others.slice(0, 10).map((candidate) => h('li', { key: candidate.id }, h('b', null, `${OUTCOMES[candidate.outcome] ?? candidate.outcome}: `), candidate.description, candidate.note ? ` — ${candidate.note}` : '')),
            )
          : null,

        // ---- how it works
        h('div', { className: 'dsh-ev-group' }, h('span', null, 'How it works')),
        h(
          'ul',
          { className: 'dsh-ev-list' },
          h('li', null, h('b', null, 'What it can change: '), 'a short list of lessons and a few sections of standing instructions, one small edit at a time. It cannot change the model, your tasks, the checks, the gates or these settings.'),
          h('li', null, h('b', null, 'What a change must pass: '), 'it must not contain a test answer, it must raise the score on the Check tasks, it must break none of the Guard tasks that pass today, and it must not make answers much longer. Then it waits for you.'),
          h('li', null, h('b', null, 'What leaves this Mac: '), 'only what the reviewer needs from the Learn tasks. If the reviewer is a cloud model, that text goes to its provider. Conversations, Check tasks and Guard tasks are never sent.'),
          h('li', null, h('b', null, 'What it cannot do: '), 'make a small model reason like a large one on work it has never seen. Gains show on kinds of work you repeat and can check.'),
        ),

        h('div', { className: 'dsh-ev-status', role: 'status', 'aria-live': 'polite', 'data-error': String(note.error) }, note.text),
      );
    }

    return {
      inject: ['slots', 'remote', 'remote.settings', 'remote.session', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('evolve', DICT));
        const t = ctx.locale.bind('evolve');
        ctx.effect(() =>
          ctx.slots.inject('settings.section', () =>
            ctx.slots.register(
              { name: 'settings.section', id: 'evolve', order: 420, label: () => t('section.title') },
              (props) => h(EvolvePage, { ...props, appCtx: ctx }),
            ),
          ),
        );
      },
    };
  },
});
